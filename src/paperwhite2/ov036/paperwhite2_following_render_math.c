#include "types.h"
#include "gfl/billboard_actor.h"
#include "gfl/g3d.h"
#include "limits.h"
#include "nitro/fx.h"
#include "nitro/mi.h"
#include "paperwhite2/following.h"
#include "paperwhite2/following_render_math.h"

// Paper White 2: the depth corrections of the Following Pokémon's billboards, ported from Pokeweb's render_math.c

// The distance from the camera's eye past which the margins stop growing
#define ZOOM_LIMIT (8u * FOLLOWING_RENDER_CAMERA_REF)

// The strong margin is larger than the ordinary one (FOLLOWING_RENDER_SORT_STRONG > FOLLOWING_RENDER_SORT_BEHIND) and
// fits in the tile they are capped at (FOLLOWING_RENDER_SORT_STRONG <= FOLLOWING_TILE)

// value / divisor, by a 64-bit long division a bit at a time, the quotient saturating. 0 for a divisor of 0 or less
static s32 Divide(s64 value, s32 divisor) {
    u64 n = value < 0 ? (u64)-value : (u64)value;
    u64 r = 0;
    u64 q = 0;
    u32 bit;

    if (divisor <= 0) {
        return 0;
    }
    for (bit = 0; bit < 64; bit++) {
        r = (r << 1) | (n >> 63);
        n <<= 1;
        q <<= 1;
        if (r >= (u32)divisor) {
            r -= (u32)divisor;
            q |= 1;
        }
    }
    if (q > LONG_MAX) {
        q = LONG_MAX;
    }
    return value < 0 ? -(s32)q : (s32)q;
}

static u32 SquareRoot(u64 n) {
    u64 bit = (u64)1 << 62;
    u64 result = 0;

    while (bit > n) {
        bit >>= 2;
    }
    while (bit != 0) {
        if (n >= result + bit) {
            n -= result + bit;
            result = (result >> 1) + bit;
        } else {
            result >>= 1;
        }
        bit >>= 2;
    }
    return result > 0xffffffffu ? 0xffffffffu : (u32)result;
}

static u32 SquareRoot32(u32 n) {
    u32 answer = 0;
    u32 bit = 1u << 30;

    while (bit > n) {
        bit >>= 2;
    }
    while (bit != 0) {
        if (n >= answer + bit) {
            n -= answer + bit;
            answer = (answer >> 1) + bit;
        } else {
            answer >>= 1;
        }
        bit >>= 2;
    }
    return answer;
}

// a - b, FALSE when a coordinate of it is more than limit either way
static BOOL Delta(const VecFx32 *a, const VecFx32 *b, VecFx32 *out, s32 limit) {
    s64 x = (s64)a->x - b->x;
    s64 y = (s64)a->y - b->y;
    s64 z = (s64)a->z - b->z;

    if (x > limit || x < -limit || y > limit || y < -limit || z > limit || z < -limit) {
        return FALSE;
    }
    VEC_Set(out, (fx32)x, (fx32)y, (fx32)z);
    return TRUE;
}

static s32 Dot(const VecFx32 *a, const VecFx32 *b) {
    return (s32)(((s64)a->x * b->x + (s64)a->y * b->y + (s64)a->z * b->z) / FX32_ONE);
}

// The unit vector along d, FALSE when d is shorter than a world unit on every axis. It is scaled by its largest
// coordinate first, so its squared length fits in 32 bits
static BOOL Axis(VecFx32 d, VecFx32 *out) {
    s32 m = d.x < 0 ? -d.x : d.x;
    s32 t = d.y < 0 ? -d.y : d.y;
    s32 length;

    if (t > m) {
        m = t;
    }
    t = d.z < 0 ? -d.z : d.z;
    if (t > m) {
        m = t;
    }
    if (m < FX32_ONE) {
        return FALSE;
    }
    d.x = Divide((s64)d.x * FX32_ONE, m);
    d.y = Divide((s64)d.y * FX32_ONE, m);
    d.z = Divide((s64)d.z * FX32_ONE, m);
    length = SquareRoot32(d.x * d.x + d.y * d.y + d.z * d.z);
    VEC_Set(out, Divide((s64)d.x * FX32_ONE, length), Divide((s64)d.y * FX32_ONE, length),
            Divide((s64)d.z * FX32_ONE, length));
    return TRUE;
}

// Moves native change units of depth along direction, by two tiles at most
static BOOL ShiftDepth(const FollowingPose *native, const FollowingCamera *camera, const VecFx32 *direction, s32 change,
                       FollowingPose *out) {
    VecFx32 ray;
    s32 distance;

    *out = *native;
    if (change > 2 * FOLLOWING_TILE || change < -2 * FOLLOWING_TILE) {
        return FALSE;
    }
    if (camera->projection == G3DCAM_PROJECTION_ORTHO) {
        out->position.x += Divide((s64)direction->x * change, FX32_ONE);
        out->position.y += Divide((s64)direction->y * change, FX32_ONE);
        out->position.z += Divide((s64)direction->z * change, FX32_ONE);
    } else {
        // Along the eye ray, the quad scaled so its pixels stay where they are on the screen
        if (!Delta(&camera->eye, &native->position, &ray, 1 << 27)) {
            return FALSE;
        }
        distance = Dot(&ray, direction);
        if (distance < 4 * FOLLOWING_TILE || distance - change < 4 * FOLLOWING_TILE) {
            return FALSE;
        }
        out->position.x += Divide((s64)ray.x * change, distance);
        out->position.y += Divide((s64)ray.y * change, distance);
        out->position.z += Divide((s64)ray.z * change, distance);
        out->scaleX += Divide(-(s64)native->scaleX * change, distance);
        out->scaleY += Divide(-(s64)native->scaleY * change, distance);
        if (out->scaleX <= 0 || out->scaleY <= 0 || out->scaleX > 32767 || out->scaleY > 32767) {
            *out = *native;
            return FALSE;
        }
    }
    return TRUE;
}

static BOOL IsScaleValid(const FollowingPose *pose) {
    return pose->scaleX > 0 && pose->scaleY > 0 && pose->scaleX <= 32767 && pose->scaleY <= 32767;
}

BOOL FollowingRender_HeadPosition(const VecFx32 *base, const FollowingCamera *camera, fx32 height, VecFx32 *output) {
    VecFx32 view;
    VecFx32 right;
    VecFx32 up;

    if (height < 0 || height > 5 * FOLLOWING_TILE || !Delta(&camera->eye, &camera->target, &view, 1 << 27) ||
        !Axis(view, &view)) {
        return FALSE;
    }
    // Axis needs a world unit at least, and this vector is already a unit one
    VEC_Set(&right, view.z * FX32_ONE, 0, -view.x * FX32_ONE);
    if (!Axis(right, &right)) {
        return FALSE;
    }
    VEC_Set(&up, view.y * right.z, view.z * right.x - view.x * right.z, -view.y * right.x);
    if (!Axis(up, &up)) {
        return FALSE;
    }
    VEC_Set(output, base->x + Divide((s64)up.x * height, FX32_ONE), base->y + Divide((s64)up.y * height, FX32_ONE),
            base->z + Divide((s64)up.z * height, FX32_ONE));
    return TRUE;
}

BOOL FollowingRender_AboveShadow(const FollowingPose *native, const VecFx32 *ground, const FollowingCamera *camera,
                                 FollowingPose *output) {
    VecFx32 direction;
    VecFx32 relative;
    s32 current;
    s32 target;

    *output = *native;
    if (camera->projection > G3DCAM_PROJECTION_ORTHO || !IsScaleValid(native)) {
        return FALSE;
    }
    if (!Delta(&camera->eye, &camera->target, &direction, 1 << 27) || !Axis(direction, &direction) ||
        !Delta(&native->position, ground, &relative, 8 * FOLLOWING_TILE)) {
        return FALSE;
    }
    // The shadow is a unit above the ground and covers several of its pixels. A continuous clamp of the depth clears
    // all of it through the bobbing frames, so the order of the player and the follower can't flip at a threshold
    current = Dot(&relative, &direction);
    target = 6 * FX32_ONE;
    if (current >= target) {
        return FALSE;
    }
    return ShiftDepth(native, camera, &direction, target - current + 16, output);
}

static u32 ViewSpan(const FollowingCamera *camera) {
    s64 dx = (s64)camera->eye.x - camera->target.x;
    s64 dy = (s64)camera->eye.y - camera->target.y;
    s64 dz = (s64)camera->eye.z - camera->target.z;

    if (dx < 0) {
        dx = -dx;
    }
    if (dy < 0) {
        dy = -dy;
    }
    if (dz < 0) {
        dz = -dz;
    }
    if (dx >= (s64)ZOOM_LIMIT || dy >= (s64)ZOOM_LIMIT || dz >= (s64)ZOOM_LIMIT) {
        return ZOOM_LIMIT;
    }
    return SquareRoot((u64)dx * (u64)dx + (u64)dy * (u64)dy + (u64)dz * (u64)dz);
}

// The square of distance over FOLLOWING_RENDER_CAMERA_REF in 16.16: one at the field's ordinary camera, and
// saturating once the scaled margin is past its cap of a tile anyway
static u32 ZoomSquared(u32 distance) {
    s32 q;
    u32 s;

    if (distance <= FOLLOWING_RENDER_CAMERA_REF) {
        return 65536;
    }
    if (distance >= ZOOM_LIMIT) {
        return 64 * 65536;
    }
    q = Divide((s64)distance << 16, FOLLOWING_RENDER_CAMERA_REF);
    if (q <= 65536) {
        return 65536;
    }
    s = ((u64)(u32)q * (u32)q) >> 16;
    return s < 65536 ? 65536 : s;
}

static s32 ScaleMargin(s32 base, u32 zoom) {
    u64 v;

    if (base <= 0) {
        return 0;
    }
    v = ((u64)(u32)base * zoom) >> 16;
    if (v < (u32)base) {
        v = (u32)base;
    }
    if (v > FOLLOWING_TILE) {
        v = FOLLOWING_TILE;
    }
    return (s32)v;
}

u32 FollowingRender_ViewDistance(const FollowingCamera *camera) {
    if (camera == NULL) {
        return 0;
    }
    return ViewSpan(camera);
}

s32 FollowingRender_SortMargin(const FollowingCamera *camera, u32 easeS) {
    u32 zoom = ZoomSquared(camera != NULL ? ViewSpan(camera) : 0);
    s32 base = ScaleMargin(FOLLOWING_RENDER_SORT_BEHIND, zoom);
    s32 strong;
    u32 span;
    u32 drop;
    s32 margin;

    if (easeS >= 65536) {
        return base;
    }
    strong = ScaleMargin(FOLLOWING_RENDER_SORT_STRONG, zoom);
    if (strong < base) {
        strong = base;
    }
    span = strong - base;
    drop = ((u64)span * easeS) >> 16;
    margin = strong - (s32)drop;
    return margin < base ? base : margin;
}

s32 FollowingRender_ClearFront(const FollowingCamera *camera) {
    u32 zoom = ZoomSquared(camera != NULL ? ViewSpan(camera) : 0);
    s32 clear = ScaleMargin(FOLLOWING_RENDER_CLEAR_FRONT, zoom);

    // A whole tile toward the camera stays in front on a zoomed view
    if (clear > FOLLOWING_TILE / 2) {
        clear = FOLLOWING_TILE / 2;
    }
    return clear;
}

static BOOL ViewAxis(const FollowingCamera *camera, VecFx32 *view) {
    return camera != NULL && Delta(&camera->eye, &camera->target, view, 1 << 27) && Axis(*view, view);
}

s32 FollowingRender_ViewGap(const VecFx32 *point, const VecFx32 *origin, const FollowingCamera *camera) {
    VecFx32 view;
    VecFx32 relative;

    if (point == NULL || origin == NULL || !ViewAxis(camera, &view) ||
        !Delta(point, origin, &relative, 8 * FOLLOWING_TILE)) {
        return 0;
    }
    return Dot(&relative, &view);
}

BOOL FollowingRender_KeepBehind(const FollowingPose *follower, const FollowingPose *player,
                                const FollowingCamera *camera, s32 margin, s32 cap, FollowingPose *output) {
    VecFx32 direction;
    VecFx32 relative;
    s32 current;
    s32 target;
    s32 change;

    *output = *follower;
    if (camera->projection > G3DCAM_PROJECTION_ORTHO || margin < FOLLOWING_RENDER_TIE_MARGIN ||
        margin > FOLLOWING_TILE || cap < margin || cap > 2 * FOLLOWING_TILE || !IsScaleValid(follower)) {
        return FALSE;
    }
    if (!Delta(&camera->eye, &camera->target, &direction, 1 << 27) || !Axis(direction, &direction) ||
        !Delta(&follower->position, &player->position, &relative, 8 * FOLLOWING_TILE)) {
        return FALSE;
    }
    current = Dot(&relative, &direction);
    target = -margin;
    if (current <= target) {
        return FALSE;
    }
    change = target - current;
    if (change < -cap) {
        change = -cap;
    }
    return ShiftDepth(follower, camera, &direction, change - 16, output);
}

BOOL FollowingRender_EmotePlace(const FollowingPose *bubble, const VecFx32 *player, const FollowingCamera *camera,
                                FollowingPose *output) {
    VecFx32 view;
    VecFx32 relative;
    FollowingPose shifted;
    FollowingPose next;
    FollowingPose playerPose;
    BOOL moved;
    s32 i;

    *output = *bubble;
    if (bubble == NULL || camera == NULL || !IsScaleValid(bubble)) {
        return FALSE;
    }
    if (camera->projection > G3DCAM_PROJECTION_ORTHO || !Delta(&camera->eye, &camera->target, &view, 1 << 27) ||
        !Axis(view, &view)) {
        return FALSE;
    }
    // Three pushes of two tiles clear a canopy that hangs out toward the camera. Each is within ShiftDepth's limit
    // and keeps the picture's pixels
    shifted = *bubble;
    moved = FALSE;
    for (i = 0; i < 3; i++) {
        if (!ShiftDepth(&shifted, camera, &view, 2 * FOLLOWING_TILE, &next)) {
            break;
        }
        shifted = next;
        moved = TRUE;
    }
    // Only a player who is really in front of the bubble as it was gets that clearance back, and not one beside the
    // follower
    if (player != NULL && Delta(player, &bubble->position, &relative, 8 * FOLLOWING_TILE) &&
        Dot(&relative, &view) > FOLLOWING_TILE / 2) {
        playerPose.position = *player;
        playerPose.scaleX = 8192;
        playerPose.scaleY = 8192;
        for (i = 0; i < 4; i++) {
            // The cap stops a unit short of ShiftDepth's limit, as FollowingRender_KeepBehind takes 16 more
            if (!FollowingRender_KeepBehind(&shifted, &playerPose, camera, FOLLOWING_RENDER_SORT_BEHIND,
                                            2 * FOLLOWING_TILE - 16, &next)) {
                break;
            }
            shifted = next;
            moved = TRUE;
        }
    }
    *output = shifted;
    return moved;
}

// The depth of a flat oval's rim on the camera's side, which is nearer than its center
static s32 OvalRim(const FollowingPose *shadow, const VecFx32 *direction) {
    s32 half = shadow->scaleX > shadow->scaleY ? shadow->scaleX : shadow->scaleY;
    u32 horizontal;

    if (half < 1) {
        half = 1;
    }
    half *= 8;
    if (half > FOLLOWING_TILE) {
        half = FOLLOWING_TILE;
    }
    horizontal = SquareRoot((u64)direction->x * (u64)direction->x + (u64)direction->z * (u64)direction->z);
    return Divide((s64)half * (s32)horizontal, FX32_ONE);
}

BOOL FollowingRender_ShadowTuck(const FollowingPose *shadow, const VecFx32 *sprite, const FollowingCamera *camera,
                                s32 keep, FollowingPose *output) {
    VecFx32 direction;
    VecFx32 relative;
    FollowingPose cursor;
    FollowingPose next;
    s32 scaledKeep;
    s32 cover;
    s32 cap;
    s32 ahead;
    s32 change;
    BOOL moved;
    s32 step;

    if (shadow == NULL || sprite == NULL || camera == NULL || output == NULL) {
        return FALSE;
    }
    *output = *shadow;
    // The margin scaled by the camera's distance, against ties in the depth buffer
    scaledKeep = FollowingRender_SortMargin(camera, 65536);
    if (keep < scaledKeep) {
        keep = scaledKeep;
    }
    if (keep > FOLLOWING_TILE) {
        keep = FOLLOWING_TILE;
    }
    if (camera->projection > G3DCAM_PROJECTION_ORTHO || !IsScaleValid(shadow)) {
        return FALSE;
    }
    if (!Delta(&camera->eye, &camera->target, &direction, 1 << 27) || !Axis(direction, &direction)) {
        return FALSE;
    }
    // The oval is flat, and its rim on the camera's side is nearer than its center: that rim is what is cleared, or
    // its near half would still win against the sprite
    cover = OvalRim(shadow, &direction) + scaledKeep;
    if (cover > FOLLOWING_TILE) {
        cover = FOLLOWING_TILE;
    }
    if (keep < cover) {
        keep = cover;
    }
    // At the scaled margin this is the gap at rest, and past it a strong tuck
    cap = keep <= scaledKeep ? FOLLOWING_RENDER_BEHIND_CAP : 2 * FOLLOWING_TILE - 64;
    cursor = *shadow;
    moved = FALSE;
    for (step = 0; step < 3; step++) {
        if (!Delta(&cursor.position, sprite, &relative, 8 * FOLLOWING_TILE)) {
            break;
        }
        ahead = Dot(&relative, &direction);
        if (ahead <= -keep) {
            break;
        }
        change = -keep - ahead;
        if (change < -cap) {
            change = -cap;
        }
        if (!ShiftDepth(&cursor, camera, &direction, change - 16, &next)) {
            break;
        }
        cursor = next;
        moved = TRUE;
        if (keep <= scaledKeep) {
            break;
        }
    }
    *output = cursor;
    return moved;
}

BOOL FollowingRender_ShadowMatch(const FollowingPose *shadow, const VecFx32 *feet, const VecFx32 *sprite,
                                 const FollowingCamera *camera, s32 keep, FollowingPose *output) {
    VecFx32 relative;

    *output = *shadow;
    if (camera->projection > G3DCAM_PROJECTION_ORTHO || !IsScaleValid(shadow)) {
        return FALSE;
    }
    if (!Delta(&shadow->position, feet, &relative, 4 * FOLLOWING_TILE)) {
        return FALSE;
    }
    // The sprite's own position keeps the depth offsets the game gave it, such as the north tuck of
    // FOLLOWING_RENDER_NORTH_ART_Y, so a wide sprite pushes the shadow far enough back to clear its quad
    return FollowingRender_ShadowTuck(shadow, sprite, camera, keep, output);
}

BOOL FollowingRender_OvalBehind(const FollowingPose *shadow, const FollowingCamera *camera, FollowingPose *output) {
    VecFx32 direction;
    s32 back;

    if (shadow == NULL || camera == NULL || output == NULL) {
        return FALSE;
    }
    *output = *shadow;
    // An orthographic ShiftDepth can't keep the picture still, and an unknown projection isn't a field camera
    if (camera->projection >= G3DCAM_PROJECTION_ORTHO || !IsScaleValid(shadow)) {
        return FALSE;
    }
    if (!Delta(&camera->eye, &camera->target, &direction, 1 << 27) || !Axis(direction, &direction)) {
        return FALSE;
    }
    // The oval is flat, its rim on the camera's side nearer than its center, and a bob can drop the body onto that
    // center: both are covered, without ever chasing the sprite, since a large margin is what walked the oval up the
    // body
    back = OvalRim(shadow, &direction) + 8 * FX32_ONE;
    if (back < FOLLOWING_RENDER_SHADOW_KEEP) {
        back = FOLLOWING_RENDER_SHADOW_KEEP;
    }
    if (back > FOLLOWING_TILE) {
        back = FOLLOWING_TILE;
    }
    return ShiftDepth(shadow, camera, &direction, -back, output);
}

void FollowingRender_PrivateScene(BillboardActorScene *scene, const BillboardActorScene *live, BillboardActor *actors,
                                  BillboardActorMaterial *materials, u16 actorCount, u16 materialCount) {
    if (scene == NULL) {
        return;
    }
    MI_CpuClear32(scene, sizeof(*scene));
    if (live == NULL) {
        return;
    }
    scene->heapId = live->heapId;
    scene->materials = materials;
    scene->actors = actors;
    scene->setup.materialCount = materialCount;
    scene->setup.actorCount = actorCount;
    scene->setup.scale = live->setup.scale;
    scene->setup.diffuse = live->setup.diffuse;
    scene->setup.ambient = live->setup.ambient;
    scene->setup.specular = live->setup.specular;
    scene->setup.emission = live->setup.emission;
    // The field scene's polygon ID with the copied tail is what the 3DS's edge buffer draws as black lines, so the
    // follower's scene keeps off the live one
    scene->setup.basePolygonId = live->setup.basePolygonId == 1 ? 2 : 1;
}

BOOL FollowingRender_PlaneKeep(const VecFx32 *feet, const FollowingCamera *camera, s32 viewKeep, VecFx32 *output) {
    VecFx32 view;
    s64 vx;
    s64 vz;
    u32 horizontal;
    s32 slide;
    s32 mx;
    s32 mz;
    s64 x;
    s64 z;

    if (feet == NULL || camera == NULL || output == NULL) {
        return FALSE;
    }
    *output = *feet;
    if (camera->projection > G3DCAM_PROJECTION_ORTHO || viewKeep < FOLLOWING_RENDER_TIE_MARGIN ||
        viewKeep > FOLLOWING_TILE) {
        return FALSE;
    }
    if (!Delta(&camera->eye, &camera->target, &view, 1 << 27) || !Axis(view, &view)) {
        return FALSE;
    }
    vx = view.x;
    vz = view.z;
    horizontal = SquareRoot((u64)(vx * vx) + (u64)(vz * vz));
    if (horizontal < 256) {
        return TRUE;
    }
    slide = Divide((s64)viewKeep * FX32_ONE, horizontal);
    if (slide < FOLLOWING_RENDER_SHADOW_KEEP) {
        slide = FOLLOWING_RENDER_SHADOW_KEEP;
    }
    if (slide > FOLLOWING_RENDER_PLANE_CAP) {
        slide = FOLLOWING_RENDER_PLANE_CAP;
    }
    mx = Divide((s64)view.x * slide, horizontal);
    mz = Divide((s64)view.z * slide, horizontal);
    x = (s64)feet->x - mx;
    z = (s64)feet->z - mz;
    if (x < LONG_MIN || x > LONG_MAX || z < LONG_MIN || z > LONG_MAX) {
        return TRUE;
    }
    output->x = (fx32)x;
    output->y = feet->y;
    output->z = (fx32)z;
    return TRUE;
}

BOOL FollowingRender_CoverFeet(const FollowingPose *grass, const FollowingPose *body, const FollowingPose *other,
                               const FollowingCamera *camera, FollowingPose *output) {
    VecFx32 direction;
    VecFx32 relative;
    s32 current;
    s32 lower;
    s32 upper;
    s32 gap;
    s32 margin;
    s32 change;

    *output = *grass;
    if (camera->projection > G3DCAM_PROJECTION_ORTHO || !Delta(&camera->eye, &camera->target, &direction, 1 << 27) ||
        !Axis(direction, &direction) || !Delta(&grass->position, &body->position, &relative, 8 * FOLLOWING_TILE)) {
        return FALSE;
    }
    // The game's billboards of type BILLBOARD_ACTOR_TYPE_FACE_CAMERA turn the actors' and the grass's quads by the
    // inverse of the camera's rotation, so every vertex has its center's depth. The grass stays within its owner's
    // depth interval rather than coming in front of both actors, and its own height still counts toward its depth
    current = Dot(&relative, &direction);
    lower = 4 * FX32_ONE;
    upper = LONG_MAX;
    if (other != NULL && Delta(&other->position, &body->position, &relative, 8 * FOLLOWING_TILE)) {
        gap = Dot(&relative, &direction);
        if (gap > 0) {
            if (gap < 256) {
                return FALSE;
            }
            margin = Divide(gap, 3);
            if (margin > lower) {
                margin = lower;
            }
            lower = margin;
            upper = gap - margin;
        }
    }
    if (current >= lower && current <= upper) {
        return FALSE;
    }
    change = current < lower ? lower - current + 16 : upper - current - 16;
    if (camera->projection == G3DCAM_PROJECTION_ORTHO) {
        change = Divide((s64)change * FX32_ONE, Dot(&direction, &direction));
    }
    return ShiftDepth(grass, camera, &direction, change, output);
}

BOOL FollowingRender_Correct(const VecFx32 *world, const VecFx32 *playerWorld, const FollowingPose *native,
                             const VecFx32 *playerDraw, const FollowingCamera *camera, u32 flags, FollowingPose *output,
                             FollowingDepthResult *result) {
    VecFx32 direction;
    VecFx32 relative;
    VecFx32 base;
    VecFx32 horizontal;
    VecFx32 lost;
    s32 horizontalLength;
    s32 h;
    s32 target;
    BOOL front;
    BOOL unequal;
    BOOL lower;
    BOOL capBack;
    s32 previousDepth;
    s32 current;
    s32 change;

    *output = *native;
    MI_CpuClear32(result, sizeof(*result));
    if (camera->projection > G3DCAM_PROJECTION_ORTHO || !IsScaleValid(native) ||
        !Delta(&camera->eye, &camera->target, &direction, 1 << 27) || !Axis(direction, &direction) ||
        !Delta(world, playerWorld, &base, 4 * FOLLOWING_TILE) ||
        !Delta(&native->position, playerDraw, &relative, 8 * FOLLOWING_TILE)) {
        return FALSE;
    }
    result->axis = direction;
    result->before = result->after = Dot(&relative, &direction);
    // The positions on the ground choose the order, so a bob never changes it. A difference of height keeps the stair
    // rules, tested apart, for large art
    horizontal = direction;
    horizontal.y = 0;
    horizontalLength = SquareRoot32(horizontal.x * horizontal.x + horizontal.z * horizontal.z);
    if (horizontalLength < 256) {
        return FALSE;
    }
    h = Divide((s64)Dot(&base, &horizontal) * FX32_ONE, horizontalLength);
    target = -FOLLOWING_RENDER_TIE_MARGIN;
    front = h > FOLLOWING_TILE / 2;
    unequal = base.y > 2 * FX32_ONE || base.y < -2 * FX32_ONE;
    lower = FALSE;
    capBack = FALSE;
    if (flags & (FOLLOWING_RENDER_FORCE_FRONT | FOLLOWING_RENDER_FORCE_BACK)) {
        front = (flags & FOLLOWING_RENDER_FORCE_FRONT) != 0;
        // Surf's seated rider and mount have quads that overlap, and a gap of depth the size of a tie can round away
        // as the rider bobs and swap the order they are seen in
        target = front ? 4 * FX32_ONE : -4 * FX32_ONE;
    } else if (unequal) {
        // A follower higher than the player and north of them (stairs and ledges down to the south) kept the
        // game's order and then drew in front: its quad is held behind. Large sprites already in front, and large
        // sprites below and behind, keep their earlier stair targets
        if (front) {
            if (!(flags & FOLLOWING_RENDER_LARGE)) {
                return FALSE;
            }
            target = 8 * FX32_ONE;
        } else if ((flags & FOLLOWING_RENDER_LARGE) && base.y <= 0) {
            lower = TRUE;
            target = -4 * FX32_ONE;
        } else {
            target = -FOLLOWING_RENDER_SORT_BEHIND;
            capBack = TRUE;
        }
    } else if (front) {
        target = FOLLOWING_RENDER_TIE_MARGIN;
        if ((flags & FOLLOWING_RENDER_NORTH) && h <= 3 * FOLLOWING_TILE / 2) {
            // The north-facing art is drawn two units down and shares the shadow's ground plane: this gives back the
            // depth that costs
            VEC_Set(&lost, 0, FOLLOWING_RENDER_NORTH_ART_Y * FX32_ONE, 0);
            previousDepth = result->before + Dot(&lost, &direction);
            if (previousDepth > target) {
                target = previousDepth;
            }
        }
    }
    result->policy = lower ? -2 : (front ? 1 : -1);
    current = result->before;
    if (lower ? current >= target : (front ? current >= target : current <= target)) {
        return FALSE;
    }
    change = target - current;
    // A pose already far in front isn't driven through a nearby wall
    if (capBack && change < -FOLLOWING_RENDER_BEHIND_CAP) {
        change = -FOLLOWING_RENDER_BEHIND_CAP;
    }
    // Covers the rounding of fixed-point normalization and of the translation at submission
    change += change < 0 ? -16 : 16;
    // A corrupt pose, or one from a break in the trail, never makes the sprite jump far
    if (!ShiftDepth(native, camera, &direction, change, output)) {
        return FALSE;
    }
    if (!Delta(&output->position, playerDraw, &relative, 8 * FOLLOWING_TILE)) {
        *output = *native;
        return FALSE;
    }
    result->after = Dot(&relative, &direction);
    return TRUE;
}

BOOL FollowingRender_Basis(const FollowingCamera *camera, FollowingCameraBasis *output) {
    VecFx32 view;
    VecFx32 right;
    u32 flat;

    // The axes of FollowingRender_HeadPosition, without normalizing up again, which is the cross product of two unit
    // vectors
    if (camera == NULL || output == NULL || camera->projection > G3DCAM_PROJECTION_ORTHO ||
        !ViewAxis(camera, &output->view)) {
        return FALSE;
    }
    view = output->view;
    flat = SquareRoot32(view.x * view.x + view.z * view.z);
    if (flat < 64) {
        return FALSE;
    }
    VEC_Set(&output->right, Divide((s64)view.z * FX32_ONE, flat), 0, Divide(-(s64)view.x * FX32_ONE, flat));
    right = output->right;
    VEC_Set(&output->up, (s64)view.y * right.z / FX32_ONE, ((s64)view.z * right.x - (s64)view.x * right.z) / FX32_ONE,
            -(s64)view.y * right.x / FX32_ONE);
    // The direction on the ground toward the eye. up leans back, so its part of that direction is negative, the sine
    // of the pitch less than zero
    VEC_Set(&output->toward, Divide((s64)view.x * FX32_ONE, flat), 0, Divide((s64)view.z * FX32_ONE, flat));
    output->upToward = Dot(&output->up, &output->toward);
    output->eye = camera->eye;
    output->flat = flat;
    output->ortho = camera->projection == G3DCAM_PROJECTION_ORTHO;
    return TRUE;
}

// The pose low world units up body's camera plane, pulled pull toward the eye along that point's ray, scaled so its
// pixels stay where they are. q is the pull's fraction of the distance to the eye in 16.16, or less than 0 to compute
static BOOL BandPose(const FollowingCameraBasis *basis, const FollowingPose *body, s32 distance, s32 low, s32 pull,
                     s64 q, s32 bandScaleY, FollowingPose *out) {
    VecFx32 junction;
    VecFx32 toEye;

    VEC_Set(&junction, body->position.x + (s64)basis->up.x * low / FX32_ONE,
            body->position.y + (s64)basis->up.y * low / FX32_ONE, body->position.z + (s64)basis->up.z * low / FX32_ONE);
    out->position = junction;
    out->scaleX = body->scaleX;
    out->scaleY = bandScaleY;
    if (pull <= 0) {
        return TRUE;
    }
    if (basis->ortho) {
        out->position.x += (s64)basis->view.x * pull / FX32_ONE;
        out->position.y += (s64)basis->view.y * pull / FX32_ONE;
        out->position.z += (s64)basis->view.z * pull / FX32_ONE;
        return TRUE;
    }
    // Every junction is in the body's camera plane, so they all have its distance
    if (distance - pull < 4 * FOLLOWING_TILE) {
        return FALSE;
    }
    if (q < 0) {
        q = Divide((s64)pull << 16, distance);
    }
    VEC_Set(&toEye, basis->eye.x - junction.x, basis->eye.y - junction.y, basis->eye.z - junction.z);
    out->position.x += toEye.x * q / 65536;
    out->position.y += toEye.y * q / 65536;
    out->position.z += toEye.z * q / 65536;
    out->scaleX = body->scaleX - (s64)body->scaleX * q / 65536;
    out->scaleY = bandScaleY - (s64)bandScaleY * q / 65536;
    return out->scaleX > 0 && out->scaleY > 0;
}

BOOL FollowingRender_Strips(const FollowingPose *body, const FollowingCamera *camera, s32 half, s32 top, s32 strip,
                            u32 count, const FollowingStripStack *stack, s32 stripScaleY, FollowingPose *output) {
    FollowingCameraBasis basis;
    VecFx32 ray;
    s32 base;
    s32 ahead;
    s32 rise;
    s32 ramp;
    s32 distance;
    s32 eyeToward;
    s32 high;
    s32 low;
    s32 pull;
    s64 q;
    s32 over;
    s32 dh;
    s32 gain;
    u32 i;

    if (body == NULL || camera == NULL || stack == NULL || output == NULL || count == 0 || count > 16) {
        return FALSE;
    }
    base = stack->base;
    ahead = stack->forward;
    rise = stack->rise;
    ramp = stack->ramp;
    if (camera->projection > G3DCAM_PROJECTION_ORTHO || body->scaleX <= 0 || body->scaleX > 32767 || stripScaleY <= 0 ||
        stripScaleY > 32767 || half <= 0 || strip <= 0 || top > 5 * FOLLOWING_TILE || top - (s64)strip * count < 0 ||
        base < -5 * FOLLOWING_TILE || base > 2 * FOLLOWING_TILE || ahead < 0 || ahead > 2 * FOLLOWING_TILE ||
        rise < 0 || rise > 5 * FOLLOWING_TILE || ramp <= 0 || ramp > 4 * FOLLOWING_TILE) {
        return FALSE;
    }
    if (!FollowingRender_Basis(camera, &basis) || !Delta(&camera->eye, &body->position, &ray, 1 << 27)) {
        return FALSE;
    }
    distance = Dot(&ray, &basis.view);
    if (distance < 4 * FOLLOWING_TILE) {
        return FALSE;
    }
    eyeToward = Dot(&ray, &basis.toward);
    for (i = 0; i < count; i++) {
        high = top - (s32)i * strip;
        low = high - strip;
        // A camera-facing quad leans back by its height. Each strip comes forward along its eye ray until its top edge
        // stands, along the ground from the feet, at base plus forward ramped in over ramp of height from rise, and a
        // strip whose top already stands there or nearer stays. The top gains dh units of ground: moving a fraction
        // k of the way to the eye gains k times its distance on the ground to the eye, and pulls the strip
        // k * distance
        pull = 0;
        q = -1;
        over = high - rise;
        if (over < 0) {
            over = 0;
        }
        if (over > ramp) {
            over = ramp;
        }
        dh = (s32)(-(s64)high * basis.upToward / FX32_ONE) + base + Divide((s64)ahead * over, ramp);
        if (dh > 0) {
            if (basis.ortho) {
                pull = Divide((s64)dh * FX32_ONE, basis.flat);
            } else {
                // A top that can't reach that point on the ground before the eye takes the cap, as with a steep
                // camera
                gain = eyeToward - (s32)((s64)high * basis.upToward / FX32_ONE);
                if (gain <= dh) {
                    pull = FOLLOWING_RENDER_SPLIT_CAP + 1;
                } else {
                    q = Divide((s64)dh << 16, gain);
                    pull = q * distance / 65536;
                }
            }
        }
        if (pull > FOLLOWING_RENDER_SPLIT_CAP) {
            pull = FOLLOWING_RENDER_SPLIT_CAP;
            q = -1;
        }
        if (!BandPose(&basis, body, distance, low, pull, q, stripScaleY, &output[i])) {
            return FALSE;
        }
    }
    return TRUE;
}
