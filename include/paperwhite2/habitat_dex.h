#ifndef PAPERWHITE2_HABITAT_DEX_H
#define PAPERWHITE2_HABITAT_DEX_H

#include "types.h"
#include "app/pokedex_habitat_graphic.h"
#include "gfl/clact.h"
#include "gfl/heap.h"
#include "gfl/msg.h"
#include "save/pokedex_savedata.h"
#include "system/game_data.h"

// Paper White 2: the Habitat Dex, the Pokédex's Habitat List (src/ov303/pokedex_habitat.c) on the wild encounters'
// data (docs/paperwhite2/encounters.md). Each area's Pokémon come from the Habitat Dex's lists, which
// tools/paperwhite2/encounters.py writes from the encounter data beside the Habitat List's areas, as the member after
// them: every Pokémon, not the original list's 30, in pages of the grid's 30 (6 by 5), by one method or all of them,
// filtered by season, time and weather. The filter bar above the grid (the user's art, res/paperwhite2/pokedex_art/
// habitat_bar.png) shows the methods the area has as the Area icons (the chosen one in colour, the others grey),
// spread evenly over the top row, and the season, time and weather filters, each an icon that a touch cycles, "any"
// among them. The map, the areas and the stamps stay the original's

// The member after the Habitat List's areas (tools/data/habitat_data.py AREAS), its magic "PHDX" and version
#define HABITAT_DEX_MEMBER 58
#define HABITAT_DEX_MAGIC 0x58444850
#define HABITAT_DEX_VERSION 2

// An entry's flags: from an outbreak, with extra conditions the Pokédex can't tell, shaking grass's own species
#define HABITAT_DEX_FLAG_OUTBREAK 1
#define HABITAT_DEX_FLAG_RULE 2
#define HABITAT_DEX_FLAG_SPOTS 4

// One Pokémon by one method in an area: the bits follow SEASON_*, DAY_PERIOD_* and WEATHER_* (0 for any weather), and
// tier is its rarity's (0 the most common; an outbreak's is after them all)
typedef struct {
    u16 species;
    u8 form;
    // An ENCTYPE_*
    u8 method;
    u8 seasons;
    u8 times;
    u8 tier;
    u8 flags;
    u32 weather;
} HabitatDexEntry;

// The header; after the offsets, each area's walking terrain (a HABITAT_DEX_TERRAIN_*) as a byte, padded to 4 bytes
typedef struct {
    u32 magic;
    u16 version;
    u16 count;
    // Each area's entries' offset from the start, and the end's
    u32 offsets[];
} HabitatDexHeader;

// An area's walking terrain, as encounters.py's AREA_TERRAINS
enum {
    HABITAT_DEX_TERRAIN_GRASS,
    HABITAT_DEX_TERRAIN_CAVE_FLOOR,
    HABITAT_DEX_TERRAIN_SAND,
    HABITAT_DEX_TERRAIN_PUDDLE,
    HABITAT_DEX_TERRAIN_BRIDGE,
    HABITAT_DEX_TERRAIN_WALKING,
    HABITAT_DEX_TERRAIN_COUNT,
};

// The methods of the bar's top row, in its order: all of them together (the list's first, always shown), walking
// (grass, cave floor, sand or puddles, by the area's terrain), dark grass, surfing and fishing. No special methods
// (shaking grass, dust clouds, bridge shadows, rippling water)
enum {
    HABITAT_DEX_METHOD_ALL,
    HABITAT_DEX_METHOD_WALKING,
    HABITAT_DEX_METHOD_DARK_GRASS,
    HABITAT_DEX_METHOD_SURF,
    HABITAT_DEX_METHOD_FISHING,
    HABITAT_DEX_METHOD_COUNT,
};

// The filters: season, time and weather, each 0 for any, else 1 + its value
enum {
    HABITAT_DEX_FILTER_SEASON,
    HABITAT_DEX_FILTER_TIME,
    HABITAT_DEX_FILTER_WEATHER,
    HABITAT_DEX_FILTER_COUNT,
};

// What a touch on the bar changed
enum {
    HABITAT_DEX_TOUCH_NONE,
    HABITAT_DEX_TOUCH_METHOD,
    HABITAT_DEX_TOUCH_FILTER,
};

// A page of the list: the grid's cells, in rows of POKEDEX_HABITAT_COLUMNS
#define HABITAT_DEX_PAGE_SIZE POKEDEX_HABITAT_ICON_COUNT
// The grid's cells inside the original's box (x 14-241 within its border, y 48-167 down to the touch bar): boxes of
// HABITAT_DEX_CELL_WIDTH by HABITAT_DEX_CELL_HEIGHT, 37 px apart across from x 20 (7 px between them, a tile's edge
// in each gap, so that each cell has its own tiles for its palette), in rows of 3 tiles from y 48, each box
// HABITAT_DEX_CELL_INSET px down its row (4 px between the rows)
#define HABITAT_DEX_CELL_X(column) (20 + 37 * (column))
#define HABITAT_DEX_CELL_WIDTH 30
#define HABITAT_DEX_CELL_GAP 7
#define HABITAT_DEX_ROW_Y(row) (48 + 24 * (row))
#define HABITAT_DEX_ROW_HEIGHT 24
#define HABITAT_DEX_CELL_INSET 2
#define HABITAT_DEX_CELL_HEIGHT (HABITAT_DEX_ROW_HEIGHT - 2 * HABITAT_DEX_CELL_INSET)
// The most Pokémon of one list
#define HABITAT_DEX_LIST_MAX 160
// Why the grid is empty, said in its place: none (it isn't, or the area has no Pokémon), every Pokémon that the
// method and the filters list unseen, or none under the filters
enum {
    HABITAT_DEX_NOTE_NONE,
    HABITAT_DEX_NOTE_UNDISCOVERED,
    HABITAT_DEX_NOTE_NO_MATCH,
};

// The bar's icons: a top row's for each method, and the filters'
#define HABITAT_DEX_BAR_ICONS (HABITAT_DEX_METHOD_COUNT + HABITAT_DEX_FILTER_COUNT)

typedef struct {
    const HabitatDexHeader *data;
    MsgData *msgData;
    HeapID heapId;
    // The chosen method, a HABITAT_DEX_METHOD_*, and the methods the area has, in the bar's order (all first)
    u8 method;
    u8 shownCount;
    u8 shownMethods[HABITAT_DEX_METHOD_COUNT];
    // The area's walking terrain, a HABITAT_DEX_TERRAIN_*
    u8 terrain;
    u8 page;
    u8 pageCount;
    u8 filters[HABITAT_DEX_FILTER_COUNT];
    // The seen Pokémon of the list, as the area's entries, and how many of the list the player hasn't seen
    u16 count;
    u16 unseen;
    const HabitatDexEntry *list[HABITAT_DEX_LIST_MAX];
    // Why the list is empty (a HABITAT_DEX_NOTE_*), and whether the grid is hidden for it
    u8 note;
    BOOL gridHidden;
    // The bar: the Area icons' member (its palette rows, each icon's row and their tiles), their OBJ resources and
    // actors, and whether the VBlank is to load the rows' colours
    void *icons;
    u32 iconChars;
    u32 iconPalette;
    u32 iconCellAnims;
    ClActor *iconActors[HABITAT_DEX_BAR_ICONS];
    BOOL iconRowsPending;
    // Whether the VBlank is to send the filters' dots
    BOOL dotsPending;
} HabitatDex;

// Reads the lists and the text, with every filter on any and all the methods
void PaperWhite2_HabitatDex_Init(HabitatDex *dex, HeapID heapId);
void PaperWhite2_HabitatDex_Free(HabitatDex *dex);
// The bar, once the screen's graphics are made: its art on the list's BG above the grid, and its icons; every filter
// starts on any
void PaperWhite2_HabitatDex_InitBar(HabitatDex *dex, PokedexHabitatGraphic *graphic);
// The grid's cells on the list's BG (2), as the screen loads its BGs (pokedex_habitat_graphic.c)
void PaperWhite2_HabitatDex_LoadGrid(void);
// Before the screen's graphics go
void PaperWhite2_HabitatDex_FreeBar(HabitatDex *dex);
// In the VBlank: the icons' palette rows, and the filters' dots
void PaperWhite2_HabitatDex_VBlank(HabitatDex *dex, PokedexHabitatGraphic *graphic);
// Back to the first page, for another method
void PaperWhite2_HabitatDex_Reset(HabitatDex *dex);
// For another area: the first page, and every filter on any
void PaperWhite2_HabitatDex_NewArea(HabitatDex *dex);
// Builds the list of an area (its Habitat List file) by the chosen method (all where the area hasn't it), with the
// methods it has and the pages; an empty list hides the grid for a note (HABITAT_DEX_NOTE_*)
void PaperWhite2_HabitatDex_Fill(HabitatDex *dex, u32 file, PokeDexSave *pokedex);
// The kind of habitat of the chosen method (0 land, 1 water, 2 fishing), for the stamps; all the methods' is the first
// kind that the area has
u32 PaperWhite2_HabitatDex_GetKind(HabitatDex *dex);
// The grid's colours for the chosen method: its kind's (0 to 2, the original's), or All's grey or Dark Grass's darker
// green (PokedexHabitatGraphic_RequestPalette's type)
u32 PaperWhite2_HabitatDex_GetGridColors(HabitatDex *dex);
// The entry of a cell of the page, or NULL
const HabitatDexEntry *PaperWhite2_HabitatDex_GetCell(HabitatDex *dex, u32 cell);
// The Pokémon on the page
u32 PaperWhite2_HabitatDex_GetPageCount(HabitatDex *dex);
// Turns the page by a direction; FALSE at the end, or with one page. The caller fills the list again
BOOL PaperWhite2_HabitatDex_TurnPage(HabitatDex *dex, int direction);
// The next or previous method that the area has, around; FALSE with only one
BOOL PaperWhite2_HabitatDex_StepMethod(HabitatDex *dex, int direction);
// Shows the bar: the methods' and the filters' icons, and the page
void PaperWhite2_HabitatDex_Print(HabitatDex *dex, PokedexHabitatGraphic *graphic);
// A touch on the bar: a method chooses it, a filter takes its next value. A HABITAT_DEX_TOUCH_*
u32 PaperWhite2_HabitatDex_Touch(HabitatDex *dex, u32 x, u32 y);

// Whether an area (its Habitat List file) has any Pokémon by a kind of habitat, whatever the filters
BOOL PaperWhite2_HabitatDex_HasKind(HabitatDex *dex, u32 file, u32 kind);
// The species of the list, each once, for the Pokédex's page that Info opens
u32 PaperWhite2_HabitatDex_GetSpecies(HabitatDex *dex, u16 *species, u32 max);

// In main: the list that the Pokédex's page browses after Info, which the Habitat List leaves and the Pokédex takes
// once (PokedexCommon_LoadHabitatSpecies), in place of the original list's of the saved season. Leaving it also has
// the Info page open on its Area sub-page, once (PaperWhite2_HabitatDex_TakeInfoArea)
void PaperWhite2_HabitatDex_SetInfoList(const u16 *species, u32 count);
// The list, allocated, and its count; 0 when there is none
u32 PaperWhite2_HabitatDex_TakeInfoList(u16 **list, HeapID heapId);
// Whether the Info page opens on Area, as it does once after the Habitat List
BOOL PaperWhite2_HabitatDex_TakeInfoArea(void);

#endif // PAPERWHITE2_HABITAT_DEX_H
