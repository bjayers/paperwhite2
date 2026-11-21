#ifndef PAPERWHITE2_ENTRALINK_BUFFS_H
#define PAPERWHITE2_ENTRALINK_BUFFS_H

#include "types.h"
#include "paperwhite2/entralink_buffs_config.h"
#include "struct_decls.h"

// Paper White 2: the Entralink roguelike's buffs (docs/paperwhite2/design/entralink-buffs.md, phase 2). The run holds
// the player's buffs in its state (EntralinkRunState, paperwhite2/entralink_run_state.h), RAM only like the rest of
// the run, empty at its start and cleared at its end: a count for each blue and purple card (and for a type card a
// count for each type), and the golds in their slots, each with its rank. The read functions here are in ARM9 main
// (src/paperwhite2/main/paperwhite2_entralink_buffs.c) for the battle's effects (phase 3); the offers, the chooser and
// the shops' buffs are overlay 12's (src/paperwhite2/ov012/paperwhite2_entralink_buff_offers.c), and the catalogue
// is res/paperwhite2/entralink/buffs.json, which tools/paperwhite2/entralink_buffs.py writes the config header from

// No gold in a slot, no theme (a blue or purple), not a type card
#define ENTRALINK_BUFF_NONE 0xff
#define ENTRALINK_BUFF_THEME_NONE 0xff
#define ENTRALINK_BUFF_TYPE_CARD_NONE 0xff

// What a card of an offer is: nothing (no card fitted), a buff, or an item (a gift NPC's cards)
#define ENTRALINK_CARD_NONE 0
#define ENTRALINK_CARD_BUFF 1
#define ENTRALINK_CARD_ITEM 2

// A card of an offer: a buff (ENTRALINK_BUFF_*) with a type card's type, or an item
typedef struct {
    u16 id;
    // ENTRALINK_CARD_*
    u8 kind;
    // A type card's TYPE_*, else 0
    u8 type;
} EntralinkCard;

// A card of the catalogue (ENTRALINK_BUFF_TABLE)
typedef struct {
    // Its first title and first description in the text bank SCRIPT_TEXT_ENTRALINK_BUFFS: a gold has one of each a
    // rank
    u16 title;
    u16 description;
    // Its price in a shop, in Dream Dust
    u16 price;
    // Its key in the save, a hash of its ID (the hub shop's bought picks, paperwhite2/entralink_hub_shop.h), which
    // keeps the picks with their card whatever the catalogue's order
    u16 key;
    // A purple's related gold themes, a bit each
    u32 related;
    // ENTRALINK_BUFF_TIER_*
    u8 tier;
    // A gold's theme, or ENTRALINK_BUFF_THEME_NONE
    u8 theme;
    // A gold's ranks, or the picks of a blue or purple that reach its cap: its highest level in a run
    u8 maxLevel;
    // A bit for each pool (ENTRALINK_BUFF_POOL_*) and for each round it is offered in (round 1 the lowest; 0 for any)
    u8 pools;
    u8 rounds;
    // Its weight in the draw among its tier's cards
    u8 weight;
    // Its place among the type cards, or ENTRALINK_BUFF_TYPE_CARD_NONE
    u8 typeCard;
} EntralinkBuff;

// A card that raises a stat on every hit (ENTRALINK_BUFF_STAT_CARDS, ARM9 main, rebalance 2): the card, its stat
// (ENTRALINK_BUFF_STAT_*) and its bucket (ENTRALINK_BUFF_BUCKET_*, or ENTRALINK_BUFF_NONE)
typedef struct {
    u8 buff;
    u8 stat;
    u8 bucket;
} EntralinkBuffStatCard;

// A card that adds to a damage bucket (ENTRALINK_BUFF_BUCKET_CARDS, overlay 12, fixes 9), for the viewer's
// multipliers: the card, its bucket (ENTRALINK_BUFF_BUCKET_*) and whether its value holds on every hit of the bucket
typedef struct {
    u8 buff;
    u8 bucket;
    u8 plain;
} EntralinkBuffBucketCard;

// A card's numbers (ENTRALINK_BUFF_VALUES, ARM9 main): a blue's or purple's step, soft limit (0 for none) and cap; a
// gold's value at each rank (its last repeated); whether it is a gold, and its effect's kind (ENTRALINK_BUFF_KIND_*).
// The rows past ENTRALINK_BUFF_COUNT are the cards' further effects (more_effects, ENTRALINK_BUFF_EXTRA_CARDS)
typedef struct {
    s16 values[3];
    u8 gold;
    u8 kind;
} EntralinkBuffValue;

// A card's effect in battle (ENTRALINK_BUFF_EFFECTS, overlay 167's
// src/paperwhite2/ov167/paperwhite2_entralink_battle.c, phase 3): its kind and the bucket it adds to, the condition
// under which it applies, and its kind's parameters
typedef struct {
    // The tests (ENTRALINK_BUFF_COND_*) that must all hold, and those of which one must hold (0 for none)
    u32 condition;
    u32 anyCondition;
    // An ability_like card's ability
    u16 ability;
    // ENTRALINK_BUFF_KIND_*, ENTRALINK_BUFF_BUCKET_* or ENTRALINK_BUFF_NONE
    u8 kind;
    u8 bucket;
    // The tests' values: the defender's and attacker's statuses (bits of ENTRALINK_BUFF_STATUS_*), the move's type
    // (TYPE_NULL for none), its category (ENTRALINK_BUFF_MOVE_CATEGORY_*), the attacker's HP below this percent, the
    // move's power at most this, the weathers (bits of ENTRALINK_BUFF_WEATHER_*)
    u8 defenderStatus;
    u8 attackerStatus;
    u8 moveType;
    u8 category;
    u8 hpBelow;
    u8 powerAtMost;
    u8 weathers;
    // ENTRALINK_BUFF_SCALE_*, or 0
    u8 scale;
    // The kind's parameter: a stat, a residual source, a status given, a roll, a weather mode, a duration's target, a
    // custom handler (ENTRALINK_BUFF_HANDLER_*)
    u8 param;
    // ENTRALINK_BUFF_FLAG_* bits
    u8 flags;
    // The rank from which its extra holds (halves recoil, ignores the immunity, spreads), or 0
    u8 rankParam;
    // A duration's statuses, or the statuses the team becomes immune to (bits of ENTRALINK_BUFF_STATUS_*)
    u8 statuses;
    // The stats each rank raises on entry (bits of ENTRALINK_BUFF_STAT_*)
    u8 stats[3];
    // The percent of max HP an attack costs
    u8 hpCost;
    // The condense: the first_turns test's count (the attacker's first this many moves in the battle)
    u8 firstTurns;
} EntralinkBuffEffect;

// ---- ARM9 main: what the run holds ----------------------------------------------------------------------------------

// Empties the run's buffs: no card held, every gold slot free (a run's start and end)
void EntralinkBuffs_Clear(void);
// A buff's place among the type cards, or ENTRALINK_BUFF_TYPE_CARD_NONE
u32 EntralinkBuffs_GetTypeCard(u32 buff);
// A buff's level in the run: a blue's or purple's count (a type card's, of all its types), a gold's rank, 0 if it
// isn't held
u32 EntralinkBuffs_GetLevel(u32 buff);
// A blue's or purple's count; 0 for a gold
u32 EntralinkBuffs_GetCount(u32 buff);
// A type card's count for a type
u32 EntralinkBuffs_GetTypeCount(u32 buff, u32 type);
// A gold's rank, 1 to 3, or 0 if it isn't held
u32 EntralinkBuffs_GetGoldRank(u32 buff);
// The gold in a slot (0 to ENTRALINK_BUFF_GOLD_SLOTS - 1), or ENTRALINK_BUFF_NONE
u32 EntralinkBuffs_GetGoldSlot(u32 slot);
// The buffs held, at most max of them: the golds in their slots' order, then the blues and purples by ID; returns
// how many
u32 EntralinkBuffs_ListHeld(u8 *buffs, u32 max);
// What a buff gives at a level, in its kind's unit: a gold's rank's value, or a blue's or purple's picks (a full step
// each up to the soft limit, half a step past it, at most the cap); 0 at level 0. buff may be an effect row past
// ENTRALINK_BUFF_COUNT (a card's further effect), at its card's level
s32 EntralinkBuffs_GetValue(u32 buff, u32 level);
// A buff's effect's kind, ENTRALINK_BUFF_KIND_*
u32 EntralinkBuffs_GetKind(u32 buff);
// The weather Forecast starts battles in (BTL_WEATHER_*), or BTL_WEATHER_NONE if none was chosen (phase 4)
u32 EntralinkBuffs_GetForecastWeather(void);
// Whether a card that chooses the weather (ENTRALINK_BUFF_WEATHER_CHOICE, Forecast) is held with no weather chosen
BOOL EntralinkBuffs_NeedsWeather(void);
// Rebalance 2: a stat of the run's copies as its battles raise it on every hit (the summary shows it): stat, one of
// ENTRALINK_BUFF_STAT_ATTACK to _SPEED, times the cards of ENTRALINK_BUFF_STAT_CARDS held (Offense, Bulwark, Speed),
// the ones in a bucket added and held to its cap as the battle does, the others each multiplying; the stat as it is
// outside a run
u32 EntralinkBuffs_GetBuffedStat(u32 stat, u32 value);

// ---- Overlay 12: the offers -----------------------------------------------------------------------------------------

// What taking a card does (EntralinkBuffs_GetTakeKind): adds a blue's or purple's stack, ranks up a gold held, puts a
// new gold in a free slot, or needs a gold slot freed (all are full); an item goes into the run's bag
#define ENTRALINK_TAKE_STACK 0
#define ENTRALINK_TAKE_RANK_UP 1
#define ENTRALINK_TAKE_NEW_GOLD 2
#define ENTRALINK_TAKE_REPLACE 3
#define ENTRALINK_TAKE_ITEM 4

// Draws a card of an offer from a source (ENTRALINK_BUFF_SOURCE_*) in a round (from 1): its tier by the source's odds
// (a shop's gold odds times shop_gold_weight), then a buff of the tier by weight among those of the source's pool and
// the round below their highest level, none of the excluded cards. A gold held is weighted by rank_up_weight while it
// can rank up, the golds and related purples of a theme held by held_theme_weight, and a type card's type toward the
// team's types by type_card_team_weight. A tier with nothing to draw falls back to the others; the card is
// ENTRALINK_CARD_NONE if nothing fits
void EntralinkBuffs_DrawCard(GameData *gameData, u32 source, u32 round, const EntralinkCard *excluded, u32 count,
                             EntralinkCard *card);
// Draws count cards, each another: a boss's offer has a gold card if any gold fits (boss_guaranteed_gold). Returns
// how many cards it drew
u32 EntralinkBuffs_DrawOffer(GameData *gameData, u32 source, u32 round, EntralinkCard *cards, u32 count);
// What taking a card does, ENTRALINK_TAKE_*
u32 EntralinkBuffs_GetTakeKind(const EntralinkCard *card);
// Takes a buff card: a blue or purple stack more, a gold held a rank up, a new gold in a free slot or, with every
// slot full, in place of the gold in a slot (ENTRALINK_TAKE_REPLACE's)
void EntralinkBuffs_Take(const EntralinkCard *card, u32 slot);
// Sets a buff to a level (debug): a blue's or purple's count (a type card's for a type), a gold's rank in its slot,
// a free one or else the first; 0 takes it away
void EntralinkBuffs_SetLevel(u32 buff, u32 type, u32 level);
// A card's price in a shop, in Dream Dust
u32 EntralinkBuffs_GetPrice(const EntralinkCard *card);
// The gold rank a card shows: the rank taking it gives (taken: the rank held), 1 for a blue, purple or item
u32 EntralinkBuffs_GetShownRank(const EntralinkCard *card, BOOL taken);
// Puts a card's title, colored by its tier, in a word of the script's word set, at a rank (as GetShownRank gives)
void EntralinkBuffs_SetTitleWord(FieldScriptEnv *env, u32 word, const EntralinkCard *card, u32 rank);
// Adds the cards to the script's open list menu (ListMenuAnchorTopLeft and the like), each its title at the rank
// taking it gives, with its price for a shop's, and its description in the system window as the cursor is on it; the
// value of each is its index, and an ENTRALINK_CARD_NONE card is left out. Returns how many it added
u32 EntralinkBuffs_AddCardOptions(FieldScriptEnv *env, const EntralinkCard *cards, u32 count, BOOL prices);
// A card of the catalogue (the hub shop's)
const EntralinkBuff *EntralinkBuffs_GetEntry(u32 buff);
// A line of the hub shop's list: a card, the picks of it bought, and the next one's price (ENTRALINK_SHOP_LINE_MAX
// when the card is at its highest level)
typedef struct {
    u16 price;
    u8 buff;
    u8 bought;
} EntralinkShopLine;
#define ENTRALINK_SHOP_LINE_MAX 0xffff
// Adds the hub shop's lines to the open list menu, each its card's title with its picks bought and the next one's
// price, its description in the system window as the cursor is on it, valued by its card. Returns how many it added
u32 EntralinkBuffs_AddShopLines(FieldScriptEnv *env, const EntralinkShopLine *lines, u32 count);
// Adds the buffs held to the open list menu: the golds with their ranks (golds: only them, valued by slot, for the
// choice of the one a new gold replaces), then the blues and purples with their counts. Returns how many it added
u32 EntralinkBuffs_AddHeldOptions(FieldScriptEnv *env, BOOL golds);

#endif // PAPERWHITE2_ENTRALINK_BUFFS_H
