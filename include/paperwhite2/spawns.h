#ifndef PAPERWHITE2_SPAWNS_H
#define PAPERWHITE2_SPAWNS_H

#include "types.h"
#include "struct_decls.h"
#include "gfl/heap.h"

// Paper White 2: the NPC spawns (src/paperwhite2/ov012/paperwhite2_spawns.c, docs/paperwhite2/plugins.md, NPC spawns):
// the zones' NPCs' conditions and instances of res/paperwhite2/overworld/, applied to the records at zone entry. The
// period change and the refresh are still empty

// A zone's NPCs' conditions applied and its hosts' instances picked at zone init, after the zone-load counter and
// before the init scripts (FieldScript_CallOnZoneInit); the zone's table is read into heapId and freed
void Spawns_OnZoneInit(GameSystem *gsys, u16 zoneId, HeapID heapId);
// The variants re-evaluated after a period change, for the actors off screen (reevaluate: "period")
void Spawns_OnPeriodChange(GameSystem *gsys, u32 period);
// The zone's groups applied again after a script changed what they read (a SpawnRefresh command to come)
void Spawns_Refresh(GameSystem *gsys);

#endif // PAPERWHITE2_SPAWNS_H
