#ifndef PAPERWHITE2_WEATHER_H
#define PAPERWHITE2_WEATHER_H

#include "types.h"
#include "struct_decls.h"

// Paper White 2: the weather's date (src/paperwhite2/ov012/paperwhite2_weather.c), in overlay 12 beside the
// original's calender.c, whose weather by the day of the year reads it

// The date of the original's calendar whose weather every calendar zone has today: one of the days of the months of
// the season the game has, drawn from the save's date and the season, so the same all day and after a reload
void PaperWhite2_GetWeatherDate(GameData *gameData, u8 *month, u8 *day);

#endif // PAPERWHITE2_WEATHER_H
