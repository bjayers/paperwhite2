#include "types.h"
#include "constants/directions.h"
#include "field/field.h"
#include "field/field_acmd.h"
#include "field/field_actor.h"
#include "field/zone.h"
#include "gfl/billboard_actor.h"
#include "nitro/mi.h"
#include "paperwhite2/entralink_run.h"
#include "paperwhite2/entralink_run_state.h"
#include "system/game_system.h"

// Paper White 2: the Entralink run's room ambients (room NPCs of type ambient, paperwhite2/entralink_run.h's
// ENTRALINK_NPC_AMBIENT): actors with nothing to say that react when the player comes within their near distance
// (square, as the overworld's ambients measure it), while no event runs. A fading one's sprite fades out over
// FADE_FRAMES; with a far distance its actor goes (so it doesn't block the way) and comes back, fading in, once the
// player is that far from its tile, else it is gone for the rest of the room. A fleeing one turns and runs up to its
// distance away from the player, a tile about every 8 frames, fading over its last FADE_FRAMES, then is gone. The
// overworld's ambients (paperwhite2_ambients.c) are billboards without actors, made from a zone's own records, so these
// are done here on the room's actors: the fade is the alpha of the actor's billboard (as the footprints fade), the run
// its walk commands. The work is a few bytes per NPC of the room

// The frames a fade out or in takes, and the alpha it runs between (0 would draw the polygons as wireframes)
#define FADE_FRAMES 15
#define ALPHA_SHOWN 31
#define ALPHA_FADED 1
// The frames a fleeing ambient takes a tile: ACMD_WALK_4F, set one tile at a time, moves it a tile every 8 frames (as
// the emulator showed)
#define FLEE_STEP_FRAMES 8

enum {
    // Where it stands, fully shown (or not yet seen by this file)
    PHASE_HOME,
    PHASE_FADING_OUT,
    // Faded out, its actor gone, waiting for the player to go far enough away
    PHASE_FADED,
    PHASE_FADING_IN,
    PHASE_FLEEING,
};

typedef struct {
    u8 phase;
    // The frames of its fade or flight so far
    u8 frames;
    // A fleeing one's tiles left to run
    u8 steps;
} RoomAmbient;

static struct {
    // The room whose ambients these are (EntralinkRunState's room)
    u8 room;
    RoomAmbient list[16];
} sRoomAmbients;

// Sets the alpha of an actor's sprite; FALSE while its billboard isn't made yet
static BOOL EntralinkAmbients_SetAlpha(MMSys *actorSystem, FieldActor *actor, u8 alpha) {
    u32 billboard = FldAct_GetBillboardActorIdx(actor, 0);
    BillboardActorSys *sys;

    if (billboard == BILLBOARD_ACTOR_NONE) {
        return FALSE;
    }
    sys = FieldBillboardActor_GetBillboardActorSys(FldActSys_GetFieldBillboardActor(actorSystem));
    BillboardActorScene_SetActorAlpha(BillboardActorSys_GetScene(sys), BillboardActorSys_GetSceneActor(sys, billboard),
                                      &alpha);
    return TRUE;
}

// The alpha a fade out has after some frames of its FADE_FRAMES
static u8 EntralinkAmbients_FadeAlpha(u32 frames) {
    if (frames >= FADE_FRAMES) {
        return ALPHA_FADED;
    }
    return ALPHA_SHOWN - (ALPHA_SHOWN - ALPHA_FADED) * frames / FADE_FRAMES;
}

// The tiles between the player and a tile, the larger of the two ways (a square, as paperwhite2_ambients.c's)
static u32 EntralinkAmbients_Distance(FieldActor *player, s32 x, s32 z) {
    s32 dx = x - GetGPosX(player);
    s32 dz = z - GetGPosZ(player);

    if (dx < 0) {
        dx = -dx;
    }
    if (dz < 0) {
        dz = -dz;
    }
    return dx > dz ? dx : dz;
}

// The way a fleeing actor runs its next tile, the first open of: away from the player along the farther way, away along
// the other, and that other's opposite (never back toward the player along the farther way); DIR_NONE where none is
static u32 EntralinkAmbients_FleeDirection(FieldActor *actor, FieldActor *player) {
    s32 dx = GetGPosX(actor) - GetGPosX(player);
    s32 dz = GetGPosZ(actor) - GetGPosZ(player);
    u32 across = dx >= 0 ? DIR_RIGHT : DIR_LEFT;
    u32 along = dz >= 0 ? DIR_DOWN : DIR_UP;
    u32 ways[3];
    u32 i;

    if ((dx < 0 ? -dx : dx) >= (dz < 0 ? -dz : dz)) {
        ways[0] = across;
        ways[1] = along;
        ways[2] = along == DIR_DOWN ? DIR_UP : DIR_DOWN;
    } else {
        ways[0] = along;
        ways[1] = across;
        ways[2] = across == DIR_RIGHT ? DIR_LEFT : DIR_RIGHT;
    }
    for (i = 0; i < NELEMS(ways); i++) {
        if (ActorRouteCollCheckOneTileInDir(actor, ways[i]) == 0) {
            return ways[i];
        }
    }
    return DIR_NONE;
}

// One frame of a fleeing ambient: its next tile once the last is walked, and its fade over the last FADE_FRAMES of its
// flight (its distance's frames, at least FADE_FRAMES; where its way is blocked it stops and fades there); TRUE once
// it is done
static BOOL EntralinkAmbients_Flee(RoomAmbient *ambient, const EntralinkNpc *npc, MMSys *actorSystem, FieldActor *actor,
                                   FieldActor *player) {
    u32 flight = npc->distance * FLEE_STEP_FRAMES;
    u32 dir;

    if (flight < FADE_FRAMES) {
        flight = FADE_FRAMES;
    }
    if (FldAct_CheckAcmdEnd(actor)) {
        dir = ambient->steps != 0 ? EntralinkAmbients_FleeDirection(actor, player) : DIR_NONE;
        if (dir == DIR_NONE) {
            ambient->steps = 0;
        } else {
            FldAct_SetAcmd(actor, GetAcmdForDir(dir, ACMD_WALK_4F));
            ambient->steps--;
        }
    }
    if (ambient->frames < flight) {
        ambient->frames++;
    }
    EntralinkAmbients_SetAlpha(actorSystem, actor,
                               EntralinkAmbients_FadeAlpha(ambient->frames + FADE_FRAMES > flight
                                                               ? ambient->frames + FADE_FRAMES - flight
                                                               : 0));
    return ambient->frames >= flight && ambient->steps == 0 && FldAct_CheckAcmdEnd(actor);
}

// One frame of an ambient of the room
static void EntralinkAmbients_Update(Field *field, RoomAmbient *ambient, u32 index, const EntralinkNpc *npc,
                                     FieldActor *player) {
    MMSys *actorSystem = Field_GetActorSystem(field);
    FieldActor *actor = FindFieldActor(actorSystem, index);
    u32 distance;

    if (ambient->phase == PHASE_FADED) {
        if (actor != NULL) {
            // (the room's NPCs were put back, as the field was made again after a battle)
            ambient->phase = PHASE_HOME;
        } else if (EntralinkAmbients_Distance(player, npc->x, npc->z) >= npc->far) {
            if (EntralinkRun_SpawnAmbient(field, index) != NULL) {
                ambient->phase = PHASE_FADING_IN;
                ambient->frames = 0;
            }
        }
        return;
    }
    if (actor == NULL) {
        return;
    }
    distance = EntralinkAmbients_Distance(player, GetGPosX(actor), GetGPosZ(actor));
    switch (ambient->phase) {
    case PHASE_HOME:
        if (distance <= npc->near) {
            ambient->frames = 0;
            if (npc->behaviour == ENTRALINK_AMBIENT_FLEE) {
                ambient->phase = PHASE_FLEEING;
                ambient->steps = npc->distance;
            } else {
                ambient->phase = PHASE_FADING_OUT;
            }
        }
        break;
    case PHASE_FADING_OUT:
        ambient->frames++;
        EntralinkAmbients_SetAlpha(actorSystem, actor, EntralinkAmbients_FadeAlpha(ambient->frames));
        if (ambient->frames >= FADE_FRAMES) {
            if (npc->far != 0) {
                DeleteActor(actor);
                ambient->phase = PHASE_FADED;
            } else {
                EntralinkRun_RemoveAmbient(field, index);
                ambient->phase = PHASE_HOME;
            }
        }
        break;
    case PHASE_FADING_IN:
        // (shown once its sprite has the alpha of the fade's start)
        if (!EntralinkAmbients_SetAlpha(actorSystem, actor,
                                        EntralinkAmbients_FadeAlpha(FADE_FRAMES - ambient->frames))) {
            break;
        }
        SetActorHidden(actor, FALSE);
        if (distance <= npc->near) {
            // (the player came back: it fades out again from where the fade in got to)
            ambient->phase = PHASE_FADING_OUT;
            ambient->frames = FADE_FRAMES - ambient->frames;
            break;
        }
        ambient->frames++;
        if (ambient->frames >= FADE_FRAMES) {
            EntralinkAmbients_SetAlpha(actorSystem, actor, ALPHA_SHOWN);
            ambient->phase = PHASE_HOME;
        }
        break;
    case PHASE_FLEEING:
        if (EntralinkAmbients_Flee(ambient, npc, actorSystem, actor, player)) {
            EntralinkRun_RemoveAmbient(field, index);
            ambient->phase = PHASE_HOME;
        }
        break;
    }
}

void PaperWhite2_EntralinkAmbientsUpdate(Field *field) {
    GameSystem *gsys = Field_GetGameSystem(field);
    EntralinkRunState *state;
    FieldActor *player;
    const EntralinkNpc *npc;
    u32 i;

    if (!EntralinkRun_IsActive(GSYS_GetGameData(gsys))) {
        return;
    }
    state = EntralinkRun_GetState();
    if (sRoomAmbients.room != state->room) {
        MI_CpuFill8(&sRoomAmbients, 0, sizeof(sRoomAmbients));
        sRoomAmbients.room = state->room;
    }
    // (they wait while an event runs: a talk, a battle's start, a warp)
    if (GSYS_GetNowEvent(gsys) != NULL || Field_IsEventRunning(field)) {
        return;
    }
    player = FieldPlayer_GetActor(Field_GetPlayer(field));
    for (i = 0; i < NELEMS(sRoomAmbients.list); i++) {
        npc = EntralinkRun_GetAmbient(i);
        if (npc == NULL) {
            sRoomAmbients.list[i].phase = PHASE_HOME;
        } else {
            EntralinkAmbients_Update(field, &sRoomAmbients.list[i], i, npc, player);
        }
    }
}
