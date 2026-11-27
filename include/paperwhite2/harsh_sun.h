#ifndef PAPERWHITE2_HARSH_SUN_H
#define PAPERWHITE2_HARSH_SUN_H

#include "types.h"
#include "field/field_weather.h"
#include "struct_decls.h"

// Paper White 2: harsh sun, field weather WEATHER_HARSH_SUN (docs/paperwhite2/design/harsh-sun.md). One weather whose
// look follows the time of day:
// - morning and day: a warm, bright light, a 1-pixel heat shimmer on the far part of the scene (the lines above the
//   player) and the vanilla lens flare, slowly pulsing;
// - evening: the light's orange and the evening lens flare, pulsing;
// - night: a warm night light and embers, small specks that rise, sway and fade, drawn as the snow's are (the weather's
//   OBJs at the lowest priority, under the place name banner and the message boxes).
// The light is harsh sun's own weather light file (HARSH_SUN_LIGHT_FILE of ARCID_LIGHTS_BATTLE), which a battle in it
// uses too. In battle harsh sun is sun (ConvFieldWeatherToBtl), and Sunny Day or Drought leave it in the field for a
// while (paperwhite2/battle_weather.h); for encounters it is clear (paperwhite2/weather_groups.h).
//
// The weather itself is in overlay 75 with the particle weathers (src/paperwhite2/ov075/paperwhite2_harsh_sun.c); the
// shimmer and the flare, which need the field, are overlay 36's (src/paperwhite2/ov036/paperwhite2_harsh_sun_field.c)

// Harsh sun's weather light, a file of ARCID_LIGHTS_BATTLE (res/lighting/battle/010.json)
#define HARSH_SUN_LIGHT_FILE 10

// The strength of the shimmer and the flare, 0 (off) to HARSH_SUN_LEVEL_MAX, which the weather fades
#define HARSH_SUN_LEVEL_MAX 32

// Overlay 75: the weather (weather.c's WEATHER_OVERLAYS)
extern WeatherData PAPERWHITE2_HARSH_SUN_WEATHER;

// Overlay 36. The weather sets the strength of its field effects each frame, and 0 when it ends
void PaperWhite2_HarshSun_SetLevel(u32 level);
// Every frame, after the lens flare's own update: the shimmer and the flare by the strength and the time of day
void PaperWhite2_HarshSun_Update(Field *field);
// Before the field frees its 3D objects: ends the shimmer and lets go of the flare
void PaperWhite2_HarshSun_FieldEnd(void);

#endif // PAPERWHITE2_HARSH_SUN_H
