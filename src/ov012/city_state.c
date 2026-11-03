#include "types.h"
#include "field/zone.h"
#include "system/game_data.h"

void CityState_ApplyVersionZones(CityState *state) {
    if (state->city == 1) {
        SetAllowVersionSpecificZone(0, 1);
        SetAllowVersionSpecificZone(1, 1);
#ifdef PAPERWHITE2
        // Paper White 2: Route 4 follows the city, so the Version Key switches it too (paperwhite2/version_key.h)
        SetAllowVersionSpecificZone(2, 1);
#endif
    }
    if (state->city == 0) {
        SetAllowVersionSpecificZone(0, 0);
        SetAllowVersionSpecificZone(1, 0);
#ifdef PAPERWHITE2
        SetAllowVersionSpecificZone(2, 0);
#endif
    }
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
