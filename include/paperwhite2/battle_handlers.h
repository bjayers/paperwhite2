#ifndef PAPERWHITE2_BATTLE_HANDLERS_H
#define PAPERWHITE2_BATTLE_HANDLERS_H

#include "types.h"
#include "battle/btl_event.h"
#include "nitro/fx.h"
#include "struct_decls.h"

// Paper White 2: the battle handlers of the moves and abilities the hack adds, in
// src/paperwhite2/ov167/paperwhite2_battle.c (docs/paperwhite2/design/moves-and-abilities.md). move_handlers.c's
// sMoveEventAddTable and ability_handlers.c's sAbilityEventAddTable have a row for each, built while the move or
// ability is in generated/moves.txt or generated/abilities.txt, so that without them the ROM is the one before

// Grav Apple: 1.5 times the power while Gravity is in effect
const BattleEventHandlerEntry *PaperWhite2_EventAddGravApple(u32 *priority);
// Bulletproof: no effect from ball and bomb moves (MOVE_FLAG_BALLISTIC)
const BattleEventHandlerEntry *PaperWhite2_EventAddBulletproof(u32 *priority);

// Body Press: attacks with the user's Defense (BATTLE_EVENT_VAR_ATTACK_STAT, ServerEvent_GetAttackPower's hook)
const BattleEventHandlerEntry *PaperWhite2_EventAddBodyPress(u32 *priority);
// The attacking stat of a critical hit, for ServerEvent_GetAttackPower: the stat's drops ignored and its boosts kept,
// whichever stat the move attacks with (CritAtkDefLevel, which treats Defense as the defender's)
u32 PaperWhite2_GetCriticalAttack(BattleMon *mon, u32 stat);
// Fickle Beam: sometimes twice the power, with a message
const BattleEventHandlerEntry *PaperWhite2_EventAddFickleBeam(u32 *priority);
// Dragon Cheer: raises every ally's critical-hit stage, a Dragon type's twice (MOVE_TARGET_ALL_ALLIES)
const BattleEventHandlerEntry *PaperWhite2_EventAddDragonCheer(u32 *priority);
// Syrup Bomb's syrup at the end of a turn (condition_effects.c): the Pokémon's Speed falls
void PaperWhite2_ConditionEndTurnSyrup(BtlServerFlow *flow, u8 monId);
// Sweet Syrup: on entering, once a battle, the adjacent foes' evasion falls
const BattleEventHandlerEntry *PaperWhite2_EventAddSweetSyrup(u32 *priority);
// The battle's server starts (BtlServerFlow_Create): no Pokémon has used a once-a-battle ability yet
void PaperWhite2_BattleServerStart(void);
// Ripen, in item_handlers.c's Berries: what a Berry gives the Pokémon that eats it (the HP it restores, the stat
// stages, the damage the attacker takes), twice with Ripen, with the ability's popup; PaperWhite2_RipenEnd removes the
// popup after the Berry's work. PaperWhite2_RipenBerry checks that the item is a Berry, for a handler that other items
// share (the Oran Berry's, Berry Juice's)
s32 PaperWhite2_Ripen(BtlServerFlow *flow, u8 monId, s32 amount);
s32 PaperWhite2_RipenBerry(BtlServerFlow *flow, u8 monId, u16 item, s32 amount);
void PaperWhite2_RipenEnd(BtlServerFlow *flow, u8 monId);
// The damage ratio of a type-resist Berry: one half, a quarter with Ripen
fx32 PaperWhite2_RipenResistRatio(BtlServerFlow *flow, u8 monId);

#endif // PAPERWHITE2_BATTLE_HANDLERS_H
