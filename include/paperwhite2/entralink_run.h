#ifndef PAPERWHITE2_ENTRALINK_RUN_H
#define PAPERWHITE2_ENTRALINK_RUN_H

#include "types.h"
#include "field/field_script.h"
#include "nitro/fx.h"
#include "struct_decls.h"
#include "system/vm.h"

// Paper White 2: the Entralink roguelike's prototype (docs/paperwhite2/design/entralink-roguelike-prototype.md).
// Walking off the hub's top edge starts a run: rooms drawn from res/paperwhite2/entralink/run.json's pool in a random
// order, then its final challenge, each a room of the Entree Forest with the challenge's enemies standing in it.
// Talking to one starts the challenge's battle; winning opens the room's exits, any of which leads to the next room.
// The run's state is three saved variables (EVENT_WORK_ENTRALINK_RUN_*). Its code is
// src/paperwhite2/ov012/paperwhite2_entralink_run.c, in overlay 12 beside the Entree Forest's script commands, which
// call it; the data is paperwhite2/entralink_run_config.h, which tools/paperwhite2/entralink_run.py writes from
// res/paperwhite2/entralink/

// The battle formats of a challenge. A raid is a triple battle against one enemy, which stands in the center
#define ENTRALINK_FORMAT_SINGLE 0
#define ENTRALINK_FORMAT_DOUBLE 1
#define ENTRALINK_FORMAT_TRIPLE 2
#define ENTRALINK_FORMAT_RAID 3

// A challenge's weather when the battle keeps the field's
#define ENTRALINK_WEATHER_FIELD 0xff
// An enemy's ability when it keeps one of its species' two by its PID, and when it has its hidden one
#define ENTRALINK_ABILITY_SPECIES 0
#define ENTRALINK_ABILITY_HIDDEN 0xffff
// An enemy's gender, by its PID as wild Pokémon get it, or set
#define ENTRALINK_GENDER_RANDOM 0
#define ENTRALINK_GENDER_MALE 1
#define ENTRALINK_GENDER_FEMALE 2

// The most rooms a run draws from the pool: EVENT_WORK_ENTRALINK_RUN_ORDER holds a
// place in the pool a nibble
#define ENTRALINK_RUN_POOL_ROOMS_MAX 4

typedef struct {
    u16 species;
    u16 item;
    u16 moves[4];
    // An ABILITY_*, or ENTRALINK_ABILITY_SPECIES or ENTRALINK_ABILITY_HIDDEN
    u16 ability;
    u8 form;
    u8 level;
    // ENTRALINK_GENDER_*
    u8 gender;
    u8 shiny;
    // Where its actor stands in the room, in tiles, and the DIR_* it faces
    u8 x;
    u8 z;
    u8 direction;
} EntralinkEnemy;

typedef struct {
    // ENTRALINK_FORMAT_*
    u8 format;
    // A BTL_WEATHER_*, or ENTRALINK_WEATHER_FIELD
    u8 weather;
    u8 tier;
    // Its enemies in the enemy table
    u8 firstEnemy;
    u8 enemyCount;
} EntralinkChallenge;

// Starts a run as the player walks into the forest from the hub (CheckEntralinkForestFirstWarpEvent)
void EntralinkRun_Start(GameData *gameData);
// Whether a run is on
BOOL EntralinkRun_IsActive(GameData *gameData);
// The zone of the run's room, for the Entree Forest's warp (EventEntreeForestWarp_Callback)
u16 EntralinkRun_GetRoomZone(GameData *gameData);
// The event of an exit of a run's room (Scrcmd_EntreeForest_MapChangeEntreeForest): the next room, or the hub after the
// last
GameEvent *EntralinkRun_CreateExitEvent(GameSystem *gsys);
// Puts the room's enemies in it, unless its battle is won (Scrcmd_EntreeForest_EntreeForestSpawnAllPkm)
void EntralinkRun_SpawnRoom(GameSystem *gsys);

// Command 0x2f8, EntralinkRun action, arg1, arg2, result: runs one of the run's actions
// (ENTRALINK_RUN_ACTION_*, paperwhite2/entralink_run_actions.h), and puts what it returns in the variable result
BOOL Scrcmd_PaperWhite2_EntralinkRun(VM *vm, FieldScriptEnv *env);

#endif // PAPERWHITE2_ENTRALINK_RUN_H
