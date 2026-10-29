#include "types.h"
#include "constants/sound.h"
#include "field/field_actor.h"
#include "field/field_actor_internal.h"
#include "gfl/arc.h"
#include "gfl/billboard_actor.h"
#include "gfl/g3d.h"
#include "gfl/heap.h"
#include "gfl/heapsys.h"
#include "gfl/sound.h"
#include "nitro/fx.h"
#include "nitro/gx.h"
#include "nitro/mi.h"
#include "nnsys/g3d.h"
#include "paperwhite2/following_effects.h"
#include "paperwhite2/following_field.h"
#include "paperwhite2/following_render.h"
#include "paperwhite2/following_render_math.h"

// Paper White 2: the Following Pokémon's ball effects, ported from Pokeweb's effects.c. The ball and the send-out
// flash are HeartGold's models (files 20 to 22 of ARCID_MMODEL_TBL), drawn as G3D actors; the recall's silhouette and
// the bubbles are billboards of private scenes, with their own resources, so neither a retail palette nor a material
// is changed. The original read its effects and emotes from NARCs of its own and checked the effects' size and CRC-32
// against a record its installer wrote; the files are now members of the model table, which the packer writes
// together, and that check is gone. Its FollowingEffectsDebug, a block of values for its emulator tests, isn't ported

// The effects that play: the send-out, the recall and the refused switch's cue
enum {
    EFFECT_NONE,
    EFFECT_OUT,
    EFFECT_RECALL,
    EFFECT_CUE,
};

// The two bright colors of the send-out flash's palette (BGR555), in which the recall draws the follower's sheet:
// a little of its light and dark stays in the silhouette
#define SILHOUETTE_LIGHT_CYAN GX_RGB(19, 28, 31)
#define SILHOUETTE_WHITE GX_RGB(31, 31, 31)

// The frames of each effect: the send-out's ball shows for its first two, and the recall's silhouette for its first
// RECALL_SPRITE_TICKS
#define OUT_TICKS 10
#define OUT_BALL_TICKS 2
#define RECALL_TICKS 12
#define RECALL_SPRITE_TICKS 8
// The frames that the closed ball stays up for a refused switch, and how many of them shake it a pixel either way
#define CUE_TICKS 30
#define CUE_SHAKE 12

// The ball stands this far in front of the follower's position
#define BALL_FORWARD (6 * FX32_ONE)

// The field heap that loading the effects, the silhouette or a bubble leaves
#define HEAP_KEPT_EFFECTS 0x10000
#define HEAP_KEPT_EMOTE 0x8000

// The kind of a texture block: "TEX0"
#define TEX0_KIND ('T' | 'E' << 8 | 'X' << 16 | (u32)'0' << 24)

// A sheet the outline is measured on is at most this big, with at most this many frames
#define OUTLINE_TEX_MAX (128 * 1024)
#define OUTLINE_FRAMES_MAX 8
// A texture's data starts after the TEX0 block's header
#define OUTLINE_TEX_START_MIN 60

// The most bytes of a sheet's palette that the silhouette recolors, 256 colors
#define SILHOUETTE_PALETTE_MAX 512

// A bubble frame: a 32 by 32 PLTT16 texture, as billboard.c's material format 0 and size code
#define EMOTE_SIZE 32
#define EMOTE_FORMAT_PLTT16 0
#define EMOTE_TEX_SIZE (GX_TEXSIZE_S32 << 4 | GX_TEXSIZE_T32)
// The scale of a bubble before the draw sets it from the body's
#define EMOTE_SCALE (2 * FX32_ONE)
// A body whose scale is this or more is a 64-pixel one
#define LARGE_SCALE (3 * FX32_ONE)
// Eight source pixels of air above the opaque head. One pixel still cut the raised body
#define HEAD_CLEAR 8

// The resources freed a few frames late. The GPU draws the frame the field queued, which still names their texture
// keys: a land waits two field ticks before GFL_G3DResFreeTexData, and so do a bubble's end and a new silhouette. A map
// teardown doesn't: the field's clock stops while a load, a battle or a menu has the overlay, so a two-tick wait would
// free them on the first frames of the next field and streak that picture. Those resources belong to the old
// allocator: they are dropped, and the next 3D setup takes the banks back
#define HELD_COUNT 4
#define HELD_TICKS 2u

typedef struct {
    G3DResource *white;
    G3DAnimation *animation;
    G3DResource *resources[3];
    G3DModel *models[2];
    G3DActor *actors[2];
    G3DResource *emote[2];
    u32 tick;
    BOOL drop;
} FollowingEffectsHeld;

// The ball's file is HeartGold's, 768 bytes: one 16 by 16 4bpp texture at its TEX0 block's 0x90 and an 8-color
// palette, its last 16 bytes. The balls' art has up to 15 colors, so the loaded file is moved to a block 16 bytes
// longer with a 16-color palette before its first upload; GFL_G3DResFree frees that block as it would the original.
// A swap rewrites both in place and sends them again to the same VRAM keys (GFL_G3DResUploadTexDataCore)
#define BALL_FILE_SIZE 768u
#define BALL_TEX0_OFFSET 480u
#define BALL_PIXELS_OFFSET 0x90u
#define BALL_PALETTE_OFFSET 0x110u
#define BALL_TEX_SIZE (FOLLOWING_BALL_TEXTURE_SIZE / 8)
#define BALL_PALETTE_SIZE_HGSS 2
#define BALL_PALETTE_SIZE (FOLLOWING_BALL_PALETTE_SIZE / 8)
#define BALL_GROWTH (FOLLOWING_BALL_PALETTE_SIZE - 16)
// The heap that the larger file leaves. GFL_HeapAllocateCore returns NULL when the heap is full, where
// GFL_HeapAllocate would halt
#define BALL_HEAP_KEPT 4096u
// The ball shown when the follower's isn't one with its own art
#define BALL_POKE 4

// The closed ball that rests where a recalled follower waits. It isn't an effect, so it never holds one up, and any
// effect draws in its place. It hops a step an update while it moves, and lands before it stops. A recall or a cue
// that starts on it moves with it, hop and all, so the shrink into the ball and the refusal's shake follow the trail
typedef struct {
    VecFx32 at;
    u8 on;
    u8 step;
    u8 bounce;
} FollowingRestBall;

#define BOUNCE_TICKS 10u
#define HOP_STEPS 8u

typedef struct {
    G3DResource *resources[3];
    G3DModel *models[2];
    G3DActor *actors[2];
    G3DAnimation *animation;
    G3DResource *white;
    u16 whiteId;
    // 1 once loaded, -1 while loading or after the archive lacked the effects, 0 to load
    s32 ready;
    s32 mode;
    s32 age;
    BOOL snapshot;
    // The rows of each frame of the white sheet whose top and bottom pixels are opaque, for the bubble's height
    u8 outlineTop[OUTLINE_FRAMES_MAX];
    u8 outlineBottom[OUTLINE_FRAMES_MAX];
    u8 outlineSize;
    u8 outlineFrames;
    BillboardActorScene scene;
    BillboardActor billboard;
    BillboardActorMaterial material;
    BillboardActorMaterial whiteMaterial;
    SRTMatrix transform;
    // The ball's one material, which LightBall writes before each draw
    NNSG3dResMatData *ballMaterial;
} FollowingEffects;

// A bubble: its two frames, and its own scene of one quad
typedef struct {
    G3DResource *resources[2];
    BillboardActorScene scene;
    BillboardActor billboard;
    BillboardActorMaterial material[2];
    BOOL active;
    u32 frame;
    FieldActor *actor;
    u8 bottomInset[2];
    // The bind and the first submit mustn't be in the same scan: the first draw after the bind is skipped
    u8 hold;
} FollowingEmote;

static FollowingEffects sFx;
static FieldActor *sPlayer;
// The graphics archive's count of files, from the registry. The retail archive has 975, but the followers' sprites
// extend it
static u16 sResourceCount;
// The model table that the effects were loaded through, which the balls' art is read from
static ArcTool *sArc;
// The actor system the effects were loaded for, whose actors' scene lights the ball
static MMSys *sSystem;
static FollowingEffectsHeld sHeld[HELD_COUNT];
static u32 sClock;
static BOOL sDrop;
// The ball ID in the ball's texture, 0 while HeartGold's art is still there and can't be swapped; and the follower's
static u8 sBallShown;
static u8 sBallWant = BALL_POKE;
static FollowingRestBall sRest;
static FollowingEmote sEmote;

static const u8 sBounce[BOUNCE_TICKS] = { 0, 3, 5, 6, 5, 3, 0, 1, 1, 0 };

static BOOL Init(MMSys *system);
static void DrawEmote(G3DCamera *camera, G3DLight *lights);

// GFL_G3DResUploadTexData, which BillboardActorMaterial_BindTexture also calls, is NNS_G3dTexLoad(tex, TRUE): it maps
// the texture banks to the CPU, copies, and maps them back. The 3D engine reads those banks on every line it renders,
// from line 214 through line 191 of the next frame, so a call from the field's update blanks the lines rendered during
// the copy: a line across the screen on a follower's first draw and on a bubble. The game binds the sheets of the
// NPCs that appear in a map from a VBlank task (FldActSys_AsyncMatLoadTCBFunc). Emulators render the frame at once and
// never show it. Each upload starts after the VBlank interrupt has run and well before line 214. The bound is more
// than a frame, and only matters if the line never moves
#define VRAM_WINDOW_FIRST_LINE 193
#define VRAM_WINDOW_LAST_LINE 204
#define VRAM_WINDOW_SPINS 0x100000

static void WaitVramWindow(void) {
    u32 spins;

    for (spins = 0; spins < VRAM_WINDOW_SPINS; spins++) {
        u32 line = GX_GetVCount() & 0x1ff;

        if (line >= VRAM_WINDOW_FIRST_LINE && line <= VRAM_WINDOW_LAST_LINE) {
            return;
        }
    }
}

// The rows of the first and last opaque pixels of each frame of a sheet of linear 4bpp size by size frames, whose
// index 0 is transparent: the count of frames, or 0 when the sheet isn't one. Measured on the private resource before
// its upload, since the field's own materials may have dropped their pixels already, and only two bytes a frame kept
static u32 MeasureOutline(const NNSG3dResTex *texture, u32 size, u8 *top, u8 *bottom) {
    u32 length;
    u32 start;
    u32 total;
    u32 stride;
    u32 frames;
    const u8 *pixels;
    u32 frame;
    u32 y;
    u32 x;

    if (texture == NULL || (size != 32 && size != 64) || texture->header.kind != TEX0_KIND) {
        return 0;
    }
    length = texture->texInfo.sizeTex * 8u;
    start = texture->texInfo.ofsTex;
    total = texture->header.size;
    stride = size * size / 2;
    frames = length >> (size == 64 ? 11 : 9);
    if (frames == 0 || frames > OUTLINE_FRAMES_MAX || (length & (stride - 1)) || total > OUTLINE_TEX_MAX ||
        start < OUTLINE_TEX_START_MIN || start > total || length > total - start) {
        return 0;
    }
    pixels = (const u8 *)texture + start;
    for (frame = 0; frame < frames; frame++) {
        top[frame] = (u8)size;
        bottom[frame] = 0;
        for (y = 0; y < size; y++) {
            const u8 *row = pixels + frame * stride + y * (size / 2);

            for (x = 0; x < size / 2; x++) {
                if (row[x] != 0) {
                    if (top[frame] == size) {
                        top[frame] = (u8)y;
                    }
                    bottom[frame] = (u8)y;
                    break;
                }
            }
        }
    }
    return frames;
}

static BOOL IsHeldUsed(const FollowingEffectsHeld *held) {
    u32 i;

    if (held->white != NULL || held->animation != NULL) {
        return TRUE;
    }
    for (i = 0; i < 3; i++) {
        if (held->resources[i] != NULL) {
            return TRUE;
        }
    }
    for (i = 0; i < 2; i++) {
        if (held->models[i] != NULL || held->actors[i] != NULL || held->emote[i] != NULL) {
            return TRUE;
        }
    }
    return FALSE;
}

static void ReleaseHeld(FollowingEffectsHeld *held) {
    u32 i;

    if (held->drop) {
        MI_CpuClear32(held, sizeof(*held));
        return;
    }
    if (held->white != NULL) {
        GFL_G3DResFreeTexData(held->white);
        GFL_G3DResFree(held->white);
        held->white = NULL;
    }
    for (i = 0; i < 2; i++) {
        if (held->actors[i] != NULL) {
            GFL_G3DActorFree(held->actors[i]);
            held->actors[i] = NULL;
        }
    }
    if (held->animation != NULL) {
        GFL_G3DAnmFree(held->animation);
        held->animation = NULL;
    }
    for (i = 0; i < 2; i++) {
        if (held->models[i] != NULL) {
            GFL_G3DMdlFree(held->models[i]);
            held->models[i] = NULL;
        }
    }
    // The animation has no textures of its own
    for (i = 0; i < 3; i++) {
        if (held->resources[i] != NULL) {
            if (i < 2) {
                GFL_G3DResFreeTexData(held->resources[i]);
            }
            GFL_G3DResFree(held->resources[i]);
            held->resources[i] = NULL;
        }
    }
    for (i = 0; i < 2; i++) {
        if (held->emote[i] != NULL) {
            GFL_G3DResFreeTexData(held->emote[i]);
            GFL_G3DResFree(held->emote[i]);
            held->emote[i] = NULL;
        }
    }
}

static void PumpHeld(void) {
    u32 i;

    for (i = 0; i < HELD_COUNT; i++) {
        if (IsHeldUsed(&sHeld[i]) && (sHeld[i].drop || sClock - sHeld[i].tick >= HELD_TICKS)) {
            ReleaseHeld(&sHeld[i]);
        }
    }
}

// A free slot of the held resources, or the oldest's, freed now
static FollowingEffectsHeld *OpenHeld(void) {
    u32 i;
    u32 oldest;

    for (i = 0; i < HELD_COUNT; i++) {
        if (!IsHeldUsed(&sHeld[i])) {
            sHeld[i].tick = sClock;
            sHeld[i].drop = sDrop;
            return &sHeld[i];
        }
    }
    oldest = 0;
    for (i = 1; i < HELD_COUNT; i++) {
        if (sClock - sHeld[i].tick > sClock - sHeld[oldest].tick) {
            oldest = i;
        }
    }
    ReleaseHeld(&sHeld[oldest]);
    sHeld[oldest].tick = sClock;
    sHeld[oldest].drop = sDrop;
    return &sHeld[oldest];
}

static void ClearWhiteKeys(void) {
    sFx.snapshot = FALSE;
    sFx.outlineFrames = 0;
    sFx.whiteMaterial.texKey = 0;
    sFx.whiteMaterial.plttKey = 0;
}

static void FreeWhite(void) {
    if (sFx.white != NULL) {
        FollowingEffectsHeld *held = OpenHeld();

        held->white = sFx.white;
        sFx.white = NULL;
    }
    ClearWhiteKeys();
}

static void HoldEffects(void) {
    FollowingEffectsHeld *held;
    BOOL any = sFx.white != NULL || sFx.animation != NULL;
    u32 i;

    for (i = 0; i < 3 && !any; i++) {
        if (sFx.resources[i] != NULL) {
            any = TRUE;
        }
    }
    for (i = 0; i < 2 && !any; i++) {
        if (sFx.models[i] != NULL || sFx.actors[i] != NULL) {
            any = TRUE;
        }
    }
    if (!any) {
        ClearWhiteKeys();
        return;
    }
    held = OpenHeld();
    held->white = sFx.white;
    sFx.white = NULL;
    held->animation = sFx.animation;
    sFx.animation = NULL;
    for (i = 0; i < 3; i++) {
        held->resources[i] = sFx.resources[i];
        sFx.resources[i] = NULL;
    }
    for (i = 0; i < 2; i++) {
        held->models[i] = sFx.models[i];
        sFx.models[i] = NULL;
        held->actors[i] = sFx.actors[i];
        sFx.actors[i] = NULL;
    }
    ClearWhiteKeys();
}

void FollowingEffects_Cancel(void) {
    sFx.mode = EFFECT_NONE;
}

void FollowingEffects_SetResourceCount(u32 count) {
    if (count > 0xffff) {
        count = 0;
    }
    if (sResourceCount != count) {
        FreeWhite();
    }
    sResourceCount = (u16)count;
}

void FollowingEffects_Destroy(void) {
    // An unload, a battle and a new actor system all come here. The clock doesn't move while this overlay is gone, so a
    // late GFL_G3DResFreeTexData would run on the first frames the field is shown again: the held resources are dropped
    sPlayer = NULL;
    sDrop = TRUE;
    FollowingEffects_EmoteEnd();
    FollowingEffects_RestAt(NULL);
    FollowingEffects_Cancel();
    HoldEffects();
    PumpHeld();
    sDrop = FALSE;
    sFx.ready = 0;
    sArc = NULL;
    sSystem = NULL;
}

void FollowingEffects_Warm(MMSys *system) {
    // The effects' banks alone, while a door or return fade is up. A submit of the follower's billboard under that fade
    // put the loading screen's lines back, and a bubble's VRAM stays with the talk's bind. BindTexture writes the
    // material it is given and returns no key, and the next 3D setup takes back a bank allocated under this fade, so a
    // copied key would draw an empty quad
    if (sFx.ready) {
        return;
    }
    if (GFL_HeapGetFreeSize(system->fieldHeapId) < HEAP_KEPT_EFFECTS) {
        return;
    }
    Init(system);
}

// Moves the ball's file to a block with room for a 16-color palette, when it is HeartGold's file and the balls' art is
// there
static BOOL GrowBall(void) {
    G3DResource *resource = sFx.resources[0];
    NNSG3dResFileHeader *old = GFL_G3DResGetResData(resource);
    // The offsets of the file's blocks follow its header: the model's, then the textures'
    const u32 *blocks = (const u32 *)(old + 1);
    const NNSG3dResTex *tex = (const NNSG3dResTex *)((const u8 *)old + BALL_TEX0_OFFSET);
    HeapID heapId;
    NNSG3dResFileHeader *grown;
    NNSG3dResTex *grownTex;

    if (old->fileSize != BALL_FILE_SIZE || blocks[1] != BALL_TEX0_OFFSET || tex->header.kind != TEX0_KIND ||
        tex->header.size != BALL_FILE_SIZE - BALL_TEX0_OFFSET || tex->texInfo.sizeTex != BALL_TEX_SIZE ||
        tex->texInfo.ofsTex != BALL_PIXELS_OFFSET || tex->plttInfo.sizePltt != BALL_PALETTE_SIZE_HGSS ||
        tex->plttInfo.ofsPlttData != BALL_PALETTE_OFFSET) {
        return FALSE;
    }
    // The original read the balls' art from its own code; without the file, HeartGold's ball stays
    if (GFL_ArcToolGetDataMax(sArc) <= FOLLOWING_EFFECTS_FILE_BALLS ||
        GFL_ArcToolGetDataLength(sArc, FOLLOWING_EFFECTS_FILE_BALLS) !=
            FOLLOWING_BALL_COUNT * FOLLOWING_BALL_RECORD_SIZE) {
        return FALSE;
    }
    // The resources were read into the 3D system's heap, so it is there. The original also returned FALSE without the
    // 3D system, which can't happen once its resources are read
    heapId = GFL_G3DSysGetHeapID();
    if (GFL_HeapGetFreeSize(heapId) < BALL_HEAP_KEPT) {
        return FALSE;
    }
    grown = GFL_HeapAllocateCore(heapId, BALL_FILE_SIZE + BALL_GROWTH);
    if (grown == NULL) {
        return FALSE;
    }
    MI_CpuCopy8(old, grown, BALL_FILE_SIZE);
    MI_CpuFill8((u8 *)grown + BALL_FILE_SIZE, 0, BALL_GROWTH);
    grown->fileSize = BALL_FILE_SIZE + BALL_GROWTH;
    grownTex = (NNSG3dResTex *)((u8 *)grown + BALL_TEX0_OFFSET);
    grownTex->header.size += BALL_GROWTH;
    grownTex->plttInfo.sizePltt = BALL_PALETTE_SIZE;
    GFL_G3DResSetResData(resource, grown);
    GFL_HeapFree(old);
    return TRUE;
}

// Writes a ball's art over the grown file's texture and palette
static void PutBall(u32 ball) {
    NNSG3dResTex *tex = GFL_G3DResGetTexData(sFx.resources[0]);
    u32 record = (ball - 1) * FOLLOWING_BALL_RECORD_SIZE;

    GFL_ArcToolReadRange(sArc, FOLLOWING_EFFECTS_FILE_BALLS, record, FOLLOWING_BALL_TEXTURE_SIZE,
                         (u8 *)tex + tex->texInfo.ofsTex);
    GFL_ArcToolReadRange(sArc, FOLLOWING_EFFECTS_FILE_BALLS, record + FOLLOWING_BALL_TEXTURE_SIZE,
                         FOLLOWING_BALL_PALETTE_SIZE, (u8 *)tex + tex->plttInfo.ofsPlttData);
    sBallShown = (u8)ball;
}

// Between effects only: a recall keeps the ball it began with
static void ApplyBall(void) {
    if (sFx.ready != 1 || sBallShown == 0 || sBallShown == sBallWant) {
        return;
    }
    PutBall(sBallWant);
    WaitVramWindow();
    GFL_G3DResUploadTexDataCore(sFx.resources[0]);
}

void FollowingEffects_SetBall(u32 ball) {
    sBallWant = (u8)(ball != 0 && ball <= FOLLOWING_BALL_COUNT ? ball : BALL_POKE);
    if (sFx.mode == EFFECT_NONE) {
        ApplyBall();
    }
}

// A held free may still own the last map's heap: the partial load goes to the held resources, and the next try comes
// once a tick frees them
static BOOL StopInit(void) {
    HoldEffects();
    sFx.ready = 0;
    return FALSE;
}

static BOOL Init(MMSys *system) {
    ArcTool *arc = system->actorConfigArc;
    u32 i;

    if (sFx.ready) {
        return sFx.ready > 0;
    }
    sFx.ready = -1;
    // A model table without the effects stays without them: there is nothing to wait for
    if (arc == NULL || GFL_ArcToolGetDataMax(arc) <= FOLLOWING_EFFECTS_FILE_FLASH_ANIMATION) {
        return FALSE;
    }
    sArc = arc;
    sSystem = system;
    for (i = 0; i < 3; i++) {
        sFx.resources[i] = GFL_G3DSysReadArcToolResource(arc, FOLLOWING_EFFECTS_FILE_BALL + i);
        if (sFx.resources[i] == NULL) {
            return StopInit();
        }
    }
    // Without the art or room for the larger palette, HeartGold's ball stays, never swapped
    sBallShown = 0;
    if (GrowBall()) {
        PutBall(sBallWant);
    }
    for (i = 0; i < 2; i++) {
        WaitVramWindow();
        if (!GFL_G3DResUploadTexData(sFx.resources[i])) {
            return StopInit();
        }
        sFx.models[i] = GFL_G3DMdlCreate(sFx.resources[i], 0, sFx.resources[i]);
        if (sFx.models[i] == NULL) {
            return StopInit();
        }
    }
    sFx.animation = GFL_G3DAnmCreate(sFx.models[1], sFx.resources[2], 0);
    if (sFx.animation == NULL) {
        return StopInit();
    }
    sFx.actors[0] = GFL_G3DActorCreate(sFx.models[0], NULL, 0);
    sFx.actors[1] = GFL_G3DActorCreate(sFx.models[1], &sFx.animation, 1);
    if (sFx.actors[0] == NULL || sFx.actors[1] == NULL) {
        return StopInit();
    }
    GFL_G3DActorBindAnm(sFx.actors[1], 0);
    sFx.ballMaterial = NNS_G3dGetMatDataByIdx(
        NNS_G3dGetMat(NNS_G3dGetMdlByIdx(NNS_G3dGetMdlSet(GFL_G3DResGetResData(sFx.resources[0])), 0)), 0);
    sFx.transform.scale.x = FX32_ONE;
    sFx.transform.scale.y = FX32_ONE;
    sFx.transform.scale.z = FX32_ONE;
    sFx.transform.rotation.m[0][0] = FX32_ONE;
    sFx.transform.rotation.m[1][1] = FX32_ONE;
    sFx.transform.rotation.m[2][2] = FX32_ONE;
    sFx.ready = 1;
    return TRUE;
}

// A color's lightness, its green counting most
static u32 GetLightness(u32 color) {
    return 3u * (color & 31u) + 6u * ((color >> 5) & 31u) + ((color >> 10) & 31u);
}

void FollowingEffects_Prepare(FieldActor *actor) {
    MMSys *system = actor->actorSystem;
    u16 id;
    NNSG3dResTex *tex;
    u32 length;
    u16 *palette;
    u32 count;
    u32 minLight;
    u32 maxLight;
    u32 middle;
    u32 i;

    if (sFx.mode != EFFECT_NONE || GFL_HeapGetFreeSize(system->fieldHeapId) < HEAP_KEPT_EFFECTS || !Init(system)) {
        return;
    }
    id = actor->config.rscIndices.res1;
    if (sFx.white != NULL && sFx.whiteId == id) {
        return;
    }
    FreeWhite();
    sFx.whiteId = id;
    if (sResourceCount == 0 || id >= sResourceCount) {
        return;
    }
    // The actor's own sheet, a second copy of the graphics archive's file
    sFx.white = GFL_G3DSysReadArcToolResource(system->dataArc, id);
    if (sFx.white == NULL) {
        return;
    }
    tex = GFL_G3DResGetTexData(sFx.white);
    if (tex == NULL) {
        FreeWhite();
        return;
    }
    sFx.outlineSize = actor->config.billboardSize == ACTOR_BILLBOARD_SIZE_64 ? 64 : 32;
    sFx.outlineFrames = (u8)MeasureOutline(tex, sFx.outlineSize, sFx.outlineTop, sFx.outlineBottom);
    length = NNS_G3dPlttGetRequiredSize(tex);
    palette = GFL_G3DResGetTexPaletteData(sFx.white);
    if (palette == NULL || length > SILHOUETTE_PALETTE_MAX || length == 0) {
        FreeWhite();
        return;
    }
    // The colors lighter than halfway between the darkest and the lightest go white, the rest light cyan; a sheet of
    // one lightness alternates
    count = length / 2;
    minLight = ~0u;
    maxLight = 0;
    for (i = 1; i < count; i++) {
        u32 light = GetLightness(palette[i]);

        if (light < minLight) {
            minLight = light;
        }
        if (light > maxLight) {
            maxLight = light;
        }
    }
    middle = minLight + (maxLight - minLight) / 2u;
    for (i = 0; i < count; i++) {
        BOOL white = minLight == maxLight ? (i & 1u) : GetLightness(palette[i]) > middle;

        palette[i] = i != 0 && white ? SILHOUETTE_WHITE : SILHOUETTE_LIGHT_CYAN;
    }
    WaitVramWindow();
    PaperWhite2_BillboardActorMaterialBindTexture(&sFx.whiteMaterial, sFx.white);
    if (sFx.whiteMaterial.texKey == 0 || sFx.whiteMaterial.plttKey == 0) {
        FreeWhite();
    }
}

// The actor's quad in the field's billboards, through its handle in its billboard work
static BillboardActor *GetQuad(FieldActor *actor, BillboardActorScene **scene) {
    FieldBillboardActor *fieldBillboard = FldActSys_GetFieldBillboardActor(actor->actorSystem);
    BillboardActorSys *system;
    const u16 *work;
    u32 index;

    if (fieldBillboard == NULL) {
        return NULL;
    }
    system = FieldBillboardActor_GetBillboardActorSys(fieldBillboard);
    if (system == NULL) {
        return NULL;
    }
    *scene = system->scene;
    // The actor's billboard work starts with its handle
    work = FldAct_GetBillboardActorWorkPtr(actor);
    if (*scene == NULL || *work >= system->handleCount) {
        return NULL;
    }
    index = system->handles[*work].actor;
    if (index >= (*scene)->setup.actorCount) {
        return NULL;
    }
    return &(*scene)->actors[index];
}

void FollowingEffects_Snapshot(FieldActor *actor) {
    BillboardActorScene *scene;
    BillboardActor *quad;
    FollowingEffectPose submitted;

    if (sFx.white == NULL || sFx.mode == EFFECT_RECALL || (actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN)) {
        return;
    }
    quad = GetQuad(actor, &scene);
    if (quad == NULL || quad->material >= scene->setup.materialCount) {
        return;
    }
    sFx.billboard = *quad;
    sFx.material = scene->materials[quad->material];
    // The field's header isn't copied: the recall's flash is a second submit
    FollowingRender_PrivateScene(&sFx.scene, scene, &sFx.billboard, &sFx.material, 1, 1);
    sFx.scene.setup.diffuse = GX_RGB(31, 31, 31);
    sFx.scene.setup.ambient = GX_RGB(31, 31, 31);
    sFx.scene.setup.specular = 0;
    sFx.scene.setup.emission = 0;
    sFx.billboard.material = 0;
    // The field's lights stay, and the quad is drawn: clearing both left a loaded silhouette invisible
    sFx.billboard.visible = TRUE;
    if (FollowingRender_EffectPose(actor, &sFx.billboard.pos, &submitted)) {
        sFx.billboard.pos = submitted.position;
        sFx.billboard.scaleX = submitted.scaleX;
        sFx.billboard.scaleY = submitted.scaleY;
    }
    // The faces' layout stays the field's; the white sheet's keys, already in VRAM, are bound
    sFx.material.texResource = sFx.white;
    sFx.material.texAddr = sFx.whiteMaterial.texAddr;
    sFx.material.plttAddr = sFx.whiteMaterial.plttAddr;
    sFx.material.texKey = sFx.whiteMaterial.texKey;
    sFx.material.plttKey = sFx.whiteMaterial.plttKey;
    sFx.snapshot = TRUE;
}

static void SetBallAt(const VecFx32 *at) {
    sFx.transform.translation = *at;
    sFx.transform.translation.z += BALL_FORWARD;
}

void FollowingEffects_Out(FieldActor *actor) {
    if (sFx.ready != 1) {
        return;
    }
    ApplyBall();
    SetBallAt(&actor->wPos);
    sFx.mode = EFFECT_OUT;
    sFx.age = 0;
}

void FollowingEffects_Recall(FieldActor *actor) {
    if (sFx.ready != 1 || sFx.mode == EFFECT_RECALL) {
        return;
    }
    SetBallAt(&actor->wPos);
    sFx.mode = EFFECT_RECALL;
    sFx.age = 0;
    GFL_SndSEPlay(SEQ_SE_BOWA2);
}

// A switch with nothing allowed to come out: the closed ball where the follower stands, a short shake, the beep
void FollowingEffects_Cue(const VecFx32 *at) {
    GFL_SndSEPlay(SEQ_SE_BEEP);
    if (sFx.ready != 1 || sFx.mode != EFFECT_NONE || at == NULL) {
        return;
    }
    SetBallAt(at);
    sFx.mode = EFFECT_CUE;
    sFx.age = 0;
}

void FollowingEffects_RestAt(const VecFx32 *at) {
    BOOL moved;

    if (at == NULL) {
        sRest.on = FALSE;
        sRest.step = 0;
        sRest.bounce = 0;
        return;
    }
    // A bounce asked for plays once the ball is up and no effect draws
    if (sRest.bounce != 0 && sFx.mode == EFFECT_NONE && sRest.on && ++sRest.bounce > BOUNCE_TICKS) {
        sRest.bounce = 0;
    }
    moved = sRest.on && (sRest.at.x != at->x || sRest.at.z != at->z);
    if (sRest.on && (sFx.mode == EFFECT_RECALL || sFx.mode == EFFECT_CUE)) {
        fx32 dx = at->x - sRest.at.x;
        fx32 dy = at->y - sRest.at.y;
        fx32 dz = at->z - sRest.at.z;

        sFx.transform.translation.x += dx;
        sFx.transform.translation.y += dy;
        sFx.transform.translation.z += dz;
        if (sFx.mode == EFFECT_RECALL) {
            sFx.billboard.pos.x += dx;
            sFx.billboard.pos.y += dy;
            sFx.billboard.pos.z += dz;
        }
    }
    if (moved || (sRest.step % HOP_STEPS) != 0) {
        sRest.step = (u8)((sRest.step + 1u) % HOP_STEPS);
    }
    sRest.at = *at;
    sRest.on = TRUE;
}

BOOL FollowingEffects_IsResting(void) {
    return sRest.on;
}

void FollowingEffects_RestBounce(void) {
    sRest.bounce = 1;
}

void FollowingEffects_RestRecall(void) {
    if (sRest.on) {
        GFL_SndSEPlay(SEQ_SE_BOWA2);
    }
    sRest.on = FALSE;
    sRest.step = 0;
}

BOOL FollowingEffects_IsBusy(void) {
    return sFx.mode != EFFECT_NONE;
}

BOOL FollowingEffects_IsRecalling(void) {
    return sFx.mode == EFFECT_RECALL;
}

BOOL FollowingEffects_IsAvailable(void) {
    return sFx.ready == 1;
}

BOOL FollowingEffects_HidesActor(void) {
    return sFx.mode == EFFECT_OUT && sFx.age < OUT_BALL_TICKS;
}

void FollowingEffects_Tick(void) {
    s32 ticks;

    sClock++;
    PumpHeld();
    if (sFx.mode == EFFECT_NONE) {
        ApplyBall();
        return;
    }
    if (sFx.mode == EFFECT_OUT) {
        ticks = OUT_TICKS;
    } else if (sFx.mode == EFFECT_CUE) {
        ticks = CUE_TICKS;
    } else {
        ticks = RECALL_TICKS;
    }
    if (++sFx.age >= ticks) {
        FollowingEffects_Cancel();
        return;
    }
    if (sFx.mode == EFFECT_OUT && sFx.age == OUT_BALL_TICKS) {
        GFL_SndSEPlay(SEQ_SE_BOWA2);
    }
}

// The field's actors' quads stand on their bottom edge (origin 2 of billboard.c, set by FieldG3D_Init), and
// their middle is one unit of their scale above it, along the quad's up. The recall's silhouette shrinks about that
// middle, so it pulls in where the body was drawn, at its height with the lift, instead of sinking to its feet. A
// camera-facing quad's up is the camera's, as BillboardActorScene_Draw's inverse of its look-at turns it
static void KeepMiddle(BillboardActor *quad, s32 fullScaleY, G3DCamera *camera) {
    VecFx32 eye;
    VecFx32 target;
    VecFx32 up;
    VecFx32 back;
    VecFx32 side;
    fx32 rise;

    up.x = 0;
    up.y = FX32_ONE;
    up.z = 0;
    if (quad->type == BILLBOARD_ACTOR_TYPE_FACE_CAMERA) {
        GFL_G3DCameraGetLookatPos(camera, &eye);
        GFL_G3DCameraGetLookatTarget(camera, &target);
        GFL_G3DCameraGetLookatUpVector(camera, &up);
        VEC_Subtract(&eye, &target, &back);
        VEC_Normalize(&back, &back);
        VEC_CrossProduct(&up, &back, &side);
        VEC_Normalize(&side, &side);
        VEC_CrossProduct(&back, &side, &up);
    }
    rise = FX_Mul(sFx.scene.setup.scale.x, fullScaleY - quad->scaleY);
    VEC_MultAdd(rise, &up, &quad->pos, &quad->pos);
}

// One channel of a lit color as the geometry engine sums it for one light (GBATEK's lighting): the material's ambient
// times the light, and its diffuse times the light and the cosine between the light and the normal, f in fx32
static u32 LightChannel(u32 ambient, u32 diffuse, u32 light, fx32 f) {
    return (ambient * light >> 5) + (u32)(((s64)diffuse * light * f) >> (5 + FX32_SHIFT));
}

// HeartGold's ball material has no diffuse, specular or emission color and a white ambient one, and lights only light
// 0, so it draws the palette times light 0's color: 22/31 of it in most of the field's daylight sets (22, 22, 20), a
// third at night (11, 11, 16). The field's actors, the follower too, are lit from their scene's material colors (the
// area's preset of field_bbd_color.c; every area has preset 1: emission 9, diffuse 31, ambient and specular 16) and its
// custom normal (FldActMatColorPreset_Apply sets it, facing up and toward the camera), with light 0, or light 3 in the
// shade. The ball's quad faces south, nearly across the field's lights, so those colors on its own normal would still
// lose the diffuse half. Its color is worked out here as the follower's body gets it, without the specular, and drawn
// unlit: the material's emission, with the same color as diffuse and vertex color, and no light. The ball is then as
// bright as the body it stands for, in every area, weather and time of day
static void LightBall(G3DLight *lights) {
    FieldBillboardActor *fieldBillboard;
    BillboardActorSys *system;
    const BillboardActorScene *scene;
    BillboardActorScene *playerScene;
    BillboardActor *playerQuad;
    VecFx16 normal;
    u32 mask;
    u32 channel[3];
    u32 c;
    u32 i;
    GXRgb color;

    if (sFx.ballMaterial == NULL || sSystem == NULL || lights == NULL) {
        return;
    }
    fieldBillboard = FldActSys_GetFieldBillboardActor(sSystem);
    system = fieldBillboard != NULL ? FieldBillboardActor_GetBillboardActorSys(fieldBillboard) : NULL;
    if (system == NULL || system->scene == NULL) {
        return;
    }
    scene = system->scene;
    // FollowingRender_Draw's light for the follower
    mask = FollowingField_IsShaded() ? FOLLOWING_LIGHTS_SHADE : FOLLOWING_LIGHTS_SUN;
    playerQuad = sPlayer != NULL ? GetQuad(sPlayer, &playerScene) : NULL;
    if (playerQuad != NULL && playerQuad->lights != FOLLOWING_LIGHTS_SUN &&
        playerQuad->lights != FOLLOWING_LIGHTS_SHADE) {
        mask = playerQuad->lights;
    }
    normal = scene->normal;
    for (c = 0; c < 3; c++) {
        channel[c] = scene->setup.emission >> (5 * c) & 31u;
    }
    for (i = 0; i < 4; i++) {
        VecFx16 direction;
        GXRgb light;
        fx32 f;

        if (!(mask & 1u << i)) {
            continue;
        }
        GFL_G3DLightGetDirVector(lights, (u8)i, &direction);
        GFL_G3DLightGetColor(lights, (u8)i, &light);
        f = -VEC_Fx16DotProduct(&direction, &normal);
        if (f < 0) {
            f = 0;
        }
        for (c = 0; c < 3; c++) {
            channel[c] += LightChannel(scene->setup.ambient >> (5 * c) & 31u, scene->setup.diffuse >> (5 * c) & 31u,
                                       light >> (5 * c) & 31u, f);
        }
    }
    for (c = 0; c < 3; c++) {
        if (channel[c] > 31) {
            channel[c] = 31;
        }
    }
    color = GX_RGB(channel[0], channel[1], channel[2]);
    sFx.ballMaterial->diffAmb = GX_PACK_DIFFAMB_PARAM(color, 0, TRUE);
    sFx.ballMaterial->specEmi = GX_PACK_SPECEMI_PARAM(0, color, FALSE);
    sFx.ballMaterial->polyAttr &= ~REG_G3_POLYGON_ATTR_LE_MASK;
}

// The closed ball where the effect stands, moved dx along x and raised by the resting ball's hop or bounce
static void DrawBall(fx32 dx) {
    static const u8 hop[HOP_STEPS] = { 0, 1, 2, 2, 1, 0, 0, 0 };
    VecFx32 at = sFx.transform.translation;

    sFx.transform.translation.x += dx;
    if (sRest.bounce > 1) {
        sFx.transform.translation.y += sBounce[sRest.bounce - 1u] * FX32_ONE;
    } else if (sRest.on) {
        sFx.transform.translation.y += hop[sRest.step % HOP_STEPS] * FX32_ONE;
    }
    GFL_G3DSysDrawObj(sFx.actors[0], &sFx.transform);
    sFx.transform.translation = at;
}

void FollowingEffects_Draw(G3DCamera *camera, G3DLight *lights) {
    DrawEmote(camera, lights);
    if (sFx.ready != 1) {
        return;
    }
    LightBall(lights);
    if (sFx.mode == EFFECT_NONE) {
        if (!sRest.on) {
            return;
        }
        SetBallAt(&sRest.at);
        DrawBall(0);
        return;
    }
    if (sFx.mode == EFFECT_CUE) {
        fx32 shake = 0;

        if (sFx.age < CUE_SHAKE) {
            shake = (sFx.age & 2) ? FX32_ONE : -FX32_ONE;
        }
        DrawBall(shake);
    } else if (sFx.mode == EFFECT_RECALL && sFx.age < RECALL_SPRITE_TICKS && sFx.snapshot) {
        // Three frames of the recolored sheet show the silhouette, then five quick steps pull it into the ball. The
        // last four frames are the ball's
        static const s32 scale[RECALL_SPRITE_TICKS] = { 4096, 4096, 4096, 3440, 2784, 2112, 1456, 768 };
        BillboardActor original = sFx.billboard;

        sFx.billboard.scaleX = (sFx.billboard.scaleX * scale[sFx.age]) >> FX32_SHIFT;
        sFx.billboard.scaleY = (sFx.billboard.scaleY * scale[sFx.age]) >> FX32_SHIFT;
        KeepMiddle(&sFx.billboard, original.scaleY, camera);
        BillboardActorScene_Draw(&sFx.scene, camera, lights);
        sFx.billboard = original;
    } else if ((sFx.mode == EFFECT_OUT && sFx.age < OUT_BALL_TICKS) || sFx.mode == EFFECT_RECALL) {
        DrawBall(0);
    } else {
        fx32 frame;

        // The body's first frame is the field's billboard alone. The flash starts on the next, so the two submits
        // aren't in the same scan
        if (FollowingField_IsFirstBody()) {
            return;
        }
        frame = (sFx.age - OUT_BALL_TICKS) * FX32_ONE;
        GFL_G3DActorSetAnmFrame(sFx.actors[1], 0, &frame);
        GFL_G3DSysDrawObj(sFx.actors[1], &sFx.transform);
    }
}

void FollowingEffects_SetPlayer(FieldActor *player) {
    sPlayer = player;
}

void FollowingEffects_EmoteEnd(void) {
    FollowingEffectsHeld *held;
    u32 i;

    sEmote.active = FALSE;
    sEmote.actor = NULL;
    sEmote.hold = FALSE;
    if (sEmote.resources[0] == NULL && sEmote.resources[1] == NULL) {
        return;
    }
    held = OpenHeld();
    for (i = 0; i < 2; i++) {
        held->emote[i] = sEmote.resources[i];
        sEmote.resources[i] = NULL;
    }
}

BOOL FollowingEffects_EmoteBegin(FieldActor *actor, u32 emote) {
    MMSys *system = actor->actorSystem;
    BillboardActorScene *scene;
    BillboardActor *quad;
    u32 i;

    FollowingEffects_EmoteEnd();
    // The original bounded the member by 28 in an archive of 14; a bubble's two frames are now both in the emotes'
    // files
    if (emote >= FOLLOWING_EMOTE_FILE_COUNT - 1 || GFL_HeapGetFreeSize(system->fieldHeapId) < HEAP_KEPT_EMOTE ||
        GFL_ArcToolGetDataMax(system->actorConfigArc) <= FOLLOWING_EMOTE_FILE + emote + 1) {
        return FALSE;
    }
    quad = GetQuad(actor, &scene);
    if (quad == NULL) {
        return FALSE;
    }
    // The bubble's own header: the live polygon ID and the tail are the 3DS's edge-marking state, and
    // FollowingRender_PrivateScene alone chooses the ID that replaces it
    sEmote.billboard = *quad;
    FollowingRender_PrivateScene(&sEmote.scene, scene, &sEmote.billboard, sEmote.material, 1, 2);
    sEmote.scene.setup.diffuse = GX_RGB(31, 31, 31);
    sEmote.scene.setup.ambient = GX_RGB(31, 31, 31);
    sEmote.scene.setup.specular = 0;
    sEmote.scene.setup.emission = 0;
    sEmote.billboard.material = 0;
    // The follower's lights stay, and the private quad is drawn, unflipped: clearing both left loaded bubbles invisible
    sEmote.billboard.visible = TRUE;
    sEmote.billboard.flipS = FALSE;
    sEmote.billboard.flipT = FALSE;
    sEmote.billboard.scaleX = EMOTE_SCALE;
    sEmote.billboard.scaleY = EMOTE_SCALE;
    sEmote.billboard.face = 0;
    for (i = 0; i < 2; i++) {
        u8 top[OUTLINE_FRAMES_MAX];
        u8 bottom[OUTLINE_FRAMES_MAX];
        NNSG3dResTex *tex;

        MI_CpuClear32(&sEmote.material[i], sizeof(sEmote.material[i]));
        sEmote.resources[i] = GFL_G3DSysReadArcToolResource(system->actorConfigArc, FOLLOWING_EMOTE_FILE + emote + i);
        if (sEmote.resources[i] == NULL) {
            FollowingEffects_EmoteEnd();
            return FALSE;
        }
        tex = GFL_G3DResGetTexData(sEmote.resources[i]);
        sEmote.bottomInset[i] = 1;
        if (MeasureOutline(tex, EMOTE_SIZE, top, bottom) == 1 && top[0] < EMOTE_SIZE) {
            sEmote.bottomInset[i] = (u8)(EMOTE_SIZE - 1 - bottom[0]);
        }
        PaperWhite2_BillboardActorMaterialSet(&sEmote.material[i], EMOTE_FORMAT_PLTT16, EMOTE_TEX_SIZE, EMOTE_SIZE,
                                              EMOTE_SIZE);
        // This is the material the private scene holds: binding another and copying its words doesn't keep the
        // allocation
        WaitVramWindow();
        PaperWhite2_BillboardActorMaterialBindTexture(&sEmote.material[i], sEmote.resources[i]);
        if (sEmote.material[i].texKey == 0 || sEmote.material[i].plttKey == 0) {
            FollowingEffects_EmoteEnd();
            return FALSE;
        }
    }
    // The bind and the first submit mustn't be in the same scan: the next draw submits this material
    sEmote.hold = TRUE;
    sEmote.active = TRUE;
    sEmote.actor = actor;
    FollowingEffects_EmoteFrame(actor, 0);
    return TRUE;
}

void FollowingEffects_EmoteFrame(FieldActor *actor, u32 frame) {
    if (!sEmote.active) {
        return;
    }
    sEmote.billboard.material = frame & 1;
    sEmote.frame = frame;
    sEmote.actor = actor;
}

static void DrawEmote(G3DCamera *camera, G3DLight *lights) {
    FieldActor *actor;
    BillboardActorScene *scene;
    BillboardActor *body;
    FollowingEffectPose pose;
    FollowingCamera view;
    VecFx32 head;
    BOOL large;
    u32 size;
    u32 top;
    fx32 height;
    FollowingPose bubble;
    FollowingPose placed;
    VecFx32 playerPoint;
    const VecFx32 *playerNear;

    if (!sEmote.active || sEmote.actor == NULL || camera == NULL) {
        return;
    }
    if (sEmote.hold) {
        sEmote.hold = FALSE;
        return;
    }
    actor = sEmote.actor;
    body = GetQuad(actor, &scene);
    if (body == NULL) {
        return;
    }
    // The body's quad is put back to the field's feet after its submit. The bubble follows the submitted pose: the
    // registry's Y with the two-pixel lift, and a bob that landed on the live quad after that, without a second foot
    // line of its own
    pose.position = body->pos;
    pose.scaleX = body->scaleX;
    pose.scaleY = body->scaleY;
    FollowingRender_EffectPose(actor, &body->pos, &pose);
    GFL_G3DCameraGetLookatPos(camera, &view.eye);
    GFL_G3DCameraGetLookatTarget(camera, &view.target);
    view.projection = GFL_G3DCameraGetProjectionType(camera);
    // A 32-pixel bubble has the follower's pixel scale, with its draw-only depth correction. The bubble's art is 15 by
    // 16 pixels
    large = body->scaleY >= LARGE_SCALE;
    sEmote.billboard.scaleX = large ? pose.scaleX / 2 : pose.scaleX;
    sEmote.billboard.scaleY = large ? pose.scaleY / 2 : pose.scaleY;
    size = large ? 64 : 32;
    top = 0;
    if (sFx.white != NULL && sFx.whiteId == actor->config.rscIndices.res1 && sFx.outlineSize == size &&
        body->face < sFx.outlineFrames) {
        top = body->flipT ? size - 1 - sFx.outlineBottom[body->face] : sFx.outlineTop[body->face];
        if (top >= size) {
            top = 0;
        }
    }
    height = (fx32)(size - top + HEAD_CLEAR) * (large ? pose.scaleY / 4 : pose.scaleY / 2) -
             (fx32)sEmote.bottomInset[sEmote.frame & 1] * (sEmote.billboard.scaleY / 2);
    if (pose.scaleY <= 0 || !FollowingRender_HeadPosition(&pose.position, &view, height, &head)) {
        return;
    }
    // In this 3D pass, after the map: a text window drawn later still covers the bubble. The push along the eye ray
    // clears foliage over it without moving its pixels
    bubble.position = head;
    bubble.scaleX = sEmote.billboard.scaleX;
    bubble.scaleY = sEmote.billboard.scaleY;
    playerNear = NULL;
    if (sPlayer != NULL && !(sPlayer->flags & FOLLOWING_ACTOR_FLAG_HIDDEN)) {
        playerPoint = sPlayer->wPos;
        playerNear = &playerPoint;
    }
    if (FollowingRender_EmotePlace(&bubble, playerNear, &view, &placed)) {
        head = placed.position;
        sEmote.billboard.scaleX = (s16)placed.scaleX;
        sEmote.billboard.scaleY = (s16)placed.scaleY;
    }
    sEmote.billboard.pos = head;
    BillboardActorScene_Draw(&sEmote.scene, camera, lights);
}
