#include "types.h"
#include "nnsys/gfd.h"
#include "paperwhite2/vram_stats.h"

// Paper White 2, the debug menu's Memory page: the field's texture and palette VRAM (include/paperwhite2/vram_stats.h).
// The field's G3D system sets up NitroSystem's linked-list managers as the default ones (GFL_G3DSysCreate); the default
// allocation functions are pointers, which every allocation goes through (models, the maps' textures, the sprites'),
// so wrapping them counts all of it without touching the callers. In main, since any overlay allocates

#ifdef PAPERWHITE2_DEBUG_MENU
// The sizes the largest-free search stops at: a texture key's and a palette key's smallest size
#define VRAM_STATS_TEX_STEP NNS_GFD_TEXSIZE_MIN
#define VRAM_STATS_PLTT_STEP NNS_GFD_PLTTSIZE_MIN

typedef struct {
    VramStats stats;
    // The functions wrapped, NULL until installed
    NNSGfdFuncAllocTexVram allocTex;
    NNSGfdFuncFreeTexVram freeTex;
    NNSGfdFuncAllocPlttVram allocPltt;
    NNSGfdFuncFreePlttVram freePltt;
} VramStatsState;

static VramStatsState sVramStats;

static NNSGfdTexKey VramStats_AllocTex(u32 szByte, BOOL is4x4comp, u32 opt) {
    NNSGfdTexKey key = sVramStats.allocTex(szByte, is4x4comp, opt);

    if (key == NNS_GFD_ALLOC_ERROR_TEXKEY) {
        sVramStats.stats.texFailed++;
    } else {
        sVramStats.stats.texUsed += NNS_GfdGetTexKeySize(key);
        if (sVramStats.stats.texUsed > sVramStats.stats.texPeak) {
            sVramStats.stats.texPeak = sVramStats.stats.texUsed;
        }
    }
    return key;
}

static int VramStats_FreeTex(NNSGfdTexKey key) {
    if (key != NNS_GFD_ALLOC_ERROR_TEXKEY) {
        sVramStats.stats.texUsed -= NNS_GfdGetTexKeySize(key);
    }
    return sVramStats.freeTex(key);
}

static NNSGfdPlttKey VramStats_AllocPltt(u32 szByte, BOOL is4pltt, u32 opt) {
    NNSGfdPlttKey key = sVramStats.allocPltt(szByte, is4pltt, opt);

    if (key == NNS_GFD_ALLOC_ERROR_PLTTKEY) {
        sVramStats.stats.plttFailed++;
    } else {
        sVramStats.stats.plttUsed += NNS_GfdGetPlttKeySize(key);
        if (sVramStats.stats.plttUsed > sVramStats.stats.plttPeak) {
            sVramStats.stats.plttPeak = sVramStats.stats.plttUsed;
        }
    }
    return key;
}

static int VramStats_FreePltt(NNSGfdPlttKey key) {
    if (key != NNS_GFD_ALLOC_ERROR_PLTTKEY) {
        sVramStats.stats.plttUsed -= NNS_GfdGetPlttKeySize(key);
    }
    return sVramStats.freePltt(key);
}

void PaperWhite2_VramStats_Install(u32 texBytes, u32 plttBytes) {
    // (a G3D system made again sets the managers' own functions as the defaults, so these are never the wrappers)
    sVramStats.allocTex = NNS_GfdDefaultFuncAllocTexVram;
    sVramStats.freeTex = NNS_GfdDefaultFuncFreeTexVram;
    sVramStats.allocPltt = NNS_GfdDefaultFuncAllocPlttVram;
    sVramStats.freePltt = NNS_GfdDefaultFuncFreePlttVram;
    NNS_GfdDefaultFuncAllocTexVram = VramStats_AllocTex;
    NNS_GfdDefaultFuncFreeTexVram = VramStats_FreeTex;
    NNS_GfdDefaultFuncAllocPlttVram = VramStats_AllocPltt;
    NNS_GfdDefaultFuncFreePlttVram = VramStats_FreePltt;
    sVramStats.stats.texTotal = texBytes;
    sVramStats.stats.texUsed = 0;
    sVramStats.stats.texPeak = 0;
    sVramStats.stats.texFailed = 0;
    sVramStats.stats.plttTotal = plttBytes;
    sVramStats.stats.plttUsed = 0;
    sVramStats.stats.plttPeak = 0;
    sVramStats.stats.plttFailed = 0;
}

void PaperWhite2_VramStats_Get(VramStats *out) {
    *out = sVramStats.stats;
}

void PaperWhite2_VramStats_ResetPeaks(void) {
    sVramStats.stats.texPeak = sVramStats.stats.texUsed;
    sVramStats.stats.texFailed = 0;
    sVramStats.stats.plttPeak = sVramStats.stats.plttUsed;
    sVramStats.stats.plttFailed = 0;
}

void PaperWhite2_VramStats_OnSpriteCached(u32 used) {
    if (used > sVramStats.stats.spritePeak) {
        sVramStats.stats.spritePeak = used;
    }
}

void PaperWhite2_VramStats_OnSpriteDropped(void) {
    sVramStats.stats.spriteDropped++;
}

void PaperWhite2_VramStats_ResetSprites(u32 used) {
    sVramStats.stats.spritePeak = used;
    sVramStats.stats.spriteDropped = 0;
}

u32 PaperWhite2_VramStats_LargestFreeTex(void) {
    u32 low = 0;
    u32 high = sVramStats.stats.texTotal - sVramStats.stats.texUsed + VRAM_STATS_TEX_STEP;

    if (sVramStats.allocTex == NULL) {
        return 0;
    }
    // (low can be allocated, high can't; through the managers' own functions, so it isn't counted)
    while (high - low > VRAM_STATS_TEX_STEP) {
        u32 size = (low + high) / 2 / VRAM_STATS_TEX_STEP * VRAM_STATS_TEX_STEP;
        NNSGfdTexKey key = sVramStats.allocTex(size, FALSE, 0);

        if (key != NNS_GFD_ALLOC_ERROR_TEXKEY) {
            sVramStats.freeTex(key);
            low = size;
        } else {
            high = size;
        }
    }
    return low;
}

u32 PaperWhite2_VramStats_LargestFreePltt(void) {
    u32 low = 0;
    u32 high = sVramStats.stats.plttTotal - sVramStats.stats.plttUsed + VRAM_STATS_PLTT_STEP;

    if (sVramStats.allocPltt == NULL) {
        return 0;
    }
    while (high - low > VRAM_STATS_PLTT_STEP) {
        u32 size = (low + high) / 2 / VRAM_STATS_PLTT_STEP * VRAM_STATS_PLTT_STEP;
        NNSGfdPlttKey key = sVramStats.allocPltt(size, FALSE, 0);

        if (key != NNS_GFD_ALLOC_ERROR_PLTTKEY) {
            sVramStats.freePltt(key);
            low = size;
        } else {
            high = size;
        }
    }
    return low;
}
#endif
