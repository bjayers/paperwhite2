#ifndef PAPERWHITE2_WONDER_TRADE_H
#define PAPERWHITE2_WONDER_TRADE_H

#include "types.h"
#include "field/field_script.h"
#include "struct_decls.h"

// Paper White 2: the Pokémon Centers' Wonder Trade (the middle upstairs counter, res/field/scripts/global_10100.s;
// docs/paperwhite2/design/pokemon-center.md): the PokemonCenter command's WONDER_TRADE_* actions
// (paperwhite2/pokemon_center.h), and the generator of the Pokémon received, whose rates and lists are
// res/paperwhite2/pokemon_center/services.json's wonder_trade. Code in src/paperwhite2/ov012/paperwhite2_wonder_trade.c

// What the generator picks for one Pokémon received, before it is made: only random numbers and the data's tables
typedef struct {
    u16 species;
    u8 level;
    // The row of the data's languages, and its LANGUAGE_*
    u8 languageIndex;
    u8 language;
    BOOL femaleTrainer;
    BOOL shiny;
    BOOL hiddenAbility;
    BOOL perfectIVs;
    BOOL pokerus;
    u16 ball;
    u16 item;
    // The lines of the text bank TEXT_BANK_WONDER_TRADE_NAMES with the trainer's name and the nickname, or
    // WONDER_TRADE_PLAN_NO_NICKNAME
    u16 trainerNameLine;
    u16 nicknameLine;
    // The trainer's ID and secret ID
    u32 trainerId;
} WonderTradePlan;

#define WONDER_TRADE_PLAN_NO_NICKNAME 0xffff

// Picks the Pokémon received for one sent at sentLevel
void WonderTrade_Plan(WonderTradePlan *plan, u32 sentLevel);
// Whether the species is one the Wonder Trade never sends nor receives, a legendary or a mythical
BOOL WonderTrade_IsExcluded(u32 species);

// The PokemonCenter command's Wonder Trade actions, which paperwhite2_pokemon_center_commands.c runs
u32 WonderTrade_Check(FieldScriptEnv *env, u32 source, u32 index);
BOOL WonderTrade_RollSpecial(FieldScriptEnv *env);
// These two start an event that the script waits for, which sets *result when done
void WonderTrade_CallBox(FieldScriptEnv *env, u16 *result);
void WonderTrade_CallTrade(FieldScriptEnv *env, u32 source, u32 index, u16 *result);

#endif // PAPERWHITE2_WONDER_TRADE_H
