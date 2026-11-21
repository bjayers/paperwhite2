// Paper White 2: the health bars of the Entralink run's big foes on the battle's gauges (entralink-buffs.md, phase
// 5). See include/paperwhite2/health_bars.h

#include "types.h"
#include "battle/btlv_effect.h"
#include "battle/btlv_gauge.h"
#include "constants/battle.h"
#include "gfl/clact.h"
#include "nitro/gx.h"
#include "nitro/hw.h"
#include "nitro/math.h"
#include "nitro/mi.h"
#include "nnsys/g2d.h"
#include "paperwhite2/damage_numbers.h"
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
// The gauge's digits (8 by 8, 0 to 9 a tile apart), as a byte offset in its characters
#define TILE_DIGITS 0x520
// A foe's HP line (phase 6): its actor's 8 tiles in a row (damage_digits.py's cell), the gauge's slanted digits 7
// pixels apart, 2 more before the thousands, 3 more before "x" and the bars left, and the HP's most digits
#define LINE_TILES 8
#define LINE_WIDTH (LINE_TILES * 8)
#define GLYPH_WIDTH 8
#define GLYPH_ADVANCE 7
#define THOUSANDS_GAP 2
#define BARS_GAP 3
#define HP_DIGITS_MAX 5
// Where the line goes from the name box's place: under the bar, right-aligned to its end; or, where the foes' boxes
// stack too close for a line under (triples, rotations and raids), beside the bar's strip on its row, left-aligned
#define LINE_UNDER_X 8
#define LINE_UNDER_Y 13
#define LINE_BESIDE_X 96
#define LINE_BESIDE_Y 8
// The most HP vanilla's three digits show
#define NUMBERS_MAX_HP 999

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
    PaperWhite2_HealthBarsDrawNumbers(gauge, entry, entry->mon.hpMoving ? entry->mon.hpAnim : entry->mon.hp);
    return TRUE;
}

// Whether a foe's gauge shows its HP line: in the run's battles (phase 6), and for any foe past vanilla's three digits
static BOOL HealthBars_ShowsLine(const BtlvGaugeEntry *entry) {
    return entry->mon.side && entry->hpNumActor != NULL &&
           (PaperWhite2_DamageNumbersFoeHP() || entry->mon.maxHp > NUMBERS_MAX_HP);
}

// Whether a foe's HP line goes beside its bar: the foes' boxes of a triple or rotation battle are 19 pixels apart,
// too close for a line under each
static BOOL HealthBars_LineBeside(const BtlvGaugeEntry *entry) {
    return entry->mon.type == BTL_STYLE_TRIPLE || entry->mon.type == BTL_STYLE_ROTATION;
}

// Draws a glyph's tile into the line's pixels at x, over what is there: its pixels of colour 0 are clear
static void HealthBars_DrawGlyph(u8 *line, const u8 *glyph, s32 x) {
    u32 row;
    u32 column;
    u32 color;
    u32 at;

    for (row = 0; row < 8; row++) {
        for (column = 0; column < 8; column++) {
            color = (glyph[row * 4 + column / 2] >> ((column & 1) * 4)) & 0xf;
            if (color == 0 || x + column >= LINE_WIDTH) {
                continue;
            }
            at = (x + column) / 8 * TILE_SIZE + row * 4 + (x + column) % 8 / 2;
            if ((x + column) & 1) {
                line[at] = (line[at] & 0x0f) | color << 4;
            } else {
                line[at] = (line[at] & 0xf0) | color;
            }
        }
    }
}

// The line's width from its glyphs' advances: the HP's digits with a gap before the thousands, a wider gap, then
// "x" and the bars left
static s32 HealthBars_LineWidth(u32 count, u32 bars) {
    s32 width = count * GLYPH_ADVANCE + (count > 3 ? THOUSANDS_GAP : 0);

    if (bars >= 2) {
        width += BARS_GAP + GLYPH_ADVANCE * (bars >= 10 ? 3 : 2);
    }
    return width + GLYPH_WIDTH - GLYPH_ADVANCE;
}

BOOL PaperWhite2_HealthBarsDrawNumbers(BtlvGauge *gauge, BtlvGaugeEntry *entry, s32 hp) {
    NNSG2dImageProxy proxy;
    u8 line[LINE_TILES * TILE_SIZE];
    u8 digits[HP_DIGITS_MAX];
    u32 count = 0;
    u32 bars = 0;
    u32 inBar;
    u32 size;
    s32 x;
    u32 i;

    if (!HealthBars_ShowsLine(entry)) {
        return FALSE;
    }
    if (hp < 0) {
        hp = 0;
    }
    // The HP, from the ones up
    do {
        digits[count++] = hp % 10;
        hp /= 10;
    } while (hp != 0 && count < HP_DIGITS_MAX);
    // The bars left, the current one included, from 2
    if (PaperWhite2_HealthBarsActive(entry)) {
        bars = EntralinkBars_GetBar(entry->mon.hpMoving ? entry->mon.hpAnim : entry->mon.hp, entry->mon.maxHp, &inBar,
                                    &size);
    }
    MI_CpuFill8(line, 0, sizeof(line));
    // Right-aligned in the line under the bar, which ends under the bar's right end; left-aligned beside it
    x = HealthBars_LineBeside(entry) ? 0 : LINE_WIDTH - HealthBars_LineWidth(count, bars);
    for (i = count; i-- > 0;) {
        HealthBars_DrawGlyph(line, gauge->chars + TILE_DIGITS + digits[i] * TILE_SIZE, x);
        x += GLYPH_ADVANCE;
        if (i == 3) {
            x += THOUSANDS_GAP;
        }
    }
    if (bars >= 2) {
        x += BARS_GAP;
        HealthBars_DrawGlyph(line, sTimesTile, x);
        x += GLYPH_ADVANCE;
        if (bars >= 10) {
            HealthBars_DrawGlyph(line, gauge->chars + TILE_DIGITS + bars / 10 * TILE_SIZE, x);
            x += GLYPH_ADVANCE;
        }
        HealthBars_DrawGlyph(line, gauge->chars + TILE_DIGITS + bars % 10 * TILE_SIZE, x);
    }
    ClActor_GetImageProxy(entry->hpNumActor, &proxy);
    MI_CpuCopy16(line, (u8 *)G2_GetOBJCharPtr() + proxy.vramLocation.baseAddrOfVram[NNS_G2D_VRAM_TYPE_2DMAIN],
                 sizeof(line));
    return TRUE;
}

void PaperWhite2_HealthBarsSetPos(BtlvGaugeEntry *entry, int x, int y) {
    ClActorPos pos = { 0, 0 };

    if (!entry->mon.side || entry->hpNumActor == NULL) {
        return;
    }
    // Vanilla leaves a foe's HP numbers where the actor was made, at 0, 0
    if (HealthBars_ShowsLine(entry) && HealthBars_LineBeside(entry)) {
        pos.x = x + LINE_BESIDE_X;
        pos.y = y + LINE_BESIDE_Y;
    } else if (HealthBars_ShowsLine(entry)) {
        pos.x = x + LINE_UNDER_X;
        pos.y = y + LINE_UNDER_Y;
    }
    ClActor_SetSurfacePos(entry->hpNumActor, &pos, CLACT_SURFACE_MAIN);
}

u32 PaperWhite2_HealthBarsSpeed(const BtlvGaugeEntry *entry) {
    u32 change = MATH_ABS(entry->mon.hpDelta);
    u32 bar = PaperWhite2_HealthBarsActive(entry) ? EntralinkBars_GetBarHP(entry->mon.maxHp) : entry->mon.maxHp;
    u32 frames;
    u32 speed;

    if (bar == 0) {
        return 1;
    }
    // A share of the bar takes its share of the time between the least and the most; past one bar (a gauge with
    // several), each bar more takes the most
    if (change < bar) {
        frames = HP_DRAIN_FRAMES_MIN + (HP_DRAIN_FRAMES_MAX - HP_DRAIN_FRAMES_MIN) * change / bar;
    } else {
        frames = HP_DRAIN_FRAMES_MAX * change / bar;
    }
    speed = (change + frames - 1) / frames;
    return speed != 0 ? speed : 1;
}
