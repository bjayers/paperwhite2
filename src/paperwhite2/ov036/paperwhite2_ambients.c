#include "types.h"
#include "constants/directions.h"
#include "field/field.h"
#include "field/field_actor.h"
#include "field/field_effect.h"
#include "field/field_g3d_mapper.h"
#include "field/field_internal.h"
#include "field/player_state.h"
#include "field/zone.h"
#include "gfl/billboard_actor.h"
#include "gfl/heap.h"
#include "gfl/random.h"
#include "nitro/fx.h"
#include "nitro/mi.h"
#include "paperwhite2/ambients.h"
#include "paperwhite2/spawns.h"
#include "system/game_data.h"

// Paper White 2: the ambients, sprites drawn without an actor (docs/paperwhite2/design/overworld-editor.md, Ambients;
// docs/paperwhite2/plugins.md, Ambients). The zone's ambients whose conditions hold (Spawns_GetAmbients) each get a
// billboard of their object code's sprite from the actor system's sprite cache, as reflections do
// (FldBillboardActor_AddActorPosOrReserve), placed on its path and given its animation every frame. They take no actor,
// event or save entry, and nothing collides with them. A shadow, where it has one, is the actors' shadow (the shadow
// effect's material, in the effects' billboard system), under its feet or on the ground below it. A battle or a menu
// tears the field and its billboards down, and a zone change replaces them, once every sprite asked for has loaded (the
// cache writes a billboard's index where it was told to when its sprite loads, so a slot isn't reused before then):
// either way they're made again for what's there then

// The field's frames a second
#define AMBIENT_FRAMES_A_SECOND 30
// A billboard animation: its status times 4 plus the camera-relative direction (field_actor.h's DRAW_STATUS_*)
#define AMBIENT_ANIM_STAND 0
#define AMBIENT_ANIM_WALK (2 * 4)
// A perch's hop: its frames and its height, in units
#define AMBIENT_HOP_FRAMES 8
#define AMBIENT_HOP_HEIGHT FX32_CONST(3)
// A perch turns and hops at about every speed seconds, 4 when it gives none
#define AMBIENT_PERCH_SECONDS 4
// How long a zone change waits for sprites still loading, at most, in frames (a load that never ends doesn't hold it)
#define AMBIENT_LOAD_WAIT_FRAMES (5 * AMBIENT_FRAMES_A_SECOND)
// A shadow's lift over what it lies on, as the actors' (FldeffShadow_Draw), and its alpha
#define AMBIENT_SHADOW_LIFT FX32_ONE
#define AMBIENT_SHADOW_ALPHA 19
// The polygon ID shadows draw with (FldeffShadow_Init)
#define AMBIENT_SHADOW_POLYGON_ID 2
// A hover's bob, in units either way
#define AMBIENT_HOVER_BOB FX32_CONST(2)

typedef struct {
    SpawnAmbient record;
    // The material's flags and the billboard's index, as FldBillboardActor_AddActorPosOrReserve gives them; the index
    // is BILLBOARD_ACTOR_NONE until the sprite has loaded
    u16 billboard[2];
    // Where it is on its path, as a 16-bit angle
    u32 angle;
    u16 nextChange;
    // The animation it was last given, which is set again only when it changes (setting it starts it over)
    u16 anim;
    // Its shadow's billboard in the effects' system, or BILLBOARD_ACTOR_NONE
    u16 shadow;
    u8 facing;
    u8 hop;
} Ambient;

typedef struct {
    // The billboard system the billboards were made in: another one means the field was made again
    BillboardActorSys *sys;
    // The shadows': the effects' billboard system and the shadow material, or NULL where the field has no shadows
    BillboardActorSys *shadowSys;
    u32 shadowMaterial;
    u16 zone;
    u8 loaded;
    u8 count;
    u16 waited;
    Ambient list[SPAWNS_AMBIENT_MAX];
} AmbientState;

static AmbientState sAmbients;

static BillboardActorSys *Ambients_GetSys(MMSys *actorSystem) {
    return FieldBillboardActor_GetBillboardActorSys(FldActSys_GetFieldBillboardActor(actorSystem));
}

// Whether a sprite asked for is still loading
static BOOL Ambients_IsLoading(void) {
    u32 i;

    for (i = 0; i < sAmbients.count; i++) {
        if (sAmbients.list[i].billboard[1] == BILLBOARD_ACTOR_NONE && (sAmbients.list[i].billboard[0] & 2)) {
            return TRUE;
        }
    }
    return FALSE;
}

// The billboards made, deleted
static void Ambients_Clear(MMSys *actorSystem) {
    u32 i;

    for (i = 0; i < sAmbients.count; i++) {
        FldBillboardActor_DeleteActorPos(actorSystem, sAmbients.list[i].billboard);
        if (sAmbients.list[i].shadow != BILLBOARD_ACTOR_NONE) {
            BillboardActorSys_DeleteActors(sAmbients.shadowSys, sAmbients.list[i].shadow, 1);
        }
    }
    sAmbients.count = 0;
}

// An ambient's shadow made, as an actor's is (FldeffShadow_Init); none where the system has no handle left
static void Ambients_AddShadow(Ambient *ambient) {
    BillboardActorRequest request;
    u8 polygonId = AMBIENT_SHADOW_POLYGON_ID;

    request.texMat = 0;
    request.scaleX = FX32_ONE;
    request.scaleY = FX32_ONE;
    request.alpha = AMBIENT_SHADOW_ALPHA;
    // (shown once the ambient is placed)
    request.visible = FALSE;
    request.lights = 1;
    request.pos = ambient->record.at;
    request.callback = NULL;
    request.callbackData = NULL;
    ambient->shadow =
        BillboardActorSys_ExecActorRequests(sAmbients.shadowSys, sAmbients.shadowMaterial, &request, 1, 3);
    if (ambient->shadow != BILLBOARD_ACTOR_NONE) {
        BillboardActorScene_SetActorPolygonId(BillboardActorSys_GetScene(sAmbients.shadowSys), ambient->shadow,
                                              &polygonId);
    }
}

// Where an ambient's shadow lies: under its feet (its place, without a hop), or on the highest ground below it (none
// where there is none)
static BOOL Ambients_ShadowAt(Field *field, const Ambient *ambient, const VecFx32 *pos, VecFx32 *out) {
    FieldG3DMapperTerrain terrain;
    BOOL found = FALSE;
    fx32 best = 0;
    u32 i;

    *out = *pos;
    if (ambient->record.shadow == AMBIENT_SHADOW_FEET) {
        out->y = ambient->record.at.y + AMBIENT_SHADOW_LIFT;
        return TRUE;
    }
    if (!FieldG3DMapper_GetTerrainAll(field->g3DMapper, pos, &terrain)) {
        return FALSE;
    }
    for (i = 0; i < terrain.layerCount; i++) {
        fx32 height = terrain.layers[i].height;

        if (height <= pos->y + AMBIENT_SHADOW_LIFT && (!found || height > best)) {
            best = height;
            found = TRUE;
        }
    }
    out->y = best + AMBIENT_SHADOW_LIFT;
    return found;
}

// The zone's ambients asked for: each a billboard of its sprite at its place, made now or once the sprite has loaded
static void Ambients_Load(Field *field) {
    MMSys *actorSystem = field->actorSystem;
    SpawnAmbient records[SPAWNS_AMBIENT_MAX];
    u32 count = Spawns_GetAmbients(field->gameSystem, HEAPID_TAIL(field->heapId), records, SPAWNS_AMBIENT_MAX);
    u32 i;

    for (i = 0; i < count; i++) {
        Ambient *ambient = &sAmbients.list[sAmbients.count];
        FieldActorConfig config;

        MI_CpuFill8(&config, 0, sizeof(config));
        GetNPCMdlInfoForOBJCODE(actorSystem, records[i].objCodes[0], &config);
        if (config.uid != records[i].objCodes[0]) {
            continue; // (no such object code)
        }
        MI_CpuFill8(ambient, 0, sizeof(Ambient));
        ambient->record = records[i];
        ambient->facing = records[i].facing;
        ambient->angle = DEG_TO_IDX(records[i].phase % 360);
        ambient->nextChange = AMBIENT_FRAMES_A_SECOND;
        ambient->anim = 0xffff;
        ambient->billboard[1] = BILLBOARD_ACTOR_NONE;
        FldBillboardActor_AddActorPosOrReserve(actorSystem, &config, ambient->billboard, &ambient->record.at, NULL,
                                               NULL, func_ov012_02166fc0(actorSystem));
        ambient->shadow = BILLBOARD_ACTOR_NONE;
        if (records[i].shadow != AMBIENT_SHADOW_NONE && sAmbients.shadowSys != NULL) {
            Ambients_AddShadow(ambient);
        }
        sAmbients.count++;
    }
}

// The direction a velocity on the ground goes, as a DIR_*
static u8 Ambients_DirOf(fx32 dx, fx32 dz, u8 otherwise) {
    if (dx == 0 && dz == 0) {
        return otherwise;
    }
    if ((dx < 0 ? -dx : dx) > (dz < 0 ? -dz : dz)) {
        return dx > 0 ? DIR_RIGHT : DIR_LEFT;
    }
    return dz > 0 ? DIR_DOWN : DIR_UP;
}

// An ambient's place on its path now, and its facing and whether it moves (walks)
static BOOL Ambients_Move(Ambient *ambient, VecFx32 *pos) {
    const SpawnAmbient *record = &ambient->record;
    fx32 sx = record->sizeX << FX32_SHIFT;
    fx32 sz = record->sizeZ << FX32_SHIFT;
    u32 step = record->speed * 0x10000 / (360 * AMBIENT_FRAMES_A_SECOND);
    fx32 s;
    fx32 c;
    fx32 dx = 0;
    fx32 dz = 0;

    *pos = record->at;
    if (record->path == AMBIENT_PATH_PERCH) {
        // Now and then it turns or hops
        if (ambient->nextChange == 0) {
            u32 seconds = record->speed != 0 ? record->speed : AMBIENT_PERCH_SECONDS;

            ambient->nextChange =
                (seconds * AMBIENT_FRAMES_A_SECOND / 2) + GFL_RandomLC(seconds * AMBIENT_FRAMES_A_SECOND);
            if ((record->flags & AMBIENT_FLAG_HOPS) && GFL_RandomLC(2) == 0) {
                ambient->hop = AMBIENT_HOP_FRAMES;
            } else if (record->flags & AMBIENT_FLAG_TURNS) {
                ambient->facing = GFL_RandomLC(4);
            }
        } else {
            ambient->nextChange--;
        }
        if (ambient->hop != 0) {
            u32 t = AMBIENT_HOP_FRAMES - ambient->hop;

            // (a parabola: up and down over the hop's frames)
            pos->y += AMBIENT_HOP_HEIGHT * 4 * t * (AMBIENT_HOP_FRAMES - t) / (AMBIENT_HOP_FRAMES * AMBIENT_HOP_FRAMES);
            ambient->hop--;
            return TRUE;
        }
        return FALSE;
    }
    ambient->angle = (ambient->angle + step) & 0xffff;
    s = FX_SinIdx(ambient->angle);
    c = FX_CosIdx(ambient->angle);
    switch (record->path) {
    case AMBIENT_PATH_HOVER:
        pos->y += FX_Mul(AMBIENT_HOVER_BOB, s);
        return TRUE;
    case AMBIENT_PATH_ELLIPSE:
        pos->x += FX_Mul(sx, c);
        pos->z += FX_Mul(sz, s);
        dx = -FX_Mul(sx, s);
        dz = FX_Mul(sz, c);
        break;
    case AMBIENT_PATH_LINE:
        // From its place to the line's end and back: (1 - cos) / 2 of the way
        pos->x += FX_Mul(sx, (FX32_ONE - c) / 2);
        pos->z += FX_Mul(sz, (FX32_ONE - c) / 2);
        dx = FX_Mul(sx, s);
        dz = FX_Mul(sz, s);
        break;
    case AMBIENT_PATH_EIGHT:
        // x by sin, z by sin times cos (half of sin of twice the angle)
        pos->x += FX_Mul(sx, s);
        pos->z += FX_Mul(sz, FX_Mul(s, c));
        dx = FX_Mul(sx, c);
        dz = FX_Mul(sz, FX_Mul(c, c) - FX_Mul(s, s));
        break;
    }
    ambient->facing = Ambients_DirOf(dx, dz, ambient->facing);
    return TRUE;
}

void PaperWhite2_AmbientsUpdate(Field *field) {
    MMSys *actorSystem = field->actorSystem;
    BillboardActorSys *sys;
    u16 zone;
    u16 angle;
    u32 i;

    if (actorSystem == NULL) {
        return;
    }
    sys = Ambients_GetSys(actorSystem);
    zone = PlayerState_GetZoneID(GameData_GetPlayerState(field->gameData));
    if (sAmbients.sys != sys) {
        // The field was made again (after a battle or a menu): its billboards went with the old one
        MI_CpuFill8(&sAmbients, 0, sizeof(sAmbients));
        sAmbients.sys = sys;
        if (!FldeffShadow_GetMaterial(field->fieldEffects, &sAmbients.shadowSys, &sAmbients.shadowMaterial)) {
            sAmbients.shadowSys = NULL;
        }
    }
    if ((!sAmbients.loaded || sAmbients.zone != zone) &&
        (!Ambients_IsLoading() || ++sAmbients.waited >= AMBIENT_LOAD_WAIT_FRAMES)) {
        sAmbients.waited = 0;
        Ambients_Clear(actorSystem);
        sAmbients.zone = zone;
        sAmbients.loaded = TRUE;
        Ambients_Load(field);
    }
    angle = FldActSys_GetCameraAngle(actorSystem);
    for (i = 0; i < sAmbients.count; i++) {
        Ambient *ambient = &sAmbients.list[i];
        VecFx32 pos;
        BOOL moving;
        u16 anim;

        if (ambient->billboard[1] == BILLBOARD_ACTOR_NONE) {
            continue; // (still loading)
        }
        moving = Ambients_Move(ambient, &pos);
        if (ambient->shadow != BILLBOARD_ACTOR_NONE) {
            BillboardActorScene *shadowScene = BillboardActorSys_GetScene(sAmbients.shadowSys);
            VecFx32 at;
            BOOL shown = Ambients_ShadowAt(field, ambient, &pos, &at);

            // (SetActorHidden takes whether it shows, as FldeffShadow_Draw passes it)
            BillboardActorScene_SetActorHidden(shadowScene, ambient->shadow, &shown);
            BillboardActorScene_SetActorPos(shadowScene, ambient->shadow, &at);
        }
        pos.y += Field_GetActorYOffset(field);
        BillboardActorScene_SetActorPos(BillboardActorSys_GetScene(sys), ambient->billboard[1], &pos);
        anim = (moving ? AMBIENT_ANIM_WALK : AMBIENT_ANIM_STAND) + RotateDirByAngle(ambient->facing, angle);
        if (anim != ambient->anim) {
            ambient->anim = anim;
            BillboardActorSys_SetActorAnim(sys, ambient->billboard[1], anim);
            BillboardActorSys_SetActorAnimating(sys, ambient->billboard[1], moving);
        }
    }
}
