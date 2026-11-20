#ifndef PAPERWHITE2_HEALTH_BARS_H
#define PAPERWHITE2_HEALTH_BARS_H

#include "types.h"
#include "battle/btlv_gauge.h"

// Paper White 2: the health bars of the Entralink run's big foes on the battle's gauges (entralink-buffs.md, phase 5),
// overlay 168's src/paperwhite2/ov168/paperwhite2_health_bars.c. A gauge whose max HP has several bars
// (paperwhite2/entralink_bars.h) draws the current bar full width over the next one's colour, its colours from
// buffs.json's bar_colors in the gauge's palette (the green bar's entries for the current bar, the red bar's for the
// one behind, or a female foe's the Exp. bar's blue); the last bar is vanilla's bar (green, yellow, red) by its own HP.
// The bars left show as "xN" in the gauge's HP numbers' actor, under the bar's right end. The lost HP's blink is left
// out, and the bar drains a bar's 48 pixels in about half a second. Hooks in btlv_gauge.c

// Whether a gauge shows several bars
BOOL PaperWhite2_HealthBarsActive(const BtlvGaugeEntry *entry);
// Draws the HP bar of a gauge with several bars, or restores vanilla's colours to one whose palette holds a bar's;
// returns whether it drew the bar (BtlvGauge_DrawBar's HP bar)
BOOL PaperWhite2_HealthBarsDraw(BtlvGauge *gauge, int index);
// A foe's gauge with more than 999 max HP: draws the bars left in its HP numbers' tiles instead of its HP, which
// vanilla's three digits can't show; returns whether it did (BtlvGauge_DrawHpNumbers)
BOOL PaperWhite2_HealthBarsDrawNumbers(BtlvGauge *gauge, BtlvGaugeEntry *entry);
// Places a foe's bar count under its bar's right end (BtlvGauge_SetPos), the gauge's name box at x, y
void PaperWhite2_HealthBarsSetPos(BtlvGaugeEntry *entry, int x, int y);
// The HP a frame the bar drains by (vanilla 1): a bar in about 32 frames past 999 max HP
u32 PaperWhite2_HealthBarsSpeed(const BtlvGaugeEntry *entry);

#endif // PAPERWHITE2_HEALTH_BARS_H
