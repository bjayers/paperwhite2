#include "types.h"
#include "constants/pokemon.h"
#include "constants/species.h"
#include "gfl/arc.h"
#include "nitro/mi.h"
#include "paperwhite2/pokemon_forms.h"
#include "paperwhite2/pokemon_forms_config.h"
#include "paperwhite2/species.h"

// Paper White 2: the hack's own forms of existing species (include/paperwhite2/pokemon_forms.h). The tables are
// generated from res/pokemon by tools/paperwhite2/pokemon_forms.py

typedef struct {
    u16 species;
    u16 form;
} PokemonForm;

// The icon palettes of the hack's form sprite groups, the male's, or the only one, in the low nibble and the female's
// in the high one, then an unused 0, so that the table has an entry with no groups
static const u8 sFormIconPalettes[POKEMON_FORMS_ADDED_GROUPS + 1] = { POKEMON_FORMS_ICON_PALETTES };
// The forms that never evolve, until SPECIES_NONE's
static const PokemonForm sNoEvolutionForms[] = { POKEMON_FORMS_NO_EVOLUTION };

u8 PaperWhite2_GetFormIconPalette(u32 group, BOOL female) {
    u8 palettes;

    if (group < POKEMON_FORMS_ORIGINAL_GROUPS || group >= POKEMON_FORMS_ORIGINAL_GROUPS + POKEMON_FORMS_ADDED_GROUPS) {
        return 0;
    }
    palettes = sFormIconPalettes[group - POKEMON_FORMS_ORIGINAL_GROUPS];
    return female ? palettes >> 4 : palettes & 0xf;
}

BOOL PaperWhite2_FormCannotEvolve(u16 species, u16 form) {
    const PokemonForm *entry;

    for (entry = sNoEvolutionForms; entry->species != SPECIES_NONE; entry++) {
        if (entry->species == species && entry->form == form) {
            return TRUE;
        }
    }
    return FALSE;
}

void PaperWhite2_FilterFormEvolutions(Evolution *evolutions, u16 form) {
    u32 i;

    for (i = 0; i < EVOLUTION_COUNT; i++) {
        u32 condition = evolutions[i].method >> EVOLUTION_FORM_SHIFT;

        if (condition != 0 && condition != form + 1) {
            evolutions[i].method = EVO_METHOD_NONE;
        } else {
            evolutions[i].method &= EVOLUTION_METHOD_MASK;
        }
    }
}

void PaperWhite2_GetFormEvolution(ArcTool *evolutionFile, u16 species, u16 form, Evolution *dest) {
    Evolution evolutions[EVOLUTION_COUNT];
    u32 i;

    MI_CpuFill8(dest, 0, sizeof(Evolution));
    if (PaperWhite2_FormCannotEvolve(species, form)) {
        return;
    }
    GFL_ArcToolRead(evolutionFile, species, evolutions);
    PaperWhite2_FilterFormEvolutions(evolutions, form);
    for (i = 0; i < EVOLUTION_COUNT; i++) {
        if (evolutions[i].method != EVO_METHOD_NONE) {
            *dest = evolutions[i];
            return;
        }
    }
}

BOOL PaperWhite2_FormCanEvolve(ArcTool *evolutionFile, u16 species, u16 form) {
    Evolution evolution;

    PaperWhite2_GetFormEvolution(evolutionFile, species, form, &evolution);
    return evolution.method != EVO_METHOD_NONE;
}

#if PAPERWHITE2_SPECIES_ADDED_COUNT != 0
// The added species' tables (include/paperwhite2/species.h): their icons' palettes, as sFormIconPalettes, and those
// that never enter the Pokédex, a bit each from the first. Without added species nothing calls these, so they aren't
// built and the ROM is the one before them
static const u8 sSpeciesIconPalettes[PAPERWHITE2_SPECIES_ADDED_COUNT + 1] = { PAPERWHITE2_SPECIES_ICON_PALETTES };
static const u8 sHiddenSpecies[PAPERWHITE2_SPECIES_ADDED_COUNT / 8 + 1] = { PAPERWHITE2_SPECIES_NOT_IN_POKEDEX };

BOOL PaperWhite2_IsHiddenSpecies(u32 species) {
    u32 index = species - PAPERWHITE2_SPECIES_FIRST_ADDED;

    if (!PaperWhite2_IsAddedSpecies(species)) {
        return FALSE;
    }
    return (sHiddenSpecies[index / 8] >> (index % 8)) & 1;
}

u8 PaperWhite2_GetSpeciesIconPalette(u32 species, BOOL female) {
    u8 palettes;

    if (!PaperWhite2_IsAddedSpecies(species)) {
        return 0;
    }
    palettes = sSpeciesIconPalettes[species - PAPERWHITE2_SPECIES_FIRST_ADDED];
    return female ? palettes >> 4 : palettes & 0xf;
}
#endif
