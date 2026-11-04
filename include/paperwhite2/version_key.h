#ifndef PAPERWHITE2_VERSION_KEY_H
#define PAPERWHITE2_VERSION_KEY_H

#include "types.h"
#include "constants/items.h"
#include "struct_decls.h"

// Paper White 2: the Version Key, a key item for testing that switches every place of paperwhite2/version_places.h
// between Black 2's and White 2's at once (docs/paperwhite2/items.md); the game never gives it, and the globe's Season
// app switches the places one by one. Its state is the places' flags. In ARM9 main
// (src/paperwhite2/main/paperwhite2_version_key.c), the field's event in overlay 12
// (src/paperwhite2/ov012/paperwhite2_version_key_event.c)

// The Galactic Key's place, which the game never gives
#define ITEM_VERSION_KEY ITEM_GALACTIC_KEY

// The bag's result that leaves it for the field's event (src/ov142/itemmenu.c, after BAG_RESULT_DEXNAV)
#define BAG_RESULT_VERSION_KEY 41

// The scripts of res/field/scripts/global_2800.s that say what it did: Unova as in Black 2 (Script_21), as in White 2
// (Script_22), and that it can't be used here (Script_23)
#define SCRID_VERSION_KEY_BLACK 2820
#define SCRID_VERSION_KEY_WHITE 2821
#define SCRID_VERSION_KEY_NOT_HERE 2822

// Whether every place is Black 2's
BOOL PaperWhite2_IsBlackVersionWorld(GameData *gameData);
// Switches every place to Black 2's, or back to White 2's where they all are, and the city the field plays; whether
// they're Black 2's now. The field's zones follow at the next map change (CityState_ApplyVersionZones)
BOOL PaperWhite2_ToggleVersion(GameData *gameData);
// Whether a script's version check (GameGetVersion, ActorMsgVersioned) sees Black 2: in a zone of a place that is
// Black 2's (paperwhite2/version_places.h)
BOOL PaperWhite2_ScriptSeesOtherVersion(GameData *gameData);
// The zone a version-specific zone stands in for (Route 4's for route_4_16's), or the zone itself
u16 PaperWhite2_GetUnversionedZone(u16 zoneId);
// The field's event that switches it, then loads the map again where the player stands
GameEvent *PaperWhite2_EventVersionKey_Create(Field *field, GameSystem *gsys);

#endif // PAPERWHITE2_VERSION_KEY_H
