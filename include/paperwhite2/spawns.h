#ifndef PAPERWHITE2_SPAWNS_H
#define PAPERWHITE2_SPAWNS_H

#include "types.h"
#include "gfl/heap.h"
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
// The zone's groups applied again after a script changed what they read (a SpawnRefresh command to come)
void Spawns_Refresh(GameSystem *gsys);

#endif // PAPERWHITE2_SPAWNS_H
