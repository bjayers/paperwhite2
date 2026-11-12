#ifndef PAPERWHITE2_POKEMON_FORMS_H
#define PAPERWHITE2_POKEMON_FORMS_H

#include "types.h"

// Paper White 2: the hack's own forms of existing species, such as the Spiky-eared Pichu
// (docs/paperwhite2/design/forms-and-species.md, src/paperwhite2/main/paperwhite2_pokemon_forms.c).
//
// A form's sprite group is its species' forms.sprite_offset + form - 1 (res/pokemon/<species>/data.json). The original
// game's are 0 to 65; the hack's follow them from POKEMON_FORMS_ORIGINAL_GROUPS without gaps. The battle sprites'
// original form groups end where the Substitute's files start, so the hack's groups' files follow the Substitute's and
// Arceus' palettes, from the archive's original end, POKEMON_FORMS_SPRITE_FILES (GetPokemonDataIDBase,
// tools/data/pokemon_graphics.py). The icons' original form groups end at their archive's end, so the hack's icons
// follow them where PokeParty_GetIconIndex already looks, and only their palettes need a table of their own, past
// sPokeIconPalettes' end (PokeIcon_GetPalette). The Pokédex's form bits follow its form directory, POKEDEX_FORM_LIST,
// which tools/paperwhite2/pokemon_forms.py generates from the same data; the save remaps them when it changes
// (include/paperwhite2/pokedex_save.h).
#define POKEMON_FORMS_ORIGINAL_GROUPS 66
#define POKEMON_FORMS_SPRITE_FILES 15065

// The palette of the icon of the hack's form sprite group group (from POKEMON_FORMS_ORIGINAL_GROUPS), the female's
// with female, as sPokeIconPalettes gives the others'
u8 PaperWhite2_GetFormIconPalette(u32 group, BOOL female);
// Whether a species' form never evolves, whatever the species' evolutions say: res/pokemon's forms.no_evolution, such
// as the Spiky-eared Pichu, Pichu's form 1, as in HeartGold and SoulSilver (CheckEvolveSpecies, and the Pokédex Info
// page's Evo, which shows such a form alone)
BOOL PaperWhite2_FormCannotEvolve(u16 species, u16 form);

#endif // PAPERWHITE2_POKEMON_FORMS_H
