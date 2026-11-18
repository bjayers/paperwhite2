#include "types.h"
#include "gfl/arc.h"
#include "gfl/clact.h"
#include "gfl/heap.h"
#include "nnsys/g2d.h"
#include "paperwhite2/palette_variation.h"
#include "paperwhite2/palette_variation_config.h"

// Paper White 2: palette variation (docs/paperwhite2/design/palette-variation.md), in main for MCSS and pokegra (the
// battle, summary, PC, evolution, trade and hatching sprites) and the follower in overlay 36. Every step is the
// reference's in tools/paperwhite2/palette_variation.py, in the same 32-bit integers and order, so the editor's
// preview (editor/src/modules/pokemon/paletteVariation.ts) shows what the game does. Every >> of a signed value is
// the ARM's arithmetic shift, a floor, as Python's and JavaScript's are

// 1.0 in the transform's 1.12 fixed point
#define VARIATION_ONE 4096
#define VARIATION_HALF 2048
#define CHANNEL_MAX 31
// ClActSys_LoadPlttRange's palette that didn't load
#define CLACT_PALETTE_NONE 0xffffffff
// The one palette that ClActSys_ReplacePlttData(palette, data, 1) replaces
#define CLACT_PALETTE_COLORS 16

#define RED(color) ((color) & 0x1f)
#define GREEN(color) (((color) >> 5) & 0x1f)
#define BLUE(color) (((color) >> 10) & 0x1f)

typedef struct {
    u16 species;
    u8 strength;
} SpeciesStrength;

// The hue's rotation about the grey axis (each row sums to VARIATION_ONE), and the saturation's and brightness's
// amounts, in 1.12
typedef struct {
    s32 diagonal;
    s32 before;
    s32 after;
    s32 saturation;
    s32 brightness;
} Variation;

static const SpeciesStrength sStrengths[PAPERWHITE2_PALETTE_VARIATION_STRENGTH_COUNT] =
    PAPERWHITE2_PALETTE_VARIATION_STRENGTHS;

static s32 GetStrength(u32 species) {
    int i;

    for (i = 0; i < PAPERWHITE2_PALETTE_VARIATION_STRENGTH_COUNT; i++) {
        if (sStrengths[i].species == species) {
            return sStrengths[i].strength;
        }
    }
    return 100;
}

static s32 ClampChannel(s32 value) {
    if (value < 0) {
        return 0;
    }
    if (value > CHANNEL_MAX) {
        return CHANNEL_MAX;
    }
    return value;
}

// The low nibble of the key picks the hue's step, bits 4-5 the brightness's and bits 6-7 the saturation's
static void SetupVariation(Variation *variation, u32 key, s32 strength) {
    s32 hueStep = 2 * (s32)(key & 15) - 15;
    s32 brightnessStep = 2 * (s32)((key >> 4) & 3) - 3;
    s32 saturationStep = 2 * (s32)(key >> 6) - 3;
    // The angle in 1.12 radians: step / 15 * degrees * strength / 100 * pi / 180, as 3123 / 65536
    s32 theta = (hueStep * PAPERWHITE2_PALETTE_VARIATION_HUE_DEGREES * strength * 3123) >> 16;
    s32 theta2 = (theta * theta) >> 12;
    s32 theta3 = (theta2 * theta) >> 12;
    s32 theta4 = (theta2 * theta2) >> 12;
    // theta - theta^3 / 6 and 1 - theta^2 / 2 + theta^4 / 24
    s32 sin = theta - ((theta3 * 683) >> 12);
    s32 cos = VARIATION_ONE - (theta2 >> 1) + ((theta4 * 171) >> 12);
    s32 third = (VARIATION_ONE - cos) / 3;
    // sin / sqrt(3)
    s32 skew = (sin * 2365) >> 12;

    variation->diagonal = VARIATION_ONE - 2 * third;
    variation->before = third - skew;
    variation->after = third + skew;
    // step / 3 * percent * strength / 10000 in 1.12, as 4474 / 32768
    variation->saturation = (saturationStep * PAPERWHITE2_PALETTE_VARIATION_SATURATION_PERCENT * strength * 4474) >> 15;
    variation->brightness = (brightnessStep * PAPERWHITE2_PALETTE_VARIATION_BRIGHTNESS_PERCENT * strength * 4474) >> 15;
}

// A channel moved from the mean (total / 3) by the saturation's amount; 1365 / 4096 is a third
static s32 Saturate(s32 channel, s32 total, s32 saturation) {
    return ClampChannel(
        (channel * VARIATION_ONE + (((3 * channel - total) * saturation * 1365) >> 12) + VARIATION_HALF) >> 12);
}

static u16 VaryColor(u16 color, const Variation *variation) {
    s32 r = RED(color);
    s32 g = GREEN(color);
    s32 b = BLUE(color);
    s32 top = r > g ? r : g;
    s32 bottom = r < g ? r : g;
    s32 weight = 0;
    s32 r1;
    s32 g1;
    s32 b1;
    s32 total;
    s32 scale;

    if (b > top) {
        top = b;
    }
    if (b < bottom) {
        bottom = b;
    }
    // The colour's own HSV saturation, which weights its brightness's change, so greys keep theirs
    if (top > 0) {
        weight = (top - bottom) * VARIATION_ONE / top;
    }
    r1 = ClampChannel((variation->diagonal * r + variation->before * g + variation->after * b + VARIATION_HALF) >> 12);
    g1 = ClampChannel((variation->after * r + variation->diagonal * g + variation->before * b + VARIATION_HALF) >> 12);
    b1 = ClampChannel((variation->before * r + variation->after * g + variation->diagonal * b + VARIATION_HALF) >> 12);
    total = r1 + g1 + b1;
    r1 = Saturate(r1, total, variation->saturation);
    g1 = Saturate(g1, total, variation->saturation);
    b1 = Saturate(b1, total, variation->saturation);
    scale = VARIATION_ONE + ((variation->brightness * weight) >> 12);
    r1 = ClampChannel((r1 * scale + VARIATION_HALF) >> 12);
    g1 = ClampChannel((g1 * scale + VARIATION_HALF) >> 12);
    b1 = ClampChannel((b1 * scale + VARIATION_HALF) >> 12);
    return r1 | (g1 << 5) | (b1 << 10);
}

void PaperWhite2_VaryPalette(u16 *colors, int count, u32 species, u32 personality) {
    s32 strength = GetStrength(species);
    Variation variation;
    int i;

    if (!PAPERWHITE2_PALETTE_VARIATION_ENABLED || strength <= 0) {
        return;
    }
    SetupVariation(&variation, (personality >> 8) & 0xff, strength);
    for (i = 1; i < count; i++) {
        colors[i] = VaryColor(colors[i], &variation);
    }
}

void PaperWhite2_VaryClActPalette(ArcTool *arc, u32 palette, u32 fileId, u32 species, u32 personality, HeapID heapId) {
    void *file;
    NNSG2dPaletteData *data;

    if (palette == CLACT_PALETTE_NONE || !PAPERWHITE2_PALETTE_VARIATION_ENABLED || GetStrength(species) <= 0) {
        return;
    }
    file = GFL_ArcToolReadHeapNew(arc, fileId, HEAPID_TAIL(heapId));
    NNS_G2dGetUnpackedPaletteData(file, &data);
    PaperWhite2_VaryPalette(data->pRawData, CLACT_PALETTE_COLORS, species, personality);
    ClActSys_ReplacePlttData(palette, data, 1);
    GFL_HeapFree(file);
}
