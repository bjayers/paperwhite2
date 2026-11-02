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
// An ambient's record, packed by tools/paperwhite2/overworld.py after its rule's payload: a sprite drawn without an
// actor (src/paperwhite2/ov036/paperwhite2_ambients.c), on its path round its place
typedef struct {
    u16 objCode;
    // An AMBIENT_PATH_* and an AMBIENT_SHADOW_*
    u8 path;
    u8 shadow;
    // The DIR_* it faces where its path doesn't turn it, and AMBIENT_FLAG_*s
    u8 facing;
    u8 flags;
    u16 pad;
    // Its place, in the world's units (16 a tile), and its path's sizes in units, its speed in degrees a second round
    // it (a perch's: how often it turns, in seconds) and where on its path it starts, in degrees
    VecFx32 at;
    u16 sizeX;
    u16 sizeZ;
    u16 speed;
    u16 phase;
} SpawnAmbient;

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
};

enum {
    AMBIENT_SHADOW_NONE,
    // Under its feet, at its own height
    AMBIENT_SHADOW_FEET,
    // On the ground below it
    AMBIENT_SHADOW_GROUND,
};

// A perch's turns and hops
#define AMBIENT_FLAG_TURNS 0x1
#define AMBIENT_FLAG_HOPS 0x2

// The most ambients a zone shows (the budget, docs/paperwhite2/design/overworld-editor.md, Ambients)
#define SPAWNS_AMBIENT_MAX 8
// What an ambient's rolls are keyed by: its index past every NPC's id
#define SPAWNS_AMBIENT_KEY 0x10000

// The zone's ambients whose conditions hold now, into out (at most max); how many
u32 Spawns_GetAmbients(GameSystem *gsys, HeapID heapId, SpawnAmbient *out, u32 max);
// The zone's groups applied again after a script changed what they read (a SpawnRefresh command to come)
void Spawns_Refresh(GameSystem *gsys);

#endif // PAPERWHITE2_SPAWNS_H
