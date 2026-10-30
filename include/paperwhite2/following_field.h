#ifndef PAPERWHITE2_FOLLOWING_FIELD_H
#define PAPERWHITE2_FOLLOWING_FIELD_H

#include "types.h"
#include "field/field_actor.h"
#include "struct_decls.h"

// Paper White 2: the Following Pokémon's follower in the field: the party member that follows, its actor, which walks
// the player's trail, L and R to switch it, and the hooks in the field's routines that run it
// (src/paperwhite2/ov036/paperwhite2_following_field.c), ported from Pokeweb's field.c
// (docs/paperwhite2/following-pokemon.md)

// The Following Pokémon are on in this ROM. The original's native.bin switched them for the whole ROM; the save's
// Followers Off choice (Config's followersOff) still turns them off
#define FOLLOWING_ENABLED 1

// The bits of a FieldActor's flags that the follower's code sets and tests, which the decomp doesn't name: the actor is
// in use, it isn't drawn, its animation is paused, it keeps its zone, and no actor or query sees it
#define FOLLOWING_ACTOR_FLAG_USE 0x1
#define FOLLOWING_ACTOR_FLAG_HIDDEN 0x4
#define FOLLOWING_ACTOR_FLAG_PAUSE_ANIMATION 0x10
#define FOLLOWING_ACTOR_FLAG_KEEP_ZONE 0x20
#define FOLLOWING_ACTOR_FLAG_NOT_BLOCKING (0x80 | 0x100 | 0x8000)
#define FOLLOWING_ACTOR_FLAG_NOT_QUERIED (0x200 | 0x400)

// The bits of its movement flags: its movement is disabled (DisableActorMovement), a new actor's terrain and height
// are still to be read (which keep FldAct_CanRunMoveProc from running its move), its shadow is up
// (RailActor_EnsureShadow sets it), its shadow is hidden (ACTOR_MOVEMENT_FLAG_HIDE_SHADOW), it is in shallow water
// (FldAct_SetSplashed), its map attribute effects are off (FldAct_SetMoveBitAttrEffectOff) and its landing dust is off
// (FldAct_SetLandingDustDisabled). Pokeweb's names for the last two were "not saved" and "no effect"
#define FOLLOWING_ACTOR_MOVEMENT_DISABLED 0x8
#define FOLLOWING_ACTOR_MOVEMENT_UNREAD (0x800 | 0x1000)
#define FOLLOWING_ACTOR_MOVEMENT_SHADOW_SET 0x4000
#define FOLLOWING_ACTOR_MOVEMENT_SHADOW_HIDDEN ACTOR_MOVEMENT_FLAG_HIDE_SHADOW
#define FOLLOWING_ACTOR_MOVEMENT_SPLASHED 0x40000
#define FOLLOWING_ACTOR_MOVEMENT_ATTR_EFFECT_OFF 0x100000
#define FOLLOWING_ACTOR_MOVEMENT_LANDING_DUST_OFF 0x200000

// The hooks, in fieldmap.c and field_player.c
// The follower's frame, in FieldRoutine_Run around the actors' update: creates, moves and recalls it
// (field-actor-update)
void PaperWhite2_FollowingUpdate(MMSys *system);
// Binds the follower's sprite while the map is spawned, before the entrance fade shows it (field-follower-matcache)
void PaperWhite2_FollowingPreloadFollower(Field *field, MMSys *system);
// Frees the follower before the field's actors, at FieldRoutine_MapUnload's start (field-unload)
void PaperWhite2_FollowingUnload(GameSystem *gsys, Field *field);
// FieldRenderPhase2_Fieldmap's draws of the actors, the wild effects (the grass) and the effects (the shadows)
// (field-actor-billboard-draw, field-terrain-billboard-draw, field-billboard-draw)
void PaperWhite2_FollowingDraw(BillboardActorSys *system, G3DCamera *camera, G3DLight *lights);
void PaperWhite2_FollowingTerrainDraw(BillboardActorSys *system, G3DCamera *camera, G3DLight *lights);
void PaperWhite2_FollowingEffectsDraw(BillboardActorSys *system, G3DCamera *camera, G3DLight *lights);
// Whether the player's D-pad waits while the follower is recalled into its ball (field-player-recall-direction-gate)
BOOL PaperWhite2_FollowingHoldsPlayer(void);
// In fieldmap_event.c, after the field's own event checks on a grid and on rails, given the event they found: the
// scene notes a menu that the grid's checks opened, and with no event, A in front of the follower talks to it, which on
// a grid counts as a script called (follower-grid-event, follower-rail-event)
GameEvent *PaperWhite2_FollowingGridEvent(GameSystem *gsys, Field *field, GameEvent *event, BOOL *scriptCalled,
                                          BOOL menuOpened);
GameEvent *PaperWhite2_FollowingRailEvent(GameSystem *gsys, Field *field, GameEvent *event);

// Whether the follower's tile is in the shade, for its light
BOOL FollowingField_IsShaded(void);
// Whether this frame is the first that draws the follower's body, which the effects wait out
BOOL FollowingField_IsFirstBody(void);
// The species of the Pokémon that follows the player, or 0 with none (the debug menu's Info)
u16 PaperWhite2_FollowingGetSpecies(void);

#endif // PAPERWHITE2_FOLLOWING_FIELD_H
