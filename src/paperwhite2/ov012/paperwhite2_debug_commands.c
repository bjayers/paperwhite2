#include "types.h"
#include "constants/pokemon.h"
#include "field/field_script.h"
#include "field/scrcmd_pokemon.h"
#include "paperwhite2/debug_commands.h"
#include "pml/poke_party.h"
#include "system/vm.h"

// Paper White 2: the field script commands of the debug menu, in overlay 12 beside the original's commands of the
// party (scrcmd_pokemon.c). See include/paperwhite2/debug_commands.h

#ifdef PAPERWHITE2_DEBUG_MENU
// An effort value's highest value: its field is a byte
#define EV_MAX 255

BOOL Scrcmd_PaperWhite2_PokePartySetEV(VM *vm, FieldScriptEnv *env) {
    u16 index = ScriptReadAny(vm, env);
    u16 param = ScriptReadAny(vm, env);
    u16 value = ScriptReadAny(vm, env);
    PartyPkm *pkm;

    if (param < PKM_PARAM_EV_HP || param > PKM_PARAM_EV_SP_DEFENSE || value > EV_MAX) {
        return FALSE;
    }
    if (CheckGetPartyPokemon(env, index, &pkm) == TRUE) {
        PokeParty_SetParam(pkm, param, value);
        PokeParty_RecalcStats(pkm);
    }
    return FALSE;
}
#endif
