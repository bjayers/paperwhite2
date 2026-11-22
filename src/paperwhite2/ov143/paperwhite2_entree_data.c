#include "types.h"
#include "gfl/std.h"
#include "paperwhite2/entralink_buffs.h"
#include "paperwhite2/entralink_progress.h"
#include "paperwhite2/entralink_records.h"
#include "paperwhite2/entralink_records_config.h"
#include "paperwhite2/entralink_run.h"
#include "paperwhite2/entralink_run_config.h"
#include "paperwhite2/entree_menu.h"
#include "system/game_data.h"
#include "system/game_system.h"

// Paper White 2: what the Entree's menu reads, in overlay 143 with it: copies of the run's room tables, the codex and
// the buffs' catalogue (overlay 12's are static to the run's code; overlay 143 loads only for the menu, so its copies
// cost no memory elsewhere). The ranks are overlay 12's (paperwhite2/entralink_ranks.h), which the trees and rewards
// read too. See include/paperwhite2/entree_menu.h

static const EntralinkRoom sRooms[ENTRALINK_RUN_ROOM_COUNT] = ENTRALINK_RUN_ROOMS;
static const EntralinkRound sRounds[ENTRALINK_RUN_ROUND_COUNT] = ENTRALINK_RUN_ROUNDS;
static const EntralinkBattle sBattles[ENTRALINK_RUN_BATTLE_COUNT] = ENTRALINK_RUN_BATTLES;
static const EntralinkEnemy sEnemies[ENTRALINK_RUN_ENEMY_COUNT] = ENTRALINK_RUN_ENEMIES;
static const u16 sRequirements[ENTRALINK_RUN_REQUIREMENT_COUNT] = ENTRALINK_RUN_REQUIREMENTS;
static const u16 sCodex[ENTRALINK_RECORDS_CODEX_COUNT] = ENTRALINK_RECORDS_CODEX;
static const EntralinkBuff sBuffs[ENTRALINK_BUFF_COUNT] = ENTRALINK_BUFF_TABLE;

EntralinkProgress *Entree_GetProgress(MonolithScreenParam *screen) {
    return EntralinkProgress_Get(GameData_GetSaveControl(GSYS_GetGameData(screen->param->gsys)));
}

// ---- The tables -----------------------------------------------------------------------------------------------------

u32 Entree_GetRoomTableCount(void) {
    return ENTRALINK_RUN_ROOM_COUNT;
}

const EntralinkRoom *Entree_GetRoomEntry(u32 index) {
    return &sRooms[index];
}

const EntralinkBattle *Entree_GetBattle(const EntralinkRoom *room, u32 index) {
    return &sBattles[room->firstBattle + index];
}

u32 Entree_GetEnemyTableCount(void) {
    return ENTRALINK_RUN_ENEMY_COUNT;
}

const EntralinkEnemy *Entree_GetEnemyEntry(u32 index) {
    return &sEnemies[index];
}

const EntralinkEnemy *Entree_GetEnemy(const EntralinkBattle *battle, u32 index) {
    return &sEnemies[battle->firstEnemy + index];
}

u32 Entree_GetRequirement(const EntralinkEnemy *enemy, u32 index) {
    return sRequirements[enemy->firstRequirement + index];
}

BOOL Entree_IsRoomOfRooms(const EntralinkRoom *room) {
    return !room->isTemplate && !room->random && room->recordId != ENTRALINK_RECORDS_ROOM_NONE;
}

const EntralinkBattle *Entree_FindBattle(u32 progressId) {
    u32 i;

    for (i = 0; i < NELEMS(sBattles); i++) {
        if (sBattles[i].progressId == progressId) {
            return &sBattles[i];
        }
    }
    return NULL;
}

u32 Entree_GetCodexCount(void) {
    // An empty codex has a placeholder 0
    return sCodex[0] == 0 ? 0 : NELEMS(sCodex);
}

u32 Entree_GetCodexEntry(u32 index) {
    return sCodex[index];
}

u32 Entree_GetBuffCount(void) {
    return ENTRALINK_BUFF_COUNT;
}

const EntralinkBuff *Entree_GetBuff(u32 index) {
    return &sBuffs[index];
}

const EntralinkRecordEntry *Entree_FindRecord(const EntralinkRecordEntry *entries, u32 max, u32 key) {
    u32 i;

    for (i = 0; i < max; i++) {
        if (entries[i].key == key) {
            return &entries[i];
        }
    }
    return NULL;
}

// The codex's record of an entry of its table: a Nightmare species by its form 0, a special form by its own key
const EntralinkRecordEntry *Entree_FindCodexRecord(EntralinkProgress *progress, u32 entry) {
    return Entree_FindRecord(progress->records.codex, ENTRALINK_RECORDS_CODEX_MAX,
                             entry & ~ENTRALINK_RECORDS_CODEX_SPECIAL);
}

// ---- The rooms ------------------------------------------------------------------------------------------------------

u32 Entree_GetRoomCount(void) {
    u32 count = 0;
    u32 i;

    for (i = 0; i < NELEMS(sRooms); i++) {
        if (Entree_IsRoomOfRooms(&sRooms[i])) {
            count++;
        }
    }
    return count;
}

u32 Entree_CountRooms(const u8 *bits) {
    u32 count = 0;
    u32 id;
    u32 i;

    for (i = 0; i < NELEMS(sRooms); i++) {
        if (Entree_IsRoomOfRooms(&sRooms[i])) {
            id = sRooms[i].recordId;
            if (bits[id / 8] & (1 << (id % 8))) {
                count++;
            }
        }
    }
    return count;
}

// Whether a room's pool holds it in a round (from 1), as overlay 12's draws take them (EntralinkRun_IsInPool and
// _GetPool): a round's room kept to the round or to none, a boss kept to it, or kept to none when no boss is
static BOOL Entree_IsKeptTo(const EntralinkRoom *room, u32 round) {
    return (room->rounds & (1 << (round - 1))) != 0;
}

static BOOL Entree_IsInPool(const EntralinkRoom *room, u32 round) {
    u32 i;

    if (room->role != ENTRALINK_ROLE_BOSS) {
        return room->rounds == 0 || Entree_IsKeptTo(room, round);
    }
    if (Entree_IsKeptTo(room, round)) {
        return TRUE;
    }
    for (i = 0; i < NELEMS(sRooms); i++) {
        if (!sRooms[i].isTemplate && sRooms[i].role == ENTRALINK_ROLE_BOSS && Entree_IsKeptTo(&sRooms[i], round)) {
            return FALSE;
        }
    }
    return room->rounds == 0;
}

// Whether a round draws a premade room of a type (EntralinkRun_DrawRoomOfType): its type weighted there, and for an
// enemy or enemy choice room random rooms not certain, for a rest, item, buff or shop room premade ones possible
// (challenge and event rooms are always premade)
static BOOL Entree_CanTypeComeUp(u32 type, u32 round) {
    if (sRounds[round - 1].typeWeights[type] == 0) {
        return FALSE;
    }
    switch (type) {
    case ENTRALINK_TYPE_ENEMY:
    case ENTRALINK_TYPE_ENEMY_CHOICE:
        return ENTRALINK_RUN_RANDOM_ENEMY_CHANCE < 100;
    case ENTRALINK_TYPE_CHALLENGE:
    case ENTRALINK_TYPE_EVENT:
        return TRUE;
    }
    return ENTRALINK_RUN_CUSTOM_CHANCE > 0;
}

// The rounds a round's room or boss can come up in, a bit each from round 1's: a room in those whose pool holds it
// and that draw its type, a boss in those with a boss whose pool holds it
static u32 Entree_GetRoomRounds(const EntralinkRoom *room) {
    u32 rounds = 0;
    u32 round;

    for (round = 1; round <= ENTRALINK_RUN_ROUND_COUNT; round++) {
        if (!Entree_IsInPool(room, round)) {
            continue;
        }
        if (room->role == ENTRALINK_ROLE_BOSS ? sRounds[round - 1].boss : Entree_CanTypeComeUp(room->type, round)) {
            rounds |= 1 << (round - 1);
        }
    }
    return rounds;
}

void Entree_CountUndiscovered(EntralinkProgress *progress, u8 *counts) {
    const EntralinkRoom *room;
    u32 rounds;
    u32 i;

    MI_CpuFill8(counts, 0, ENTREE_ROUND_GROUPS);
    for (i = 0; i < NELEMS(sRooms); i++) {
        room = &sRooms[i];
        if (!Entree_IsRoomOfRooms(room)
            || (progress->records.roomsDiscovered[room->recordId / 8] & (1 << (room->recordId % 8)))) {
            continue;
        }
        if (room->role == ENTRALINK_ROLE_FINAL) {
            counts[0]++;
            continue;
        }
        rounds = Entree_GetRoomRounds(room);
        if (rounds != 0) {
            counts[rounds]++;
        }
    }
}
