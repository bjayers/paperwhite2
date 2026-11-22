#include "types.h"
#include "constants/pokemon.h"
#include "gfl/std.h"
#include "nitro/mi.h"
#include "paperwhite2/entralink_buffs.h"
#include "paperwhite2/entralink_progress.h"
#include "paperwhite2/entralink_records.h"
#include "paperwhite2/entralink_records_config.h"
#include "paperwhite2/entralink_run_state.h"
#include "pml/poke_party.h"
#include "system/game_data.h"

// Paper White 2: the Entralink roguelike's records, in overlay 12 beside the run. See
// include/paperwhite2/entralink_records.h

// A count's highest value, and the character that ends a string
#define COUNT_MAX 0xff
#define STRING_END 0xffff

static const u16 sCodex[ENTRALINK_RECORDS_CODEX_COUNT] = ENTRALINK_RECORDS_CODEX;

static EntralinkRecords *EntralinkRecords_Get(GameData *gameData) {
    return &EntralinkProgress_Get(GameData_GetSaveControl(gameData))->records;
}

// The entry of a key among a record's entries, or a free one given the key; NULL with every entry taken
static EntralinkRecordEntry *EntralinkRecords_Find(EntralinkRecordEntry *entries, u32 max, u32 key) {
    u32 i;

    for (i = 0; i < max; i++) {
        if (entries[i].key == key) {
            return &entries[i];
        }
    }
    for (i = 0; i < max; i++) {
        if (entries[i].key == 0) {
            entries[i].key = key;
            return &entries[i];
        }
    }
    return NULL;
}

static void EntralinkRecords_Count(EntralinkRecordEntry *entry) {
    if (entry->count < COUNT_MAX) {
        entry->count++;
    }
}

// The codex's key of a species and form, or 0 if the codex doesn't have them
static u32 EntralinkRecords_GetCodexKey(u32 species, u32 form) {
    u32 i;

    for (i = 0; i < NELEMS(sCodex); i++) {
        if (sCodex[i] == (ENTRALINK_RECORDS_CODEX_KEY(species, form) | ENTRALINK_RECORDS_CODEX_SPECIAL)) {
            return ENTRALINK_RECORDS_CODEX_KEY(species, form);
        }
        if (sCodex[i] == species) {
            return species;
        }
    }
    return 0;
}

void EntralinkRecords_StartRun(GameData *gameData) {
    EntralinkRecords *records = EntralinkRecords_Get(gameData);

    if (records->runsStarted != 0xffff) {
        records->runsStarted++;
    }
}

void EntralinkRecords_SetRoom(GameData *gameData, u32 recordId, BOOL beaten) {
    EntralinkRecords *records = EntralinkRecords_Get(gameData);

    if (recordId >= ENTRALINK_RECORDS_ROOMS_MAX) {
        return;
    }
    records->roomsDiscovered[recordId / 8] |= 1 << (recordId % 8);
    if (beaten) {
        records->roomsBeaten[recordId / 8] |= 1 << (recordId % 8);
    }
}

void EntralinkRecords_AddEnemy(GameData *gameData, u32 species, u32 form, u32 what) {
    u32 key = EntralinkRecords_GetCodexKey(species, form);
    EntralinkRecordEntry *entry;

    if (key == 0) {
        return;
    }
    entry = EntralinkRecords_Find(EntralinkRecords_Get(gameData)->codex, ENTRALINK_RECORDS_CODEX_MAX, key);
    if (entry == NULL) {
        return;
    }
    entry->flags |= ENTRALINK_RECORD_SEEN;
    if (what == ENTRALINK_RECORDS_BEATEN) {
        EntralinkRecords_Count(entry);
    } else if (what == ENTRALINK_RECORDS_CAUGHT) {
        entry->flags |= ENTRALINK_RECORD_TAKEN;
    }
}

void EntralinkRecords_BeatBoss(GameData *gameData, u32 recordId, u32 turns) {
    EntralinkRecords *records = EntralinkRecords_Get(gameData);
    EntralinkRecordEntry *entry;
    u16 *best;

    if (recordId >= ENTRALINK_RECORDS_ROOMS_MAX) {
        return;
    }
    entry = EntralinkRecords_Find(records->bosses, ENTRALINK_RECORDS_BOSSES_MAX, recordId + 1);
    if (entry == NULL) {
        return;
    }
    EntralinkRecords_Count(entry);
    best = &records->bossBestTurns[entry - records->bosses];
    if (*best == 0 || turns < *best) {
        *best = turns;
    }
}

// A card's entry in the compendium, or NULL for an item or with every entry taken
static EntralinkRecordEntry *EntralinkRecords_FindCard(EntralinkRecords *records, const EntralinkCard *card) {
    if (card->kind != ENTRALINK_CARD_BUFF) {
        return NULL;
    }
    return EntralinkRecords_Find(records->cards, ENTRALINK_RECORDS_CARDS_MAX, EntralinkBuffs_GetEntry(card->id)->key);
}

void EntralinkRecords_SeeCards(GameData *gameData, const EntralinkCard *cards, u32 count) {
    EntralinkRecords *records = EntralinkRecords_Get(gameData);
    EntralinkRecordEntry *entry;
    u32 i;

    for (i = 0; i < count; i++) {
        entry = EntralinkRecords_FindCard(records, &cards[i]);
        if (entry != NULL) {
            entry->flags |= ENTRALINK_RECORD_SEEN;
        }
    }
}

void EntralinkRecords_TakeCard(GameData *gameData, const EntralinkCard *card) {
    EntralinkRecordEntry *entry = EntralinkRecords_FindCard(EntralinkRecords_Get(gameData), card);

    if (entry != NULL) {
        entry->flags |= ENTRALINK_RECORD_SEEN | ENTRALINK_RECORD_TAKEN;
        EntralinkRecords_Count(entry);
    }
}

// The hall of fame: the run's team (its copies, the party until the run's end) and the golds it holds
static void EntralinkRecords_SetHallOfFame(EntralinkRecords *records, GameData *gameData) {
    PokeParty *party = GameData_GetParty(gameData);
    EntralinkHallMon *mon;
    PartyPkm *pkm;
    u32 buff;
    u32 i;

    MI_CpuFill8(records->hallMons, 0, sizeof(records->hallMons));
    MI_CpuFill8(records->hallGolds, 0, sizeof(records->hallGolds));
    for (i = 0; i < ENTRALINK_RECORDS_HALL_MONS && i < PokeParty_GetPkmCount(party); i++) {
        pkm = PokeParty_GetPkm(party, i);
        mon = &records->hallMons[i];
        mon->species = PokeParty_GetParam(pkm, PKM_PARAM_SPECIES, NULL);
        mon->item = PokeParty_GetParam(pkm, PKM_PARAM_ITEM, NULL);
        mon->form = PokeParty_GetParam(pkm, PKM_PARAM_FORM, NULL);
        mon->shiny = PokeParty_IsRare(pkm);
        PokeParty_GetParam(pkm, PKM_PARAM_NICKNAME_RAW, mon->nickname);
        mon->nickname[ENTRALINK_RECORDS_NICKNAME_LENGTH - 1] = STRING_END;
    }
    for (i = 0; i < ENTRALINK_RECORDS_HALL_GOLDS && i < ENTRALINK_BUFF_GOLD_SLOTS; i++) {
        buff = EntralinkBuffs_GetGoldSlot(i);
        if (buff != ENTRALINK_BUFF_NONE) {
            records->hallGolds[i].key = EntralinkBuffs_GetEntry(buff)->key;
            records->hallGolds[i].rank = EntralinkBuffs_GetGoldRank(buff);
        }
    }
}

void EntralinkRecords_EndRun(GameData *gameData, u32 round, u32 shards) {
    EntralinkRecords *records = EntralinkRecords_Get(gameData);
    EntralinkRunState *state = EntralinkRun_GetState();

    if (state->room > records->deepestPlace) {
        records->deepestPlace = state->room;
        records->deepestRound = round;
    }
    records->shardsEarned += shards;
    if (state->bestHit.damage > records->bestHit.damage) {
        records->bestHit = state->bestHit;
    }
    if (!state->won) {
        records->winStreak = 0;
        return;
    }
    if (records->winStreak != 0xffff) {
        records->winStreak++;
    }
    if (records->winStreak > records->bestWinStreak) {
        records->bestWinStreak = records->winStreak;
    }
    // The fewest turns, the first such run kept on a tie
    if (records->bestWinTurns == 0 || state->turns < records->bestWinTurns) {
        records->bestWinTurns = state->turns;
        EntralinkRecords_SetHallOfFame(records, gameData);
    }
}

void EntralinkRecords_Clear(GameData *gameData) {
    EntralinkProgress *progress = EntralinkProgress_Get(GameData_GetSaveControl(gameData));

    MI_CpuFill8(&progress->records, 0, sizeof(EntralinkRecords));
    // (and the debug menu's White milestones, which stand for records)
    progress->debugMilestones = 0;
}

u32 EntralinkRecords_GetCodexCount(void) {
    // An empty codex has a placeholder 0
    return sCodex[0] == 0 ? 0 : NELEMS(sCodex);
}

BOOL EntralinkRecords_IsCodexFull(EntralinkProgress *progress) {
    const EntralinkRecordEntry *codex = progress->records.codex;
    u32 key;
    u32 i;
    u32 j;

    for (i = 0; i < EntralinkRecords_GetCodexCount(); i++) {
        // A Nightmare species by its form 0's key, a special form by its own
        key = sCodex[i] & ~ENTRALINK_RECORDS_CODEX_SPECIAL;
        for (j = 0; j < ENTRALINK_RECORDS_CODEX_MAX; j++) {
            if (codex[j].key == key) {
                break;
            }
        }
        if (j == ENTRALINK_RECORDS_CODEX_MAX || !(codex[j].flags & ENTRALINK_RECORD_SEEN)) {
            return FALSE;
        }
    }
    return TRUE;
}

u32 EntralinkRecords_GetSpecialForm(u32 species) {
    u32 i;

    for (i = 0; i < NELEMS(sCodex); i++) {
        if ((sCodex[i] & ENTRALINK_RECORDS_CODEX_SPECIAL) && ENTRALINK_RECORDS_CODEX_SPECIES(sCodex[i]) == species) {
            return ENTRALINK_RECORDS_CODEX_FORM(sCodex[i] & ~ENTRALINK_RECORDS_CODEX_SPECIAL);
        }
    }
    return 0;
}
