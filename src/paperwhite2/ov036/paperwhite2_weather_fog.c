#include "types.h"
#include "constants/zones.h"
#include "field/field_camera.h"
#include "field/field_environment.h"
#include "field/field_fog.h"
#include "field/field_internal.h"
#include "field/weather_particles.h"
#include "field/weather_rain.h"
#include "field/weather_sandstorm.h"
#include "nitro/fx.h"
#include "nitro/gx.h"
#include "paperwhite2/weather_fog.h"

// Paper White 2: weather fog that follows the player (paperwhite2/weather_fog.h, docs/paperwhite2/plugins.md's
// Weather and docs/paperwhite2/design/castelia-weather.md).
//
// The fog compares a 15-bit depth: index = (depth - offset) / (0x400 >> shift), and the density rises over 32 indexes.
// A weather's values are kept as they are (its fades and crossfades animate them as in the original) and changed only
// when flushed, by a straight map of depths: the depth at the camera's target on the reference camera goes to the depth
// at the target on this one, and the steps scale by a power of two, the ratio of how fast depth grows with distance at
// the target on the two cameras. So the index at the target is the same, and the ramp around it has the same length
// within a factor of the square root of two (the fog shift is a power of two). Offsets above every weather's own (the
// fades' ends) go on to 0x7fff, so the fog still fades out to nothing however far the camera's far plane is.
//
// The target is the point the camera looks at, which follows the player. It stands in for the player: the camera stops
// at a map's edges while the player walks on, and there a normal town's fog stays with the camera, as it does here

// The reference camera: a normal town's (defaults 0), Z-buffered, its target 237 units away
#define REF_NEAR FX32_ONE
#define REF_FAR FX32_CONST(1024)
#define REF_DISTANCE FX32_CONST(237)
// How far the target's distance may be from the reference's on the reference's planes and keep the weather's values
#define REF_DISTANCE_SLACK FX32_ONE

#define FOG_DEPTH_MAX 0x7fff
#define FOG_SHIFT_MAX 10
// The highest offset a weather fogs at (the thunderstorm's); higher ones are its fades' ends
#define WEATHER_FOG_OFFSET_MAX 0x7f80
// The square root of two, and of a half, in 16.16
#define SQRT2_16 92682
#define SQRT_HALF_16 46341

static struct {
    // Whether the rest is read from a camera yet
    BOOL valid;
    // The camera's defaults whose planes and buffering are below
    u32 defaultsIndex;
    BOOL wBuffer;
    fx32 near;
    fx32 far;
    // Whether the camera is the reference, which keeps the weather's values
    BOOL reference;
    // The depths at the target on the reference camera and on this one
    s32 refTargetDepth;
    s32 targetDepth;
    // The power of two the steps scale by
    s32 stepScale;
    BOOL rearPlaneFog;
} sWeatherFog;

static const u16 sRearPlaneFogZones[] = {
    ZONE_CASTELIA_CITY,    ZONE_CASTELIA_CITY_2,  ZONE_CASTELIA_CITY_3,  ZONE_CASTELIA_CITY_4,  ZONE_CASTELIA_CITY_5,
    ZONE_CASTELIA_CITY_6,  ZONE_CASTELIA_CITY_7,  ZONE_CASTELIA_CITY_8,  ZONE_CASTELIA_CITY_9,  ZONE_CASTELIA_CITY_10,
    ZONE_CASTELIA_CITY_11, ZONE_CASTELIA_CITY_12, ZONE_CASTELIA_CITY_31, ZONE_CASTELIA_CITY_32,
};

BOOL PaperWhite2_WeatherFog_FollowsPlayer(const WeatherData *data) {
    return data == &RAIN_WEATHER || data == &THUNDERSTORM_WEATHER || data == &GUSTY_RAIN_WEATHER ||
           data == &FLAKE_WEATHER || data == &BLIZZARD_WEATHER || data == &FLUTTER_WEATHER || data == &SPECK_WEATHER ||
           data == &SANDSTORM_WEATHER;
}

// 0x7fff times how far the Z-buffer's depth runs from 0 at the near plane to 1 at the far plane, in 16.16
static s64 WeatherFog_ZScale(fx32 near, fx32 far) {
    return ((s64)FOG_DEPTH_MAX * far << 16) / (far - near);
}

// The depth the fog compares at a distance in front of the camera: the Z-buffer's 0x7fff f (d - n) / (d (f - n)), or
// the W-buffer's w, which the projection (W scale 1) makes the distance, in the top 15 bits of the 24-bit depth (8 a
// unit)
static s32 WeatherFog_Depth(BOOL wBuffer, fx32 near, fx32 far, fx32 distance) {
    s32 depth;

    if (distance <= near) {
        return 0;
    }
    if (wBuffer) {
        depth = distance >> 9;
    } else {
        depth = WeatherFog_ZScale(near, far) * (distance - near) / distance >> 16;
    }
    if (depth > FOG_DEPTH_MAX) {
        depth = FOG_DEPTH_MAX;
    }
    return depth;
}

// How fast the depth grows with distance there, in depth a unit, 16.16: the Z-buffer's 0x7fff f n / (d^2 (f - n))
static s64 WeatherFog_DepthSlope(BOOL wBuffer, fx32 near, fx32 far, fx32 distance) {
    if (wBuffer) {
        return 8 << 16;
    }
    if (distance <= near) {
        distance = near;
    }
    return WeatherFog_ZScale(near, far) * near / distance * FX32_ONE / distance;
}

// The power of two nearest a ratio of two slopes (rounded at the square root of two)
static s32 WeatherFog_Log2(s64 numerator, s64 denominator) {
    s64 ratio = (numerator << 16) / denominator;
    s32 power = 0;

    while (ratio >= SQRT2_16) {
        ratio >>= 1;
        power++;
    }
    while (ratio > 0 && ratio < SQRT_HALF_16) {
        ratio <<= 1;
        power--;
    }
    return power;
}

static void WeatherFog_UpdateCamera(FieldCamera *camera) {
    FieldCameraDefaults defaults;
    u32 index = FieldCamera_GetDefaultsIndex(camera);
    VecFx32 eye;
    VecFx32 target;
    fx32 distance;

    if (!sWeatherFog.valid || sWeatherFog.defaultsIndex != index) {
        // The planes and the buffering only change with the defaults, which are read from the archive
        FieldCamera_ReadDefaults(camera, &defaults);
        sWeatherFog.defaultsIndex = index;
        sWeatherFog.wBuffer = defaults.swapMode == GX_BUFFERMODE_W;
        sWeatherFog.near = defaults.zNear;
        sWeatherFog.far = defaults.zFar;
        sWeatherFog.refTargetDepth = WeatherFog_Depth(FALSE, REF_NEAR, REF_FAR, REF_DISTANCE);
        sWeatherFog.valid = TRUE;
    }
    FieldCamera_GetEye(camera, &eye);
    FieldCamera_GetTarget(camera, &target);
    distance = VEC_Distance(&eye, &target);
    sWeatherFog.reference = !sWeatherFog.wBuffer && sWeatherFog.near == REF_NEAR && sWeatherFog.far == REF_FAR &&
                            MATH_ABS(distance - REF_DISTANCE) <= REF_DISTANCE_SLACK;
    sWeatherFog.targetDepth = WeatherFog_Depth(sWeatherFog.wBuffer, sWeatherFog.near, sWeatherFog.far, distance);
    sWeatherFog.stepScale =
        WeatherFog_Log2(WeatherFog_DepthSlope(sWeatherFog.wBuffer, sWeatherFog.near, sWeatherFog.far, distance),
                        WeatherFog_DepthSlope(FALSE, REF_NEAR, REF_FAR, REF_DISTANCE));
}

void PaperWhite2_WeatherFog_Update(Field *field) {
    BOOL rearPlaneFog = FALSE;
    u32 i;

    WeatherFog_UpdateCamera(field->cameraSystem);
    FieldFog_UpdatePlayerRelative(field->fog);
    for (i = 0; i < NELEMS(sRearPlaneFogZones); i++) {
        if (field->zoneId == sRearPlaneFogZones[i]) {
            rearPlaneFog = TRUE;
            break;
        }
    }
    if (sWeatherFog.rearPlaneFog != rearPlaneFog) {
        sWeatherFog.rearPlaneFog = rearPlaneFog;
        FieldLight_Flush(field->lightSystem, TRUE);
    }
}

// An offset on the reference camera mapped to this one, through the depths at the target
static s32 WeatherFog_MapOffset(s32 offset, s32 stepScale) {
    s32 fromTarget = sWeatherFog.refTargetDepth - offset;

    if (stepScale >= 0) {
        fromTarget <<= stepScale;
    } else {
        fromTarget /= 1 << -stepScale;
    }
    return sWeatherFog.targetDepth - fromTarget;
}

void PaperWhite2_WeatherFog_Map(u32 *depthShift, s32 *offset) {
    s32 shift;
    s32 stepScale;
    s32 mapped;
    s32 top;
    s32 knee;

    if (!sWeatherFog.valid || sWeatherFog.reference) {
        return;
    }
    shift = (s32)*depthShift - sWeatherFog.stepScale;
    if (shift < 0) {
        shift = 0;
    } else if (shift > FOG_SHIFT_MAX) {
        shift = FOG_SHIFT_MAX;
    }
    stepScale = (s32)*depthShift - shift;
    mapped = WeatherFog_MapOffset(*offset, stepScale);
    if (*offset > WEATHER_FOG_OFFSET_MAX) {
        // A fade's end: from the highest weather offset's place on to no fog at all
        top = WeatherFog_MapOffset(FOG_DEPTH_MAX, stepScale);
        if (top < FOG_DEPTH_MAX) {
            knee = WeatherFog_MapOffset(WEATHER_FOG_OFFSET_MAX, stepScale);
            mapped = knee + (*offset - WEATHER_FOG_OFFSET_MAX) * (FOG_DEPTH_MAX - knee) /
                                (FOG_DEPTH_MAX - WEATHER_FOG_OFFSET_MAX);
        }
    }
    if (mapped < 0) {
        mapped = 0;
    } else if (mapped > FOG_DEPTH_MAX) {
        mapped = FOG_DEPTH_MAX;
    }
    *depthShift = shift;
    *offset = mapped;
}

BOOL PaperWhite2_WeatherFog_IsRearPlaneFog(void) {
    return sWeatherFog.rearPlaneFog;
}
