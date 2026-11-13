#include "types.h"
#include "battle/btl_calc.h"
#include "battle/btl_event.h"
#include "battle/btl_field.h"
#include "battle/btl_handler.h"
#include "battle/btl_pokeparam.h"
#include "battle/btl_server_cmd.h"
#include "battle/btl_server_flow.h"
#include "constants/abilities.h"
#include "constants/battle.h"
#include "constants/moves.h"
#include "constants/types.h"
#include "gfl/std.h"
#include "paperwhite2/abilities.h"
#include "paperwhite2/battle_handlers.h"
#include "paperwhite2/moves.h"
#include "pml/item.h"
#include "pml/move.h"
#include "text/system/0018.h"

// Paper White 2: the battle's side of the added moves and abilities (docs/paperwhite2/design/moves-and-abilities.md):
// whose handlers each takes, and the handlers of the ones whose rules are new. Each move's or ability's handlers are
// built while its constant exists; the syrup's turn end always is (a condition, which any move may inflict by its data)

// getMoveFlag's bit of MOVE_FLAG_BALLISTIC
#define MOVE_FLAG_BIT_BALLISTIC 14
// The set message "It doesn't affect [the Pokémon]...", Soundproof's
#define MESSAGE_DOESNT_AFFECT 0xd2
// The set message "[The Pokémon] is getting pumped!", Focus Energy's
#define MESSAGE_GETTING_PUMPED 0x411
// The condition flag of Focus Energy and Dire Hit, two more critical-hit stages (BattleMon_GetCritStage)
#define CONDITION_FLAG_PUMPED 9
// The positions of the foes next to a position, HandlerGetAlivePartyCount's code (BtlMain's position group 1)
#define ADJACENT_FOES_OF(pos) ((1 << 8) | (pos))

#if PAPERWHITE2_MOVE_ADDED_COUNT != 0
// Each added move's "handlers_like", or itself, from the first
static const u16 sMoveHandlersLike[PAPERWHITE2_MOVE_ADDED_COUNT] = { PAPERWHITE2_MOVE_HANDLERS_LIKE };

u16 PaperWhite2_GetMoveHandlersMove(u16 move) {
    if (!PaperWhite2_IsAddedMove(move)) {
        return move;
    }
    return sMoveHandlersLike[move - PAPERWHITE2_MOVE_FIRST_ADDED];
}
#endif

#if PAPERWHITE2_ABILITY_ADDED_COUNT != 0
// Each added ability's "handlers_like", or itself, from the first
static const u16 sAbilityHandlersLike[PAPERWHITE2_ABILITY_ADDED_COUNT] = { PAPERWHITE2_ABILITY_HANDLERS_LIKE };

u16 PaperWhite2_GetAbilityHandlersAbility(u16 ability) {
    if (!PaperWhite2_IsAddedAbility(ability)) {
        return ability;
    }
    return sAbilityHandlersLike[ability - PAPERWHITE2_ABILITY_FIRST_ADDED];
}
#endif

#ifdef MOVE_GRAV_APPLE
// Grav Apple's power is 1.5 times while Gravity is in effect (Venoshock's shape: the ratio of the move's power). Its
// Defense drop is its data's
static void HandlerGravApple(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId && IsFieldEffectActive(FIELD_CONDITION_GRAVITY)) {
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_POWER_RATIO, FX32_CONST(1.5));
    }
}

static const BattleEventHandlerEntry sGravAppleHandlers[] = {
    { BATTLE_EVENT_MOVE_POWER_RATIO, HandlerGravApple },
};

const BattleEventHandlerEntry *PaperWhite2_EventAddGravApple(u32 *priority) {
    *priority = NELEMS(sGravAppleHandlers);
    return sGravAppleHandlers;
}
#endif

#ifdef ABILITY_BULLETPROOF
// Bulletproof: a ball or bomb move has no effect on the Pokémon, with its ability's popup and "It doesn't affect...".
// Soundproof's handler with the ballistic flag. Mold Breaker skips it (sMoldBreakerIgnoredAbilities)
static void HandlerBulletproof(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerMessageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_DEFENDER) == monId &&
        getMoveFlag(BattleEventVar_GetValue(BATTLE_EVENT_VAR_MOVE), MOVE_FLAG_BIT_BALLISTIC) &&
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_NO_EFFECT, TRUE)) {
        BattleHandler_PushRun(flow, BATTLE_HANDLER_ABILITY_POPUP_ADD, monId);
        param = BattleHandler_PushWork(flow, BATTLE_HANDLER_MESSAGE, monId);
        BattleHandler_StrSetup(&param->string, BATTLE_HANDLER_STR_SET, MESSAGE_DOESNT_AFFECT);
        BattleHandler_AddArg(&param->string, monId);
        BattleHandler_PopWork(flow, param);
        BattleHandler_PushRun(flow, BATTLE_HANDLER_ABILITY_POPUP_REMOVE, monId);
    }
}

static const BattleEventHandlerEntry sBulletproofHandlers[] = {
    { BATTLE_EVENT_CHECK_NO_EFFECT_AFTER_PROTECT, HandlerBulletproof },
};

const BattleEventHandlerEntry *PaperWhite2_EventAddBulletproof(u32 *priority) {
    *priority = NELEMS(sBulletproofHandlers);
    return sBulletproofHandlers;
}
#endif

#ifdef MOVE_BODY_PRESS
// Body Press attacks with the user's Defense, and its stages, in place of its Attack (Foul Play's shape, with the stat
// in place of the Pokémon)
static void HandlerBodyPress(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        BattleEventVar_RewriteValue(BATTLE_EVENT_VAR_ATTACK_STAT, BATTLEMON_DEFENSE);
    }
}

static const BattleEventHandlerEntry sBodyPressHandlers[] = {
    { BATTLE_EVENT_BEFORE_ATTACK_STAT, HandlerBodyPress },
};

const BattleEventHandlerEntry *PaperWhite2_EventAddBodyPress(u32 *priority) {
    *priority = NELEMS(sBodyPressHandlers);
    return sBodyPressHandlers;
}

u32 PaperWhite2_GetCriticalAttack(BattleMon *mon, u32 stat) {
    u32 stage;

    switch (stat) {
    case BATTLEMON_DEFENSE:
        stage = BATTLEMON_DEFENSE_STAGE;
        break;
    case BATTLEMON_SP_DEFENSE:
        stage = BATTLEMON_SP_DEFENSE_STAGE;
        break;
    default:
        return CritAtkDefLevel(mon, stat);
    }
    if (GetBattleMonStat(mon, stage) < BATTLEMON_STAT_STAGE_NEUTRAL) {
        return RawBattleMonStat(mon, stat);
    }
    return GetBattleMonStat(mon, stat);
}
#endif

#ifdef MOVE_FICKLE_BEAM
// The chance in 100 that Fickle Beam goes all out
#define FICKLE_BEAM_ALL_OUT_CHANCE 30

// Fickle Beam may go all out as it starts, with its message: work[0] says whether this use does
static void HandlerFickleBeamStart(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    BattleHandlerMessageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId) {
        work[0] = BattleRandom(100) < FICKLE_BEAM_ALL_OUT_CHANCE;
        if (work[0]) {
            param = BattleHandler_PushWork(flow, BATTLE_HANDLER_MESSAGE, monId);
            BattleHandler_StrSetup(&param->string, BATTLE_HANDLER_STR_SET, Bank0018_Text_GoingAllOut);
            BattleHandler_AddArg(&param->string, monId);
            BattleHandler_PopWork(flow, param);
        }
    }
}

// Then twice the power
static void HandlerFickleBeamPower(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId && work[0]) {
        BattleEventVar_MulValue(BATTLE_EVENT_VAR_POWER_RATIO, FX32_CONST(2));
    }
}

static const BattleEventHandlerEntry sFickleBeamHandlers[] = {
    { BATTLE_EVENT_MOVE_EXECUTE_START, HandlerFickleBeamStart },
    { BATTLE_EVENT_MOVE_POWER_RATIO, HandlerFickleBeamPower },
};

const BattleEventHandlerEntry *PaperWhite2_EventAddFickleBeam(u32 *priority) {
    *priority = NELEMS(sFickleBeamHandlers);
    return sFickleBeamHandlers;
}
#endif

#ifdef MOVE_DRAGON_CHEER
// Dragon Cheer raises the critical-hit stage of each of its targets, every ally (MOVE_TARGET_ALL_ALLIES), by one, or by
// two for a Dragon type, with Focus Energy's message. An ally already pumped up by Focus Energy, Dire Hit or Dragon
// Cheer is passed over, and with no ally raised the move fails
static void HandlerDragonCheer(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u32 count;
    u32 i;
    u8 allyId;
    BattleMon *ally;
    u32 stages;
    BattleHandlerMessageParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_ATTACKER) == monId) {
        count = BattleEventVar_GetValue(BATTLE_EVENT_VAR_TARGET_COUNT);
        for (i = 0; i < count; i++) {
            allyId = BattleEventVar_GetValue(BATTLE_EVENT_VAR_TARGET_1 + i);
            ally = GetBattleMon(flow, allyId);
            if (allyId == monId || GetAdditionalConditionFlag(ally, CONDITION_FLAG_PUMPED) ||
                BattleMon_GetCritStage(ally) != 0) {
                continue;
            }
            stages = DoesMonHaveType(ally, TYPE_DRAGON) ? 2 : 1;
            // No handler command adds a critical-hit stage, so it is the server's change and its command, as Dire
            // Hit 2's (BagItemDireHit)
            BattleMon_AddCritStage(ally, stages);
            BtlServerCmdQueue_Put(flow->queue, SC_OP_ADD_CRIT_STAGE, allyId, stages);
            param = BattleHandler_PushWork(flow, BATTLE_HANDLER_MESSAGE, monId);
            BattleHandler_StrSetup(&param->string, BATTLE_HANDLER_STR_SET, MESSAGE_GETTING_PUMPED);
            BattleHandler_AddArg(&param->string, allyId);
            BattleHandler_PopWork(flow, param);
        }
    }
}

static const BattleEventHandlerEntry sDragonCheerHandlers[] = {
    { BATTLE_EVENT_UNCATEGORIZED_MOVE, HandlerDragonCheer },
};

const BattleEventHandlerEntry *PaperWhite2_EventAddDragonCheer(u32 *priority) {
    *priority = NELEMS(sDragonCheerHandlers);
    return sDragonCheerHandlers;
}
#endif

// The syrup (CONDITION_SYRUP, the hack's own condition, which a move inflicts by its data, as Syrup Bomb) lowers the
// Pokémon's Speed by one at the end of each turn it lasts
void PaperWhite2_ConditionEndTurnSyrup(BtlServerFlow *flow, u8 monId) {
    BattleHandlerStatChangeParam *param;

    param = BattleHandler_PushWork(flow, BATTLE_HANDLER_STAT_CHANGE, monId);
    param->stat = BATTLEMON_SPEED_STAGE;
    param->change = -1;
    param->count = 1;
    param->monIds[0] = monId;
    BattleHandler_PopWork(flow, param);
}

#ifdef ABILITY_SWEET_SYRUP
// The Pokémon (a bit for each ID) that have used Sweet Syrup in this battle
static u32 sSweetSyrupUsed;

void PaperWhite2_BattleServerStart(void) {
    sSweetSyrupUsed = 0;
}

// Sweet Syrup: the first time the Pokémon enters the battle (or gets the ability), the adjacent foes' evasion falls by
// one, with the popup. Intimidate's handler, once a battle
static void HandlerSweetSyrup(BattleEventItem *item, BtlServerFlow *flow, u8 monId, s32 *work) {
    u8 *mons;
    u32 count;
    u32 i;
    BattleHandlerStatChangeParam *param;

    if (BattleEventVar_GetValue(BATTLE_EVENT_VAR_MON) == monId && !(sSweetSyrupUsed & (1 << monId))) {
        mons = BtlServerFlow_GetHandlerWork(flow, 6);
        count = HandlerGetAlivePartyCount(flow, ADJACENT_FOES_OF(BtlServerFlow_GetMonBattlePos(flow, monId)), mons);
        if (count != 0) {
            sSweetSyrupUsed |= 1 << monId;
            BattleHandler_PushRun(flow, BATTLE_HANDLER_ABILITY_POPUP_ADD, monId);
            param = BattleHandler_PushWork(flow, BATTLE_HANDLER_STAT_CHANGE, monId);
            param->stat = BATTLEMON_EVASION_STAGE;
            param->change = -1;
            param->unk0e = 1;
            param->count = count;
            for (i = 0; i < count; i++) {
                param->monIds[i] = mons[i];
            }
            BattleHandler_PopWork(flow, param);
            BattleHandler_PushRun(flow, BATTLE_HANDLER_ABILITY_POPUP_REMOVE, monId);
        }
    }
}

static const BattleEventHandlerEntry sSweetSyrupHandlers[] = {
    { BATTLE_EVENT_MEMBER_IN, HandlerSweetSyrup },
    { BATTLE_EVENT_CHANGE_ABILITY_AFTER, HandlerSweetSyrup },
};

const BattleEventHandlerEntry *PaperWhite2_EventAddSweetSyrup(u32 *priority) {
    *priority = NELEMS(sSweetSyrupHandlers);
    return sSweetSyrupHandlers;
}
#endif

#ifdef ABILITY_RIPEN
// Whether PaperWhite2_Ripen showed the popup that PaperWhite2_RipenEnd removes
static BOOL sRipenPopup;

static BOOL HasRipen(BtlServerFlow *flow, u8 monId) {
    return GetBattleMonStat(GetBattleMon(flow, monId), BATTLEMON_EFFECTIVE_ABILITY) == ABILITY_RIPEN;
}

s32 PaperWhite2_Ripen(BtlServerFlow *flow, u8 monId, s32 amount) {
    if (!HasRipen(flow, monId)) {
        return amount;
    }
    BattleHandler_PushRun(flow, BATTLE_HANDLER_ABILITY_POPUP_ADD, monId);
    sRipenPopup = TRUE;
    return amount * 2;
}

s32 PaperWhite2_RipenBerry(BtlServerFlow *flow, u8 monId, u16 item, s32 amount) {
    if (!PML_ItemIsBerry(item)) {
        return amount;
    }
    return PaperWhite2_Ripen(flow, monId, amount);
}

void PaperWhite2_RipenEnd(BtlServerFlow *flow, u8 monId) {
    if (sRipenPopup) {
        BattleHandler_PushRun(flow, BATTLE_HANDLER_ABILITY_POPUP_REMOVE, monId);
        sRipenPopup = FALSE;
    }
}

fx32 PaperWhite2_RipenResistRatio(BtlServerFlow *flow, u8 monId) {
    if (HasRipen(flow, monId)) {
        return FX32_CONST(0.25);
    }
    return FX32_CONST(0.5);
}
#endif
