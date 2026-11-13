#ifndef PAPERWHITE2_SPECIES_H
#define PAPERWHITE2_SPECIES_H

#include "types.h"
#include "constants/species.h"
#include "paperwhite2/pokemon_forms_config.h"

// Paper White 2: the species the hack adds (docs/paperwhite2/design/new-species.md). generated/species.txt appends them
// after the Pokéstar Studios species, from PAPERWHITE2_SPECIES_FIRST_ADDED (687): 685 and 686 stay reserved, since the
// game already treats them as the egg and Manaphy's egg. tools/data/species_list.py is the same definition for the
// tools, and tools/paperwhite2/pokemon_forms.py generates the counts and bases from res/pokemon:
// - PAPERWHITE2_SPECIES_ADDED_COUNT, and PAPERWHITE2_SPECIES_LAST, the last species a Pokémon can be (Genesect
//   without added species);
// - PAPERWHITE2_SPECIES_SPRITE_FILES and PAPERWHITE2_SPECIES_ICON_FILES, the first of their battle sprite groups (20
//   files a species) and icons (2 files) after the hack's form groups, and PAPERWHITE2_SPECIES_CRY_FIRST, the wave
//   archive of the first one's cry;
// - their icons' palettes, and those that never enter the Pokédex ("pokedex": false in their data.json).
//
// Each check is written so that it is the original one when no species is added: the unsigned difference below a
// count of 0 is never true, which the compiler folds away, so the ROM is the one before the species code.

// Whether a species is one the hack adds
static inline BOOL PaperWhite2_IsAddedSpecies(u32 species) {
    return species - PAPERWHITE2_SPECIES_FIRST_ADDED < PAPERWHITE2_SPECIES_ADDED_COUNT;
}

// Whether an added species never enters the Pokédex ("pokedex": false)
BOOL PaperWhite2_IsHiddenSpecies(u32 species);

// The checks of several conditions are macros: an inline function returning one makes the compiler put its value in a
// register before branching on it, unlike the original checks that these replace, so the ROM would change

// Whether a species is a Pokémon's: from Bulbasaur to Genesect, or an added species. The egg, the bad egg, the
// Pokéstar Studios species and the reserved IDs aren't
#define PML_IsRealSpecies(species)                                                                                     \
    (((species) != SPECIES_NONE && (species) <= SPECIES_GENESECT) || PaperWhite2_IsAddedSpecies(species))

// Whether a species is one the Pokédex has: a real species but the added ones that never enter it
#define PaperWhite2_IsPokedexSpecies(species)                                                                          \
    (((species) != SPECIES_NONE && (species) <= SPECIES_GENESECT) ||                                                   \
     (PaperWhite2_IsAddedSpecies(species) && !PaperWhite2_IsHiddenSpecies(species)))

// Whether a loop over the species up to the Pokédex's last (POKEDEX_SPECIES_MAX) skips one: the IDs from SPECIES_EGG
// to the first added species, and the added species that never enter the Pokédex. FALSE without added species
#define PaperWhite2_IsSkippedPokedexSpecies(species)                                                                   \
    (PAPERWHITE2_SPECIES_ADDED_COUNT != 0 && (species) > SPECIES_GENESECT && !PaperWhite2_IsPokedexSpecies(species))

// The palette of an added species' icon, the female's with female, as sPokeIconPalettes gives the others'
u8 PaperWhite2_GetSpeciesIconPalette(u32 species, BOOL female);

#endif // PAPERWHITE2_SPECIES_H
