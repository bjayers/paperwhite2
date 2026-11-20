// Paper White 2: the health bars of the Entralink run's big foes on the battle's gauges (entralink-buffs.md, phase
// 5). See include/paperwhite2/health_bars.h

#include "types.h"
#include "battle/btlv_effect.h"
#include "battle/btlv_gauge.h"
#include "gfl/clact.h"
#include "nitro/gx.h"
#include "nitro/hw.h"
#include "nitro/math.h"
#include "nitro/mi.h"
#include "nnsys/g2d.h"
#include "paperwhite2/entralink_bars.h"
#include "paperwhite2/health_bars.h"
#include "system/hp_gauge.h"
#include "system/palanm.h"

// The HP bar: 6 tiles of 8 pixels after its label's tile, drawn from the gauge's characters, where each colour's 9
// tiles (0 to 8 pixels filled) are a set apart
#define BAR_TILES 6
#define BAR_DOTS (BAR_TILES * 8)
#define TILE_SIZE 0x20
#define BAR_SET_GREEN 0
#define BAR_SET_YELLOW 0x120
#define BAR_SET_RED 0x240
// The box's palette entries, each the light one of a pair with its dark one after it: the green bar's, which the
// current bar takes; the red bar's (and the female sign's) and the Exp. bar's blue (and the male sign's), one of which
// the bar behind takes, the one its Pokémon's sign doesn't use (the yellow's are the level's "Lv"); the empty part's
// white and gray
#define COLOR_GREEN_LIGHT 5
#define COLOR_RED_LIGHT 7
#define COLOR_BLUE_LIGHT 11
#define COLOR_EMPTY_LIGHT 1
#define COLOR_EMPTY_DARK 14
// A gauge's sex for a female Pokémon (its sign in red)
#define GAUGE_SEX_FEMALE 1
// The gauge's digits (8 by 8, 0 to 9 a tile apart) and its blank tile, as byte offsets in its characters; the HP
// numbers' actor's 7 tiles (the HP, the slash, the max HP)
#define TILE_DIGITS 0x520
#define TILE_BLANK 0x660
#define NUMBER_TILES 7
// The most HP vanilla's three digits show
#define NUMBERS_MAX_HP 999
// The frames a bar takes to drain
#define DRAIN_FRAMES 32

static const u16 sBarColors[][2] = ENTRALINK_BUFF_BAR_COLORS;

// "x", in the digits' colours (white, the near-black outline)
static const u8 sTimesTile[TILE_SIZE] = {
    0x00, 0x00, 0x00, 0x00, 0x22, 0x02, 0x22, 0x02, 0x12, 0x22, 0x12, 0x02, 0x22, 0x21, 0x21, 0x02,
    0x20, 0x12, 0x22, 0x00, 0x22, 0x21, 0x21, 0x02, 0x12, 0x22, 0x12, 0x02, 0x22, 0x02, 0x22, 0x02,
};

// The entries the bar behind takes
static u32 HealthBars_BehindEntry(const BtlvGaugeEntry *entry) {
    return entry->mon.sex == GAUGE_SEX_FEMALE ? COLOR_BLUE_LIGHT : COLOR_RED_LIGHT;
}

// A bar tile's pixel above bar 1: the empty part's white and gray become the bar behind's light and dark
static u32 HealthBars_BehindColor(u32 color, u32 behind) {
    switch (color) {
    case COLOR_EMPTY_LIGHT:
        return behind;
    case COLOR_EMPTY_DARK:
        return behind + 1;
    default:
        return color;
    }
}

BOOL PaperWhite2_HealthBarsActive(const BtlvGaugeEntry *entry) {
    return entry->mon.side && EntralinkBars_GetCount(entry->mon.maxHp) > 1;
}

// The gauge's palette's first entry in the main OBJ palettes
static u32 HealthBars_PaletteBase(BtlvGauge *gauge, int index) {
    return ClActSys_GetPlttVramAddr(gauge->palettes[index < 2 ? index : index - 2], FALSE) / 2;
}

// Sets two of the gauge's palette's entries in the fade's buffers and in the palette memory
static void HealthBars_SetColors(BtlvGauge *gauge, int index, u32 entry, const u16 *colors) {
    PaletteFade *fade = BtlvEffect_GetPaletteFade();
    u32 at = HealthBars_PaletteBase(gauge, index) + entry;

    PaletteFade_GetUnfadedBuffer(fade, PALFADE_BUFFER_MAIN_OBJ)[at] = colors[0];
    PaletteFade_GetUnfadedBuffer(fade, PALFADE_BUFFER_MAIN_OBJ)[at + 1] = colors[1];
    PaletteFade_GetFadedBuffer(fade, PALFADE_BUFFER_MAIN_OBJ)[at] = colors[0];
    PaletteFade_GetFadedBuffer(fade, PALFADE_BUFFER_MAIN_OBJ)[at + 1] = colors[1];
    ((u16 *)HW_OBJ_PLTT)[at] = colors[0];
    ((u16 *)HW_OBJ_PLTT)[at + 1] = colors[1];
}

// The palette's colours for the bar shown: bar 1 vanilla's, a higher bar its colour in the green's entries and the
// next bar's in the behind entries (bar 1's: vanilla's green)
static void HealthBars_SetPalette(BtlvGauge *gauge, int index, u32 bar) {
    BtlvGaugeEntry *entry = &gauge->entries[index];
    const u16 *unfaded;

    u32 behind = HealthBars_BehindEntry(entry);

    if (bar <= 1) {
        bar = 0;
    }
    if (entry->paletteBar == bar && (bar == 0 || entry->paletteBehind == behind)) {
        return;
    }
    // Vanilla's colours back first: the bar's, and those of the entries the bar behind took
    if (entry->paletteBar != 0) {
        HealthBars_SetColors(gauge, index, COLOR_GREEN_LIGHT, &entry->vanillaBarColors[0]);
        HealthBars_SetColors(gauge, index, entry->paletteBehind, &entry->vanillaBarColors[2]);
        entry->paletteBar = 0;
    }
    if (bar == 0) {
        return;
    }
    unfaded = PaletteFade_GetUnfadedBuffer(BtlvEffect_GetPaletteFade(), PALFADE_BUFFER_MAIN_OBJ) +
              HealthBars_PaletteBase(gauge, index);
    entry->vanillaBarColors[0] = unfaded[COLOR_GREEN_LIGHT];
    entry->vanillaBarColors[1] = unfaded[COLOR_GREEN_LIGHT + 1];
    entry->vanillaBarColors[2] = unfaded[behind];
    entry->vanillaBarColors[3] = unfaded[behind + 1];
    HealthBars_SetColors(gauge, index, COLOR_GREEN_LIGHT, sBarColors[bar - 2]);
    // Behind bar 2 is bar 1, vanilla's full bar: its green
    HealthBars_SetColors(gauge, index, behind, bar == 2 ? &entry->vanillaBarColors[0] : sBarColors[bar - 3]);
    entry->paletteBar = bar;
    entry->paletteBehind = behind;
}

BOOL PaperWhite2_HealthBarsDraw(BtlvGauge *gauge, int index) {
    BtlvGaugeEntry *entry = &gauge->entries[index];
    NNSG2dImageProxy proxy;
    u8 tile[TILE_SIZE];
    u8 *vram;
    u32 set;
    u32 bar;
    u32 inBar;
    u32 size;
    u32 dots;
    u32 fill;
    u32 i;
    u32 j;
    u32 behind = HealthBars_BehindEntry(entry);

    if (!PaperWhite2_HealthBarsActive(entry)) {
        if (entry->paletteBar != 0) {
            HealthBars_SetPalette(gauge, index, 0);
        }
        return FALSE;
    }
    bar = EntralinkBars_GetBar(entry->mon.hpAnim, entry->mon.maxHp, &inBar, &size);
    HealthBars_SetPalette(gauge, index, bar);
    dots = inBar * BAR_DOTS / size;
    if (dots == 0 && inBar != 0) {
        dots = 1;
    }
    if (bar > 1) {
        set = BAR_SET_GREEN;
    } else {
        switch (HPGauge_GetColor(inBar, size)) {
        case HP_GAUGE_COLOR_GREEN:
            set = BAR_SET_GREEN;
            break;
        case HP_GAUGE_COLOR_YELLOW:
            set = BAR_SET_YELLOW;
            break;
        default:
            set = BAR_SET_RED;
            break;
        }
    }
    ClActor_GetImageProxy(entry->hpBarActor, &proxy);
    vram = (u8 *)G2_GetOBJCharPtr() + proxy.vramLocation.baseAddrOfVram[NNS_G2D_VRAM_TYPE_2DMAIN];
    for (i = 0; i < BAR_TILES; i++) {
        fill = dots > i * 8 ? MATH_MIN(dots - i * 8, 8) : 0;
        MI_CpuCopy8(gauge->chars + set + fill * TILE_SIZE, tile, TILE_SIZE);
        // Above bar 1, the empty part shows the next bar's colour
        for (j = 0; bar > 1 && j < TILE_SIZE; j++) {
            tile[j] =
                HealthBars_BehindColor(tile[j] & 0xf, behind) | (HealthBars_BehindColor(tile[j] >> 4, behind) << 4);
        }
        MI_CpuCopy16(tile, vram + (i + 1) * TILE_SIZE, TILE_SIZE);
    }
    PaperWhite2_HealthBarsDrawNumbers(gauge, entry);
    return TRUE;
}

BOOL PaperWhite2_HealthBarsDrawNumbers(BtlvGauge *gauge, BtlvGaugeEntry *entry) {
    NNSG2dImageProxy proxy;
    const u8 *tiles[NUMBER_TILES];
    u8 *vram;
    u32 bar;
    u32 inBar;
    u32 size;
    u32 i;

    if (!entry->mon.side || entry->mon.maxHp <= NUMBERS_MAX_HP || entry->hpNumActor == NULL) {
        return FALSE;
    }
    for (i = 0; i < NUMBER_TILES; i++) {
        tiles[i] = gauge->chars + TILE_BLANK;
    }
    // The bars left, the current one included, from 2: "x10" or "x7" at the right
    if (PaperWhite2_HealthBarsActive(entry)) {
        bar = EntralinkBars_GetBar(entry->mon.hpMoving ? entry->mon.hpAnim : entry->mon.hp, entry->mon.maxHp, &inBar,
                                   &size);
        if (bar >= 10) {
            tiles[NUMBER_TILES - 3] = sTimesTile;
            tiles[NUMBER_TILES - 2] = gauge->chars + TILE_DIGITS + bar / 10 * TILE_SIZE;
        } else if (bar >= 2) {
            tiles[NUMBER_TILES - 2] = sTimesTile;
        }
        if (bar >= 2) {
            tiles[NUMBER_TILES - 1] = gauge->chars + TILE_DIGITS + bar % 10 * TILE_SIZE;
        }
    }
    ClActor_GetImageProxy(entry->hpNumActor, &proxy);
    vram = (u8 *)G2_GetOBJCharPtr() + proxy.vramLocation.baseAddrOfVram[NNS_G2D_VRAM_TYPE_2DMAIN];
    for (i = 0; i < NUMBER_TILES; i++) {
        MI_CpuCopy16(tiles[i], vram + i * TILE_SIZE, TILE_SIZE);
    }
    return TRUE;
}

void PaperWhite2_HealthBarsSetPos(BtlvGaugeEntry *entry, int x, int y) {
    ClActorPos pos = { 0, 0 };

    if (!entry->mon.side || entry->hpNumActor == NULL) {
        return;
    }
    // Vanilla leaves a foe's HP numbers where the actor was made, at 0, 0
    if (entry->mon.maxHp > NUMBERS_MAX_HP) {
        pos.x = x + 8;
        pos.y = y + 13;
    }
    ClActor_SetSurfacePos(entry->hpNumActor, &pos, CLACT_SURFACE_MAIN);
}

u32 PaperWhite2_HealthBarsSpeed(const BtlvGaugeEntry *entry) {
    u32 speed;

    if (entry->mon.maxHp <= NUMBERS_MAX_HP) {
        return 1;
    }
    speed = EntralinkBars_GetBarHP(entry->mon.maxHp) / DRAIN_FRAMES;
    return speed != 0 ? speed : 1;
}
