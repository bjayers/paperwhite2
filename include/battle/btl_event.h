#ifndef POKEBW2_BATTLE_BTL_EVENT_H
#define POKEBW2_BATTLE_BTL_EVENT_H

#include "types.h"
#include "struct_decls.h"

// The battle events and their variables. swan names neither, so these names are ours: each event is named after the
// server function that fires it (btl_server_flow.c's ServerEvent_*, ServerControl_* for the ones fired through a
// parameter) or, where one function fires several, after what its handlers do; each variable after what the server
// sets it to and its handlers read or rewrite. The IDs without a name are fired and registered nowhere.

// What registered an item: an item's handlers run for every event, but a call can be limited to one factor type
enum {
    BATTLE_EVENT_FACTOR_MOVE = 0,
    BATTLE_EVENT_FACTOR_POS = 1,
    BATTLE_EVENT_FACTOR_SIDE = 2,
    BATTLE_EVENT_FACTOR_FIELD = 3,
    BATTLE_EVENT_FACTOR_ABILITY = 4,
    BATTLE_EVENT_FACTOR_ITEM = 5,
    // An item that BattleEventItem_ConvertToIsolated took out of its owner's list
    BATTLE_EVENT_FACTOR_ISOLATED = 6,
    // In a call: every factor type
    BATTLE_EVENT_FACTOR_ANY = 7,
};

// The events, the first member of a BattleEventHandlerEntry and the event of BattleEvent_CallHandlers
enum {
    // The empty entries of Magic Room's field handlers
    BATTLE_EVENT_NULL = 0x00,
    BATTLE_EVENT_ACTION_START = 0x01,
    BATTLE_EVENT_ACTION_END = 0x02,
    BATTLE_EVENT_MOVE_SEQUENCE_START = 0x03,
    BATTLE_EVENT_MOVE_SEQUENCE_END = 0x04,
    // Registered by moves that hit through a substitute (Defog, Dream Eater), but fired nowhere
    BATTLE_EVENT_BYPASS_SUBSTITUTE = 0x05,
    // Future Sight and Doom Desire: whether the move is delayed, then when it lands
    BATTLE_EVENT_CHECK_DELAY_MOVE = 0x06,
    BATTLE_EVENT_DELAY_MOVE_DECIDE = 0x07,
    // Snatch takes the move, Magic Coat and Magic Bounce reflect it
    BATTLE_EVENT_STEAL_MOVE = 0x08,
    BATTLE_EVENT_REFLECT_MOVE = 0x09,
    BATTLE_EVENT_CHECK_SURE_ESCAPE = 0x0b,
    BATTLE_EVENT_CHECK_ESCAPE_BLOCKED = 0x0c,
    BATTLE_EVENT_ESCAPE_MESSAGE = 0x0d,
    // Yawn's sleep, prevented by Insomnia, Leaf Guard or Uproar
    BATTLE_EVENT_CHECK_SLEEP_PREVENTED = 0x0e,
    // Moving first or last within a priority (Quick Claw, Custap Berry, Stall, Lagging Tail)
    BATTLE_EVENT_CHECK_SPECIAL_PRIORITY = 0x0f,
    BATTLE_EVENT_GET_MOVE_PRIORITY = 0x11,
    BATTLE_EVENT_CHECK_FLOATING = 0x12,
    BATTLE_EVENT_CALCULATE_SPEED = 0x13,
    // Focus Punch's tightening
    BATTLE_EVENT_BEFORE_FIGHT = 0x15,
    // The move that a calling move (Metronome, Assist, Sleep Talk, Copycat) runs
    BATTLE_EVENT_GET_CALLED_MOVE = 0x18,
    BATTLE_EVENT_SET_MOVE_MESSAGE = 0x19,
    BATTLE_EVENT_CHECK_MOVE_STEAL = 0x1a,
    BATTLE_EVENT_FLOATING_IMMUNE = 0x1b,
    BATTLE_EVENT_SKIP_ACCURACY_CHECK = 0x1c,
    // Whether a move can be used asleep (Snore, Sleep Talk)
    BATTLE_EVENT_CAN_USE_MOVE_ASLEEP = 0x1d,
    // Before the move is announced (Truant), then after (most moves' own fail checks)
    BATTLE_EVENT_CHECK_MOVE_FAIL = 0x1e,
    BATTLE_EVENT_CHECK_MOVE_FAIL_LATE = 0x1f,
    BATTLE_EVENT_MOVE_EXECUTE_FAIL = 0x21,
    // Once the PP is used, before the move's message (the Choice items' lock, Struggle)
    BATTLE_EVENT_MOVE_CALL_START = 0x22,
    // Once the move is recorded, before it runs (Feint, the pledges)
    BATTLE_EVENT_MOVE_CALL_DECIDE = 0x23,
    BATTLE_EVENT_MOVE_EXECUTE_START = 0x24,
    BATTLE_EVENT_MOVE_EXECUTE_EFFECTIVE = 0x25,
    BATTLE_EVENT_MOVE_EXECUTE_NO_EFFECT = 0x26,
    BATTLE_EVENT_MOVE_EXECUTE_END = 0x27,
    // A move's type, category and target before it runs (Normalize, Weather Ball, Hidden Power)
    BATTLE_EVENT_GET_MOVE_PARAM = 0x28,
    BATTLE_EVENT_DECIDE_MOVE_TARGET = 0x29,
    // Redirection (Follow Me, Lightningrod, Storm Drain)
    BATTLE_EVENT_BAIT_MOVE_TARGET = 0x2a,
    // The three no-effect checks of each target: the first is skipped by a sure hit; the second is mostly moves' own
    // (Dream Eater, Sucker Punch, Wide Guard); the third, after Protect, is the abilities' immunities (Soundproof,
    // Volt Absorb, Wonder Guard)
    BATTLE_EVENT_CHECK_NO_EFFECT_UNLESS_SURE_HIT = 0x2b,
    BATTLE_EVENT_CHECK_NO_EFFECT = 0x2c,
    BATTLE_EVENT_CHECK_NO_EFFECT_AFTER_PROTECT = 0x2d,
    BATTLE_EVENT_CHECK_PROTECT_BREAK = 0x2e,
    // Present
    BATTLE_EVENT_CHECK_DAMAGE_TO_RECOVER = 0x30,
    BATTLE_EVENT_APPLY_DAMAGE_TO_RECOVER = 0x31,
    BATTLE_EVENT_CHECK_ALWAYS_HIT = 0x32,
    // The accuracy and evasion stages of a hit check
    BATTLE_EVENT_CHECK_HIT = 0x33,
    BATTLE_EVENT_GET_MOVE_ACCURACY = 0x34,
    BATTLE_EVENT_CHECK_MULTIHIT_HITS = 0x35,
    BATTLE_EVENT_CHECK_CRITICAL = 0x36,
    // A move's base power, then its multiplier (BATTLE_EVENT_VAR_POWER_RATIO)
    BATTLE_EVENT_MOVE_BASE_POWER = 0x37,
    BATTLE_EVENT_MOVE_POWER_RATIO = 0x38,
    // Before the attacking stat is read: whose stat (Foul Play) and whether its stages count (Unaware)
    BATTLE_EVENT_BEFORE_ATTACK_STAT = 0x39,
    // Before the defending stat is read: which stat (Psyshock, Wonder Room) and whether its stages count
    BATTLE_EVENT_BEFORE_DEFENSE_STAT = 0x3a,
    // The attacking and defending stats' multipliers
    BATTLE_EVENT_ATTACK_STAT = 0x3b,
    BATTLE_EVENT_DEFENSE_STAT = 0x3c,
    BATTLE_EVENT_CHECK_TYPE_IMMUNITY_ENABLED = 0x3d,
    BATTLE_EVENT_CHECK_TYPE_EFFECTIVENESS = 0x3e,
    // Whether the move gets the same-type bonus (the pledges), then the bonus (Adaptability)
    BATTLE_EVENT_CHECK_SAME_TYPE = 0x40,
    BATTLE_EVENT_SAME_TYPE_BONUS = 0x41,
    BATTLE_EVENT_BEFORE_DAMAGE_DISPLAY = 0x44,
    BATTLE_EVENT_DAMAGE_DETERMINE = 0x45,
    // In the damage calculation: a fixed damage (Super Fang, Seismic Toss), the final multiplier (Tinted Lens, the
    // resist berries), then the end
    BATTLE_EVENT_FIXED_DAMAGE = 0x46,
    BATTLE_EVENT_DAMAGE_RATIO = 0x47,
    BATTLE_EVENT_DAMAGE_CALCULATED = 0x48,
    // A hit's reactions: Shield Dust's guard, then the contact and damage reactions, then Destiny Bond
    BATTLE_EVENT_DAMAGE_REACTION_PREVIOUS = 0x4a,
    BATTLE_EVENT_DAMAGE_REACTION = 0x4b,
    BATTLE_EVENT_DAMAGE_REACTION_AFTER = 0x4c,
    BATTLE_EVENT_AFTER_DAMAGE = 0x4d,
    BATTLE_EVENT_CALC_PP_DECREMENT = 0x4e,
    BATTLE_EVENT_DECREMENT_PP = 0x4f,
    BATTLE_EVENT_CALC_RECOIL = 0x50,
    BATTLE_EVENT_ADDED_STAT_CHANGE_CHANCE = 0x51,
    // Pursuit
    BATTLE_EVENT_INTERRUPT_SWITCH = 0x53,
    BATTLE_EVENT_SWITCH_OUT = 0x54,
    BATTLE_EVENT_MEMBER_IN = 0x55,
    BATTLE_EVENT_MEMBER_IN_PREVIOUS = 0x56,
    BATTLE_EVENT_MEMBER_IN_COMPLETE = 0x57,
    BATTLE_EVENT_ROTATION_IN = 0x58,
    BATTLE_EVENT_GET_MOVE_STAT_CHANGE_VALUE = 0x59,
    // A stat change's amount (Simple, Contrary)
    BATTLE_EVENT_STAT_CHANGE_AMOUNT = 0x5a,
    BATTLE_EVENT_CHECK_STAT_CHANGE = 0x5b,
    BATTLE_EVENT_STAT_CHANGE_FAILED = 0x5c,
    BATTLE_EVENT_STAT_CHANGE_APPLIED = 0x5d,
    BATTLE_EVENT_MOVE_STAT_CHANGE_APPLIED = 0x5e,
    BATTLE_EVENT_DECIDE_SPECIAL_MOVE_CONDITION = 0x60,
    BATTLE_EVENT_ADD_MOVE_CONDITION_STRING = 0x61,
    BATTLE_EVENT_MOVE_CONDITION_CONTINUE = 0x62,
    BATTLE_EVENT_CHECK_MOVE_ADD_CONDITION = 0x64,
    BATTLE_EVENT_MOVE_CONDITION_CHECK_FAIL = 0x65,
    BATTLE_EVENT_ADD_CONDITION_FAILED = 0x67,
    BATTLE_EVENT_CONDITION_CONFIRMED = 0x68,
    BATTLE_EVENT_MOVE_STATUS_CONFIRMED = 0x69,
    BATTLE_EVENT_GASTRO_ACID_CONFIRMED = 0x6a,
    BATTLE_EVENT_CONDITION_DAMAGE = 0x6b,
    BATTLE_EVENT_GET_FLINCH_CHANCE = 0x6c,
    BATTLE_EVENT_CHECK_FLINCH = 0x6d,
    BATTLE_EVENT_FLINCH_FAIL = 0x6e,
    BATTLE_EVENT_CHECK_OHKO_HIT = 0x70,
    BATTLE_EVENT_EQUIP_ITEM = 0x72,
    // A berry eaten for its effect alone (Bug Bite, Fling)
    BATTLE_EVENT_EQUIP_TEMP_ITEM = 0x73,
    BATTLE_EVENT_CHECK_ENDURE = 0x74,
    BATTLE_EVENT_ENDURE_USED = 0x75,
    // The turn's end: after the weather (Leftovers, Hydration), after the side and field effects (Speed Boost, the
    // orbs), and last (Zen Mode)
    BATTLE_EVENT_TURN_CHECK_EARLY = 0x76,
    BATTLE_EVENT_TURN_CHECK = 0x77,
    BATTLE_EVENT_TURN_CHECK_LATE = 0x78,
    BATTLE_EVENT_NOTIFY_AIR_LOCK = 0x79,
    BATTLE_EVENT_GET_WEATHER = 0x7a,
    BATTLE_EVENT_GET_WEIGHT_RATIO = 0x7b,
    BATTLE_EVENT_INCREASE_MOVE_WEATHER_TURNS = 0x7c,
    // After a weather change: whether it is blocked, then the reactions (Forecast, Flower Gift)
    BATTLE_EVENT_CHECK_WEATHER_REACTION = 0x7d,
    BATTLE_EVENT_AFTER_WEATHER_CHANGE = 0x7e,
    BATTLE_EVENT_CHECK_WEATHER_DAMAGE = 0x7f,
    BATTLE_EVENT_CHECK_SIMPLE_DAMAGE_ENABLED = 0x80,
    // The gems
    BATTLE_EVENT_DAMAGE_PROCESS_START = 0x81,
    // Whether a damaging move's after-hit effects run (Sheer Force skips them)
    BATTLE_EVENT_DAMAGE_PROCESS_END_CHECK = 0x82,
    // A damaging move's after-hit effects, in this order: 0x84 (Shadow Force), 0x83 (the target's, for HP damage:
    // Color Change, Red Card, Knock Off), 0x85 (the user's: Life Orb, Shell Bell), 0x86 (U-turn), 0x87 (Pickpocket,
    // for HP damage)
    BATTLE_EVENT_DAMAGE_PROCESS_END_HIT_REAL = 0x83,
    BATTLE_EVENT_DAMAGE_PROCESS_END_HIT_FIRST = 0x84,
    BATTLE_EVENT_DAMAGE_PROCESS_END_HIT_USER = 0x85,
    BATTLE_EVENT_DAMAGE_PROCESS_END_HIT_SWITCH = 0x86,
    BATTLE_EVENT_DAMAGE_PROCESS_END_HIT_REAL_LAST = 0x87,
    // The gems' end
    BATTLE_EVENT_DAMAGE_PROCESS_END = 0x88,
    BATTLE_EVENT_CHANGE_ABILITY_BEFORE = 0x89,
    BATTLE_EVENT_CHANGE_ABILITY_AFTER = 0x8a,
    BATTLE_EVENT_CHECK_FORCE_SWITCH_BLOCKED = 0x8b,
    // The amount drained, then its last rewrite (Liquid Ooze)
    BATTLE_EVENT_CALC_DRAIN_AMOUNT = 0x8c,
    BATTLE_EVENT_CALC_DRAIN_AMOUNT_END = 0x8d,
    BATTLE_EVENT_CALC_MOVE_HEAL_AMOUNT = 0x8f,
    BATTLE_EVENT_CHECK_HELD_ITEM_FAIL = 0x90,
    BATTLE_EVENT_CHECK_ITEM_REACTION = 0x91,
    BATTLE_EVENT_CHECK_CHARGE_FAIL = 0x93,
    BATTLE_EVENT_CHECK_CHARGE_SKIP = 0x94,
    BATTLE_EVENT_CHARGE_START = 0x95,
    BATTLE_EVENT_CHARGE_START_FIXED = 0x96,
    BATTLE_EVENT_CHARGE_SKIP_FIXED = 0x97,
    BATTLE_EVENT_CHARGE_RELEASE = 0x98,
    BATTLE_EVENT_CHECK_SEMI_INVULN_AVOID = 0x99,
    BATTLE_EVENT_CHECK_ITEM_SET = 0x9a,
    BATTLE_EVENT_ITEM_SET_FAILED = 0x9b,
    BATTLE_EVENT_ITEM_SET_DECIDE = 0x9c,
    BATTLE_EVENT_ITEM_SET_FIXED = 0x9d,
    BATTLE_EVENT_FIELD_EFFECT_MOVE = 0x9e,
    BATTLE_EVENT_CHECK_SIDE_EFFECT_PARAM = 0x9f,
    // An "uncategorized" move's effect (MOVE_QUALITY_SPECIAL): with targets, or without (the side and field moves)
    BATTLE_EVENT_UNCATEGORIZED_MOVE = 0xa0,
    BATTLE_EVENT_UNCATEGORIZED_MOVE_NO_TARGET = 0xa1,
    BATTLE_EVENT_REWRITE_MOVE_TYPE = 0xa2,
    BATTLE_EVENT_BEFORE_FAINT = 0xa3,
    BATTLE_EVENT_AFTER_MOVE = 0xa4,
};

// The event variables, the keys of BattleEventVar_SetValue and BattleEventVar_GetValue. Several are a flag or a
// value that each event uses for its own purpose (BATTLE_EVENT_VAR_FAIL_FLAG, BATTLE_EVENT_VAR_GENERAL_FLAG)
enum {
    // The key of a free slot of the stack, and of the start of a frame
    BATTLE_EVENT_VAR_NULL = 0x00,
    BATTLE_EVENT_VAR_FRAME_START = 0x01,
    // The Pokémon an event is about, not attacking or defending (a switch-in, a stat change's target)
    BATTLE_EVENT_VAR_MON = 0x02,
    BATTLE_EVENT_VAR_ATTACKER = 0x03,
    BATTLE_EVENT_VAR_DEFENDER = 0x04,
    // A move's targets: how many, then their IDs from BATTLE_EVENT_VAR_TARGET_1
    BATTLE_EVENT_VAR_TARGET_COUNT = 0x05,
    BATTLE_EVENT_VAR_TARGET_1 = 0x06,
    BATTLE_EVENT_VAR_TARGET_2 = 0x07,
    BATTLE_EVENT_VAR_TARGET_3 = 0x08,
    BATTLE_EVENT_VAR_TARGET_4 = 0x09,
    BATTLE_EVENT_VAR_TARGET_5 = 0x0a,
    BATTLE_EVENT_VAR_TARGET_6 = 0x0b,
    BATTLE_EVENT_VAR_ACTION = 0x0c,
    // A position: a delayed move's target, a called move's target (rewritten by the calling move)
    BATTLE_EVENT_VAR_POS = 0x0d,
    // A calling move's own target
    BATTLE_EVENT_VAR_ORIGINAL_POS = 0x0e,
    BATTLE_EVENT_VAR_PREVIOUS_ABILITY = 0x0f,
    BATTLE_EVENT_VAR_NEXT_ABILITY = 0x10,
    // 1 by default, 2 to move first (Quick Claw), 0 to move last (Stall)
    BATTLE_EVENT_VAR_SPECIAL_PRIORITY = 0x11,
    BATTLE_EVENT_VAR_MOVE = 0x12,
    // A move to run in place of the one starting (the pledges' combinations)
    BATTLE_EVENT_VAR_REPLACEMENT_MOVE = 0x13,
    BATTLE_EVENT_VAR_ORIGINAL_MOVE = 0x14,
    // The defender's type that a type-effectiveness check is for
    BATTLE_EVENT_VAR_DEFENDER_TYPE = 0x15,
    BATTLE_EVENT_VAR_MOVE_TYPE = 0x16,
    BATTLE_EVENT_VAR_MOVE_SLOT = 0x17,
    BATTLE_EVENT_VAR_MOVE_PRIORITY = 0x18,
    // The move that causes a stat change, or 0 (Mist)
    BATTLE_EVENT_VAR_STAT_CHANGE_MOVE = 0x19,
    BATTLE_EVENT_VAR_MOVE_CATEGORY = 0x1a,
    BATTLE_EVENT_VAR_MOVE_TARGET = 0x1b,
    BATTLE_EVENT_VAR_USER_TYPE = 0x1c,
    BATTLE_EVENT_VAR_CONDITION = 0x1d,
    // A condition's BattleCondition, raw
    BATTLE_EVENT_VAR_CONDITION_PARAM = 0x1e,
    BATTLE_EVENT_VAR_STAT = 0x1f,
    // An amount: a stat change's stages, PP used, HP drained
    BATTLE_EVENT_VAR_VOLUME = 0x20,
    // The defender's semi-invulnerable state (flying, digging, diving...)
    BATTLE_EVENT_VAR_SEMI_INVULN_STATE = 0x21,
    BATTLE_EVENT_VAR_FAIL_CAUSE = 0x22,
    BATTLE_EVENT_VAR_WEATHER_TURNS = 0x24,
    BATTLE_EVENT_VAR_FLINCH_CHANCE = 0x25,
    // An added effect's chance, or a bonus to it
    BATTLE_EVENT_VAR_ADDED_EFFECT_CHANCE = 0x26,
    BATTLE_EVENT_VAR_ACCURACY_STAGE = 0x27,
    BATTLE_EVENT_VAR_EVASION_STAGE = 0x28,
    BATTLE_EVENT_VAR_MAX_HITS = 0x29,
    BATTLE_EVENT_VAR_HIT_COUNT = 0x2a,
    BATTLE_EVENT_VAR_ACCURACY = 0x2b,
    BATTLE_EVENT_VAR_CRITICAL_STAGE = 0x2c,
    BATTLE_EVENT_VAR_ITEM = 0x2d,
    BATTLE_EVENT_VAR_ITEM_REACTION = 0x2e,
    BATTLE_EVENT_VAR_SPEED = 0x2f,
    BATTLE_EVENT_VAR_MOVE_POWER = 0x30,
    // fx32, 0x1000 for ×1
    BATTLE_EVENT_VAR_POWER_RATIO = 0x31,
    BATTLE_EVENT_VAR_DAMAGE = 0x32,
    // The attacking and defending stats' values
    BATTLE_EVENT_VAR_ATTACK = 0x33,
    BATTLE_EVENT_VAR_DEFENSE = 0x34,
    // A multiplier, fx32, 0x1000 for ×1: of a stat, the accuracy, the speed, the damage...
    BATTLE_EVENT_VAR_RATIO = 0x35,
    // Added to BATTLE_EVENT_VAR_RATIO after the recoil's handlers
    BATTLE_EVENT_VAR_RATIO_BONUS = 0x36,
    BATTLE_EVENT_VAR_FIXED_DAMAGE = 0x37,
    BATTLE_EVENT_VAR_TYPE_EFFECTIVENESS = 0x38,
    BATTLE_EVENT_VAR_WEATHER = 0x39,
    // What let a Pokémon endure a hit (Focus Sash, Focus Band, Sturdy, Endure)
    BATTLE_EVENT_VAR_ENDURE_CAUSE = 0x3a,
    // Whose attacking stat the attacker uses, 0x1f for its own (Foul Play's target)
    BATTLE_EVENT_VAR_ATTACK_STAT_MON = 0x3b,
    // The defending stat, and an odd value to swap Defense and Sp. Def (Psyshock and Wonder Room add 1)
    BATTLE_EVENT_VAR_DEFENSE_STAT = 0x3c,
    BATTLE_EVENT_VAR_DEFENSE_SWAP = 0x3d,
    // Nonzero to play a starting move's animation even if it does nothing (Charge), 2 to end the move there (Bide)
    BATTLE_EVENT_VAR_MOVE_EXECUTE_RESULT = 0x3e,
    // A BattleStrParam to set a message in
    BATTLE_EVENT_VAR_STRING = 0x3f,
    BATTLE_EVENT_VAR_NO_EFFECT = 0x40,
    BATTLE_EVENT_VAR_FAIL_FLAG = 0x41,
    // Whether a semi-invulnerable defender avoids the move; whether each hit of a multi-hit move checks accuracy
    BATTLE_EVENT_VAR_AVOID_FLAG = 0x42,
    // Whether the attacker has the move's type
    BATTLE_EVENT_VAR_SAME_TYPE = 0x44,
    // Whether a hit is critical; in the flinch chance, whether it is doubled (Serene Grace)
    BATTLE_EVENT_VAR_CRITICAL_FLAG = 0x45,
    // Whether the hit struck a substitute
    BATTLE_EVENT_VAR_SUBSTITUTE_FLAG = 0x46,
    // Whether the defender blocks the hit's added effects (Shield Dust)
    BATTLE_EVENT_VAR_SHIELD_DUST_FLAG = 0x47,
    // Whether the attacker skips its after-hit effects (Sheer Force)
    BATTLE_EVENT_VAR_SHEER_FORCE_FLAG = 0x48,
    // Whether Trick Room reverses the speed order
    BATTLE_EVENT_VAR_TRICK_ROOM_FLAG = 0x4a,
    // Whether something is ignored: the move's type (typeless), the evasion stages, a type immunity (Scrappy)
    BATTLE_EVENT_VAR_IGNORE_FLAG = 0x4b,
    // Whether a type-effectiveness check gives neutral
    BATTLE_EVENT_VAR_NEUTRAL_FLAG = 0x4c,
    // Whether the hit is a delayed move's (Future Sight)
    BATTLE_EVENT_VAR_DELAYED_FLAG = 0x4d,
    // The move parameter's first flag in a no-effect check, which no handler reads
    BATTLE_EVENT_VAR_MOVE_PARAM_FLAG = 0x4e,
    // Whether a charge fails (Sky Drop)
    BATTLE_EVENT_VAR_CHARGE_FAIL_FLAG = 0x4f,
    // Set FALSE in the target decision, which no handler reads
    BATTLE_EVENT_VAR_TARGET_FLAG = 0x50,
    BATTLE_EVENT_VAR_GENERAL_FLAG = 0x51,
    BATTLE_EVENT_VAR_SIDE = 0x52,
    BATTLE_EVENT_VAR_SIDE_EFFECT = 0x53,
};

// Checks whether an item's handlers are skipped for the item being run: the checking item, the server flow, the
// checked item's factor type, the event, and the checked item's sub ID and mon
typedef BOOL (*BattleEventSkipCheckFn)(BattleEventItem *item, BtlServerFlow *flow, u32 factorType, u32 event, u16 subId,
                                       u8 monId);
// Called with the item, the server flow, the item's mon and its work
typedef void (*BattleEventHandlerFn)(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work);

struct BattleEventHandlerEntry {
    u32 event;
    BattleEventHandlerFn handler;
};

// A registered handler table for an ability, item, move or other effect, 0x3c bytes; 0x84 are pooled
struct BattleEventItem {
    BattleEventItem *prev;
    BattleEventItem *next;
    const BattleEventHandlerEntry *handlers;
    BattleEventSkipCheckFn skipCheck;
    u32 factorType;
    // The priority level (7 minus the one it was added with) in the top byte, then the sub priority
    u32 priority;
    // The event call depth it was added at, which it isn't called at; its handlers aren't called while this is set
    // and deeper than the call
    u32 callDepth : 16;
    u32 numHandlers : 8;
    // Set while one of its handlers runs
    u32 running : 1;
    // Set until the turn's end, which BattleEvent_ClearTurnPause clears
    u32 unk25 : 1;
    u32 tempItem : 1;
    // Set when it was removed while running, to remove it once its handler returns
    u32 removeReserved : 1;
    // Lets its handlers be called again while one runs
    u32 recallEnable : 1;
    u32 active : 1;
    // Set while its mon is rotated out
    u32 sleeping : 1;
    u32 unk31 : 1;
    u32 work[7];
    u16 subId;
    u8 monId;
    u8 dependMonId;
};

// The event variables that handlers read and rewrite, a stack of frames that BattleEventVar_Push starts and
// BattleEventVar_Pop ends; keys[] holds 1 at the start of each frame
typedef struct {
    u32 sp;
    u16 keys[0x60];
    s32 values[0x60];
    s32 maxValues[0x60];
    s32 minValues[0x60];
    // 0, or 1 to be rewritten once (then 2), 3 to be multiplied and clamped, 4 constant
    u8 kinds[0x60];
} BattleEventVarStack;

void BattleEvent_Init(void);
void BattleEvent_ClearTurnPause(void);
void BattleEvent_DebugPrintFactorList(void);
BattleEventItem *BattleEvent_AddItem(u32 factorType, u16 subId, u32 priority, u32 subPriority, u8 monId,
                                     const BattleEventHandlerEntry *handlers, u16 numHandlers);
void BattleEvent_RemoveIsolatedItems(void);
BOOL BattleEvent_CheckSkip(BtlServerFlow *flow, BattleEventItem *item, u32 event);
BattleEventItem *BattleEvent_GetNextItem(BattleEventItem *item);
void BattleEvent_PausePersistentMoveItems(u8 monId);
void BattleEvent_ResumeMoveItems(u8 monId);
BattleEventItem *BattleEvent_AllocItem(void);
void BattleEvent_FreeItem(BattleEventItem *item);
void BattleEvent_ClearItem(BattleEventItem *item);
void BattleEventVar_Init(void);
void BattleEventVar_CheckReset(void);
// The line is the caller's source line, which they ignore
void BattleEventVar_Push(u32 line);
void BattleEventVar_Pop(u32 line);
void BattleEventVar_SetValue(u32 key, s32 value);
void BattleEventVar_SetConstValue(u32 key, s32 value);
void BattleEventVar_SetRewriteOnceValue(u32 key, s32 value);
void BattleEventVar_SetMulValue(u32 key, s32 value, s32 minValue, s32 maxValue);
BOOL BattleEventVar_GetValueIfExist(u16 key, s32 *value);
u32 BattleEventVar_FindSetIndex(BattleEventVarStack *vars, u32 key);
s32 BattleEventVar_FindIndex(BattleEventVarStack *vars, u16 key);
s32 BattleEventVar_ClampValue(BattleEventVarStack *vars, u32 index, s32 value);
// Whether the item's handlers are skipped for now
BOOL MoveEventItem_IsPersistent(BattleEventItem *item, s32 *work);

void BattleEventItem_ConvertToIsolated(BattleEventItem *item);
BOOL BattleEventItem_IsIsolated(BattleEventItem *item);
u16 BattleEventItem_GetSubID(BattleEventItem *item);
u8 HandlerGetMainModule(BattleEventItem *handler);
u32 BattleEventItem_GetWorkValue(BattleEventItem *item, u32 index);
void BattleEventItem_SetTempItemFlag(BattleEventItem *item);
void BattleEventItem_SetRecallEnable(BattleEventItem *item);
void BattleEventItem_SetWorkValue(BattleEventItem *item, u8 index, u32 value);
void BattleEvent_CallHandlersCore(BtlServerFlow *flow, u32 event, u32 factorType, BOOL checkSkip);
void BattleEvent_CallFactorHandlers(BtlServerFlow *flow, u32 event, u32 factorType);
void BattleEvent_CallHandlersSub(BtlServerFlow *flow, u32 event, u32 factorType, BOOL checkSkip);
void BattleEvent_ForceCallHandlers(BtlServerFlow *flow, u32 event);
void BattleEvent_CallHandlers(BtlServerFlow *flow, u32 event);
void BattleEventItem_AttachSkipCheckHandler(BattleEventItem *item, BattleEventSkipCheckFn handler);
void BattleEventItem_DetachSkipCheckHandler(BattleEventItem *item);
BattleEventItem *BattleEvent_SeekItem(u32 type, u32 monId);
void BattleEventItem_Remove(BattleEventItem *item);
void BattleEvent_ItemRotationSleep(u8 monId, u32 factorType);
BOOL BattleEvent_ItemRotationWake(u8 monId, u32 factorType);
u32 BattleEventVar_GetValue(u32 key);
BOOL BattleEventVar_RewriteValue(u16 key, s32 value);
void BattleEventVar_MulValue(u16 key, s32 value);

#endif // POKEBW2_BATTLE_BTL_EVENT_H
