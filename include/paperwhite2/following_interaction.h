#ifndef PAPERWHITE2_FOLLOWING_INTERACTION_H
#define PAPERWHITE2_FOLLOWING_INTERACTION_H

#include "types.h"
#include "paperwhite2/following.h"
#include "paperwhite2/following_reactions.h"
#include "struct_decls.h"

// Paper White 2: talking to the Following Pokémon: A in front of it starts an event that plays a rule of its dialogue
// library or a reaction of HeartGold's, with its motions, bubbles, cries, messages and actions
// (src/paperwhite2/ov036/paperwhite2_following_interaction.c), ported from Pokeweb's interaction.c

// Once a frame: a talk that ended waits for A and B to be let go before another can begin
void FollowingTalk_PollInput(void);
BOOL FollowingTalk_IsActive(void);
// Whether the talk runs on field and its event is the game system's running event
BOOL FollowingTalk_Owns(Field *field);
// FollowingTalk_Owns, or the talk's event ended this frame on field with the follower still its actor: the field
// still saw an event at the frame's start. Once a frame, from the field's update, which consumes the ended talk
BOOL FollowingTalk_FieldOwns(Field *field);
// The talk's event, or NULL when the follower can't be talked to now. snapshot is the follower and the player as the
// field read them; the talk adds the player's tile and the follower's facing
GameEvent *FollowingTalk_Begin(Follower *follower, FieldActor *player, FieldActor *actor, Field *field,
                               GameSystem *gsys, const FollowingReactionSnapshot *snapshot);
// A bubble of the interactions (from 1), which the ambient emotes show too: FALSE when there is none or the
// interactions can't be read
BOOL FollowingTalk_GetBubble(MMSys *system, u32 bubble, FollowingBubble *out);
// Ends a running talk at once and takes its event off the game system's chain
void FollowingTalk_Cancel(void);
// FollowingTalk_Cancel, and forgets the files read, for the field's unload
void FollowingTalk_Unload(void);

#endif // PAPERWHITE2_FOLLOWING_INTERACTION_H
