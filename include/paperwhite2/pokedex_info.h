#ifndef POKEBW2_PAPERWHITE2_POKEDEX_INFO_H
#define POKEBW2_PAPERWHITE2_POKEDEX_INFO_H

#include "types.h"
#include "app/pokedex_detail.h"
#include "app/pokedex_info.h"
#include "gfl/bmp.h"
#include "gfl/clact.h"
#include "gfl/heap.h"
#include "nitro/gx.h"
#include "save/pokedex_savedata.h"
#include "struct_decls.h"
#include "system/gf_font.h"

// Paper White 2's info page of the Pokédex's detail screen, in overlay 298 (docs/paperwhite2/design/pokedex.md). The
// top screen shows the Pokémon's entry, as the original's bottom screen did, with its sprite animated; the bottom
// screen shows the sub-pages Stats, Data, Moves, Evo, Area and Matchups, which Left and Right cycle, and L and R Moves'
// sets too; Area shows the town map with the Pokémon's places in place of the entry

// The page (paperwhite2_pokedex_info.c), which POKEDEX_DETAIL_INFO_PROC_FUNCS runs in place of the original's
BOOL PokedexInfoPage_Init(PokedexDetailProcSys *sys, int *seq, void *param, void *work, PokedexDetailCommon *common);
BOOL PokedexInfoPage_Main(PokedexDetailProcSys *sys, int *seq, void *param, void *work, PokedexDetailCommon *common);
BOOL PokedexInfoPage_Exit(PokedexDetailProcSys *sys, int *seq, void *param, void *work, PokedexDetailCommon *common);
void PokedexInfoPage_Command(PokedexDetailProcSys *sys, int *seq, void *param, void *work, PokedexDetailCommon *common,
                             int command);
void PokedexInfoPage_Draw(PokedexDetailProcSys *sys, int *seq, void *param, void *work, PokedexDetailCommon *common);

// The bottom screen's panels (paperwhite2_pokedex_info_panels.c): the grid behind them, the bar of the sub-pages'
// tabs, and each sub-page's panel, read from the species' personal data

enum {
    POKEDEX_INFO_SUBPAGE_STATS,
    POKEDEX_INFO_SUBPAGE_DATA,
    POKEDEX_INFO_SUBPAGE_MOVES,
    POKEDEX_INFO_SUBPAGE_EVO,
    POKEDEX_INFO_SUBPAGE_AREA,
    POKEDEX_INFO_SUBPAGE_MATCHUPS,
    POKEDEX_INFO_SUBPAGE_COUNT,
};

// Moves' sets, in their bar's order
enum {
    POKEDEX_INFO_MOVES_LEVEL_UP,
    POKEDEX_INFO_MOVES_MACHINES,
    POKEDEX_INFO_MOVES_TUTOR,
    POKEDEX_INFO_MOVES_EGG,
    POKEDEX_INFO_MOVES_SET_COUNT,
};

// The rows Moves shows at once, and the most moves a set can have: a species has at most 101 TMs and HMs
#define POKEDEX_INFO_MOVE_ROWS 5
#define POKEDEX_INFO_MOVES_MAX 128

typedef struct {
    u16 move;
    // What the row's end shows: the level, the machine's bit (PML_ItemGetTMBitMask's), the tutor's place (a PLACE_*),
    // or nothing for an egg move
    u16 detail;
} PokedexInfoMove;

// A set of the shown form's moves, the one the cursor is on and the first of the rows
typedef struct {
    u32 set;
    u32 count;
    u32 cursor;
    u32 scroll;
    PokedexInfoMove moves[POKEDEX_INFO_MOVES_MAX];
} PokedexInfoMoves;

// paperwhite2_pokedex_info_moves.c: the sets, read from the species' learnset, personal data and egg moves, the cursor
// on the first
void PokedexInfoMoves_Load(PokedexInfoMoves *moves, u32 set, u16 species, u16 form, HeapID heapId);
// Moves the cursor by delta, scrolling to keep it shown; FALSE at the list's ends, where it stops
BOOL PokedexInfoMoves_MoveCursor(PokedexInfoMoves *moves, int delta);
// Scrolls the list of a set longer than its rows, the cursor staying on its row; FALSE if the scroll is unchanged
BOOL PokedexInfoMoves_SetScroll(PokedexInfoMoves *moves, u32 scroll);
// Puts the cursor on a shown row; FALSE for a row without a move
BOOL PokedexInfoMoves_SelectRow(PokedexInfoMoves *moves, u32 row);

// The sub engine's BG that the page's buttons and the user's art are on, under the panels' BG and over the grid, its
// priority, and the buttons' pair of palettes (the cursor's, then the others'), for AppTaskMenuRes_Create
#define POKEDEX_INFO_BUTTON_BG 6
#define POKEDEX_INFO_ART_PRIORITY 2
#define POKEDEX_INFO_BUTTON_PALETTE 4

typedef struct PokedexInfoPanels PokedexInfoPanels;

// font is the detail screen's font 0; the panels load font 1 for their small text. unit has the Matchups' type icons,
// Moves' icons, cursor and scroll knob and Evo's party icons; moves is the set that Moves shows, the page's; pokedex
// says which of Evo's species have been seen and caught
PokedexInfoPanels *PokedexInfoPanels_Create(HeapID heapId, Font *font, ClActUnit *unit, const PokedexInfoMoves *moves,
                                            PokeDexSave *pokedex);
void PokedexInfoPanels_Free(PokedexInfoPanels *panels);
// Shows the sub-page's art on POKEDEX_INFO_BUTTON_BG, replacing its whole screen, or clears it for a sub-page without
// art; the page makes its buttons after it
void PokedexInfoPanels_LoadArt(PokedexInfoPanels *panels, u32 subpage);
// How many pixels BG POKEDEX_INFO_BUTTON_BG is scrolled up while the sub-page shows, so its buttons show that much
// higher than their tiles, and are touched there
u32 PokedexInfoPanels_GetLift(u32 subpage);
// Scrolls the grid
void PokedexInfoPanels_Update(PokedexInfoPanels *panels);
// Draws the bar with the sub-page's tab, and the sub-page's panel of the species and form. caught shows what the
// Pokédex shows only once it has been caught; Matchups applies ability's effect (an ABILITY_*, or ABILITY_NONE) and
// shows the type icons, Moves its set and Evo its family's icons in the form and sex, which the other sub-pages hide
void PokedexInfoPanels_Show(PokedexInfoPanels *panels, u32 subpage, u16 species, u16 form, u16 sex, BOOL caught,
                            u32 ability);
// Draws Moves' list again, after its cursor moved
void PokedexInfoPanels_ShowMoves(PokedexInfoPanels *panels);
// The sub-page whose tab in the bar is touched this frame, or POKEDEX_INFO_SUBPAGE_COUNT
u32 PokedexInfoPanels_GetTouchedSubpage(void);
// Moves' set whose name is touched this frame, or POKEDEX_INFO_MOVES_SET_COUNT, and its row, or POKEDEX_INFO_MOVE_ROWS
u32 PokedexInfoPanels_GetTouchedMoveSet(void);
u32 PokedexInfoPanels_GetTouchedMoveRow(void);
// Whether Moves' scroll bar is touched this frame, and, while a touch is held, the scroll of a set longer than its rows
// at its place on the bar; FALSE once it lets go
BOOL PokedexInfoPanels_IsMoveTrackTouched(void);
BOOL PokedexInfoPanels_GetHeldMoveScroll(PokedexInfoPanels *panels, u32 *scroll);
// The species of Evo's family whose icon in the strip or row in the tree is touched this frame, or SPECIES_NONE
u16 PokedexInfoPanels_GetTouchedEvoSpecies(PokedexInfoPanels *panels);
// Whether an ability changes what the Matchups chart shows (its rules in sMatchupRules)
BOOL PokedexInfoPanels_IsMatchupAbility(u32 ability);
// A message of the panels' bank, for the page's buttons; the caller frees it
StrBuf *PokedexInfoPanels_LoadMessage(PokedexInfoPanels *panels, u32 messageId);
// Font 1, for the page's buttons whose text font 0 makes too wide
Font *PokedexInfoPanels_GetSmallFont(PokedexInfoPanels *panels);

// Evo (paperwhite2_pokedex_info_evo.c): the species' family, a strip of their party icons and a tree of them with how
// each evolves, drawn into the panels' content window, from the family's root (tools/paperwhite2/pokedex_evo.py)

// The most species a family has (Eevee's), as tools/paperwhite2/pokedex_evo.py checks
#define POKEDEX_INFO_EVO_FAMILY_MAX 8

typedef struct PokedexInfoEvo PokedexInfoEvo;

// fonts are font 0 and font 1
PokedexInfoEvo *PokedexInfoEvo_Create(HeapID heapId, Font *font, Font *smallFont, ClActUnit *unit,
                                      PokeDexSave *pokedex);
// The window's palette while Evo shows, the balls' colors (16), which the panels load into its row
const GXRgb *PokedexInfoEvo_GetPalette(PokedexInfoEvo *evo);
void PokedexInfoEvo_Free(PokedexInfoEvo *evo);
// Draws the family of the species into bitmap, a window whose top is top pixels down the screen, and shows its icons
// (in the form and sex where they have them), loading their resources if they aren't
void PokedexInfoEvo_Show(PokedexInfoEvo *evo, GFLBitmap *bitmap, int top, u16 species, u16 form, u16 sex);
// Frees the icons and their resources, while another sub-page shows
void PokedexInfoEvo_Hide(PokedexInfoEvo *evo);
u16 PokedexInfoEvo_GetTouchedSpecies(PokedexInfoEvo *evo);

// Area (paperwhite2_pokedex_info_area.c): where the species is met in the wild, from the index that
// tools/paperwhite2/encounters.py builds of the wild encounters. The top screen shows the town map in place of the
// entry, its places glowing in their seasons' colours, and the bottom screen the seasons, the methods with their
// levels, rarities and rates, the times and the weathers, drawn into the panels' content window, with icons as sub
// OBJs in palette rows of their own (POKEDEX_INFO_AREA_ICON_ROW_*)

// The sub engine's OBJ palette rows of the icons, loaded in the VBlank as Area shows: two that no sub-page uses, and
// Moves' knob's and cursor's (the panels' PALETTE_KNOB and PALETTE_CURSOR), whose colours Area puts back as it hides
#define POKEDEX_INFO_AREA_ICON_ROW_0 14
#define POKEDEX_INFO_AREA_ICON_ROW_1 15
#define POKEDEX_INFO_AREA_ICON_ROW_2 4
#define POKEDEX_INFO_AREA_ICON_ROW_3 3

typedef struct PokedexInfoArea PokedexInfoArea;

// fonts are font 0 and font 1; unit is the page's, for the icons' OBJs
PokedexInfoArea *PokedexInfoArea_Create(HeapID heapId, Font *font, Font *smallFont, ClActUnit *unit);
void PokedexInfoArea_Free(PokedexInfoArea *area);
// Draws the species' places and methods into bitmap, a window whose top is top pixels down the screen, and shows its
// icons, loading their resources if they aren't
void PokedexInfoArea_Draw(PokedexInfoArea *area, GFLBitmap *bitmap, int top, u16 species);
// Whether the species drawn last shows only a message, not found in the wild or not on the map
BOOL PokedexInfoArea_IsEmpty(PokedexInfoArea *area);
// Frees the icons and their resources, while another sub-page shows
void PokedexInfoArea_Hide(PokedexInfoArea *area);
// The map on the top screen, over the entry, whose text it frees until it closes; it shows from the next VBlank. now
// closes it at once, while the screen is dark, without the entry's panels, which the page's end doesn't need
void PokedexInfoArea_OpenMap(PokedexInfoArea *area, PokedexInfo *entry, ClActUnit *unit, GameData *gameData,
                             PokedexDetailBlend *blend);
void PokedexInfoArea_CloseMap(PokedexInfoArea *area, PokedexInfo *entry, u32 language, BOOL now);
BOOL PokedexInfoArea_IsMapOpen(PokedexInfoArea *area);
// Shows the places of the species drawn last on the open map
void PokedexInfoArea_ShowPlaces(PokedexInfoArea *area);
// The current Pokémon's box over the head bar's right end while the map is open: its party icon and name
void PokedexInfoArea_ShowPokemon(PokedexInfoArea *area, u16 species, u16 form, u16 sex);
// Each frame: the shaking rows' icons, and while the map is open its glow and the season it shows
void PokedexInfoArea_Update(PokedexInfoArea *area);
// The panels' Area, and its update each frame but while the page fades
PokedexInfoArea *PokedexInfoPanels_GetArea(PokedexInfoPanels *panels);
void PokedexInfoPanels_UpdateArea(PokedexInfoPanels *panels);

// The move panel over the top screen (paperwhite2_pokedex_move_panel.c): a move's name, type, category, numbers and
// description over the entry, whose text it takes the place of while it is open, with the rest of the screen dimmed

typedef struct PokedexMovePanel PokedexMovePanel;

// font is font 0, unit the detail screen's actors' (for the type and category icons), blend the top screen's, whose
// brightness the panel restores as it closes
PokedexMovePanel *PokedexMovePanel_Create(HeapID heapId, Font *font, ClActUnit *unit, PokedexDetailBlend *blend);
void PokedexMovePanel_Free(PokedexMovePanel *panel);
// Opens the panel over the entry with the move, or shows another move if it is open
void PokedexMovePanel_Show(PokedexMovePanel *panel, PokedexInfo *entry, u16 move);
// Closes it, if it is open, and prints the entry again in the language
void PokedexMovePanel_Close(PokedexMovePanel *panel, PokedexInfo *entry, u32 language);
BOOL PokedexMovePanel_IsOpen(PokedexMovePanel *panel);

#endif // POKEBW2_PAPERWHITE2_POKEDEX_INFO_H
