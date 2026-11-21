#ifndef PAPERWHITE2_ENTRALINK_RUN_STATE_H
#define PAPERWHITE2_ENTRALINK_RUN_STATE_H

#include "types.h"
#include "paperwhite2/entralink_buffs.h"
#include "paperwhite2/entralink_progress.h"
#include "struct_decls.h"

// Paper White 2: the Entralink run's state and its bag (paperwhite2/entralink_run.h), in ARM9 main
// (src/paperwhite2/main/paperwhite2_entralink_run_state.c), which no map change, battle or menu frees, and which the
// battle, the battle's return, the bag and the zone's weather reach. A run can't be saved mid-way, so the state is RAM
// only: loading a save or resetting finds no run.
//
// The run's bag: while a run is on, the game's bag (GameData_GetBag) is a bag of the run's own, empty at the start and
// emptied at the end, holding at most ENTRALINK_RUN_BAG_* items in the Items, Medicine and Berries pockets, one in the
// Key Items pocket (the Dowsing MCHN, step 7, which the bag shows that pocket for) and nothing in the others.
// Everything that reads the bag (the bag screen, the party screen's Give and Take, the battle's bag, item NPCs, the
// shops) sees it with no other hook, and the real bag stays untouched in the save's block, which any save writes

// The most rooms a run has, the pre-boss rests and the final's included
#define ENTRALINK_RUN_ROOMS_MAX 32
// The most enemies of a battle
#define ENTRALINK_RUN_ENEMIES_MAX 3
// A room's forward doors (ENTRALINK_DOOR_COUNT), and no room behind one
#define ENTRALINK_RUN_DOORS 3
#define ENTRALINK_RUN_ROOM_NONE 0xff
// A room's field weather when it keeps the zone's own
#define ENTRALINK_FIELD_WEATHER_ZONE 0xff
// No catchable enemy
#define ENTRALINK_CATCH_NONE 0xffff
// A room's NPCs (their actors' IDs), and the actor ID of its ball on the ground, after them
#define ENTRALINK_RUN_NPCS_MAX 16
#define ENTRALINK_RUN_GROUND_ITEM_NPC 16
// A gift NPC's choice of items
#define ENTRALINK_RUN_GIFT_ITEMS 3
// The most goods a shop has (run.json's shop_items, 5 by default), and the most buffs beside them (buffs.json's
// shop_buffs, 2 by default)
#define ENTRALINK_RUN_SHOP_MAX 8
#define ENTRALINK_RUN_SHOP_BUFFS_MAX 4

// The enemies' stats the run scales (phase 5), the order of run.json's enemy_scaling and of the state's enemyScale
#define ENTRALINK_STAT_HP 0
#define ENTRALINK_STAT_ATTACK 1
#define ENTRALINK_STAT_DEFENSE 2
#define ENTRALINK_STAT_SP_ATTACK 3
#define ENTRALINK_STAT_SP_DEFENSE 4
#define ENTRALINK_STAT_SPEED 5
#define ENTRALINK_STAT_COUNT 6

// The run bag's slots in each pocket it has
#define ENTRALINK_RUN_BAG_ITEMS 32
#define ENTRALINK_RUN_BAG_MEDICINE 16
#define ENTRALINK_RUN_BAG_BERRIES 16
#define ENTRALINK_RUN_BAG_KEY_ITEMS 1

typedef struct {
    // The room the player is in, from 1, or 0 outside a run
    u8 room;
    // How many rooms the run has: its rounds' rooms and bosses, and the final room
    u8 roomCount;
    // The rooms played so far in turn, the one the player is in last, by their place in rooms/
    u8 order[ENTRALINK_RUN_ROOMS_MAX];
    // The rooms behind the room's forward doors (ENTRALINK_DOOR_*), drawn as the player entered it, or
    // ENTRALINK_RUN_ROOM_NONE; and a bit for each door that shows the unknown marker whatever is behind it
    u8 doorRooms[ENTRALINK_RUN_DOORS];
    u8 doorUnknown;
    // TRUE once the room is done and its exits are open: its battle won, its NPCs used (talked to, an item taken) in a
    // room with no battle, or nothing came up in it
    u8 cleared;
    // The room's field weather, a WEATHER_* (system/zone_weather.h), or ENTRALINK_FIELD_WEATHER_ZONE
    u8 fieldWeather;
    // The NPC the player last talked to, by its place in the room, which is its actor's ID
    u8 talkedNpc;
    // A bit for each of the room's NPCs that came up as the player entered (its requirements and chance)
    u16 npcsSpawned;
    // A bit for each that has gone since: an item NPC that gave its item, the other battles' NPCs after a win
    u16 npcsGone;
    // A bit for each rest, buff or shop NPC talked to, and choice NPC used
    u16 npcsUsed;
    // Whether the room's choice is made (a choice NPC used: ENTRALINK_NPC_HEAL to ENTRALINK_NPC_BUFF_CHOICE but the
    // shop)
    u8 choiceMade;
    // The tiles of the room's ball on the ground and of its hidden item
    u8 groundX;
    u8 groundZ;
    u8 hiddenX;
    u8 hiddenZ;
    // The items of the room's ball on the ground and its hidden one, drawn as the player entered it, or ITEM_NONE
    // (none, or taken)
    u16 groundItem;
    u16 hiddenItem;
    // The items of the room's item room balls (ENTRALINK_NPC_ITEM_CHOICE), by NPC, and of its gift NPC's choice
    u16 npcItems[ENTRALINK_RUN_NPCS_MAX];
    u16 giftItems[ENTRALINK_RUN_GIFT_ITEMS];
    // The battle being fought: its catchable enemies' PIDs and catch progress ids (ENTRALINK_CATCH_NONE for none)
    u32 catchPids[ENTRALINK_RUN_ENEMIES_MAX];
    u16 catchIds[ENTRALINK_RUN_ENEMIES_MAX];
    // The PID of the enemy the battle caught, and whether it caught one
    u32 caughtPid;
    BOOL caught;
    // The run's Dream Dust (step 7), none at its start and lost at its end, and what the last battle won gave
    u16 dust;
    u16 dustGained;
    // The hub shop's Dream Shards (paperwhite2/entralink_hub_shop.h): the run's bosses and final room beaten give
    // these on top of its rooms done; and what the run's end gave, which the end leaves in a cleared state
    u16 shardBonus;
    u16 shardsGained;
    // The room's shop's goods and their prices in Dream Dust, drawn as the player entered it (run.json's shop_items
    // of the item table's shop pool), and how many. Its buffs are shopBuffs, below
    u16 shopItems[ENTRALINK_RUN_SHOP_MAX];
    u16 shopPrices[ENTRALINK_RUN_SHOP_MAX];
    u8 shopCount;
    // The buffs (paperwhite2/entralink_buffs.h, phase 2), none at the run's start and gone at its end like the rest:
    // each card's level (a blue's or purple's count, a gold's rank, 0 if not held), the golds in their slots
    // (ENTRALINK_BUFF_NONE for a free one), and each type card's count for each type
    u8 buffLevels[ENTRALINK_BUFF_COUNT];
    u8 goldSlots[ENTRALINK_BUFF_GOLD_SLOTS];
    u8 typeCounts[ENTRALINK_BUFF_TYPE_CARD_SLOTS][ENTRALINK_BUFF_CARD_TYPES];
    // The weather Forecast starts the battles in, a BTL_WEATHER_* chosen when the card is taken (phase 4), or
    // BTL_WEATHER_NONE before the choice
    u8 forecastWeather;
    // The cards on offer: after the battle won, the room's buff ball's (drawn as the room is entered), the gift NPC's
    // buffs (a gift card is its giftItems item, or else its buff here) and the shop's buffs, a bought one gone
    EntralinkCard offer[ENTRALINK_BUFF_OFFERS];
    EntralinkCard roomOffer[ENTRALINK_BUFF_OFFERS];
    EntralinkCard giftBuffs[ENTRALINK_RUN_GIFT_ITEMS];
    EntralinkCard shopBuffs[ENTRALINK_RUN_SHOP_BUFFS_MAX];
    // The card picked from a list (ENTRALINK_RUN_CARDS_*), which the script takes once the player has confirmed it
    // and, with every gold slot full, chosen the gold it replaces
    EntralinkCard picked;
    u8 pickedList;
    u8 pickedIndex;
    // Phase 5: the battle being fought's enemies' stat multipliers in percent, by their place in its party and
    // ENTRALINK_STAT_* (the room's depth's times the enemy's own scale), which the battle applies at its start
    u16 enemyScale[ENTRALINK_RUN_ENEMIES_MAX][ENTRALINK_STAT_COUNT];
    // The records (paperwhite2/entralink_records.h), which the run's end saves: the turns of the run's battles won,
    // the last battle's turns (which the battle sets as it ends), the run's biggest hit (the battle's damage numbers)
    // and whether the final room was beaten
    u16 turns;
    u16 battleTurns;
    EntralinkRecordHit bestHit;
    u8 won;
} EntralinkRunState;

// The run's state, which overlay 12's run code keeps
EntralinkRunState *EntralinkRun_GetState(void);
// The field weather of a run's room in a forest zone, or WEATHER_NONE (GetWeatherAll)
u32 EntralinkRun_GetFieldWeather(u32 zoneId);
// The battle's catches: whether the Nightmare Ball catches an enemy (by its PID) in the run's battle, and the battle
// caught one (ThrowBall, EventBattleReturn_Main)
BOOL EntralinkRun_IsCatchable(u32 pid);
void EntralinkRun_SetCaught(u32 pid);

// Makes the run's bag, emptied, the game's, unless it already is
void EntralinkRun_KeepBag(GameData *gameData);
// Makes the real bag the game's again and empties the run's, if the run's is the game's
void EntralinkRun_RestoreBag(GameData *gameData);
// Whether a bag is the run's
BOOL EntralinkRun_IsRunBag(BagSave *bag);
// The slots of a pocket of the run's bag (BagSave_GetItemHandleAddCheck)
u32 EntralinkRun_GetRunBagPocketMax(u32 pocket);

#endif // PAPERWHITE2_ENTRALINK_RUN_STATE_H
