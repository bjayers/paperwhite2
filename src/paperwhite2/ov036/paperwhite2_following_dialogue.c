#include "types.h"
#include "constants/items.h"
#include "field/field.h"
#include "field/field_internal.h"
#include "field/zone.h"
#include "gfl/arc.h"
#include "gfl/heap.h"
#include "gfl/str.h"
#include "paperwhite2/conditions.h"
#include "paperwhite2/following_data.h"
#include "paperwhite2/following_dialogue.h"
#include "paperwhite2/following_field.h"
#include "system/game_data.h"
#include "system/wordset.h"

// Paper White 2: the Following Pokémon's dialogue library and item pools, a/0/4/7 members 4 and 5, which
// tools/paperwhite2/following_dialogue.py packs and documents. A block is checked whole when it is read, and its
// texts' places too, so the talk reads what it was given. See include/paperwhite2/following_dialogue.h

// The end of a text, and the words the word set may add to a text's own when it puts the names in
#define TEXT_END 0xffff
#define TEXT_WORDS_ADDED 64
// The pools' header, magic, version, count and size, and an entry: the item, its weight, how many and three zeros
#define POOLS_HEADER_SIZE 12
#define POOL_HEADER_SIZE 4
#define POOL_ENTRY_SIZE 8
#define POOL_MAX_ENTRIES 128
// The words of the word set
#define WORD_NICKNAME 0
#define WORD_PLAYER 1
#define WORD_PLACE 2
#define WORD_ITEM 3

static const char sFileName[] = "paperwhite2_following_dialogue.c";
static u32 sBlockBytes[FOLLOWING_DIALOGUE_BLOCK_CAPACITY / 4];
static FollowingDialogueHeader sHeader;
// The species whose block is read, or -1 for none; whether it is valid
static s32 sBlockSpecies = -1;
static BOOL sBlockValid;

static u16 Read16(const u8 *p) {
    return p[0] | (u16)p[1] << 8;
}

// Whether a rule's payload ends in its name's 0, after its own size
static BOOL IsNamed(const u8 *payload, u32 start, u32 size) {
    u32 i;

    for (i = start; i < size; i++) {
        if (payload[i] == 0) {
            return TRUE;
        }
    }
    return FALSE;
}

// Whether a text's place is in the texts
static BOOL IsTextValid(u32 text, u32 words) {
    u32 size = sHeader.size - sHeader.texts;

    return words == 0 || (text % 2 == 0 && text <= size && words * 2 <= size - text);
}

static BOOL IsTalkRuleValid(const ConditionTable *table, u32 index) {
    u32 size;
    const FollowingTalkRule *rule = Conditions_GetPayload(table, index, &size);
    const FollowingDialogueStep *step;
    u32 i;

    if (size < sizeof(FollowingTalkRule) || rule->stepCount == 0 ||
        sizeof(FollowingTalkRule) + rule->stepCount * sizeof(FollowingDialogueStep) > size ||
        !IsNamed((const u8 *)rule, sizeof(FollowingTalkRule) + rule->stepCount * sizeof(FollowingDialogueStep), size)) {
        return FALSE;
    }
    for (i = 0; i < rule->stepCount; i++) {
        step = &rule->steps[i];
        if (step->box >= FOLLOWING_BOX_COUNT || step->action >= FOLLOWING_ACTION_COUNT || step->cry > 2 ||
            !IsTextValid(step->text, step->textWords)) {
            return FALSE;
        }
    }
    return TRUE;
}

// Whether a block's table at offset is a valid one, whose rules' payloads are of its kind
static BOOL IsTableValid(const u8 *block, u32 blockSize, u32 kind, u32 offset) {
    const ConditionTable *table = (const ConditionTable *)(block + offset);
    u32 size;
    u32 i;

    if (offset == 0) {
        return TRUE;
    }
    if (offset % 4 != 0 || offset + sizeof(ConditionTable) > blockSize ||
        !Conditions_IsTableValid(table, blockSize - offset)) {
        return FALSE;
    }
    for (i = 0; i < table->ruleCount; i++) {
        if (kind == FOLLOWING_TABLE_TALK) {
            if (!IsTalkRuleValid(table, i)) {
                return FALSE;
            }
            continue;
        }
        Conditions_GetPayload(table, i, &size);
        if (size < sizeof(FollowingPickupRule) ||
            !IsNamed(Conditions_GetPayload(table, i, &size), sizeof(FollowingPickupRule), size)) {
            return FALSE;
        }
    }
    return TRUE;
}

static BOOL ReadBlock(ArcTool *arc, u32 species) {
    u32 length;
    u16 number = 0;
    FollowingDialogueBlockEntry entry;
    const FollowingDialogueBlock *block = (const FollowingDialogueBlock *)sBlockBytes;
    u32 i;

    if (arc == NULL || GFL_ArcToolGetDataMax(arc) <= FOLLOWING_DIALOGUES_FILE) {
        return FALSE;
    }
    length = GFL_ArcToolGetDataLength(arc, FOLLOWING_DIALOGUES_FILE);
    if (length < sizeof(FollowingDialogueHeader)) {
        return FALSE;
    }
    GFL_ArcToolReadRange(arc, FOLLOWING_DIALOGUES_FILE, 0, sizeof(FollowingDialogueHeader), &sHeader);
    if (sHeader.magic != FOLLOWING_DIALOGUE_MAGIC || sHeader.version != FOLLOWING_DIALOGUE_VERSION ||
        sHeader.size != length || sHeader.texts > length || sHeader.bagFullWords == 0 ||
        !IsTextValid(sHeader.bagFullText, sHeader.bagFullWords) ||
        sizeof(FollowingDialogueHeader) + sHeader.speciesCount * sizeof(u16) > sHeader.blocks ||
        sHeader.blocks + sHeader.blockCount * sizeof(FollowingDialogueBlockEntry) > sHeader.texts) {
        return FALSE;
    }
    // A species past the index, or one without rules of its own, has the shared block, number 0
    if (species < sHeader.speciesCount) {
        GFL_ArcToolReadRange(arc, FOLLOWING_DIALOGUES_FILE, sizeof(FollowingDialogueHeader) + species * sizeof(u16),
                             sizeof(u16), &number);
    }
    if (number >= sHeader.blockCount) {
        return FALSE;
    }
    GFL_ArcToolReadRange(arc, FOLLOWING_DIALOGUES_FILE, sHeader.blocks + number * sizeof(FollowingDialogueBlockEntry),
                         sizeof(FollowingDialogueBlockEntry), &entry);
    if (entry.size < sizeof(FollowingDialogueBlock) || entry.size > sizeof(sBlockBytes) ||
        entry.offset > sHeader.texts || entry.size > sHeader.texts - entry.offset) {
        return FALSE;
    }
    GFL_ArcToolReadRange(arc, FOLLOWING_DIALOGUES_FILE, entry.offset, entry.size, sBlockBytes);
    if (block->size != entry.size) {
        return FALSE;
    }
    for (i = 0; i < FOLLOWING_TABLE_COUNT; i++) {
        if (!IsTableValid((const u8 *)sBlockBytes, entry.size, i, block->tables[i])) {
            return FALSE;
        }
    }
    return TRUE;
}

BOOL FollowingDialogue_Load(ArcTool *arc, u32 species) {
    if (sBlockSpecies == (s32)species) {
        return sBlockValid;
    }
    sBlockSpecies = species;
    sBlockValid = ReadBlock(arc, species);
    return sBlockValid;
}

void FollowingDialogue_Unload(void) {
    sBlockSpecies = -1;
    sBlockValid = FALSE;
}

const ConditionTable *FollowingDialogue_GetTable(u32 table) {
    const FollowingDialogueBlock *block = (const FollowingDialogueBlock *)sBlockBytes;

    if (!sBlockValid || table >= FOLLOWING_TABLE_COUNT || block->tables[table] == 0) {
        return NULL;
    }
    return (const ConditionTable *)((const u8 *)sBlockBytes + block->tables[table]);
}

s32 FollowingDialogue_Select(u32 table, const ConditionContext *ctx, u32 *rng) {
    const ConditionTable *rules = FollowingDialogue_GetTable(table);

    if (rules == NULL) {
        return -1;
    }
    return Conditions_Select(rules, ctx, rules->share, rng, NULL);
}

const void *FollowingDialogue_GetRule(u32 table, u32 rule) {
    const ConditionTable *rules = FollowingDialogue_GetTable(table);
    u32 size;

    if (rules == NULL || rule >= rules->ruleCount) {
        return NULL;
    }
    return Conditions_GetPayload(rules, rule, &size);
}

const char *FollowingDialogue_GetName(u32 table, u32 rule) {
    const void *payload = FollowingDialogue_GetRule(table, rule);
    const FollowingTalkRule *talk;

    if (payload == NULL) {
        return "";
    }
    if (table == FOLLOWING_TABLE_TALK) {
        talk = payload;
        return (const char *)&talk->steps[talk->stepCount];
    }
    return ((const FollowingPickupRule *)payload)->name;
}

u32 FollowingDialogue_GetTalkFriendship(void) {
    return sBlockValid ? sHeader.talkFriendship : 0;
}

BOOL FollowingDialogue_GetBagFullText(u32 *text, u32 *words) {
    if (!sBlockValid) {
        return FALSE;
    }
    *text = sHeader.bagFullText;
    *words = sHeader.bagFullWords;
    return TRUE;
}

BOOL FollowingDialogue_FillContext(ConditionContext *ctx, Field *field, PartyPkm *pkm, u32 facing, u32 tileX,
                                   u32 tileY) {
    GameData *gameData = field->gameData;
    FollowingRecord record;

    ConditionContext_Init(ctx);
    ConditionContext_FillWorld(ctx, gameData);
    ConditionContext_FillField(ctx, field);
    ConditionContext_FillParty(ctx, GameData_GetParty(gameData));
    // The rules' terrain is the follower's own tile
    ConditionContext_SetTerrain(ctx, PaperWhite2_FollowingGetTile());
    ConditionContext_SetPosition(ctx, facing, tileX, tileY);
    if (pkm == NULL) {
        return FALSE;
    }
    FollowingRecord_Read(pkm, &record);
    if (!ConditionContext_FillSubject(ctx, pkm, record.steps)) {
        return FALSE;
    }
    ctx->totalSteps = record.totalSteps;
    ctx->itemWaiting = record.itemWaiting;
    return TRUE;
}

WordSet *FollowingDialogue_CreateWords(GameData *gameData, PartyPkm *pkm, u32 zone, u32 item, HeapID heapId) {
    WordSet *wordSet = GFL_WordSetSystemCreateDefault(heapId);

    if (pkm != NULL) {
        loadPokemonNicknameToStrbuf(wordSet, WORD_NICKNAME, pkm);
    }
    copyVarForText(wordSet, WORD_PLAYER, GetGameDataPlayerInfo(gameData));
    loadLocationNameToStrbuf(wordSet, WORD_PLACE, ZoneData_GetPlaceNameID(zone));
    if (item != ITEM_NONE) {
        loadItemNameToStrbuf(wordSet, WORD_ITEM, item);
    }
    return wordSet;
}

StrBuf *FollowingDialogue_ReadText(ArcTool *arc, u32 text, u32 words, WordSet *wordSet, HeapID heapId) {
    u16 *raw;
    StrBuf *source;
    StrBuf *out;

    if (arc == NULL || !sBlockValid || words == 0 || !IsTextValid(text, words)) {
        return NULL;
    }
    raw = GFL_HeapAllocate(heapId, words * sizeof(u16), FALSE, sFileName, __LINE__);
    if (raw == NULL) {
        return NULL;
    }
    GFL_ArcToolReadRange(arc, FOLLOWING_DIALOGUES_FILE, sHeader.texts + text, words * sizeof(u16), raw);
    if (raw[words - 1] != TEXT_END) {
        GFL_HeapFree(raw);
        return NULL;
    }
    source = GFL_StrBufCreate(words, heapId);
    GFL_StrBufLoadString(source, raw);
    GFL_HeapFree(raw);
    out = GFL_StrBufCreate(words + TEXT_WORDS_ADDED, heapId);
    GFL_WordSetFormatStrbuf(wordSet, out, source);
    GFL_StrBufFree(source);
    return out;
}

u32 FollowingDialogue_RollPool(ArcTool *arc, u32 pool, u32 *rng, u32 *quantity, HeapID heapId) {
    u8 header[POOLS_HEADER_SIZE];
    u8 head[POOL_HEADER_SIZE];
    u16 offset;
    u8 *entries;
    u32 length;
    u32 count;
    u32 total = 0;
    u32 pick;
    u32 item = ITEM_NONE;
    u32 i;

    *quantity = 0;
    if (arc == NULL || GFL_ArcToolGetDataMax(arc) <= FOLLOWING_POOLS_FILE) {
        return ITEM_NONE;
    }
    length = GFL_ArcToolGetDataLength(arc, FOLLOWING_POOLS_FILE);
    if (length < POOLS_HEADER_SIZE) {
        return ITEM_NONE;
    }
    GFL_ArcToolReadRange(arc, FOLLOWING_POOLS_FILE, 0, POOLS_HEADER_SIZE, header);
    if (Read16(header) != (FOLLOWING_POOLS_MAGIC & 0xffff) || Read16(header + 2) != FOLLOWING_POOLS_MAGIC >> 16 ||
        Read16(header + 4) != FOLLOWING_DIALOGUE_VERSION || pool >= Read16(header + 6) ||
        POOLS_HEADER_SIZE + (pool + 1) * sizeof(u16) > length) {
        return ITEM_NONE;
    }
    GFL_ArcToolReadRange(arc, FOLLOWING_POOLS_FILE, POOLS_HEADER_SIZE + pool * sizeof(u16), sizeof(u16), &offset);
    if (offset % 4 != 0 || offset + POOL_HEADER_SIZE > length) {
        return ITEM_NONE;
    }
    GFL_ArcToolReadRange(arc, FOLLOWING_POOLS_FILE, offset, POOL_HEADER_SIZE, head);
    count = Read16(head);
    if (count == 0 || count > POOL_MAX_ENTRIES || offset + POOL_HEADER_SIZE + count * POOL_ENTRY_SIZE > length) {
        return ITEM_NONE;
    }
    entries = GFL_HeapAllocate(heapId, count * POOL_ENTRY_SIZE, FALSE, sFileName, __LINE__);
    if (entries == NULL) {
        return ITEM_NONE;
    }
    GFL_ArcToolReadRange(arc, FOLLOWING_POOLS_FILE, offset + POOL_HEADER_SIZE, count * POOL_ENTRY_SIZE, entries);
    for (i = 0; i < count; i++) {
        total += Read16(entries + i * POOL_ENTRY_SIZE + 2);
    }
    if (total != 0) {
        pick = Conditions_Random(rng, total);
        for (i = 0; i < count; i++) {
            const u8 *entry = entries + i * POOL_ENTRY_SIZE;

            if (pick < Read16(entry + 2)) {
                item = Read16(entry);
                *quantity = entry[4];
                break;
            }
            pick -= Read16(entry + 2);
        }
    }
    GFL_HeapFree(entries);
    if (item > ITEM_LAST || *quantity == 0) {
        *quantity = 0;
        return ITEM_NONE;
    }
    return item;
}
