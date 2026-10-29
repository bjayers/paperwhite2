#ifndef PAPERWHITE2_FOLLOWING_RESIDENT_H
#define PAPERWHITE2_FOLLOWING_RESIDENT_H

#include "types.h"
#include "struct_decls.h"
#include "system/game_event.h"
#include "system/vm.h"

// Paper White 2: the Following Pokémon's state and hooks that outlive the field's overlays, in ARM9 main
// (src/paperwhite2/main/paperwhite2_following_resident.c), ported from Pokeweb's resident_events.c
// (docs/paperwhite2/following-pokemon.md)

// The tokens: a few bytes of the follower's state that a menu, a PC or a battle carries from one field to the next
enum {
    FOLLOWING_TOKEN_RESTORE = 1,
    FOLLOWING_TOKEN_MOUNT,
    FOLLOWING_TOKEN_SUMMON,
};

// Each token's size, which a store or consume must give
#define FOLLOWING_TOKEN_RESTORE_SIZE 60
#define FOLLOWING_TOKEN_MOUNT_SIZE 44
#define FOLLOWING_TOKEN_SUMMON_SIZE 16

// Why the next field places the follower at once: the summon token, valid from boot as FOLLOWING_SUMMON_BOOT
typedef struct FollowingSummon {
    u32 source;
    u32 zone;
    s32 x;
    s32 z;
} FollowingSummon;

enum {
    FOLLOWING_SUMMON_BOOT = 1,
    FOLLOWING_SUMMON_MENU = 3,
    FOLLOWING_SUMMON_BATTLE = 5,
};

// What the field's follower code watches, set while the field is loaded: each is called before the game does
// what it names
typedef struct FollowingEventHooks {
    // A script command's opcode, just read
    void (*opcode)(VM *vm, u16 cmd);
    // An event's callback is about to run: TRUE keeps the event waiting a frame instead
    BOOL (*callback)(GameEvent *event, GameSystem *gsys, GameEventCallback callback);
    // An event is about to be freed
    void (*freeEvent)(GameEvent *event, GameSystem *gsys);
    // A script's machine is about to be freed
    void (*freeVm)(VM *vm);
} FollowingEventHooks;

BOOL PaperWhite2_FollowingTokenStore(u32 kind, const void *source, u32 size);
BOOL PaperWhite2_FollowingTokenConsume(u32 kind, void *destination, u32 size);
void PaperWhite2_FollowingTokenDiscard(u32 kind);
void PaperWhite2_FollowingBindEventHooks(const FollowingEventHooks *hooks);
void PaperWhite2_FollowingClearEventHooks(void);

// The hooks' sites, in vm.c and game_event.c
void PaperWhite2_FollowingOnOpcode(VM *vm, u16 cmd);
BOOL PaperWhite2_FollowingHoldEvent(GameEvent *event, GameSystem *gsys, GameEventCallback callback);
void PaperWhite2_FollowingOnEventFree(GameEvent *event, GameSystem *gsys);
void PaperWhite2_FollowingOnVmFree(VM *vm);

#endif // PAPERWHITE2_FOLLOWING_RESIDENT_H
