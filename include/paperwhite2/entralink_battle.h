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
// (settings' damage_cap, 60,000); in every battle, the hit's full damage (at most 65,535) and whether the cap cut it
// kept for its target's damage number
u32 EntralinkBattle_ClampDamage(BattleMon *defender, u32 damage);
// Phase 6: before the damage of a move's hit shows (ServerControl_DamageListCore), puts each foe's damage number
// (SC_DAMAGE_NUMBER, paperwhite2/damage_numbers.h) when the attacker is the player's side's and the battle shows them.
// In a run battle each such hit is a candidate for the run's biggest hit as well (EntralinkRunState's bestHit, the
// records of paperwhite2/entralink_records.h), whether or not the numbers show
void EntralinkBattle_PutDamageNumbers(BtlServerFlow *flow, BattleMon *attacker, u32 move, u32 count,
                                      BattleMon **targets, const u8 *critical);
// As the battle ends (BtlMain's result): a run battle's turns, for the run's records (EntralinkRunState's
// battleTurns), the turn being played when it ended counted
void EntralinkBattle_End(BtlMainModule *mainModule);

// Phase 5: the enemies' scaling (entralink-buffs.md, section 12). A BattleMon was created from its party's source
// (PokeCon_CreateClientParty, for the server's and the client's copies): in a run battle, an enemy's place in its party
// is kept in it (BattleMonCore's entralinkScale) and its stats and HP are scaled by the run's multipliers for it
// (EntralinkRunState's enemyScale, set by the run as it starts the battle)
void EntralinkBattle_ScaleMon(BtlMainModule *mainModule, BattleMon *mon, u32 clientId, u32 index);
// Its HP and max HP as just read from its source (setupBySrcData), scaled; its max HP at most 65,535
void EntralinkBattle_ScaleHP(BattleMon *mon);
// Its Attack, Defense, Sp. Atk, Sp. Def and Speed as just read from its source (setupBySrcDataBase), scaled
void EntralinkBattle_ScaleStats(BattleMon *mon);
// The HP BattleMon_WriteToSrc gives its source: a scaled enemy's its share of the source's own max HP (a caught one
// keeps its normal stats and that share of its HP), anyone else's its HP
u32 EntralinkBattle_GetSrcHP(BattleMon *mon);

// The max HP that damage over time on a Pokémon is a fraction of: a run battle's foe's one health bar's
// (paperwhite2/entralink_bars.h: its max HP with a single bar), anyone else's its max HP
u32 EntralinkBattle_GetResidualMaxHP(BattleMon *mon);
// Rebalance 2: the most HP a heal can raise a Pokémon to: a run battle's foe with health bars no higher than the top of
// the bar its HP is in (once a bar is broken, no heal brings it back), anyone else its max HP. HPAdd holds every heal
// to it on the server's and the client's copies alike, and ServerControl_RecoverHPCheckFail fails a heal at it
u32 EntralinkBattle_GetHealLimit(BattleMon *mon);
// DivideMaxHPZeroCheck on the max HP that damage over time is a fraction of
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
// A move's flinch chance (0 for a move that doesn't flinch) for the team's moves: plus the flinch_chance cards' points,
// times the added_effect_chance cards' (Serene Touch), at most 100
u32 EntralinkBattle_GetFlinchChance(BattleMon *attacker, u32 chance);
// The condense: a recoil move's recoil (damage, at ratio percent of the damage dealt) in a run battle, at most ratio
// percent of the user's max HP, so a buffed hit costs what the move costs at normal damage; outside a run, damage
u32 EntralinkBattle_CapRecoil(BattleMon *mon, u32 damage, u32 ratio);
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
