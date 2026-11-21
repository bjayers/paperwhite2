#include "types.h"
#include "app/monolith/monolith_tool.h"
#include "constants/sound.h"
#include "gfl/arc_util.h"
#include "gfl/bg_sys.h"
#include "gfl/bmp.h"
#include "gfl/bmpwin.h"
#include "gfl/gx_layers.h"
#include "gfl/heap.h"
#include "gfl/key.h"
#include "gfl/msg.h"
#include "gfl/proc.h"
#include "gfl/sound.h"
#include "gfl/std.h"
#include "gfl/str.h"
#include "gfl/touchpanel.h"
#include "gfl/ui.h"
#include "nitro/gx.h"
#include "paperwhite2/entralink_progress.h"
#include "paperwhite2/entralink_records_config.h"
#include "paperwhite2/entree_menu.h"
#include "system/printsys.h"
#include "system/wordset.h"
#include "text/system/btl_main_title.h"

// Paper White 2: the Entree's menu (include/paperwhite2/entree_menu.h): the Status screen on top, the menu, and the
// pages of rows (the Status's milestones, the Records) on the bottom screen. The screens follow the monolith's own
// (src/ov143/monolith_status.c, monolith_top.c and monolith_record.c), with their backgrounds and actors

// ---- Shared ---------------------------------------------------------------------------------------------------------

// The text's longest line, and a number's most digits
#define TEXT_LENGTH 128
#define NUMBER_DIGITS 6

// A message of the monolith's bank, with the monolith's words in it, into dest
static void Entree_Format(MonolithWork *wk, u32 msgId, StrBuf *dest) {
    StrBuf *raw = GFL_MsgDataLoadStrbufNew(wk->msgMonolith, msgId);

    GFL_WordSetFormatStrbuf(wk->wordSet, dest, raw);
    GFL_StrBufFree(raw);
}

static void Entree_SetNumber(MonolithWork *wk, u32 word, u32 number) {
    WordSetNumber(wk->wordSet, word, number, NUMBER_DIGITS, 0, TRUE);
}

// A new string of a message with the words in it
static StrBuf *Entree_FormatNew(MonolithWork *wk, u32 msgId) {
    StrBuf *str = GFL_StrBufCreate(TEXT_LENGTH, HEAPID_MONOLITH);

    Entree_Format(wk, msgId, str);
    return str;
}

// Prints a message into a window at a place
static void Entree_Print(MonolithWork *wk, PrintWindow *print, u32 msgId, u16 x, u16 y) {
    StrBuf *str = Entree_FormatNew(wk, msgId);

    PrintWindow_PrintNoColor(print, wk->printQueue, x, y, str, wk->font);
    GFL_StrBufFree(str);
}

// Creates a window of the text BG and its print, as the monolith's screens make theirs
static BmpWin *Entree_CreateWindow(u32 bg, u8 x, u8 y, u8 width, u8 height, PrintWindow *print) {
    BmpWin *window = BmpWin_CreateDynamic(bg, x, y, width, height, 13, TRUE);

    BmpWin_FlushChar(window);
    BmpWin_FlushMap(window);
    PrintWindow_Init(print, window);
    return window;
}

static void Entree_ClearWindow(BmpWin *window) {
    GFL_BitmapFill(BmpWin_GetBitmap(window), 0);
    BmpWin_FlushChar(window);
}

// Flushes the prints; returns whether all of them are printed
static BOOL Entree_FlushPrints(MonolithWork *wk, PrintWindow *prints, u32 count) {
    BOOL printed = TRUE;
    u32 i;

    for (i = 0; i < count; i++) {
        PrintWindow_Flush(&prints[i], wk->printQueue);
        if (PrintWindow_IsPrinted(&prints[i]) == FALSE) {
            printed = FALSE;
        }
    }
    return printed;
}

// ---- The Status screen, on top --------------------------------------------------------------------------------------

// The BGs of the text and of the background, and the background's file (the monolith's own status screen's)
#define STATUS_BG_TEXT 0
#define STATUS_BG 2
#define STATUS_SCREEN_FILE 12

// The title, the White Tree's rank and progress, and the Black Tree's
enum {
    STATUS_WINDOW_TITLE,
    STATUS_WINDOW_WHITE,
    STATUS_WINDOW_WHITE_PROGRESS,
    STATUS_WINDOW_BLACK,
    STATUS_WINDOW_BLACK_PROGRESS,
    STATUS_WINDOW_COUNT,
};

// The bar of the White rank against the Black: its row of the background, its width in pixels and tiles, and the
// characters of a tile of the Black part (STATUS_BAR_FULL) to an empty one, palette 1 (monolith_tool.c's)
#define STATUS_BAR_ROW 20
#define STATUS_BAR_WIDTH 240
#define STATUS_BAR_TILES 30
#define STATUS_BAR_FULL 1
#define STATUS_BAR_EMPTY 9
#define STATUS_BAR_PALETTE (1 << 12)

typedef struct {
    BmpWin *windows[STATUS_WINDOW_COUNT];
    PrintWindow prints[STATUS_WINDOW_COUNT];
} EntreeStatusWork;

static const BGSetup sStatusBGSetups[2] = {
    { 0, 0, 0x800, 0, BGRES_256x256, GX_BG_COLORMODE_16, GX_BG_SCRBASE(0x1000), GX_BG_CHARBASE(0x0c000), 0x8000,
      GX_BG_EXTPLTT_01, 2, GX_BG_AREAOVER_XLU, FALSE },
    { 0, 0, 0x800, 0, BGRES_256x256, GX_BG_COLORMODE_16, GX_BG_SCRBASE(0x2000), GX_BG_CHARBASE(0x04000), 0x8000,
      GX_BG_EXTPLTT_01, 3, GX_BG_AREAOVER_XLU, FALSE },
};

// The bar, as MonolithTool_DrawLevelBar draws the pass powers' levels: the Black part from the left, an even bar at
// equal ranks
static void EntreeStatus_DrawBar(u32 white, u32 black) {
    u16 screen[STATUS_BAR_TILES];
    int blackWidth;
    int i;

    if (white == black) {
        blackWidth = STATUS_BAR_WIDTH / 2;
    } else {
        blackWidth = STATUS_BAR_WIDTH * black / (white + black);
    }
    for (i = 0; i < STATUS_BAR_TILES; i++) {
        if (blackWidth >= 8) {
            screen[i] = STATUS_BAR_FULL | STATUS_BAR_PALETTE;
            blackWidth -= 8;
        } else {
            screen[i] = (STATUS_BAR_EMPTY - blackWidth) | STATUS_BAR_PALETTE;
            blackWidth = 0;
        }
    }
    GFL_BGSysLoadScrAreaAll(STATUS_BG, screen, 1, STATUS_BAR_ROW, STATUS_BAR_TILES, 1);
}

static void EntreeStatus_Draw(MonolithScreenParam *screen, MonolithWork *wk, EntreeStatusWork *sw) {
    EntralinkProgress *progress = Entree_GetProgress(screen);
    u32 white = Entree_GetWhiteRank(progress);
    u32 black = Entree_GetBlackRank(progress);
    u32 next = Entree_GetNextBlackRank(progress);

    Entree_Print(wk, &sw->prints[STATUS_WINDOW_TITLE], BtlMainTitle_Text_Entree, 0, 4);
    Entree_SetNumber(wk, 0, white);
    Entree_SetNumber(wk, 1, Entree_GetWhiteRankMax());
    Entree_Print(wk, &sw->prints[STATUS_WINDOW_WHITE], BtlMainTitle_Text_EntreeWhiteRank, 0, 0);
    Entree_Print(wk, &sw->prints[STATUS_WINDOW_WHITE_PROGRESS], BtlMainTitle_Text_EntreeWhiteProgress, 8, 0);
    Entree_SetNumber(wk, 0, black);
    Entree_SetNumber(wk, 1, Entree_GetBlackRankMax());
    Entree_Print(wk, &sw->prints[STATUS_WINDOW_BLACK], BtlMainTitle_Text_EntreeBlackRank, 0, 0);
    Entree_SetNumber(wk, 0, progress->records.shardsEarned);
    Entree_SetNumber(wk, 1, next);
    Entree_Print(wk, &sw->prints[STATUS_WINDOW_BLACK_PROGRESS],
                 next != 0 ? BtlMainTitle_Text_EntreeBlackProgress : BtlMainTitle_Text_EntreeBlackHighest, 8, 0);
    EntreeStatus_DrawBar(white, black);
}

static BOOL EntreeStatus_Init(GameProc *proc, u32 *state, void *param, void *work) {
    MonolithScreenParam *screen = param;
    EntreeStatusWork *sw;

    switch (*state) {
    case 0:
        sw = GFL_ProcInitSubsystem(proc, sizeof(EntreeStatusWork), HEAPID_MONOLITH);
        MI_CpuFill8(sw, 0, sizeof(EntreeStatusWork));
        GFL_BGSysCreateBG(STATUS_BG_TEXT, &sStatusBGSetups[0], BGMODE_TEXT);
        GFL_BGSysCreateBG(STATUS_BG, &sStatusBGSetups[1], BGMODE_TEXT);
        GFL_BGSysFillScrArea(STATUS_BG_TEXT, 0, 0, 0, 32, 32, 17);
        GFL_BGSysFillScrArea(STATUS_BG, 0, 0, 0, 32, 32, 17);
        loadBGScrToVramByFileNoReserveNegAlign(screen->work->arc, STATUS_SCREEN_FILE, STATUS_BG, 0, 0, TRUE,
                                               HEAPID_MONOLITH);
        sw->windows[STATUS_WINDOW_TITLE] =
            Entree_CreateWindow(STATUS_BG_TEXT, 2, 0, 30, 3, &sw->prints[STATUS_WINDOW_TITLE]);
        sw->windows[STATUS_WINDOW_WHITE] =
            Entree_CreateWindow(STATUS_BG_TEXT, 2, 8, 30, 2, &sw->prints[STATUS_WINDOW_WHITE]);
        sw->windows[STATUS_WINDOW_WHITE_PROGRESS] =
            Entree_CreateWindow(STATUS_BG_TEXT, 2, 10, 30, 2, &sw->prints[STATUS_WINDOW_WHITE_PROGRESS]);
        sw->windows[STATUS_WINDOW_BLACK] =
            Entree_CreateWindow(STATUS_BG_TEXT, 2, 12, 30, 2, &sw->prints[STATUS_WINDOW_BLACK]);
        sw->windows[STATUS_WINDOW_BLACK_PROGRESS] =
            Entree_CreateWindow(STATUS_BG_TEXT, 2, 14, 30, 2, &sw->prints[STATUS_WINDOW_BLACK_PROGRESS]);
        EntreeStatus_Draw(screen, screen->work, sw);
        GFL_BGSysLoadScr(STATUS_BG);
        GFL_BGSysLoadScr(STATUS_BG_TEXT);
        (*state)++;
        break;
    case 1:
        sw = work;
        if (Entree_FlushPrints(screen->work, sw->prints, STATUS_WINDOW_COUNT)) {
            GFL_BGSysSetBGEnabled(STATUS_BG_TEXT, TRUE);
            GFL_BGSysSetBGEnabled(STATUS_BG, TRUE);
            GFL_BGSysSetBGEnabledA(GX_PLANEMASK_OBJ, TRUE);
            return TRUE;
        }
        break;
    }
    return FALSE;
}

static BOOL EntreeStatus_Main(GameProc *proc, u32 *state, void *param, void *work) {
    MonolithScreenParam *screen = param;
    EntreeStatusWork *sw = work;

    Entree_FlushPrints(screen->work, sw->prints, STATUS_WINDOW_COUNT);
    return screen->exiting == TRUE || screen->endTop == TRUE;
}

static BOOL EntreeStatus_Exit(GameProc *proc, u32 *state, void *param, void *work) {
    MonolithScreenParam *screen = param;
    EntreeStatusWork *sw = work;
    int i;

    if (PrintQueue_IsEmpty(screen->work->printQueue) == FALSE) {
        return FALSE;
    }
    GFL_BGSysSetEnabledBGsA(GX_PLANEMASK_BG3);
    for (i = 0; i < STATUS_WINDOW_COUNT; i++) {
        BmpWin_Free(sw->windows[i]);
    }
    GFL_BGSysSetBGEnabled(STATUS_BG_TEXT, FALSE);
    GFL_BGSysSetBGEnabled(STATUS_BG, FALSE);
    GFL_BGSysReleaseBG(STATUS_BG_TEXT);
    GFL_BGSysReleaseBG(STATUS_BG);
    GFL_ProcReleaseSubsystem(proc);
    return TRUE;
}

const GameProcFunctions ENTREE_STATUS_PROC_FUNCTIONS = { EntreeStatus_Init, EntreeStatus_Main, EntreeStatus_Exit };

// ---- The menu, on the bottom screen ---------------------------------------------------------------------------------

// The panel whose palette marks the cursor's item, and the return button's place after the items
#define MENU_PANEL 3
#define MENU_RETURN ENTREE_ITEM_COUNT

// The items' rows: two columns, and Exit alone in the last row's middle
#define MENU_COLUMNS 2
#define MENU_LAST_ROW_FIRST ENTREE_ITEM_EXIT

// The color of the items' text (monolith_top.c's for an item that can be picked)
#define MENU_TEXT_COLOR 0x3c40

enum {
    MENU_SEQ_INPUT,
    MENU_SEQ_PICKED,
    MENU_SEQ_WAIT,
};

typedef struct {
    MonolithTextActor texts[ENTREE_ITEM_COUNT];
    MonolithReturnButton returnButton;
    s8 cursor;
    // The item picked, or MENU_RETURN
    s8 picked;
    // Set while the player uses the touch screen, so that the next key press only shows the cursor
    u8 touching;
} EntreeMenuWork;

// An item: its frame's center and its text
typedef struct {
    s16 x;
    s16 y;
    u16 msgId;
} EntreeMenuItem;

static const EntreeMenuItem sMenuItems[ENTREE_ITEM_COUNT] = {
    { 66, 28, BtlMainTitle_Text_EntreeStatus },     { 190, 28, BtlMainTitle_Text_EntreeRecords },
    { 66, 60, BtlMainTitle_Text_EntreeNightmares }, { 190, 60, BtlMainTitle_Text_EntreeBosses },
    { 66, 92, BtlMainTitle_Text_EntreeSpecial },    { 190, 92, BtlMainTitle_Text_EntreeCatchable },
    { 66, 124, BtlMainTitle_Text_EntreeBuffs },     { 190, 124, BtlMainTitle_Text_EntreeHallOfFame },
    { 128, 156, BtlMainTitle_Text_EntreeExit },
};

// The items' frames (a narrow frame is 112 pixels wide, 16 high), then the return button
static const TouchRect sMenuTouchRects[] = {
    { 20, 36, 10, 122 },   { 20, 36, 134, 246 },   { 52, 68, 10, 122 },         { 52, 68, 134, 246 },
    { 84, 100, 10, 122 },  { 84, 100, 134, 246 },  { 116, 132, 10, 122 },       { 116, 132, 134, 246 },
    { 148, 164, 72, 184 }, { 172, 188, 232, 248 }, { TOUCH_RECT_END, 0, 0, 0 },
};

// The screen each item leads to
static u32 EntreeMenu_GetScreen(u32 item) {
    switch (item) {
    case ENTREE_ITEM_STATUS:
    case ENTREE_ITEM_RECORDS:
        return ENTREE_SCREEN_PAGES;
    case ENTREE_ITEM_EXIT:
    case MENU_RETURN:
        return MONOLITH_SCREEN_EXIT;
    }
    return ENTREE_SCREEN_LIST;
}

static void EntreeMenu_ShowCursor(MonolithScreenParam *screen, EntreeMenuWork *mw) {
    MonolithTool_SetTextCursor(screen, mw->texts, ENTREE_ITEM_COUNT, mw->cursor, MENU_PANEL);
    GFL_SndSEPlay(SEQ_SE_SELECT1);
}

// The cursor's item after a key: up and down by rows (into and out of Exit's row), left and right within a row
static s8 EntreeMenu_Move(s8 cursor, u32 typed) {
    if (typed & PAD_KEY_DOWN) {
        if (cursor == ENTREE_ITEM_EXIT) {
            return 0;
        }
        cursor += MENU_COLUMNS;
        return cursor > MENU_LAST_ROW_FIRST ? MENU_LAST_ROW_FIRST : cursor;
    }
    if (typed & PAD_KEY_UP) {
        if (cursor == ENTREE_ITEM_EXIT) {
            return MENU_LAST_ROW_FIRST - MENU_COLUMNS;
        }
        return cursor < MENU_COLUMNS ? ENTREE_ITEM_EXIT : cursor - MENU_COLUMNS;
    }
    if ((typed & (PAD_KEY_LEFT | PAD_KEY_RIGHT)) && cursor != ENTREE_ITEM_EXIT) {
        return cursor ^ 1;
    }
    return cursor;
}

// Returns whether an item or the return button was picked
static BOOL EntreeMenu_Input(MonolithScreenParam *screen, EntreeMenuWork *mw) {
    int hit = GFL_HIDGetTouchPressedRect(sMenuTouchRects);
    u32 typed;
    u32 pressed;
    s8 cursor;

    if (hit != TOUCH_RECT_NONE) {
        GCTX_HIDSetUsingTouch(TRUE);
        mw->touching = FALSE;
        if (hit != MENU_RETURN) {
            mw->cursor = hit;
        }
        mw->picked = hit;
        return TRUE;
    }
    typed = GCTX_HIDGetTypedKeys();
    pressed = GCTX_HIDGetPressedKeys();
    if (pressed != 0 && mw->touching == TRUE) {
        GCTX_HIDSetUsingTouch(FALSE);
        mw->touching = FALSE;
        EntreeMenu_ShowCursor(screen, mw);
    } else if (pressed & PAD_BUTTON_A) {
        mw->picked = mw->cursor;
        return TRUE;
    } else if (pressed & PAD_BUTTON_B) {
        mw->picked = MENU_RETURN;
        return TRUE;
    } else {
        cursor = EntreeMenu_Move(mw->cursor, typed);
        if (cursor != mw->cursor) {
            mw->cursor = cursor;
            EntreeMenu_ShowCursor(screen, mw);
        }
    }
    return FALSE;
}

static BOOL EntreeMenu_Init(GameProc *proc, u32 *state, void *param, void *work) {
    MonolithScreenParam *screen = param;
    EntreeMenuWork *mw = GFL_ProcInitSubsystem(proc, sizeof(EntreeMenuWork), HEAPID_MONOLITH);
    int i;

    MI_CpuFill8(mw, 0, sizeof(EntreeMenuWork));
    mw->cursor = screen->state->menuCursor;
    if (mw->cursor < 0 || mw->cursor >= ENTREE_ITEM_COUNT) {
        mw->cursor = ENTREE_ITEM_STATUS;
    }
    MonolithTool_InitPanels(screen);
    for (i = 0; i < ENTREE_ITEM_COUNT; i++) {
        MonolithTool_CreateTextCentered(screen->work, &mw->texts[i], 1, MONOLITH_TEXT_NARROW, sMenuItems[i].x,
                                        sMenuItems[i].y, sMenuItems[i].msgId, NULL, MENU_TEXT_COLOR);
    }
    if (GCTX_HIDIsUsingTouch() == FALSE) {
        MonolithTool_SetTextCursor(screen, mw->texts, ENTREE_ITEM_COUNT, mw->cursor, MENU_PANEL);
    } else {
        mw->touching = TRUE;
    }
    MonolithTool_CreateReturnButton(screen->work, &mw->returnButton);
    GFL_BGSysSetBGEnabledB(GX_PLANEMASK_OBJ, TRUE);
    return TRUE;
}

static BOOL EntreeMenu_Main(GameProc *proc, u32 *state, void *param, void *work) {
    MonolithScreenParam *screen = param;
    EntreeMenuWork *mw = work;
    int i;

    MonolithTool_UpdatePanel(screen, MENU_PANEL);
    for (i = 0; i < ENTREE_ITEM_COUNT; i++) {
        MonolithTool_UpdateText(screen->work, &mw->texts[i]);
    }
    MonolithTool_UpdateReturnButton(&mw->returnButton);
    if (screen->exiting == TRUE) {
        return TRUE;
    }
    switch (*state) {
    case MENU_SEQ_INPUT:
        if (EntreeMenu_Input(screen, mw) == TRUE) {
            (*state)++;
        }
        break;
    case MENU_SEQ_PICKED:
        if (mw->picked != MENU_RETURN) {
            MonolithTool_SetTextPicked(screen, mw->texts, ENTREE_ITEM_COUNT, mw->cursor, MENU_PANEL);
            GFL_SndSEPlay(mw->picked == ENTREE_ITEM_EXIT ? SEQ_SE_CANCEL1 : SEQ_SE_DECIDE1);
        } else {
            MonolithTool_PressReturnButton(&mw->returnButton);
            GFL_SndSEPlay(SEQ_SE_CANCEL1);
        }
        (*state)++;
        break;
    case MENU_SEQ_WAIT:
        if (mw->picked != MENU_RETURN ? MonolithTool_GetPanelMode(screen, MENU_PANEL) != PANEL_MODE_FLASH
                                      : MonolithTool_IsReturnButtonBlinking(&mw->returnButton) == FALSE) {
            screen->state->menuCursor = mw->cursor;
            screen->next = EntreeMenu_GetScreen(mw->picked);
            return TRUE;
        }
        break;
    }
    return FALSE;
}

static BOOL EntreeMenu_Exit(GameProc *proc, u32 *state, void *param, void *work) {
    MonolithScreenParam *screen = param;
    EntreeMenuWork *mw = work;
    int i;

    if (PrintQueue_IsEmpty(screen->work->printQueue) == FALSE) {
        return FALSE;
    }
    GFL_BGSysSetEnabledBGsB(GX_PLANEMASK_BG3);
    for (i = 0; i < ENTREE_ITEM_COUNT; i++) {
        MonolithTool_DeleteText(&mw->texts[i]);
    }
    MonolithTool_DeleteReturnButton(&mw->returnButton);
    GFL_ProcReleaseSubsystem(proc);
    return TRUE;
}

const GameProcFunctions ENTREE_MENU_PROC_FUNCTIONS = { EntreeMenu_Init, EntreeMenu_Main, EntreeMenu_Exit };

// ---- The pages of rows, on the bottom screen ------------------------------------------------------------------------

// The BGs of the text and of the background, and the background's file (the monolith's records screen's)
#define PAGES_BG_TEXT 4
#define PAGES_BG 6
#define PAGES_SCREEN_FILE 5

// The title, the rows and the page number
enum {
    PAGES_WINDOW_TITLE,
    PAGES_WINDOW_ROWS,
    PAGES_WINDOW_PAGE,
    PAGES_WINDOW_COUNT,
};

// The rows a page shows (16 pixels each), the most rows, where the values end and how far a row's label is indented
#define PAGES_ROWS 8
#define PAGES_ROWS_MAX 16
#define PAGES_ROW_HEIGHT 16
#define PAGES_VALUE_RIGHT 232
#define PAGES_INDENT 8

enum {
    PAGES_SEQ_INPUT,
    PAGES_SEQ_RETURN,
};

// A row: its label and value (NULL: none), and whether the label is indented
typedef struct {
    StrBuf *label;
    StrBuf *value;
    BOOL indent;
} EntreePageRow;

typedef struct {
    BmpWin *windows[PAGES_WINDOW_COUNT];
    PrintWindow prints[PAGES_WINDOW_COUNT];
    MonolithReturnButton returnButton;
    EntreePageRow rows[PAGES_ROWS_MAX];
    u32 rowCount;
    u32 page;
} EntreePagesWork;

static const TouchRect sPagesTouchRects[] = {
    { 172, 188, 232, 248 },
    { TOUCH_RECT_END, 0, 0, 0 },
};

static const BGSetup sPagesBGSetups[2] = {
    { 0, 0, 0x800, 0, BGRES_256x256, GX_BG_COLORMODE_16, GX_BG_SCRBASE(0x1000), GX_BG_CHARBASE(0x0c000), 0x8000,
      GX_BG_EXTPLTT_01, 2, GX_BG_AREAOVER_XLU, FALSE },
    { 0, 0, 0x800, 0, BGRES_256x256, GX_BG_COLORMODE_16, GX_BG_SCRBASE(0x2000), GX_BG_CHARBASE(0x04000), 0x8000,
      GX_BG_EXTPLTT_01, 3, GX_BG_AREAOVER_XLU, FALSE },
};

// The White Tree's milestones' labels, by ENTREE_MILESTONE_*
static const u16 sMilestoneMsgs[ENTREE_MILESTONE_COUNT] = {
    BtlMainTitle_Text_EntreeMilestoneBeatFinal, BtlMainTitle_Text_EntreeMilestoneCatchAll,
    BtlMainTitle_Text_EntreeMilestoneFillCodex, BtlMainTitle_Text_EntreeMilestoneShopCap,
    BtlMainTitle_Text_EntreeMilestoneAllRooms,
};

// Adds a row of a label message and a value message (or none, ENTREE_NO_VALUE) with the words set
#define ENTREE_NO_VALUE 0xffff

static void EntreePages_AddRow(MonolithWork *wk, EntreePagesWork *pw, u32 labelMsg, u32 valueMsg) {
    EntreePageRow *row;

    if (pw->rowCount >= PAGES_ROWS_MAX) {
        return;
    }
    row = &pw->rows[pw->rowCount++];
    row->value = valueMsg != ENTREE_NO_VALUE ? Entree_FormatNew(wk, valueMsg) : NULL;
    row->label = Entree_FormatNew(wk, labelMsg);
    row->indent = FALSE;
}

static void EntreePages_AddNumberRow(MonolithWork *wk, EntreePagesWork *pw, u32 labelMsg, u32 number) {
    Entree_SetNumber(wk, 0, number);
    EntreePages_AddRow(wk, pw, labelMsg, BtlMainTitle_Text_EntreeNumber);
}

// A number that 0 means none of: shown as "-"
static void EntreePages_AddNumberOrNoneRow(MonolithWork *wk, EntreePagesWork *pw, u32 labelMsg, u32 number) {
    if (number == 0) {
        EntreePages_AddRow(wk, pw, labelMsg, BtlMainTitle_Text_EntreeNotDone);
    } else {
        EntreePages_AddNumberRow(wk, pw, labelMsg, number);
    }
}

static void EntreePages_AddCountRow(MonolithWork *wk, EntreePagesWork *pw, u32 labelMsg, u32 count, u32 total) {
    Entree_SetNumber(wk, 0, count);
    Entree_SetNumber(wk, 1, total);
    EntreePages_AddRow(wk, pw, labelMsg, BtlMainTitle_Text_EntreeCount);
}

// The Status's rows: the White Tree's milestones that count, done or not, then the Black Tree's Shards
static void EntreePages_AddStatusRows(MonolithScreenParam *screen, MonolithWork *wk, EntreePagesWork *pw) {
    EntralinkProgress *progress = Entree_GetProgress(screen);
    u32 reached = Entree_GetMilestones(progress);
    u32 next = Entree_GetNextBlackRank(progress);
    u32 i;

    EntreePages_AddRow(wk, pw, BtlMainTitle_Text_EntreeWhiteHeading, ENTREE_NO_VALUE);
    for (i = 0; i < ENTREE_MILESTONE_COUNT; i++) {
        if (ENTRALINK_RECORDS_WHITE_MILESTONES & (1 << i)) {
            EntreePages_AddRow(wk, pw, sMilestoneMsgs[i],
                               (reached & (1 << i)) ? BtlMainTitle_Text_EntreeDone : BtlMainTitle_Text_EntreeNotDone);
            pw->rows[pw->rowCount - 1].indent = TRUE;
        }
    }
    EntreePages_AddNumberRow(wk, pw, BtlMainTitle_Text_EntreeShardsEarned, progress->records.shardsEarned);
    if (next != 0) {
        EntreePages_AddNumberRow(wk, pw, BtlMainTitle_Text_EntreeNextRank, next);
    } else {
        EntreePages_AddRow(wk, pw, BtlMainTitle_Text_EntreeNextRank, BtlMainTitle_Text_EntreeHighest);
    }
}

// The Records' rows
static void EntreePages_AddRecordRows(MonolithScreenParam *screen, MonolithWork *wk, EntreePagesWork *pw) {
    EntralinkProgress *progress = Entree_GetProgress(screen);
    const EntralinkRecords *records = &progress->records;
    u32 rooms = Entree_GetRoomCount();

    if (records->deepestPlace != 0) {
        Entree_SetNumber(wk, 0, records->deepestRound);
        Entree_SetNumber(wk, 1, records->deepestPlace);
        EntreePages_AddRow(wk, pw, BtlMainTitle_Text_EntreeDeepest, BtlMainTitle_Text_EntreeDeepestValue);
    } else {
        EntreePages_AddRow(wk, pw, BtlMainTitle_Text_EntreeDeepest, BtlMainTitle_Text_EntreeNotDone);
    }
    EntreePages_AddNumberRow(wk, pw, BtlMainTitle_Text_EntreeRunsStarted, records->runsStarted);
    EntreePages_AddNumberRow(wk, pw, BtlMainTitle_Text_EntreeWins, progress->runsCompleted);
    EntreePages_AddNumberRow(wk, pw, BtlMainTitle_Text_EntreeStreak, records->winStreak);
    EntreePages_AddNumberRow(wk, pw, BtlMainTitle_Text_EntreeBestStreak, records->bestWinStreak);
    EntreePages_AddNumberRow(wk, pw, BtlMainTitle_Text_EntreeShardsEarned, records->shardsEarned);
    EntreePages_AddNumberOrNoneRow(wk, pw, BtlMainTitle_Text_EntreeBestHit, records->bestHit.damage);
    if (records->bestHit.damage != 0) {
        WordSet_LoadSpeciesName(wk->wordSet, 0, records->bestHit.species);
        loadMoveNameToStrbuf(wk->wordSet, 1, records->bestHit.move);
        EntreePages_AddRow(wk, pw, BtlMainTitle_Text_EntreeBestHitBy, ENTREE_NO_VALUE);
        pw->rows[pw->rowCount - 1].indent = TRUE;
    }
    EntreePages_AddNumberOrNoneRow(wk, pw, BtlMainTitle_Text_EntreeBestTurns, records->bestWinTurns);
    EntreePages_AddCountRow(wk, pw, BtlMainTitle_Text_EntreeRoomsFound, Entree_CountRooms(records->roomsDiscovered),
                            rooms);
    EntreePages_AddCountRow(wk, pw, BtlMainTitle_Text_EntreeRoomsBeaten, Entree_CountRooms(records->roomsBeaten),
                            rooms);
}

static u32 EntreePages_GetPageCount(EntreePagesWork *pw) {
    return pw->rowCount == 0 ? 1 : (pw->rowCount + PAGES_ROWS - 1) / PAGES_ROWS;
}

static void EntreePages_DrawPage(MonolithWork *wk, EntreePagesWork *pw) {
    PrintWindow *print = &pw->prints[PAGES_WINDOW_ROWS];
    EntreePageRow *row;
    u32 y;
    u32 i;

    Entree_ClearWindow(pw->windows[PAGES_WINDOW_ROWS]);
    Entree_ClearWindow(pw->windows[PAGES_WINDOW_PAGE]);
    for (i = pw->page * PAGES_ROWS; i < pw->rowCount && i < (pw->page + 1) * PAGES_ROWS; i++) {
        row = &pw->rows[i];
        y = (i % PAGES_ROWS) * PAGES_ROW_HEIGHT;
        PrintWindow_PrintNoColor(print, wk->printQueue, row->indent ? PAGES_INDENT : 0, y, row->label, wk->font);
        if (row->value != NULL) {
            PrintWindow_PrintNoColor(print, wk->printQueue,
                                     PAGES_VALUE_RIGHT - GFL_FontGetBlockWidth(row->value, wk->font, 0), y, row->value,
                                     wk->font);
        }
    }
    if (EntreePages_GetPageCount(pw) > 1) {
        Entree_SetNumber(wk, 0, pw->page + 1);
        Entree_SetNumber(wk, 1, EntreePages_GetPageCount(pw));
        Entree_Print(wk, &pw->prints[PAGES_WINDOW_PAGE], BtlMainTitle_Text_EntreePage, 0, 0);
    }
}

static BOOL EntreePages_Init(GameProc *proc, u32 *state, void *param, void *work) {
    MonolithScreenParam *screen = param;
    MonolithWork *wk = screen->work;
    EntreePagesWork *pw;
    BOOL status;

    switch (*state) {
    case 0:
        pw = GFL_ProcInitSubsystem(proc, sizeof(EntreePagesWork), HEAPID_MONOLITH);
        MI_CpuFill8(pw, 0, sizeof(EntreePagesWork));
        status = screen->state->menuCursor == ENTREE_ITEM_STATUS;
        GFL_BGSysCreateBG(PAGES_BG_TEXT, &sPagesBGSetups[0], BGMODE_TEXT);
        GFL_BGSysCreateBG(PAGES_BG, &sPagesBGSetups[1], BGMODE_TEXT);
        GFL_BGSysFillScrArea(PAGES_BG_TEXT, 0, 0, 0, 32, 32, 17);
        GFL_BGSysFillScrArea(PAGES_BG, 0, 0, 0, 32, 32, 17);
        loadBGScrToVramByFileNoReserveNegAlign(wk->arc, PAGES_SCREEN_FILE, PAGES_BG, 0, 0, TRUE, HEAPID_MONOLITH);
        pw->windows[PAGES_WINDOW_TITLE] =
            Entree_CreateWindow(PAGES_BG_TEXT, 2, 0, 30, 3, &pw->prints[PAGES_WINDOW_TITLE]);
        pw->windows[PAGES_WINDOW_ROWS] =
            Entree_CreateWindow(PAGES_BG_TEXT, 1, 4, 30, PAGES_ROWS * 2, &pw->prints[PAGES_WINDOW_ROWS]);
        pw->windows[PAGES_WINDOW_PAGE] =
            Entree_CreateWindow(PAGES_BG_TEXT, 13, 20, 6, 2, &pw->prints[PAGES_WINDOW_PAGE]);
        Entree_Print(wk, &pw->prints[PAGES_WINDOW_TITLE],
                     status ? BtlMainTitle_Text_EntreeStatus : BtlMainTitle_Text_EntreeRecords, 0, 4);
        if (status) {
            EntreePages_AddStatusRows(screen, wk, pw);
        } else {
            EntreePages_AddRecordRows(screen, wk, pw);
        }
        EntreePages_DrawPage(wk, pw);
        MonolithTool_CreateReturnButton(wk, &pw->returnButton);
        GFL_BGSysLoadScr(PAGES_BG);
        GFL_BGSysLoadScr(PAGES_BG_TEXT);
        (*state)++;
        break;
    case 1:
        pw = work;
        if (Entree_FlushPrints(wk, pw->prints, PAGES_WINDOW_COUNT)) {
            GFL_BGSysSetBGEnabled(PAGES_BG_TEXT, TRUE);
            GFL_BGSysSetBGEnabled(PAGES_BG, TRUE);
            GFL_BGSysSetBGEnabledB(GX_PLANEMASK_OBJ, TRUE);
            return TRUE;
        }
        break;
    }
    return FALSE;
}

static BOOL EntreePages_Main(GameProc *proc, u32 *state, void *param, void *work) {
    MonolithScreenParam *screen = param;
    EntreePagesWork *pw = work;
    u32 pressed;
    u32 typed;
    u32 pages;

    if (screen->exiting == TRUE) {
        return TRUE;
    }
    Entree_FlushPrints(screen->work, pw->prints, PAGES_WINDOW_COUNT);
    MonolithTool_UpdateReturnButton(&pw->returnButton);
    switch (*state) {
    case PAGES_SEQ_INPUT:
        pressed = GCTX_HIDGetPressedKeys();
        typed = GCTX_HIDGetTypedKeys();
        pages = EntreePages_GetPageCount(pw);
        if (GFL_HIDGetTouchPressedRect(sPagesTouchRects) != TOUCH_RECT_NONE || (pressed & PAD_BUTTON_B)) {
            MonolithTool_PressReturnButton(&pw->returnButton);
            GCTX_HIDSetUsingTouch((pressed & PAD_BUTTON_B) == 0);
            GFL_SndSEPlay(SEQ_SE_CANCEL1);
            (*state)++;
        } else if (pages > 1 && (typed & (PAD_KEY_LEFT | PAD_KEY_RIGHT | PAD_BUTTON_L | PAD_BUTTON_R))) {
            if (typed & (PAD_KEY_RIGHT | PAD_BUTTON_R)) {
                pw->page = (pw->page + 1) % pages;
            } else {
                pw->page = (pw->page + pages - 1) % pages;
            }
            EntreePages_DrawPage(screen->work, pw);
            GFL_SndSEPlay(SEQ_SE_SELECT1);
        }
        break;
    case PAGES_SEQ_RETURN:
        if (MonolithTool_IsReturnButtonBlinking(&pw->returnButton) == FALSE) {
            screen->next = ENTREE_SCREEN_MENU;
            return TRUE;
        }
        break;
    }
    return FALSE;
}

static BOOL EntreePages_Exit(GameProc *proc, u32 *state, void *param, void *work) {
    MonolithScreenParam *screen = param;
    EntreePagesWork *pw = work;
    u32 i;

    if (PrintQueue_IsEmpty(screen->work->printQueue) == FALSE) {
        return FALSE;
    }
    GFL_BGSysSetEnabledBGsB(GX_PLANEMASK_BG3);
    MonolithTool_DeleteReturnButton(&pw->returnButton);
    for (i = 0; i < pw->rowCount; i++) {
        GFL_StrBufFree(pw->rows[i].label);
        if (pw->rows[i].value != NULL) {
            GFL_StrBufFree(pw->rows[i].value);
        }
    }
    for (i = 0; i < PAGES_WINDOW_COUNT; i++) {
        BmpWin_Free(pw->windows[i]);
    }
    GFL_BGSysSetBGEnabled(PAGES_BG_TEXT, FALSE);
    GFL_BGSysSetBGEnabled(PAGES_BG, FALSE);
    GFL_BGSysReleaseBG(PAGES_BG_TEXT);
    GFL_BGSysReleaseBG(PAGES_BG);
    GFL_ProcReleaseSubsystem(proc);
    return TRUE;
}

const GameProcFunctions ENTREE_PAGES_PROC_FUNCTIONS = { EntreePages_Init, EntreePages_Main, EntreePages_Exit };
