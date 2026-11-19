#ifndef PAPERWHITE2_FOLLOWING_RENDER_H
#define PAPERWHITE2_FOLLOWING_RENDER_H

#include "types.h"
#include "gfl/billboard_actor.h"
#include "nitro/fx.h"
#include "nitro/gx.h"
#include "struct_decls.h"

// Paper White 2: the Following Pokémon's draws, the follower's billboard with its own height, light and the strips
// that keep a tall body off a wall behind it, and the grass over its feet
// (src/paperwhite2/ov036/paperwhite2_following_render.c), ported from Pokeweb's render.c

// The follower's body as last submitted, for the effects drawn on it
typedef struct {
    VecFx32 position;
    s16 scaleX;
    s16 scaleY;
} FollowingEffectPose;

// The billboards' light masks: an actor in the shade has light 3 alone, any other light 0 alone
#define FOLLOWING_LIGHTS_SUN GX_LIGHTMASK_0
#define FOLLOWING_LIGHTS_SHADE GX_LIGHTMASK_3

// The candidate fixes of the oval over the follower's feet, which the debug menu's Follower shadow cycles
// (docs/paperwhite2/following-pokemon.md, "The oval over the feet"). Only the follower's oval and body change
enum {
    // The engine's oval, the quad lowered by the lift
    FOLLOWING_SHADOW_CURRENT,
    // The oval 2 or 4 units back along the ground, away from the camera
    FOLLOWING_SHADOW_BACK_2,
    FOLLOWING_SHADOW_BACK_4,
    // The oval at 80% or 65% of its size, a unit back
    FOLLOWING_SHADOW_SIZE_80,
    FOLLOWING_SHADOW_SIZE_65,
    // The quad not lowered, the oval as the engine puts it
    FOLLOWING_SHADOW_NO_LIFT,
    // The oval a quarter of a unit over the ground instead of a unit
    FOLLOWING_SHADOW_LOW,
    // The quad lowered on the screen only: the same picture, at the depth of a quad that isn't lowered
    FOLLOWING_SHADOW_SCREEN_LIFT,
    FOLLOWING_SHADOW_VARIANT_COUNT,
};

// The variant in use: the debug menu's, FOLLOWING_SHADOW_CURRENT without one
u32 FollowingRender_GetShadowVariant(void);
// FldeffShadow_Draw's oval for the follower: moves pos and sets scale (fx32 of the oval's size) by the variant
void FollowingRender_PlaceOval(VecFx32 *pos, s16 *scale);

// The descriptor's Z offset moves the model and its shadow together, and stays the same whatever the facing, so
// turning snaps neither
void FollowingRender_Anchor(FieldActor *actor, u32 face);
// The actors' pass: the follower's quad at its registry Y (spriteY) plus a fixed lift (2 down), pulled in front of
// its oval, its own tile's light when the player has one of the two plain masks (shaded), and a tall one split into
// strips in front of a wall behind it, a 32-pixel one into a few that move a little. covered submits no body (a ball
// effect draws its silhouette instead) but keeps the pose for it. The player's quad is only read, and everything is put
// back after the submit
void FollowingRender_Draw(BillboardActorSys *system, G3DCamera *camera, G3DLight *lights, FieldActor *follower,
                          FieldActor *player, s32 spriteY, BOOL shaded, BOOL covered);
// The body as submitted by the last actors' pass. live is the quad now: the submitted pose when it is that and the
// actor hasn't moved, or else live moved as the draw moved the submitted quad
BOOL FollowingRender_EffectPose(FieldActor *actor, const VecFx32 *live, FollowingEffectPose *out);
void FollowingRender_ClearGrass(void);
// The wild effects' pass: the grass on the follower's and the player's tiles clears their feet
void FollowingRender_GrassDraw(BillboardActorSys *system, G3DCamera *camera, G3DLight *lights, FieldActor *follower);

#endif // PAPERWHITE2_FOLLOWING_RENDER_H
