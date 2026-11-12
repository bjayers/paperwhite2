#include "types.h"
#include "field/field_script.h"
#include "paperwhite2/pokemon_center.h"
#include "paperwhite2/pokemon_center_commands.h"
#include "paperwhite2/pokemon_center_config.h"
#include "save/save_control.h"
#include "system/game_data.h"
#include "system/vm.h"

// Paper White 2: the Pokémon Center attendants' script command, PokemonCenter, in overlay 12 beside the original's
// commands. See include/paperwhite2/pokemon_center_commands.h

// The most a variable holds
#define VAR_VALUE_MAX 0xffff

// The fees, from res/paperwhite2/pokemon_center/services.json (paperwhite2/pokemon_center_config.h)
static const u32 sFees[POKEMON_CENTER_FEE_COUNT] = { POKEMON_CENTER_FEES };

// Fee id plus extra, or extra alone for an id that isn't a fee
static u32 PokemonCenterCommands_GetFee(u16 id, u16 extra) {
    if (id >= POKEMON_CENTER_FEE_COUNT) {
        return extra;
    }
    return sFees[id] + extra;
}

BOOL Scrcmd_PaperWhite2_PokemonCenter(VM *vm, FieldScriptEnv *env) {
    u16 action = ScriptReadAny(vm, env);
    u16 arg1 = ScriptReadAny(vm, env);
    u16 arg2 = ScriptReadAny(vm, env);
    u16 *result = ScriptReadVar(vm, env);
    TrainerGameInfoSave *info = getTrainerCardDataBlkAddress(FieldScriptEnv_GetGameData(env));
    u32 amount = PokemonCenterCommands_GetFee(arg1, arg2);

    switch (action) {
    case POKEMON_CENTER_ACTION_GET_FEE:
        *result = amount > VAR_VALUE_MAX ? VAR_VALUE_MAX : amount;
        break;
    case POKEMON_CENTER_ACTION_PAY_FEE:
        if (getCash(info) < amount) {
            *result = FALSE;
            break;
        }
        subCashFromTotal(info, amount);
        *result = TRUE;
        break;
    default:
        *result = 0;
        break;
    }
    return FALSE;
}
