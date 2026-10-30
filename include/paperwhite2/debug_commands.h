#ifndef PAPERWHITE2_DEBUG_COMMANDS_H
#define PAPERWHITE2_DEBUG_COMMANDS_H

#include "types.h"
#include "field/field_script.h"
#include "system/vm.h"

// Paper White 2: the field script commands of the debug menu (res/field/scripts/global_10130.s), appended to
// EVCMD_TABLE (src/ov012/scrcmd_vm.c) after the original's last command, 0x2f2, under PAPERWHITE2_DEBUG_MENU. Their
// code is src/paperwhite2/ov012/paperwhite2_debug_commands.c

#ifdef PAPERWHITE2_DEBUG_MENU
// Command 0x2f3, PokePartySetEV slot, param, value: sets an effort value of the party's Pokémon in that slot, then
// recalculates its stats as the game does after a battle. param is one of PKM_PARAM_EV_HP to PKM_PARAM_EV_SP_DEFENSE
// and value at most 255; any other param or value, or an empty slot, does nothing. The 510 total isn't enforced, so a
// Pokémon can be put over it to test that
BOOL Scrcmd_PaperWhite2_PokePartySetEV(VM *vm, FieldScriptEnv *env);
#endif

#endif // PAPERWHITE2_DEBUG_COMMANDS_H
