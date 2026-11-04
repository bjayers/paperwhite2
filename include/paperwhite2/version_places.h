#ifndef PAPERWHITE2_VERSION_PLACES_H
#define PAPERWHITE2_VERSION_PLACES_H

#include "types.h"
#include "struct_decls.h"

// Paper White 2: the places Unova has as Black 2 or as White 2, each on its own
// (docs/paperwhite2/design/version-key.md, "Each place on its own"). Each has an event flag (EVENT_FLAG_BLACK2_*), set
// while it plays as Black 2. The flag decides the place's map pieces (MapReplace, by the place of each cell), Route 4's
// and Black City's zones (CityState_ApplyVersionZones), their areas (ZoneData_GetAreaID, the Kyurem freeze's in
// FieldMapControl), the version its scripts see (GameGetVersion, ActorMsgVersioned in its zones), and the warps of its
// ways in (Castelia Gate's, Join Avenue's, Undella Town's and Reversal Mountain's level scripts read the flags). The
// globe's Season app and the Version Key (paperwhite2/version_key.h) set them. In ARM9 main
// (src/paperwhite2/main/paperwhite2_version_places.c)

enum {
    VERSION_PLACE_ROUTE_4,
    VERSION_PLACE_REVERSAL_MOUNTAIN,
    VERSION_PLACE_MISTRALTON_CITY,
    VERSION_PLACE_OPELUCID_CITY,
    // Black City, or White Forest
    VERSION_PLACE_BLACK_CITY,
    VERSION_PLACE_COUNT,
};

// A zone that's in none of the places
#define VERSION_PLACE_NONE VERSION_PLACE_COUNT

// The place a zone is in, by its place name, or VERSION_PLACE_NONE
u32 PaperWhite2_GetVersionPlace(u16 zoneId);
// Whether a place plays as Black 2 (FALSE for VERSION_PLACE_NONE), and setting it; with the save's flags
BOOL PaperWhite2_IsPlaceBlack2(EventWork *eventWork, u32 place);
void PaperWhite2_SetPlaceBlack2(EventWork *eventWork, u32 place, BOOL black2);
// Whether every place plays as Black 2
BOOL PaperWhite2_AreAllPlacesBlack2(EventWork *eventWork);
// Whether a zone's place plays as Black 2
BOOL PaperWhite2_IsZoneBlack2(EventWork *eventWork, u16 zoneId);
// The save's flags while a game runs, or NULL before one does (for main's zone data, which has no game data)
EventWork *PaperWhite2_GetRunningEventWork(void);

#endif // PAPERWHITE2_VERSION_PLACES_H
