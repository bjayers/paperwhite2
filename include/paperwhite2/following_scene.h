#ifndef PAPERWHITE2_FOLLOWING_SCENE_H
#define PAPERWHITE2_FOLLOWING_SCENE_H

#include "types.h"
#include "nitro/fx.h"
#include "paperwhite2/following.h"
#include "paperwhite2/following_events.h"
#include "struct_decls.h"

// Paper White 2: the Following Pokémon's scene (src/paperwhite2/ov036/paperwhite2_following_scene.c): during an event
// the follower waits where it is, and is recalled only when the event needs its place; a fade keeps its pose for the
// field to put it back; the menu's and the battle's markers, and the actors on the follower's way. It observes the
// events bridge (following_events.h) and never holds an event (docs/paperwhite2/design/following-rewrite.md)

// What the poll says of the running event: nothing, the follower waits, the follower was recalled; or
// FOLLOWING_SCENE_REFRESH when the event has just ended, and FOLLOWING_SCENE_INVALID when the field changed
enum {
    FOLLOWING_SCENE_NONE,
    FOLLOWING_SCENE_PAUSED,
    FOLLOWING_SCENE_RECALLED,
    FOLLOWING_SCENE_REFRESH = 4,
    FOLLOWING_SCENE_INVALID = 8,
};

// Attaches the scene to system's field for follower and its generation, and binds the events bridge; recall removes
// the follower. FALSE when the bridge can't be bound
BOOL FollowingScene_Attach(MMSys *system, Follower *follower, u32 generation, void (*recall)(void));
void FollowingScene_Detach(void);
void FollowingScene_SetPlayer(FieldActor *player);
u32 FollowingScene_Poll(void);
// Whether a fade keeps the follower: a battle it leads into, or the event it was just put back in from its restore
BOOL FollowingScene_KeepsFade(void);
// A fade during an event hides the follower: its pose, the player's and the zone are kept as the restore token, which
// the field takes back on this field when the event ends or on the next field (FollowingScene_TakeRestore)
void FollowingScene_PreserveForFade(void);
// Whether a local single battle with the follower in front is starting, which carries the follower into its opening
BOOL FollowingScene_IsBattleEntry(void);
// Takes the restore token that a fade kept: FALSE when there is none
BOOL FollowingScene_TakeRestore(FollowingRestore *restore);
// The follower was put back (from the restore token) or placed (on a return) while the scene waits: it waits until
// the events end, then goes on in state
void FollowingScene_PauseAs(FollowingState state);
BOOL FollowingScene_IsMenuActive(void);
// Whether the follower was out, as its body or its resting ball, when the running events began
BOOL FollowingScene_WasOut(void);
// The field just attached came back from a menu's application or a battle on the tile it left, so the follower is
// placed and waits through the events running now. FALSE when an application handed the menu a field move, an item's
// event or a script to run next
BOOL FollowingScene_BeginReturn(void);
// Notes event, the menu that the field's checks opened, as the menu's
void FollowingScene_MarkMenu(GameEvent *event);
// Whether no other actor stands on target or is stepping onto it, before the follower steps there
BOOL FollowingScene_IsStepClear(FieldActor *follower, const VecFx32 *target);

#endif // PAPERWHITE2_FOLLOWING_SCENE_H
