#include "types.h"
#include "constants/items.h"
#include "constants/pokemon.h"
#include "constants/species.h"
#include "gfl/heap.h"
#include "paperwhite2/entralink_buffs.h"
#include "paperwhite2/entralink_run_party.h"
#include "paperwhite2/prestige.h"
#include "pml/poke_party.h"
#include "save/box.h"
#include "system/game_data.h"

// Paper White 2: the Entralink run's team at level 100 (paperwhite2/entralink_run_party.h)

#define RUN_LEVEL 100

// Whether a Pokémon's held item decides its form, as the game's form-by-item code reads it
// (Box2Main_PokeItemFormChange, the party screen's PokeList item code): Arceus's plates, Genesect's Drives, Giratina's
// Griseous Orb
static BOOL EntralinkRun_IsFormItem(u32 species, u32 item) {
    switch (species) {
    case SPECIES_ARCEUS:
        return PaperWhite2_GetArceusPlateForm(item) != 0;
    case SPECIES_GENESECT:
        return PML_ItemGetGenesectDriveForme(item) != 0;
    case SPECIES_GIRATINA:
        return item == ITEM_GRISEOUS_ORB;
    }
    return FALSE;
}

// A swap at a rest stop (phase 7): the Pokémon that joined from the Reserve Box, by its PID, and whether it was at
// level 100 then (so its copy may gain prestige); the copy that left, by its PID, and its prestige as it left
typedef struct {
    u32 joinedPid;
    u32 leftPid;
    u32 leftPrestige;
    BOOL joinedAt100;
} RunSwap;

// The run's copies, the game's party while a run is on
static PokeParty sRunParty;
// The real party, in the save's party block, while the copies are the game's party; NULL otherwise
static PokeParty *sRealParty;
// The run's swaps in turn, and how many
static RunSwap sSwaps[ENTRALINK_RUN_SWAPS_MAX];
static u32 sSwapCount;

// Makes a copy the run's: level 100, healed, and holding no item but one that decides its form (the run's bag holds the
// run's own). An egg stays as it is
static void EntralinkRun_PrepareCopy(PartyPkm *pkm) {
    if (PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL)) {
        return;
    }
    if (PokeParty_GetParam(pkm, PKM_PARAM_LEVEL, NULL) != RUN_LEVEL) {
        setLevel(pkm, RUN_LEVEL);
    }
    PokeParty_Recover(pkm);
    if (!EntralinkRun_IsFormItem(PokeParty_GetParam(pkm, PKM_PARAM_SPECIES, NULL),
                                 PokeParty_GetParam(pkm, PKM_PARAM_ITEM, NULL))) {
        PokeParty_SetParam(pkm, PKM_PARAM_ITEM, ITEM_NONE);
    }
}

void EntralinkRun_KeepParty(GameData *gameData) {
    PokeParty *party = GameData_GetParty(gameData);
    int count;
    int i;

    if (sRealParty != NULL) {
        return;
    }
    PokeParty_Copy(party, &sRunParty);
    count = PokeParty_GetPkmCount(&sRunParty);
    for (i = 0; i < count; i++) {
        EntralinkRun_PrepareCopy(PokeParty_GetPkm(&sRunParty, i));
    }
    sSwapCount = 0;
    sRealParty = party;
    PaperWhite2_GameData_SetParty(gameData, &sRunParty);
}

// The run's copy of a real Pokémon, which keeps its PID, wherever the player has moved it in the party
static PartyPkm *EntralinkRun_FindPkm(PokeParty *party, u32 pid) {
    int count = PokeParty_GetPkmCount(party);
    PartyPkm *pkm;
    int i;

    for (i = 0; i < count; i++) {
        pkm = PokeParty_GetPkm(party, i);
        if (PokeParty_GetParam(pkm, PKM_PARAM_PID, NULL) == pid) {
            return pkm;
        }
    }
    return NULL;
}

BoxPkm *EntralinkRun_FindBoxPkm(GameData *gameData, u32 pid, u32 *box) {
    BoxSaveAccessor *boxes = GameData_GetBoxSaveAccessor(gameData);
    BoxPkm *pkm;
    u32 tray;
    u32 position;

    for (tray = 0; tray < BOX_MAX_TRAY; tray++) {
        for (position = 0; position < BOX_MAX_POS; position++) {
            pkm = BoxSaveAccessor_GetPkm(boxes, tray, position);
            // The PID isn't encrypted, so only a match is decrypted, to tell it from an empty slot
            if (pkm->pid == pid && PML_PkmGetParam(pkm, PKM_PARAM_SPECIES, NULL) != 0) {
                if (box != NULL) {
                    *box = tray;
                }
                return pkm;
            }
        }
    }
    return NULL;
}

// The prestige a Pokémon of the run ends it with: its copy's if it is still in the team, else its copy's as it last
// left; FALSE if it never had a copy
static BOOL EntralinkRun_GetEndPrestige(u32 pid, u32 *prestige) {
    PartyPkm *copy = EntralinkRun_FindPkm(&sRunParty, pid);
    int i;

    if (copy != NULL) {
        *prestige = PokeParty_GetParam(copy, PKM_PARAM_PRESTIGE, NULL);
        return TRUE;
    }
    for (i = sSwapCount - 1; i >= 0; i--) {
        if (sSwaps[i].leftPid == pid) {
            *prestige = sSwaps[i].leftPrestige;
            return TRUE;
        }
    }
    return FALSE;
}

void EntralinkRun_RestoreParty(GameData *gameData) {
    u32 count;
    u32 i;
    PartyPkm *pkm;
    BoxPkm *boxPkm;
    u32 prestige;

    if (sRealParty == NULL) {
        return;
    }
    count = PokeParty_GetPkmCount(sRealParty);
    for (i = 0; i < count; i++) {
        pkm = PokeParty_GetPkm(sRealParty, i);
        if (PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL) ||
            PokeParty_GetParam(pkm, PKM_PARAM_LEVEL, NULL) != RUN_LEVEL ||
            !EntralinkRun_GetEndPrestige(PokeParty_GetParam(pkm, PKM_PARAM_PID, NULL), &prestige)) {
            continue;
        }
        // Written only when it changed, so a Pokémon that gained none is as it was, byte for byte
        if (prestige != PokeParty_GetParam(pkm, PKM_PARAM_PRESTIGE, NULL)) {
            PokeParty_SetParam(pkm, PKM_PARAM_PRESTIGE, prestige);
        }
    }
    // The Pokémon that joined from the Reserve Box, by the same rule, in the box they are in (which the run never
    // touches otherwise)
    for (i = 0; i < sSwapCount; i++) {
        if (!sSwaps[i].joinedAt100 || !EntralinkRun_GetEndPrestige(sSwaps[i].joinedPid, &prestige)) {
            continue;
        }
        boxPkm = EntralinkRun_FindBoxPkm(gameData, sSwaps[i].joinedPid, NULL);
        if (boxPkm != NULL && PML_PkmGetParam(boxPkm, PKM_PARAM_LEVEL, NULL) == RUN_LEVEL &&
            prestige != PML_PkmGetParam(boxPkm, PKM_PARAM_PRESTIGE, NULL)) {
            PML_PkmSetParam(boxPkm, PKM_PARAM_PRESTIGE, prestige);
        }
    }
    sSwapCount = 0;
    PaperWhite2_GameData_SetParty(gameData, sRealParty);
    sRealParty = NULL;
}

BOOL EntralinkRun_HasJoined(u32 pid) {
    u32 i;

    for (i = 0; i < sSwapCount; i++) {
        if (sSwaps[i].joinedPid == pid) {
            return TRUE;
        }
    }
    return FALSE;
}

BOOL EntralinkRun_CanSwap(void) {
    return sRealParty != NULL && sSwapCount < ENTRALINK_RUN_SWAPS_MAX;
}

BOOL EntralinkRun_SwapIn(BoxPkm *joining, u32 slot, HeapID heapId) {
    PartyPkm *leaving;
    PartyPkm *copy;
    RunSwap *swap;

    if (!EntralinkRun_CanSwap() || slot >= (u32)PokeParty_GetPkmCount(&sRunParty)) {
        return FALSE;
    }
    leaving = PokeParty_GetPkm(&sRunParty, slot);
    swap = &sSwaps[sSwapCount++];
    swap->joinedPid = PML_PkmGetParam(joining, PKM_PARAM_PID, NULL);
    swap->joinedAt100 = PML_PkmGetParam(joining, PKM_PARAM_LEVEL, NULL) == RUN_LEVEL;
    swap->leftPid = PokeParty_GetParam(leaving, PKM_PARAM_PID, NULL);
    swap->leftPrestige = PokeParty_GetParam(leaving, PKM_PARAM_PRESTIGE, NULL);
    // A party Pokémon of the box one as it is now, in the leaving copy's place, then made a copy like the run's first
    // ones; its max HP takes the run's max_hp buffs once it is in the team (EntralinkRun_GetMaxHP)
    copy = boxPkmRegenToPartyPkm(joining, heapId);
    *leaving = *copy;
    GFL_HeapFree(copy);
    EntralinkRun_PrepareCopy(leaving);
    PokeParty_RecalcStats(leaving);
    PokeParty_Recover(leaving);
    return TRUE;
}

BOOL EntralinkRun_IsPartyKept(void) {
    return sRealParty != NULL;
}

BOOL EntralinkRun_CanGainPrestige(BoxPkm *pkm) {
    u32 pid;
    PartyPkm *real;
    u32 i;

    if (sRealParty == NULL) {
        return TRUE;
    }
    pid = PML_PkmGetParam(pkm, PKM_PARAM_PID, NULL);
    real = EntralinkRun_FindPkm(sRealParty, pid);
    if (real != NULL) {
        return PokeParty_GetParam(real, PKM_PARAM_LEVEL, NULL) == RUN_LEVEL;
    }
    // One that joined from the Reserve Box, by its level then
    for (i = 0; i < sSwapCount; i++) {
        if (sSwaps[i].joinedPid == pid) {
            return sSwaps[i].joinedAt100;
        }
    }
    return FALSE;
}

PokeParty *EntralinkRun_GetCatchParty(GameData *gameData) {
    return sRealParty != NULL ? sRealParty : GameData_GetParty(gameData);
}

u32 EntralinkRun_GetMaxHP(PartyPkm *pkm, u32 maxHP) {
    u32 percent;
    u32 buff;
    u32 raised;

    if (sRealParty == NULL || (u8 *)pkm >= (u8 *)sRealParty && (u8 *)pkm < (u8 *)(sRealParty + 1) ||
        EntralinkRun_FindPkm(&sRunParty, PokeParty_GetParam(pkm, PKM_PARAM_PID, NULL)) == NULL) {
        return maxHP;
    }
    percent = 0;
    for (buff = 0; buff < ENTRALINK_BUFF_COUNT; buff++) {
        if (EntralinkBuffs_GetKind(buff) == ENTRALINK_BUFF_KIND_MAX_HP) {
            percent += EntralinkBuffs_GetValue(buff, EntralinkBuffs_GetLevel(buff));
        }
    }
    raised = maxHP * (100 + percent) / 100;
    if (raised > ENTRALINK_BUFF_MAX_HP_LIMIT) {
        raised = ENTRALINK_BUFF_MAX_HP_LIMIT;
    }
    return raised > maxHP ? raised : maxHP;
}

void EntralinkRun_RefreshMaxHP(void) {
    int i;
    PartyPkm *pkm;

    if (sRealParty == NULL) {
        return;
    }
    for (i = 0; i < PokeParty_GetPkmCount(&sRunParty); i++) {
        pkm = PokeParty_GetPkm(&sRunParty, i);
        if (!PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL)) {
            PokeParty_RecalcStats(pkm);
        }
    }
}
