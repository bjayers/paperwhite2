#ifndef PAPERWHITE2_FOLLOWING_HOOKS_H
#define PAPERWHITE2_FOLLOWING_HOOKS_H

#include "types.h"
#include "gfl/heap.h"
#include "nitro/fx.h"
#include "paperwhite2/following.h"
#include "struct_decls.h"
#include "system/game_system.h"

// Paper White 2: what the Following Pokémon's field code (src/paperwhite2/ov036/paperwhite2_following_field.c) asks
// of the parts of Pokeweb's runtime that the port's step 4 brings: the ball effects (effects.c), talking to the
// follower (interaction.c), the scene policy (scene.c) and the events bridge (events.c). Until then each is a stub
// that keeps the base behavior safe: no ball, so the follower just disappears where the original recalls it and
// appears where it sends it out; no talk; and any running event is unsafe, so it recalls the follower
// (docs/paperwhite2/following-pokemon.md, "Step 3")

// What the scene's poll says of the running event: nothing, the follower waits, the follower was recalled; with
// FOLLOWING_SCENE_REFRESH when an event has just ended, and FOLLOWING_SCENE_INVALID when the field changed
enum {
    FOLLOWING_SCENE_NONE,
    FOLLOWING_SCENE_PAUSED,
    FOLLOWING_SCENE_RECALLED,
    FOLLOWING_SCENE_REFRESH = 4,
    FOLLOWING_SCENE_INVALID = 8,
};

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

// The ball effects, effects.c. TODO step 4: the ball, the send-out flash and the recall. style-ok: todo
static inline void FollowingEffects_SetResourceCount(u32 count) {
}

static inline void FollowingEffects_Prepare(FieldActor *actor) {
}

static inline void FollowingEffects_Snapshot(FieldActor *actor) {
}

// The send-out: without it the follower just appears
static inline void FollowingEffects_Out(FieldActor *actor) {
}

// The recall: without it the follower just disappears
static inline void FollowingEffects_Recall(FieldActor *actor) {
}

static inline void FollowingEffects_Tick(void) {
}

static inline void FollowingEffects_SetBall(u32 ball) {
}

static inline void FollowingEffects_Cancel(void) {
}

static inline void FollowingEffects_Destroy(void) {
}

static inline void FollowingEffects_Warm(HeapID heapId) {
}

static inline BOOL FollowingEffects_HidesActor(void) {
    return FALSE;
}

// The closed ball's shake and refusal beep where L or R can't switch
static inline void FollowingEffects_Cue(const VecFx32 *at) {
}

static inline void FollowingEffects_RestAt(const VecFx32 *at) {
}

static inline BOOL FollowingEffects_IsResting(void) {
    return FALSE;
}

static inline void FollowingEffects_RestRecall(void) {
}

static inline void FollowingEffects_RestBounce(void) {
}

static inline BOOL FollowingEffects_IsBusy(void) {
    return FALSE;
}

static inline BOOL FollowingEffects_IsRecalling(void) {
    return FALSE;
}

// TRUE, since L and R switch the follower only when its effects are there
static inline BOOL FollowingEffects_IsAvailable(void) {
    return TRUE;
}

static inline void FollowingEffects_SetPlayer(FieldActor *player) {
}

static inline void FollowingEffects_Draw(G3DCamera *camera, G3DLight *lights) {
}

// Talking to the follower, interaction.c. TODO step 4: A in front of it, and its reactions. style-ok: todo
static inline void FollowingTalk_PollInput(void) {
}

static inline BOOL FollowingTalk_IsActive(void) {
    return FALSE;
}

static inline BOOL FollowingTalk_Owns(Field *field) {
    return FALSE;
}

static inline BOOL FollowingTalk_FieldOwns(Field *field) {
    return FALSE;
}

static inline void FollowingTalk_Cancel(void) {
}

static inline void FollowingTalk_Unload(void) {
}

// The scene policy, scene.c: which events keep the follower, which pause it and which recall it, the PC's restore,
// the menu and battle markers, and the actors on the follower's way. TODO step 4: all of it. style-ok: todo
static inline BOOL FollowingScene_Attach(MMSys *system, Follower *follower, u32 generation, void (*recall)(void)) {
    return TRUE;
}

static inline void FollowingScene_Detach(void) {
}

static inline void FollowingScene_SetPlayer(FieldActor *player) {
}

// Any event that runs recalls the follower. The original's poll reads the field it was attached to; the stub is
// given it
static inline u32 FollowingScene_Poll(Field *field) {
    if (field != NULL && GSYS_GetNowEvent(Field_GetGameSystem(field)) != NULL) {
        return FOLLOWING_SCENE_RECALLED;
    }
    return FOLLOWING_SCENE_NONE;
}

static inline BOOL FollowingScene_IsPcFade(void) {
    return FALSE;
}

static inline BOOL FollowingScene_IsBattleEntry(void) {
    return FALSE;
}

static inline BOOL FollowingScene_TakeRestore(FollowingRestore *restore) {
    return FALSE;
}

static inline void FollowingScene_Restored(void) {
}

static inline BOOL FollowingScene_IsMenuActive(void) {
    return FALSE;
}

// Whether no other actor stands on target or is stepping onto it
static inline BOOL FollowingScene_IsStepClear(FieldActor *follower, const VecFx32 *target) {
    return TRUE;
}

// The events bridge, events.c. TODO step 4: the PC's restore token. style-ok: todo
static inline void FollowingEvents_Discard(void) {
}

#endif // PAPERWHITE2_FOLLOWING_HOOKS_H
