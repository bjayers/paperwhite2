#ifndef PAPERWHITE2_WEATHER_FOG_H
#define PAPERWHITE2_WEATHER_FOG_H

#include "types.h"
#include "field/field_weather.h"
#include "struct_decls.h"

// Paper White 2: weather fog that follows the player (src/paperwhite2/ov036/paperwhite2_weather_fog.c). A weather's
// fog shift and offset are depth-buffer values that suit a normal town's camera (defaults 0: Z-buffered, near 1, far
// 1024, its target, the player, 237 units away). On any other camera they become the shift and offset that give the
// same density at the target and about the same ramp around it, for the camera's own near and far planes, buffering
// (Z or W) and distance to its target, so a far camera (Castelia's) isn't washed out. A camera 237 units from its
// target on a normal town's planes keeps the weather's values exactly

// Whether a weather's fog follows the player: the weathers that fall (rain, thunderstorm, gusty rain, snow, blizzard,
// flutter, speck, sandstorm). The sunny weather sets the zone's own fog, and the tints already pick theirs by camera
BOOL PaperWhite2_WeatherFog_FollowsPlayer(const WeatherData *data);

// Every frame, after the fog's animation step: reads the camera and the player, and has the fog flushed again when
// that moved where a weather's fog falls
void PaperWhite2_WeatherFog_Update(Field *field);

// A weather's fog shift and offset for the current camera
void PaperWhite2_WeatherFog_Map(u32 *depthShift, s32 *offset);

// Whether the clear colour (the sky gaps where no polygon is drawn) takes the fog: in Castelia's outdoor zones, so that
// in a weather the gaps past a street's end are the fog's colour rather than the light's sky. It changes nothing while
// the fog is off
BOOL PaperWhite2_WeatherFog_IsRearPlaneFog(void);

#endif // PAPERWHITE2_WEATHER_FOG_H
