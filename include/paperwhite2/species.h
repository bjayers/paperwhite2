#ifndef PAPERWHITE2_SPECIES_H
#define PAPERWHITE2_SPECIES_H

#include "types.h"
#include "constants/species.h"
#include "gfl/heap.h"
#include "paperwhite2/pokemon_forms_config.h"
#include "struct_decls.h"

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

// Whether a species never enters the Pokédex: an added species with "pokedex": false. FALSE without added species
#define PaperWhite2_IsNotInPokedex(species)                                                                            \
    (PAPERWHITE2_SPECIES_ADDED_COUNT != 0 && PaperWhite2_IsHiddenSpecies(species))

// The palette of an added species' icon, the female's with female, as sPokeIconPalettes gives the others'
u8 PaperWhite2_GetSpeciesIconPalette(u32 species, BOOL female);

// The Pokédex's numbering (docs/paperwhite2/design/new-species.md section 5). tools/paperwhite2/pokemon_forms.py
// generates, from res/pokemon and tools/data/species_list.py:
// - PAPERWHITE2_POKEDEX_ADDED_COUNT, the added species that the Pokédex has, and PAPERWHITE2_POKEDEX_LIST_COUNT, the
//   National list's length, 649 and those;
// - PAPERWHITE2_POKEDEX_ADDED_ORDER, their order after Genesect: by display number, those without one last;
// - PAPERWHITE2_POKEDEX_DISPLAY_NUMBERS, each added species' display number (pokedex.display_number in its data.json);
// - PAPERWHITE2_POKEDEX_INITIAL_STARTS and _ENDS, where each first letter's species are in the order by name.

// The number shown for a species that has none, "???": the regional table's for a species not in it, which the Info
// page and the summary already print as "???", so no display number is 999
#define PAPERWHITE2_POKEDEX_NUMBER_NONE 999

// The number that the Pokédex, the summary and the PC box show for a species: its ID from Bulbasaur to Genesect, an
// added species' display number, or PAPERWHITE2_POKEDEX_NUMBER_NONE for one without (or that never enters the
// Pokédex). A macro, so that without added species it is the species itself, as the original printed
#define PaperWhite2_PokedexDisplayNumber(species)                                                                      \
    (PaperWhite2_IsAddedSpecies(species) ? PaperWhite2_GetAddedDisplayNumber(species) : (species))

// An added species' display number, as PaperWhite2_PokedexDisplayNumber gives it
u16 PaperWhite2_GetAddedDisplayNumber(u32 species);

// The digits a Pokédex number prints with: 3 below 1000 ("001", as the original), 4 from 1000
#define PaperWhite2_PokedexNumberDigits(number) (PAPERWHITE2_SPECIES_ADDED_COUNT != 0 && (number) >= 1000 ? 4 : 3)

// Whether a number is the one shown as "???". FALSE without added species, whose numbers the original prints
#define PaperWhite2_IsPokedexNumberNone(number)                                                                        \
    (PAPERWHITE2_SPECIES_ADDED_COUNT != 0 && (number) == PAPERWHITE2_POKEDEX_NUMBER_NONE)

// Copies "???" into strbuf, the Pokédex's text for a species without a number (the Info page's, which the list rows
// print too)
void PaperWhite2_PokedexLoadNumberNone(StrBuf *strbuf, HeapID heapId);

// Where the Pokédex list's row puts the name after a number of 4 digits, which the string number holds in font: past
// the number with the room that 3 digits leave, or x, the 3 digits' place, if that is further right. The font's digits
// have widths of their own, so "1011" fits before x
u32 PaperWhite2_PokedexListNameX(const StrBuf *number, Font *font, u32 x);

// Puts the added species after Genesect in the National list: PAPERWHITE2_POKEDEX_ADDED_ORDER from list, which has
// room for PAPERWHITE2_POKEDEX_ADDED_COUNT
void PaperWhite2_PokedexAddSpecies(u16 *list);

// Leaves the added species that the player hasn't seen out of the National list of count species, which
// PaperWhite2_PokedexAddSpecies made, and returns its new length: they show only once seen
u32 PaperWhite2_PokedexHideUnseen(PokeDexSave *pokedex, u16 *list, u32 count);

// The species caught from Bulbasaur to Genesect: the National Pokédex's completion and evaluation count only those,
// while the counts the Pokédex shows (SEEN, OBTAINED) have the added species too
u16 PaperWhite2_PokedexGetCaughtOriginal(PokeDexSave *pokedex);

#endif // PAPERWHITE2_SPECIES_H
