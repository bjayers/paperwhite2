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
// battle; winning one opens the room's exits. Entering a room draws the rooms behind its north, east and west doors,
// shown by markers on the ground once it is done (paperwhite2/entralink_markers.h), and the door taken decides. The
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

// A room's role: one of a round's rooms, a round's boss, or the run's final room. A place of the run can also be the
// pre-boss rest before a boss or the final room (the template ENTRALINK_RUN_PRE_BOSS_REST), which no room's role is
#define ENTRALINK_ROLE_ROOM 0
#define ENTRALINK_ROLE_BOSS 1
#define ENTRALINK_ROLE_FINAL 2
#define ENTRALINK_ROLE_PRE_BOSS 3

// A room of role room's type, which its round's weights draw for a door (EntralinkRound's typeWeights, in this order):
// enemy, enemy choice (several battles to choose from, step 7), challenge and event rooms are rooms/'s, rest, item,
// buff and shop rooms rooms/'s at run.json's custom chance and else their type's template
#define ENTRALINK_TYPE_ENEMY 0
#define ENTRALINK_TYPE_CHALLENGE 1
#define ENTRALINK_TYPE_REST 2
#define ENTRALINK_TYPE_ITEM 3
#define ENTRALINK_TYPE_BUFF 4
#define ENTRALINK_TYPE_SHOP 5
#define ENTRALINK_TYPE_EVENT 6
#define ENTRALINK_TYPE_ENEMY_CHOICE 7
#define ENTRALINK_TYPE_COUNT 8
// The most rounds a run has (run.json's rounds)
#define ENTRALINK_RUN_ROUNDS_MAX 3
// The most rooms of role room a run has (8 a round), the size of a stat's table of room percents
#define ENTRALINK_RUN_SCALED_ROOMS_MAX 32
// Any type: a boss or final room's draw
#define ENTRALINK_TYPE_ANY 0xff

// What talking to an NPC does: its battle, an item into the run's bag, (for now only its dialogue) a rest or a buff,
// healing the Pokémon that haven't fainted, reviving a fainted one, a choice of 3 cards (items and buffs), a shop
// selling items and buffs for Dream Dust (step 7), an item room's ball, whose item is drawn as the room is entered, and
// a buff ball, the room's offer of buffs (paperwhite2/entralink_buffs.h). Using
// one of the choice NPCs (ENTRALINK_NPC_HEAL to ENTRALINK_NPC_SWAP; the shop by talking to it) is the room's
// choice: the room's other choice NPCs go and it is done
#define ENTRALINK_NPC_BATTLE 0
#define ENTRALINK_NPC_ITEM 1
#define ENTRALINK_NPC_REST 2
#define ENTRALINK_NPC_BUFF 3
#define ENTRALINK_NPC_HEAL 4
#define ENTRALINK_NPC_REVIVE 5
#define ENTRALINK_NPC_GIFT 6
#define ENTRALINK_NPC_SHOP 7
#define ENTRALINK_NPC_ITEM_CHOICE 8
#define ENTRALINK_NPC_BUFF_CHOICE 9
// Phase 7 of the buffs: a rest stop's swap, a Pokémon of the Reserve Box (paperwhite2/entralink_reserve.h) into the
// team for Dream Dust in place of a copy, a choice NPC too
#define ENTRALINK_NPC_SWAP 10
// An ambient: an actor with nothing to say, which reacts as the player comes near
// (src/paperwhite2/ov012/paperwhite2_entralink_ambients.c): it fades out (and with a return distance fades back in),
// or runs away and fades. It never keeps the room from being done
#define ENTRALINK_NPC_AMBIENT 11

// What an ambient NPC does when the player comes within its near distance: fades out where it stands, or turns and
// runs away from the player, fading as it goes
#define ENTRALINK_AMBIENT_FADE 0
#define ENTRALINK_AMBIENT_FLEE 1

// The item table's pools, bits of EntralinkItem's pools: an item room's balls, a gift NPC's choice, a shop's goods,
// and the items on the ground and hidden in a room
#define ENTRALINK_POOL_ITEM_ROOM 0
#define ENTRALINK_POOL_GIFT 1
#define ENTRALINK_POOL_SHOP 2
#define ENTRALINK_POOL_GROUND 3
// An item without a bag icon over an item room's ball
#define ENTRALINK_ICON_NONE 0xff

// Dream Dust, the run's currency (step 7): what winning a battle gives, by its room (run.json's dust, in this order:
// ENTRALINK_RUN_DUST), times its round's percent (dust_round_percent). A battle of a room of any other type (a bonus
// battle in a rest room) gives an enemy room's
#define ENTRALINK_DUST_ENEMY 0
#define ENTRALINK_DUST_ENEMY_CHOICE 1
#define ENTRALINK_DUST_CHALLENGE 2
#define ENTRALINK_DUST_BOSS 3
#define ENTRALINK_DUST_FINAL 4
#define ENTRALINK_DUST_KINDS 5
// The most Dream Dust the run holds
#define ENTRALINK_DUST_MAX 65535

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

// The markers on the ground in front of a cleared room's forward doors, which say what is behind each: a room's own
// (EntralinkRoom's marker), or catch instead of enemy, enemy choice, challenge or boss while one of its enemies can be
// caught and the run's bag holds a Nightmare Ball. Their art is in the model table from ENTRALINK_RUN_MARKER_FILE, in
// this order
#define ENTRALINK_MARKER_ENEMY 0
#define ENTRALINK_MARKER_CHALLENGE 1
#define ENTRALINK_MARKER_BOSS 2
#define ENTRALINK_MARKER_REST 3
#define ENTRALINK_MARKER_GIFT 4
#define ENTRALINK_MARKER_EVENT 5
#define ENTRALINK_MARKER_SHOP 6
#define ENTRALINK_MARKER_UNKNOWN 7
#define ENTRALINK_MARKER_FINAL 8
#define ENTRALINK_MARKER_CATCH 9
#define ENTRALINK_MARKER_ENEMY_CHOICE 10
// No marker, on the ground or over an NPC
#define ENTRALINK_MARKER_NONE 0xff
#define ENTRALINK_NPC_MARKER_NONE 0xff
// An NPC "marker" that is an item's bag icon, ENTRALINK_NPC_MARKER_ICON | its icon (EntralinkItem's), over an item
// room's ball
#define ENTRALINK_NPC_MARKER_ICON 0x80

// A room's forward doors (south is the back door), each with a room behind it once the player is in the room
#define ENTRALINK_DOOR_NORTH 0
#define ENTRALINK_DOOR_EAST 1
#define ENTRALINK_DOOR_WEST 2
#define ENTRALINK_DOOR_COUNT 3
// No door: the back door, or a forward door with no room behind it
#define ENTRALINK_DOOR_NONE 0xff
// No pre-boss map in run.json: the room before a boss is in the room maps, with only its north door open
#define ENTRALINK_PRE_BOSS_ZONE_NONE 0xffff

typedef struct {
    u16 species;
    u16 item;
    u16 moves[4];
    // An ABILITY_*, or ENTRALINK_ABILITY_SPECIES or ENTRALINK_ABILITY_HIDDEN
    u16 ability;
    // Its catch's progress id, or ENTRALINK_NONE if it can't be caught; its catch's requirements in the table
    u16 catchId;
    u16 firstRequirement;
    // Its own multiplier in percent on its stats, on top of the run's depth's (phase 5)
    u16 scale;
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
    // An item NPC's item, and its sprite (an OBJ_CODE_*; the packer gives a battle NPC without one its enemy's walking
    // Pokémon, and 0 looks that up in the game's walking table, which has the original's species only)
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
    // The icon over its head: an NPC marker (ENTRALINK_NPC_MARKER_* of the config), or ENTRALINK_NPC_MARKER_NONE
    u8 marker;
    // An ambient's: ENTRALINK_AMBIENT_*, the tiles from the player at which it reacts, the tiles at which a faded one
    // comes back (0: it doesn't), and the tiles a fleeing one runs
    u8 behaviour;
    u8 near;
    u8 far;
    u8 distance;
} EntralinkNpc;

typedef struct {
    // ENTRALINK_ROLE_*
    u8 role;
    // A bit for each round it is kept to (round 1 the lowest), or 0 for any
    u8 rounds;
    // Its battles' BTL_WEATHER_*, or ENTRALINK_WEATHER_FIELD
    u8 weather;
    // The marker in front of a door leading to it, ENTRALINK_MARKER_*
    u8 marker;
    // Its type, ENTRALINK_TYPE_*, and whether it is a template (templates/), which is never in a pool
    u8 type;
    u8 isTemplate;
    // Its battles and NPCs in their tables
    u16 firstBattle;
    u8 battleCount;
    u16 firstNpc;
    u8 npcCount;
    // Whether it is a random room's row (an enemy or an enemy choice room), whose battles, enemies and NPCs are made
    // as the player enters it (paperwhite2/entralink_random_rooms.h) rather than the tables'
    u8 random;
} EntralinkRoom;

typedef struct {
    // How many rooms it draws, and whether a boss ends it
    u8 rooms;
    u8 boss;
    // The field weather (a fog) of its rooms, a WEATHER_*, or ENTRALINK_FIELD_WEATHER_ZONE
    // (paperwhite2/entralink_run_state.h)
    u8 fieldWeather;
    // The weight of each room type (ENTRALINK_TYPE_*) its doors draw
    u8 typeWeights[ENTRALINK_TYPE_COUNT];
} EntralinkRound;

// A stat's multipliers in percent (run.json's enemy_scaling, phase 5 and the rebalance): in each room of the run by its
// depth across the run (rooms[0] the first room), and for each round's boss (the last round's: the final room)
typedef struct {
    u16 rooms[ENTRALINK_RUN_SCALED_ROOMS_MAX];
    u16 boss[ENTRALINK_RUN_ROUNDS_MAX];
} EntralinkScaling;

// An entry of the item table (items.json)
typedef struct {
    u16 item;
    // Its price in Dream Dust, in a shop
    u16 price;
    // Its weight in a pool's draw, a bit for each round it is drawn in (round 1 the lowest; 0 for any), a bit for each
    // pool (ENTRALINK_POOL_*), and its bag icon among the model table's from ENTRALINK_RUN_ITEM_ICON_FILE, or
    // ENTRALINK_ICON_NONE
    u8 weight;
    u8 rounds;
    u8 pools;
    u8 icon;
} EntralinkItem;

// A forest clearing a run's rooms are in: its zone, its flower tiles in the flower table (where a hidden item can
// lie), and its blocked tiles, a row per z with a bit per x
typedef struct {
    u16 zone;
    u16 firstFlower;
    u16 flowerCount;
    u32 blocked[32];
} EntralinkClearing;

// Starts a run as the player walks into the forest from the hub (CheckEntralinkForestFirstWarpEvent)
void EntralinkRun_Start(GameData *gameData);
// Whether a run is on
BOOL EntralinkRun_IsActive(GameData *gameData);
// The zone of the run's room, for the Entree Forest's warp (EventEntreeForestWarp_Callback)
u16 EntralinkRun_GetRoomZone(GameData *gameData);
// The event of an exit (a DIR_*) of a run's room (Scrcmd_EntreeForest_MapChangeEntreeForest): the room behind its
// door, or the hub after the last
GameEvent *EntralinkRun_CreateExitEvent(GameSystem *gsys, u32 exit);
// Puts the room's NPCs in it, those that came up as the player entered and are still there
// (Scrcmd_EntreeForest_EntreeForestSpawnAllPkm)
void EntralinkRun_SpawnRoom(GameSystem *gsys);
// Ends a run that the player has left by any other way than its own, as each map loads (ZoneChange_OnFieldLoad)
void EntralinkRun_OnFieldLoad(GameData *gameData, u16 zoneId);
// The marker in front of a forward door (ENTRALINK_DOOR_*) of the room, ENTRALINK_MARKER_*, or ENTRALINK_MARKER_NONE
// where no room is behind it; shown once the room is done (EntralinkRunState's cleared). Its 2 by 2 tiles' top-left
// tile on the clearings' grid in x and z
u32 EntralinkRun_GetDoorMarker(GameData *gameData, u32 door);
void EntralinkRun_GetMarkerSpot(u32 door, u32 *x, u32 *z);
// The marker over the room's NPC of an index (its actor's ID), ENTRALINK_NPC_MARKER_NONE if it has none or isn't there;
// over an item room's ball, its item's bag icon (ENTRALINK_NPC_MARKER_ICON)
u32 EntralinkRun_GetNpcMarker(u32 index);
// The room's NPC of an index if it is an ambient that came up and is still there, else NULL
const EntralinkNpc *EntralinkRun_GetAmbient(u32 index);
// Puts an ambient of the room back (hidden, for its fade-in), after it faded out to come back
FieldActor *EntralinkRun_SpawnAmbient(Field *field, u32 index);
// Takes the room's ambient of an index away for the rest of the room, its actor too
void EntralinkRun_RemoveAmbient(Field *field, u32 index);
// The room's ambients' reactions to the player, every frame of the field's update (paperwhite2_entralink_ambients.c)
void PaperWhite2_EntralinkAmbientsUpdate(Field *field);
// The script of the run's hidden item, if it lies on the tile at a position (the tile in front of the player, as A
// is pressed: FieldEventProvider_Grid_CheckForEvent), else SCRID_NONE
u16 EntralinkRun_CheckHiddenItem(u16 zoneId, const VecFx32 *pos);

// Command 0x2f8, EntralinkRun action, arg1, arg2, result: runs one of the run's actions
// (ENTRALINK_RUN_ACTION_*, paperwhite2/entralink_run_actions.h), and puts what it returns in the variable result
BOOL Scrcmd_PaperWhite2_EntralinkRun(VM *vm, FieldScriptEnv *env);

#endif // PAPERWHITE2_ENTRALINK_RUN_H
