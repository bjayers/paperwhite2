#include "types.h"
#include "constants/arc.h"
#include "field/field_environment.h"
#include "field/field_map.h"
#include "field/field_map_chunk.h"
#include "field/field_prop.h"
#include "field/field_terrain_animator.h"
#include "gfl/arc.h"
#include "gfl/g3d.h"
#include "gfl/heap.h"
#include "gfl/heapsys.h"
#include "gfl/rtc_cache.h"
#include "nitro/fx.h"
#include "nitro/gx.h"
#include "nitro/mi.h"
#include "nitro/os.h"
#include "nnsys/g3d.h"
#include "nnsys/gfd.h"
#include "paperwhite2/season_preview.h"
#include "paperwhite2/season_preview_config.h"
#include "system/area_data.h"
#include "system/rtc.h"
#include <stddef.h>

// Paper White 2: the Season app's preview, a spot of the field's map in a season, drawn as the field draws it, with
// the parts of the field that it needs written again here, since the field's overlay 36 isn't loaded with the app's:
// the chunks' models with the area's textures of the season (FieldG3DMapper_LoadMapTextures, FieldChunk_LinkMdlTex),
// the area's SRT animation on each model and its texture pattern animation over the textures in VRAM
// (field_ground_anime.c), the chunks' props with the area's prop bundle (field_buildmodel.c), and the area's lights at
// the time of day (field_light.c). Over the map, a soft shadow behind the app's banner. The spot and the camera are
// res/paperwhite2/season_preview.json's (docs/paperwhite2/plugins.md, Season app)

// The map replacements, which map_replace.c reads by number
#define ARCID_MAP_REPLACE 10
// MapReplaceEntry's kind and condition of a chunk that the season replaces
#define MAP_REPLACE_KIND_CHUNK 0
#define MAP_REPLACE_CONDITION_SEASON 0

// What a file must leave free in the heap to be read: the 3D system's and the models' small allocations
#define SEASON_PREVIEW_HEAP_MARGIN 0x4000

// The most props the preview draws, and the most of their resources
#define PROP_MAX 16
#define PROP_RESOURCE_MAX 8
#define PROP_ANIMATION_MAX 4
// The most targets a texture pattern animation of the preview has
#define TEXPAT_TARGET_MAX 4

// The screen's size, which the viewport covers
#define SCREEN_WIDTH 256
#define SCREEN_HEIGHT 192

// The shadow behind the banner's season name: an ellipse of these radii in pixels, centered on the screen's middle
// column, black at SHADOW_ALPHA (of 31) inside SHADOW_CORE (in 256ths of the squared radius, a quarter of it is half
// the radius) and fading out to its edge along a smoothstep, eased at both ends so that neither has a visible rim. Its
// texture is a quarter of it, the top left, an A5I3 texture of one texel a pixel that the shadow repeats flipped right
// and down; the radii must stay within its 128 by 64 texels
#define SHADOW_RADIUS_X 104
#define SHADOW_RADIUS_Y 40
#define SHADOW_ALPHA 18
#define SHADOW_CORE 36
#define SHADOW_TEXTURE_WIDTH 128
#define SHADOW_TEXTURE_HEIGHT 64
#define SHADOW_TEXTURE_SIZE (SHADOW_TEXTURE_WIDTH * SHADOW_TEXTURE_HEIGHT)
// An A5I3 texture's palette, 8 colors, all black
#define SHADOW_PALETTE_SIZE (8 * sizeof(GXRgb))
// A polygon ID that the map's translucent polygons don't have, so that the shadow blends over them, and an alpha under
// 31, so that the shadow is drawn with the translucent polygons, after the map
#define SHADOW_POLYGON_ID 63
#define SHADOW_POLYGON_ALPHA 30

// FieldLightEntry's material colors
enum {
    LIGHT_MATERIAL_DIFFUSE,
    LIGHT_MATERIAL_AMBIENT,
    LIGHT_MATERIAL_SPECULAR,
    LIGHT_MATERIAL_EMISSION,
    LIGHT_MATERIAL_FOG,
    LIGHT_MATERIAL_CLEAR,
    LIGHT_MATERIAL_COUNT,
};

// The bits per pixel of each texture format: none, A3I5, 4 colors, 16, 256, 4x4 compressed, A5I3 and direct
static const u8 sTextureFormatBits[8] = { 0, 8, 2, 4, 8, 0, 8, 16 };

// The start of every chunk file of ARCID_MAP_TERRAIN ('WB', 'GC', 'NG' or 'RD'): its sections' offsets from the
// start of the file, the model's first and the props' last, then the end of the file
typedef struct {
    u16 magic;
    u16 sectionCount;
    u32 offsets[5];
} SeasonPreviewChunkHeader;

typedef struct {
    u32 model;
    fx32 x;
    fx32 z;
} SeasonPreviewChunkSetup;

typedef struct {
    // The model's section, which the resource points into
    void *data;
    G3DResource *resource;
    G3DModel *model;
    G3DAnimation *animation;
    G3DActor *actor;
    VecFx32 position;
} SeasonPreviewChunk;

// A texture pattern animation: the GFBTP file, the textures of its frames, and for each target, the texture it shows,
// where it uploads that texture over the map's, how big it is and its frame
typedef struct {
    GFBTPController controller;
    G3DResource *textures;
    u32 targetCount;
    GFBTPValue values[TEXPAT_TARGET_MAX];
    int destAddresses[TEXPAT_TARGET_MAX];
    int sizes[TEXPAT_TARGET_MAX];
    fx32 frames[TEXPAT_TARGET_MAX];
    BOOL uploadAll;
} SeasonPreviewTexPat;

// A prop's resource, from the area's prop bundle: its info, with its animations, and its model
typedef struct {
    u16 resId;
    FieldPropResInfo *info;
    void *modelData;
    G3DResource *modelResource;
    G3DResource *animationResources[PROP_ANIMATION_MAX];
    G3DActor *actor;
} SeasonPreviewPropResource;

typedef struct {
    u8 resource;
    u16 rotationY;
    VecFx32 position;
} SeasonPreviewProp;

struct SeasonPreview {
    HeapID heapId;
    BOOL loaded;
    // The line of the shadow's center on the screen, and its texture and palette in VRAM, or NNS_GFD_ALLOC_ERROR_TEXKEY
    // if it isn't loaded
    int shadowY;
    NNSGfdTexKey shadowTexKey;
    NNSGfdPlttKey shadowPlttKey;
    G3DCamera *camera;
    G3DResource *mapTextures;
    // The area's SRT animation file, which every chunk's animation plays
    G3DResource *srtAnimation;
    SeasonPreviewChunk chunks[SEASON_PREVIEW_CHUNK_COUNT];
    FieldTerrainTexPatAnimationPack *texPatPack;
    u32 texPatCount;
    SeasonPreviewTexPat texPats[FIELD_TERRAIN_TEXPAT_ANIMATION_MAX];
    G3DResource *propTextures;
    // The area's prop bundle while the chunks load: its file, its resource infos and their offsets, then the models'
    u32 propBundleId;
    u32 propResInfoCount;
    u32 *propOffsets;
    u32 propResourceCount;
    SeasonPreviewPropResource propResources[PROP_RESOURCE_MAX];
    u32 propCount;
    SeasonPreviewProp props[PROP_MAX];
    BOOL hasLights;
    Light lights[4];
    GXRgb materials[LIGHT_MATERIAL_COUNT];
};

static void SeasonPreview_InitG3D(void);
static BOOL SeasonPreview_Fits(SeasonPreview *preview, u32 size);
static void *SeasonPreview_ReadRange(SeasonPreview *preview, ArcTool *arc, u32 fileId, u32 offset, u32 size);
static void *SeasonPreview_ReadFile(SeasonPreview *preview, u32 arcId, u32 fileId);
static G3DResource *SeasonPreview_CreateResource(SeasonPreview *preview, void *data);
static BOOL SeasonPreview_LoadMapTextures(SeasonPreview *preview, u32 fileId);
static u32 SeasonPreview_GetSeasonModel(SeasonPreview *preview, u32 model, u8 season);
static BOOL SeasonPreview_LoadChunks(SeasonPreview *preview, AreaData *area, u8 season);
static ArcTool *SeasonPreview_OpenPropBundle(SeasonPreview *preview, AreaData *area);
static BOOL SeasonPreview_LoadChunk(SeasonPreview *preview, ArcTool *arc, ArcTool *propArc, u32 index, u32 model);
static void SeasonPreview_FreeChunk(SeasonPreviewChunk *chunk);
static BOOL SeasonPreview_LoadTexPats(SeasonPreview *preview, u32 fileId);
static void SeasonPreview_InitTexPat(SeasonPreview *preview, SeasonPreviewTexPat *texPat, u32 index);
static void SeasonPreview_UpdateTexPat(SeasonPreviewTexPat *texPat);
static void GFBTPController_Load(void *data, GFBTPController *controller);
static GFBTPValue GFBTPController_GetValueAt(const GFBTPController *controller, u32 target, u32 frame);
static u32 GFBTPController_GetTargetEnd(const GFBTPController *controller, u32 target);
static int SeasonPreview_GetTextureVRAMAddress(G3DResource *mapTextures, G3DResource *textures, u32 index);
static int SeasonPreview_GetTextureSize(G3DResource *textures, u32 index);
static void *SeasonPreview_GetTextureData(G3DResource *textures, u32 index);
static BOOL SeasonPreview_LoadPropTextures(SeasonPreview *preview, AreaData *area);
static void SeasonPreview_AddProps(SeasonPreview *preview, ArcTool *propArc, const FieldChunkProps *props,
                                   const VecFx32 *chunkPosition);
static s32 SeasonPreview_FindPropResource(SeasonPreview *preview, ArcTool *propArc, u16 resId);
static BOOL SeasonPreview_LoadPropResource(SeasonPreview *preview, ArcTool *propArc, u16 resId,
                                           SeasonPreviewPropResource *resource);
static void SeasonPreview_FreePropResource(SeasonPreviewPropResource *resource);
static void SeasonPreview_LoadLights(SeasonPreview *preview, u32 lightsId, u8 season);
static void SeasonPreview_FlushLights(SeasonPreview *preview);
static void SeasonPreview_LoadShadow(SeasonPreview *preview);
static void SeasonPreview_FreeShadow(SeasonPreview *preview);
static void SeasonPreview_DrawShadow(SeasonPreview *preview);
static fx16 SeasonPreview_GetScreenX(int x);
static fx16 SeasonPreview_GetScreenY(int y);

static const SeasonPreviewChunkSetup sSeasonPreviewChunks[SEASON_PREVIEW_CHUNK_COUNT] = { SEASON_PREVIEW_CHUNKS };

// The file name of the preview's allocations, which the heap keeps for its reports. An array, so that it is in
// .rodata: overlay 312 has no .data
static const char sSeasonPreviewFileName[] = "paperwhite2_season_preview.c";

static const VecFx32 sSeasonPreviewScale = { FX32_ONE, FX32_ONE, FX32_ONE };

SeasonPreview *SeasonPreview_Create(HeapID heapId, int shadowY) {
    SeasonPreview *preview = GFL_HeapAllocate(heapId, sizeof(SeasonPreview), TRUE, sSeasonPreviewFileName, __LINE__);
    VecFx32 eye = { SEASON_PREVIEW_EYE_X, SEASON_PREVIEW_EYE_Y, SEASON_PREVIEW_EYE_Z };
    VecFx32 target = { 0, SEASON_PREVIEW_TARGET_Y, 0 };
    VecFx32 up = { 0, FX32_ONE, 0 };

    preview->heapId = heapId;
    preview->shadowY = shadowY;
    preview->shadowTexKey = NNS_GFD_ALLOC_ERROR_TEXKEY;
    preview->shadowPlttKey = NNS_GFD_ALLOC_ERROR_PLTTKEY;
    // The field's: texture VRAM and palette VRAM in one slot each, managed as linked lists
    GFL_G3DSysCreate(FALSE, 1, FALSE, 1, 0, heapId, SeasonPreview_InitG3D);
    preview->camera = GFL_G3DCameraCreate(G3DCAM_PROJECTION_PERSPECTIVE, FX_SinIdx(SEASON_PREVIEW_FOV),
                                          FX_CosIdx(SEASON_PREVIEW_FOV), FX32_CONST(4.0 / 3.0), 0, SEASON_PREVIEW_NEAR,
                                          SEASON_PREVIEW_FAR, 0, &eye, &up, &target, heapId);
    return preview;
}

void SeasonPreview_Free(SeasonPreview *preview) {
    SeasonPreview_Unload(preview);
    GFL_G3DCameraFree(preview->camera);
    NNS_G3dGeFlushBuffer();
    GFL_G3DSysFree();
    GFL_HeapFree(preview);
}

// The field's 3D setup (FieldG3D_InitCallback), without its fog and edges, with the field camera's Z buffer
static void SeasonPreview_InitG3D(void) {
    G3X_SetShading(GX_SHADING_TOON);
    G3X_AntiAlias(TRUE);
    G3X_AlphaTest(FALSE, 0);
    G3X_AlphaBlend(TRUE);
    G3X_SetFog(FALSE, GX_FOGBLEND_COLOR_ALPHA, GX_FOGSLOPE_0x0400, 0);
    G3X_SetClearColor(GX_RGB(0, 0, 0), 31, 0x7fff, 0, FALSE);
    G3X_EdgeMarking(FALSE);
    G3_ViewPort(0, 0, 255, 191);
    GFL_G3DSysSetSwapBufferParams(GX_SORTMODE_AUTO, GX_BUFFERMODE_Z);
}

BOOL SeasonPreview_Load(SeasonPreview *preview, u8 season) {
    u16 areaId = SEASON_PREVIEW_AREA;
    AreaData *area;
    BOOL loaded;

    SeasonPreview_Unload(preview);
    // The area's record of the season, as Field_Create reads it
    area = AreaData_Create(preview->heapId, areaId, AreaData_HasSeasons(areaId) ? season : 0);
    loaded = SeasonPreview_LoadMapTextures(preview, AreaData_GetTexSetID(area));
    if (loaded && AreaData_GetSRTAnmID(area) != FIELD_TERRAIN_ANM_NONE) {
        preview->srtAnimation = SeasonPreview_CreateResource(
            preview, SeasonPreview_ReadFile(preview, ARCID_AREA_ANIME_SRT, AreaData_GetSRTAnmID(area)));
        loaded = preview->srtAnimation != NULL;
    }
    if (loaded && SEASON_PREVIEW_PROPS) {
        loaded = SeasonPreview_LoadPropTextures(preview, area);
    }
    if (loaded) {
        loaded = SeasonPreview_LoadChunks(preview, area, season);
    }
    if (loaded && AreaData_GetPatAnmID(area) != FIELD_TERRAIN_ANM_NONE) {
        loaded = SeasonPreview_LoadTexPats(preview, AreaData_GetPatAnmID(area));
    }
    if (loaded) {
        SeasonPreview_LoadLights(preview, AreaData_GetLightsID(area), season);
        SeasonPreview_LoadShadow(preview);
    }
    AreaData_Free(area);
    // What is loaded is freed, unless it all is
    preview->loaded = TRUE;
    if (!loaded) {
        SeasonPreview_Unload(preview);
    }
    return loaded;
}

void SeasonPreview_Unload(SeasonPreview *preview) {
    u32 i;

    if (!preview->loaded) {
        return;
    }
    SeasonPreview_FreeShadow(preview);
    for (i = 0; i < preview->propResourceCount; i++) {
        SeasonPreview_FreePropResource(&preview->propResources[i]);
    }
    preview->propResourceCount = 0;
    preview->propCount = 0;
    for (i = 0; i < SEASON_PREVIEW_CHUNK_COUNT; i++) {
        SeasonPreview_FreeChunk(&preview->chunks[i]);
    }
    for (i = 0; i < preview->texPatCount; i++) {
        GFL_HeapFree(preview->texPats[i].textures);
    }
    preview->texPatCount = 0;
    if (preview->texPatPack != NULL) {
        GFL_HeapFree(preview->texPatPack);
        preview->texPatPack = NULL;
    }
    if (preview->srtAnimation != NULL) {
        GFL_G3DResFree(preview->srtAnimation);
        preview->srtAnimation = NULL;
    }
    if (preview->propTextures != NULL) {
        GFL_G3DResFreeTexData(preview->propTextures);
        GFL_G3DResFree(preview->propTextures);
        preview->propTextures = NULL;
    }
    if (preview->mapTextures != NULL) {
        GFL_G3DResFreeTexData(preview->mapTextures);
        GFL_G3DResFree(preview->mapTextures);
        preview->mapTextures = NULL;
    }
    preview->loaded = FALSE;
}

void SeasonPreview_Draw(SeasonPreview *preview) {
    SRTMatrix status;
    u32 i;

    if (!preview->loaded) {
        return;
    }
    for (i = 0; i < SEASON_PREVIEW_CHUNK_COUNT; i++) {
        if (preview->chunks[i].animation != NULL) {
            GFL_G3DActorStepAnmFrameLoop(preview->chunks[i].actor, 0, FX32_ONE);
        }
    }
    for (i = 0; i < preview->texPatCount; i++) {
        SeasonPreview_UpdateTexPat(&preview->texPats[i]);
    }
    for (i = 0; i < preview->propResourceCount; i++) {
        u16 animation;

        for (animation = 0; animation < PROP_ANIMATION_MAX; animation++) {
            GFL_G3DActorStepAnmFrameLoop(preview->propResources[i].actor, animation, FX32_ONE);
        }
    }

    SeasonPreview_FlushLights(preview);
    GFL_G3DCameraFlush(preview->camera);
    GFL_G3DSysReset();
    GFL_G3DSysMtxViewFlush();
    status.scale = sSeasonPreviewScale;
    MTX_Identity33_(&status.rotation);
    for (i = 0; i < SEASON_PREVIEW_CHUNK_COUNT; i++) {
        status.translation = preview->chunks[i].position;
        GFL_G3DSysDrawObj(preview->chunks[i].actor, &status);
    }
    for (i = 0; i < preview->propCount; i++) {
        const SeasonPreviewProp *prop = &preview->props[i];

        status.translation = prop->position;
        MTX_RotY33_(&status.rotation, FX_SinIdx(prop->rotationY), FX_CosIdx(prop->rotationY));
        GFL_G3DSysDrawObj(preview->propResources[prop->resource].actor, &status);
    }
    SeasonPreview_DrawShadow(preview);
    GFL_G3DSysReqSwapBuffers();
}

// Whether a block of size bytes fits in the heap with the margin
static BOOL SeasonPreview_Fits(SeasonPreview *preview, u32 size) {
    return GFL_HeapGetHighestAllocatableSize(preview->heapId) >= size + SEASON_PREVIEW_HEAP_MARGIN;
}

// Reads part of a file into a new block, or returns NULL if it doesn't fit
static void *SeasonPreview_ReadRange(SeasonPreview *preview, ArcTool *arc, u32 fileId, u32 offset, u32 size) {
    void *data;

    if (!SeasonPreview_Fits(preview, size)) {
        return NULL;
    }
    data = GFL_HeapAllocate(preview->heapId, size, FALSE, sSeasonPreviewFileName, __LINE__);
    GFL_ArcToolReadRange(arc, fileId, offset, size, data);
    return data;
}

static void *SeasonPreview_ReadFile(SeasonPreview *preview, u32 arcId, u32 fileId) {
    ArcTool *arc = GFL_ArcSysCreateFileHandle(arcId, preview->heapId);
    void *data = NULL;

    if (fileId < GFL_ArcToolGetDataMax(arc)) {
        data = SeasonPreview_ReadRange(preview, arc, fileId, 0, GFL_ArcToolGetDataLength(arc, fileId));
    }
    GFL_ArcToolFree(arc);
    return data;
}

// A resource for data that the caller read, or NULL with no data
static G3DResource *SeasonPreview_CreateResource(SeasonPreview *preview, void *data) {
    G3DResource *resource;

    if (data == NULL) {
        return NULL;
    }
    resource = GFL_HeapAllocate(preview->heapId, GFL_G3DResGetAllocSize(), FALSE, sSeasonPreviewFileName, __LINE__);
    GFL_G3DResSetup(resource, data);
    return resource;
}

// The area's textures of the season in VRAM, without their images in the heap, as FieldG3DMapper_LoadMapTextures
// loads them
static BOOL SeasonPreview_LoadMapTextures(SeasonPreview *preview, u32 fileId) {
    preview->mapTextures =
        SeasonPreview_CreateResource(preview, SeasonPreview_ReadFile(preview, ARCID_AREA_MAP_TEX, fileId));
    if (preview->mapTextures == NULL) {
        return FALSE;
    }
    if (!GFL_G3DResUploadAndReleaseTexData(preview->mapTextures)) {
        GFL_G3DResFree(preview->mapTextures);
        preview->mapTextures = NULL;
        return FALSE;
    }
    return TRUE;
}

// The chunk that the season's map replacement puts in the model's place (MapReplace_Patch), or the model. Only the
// replacements by season apply
static u32 SeasonPreview_GetSeasonModel(SeasonPreview *preview, u32 model, u8 season) {
    MapReplaceEntry *entries = SeasonPreview_ReadFile(preview, ARCID_MAP_REPLACE, 0);
    u32 count;
    u32 i;

    if (entries == NULL) {
        return model;
    }
    count = GFL_ArcSysGetDataLength(ARCID_MAP_REPLACE, 0) / sizeof(MapReplaceEntry);
    for (i = 0; i < count; i++) {
        if (entries[i].kind == MAP_REPLACE_KIND_CHUNK && entries[i].condition == MAP_REPLACE_CONDITION_SEASON &&
            entries[i].values[0] == model) {
            model = entries[i].values[season];
            break;
        }
    }
    GFL_HeapFree(entries);
    return model;
}

static BOOL SeasonPreview_LoadChunks(SeasonPreview *preview, AreaData *area, u8 season) {
    ArcTool *arc = GFL_ArcSysCreateFileHandle(ARCID_MAP_TERRAIN, preview->heapId);
    ArcTool *propArc = NULL;
    BOOL loaded = TRUE;
    u32 i;

    if (SEASON_PREVIEW_PROPS) {
        propArc = SeasonPreview_OpenPropBundle(preview, area);
    }
    for (i = 0; i < SEASON_PREVIEW_CHUNK_COUNT && loaded; i++) {
        u32 model = SeasonPreview_GetSeasonModel(preview, sSeasonPreviewChunks[i].model, season);

        loaded = SeasonPreview_LoadChunk(preview, arc, propArc, i, model);
    }
    if (propArc != NULL) {
        GFL_HeapFree(preview->propOffsets);
        preview->propOffsets = NULL;
        GFL_ArcToolFree(propArc);
    }
    GFL_ArcToolFree(arc);
    return loaded;
}

// Opens the area's prop bundle and reads its offsets, or returns NULL without it
static ArcTool *SeasonPreview_OpenPropBundle(SeasonPreview *preview, AreaData *area) {
    ArcTool *arc = GFL_ArcSysCreateFileHandle(AreaData_IsExterior(area) ? ARCID_AREA_BMDATA_EXT : ARCID_AREA_BMDATA_INT,
                                              preview->heapId);
    FieldPropResBundle header;

    preview->propBundleId = AreaData_GetPropBundleID(area);
    preview->propResInfoCount = 0;
    preview->propOffsets = NULL;
    if (preview->propBundleId < GFL_ArcToolGetDataMax(arc)) {
        GFL_ArcToolReadRange(arc, preview->propBundleId, 0, sizeof(header), &header);
        preview->propResInfoCount = header.countFlags >> 1;
    }
    if (preview->propResInfoCount != 0) {
        preview->propOffsets =
            SeasonPreview_ReadRange(preview, arc, preview->propBundleId, offsetof(FieldPropResBundle, offsets),
                                    preview->propResInfoCount * 2 * sizeof(u32));
    }
    if (preview->propOffsets == NULL) {
        GFL_ArcToolFree(arc);
        return NULL;
    }
    return arc;
}

// Reads a chunk's model and props, without its terrain, and binds the model to the area's textures and SRT animation
// (FieldChunkAccessor_WB_Update)
static BOOL SeasonPreview_LoadChunk(SeasonPreview *preview, ArcTool *arc, ArcTool *propArc, u32 index, u32 model) {
    SeasonPreviewChunk *chunk = &preview->chunks[index];
    SeasonPreviewChunkHeader header;
    G3DAnimation *animations[1];
    u32 count;
    u32 propsOffset;
    u32 propsSize;

    if (model >= GFL_ArcToolGetDataMax(arc)) {
        return FALSE;
    }
    GFL_ArcToolReadRange(arc, model, 0, sizeof(header), &header);
    if (header.sectionCount < 2 || header.sectionCount >= NELEMS(header.offsets)) {
        return FALSE;
    }
    chunk->data =
        SeasonPreview_ReadRange(preview, arc, model, header.offsets[0], header.offsets[1] - header.offsets[0]);
    if (chunk->data == NULL) {
        return FALSE;
    }
    chunk->resource = SeasonPreview_CreateResource(preview, chunk->data);
    chunk->model = GFL_G3DMdlCreate(chunk->resource, 0, preview->mapTextures);
    count = 0;
    if (preview->srtAnimation != NULL) {
        chunk->animation = GFL_G3DAnmCreate(chunk->model, preview->srtAnimation, 0);
        animations[count++] = chunk->animation;
    }
    chunk->actor = GFL_G3DActorCreate(chunk->model, animations, count);
    if (chunk->animation != NULL) {
        GFL_G3DActorBindAnm(chunk->actor, 0);
    }
    chunk->position.x = sSeasonPreviewChunks[index].x;
    chunk->position.y = 0;
    chunk->position.z = sSeasonPreviewChunks[index].z;

    // The props section is empty in a chunk without props
    propsOffset = header.offsets[header.sectionCount - 1];
    propsSize = header.offsets[header.sectionCount] - propsOffset;
    if (propArc != NULL && propsSize >= sizeof(FieldChunkProps)) {
        FieldChunkProps *props = SeasonPreview_ReadRange(preview, arc, model, propsOffset, propsSize);

        if (props == NULL) {
            return FALSE;
        }
        SeasonPreview_AddProps(preview, propArc, props, &chunk->position);
        GFL_HeapFree(props);
    }
    return TRUE;
}

static void SeasonPreview_FreeChunk(SeasonPreviewChunk *chunk) {
    if (chunk->actor != NULL) {
        GFL_G3DActorFree(chunk->actor);
        chunk->actor = NULL;
    }
    if (chunk->animation != NULL) {
        GFL_G3DAnmFree(chunk->animation);
        chunk->animation = NULL;
    }
    if (chunk->model != NULL) {
        GFL_G3DMdlFree(chunk->model);
        chunk->model = NULL;
    }
    // The resource points into the model's section, which is freed apart
    if (chunk->resource != NULL) {
        GFL_HeapFree(chunk->resource);
        chunk->resource = NULL;
    }
    if (chunk->data != NULL) {
        GFL_HeapFree(chunk->data);
        chunk->data = NULL;
    }
}

// The area's texture pattern animations, each over the map's texture of its first frame's name
// (FieldTerrainAnimator_LoadTexPat)
static BOOL SeasonPreview_LoadTexPats(SeasonPreview *preview, u32 fileId) {
    u32 i;

    preview->texPatPack = SeasonPreview_ReadFile(preview, ARCID_AREA_ANIME_PAT, fileId);
    if (preview->texPatPack == NULL) {
        return FALSE;
    }
    // The VRAM transfers read the frames' textures from the file
    DC_FlushRange(preview->texPatPack, GFL_ArcSysGetDataLength(ARCID_AREA_ANIME_PAT, fileId));
    preview->texPatCount = preview->texPatPack->dataCount;
    if (preview->texPatCount > FIELD_TERRAIN_TEXPAT_ANIMATION_MAX) {
        preview->texPatCount = FIELD_TERRAIN_TEXPAT_ANIMATION_MAX;
    }
    for (i = 0; i < preview->texPatCount; i++) {
        SeasonPreview_InitTexPat(preview, &preview->texPats[i], i);
    }
    return TRUE;
}

// FieldTerrainTexPatAnimation_Init: each target uploads over the map's texture that has the name of the first texture
// its frames show
static void SeasonPreview_InitTexPat(SeasonPreview *preview, SeasonPreviewTexPat *texPat, u32 index) {
    FieldTerrainTexPatAnimationPack *pack = preview->texPatPack;
    u32 target;

    GFBTPController_Load((u8 *)pack + pack->offsets[index].gfbtpOffset, &texPat->controller);
    texPat->textures = SeasonPreview_CreateResource(preview, (u8 *)pack + pack->offsets[index].nsbtxOffset);
    texPat->targetCount = texPat->controller.targetCount;
    if (texPat->targetCount > TEXPAT_TARGET_MAX) {
        texPat->targetCount = TEXPAT_TARGET_MAX;
    }
    for (target = 0; target < texPat->targetCount; target++) {
        u32 lastKeyFrame = texPat->controller.keyFrames[GFBTPController_GetTargetEnd(&texPat->controller, target) - 1];
        u8 firstTexture;
        u32 frame;

        texPat->values[target] = GFBTPController_GetValueAt(&texPat->controller, target, 0);
        firstTexture = texPat->values[target].textureIndex;
        for (frame = 0; frame < lastKeyFrame; frame++) {
            GFBTPValue value = GFBTPController_GetValueAt(&texPat->controller, target, frame);

            if (value.textureIndex < firstTexture) {
                firstTexture = value.textureIndex;
            }
        }
        texPat->destAddresses[target] =
            SeasonPreview_GetTextureVRAMAddress(preview->mapTextures, texPat->textures, firstTexture);
        texPat->sizes[target] = SeasonPreview_GetTextureSize(texPat->textures, firstTexture);
        texPat->frames[target] = 0;
    }
    texPat->uploadAll = TRUE;
}

// FieldTerrainTexPatAnimation_Update, a frame at a time: a target whose texture changes uploads the new one at the
// next VBlank
static void SeasonPreview_UpdateTexPat(SeasonPreviewTexPat *texPat) {
    fx32 frameCount = texPat->controller.frameCount * FX32_ONE;
    u32 target;

    for (target = 0; target < texPat->targetCount; target++) {
        texPat->frames[target] += FX32_ONE;
        if (texPat->frames[target] >= frameCount) {
            texPat->frames[target] %= frameCount;
        } else if (texPat->destAddresses[target] != -1) {
            GFBTPValue value =
                GFBTPController_GetValueAt(&texPat->controller, target, FX_Whole(texPat->frames[target]));

            if (value.textureIndex != texPat->values[target].textureIndex || texPat->uploadAll) {
                NNS_GfdRegisterNewVramTransferTask(NNS_GFD_DST_3D_TEX_VRAM, texPat->destAddresses[target],
                                                   SeasonPreview_GetTextureData(texPat->textures, value.textureIndex),
                                                   texPat->sizes[target]);
            }
            texPat->values[target] = value;
        }
    }
    texPat->uploadAll = FALSE;
}

// A GFBTP file: the key frames, their textures and palettes, each padded to four bytes, then the targets' first key
// frames, padded too, and the frame count (GFBTPController_LoadFile)
static void GFBTPController_Load(void *data, GFBTPController *controller) {
    u8 *p = data;
    u32 count;

    controller->keyFrameCount = *(u32 *)p;
    p += sizeof(u32);
    controller->keyFrames = (u16 *)p;
    p += (controller->keyFrameCount * sizeof(u16) + 3) & ~3;
    controller->textureIndices = p;
    p += (controller->keyFrameCount + 3) & ~3;
    controller->paletteIndices = p;
    p += (controller->keyFrameCount + 3) & ~3;
    count = *(u32 *)p;
    p += sizeof(u32);
    controller->targets = p;
    controller->targetCount = count;
    p += (count + 3) & ~3;
    controller->frameCount = *(u32 *)p;
}

// The value of a target at a frame: that of its last key frame at or before the frame
static GFBTPValue GFBTPController_GetValueAt(const GFBTPController *controller, u32 target, u32 frame) {
    GFBTPValue value;
    u32 end = GFBTPController_GetTargetEnd(controller, target);
    u32 key;

    for (key = controller->targets[target]; key < end - 1; key++) {
        if (controller->keyFrames[key + 1] > frame) {
            break;
        }
    }
    value.textureIndex = controller->textureIndices[key];
    value.paletteIndex = controller->paletteIndices[key];
    return value;
}

// The key frame after a target's last
static u32 GFBTPController_GetTargetEnd(const GFBTPController *controller, u32 target) {
    if (target + 1 < controller->targetCount) {
        return controller->targets[target + 1];
    }
    return controller->keyFrameCount;
}

// Where in texture VRAM the map's texture of the same name as a frame's texture is, or -1 if the map has none
static int SeasonPreview_GetTextureVRAMAddress(G3DResource *mapTextures, G3DResource *textures, u32 index) {
    NNSG3dResTex *mapTex = GFL_G3DResGetTexData(mapTextures);
    NNSG3dResTex *tex = GFL_G3DResGetTexData(textures);
    const NNSG3dResDictTexData *data;
    int mapIndex = NNS_G3dGetResDictIdxByName(&mapTex->dict, NNS_G3dGetResNameByIdx(&tex->dict, index));

    if (mapIndex < 0) {
        return -1;
    }
    data = NNS_G3dGetResDataByIdx(&mapTex->dict, mapIndex);
    return ((data->texImageParam & 0xffff) << 3) + NNS_GfdGetTexKeyAddr(mapTex->texInfo.vramKey);
}

// A texture's size in bytes, from its width, height and format
static int SeasonPreview_GetTextureSize(G3DResource *textures, u32 index) {
    NNSG3dResTex *tex = GFL_G3DResGetTexData(textures);
    const NNSG3dResDictTexData *data = NNS_G3dGetResDataByIdx(&tex->dict, index);
    u32 param = data->texImageParam;
    u32 width = 8 << ((param >> REG_G3_TEXIMAGE_PARAM_V_SIZE_SHIFT) & 7);
    u32 height = 8 << ((param >> REG_G3_TEXIMAGE_PARAM_T_SIZE_SHIFT) & 7);

    return width * height * sTextureFormatBits[(param >> REG_G3_TEXIMAGE_PARAM_TEXFMT_SHIFT) & 7] / 8;
}

static void *SeasonPreview_GetTextureData(G3DResource *textures, u32 index) {
    NNSG3dResTex *tex = GFL_G3DResGetTexData(textures);
    const NNSG3dResDictTexData *data = NNS_G3dGetResDataByIdx(&tex->dict, index);

    return (u8 *)tex + tex->texInfo.ofsTex + ((data->texImageParam & 0xffff) << 3);
}

// The prop bundle's textures in VRAM (FieldPropSystem_LoadTextures)
static BOOL SeasonPreview_LoadPropTextures(SeasonPreview *preview, AreaData *area) {
    u32 arcId = AreaData_IsExterior(area) ? ARCID_AREA_BMTEX_EXT : ARCID_AREA_BMTEX_INT;

    preview->propTextures =
        SeasonPreview_CreateResource(preview, SeasonPreview_ReadFile(preview, arcId, AreaData_GetPropBundleID(area)));
    if (preview->propTextures == NULL) {
        return FALSE;
    }
    if (!GFL_G3DResUploadAndReleaseTexData(preview->propTextures)) {
        GFL_G3DResFree(preview->propTextures);
        preview->propTextures = NULL;
        return FALSE;
    }
    return TRUE;
}

// Places a chunk's props as FieldPropSystem_InstantiateFromInfo does, those the bundle has, without their doors
static void SeasonPreview_AddProps(SeasonPreview *preview, ArcTool *propArc, const FieldChunkProps *props,
                                   const VecFx32 *chunkPosition) {
    const FieldPropSourceInfo *infos = (const FieldPropSourceInfo *)(props + 1);
    u32 i;

    for (i = 0; i < props->count && preview->propCount < PROP_MAX; i++) {
        s32 resource = SeasonPreview_FindPropResource(preview, propArc, infos[i].lowResId + (infos[i].highResId << 8));
        SeasonPreviewProp *prop;

        if (resource < 0) {
            continue;
        }
        prop = &preview->props[preview->propCount++];
        prop->resource = resource;
        prop->rotationY = infos[i].rotationY;
        prop->position.x = chunkPosition->x + infos[i].x;
        prop->position.y = chunkPosition->y + infos[i].y;
        prop->position.z = chunkPosition->z - infos[i].z;
    }
}

// The preview's resource of a prop, loaded the first time, or -1 if the bundle has none or it doesn't fit
static s32 SeasonPreview_FindPropResource(SeasonPreview *preview, ArcTool *propArc, u16 resId) {
    SeasonPreviewPropResource *resource;
    u32 i;

    for (i = 0; i < preview->propResourceCount; i++) {
        if (preview->propResources[i].resId == resId) {
            return i;
        }
    }
    if (preview->propResourceCount >= PROP_RESOURCE_MAX) {
        return -1;
    }
    resource = &preview->propResources[preview->propResourceCount];
    if (!SeasonPreview_LoadPropResource(preview, propArc, resId, resource)) {
        return -1;
    }
    return preview->propResourceCount++;
}

// Reads a prop's info and model from the bundle, whose header has its infos' offsets and then its models'
// (FieldPropResBundle_GetResInfo, FieldPropResBundle_GetModelData), and makes it with the bundle's textures and its
// ambient animations looping (FieldPropSystem_InitResource, FieldPropResInstance_Init,
// FieldPropAnmController_Ambient_Init)
static BOOL SeasonPreview_LoadPropResource(SeasonPreview *preview, ArcTool *propArc, u16 resId,
                                           SeasonPreviewPropResource *resource) {
    u32 count = preview->propResInfoCount;
    const u32 *offsets = preview->propOffsets;
    u32 index;
    u32 infoEnd;
    u32 modelEnd;
    G3DModel *model;
    G3DAnimation *animations[PROP_ANIMATION_MAX];
    FieldPropResAnmHeader *anmHeader;
    u32 animationCount;
    u32 i;

    for (index = 0; index < count; index++) {
        u16 id;

        GFL_ArcToolReadRange(propArc, preview->propBundleId, offsets[index], sizeof(id), &id);
        if (id == resId) {
            break;
        }
    }
    if (index == count) {
        return FALSE;
    }
    infoEnd = index + 1 < count ? offsets[index + 1] : offsets[count];
    modelEnd =
        index + 1 < count ? offsets[count + index + 1] : GFL_ArcToolGetDataLength(propArc, preview->propBundleId);
    resource->resId = resId;
    resource->info =
        SeasonPreview_ReadRange(preview, propArc, preview->propBundleId, offsets[index], infoEnd - offsets[index]);
    if (resource->info == NULL) {
        return FALSE;
    }
    resource->modelResource = SeasonPreview_CreateResource(
        preview, SeasonPreview_ReadRange(preview, propArc, preview->propBundleId, offsets[count + index],
                                         modelEnd - offsets[count + index]));
    if (resource->modelResource == NULL) {
        GFL_HeapFree(resource->info);
        resource->info = NULL;
        return FALSE;
    }

    model = GFL_G3DMdlCreate(resource->modelResource, 0, preview->propTextures);
    anmHeader = &resource->info->animationHeader;
    animationCount = 0;
    for (i = 0; i < PROP_ANIMATION_MAX; i++) {
        if (anmHeader->animationIds[i] != FIELD_PROP_ANM_NONE) {
            animationCount++;
        }
    }
    for (i = 0; i < PROP_ANIMATION_MAX; i++) {
        animations[i] = NULL;
        if (i < animationCount) {
            resource->animationResources[i] =
                SeasonPreview_CreateResource(preview, (u8 *)anmHeader + anmHeader->animationIds[i]);
            animations[i] = GFL_G3DAnmCreate(model, resource->animationResources[i], 0);
        }
    }
    resource->actor = GFL_G3DActorCreate(model, animations, PROP_ANIMATION_MAX);
    if (anmHeader->controllerType == FIELD_PROP_ANMCNT_AMBIENT) {
        for (i = 0; i < PROP_ANIMATION_MAX && i < anmHeader->ambientAnimationCount; i++) {
            GFL_G3DActorBindAnm(resource->actor, i);
        }
    }
    return TRUE;
}

static void SeasonPreview_FreePropResource(SeasonPreviewPropResource *resource) {
    G3DModel *model = GFL_G3DActorGetMdl(resource->actor);
    u16 i;

    for (i = 0; i < PROP_ANIMATION_MAX; i++) {
        G3DAnimation *animation = GFL_G3DActorGetAnm(resource->actor, i);

        if (animation != NULL) {
            GFL_G3DAnmFree(animation);
        }
        // The animations' resources point into the info, which is freed apart
        if (resource->animationResources[i] != NULL) {
            GFL_HeapFree(resource->animationResources[i]);
            resource->animationResources[i] = NULL;
        }
    }
    GFL_G3DActorFree(resource->actor);
    resource->actor = NULL;
    GFL_G3DMdlFree(model);
    GFL_G3DResFree(resource->modelResource);
    resource->modelResource = NULL;
    GFL_HeapFree(resource->info);
    resource->info = NULL;
}

// The area's light setup of the time of day in the season, or of the preview's hour, as FieldLight_Create picks it
// (FieldLight_GetUsedEntryIndex), with its lights' directions normalized as FieldLight_LoadDataCore does. Without the
// file the 3D system's lights stay
static void SeasonPreview_LoadLights(SeasonPreview *preview, u32 lightsId, u8 season) {
    FieldLightEntry *entries = SeasonPreview_ReadFile(preview, ARCID_LIGHTS_FIELD, lightsId);
    const FieldLightEntry *entry;
    s32 daySeconds = SEASON_PREVIEW_LIGHT_HOUR < 0 ? RTC_ConvertDaySecondsCached() : SEASON_PREVIEW_LIGHT_HOUR * 3600;
    s32 previousEnd = 0;
    u32 count;
    u32 index = 0;
    u32 i;

    preview->hasLights = FALSE;
    if (entries == NULL) {
        return;
    }
    count = GFL_ArcSysGetDataLength(ARCID_LIGHTS_FIELD, lightsId) / sizeof(FieldLightEntry);
    if (count > FIELD_LIGHT_MAX_ENTRIES) {
        count = FIELD_LIGHT_MAX_ENTRIES;
    }
    for (i = 0; i < count; i++) {
        s32 end = GetLightChangeHoursForSeasons(season, entries[i].period) * 3600 + entries[i].minute * 60;

        if (previousEnd <= daySeconds && end > daySeconds) {
            index = i;
            break;
        }
        previousEnd = end;
    }
    if (count != 0) {
        entry = &entries[index];
        for (i = 0; i < NELEMS(preview->lights); i++) {
            if (entry->enabled[i]) {
                VEC_Fx16Normalize(&entry->dirs[i], &preview->lights[i].direction);
                preview->lights[i].color = entry->colors[i];
            } else {
                VEC_Fx16Set(&preview->lights[i].direction, 0, 0, 0);
                preview->lights[i].color = 0;
            }
        }
        for (i = 0; i < NELEMS(preview->materials); i++) {
            preview->materials[i] = entry->materials[i];
        }
        G3X_SetClearColor(preview->materials[LIGHT_MATERIAL_CLEAR], 31, 0x7fff, 0, FALSE);
        preview->hasLights = TRUE;
    }
    GFL_HeapFree(entries);
}

// FieldLight_FlushCore's lights and material colors, without the fog
static void SeasonPreview_FlushLights(SeasonPreview *preview) {
    u8 i;

    if (!preview->hasLights) {
        return;
    }
    for (i = 0; i < NELEMS(preview->lights); i++) {
        GFL_G3DSysLightSet(i, &preview->lights[i]);
    }
    NNS_G3dGlbMaterialColorDiffAmb(preview->materials[LIGHT_MATERIAL_DIFFUSE],
                                   preview->materials[LIGHT_MATERIAL_AMBIENT], TRUE);
    NNS_G3dGlbMaterialColorSpecEmi(preview->materials[LIGHT_MATERIAL_SPECULAR],
                                   preview->materials[LIGHT_MATERIAL_EMISSION], FALSE);
}

// Makes the shadow's texture in the heap and uploads it with its palette. Without room in the heap or VRAM, the
// preview is drawn without it
static void SeasonPreview_LoadShadow(SeasonPreview *preview) {
    u32 radiusX2 = SHADOW_RADIUS_X * 2;
    u32 radiusY2 = SHADOW_RADIUS_Y * 2;
    // The squared distances from the center in half texels, scaled so that the edge is at whole, then down by 16 bits
    // for the fade, whose square must fit in 32 bits
    u32 whole = radiusX2 * radiusX2 * radiusY2 * radiusY2;
    u32 core = (whole >> 16) * (256 - SHADOW_CORE) / 256;
    u8 *texels;
    u32 x;
    u32 y;

    if (!SeasonPreview_Fits(preview, SHADOW_TEXTURE_SIZE + SHADOW_PALETTE_SIZE)) {
        return;
    }
    preview->shadowTexKey = NNS_GfdAllocTexVram(SHADOW_TEXTURE_SIZE, FALSE, 0);
    preview->shadowPlttKey = NNS_GfdAllocPlttVram(SHADOW_PALETTE_SIZE, FALSE, 0);
    if (preview->shadowTexKey == NNS_GFD_ALLOC_ERROR_TEXKEY || preview->shadowPlttKey == NNS_GFD_ALLOC_ERROR_PLTTKEY) {
        SeasonPreview_FreeShadow(preview);
        return;
    }
    texels = GFL_HeapAllocate(preview->heapId, SHADOW_TEXTURE_SIZE + SHADOW_PALETTE_SIZE, FALSE, sSeasonPreviewFileName,
                              __LINE__);
    for (y = 0; y < SHADOW_TEXTURE_HEIGHT; y++) {
        // From the middle of the texel to the center, at the texture's bottom right corner
        u32 dy2 = (SHADOW_TEXTURE_HEIGHT - 1 - y) * 2 + 1;

        for (x = 0; x < SHADOW_TEXTURE_WIDTH; x++) {
            u32 dx2 = (SHADOW_TEXTURE_WIDTH - 1 - x) * 2 + 1;
            u32 distance = dx2 * dx2 * radiusY2 * radiusY2 + dy2 * dy2 * radiusX2 * radiusX2;
            u32 alpha = 0;

            if (distance < whole) {
                u32 fade = (whole - distance) >> 16;

                // smoothstep(s) = s * s * (3 - 2s), with s = fade / core, in integers
                alpha = fade >= core ? SHADOW_ALPHA
                                     : SHADOW_ALPHA * fade * fade / core * (3 * core - 2 * fade) / (core * core);
            }
            // A5I3: the alpha in the top 5 bits, over color 0
            texels[y * SHADOW_TEXTURE_WIDTH + x] = alpha << 3;
        }
    }
    MI_CpuClear16(texels + SHADOW_TEXTURE_SIZE, SHADOW_PALETTE_SIZE);
    DC_FlushRange(texels, SHADOW_TEXTURE_SIZE + SHADOW_PALETTE_SIZE);
    GX_BeginLoadTex();
    GX_LoadTex(texels, NNS_GfdGetTexKeyAddr(preview->shadowTexKey), SHADOW_TEXTURE_SIZE);
    GX_EndLoadTex();
    GX_BeginLoadTexPltt();
    GX_LoadTexPltt(texels + SHADOW_TEXTURE_SIZE, NNS_GfdGetPlttKeyAddr(preview->shadowPlttKey), SHADOW_PALETTE_SIZE);
    GX_EndLoadTexPltt();
    GFL_HeapFree(texels);
}

static void SeasonPreview_FreeShadow(SeasonPreview *preview) {
    if (preview->shadowTexKey != NNS_GFD_ALLOC_ERROR_TEXKEY) {
        NNS_GfdFreeTexVram(preview->shadowTexKey);
        preview->shadowTexKey = NNS_GFD_ALLOC_ERROR_TEXKEY;
    }
    if (preview->shadowPlttKey != NNS_GFD_ALLOC_ERROR_PLTTKEY) {
        NNS_GfdFreePlttVram(preview->shadowPlttKey);
        preview->shadowPlttKey = NNS_GFD_ALLOC_ERROR_PLTTKEY;
    }
}

// Draws the shadow over the map, a quad in the screen's coordinates in front of it, with the projection and the
// position matrices set to identity and put back after
static void SeasonPreview_DrawShadow(SeasonPreview *preview) {
    fx16 left = SeasonPreview_GetScreenX(SCREEN_WIDTH / 2 - SHADOW_RADIUS_X);
    fx16 right = SeasonPreview_GetScreenX(SCREEN_WIDTH / 2 + SHADOW_RADIUS_X);
    fx16 top = SeasonPreview_GetScreenY(preview->shadowY - SHADOW_RADIUS_Y);
    fx16 bottom = SeasonPreview_GetScreenY(preview->shadowY + SHADOW_RADIUS_Y);
    // The shadow's center is the texture's bottom right corner, where it flips
    fx32 s0 = (SHADOW_TEXTURE_WIDTH - SHADOW_RADIUS_X) * FX32_ONE;
    fx32 s1 = (SHADOW_TEXTURE_WIDTH + SHADOW_RADIUS_X) * FX32_ONE;
    fx32 t0 = (SHADOW_TEXTURE_HEIGHT - SHADOW_RADIUS_Y) * FX32_ONE;
    fx32 t1 = (SHADOW_TEXTURE_HEIGHT + SHADOW_RADIUS_Y) * FX32_ONE;

    if (preview->shadowTexKey == NNS_GFD_ALLOC_ERROR_TEXKEY) {
        return;
    }
    NNS_G3dGeFlushBuffer();
    G3_MtxMode(GX_MTXMODE_PROJECTION);
    G3_PushMtx();
    G3_Identity();
    G3_MtxMode(GX_MTXMODE_TEXTURE);
    G3_Identity();
    G3_MtxMode(GX_MTXMODE_POSITION_VECTOR);
    G3_PushMtx();
    G3_Identity();
    G3_PolygonAttr(GX_LIGHTMASK_NONE, GX_POLYGONMODE_MODULATE, GX_CULL_NONE, SHADOW_POLYGON_ID, SHADOW_POLYGON_ALPHA,
                   0);
    G3_TexImageParam(GX_TEXFMT_A5I3, GX_TEXGEN_TEXCOORD, GX_TEXSIZE_S128, GX_TEXSIZE_T64, GX_TEXREPEAT_ST,
                     GX_TEXFLIP_ST, GX_TEXPLTTCOLOR0_USE, NNS_GfdGetTexKeyAddr(preview->shadowTexKey));
    G3_TexPlttBase(NNS_GfdGetPlttKeyAddr(preview->shadowPlttKey), GX_TEXFMT_A5I3);
    G3_Color(GX_RGB(0, 0, 0));
    G3_Begin(GX_BEGIN_QUADS);
    G3_TexCoord(s0, t0);
    G3_Vtx(left, top, 0);
    G3_TexCoord(s0, t1);
    G3_Vtx(left, bottom, 0);
    G3_TexCoord(s1, t1);
    G3_Vtx(right, bottom, 0);
    G3_TexCoord(s1, t0);
    G3_Vtx(right, top, 0);
    G3_End();
    G3_PopMtx(1);
    G3_MtxMode(GX_MTXMODE_PROJECTION);
    G3_PopMtx(1);
    G3_MtxMode(GX_MTXMODE_POSITION_VECTOR);
}

// A pixel's column and line as the viewport maps them, from -1 at the left to 1 at the right, and from 1 at the top
// to -1 at the bottom
static fx16 SeasonPreview_GetScreenX(int x) {
    return x * FX16_ONE * 2 / SCREEN_WIDTH - FX16_ONE;
}

static fx16 SeasonPreview_GetScreenY(int y) {
    return FX16_ONE - y * FX16_ONE * 2 / SCREEN_HEIGHT;
}
