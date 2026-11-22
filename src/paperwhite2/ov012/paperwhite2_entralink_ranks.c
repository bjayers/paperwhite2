#include "types.h"
#include "constants/pokemon.h"
#include "field/entree_forest.h"
#include "field/field.h"
#include "field/field_actor.h"
#include "field/field_script.h"
#include "field/field_script_event.h"
#include "gfl/std.h"
#include "nitro/math.h"
#include "paperwhite2/entralink_buffs.h"
#include "paperwhite2/entralink_hub_shop.h"
#include "paperwhite2/entralink_progress.h"
#include "paperwhite2/entralink_ranks.h"
#include "paperwhite2/entralink_records.h"
#include "paperwhite2/entralink_records_config.h"
#include "paperwhite2/entralink_run.h"
#include "paperwhite2/entralink_run_actions.h"
#include "paperwhite2/entralink_run_config.h"
#include "paperwhite2/entralink_run_state.h"
#include "pml/poke_party.h"
#include "system/game_data.h"
#include "system/game_event.h"
#include "system/game_system.h"
#include "system/vm.h"

// Paper White 2: the Entree's tree ranks and their rewards, in overlay 12 beside the run. See
// include/paperwhite2/entralink_ranks.h

// A reward's packing in ENTRALINK_RECORDS_REWARDS: its tree, then its rank
#define REWARD_TREE(packed) ((packed) >> 4)
#define REWARD_RANK(packed) ((packed) & 0xf)
// The trees' five models (ranks 0 and 1 share the first)
#define TREE_STAGE_MAX 4

// The hub's NPCs that come with a reward, by their actor IDs (res/field/events/entralink.json)
typedef struct {
    u8 reward;
    u8 actorId;
} HubNpc;

static const HubNpc sHubNpcs[] = {
    { ENTRALINK_REWARD_RESERVE_BOX, 5 }, { ENTRALINK_REWARD_HUB_SHOP, 6 },   { ENTRALINK_REWARD_DIFFICULTY, 7 },
    { ENTRALINK_REWARD_FOG, 8 },         { ENTRALINK_REWARD_SHARD_SHOP, 9 }, { ENTRALINK_REWARD_FORM_CHANGE, 10 },
};

static const u8 sRewards[ENTRALINK_RECORDS_REWARD_COUNT] = ENTRALINK_RECORDS_REWARDS;
static const u32 sBlackRanks[ENTRALINK_RECORDS_BLACK_RANK_COUNT] = ENTRALINK_RECORDS_BLACK_RANKS;

// Where the forest entrance's warp leads, which the run start's script uses once it has asked
static VecFx32 sForestWarpPos;

static EntralinkProgress *EntralinkRanks_GetProgress(GameData *gameData) {
    return EntralinkProgress_Get(GameData_GetSaveControl(gameData));
}

u32 EntralinkRanks_GetMilestones(EntralinkProgress *progress) {
    u32 reached = 0;

    if (EntralinkProgress_IsRunCompleted(progress)) {
        reached |= 1 << ENTREE_MILESTONE_BEAT_FINAL;
    }
    if (EntralinkRun_IsAllCaught(progress)) {
        reached |= 1 << ENTREE_MILESTONE_CATCH_ALL;
    }
    if (EntralinkRecords_IsCodexFull(progress)) {
        reached |= 1 << ENTREE_MILESTONE_FILL_CODEX;
    }
    if (EntralinkHubShop_CountBought(progress) >= ENTRALINK_RUN_SHOP_TOTAL_CAP) {
        reached |= 1 << ENTREE_MILESTONE_SHOP_CAP;
    }
    if (EntralinkRun_IsEveryRoomFound(progress)) {
        reached |= 1 << ENTREE_MILESTONE_ALL_ROOMS;
    }
    return reached;
}

static u32 EntralinkRanks_CountBits(u32 bits) {
    u32 count = 0;

    for (; bits != 0; bits >>= 1) {
        count += bits & 1;
    }
    return count;
}

u32 EntralinkRanks_GetWhite(EntralinkProgress *progress) {
    return EntralinkRanks_CountBits(EntralinkRanks_GetMilestones(progress) & ENTRALINK_RECORDS_WHITE_MILESTONES);
}

u32 EntralinkRanks_GetWhiteMax(void) {
    return EntralinkRanks_CountBits(ENTRALINK_RECORDS_WHITE_MILESTONES);
}

u32 EntralinkRanks_GetBlack(EntralinkProgress *progress) {
    u32 rank;

    for (rank = 0; rank < NELEMS(sBlackRanks); rank++) {
        if (progress->records.shardsEarned < sBlackRanks[rank]) {
            break;
        }
    }
    return rank;
}

u32 EntralinkRanks_GetBlackMax(void) {
    return ENTRALINK_RECORDS_BLACK_RANK_COUNT;
}

u32 EntralinkRanks_GetNextBlack(EntralinkProgress *progress) {
    u32 rank = EntralinkRanks_GetBlack(progress);

    return rank < NELEMS(sBlackRanks) ? sBlackRanks[rank] : 0;
}

static u32 EntralinkRanks_GetRank(EntralinkProgress *progress, u32 tree) {
    return tree == ENTRALINK_TREE_WHITE ? EntralinkRanks_GetWhite(progress) : EntralinkRanks_GetBlack(progress);
}

u32 EntralinkRanks_GetTreeStage(GameData *gameData, u32 tree) {
    u32 rank = EntralinkRanks_GetRank(EntralinkRanks_GetProgress(gameData), tree);

    if (rank <= 1) {
        return 0;
    }
    return rank - 1 < TREE_STAGE_MAX ? rank - 1 : TREE_STAGE_MAX;
}

BOOL EntralinkRanks_HasReward(GameData *gameData, u32 reward) {
    u32 packed;

    if (reward >= NELEMS(sRewards)) {
        return FALSE;
    }
    packed = sRewards[reward];
    return EntralinkRanks_GetRank(EntralinkRanks_GetProgress(gameData), REWARD_TREE(packed)) >= REWARD_RANK(packed);
}

// The hub's init script: each NPC whose reward isn't unlocked goes; returns how many went
static u32 EntralinkRanks_RemoveHubNpcs(GameSystem *gsys) {
    GameData *gameData = GSYS_GetGameData(gsys);
    MMSys *actors = Field_GetActorSystem(GSYS_GetField(gsys));
    FieldActor *actor;
    u32 removed = 0;
    u32 i;

    for (i = 0; i < NELEMS(sHubNpcs); i++) {
        if (EntralinkRanks_HasReward(gameData, sHubNpcs[i].reward)) {
            continue;
        }
        actor = FindFieldActor(actors, sHubNpcs[i].actorId);
        if (actor != NULL) {
            DeleteActor(actor);
            removed++;
        }
    }
    return removed;
}

GameEvent *EntralinkRanks_CreateRunStartEvent(GameSystem *gsys, const VecFx32 *warpPos, HeapID heapId) {
    if (!EntralinkRanks_HasReward(GSYS_GetGameData(gsys), ENTRALINK_REWARD_SKIP_ROUND)) {
        return NULL;
    }
    sForestWarpPos = *warpPos;
    return EventScriptCall_Create(gsys, SCRID_ENTRALINK_RUN_START, NULL, heapId);
}

// What changing a party Pokémon's form would do (ENTRALINK_FORM_*): its species' special form and back
static u32 EntralinkRanks_CheckForm(PartyPkm *pkm) {
    u32 special;

    if (pkm == NULL) {
        return ENTRALINK_FORM_NONE;
    }
    if (PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL)) {
        return ENTRALINK_FORM_EGG;
    }
    special = EntralinkRecords_GetSpecialForm(PokeParty_GetParam(pkm, PKM_PARAM_SPECIES, NULL));
    if (special == 0) {
        return ENTRALINK_FORM_NONE;
    }
    return PokeParty_GetParam(pkm, PKM_PARAM_FORM, NULL) == special ? ENTRALINK_FORM_TO_USUAL
                                                                    : ENTRALINK_FORM_TO_SPECIAL;
}

static PartyPkm *EntralinkRanks_GetPartyPkm(GameData *gameData, u32 slot) {
    PokeParty *party = GameData_GetParty(gameData);

    return slot < (u32)PokeParty_GetPkmCount(party) ? PokeParty_GetPkm(party, slot) : NULL;
}

static void EntralinkRanks_ChangeForm(PartyPkm *pkm) {
    switch (EntralinkRanks_CheckForm(pkm)) {
    case ENTRALINK_FORM_TO_SPECIAL:
        PokeParty_ChangeForme(pkm, EntralinkRecords_GetSpecialForm(PokeParty_GetParam(pkm, PKM_PARAM_SPECIES, NULL)));
        break;
    case ENTRALINK_FORM_TO_USUAL:
        PokeParty_ChangeForme(pkm, 0);
        break;
    }
}

// The head start's next pick: an offer as after a round 1 enemy room's battle; 0 once the picks are done
static u32 EntralinkRanks_DrawHeadStartOffer(GameData *gameData) {
    EntralinkRunState *state = EntralinkRun_GetState();

    MI_CpuFill8(state->offer, 0, sizeof(state->offer));
    if (state->headStartPicks == 0) {
        return 0;
    }
    state->headStartPicks--;
    return EntralinkBuffs_DrawOffer(gameData, ENTRALINK_BUFF_SOURCE_ENEMY, 1, state->offer, ENTRALINK_BUFF_OFFERS);
}

BOOL EntralinkRanks_Action(FieldScriptEnv *env, u16 action, u16 arg, u16 arg2, u16 *result) {
    GameSystem *gsys = FieldScriptEnv_GetGameSystem(env);
    GameData *gameData = GSYS_GetGameData(gsys);
    EntralinkProgress *progress = EntralinkRanks_GetProgress(gameData);
    EntralinkRunState *state = EntralinkRun_GetState();

    switch (action) {
    case ENTRALINK_RUN_ACTION_RANKS:
        *result = arg == 0 ? EntralinkRanks_RemoveHubNpcs(gsys) : EntralinkRanks_HasReward(gameData, arg2);
        break;
    case ENTRALINK_RUN_ACTION_HUB_FOG:
        if (arg != 0 && arg2 < ENTRALINK_HUB_FOG_COUNT) {
            progress->hubFog = arg2;
        }
        *result = progress->hubFog;
        break;
    case ENTRALINK_RUN_ACTION_FORM:
        if (arg == 0) {
            *result = EntralinkRanks_CheckForm(EntralinkRanks_GetPartyPkm(gameData, arg2));
        } else {
            EntralinkRanks_ChangeForm(EntralinkRanks_GetPartyPkm(gameData, arg2));
        }
        break;
    case ENTRALINK_RUN_ACTION_SKIP_ROUND:
        switch (arg) {
        case 0:
            EntralinkRun_Start(gameData, arg2 != 0);
            state->headStartPicks = state->placesSkipped != 0 ? ENTRALINK_RECORDS_SKIP_PICKS : 0;
            *result = state->headStartPicks;
            break;
        case 1:
            *result = EntralinkRanks_DrawHeadStartOffer(gameData);
            break;
        case 2:
            *result = MATH_MIN(ENTRALINK_RECORDS_SKIP_DUST, ENTRALINK_DUST_MAX - state->dust);
            state->dust += *result;
            break;
        default:
            ScriptWork_CallEvent(FieldScriptEnv_GetScriptWork(env),
                                 EventEntreeForestWarp_Create(gsys, 1, &sForestWarpPos, 0, 4));
            return TRUE;
        }
        break;
    }
    return FALSE;
}
