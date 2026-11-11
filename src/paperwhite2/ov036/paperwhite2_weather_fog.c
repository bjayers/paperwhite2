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
#include "nitro/os.h"
#include "nnsys/g3d.h"
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

// The W-buffer's depth a unit of distance, in the 15 bits the fog compares: the 24-bit depth is w, which the
// projection (W scale 1) makes the distance in 1/4096 units (GBATEK), so 4096 / 512. DeSmuME's W-buffer fog doesn't
// follow it, so only hardware can check it: a lower value puts a W-buffered camera's fog closer
#define W_BUFFER_DEPTH_PER_UNIT 8
// How many of the 32 steps of density a W-buffered camera's fog is thicker at its target than a normal town's. Paper
// White 2's choice, after the 3DS showed the waterfront's fog (Castelia's only W-buffered weather camera) a bit far,
// then a tad far at 6: 8 is a quarter more (rain 41% to 66%, thunderstorm 31% to 56%); 0 matches a normal town
#define W_BUFFER_FOG_EXTRA_STEPS 8

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
    // Whether light 2 is the fog's colour (PaperWhite2_WeatherFog_IsSkyFogged), and the fog's colour
    BOOL skyFogged;
    GXRgb fogColor;
} sWeatherFog;

// Castelia's gates, which stood out of a weather's fog beside the player, by material and, where the material draws
// other things too, shape (an empty name: every shape of it):
// - castelia_city_4's gate_4 at the street's north end and castelia_city_5's c3_gate_2, white light boxes. Their
//   shapes have no normals, so no light reaches them: their display lists give each vertex its colour (white, and
//   greys for the shading)
// - the waterfront's green gate to Skyarrow Bridge by Thumb Pier, castelia_city_c3_00_01's c3_kanban shape polygon11
//   (the rest of c3_kanban is the waterfront's signboards). It is lit by light 0, whose colour a weather's light file
//   leaves as bright as Castelia's own by day, and with the material's full ambient it stays saturated white
// While the sky's light is the fog's colour, their colour commands are scaled by it and their normal commands become
// colour commands of the fog's colour, as if they were lit by the sky's light alone; otherwise they are their own
typedef struct {
    NNSG3dResName material;
    NNSG3dResName shape;
} WeatherFogGate;

static const WeatherFogGate sGates[] = {
    { { "gate_4" }, { "" } },
    { { "c3_gate_2" }, { "" } },
    { { "c3_kanban" }, { "polygon11" } },
};

// The most colour and normal commands a gate's display lists have (gate_4 has 28 colours)
#define GATE_COMMAND_MAX 32

// A gate's colour and normal commands in the model last drawn with it: each one's opcode and parameter and their own
// values, and the fog's colour they are scaled by (0x8000: their own)
typedef struct {
    NNSG3dResMdl *mdl;
    u32 count;
    u8 *opcodes[GATE_COMMAND_MAX];
    u32 *params[GATE_COMMAND_MAX];
    u8 ownOpcodes[GATE_COMMAND_MAX];
    u32 ownParams[GATE_COMMAND_MAX];
    u32 scale;
} WeatherFogGateCommands;

static WeatherFogGateCommands sGateCommands[NELEMS(sGates)];

#define GATE_SCALE_NONE 0x8000

// The parameters a model's render commands (SBC) take, by opcode with its flags, as the map models use them
// (tools/data/map_model_data.py's SBC_PARAMS); -1 for one the walk doesn't know
static s32 WeatherFog_SbcParams(u8 op) {
    switch (op) {
    case 0x00:
    case 0x01:
    case 0x0b:
    case 0x2b:
    case 0x40:
    case 0x80:
        return 0;
    case 0x03:
    case 0x04:
    case 0x05:
    case 0x07:
    case 0x08:
    case 0x24:
    case 0x44:
        return 1;
    case 0x02:
    case 0x0c:
    case 0x0d:
    case 0x47:
        return 2;
    case 0x06:
        return 3;
    case 0x26:
    case 0x46:
        return 4;
    case 0x66:
        return 5;
    }
    return -1;
}

// The parameters of a geometry command of a display list, as the map models use them; -1 for one it doesn't know
static s32 WeatherFog_GxParams(u8 op) {
    switch (op) {
    case 0x00:
    case 0x41:
        return 0;
    case 0x14:
    case 0x20:
    case 0x21:
    case 0x22:
    case 0x24:
    case 0x25:
    case 0x26:
    case 0x27:
    case 0x28:
    case 0x40:
        return 1;
    case 0x23:
        return 2;
    case 0x1b:
        return 3;
    }
    return -1;
}

// The geometry commands a gate's colours are in: a vertex's colour, and a normal, from which the lights give it one
#define GX_OP_COLOR 0x20
#define GX_OP_NORMAL 0x21

// Notes the colour and normal commands of a shape's display list
static void WeatherFog_ReadShapeCommands(WeatherFogGateCommands *gate, NNSG3dResShpData *shape) {
    u32 *cursor = (u32 *)((u8 *)shape + shape->ofsDL);
    u32 *end = (u32 *)((u8 *)cursor + shape->sizeDL);
    u8 *ops;
    s32 params;
    u32 i;

    // Four opcodes packed in a word, then their parameters
    while (cursor < end) {
        ops = (u8 *)cursor++;
        for (i = 0; i < 4; i++) {
            params = WeatherFog_GxParams(ops[i]);
            if (params < 0) {
                return;
            }
            if ((ops[i] == GX_OP_COLOR || ops[i] == GX_OP_NORMAL) && gate->count < GATE_COMMAND_MAX) {
                gate->opcodes[gate->count] = &ops[i];
                gate->params[gate->count] = cursor;
                gate->ownOpcodes[gate->count] = ops[i];
                gate->ownParams[gate->count] = *cursor;
                gate->count++;
            }
            cursor += params;
        }
    }
}

// Whether a shape is a gate's: any shape of its material, or the one it names
static BOOL WeatherFog_IsGateShape(const WeatherFogGate *gate, NNSG3dResShp *shp, u32 index) {
    const NNSG3dResName *name;

    if (gate->shape.val[0] == 0) {
        return TRUE;
    }
    name = NNS_G3dGetResNameByIdx(&shp->dict, index);
    return name->val[0] == gate->shape.val[0] && name->val[1] == gate->shape.val[1] &&
           name->val[2] == gate->shape.val[2] && name->val[3] == gate->shape.val[3];
}

// Notes the colour and normal commands of a gate's shapes in a model, walking its render commands
static void WeatherFog_ReadGateCommands(WeatherFogGateCommands *gate, const WeatherFogGate *data, NNSG3dResMdl *mdl,
                                        int matIndex) {
    u8 *cursor = (u8 *)mdl + mdl->ofsSbc;
    NNSG3dResShp *shp = NNS_G3dGetShp(mdl);
    int material = -1;
    s32 params;
    u8 op;

    gate->mdl = mdl;
    gate->count = 0;
    gate->scale = GATE_SCALE_NONE;
    while ((op = *cursor++) != 0x01) {
        params = op == 0x09 ? 2 + 3 * cursor[1] : WeatherFog_SbcParams(op);
        if (params < 0) {
            return;
        }
        if (op == 0x04 || op == 0x24 || op == 0x44) {
            material = cursor[0];
        } else if (op == 0x05 && material == matIndex && WeatherFog_IsGateShape(data, shp, cursor[0])) {
            WeatherFog_ReadShapeCommands(gate, NNS_G3dGetShpDataByIdx(shp, cursor[0]));
        }
        cursor += params;
    }
}

// A colour scaled by another, as a light of that colour lights it
static GXRgb WeatherFog_ScaleColor(GXRgb color, u32 scale) {
    u32 r = (color & GX_RGB_R_MASK) >> GX_RGB_R_SHIFT;
    u32 g = (color & GX_RGB_G_MASK) >> GX_RGB_G_SHIFT;
    u32 b = (color & GX_RGB_B_MASK) >> GX_RGB_B_SHIFT;

    r = r * ((scale & GX_RGB_R_MASK) >> GX_RGB_R_SHIFT) / 31;
    g = g * ((scale & GX_RGB_G_MASK) >> GX_RGB_G_SHIFT) / 31;
    b = b * ((scale & GX_RGB_B_MASK) >> GX_RGB_B_SHIFT) / 31;
    return GX_RGB(r, g, b);
}

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
// the W-buffer's, W_BUFFER_DEPTH_PER_UNIT a unit
static s32 WeatherFog_Depth(BOOL wBuffer, fx32 near, fx32 far, fx32 distance) {
    s32 depth;

    if (distance <= near) {
        return 0;
    }
    if (wBuffer) {
        depth = distance * W_BUFFER_DEPTH_PER_UNIT >> FX32_SHIFT;
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
        return W_BUFFER_DEPTH_PER_UNIT << 16;
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
    if (sWeatherFog.rearPlaneFog != rearPlaneFog ||
        sWeatherFog.skyFogged != PaperWhite2_WeatherFog_IsSkyFogged(field->fog)) {
        sWeatherFog.rearPlaneFog = rearPlaneFog;
        sWeatherFog.skyFogged = PaperWhite2_WeatherFog_IsSkyFogged(field->fog);
        FieldLight_Flush(field->lightSystem, TRUE);
    }
    sWeatherFog.fogColor = FieldFog_GetColor(field->fog);
}

// An offset on the reference camera mapped to this one, through the depths at the target, and a W-buffered camera's
// extra steps of density
static s32 WeatherFog_MapOffset(s32 offset, s32 shift, s32 stepScale) {
    s32 fromTarget = sWeatherFog.refTargetDepth - offset;

    if (stepScale >= 0) {
        fromTarget <<= stepScale;
    } else {
        fromTarget /= 1 << -stepScale;
    }
    if (sWeatherFog.wBuffer) {
        fromTarget += W_BUFFER_FOG_EXTRA_STEPS * (0x400 >> shift);
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
    mapped = WeatherFog_MapOffset(*offset, shift, stepScale);
    if (*offset > WEATHER_FOG_OFFSET_MAX) {
        // A fade's end: from the highest weather offset's place on to no fog at all
        top = WeatherFog_MapOffset(FOG_DEPTH_MAX, shift, stepScale);
        if (top < FOG_DEPTH_MAX) {
            knee = WeatherFog_MapOffset(WEATHER_FOG_OFFSET_MAX, shift, stepScale);
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

BOOL PaperWhite2_WeatherFog_IsSkyFogged(FieldFog *fog) {
    return sWeatherFog.rearPlaneFog && FieldFog_IsEnabled(fog);
}

void PaperWhite2_WeatherFog_UpdateMapModel(NNSG3dResMdl *mdl) {
    NNSG3dResMat *mat;
    WeatherFogGateCommands *gate;
    int index;
    u32 scale;
    u32 i;
    u32 j;

    if (!sWeatherFog.rearPlaneFog || (mat = NNS_G3dGetMat(mdl)) == NULL) {
        return;
    }
    scale = sWeatherFog.skyFogged ? sWeatherFog.fogColor : GATE_SCALE_NONE;
    for (i = 0; i < NELEMS(sGates); i++) {
        index = NNS_G3dGetResDictIdxByName(&mat->dict, &sGates[i].material);
        if (index < 0) {
            continue;
        }
        gate = &sGateCommands[i];
        if (gate->mdl != mdl) {
            // A model loaded again has its own commands
            WeatherFog_ReadGateCommands(gate, &sGates[i], mdl, index);
        }
        if (gate->scale == scale) {
            continue;
        }
        gate->scale = scale;
        for (j = 0; j < gate->count; j++) {
            if (scale == GATE_SCALE_NONE) {
                *gate->opcodes[j] = gate->ownOpcodes[j];
                *gate->params[j] = gate->ownParams[j];
            } else {
                *gate->opcodes[j] = GX_OP_COLOR;
                *gate->params[j] = WeatherFog_ScaleColor(
                    gate->ownOpcodes[j] == GX_OP_COLOR ? gate->ownParams[j] & 0x7fff : GX_RGB(31, 31, 31), scale);
            }
            DC_FlushRange(gate->opcodes[j], sizeof(u8));
            DC_FlushRange(gate->params[j], sizeof(u32));
        }
    }
}
