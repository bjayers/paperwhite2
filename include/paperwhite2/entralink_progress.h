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
// docs/paperwhite2/design/entralink-roguelike-prototype.md, Step 3, has the layout, and "Records" the records' part

// The bits of each kind, which the room format's progress ids index
#define ENTRALINK_PROGRESS_BATTLES_MAX 1024
#define ENTRALINK_PROGRESS_CATCHES_MAX 512

// The Reserve Box's slots in the block (phase 7); run.json's reserve_slots is how many the hub offers
#define ENTRALINK_RESERVE_MAX 30

// The hub shop's bought picks the block holds (section 19 of entralink-buffs.md: run.json's total_cap is at most this)
#define ENTRALINK_SHOP_PICKS_MAX 32
// The most Dream Shards saved
#define ENTRALINK_SHARDS_MAX 99999

// A card's picks bought in the hub shop: the card by its key (EntralinkBuff's key, 0 for a free entry) and how many
typedef struct {
    u16 key;
    u8 count;
    u8 unused;
} EntralinkShopPick;

// The records' entries the block holds: rooms by their record ids, bosses and final rooms, the Nightmare codex's
// species and forms, the buff compendium's cards, and the hall of fame's team and golds
#define ENTRALINK_RECORDS_ROOMS_MAX 128
#define ENTRALINK_RECORDS_BOSSES_MAX 16
#define ENTRALINK_RECORDS_CODEX_MAX 64
#define ENTRALINK_RECORDS_CARDS_MAX 128
#define ENTRALINK_RECORDS_HALL_MONS 6
#define ENTRALINK_RECORDS_HALL_GOLDS 5
// A hall of fame Pokémon's nickname, with its end
#define ENTRALINK_RECORDS_NICKNAME_LENGTH 11
// An entry's flags: a codex species met or a card offered, and a codex species caught or a card taken
#define ENTRALINK_RECORD_SEEN 1
#define ENTRALINK_RECORD_TAKEN 2

// A record's entry: its key (0 for a free entry), ENTRALINK_RECORD_* flags and a count (at most 255)
typedef struct {
    u16 key;
    u8 flags;
    u8 count;
} EntralinkRecordEntry;

// A hit of the team's on a foe: its full damage (capped as the damage numbers show it), the Pokémon (species and
// form) and move, and whether it was a critical hit
typedef struct {
    u16 damage;
    u16 species;
    u16 move;
    u8 form;
    u8 critical;
} EntralinkRecordHit;

// A Pokémon of the hall of fame's team (none: species 0)
typedef struct {
    u16 species;
    u16 item;
    u8 form;
    u8 shiny;
    u16 nickname[ENTRALINK_RECORDS_NICKNAME_LENGTH];
} EntralinkHallMon;

// A gold the hall of fame's run held: the card's key (0: none) and its rank
typedef struct {
    u16 key;
    u8 rank;
    u8 unused;
} EntralinkHallGold;

// The records (paperwhite2/entralink_records.h), zero in a block of before them: none
typedef struct {
    // The runs started, the current and best streaks of runs won (a run that ends any other way ends the streak),
    // the fewest turns of a run won (0 before the first win), and the deepest place reached (the run's room, from 1)
    // and its round
    u16 runsStarted;   // 0x0
    u16 winStreak;     // 0x2
    u16 bestWinStreak; // 0x4
    u16 bestWinTurns;  // 0x6
    u8 deepestPlace;   // 0x8
    u8 deepestRound;   // 0x9
    u16 unused;        // 0xa
    // Every Dream Shard runs have given, whatever was spent since
    u32 shardsEarned; // 0xc
    // The biggest hit of the team's ever
    EntralinkRecordHit bestHit; // 0x10
    // A bit for each room entered and each room done, by the room's record id (its file's progress_id)
    u8 roomsDiscovered[ENTRALINK_RECORDS_ROOMS_MAX / 8]; // 0x18
    u8 roomsBeaten[ENTRALINK_RECORDS_ROOMS_MAX / 8];     // 0x28
    // The bosses and final rooms beaten: an entry each (the room's record id + 1, the times beaten) and the fewest
    // turns of its battle won
    EntralinkRecordEntry bosses[ENTRALINK_RECORDS_BOSSES_MAX]; // 0x38
    u16 bossBestTurns[ENTRALINK_RECORDS_BOSSES_MAX];           // 0x78
    // The Nightmare codex: an entry for each of its species met (ENTRALINK_RECORD_SEEN), caught
    // (ENTRALINK_RECORD_TAKEN) and the times beaten, by its key (species and form, ENTRALINK_RECORDS_CODEX_KEY)
    EntralinkRecordEntry codex[ENTRALINK_RECORDS_CODEX_MAX]; // 0x98
    // The buff compendium: an entry for each card offered (ENTRALINK_RECORD_SEEN), taken (ENTRALINK_RECORD_TAKEN)
    // and the times taken, by its key (EntralinkBuff's)
    EntralinkRecordEntry cards[ENTRALINK_RECORDS_CARDS_MAX]; // 0x198
    // The hall of fame: the team of the run won in the fewest turns (bestWinTurns; the first such run on a tie), and
    // the golds it held at its end, by their keys
    EntralinkHallMon hallMons[ENTRALINK_RECORDS_HALL_MONS];    // 0x398
    EntralinkHallGold hallGolds[ENTRALINK_RECORDS_HALL_GOLDS]; // 0x440
} EntralinkRecords;                                            // 0x454

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
    // The hub shop (paperwhite2/entralink_hub_shop.h): the Dream Shards held, those spent (which a reset gives back)
    // and the picks bought. Zero in a block of before it: none
    u32 shards;                                            // 0x144
    u32 shardsSpent;                                       // 0x148
    EntralinkShopPick shopPicks[ENTRALINK_SHOP_PICKS_MAX]; // 0x14c
    // The records (paperwhite2/entralink_records.h), zero in a block of before them: none
    EntralinkRecords records; // 0x1cc
    // The hub's fog, which the fog NPC sets (ENTRALINK_HUB_FOG_*, paperwhite2/entralink_ranks.h); zero in a block of
    // before it: none
    u8 hubFog; // 0x620
    // The White Tree's milestones that the debug menu's "Entree White Lv +1" marked as reached, a bit each
    // (ENTREE_MILESTONE_*, paperwhite2/entralink_ranks.h), which the White rank counts with those really reached;
    // cleared with the records (EntralinkRecords_Clear). Zero in a block of before it: none
    u8 debugMilestones; // 0x621
    u8 unused622[2];    // 0x622
    // Free for the roguelike's later saves (unlocks), zero
    u8 reserved[0x850 - 0x624]; // 0x624
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
// The hub's field weather, its fog (hubFog's tint), or WEATHER_NONE: none, or another zone (GetWeatherAll)
u32 EntralinkProgress_GetHubWeather(SaveControl *save, u32 zoneId);

#endif // PAPERWHITE2_ENTRALINK_PROGRESS_H
