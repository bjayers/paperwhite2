#ifndef POKEBW2_FIELD_FIELD_TERRAIN_ANIMATOR_H
#define POKEBW2_FIELD_FIELD_TERRAIN_ANIMATOR_H

// Overlay 36's animations of the map chunks' textures. Names and layouts from swan
// (https://github.com/ds-pokemon-hacking/swan, GPL-3.0)

#include "types.h"
#include "gfl/heap.h"
#include "nnsys/g3d.h"
#include "struct_decls.h"

typedef struct FieldTerrainAnimator FieldTerrainAnimator;
typedef struct FieldTerrainSRTAnimatorChunkState FieldTerrainSRTAnimatorChunkState;

// An area without that kind of terrain animation
#define FIELD_TERRAIN_ANM_NONE 0xffffffff

// The animation files of an area, FIELD_TERRAIN_ANM_NONE for none
typedef struct {
    u32 srtAnimeId;
    u32 patAnimeId;
} FieldTerrainAnmInfo;

typedef struct {
    u16 hasSRT : 8;
    u16 hasPat : 8;
    u16 chunkCapacity;
    u16 arcIdSRT;
    u16 idSRT;
    u16 arcIdPat;
    u16 idPat;
} FieldTerrainAnimatorSetup;

// The texture pattern animations a map can have
#define FIELD_TERRAIN_TEXPAT_ANIMATION_MAX 16

// A texture pattern animation's value at a frame
typedef struct {
    u8 textureIndex;
    u8 paletteIndex;
} GFBTPValue;

// A texture pattern animation file: the key frames, with each one's texture and palette, and each target's first key
// frame
typedef struct {
    u16 *keyFrames;
    u8 *textureIndices;
    u8 *paletteIndices;
    u8 *targets;
    u32 keyFrameCount;
    u32 targetCount;
    u32 frameCount;
} GFBTPController;

// A file of ARCID_AREA_ANIME_PAT: its texture pattern animations, each a GFBTP file and the NSBTX of its frames'
// textures, at offsets from the start of the file
typedef struct {
    u32 gfbtpOffset;
    u32 nsbtxOffset;
} FieldTerrainTexPatAnimationEntry;

typedef struct {
    u32 dataCount;
    FieldTerrainTexPatAnimationEntry offsets[0];
} FieldTerrainTexPatAnimationPack;

FieldTerrainAnimator *FieldTerrainAnimator_Create(const FieldTerrainAnimatorSetup *setup, G3DResource *mapTextures,
                                                  HeapID heapId);
void FieldTerrainAnimator_Free(FieldTerrainAnimator *animator);
void FieldTerrainAnimator_Update(FieldTerrainAnimator *animator);
FieldTerrainSRTAnimatorChunkState *FieldTerrainAnimator_GetChunkState(FieldTerrainAnimator *animator, u32 chunkIndex);
// Binds the chunk's SRT animation to its model and textures, in the render object
void FieldTerrainSRTAnimatorChunkState_Bind(FieldTerrainSRTAnimatorChunkState *state, G3DResource *model,
                                            G3DResource *textures, NNSG3dRenderObj *renderObj);
void FieldTerrainSRTAnimatorChunkState_ClearUsedFlag(FieldTerrainSRTAnimatorChunkState *state);

#endif // POKEBW2_FIELD_FIELD_TERRAIN_ANIMATOR_H
