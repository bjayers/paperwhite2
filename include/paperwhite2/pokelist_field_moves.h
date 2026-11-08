#ifndef POKEBW2_PAPERWHITE2_POKELIST_FIELD_MOVES_H
#define POKEBW2_PAPERWHITE2_POKELIST_FIELD_MOVES_H

#include "types.h"
#include "app/pokelist.h"

// Paper White 2: the party list's menu has FIELD MOVES, which opens a menu of the moves usable outside battle that the
// Pokémon knows, then the HMs' field moves that it can learn while the HM is in the bag, and using a learnable one
// works as using a known one (src/paperwhite2/ov165/paperwhite2_pokelist_field_moves.c, for plist_menu.c and
// plist_sys.c). See docs/paperwhite2/plugins.md, HMs by learners

// The menu item of an HM's move that the Pokémon can learn, plus the HM's number from 0 (HM01 Cut to HM06 Dive), after
// the original's items (0 to 23) and their waiting value, 0x19
#define POKELIST_MENU_LEARNABLE_HM 26
#define POKELIST_MENU_LEARNABLE_HM_COUNT 6
// The menu items FIELD MOVES, under SUMMARY and POKéDEX, which opens the field moves' menu, and that menu's CANCEL,
// which goes back to the Pokémon's menu
#define POKELIST_MENU_FIELD_MOVES 32
#define POKELIST_MENU_FIELD_MOVES_BACK 33

// Whether the Pokémon has a move for the field moves' menu: a known move usable outside battle or a learnable HM
BOOL PaperWhite2_PokeList_HasFieldMoves(PokeListWork *wk);

// Adds the learnable HMs' items to a menu's items after its count, at most room of them, and gives the new count. The
// moves that can be used where the player stands come first when they don't all fit, then the HMs' order
u32 PaperWhite2_PokeList_AddLearnableHMs(PokeListWork *wk, u16 *items, u32 count, u32 room);
// Whether the menu item is a learnable HM's
BOOL PaperWhite2_PokeList_IsLearnableHMItem(u32 item);
// The move of a learnable HM's menu item
u16 PaperWhite2_PokeList_GetLearnableHMMove(u32 item);
// The result that a menu item of the moves outside battle ends the list with, as PokeList_GetHMResult gives for a
// known move's item (POKELIST_MENU_MOVE1 + its slot), or 0
u32 PaperWhite2_PokeList_GetMenuHMResult(PokeListWork *wk, u32 item);

#endif // POKEBW2_PAPERWHITE2_POKELIST_FIELD_MOVES_H
