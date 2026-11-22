#include "types.h"
#include "field/field_script.h"
#include "paperwhite2/entralink_buffs.h"
#include "paperwhite2/entralink_hub_shop.h"
#include "paperwhite2/entralink_progress.h"
#include "paperwhite2/entralink_run.h"
#include "paperwhite2/entralink_run_actions.h"
#include "paperwhite2/entralink_run_config.h"
#include "paperwhite2/entralink_run_state.h"
#include "system/game_data.h"
#include "system/str_tool.h"
#include "system/wordset.h"

// Paper White 2: the Entralink hub's shop and Dream Shards, in overlay 12 beside the run. See
// include/paperwhite2/entralink_hub_shop.h and docs/paperwhite2/design/entralink-buffs.md, section 19

// The digits of a number in a message
#define NUMBER_DIGITS 5
// The most lines of the shop's list (a script's list menu holds 32, one kept for Close)
#define SHOP_LINES_MAX 31
// The words of a card's title and its price (the scripts' messages)
#define WORD_TITLE 1
#define WORD_PRICE 2

static EntralinkProgress *EntralinkHubShop_GetProgress(GameData *gameData) {
    return EntralinkProgress_Get(GameData_GetSaveControl(gameData));
}

u32 EntralinkHubShop_GetRunShards(void) {
    EntralinkRunState *state = EntralinkRun_GetState();
    u32 rooms;

    if (state->room == 0) {
        return 0;
    }
    // The rooms left behind were done (their exits open only then), and the one the player is in if it is; not the
    // places a skipped round 1 passed
    rooms = state->room - 1 - state->placesSkipped + (state->cleared ? 1 : 0);
    return rooms * ENTRALINK_RUN_ROOM_SHARDS + state->shardBonus;
}

u32 EntralinkHubShop_AddShards(GameData *gameData, u32 shards) {
    EntralinkProgress *progress = EntralinkHubShop_GetProgress(gameData);

    if (progress->shards + shards > ENTRALINK_SHARDS_MAX) {
        shards = ENTRALINK_SHARDS_MAX - progress->shards;
    }
    progress->shards += shards;
    return shards;
}

// Whether the shop sells a card: a blue or purple, not a type card (a pick of it would need its type)
static BOOL EntralinkHubShop_Sells(u32 buff) {
    const EntralinkBuff *entry = EntralinkBuffs_GetEntry(buff);

    return entry->tier != ENTRALINK_BUFF_TIER_GOLD && entry->typeCard == ENTRALINK_BUFF_TYPE_CARD_NONE;
}

// The saved picks of a card, or NULL if none of it was bought
static EntralinkShopPick *EntralinkHubShop_FindPick(EntralinkProgress *progress, u32 buff) {
    u32 key = EntralinkBuffs_GetEntry(buff)->key;
    u32 i;

    for (i = 0; i < ENTRALINK_SHOP_PICKS_MAX; i++) {
        if (progress->shopPicks[i].count != 0 && progress->shopPicks[i].key == key) {
            return &progress->shopPicks[i];
        }
    }
    return NULL;
}

static u32 EntralinkHubShop_GetBought(EntralinkProgress *progress, u32 buff) {
    EntralinkShopPick *pick = EntralinkHubShop_FindPick(progress, buff);

    return pick != NULL ? pick->count : 0;
}

// The picks bought in all, a gone card's among them
u32 EntralinkHubShop_CountBought(EntralinkProgress *progress) {
    u32 count = 0;
    u32 i;

    for (i = 0; i < ENTRALINK_SHOP_PICKS_MAX; i++) {
        count += progress->shopPicks[i].count;
    }
    return count;
}

// A card's price for the pick after the bought ones: the prices list's, then its last plus the step a pick
static u32 EntralinkHubShop_GetPrice(u32 bought) {
    static const u16 PRICES[ENTRALINK_RUN_SHOP_PRICE_COUNT] = ENTRALINK_RUN_SHOP_PRICES;

    if (bought < ENTRALINK_RUN_SHOP_PRICE_COUNT) {
        return PRICES[bought];
    }
    return PRICES[ENTRALINK_RUN_SHOP_PRICE_COUNT - 1] +
           (bought - ENTRALINK_RUN_SHOP_PRICE_COUNT + 1) * ENTRALINK_RUN_SHOP_PRICE_STEP;
}

static u16 EntralinkHubShop_Check(EntralinkProgress *progress, u32 buff) {
    u32 bought;

    if (buff >= ENTRALINK_BUFF_COUNT || !EntralinkHubShop_Sells(buff)) {
        return ENTRALINK_SHOP_CARD_MAX;
    }
    bought = EntralinkHubShop_GetBought(progress, buff);
    if (bought >= EntralinkBuffs_GetEntry(buff)->maxLevel) {
        return ENTRALINK_SHOP_CARD_MAX;
    }
    if (EntralinkHubShop_CountBought(progress) >= ENTRALINK_RUN_SHOP_TOTAL_CAP) {
        return ENTRALINK_SHOP_SOLD_OUT;
    }
    if (progress->shards < EntralinkHubShop_GetPrice(bought)) {
        return ENTRALINK_SHOP_NO_SHARDS;
    }
    return ENTRALINK_SHOP_OK;
}

static BOOL EntralinkHubShop_Buy(EntralinkProgress *progress, u32 buff) {
    EntralinkShopPick *pick;
    u32 price;
    u32 i;

    if (EntralinkHubShop_Check(progress, buff) != ENTRALINK_SHOP_OK) {
        return FALSE;
    }
    pick = EntralinkHubShop_FindPick(progress, buff);
    for (i = 0; pick == NULL && i < ENTRALINK_SHOP_PICKS_MAX; i++) {
        if (progress->shopPicks[i].count == 0) {
            pick = &progress->shopPicks[i];
            pick->key = EntralinkBuffs_GetEntry(buff)->key;
        }
    }
    if (pick == NULL) {
        return FALSE;
    }
    price = EntralinkHubShop_GetPrice(pick->count);
    progress->shards -= price;
    progress->shardsSpent += price;
    pick->count++;
    return TRUE;
}

static void EntralinkHubShop_Reset(EntralinkProgress *progress) {
    u32 i;

    progress->shards += progress->shardsSpent;
    if (progress->shards > ENTRALINK_SHARDS_MAX) {
        progress->shards = ENTRALINK_SHARDS_MAX;
    }
    progress->shardsSpent = 0;
    for (i = 0; i < ENTRALINK_SHOP_PICKS_MAX; i++) {
        progress->shopPicks[i].key = 0;
        progress->shopPicks[i].count = 0;
    }
}

void EntralinkHubShop_HoldBought(GameData *gameData) {
    EntralinkProgress *progress = EntralinkHubShop_GetProgress(gameData);
    u32 buff;

    for (buff = 0; buff < ENTRALINK_BUFF_COUNT; buff++) {
        if (EntralinkHubShop_Sells(buff)) {
            // (held to the card's highest level, should the catalogue have lowered it)
            EntralinkBuffs_SetLevel(buff, 0, EntralinkHubShop_GetBought(progress, buff));
        }
    }
}

// The shop's list: the blues, then the purples, in the catalogue's order
static u32 EntralinkHubShop_AddCards(FieldScriptEnv *env, EntralinkProgress *progress) {
    EntralinkShopLine lines[SHOP_LINES_MAX];
    u32 count = 0;
    u32 tier;
    u32 buff;
    u32 bought;

    for (tier = ENTRALINK_BUFF_TIER_BLUE; tier <= ENTRALINK_BUFF_TIER_PURPLE; tier++) {
        for (buff = 0; buff < ENTRALINK_BUFF_COUNT && count < SHOP_LINES_MAX; buff++) {
            if (EntralinkBuffs_GetEntry(buff)->tier != tier || !EntralinkHubShop_Sells(buff)) {
                continue;
            }
            bought = EntralinkHubShop_GetBought(progress, buff);
            lines[count].buff = buff;
            lines[count].bought = bought;
            lines[count].price = bought >= EntralinkBuffs_GetEntry(buff)->maxLevel ? ENTRALINK_SHOP_LINE_MAX
                                                                                   : EntralinkHubShop_GetPrice(bought);
            count++;
        }
    }
    return EntralinkBuffs_AddShopLines(env, lines, count);
}

void EntralinkHubShop_Action(FieldScriptEnv *env, u16 action, u16 arg, u16 arg2, u16 *result) {
    GameData *gameData = FieldScriptEnv_GetGameData(env);
    WordSet *wordSet = ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env));
    EntralinkProgress *progress = EntralinkHubShop_GetProgress(gameData);
    EntralinkCard card;
    u32 number;

    switch (action) {
    case ENTRALINK_RUN_ACTION_SHARDS:
        switch (arg) {
        case 0:
            EntralinkRun_EndHere(gameData);
            number = EntralinkRun_GetState()->shardsGained;
            break;
        case 1:
            number = progress->shards;
            break;
        case 2:
            number = EntralinkHubShop_CountBought(progress);
            break;
        case 3:
            number = ENTRALINK_RUN_SHOP_TOTAL_CAP;
            break;
        default:
            number = progress->shardsSpent;
            break;
        }
        *result = number;
        WordSetNumber(wordSet, arg2, number, NUMBER_DIGITS, NUM_PAD_NONE, TRUE);
        break;
    case ENTRALINK_RUN_ACTION_SHOP_ADD_CARDS:
        *result = EntralinkHubShop_AddCards(env, progress);
        break;
    case ENTRALINK_RUN_ACTION_SHOP_PICK:
        *result = EntralinkHubShop_Check(progress, arg);
        if (arg < ENTRALINK_BUFF_COUNT) {
            card.kind = ENTRALINK_CARD_BUFF;
            card.id = arg;
            card.type = 0;
            EntralinkBuffs_SetTitleWord(env, WORD_TITLE, &card, 1);
            WordSetNumber(wordSet, WORD_PRICE, EntralinkHubShop_GetPrice(EntralinkHubShop_GetBought(progress, arg)),
                          NUMBER_DIGITS, NUM_PAD_NONE, TRUE);
        }
        break;
    case ENTRALINK_RUN_ACTION_SHOP_BUY:
        *result = EntralinkHubShop_Buy(progress, arg);
        break;
    case ENTRALINK_RUN_ACTION_SHOP_RESET:
        EntralinkHubShop_Reset(progress);
        break;
    }
}
