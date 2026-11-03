#include "types.h"
#include "constants/flags.h"
#include "constants/vars.h"
#include "field/event_data.h"
#include "field/field_actor.h"
#include "field/zone.h"
#include "gfl/arc.h"
#include "gfl/heap.h"
#include "nitro/mi.h"
#include "paperwhite2/conditions.h"
#include "paperwhite2/spawns.h"
#include "save/event_work.h"
#include "system/game_data.h"
#include "system/game_system.h"

// Paper White 2: the NPC spawns of res/paperwhite2/overworld/ (tools/paperwhite2/overworld.py). At zone entry, after
// the zone's records are read and before the zone's init scripts and SpawnAllZoneNPCs, each NPC with rules is given
// the record it should have now: hidden (a spawn flag that is always set) where its condition fails, else for a host
// one of its instances, picked by weight among those whose conditions hold and whose flags aren't set; each from the
// seed its rules name (the hour's by default), keyed by its id. When the hour or the time of day changes while the
// player stays in the zone, the same pick runs again, and an NPC whose record should change is changed only while it's
// out of the camera's view (the caller says which are): its actor removed, its record written and its actor made
// again if it shows. The field then creates, talks to and saves the NPCs as its own (docs/paperwhite2/plugins.md, NPC
// spawns)

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

// A rule's payload: what it is, the seed its rolls start from (a CONDITION_SEED_*), and the NPC it is for, then for
// an instance its record
typedef struct {
    u8 kind;
    u8 seed;
    u16 npcId;
} SpawnPayload;

enum {
    SPAWN_KIND_CONDITION,
    SPAWN_KIND_INSTANCE,
    // An ambient (paperwhite2_ambients.c): its npcId is its index in the zone's ambients
    SPAWN_KIND_AMBIENT,
    // A sprite of an ambient's that shows only while its condition holds, after the ambient's rule: its npcId is the
    // ambient's index, and its payload the object code (u16)
    SPAWN_KIND_AMBIENT_SPRITE,
};

// An ambient's rule, or one of its sprites'
#define SPAWN_IS_AMBIENT(kind) ((kind) == SPAWN_KIND_AMBIENT || (kind) == SPAWN_KIND_AMBIENT_SPRITE)

// A zone's entity file: the offset of its init script, the counts of its entities, NPCs, warps and triggers, then the
// entities and the NPCs (LoadZoneEntities)
#define ENTITIES_COUNTS_OFFSET 4
#define ENTITIES_RECORDS_OFFSET 8

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

// An NPC's record as the zone's entity file has it, before any pick wrote into it; FALSE when the file has no such NPC
static BOOL Spawns_ReadOriginal(EventData *events, u16 zoneId, u16 npcId, ZoneNPC *out) {
    u32 fileId = GetZoneEntitiesID(zoneId);
    u8 counts[4];
    u32 first;
    u32 i;

    GFL_ArcToolReadRange(events->entityArc, fileId, ENTITIES_COUNTS_OFFSET, sizeof(counts), counts);
    first = ENTITIES_RECORDS_OFFSET + counts[0] * sizeof(ZoneBGEntity);
    for (i = 0; i < counts[1]; i++) {
        GFL_ArcToolReadRange(events->entityArc, fileId, first + i * sizeof(ZoneNPC), sizeof(ZoneNPC), out);
        if (out->uid == npcId) {
            return TRUE;
        }
    }
    return FALSE;
}

// The record an NPC should have now, from its rules, first to end (a condition and then its instances, one after
// another): its own (original) where it shows as it is, an instance picked by weight from those whose conditions hold
// and whose flags aren't set, or its own, hidden, where its condition fails or no instance holds
static void Spawns_Want(const ConditionTable *table, u32 first, u32 end, const ZoneNPC *original, ZoneNPC *out,
                        const ConditionContext *ctx, EventWork *eventWork) {
    const SpawnPayload *payload = Spawns_Payload(table, first);
    u32 rng = Conditions_Seed(ctx, payload->seed, original->uid);
    u32 total = 0;
    u32 pick;
    u32 i;
    u8 holds[CONDITION_TABLE_MAX_RULES];

    *out = *original;
    if (payload->kind == SPAWN_KIND_CONDITION) {
        if (!Conditions_MatchRule(table, first, ctx, &rng)) {
            out->spawnFlag = EVENT_FLAG_SPAWN_HIDDEN;
            return;
        }
        first++;
    }
    if (first == end) {
        return;
    }
    for (i = first; i < end; i++) {
        const ZoneNPC *record = (const ZoneNPC *)(Spawns_Payload(table, i) + 1);

        holds[i] = Conditions_MatchRule(table, i, ctx, &rng) &&
                   (record->spawnFlag == 0 || !EventWork_FlagGet(eventWork, record->spawnFlag));
        if (holds[i]) {
            total += Conditions_GetRule(table, i)->weight;
        }
    }
    if (total == 0) {
        out->spawnFlag = EVENT_FLAG_SPAWN_HIDDEN;
        return;
    }
    pick = Conditions_Random(&rng, total);
    for (i = first; i < end; i++) {
        if (!holds[i]) {
            continue;
        }
        if (pick < Conditions_GetRule(table, i)->weight) {
            *out = *(const ZoneNPC *)(Spawns_Payload(table, i) + 1);
            out->uid = original->uid;
            return;
        }
        pick -= Conditions_GetRule(table, i)->weight;
    }
}

// The end of an NPC's rules that start at first: the rules after it for the same NPC (an ambient's is its one)
static u32 Spawns_RulesEnd(const ConditionTable *table, u32 first) {
    u16 npcId = Spawns_Payload(table, first)->npcId;
    u32 end = first + 1;

    if (SPAWN_IS_AMBIENT(Spawns_Payload(table, first)->kind)) {
        return end;
    }
    while (end < table->ruleCount && !SPAWN_IS_AMBIENT(Spawns_Payload(table, end)->kind) &&
           Spawns_Payload(table, end)->npcId == npcId) {
        end++;
    }
    return end;
}

u16 Spawns_PickKey(GameData *gameData) {
    ConditionContext ctx;

    ConditionContext_Init(&ctx);
    ConditionContext_FillWorld(&ctx, gameData);
    // (the day, the hour and the time of day the picks were made for: any of them changing picks again)
    return Conditions_Hash(ctx.dayNumber * 24 + ctx.hour, ctx.period);
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
    *EventWork_GetWkPtr(eventWork, EVENT_WORK_SPAWN_PICK) = Spawns_PickKey(gameData);
    if (table == NULL) {
        return;
    }
    ConditionContext_Init(&ctx);
    ConditionContext_FillGame(&ctx, gameData);
    for (i = 0; i < table->ruleCount; i = Spawns_RulesEnd(table, i)) {
        ZoneNPC *npc = Spawns_FindNPC(events, Spawns_Payload(table, i)->npcId);
        ZoneNPC original;

        if (npc != NULL && !SPAWN_IS_AMBIENT(Spawns_Payload(table, i)->kind)) {
            // (the record as just read is the original)
            original = *npc;
            Spawns_Want(table, i, Spawns_RulesEnd(table, i), &original, npc, &ctx, eventWork);
        }
    }
    GFL_HeapFree(table);
}

BOOL Spawns_Repick(GameSystem *gsys, MMSys *actorSystem, HeapID heapId, SpawnsInView inView, void *arg) {
    GameData *gameData = GSYS_GetGameData(gsys);
    EventData *events = GameData_GetEventData(gameData);
    EventWork *eventWork = GameData_GetEventWork(gameData);
    u16 zoneId = events->zoneId;
    ConditionTable *table = Spawns_LoadTable(events, zoneId, heapId);
    ConditionContext ctx;
    BOOL done = TRUE;
    u32 i;

    if (table == NULL) {
        return TRUE;
    }
    ConditionContext_Init(&ctx);
    ConditionContext_FillGame(&ctx, gameData);
    for (i = 0; i < table->ruleCount; i = Spawns_RulesEnd(table, i)) {
        u16 npcId = Spawns_Payload(table, i)->npcId;
        ZoneNPC *npc = Spawns_FindNPC(events, npcId);
        ZoneNPC original;
        ZoneNPC want;
        FieldActor *actor;
        u32 end;
        u16 spawnFlag;

        if (SPAWN_IS_AMBIENT(Spawns_Payload(table, i)->kind) || npc == NULL ||
            !Spawns_ReadOriginal(events, zoneId, npcId, &original)) {
            continue;
        }
        end = Spawns_RulesEnd(table, i);
        Spawns_Want(table, i, end, &original, &want, &ctx, eventWork);
        if (end == i + 1 && Spawns_Payload(table, i)->kind == SPAWN_KIND_CONDITION) {
            // Only a condition: only whether it's hidden changes, and the rest of its record stays as it is (an init
            // script may have moved it)
            if ((npc->spawnFlag == EVENT_FLAG_SPAWN_HIDDEN) == (want.spawnFlag == EVENT_FLAG_SPAWN_HIDDEN)) {
                continue;
            }
            spawnFlag = want.spawnFlag;
            want = *npc;
            want.spawnFlag = spawnFlag;
        } else if (MI_CpuComp8(npc, &want, sizeof(ZoneNPC)) == 0) {
            continue;
        }
        // Not while it, or where it would appear, is in view: it waits, and the caller asks again
        actor = FindFieldActor(actorSystem, npcId);
        if ((actor != NULL && inView(arg, actor, npc)) ||
            (want.spawnFlag != EVENT_FLAG_SPAWN_HIDDEN && inView(arg, NULL, &want))) {
            done = FALSE;
            continue;
        }
        if (actor != NULL) {
            DeleteActor(actor);
        }
        *npc = want;
        if (want.spawnFlag != EVENT_FLAG_SPAWN_HIDDEN) {
            SpawnZoneNPCByUID(actorSystem, events->npcs, zoneId, events->npcCount, eventWork, npcId);
        }
    }
    GFL_HeapFree(table);
    return done;
}

u32 Spawns_GetAmbients(GameSystem *gsys, HeapID heapId, SpawnAmbient *out, u32 max) {
    GameData *gameData = GSYS_GetGameData(gsys);
    EventData *events = GameData_GetEventData(gameData);
    ConditionTable *table = Spawns_LoadTable(events, events->zoneId, heapId);
    ConditionContext ctx;
    u32 count = 0;
    u32 i;

    if (table == NULL) {
        return 0;
    }
    ConditionContext_Init(&ctx);
    ConditionContext_FillGame(&ctx, gameData);
    for (i = 0; i < table->ruleCount && count < max; i++) {
        const SpawnPayload *payload = Spawns_Payload(table, i);
        u32 rng;

        if (payload->kind != SPAWN_KIND_AMBIENT) {
            continue;
        }
        rng = Conditions_Seed(&ctx, payload->seed, SPAWNS_AMBIENT_KEY + payload->npcId);
        if (Conditions_MatchRule(table, i, &ctx, &rng)) {
            SpawnAmbient *ambient = &out[count];
            u16 held[SPAWNS_AMBIENT_SPRITES];
            u32 heldCount = 0;
            u32 j;

            *ambient = *(const SpawnAmbient *)(payload + 1);
            // Its sprites with conditions, the rules after its own: those that hold now are picked from first
            for (j = i + 1; j < table->ruleCount; j++) {
                const SpawnPayload *sprite = Spawns_Payload(table, j);

                if (sprite->kind != SPAWN_KIND_AMBIENT_SPRITE || sprite->npcId != payload->npcId) {
                    break;
                }
                if (heldCount < SPAWNS_AMBIENT_SPRITES && Conditions_MatchRule(table, j, &ctx, &rng)) {
                    held[heldCount++] = *(const u16 *)(sprite + 1);
                }
            }
            // Its sprite, from those or else its set, by the same roll, so the pick holds as long as its chance does;
            // with none (every one has a condition and none holds) it doesn't show
            if (heldCount != 0) {
                ambient->objCodes[0] = held[heldCount > 1 ? Conditions_Random(&rng, heldCount) : 0];
            } else if (ambient->objCodeCount > 1) {
                ambient->objCodes[0] = ambient->objCodes[Conditions_Random(&rng, ambient->objCodeCount)];
            } else if (ambient->objCodeCount == 0) {
                continue;
            }
            ambient->objCodeCount = 1;
            count++;
        }
    }
    GFL_HeapFree(table);
    return count;
}

void Spawns_Refresh(GameSystem *gsys) {
}
