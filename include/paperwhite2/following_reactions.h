#ifndef PAPERWHITE2_FOLLOWING_REACTIONS_H
#define PAPERWHITE2_FOLLOWING_REACTIONS_H

#include "types.h"
#include "nitro/fx.h"
#include "paperwhite2/following.h"

// Paper White 2: the Following Pokémon's reactions of HeartGold's when it is talked to: checking and choosing its
// interactions, their texts with the nickname and the player's name, and the steps of their motions and bubbles
// (src/paperwhite2/ov036/paperwhite2_following_reactions.c), ported from Pokeweb's reactions.c. The talk reads the
// file whole and keeps it; nothing here allocates or reads a file

// The file of ARCID_MMODEL_TBL that holds the interactions ("FWTK"), whose format
// tools/paperwhite2/following_assets.py gives
#define FOLLOWING_INTERACTIONS_FILE 3

// The largest interactions file, which the talk's buffer holds
#define FOLLOWING_INTERACTIONS_CAPACITY 8192
// The words of an interaction's text with its end, which the talk's text buffer holds
#define FOLLOWING_TEXT_CAPACITY 192

// The steps of a bubble
#define FOLLOWING_BUBBLE_STEPS 4

// The interactions, checked: the file and its tables' offsets and counts
typedef struct {
    const u8 *bytes;
    u32 size;
    u32 rules;
    u32 motions;
    u32 messages;
    u32 bubbles;
    u16 ruleCount;
    u16 motionCount;
    u16 messageCount;
    u16 bubbleCount;
} FollowingInteractions;

// What the conditions of a reaction read of the follower and the player, taken when the talk begins
typedef struct {
    FollowingPokemon pokemon;
    // The party member's status condition, PKM_PARAM_STATUS
    u32 status;
    u16 zone;
    u8 friendship;
    // The way the follower faces, 0 to 3 as DIR_UP, DIR_DOWN, DIR_LEFT and DIR_RIGHT
    u8 direction;
    u8 type1;
    u8 type2;
    // The nickname and the player's name, each ending in 0xFFFF
    u16 nickname[12];
    u16 playerName[9];
    // The player's tile in the map matrix
    s16 tileX;
    s16 tileY;
} FollowingReactionSnapshot;

// A step of a reaction: the motion it plays and the message and bubble it shows, each counted from 1 and 0 for none,
// its cry (0 none, 1 the cry, 2 the cry slowed down) and whether it waits for the player
typedef struct {
    u16 motion;
    u16 message;
    u16 cry;
    u8 bubble;
    u8 wait;
} FollowingReactionStep;

// A motion as it plays: its step and the frames into it, the follower's offset from where it stood, and its facing
typedef struct {
    u32 index;
    u32 age;
    fx32 x;
    fx32 y;
    fx32 z;
    u8 face;
} FollowingReactionMotion;

// A bubble: its first emote, counted from FOLLOWING_EMOTE_FILE, and each step's frame (0 or 1) and frames shown
typedef struct {
    u16 emote;
    u16 durations[FOLLOWING_BUBBLE_STEPS];
    u8 frames[FOLLOWING_BUBBLE_STEPS];
} FollowingBubble;

// The interactions: TRUE when the size bytes at bytes are valid ones, which out then describes
BOOL FollowingReactions_ValidateInteractions(FollowingInteractions *out, const void *bytes, u32 size);
// The first interaction whose conditions the snapshot meets and whose chance comes up, or -1. rng is the talk's random
// state, which each rule advances
s32 FollowingReactions_Choose(const FollowingInteractions *data, const FollowingReactionSnapshot *snapshot, u32 *rng);
// Step step of interaction rule: FALSE past its last
BOOL FollowingReactions_GetStep(const FollowingInteractions *data, u32 rule, u32 step, FollowingReactionStep *out);
// Message message (from 1) with the names put in, ending in 0xFFFF: its length, or 0 when it doesn't fit capacity
u32 FollowingReactions_GetText(const FollowingInteractions *data, u32 message,
                               const FollowingReactionSnapshot *snapshot, u16 *out, u32 capacity);
// Bubble bubble (from 1): FALSE when there is none
BOOL FollowingReactions_GetBubble(const FollowingInteractions *data, u32 bubble, FollowingBubble *out);
// One frame of motion (from 1), relative to where the follower stood; it doesn't move the actor. A grounded follower
// doesn't rise. *cry is whether the frame starts a step that cries. FALSE once the motion has ended
BOOL FollowingReactions_TickMotion(const FollowingInteractions *data, u32 motion, FollowingReactionMotion *state,
                                   BOOL grounded, BOOL *cry);

#endif // PAPERWHITE2_FOLLOWING_REACTIONS_H
