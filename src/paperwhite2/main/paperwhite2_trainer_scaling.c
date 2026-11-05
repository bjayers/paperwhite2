#include "types.h"
#include "battle/trainer_data.h"
#include "constants/pokemon.h"
#include "field/player_state.h"
#include "field/zone.h"
#include "paperwhite2/conditions.h"
#include "paperwhite2/trainer_scaling.h"
#include "paperwhite2/trainer_scaling_config.h"
#include "pml/personal.h"
#include "pml/poke_party.h"
#include "system/area_data.h"
#include "system/game_data.h"

// Paper White 2: trainers' levels scaled to the player's party (paperwhite2/trainer_scaling.h)

#define LEVEL_LOWEST 1
#define LEVEL_HIGHEST 100
// The client of a partner on the player's side
#define CLIENT_ALLY 2
// The badge floor's entries, for 0 to 8 badges
#define BADGE_FLOOR_COUNT 9

typedef struct {
    s8 top;
    s8 bottom;
    BOOL belowOriginal;
} TrainerScalingTier;

typedef struct {
    u16 trainerId;
    u8 tier;
} TrainerScalingTrainer;

static const TrainerScalingTier sTiers[TRAINER_SCALING_TIER_COUNT] = { TRAINER_SCALING_TIERS };
static const u8 sClassTiers[TRAINER_SCALING_CLASS_COUNT] = { TRAINER_SCALING_CLASS_TIERS };
#if TRAINER_SCALING_TRAINER_COUNT > 0
static const TrainerScalingTrainer sTrainers[TRAINER_SCALING_TRAINER_COUNT] = { TRAINER_SCALING_TRAINERS };
#endif
static const u8 sBadgeFloor[BADGE_FLOOR_COUNT] = { TRAINER_SCALING_BADGE_FLOOR };

static s32 TrainerScaling_Clamp(s32 level) {
    if (level < LEVEL_LOWEST) {
        return LEVEL_LOWEST;
    }
    if (level > LEVEL_HIGHEST) {
        return LEVEL_HIGHEST;
    }
    return level;
}

// The trainer's tier: its own if listed, else its class's
static u32 TrainerScaling_GetTier(u32 trainerId, u32 trainerClass) {
#if TRAINER_SCALING_TRAINER_COUNT > 0
    u32 i;

    for (i = 0; i < TRAINER_SCALING_TRAINER_COUNT; i++) {
        if (sTrainers[i].trainerId == trainerId) {
            return sTrainers[i].tier;
        }
    }
#endif
    if (trainerClass >= TRAINER_SCALING_CLASS_COUNT) {
        return TRAINER_SCALING_TIER_FIXED;
    }
    return sClassTiers[trainerClass];
}

void PaperWhite2_TrainerScaling_Apply(BtlSetup *setup, GameData *gameData, u32 client, PokeParty *party,
                                      u32 trainerId) {
    ConditionContext ctx;
    const TrainerScalingTier *tier;
    u32 tierIndex;
    u32 badges;
    s32 basis;
    s32 top;
    s32 bottom;
    s32 ace;
    s32 original;
    s32 level;
    u32 species;
    PartyPkm *pkm;
    s32 i;

    if (trainerId == 0 || trainerId >= TRAINER_ID_BATTLE_INST_START || party == NULL) {
        return;
    }
    // The Black Tower's and White Treehollow's bosses keep their levels
    if (AreaData_IsInfinityDungeon(ZoneData_GetAreaID(PlayerState_GetZoneID(GameData_GetPlayerState(gameData))))) {
        return;
    }
    if (client == CLIENT_ALLY) {
        tierIndex = TRAINER_SCALING_ALLY_TIER;
    } else {
        tierIndex = TrainerScaling_GetTier(trainerId, setup->trainers[client]->trainerClass);
    }
    if (tierIndex >= TRAINER_SCALING_TIER_COUNT) {
        return;
    }
    tier = &sTiers[tierIndex];

    // The party's level, at least the badge floor (BtlSetup_LoadGameData has put the badges in)
    ConditionContext_Init(&ctx);
    ConditionContext_FillParty(&ctx, GameData_GetParty(gameData));
    badges = setup->unk98;
    if (badges >= BADGE_FLOOR_COUNT) {
        badges = BADGE_FLOOR_COUNT - 1;
    }
    basis = ctx.partyLevel;
    if (basis < sBadgeFloor[badges]) {
        basis = sBadgeFloor[badges];
    }
    top = TrainerScaling_Clamp(basis + tier->top);
    bottom = TrainerScaling_Clamp(basis + tier->bottom);

    ace = 0;
    for (i = 0; i < PokeParty_GetPkmCount(party); i++) {
        level = PokeParty_GetParam(PokeParty_GetPkm(party, i), PKM_PARAM_LEVEL, NULL);
        if (level > ace) {
            ace = level;
        }
    }
    for (i = 0; i < PokeParty_GetPkmCount(party); i++) {
        pkm = PokeParty_GetPkm(party, i);
        original = PokeParty_GetParam(pkm, PKM_PARAM_LEVEL, NULL);
        // Its gap below the ace kept, no lower than the bottom
        level = top - (ace - original);
        if (level < bottom) {
            level = bottom;
        }
        if (!tier->belowOriginal && level < original) {
            level = original;
        }
        level = TrainerScaling_Clamp(level);
        if (level == original) {
            continue;
        }
        // As the Funfest's boost does (FesMissionGimmick_BoostPartyLevels): the Exp. of the level, then the stats
        species = PokeParty_GetParam(pkm, PKM_PARAM_SPECIES, NULL);
        PokeParty_SetParam(pkm, PKM_PARAM_EXP,
                           PML_UtilGetPkmLvExp(species, PokeParty_GetParam(pkm, PKM_PARAM_FORM, NULL), level));
        PokeParty_RecalcStats(pkm);
    }
}
