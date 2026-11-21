#include "types.h"
#include "constants/arc.h"
#include "constants/moves.h"
#include "constants/pokemon.h"
#include "constants/script_text_banks.h"
#include "field/field_msgbg.h"
#include "field/field_script.h"
#include "gfl/msg.h"
#include "gfl/random.h"
#include "gfl/str.h"
#include "paperwhite2/entralink_buffs.h"
#include "paperwhite2/entralink_run_party.h"
#include "paperwhite2/entralink_run_state.h"
#include "pml/move.h"
#include "pml/poke_party.h"
#include "system/bmp_menuwork.h"
#include "system/game_data.h"
#include "system/str_tool.h"
#include "system/wordset.h"

// Paper White 2: the Entralink run's buff offers, in overlay 12 beside the run (phase 2). See
// include/paperwhite2/entralink_buffs.h and docs/paperwhite2/design/entralink-buffs.md, section 9

// The cards' title and description strings, and the most options a script's list menu holds (InitListMenu's)
#define BUFF_TEXT_LENGTH 128
#define LIST_OPTIONS_MAX 32
// Weights in hundredths, so that a percent setting multiplies them exactly
#define WEIGHT_SCALE 100
// A number in a list line (a price, a count): at most 5 digits
#define NUMBER_DIGITS 5

static const EntralinkBuff sBuffs[ENTRALINK_BUFF_COUNT] = ENTRALINK_BUFF_TABLE;
static const u8 sOdds[ENTRALINK_BUFF_SOURCE_COUNT][3] = ENTRALINK_BUFF_ODDS;
// Rebalance 2: the themes' team tags, each theme's moves (abilities) from its start to the next theme's
static const u16 sTeamMoves[ENTRALINK_BUFF_TEAM_MOVE_COUNT] = ENTRALINK_BUFF_TEAM_MOVES;
static const u16 sTeamMoveStarts[ENTRALINK_BUFF_THEME_COUNT + 1] = ENTRALINK_BUFF_TEAM_MOVE_STARTS;
static const u16 sTeamAbilities[ENTRALINK_BUFF_TEAM_ABILITY_COUNT] = ENTRALINK_BUFF_TEAM_ABILITIES;
static const u16 sTeamAbilityStarts[ENTRALINK_BUFF_THEME_COUNT + 1] = ENTRALINK_BUFF_TEAM_ABILITY_STARTS;

// What weighs the cards of a draw: the themes of the golds held, a bit each, and each theme's weight by the team, in
// percent
typedef struct {
    u32 heldThemes;
    u16 team[ENTRALINK_BUFF_THEME_COUNT];
} DrawWeights;

// The text a list or a message of cards is made of: the text bank SCRIPT_TEXT_ENTRALINK_BUFFS, the script's words,
// and three strings
typedef struct {
    MsgData *msgData;
    WordSet *wordSet;
    StrBuf *title;
    StrBuf *text;
    StrBuf *temp;
    HeapID heapId;
} BuffText;

// The pool of a source's cards
static u32 EntralinkBuffs_GetPool(u32 source) {
    switch (source) {
    case ENTRALINK_BUFF_SOURCE_GIFT:
        return ENTRALINK_BUFF_POOL_GIFT;
    case ENTRALINK_BUFF_SOURCE_BUFF_ROOM:
        return ENTRALINK_BUFF_POOL_BUFF_ROOM;
    case ENTRALINK_BUFF_SOURCE_SHOP:
        return ENTRALINK_BUFF_POOL_SHOP;
    }
    return ENTRALINK_BUFF_POOL_AFTER_BATTLE;
}

// The types of the run's team, a bit each
static u32 EntralinkBuffs_GetTeamTypes(GameData *gameData) {
    PokeParty *party = GameData_GetParty(gameData);
    PartyPkm *pkm;
    u32 types = 0;
    int count = PokeParty_GetPkmCount(party);
    int i;

    for (i = 0; i < count; i++) {
        pkm = PokeParty_GetPkm(party, i);
        if (PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL)) {
            continue;
        }
        types |= 1 << PokeParty_GetParam(pkm, PKM_PARAM_TYPE1, NULL);
        types |= 1 << PokeParty_GetParam(pkm, PKM_PARAM_TYPE2, NULL);
    }
    return types;
}

// The themes of the golds held, a bit each
static u32 EntralinkBuffs_GetHeldThemes(void) {
    u32 themes = 0;
    u32 buff;
    u32 slot;

    for (slot = 0; slot < ENTRALINK_BUFF_GOLD_SLOTS; slot++) {
        buff = EntralinkBuffs_GetGoldSlot(slot);
        if (buff != ENTRALINK_BUFF_NONE && sBuffs[buff].theme != ENTRALINK_BUFF_THEME_NONE) {
            themes |= 1 << sBuffs[buff].theme;
        }
    }
    return themes;
}

// Whether a value is in a part of a list
static BOOL EntralinkBuffs_IsListed(const u16 *list, u32 start, u32 end, u32 value) {
    u32 i;

    for (i = start; i < end; i++) {
        if (list[i] == value) {
            return TRUE;
        }
    }
    return FALSE;
}

// What the team's scan reads of a Pokémon, once a draw: its ability, its moves, and whether each is a damaging move of
// one of its own types
typedef struct {
    u16 ability;
    u16 moves[4];
    u8 stabMoves;
} TeamMember;

static void EntralinkBuffs_ReadMember(PartyPkm *pkm, TeamMember *member) {
    u32 type1 = PokeParty_GetParam(pkm, PKM_PARAM_TYPE1, NULL);
    u32 type2 = PokeParty_GetParam(pkm, PKM_PARAM_TYPE2, NULL);
    u32 type;
    u32 i;

    member->ability = PokeParty_GetParam(pkm, PKM_PARAM_ABILITY, NULL);
    member->stabMoves = 0;
    for (i = 0; i < 4; i++) {
        member->moves[i] = PokeParty_GetParam(pkm, PKM_PARAM_MOVE1 + i, NULL);
        if (member->moves[i] == MOVE_NONE || !(ENTRALINK_BUFF_TEAM_STAB_THEMES)) {
            continue;
        }
        // The type first: the move's power is read only for one of the Pokémon's own types
        type = PML_MoveGetType(member->moves[i]);
        if ((type == type1 || type == type2) && PML_MoveIsDamaging(member->moves[i])) {
            member->stabMoves |= 1 << i;
        }
    }
}

// Whether a Pokémon plays a theme (rebalance 2): it has one of the theme's moves or abilities (buffs.json's team_tags),
// or for a theme that counts them, a damaging move of one of its own types
static BOOL EntralinkBuffs_PlaysTheme(const TeamMember *member, u32 theme) {
    u32 i;

    if (EntralinkBuffs_IsListed(sTeamAbilities, sTeamAbilityStarts[theme], sTeamAbilityStarts[theme + 1],
                                member->ability)) {
        return TRUE;
    }
    if ((ENTRALINK_BUFF_TEAM_STAB_THEMES & (1 << theme)) && member->stabMoves != 0) {
        return TRUE;
    }
    for (i = 0; i < 4; i++) {
        if (member->moves[i] != MOVE_NONE &&
            EntralinkBuffs_IsListed(sTeamMoves, sTeamMoveStarts[theme], sTeamMoveStarts[theme + 1], member->moves[i])) {
            return TRUE;
        }
    }
    return FALSE;
}

// The weights a draw uses: the themes of the golds held, and each theme's weight in percent by the Pokémon of the run's
// team that play it (rebalance 2: team_theme_weight each, at most team_theme_max), scanned as the cards are drawn so a
// swap counts
static void EntralinkBuffs_GetDrawWeights(GameData *gameData, DrawWeights *weights) {
    PokeParty *party = GameData_GetParty(gameData);
    PartyPkm *pkm;
    TeamMember member;
    int count = PokeParty_GetPkmCount(party);
    u32 theme;
    int i;

    weights->heldThemes = EntralinkBuffs_GetHeldThemes();
    for (theme = 0; theme < ENTRALINK_BUFF_THEME_COUNT; theme++) {
        weights->team[theme] = 100;
    }
    for (i = 0; i < count; i++) {
        pkm = PokeParty_GetPkm(party, i);
        if (PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL)) {
            continue;
        }
        EntralinkBuffs_ReadMember(pkm, &member);
        for (theme = 0; theme < ENTRALINK_BUFF_THEME_COUNT; theme++) {
            if (EntralinkBuffs_PlaysTheme(&member, theme)) {
                weights->team[theme] += ENTRALINK_BUFF_TEAM_THEME_WEIGHT;
            }
        }
    }
    for (theme = 0; theme < ENTRALINK_BUFF_THEME_COUNT; theme++) {
        if (weights->team[theme] > ENTRALINK_BUFF_TEAM_THEME_MAX) {
            weights->team[theme] = ENTRALINK_BUFF_TEAM_THEME_MAX;
        }
    }
}

// The team's weight for a card in percent: a gold's theme's, a purple's best related theme's, 100 for the others
static u32 EntralinkBuffs_GetTeamWeight(const EntralinkBuff *entry, const DrawWeights *weights) {
    u32 best = 100;
    u32 theme;

    if (entry->tier == ENTRALINK_BUFF_TIER_GOLD) {
        return entry->theme != ENTRALINK_BUFF_THEME_NONE ? weights->team[entry->theme] : 100;
    }
    for (theme = 0; theme < ENTRALINK_BUFF_THEME_COUNT; theme++) {
        if ((entry->related & (1 << theme)) && weights->team[theme] > best) {
            best = weights->team[theme];
        }
    }
    return best;
}

// A type's weight for a type card: none once its count is at the card's highest, more for the team's types
static u32 EntralinkBuffs_GetTypeWeight(u32 buff, u32 type, u32 teamTypes) {
    if (EntralinkBuffs_GetTypeCount(buff, type) >= sBuffs[buff].maxLevel) {
        return 0;
    }
    return (teamTypes & (1 << type)) ? ENTRALINK_BUFF_TYPE_CARD_TEAM_WEIGHT : WEIGHT_SCALE;
}

// A type card's type, at random by the types' weights; ENTRALINK_BUFF_CARD_TYPES if every type is at its highest
static u32 EntralinkBuffs_DrawType(u32 buff, u32 teamTypes) {
    u32 total = 0;
    u32 roll;
    u32 weight;
    u32 type;

    for (type = 0; type < ENTRALINK_BUFF_CARD_TYPES; type++) {
        total += EntralinkBuffs_GetTypeWeight(buff, type, teamTypes);
    }
    if (total == 0) {
        return ENTRALINK_BUFF_CARD_TYPES;
    }
    roll = GFL_RandomLC(total);
    for (type = 0; type < ENTRALINK_BUFF_CARD_TYPES; type++) {
        weight = EntralinkBuffs_GetTypeWeight(buff, type, teamTypes);
        if (roll < weight) {
            break;
        }
        roll -= weight;
    }
    return type;
}

// Whether a buff can still rise: a gold below its highest rank, a blue or purple below the picks that reach its cap,
// a type card with a type below that
static BOOL EntralinkBuffs_CanRise(u32 buff) {
    u32 type;

    if (sBuffs[buff].typeCard == ENTRALINK_BUFF_TYPE_CARD_NONE) {
        return EntralinkBuffs_GetLevel(buff) < sBuffs[buff].maxLevel;
    }
    for (type = 0; type < ENTRALINK_BUFF_CARD_TYPES; type++) {
        if (EntralinkBuffs_GetTypeCount(buff, type) < sBuffs[buff].maxLevel) {
            return TRUE;
        }
    }
    return FALSE;
}

// A buff's weight in a draw from a pool in a round: none outside them, below none of the excluded cards, or when it
// can't rise; its own weight, times rank_up_weight for a gold held, times held_theme_weight for another gold of a
// theme held or a purple related to one, times the team's weight for its theme (rebalance 2)
static u32 EntralinkBuffs_GetWeight(u32 buff, u32 pool, u32 round, const EntralinkCard *excluded, u32 count,
                                    const DrawWeights *weights) {
    const EntralinkBuff *entry = &sBuffs[buff];
    u32 weight = entry->weight * WEIGHT_SCALE;
    u32 i;

    if (!(entry->pools & (1 << pool)) || (entry->rounds != 0 && !(entry->rounds & (1 << (round - 1))))) {
        return 0;
    }
    for (i = 0; i < count; i++) {
        if (excluded[i].kind == ENTRALINK_CARD_BUFF && excluded[i].id == buff) {
            return 0;
        }
    }
    if (!EntralinkBuffs_CanRise(buff)) {
        return 0;
    }
    if (entry->tier == ENTRALINK_BUFF_TIER_GOLD) {
        if (EntralinkBuffs_GetGoldRank(buff) != 0) {
            weight = weight * ENTRALINK_BUFF_RANK_UP_WEIGHT / 100;
        } else if (weights->heldThemes & (1 << entry->theme)) {
            weight = weight * ENTRALINK_BUFF_HELD_THEME_WEIGHT / 100;
        }
    } else if (entry->related & weights->heldThemes) {
        weight = weight * ENTRALINK_BUFF_HELD_THEME_WEIGHT / 100;
    }
    return weight * EntralinkBuffs_GetTeamWeight(entry, weights) / 100;
}

// The total weight of a tier's buffs in a draw
static u32 EntralinkBuffs_GetTierWeight(u32 tier, u32 pool, u32 round, const EntralinkCard *excluded, u32 count,
                                        const DrawWeights *weights) {
    u32 total = 0;
    u32 buff;

    for (buff = 0; buff < ENTRALINK_BUFF_COUNT; buff++) {
        if (sBuffs[buff].tier == tier) {
            total += EntralinkBuffs_GetWeight(buff, pool, round, excluded, count, weights);
        }
    }
    return total;
}

// A buff of a tier at random by the weights, as a card with its type; ENTRALINK_CARD_NONE if none fits
static void EntralinkBuffs_DrawOfTier(GameData *gameData, u32 tier, u32 pool, u32 round, const EntralinkCard *excluded,
                                      u32 count, const DrawWeights *weights, EntralinkCard *card) {
    u32 total = EntralinkBuffs_GetTierWeight(tier, pool, round, excluded, count, weights);
    u32 roll;
    u32 weight;
    u32 buff;

    card->kind = ENTRALINK_CARD_NONE;
    card->id = 0;
    card->type = 0;
    if (total == 0) {
        return;
    }
    roll = GFL_RandomLC(total);
    for (buff = 0; buff < ENTRALINK_BUFF_COUNT; buff++) {
        if (sBuffs[buff].tier != tier) {
            continue;
        }
        weight = EntralinkBuffs_GetWeight(buff, pool, round, excluded, count, weights);
        if (roll < weight) {
            break;
        }
        roll -= weight;
    }
    if (buff == ENTRALINK_BUFF_COUNT) {
        return;
    }
    card->kind = ENTRALINK_CARD_BUFF;
    card->id = buff;
    if (sBuffs[buff].typeCard != ENTRALINK_BUFF_TYPE_CARD_NONE) {
        card->type = EntralinkBuffs_DrawType(buff, EntralinkBuffs_GetTeamTypes(gameData));
    }
}

// EntralinkBuffs_DrawCard with the draw's weights worked out
static void EntralinkBuffs_DrawCardWeighted(GameData *gameData, u32 source, u32 round, const EntralinkCard *excluded,
                                            u32 count, const DrawWeights *drawWeights, EntralinkCard *card) {
    u32 pool = EntralinkBuffs_GetPool(source);
    u32 weights[3];
    u32 total = 0;
    u32 roll;
    u32 tier;

    // A tier's odds count only while it has a buff to draw
    for (tier = 0; tier < 3; tier++) {
        weights[tier] = sOdds[source][tier] * WEIGHT_SCALE;
        if (source == ENTRALINK_BUFF_SOURCE_SHOP && tier == ENTRALINK_BUFF_TIER_GOLD) {
            weights[tier] = weights[tier] * ENTRALINK_BUFF_SHOP_GOLD_WEIGHT / 100;
        }
        if (EntralinkBuffs_GetTierWeight(tier, pool, round, excluded, count, drawWeights) == 0) {
            weights[tier] = 0;
        }
        total += weights[tier];
    }
    if (total == 0) {
        // Every tier with a buff to draw has odds of 0: any that has one
        for (tier = 0; tier < 3; tier++) {
            if (EntralinkBuffs_GetTierWeight(tier, pool, round, excluded, count, drawWeights) != 0) {
                break;
            }
        }
    } else {
        roll = GFL_RandomLC(total);
        for (tier = 0; tier < 3; tier++) {
            if (roll < weights[tier]) {
                break;
            }
            roll -= weights[tier];
        }
    }
    if (tier == 3) {
        card->kind = ENTRALINK_CARD_NONE;
        return;
    }
    EntralinkBuffs_DrawOfTier(gameData, tier, pool, round, excluded, count, drawWeights, card);
}

void EntralinkBuffs_DrawCard(GameData *gameData, u32 source, u32 round, const EntralinkCard *excluded, u32 count,
                             EntralinkCard *card) {
    DrawWeights weights;

    EntralinkBuffs_GetDrawWeights(gameData, &weights);
    EntralinkBuffs_DrawCardWeighted(gameData, source, round, excluded, count, &weights, card);
}

u32 EntralinkBuffs_DrawOffer(GameData *gameData, u32 source, u32 round, EntralinkCard *cards, u32 count) {
    EntralinkCard replaced;
    EntralinkCard gold;
    DrawWeights weights;
    u32 drawn = 0;
    u32 slot;
    u32 i;

    // The team is scanned once an offer (it reads the moves' data)
    EntralinkBuffs_GetDrawWeights(gameData, &weights);
    for (i = 0; i < count; i++) {
        EntralinkBuffs_DrawCardWeighted(gameData, source, round, cards, i, &weights, &cards[i]);
    }
    for (i = 0; i < count; i++) {
        if (cards[i].kind != ENTRALINK_CARD_NONE) {
            drawn++;
        }
    }
    if (source != ENTRALINK_BUFF_SOURCE_BOSS || !ENTRALINK_BUFF_BOSS_GUARANTEED_GOLD || count == 0) {
        return drawn;
    }
    for (i = 0; i < count; i++) {
        if (cards[i].kind == ENTRALINK_CARD_BUFF && sBuffs[cards[i].id].tier == ENTRALINK_BUFF_TIER_GOLD) {
            return drawn;
        }
    }
    // No gold came up: a card at random becomes one (the others still excluded), if a gold fits
    slot = GFL_RandomLC(count);
    replaced = cards[slot];
    cards[slot].kind = ENTRALINK_CARD_NONE;
    EntralinkBuffs_DrawOfTier(gameData, ENTRALINK_BUFF_TIER_GOLD, ENTRALINK_BUFF_POOL_AFTER_BATTLE, round, cards, count,
                              &weights, &gold);
    if (gold.kind == ENTRALINK_CARD_NONE) {
        cards[slot] = replaced;
        return drawn;
    }
    if (replaced.kind == ENTRALINK_CARD_NONE) {
        drawn++;
    }
    cards[slot] = gold;
    return drawn;
}

// The first free gold slot, or ENTRALINK_BUFF_GOLD_SLOTS if every one holds a gold
static u32 EntralinkBuffs_GetFreeSlot(void) {
    u32 slot;

    for (slot = 0; slot < ENTRALINK_BUFF_GOLD_SLOTS; slot++) {
        if (EntralinkBuffs_GetGoldSlot(slot) == ENTRALINK_BUFF_NONE) {
            break;
        }
    }
    return slot;
}

u32 EntralinkBuffs_GetTakeKind(const EntralinkCard *card) {
    if (card->kind == ENTRALINK_CARD_ITEM) {
        return ENTRALINK_TAKE_ITEM;
    }
    if (sBuffs[card->id].tier != ENTRALINK_BUFF_TIER_GOLD) {
        return ENTRALINK_TAKE_STACK;
    }
    if (EntralinkBuffs_GetGoldRank(card->id) != 0) {
        return ENTRALINK_TAKE_RANK_UP;
    }
    return EntralinkBuffs_GetFreeSlot() < ENTRALINK_BUFF_GOLD_SLOTS ? ENTRALINK_TAKE_NEW_GOLD : ENTRALINK_TAKE_REPLACE;
}

static void EntralinkBuffs_TakeCore(const EntralinkCard *card, u32 slot) {
    EntralinkRunState *state = EntralinkRun_GetState();
    u32 buff = card->id;
    u32 typeCard;

    if (card->kind != ENTRALINK_CARD_BUFF || buff >= ENTRALINK_BUFF_COUNT) {
        return;
    }
    switch (EntralinkBuffs_GetTakeKind(card)) {
    case ENTRALINK_TAKE_STACK:
        // A type card's count is all its types'
        typeCard = sBuffs[buff].typeCard;
        if (typeCard != ENTRALINK_BUFF_TYPE_CARD_NONE && card->type < ENTRALINK_BUFF_CARD_TYPES) {
            state->typeCounts[typeCard][card->type]++;
        }
        state->buffLevels[buff]++;
        return;
    case ENTRALINK_TAKE_RANK_UP:
        state->buffLevels[buff]++;
        return;
    case ENTRALINK_TAKE_NEW_GOLD:
        slot = EntralinkBuffs_GetFreeSlot();
        break;
    default:
        if (slot >= ENTRALINK_BUFF_GOLD_SLOTS) {
            return;
        }
        // The gold replaced is gone, its rank with it
        state->buffLevels[state->goldSlots[slot]] = 0;
        break;
    }
    state->goldSlots[slot] = buff;
    state->buffLevels[buff] = 1;
}

static void EntralinkBuffs_SetLevelCore(u32 buff, u32 type, u32 level) {
    EntralinkRunState *state = EntralinkRun_GetState();
    u32 typeCard;
    u32 slot;

    if (buff >= ENTRALINK_BUFF_COUNT) {
        return;
    }
    if (level > sBuffs[buff].maxLevel) {
        level = sBuffs[buff].maxLevel;
    }
    typeCard = sBuffs[buff].typeCard;
    if (sBuffs[buff].tier != ENTRALINK_BUFF_TIER_GOLD) {
        if (typeCard != ENTRALINK_BUFF_TYPE_CARD_NONE && type < ENTRALINK_BUFF_CARD_TYPES) {
            // The card's count is all its types'
            state->buffLevels[buff] -= state->typeCounts[typeCard][type];
            state->typeCounts[typeCard][type] = level;
            state->buffLevels[buff] += level;
        } else if (typeCard == ENTRALINK_BUFF_TYPE_CARD_NONE) {
            state->buffLevels[buff] = level;
        }
        return;
    }
    for (slot = 0; slot < ENTRALINK_BUFF_GOLD_SLOTS; slot++) {
        if (state->goldSlots[slot] == buff) {
            break;
        }
    }
    if (slot == ENTRALINK_BUFF_GOLD_SLOTS) {
        if (level == 0) {
            return;
        }
        slot = EntralinkBuffs_GetFreeSlot();
        if (slot == ENTRALINK_BUFF_GOLD_SLOTS) {
            slot = 0;
            state->buffLevels[state->goldSlots[slot]] = 0;
        }
    }
    state->goldSlots[slot] = level != 0 ? buff : ENTRALINK_BUFF_NONE;
    state->buffLevels[buff] = level;
}

// The HP buff raises the run's copies' max HP: their stats are worked out again after any change (phase 4)
void EntralinkBuffs_Take(const EntralinkCard *card, u32 slot) {
    EntralinkBuffs_TakeCore(card, slot);
    EntralinkRun_RefreshMaxHP();
}

void EntralinkBuffs_SetLevel(u32 buff, u32 type, u32 level) {
    EntralinkBuffs_SetLevelCore(buff, type, level);
    EntralinkRun_RefreshMaxHP();
}

u32 EntralinkBuffs_GetPrice(const EntralinkCard *card) {
    return card->kind == ENTRALINK_CARD_BUFF ? sBuffs[card->id].price : 0;
}

u32 EntralinkBuffs_GetShownRank(const EntralinkCard *card, BOOL taken) {
    u32 rank;

    if (card->kind != ENTRALINK_CARD_BUFF || sBuffs[card->id].tier != ENTRALINK_BUFF_TIER_GOLD) {
        return 1;
    }
    rank = EntralinkBuffs_GetGoldRank(card->id);
    if (!taken) {
        rank++;
    }
    if (rank > sBuffs[card->id].maxLevel) {
        rank = sBuffs[card->id].maxLevel;
    }
    return rank != 0 ? rank : 1;
}

// ---- The cards' text ------------------------------------------------------------------------------------------------

static void BuffText_Init(BuffText *text, FieldScriptEnv *env) {
    text->heapId = FieldScriptEnv_GetHeapID(env);
    text->wordSet = ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env));
    text->msgData = GFL_MsgSysLoadData(FALSE, ARCID_SCRIPT_MESSAGE, SCRIPT_TEXT_ENTRALINK_BUFFS, text->heapId);
    text->title = GFL_StrBufCreate(BUFF_TEXT_LENGTH, text->heapId);
    text->text = GFL_StrBufCreate(BUFF_TEXT_LENGTH, text->heapId);
    text->temp = GFL_StrBufCreate(BUFF_TEXT_LENGTH, text->heapId);
}

static void BuffText_Free(BuffText *text) {
    GFL_StrBufFree(text->temp);
    GFL_StrBufFree(text->text);
    GFL_StrBufFree(text->title);
    GFL_MsgDataFree(text->msgData);
}

// A message of the bank with the script's words in it
static void BuffText_Format(BuffText *text, u32 msgId, StrBuf *dest) {
    GFL_MsgDataLoadStrbuf(text->msgData, msgId, text->temp);
    GFL_WordSetFormatStrbuf(text->wordSet, dest, text->temp);
}

// The message of a buff card at a gold's rank (title or description): a gold has one a rank, and a type card names
// its type
static void BuffText_FormatBuff(BuffText *text, const EntralinkCard *card, u32 first, u32 rank, StrBuf *dest) {
    const EntralinkBuff *entry = &sBuffs[card->id];

    if (entry->typeCard != ENTRALINK_BUFF_TYPE_CARD_NONE) {
        loadTypeTextToStrbuf(text->wordSet, ENTRALINK_BUFF_WORD_TYPE, card->type);
    }
    BuffText_Format(text, entry->tier == ENTRALINK_BUFF_TIER_GOLD ? first + rank - 1 : first, dest);
}

// A card's title (a buff's colored by its tier, with a gold's rank; an item's name) into text's title
static void BuffText_Title(BuffText *text, const EntralinkCard *card, u32 rank) {
    if (card->kind == ENTRALINK_CARD_ITEM) {
        loadItemNameToStrbuf(text->wordSet, ENTRALINK_BUFF_WORD_TITLE, card->id);
        BuffText_Format(text, ENTRALINK_BUFF_MSG_TITLE, text->title);
        return;
    }
    BuffText_FormatBuff(text, card, sBuffs[card->id].title, rank, text->title);
}

// A card's description into text's text
static void BuffText_Description(BuffText *text, const EntralinkCard *card, u32 rank) {
    if (card->kind == ENTRALINK_CARD_ITEM) {
        BuffText_Format(text, ENTRALINK_BUFF_MSG_ITEM, text->text);
        return;
    }
    BuffText_FormatBuff(text, card, sBuffs[card->id].description, rank, text->text);
}

// The title with a number after it (ENTRALINK_BUFF_MSG_PRICE, ENTRALINK_BUFF_MSG_COUNT) into dest
static void BuffText_WithNumber(BuffText *text, u32 msgId, u32 number, StrBuf *dest) {
    GFL_WordSetSetStrbuf(text->wordSet, ENTRALINK_BUFF_WORD_TITLE, text->title, 0, TRUE, 0);
    WordSetNumber(text->wordSet, ENTRALINK_BUFF_WORD_NUMBER, number, NUMBER_DIGITS, NUM_PAD_NONE, TRUE);
    BuffText_Format(text, msgId, dest);
}

// Adds an option to the script's open list menu, with its description, as AddItemToListMenu does with messages
static BOOL BuffText_AddOption(BuffText *text, FieldScriptEnv *env, StrBuf *label, StrBuf *description, u32 value) {
    ScriptListMenu *menu = &env->subwork->listMenu;
    u32 index = ListMenuCore_GetFirstFreeIndex(menu->options);

    if (index >= LIST_OPTIONS_MAX - 1) {
        // The last is kept for the script's own option (Skip, Cancel, Close)
        return FALSE;
    }
    menu->descriptions[index] = GFL_StrBufClone(description, text->heapId);
    AppendListMenuOption(menu->options, label, value, text->heapId);
    return TRUE;
}

void EntralinkBuffs_SetTitleWord(FieldScriptEnv *env, u32 word, const EntralinkCard *card, u32 rank) {
    BuffText text;

    BuffText_Init(&text, env);
    BuffText_Title(&text, card, rank);
    GFL_WordSetSetStrbuf(text.wordSet, word, text.title, 0, TRUE, 0);
    BuffText_Free(&text);
}

u32 EntralinkBuffs_AddCardOptions(FieldScriptEnv *env, const EntralinkCard *cards, u32 count, BOOL prices) {
    BuffText text;
    u32 added = 0;
    u32 rank;
    u32 i;

    BuffText_Init(&text, env);
    for (i = 0; i < count; i++) {
        if (cards[i].kind == ENTRALINK_CARD_NONE) {
            continue;
        }
        rank = EntralinkBuffs_GetShownRank(&cards[i], FALSE);
        BuffText_Title(&text, &cards[i], rank);
        BuffText_Description(&text, &cards[i], rank);
        if (prices) {
            BuffText_WithNumber(&text, ENTRALINK_BUFF_MSG_PRICE, EntralinkBuffs_GetPrice(&cards[i]), text.title);
        }
        if (BuffText_AddOption(&text, env, text.title, text.text, i)) {
            added++;
        }
    }
    BuffText_Free(&text);
    return added;
}

// Adds a blue's or purple's stacks to the open list menu: its count, or a type card's one for each type it has
static u32 EntralinkBuffs_AddStackOptions(BuffText *text, FieldScriptEnv *env, u32 buff, u32 value) {
    StrBuf *label = GFL_StrBufCreate(BUFF_TEXT_LENGTH, text->heapId);
    EntralinkCard card;
    u32 added = 0;
    u32 count;

    card.kind = ENTRALINK_CARD_BUFF;
    card.id = buff;
    for (card.type = 0; card.type < ENTRALINK_BUFF_CARD_TYPES; card.type++) {
        if (sBuffs[buff].typeCard == ENTRALINK_BUFF_TYPE_CARD_NONE) {
            count = EntralinkBuffs_GetLevel(buff);
        } else {
            count = EntralinkBuffs_GetTypeCount(buff, card.type);
        }
        if (count != 0) {
            BuffText_Title(text, &card, 1);
            BuffText_Description(text, &card, 1);
            BuffText_WithNumber(text, ENTRALINK_BUFF_MSG_COUNT, count, label);
            if (BuffText_AddOption(text, env, label, text->text, value + added)) {
                added++;
            }
        }
        if (sBuffs[buff].typeCard == ENTRALINK_BUFF_TYPE_CARD_NONE) {
            break;
        }
    }
    GFL_StrBufFree(label);
    return added;
}

u32 EntralinkBuffs_AddHeldOptions(FieldScriptEnv *env, BOOL golds) {
    BuffText text;
    EntralinkCard card;
    u32 added = 0;
    u32 slot;
    u32 buff;

    BuffText_Init(&text, env);
    card.kind = ENTRALINK_CARD_BUFF;
    card.type = 0;
    for (slot = 0; slot < ENTRALINK_BUFF_GOLD_SLOTS; slot++) {
        card.id = EntralinkBuffs_GetGoldSlot(slot);
        if (card.id == ENTRALINK_BUFF_NONE) {
            continue;
        }
        BuffText_Title(&text, &card, EntralinkBuffs_GetShownRank(&card, TRUE));
        BuffText_Description(&text, &card, EntralinkBuffs_GetShownRank(&card, TRUE));
        if (BuffText_AddOption(&text, env, text.title, text.text, golds ? slot : added)) {
            added++;
        }
    }
    if (!golds) {
        for (buff = 0; buff < ENTRALINK_BUFF_COUNT; buff++) {
            if (sBuffs[buff].tier != ENTRALINK_BUFF_TIER_GOLD && EntralinkBuffs_GetLevel(buff) != 0) {
                added += EntralinkBuffs_AddStackOptions(&text, env, buff, added);
            }
        }
    }
    BuffText_Free(&text);
    return added;
}
