#ifndef PAPERWHITE2_TRAINER_SCALING_H
#define PAPERWHITE2_TRAINER_SCALING_H

#include "types.h"
#include "battle/btl_setup.h"
#include "struct_decls.h"

// Paper White 2: trainers' Pokémon scale to the player's party level (Conditions_PartyLevel, at least the badge
// floor) by their tier, from res/paperwhite2/trainer_scaling/trainer_scaling.json
// (paperwhite2/trainer_scaling_config.h, tools/paperwhite2/trainer_scaling.py). A team's ace goes to the party level
// plus the tier's top, and the others keep their original gap below it but go no lower than the party level plus the
// tier's bottom, all from 1 to 100, with their Exp. and stats; species, moves, items and the rest stay as they are.
// A class or trainer of the tier "fixed" isn't scaled, nor is a Battle Institute ID or a Black Tower or White
// Treehollow zone. A partner on the player's side (client 2) takes the ally tier. The difficulty's levels come after,
// for the opponents (paperwhite2/difficulty.h). In ARM9 main, where BtlSetup_LoadTrainer calls it
// (src/paperwhite2/main/paperwhite2_trainer_scaling.c)

// The trainer's party of a client, just loaded
void PaperWhite2_TrainerScaling_Apply(BtlSetup *setup, GameData *gameData, u32 client, PokeParty *party, u32 trainerId);

#endif // PAPERWHITE2_TRAINER_SCALING_H
