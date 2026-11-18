#ifndef PAPERWHITE2_PALETTE_VARIATION_H
#define PAPERWHITE2_PALETTE_VARIATION_H

#include "types.h"
#include "gfl/heap.h"
#include "struct_decls.h"

// Paper White 2: palette variation, every Pokémon's colours turned a little by its PID's second byte, as its battle,
// summary, PC, evolution, trade, hatching and follower sprites load their palettes
// (src/paperwhite2/main/paperwhite2_palette_variation.c, docs/paperwhite2/design/palette-variation.md). The settings
// are res/paperwhite2/palette_variation.json's; tools/paperwhite2/palette_variation.py is the reference transform

// Varies count BGR555 colours of an individual of the species, from colors[1]: colors[0] is the transparent one. Does
// nothing when the variation is off or the species' strength is 0
void PaperWhite2_VaryPalette(u16 *colors, int count, u32 species, u32 personality);
// Replaces the colors of a cell actor palette that ClActSys_LoadPlttRange loaded from fileId with the individual's
// varied ones (PokeGra_LoadClActPaletteByBoxData). A palette that didn't load is left alone
void PaperWhite2_VaryClActPalette(ArcTool *arc, u32 palette, u32 fileId, u32 species, u32 personality, HeapID heapId);

#endif // PAPERWHITE2_PALETTE_VARIATION_H
