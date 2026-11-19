#ifndef PAPERWHITE2_FOLLOWING_RENDER_H
#define PAPERWHITE2_FOLLOWING_RENDER_H

#include "types.h"
#include "field/field_camera.h"
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
    // The camera-side experiments: the follower as FOLLOWING_SHADOW_CURRENT, the camera changed instead. Over the
    // camera fixes (res/paperwhite2/follower_camera_fixes.json), the forest's camera setup with the ordinary near
    // plane, so the actors' clip Z offset has its ordinary strength
    FOLLOWING_SHADOW_CAMERA_NEAR_1,
    // The centers' camera setup Z-buffered with the ordinary near plane
    FOLLOWING_SHADOW_CAMERA_Z_BUFFER,
    // Both of the two above
    FOLLOWING_SHADOW_CAMERA_BOTH,
    // The forest's fix, now always on: the same as FOLLOWING_SHADOW_CURRENT, kept so the variants' numbers stay
    FOLLOWING_SHADOW_CAMERA_SCALED_OFFSET,
    // The centers' camera setup with a near plane of 16 or 32 units instead of its fix's 64
    FOLLOWING_SHADOW_CAMERA_CENTER_NEAR_16,
    FOLLOWING_SHADOW_CAMERA_CENTER_NEAR_32,
    // The centers' fix, now always on: the same as FOLLOWING_SHADOW_CURRENT
    FOLLOWING_SHADOW_CAMERA_CENTER_FIX,
    // Every camera as the original has it: the camera fixes off
    FOLLOWING_SHADOW_CAMERA_FIXES_OFF,
    // In the W-buffered setups that keep their planes and fog (the camera fixes' w_pull), the actors' pass moved
    // nearer the camera in true depth, their pictures unchanged: by the setup's w_pull with the effects in place, or by
    // the ordinary maps' depth with the effects at half of it, as the clip Z offset gives on a Z-buffered map. The
    // setups whose w_pull is built in have the first always; the debug row adds the others (Castelia's streets and
    // Victory Road's outside)
    FOLLOWING_SHADOW_NEARER_IN_W,
    FOLLOWING_SHADOW_NEARER_IN_W_FULL,
    // In the setups with a low_oval_pull (Castelia's streets): the follower's oval as FOLLOWING_SHADOW_LOW and the
    // actors' pass pulled nearer by that smaller pull
    FOLLOWING_SHADOW_LOW_OVAL_NEARER,
    FOLLOWING_SHADOW_VARIANT_COUNT,
};

// The camera setups that the experiments change: the Entree Forest's and the Pokémon Centers'
#define FOLLOWING_CAMERA_FOREST 35
#define FOLLOWING_CAMERA_CENTER 3

// The variant in use: the debug menu's, FOLLOWING_SHADOW_CURRENT without one
u32 FollowingRender_GetShadowVariant(void);
// FldeffShadow_Draw's oval for the follower: moves pos and sets scale (fx32 of the oval's size) by the variant
void FollowingRender_PlaceOval(VecFx32 *pos, s16 *scale);
// FieldCamera_ReadDefaults's setup index of archive 0x3b changed by its camera fix (a Z-buffer and a near plane), then
// by the camera-side variant
void FollowingRender_AdjustCamera(u32 index, FieldCameraDefaults *defaults);
// The camera's planes and buffering set again from its setup, as a map load does, so a new variant shows at once
void FollowingRender_ApplyCamera(FieldCamera *camera);
// The actors' clip Z offset (objectProjectionMatrixOffset, or half of it for the effects) for the camera's near plane:
// multiplied by the near plane in units where the setup's camera fix scales it, unchanged elsewhere
fx32 FollowingRender_ClipOffset(FieldCamera *camera, fx32 offset);
// The W-buffer's version of that offset, built in where the setup's fix says and for FOLLOWING_SHADOW_NEARER_IN_W,
// _FULL and FOLLOWING_SHADOW_LOW_OVAL_NEARER: the projection mtx scaled so everything it draws comes nearer the eye
// along its ray, in the W-buffered setups listed for it. offset is the pass's
// vanilla clip Z offset (the actors', or the effects' half of it), and actors whether it is the actors' pass
void FollowingRender_NearerInW(FieldCamera *camera, MtxFx44 *mtx, fx32 offset, BOOL actors);

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
