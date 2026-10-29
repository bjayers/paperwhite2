#ifndef POKEBW2_FIELD_FIELD_ENVIRONMENT_H
#define POKEBW2_FIELD_FIELD_ENVIRONMENT_H

// Function names from swan (https://github.com/ds-pokemon-hacking/swan, GPL-3.0)

#include "types.h"
#include "gfl/g3d.h"
#include "gfl/heap.h"
#include "nitro/fx.h"
#include "nitro/gx.h"
#include "struct_decls.h"

// The most light setups a file of the field's lights (ARCID_LIGHTS_FIELD) has
#define FIELD_LIGHT_MAX_ENTRIES 16

// A light setup at a time of day, an entry of a file of the field's lights: the day period it ends at
// (GetLightChangeHoursForSeasons) and the minutes after that period's hour, which of the four lights are on, their
// colors and directions, and the material colors: diffuse, ambient, specular, emission, then the fog's color and the
// clear color
typedef struct {
    u16 period;
    s16 minute;
    u8 enabled[4];
    GXRgb colors[4];
    VecFx16 dirs[4];
    GXRgb materials[6];
} FieldLightEntry;

FieldLight *Field_GetLightSystem(Field *field);
FieldFogCtrl *Field_GetFogCtrl(Field *field);
FieldWeather *Field_GetWeatherSystem(Field *field);
u16 FieldWeather_GetWeatherId(FieldWeather *weatherSystem);
u32 Field_GetWeatherForZone(Field *field, u16 zoneId);
// field_light.c: the field's lights, which follow the time of day
FieldLight *FieldLight_Create(u32 lightsId, s32 daySeconds, u32 season, FieldFog *fog, G3DLight *lights, HeapID heapId);
void FieldLight_Free(FieldLight *light);
void FieldLight_Update(FieldLight *light, s32 daySeconds);
// Sends the lights to the geometry engine if they changed, or always with force
void FieldLight_Flush(FieldLight *light, BOOL force);
// Fades to the light setups of file fileId of archive arcId over frames, or back to the zone's own
void FieldLight_ChangeData(FieldLight *light, u32 arcId, u32 fileId, u32 frames);
void FieldLight_ChangeDataDefault(FieldLight *light);
// Flashes the lights to a color over frames, and back over returnFrames, or without fading back
void FieldLight_StartFlash(FieldLight *light, u16 color, u32 frames, u32 returnFrames);
void FieldLight_StartFlashOneWay(FieldLight *light, u16 color, u32 frames);
BOOL FieldLight_IsFlashRunning(FieldLight *light);

#endif // POKEBW2_FIELD_FIELD_ENVIRONMENT_H
