#include "types.h"
#include "constants/items.h"
#include "constants/pokemon.h"
#include "paperwhite2/field_moves.h"
#include "pml/item.h"
#include "pml/poke_party.h"
#include "save/bag.h"

// Paper White 2: which party Pokémon uses a field move, by knowing it or, for an HM's, by being able to learn it while
// the HM is in the bag (paperwhite2/field_moves.h)

// The HMs, HM01 to HM06, after the TMs' items
#define FIELD_MOVES_HM_COUNT 6

BOOL PaperWhite2_FieldMoves_CanUseHM(PartyPkm *pkm, BagSave *bag, u16 move) {
    u16 i;

    if (PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL) != 0) {
        return FALSE;
    }
    for (i = 0; i < FIELD_MOVES_HM_COUNT; i++) {
        if (PML_ItemGetTMMoveID(ITEM_HM01 + i) == move) {
            // The HM in the bag stands in for the badges White 2 doesn't check, keeping the original's progression
            return BagSave_GetExistingItemCount(bag, ITEM_HM01 + i) != 0 &&
                   canPkmLearnTM_Wrapper(pkm, PML_ItemGetTMBitMask(ITEM_HM01 + i));
        }
    }
    return FALSE;
}

// Whether the Pokémon, not an egg, knows the move (the scripts' CheckPokeMoveLearned_NonEgg)
static BOOL PaperWhite2_FieldMoves_Knows(PartyPkm *pkm, u16 move) {
    u32 slot;

    if (PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL) != 0) {
        return FALSE;
    }
    for (slot = 0; slot < 4; slot++) {
        if (PokeParty_GetParam(pkm, PKM_PARAM_MOVE1 + slot, NULL) == move) {
            return TRUE;
        }
    }
    return FALSE;
}

u32 PaperWhite2_FieldMoves_FindUser(PokeParty *party, BagSave *bag, u16 move) {
    u32 count = PokeParty_GetPkmCount(party);
    u32 i;

    for (i = 0; i < count; i++) {
        if (PaperWhite2_FieldMoves_Knows(PokeParty_GetPkm(party, i), move)) {
            return i;
        }
    }
    for (i = 0; i < count; i++) {
        if (PaperWhite2_FieldMoves_CanUseHM(PokeParty_GetPkm(party, i), bag, move)) {
            return i;
        }
    }
    return FIELD_MOVE_NO_USER;
}
