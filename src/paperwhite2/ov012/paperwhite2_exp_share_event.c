#include "types.h"
#include "field/field_script_event.h"
#include "gfl/heap.h"
#include "paperwhite2/exp_share.h"

// Paper White 2: the field's common event of the Exp. Share, in overlay 12 beside the original's common events
// (itemuse_event.c), which the Y button's shortcut starts. Its script turns the Exp. Share on or off and says so

GameEvent *PaperWhite2_EventToggleExpShare_Create(Field *field, GameSystem *gsys) {
    return EventScriptCall_Create(gsys, SCRID_EXP_SHARE_TOGGLE, NULL, HEAPID_FIELDMAP);
}
