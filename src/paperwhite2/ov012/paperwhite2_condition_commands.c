#include "types.h"
#include "field/field_script.h"
#include "gfl/heap.h"
#include "gfl/random.h"
#include "paperwhite2/condition_commands.h"
#include "paperwhite2/condition_script.h"
#include "paperwhite2/conditions.h"
#include "system/game_data.h"
#include "system/game_system.h"
#include "system/vm.h"

// Paper White 2: the conditions' field script commands, GetPartyLevel and CheckCondition, in overlay 12 beside the
// original's commands. See include/paperwhite2/condition_commands.h

BOOL Scrcmd_PaperWhite2_GetPartyLevel(VM *vm, FieldScriptEnv *env) {
    u16 kind = ScriptReadAny(vm, env);
    u16 *result = ScriptReadVar(vm, env);
    ConditionContext ctx;

    ConditionContext_Init(&ctx);
    ConditionContext_FillParty(&ctx, GameData_GetParty(FieldScriptEnv_GetGameData(env)));
    switch (kind) {
    case PARTY_LEVEL_MEDIAN:
        *result = ctx.medianLevel;
        break;
    case PARTY_LEVEL_ADJUSTED:
        *result = ctx.scaledLevel;
        break;
    case PARTY_LEVEL_WILD_MIN:
        *result = Conditions_ScaledLevelMin(ctx.scaledLevel);
        break;
    case PARTY_LEVEL_WILD_MAX:
        *result = Conditions_ScaledLevelMax(ctx.scaledLevel);
        break;
    default:
        *result = 0;
        break;
    }
    return FALSE;
}

BOOL Scrcmd_PaperWhite2_CheckCondition(VM *vm, FieldScriptEnv *env) {
    u16 id = ScriptReadAny(vm, env);
    u16 *result = ScriptReadVar(vm, env);
    GameSystem *gsys = FieldScriptEnv_GetGameSystem(env);
    ConditionTable *table = Conditions_LoadTable(CONDITION_TABLE_MEMBER_SCRIPT, FieldScriptEnv_GetHeapID(env));
    ConditionContext ctx;
    u32 rng = GFL_RandomLC(0);

    *result = FALSE;
    if (table == NULL) {
        return FALSE;
    }
    if (id < table->ruleCount) {
        ConditionContext_Init(&ctx);
        ConditionContext_FillGame(&ctx, GSYS_GetGameData(gsys));
        if (GSYS_GetField(gsys) != NULL) {
            ConditionContext_FillField(&ctx, GSYS_GetField(gsys));
        }
        *result = Conditions_MatchRule(table, id, &ctx, &rng);
    }
    GFL_HeapFree(table);
    return FALSE;
}
