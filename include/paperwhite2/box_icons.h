#ifndef PAPERWHITE2_BOX_ICONS_H
#define PAPERWHITE2_BOX_ICONS_H

#include "types.h"
#include "gfl/clact.h"
#include "nnsys/g2d.h"
#include "paperwhite2/icon_palettes.h"
#include "struct_decls.h"

// Paper White 2: the PC box's Pokémon icons on their own battle palettes (docs/paperwhite2/design/icon-screens.md,
// the box). The box shows up to 66 icon actors at once (the tray's 30, the party's 6 and the 30 picked up), more than
// the free OBJ rows, so its icons are 8bpp OBJs with the main engine's OBJ extended palettes, in VRAM bank G:
// - icon actor n (its ID minus BOX2_ACTOR_POKEICON) draws with band n % 16 of extended palette
//   BOX_ICONS_FIRST_EXT_PALETTE + n / 16: each pixel is the band * 16 plus the icon's 4bpp index, so 0 stays clear.
//   The actor keeps its band wherever it moves (picked up, put down, scrolled);
// - extended palette 0 is a copy of the standard OBJ palette, for the box list's tray icons, which were 8bpp already;
// - BOX_ICONS_OUTLINE_EXT_PALETTE holds the outline row (the eight copies of an icon that outline it) in every band.
// The palettes are kept here and copied to bank G in VBlank, so the bank is never away from the screen while it draws.

// The icon actors, BOX2_ACTOR_POKEICON's 66
#define BOX_ICONS_ACTORS 66
// The icon actors' palette resource is at row 3 (PokeIcon_GetAltPaletteFile's): their palette 0 is extended palette 3
#define BOX_ICONS_FIRST_EXT_PALETTE 3
// The outline's: its resource is at row 7 (file 70) and it draws with palette 1
#define BOX_ICONS_OUTLINE_EXT_PALETTE 8
#define BOX_ICONS_EXT_PALETTES (BOX_ICONS_OUTLINE_EXT_PALETTE + 1)
// The colours of an extended palette
#define BOX_ICONS_EXT_COLOURS 256
// An icon's 32x32 characters: 4bpp as the archive has them, 8bpp as the box draws them
#define BOX_ICONS_CHARS_4BPP 0x200
#define BOX_ICONS_CHARS_8BPP 0x400

typedef struct {
    // Extended palettes 0 to BOX_ICONS_OUTLINE_EXT_PALETTE, as bank G gets them
    u16 extPalettes[BOX_ICONS_EXT_PALETTES][BOX_ICONS_EXT_COLOURS];
    // An icon's characters made 8bpp, being written
    u8 chars[BOX_ICONS_CHARS_8BPP];
    // Whether extPalettes changed since the last VBlank
    BOOL changed;
} PaperWhite2BoxIcons;

// Sets the icon cells (PokeIcon_GetCellFile_Main's, loaded for the box) to 8bpp: their OBJs' colour mode, and their
// characters' names, which count 128-byte units and so double
void PaperWhite2_BoxIcons_Init(PaperWhite2BoxIcons *icons, NNSG2dCellDataBank *cells);

// Reads a Pokémon's icon colours, normal or shiny, or greyed when grey (a box search leaves it out)
void PaperWhite2_BoxIcons_ReadColours(u16 *colours, BoxPkm *pkm, BOOL grey);

// Writes icon actor n's 4bpp characters as 8bpp in its band, and its colours
void PaperWhite2_BoxIcons_Transfer(PaperWhite2BoxIcons *icons, ClActor *actor, u32 n, const u8 *chars,
                                   const u16 *colours);
// Sets icon actor n's colours only
void PaperWhite2_BoxIcons_SetColours(PaperWhite2BoxIcons *icons, ClActor *actor, u32 n, const u16 *colours);

// Copies the extended palettes to bank G if they changed, with the standard palette's copies; the box's VBlank
void PaperWhite2_BoxIcons_VBlank(PaperWhite2BoxIcons *icons);

#endif // PAPERWHITE2_BOX_ICONS_H
