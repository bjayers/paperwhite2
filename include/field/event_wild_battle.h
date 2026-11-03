#ifndef POKEBW2_FIELD_EVENT_WILD_BATTLE_H
#define POKEBW2_FIELD_EVENT_WILD_BATTLE_H

#include "types.h"
#include "struct_decls.h"
#ifdef PAPERWHITE2
#include "field/enc_pokeset.h"
#endif

// How a random encounter starts: by the player's steps, from an effect encounter's shaking grass or rippling water,
// or by Sweet Scent. The last two skip the encounter rate
enum {
    ENCOUNT_MODE_NORMAL,
    ENCOUNT_MODE_EFFECT,
    ENCOUNT_MODE_SWEET_SCENT,
    // The fishing event's mode for a bite off a calm spot, which takes the water's effect and BGM; a bite off a
    // rippling spot is ENCOUNT_MODE_EFFECT
    ENCOUNT_MODE_FISHING = 4,
};

GameEvent *EventWildBattleCall_CreateRandom(EncountSystem *encountSystem, u32 mode);

#ifdef PAPERWHITE2
// Paper White 2: the wanderers' encounters (paperwhite2_wanderers.c). A tile's encounter type (an ENCTYPE_*, or
// ENCTYPE_NONE); the one Pokémon a step in grass of encType would bring now, with its gender (GENDER_*) and its
// shininess, rolled as a wild one's and set in out for the battle, FALSE where none would; and the single battle with
// it
u32 EncSys_GetTileEncType(u32 tileType);
BOOL EventWildBattleCall_PickWanderer(EncountSystem *system, u32 encType, WildPkmParam *out, u8 *gender, BOOL *shiny);
GameEvent *EventWildBattleCall_CreateWanderer(EncountSystem *system, WildPkmParam *param, u32 encType);
#endif

#endif // POKEBW2_FIELD_EVENT_WILD_BATTLE_H
