#ifndef PAPERWHITE2_FOLLOWING_SCENE_H
#define PAPERWHITE2_FOLLOWING_SCENE_H

#include "types.h"
#include "nitro/fx.h"
#include "paperwhite2/following.h"
#include "paperwhite2/following_events.h"
#include "struct_decls.h"

// Paper White 2: the Following Pokémon's scene policy (src/paperwhite2/ov036/paperwhite2_following_scene.c), ported
// from Pokeweb's scene.c: which events and script commands keep the follower (it waits) and which recall it, the PC's
// restore, the menu's and the battle's markers, and the actors on the follower's way. It observes the events bridge
// (following_events.h); its lists of safe commands and sound events are generated from
// res/paperwhite2/following/event-policy.json and audio-event-policy.json (docs/paperwhite2/following-pokemon.md)

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
// Whether a PC's storage fades the screen, which keeps the follower through the fade
BOOL FollowingScene_IsPcFade(void);
// Whether a local single battle with the follower in front is starting, which carries the follower into its opening
BOOL FollowingScene_IsBattleEntry(void);
// Takes the PC's restore token for the field just attached: FALSE when there is none
BOOL FollowingScene_TakeRestore(FollowingRestore *restore);
// The follower was put back from the restore token: it waits until the PC's event ends
void FollowingScene_Restored(void);
BOOL FollowingScene_IsMenuActive(void);
// Notes event, the menu that the field's checks opened, as the menu's
void FollowingScene_MarkMenu(GameEvent *event);
// Whether no other actor stands on target or is stepping onto it, before the follower steps there
BOOL FollowingScene_IsStepClear(FieldActor *follower, const VecFx32 *target);

#endif // PAPERWHITE2_FOLLOWING_SCENE_H
