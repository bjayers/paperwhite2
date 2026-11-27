#ifndef POKEBW2_FIELD_WEATHER_RAIN_H
#define POKEBW2_FIELD_WEATHER_RAIN_H

#include "types.h"
#include "field/field_weather.h"

// weather_rain.c, overlay 76: the rain weathers 2, 6 and 7, all with particles. The ROM doesn't name the file; the name
// is a guess, and so are the weathers' names, which only say what they look like: falling drops that splash, a
// thunderstorm whose lightning flashes the screen, and a rain that gusts. Overlay 36's weather table
// (WEATHER_OVERLAYS) loads it

// Weather 2: drops that fall and splash
extern WeatherData RAIN_WEATHER;
// Weather 6: faster drops, a scrolling background and lightning
extern WeatherData THUNDERSTORM_WEATHER;
// Weather 7: rain that gusts, with two scrolling backgrounds and thunder rumbling
extern WeatherData GUSTY_RAIN_WEATHER;
#ifdef PAPERWHITE2
// Paper White 2: WEATHER_DRY_THUNDERSTORM, weather 6 without its rain: the dark light and the lightning's flashes and
// thunder, with no drops, no scrolling sheet and no rain sound. No battle weather; it counts as the thunderstorm for
// encounters (paperwhite2/weather_groups.h)
extern WeatherData DRY_THUNDERSTORM_WEATHER;
#endif

#endif // POKEBW2_FIELD_WEATHER_RAIN_H
