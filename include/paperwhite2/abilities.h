#ifndef PAPERWHITE2_ABILITIES_H
#define PAPERWHITE2_ABILITIES_H

#include "types.h"
#include "paperwhite2/abilities_config.h"

// Paper White 2: the abilities the hack adds (docs/paperwhite2/design/moves-and-abilities.md). generated/abilities.txt
// appends them after Teravolt, from PAPERWHITE2_ABILITY_FIRST_ADDED (165), up to 255 (a Pokémon keeps its ability in
// a byte); tools/data/ability_list.py is the same definition for the tools, and tools/paperwhite2/abilities.py
// generates PAPERWHITE2_ABILITY_ADDED_COUNT and the added abilities' table.
//
// Without added abilities the lookup below is the ability itself, so each hook is the original code.

// Whether an ability is one the hack adds
static inline BOOL PaperWhite2_IsAddedAbility(u32 ability) {
    return ability - PAPERWHITE2_ABILITY_FIRST_ADDED < PAPERWHITE2_ABILITY_ADDED_COUNT;
}

#if PAPERWHITE2_ABILITY_ADDED_COUNT != 0
// The ability whose battle handlers an ability takes in sAbilityEventAddTable: an added ability's "handlers_like", or
// else its own (a row the hack's battle code adds, if any); any other ability's own
u16 PaperWhite2_GetAbilityHandlersAbility(u16 ability);
#else
#define PaperWhite2_GetAbilityHandlersAbility(ability) (ability)
#endif

#endif // PAPERWHITE2_ABILITIES_H
