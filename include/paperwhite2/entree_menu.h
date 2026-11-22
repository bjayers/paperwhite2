#ifndef PAPERWHITE2_ENTREE_MENU_H
#define PAPERWHITE2_ENTREE_MENU_H

#include "types.h"
#include "app/monolith/monolith_main.h"
#include "gfl/proc.h"
#include "paperwhite2/entralink_buffs.h"
#include "paperwhite2/entralink_progress.h"
#include "paperwhite2/entralink_ranks.h"
#include "paperwhite2/entralink_run.h"
#include "struct_decls.h"

// Paper White 2: the Entree's menu, the Entralink monolith (overlay 143) repurposed for the roguelike's records
// (paperwhite2/entralink_records.h). Examining the Entree in the hub opens it (entralink.s's Script_4). Its screens:
// the menu (Status, Records, the lists, Exit) under the Status screen on top, the White and Black Trees' ranks; a page
// screen of rows (the Status's milestones, the Records); and a list screen (Nightmares, Bosses, Special, Catchable,
// Buffs, Hall of Fame) with the entry under the cursor described on top. monolith_main.c runs them in place of the
// original's (sMonolithScreens). Code in src/paperwhite2/ov143/, which loads only for the monolith;
// docs/paperwhite2/design/entralink-roguelike-prototype.md, "The Entree's menu", has the details

// The screens, in place of MONOLITH_SCREEN_* (the menu stays the first; MONOLITH_SCREEN_EXIT still closes)
#define ENTREE_SCREEN_MENU MONOLITH_SCREEN_MENU
#define ENTREE_SCREEN_PAGES 1
#define ENTREE_SCREEN_LIST 2

// The menu's items, in order: what MonolithState's menuCursor returns to
enum {
    ENTREE_ITEM_STATUS,
    ENTREE_ITEM_RECORDS,
    ENTREE_ITEM_NIGHTMARES,
    ENTREE_ITEM_BOSSES,
    ENTREE_ITEM_SPECIAL,
    ENTREE_ITEM_CATCHABLE,
    ENTREE_ITEM_BUFFS,
    ENTREE_ITEM_HALL_OF_FAME,
    ENTREE_ITEM_EXIT,
    ENTREE_ITEM_COUNT,
};

// The procs of the screens (paperwhite2_entree_menu.c and paperwhite2_entree_lists.c)
extern const GameProcFunctions ENTREE_STATUS_PROC_FUNCTIONS;
extern const GameProcFunctions ENTREE_MENU_PROC_FUNCTIONS;
extern const GameProcFunctions ENTREE_PAGES_PROC_FUNCTIONS;
extern const GameProcFunctions ENTREE_INFO_PROC_FUNCTIONS;
extern const GameProcFunctions ENTREE_LIST_PROC_FUNCTIONS;

// What the screens read (paperwhite2_entree_data.c)

// The save's progress, with the records
EntralinkProgress *Entree_GetProgress(MonolithScreenParam *screen);
// The rooms of rooms/ (those with a record id), and those of them entered and done
u32 Entree_GetRoomCount(void);
// A difficulty tier's name (run.json's tiers, in SCRIPT_TEXT_ENTRALINK_DIALOGUE) into a word, and the highest tier
// whose final room has been beaten, or -1 for none
void Entree_SetTierWord(WordSet *wordSet, u32 word, u32 tier);
s32 Entree_GetHighestTierBeaten(EntralinkProgress *progress);
u32 Entree_CountRooms(const u8 *bits);
// The rooms of rooms/ not yet discovered, by where they can come up as overlay 12's draws give them (the Records'
// rows): counts[rounds] those that come up in rounds (a bit each from round 1's) as a round's room or boss, counts[0]
// the final rooms; rooms that can't come up aren't counted. counts holds ENTREE_ROUND_GROUPS
#define ENTREE_ROUND_GROUPS (1 << ENTRALINK_RUN_ROUNDS_MAX)
void Entree_CountUndiscovered(EntralinkProgress *progress, u8 *counts);

// The run's tables (overlay 143's copies): the rooms (whether one is a room of rooms/, not a template or a random
// room's row), a room's battles, a battle's enemies, an enemy's catch requirements, and the battle of a progress id
u32 Entree_GetRoomTableCount(void);
const EntralinkRoom *Entree_GetRoomEntry(u32 index);
BOOL Entree_IsRoomOfRooms(const EntralinkRoom *room);
const EntralinkBattle *Entree_GetBattle(const EntralinkRoom *room, u32 index);
const EntralinkEnemy *Entree_GetEnemy(const EntralinkBattle *battle, u32 index);
// The enemy table itself, for a list of every enemy
u32 Entree_GetEnemyTableCount(void);
const EntralinkEnemy *Entree_GetEnemyEntry(u32 index);
u32 Entree_GetRequirement(const EntralinkEnemy *enemy, u32 index);
const EntralinkBattle *Entree_FindBattle(u32 progressId);
// The codex's entries (ENTRALINK_RECORDS_CODEX's: a Nightmare species, or a special form with
// ENTRALINK_RECORDS_CODEX_SPECIAL), and an entry's record (NULL: never met)
u32 Entree_GetCodexCount(void);
u32 Entree_GetCodexEntry(u32 index);
const EntralinkRecordEntry *Entree_FindCodexRecord(EntralinkProgress *progress, u32 entry);
// The buffs' catalogue
u32 Entree_GetBuffCount(void);
const EntralinkBuff *Entree_GetBuff(u32 index);
// A record's entry by its key, or NULL
const EntralinkRecordEntry *Entree_FindRecord(const EntralinkRecordEntry *entries, u32 max, u32 key);

#endif // PAPERWHITE2_ENTREE_MENU_H
