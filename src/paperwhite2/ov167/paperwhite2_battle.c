#include "types.h"
#include "constants/abilities.h"
#include "constants/moves.h"
#include "paperwhite2/abilities.h"
#include "paperwhite2/moves.h"

// Paper White 2: the battle's side of the added moves and abilities (docs/paperwhite2/design/moves-and-abilities.md):
// whose handlers each takes. Without added moves or abilities nothing calls these, so they aren't built and the ROM is
// the one before them

#if PAPERWHITE2_MOVE_ADDED_COUNT != 0
// Each added move's "handlers_like", or itself, from the first
static const u16 sMoveHandlersLike[PAPERWHITE2_MOVE_ADDED_COUNT] = { PAPERWHITE2_MOVE_HANDLERS_LIKE };

u16 PaperWhite2_GetMoveHandlersMove(u16 move) {
    if (!PaperWhite2_IsAddedMove(move)) {
        return move;
    }
    return sMoveHandlersLike[move - PAPERWHITE2_MOVE_FIRST_ADDED];
}
#endif

#if PAPERWHITE2_ABILITY_ADDED_COUNT != 0
// Each added ability's "handlers_like", or itself, from the first
static const u16 sAbilityHandlersLike[PAPERWHITE2_ABILITY_ADDED_COUNT] = { PAPERWHITE2_ABILITY_HANDLERS_LIKE };

u16 PaperWhite2_GetAbilityHandlersAbility(u16 ability) {
    if (!PaperWhite2_IsAddedAbility(ability)) {
        return ability;
    }
    return sAbilityHandlersLike[ability - PAPERWHITE2_ABILITY_FIRST_ADDED];
}
#endif
