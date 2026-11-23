#ifndef PAPERWHITE2_POKEDEX_LIST_ICONS_H
#define PAPERWHITE2_POKEDEX_LIST_ICONS_H

#include "types.h"
#include "app/pokedex_list_main.h"

// Paper White 2: the Pokédex list's icons on their own battle colours, the species' normal ones
// (docs/paperwhite2/design/icon-screens.md, the Pokédex). Each screen has a pool of POKEDEX_LIST_ICON_COUNT icon
// actors, refilled as rows scroll in:
// - the touch screen shows up to 9 at once, more than its free OBJ rows, so its icons are 8bpp OBJs on the main
//   engine's OBJ extended palette 0, in VRAM bank G: icon actor n draws in band n. The colours are kept in the list's
//   palette fade, as its buffer of the main OBJ extended palettes, so that they fade with the screen, and go to VRAM in
//   the VBlank after they change;
// - the top screen shows up to 8 at once, and its OBJs use only the three bank rows, so each shown icon takes a row
//   of its own of the 15 that the list's fades darken (all but 14), written at once (its actor is hidden while it is
//   refilled, and no shown icon has the row), with the fade's buffer.

// The touch screen icons' extended palette
#define POKEDEX_LIST_ICON_EXT_PALETTE 0

// Sets the touch screen's icon cells to 8bpp and its icon actors to their extended palette, once they are made
void PaperWhite2_PokedexListIcons_Init(PokedexListWork *wk);

// Loads a species' icon over an icon actor's characters, with its colours, on the touch screen or the top screen
void PaperWhite2_PokedexListIcons_Load(PokedexListWork *wk, u32 id, u16 species, u16 form, u16 sex, BOOL touchScreen);

// Copies the touch screen icons' extended palette to VRAM if it changed; the list's VBlank
void PaperWhite2_PokedexListIcons_VBlank(PokedexListWork *wk);

#endif // PAPERWHITE2_POKEDEX_LIST_ICONS_H
