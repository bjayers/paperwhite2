#include "types.h"
#include "field/field_actor.h"
#include "field/field_actor_internal.h"
#include "field/field_nogrid_mapper.h"
#include "field/field_rail.h"
#include "field/field_script.h"
#include "paperwhite2/following_events.h"
#include "paperwhite2/following_field.h"
#include "paperwhite2/following_resident.h"
#include "system/game_event.h"
#include "system/vm.h"

// Paper White 2: the Following Pokémon's events bridge, ported from Pokeweb's events.c. Overlay 12's actors and main's
// events and scripts tell it what they do, and it tells the one observer that the field's scene policy binds, for the
// field and the follower generation it is bound to (docs/paperwhite2/following-pokemon.md)

// A FieldActor's flag that its move code is set up (FldAct_SetupMoveCode), which DeleteActor also tests
#define ACTOR_FLAG_MOVE_SET_UP 0x2

typedef struct FollowingEventBridge {
    Field *field;
    GameSystem *gsys;
    u32 generation;
    FollowingEventObserver observer;
    BOOL notifying;
    // The actor whose move code runs, whose collision queries the observer may block
    FieldActor *ambient;
    BOOL (*hold)(void);
} FollowingEventBridge;

static void OnOpcode(VM *vm, u16 cmd);
static BOOL OnCallback(GameEvent *event, GameSystem *gsys, GameEventCallback callback);
static void OnEventFree(GameEvent *event, GameSystem *gsys);
static void OnVmFree(VM *vm);

static const FollowingEventHooks sResidentHooks = {
    OnOpcode,
    OnCallback,
    OnEventFree,
    OnVmFree,
};

static FollowingEventBridge sBridge;

BOOL FollowingEvents_Bind(Field *field, GameSystem *gsys, u32 generation, FollowingEventObserver observer,
                          BOOL (*hold)(void)) {
    if (field == NULL || gsys == NULL || generation == 0 || observer == NULL) {
        return FALSE;
    }
    if (sBridge.observer != NULL && (sBridge.field != field || sBridge.generation != generation)) {
        return FALSE;
    }
    PaperWhite2_FollowingBindEventHooks(&sResidentHooks);
    sBridge.field = field;
    sBridge.gsys = gsys;
    sBridge.generation = generation;
    sBridge.observer = observer;
    sBridge.hold = hold;
    return TRUE;
}

void FollowingEvents_Unbind(Field *field, u32 generation) {
    if (sBridge.field == field && sBridge.generation == generation) {
        sBridge.observer = NULL;
        sBridge.ambient = NULL;
        sBridge.field = NULL;
        sBridge.gsys = NULL;
        sBridge.generation = 0;
        sBridge.hold = NULL;
        PaperWhite2_FollowingClearEventHooks();
    }
}

void FollowingEvents_Preserve(Field *field, u32 generation, const FollowingRestore *restore) {
    if (sBridge.field != field || sBridge.generation != generation || restore == NULL ||
        restore->magic != FOLLOWING_RESTORE_MAGIC) {
        return;
    }
    PaperWhite2_FollowingTokenStore(FOLLOWING_TOKEN_RESTORE, restore, sizeof(*restore));
}

BOOL FollowingEvents_Consume(FollowingRestore *restore) {
    return restore != NULL && PaperWhite2_FollowingTokenConsume(FOLLOWING_TOKEN_RESTORE, restore, sizeof(*restore));
}

void FollowingEvents_Discard(void) {
    PaperWhite2_FollowingTokenDiscard(FOLLOWING_TOKEN_RESTORE);
}

static void Notify(u32 kind, void *subject, uptr value) {
    if (sBridge.observer == NULL || sBridge.notifying) {
        return;
    }
    sBridge.notifying = TRUE;
    sBridge.observer(kind, subject, value);
    sBridge.notifying = FALSE;
}

// Whether actor is one of the bound field's, while the bridge is bound
static BOOL IsBoundActor(const FieldActor *actor) {
    return sBridge.observer != NULL && actor->actorSystem != NULL && actor->actorSystem->field == sBridge.field;
}

// Only field scripts, which run EVCMD_TABLE's commands, are the field's: the others (battle, applications) aren't
// looked into, and this comparison comes before any read of their environment
static void OnOpcode(VM *vm, u16 cmd) {
    if (sBridge.observer != NULL && vm->param.commands == (const VMCommand *)EVCMD_TABLE) {
        FieldScriptEnv *env = vm->env;
        ScriptSubwork *subwork = env != NULL ? env->subwork : NULL;

        if (subwork != NULL && subwork->gsys == sBridge.gsys && subwork->mmSys != NULL &&
            subwork->mmSys->field == sBridge.field) {
            Notify(FOLLOWING_EVENT_OPCODE, vm, cmd);
        }
    }
}

// TRUE keeps the event waiting while the field's recall image and ball finish: it is the original's "still running"
// result, in which no script command, warp or scripted movement of the player goes on
static BOOL OnCallback(GameEvent *event, GameSystem *gsys, GameEventCallback callback) {
    if (sBridge.observer != NULL && gsys == sBridge.gsys) {
        Notify(FOLLOWING_EVENT_CALLBACK, event, (uptr)callback);
    }
    return sBridge.observer != NULL && gsys == sBridge.gsys && sBridge.hold != NULL && sBridge.hold();
}

static void OnEventFree(GameEvent *event, GameSystem *gsys) {
    if (sBridge.observer != NULL && gsys == sBridge.gsys) {
        Notify(FOLLOWING_EVENT_FREE, event, 0);
    }
}

// The script's environment is already freed
static void OnVmFree(VM *vm) {
    if (sBridge.observer != NULL && vm->param.commands == (const VMCommand *)EVCMD_TABLE) {
        Notify(FOLLOWING_EVENT_VM_FREE, vm, 0);
    }
}

BOOL PaperWhite2_FollowingOnActorAction(FieldActor *actor, u16 acmd) {
    u32 wasUsed = actor->flags & FOLLOWING_ACTOR_FLAG_USE;

    if (IsBoundActor(actor)) {
        Notify(FOLLOWING_EVENT_ACTION, actor, acmd);
    }
    return !wasUsed || (actor->flags & FOLLOWING_ACTOR_FLAG_USE);
}

void PaperWhite2_FollowingOnActorAllocate(MMSys *system, const ZoneNPC *entity) {
    if (sBridge.observer != NULL && system->field == sBridge.field) {
        Notify(FOLLOWING_EVENT_ALLOCATE, system, (uptr)entity);
    }
}

BOOL PaperWhite2_FollowingOnActorPosition(FieldActor *actor, const VecFx32 *pos) {
    u32 wasUsed = actor->flags & FOLLOWING_ACTOR_FLAG_USE;

    if (IsBoundActor(actor)) {
        Notify(FOLLOWING_EVENT_POSITION, actor, (uptr)pos);
    }
    return !wasUsed || (actor->flags & FOLLOWING_ACTOR_FLAG_USE);
}

// The follower's own actor, which the observer has already removed, is left alone
BOOL PaperWhite2_FollowingOnActorDelete(FieldActor *actor) {
    u32 wasUsed = actor->flags & FOLLOWING_ACTOR_FLAG_USE;

    if (IsBoundActor(actor)) {
        Notify(FOLLOWING_EVENT_DELETE, actor, 0);
    }
    return !wasUsed || (actor->flags & FOLLOWING_ACTOR_FLAG_USE);
}

// A new actor's first position comes before its move code is set up: that is a placement, not a step from the cleared
// origin, so it is told as one, and a real conflict at its place still recalls the follower
BOOL PaperWhite2_FollowingOnActorStep(FieldActor *actor, const VecFx32 *pos) {
    u32 wasUsed = actor->flags & FOLLOWING_ACTOR_FLAG_USE;

    if (IsBoundActor(actor)) {
        Notify((actor->flags & ACTOR_FLAG_MOVE_SET_UP) ? FOLLOWING_EVENT_WORLD_STEP : FOLLOWING_EVENT_POSITION, actor,
               (uptr)pos);
    }
    return !wasUsed || (actor->flags & FOLLOWING_ACTOR_FLAG_USE);
}

// Only the collision queries of an actor's own move code count: sight and event queries outside it keep the game's
// results
FieldActor *PaperWhite2_FollowingBeginAmbient(FieldActor *actor) {
    FieldActor *previous = sBridge.ambient;

    sBridge.ambient = actor;
    return previous;
}

void PaperWhite2_FollowingEndAmbient(FieldActor *previous) {
    sBridge.ambient = previous;
}

BOOL PaperWhite2_FollowingCheckGridCollision(const FieldActor *actor, s16 x, s16 y, s16 z, BOOL blocked) {
    FollowingEventCollision query;

    if (!blocked && sBridge.ambient == actor && IsBoundActor(actor)) {
        query.position.x = x;
        query.position.y = y;
        query.position.z = z;
        query.radius = 0;
        query.blocked = FALSE;
        Notify(FOLLOWING_EVENT_AMBIENT_GRID, (FieldActor *)actor, (uptr)&query);
        blocked = query.blocked ? TRUE : FALSE;
    }
    return blocked;
}

BOOL PaperWhite2_FollowingCheckRailCollision(FieldActor *actor, const RailPosition *location, BOOL blocked) {
    FollowingEventCollision query;

    if (!blocked && sBridge.ambient == actor && IsBoundActor(actor)) {
        NoGridMapper *mapper = FldActSys_GetNoGridMapper(actor->actorSystem);
        FieldRailSystem *rail = mapper != NULL ? FieldNoGridMapper_GetRailSystem(mapper) : NULL;

        if (rail != NULL) {
            query.blocked = FALSE;
            FieldRailSystem_GetLocationPos(rail, location, &query.position);
            query.radius = FieldRailSystem_GetUnitScale(rail) / 4;
            Notify(FOLLOWING_EVENT_AMBIENT_RAIL, actor, (uptr)&query);
            blocked = query.blocked ? TRUE : FALSE;
        }
    }
    return blocked;
}
