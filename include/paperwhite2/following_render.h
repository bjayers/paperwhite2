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
