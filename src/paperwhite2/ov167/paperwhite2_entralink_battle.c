#include "types.h"
#include "battle/btl_calc.h"
#include "battle/btl_event.h"
#include "battle/btl_handler.h"
#include "battle/btl_main.h"
#include "battle/btl_pokeparam.h"
#include "battle/btl_server_flow.h"
#include "constants/abilities.h"
#include "constants/battle.h"
#include "constants/moves.h"
#include "constants/types.h"
#include "gfl/std.h"
#include "nitro/fx.h"
#include "nitro/mi.h"
#include "paperwhite2/entralink_battle.h"
#include "paperwhite2/entralink_buffs.h"
#include "paperwhite2/entralink_run_battle.h"
#include "pml/move.h"

// Paper White 2: the Entralink run's buffs in battle and the bosses' protections (entralink-buffs.md, phase 3). See
// include/paperwhite2/entralink_battle.h. The effects are kinds (ENTRALINK_BUFF_KIND_*) read from the catalogue's data
// (ENTRALINK_BUFF_EFFECTS, generated from buffs.json), not one handler a card

// The battle's Pokémon IDs, 6 for each of 4 clients
#define BATTLE_MONS 24
// The most buffs the battle keeps: a type card counts once for each type it holds
#define BATTLE_BUFFS_MAX 64
// The event items' sub IDs, beside the field effects' (FIELD_CONDITION_*); and their priority, the last
#define EVENT_ITEM_SUB_ID 0xff
#define REACTION_ITEM_SUB_ID 0xfe
#define EVENT_ITEM_PRIORITY 7
// getMoveFlag's bits of MOVE_FLAG_CONTACT and MOVE_FLAG_PUNCH
#define MOVE_FLAG_BIT_CONTACT 0
#define MOVE_FLAG_BIT_PUNCH 7
// A type effectiveness's value for a neutral hit (TypeEffectivenessPowerMod): below it resisted, above super effective
#define EFFECTIVENESS_NEUTRAL 3
// The critical-hit stage from which a hit is a sure critical (the crit_stage kind), and the highest of the roll
#define SURE_CRITICAL_STAGE 5
// The endure cause that shows "[the Pokémon] endured the hit!" (ServerControl_Endure)
#define ENDURE_CAUSE_ENDURE 1
// The set messages: "[the Pokémon] regained health!", "[the Pokémon] lost some of its HP!" (Life Orb's), "[the
// Pokémon] is tormented!" (Bad Dreams'), "It doesn't affect [the Pokémon]..."
#define MESSAGE_REGAINED_HEALTH 0x183
#define MESSAGE_LOST_HP 0x3f5
#define MESSAGE_TORMENTED 0x1e4
#define MESSAGE_DOESNT_AFFECT 0xd2
// A weather move's turns (ServerControl_ChangeWeather's caller adds the event's to them), and the count of a weather
// that lasts the whole battle (btl_field.c)
#define WEATHER_TURNS_BASE 5
#define WEATHER_TURNS_PERMANENT 0xff
// What the battle keeps of each Pokémon (a bit each)
#define MON_ENTERED (1 << 0)
#define MON_SECOND_WIND_USED (1 << 1)
#define MON_FOCUSED (1 << 2)
#define MON_FIRST_BOOST_DONE (1 << 3)
// No type of a type card
#define BUFF_TYPE_ANY 0xff

// A buff the run holds, as the battle keeps it: the card, the type of a type card's stack, its level (a count or a
// gold's rank) and what that level gives in the kind's unit
typedef struct {
    u8 buff;
    u8 type;
    u8 level;
    s16 value;
} EntralinkBattleBuff;

// A hit, or a move, the effects' conditions are tested on; defender may be NULL
typedef struct {
    BattleMon *attacker;
    BattleMon *defender;
    u16 move;
    u8 moveType;
    u8 category;
    // The hit's type effectiveness, or 0xff where the event doesn't know it
    u8 effectiveness;
    u8 critical;
} EntralinkHit;

static struct {
    BOOL run;
    BOOL boss;
    u8 playerClient;
    u8 count;
    EntralinkBattleBuff buffs[BATTLE_BUFFS_MAX];
    // Each Pokémon's MON_* bits, its moves started, its turns' ends and the stat drops Clear Amulet blocked
    u8 monFlags[BATTLE_MONS];
    u8 movesUsed[BATTLE_MONS];
    u8 turns[BATTLE_MONS];
    u8 dropsBlocked[BATTLE_MONS];
    // The last hit's full damage, its target and whether the clamp cut it
    u32 lastDamage;
    u8 lastTarget;
    u8 lastClamped;
} sBattle;

static const EntralinkBuffEffect sEffects[ENTRALINK_BUFF_COUNT] = ENTRALINK_BUFF_EFFECTS;
static const u16 sBucketCaps[ENTRALINK_BUFF_BUCKET_COUNT] = ENTRALINK_BUFF_BUCKET_CAPS;
static const u16 sBucketVanillas[ENTRALINK_BUFF_BUCKET_COUNT] = ENTRALINK_BUFF_BUCKET_VANILLAS;
// The ENTRALINK_BUFF_STATUS_* of each major status (CONDITION_PARALYSIS to CONDITION_POISON)
static const u8 sStatusBits[] = {
    0,
    1 << ENTRALINK_BUFF_STATUS_PARALYSIS,
    1 << ENTRALINK_BUFF_STATUS_SLEEP,
    1 << ENTRALINK_BUFF_STATUS_FREEZE,
    1 << ENTRALINK_BUFF_STATUS_BURN,
    1 << ENTRALINK_BUFF_STATUS_POISON,
};
// The condition of each ENTRALINK_BUFF_STATUS_* a hit may give (frostbite has none yet: phase 4)
static const u8 sStatusConditions[] = {
    CONDITION_PARALYSIS, CONDITION_SLEEP, CONDITION_POISON,    CONDITION_BURN,
    CONDITION_FREEZE,    CONDITION_NONE,  CONDITION_CONFUSION,
};
// The MOVE_CATEGORY_* of each ENTRALINK_BUFF_MOVE_CATEGORY_*
static const u8 sCategories[] = { MOVE_CATEGORY_PHYSICAL, MOVE_CATEGORY_SPECIAL, MOVE_CATEGORY_STATUS };
// The BTL_WEATHER_* of each ENTRALINK_BUFF_WEATHER_* but any
static const u8 sWeathers[] = { BTL_WEATHER_SUN, BTL_WEATHER_RAIN, BTL_WEATHER_SANDSTORM, BTL_WEATHER_HAIL };

// ---- The team, the foes and the buffs held -------------------------------------------------------------------------

static BOOL IsTeamMon(u32 monId) {
    return sBattle.run && monId < BATTLE_MONS && IsAllyClientID(GetClientIDFromMonID(monId), sBattle.playerClient);
}

static BOOL IsFoeMon(u32 monId) {
    return sBattle.run && monId < BATTLE_MONS && !IsAllyClientID(GetClientIDFromMonID(monId), sBattle.playerClient);
}

static BOOL IsBossMon(u32 monId) {
    return sBattle.boss && IsFoeMon(monId);
}

static const EntralinkBattleBuff *FindKind(u32 kind) {
    u32 i;

    for (i = 0; i < sBattle.count; i++) {
        if (sEffects[sBattle.buffs[i].buff].kind == kind) {
            return &sBattle.buffs[i];
        }
    }
    return NULL;
}

// The buff of a custom or ability_like kind with its handler or ability, or NULL
static const EntralinkBattleBuff *FindHandler(u32 kind, u32 handler) {
    u32 i;
    const EntralinkBuffEffect *effect;

    for (i = 0; i < sBattle.count; i++) {
        effect = &sEffects[sBattle.buffs[i].buff];
        if (effect->kind == kind &&
            (kind == ENTRALINK_BUFF_KIND_ABILITY_LIKE ? effect->ability : effect->param) == handler) {
            return &sBattle.buffs[i];
        }
    }
    return NULL;
}

static u32 GetHandlerLevel(u32 kind, u32 handler) {
    const EntralinkBattleBuff *buff = FindHandler(kind, handler);

    return buff != NULL ? buff->level : 0;
}

// The sum of a kind's values with a parameter (any parameter for 0xff)
static s32 SumKind(u32 kind, u32 param) {
    u32 i;
    s32 sum = 0;
    const EntralinkBuffEffect *effect;

    for (i = 0; i < sBattle.count; i++) {
        effect = &sEffects[sBattle.buffs[i].buff];
        if (effect->kind == kind && (param == 0xff || effect->param == param)) {
            sum += sBattle.buffs[i].value;
        }
    }
    return sum;
}

static void AddBuff(u32 buff, u32 type, u32 level) {
    EntralinkBattleBuff *entry;

    if (level == 0 || sBattle.count >= BATTLE_BUFFS_MAX) {
        return;
    }
    entry = &sBattle.buffs[sBattle.count++];
    entry->buff = buff;
    entry->type = type;
    entry->level = level;
    entry->value = EntralinkBuffs_GetValue(buff, level);
}

// ---- Conditions and values -----------------------------------------------------------------------------------------

static u32 GetStatusBits(BattleMon *mon) {
    u32 status = GetBattleMonStatus(mon);
    u32 statuses = 0;

    if (status < NELEMS(sStatusBits) && status != 0) {
        statuses = sStatusBits[status] | (1 << ENTRALINK_BUFF_STATUS_ANY_MAJOR);
    }
    if (CheckCondition(mon, CONDITION_CONFUSION)) {
        statuses |= 1 << ENTRALINK_BUFF_STATUS_CONFUSION;
    }
    return statuses;
}

static BOOL IsWeatherBoosted(u32 weather, u32 type) {
    switch (weather) {
    case BTL_WEATHER_SUN:
        return type == TYPE_FIRE;
    case BTL_WEATHER_RAIN:
        return type == TYPE_WATER;
    case BTL_WEATHER_SANDSTORM:
        return type == TYPE_ROCK || type == TYPE_GROUND || type == TYPE_STEEL;
    case BTL_WEATHER_HAIL:
        return type == TYPE_ICE;
    }
    return FALSE;
}

static BOOL IsWeatherOf(u32 weathers, u32 weather) {
    u32 i;

    if (weather == BTL_WEATHER_NONE) {
        return FALSE;
    }
    if (weathers & (1 << ENTRALINK_BUFF_WEATHER_ANY)) {
        return TRUE;
    }
    for (i = 0; i < NELEMS(sWeathers); i++) {
        if ((weathers & (1 << i)) && sWeathers[i] == weather) {
            return TRUE;
        }
    }
    return FALSE;
}

static BOOL IsRecoilMove(u16 move) {
    return PML_MoveGetParam(move, MOVE_PARAM_RECOIL) != 0 || move == MOVE_JUMP_KICK || move == MOVE_HI_JUMP_KICK;
}

// Whether one of the condition's tests (an ENTRALINK_BUFF_COND_* bit) holds on the hit
static BOOL TestHolds(BtlServerFlow *flow, const EntralinkBuffEffect *effect, const EntralinkBattleBuff *buff,
                      const EntralinkHit *hit, u32 test) {
    BattleMon *attacker = hit->attacker;

    switch (test) {
    case ENTRALINK_BUFF_COND_DEFENDER_STATUS:
        return hit->defender != NULL && (GetStatusBits(hit->defender) & effect->defenderStatus);
    case ENTRALINK_BUFF_COND_ATTACKER_STATUS:
        return attacker != NULL && (GetStatusBits(attacker) & effect->attackerStatus);
    case ENTRALINK_BUFF_COND_MOVE_TYPE:
        return hit->moveType == effect->moveType;
    case ENTRALINK_BUFF_COND_CARD_TYPE:
        return hit->moveType == buff->type;
    case ENTRALINK_BUFF_COND_CATEGORY:
        return effect->category < NELEMS(sCategories) && hit->category == sCategories[effect->category];
    case ENTRALINK_BUFF_COND_STAB:
        return attacker != NULL && DoesMonHaveType(attacker, hit->moveType);
    case ENTRALINK_BUFF_COND_SUPER_EFFECTIVE:
        return hit->effectiveness != 0xff && hit->effectiveness > EFFECTIVENESS_NEUTRAL;
    case ENTRALINK_BUFF_COND_RESISTED:
        return hit->effectiveness != 0 && hit->effectiveness < EFFECTIVENESS_NEUTRAL;
    case ENTRALINK_BUFF_COND_CRITICAL:
        return hit->critical;
    case ENTRALINK_BUFF_COND_ATTACKER_HP_BELOW:
        return attacker != NULL && GetBattleMonStat(attacker, BATTLEMON_HP) * 100 <
                                       GetBattleMonStat(attacker, BATTLEMON_MAX_HP) * effect->hpBelow;
    case ENTRALINK_BUFF_COND_CONTACT:
        return getMoveFlag(hit->move, MOVE_FLAG_BIT_CONTACT);
    case ENTRALINK_BUFF_COND_PUNCH:
        return getMoveFlag(hit->move, MOVE_FLAG_BIT_PUNCH);
    case ENTRALINK_BUFF_COND_RECOIL_MOVE:
        return IsRecoilMove(hit->move);
    case ENTRALINK_BUFF_COND_DRAIN_MOVE:
        return PML_MoveGetQuality(hit->move) == MOVE_QUALITY_DAMAGE_DRAIN;
    case ENTRALINK_BUFF_COND_PRIORITY:
        return (s8)PML_MoveGetParam(hit->move, MOVE_PARAM_PRIORITY) > 0;
    case ENTRALINK_BUFF_COND_POWER_AT_MOST:
        return PML_MoveGetBasePower(hit->move) <= effect->powerAtMost;
    case ENTRALINK_BUFF_COND_WEATHER:
        return IsWeatherOf(effect->weathers, ServerEvent_GetWeather(flow));
    case ENTRALINK_BUFF_COND_WEATHER_BOOSTED:
        return IsWeatherBoosted(ServerEvent_GetWeather(flow), hit->moveType);
    case ENTRALINK_BUFF_COND_FIRST_TURN:
        return attacker != NULL && !GetAdditionalConditionFlag(attacker, 0);
    case ENTRALINK_BUFF_COND_BOSS:
        return hit->defender != NULL && IsBossMon(GetMonID(hit->defender));
    }
    return FALSE;
}

// Whether a buff's condition holds on the hit: every test of its condition, and one of its any condition's
static BOOL ConditionHolds(BtlServerFlow *flow, const EntralinkBattleBuff *buff, const EntralinkHit *hit) {
    const EntralinkBuffEffect *effect = &sEffects[buff->buff];
    u32 test;
    BOOL any;

    for (test = 1; test != 0 && test <= effect->condition; test <<= 1) {
        if ((effect->condition & test) && !TestHolds(flow, effect, buff, hit, test)) {
            return FALSE;
        }
    }
    if (effect->anyCondition == 0) {
        return TRUE;
    }
    any = FALSE;
    for (test = 1; test != 0 && test <= effect->anyCondition; test <<= 1) {
        if ((effect->anyCondition & test) && TestHolds(flow, effect, buff, hit, test)) {
            any = TRUE;
        }
    }
    return any;
}

// A value scaled as its effect says, for the team's Pokémon it is about (the attacker, or the defender for a defending
// stat): by its HP missing (the full value at 1 HP), its Speed over the target's (the full value at twice it) or its
// attacking stat's positive stages (the value a stage)
static s32 ScaleValue(BtlServerFlow *flow, const EntralinkBuffEffect *effect, s32 value, BattleMon *mon,
                      const EntralinkHit *hit) {
    u32 maxHP;
    u32 speed;
    u32 target;
    s32 stage;

    switch (effect->scale) {
    case ENTRALINK_BUFF_SCALE_MISSING_HP:
        maxHP = GetBattleMonStat(mon, BATTLEMON_MAX_HP);
        if (maxHP <= 1) {
            return 0;
        }
        return value * (s32)(maxHP - GetBattleMonStat(mon, BATTLEMON_HP)) / (s32)(maxHP - 1);
    case ENTRALINK_BUFF_SCALE_SPEED_GAP:
        if (hit->defender == NULL) {
            return 0;
        }
        speed = BtlServerFlow_CalcSpeed(flow, mon, FALSE);
        target = BtlServerFlow_CalcSpeed(flow, hit->defender, FALSE);
        if (target == 0 || speed <= target) {
            return speed > target ? value : 0;
        }
        if (speed - target >= target) {
            return value;
        }
        return value * (s32)(speed - target) / (s32)target;
    case ENTRALINK_BUFF_SCALE_ATTACK_STAGE:
        stage = (s32)GetBattleMonStat(mon, hit->category == MOVE_CATEGORY_SPECIAL ? BATTLEMON_SP_ATTACK_STAGE
                                                                                  : BATTLEMON_ATTACK_STAGE) -
                BATTLEMON_STAT_STAGE_NEUTRAL;
        return stage > 0 ? value * stage : 0;
    }
    return value;
}

// Whether a stat_ratio buff's stat is the one the event is about (attacking: the move's; defending: the hit's)
static BOOL IsStatOfHit(u32 stat, const EntralinkHit *hit) {
    switch (stat) {
    case ENTRALINK_BUFF_STAT_ATTACK:
    case ENTRALINK_BUFF_STAT_DEFENSE:
        return hit->category == MOVE_CATEGORY_PHYSICAL;
    case ENTRALINK_BUFF_STAT_SP_ATTACK:
    case ENTRALINK_BUFF_STAT_SP_DEFENSE:
        return hit->category == MOVE_CATEGORY_SPECIAL;
    case ENTRALINK_BUFF_STAT_ATTACKING:
    case ENTRALINK_BUFF_STAT_DEFENDING:
        return TRUE;
    }
    return FALSE;
}

// The sum of a bucket's entries that hold on the hit, held to the bucket's cap, for the team's Pokémon it is about;
// the entries exempt from the cap are summed apart, into exempt (if given)
static s32 SumBucket(BtlServerFlow *flow, u32 bucket, BattleMon *mon, const EntralinkHit *hit, s32 *exempt) {
    u32 i;
    s32 sum = 0;
    s32 value;
    const EntralinkBattleBuff *buff;
    const EntralinkBuffEffect *effect;

    for (i = 0; i < sBattle.count; i++) {
        buff = &sBattle.buffs[i];
        effect = &sEffects[buff->buff];
        if (effect->bucket != bucket || (effect->flags & ENTRALINK_BUFF_FLAG_NON_STAB)) {
            continue;
        }
        if (effect->kind == ENTRALINK_BUFF_KIND_STAT_RATIO && !IsStatOfHit(effect->param, hit)) {
            continue;
        }
        if (!ConditionHolds(flow, buff, hit)) {
            continue;
        }
        value = ScaleValue(flow, effect, buff->value, mon, hit);
        if ((effect->flags & ENTRALINK_BUFF_FLAG_EXEMPT_FROM_BUCKET_CAP) && exempt != NULL) {
            *exempt += value;
        } else {
            sum += value;
        }
    }
    return sum > sBucketCaps[bucket] ? sBucketCaps[bucket] : sum;
}

// A bucket's factor for its sum: (vanilla + sum) / vanilla, or for GUARD (100 - sum) / 100
static fx32 GetBucketFactor(u32 bucket, s32 sum) {
    if (bucket == ENTRALINK_BUFF_BUCKET_GUARD) {
        return FX32_ONE * (100 - sum) / 100;
    }
    return FX32_ONE * (sBucketVanillas[bucket] + sum) / sBucketVanillas[bucket];
}

static fx32 GetPercentFactor(s32 percent) {
    return FX32_ONE * (100 + percent) / 100;
}

// The hit of a damage event, from its variables
static void GetEventHit(BtlServerFlow *flow, EntralinkHit *hit) {
    u32 defender = BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER);
    s32 value;

    hit->attacker = GetBattleMon(flow, BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER));
    hit->defender = defender < BATTLE_MONS ? GetBattleMon(flow, defender) : NULL;
    hit->move = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE);
    hit->moveType = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_TYPE);
    hit->category =
        BattleEventVar_GetValueIfExist(BATTLE_EVENT_VAR_MOVE_CATEGORY, &value) ? value : PML_MoveGetCategory(hit->move);
    hit->effectiveness = BattleEventVar_GetValueIfExist(BATTLE_EVENT_VAR_TYPE_EFFECTIVENESS, &value) ? value : 0xff;
    hit->critical = BattleEventVar_GetValue(BATTLE_EVENT_VAR_CRITICAL_FLAG);
}

// ---- The damage buckets --------------------------------------------------------------------------------------------

// ATK: the team's attacking stat
static void HandlerAttackStat(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    EntralinkHit hit;

    if (IsTeamMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER))) {
        GetEventHit(flow, &hit);
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO,
                                GetBucketFactor(ENTRALINK_BUFF_BUCKET_ATK,
                                                SumBucket(flow, ENTRALINK_BUFF_BUCKET_ATK, hit.attacker, &hit, NULL)));
    }
}

// DEF: the team's defending stat
static void HandlerDefenseStat(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    EntralinkHit hit;

    if (IsTeamMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER))) {
        GetEventHit(flow, &hit);
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO,
                                GetBucketFactor(ENTRALINK_BUFF_BUCKET_DEF,
                                                SumBucket(flow, ENTRALINK_BUFF_BUCKET_DEF, hit.defender, &hit, NULL)));
    }
}

// First Strike's extra damage on the moves it gives priority (rank 2 on), in COND
static s32 GetFirstStrikeDamage(u32 monId) {
    const EntralinkBattleBuff *buff = FindHandler(ENTRALINK_BUFF_KIND_CUSTOM, ENTRALINK_BUFF_HANDLER_FIRST_STRIKE);

    if (buff == NULL || buff->level < 2 || sBattle.movesUsed[monId] > (buff->level >= 3 ? 2 : 1)) {
        return 0;
    }
    return buff->value;
}

// POW and COND: the team's moves' power
static void HandlerMovePower(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 attacker = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER);
    EntralinkHit hit;
    s32 cond;

    if (IsTeamMon(attacker)) {
        GetEventHit(flow, &hit);
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_POWER_RATIO,
                                GetBucketFactor(ENTRALINK_BUFF_BUCKET_POW,
                                                SumBucket(flow, ENTRALINK_BUFF_BUCKET_POW, hit.attacker, &hit, NULL)));
        cond = SumBucket(flow, ENTRALINK_BUFF_BUCKET_COND, hit.attacker, &hit, NULL) + GetFirstStrikeDamage(attacker);
        if (cond > sBucketCaps[ENTRALINK_BUFF_BUCKET_COND]) {
            cond = sBucketCaps[ENTRALINK_BUFF_BUCKET_COND];
        }
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_POWER_RATIO, GetBucketFactor(ENTRALINK_BUFF_BUCKET_COND, cond));
    }
}

// STAB: the team's same-type bonus (rewritten, as vanilla Adaptability does, on top of any vanilla rewrite), and for
// the moves of none of the Pokémon's types the STAB of the non_stab entries (Coverage), the highest
static void HandlerSameTypeBonus(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 mon = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON);
    EntralinkHit hit;
    u32 i;
    s32 best;
    const EntralinkBuffEffect *effect;

    if (!IsTeamMon(mon)) {
        return;
    }
    GetEventHit(flow, &hit);
    hit.attacker = GetBattleMon(flow, mon);
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_SAME_TYPE)) {
        BattleEventVar_RewriteValue(
            BATTLE_EVENT_VAR_RATIO,
            FX_Mul(BattleEventVar_GetValue(BATTLE_EVENT_VAR_RATIO),
                   GetBucketFactor(ENTRALINK_BUFF_BUCKET_STAB,
                                   SumBucket(flow, ENTRALINK_BUFF_BUCKET_STAB, hit.attacker, &hit, NULL))));
        return;
    }
    best = 0;
    for (i = 0; i < sBattle.count; i++) {
        effect = &sEffects[sBattle.buffs[i].buff];
        if ((effect->flags & ENTRALINK_BUFF_FLAG_NON_STAB) && sBattle.buffs[i].value > best &&
            ConditionHolds(flow, &sBattle.buffs[i], &hit)) {
            best = sBattle.buffs[i].value;
        }
    }
    if (best > 100 && BattleEventVar_GetValue(BATTLE_EVENT_VAR_RATIO) < FX32_ONE * best / 100) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_RATIO, FX32_ONE * best / 100);
    }
}

// MATCH, CRIT and FINAL on the team's hits; GUARD on the hits the team takes. MATCH's entries exempt from its cap
// (resisted hits only) lift a resisted hit at most to a neutral one's damage
static void HandlerDamageRatio(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    EntralinkHit hit;
    s32 exempt;
    fx32 lift;

    GetEventHit(flow, &hit);
    if (IsTeamMon(GetMonID(hit.attacker))) {
        exempt = 0;
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, GetBucketFactor(ENTRALINK_BUFF_BUCKET_MATCH,
                                                                        SumBucket(flow, ENTRALINK_BUFF_BUCKET_MATCH,
                                                                                  hit.attacker, &hit, &exempt)));
        if (exempt != 0 && hit.effectiveness != 0 && hit.effectiveness < EFFECTIVENESS_NEUTRAL) {
            lift = GetPercentFactor(exempt);
            // ×2 lifts a halved hit to neutral, ×4 a quartered one
            if (lift > FX32_ONE << (EFFECTIVENESS_NEUTRAL - hit.effectiveness)) {
                lift = FX32_ONE << (EFFECTIVENESS_NEUTRAL - hit.effectiveness);
            }
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, lift);
        }
        if (hit.critical) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, GetBucketFactor(ENTRALINK_BUFF_BUCKET_CRIT,
                                                                            SumBucket(flow, ENTRALINK_BUFF_BUCKET_CRIT,
                                                                                      hit.attacker, &hit, NULL)));
        }
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, GetBucketFactor(ENTRALINK_BUFF_BUCKET_FINAL,
                                                                        SumBucket(flow, ENTRALINK_BUFF_BUCKET_FINAL,
                                                                                  hit.attacker, &hit, NULL)));
    }
    if (hit.defender != NULL && IsTeamMon(GetMonID(hit.defender))) {
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, GetBucketFactor(ENTRALINK_BUFF_BUCKET_GUARD,
                                                                        SumBucket(flow, ENTRALINK_BUFF_BUCKET_GUARD,
                                                                                  hit.defender, &hit, NULL)));
    }
}

// ---- Stats, accuracy, critical hits --------------------------------------------------------------------------------

// The team's Speed (stat_ratio speed, outside the buckets: each card multiplies)
static void HandlerSpeed(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 mon = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON);
    EntralinkHit hit;
    u32 i;
    const EntralinkBuffEffect *effect;

    if (!IsTeamMon(mon)) {
        return;
    }
    MI_CpuFill8(&hit, 0, sizeof(hit));
    hit.attacker = GetBattleMon(flow, mon);
    hit.effectiveness = 0xff;
    for (i = 0; i < sBattle.count; i++) {
        effect = &sEffects[sBattle.buffs[i].buff];
        if (effect->kind == ENTRALINK_BUFF_KIND_STAT_RATIO && effect->param == ENTRALINK_BUFF_STAT_SPEED &&
            ConditionHolds(flow, &sBattle.buffs[i], &hit)) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, GetPercentFactor(sBattle.buffs[i].value));
        }
    }
}

// The team's accuracy; Sandman's sleep moves never miss
static void HandlerAccuracy(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    EntralinkHit hit;
    u32 i;
    const EntralinkBuffEffect *effect;

    if (!IsTeamMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER))) {
        return;
    }
    GetEventHit(flow, &hit);
    for (i = 0; i < sBattle.count; i++) {
        effect = &sEffects[sBattle.buffs[i].buff];
        if (effect->kind == ENTRALINK_BUFF_KIND_ACCURACY && ConditionHolds(flow, &sBattle.buffs[i], &hit)) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, GetPercentFactor(sBattle.buffs[i].value));
        }
    }
    if (GetHandlerLevel(ENTRALINK_BUFF_KIND_CUSTOM, ENTRALINK_BUFF_HANDLER_SANDMAN) != 0 &&
        hit.category == MOVE_CATEGORY_STATUS && PML_MoveGetParam(hit.move, MOVE_PARAM_CONDITION) == CONDITION_SLEEP) {
        // The ratio's highest, past any evasion
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(32));
    }
}

// The team's critical-hit stages; Focus's pending sure critical hit is spent on the next attack
static void HandlerCritical(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 attacker = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER);
    EntralinkHit hit;
    u32 i;
    s32 stages;

    if (!IsTeamMon(attacker)) {
        return;
    }
    GetEventHit(flow, &hit);
    stages = 0;
    for (i = 0; i < sBattle.count; i++) {
        if (sEffects[sBattle.buffs[i].buff].kind == ENTRALINK_BUFF_KIND_CRIT_STAGE &&
            ConditionHolds(flow, &sBattle.buffs[i], &hit)) {
            stages += sBattle.buffs[i].value;
        }
    }
    if (sBattle.monFlags[attacker] & MON_FOCUSED) {
        sBattle.monFlags[attacker] &= ~MON_FOCUSED;
        stages += SURE_CRITICAL_STAGE;
    }
    if (stages != 0) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_CRITICAL_STAGE,
                                    BattleEventVar_GetValue(BATTLE_EVENT_VAR_CRITICAL_STAGE) + stages);
    }
}

// ---- Damage over time and the turn's end ---------------------------------------------------------------------------

// Whether a residual source covers a condition's damage (CONDITION_DAMAGE) or the weather's (CONDITION_NONE)
static BOOL IsResidualOf(u32 source, u32 condition) {
    switch (source) {
    case ENTRALINK_BUFF_RESIDUAL_ANY:
        return TRUE;
    case ENTRALINK_BUFF_RESIDUAL_POISON:
        return condition == CONDITION_POISON;
    case ENTRALINK_BUFF_RESIDUAL_BURN:
        return condition == CONDITION_BURN;
    case ENTRALINK_BUFF_RESIDUAL_SLEEP:
        return condition == CONDITION_NIGHTMARE;
    case ENTRALINK_BUFF_RESIDUAL_WEATHER:
        return condition == CONDITION_NONE;
    }
    return FALSE;
}

// A foe's residual damage times the team's residual_ratio buffs of its source
static s32 GetResidualDamage(u32 condition, s32 damage) {
    u32 i;
    const EntralinkBuffEffect *effect;

    for (i = 0; i < sBattle.count; i++) {
        effect = &sEffects[sBattle.buffs[i].buff];
        if (effect->kind == ENTRALINK_BUFF_KIND_RESIDUAL_RATIO && IsResidualOf(effect->param, condition)) {
            damage = damage * (100 + sBattle.buffs[i].value) / 100;
        }
    }
    return damage;
}

static void HandlerConditionDamage(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    s32 damage;

    if (IsFoeMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON))) {
        damage = BattleEventVar_GetValue(BATTLE_EVENT_VAR_DAMAGE);
        if (damage > 0) {
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_DAMAGE,
                                        GetResidualDamage(BattleEventVar_GetValue(BATTLE_EVENT_VAR_CONDITION), damage));
        }
    }
}

// Sand and hail: none on the team with Overcoat or a team_immune buff (Sandblast), more on the foes
static void HandlerWeatherDamage(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 mon = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON);
    s32 damage = BattleEventVar_GetValue(BATTLE_EVENT_VAR_DAMAGE);
    u32 i;
    BOOL immune;

    if (damage <= 0) {
        return;
    }
    if (IsTeamMon(mon)) {
        immune = GetHandlerLevel(ENTRALINK_BUFF_KIND_ABILITY_LIKE, ABILITY_OVERCOAT) != 0;
        for (i = 0; i < sBattle.count; i++) {
            if (sEffects[sBattle.buffs[i].buff].flags & ENTRALINK_BUFF_FLAG_TEAM_IMMUNE) {
                immune = TRUE;
            }
        }
        if (immune) {
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, TRUE);
        }
    } else if (IsFoeMon(mon)) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_DAMAGE, GetResidualDamage(CONDITION_NONE, damage));
    }
}

static void PushRecoverHP(BtlServerFlow *flow, u32 monId, u32 amount) {
    BattleHandlerRecoverHPParam *param;

    if (amount == 0) {
        amount = 1;
    }
    param = BattleHandler_PushWork(flow, BATTLE_HANDLER_RECOVER_HP, monId);
    param->targetIndex = monId;
    param->amount = amount;
    BattleHandler_StrSetup(&param->string, BATTLE_HANDLER_STR_SET, MESSAGE_REGAINED_HEALTH);
    BattleHandler_AddArg(&param->string, monId);
    BattleHandler_PopWork(flow, param);
}

static void PushStatChange(BtlServerFlow *flow, u32 monId, u32 stat, s32 change) {
    BattleHandlerStatChangeParam *param = BattleHandler_PushWork(flow, BATTLE_HANDLER_STAT_CHANGE, monId);

    param->stat = stat;
    param->change = change;
    param->count = 1;
    param->monIds[0] = monId;
    BattleHandler_PopWork(flow, param);
}

// Shed Skin: a chance at the turn's end to cure the team's major status
static void HandlerTurnCheckEarly(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 mon = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON);
    s32 chance;
    BattleHandlerCureConditionParam *param;

    if (IsTeamMon(mon) && GetBattleMonStatus(GetBattleMon(flow, mon)) != 0) {
        chance = SumKind(ENTRALINK_BUFF_KIND_STATUS_CURE_CHANCE, 0xff);
        if (chance > 0 && BattleRandom(100) < chance) {
            param = BattleHandler_PushWork(flow, BATTLE_HANDLER_CURE_CONDITION, mon);
            param->condition = CONDITION_ANY_STATUS;
            param->monIds[0] = mon;
            param->count = 1;
            BattleHandler_PopWork(flow, param);
        }
    }
}

// The turn's end: the team's Regrowth heals, Speed Boost raises Speed (rank 1 every second turn); a sleeping foe
// takes Nightmare Field's damage
static void HandlerTurnCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 mon = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON);
    BattleMon *battleMon;
    const EntralinkBattleBuff *buff;
    u32 level;
    BattleHandlerDamageParam *param;

    if (mon >= BATTLE_MONS) {
        return;
    }
    battleMon = GetBattleMon(flow, mon);
    if (IsFainted(battleMon)) {
        return;
    }
    if (IsTeamMon(mon)) {
        if (sBattle.turns[mon] < 0xff) {
            sBattle.turns[mon]++;
        }
        buff = FindKind(ENTRALINK_BUFF_KIND_HEAL_PER_TURN);
        if (buff != NULL && buff->value > 0 && !IsMonFullHP(battleMon)) {
            PushRecoverHP(flow, mon, GetBattleMonStat(battleMon, BATTLEMON_MAX_HP) / buff->value);
        }
        level = GetHandlerLevel(ENTRALINK_BUFF_KIND_ABILITY_LIKE, ABILITY_SPEED_BOOST);
        if (level != 0 && GetAdditionalConditionFlag(battleMon, 0) && (level >= 2 || sBattle.turns[mon] % 2 == 0)) {
            PushStatChange(flow, mon, BATTLEMON_SPEED_STAGE, 1);
        }
    } else if (IsFoeMon(mon) && CheckCondition(battleMon, CONDITION_SLEEP)) {
        buff = FindKind(ENTRALINK_BUFF_KIND_RESIDUAL_FRACTION);
        if (buff != NULL && sEffects[buff->buff].param == ENTRALINK_BUFF_FRACTION_SLEEPING_FOES && buff->value > 0) {
            param = BattleHandler_PushWork(flow, BATTLE_HANDLER_DAMAGE, mon);
            param->targetIndex = mon;
            param->amount = EntralinkBattle_DivideResidualHP(battleMon, buff->value);
            BattleHandler_StrSetup(&param->string, BATTLE_HANDLER_STR_SET, MESSAGE_TORMENTED);
            BattleHandler_AddArg(&param->string, mon);
            BattleHandler_PopWork(flow, param);
        }
    }
}

// ---- Heals, recoil, chances, turns ---------------------------------------------------------------------------------

// Big Root: the team's draining heals more
static void HandlerDrainAmount(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    s32 more;

    if (IsTeamMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER))) {
        more = SumKind(ENTRALINK_BUFF_KIND_HEAL_RATIO, ENTRALINK_BUFF_HEAL_DRAIN);
        if (more > 0) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, GetPercentFactor(more));
        }
    }
}

// Rock Skin lowers the team's recoil; Reckless halves it from its rank parameter on
static void HandlerRecoil(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    s32 ratio;
    s32 less;
    const EntralinkBattleBuff *buff;
    u32 i;

    if (!IsTeamMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER))) {
        return;
    }
    ratio = BattleEventVar_GetValue(BATTLE_EVENT_VAR_RATIO);
    less = SumKind(ENTRALINK_BUFF_KIND_RECOIL_RATIO, 0xff);
    ratio = less >= 100 ? 0 : ratio * (100 - less) / 100;
    for (i = 0; i < sBattle.count; i++) {
        buff = &sBattle.buffs[i];
        if (sEffects[buff->buff].kind == ENTRALINK_BUFF_KIND_DAMAGE_RATIO && sEffects[buff->buff].rankParam != 0 &&
            buff->level >= sEffects[buff->buff].rankParam) {
            ratio /= 2;
        }
    }
    BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_RATIO, ratio);
    if (ratio == 0) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, TRUE);
    }
}

// Serene Touch: the team's added effects' chances
static void HandlerAddedEffectChance(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    s32 more;
    s32 chance;

    if (IsTeamMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER))) {
        more = SumKind(ENTRALINK_BUFF_KIND_ADDED_EFFECT_CHANCE, 0xff);
        if (more > 0) {
            chance = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ADDED_EFFECT_CHANCE) * (100 + more) / 100;
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_ADDED_EFFECT_CHANCE, chance > 100 ? 100 : chance);
        }
    }
}

// Second Hit: the team's multi-hit moves hit more times, up to their most
static void HandlerMultiHit(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    s32 more;
    s32 hits;
    s32 max;

    if (IsTeamMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER))) {
        more = SumKind(ENTRALINK_BUFF_KIND_MULTI_HIT, 0xff);
        if (more > 0) {
            hits = BattleEventVar_GetValue(BATTLE_EVENT_VAR_HIT_COUNT) + more;
            max = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MAX_HITS);
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_HIT_COUNT, hits > max ? max : hits);
        }
    }
}

// Thrifty: a chance that the team's move uses no PP
static void HandlerPPDecrement(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    s32 chance;

    if (IsTeamMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER))) {
        chance = SumKind(ENTRALINK_BUFF_KIND_PP_SAVE_CHANCE, 0xff);
        if (chance > 0 && BattleRandom(100) < chance) {
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_VOLUME, 0);
        }
    }
}

// Damp Rock adds to the turns of the weather the team sets; Stormcaller sets them (255 for the whole battle)
static void HandlerWeatherTurns(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    s32 turns;
    s32 set;

    if (!IsTeamMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER))) {
        return;
    }
    turns = BattleEventVar_GetValue(BATTLE_EVENT_VAR_WEATHER_TURNS) + WEATHER_TURNS_BASE;
    set = SumKind(ENTRALINK_BUFF_KIND_WEATHER_TURNS, ENTRALINK_BUFF_WEATHER_MODE_SET);
    if (set >= WEATHER_TURNS_PERMANENT) {
        turns = WEATHER_TURNS_PERMANENT;
    } else {
        if (set > turns) {
            turns = set;
        }
        turns += SumKind(ENTRALINK_BUFF_KIND_WEATHER_TURNS, ENTRALINK_BUFF_WEATHER_MODE_ADD);
        if (turns >= WEATHER_TURNS_PERMANENT) {
            turns = WEATHER_TURNS_PERMANENT - 1;
        }
    }
    BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_WEATHER_TURNS, turns - WEATHER_TURNS_BASE);
}

// Light Clay: the team's Reflect and Light Screen last longer
static void HandlerScreenTurns(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleCondition condition;
    s32 turns;

    if (IsTeamMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON)) &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_SIDE_EFFECT) <= 1) {
        turns = SumKind(ENTRALINK_BUFF_KIND_SCREEN_TURNS, 0xff);
        if (turns > 0) {
            condition.raw = BattleEventVar_GetValue(BATTLE_EVENT_VAR_CONDITION_PARAM);
            IncrementTurn(&condition, turns);
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_CONDITION_PARAM, condition.raw);
        }
    }
}

// Second Wind (once a battle each, from its HP percent) and Focus Band (a chance): the team survives a KO with 1 HP
static void HandlerEndure(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 defender = BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER);
    BattleMon *mon;
    const EntralinkBattleBuff *buff;
    s32 chance;

    if (!IsTeamMon(defender)) {
        return;
    }
    mon = GetBattleMon(flow, defender);
    buff = FindKind(ENTRALINK_BUFF_KIND_ENDURE_ONCE);
    if (buff != NULL && !(sBattle.monFlags[defender] & MON_SECOND_WIND_USED) &&
        GetBattleMonStat(mon, BATTLEMON_HP) * 100 >= GetBattleMonStat(mon, BATTLEMON_MAX_HP) * buff->value &&
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_ENDURE_CAUSE, ENDURE_CAUSE_ENDURE)) {
        sBattle.monFlags[defender] |= MON_SECOND_WIND_USED;
        return;
    }
    chance = SumKind(ENTRALINK_BUFF_KIND_ENDURE_CHANCE, 0xff);
    if (chance > 0 && BattleRandom(100) < chance) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_ENDURE_CAUSE, ENDURE_CAUSE_ENDURE);
    }
}

// ---- Entering, stat stages, priority -------------------------------------------------------------------------------

// The BATTLEMON_*_STAGE of each ENTRALINK_BUFF_STAT_* (attack to speed)
static const u8 sStatStages[] = {
    BATTLEMON_ATTACK_STAGE,     BATTLEMON_SP_ATTACK_STAGE, BATTLEMON_DEFENSE_STAGE,
    BATTLEMON_SP_DEFENSE_STAGE, BATTLEMON_SPEED_STAGE,
};

// A Pokémon of the team enters: on its first entry Opening Gambit raises its rank's stats and Speed Boost's rank 3
// its Speed; Focus's rank 2 readies a sure critical hit on every entry
static void HandlerMemberIn(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 mon = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON);
    const EntralinkBattleBuff *buff;
    u32 i;
    u32 stats;

    if (!IsTeamMon(mon)) {
        return;
    }
    if (GetHandlerLevel(ENTRALINK_BUFF_KIND_CUSTOM, ENTRALINK_BUFF_HANDLER_FOCUS) >= 2) {
        sBattle.monFlags[mon] |= MON_FOCUSED;
    }
    if (sBattle.monFlags[mon] & MON_ENTERED) {
        return;
    }
    sBattle.monFlags[mon] |= MON_ENTERED;
    buff = FindKind(ENTRALINK_BUFF_KIND_STAT_STAGE_ON_ENTRY);
    if (buff != NULL) {
        stats = sEffects[buff->buff].stats[buff->level - 1];
        for (i = 0; i < NELEMS(sStatStages); i++) {
            if (stats & (1 << i)) {
                PushStatChange(flow, mon, sStatStages[i], buff->value);
            }
        }
    }
    if (GetHandlerLevel(ENTRALINK_BUFF_KIND_ABILITY_LIKE, ABILITY_SPEED_BOOST) >= 3) {
        PushStatChange(flow, mon, BATTLEMON_SPEED_STAGE, 1);
    }
}

// Simple doubles the team's boosts (rank 2: halves the foes' drops; rank 3: the first boost a battle +1 more); Tempo
// a chance of +1 more
static void HandlerStatChangeAmount(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 mon = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON);
    s32 volume = (s32)BattleEventVar_GetValue(BATTLE_EVENT_VAR_VOLUME);
    u32 simple;
    s32 chance;

    if (!IsTeamMon(mon)) {
        return;
    }
    simple = GetHandlerLevel(ENTRALINK_BUFF_KIND_ABILITY_LIKE, ABILITY_SIMPLE);
    if (volume > 0) {
        if (simple != 0) {
            volume *= 2;
        }
        if (simple >= 3 && !(sBattle.monFlags[mon] & MON_FIRST_BOOST_DONE)) {
            sBattle.monFlags[mon] |= MON_FIRST_BOOST_DONE;
            volume++;
        }
        chance = SumKind(ENTRALINK_BUFF_KIND_CUSTOM, ENTRALINK_BUFF_HANDLER_EXTRA_STAGE_CHANCE);
        if (chance > 0 && BattleRandom(100) < chance) {
            volume++;
        }
    } else if (volume < 0 && simple >= 2 && IsFoeMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER))) {
        volume = -((1 - volume) / 2);
    }
    BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_VOLUME, volume);
}

// Clear Amulet: the first stat drops a foe gives each Pokémon of the team each battle are blocked
static void HandlerCheckStatChange(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 mon = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON);
    s32 blocks;

    if (IsTeamMon(mon) && (s32)BattleEventVar_GetValue(BATTLE_EVENT_VAR_VOLUME) < 0 &&
        IsFoeMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER))) {
        blocks = SumKind(ENTRALINK_BUFF_KIND_CUSTOM, ENTRALINK_BUFF_HANDLER_BLOCK_STAT_DROPS);
        if (sBattle.dropsBlocked[mon] < blocks && BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, TRUE)) {
            sBattle.dropsBlocked[mon]++;
        }
    }
}

// Defiance: a foe's drop on the team gives +2 Attack (rank 2 on: +2 to the higher of Attack and Sp. Atk)
static void HandlerStatChangeApplied(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 mon = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON);
    u32 level;
    BattleMon *battleMon;
    u32 stat;

    if (!IsTeamMon(mon) || (s32)BattleEventVar_GetValue(BATTLE_EVENT_VAR_VOLUME) >= 0 ||
        !IsFoeMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER))) {
        return;
    }
    level = GetHandlerLevel(ENTRALINK_BUFF_KIND_ABILITY_LIKE, ABILITY_DEFIANT);
    if (level != 0) {
        battleMon = GetBattleMon(flow, mon);
        stat = BATTLEMON_ATTACK_STAGE;
        if (level >= 2 &&
            GetBattleMonStat(battleMon, BATTLEMON_SP_ATTACK) > GetBattleMonStat(battleMon, BATTLEMON_ATTACK)) {
            stat = BATTLEMON_SP_ATTACK_STAGE;
        }
        // Its own item amounts the boost (Simple)
        BattleEventItem_SetRecallEnable(item);
        PushStatChange(flow, mon, stat, 2);
    }
}

// Unaware: the team ignores the foe's defending stages (rank 2: the foe's attacking stages on the team; rank 3: the
// accuracy and evasion stages too), as vanilla Unaware
static void HandlerUnawareDefense(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (IsTeamMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER)) &&
        GetHandlerLevel(ENTRALINK_BUFF_KIND_ABILITY_LIKE, ABILITY_UNAWARE) != 0) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_GENERAL_FLAG, TRUE);
    }
}

static void HandlerUnawareAttack(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (IsTeamMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER)) &&
        IsFoeMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER)) &&
        GetHandlerLevel(ENTRALINK_BUFF_KIND_ABILITY_LIKE, ABILITY_UNAWARE) >= 2) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_GENERAL_FLAG, TRUE);
    }
}

static void HandlerUnawareHit(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (GetHandlerLevel(ENTRALINK_BUFF_KIND_ABILITY_LIKE, ABILITY_UNAWARE) < 3) {
        return;
    }
    if (IsTeamMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER))) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_EVASION_STAGE, BATTLEMON_STAT_STAGE_NEUTRAL);
    } else if (IsTeamMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER))) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_ACCURACY_STAGE, BATTLEMON_STAT_STAGE_NEUTRAL);
    }
}

// First Strike: +1 priority on each Pokémon's first move of the battle (rank 3: its first two)
static void HandlerMovePriority(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 attacker = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER);
    u32 level;

    if (IsTeamMon(attacker)) {
        level = GetHandlerLevel(ENTRALINK_BUFF_KIND_CUSTOM, ENTRALINK_BUFF_HANDLER_FIRST_STRIKE);
        if (level != 0 && sBattle.movesUsed[attacker] < (level >= 3 ? 2 : 1)) {
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_MOVE_PRIORITY,
                                        BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_PRIORITY) + 1);
        }
    }
}

// Quick Draw: a chance to move first in the priority bracket
static void HandlerSpecialPriority(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    s32 chance;

    if (IsTeamMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON))) {
        chance = SumKind(ENTRALINK_BUFF_KIND_CUSTOM, ENTRALINK_BUFF_HANDLER_QUICK_DRAW);
        if (chance > 0 && BattleRandom(100) < chance) {
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_SPECIAL_PRIORITY, 2);
        }
    }
}

// A move starts: the team's moves are counted (First Strike), and a status move readies Focus's sure critical hit
static void HandlerMoveStart(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 mon = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON);

    if (IsTeamMon(mon)) {
        if (sBattle.movesUsed[mon] < 0xff) {
            sBattle.movesUsed[mon]++;
        }
        if (GetHandlerLevel(ENTRALINK_BUFF_KIND_CUSTOM, ENTRALINK_BUFF_HANDLER_FOCUS) != 0 &&
            PML_MoveGetCategory(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE)) == MOVE_CATEGORY_STATUS) {
            sBattle.monFlags[mon] |= MON_FOCUSED;
        }
    }
}

// ---- After a hit ---------------------------------------------------------------------------------------------------

static void PushAddCondition(BtlServerFlow *flow, u32 monId, BattleMon *target, u32 condition) {
    BattleHandlerAddConditionParam *param = BattleHandler_PushWork(flow, BATTLE_HANDLER_ADD_CONDITION, monId);

    param->condition = condition;
    BtlCalc_MakeDefaultCondition(condition, target, &param->value);
    param->showFail = FALSE;
    param->targetIndex = GetMonID(target);
    BattleHandler_PopWork(flow, param);
}

// The statuses the team's hit gives a foe by chance (status_chance_on_hit, Sandman's sleep from rank 2)
static void GiveHitStatuses(BtlServerFlow *flow, u32 attacker, BattleMon *target, const EntralinkHit *hit) {
    u32 i;
    const EntralinkBuffEffect *effect;
    const EntralinkBattleBuff *buff;
    u32 condition;

    for (i = 0; i < sBattle.count; i++) {
        effect = &sEffects[sBattle.buffs[i].buff];
        if (effect->kind != ENTRALINK_BUFF_KIND_STATUS_CHANCE_ON_HIT || effect->param >= NELEMS(sStatusConditions)) {
            continue;
        }
        condition = sStatusConditions[effect->param];
        if (condition != CONDITION_NONE && ConditionHolds(flow, &sBattle.buffs[i], hit) &&
            BattleRandom(100) < sBattle.buffs[i].value) {
            PushAddCondition(flow, attacker, target, condition);
        }
    }
    buff = FindHandler(ENTRALINK_BUFF_KIND_CUSTOM, ENTRALINK_BUFF_HANDLER_SANDMAN);
    if (buff != NULL && buff->value > 0 && BattleRandom(100) < buff->value) {
        PushAddCondition(flow, attacker, target, CONDITION_SLEEP);
    }
}

// After the team's hit: the hit's statuses on each foe hit, Afterburner for each KO, Vampiric's heal and Blood Price's
// cost. After a foe's hit, Focus's rank 3 readies a sure critical hit on each of the team it hit
static void HandlerHitEnd(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 attacker = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER);
    u32 count = BattleEventVar_GetValue(BATTLE_EVENT_VAR_TARGET_COUNT);
    BattleMon *mon;
    BattleMon *target;
    EntralinkHit hit;
    u32 i;
    u32 level;
    u32 kos;
    s32 percent;
    BattleHandlerDamageParam *param;

    if (IsFoeMon(attacker) && GetHandlerLevel(ENTRALINK_BUFF_KIND_CUSTOM, ENTRALINK_BUFF_HANDLER_FOCUS) >= 3) {
        for (i = 0; i < count; i++) {
            if (IsTeamMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_TARGET_1 + i))) {
                sBattle.monFlags[BattleEventVar_GetValue(BATTLE_EVENT_VAR_TARGET_1 + i)] |= MON_FOCUSED;
            }
        }
    }
    if (!IsTeamMon(attacker)) {
        return;
    }
    mon = GetBattleMon(flow, attacker);
    MI_CpuFill8(&hit, 0, sizeof(hit));
    hit.attacker = mon;
    hit.move = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE);
    hit.moveType = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_TYPE);
    hit.category = PML_MoveGetCategory(hit.move);
    hit.effectiveness = 0xff;
    kos = 0;
    for (i = 0; i < count; i++) {
        target = GetBattleMon(flow, BattleEventVar_GetValue(BATTLE_EVENT_VAR_TARGET_1 + i));
        if (IsFainted(target)) {
            kos++;
        } else if (IsFoeMon(GetMonID(target)) && !BattleEventVar_GetValue(BATTLE_EVENT_VAR_SHIELD_DUST_FLAG)) {
            hit.defender = target;
            GiveHitStatuses(flow, attacker, target, &hit);
        }
    }
    if (IsFainted(mon)) {
        return;
    }
    level = GetHandlerLevel(ENTRALINK_BUFF_KIND_ABILITY_LIKE, ABILITY_MOXIE);
    if (level != 0 && kos != 0) {
        PushStatChange(flow, attacker, BATTLEMON_SPEED_STAGE, kos);
        if (level >= 2) {
            PushStatChange(flow, attacker,
                           GetBattleMonStat(mon, BATTLEMON_SP_ATTACK) > GetBattleMonStat(mon, BATTLEMON_ATTACK)
                               ? BATTLEMON_SP_ATTACK_STAGE
                               : BATTLEMON_ATTACK_STAGE,
                           kos);
        }
        if (level >= 3 && !IsMonFullHP(mon)) {
            PushRecoverHP(flow, attacker, GetBattleMonStat(mon, BATTLEMON_MAX_HP) / 10);
        }
    }
    percent = SumKind(ENTRALINK_BUFF_KIND_HEAL_ON_DAMAGE, 0xff);
    if (percent > 0 && !BattleEventVar_GetValue(BATTLE_EVENT_VAR_DELAYED_FLAG) && !IsMonFullHP(mon) &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_DAMAGE) != 0) {
        PushRecoverHP(flow, attacker, BattleEventVar_GetValue(BATTLE_EVENT_VAR_DAMAGE) * percent / 100);
    }
    for (i = 0; i < sBattle.count; i++) {
        percent = sEffects[sBattle.buffs[i].buff].hpCost;
        if (percent != 0) {
            param = BattleHandler_PushWork(flow, BATTLE_HANDLER_DAMAGE, attacker);
            param->targetIndex = attacker;
            param->amount = GetBattleMonStat(mon, BATTLEMON_MAX_HP) * percent / 100;
            if (param->amount == 0) {
                param->amount = 1;
            }
            BattleHandler_StrSetup(&param->string, BATTLE_HANDLER_STR_SET, MESSAGE_LOST_HP);
            BattleHandler_AddArg(&param->string, attacker);
            BattleHandler_PopWork(flow, param);
        }
    }
}

// ---- Statuses given, and the bosses' protections -------------------------------------------------------------------

// The ENTRALINK_BUFF_STATUS_* bit of a condition, or 0
static u32 GetConditionStatusBit(u32 condition) {
    if (condition == CONDITION_CONFUSION) {
        return 1 << ENTRALINK_BUFF_STATUS_CONFUSION;
    }
    return condition < NELEMS(sStatusBits) ? sStatusBits[condition] : 0;
}

// A status that would be given fails: a boss is never frozen; the team isn't given the statuses its buffs make it
// immune to (Thaw-proof), and Hardy is a chance to resist a foe's
static void HandlerConditionCheckFail(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 defender = BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER);
    u32 condition = BattleEventVar_GetValue(BATTLE_EVENT_VAR_CONDITION);
    u32 status = GetConditionStatusBit(condition);
    u32 i;
    s32 chance;
    BOOL fail;

    fail = FALSE;
    if (IsBossMon(defender) && condition == CONDITION_FREEZE) {
        fail = TRUE;
    } else if (IsTeamMon(defender) && status != 0) {
        for (i = 0; i < sBattle.count; i++) {
            if (sEffects[sBattle.buffs[i].buff].kind != ENTRALINK_BUFF_KIND_STATUS_DURATION &&
                (sEffects[sBattle.buffs[i].buff].statuses & status)) {
                fail = TRUE;
            }
        }
        chance = SumKind(ENTRALINK_BUFF_KIND_STATUS_RESIST, 0xff);
        if (chance > 0 && IsFoeMon(BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER)) && BattleRandom(100) < chance) {
            fail = TRUE;
        }
    }
    if (fail) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, TRUE);
    }
}

// Fixed damage on a boss (Super Fang, Endeavor...) is at most boss_fixed_damage percent of one bar
static void HandlerFixedDamage(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 defender = BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER);
    u32 cap;

    if (IsBossMon(defender)) {
        cap = EntralinkBattle_GetResidualMaxHP(GetBattleMon(flow, defender)) * ENTRALINK_BUFF_BOSS_FIXED_DAMAGE / 100;
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_FIXED_DAMAGE) > cap) {
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FIXED_DAMAGE, cap);
        }
    }
}

// OHKO moves and Pain Split don't affect a boss, with "It doesn't affect [the boss]..."
static void HandlerBossNoEffect(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 defender = BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER);
    u16 move = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE);
    BattleHandlerMessageParam *param;

    if (IsBossMon(defender) && (PML_MoveGetQuality(move) == MOVE_QUALITY_OHKO || move == MOVE_PAIN_SPLIT) &&
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_NO_EFFECT, TRUE)) {
        param = BattleHandler_PushWork(flow, BATTLE_HANDLER_MESSAGE, defender);
        BattleHandler_StrSetup(&param->string, BATTLE_HANDLER_STR_SET, MESSAGE_DOESNT_AFFECT);
        BattleHandler_AddArg(&param->string, defender);
        BattleHandler_PopWork(flow, param);
    }
}

static const BattleEventHandlerEntry sHandlers[] = {
    { BATTLE_EVENT_ATTACK_STAT, HandlerAttackStat },
    { BATTLE_EVENT_DEFENSE_STAT, HandlerDefenseStat },
    { BATTLE_EVENT_MOVE_POWER_RATIO, HandlerMovePower },
    { BATTLE_EVENT_SAME_TYPE_BONUS, HandlerSameTypeBonus },
    { BATTLE_EVENT_DAMAGE_RATIO, HandlerDamageRatio },
    { BATTLE_EVENT_CALCULATE_SPEED, HandlerSpeed },
    { BATTLE_EVENT_GET_MOVE_ACCURACY, HandlerAccuracy },
    { BATTLE_EVENT_CHECK_CRITICAL, HandlerCritical },
    { BATTLE_EVENT_CONDITION_DAMAGE, HandlerConditionDamage },
    { BATTLE_EVENT_CHECK_WEATHER_DAMAGE, HandlerWeatherDamage },
    { BATTLE_EVENT_TURN_CHECK_EARLY, HandlerTurnCheckEarly },
    { BATTLE_EVENT_TURN_CHECK, HandlerTurnCheck },
    { BATTLE_EVENT_CALC_DRAIN_AMOUNT, HandlerDrainAmount },
    { BATTLE_EVENT_CALC_RECOIL, HandlerRecoil },
    { BATTLE_EVENT_CHECK_MOVE_ADD_CONDITION, HandlerAddedEffectChance },
    { BATTLE_EVENT_ADDED_STAT_CHANGE_CHANCE, HandlerAddedEffectChance },
    { BATTLE_EVENT_CHECK_MULTIHIT_HITS, HandlerMultiHit },
    { BATTLE_EVENT_CALC_PP_DECREMENT, HandlerPPDecrement },
    { BATTLE_EVENT_INCREASE_MOVE_WEATHER_TURNS, HandlerWeatherTurns },
    { BATTLE_EVENT_CHECK_SIDE_EFFECT_PARAM, HandlerScreenTurns },
    { BATTLE_EVENT_CHECK_ENDURE, HandlerEndure },
    { BATTLE_EVENT_MEMBER_IN, HandlerMemberIn },
    { BATTLE_EVENT_BEFORE_DEFENSE_STAT, HandlerUnawareDefense },
    { BATTLE_EVENT_BEFORE_ATTACK_STAT, HandlerUnawareAttack },
    { BATTLE_EVENT_CHECK_HIT, HandlerUnawareHit },
    { BATTLE_EVENT_GET_MOVE_PRIORITY, HandlerMovePriority },
    { BATTLE_EVENT_CHECK_SPECIAL_PRIORITY, HandlerSpecialPriority },
    { BATTLE_EVENT_MOVE_EXECUTE_START, HandlerMoveStart },
    { BATTLE_EVENT_DAMAGE_PROCESS_END_HIT_REAL, HandlerHitEnd },
    { BATTLE_EVENT_FIXED_DAMAGE, HandlerFixedDamage },
    { BATTLE_EVENT_CHECK_NO_EFFECT_AFTER_PROTECT, HandlerBossNoEffect },
};

// The events that the main item's own stat changes and statuses call while its handler runs (an item isn't called
// again while it runs), in a second item
static const BattleEventHandlerEntry sReactionHandlers[] = {
    { BATTLE_EVENT_STAT_CHANGE_AMOUNT, HandlerStatChangeAmount },
    { BATTLE_EVENT_CHECK_STAT_CHANGE, HandlerCheckStatChange },
    { BATTLE_EVENT_STAT_CHANGE_APPLIED, HandlerStatChangeApplied },
    { BATTLE_EVENT_MOVE_CONDITION_CHECK_FAIL, HandlerConditionCheckFail },
};

// ---- The battle's start and the hooks ------------------------------------------------------------------------------

void EntralinkBattle_Start(BtlServerFlow *flow) {
    u32 buff;
    u32 type;

    MI_CpuFill8(&sBattle, 0, sizeof(sBattle));
    if (!BtlSetup_IsBattleType(flow->mainModule, ENTRALINK_RUN_BTL_SETUP_FLAG)) {
        return;
    }
    sBattle.run = TRUE;
    sBattle.boss = BtlSetup_IsBattleType(flow->mainModule, ENTRALINK_RUN_BOSS_BTL_SETUP_FLAG) != 0;
    sBattle.playerClient = GetPlayerClientID(flow->mainModule);
    for (buff = 0; buff < ENTRALINK_BUFF_COUNT; buff++) {
        if (EntralinkBuffs_GetLevel(buff) == 0) {
            continue;
        }
        if (EntralinkBuffs_GetTypeCard(buff) == ENTRALINK_BUFF_TYPE_CARD_NONE) {
            AddBuff(buff, BUFF_TYPE_ANY, EntralinkBuffs_GetLevel(buff));
        } else {
            for (type = 0; type < ENTRALINK_BUFF_CARD_TYPES; type++) {
                AddBuff(buff, type, EntralinkBuffs_GetTypeCount(buff, type));
            }
        }
    }
    BattleEvent_AddItem(BATTLE_EVENT_FACTOR_FIELD, EVENT_ITEM_SUB_ID, EVENT_ITEM_PRIORITY, 0, 0, sHandlers,
                        NELEMS(sHandlers));
    BattleEvent_AddItem(BATTLE_EVENT_FACTOR_FIELD, REACTION_ITEM_SUB_ID, EVENT_ITEM_PRIORITY, 0, 0, sReactionHandlers,
                        NELEMS(sReactionHandlers));
}

BOOL EntralinkBattle_IsRun(void) {
    return sBattle.run;
}

u32 EntralinkBattle_ClampDamage(BattleMon *defender, u32 damage) {
    if (!sBattle.run) {
        return damage;
    }
    sBattle.lastDamage = damage;
    sBattle.lastTarget = GetMonID(defender);
    sBattle.lastClamped = damage > ENTRALINK_BUFF_DAMAGE_CAP;
    return sBattle.lastClamped ? ENTRALINK_BUFF_DAMAGE_CAP : damage;
}

u32 EntralinkBattle_GetLastHitDamage(u8 *monId, BOOL *clamped) {
    *monId = sBattle.lastTarget;
    *clamped = sBattle.lastClamped;
    return sBattle.lastDamage;
}

u32 EntralinkBattle_GetResidualMaxHP(BattleMon *mon) {
    u32 maxHP = GetBattleMonStat(mon, BATTLEMON_MAX_HP);

    if (IsFoeMon(GetMonID(mon)) && maxHP > ENTRALINK_BUFF_BOSS_BAR_HP) {
        return ENTRALINK_BUFF_BOSS_BAR_HP;
    }
    return maxHP;
}

u32 EntralinkBattle_DivideResidualHP(BattleMon *mon, u32 divisor) {
    u32 result = EntralinkBattle_GetResidualMaxHP(mon) / divisor;

    return result == 0 ? 1 : result;
}

u32 EntralinkBattle_GetToxicCounter(BattleMon *mon, u32 counter) {
    if (IsBossMon(GetMonID(mon)) && counter > ENTRALINK_BUFF_BOSS_TOXIC_CAP) {
        return ENTRALINK_BUFF_BOSS_TOXIC_CAP;
    }
    return counter;
}

u32 EntralinkBattle_GetFullParalysisChance(BattleMon *mon, u32 chance) {
    u32 monId = GetMonID(mon);
    s32 lockjaw;

    if (!IsFoeMon(monId)) {
        return chance;
    }
    lockjaw = SumKind(ENTRALINK_BUFF_KIND_STATUS_ROLL, ENTRALINK_BUFF_ROLL_FULL_PARALYSIS);
    if (lockjaw > 0) {
        chance = lockjaw;
    }
    if (IsBossMon(monId)) {
        chance = chance * ENTRALINK_BUFF_BOSS_FULL_PARALYSIS / 100;
    }
    return chance;
}

u32 EntralinkBattle_GetConfusionSelfHitChance(BattleMon *mon, u32 chance) {
    s32 madness;

    if (IsFoeMon(GetMonID(mon))) {
        madness = SumKind(ENTRALINK_BUFF_KIND_STATUS_ROLL, ENTRALINK_BUFF_ROLL_CONFUSION_SELF_HIT);
        if (madness > 0) {
            return madness;
        }
    }
    return chance;
}

BattleCondition EntralinkBattle_GetConditionValue(BattleMon *target, BattleMon *attacker, u32 condition,
                                                  BattleCondition value) {
    u32 targetId = GetMonID(target);
    u32 status = GetConditionStatusBit(condition);
    s32 turns;
    u32 i;
    const EntralinkBuffEffect *effect;

    if (!sBattle.run || (condition != CONDITION_SLEEP && condition != CONDITION_CONFUSION) || value.common.turns == 0) {
        return value;
    }
    turns = value.common.turns;
    for (i = 0; i < sBattle.count; i++) {
        effect = &sEffects[sBattle.buffs[i].buff];
        if (effect->kind != ENTRALINK_BUFF_KIND_STATUS_DURATION || !(effect->statuses & status)) {
            continue;
        }
        if (effect->param == ENTRALINK_BUFF_DURATION_FOES && IsFoeMon(targetId) && attacker != NULL &&
            IsTeamMon(GetMonID(attacker))) {
            turns += sBattle.buffs[i].value;
        } else if (effect->param == ENTRALINK_BUFF_DURATION_OWN && IsTeamMon(targetId)) {
            turns -= sBattle.buffs[i].value;
        }
    }
    // A sleep of n turns' count wakes the Pokémon on its nth try (BattleMon_TickSleep): n - 1 turns asleep
    if (condition == CONDITION_SLEEP && IsBossMon(targetId) && turns > ENTRALINK_BUFF_BOSS_SLEEP_TURNS + 1) {
        turns = ENTRALINK_BUFF_BOSS_SLEEP_TURNS + 1;
    }
    if (turns < 1) {
        turns = 1;
    }
    // The count's field is 6 bits
    if (turns > 63) {
        turns = 63;
    }
    value.common.turns = turns;
    return value;
}

BOOL EntralinkBattle_IsSureCritical(s32 stage) {
    return sBattle.run && stage >= SURE_CRITICAL_STAGE;
}

u32 EntralinkBattle_GetFlinchBonus(BattleMon *attacker) {
    return IsTeamMon(GetMonID(attacker)) ? SumKind(ENTRALINK_BUFF_KIND_FLINCH_CHANCE, 0xff) : 0;
}

u32 EntralinkBattle_GetMoveHealAmount(BattleMon *mon, u32 amount) {
    s32 more;

    if (IsTeamMon(GetMonID(mon))) {
        more = SumKind(ENTRALINK_BUFF_KIND_HEAL_RATIO, ENTRALINK_BUFF_HEAL_RECOVERY_MOVES);
        if (more > 0) {
            amount = amount * (100 + more) / 100;
        }
    }
    return amount;
}

BOOL EntralinkBattle_IgnoresBurnDrop(BattleMon *mon) {
    u32 i;

    if (!IsTeamMon(GetMonID(mon))) {
        return FALSE;
    }
    for (i = 0; i < sBattle.count; i++) {
        if (sEffects[sBattle.buffs[i].buff].flags & ENTRALINK_BUFF_FLAG_IGNORE_BURN_DROP) {
            return TRUE;
        }
    }
    return FALSE;
}
