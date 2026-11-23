#ifndef PAPERWHITE2_ICON_EXT_H
#define PAPERWHITE2_ICON_EXT_H

#include "types.h"
#include "nnsys/g2d.h"

// Paper White 2: party icons as 8bpp OBJs on OBJ extended palettes, for the screens that show more icons at once than
// they have free OBJ palette rows (docs/paperwhite2/design/icon-screens.md: the PC box, the Pokédex's list and its
// Habitat list). An extended palette is 256 colours, 16 bands of a row's 16: an icon draws in a band of its own, each
// pixel the band * 16 plus its 4bpp index, so that 0 stays clear. What a screen does:
// - maps a bank as OBJ extended palette in its VRAM banks (the next screen's banks unmap it);
// - sets its own copy of the icon cells to 8bpp, once loaded (PaperWhite2_IconExt_SetCells8bpp), and gives each icon
//   a character resource twice its 4bpp size;
// - writes each icon's characters made 8bpp in its band (PaperWhite2_IconExt_Convert) and its colours into the band;
// - copies the extended palettes to VRAM in its VBlank (PaperWhite2_IconExt_Upload), since writing one takes the bank
//   away from the 2D engine while it is written;
// - gives every other 8bpp OBJ of the engine its colours in an extended palette too: the engine reads them all there.

// The bands of an extended palette, and its colours
#define ICON_EXT_BANDS 16
#define ICON_EXT_COLOURS 256

// Sets a cell bank's OBJs to 8bpp: their colour mode, and their characters' names, which count units of the mapping's
// size and so double
void PaperWhite2_IconExt_SetCells8bpp(NNSG2dCellDataBank *cells);

// Writes size bytes of 4bpp characters into dest as 8bpp (size * 2 bytes) in band (0-15)
void PaperWhite2_IconExt_Convert(u8 *dest, const u8 *src, u32 size, u32 band);

// Copies size bytes of colours, from main RAM (not the stack: DMA can't read DTCM), to the main engine's OBJ extended
// palettes from offset bytes, or the sub engine's with sub. For a VBlank
void PaperWhite2_IconExt_Upload(const u16 *colours, u32 offset, u32 size, BOOL sub);

#endif // PAPERWHITE2_ICON_EXT_H
