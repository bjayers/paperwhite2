#include "types.h"
#include "field/field.h"
#include "field/field_camera.h"
#include "field/field_exp_obj.h"
#include "field/field_internal.h"
#include "field/field_lens_flare.h"
#include "gfl/heap.h"
#include "gfl/tcb.h"
#include "nitro/fx.h"
#include "nitro/gx.h"
#include "paperwhite2/harsh_sun.h"
#include "system/game_data.h"
#include "system/rtc.h"

// Paper White 2: harsh sun's field effects, the heat shimmer and the lens flare (paperwhite2/harsh_sun.h,
// docs/paperwhite2/design/harsh-sun.md). The weather (overlay 75) sets their strength; this follows the time of day.
//
// The shimmer moves the 3D layer (BG0, the map, its actors and its fog) by a pixel left or right on some lines, from
// the HBlank interrupt: a sine wave over the lines that drifts with the frames, on the far part of the scene only
// (SHIMMER_FULL_LINES lines from the top, fading out over SHIMMER_FADE_LINES more), so the player and the ground near
// them never move. The 2D layers (the message window, the banner, the OBJs) aren't moved.
//
// The flare is the vanilla lens flare's 3D scene (field_goout_effect.c, archive 0xe8): the season's day flare by day,
// the evening flare in the evening. Harsh sun loads it into the lens flare's scene when the field has none (the field
// loads one only for a building's exit into a sunny zone, which harsh sun isn't), places it before the camera each
// frame as the vanilla flare is placed, and holds its animations at a frame that goes slowly between FLARE_BRIGHT_FRAME
// and FLARE_DIM_FRAME and back, so the flare pulses. The flare's animations start at their brightest and fade out by
// FLARE_FADED_FRAME (measured in DeSmuME: the top left corner's brightness falls steadily from frame 0 to about frame
// 28, and past frame 30 the animations show their start again), so the weather's fades move the frame toward
// FLARE_FADED_FRAME. A vanilla flare that plays (a building's exit) is left to play

// The lens flare's scene of the field's 3D objects (field_goout_effect.c), its animations, its evening flare and the
// free heap it asks for
#define LENS_FLARE_SCENE 3
#define LENS_FLARE_ANM_COUNT 4
#define LENS_FLARE_EVENING 4
#define LENS_FLARE_HEAP_MIN 15000

// The frames the flare's animations are held between, and the step of its pulse a frame (a turn is 0x10000)
// (the brightest, the dimmest of the pulse, and faded out), and the step of its pulse a frame (a turn is 0x10000)
#define FLARE_BRIGHT_FRAME 6
#define FLARE_DIM_FRAME 16
#define FLARE_FADED_FRAME 28
#define FLARE_PULSE_STEP (0x10000 / 150)

// The shimmer's lines: full on the first SHIMMER_FULL_LINES, fading to none over the next SHIMMER_FADE_LINES; its wave,
// SHIMMER_WAVE_LINES lines long, and its drift a frame (a turn is 0x10000)
#define SHIMMER_LINES 192
#define SHIMMER_FULL_LINES 40
#define SHIMMER_FADE_LINES 24
#define SHIMMER_WAVE_LINES 28
#define SHIMMER_DRIFT_STEP 0x0600

// The display's lines a frame, visible and blank
#define DISPLAY_LINES 263

static struct {
    // The strength the weather set, 0 to HARSH_SUN_LEVEL_MAX
    u8 level;
    // The flare that harsh sun loaded into the lens flare's scene, plus 1, or 0
    u8 ownedFlare;
    // Whether harsh sun shows the flare
    u8 shown;
    u16 pulse;
    u16 drift;
    // The field's 3D objects while harsh sun shows its flare there
    FieldExpObjSystem *expObjSys;
    TCB *hblank;
    // Each line's offset of the 3D layer
    s8 offsets[SHIMMER_LINES];
} sHarshSun;

static void HarshSun_ShimmerHBlank(TCB *tcb, void *data);
static void HarshSun_UpdateShimmer(u32 level);
static void HarshSun_StopShimmer(void);
static void HarshSun_UpdateFlare(Field *field, u32 flare);
static void HarshSun_HideFlare(void);

void PaperWhite2_HarshSun_SetLevel(u32 level) {
    sHarshSun.level = level;
    if (level == 0) {
        HarshSun_StopShimmer();
        HarshSun_HideFlare();
    }
}

void PaperWhite2_HarshSun_Update(Field *field) {
    u32 flare = LENS_FLARE_NONE;
    u32 shimmer = 0;

    if (sHarshSun.level == 0) {
        return;
    }
    switch (Field_GetDayPeriod(field)) {
    case DAY_PERIOD_MORNING:
    case DAY_PERIOD_DAY:
        flare = GameData_GetSeason(field->gameData);
        shimmer = sHarshSun.level;
        break;
    case DAY_PERIOD_EVENING:
        flare = LENS_FLARE_EVENING;
        break;
    }
    HarshSun_UpdateShimmer(shimmer);
    HarshSun_UpdateFlare(field, flare);
}

void PaperWhite2_HarshSun_FieldEnd(void) {
    HarshSun_StopShimmer();
    HarshSun_HideFlare();
    sHarshSun.expObjSys = NULL;
    sHarshSun.ownedFlare = 0;
    sHarshSun.shown = FALSE;
}

// The offset of the line after this one, written in this line's HBlank; the last blank line writes the first line's
static void HarshSun_ShimmerHBlank(TCB *tcb, void *data) {
    u32 line = GX_GetVCount() + 1;

    if (line >= DISPLAY_LINES) {
        line = 0;
    }
    if (line < SHIMMER_LINES && GX_IsHBlank()) {
        G2_SetBG0Offset(sHarshSun.offsets[line], 0);
    }
}

static void HarshSun_UpdateShimmer(u32 level) {
    u32 line;
    s32 weight;

    if (level == 0) {
        HarshSun_StopShimmer();
        return;
    }
    sHarshSun.drift += SHIMMER_DRIFT_STEP;
    for (line = 0; line < SHIMMER_LINES; line++) {
        if (line < SHIMMER_FULL_LINES) {
            weight = FX32_ONE;
        } else if (line < SHIMMER_FULL_LINES + SHIMMER_FADE_LINES) {
            weight = FX32_ONE * (SHIMMER_FULL_LINES + SHIMMER_FADE_LINES - line) / SHIMMER_FADE_LINES;
        } else {
            weight = 0;
        }
        weight = weight * level / HARSH_SUN_LEVEL_MAX;
        // A pixel at the wave's top, rounded: so -1, 0 or 1
        sHarshSun.offsets[line] =
            (FX_SinIdx((line * 0x10000 / SHIMMER_WAVE_LINES + sHarshSun.drift) & 0xffff) * weight +
             FX32_ONE * FX32_ONE / 2) >>
            (2 * FX32_SHIFT);
    }
    if (sHarshSun.hblank == NULL) {
        sHarshSun.hblank = GFL_HBlankTCBAdd(HarshSun_ShimmerHBlank, NULL, 0);
    }
}

static void HarshSun_StopShimmer(void) {
    if (sHarshSun.hblank != NULL) {
        GFL_TCBRemove(sHarshSun.hblank);
        sHarshSun.hblank = NULL;
        G2_SetBG0Offset(0, 0);
    }
}

static void HarshSun_UpdateFlare(Field *field, u32 flare) {
    FieldLensFlare *lensFlare = field->lensFlare;
    FieldExpObjSystem *expObjSys = field->expObjSystem;
    fx32 frame;
    u32 i;

    // A building's exit plays the vanilla flare in the same scene
    if (lensFlare->requested) {
        sHarshSun.shown = FALSE;
        return;
    }
    if (flare == LENS_FLARE_NONE) {
        HarshSun_HideFlare();
        return;
    }
    if (lensFlare->effectId == LENS_FLARE_NONE && sHarshSun.ownedFlare != flare + 1) {
        HarshSun_HideFlare();
        if (GFL_HeapGetFreeSize(field->heapId) < LENS_FLARE_HEAP_MIN) {
            return;
        }
        FieldLensFlare_Load(expObjSys, lensFlare->ownedData, flare);
        sHarshSun.ownedFlare = flare + 1;
    }
    sHarshSun.expObjSys = expObjSys;
    sHarshSun.pulse += FLARE_PULSE_STEP;
    // From FLARE_BRIGHT_FRAME to FLARE_DIM_FRAME and back, moved toward FLARE_FADED_FRAME as the strength falls
    frame = FLARE_BRIGHT_FRAME * FX32_ONE +
            (FLARE_DIM_FRAME - FLARE_BRIGHT_FRAME) * (FX32_ONE - FX_CosIdx(sHarshSun.pulse)) / 2;
    frame =
        FLARE_FADED_FRAME * FX32_ONE - (FLARE_FADED_FRAME * FX32_ONE - frame) * sHarshSun.level / HARSH_SUN_LEVEL_MAX;
    for (i = 0; i < LENS_FLARE_ANM_COUNT; i++) {
        FieldExpObj_SetAnm(expObjSys, LENS_FLARE_SCENE, 0, i, TRUE);
        FieldExpObjAnm_SetPaused(FieldExpObj_GetAnmInfo(expObjSys, LENS_FLARE_SCENE, 0, i), TRUE);
        FieldExpObj_SetAnmFrame(expObjSys, LENS_FLARE_SCENE, 0, i, frame);
    }
    FieldLensFlare_CalcPos(lensFlare, FieldCamera_GetG3DCamera(field->cameraSystem));
    FieldExpObj_SetActorHidden(expObjSys, LENS_FLARE_SCENE, 0, FALSE);
    sHarshSun.shown = TRUE;
}

// Hides harsh sun's flare and frees the one it loaded
static void HarshSun_HideFlare(void) {
    if (sHarshSun.expObjSys == NULL) {
        return;
    }
    if (sHarshSun.shown) {
        FieldExpObj_SetActorHidden(sHarshSun.expObjSys, LENS_FLARE_SCENE, 0, TRUE);
        sHarshSun.shown = FALSE;
    }
    if (sHarshSun.ownedFlare != 0) {
        FieldExpObj_FreeScene(sHarshSun.expObjSys, LENS_FLARE_SCENE);
        sHarshSun.ownedFlare = 0;
    }
}
