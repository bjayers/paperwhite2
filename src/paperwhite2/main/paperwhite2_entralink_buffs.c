#include "types.h"
#include "nitro/mi.h"
#include "paperwhite2/entralink_buffs.h"
#include "paperwhite2/entralink_run_party.h"
#include "paperwhite2/entralink_run_state.h"

// Paper White 2: what the Entralink run holds of the buffs, in ARM9 main for the battle's effects (phase 3). See
// include/paperwhite2/entralink_buffs.h

static const u8 sTypeCards[] = ENTRALINK_BUFF_TYPE_CARDS;
static const EntralinkBuffValue sValues[ENTRALINK_BUFF_COUNT] = ENTRALINK_BUFF_VALUES;

void EntralinkBuffs_Clear(void) {
    EntralinkRunState *state = EntralinkRun_GetState();

    MI_CpuFill8(state->buffLevels, 0, sizeof(state->buffLevels));
    MI_CpuFill8(state->goldSlots, ENTRALINK_BUFF_NONE, sizeof(state->goldSlots));
    MI_CpuFill8(state->typeCounts, 0, sizeof(state->typeCounts));
    state->forecastWeather = 0;
}

u32 EntralinkBuffs_GetForecastWeather(void) {
    return EntralinkRun_GetState()->forecastWeather;
}

// The cards that choose the battles' weather when taken (Forecast)
static const u8 sWeatherChoiceCards[] = ENTRALINK_BUFF_WEATHER_CHOICE;

BOOL EntralinkBuffs_NeedsWeather(void) {
    u32 i;

    if (EntralinkRun_GetState()->forecastWeather != 0) {
        return FALSE;
    }
    for (i = 0; i < NELEMS(sWeatherChoiceCards); i++) {
        if (EntralinkBuffs_GetLevel(sWeatherChoiceCards[i]) != 0) {
            return TRUE;
        }
    }
    return FALSE;
}

// Rebalance 2: the cards that raise a stat on every hit, and the buckets' caps
static const EntralinkBuffStatCard sStatCards[ENTRALINK_BUFF_STAT_CARD_COUNT] = ENTRALINK_BUFF_STAT_CARDS;
static const u16 sBucketCaps[ENTRALINK_BUFF_BUCKET_COUNT] = ENTRALINK_BUFF_BUCKET_CAPS;

// Whether a stat card's stat is a stat: the same, or the attacking (defending) one for both attacking (defending)
static BOOL EntralinkBuffs_IsCardStat(u32 cardStat, u32 stat) {
    if (cardStat == stat) {
        return TRUE;
    }
    if (cardStat == ENTRALINK_BUFF_STAT_ATTACKING) {
        return stat == ENTRALINK_BUFF_STAT_ATTACK || stat == ENTRALINK_BUFF_STAT_SP_ATTACK;
    }
    if (cardStat == ENTRALINK_BUFF_STAT_DEFENDING) {
        return stat == ENTRALINK_BUFF_STAT_DEFENSE || stat == ENTRALINK_BUFF_STAT_SP_DEFENSE;
    }
    return FALSE;
}

u32 EntralinkBuffs_GetBuffedStat(u32 stat, u32 value) {
    s32 sums[ENTRALINK_BUFF_BUCKET_COUNT];
    const EntralinkBuffStatCard *card;
    s32 percent;
    u32 i;

    if (!EntralinkRun_IsPartyKept()) {
        return value;
    }
    MI_CpuFill32(sums, 0, sizeof(sums));
    for (i = 0; i < NELEMS(sStatCards); i++) {
        card = &sStatCards[i];
        if (card->buff == ENTRALINK_BUFF_NONE || !EntralinkBuffs_IsCardStat(card->stat, stat)) {
            continue;
        }
        percent = EntralinkBuffs_GetValue(card->buff, EntralinkBuffs_GetLevel(card->buff));
        if (card->bucket == ENTRALINK_BUFF_NONE) {
            value = value * (100 + percent) / 100;
        } else {
            sums[card->bucket] += percent;
        }
    }
    for (i = 0; i < ENTRALINK_BUFF_BUCKET_COUNT; i++) {
        percent = sums[i] < sBucketCaps[i] ? sums[i] : sBucketCaps[i];
        value = value * (100 + percent) / 100;
    }
    return value;
}

u32 EntralinkBuffs_GetLevel(u32 buff) {
    return buff < ENTRALINK_BUFF_COUNT ? EntralinkRun_GetState()->buffLevels[buff] : 0;
}

u32 EntralinkBuffs_GetGoldRank(u32 buff) {
    u32 slot;

    if (buff >= ENTRALINK_BUFF_COUNT) {
        return 0;
    }
    for (slot = 0; slot < ENTRALINK_BUFF_GOLD_SLOTS; slot++) {
        if (EntralinkBuffs_GetGoldSlot(slot) == buff) {
            return EntralinkRun_GetState()->buffLevels[buff];
        }
    }
    return 0;
}

u32 EntralinkBuffs_GetCount(u32 buff) {
    return EntralinkBuffs_GetGoldRank(buff) != 0 ? 0 : EntralinkBuffs_GetLevel(buff);
}

u32 EntralinkBuffs_GetTypeCard(u32 buff) {
    u32 i;

    for (i = 0; i < ENTRALINK_BUFF_TYPE_CARD_COUNT; i++) {
        if (sTypeCards[i] == buff) {
            return i;
        }
    }
    return ENTRALINK_BUFF_TYPE_CARD_NONE;
}

u32 EntralinkBuffs_GetTypeCount(u32 buff, u32 type) {
    u32 card = EntralinkBuffs_GetTypeCard(buff);

    if (card == ENTRALINK_BUFF_TYPE_CARD_NONE || type >= ENTRALINK_BUFF_CARD_TYPES) {
        return 0;
    }
    return EntralinkRun_GetState()->typeCounts[card][type];
}

u32 EntralinkBuffs_GetGoldSlot(u32 slot) {
    EntralinkRunState *state = EntralinkRun_GetState();
    u32 buff;

    if (slot >= ENTRALINK_BUFF_GOLD_SLOTS) {
        return ENTRALINK_BUFF_NONE;
    }
    // A slot of a gold at level 0 is free: the state before the first run's EntralinkBuffs_Clear is all 0
    buff = state->goldSlots[slot];
    return buff < ENTRALINK_BUFF_COUNT && state->buffLevels[buff] != 0 ? buff : ENTRALINK_BUFF_NONE;
}

u32 EntralinkBuffs_ListHeld(u8 *buffs, u32 max) {
    EntralinkRunState *state = EntralinkRun_GetState();
    u32 count = 0;
    u32 i;

    for (i = 0; i < ENTRALINK_BUFF_GOLD_SLOTS && count < max; i++) {
        if (EntralinkBuffs_GetGoldSlot(i) != ENTRALINK_BUFF_NONE) {
            buffs[count++] = state->goldSlots[i];
        }
    }
    for (i = 0; i < ENTRALINK_BUFF_COUNT && count < max; i++) {
        if (state->buffLevels[i] != 0 && EntralinkBuffs_GetGoldRank(i) == 0) {
            buffs[count++] = i;
        }
    }
    return count;
}

u32 EntralinkBuffs_GetKind(u32 buff) {
    return buff < ENTRALINK_BUFF_COUNT ? sValues[buff].kind : ENTRALINK_BUFF_NONE;
}

s32 EntralinkBuffs_GetValue(u32 buff, u32 level) {
    const EntralinkBuffValue *value;
    s32 step;
    u32 full;
    s32 total;

    if (buff >= ENTRALINK_BUFF_COUNT || level == 0) {
        return 0;
    }
    value = &sValues[buff];
    if (value->gold) {
        return value->values[(level > ENTRALINK_BUFF_MAX_RANK ? ENTRALINK_BUFF_MAX_RANK : level) - 1];
    }
    step = value->values[0];
    full = value->values[1] != 0 && level > (u32)value->values[1] ? value->values[1] : level;
    // Half a step for each pick past the soft limit, the halves added before rounding
    total = (2 * step * (s32)full + step * (s32)(level - full)) / 2;
    if (step >= 0 ? total > value->values[2] : total < value->values[2]) {
        total = value->values[2];
    }
    return total;
}
