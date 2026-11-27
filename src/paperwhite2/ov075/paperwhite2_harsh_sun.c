#include "types.h"
#include "field/field_weather.h"
#include "gfl/clact.h"
#include "gfl/random.h"
#include "nitro/fx.h"
#include "nitro/gx.h"
#include "paperwhite2/harsh_sun.h"
#include "system/rtc.h"

// Paper White 2: harsh sun, WEATHER_HARSH_SUN (paperwhite2/harsh_sun.h, docs/paperwhite2/design/harsh-sun.md), in
// overlay 75 with the particle weathers, whose speck graphics its embers take.
//
// Its light is its own weather light file, faded in as the rain's is; its period entries make the day warm and bright,
// the evening orange and the night warm. The weather fades the strength of overlay 36's shimmer and flare in and out.
// At night it spawns embers: the specks' cells (archive 0x37) on a palette of ember colours, each rising, swaying and
// fading through the cells of its shape from bright yellow to a dim red. They are the weather's OBJs, priority 3 as the
// snow's flakes, so the place name banner and the message boxes draw over them

#define WEATHER_ARC_ID 0x37
// The specks' graphics (overlay 75's SPECK_WEATHER)
#define SPECK_CHARS_FILE 0x1b
#define SPECK_PALETTE_FILE 0x1c
#define SPECK_CELLS_FILE 0x1a
#define SPECK_ANIMS_FILE 0x19
// ARCID_LIGHTS_BATTLE, which the weather overlays pass to the light functions
#define WEATHER_LIGHT_ARC_ID 0x3d

// The frames over which the light fades in (WeatherTask_FadeLight's) and the shimmer and flare fade in and out
#define HARSH_SUN_FADE_IN_FRAMES 60
#define HARSH_SUN_FADE_OUT_FRAMES 40

// A new ember every EMBER_INTERVAL frames at night, living EMBER_LIFE_MIN to EMBER_LIFE_MIN + EMBER_LIFE_RANGE
// frames; the embers that the field opens with at night
#define EMBER_INTERVAL 4
#define EMBER_LIFE_MIN 45
#define EMBER_LIFE_RANGE 40
#define EMBER_PREWARM_COUNT 12
// The rise a frame, in sixteenths of a pixel, and the sway's width in pixels and its step a frame (a turn is 0x10000)
#define EMBER_RISE_MIN 10
#define EMBER_RISE_RANGE 14
#define EMBER_SWAY_MIN 2
#define EMBER_SWAY_STEP_MIN 0x0300
#define EMBER_SWAY_STEP_RANGE 0x0400
// Where embers appear: anywhere across, from this line down
#define EMBER_SPAWN_TOP 64
#define EMBER_SPAWN_HEIGHT 136

// An ember's shapes, by its four shades of the palette from the brightest: the specks' 5-pixel plus and their 4-pixel
// fleck (the cells of the specks' animation)
enum {
    EMBER_SHAPE_PLUS,
    EMBER_SHAPE_FLECK,
    EMBER_SHAPE_COUNT,
};

static const u8 sEmberCells[EMBER_SHAPE_COUNT][4] = {
    { 4, 5, 7, 6 },
    { 11, 10, 9, 8 },
};

// The specks' palette with the embers' shades in its colours 1 to 4, which the cells above draw with
static const GXRgb sEmberPalette[16] = {
    GX_RGB(0, 0, 0), GX_RGB(31, 27, 12), GX_RGB(31, 19, 5), GX_RGB(27, 11, 3), GX_RGB(17, 6, 2), GX_RGB(0, 0, 0),
    GX_RGB(0, 0, 0), GX_RGB(0, 0, 0),    GX_RGB(0, 0, 0),   GX_RGB(0, 0, 0),   GX_RGB(0, 0, 0),  GX_RGB(0, 0, 0),
    GX_RGB(0, 0, 0), GX_RGB(0, 0, 0),    GX_RGB(0, 0, 0),   GX_RGB(0, 0, 0),
};

typedef struct {
    // The shimmer's and flare's strength, 0 to HARSH_SUN_LEVEL_MAX
    int level;
    // Set once the weather fades out: no more embers
    BOOL ending;
    int timer;
} HarshSunWork;

// One ember
typedef struct {
    int frame;
    int lifetime;
    // Its rise a frame and the fraction of a pixel it has risen, in sixteenths
    int rise;
    int riseFraction;
    u16 swayAngle;
    u16 swayStep;
    // The sway's width in pixels and the offset it was last moved by
    s16 swayWidth;
    s16 sway;
    int shape;
} Ember;

static BOOL HarshSun_Init(WeatherTask *task, u32 arg, HeapID heapId);
static BOOL HarshSun_FadeIn(WeatherTask *task, u32 arg, HeapID heapId);
static BOOL HarshSun_InitNoFade(WeatherTask *task, u32 arg, HeapID heapId);
static BOOL HarshSun_Main(WeatherTask *task, u32 arg, HeapID heapId);
static BOOL HarshSun_InitFadeOut(WeatherTask *task, u32 arg, HeapID heapId);
static BOOL HarshSun_FadeOut(WeatherTask *task, u32 arg, HeapID heapId);
static BOOL HarshSun_Exit(WeatherTask *task, u32 arg, HeapID heapId);
static void Ember_Move(WeatherObj *obj);
static void Ember_Add(WeatherTask *task, int count, HeapID heapId);

WeatherData PAPERWHITE2_HARSH_SUN_WEATHER = {
    { WEATHER_ARC_ID, 1, 0, SPECK_CHARS_FILE, SPECK_PALETTE_FILE, SPECK_CELLS_FILE, SPECK_ANIMS_FILE },
    sizeof(HarshSunWork),
    {
        HarshSun_Init,
        HarshSun_FadeIn,
        HarshSun_InitNoFade,
        HarshSun_Main,
        HarshSun_InitFadeOut,
        HarshSun_FadeOut,
        HarshSun_Exit,
    },
    Ember_Move,
};

// Whether the embers rise: at night and at midnight
static BOOL HarshSun_IsNight(WeatherTask *task) {
    return GetRealTimeDayPeriod(WeatherTask_GetSeason(task)) >= DAY_PERIOD_NIGHT;
}

// The embers move with the camera, as the snow's flakes do
static void HarshSun_FollowCamera(WeatherTask *task) {
    int x;
    int y;

    WeatherTask_GetCameraScroll(task, &x, &y);
    WeatherTask_ShiftParticles(task, x, y);
}

static BOOL HarshSun_Init(WeatherTask *task, u32 arg, HeapID heapId) {
    HarshSunWork *work = WeatherTask_GetWorkBuffer(task);

    WeatherTask_SetupSpawner(task, 1, EMBER_INTERVAL, 1, EMBER_INTERVAL, 0, 1, 0, Ember_Add);
    WeatherTask_SetParticlePalette(task, sEmberPalette);
    work->level = 0;
    work->ending = FALSE;
    work->timer = 0;
    WeatherTask_SaveCameraPos(task);
    return TRUE;
}

static BOOL HarshSun_FadeIn(WeatherTask *task, u32 arg, HeapID heapId) {
    HarshSunWork *work = WeatherTask_GetWorkBuffer(task);

    if (work->timer == 0) {
        WeatherTask_FadeLight(task, WEATHER_LIGHT_ARC_ID, HARSH_SUN_LIGHT_FILE);
    }
    work->timer++;
    work->level = HARSH_SUN_LEVEL_MAX * work->timer / HARSH_SUN_FADE_IN_FRAMES;
    PaperWhite2_HarshSun_SetLevel(work->level);
    WeatherTask_StepSpawnTimer(task, heapId);
    HarshSun_FollowCamera(task);
    return work->timer >= HARSH_SUN_FADE_IN_FRAMES;
}

static BOOL HarshSun_InitNoFade(WeatherTask *task, u32 arg, HeapID heapId) {
    HarshSunWork *work = WeatherTask_GetWorkBuffer(task);

    WeatherTask_SetLight(task, WEATHER_LIGHT_ARC_ID, HARSH_SUN_LIGHT_FILE);
    work->level = HARSH_SUN_LEVEL_MAX;
    PaperWhite2_HarshSun_SetLevel(work->level);
    WeatherTask_PrewarmParticles(task, Ember_Add, EMBER_PREWARM_COUNT, EMBER_LIFE_MIN / EMBER_PREWARM_COUNT, 1, heapId);
    return TRUE;
}

static BOOL HarshSun_Main(WeatherTask *task, u32 arg, HeapID heapId) {
    HarshSunWork *work = WeatherTask_GetWorkBuffer(task);

    PaperWhite2_HarshSun_SetLevel(work->level);
    WeatherTask_StepSpawnTimer(task, heapId);
    HarshSun_FollowCamera(task);
    return FALSE;
}

static BOOL HarshSun_InitFadeOut(WeatherTask *task, u32 arg, HeapID heapId) {
    HarshSunWork *work = WeatherTask_GetWorkBuffer(task);

    work->ending = TRUE;
    work->timer = 0;
    return TRUE;
}

static BOOL HarshSun_FadeOut(WeatherTask *task, u32 arg, HeapID heapId) {
    HarshSunWork *work = WeatherTask_GetWorkBuffer(task);

    if (work->timer < HARSH_SUN_FADE_OUT_FRAMES) {
        work->timer++;
        work->level = HARSH_SUN_LEVEL_MAX * (HARSH_SUN_FADE_OUT_FRAMES - work->timer) / HARSH_SUN_FADE_OUT_FRAMES;
        PaperWhite2_HarshSun_SetLevel(work->level);
    }
    HarshSun_FollowCamera(task);
    return work->timer >= HARSH_SUN_FADE_OUT_FRAMES && !WeatherTask_GetParticleCount(task);
}

// Also when the field closes (mode 0)
static BOOL HarshSun_Exit(WeatherTask *task, u32 arg, HeapID heapId) {
    PaperWhite2_HarshSun_SetLevel(0);
    WeatherTask_ResetLight(task, arg);
    return TRUE;
}

// The ember's cell by its age: dim as it lights, bright, then dimmer to the end
static u16 Ember_GetCell(const Ember *ember) {
    int age = ember->frame * 16 / ember->lifetime;
    int shade;

    if (age < 2) {
        shade = 2;
    } else if (age < 8) {
        shade = 0;
    } else if (age < 11) {
        shade = 1;
    } else if (age < 14) {
        shade = 2;
    } else {
        shade = 3;
    }
    return sEmberCells[ember->shape][shade];
}

// Rises by its speed, sways from side to side and fades; it goes when its life is over or it has left the top
static void Ember_Move(WeatherObj *obj) {
    Ember *ember = WeatherTask_GetParticleWork(obj);
    ClActorPos pos;
    s16 sway;

    if (++ember->frame >= ember->lifetime) {
        WeatherTask_RemoveParticle(obj);
        return;
    }
    WeatherTask_GetParticlePos(obj, &pos);
    ember->riseFraction += ember->rise;
    pos.y -= ember->riseFraction >> 4;
    ember->riseFraction &= 0xf;
    ember->swayAngle += ember->swayStep;
    sway = FX_SinIdx(ember->swayAngle) * ember->swayWidth >> FX16_SHIFT;
    pos.x += sway - ember->sway;
    ember->sway = sway;
    if (pos.y < -8) {
        WeatherTask_RemoveParticle(obj);
        return;
    }
    WeatherTask_SetParticlePos(obj, &pos);
    ClActor_SetAnimFrame(WeatherTask_GetParticleActor(obj), Ember_GetCell(ember));
}

// Adds embers at night, none by day or once the weather fades out
static void Ember_Add(WeatherTask *task, int count, HeapID heapId) {
    HarshSunWork *work = WeatherTask_GetWorkBuffer(task);
    int i;

    if (work->ending || !HarshSun_IsNight(task)) {
        return;
    }
    for (i = 0; i < count; i++) {
        WeatherObj *obj = WeatherTask_AddParticle(task, heapId);
        Ember *ember;
        u32 a;
        u32 b;
        ClActorPos pos;

        if (obj == NULL) {
            break;
        }
        ember = WeatherTask_GetParticleWork(obj);
        a = GFL_RandomLC(0);
        b = GFL_RandomLC(0);
        ember->frame = 0;
        ember->lifetime = EMBER_LIFE_MIN + a % EMBER_LIFE_RANGE;
        ember->rise = EMBER_RISE_MIN + b % EMBER_RISE_RANGE;
        ember->riseFraction = 0;
        ember->swayAngle = a >> 16;
        ember->swayStep = EMBER_SWAY_STEP_MIN + b % EMBER_SWAY_STEP_RANGE;
        ember->swayWidth = EMBER_SWAY_MIN + (a >> 8) % 2;
        ember->sway = 0;
        ember->shape = (b >> 8) % 3 == 0 ? EMBER_SHAPE_PLUS : EMBER_SHAPE_FLECK;
        pos.x = (a >> 4) % 256;
        pos.y = EMBER_SPAWN_TOP + (b >> 4) % EMBER_SPAWN_HEIGHT;
        WeatherTask_SetParticlePos(obj, &pos);
        ClActor_SetAnimFrame(WeatherTask_GetParticleActor(obj), Ember_GetCell(ember));
    }
}
