#include "types.h"
#include "constants/flags.h"
#include "field/zone.h"
#include "gfl/arc.h"
#include "gfl/random.h"
#include "nitro/mi.h"
#include "paperwhite2/conditions.h"
#include "paperwhite2/encounters.h"
#include "save/encounter.h"
#include "save/event_work.h"
#include "save/save_control.h"
#include "system/game_data.h"

// Paper White 2: the wild encounters' new data, in main, where the field's table loading (overlay 12) and the
// encounters (overlay 36) both reach it. See include/paperwhite2/encounters.h

// The event flag that starts the outbreaks, the game's swarms' (enc_pokeset.c's FLAG_SWARMS)
#define FLAG_OUTBREAKS EVENT_FLAG_0x0960
// A tier's member's weight is its tier's share times this, divided among the tier's members, so a member of a tier of
// 64 keeps its weight's precision
#define WEIGHT_SCALE 1024
// A slot's candidate when it is the rustling spots' species or an outbreak's
#define SLOT_SPECIAL 0xff
// The key of the day's outbreak in Conditions_Hash
#define OUTBREAK_KEY 0x0b7ea4
// No rustling spot's battle is next
#define SPOTS_NONE 0xff

static EncountersHeader sHeader;
static BOOL sHeaderRead;
static EncountersOutbreak sOutbreaks[ENCOUNTERS_OUTBREAK_MAX];
static u32 sBlock[ENCOUNTERS_BLOCK_MAX / sizeof(u32)];
static BOOL sActive;
static u16 sArea;

// The slots that PrepareSlots made: their weights, a partner's weights, each one's candidate, and the slot picked last
static const WildEncSlot *sSlots;
static u8 sSlotCount;
static u32 sWeights[ENCOUNTERS_SLOTS];
static u32 sPartnerWeights[ENCOUNTERS_SLOTS];
static u8 sSlotCandidate[ENCOUNTERS_SLOTS];
static u8 sPicked;
static BOOL sPartner;
static u8 sSpots = SPOTS_NONE;

static const EncountersArea *GetArea(void) {
    return (const EncountersArea *)sBlock;
}

static const EncountersCandidate *GetCandidates(void) {
    return (const EncountersCandidate *)(GetArea() + 1);
}

static const ConditionTable *GetTable(void) {
    const EncountersArea *area = GetArea();

    return area->table != 0 ? (const ConditionTable *)((const u8 *)sBlock + area->table) : NULL;
}

void PaperWhite2_Encounters_Load(ArcTool *arc, u16 zoneId, u8 season, EncData *encData) {
    u32 member = GFL_ArcToolGetDataMax(arc) - 1;
    u32 fileId = GetZoneEncID(zoneId);
    EncountersIndexEntry entry;
    u32 i;

    sActive = FALSE;
    if (!sHeaderRead) {
        GFL_ArcToolReadRange(arc, member, 0, sizeof(EncountersHeader), &sHeader);
        if (sHeader.magic != ENCOUNTERS_MAGIC || sHeader.version != ENCOUNTERS_VERSION ||
            sHeader.outbreakCount > ENCOUNTERS_OUTBREAK_MAX) {
            return;
        }
        GFL_ArcToolReadRange(arc, member, sHeader.outbreaks, sHeader.outbreakCount * sizeof(EncountersOutbreak),
                             sOutbreaks);
        sHeaderRead = TRUE;
    }
    if (fileId >= sHeader.areaCount) {
        return;
    }
    GFL_ArcToolReadRange(arc, member, sHeader.index + fileId * sizeof(EncountersIndexEntry), sizeof(entry), &entry);
    if (entry.size == 0 || entry.size > sizeof(sBlock)) {
        return;
    }
    GFL_ArcToolReadRange(arc, member, entry.offset, entry.size, sBlock);
    // The area's rates for the season replace the table's, and its data counts as loaded even where the table had none
    for (i = 0; i < ENCTYPE_MAX; i++) {
        encData->userData[i] = GetArea()->rates[season][i];
    }
    encData->fishingEnable = TRUE;
    sArea = fileId;
    sActive = TRUE;
}

BOOL PaperWhite2_Encounters_IsActive(void) {
    return sActive;
}

BOOL PaperWhite2_Encounters_HasData(void) {
    return sHeaderRead;
}

static u32 Clamp(u32 level, u32 min, u32 max) {
    if (level < min) {
        return min;
    }
    if (level > max) {
        return max;
    }
    return level;
}

// The day's outbreak: one of them, from the day and the save's daily roll of the swarm location. -1 for none
static s32 GetOutbreakId(GameData *gameData, const ConditionContext *ctx) {
    u8 location;

    if (sHeader.outbreakIds == 0 || !EventWork_FlagGet(GameData_GetEventWork(gameData), FLAG_OUTBREAKS)) {
        return -1;
    }
    location = EncountSave_GetSwarmLocation(SaveControl_GetEncountSave(GameData_GetSaveControl(gameData)));
    return Conditions_Hash(ctx->dayNumber + OUTBREAK_KEY, location) % sHeader.outbreakIds;
}

// Whether a candidate can appear now by its own methods (own) or as one the rustling spots draw from (pooled)
static BOOL IsCandidateNow(const EncountersCandidate *c, const ConditionContext *ctx, u32 level, u32 encType,
                           BOOL *pooled) {
    BOOL own = (c->methods & (1 << encType)) != 0;

    *pooled = encType == ENCTYPE_GRASS_SHAKING && !own && (c->methods & sHeader.rustlingFrom) != 0 &&
              (sHeader.rustlingTiers & (1 << c->tier)) != 0;
    if (!own && !*pooled) {
        return FALSE;
    }
    if (!(c->seasons & (1 << ctx->season)) || !(c->times & (1 << ctx->period))) {
        return FALSE;
    }
    if (c->weather != 0 && (ctx->weather >= 16 || !(c->weather & (1 << ctx->weather)))) {
        return FALSE;
    }
    return level >= c->minLevel;
}

static BOOL HasSlot(const WildEncSlot *slots, u32 count, u16 species, u8 form) {
    u32 i;

    for (i = 0; i < count; i++) {
        if (slots[i].species == species && slots[i].form == form) {
            return TRUE;
        }
    }
    return FALSE;
}

// The slots that can appear now by a method, with their weights. spots is the rustling spot's kind for
// ENCTYPE_GRASS_SHAKING. Returns the count; pool gives the count of Pokémon besides the fixed species
static u8 BuildSlots(GameData *gameData, u32 encType, u32 spots, WildEncSlot *slots, u8 *pool) {
    const EncountersArea *area = GetArea();
    const EncountersCandidate *candidates = GetCandidates();
    const ConditionTable *table = GetTable();
    ConditionContext ctx;
    u32 tierCounts[ENCOUNTERS_TIER_MAX];
    u32 tierSum = 0;
    u32 total = 0;
    u32 level, low, high, rng;
    u8 count = 0;
    u8 own;
    s32 outbreak;
    u32 pass;
    u32 i;

    *pool = 0;
    if (!sActive || encType >= ENCTYPE_MAX) {
        return 0;
    }
    ConditionContext_Init(&ctx);
    ConditionContext_FillGame(&ctx, gameData);
    // A chance clause rolls anew for each encounter
    rng = GFL_RandomLC(0);
    level = sHeader.gate == ENCOUNTERS_GATE_SCALED ? ctx.scaledLevel : ctx.medianLevel;
    low = Conditions_ScaledLevelMin(ctx.scaledLevel);
    high = Conditions_ScaledLevelMax(ctx.scaledLevel);
    MI_CpuClear32(tierCounts, sizeof(tierCounts));
    // The candidates of the method first, then for rustling spots the area's Pokémon they draw from that aren't
    // among them yet
    for (pass = 0; pass < 2; pass++) {
        for (i = 0; i < area->count && count < ENCOUNTERS_SLOT_MAX; i++) {
            const EncountersCandidate *c = &candidates[i];
            BOOL pooled;

            if (!IsCandidateNow(c, &ctx, level, encType, &pooled) || pooled != (pass == 1) ||
                c->tier >= sHeader.tierCount) {
                continue;
            }
            // Shaking grass's species comes from its fixed share
            if (encType == ENCTYPE_GRASS_SHAKING && spots == ENCOUNTERS_SPOTS_GRASS &&
                c->species == sHeader.rustlingSpecies) {
                continue;
            }
            if (pooled && HasSlot(slots, count, c->species, c->form)) {
                continue;
            }
            if (c->rule != ENCOUNTERS_NO_RULE && (table == NULL || !Conditions_MatchRule(table, c->rule, &ctx, &rng))) {
                continue;
            }
            slots[count].species = c->species;
            slots[count].form = c->form;
            slots[count].minLevel = Clamp(low, c->minLevel, c->maxLevel);
            slots[count].maxLevel = Clamp(high, c->minLevel, c->maxLevel);
            sSlotCandidate[count] = i;
            tierCounts[c->tier]++;
            count++;
        }
    }
    // Each tier present takes its share, split evenly among its Pokémon; the tiers present make the whole
    for (i = 0; i < sHeader.tierCount; i++) {
        if (tierCounts[i] != 0) {
            tierSum += sHeader.tierShares[i];
        }
    }
    for (i = 0; i < count; i++) {
        u32 tier = candidates[sSlotCandidate[i]].tier;

        sWeights[i] = tierSum != 0 ? sHeader.tierShares[tier] * WEIGHT_SCALE / tierCounts[tier] : 0;
        total += sWeights[i];
    }
    own = count;
    *pool = count;
    // Shaking grass's species takes its fixed share, or every encounter where no other Pokémon can appear
    if (encType == ENCTYPE_GRASS_SHAKING && spots == ENCOUNTERS_SPOTS_GRASS && sHeader.rustlingSpecies != 0) {
        u32 share = own != 0 ? sHeader.spotShares[ENCOUNTERS_SPOTS_GRASS] : 100;

        slots[count].species = sHeader.rustlingSpecies;
        slots[count].form = 0;
        slots[count].minLevel = Clamp(low, sHeader.rustlingMin, sHeader.rustlingMax);
        slots[count].maxLevel = Clamp(high, sHeader.rustlingMin, sHeader.rustlingMax);
        sSlotCandidate[count] = SLOT_SPECIAL;
        sWeights[count] = share >= 100 || total == 0 ? WEIGHT_SCALE : total * share / (100 - share);
        total += sWeights[count];
        count++;
    }
    // The day's outbreak here takes its share, the rest scaled down
    outbreak = GetOutbreakId(gameData, &ctx);
    if (outbreak >= 0) {
        for (i = 0; i < sHeader.outbreakCount && count < ENCOUNTERS_SLOTS; i++) {
            const EncountersOutbreak *o = &sOutbreaks[i];
            u32 share = count != 0 ? sHeader.outbreakShare : 100;

            if (o->id != outbreak || o->area != sArea || !(o->methods & (1 << encType)) ||
                !(o->seasons & (1 << ctx.season)) || !(o->times & (1 << ctx.period)) || level < o->minLevel) {
                continue;
            }
            slots[count].species = o->species;
            slots[count].form = o->form;
            slots[count].minLevel = Clamp(low, o->minLevel, o->maxLevel);
            slots[count].maxLevel = Clamp(high, o->minLevel, o->maxLevel);
            sSlotCandidate[count] = SLOT_SPECIAL;
            sWeights[count] = share >= 100 || total == 0 ? WEIGHT_SCALE : total * share / (100 - share);
            count++;
            break;
        }
    }
    return count;
}

u8 PaperWhite2_Encounters_PrepareSlots(EncountManager *manager, WildEncSlot *slots) {
    u32 spots = sSpots != SPOTS_NONE ? sSpots : GetArea()->spots;
    u8 pool;

    sSpots = SPOTS_NONE;
    sSlotCount = BuildSlots(manager->gameData, manager->encType, spots, slots, &pool);
    sSlots = slots;
    sPartner = FALSE;
    manager->slotFuncIndex = ENCOUNTERS_SLOT_FUNC;
    manager->slotCount = sSlotCount;
    return sSlotCount;
}

static int PickWeighted(const u32 *weights, int count) {
    u32 total = 0;
    u32 roll;
    int i;

    for (i = 0; i < count; i++) {
        total += weights[i];
    }
    if (total == 0) {
        return 0;
    }
    roll = GFL_RandomLC(total);
    for (i = 0; i < count; i++) {
        if (roll < weights[i]) {
            return i;
        }
        roll -= weights[i];
    }
    return count - 1;
}

int PaperWhite2_Encounters_PickSlot(int count) {
    return PickWeighted(sPartner ? sPartnerWeights : sWeights, count);
}

void PaperWhite2_Encounters_SetupParam(const WildEncSlot *slot, WildPkmParam *param) {
    u32 chance;

    if (sSlots == NULL || slot < sSlots || slot >= sSlots + sSlotCount) {
        return;
    }
    sPicked = slot - sSlots;
    chance = sSlotCandidate[sPicked] != SLOT_SPECIAL ? GetCandidates()[sSlotCandidate[sPicked]].hiddenAbility
                                                     : sHeader.hiddenAbility;
    param->hiddenAbility = GFL_RandomLC(100) < chance;
}

void PaperWhite2_Encounters_RollPartner(EncountManager *manager, u32 able) {
    const EncountersCandidate *picked;
    u32 total = 0;
    u32 roll;
    u32 i;

    if (!sActive || sSlots == NULL || manager->doubleBattle || manager->isFishing || able < 2 ||
        sSlotCandidate[sPicked] == SLOT_SPECIAL) {
        return;
    }
    picked = &GetCandidates()[sSlotCandidate[sPicked]];
    roll = GFL_RandomLC(100);
    if (roll < picked->single || picked->doubleChance + picked->triple == 0) {
        return;
    }
    for (i = 0; i < sSlotCount; i++) {
        BOOL family = sSlotCandidate[i] != SLOT_SPECIAL && GetCandidates()[sSlotCandidate[i]].family == picked->family;

        sPartnerWeights[i] = picked->partners == ENCOUNTERS_PARTNERS_AREA || family ? sWeights[i] : 0;
        total += sPartnerWeights[i];
    }
    if (total == 0) {
        return;
    }
    manager->doubleBattle = TRUE;
    // A triple past the double's chance, when three can fight
    manager->pokeCount = picked->triple != 0 && able >= 3 && roll >= picked->single + picked->doubleChance ? 3 : 2;
}

void PaperWhite2_Encounters_BeginPartner(void) {
    sPartner = TRUE;
}

void PaperWhite2_Encounters_EndPartner(void) {
    sPartner = FALSE;
}

BOOL PaperWhite2_Encounters_SpotGivesItem(GameData *gameData, u32 spots) {
    WildEncSlot slots[ENCOUNTERS_SLOTS];
    u8 pool;

    sSpots = spots;
    if (!sActive) {
        return FALSE;
    }
    BuildSlots(gameData, ENCTYPE_GRASS_SHAKING, spots, slots, &pool);
    return pool == 0 || GFL_RandomLC(100) < sHeader.spotShares[spots];
}

void PaperWhite2_Encounters_SetSpots(u32 spots) {
    sSpots = spots;
}

u16 PaperWhite2_Encounters_OutbreakZone(GameData *gameData) {
    ConditionContext ctx;
    s32 outbreak;
    u32 i;

    if (!sHeaderRead) {
        return 0xffff;
    }
    ConditionContext_Init(&ctx);
    ConditionContext_FillWorld(&ctx, gameData);
    outbreak = GetOutbreakId(gameData, &ctx);
    for (i = 0; outbreak >= 0 && i < sHeader.outbreakCount; i++) {
        if (sOutbreaks[i].id == outbreak) {
            return sOutbreaks[i].zone;
        }
    }
    return 0xffff;
}
