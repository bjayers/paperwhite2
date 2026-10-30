#ifndef PAPERWHITE2_DEBUG_ACTIONS_H
#define PAPERWHITE2_DEBUG_ACTIONS_H

// Paper White 2: the actions of the debug menu's script command, Debug action, arg1, arg2, result
// (include/paperwhite2/debug_commands.h), and their arguments' values. Only #defines, since the scripts include it
// (res/field/scripts/global_10200.s). "The number" is the value of the number entry that DEBUG_ACTION_NUMBER_BEGIN
// starts; "the target" is the party's Pokémon that the Party menu changes, the first until Target changes it

// Puts ON or OFF in word arg1 by flag arg2, and returns the flag
#define DEBUG_ACTION_FLAG_WORD 0
// Flips flag arg1, and returns its new state
#define DEBUG_ACTION_FLAG_TOGGLE 1

// Puts the target's species in word arg1 and its slot (from 1) in word arg1 + 1. Returns FALSE without a target
#define DEBUG_ACTION_PARTY_WORDS 2
// Makes the next Pokémon of the party the target, after the last the first
#define DEBUG_ACTION_PARTY_NEXT 3
// Sets the target's EV of stat arg1 (a DEBUG_STAT_*) to arg2 and recalculates its stats; the 510 total isn't checked.
// Puts the value in word 2 and the stat's name in word 3
#define DEBUG_ACTION_PARTY_SET_EV 4
// Sets the target's IV of stat arg1 (a DEBUG_STAT_*, or DEBUG_STAT_ALL for the six) to arg2 and recalculates its
// stats. Puts the value in word 2 and the stat's name in word 3
#define DEBUG_ACTION_PARTY_SET_IV 5
// Sets the target's level to the number: its experience to that level's first, then its stats; the moves stay
#define DEBUG_ACTION_PARTY_SET_LEVEL 6
// Sets the target's nature to the number and recalculates its stats
#define DEBUG_ACTION_PARTY_SET_NATURE 7
// Makes the target shiny with the Shiny Candy's PID. Returns a DEBUG_SHINY_* result
#define DEBUG_ACTION_PARTY_MAKE_SHINY 8
// Sets the target's friendship to arg1
#define DEBUG_ACTION_PARTY_SET_FRIENDSHIP 9
// Heals the whole party (PokeParty_RecoverAll), as a Pokémon Center does
#define DEBUG_ACTION_PARTY_HEAL 10
// Gives a Pokémon of species arg1 at the number's level, as a script's gift does, to the party or else the boxes. Puts
// its species in word 0 and returns a DEBUG_GIVE_* result
#define DEBUG_ACTION_GIVE_POKEMON 11

// Gives item arg1, as many as the number. Puts its name in word 0 and returns whether the bag had room
#define DEBUG_ACTION_GIVE_ITEM 12
// Gives the key items that are safe to have early (sDebugKeyItems) and that the bag doesn't hold. Returns how many
#define DEBUG_ACTION_GIVE_KEY_ITEMS 13

// Puts the time of day override's name in word 0, the forced season's in word 1 and the forced weather's in word 2
#define DEBUG_ACTION_WORLD_WORDS 14
// Sets the time of day override to arg1: 0 off, else a DAY_PERIOD_* + 1
#define DEBUG_ACTION_SET_DAY_PERIOD 15
// Locks the season to arg1 - 1 (SEASON_SPRING to SEASON_WINTER) through the season mode, saving the mode it replaces,
// or with 0 sets that mode again. The season changes at the next map change into an exterior
#define DEBUG_ACTION_SET_SEASON 16
// Sets the weather override to arg1: 0 off, else a WEATHER_* + 1, and changes the field's weather now
#define DEBUG_ACTION_SET_WEATHER 17
// Puts the number's flag in words 0 (decimal) and 1 (hex), and ON or OFF in word 2. Returns the flag
#define DEBUG_ACTION_FLAG_GET 18
// Sets (arg1 TRUE) or clears the number's flag
#define DEBUG_ACTION_FLAG_SET 19
// Puts variable arg1 in words 0 (decimal) and 1 (hex) and its value in word 2. Returns its value
#define DEBUG_ACTION_VAR_GET 20
// Sets variable arg1 to the number
#define DEBUG_ACTION_VAR_SET 21

// Puts the species override's name in word 0 and the wild level override in word 1, or Off
#define DEBUG_ACTION_ENCOUNTER_WORDS 22
// Sets the species override to the number, 0 for off
#define DEBUG_ACTION_SET_WILD_SPECIES 23
// Sets the wild level override to the number, 0 for off
#define DEBUG_ACTION_SET_WILD_LEVEL 24

// Warps to the town of the last Pokémon Center the player used, at its fly spot, as Teleport does. The script ends
// after it
#define DEBUG_ACTION_WARP_LAST_CENTER 25
// Warps to the number's zone, at its fly spot. Returns FALSE, and doesn't warp, for a zone without one; otherwise the
// script ends after it
#define DEBUG_ACTION_WARP_ZONE 26
// Sets the money to the number, and puts it in word 0
#define DEBUG_ACTION_MONEY_SET 27
// Adds arg1 thousand to the money, up to the most it holds, and puts it in word 0
#define DEBUG_ACTION_MONEY_ADD_THOUSANDS 28

// Puts the Info message's words (the zone, the position, the season, the time, the weather and the follower) and
// returns whether the player is on rails, whose message shows the rail position
#define DEBUG_ACTION_INFO 29

// Starts a number entry of kind arg1 (a DEBUG_NUMBER_*), at the kind's start: the target's value, the game's, arg2
// for DEBUG_NUMBER_VALUE, or else the last one entered of the kind
#define DEBUG_ACTION_NUMBER_BEGIN 30
// Puts the number in word 0, its name (a species, an item, a nature, a place, a flag's state, or the hex of a flag or
// variable ID) in word 1 and the step in word 2, and returns the kind's message
#define DEBUG_ACTION_NUMBER_SHOW 31
// Changes the number by arg1, a DEBUG_NUMBER_STEP_*
#define DEBUG_ACTION_NUMBER_ADJUST 32
// Returns the number, and keeps it as the kind's last
#define DEBUG_ACTION_NUMBER_GET 33

// The conditions' readout (docs/paperwhite2/plugins.md, Conditions). Puts the world's words: the season (0), the
// time (1), the weather (2), the zone and its place (3, 4), its parent zone and place (5, 6), indoors or outdoors (7),
// the terrain groups under the player (8) and the follower (9), and the follower (10)
#define DEBUG_ACTION_CONDITIONS_WORLD 34
// Puts the lead's and the party's words: the lead's species (0), level (1), HP percent (2), status (3) and nature (4),
// the party's median level (5), the adjusted median (6) and the wild levels' range (7, 8), the zone loads (9), the
// load seed (10), the save clock's day number (11) and the day seed (12). Returns FALSE without a lead
#define DEBUG_ACTION_CONDITIONS_PARTY 35
// Puts the names of the debug samples' rules from arg1 (0, 2, 4) and whether each matches (1, 3, 5), three at most.
// Returns how many, 0 past the last or without the samples' table
#define DEBUG_ACTION_CONDITIONS_RULES 36
// Puts the samples' pick (Conditions_Select): with a check seed (0, and its seed in 1), with the load seed (2) and with
// it again (3), which is the same pick, and a keyed seed, the load seed with key 1 (4)
#define DEBUG_ACTION_CONDITIONS_PICK 37

// The Following Pokémon's record and rules (docs/paperwhite2/following-pokemon.md, "Dialogue rules, gifts and steps"),
// each FALSE without a follower. Puts its species (0), its steps since its last gift (1), its total steps (2) and its
// waiting item (3)
#define DEBUG_ACTION_FOLLOWER_WORDS 38
// Sets its steps since its last gift to the number
#define DEBUG_ACTION_FOLLOWER_SET_STEPS 39
// Finds an item now (FollowingDebug_ForcePickup): its species in word 0 and the item in word 3; FALSE when none was
// found
#define DEBUG_ACTION_FOLLOWER_PICKUP 40
// Forgets its waiting item
#define DEBUG_ACTION_FOLLOWER_CLEAR_ITEM 41
// Puts the talk rule that would be chosen now (0), its priority (1) and how many talk rules match (2), and the ambient
// (3) and pickup rules (4) that would be
#define DEBUG_ACTION_FOLLOWER_RULES 42

// The kinds of number entry: their ranges and messages are sDebugNumberKinds (paperwhite2_debug_commands.c)
#define DEBUG_NUMBER_LEVEL 0
#define DEBUG_NUMBER_NATURE 1
#define DEBUG_NUMBER_SPECIES 2
#define DEBUG_NUMBER_ITEM 3
#define DEBUG_NUMBER_COUNT 4
#define DEBUG_NUMBER_FLAG 5
#define DEBUG_NUMBER_VAR 6
#define DEBUG_NUMBER_VALUE 7
#define DEBUG_NUMBER_MONEY 8
#define DEBUG_NUMBER_ZONE 9
#define DEBUG_NUMBER_WILD_SPECIES 10
#define DEBUG_NUMBER_WILD_LEVEL 11
#define DEBUG_NUMBER_KIND_COUNT 12

// DEBUG_ACTION_NUMBER_ADJUST's changes, which are the number entry's list entries: plus or minus the step, which
// clamps at the range's end and wraps from it, and the step times or over ten
#define DEBUG_NUMBER_STEP_PLUS 0
#define DEBUG_NUMBER_STEP_MINUS 1
#define DEBUG_NUMBER_STEP_UP 2
#define DEBUG_NUMBER_STEP_DOWN 3
#define DEBUG_NUMBER_DONE 4
#define DEBUG_NUMBER_CANCEL 5

// The stats of DEBUG_ACTION_PARTY_SET_EV and DEBUG_ACTION_PARTY_SET_IV, in the summary's order, and the six IVs at once
#define DEBUG_STAT_HP 0
#define DEBUG_STAT_ATTACK 1
#define DEBUG_STAT_DEFENSE 2
#define DEBUG_STAT_SP_ATTACK 3
#define DEBUG_STAT_SP_DEFENSE 4
#define DEBUG_STAT_SPEED 5
#define DEBUG_STAT_ALL 6

// DEBUG_ACTION_PARTY_MAKE_SHINY's results
#define DEBUG_SHINY_DONE 0
#define DEBUG_SHINY_ALREADY 1
#define DEBUG_SHINY_EGG 2

// DEBUG_ACTION_GIVE_POKEMON's results
#define DEBUG_GIVE_PARTY 0
#define DEBUG_GIVE_BOX 1
#define DEBUG_GIVE_FULL 2

#endif // PAPERWHITE2_DEBUG_ACTIONS_H
