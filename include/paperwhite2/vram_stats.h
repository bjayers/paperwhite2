#ifndef PAPERWHITE2_VRAM_STATS_H
#define PAPERWHITE2_VRAM_STATS_H

#include "types.h"

// Paper White 2, the debug menu's Memory page: the field's texture and palette VRAM, counted by wrapping NitroSystem's
// default allocation functions, which the field's linked-list managers are
// (src/paperwhite2/main/paperwhite2_vram_stats.c)

typedef struct {
    // In bytes: what the managers were given, what is allocated now, the most allocated at once since the field's
    // G3D system was made or the peaks were reset, and how many allocations failed since then
    u32 texTotal;
    u32 texUsed;
    u32 texPeak;
    u32 texFailed;
    u32 plttTotal;
    u32 plttUsed;
    u32 plttPeak;
    u32 plttFailed;
    // The sprite cache's most entries in use at once and the sprites that found no entry (field_actor_billboard.c),
    // since the field was made or the peaks were reset
    u32 spritePeak;
    u32 spriteDropped;
} VramStats;

// The counting started over for a G3D system just made with texBytes of texture VRAM and plttBytes of palette VRAM
// (the field's, after GFL_G3DSysCreate)
void PaperWhite2_VramStats_Install(u32 texBytes, u32 plttBytes);
void PaperWhite2_VramStats_Get(VramStats *out);
void PaperWhite2_VramStats_ResetPeaks(void);
// The sprite cache's counts: an entry filled, with used now in use; a sprite that found none; and their start over
// with used in use
void PaperWhite2_VramStats_OnSpriteCached(u32 used);
void PaperWhite2_VramStats_OnSpriteDropped(void);
void PaperWhite2_VramStats_ResetSprites(u32 used);
// The largest block that could be allocated now, in bytes, found by trying sizes; 0 before the counting is installed
u32 PaperWhite2_VramStats_LargestFreeTex(void);
u32 PaperWhite2_VramStats_LargestFreePltt(void);

#endif // PAPERWHITE2_VRAM_STATS_H
