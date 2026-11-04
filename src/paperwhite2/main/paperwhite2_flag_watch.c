#include "types.h"
#include "constants/vars.h"
#include "field/player_state.h"
#include "paperwhite2/flag_watch.h"
#include "save/event_work.h"
#include "system/game_data.h"
#include "system/game_system.h"

// Paper White 2: the debug menu's flag watch. See include/paperwhite2/flag_watch.h

#ifdef PAPERWHITE2_DEBUG_MENU
// The field scripts' VMs the watch knows, a few at once (a script, its called scripts, the zone's init scripts)
#define FLAG_WATCH_VM_COUNT 8
#define BITS_PER_BYTE 8

typedef struct {
    VM *vm;
    u16 script;
} FlagWatchVM;

static u16 sFlag;
static u32 sFrame;
static u32 sCount;
static EventWork sCopy;
static FlagWatchEntry sLog[FLAG_WATCH_LOG_SIZE];
static FlagWatchVM sVMs[FLAG_WATCH_VM_COUNT];

static void FlagWatch_Compare(GameData *gameData, u32 stage, VM *vm, u16 command, const u8 *at);

void PaperWhite2_FlagWatch_Start(GameData *gameData, u16 flag) {
    sFlag = flag;
    sFrame = 0;
    sCount = 0;
    sCopy = *GameData_GetEventWork(gameData);
}

u16 PaperWhite2_FlagWatch_GetFlag(void) {
    return sFlag;
}

u32 PaperWhite2_FlagWatch_GetCount(void) {
    return sCount;
}

const FlagWatchEntry *PaperWhite2_FlagWatch_GetEntry(u32 index) {
    return index < sCount ? &sLog[index] : NULL;
}

void PaperWhite2_FlagWatch_Check(GameData *gameData, u32 stage) {
    if (sFlag == 0) {
        return;
    }
    if (stage == FLAG_WATCH_STAGE_FRAME) {
        sFrame++;
    }
    FlagWatch_Compare(gameData, stage, NULL, 0, NULL);
}

void PaperWhite2_FlagWatch_OnScriptVM(VM *vm, u16 script) {
    u32 i;

    for (i = 0; i < FLAG_WATCH_VM_COUNT; i++) {
        if (sVMs[i].vm == NULL || sVMs[i].vm == vm) {
            sVMs[i].vm = vm;
            sVMs[i].script = script;
            return;
        }
    }
}

void PaperWhite2_FlagWatch_OnVMFree(VM *vm) {
    u32 i;

    for (i = 0; i < FLAG_WATCH_VM_COUNT; i++) {
        if (sVMs[i].vm == vm) {
            sVMs[i].vm = NULL;
        }
    }
}

void PaperWhite2_FlagWatch_OnCommand(VM *vm, u16 command, const u8 *at) {
    if (sFlag == 0 || g_GameSystem == NULL) {
        return;
    }
    FlagWatch_Compare(GSYS_GetGameData(g_GameSystem), FLAG_WATCH_STAGE_COMMAND, vm, command, at);
}

// Compares the save's flags and variables with the copy and takes them as the copy; a change of the watched flag is
// logged, with the others that changed with it, and for a command where it began (at)
static void FlagWatch_Compare(GameData *gameData, u32 stage, VM *vm, u16 command, const u8 *at) {
    EventWork *now = GameData_GetEventWork(gameData);
    FlagWatchEntry entry;
    u32 i;
    u32 bit;
    BOOL was;
    BOOL is;

    was = (sCopy.flags[sFlag / BITS_PER_BYTE] >> (sFlag % BITS_PER_BYTE)) & 1;
    is = (now->flags[sFlag / BITS_PER_BYTE] >> (sFlag % BITS_PER_BYTE)) & 1;
    if (was != is && sCount < FLAG_WATCH_LOG_SIZE) {
        entry.stage = stage;
        entry.on = is;
        entry.zone = PlayerState_GetZoneID(GameData_GetPlayerState(gameData));
        entry.script = FLAG_WATCH_NO_SCRIPT;
        entry.command = command;
        entry.offset = 0;
        entry.frame = sFrame;
        if (vm != NULL) {
            for (i = 0; i < FLAG_WATCH_VM_COUNT; i++) {
                if (sVMs[i].vm == vm) {
                    entry.script = sVMs[i].script;
                    entry.offset = (u32)(at - (const u8 *)vm->unk38);
                }
            }
        }
        entry.otherFlags = 0;
        entry.firstFlag = 0;
        entry.lastFlag = 0;
        for (i = 0; i < sizeof(now->flags); i++) {
            u8 changed = now->flags[i] ^ sCopy.flags[i];

            for (bit = 0; changed != 0 && bit < BITS_PER_BYTE; bit++) {
                u32 flag = i * BITS_PER_BYTE + bit;

                if (!((changed >> bit) & 1) || flag == sFlag) {
                    continue;
                }
                if (entry.otherFlags == 0) {
                    entry.firstFlag = flag;
                }
                entry.lastFlag = flag;
                entry.otherFlags++;
            }
        }
        entry.otherVars = 0;
        entry.firstVar = 0;
        for (i = 0; i < EVENT_WORK_COUNT; i++) {
            if (now->works[i] != sCopy.works[i]) {
                if (entry.otherVars == 0) {
                    entry.firstVar = EVENT_WORK_0x4000 + i;
                }
                entry.otherVars++;
            }
        }
        sLog[sCount++] = entry;
    }
    sCopy = *now;
}
#endif
