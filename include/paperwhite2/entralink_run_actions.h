#ifndef PAPERWHITE2_ENTRALINK_RUN_ACTIONS_H
#define PAPERWHITE2_ENTRALINK_RUN_ACTIONS_H

// Paper White 2: the actions of the Entralink roguelike's script command, EntralinkRun action, arg1, arg2, result
// (include/paperwhite2/entralink_run.h), and what they return. Only #defines, since the scripts include it
// (res/field/scripts/global_10490.s). docs/paperwhite2/design/entralink-roguelike-prototype.md has the run

// Returns 1 if the room's exits may be used: outside a run, or once the room's battle is won
#define ENTRALINK_RUN_ACTION_CAN_LEAVE 0
// Returns the species of the room's first enemy, for its cry, or 0 outside a run
#define ENTRALINK_RUN_ACTION_GET_SPECIES 1
// Starts the room's battle (its challenge's format, enemies and weather); the script waits for it
#define ENTRALINK_RUN_ACTION_BATTLE 2
// After the battle: on a win, removes the room's enemies and opens its exits, and returns
// ENTRALINK_RUN_RESULT_CLEARED, or ENTRALINK_RUN_RESULT_RUN_WON after the final room, which ends the run. Any other
// end (a loss, running away) ends the run, heals the party and returns ENTRALINK_RUN_RESULT_LOST
#define ENTRALINK_RUN_ACTION_BATTLE_RESULT 3
// Ends the run and warps to the hub's entrance; the script waits for the warp
#define ENTRALINK_RUN_ACTION_WARP_HUB 4

#define ENTRALINK_RUN_RESULT_LOST 0
#define ENTRALINK_RUN_RESULT_CLEARED 1
#define ENTRALINK_RUN_RESULT_RUN_WON 2

#endif // PAPERWHITE2_ENTRALINK_RUN_ACTIONS_H
