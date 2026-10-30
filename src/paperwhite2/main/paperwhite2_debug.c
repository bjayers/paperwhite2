#include "types.h"
#include "constants/flags.h"
#include "paperwhite2/debug.h"
#include "save/event_work.h"
#include "system/game_data.h"
#include "system/rtc.h"

// Paper White 2: the debug menu's overrides, in main, where the hooks of main and the field's overlays read them. See
// include/paperwhite2/debug.h

#ifdef PAPERWHITE2_DEBUG_MENU
// The seconds of an hour, and the seconds into a period's first hour that the lights take
#define HOUR_SECONDS 3600
#define LIGHT_SECONDS_IN_HOUR 1800

static u16 sOverrides[DEBUG_OVERRIDE_COUNT] = {
    DEBUG_OVERRIDE_OFF, DEBUG_OVERRIDE_OFF, DEBUG_OVERRIDE_OFF, DEBUG_OVERRIDE_OFF, DEBUG_OVERRIDE_OFF,
};

u16 PaperWhite2_Debug_GetOverride(u32 override) {
    return sOverrides[override];
}

void PaperWhite2_Debug_SetOverride(u32 override, u16 value) {
    sOverrides[override] = value;
}

u16 PaperWhite2_Debug_GetDayPeriod(u16 period) {
    if (sOverrides[DEBUG_OVERRIDE_DAY_PERIOD] != DEBUG_OVERRIDE_OFF) {
        return sOverrides[DEBUG_OVERRIDE_DAY_PERIOD];
    }
    return period;
}

s32 PaperWhite2_Debug_GetDaySeconds(u32 season, s32 seconds) {
    if (sOverrides[DEBUG_OVERRIDE_DAY_PERIOD] != DEBUG_OVERRIDE_OFF) {
        return GetLightChangeHoursForSeasons(season, sOverrides[DEBUG_OVERRIDE_DAY_PERIOD]) * HOUR_SECONDS +
               LIGHT_SECONDS_IN_HOUR;
    }
    return seconds;
}

BOOL PaperWhite2_Debug_IsWalkingThroughWalls(GameData *gameData) {
    return EventWork_FlagGet(GameData_GetEventWork(gameData), EVENT_FLAG_DEBUG_WALK_THROUGH_WALLS);
}

u32 PaperWhite2_Debug_FilterPlayerHit(GameData *gameData, u32 hit, u32 kept) {
    if (PaperWhite2_Debug_IsWalkingThroughWalls(gameData)) {
        return hit & kept;
    }
    return hit;
}

void PaperWhite2_Debug_OverrideWilds(WildPkmParam *params, int count) {
    int i;

    for (i = 0; i < count; i++) {
        // A forced species drops the slot's form, item, sex and hidden ability, which may not fit it
        if (sOverrides[DEBUG_OVERRIDE_WILD_SPECIES] != DEBUG_OVERRIDE_OFF) {
            params[i].species = sOverrides[DEBUG_OVERRIDE_WILD_SPECIES];
            params[i].form = 0;
            params[i].item = 0;
            params[i].sex = WILD_SEX_RANDOM;
            params[i].hiddenAbility = FALSE;
        }
        if (sOverrides[DEBUG_OVERRIDE_WILD_LEVEL] != DEBUG_OVERRIDE_OFF) {
            params[i].level = sOverrides[DEBUG_OVERRIDE_WILD_LEVEL];
        }
    }
}
#endif
