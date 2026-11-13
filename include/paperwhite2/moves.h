#ifndef PAPERWHITE2_MOVES_H
#define PAPERWHITE2_MOVES_H

#include "types.h"
#include "paperwhite2/moves_config.h"

// Paper White 2: the moves the hack adds (docs/paperwhite2/design/moves-and-abilities.md). generated/moves.txt appends
// them after Fusion Bolt, from PAPERWHITE2_MOVE_FIRST_ADDED (560); tools/data/move_list.py is the same definition for
// the tools, and tools/paperwhite2/moves.py generates PAPERWHITE2_MOVE_ADDED_COUNT, PAPERWHITE2_MOVE_COUNT (every move
// ID, MOVE_NONE's included) and the added moves' tables.
//
// Without added moves the lookups below are the move itself, so each hook is the original code.

// Whether a move is one the hack adds
static inline BOOL PaperWhite2_IsAddedMove(u32 move) {
    return move - PAPERWHITE2_MOVE_FIRST_ADDED < PAPERWHITE2_MOVE_ADDED_COUNT;
}

#if PAPERWHITE2_MOVE_ADDED_COUNT != 0
// The move whose animation a move plays: an added move's "animation", since the battle view takes an ID past 560 for
// one of its own effect animations (BTLV_EFFECT_FIRST); any other move's own
u16 PaperWhite2_GetMoveAnimation(u16 move);
// The move whose battle handlers a move takes in sMoveEventAddTable: an added move's "handlers_like", or else its own
// (a row the hack's battle code adds, if any); any other move's own
u16 PaperWhite2_GetMoveHandlersMove(u16 move);
#else
#define PaperWhite2_GetMoveAnimation(move) (move)
#define PaperWhite2_GetMoveHandlersMove(move) (move)
#endif

#endif // PAPERWHITE2_MOVES_H
