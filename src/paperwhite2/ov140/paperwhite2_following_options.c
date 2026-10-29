#include "types.h"
#include "constants/sound.h"
#include "gfl/bg_sys.h"
#include "gfl/bmp.h"
#include "gfl/bmpwin.h"
#include "gfl/clact.h"
#include "gfl/msg.h"
#include "gfl/sound.h"
#include "gfl/str.h"
#include "paperwhite2/following_field.h"
#include "paperwhite2/following_options.h"
#include "save/config.h"
#include "system/gf_font.h"
#include "text/system/title_2.h"

// Paper White 2: the Following Pokémon's row of the options screen (config_panel.c), FOLLOWERS: ON/OFF under the five
// options, ported from Pokeweb's options.c (docs/paperwhite2/following-pokemon.md). The screen's arrays hold five
// options, so the row's windows, its values' frames and where its cursor is are kept here, and its value is Config's
// followersOff

// The rows the cursor can be on: the options, the Followers row, and the buttons. The screen's own cursor has the
// options and the buttons only, so the row and Confirm both take CURSOR_CONFIRM there
enum {
    FOLLOWERS_ROW = OPTION_COUNT,
    FOLLOWERS_ROW_CONFIRM,
    FOLLOWERS_ROW_QUIT,
};

// The row's top in the rows, and its height
#define FOLLOWERS_ROW_Y (OPTION_COUNT * 24)
#define FOLLOWERS_ROW_HEIGHT 24

// The row's windows: its name, ON and OFF
#define FOLLOWERS_WINDOW_COUNT 3
// Its values: ON (followersOff 0) and OFF (1)
#define FOLLOWERS_VALUE_COUNT 2

// The value of shownRow, shownValue and shownFocus that no row has, so that the row is drawn
#define FOLLOWERS_NOT_SHOWN 0xff

typedef struct {
    ConfigPanelScroll *scroll;
    Config *config;
    BmpWin *windows[FOLLOWERS_WINDOW_COUNT];
    ClActor *frames[FOLLOWERS_VALUE_COUNT];
    u8 active;
    // The value picked, and the value saved
    u8 staged;
    u8 original;
    // The row the cursor is on, which the screen's cursor can't say
    u8 row;
    // What the row was last drawn with
    u8 shownRow;
    u8 shownValue;
    u8 shownFocus;
    // Whether the touch screen is in use, which shows no cursor
    u8 touchMode;
    s16 frameY;
} FollowingOptions;

// The row's name and values, laid out as the options' rows
static const ConfigPanelLabel sFollowingOptionsLabels[FOLLOWERS_WINDOW_COUNT] = {
    { Title2_Text_Followers, 1, 20, 12, 2 },
    { Title2_Text_FollowersOn, 15, 20, 6, 2 },
    { Title2_Text_FollowersOff, 24, 20, 7, 2 },
};

// The palettes of the rows on the screen, from the top, as the screen's
static const u8 sFollowingOptionsRowPalettes[OPTION_COUNT] = { 3, 1, 0, 1, 3 };

// Where the values' frames are across the row, as the two-value options' are
static const s16 sFollowingOptionsFrameX[FOLLOWERS_VALUE_COUNT] = { 120, 192 };

static FollowingOptions sFollowingOptions;

static void FollowingOptions_Free(void) {
    u32 i;

    for (i = 0; i < FOLLOWERS_VALUE_COUNT; i++) {
        if (sFollowingOptions.frames[i] != NULL) {
            ClActor_Delete(sFollowingOptions.frames[i]);
            sFollowingOptions.frames[i] = NULL;
        }
    }
    for (i = 0; i < FOLLOWERS_WINDOW_COUNT; i++) {
        if (sFollowingOptions.windows[i] != NULL) {
            BmpWin_Free(sFollowingOptions.windows[i]);
            sFollowingOptions.windows[i] = NULL;
        }
    }
    sFollowingOptions.active = FALSE;
    sFollowingOptions.scroll = NULL;
    sFollowingOptions.config = NULL;
}

static void FollowingOptions_PrintWindow(BmpWin *window, Font *font, MsgData *msgData, u32 msgId) {
    StrBuf *str = GFL_MsgDataLoadStrbufNew(msgData, msgId);
    GFLBitmap *bitmap;

    if (str == NULL) {
        return;
    }
    bitmap = BmpWin_GetBitmap(window);
    GFL_BitmapFill(bitmap, 0);
    GFL_TextRendererDrawToBitmap(bitmap, 0, 0, str, font);
    BmpWin_Transfer(window);
    GFL_StrBufFree(str);
}

// Copies the fifth row's tiles under it, so that the sixth row has the same fill, bevel and border
static void FollowingOptions_ExtendRows(ConfigPanelScroll *scroll) {
    u16 *screen = GFL_BGSysIsScrHeapExists(scroll->rowsBg);
    u32 x;
    u32 y;

    if (screen == NULL) {
        return;
    }
    for (y = 0; y < 3; y++) {
        for (x = 0; x < 32; x++) {
            screen[(17 + y) * 32 + x] = screen[(14 + y) * 32 + x];
        }
    }
    GFL_BGSysQueueScrLoad(scroll->rowsBg);
}

// Gives the sixth row the palette of its place on the screen, or the cursor's, as ConfigPanelScroll_Draw does for the
// five rows
static void FollowingOptions_DrawRow(ConfigPanelScroll *scroll, BOOL focused) {
    u16 *screen = GFL_BGSysIsScrHeapExists(scroll->rowsBg);
    int place;
    int top;
    u32 palette;

    if (screen == NULL) {
        return;
    }
    place = OPTION_COUNT;
    top = GFL_BGSysGetBGOffsetY(scroll->rowsBg) + 20;
    while (top >= 24 && place > 0) {
        top -= 24;
        place--;
    }
    if (place > OPTION_COUNT - 1) {
        place = OPTION_COUNT - 1;
    }
    palette = focused ? 7 : sFollowingOptionsRowPalettes[place];
    if (screen[17 * 32] >> 12 != palette) {
        GFL_BGSysSetScrPaletteNo(scroll->rowsBg, 0, 17, 32, 3, palette);
        GFL_BGSysQueueScrLoad(scroll->rowsBg);
    }
}

// The row's texts and frames, in the colors of the options' values
static void FollowingOptions_DrawValues(ConfigPanelScroll *scroll, BOOL focused) {
    const ConfigPanelLabel *labels = sFollowingOptionsLabels;
    u32 label = focused ? 7 : 0;
    u32 selected = focused ? 7 : 0;
    u32 other = focused ? 12 : 3;
    u32 i;

    GFL_BGSysSetScrPaletteNo(scroll->textBg, labels[0].x, labels[0].y, labels[0].width, labels[0].height, label);
    GFL_BGSysSetScrPaletteNo(scroll->textBg, labels[1].x, labels[1].y, labels[1].width, labels[1].height,
                             sFollowingOptions.staged ? other : selected);
    GFL_BGSysSetScrPaletteNo(scroll->textBg, labels[2].x, labels[2].y, labels[2].width, labels[2].height,
                             sFollowingOptions.staged ? selected : other);
    for (i = 0; i < FOLLOWERS_VALUE_COUNT; i++) {
        if (sFollowingOptions.frames[i] != NULL) {
            if (focused) {
                ClActor_ChangeSequence(sFollowingOptions.frames[i], i == sFollowingOptions.staged ? 3 : 2);
            } else {
                ClActor_ChangeSequence(sFollowingOptions.frames[i], i == sFollowingOptions.staged ? 0 : 1);
            }
        }
    }
    GFL_BGSysQueueScrLoad(scroll->textBg);
}

void PaperWhite2_FollowingOptionsInit(ConfigPanelScroll *scroll, u16 textBg, u16 rowsBg, ConfigPanelGraphic *graphic,
                                      const ConfigPanelOptions *options, HeapID heapId, Font *font, MsgData *msgData) {
    ConfigPanelObj *obj = &graphic->obj;
    Config *config;
    ClActorSetup setup;
    u32 i;

    FollowingOptions_Free();
    PaperWhite2_ConfigPanelScrollInit(scroll, textBg, rowsBg, graphic, options, heapId);
    // The ROM-wide switch, which the original read from its native.bin
    if (!FOLLOWING_ENABLED) {
        return;
    }
    config = options->config;
    if (config == NULL) {
        return;
    }
    sFollowingOptions.scroll = scroll;
    sFollowingOptions.config = config;
    sFollowingOptions.original = sFollowingOptions.staged = config->followersOff;
    sFollowingOptions.row = scroll->cursor < 0 ? 0 : scroll->cursor;

    for (i = 0; i < FOLLOWERS_WINDOW_COUNT; i++) {
        const ConfigPanelLabel *label = &sFollowingOptionsLabels[i];

        sFollowingOptions.windows[i] =
            BmpWin_CreateDynamic(textBg, label->x, label->y, label->width, label->height, 0, TRUE);
        if (sFollowingOptions.windows[i] == NULL) {
            FollowingOptions_Free();
            return;
        }
        FollowingOptions_PrintWindow(sFollowingOptions.windows[i], font, msgData, label->msgId);
    }

    sFollowingOptions.frameY = FOLLOWERS_ROW_Y + scroll->y;
    for (i = 0; i < FOLLOWERS_VALUE_COUNT; i++) {
        setup.x = sFollowingOptionsFrameX[i];
        setup.y = sFollowingOptions.frameY;
        setup.sequence = 0;
        setup.priority = 2;
        setup.bgPriority = 2;
        sFollowingOptions.frames[i] =
            ClActor_Create(obj->unit, obj->chars, obj->palette, obj->cellAnims, &setup, 0, heapId);
        if (sFollowingOptions.frames[i] == NULL) {
            FollowingOptions_Free();
            return;
        }
        ClActor_SetAutoAnim(sFollowingOptions.frames[i], FALSE);
    }

    FollowingOptions_ExtendRows(scroll);
    sFollowingOptions.active = TRUE;
    sFollowingOptions.shownRow = FOLLOWERS_NOT_SHOWN;
    sFollowingOptions.shownValue = FOLLOWERS_NOT_SHOWN;
    sFollowingOptions.shownFocus = FOLLOWERS_NOT_SHOWN;
    sFollowingOptions.touchMode = scroll->cursor < 0;
    FollowingOptions_DrawRow(scroll, sFollowingOptions.row == FOLLOWERS_ROW && !sFollowingOptions.touchMode);
    FollowingOptions_DrawValues(scroll, sFollowingOptions.row == FOLLOWERS_ROW);
}

void PaperWhite2_FollowingOptionsExit(ConfigPanelScroll *scroll) {
    if (sFollowingOptions.scroll == scroll) {
        FollowingOptions_Free();
    }
    PaperWhite2_ConfigPanelScrollExit(scroll);
}

// Picks a value of the row, with the sound of the options' values
static void FollowingOptions_SetValue(u8 value) {
    if (sFollowingOptions.staged != value) {
        sFollowingOptions.staged = value;
        GFL_SndSEPlay(SEQ_SE_SELECT1);
    }
}

void PaperWhite2_FollowingOptionsMain(ConfigPanelScroll *scroll, ConfigPanelUi *ui, ConfigPanelMsg *msg,
                                      ConfigPanelGraphic *graphic, ConfigPanelAppBar *appBar) {
    u32 input;
    u32 old;
    int rowTop;
    s16 frameY;
    BOOL focused;
    u32 i;

    if (!sFollowingOptions.active || sFollowingOptions.scroll != scroll) {
        PaperWhite2_ConfigPanelScrollMain(scroll, ui, msg, graphic, appBar);
        return;
    }
    input = ui->input;
    old = sFollowingOptions.row;
    if (input == INPUT_TOUCH || input == INPUT_SLIDE || input == INPUT_2) {
        sFollowingOptions.touchMode = TRUE;
    } else if (input == INPUT_KEY_MODE || input == INPUT_UP || input == INPUT_DOWN || input == INPUT_RIGHT ||
               input == INPUT_LEFT || input == INPUT_UP_HELD || input == INPUT_DOWN_HELD) {
        sFollowingOptions.touchMode = FALSE;
    }
    // Left and right on the row pick its value, and the rows don't see them
    if (old == FOLLOWERS_ROW && (input == INPUT_LEFT || input == INPUT_RIGHT)) {
        FollowingOptions_SetValue(input == INPUT_RIGHT ? 1 : 0);
        ui->input = INPUT_NONE;
    }

    // The rows move the cursor from CURSOR_CONFIRM for the Followers row and Confirm, and from CURSOR_QUIT for Quit;
    // where it lands tells which of the two it is on
    if (old == FOLLOWERS_ROW_QUIT) {
        scroll->cursor = CURSOR_QUIT;
    } else if (old == FOLLOWERS_ROW_CONFIRM && (input == INPUT_UP || input == INPUT_UP_HELD)) {
        scroll->cursor = CURSOR_QUIT;
    } else if (old == FOLLOWERS_ROW) {
        scroll->cursor = CURSOR_CONFIRM;
    } else if (old == FOLLOWERS_ROW_CONFIRM) {
        scroll->cursor = CURSOR_CONFIRM;
    }
    PaperWhite2_ConfigPanelScrollMain(scroll, ui, msg, graphic, appBar);
    ui->input = input;

    // The frames' Y is the row's top, and the row is the 24 pixels under it
    rowTop = FOLLOWERS_ROW_Y + scroll->y;
    if (input == INPUT_TOUCH && ui->start.y >= rowTop && ui->start.y < rowTop + FOLLOWERS_ROW_HEIGHT) {
        u8 value = sFollowingOptions.staged;

        sFollowingOptions.row = FOLLOWERS_ROW;
        scroll->cursor = CURSOR_CONFIRM;
        // The values' areas, as the two-value options' are
        if (ui->start.x >= 112 && ui->start.x < 184) {
            value = 0;
        } else if (ui->start.x >= 184 && ui->start.x < 256) {
            value = 1;
        }
        FollowingOptions_SetValue(value);
    } else if (scroll->cursor >= 0 && scroll->cursor < OPTION_COUNT) {
        sFollowingOptions.row = scroll->cursor;
    } else if (scroll->cursor == CURSOR_QUIT) {
        if (old == FOLLOWERS_ROW || (old == FOLLOWERS_ROW_CONFIRM && input == INPUT_UP_HELD)) {
            sFollowingOptions.row = FOLLOWERS_ROW_CONFIRM;
        } else {
            sFollowingOptions.row = FOLLOWERS_ROW_QUIT;
        }
    } else if (scroll->cursor == CURSOR_CONFIRM) {
        if (old == FOLLOWERS_ROW_QUIT ||
            (old == FOLLOWERS_ROW_CONFIRM && input != INPUT_UP && input != INPUT_UP_HELD)) {
            sFollowingOptions.row = FOLLOWERS_ROW_CONFIRM;
        } else {
            sFollowingOptions.row = FOLLOWERS_ROW;
        }
    }
    // Down from Quit wraps to the first option
    if (old == FOLLOWERS_ROW_QUIT && input == INPUT_DOWN && scroll->cursor == 0) {
        sFollowingOptions.row = 0;
    }
    if (sFollowingOptions.row == FOLLOWERS_ROW || sFollowingOptions.row == FOLLOWERS_ROW_CONFIRM) {
        scroll->cursor = CURSOR_CONFIRM;
    } else if (sFollowingOptions.row == FOLLOWERS_ROW_QUIT) {
        scroll->cursor = CURSOR_QUIT;
    }

    frameY = FOLLOWERS_ROW_Y + scroll->y;
    if (frameY != sFollowingOptions.frameY) {
        sFollowingOptions.frameY = frameY;
        for (i = 0; i < FOLLOWERS_VALUE_COUNT; i++) {
            if (sFollowingOptions.frames[i] != NULL) {
                ClActorPos pos;

                pos.x = sFollowingOptionsFrameX[i];
                pos.y = frameY;
                ClActor_SetSurfacePos(sFollowingOptions.frames[i], &pos, 0);
            }
        }
    }

    focused = sFollowingOptions.row == FOLLOWERS_ROW && !sFollowingOptions.touchMode;
    FollowingOptions_DrawRow(scroll, focused);
    if (sFollowingOptions.shownRow != sFollowingOptions.row ||
        sFollowingOptions.shownValue != sFollowingOptions.staged || sFollowingOptions.shownFocus != focused ||
        input != INPUT_NONE) {
        FollowingOptions_DrawValues(scroll, focused);
        if (sFollowingOptions.row == FOLLOWERS_ROW &&
            (sFollowingOptions.shownRow != FOLLOWERS_ROW || input == INPUT_TOUCH)) {
            // The row's explanation, in the message window as the options' are
            GFL_BGSysSetBGEnabled(BG_MESSAGE, TRUE);
            PaperWhite2_ConfigPanelMsgPrint(msg, Title2_Text_ChooseWhetherPokemonFollow, 0, FALSE);
        }
        sFollowingOptions.shownRow = sFollowingOptions.row;
        sFollowingOptions.shownValue = sFollowingOptions.staged;
        sFollowingOptions.shownFocus = focused;
    }
}

// The cursor as the bar sees it: the Followers row is the last option
s32 PaperWhite2_FollowingOptionsGetCursor(ConfigPanelScroll *scroll) {
    if (sFollowingOptions.active && sFollowingOptions.scroll == scroll) {
        if (sFollowingOptions.row == FOLLOWERS_ROW) {
            return OPTION_COUNT - 1;
        }
        if (sFollowingOptions.row == FOLLOWERS_ROW_CONFIRM) {
            return CURSOR_CONFIRM;
        }
        if (sFollowingOptions.row == FOLLOWERS_ROW_QUIT) {
            return CURSOR_QUIT;
        }
    }
    return PaperWhite2_ConfigPanelScrollGetCursor(scroll);
}

BOOL PaperWhite2_FollowingOptionsEquals(const ConfigPanelOptions *a, const ConfigPanelOptions *b) {
    if (!PaperWhite2_ConfigPanelOptionsEquals(a, b)) {
        return FALSE;
    }
    return !sFollowingOptions.active || sFollowingOptions.original == sFollowingOptions.staged;
}

void PaperWhite2_FollowingOptionsApply(const ConfigPanelOptions *options) {
    PaperWhite2_ConfigPanelOptionsApply(options);
    if (sFollowingOptions.active && sFollowingOptions.config != NULL) {
        sFollowingOptions.config->followersOff = sFollowingOptions.staged;
        sFollowingOptions.original = sFollowingOptions.staged;
    }
}
