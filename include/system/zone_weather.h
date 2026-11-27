#ifndef POKEBW2_SYSTEM_ZONE_WEATHER_H
#define POKEBW2_SYSTEM_ZONE_WEATHER_H

#include "types.h"
#include "struct_decls.h"

// zone_weather.c: which weather a zone has. The ROM doesn't name the file; the name is a guess. Names from swan
// (https://github.com/ds-pokemon-hacking/swan, GPL-3.0), except WEATHER_NONE

// No weather chosen, so the next rule decides
#define WEATHER_NONE 0xffff

// The weathers, in the order of weather.c's WEATHER_OVERLAYS, by their effects (field/weather_*.h); the specks of
// weather 8 are diamond dust, which gives its medal
enum {
    WEATHER_SUNNY,
    WEATHER_FLAKE,
    WEATHER_RAIN,
    WEATHER_SANDSTORM,
    WEATHER_BLIZZARD,
    WEATHER_FLUTTER,
    WEATHER_THUNDERSTORM,
    WEATHER_GUSTY_RAIN,
    WEATHER_DIAMOND_DUST,
    WEATHER_TINT_9,
    WEATHER_TINT_10,
    WEATHER_TINT_11,
    WEATHER_SANDSTORM_2,
    WEATHER_TINT_13,
    WEATHER_TINT_14,
#ifdef PAPERWHITE2
    // Paper White 2: the hack's own tints, slots of res/paperwhite2/field_tints/tints.json in order
    // (paperwhite2/field_tint.h); a slot the file doesn't fill is clear
    WEATHER_CUSTOM_TINT_1,
    WEATHER_CUSTOM_TINT_2,
    WEATHER_CUSTOM_TINT_3,
    WEATHER_CUSTOM_TINT_4,
    WEATHER_CUSTOM_TINT_5,
    WEATHER_CUSTOM_TINT_6,
    WEATHER_CUSTOM_TINT_7,
    WEATHER_CUSTOM_TINT_8,
    WEATHER_CUSTOM_TINT_9,
    WEATHER_CUSTOM_TINT_10,
    WEATHER_CUSTOM_TINT_11,
    WEATHER_CUSTOM_TINT_12,
    // Paper White 2: the hack's own weathers. Harsh sun (paperwhite2/harsh_sun.h) gives sun in battle and counts as
    // clear for encounters; the dry thunderstorm (field/weather_rain.h) is the thunderstorm without its rain, with no
    // battle weather, and counts as the thunderstorm
    WEATHER_HARSH_SUN,
    WEATHER_DRY_THUNDERSTORM,
#endif
    WEATHER_MAX,
};

// A zone's weather: a forced one, the Entralink's by the connected game, the Route 7 event's, the player's birthday's
// on Routes 14 and 15, the date's if the season is the real one, else the zone's own
u8 GetWeatherAll(GameSystem *gsys, u32 zoneId);
// Sets the current weather to the zone's
void ResetWeather(GameSystem *gsys, u32 zoneId);
// Sets the current weather to a forced one, or back to the zone's own from weathers 6 and 7
void UpdateWeatherToDefault(GameData *gameData, u32 zoneId);

#endif // POKEBW2_SYSTEM_ZONE_WEATHER_H
