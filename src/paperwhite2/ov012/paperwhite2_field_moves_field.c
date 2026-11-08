#include "types.h"
#include "constants/moves.h"
#include "field/field_script.h"
#include "field/hidden_event.h"
#include "field/player_action.h"
#include "paperwhite2/field_moves.h"
#include "system/game_data.h"
#include "system/game_system.h"
#include "system/vm.h"

// Paper White 2: the HMs' script command, PartyFieldMoveUser, and Fly from the Town Map, in overlay 12 beside the
// original's commands and the field's app calls. See include/paperwhite2/field_moves.h

// Fly's kind of CheckAllowHMEvent, its place in HM_EVENTS_NORMAL
#define HM_EVENT_FLY 4

BOOL Scrcmd_PaperWhite2_PartyFieldMoveUser(VM *vm, FieldScriptEnv *env) {
    u16 *result = ScriptReadVar(vm, env);
    u16 move = ScriptReadAny(vm, env);

    *result = PaperWhite2_FieldMoves_FindUser(GameData_GetParty(FieldScriptEnv_GetGameData(env)), move);
    return FALSE;
}

u32 PaperWhite2_FieldMoves_FindFlyUser(GameSystem *gsys, PlayerActionPossibilities *action) {
    if (CheckAllowHMEvent(HM_EVENT_FLY, action) != 0) {
        return FIELD_MOVE_NO_USER;
    }
    return PaperWhite2_FieldMoves_FindUser(GameData_GetParty(GSYS_GetGameData(gsys)), MOVE_FLY);
}
