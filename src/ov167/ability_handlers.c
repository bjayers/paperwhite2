#include "types.h"
#include "battle/btl_ability.h"
#include "battle/btl_action.h"
#include "battle/btl_calc.h"
#include "battle/btl_event.h"
#include "battle/btl_field.h"
#include "battle/btl_handler.h"
#include "battle/btl_handler_work.h"
#include "battle/btl_item.h"
#include "battle/btl_main.h"
#include "battle/btl_pokeparam.h"
#include "battle/btl_server_flow.h"
#include "battle/btl_tables.h"
#include "battle/handler_common.h"
#include "constants/abilities.h"
#include "constants/battle.h"
#include "constants/items.h"
#include "pml/item.h"
#include "pml/move.h"
#ifdef PAPERWHITE2
#include "paperwhite2/abilities.h"
#include "paperwhite2/battle_handlers.h"
#endif

// The strongest moves Forewarn found, one entry per move
typedef struct ForewarnEntry {
    u8 monId;
    u16 move;
} ForewarnEntry;

// Pickup's scratch buffer: the allies, and those whose item was used this turn
typedef struct PickupWork {
    u8 mons[6];
    u8 candidates[6];
    u8 count;
    u8 numCandidates;
} PickupWork;

// Moody's scratch buffer: every raise/lower pair, then the stats that can go up and down
typedef struct MoodyWork {
    u16 pairs[0x54];
    u8 up[7];
    u8 down[7];
} MoodyWork;

// Function names from swan.
static const AbilityEventAddEntry sAbilityEventAddTable[] = {
    { ABILITY_INTIMIDATE, EventAddIntimidate },
    { ABILITY_CLEAR_BODY, EventAddClearBody },
    { ABILITY_WHITE_SMOKE, EventAddClearBody },
    { ABILITY_INNER_FOCUS, EventAddInnerFocus },
    { ABILITY_STEADFAST, EventAddSteadfast },
    { ABILITY_THICK_FAT, EventAddThickFat },
    { ABILITY_HYPER_CUTTER, EventAddHyperCutter },
    { ABILITY_HUGE_POWER, EventAddHugePower },
    { ABILITY_PURE_POWER, EventAddHugePower },
    { ABILITY_TINTED_LENS, EventAddTintedLens },
    { ABILITY_SPEED_BOOST, EventAddSpeedBoost },
    { ABILITY_BLAZE, EventAddBlaze },
    { ABILITY_TORRENT, EventAddTorrent },
    { ABILITY_OVERGROW, EventAddOvergrow },
    { ABILITY_SWARM, EventAddSwarm },
    { ABILITY_GUTS, EventAddGuts },
    { ABILITY_SKILL_LINK, EventAddSkillLink },
    { ABILITY_KEEN_EYE, EventAddKeenEye },
    { ABILITY_SIMPLE, EventAddSimple },
    { ABILITY_SOLID_ROCK, EventAddSolidRock },
    { ABILITY_FILTER, EventAddSolidRock },
    { ABILITY_MARVEL_SCALE, EventAddMarvelScale },
    { ABILITY_RIVALRY, EventAddRivalry },
    { ABILITY_LEAF_GUARD, EventAddLeafGuard },
    { ABILITY_DRIZZLE, EventAddDrizzle },
    { ABILITY_DROUGHT, EventAddDrought },
    { ABILITY_SAND_STREAM, EventAddSandStream },
    { ABILITY_SNOW_WARNING, EventAddSnowWarning },
    { ABILITY_AIR_LOCK, EventAddAirLock },
    { ABILITY_CLOUD_NINE, EventAddAirLock },
    { ABILITY_TECHNICIAN, EventAddTechnician },
    { ABILITY_OBLIVIOUS, EventAddOblivious },
    { ABILITY_HYDRATION, EventAddHydration },
    { ABILITY_POISON_HEAL, EventAddPoisonHeal },
    { ABILITY_ICE_BODY, EventAddIceBody },
    { ABILITY_RAIN_DISH, EventAddRainDish },
    { ABILITY_SHIELD_DUST, EventAddShieldDust },
    { ABILITY_ADAPTABILITY, EventAddAdaptability },
    { ABILITY_SERENE_GRACE, EventAddSereneGrace },
    { ABILITY_SOLAR_POWER, EventAddSolarPower },
    { ABILITY_SWIFT_SWIM, EventAddSwiftSwim },
    { ABILITY_CHLOROPHYLL, EventAddChlorophyll },
    { ABILITY_SHED_SKIN, EventAddShedSkin },
    { ABILITY_TANGLED_FEET, EventAddTangledFeet },
    { ABILITY_QUICK_FEET, EventAddQuickFeet },
    { ABILITY_HUSTLE, EventAddHustle },
    { ABILITY_BATTLE_ARMOR, EventAddBattleArmor },
    { ABILITY_SHELL_ARMOR, EventAddBattleArmor },
    { ABILITY_SUPER_LUCK, EventAddSuperLuck },
    { ABILITY_ANGER_POINT, EventAddAngerPoint },
    { ABILITY_SNIPER, EventAddSniper },
    { ABILITY_IRON_FIST, EventAddIronFist },
    { ABILITY_COMPOUNDEYES, EventAddCompoundEyes },
    { ABILITY_ROCK_HEAD, EventAddRockHead },
    { ABILITY_RECKLESS, EventAddReckless },
    { ABILITY_STATIC, EventAddStatic },
    { ABILITY_POISON_POINT, EventAddPoisonPoint },
    { ABILITY_FLAME_BODY, EventAddFlameBody },
    { ABILITY_EFFECT_SPORE, EventAddEffectSpore },
    { ABILITY_PLUS, EventAddPlusMinus },
    { ABILITY_MINUS, EventAddPlusMinus },
    { ABILITY_CUTE_CHARM, EventAddCuteCharm },
    { ABILITY_SAND_VEIL, EventAddSandVeil },
    { ABILITY_SNOW_CLOAK, EventAddSnowCloak },
    { ABILITY_TRACE, EventAddTrace },
    { ABILITY_NORMALIZE, EventAddNormalize },
    { ABILITY_ROUGH_SKIN, EventAddRoughSkin },
    { ABILITY_NATURAL_CURE, EventAddNaturalCure },
    { ABILITY_SYNCHRONIZE, EventAddSynchronize },
    { ABILITY_DOWNLOAD, EventAddDownload },
    { ABILITY_STURDY, EventAddSturdy },
    { ABILITY_HEATPROOF, EventAddHeatproof },
    { ABILITY_UNAWARE, EventAddUnaware },
    { ABILITY_DRY_SKIN, EventAddDrySkin },
    { ABILITY_VOLT_ABSORB, EventAddVoltAbsorb },
    { ABILITY_WATER_ABSORB, EventAddWaterAbsorb },
    { ABILITY_MOTOR_DRIVE, EventAddMotorDrive },
    { ABILITY_LIMBER, EventAddLimber },
    { ABILITY_INSOMNIA, EventAddInsomnia },
    { ABILITY_VITAL_SPIRIT, EventAddInsomnia },
    { ABILITY_OWN_TEMPO, EventAddOwnTempo },
    { ABILITY_MAGMA_ARMOR, EventAddMagmaArmor },
    { ABILITY_WATER_VEIL, EventAddWaterVeil },
    { ABILITY_IMMUNITY, EventAddImmunity },
    { ABILITY_SCRAPPY, EventAddScrappy },
    { ABILITY_SOUNDPROOF, EventAddSoundproof },
    { ABILITY_LEVITATE, EventAddLevitate },
    { ABILITY_FLOWER_GIFT, EventAddFlowerGift },
    { ABILITY_FLASH_FIRE, EventAddFlashFire },
    { ABILITY_FOREWARN, EventAddForewarn },
    { ABILITY_ANTICIPATION, EventAddAnticipation },
    { ABILITY_FRISK, EventAddFrisk },
    { ABILITY_AFTERMATH, EventAddAftermath },
    { ABILITY_RUN_AWAY, EventAddRunAway },
    { ABILITY_COLOR_CHANGE, EventAddColorChange },
    { ABILITY_MOLD_BREAKER, EventAddMoldBreaker },
    { ABILITY_TRUANT, EventAddTruant },
    { ABILITY_LIGHTNINGROD, EventAddLightningRod },
    { ABILITY_STORM_DRAIN, EventAddStormDrain },
    { ABILITY_SLOW_START, EventAddSlowStart },
    { ABILITY_DAMP, EventAddDamp },
    { ABILITY_WONDER_GUARD, EventAddWonderGuard },
    { ABILITY_STALL, EventAddStall },
    { ABILITY_FORECAST, EventAddForecast },
    { ABILITY_SUCTION_CUPS, EventAddSuctionCups },
    { ABILITY_LIQUID_OOZE, EventAddLiquidOoze },
    { ABILITY_KLUTZ, EventAddKlutz },
    { ABILITY_STICKY_HOLD, EventAddStickyHold },
    { ABILITY_PRESSURE, EventAddPressure },
    { ABILITY_MAGIC_GUARD, EventAddMagicGuard },
    { ABILITY_BAD_DREAMS, EventAddBadDreams },
    { ABILITY_PICKUP, EventAddPickup },
    { ABILITY_UNBURDEN, EventAddUnburden },
    { ABILITY_STENCH, EventAddStench },
    { ABILITY_SHADOW_TAG, EventAddShadowTag },
    { ABILITY_ARENA_TRAP, EventAddArenaTrap },
    { ABILITY_MAGNET_PULL, EventAddMagnetPull },
    { ABILITY_PICKPOCKET, EventAddPickpocket },
    { ABILITY_SHEER_FORCE, EventAddSheerForce },
    { ABILITY_DEFIANT, EventAddDefiant },
    { ABILITY_DEFEATIST, EventAddDefeatist },
    { ABILITY_MULTISCALE, EventAddMultiscale },
    { ABILITY_HEAVY_METAL, EventAddHeavyMetal },
    { ABILITY_LIGHT_METAL, EventAddLightMetal },
    { ABILITY_CONTRARY, EventAddContrary },
    { ABILITY_UNNERVE, EventAddUnnerve },
    { ABILITY_CURSED_BODY, EventAddCursedBody },
    { ABILITY_HEALER, EventAddHealer },
    { ABILITY_FRIEND_GUARD, EventAddFriendGuard },
    { ABILITY_WEAK_ARMOR, EventAddWeakArmor },
    { ABILITY_TOXIC_BOOST, EventAddToxicBoost },
    { ABILITY_FLARE_BOOST, EventAddFlareBoost },
    { ABILITY_HARVEST, EventAddHarvest },
    { ABILITY_TELEPATHY, EventAddTelepathy },
    { ABILITY_MOODY, EventAddMoody },
    { ABILITY_OVERCOAT, EventAddOvercoat },
    { ABILITY_POISON_TOUCH, EventAddPoisonTouch },
    { ABILITY_REGENERATOR, EventAddRegenerator },
    { ABILITY_BIG_PECKS, EventAddBigPecks },
    { ABILITY_SAND_RUSH, EventAddSandRush },
    { ABILITY_WONDER_SKIN, EventAddWonderSkin },
    { ABILITY_ANALYTIC, EventAddAnalytic },
    { ABILITY_ILLUSION, EventAddIllusion },
    { ABILITY_IMPOSTER, EventAddImposter },
    { ABILITY_INFILTRATOR, EventAddInfiltrator },
    { ABILITY_MUMMY, EventAddMummy },
    { ABILITY_MOXIE, EventAddMoxie },
    { ABILITY_JUSTIFIED, EventAddJustified },
    { ABILITY_RATTLED, EventAddRattled },
    { ABILITY_MAGIC_BOUNCE, EventAddMagicBounce },
    { ABILITY_SAP_SIPPER, EventAddSapSipper },
    { ABILITY_PRANKSTER, EventAddPrankster },
    { ABILITY_SAND_FORCE, EventAddSandForce },
    { ABILITY_IRON_BARBS, EventAddRoughSkin },
    { ABILITY_ZEN_MODE, EventAddZenMode },
    { ABILITY_VICTORY_STAR, EventAddVictoryStar },
    { ABILITY_TURBOBLAZE, EventAddMoldBreaker },
    { ABILITY_TERAVOLT, EventAddMoldBreaker },
#if defined(PAPERWHITE2) && defined(ABILITY_BULLETPROOF)
    // Paper White 2: the added abilities' own handlers (paperwhite2_battle.c)
    { ABILITY_BULLETPROOF, PaperWhite2_EventAddBulletproof },
#endif
};

BattleEventItem *AbilityEvent_AddItem(BattleMon *mon) {
    u16 ability;
    u32 i;
    u16 subPriority;
    u8 monId;
    const BattleEventHandlerEntry *handlers;
    u32 packed;
    u32 priority;

    ability = GetBattleMonStat(mon, BATTLEMON_ABILITY);
#ifdef PAPERWHITE2
    // Paper White 2: the whole table, with the rows the hack adds (the original runs to its 0x9e rows), and an added
    // ability takes the handlers of the ability it is made like ("handlers_like"), registered with its own ID, so its
    // popup shows its name
    for (i = 0; i < NELEMS(sAbilityEventAddTable); i++) {
        if (PaperWhite2_GetAbilityHandlersAbility(ability) == sAbilityEventAddTable[i].ability) {
#else
    for (i = 0; i < 0x9e; i++) {
        if (ability == sAbilityEventAddTable[i].ability) {
#endif
            subPriority = calcAbilHandlerSubPriority(mon);
            monId = GetMonID(mon);
            handlers = sAbilityEventAddTable[i].eventAdd(&packed);
            priority = devideNumHandersAndPri(&packed);
            return BattleEvent_AddItem(BATTLE_EVENT_FACTOR_ABILITY, ability, priority, subPriority, monId, handlers,
                                       packed);
        }
    }
    return NULL;
}

u32 numHandlersWithHandlerPri(u32 priority, u32 count) {
    return (priority << 16) | count;
}

u32 devideNumHandersAndPri(u32 *packed) {
    u32 priority;

    priority = (*packed >> 16) & 0xffff;
    if (priority == 0) {
        priority = 5;
    }
    *packed &= 0xffff;
    return priority;
}

void AbilityEvent_RemoveItem(BattleMon *mon) {
    BattleEventItem *item;
    u8 monId;

    monId = GetMonID(mon);
    item = BattleEvent_SeekItem(BATTLE_EVENT_FACTOR_ABILITY, monId);
    if (item != NULL) {
        do {
            BattleEventItem_Remove(item);
            item = BattleEvent_SeekItem(BATTLE_EVENT_FACTOR_ABILITY, monId);
        } while (item != NULL);
    }
}

void AbilityEvent_ItemRotationSleep(BattleMon *mon) {
    BattleEvent_ItemRotationSleep(GetMonID(mon), BATTLE_EVENT_FACTOR_ABILITY);
}

void AbilityEvent_ItemRotationWake(BattleMon *mon) {
    if (!BattleEvent_ItemRotationWake(GetMonID(mon), BATTLE_EVENT_FACTOR_ABILITY)) {
        AbilityEvent_AddItem(mon);
    }
}

void AbilityEvent_Swap(BattleMon *first, BattleMon *second) {
    u8 firstId;
    u8 secondId;
    BattleEventItem *firstItem;
    BattleEventItem *secondItem;

    firstId = GetMonID(first);
    secondId = GetMonID(second);
    firstItem = BattleEvent_SeekItem(BATTLE_EVENT_FACTOR_ABILITY, firstId);
    secondItem = BattleEvent_SeekItem(BATTLE_EVENT_FACTOR_ABILITY, secondId);
    if (firstItem != NULL) {
        BattleEventItem_Remove(firstItem);
    }
    if (secondItem != NULL) {
        BattleEventItem_Remove(secondItem);
    }
    AbilityEvent_AddItem(first);
    AbilityEvent_AddItem(second);
}

// Function name from swan.
u16 calcAbilHandlerSubPriority(BattleMon *mon) {
    return RawBattleMonStat(mon, BATTLEMON_SPEED);
}

// Function name from swan.
BOOL AbilityEvent_RollEffectChance(BtlServerFlow *flow, u32 chance) {
    BOOL result;
    BOOL check;

    if (RollEffectChance(chance)) {
        return TRUE;
    }
    check = BtlServerFlow_CheckDebugFlag(flow, 1);
    result = TRUE;
    if (!check) {
        result = FALSE;
    }
    return result;
}

static const BattleEventHandlerEntry sHandlersIntimidate[] = {
    { BATTLE_EVENT_MEMBER_IN, HandlerIntimidateMemberIn },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerIntimidateMemberIn },
};

const BattleEventHandlerEntry *EventAddIntimidate(u32 *priority) {
    *priority = NELEMS(sHandlersIntimidate);
    return sHandlersIntimidate;
}

void HandlerIntimidateMemberIn(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 *mons;
    u32 side;
    u32 count;
    u32 i;
    BattleHandlerStatChangeParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        side = BtlServerFlow_GetMonBattlePos(flow, monId);
        mons = BtlServerFlow_GetHandlerWork(flow, 6);
        count = HandlerGetAlivePartyCount(flow, (u16)(side | 0x100), mons);
        if (count != 0) {
            BattleHandler_PushRun(flow, 2, monId);
            param = BattleHandler_PushWork(flow, 0xe, monId);
            param->stat = 1;
            param->change = -1;
            param->unk0e = 1;
            param->count = count;
            for (i = 0; i < count; i++) {
                param->monIds[i] = mons[i];
            }
            BattleHandler_PopWork(flow, param);
            BattleHandler_PushRun(flow, 3, monId);
        }
    }
}

static const BattleEventHandlerEntry sHandlersInnerFocus[] = {
    { BATTLE_EVENT_CHECK_FLINCH, HandlerInnerFocus },
};

const BattleEventHandlerEntry *EventAddInnerFocus(u32 *priority) {
    *priority = NELEMS(sHandlersInnerFocus);
    return sHandlersInnerFocus;
}

void HandlerInnerFocus(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
    }
}

static const BattleEventHandlerEntry sHandlersSteadfast[] = {
    { BATTLE_EVENT_MOVE_EXECUTE_FAIL, HandlerSteadfast },
};

const BattleEventHandlerEntry *EventAddSteadfast(u32 *priority) {
    *priority = NELEMS(sHandlersSteadfast);
    return sHandlersSteadfast;
}

void HandlerSteadfast(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerStatChangeParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_FAIL_CAUSE) == 6) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
            param = BattleHandler_PushWork(flow, 0xe, monId);
            param->popup = 1;
            param->stat = 5;
            param->change = 1;
            param->unk0e = 0;
            param->count = 1;
            param->monIds[0] = monId;
            BattleHandler_PopWork(flow, param);
        }
    }
}

static const BattleEventHandlerEntry sHandlersThickFat[] = {
    { BATTLE_EVENT_ATTACK_STAT, HandlerThickFat },
};

const BattleEventHandlerEntry *EventAddThickFat(u32 *priority) {
    *priority = NELEMS(sHandlersThickFat);
    return sHandlersThickFat;
}

void HandlerThickFat(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 type;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        type = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_TYPE);
        if (type == 14 || type == 9) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(0.5));
        }
    }
}

static const BattleEventHandlerEntry sHandlersHugePower[] = {
    { BATTLE_EVENT_ATTACK_STAT, HandlerHugePower },
};

const BattleEventHandlerEntry *EventAddHugePower(u32 *priority) {
    *priority = NELEMS(sHandlersHugePower);
    return sHandlersHugePower;
}

void HandlerHugePower(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u16 move;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        move = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE);
        if (PML_MoveGetCategory(move) == 1) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(2));
        }
    }
}

void HandlerSwiftSwim(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (GetWeather(flow) == 2) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(2));
        }
    }
}

static const BattleEventHandlerEntry sHandlersSwiftSwim[] = {
    { BATTLE_EVENT_CALCULATE_SPEED, HandlerSwiftSwim },
};

const BattleEventHandlerEntry *EventAddSwiftSwim(u32 *priority) {
    *priority = NELEMS(sHandlersSwiftSwim);
    return sHandlersSwiftSwim;
}

void HandlerChlorophyll(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (GetWeather(flow) == 1) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(2));
        }
    }
}

static const BattleEventHandlerEntry sHandlersChlorophyll[] = {
    { BATTLE_EVENT_CALCULATE_SPEED, HandlerChlorophyll },
};

const BattleEventHandlerEntry *EventAddChlorophyll(u32 *priority) {
    *priority = NELEMS(sHandlersChlorophyll);
    return sHandlersChlorophyll;
}

void HandlerQuickFeet(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (GetBattleMonStatus(GetBattleMon(flow, monId)) != 0) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(1.5));
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_GENERAL_FLAG, 0);
        }
    }
}

static const BattleEventHandlerEntry sHandlersQuickFeet[] = {
    { BATTLE_EVENT_CALCULATE_SPEED, HandlerQuickFeet },
};

const BattleEventHandlerEntry *EventAddQuickFeet(u32 *priority) {
    *priority = NELEMS(sHandlersQuickFeet);
    return sHandlersQuickFeet;
}

void HandlerTangledFeet(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        if (CheckCondition(GetBattleMon(flow, monId), 6)) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(0.5));
        }
    }
}

static const BattleEventHandlerEntry sHandlersTangledFeet[] = {
    { BATTLE_EVENT_GET_MOVE_ACCURACY, HandlerTangledFeet },
};

const BattleEventHandlerEntry *EventAddTangledFeet(u32 *priority) {
    *priority = NELEMS(sHandlersTangledFeet);
    return sHandlersTangledFeet;
}

void HandlerHustleAccuracy(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u16 move;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        move = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE);
        if (PML_MoveGetCategory(move) == 1) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(0.8));
        }
    }
}

void HandlerHustlePower(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 value;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        if (PML_MoveGetCategory(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE)) == 1) {
            value = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACK);
            value = fixed_round(value, (3 << 11));
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_ATTACK, value);
        }
    }
}

static const BattleEventHandlerEntry sHandlersHustle[] = {
    { BATTLE_EVENT_GET_MOVE_ACCURACY, HandlerHustleAccuracy },
    { BATTLE_EVENT_ATTACK_STAT, HandlerHustlePower },
};

const BattleEventHandlerEntry *EventAddHustle(u32 *priority) {
    *priority = NELEMS(sHandlersHustle);
    return sHandlersHustle;
}

void HandlerStall(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_SPECIAL_PRIORITY, 0);
    }
}

static const BattleEventHandlerEntry sHandlersStall[] = {
    { BATTLE_EVENT_CHECK_SPECIAL_PRIORITY, HandlerStall },
};

const BattleEventHandlerEntry *EventAddStall(u32 *priority) {
    *priority = numHandlersWithHandlerPri(7, 1);
    return sHandlersStall;
}

void HandlerSlowStartCalcSpeed(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId && work[3] != 0) {
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, 0x800);
    }
}

void HandlerSlowStartAttackPower(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId && work[3] != 0) {
        if (PML_MoveGetCategory(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE)) == 1) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, 0x800);
        }
    }
}

void HandlerSlowStartMemberIn(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        HandlerSlowStartTextSet(item, flow, monId, work);
    }
}

void HandlerSlowStartAfterRotation(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (work[0] == 0) {
        HandlerSlowStartTextSet(item, flow, monId, work);
    }
}

void HandlerSlowStartTextSet(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerMessageParam *param;

    work[0] = 1;
    work[1] = 0;
    work[2] = 0;
    work[3] = work[0];
    param = BattleHandler_PushWork(flow, 4, monId);
    param->popup = 1;
    BattleHandler_StrSetup(&param->string, 2, 0x1f0);
    BattleHandler_AddArg(&param->string, monId);
    BattleHandler_PopWork(flow, param);
}

void HandlerSlowStartTurnCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleAction action;
    BattleHandlerMessageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId && work[2] == 0) {
        if (work[1] < 5) {
            if (!BtlServerFlow_GetPendingAction(flow, monId, &action)) {
                return;
            }
            if (action.bits.action == BATTLE_ACTION_CHANGE) {
                return;
            }
            work[1]++;
        }
        if (work[1] >= 5) {
            param = BattleHandler_PushWork(flow, 4, monId);
            BattleHandler_StrSetup(&param->string, 2, 0x1f3);
            BattleHandler_AddArg(&param->string, monId);
            BattleHandler_PopWork(flow, param);
            work[3] = 0;
            work[2] = 1;
        }
    }
}

static const BattleEventHandlerEntry sHandlersSlowStart[] = {
    { BATTLE_EVENT_MEMBER_IN, HandlerSlowStartMemberIn },
    { BATTLE_EVENT_ROTATION_IN, HandlerSlowStartAfterRotation },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerSlowStartMemberIn },
    { BATTLE_EVENT_CALCULATE_SPEED, HandlerSlowStartCalcSpeed },
    { BATTLE_EVENT_ATTACK_STAT, HandlerSlowStartAttackPower },
    { BATTLE_EVENT_TURN_CHECK, HandlerSlowStartTurnCheck },
};

const BattleEventHandlerEntry *EventAddSlowStart(u32 *priority) {
    *priority = NELEMS(sHandlersSlowStart);
    return sHandlersSlowStart;
}

void HandlerCompoundEyes(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(1.3));
    }
}

static const BattleEventHandlerEntry sHandlersCompoundEyes[] = {
    { BATTLE_EVENT_GET_MOVE_ACCURACY, HandlerCompoundEyes },
};

const BattleEventHandlerEntry *EventAddCompoundEyes(u32 *priority) {
    *priority = NELEMS(sHandlersCompoundEyes);
    return sHandlersCompoundEyes;
}

void HandlerSandVeil(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        if (GetWeather(flow) == 4) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(0.8));
        }
    }
}

void HandlerSandVeilWeather(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonWeatherGuard(item, flow, monId, work, 4);
}

static const BattleEventHandlerEntry sHandlersSandVeil[] = {
    { BATTLE_EVENT_GET_MOVE_ACCURACY, HandlerSandVeil },
    { BATTLE_EVENT_CHECK_WEATHER_DAMAGE, HandlerSandVeilWeather },
};

const BattleEventHandlerEntry *EventAddSandVeil(u32 *priority) {
    *priority = NELEMS(sHandlersSandVeil);
    return sHandlersSandVeil;
}

void HandlerSnowCloak(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        if (GetWeather(flow) == 3) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(0.8));
        }
    }
}

void HandlerSnowCloakWeather(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonWeatherGuard(item, flow, monId, work, 3);
}

static const BattleEventHandlerEntry sHandlersSnowCloak[] = {
    { BATTLE_EVENT_GET_MOVE_ACCURACY, HandlerSnowCloak },
    { BATTLE_EVENT_CHECK_WEATHER_DAMAGE, HandlerSnowCloakWeather },
};

const BattleEventHandlerEntry *EventAddSnowCloak(u32 *priority) {
    *priority = NELEMS(sHandlersSnowCloak);
    return sHandlersSnowCloak;
}

void CommonWeatherGuard(BattleEventItem *item, BtlServerFlow *flow, u32 monId, u32 *work, u8 weather) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if ((s32)BattleEventVar_GetValue(BATTLE_EVENT_VAR_DAMAGE) > 0) {
            if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_WEATHER) == weather) {
                BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
            }
        }
    }
}

void HandlerTintedLens(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        if (BtlCalc_GetEffectivenessCategory(BattleEventVar_GetValue(BATTLE_EVENT_VAR_TYPE_EFFECTIVENESS)) == 3) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(2));
        }
    }
}

static const BattleEventHandlerEntry sHandlersTintedLens[] = {
    { BATTLE_EVENT_DAMAGE_RATIO, HandlerTintedLens },
};

const BattleEventHandlerEntry *EventAddTintedLens(u32 *priority) {
    *priority = NELEMS(sHandlersTintedLens);
    return sHandlersTintedLens;
}

void HandlerSolidRock(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        if (BtlCalc_GetEffectivenessCategory(BattleEventVar_GetValue(BATTLE_EVENT_VAR_TYPE_EFFECTIVENESS)) == 2) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(0.75));
        }
    }
}

static const BattleEventHandlerEntry sHandlersSolidRock[] = {
    { BATTLE_EVENT_DAMAGE_RATIO, HandlerSolidRock },
};

const BattleEventHandlerEntry *EventAddSolidRock(u32 *priority) {
    *priority = NELEMS(sHandlersSolidRock);
    return sHandlersSolidRock;
}

void HandlerSniper(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_CRITICAL_FLAG) != 0) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(1.5));
        }
    }
}

static const BattleEventHandlerEntry sHandlersSniper[] = {
    { BATTLE_EVENT_DAMAGE_RATIO, HandlerSniper },
};

const BattleEventHandlerEntry *EventAddSniper(u32 *priority) {
    *priority = NELEMS(sHandlersSniper);
    return sHandlersSniper;
}

void HandlerSpeedBoost(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleMon *mon;
    BattleHandlerStatChangeParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        mon = GetBattleMon(flow, monId);
        if (GetAdditionalConditionFlag(mon, 0)) {
            param = BattleHandler_PushWork(flow, 0xe, monId);
            param->popup = 1;
            param->stat = 5;
            param->count = 1;
            param->monIds[0] = monId;
            param->change = 1;
            BattleHandler_PopWork(flow, param);
        }
    }
}

static const BattleEventHandlerEntry sHandlersSpeedBoost[] = {
    { BATTLE_EVENT_TURN_CHECK, HandlerSpeedBoost },
};

const BattleEventHandlerEntry *EventAddSpeedBoost(u32 *priority) {
    *priority = NELEMS(sHandlersSpeedBoost);
    return sHandlersSpeedBoost;
}

void HandlerAdaptability(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_SAME_TYPE) != 0) {
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_RATIO, (2 << 12));
        }
    }
}

static const BattleEventHandlerEntry sHandlersAdaptability[] = {
    { BATTLE_EVENT_SAME_TYPE_BONUS, HandlerAdaptability },
};

const BattleEventHandlerEntry *EventAddAdaptability(u32 *priority) {
    *priority = NELEMS(sHandlersAdaptability);
    return sHandlersAdaptability;
}

void HandlerBlaze(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonLowHPBoostAbility(flow, monId, 9);
}

static const BattleEventHandlerEntry sHandlersBlaze[] = {
    { BATTLE_EVENT_ATTACK_STAT, HandlerBlaze },
};

const BattleEventHandlerEntry *EventAddBlaze(u32 *priority) {
    *priority = NELEMS(sHandlersBlaze);
    return sHandlersBlaze;
}

void HandlerTorrent(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonLowHPBoostAbility(flow, monId, 10);
}

static const BattleEventHandlerEntry sHandlersTorrent[] = {
    { BATTLE_EVENT_ATTACK_STAT, HandlerTorrent },
};

const BattleEventHandlerEntry *EventAddTorrent(u32 *priority) {
    *priority = NELEMS(sHandlersTorrent);
    return sHandlersTorrent;
}

void HandlerOvergrow(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonLowHPBoostAbility(flow, monId, 11);
}

static const BattleEventHandlerEntry sHandlersOvergrow[] = {
    { BATTLE_EVENT_ATTACK_STAT, HandlerOvergrow },
};

const BattleEventHandlerEntry *EventAddOvergrow(u32 *priority) {
    *priority = NELEMS(sHandlersOvergrow);
    return sHandlersOvergrow;
}

void HandlerSwarm(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonLowHPBoostAbility(flow, monId, 6);
}

static const BattleEventHandlerEntry sHandlersSwarm[] = {
    { BATTLE_EVENT_ATTACK_STAT, HandlerSwarm },
};

const BattleEventHandlerEntry *EventAddSwarm(u32 *priority) {
    *priority = NELEMS(sHandlersSwarm);
    return sHandlersSwarm;
}

void CommonLowHPBoostAbility(BtlServerFlow *flow, u8 monId, u32 type) {
    BattleMon *mon;
    u32 threshold;
    u32 divisor;

    divisor = 3;
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        mon = GetBattleMon(flow, monId);
        threshold = DivideMaxHp(mon, divisor);
        if (GetBattleMonStat(mon, BATTLEMON_HP) <= threshold) {
            if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_TYPE) == type) {
                BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, divisor << 11);
            }
        }
    }
}

void HandlerGuts(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleMon *mon;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        mon = GetBattleMon(flow, monId);
        if (GetBattleMonStatus(mon) != 0) {
            if (PML_MoveGetCategory(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE)) == 1) {
                BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(1.5));
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersGuts[] = {
    { BATTLE_EVENT_ATTACK_STAT, HandlerGuts },
};

const BattleEventHandlerEntry *EventAddGuts(u32 *priority) {
    *priority = NELEMS(sHandlersGuts);
    return sHandlersGuts;
}

void HandlerPlusMinus(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        if (CheckAllyHasAbility(flow, monId, (u8 *)work, 0x39) || CheckAllyHasAbility(flow, monId, (u8 *)work, 0x3a)) {
            if (PML_MoveGetCategory(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE)) == 2) {
                BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(1.5));
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersPlusMinus[] = {
    { BATTLE_EVENT_ATTACK_STAT, HandlerPlusMinus },
};

const BattleEventHandlerEntry *EventAddPlusMinus(u32 *priority) {
    *priority = NELEMS(sHandlersPlusMinus);
    return sHandlersPlusMinus;
}

BOOL CheckAllyHasAbility(BtlServerFlow *flow, u8 monId, u8 *mons, u32 ability) {
    u16 packed;
    u32 pos;
    u8 count;
    u8 i;

    pos = BtlServerFlow_MonIDToPos(flow, monId);
    if (pos != 6) {
        packed = (7 << 8) | pos;
        count = HandlerGetAlivePartyCount(flow, packed, mons);
        for (i = 0; i < count; i++) {
            if (monId != mons[i] &&
                GetBattleMonStat(GetBattleMon(flow, mons[i]), BATTLEMON_EFFECTIVE_ABILITY) == ability) {
                return TRUE;
            }
        }
    }
    return FALSE;
}

BOOL CheckFlowerGiftEnablePokemon(BtlServerFlow *flow, u8 monId) {
    return GetBattleMonSpecies(GetBattleMon(flow, monId)) == 0x1a5;
}

void HandlerFlowerGiftMemberOnField(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 sunny;
    u32 weather;

    if (CheckFlowerGiftEnablePokemon(flow, monId)) {
        weather = GetWeather(flow);
        sunny = 1;
        if (weather != 1) {
            sunny = 0;
        }
        CommonFlowerGiftFormChange(item, flow, monId, sunny, 1);
        *work = 1;
    }
}

void HandlerFlowerGiftGotAbility(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        HandlerFlowerGiftMemberOnField(item, flow, monId, work);
    }
}

void CommonFlowerGiftFormChange(BattleEventItem *item, BtlServerFlow *flow, u8 monId, u8 sunny, u8 cause) {
    BattleMon *mon;
    BattleHandlerChangeFormParam *work;

    mon = GetBattleMon(flow, monId);
    if (sunny != GetBattleMonStat(mon, BATTLEMON_FORM)) {
        work = BattleHandler_PushWork(flow, 0x39, monId);
        work->monIndex = monId;
        work->form = sunny;
        work->popup = cause;
        BattleHandler_StrSetup(&work->string, 2, 0xde);
        BattleHandler_AddArg(&work->string, monId);
        BattleHandler_PopWork(flow, work);
    }
}

void HandlerFlowerGiftWeather(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 weather;
    u32 sunny;

    if (*work) {
        if (CheckFlowerGiftEnablePokemon(flow, monId)) {
            weather = GetWeather(flow);
            sunny = 1;
            if (weather != 1) {
                sunny = 0;
            }
            CommonFlowerGiftFormChange(item, flow, monId, sunny, 1);
        }
    }
}

void HandlerFlowerGiftAbilityOff(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (*work) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
            if (CheckFlowerGiftEnablePokemon(flow, monId)) {
                CommonFlowerGiftFormChange(item, flow, monId, 0, 0);
            }
        }
    }
}

void HandlerFlowerGiftAirLock(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (*work) {
        if (CheckFlowerGiftEnablePokemon(flow, monId)) {
            CommonFlowerGiftFormChange(item, flow, monId, 0, 0);
        }
    }
}

void HandlerFlowerGiftAbilityChange(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 ability;

    if (*work) {
        if (CheckFlowerGiftEnablePokemon(flow, monId)) {
            if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
                ability = BattleEventVar_GetValue(BATTLE_EVENT_VAR_NEXT_ABILITY);
                if (ability != BattleEventItem_GetSubID(item)) {
                    CommonFlowerGiftFormChange(item, flow, monId, 0, 0);
                }
            }
        }
    }
}

void HandlerFlowerGiftPower(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 allyMonId;

    if (CheckFlowerGiftEnablePokemon(flow, monId)) {
        if (GetWeather(flow) == 1) {
            allyMonId = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER);
            if (IsAllyMonID(monId, allyMonId)) {
                if (PML_MoveGetCategory(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE)) == 1) {
                    BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(1.5));
                }
            }
        }
    }
}

void HandlerFlowerGiftSpecialDefense(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 allyMonId;

    if (CheckFlowerGiftEnablePokemon(flow, monId)) {
        if (GetWeather(flow) == 1) {
            allyMonId = BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER);
            if (IsAllyMonID(monId, allyMonId)) {
                if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_CATEGORY) == 2) {
                    BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(1.5));
                }
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersFlowerGift[] = {
    { BATTLE_EVENT_MEMBER_IN_COMPLETE, HandlerFlowerGiftMemberOnField },
    { BATTLE_EVENT_ROTATION_IN, HandlerFlowerGiftMemberOnField },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerFlowerGiftGotAbility },
    { BATTLE_EVENT_AFTER_WEATHER_CHANGE, HandlerFlowerGiftWeather },
    { BATTLE_EVENT_GASTRO_ACID_CONFIRMED, HandlerFlowerGiftAbilityOff },
    { BATTLE_EVENT_NOTIFY_AIR_LOCK, HandlerFlowerGiftAirLock },
    { BATTLE_EVENT_ACTION_END, HandlerFlowerGiftWeather },
    { BATTLE_EVENT_TURN_CHECK_LATE, HandlerFlowerGiftWeather },
    { BATTLE_EVENT_CHANGE_ABILITY_BEFORE, HandlerFlowerGiftAbilityChange },
    { BATTLE_EVENT_ATTACK_STAT, HandlerFlowerGiftPower },
    { BATTLE_EVENT_DEFENSE_STAT, HandlerFlowerGiftSpecialDefense },
};

const BattleEventHandlerEntry *EventAddFlowerGift(u32 *priority) {
    *priority = NELEMS(sHandlersFlowerGift);
    return sHandlersFlowerGift;
}

void HandlerRivalry(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleMon *attacker;
    BattleMon *defender;
    u8 attackerGender;
    u8 defenderGender;
    u32 targetMonId;
    u32 multiplier;

    multiplier = 3;
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        attacker = GetBattleMon(flow, monId);
        targetMonId = BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER);
        defender = GetBattleMon(flow, (u8)targetMonId);
        attackerGender = GetBattleMonStat(attacker, BATTLEMON_GENDER);
        defenderGender = GetBattleMonStat(defender, BATTLEMON_GENDER);
        if (attackerGender != 2 && defenderGender != 2) {
            if (attackerGender == defenderGender) {
                BattleEventVar_MulValue(BATTLE_EVENT_VAR_POWER_RATIO, FX32_CONST(1.25));
                return;
            }
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_POWER_RATIO, multiplier << 10);
        }
    }
}

static const BattleEventHandlerEntry sHandlersRivalry[] = {
    { BATTLE_EVENT_MOVE_POWER_RATIO, HandlerRivalry },
};

const BattleEventHandlerEntry *EventAddRivalry(u32 *priority) {
    *priority = NELEMS(sHandlersRivalry);
    return sHandlersRivalry;
}

void HandlerTechnician(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_POWER) <= 0x3c) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_POWER_RATIO, FX32_CONST(1.5));
        }
    }
}

static const BattleEventHandlerEntry sHandlersTechnician[] = {
    { BATTLE_EVENT_MOVE_POWER_RATIO, HandlerTechnician },
};

const BattleEventHandlerEntry *EventAddTechnician(u32 *priority) {
    *priority = NELEMS(sHandlersTechnician);
    return sHandlersTechnician;
}

void HandlerIronFist(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        if (getMoveFlag(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE), 7)) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_POWER_RATIO, FX32_CONST(1.2));
        }
    }
}

static const BattleEventHandlerEntry sHandlersIronFist[] = {
    { BATTLE_EVENT_MOVE_POWER_RATIO, HandlerIronFist },
};

const BattleEventHandlerEntry *EventAddIronFist(u32 *priority) {
    *priority = NELEMS(sHandlersIronFist);
    return sHandlersIronFist;
}

void HandlerReckless(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u16 move;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        move = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE);
        if (PML_MoveGetParam(move, MOVE_PARAM_RECOIL) || move == 0x1a || move == 0x88) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_POWER_RATIO, FX32_CONST(1.2));
        }
    }
}

static const BattleEventHandlerEntry sHandlersReckless[] = {
    { BATTLE_EVENT_MOVE_POWER_RATIO, HandlerReckless },
};

const BattleEventHandlerEntry *EventAddReckless(u32 *priority) {
    *priority = NELEMS(sHandlersReckless);
    return sHandlersReckless;
}

void HandlerMarvelScale(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleMon *mon;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        mon = GetBattleMon(flow, monId);
        if (GetBattleMonStatus(mon)) {
            BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE);
            if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_CATEGORY) == 1) {
                BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(1.5));
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersMarvelScale[] = {
    { BATTLE_EVENT_DEFENSE_STAT, HandlerMarvelScale },
};

const BattleEventHandlerEntry *EventAddMarvelScale(u32 *priority) {
    *priority = NELEMS(sHandlersMarvelScale);
    return sHandlersMarvelScale;
}

void HandlerSkillLink(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_GENERAL_FLAG, 1);
    }
}

static const BattleEventHandlerEntry sHandlersSkillLink[] = {
    { BATTLE_EVENT_CHECK_MULTIHIT_HITS, HandlerSkillLink },
};

const BattleEventHandlerEntry *EventAddSkillLink(u32 *priority) {
    *priority = NELEMS(sHandlersSkillLink);
    return sHandlersSkillLink;
}

static const BattleEventHandlerEntry sHandlersHyperCutter[] = {
    { BATTLE_EVENT_CHECK_STAT_CHANGE, HandlerHyperCutterCheck },
    { BATTLE_EVENT_STAT_CHANGE_FAILED, HandlerHyperCutterGuard },
};

const BattleEventHandlerEntry *EventAddHyperCutter(u32 *priority) {
    *priority = NELEMS(sHandlersHyperCutter);
    return sHandlersHyperCutter;
}

void HandlerHyperCutterCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonStatDropGuardCheck(flow, monId, work, BATTLEMON_ATTACK_STAGE);
}

void HandlerHyperCutterGuard(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonStatDropGuardFixed(flow, monId, work, 0xc9);
}

static const BattleEventHandlerEntry sHandlersKeenEye[] = {
    { BATTLE_EVENT_CHECK_STAT_CHANGE, HandlerKeenEyeCheck },
    { BATTLE_EVENT_STAT_CHANGE_FAILED, HandlerKeenEyeGuard },
};

const BattleEventHandlerEntry *EventAddKeenEye(u32 *priority) {
    *priority = NELEMS(sHandlersKeenEye);
    return sHandlersKeenEye;
}

void HandlerKeenEyeCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonStatDropGuardCheck(flow, monId, work, BATTLEMON_ACCURACY_STAGE);
}

void HandlerKeenEyeGuard(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonStatDropGuardFixed(flow, monId, work, 0xcf);
}

static const BattleEventHandlerEntry sHandlersClearBody[] = {
    { BATTLE_EVENT_CHECK_STAT_CHANGE, HandlerClearBodyCheck },
    { BATTLE_EVENT_STAT_CHANGE_FAILED, HandlerClearBodyGuard },
};

const BattleEventHandlerEntry *EventAddClearBody(u32 *priority) {
    *priority = NELEMS(sHandlersClearBody);
    return sHandlersClearBody;
}

void HandlerClearBodyCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonStatDropGuardCheck(flow, monId, work, MOVE_STAT_CHANGE_MULTI);
}

void HandlerClearBodyGuard(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonStatDropGuardFixed(flow, monId, work, 0xc6);
}

void CommonStatDropGuardCheck(BtlServerFlow *flow, u32 monId, u32 *result, u32 stat) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) != monId) {
            if (stat == MOVE_STAT_CHANGE_MULTI || BattleEventVar_GetValue(BATTLE_EVENT_VAR_STAT) == stat) {
                if ((s32)BattleEventVar_GetValue(BATTLE_EVENT_VAR_VOLUME) < 0) {
                    *result = BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
                }
            }
        }
    }
}

void CommonStatDropGuardFixed(BtlServerFlow *flow, u32 monId, u32 *result, u16 message) {
    u32 source;
    BattleHandlerMessageParam *work;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId && result[0]) {
        source = BattleEventVar_GetValue(BATTLE_EVENT_VAR_STAT_CHANGE_MOVE);
        if (source == 0 || result[1] != source) {
            BattleHandler_PushRun(flow, 2, monId);
            work = BattleHandler_PushWork(flow, 4, monId);
            BattleHandler_StrSetup(&work->string, 2, message);
            BattleHandler_AddArg(&work->string, monId);
            BattleHandler_PopWork(flow, work);
            BattleHandler_PushRun(flow, 3, monId);
            result[1] = source;
        }
        result[0] = 0;
    }
}

void HandlerSimple(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_VOLUME, BattleEventVar_GetValue(BATTLE_EVENT_VAR_VOLUME) << 1);
    }
}

static const BattleEventHandlerEntry sHandlersSimple[] = {
    { BATTLE_EVENT_STAT_CHANGE_AMOUNT, HandlerSimple },
};

const BattleEventHandlerEntry *EventAddSimple(u32 *priority) {
    *priority = NELEMS(sHandlersSimple);
    return sHandlersSimple;
}

void HandlerLeafGuard(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 condition;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        if (GetWeather(flow) == 1) {
            condition = BattleEventVar_GetValue(BATTLE_EVENT_VAR_CONDITION);
            if (IsBasicStatus(condition) || condition == 0xe) {
                *work = BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
            }
        }
    }
}

void HandlerLeafGuardYawnCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (GetWeather(flow) == 1) {
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
        }
    }
}

static const BattleEventHandlerEntry sHandlersLeafGuard[] = {
    { BATTLE_EVENT_MOVE_CONDITION_CHECK_FAIL, HandlerLeafGuard },
    { BATTLE_EVENT_ADD_CONDITION_FAILED, HandlerAddStatusFailedCommon },
    { BATTLE_EVENT_CHECK_SLEEP_PREVENTED, HandlerLeafGuardYawnCheck },
};

const BattleEventHandlerEntry *EventAddLeafGuard(u32 *priority) {
    *priority = NELEMS(sHandlersLeafGuard);
    return sHandlersLeafGuard;
}

void HandlerLimberStatus(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    *work = HandlerCommonGuardStatus(flow, monId, 1);
}

void HandlerLimberCureStatus(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonAbilityCureStatus(flow, monId, 1);
}

void HandlerLimberActionEnd(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonAbilityCureStatusCore(flow, monId, 1);
}

static const BattleEventHandlerEntry sHandlersLimber[] = {
    { BATTLE_EVENT_MOVE_CONDITION_CHECK_FAIL, HandlerLimberStatus },
    { BATTLE_EVENT_ADD_CONDITION_FAILED, HandlerAddStatusFailedCommon },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerLimberCureStatus },
    { BATTLE_EVENT_MEMBER_IN, HandlerLimberCureStatus },
    { BATTLE_EVENT_ACTION_END, HandlerLimberActionEnd },
};

const BattleEventHandlerEntry *EventAddLimber(u32 *priority) {
    *priority = NELEMS(sHandlersLimber);
    return sHandlersLimber;
}

void HandlerInsomniaStatus(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    *work = HandlerCommonGuardStatus(flow, monId, 2);
    if (!*work) {
        *work = HandlerCommonGuardStatus(flow, monId, 0xe);
    }
}

void HandlerInsomniaWake(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonAbilityCureStatus(flow, monId, 2);
}

void HandlerInsomniaActionEnd(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonAbilityCureStatusCore(flow, monId, 2);
}

void HandlerInsomniaYawnCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
    }
}

static const BattleEventHandlerEntry sHandlersInsomnia[] = {
    { BATTLE_EVENT_MOVE_CONDITION_CHECK_FAIL, HandlerInsomniaStatus },
    { BATTLE_EVENT_CHECK_SLEEP_PREVENTED, HandlerInsomniaYawnCheck },
    { BATTLE_EVENT_ADD_CONDITION_FAILED, HandlerAddStatusFailedCommon },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerInsomniaWake },
    { BATTLE_EVENT_MEMBER_IN, HandlerInsomniaWake },
    { BATTLE_EVENT_ACTION_END, HandlerInsomniaActionEnd },
};

const BattleEventHandlerEntry *EventAddInsomnia(u32 *priority) {
    *priority = NELEMS(sHandlersInsomnia);
    return sHandlersInsomnia;
}

void HandlerMagmaArmorStatus(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    *work = HandlerCommonGuardStatus(flow, monId, 3);
}

void HandlerMagmaArmorCureStatus(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonAbilityCureStatus(flow, monId, 3);
}

void HandlerMagmaArmorActionEnd(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonAbilityCureStatusCore(flow, monId, 3);
}

static const BattleEventHandlerEntry sHandlersMagmaArmor[] = {
    { BATTLE_EVENT_MOVE_CONDITION_CHECK_FAIL, HandlerMagmaArmorStatus },
    { BATTLE_EVENT_ADD_CONDITION_FAILED, HandlerAddStatusFailedCommon },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerMagmaArmorCureStatus },
    { BATTLE_EVENT_MEMBER_IN, HandlerMagmaArmorCureStatus },
    { BATTLE_EVENT_ACTION_END, HandlerMagmaArmorActionEnd },
};

const BattleEventHandlerEntry *EventAddMagmaArmor(u32 *priority) {
    *priority = NELEMS(sHandlersMagmaArmor);
    return sHandlersMagmaArmor;
}

void HandlerImmunity(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    *work = HandlerCommonGuardStatus(flow, monId, 5);
}

void HandlerImmunityCureStatus(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonAbilityCureStatus(flow, monId, 5);
}

void HandlerImmunityActionEnd(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonAbilityCureStatusCore(flow, monId, 5);
}

static const BattleEventHandlerEntry sHandlersImmunity[] = {
    { BATTLE_EVENT_MOVE_CONDITION_CHECK_FAIL, HandlerImmunity },
    { BATTLE_EVENT_ADD_CONDITION_FAILED, HandlerAddStatusFailedCommon },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerImmunityCureStatus },
    { BATTLE_EVENT_MEMBER_IN, HandlerImmunityCureStatus },
    { BATTLE_EVENT_ACTION_END, HandlerImmunityActionEnd },
};

const BattleEventHandlerEntry *EventAddImmunity(u32 *priority) {
    *priority = NELEMS(sHandlersImmunity);
    return sHandlersImmunity;
}

void HandlerWaterVeil(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    *work = HandlerCommonGuardStatus(flow, monId, 4);
}

void HandlerWaterVeilCureStatus(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonAbilityCureStatus(flow, monId, 4);
}

void HandlerWaterVeilActionEnd(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonAbilityCureStatusCore(flow, monId, 4);
}

static const BattleEventHandlerEntry sHandlersWaterVeil[] = {
    { BATTLE_EVENT_MOVE_CONDITION_CHECK_FAIL, HandlerWaterVeil },
    { BATTLE_EVENT_ADD_CONDITION_FAILED, HandlerAddStatusFailedCommon },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerWaterVeilCureStatus },
    { BATTLE_EVENT_MEMBER_IN, HandlerWaterVeilCureStatus },
    { BATTLE_EVENT_ACTION_END, HandlerWaterVeilActionEnd },
};

const BattleEventHandlerEntry *EventAddWaterVeil(u32 *priority) {
    *priority = NELEMS(sHandlersWaterVeil);
    return sHandlersWaterVeil;
}

void HandlerOwnTempoStatus(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    *work = HandlerCommonGuardStatus(flow, monId, 6);
}

void HandlerOwnTempoAddStatusFailed(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonAddStatusFailed(item, flow, monId, work, 0x165);
}

void HandlerOwnTempoCureStatus(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonAbilityCureStatus(flow, monId, 6);
}

void HandlerOwnTempoActionEnd(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonAbilityCureStatusCore(flow, monId, 6);
}

static const BattleEventHandlerEntry sHandlersOwnTempo[] = {
    { BATTLE_EVENT_MOVE_CONDITION_CHECK_FAIL, HandlerOwnTempoStatus },
    { BATTLE_EVENT_ADD_CONDITION_FAILED, HandlerOwnTempoAddStatusFailed },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerOwnTempoCureStatus },
    { BATTLE_EVENT_ACTION_END, HandlerOwnTempoActionEnd },
};

const BattleEventHandlerEntry *EventAddOwnTempo(u32 *priority) {
    *priority = NELEMS(sHandlersOwnTempo);
    return sHandlersOwnTempo;
}

void HandlerOblivious(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    *work = HandlerCommonGuardStatus(flow, monId, 7);
}

void HandlerObliviousCureStatus(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonAbilityCureStatus(flow, monId, 7);
}

void HandlerObliviousActionEnd(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonAbilityCureStatusCore(flow, monId, 7);
}

void HandlerObliviousNoEffectCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerMessageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        if ((u16)BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE) == 0x1bd) {
            if (BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_NO_EFFECT, 1)) {
                BattleHandler_PushRun(flow, 2, monId);
                param = BattleHandler_PushWork(flow, 4, monId);
                BattleHandler_StrSetup(&param->string, 2, 0xd2);
                BattleHandler_AddArg(&param->string, monId);
                BattleHandler_PopWork(flow, param);
                BattleHandler_PushRun(flow, 3, monId);
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersOblivious[] = {
    { BATTLE_EVENT_MOVE_CONDITION_CHECK_FAIL, HandlerOblivious },
    { BATTLE_EVENT_ADD_CONDITION_FAILED, HandlerAddStatusFailedCommon },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerObliviousCureStatus },
    { BATTLE_EVENT_CHECK_NO_EFFECT_AFTER_PROTECT, HandlerObliviousNoEffectCheck },
    { BATTLE_EVENT_ACTION_END, HandlerObliviousActionEnd },
};

const BattleEventHandlerEntry *EventAddOblivious(u32 *priority) {
    *priority = NELEMS(sHandlersOblivious);
    return sHandlersOblivious;
}

BOOL HandlerCommonGuardStatus(BtlServerFlow *flow, u32 monId, u32 status) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_CONDITION) == status) {
            return BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
        }
    }
    return FALSE;
}

void CommonAddStatusFailed(BattleEventItem *item, BtlServerFlow *flow, u32 monId, u32 *result, u16 message) {
    BattleHandlerMessageParam *work;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        if (*result == 1) {
            BattleHandler_PushRun(flow, 2, monId);
            work = BattleHandler_PushWork(flow, 4, monId);
            BattleHandler_StrSetup(&work->string, 2, message);
            BattleHandler_AddArg(&work->string, monId);
            BattleHandler_PopWork(flow, work);
            BattleHandler_PushRun(flow, 3, monId);
            *result = 0;
        }
    }
}

void HandlerAddStatusFailedCommon(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonAddStatusFailed(item, flow, monId, work, 0xd2);
}

void CommonAbilityCureStatus(BtlServerFlow *flow, u8 monId, u32 status) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        CommonAbilityCureStatusCore(flow, monId, status);
    }
}

void CommonAbilityCureStatusCore(BtlServerFlow *flow, u8 monId, u32 status) {
    BattleMon *mon;
    BattleHandlerCureConditionParam *work;

    mon = GetBattleMon(flow, monId);
    if (CheckCondition(mon, status)) {
        BattleHandler_PushRun(flow, 2, monId);
        work = BattleHandler_PushWork(flow, 0xb, monId);
        work->condition = status;
        work->count = 1;
        work->monIds[0] = monId;
        BattleHandler_PopWork(flow, work);
        BattleHandler_PushRun(flow, 3, monId);
    }
}

void HandlerDrizzle(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonWeatherChangeAbility(flow, monId, 2);
}

static const BattleEventHandlerEntry sHandlersDrizzle[] = {
    { BATTLE_EVENT_MEMBER_IN, HandlerDrizzle },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerDrizzle },
};

const BattleEventHandlerEntry *EventAddDrizzle(u32 *priority) {
    *priority = NELEMS(sHandlersDrizzle);
    return sHandlersDrizzle;
}

void HandlerDrought(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonWeatherChangeAbility(flow, monId, 1);
}

static const BattleEventHandlerEntry sHandlersDrought[] = {
    { BATTLE_EVENT_MEMBER_IN, HandlerDrought },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerDrought },
};

const BattleEventHandlerEntry *EventAddDrought(u32 *priority) {
    *priority = NELEMS(sHandlersDrought);
    return sHandlersDrought;
}

void HandlerSandStream(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonWeatherChangeAbility(flow, monId, 4);
}

static const BattleEventHandlerEntry sHandlersSandStream[] = {
    { BATTLE_EVENT_MEMBER_IN, HandlerSandStream },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerSandStream },
};

const BattleEventHandlerEntry *EventAddSandStream(u32 *priority) {
    *priority = NELEMS(sHandlersSandStream);
    return sHandlersSandStream;
}

void HandlerSnowWarning(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonWeatherChangeAbility(flow, monId, 3);
}

static const BattleEventHandlerEntry sHandlersSnowWarning[] = {
    { BATTLE_EVENT_MEMBER_IN, HandlerSnowWarning },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerSnowWarning },
};

const BattleEventHandlerEntry *EventAddSnowWarning(u32 *priority) {
    *priority = NELEMS(sHandlersSnowWarning);
    return sHandlersSnowWarning;
}

void CommonWeatherChangeAbility(BtlServerFlow *flow, u32 monId, u32 weather) {
    BattleHandlerChangeWeatherParam *work;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        work = BattleHandler_PushWork(flow, 0x1d, monId);
        work->popup = 1;
        work->weather = weather;
        work->duration = 0xff;
        BattleHandler_PopWork(flow, work);
    }
}

void HandlerAirLockMemberIn(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerChangeWeatherParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        param = BattleHandler_PushWork(flow, 0x1d, monId);
        param->popup = 1;
        param->weather = 0;
        param->notifyAirLock = 1;
        BattleHandler_StrSetup(&param->string, 1, 0x5e);
        BattleHandler_PopWork(flow, param);
    }
}

void HandlerAirLockChangeWeather(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
}

static const BattleEventHandlerEntry sHandlersAirLock[] = {
    { BATTLE_EVENT_MEMBER_IN, HandlerAirLockMemberIn },
    { BATTLE_EVENT_GET_WEATHER, HandlerAirLockChangeWeather },
};

const BattleEventHandlerEntry *EventAddAirLock(u32 *priority) {
    *priority = NELEMS(sHandlersAirLock);
    return sHandlersAirLock;
}

void HandlerIceBody(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonWeatherRecoveryAbility(flow, monId, 3);
}

static const BattleEventHandlerEntry sHandlersIceBody[] = {
    { BATTLE_EVENT_CHECK_WEATHER_DAMAGE, HandlerIceBody },
};

const BattleEventHandlerEntry *EventAddIceBody(u32 *priority) {
    *priority = NELEMS(sHandlersIceBody);
    return sHandlersIceBody;
}

void HandlerRainDish(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonWeatherRecoveryAbility(flow, monId, 2);
}

static const BattleEventHandlerEntry sHandlersRainDish[] = {
    { BATTLE_EVENT_CHECK_WEATHER_DAMAGE, HandlerRainDish },
};

const BattleEventHandlerEntry *EventAddRainDish(u32 *priority) {
    *priority = NELEMS(sHandlersRainDish);
    return sHandlersRainDish;
}

void CommonWeatherRecoveryAbility(BtlServerFlow *flow, u8 monId, u32 weather) {
    BattleMon *mon;
    BattleHandlerRecoverHPParam *work;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_WEATHER) == weather) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
            mon = GetBattleMon(flow, monId);
            work = BattleHandler_PushWork(flow, 5, monId);
            work->popup = 1;
            work->targetIndex = monId;
            work->amount = DivideMaxHPZeroCheck(mon, 0x10);
            BattleHandler_PopWork(flow, work);
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
        }
    }
}

void HandlerSolarPowerWeather(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleMon *mon;
    BattleHandlerDamageParam *param;
    u16 amount;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_WEATHER) == 1) {
            mon = GetBattleMon(flow, monId);
            amount = DivideMaxHPZeroCheck(mon, 8);
            BattleHandler_PushRun(flow, 2, monId);
            param = BattleHandler_PushWork(flow, 7, monId);
            param->targetIndex = monId;
            param->amount = amount;
            BattleHandler_PopWork(flow, param);
            BattleHandler_PushRun(flow, 3, monId);
        }
    }
}

void HandlerSolarPowerPower(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        if (GetWeather(flow) == 1) {
            if (PML_MoveGetCategory(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE)) == 2) {
                BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(1.5));
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersSolarPower[] = {
    { BATTLE_EVENT_CHECK_WEATHER_DAMAGE, HandlerSolarPowerWeather },
    { BATTLE_EVENT_ATTACK_STAT, HandlerSolarPowerPower },
};

const BattleEventHandlerEntry *EventAddSolarPower(u32 *priority) {
    *priority = NELEMS(sHandlersSolarPower);
    return sHandlersSolarPower;
}

void HandlerShieldDustStatus(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) != monId) {
            if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_CONDITION) != 8) {
                BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
            }
        }
    }
}

void HandlerShieldDustRank(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) != monId) {
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
        }
    }
}

void HandlerShieldDustShrink(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
    }
}

void HandlerShieldDustGuard(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_SHIELD_DUST_FLAG, 1);
    }
}

void HandlerShieldDustGuardHitEnd(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (IsEventTargetMon(monId)) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_TARGET_COUNT) == 1) {
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_SHIELD_DUST_FLAG, 1);
        }
    }
}

static const BattleEventHandlerEntry sHandlersShieldDust[] = {
    { BATTLE_EVENT_CHECK_MOVE_ADD_CONDITION, HandlerShieldDustStatus },
    { BATTLE_EVENT_ADDED_STAT_CHANGE_CHANCE, HandlerShieldDustRank },
    { BATTLE_EVENT_CHECK_FLINCH, HandlerShieldDustShrink },
    { BATTLE_EVENT_DAMAGE_REACTION_PREVIOUS, HandlerShieldDustGuard },
    { BATTLE_EVENT_DAMAGE_PROCESS_END_CHECK, HandlerShieldDustGuardHitEnd },
};

const BattleEventHandlerEntry *EventAddShieldDust(u32 *priority) {
    *priority = NELEMS(sHandlersShieldDust);
    return sHandlersShieldDust;
}

void HandlerSereneGrace(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 chance;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        chance = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ADDED_EFFECT_CHANCE);
        chance = (u16)(chance << 1);
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_ADDED_EFFECT_CHANCE, chance);
    }
}

void HandlerSereneGraceShrink(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_CRITICAL_FLAG, 1);
    }
}

static const BattleEventHandlerEntry sHandlersSereneGrace[] = {
    { BATTLE_EVENT_CHECK_MOVE_ADD_CONDITION, HandlerSereneGrace },
    { BATTLE_EVENT_ADDED_STAT_CHANGE_CHANCE, HandlerSereneGrace },
    { BATTLE_EVENT_GET_FLINCH_CHANCE, HandlerSereneGraceShrink },
};

const BattleEventHandlerEntry *EventAddSereneGrace(u32 *priority) {
    *priority = NELEMS(sHandlersSereneGrace);
    return sHandlersSereneGrace;
}

void HandlerHydration(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleMon *mon;
    BattleHandlerCureConditionParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (GetWeather(flow) == 2) {
            mon = GetBattleMon(flow, monId);
            if (GetBattleMonStatus(mon)) {
                BattleHandler_PushRun(flow, 2, monId);
                param = BattleHandler_PushWork(flow, 0xb, monId);
                param->condition = CONDITION_ANY_STATUS;
                param->monIds[0] = monId;
                param->count = 1;
                param->unk25 = 1;
                BattleHandler_PopWork(flow, param);
                BattleHandler_PushRun(flow, 3, monId);
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersHydration[] = {
    { BATTLE_EVENT_TURN_CHECK_EARLY, HandlerHydration },
};

const BattleEventHandlerEntry *EventAddHydration(u32 *priority) {
    *priority = NELEMS(sHandlersHydration);
    return sHandlersHydration;
}

void HandlerShedSkin(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleMon *mon;
    BattleHandlerCureConditionParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        mon = GetBattleMon(flow, monId);
        if (GetBattleMonStatus(mon)) {
            if (AbilityEvent_RollEffectChance(flow, 0x21)) {
                param = BattleHandler_PushWork(flow, 0xb, monId);
                param->popup = 1;
                param->unk25 = 1;
                param->condition = CONDITION_ANY_STATUS;
                param->monIds[0] = monId;
                param->count = 1;
                BattleHandler_PopWork(flow, param);
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersShedSkin[] = {
    { BATTLE_EVENT_TURN_CHECK_EARLY, HandlerShedSkin },
};

const BattleEventHandlerEntry *EventAddShedSkin(u32 *priority) {
    *priority = NELEMS(sHandlersShedSkin);
    return sHandlersShedSkin;
}

void HandlerPoisonHeal(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleMon *mon;
    BattleHandlerRecoverHPParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_CONDITION) == 5) {
            mon = GetBattleMon(flow, monId);
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_DAMAGE, 0);
            param = BattleHandler_PushWork(flow, 5, monId);
            param->amount = DivideMaxHPZeroCheck(mon, 8);
            param->targetIndex = monId;
            param->popup = 1;
            BattleHandler_PopWork(flow, param);
        }
    }
}

static const BattleEventHandlerEntry sHandlersPoisonHeal[] = {
    { BATTLE_EVENT_CONDITION_DAMAGE, HandlerPoisonHeal },
};

const BattleEventHandlerEntry *EventAddPoisonHeal(u32 *priority) {
    *priority = NELEMS(sHandlersPoisonHeal);
    return sHandlersPoisonHeal;
}

void HandlerBattleArmor(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
    }
}

static const BattleEventHandlerEntry sHandlersBattleArmor[] = {
    { BATTLE_EVENT_CHECK_CRITICAL, HandlerBattleArmor },
};

const BattleEventHandlerEntry *EventAddBattleArmor(u32 *priority) {
    *priority = NELEMS(sHandlersBattleArmor);
    return sHandlersBattleArmor;
}

void HandlerSuperLuck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 level;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        level = BattleEventVar_GetValue(BATTLE_EVENT_VAR_CRITICAL_STAGE);
        level = (u8)(level + 1);
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_CRITICAL_STAGE, level);
    }
}

static const BattleEventHandlerEntry sHandlersSuperLuck[] = {
    { BATTLE_EVENT_CHECK_CRITICAL, HandlerSuperLuck },
};

const BattleEventHandlerEntry *EventAddSuperLuck(u32 *priority) {
    *priority = NELEMS(sHandlersSuperLuck);
    return sHandlersSuperLuck;
}

void HandlerAngerPoint(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleMon *mon;
    BattleHandlerStatChangeParam *param;
    s32 amount;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_SUBSTITUTE_FLAG) == 0) {
            if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_CRITICAL_FLAG) != 0) {
                mon = GetBattleMon(flow, monId);
                if (BattleMon_GetStatRaiseRoom(mon, 1) > 0) {
                    param = BattleHandler_PushWork(flow, 0xe, monId);
                    param->stat = 1;
                    amount = BattleMon_GetStatRaiseRoom(mon, 1);
                    param->change = amount;
                    param->unk0e = 1;
                    param->count = 1;
                    param->monIds[0] = monId;
                    param->flag = 1;
                    param->popup = 1;
                    BattleHandler_StrSetup(&param->string, 2, 0x1e1);
                    BattleHandler_AddArg(&param->string, monId);
                    BattleHandler_PopWork(flow, param);
                }
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersAngerPoint[] = {
    { BATTLE_EVENT_DAMAGE_REACTION, HandlerAngerPoint },
};

const BattleEventHandlerEntry *EventAddAngerPoint(u32 *priority) {
    *priority = NELEMS(sHandlersAngerPoint);
    return sHandlersAngerPoint;
}

void HandlerPoisonPoint(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleCondition condition;

    condition = BtlCalc_MakeStatusCondition(5);
    CommonContactStatusAbility(flow, monId, 5, condition, 0x1e);
}

// Function name from swan.
static const BattleEventHandlerEntry sHandlersPoisonPoint[] = {
    { BATTLE_EVENT_DAMAGE_REACTION, HandlerPoisonPoint },
};

const BattleEventHandlerEntry *EventAddPoisonPoint(u32 *priority) {
    *priority = NELEMS(sHandlersPoisonPoint);
    return sHandlersPoisonPoint;
}

void HandlerStatic(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleCondition condition;

    condition = BtlCalc_MakeStatusCondition(1);
    CommonContactStatusAbility(flow, monId, 1, condition, 0x1e);
}

// Function name from swan.
static const BattleEventHandlerEntry sHandlersStatic[] = {
    { BATTLE_EVENT_DAMAGE_REACTION, HandlerStatic },
};

const BattleEventHandlerEntry *EventAddStatic(u32 *priority) {
    *priority = NELEMS(sHandlersStatic);
    return sHandlersStatic;
}

void HandlerFlameBody(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleCondition condition;

    condition = BtlCalc_MakeStatusCondition(4);
    CommonContactStatusAbility(flow, monId, 4, condition, 0x1e);
}

// Function name from swan.
static const BattleEventHandlerEntry sHandlersFlameBody[] = {
    { BATTLE_EVENT_DAMAGE_REACTION, HandlerFlameBody },
};

const BattleEventHandlerEntry *EventAddFlameBody(u32 *priority) {
    *priority = NELEMS(sHandlersFlameBody);
    return sHandlersFlameBody;
}

void HandlerCuteCharm(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleMon *mon;
    BattleMon *attacker;
    u8 sex;
    u8 attackerSex;
    BattleCondition condition;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_SUBSTITUTE_FLAG) == 0 && !BtlServerFlow_CheckMatchup(flow)) {
        mon = GetBattleMon(flow, monId);
        attacker = GetBattleMon(flow, (u8)BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER));
        sex = GetBattleMonStat(mon, BATTLEMON_GENDER);
        attackerSex = GetBattleMonStat(attacker, BATTLEMON_GENDER);
        if (sex != 2 && attackerSex != 2 && sex != attackerSex) {
            BtlCalc_MakeDefaultCondition(7, mon, &condition);
            CommonContactStatusAbility(flow, monId, 7, condition, 30);
        }
    }
}

static const BattleEventHandlerEntry sHandlersCuteCharm[] = {
    { BATTLE_EVENT_DAMAGE_REACTION, HandlerCuteCharm },
};

const BattleEventHandlerEntry *EventAddCuteCharm(u32 *priority) {
    *priority = NELEMS(sHandlersCuteCharm);
    return sHandlersCuteCharm;
}

void HandlerEffectSpore(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 rand;
    u32 status;
    BattleCondition condition;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_SUBSTITUTE_FLAG) == 0) {
        rand = BattleRandom(30);
        if (rand > 20) {
            status = 5;
        } else if (rand > 10) {
            status = 1;
        } else {
            status = 2;
        }
        condition = BtlCalc_MakeStatusCondition(status);
        CommonContactStatusAbility(flow, monId, status, condition, 30);
    }
}

static const BattleEventHandlerEntry sHandlersEffectSpore[] = {
    { BATTLE_EVENT_DAMAGE_REACTION, HandlerEffectSpore },
};

const BattleEventHandlerEntry *EventAddEffectSpore(u32 *priority) {
    *priority = NELEMS(sHandlersEffectSpore);
    return sHandlersEffectSpore;
}

void CommonContactStatusAbility(BtlServerFlow *flow, u32 monId, u32 status, BattleCondition condition, u8 chance) {
    BattleHandlerAddConditionParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_SUBSTITUTE_FLAG) == 0) {
        if (getMoveFlag(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE), 0) &&
            AbilityEvent_RollEffectChance(flow, chance)) {
            param = BattleHandler_PushWork(flow, 0xc, monId);
            param->popup = 1;
            param->condition = status;
            param->value = condition;
            param->showFail = 0;
            param->targetIndex = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER);
            BattleHandler_PopWork(flow, param);
        }
    }
}

void HandlerRoughSkin(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 attackerId;
    BattleMon *attacker;
    BattleHandlerDamageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_SUBSTITUTE_FLAG) == 0) {
        if (getMoveFlag(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE), 0)) {
            attackerId = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER);
            attacker = GetBattleMon(flow, attackerId);
            if (!IsFainted(attacker)) {
                param = BattleHandler_PushWork(flow, 7, monId);
                param->popup = 1;
                param->targetIndex = attackerId;
                param->amount = DivideMaxHPZeroCheck(attacker, 8);
                BattleHandler_StrSetup(&param->string, 2, 0x1ae);
                BattleHandler_AddArg(&param->string, attackerId);
                BattleHandler_PopWork(flow, param);
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersRoughSkin[] = {
    { BATTLE_EVENT_DAMAGE_REACTION, HandlerRoughSkin },
};

const BattleEventHandlerEntry *EventAddRoughSkin(u32 *priority) {
    *priority = NELEMS(sHandlersRoughSkin);
    return sHandlersRoughSkin;
}

void HandlerAftermath(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 attackerId;
    BattleMon *attacker;
    BattleHandlerDamageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId && IsFainted(GetBattleMon(flow, monId))) {
        if (getMoveFlag(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE), 0)) {
            attackerId = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER);
            attacker = GetBattleMon(flow, attackerId);
            param = BattleHandler_PushWork(flow, 7, monId);
            param->popup = 1;
            param->targetIndex = attackerId;
            param->amount = DivideMaxHPZeroCheck(attacker, 4);
            param->checkSemi = 1;
            BattleHandler_StrSetup(&param->string, 2, 0x192);
            BattleHandler_AddArg(&param->string, attackerId);
            BattleHandler_PopWork(flow, param);
        }
    }
}

static const BattleEventHandlerEntry sHandlersAftermath[] = {
    { BATTLE_EVENT_DAMAGE_REACTION, HandlerAftermath },
};

const BattleEventHandlerEntry *EventAddAftermath(u32 *priority) {
    *priority = NELEMS(sHandlersAftermath);
    return sHandlersAftermath;
}

void HandlerColorChange(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleMon *mon;
    u8 type;
    BattleHandlerChangeTypeParam *param;

    if (IsEventTargetMon(monId) && !BtlServerFlow_CheckMatchup(flow)) {
        mon = GetBattleMon(flow, monId);
        if (!IsFainted(mon)) {
            type = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_TYPE);
            if (type != 0x11 && !DoesMonHaveType(mon, type)) {
                BattleHandler_PushRun(flow, 2, monId);
                param = BattleHandler_PushWork(flow, 0x14, monId);
                param->type = PokeTypePair_MakeMonotype(type);
                param->monIndex = monId;
                BattleHandler_PopWork(flow, param);
                BattleHandler_PushRun(flow, 3, monId);
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersColorChange[] = {
    { BATTLE_EVENT_DAMAGE_PROCESS_END_HIT_REAL, HandlerColorChange },
};

const BattleEventHandlerEntry *EventAddColorChange(u32 *priority) {
    *priority = NELEMS(sHandlersColorChange);
    return sHandlersColorChange;
}

void HandlerSynchronize(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleConditionCont cont;
    u8 attackerId;
    BattleMon *mon;
    BattleHandlerAddConditionParam *param;
    u32 status;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        status = BattleEventVar_GetValue(BATTLE_EVENT_VAR_CONDITION);
        if (status == 5 || status == 1 || status == 4) {
            attackerId = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER);
            if (attackerId != 0x1f && attackerId != monId) {
                mon = GetBattleMon(flow, monId);
                cont.raw = BattleEventVar_GetValue(BATTLE_EVENT_VAR_CONDITION_PARAM);
                BattleHandler_PushRun(flow, 2, monId);
                param = BattleHandler_PushWork(flow, 0xc, monId);
                param->targetIndex = attackerId;
                param->condition = status;
                if (status == 5 && Condition_IsBadlyPoisoned(cont)) {
                    param->value = cont;
                } else {
                    BtlCalc_MakeDefaultCondition(status, mon, &param->value);
                }
                param->showFail = 1;
                BattleHandler_PopWork(flow, param);
                BattleHandler_PushRun(flow, 3, monId);
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersSynchronize[] = {
    { BATTLE_EVENT_CONDITION_CONFIRMED, HandlerSynchronize },
};

const BattleEventHandlerEntry *EventAddSynchronize(u32 *priority) {
    *priority = NELEMS(sHandlersSynchronize);
    return sHandlersSynchronize;
}

void HandlerRockHead(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
    }
}

static const BattleEventHandlerEntry sHandlersRockHead[] = {
    { BATTLE_EVENT_CALC_RECOIL, HandlerRockHead },
};

const BattleEventHandlerEntry *EventAddRockHead(u32 *priority) {
    *priority = NELEMS(sHandlersRockHead);
    return sHandlersRockHead;
}

void HandlerNormalize(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_MOVE_TYPE, 0);
    }
}

static const BattleEventHandlerEntry sHandlersNormalize[] = {
    { BATTLE_EVENT_GET_MOVE_PARAM, HandlerNormalize },
};

const BattleEventHandlerEntry *EventAddNormalize(u32 *priority) {
    *priority = NELEMS(sHandlersNormalize);
    return sHandlersNormalize;
}

static const BattleEventHandlerEntry sHandlersTrace[] = {
    { BATTLE_EVENT_MEMBER_IN, HandlerTrace },
};

const BattleEventHandlerEntry *EventAddTrace(u32 *priority) {
    *priority = NELEMS(sHandlersTrace);
    return sHandlersTrace;
}

void HandlerTrace(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 enteringId;
    u32 targetId;
    u32 ability;
    u8 pos;
    u8 myPos;
    u32 count;
    u8 numCandidates;
    u8 i;
    BattleMon *mon;
    u8 mons[5];
    u8 candidates[3];

    enteringId = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON);
    targetId = 0x1f;
    ability = 0;
    if (enteringId == monId) {
        myPos = BtlServerFlow_GetMonBattlePos(flow, monId);
        count = HandlerGetAlivePartyCount(flow, myPos | 0x100, mons);
        numCandidates = 0;
        for (i = 0; i < count; i++) {
            if (!IsTraceExcludedAbility(GetBattleMonStat(GetBattleMon(flow, mons[i]), BATTLEMON_ABILITY))) {
                candidates[numCandidates++] = mons[i];
            }
        }
        if (numCandidates != 0) {
            i = (numCandidates == 1) ? 0 : BattleRandom(numCandidates);
            mon = GetBattleMon(flow, candidates[i]);
            ability = GetBattleMonStat(mon, BATTLEMON_ABILITY);
            targetId = GetMonID(mon);
        } else {
            work[0] = 1;
        }
    } else if (!IsAllyMonID(enteringId, monId) && work[0] == 1) {
        pos = BtlServerFlow_MonIDToPos(flow, enteringId);
        myPos = BtlServerFlow_GetMonBattlePos(flow, monId);
        if (pos != 6 && (BtlServerFlow_GetBattleStyle(flow) != 2 || IsAdjacentOpponent(myPos, pos))) {
            count = GetBattleMonStat(GetBattleMon(flow, enteringId), BATTLEMON_ABILITY);
            if (!IsTraceExcludedAbility(count)) {
                ability = count;
                targetId = enteringId;
            }
        }
    }
    if (ability != 0 && monId != 0x1f) {
        BattleHandlerAbilityChangeParam *param;

        param = BattleHandler_PushWork(flow, 0x1f, monId);
        param->targetIndex = monId;
        param->ability = ability;
        param->unk08 = 1;
        param->popup = 1;
        BattleHandler_StrSetup(&param->string, 2, 0x17d);
        BattleHandler_AddArg(&param->string, targetId);
        BattleHandler_AddArg(&param->string, param->ability);
        BattleHandler_PopWork(flow, param);
    }
}

void HandlerNaturalCure(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerCureConditionParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        param = BattleHandler_PushWork(flow, 0xb, monId);
        param->condition = CONDITION_ANY_STATUS;
        param->count = 1;
        param->monIds[0] = monId;
        param->useString = 1;
        BattleHandler_PopWork(flow, param);
    }
}

static const BattleEventHandlerEntry sHandlersNaturalCure[] = {
    { BATTLE_EVENT_SWITCH_OUT, HandlerNaturalCure },
};

const BattleEventHandlerEntry *EventAddNaturalCure(u32 *priority) {
    *priority = NELEMS(sHandlersNaturalCure);
    return sHandlersNaturalCure;
}

void HandlerDownload(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 count;
    u16 defense;
    u16 spDefense;
    u8 i;
    BattleMon *mon;
    u32 stat;
    BattleHandlerStatChangeParam *param;
    u8 mons[4];

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        count = BtlServerFlow_GetOpposingMonIDs(flow, monId, mons);
        if (count != 0) {
            defense = 0;
            spDefense = 0;
            for (i = 0; i < count; i++) {
                mon = GetBattleMon(flow, mons[i]);
                defense += (u16)GetBattleMonStat(mon, BATTLEMON_DEFENSE);
                spDefense += (u16)GetBattleMonStat(mon, BATTLEMON_SP_DEFENSE);
            }
            if (defense >= spDefense) {
                stat = 3;
            } else {
                stat = 1;
            }
            param = BattleHandler_PushWork(flow, 0xe, monId);
            param->popup = 1;
            param->count = 1;
            param->monIds[0] = monId;
            param->stat = stat;
            param->change = 1;
            BattleHandler_PopWork(flow, param);
        }
    }
}

static const BattleEventHandlerEntry sHandlersDownload[] = {
    { BATTLE_EVENT_MEMBER_IN, HandlerDownload },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerDownload },
};

const BattleEventHandlerEntry *EventAddDownload(u32 *priority) {
    *priority = NELEMS(sHandlersDownload);
    return sHandlersDownload;
}

void HandlerForewarn(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleMon *mon;
    ForewarnEntry *entries;
    u8 count;
    u8 moveCount;
    u8 i;
    u8 j;
    u16 move;
    u8 numEntries;
    u32 best;
    u32 power;
    BattleHandlerMessageParam *param;
    u8 mons[4];

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        count = BtlServerFlow_GetOpposingMonIDs(flow, monId, mons);
        best = 0;
        numEntries = 0;
        entries = (ForewarnEntry *)BtlServerFlow_GetHandlerWork(flow, 0xc);
        for (i = 0; i < count; i++) {
            mon = GetBattleMon(flow, mons[i]);
            moveCount = GetBattleMonMoveCount(mon);
            for (j = 0; j < moveCount; j++) {
                move = MoveGetID(mon, j);
                if (PML_MoveGetCategory(move) != 0) {
                    power = (u8)PML_MoveGetBasePower(move);
                    if (power == 1) {
                        if (PML_MoveGetQuality(move) == 9) {
                            power = 150;
                        } else if (move == 0x44 || move == 0xf3 || move == 0x170) {
                            power = 120;
                        } else {
                            power = 80;
                        }
                    }
                } else {
                    power = 1;
                }
                if (power >= best) {
                    if (power > best) {
                        best = power;
                        numEntries = 0;
                    }
                    entries[numEntries].monId = GetMonID(mon);
                    entries[numEntries].move = move;
                    numEntries++;
                }
            }
        }
        if (numEntries != 0) {
            i = BattleRandom(numEntries);
            BattleHandler_PushRun(flow, 2, monId);
            param = BattleHandler_PushWork(flow, 4, monId);
            BattleHandler_StrSetup(&param->string, 2, 0x1b1);
            BattleHandler_AddArg(&param->string, entries[i].monId);
            BattleHandler_AddArg(&param->string, entries[i].move);
            BattleHandler_PopWork(flow, param);
            BattleHandler_PushRun(flow, 3, monId);
        }
    }
}

static const BattleEventHandlerEntry sHandlersForewarn[] = {
    { BATTLE_EVENT_MEMBER_IN, HandlerForewarn },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerForewarn },
};

const BattleEventHandlerEntry *EventAddForewarn(u32 *priority) {
    *priority = NELEMS(sHandlersForewarn);
    return sHandlersForewarn;
}

void HandlerAnticipation(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 count;
    BattleMon *mon;
    u8 i;
    BattleHandlerMessageParam *param;
    u8 mons[4];

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        count = BtlServerFlow_GetOpposingMonIDs(flow, monId, mons);
        mon = GetBattleMon(flow, monId);
        for (i = 0; i < count; i++) {
            if (CheckAnticipationMon(mon, GetBattleMon(flow, mons[i]))) {
                break;
            }
        }
        if (i != count) {
            BattleHandler_PushRun(flow, 2, monId);
            param = BattleHandler_PushWork(flow, 4, monId);
            BattleHandler_StrSetup(&param->string, 2, 0x1b4);
            BattleHandler_AddArg(&param->string, monId);
            BattleHandler_PopWork(flow, param);
            BattleHandler_PushRun(flow, 3, monId);
        }
    }
}

BOOL CheckAnticipationMon(BattleMon *mon, BattleMon *opponent) {
    PokeTypePair types;
    u32 moveCount;
    u8 i;
    u16 move;

    types = GetPokeType(mon);
    moveCount = GetBattleMonMoveCount(opponent);
    for (i = 0; i < moveCount; i++) {
        move = MoveGetID(opponent, i);
        if (PML_MoveGetQuality(move) == 9) {
            return TRUE;
        }
        if (PML_MoveIsDamaging(move) && BtlCalc_GetTypePairEffectiveness(PML_MoveGetType(move), types) > 3) {
            return TRUE;
        }
    }
    return FALSE;
}

static const BattleEventHandlerEntry sHandlersAnticipation[] = {
    { BATTLE_EVENT_MEMBER_IN, HandlerAnticipation },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerAnticipation },
};

const BattleEventHandlerEntry *EventAddAnticipation(u32 *priority) {
    *priority = NELEMS(sHandlersAnticipation);
    return sHandlersAnticipation;
}

void HandlerFrisk(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 count;
    u8 numItems;
    u8 i;
    BattleMon *mon;
    BattleHandlerMessageParam *param;
    u16 items[4];
    u8 mons[4];

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        count = BtlServerFlow_GetOpposingMonIDs(flow, monId, mons);
        numItems = 0;
        for (i = 0; i < count; i++) {
            mon = GetBattleMon(flow, mons[i]);
            items[numItems] = GetBattleMonHeldItem(mon);
            if (items[numItems] != 0) {
                numItems++;
            }
        }
        if (numItems != 0) {
            i = BattleRandom(numItems);
            BattleHandler_PushRun(flow, 2, monId);
            param = BattleHandler_PushWork(flow, 4, monId);
            BattleHandler_StrSetup(&param->string, 2, 0x1b7);
            BattleHandler_AddArg(&param->string, monId);
            BattleHandler_AddArg(&param->string, items[i]);
            BattleHandler_PopWork(flow, param);
            BattleHandler_PushRun(flow, 3, monId);
        }
    }
}

static const BattleEventHandlerEntry sHandlersFrisk[] = {
    { BATTLE_EVENT_MEMBER_IN, HandlerFrisk },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerFrisk },
};

const BattleEventHandlerEntry *EventAddFrisk(u32 *priority) {
    *priority = NELEMS(sHandlersFrisk);
    return sHandlersFrisk;
}

static const BattleEventHandlerEntry sHandlersSturdy[] = {
    { BATTLE_EVENT_CHECK_OHKO_HIT, HandlerSturdyOneshotCheck },
    { BATTLE_EVENT_CHECK_ENDURE, HandlerSturdyEndureCheck },
    { BATTLE_EVENT_ENDURE_USED, HandlerSturdySurvive },
};

const BattleEventHandlerEntry *EventAddSturdy(u32 *priority) {
    *priority = NELEMS(sHandlersSturdy);
    return sHandlersSturdy;
}

void HandlerSturdyOneshotCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerMessageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        if (BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1)) {
            BattleHandler_PushRun(flow, 2, monId);
            param = BattleHandler_PushWork(flow, 4, monId);
            BattleHandler_StrSetup(&param->string, 2, 0xd2);
            BattleHandler_AddArg(&param->string, monId);
            BattleHandler_PopWork(flow, param);
            BattleHandler_PushRun(flow, 3, monId);
        }
    }
}

void HandlerSturdyEndureCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        if (IsMonFullHP(GetBattleMon(flow, monId))) {
            *work = BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_ENDURE_CAUSE, 4);
        } else {
            *work = 0;
        }
    }
}

void HandlerSturdySurvive(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerMessageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (*work) {
            BattleHandler_PushRun(flow, 2, monId);
            param = BattleHandler_PushWork(flow, 4, monId);
            BattleHandler_StrSetup(&param->string, 2, 0x202);
            BattleHandler_AddArg(&param->string, monId);
            BattleHandler_PopWork(flow, param);
            BattleHandler_PushRun(flow, 3, monId);
            *work = 0;
        }
    }
}

void HandlerUnawareHitRank(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_EVASION_STAGE, 6);
    } else if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_ACCURACY_STAGE, 6);
    }
}

void HandlerUnawareAttackRank(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_GENERAL_FLAG, 1);
    }
}

void HandlerUnawareDefenseRank(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_GENERAL_FLAG, 1);
    }
}

static const BattleEventHandlerEntry sHandlersUnaware[] = {
    { BATTLE_EVENT_CHECK_HIT, HandlerUnawareHitRank },
    { BATTLE_EVENT_BEFORE_ATTACK_STAT, HandlerUnawareAttackRank },
    { BATTLE_EVENT_BEFORE_DEFENSE_STAT, HandlerUnawareDefenseRank },
};

const BattleEventHandlerEntry *EventAddUnaware(u32 *priority) {
    *priority = NELEMS(sHandlersUnaware);
    return sHandlersUnaware;
}

void HandlerHeatproofPower(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_TYPE) == 9) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_POWER_RATIO, FX32_CONST(0.5));
        }
    }
}

void HandlerHeatproofStatus(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    s32 damage;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_CONDITION) == 4) {
            damage = BattleEventVar_GetValue(BATTLE_EVENT_VAR_DAMAGE);
            damage = BtlCalc_AtLeast(damage / 2, 1);
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_DAMAGE, damage);
        }
    }
}

static const BattleEventHandlerEntry sHandlersHeatproof[] = {
    { BATTLE_EVENT_MOVE_POWER_RATIO, HandlerHeatproofPower },
    { BATTLE_EVENT_CONDITION_DAMAGE, HandlerHeatproofStatus },
};

const BattleEventHandlerEntry *EventAddHeatproof(u32 *priority) {
    *priority = NELEMS(sHandlersHeatproof);
    return sHandlersHeatproof;
}

BOOL CommonDamageRecoverCheck(BtlServerFlow *flow, u32 monId, u32 type) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) != monId) {
            if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_TYPE) == type) {
                return BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_NO_EFFECT, 1);
            }
        }
    }
    return FALSE;
}

void CommonTypeRecoverHP(BtlServerFlow *flow, u8 monId, u32 divisor) {
    BattleMon *mon;
    BattleHandlerRecoverHPParam *work;
    BattleHandlerMessageParam *message;

    mon = GetBattleMon(flow, monId);
    if (!IsMonFullHP(mon)) {
        work = BattleHandler_PushWork(flow, 5, monId);
        work->targetIndex = monId;
        work->amount = DivideMaxHPZeroCheck(mon, divisor);
        work->popup = 1;
        BattleHandler_StrSetup(&work->string, 2, 0x183);
        BattleHandler_AddArg(&work->string, monId);
        BattleHandler_PopWork(flow, work);
    } else {
        message = BattleHandler_PushWork(flow, 4, monId);
        BattleHandler_StrSetup(&message->string, 2, 0xd2);
        BattleHandler_AddArg(&message->string, monId);
        message->popup = 1;
        BattleHandler_PopWork(flow, message);
    }
    BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_GENERAL_FLAG, 1);
}

void CommonTypeNoEffectRankUp(BtlServerFlow *flow, u8 monId, u32 stat, u32 amount) {
    BattleMon *mon;
    BattleHandlerStatChangeParam *work;
    BattleHandlerMessageParam *message;

    mon = GetBattleMon(flow, monId);
    if (IsStatChangeValid(mon, stat, amount)) {
        work = BattleHandler_PushWork(flow, 0xe, monId);
        work->count = 1;
        work->monIds[0] = monId;
        work->unk0e = 1;
        work->stat = stat;
        work->change = amount;
        work->popup = 1;
        BattleHandler_PopWork(flow, work);
    } else {
        message = BattleHandler_PushWork(flow, 4, monId);
        BattleHandler_StrSetup(&message->string, 2, 0xd2);
        BattleHandler_AddArg(&message->string, monId);
        message->popup = 1;
        BattleHandler_PopWork(flow, message);
    }
}

void HandlerDrySkinWeather(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleMon *mon;
    BattleHandlerDamageParam *damage;
    BattleHandlerRecoverHPParam *recover;
    u8 weather;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        mon = GetBattleMon(flow, monId);
        weather = BattleEventVar_GetValue(BATTLE_EVENT_VAR_WEATHER);
        if (weather == 1) {
            BattleHandler_PushRun(flow, 2, monId);
            damage = BattleHandler_PushWork(flow, 7, monId);
            damage->targetIndex = monId;
            damage->amount = DivideMaxHPZeroCheck(mon, 8);
            BattleHandler_PopWork(flow, damage);
            BattleHandler_PushRun(flow, 3, monId);
        } else if (weather == 2) {
            recover = BattleHandler_PushWork(flow, 5, monId);
            recover->popup = 1;
            recover->targetIndex = monId;
            recover->amount = DivideMaxHPZeroCheck(mon, 8);
            BattleHandler_PopWork(flow, recover);
        }
    }
}

void HandlerDrySkinDamageRecover(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_TYPE) == 9) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_POWER_RATIO, FX32_CONST(1.25));
        }
    }
}

void HandlerDrySkinCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (CommonDamageRecoverCheck(flow, monId, 10)) {
        CommonTypeRecoverHP(flow, monId, 4);
    }
}

static const BattleEventHandlerEntry sHandlersDrySkin[] = {
    { BATTLE_EVENT_CHECK_WEATHER_DAMAGE, HandlerDrySkinWeather },
    { BATTLE_EVENT_MOVE_POWER_RATIO, HandlerDrySkinDamageRecover },
    { BATTLE_EVENT_CHECK_NO_EFFECT_AFTER_PROTECT, HandlerDrySkinCheck },
};

const BattleEventHandlerEntry *EventAddDrySkin(u32 *priority) {
    *priority = NELEMS(sHandlersDrySkin);
    return sHandlersDrySkin;
}

void HandlerWaterAbsorbCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (CommonDamageRecoverCheck(flow, monId, 10)) {
        CommonTypeRecoverHP(flow, monId, 4);
    }
}

static const BattleEventHandlerEntry sHandlersWaterAbsorb[] = {
    { BATTLE_EVENT_CHECK_NO_EFFECT_AFTER_PROTECT, HandlerWaterAbsorbCheck },
};

const BattleEventHandlerEntry *EventAddWaterAbsorb(u32 *priority) {
    *priority = NELEMS(sHandlersWaterAbsorb);
    return sHandlersWaterAbsorb;
}

void HandlerVoltAbsorbCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (CommonDamageRecoverCheck(flow, monId, 12)) {
        CommonTypeRecoverHP(flow, monId, 4);
    }
}

static const BattleEventHandlerEntry sHandlersVoltAbsorb[] = {
    { BATTLE_EVENT_CHECK_NO_EFFECT_AFTER_PROTECT, HandlerVoltAbsorbCheck },
};

const BattleEventHandlerEntry *EventAddVoltAbsorb(u32 *priority) {
    *priority = NELEMS(sHandlersVoltAbsorb);
    return sHandlersVoltAbsorb;
}

static const BattleEventHandlerEntry sHandlersMotorDrive[] = {
    { BATTLE_EVENT_CHECK_NO_EFFECT_AFTER_PROTECT, HandlerMotorDriveCheck },
};

const BattleEventHandlerEntry *EventAddMotorDrive(u32 *priority) {
    *priority = NELEMS(sHandlersMotorDrive);
    return sHandlersMotorDrive;
}

void HandlerMotorDriveCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (CommonDamageRecoverCheck(flow, monId, 12)) {
        CommonTypeNoEffectRankUp(flow, monId, 5, 1);
    }
}

void HandlerScrappy(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER_TYPE) == 7) {
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_IGNORE_FLAG, 1);
        }
    }
}

static const BattleEventHandlerEntry sHandlersScrappy[] = {
    { BATTLE_EVENT_CHECK_TYPE_EFFECTIVENESS, HandlerScrappy },
};

const BattleEventHandlerEntry *EventAddScrappy(u32 *priority) {
    *priority = NELEMS(sHandlersScrappy);
    return sHandlersScrappy;
}

void HandlerSoundproof(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerMessageParam *param;
    u16 move;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        move = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE);
        if (getMoveFlag(move, 8)) {
            if (BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_NO_EFFECT, 1)) {
                BattleHandler_PushRun(flow, 2, monId);
                param = BattleHandler_PushWork(flow, 4, monId);
                BattleHandler_StrSetup(&param->string, 2, 0xd2);
                BattleHandler_AddArg(&param->string, monId);
                BattleHandler_PopWork(flow, param);
                BattleHandler_PushRun(flow, 3, monId);
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersSoundproof[] = {
    { BATTLE_EVENT_CHECK_NO_EFFECT_AFTER_PROTECT, HandlerSoundproof },
};

const BattleEventHandlerEntry *EventAddSoundproof(u32 *priority) {
    *priority = NELEMS(sHandlersSoundproof);
    return sHandlersSoundproof;
}

void HandlerLevitate(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_GENERAL_FLAG) == 0) {
            *work = BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_GENERAL_FLAG, 1);
        }
    }
}

void HandlerLevitateAddImmunity(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerMessageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (*work) {
            param = BattleHandler_PushWork(flow, 4, monId);
            param->popup = 1;
            BattleHandler_StrSetup(&param->string, 2, 0xd2);
            BattleHandler_AddArg(&param->string, monId);
            BattleHandler_PopWork(flow, param);
            *work = 0;
        }
    }
}

void HandlerLevitateTurnCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        *work = 0;
    }
}

static const BattleEventHandlerEntry sHandlersLevitate[] = {
    { BATTLE_EVENT_CHECK_FLOATING, HandlerLevitate },
    { BATTLE_EVENT_FLOATING_IMMUNE, HandlerLevitateAddImmunity },
    { BATTLE_EVENT_TURN_CHECK_EARLY, HandlerLevitateTurnCheck },
};

const BattleEventHandlerEntry *EventAddLevitate(u32 *priority) {
    *priority = NELEMS(sHandlersLevitate);
    return sHandlersLevitate;
}

void HandlerWonderGuard(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerMessageParam *param;
    u16 move;
    u32 run;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        run = 3;
        if (BattleEventVar_GetValue(run) != monId) {
            GetBattleMon(flow, monId);
            move = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE);
            if (PML_MoveIsDamaging(move)) {
                if (move != 0xa5) {
                    if ((s32)BattleEventVar_GetValue(BATTLE_EVENT_VAR_TYPE_EFFECTIVENESS) <= 3) {
                        if (BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_NO_EFFECT, 1)) {
                            BattleHandler_PushRun(flow, 2, monId);
                            param = BattleHandler_PushWork(flow, 4, monId);
                            BattleHandler_StrSetup(&param->string, 2, 0xd2);
                            BattleHandler_AddArg(&param->string, monId);
                            BattleHandler_PopWork(flow, param);
                            BattleHandler_PushRun(flow, run, monId);
                        }
                    }
                }
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersWonderGuard[] = {
    { BATTLE_EVENT_CHECK_NO_EFFECT_AFTER_PROTECT, HandlerWonderGuard },
};

const BattleEventHandlerEntry *EventAddWonderGuard(u32 *priority) {
    *priority = NELEMS(sHandlersWonderGuard);
    return sHandlersWonderGuard;
}

void HandlerTruant(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (work[0] != 0) {
            work[1] = BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_CAUSE, 0x13);
            work[0] = 0;
        } else {
            work[0] = 1;
        }
    }
}

void HandlerTruantGet(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (GetTurnFlag(GetBattleMon(flow, monId), 0)) {
            *work = 1;
        }
    }
}

void HandlerTruantFailed(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerMessageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (work[1] != 0) {
            param = BattleHandler_PushWork(flow, 4, monId);
            param->popup = 1;
            BattleHandler_StrSetup(&param->string, 2, 0x1bd);
            BattleHandler_AddArg(&param->string, monId);
            BattleHandler_PopWork(flow, param);
            work[1] = 0;
        }
    }
}

void HandlerTruantEndAction(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ACTION) == 7) {
            *work = 0;
        }
    }
}

static const BattleEventHandlerEntry sHandlersTruant[] = {
    { BATTLE_EVENT_CHECK_MOVE_FAIL, HandlerTruant },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerTruantGet },
    { BATTLE_EVENT_MOVE_EXECUTE_FAIL, HandlerTruantFailed },
    { BATTLE_EVENT_ACTION_END, HandlerTruantEndAction },
};

const BattleEventHandlerEntry *EventAddTruant(u32 *priority) {
    *priority = NELEMS(sHandlersTruant);
    return sHandlersTruant;
}

void HandlerDamp(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u16 move;
    u32 key;

    move = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE);
    work[0] = 0;
    if (move == 0x99 || move == 0x78) {
        key = 0x22;
        if (BattleEventVar_GetValue(key) == 0) {
            work[0] = BattleEventVar_RewriteValue(key, 0x13);
            work[1] = move;
        }
    }
}

void HandlerDampEffective(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 target;
    BattleHandlerMessageParam *param;

    if (work[0]) {
        target = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON);
        param = BattleHandler_PushWork(flow, 4, monId);
        param->popup = 1;
        BattleHandler_StrSetup(&param->string, 2, 0x389);
        BattleHandler_AddArg(&param->string, target);
        BattleHandler_AddArg(&param->string, work[1]);
        BattleHandler_PopWork(flow, param);
        work[0] = 0;
    }
}

void HandlerDampStart(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleEventItem_AttachSkipCheckHandler(item, HandlerDampSkipCheck);
}

void HandlerDampMoveEnd(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleEventItem_DetachSkipCheckHandler(item);
}

void HandlerDampEnd(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        BattleEventItem_DetachSkipCheckHandler(item);
    }
}

BOOL HandlerDampSkipCheck(BattleEventItem *item, BtlServerFlow *flow, u32 factorType, u32 event, u16 subId, u8 monId) {
    if (factorType == BATTLE_EVENT_FACTOR_ABILITY) {
        if (subId == 0x6a) {
            return TRUE;
        }
    }
    return FALSE;
}

static const BattleEventHandlerEntry sHandlersDamp[] = {
    { BATTLE_EVENT_CHECK_MOVE_FAIL_LATE, HandlerDamp },     { BATTLE_EVENT_MOVE_EXECUTE_FAIL, HandlerDampEffective },
    { BATTLE_EVENT_MOVE_SEQUENCE_START, HandlerDampStart }, { BATTLE_EVENT_MOVE_SEQUENCE_END, HandlerDampMoveEnd },
    { BATTLE_EVENT_GASTRO_ACID_CONFIRMED, HandlerDampEnd },
};

const BattleEventHandlerEntry *EventAddDamp(u32 *priority) {
    *priority = NELEMS(sHandlersDamp);
    return sHandlersDamp;
}

void HandlerFlashFirePower(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        if (GetAdditionalConditionFlag(GetBattleMon(flow, monId), 0xd)) {
            if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_TYPE) == 9) {
                BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, FX32_CONST(1.5));
            }
        }
    }
}

void HandlerFlashFireRemove(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerFlagParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (GetAdditionalConditionFlag(GetBattleMon(flow, monId), 0xd)) {
            param = BattleHandler_PushWork(flow, 0x18, monId);
            param->monIndex = monId;
            param->flag = 0xd;
            BattleHandler_PopWork(flow, param);
        }
    }
}

void HandlerFlashFireCheckNoEffect(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerMessageParam *message;
    BattleHandlerFlagParam *param;

    if (CommonDamageRecoverCheck(flow, monId, 9)) {
        BattleHandler_PushRun(flow, 2, monId);
        if (!GetAdditionalConditionFlag(GetBattleMon(flow, monId), 0xd)) {
            message = BattleHandler_PushWork(flow, 4, monId);
            BattleHandler_StrSetup(&message->string, 2, 0x1ab);
            BattleHandler_AddArg(&message->string, monId);
            BattleHandler_PopWork(flow, message);
            param = BattleHandler_PushWork(flow, 0x17, monId);
            param->monIndex = monId;
            param->flag = 0xd;
            BattleHandler_PopWork(flow, param);
        } else {
            message = BattleHandler_PushWork(flow, 4, monId);
            BattleHandler_StrSetup(&message->string, 2, 0xd2);
            BattleHandler_AddArg(&message->string, monId);
            BattleHandler_PopWork(flow, message);
        }
        BattleHandler_PushRun(flow, 3, monId);
    }
}

static const BattleEventHandlerEntry sHandlersFlashFire[] = {
    { BATTLE_EVENT_CHECK_NO_EFFECT_AFTER_PROTECT, HandlerFlashFireCheckNoEffect },
    { BATTLE_EVENT_ATTACK_STAT, HandlerFlashFirePower },
    { BATTLE_EVENT_CHANGE_ABILITY_BEFORE, HandlerFlashFireRemove },
};

const BattleEventHandlerEntry *EventAddFlashFire(u32 *priority) {
    *priority = NELEMS(sHandlersFlashFire);
    return sHandlersFlashFire;
}

void HandlerBadDreams(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleMon *mon;
    u8 count;
    u8 i;
    BOOL popup;
    u8 mons[4];
    BattleHandlerDamageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        popup = FALSE;
        count = HandlerGetAlivePartyCount(flow, BtlServerFlow_GetMonBattlePos(flow, monId) | 0x100, mons);
        for (i = 0; i < count; i++) {
            mon = GetBattleMon(flow, mons[i]);
            if (CheckCondition(mon, CONDITION_SLEEP)) {
                if (!popup) {
                    popup = TRUE;
                    BattleHandler_PushRun(flow, 2, monId);
                }
                param = BattleHandler_PushWork(flow, 7, monId);
                param->targetIndex = mons[i];
                param->amount = DivideMaxHPZeroCheck(mon, 8);
                BattleHandler_StrSetup(&param->string, 2, 0x1e4);
                BattleHandler_AddArg(&param->string, mons[i]);
                BattleHandler_PopWork(flow, param);
            }
        }
        if (popup) {
            BattleHandler_PushRun(flow, 3, monId);
        }
    }
}

static const BattleEventHandlerEntry sHandlersBadDreams[] = {
    { BATTLE_EVENT_TURN_CHECK, HandlerBadDreams },
};

const BattleEventHandlerEntry *EventAddBadDreams(u32 *priority) {
    *priority = NELEMS(sHandlersBadDreams);
    return sHandlersBadDreams;
}

void HandlerRunAway(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonRunCalcSkip(item, flow, monId, work);
}

void HandlerRunAwayMessage(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerMessageParam *param;

    if (CommonCheckRunMessage(item, flow, monId)) {
        param = BattleHandler_PushWork(flow, 4, monId);
        param->popup = 1;
        BattleHandler_StrSetup(&param->string, 1, 0x48);
        BattleHandler_AddSoundEffect(&param->string, 0x56a);
        BattleHandler_PopWork(flow, param);
    }
}

static const BattleEventHandlerEntry sHandlersRunAway[] = {
    { BATTLE_EVENT_CHECK_SURE_ESCAPE, HandlerRunAway },
    { BATTLE_EVENT_ESCAPE_MESSAGE, HandlerRunAwayMessage },
};

const BattleEventHandlerEntry *EventAddRunAway(u32 *priority) {
    *priority = NELEMS(sHandlersRunAway);
    return sHandlersRunAway;
}

void HandlerMoldBreakerMemberIn(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u16 message;
    BattleHandlerMessageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        switch (BattleEventItem_GetSubID(item)) {
        case 0xa3:
            message = 0x1f9;
            break;
        case 0xa4:
            message = 0x1f6;
            break;
        default:
            message = 0x1ba;
            break;
        }
        BattleHandler_PushRun(flow, 2, monId);
        param = BattleHandler_PushWork(flow, 4, monId);
        BattleHandler_StrSetup(&param->string, 2, message);
        BattleHandler_AddArg(&param->string, monId);
        BattleHandler_PopWork(flow, param);
        BattleHandler_PushRun(flow, 3, monId);
    }
}

BOOL HandlerMoldBreakerSkipCheck(BattleEventItem *item, BtlServerFlow *flow, u32 factorType, u32 event, u16 subId,
                                 u8 monId) {
    if (factorType == BATTLE_EVENT_FACTOR_ABILITY && IsMoldBreakerIgnoredAbility(subId)) {
        return TRUE;
    }
    return FALSE;
}

void HandlerMoldBreakerStart(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        if (*work == 0) {
            BattleEventItem_AttachSkipCheckHandler(item, HandlerMoldBreakerSkipCheck);
            *work = 1;
        }
    }
}

void HandlerMoldBreakerEnd(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (*work == 1) {
            BattleEventItem_DetachSkipCheckHandler(item);
            *work = 0;
        }
    }
}

void HandlerMoldBreakerConfirm(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        if (*work == 1) {
            BattleEventItem_DetachSkipCheckHandler(item);
            *work = 0;
        }
    }
}

static const BattleEventHandlerEntry sHandlersMoldBreaker[] = {
    { BATTLE_EVENT_MEMBER_IN, HandlerMoldBreakerMemberIn },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerMoldBreakerMemberIn },
    { BATTLE_EVENT_MOVE_SEQUENCE_START, HandlerMoldBreakerStart },
    { BATTLE_EVENT_MOVE_SEQUENCE_END, HandlerMoldBreakerEnd },
    { BATTLE_EVENT_GASTRO_ACID_CONFIRMED, HandlerMoldBreakerConfirm },
};

const BattleEventHandlerEntry *EventAddMoldBreaker(u32 *priority) {
    *priority = NELEMS(sHandlersMoldBreaker);
    return sHandlersMoldBreaker;
}

void HandlerForecastMemberOnField(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 weather;

    weather = GetWeather(flow);
    CommonForecastFormChange(flow, monId, weather);
    *work = 1;
}

void HandlerForecastGetAbility(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        HandlerForecastMemberOnField(item, flow, monId, work);
    }
}

void HandlerForecastWeather(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 weather;

    if (*work) {
        weather = GetWeather(flow);
        CommonForecastFormChange(flow, monId, weather);
    }
}

void HandlerForecastAirLock(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (*work) {
        CommonForecastOff(item, flow, monId);
    }
}

void HandlerForecastChangeAbility(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 subId;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        subId = BattleEventVar_GetValue(BATTLE_EVENT_VAR_NEXT_ABILITY);
        if (subId != BattleEventItem_GetSubID(item)) {
            CommonForecastOff(item, flow, monId);
        }
    }
}

void HandlerForecastAbilityOff(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        CommonForecastOff(item, flow, monId);
    }
}

void CommonForecastOff(BattleEventItem *item, BtlServerFlow *flow, u8 monId) {
    BattleMon *mon;
    BattleHandlerChangeFormParam *work;

    mon = GetBattleMon(flow, monId);
    if (GetBattleMonSpecies(mon) == 0x15f) {
        if (GetBattleMonStat(mon, BATTLEMON_FORM) != 0) {
            work = BattleHandler_PushWork(flow, 0x39, monId);
            work->monIndex = monId;
            work->form = 0;
            BattleHandler_StrSetup(&work->string, 2, 0xde);
            BattleHandler_AddArg(&work->string, monId);
            BattleHandler_PopWork(flow, work);
        }
    }
}

void CommonForecastFormChange(BtlServerFlow *flow, u8 monId, u32 weather) {
    BattleMon *mon;
    BattleHandlerChangeFormParam *work;
    u8 currentForm;
    u32 newForm;

    mon = GetBattleMon(flow, monId);
    if (GetBattleMonSpecies(mon) == 0x15f) {
        currentForm = GetBattleMonStat(mon, BATTLEMON_FORM);
        switch (weather) {
        case 0:
            newForm = 0;
            break;
        case 1:
            newForm = 1;
            break;
        case 2:
            newForm = 2;
            break;
        case 3:
            newForm = 3;
            break;
        default:
            newForm = 0;
            break;
        }
        if (newForm != currentForm) {
            work = BattleHandler_PushWork(flow, 0x39, monId);
            work->popup = 1;
            work->monIndex = monId;
            work->form = newForm;
            BattleHandler_StrSetup(&work->string, 2, 0xde);
            BattleHandler_AddArg(&work->string, monId);
            BattleHandler_PopWork(flow, work);
        }
    }
}

static const BattleEventHandlerEntry sHandlersForecast[] = {
    { BATTLE_EVENT_MEMBER_IN_COMPLETE, HandlerForecastMemberOnField },
    { BATTLE_EVENT_ROTATION_IN, HandlerForecastMemberOnField },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerForecastGetAbility },
    { BATTLE_EVENT_CHANGE_ABILITY_BEFORE, HandlerForecastChangeAbility },
    { BATTLE_EVENT_GASTRO_ACID_CONFIRMED, HandlerForecastAbilityOff },
    { BATTLE_EVENT_NOTIFY_AIR_LOCK, HandlerForecastAirLock },
    { BATTLE_EVENT_ACTION_END, HandlerForecastWeather },
    { BATTLE_EVENT_TURN_CHECK_LATE, HandlerForecastWeather },
    { BATTLE_EVENT_AFTER_WEATHER_CHANGE, HandlerForecastWeather },
};

const BattleEventHandlerEntry *EventAddForecast(u32 *priority) {
    *priority = NELEMS(sHandlersForecast);
    return sHandlersForecast;
}

static const BattleEventHandlerEntry sHandlersStormDrain[] = {
    { BATTLE_EVENT_BAIT_MOVE_TARGET, HandlerStormDrain },
    { BATTLE_EVENT_MOVE_EXECUTE_START, HandlerLightningRodStart },
    { BATTLE_EVENT_CHECK_NO_EFFECT_AFTER_PROTECT, HandlerStormDrainCheckNoEffect },
};

const BattleEventHandlerEntry *EventAddStormDrain(u32 *priority) {
    *priority = NELEMS(sHandlersStormDrain);
    return sHandlersStormDrain;
}

void HandlerStormDrain(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    *work = CommonMoveTargetChangeToMe(flow, monId, work, 10);
}

void HandlerStormDrainCheckNoEffect(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (CommonDamageRecoverCheck(flow, monId, 10)) {
        CommonTypeNoEffectRankUp(flow, monId, 3, 1);
    }
}

static const BattleEventHandlerEntry sHandlersLightningRod[] = {
    { BATTLE_EVENT_BAIT_MOVE_TARGET, HandlerLightningRod },
    { BATTLE_EVENT_MOVE_EXECUTE_START, HandlerLightningRodStart },
    { BATTLE_EVENT_CHECK_NO_EFFECT_AFTER_PROTECT, HandlerLightningRodCheckNoEffect },
};

const BattleEventHandlerEntry *EventAddLightningRod(u32 *priority) {
    *priority = NELEMS(sHandlersLightningRod);
    return sHandlersLightningRod;
}

void HandlerLightningRod(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    *work = CommonMoveTargetChangeToMe(flow, monId, work, 12);
}

void HandlerLightningRodStart(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerMessageParam *param;

    if (*work) {
        if (IsEventTargetMon(monId)) {
            param = BattleHandler_PushWork(flow, 4, monId);
            param->popup = 1;
            BattleHandler_StrSetup(&param->string, 2, 7 << 6);
            BattleHandler_AddArg(&param->string, monId);
            BattleHandler_PopWork(flow, param);
        }
        *work = 0;
    }
}

void HandlerLightningRodCheckNoEffect(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (CommonDamageRecoverCheck(flow, monId, 12)) {
        CommonTypeNoEffectRankUp(flow, monId, 3, 1);
    }
}

BOOL CommonMoveTargetChangeToMe(BtlServerFlow *flow, u8 monId, s32 *work, u32 type) {
    u8 attackerId;
    u16 move;
    u8 targetId;

    attackerId = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER);
    if (attackerId != monId && BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_TYPE) == type) {
        move = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE);
        if (!BtlServerFlow_IsTargetOutOfRange(flow, attackerId, monId, move) && !IsPledgeMove(move)) {
            targetId = BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER);
            if (BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_DEFENDER, monId) && targetId != monId) {
                return TRUE;
            }
        }
    }
    return FALSE;
}

void HandlerSuctionCups(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerMessageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId &&
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1)) {
        param = BattleHandler_PushWork(flow, 4, monId);
        param->popup = 1;
        BattleHandler_StrSetup(&param->string, 2, 0x1c6);
        BattleHandler_AddArg(&param->string, monId);
        BattleHandler_PopWork(flow, param);
    }
}

static const BattleEventHandlerEntry sHandlersSuctionCups[] = {
    { BATTLE_EVENT_CHECK_FORCE_SWITCH_BLOCKED, HandlerSuctionCups },
};

const BattleEventHandlerEntry *EventAddSuctionCups(u32 *priority) {
    *priority = NELEMS(sHandlersSuctionCups);
    return sHandlersSuctionCups;
}

void HandlerLiquidOoze(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u16 amount;
    BattleHandlerDamageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        amount = BattleEventVar_GetValue(BATTLE_EVENT_VAR_VOLUME);
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_VOLUME, 0);
        if (amount != 0) {
            param = BattleHandler_PushWork(flow, 7, monId);
            param->popup = 1;
            param->targetIndex = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER);
            param->amount = amount;
            BattleHandler_StrSetup(&param->string, 2, 0x1c9);
            BattleHandler_AddArg(&param->string, param->targetIndex);
            BattleHandler_PopWork(flow, param);
        }
    }
}

void HandlerLiquidOozeFainted(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        BattleEventItem_ConvertToIsolated(item);
    }
}

static const BattleEventHandlerEntry sHandlersLiquidOoze[] = {
    { BATTLE_EVENT_CALC_DRAIN_AMOUNT_END, HandlerLiquidOoze },
    { BATTLE_EVENT_BEFORE_FAINT, HandlerLiquidOozeFainted },
};

const BattleEventHandlerEntry *EventAddLiquidOoze(u32 *priority) {
    *priority = NELEMS(sHandlersLiquidOoze);
    return sHandlersLiquidOoze;
}

BOOL HandlerKlutzSkipCheck(BattleEventItem *item, BtlServerFlow *flow, u32 factorType, u32 event, u16 subId, u8 monId) {
    static const u16 sKlutzWorkingItems[] = {
        ITEM_MACHO_BRACE, ITEM_EXP_SHARE,    ITEM_AMULET_COIN,  ITEM_LUCK_INCENSE, ITEM_CLEANSE_TAG,
        ITEM_EVERSTONE,   ITEM_LUCKY_EGG,    ITEM_POWER_BRACER, ITEM_POWER_BELT,   ITEM_POWER_LENS,
        ITEM_POWER_BAND,  ITEM_POWER_ANKLET, ITEM_POWER_WEIGHT,
    };
    u32 i;

    if (CheckCondition(GetBattleMon(flow, monId), 0x10)) {
        return FALSE;
    }
    if (factorType == BATTLE_EVENT_FACTOR_ITEM && HandlerGetMainModule(item) == monId) {
        for (i = 0; i < NELEMS(sKlutzWorkingItems); i++) {
            if (subId == sKlutzWorkingItems[i]) {
                return FALSE;
            }
        }
        return TRUE;
    }
    return FALSE;
}

void HandlerKlutzMemberInPrev(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (work[0] == 0) {
        BattleEventItem_AttachSkipCheckHandler(item, HandlerKlutzSkipCheck);
        work[0] = 1;
    }
}

void HandlerKlutzGetAbility(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        HandlerKlutzMemberInPrev(item, flow, monId, work);
    }
}

void HandlerKlutzPreChange(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        BattleEventItem_DetachSkipCheckHandler(item);
    }
}

void HandlerKlutzGastroAcid(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerCheckHeldItemParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId &&
        GetBattleMonHeldItem(GetBattleMon(flow, monId)) != 0) {
        param = BattleHandler_PushWork(flow, 0x21, monId);
        param->monIndex = monId;
        BattleHandler_PopWork(flow, param);
    }
}

void HandlerKlutzCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u16 move;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        move = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE);
        work[2] = 0;
        if (move == 0x16b && BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
            work[2] = BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_CAUSE, 0x13);
        }
    }
}

void HandlerKlutzFail(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 attackerId;
    BattleHandlerMessageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId && work[2] != 0) {
        attackerId = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON);
        param = BattleHandler_PushWork(flow, 4, monId);
        param->popup = 1;
        BattleHandler_StrSetup(&param->string, 2, 0x389);
        BattleHandler_AddArg(&param->string, monId);
        BattleHandler_AddArg(&param->string, BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE));
        BattleHandler_PopWork(flow, param);
        work[2] = 0;
    }
}

static const BattleEventHandlerEntry sHandlersKlutz[] = {
    { BATTLE_EVENT_MEMBER_IN_PREVIOUS, HandlerKlutzMemberInPrev },
    { BATTLE_EVENT_ROTATION_IN, HandlerKlutzMemberInPrev },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerKlutzGetAbility },
    { BATTLE_EVENT_CHANGE_ABILITY_BEFORE, HandlerKlutzPreChange },
    { BATTLE_EVENT_GASTRO_ACID_CONFIRMED, HandlerKlutzGastroAcid },
    { BATTLE_EVENT_CHECK_MOVE_FAIL_LATE, HandlerKlutzCheck },
    { BATTLE_EVENT_MOVE_EXECUTE_FAIL, HandlerKlutzFail },
};

const BattleEventHandlerEntry *EventAddKlutz(u32 *priority) {
    *priority = NELEMS(sHandlersKlutz);
    return sHandlersKlutz;
}

void HandlerStickyHoldNoEffect(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u16 move;
    BattleHandlerMessageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        move = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE);
        if ((move == 0x10f || move == 0x19f) && BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_NO_EFFECT, 1)) {
            param = BattleHandler_PushWork(flow, 4, monId);
            param->popup = 1;
            BattleHandler_StrSetup(&param->string, 2, 0xd2);
            BattleHandler_AddArg(&param->string, monId);
            BattleHandler_PopWork(flow, param);
        }
    }
}

void HandlerStickyHold(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId && BattleEventVar_GetValue(BATTLE_EVENT_VAR_ITEM) == 0) {
        work[0] = BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
    }
}

void HandlerStickyHoldReaction(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerMessageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId && work[0] != 0) {
        param = BattleHandler_PushWork(flow, 4, monId);
        param->popup = 1;
        BattleHandler_StrSetup(&param->string, 2, 0x1ed);
        BattleHandler_AddArg(&param->string, monId);
        BattleHandler_PopWork(flow, param);
        work[0] = 0;
    }
}

static const BattleEventHandlerEntry sHandlersStickyHold[] = {
    { BATTLE_EVENT_CHECK_NO_EFFECT_AFTER_PROTECT, HandlerStickyHoldNoEffect },
    { BATTLE_EVENT_CHECK_ITEM_SET, HandlerStickyHold },
    { BATTLE_EVENT_ITEM_SET_FAILED, HandlerStickyHoldReaction },
};

const BattleEventHandlerEntry *EventAddStickyHold(u32 *priority) {
    *priority = NELEMS(sHandlersStickyHold);
    return sHandlersStickyHold;
}

static const BattleEventHandlerEntry sHandlersPressure[] = {
    { BATTLE_EVENT_MEMBER_IN, HandlerPressureMemberIn },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerPressureMemberIn },
    { BATTLE_EVENT_CALC_PP_DECREMENT, HandlerPressure },
};

const BattleEventHandlerEntry *EventAddPressure(u32 *priority) {
    *priority = NELEMS(sHandlersPressure);
    return sHandlersPressure;
}

void HandlerPressureMemberIn(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerMessageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        BattleHandler_PushRun(flow, 2, monId);
        param = BattleHandler_PushWork(flow, 4, monId);
        BattleHandler_StrSetup(&param->string, 2, 0x1e7);
        BattleHandler_AddArg(&param->string, monId);
        BattleHandler_PopWork(flow, param);
        BattleHandler_PushRun(flow, 3, monId);
    }
}

void HandlerPressure(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BOOL apply;
    u16 move;
    u8 volume;

    if (!IsAllyMonID(BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER), monId)) {
        apply = FALSE;
        if (IsEventTargetMon(monId)) {
            apply = TRUE;
        } else {
            move = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE);
            if (PML_MoveGetQuality(move) == 10) {
                apply = TRUE;
            } else if (IsPressureFieldMove(move)) {
                apply = TRUE;
            }
        }
        if (apply) {
            volume = BattleEventVar_GetValue(BATTLE_EVENT_VAR_VOLUME) + 1;
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_VOLUME, volume);
        }
    }
}

static const BattleEventHandlerEntry sHandlersMagicGuard[] = {
    { BATTLE_EVENT_CHECK_SIMPLE_DAMAGE_ENABLED, HandlerMagicGuard },
};

const BattleEventHandlerEntry *EventAddMagicGuard(u32 *priority) {
    *priority = NELEMS(sHandlersMagicGuard);
    return sHandlersMagicGuard;
}

void HandlerMagicGuard(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_GENERAL_FLAG, 0);
    }
}

static const BattleEventHandlerEntry sHandlersStench[] = {
    { BATTLE_EVENT_GET_FLINCH_CHANCE, HandlerStench },
};

const BattleEventHandlerEntry *EventAddStench(u32 *priority) {
    *priority = NELEMS(sHandlersStench);
    return sHandlersStench;
}

void HandlerStench(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 chance;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        chance = BattleEventVar_GetValue(BATTLE_EVENT_VAR_FLINCH_CHANCE);
        if (chance == 0) {
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_ADDED_EFFECT_CHANCE, 10);
        }
    }
}

static const BattleEventHandlerEntry sHandlersShadowTag[] = {
    { BATTLE_EVENT_CHECK_ESCAPE_BLOCKED, HandlerShadowTag },
};

const BattleEventHandlerEntry *EventAddShadowTag(u32 *priority) {
    *priority = NELEMS(sHandlersShadowTag);
    return sHandlersShadowTag;
}

void HandlerShadowTag(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 count;
    u8 i;
    u8 mons[4];

    if (!IsAllyMonID(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON), monId)) {
        count = HandlerGetAlivePartyCount(flow, BtlServerFlow_GetMonBattlePos(flow, monId) | 0x100, mons);
        for (i = 0; i < count; i++) {
            if (GetBattleMonStat(GetBattleMon(flow, mons[i]), BATTLEMON_EFFECTIVE_ABILITY) == 0x17) {
                return;
            }
        }
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
    }
}

static const BattleEventHandlerEntry sHandlersArenaTrap[] = {
    { BATTLE_EVENT_CHECK_ESCAPE_BLOCKED, HandlerArenaTrap },
};

const BattleEventHandlerEntry *EventAddArenaTrap(u32 *priority) {
    *priority = NELEMS(sHandlersArenaTrap);
    return sHandlersArenaTrap;
}

void HandlerArenaTrap(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 count;
    u8 i;
    u8 mons[4];

    if (!IsAllyMonID(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON), monId)) {
        count = HandlerGetAlivePartyCount(flow, BtlServerFlow_GetMonBattlePos(flow, monId) | 0x100, mons);
        for (i = 0; i < count; i++) {
            if (!BtlServerFlow_IsFloating(flow, mons[i])) {
                BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
                return;
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersMagnetPull[] = {
    { BATTLE_EVENT_CHECK_ESCAPE_BLOCKED, HandlerMagnetPull },
};

const BattleEventHandlerEntry *EventAddMagnetPull(u32 *priority) {
    *priority = NELEMS(sHandlersMagnetPull);
    return sHandlersMagnetPull;
}

void HandlerMagnetPull(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 count;
    u8 i;
    u8 mons[4];

    if (!IsAllyMonID(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON), monId)) {
        count = HandlerGetAlivePartyCount(flow, BtlServerFlow_GetMonBattlePos(flow, monId) | 0x100, mons);
        for (i = 0; i < count; i++) {
            if (DoesMonHaveType(GetBattleMon(flow, mons[i]), 8)) {
                BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersUnburden[] = {
    { BATTLE_EVENT_ITEM_SET_DECIDE, HandlerUnburdenBeforeItemSet },
    { BATTLE_EVENT_CALCULATE_SPEED, HandlerUnburdenSpeed },
};

const BattleEventHandlerEntry *EventAddUnburden(u32 *priority) {
    *priority = NELEMS(sHandlersUnburden);
    return sHandlersUnburden;
}

void HandlerUnburdenBeforeItemSet(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId && BattleEventVar_GetValue(BATTLE_EVENT_VAR_ITEM) == 0) {
        if (GetBattleMonHeldItem(GetBattleMon(flow, monId)) != 0) {
            work[0] = 1;
        }
    }
}

void HandlerUnburdenSpeed(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId && work[0] == 1) {
        if (GetBattleMonHeldItem(GetBattleMon(flow, monId)) == 0) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, 0x2000);
        }
    }
}

static const BattleEventHandlerEntry sHandlersPickup[] = {
    { BATTLE_EVENT_TURN_CHECK, HandlerPickup },
};

const BattleEventHandlerEntry *EventAddPickup(u32 *priority) {
    *priority = NELEMS(sHandlersPickup);
    return sHandlersPickup;
}

void HandlerPickup(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 pos;
    PickupWork *wk;
    u8 numCandidates;
    u8 i;
    BattleMon *mon;
    u8 targetId;
    u16 consumed;
    BattleHandlerSetItemParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId &&
        GetBattleMonHeldItem(GetBattleMon(flow, monId)) == 0) {
        pos = BtlServerFlow_GetMonBattlePos(flow, monId);
        wk = (PickupWork *)BtlServerFlow_GetHandlerWork(flow, 0xe);
        wk->count = HandlerGetAlivePartyCount(flow, (2 << 8) | pos, wk->mons);
        numCandidates = 0;
        wk->numCandidates = 0;
        for (i = 0; i < wk->count; i++) {
            mon = GetBattleMon(flow, wk->mons[i]);
            if (GetTurnFlag(mon, 8) && GetConsumedItem(mon) != 0) {
                wk->candidates[numCandidates++] = GetMonID(mon);
            }
        }
        if (numCandidates != 0) {
            i = BattleRandom(numCandidates);
            targetId = wk->candidates[i];
            consumed = GetConsumedItem(GetBattleMon(flow, targetId));
            if (consumed != 0) {
                param = BattleHandler_PushWork(flow, 0x20, monId);
                param->popup = 1;
                param->targetIndex = monId;
                param->item = consumed;
                param->clearOtherConsumed = 1;
                param->otherIndex = targetId;
                BattleHandler_StrSetup(&param->string, 2, 0x1ea);
                BattleHandler_AddArg(&param->string, monId);
                BattleHandler_AddArg(&param->string, consumed);
                BattleHandler_PopWork(flow, param);
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersPickpocket[] = {
    { BATTLE_EVENT_DAMAGE_PROCESS_END_HIT_REAL_LAST, HandlerPickpocket },
};

const BattleEventHandlerEntry *EventAddPickpocket(u32 *priority) {
    *priority = NELEMS(sHandlersPickpocket);
    return sHandlersPickpocket;
}

void HandlerPickpocket(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 attackerId;
    BattleMon *mon;
    BattleMon *attacker;
    BattleHandlerSwapItemParam *param;

    if (IsEventTargetMon(monId)) {
        attackerId = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER);
        if (!IsItemSwapBlocked(flow, monId, attackerId) &&
            getMoveFlag(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE), 0)) {
            mon = GetBattleMon(flow, monId);
            attacker = GetBattleMon(flow, attackerId);
            if (GetBattleMonHeldItem(mon) == 0 && GetBattleMonHeldItem(attacker) != 0) {
                param = BattleHandler_PushWork(flow, 0x24, monId);
                param->popup = 1;
                param->otherIndex = attackerId;
                BattleHandler_StrSetup(&param->firstString, 2, 0x1cc);
                BattleHandler_AddArg(&param->firstString, attackerId);
                BattleHandler_AddArg(&param->firstString, GetBattleMonHeldItem(attacker));
                BattleHandler_PopWork(flow, param);
            }
        }
    }
}

void HandlerCursedBody(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 attackerId;
    BattleMon *attacker;
    u16 move;
    u8 turns;
    BattleHandlerAddConditionParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_SUBSTITUTE_FLAG) == 0 && !BtlServerFlow_CheckMatchup(flow)) {
        attackerId = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER);
        attacker = GetBattleMon(flow, attackerId);
        if (!CheckCondition(attacker, CONDITION_DISABLE)) {
            move = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ORIGINAL_MOVE);
            if (move != 0 && move != 0xa5 && !IsDelayedAttackMove(move) && AbilityEvent_RollEffectChance(flow, 30)) {
                turns = 4;
                if (GetTurnFlag(attacker, 1)) {
                    turns++;
                }
                param = BattleHandler_PushWork(flow, 0xc, monId);
                param->condition = CONDITION_DISABLE;
                param->value = AddTurnCondition(turns, move);
                param->targetIndex = attackerId;
                param->popup = 1;
                BattleHandler_PopWork(flow, param);
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersCursedBody[] = {
    { BATTLE_EVENT_DAMAGE_REACTION, HandlerCursedBody },
};

const BattleEventHandlerEntry *EventAddCursedBody(u32 *priority) {
    *priority = NELEMS(sHandlersCursedBody);
    return sHandlersCursedBody;
}

void HandlerWeakArmor(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleMon *mon;
    BOOL apply;
    BattleHandlerStatChangeParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_CATEGORY) == 1 &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_SUBSTITUTE_FLAG) == 0) {
        mon = GetBattleMon(flow, monId);
        apply = FALSE;
        if (IsStatChangeValid(mon, 2, -1) || IsStatChangeValid(mon, 5, 1)) {
            apply = TRUE;
        }
        if (apply && !IsFainted(mon)) {
            BattleHandler_PushRun(flow, 2, monId);
            param = BattleHandler_PushWork(flow, 0xe, monId);
            param->count = 1;
            param->monIds[0] = monId;
            param->unk0e = 1;
            param->stat = 2;
            param->change = -1;
            BattleHandler_PopWork(flow, param);
            param = BattleHandler_PushWork(flow, 0xe, monId);
            param->count = 1;
            param->monIds[0] = monId;
            param->unk0e = 1;
            param->stat = 5;
            param->change = 1;
            BattleHandler_PopWork(flow, param);
            BattleHandler_PushRun(flow, 3, monId);
        }
    }
}

static const BattleEventHandlerEntry sHandlersWeakArmor[] = {
    { BATTLE_EVENT_DAMAGE_REACTION, HandlerWeakArmor },
};

const BattleEventHandlerEntry *EventAddWeakArmor(u32 *priority) {
    *priority = NELEMS(sHandlersWeakArmor);
    return sHandlersWeakArmor;
}

void HandlerSheerForcePower(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId &&
        IsAffectedBySheerForce(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE))) {
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_POWER_RATIO, 0x14cd);
    }
}

void HandlerSheerForceCheckFail(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId &&
        IsAffectedBySheerForce(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE))) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
    }
}

void HandlerSheerForceShrinkCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
    }
}

void HandlerSheerForceHitCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId &&
        IsAffectedBySheerForce(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE))) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_SHEER_FORCE_FLAG, 1);
    }
}

static const BattleEventHandlerEntry sHandlersSheerForce[] = {
    { BATTLE_EVENT_MOVE_POWER_RATIO, HandlerSheerForcePower },
    { BATTLE_EVENT_CHECK_MOVE_ADD_CONDITION, HandlerSheerForceCheckFail },
    { BATTLE_EVENT_ADDED_STAT_CHANGE_CHANCE, HandlerSheerForceCheckFail },
    { BATTLE_EVENT_GET_FLINCH_CHANCE, HandlerSheerForceShrinkCheck },
    { BATTLE_EVENT_DAMAGE_PROCESS_END_CHECK, HandlerSheerForceHitCheck },
};

const BattleEventHandlerEntry *EventAddSheerForce(u32 *priority) {
    *priority = NELEMS(sHandlersSheerForce);
    return sHandlersSheerForce;
}

BOOL IsAffectedBySheerForce(u16 move) {
    s32 quality;
    u32 count;
    u32 i;
    s32 stage;

    quality = PML_MoveGetQuality(move);
    if (PML_MoveGetParam(move, MOVE_PARAM_FLINCH_CHANCE) != 0) {
        return TRUE;
    }
    switch (quality) {
    case 4:
        if (PML_MoveGetParam(move, MOVE_PARAM_CONDITION) == 8) {
            return FALSE;
        }
    case 6:
        return TRUE;
    case 7:
        count = PML_MoveGetStatChangeStat(move);
        for (i = 0; i < count; i++) {
            PML_MoveGetStatChangeStage(move, i, &stage);
            if (stage < 0) {
                return FALSE;
            }
        }
        return TRUE;
    }
    if (move == 0x122) {
        return TRUE;
    }
    return FALSE;
}

void HandlerDefiant(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 attackerId;
    BattleHandlerStatChangeParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        attackerId = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER);
        if (!IsAllyMonID(monId, attackerId) && (s32)BattleEventVar_GetValue(BATTLE_EVENT_VAR_VOLUME) < 0) {
            param = BattleHandler_PushWork(flow, 0xe, monId);
            param->popup = 1;
            param->stat = 1;
            param->change = 2;
            param->unk0e = 1;
            param->count = 1;
            param->monIds[0] = monId;
            BattleHandler_PopWork(flow, param);
        }
    }
}

static const BattleEventHandlerEntry sHandlersDefiant[] = {
    { BATTLE_EVENT_STAT_CHANGE_APPLIED, HandlerDefiant },
};

const BattleEventHandlerEntry *EventAddDefiant(u32 *priority) {
    *priority = NELEMS(sHandlersDefiant);
    return sHandlersDefiant;
}

void HandlerDefeatist(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleMon *mon;
    u32 hp;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        mon = GetBattleMon(flow, monId);
        hp = GetBattleMonStat(mon, BATTLEMON_HP);
        if (hp <= DivideMaxHp(mon, 2)) {
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, 0x800);
        }
    }
}

static const BattleEventHandlerEntry sHandlersDefeatist[] = {
    { BATTLE_EVENT_ATTACK_STAT, HandlerDefeatist },
};

const BattleEventHandlerEntry *EventAddDefeatist(u32 *priority) {
    *priority = NELEMS(sHandlersDefeatist);
    return sHandlersDefeatist;
}

void HandlerMultiscale(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId && IsMonFullHP(GetBattleMon(flow, monId))) {
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, 0x800);
    }
}

static const BattleEventHandlerEntry sHandlersMultiscale[] = {
    { BATTLE_EVENT_DAMAGE_RATIO, HandlerMultiscale },
};

const BattleEventHandlerEntry *EventAddMultiscale(u32 *priority) {
    *priority = NELEMS(sHandlersMultiscale);
    return sHandlersMultiscale;
}

void HandlerFriendGuard(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 targetId;

    targetId = BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER);
    if (targetId != monId && IsAllyMonID(monId, targetId)) {
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, 0xc00);
    }
}

static const BattleEventHandlerEntry sHandlersFriendGuard[] = {
    { BATTLE_EVENT_DAMAGE_RATIO, HandlerFriendGuard },
};

const BattleEventHandlerEntry *EventAddFriendGuard(u32 *priority) {
    *priority = NELEMS(sHandlersFriendGuard);
    return sHandlersFriendGuard;
}

void HandlerHealer(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 count;
    u8 i;
    BattleHandlerCureConditionParam *param;
    u8 mons[4];

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        count = HandlerGetAlivePartyCount(flow, (2 << 9) | BtlServerFlow_MonIDToPos(flow, monId), mons);
        for (i = 0; i < count; i++) {
            if (mons[i] != monId && GetBattleMonStatus(GetBattleMon(flow, mons[i])) != 0 &&
                AbilityEvent_RollEffectChance(flow, 30)) {
                param = BattleHandler_PushWork(flow, 0xb, monId);
                param->popup = 1;
                param->unk25 = 1;
                param->count = 1;
                param->monIds[0] = mons[i];
                param->condition = CONDITION_ANY_STATUS;
                BattleHandler_PopWork(flow, param);
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersHealer[] = {
    { BATTLE_EVENT_TURN_CHECK_EARLY, HandlerHealer },
};

const BattleEventHandlerEntry *EventAddHealer(u32 *priority) {
    *priority = NELEMS(sHandlersHealer);
    return sHandlersHealer;
}

void HandlerToxicBoost(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId && CheckCondition(GetBattleMon(flow, monId), 5) &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_CATEGORY) == 1) {
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_POWER_RATIO, 0x1800);
    }
}

static const BattleEventHandlerEntry sHandlersToxicBoost[] = {
    { BATTLE_EVENT_MOVE_POWER_RATIO, HandlerToxicBoost },
};

const BattleEventHandlerEntry *EventAddToxicBoost(u32 *priority) {
    *priority = NELEMS(sHandlersToxicBoost);
    return sHandlersToxicBoost;
}

void HandlerFlareBoost(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId && CheckCondition(GetBattleMon(flow, monId), 4) &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_CATEGORY) == 2) {
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_POWER_RATIO, 0x1800);
    }
}

static const BattleEventHandlerEntry sHandlersFlareBoost[] = {
    { BATTLE_EVENT_MOVE_POWER_RATIO, HandlerFlareBoost },
};

const BattleEventHandlerEntry *EventAddFlareBoost(u32 *priority) {
    *priority = NELEMS(sHandlersFlareBoost);
    return sHandlersFlareBoost;
}

void HandlerTelepathy(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 attackerId;
    BattleHandlerMessageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId) {
        attackerId = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER);
        if (IsAllyMonID(monId, attackerId) && monId != attackerId &&
            PML_MoveIsDamaging(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE)) &&
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_NO_EFFECT, 1)) {
            param = BattleHandler_PushWork(flow, 4, monId);
            param->popup = 1;
            BattleHandler_StrSetup(&param->string, 2, 0x1d5);
            BattleHandler_AddArg(&param->string, monId);
            BattleHandler_PopWork(flow, param);
        }
    }
}

static const BattleEventHandlerEntry sHandlersTelepathy[] = {
    { BATTLE_EVENT_CHECK_NO_EFFECT_AFTER_PROTECT, HandlerTelepathy },
};

const BattleEventHandlerEntry *EventAddTelepathy(u32 *priority) {
    *priority = NELEMS(sHandlersTelepathy);
    return sHandlersTelepathy;
}

void HandlerMoody(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 i;
    u8 numPairs;
    u8 numUp;
    u8 upStat;
    BattleHandlerStatChangeParam *param;
    u8 downStat;
    u32 j;
    BattleMon *mon;
    u8 numDown;
    MoodyWork *wk;
    u16 pair;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        wk = (MoodyWork *)BtlServerFlow_GetHandlerWork(flow, 0xb6);
        mon = GetBattleMon(flow, monId);
        numDown = 0;
        numUp = 0;
        for (i = 0; i < 7; i++) {
            if (IsStatChangeValid(mon, i + 1, 1)) {
                wk->up[numUp++] = i + 1;
            }
            if (IsStatChangeValid(mon, i + 1, -1)) {
                wk->down[numDown++] = i + 1;
            }
        }
        downStat = 0;
        upStat = 0;
        if (numUp == 0 && numDown != 0) {
            downStat = wk->down[BattleRandom(numDown)];
        } else if (numUp != 0 && numDown == 0) {
            upStat = wk->up[BattleRandom(numUp)];
        } else if (numUp != 0 && numDown != 0) {
            numPairs = 0;
            for (i = 0; i < numUp; i++) {
                for (j = 0; j < numDown; j++) {
                    if (wk->up[i] != wk->down[j]) {
                        wk->pairs[numPairs++] = (wk->up[i] << 8) | wk->down[j];
                        if (numPairs >= 0x54) {
                            break;
                        }
                    }
                }
            }
            pair = wk->pairs[BattleRandom(numPairs)];
            upStat = pair >> 8;
            downStat = pair;
        }
        BattleHandler_PushRun(flow, 2, monId);
        if (upStat != 0) {
            param = BattleHandler_PushWork(flow, 0xe, monId);
            param->count = 1;
            param->monIds[0] = monId;
            param->stat = upStat;
            param->change = 2;
            BattleHandler_PopWork(flow, param);
        }
        if (downStat != 0) {
            param = BattleHandler_PushWork(flow, 0xe, monId);
            param->count = 1;
            param->monIds[0] = monId;
            param->stat = downStat;
            param->change = -1;
            BattleHandler_PopWork(flow, param);
        }
        BattleHandler_PushRun(flow, 3, monId);
    }
}

static const BattleEventHandlerEntry sHandlersMoody[] = {
    { BATTLE_EVENT_TURN_CHECK, HandlerMoody },
};

const BattleEventHandlerEntry *EventAddMoody(u32 *priority) {
    *priority = NELEMS(sHandlersMoody);
    return sHandlersMoody;
}

void HandlerOvercoat(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId &&
        (s32)BattleEventVar_GetValue(BATTLE_EVENT_VAR_DAMAGE) > 0) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_FAIL_FLAG, 1);
    }
}

static const BattleEventHandlerEntry sHandlersOvercoat[] = {
    { BATTLE_EVENT_CHECK_WEATHER_DAMAGE, HandlerOvercoat },
};

const BattleEventHandlerEntry *EventAddOvercoat(u32 *priority) {
    *priority = NELEMS(sHandlersOvercoat);
    return sHandlersOvercoat;
}

void HandlerPoisonTouch(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerAddConditionParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_SUBSTITUTE_FLAG) == 0 &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_SHIELD_DUST_FLAG) == 0 &&
        getMoveFlag(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE), 0) && AbilityEvent_RollEffectChance(flow, 30)) {
        param = BattleHandler_PushWork(flow, 0xc, monId);
        param->popup = 1;
        param->targetIndex = BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER);
        param->condition = CONDITION_POISON;
        param->value = BtlCalc_MakeStatusCondition(5);
        BattleHandler_StrSetup(&param->string, 2, 0x1d8);
        BattleHandler_AddArg(&param->string, param->targetIndex);
        BattleHandler_PopWork(flow, param);
    }
}

static const BattleEventHandlerEntry sHandlersPoisonTouch[] = {
    { BATTLE_EVENT_DAMAGE_REACTION, HandlerPoisonTouch },
};

const BattleEventHandlerEntry *EventAddPoisonTouch(u32 *priority) {
    *priority = numHandlersWithHandlerPri(4, 1);
    return sHandlersPoisonTouch;
}

void HandlerRegenerator(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleMon *mon;
    u32 amount;
    u32 missing;
    BattleHandlerChangeHPParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        mon = GetBattleMon(flow, monId);
        if (!IsFainted(mon) && !IsMonFullHP(mon)) {
            amount = DivideMaxHPZeroCheck(mon, 3);
            missing = GetBattleMonStat(mon, BATTLEMON_MAX_HP) - GetBattleMonStat(mon, BATTLEMON_HP);
            if (amount > missing) {
                amount = missing;
            }
            param = BattleHandler_PushWork(flow, 8, monId);
            param->monIds[0] = monId;
            param->hpChanges[0] = amount;
            param->count = 1;
            param->suppress = 1;
            BattleHandler_PopWork(flow, param);
        }
    }
}

// Function name from swan.
static const BattleEventHandlerEntry sHandlersRegenerator[] = {
    { BATTLE_EVENT_SWITCH_OUT, HandlerRegenerator },
};

const BattleEventHandlerEntry *EventAddRegenerator(u32 *priority) {
    *priority = NELEMS(sHandlersRegenerator);
    return sHandlersRegenerator;
}

static const BattleEventHandlerEntry sHandlersBigPecks[] = {
    { BATTLE_EVENT_CHECK_STAT_CHANGE, HandlerBigPecksCheck },
    { BATTLE_EVENT_STAT_CHANGE_FAILED, HandlerBigPecksGuard },
};

const BattleEventHandlerEntry *EventAddBigPecks(u32 *priority) {
    *priority = NELEMS(sHandlersBigPecks);
    return sHandlersBigPecks;
}

void HandlerBigPecksCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonStatDropGuardCheck(flow, monId, work, BATTLEMON_DEFENSE_STAGE);
}

void HandlerBigPecksGuard(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonStatDropGuardFixed(flow, monId, work, 0xcc);
}

static const BattleEventHandlerEntry sHandlersSandRush[] = {
    { BATTLE_EVENT_CALCULATE_SPEED, HandlerSandRush },
    { BATTLE_EVENT_CHECK_WEATHER_DAMAGE, HandlerSandVeilWeather },
};

const BattleEventHandlerEntry *EventAddSandRush(u32 *priority) {
    *priority = NELEMS(sHandlersSandRush);
    return sHandlersSandRush;
}

void HandlerSandRush(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId && GetWeather(flow) == 4) {
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, 0x2000);
    }
}

static const BattleEventHandlerEntry sHandlersWonderSkin[] = {
    { BATTLE_EVENT_GET_MOVE_ACCURACY, HandlerWonderSkin },
};

const BattleEventHandlerEntry *EventAddWonderSkin(u32 *priority) {
    *priority = NELEMS(sHandlersWonderSkin);
    return sHandlersWonderSkin;
}

void HandlerWonderSkin(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_CATEGORY) == 0 &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_ACCURACY) > 50) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_ACCURACY, 50);
    }
}

static const BattleEventHandlerEntry sHandlersAnalytic[] = {
    { BATTLE_EVENT_MOVE_POWER_RATIO, HandlerAnalytic },
};

const BattleEventHandlerEntry *EventAddAnalytic(u32 *priority) {
    *priority = NELEMS(sHandlersAnalytic);
    return sHandlersAnalytic;
}

void HandlerAnalytic(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId &&
        !IsDelayedAttackMove(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE)) && IsMonLastInTurnOrder(flow, monId)) {
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_POWER_RATIO, 0x14cd);
    }
}

static const BattleEventHandlerEntry sHandlersSandForce[] = {
    { BATTLE_EVENT_MOVE_POWER_RATIO, HandlerSandForce },
    { BATTLE_EVENT_CHECK_WEATHER_DAMAGE, HandlerSandVeilWeather },
};

const BattleEventHandlerEntry *EventAddSandForce(u32 *priority) {
    *priority = NELEMS(sHandlersSandForce);
    return sHandlersSandForce;
}

void HandlerSandForce(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId && GetWeather(flow) == 4) {
        switch ((u8)BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_TYPE)) {
        case 4:
        case 5:
        case 8:
            BattleEventVar_MulValue(BATTLE_EVENT_VAR_POWER_RATIO, 0x14cd);
            break;
        }
    }
}

void HandlerZenMode(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleMon *mon;
    u8 form;
    BattleHandlerChangeFormParam *param;
    u16 message;

    mon = GetBattleMon(flow, monId);
    if (GetBattleMonSpecies(mon) == 0x22b) {
        form = GetBattleMonStat(mon, BATTLEMON_HP) <= DivideMaxHp(mon, 2) ? 1 : 0;
        if (form != GetBattleMonStat(mon, BATTLEMON_FORM)) {
            param = BattleHandler_PushWork(flow, 0x39, monId);
            param->popup = 1;
            param->monIndex = monId;
            param->form = form;
            message = form == 1 ? 0xb9 : 0xba;
            BattleHandler_StrSetup(&param->string, 1, message);
            BattleHandler_PopWork(flow, param);
        }
    }
}

void HandlerZenModeGastroAcid(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerChangeFormParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId &&
        GetBattleMonSpecies(GetBattleMon(flow, monId)) == 0x22b) {
        param = BattleHandler_PushWork(flow, 0x39, monId);
        param->monIndex = monId;
        param->form = 0;
        BattleHandler_StrSetup(&param->string, 1, 0xba);
        BattleHandler_AddArg(&param->string, monId);
        BattleHandler_PopWork(flow, param);
    }
}

static const BattleEventHandlerEntry sHandlersZenMode[] = {
    { BATTLE_EVENT_TURN_CHECK_LATE, HandlerZenMode },
    { BATTLE_EVENT_GASTRO_ACID_CONFIRMED, HandlerZenModeGastroAcid },
    { BATTLE_EVENT_CHANGE_ABILITY_BEFORE, HandlerZenModeGastroAcid },
};

const BattleEventHandlerEntry *EventAddZenMode(u32 *priority) {
    *priority = NELEMS(sHandlersZenMode);
    return sHandlersZenMode;
}

BOOL HandlerInfiltratorSkipCheck(BattleEventItem *item, BtlServerFlow *flow, u32 factorType, u32 event, u16 subId,
                                 u8 monId) {
    u8 side;

    if (factorType == BATTLE_EVENT_FACTOR_SIDE) {
        side = GetSideFromMonID(HandlerGetMainModule(item));
        if (side != monId && subId <= 3) {
            return TRUE;
        }
    }
    return FALSE;
}

void HandlerInfiltratorStart(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        BattleEventItem_AttachSkipCheckHandler(item, HandlerInfiltratorSkipCheck);
    }
}

void HandlerInfiltratorEnd(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        BattleEventItem_DetachSkipCheckHandler(item);
    }
}

static const BattleEventHandlerEntry sHandlersInfiltrator[] = {
    { BATTLE_EVENT_MOVE_SEQUENCE_START, HandlerInfiltratorStart },
    { BATTLE_EVENT_MOVE_SEQUENCE_END, HandlerInfiltratorEnd },
};

const BattleEventHandlerEntry *EventAddInfiltrator(u32 *priority) {
    *priority = NELEMS(sHandlersInfiltrator);
    return sHandlersInfiltrator;
}

static const BattleEventHandlerEntry sHandlersMoxie[] = {
    { BATTLE_EVENT_DAMAGE_PROCESS_END_HIT_REAL, HandlerMoxie },
};

const BattleEventHandlerEntry *EventAddMoxie(u32 *priority) {
    *priority = NELEMS(sHandlersMoxie);
    return sHandlersMoxie;
}

void HandlerMoxie(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 count;
    u32 i;
    BattleHandlerStatChangeParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        count = BattleEventVar_GetValue(BATTLE_EVENT_VAR_TARGET_COUNT);
        for (i = 0; i < count; i++) {
            if (IsFainted(GetBattleMon(flow, (u8)BattleEventVar_GetValue(BATTLE_EVENT_VAR_TARGET_1 + i)))) {
                param = BattleHandler_PushWork(flow, 0xe, monId);
                param->popup = 1;
                param->count = 1;
                param->monIds[0] = monId;
                param->stat = 1;
                param->change = 1;
                BattleHandler_PopWork(flow, param);
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersJustified[] = {
    { BATTLE_EVENT_DAMAGE_REACTION, HandlerJustified },
};

const BattleEventHandlerEntry *EventAddJustified(u32 *priority) {
    *priority = NELEMS(sHandlersJustified);
    return sHandlersJustified;
}

void HandlerJustified(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerStatChangeParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_SUBSTITUTE_FLAG) == 0 &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_TYPE) == 0x10) {
        param = BattleHandler_PushWork(flow, 0xe, monId);
        param->popup = 1;
        param->count = 1;
        param->monIds[0] = monId;
        param->stat = 1;
        param->change = 1;
        BattleHandler_PopWork(flow, param);
    }
}

static const BattleEventHandlerEntry sHandlersRattled[] = {
    { BATTLE_EVENT_DAMAGE_REACTION, HandlerRattled },
};

const BattleEventHandlerEntry *EventAddRattled(u32 *priority) {
    *priority = NELEMS(sHandlersRattled);
    return sHandlersRattled;
}

void HandlerRattled(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 type;
    BattleHandlerStatChangeParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_SUBSTITUTE_FLAG) == 0) {
        type = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_TYPE);
        if (type == 0x10 || type == 6 || type == 7) {
            param = BattleHandler_PushWork(flow, 0xe, monId);
            param->popup = 1;
            param->count = 1;
            param->monIds[0] = monId;
            param->stat = 5;
            param->change = 1;
            BattleHandler_PopWork(flow, param);
        }
    }
}

static const BattleEventHandlerEntry sHandlersMummy[] = {
    { BATTLE_EVENT_DAMAGE_REACTION, HandlerMummy },
};

const BattleEventHandlerEntry *EventAddMummy(u32 *priority) {
    *priority = NELEMS(sHandlersMummy);
    return sHandlersMummy;
}

void HandlerMummy(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 attackerId;
    BattleHandlerAbilityChangeParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_SUBSTITUTE_FLAG) == 0 && !BtlServerFlow_CheckMatchup(flow) &&
        getMoveFlag(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE), 0)) {
        attackerId = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER);
        if (GetBattleMonStat(GetBattleMon(flow, attackerId), BATTLEMON_ABILITY) != 0x98) {
            param = BattleHandler_PushWork(flow, 0x1f, monId);
            param->ability = 0x98;
            param->targetIndex = attackerId;
            BattleHandler_StrSetup(&param->string, 2, 0x1cf);
            BattleHandler_AddArg(&param->string, param->targetIndex);
            if (!IsAllyMonID(monId, attackerId)) {
                param->popup = 1;
            }
            BattleHandler_PopWork(flow, param);
        }
    }
}

void HandlerSapSipperCheckNoEffect(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (CommonDamageRecoverCheck(flow, monId, 0xb)) {
        CommonTypeNoEffectRankUp(flow, monId, 1, 1);
    }
}

static const BattleEventHandlerEntry sHandlersSapSipper[] = {
    { BATTLE_EVENT_CHECK_NO_EFFECT_AFTER_PROTECT, HandlerSapSipperCheckNoEffect },
};

const BattleEventHandlerEntry *EventAddSapSipper(u32 *priority) {
    *priority = NELEMS(sHandlersSapSipper);
    return sHandlersSapSipper;
}

void HandlerPrankster(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 priority;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId &&
        PML_MoveGetCategory(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE)) == 0) {
        priority = BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE_PRIORITY);
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_MOVE_PRIORITY, priority + 1);
    }
}

static const BattleEventHandlerEntry sHandlersPrankster[] = {
    { BATTLE_EVENT_GET_MOVE_PRIORITY, HandlerPrankster },
};

const BattleEventHandlerEntry *EventAddPrankster(u32 *priority) {
    *priority = NELEMS(sHandlersPrankster);
    return sHandlersPrankster;
}

void HandlerMagicBounceCheck(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonMagicCoatCheckMoveEffect(item, flow, monId, work);
}

void HandlerMagicBounceWait(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    CommonMagicCoatWait(item, flow, monId, work);
}

void HandlerMagicBounceReflect(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId &&
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_GENERAL_FLAG, 1)) {
        BattleHandler_PushRun(flow, 2, monId);
        CommonMoveProtectedMessage(item, flow, monId, work);
        BattleHandler_PushRun(flow, 3, monId);
    }
}

static const BattleEventHandlerEntry sHandlersMagicBounce[] = {
    { BATTLE_EVENT_CHECK_MOVE_FAIL_LATE, HandlerMagicBounceCheck },
    { BATTLE_EVENT_CHECK_NO_EFFECT_AFTER_PROTECT, HandlerMagicBounceWait },
    { BATTLE_EVENT_REFLECT_MOVE, HandlerMagicBounceReflect },
};

const BattleEventHandlerEntry *EventAddMagicBounce(u32 *priority) {
    *priority = NELEMS(sHandlersMagicBounce);
    return sHandlersMagicBounce;
}

void HandlerHarvest(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleMon *mon;
    u16 berry;
    BattleHandlerSetItemParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        mon = GetBattleMon(flow, monId);
        berry = GetConsumedItem(mon);
        if (berry != 0 && PML_ItemIsBerry(berry) && GetBattleMonHeldItem(mon) == 0) {
            if (GetWeather(flow) == 1 || AbilityEvent_RollEffectChance(flow, 50)) {
                param = BattleHandler_PushWork(flow, 0x20, monId);
                param->popup = 1;
                param->item = berry;
                param->targetIndex = monId;
                param->clearConsumed = 1;
                BattleHandler_StrSetup(&param->string, 2, 0x1db);
                BattleHandler_AddArg(&param->string, monId);
                BattleHandler_AddArg(&param->string, berry);
                BattleHandler_PopWork(flow, param);
            }
        }
    }
}

static const BattleEventHandlerEntry sHandlersHarvest[] = {
    { BATTLE_EVENT_TURN_CHECK, HandlerHarvest },
};

const BattleEventHandlerEntry *EventAddHarvest(u32 *priority) {
    *priority = NELEMS(sHandlersHarvest);
    return sHandlersHarvest;
}

static const BattleEventHandlerEntry sHandlersHeavyMetal[] = {
    { BATTLE_EVENT_GET_WEIGHT_RATIO, HandlerHeavyMetal },
};

const BattleEventHandlerEntry *EventAddHeavyMetal(u32 *priority) {
    *priority = NELEMS(sHandlersHeavyMetal);
    return sHandlersHeavyMetal;
}

void HandlerHeavyMetal(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, 0x2000);
    }
}

static const BattleEventHandlerEntry sHandlersLightMetal[] = {
    { BATTLE_EVENT_GET_WEIGHT_RATIO, HandlerLightMetal },
};

const BattleEventHandlerEntry *EventAddLightMetal(u32 *priority) {
    *priority = NELEMS(sHandlersLightMetal);
    return sHandlersLightMetal;
}

void HandlerLightMetal(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, 0x800);
    }
}

void HandlerContrary(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        work[0] =
            BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_VOLUME, -BattleEventVar_GetValue(BATTLE_EVENT_VAR_VOLUME));
    }
}

static const BattleEventHandlerEntry sHandlersContrary[] = {
    { BATTLE_EVENT_STAT_CHANGE_AMOUNT, HandlerContrary },
};

const BattleEventHandlerEntry *EventAddContrary(u32 *priority) {
    *priority = NELEMS(sHandlersContrary);
    return sHandlersContrary;
}

void HandlerUnnerveMemberIn(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        HandlerUnnerveRotationIn(item, flow, monId, work);
    }
}

void HandlerUnnerveRotationIn(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 opposingSide;
    BattleHandlerMessageParam *param;

    if (work[0] == 0) {
        opposingSide = GetOpposingSide(GetSideFromMonID(monId));
        BattleHandler_PushRun(flow, 2, monId);
        param = BattleHandler_PushWork(flow, 4, monId);
        BattleHandler_StrSetup(&param->string, 1, 0xb0);
        BattleHandler_AddArg(&param->string, opposingSide);
        BattleHandler_PopWork(flow, param);
        BattleHandler_PushRun(flow, 3, monId);
        BattleEventItem_AttachSkipCheckHandler(item, HandlerUnnerveSkipCheck);
        work[0] = 1;
    }
}

BOOL HandlerUnnerveSkipCheck(BattleEventItem *item, BtlServerFlow *flow, u32 factorType, u32 event, u16 subId,
                             u8 monId) {
    if (factorType == BATTLE_EVENT_FACTOR_ITEM && !IsAllyMonID(HandlerGetMainModule(item), monId) &&
        PML_ItemIsBerry(subId)) {
        return TRUE;
    }
    return FALSE;
}

static const BattleEventHandlerEntry sHandlersUnnerve[] = {
    { BATTLE_EVENT_MEMBER_IN, HandlerUnnerveMemberIn },
    { BATTLE_EVENT_ROTATION_IN, HandlerUnnerveRotationIn },
    { BATTLE_EVENT_MEMBER_IN_PREVIOUS, HandlerUnnerveRotationIn },
};

const BattleEventHandlerEntry *EventAddUnnerve(u32 *priority) {
    *priority = NELEMS(sHandlersUnnerve);
    return sHandlersUnnerve;
}

void HandlerImposter(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 pos;
    u8 targetId;
    BattleMon *target;
    BattleHandlerTransformParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        pos = BtlServerFlow_MonIDToPos(flow, monId);
        targetId = BtlServerFlow_PosToMonID(flow, GetFacingPos(BtlServerFlow_GetBattleStyle(flow), pos));
        target = GetBattleMon(flow, targetId);
        if (!IsFainted(GetBattleMon(flow, monId)) && !IsFainted(target)) {
            param = BattleHandler_PushWork(flow, 0x33, monId);
            param->popup = 1;
            param->targetIndex = targetId;
            BattleHandler_StrSetup(&param->string, 2, 0x284);
            BattleHandler_AddArg(&param->string, monId);
            BattleHandler_AddArg(&param->string, param->targetIndex);
            BattleHandler_PopWork(flow, param);
        }
    }
}

static const BattleEventHandlerEntry sHandlersImposter[] = {
    { BATTLE_EVENT_MEMBER_IN, HandlerImposter },
};

const BattleEventHandlerEntry *EventAddImposter(u32 *priority) {
    *priority = NELEMS(sHandlersImposter);
    return sHandlersImposter;
}

static const BattleEventHandlerEntry sHandlersIllusion[] = {
    { BATTLE_EVENT_DAMAGE_REACTION, HandlerIllusionDamage },
    { BATTLE_EVENT_GASTRO_ACID_CONFIRMED, HandlerIllusionGastroAcid },
    { BATTLE_EVENT_CHANGE_ABILITY_BEFORE, HandlerIllusionChangeAbility },
};

const BattleEventHandlerEntry *EventAddIllusion(u32 *priority) {
    *priority = NELEMS(sHandlersIllusion);
    return sHandlersIllusion;
}

void HandlerIllusionDamage(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_SUBSTITUTE_FLAG) == 0) {
        CommonIllusionBreak(item, flow, monId);
    }
}

void HandlerIllusionGastroAcid(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        CommonIllusionBreak(item, flow, monId);
    }
}

void HandlerIllusionChangeAbility(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_NEXT_ABILITY) != BattleEventItem_GetSubID(item) &&
        BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        CommonIllusionBreak(item, flow, monId);
    }
}

void CommonIllusionBreak(BattleEventItem *item, BtlServerFlow *flow, u8 monId) {
    BattleHandlerIllusionBreakParam *param;

    if (IsIllusionEnabled(GetBattleMon(flow, monId))) {
        param = BattleHandler_PushWork(flow, 0x34, monId);
        param->monIndex = monId;
        BattleHandler_StrSetup(&param->string, 2, 0x1de);
        BattleHandler_AddArg(&param->string, monId);
        BattleHandler_PopWork(flow, param);
    }
}

static const BattleEventHandlerEntry sHandlersVictoryStar[] = {
    { BATTLE_EVENT_GET_MOVE_ACCURACY, HandlerVictoryStar },
};

const BattleEventHandlerEntry *EventAddVictoryStar(u32 *priority) {
    *priority = NELEMS(sHandlersVictoryStar);
    return sHandlersVictoryStar;
}

void HandlerVictoryStar(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 attackerId;

    attackerId = BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER);
    if (IsAllyMonID(monId, attackerId)) {
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_RATIO, 0x119a);
    }
}
