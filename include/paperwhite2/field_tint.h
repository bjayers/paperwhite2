#ifndef PAPERWHITE2_FIELD_TINT_H
#define PAPERWHITE2_FIELD_TINT_H

#include "types.h"
#include "field/field_weather.h"
#include "nitro/gx.h"
#include "system/zone_weather.h"

// Paper White 2: the hack's own tints (src/paperwhite2/ov036/paperwhite2_field_tint.c), field weathers
// WEATHER_CUSTOM_TINT_1 to _12, each a slot of res/paperwhite2/field_tints/tints.json (tools/paperwhite2/field_tints.py
// packs it into paperwhite2/field_tints_config.h). A tint is the hardware's fog in the tint's own colour, faded in by
// its density: "flat" fogs everything the same, a screen fade that leaves the map readable; "fog" thickens with
// distance, like the rain's fog, and follows the player whatever the camera (paperwhite2/weather_fog.h). The sky gaps
// take the fog too. The field's lights are left as they are, and a battle in a tint is lit as in the clear

#define PAPERWHITE2_CUSTOM_TINT_SLOTS (WEATHER_MAX - WEATHER_CUSTOM_TINT_1)

// The tints' weathers, by slot (weather.c's WEATHER_OVERLAYS)
extern WeatherData PAPERWHITE2_CUSTOM_TINT_WEATHERS[PAPERWHITE2_CUSTOM_TINT_SLOTS];

// Whether one of the tints is on the field
BOOL PaperWhite2_FieldTint_IsActive(void);

// The fog's colour: the tint's while one is on, else the light's own
GXRgb PaperWhite2_FieldTint_GetFogColor(GXRgb lightColor);

// Whether a weather is one of the tints that fog by distance, whose fog follows the player
BOOL PaperWhite2_FieldTint_FollowsPlayer(const WeatherData *data);

#endif // PAPERWHITE2_FIELD_TINT_H
