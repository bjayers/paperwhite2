#ifndef PAPERWHITE2_ENTRALINK_RUN_ACTIONS_H
#define PAPERWHITE2_ENTRALINK_RUN_ACTIONS_H

// Paper White 2: the actions of the Entralink roguelike's script command, EntralinkRun action, arg1, arg2, result
// (include/paperwhite2/entralink_run.h), and what they return. Only #defines, since the scripts include it
// (res/field/scripts/global_10490.s). docs/paperwhite2/design/entralink-roguelike-prototype.md has the run

// arg1 the exit (MapChangeEntreeForest's, a DIR_*): returns ENTRALINK_RUN_EXIT_OPEN outside a run,
// ENTRALINK_RUN_EXIT_BACK for the exit the player came in by (which asks whether to go back to the hub), and for the
// others ENTRALINK_RUN_EXIT_OPEN once the room is done and a room is behind the exit's door, else
// ENTRALINK_RUN_EXIT_BLOCKED
#define ENTRALINK_RUN_ACTION_CAN_LEAVE 0
// Returns the species of the talked-to battle NPC's enemy, for its cry, or 0
#define ENTRALINK_RUN_ACTION_GET_SPECIES 1
// Starts the talked-to battle NPC's battle (its format, enemies and the room's weather); the script waits for it
#define ENTRALINK_RUN_ACTION_BATTLE 2
// After the battle: on a win or a capture, records it in the save's progress and opens the room's exits, and returns
// ENTRALINK_RUN_RESULT_CLEARED, or ENTRALINK_RUN_RESULT_RUN_WON after the final room, which ends the run. Any other
// end ends the run, puts the real party and bag back and returns ENTRALINK_RUN_RESULT_FORFEIT if the player ran (the
// battle's Yes/No forfeit), or ENTRALINK_RUN_RESULT_LOST (a loss, or any other end)
#define ENTRALINK_RUN_ACTION_BATTLE_RESULT 3
// Ends the run and warps to the hub's entrance; the script waits for the warp
#define ENTRALINK_RUN_ACTION_WARP_HUB 4
// Takes the talked-to NPC as the one the next actions are about, and returns its type (ENTRALINK_NPC_*,
// paperwhite2/entralink_run.h): ENTRALINK_RUN_NPC_BATTLE, _ITEM, _REST or _BUFF
#define ENTRALINK_RUN_ACTION_TALK 5
// arg1 0 for its before message, 1 for its after one: returns the message's number in the text bank
// SCRIPT_TEXT_ENTRALINK_DIALOGUE, or ENTRALINK_RUN_NO_MESSAGE
#define ENTRALINK_RUN_ACTION_DIALOGUE 6
// After a won battle's after message: the room's battle NPCs go away, and the room is done: its exits open and the
// markers in front of them show
#define ENTRALINK_RUN_ACTION_CLEAR_ROOM 7
// An item NPC: returns its item
#define ENTRALINK_RUN_ACTION_GET_ITEM 8
// An item NPC: puts its item in the run's bag and takes the NPC away; returns 0 if the bag had no room, which leaves it
#define ENTRALINK_RUN_ACTION_GIVE_ITEM 9
// Returns the actor of the NPC talked to, for its messages
#define ENTRALINK_RUN_ACTION_GET_ACTOR 10
// An item NPC: returns how many of its item it gives
#define ENTRALINK_RUN_ACTION_GET_ITEM_COUNT 11
// arg1 0 for its before message, 1 for its after one: shows the talked-to NPC's message in its window (its style:
// talk, bubble, yell or event), with the player's name in word 0 as the script set it, and the script waits for it to
// print; returns the message as ENTRALINK_RUN_ACTION_DIALOGUE does. MsgWinCloseAll closes any of the windows
#define ENTRALINK_RUN_ACTION_SHOW_DIALOGUE 12
// A rest or buff NPC after it has been talked to: it counts as used, and a room with no battle is done once every NPC
// that came up in it is used
#define ENTRALINK_RUN_ACTION_NPC_USED 13

#define ENTRALINK_RUN_RESULT_LOST 0
#define ENTRALINK_RUN_RESULT_CLEARED 1
#define ENTRALINK_RUN_RESULT_RUN_WON 2
#define ENTRALINK_RUN_RESULT_FORFEIT 3

// ENTRALINK_NPC_* of paperwhite2/entralink_run.h, for the scripts
#define ENTRALINK_RUN_NPC_BATTLE 0
#define ENTRALINK_RUN_NPC_ITEM 1
#define ENTRALINK_RUN_NPC_REST 2
#define ENTRALINK_RUN_NPC_BUFF 3

#define ENTRALINK_RUN_EXIT_BLOCKED 0
#define ENTRALINK_RUN_EXIT_OPEN 1
#define ENTRALINK_RUN_EXIT_BACK 2

// A room's exits, MapChangeEntreeForest's (the DIR_* of each): the north, east and west ones are forward doors, the
// bottom one is the exit every room is entered by, which leads back to the hub
#define ENTRALINK_RUN_NORTH_EXIT 0
#define ENTRALINK_RUN_BACK_EXIT 1
#define ENTRALINK_RUN_WEST_EXIT 2
#define ENTRALINK_RUN_EAST_EXIT 3

#define ENTRALINK_RUN_NO_MESSAGE 0xffff

#endif // PAPERWHITE2_ENTRALINK_RUN_ACTIONS_H
