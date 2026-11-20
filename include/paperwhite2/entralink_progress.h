#ifndef PAPERWHITE2_ENTRALINK_PROGRESS_H
#define PAPERWHITE2_ENTRALINK_PROGRESS_H

#include "types.h"
#include "struct_decls.h"

// Paper White 2: the Entralink roguelike's progress in the save, which every run adds to: the battles won and the
// enemies caught at least once, by the progress ids of res/paperwhite2/entralink/rooms/, and the runs finished. It
// takes the place of the Entree Forest's Pokémon in the Symbol block (SAVE_BLOCK_SYMBOL, 0x850 bytes; the forest is the
// run now), with the block's size and place kept, so the save's layout is the same and old saves load; the forest's
// old code is given a block of its own in RAM instead (getAreaNPCData). The save's own CRC of the block covers it,
// with no encryption or checksum of its own. A block without the magic, an old save's forest data, is cleared to an
// empty progress the first time it is read, which reaches the card with the next save. Code in ARM9 main
// (src/paperwhite2/main/paperwhite2_entralink_progress.c), since the save's table and the battle's catches reach it;
// docs/paperwhite2/design/entralink-roguelike-prototype.md, Step 3, has the layout

// The bits of each kind, which the room format's progress ids index
#define ENTRALINK_PROGRESS_BATTLES_MAX 1024
#define ENTRALINK_PROGRESS_CATCHES_MAX 512

// The Reserve Box's slots in the block (phase 7); run.json's reserve_slots is how many the hub offers
#define ENTRALINK_RESERVE_MAX 30

#define ENTRALINK_PROGRESS_MAGIC 0x45325750 // "PW2E"
#define ENTRALINK_PROGRESS_VERSION 1

typedef struct {
    // ENTRALINK_PROGRESS_MAGIC once the block is the progress
    u32 magic;   // 0x00
    u16 version; // 0x04
    // The runs finished (the final room beaten), at most 0xffff
    u16 runsCompleted; // 0x06
    // A bit for each battle won at least once, by its progress id
    u8 battlesWon[ENTRALINK_PROGRESS_BATTLES_MAX / 8]; // 0x08
    // A bit for each enemy caught at least once, by its progress id
    u8 caught[ENTRALINK_PROGRESS_CATCHES_MAX / 8]; // 0x88
    // The Reserve Box (phase 7, paperwhite2/entralink_reserve.h): a bit for each slot that holds a Pokémon, and each
    // slot's Pokémon by its PID, which the PC boxes are searched for whenever the box is used: live links to box
    // Pokémon, not copies. Zero in a block of before it, an empty box
    u32 reserveSlots;                       // 0xc8
    u32 reservePids[ENTRALINK_RESERVE_MAX]; // 0xcc
    // Free for the roguelike's later saves (a mid-run save, unlocks), zero
    u8 reserved[0x850 - 0x144]; // 0x144
} EntralinkProgress;            // 0x850, the Symbol block's size

// The save table's size and initial state of the block (save_table.c)
u32 EntralinkProgress_GetSize(void);
void EntralinkProgress_Init(EntralinkProgress *progress);
// The save's progress, cleared to an empty one if the block holds anything else
EntralinkProgress *EntralinkProgress_Get(SaveControl *save);
BOOL EntralinkProgress_IsBattleWon(EntralinkProgress *progress, u32 progressId);
void EntralinkProgress_SetBattleWon(EntralinkProgress *progress, u32 progressId);
BOOL EntralinkProgress_IsCaught(EntralinkProgress *progress, u32 progressId);
void EntralinkProgress_SetCaught(EntralinkProgress *progress, u32 progressId);
// Whether a run was ever finished, and counting one more
BOOL EntralinkProgress_IsRunCompleted(EntralinkProgress *progress);
void EntralinkProgress_AddRunCompleted(EntralinkProgress *progress);
// The block that the Entree Forest's original code (symbol_save.c, symbol_map.c, the Game Sync) reads and writes in
// place of the save's: an empty forest in RAM, so none of it touches the progress
AreaNPCSave *EntralinkProgress_GetOldForestBlock(void);

#endif // PAPERWHITE2_ENTRALINK_PROGRESS_H
