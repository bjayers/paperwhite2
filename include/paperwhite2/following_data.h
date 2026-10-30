#ifndef PAPERWHITE2_FOLLOWING_DATA_H
#define PAPERWHITE2_FOLLOWING_DATA_H

#include "types.h"
#include "constants/pokemon.h"
#include "struct_decls.h"

// Paper White 2: what the Following Pokémon keeps on its party member, and the gifts it gives
// (src/paperwhite2/ov036/paperwhite2_following_data.c). The record is in five bytes of the Pokémon's data that the game
// never writes (docs/paperwhite2/following-pokemon.md, "Dialogue rules, gifts and steps"), so it stays with the Pokémon
// in the party, the PC and the save: block B's u32 at 0x1c (PK5 offset 0x44) and block C's byte at 0x16 (PK5 0x5e),
// read as one 40-bit value: bits 0-9 the item it keeps for the player, 10-21 its steps since its last gift, and 22-39
// its total steps. Both counters stop at their greatest

// The record's two fields of the Pokémon's data, the low 32 bits and the high 8
#define FOLLOWING_RECORD_PARAM_LOW PKM_PARAM_UNK72
#define FOLLOWING_RECORD_PARAM_HIGH PKM_PARAM_UNK76

#define FOLLOWING_RECORD_STEPS_MAX 4095
#define FOLLOWING_RECORD_TOTAL_STEPS_MAX 262143

typedef struct {
    // The item the Pokémon found and keeps until the player can take it, or 0
    u16 itemWaiting;
    // The steps it has walked as the follower since its last gift, and in all
    u16 steps;
    u32 totalSteps;
} FollowingRecord;

// What FollowingGift_Give did: the item is in the Bag; the Bag had no room, so the Pokémon keeps it as its waiting
// item; or it had no room and the Pokémon already keeps one, or the item is none
enum {
    FOLLOWING_GIFT_GIVEN,
    FOLLOWING_GIFT_KEPT,
    FOLLOWING_GIFT_NOT_GIVEN,
};

// The party member that is pokemon: its PID, trainer, species and form, and no Egg; NULL when it isn't in the party
PartyPkm *FollowingParty_Find(GameData *gameData, u32 personality, u32 trainer, u32 species, u32 form);

// The record. A waiting item past the game's last item reads as none
void FollowingRecord_Read(PartyPkm *pkm, FollowingRecord *out);
void FollowingRecord_Write(PartyPkm *pkm, const FollowingRecord *record);
// A step walked as the follower: both counters, each up to its greatest
void FollowingRecord_AddStep(PartyPkm *pkm);

// The friendship of a talk, given once a day to each Pokémon: amount more friendship, up to 255, unless the Pokémon had
// it on day (the save clock's day number) already. Whether it was given. The days are kept in
// EVENT_WORK_FOLLOWER_TALK_DAY_0 to _5, a Pokémon's hash and the day's low byte each
BOOL FollowingFriendship_GiveDaily(EventWork *eventWork, PartyPkm *pkm, s32 day, u32 amount);
// Friendship changed by change, within 0 and 255
void FollowingFriendship_Add(PartyPkm *pkm, s32 change);

// Gives quantity of item to the Bag from the Pokémon: a FOLLOWING_GIFT_*. With no room, one of it becomes the
// Pokémon's waiting item if it keeps none
u32 FollowingGift_Give(GameData *gameData, PartyPkm *pkm, u32 item, u32 quantity);
// Gives the Pokémon's waiting item, which *item names: FOLLOWING_GIFT_GIVEN clears it and the steps since the last
// gift; FOLLOWING_GIFT_KEPT keeps it; FOLLOWING_GIFT_NOT_GIVEN when there is none
u32 FollowingGift_GiveWaiting(GameData *gameData, PartyPkm *pkm, u16 *item);

#endif // PAPERWHITE2_FOLLOWING_DATA_H
