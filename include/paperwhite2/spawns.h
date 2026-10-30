#ifndef PAPERWHITE2_SPAWNS_H
#define PAPERWHITE2_SPAWNS_H

#include "types.h"
#include "struct_decls.h"

// Paper White 2: the NPC spawn system's placeholder (src/paperwhite2/ov012/paperwhite2_spawns.c). The functions are
// empty and nothing calls them yet: the user first wants the research into how NPCs are loaded and moved, whether a
// map can have more without the freeze on entry, and spawning NPCs from a map's encounters (design/conditions.md, §10).
// Then the spawn groups of design/conditions.md §2 pick their NPCs with the conditions' Conditions_Select and seeds

// A zone's spawn groups picked and shown at zone init, after the zone-load counter (FieldScript_CallOnZoneInit)
void Spawns_OnZoneInit(GameSystem *gsys, u16 zoneId);
// The variants re-evaluated after a period change, for the actors off screen (reevaluate: "period")
void Spawns_OnPeriodChange(GameSystem *gsys, u32 period);
// The zone's groups applied again after a script changed what they read (a SpawnRefresh command to come)
void Spawns_Refresh(GameSystem *gsys);

#endif // PAPERWHITE2_SPAWNS_H
