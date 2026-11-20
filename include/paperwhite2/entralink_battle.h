#ifndef PAPERWHITE2_ENTRALINK_BATTLE_H
#define PAPERWHITE2_ENTRALINK_BATTLE_H

#include "types.h"
#include "battle/btl_pokeparam.h"
#include "struct_decls.h"

// Paper White 2: the Entralink run's buffs in battle (docs/paperwhite2/design/entralink-buffs.md, phase 3), overlay
// 167's src/paperwhite2/ov167/paperwhite2_entralink_battle.c. At a run battle's start the battle reads what the run
// holds (ARM9 main's EntralinkRunState, paperwhite2/entralink_buffs.h) into a compact table of its own, each buff held
// with its value, and adds one event item, a field effect after every other handler, whose handlers give the player's
// side the buffs' effects: one handler a host event sums each damage bucket's entries, holds the sum to the bucket's
// cap and multiplies once a bucket, with vanilla's handlers on top. The same item carries the bosses' protections. The
// hooks below are the places in the original code that have no event

// The battle's server starts (BtlServerFlow_InitWork, after BattleEvent_Init): in a run battle, reads the run's
// buffs and adds their event item
void EntralinkBattle_Start(BtlServerFlow *flow);
// Whether the battle is a run's
BOOL EntralinkBattle_IsRun(void);

// The damage of a hit as ServerEvent_CalcDamage cuts it to 16 bits: in a run battle, at most the damage cap
// (settings' damage_cap, 60,000), and the last hit's full damage and whether it was clamped kept for the damage numbers
u32 EntralinkBattle_ClampDamage(BattleMon *defender, u32 damage);
// The last hit's full damage before the clamp, its target, and whether the clamp cut it (the damage numbers, phase 6)
u32 EntralinkBattle_GetLastHitDamage(u8 *monId, BOOL *clamped);

// The max HP that damage over time on a Pokémon is a fraction of: a run battle's foe's is at most one bar's
// (settings' boss_bar_hp, until phase 5's bars exist), anyone else's its max HP
u32 EntralinkBattle_GetResidualMaxHP(BattleMon *mon);
// DivideMaxHPZeroCheck on that max HP
u32 EntralinkBattle_DivideResidualHP(BattleMon *mon, u32 divisor);
// Bad poison's counter for its damage: on a boss, at most boss_toxic_cap sixteenths
u32 EntralinkBattle_GetToxicCounter(BattleMon *mon, u32 counter);
// The chance in 100 that a paralyzed Pokémon can't move (vanilla 25): a foe's by Lockjaw, a boss's times
// boss_full_paralysis percent
u32 EntralinkBattle_GetFullParalysisChance(BattleMon *mon, u32 chance);
// The chance in 100 that a confused Pokémon hits itself (vanilla 50): a foe's by Madness
u32 EntralinkBattle_GetConfusionSelfHitChance(BattleMon *mon, u32 chance);
// A condition's value as ServerControl_AddCondition gives it: sleep and confusion the team inflicts last longer
// (Deep Sleep, Vertigo), the team's own shorter (Quick Recovery), and a boss sleeps boss_sleep_turns turns at most
BattleCondition EntralinkBattle_GetConditionValue(BattleMon *target, BattleMon *attacker, u32 condition,
                                                  BattleCondition value);
// Whether a critical-hit stage gives a sure critical hit: 5 or more, in a run battle (the crit_stage kind)
BOOL EntralinkBattle_IsSureCritical(s32 stage);
// The percentage points the team's moves that flinch add to their flinch chance (Flinch Edge)
u32 EntralinkBattle_GetFlinchBonus(BattleMon *attacker);
// The HP a recovery move heals the team's Pokémon (Mending)
u32 EntralinkBattle_GetMoveHealAmount(BattleMon *mon, u32 amount);
// Whether a burned Pokémon of the team ignores burn's Attack drop (Fire Within)
BOOL EntralinkBattle_IgnoresBurnDrop(BattleMon *mon);

// Phase 4 (entralink-buffs.md, section 11)
// A move's effectiveness on a target as ServerControl_CheckMoveEffectiveness works it out, for the team's moves on a
// foe: Magnetised's chart on a paralyzed foe, and with roll (the move's own check, once a use and target) Spectral's
// chance that a damaging hit is super effective, past a type's immunity (abilities' immunities still hold: Levitate
// after this, Wonder Guard's target isn't rolled)
u32 EntralinkBattle_GetEffectiveness(BtlServerFlow *flow, BattleMon *attacker, BattleMon *target, u16 move, u32 type,
                                     u32 effectiveness, BOOL roll);
// Whether the team gives a foe a status past its type's immunity to it (Corrosion's poison, Wildfire's rank 3 burn)
BOOL EntralinkBattle_IgnoresStatusImmunity(BattleMon *target, BattleMon *attacker, u32 condition);
// The power of a confused Pokémon's hit on itself (vanilla 40): a foe's by Self-harm
u32 EntralinkBattle_GetConfusionPower(BattleMon *mon, u32 power);
// Leech Seed's drain on a Pokémon: a foe's a fraction of one bar, Parasite's (vanilla 1/8), times the residual buffs
u32 EntralinkBattle_GetLeechSeedDamage(BattleMon *mon);
// A heal of the team went past max HP by excess: Overflow deals its percent of it to the foe opposite (else the
// first)
void EntralinkBattle_Overheal(BtlServerFlow *flow, BattleMon *mon, u32 excess);
// Protect or Detect blocked a move: Thorn Guard heals the team's protected Pokémon and hurts a foe's contact move's
// user by 1/8 of its max HP (one bar's on a boss)
void EntralinkBattle_ProtectBlocked(BtlServerFlow *flow, BattleMon *attacker, BattleMon *target, u16 move);

#endif // PAPERWHITE2_ENTRALINK_BATTLE_H
