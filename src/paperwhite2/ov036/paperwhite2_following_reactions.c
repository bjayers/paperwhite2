#include "types.h"
#include "paperwhite2/following.h"
#include "paperwhite2/following_reactions.h"

// Paper White 2: the Following Pokémon's reactions, ported from Pokeweb's reactions.c: the interactions (a/0/4/7
// member 3), which are HeartGold's, the contextual dialogues (member 4) and the contextual gifts (member 5), each
// checked whole before any of it is used. tools/paperwhite2/following_assets.py gives every format. The three choose
// their rules by the same conditions: the follower's HP, friendship, status and facing, and a chance

// The interactions' header: the magic, the format version, the size, the CRC-32 of what follows the first 16 bytes,
// the counts and offsets of the tables, and the size and CRC-32 of the emotes as Pokeweb's installer wrote them
#define INTERACTIONS_HEADER_SIZE 48
#define INTERACTIONS_ABI 1
#define INTERACTION_RULE_SIZE 12
#define INTERACTION_STEP_SIZE 8
#define MOTION_SIZE 84
#define MOTION_STEP_SIZE 8
#define MOTION_MAX_STEPS 10
#define MESSAGE_SIZE 8
#define BUBBLE_SIZE 16
#define MAX_RULES 70
#define MAX_MOTIONS 64
#define MAX_MESSAGES 128
#define MAX_BUBBLES 14
#define MAX_RULE_STEPS 5
#define MESSAGE_WORDS 128
#define MOTION_STEP_FRAMES 120
#define MOTION_STEP_PIXELS 16
#define MIN_EMOTES_SIZE 64
#define MAX_EMOTES_SIZE 32768

// The dialogues' and gifts' header: the magic, the format version, the rule count, the size, and the CRC-32 of what
// follows it
#define CONTEXT_HEADER_SIZE 16
#define DIALOGUE_RULE_SIZE 20
#define DIALOGUE_BOUNDED_RULE_SIZE 28
#define GIFT_RULE_SIZE 28
#define GIFT_BOUNDED_RULE_SIZE 36
#define GIFT_SLOTS 10
#define GIFT_TYPES 31

// A rule's chance, in percent
#define CHANCE_ALWAYS 100
// A form or type condition that any meets
#define ANY_VALUE 255

// The words of a text: its end, a new line, the names and the zone that are put in, and the first of the words that
// are no characters
#define TEXT_END 0xffff
#define TEXT_NEWLINE 0xfffe
#define TEXT_NICKNAME 0xfff0
#define TEXT_PLAYER 0xfff1
#define TEXT_ZONE 0xfff2
#define TEXT_ITEM 0xfff3
#define TEXT_SPECIAL 0xf000
// The characters of the names that are put in
#define NICKNAME_LENGTH 11
#define PLAYER_NAME_LENGTH 8

// The conditions: the HP left, 1 full to 5 below a quarter; friendship, 1 to 10; status, 1 healthy, 2 burn, 3 freeze,
// 4 paralysis, 5 poison, 7 any status, 8 sleep; and facing, 1 right, 2 left, 3 up, 4 down. 0 matches any
#define HP_CONDITIONS 5
#define FRIENDSHIP_CONDITIONS 10
#define STATUS_HEALTHY 1
#define STATUS_BURN 2
#define STATUS_FREEZE 3
#define STATUS_PARALYSIS 4
#define STATUS_POISON 5
#define STATUS_ANY 7
#define STATUS_SLEEP 8
#define STATUS_CONDITIONS 8
#define FACING_CONDITIONS 4

// The bits of a status condition: sleep's turns, poison, burn, freeze, paralysis and bad poison
#define STATUS_COND_SLEEP 0x7
#define STATUS_COND_POISON 0x8
#define STATUS_COND_BURN 0x10
#define STATUS_COND_FREEZE 0x20
#define STATUS_COND_PARALYSIS 0x40
#define STATUS_COND_BAD_POISON 0x80

// The tile bounds of a rule: the bits of the ones it has, the least and greatest x, then y
#define BOUND_MIN_X 1
#define BOUND_MAX_X 2
#define BOUND_MIN_Y 4
#define BOUND_MAX_Y 8
#define BOUNDS_ALL 15

// The random state that a talk starts from when it has none, "FWTK"
#define RANDOM_SEED 0x4657544b

// The facing condition of each direction the follower faces in, DIR_UP to DIR_RIGHT
static const u8 sFacingConditions[4] = { 3, 4, 2, 1 };

static u16 Read16(const u8 *p) {
    return p[0] | (u16)p[1] << 8;
}

static u32 Read32(const u8 *p) {
    return Read16(p) | (u32)Read16(p + 2) << 16;
}

// The CRC-32 (reflected, polynomial 0xedb88320) of size bytes, a bit at a time
static u32 CalcCrc(const u8 *p, u32 size) {
    u32 crc = ~0u;
    u32 j;

    while (size--) {
        crc ^= *p++;
        for (j = 0; j < 8; j++) {
            crc = (crc >> 1) ^ ((0u - (crc & 1u)) & 0xedb88320u);
        }
    }
    return ~crc;
}

// Whether count bytes at offset are in the interactions, past their header
static BOOL InRange(u32 offset, u32 count, u32 size) {
    return offset >= INTERACTIONS_HEADER_SIZE && offset <= size && count <= size - offset;
}

static BOOL IsMagic(const u8 *p, char a, char b, char c, char d) {
    return p[0] == a && p[1] == b && p[2] == c && p[3] == d;
}

// The HP condition the follower meets, or 0 when its maximum HP is 0
static u32 GetHpCondition(const FollowingReactionSnapshot *snapshot) {
    u32 hp = snapshot->pokemon.hp;
    u32 max = snapshot->pokemon.maxHp;
    u32 percent;

    if (max == 0) {
        return 0;
    }
    if (hp >= max) {
        return 1;
    }
    percent = hp * 100 / max;
    if (percent >= 75) {
        return 2;
    }
    if (percent >= 50) {
        return 3;
    }
    if (percent >= 25) {
        return 4;
    }
    return 5;
}

static u32 GetStatusCondition(u32 condition) {
    if (condition & (STATUS_COND_POISON | STATUS_COND_BAD_POISON)) {
        return STATUS_POISON;
    }
    if (condition & STATUS_COND_SLEEP) {
        return STATUS_SLEEP;
    }
    if (condition & STATUS_COND_BURN) {
        return STATUS_BURN;
    }
    if (condition & STATUS_COND_FREEZE) {
        return STATUS_FREEZE;
    }
    if (condition & STATUS_COND_PARALYSIS) {
        return STATUS_PARALYSIS;
    }
    return STATUS_HEALTHY;
}

static BOOL FriendshipMet(u32 condition, u32 value) {
    switch (condition) {
    case 0:
        return TRUE;
    case 1:
        return value == 255;
    case 2:
        return value >= 200 && value < 255;
    case 3:
        return value >= 150 && value < 200;
    case 4:
        return value >= 90 && value < 150;
    case 5:
        return value >= 60 && value < 90;
    case 6:
        return value >= 30 && value < 60;
    case 7:
        return value >= 1 && value < 30;
    case 8:
        return value == 0;
    case 9:
        return value >= 90;
    case 10:
        return value < 60;
    default:
        return FALSE;
    }
}

// Whether a rule's four conditions, HP, friendship, status and facing, are in range
static BOOL ConditionsValid(const u8 *conditions) {
    return conditions[0] <= HP_CONDITIONS && conditions[1] <= FRIENDSHIP_CONDITIONS &&
           conditions[2] <= STATUS_CONDITIONS && conditions[3] <= FACING_CONDITIONS;
}

// Whether the follower meets a rule's four conditions, with its HP and status conditions
static BOOL ConditionsMet(const u8 *conditions, const FollowingReactionSnapshot *snapshot, u32 hp, u32 status) {
    return (conditions[0] == 0 || conditions[0] == hp) && FriendshipMet(conditions[1], snapshot->friendship) &&
           (conditions[2] == 0 || (conditions[2] == STATUS_ANY ? status != STATUS_HEALTHY : conditions[2] == status)) &&
           (conditions[3] == 0 || conditions[3] == sFacingConditions[snapshot->direction]);
}

// The next of the talk's xorshift random numbers
static u32 NextRandom(u32 *state) {
    u32 x = *state != 0 ? *state : RANDOM_SEED;

    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *state = x;
    return x;
}

// The bit of a word past TEXT_NICKNAME, from the names to the new line, for TextValid
#define TEXT_ALLOW(word) (1u << ((word) - TEXT_NICKNAME))
// The words of the interactions' texts besides characters
#define TEXT_ALLOW_NAMES (TEXT_ALLOW(TEXT_NICKNAME) | TEXT_ALLOW(TEXT_PLAYER) | TEXT_ALLOW(TEXT_NEWLINE))

// Whether count words at text are a valid text, characters then its end. allowed has the bits of the words past
// TEXT_SPECIAL that it may have
static BOOL TextValid(const u8 *text, u32 words, u32 allowed) {
    u32 c;
    u32 i;

    if (Read16(text + (words - 1) * 2) != TEXT_END) {
        return FALSE;
    }
    for (i = 0; i + 1 < words; i++) {
        c = Read16(text + i * 2);
        if (c == 0 || c == TEXT_END || (c >= TEXT_SPECIAL && (c < TEXT_NICKNAME || !(allowed & TEXT_ALLOW(c))))) {
            return FALSE;
        }
    }
    return TRUE;
}

// Whether a dialogue's or gift's tile bounds are valid: only those of mask are set, and each pair is in order
static BOOL BoundsValid(const u8 *bounds, u32 mask) {
    u32 i;

    if (mask & ~BOUNDS_ALL) {
        return FALSE;
    }
    for (i = 0; i < 4; i++) {
        if (!(mask & (1u << i)) && Read16(bounds + i * 2) != 0) {
            return FALSE;
        }
    }
    return ((mask & (BOUND_MIN_X | BOUND_MAX_X)) != (BOUND_MIN_X | BOUND_MAX_X) ||
            (s16)Read16(bounds) <= (s16)Read16(bounds + 2)) &&
           ((mask & (BOUND_MIN_Y | BOUND_MAX_Y)) != (BOUND_MIN_Y | BOUND_MAX_Y) ||
            (s16)Read16(bounds + 4) <= (s16)Read16(bounds + 6));
}

// Whether the player's tile is in a rule's tile bounds, each inclusive
static BOOL BoundsMet(const u8 *bounds, u32 mask, const FollowingReactionSnapshot *snapshot) {
    return (!(mask & BOUND_MIN_X) || snapshot->tileX >= (s16)Read16(bounds)) &&
           (!(mask & BOUND_MAX_X) || snapshot->tileX <= (s16)Read16(bounds + 2)) &&
           (!(mask & BOUND_MIN_Y) || snapshot->tileY >= (s16)Read16(bounds + 4)) &&
           (!(mask & BOUND_MAX_Y) || snapshot->tileY <= (s16)Read16(bounds + 6));
}

// Whether the follower can react at all: it has HP, is no egg, can follow and faces a way
static BOOL CanReact(const FollowingReactionSnapshot *snapshot, u32 hp) {
    return hp != 0 && !snapshot->pokemon.egg && snapshot->pokemon.species != 0 &&
           snapshot->pokemon.species <= FOLLOWING_MAX_SPECIES && snapshot->direction <= 3;
}

// Copies a name of at most max characters, which ends at a 0 or 0xFFFF, FALSE when it doesn't fit
static BOOL PutName(u16 *out, u32 *n, u32 capacity, const u16 *name, u32 max) {
    u32 i;

    for (i = 0; i < max && name[i] != 0 && name[i] != TEXT_END; i++) {
        if (*n + 1 >= capacity) {
            return FALSE;
        }
        out[(*n)++] = name[i];
    }
    return TRUE;
}

// Writes "Zone N": the dialogues and gifts have no table of the zones' names
static BOOL PutZone(u16 *out, u32 *n, u32 capacity, u32 zone) {
    u32 div;
    u32 digit;
    BOOL seen;

    // The original makes room for "Zone " and one digit only, so a zone of more digits near the end of a full text
    // writes up to two words past capacity, its end among them. Kept as it was
    if (*n + 6 >= capacity) {
        return FALSE;
    }
    out[(*n)++] = 'Z';
    out[(*n)++] = 'o';
    out[(*n)++] = 'n';
    out[(*n)++] = 'e';
    out[(*n)++] = ' ';
    if (zone > 9999) {
        zone = 9999;
    }
    seen = FALSE;
    for (div = 1000; div != 0; div /= 10) {
        digit = zone / div;
        if (digit != 0 || seen || div == 1) {
            out[(*n)++] = '0' + digit;
            seen = TRUE;
        }
        zone %= div;
    }
    return TRUE;
}

// Copies words of text with the names, the zone and item (a gift's item name, or NULL) put in, ending in 0xFFFF:
// its length, or 0 when it doesn't fit capacity. The original had a copy of this for each file, each putting in only
// the words that its file's check lets its texts have, so one serves all three
static u32 ExpandText(const u8 *text, u32 words, const FollowingReactionSnapshot *snapshot, const u16 *item, u16 *out,
                      u32 capacity) {
    u32 n = 0;
    u32 c;
    u32 i;
    BOOL fits;

    for (i = 0; i < words; i++) {
        c = Read16(text + i * 2);
        if (c == TEXT_END) {
            break;
        }
        if (c == TEXT_NICKNAME) {
            fits = PutName(out, &n, capacity, snapshot->nickname, NICKNAME_LENGTH);
        } else if (c == TEXT_PLAYER) {
            fits = PutName(out, &n, capacity, snapshot->playerName, PLAYER_NAME_LENGTH);
        } else if (c == TEXT_ITEM && item != NULL) {
            fits = PutName(out, &n, capacity, item, FOLLOWING_TEXT_CAPACITY - 1);
        } else if (c == TEXT_ZONE) {
            fits = PutZone(out, &n, capacity, snapshot->zone);
        } else {
            fits = n + 1 < capacity;
            if (fits) {
                out[n++] = c;
            }
        }
        if (!fits) {
            return 0;
        }
    }
    out[n] = TEXT_END;
    return n;
}

BOOL FollowingReactions_ValidateInteractions(FollowingInteractions *out, const void *bytes, u32 size) {
    const u8 *b = bytes;
    FollowingInteractions data;
    const u8 *rule;
    const u8 *step;
    const u8 *motion;
    const u8 *message;
    const u8 *bubble;
    u32 emotesSize;
    u32 offset;
    u32 words;
    u32 i;
    u32 j;
    u32 k;

    out->bytes = NULL;
    out->size = out->rules = out->motions = out->messages = out->bubbles = 0;
    out->ruleCount = out->motionCount = out->messageCount = out->bubbleCount = 0;
    if (b == NULL || size < INTERACTIONS_HEADER_SIZE || size > FOLLOWING_INTERACTIONS_CAPACITY ||
        !IsMagic(b, 'F', 'W', 'T', 'K') || Read32(b + 4) != INTERACTIONS_ABI || Read32(b + 8) != size ||
        CalcCrc(b + 16, size - 16) != Read32(b + 12)) {
        return FALSE;
    }
    data.bytes = b;
    data.size = size;
    data.ruleCount = Read16(b + 16);
    data.motionCount = Read16(b + 18);
    data.messageCount = Read16(b + 20);
    data.bubbleCount = Read16(b + 22);
    data.rules = Read32(b + 24);
    data.motions = Read32(b + 28);
    data.messages = Read32(b + 32);
    data.bubbles = Read32(b + 36);
    // The emotes' size and CRC-32 were the installer's record of its emotes file, which the talk checked it against.
    // The emotes are now members of the same archive, packed with these, so only the size's range is still checked
    emotesSize = Read32(b + 40);
    if (data.ruleCount == 0 || data.ruleCount > MAX_RULES || data.motionCount == 0 || data.motionCount > MAX_MOTIONS ||
        data.messageCount == 0 || data.messageCount > MAX_MESSAGES || data.bubbleCount == 0 ||
        data.bubbleCount > MAX_BUBBLES || emotesSize > MAX_EMOTES_SIZE || emotesSize < MIN_EMOTES_SIZE) {
        return FALSE;
    }
    if (!InRange(data.rules, data.ruleCount * INTERACTION_RULE_SIZE, size) ||
        !InRange(data.motions, data.motionCount * MOTION_SIZE, size) ||
        !InRange(data.messages, data.messageCount * MESSAGE_SIZE, size) ||
        !InRange(data.bubbles, data.bubbleCount * BUBBLE_SIZE, size)) {
        return FALSE;
    }
    // A rule: its HeartGold reaction, its four conditions, its chance, its step count and its steps' offset
    for (i = 0; i < data.ruleCount; i++) {
        rule = b + data.rules + i * INTERACTION_RULE_SIZE;
        offset = Read32(rule + 8);
        if (Read16(rule) == 0 || !ConditionsValid(rule + 2) || rule[6] > CHANCE_ALWAYS || rule[7] == 0 ||
            rule[7] > MAX_RULE_STEPS || !InRange(offset, rule[7] * INTERACTION_STEP_SIZE, size)) {
            return FALSE;
        }
        for (j = 0; j < rule[7]; j++) {
            step = b + offset + j * INTERACTION_STEP_SIZE;
            if (Read16(step) > data.motionCount || Read16(step + 2) > data.messageCount || Read16(step + 4) > 2 ||
                step[6] > data.bubbleCount) {
                return FALSE;
            }
        }
    }
    // The last rule matches always
    rule = b + data.rules + (data.ruleCount - 1) * INTERACTION_RULE_SIZE;
    if (rule[2] != 0 || rule[3] != 0 || rule[4] != 0 || rule[5] != 0 || rule[6] != CHANCE_ALWAYS) {
        return FALSE;
    }
    // A motion: its HeartGold motion, its step count and its steps: the facing, the frames, the x, y and z pixels and
    // whether it cries
    for (i = 0; i < data.motionCount; i++) {
        motion = b + data.motions + i * MOTION_SIZE;
        if (motion[2] == 0 || motion[2] > MOTION_MAX_STEPS) {
            return FALSE;
        }
        for (j = 0; j < motion[2]; j++) {
            step = motion + 4 + j * MOTION_STEP_SIZE;
            if (step[0] > 4 || step[1] == 0 || step[1] > MOTION_STEP_FRAMES || step[5] > 1) {
                return FALSE;
            }
            for (k = 2; k < 5; k++) {
                if ((s8)step[k] < -MOTION_STEP_PIXELS || (s8)step[k] > MOTION_STEP_PIXELS) {
                    return FALSE;
                }
            }
        }
    }
    // A message: its text's offset and its length in words with the end
    for (i = 0; i < data.messageCount; i++) {
        message = b + data.messages + i * MESSAGE_SIZE;
        offset = Read32(message);
        words = Read16(message + 4);
        if (words == 0 || words > MESSAGE_WORDS || offset % 2 != 0 || !InRange(offset, words * 2, size) ||
            !TextValid(b + offset, words, TEXT_ALLOW_NAMES)) {
            return FALSE;
        }
    }
    // A bubble: its HeartGold emote, its 4 steps, its first emote, two a bubble, and its steps' frames shown and frame
    for (i = 0; i < data.bubbleCount; i++) {
        bubble = b + data.bubbles + i * BUBBLE_SIZE;
        if (bubble[0] == 0 || bubble[0] > MAX_BUBBLES || bubble[1] != FOLLOWING_BUBBLE_STEPS ||
            Read16(bubble + 2) != i * 2) {
            return FALSE;
        }
        for (j = 0; j < FOLLOWING_BUBBLE_STEPS; j++) {
            if (Read16(bubble + 4 + j * 2) == 0 || Read16(bubble + 4 + j * 2) > MOTION_STEP_FRAMES ||
                bubble[12 + j] > 1) {
                return FALSE;
            }
        }
    }
    *out = data;
    return TRUE;
}

s32 FollowingReactions_Choose(const FollowingInteractions *data, const FollowingReactionSnapshot *snapshot, u32 *rng) {
    u32 hp = GetHpCondition(snapshot);
    u32 status = GetStatusCondition(snapshot->status);
    const u8 *rule;
    u32 roll;
    u32 i;

    if (data->bytes == NULL || !CanReact(snapshot, hp)) {
        return -1;
    }
    for (i = 0; i < data->ruleCount; i++) {
        rule = data->bytes + data->rules + i * INTERACTION_RULE_SIZE;
        // HeartGold rolls each rule's chance before it checks the rule's conditions
        roll = NextRandom(rng) % 100;
        if (roll < rule[6] && ConditionsMet(rule + 2, snapshot, hp, status)) {
            return i;
        }
    }
    return -1;
}

BOOL FollowingReactions_GetStep(const FollowingInteractions *data, u32 rule, u32 step, FollowingReactionStep *out) {
    const u8 *r;
    const u8 *s;

    if (rule >= data->ruleCount) {
        return FALSE;
    }
    r = data->bytes + data->rules + rule * INTERACTION_RULE_SIZE;
    if (step >= r[7]) {
        return FALSE;
    }
    s = data->bytes + Read32(r + 8) + step * INTERACTION_STEP_SIZE;
    out->motion = Read16(s);
    out->message = Read16(s + 2);
    out->cry = Read16(s + 4);
    out->bubble = s[6];
    out->wait = s[7];
    return TRUE;
}

u32 FollowingReactions_GetText(const FollowingInteractions *data, u32 message,
                               const FollowingReactionSnapshot *snapshot, u16 *out, u32 capacity) {
    const u8 *m;

    if (capacity == 0 || message == 0 || message > data->messageCount) {
        return 0;
    }
    m = data->bytes + data->messages + (message - 1) * MESSAGE_SIZE;
    return ExpandText(data->bytes + Read32(m), Read16(m + 4), snapshot, NULL, out, capacity);
}

BOOL FollowingReactions_GetBubble(const FollowingInteractions *data, u32 bubble, FollowingBubble *out) {
    const u8 *b;
    u32 i;

    if (bubble == 0 || bubble > data->bubbleCount) {
        return FALSE;
    }
    b = data->bytes + data->bubbles + (bubble - 1) * BUBBLE_SIZE;
    out->emote = Read16(b + 2);
    for (i = 0; i < FOLLOWING_BUBBLE_STEPS; i++) {
        out->durations[i] = Read16(b + 4 + i * 2);
        out->frames[i] = b[12 + i];
    }
    return TRUE;
}

BOOL FollowingReactions_TickMotion(const FollowingInteractions *data, u32 motion, FollowingReactionMotion *state,
                                   BOOL grounded, BOOL *cry) {
    const u8 *m;
    const u8 *s;

    *cry = FALSE;
    if (motion == 0 || motion > data->motionCount) {
        return FALSE;
    }
    m = data->bytes + data->motions + (motion - 1) * MOTION_SIZE;
    if (state->index >= m[2]) {
        return FALSE;
    }
    s = m + 4 + state->index * MOTION_STEP_SIZE;
    // A step turns the follower and moves it when it starts
    if (state->age == 0) {
        if (s[0] != 0) {
            state->face = s[0] - 1;
        }
        state->x += (s8)s[2] * FX32_ONE;
        if (!grounded) {
            state->y += (s8)s[3] * FX32_ONE;
        }
        state->z += (s8)s[4] * FX32_ONE;
        *cry = s[5];
    }
    if (++state->age >= s[1]) {
        state->age = 0;
        state->index++;
    }
    return TRUE;
}

// A dialogue rule: the zone, the species, the form, the type, the four conditions, the chance, the motion before the
// text, the text's offset and its length in words, the motion after it, and in version 3 the tile bounds' mask and the
// bounds
BOOL FollowingReactions_ValidateDialogues(FollowingContextRules *out, const void *bytes, u32 size) {
    const u8 *b = bytes;
    const u8 *rule;
    u32 abi;
    u32 ruleSize;
    u32 count;
    u32 text;
    u32 words;
    u32 i;

    out->bytes = NULL;
    out->size = 0;
    out->ruleCount = out->ruleSize = 0;
    // The original read the file from a NARC of one member, which it checked; it is now the member itself
    if (b == NULL || size < CONTEXT_HEADER_SIZE || size > FOLLOWING_CONTEXT_CAPACITY ||
        !IsMagic(b, 'F', 'W', 'C', 'D') || Read16(b + 4) < 1 || Read16(b + 4) > 3 || Read32(b + 8) != size ||
        CalcCrc(b + CONTEXT_HEADER_SIZE, size - CONTEXT_HEADER_SIZE) != Read32(b + 12)) {
        return FALSE;
    }
    abi = Read16(b + 4);
    ruleSize = abi == 3 ? DIALOGUE_BOUNDED_RULE_SIZE : DIALOGUE_RULE_SIZE;
    count = Read16(b + 6);
    if (CONTEXT_HEADER_SIZE + count * ruleSize > size) {
        return FALSE;
    }
    for (i = 0; i < count; i++) {
        rule = b + CONTEXT_HEADER_SIZE + i * ruleSize;
        text = Read32(rule + 12);
        words = Read16(rule + 16);
        // Version 1 has no motions, and only version 3 has tile bounds
        if (!ConditionsValid(rule + 6) || rule[10] == 0 || rule[10] > CHANCE_ALWAYS ||
            rule[11] > FOLLOWING_CONTEXT_MOTIONS || rule[18] > FOLLOWING_CONTEXT_MOTIONS ||
            (abi == 3 ? !BoundsValid(rule + 20, rule[19]) : rule[19] != 0) ||
            (abi == 1 && (rule[11] != 0 || rule[18] != 0)) || words == 0 || words > FOLLOWING_TEXT_CAPACITY ||
            text & 1 || text < CONTEXT_HEADER_SIZE + count * ruleSize || text > size || words * 2 > size - text ||
            !TextValid(b + text, words, TEXT_ALLOW_NAMES | TEXT_ALLOW(TEXT_ZONE))) {
            return FALSE;
        }
    }
    out->bytes = b;
    out->size = size;
    out->ruleCount = count;
    out->ruleSize = ruleSize;
    return TRUE;
}

s32 FollowingReactions_ChooseDialogue(const FollowingContextRules *data, const FollowingReactionSnapshot *snapshot,
                                      u32 *rng) {
    u32 hp;
    u32 status;
    const u8 *rule;
    u32 zone;
    u32 species;
    u32 roll;
    u32 i;

    if (data == NULL || data->bytes == NULL || snapshot->pokemon.egg || snapshot->pokemon.species == 0 ||
        snapshot->pokemon.species > FOLLOWING_MAX_SPECIES) {
        return -1;
    }
    hp = GetHpCondition(snapshot);
    status = GetStatusCondition(snapshot->status);
    if (hp == 0 || snapshot->direction > 3) {
        return -1;
    }
    for (i = 0; i < data->ruleCount; i++) {
        rule = data->bytes + CONTEXT_HEADER_SIZE + i * data->ruleSize;
        zone = Read16(rule);
        species = Read16(rule + 2);
        roll = NextRandom(rng) % 100;
        if ((data->ruleSize != DIALOGUE_BOUNDED_RULE_SIZE || BoundsMet(rule + 20, rule[19], snapshot)) &&
            roll < rule[10] && (zone == 0 || zone == snapshot->zone) &&
            (species == 0 || species == snapshot->pokemon.species) &&
            (rule[4] == ANY_VALUE || rule[4] == snapshot->pokemon.form) &&
            (rule[5] == ANY_VALUE || rule[5] == snapshot->type1 || rule[5] == snapshot->type2) &&
            ConditionsMet(rule + 6, snapshot, hp, status)) {
            return i;
        }
    }
    return -1;
}

BOOL FollowingReactions_GetDialogueStep(const FollowingContextRules *data, u32 rule, u32 step,
                                        FollowingReactionStep *out) {
    const u8 *r;
    u32 before;
    u32 after;
    u32 motion = 0;

    if (data == NULL || data->bytes == NULL || rule >= data->ruleCount) {
        return FALSE;
    }
    r = data->bytes + CONTEXT_HEADER_SIZE + rule * data->ruleSize;
    before = r[11];
    after = r[18];
    if (before != 0) {
        if (step == 0) {
            motion = before;
        } else {
            step--;
        }
    }
    if (motion == 0) {
        // The text, then the motion after it
        if (step == 0) {
            out->motion = 0;
            out->message = 1;
            out->cry = 0;
            out->bubble = 0;
            out->wait = TRUE;
            return TRUE;
        }
        if (step != 1 || after == 0) {
            return FALSE;
        }
        motion = after;
    }
    out->motion = motion;
    out->message = 0;
    out->cry = 1;
    out->bubble = 0;
    out->wait = TRUE;
    return TRUE;
}

u32 FollowingReactions_GetDialogueText(const FollowingContextRules *data, u32 rule,
                                       const FollowingReactionSnapshot *snapshot, u16 *out, u32 capacity) {
    const u8 *r;

    if (data == NULL || data->bytes == NULL || rule >= data->ruleCount || capacity == 0) {
        return 0;
    }
    r = data->bytes + CONTEXT_HEADER_SIZE + rule * data->ruleSize;
    return ExpandText(data->bytes + Read32(r + 12), Read16(r + 16), snapshot, NULL, out, capacity);
}

// A gift rule: the zone, the species, the item, the claim slot, the form, the type, the four conditions, the quantity,
// the item name's offset and length in words, the text's offset and length, the tile bounds' mask (0 in version 1),
// and in version 2 the bounds
BOOL FollowingReactions_ValidateGifts(FollowingContextRules *out, const void *bytes, u32 size) {
    const u8 *b = bytes;
    const u8 *rule;
    u32 ruleSize;
    u32 count;
    u32 floor;
    u32 name;
    u32 nameWords;
    u32 text;
    u32 textWords;
    u32 i;

    out->bytes = NULL;
    out->size = 0;
    out->ruleCount = out->ruleSize = 0;
    // The original read the file from a NARC of one member, which it checked; it is now the member itself
    if (b == NULL || size < CONTEXT_HEADER_SIZE || size > FOLLOWING_CONTEXT_CAPACITY ||
        !IsMagic(b, 'F', 'W', 'T', 'I') || (Read16(b + 4) != 1 && Read16(b + 4) != 2) || Read32(b + 8) != size ||
        CalcCrc(b + CONTEXT_HEADER_SIZE, size - CONTEXT_HEADER_SIZE) != Read32(b + 12)) {
        return FALSE;
    }
    ruleSize = Read16(b + 4) == 2 ? GIFT_BOUNDED_RULE_SIZE : GIFT_RULE_SIZE;
    count = Read16(b + 6);
    floor = CONTEXT_HEADER_SIZE + count * ruleSize;
    if (floor > size) {
        return FALSE;
    }
    for (i = 0; i < count; i++) {
        rule = b + CONTEXT_HEADER_SIZE + i * ruleSize;
        name = Read32(rule + 14);
        nameWords = Read16(rule + 18);
        text = Read32(rule + 20);
        textWords = Read16(rule + 24);
        // A gift of a form is of a species, and only version 2 has tile bounds
        if (rule[6] >= GIFT_SLOTS || Read16(rule + 4) == 0 || rule[13] == 0 ||
            (rule[7] != ANY_VALUE && Read16(rule + 2) == 0) || (rule[8] > GIFT_TYPES && rule[8] != ANY_VALUE) ||
            !ConditionsValid(rule + 9) ||
            (ruleSize == GIFT_BOUNDED_RULE_SIZE ? !BoundsValid(rule + 28, Read16(rule + 26))
                                                : Read16(rule + 26) != 0) ||
            nameWords == 0 || nameWords > FOLLOWING_TEXT_CAPACITY || textWords == 0 ||
            textWords > FOLLOWING_TEXT_CAPACITY || name % 2 != 0 || text % 2 != 0 || name < floor || text < floor ||
            name + nameWords * 2 > size || text + textWords * 2 > size || !TextValid(b + name, nameWords, 0) ||
            !TextValid(b + text, textWords, TEXT_ALLOW_NAMES | TEXT_ALLOW(TEXT_ZONE) | TEXT_ALLOW(TEXT_ITEM))) {
            return FALSE;
        }
    }
    out->bytes = b;
    out->size = size;
    out->ruleCount = count;
    out->ruleSize = ruleSize;
    return TRUE;
}

// Whether the follower meets a gift rule's conditions besides its slot and tile bounds
static BOOL GiftConditionsMet(const u8 *rule, const FollowingReactionSnapshot *snapshot) {
    u32 hp = GetHpCondition(snapshot);
    u32 status = GetStatusCondition(snapshot->status);

    return CanReact(snapshot, hp) && (Read16(rule) == 0 || Read16(rule) == snapshot->zone) &&
           (Read16(rule + 2) == 0 || Read16(rule + 2) == snapshot->pokemon.species) &&
           (rule[7] == ANY_VALUE || rule[7] == snapshot->pokemon.form) &&
           (rule[8] == ANY_VALUE || rule[8] == snapshot->type1 || rule[8] == snapshot->type2) &&
           ConditionsMet(rule + 9, snapshot, hp, status);
}

BOOL FollowingReactions_ChooseGift(const FollowingContextRules *data, const FollowingReactionSnapshot *snapshot,
                                   u16 claims, FollowingGiftChoice *out) {
    const u8 *rule;
    u32 i;

    if (data == NULL || data->bytes == NULL || out == NULL) {
        return FALSE;
    }
    for (i = 0; i < data->ruleCount; i++) {
        rule = data->bytes + CONTEXT_HEADER_SIZE + i * data->ruleSize;
        if (!(claims & (1u << rule[6])) &&
            (data->ruleSize != GIFT_BOUNDED_RULE_SIZE || BoundsMet(rule + 28, Read16(rule + 26), snapshot)) &&
            GiftConditionsMet(rule, snapshot)) {
            out->slot = rule[6];
            out->quantity = rule[13];
            out->item = Read16(rule + 4);
            out->rule = i;
            return TRUE;
        }
    }
    return FALSE;
}

// Gift rule's item name, ending in 0xFFFF: its length, or 0 when it doesn't fit capacity
static u32 GetGiftItemName(const FollowingContextRules *data, u32 rule, u16 *out, u32 capacity) {
    const u8 *r;
    const u8 *text;
    u32 n = 0;
    u32 c;
    u32 i;

    if (data == NULL || rule >= data->ruleCount || out == NULL || capacity == 0) {
        return 0;
    }
    r = data->bytes + CONTEXT_HEADER_SIZE + rule * data->ruleSize;
    text = data->bytes + Read32(r + 14);
    for (i = 0; i < Read16(r + 18); i++) {
        c = Read16(text + i * 2);
        if (c == TEXT_END) {
            break;
        }
        if (n + 1 >= capacity) {
            return 0;
        }
        out[n++] = c;
    }
    out[n] = TEXT_END;
    return n;
}

u32 FollowingReactions_GetGiftText(const FollowingContextRules *data, u32 rule,
                                   const FollowingReactionSnapshot *snapshot, u16 *out, u32 capacity) {
    const u8 *r;
    u16 name[FOLLOWING_TEXT_CAPACITY];

    if (data == NULL || rule >= data->ruleCount || snapshot == NULL || out == NULL || capacity == 0) {
        return 0;
    }
    r = data->bytes + CONTEXT_HEADER_SIZE + rule * data->ruleSize;
    if (GetGiftItemName(data, rule, name, FOLLOWING_TEXT_CAPACITY) == 0) {
        return 0;
    }
    return ExpandText(data->bytes + Read32(r + 20), Read16(r + 24), snapshot, name, out, capacity);
}
