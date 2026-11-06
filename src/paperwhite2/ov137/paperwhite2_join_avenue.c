#include "types.h"
#include "field/resort.h"
#include "gfl/heap.h"
#include "paperwhite2/join_avenue.h"
#include "save/join_avenue.h"
#include "system/game_data.h"
#include "system/resort_binary.h"

// Paper White 2: the Join Avenue's owners, the user's people who open its shops, in overlay 137 beside the avenue's
// field code. See include/paperwhite2/join_avenue.h

// The people's table's columns (ResortEntry_Fill)
#define PEOPLE_COL_TYPE 0
#define PEOPLE_COL_TRAINER_ID 4
#define PEOPLE_COL_WANTED_SHOP 5

// The shops' kind column, and the Nursery's kind, which unlock 6 allows (JoinAvenue_ChooseShop)
#define SHOP_COL_KIND 0
#define SHOP_KIND_NURSERY 5

// The entries' source kind of the daily visitors (ResortField_AddInitialEntries) and of the special ones
#define ENTRY_KIND_DAILY 4
#define ENTRY_KIND_SPECIAL 5

// JoinAvenue_Add's kind of an entry, and its result when it added one
#define ADD_KIND_ENTRY 2
#define ADD_ADDED 2

// The salt of the visitor sent away, apart from the original's draws
#define SEND_AWAY_SALT 40

BOOL PaperWhite2_JoinAvenue_IsOwner(ResortSys *sys, u32 trainerId) {
    ResortBinary *people = ResortSys_GetTexts(sys);
    u32 row;

    for (row = 0; row < ResortBinary_GetRowCount(people); row++) {
        if (ResortBinary_Get(people, row, PEOPLE_COL_TYPE) == JOIN_AVENUE_OWNER_TYPE &&
            ResortBinary_Get(people, row, PEOPLE_COL_TRAINER_ID) == trainerId) {
            return TRUE;
        }
    }
    return FALSE;
}

// Whether the owner is on the avenue already: running a shop, or waiting among the entries
static BOOL IsOnAvenue(ResortSys *sys, u32 trainerId) {
    JoinAvenueOccupants *occupants = ResortSys_GetOccupants(sys);
    JoinAvenueEntryList *entries = ResortSys_GetEntries(sys);
    u32 i;

    for (i = 0; i < JOIN_AVE_OCCUPANT_COUNT; i++) {
        JoinAvenuePerson *person = JoinAvenueOccupants_GetPerson(occupants, i);

        if (!JoinAvenuePerson_IsEmpty(person) &&
            joinAveTextHandler(person, JOIN_AVE_PARAM_TRAINER_ID, NULL) == trainerId) {
            return TRUE;
        }
    }
    for (i = 0; i < JoinAvenueEntryList_GetCount(entries); i++) {
        JoinAvenueEntry *entry = JoinAvenueEntryList_Get(entries, i);

        if (!JoinAvenueEntry_IsEmpty(entry) &&
            JoinAvenueEntry_GetParam(entry, JOIN_AVE_PARAM_TRAINER_ID, NULL) == trainerId) {
            return TRUE;
        }
    }
    return FALSE;
}

// Whether an entry is one that can be sent away for an owner: a daily visitor who isn't an owner
static BOOL CanSendAway(ResortSys *sys, JoinAvenueEntry *entry) {
    return !JoinAvenueEntry_IsEmpty(entry) &&
           JoinAvenueEntry_GetParam(entry, JOIN_AVE_PARAM_SHOP_KIND, NULL) != ENTRY_KIND_SPECIAL &&
           !PaperWhite2_JoinAvenue_IsOwner(sys, JoinAvenueEntry_GetParam(entry, JOIN_AVE_PARAM_TRAINER_ID, NULL));
}

// With every entry taken, one visitor that can go leaves, by the avenue's draw: FALSE when none can
static BOOL MakeRoom(ResortSys *sys) {
    JoinAvenueEntryList *entries = ResortSys_GetEntries(sys);
    u32 count = JoinAvenueEntryList_GetCount(entries);
    u32 candidates = 0;
    u32 pick;
    u32 i;

    if (JoinAvenueEntryList_CountUsed(entries) < count) {
        return TRUE;
    }
    for (i = 0; i < count; i++) {
        if (CanSendAway(sys, JoinAvenueEntryList_Get(entries, i))) {
            candidates++;
        }
    }
    if (candidates == 0) {
        return FALSE;
    }
    pick = JoinAvenueInfo_Random(ResortSys_GetInfo(sys), SEND_AWAY_SALT, candidates);
    for (i = 0; i < count; i++) {
        JoinAvenueEntry *entry = JoinAvenueEntryList_Get(entries, i);

        if (CanSendAway(sys, entry) && pick-- == 0) {
            JoinAvenueEntry_Clear(entry);
            ResortSlots_Fill(ResortSys_GetSlots(sys));
            return TRUE;
        }
    }
    return FALSE;
}

void PaperWhite2_JoinAvenue_AddOwner(ResortSys *sys, GameData *gameData, JoinAvenueSave *joinAvenue, HeapID heapId) {
    ResortBinary *people = ResortSys_GetTexts(sys);
    ResortShopData *shops = ResortSys_GetShopData(sys);
    BOOL nursery = JoinAvenue_GetParam(ResortSys_GetInfo(sys), JOIN_AVE_INFO_UNLOCKED_6, NULL) != 0;
    u32 row;

    for (row = 0; row < ResortBinary_GetRowCount(people); row++) {
        u32 shop;
        JoinAvenueEntry *entry;

        if (ResortBinary_Get(people, row, PEOPLE_COL_TYPE) != JOIN_AVENUE_OWNER_TYPE ||
            IsOnAvenue(sys, ResortBinary_Get(people, row, PEOPLE_COL_TRAINER_ID))) {
            continue;
        }
        shop = ResortBinary_Get(people, row, PEOPLE_COL_WANTED_SHOP);
        if (!nursery &&
            ResortShopData_GetShopParam(ResortShopData_GetShop(shops, shop), SHOP_COL_KIND) == SHOP_KIND_NURSERY) {
            continue;
        }
        if (!MakeRoom(sys)) {
            return;
        }
        entry = JoinAvenueEntry_Create(HEAPID_TAIL(heapId));
        PaperWhite2_ResortSys_MakeEntryFromRow(sys, gameData, entry, ENTRY_KIND_DAILY, (u16)row, heapId);
        JoinAvenue_Add(joinAvenue, gameData, entry, ADD_KIND_ENTRY);
        JoinAvenueEntry_Free(entry);
        // One owner a day
        return;
    }
}
