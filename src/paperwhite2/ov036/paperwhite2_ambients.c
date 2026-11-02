#include "types.h"
#include "constants/directions.h"
#include "field/field.h"
#include "field/field_actor.h"
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
// event or save entry, and nothing collides with them. A battle or a menu tears the field and its billboards down, and
// a zone change replaces them, once every sprite asked for has loaded (the cache writes a billboard's index where it
// was told to when its sprite loads, so a slot isn't reused before then): either way they're made again for what's
// there then

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
    u8 facing;
    u8 hop;
} Ambient;

typedef struct {
    // The billboard system the billboards were made in: another one means the field was made again
    BillboardActorSys *sys;
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
    }
    sAmbients.count = 0;
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
        GetNPCMdlInfoForOBJCODE(actorSystem, records[i].objCode, &config);
        if (config.uid != records[i].objCode) {
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
