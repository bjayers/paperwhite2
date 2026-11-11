#include "types.h"
#include "constants/items.h"
#include "constants/pokemon.h"
#include "demo/evolution_demo.h"
#include "field/app_call.h"
#include "gfl/heap.h"
#include "paperwhite2/link_cord.h"
#include "pml/evolution.h"
#include "pml/poke_party.h"
#include "system/game_data.h"
#include "system/game_system.h"

// Paper White 2: the field's app calls for the Link Cord (paperwhite2/link_cord.h): Karrablast and Shelmet, who
// evolve when traded for each other, both evolve, one evolution demo after the other, as several Pokémon do after a
// battle (event_battle_return.c)

void PaperWhite2_LinkCord_SetUpPartner(FieldAppCallWork *work, PokeParty *party, PartyPkm *pkm, u32 method, u8 season) {
    int slot;

    work->linkCordPartnerSpecies = 0;
    if (method != EVO_METHOD_TRADE_WITH_SPECIES) {
        return;
    }
    slot = PaperWhite2_FindLinkCordPartner(party, pkm);
    if (slot < 0) {
        return;
    }
    // Asked before the first evolves, while the partner's own partner is still in the party
    work->linkCordPartnerSlot = slot;
    work->linkCordPartnerSpecies = CheckEvolveSpecies(party, PokeParty_GetPkm(party, slot), EVO_CHECK_ITEM,
                                                      ITEM_LINK_CORD, season, NULL, HEAPID_GAMEEVENT);
}

BOOL PaperWhite2_LinkCord_HasPartnerDemo(FieldAppCallWork *work) {
    return work->linkCordPartnerSpecies != 0;
}

void *PaperWhite2_LinkCord_CreatePartnerDemoParam(FieldAppCallWork *work) {
    GameData *gameData = GSYS_GetGameData(work->input->gameSystem);
    EvolutionDemoParam *param =
        GFL_HeapAllocate(HEAPID_GAMEEVENT, sizeof(EvolutionDemoParam), FALSE, "paperwhite2_link_cord_event.c", 0);

    param->gameData = gameData;
    param->party = GameData_GetParty(gameData);
    param->species = work->linkCordPartnerSpecies;
    param->partyIndex = work->linkCordPartnerSlot;
    param->method = EVO_METHOD_TRADE_WITH_SPECIES;
    param->unkC = 1;
    // The first's evolution couldn't be stopped, nor can this one
    param->canCancel = FALSE;
    work->linkCordPartnerSpecies = 0;
    return param;
}
