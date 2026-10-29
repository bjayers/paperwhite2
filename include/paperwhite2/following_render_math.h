#ifndef PAPERWHITE2_FOLLOWING_RENDER_MATH_H
#define PAPERWHITE2_FOLLOWING_RENDER_MATH_H

#include "types.h"
#include "gfl/billboard_actor.h"
#include "nitro/fx.h"
#include "paperwhite2/following.h"

// Paper White 2: the depth corrections of the Following Pokémon's billboards, which move a quad along the camera's
// eye ray so that it sorts in front of or behind another while its picture stays where it is on the screen
// (src/paperwhite2/ov036/paperwhite2_following_render_math.c), ported from Pokeweb's render_math.h. The camera and
// the positions are 20.12 world units, the scales fx16

// The field's camera: projection is a G3DCAM_PROJECTION_*, and any other isn't a field camera
typedef struct {
    VecFx32 eye;
    VecFx32 target;
    u32 projection;
} FollowingCamera;

// A billboard's quad: its position and its scale
typedef struct {
    VecFx32 position;
    s32 scaleX;
    s32 scaleY;
} FollowingPose;

// What FollowingRender_Correct did: the camera's unit view axis, the quad's depth in front of the player before and
// after, and the order chosen: 1 in front, -1 behind, -2 kept below and behind
typedef struct {
    VecFx32 axis;
    s32 before;
    s32 after;
    s32 policy;
} FollowingDepthResult;

// An eighth of a world unit, against a tile of 16
#define FOLLOWING_RENDER_TIE_MARGIN 512

// FollowingRender_Correct's flags
#define FOLLOWING_RENDER_LARGE 1u
#define FOLLOWING_RENDER_NORTH 2u
#define FOLLOWING_RENDER_FORCE_FRONT 4u
#define FOLLOWING_RENDER_FORCE_BACK 8u

// How far down the north-facing art is drawn, in world units
#define FOLLOWING_RENDER_NORTH_ART_Y 2

// A world unit is one of the hardware's depth steps at the field's camera. The four units used before pushed the quad
// through its shadow and through the walls of nearby stairs
#define FOLLOWING_RENDER_SORT_BEHIND (1 * FX32_ONE)
// A tile clears the shadow and a step of height: a wilder pose stops there instead of diving through the wall behind
// the player
#define FOLLOWING_RENDER_BEHIND_CAP (16 * FX32_ONE)
// The field's ordinary cameras are within this distance of their target. Past it the margin behind grows with the
// square of the distance over this, as the depth buffer's resolution drops, and stops at a tile
#define FOLLOWING_RENDER_CAMERA_REF (256u * FX32_ONE)
// The margin while the two cross in a swap and in the close pose after it, which blends back to the ordinary one
#define FOLLOWING_RENDER_SORT_STRONG (8 * FX32_ONE)
// The depth past which the follower is nearer the camera, which the blend at close range doesn't pull behind the
// player
#define FOLLOWING_RENDER_CLEAR_FRONT (4 * FX32_ONE)
// A shadow moved back stays a unit behind its sprite
#define FOLLOWING_RENDER_SHADOW_KEEP (1 * FX32_ONE)
// The distance along the ground that puts the center about four units of depth behind the feet at the field's
// ordinary camera, and never as far as half a tile. The screen's half-width (8 * scaleX) isn't a world distance
#define FOLLOWING_RENDER_PLANE_CAP (6 * FX32_ONE)
// The top row of a 56-unit body leaning forward a quarter is about 74 units forward at a 44-degree camera, and past
// this a steep camera's top rows lean back again
#define FOLLOWING_RENDER_SPLIT_CAP (5 * FOLLOWING_TILE)

// Where the top edges of the strips stand, along the ground from the feet (toward the camera when positive): base
// (-5 to 2 tiles), plus forward (0 to 2 tiles) ramped in over ramp units of height from rise up. A strip whose top
// already stands there or nearer doesn't move
typedef struct {
    s32 base;
    s32 forward;
    s32 rise;
    s32 ramp;
} FollowingStripStack;

// The camera-facing axes that FollowingRender_Strips uses, built once a frame
typedef struct {
    VecFx32 eye;
    VecFx32 view;
    VecFx32 right;
    VecFx32 up;
    VecFx32 toward;
    s32 flat;
    s32 upToward;
    BOOL ortho;
} FollowingCameraBasis;

BOOL FollowingRender_Correct(const VecFx32 *world, const VecFx32 *playerWorld, const FollowingPose *native,
                             const VecFx32 *playerDraw, const FollowingCamera *camera, u32 flags, FollowingPose *output,
                             FollowingDepthResult *result);
// Keeps the opaque billboard in front of its shadow on the ground without moving its picture. The shadow stays at
// the actor's own ground point
BOOL FollowingRender_AboveShadow(const FollowingPose *native, const VecFx32 *ground, const FollowingCamera *camera,
                                 FollowingPose *output);
// Pushes the follower's quad back along the eye ray alone until it is margin behind the player, by cap at most. The
// player's quad, the shadow and the follower's position in the world stay
BOOL FollowingRender_KeepBehind(const FollowingPose *follower, const FollowingPose *player,
                                const FollowingCamera *camera, s32 margin, s32 cap, FollowingPose *output);
// The distance from the eye to the target, 0 when they are the same point
u32 FollowingRender_ViewDistance(const FollowingCamera *camera);
// FollowingRender_KeepBehind's margin. easeS is a smoothstep in 0 to 65536: 0 while the sprites cross or the
// follower holds the close pose, 65536 with no swap or ease. The strong margin blends to the ordinary one, so the
// last frame of the ease is an idle one. Past FOLLOWING_RENDER_CAMERA_REF both scale by the square of the distance
// over it, within a tile
s32 FollowingRender_SortMargin(const FollowingCamera *camera, u32 easeS);
// The depth of point less that of origin, nearer the camera when positive, 0 when the camera or the distance can't be
// used
s32 FollowingRender_ViewGap(const VecFx32 *point, const VecFx32 *origin, const FollowingCamera *camera);
// The depth that counts as clearly nearer the camera
s32 FollowingRender_ClearFront(const FollowingCamera *camera);
// Moves a shadow back behind sprite by keep: a unit at rest, and the swap's margin while a tuck has pulled the sprite
// back through the oval. The shadow's picture doesn't move
BOOL FollowingRender_ShadowTuck(const FollowingPose *shadow, const VecFx32 *sprite, const FollowingCamera *camera,
                                s32 keep, FollowingPose *output);
// FollowingRender_ShadowTuck, for a shadow within four tiles of feet
BOOL FollowingRender_ShadowMatch(const FollowingPose *shadow, const VecFx32 *feet, const VecFx32 *sprite,
                                 const FollowingCamera *camera, s32 keep, FollowingPose *output);
// Pushes the oval on the ground away from the camera by the depth of its near rim plus eight world units, a tile at
// most, scaled so the picture stays on its ground point. Orthographic and unknown cameras leave it, and it doesn't
// follow the body
BOOL FollowingRender_OvalBehind(const FollowingPose *shadow, const FollowingCamera *camera, FollowingPose *output);
// A billboard scene of the follower's own for a second submit, from the field's live one: its heap, scale and four
// light colors, with the rest zero. The live polygon ID isn't copied: with the copied tail, the field's ID is what the
// 3DS's edge buffer draws as black lines, which emulators don't keep. The ID is 1, or 2 when the live scene's is 1
void FollowingRender_PrivateScene(BillboardActorScene *scene, const BillboardActorScene *live, BillboardActor *actors,
                                  BillboardActorMaterial *materials, u16 actorCount, u16 materialCount);
// Grass, which faces the camera, clears the actor it belongs to, but stays behind a nearer body
BOOL FollowingRender_CoverFeet(const FollowingPose *grass, const FollowingPose *body, const FollowingPose *other,
                               const FollowingCamera *camera, FollowingPose *output);
// Raises a bubble attached to the follower in the camera's plane, keeping its horizontal center and depth with a
// perspective camera too. height is in world units
BOOL FollowingRender_HeadPosition(const VecFx32 *base, const FollowingCamera *camera, fx32 height, VecFx32 *output);
// Pulls a bubble on the follower's head toward the camera along the eye ray, so the map behind the follower can't hide
// it, with its picture where it was. When player is half a tile or more nearer than the bubble, the bubble stops a
// unit behind them instead of covering them. player can be NULL
BOOL FollowingRender_EmotePlace(const FollowingPose *bubble, const VecFx32 *player, const FollowingCamera *camera,
                                FollowingPose *output);
// Moves feet away from the camera along the ground until it is viewKeep deeper, or FOLLOWING_RENDER_PLANE_CAP world
// units, whichever is less, with its height kept. A camera looking straight down leaves the point
BOOL FollowingRender_PlaneKeep(const VecFx32 *feet, const FollowingCamera *camera, s32 viewKeep, VecFx32 *output);
// Horizontal strips of a tall body, for a submit of their own. body is the camera-facing quad as submitted (anchored at
// the feet), half its half-width in the world. Strip i spans top - (i + 1) * strip to top - i * strip world units up
// the camera's plane, with scale stripScaleY. Each moves toward the camera along its own eye ray until its top edge
// stands where stack says, within FOLLOWING_RENDER_SPLIT_CAP of depth, with its pixels where they were. FALSE for an
// unknown projection, a camera looking straight down or a pose that can't be used
BOOL FollowingRender_Strips(const FollowingPose *body, const FollowingCamera *camera, s32 half, s32 top, s32 strip,
                            u32 count, const FollowingStripStack *stack, s32 stripScaleY, FollowingPose *output);
BOOL FollowingRender_Basis(const FollowingCamera *camera, FollowingCameraBasis *output);

#endif // PAPERWHITE2_FOLLOWING_RENDER_MATH_H
