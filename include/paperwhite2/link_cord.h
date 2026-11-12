#ifndef PAPERWHITE2_LINK_CORD_H
#define PAPERWHITE2_LINK_CORD_H

#include "types.h"
#include "struct_decls.h"

// Paper White 2: the Link Cord, which evolves the Pokémon that evolve by trade, used from the bag as an evolution
// stone is (src/paperwhite2/main/paperwhite2_link_cord.c). The evolution check's item mode asks it
// (src/system/evolution_check.c), the party list shows and uses it through that check, the evolution demo removes a
// held item that the evolution needed, as it does after a trade (src/ov284/evolution_demo.c), and the field's app
// calls play the partner's evolution after the first (src/ov012/event_field_proclink.c). The trades' own evolutions
// are unchanged

// Whether the Link Cord makes an evolution of this method (EVO_METHOD_*) happen for pkm, holding heldItem: a trade
// evolves by itself, a trade holding an item only while the Pokémon holds it (param), and Karrablast or Shelmet, who
// evolve when traded for each other, only while the other is in the party, and then both evolve
BOOL PaperWhite2_LinkCordEvolves(PokeParty *party, PartyPkm *pkm, u16 method, u16 param, u16 heldItem);
// The party slot of the first Pokémon, not an egg, that evolves with pkm by the Link Cord as a trade for each other
// would (Shelmet for Karrablast, Karrablast for Shelmet), or -1
int PaperWhite2_FindLinkCordPartner(PokeParty *party, PartyPkm *pkm);

// The field's app calls (src/paperwhite2/ov012/paperwhite2_link_cord_event.c). Before the evolution demo of a Pokémon
// that the Link Cord evolves by method, notes its partner that evolves too, if any
void PaperWhite2_LinkCord_SetUpPartner(FieldAppCallWork *work, PokeParty *party, PartyPkm *pkm, u32 method, u8 season);
// Whether the partner's evolution demo follows the one that ended
BOOL PaperWhite2_LinkCord_HasPartnerDemo(FieldAppCallWork *work);
// The partner's evolution demo's parameters, which the app calls free
void *PaperWhite2_LinkCord_CreatePartnerDemoParam(FieldAppCallWork *work);

#endif // PAPERWHITE2_LINK_CORD_H
