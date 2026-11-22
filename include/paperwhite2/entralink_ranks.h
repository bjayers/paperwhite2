#ifndef PAPERWHITE2_ENTRALINK_RANKS_H
#define PAPERWHITE2_ENTRALINK_RANKS_H

#include "types.h"
#include "field/field_script.h"
#include "nitro/fx.h"
#include "paperwhite2/entralink_progress.h"
#include "struct_decls.h"

// Paper White 2: the Entree's two trees and what their ranks unlock. The Black Tree's rank (0-5) is the Dream Shards
// earned (records.json's black_ranks), the White Tree's the milestones reached that count (white_milestones); the
// Entree's menu shows them (paperwhite2/entree_menu.h) and the hub's two trees grow with them (the original's
// White and Black level models, src/ov130/gimmick_funfest_levels.c). records.json's rewards say which tree's rank
// unlocks each reward: hub NPCs that appear only from their rank (the Reserve Box, the buff shop, the difficulty, fog,
// item shop and form NPCs), and the run's bonuses (a buff room first, more Dream Dust, more Dream Shards, skipping
// round 1). Code in overlay 12, which stays loaded while the monolith (overlay 143) runs;
// docs/paperwhite2/design/entralink-roguelike-prototype.md, "The ranks' rewards", has the details

// The trees (records.json's rewards' tree)
#define ENTRALINK_TREE_BLACK 0
#define ENTRALINK_TREE_WHITE 1

// The rewards, in records.json's rewards' order (ENTRALINK_RECORDS_REWARDS)
enum {
    ENTRALINK_REWARD_RESERVE_BOX,
    ENTRALINK_REWARD_HUB_SHOP,
    ENTRALINK_REWARD_BUFF_ROOM,
    ENTRALINK_REWARD_DUST_BONUS,
    ENTRALINK_REWARD_SHARD_BONUS,
    ENTRALINK_REWARD_DIFFICULTY,
    ENTRALINK_REWARD_FOG,
    ENTRALINK_REWARD_SHARD_SHOP,
    ENTRALINK_REWARD_SKIP_ROUND,
    ENTRALINK_REWARD_FORM_CHANGE,
    ENTRALINK_REWARD_COUNT,
};

// The White Tree's milestones, a bit each in records.json's white_milestones (ENTRALINK_RECORDS_WHITE_MILESTONES):
// the final room beaten, every catchable enemy of the rooms caught, every Nightmare and special form of the codex met,
// the hub shop's picks bought up to its cap, and every room of rooms/ entered
enum {
    ENTREE_MILESTONE_BEAT_FINAL,
    ENTREE_MILESTONE_CATCH_ALL,
    ENTREE_MILESTONE_FILL_CODEX,
    ENTREE_MILESTONE_SHOP_CAP,
    ENTREE_MILESTONE_ALL_ROOMS,
    ENTREE_MILESTONE_COUNT,
};

// The milestones reached, a bit each (ENTREE_MILESTONE_*), whether they count or not, the debug menu's included
u32 EntralinkRanks_GetMilestones(EntralinkProgress *progress);
// The White Tree's rank: the milestones that count reached; and how many count
u32 EntralinkRanks_GetWhite(EntralinkProgress *progress);
u32 EntralinkRanks_GetWhiteMax(void);
// The Black Tree's rank by the Shards earned, its highest, and the Shards the next rank needs (0 at the highest)
u32 EntralinkRanks_GetBlack(EntralinkProgress *progress);
u32 EntralinkRanks_GetBlackMax(void);
u32 EntralinkRanks_GetNextBlack(EntralinkProgress *progress);
// The debug menu's: a tree's rank (ENTRALINK_TREE_*) one higher, to its highest. The Black Tree's by the Shards earned
// set to the next rank's; the White Tree's by its first milestone that counts and isn't reached marked as reached
// (the progress block's debugMilestones). And both trees back to rank 0 as far as the debug menu can: no Shards
// earned and no debug milestones (milestones really reached stay)
void EntralinkRanks_DebugRaise(GameData *gameData, u32 tree);
void EntralinkRanks_DebugReset(GameData *gameData);
// The growth stage (0-4) of a tree (ENTRALINK_TREE_*), one of its five models: ranks 0 and 1 the first, then a stage
// a rank up to the fifth at rank 5
u32 EntralinkRanks_GetTreeStage(GameData *gameData, u32 tree);
// Whether a reward (ENTRALINK_REWARD_*) is unlocked: its tree's rank reached
BOOL EntralinkRanks_HasReward(GameData *gameData, u32 reward);
// The hub's forest entrance, at the tile that starts a run: with the skip_round reward the script that asks whether to
// skip round 1 and warps into the forest (the warp to warpPos), which the caller runs instead of its own warp; else
// NULL, and the caller starts the run itself
GameEvent *EntralinkRanks_CreateRunStartEvent(GameSystem *gsys, const VecFx32 *warpPos, HeapID heapId);
// The ranks' actions of the script command EntralinkRun (ENTRALINK_RUN_ACTION_RANKS to ENTRALINK_RUN_ACTION_TIER,
// paperwhite2/entralink_run_actions.h); TRUE when the script waits for an event
BOOL EntralinkRanks_Action(FieldScriptEnv *env, u16 action, u16 arg, u16 arg2, u16 *result);

#endif // PAPERWHITE2_ENTRALINK_RANKS_H
