#ifndef PAPERWHITE2_POKEMON_FORMS_H
#define PAPERWHITE2_POKEMON_FORMS_H

#include "types.h"
#include "paperwhite2/species.h"
#include "pml/evolution.h"
#include "struct_decls.h"

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

// An evolution's form condition (res/pokemon's evolutions' "form", docs/paperwhite2/design/form-evolutions.md): the
// method's high byte is the only form that evolves that way, plus one, or 0 for every form, as
// tools/data/species_data.py packs it. The original game's methods are all below 256, so its data has none
#define EVOLUTION_FORM_SHIFT 8
#define EVOLUTION_METHOD_MASK 0xff

// A species' EVOLUTION_COUNT evolutions as a Pokémon of form sees them: those for another form cleared to
// EVO_METHOD_NONE and the condition stripped from the rest, so that every reader of the list after it
// (CheckEvolveSpecies' modes, the Link Cord, the Pokédex Info page's Evo) sees the original game's methods
void PaperWhite2_FilterFormEvolutions(Evolution *evolutions, u16 form);
// The first of a species' evolutions that its form takes, from a handle on ARCID_EVOLUTIONS, without its condition, or
// an empty one (EVO_METHOD_NONE) for a form that can't evolve: a no_evolution form, or one that none of them is for.
// The original game's readers of the first evolution use it: the Xtransceiver's Professor (local_tvt_person_doctor.c)
void PaperWhite2_GetFormEvolution(ArcTool *evolutionFile, u16 species, u16 form, Evolution *dest);
// Whether a species' form can evolve at all, by PaperWhite2_GetFormEvolution: Eviolite asks it (CheckEvolution,
// btl_server_flow.c), as the original asked whether the species has a first evolution
BOOL PaperWhite2_FormCanEvolve(ArcTool *evolutionFile, u16 species, u16 form);

#endif // PAPERWHITE2_POKEMON_FORMS_H
