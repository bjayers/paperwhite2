#include "types.h"
#include "nitro/mi.h"
#include "paperwhite2/following_resident.h"

// Paper White 2: the Following Pokémon's resident part, ported from Pokeweb's resident_events.c. Main calls the
// field's hooks only while the field has bound them, so nothing here points into an overlay that is gone

typedef struct FollowingTokens {
    u8 restore[FOLLOWING_TOKEN_RESTORE_SIZE];
    u8 mount[FOLLOWING_TOKEN_MOUNT_SIZE];
    FollowingSummon summon;
    // A bit for each valid token, by kind
    u32 valid;
} FollowingTokens;

static FollowingEventHooks sFollowingHooks;
static FollowingTokens sFollowingTokens = {
    { 0 },
    { 0 },
    { FOLLOWING_SUMMON_BOOT, 0, 0, 0 },
    1 << (FOLLOWING_TOKEN_SUMMON - 1),
};

static u8 *GetToken(u32 kind, u32 size) {
    if (kind == FOLLOWING_TOKEN_RESTORE && size == FOLLOWING_TOKEN_RESTORE_SIZE) {
        return sFollowingTokens.restore;
    }
    if (kind == FOLLOWING_TOKEN_MOUNT && size == FOLLOWING_TOKEN_MOUNT_SIZE) {
        return sFollowingTokens.mount;
    }
    if (kind == FOLLOWING_TOKEN_SUMMON && size == FOLLOWING_TOKEN_SUMMON_SIZE) {
        return (u8 *)&sFollowingTokens.summon;
    }
    return NULL;
}

BOOL PaperWhite2_FollowingTokenStore(u32 kind, const void *source, u32 size) {
    u8 *token = GetToken(kind, size);

    if (token == NULL || source == NULL) {
        return FALSE;
    }
    MI_CpuCopy8(source, token, size);
    sFollowingTokens.valid |= 1 << (kind - 1);
    return TRUE;
}

BOOL PaperWhite2_FollowingTokenConsume(u32 kind, void *destination, u32 size) {
    u8 *token = GetToken(kind, size);

    if (token == NULL || destination == NULL || !(sFollowingTokens.valid & (1 << (kind - 1)))) {
        return FALSE;
    }
    MI_CpuCopy8(token, destination, size);
    sFollowingTokens.valid &= ~(1 << (kind - 1));
    return TRUE;
}

void PaperWhite2_FollowingTokenDiscard(u32 kind) {
    if (kind >= FOLLOWING_TOKEN_RESTORE && kind <= FOLLOWING_TOKEN_SUMMON) {
        sFollowingTokens.valid &= ~(1 << (kind - 1));
    }
}

void PaperWhite2_FollowingBindEventHooks(const FollowingEventHooks *hooks) {
    sFollowingHooks = *hooks;
}

void PaperWhite2_FollowingClearEventHooks(void) {
    MI_CpuFill8(&sFollowingHooks, 0, sizeof(sFollowingHooks));
}

void PaperWhite2_FollowingOnOpcode(VM *vm, u16 cmd) {
    if (sFollowingHooks.opcode != NULL) {
        sFollowingHooks.opcode(vm, cmd);
    }
}

BOOL PaperWhite2_FollowingHoldEvent(GameEvent *event, GameSystem *gsys, GameEventCallback callback) {
    return sFollowingHooks.callback != NULL && sFollowingHooks.callback(event, gsys, callback);
}

void PaperWhite2_FollowingOnEventFree(GameEvent *event, GameSystem *gsys) {
    if (sFollowingHooks.freeEvent != NULL) {
        sFollowingHooks.freeEvent(event, gsys);
    }
}

void PaperWhite2_FollowingOnVmFree(VM *vm) {
    if (sFollowingHooks.freeVm != NULL) {
        sFollowingHooks.freeVm(vm);
    }
}
