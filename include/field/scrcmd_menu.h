#ifndef POKEBW2_FIELD_SCRCMD_MENU_H
#define POKEBW2_FIELD_SCRCMD_MENU_H

// Overlay 36's scrcmd_menu.c: the script commands of the yes/no window and the list menus. Names from swan
// (https://github.com/ds-pokemon-hacking/swan, GPL-3.0)

#include "types.h"
#include "struct_decls.h"
#include "system/game_event.h"
#include "system/vm.h"

typedef struct {
    FieldScriptEnv *env;
    // Set to whether the player chose no
    u16 *result;
    ListMenuUI *window;
} YesNoEvent;

BOOL Scrcmd_Menu_YesNoWin(VM *vm, FieldScriptEnv *env);
BOOL Scrcmd_Menu_ListMenuInitCommon(VM *vm, FieldScriptEnv *env);
BOOL Scrcmd_Menu_ListMenuAnchorTopLeft(VM *vm, FieldScriptEnv *env);
BOOL Scrcmd_Menu_ListMenuAnchorTopRight(VM *vm, FieldScriptEnv *env);
BOOL Scrcmd_Menu_ListMenuAdd(VM *vm, FieldScriptEnv *env);
BOOL Scrcmd_Menu_ListMenuShow(VM *vm, FieldScriptEnv *env);
BOOL Scrcmd_Menu_ListMenuShow2(VM *vm, FieldScriptEnv *env);

#ifdef PAPERWHITE2
// Paper White 2: overlay 36's scrcmd_menu.c, for the Following Pokémon
BOOL PaperWhite2_IsYesNoEventCallback(GameEventCallback callback);
BOOL PaperWhite2_IsListMenuEventCallback(GameEventCallback callback);
#endif
#endif // POKEBW2_FIELD_SCRCMD_MENU_H
