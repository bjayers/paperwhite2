#ifndef PAPERWHITE2_FOLLOWING_AMBIENT_H
#define PAPERWHITE2_FOLLOWING_AMBIENT_H

#include "types.h"
#include "paperwhite2/following.h"
#include "paperwhite2/following_data.h"
#include "struct_decls.h"

// Paper White 2: what the Following Pokémon does while it follows, without stopping the player
// (src/paperwhite2/ov036/paperwhite2_following_ambient.c): its steps on its party member, its pickups, which find an
// item from a pool that it keeps until it is talked to, and its ambient emotes, a bubble over it when an ambient rule
// matches, each followed by the rule's cooldown in steps. All by the rules of the dialogue library
// (paperwhite2/following_dialogue.h)

// Once a frame, after the actors' update. While counting, each step of the player to another tile is a step of the
// follower's party member, after which a pickup is rolled, if it keeps no item, and, while shown, an ambient emote.
// shown is whether the follower is out and drawn
void FollowingAmbient_Update(Field *field, FieldActor *actor, FieldActor *player, const FollowingPokemon *pokemon,
                             BOOL counting, BOOL shown);
// Ends its emote and forgets the player's tile, for a new follower and the field's unload
void FollowingAmbient_Reset(void);

#ifdef PAPERWHITE2_DEBUG_MENU
// The debug menu's Follower entries (paperwhite2_debug_commands.c), each on the Pokémon that follows the player

// Its record and species: FALSE without a follower
BOOL FollowingDebug_GetRecord(Field *field, FollowingRecord *record, u16 *species);
// Sets its steps since the last gift
BOOL FollowingDebug_SetSteps(Field *field, u32 steps);
// Finds an item now: a pickup rule that matches at its steps' greatest, chance or not, else the first pool. The item,
// which it then keeps, or 0
u32 FollowingDebug_ForcePickup(Field *field);
// Forgets the item it keeps
BOOL FollowingDebug_ClearItem(Field *field);
// The rule of a table (FOLLOWING_TABLE_*) that would be chosen now, as a talk faces it, with its name and priority and
// how many rules match: the rule, or -1 for none (and -2 without a follower or a library)
s32 FollowingDebug_GetRule(Field *field, u32 table, const char **name, u32 *priority, u32 *matches);
#endif

#endif // PAPERWHITE2_FOLLOWING_AMBIENT_H
