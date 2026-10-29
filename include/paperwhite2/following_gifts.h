#ifndef PAPERWHITE2_FOLLOWING_GIFTS_H
#define PAPERWHITE2_FOLLOWING_GIFTS_H

#include "types.h"
#include "paperwhite2/following_reactions.h"
#include "struct_decls.h"

// Paper White 2: the Following Pokémon's contextual gifts: which of a party member's ten gift slots it has given, and
// giving one (src/paperwhite2/ov036/paperwhite2_following_gifts.c), ported from Pokeweb's gifts.c. Both find the
// party member by the snapshot's Pokémon, and keep its encryption as they found it

// What FollowingGifts_Grant did
enum {
    // The party member is gone or changed, its data is bad, the slot is claimed, or the choice is no gift
    FOLLOWING_GIFT_STALE = -1,
    // The bag has no room, or the item is invalid
    FOLLOWING_GIFT_NOT_GIVEN = 0,
    FOLLOWING_GIFT_GIVEN = 1,
};

// The snapshot's party member's claimed gift slots, a bit each: FALSE when it isn't in the party or its data is bad
BOOL FollowingGifts_ReadClaims(GameData *gameData, const FollowingReactionSnapshot *snapshot, u16 *claims);
// Gives choice's item and claims its slot of the snapshot's party member: a FOLLOWING_GIFT_*
s32 FollowingGifts_Grant(GameData *gameData, const FollowingReactionSnapshot *snapshot,
                         const FollowingGiftChoice *choice);

#endif // PAPERWHITE2_FOLLOWING_GIFTS_H
