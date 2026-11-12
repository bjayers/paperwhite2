#ifndef PAPERWHITE2_POKEMON_CENTER_COMMANDS_H
#define PAPERWHITE2_POKEMON_CENTER_COMMANDS_H

#include "types.h"
#include "field/field_script.h"
#include "system/vm.h"

// Paper White 2: the field script command of the Pokémon Centers' upstairs attendants
// (docs/paperwhite2/design/pokemon-center.md), appended to EVCMD_TABLE (src/ov012/scrcmd_vm.c) in every hack build.
// Its code is src/paperwhite2/ov012/paperwhite2_pokemon_center_commands.c

// Command 0x2f7, PokemonCenter action, arg1, arg2, result: runs one of the attendants' actions
// (POKEMON_CENTER_ACTION_*, paperwhite2/pokemon_center.h) with its two arguments, each a value or a variable, and
// puts what it returns in the variable result. The fees are res/paperwhite2/pokemon_center/services.json's, and money
// is counted in 32 bits, so a fee may be more than a variable holds
BOOL Scrcmd_PaperWhite2_PokemonCenter(VM *vm, FieldScriptEnv *env);

#endif // PAPERWHITE2_POKEMON_CENTER_COMMANDS_H
