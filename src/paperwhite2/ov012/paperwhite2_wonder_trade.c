#include "types.h"
#include "app/box2.h"
#include "app/box2_main.h"
#include "app/pokemon_trade.h"
#include "constants/arc.h"
#include "constants/flags.h"
#include "constants/items.h"
#include "constants/language.h"
#include "constants/met_locations.h"
#include "constants/moves.h"
#include "constants/natures.h"
#include "constants/pokemon.h"
#include "constants/text_banks.h"
#include "constants/vars.h"
#include "demo/evolution_demo.h"
#include "field/field_event.h"
#include "field/field_script.h"
#include "field/player_state.h"
#include "field/zone.h"
#include "gfl/heap.h"
#include "gfl/msg.h"
#include "gfl/random.h"
#include "gfl/str.h"
#include "paperwhite2/pokemon_center.h"
#include "paperwhite2/pokemon_center_config.h"
#include "paperwhite2/wonder_trade.h"
#include "pml/evolution.h"
#include "pml/item.h"
#include "pml/met_data.h"
#include "pml/personal.h"
#include "pml/poke_party.h"
#include "save/box.h"
#include "save/event_work.h"
#include "save/player_info.h"
#include "save/pokedex_savedata.h"
#include "save/save_control.h"
#include "save/trainer_data_savedata.h"
#include "system/game_data.h"
#include "system/game_event.h"
#include "system/game_system.h"
#include "system/wordset.h"

// Paper White 2: the Wonder Trade. See include/paperwhite2/wonder_trade.h and docs/paperwhite2/design/pokemon-center.md

#define LEVEL_MIN 1
#define LEVEL_MAX 100
#define PERCENT 100
#define STAT_COUNT 6
#define IV_MAX 31
// A Pokérus strain is 1 to 15, in the byte's high half, and its days in the low half are its strain's lowest two bits
// plus one, as the game infects a Pokémon (pokerusHandler)
#define POKERUS_STRAINS 15
#define POKERUS_STRAIN_SHIFT 4
#define POKERUS_DAYS_MASK 3
// The trade's word of the received Pokémon's name and of its trainer's (word 2 is the money window's)
#define WORD_RECEIVED 1
#define WORD_TRAINER 3
// A trainer's name, 7 characters and the terminator
#define TRAINER_NAME_SIZE 8
#define MOVE_COUNT 4
// The most the trade count holds, a variable's
#define TRADE_COUNT_MAX 0xffff

typedef struct {
    u16 first;
    u16 count;
} NameRange;

typedef struct {
    u8 language;
    u16 speciesNames;
    u16 weight;
    // The male names, the female names and the nicknames
    NameRange names[3];
} TradeLanguage;

enum {
    NAMES_MALE,
    NAMES_FEMALE,
    NAMES_NICKNAME,
};

typedef struct {
    u16 item;
    u16 weight;
} WeightedItem;

typedef struct {
    u16 weight;
    u16 first;
    u16 count;
} ItemTier;

static const u8 sExcluded[] = { WONDER_TRADE_EXCLUDED_SPECIES };
static const u16 sPreEvolutions[WONDER_TRADE_SPECIES_COUNT] = { WONDER_TRADE_PRE_EVOLUTIONS };
static const u8 sLeastLevels[WONDER_TRADE_SPECIES_COUNT] = { WONDER_TRADE_LEAST_LEVELS };
static const TradeLanguage sLanguages[WONDER_TRADE_LANGUAGE_COUNT] = { WONDER_TRADE_LANGUAGES };
static const WeightedItem sBalls[WONDER_TRADE_BALL_COUNT] = { WONDER_TRADE_BALLS };
static const ItemTier sItemTiers[WONDER_TRADE_ITEM_TIER_COUNT] = { WONDER_TRADE_ITEM_TIERS };
static const WeightedItem sItems[WONDER_TRADE_ITEM_COUNT] = { WONDER_TRADE_ITEMS };
static const u16 sSpecialMoves[MOVE_COUNT] = { WONDER_TRADE_SPECIAL_MOVES };
// In the order of PKM_PARAM_IV_HP's fields
static const u8 sSpecialIVs[STAT_COUNT] = { WONDER_TRADE_SPECIAL_IVS };

// The PC Box's pick, and where its callback puts the position
typedef struct {
    Box2Param box;
    u8 *speciesFlags;
    u16 *result;
} BoxPickWork;

typedef struct {
    GameSystem *gsys;
    GameData *gameData;
    WordSet *wordSet;
    u16 *result;
    u16 source;
    u16 index;
    BOOL special;
    // A copy of the Pokémon sent, which the trade shows and a trade evolution checks with
    PartyPkm *sent;
    PartyPkm *received;
    PlayerInfo *trainer;
    // Where the received one is when it may evolve: the party, or a party of its own for the Box
    PokeParty *party;
    u32 partyIndex;
    PokemonTradeDemoParam demo;
    EvolutionDemoParam evolution;
} WonderTradeWork;

static BOOL Chance(u32 percent) {
    return GFL_RandomLC(PERCENT) < percent;
}

BOOL WonderTrade_IsExcluded(u32 species) {
    if (species == 0 || species >= WONDER_TRADE_SPECIES_COUNT) {
        return TRUE;
    }
    return (sExcluded[species / 8] >> (species % 8)) & 1;
}

// An index of weights, by a draw below their total
static u32 PickWeighted(const WeightedItem *items, u32 count) {
    u32 total = 0;
    u32 draw;
    u32 i;

    for (i = 0; i < count; i++) {
        total += items[i].weight;
    }
    draw = GFL_RandomLC(total);
    for (i = 0; i < count - 1; i++) {
        if (draw < items[i].weight) {
            break;
        }
        draw -= items[i].weight;
    }
    return i;
}

static u32 PickLanguage(void) {
    u32 total = 0;
    u32 draw;
    u32 i;

    for (i = 0; i < WONDER_TRADE_LANGUAGE_COUNT; i++) {
        total += sLanguages[i].weight;
    }
    draw = GFL_RandomLC(total);
    for (i = 0; i < WONDER_TRADE_LANGUAGE_COUNT - 1; i++) {
        if (draw < sLanguages[i].weight) {
            break;
        }
        draw -= sLanguages[i].weight;
    }
    return i;
}

static u32 PickItem(void) {
    u32 total = 0;
    u32 draw;
    u32 tier;

    for (tier = 0; tier < WONDER_TRADE_ITEM_TIER_COUNT; tier++) {
        total += sItemTiers[tier].weight;
    }
    draw = GFL_RandomLC(total);
    for (tier = 0; tier < WONDER_TRADE_ITEM_TIER_COUNT - 1; tier++) {
        if (draw < sItemTiers[tier].weight) {
            break;
        }
        draw -= sItemTiers[tier].weight;
    }
    return sItems[sItemTiers[tier].first + PickWeighted(&sItems[sItemTiers[tier].first], sItemTiers[tier].count)].item;
}

// The sent level plus or minus 1 to WONDER_TRADE_LEVEL_SPREAD, within 1 to 100
static u32 PickLevel(u32 sentLevel) {
    s32 level = sentLevel;

    if (WONDER_TRADE_LEVEL_SPREAD > 0) {
        s32 step = 1 + GFL_RandomLC(WONDER_TRADE_LEVEL_SPREAD);

        level += GFL_RandomLC(2) ? step : -step;
    }
    if (level < LEVEL_MIN) {
        level = LEVEL_MIN;
    } else if (level > LEVEL_MAX) {
        level = LEVEL_MAX;
    }
    return level;
}

void WonderTrade_Plan(WonderTradePlan *plan, u32 sentLevel) {
    const TradeLanguage *language;
    const NameRange *names;
    u32 species;

    do {
        species = 1 + GFL_RandomLC(WONDER_TRADE_SPECIES_COUNT - 1);
    } while (WonderTrade_IsExcluded(species));
    plan->level = PickLevel(sentLevel);
    // No level 8 Garchomp: a species too evolved for the level is its pre-evolution
    while (plan->level < sLeastLevels[species] && sPreEvolutions[species] != 0) {
        species = sPreEvolutions[species];
    }
    plan->species = species;

    plan->languageIndex = PickLanguage();
    language = &sLanguages[plan->languageIndex];
    plan->language = language->language;
    plan->femaleTrainer = Chance(WONDER_TRADE_FEMALE_TRAINER_PERCENT);
    names = &language->names[plan->femaleTrainer ? NAMES_FEMALE : NAMES_MALE];
    plan->trainerNameLine = names->first + GFL_RandomLC(names->count);
    plan->trainerId = GFL_RandomLC(0);

    plan->shiny = GFL_RandomLC(WONDER_TRADE_SHINY_ONE_IN) == 0;
    plan->hiddenAbility = Chance(WONDER_TRADE_HIDDEN_ABILITY_PERCENT);
    plan->perfectIVs = Chance(WONDER_TRADE_PERFECT_IVS_PERCENT);
    plan->pokerus = Chance(WONDER_TRADE_POKERUS_PERCENT);
    plan->nicknameLine = WONDER_TRADE_PLAN_NO_NICKNAME;
    if (Chance(WONDER_TRADE_NICKNAME_PERCENT)) {
        names = &language->names[NAMES_NICKNAME];
        plan->nicknameLine = names->first + GFL_RandomLC(names->count);
    }
    plan->ball = sBalls[PickWeighted(sBalls, WONDER_TRADE_BALL_COUNT)].item;
    plan->item = ITEM_NONE;
    if (Chance(WONDER_TRADE_HELD_ITEM_PERCENT)) {
        plan->item = PickItem();
    }
}

static StrBuf *LoadName(u32 line, HeapID heapId) {
    MsgData *msgData = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_WONDER_TRADE_NAMES, heapId);
    StrBuf *name = GFL_MsgDataLoadStrbufNew(msgData, line);

    GFL_MsgDataFree(msgData);
    return name;
}

// Names a Pokémon without a nickname as its species is in its own language, as its trainer's game would
static void SetSpeciesNameInLanguage(PartyPkm *pkm, HeapID heapId) {
    u32 language = PokeParty_GetParam(pkm, PKM_PARAM_REGION, NULL);
    MsgData *msgData;
    StrBuf *name;
    u32 i;

    if (language == GAME_LANGUAGE || PokeParty_GetParam(pkm, PKM_PARAM_IS_NICKNAMED, NULL)) {
        return;
    }
    for (i = 0; i < WONDER_TRADE_LANGUAGE_COUNT; i++) {
        if (sLanguages[i].language == language) {
            break;
        }
    }
    if (i == WONDER_TRADE_LANGUAGE_COUNT) {
        return;
    }
    msgData = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, sLanguages[i].speciesNames, heapId);
    name = GFL_MsgDataLoadStrbufNew(msgData, PokeParty_GetParam(pkm, PKM_PARAM_SPECIES, NULL));
    PokeParty_SetParam(pkm, PKM_PARAM_NICKNAME_KEEP_FLAG, (u32)name);
    GFL_StrBufFree(name);
    GFL_MsgDataFree(msgData);
}

// Sets count different stats' IVs to 31
static void SetPerfectIVs(PartyPkm *pkm, u32 count) {
    u32 done = 0;
    u32 stat;

    while (count > 0) {
        stat = GFL_RandomLC(STAT_COUNT);
        if (!(done & (1 << stat))) {
            done |= 1 << stat;
            PokeParty_SetParam(pkm, PKM_PARAM_IV_HP + stat, IV_MAX);
            count--;
        }
    }
}

// Makes the Pokémon of a plan, with its trainer, met in a trade
static void MakePkm(PartyPkm *pkm, PlayerInfo *trainer, const WonderTradePlan *plan, GameData *gameData,
                    HeapID heapId) {
    u32 pid = PML_GenPID(plan->trainerId, plan->species, 0, GENDER_UNKNOWN, GFL_RandomLC(2),
                         plan->shiny ? PID_RARE_ALWAYS : PID_RARE_NEVER);
    StrBuf *name;
    u32 strain;
    u32 days;

    PokeParty_CreatePkm(pkm, plan->species, plan->level, plan->trainerId, PKM_IVS_RANDOM, pid);
    PokeParty_SetParam(pkm, PKM_PARAM_REGION, plan->language);
    if (plan->hiddenAbility) {
        PokeParty_SetHiddenAbil(pkm, plan->species, 0);
    }
    if (plan->perfectIVs) {
        SetPerfectIVs(pkm, WONDER_TRADE_PERFECT_IV_COUNT);
    }
    if (plan->pokerus) {
        strain = 1 + GFL_RandomLC(POKERUS_STRAINS);
        days = (strain & POKERUS_DAYS_MASK) + 1;
        PokeParty_SetParam(pkm, PKM_PARAM_POKERUS, (strain << POKERUS_STRAIN_SHIFT) | days);
    }
    PokeParty_SetParam(pkm, PKM_PARAM_POKEBALL, PML_ItemGetMonsBallID(plan->ball));
    PokeParty_SetParam(pkm, PKM_PARAM_ITEM, plan->item);
    if (plan->nicknameLine != WONDER_TRADE_PLAN_NO_NICKNAME) {
        name = LoadName(plan->nicknameLine, heapId);
        PokeParty_SetParam(pkm, PKM_PARAM_NICKNAME_KEEP_FLAG, (u32)name);
        PokeParty_SetParam(pkm, PKM_PARAM_IS_NICKNAMED, TRUE);
        GFL_StrBufFree(name);
    } else {
        SetSpeciesNameInLanguage(pkm, heapId);
    }

    name = LoadName(plan->trainerNameLine, heapId);
    PokeParty_SetParam(pkm, PKM_PARAM_OT_NAME, (u32)name);
    copyTrainerNameFromStrbuf(trainer, name);
    GFL_StrBufFree(name);
    PokeParty_SetParam(pkm, PKM_PARAM_OT_GENDER, plan->femaleTrainer);
    setTrainerGender(trainer, plan->femaleTrainer);
    setIDAsUInt(trainer, plan->trainerId);
    PlayerInfo_SetRegion(trainer, plan->language);
    PokeParty_SetupMetData(pkm, 1, GetGameDataPlayerInfo(gameData), LOCATION_IN_GAME_TRADE, heapId);
    PokeParty_RecalcStats(pkm);
}

// Makes the special reward: services.json's fixed Pokémon, never shiny, with the player as its trainer, met where the
// player is; the trade's partner is the player too
static void MakeSpecialPkm(PartyPkm *pkm, PlayerInfo *trainer, GameData *gameData, HeapID heapId) {
    PlayerInfo *player = GetGameDataPlayerInfo(gameData);
    u32 trainerId = getIDAsUInt(player);
    u32 ability = WONDER_TRADE_SPECIAL_ABILITY_SLOT == ABILITY_SLOT_HIDDEN ? 0 : WONDER_TRADE_SPECIAL_ABILITY_SLOT;
    u32 pid = PML_GenPID(trainerId, WONDER_TRADE_SPECIAL_SPECIES, WONDER_TRADE_SPECIAL_FORM, GENDER_UNKNOWN, ability,
                         PID_RARE_NEVER);
    u16 zoneId = PlayerState_GetZoneID(GameData_GetPlayerState(gameData));
    u32 i;

    PokeParty_CreatePkm(pkm, WONDER_TRADE_SPECIAL_SPECIES, WONDER_TRADE_SPECIAL_LEVEL, trainerId, PKM_IVS_RANDOM, pid);
    PokeParty_ChangeForme(pkm, WONDER_TRADE_SPECIAL_FORM);
    if (WONDER_TRADE_SPECIAL_ABILITY_SLOT == ABILITY_SLOT_HIDDEN) {
        PokeParty_SetHiddenAbil(pkm, WONDER_TRADE_SPECIAL_SPECIES, WONDER_TRADE_SPECIAL_FORM);
    }
    for (i = 0; i < STAT_COUNT; i++) {
        PokeParty_SetParam(pkm, PKM_PARAM_IV_HP + i, sSpecialIVs[i]);
    }
    for (i = 0; i < MOVE_COUNT; i++) {
        PokeParty_SetMove(pkm, sSpecialMoves[i], i);
    }
    PokeParty_SetParam(pkm, PKM_PARAM_NATURE, WONDER_TRADE_SPECIAL_NATURE);
    PokeParty_SetParam(pkm, PKM_PARAM_POKEBALL, PML_ItemGetMonsBallID(WONDER_TRADE_SPECIAL_BALL));
    PokeParty_SetParam(pkm, PKM_PARAM_ITEM, WONDER_TRADE_SPECIAL_ITEM);
    PokeParty_SetupMetData(pkm, 0, player, ZoneData_GetPlaceNameID(zoneId), heapId);
    PokeParty_RecalcStats(pkm);
    PlayerInfo_Copy(player, trainer);
}

// The Box's Pokémon at a position, tray * BOX_MAX_POS + position, or NULL for none
static BoxPkm *GetBoxPkm(GameData *gameData, u32 index) {
    BoxSaveAccessor *boxes = GameData_GetBoxSaveAccessor(gameData);
    u32 tray = index / BOX_MAX_POS;
    u32 position = index % BOX_MAX_POS;

    if (tray >= BOX_MAX_TRAY || BoxSaveAccessor_GetPkmParam(boxes, tray, position, PKM_PARAM_SPECIES, NULL) == 0) {
        return NULL;
    }
    return BoxSaveAccessor_GetPkm(boxes, tray, position);
}

u32 WonderTrade_Check(FieldScriptEnv *env, u32 source, u32 index) {
    GameData *gameData = FieldScriptEnv_GetGameData(env);
    WordSet *wordSet = ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env));
    PokeParty *party = GameData_GetParty(gameData);
    PartyPkm *pkm = NULL;
    BoxPkm *boxPkm;

    if (source == WONDER_TRADE_SOURCE_PARTY) {
        if (index >= (u32)PokeParty_GetPkmCount(party)) {
            return WONDER_TRADE_CHECK_NONE;
        }
        pkm = PokeParty_GetPkm(party, index);
        boxPkm = PokeParty_GetBoxPkm(pkm);
    } else {
        boxPkm = GetBoxPkm(gameData, index);
        if (boxPkm == NULL) {
            return WONDER_TRADE_CHECK_NONE;
        }
    }
    loadBoxPokemonNameToStrbuf(wordSet, 0, boxPkm);
    if (PML_PkmGetParam(boxPkm, PKM_PARAM_IS_EGG, NULL)) {
        return WONDER_TRADE_CHECK_EGG;
    }
    if (WonderTrade_IsExcluded(PML_PkmGetParam(boxPkm, PKM_PARAM_SPECIES, NULL))) {
        return WONDER_TRADE_CHECK_EXCLUDED;
    }
    if (PML_PkmGetParam(boxPkm, PKM_PARAM_ITEM, NULL) != ITEM_NONE) {
        return WONDER_TRADE_CHECK_ITEM;
    }
    if (pkm != NULL && PokeParty_GetParam(pkm, PKM_PARAM_HP, NULL) != 0 && howManyPokesAreAbleToFight(party) <= 1) {
        return WONDER_TRADE_CHECK_LAST_BATTLER;
    }
    return WONDER_TRADE_CHECK_OK;
}

BOOL WonderTrade_RollSpecial(FieldScriptEnv *env) {
    EventWork *eventWork = GameData_GetEventWork(FieldScriptEnv_GetGameData(env));
    u32 trade = *EventWork_GetWkPtr(eventWork, EVENT_WORK_WONDER_TRADE_COUNT) + 1;

    if (!WONDER_TRADE_SPECIAL_ENABLED || EventWork_FlagGet(eventWork, EVENT_FLAG_WONDER_TRADE_SPECIAL_RECEIVED)) {
        return FALSE;
    }
    return trade >= WONDER_TRADE_SPECIAL_GUARANTEED_AT || Chance(WONDER_TRADE_SPECIAL_PERCENT);
}

// Puts the position the Box's pick chose, or WONDER_TRADE_NONE
static void FinishBoxPick(void *data) {
    BoxPickWork *work = data;

    if (work->box.tray == BOX2_GET_NONE && work->box.position == BOX2_GET_NONE) {
        *work->result = WONDER_TRADE_NONE;
    } else {
        *work->result = work->box.tray * BOX_MAX_POS + work->box.position;
    }
    GFL_HeapFree(work->speciesFlags);
    GFL_HeapFree(work);
}

// The PC Box in the Dream World's mode, which only picks a Pokémon, unless it is an Egg or its species isn't flagged:
// every species the Wonder Trade takes. The box's own messages are the trade's (Box2Param's wonderTrade)
void WonderTrade_CallBox(FieldScriptEnv *env, u16 *result) {
    GameSystem *gsys = FieldScriptEnv_GetGameSystem(env);
    GameData *gameData = GSYS_GetGameData(gsys);
    BoxPickWork *work =
        GFL_HeapAllocate(HEAPID_GAMEEVENT, sizeof(BoxPickWork), TRUE, "paperwhite2_wonder_trade.c", __LINE__);
    u32 species;

    work->result = result;
    work->speciesFlags = GFL_HeapAllocate(HEAPID_GAMEEVENT, WONDER_TRADE_SPECIES_COUNT / 8 + 1, TRUE,
                                          "paperwhite2_wonder_trade.c", __LINE__);
    for (species = 1; species < WONDER_TRADE_SPECIES_COUNT; species++) {
        if (!WonderTrade_IsExcluded(species)) {
            work->speciesFlags[species / 8] |= 1 << (species % 8);
        }
    }
    work->box.gameData = gameData;
    work->box.boxes = GameData_GetBoxSaveAccessor(gameData);
    work->box.party = GameData_GetParty(gameData);
    work->box.bag = GameData_GetBag(gameData);
    work->box.playerInfo = GetGameDataPlayerInfo(gameData);
    work->box.trainerData = getTrainerDataBlkAddress(GameData_GetSaveControl(gameData));
    work->box.isNationalDex = PokeDex_IsNationalObtained(GameData_GetPokedex(gameData));
    work->box.unk20 = work->speciesFlags;
    work->box.mode = BOX2_MODE_DREAM_WORLD;
    work->box.wonderTrade = TRUE;
    ScriptWork_CallEvent(FieldScriptEnv_GetScriptWork(env), EventFieldSubprocessCall_CreateWithCallback(
                                                                gsys, GSYS_GetField(gsys), OVERLAY_BOX2,
                                                                &BOX2_PROC_FUNCTIONS, &work->box, FinishBoxPick, work));
}

// Puts the received Pokémon where the sent one was, in the Pokédex (with its language), and counts the trade
static void PlaceReceived(WonderTradeWork *work) {
    EventWork *eventWork = GameData_GetEventWork(work->gameData);
    PokeDexSave *pokedex = GameData_GetPokedex(work->gameData);
    u16 *count = EventWork_GetWkPtr(eventWork, EVENT_WORK_WONDER_TRADE_COUNT);

    if (work->source == WONDER_TRADE_SOURCE_PARTY) {
        work->party = GameData_GetParty(work->gameData);
        work->partyIndex = work->index;
        copyPkmIntoPartyBlk(work->party, work->index, work->received);
    } else {
        // A party of its own, so it can evolve as a party Pokémon does before it goes in the Box
        work->party = PokeParty_Create(HEAPID_GAMEEVENT);
        work->partyIndex = 0;
        PokeParty_AddPkm(work->party, work->received);
    }
    PokeDex_RegistPkm(pokedex, work->received);
    addPkmToDex(pokedex, work->received);
    if (*count < TRADE_COUNT_MAX) {
        (*count)++;
    }
    if (work->special) {
        EventWork_FlagSet(eventWork, EVENT_FLAG_WONDER_TRADE_SPECIAL_RECEIVED);
    }
}

// The received Pokémon's species if it evolves by this trade (or with the sent one, for Karrablast and Shelmet), as
// any trade does; or 0
static u32 CheckTradeEvolution(WonderTradeWork *work, u32 *method) {
    PartyPkm *pkm = PokeParty_GetPkm(work->party, work->partyIndex);

    return CheckEvolveSpecies(work->party, pkm, EVO_CHECK_TRADE, (u32)work->sent, GameData_GetSeason(work->gameData),
                              method, HEAPID_GAMEEVENT);
}

static void Finish(WonderTradeWork *work) {
    PartyPkm *pkm = PokeParty_GetPkm(work->party, work->partyIndex);
    StrBuf *name = GFL_StrBufCreate(TRAINER_NAME_SIZE, HEAPID_GAMEEVENT);

    // An evolution names it in the game's language
    SetSpeciesNameInLanguage(pkm, HEAPID_GAMEEVENT);
    if (work->source == WONDER_TRADE_SOURCE_BOX) {
        BoxSaveAccessor_SetPkm(GameData_GetBoxSaveAccessor(work->gameData), work->index / BOX_MAX_POS,
                               work->index % BOX_MAX_POS, PokeParty_GetBoxPkm(pkm));
    }
    loadPokemonNicknameToStrbuf(work->wordSet, WORD_RECEIVED, pkm);
    PokeParty_GetParam(pkm, PKM_PARAM_OT_NAME, name);
    GFL_WordSetSetStrbuf(work->wordSet, WORD_TRAINER, name, PokeParty_GetParam(pkm, PKM_PARAM_OT_GENDER, NULL), TRUE,
                         PokeParty_GetParam(pkm, PKM_PARAM_REGION, NULL));
    GFL_StrBufFree(name);
    *work->result = PokeParty_GetParam(pkm, PKM_PARAM_SPECIES, NULL);
    if (work->source == WONDER_TRADE_SOURCE_BOX) {
        GFL_HeapFree(work->party);
    }
    GFL_HeapFree(work->sent);
    GFL_HeapFree(work->received);
    GFL_HeapFree(work->trainer);
}

static GameEventReturnCode WonderTrade_Event(GameEvent *event, u32 *state, void *data) {
    WonderTradeWork *work = data;
    Field *field = GSYS_GetField(work->gsys);
    u32 species;
    u32 method;

    switch (*state) {
    case 0:
        work->demo.gameData = work->gameData;
        work->demo.pkm[0] = work->sent;
        work->demo.pkm[1] = work->received;
        work->demo.myInfo = GetGameDataPlayerInfo(work->gameData);
        work->demo.partnerInfo = work->trainer;
        GameEvent_ChainNext(event, EventFieldSubprocessTransition_Create(work->gsys, field, OVERLAY_POKEMONTRADE,
                                                                         &data_ov194_021c63ac, &work->demo));
        *state = 1;
        break;
    case 1:
        PlaceReceived(work);
        species = CheckTradeEvolution(work, &method);
        *state = 2;
        if (species != 0) {
            work->evolution.gameData = work->gameData;
            work->evolution.party = work->party;
            work->evolution.species = species;
            work->evolution.partyIndex = work->partyIndex;
            work->evolution.method = method;
            work->evolution.unkC = 1;
            work->evolution.canCancel = FALSE;
            GameEvent_ChainNext(event, EventFieldSubprocessTransition_Create(work->gsys, field, OVERLAY_EVOLUTION_DEMO,
                                                                             &EVOLUTION_DEMO_PROC_FUNCTIONS,
                                                                             &work->evolution));
        }
        break;
    case 2:
        Finish(work);
        return GAMEEVENT_DONE;
    }
    return GAMEEVENT_CONTINUE;
}

// Makes the Pokémon received and starts the trade, which the script waits for
void WonderTrade_CallTrade(FieldScriptEnv *env, u32 source, u32 index, u16 *result) {
    GameSystem *gsys = FieldScriptEnv_GetGameSystem(env);
    GameData *gameData = GSYS_GetGameData(gsys);
    GameEvent *event = GameEvent_Create(gsys, NULL, WonderTrade_Event, sizeof(WonderTradeWork));
    WonderTradeWork *work = GameEvent_GetData(event);
    WonderTradePlan plan;
    PartyPkm *pkm;

    work->gsys = gsys;
    work->gameData = gameData;
    work->wordSet = ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env));
    work->result = result;
    work->source = source & ~WONDER_TRADE_SPECIAL;
    work->index = index;
    work->special = (source & WONDER_TRADE_SPECIAL) != 0;
    work->sent = GFL_HeapAllocate(HEAPID_GAMEEVENT, sizeof(PartyPkm), FALSE, "paperwhite2_wonder_trade.c", __LINE__);
    if (work->source == WONDER_TRADE_SOURCE_PARTY) {
        copyPartyPkm(PokeParty_GetPkm(GameData_GetParty(gameData), index), work->sent);
    } else {
        pkm = boxPkmRegenToPartyPkm(
            BoxSaveAccessor_GetPkm(GameData_GetBoxSaveAccessor(gameData), index / BOX_MAX_POS, index % BOX_MAX_POS),
            HEAPID_GAMEEVENT);
        copyPartyPkm(pkm, work->sent);
        GFL_HeapFree(pkm);
    }
    work->received =
        GFL_HeapAllocate(HEAPID_GAMEEVENT, sizeof(PartyPkm), FALSE, "paperwhite2_wonder_trade.c", __LINE__);
    work->trainer = PlayerInfo_Create(HEAPID_GAMEEVENT);
    PlayerInfo_Init(work->trainer);
    if (work->special) {
        MakeSpecialPkm(work->received, work->trainer, gameData, HEAPID_GAMEEVENT);
    } else {
        WonderTrade_Plan(&plan, PokeParty_GetParam(work->sent, PKM_PARAM_LEVEL, NULL));
        MakePkm(work->received, work->trainer, &plan, gameData, HEAPID_GAMEEVENT);
    }
    ScriptWork_CallEvent(FieldScriptEnv_GetScriptWork(env), event);
}
