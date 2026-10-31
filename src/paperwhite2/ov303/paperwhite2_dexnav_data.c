#include "types.h"
#include "nitro/mi.h"
#include "paperwhite2/dexnav.h"
#include "paperwhite2/encounters.h"
#include "save/pokedex_savedata.h"
#include "system/game_data.h"

// Paper White 2: the DexNav's lists, from the wild encounters' data (paperwhite2/dexnav.h). The shares are the editor's
// (editor/src/modules/encounters/resolve.ts): each slot's weight over the method's whole, a Pokémon's slots summed, and
// a dust cloud's or a bridge shadow's items at their fixed share, the Pokémon sharing the rest

const u8 DEXNAV_METHOD_ORDER[DEXNAV_METHOD_COUNT] = {
    ENCTYPE_SURF,  ENCTYPE_SURF_RARE,  ENCTYPE_FISHING,       ENCTYPE_FISHING_RARE,
    ENCTYPE_GRASS, ENCTYPE_GRASS_RARE, ENCTYPE_GRASS_SHAKING,
};

// A share in tenths of a percent
#define SHARE_WHOLE 1000

static DexnavEntry *FindEntry(DexnavMethod *method, u16 species, u8 form);
static void SortByShare(DexnavMethod *method);
static void BuildMethod(DexnavMethod *method, const EncountersBuild *build, u32 itemShare, PokeDexSave *pokedex);

static DexnavEntry *FindEntry(DexnavMethod *method, u16 species, u8 form) {
    u32 i;

    for (i = 0; i < method->count; i++) {
        if (method->entries[i].species == species && method->entries[i].form == form &&
            method->entries[i].from != DEXNAV_FROM_ITEMS) {
            return &method->entries[i];
        }
    }
    return NULL;
}

// Most common first; the order of the build among equals
static void SortByShare(DexnavMethod *method) {
    u32 i, j;

    for (i = 1; i < method->count; i++) {
        DexnavEntry entry = method->entries[i];

        for (j = i; j > 0 && method->entries[j - 1].share < entry.share; j--) {
            method->entries[j] = method->entries[j - 1];
        }
        method->entries[j] = entry;
    }
}

static void BuildMethod(DexnavMethod *method, const EncountersBuild *build, u32 itemShare, PokeDexSave *pokedex) {
    const EncountersHeader *header = PaperWhite2_Encounters_GetHeader();
    u32 total = 0;
    u32 i;

    for (i = 0; i < build->count; i++) {
        total += build->weights[i];
    }
    // The items take their share first, the Pokémon the rest
    if (itemShare != 0) {
        DexnavEntry *items = &method->entries[method->count++];

        MI_CpuFill8(items, 0, sizeof(DexnavEntry));
        items->from = DEXNAV_FROM_ITEMS;
        items->share = build->pool == 0 ? SHARE_WHOLE : itemShare * SHARE_WHOLE / 100;
    }
    for (i = 0; i < build->count && total != 0; i++) {
        const WildEncSlot *slot = &build->slots[i];
        u32 share = build->weights[i] * SHARE_WHOLE / total;
        DexnavEntry *entry = FindEntry(method, slot->species, slot->form);
        const EncountersCandidate *candidate;

        if (itemShare != 0) {
            share = share * (100 - itemShare) / 100;
        }
        if (entry != NULL) {
            entry->share += share;
            if (slot->minLevel < entry->minLevel) {
                entry->minLevel = slot->minLevel;
            }
            if (slot->maxLevel > entry->maxLevel) {
                entry->maxLevel = slot->maxLevel;
            }
            continue;
        }
        if (method->count >= DEXNAV_ENTRY_MAX) {
            break;
        }
        entry = &method->entries[method->count++];
        candidate = build->candidate[i] != ENCOUNTERS_SLOT_SPECIAL
                        ? PaperWhite2_Encounters_GetCandidate(build->candidate[i])
                        : NULL;
        entry->species = slot->species;
        entry->form = slot->form;
        entry->from = build->from[i];
        entry->share = share;
        entry->minLevel = slot->minLevel;
        entry->maxLevel = slot->maxLevel;
        entry->hiddenAbility = candidate != NULL ? candidate->hiddenAbility : header->hiddenAbility;
        entry->seen = PokeDex_IsSeen(pokedex, slot->species);
        entry->caught = PokeDex_IsCaught(pokedex, slot->species);
        entry->padding = 0;
    }
    SortByShare(method);
}

void Dexnav_Build(DexnavData *data, const ConditionContext *ctx, GameData *gameData) {
    const EncountersArea *area = PaperWhite2_Encounters_GetCurrentArea();
    const EncountersHeader *header = PaperWhite2_Encounters_GetHeader();
    PokeDexSave *pokedex = GameData_GetPokedex(gameData);
    s32 outbreak = PaperWhite2_Encounters_GetOutbreak(gameData, ctx);
    EncountersBuild build;
    u32 i;

    MI_CpuFill8(data, 0, sizeof(DexnavData));
    data->active = area != NULL && header != NULL;
    if (!data->active) {
        return;
    }
    for (i = 0; i < DEXNAV_METHOD_COUNT; i++) {
        DexnavMethod *method = &data->methods[i];
        // The same rolls each time the app builds its lists
        u32 rng = ctx->loadSeed;
        u32 itemShare = 0;

        method->rate = area->rates[ctx->season][i];
        if (method->rate == 0) {
            continue;
        }
        PaperWhite2_Encounters_Build(ctx, i, area->spots, outbreak, &rng, &build);
        // A dust cloud or a bridge shadow gives its items at their share, or always with no Pokémon there
        if (i == ENCTYPE_GRASS_SHAKING && area->spots != ENCOUNTERS_SPOTS_GRASS) {
            itemShare = build.pool != 0 ? header->spotShares[area->spots] : 100;
        }
        BuildMethod(method, &build, itemShare, pokedex);
    }
}
