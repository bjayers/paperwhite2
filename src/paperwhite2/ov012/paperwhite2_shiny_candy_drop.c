#include "types.h"
#include "battle/btl_result.h"
#include "battle/btl_setup.h"
#include "field/field_script_event.h"
#include "gfl/heap.h"
#include "gfl/random.h"
#include "paperwhite2/shiny_candy.h"
#include "pml/poke_party.h"
#include "system/game_event.h"

// Paper White 2: the Shiny Candy that a wild shiny Pokémon drops when the player defeats it, in overlay 12 beside
// the wild battle's event (event_battle.c)

BOOL PaperWhite2_HasShinyFoe(BtlSetup *setup) {
    PokeParty *party = BtlSetup_GetParty(setup, 1);
    int count;
    int i;

    if (party == NULL) {
        return FALSE;
    }
    count = PokeParty_GetPkmCount(party);
    for (i = 0; i < count; i++) {
        if (PokeParty_IsRare(PokeParty_GetPkm(party, i))) {
            return TRUE;
        }
    }
    return FALSE;
}

// Only a victory counts: the wild Pokémon fainted, rather than being caught or running away
void PaperWhite2_ShinyCandyDrop(GameEvent *event, BOOL shinyFoe, u32 result) {
    if (!shinyFoe || result != BTL_RESULT_VICTORY || GFL_RandomLC(100) >= SHINY_CANDY_DROP_PERCENT) {
        return;
    }
    GameEvent_ChainNext(
        event, EventScriptCall_Create(GameEvent_GetGameSystem(event), SCRID_SHINY_CANDY_DROP, NULL, HEAPID_FIELDMAP));
}
