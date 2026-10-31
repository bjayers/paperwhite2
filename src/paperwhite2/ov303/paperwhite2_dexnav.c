#include "types.h"
#include "app/pokedex_habitat.h"
#include "constants/arc.h"
#include "constants/sound.h"
#include "constants/text_banks.h"
#include "field/zone.h"
#include "gfl/arc.h"
#include "gfl/arc_util.h"
#include "gfl/bg_sys.h"
#include "gfl/bmp.h"
#include "gfl/bmpwin.h"
#include "gfl/graphics.h"
#include "gfl/gx_layers.h"
#include "gfl/heap.h"
#include "gfl/key.h"
#include "gfl/msg.h"
#include "gfl/proc.h"
#include "gfl/sound.h"
#include "gfl/str.h"
#include "gfl/touchpanel.h"
#include "gfl/ui.h"
#include "nitro/gx.h"
#include "nitro/hw.h"
#include "nitro/mi.h"
#include "nnsys/g2d.h"
#include "paperwhite2/dexnav.h"
#include "pml/personal.h"
#include "system/game_data.h"
#include "system/gf_font.h"
#include "system/poke_icon.h"
#include "system/printsys.h"
#include "system/wipe.h"
#include "system/wordset.h"
#include "system/zone_weather.h"
#include "text/system/dexnav.h"

// Paper White 2: the DexNav's screens (paperwhite2/dexnav.h), on Geonet's grid as the Season app is. The top screen
// shows the area, the chosen Pokémon (its icon, name, types, share, levels, hidden ability and whether it has been seen
// or caught) and the conditions; the touch screen shows the methods as two rows of tabs, water above land, and the
// method's Pokémon as a scrolling grid of icons with their shares. An unseen Pokémon shows as the "?" icon and "???".
// L and R, or the tabs, change the method; the D-pad or a touch picks a Pokémon; B leaves. The layout is the constants
// and the Draw functions; the lists come from Dexnav_Build

// The Habitat List's heap, which the DexNav takes in the same overlay while the Pokédex isn't open
#define HEAPID_DEXNAV HEAPID_POKEDEX_HABITAT
#define DEXNAV_HEAP_SIZE 0x30000

// Geonet's grid (ARCID_GEONET), as the Season app loads it
#define NARC_GEONET_BG_NCGR 5
#define NARC_GEONET_BG_NCLR 6
#define NARC_GEONET_BG_NSCR 7

// The BGs: the text over the grid on each screen
enum {
    BG_TOP_TEXT = 1,
    BG_TOP_GRID = 3,
    BG_TOUCH_TEXT = 5,
    BG_TOUCH_GRID = 7,
};

// The palettes: the grid's 0 to 3, the font's, the Pokémon icons' three, and the font's with the chosen cell's color
#define PALETTE_FONT 4
#define PALETTE_ICONS 5
#define PALETTE_ICON_COUNT 3
#define PALETTE_CHOSEN 8
#define CHOSEN_COLOR GX_RGB(18, 24, 31)

// The windows' fill color, and the colors of text: plain, of the chosen tab, and of a method not used here
#define FILL_COLOR 15
#define COLOR_CHOSEN PRINT_COLOR(5, 6, FILL_COLOR)
#define COLOR_UNUSED PRINT_COLOR(2, FILL_COLOR, FILL_COLOR)
#define LINE_HEIGHT 16

// An icon: 4 by 4 tiles, the first frame of the icon's file
#define ICON_TILES 4
#define ICON_BYTES 0x200

// The grid: columns and rows of cells, each an icon over its share, and where it starts, in tiles
#define GRID_COLUMNS 6
#define GRID_ROWS 3
#define GRID_CELLS (GRID_COLUMNS * GRID_ROWS)
#define GRID_X 1
#define GRID_Y 5
#define CELL_WIDTH 5
#define CELL_HEIGHT 6
#define LABEL_HEIGHT 2

// The tabs: the water row's tabs, then the land row's, their widths in pixels
#define TAB_ROW_HEIGHT 16
#define WATER_TAB_WIDTH 64
#define LAND_TAB_WIDTH 80

enum {
    SEQ_INIT,
    SEQ_FADE_IN,
    SEQ_INPUT,
    SEQ_FADE_OUT,
    SEQ_END,
};

typedef struct {
    u8 bg;
    u8 x;
    u8 y;
    u8 width;
    u8 height;
    u8 palette;
} DexnavWindowSetup;

typedef struct {
    HeapID heapId;
    DexnavParam *param;
    DexnavData *data;
    Font *font;
    MsgData *msgData;
    WordSet *wordSet;
    StrBuf *format;
    StrBuf *text;
    ArcTool *icons;
    u8 textColors[3];
    // The shown method (an index of DEXNAV_METHOD_ORDER), the chosen entry, and the grid's first row
    u8 method;
    u8 chosen[DEXNAV_METHOD_COUNT];
    u8 scroll;
    BmpWin *title;
    BmpWin *bigIcon;
    BmpWin *info;
    BmpWin *conditions;
    BmpWin *help;
    BmpWin *tabs;
    BmpWin *cellIcons[GRID_CELLS];
    BmpWin *cellLabels[GRID_CELLS];
} DexnavWork;

static BOOL DexnavProc_Init(GameProc *proc, u32 *state, void *param, void *procWork);
static BOOL DexnavProc_Main(GameProc *proc, u32 *state, void *param, void *procWork);
static BOOL DexnavProc_End(GameProc *proc, u32 *state, void *param, void *procWork);

static const BGSysVRAMConfig sDexnavVRAMConfig = {
    GX_VRAM_BG_128_B, GX_VRAM_BGEXTPLTT_NONE,  GX_VRAM_SUB_BG_128_C,       GX_VRAM_SUB_BGEXTPLTT_NONE,
    GX_VRAM_OBJ_64_E, GX_VRAM_OBJEXTPLTT_NONE, GX_VRAM_SUB_OBJ_16_I,       GX_VRAM_SUB_OBJEXTPLTT_NONE,
    GX_VRAM_TEX_0_A,  GX_VRAM_TEXPLTT_0_F,     GX_OBJVRAMMODE_CHAR_1D_32K, GX_OBJVRAMMODE_CHAR_1D_32K,
};

static const BGSysLCDConfig sDexnavLCDConfig = { GX_DISPMODE_GRAPHICS, GX_BGMODE_0, GX_BGMODE_0, FALSE };

// Each engine's BG VRAM has the screens first, then the text's characters (room for the grid of cells) and the grid's
static const BGSetup sDexnavTextBGSetup = {
    0,
    0,
    0x800,
    0,
    BGRES_256x256,
    GX_BG_COLORMODE_16,
    GX_BG_SCRBASE(0x0000),
    GX_BG_CHARBASE(0x04000),
    0x8000,
    GX_BG_EXTPLTT_01,
    0,
    GX_BG_AREAOVER_XLU,
    FALSE,
};
static const BGSetup sDexnavGridBGSetup = {
    0,
    0,
    0x800,
    0,
    BGRES_256x256,
    GX_BG_COLORMODE_16,
    GX_BG_SCRBASE(0x1000),
    GX_BG_CHARBASE(0x10000),
    0x4000,
    GX_BG_EXTPLTT_01,
    3,
    GX_BG_AREAOVER_XLU,
    FALSE,
};

static const DexnavWindowSetup sTitleWindow = { BG_TOP_TEXT, 1, 1, 30, 2, PALETTE_FONT };
static const DexnavWindowSetup sBigIconWindow = { BG_TOP_TEXT, 2, 4, ICON_TILES, ICON_TILES, PALETTE_ICONS };
static const DexnavWindowSetup sInfoWindow = { BG_TOP_TEXT, 7, 4, 24, 10, PALETTE_FONT };
static const DexnavWindowSetup sConditionsWindow = { BG_TOP_TEXT, 1, 17, 30, 2, PALETTE_FONT };
static const DexnavWindowSetup sHelpWindow = { BG_TOP_TEXT, 1, 21, 30, 2, PALETTE_FONT };
static const DexnavWindowSetup sTabsWindow = { BG_TOUCH_TEXT, 0, 0, 32, 4, PALETTE_FONT };

// The methods' names, by DEXNAV_METHOD_ORDER
static const u32 sMethodNames[DEXNAV_METHOD_COUNT] = {
    Dexnav_Text_Surf,  Dexnav_Text_SurfRipple, Dexnav_Text_Rod,      Dexnav_Text_RodRipple,
    Dexnav_Text_Grass, Dexnav_Text_DarkGrass,  Dexnav_Text_Rustling,
};

static const u32 sSeasonNames[] = { Dexnav_Text_Spring, Dexnav_Text_Summer, Dexnav_Text_Autumn, Dexnav_Text_Winter };
static const u32 sPeriodNames[] = { Dexnav_Text_Morning, Dexnav_Text_Day, Dexnav_Text_Evening, Dexnav_Text_Night,
                                    Dexnav_Text_LateNight };

const GameProcFunctions DEXNAV_PROC_FUNCTIONS = { DexnavProc_Init, DexnavProc_Main, DexnavProc_End };

// ------------------------------------------------------------------------------------------------ Windows and text

static BmpWin *Dexnav_CreateWindow(const DexnavWindowSetup *setup) {
    BmpWin *window =
        BmpWin_CreateDynamic(setup->bg, setup->x, setup->y, setup->width, setup->height, setup->palette, TRUE);

    GFL_BitmapFill(BmpWin_GetBitmap(window), FILL_COLOR);
    BmpWin_FlushMap(window);
    return window;
}

static BmpWin *Dexnav_CreateWindowAt(u8 bg, u8 x, u8 y, u8 width, u8 height, u8 palette) {
    DexnavWindowSetup setup;

    setup.bg = bg;
    setup.x = x;
    setup.y = y;
    setup.width = width;
    setup.height = height;
    setup.palette = palette;
    return Dexnav_CreateWindow(&setup);
}

// A message with the word set's words, into the work's text
static StrBuf *Dexnav_Format(DexnavWork *work, u32 message) {
    GFL_MsgDataLoadStrbuf(work->msgData, message, work->format);
    GFL_WordSetFormatStrbuf(work->wordSet, work->text, work->format);
    return work->text;
}

static void Dexnav_Print(DexnavWork *work, BmpWin *window, u32 message, s16 x, s16 y) {
    GFL_TextRendererDrawToBitmap(BmpWin_GetBitmap(window), x, y, Dexnav_Format(work, message), work->font);
}

static void Dexnav_PrintColor(DexnavWork *work, BmpWin *window, u32 message, s16 x, s16 y, u16 color) {
    GFL_TextRendererDrawToBitmapEx(BmpWin_GetBitmap(window), x, y, Dexnav_Format(work, message), work->font, color);
}

// A share in tenths of a percent as the words index and index + 1
static void Dexnav_SetShare(DexnavWork *work, u32 index, u32 share) {
    WordSetNumber(work->wordSet, index, share / 10, 3, 0, TRUE);
    WordSetNumber(work->wordSet, index + 1, share % 10, 1, 0, TRUE);
}

static void Dexnav_Clear(BmpWin *window) {
    GFL_BitmapFill(BmpWin_GetBitmap(window), FILL_COLOR);
}

// A Pokémon's icon, the "?" one for an unseen Pokémon, into a window of the icons' palettes
static void Dexnav_DrawIcon(DexnavWork *work, BmpWin *window, const DexnavEntry *entry) {
    GFLBitmap *bitmap = BmpWin_GetBitmap(window);
    u32 species = entry != NULL && entry->seen ? entry->species : 0;
    u32 form = entry != NULL && entry->seen ? entry->form : 0;
    NNSG2dCharacterData *chars;
    void *file;

    GFL_BitmapFill(bitmap, 0);
    if (entry != NULL && entry->from != DEXNAV_FROM_ITEMS) {
        file = GFL_G2DIOReadBGNCGRArc(work->icons, PokeParty_GetIconIndex(species, form, 0, FALSE), FALSE, &chars,
                                      work->heapId);
        MI_CpuCopy8(chars->pRawData, GFL_BitmapGetPixelData(bitmap), ICON_BYTES);
        GFL_HeapFree(file);
        BmpWin_SetPalette(window, PALETTE_ICONS + PokeIcon_GetPalette(species, form, 0, FALSE));
    }
    BmpWin_FlushChar(window);
    BmpWin_FlushMap(window);
}

// ------------------------------------------------------------------------------------------------ The lists

static const DexnavMethod *Dexnav_GetMethod(DexnavWork *work, u32 shown) {
    return &work->data->methods[DEXNAV_METHOD_ORDER[shown]];
}

static const DexnavEntry *Dexnav_GetChosen(DexnavWork *work) {
    const DexnavMethod *method = Dexnav_GetMethod(work, work->method);

    return work->chosen[work->method] < method->count ? &method->entries[work->chosen[work->method]] : NULL;
}

// The first method with Pokémon, Grass if it has any, else any with a rate
static u8 Dexnav_GetFirstMethod(DexnavWork *work) {
    u32 i;

    if (Dexnav_GetMethod(work, DEXNAV_WATER_METHODS)->count != 0) {
        return DEXNAV_WATER_METHODS;
    }
    for (i = 0; i < DEXNAV_METHOD_COUNT; i++) {
        if (Dexnav_GetMethod(work, i)->count != 0) {
            return i;
        }
    }
    return DEXNAV_WATER_METHODS;
}

// The next method in a direction that has Pokémon, or the same one at the end
static u8 Dexnav_FindMethod(DexnavWork *work, int direction) {
    int i;

    for (i = work->method + direction; i >= 0 && i < DEXNAV_METHOD_COUNT; i += direction) {
        if (Dexnav_GetMethod(work, i)->count != 0) {
            return i;
        }
    }
    return work->method;
}

// ------------------------------------------------------------------------------------------------ Drawing

static void Dexnav_DrawTitle(DexnavWork *work) {
    Dexnav_Clear(work->title);
    loadLocationNameToStrbuf(work->wordSet, 0, ZoneData_GetPlaceNameID(work->param->ctx.zone));
    Dexnav_Print(work, work->title, Dexnav_Text_Title, 0, 0);
    BmpWin_FlushChar(work->title);
}

static void Dexnav_DrawConditions(DexnavWork *work) {
    const ConditionContext *ctx = &work->param->ctx;
    u32 weather = Dexnav_Text_WeatherClear;

    switch (ctx->weather) {
    case WEATHER_RAIN:
    case WEATHER_GUSTY_RAIN:
        weather = Dexnav_Text_WeatherRain;
        break;
    case WEATHER_THUNDERSTORM:
        weather = Dexnav_Text_WeatherThunderstorm;
        break;
    case WEATHER_FLAKE:
    case WEATHER_BLIZZARD:
    case WEATHER_DIAMOND_DUST:
        weather = Dexnav_Text_WeatherSnow;
        break;
    case WEATHER_SANDSTORM:
    case WEATHER_SANDSTORM_2:
        weather = Dexnav_Text_WeatherSandstorm;
        break;
    }
    Dexnav_Clear(work->conditions);
    GFL_MsgDataLoadStrbuf(work->msgData, sSeasonNames[ctx->season % NELEMS(sSeasonNames)], work->format);
    GFL_WordSetSetStrbuf(work->wordSet, 0, work->format, 0, TRUE, 0);
    GFL_MsgDataLoadStrbuf(work->msgData, sPeriodNames[ctx->period % NELEMS(sPeriodNames)], work->format);
    GFL_WordSetSetStrbuf(work->wordSet, 1, work->format, 0, TRUE, 0);
    GFL_MsgDataLoadStrbuf(work->msgData, weather, work->format);
    GFL_WordSetSetStrbuf(work->wordSet, 2, work->format, 0, TRUE, 0);
    Dexnav_Print(work, work->conditions, Dexnav_Text_Conditions, 0, 0);
    BmpWin_FlushChar(work->conditions);
}

static void Dexnav_DrawHelp(DexnavWork *work) {
    const DexnavMethod *method = Dexnav_GetMethod(work, work->method);
    u32 rows = (method->count + GRID_COLUMNS - 1) / GRID_COLUMNS;

    Dexnav_Clear(work->help);
    if (rows > GRID_ROWS) {
        WordSetNumber(work->wordSet, 0, work->scroll / GRID_ROWS + 1, 2, 0, TRUE);
        WordSetNumber(work->wordSet, 1, (rows + GRID_ROWS - 1) / GRID_ROWS, 2, 0, TRUE);
        Dexnav_Print(work, work->help, Dexnav_Text_HelpPages, 0, 0);
    } else {
        Dexnav_Print(work, work->help, Dexnav_Text_Help, 0, 0);
    }
    BmpWin_FlushChar(work->help);
}

// The chosen Pokémon on the top screen
static void Dexnav_DrawInfo(DexnavWork *work) {
    const DexnavEntry *entry = Dexnav_GetChosen(work);
    const DexnavMethod *method = Dexnav_GetMethod(work, work->method);
    BmpWin *info = work->info;
    u32 type1, type2;

    Dexnav_Clear(info);
    Dexnav_DrawIcon(work, work->bigIcon, entry);
    if (!work->data->active) {
        Dexnav_Print(work, info, Dexnav_Text_NoData, 0, 0);
    } else if (entry == NULL) {
        Dexnav_Print(work, info, method->rate == 0 ? Dexnav_Text_NotHere : Dexnav_Text_NoPokemon, 0, 0);
    } else if (entry->from == DEXNAV_FROM_ITEMS) {
        Dexnav_Print(work, info, Dexnav_Text_Items, 0, 0);
        Dexnav_SetShare(work, 0, entry->share);
        Dexnav_Print(work, info, Dexnav_Text_Rate, 0, LINE_HEIGHT);
        Dexnav_Print(work, info, Dexnav_Text_ItemsInfo, 0, LINE_HEIGHT * 2);
    } else {
        if (entry->seen) {
            WordSet_LoadSpeciesName(work->wordSet, 0, entry->species);
            Dexnav_Print(work, info, Dexnav_Text_Name, 0, 0);
            type1 = PML_PersonalGetParamSingle(entry->species, entry->form, PERSONAL_TYPE_1);
            type2 = PML_PersonalGetParamSingle(entry->species, entry->form, PERSONAL_TYPE_2);
            loadTypeTextToStrbuf(work->wordSet, 0, type1);
            loadTypeTextToStrbuf(work->wordSet, 1, type2);
            Dexnav_Print(work, info, type1 == type2 ? Dexnav_Text_Type : Dexnav_Text_Types, 0, LINE_HEIGHT);
        } else {
            Dexnav_Print(work, info, Dexnav_Text_Unknown, 0, 0);
        }
        Dexnav_SetShare(work, 0, entry->share);
        Dexnav_Print(work, info, Dexnav_Text_Rate, 0, LINE_HEIGHT * 2);
        WordSetNumber(work->wordSet, 0, entry->minLevel, 3, 0, TRUE);
        WordSetNumber(work->wordSet, 1, entry->maxLevel, 3, 0, TRUE);
        Dexnav_Print(work, info, entry->minLevel == entry->maxLevel ? Dexnav_Text_Level : Dexnav_Text_Levels, 0,
                     LINE_HEIGHT * 3);
        Dexnav_Print(work, info,
                     entry->caught ? Dexnav_Text_Caught : (entry->seen ? Dexnav_Text_Seen : Dexnav_Text_NotSeen), 0,
                     LINE_HEIGHT * 4);
        if (entry->from == ENCOUNTERS_FROM_OUTBREAK) {
            Dexnav_PrintColor(work, info, Dexnav_Text_Outbreak, 96, LINE_HEIGHT * 4, COLOR_CHOSEN);
        } else if (entry->seen && entry->hiddenAbility != 0) {
            WordSetNumber(work->wordSet, 0, entry->hiddenAbility, 3, 0, TRUE);
            Dexnav_Print(work, info, Dexnav_Text_HiddenAbility, 96, LINE_HEIGHT * 4);
        }
    }
    BmpWin_FlushChar(info);
}

static void Dexnav_DrawTabs(DexnavWork *work) {
    u32 i;

    Dexnav_Clear(work->tabs);
    for (i = 0; i < DEXNAV_METHOD_COUNT; i++) {
        BOOL water = i < DEXNAV_WATER_METHODS;
        s16 x = water ? i * WATER_TAB_WIDTH : (i - DEXNAV_WATER_METHODS) * LAND_TAB_WIDTH + LAND_TAB_WIDTH / 4;
        s16 y = water ? 0 : TAB_ROW_HEIGHT;
        u16 color = i == work->method                       ? COLOR_CHOSEN
                    : Dexnav_GetMethod(work, i)->count == 0 ? COLOR_UNUSED
                                                            : PRINT_COLOR(1, 2, FILL_COLOR);

        Dexnav_PrintColor(work, work->tabs, sMethodNames[i], x + 4, y, color);
    }
    BmpWin_FlushChar(work->tabs);
}

static void Dexnav_DrawGrid(DexnavWork *work) {
    const DexnavMethod *method = Dexnav_GetMethod(work, work->method);
    u32 i;

    for (i = 0; i < GRID_CELLS; i++) {
        u32 index = work->scroll * GRID_COLUMNS + i;
        const DexnavEntry *entry = index < method->count ? &method->entries[index] : NULL;
        BmpWin *label = work->cellLabels[i];

        Dexnav_DrawIcon(work, work->cellIcons[i], entry);
        Dexnav_Clear(label);
        BmpWin_SetPalette(label, index == work->chosen[work->method] && entry != NULL ? PALETTE_CHOSEN : PALETTE_FONT);
        if (entry != NULL) {
            Dexnav_SetShare(work, 0, entry->share);
            Dexnav_Print(work, label, entry->from == DEXNAV_FROM_ITEMS ? Dexnav_Text_CellItems : Dexnav_Text_Cell, 2,
                         0);
        }
        BmpWin_FlushChar(label);
        BmpWin_FlushMap(label);
    }
}

static void Dexnav_DrawAll(DexnavWork *work) {
    Dexnav_DrawTabs(work);
    Dexnav_DrawGrid(work);
    Dexnav_DrawInfo(work);
    Dexnav_DrawHelp(work);
}

// ------------------------------------------------------------------------------------------------ Input

// Keeps the chosen entry's row in the grid's view
static void Dexnav_ScrollToChosen(DexnavWork *work) {
    u32 row = work->chosen[work->method] / GRID_COLUMNS;

    if (row < work->scroll) {
        work->scroll = row;
    } else if (row >= work->scroll + GRID_ROWS) {
        work->scroll = row - GRID_ROWS + 1;
    }
}

static void Dexnav_ShowMethod(DexnavWork *work, u8 method) {
    work->method = method;
    work->scroll = 0;
    Dexnav_ScrollToChosen(work);
    Dexnav_DrawAll(work);
}

static void Dexnav_Choose(DexnavWork *work, int chosen) {
    const DexnavMethod *method = Dexnav_GetMethod(work, work->method);

    if (method->count == 0 || chosen < 0 || chosen >= method->count || chosen == work->chosen[work->method]) {
        return;
    }
    work->chosen[work->method] = chosen;
    Dexnav_ScrollToChosen(work);
    GFL_SndSEPlay(SEQ_SE_SELECT1);
    Dexnav_DrawGrid(work);
    Dexnav_DrawInfo(work);
    Dexnav_DrawHelp(work);
}

// A touch on a tab shows its method, on a cell chooses its entry
static void Dexnav_Touch(DexnavWork *work, u32 x, u32 y) {
    u32 column, row;

    if (y < TAB_ROW_HEIGHT * 2) {
        u32 tab = y < TAB_ROW_HEIGHT
                      ? x / WATER_TAB_WIDTH
                      : DEXNAV_WATER_METHODS + (x < LAND_TAB_WIDTH / 4 ? 0 : (x - LAND_TAB_WIDTH / 4) / LAND_TAB_WIDTH);

        if (tab < DEXNAV_METHOD_COUNT && tab != work->method && Dexnav_GetMethod(work, tab)->count != 0) {
            GFL_SndSEPlay(SEQ_SE_SELECT1);
            Dexnav_ShowMethod(work, tab);
        }
        return;
    }
    if (x < GRID_X * 8 || y < GRID_Y * 8) {
        return;
    }
    column = (x - GRID_X * 8) / (CELL_WIDTH * 8);
    row = (y - GRID_Y * 8) / (CELL_HEIGHT * 8);
    if (column < GRID_COLUMNS && row < GRID_ROWS) {
        Dexnav_Choose(work, (work->scroll + row) * GRID_COLUMNS + column);
    }
}

// Returns TRUE to leave
static BOOL Dexnav_Input(DexnavWork *work) {
    u32 pressed = GCTX_HIDGetPressedKeys();
    u32 typed = GCTX_HIDGetTypedKeys();
    int chosen = work->chosen[work->method];
    u32 x, y;
    u8 method;

    if (pressed & (PAD_BUTTON_B | PAD_BUTTON_X)) {
        GFL_SndSEPlay(SEQ_SE_CANCEL1);
        return TRUE;
    }
    if (GFL_HIDGetTouchPressedPoint(&x, &y)) {
        Dexnav_Touch(work, x, y);
        return FALSE;
    }
    if (pressed & (PAD_BUTTON_L | PAD_BUTTON_R)) {
        method = Dexnav_FindMethod(work, (pressed & PAD_BUTTON_R) ? 1 : -1);
        if (method != work->method) {
            GFL_SndSEPlay(SEQ_SE_SELECT1);
            Dexnav_ShowMethod(work, method);
        }
        return FALSE;
    }
    if (typed & PAD_KEY_LEFT) {
        Dexnav_Choose(work, chosen - 1);
    } else if (typed & PAD_KEY_RIGHT) {
        Dexnav_Choose(work, chosen + 1);
    } else if (typed & PAD_KEY_UP) {
        Dexnav_Choose(work, chosen - GRID_COLUMNS);
    } else if (typed & PAD_KEY_DOWN) {
        // Down from the last full row goes to the last entry
        u32 count = Dexnav_GetMethod(work, work->method)->count;

        Dexnav_Choose(work, chosen + GRID_COLUMNS < count                        ? chosen + GRID_COLUMNS
                            : (chosen / GRID_COLUMNS + 1) * GRID_COLUMNS < count ? count - 1
                                                                                 : chosen);
    }
    return FALSE;
}

// ------------------------------------------------------------------------------------------------ Graphics

static void Dexnav_SetVRAMBanks(void) {
    GX_SetBankForLCDC(GX_VRAM_LCDC_ALL);
    MIi_CpuClearFast(0, (void *)HW_LCDC_VRAM, HW_LCDC_VRAM_SIZE);
    GX_DisableBankForLCDC();
    MIi_CpuClearFast(0xc0, (void *)HW_OAM, HW_OAM_SIZE);
    MIi_CpuClearFast(0, (void *)HW_BG_PLTT, HW_PLTT_SIZE);
    MIi_CpuClearFast(0xc0, (void *)HW_DB_OAM, HW_OAM_SIZE);
    MIi_CpuClearFast(0, (void *)HW_DB_BG_PLTT, HW_PLTT_SIZE);
    GFL_BGSysSetVRAMBanks(&sDexnavVRAMConfig);
}

static void Dexnav_LoadScreen(DexnavWork *work, ArcTool *geonet, u8 textBG, u8 gridBG, u32 palType) {
    GXRgb chosen = CHOSEN_COLOR;

    GFL_BGSysCreateBG(textBG, &sDexnavTextBGSetup, BGMODE_TEXT);
    GFL_BGSysClearScr(textBG);
    GFL_BGSysCreateBG(gridBG, &sDexnavGridBGSetup, BGMODE_TEXT);
    GFL_BGSysLoadArcNCGRStatic(geonet, NARC_GEONET_BG_NCGR, gridBG, 0, 0, FALSE, work->heapId);
    GFL_G2DIOLoadArcNCLRDefault(geonet, NARC_GEONET_BG_NCLR, palType, 0, 0x80, work->heapId);
    loadBGScrToVramByFileNoReserveNegAlign(geonet, NARC_GEONET_BG_NSCR, gridBG, 0, 0, FALSE, work->heapId);
    GFL_BGSysLoadNCLRDefault(ARCID_FONT, 5, palType, PALETTE_FONT * 0x20, 0x20, work->heapId);
    // The chosen cell's palette is the font's with another fill color
    GFL_BGSysLoadNCLRDefault(ARCID_FONT, 5, palType, PALETTE_CHOSEN * 0x20, 0x20, work->heapId);
    GFL_BGSysUploadStdPalette(textBG, &chosen, sizeof(chosen), (PALETTE_CHOSEN * 16 + FILL_COLOR) * sizeof(GXRgb));
    GFL_G2DIOLoadArcNCLR(work->icons, PokeIcon_GetPaletteFile(), palType, 0, PALETTE_ICONS * 0x20,
                         PALETTE_ICON_COUNT * 0x20, work->heapId);
    GFL_BGSysClearCharCore(textBG, 0x20, 0, work->heapId);
    GFL_BGSysResetStdPalette(textBG, GX_RGB(0, 0, 0));
}

static void Dexnav_LoadGraphics(DexnavWork *work) {
    ArcTool *geonet = GFL_ArcSysCreateFileHandle(ARCID_GEONET, work->heapId);
    u32 i;

    work->font = GFL_FontCreate(ARCID_FONT, 0, 0, FALSE, work->heapId);
    GFL_TextRndGetGlobalColors(&work->textColors[0], &work->textColors[1], &work->textColors[2]);
    GFL_TextRndUpdateColorIndexLUT(1, 2, FILL_COLOR);
    Dexnav_LoadScreen(work, geonet, BG_TOP_TEXT, BG_TOP_GRID, PALTYPE_MAIN_BG);
    Dexnav_LoadScreen(work, geonet, BG_TOUCH_TEXT, BG_TOUCH_GRID, PALTYPE_SUB_BG);
    GFL_ArcToolFree(geonet);

    work->title = Dexnav_CreateWindow(&sTitleWindow);
    work->bigIcon = Dexnav_CreateWindow(&sBigIconWindow);
    work->info = Dexnav_CreateWindow(&sInfoWindow);
    work->conditions = Dexnav_CreateWindow(&sConditionsWindow);
    work->help = Dexnav_CreateWindow(&sHelpWindow);
    work->tabs = Dexnav_CreateWindow(&sTabsWindow);
    for (i = 0; i < GRID_CELLS; i++) {
        u8 x = GRID_X + (i % GRID_COLUMNS) * CELL_WIDTH;
        u8 y = GRID_Y + (i / GRID_COLUMNS) * CELL_HEIGHT;

        work->cellIcons[i] = Dexnav_CreateWindowAt(BG_TOUCH_TEXT, x, y, ICON_TILES, ICON_TILES, PALETTE_ICONS);
        work->cellLabels[i] =
            Dexnav_CreateWindowAt(BG_TOUCH_TEXT, x, y + ICON_TILES, CELL_WIDTH, LABEL_HEIGHT, PALETTE_FONT);
    }
}

static void Dexnav_FreeGraphics(DexnavWork *work) {
    u32 i;

    for (i = 0; i < GRID_CELLS; i++) {
        BmpWin_Free(work->cellLabels[i]);
        BmpWin_Free(work->cellIcons[i]);
    }
    BmpWin_Free(work->tabs);
    BmpWin_Free(work->help);
    BmpWin_Free(work->conditions);
    BmpWin_Free(work->info);
    BmpWin_Free(work->bigIcon);
    BmpWin_Free(work->title);
    GFL_BGSysReleaseBG(BG_TOUCH_TEXT);
    GFL_BGSysReleaseBG(BG_TOUCH_GRID);
    GFL_BGSysReleaseBG(BG_TOP_TEXT);
    GFL_BGSysReleaseBG(BG_TOP_GRID);
    GFL_FontFree(work->font);
    GFL_TextRndUpdateColorIndexLUT(work->textColors[0], work->textColors[1], work->textColors[2]);
}

static void Dexnav_SetBGsEnabled(BOOL enabled) {
    GFL_BGSysSetBGEnabled(BG_TOP_TEXT, enabled);
    GFL_BGSysSetBGEnabled(BG_TOP_GRID, enabled);
    GFL_BGSysSetBGEnabled(BG_TOUCH_TEXT, enabled);
    GFL_BGSysSetBGEnabled(BG_TOUCH_GRID, enabled);
}

// ------------------------------------------------------------------------------------------------ The process

static BOOL DexnavProc_Init(GameProc *proc, u32 *state, void *param, void *procWork) {
    DexnavWork *work;

    GFL_HeapCreateChild(HEAPID_USER, HEAPID_DEXNAV, DEXNAV_HEAP_SIZE);
    work = GFL_ProcInitSubsystem(proc, sizeof(DexnavWork), HEAPID_DEXNAV);
    MI_CpuFill8(work, 0, sizeof(DexnavWork));
    work->heapId = HEAPID_DEXNAV;
    work->param = param;
    work->data = GFL_HeapAllocate(work->heapId, sizeof(DexnavData), TRUE, "paperwhite2_dexnav.c", __LINE__);
    Dexnav_Build(work->data, &work->param->ctx, work->param->gameData);
    Dexnav_SetVRAMBanks();
    GFL_BGSysCreate(work->heapId);
    GFL_BGSysSetLCDConfig(&sDexnavLCDConfig);
    BmpWin_InitAllocator(work->heapId);
    GFL_BGSysEnableEngines();
    GFL_BGSysSetDisplayLayout(GX_DISP_SELECT_MAIN_SUB);
    work->msgData = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_DEXNAV, work->heapId);
    work->wordSet = GFL_WordSetSystemCreateDefault(work->heapId);
    work->format = GFL_StrBufCreate(0x100, work->heapId);
    work->text = GFL_StrBufCreate(0x100, work->heapId);
    work->icons = GFL_ArcSysCreateFileHandle(ARCID_POKEICON, work->heapId);
    return TRUE;
}

static BOOL DexnavProc_Main(GameProc *proc, u32 *state, void *param, void *procWork) {
    DexnavWork *work = procWork;

    switch (*state) {
    case SEQ_INIT:
        Dexnav_LoadGraphics(work);
        Dexnav_DrawTitle(work);
        Dexnav_DrawConditions(work);
        Dexnav_ShowMethod(work, Dexnav_GetFirstMethod(work));
        Dexnav_SetBGsEnabled(TRUE);
        GFL_WipeSet(WIPE_MODE_BOTH, WIPE_TYPE_FADE_IN, WIPE_TYPE_FADE_IN, WIPE_COLOR_BLACK, 6, 1, work->heapId);
        *state = SEQ_FADE_IN;
        break;
    case SEQ_FADE_IN:
        if (GFL_WipeIsFinished() == TRUE) {
            *state = SEQ_INPUT;
        }
        break;
    case SEQ_INPUT:
        if (Dexnav_Input(work)) {
            *state = SEQ_FADE_OUT;
        }
        break;
    case SEQ_FADE_OUT:
        GFL_WipeSet(WIPE_MODE_BOTH, WIPE_TYPE_FADE_OUT, WIPE_TYPE_FADE_OUT, WIPE_COLOR_BLACK, 6, 1, work->heapId);
        *state = SEQ_END;
        break;
    case SEQ_END:
        if (GFL_WipeIsFinished() == TRUE) {
            return TRUE;
        }
        break;
    }
    return FALSE;
}

static BOOL DexnavProc_End(GameProc *proc, u32 *state, void *param, void *procWork) {
    DexnavWork *work = procWork;
    HeapID heapId = work->heapId;

    Dexnav_SetBGsEnabled(FALSE);
    Dexnav_FreeGraphics(work);
    GFL_ArcToolFree(work->icons);
    GFL_StrBufFree(work->text);
    GFL_StrBufFree(work->format);
    GFL_WordSetSystemFree(work->wordSet);
    GFL_MsgDataFree(work->msgData);
    GFL_HeapFree(work->data);
    BmpWin_FreeAllocator();
    GFL_BGSysFree();
    GFL_ProcReleaseSubsystem(proc);
    GFL_HeapDelete(heapId);
    return TRUE;
}
