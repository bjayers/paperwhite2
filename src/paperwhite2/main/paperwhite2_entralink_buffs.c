#include "types.h"
#include "nitro/mi.h"
#include "paperwhite2/entralink_buffs.h"
#include "paperwhite2/entralink_run_state.h"

// Paper White 2: what the Entralink run holds of the buffs, in ARM9 main for the battle's effects (phase 3). See
// include/paperwhite2/entralink_buffs.h

static const u8 sTypeCards[] = ENTRALINK_BUFF_TYPE_CARDS;

void EntralinkBuffs_Clear(void) {
    EntralinkRunState *state = EntralinkRun_GetState();

    MI_CpuFill8(state->buffLevels, 0, sizeof(state->buffLevels));
    MI_CpuFill8(state->goldSlots, ENTRALINK_BUFF_NONE, sizeof(state->goldSlots));
    MI_CpuFill8(state->typeCounts, 0, sizeof(state->typeCounts));
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
