#ifndef PAPERWHITE2_HABITAT_DEX_H
#define PAPERWHITE2_HABITAT_DEX_H

#include "types.h"
#include "app/pokedex_habitat_graphic.h"
#include "gfl/heap.h"
#include "gfl/msg.h"
#include "save/pokedex_savedata.h"

// Paper White 2: the Habitat Dex, the Pokédex's Habitat List (src/ov303/pokedex_habitat.c) on the wild encounters'
// data (docs/paperwhite2/encounters.md). Each area's Pokémon by one of its kinds of habitat (land, water, fishing) come
// from the Habitat Dex's lists, which tools/paperwhite2/encounters.py writes from the encounter data beside the Habitat
// List's areas, as the member after them: every Pokémon, not the original list's 30, in pages of 20, filtered by
// method (tabs: all, or one of the kind's), season, time and weather, each "any" by default. The screen's text box
// shows the tabs and the filters, which a touch changes. The map, the areas and the stamps stay the original's

// The member after the Habitat List's areas (tools/data/habitat_data.py AREAS), its magic "PHDX" and version
#define HABITAT_DEX_MEMBER 58
#define HABITAT_DEX_MAGIC 0x58444850
#define HABITAT_DEX_VERSION 1

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

typedef struct {
    u32 magic;
    u16 version;
    u16 count;
    // Each area's entries' offset from the start, and the end's
    u32 offsets[];
} HabitatDexHeader;

// The filters: season, time and weather, each 0 for any, else 1 + its value
enum {
    HABITAT_DEX_FILTER_SEASON,
    HABITAT_DEX_FILTER_TIME,
    HABITAT_DEX_FILTER_WEATHER,
    HABITAT_DEX_FILTER_COUNT,
};

// A page of the list: the original's cells that a touch reaches, in rows of POKEDEX_HABITAT_COLUMNS
#define HABITAT_DEX_PAGE_SIZE 20
// The most Pokémon of one list, and the most tabs: all and a kind's methods
#define HABITAT_DEX_LIST_MAX 160
#define HABITAT_DEX_TAB_MAX 4

typedef struct {
    const HabitatDexHeader *data;
    MsgData *msgData;
    // The chosen tab: 0 for all the kind's methods, else 1 + an index into the tabs' methods
    u8 tab;
    u8 page;
    u8 pageCount;
    u8 tabCount;
    u8 tabMethods[HABITAT_DEX_TAB_MAX];
    u8 filters[HABITAT_DEX_FILTER_COUNT];
    // The seen Pokémon of the list, as the area's entries, and how many of the list the player hasn't seen
    u16 count;
    u16 unseen;
    const HabitatDexEntry *list[HABITAT_DEX_LIST_MAX];
    // Where the text box's tabs and filters are, in pixels, for touches
    u16 tabX[HABITAT_DEX_TAB_MAX + 1];
    u16 filterX[HABITAT_DEX_FILTER_COUNT + 1];
} HabitatDex;

// Reads the lists and the text, with every filter on any
void PaperWhite2_HabitatDex_Init(HabitatDex *dex, HeapID heapId);
void PaperWhite2_HabitatDex_Free(HabitatDex *dex);
// Back to all the methods and the first page, for another area or kind of habitat
void PaperWhite2_HabitatDex_Reset(HabitatDex *dex);
// Builds the list of an area (its Habitat List file) by a kind of habitat (0 land, 1 water, 2 fishing), with the tabs
// and the pages
void PaperWhite2_HabitatDex_Fill(HabitatDex *dex, u32 file, u32 kind, PokeDexSave *pokedex);
// The entry of a cell of the page, or NULL
const HabitatDexEntry *PaperWhite2_HabitatDex_GetCell(HabitatDex *dex, u32 cell);
// The Pokémon on the page
u32 PaperWhite2_HabitatDex_GetPageCount(HabitatDex *dex);
// Turns the page by a direction; FALSE at the end, or with one page. The caller fills the list again
BOOL PaperWhite2_HabitatDex_TurnPage(HabitatDex *dex, int direction);
// The next tab, after the last the first; FALSE with only one
BOOL PaperWhite2_HabitatDex_NextTab(HabitatDex *dex);
// Prints the tabs, the page and the filters in the screen's text box
void PaperWhite2_HabitatDex_Print(HabitatDex *dex, PokedexHabitatGraphic *graphic);
// A touch on the text box: a tab chooses it, a filter takes its next value. TRUE when the list changes
BOOL PaperWhite2_HabitatDex_Touch(HabitatDex *dex, u32 x, u32 y);

#endif // PAPERWHITE2_HABITAT_DEX_H
