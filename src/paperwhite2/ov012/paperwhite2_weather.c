#include "types.h"
#include "constants/zones.h"
#include "field/ev_time.h"
#include "field/zone.h"
#include "nitro/rtc.h"
#include "paperwhite2/weather.h"
#include "system/game_data.h"
#include "system/season.h"
#include "system/zone_weather.h"

// Paper White 2: the weather by season, in overlay 12 beside the original's calender.c, which calls it

// How often a weather comes in a zone in a season, against the other weathers of the zone and season
typedef struct {
    u16 zoneId;
    u8 season;
    u8 weather;
    u16 weight;
} SeasonalWeatherRate;

// From res/paperwhite2/seasonal_weather.json, by tools/paperwhite2/seasonal_weather.py
static const SeasonalWeatherRate SEASONAL_WEATHER_RATES[] = {
#include "paperwhite2/seasonal_weather.inc"
};

static u32 PaperWhite2_HashDayAndZone(u32 day, u16 zoneId);

u16 PaperWhite2_GetCalendarWeather(GameData *gameData, u16 zoneId) {
    u8 season = GameData_GetSeason(gameData);
    s32 day = RTC_ConvertDateToDay(getAddressAdventureTimeBlk(gameData));
    u32 total = 0;
    u32 roll;
    u32 i;

    for (i = 0; i < NELEMS(SEASONAL_WEATHER_RATES); i++) {
        if (SEASONAL_WEATHER_RATES[i].zoneId == zoneId && SEASONAL_WEATHER_RATES[i].season == season) {
            total += SEASONAL_WEATHER_RATES[i].weight;
        }
    }
    if (total == 0 || day < 0) {
        return GetZoneEnvFlagsWeather(zoneId);
    }
    roll = PaperWhite2_HashDayAndZone(day, zoneId) % total;
    for (i = 0; i < NELEMS(SEASONAL_WEATHER_RATES); i++) {
        if (SEASONAL_WEATHER_RATES[i].zoneId == zoneId && SEASONAL_WEATHER_RATES[i].season == season) {
            if (roll < SEASONAL_WEATHER_RATES[i].weight) {
                return SEASONAL_WEATHER_RATES[i].weather;
            }
            roll -= SEASONAL_WEATHER_RATES[i].weight;
        }
    }
    return GetZoneEnvFlagsWeather(zoneId);
}

// A number that looks random but that the day and the zone always give the same: the mixing of MurmurHash3's finalizer
static u32 PaperWhite2_HashDayAndZone(u32 day, u16 zoneId) {
    u32 hash = day * 0x9e3779b1 + zoneId;

    hash ^= hash >> 16;
    hash *= 0x85ebca6b;
    hash ^= hash >> 13;
    hash *= 0xc2b2ae35;
    hash ^= hash >> 16;
    return hash;
}
