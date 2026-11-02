#include "types.h"
#include "constants/vars.h"
#include "field/field_actor.h"
#include "field/field_internal.h"
#include "gfl/g3d.h"
#include "nitro/fx.h"
#include "nitro/math.h"
#include "paperwhite2/field.h"
#include "paperwhite2/spawns.h"
#include "save/event_work.h"
#include "system/game_data.h"
#include "system/game_system.h"

// Paper White 2: the NPC spawns picked again in the field (docs/paperwhite2/plugins.md, NPC spawns). Once a second,
// while no event runs (a script, a talk, a trainer's sight, a menu), the picks' key for now is compared with the one
// the zone's picks were made for; on a change, Spawns_Repick picks again and changes the NPCs that are out of the
// camera's view, and the rest are tried again each second until they are too

// Frames between checks: a second at the field's 30 frames a second
#define SPAWNS_CHECK_FRAMES 30
// How far past the view's edges an NPC still counts as in view: two tiles, so one never appears or goes at the edge
#define SPAWNS_VIEW_MARGIN FX32_CONST(32)
// The height of an NPC's middle over its feet, which the view is tested at
#define SPAWNS_VIEW_HEIGHT FX32_CONST(16)
// The field camera's aspect ratio (the top screen's)
#define SPAWNS_VIEW_ASPECT FX32_CONST(4.0 / 3.0)

static u8 sFrames;

// Whether a point is in the camera's view, within margin of its edges: its offset from the eye along the camera's
// forward, right and up, against the perspective's half view at that depth. A camera that isn't a perspective one
// (some special maps) counts everything as in view, so nothing changes in sight
static BOOL Spawns_IsInView(G3DCamera *camera, const VecFx32 *point, fx32 margin) {
    VecFx32 eye;
    VecFx32 target;
    VecFx32 up;
    VecFx32 forward;
    VecFx32 right;
    VecFx32 offset;
    fx32 cosine;
    fx32 depth;
    fx32 halfHeight;
    fx32 x;
    fx32 y;

    if (GFL_G3DCameraGetProjectionType(camera) != G3DCAM_PROJECTION_PERSPECTIVE) {
        return TRUE;
    }
    GFL_G3DCameraGetLookatPos(camera, &eye);
    GFL_G3DCameraGetLookatTarget(camera, &target);
    GFL_G3DCameraGetLookatUpVector(camera, &up);
    VEC_Subtract(&target, &eye, &forward);
    VEC_Normalize(&forward, &forward);
    VEC_CrossProduct(&forward, &up, &right);
    VEC_Normalize(&right, &right);
    VEC_CrossProduct(&right, &forward, &up);
    VEC_Subtract(point, &eye, &offset);
    depth = VEC_DotProduct(&offset, &forward);
    if (depth < -margin) {
        return FALSE;
    }
    GFL_G3DCameraPerspectiveGetFOVCos(camera, &cosine);
    // The half height of the view at that depth: depth times the tangent of half the field of view
    halfHeight = FX_Div(FX_Mul(depth, FX_Sqrt(FX32_ONE - FX_Mul(cosine, cosine))), cosine);
    x = VEC_DotProduct(&offset, &right);
    y = VEC_DotProduct(&offset, &up);
    return MATH_ABS(x) <= FX_Mul(halfHeight, SPAWNS_VIEW_ASPECT) + margin && MATH_ABS(y) <= halfHeight + margin;
}

// Spawns_Repick's test: an NPC's actor where it has one, else where its record puts it. A rail NPC without an actor
// counts as in view (its record's position needs the rails), so it changes only while it has one out of view
static BOOL Spawns_FieldInView(void *arg, FieldActor *actor, const ZoneNPC *record) {
    Field *field = arg;
    VecFx32 point;

    if (actor != NULL) {
        CopyActorWPos(actor, &point);
    } else if (record->isRail) {
        return TRUE;
    } else {
        // (a tile's middle, as the actor would stand: 16 units a tile)
        point.x = (record->pos.grid.x * 16 + 8) << FX32_SHIFT;
        point.y = record->pos.grid.y;
        point.z = (record->pos.grid.z * 16 + 8) << FX32_SHIFT;
    }
    point.y += SPAWNS_VIEW_HEIGHT;
    return Spawns_IsInView(field->g3dCamera, &point, SPAWNS_VIEW_MARGIN);
}

void PaperWhite2_SpawnsUpdate(Field *field) {
    u16 *picked;
    u16 key;

    if (++sFrames < SPAWNS_CHECK_FRAMES) {
        return;
    }
    sFrames = 0;
    if (field->actorSystem == NULL || field->g3dCamera == NULL || GSYS_CheckNowEvent(field->gameSystem)) {
        return;
    }
    picked = EventWork_GetWkPtr(GameData_GetEventWork(field->gameData), EVENT_WORK_SPAWN_PICK);
    key = Spawns_PickKey(field->gameData);
    if (key == *picked) {
        return;
    }
    if (Spawns_Repick(field->gameSystem, field->actorSystem, HEAPID_TAIL(field->heapId), Spawns_FieldInView, field)) {
        *picked = key;
    }
}
