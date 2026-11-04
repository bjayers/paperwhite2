#include "types.h"
#include "constants/flags.h"
#include "constants/places.h"
#include "field/zone.h"
#include "paperwhite2/version_places.h"
#include "save/event_work.h"
#include "system/game_data.h"
#include "system/game_system.h"

// Paper White 2: the places Unova has as Black 2 or as White 2. See include/paperwhite2/version_places.h

// Each place's flag, and the place names of its zones (a city's gate has the second)
typedef struct {
    u16 flag;
    u16 placeNames[2];
} VersionPlace;

// (in VERSION_PLACE_* order)
static const VersionPlace sVersionPlaces[VERSION_PLACE_COUNT] = {
    { EVENT_FLAG_BLACK2_ROUTE_4, { PLACE_ROUTE_4, PLACE_ROUTE_4 } },
    { EVENT_FLAG_BLACK2_REVERSAL_MOUNTAIN, { PLACE_REVERSAL_MOUNTAIN, PLACE_REVERSAL_MOUNTAIN } },
    { EVENT_FLAG_BLACK2_MISTRALTON_CITY, { PLACE_MISTRALTON_CITY, PLACE_MISTRALTON_CITY_2 } },
    { EVENT_FLAG_BLACK2_OPELUCID_CITY, { PLACE_OPELUCID_CITY, PLACE_OPELUCID_CITY_2 } },
    { EVENT_FLAG_BLACK2_BLACK_CITY, { PLACE_BLACK_CITY, PLACE_BLACK_CITY_2 } },
};

u32 PaperWhite2_GetVersionPlace(u16 zoneId) {
    u16 name = ZoneData_GetPlaceNameID(zoneId);
    u32 place;

    for (place = 0; place < VERSION_PLACE_COUNT; place++) {
        if (name == sVersionPlaces[place].placeNames[0] || name == sVersionPlaces[place].placeNames[1]) {
            return place;
        }
    }
    return VERSION_PLACE_NONE;
}

BOOL PaperWhite2_IsPlaceBlack2(EventWork *eventWork, u32 place) {
    if (eventWork == NULL || place >= VERSION_PLACE_COUNT) {
        return FALSE;
    }
    return EventWork_FlagGet(eventWork, sVersionPlaces[place].flag);
}

void PaperWhite2_SetPlaceBlack2(EventWork *eventWork, u32 place, BOOL black2) {
    if (black2) {
        EventWork_FlagSet(eventWork, sVersionPlaces[place].flag);
    } else {
        EventWork_FlagReset(eventWork, sVersionPlaces[place].flag);
    }
}

BOOL PaperWhite2_AreAllPlacesBlack2(EventWork *eventWork) {
    u32 place;

    for (place = 0; place < VERSION_PLACE_COUNT; place++) {
        if (!PaperWhite2_IsPlaceBlack2(eventWork, place)) {
            return FALSE;
        }
    }
    return TRUE;
}

BOOL PaperWhite2_IsZoneBlack2(EventWork *eventWork, u16 zoneId) {
    return PaperWhite2_IsPlaceBlack2(eventWork, PaperWhite2_GetVersionPlace(zoneId));
}

EventWork *PaperWhite2_GetRunningEventWork(void) {
    if (g_GameSystem == NULL) {
        return NULL;
    }
    return GameData_GetEventWork(GSYS_GetGameData(g_GameSystem));
}
