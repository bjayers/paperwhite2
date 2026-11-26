#include "types.h"
#include "constants/pokemon.h"
#include "field/enc_pokeset.h"
#include "gfl/random.h"
#include "paperwhite2/roamers.h"
#include "pml/poke_party.h"

// Paper White 2: the roaming legendaries' roll and their battle's Pokémon, in overlay 36 beside the wild encounters'.
// See include/paperwhite2/roamers.h

// The percent of a roamer's odds
#define ODDS_RANGE 100

// The methods (ROAMER_METHOD_*) of an encounter type: walking in grass and dark grass (and on a cave's floor, which
// is grass's type) or a rustling spot, surfing, fishing
static u32 RoamersField_GetMethod(u32 encType) {
    switch (encType) {
    case ENCTYPE_GRASS:
    case ENCTYPE_GRASS_RARE:
    case ENCTYPE_GRASS_SHAKING:
        return ROAMER_METHOD_WALK;
    case ENCTYPE_SURF:
    case ENCTYPE_SURF_RARE:
        return ROAMER_METHOD_SURF;
    case ENCTYPE_FISHING:
    case ENCTYPE_FISHING_RARE:
        return ROAMER_METHOD_FISH;
    }
    return 0;
}

u32 PaperWhite2_Roamers_Roll(EncountManager *manager, u32 zoneId, u32 encType) {
    RoamersSave *save = Roamers_GetSave(manager->gameData);
    u32 route = Roamers_GetRoute(zoneId);
    u32 method = RoamersField_GetMethod(encType);
    u32 i;

    if (route == ROAMERS_NONE) {
        return ROAMERS_NONE;
    }
    // At most one roamer is on a route
    for (i = 0; i < ROAMERS_COUNT; i++) {
        Roamer *roamer = &save->roamers[i];

        if (roamer->state != ROAMER_STATE_ROAMING || Roamers_GetRoute(roamer->zone) != route) {
            continue;
        }
        if (!(Roamers_GetData(i)->methods & method) ||
            FieldEncount_PaperWhite2_IsLevelRepelled(manager, roamer->level) ||
            GFL_RandomLCAlt(ODDS_RANGE) >= Roamers_GetData(i)->odds) {
            return ROAMERS_NONE;
        }
        roamer->flags |= ROAMER_FLAG_SEEN;
        save->battleSlot = i;
        return i;
    }
    return ROAMERS_NONE;
}

void PaperWhite2_Roamers_MakePkm(PartyPkm *pkm, GameData *gameData, u32 slot, u32 trainerId) {
    Roamer *roamer = &Roamers_GetSave(gameData)->roamers[slot];

    PokeParty_CreatePkm(pkm, roamer->species, roamer->level, trainerId, roamer->ivs, roamer->personality);
    PokeParty_SetParam(pkm, PKM_PARAM_FORM, roamer->form);
    PokeParty_SetParam(pkm, PKM_PARAM_NATURE, roamer->nature);
    PokeParty_RecalcStats(pkm);
    // The stats come first, so that the HP kept isn't moved by them
    if (roamer->hp != ROAMERS_HP_FULL) {
        PokeParty_SetParam(pkm, PKM_PARAM_HP, roamer->hp);
    }
    PokeParty_SetParam(pkm, PKM_PARAM_STATUS, roamer->status);
}
