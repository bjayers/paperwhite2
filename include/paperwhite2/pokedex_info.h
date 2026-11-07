#ifndef POKEBW2_PAPERWHITE2_POKEDEX_INFO_H
#define POKEBW2_PAPERWHITE2_POKEDEX_INFO_H

#include "types.h"
#include "app/pokedex_detail.h"
#include "gfl/clact.h"
#include "gfl/heap.h"
#include "system/gf_font.h"

// Paper White 2's info page of the Pokédex's detail screen, in overlay 298 (docs/paperwhite2/design/pokedex.md). The
// top screen shows the Pokémon's entry, as the original's bottom screen did, with its sprite animated; the bottom
// screen shows the sub-pages Stats, Data and Matchups, which L and R cycle

// The page (paperwhite2_pokedex_info.c), which POKEDEX_DETAIL_INFO_PROC_FUNCS runs in place of the original's
BOOL PokedexInfoPage_Init(PokedexDetailProcSys *sys, int *seq, void *param, void *work, PokedexDetailCommon *common);
BOOL PokedexInfoPage_Main(PokedexDetailProcSys *sys, int *seq, void *param, void *work, PokedexDetailCommon *common);
BOOL PokedexInfoPage_Exit(PokedexDetailProcSys *sys, int *seq, void *param, void *work, PokedexDetailCommon *common);
void PokedexInfoPage_Command(PokedexDetailProcSys *sys, int *seq, void *param, void *work, PokedexDetailCommon *common,
                             int command);
void PokedexInfoPage_Draw(PokedexDetailProcSys *sys, int *seq, void *param, void *work, PokedexDetailCommon *common);

// The bottom screen's panels (paperwhite2_pokedex_info_panels.c): the grid behind them, the bar of the sub-pages'
// names, and each sub-page's panel, read from the species' personal data

enum {
    POKEDEX_INFO_SUBPAGE_STATS,
    POKEDEX_INFO_SUBPAGE_DATA,
    POKEDEX_INFO_SUBPAGE_MATCHUPS,
    POKEDEX_INFO_SUBPAGE_COUNT,
};

// The sub engine's BG that the page's buttons and the user's art are on, under the panels' BG and over the grid, its
// priority, and the buttons' pair of palettes (the cursor's, then the others'), for AppTaskMenuRes_Create
#define POKEDEX_INFO_BUTTON_BG 6
#define POKEDEX_INFO_ART_PRIORITY 2
#define POKEDEX_INFO_BUTTON_PALETTE 4

typedef struct PokedexInfoPanels PokedexInfoPanels;

// font is the detail screen's font 0; the panels load font 1 for their small text. unit has the Matchups' type icons
PokedexInfoPanels *PokedexInfoPanels_Create(HeapID heapId, Font *font, ClActUnit *unit);
void PokedexInfoPanels_Free(PokedexInfoPanels *panels);
// Shows the sub-page's art on POKEDEX_INFO_BUTTON_BG, replacing its whole screen, or clears it for a sub-page without
// art; the page makes its buttons after it
void PokedexInfoPanels_LoadArt(PokedexInfoPanels *panels, u32 subpage);
// Scrolls the grid
void PokedexInfoPanels_Update(PokedexInfoPanels *panels);
// Draws the bar with the sub-page bright, and the sub-page's panel of the species and form. caught shows what the
// Pokédex shows only once it has been caught; Matchups applies ability's effect (an ABILITY_*, or ABILITY_NONE) and
// shows the type icons, which the other sub-pages hide
void PokedexInfoPanels_Show(PokedexInfoPanels *panels, u32 subpage, u16 species, u16 form, BOOL caught, u32 ability);
// The sub-page whose name in the bar is touched this frame, or POKEDEX_INFO_SUBPAGE_COUNT
u32 PokedexInfoPanels_GetTouchedSubpage(void);
// A message of the panels' bank, for the page's buttons; the caller frees it
StrBuf *PokedexInfoPanels_LoadMessage(PokedexInfoPanels *panels, u32 messageId);
// Font 1, for the page's buttons whose text font 0 makes too wide
Font *PokedexInfoPanels_GetSmallFont(PokedexInfoPanels *panels);

#endif // POKEBW2_PAPERWHITE2_POKEDEX_INFO_H
