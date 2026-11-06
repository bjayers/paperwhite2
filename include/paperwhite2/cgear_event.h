#ifndef PAPERWHITE2_CGEAR_EVENT_H
#define PAPERWHITE2_CGEAR_EVENT_H

#include "types.h"
#include "struct_decls.h"

// Paper White 2: what the C-Gear's markers open (src/ov079/c_gear_sw.c), each one of the field's apps
// (FIELD_PROC_LINK_LIST) as the Y button's shortcuts open them, in src/paperwhite2/ov012/paperwhite2_cgear_event.c

// Whether the player can open the app now: the Pokédex once it is had, the party once there is a Pokémon, the bag but
// in the Black Tower and White Treehollow, the DexNav with the Poké Radar, the map with the Town Map, and saving
// where the field menu has Save
BOOL PaperWhite2_CGearEvent_CanOpen(GameSystem *gsys, s32 appId);
// Opens the app and then does what it chose, as the field menu does: a field move, an item's event, or the field
GameEvent *PaperWhite2_CGearEvent_Create(GameSystem *gsys, Field *field, s32 appId);

#endif // PAPERWHITE2_CGEAR_EVENT_H
