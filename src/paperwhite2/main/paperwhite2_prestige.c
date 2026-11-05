#include "types.h"
#include "constants/pokemon.h"
#include "paperwhite2/level_scaling_config.h"
#include "paperwhite2/prestige.h"
#include "pml/personal.h"
#include "pml/poke_party.h"

// Paper White 2: Prestige levels past 100 (paperwhite2/prestige.h)

#define PRESTIGE_LEVEL_BITS 10
#define PRESTIGE_LEVEL_MASK ((1 << PRESTIGE_LEVEL_BITS) - 1)
#define PRESTIGE_EXP_MAX ((1 << 20) - 1)
#define PRESTIGE_MAX (LEVEL_SCALING_PRESTIGE_MAX - PRESTIGE_LEVEL_START)
#define PERCENT 100

// The Exp. units the next prestige level costs: what the species' level 99 to 100 does, grown by the percent for each
// level already gained, up to what the progress's bits hold
static u32 Prestige_GetCost(BoxPkm *pkm, u32 prestige) {
    u32 species = PML_PkmGetParam(pkm, PKM_PARAM_SPECIES, NULL);
    u32 form = PML_PkmGetParam(pkm, PKM_PARAM_FORM, NULL);
    u32 cost = (PML_UtilGetPkmLvExp(species, form, PRESTIGE_LEVEL_START) -
                PML_UtilGetPkmLvExp(species, form, PRESTIGE_LEVEL_START - 1)) /
               PRESTIGE_EXP_UNIT;
    u32 i;

    if (cost == 0) {
        cost = 1;
    }
    for (i = 0; i < prestige && cost < PRESTIGE_EXP_MAX; i++) {
        cost += cost * LEVEL_SCALING_PRESTIGE_GROWTH_PERCENT / PERCENT;
    }
    if (cost > PRESTIGE_EXP_MAX) {
        cost = PRESTIGE_EXP_MAX;
    }
    return cost;
}

static u32 Prestige_GetLevelAbove(BoxPkm *pkm) {
    u32 prestige = PML_PkmGetParam(pkm, PKM_PARAM_PRESTIGE, NULL) & PRESTIGE_LEVEL_MASK;

    if (prestige > PRESTIGE_MAX) {
        return PRESTIGE_MAX;
    }
    return prestige;
}

u32 PaperWhite2_GetShownLevel(BoxPkm *pkm) {
    u32 level = PML_PkmGetLevel(pkm);

    if (level < PRESTIGE_LEVEL_START) {
        return level;
    }
    return level + Prestige_GetLevelAbove(pkm);
}

BOOL PaperWhite2_HasPrestige(BoxPkm *pkm) {
    return PML_PkmGetLevel(pkm) >= PRESTIGE_LEVEL_START && Prestige_GetLevelAbove(pkm) != 0;
}

BOOL PaperWhite2_AddPrestigeExp(BoxPkm *pkm, u32 exp) {
    u32 value;
    u32 prestige;
    u32 progress;
    u32 cost;
    BOOL rose = FALSE;

    if (PML_PkmGetLevel(pkm) < PRESTIGE_LEVEL_START) {
        return FALSE;
    }
    value = PML_PkmGetParam(pkm, PKM_PARAM_PRESTIGE, NULL);
    prestige = value & PRESTIGE_LEVEL_MASK;
    if (prestige >= PRESTIGE_MAX) {
        return FALSE;
    }
    // Rounded to the nearest unit
    progress = (value >> PRESTIGE_LEVEL_BITS) + (exp + PRESTIGE_EXP_UNIT / 2) / PRESTIGE_EXP_UNIT;
    cost = Prestige_GetCost(pkm, prestige);
    while (progress >= cost && prestige < PRESTIGE_MAX) {
        progress -= cost;
        prestige++;
        rose = TRUE;
        cost = Prestige_GetCost(pkm, prestige);
    }
    if (prestige >= PRESTIGE_MAX || progress > PRESTIGE_EXP_MAX) {
        progress = prestige >= PRESTIGE_MAX ? 0 : PRESTIGE_EXP_MAX;
    }
    PML_PkmSetParam(pkm, PKM_PARAM_PRESTIGE, prestige | (progress << PRESTIGE_LEVEL_BITS));
    return rose;
}

BOOL PaperWhite2_AddPrestigeLevel(BoxPkm *pkm) {
    u32 prestige;

    if (PML_PkmGetLevel(pkm) < PRESTIGE_LEVEL_START) {
        return FALSE;
    }
    prestige = PML_PkmGetParam(pkm, PKM_PARAM_PRESTIGE, NULL) & PRESTIGE_LEVEL_MASK;
    if (prestige >= PRESTIGE_MAX) {
        return FALSE;
    }
    PML_PkmSetParam(pkm, PKM_PARAM_PRESTIGE, prestige + 1);
    return TRUE;
}

BOOL PaperWhite2_GetPrestigeProgress(BoxPkm *pkm, u32 *progress, u32 *cost, u32 *total) {
    u32 value;
    u32 prestige;
    u32 i;

    if (PML_PkmGetLevel(pkm) < PRESTIGE_LEVEL_START) {
        return FALSE;
    }
    value = PML_PkmGetParam(pkm, PKM_PARAM_PRESTIGE, NULL);
    prestige = value & PRESTIGE_LEVEL_MASK;
    if (prestige > PRESTIGE_MAX) {
        prestige = PRESTIGE_MAX;
    }
    *progress = (value >> PRESTIGE_LEVEL_BITS) * PRESTIGE_EXP_UNIT;
    *cost = Prestige_GetCost(pkm, prestige) * PRESTIGE_EXP_UNIT;
    *total = *progress;
    for (i = 0; i < prestige; i++) {
        *total += Prestige_GetCost(pkm, i) * PRESTIGE_EXP_UNIT;
    }
    return TRUE;
}
