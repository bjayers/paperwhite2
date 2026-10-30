#ifndef PAPERWHITE2_CONDITION_COMMANDS_H
#define PAPERWHITE2_CONDITION_COMMANDS_H

#include "types.h"
#include "field/field_script.h"
#include "system/vm.h"

// Paper White 2: the conditions' field script commands (src/paperwhite2/ov012/paperwhite2_condition_commands.c), in
// every hack build, appended to EVCMD_TABLE (src/ov012/scrcmd_vm.c) after the original's last command, 0x2f2, and
// before the debug menu's. Their arguments are in paperwhite2/condition_script.h. See docs/paperwhite2/plugins.md,
// Conditions

// Command 0x2f3, GetPartyLevel kind, result: puts a PARTY_LEVEL_* of the party in the variable result, so a script
// scales its Pokémon by the adjusted median instead of the lead's level
BOOL Scrcmd_PaperWhite2_GetPartyLevel(VM *vm, FieldScriptEnv *env);
// Command 0x2f4, CheckCondition id, result: puts 1 in the variable result if the condition id (a SCRIPT_CONDITION_* of
// paperwhite2/script_conditions.h, a rule of res/paperwhite2/conditions/script_conditions.json) holds now, else 0. The
// context is the world, the lead (party slot 0), the party, and the field's exterior, terrain under the player and
// follower
BOOL Scrcmd_PaperWhite2_CheckCondition(VM *vm, FieldScriptEnv *env);

#endif // PAPERWHITE2_CONDITION_COMMANDS_H
