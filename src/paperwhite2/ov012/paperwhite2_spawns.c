#include "types.h"
#include "constants/flags.h"
#include "field/event_data.h"
#include "field/field_actor.h"
#include "gfl/arc.h"
#include "gfl/heap.h"
#include "paperwhite2/conditions.h"
#include "paperwhite2/spawns.h"
#include "save/event_work.h"
#include "system/game_data.h"
#include "system/game_system.h"

// Paper White 2: the NPC spawns of res/paperwhite2/overworld/ (tools/paperwhite2/overworld.py): at zone entry, after
// the zone's records are read and before the zone's init scripts and SpawnAllZoneNPCs, an NPC whose condition fails
// gets a spawn flag that is always set, and a host NPC gets one of its instances written into its record, picked by
// weight among those whose conditions hold and whose flags aren't set, from the day's seed keyed by its id. The
// field then creates, talks to and saves the NPCs as its own (docs/paperwhite2/plugins.md, NPC spawns)

// The spawn member, the events' archive's last file: a header, a zone's entry each, then the zones' tables
#define SPAWNS_MAGIC 0x574f5750

typedef struct {
    u32 magic;
    u16 count;
    u16 pad;
} SpawnsHeader;

typedef struct {
    u16 zone;
    u16 pad;
    u32 offset;
    u32 size;
} SpawnsZone;

// A rule's payload: what it is and the NPC it is for, then for an instance its record
typedef struct {
    u8 kind;
    u8 pad;
    u16 npcId;
} SpawnPayload;

enum {
    SPAWN_KIND_CONDITION,
    SPAWN_KIND_INSTANCE,
};

// A rule's payload
static const SpawnPayload *Spawns_Payload(const ConditionTable *table, u32 index) {
    u32 size;

    return Conditions_GetPayload(table, index, &size);
}

// The zone's record of an NPC, by its id
static ZoneNPC *Spawns_FindNPC(EventData *events, u16 npcId) {
    u32 i;

    for (i = 0; i < events->npcCount; i++) {
        if (events->npcs[i].uid == npcId) {
            return &events->npcs[i];
        }
    }
    return NULL;
}

// The zone's table, read into the heap, or NULL when the zone has none
static ConditionTable *Spawns_LoadTable(EventData *events, u16 zoneId, HeapID heapId) {
    u32 member = GFL_ArcToolGetDataMax(events->entityArc) - 1;
    SpawnsHeader header;
    SpawnsZone zone;
    ConditionTable *table;
    u32 i;

    GFL_ArcToolReadRange(events->entityArc, member, 0, sizeof(header), &header);
    if (header.magic != SPAWNS_MAGIC) {
        return NULL;
    }
    for (i = 0; i < header.count; i++) {
        GFL_ArcToolReadRange(events->entityArc, member, sizeof(header) + i * sizeof(zone), sizeof(zone), &zone);
        if (zone.zone == zoneId) {
            table = GFL_HeapAllocate(heapId, zone.size, FALSE, "paperwhite2_spawns.c", __LINE__);
            GFL_ArcToolReadRange(events->entityArc, member, zone.offset, zone.size, table);
            if (!Conditions_IsTableValid(table, zone.size)) {
                GFL_HeapFree(table);
                return NULL;
            }
            return table;
        }
    }
    return NULL;
}

// Picks a host's instance from its rules, first to end (all its own, one after another), and writes it into the
// host's record; with none that holds, the host is hidden
static void Spawns_PickInstance(const ConditionTable *table, u32 first, u32 end, ZoneNPC *host,
                                const ConditionContext *ctx, EventWork *eventWork) {
    u32 rng = Conditions_Seed(ctx, CONDITION_SEED_DAY, host->uid);
    u32 total = 0;
    u32 pick;
    u32 i;
    u8 holds[CONDITION_TABLE_MAX_RULES];

    for (i = first; i < end; i++) {
        const ZoneNPC *record = (const ZoneNPC *)(Spawns_Payload(table, i) + 1);

        holds[i] = Conditions_MatchRule(table, i, ctx, &rng) &&
                   (record->spawnFlag == 0 || !EventWork_FlagGet(eventWork, record->spawnFlag));
        if (holds[i]) {
            total += Conditions_GetRule(table, i)->weight;
        }
    }
    if (total == 0) {
        host->spawnFlag = EVENT_FLAG_SPAWN_HIDDEN;
        return;
    }
    pick = Conditions_Random(&rng, total);
    for (i = first; i < end; i++) {
        if (!holds[i]) {
            continue;
        }
        if (pick < Conditions_GetRule(table, i)->weight) {
            u16 uid = host->uid;

            *host = *(const ZoneNPC *)(Spawns_Payload(table, i) + 1);
            host->uid = uid;
            return;
        }
        pick -= Conditions_GetRule(table, i)->weight;
    }
}

void Spawns_OnZoneInit(GameSystem *gsys, u16 zoneId, HeapID heapId) {
    GameData *gameData = GSYS_GetGameData(gsys);
    EventData *events = GameData_GetEventData(gameData);
    EventWork *eventWork = GameData_GetEventWork(gameData);
    ConditionTable *table = Spawns_LoadTable(events, zoneId, heapId);
    ConditionContext ctx;
    u32 i;

    // The flag of what is hidden, always set
    EventWork_FlagSet(eventWork, EVENT_FLAG_SPAWN_HIDDEN);
    if (table == NULL) {
        return;
    }
    ConditionContext_Init(&ctx);
    ConditionContext_FillGame(&ctx, gameData);
    i = 0;
    while (i < table->ruleCount) {
        const SpawnPayload *payload = Spawns_Payload(table, i);
        ZoneNPC *npc = Spawns_FindNPC(events, payload->npcId);
        u32 end = i + 1;

        if (payload->kind == SPAWN_KIND_INSTANCE) {
            while (end < table->ruleCount) {
                const SpawnPayload *next = Spawns_Payload(table, end);

                if (next->kind != SPAWN_KIND_INSTANCE || next->npcId != payload->npcId) {
                    break;
                }
                end++;
            }
            if (npc != NULL) {
                Spawns_PickInstance(table, i, end, npc, &ctx, eventWork);
            }
        } else if (npc != NULL) {
            // A chance holds all day: the day's seed, keyed by the NPC
            u32 rng = Conditions_Seed(&ctx, CONDITION_SEED_DAY, npc->uid);

            if (!Conditions_MatchRule(table, i, &ctx, &rng)) {
                npc->spawnFlag = EVENT_FLAG_SPAWN_HIDDEN;
            }
        }
        i = end;
    }
    GFL_HeapFree(table);
}

void Spawns_OnPeriodChange(GameSystem *gsys, u32 period) {
}

void Spawns_Refresh(GameSystem *gsys) {
}
