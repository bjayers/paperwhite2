#ifndef PAPERWHITE2_SPAWNS_H
#define PAPERWHITE2_SPAWNS_H

#include "types.h"
#include "gfl/heap.h"
#include "nitro/fx.h"
#include "struct_decls.h"

// Paper White 2: the NPC spawns (src/paperwhite2/ov012/paperwhite2_spawns.c, docs/paperwhite2/plugins.md, NPC spawns):
// the zones' NPCs' conditions and instances of res/paperwhite2/overworld/, applied to the records at zone entry and
// again when the hour or the time of day changes (src/paperwhite2/ov036/paperwhite2_spawns_field.c). The refresh is
// still empty

// Whether an NPC, or where it would appear, is in the camera's view: its actor where it has one, else its record's
// position; arg is the caller's
typedef BOOL (*SpawnsInView)(void *arg, FieldActor *actor, const ZoneNPC *record);

// A zone's NPCs' conditions applied and its hosts' instances picked at zone init, after the zone-load counter and
// before the init scripts (FieldScript_CallOnZoneInit); the zone's table is read into heapId and freed
void Spawns_OnZoneInit(GameSystem *gsys, u16 zoneId, HeapID heapId);
// What the picks are made for now: the day, the hour and the time of day, mixed. The zone's picks were made for the
// key in EVENT_WORK_SPAWN_PICK, which Spawns_OnZoneInit sets
u16 Spawns_PickKey(GameData *gameData);
// The zone's picks made again for now: each NPC whose record should change is changed where it and where it would
// appear are out of view, its actor removed and made again if it shows. TRUE when every NPC has its record for now,
// FALSE while some wait to leave the view
BOOL Spawns_Repick(GameSystem *gsys, MMSys *actorSystem, HeapID heapId, SpawnsInView inView, void *arg);
// The most sprites an ambient picks from, and the most waypoints a waypoints path has after its place
#define SPAWNS_AMBIENT_SPRITES 4
#define SPAWNS_AMBIENT_POINTS 6

// An ambient's record, packed by tools/paperwhite2/overworld.py after its rule's payload: a sprite drawn without an
// actor (src/paperwhite2/ov036/paperwhite2_ambients.c), on its path round its place
typedef struct {
    // The sprites it shows one of, picked by its roll (Spawns_GetAmbients gives the one picked first, with a count of
    // 1), and how many
    u16 objCodes[SPAWNS_AMBIENT_SPRITES];
    u8 objCodeCount;
    // An AMBIENT_PATH_* and an AMBIENT_SHADOW_*
    u8 path;
    u8 shadow;
    // The DIR_* it faces where its path doesn't turn it, and AMBIENT_FLAG_*s
    u8 facing;
    u8 flags;
    u8 pad[3];
    // Its place, in the world's units (16 a tile), and its path's sizes in units, its speed in degrees a second round
    // it (a perch's: how often it turns, in seconds) and where on its path it starts, in degrees
    VecFx32 at;
    u16 sizeX;
    u16 sizeZ;
    u16 speed;
    u16 phase;
    // A line's climb, in units
    u16 sizeY;
    // Its reaction to the player coming near (AMBIENT_REACT_*): the sprite it changes to (0 its own), its heading in
    // degrees clockwise from north (AMBIENT_REACT_AWAY for away from the player), its speed in units a second, the
    // species of its cry (0 none), the seconds after the player has gone that it returns, at least and at most
    // (AMBIENT_RETURN_NEVER), its kind, how near the player and a running or cycling player come before it (tiles),
    // its bubble (EMOTION_BUBBLE_* + 1, 0 none), its heading's spread either way and its flight's climb (degrees)
    u16 reactSprite;
    u16 reactHeading;
    u16 reactSpeed;
    u16 reactCry;
    u16 returnMin;
    u16 returnMax;
    u8 reactKind;
    u8 reactNear;
    u8 reactStartle;
    u8 reactEmote;
    u8 reactSpread;
    u8 reactClimb;
    // The traveling paths' (AMBIENT_PATH_WANDER and after): a waypoints' or a fly-over's pace in units a second; the
    // seconds it waits (at a waypoint, down for a peek or a surface, between fly-overs); the seconds a peek or a
    // surface stays up; a fly-over's heading in degrees (AMBIENT_REACT_AWAY: one at random each time); the waypoints'
    // count and AMBIENT_PATH_FLAG_*s; then the waypoints after its place, x, y and z in units from it
    u16 pace;
    u16 wait;
    u16 up;
    u16 heading;
    u8 pointCount;
    u8 pathFlags;
    u8 pad2[2];
    s16 points[SPAWNS_AMBIENT_POINTS][3];
} SpawnAmbient;

enum {
    AMBIENT_REACT_NONE,
    // Up and away on its heading
    AMBIENT_REACT_FLY,
    // Away along the ground
    AMBIENT_REACT_RUN,
    // Down into the grass or the ground where it is
    AMBIENT_REACT_HIDE,
};

#define AMBIENT_REACT_AWAY 0xffff
#define AMBIENT_RETURN_NEVER 0xffff

enum {
    // Sitting at its place, turning and hopping now and then
    AMBIENT_PATH_PERCH,
    // Bobbing up and down at its place
    AMBIENT_PATH_HOVER,
    // Round an ellipse of sizeX by sizeZ (a circle where they're the same)
    AMBIENT_PATH_ELLIPSE,
    // Back and forth along a line sizeX east and sizeZ south of its place, and back
    AMBIENT_PATH_LINE,
    // A figure eight sizeX wide and sizeZ deep
    AMBIENT_PATH_EIGHT,
    // Tile to tile on the ground within sizeX east and west and sizeZ north and south of its place, with pauses of
    // about speed seconds
    AMBIENT_PATH_WANDER,
    // From its place to each of its points and on, at its pace, waiting at each; back to its place, or back the way
    // it came (AMBIENT_PATH_FLAG_BACK)
    AMBIENT_PATH_WAYPOINTS,
    // Under the ground for its wait, up for its up, and down again
    AMBIENT_PATH_PEEK,
    // Now and then, while the player is within sizeX of its place, across the screen sizeY over the player, at its
    // pace, on its heading
    AMBIENT_PATH_FLYOVER,
    // Bobbing at its place's height for its up, then under for its wait, coming up again elsewhere within sizeX by
    // sizeZ of its place
    AMBIENT_PATH_SURFACE,
};

// A waypoints path that goes back the way it came rather than round
#define AMBIENT_PATH_FLAG_BACK 0x1

enum {
    AMBIENT_SHADOW_NONE,
    // Under its feet, at its own height
    AMBIENT_SHADOW_FEET,
    // On the ground below it
    AMBIENT_SHADOW_GROUND,
};

// A perch's turns and hops, and the directions it turns to: a bit for each DIR_* from AMBIENT_FLAG_FACES_SHIFT, none
// for all four
#define AMBIENT_FLAG_TURNS 0x1
#define AMBIENT_FLAG_HOPS 0x2
#define AMBIENT_FLAG_FACES_SHIFT 4
#define AMBIENT_FACES_ALL 0xf

// The most ambients a zone shows (the budget, docs/paperwhite2/design/overworld-editor.md, Ambients)
#define SPAWNS_AMBIENT_MAX 8
// What an ambient's rolls are keyed by: its index past every NPC's id
#define SPAWNS_AMBIENT_KEY 0x10000
// What a spawn group's pick is keyed by: its index in groups.json past every ambient's key, from the seed of no zone
// (ConditionContext_SetSeedZone), so every zone with a member picks the same
#define SPAWNS_GROUP_KEY 0x20000
#define SPAWNS_GROUP_SEED_ZONE 0xffff
// The most members of groups a zone has (tools/paperwhite2/overworld.py checks it)
#define SPAWNS_GROUP_ZONE_MEMBERS_MAX 64

// The zone's ambients whose conditions hold now, into out (at most max); how many
u32 Spawns_GetAmbients(GameSystem *gsys, HeapID heapId, SpawnAmbient *out, u32 max);
// The zone's groups applied again after a script changed what they read (a SpawnRefresh command to come)
void Spawns_Refresh(GameSystem *gsys);

// A spawn group of the zone, for the debug menu: its index in groups.json, its members' count, how many of them can
// appear now, and the one it picked, by its index in the group (SPAWNS_GROUP_PICKED_NOBODY for nobody)
typedef struct {
    u8 group;
    u8 members;
    u8 holding;
    u8 picked;
} SpawnsGroupInfo;

#define SPAWNS_GROUP_PICKED_NOBODY 0xff

// The zone's groups from the first, at most max, into out, as the field picks them now; how many
u32 Spawns_GetGroupInfo(GameSystem *gsys, HeapID heapId, u32 first, SpawnsGroupInfo *out, u32 max);

#endif // PAPERWHITE2_SPAWNS_H
