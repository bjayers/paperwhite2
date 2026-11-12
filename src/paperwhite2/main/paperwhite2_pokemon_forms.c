#include "types.h"
#include "constants/species.h"
#include "paperwhite2/pokemon_forms.h"
#include "paperwhite2/pokemon_forms_config.h"

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
