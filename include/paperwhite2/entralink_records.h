#ifndef PAPERWHITE2_ENTRALINK_RECORDS_H
#define PAPERWHITE2_ENTRALINK_RECORDS_H

#include "types.h"
#include "paperwhite2/entralink_buffs.h"
#include "paperwhite2/entralink_progress.h"
#include "struct_decls.h"

// Paper White 2: the Entralink roguelike's records, saved in the progress block (paperwhite2/entralink_progress.h,
// which has their layout): the runs started and won and their streaks, the deepest place reached, the Dream Shards
// earned, the biggest hit, the fewest turns of a run won and its team (the hall of fame); each room entered and done,
// by the room's record id; each boss's times beaten and fewest turns; the Nightmare codex (the forest's own species
// and special forms, met, beaten and caught); and the buff compendium (each card offered and taken). The run gathers
// what it can in its state and its end saves it (EntralinkRecords_EndRun); the rest is saved as it happens. All in RAM
// until the game is next saved, like the rest of the block. Code in overlay 12, beside the run;
// docs/paperwhite2/design/entralink-roguelike-prototype.md, "Records", has the details

// A codex key, as the save holds it: a species (10 bits) and a form
#define ENTRALINK_RECORDS_CODEX_KEY(species, form) ((species) | (form) << 10)
#define ENTRALINK_RECORDS_CODEX_SPECIES(key) ((key) & 0x3ff)
#define ENTRALINK_RECORDS_CODEX_FORM(key) ((key) >> 10)
// An entry of the codex's table (ENTRALINK_RECORDS_CODEX, generated from records.json and the species' data) is a key
// with this bit for a special form, counted alone; an entry without it is a Nightmare species, counted in every form
// under form 0's key
#define ENTRALINK_RECORDS_CODEX_SPECIAL 0x8000
// No record id: a template's or a random room's
#define ENTRALINK_RECORDS_ROOM_NONE 0xff

// What a codex enemy did (EntralinkRecords_AddEnemy)
#define ENTRALINK_RECORDS_MET 0
#define ENTRALINK_RECORDS_BEATEN 1
#define ENTRALINK_RECORDS_CAUGHT 2

// A run started
void EntralinkRecords_StartRun(GameData *gameData);
// A room of the run entered, and whether it was done (record ids of ENTRALINK_RECORDS_ROOM_NONE are no room's)
void EntralinkRecords_SetRoom(GameData *gameData, u32 recordId, BOOL beaten);
// A battle's enemy met as it starts, or beaten or caught as it is won; only the codex's species count
void EntralinkRecords_AddEnemy(GameData *gameData, u32 species, u32 form, u32 what);
// A boss or the final room beaten, its battle in this many turns
void EntralinkRecords_BeatBoss(GameData *gameData, u32 recordId, u32 turns);
// A list of cards shown, and a card taken
void EntralinkRecords_SeeCards(GameData *gameData, const EntralinkCard *cards, u32 count);
void EntralinkRecords_TakeCard(GameData *gameData, const EntralinkCard *card);
// At the run's end, before its state and party go: the deepest place (the run's room, in this round), the Shards it
// gave, its biggest hit, and a win's streak, turns and hall of fame, or the streak's end
void EntralinkRecords_EndRun(GameData *gameData, u32 round, u32 shards);
// The debug menu's reset: every record cleared (the progress itself, its battles won, catches and runs, stays)
void EntralinkRecords_Clear(GameData *gameData);
// The codex's species and forms (ENTRALINK_RECORDS_CODEX's), for the debug menu's readout
u32 EntralinkRecords_GetCodexCount(void);
// Whether every species and special form of the codex was met (the White Tree's fill_codex)
BOOL EntralinkRecords_IsCodexFull(EntralinkProgress *progress);
// A species' special form (records.json's special_forms; the form NPC), or 0 if it has none
u32 EntralinkRecords_GetSpecialForm(u32 species);

#endif // PAPERWHITE2_ENTRALINK_RECORDS_H
