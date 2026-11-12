#include "types.h"
#include "constants/flags.h"
#include "constants/items.h"
#include "constants/natures.h"
#include "constants/pokemon.h"
#include "constants/version.h"
#include "field/field_script.h"
#include "field/scrcmd_pokemon.h"
#include "paperwhite2/pokemon_center.h"
#include "paperwhite2/pokemon_center_commands.h"
#include "paperwhite2/pokemon_center_config.h"
#include "paperwhite2/wonder_trade.h"
#include "pml/item.h"
#include "pml/personal.h"
#include "pml/poke_party.h"
#include "save/bag.h"
#include "save/bsubway_save.h"
#include "save/event_work.h"
#include "save/save_control.h"
#include "system/game_data.h"
#include "system/vm.h"
#include "system/wordset.h"

// Paper White 2: the Pokémon Center attendants' script command, PokemonCenter, in overlay 12 beside the original's
// commands. See include/paperwhite2/pokemon_center_commands.h, and its actions in include/paperwhite2/pokemon_center.h;
// the Wonder Trade's are in paperwhite2_wonder_trade.c

// The most a variable holds
#define VAR_VALUE_MAX 0xffff
// The most digits a fee has: the money holds at most 9,999,999
#define FEE_DIGITS_MAX 7
#define IV_MAX 31
#define FRIENDSHIP_MAX 255
// The PID's bit that picks a Pokémon's second normal ability, and the bit of Pokémon from earlier games (poke_tool.c's
// PID_ABILITY_BIT and PID_ABILITY_BIT_OLD)
#define PID_ABILITY_BIT 0x10000
#define PID_ABILITY_BIT_OLD 1
// The four blocks of a Pokémon's data, whose order the PID's bits 13 to 17 give (PML_PkmGetParamBlockCore)
#define PKM_BLOCK_COUNT 4
// The Hall of Fame's flag, set the first time the player enters it (global_9600.s's Script_6)
#define FLAG_CHAMPION EVENT_FLAG_0x0960

// The fees, from res/paperwhite2/pokemon_center/services.json (paperwhite2/pokemon_center_config.h)
static const u32 sFees[POKEMON_CENTER_FEE_COUNT] = { POKEMON_CENTER_FEES };
// The grooming courses' friendship
static const u8 sGroomingFriendship[POKEMON_CENTER_GROOMING_COUNT] = { POKEMON_CENTER_GROOMING_FRIENDSHIP };

// The TRAINING_STAT_* stats' fields from PKM_PARAM_IV_HP or PKM_PARAM_EV_HP, whose order puts Speed fourth, as
// TEXT_BANK_STAT_NAMES does
static const u8 sStatParams[TRAINING_STAT_ALL] = { 0, 1, 2, 4, 5, 3 };

// Fee id plus extra, or extra alone for an id that isn't a fee
static u32 PokemonCenterCommands_GetFee(u16 id, u16 extra) {
    if (id >= POKEMON_CENTER_FEE_COUNT) {
        return extra;
    }
    return sFees[id] + extra;
}

// How many digits the number has, for a message
static u32 PokemonCenterCommands_CountDigits(u32 number) {
    u32 digits = 1;

    while (number >= 10 && digits < FEE_DIGITS_MAX) {
        number /= 10;
        digits++;
    }
    return digits;
}

static void PokemonCenterCommands_SetWordNumber(WordSet *wordSet, u32 index, u32 number) {
    WordSetNumber(wordSet, index, number, PokemonCenterCommands_CountDigits(number), 0, TRUE);
}

static BOOL PokemonCenterCommands_HasRelearnerFee(TrainerGameInfoSave *info, BagSave *bag, HeapID heapId) {
    if (getCash(info) < sFees[POKEMON_CENTER_FEE_MOVE_RELEARNER]) {
        return FALSE;
    }
    return POKEMON_CENTER_RELEARNER_ITEM_COUNT == 0 ||
           BagSave_CheckAmount(bag, POKEMON_CENTER_RELEARNER_ITEM, POKEMON_CENTER_RELEARNER_ITEM_COUNT, heapId);
}

static u32 PokemonCenterCommands_CheckHyperTraining(EventWork *eventWork, PartyPkm *pkm) {
    u32 stat;

    if (POKEMON_CENTER_HYPER_TRAINING_NEEDS_CHAMPION && !EventWork_FlagGet(eventWork, FLAG_CHAMPION)) {
        return HYPER_TRAINING_NOT_CHAMPION;
    }
    if (PokeParty_GetParam(pkm, PKM_PARAM_LEVEL, NULL) < POKEMON_CENTER_HYPER_TRAINING_LEVEL) {
        return HYPER_TRAINING_LEVEL_LOW;
    }
    for (stat = 0; stat < TRAINING_STAT_ALL; stat++) {
        if (PokeParty_GetParam(pkm, PKM_PARAM_IV_HP + sStatParams[stat], NULL) < IV_MAX) {
            return HYPER_TRAINING_OK;
        }
    }
    return HYPER_TRAINING_ALL_MAX;
}

// The Pokémon's EVs of a stat, or with TRAINING_STAT_ALL their total
static u32 PokemonCenterCommands_GetEV(PartyPkm *pkm, u32 stat) {
    u32 total = 0;
    u32 i;

    for (i = 0; i < TRAINING_STAT_ALL; i++) {
        if (stat == TRAINING_STAT_ALL || stat == i) {
            total += PokeParty_GetParam(pkm, PKM_PARAM_EV_HP + sStatParams[i], NULL);
        }
    }
    return total;
}

static void PokemonCenterCommands_ResetEV(PartyPkm *pkm, u32 stat) {
    u32 i;

    for (i = 0; i < TRAINING_STAT_ALL; i++) {
        if (stat == TRAINING_STAT_ALL || stat == i) {
            PokeParty_SetParam(pkm, PKM_PARAM_EV_HP + sStatParams[i], 0);
        }
    }
    PokeParty_RecalcStats(pkm);
}

// The PID's bit that picks the second normal ability: bit 16, or for a Pokémon from an earlier game its lowest
static u32 PokemonCenterCommands_GetAbilityBit(PartyPkm *pkm) {
    if (PokeParty_GetParam(pkm, PKM_PARAM_ORIGIN_GAME, NULL) < VERSION_WHITE) {
        return PID_ABILITY_BIT_OLD;
    }
    return PID_ABILITY_BIT;
}

// Whether the ability can change, and the new ability in *ability
static u32 PokemonCenterCommands_CheckAbility(PartyPkm *pkm, u32 change, u32 *ability) {
    u32 species = PokeParty_GetParam(pkm, PKM_PARAM_SPECIES, NULL);
    u32 form = PokeParty_GetParam(pkm, PKM_PARAM_FORM, NULL);
    u32 first = PML_PersonalGetParamSingle(species, form, PERSONAL_ABILITY_1);
    u32 second = PML_PersonalGetParamSingle(species, form, PERSONAL_ABILITY_2);
    u32 hidden = PML_PersonalGetParamSingle(species, form, PERSONAL_ABILITY_HIDDEN);
    BOOL hasHidden = PokeParty_GetParam(pkm, PKM_PARAM_HIDDEN_ABILITY, NULL);
    u32 pid = PokeParty_GetParam(pkm, PKM_PARAM_PID, NULL);
    u32 bit = PokemonCenterCommands_GetAbilityBit(pkm);

    if (change == ABILITY_CHANGE_HIDDEN) {
        if (hidden == 0 || (hidden == first && (second == 0 || hidden == second))) {
            return ABILITY_RESULT_NO_HIDDEN;
        }
        if (hasHidden || PokeParty_GetParam(pkm, PKM_PARAM_ABILITY, NULL) == hidden) {
            return ABILITY_RESULT_ALREADY_HIDDEN;
        }
        *ability = hidden;
        return ABILITY_RESULT_OK;
    }
    if (second == 0 || second == first) {
        return ABILITY_RESULT_ONLY_ONE;
    }
    if (hasHidden) {
        return ABILITY_RESULT_HAS_HIDDEN;
    }
    // The sex comes from the PID's lowest byte, which only an earlier game's ability bit is in
    if (PML_UtilDerivePkmSex(species, form, pid ^ bit) != PML_UtilDerivePkmSex(species, form, pid)) {
        return ABILITY_RESULT_SEX_WOULD_CHANGE;
    }
    *ability = (pid & bit) ? first : second;
    return ABILITY_RESULT_OK;
}

// Gives the Pokémon a new PID with its data's blocks moved to the order the new one gives. Shininess stays when
// only one of the two PID halves' lowest bits changes, as the ability bit's flip does, since the shiny threshold is
// even
static void PokemonCenterCommands_SetPID(PartyPkm *pkm, u32 pid) {
    BOOL wasEncrypted = PokeParty_DecryptPkm(pkm);
    PkmBufferChunk blocks[PKM_BLOCK_COUNT];
    PkmBufferChunk *block;
    u32 i;

    for (i = 0; i < PKM_BLOCK_COUNT; i++) {
        block = PML_PkmGetParamBlockCore(&pkm->base, pkm->base.pid, i);
        blocks[i] = *block;
    }
    pkm->base.pid = pid;
    for (i = 0; i < PKM_BLOCK_COUNT; i++) {
        block = PML_PkmGetParamBlockCore(&pkm->base, pid, i);
        *block = blocks[i];
    }
    PokeParty_EncryptPkm(pkm, wasEncrypted);
}

static void PokemonCenterCommands_ChangeAbility(PartyPkm *pkm, u32 change, u32 ability) {
    if (change == ABILITY_CHANGE_HIDDEN) {
        PokeParty_SetParam(pkm, PKM_PARAM_ABILITY, ability);
        PokeParty_SetParam(pkm, PKM_PARAM_HIDDEN_ABILITY, TRUE);
        return;
    }
    // Evolution, form changes and breeding read the ability slot from the PID (setAbilityForForm,
    // getPkmAbilSlotNumber), so the swap flips its bit
    PokemonCenterCommands_SetPID(pkm, PokeParty_GetParam(pkm, PKM_PARAM_PID, NULL) ^
                                          PokemonCenterCommands_GetAbilityBit(pkm));
    PokeParty_SetParam(pkm, PKM_PARAM_ABILITY, ability);
}

// The bag's first Poké Ball after the item, by item ID, or ITEM_NONE
static u32 PokemonCenterCommands_NextBall(BagSave *bag, u32 item, HeapID heapId) {
    for (item++; item <= ITEM_LAST; item++) {
        if (PML_ItemGetMonsBallID(item) != 0 && BagSave_CheckAmount(bag, item, 1, heapId)) {
            return item;
        }
    }
    return ITEM_NONE;
}

// The actions on the party's Pokémon in slot arg1
static u32 PokemonCenterCommands_PartyAction(FieldScriptEnv *env, u16 action, PartyPkm *pkm, u16 arg2) {
    GameData *gameData = FieldScriptEnv_GetGameData(env);
    WordSet *wordSet = ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env));
    HeapID heapId = FieldScriptEnv_GetHeapID(env);
    u32 value;
    u32 result;

    switch (action) {
    case POKEMON_CENTER_ACTION_GET_IV:
        if (arg2 >= TRAINING_STAT_ALL) {
            return 0;
        }
        return PokeParty_GetParam(pkm, PKM_PARAM_IV_HP + sStatParams[arg2], NULL);
    case POKEMON_CENTER_ACTION_CHECK_HYPER_TRAINING:
        PokemonCenterCommands_SetWordNumber(wordSet, 1, POKEMON_CENTER_HYPER_TRAINING_LEVEL);
        return PokemonCenterCommands_CheckHyperTraining(GameData_GetEventWork(gameData), pkm);
    case POKEMON_CENTER_ACTION_MAX_IV:
        if (arg2 >= TRAINING_STAT_ALL) {
            return FALSE;
        }
        PokeParty_SetParam(pkm, PKM_PARAM_IV_HP + sStatParams[arg2], IV_MAX);
        PokeParty_RecalcStats(pkm);
        return TRUE;
    case POKEMON_CENTER_ACTION_GET_EV:
        return PokemonCenterCommands_GetEV(pkm, arg2);
    case POKEMON_CENTER_ACTION_RESET_EV:
        PokemonCenterCommands_ResetEV(pkm, arg2);
        return TRUE;
    case POKEMON_CENTER_ACTION_CHECK_ABILITY:
        loadAbilityNameToStrbuf(wordSet, 1, PokeParty_GetParam(pkm, PKM_PARAM_ABILITY, NULL));
        result = PokemonCenterCommands_CheckAbility(pkm, arg2, &value);
        if (result == ABILITY_RESULT_OK) {
            loadAbilityNameToStrbuf(wordSet, 5, value);
        }
        return result;
    case POKEMON_CENTER_ACTION_CHANGE_ABILITY:
        if (PokemonCenterCommands_CheckAbility(pkm, arg2, &value) != ABILITY_RESULT_OK) {
            return FALSE;
        }
        PokemonCenterCommands_ChangeAbility(pkm, arg2, value);
        return TRUE;
    case POKEMON_CENTER_ACTION_GET_FRIENDSHIP:
        return PokeParty_GetParam(pkm, PKM_PARAM_HAPPINESS, NULL);
    case POKEMON_CENTER_ACTION_GROOM:
        if (arg2 >= POKEMON_CENTER_GROOMING_COUNT) {
            return 0;
        }
        value = PokeParty_GetParam(pkm, PKM_PARAM_HAPPINESS, NULL);
        result = sGroomingFriendship[arg2];
        if (value + result > FRIENDSHIP_MAX) {
            result = FRIENDSHIP_MAX - value;
        }
        PokeParty_SetParam(pkm, PKM_PARAM_HAPPINESS, value + result);
        return result;
    case POKEMON_CENTER_ACTION_IS_BALL:
        return PokeParty_GetParam(pkm, PKM_PARAM_POKEBALL, NULL) == PML_ItemGetMonsBallID(arg2);
    case POKEMON_CENTER_ACTION_SET_BALL:
        value = PML_ItemGetMonsBallID(arg2);
        if (value == 0 || !BagSave_SubItem(GameData_GetBag(gameData), arg2, 1, heapId)) {
            return FALSE;
        }
        PokeParty_SetParam(pkm, PKM_PARAM_POKEBALL, value);
        return TRUE;
    case POKEMON_CENTER_ACTION_GET_NATURE:
        return PokeParty_GetNature(pkm);
    case POKEMON_CENTER_ACTION_SET_NATURE:
        if (arg2 > NATURE_QUIRKY) {
            return FALSE;
        }
        PokeParty_SetNature(pkm, arg2);
        return TRUE;
    default:
        return 0;
    }
}

static u32 PokemonCenterCommands_Run(FieldScriptEnv *env, u16 action, u16 arg1, u16 arg2) {
    GameData *gameData = FieldScriptEnv_GetGameData(env);
    TrainerGameInfoSave *info = getTrainerCardDataBlkAddress(gameData);
    BSubwayScoreData *score = GameData_GetBSubwayScoreData(gameData);
    BagSave *bag = GameData_GetBag(gameData);
    WordSet *wordSet = ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env));
    HeapID heapId = FieldScriptEnv_GetHeapID(env);
    u32 amount = PokemonCenterCommands_GetFee(arg1, arg2);
    PartyPkm *pkm;

    switch (action) {
    case POKEMON_CENTER_ACTION_GET_FEE:
        return amount > VAR_VALUE_MAX ? VAR_VALUE_MAX : amount;
    case POKEMON_CENTER_ACTION_PAY_FEE:
        if (getCash(info) < amount) {
            return FALSE;
        }
        subCashFromTotal(info, amount);
        return TRUE;
    case POKEMON_CENTER_ACTION_WORD_SET_FEE:
        PokemonCenterCommands_SetWordNumber(wordSet, arg2, PokemonCenterCommands_GetFee(arg1, 0));
        return TRUE;
    case POKEMON_CENTER_ACTION_HAS_FEE:
        return getCash(info) >= amount;
    case POKEMON_CENTER_ACTION_PAY_BP:
        if (BSubwayScoreData_GetBattlePoints(score) < amount) {
            return FALSE;
        }
        BSubwayScoreData_SubBattlePoints(score, amount);
        return TRUE;
    case POKEMON_CENTER_ACTION_GET_BP:
        return BSubwayScoreData_GetBattlePoints(score);
    case POKEMON_CENTER_ACTION_HAS_RELEARNER_FEE:
        return PokemonCenterCommands_HasRelearnerFee(info, bag, heapId);
    case POKEMON_CENTER_ACTION_PAY_RELEARNER_FEE:
        if (!PokemonCenterCommands_HasRelearnerFee(info, bag, heapId)) {
            return FALSE;
        }
        subCashFromTotal(info, sFees[POKEMON_CENTER_FEE_MOVE_RELEARNER]);
        if (POKEMON_CENTER_RELEARNER_ITEM_COUNT != 0) {
            BagSave_SubItem(bag, POKEMON_CENTER_RELEARNER_ITEM, POKEMON_CENTER_RELEARNER_ITEM_COUNT, heapId);
        }
        return TRUE;
    case POKEMON_CENTER_ACTION_WORD_SET_RELEARNER_FEE:
        loadItemNameToStrbuf(wordSet, arg2, POKEMON_CENTER_RELEARNER_ITEM);
        PokemonCenterCommands_SetWordNumber(wordSet, arg2 + 1, POKEMON_CENTER_RELEARNER_ITEM_COUNT);
        PokemonCenterCommands_SetWordNumber(wordSet, arg2 + 2, sFees[POKEMON_CENTER_FEE_MOVE_RELEARNER]);
        return TRUE;
    case POKEMON_CENTER_ACTION_WORD_SET_STAT:
        if (arg1 >= TRAINING_STAT_ALL) {
            return FALSE;
        }
        loadStatNameToStrbuf(wordSet, arg2, sStatParams[arg1]);
        return TRUE;
    case POKEMON_CENTER_ACTION_GET_GROOMING:
        return arg1 < POKEMON_CENTER_GROOMING_COUNT ? sGroomingFriendship[arg1] : 0;
    case POKEMON_CENTER_ACTION_NEXT_BALL:
        return PokemonCenterCommands_NextBall(bag, arg1, heapId);
    case POKEMON_CENTER_ACTION_WORD_SET_NATURE:
        if (arg1 > NATURE_QUIRKY) {
            return FALSE;
        }
        loadNatureToStrbuf(wordSet, arg2, arg1);
        return TRUE;
    case POKEMON_CENTER_ACTION_WONDER_TRADE_CHECK:
        return WonderTrade_Check(env, arg1, arg2);
    case POKEMON_CENTER_ACTION_WONDER_TRADE_ROLL_SPECIAL:
        return WonderTrade_RollSpecial(env) ? WONDER_TRADE_SPECIAL : 0;
    default:
        if (!CheckGetPartyPokemon(env, arg1, &pkm)) {
            return 0;
        }
        return PokemonCenterCommands_PartyAction(env, action, pkm, arg2);
    }
}

BOOL Scrcmd_PaperWhite2_PokemonCenter(VM *vm, FieldScriptEnv *env) {
    u16 action = ScriptReadAny(vm, env);
    u16 arg1 = ScriptReadAny(vm, env);
    u16 arg2 = ScriptReadAny(vm, env);
    u16 *result = ScriptReadVar(vm, env);

    // The Wonder Trade's Box and trade are events, which the script waits for and which set the result
    switch (action) {
    case POKEMON_CENTER_ACTION_WONDER_TRADE_PICK_BOX:
        WonderTrade_CallBox(env, result);
        return TRUE;
    case POKEMON_CENTER_ACTION_WONDER_TRADE_START:
        WonderTrade_CallTrade(env, arg1, arg2, result);
        return TRUE;
    }
    *result = PokemonCenterCommands_Run(env, action, arg1, arg2);
    return FALSE;
}
