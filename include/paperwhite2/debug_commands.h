#ifndef PAPERWHITE2_DEBUG_COMMANDS_H
#define PAPERWHITE2_DEBUG_COMMANDS_H

#include "types.h"
#include "field/field_script.h"
#include "system/vm.h"

// Paper White 2: the field script command of the debug menu (res/field/scripts/global_10200.s), appended to
// EVCMD_TABLE (src/ov012/scrcmd_vm.c) after the original's last command, 0x2f2, and the conditions' two
// (paperwhite2/condition_commands.h), under PAPERWHITE2_DEBUG_MENU. Its code
// is src/paperwhite2/ov012/paperwhite2_debug_commands.c

#ifdef PAPERWHITE2_DEBUG_MENU
// Command 0x2f5, Debug action, arg1, arg2, result: runs one of the debug menu's actions (DEBUG_ACTION_*,
// paperwhite2/debug_actions.h) with its two arguments, each a value or a variable, and puts what it returns in the
// variable result. One command serves every action, so a new option needs no new command, only a new action. A warp
// action waits a frame, as the map change commands do, and the script ends after it
BOOL Scrcmd_PaperWhite2_Debug(VM *vm, FieldScriptEnv *env);
#endif

#endif // PAPERWHITE2_DEBUG_COMMANDS_H
