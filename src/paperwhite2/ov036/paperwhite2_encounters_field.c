#include "types.h"
#include "field/field.h"
#include "paperwhite2/conditions.h"
#include "paperwhite2/encounters.h"
#include "system/game_system.h"

// Paper White 2: the wild encounters' field part, in overlay 36 beside the field's context fill. See
// include/paperwhite2/encounters.h

static void FillContext(ConditionContext *ctx, Field *field) {
    ConditionContext_Init(ctx);
    ConditionContext_FillGame(ctx, GSYS_GetGameData(Field_GetGameSystem(field)));
    ConditionContext_FillField(ctx, field);
}

void PaperWhite2_EncountersField_SetContext(Field *field) {
    ConditionContext ctx;

    FillContext(&ctx, field);
    PaperWhite2_Encounters_SetFieldContext(&ctx);
}

void PaperWhite2_EncountersField_SaveViewContext(Field *field) {
    ConditionContext ctx;

    FillContext(&ctx, field);
    PaperWhite2_Encounters_SaveViewContext(&ctx);
}
