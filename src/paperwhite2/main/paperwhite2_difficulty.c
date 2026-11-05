#include "types.h"
#include "constants/pokemon.h"
#include "paperwhite2/difficulty.h"
#include "paperwhite2/level_scaling_config.h"
#include "pml/personal.h"
#include "pml/poke_party.h"
#include "save/key_info.h"
#include "save/save_control.h"
#include "system/game_data.h"

// Paper White 2: the difficulty's level change for trainers' Pokémon (paperwhite2/difficulty.h)

#define LEVEL_LOWEST 1
#define LEVEL_HIGHEST 100

// The opponents' clients, as the original's change of the shown level had them
static const u32 sOpponentClients[] = { 1, 3 };

s32 PaperWhite2_GetDifficultyLevels(GameData *gameData) {
    switch (GetGameDifficulty(getKeyInfoSaveBlk(GameData_GetSaveControl(gameData)))) {
    case GAME_DIFFICULTY_EASY:
        return LEVEL_SCALING_DIFFICULTY_EASY;
    case GAME_DIFFICULTY_CHALLENGE:
        return LEVEL_SCALING_DIFFICULTY_CHALLENGE;
    default:
        return LEVEL_SCALING_DIFFICULTY_NORMAL;
    }
}

void PaperWhite2_ApplyDifficulty(BtlSetup *setup, GameData *gameData) {
    s32 change = PaperWhite2_GetDifficultyLevels(gameData);
    PokeParty *party;
    PartyPkm *pkm;
    s32 level;
    u32 species;
    u32 i;
    s32 j;

    if (change == 0) {
        return;
    }
    for (i = 0; i < NELEMS(sOpponentClients); i++) {
        party = setup->party[sOpponentClients[i]];
        if (party == NULL) {
            continue;
        }
        for (j = 0; j < PokeParty_GetPkmCount(party); j++) {
            pkm = PokeParty_GetPkm(party, j);
            level = (s32)PokeParty_GetParam(pkm, PKM_PARAM_LEVEL, NULL) + change;
            if (level < LEVEL_LOWEST) {
                level = LEVEL_LOWEST;
            } else if (level > LEVEL_HIGHEST) {
                level = LEVEL_HIGHEST;
            }
            // As the Funfest's boost does (FesMissionGimmick_BoostPartyLevels): the Exp. of the level, then the stats
            species = PokeParty_GetParam(pkm, PKM_PARAM_SPECIES, NULL);
            PokeParty_SetParam(pkm, PKM_PARAM_EXP,
                               PML_UtilGetPkmLvExp(species, PokeParty_GetParam(pkm, PKM_PARAM_FORM, NULL), level));
            PokeParty_RecalcStats(pkm);
        }
    }
}
