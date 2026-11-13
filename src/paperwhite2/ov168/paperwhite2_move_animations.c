#include "types.h"
#include "constants/moves.h"
#include "paperwhite2/moves.h"

// Paper White 2: the added moves' animations (docs/paperwhite2/design/moves-and-abilities.md section 2.6). The effect
// VM (BtlvEffvm_Start) loads a move's script from archive 65 by its ID below BTLV_EFFECT_FIRST (561) and one of its own
// effects from archive 66 above, where 560 is a placeholder, so an added move plays an original move's script, which
// brings its sounds. Without added moves nothing calls this, so it isn't built and the ROM is the one before it

#if PAPERWHITE2_MOVE_ADDED_COUNT != 0
// The original move whose animation each added move plays, from the first
static const u16 sMoveAnimations[PAPERWHITE2_MOVE_ADDED_COUNT] = { PAPERWHITE2_MOVE_ANIMATIONS };

u16 PaperWhite2_GetMoveAnimation(u16 move) {
    if (!PaperWhite2_IsAddedMove(move)) {
        return move;
    }
    return sMoveAnimations[move - PAPERWHITE2_MOVE_FIRST_ADDED];
}
#endif
