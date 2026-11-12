#ifndef PAPERWHITE2_POKEMON_CENTER_H
#define PAPERWHITE2_POKEMON_CENTER_H

// Paper White 2: the Pokémon Centers' upstairs attendants (docs/paperwhite2/design/pokemon-center.md): the actions of
// their script command, PokemonCenter action, arg1, arg2, result (include/paperwhite2/pokemon_center_commands.h), the
// fees it reads, and the attendants' shared global scripts. Only #defines, since the scripts include it
// (res/field/scripts/global_2100.s, global_10105.s). The fees' values are
// res/paperwhite2/pokemon_center/services.json's, which tools/paperwhite2/pokemon_center.py writes into
// paperwhite2/pokemon_center_config.h in this file's order. "The Pokémon" is the party's Pokémon in slot arg1; an
// action on a slot past the party's end does nothing and returns 0

// Puts fee arg1 (a POKEMON_CENTER_FEE_*) plus arg2 in the result, at most 0xffff, for a message's number
#define POKEMON_CENTER_ACTION_GET_FEE 0
// Takes fee arg1 plus arg2 from the money and returns TRUE if the player has that much; else takes nothing and
// returns FALSE
#define POKEMON_CENTER_ACTION_PAY_FEE 1
// Puts fee arg1, in full, in word arg2 for a message. Returns TRUE
#define POKEMON_CENTER_ACTION_WORD_SET_FEE 2
// Returns whether the player has fee arg1 plus arg2 in money, taking nothing
#define POKEMON_CENTER_ACTION_HAS_FEE 3
// Takes fee arg1 plus arg2 from the Battle Points and returns TRUE if the player has that many; else takes nothing and
// returns FALSE
#define POKEMON_CENTER_ACTION_PAY_BP 4
// Returns the player's Battle Points
#define POKEMON_CENTER_ACTION_GET_BP 5

// Returns whether the player has the Move Relearner's money and items (services.json's training.move_relearner)
#define POKEMON_CENTER_ACTION_HAS_RELEARNER_FEE 6
// Takes the Move Relearner's money and items, and returns TRUE; or FALSE, taking nothing, if the player hasn't both
#define POKEMON_CENTER_ACTION_PAY_RELEARNER_FEE 7
// Puts the Move Relearner's item in word arg2, its count in word arg2 + 1 and its money in word arg2 + 2
#define POKEMON_CENTER_ACTION_WORD_SET_RELEARNER_FEE 8

// Puts the name of stat arg1 (a TRAINING_STAT_*) in word arg2
#define POKEMON_CENTER_ACTION_WORD_SET_STAT 9
// Returns the Pokémon's IV of stat arg2
#define POKEMON_CENTER_ACTION_GET_IV 10
// Returns whether Hyper Training can train the Pokémon: a HYPER_TRAINING_*. Puts the least level in word 1
#define POKEMON_CENTER_ACTION_CHECK_HYPER_TRAINING 11
// Sets the Pokémon's IV of stat arg2 to the most, 31, and recalculates its stats
#define POKEMON_CENTER_ACTION_MAX_IV 12
// Returns the Pokémon's EVs of stat arg2, or with TRAINING_STAT_ALL their total
#define POKEMON_CENTER_ACTION_GET_EV 13
// Sets the Pokémon's EVs of stat arg2, or with TRAINING_STAT_ALL of every stat, to 0 and recalculates its stats
#define POKEMON_CENTER_ACTION_RESET_EV 14

// Returns whether the Pokémon's ability can change by arg2, an ABILITY_CHANGE_*: an ABILITY_RESULT_*. Puts its
// ability's name in word 1, and the new one's in word 5 when it can (word 2 is the money window's, which MoneyWinDisp
// and MoneyWinUpdate write)
#define POKEMON_CENTER_ACTION_CHECK_ABILITY 15
// Changes the Pokémon's ability by arg2, which CHECK_ABILITY must have allowed: a swap flips the PID's ability bit
// (with its blocks reordered), which evolution and breeding read, and sets the other ability; the hidden one sets it
// with the hidden ability's flag
#define POKEMON_CENTER_ACTION_CHANGE_ABILITY 16

// Returns the Pokémon's friendship
#define POKEMON_CENTER_ACTION_GET_FRIENDSHIP 17
// Returns the friendship that grooming course arg1 (from 0, services.json's training.grooming) gives
#define POKEMON_CENTER_ACTION_GET_GROOMING 18
// Raises the Pokémon's friendship by grooming course arg2, at most to 255, and returns how much it rose
#define POKEMON_CENTER_ACTION_GROOM 19

// Returns the bag's first Poké Ball item after item arg1 (0 for the first), by item ID, or 0 past the last
#define POKEMON_CENTER_ACTION_NEXT_BALL 20
// Returns whether the Pokémon is already in the Poké Ball of item arg2
#define POKEMON_CENTER_ACTION_IS_BALL 21
// Takes one Poké Ball of item arg2 from the bag and puts the Pokémon in it, the old ball gone. FALSE if the bag hasn't
// one
#define POKEMON_CENTER_ACTION_SET_BALL 22

// Returns the Pokémon's nature (a NATURE_*), which Gen 5 keeps in a field of its own
#define POKEMON_CENTER_ACTION_GET_NATURE 23
// Sets the Pokémon's nature to arg2 and recalculates its stats; the PID, so shininess, sex and ability, stays
#define POKEMON_CENTER_ACTION_SET_NATURE 24
// Puts the name of nature arg1 in word arg2
#define POKEMON_CENTER_ACTION_WORD_SET_NATURE 25

// The fees, by their paths in services.json. The Battle Points of Hyper Training are a fee too, paid with PAY_BP
#define POKEMON_CENTER_FEE_DAYCARE_TRANSFER 0
#define POKEMON_CENTER_FEE_NAME_RATER 1
// The Move Relearner's money, which its item goes with (the RELEARNER_FEE actions)
#define POKEMON_CENTER_FEE_MOVE_RELEARNER 2
#define POKEMON_CENTER_FEE_MOVE_DELETER 3
#define POKEMON_CENTER_FEE_HYPER_TRAINING 4
#define POKEMON_CENTER_FEE_EFFORT_ONE 5
#define POKEMON_CENTER_FEE_EFFORT_ALL 6
#define POKEMON_CENTER_FEE_ABILITY_SWAP 7
#define POKEMON_CENTER_FEE_ABILITY_HIDDEN 8
// The grooming courses' fees, the first course's and the next two's: a course's is POKEMON_CENTER_FEE_GROOMING plus it
#define POKEMON_CENTER_FEE_GROOMING 9
#define POKEMON_CENTER_FEE_GROOMING_2 10
#define POKEMON_CENTER_FEE_GROOMING_3 11
#define POKEMON_CENTER_FEE_BALL_CHANGE 12
#define POKEMON_CENTER_FEE_NATURE_CHANGE 13

// The stats, in the order of the game's summary screen
#define TRAINING_STAT_HP 0
#define TRAINING_STAT_ATTACK 1
#define TRAINING_STAT_DEFENSE 2
#define TRAINING_STAT_SP_ATTACK 3
#define TRAINING_STAT_SP_DEFENSE 4
#define TRAINING_STAT_SPEED 5
// Every stat, for GET_EV and RESET_EV
#define TRAINING_STAT_ALL 6

// What CHECK_HYPER_TRAINING returns
#define HYPER_TRAINING_OK 0
// The player isn't Champion yet, which services.json can make not needed (training.hyper_training.requires_champion)
#define HYPER_TRAINING_NOT_CHAMPION 1
// The Pokémon is below the least level
#define HYPER_TRAINING_LEVEL_LOW 2
// Every IV is already 31
#define HYPER_TRAINING_ALL_MAX 3

// The ability changes
#define ABILITY_CHANGE_SWAP 0
#define ABILITY_CHANGE_HIDDEN 1

// What CHECK_ABILITY returns
#define ABILITY_RESULT_OK 0
// A swap: the species has only one normal ability, or two the same
#define ABILITY_RESULT_ONLY_ONE 1
// A swap: the Pokémon has its hidden ability
#define ABILITY_RESULT_HAS_HIDDEN 2
// The hidden ability: the species has none, or none other than its normal abilities
#define ABILITY_RESULT_NO_HIDDEN 3
// The hidden ability: the Pokémon has it already
#define ABILITY_RESULT_ALREADY_HIDDEN 4
// A swap of a Pokémon from an earlier game, whose ability bit is the PID's lowest, would change its sex
#define ABILITY_RESULT_SEX_WOULD_CHANGE 5

// The attendant the player talked to (0x8011) turns to the tube behind the counter, steps up to it, waits while it
// runs with its sound, and steps back facing the player; called with RTCallGlobal for each transfer. global_2100.s's
// Script_12
#define SCRID_POKEMON_CENTER_ATTENDANT_TUBE 2111

#endif // PAPERWHITE2_POKEMON_CENTER_H
