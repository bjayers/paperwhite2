#include "types.h"
#include "battle/btl_event.h"
#include "battle/btl_field.h"
#include "battle/btl_handler.h"
#include "constants/abilities.h"
#include "constants/battle.h"
#include "constants/moves.h"
#include "gfl/std.h"
#include "paperwhite2/abilities.h"
#include "paperwhite2/battle_handlers.h"
#include "paperwhite2/moves.h"
#include "pml/move.h"

// Paper White 2: the battle's side of the added moves and abilities (docs/paperwhite2/design/moves-and-abilities.md):
// whose handlers each takes, and the handlers of the ones whose rules are new. Without added moves or abilities nothing
// here is built, so the ROM is the one before them; each move's or ability's handlers are built while its constant
// exists

// getMoveFlag's bit of MOVE_FLAG_BALLISTIC
#define MOVE_FLAG_BIT_BALLISTIC 14
// The set message "It doesn't affect [the Pokémon]...", Soundproof's
#define MESSAGE_DOESNT_AFFECT 0xd2

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
