#include "types.h"
#include "constants/directions.h"
#include "field/field.h"
#include "field/field_actor.h"
#include "field/field_actor_drawdata.h"
#include "field/field_effect.h"
#include "field/field_g3d_mapper.h"
#include "field/field_internal.h"
#include "field/field_player.h"
#include "field/player_state.h"
#include "field/zone.h"
#include "gfl/billboard_actor.h"
#include "gfl/heap.h"
#include "gfl/key.h"
#include "gfl/random.h"
#include "gfl/sound.h"
#include "nitro/fx.h"
#include "nitro/mi.h"
#include "paperwhite2/ambients.h"
#include "paperwhite2/spawns.h"
#include "system/game_data.h"
#include "system/game_event.h"
#include "system/game_system.h"

// Paper White 2: the ambients, sprites drawn without an actor (docs/paperwhite2/design/overworld-editor.md, Ambients;
// docs/paperwhite2/plugins.md, Ambients). The zone's ambients whose conditions hold (Spawns_GetAmbients) each get a
// billboard of their object code's sprite from the actor system's sprite cache, as reflections do
// (FldBillboardActor_AddActorPosOrReserve), placed on its path and given its animation every frame. They take no actor,
// event or save entry, and nothing collides with them. A shadow, where it has one, is the actors' shadow (the shadow
// effect's material, in the effects' billboard system), under its feet or on the ground below it. A battle or a menu
// tears the field and its billboards down, and a zone change replaces them: either way they're made again for what's
// there then. A sprite that isn't loaded is loaded on demand, as an NPC's is, where the cache has an entry free (where
// it hasn't, the ambient doesn't show); the zone change cancels a load still waiting and unloads what no one else uses.
//
// They're streamed: the zone's ambients whose conditions hold (up to SPAWNS_AMBIENT_LIST_MAX) are its candidates, and
// at most SPAWNS_AMBIENT_MAX of them are made at once, those whose paths' areas come nearest the player. One joins once
// its area comes within the join distance, where its place on its path is out of view (one that loops joins where it
// would be had it run from the zone's entry), and leaves, its billboards and sprites given back, once its area is past
// the leave distance; never while it reacts or a fly-over passes. One that fled for good stays gone until the zone is
// entered again

// The field's frames a second
#define AMBIENT_FRAMES_A_SECOND 30
// A person's billboard animation: its status times 4 plus the camera-relative direction (field_actor.h's
// DRAW_STATUS_*). A sprite whose animation set has fewer (a walking Pokémon's, 4) has one animation a direction, always
// playing, as RailActorAnim_DrawWalking gives them
#define AMBIENT_ANIM_STAND 0
#define AMBIENT_ANIM_WALK (2 * 4)
#define AMBIENT_ANIM_PERSON (AMBIENT_ANIM_WALK + 4)
// A perch's hop: its frames and its height, in units
#define AMBIENT_HOP_FRAMES 8
#define AMBIENT_HOP_HEIGHT FX32_CONST(3)
// A perch turns and hops at about every speed seconds, 4 when it gives none
#define AMBIENT_PERCH_SECONDS 4
// A shadow's lift over what it lies on, as the actors' (FldeffShadow_Draw), and its alpha
#define AMBIENT_SHADOW_LIFT FX32_ONE
#define AMBIENT_SHADOW_ALPHA 19
// The polygon ID shadows draw with (FldeffShadow_Init)
#define AMBIENT_SHADOW_POLYGON_ID 2
// A hover's bob, in units either way
#define AMBIENT_HOVER_BOB FX32_CONST(2)
// A reaction: the longest a flight or a run lasts before it's gone, how far from the player it's gone at once (tiles),
// a hide's frames and depth; how far the player must be from its place for its return to count down, past its
// startle radius, and how far its place must be (the screen's tiles round the player, and one more) for it to come
// back unseen
#define AMBIENT_REACT_FRAMES (4 * AMBIENT_FRAMES_A_SECOND)
#define AMBIENT_REACT_FAR 12
#define AMBIENT_HIDE_FRAMES 12
#define AMBIENT_HIDE_DEPTH FX32_CONST(20)
#define AMBIENT_RETURN_AWAY 2
#define AMBIENT_RETURN_OFFSCREEN_X 9
#define AMBIENT_RETURN_OFFSCREEN_Z 7
#define AMBIENT_CRY_PAN 64
// The traveling paths': a wander's step (a tile) and its frames, a peek's or a surface's rise and sink and how deep it
// goes, a surface's bob, and how far ahead of the player and behind it a fly-over starts and ends
#define AMBIENT_TILE_UNITS FX32_CONST(16)
#define AMBIENT_WANDER_FRAMES 16
#define AMBIENT_PEEK_FRAMES 8
#define AMBIENT_PEEK_DEPTH FX32_CONST(24)
#define AMBIENT_SURFACE_BOB FX32_CONST(1)
#define AMBIENT_FLYOVER_REACH FX32_CONST(16 * 14)
// A world position's tile
#define AMBIENT_TILE(v) ((v) >> (FX32_SHIFT + 4))
// The streaming: how often it's checked (frames), how near the player (tiles east and west, north and south) a
// candidate's path area comes for it to join, and how far it goes for it to leave
#define AMBIENT_STREAM_FRAMES 8
#define AMBIENT_JOIN_X 14
#define AMBIENT_JOIN_Z 11
#define AMBIENT_LEAVE_X 16
#define AMBIENT_LEAVE_Z 13

// A candidate's state: not made, made (in the list), gone for good (it fled and doesn't return), or not to be made (no
// such object code)
enum {
    AMBIENT_CANDIDATE_IDLE,
    AMBIENT_CANDIDATE_ACTIVE,
    AMBIENT_CANDIDATE_FLED,
    AMBIENT_CANDIDATE_SKIP,
};

// Where an ambient is in its reaction: at its place on its path, reacting, or gone until it returns
enum {
    AMBIENT_AT_HOME,
    AMBIENT_REACTING,
    AMBIENT_GONE,
};

typedef struct {
    SpawnAmbient record;
    // Its candidate's index (sAmbients.candidates)
    u8 candidate;
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
    // Whether its sprite has one animation a direction, always playing (a walking Pokémon's)
    u8 byDirection;
    // Its reaction (AMBIENT_AT_HOME and the rest), and whether its reaction sprite has one animation a direction
    u8 reaction;
    u8 reactByDirection;
    // Its reaction sprite's billboard, as billboard, or BILLBOARD_ACTOR_NONE in both without one
    u16 react[2];
    // The animation its reaction sprite was last given
    u16 reactAnim;
    // A reaction's frames left, or the frames before it returns (counted while the player is away)
    u32 reactTimer;
    // Where it is in its reaction, and its move a frame
    VecFx32 reactPos;
    VecFx32 reactStep;
    // A traveling path's: where it is, where its step or leg started and goes, its stage's frames left (and all of
    // them), its stage, its waypoint and the way it goes through them, whether it's out of sight (a peek down, a
    // fly-over between passes), whether it has started, and its height over the ground (a wander)
    VecFx32 pathPos;
    VecFx32 pathFrom;
    VecFx32 pathTo;
    u16 pathTimer;
    u16 pathFrames;
    u8 pathStage;
    u8 pathIndex;
    s8 pathDir;
    u8 pathHidden;
    u8 pathStarted;
    fx32 pathOver;
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
    Ambient list[SPAWNS_AMBIENT_MAX];
    // The zone's ambients whose conditions held at its entry, each one's AMBIENT_CANDIDATE_* and its path's area (world
    // units, x and z, least and greatest), the frames since, and those to the next streaming check
    SpawnAmbient candidates[SPAWNS_AMBIENT_LIST_MAX];
    u8 candidateState[SPAWNS_AMBIENT_LIST_MAX];
    fx32 area[SPAWNS_AMBIENT_LIST_MAX][4];
    u8 candidateCount;
    u8 streamTimer;
    u32 frames;
} AmbientState;

static AmbientState sAmbients;

static BillboardActorSys *Ambients_GetSys(MMSys *actorSystem) {
    return FieldBillboardActor_GetBillboardActorSys(FldActSys_GetFieldBillboardActor(actorSystem));
}

// The billboards made, deleted
static void Ambients_Clear(MMSys *actorSystem) {
    u32 i;
    u32 count = sAmbients.count;

    for (i = 0; i < count; i++) {
        if (sAmbients.list[i].billboard[1] == BILLBOARD_ACTOR_NONE) {
            FldBillboardActor_CancelPendingPos(actorSystem, sAmbients.list[i].billboard);
        }
        FldBillboardActor_DeleteActorPos(actorSystem, sAmbients.list[i].billboard);
        if (sAmbients.list[i].record.reactSprite != 0) {
            if (sAmbients.list[i].react[1] == BILLBOARD_ACTOR_NONE) {
                FldBillboardActor_CancelPendingPos(actorSystem, sAmbients.list[i].react);
            }
            FldBillboardActor_DeleteActorPos(actorSystem, sAmbients.list[i].react);
        }
        if (sAmbients.list[i].shadow != BILLBOARD_ACTOR_NONE) {
            BillboardActorSys_DeleteActors(sAmbients.shadowSys, sAmbients.list[i].shadow, 1);
        }
    }
    sAmbients.count = 0;
    sAmbients.candidateCount = 0;
    // (once none is counted, so that none holds them)
    for (i = 0; i < count; i++) {
        FldBillboardActor_ReleaseObjCode(actorSystem, sAmbients.list[i].record.objCodes[0]);
        if (sAmbients.list[i].record.reactSprite != 0) {
            FldBillboardActor_ReleaseObjCode(actorSystem, sAmbients.list[i].record.reactSprite);
        }
    }
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
    // (under its feet only at its place: once it reacts, on the ground)
    if (ambient->record.shadow == AMBIENT_SHADOW_FEET && ambient->reaction == AMBIENT_AT_HOME) {
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

// The angle a looping path (a hover, an ellipse, a line, an eight) has reached after frames, from its start
static u32 Ambients_LoopAngle(const SpawnAmbient *record, u32 frames) {
    return (DEG_TO_IDX(record->phase % 360) + frames * (record->speed * 0x10000 / (360 * AMBIENT_FRAMES_A_SECOND))) &
           0xffff;
}

// Where a candidate would be on its path if it joined now: a looping path's point (as Ambients_Move puts it), else its
// place
static void Ambients_JoinPos(const SpawnAmbient *record, VecFx32 *pos) {
    u16 angle = (u16)Ambients_LoopAngle(record, sAmbients.frames);
    fx32 sx = record->sizeX << FX32_SHIFT;
    fx32 sz = record->sizeZ << FX32_SHIFT;
    fx32 s = FX_SinIdx(angle);
    fx32 c = FX_CosIdx(angle);

    *pos = record->at;
    switch (record->path) {
    case AMBIENT_PATH_ELLIPSE:
        pos->x += FX_Mul(sx, c);
        pos->z += FX_Mul(sz, s);
        break;
    case AMBIENT_PATH_LINE:
        pos->x += FX_Mul(sx, (FX32_ONE - c) / 2);
        pos->z += FX_Mul(sz, (FX32_ONE - c) / 2);
        break;
    case AMBIENT_PATH_EIGHT:
        pos->x += FX_Mul(sx, s);
        pos->z += FX_Mul(sz, FX_Mul(s, c));
        break;
    }
}

// The area a path covers round its place, x and z, least and greatest, in world units: an ellipse's, an eight's, a
// wander's and a surface's sizes either way, a line's to its end, a waypoints' points; a fly-over's range, within which
// the player's presence starts its passes
static void Ambients_Area(const SpawnAmbient *record, fx32 *area) {
    fx32 sx = record->sizeX << FX32_SHIFT;
    fx32 sz = record->sizeZ << FX32_SHIFT;
    u32 i;

    area[0] = area[1] = record->at.x;
    area[2] = area[3] = record->at.z;
    switch (record->path) {
    case AMBIENT_PATH_ELLIPSE:
    case AMBIENT_PATH_EIGHT:
    case AMBIENT_PATH_WANDER:
    case AMBIENT_PATH_SURFACE:
    case AMBIENT_PATH_FLYOVER:
        area[0] -= sx;
        area[1] += sx;
        area[2] -= sz;
        area[3] += sz;
        if (record->path == AMBIENT_PATH_FLYOVER) {
            // (its range is its width, as a radius)
            area[2] = record->at.z - sx;
            area[3] = record->at.z + sx;
        }
        break;
    case AMBIENT_PATH_LINE:
        area[1] += sx;
        area[3] += sz;
        break;
    case AMBIENT_PATH_WAYPOINTS:
        for (i = 0; i < record->pointCount; i++) {
            fx32 x = record->at.x + (record->points[i][0] << FX32_SHIFT);
            fx32 z = record->at.z + (record->points[i][2] << FX32_SHIFT);

            area[0] = x < area[0] ? x : area[0];
            area[1] = x > area[1] ? x : area[1];
            area[2] = z < area[2] ? z : area[2];
            area[3] = z > area[3] ? z : area[3];
        }
        break;
    }
}

// How far an area is from a tile, in tiles east or west and north or south (0 where the tile is within it)
static void Ambients_AreaDistance(const fx32 *area, s32 x, s32 z, s32 *dx, s32 *dz) {
    s32 least = AMBIENT_TILE(area[0]);
    s32 greatest = AMBIENT_TILE(area[1]);

    *dx = x < least ? least - x : x > greatest ? x - greatest : 0;
    least = AMBIENT_TILE(area[2]);
    greatest = AMBIENT_TILE(area[3]);
    *dz = z < least ? least - z : z > greatest ? z - greatest : 0;
}

// A candidate made: a billboard of its sprite at its place, made now or once the sprite has loaded, as far along its
// path as a loop has come since the zone's entry; FALSE where it can't be (no such object code, or the sprite cache
// full)
static BOOL Ambients_Join(Field *field, u32 candidate) {
    MMSys *actorSystem = field->actorSystem;
    const SpawnAmbient *record = &sAmbients.candidates[candidate];
    Ambient *ambient = &sAmbients.list[sAmbients.count];
    FieldActorConfig config;

    MI_CpuFill8(&config, 0, sizeof(config));
    GetNPCMdlInfoForOBJCODE(actorSystem, record->objCodes[0], &config);
    if (config.uid != record->objCodes[0]) {
        sAmbients.candidateState[candidate] = AMBIENT_CANDIDATE_SKIP;
        return FALSE;
    }
    if (!FldBillboardActor_CanLoadObjCode(actorSystem, config.uid)) {
        return FALSE; // (the sprite cache is full: it doesn't show, and is tried again)
    }
    MI_CpuFill8(ambient, 0, sizeof(Ambient));
    ambient->record = *record;
    ambient->candidate = (u8)candidate;
    ambient->facing = record->facing;
    ambient->angle = Ambients_LoopAngle(record, sAmbients.frames);
    ambient->nextChange = AMBIENT_FRAMES_A_SECOND;
    ambient->anim = 0xffff;
    ambient->byDirection = FIELD_BILLBOARD_ANIM_SETS[config.spriteControllerType].count < AMBIENT_ANIM_PERSON;
    ambient->billboard[1] = BILLBOARD_ACTOR_NONE;
    FldBillboardActor_AddActorPosOrReserve(actorSystem, &config, ambient->billboard, &ambient->record.at, NULL, NULL,
                                           func_ov012_02166fc0(actorSystem));
    // Its reaction sprite too, hidden until it reacts (where it has one and it can load)
    ambient->react[1] = BILLBOARD_ACTOR_NONE;
    if (record->reactSprite != 0) {
        MI_CpuFill8(&config, 0, sizeof(config));
        GetNPCMdlInfoForOBJCODE(actorSystem, record->reactSprite, &config);
        if (config.uid == record->reactSprite && FldBillboardActor_CanLoadObjCode(actorSystem, config.uid)) {
            ambient->reactAnim = 0xffff;
            ambient->reactByDirection =
                FIELD_BILLBOARD_ANIM_SETS[config.spriteControllerType].count < AMBIENT_ANIM_PERSON;
            FldBillboardActor_AddActorPosOrReserve(actorSystem, &config, ambient->react, &ambient->record.at, NULL,
                                                   NULL, func_ov012_02166fc0(actorSystem));
        } else {
            ambient->record.reactSprite = 0;
        }
    }
    ambient->shadow = BILLBOARD_ACTOR_NONE;
    if (record->shadow != AMBIENT_SHADOW_NONE && sAmbients.shadowSys != NULL) {
        Ambients_AddShadow(ambient);
    }
    sAmbients.candidateState[candidate] = AMBIENT_CANDIDATE_ACTIVE;
    sAmbients.count++;
    return TRUE;
}

// A made one taken away, its billboards deleted and its sprites given back, the last of the list moved to its place;
// one that fled for good stays gone
static void Ambients_Leave(MMSys *actorSystem, u32 index) {
    Ambient *ambient = &sAmbients.list[index];
    u16 objCode = ambient->record.objCodes[0];
    u16 reactSprite = ambient->record.reactSprite;

    if (ambient->billboard[1] == BILLBOARD_ACTOR_NONE) {
        FldBillboardActor_CancelPendingPos(actorSystem, ambient->billboard);
    }
    FldBillboardActor_DeleteActorPos(actorSystem, ambient->billboard);
    if (reactSprite != 0) {
        if (ambient->react[1] == BILLBOARD_ACTOR_NONE) {
            FldBillboardActor_CancelPendingPos(actorSystem, ambient->react);
        }
        FldBillboardActor_DeleteActorPos(actorSystem, ambient->react);
    }
    if (ambient->shadow != BILLBOARD_ACTOR_NONE) {
        BillboardActorSys_DeleteActors(sAmbients.shadowSys, ambient->shadow, 1);
    }
    sAmbients.candidateState[ambient->candidate] =
        ambient->reaction == AMBIENT_GONE && ambient->record.returnMin == AMBIENT_RETURN_NEVER ? AMBIENT_CANDIDATE_FLED
                                                                                               : AMBIENT_CANDIDATE_IDLE;
    sAmbients.count--;
    if (index != sAmbients.count) {
        *ambient = sAmbients.list[sAmbients.count];
    }
    // (once it isn't counted, so that it doesn't hold them)
    FldBillboardActor_ReleaseObjCode(actorSystem, objCode);
    if (reactSprite != 0) {
        FldBillboardActor_ReleaseObjCode(actorSystem, reactSprite);
    }
}

// The streaming: the made ones whose areas are past the leave distance leave, then the nearest candidates within the
// join distance join while there's room, where their places on their paths are out of view (at the zone's entry, in
// view too: the screen is still dark)
static void Ambients_Stream(Field *field, BOOL entering) {
    VecFx32 at;
    s32 px;
    s32 pz;
    u32 i;

    if (field->player == NULL) {
        return;
    }
    FieldPlayer_GetWPos(field->player, &at);
    px = AMBIENT_TILE(at.x);
    pz = AMBIENT_TILE(at.z);
    for (i = sAmbients.count; i-- != 0;) {
        Ambient *ambient = &sAmbients.list[i];
        s32 dx;
        s32 dz;

        Ambients_AreaDistance(sAmbients.area[ambient->candidate], px, pz, &dx, &dz);
        if (ambient->reaction == AMBIENT_REACTING ||
            (ambient->record.path == AMBIENT_PATH_FLYOVER && !ambient->pathHidden) ||
            (dx <= AMBIENT_LEAVE_X && dz <= AMBIENT_LEAVE_Z)) {
            continue;
        }
        Ambients_Leave(field->actorSystem, i);
    }
    while (sAmbients.count < SPAWNS_AMBIENT_MAX) {
        u32 best = SPAWNS_AMBIENT_LIST_MAX;
        s32 bestDistance = 0;

        for (i = 0; i < sAmbients.candidateCount; i++) {
            s32 dx;
            s32 dz;
            VecFx32 pos;

            if (sAmbients.candidateState[i] != AMBIENT_CANDIDATE_IDLE) {
                continue;
            }
            Ambients_AreaDistance(sAmbients.area[i], px, pz, &dx, &dz);
            if (dx > AMBIENT_JOIN_X || dz > AMBIENT_JOIN_Z ||
                (best != SPAWNS_AMBIENT_LIST_MAX && dx + dz >= bestDistance)) {
                continue;
            }
            Ambients_JoinPos(&sAmbients.candidates[i], &pos);
            dx = AMBIENT_TILE(pos.x) - px;
            dz = AMBIENT_TILE(pos.z) - pz;
            if (!entering && sAmbients.candidates[i].path != AMBIENT_PATH_FLYOVER &&
                (dx < 0 ? -dx : dx) <= AMBIENT_RETURN_OFFSCREEN_X &&
                (dz < 0 ? -dz : dz) <= AMBIENT_RETURN_OFFSCREEN_Z) {
                continue; // (it would appear in view: later)
            }
            Ambients_AreaDistance(sAmbients.area[i], px, pz, &dx, &dz);
            best = i;
            bestDistance = dx + dz;
        }
        if (best == SPAWNS_AMBIENT_LIST_MAX || !Ambients_Join(field, best)) {
            break;
        }
    }
}

// The zone's ambients asked for: its candidates and their areas, and the nearest made
static void Ambients_Load(Field *field) {
    u32 i;

    sAmbients.candidateCount = (u8)Spawns_GetAmbients(field->gameSystem, HEAPID_TAIL(field->heapId),
                                                      sAmbients.candidates, SPAWNS_AMBIENT_LIST_MAX);
    for (i = 0; i < sAmbients.candidateCount; i++) {
        sAmbients.candidateState[i] = AMBIENT_CANDIDATE_IDLE;
        Ambients_Area(&sAmbients.candidates[i], sAmbients.area[i]);
    }
    sAmbients.frames = 0;
    sAmbients.streamTimer = AMBIENT_STREAM_FRAMES;
    Ambients_Stream(field, TRUE);
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

// One of the directions a perch turns to, at random
static u8 Ambients_PickFacing(u8 flags) {
    u32 faces = (flags >> AMBIENT_FLAG_FACES_SHIFT) & AMBIENT_FACES_ALL;
    u32 count = 0;
    u32 pick;
    u8 dir;

    if (faces == 0) {
        faces = AMBIENT_FACES_ALL;
    }
    for (dir = DIR_UP; dir <= DIR_RIGHT; dir++) {
        if (faces & (1 << dir)) {
            count++;
        }
    }
    pick = GFL_RandomLC(count);
    for (dir = DIR_UP; dir <= DIR_RIGHT; dir++) {
        if ((faces & (1 << dir)) && pick-- == 0) {
            break;
        }
    }
    return dir;
}

// An ambient's place on its path now, and its facing and whether it moves (walks)
// The ground nearest a height at a place, or the height itself where the map has none
static fx32 Ambients_GroundAt(Field *field, const VecFx32 *pos) {
    FieldG3DMapperTerrain terrain;
    fx32 best = pos->y;
    BOOL found = FALSE;
    u32 i;

    if (!FieldG3DMapper_GetTerrainAll(field->g3DMapper, pos, &terrain)) {
        return pos->y;
    }
    for (i = 0; i < terrain.layerCount; i++) {
        fx32 height = terrain.layers[i].height;

        if (!found ||
            (height > pos->y ? height - pos->y : pos->y - height) < (best > pos->y ? best - pos->y : pos->y - best)) {
            best = height;
            found = TRUE;
        }
    }
    return best;
}

static u32 Ambients_Frames(u32 seconds) {
    return seconds * AMBIENT_FRAMES_A_SECOND;
}

// A waypoints path's stop: its place (0) or a point after it
static void Ambients_Stop(const Ambient *ambient, u32 index, VecFx32 *out) {
    *out = ambient->record.at;
    if (index != 0) {
        out->x += ambient->record.points[index - 1][0] << FX32_SHIFT;
        out->y += ambient->record.points[index - 1][1] << FX32_SHIFT;
        out->z += ambient->record.points[index - 1][2] << FX32_SHIFT;
    }
}

// A leg from where it is to a place, at its pace (at least a frame)
static void Ambients_Leg(Ambient *ambient, const VecFx32 *to) {
    fx32 step = ambient->record.pace * FX32_ONE / AMBIENT_FRAMES_A_SECOND;
    fx32 length = VEC_Distance(&ambient->pathPos, to);

    ambient->pathFrom = ambient->pathPos;
    ambient->pathTo = *to;
    ambient->pathFrames = step > 0 ? (u16)(length / step) : 1;
    if (ambient->pathFrames == 0) {
        ambient->pathFrames = 1;
    }
    ambient->pathTimer = ambient->pathFrames;
}

// Part way from a leg's start to its end, by its frames left; the facing it goes
static void Ambients_AlongLeg(Ambient *ambient) {
    fx32 t = FX32_ONE * (ambient->pathFrames - ambient->pathTimer) / ambient->pathFrames;

    ambient->pathPos.x = ambient->pathFrom.x + FX_Mul(ambient->pathTo.x - ambient->pathFrom.x, t);
    ambient->pathPos.y = ambient->pathFrom.y + FX_Mul(ambient->pathTo.y - ambient->pathFrom.y, t);
    ambient->pathPos.z = ambient->pathFrom.z + FX_Mul(ambient->pathTo.z - ambient->pathFrom.z, t);
    ambient->facing = Ambients_DirOf(ambient->pathTo.x - ambient->pathFrom.x, ambient->pathTo.z - ambient->pathFrom.z,
                                     ambient->facing);
}

// A traveling path a frame on (AMBIENT_PATH_WANDER and after): where it is, and whether it moves (walks)
static BOOL Ambients_Travel(Field *field, Ambient *ambient, VecFx32 *pos) {
    const SpawnAmbient *record = &ambient->record;
    BOOL moving = FALSE;

    if (!ambient->pathStarted) {
        ambient->pathStarted = TRUE;
        ambient->pathPos = record->at;
        ambient->pathOver = record->at.y - Ambients_GroundAt(field, &record->at);
        ambient->pathDir = 1;
        ambient->pathTimer = AMBIENT_FRAMES_A_SECOND;
        ambient->pathHidden = record->path == AMBIENT_PATH_PEEK || record->path == AMBIENT_PATH_FLYOVER;
        if (record->path == AMBIENT_PATH_PEEK || record->path == AMBIENT_PATH_SURFACE) {
            ambient->pathStage = 2;
            ambient->pathTimer = Ambients_Frames(record->up);
            ambient->pathHidden = FALSE;
        }
    }
    switch (record->path) {
    case AMBIENT_PATH_WANDER:
        if (ambient->pathStage == 1) {
            // A step
            ambient->pathTimer--;
            Ambients_AlongLeg(ambient);
            moving = TRUE;
            if (ambient->pathTimer == 0) {
                u32 seconds = record->speed != 0 ? record->speed : AMBIENT_PERCH_SECONDS;

                ambient->pathStage = 0;
                ambient->pathTimer = Ambients_Frames(seconds) / 2 + GFL_RandomLC(Ambients_Frames(seconds));
            }
        } else if (--ambient->pathTimer == 0) {
            // A step tried in a direction at random, within its area, on the ground there
            u8 dir = (u8)GFL_RandomLC(4);
            VecFx32 to = ambient->pathPos;

            to.x += dir == DIR_LEFT ? -AMBIENT_TILE_UNITS : dir == DIR_RIGHT ? AMBIENT_TILE_UNITS : 0;
            to.z += dir == DIR_UP ? -AMBIENT_TILE_UNITS : dir == DIR_DOWN ? AMBIENT_TILE_UNITS : 0;
            if ((to.x > record->at.x ? to.x - record->at.x : record->at.x - to.x) <= (record->sizeX << FX32_SHIFT) &&
                (to.z > record->at.z ? to.z - record->at.z : record->at.z - to.z) <= (record->sizeZ << FX32_SHIFT)) {
                to.y -= ambient->pathOver;
                to.y = Ambients_GroundAt(field, &to) + ambient->pathOver;
                ambient->pathFrom = ambient->pathPos;
                ambient->pathTo = to;
                ambient->pathFrames = ambient->pathTimer = AMBIENT_WANDER_FRAMES;
                ambient->pathStage = 1;
                ambient->facing = dir;
            } else {
                ambient->pathTimer = AMBIENT_FRAMES_A_SECOND;
            }
        }
        break;
    case AMBIENT_PATH_WAYPOINTS:
        if (record->pointCount == 0) {
            break;
        }
        if (ambient->pathStage == 0) {
            // Waiting at a stop, then on to the next: round, or back the way it came at the ends
            if (ambient->pathTimer != 0 && --ambient->pathTimer != 0) {
                break;
            }
            {
                s32 next = ambient->pathIndex + ambient->pathDir;
                VecFx32 to;

                if (record->pathFlags & AMBIENT_PATH_FLAG_BACK) {
                    if (next > record->pointCount || next < 0) {
                        ambient->pathDir = (s8)-ambient->pathDir;
                        next = ambient->pathIndex + ambient->pathDir;
                    }
                } else if (next > record->pointCount) {
                    next = 0;
                }
                ambient->pathIndex = (u8)next;
                Ambients_Stop(ambient, ambient->pathIndex, &to);
                Ambients_Leg(ambient, &to);
                ambient->pathStage = 1;
            }
        }
        if (ambient->pathStage == 1) {
            ambient->pathTimer--;
            Ambients_AlongLeg(ambient);
            moving = TRUE;
            if (ambient->pathTimer == 0) {
                ambient->pathStage = 0;
                ambient->pathTimer = (u16)Ambients_Frames(record->wait);
            }
        }
        break;
    case AMBIENT_PATH_PEEK:
    case AMBIENT_PATH_SURFACE:
        // Down (0), rising (1), up (2), sinking (3)
        if (ambient->pathTimer != 0) {
            ambient->pathTimer--;
        }
        if (ambient->pathTimer == 0) {
            ambient->pathStage = (u8)((ambient->pathStage + 1) & 3);
            ambient->pathTimer = (u16)(ambient->pathStage == 0   ? Ambients_Frames(record->wait)
                                       : ambient->pathStage == 2 ? Ambients_Frames(record->up)
                                                                 : AMBIENT_PEEK_FRAMES);
            // A surface comes up somewhere else in its area
            if (ambient->pathStage == 1 && record->path == AMBIENT_PATH_SURFACE) {
                ambient->pathPos = record->at;
                ambient->pathPos.x += ((s32)GFL_RandomLC(2 * record->sizeX + 1) - record->sizeX) << FX32_SHIFT;
                ambient->pathPos.z += ((s32)GFL_RandomLC(2 * record->sizeZ + 1) - record->sizeZ) << FX32_SHIFT;
                ambient->facing = (u8)GFL_RandomLC(4);
            }
        }
        ambient->pathHidden = ambient->pathStage == 0;
        *pos = ambient->pathPos;
        if (ambient->pathStage == 1) {
            pos->y -= AMBIENT_PEEK_DEPTH * ambient->pathTimer / AMBIENT_PEEK_FRAMES;
        } else if (ambient->pathStage == 3) {
            pos->y -= AMBIENT_PEEK_DEPTH * (AMBIENT_PEEK_FRAMES - ambient->pathTimer) / AMBIENT_PEEK_FRAMES;
        } else if (ambient->pathStage == 2 && record->path == AMBIENT_PATH_SURFACE) {
            ambient->angle = (ambient->angle + 0x10000 / AMBIENT_FRAMES_A_SECOND / 2) & 0xffff;
            pos->y += FX_Mul(AMBIENT_SURFACE_BOB, FX_SinIdx(ambient->angle));
        }
        return ambient->pathStage == 2;
    case AMBIENT_PATH_FLYOVER:
        if (ambient->pathStage == 1) {
            ambient->pathTimer--;
            Ambients_AlongLeg(ambient);
            moving = TRUE;
            if (ambient->pathTimer == 0) {
                ambient->pathStage = 0;
                ambient->pathHidden = TRUE;
                ambient->pathTimer =
                    (u16)(Ambients_Frames(record->wait) / 2 + GFL_RandomLC(Ambients_Frames(record->wait) + 1));
            }
        } else if (ambient->pathTimer != 0) {
            ambient->pathTimer--;
        } else {
            // A pass, while the player is within its range of its place: from behind the player's view to past it
            VecFx32 at;

            FieldPlayer_GetWPos(field->player, &at);
            if ((at.x > record->at.x ? at.x - record->at.x : record->at.x - at.x) <= (record->sizeX << FX32_SHIFT) &&
                (at.z > record->at.z ? at.z - record->at.z : record->at.z - at.z) <= (record->sizeX << FX32_SHIFT)) {
                u16 heading = record->heading == AMBIENT_REACT_AWAY ? (u16)GFL_RandomLC(0x10000)
                                                                    : DEG_TO_IDX(record->heading % 360);
                VecFx32 to;

                ambient->pathPos = at;
                ambient->pathPos.x -= FX_Mul(AMBIENT_FLYOVER_REACH, FX_SinIdx(heading));
                ambient->pathPos.z += FX_Mul(AMBIENT_FLYOVER_REACH, FX_CosIdx(heading));
                ambient->pathPos.y += record->sizeY << FX32_SHIFT;
                to = at;
                to.x += FX_Mul(AMBIENT_FLYOVER_REACH, FX_SinIdx(heading));
                to.z -= FX_Mul(AMBIENT_FLYOVER_REACH, FX_CosIdx(heading));
                to.y = ambient->pathPos.y;
                Ambients_Leg(ambient, &to);
                ambient->pathStage = 1;
                ambient->pathHidden = FALSE;
            } else {
                ambient->pathTimer = AMBIENT_FRAMES_A_SECOND;
            }
        }
        break;
    }
    *pos = ambient->pathPos;
    return moving;
}

static BOOL Ambients_Move(Field *field, Ambient *ambient, VecFx32 *pos) {
    const SpawnAmbient *record = &ambient->record;
    fx32 sx = record->sizeX << FX32_SHIFT;
    fx32 sz = record->sizeZ << FX32_SHIFT;
    u32 step = record->speed * 0x10000 / (360 * AMBIENT_FRAMES_A_SECOND);
    fx32 s;
    fx32 c;
    fx32 dx = 0;
    fx32 dz = 0;

    if (record->path >= AMBIENT_PATH_WANDER) {
        return Ambients_Travel(field, ambient, pos);
    }
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
                ambient->facing = Ambients_PickFacing(record->flags);
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
        pos->y += FX_Mul(record->sizeY << FX32_SHIFT, (FX32_ONE - c) / 2);
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

// Whether the player has come near enough for an ambient to react: within its radius in tiles, or its startle radius
// while the player runs or cycles
static BOOL Ambients_ShouldReact(Field *field, const Ambient *ambient, const VecFx32 *pos) {
    FieldPlayer *player = field->player;
    VecFx32 at;
    s32 dx;
    s32 dz;
    u32 radius = ambient->record.reactNear;

    if (ambient->record.reactKind == AMBIENT_REACT_NONE || player == NULL || ambient->pathHidden) {
        return FALSE;
    }
    if (FieldPlayer_GetExState(player) == FLD_PLAYER_EXSTATE_CYCLING ||
        (FieldPlayer_CheckRunningShoesFlag(player) && (GCTX_HIDGetHeldKeys() & PAD_BUTTON_B) &&
         FieldPlayer_GetMoveObserveStatus(player) == PLAYER_OBSERVE_MOVING)) {
        radius = ambient->record.reactStartle;
    }
    FieldPlayer_GetWPos(player, &at);
    dx = AMBIENT_TILE(pos->x) - AMBIENT_TILE(at.x);
    dz = AMBIENT_TILE(pos->z) - AMBIENT_TILE(at.z);
    return (u32)(dx < 0 ? -dx : dx) <= radius && (u32)(dz < 0 ? -dz : dz) <= radius;
}

// A reaction started: its heading (away from the player, or its own) varied by its spread, its move a frame by its
// kind and speed, its bubble and its cry
static void Ambients_StartReaction(Field *field, Ambient *ambient, const VecFx32 *pos) {
    const SpawnAmbient *record = &ambient->record;
    fx32 speed = record->reactSpeed * FX32_ONE / AMBIENT_FRAMES_A_SECOND;
    VecFx32 at;
    u16 heading;

    FieldPlayer_GetWPos(field->player, &at);
    // (clockwise from north, the world's -z: away from the player is the way from it to the ambient)
    heading = record->reactHeading == AMBIENT_REACT_AWAY ? FX_Atan2Idx(pos->x - at.x, at.z - pos->z)
                                                         : DEG_TO_IDX(record->reactHeading % 360);
    if (record->reactSpread != 0) {
        heading += DEG_TO_IDX(GFL_RandomLC(2 * record->reactSpread + 1)) - DEG_TO_IDX(record->reactSpread);
    }
    MI_CpuFill8(&ambient->reactStep, 0, sizeof(VecFx32));
    if (record->reactKind == AMBIENT_REACT_HIDE) {
        ambient->reactStep.y = -AMBIENT_HIDE_DEPTH / AMBIENT_HIDE_FRAMES;
        ambient->reactTimer = AMBIENT_HIDE_FRAMES;
    } else {
        u16 climb = record->reactKind == AMBIENT_REACT_FLY ? DEG_TO_IDX(record->reactClimb) : 0;
        fx32 ground = FX_Mul(speed, FX_CosIdx(climb));

        ambient->reactStep.x = FX_Mul(ground, FX_SinIdx(heading));
        ambient->reactStep.z = -FX_Mul(ground, FX_CosIdx(heading));
        ambient->reactStep.y = FX_Mul(speed, FX_SinIdx(climb));
        ambient->reactTimer = AMBIENT_REACT_FRAMES;
        ambient->facing = Ambients_DirOf(ambient->reactStep.x, ambient->reactStep.z, ambient->facing);
    }
    ambient->reactPos = *pos;
    ambient->hop = 0;
    ambient->reaction = AMBIENT_REACTING;
    if (record->reactEmote != 0) {
        FldeffEmotionBubble_SetPos(field->fieldEffects, pos, record->reactEmote - 1, TRUE);
    }
    if (record->reactCry != 0 && !GFL_SndIsLoadThreadRunning()) {
        PokeVoice_Play(record->reactCry, 0, AMBIENT_CRY_PAN, 0, 0, 0, 0, NULL);
    }
}

// A reaction a frame on, gone at its end or once it's far from the player; then its return's wait, in frames
static void Ambients_StepReaction(Field *field, Ambient *ambient, VecFx32 *pos) {
    const SpawnAmbient *record = &ambient->record;
    VecFx32 at;
    s32 dx;
    s32 dz;

    ambient->reactPos.x += ambient->reactStep.x;
    ambient->reactPos.y += ambient->reactStep.y;
    ambient->reactPos.z += ambient->reactStep.z;
    *pos = ambient->reactPos;
    FieldPlayer_GetWPos(field->player, &at);
    dx = AMBIENT_TILE(pos->x) - AMBIENT_TILE(at.x);
    dz = AMBIENT_TILE(pos->z) - AMBIENT_TILE(at.z);
    if (--ambient->reactTimer != 0 && (dx < 0 ? -dx : dx) <= AMBIENT_REACT_FAR &&
        (dz < 0 ? -dz : dz) <= AMBIENT_REACT_FAR) {
        return;
    }
    ambient->reaction = AMBIENT_GONE;
    ambient->reactTimer =
        record->returnMin == AMBIENT_RETURN_NEVER
            ? 0
            : (record->returnMin + GFL_RandomLC(record->returnMax - record->returnMin + 1)) * AMBIENT_FRAMES_A_SECOND;
}

// A gone one's return: its wait counts down while the player is away from its place, and it comes back once that's
// out of view, as it was; one that doesn't return stays gone until the zone is entered again
static void Ambients_TickGone(Field *field, Ambient *ambient) {
    const SpawnAmbient *record = &ambient->record;
    VecFx32 at;
    s32 dx;
    s32 dz;

    if (record->returnMin == AMBIENT_RETURN_NEVER) {
        return;
    }
    FieldPlayer_GetWPos(field->player, &at);
    dx = AMBIENT_TILE(record->at.x) - AMBIENT_TILE(at.x);
    dz = AMBIENT_TILE(record->at.z) - AMBIENT_TILE(at.z);
    dx = dx < 0 ? -dx : dx;
    dz = dz < 0 ? -dz : dz;
    if (dx <= record->reactStartle + AMBIENT_RETURN_AWAY && dz <= record->reactStartle + AMBIENT_RETURN_AWAY) {
        return;
    }
    if (ambient->reactTimer != 0) {
        ambient->reactTimer--;
        return;
    }
    if (dx > AMBIENT_RETURN_OFFSCREEN_X || dz > AMBIENT_RETURN_OFFSCREEN_Z) {
        ambient->reaction = AMBIENT_AT_HOME;
        ambient->pathStarted = FALSE;
        ambient->facing = record->facing;
        ambient->angle = DEG_TO_IDX(record->phase % 360);
    }
}

void PaperWhite2_AmbientsUpdate(Field *field) {
    MMSys *actorSystem = field->actorSystem;
    BillboardActorSys *sys;
    BOOL free;
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
    if (!sAmbients.loaded || sAmbients.zone != zone) {
        Ambients_Clear(actorSystem);
        sAmbients.zone = zone;
        sAmbients.loaded = TRUE;
        Ambients_Load(field);
    }
    sAmbients.frames++;
    if (--sAmbients.streamTimer == 0) {
        sAmbients.streamTimer = AMBIENT_STREAM_FRAMES;
        Ambients_Stream(field, FALSE);
    }
    angle = FldActSys_GetCameraAngle(actorSystem);
    free = GSYS_GetNowEvent(field->gameSystem) == NULL && !Field_IsEventRunning(field);
    for (i = 0; i < sAmbients.count; i++) {
        Ambient *ambient = &sAmbients.list[i];
        VecFx32 pos = ambient->reactPos;
        BOOL moving = TRUE;
        BOOL byDirection;
        u16 drawn;
        u16 *last;
        u16 anim;

        if (ambient->billboard[1] == BILLBOARD_ACTOR_NONE) {
            continue; // (still loading)
        }
        if (ambient->reaction == AMBIENT_AT_HOME) {
            moving = Ambients_Move(field, ambient, &pos);
            if (free && Ambients_ShouldReact(field, ambient, &pos)) {
                Ambients_StartReaction(field, ambient, &pos);
            }
        }
        if (ambient->reaction == AMBIENT_REACTING) {
            moving = TRUE;
            Ambients_StepReaction(field, ambient, &pos);
        }
        // Its own sprite at home, its reaction sprite (where it has one) once it reacts, neither once it's gone
        drawn = ambient->reaction == AMBIENT_REACTING && ambient->react[1] != BILLBOARD_ACTOR_NONE
                    ? ambient->react[1]
                    : ambient->billboard[1];
        BillboardActorSys_SetActorVisible(sys, ambient->billboard[1],
                                          ambient->reaction != AMBIENT_GONE && drawn == ambient->billboard[1] &&
                                              !(ambient->reaction == AMBIENT_AT_HOME && ambient->pathHidden));
        if (ambient->react[1] != BILLBOARD_ACTOR_NONE) {
            BillboardActorSys_SetActorVisible(sys, ambient->react[1],
                                              ambient->reaction != AMBIENT_GONE && drawn == ambient->react[1]);
        }
        if (ambient->reaction == AMBIENT_GONE) {
            if (ambient->shadow != BILLBOARD_ACTOR_NONE) {
                BOOL shown = FALSE;

                BillboardActorScene_SetActorHidden(BillboardActorSys_GetScene(sAmbients.shadowSys), ambient->shadow,
                                                   &shown);
            }
            Ambients_TickGone(field, ambient);
            continue;
        }
        if (ambient->shadow != BILLBOARD_ACTOR_NONE) {
            BillboardActorScene *shadowScene = BillboardActorSys_GetScene(sAmbients.shadowSys);
            VecFx32 at;
            // (none while it's out of sight)
            BOOL shown = !(ambient->reaction == AMBIENT_AT_HOME && ambient->pathHidden) &&
                         Ambients_ShadowAt(field, ambient, &pos, &at);

            // (SetActorHidden takes whether it shows, as FldeffShadow_Draw passes it)
            BillboardActorScene_SetActorHidden(shadowScene, ambient->shadow, &shown);
            BillboardActorScene_SetActorPos(shadowScene, ambient->shadow, &at);
        }
        pos.y += Field_GetActorYOffset(field);
        BillboardActorScene_SetActorPos(BillboardActorSys_GetScene(sys), drawn, &pos);
        byDirection = drawn == ambient->react[1] ? ambient->reactByDirection : ambient->byDirection;
        if (byDirection) {
            anim = ambient->facing;
            moving = TRUE;
        } else {
            anim = (moving ? AMBIENT_ANIM_WALK : AMBIENT_ANIM_STAND) + RotateDirByAngle(ambient->facing, angle);
        }
        // (each sprite's own last animation, set again only when it changes)
        last = drawn == ambient->react[1] ? &ambient->reactAnim : &ambient->anim;
        if (anim != *last) {
            *last = anim;
            BillboardActorSys_SetActorAnim(sys, drawn, anim);
            BillboardActorSys_SetActorAnimating(sys, drawn, moving);
        }
    }
}

BOOL PaperWhite2_AmbientsUseObjCode(u16 objCode) {
    u32 i;

    for (i = 0; i < sAmbients.count; i++) {
        if (sAmbients.list[i].record.objCodes[0] == objCode ||
            (sAmbients.list[i].record.reactSprite != 0 && sAmbients.list[i].record.reactSprite == objCode)) {
            return TRUE;
        }
    }
    return FALSE;
}
