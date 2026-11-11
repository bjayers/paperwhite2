#ifndef PAPERWHITE2_WEATHER_FOG_H
#define PAPERWHITE2_WEATHER_FOG_H

#include "types.h"
#include "field/field_weather.h"
#include "nnsys/g3d.h"
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

// Whether light 2 takes the fog's colour: in the same zones, while the fog is on. Castelia's own light file gives light
// 2 the sky's colour (its clear colour) in every period, for its sky, its skyline billboards, its doorways' and street
// ends' gradients (gra_w) and its shadows; a weather's light file gives light 2 a blue (night (8, 3, 29), day (11, 15,
// 22)), so in a weather those stood out blue against the grey fog
BOOL PaperWhite2_WeatherFog_IsSkyFogged(FieldFog *fog);

// Before a map model is drawn: in the same zones, the waterfront's green gate to Skyarrow Bridge (its frame and panel,
// not its glass, the doorway's light) takes the fog's colour while the sky's light is the fog's, and its own otherwise
void PaperWhite2_WeatherFog_UpdateMapModel(NNSG3dResMdl *mdl);

#endif // PAPERWHITE2_WEATHER_FOG_H
