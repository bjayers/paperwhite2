#ifndef PAPERWHITE2_FOLLOWING_DIALOGUE_H
#define PAPERWHITE2_FOLLOWING_DIALOGUE_H

#include "types.h"
#include "gfl/heap.h"
#include "gfl/str.h"
#include "paperwhite2/conditions.h"
#include "paperwhite2/following_data.h"
#include "struct_decls.h"

// Paper White 2: the Following Pokémon's dialogue rules, ambient emotes, pickups and item pools
// (src/paperwhite2/ov036/paperwhite2_following_dialogue.c), which tools/paperwhite2/following_dialogue.py packs from
// res/paperwhite2/following/dialogue/ and pools.json (docs/paperwhite2/following-pokemon.md, "Dialogue rules, gifts
// and steps"). The rules are tables of the conditions module, chosen by its selection. Only the shared block, or the
// follower's species' block (the shared rules with its own), is read, into a buffer of
// FOLLOWING_DIALOGUE_BLOCK_CAPACITY; a message's text is read from the ROM when it is shown, and a pool when an item is
// rolled. Everything is read through the field actors' open handle of a/0/4/7

// The members of ARCID_MMODEL_TBL: the dialogue library ("FWDL") and the item pools ("FWPL")
#define FOLLOWING_DIALOGUES_FILE 4
#define FOLLOWING_POOLS_FILE 5
#define FOLLOWING_DIALOGUE_BLOCK_CAPACITY 4096

// "FWDL" and "FWPL", and their version
#define FOLLOWING_DIALOGUE_MAGIC 0x4c445746
#define FOLLOWING_POOLS_MAGIC 0x4c505746
#define FOLLOWING_DIALOGUE_VERSION 1

// A block's tables: the talk's rules, the ambient emotes and the pickups
enum {
    FOLLOWING_TABLE_TALK,
    FOLLOWING_TABLE_AMBIENT,
    FOLLOWING_TABLE_PICKUP,
    FOLLOWING_TABLE_COUNT,
};

// The window a message is shown in: the talk's balloon at the bottom with its tail to the follower; a balloon above or
// below as an NPC's ActorMsg places it; that balloon with the spiky frame, which shakes as it opens (ScreamMsg's); and
// the plain window across the bottom without a tail (InfoMsg's), for descriptions
enum {
    FOLLOWING_BOX_DEFAULT,
    FOLLOWING_BOX_BUBBLE,
    FOLLOWING_BOX_YELL,
    FOLLOWING_BOX_EVENT,
    FOLLOWING_BOX_COUNT,
};

// What a step does when it begins: gives an item (arg) and how many (amount); gives an item rolled from pool arg; gives
// the item the Pokémon keeps; changes its friendship by amount; starts script arg after the step; clears its steps
// since the last gift
enum {
    FOLLOWING_ACTION_NONE,
    FOLLOWING_ACTION_GIVE_ITEM,
    FOLLOWING_ACTION_GIVE_POOL,
    FOLLOWING_ACTION_GIVE_WAITING,
    FOLLOWING_ACTION_FRIENDSHIP,
    FOLLOWING_ACTION_SCRIPT,
    FOLLOWING_ACTION_RESET_STEPS,
    FOLLOWING_ACTION_COUNT,
};

// The library's header, at the member's start: an index of a block number for each species, a table of the blocks'
// offsets and sizes, the blocks, then the texts
typedef struct {
    u32 magic;
    u16 version;
    u16 speciesCount;
    u32 size;
    u32 blocks;
    u16 blockCount;
    // The friendship a talk gives, once a day
    u8 talkFriendship;
    u8 reserved;
    u32 texts;
    // The message of a gift that the Bag had no room for: its offset in the texts and its words with the end
    u32 bagFullText;
    u16 bagFullWords;
    u16 reserved2;
    u16 index[];
} FollowingDialogueHeader;

typedef struct {
    u32 offset;
    u32 size;
} FollowingDialogueBlockEntry;

// A block: the offsets of its three tables from its start, 0 for none, and its size
typedef struct {
    u16 tables[FOLLOWING_TABLE_COUNT];
    u16 size;
} FollowingDialogueBlock;

// A talk rule's step, 16 bytes. emote is a bubble of the interactions and motion a motion of them, each from 1 and 0
// for none; cry is 0 none, 1 the cry, 2 the cry slowed down; wait is the frames after it. A text is its offset in the
// texts and its words with the end, 0 for none
typedef struct {
    u32 text;
    u16 textWords;
    u8 box;
    u8 emote;
    u8 motion;
    u8 cry;
    u8 action;
    s8 amount;
    u16 arg;
    u16 wait;
} FollowingDialogueStep;

// A talk rule's payload: its steps, then its name, ASCII and a 0
typedef struct {
    u8 stepCount;
    u8 reserved[3];
    FollowingDialogueStep steps[];
} FollowingTalkRule;

// An ambient rule's payload: the bubble it shows, its cry, and the steps before the next ambient emote; then its name
typedef struct {
    u8 emote;
    u8 cry;
    u16 cooldown;
    char name[];
} FollowingAmbientRule;

// A pickup rule's payload: the pool its item is rolled from; then its name
typedef struct {
    u16 pool;
    u16 reserved;
    char name[];
} FollowingPickupRule;

// The follower's species' block, read once for each species until FollowingDialogue_Unload: FALSE when the library
// or the block isn't valid, and the tables are then empty
BOOL FollowingDialogue_Load(ArcTool *arc, u32 species);
// Forgets the block, for the field's unload
void FollowingDialogue_Unload(void);
// A table of the loaded block, or NULL
const ConditionTable *FollowingDialogue_GetTable(u32 table);
// The rule of the table that the conditions' selection picks in the context, or -1
s32 FollowingDialogue_Select(u32 table, const ConditionContext *ctx, u32 *rng);
// A rule's payload, and its name
const void *FollowingDialogue_GetRule(u32 table, u32 rule);
const char *FollowingDialogue_GetName(u32 table, u32 rule);
// The library's talk friendship and its message of a full Bag (FALSE without one)
u32 FollowingDialogue_GetTalkFriendship(void);
BOOL FollowingDialogue_GetBagFullText(u32 *text, u32 *words);

// The context of the follower's rules: the world, the field, the party, the follower as the subject with its record,
// its tile's terrain, and the position: facing, a DIR_*, and the player's tile. FALSE without the subject (an Egg)
BOOL FollowingDialogue_FillContext(ConditionContext *ctx, Field *field, PartyPkm *pkm, u32 facing, u32 tileX,
                                   u32 tileY);
// The word set of the texts: the nickname (word 0), the player's name (1), the zone's place name (2) and item (3)
WordSet *FollowingDialogue_CreateWords(GameData *gameData, PartyPkm *pkm, u32 zone, u32 item, HeapID heapId);
// A text of words words at text in the texts, its words put in from wordSet: a new StrBuf, or NULL when it isn't valid
StrBuf *FollowingDialogue_ReadText(ArcTool *arc, u32 text, u32 words, WordSet *wordSet, HeapID heapId);
// An item rolled by weight from pool, with *quantity how many of it: the item, or 0 when the pool has none
u32 FollowingDialogue_RollPool(ArcTool *arc, u32 pool, u32 *rng, u32 *quantity, HeapID heapId);

#endif // PAPERWHITE2_FOLLOWING_DIALOGUE_H
