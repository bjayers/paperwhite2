#ifndef PAPERWHITE2_CONDITION_SCRIPT_H
#define PAPERWHITE2_CONDITION_SCRIPT_H

// Paper White 2: the arguments of the conditions' script commands (include/paperwhite2/condition_commands.h). Only
// #defines, since the scripts include it; with paperwhite2/script_conditions.h, the IDs of CheckCondition's conditions,
// which the build writes from res/paperwhite2/conditions/script_conditions.json

// GetPartyLevel's kinds: the party's level (Conditions_PartyLevel, Eggs left out); the adjusted level, the level wild
// Pokémon scale to (res/paperwhite2/level_scaling.json); and the lowest and highest wild level around it
#define PARTY_LEVEL_BASE 0
#define PARTY_LEVEL_ADJUSTED 1
#define PARTY_LEVEL_WILD_MIN 2
#define PARTY_LEVEL_WILD_MAX 3

#endif // PAPERWHITE2_CONDITION_SCRIPT_H
