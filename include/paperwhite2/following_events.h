#ifndef PAPERWHITE2_FOLLOWING_EVENTS_H
#define PAPERWHITE2_FOLLOWING_EVENTS_H

#include "types.h"
#include "nitro/fx.h"
#include "paperwhite2/following.h"
#include "struct_decls.h"

// Paper White 2: the Following Pokémon's events bridge (src/paperwhite2/ov012/paperwhite2_following_events.c), ported
// from Pokeweb's events.c: what the game's events, scripts and actors do, told to the one observer that the field's
// scene policy binds while its field runs, and the PC's restore token (docs/paperwhite2/following-pokemon.md)

// What the observer is told, each with its subject and value:
// - CALLBACK: an event of the bound game system is about to run; the event, its callback
// - FREE: an event of the bound game system is about to be freed; the event, 0
// - OPCODE: a field script of the bound field read a command; the VM, the command's opcode
// - ACTION: an actor of the bound field is given an action command (FldAct_SetAcmd, FldAct_SetLocalAcmd); the actor,
//   the command
// - ALLOCATE: the bound field's actors are about to take a slot for a zone's entity; the MMSys, the ZoneNPC *
// - POSITION: an actor of the bound field is placed (SetActorWPosAll, or its first position before its move code is
//   set up); the actor, the const VecFx32 * of its new world position
// - DELETE: an actor of the bound field is about to be deleted; the actor, 0
// - WORLD_STEP: an actor of the bound field whose move code is set up moves; the actor, the const VecFx32 * of its
//   new world position
// - VM_FREE: a field script's VM is about to be freed (its environment already is); the VM, 0
// - AMBIENT_GRID, AMBIENT_RAIL: an actor of the bound field, in its own move code's update, asks whether another actor
//   blocks its way and none does; the actor, the FollowingEventCollision * that the observer may block
// The observer may delete the actor of ACTION, POSITION, DELETE and WORLD_STEP: the game then leaves it alone
enum {
    FOLLOWING_EVENT_CALLBACK = 1,
    FOLLOWING_EVENT_FREE,
    FOLLOWING_EVENT_OPCODE,
    FOLLOWING_EVENT_ACTION,
    FOLLOWING_EVENT_ALLOCATE,
    FOLLOWING_EVENT_POSITION,
    FOLLOWING_EVENT_DELETE,
    FOLLOWING_EVENT_WORLD_STEP,
    FOLLOWING_EVENT_VM_FREE,
    FOLLOWING_EVENT_AMBIENT_GRID,
    FOLLOWING_EVENT_AMBIENT_RAIL,
};

// Where an ambient actor would go, which the observer sets blocked to stop. On the grid position is the target's grid
// coordinates and radius is 0; on rails position is the rail location's world position and radius a quarter of the
// rail's unit scale. Only valid during the notification
typedef struct FollowingEventCollision {
    VecFx32 position;
    fx32 radius;
    BOOL blocked;
} FollowingEventCollision;

// The observer, called with a kind, its subject and its value; never while it runs already
typedef void (*FollowingEventObserver)(u32 kind, void *subject, uptr value);

// What a PC's storage keeps of the follower, to put it back where it was when the player returns to the same tile
typedef struct {
    u32 magic;
    VecFx32 player;
    VecFx32 follower;
    s16 grid[3];
    u16 face;
    u16 zone;
    FollowingPokemon selected;
} FollowingRestore;

#define FOLLOWING_RESTORE_MAGIC ('F' | 'W' << 8 | 'S' << 16 | (u32)'R' << 24)

// Binds observer to field and its game system for generation, the field's follower generation, and the main's event
// hooks to the bridge. While hold returns TRUE (the recall's image and ball finishing), each event of the game system
// waits. FALSE when another field or generation is bound
BOOL FollowingEvents_Bind(Field *field, GameSystem *gsys, u32 generation, FollowingEventObserver observer,
                          BOOL (*hold)(void));
void FollowingEvents_Unbind(Field *field, u32 generation);
// Keeps restore, while field and generation are bound, for the next field
void FollowingEvents_Preserve(Field *field, u32 generation, const FollowingRestore *restore);
// Takes the kept restore token: FALSE when there is none
BOOL FollowingEvents_Consume(FollowingRestore *restore);
void FollowingEvents_Discard(void);

// The hooks' sites in overlay 12's field_actor.c and field_actor_tool.c and overlay 36's field_actor_rail.c. Those
// that return a BOOL return FALSE when the observer deleted the actor, which the site then leaves alone
// FldAct_SetAcmd and FldAct_SetLocalAcmd: FALSE skips SetNextActorAcmd, and the rest of the site goes on
// (event-actor-action-queued, event-actor-action-reset)
BOOL PaperWhite2_FollowingOnActorAction(FieldActor *actor, u16 acmd);
// CreateNewActorByEntity, before it takes a slot for entity, its copy of the zone's entity (event-actor-allocation)
void PaperWhite2_FollowingOnActorAllocate(MMSys *system, const ZoneNPC *entity);
// SetActorWPosAll, at its start (event-actor-position)
BOOL PaperWhite2_FollowingOnActorPosition(FieldActor *actor, const VecFx32 *pos);
// DeleteActor, at its start (event-actor-delete)
BOOL PaperWhite2_FollowingOnActorDelete(FieldActor *actor);
// SetActorWPosValue, before it writes the position (event-actor-world-step)
BOOL PaperWhite2_FollowingOnActorStep(FieldActor *actor, const VecFx32 *pos);
// FldAct_CallMoveProc: marks actor as the one whose move code runs, for the ambient collisions, and returns the one
// before, to give back after (ambient-callback)
FieldActor *PaperWhite2_FollowingBeginAmbient(FieldActor *actor);
void PaperWhite2_FollowingEndAmbient(FieldActor *previous);
// The ambient collisions, CheckActorNewPosOtherActorCollision and RailActor_CheckCollision's actor check: blocked is
// the original's result, returned unless the observer blocks the way (ambient-grid-collision, ambient-rail-collision)
BOOL PaperWhite2_FollowingCheckGridCollision(const FieldActor *actor, s16 x, s16 y, s16 z, BOOL blocked);
BOOL PaperWhite2_FollowingCheckRailCollision(FieldActor *actor, const RailPosition *location, BOOL blocked);

#endif // PAPERWHITE2_FOLLOWING_EVENTS_H
