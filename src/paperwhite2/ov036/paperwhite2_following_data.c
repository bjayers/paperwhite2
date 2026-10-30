#include "types.h"
#include "constants/items.h"
#include "constants/pokemon.h"
#include "constants/vars.h"
#include "gfl/heap.h"
#include "paperwhite2/following_data.h"
#include "pml/poke_party.h"
#include "save/bag.h"
#include "save/event_work.h"
#include "system/game_data.h"

// Paper White 2: the Following Pokémon's record on its party member, its daily friendship from a talk, and its gifts.
// The original's one-time gifts kept ten claims in the top 16 bits of block C's ribbons, which the game reads as
// ribbons; they are gone, and those bits are the game's again. See include/paperwhite2/following_data.h

#define ITEM_BITS 10
#define STEPS_BITS 12
#define ITEM_MASK ((1 << ITEM_BITS) - 1)
#define STEPS_SHIFT ITEM_BITS
#define TOTAL_SHIFT (ITEM_BITS + STEPS_BITS)
// The total's bits in the low 32, the rest in the high byte
#define TOTAL_LOW_BITS (32 - TOTAL_SHIFT)
#define FRIENDSHIP_MAX 255
// The daily friendship's table: an entry a party's worth of Pokémon, each a hash in the high byte and a day's low byte
#define TALK_DAYS 6
#define TALK_DAY_MASK 0xff
#define TALK_HASH_SHIFT 8

PartyPkm *FollowingParty_Find(GameData *gameData, u32 personality, u32 trainer, u32 species, u32 form) {
    PokeParty *party = GameData_GetParty(gameData);
    PartyPkm *pkm;
    s32 i;

    if (party == NULL) {
        return NULL;
    }
    for (i = 0; i < PokeParty_GetPkmCount(party) && i < PARTY_SIZE; i++) {
        pkm = PokeParty_GetPkm(party, i);
        if (PokeParty_GetParam(pkm, PKM_PARAM_PID, NULL) == personality &&
            PokeParty_GetParam(pkm, PKM_PARAM_ID, NULL) == trainer &&
            PokeParty_GetParam(pkm, PKM_PARAM_SPECIES, NULL) == species &&
            PokeParty_GetParam(pkm, PKM_PARAM_FORM, NULL) == form && !PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL)) {
            return pkm;
        }
    }
    return NULL;
}

void FollowingRecord_Read(PartyPkm *pkm, FollowingRecord *out) {
    u32 low = PokeParty_GetParam(pkm, FOLLOWING_RECORD_PARAM_LOW, NULL);
    u32 high = PokeParty_GetParam(pkm, FOLLOWING_RECORD_PARAM_HIGH, NULL);

    out->itemWaiting = low & ITEM_MASK;
    // A Pokémon that came over from another game may have other values here, which are at worst some steps; an item
    // the game doesn't have is none
    if (out->itemWaiting > ITEM_LAST) {
        out->itemWaiting = ITEM_NONE;
    }
    out->steps = (low >> STEPS_SHIFT) & FOLLOWING_RECORD_STEPS_MAX;
    out->totalSteps = (low >> TOTAL_SHIFT) | high << TOTAL_LOW_BITS;
}

void FollowingRecord_Write(PartyPkm *pkm, const FollowingRecord *record) {
    u32 steps = record->steps > FOLLOWING_RECORD_STEPS_MAX ? FOLLOWING_RECORD_STEPS_MAX : record->steps;
    u32 total =
        record->totalSteps > FOLLOWING_RECORD_TOTAL_STEPS_MAX ? FOLLOWING_RECORD_TOTAL_STEPS_MAX : record->totalSteps;

    PokeParty_SetParam(pkm, FOLLOWING_RECORD_PARAM_LOW,
                       (record->itemWaiting & ITEM_MASK) | steps << STEPS_SHIFT | total << TOTAL_SHIFT);
    PokeParty_SetParam(pkm, FOLLOWING_RECORD_PARAM_HIGH, total >> TOTAL_LOW_BITS);
}

void FollowingRecord_AddStep(PartyPkm *pkm) {
    FollowingRecord record;

    FollowingRecord_Read(pkm, &record);
    if (record.steps < FOLLOWING_RECORD_STEPS_MAX) {
        record.steps++;
    }
    if (record.totalSteps < FOLLOWING_RECORD_TOTAL_STEPS_MAX) {
        record.totalSteps++;
    }
    FollowingRecord_Write(pkm, &record);
}

// A Pokémon's hash for the daily friendship's table: its PID's four bytes, never 0, which an unused entry is
static u32 GetTalkHash(PartyPkm *pkm) {
    u32 pid = PokeParty_GetParam(pkm, PKM_PARAM_PID, NULL);
    u32 hash = (pid ^ pid >> 8 ^ pid >> 16 ^ pid >> 24) & TALK_DAY_MASK;

    return hash != 0 ? hash : 1;
}

BOOL FollowingFriendship_GiveDaily(EventWork *eventWork, PartyPkm *pkm, s32 day, u32 amount) {
    u32 hash = GetTalkHash(pkm);
    u32 today = (u32)day & TALK_DAY_MASK;
    u16 *entry;
    u16 *slot = NULL;
    u32 i;

    for (i = 0; i < TALK_DAYS; i++) {
        entry = EventWork_GetWkPtr(eventWork, EVENT_WORK_FOLLOWER_TALK_DAY_0 + i);
        if ((u32)(*entry >> TALK_HASH_SHIFT) == hash) {
            if ((*entry & TALK_DAY_MASK) == today) {
                return FALSE;
            }
            slot = entry;
            break;
        }
    }
    // A Pokémon not in the table takes an entry of another day; with every entry of today's, the hash picks one
    for (i = 0; slot == NULL && i < TALK_DAYS; i++) {
        entry = EventWork_GetWkPtr(eventWork, EVENT_WORK_FOLLOWER_TALK_DAY_0 + i);
        if (*entry == 0 || (*entry & TALK_DAY_MASK) != today) {
            slot = entry;
        }
    }
    if (slot == NULL) {
        slot = EventWork_GetWkPtr(eventWork, EVENT_WORK_FOLLOWER_TALK_DAY_0 + hash % TALK_DAYS);
    }
    *slot = hash << TALK_HASH_SHIFT | today;
    FollowingFriendship_Add(pkm, amount);
    return TRUE;
}

void FollowingFriendship_Add(PartyPkm *pkm, s32 change) {
    s32 friendship = PokeParty_GetParam(pkm, PKM_PARAM_HAPPINESS, NULL) + change;

    if (friendship < 0) {
        friendship = 0;
    } else if (friendship > FRIENDSHIP_MAX) {
        friendship = FRIENDSHIP_MAX;
    }
    PokeParty_SetParam(pkm, PKM_PARAM_HAPPINESS, friendship);
}

u32 FollowingGift_Give(GameData *gameData, PartyPkm *pkm, u32 item, u32 quantity) {
    BagSave *bag = GameData_GetBag(gameData);
    FollowingRecord record;

    if (item == ITEM_NONE || item > ITEM_LAST || quantity == 0) {
        return FOLLOWING_GIFT_NOT_GIVEN;
    }
    // The Bag checks the item, its pocket, the count and the room for it
    if (BagSave_CheckAvailItemSpace(bag, item, quantity, HEAPID_GAMEEVENT) &&
        BagSave_AddItem(bag, item, quantity, HEAPID_GAMEEVENT)) {
        return FOLLOWING_GIFT_GIVEN;
    }
    FollowingRecord_Read(pkm, &record);
    if (record.itemWaiting != ITEM_NONE) {
        return FOLLOWING_GIFT_NOT_GIVEN;
    }
    record.itemWaiting = item;
    FollowingRecord_Write(pkm, &record);
    return FOLLOWING_GIFT_KEPT;
}

u32 FollowingGift_GiveWaiting(GameData *gameData, PartyPkm *pkm, u16 *item) {
    BagSave *bag = GameData_GetBag(gameData);
    FollowingRecord record;

    FollowingRecord_Read(pkm, &record);
    *item = record.itemWaiting;
    if (record.itemWaiting == ITEM_NONE) {
        return FOLLOWING_GIFT_NOT_GIVEN;
    }
    if (!BagSave_CheckAvailItemSpace(bag, record.itemWaiting, 1, HEAPID_GAMEEVENT) ||
        !BagSave_AddItem(bag, record.itemWaiting, 1, HEAPID_GAMEEVENT)) {
        return FOLLOWING_GIFT_KEPT;
    }
    record.itemWaiting = ITEM_NONE;
    record.steps = 0;
    FollowingRecord_Write(pkm, &record);
    return FOLLOWING_GIFT_GIVEN;
}
