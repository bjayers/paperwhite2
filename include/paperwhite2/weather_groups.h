#ifndef PAPERWHITE2_WEATHER_GROUPS_H
#define PAPERWHITE2_WEATHER_GROUPS_H

#include "system/zone_weather.h"

// Paper White 2: the weather groups. Every field weather (WEATHER_*, system/zone_weather.h) is in exactly one, and
// everything that asks about the weather by kind takes a weather as its group (the user chose this on 2026-11-10):
// a condition's or a habitat's weather list means every weather of the listed weathers' groups
// (tools/paperwhite2/conditions.py, which reads this header, compiles it so), the Pokédex's Area page and Habitat List
// filter by group, and the DexNav names the zone's weather by its group. The tints are clear (Giant Chasm's mist
// and the Entralink's lights are no weather to meet Pokémon in); flutter, blizzard and diamond dust are snow; gusty
// rain is rain; the thunderstorm is its own

enum {
    WEATHER_GROUP_CLEAR,
    WEATHER_GROUP_RAIN,
    WEATHER_GROUP_THUNDERSTORM,
    WEATHER_GROUP_SNOW,
    WEATHER_GROUP_SANDSTORM,
    WEATHER_GROUP_COUNT,
};

#define WEATHER_BIT(weather) (1 << (weather))

// Each group's weathers, a WEATHER_BIT for each
#define WEATHER_GROUP_CLEAR_WEATHERS                                                                                   \
    (WEATHER_BIT(WEATHER_SUNNY) | WEATHER_BIT(WEATHER_TINT_9) | WEATHER_BIT(WEATHER_TINT_10) |                         \
     WEATHER_BIT(WEATHER_TINT_11) | WEATHER_BIT(WEATHER_TINT_13) | WEATHER_BIT(WEATHER_TINT_14))
#define WEATHER_GROUP_RAIN_WEATHERS (WEATHER_BIT(WEATHER_RAIN) | WEATHER_BIT(WEATHER_GUSTY_RAIN))
#define WEATHER_GROUP_THUNDERSTORM_WEATHERS (WEATHER_BIT(WEATHER_THUNDERSTORM))
#define WEATHER_GROUP_SNOW_WEATHERS                                                                                    \
    (WEATHER_BIT(WEATHER_FLAKE) | WEATHER_BIT(WEATHER_BLIZZARD) | WEATHER_BIT(WEATHER_FLUTTER) |                       \
     WEATHER_BIT(WEATHER_DIAMOND_DUST))
#define WEATHER_GROUP_SANDSTORM_WEATHERS (WEATHER_BIT(WEATHER_SANDSTORM) | WEATHER_BIT(WEATHER_SANDSTORM_2))

// The groups' weathers in WEATHER_GROUP_* order, for a table's initializer
#define WEATHER_GROUP_WEATHERS_INIT                                                                                    \
    { WEATHER_GROUP_CLEAR_WEATHERS, WEATHER_GROUP_RAIN_WEATHERS, WEATHER_GROUP_THUNDERSTORM_WEATHERS,                  \
      WEATHER_GROUP_SNOW_WEATHERS, WEATHER_GROUP_SANDSTORM_WEATHERS }

#endif // PAPERWHITE2_WEATHER_GROUPS_H
