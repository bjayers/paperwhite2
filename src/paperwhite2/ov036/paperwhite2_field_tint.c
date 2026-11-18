#include "types.h"
#include "field/field_fog.h"
#include "field/field_weather.h"
#include "paperwhite2/field_tint.h"
#include "paperwhite2/field_tints_config.h"

// Paper White 2: the hack's own tints (paperwhite2/field_tint.h, docs/paperwhite2/plugins.md's Custom tints).
//
// The fog blends a polygon's colour towards the fog's by a density that the table gives for its depth: index =
// (depth - offset) / (0x400 >> shift), 32 entries of 0 to 127. A flat tint makes every entry its density, so every
// depth takes the same share of the colour; a fog tint scales the game's own ramp (FieldFog_SetDefaultTable) to it, at
// its own shift and offset. Either fades in and out by scaling the table, so the fog's colour and depth stay put and
// only its share grows

// As long as the original's tints take
#define TINT_FADE_IN_FRAMES 90
#define TINT_FADE_OUT_FRAMES 60
// The original's tints' archive, which a weather without graphics names
#define TINT_ARC_ID 0x37
#define FOG_TABLE_SIZE 32
#define FOG_DENSITY_MAX 127

// A tint's style (tools/paperwhite2/field_tints.py's STYLES)
enum {
    TINT_STYLE_FLAT,
    TINT_STYLE_FOG,
};

typedef struct {
    GXRgb color;
    // The density at its thickest, 0 to 127
    u8 density;
    u8 style;
    u16 depthShift;
    u16 offset;
} FieldTint;

typedef struct {
    // The slot's tint, or NULL for a slot the file doesn't fill, which is clear
    const FieldTint *tint;
    // The frames of the fade so far
    int frame;
} FieldTintWork;

typedef union {
    u32 words[FOG_TABLE_SIZE / 4];
    u8 bytes[FOG_TABLE_SIZE];
} FogTable;

static BOOL FieldTint_Init(WeatherTask *task, u32 mode, HeapID heapId);
static BOOL FieldTint_FadeIn(WeatherTask *task, u32 mode, HeapID heapId);
static BOOL FieldTint_InitNoFade(WeatherTask *task, u32 mode, HeapID heapId);
static BOOL FieldTint_Main(WeatherTask *task, u32 mode, HeapID heapId);
static BOOL FieldTint_InitFadeOut(WeatherTask *task, u32 mode, HeapID heapId);
static BOOL FieldTint_FadeOut(WeatherTask *task, u32 mode, HeapID heapId);
static BOOL FieldTint_Exit(WeatherTask *task, u32 mode, HeapID heapId);
static void FieldTint_ObjFunc(WeatherObj *obj);

static const FieldTint sTints[PAPERWHITE2_FIELD_TINT_COUNT] = PAPERWHITE2_FIELD_TINTS;

// The tint on the field, for the light's flush (field_light.c)
static struct {
    BOOL active;
    GXRgb color;
} sFieldTint;

#define FIELD_TINT_WEATHER                                                                                             \
    {                                                                                                                  \
        { TINT_ARC_ID },                                                                                               \
        sizeof(FieldTintWork),                                                                                         \
        {                                                                                                              \
            FieldTint_Init,                                                                                            \
            FieldTint_FadeIn,                                                                                          \
            FieldTint_InitNoFade,                                                                                      \
            FieldTint_Main,                                                                                            \
            FieldTint_InitFadeOut,                                                                                     \
            FieldTint_FadeOut,                                                                                         \
            FieldTint_Exit,                                                                                            \
        },                                                                                                             \
        FieldTint_ObjFunc,                                                                                             \
    }

WeatherData PAPERWHITE2_CUSTOM_TINT_WEATHERS[PAPERWHITE2_CUSTOM_TINT_SLOTS] = {
    FIELD_TINT_WEATHER, FIELD_TINT_WEATHER, FIELD_TINT_WEATHER, FIELD_TINT_WEATHER,
    FIELD_TINT_WEATHER, FIELD_TINT_WEATHER, FIELD_TINT_WEATHER, FIELD_TINT_WEATHER,
    FIELD_TINT_WEATHER, FIELD_TINT_WEATHER, FIELD_TINT_WEATHER, FIELD_TINT_WEATHER,
};

// A weather's tint, or NULL if it isn't one of the tints or its slot is empty
static const FieldTint *FieldTint_Get(const WeatherData *data) {
    u32 slot;

    for (slot = 0; slot < PAPERWHITE2_FIELD_TINT_COUNT; slot++) {
        if (data == &PAPERWHITE2_CUSTOM_TINT_WEATHERS[slot]) {
            return &sTints[slot];
        }
    }
    return NULL;
}

// Sets the fog's table to the tint's share of its density, frame of frames
static void FieldTint_SetDensity(FieldFog *fog, const FieldTint *tint, int frame, int frames) {
    FogTable table;
    u32 density = tint->density * frame / frames;
    u32 i;

    for (i = 0; i < FOG_TABLE_SIZE; i++) {
        if (tint->style == TINT_STYLE_FLAT) {
            table.bytes[i] = density;
        } else {
            // The default table's ramp, 0 to 127
            table.bytes[i] = (i * 4 + i * 4 / FOG_TABLE_SIZE) * density / FOG_DENSITY_MAX;
        }
    }
    FieldFog_SetTable(fog, table.bytes);
}

BOOL PaperWhite2_FieldTint_IsActive(void) {
    return sFieldTint.active;
}

GXRgb PaperWhite2_FieldTint_GetFogColor(GXRgb lightColor) {
    return sFieldTint.active ? sFieldTint.color : lightColor;
}

BOOL PaperWhite2_FieldTint_FollowsPlayer(const WeatherData *data) {
    const FieldTint *tint = FieldTint_Get(data);

    return tint != NULL && tint->style == TINT_STYLE_FOG;
}

static BOOL FieldTint_Init(WeatherTask *task, u32 mode, HeapID heapId) {
    FieldTintWork *work = WeatherTask_GetWorkBuffer(task);

    work->tint = FieldTint_Get(WeatherTask_GetData(task));
    work->frame = 0;
    if (work->tint != NULL && mode == WEATHER_MODE_ALONE) {
        WeatherTask_InitFog(task, work->tint->depthShift, work->tint->offset, mode);
        FieldTint_SetDensity(WeatherTask_GetFog(task), work->tint, 0, 1);
        sFieldTint.active = TRUE;
        sFieldTint.color = work->tint->color;
        WeatherTask_FlushLight(task);
    }
    return TRUE;
}

static BOOL FieldTint_FadeIn(WeatherTask *task, u32 mode, HeapID heapId) {
    FieldTintWork *work = WeatherTask_GetWorkBuffer(task);

    if (work->tint == NULL || mode != WEATHER_MODE_ALONE) {
        return TRUE;
    }
    work->frame++;
    FieldTint_SetDensity(WeatherTask_GetFog(task), work->tint, work->frame, TINT_FADE_IN_FRAMES);
    return work->frame >= TINT_FADE_IN_FRAMES;
}

static BOOL FieldTint_InitNoFade(WeatherTask *task, u32 mode, HeapID heapId) {
    FieldTintWork *work = WeatherTask_GetWorkBuffer(task);

    if (work->tint != NULL && mode == WEATHER_MODE_ALONE) {
        FieldTint_SetDensity(WeatherTask_GetFog(task), work->tint, 1, 1);
    }
    return TRUE;
}

static BOOL FieldTint_Main(WeatherTask *task, u32 mode, HeapID heapId) {
    return FALSE;
}

static BOOL FieldTint_InitFadeOut(WeatherTask *task, u32 mode, HeapID heapId) {
    FieldTintWork *work = WeatherTask_GetWorkBuffer(task);

    work->frame = 0;
    return TRUE;
}

static BOOL FieldTint_FadeOut(WeatherTask *task, u32 mode, HeapID heapId) {
    FieldTintWork *work = WeatherTask_GetWorkBuffer(task);

    if (work->tint == NULL || mode != WEATHER_MODE_ALONE) {
        return TRUE;
    }
    work->frame++;
    FieldTint_SetDensity(WeatherTask_GetFog(task), work->tint, TINT_FADE_OUT_FRAMES - work->frame,
                         TINT_FADE_OUT_FRAMES);
    return work->frame >= TINT_FADE_OUT_FRAMES;
}

// Also when the field closes (mode 0), so a map without the tint never takes its colour
static BOOL FieldTint_Exit(WeatherTask *task, u32 mode, HeapID heapId) {
    FieldTintWork *work = WeatherTask_GetWorkBuffer(task);

    sFieldTint.active = FALSE;
    if (work->tint != NULL && mode == WEATHER_MODE_ALONE) {
        WeatherTask_DisableFog(task, mode);
        WeatherTask_FlushLight(task);
    }
    return TRUE;
}

static void FieldTint_ObjFunc(WeatherObj *obj) {
}
