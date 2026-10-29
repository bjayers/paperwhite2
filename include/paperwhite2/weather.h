#ifndef PAPERWHITE2_WEATHER_H
#define PAPERWHITE2_WEATHER_H

#include "types.h"
#include "struct_decls.h"

// Paper White 2: the weather by season (src/paperwhite2/ov012/paperwhite2_weather.c), in overlay 12 beside the
// original's calender.c, whose weather by the day of the year it replaces

// The weather of the day in a zone: drawn from the zone's rates for the season the game has
// (res/paperwhite2/seasonal_weather.json), the same all day and after a reload, as the date and the zone give it. A
// zone without rates for the season has its own weather, as a zone without weather by date has in the original
u16 PaperWhite2_GetCalendarWeather(GameData *gameData, u16 zoneId);

#endif // PAPERWHITE2_WEATHER_H
