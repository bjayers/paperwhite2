#ifndef PAPERWHITE2_HEALTH_BARS_H
#define PAPERWHITE2_HEALTH_BARS_H

#include "types.h"
#include "battle/btlv_gauge.h"

// Paper White 2: the health bars of the Entralink run's big foes on the battle's gauges (entralink-buffs.md, phase 5),
// overlay 168's src/paperwhite2/ov168/paperwhite2_health_bars.c. A gauge whose max HP has several bars
// (paperwhite2/entralink_bars.h) draws the current bar full width over the next one's colour, its colours from
// buffs.json's bar_colors in the gauge's palette (the green bar's entries for the current bar, the red bar's for the
// one behind, or a female foe's the Exp. bar's blue); the last bar is vanilla's bar (green, yellow, red) by its own HP.
// The bars left show as "xN" in the gauge's HP numbers' actor, after the foe's HP in the run's battles (phase 6), under
// the bar's right end or beside the bar in triples. The lost HP's blink is left out. Every gauge's drain takes a time
// by the share of the bar it drains (below). Hooks in btlv_gauge.c

// Whether a gauge shows several bars
BOOL PaperWhite2_HealthBarsActive(const BtlvGaugeEntry *entry);
// Draws the HP bar of a gauge with several bars, or restores vanilla's colours to one whose palette holds a bar's;
// returns whether it drew the bar (BtlvGauge_DrawBar's HP bar)
BOOL PaperWhite2_HealthBarsDraw(BtlvGauge *gauge, int index);
// A foe's gauge in the run's battles (phase 6, settings' damage_numbers.hp_numbers), or with more than 999 max HP:
// draws its HP line instead of vanilla's three digits, its HP (up to 5 digits, a gap before the thousands) and "xN",
// its bars left, in its HP numbers' actor (64 pixels wide on a foe's gauge); returns whether it did
// (BtlvGauge_DrawHpNumbers)
BOOL PaperWhite2_HealthBarsDrawNumbers(BtlvGauge *gauge, BtlvGaugeEntry *entry, s32 hp);
// Places a foe's HP line (BtlvGauge_SetPos, the gauge's name box at x, y): under its bar, ending at its right end; in
// triple and rotation battles (raids too), whose foes' boxes stack 19 pixels apart, beside the bar's strip on its row
void PaperWhite2_HealthBarsSetPos(BtlvGaugeEntry *entry, int x, int y);
// The HP bar's drain in every battle (the user's playtest, 2026-11-20): vanilla drains 1 HP a frame, so a big hit on
// a lot of HP (a Blissey, a run's boss) took seconds. A change now takes HP_DRAIN_FRAMES_MIN frames plus its share of
// the bar (a gauge with several bars: of one bar) of the rest up to HP_DRAIN_FRAMES_MAX, and HP_DRAIN_FRAMES_MAX for
// each whole bar past one; never slower than vanilla (a change of a few HP still drains 1 a frame). A Pokémon with
// less than 48 max HP keeps vanilla's pixel a frame (at most 48 frames). The HP numbers follow the bar
#define HP_DRAIN_FRAMES_MIN 12
#define HP_DRAIN_FRAMES_MAX 36

// The HP a frame the bar drains by for the change the gauge starts (its hpDelta), by the drain's time above
u32 PaperWhite2_HealthBarsSpeed(const BtlvGaugeEntry *entry);

#endif // PAPERWHITE2_HEALTH_BARS_H
