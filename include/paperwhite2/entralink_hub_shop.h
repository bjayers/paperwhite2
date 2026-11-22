#ifndef PAPERWHITE2_ENTRALINK_HUB_SHOP_H
#define PAPERWHITE2_ENTRALINK_HUB_SHOP_H

#include "types.h"
#include "field/field_script.h"
#include "paperwhite2/entralink_progress.h"
#include "struct_decls.h"

// Paper White 2: the Entralink hub's shop and Dream Shards (entralink-buffs.md, section 19). Dream Shards are the
// roguelike's permanent currency, saved in the progress block (paperwhite2/entralink_progress.h): every run's end
// (a win, a loss, the forfeit, the back door, a warp away) gives run.json's room_shards for each room done, boss_shards
// more for each boss beaten and final_shards more for the final room. The hub's shop NPC sells blue and purple cards
// for them a pick at a time, each card's price rising by the picks of it bought (run.json's prices, then price_step a
// pick), at most total_cap picks in all; a reset gives every Shard spent back. The picks bought are held from every
// run's start, so they count toward each card's cap in the run and the offers treat them as held. A pick is saved by
// its card's key (EntralinkBuff's), so it stays with its card whatever the catalogue's order; one whose card is gone
// is held by no run until a reset gives its Shards back. Code in overlay 12, beside the run's script command, whose
// actions ENTRALINK_RUN_ACTION_SHARDS to ENTRALINK_RUN_ACTION_SHOP_RESET (paperwhite2/entralink_run_actions.h) it runs

// The Dream Shards a run's end gives for the run as it stands (its rooms done, and the bonuses of its bosses and final
// room beaten)
u32 EntralinkHubShop_GetRunShards(void);
// Adds Dream Shards to the save's (at most ENTRALINK_SHARDS_MAX); returns what it added
u32 EntralinkHubShop_AddShards(GameData *gameData, u32 shards);
// The picks bought in all, a gone card's among them
u32 EntralinkHubShop_CountBought(EntralinkProgress *progress);
// At a run's start: the picks bought, held (the run's buffs must be empty)
void EntralinkHubShop_HoldBought(GameData *gameData);
// The hub shop's actions of the script command EntralinkRun
void EntralinkHubShop_Action(FieldScriptEnv *env, u16 action, u16 arg, u16 arg2, u16 *result);

#endif // PAPERWHITE2_ENTRALINK_HUB_SHOP_H
