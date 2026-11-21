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

// Paper White 2: what the Entree's menu reads, in overlay 143 with it: the ranks, the milestones, and copies of the
// run's room tables, the codex and the buffs' catalogue (overlay 12's are static to the run's code; overlay 143 loads
// only for the menu, so its copies cost no memory elsewhere). See include/paperwhite2/entree_menu.h

static const EntralinkRoom sRooms[ENTRALINK_RUN_ROOM_COUNT] = ENTRALINK_RUN_ROOMS;
static const EntralinkBattle sBattles[ENTRALINK_RUN_BATTLE_COUNT] = ENTRALINK_RUN_BATTLES;
static const EntralinkEnemy sEnemies[ENTRALINK_RUN_ENEMY_COUNT] = ENTRALINK_RUN_ENEMIES;
static const u16 sRequirements[ENTRALINK_RUN_REQUIREMENT_COUNT] = ENTRALINK_RUN_REQUIREMENTS;
static const u16 sCodex[ENTRALINK_RECORDS_CODEX_COUNT] = ENTRALINK_RECORDS_CODEX;
static const EntralinkBuff sBuffs[ENTRALINK_BUFF_COUNT] = ENTRALINK_BUFF_TABLE;
static const u32 sBlackRanks[ENTRALINK_RECORDS_BLACK_RANK_COUNT] = ENTRALINK_RECORDS_BLACK_RANKS;

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

// ---- The ranks ------------------------------------------------------------------------------------------------------

// Whether every catchable enemy of the rooms is caught
static BOOL Entree_IsAllCaught(EntralinkProgress *progress) {
    const EntralinkRoom *room;
    const EntralinkBattle *battle;
    const EntralinkEnemy *enemy;
    u32 i;
    u32 j;
    u32 k;

    for (i = 0; i < NELEMS(sRooms); i++) {
        room = &sRooms[i];
        if (!Entree_IsRoomOfRooms(room)) {
            continue;
        }
        for (j = 0; j < room->battleCount; j++) {
            battle = Entree_GetBattle(room, j);
            for (k = 0; k < battle->enemyCount; k++) {
                enemy = Entree_GetEnemy(battle, k);
                if (enemy->catchId != ENTRALINK_NONE && !EntralinkProgress_IsCaught(progress, enemy->catchId)) {
                    return FALSE;
                }
            }
        }
    }
    return TRUE;
}

// Whether every species and special form of the codex was met
static BOOL Entree_IsCodexFull(EntralinkProgress *progress) {
    const EntralinkRecordEntry *record;
    u32 i;

    for (i = 0; i < Entree_GetCodexCount(); i++) {
        record = Entree_FindCodexRecord(progress, sCodex[i]);
        if (record == NULL || !(record->flags & ENTRALINK_RECORD_SEEN)) {
            return FALSE;
        }
    }
    return TRUE;
}

static u32 Entree_CountShopPicks(EntralinkProgress *progress) {
    u32 count = 0;
    u32 i;

    for (i = 0; i < ENTRALINK_SHOP_PICKS_MAX; i++) {
        count += progress->shopPicks[i].count;
    }
    return count;
}

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

u32 Entree_GetMilestones(EntralinkProgress *progress) {
    u32 reached = 0;

    if (EntralinkProgress_IsRunCompleted(progress)) {
        reached |= 1 << ENTREE_MILESTONE_BEAT_FINAL;
    }
    if (Entree_IsAllCaught(progress)) {
        reached |= 1 << ENTREE_MILESTONE_CATCH_ALL;
    }
    if (Entree_IsCodexFull(progress)) {
        reached |= 1 << ENTREE_MILESTONE_FILL_CODEX;
    }
    if (Entree_CountShopPicks(progress) >= ENTRALINK_RUN_SHOP_TOTAL_CAP) {
        reached |= 1 << ENTREE_MILESTONE_SHOP_CAP;
    }
    if (Entree_CountRooms(progress->records.roomsDiscovered) == Entree_GetRoomCount()) {
        reached |= 1 << ENTREE_MILESTONE_ALL_ROOMS;
    }
    return reached;
}

static u32 Entree_CountBits(u32 bits) {
    u32 count = 0;

    for (; bits != 0; bits >>= 1) {
        count += bits & 1;
    }
    return count;
}

u32 Entree_GetWhiteRank(EntralinkProgress *progress) {
    return Entree_CountBits(Entree_GetMilestones(progress) & ENTRALINK_RECORDS_WHITE_MILESTONES);
}

u32 Entree_GetWhiteRankMax(void) {
    return Entree_CountBits(ENTRALINK_RECORDS_WHITE_MILESTONES);
}

u32 Entree_GetBlackRank(EntralinkProgress *progress) {
    u32 rank;

    for (rank = 0; rank < NELEMS(sBlackRanks); rank++) {
        if (progress->records.shardsEarned < sBlackRanks[rank]) {
            break;
        }
    }
    return rank;
}

u32 Entree_GetBlackRankMax(void) {
    return ENTRALINK_RECORDS_BLACK_RANK_COUNT;
}

u32 Entree_GetNextBlackRank(EntralinkProgress *progress) {
    u32 rank = Entree_GetBlackRank(progress);

    return rank < NELEMS(sBlackRanks) ? sBlackRanks[rank] : 0;
}
