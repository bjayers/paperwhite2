#ifndef PAPERWHITE2_FOLLOWING_BATTLE_ENTRY_H
#define PAPERWHITE2_FOLLOWING_BATTLE_ENTRY_H

#include "types.h"
#include "battle/btl_setup.h"
#include "constants/battle.h"

// Paper White 2: the Following Pokémon's battle opening, ported from Pokeweb's battle-entry.h: the field's scene policy
// marks the setup of a local single battle whose lead is the follower in front, and the battle's opening takes the
// mark (docs/paperwhite2/following-pokemon.md)

// The mark in BtlSetup's flags, which the game's own flags (bits 0 to 16) don't use. It is never saved and changes
// nothing of the party
#define FOLLOWING_BATTLE_PRESENT 0x80000000

// A wild or trainer battle, single, not linked and not a multi battle
static inline BOOL FollowingBattle_IsLocalSingle(const BtlSetup *setup) {
    return setup != NULL && setup->battleType < 2 && setup->battleStyle == BTL_STYLE_SINGLE &&
           setup->fieldSituation.netHandle == NULL && setup->fieldSituation.unk18 == 0 &&
           setup->fieldSituation.unk19 == 0 && setup->fieldSituation.unk1a == 0 && setup->fieldSituation.unk1b == 0;
}

#endif // PAPERWHITE2_FOLLOWING_BATTLE_ENTRY_H
