// Paper White 2: the damage numbers over a foe the team hits (entralink-buffs.md, phase 6). See
// include/paperwhite2/damage_numbers.h.
//
// The numbers are 3D quads drawn after the scene's 3D each frame, in an orthographic projection of the screen's
// pixels, so that each can be any size and see-through (a polygon's alpha) without OBJ, affine parameters or the 2D
// blend registers, which the message window's fade owns. Each digit is a 16 by 32 texture of 16 colours in texture
// VRAM, one per digit and sheet row; each colour tier is a palette of 16 colours in texture palette VRAM (the sheet's,
// with the outline and the tier's four colours over entries 1-5, made by the packer), and a number is drawn in its
// tier's. Both are loaded once a battle, by the VRAM transfer manager.

#include "types.h"
#include "battle/btl_main.h"
#include "battle/btlv_camera.h"
#include "battle/btlv_effect.h"
#include "battle/btlv_mcss.h"
#include "constants/arc.h"
#include "gfl/arc.h"
#include "gfl/heap.h"
#include "gfl/heapsys.h"
#include "nitro/fx.h"
#include "nitro/gx.h"
#include "nitro/math.h"
#include "nitro/mi.h"
#include "nitro/os.h"
#include "nnsys/g3d.h"
#include "nnsys/gfd.h"
#include "paperwhite2/damage_numbers.h"
#include "paperwhite2/entralink_buffs_config.h"
#include "paperwhite2/entralink_run_battle.h"

// The sheet's member (tools/paperwhite2/damage_digits.py): its rows, the cells' size and its tiers, each digit's glyph
// (its first opaque column in its cell and its opaque width), each tier's 16 colours, then the cells
#define DIGIT_COUNT 10
#define CELL_WIDTH 16
#define CELL_HEIGHT 32
#define CELL_BYTES (CELL_WIDTH * CELL_HEIGHT / 2)
#define SHEET_GLYPHS 4
#define SHEET_HEADER_SIZE (SHEET_GLYPHS + 2 * DIGIT_COUNT)
#define PALETTE_COLORS 16
#define PALETTE_SIZE (PALETTE_COLORS * sizeof(u16))
#define SHEET_ROWS_MAX 8
#define PALETTES_SIZE (ENTRALINK_DAMAGE_NUMBERS_TIER_COUNT * PALETTE_SIZE)

// The numbers on screen at once (a new one on a Pokémon sends its last one off), and a number's most digits
#define NUMBER_MAX 6
#define NUMBER_DIGITS_MAX 5
// The frames the loaded file is kept after its transfers are queued, for the V-blank that does them
#define UPLOAD_FRAMES 2

// The screen in the projection's units of 64 pixels, so that a vertex's 16-bit coordinates (at most 8 units) reach
// 512 pixels: a pixel position in fx32 becomes a vertex's by this shift
#define SCREEN_WIDTH 256
#define SCREEN_HEIGHT 192
#define PIXELS_PER_UNIT 64
#define VERTEX_SHIFT 6
// The least room a number keeps from the screen's edges, in pixels
#define SCREEN_MARGIN 4
// The battle camera at rest (btlv_camera.c's BtlvCamera_Create): the sine and cosine of half its field of view (13
// degrees) and its aspect, from which a foe's place is projected whatever the camera does during the attack
#define CAMERA_FOVY_SIN 0x399
#define CAMERA_FOVY_COS 0xf97
#define CAMERA_ASPECT FX32_CONST(1.35)
// A digit's depth. The battle draws its 3D W-buffered (g3d_system.c): a pixel's depth is its w, which an orthographic
// projection makes its scaleW for every vertex. The scene's w is at least 1 (the camera's near plane; MCSS's flat
// sprites and the particles' orthographic projections use 1 too), so each digit's projection takes a scaleW well
// under 1, smaller for each digit drawn later: every digit passes the depth test over the scene, however near a big
// foe's sprite is, and a later digit covers an earlier one's overlap. Its z only has to lie between the near and far
// planes
#define DIGIT_DEPTH_Z (-64)
#define DIGIT_W_FIRST (FX32_ONE / 8)
#define DIGIT_W_STEP 16
// The polygon IDs of the numbers' digits, one a digit of each number, so that see-through digits blend over each
// other
#define POLYGON_ID_FIRST 32
#define ALPHA_OPAQUE 31

typedef struct {
    BOOL active;
    u8 viewPos;
    u8 tier;
    u8 count;
    u8 shine;
    u8 digits[NUMBER_DIGITS_MAX];
    // The frames since it appeared, and the frame its fade starts
    u16 frame;
    u16 fadeStart;
    // Its middle on screen at its normal size, in pixels
    s16 x;
    s16 y;
} DamageNumber;

// Each tier's least damage
static const u32 sTierFrom[ENTRALINK_DAMAGE_NUMBERS_TIER_COUNT] = ENTRALINK_DAMAGE_NUMBERS_TIER_FROM;

static struct {
    BOOL loaded;
    BOOL foeHP;
    u8 rows;
    // Each digit's glyph in its cell: its first opaque column and its opaque width
    u8 glyphLeft[DIGIT_COUNT];
    u8 glyphWidth[DIGIT_COUNT];
    // The file while its transfers wait, the frames left, and whether they were queued
    u8 *file;
    u8 uploadFrames;
    BOOL queued;
    NNSGfdTexKey texKey;
    NNSGfdPlttKey plttKey;
    DamageNumber numbers[NUMBER_MAX];
} sDamageNumbers;

// Whether the battle shows damage numbers (settings' damage_numbers.battles)
static BOOL DamageNumbers_Shown(BtlMainModule *mainModule) {
    BOOL run = BtlSetup_IsBattleType(mainModule, ENTRALINK_RUN_BTL_SETUP_FLAG) != 0;

    switch (ENTRALINK_DAMAGE_NUMBERS_BATTLES) {
    case DAMAGE_NUMBERS_BATTLES_RUN:
        return run;
    case DAMAGE_NUMBERS_BATTLES_ALL:
        return run || !GetCommMode(mainModule);
    default:
        return FALSE;
    }
}

// Queues the digits' and the tiers' palettes' transfers to VRAM
static BOOL DamageNumbers_QueueUpload(void) {
    u8 *palettes = sDamageNumbers.file + SHEET_HEADER_SIZE;
    u32 texSize = sDamageNumbers.rows * DIGIT_COUNT * CELL_BYTES;

    DC_FlushRange(sDamageNumbers.file, SHEET_HEADER_SIZE + PALETTES_SIZE + texSize);
    if (!NNS_GfdRegisterNewVramTransferTask(NNS_GFD_DST_3D_TEX_VRAM, NNS_GfdGetTexKeyAddr(sDamageNumbers.texKey),
                                            palettes + PALETTES_SIZE, texSize)) {
        return FALSE;
    }
    // Should the palettes' task find the queue full, the digits go again with them the next frame
    return NNS_GfdRegisterNewVramTransferTask(NNS_GFD_DST_3D_TEX_PLTT, NNS_GfdGetPlttKeyAddr(sDamageNumbers.plttKey),
                                              palettes, PALETTES_SIZE);
}

void PaperWhite2_DamageNumbersInit(BtlMainModule *mainModule, HeapID heapId) {
    ArcTool *arc;
    u32 size;
    u32 texSize;
    u32 i;

    MI_CpuFill8(&sDamageNumbers, 0, sizeof(sDamageNumbers));
    if (mainModule == NULL) {
        return;
    }
    sDamageNumbers.foeHP =
        ENTRALINK_DAMAGE_NUMBERS_HP_NUMBERS && BtlSetup_IsBattleType(mainModule, ENTRALINK_RUN_BTL_SETUP_FLAG);
    if (!DamageNumbers_Shown(mainModule)) {
        return;
    }
    arc = GFL_ArcSysCreateFileHandle(ARCID_BTLV, HEAPID_TAIL(heapId));
    if (GFL_ArcToolGetDataMax(arc) <= DAMAGE_DIGITS_MEMBER) {
        GFL_ArcToolFree(arc);
        return;
    }
    size = GFL_ArcToolGetDataLength(arc, DAMAGE_DIGITS_MEMBER);
    sDamageNumbers.file = GFL_HeapAllocateCore(heapId, size);
    if (sDamageNumbers.file == NULL) {
        GFL_ArcToolFree(arc);
        return;
    }
    GFL_ArcToolRead(arc, DAMAGE_DIGITS_MEMBER, sDamageNumbers.file);
    GFL_ArcToolFree(arc);
    sDamageNumbers.rows = sDamageNumbers.file[0];
    texSize = sDamageNumbers.rows * DIGIT_COUNT * CELL_BYTES;
    if (sDamageNumbers.rows == 0 || sDamageNumbers.rows > SHEET_ROWS_MAX || sDamageNumbers.file[1] != CELL_WIDTH ||
        sDamageNumbers.file[2] != CELL_HEIGHT || sDamageNumbers.file[3] != ENTRALINK_DAMAGE_NUMBERS_TIER_COUNT ||
        size != SHEET_HEADER_SIZE + PALETTES_SIZE + texSize) {
        GFL_HeapFree(sDamageNumbers.file);
        sDamageNumbers.file = NULL;
        return;
    }
    for (i = 0; i < DIGIT_COUNT; i++) {
        sDamageNumbers.glyphLeft[i] = sDamageNumbers.file[SHEET_GLYPHS + 2 * i];
        sDamageNumbers.glyphWidth[i] = sDamageNumbers.file[SHEET_GLYPHS + 2 * i + 1];
    }
    sDamageNumbers.texKey = NNS_GfdAllocTexVram(texSize, FALSE, 0);
    sDamageNumbers.plttKey = NNS_GfdAllocPlttVram(PALETTES_SIZE, FALSE, 0);
    if (sDamageNumbers.texKey == NNS_GFD_ALLOC_ERROR_TEXKEY || sDamageNumbers.plttKey == NNS_GFD_ALLOC_ERROR_PLTTKEY) {
        PaperWhite2_DamageNumbersExit();
        return;
    }
    sDamageNumbers.queued = DamageNumbers_QueueUpload();
    sDamageNumbers.uploadFrames = UPLOAD_FRAMES;
    sDamageNumbers.loaded = TRUE;
}

void PaperWhite2_DamageNumbersExit(void) {
    if (sDamageNumbers.file != NULL) {
        GFL_HeapFree(sDamageNumbers.file);
        sDamageNumbers.file = NULL;
    }
    if (sDamageNumbers.texKey != NNS_GFD_ALLOC_ERROR_TEXKEY) {
        NNS_GfdFreeTexVram(sDamageNumbers.texKey);
        sDamageNumbers.texKey = NNS_GFD_ALLOC_ERROR_TEXKEY;
    }
    if (sDamageNumbers.plttKey != NNS_GFD_ALLOC_ERROR_PLTTKEY) {
        NNS_GfdFreePlttVram(sDamageNumbers.plttKey);
        sDamageNumbers.plttKey = NNS_GFD_ALLOC_ERROR_PLTTKEY;
    }
    sDamageNumbers.loaded = FALSE;
}

BOOL PaperWhite2_DamageNumbersFoeHP(void) {
    return sDamageNumbers.foeHP;
}

// The Pokémon's place on screen, in pixels, as the battle camera shows it at rest: the camera often zooms in on the
// attack and moves back as the hit lands, so the moment's camera would leave the number off its target
static void DamageNumbers_RestingScreenPos(u32 viewPos, s32 *x, s32 *y) {
    static const VecFx32 up = { 0, FX32_ONE, 0 };
    VecFx32 world;
    VecFx32 camPos;
    VecFx32 target;
    VecFx32 view;
    MtxFx43 camera;
    fx32 depth;

    BtlvMcss_GetDefaultPos(BtlvEffect_GetMcss(), &world, viewPos);
    BtlvCamera_GetDefaultPosTarget(&camPos, &target);
    MTX_LookAt(&camPos, &up, &target, &camera);
    MTX_MultVec43(&world, &camera, &view);
    // The camera looks down its -z; the perspective divides by the depth, scaled to the field of view
    depth = FX_Mul(-view.z, CAMERA_FOVY_SIN);
    if (depth <= 0) {
        *x = SCREEN_WIDTH / 2;
        *y = SCREEN_HEIGHT / 2;
        return;
    }
    *x = SCREEN_WIDTH / 2 +
         FX_Whole(FX_Div(FX_Mul(view.x, CAMERA_FOVY_COS), FX_Mul(depth, CAMERA_ASPECT)) * (SCREEN_WIDTH / 2));
    *y = SCREEN_HEIGHT / 2 - FX_Whole(FX_Div(FX_Mul(view.y, CAMERA_FOVY_COS), depth) * (SCREEN_HEIGHT / 2));
}

void PaperWhite2_DamageNumbersShow(u32 viewPos, u32 damage, u32 flags) {
    DamageNumber *number = NULL;
    s32 x;
    s32 y;
    u32 i;

    if (!sDamageNumbers.loaded) {
        return;
    }
    // A new number sends the last one on the Pokémon off; it takes a free slot, or the oldest
    for (i = 0; i < NUMBER_MAX; i++) {
        DamageNumber *other = &sDamageNumbers.numbers[i];

        if (other->active && other->viewPos == viewPos && other->fadeStart > other->frame) {
            other->fadeStart = other->frame;
        }
        if (number == NULL || (number->active && (!other->active || other->frame > number->frame))) {
            number = other;
        }
    }
    MI_CpuFill8(number, 0, sizeof(*number));
    number->active = TRUE;
    number->viewPos = viewPos;
    i = ENTRALINK_DAMAGE_NUMBERS_TIER_COUNT - 1;
    while (i > 0 && damage < sTierFrom[i]) {
        i--;
    }
    number->tier = i;
    do {
        number->digits[number->count++] = damage % 10;
        damage /= 10;
    } while (damage != 0 && number->count < NUMBER_DIGITS_MAX);
    switch (ENTRALINK_DAMAGE_NUMBERS_SHINE) {
    case DAMAGE_NUMBERS_SHINE_ALWAYS:
        number->shine = TRUE;
        break;
    case DAMAGE_NUMBERS_SHINE_CRITICAL:
        number->shine = (flags & (DAMAGE_NUMBER_CRITICAL | DAMAGE_NUMBER_CAPPED)) != 0;
        break;
    }
    number->fadeStart = ENTRALINK_DAMAGE_NUMBERS_SHRINK_FRAMES + ENTRALINK_DAMAGE_NUMBERS_HOLD_FRAMES;
    DamageNumbers_RestingScreenPos(viewPos, &x, &y);
    number->x = x;
    number->y = y - ENTRALINK_DAMAGE_NUMBERS_HEIGHT;
}

// The digits' cells' left edges at the normal size, from the first glyph's left, and the number's width from there to
// the last glyph's right: each glyph by its own width, overlapping the one before by the settings' overlap, with the
// group space before the thousands
static s32 DamageNumbers_Layout(const DamageNumber *number, s32 *lefts) {
    s32 pen = 0;
    u32 digit;
    u32 i;

    // The digits are kept from the ones up; they go on screen from the highest
    for (i = 0; i < number->count; i++) {
        digit = number->digits[number->count - 1 - i];
        if (i != 0 && (number->count - i) % 3 == 0) {
            pen += ENTRALINK_DAMAGE_NUMBERS_GROUP_SPACE;
        }
        lefts[i] = pen - sDamageNumbers.glyphLeft[digit];
        pen += sDamageNumbers.glyphWidth[digit] - ENTRALINK_DAMAGE_NUMBERS_OVERLAP;
    }
    return pen + ENTRALINK_DAMAGE_NUMBERS_OVERLAP;
}

// A number's middle, in fx32 pixels, kept far enough from the screen's edges for its half size
static fx32 DamageNumbers_Clamp(fx32 middle, fx32 half, s32 screen) {
    fx32 low = SCREEN_MARGIN * FX32_ONE + half;
    fx32 high = (screen - SCREEN_MARGIN) * FX32_ONE - half;

    if (low > high) {
        return screen * FX32_ONE / 2;
    }
    return MATH_MAX(low, MATH_MIN(middle, high));
}

// The number's size as it shrinks into place: from start_scale to 1, fast at first and settling (ease-out, the
// square of the frames left). An elastic curve, overshooting and settling back, would go here
static fx32 DamageNumbers_Scale(u32 frame) {
    s32 left;

    if (frame >= ENTRALINK_DAMAGE_NUMBERS_SHRINK_FRAMES) {
        return FX32_ONE;
    }
    left = ENTRALINK_DAMAGE_NUMBERS_SHRINK_FRAMES - frame;
    return FX32_ONE + (ENTRALINK_DAMAGE_NUMBERS_START_SCALE - 100) * FX32_ONE / 100 * left * left /
                          (ENTRALINK_DAMAGE_NUMBERS_SHRINK_FRAMES * ENTRALINK_DAMAGE_NUMBERS_SHRINK_FRAMES);
}

// Its opacity, of 31: rising as it shrinks, then falling as it fades
static u32 DamageNumbers_Alpha(const DamageNumber *number) {
    u32 alpha = ALPHA_OPAQUE;
    u32 faded;

    if (number->frame < ENTRALINK_DAMAGE_NUMBERS_SHRINK_FRAMES) {
        alpha = ENTRALINK_DAMAGE_NUMBERS_START_ALPHA + (ALPHA_OPAQUE - ENTRALINK_DAMAGE_NUMBERS_START_ALPHA) *
                                                           number->frame / ENTRALINK_DAMAGE_NUMBERS_SHRINK_FRAMES;
    }
    if (number->frame >= number->fadeStart) {
        faded = number->frame - number->fadeStart;
        if (faded >= ENTRALINK_DAMAGE_NUMBERS_FADE_FRAMES) {
            return 0;
        }
        alpha = MATH_MIN(alpha, ALPHA_OPAQUE * (ENTRALINK_DAMAGE_NUMBERS_FADE_FRAMES - faded) /
                                    ENTRALINK_DAMAGE_NUMBERS_FADE_FRAMES);
    }
    return alpha;
}

// The sheet's row a digit shows: its shine's frame once the number lands, the digits one after another, else row 1
static u32 DamageNumbers_Row(const DamageNumber *number, u32 digit) {
    s32 time = number->frame - ENTRALINK_DAMAGE_NUMBERS_SHRINK_FRAMES - digit * ENTRALINK_DAMAGE_NUMBERS_SHINE_DELAY;

    if (!number->shine || time < 0 || time >= (sDamageNumbers.rows - 1) * ENTRALINK_DAMAGE_NUMBERS_SHINE_FRAME_TIME) {
        return 0;
    }
    return 1 + time / ENTRALINK_DAMAGE_NUMBERS_SHINE_FRAME_TIME;
}

static void DamageNumbers_DrawDigit(const DamageNumber *number, u32 slot, u32 digit, u32 row, fx32 left, fx32 top,
                                    fx32 size, u32 alpha) {
    fx16 x0 = left >> VERTEX_SHIFT;
    fx16 x1 = (left + size * CELL_WIDTH) >> VERTEX_SHIFT;
    // The projection's y rises up the screen
    fx16 y0 = -(top >> VERTEX_SHIFT);
    fx16 y1 = -((top + size * CELL_HEIGHT) >> VERTEX_SHIFT);
    u32 cell = row * DIGIT_COUNT + number->digits[number->count - 1 - digit];

    // The screen's pixels in units of 64, in front of all the scene (DIGIT_W_FIRST), each digit drawn nearer
    G3_MtxMode(GX_MTXMODE_PROJECTION);
    G3i_OrthoW_(0, -SCREEN_HEIGHT * FX32_ONE / PIXELS_PER_UNIT, 0, SCREEN_WIDTH * FX32_ONE / PIXELS_PER_UNIT, 0,
                FX32_ONE, DIGIT_W_FIRST - (slot * NUMBER_DIGITS_MAX + digit) * DIGIT_W_STEP, TRUE, NULL);
    G3_MtxMode(GX_MTXMODE_POSITION_VECTOR);

    G3_PolygonAttr(GX_LIGHTMASK_NONE, GX_POLYGONMODE_MODULATE, GX_CULL_NONE,
                   POLYGON_ID_FIRST + slot * NUMBER_DIGITS_MAX + digit, alpha, 0);
    G3_TexImageParam(GX_TEXFMT_PLTT16, GX_TEXGEN_TEXCOORD, GX_TEXSIZE_S16, GX_TEXSIZE_T32, GX_TEXREPEAT_NONE,
                     GX_TEXFLIP_NONE, GX_TEXPLTTCOLOR0_TRNS,
                     NNS_GfdGetTexKeyAddr(sDamageNumbers.texKey) + cell * CELL_BYTES);
    G3_TexPlttBase(NNS_GfdGetPlttKeyAddr(sDamageNumbers.plttKey) + number->tier * PALETTE_SIZE, GX_TEXFMT_PLTT16);
    G3_Begin(GX_BEGIN_QUADS);
    G3_Color(GX_RGB(31, 31, 31));
    G3_TexCoord(0, 0);
    G3_Vtx(x0, y0, DIGIT_DEPTH_Z);
    G3_TexCoord(0, FX32_CONST(CELL_HEIGHT));
    G3_Vtx(x0, y1, DIGIT_DEPTH_Z);
    G3_TexCoord(FX32_CONST(CELL_WIDTH), FX32_CONST(CELL_HEIGHT));
    G3_Vtx(x1, y1, DIGIT_DEPTH_Z);
    G3_TexCoord(FX32_CONST(CELL_WIDTH), 0);
    G3_Vtx(x1, y0, DIGIT_DEPTH_Z);
    G3_End();
}

static void DamageNumbers_DrawNumber(DamageNumber *number, u32 slot) {
    s32 lefts[NUMBER_DIGITS_MAX];
    s32 width = DamageNumbers_Layout(number, lefts);
    fx32 scale = DamageNumbers_Scale(number->frame);
    u32 alpha = DamageNumbers_Alpha(number);
    s32 y = number->y;
    fx32 left;
    fx32 top;
    u32 i;

    if (alpha == 0) {
        return;
    }
    if (number->frame > number->fadeStart) {
        y -= ENTRALINK_DAMAGE_NUMBERS_RISE * (number->frame - number->fadeStart) / ENTRALINK_DAMAGE_NUMBERS_FADE_FRAMES;
    }
    // Kept inside the screen at the size it has now, so that neither its start nor a foe at the edge cuts it off
    left = DamageNumbers_Clamp(number->x * FX32_ONE, width * scale / 2, SCREEN_WIDTH) - width * scale / 2;
    top = DamageNumbers_Clamp(y * FX32_ONE, CELL_HEIGHT * scale / 2, SCREEN_HEIGHT) - CELL_HEIGHT * scale / 2;
    for (i = 0; i < number->count; i++) {
        DamageNumbers_DrawDigit(number, slot, i, DamageNumbers_Row(number, i), left + lefts[i] * scale, top, scale,
                                alpha);
    }
}

void PaperWhite2_DamageNumbersDraw(void) {
    BOOL any = FALSE;
    u32 i;

    if (!sDamageNumbers.loaded) {
        return;
    }
    // The loaded file goes once its transfers are done
    if (sDamageNumbers.file != NULL) {
        if (!sDamageNumbers.queued) {
            sDamageNumbers.queued = DamageNumbers_QueueUpload();
        } else if (sDamageNumbers.uploadFrames == 0) {
            GFL_HeapFree(sDamageNumbers.file);
            sDamageNumbers.file = NULL;
        } else {
            sDamageNumbers.uploadFrames--;
        }
        return;
    }
    for (i = 0; i < NUMBER_MAX; i++) {
        if (sDamageNumbers.numbers[i].active) {
            any = TRUE;
        }
    }
    if (!any) {
        return;
    }
    NNS_G3dGeFlushBuffer();
    G3_MtxMode(GX_MTXMODE_PROJECTION);
    G3_PushMtx();
    G3_MtxMode(GX_MTXMODE_POSITION_VECTOR);
    G3_PushMtx();
    G3_Identity();
    for (i = 0; i < NUMBER_MAX; i++) {
        DamageNumber *number = &sDamageNumbers.numbers[i];

        if (!number->active) {
            continue;
        }
        DamageNumbers_DrawNumber(number, i);
        number->frame++;
        if (number->frame >= number->fadeStart + ENTRALINK_DAMAGE_NUMBERS_FADE_FRAMES) {
            number->active = FALSE;
        }
    }
    G3_PopMtx(1);
    G3_MtxMode(GX_MTXMODE_PROJECTION);
    G3_PopMtx(1);
    G3_MtxMode(GX_MTXMODE_POSITION_VECTOR);
}
