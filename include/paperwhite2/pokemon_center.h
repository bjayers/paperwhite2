#ifndef PAPERWHITE2_POKEMON_CENTER_H
#define PAPERWHITE2_POKEMON_CENTER_H

// Paper White 2: the Pokémon Centers' upstairs attendants (docs/paperwhite2/design/pokemon-center.md): the actions of
// their script command, PokemonCenter action, arg1, arg2, result (include/paperwhite2/pokemon_center_commands.h), the
// fees it reads, and the attendants' shared global scripts. Only #defines, since the scripts include it
// (res/field/scripts/global_2100.s). The fees' values are res/paperwhite2/pokemon_center/services.json's, which
// tools/paperwhite2/pokemon_center.py writes into paperwhite2/pokemon_center_config.h in this file's order

// Puts fee arg1 (a POKEMON_CENTER_FEE_*) plus arg2 in the result, at most 0xffff, for a message's number
#define POKEMON_CENTER_ACTION_GET_FEE 0
// Takes fee arg1 plus arg2 from the money and returns TRUE if the player has that much; else takes nothing and
// returns FALSE
#define POKEMON_CENTER_ACTION_PAY_FEE 1

// The Day Care attendant's fee for each transfer through the tube (services.json's daycare.transfer_fee)
#define POKEMON_CENTER_FEE_DAYCARE_TRANSFER 0

// The attendant the player talked to (0x8011) turns to the tube behind the counter, steps up to it, waits while it
// runs with its sound, and steps back facing the player; called with RTCallGlobal for each transfer. global_2100.s's
// Script_12
#define SCRID_POKEMON_CENTER_ATTENDANT_TUBE 2111

#endif // PAPERWHITE2_POKEMON_CENTER_H
