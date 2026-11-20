#ifndef PAPERWHITE2_ENTRALINK_BARS_H
#define PAPERWHITE2_ENTRALINK_BARS_H

#include "types.h"
#include "paperwhite2/entralink_buffs_config.h"

// Paper White 2: the health bars of a foe whose HP the Entralink run scaled past one bar (entralink-buffs.md, phase 5).
// A foe with more max HP than settings' boss_bar_hp shows ceil(max HP / boss_bar_hp) bars of equal size, at most
// ENTRALINK_BUFF_BAR_MAX, which are visual layers of one HP pool: the battle's gauge (overlay 168) draws the current
// bar over the next one's colour, and damage over time (overlay 167) is a fraction of one bar. Every other Pokémon has
// one bar, its max HP

// How many bars a max HP shows
static inline u32 EntralinkBars_GetCount(u32 maxHP) {
    u32 count;

    if (maxHP <= ENTRALINK_BUFF_BOSS_BAR_HP) {
        return 1;
    }
    count = (maxHP + ENTRALINK_BUFF_BOSS_BAR_HP - 1) / ENTRALINK_BUFF_BOSS_BAR_HP;
    return count < ENTRALINK_BUFF_BAR_MAX ? count : ENTRALINK_BUFF_BAR_MAX;
}

// One bar's HP (the last bar to empty, bar 1, may hold a little less, so that the top one is full at full HP)
static inline u32 EntralinkBars_GetBarHP(u32 maxHP) {
    u32 count = EntralinkBars_GetCount(maxHP);

    return (maxHP + count - 1) / count;
}

// The bar an HP is in, from 1 (the last to empty), with its HP in that bar and the bar's size
static inline u32 EntralinkBars_GetBar(u32 hp, u32 maxHP, u32 *inBar, u32 *size) {
    u32 count = EntralinkBars_GetCount(maxHP);
    u32 barHP = EntralinkBars_GetBarHP(maxHP);
    u32 last = maxHP - (count - 1) * barHP;
    u32 bar;

    if (hp <= last) {
        *inBar = hp;
        *size = last;
        return 1;
    }
    bar = 2 + (hp - last - 1) / barHP;
    *inBar = hp - last - (bar - 2) * barHP;
    *size = barHP;
    return bar;
}

#endif // PAPERWHITE2_ENTRALINK_BARS_H
