#ifndef PAPERWHITE2_EXP_SHARE_H
#define PAPERWHITE2_EXP_SHARE_H

#include "types.h"
#include "struct_decls.h"

// Paper White 2: the Exp. Share as a key item that the player turns on and off, as in Gen 6. Its state
// (src/paperwhite2/main/paperwhite2_exp_share.c) is in ARM9 main for the bag, the field and the battle: it is on while
// the bag has it and EVENT_FLAG_EXP_SHARE_OFF is clear, so it starts on when the player receives it. The common event
// is in overlay 12 (src/paperwhite2/ov012/paperwhite2_exp_share_event.c)

// The field's common event that turns it on or off from the Y button (FIELD_COMMON_EVENT_EXP_SHARE), and the script
// it runs, Script_19 of res/field/scripts/global_2800.s
#define SCRID_EXP_SHARE_TOGGLE 2818

BOOL PaperWhite2_IsExpShareOn(GameData *gameData);
// Turns it on or off, and returns whether it is on now
BOOL PaperWhite2_ToggleExpShare(GameData *gameData);
// The field's common event that turns it on or off and says so
GameEvent *PaperWhite2_EventToggleExpShare_Create(Field *field, GameSystem *gsys);

#endif // PAPERWHITE2_EXP_SHARE_H
