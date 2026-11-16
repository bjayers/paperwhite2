#include "types.h"
#include "constants/pokemon.h"
#include "paperwhite2/entralink_run_party.h"
#include "paperwhite2/prestige.h"
#include "pml/poke_party.h"
#include "system/game_data.h"

// Paper White 2: the Entralink run's team at level 100 (paperwhite2/entralink_run_party.h)

#define RUN_LEVEL 100

// The run's copies, the game's party while a run is on
static PokeParty sRunParty;
// The real party, in the save's party block, while the copies are the game's party; NULL otherwise
static PokeParty *sRealParty;

void EntralinkRun_KeepParty(GameData *gameData) {
    PokeParty *party = GameData_GetParty(gameData);
    PartyPkm *pkm;
    int count;
    int i;

    if (sRealParty != NULL) {
        return;
    }
    PokeParty_Copy(party, &sRunParty);
    count = PokeParty_GetPkmCount(&sRunParty);
    for (i = 0; i < count; i++) {
        pkm = PokeParty_GetPkm(&sRunParty, i);
        // An egg stays as it is
        if (PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL)) {
            continue;
        }
        if (PokeParty_GetParam(pkm, PKM_PARAM_LEVEL, NULL) != RUN_LEVEL) {
            setLevel(pkm, RUN_LEVEL);
        }
        PokeParty_Recover(pkm);
    }
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

void EntralinkRun_RestoreParty(GameData *gameData) {
    int count;
    int i;
    PartyPkm *pkm;
    PartyPkm *copy;
    u32 prestige;

    if (sRealParty == NULL) {
        return;
    }
    count = PokeParty_GetPkmCount(sRealParty);
    for (i = 0; i < count; i++) {
        pkm = PokeParty_GetPkm(sRealParty, i);
        if (PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL) ||
            PokeParty_GetParam(pkm, PKM_PARAM_LEVEL, NULL) != RUN_LEVEL) {
            continue;
        }
        copy = EntralinkRun_FindPkm(&sRunParty, PokeParty_GetParam(pkm, PKM_PARAM_PID, NULL));
        if (copy == NULL) {
            continue;
        }
        // Written only when it changed, so a Pokémon that gained none is as it was, byte for byte
        prestige = PokeParty_GetParam(copy, PKM_PARAM_PRESTIGE, NULL);
        if (prestige != PokeParty_GetParam(pkm, PKM_PARAM_PRESTIGE, NULL)) {
            PokeParty_SetParam(pkm, PKM_PARAM_PRESTIGE, prestige);
        }
    }
    PaperWhite2_GameData_SetParty(gameData, sRealParty);
    sRealParty = NULL;
}

BOOL EntralinkRun_IsPartyKept(void) {
    return sRealParty != NULL;
}

BOOL EntralinkRun_CanGainPrestige(BoxPkm *pkm) {
    PartyPkm *real;

    if (sRealParty == NULL) {
        return TRUE;
    }
    real = EntralinkRun_FindPkm(sRealParty, PML_PkmGetParam(pkm, PKM_PARAM_PID, NULL));
    return real != NULL && PokeParty_GetParam(real, PKM_PARAM_LEVEL, NULL) == RUN_LEVEL;
}

PokeParty *EntralinkRun_GetCatchParty(GameData *gameData) {
    return sRealParty != NULL ? sRealParty : GameData_GetParty(gameData);
}
