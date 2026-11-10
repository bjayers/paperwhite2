#include "types.h"
#include "app/pokedex_habitat.h"
#include "constants/arc.h"
#include "constants/text_banks.h"
#include "field/enc_pokeset.h"
#include "gfl/arc.h"
#include "gfl/arc_util.h"
#include "gfl/bg_sys.h"
#include "gfl/bmp.h"
#include "gfl/bmpwin.h"
#include "gfl/clact.h"
#include "gfl/heap.h"
#include "gfl/msg.h"
#include "gfl/str.h"
#include "nitro/hw.h"
#include "nitro/mi.h"
#include "paperwhite2/habitat_dex.h"
#include "system/app_menu_common.h"
#include "system/palanm.h"
#include "system/printsys.h"
#include "system/rtc.h"
#include "system/wordset.h"
#include "system/zone_weather.h"
#include "text/system/dexnav.h"

// Paper White 2: the Habitat Dex's lists and its filter bar (paperwhite2/habitat_dex.h)

// The Habitat List's archive (ARCID_POKEDEX_HABITAT in pokedex_common.c)
#define ARCID_HABITAT_LIST 296

// The methods' encounter types, by HABITAT_DEX_METHOD_* (all's are the others')
static const u8 sMethodTypes[HABITAT_DEX_METHOD_COUNT] = {
    ENCTYPE_MAX, ENCTYPE_GRASS, ENCTYPE_GRASS_RARE, ENCTYPE_SURF, ENCTYPE_FISHING,
};
// And their kinds of habitat (0 land, 1 water, 2 fishing)
static const u8 sMethodKinds[HABITAT_DEX_METHOD_COUNT] = { 0, 0, 0, 1, 2 };
#define KIND_COUNT 3

// Each filter's values: any, then its values
#define SEASON_FILTERS 5
#define TIME_FILTERS (DAY_PERIOD_COUNT + 1)
#define WEATHER_FILTERS 6
static const u8 sFilterCounts[HABITAT_DEX_FILTER_COUNT] = { SEASON_FILTERS, TIME_FILTERS, WEATHER_FILTERS };

// The weathers of each weather filter, as the DexNav names a zone's weather
#define WEATHER_BIT(weather) (1 << (weather))
static const u32 sWeatherFilterBits[WEATHER_FILTERS] = {
    0,
    WEATHER_BIT(WEATHER_SUNNY) | WEATHER_BIT(WEATHER_FLUTTER) | WEATHER_BIT(WEATHER_TINT_9) |
        WEATHER_BIT(WEATHER_TINT_10) | WEATHER_BIT(WEATHER_TINT_11) | WEATHER_BIT(WEATHER_TINT_13) |
        WEATHER_BIT(WEATHER_TINT_14),
    WEATHER_BIT(WEATHER_RAIN) | WEATHER_BIT(WEATHER_GUSTY_RAIN),
    WEATHER_BIT(WEATHER_THUNDERSTORM),
    WEATHER_BIT(WEATHER_FLAKE) | WEATHER_BIT(WEATHER_BLIZZARD) | WEATHER_BIT(WEATHER_DIAMOND_DUST),
    WEATHER_BIT(WEATHER_SANDSTORM) | WEATHER_BIT(WEATHER_SANDSTORM_2),
};

// The Area icons (tools/paperwhite2/pokedex_area.py, as paperwhite2_pokedex_info_area.c reads them), each 32 by 16:
// the sheet's slots, five a row, then a grey copy of each in the same order
enum {
    ICON_SPRING,
    ICON_MORNING = 5,
    ICON_CLEAR = 10,
    ICON_GRASS = 15,
    ICON_DARK_GRASS,
    ICON_CAVE_FLOOR,
    ICON_SAND,
    ICON_BRIDGE,
    ICON_SURF,
    ICON_PUDDLE,
    ICON_FISHING,
    ICON_WALKING,
    ICON_ANY,
    ICON_COUNT,
};
#define ICON_WIDTH 32
#define ICON_HEIGHT 16
#define ICON_SIZE (ICON_WIDTH * ICON_HEIGHT / 2)
#define ICON_CHARS_SIZE (ICON_COUNT * 2 * ICON_SIZE)
// The member (ARCID_POKEDEX_GRA's AREA_ICONS_FILE in paperwhite2_pokedex_info_area.c): the icons' palette rows'
// colours, each icon's row, padded to 4 bytes, and their tiles
#define ICONS_FILE 163
#define ICON_PALETTE_ROWS 4
#define PALETTE_SIZE 0x20
#define ICON_ROWS_OFFSET (ICON_PALETTE_ROWS * PALETTE_SIZE)
#define ICON_TILES_OFFSET ((ICON_ROWS_OFFSET + ICON_COUNT * 2 + 3) & ~3)
// The type icons' cells (a 32 by 16 OBJ centred on its place) for the main engine's 1D 128 KB mapping, over the bar
#define ICON_CELL_MAPPING 2
#define ICON_BG_PRIORITY 1
// The main OBJ palette rows of the member's rows: rows that none of the screen's OBJs use (its cells' palettes, and
// the touch bar's and the party icons' rows 8 to 13)
static const u8 sIconObjRows[ICON_PALETTE_ROWS] = { 2, 4, 14, 15 };

// The method's icons, by HABITAT_DEX_METHOD_* (walking's by the area's terrain)
static const u8 sMethodIcons[HABITAT_DEX_METHOD_COUNT] = {
    ICON_WALKING, ICON_GRASS, ICON_DARK_GRASS, ICON_SURF, ICON_FISHING,
};
static const u8 sTerrainIcons[HABITAT_DEX_TERRAIN_COUNT] = {
    ICON_GRASS, ICON_CAVE_FLOOR, ICON_SAND, ICON_PUDDLE, ICON_BRIDGE, ICON_WALKING,
};
// Each filter's first icon (its value 1's)
static const u8 sFilterIcons[HABITAT_DEX_FILTER_COUNT] = { ICON_SPRING, ICON_MORNING, ICON_CLEAR };

// The bar's art (res/paperwhite2/pokedex_art/habitat_bar.png, the art target pokedex_habitat_bar): ARCID_POKEDEX_GRA's
// palette, characters and screen, on the list's BG (2) after its own 256 characters, in main BG palette row 13 (12 is
// the stamps' message box's), over the screen's top 6 tile rows
#define BAR_PALETTE_FILE 156
#define BAR_CHARS_FILE 157
#define BAR_SCREEN_FILE 158
#define BAR_BG 2
#define BAR_CHAR_OFFSET 256
#define BAR_PALETTE 13
#define BAR_TILES_ACROSS 32
#define BAR_TILES_DOWN 6

// The bar, in pixels (pokedex_area_templates.py's habitat templates draw the same). The top row (y 0-23, the icons at
// y 4) holds the methods the area has, spread evenly over x TOP_LEFT to TOP_LEFT + TOP_WIDTH (8 px clear of the
// screen's left edge, as the bottom row, and of the stamp's x 192): the i-th of n centred at
// TOP_LEFT + TOP_WIDTH * (2i + 1) / 2n, and a touch at x belongs to the ((x - TOP_LEFT) * n / TOP_WIDTH)-th. The
// bottom row (y 24-47, the filters' icons at y 22, their dots right of them, the user's choice) holds the season,
// time and weather filters at FILTER_X + FILTER_PITCH i, then the page arrows (the list's actors,
// pokedex_habitat_graphic.c) and the page between them, centred at PAGE_X. The stamp shows to the right of both,
// centred at x 224, y 24
#define TOP_LEFT 8
#define TOP_WIDTH 176
#define ROW_HEIGHT 24
#define ICON_INSET_Y 4
#define FILTER_X 8
#define FILTER_Y 22
// The page's text, on the user's bar (the arrows at y 33, pokedex_habitat_graphic.c)
#define PAGE_Y 25
#define FILTER_PITCH 40
#define PAGE_X 160
#define PAGE_WIDTH 32
#define LINE_HEIGHT 16
#define COLOR_PLAIN PRINT_COLOR(1, 2, 0)
// The grid's note: white with a dark shadow, on any of the grid's colours
#define COLOR_NOTE PRINT_COLOR(15, 1, 0)
// The window's (POKEDEX_HABITAT_WIN_MAIN), which covers the main screen from its corner
#define WINDOW_MAIN 0
// Right of each filter's icon, a column of dots, one for each of its values in the order a touch takes them (any at
// the top), the chosen one red and the others grey, as the user drew them (2026-11-10): DOT_WIDTH by DOT_HEIGHT px,
// DOT_PITCH px apart, DOT_OFFSET_X px from the icon's left, centred on y DOT_CENTER_Y (6 dots y 23-33), in the
// window's tile rows from DOT_TILE_ROW, which the VBlank sends with the icons (the font's palette row: 3 red, 2
// grey)
#define DOT_WIDTH 3
#define DOT_HEIGHT 1
#define DOT_PITCH 2
#define DOT_OFFSET_X 33
#define DOT_CENTER_Y 28
#define DOT_AREA_Y 16
#define DOT_AREA_HEIGHT 24
#define DOT_TILE_ROW (DOT_AREA_Y / 8)
#define DOT_TILE_ROWS (DOT_AREA_HEIGHT / 8)
#define DOT_COLOR_CHOSEN 3
#define DOT_COLOR_OTHER 2
// Where the grid is, a note on why it is empty: centred across the box, in the middle of its height
#define NOTE_LEFT 16
#define NOTE_WIDTH 224
#define NOTE_Y 100

static const HabitatDexEntry *HabitatDex_GetEntries(HabitatDex *dex, u32 file, u32 *count);
static BOOL HabitatDex_Matches(HabitatDex *dex, const HabitatDexEntry *entry);
static BOOL HabitatDex_IsListed(HabitatDex *dex, u32 method, const HabitatDexEntry *entry);
static void HabitatDex_ShowIcon(HabitatDex *dex, u32 slot, u32 icon, BOOL grey, int x, int y);
static void HabitatDex_SetGridShown(HabitatDex *dex, BOOL shown);
static void HabitatDex_DrawDots(GFLBitmap *bitmap, int x, u32 count, u32 chosen);
static void HabitatDex_LoadDots(PokedexHabitatGraphic *graphic);

void PaperWhite2_HabitatDex_Init(HabitatDex *dex, HeapID heapId) {
    MI_CpuFill8(dex, 0, sizeof(HabitatDex));
    dex->heapId = heapId;
    dex->data = GFL_ArcSysReadHeapNew(ARCID_HABITAT_LIST, HABITAT_DEX_MEMBER, heapId);
    if (dex->data->magic != HABITAT_DEX_MAGIC || dex->data->version != HABITAT_DEX_VERSION) {
        GFL_HeapFree((void *)dex->data);
        dex->data = NULL;
    }
    dex->msgData = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_DEXNAV, heapId);
}

void PaperWhite2_HabitatDex_Free(HabitatDex *dex) {
    if (dex->data != NULL) {
        GFL_HeapFree((void *)dex->data);
    }
    GFL_MsgDataFree(dex->msgData);
}

void PaperWhite2_HabitatDex_InitBar(HabitatDex *dex, PokedexHabitatGraphic *graphic) {
    ArcTool *arc = GFL_ArcSysCreateFileHandle(ARCID_POKEDEX_GRA, dex->heapId);
    ClActorSetup setup;
    u32 i;

    PaperWhite2_HabitatDex_NewArea(dex);
    dex->gridHidden = FALSE;
    dex->note = HABITAT_DEX_NOTE_NONE;

    // The art, its screen's entries moved to its characters, and its colours in the palette fade's buffer too
    GFL_BGSysLoadArcNCGRStatic(arc, BAR_CHARS_FILE, BAR_BG, BAR_CHAR_OFFSET, 0, FALSE, dex->heapId);
    GFL_G2DIOLoadNSCRAsync(arc, BAR_SCREEN_FILE, BAR_BG, 0, BAR_CHAR_OFFSET, 0, FALSE, dex->heapId);
    GFL_BGSysSetScrPaletteNo(BAR_BG, 0, 0, BAR_TILES_ACROSS, BAR_TILES_DOWN, BAR_PALETTE);
    GFL_BGSysQueueScrLoad(BAR_BG);
    GFL_G2DIOLoadArcNCLR(arc, BAR_PALETTE_FILE, PALTYPE_MAIN_BG, 0, BAR_PALETTE * PALETTE_SIZE, PALETTE_SIZE,
                         dex->heapId);
    PaletteFade_LoadFromVRAM(graphic->paletteFade, PALFADE_BUFFER_MAIN_BG, 0, 0x200);
    GFL_ArcToolFree(arc);

    // The icons: the type icons' cells and first palette row as their resources, the VBlank loading the icons' colours
    // into their rows
    dex->icons = GFL_ArcSysReadHeapNew(ARCID_POKEDEX_GRA, ICONS_FILE, dex->heapId);
    arc = GFL_ArcSysCreateFileHandle(ARCID_APP_MENU_COMMON, dex->heapId);
    dex->iconPalette = ClActSys_LoadPlttRange(arc, AppMenuCommon_GetTypeIconPaletteFile(), CLACT_VRAM_MAIN,
                                              sIconObjRows[0] * PALETTE_SIZE, 0, 1, dex->heapId);
    dex->iconCellAnims = ClActSys_LoadCellAnims(arc, AppMenuCommon_GetTypeIconCellFile(ICON_CELL_MAPPING),
                                                AppMenuCommon_GetTypeIconAnimFile(ICON_CELL_MAPPING), dex->heapId);
    GFL_ArcToolFree(arc);
    dex->iconChars = ClActSys_AllocChars(ICON_CHARS_SIZE, CLACT_VRAM_MAIN, dex->heapId);
    ClActSys_WriteCharData(dex->iconChars, (u8 *)dex->icons + ICON_TILES_OFFSET, ICON_CHARS_SIZE, 0, CLACT_VRAM_MAIN);
    MI_CpuFill8(&setup, 0, sizeof(ClActorSetup));
    setup.bgPriority = ICON_BG_PRIORITY;
    for (i = 0; i < HABITAT_DEX_BAR_ICONS; i++) {
        dex->iconActors[i] = ClActor_Create(graphic->unit, dex->iconChars, dex->iconPalette, dex->iconCellAnims, &setup,
                                            CLACT_SURFACE_MAIN, dex->heapId);
        ClActor_SetVisible(dex->iconActors[i], FALSE);
    }
    dex->iconRowsPending = TRUE;
}

void PaperWhite2_HabitatDex_FreeBar(HabitatDex *dex) {
    u32 i;

    for (i = 0; i < HABITAT_DEX_BAR_ICONS; i++) {
        ClActor_Delete(dex->iconActors[i]);
    }
    ClActSys_FreeChars(dex->iconChars);
    ClActSys_FreeCellAnims(dex->iconCellAnims);
    ClActSys_FreePltt(dex->iconPalette);
    GFL_HeapFree(dex->icons);
}

void PaperWhite2_HabitatDex_VBlank(HabitatDex *dex, PokedexHabitatGraphic *graphic) {
    u32 i;

    if (dex->dotsPending) {
        HabitatDex_LoadDots(graphic);
        dex->dotsPending = FALSE;
    }
    if (!dex->iconRowsPending) {
        return;
    }
    for (i = 0; i < ICON_PALETTE_ROWS; i++) {
        MI_CpuCopy16((u8 *)dex->icons + i * PALETTE_SIZE, (void *)(HW_OBJ_PLTT + sIconObjRows[i] * PALETTE_SIZE),
                     PALETTE_SIZE);
    }
    PaletteFade_LoadFromVRAM(graphic->paletteFade, PALFADE_BUFFER_MAIN_OBJ, 0, 0x200);
    dex->iconRowsPending = FALSE;
}

void PaperWhite2_HabitatDex_Reset(HabitatDex *dex) {
    dex->page = 0;
}

// The Habitat List shows the area under every condition: each filter starts on any
void PaperWhite2_HabitatDex_NewArea(HabitatDex *dex) {
    u32 i;

    for (i = 0; i < HABITAT_DEX_FILTER_COUNT; i++) {
        dex->filters[i] = 0;
    }
    dex->page = 0;
}

static const HabitatDexEntry *HabitatDex_GetEntries(HabitatDex *dex, u32 file, u32 *count) {
    const u8 *base = (const u8 *)dex->data;

    if (dex->data == NULL || file >= dex->data->count) {
        *count = 0;
        return NULL;
    }
    *count = (dex->data->offsets[file + 1] - dex->data->offsets[file]) / sizeof(HabitatDexEntry);
    return (const HabitatDexEntry *)(base + dex->data->offsets[file]);
}

static BOOL HabitatDex_Matches(HabitatDex *dex, const HabitatDexEntry *entry) {
    u8 season = dex->filters[HABITAT_DEX_FILTER_SEASON];
    u8 time = dex->filters[HABITAT_DEX_FILTER_TIME];
    u8 weather = dex->filters[HABITAT_DEX_FILTER_WEATHER];

    if (season != 0 && !(entry->seasons & (1 << (season - 1)))) {
        return FALSE;
    }
    if (time != 0 && !(entry->times & (1 << (time - 1)))) {
        return FALSE;
    }
    if (weather != 0 && entry->weather != 0 && !(entry->weather & sWeatherFilterBits[weather])) {
        return FALSE;
    }
    return TRUE;
}

// Whether a method lists an entry: all of them any of theirs, the others their own
static BOOL HabitatDex_IsListed(HabitatDex *dex, u32 method, const HabitatDexEntry *entry) {
    u32 i;

    if (method != HABITAT_DEX_METHOD_ALL) {
        return entry->method == sMethodTypes[method];
    }
    for (i = HABITAT_DEX_METHOD_ALL + 1; i < HABITAT_DEX_METHOD_COUNT; i++) {
        if (entry->method == sMethodTypes[i]) {
            return TRUE;
        }
    }
    return FALSE;
}

// The entries are sorted by method, then rarity: a Pokémon is listed once, at its first entry that matches
void PaperWhite2_HabitatDex_Fill(HabitatDex *dex, u32 file, PokeDexSave *pokedex) {
    u32 count, i, j;
    const HabitatDexEntry *entries = HabitatDex_GetEntries(dex, file, &count);
    BOOL shown = FALSE;

    dex->count = 0;
    dex->unseen = 0;
    dex->terrain = HABITAT_DEX_TERRAIN_GRASS;
    if (count != 0) {
        dex->terrain = ((const u8 *)&dex->data->offsets[dex->data->count + 1])[file];
    }
    // The methods: all, then each that the area has
    dex->shownCount = 0;
    dex->shownMethods[dex->shownCount++] = HABITAT_DEX_METHOD_ALL;
    for (i = HABITAT_DEX_METHOD_ALL + 1; i < HABITAT_DEX_METHOD_COUNT; i++) {
        for (j = 0; j < count; j++) {
            if (entries[j].method == sMethodTypes[i]) {
                dex->shownMethods[dex->shownCount++] = i;
                if (i == dex->method) {
                    shown = TRUE;
                }
                break;
            }
        }
    }
    if (!shown) {
        dex->method = HABITAT_DEX_METHOD_ALL;
    }
    for (i = 0; i < count; i++) {
        const HabitatDexEntry *entry = &entries[i];
        BOOL listed = FALSE;

        if (!HabitatDex_IsListed(dex, dex->method, entry) || !HabitatDex_Matches(dex, entry)) {
            continue;
        }
        for (j = 0; j < dex->count; j++) {
            if (dex->list[j]->species == entry->species && dex->list[j]->form == entry->form) {
                listed = TRUE;
                break;
            }
        }
        if (listed) {
            continue;
        }
        if (!PokeDex_IsSeen(pokedex, entry->species)) {
            // An unseen Pokémon is counted once for each species
            for (j = 0; j < i; j++) {
                if (entries[j].species == entry->species && HabitatDex_IsListed(dex, dex->method, &entries[j]) &&
                    HabitatDex_Matches(dex, &entries[j])) {
                    break;
                }
            }
            if (j == i) {
                dex->unseen++;
            }
            continue;
        }
        if (dex->count < HABITAT_DEX_LIST_MAX) {
            dex->list[dex->count++] = entry;
        }
    }
    dex->pageCount = dex->count == 0 ? 1 : (dex->count + HABITAT_DEX_PAGE_SIZE - 1) / HABITAT_DEX_PAGE_SIZE;
    if (dex->page >= dex->pageCount) {
        dex->page = dex->pageCount - 1;
    }
    // An empty list says why in place of the grid: the Pokémon are all unseen, or none comes under the filters
    dex->note = HABITAT_DEX_NOTE_NONE;
    if (dex->count == 0 && dex->unseen != 0) {
        dex->note = HABITAT_DEX_NOTE_UNDISCOVERED;
    } else if (dex->count == 0 &&
               (dex->filters[HABITAT_DEX_FILTER_SEASON] != 0 || dex->filters[HABITAT_DEX_FILTER_TIME] != 0 ||
                dex->filters[HABITAT_DEX_FILTER_WEATHER] != 0)) {
        dex->note = HABITAT_DEX_NOTE_NO_MATCH;
    }
    HabitatDex_SetGridShown(dex, dex->note == HABITAT_DEX_NOTE_NONE);
}

u32 PaperWhite2_HabitatDex_GetKind(HabitatDex *dex) {
    if (dex->method == HABITAT_DEX_METHOD_ALL && dex->shownCount > 1) {
        return sMethodKinds[dex->shownMethods[1]];
    }
    return sMethodKinds[dex->method];
}

BOOL PaperWhite2_HabitatDex_HasKind(HabitatDex *dex, u32 file, u32 kind) {
    u32 count, i, j;
    const HabitatDexEntry *entries = HabitatDex_GetEntries(dex, file, &count);

    if (kind >= KIND_COUNT) {
        return FALSE;
    }
    for (i = 0; i < count; i++) {
        for (j = HABITAT_DEX_METHOD_ALL + 1; j < HABITAT_DEX_METHOD_COUNT; j++) {
            if (sMethodKinds[j] == kind && sMethodTypes[j] == entries[i].method) {
                return TRUE;
            }
        }
    }
    return FALSE;
}

u32 PaperWhite2_HabitatDex_GetSpecies(HabitatDex *dex, u16 *species, u32 max) {
    u32 count = 0;
    u32 i, j;

    for (i = 0; i < dex->count && count < max; i++) {
        for (j = 0; j < count && species[j] != dex->list[i]->species; j++) {
        }
        if (j == count) {
            species[count++] = dex->list[i]->species;
        }
    }
    return count;
}

const HabitatDexEntry *PaperWhite2_HabitatDex_GetCell(HabitatDex *dex, u32 cell) {
    u32 index = dex->page * HABITAT_DEX_PAGE_SIZE + cell;

    return cell < HABITAT_DEX_PAGE_SIZE && index < dex->count ? dex->list[index] : NULL;
}

u32 PaperWhite2_HabitatDex_GetPageCount(HabitatDex *dex) {
    u32 first = dex->page * HABITAT_DEX_PAGE_SIZE;
    u32 left = dex->count > first ? dex->count - first : 0;

    return left < HABITAT_DEX_PAGE_SIZE ? left : HABITAT_DEX_PAGE_SIZE;
}

BOOL PaperWhite2_HabitatDex_TurnPage(HabitatDex *dex, int direction) {
    int page = dex->page + direction;

    if (page < 0 || page >= dex->pageCount) {
        return FALSE;
    }
    dex->page = page;
    return TRUE;
}

BOOL PaperWhite2_HabitatDex_StepMethod(HabitatDex *dex, int direction) {
    u32 i;

    if (dex->shownCount <= 1) {
        return FALSE;
    }
    for (i = 0; i < dex->shownCount && dex->shownMethods[i] != dex->method; i++) {
    }
    i = (i + dex->shownCount + direction) % dex->shownCount;
    dex->method = dex->shownMethods[i];
    dex->page = 0;
    return TRUE;
}

// ------------------------------------------------------------------------------------------------ The grid

// The grid on the list's BG over the inside of the original's box (screen 128's tiles 2-29 of rows 6-20; its frame,
// tiles 0-1 and 30-31, stays), at the cells' places (paperwhite2/habitat_dex.h), drawn into characters of its own after
// the bar's in palette row 9 as the original's. A cell's box has the original's look (screen 128's characters 35, 36,
// 40 and 41): a corner pixel cut, a light line one pixel in with a shaded pixel at each corner, and the box's colour
// within. The gaps' colour is the same in rows 9 to 11, so a cell's palette (its state) leaves its tiles' gap alone
#define GRID_TILE_X 2
#define GRID_TILE_Y 6
#define GRID_TILES_ACROSS 28
#define GRID_TILES_DOWN 15
#define GRID_TILES (GRID_TILES_ACROSS * GRID_TILES_DOWN)
#define GRID_CHAR_OFFSET (BAR_CHAR_OFFSET + BAR_TILES_ACROSS * BAR_TILES_DOWN)
#define GRID_PALETTE 9
#define TILE_ROWS 8
#define TILE_SIZE (TILE_ROWS * sizeof(u32))
#define COLOR_LINE 1
#define COLOR_GAP 2
#define COLOR_SHADE 3
#define COLOR_BOX 4
// A tile's row of the gaps' colour
#define GRID_GAP_ROW 0x22222222

// The colour of the grid at x, y
static u32 HabitatDex_GetGridColor(int x, int y) {
    int column = (x - HABITAT_DEX_CELL_X(0)) / (HABITAT_DEX_CELL_WIDTH + HABITAT_DEX_CELL_GAP);
    int row = (y - HABITAT_DEX_ROW_Y(0)) / HABITAT_DEX_ROW_HEIGHT;
    int dx = x - HABITAT_DEX_CELL_X(column);
    int dy = y - HABITAT_DEX_ROW_Y(row) - HABITAT_DEX_CELL_INSET;
    int edge;

    if (x < HABITAT_DEX_CELL_X(0) || column >= POKEDEX_HABITAT_COLUMNS || dx >= HABITAT_DEX_CELL_WIDTH || dy < 0 ||
        dy >= HABITAT_DEX_CELL_HEIGHT) {
        return COLOR_GAP;
    }
    // How far in from the box's nearest side across and down, and from its nearest side
    if (dx >= HABITAT_DEX_CELL_WIDTH / 2) {
        dx = HABITAT_DEX_CELL_WIDTH - 1 - dx;
    }
    if (dy >= HABITAT_DEX_CELL_HEIGHT / 2) {
        dy = HABITAT_DEX_CELL_HEIGHT - 1 - dy;
    }
    edge = dx < dy ? dx : dy;
    if (edge == 0) {
        return dx == dy ? COLOR_GAP : COLOR_BOX;
    }
    if (dx == dy && edge <= 2) {
        return COLOR_SHADE;
    }
    return edge == 1 ? COLOR_LINE : COLOR_BOX;
}

void PaperWhite2_HabitatDex_LoadGrid(void) {
    u32 *pixels = GFL_HeapAllocate(HEAPID_POKEDEX_HABITAT, (GRID_TILES + 1) * TILE_SIZE, FALSE,
                                   "paperwhite2_habitat_dex.c", __LINE__);
    u16 *entries = GFL_HeapAllocate(HEAPID_POKEDEX_HABITAT, GRID_TILES * sizeof(u16), FALSE,
                                    "paperwhite2_habitat_dex.c", __LINE__);
    u32 count = 1;
    u32 tile;

    // The first character is the gaps' colour alone, which hides the grid (HabitatDex_SetGridShown), so there is room
    // for one more than the tiles
    MI_CpuFill32(pixels, GRID_GAP_ROW, TILE_SIZE);
    for (tile = 0; tile < GRID_TILES; tile++) {
        u32 *rows = &pixels[count * TILE_ROWS];
        int left = (GRID_TILE_X + tile % GRID_TILES_ACROSS) * 8;
        int top = (GRID_TILE_Y + tile / GRID_TILES_ACROSS) * 8;
        u32 i;
        u32 x;

        // The tile, then the first of the same (or it, a new character)
        for (i = 0; i < TILE_ROWS; i++) {
            rows[i] = 0;
            for (x = 0; x < 8; x++) {
                rows[i] |= HabitatDex_GetGridColor(left + x, top + i) << (x * 4);
            }
        }
        for (i = 0; i < count; i++) {
            u32 row;

            for (row = 0; row < TILE_ROWS; row++) {
                if (pixels[i * TILE_ROWS + row] != rows[row]) {
                    break;
                }
            }
            if (row == TILE_ROWS) {
                break;
            }
        }
        if (i == count) {
            count++;
        }
        entries[tile] = (GRID_CHAR_OFFSET + i) | GRID_PALETTE << 12;
    }
    GFL_BGSysLoadChar(2, pixels, count * TILE_SIZE, GRID_CHAR_OFFSET);
    GFL_BGSysLoadScrAreaAll(2, entries, GRID_TILE_X, GRID_TILE_Y, GRID_TILES_ACROSS, GRID_TILES_DOWN);
    GFL_BGSysQueueScrLoad(2);
    GFL_HeapFree(entries);
    GFL_HeapFree(pixels);
}

// Hides the grid under its gaps' colour (its first character), or draws it again
static void HabitatDex_SetGridShown(HabitatDex *dex, BOOL shown) {
    if (shown == !dex->gridHidden) {
        return;
    }
    if (shown) {
        PaperWhite2_HabitatDex_LoadGrid();
    } else {
        GFL_BGSysFillScrArea(BAR_BG, GRID_CHAR_OFFSET, GRID_TILE_X, GRID_TILE_Y, GRID_TILES_ACROSS, GRID_TILES_DOWN,
                             GRID_PALETTE);
        GFL_BGSysQueueScrLoad(BAR_BG);
    }
    dex->gridHidden = !shown;
}

// ------------------------------------------------------------------------------------------------ The bar

// Shows an icon (its grey copy's if grey) in one of the bar's OBJs, with its top left corner at x, y: its place in the
// icons' characters, and its palette proxy moved to its row
static void HabitatDex_ShowIcon(HabitatDex *dex, u32 slot, u32 icon, BOOL grey, int x, int y) {
    const u8 *rows = (const u8 *)dex->icons + ICON_ROWS_OFFSET;
    u32 image = (grey ? ICON_COUNT : 0) + icon;
    ClActor *actor = dex->iconActors[slot];
    NNSG2dImageProxy proxy;
    NNSG2dImagePaletteProxy paletteProxy;
    ClActorPos pos;

    ClActSys_GetCharProxy(dex->iconChars, &proxy);
    proxy.vramLocation.baseAddrOfVram[NNS_G2D_VRAM_TYPE_2DMAIN] += image * ICON_SIZE;
    ClActor_SetImageProxy(actor, &proxy);
    ClActor_GetPlttProxy(actor, &paletteProxy);
    paletteProxy.vramLocation.baseAddrOfVram[NNS_G2D_VRAM_TYPE_2DMAIN] = sIconObjRows[rows[image]] * PALETTE_SIZE;
    ClActor_SetPlttProxy(actor, &paletteProxy);
    ClActor_SetPalette(actor, 0, TRUE);
    pos.x = x + ICON_WIDTH / 2;
    pos.y = y + ICON_HEIGHT / 2;
    ClActor_SetSurfacePos(actor, &pos, CLACT_SURFACE_MAIN);
    ClActor_SetVisible(actor, TRUE);
}

// A filter's dots under its icon, whose left edge is at x
static void HabitatDex_DrawDots(GFLBitmap *bitmap, int x, u32 count, u32 chosen) {
    int top = DOT_CENTER_Y - (int)((count - 1) * DOT_PITCH + DOT_HEIGHT) / 2;
    u32 i;

    GFL_BitmapFillArea(bitmap, x + DOT_OFFSET_X, DOT_AREA_Y, DOT_WIDTH, DOT_AREA_HEIGHT, 0);
    for (i = 0; i < count; i++) {
        GFL_BitmapFillArea(bitmap, x + DOT_OFFSET_X, top + i * DOT_PITCH, DOT_WIDTH, DOT_HEIGHT,
                           i == chosen ? DOT_COLOR_CHOSEN : DOT_COLOR_OTHER);
    }
}

// The dots' tile rows of the window, from its bitmap to its characters
static void HabitatDex_LoadDots(PokedexHabitatGraphic *graphic) {
    BmpWin *window = graphic->windows[POKEDEX_HABITAT_WIN_MAIN];
    u32 across = BmpWin_GetSizeX(window);

    GFL_BGSysLoadChar(BmpWin_GetBGIndex(window),
                      GFL_BitmapGetPixelData(BmpWin_GetBitmap(window)) + DOT_TILE_ROW * across * TILE_SIZE,
                      DOT_TILE_ROWS * across * TILE_SIZE, BmpWin_GetCharPos(window) + DOT_TILE_ROW * across);
}

void PaperWhite2_HabitatDex_Print(HabitatDex *dex, PokedexHabitatGraphic *graphic) {
    GFLBitmap *bitmap = BmpWin_GetBitmap(graphic->windows[POKEDEX_HABITAT_WIN_MAIN]);
    u32 i;

    // The methods, the chosen one in colour, spread evenly over the top row's width
    for (i = 0; i < HABITAT_DEX_METHOD_COUNT; i++) {
        u32 method;
        u32 icon;

        if (i >= dex->shownCount) {
            ClActor_SetVisible(dex->iconActors[i], FALSE);
            continue;
        }
        method = dex->shownMethods[i];
        icon = method == HABITAT_DEX_METHOD_WALKING ? sTerrainIcons[dex->terrain] : sMethodIcons[method];
        HabitatDex_ShowIcon(dex, i, icon, method != dex->method,
                            TOP_LEFT + TOP_WIDTH * (2 * i + 1) / (2 * dex->shownCount) - ICON_WIDTH / 2, ICON_INSET_Y);
    }
    // The filters, "any" or their value
    for (i = 0; i < HABITAT_DEX_FILTER_COUNT; i++) {
        u32 icon = dex->filters[i] == 0 ? ICON_ANY : sFilterIcons[i] + dex->filters[i] - 1;

        HabitatDex_ShowIcon(dex, HABITAT_DEX_METHOD_COUNT + i, icon, FALSE, FILTER_X + FILTER_PITCH * i, FILTER_Y);
    }
    // The page between the arrows, and the grid's note cleared, both sent with the page's place
    GFL_BitmapFillArea(bitmap, NOTE_LEFT, NOTE_Y, NOTE_WIDTH, LINE_HEIGHT, 0);
    PokedexHabitatGraphic_ClearArea(WINDOW_MAIN, graphic, PAGE_X - PAGE_WIDTH / 2, PAGE_Y, PAGE_WIDTH, LINE_HEIGHT);
    if (dex->pageCount > 1) {
        StrBuf *text = GFL_StrBufCreate(0x20, dex->heapId);
        WordSet *wordSet = GFL_WordSetSystemCreateDefault(dex->heapId);
        StrBuf *format = GFL_MsgDataLoadStrbufNew(dex->msgData, Dexnav_Text_Page);
        u32 width;

        WordSetNumber(wordSet, 0, dex->page + 1, 2, 0, TRUE);
        WordSetNumber(wordSet, 1, dex->pageCount, 2, 0, TRUE);
        GFL_WordSetFormatStrbuf(wordSet, text, format);
        width = GFL_FontGetBlockWidth(text, graphic->font, 0);
        PokedexHabitatGraphic_Print(WINDOW_MAIN, text, graphic, PAGE_X - width / 2, PAGE_Y, width, LINE_HEIGHT,
                                    COLOR_PLAIN);
        GFL_StrBufFree(format);
        GFL_WordSetSystemFree(wordSet);
        GFL_StrBufFree(text);
    }
    // The note where the grid is empty
    if (dex->note != HABITAT_DEX_NOTE_NONE) {
        StrBuf *note = GFL_MsgDataLoadStrbufNew(dex->msgData, dex->note == HABITAT_DEX_NOTE_UNDISCOVERED
                                                                  ? Dexnav_Text_Undiscovered
                                                                  : Dexnav_Text_NoneUnderConditions);
        u32 width = GFL_FontGetBlockWidth(note, graphic->font, 0);

        PokedexHabitatGraphic_Print(WINDOW_MAIN, note, graphic, NOTE_LEFT + (NOTE_WIDTH - width) / 2, NOTE_Y, width,
                                    LINE_HEIGHT, COLOR_NOTE);
        GFL_StrBufFree(note);
    }
    // The filters' dots, sent in the VBlank with their icons
    for (i = 0; i < HABITAT_DEX_FILTER_COUNT; i++) {
        HabitatDex_DrawDots(bitmap, FILTER_X + FILTER_PITCH * i, sFilterCounts[i], dex->filters[i]);
    }
    dex->dotsPending = TRUE;
}

u32 PaperWhite2_HabitatDex_Touch(HabitatDex *dex, u32 x, u32 y) {
    u32 i;

    if (y < ROW_HEIGHT) {
        if (x >= TOP_LEFT && x < TOP_LEFT + TOP_WIDTH) {
            u32 method = dex->shownMethods[(x - TOP_LEFT) * dex->shownCount / TOP_WIDTH];

            if (method != dex->method) {
                dex->method = method;
                dex->page = 0;
                return HABITAT_DEX_TOUCH_METHOD;
            }
        }
    } else if (y < ROW_HEIGHT * 2 && x >= FILTER_X) {
        i = (x - FILTER_X) / FILTER_PITCH;
        if (i < HABITAT_DEX_FILTER_COUNT) {
            dex->filters[i] = (dex->filters[i] + 1) % sFilterCounts[i];
            dex->page = 0;
            return HABITAT_DEX_TOUCH_FILTER;
        }
    }
    return HABITAT_DEX_TOUCH_NONE;
}
