#include "types.h"
#include "constants/flags.h"
#include "constants/items.h"
#include "constants/natures.h"
#include "constants/pokemon.h"
#include "constants/species.h"
#include "field/event_mapchange.h"
#include "field/field.h"
#include "field/field_environment.h"
#include "field/field_script.h"
#include "field/field_weather.h"
#include "field/player_state.h"
#include "field/scrcmd_pokemon.h"
#include "field/zone.h"
#include "gfl/heap.h"
#include "gfl/msg.h"
#include "gfl/random.h"
#include "gfl/str.h"
#include "nitro/fx.h"
#include "paperwhite2/conditions.h"
#include "paperwhite2/debug.h"
#include "paperwhite2/debug_actions.h"
#include "paperwhite2/debug_commands.h"
#include "paperwhite2/following_field.h"
#include "paperwhite2/season.h"
#include "paperwhite2/shiny_candy.h"
#include "paperwhite2/terrain_groups.h"
#include "pml/poke_party.h"
#include "save/bag.h"
#include "save/event_work.h"
#include "save/save_control.h"
#include "system/game_data.h"
#include "system/game_event.h"
#include "system/game_system.h"
#include "system/rtc.h"
#include "system/season.h"
#include "system/vm.h"
#include "system/wordset.h"
#include "system/zone_weather.h"
#include "text/script/global_10200.h"

// Paper White 2: the field script command of the debug menu, Debug action, arg1, arg2, result, in overlay 12 beside the
// original's commands of the party (scrcmd_pokemon.c). See include/paperwhite2/debug_commands.h, and the actions in
// include/paperwhite2/debug_actions.h

#ifdef PAPERWHITE2_DEBUG_MENU
// An effort value's and an individual value's highest values: their fields are a byte and five bits
#define EV_MAX 255
#define IV_MAX 31
#define LEVEL_MAX 100
#define FRIENDSHIP_MAX 255
// The most money the save holds, and a count of one item
#define MONEY_MAX 9999999
#define ITEM_COUNT_MAX 999
#define NATURE_COUNT (NATURE_QUIRKY + 1)
// The event flags and work that the save holds (save/event_work.h), and a work's ID from the first
#define FLAG_MAX (EVENT_FLAG_SAVED_COUNT - 1)
#define EVENT_WORK_FIRST 0x4000
#define EVENT_WORK_LAST (EVENT_WORK_FIRST + EVENT_WORK_COUNT - 1)
// A number's word set slots: the number, its name and the step
#define NUMBER_WORD_VALUE 0
#define NUMBER_WORD_NAME 1
#define NUMBER_WORD_STEP 2
// The party actions' words: the target's species and slot (DEBUG_ACTION_PARTY_WORDS), then a value and a name
#define PARTY_WORD_SPECIES 0
#define PARTY_WORD_SLOT 1
#define PARTY_WORD_VALUE 2
#define PARTY_WORD_NAME 3
// The digits a number shows at most: the money's seven
#define NUMBER_DIGITS 7
// A string's end, and the length of a hex word: "0x", eight digits at most and the end; a flag's or a variable's ID
// has four, a seed eight
#define STR_END 0xffff
#define HEX_WORD_LENGTH 11
#define HEX_DIGITS 4
#define HEX_DIGITS_SEED 8
// The longest text of a word that the conditions' readout writes from ASCII (the word set's are 0x40 characters)
#define ASCII_WORD_LENGTH 40
// The rules that one message of the readout shows
#define CONDITIONS_RULES_PER_PAGE 3

// What a kind of number entry shows besides the number
enum {
    NUMBER_NAME_NONE,
    NUMBER_NAME_NATURE,
    NUMBER_NAME_SPECIES,
    NUMBER_NAME_ITEM,
    NUMBER_NAME_HEX,
    NUMBER_NAME_FLAG_HEX,
    NUMBER_NAME_PLACE,
    // A species, or Off for 0
    NUMBER_NAME_SPECIES_OR_OFF,
    // Off for 0
    NUMBER_NAME_OFF,
};

// A kind of number entry: its range, its message and its name
typedef struct {
    u32 min;
    u32 max;
    u16 message;
    u8 name;
} DebugNumberKind;

// The number being entered, its kind and its step, and each kind's last number
typedef struct {
    u32 value;
    u32 step;
    u8 kind;
    u32 last[DEBUG_NUMBER_KIND_COUNT];
} DebugNumber;

static const DebugNumberKind sDebugNumberKinds[DEBUG_NUMBER_KIND_COUNT] = {
    { 1, LEVEL_MAX, Global10200_Text_DebugNumberLevel, NUMBER_NAME_NONE },
    { 0, NATURE_COUNT - 1, Global10200_Text_DebugNumberNature, NUMBER_NAME_NATURE },
    { 1, SPECIES_GENESECT, Global10200_Text_DebugNumberSpecies, NUMBER_NAME_SPECIES },
    { 1, ITEM_LAST, Global10200_Text_DebugNumberItem, NUMBER_NAME_ITEM },
    { 1, ITEM_COUNT_MAX, Global10200_Text_DebugNumberCount, NUMBER_NAME_NONE },
    { 1, FLAG_MAX, Global10200_Text_DebugNumberFlag, NUMBER_NAME_FLAG_HEX },
    { EVENT_WORK_FIRST, EVENT_WORK_LAST, Global10200_Text_DebugNumberVar, NUMBER_NAME_HEX },
    { 0, 0xffff, Global10200_Text_DebugNumberValue, NUMBER_NAME_HEX },
    { 0, MONEY_MAX, Global10200_Text_DebugNumberMoney, NUMBER_NAME_NONE },
    { 0, ZONE_MAX - 1, Global10200_Text_DebugNumberZone, NUMBER_NAME_PLACE },
    { 0, SPECIES_GENESECT, Global10200_Text_DebugNumberWildSpecies, NUMBER_NAME_SPECIES_OR_OFF },
    { 0, LEVEL_MAX, Global10200_Text_DebugNumberWildLevel, NUMBER_NAME_OFF },
};

// The DEBUG_STAT_* stats' names, the last for all six
static const u16 sDebugStatNames[DEBUG_STAT_ALL + 1] = {
    Global10200_Text_DebugStatHp,       Global10200_Text_DebugStatAttack,    Global10200_Text_DebugStatDefense,
    Global10200_Text_DebugStatSpAttack, Global10200_Text_DebugStatSpDefense, Global10200_Text_DebugStatSpeed,
    Global10200_Text_DebugStatAll,
};

// The DEBUG_STAT_* stats' parameters from PKM_PARAM_EV_HP or PKM_PARAM_IV_HP, whose order puts Speed fourth
static const u8 sDebugStatParams[DEBUG_STAT_ALL] = { 0, 1, 2, 4, 5, 3 };

static const u16 sDebugDayPeriodNames[DAY_PERIOD_COUNT] = {
    Global10200_Text_DebugPeriodMorning, Global10200_Text_DebugPeriodDay,       Global10200_Text_DebugPeriodEvening,
    Global10200_Text_DebugPeriodNight,   Global10200_Text_DebugPeriodLateNight,
};

// The season modes' names, whose locked ones from SEASON_MODE_SPRING are the seasons' names too
static const u16 sDebugSeasonModeNames[SEASON_MODE_COUNT] = {
    Global10200_Text_DebugModeMonthly, Global10200_Text_DebugModeSpring,   Global10200_Text_DebugModeSummer,
    Global10200_Text_DebugModeAutumn,  Global10200_Text_DebugModeWinter,   Global10200_Text_DebugModeWeekly,
    Global10200_Text_DebugModeDaily,   Global10200_Text_DebugModeRealTime, Global10200_Text_DebugModeChaos,
};

static const u16 sDebugWeatherNames[WEATHER_MAX] = {
    Global10200_Text_DebugWeatherClear,        Global10200_Text_DebugWeatherSnow,
    Global10200_Text_DebugWeatherRain,         Global10200_Text_DebugWeatherSandstorm,
    Global10200_Text_DebugWeatherSnowstorm,    Global10200_Text_DebugWeatherFlutter,
    Global10200_Text_DebugWeatherThunderstorm, Global10200_Text_DebugWeatherHeavyRain,
    Global10200_Text_DebugWeatherDiamondDust,  Global10200_Text_DebugWeatherTint9,
    Global10200_Text_DebugWeatherTint10,       Global10200_Text_DebugWeatherTint11,
    Global10200_Text_DebugWeatherSandstorm2,   Global10200_Text_DebugWeatherTint13,
    Global10200_Text_DebugWeatherTint14,
};

// The key items that Give key items adds: the tools and the forme items, which no story event checks for. The rest of
// the Key Items pocket is left out: the Light and Dark Stones, the Dragon Skull, the Grams, the Plasma Card, the
// Colress Machine, the Grubby Hanky and the Dropped Items, which events give and take back; the Medal Box and the Prop
// Case, which come with their features' setup; the Liberty Pass and the Xtransceivers; and the other games' items
static const u16 sDebugKeyItems[] = {
    ITEM_BICYCLE,    ITEM_DOWSING_MCHN, ITEM_SUPER_ROD,         ITEM_VS_RECORDER,
    ITEM_GRACIDEA,   ITEM_REVEAL_GLASS, ITEM_DNA_SPLICERS_FUSE, ITEM_PERMIT,
    ITEM_OVAL_CHARM, ITEM_SHINY_CHARM,  ITEM_EXP_SHARE,         ITEM_DNA_SPLICERS_SEPARATE,
};

// The conditions' status names, by CONDITION_STATUS_*, and the terrain groups' (paperwhite2/terrain_groups.h)
static const char *const sDebugStatusNames[] = { "OK", "poison", "sleep", "burn", "freeze", "paralysis" };
static const char *const sDebugTerrainNames[TERRAIN_GROUP_COUNT] = { TERRAIN_GROUP_NAMES };

// No original structure owns this state. It goes with overlay 12, which the field keeps loaded while a script runs
static DebugNumber sDebugNumber;
static u8 sDebugPartySlot;

static void DebugCommands_SetWordText(FieldScriptEnv *env, u32 index, u32 message);
static void DebugCommands_SetWordNumber(FieldScriptEnv *env, u32 index, s32 number);
static void DebugCommands_SetWordHex(FieldScriptEnv *env, u32 index, u32 number, u32 digits);
static void DebugCommands_SetWordAscii(FieldScriptEnv *env, u32 index, const char *text);
static void DebugCommands_SetWordTerrain(FieldScriptEnv *env, u32 index, u32 groups);
static void DebugCommands_SetWordOnOff(FieldScriptEnv *env, u32 index, BOOL on);
static PartyPkm *DebugCommands_GetTarget(FieldScriptEnv *env);
static void DebugCommands_SetStatWords(FieldScriptEnv *env, u32 stat, u32 value);
static u32 DebugCommands_NumberStart(FieldScriptEnv *env, u32 kind, u32 initial);
static void DebugCommands_ShowNumber(FieldScriptEnv *env);
static void DebugCommands_AdjustNumber(u32 change);
static u32 DebugCommands_GiveKeyItems(GameData *gameData, HeapID heapId);
static u32 DebugCommands_GivePokemon(FieldScriptEnv *env, u16 species, u16 level);
static void DebugCommands_SetSeason(GameData *gameData, u16 season);
static void DebugCommands_SetWeather(GameSystem *gsys, u16 weather);
static void DebugCommands_SetMoney(GameData *gameData, u32 money);
static BOOL DebugCommands_Warp(GameSystem *gsys, u16 zoneId);
static BOOL DebugCommands_Info(FieldScriptEnv *env);
static void DebugCommands_FillConditions(FieldScriptEnv *env, ConditionContext *ctx);
static void DebugCommands_SetWordRule(FieldScriptEnv *env, u32 index, const ConditionTable *table, s32 rule);
static void DebugCommands_ConditionsWorld(FieldScriptEnv *env);
static BOOL DebugCommands_ConditionsParty(FieldScriptEnv *env);
static u32 DebugCommands_ConditionsRules(FieldScriptEnv *env, u32 first);
static void DebugCommands_ConditionsPick(FieldScriptEnv *env);
static u32 DebugCommands_Run(FieldScriptEnv *env, u16 action, u16 arg1, u16 arg2, BOOL *wait);

BOOL Scrcmd_PaperWhite2_Debug(VM *vm, FieldScriptEnv *env) {
    u16 action = ScriptReadAny(vm, env);
    u16 arg1 = ScriptReadAny(vm, env);
    u16 arg2 = ScriptReadAny(vm, env);
    u16 *result = ScriptReadVar(vm, env);
    BOOL wait = FALSE;

    *result = DebugCommands_Run(env, action, arg1, arg2, &wait);
    return wait;
}

static u32 DebugCommands_Run(FieldScriptEnv *env, u16 action, u16 arg1, u16 arg2, BOOL *wait) {
    GameSystem *gsys = FieldScriptEnv_GetGameSystem(env);
    GameData *gameData = FieldScriptEnv_GetGameData(env);
    EventWork *eventWork = GameData_GetEventWork(gameData);
    PartyPkm *pkm = DebugCommands_GetTarget(env);
    u32 value;

    switch (action) {
    case DEBUG_ACTION_FLAG_WORD:
        DebugCommands_SetWordOnOff(env, arg1, EventWork_FlagGet(eventWork, arg2));
        return EventWork_FlagGet(eventWork, arg2);
    case DEBUG_ACTION_FLAG_TOGGLE:
        if (EventWork_FlagGet(eventWork, arg1)) {
            EventWork_FlagReset(eventWork, arg1);
            return FALSE;
        }
        EventWork_FlagSet(eventWork, arg1);
        return TRUE;
    case DEBUG_ACTION_PARTY_WORDS:
        if (pkm == NULL) {
            DebugCommands_SetWordText(env, PARTY_WORD_SPECIES, Global10200_Text_DebugNone);
            DebugCommands_SetWordNumber(env, PARTY_WORD_SLOT, 0);
            return FALSE;
        }
        WordSet_LoadSpeciesName(ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env)), PARTY_WORD_SPECIES,
                                PokeParty_GetParam(pkm, PKM_PARAM_SPECIES, NULL));
        DebugCommands_SetWordNumber(env, PARTY_WORD_SLOT, sDebugPartySlot + 1);
        return TRUE;
    case DEBUG_ACTION_PARTY_NEXT:
        sDebugPartySlot++;
        if (sDebugPartySlot >= PokeParty_GetPkmCount(GameData_GetParty(gameData))) {
            sDebugPartySlot = 0;
        }
        return sDebugPartySlot;
    case DEBUG_ACTION_PARTY_HEAL:
        PokeParty_RecoverAll(GameData_GetParty(gameData));
        return TRUE;
    case DEBUG_ACTION_GIVE_POKEMON:
        return DebugCommands_GivePokemon(env, arg1, sDebugNumber.value);
    case DEBUG_ACTION_GIVE_ITEM:
        loadItemNameToStrbuf(ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env)), 0, arg1);
        DebugCommands_SetWordNumber(env, PARTY_WORD_VALUE, sDebugNumber.value);
        return BagSave_AddItem(GameData_GetBag(gameData), arg1, sDebugNumber.value, FieldScriptEnv_GetHeapID(env));
    case DEBUG_ACTION_GIVE_KEY_ITEMS:
        value = DebugCommands_GiveKeyItems(gameData, FieldScriptEnv_GetHeapID(env));
        DebugCommands_SetWordNumber(env, 0, value);
        return value;
    case DEBUG_ACTION_WORLD_WORDS:
        value = PaperWhite2_Debug_GetOverride(DEBUG_OVERRIDE_DAY_PERIOD);
        DebugCommands_SetWordText(
            env, 0, value == DEBUG_OVERRIDE_OFF ? Global10200_Text_DebugOff : sDebugDayPeriodNames[value]);
        value = PaperWhite2_Debug_GetOverride(DEBUG_OVERRIDE_SAVED_SEASON_MODE);
        DebugCommands_SetWordText(env, 1,
                                  value == DEBUG_OVERRIDE_OFF
                                      ? Global10200_Text_DebugOff
                                      : sDebugSeasonModeNames[PaperWhite2_GetSeasonMode(gameData)]);
        value = PaperWhite2_Debug_GetOverride(DEBUG_OVERRIDE_WEATHER);
        DebugCommands_SetWordText(env, 2,
                                  value == DEBUG_OVERRIDE_OFF ? Global10200_Text_DebugOff : sDebugWeatherNames[value]);
        return TRUE;
    case DEBUG_ACTION_SET_DAY_PERIOD:
        PaperWhite2_Debug_SetOverride(DEBUG_OVERRIDE_DAY_PERIOD, arg1 == 0 ? DEBUG_OVERRIDE_OFF : arg1 - 1);
        return TRUE;
    case DEBUG_ACTION_SET_SEASON:
        DebugCommands_SetSeason(gameData, arg1);
        return TRUE;
    case DEBUG_ACTION_SET_WEATHER:
        DebugCommands_SetWeather(gsys, arg1);
        return TRUE;
    case DEBUG_ACTION_FLAG_GET:
        DebugCommands_SetWordNumber(env, 0, sDebugNumber.value);
        DebugCommands_SetWordHex(env, 1, sDebugNumber.value, HEX_DIGITS);
        DebugCommands_SetWordOnOff(env, 2, EventWork_FlagGet(eventWork, sDebugNumber.value));
        return EventWork_FlagGet(eventWork, sDebugNumber.value);
    case DEBUG_ACTION_FLAG_SET:
        if (arg1) {
            EventWork_FlagSet(eventWork, sDebugNumber.value);
        } else {
            EventWork_FlagReset(eventWork, sDebugNumber.value);
        }
        return arg1;
    case DEBUG_ACTION_VAR_GET:
        value = *EventWork_GetWkPtr(eventWork, arg1);
        DebugCommands_SetWordNumber(env, 0, arg1);
        DebugCommands_SetWordHex(env, 1, arg1, HEX_DIGITS);
        DebugCommands_SetWordNumber(env, 2, value);
        return value;
    case DEBUG_ACTION_VAR_SET:
        *EventWork_GetWkPtr(eventWork, arg1) = sDebugNumber.value;
        return TRUE;
    case DEBUG_ACTION_ENCOUNTER_WORDS:
        value = PaperWhite2_Debug_GetOverride(DEBUG_OVERRIDE_WILD_SPECIES);
        if (value == DEBUG_OVERRIDE_OFF) {
            DebugCommands_SetWordText(env, 2, Global10200_Text_DebugOff);
        } else {
            WordSet_LoadSpeciesName(ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env)), 2, value);
        }
        value = PaperWhite2_Debug_GetOverride(DEBUG_OVERRIDE_WILD_LEVEL);
        if (value == DEBUG_OVERRIDE_OFF) {
            DebugCommands_SetWordText(env, 3, Global10200_Text_DebugOff);
        } else {
            DebugCommands_SetWordNumber(env, 3, value);
        }
        return TRUE;
    case DEBUG_ACTION_SET_WILD_SPECIES:
        PaperWhite2_Debug_SetOverride(DEBUG_OVERRIDE_WILD_SPECIES,
                                      sDebugNumber.value == 0 ? DEBUG_OVERRIDE_OFF : sDebugNumber.value);
        return TRUE;
    case DEBUG_ACTION_SET_WILD_LEVEL:
        PaperWhite2_Debug_SetOverride(DEBUG_OVERRIDE_WILD_LEVEL,
                                      sDebugNumber.value == 0 ? DEBUG_OVERRIDE_OFF : sDebugNumber.value);
        return TRUE;
    case DEBUG_ACTION_WARP_LAST_CENTER:
        GameEvent_ChainNext(GSYS_GetNowEvent(gsys), EventMapChangeTeleport_Create(gsys));
        *wait = TRUE;
        return TRUE;
    case DEBUG_ACTION_WARP_ZONE:
        DebugCommands_SetWordNumber(env, 0, sDebugNumber.value);
        *wait = DebugCommands_Warp(gsys, sDebugNumber.value);
        return *wait;
    case DEBUG_ACTION_MONEY_SET:
        DebugCommands_SetMoney(gameData, sDebugNumber.value);
        DebugCommands_SetWordNumber(env, 0, sDebugNumber.value);
        return TRUE;
    case DEBUG_ACTION_MONEY_ADD_THOUSANDS:
        value = getCash(getTrainerCardDataBlkAddress(gameData)) + arg1 * 1000;
        if (value > MONEY_MAX) {
            value = MONEY_MAX;
        }
        DebugCommands_SetMoney(gameData, value);
        DebugCommands_SetWordNumber(env, 0, value);
        return TRUE;
    case DEBUG_ACTION_INFO:
        return DebugCommands_Info(env);
    case DEBUG_ACTION_NUMBER_BEGIN:
        sDebugNumber.kind = arg1;
        sDebugNumber.value = DebugCommands_NumberStart(env, arg1, arg2);
        sDebugNumber.step = 1;
        return sDebugNumber.value;
    case DEBUG_ACTION_NUMBER_SHOW:
        DebugCommands_ShowNumber(env);
        return sDebugNumberKinds[sDebugNumber.kind].message;
    case DEBUG_ACTION_NUMBER_ADJUST:
        DebugCommands_AdjustNumber(arg1);
        return sDebugNumber.value;
    case DEBUG_ACTION_NUMBER_GET:
        sDebugNumber.last[sDebugNumber.kind] = sDebugNumber.value;
        return sDebugNumber.value;
    case DEBUG_ACTION_CONDITIONS_WORLD:
        DebugCommands_ConditionsWorld(env);
        return TRUE;
    case DEBUG_ACTION_CONDITIONS_PARTY:
        return DebugCommands_ConditionsParty(env);
    case DEBUG_ACTION_CONDITIONS_RULES:
        return DebugCommands_ConditionsRules(env, arg1);
    case DEBUG_ACTION_CONDITIONS_PICK:
        DebugCommands_ConditionsPick(env);
        return TRUE;
    }
    // The actions on the target, which do nothing without one
    if (pkm == NULL) {
        return FALSE;
    }
    switch (action) {
    case DEBUG_ACTION_PARTY_SET_EV:
        if (arg1 >= DEBUG_STAT_ALL || arg2 > EV_MAX) {
            return FALSE;
        }
        PokeParty_SetParam(pkm, PKM_PARAM_EV_HP + sDebugStatParams[arg1], arg2);
        PokeParty_RecalcStats(pkm);
        DebugCommands_SetStatWords(env, arg1, arg2);
        return TRUE;
    case DEBUG_ACTION_PARTY_SET_IV:
        if (arg1 > DEBUG_STAT_ALL || arg2 > IV_MAX) {
            return FALSE;
        }
        for (value = 0; value < DEBUG_STAT_ALL; value++) {
            if (arg1 == DEBUG_STAT_ALL || arg1 == value) {
                PokeParty_SetParam(pkm, PKM_PARAM_IV_HP + sDebugStatParams[value], arg2);
            }
        }
        PokeParty_RecalcStats(pkm);
        DebugCommands_SetStatWords(env, arg1, arg2);
        return TRUE;
    case DEBUG_ACTION_PARTY_SET_LEVEL:
        // The experience of the level's start, then the stats; the moves aren't learned or forgotten
        setLevel(pkm, sDebugNumber.value);
        DebugCommands_SetWordNumber(env, PARTY_WORD_VALUE, sDebugNumber.value);
        return TRUE;
    case DEBUG_ACTION_PARTY_SET_NATURE:
        PokeParty_SetNature(pkm, sDebugNumber.value);
        PokeParty_RecalcStats(pkm);
        loadNatureToStrbuf(ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env)), PARTY_WORD_NAME,
                           sDebugNumber.value);
        return TRUE;
    case DEBUG_ACTION_PARTY_MAKE_SHINY:
        if (PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL)) {
            return DEBUG_SHINY_EGG;
        }
        if (PokeParty_IsRare(pkm)) {
            return DEBUG_SHINY_ALREADY;
        }
        // The setter decrypts the party data with the old PID, then encrypts it with the new one and sums it again
        PokeParty_SetParam(pkm, PKM_PARAM_PID,
                           PaperWhite2_MakeShinyPID(PokeParty_GetParam(pkm, PKM_PARAM_ID, NULL),
                                                    PokeParty_GetParam(pkm, PKM_PARAM_PID, NULL)));
        return DEBUG_SHINY_DONE;
    case DEBUG_ACTION_PARTY_SET_FRIENDSHIP:
        if (arg1 > FRIENDSHIP_MAX || PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL)) {
            return FALSE;
        }
        PokeParty_SetParam(pkm, PKM_PARAM_HAPPINESS, arg1);
        DebugCommands_SetWordNumber(env, PARTY_WORD_VALUE, arg1);
        return TRUE;
    }
    return FALSE;
}

static void DebugCommands_SetWordText(FieldScriptEnv *env, u32 index, u32 message) {
    ScriptWork *work = FieldScriptEnv_GetScriptWork(env);
    StrBuf *strbuf = ScriptWork_GetAltStrBuf(work);

    GFL_MsgDataLoadStrbuf(GetFieldScriptMsgData(env), message, strbuf);
    GFL_WordSetSetStrbuf(ScriptWork_GetWordSet(work), index, strbuf, 0, 1, 2);
}

static void DebugCommands_SetWordNumber(FieldScriptEnv *env, u32 index, s32 number) {
    WordSetNumber(ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env)), index, number, NUMBER_DIGITS, 0, TRUE);
}

// A number in hex, as the docs and the scripts write them: 0x and its digits
static void DebugCommands_SetWordHex(FieldScriptEnv *env, u32 index, u32 number, u32 digits) {
    u16 str[HEX_WORD_LENGTH];
    u32 digit;
    u32 i;

    str[0] = '0';
    str[1] = 'x';
    for (i = 0; i < digits; i++) {
        digit = (number >> ((digits - 1 - i) * 4)) & 0xf;
        str[2 + i] = digit < 10 ? '0' + digit : 'a' + digit - 10;
    }
    str[2 + digits] = STR_END;
    GFL_WordSetLoadStr(ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env)), index, str);
}

// A text of the readout's own, in ASCII, which the game's characters share
static void DebugCommands_SetWordAscii(FieldScriptEnv *env, u32 index, const char *text) {
    u16 str[ASCII_WORD_LENGTH + 1];
    u32 i;

    for (i = 0; i < ASCII_WORD_LENGTH && text[i] != '\0'; i++) {
        str[i] = text[i];
    }
    str[i] = STR_END;
    GFL_WordSetLoadStr(ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env)), index, str);
}

// The names of the terrain groups of a mask, joined by +, as far as the word holds them, or "none"
static void DebugCommands_SetWordTerrain(FieldScriptEnv *env, u32 index, u32 groups) {
    char text[ASCII_WORD_LENGTH + 1];
    const char *name;
    u32 length = 0;
    u32 group;

    for (group = 0; group < TERRAIN_GROUP_COUNT; group++) {
        if (!((groups >> group) & 1)) {
            continue;
        }
        if (length != 0 && length < ASCII_WORD_LENGTH) {
            text[length++] = '+';
        }
        for (name = sDebugTerrainNames[group]; *name != '\0' && length < ASCII_WORD_LENGTH; name++) {
            text[length++] = *name;
        }
    }
    text[length] = '\0';
    DebugCommands_SetWordAscii(env, index, length == 0 ? "none" : text);
}

static void DebugCommands_SetWordOnOff(FieldScriptEnv *env, u32 index, BOOL on) {
    DebugCommands_SetWordText(env, index, on ? Global10200_Text_DebugOn : Global10200_Text_DebugOff);
}

// The party's Pokémon that the Party menu changes, back to the first if the party shrank, or NULL for none
static PartyPkm *DebugCommands_GetTarget(FieldScriptEnv *env) {
    PokeParty *party = GameData_GetParty(FieldScriptEnv_GetGameData(env));
    PartyPkm *pkm;

    if (sDebugPartySlot >= PokeParty_GetPkmCount(party)) {
        sDebugPartySlot = 0;
    }
    if (CheckGetPartyPokemon(env, sDebugPartySlot, &pkm) == TRUE) {
        return pkm;
    }
    return NULL;
}

// The value and the stat's name of a confirmation of the EV and IV lists
static void DebugCommands_SetStatWords(FieldScriptEnv *env, u32 stat, u32 value) {
    DebugCommands_SetWordNumber(env, PARTY_WORD_VALUE, value);
    DebugCommands_SetWordText(env, PARTY_WORD_NAME, sDebugStatNames[stat]);
}

// The value a number entry starts at: the target's or the game's where the kind has one, initial for a variable's
// value, else the kind's last, within its range
static u32 DebugCommands_NumberStart(FieldScriptEnv *env, u32 kind, u32 initial) {
    GameData *gameData = FieldScriptEnv_GetGameData(env);
    PartyPkm *pkm = DebugCommands_GetTarget(env);
    u32 value = sDebugNumber.last[kind];

    switch (kind) {
    case DEBUG_NUMBER_LEVEL:
        if (pkm != NULL) {
            value = PokeParty_GetParam(pkm, PKM_PARAM_LEVEL, NULL);
        }
        break;
    case DEBUG_NUMBER_NATURE:
        if (pkm != NULL) {
            value = PokeParty_GetParam(pkm, PKM_PARAM_NATURE, NULL);
        }
        break;
    case DEBUG_NUMBER_VALUE:
        value = initial;
        break;
    case DEBUG_NUMBER_MONEY:
        value = getCash(getTrainerCardDataBlkAddress(gameData));
        break;
    case DEBUG_NUMBER_ZONE:
        value = PlayerState_GetZoneID(GameData_GetPlayerState(gameData));
        break;
    case DEBUG_NUMBER_WILD_SPECIES:
    case DEBUG_NUMBER_WILD_LEVEL:
        value = PaperWhite2_Debug_GetOverride(kind == DEBUG_NUMBER_WILD_SPECIES ? DEBUG_OVERRIDE_WILD_SPECIES
                                                                                : DEBUG_OVERRIDE_WILD_LEVEL);
        if (value == DEBUG_OVERRIDE_OFF) {
            value = 0;
        }
        break;
    }
    if (value < sDebugNumberKinds[kind].min) {
        value = sDebugNumberKinds[kind].min;
    }
    if (value > sDebugNumberKinds[kind].max) {
        value = sDebugNumberKinds[kind].max;
    }
    return value;
}

static void DebugCommands_ShowNumber(FieldScriptEnv *env) {
    WordSet *wordSet = ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env));
    u32 value = sDebugNumber.value;

    DebugCommands_SetWordNumber(env, NUMBER_WORD_VALUE, value);
    DebugCommands_SetWordNumber(env, NUMBER_WORD_STEP, sDebugNumber.step);
    switch (sDebugNumberKinds[sDebugNumber.kind].name) {
    case NUMBER_NAME_NATURE:
        loadNatureToStrbuf(wordSet, NUMBER_WORD_NAME, value);
        break;
    case NUMBER_NAME_SPECIES:
        WordSet_LoadSpeciesName(wordSet, NUMBER_WORD_NAME, value);
        break;
    case NUMBER_NAME_ITEM:
        loadItemNameToStrbuf(wordSet, NUMBER_WORD_NAME, value);
        break;
    case NUMBER_NAME_HEX:
        DebugCommands_SetWordHex(env, NUMBER_WORD_NAME, value, HEX_DIGITS);
        break;
    case NUMBER_NAME_FLAG_HEX:
        // The flag's state goes in the step's word's place after the hex, as the flag's message shows it
        DebugCommands_SetWordHex(env, NUMBER_WORD_NAME, value, HEX_DIGITS);
        DebugCommands_SetWordOnOff(env, NUMBER_WORD_STEP + 1,
                                   EventWork_FlagGet(GameData_GetEventWork(FieldScriptEnv_GetGameData(env)), value));
        break;
    case NUMBER_NAME_PLACE:
        loadLocationNameToStrbuf(wordSet, NUMBER_WORD_NAME, ZoneData_GetPlaceNameID(value));
        break;
    case NUMBER_NAME_SPECIES_OR_OFF:
        if (value != 0) {
            WordSet_LoadSpeciesName(wordSet, NUMBER_WORD_NAME, value);
            break;
        }
        DebugCommands_SetWordText(env, NUMBER_WORD_NAME, Global10200_Text_DebugOffParenthesized);
        break;
    case NUMBER_NAME_OFF:
        DebugCommands_SetWordText(env, NUMBER_WORD_NAME,
                                  value == 0 ? Global10200_Text_DebugOffParenthesized : Global10200_Text_DebugEmpty);
        break;
    }
}

// Plus or minus the step stops at the range's end, and from the end goes round to the other; the step stays within
// the range's largest power of ten
static void DebugCommands_AdjustNumber(u32 change) {
    const DebugNumberKind *kind = &sDebugNumberKinds[sDebugNumber.kind];

    switch (change) {
    case DEBUG_NUMBER_STEP_PLUS:
        if (sDebugNumber.value == kind->max) {
            sDebugNumber.value = kind->min;
        } else if (kind->max - sDebugNumber.value < sDebugNumber.step) {
            sDebugNumber.value = kind->max;
        } else {
            sDebugNumber.value += sDebugNumber.step;
        }
        break;
    case DEBUG_NUMBER_STEP_MINUS:
        if (sDebugNumber.value == kind->min) {
            sDebugNumber.value = kind->max;
        } else if (sDebugNumber.value - kind->min < sDebugNumber.step) {
            sDebugNumber.value = kind->min;
        } else {
            sDebugNumber.value -= sDebugNumber.step;
        }
        break;
    case DEBUG_NUMBER_STEP_UP:
        if (sDebugNumber.step * 10 <= kind->max - kind->min) {
            sDebugNumber.step *= 10;
        }
        break;
    case DEBUG_NUMBER_STEP_DOWN:
        if (sDebugNumber.step >= 10) {
            sDebugNumber.step /= 10;
        }
        break;
    }
}

static u32 DebugCommands_GiveKeyItems(GameData *gameData, HeapID heapId) {
    BagSave *bag = GameData_GetBag(gameData);
    u32 count = 0;
    u32 i;

    for (i = 0; i < NELEMS(sDebugKeyItems); i++) {
        if (!BagSave_CheckAmount(bag, sDebugKeyItems[i], 1, heapId) &&
            BagSave_AddItem(bag, sDebugKeyItems[i], 1, heapId)) {
            count++;
        }
    }
    return count;
}

// A Pokémon as PokePartyAdd makes one (scrcmd_pokemon.c): a random ability and sex, a Poké Ball, the met data of here
static u32 DebugCommands_GivePokemon(FieldScriptEnv *env, u16 species, u16 level) {
    GameData *gameData = FieldScriptEnv_GetGameData(env);
    BoxPkmCreateParams params;

    WordSet_LoadSpeciesName(ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env)), 0, species);
    MI_CpuFill8(&params, 0, sizeof(BoxPkmCreateParams));
    params.heapId = FieldScriptEnv_GetHeapID(env);
    params.species = species;
    params.form = 0;
    params.level = level;
    params.item = ITEM_NONE;
    params.ability = 2;
    params.sex = 2;
    params.param1C = 2;
    params.ball = ITEM_POKE_BALL;
    if (addPkmToParty(gameData, &params)) {
        return DEBUG_GIVE_PARTY;
    }
    if (GameData_AddBoxPkm(gameData, &params)) {
        return DEBUG_GIVE_BOX;
    }
    return DEBUG_GIVE_FULL;
}

// A season from 1 locks it and saves the mode it replaces, unless a lock already did; 0 sets the saved mode again
static void DebugCommands_SetSeason(GameData *gameData, u16 season) {
    u16 saved = PaperWhite2_Debug_GetOverride(DEBUG_OVERRIDE_SAVED_SEASON_MODE);

    if (season == 0) {
        if (saved != DEBUG_OVERRIDE_OFF) {
            PaperWhite2_SetSeasonMode(gameData, saved);
            PaperWhite2_Debug_SetOverride(DEBUG_OVERRIDE_SAVED_SEASON_MODE, DEBUG_OVERRIDE_OFF);
        }
        return;
    }
    if (saved == DEBUG_OVERRIDE_OFF) {
        PaperWhite2_Debug_SetOverride(DEBUG_OVERRIDE_SAVED_SEASON_MODE, PaperWhite2_GetSeasonMode(gameData));
    }
    PaperWhite2_SetSeasonMode(gameData, SEASON_MODE_SPRING + season - 1);
}

// Sets the override, then the field's weather to the zone's with it, as FieldSetWeather does with the zone's own
static void DebugCommands_SetWeather(GameSystem *gsys, u16 weather) {
    Field *field = GSYS_GetField(gsys);
    u32 weatherId;

    PaperWhite2_Debug_SetOverride(DEBUG_OVERRIDE_WEATHER, weather == 0 ? DEBUG_OVERRIDE_OFF : weather - 1);
    weatherId = GetWeatherAll(gsys, Field_GetPlayerStateZoneID(field));
    FieldWeather_RequestChange(Field_GetWeatherSystem(field), weatherId);
    SetNowWeather(GSYS_GetGameData(gsys), weatherId);
}

static void DebugCommands_SetMoney(GameData *gameData, u32 money) {
    TrainerGameInfoSave *info = getTrainerCardDataBlkAddress(gameData);

    subCashFromTotal(info, getCash(info));
    addCashToTotal(info, money);
}

// The zone's fly spot, where Fly, Teleport and a blackout put the player (LoadZoneSpawnInfoCheckRail): a zone whose
// spot is 0, 0, 0 has none, and isn't warped to
static BOOL DebugCommands_Warp(GameSystem *gsys, u16 zoneId) {
    ZoneSpawnInfo spawn;
    VecFx32 pos;

    if (IsZonesWithRailsArrayHasZoneID(zoneId)) {
        LoadZoneFlyPosRailCoords(zoneId, &pos);
    } else {
        LoadZoneFlyPosToVecFx32(zoneId, &pos);
    }
    if (pos.x == 0 && pos.y == 0 && pos.z == 0) {
        return FALSE;
    }
    LoadZoneSpawnInfoCheckRail(&spawn, zoneId);
    GameEvent_ChainNext(GSYS_GetNowEvent(gsys),
                        EventMapChange_CreateForFly(gsys, GSYS_GetField(gsys), 0, &spawn, WARP_DIR_DOWN));
    return TRUE;
}

// The Info message's words: 0 the zone, 1 its place name, 2 to 4 the position (x, y, z on a grid; the rail's line,
// front and side on rails), 5 the season mode, 6 the season, 7 the time of day, 8 the weather, 9 the follower
static BOOL DebugCommands_Info(FieldScriptEnv *env) {
    GameSystem *gsys = FieldScriptEnv_GetGameSystem(env);
    GameData *gameData = FieldScriptEnv_GetGameData(env);
    PlayerState *playerState = GameData_GetPlayerState(gameData);
    WordSet *wordSet = ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env));
    u16 zoneId = PlayerState_GetZoneID(playerState);
    u32 weather = GetNowWeather(gameData);
    u16 species = PaperWhite2_FollowingGetSpecies();
    BOOL rail = PlayerState_IsRail(playerState);
    RailPosition *railPos;
    s16 x;
    s16 y;
    s16 z;

    DebugCommands_SetWordNumber(env, 0, zoneId);
    loadLocationNameToStrbuf(wordSet, 1, ZoneData_GetPlaceNameID(zoneId));
    if (rail) {
        railPos = PlayerState_GetRailPos(playerState);
        DebugCommands_SetWordNumber(env, 2, railPos->componentId);
        DebugCommands_SetWordNumber(env, 3, railPos->posFront);
        DebugCommands_SetWordNumber(env, 4, railPos->posSide);
    } else {
        FieldPlayer_GetGPos(Field_GetPlayer(GSYS_GetField(gsys)), &x, &y, &z);
        DebugCommands_SetWordNumber(env, 2, x);
        DebugCommands_SetWordNumber(env, 3, y);
        DebugCommands_SetWordNumber(env, 4, z);
    }
    DebugCommands_SetWordText(env, 5, sDebugSeasonModeNames[PaperWhite2_GetSeasonMode(gameData)]);
    DebugCommands_SetWordText(env, 6, sDebugSeasonModeNames[SEASON_MODE_SPRING + GameData_GetSeason(gameData)]);
    DebugCommands_SetWordText(env, 7, sDebugDayPeriodNames[GetRealTimeDayPeriod(GameData_GetSeason(gameData))]);
    DebugCommands_SetWordText(env, 8, weather < WEATHER_MAX ? sDebugWeatherNames[weather] : Global10200_Text_DebugNone);
    if (species == 0) {
        DebugCommands_SetWordText(env, 9, Global10200_Text_DebugNone);
    } else {
        WordSet_LoadSpeciesName(wordSet, 9, species);
    }
    return rail;
}
// The context of the readout and of the samples: the world, the lead, the party and the field
static void DebugCommands_FillConditions(FieldScriptEnv *env, ConditionContext *ctx) {
    GameSystem *gsys = FieldScriptEnv_GetGameSystem(env);

    ConditionContext_Init(ctx);
    ConditionContext_FillGame(ctx, GSYS_GetGameData(gsys));
    if (GSYS_GetField(gsys) != NULL) {
        ConditionContext_FillField(ctx, GSYS_GetField(gsys));
    }
}

// A sample rule's name, its payload, or "none" for no rule
static void DebugCommands_SetWordRule(FieldScriptEnv *env, u32 index, const ConditionTable *table, s32 rule) {
    u32 size;
    const char *name;

    if (rule < 0) {
        DebugCommands_SetWordText(env, index, Global10200_Text_DebugNone);
        return;
    }
    name = Conditions_GetPayload(table, rule, &size);
    DebugCommands_SetWordAscii(env, index, size == 0 ? "?" : name);
}

static void DebugCommands_ConditionsWorld(FieldScriptEnv *env) {
    WordSet *wordSet = ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env));
    ConditionContext ctx;

    DebugCommands_FillConditions(env, &ctx);
    DebugCommands_SetWordText(env, 0, sDebugSeasonModeNames[SEASON_MODE_SPRING + ctx.season]);
    DebugCommands_SetWordText(env, 1, sDebugDayPeriodNames[ctx.period]);
    DebugCommands_SetWordText(env, 2,
                              ctx.weather < WEATHER_MAX ? sDebugWeatherNames[ctx.weather] : Global10200_Text_DebugNone);
    DebugCommands_SetWordNumber(env, 3, ctx.zone);
    loadLocationNameToStrbuf(wordSet, 4, ZoneData_GetPlaceNameID(ctx.zone));
    DebugCommands_SetWordNumber(env, 5, ctx.zoneParent);
    loadLocationNameToStrbuf(wordSet, 6, ZoneData_GetPlaceNameID(ctx.zoneParent));
    DebugCommands_SetWordAscii(env, 7, ctx.exterior ? "Outdoors" : "Indoors");
    DebugCommands_SetWordTerrain(env, 8, ctx.terrain);
    if (ctx.followerSpecies == 0) {
        DebugCommands_SetWordText(env, 9, Global10200_Text_DebugNone);
        DebugCommands_SetWordText(env, 10, Global10200_Text_DebugNone);
    } else {
        DebugCommands_SetWordTerrain(env, 9, ctx.followerTerrain);
        WordSet_LoadSpeciesName(wordSet, 10, ctx.followerSpecies);
    }
}

static BOOL DebugCommands_ConditionsParty(FieldScriptEnv *env) {
    WordSet *wordSet = ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env));
    ConditionContext ctx;

    DebugCommands_FillConditions(env, &ctx);
    DebugCommands_SetWordNumber(env, 5, ctx.medianLevel);
    DebugCommands_SetWordNumber(env, 6, ctx.scaledLevel);
    DebugCommands_SetWordNumber(env, 7, Conditions_ScaledLevelMin(ctx.scaledLevel));
    DebugCommands_SetWordNumber(env, 8, Conditions_ScaledLevelMax(ctx.scaledLevel));
    DebugCommands_SetWordNumber(env, 9, ctx.zoneLoadCounter);
    DebugCommands_SetWordHex(env, 10, ctx.loadSeed, HEX_DIGITS_SEED);
    DebugCommands_SetWordNumber(env, 11, ctx.dayNumber);
    DebugCommands_SetWordHex(env, 12, ctx.daySeed, HEX_DIGITS_SEED);
    if (!(ctx.filled & CONDITION_CONTEXT_SUBJECT)) {
        DebugCommands_SetWordText(env, 0, Global10200_Text_DebugNone);
        DebugCommands_SetWordNumber(env, 1, 0);
        DebugCommands_SetWordNumber(env, 2, 0);
        DebugCommands_SetWordAscii(env, 3, "-");
        DebugCommands_SetWordAscii(env, 4, "-");
        return FALSE;
    }
    WordSet_LoadSpeciesName(wordSet, 0, ctx.species);
    DebugCommands_SetWordNumber(env, 1, ctx.level);
    DebugCommands_SetWordNumber(env, 2, ctx.hpPercent);
    DebugCommands_SetWordAscii(env, 3, sDebugStatusNames[ctx.status]);
    loadNatureToStrbuf(wordSet, 4, ctx.nature);
    return TRUE;
}

static u32 DebugCommands_ConditionsRules(FieldScriptEnv *env, u32 first) {
    ConditionTable *table = Conditions_LoadTable(CONDITION_TABLE_MEMBER_DEBUG_SAMPLES, FieldScriptEnv_GetHeapID(env));
    ConditionContext ctx;
    u32 rng = GFL_RandomLC(0);
    u32 i;

    if (table == NULL) {
        return 0;
    }
    DebugCommands_FillConditions(env, &ctx);
    for (i = 0; i < CONDITIONS_RULES_PER_PAGE && first + i < table->ruleCount; i++) {
        DebugCommands_SetWordRule(env, i * 2, table, first + i);
        DebugCommands_SetWordText(env, i * 2 + 1,
                                  Conditions_MatchRule(table, first + i, &ctx, &rng) ? Global10200_Text_DebugMatch
                                                                                     : Global10200_Text_DebugNoMatch);
    }
    GFL_HeapFree(table);
    return i;
}

static void DebugCommands_ConditionsPick(FieldScriptEnv *env) {
    ConditionTable *table = Conditions_LoadTable(CONDITION_TABLE_MEMBER_DEBUG_SAMPLES, FieldScriptEnv_GetHeapID(env));
    ConditionContext ctx;
    u32 seed;
    u32 rng;

    DebugCommands_FillConditions(env, &ctx);
    seed = Conditions_Seed(&ctx, CONDITION_SEED_CHECK, 0);
    DebugCommands_SetWordHex(env, 1, seed, HEX_DIGITS_SEED);
    DebugCommands_SetWordHex(env, 4, Conditions_Seed(&ctx, CONDITION_SEED_LOAD, 1), HEX_DIGITS_SEED);
    if (table == NULL) {
        DebugCommands_SetWordRule(env, 0, NULL, -1);
        DebugCommands_SetWordRule(env, 2, NULL, -1);
        DebugCommands_SetWordRule(env, 3, NULL, -1);
        return;
    }
    rng = seed;
    DebugCommands_SetWordRule(env, 0, table, Conditions_Select(table, &ctx, table->share, &rng, NULL));
    // The load seed's pick twice, from the same start, so the same rule: a spawn's pick holds within a zone load
    rng = Conditions_Seed(&ctx, CONDITION_SEED_LOAD, 0);
    DebugCommands_SetWordRule(env, 2, table, Conditions_Select(table, &ctx, table->share, &rng, NULL));
    rng = Conditions_Seed(&ctx, CONDITION_SEED_LOAD, 0);
    DebugCommands_SetWordRule(env, 3, table, Conditions_Select(table, &ctx, table->share, &rng, NULL));
    GFL_HeapFree(table);
}
#endif
