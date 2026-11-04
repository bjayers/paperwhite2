#include "types.h"
#include "field/zone.h"
#include "system/game_data.h"
#ifdef PAPERWHITE2
#include "paperwhite2/version_places.h"
#endif

void CityState_ApplyVersionZones(CityState *state) {
    if (state->city == 1) {
        SetAllowVersionSpecificZone(0, 1);
        SetAllowVersionSpecificZone(1, 1);
    }
    if (state->city == 0) {
        SetAllowVersionSpecificZone(0, 0);
        SetAllowVersionSpecificZone(1, 0);
    }
#ifdef PAPERWHITE2
    // Paper White 2: Route 4's cells play as White 2's Route 4 unless Route 4 is Black 2's
    // (paperwhite2/version_places.h)
    SetAllowVersionSpecificZone(2,
                                !PaperWhite2_IsPlaceBlack2(PaperWhite2_GetRunningEventWork(), VERSION_PLACE_ROUTE_4));
#endif
}

void CityState_Init(CityState *state) {
    state->initialized = 0;
    state->city = 2;
}

// Whether a warp's transition type is one of an entrance camera's
BOOL IsEntranceCameraTransition(s32 transitionType) {
    if (transitionType >= WARP_TRANSITION_CAMERA) {
        return TRUE;
    }
    return FALSE;
}
