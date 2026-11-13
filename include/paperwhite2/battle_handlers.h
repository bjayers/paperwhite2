#ifndef PAPERWHITE2_BATTLE_HANDLERS_H
#define PAPERWHITE2_BATTLE_HANDLERS_H

#include "types.h"
#include "battle/btl_event.h"

// Paper White 2: the battle handlers of the moves and abilities the hack adds, in
// src/paperwhite2/ov167/paperwhite2_battle.c (docs/paperwhite2/design/moves-and-abilities.md). move_handlers.c's
// sMoveEventAddTable and ability_handlers.c's sAbilityEventAddTable have a row for each, built while the move or
// ability is in generated/moves.txt or generated/abilities.txt, so that without them the ROM is the one before

// Grav Apple: 1.5 times the power while Gravity is in effect
const BattleEventHandlerEntry *PaperWhite2_EventAddGravApple(u32 *priority);
// Bulletproof: no effect from ball and bomb moves (MOVE_FLAG_BALLISTIC)
const BattleEventHandlerEntry *PaperWhite2_EventAddBulletproof(u32 *priority);

#endif // PAPERWHITE2_BATTLE_HANDLERS_H
