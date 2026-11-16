#ifndef PAPERWHITE2_ENTRALINK_RUN_STATE_H
#define PAPERWHITE2_ENTRALINK_RUN_STATE_H

#include "types.h"
#include "struct_decls.h"

// Paper White 2: the Entralink run's state and its bag (paperwhite2/entralink_run.h), in ARM9 main
// (src/paperwhite2/main/paperwhite2_entralink_run_state.c), which no map change, battle or menu frees, and which the
// battle, the battle's return, the bag and the zone's weather reach. A run can't be saved mid-way, so the state is RAM
// only: loading a save or resetting finds no run.
//
// The run's bag: while a run is on, the game's bag (GameData_GetBag) is a bag of the run's own, empty at the start and
// emptied at the end, holding at most ENTRALINK_RUN_BAG_* items in the Items, Medicine and Berries pockets and nothing
// in the others. Everything that reads the bag (the bag screen, the party screen's Give and Take, the battle's bag,
// item NPCs) sees it with no other hook, and the real bag stays untouched in the save's block, which any save writes

// The most rooms a run has, the final's included
#define ENTRALINK_RUN_ROOMS_MAX 15
// The most enemies of a battle
#define ENTRALINK_RUN_ENEMIES_MAX 3
// A room's field weather when it keeps the zone's own
#define ENTRALINK_FIELD_WEATHER_ZONE 0xff
// No catchable enemy
#define ENTRALINK_CATCH_NONE 0xffff

// The run bag's slots in each pocket it has
#define ENTRALINK_RUN_BAG_ITEMS 32
#define ENTRALINK_RUN_BAG_MEDICINE 16
#define ENTRALINK_RUN_BAG_BERRIES 16

typedef struct {
    // The room the player is in, from 1, or 0 outside a run
    u8 room;
    u8 roomCount;
    // The rooms of the run in turn, by their place in res/paperwhite2/entralink/rooms/
    u8 order[ENTRALINK_RUN_ROOMS_MAX];
    // TRUE once the room's exits are open: one of its battles won, or none to fight
    u8 cleared;
    // The room's field weather, a WEATHER_* (system/zone_weather.h), or ENTRALINK_FIELD_WEATHER_ZONE
    u8 fieldWeather;
    // The NPC the player last talked to, by its place in the room, which is its actor's ID
    u8 talkedNpc;
    // A bit for each of the room's NPCs that came up as the player entered (its requirements and chance)
    u16 npcsSpawned;
    // A bit for each that has gone since: an item NPC that gave its item, the other battles' NPCs after a win
    u16 npcsGone;
    // The battle being fought: its catchable enemies' PIDs and catch progress ids (ENTRALINK_CATCH_NONE for none)
    u32 catchPids[ENTRALINK_RUN_ENEMIES_MAX];
    u16 catchIds[ENTRALINK_RUN_ENEMIES_MAX];
    // The PID of the enemy the battle caught, and whether it caught one
    u32 caughtPid;
    BOOL caught;
} EntralinkRunState;

// The run's state, which overlay 12's run code keeps
EntralinkRunState *EntralinkRun_GetState(void);
// The field weather of a run's room in a forest zone, or WEATHER_NONE (GetWeatherAll)
u32 EntralinkRun_GetFieldWeather(u32 zoneId);
// The battle's catches: whether the Nightmare Ball catches an enemy (by its PID) in the run's battle, and the battle
// caught one (ThrowBall, EventBattleReturn_Main)
BOOL EntralinkRun_IsCatchable(u32 pid);
void EntralinkRun_SetCaught(u32 pid);

// Makes the run's bag, emptied, the game's, unless it already is
void EntralinkRun_KeepBag(GameData *gameData);
// Makes the real bag the game's again and empties the run's, if the run's is the game's
void EntralinkRun_RestoreBag(GameData *gameData);
// Whether a bag is the run's
BOOL EntralinkRun_IsRunBag(BagSave *bag);
// The slots of a pocket of the run's bag (BagSave_GetItemHandleAddCheck)
u32 EntralinkRun_GetRunBagPocketMax(u32 pocket);

#endif // PAPERWHITE2_ENTRALINK_RUN_STATE_H
