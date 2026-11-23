#ifndef PAPERWHITE2_HABITAT_ICONS_H
#define PAPERWHITE2_HABITAT_ICONS_H

#include "types.h"
#include "app/pokedex_habitat_graphic.h"

// Paper White 2: the Habitat list's icons on their own battle colours, the species' normal ones
// (docs/paperwhite2/design/icon-screens.md, the Pokédex). The grid shows up to POKEDEX_HABITAT_ICON_COUNT (30) icons
// at once on the main engine, more than its free OBJ rows, so they are 8bpp OBJs on the main engine's OBJ extended
// palettes, in VRAM bank G: the icon of cell n draws in band n % 16 of extended palette n / 16. The colours are kept in
// the screen's palette fade, as its buffer of the main OBJ extended palettes, so that they fade with the screen, and go
// to VRAM in the VBlank that loads the icons.

// The icons' extended palettes, 0 and 1
#define HABITAT_ICONS_EXT_PALETTES 2
// An icon's two frames of 32 by 32 pixels, 4bpp as the icon archive has them and 8bpp as the grid draws them
#define HABITAT_ICONS_SIZE 0x400
#define HABITAT_ICONS_SIZE_8BPP 0x800

// Gives a cell's icon resources the room of an 8bpp icon, as they are made
void PaperWhite2_HabitatIcons_InitRes(UIObjRes *res);
// Sets the icons' cells to 8bpp and their actors to their extended palettes, once all are made
void PaperWhite2_HabitatIcons_Init(PokedexHabitatGraphic *graphic);
// Loads a Pokémon's icon into a cell's actor, with its colours; in the VBlank
void PaperWhite2_HabitatIcons_Load(PokedexHabitatGraphic *graphic, u8 cell, u32 species, u32 form, u32 sex);
// Copies the extended palettes to VRAM if they changed; the screen's VBlank, after the icons load
void PaperWhite2_HabitatIcons_VBlank(PokedexHabitatGraphic *graphic);

#endif // PAPERWHITE2_HABITAT_ICONS_H
