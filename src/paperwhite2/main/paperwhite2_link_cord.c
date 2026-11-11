#include "types.h"
#include "constants/pokemon.h"
#include "constants/species.h"
#include "paperwhite2/link_cord.h"
#include "pml/poke_party.h"

// Paper White 2: the Link Cord, which evolves the Pokémon that evolve by trade (include/paperwhite2/link_cord.h)

BOOL PaperWhite2_LinkCordEvolves(PokeParty *party, PartyPkm *pkm, u16 method, u16 param, u16 heldItem) {
    switch (method) {
    case EVO_METHOD_TRADE:
        return TRUE;
    case EVO_METHOD_TRADE_WITH_ITEM:
        return heldItem == param;
    case EVO_METHOD_TRADE_WITH_SPECIES:
        return PaperWhite2_FindLinkCordPartner(party, pkm) >= 0;
    }
    return FALSE;
}

int PaperWhite2_FindLinkCordPartner(PokeParty *party, PartyPkm *pkm) {
    u32 species;
    u32 partner;
    int i;

    if (party == NULL) {
        return -1;
    }
    // The pair that the trade's check names (CheckEvolveSpecies' EVO_CHECK_TRADE)
    species = PokeParty_GetParam(pkm, PKM_PARAM_SPECIES, NULL);
    if (species == SPECIES_KARRABLAST) {
        partner = SPECIES_SHELMET;
    } else if (species == SPECIES_SHELMET) {
        partner = SPECIES_KARRABLAST;
    } else {
        return -1;
    }
    for (i = 0; i < PokeParty_GetPkmCount(party); i++) {
        PartyPkm *other = PokeParty_GetPkm(party, i);

        if (PokeParty_GetParam(other, PKM_PARAM_SPECIES, NULL) == partner &&
            !PokeParty_GetParam(other, PKM_PARAM_IS_EGG, NULL)) {
            return i;
        }
    }
    return -1;
}
