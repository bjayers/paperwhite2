#include "types.h"
#include "battle/btl_result.h"
#include "battle/btl_setup.h"
#include "constants/pokemon.h"
#include "field/field_script_event.h"
#include "gfl/heap.h"
#include "paperwhite2/shiny_candy.h"
#include "pml/poke_party.h"
#include "system/game_event.h"

// Paper White 2: the Shiny Candy that a wild shiny Pokémon whose PID says so drops when the player defeats it, in
// overlay 12 beside the wild battle's event (event_battle.c)

static BOOL PaperWhite2_IsShinyCandyDropped(BOOL candyFoe, u32 result);

BOOL PaperWhite2_HasShinyCandyFoe(BtlSetup *setup) {
    PokeParty *party = BtlSetup_GetParty(setup, 1);
    int count;
    int i;

    if (party == NULL) {
        return FALSE;
    }
    count = PokeParty_GetPkmCount(party);
    for (i = 0; i < count; i++) {
        PartyPkm *pkm = PokeParty_GetPkm(party, i);

        if (PokeParty_IsRare(pkm) && PaperWhite2_IsShinyCandyDropper(PokeParty_GetParam(pkm, PKM_PARAM_PID, NULL))) {
            return TRUE;
        }
    }
    return FALSE;
}

void PaperWhite2_ShinyCandyDrop(GameEvent *event, BOOL candyFoe, u32 result) {
    if (!PaperWhite2_IsShinyCandyDropped(candyFoe, result)) {
        return;
    }
    GameEvent_ChainNext(
        event, EventScriptCall_Create(GameEvent_GetGameSystem(event), SCRID_SHINY_CANDY_DROP, NULL, HEAPID_FIELDMAP));
}

// Only a victory counts: the wild Pokémon fainted, rather than being caught or running away
static BOOL PaperWhite2_IsShinyCandyDropped(BOOL candyFoe, u32 result) {
    return candyFoe && result == BTL_RESULT_VICTORY;
}
