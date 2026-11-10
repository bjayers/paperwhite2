#include "types.h"
#include "constants/battle.h"
#include "field/zone.h"
#include "gfl/heap.h"
#include "paperwhite2/battle_weather.h"
#include "system/area_data.h"
#include "system/zone_weather.h"

// Paper White 2: the start of a battle's weather in the field, in overlay 12 beside the original's event_battle.c,
// which calls it. See include/paperwhite2/battle_weather.h

static u32 BattleWeather_ToFieldWeather(u32 btlWeather);
static BOOL BattleWeather_IsZoneExterior(u32 zoneId);

void PaperWhite2_BattleWeather_OnBattleReturn(u32 zoneId, u32 startBtlWeather) {
    u32 btlWeather = PaperWhite2_BattleWeather_TakeBattleEnd();
    u32 weather;

    // No weather at the end, or still the one the field gave the battle, leaves the field as it was
    if (btlWeather == BTL_WEATHER_NONE || btlWeather == startBtlWeather) {
        return;
    }
    weather = BattleWeather_ToFieldWeather(btlWeather);
    if (weather == WEATHER_MAX || GetZoneIsEntralinkAny(zoneId) || !BattleWeather_IsZoneExterior(zoneId)) {
        return;
    }
    PaperWhite2_BattleWeather_Start(weather, zoneId);
}

// The field weather of a battle weather. The field has no harsh sun, so sun clears the sky. Hail is the snow that
// ConvFieldWeatherToBtl gives hail for, so a battle in it has hail again, as one in the rain or the sandstorm has those
static u32 BattleWeather_ToFieldWeather(u32 btlWeather) {
    switch (btlWeather) {
    case BTL_WEATHER_SUN:
        return WEATHER_SUNNY;
    case BTL_WEATHER_RAIN:
        return WEATHER_RAIN;
    case BTL_WEATHER_HAIL:
        return WEATHER_FLUTTER;
    case BTL_WEATHER_SANDSTORM:
        return WEATHER_SANDSTORM;
    default:
        return WEATHER_MAX;
    }
}

// An interior keeps its own weather (the area's isExterior, which decides the season's banner too)
static BOOL BattleWeather_IsZoneExterior(u32 zoneId) {
    AreaData *areaData = AreaData_Create(HEAPID_TAIL(HEAPID_GAMEEVENT), ZoneData_GetAreaID(zoneId), 0);
    BOOL isExterior = AreaData_IsExterior(areaData);

    AreaData_Free(areaData);
    return isExterior;
}
