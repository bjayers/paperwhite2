#ifndef PAPERWHITE2_ENTRALINK_RUN_H
#define PAPERWHITE2_ENTRALINK_RUN_H

#include "types.h"
#include "field/field_script.h"
#include "nitro/fx.h"
#include "struct_decls.h"
#include "system/vm.h"

// Paper White 2: the Entralink roguelike (docs/paperwhite2/design/entralink-roguelike-prototype.md). Walking off the
// hub's top edge starts a run: rooms of res/paperwhite2/entralink/rooms/ drawn at random for run.json's rounds, then
// a final room, each a room of the Entree Forest with its NPCs standing in it. Talking to a battle NPC starts its
// battle; winning one opens the room's exits, any but the one the player came in by leading to the next room. The
// run's state and bag are in ARM9 main (paperwhite2/entralink_run_state.h), its team the party's copies at level 100
// (paperwhite2/entralink_run_party.h), and what it unlocks for good in the save (paperwhite2/entralink_progress.h).
// Its code is src/paperwhite2/ov012/paperwhite2_entralink_run.c, in overlay 12 beside the Entree Forest's script
// commands, which call it; the data is paperwhite2/entralink_run_config.h, which tools/paperwhite2/entralink_run.py
// writes from res/paperwhite2/entralink/

// The battle formats. A raid is a triple battle against one enemy, which stands in the center
#define ENTRALINK_FORMAT_SINGLE 0
#define ENTRALINK_FORMAT_DOUBLE 1
#define ENTRALINK_FORMAT_TRIPLE 2
#define ENTRALINK_FORMAT_RAID 3

// A room's role: one of a round's rooms, a round's boss, or the run's final room
#define ENTRALINK_ROLE_ROOM 0
#define ENTRALINK_ROLE_BOSS 1
#define ENTRALINK_ROLE_FINAL 2

// What talking to an NPC does: its battle, an item into the run's bag, or (for now only its dialogue) a rest or a buff
#define ENTRALINK_NPC_BATTLE 0
#define ENTRALINK_NPC_ITEM 1
#define ENTRALINK_NPC_REST 2
#define ENTRALINK_NPC_BUFF 3

// The window an NPC's message shows in: the talk balloon with its tail at the NPC (ActorMsg), the tailless balloon
// across the bottom of the screen (InfoMsg), the spiky balloon at the NPC (ActorMsg's spiky frame), or the system
// window (SystemMsg)
#define ENTRALINK_STYLE_TALK 0
#define ENTRALINK_STYLE_BUBBLE 1
#define ENTRALINK_STYLE_YELL 2
#define ENTRALINK_STYLE_EVENT 3

// A room's weather when its battles keep the field's
#define ENTRALINK_WEATHER_FIELD 0xff
// An enemy's ability when it keeps one of its species' two by its PID, and when it has its hidden one
#define ENTRALINK_ABILITY_SPECIES 0
#define ENTRALINK_ABILITY_HIDDEN 0xffff
// An enemy's gender, by its PID as wild Pokémon get it, or set
#define ENTRALINK_GENDER_RANDOM 0
#define ENTRALINK_GENDER_MALE 1
#define ENTRALINK_GENDER_FEMALE 2
// No message or catch
#define ENTRALINK_NONE 0xffff
// A requirement that is a finished run, rather than a battle's progress id
#define ENTRALINK_REQUIRE_RUN_COMPLETED 0xffff

typedef struct {
    u16 species;
    u16 item;
    u16 moves[4];
    // An ABILITY_*, or ENTRALINK_ABILITY_SPECIES or ENTRALINK_ABILITY_HIDDEN
    u16 ability;
    // Its catch's progress id, or ENTRALINK_NONE if it can't be caught; its catch's requirements in the table
    u16 catchId;
    u16 firstRequirement;
    u8 form;
    u8 level;
    // ENTRALINK_GENDER_*
    u8 gender;
    u8 shiny;
    // Whether it can be caught only once
    u8 catchOnce;
    u8 requirementCount;
} EntralinkEnemy;

typedef struct {
    // ENTRALINK_FORMAT_*
    u8 format;
    u8 enemyCount;
    // Its enemies in the enemy table
    u16 firstEnemy;
    // Its bit in the save's battles won
    u16 progressId;
} EntralinkBattle;

typedef struct {
    // An item NPC's item, and its sprite (an OBJ_CODE_*, or 0 for a battle NPC's enemy's walking Pokémon)
    u16 item;
    u16 sprite;
    // Its requirements in the table
    u16 firstRequirement;
    // Its messages in the text bank SCRIPT_TEXT_ENTRALINK_DIALOGUE, or ENTRALINK_NONE: on talking, and after its
    // battle is won
    u16 before;
    u16 after;
    // ENTRALINK_NPC_*
    u8 type;
    // A battle NPC's battle, in the room's, and the enemy it shows
    u8 battle;
    u8 enemy;
    // How many of its item an item NPC gives
    u8 count;
    // Its chance to spawn, in percent
    u8 chance;
    // Its tile and the DIR_* it faces
    u8 x;
    u8 z;
    u8 direction;
    u8 requirementCount;
    // Its messages' windows, ENTRALINK_STYLE_*
    u8 beforeStyle;
    u8 afterStyle;
} EntralinkNpc;

typedef struct {
    // ENTRALINK_ROLE_*
    u8 role;
    // A bit for each round it is kept to (round 1 the lowest), or 0 for any
    u8 rounds;
    // A BTL_WEATHER_*, or ENTRALINK_WEATHER_FIELD
    u8 weather;
    // A WEATHER_*, or ENTRALINK_FIELD_WEATHER_ZONE (paperwhite2/entralink_run_state.h)
    u8 fieldWeather;
    // Its battles and NPCs in their tables
    u16 firstBattle;
    u8 battleCount;
    u16 firstNpc;
    u8 npcCount;
} EntralinkRoom;

typedef struct {
    // How many rooms it draws, and whether a boss ends it
    u8 rooms;
    u8 boss;
} EntralinkRound;

// Starts a run as the player walks into the forest from the hub (CheckEntralinkForestFirstWarpEvent)
void EntralinkRun_Start(GameData *gameData);
// Whether a run is on
BOOL EntralinkRun_IsActive(GameData *gameData);
// The zone of the run's room, for the Entree Forest's warp (EventEntreeForestWarp_Callback)
u16 EntralinkRun_GetRoomZone(GameData *gameData);
// The event of an exit of a run's room (Scrcmd_EntreeForest_MapChangeEntreeForest): the next room, or the hub after the
// last
GameEvent *EntralinkRun_CreateExitEvent(GameSystem *gsys);
// Puts the room's NPCs in it, those that came up as the player entered and are still there
// (Scrcmd_EntreeForest_EntreeForestSpawnAllPkm)
void EntralinkRun_SpawnRoom(GameSystem *gsys);
// Ends a run that the player has left by any other way than its own, as each map loads (ZoneChange_OnFieldLoad)
void EntralinkRun_OnFieldLoad(GameData *gameData, u16 zoneId);

// Command 0x2f8, EntralinkRun action, arg1, arg2, result: runs one of the run's actions
// (ENTRALINK_RUN_ACTION_*, paperwhite2/entralink_run_actions.h), and puts what it returns in the variable result
BOOL Scrcmd_PaperWhite2_EntralinkRun(VM *vm, FieldScriptEnv *env);

#endif // PAPERWHITE2_ENTRALINK_RUN_H
