#ifndef PAPERWHITE2_FLAG_WATCH_H
#define PAPERWHITE2_FLAG_WATCH_H

#include "types.h"
#include "struct_decls.h"
#include "system/vm.h"

// Paper White 2: the debug menu's flag watch (src/paperwhite2/main/paperwhite2_flag_watch.c). Started on a flag, it
// keeps a copy of the save's flags and variables and compares the save with it at checkpoints: three each frame
// (GSYS_Update), after each script command (VM_Run), and at each step of a zone's init (FieldScript_CallOnZoneInit).
// Each time the watched flag changes it logs where, with the other flags and variables that changed since the last
// checkpoint, so a flag that something clears can be traced to its frame, step or script command. In RAM; a reset
// stops it. Under PAPERWHITE2_DEBUG_MENU

#ifdef PAPERWHITE2_DEBUG_MENU
// The checkpoints
enum {
    // The frame's start, before the events run
    FLAG_WATCH_STAGE_FRAME,
    // After the frame's events (map changes, script calls, battles' events)
    FLAG_WATCH_STAGE_EVENTS,
    // After the frame's processes (the field, a battle, a menu)
    FLAG_WATCH_STAGE_PROCESSES,
    // After a script command
    FLAG_WATCH_STAGE_COMMAND,
    // A zone's init: at its start, after the map's own flags and variables reset, after the conditions' and the NPC
    // spawns' (paperwhite2_spawns.c) steps, and after its init scripts
    FLAG_WATCH_STAGE_ZONE_INIT,
    FLAG_WATCH_STAGE_ZONE_LOCAL_RESET,
    FLAG_WATCH_STAGE_ZONE_CONDITIONS,
    FLAG_WATCH_STAGE_ZONE_SPAWNS,
    FLAG_WATCH_STAGE_ZONE_INIT_SCRIPTS,
    FLAG_WATCH_STAGE_COUNT,
};

// The log's size: the first changes are the ones wanted
#define FLAG_WATCH_LOG_SIZE 24
// A script ID the watch doesn't know (a VM that no field script made)
#define FLAG_WATCH_NO_SCRIPT 0xffff

typedef struct {
    u8 stage;
    // The flag's state after the change
    u8 on;
    u16 zone;
    // The script and its command, for FLAG_WATCH_STAGE_COMMAND
    u16 script;
    u16 command;
    // The command's place: its offset in the script's file (its opcode's)
    u32 offset;
    // The frames since the watch began
    u32 frame;
    // The other flags and variables that changed with it, since the last checkpoint: their counts, and the lowest
    // and highest of the flags, and the lowest of the variables
    u16 otherFlags;
    u16 firstFlag;
    u16 lastFlag;
    u16 otherVars;
    u16 firstVar;
} FlagWatchEntry;

// Starts watching a flag (0 stops), with an empty log
void PaperWhite2_FlagWatch_Start(GameData *gameData, u16 flag);
u16 PaperWhite2_FlagWatch_GetFlag(void);
u32 PaperWhite2_FlagWatch_GetCount(void);
const FlagWatchEntry *PaperWhite2_FlagWatch_GetEntry(u32 index);
// A checkpoint of the game's own; the frame's first counts the frames
void PaperWhite2_FlagWatch_Check(GameData *gameData, u32 stage);
// The script a field script's VM runs, from FieldScript_CreateVM, and the checkpoint after each of its commands
void PaperWhite2_FlagWatch_OnScriptVM(VM *vm, u16 script);
void PaperWhite2_FlagWatch_OnCommand(VM *vm, u16 command, const u8 *at);
void PaperWhite2_FlagWatch_OnVMFree(VM *vm);
#endif

#endif // PAPERWHITE2_FLAG_WATCH_H
