#include "types.h"
#include "app/monolith/monolith_tool.h"
#include "constants/arc.h"
#include "constants/script_text_banks.h"
#include "constants/sound.h"
#include "gfl/arc_util.h"
#include "gfl/bg_sys.h"
#include "gfl/bmp.h"
#include "gfl/bmpwin.h"
#include "gfl/gx_layers.h"
#include "gfl/heap.h"
#include "gfl/key.h"
#include "gfl/msg.h"
#include "gfl/proc.h"
#include "gfl/sound.h"
#include "gfl/std.h"
#include "gfl/str.h"
#include "gfl/touchpanel.h"
#include "gfl/ui.h"
#include "nitro/gx.h"
#include "paperwhite2/entralink_buffs.h"
#include "paperwhite2/entralink_progress.h"
#include "paperwhite2/entralink_records.h"
#include "paperwhite2/entree_menu.h"
#include "system/bmp_menulist.h"
#include "system/bmp_menuwork.h"
#include "system/gf_font.h"
#include "system/printsys.h"
#include "system/wordset.h"
#include "text/system/btl_main_title.h"

// Paper White 2: the Entree's lists (include/paperwhite2/entree_menu.h): Nightmares, Bosses, Special, Catchable, Buffs
// and Hall of Fame, a list on the bottom screen and the entry under its cursor described on the top screen. A plain
// list for now; a Pokédex-like screen with art may take its place

// The strings' length, a number's most digits, and the most entries a list holds (the buffs' catalogue is the longest)
#define TEXT_LENGTH 512
#define LINE_LENGTH 128
#define NUMBER_DIGITS 5
#define LIST_MAX 160

// The words the list's text uses: the buffs' bank's go up to ENTRALINK_BUFF_WORD_VALUE + 4
#define WORD_COUNT 28
#define WORD_LENGTH 64

// An entry's id in the list: an index of its kind's table, or for the hall of fame a Pokémon (from 0) or a gold
// (HALL_GOLD + its slot); NOTHING for the entry of an empty list
#define HALL_GOLD 0x100
#define NOTHING 0xffff

// The description of the entry under the cursor, which the list writes and the top screen shows: the list's name, the
// text, and whether it changed since it was shown. The list's proc owns the strings
typedef struct {
    StrBuf *title;
    StrBuf *text;
    BOOL changed;
} EntreeInfo;

static EntreeInfo sInfo;

// ---- The description, on top ----------------------------------------------------------------------------------------

// The BGs of the text and of the background, and the background's file (the pass powers' description screen's)
#define INFO_BG_TEXT 0
#define INFO_BG 2
#define INFO_SCREEN_FILE 14

enum {
    INFO_WINDOW_TITLE,
    INFO_WINDOW_TEXT,
    INFO_WINDOW_COUNT,
};

typedef struct {
    BmpWin *windows[INFO_WINDOW_COUNT];
    PrintWindow prints[INFO_WINDOW_COUNT];
} EntreeInfoWork;

static const BGSetup sInfoBGSetups[2] = {
    { 0, 0, 0x800, 0, BGRES_256x256, GX_BG_COLORMODE_16, GX_BG_SCRBASE(0x1000), GX_BG_CHARBASE(0x0c000), 0x8000,
      GX_BG_EXTPLTT_01, 2, GX_BG_AREAOVER_XLU, FALSE },
    { 0, 0, 0x800, 0, BGRES_256x256, GX_BG_COLORMODE_16, GX_BG_SCRBASE(0x2000), GX_BG_CHARBASE(0x04000), 0x8000,
      GX_BG_EXTPLTT_01, 3, GX_BG_AREAOVER_XLU, FALSE },
};

static BmpWin *EntreeInfo_CreateWindow(u32 bg, u8 x, u8 y, u8 width, u8 height, PrintWindow *print) {
    BmpWin *window = BmpWin_CreateDynamic(bg, x, y, width, height, 13, TRUE);

    BmpWin_FlushChar(window);
    BmpWin_FlushMap(window);
    PrintWindow_Init(print, window);
    return window;
}

// Shows the description if it changed
static void EntreeInfo_Update(MonolithWork *wk, EntreeInfoWork *iw) {
    int i;

    if (sInfo.changed && sInfo.text != NULL) {
        sInfo.changed = FALSE;
        for (i = 0; i < INFO_WINDOW_COUNT; i++) {
            GFL_BitmapFill(BmpWin_GetBitmap(iw->windows[i]), 0);
            BmpWin_FlushChar(iw->windows[i]);
        }
        PrintWindow_PrintNoColor(&iw->prints[INFO_WINDOW_TITLE], wk->printQueue, 0, 4, sInfo.title, wk->font);
        PrintWindow_PrintNoColor(&iw->prints[INFO_WINDOW_TEXT], wk->printQueue, 0, 0, sInfo.text, wk->font);
    }
    for (i = 0; i < INFO_WINDOW_COUNT; i++) {
        PrintWindow_Flush(&iw->prints[i], wk->printQueue);
    }
}

static BOOL EntreeInfo_Init(GameProc *proc, u32 *state, void *param, void *work) {
    MonolithScreenParam *screen = param;
    EntreeInfoWork *iw = GFL_ProcInitSubsystem(proc, sizeof(EntreeInfoWork), HEAPID_MONOLITH);

    MI_CpuFill8(iw, 0, sizeof(EntreeInfoWork));
    GFL_BGSysCreateBG(INFO_BG_TEXT, &sInfoBGSetups[0], BGMODE_TEXT);
    GFL_BGSysCreateBG(INFO_BG, &sInfoBGSetups[1], BGMODE_TEXT);
    GFL_BGSysFillScrArea(INFO_BG_TEXT, 0, 0, 0, 32, 32, 17);
    GFL_BGSysFillScrArea(INFO_BG, 0, 0, 0, 32, 32, 17);
    loadBGScrToVramByFileNoReserveNegAlign(screen->work->arc, INFO_SCREEN_FILE, INFO_BG, 0, 0, TRUE, HEAPID_MONOLITH);
    iw->windows[INFO_WINDOW_TITLE] = EntreeInfo_CreateWindow(INFO_BG_TEXT, 2, 0, 28, 3, &iw->prints[INFO_WINDOW_TITLE]);
    iw->windows[INFO_WINDOW_TEXT] = EntreeInfo_CreateWindow(INFO_BG_TEXT, 2, 4, 28, 20, &iw->prints[INFO_WINDOW_TEXT]);
    GFL_BGSysLoadScr(INFO_BG);
    GFL_BGSysLoadScr(INFO_BG_TEXT);
    GFL_BGSysSetBGEnabled(INFO_BG_TEXT, TRUE);
    GFL_BGSysSetBGEnabled(INFO_BG, TRUE);
    GFL_BGSysSetBGEnabledA(GX_PLANEMASK_OBJ, TRUE);
    return TRUE;
}

static BOOL EntreeInfo_Main(GameProc *proc, u32 *state, void *param, void *work) {
    MonolithScreenParam *screen = param;

    EntreeInfo_Update(screen->work, work);
    return screen->exiting == TRUE || screen->endTop == TRUE;
}

static BOOL EntreeInfo_Exit(GameProc *proc, u32 *state, void *param, void *work) {
    MonolithScreenParam *screen = param;
    EntreeInfoWork *iw = work;
    int i;

    if (PrintQueue_IsEmpty(screen->work->printQueue) == FALSE) {
        return FALSE;
    }
    GFL_BGSysSetEnabledBGsA(GX_PLANEMASK_BG3);
    for (i = 0; i < INFO_WINDOW_COUNT; i++) {
        BmpWin_Free(iw->windows[i]);
    }
    GFL_BGSysSetBGEnabled(INFO_BG_TEXT, FALSE);
    GFL_BGSysSetBGEnabled(INFO_BG, FALSE);
    GFL_BGSysReleaseBG(INFO_BG_TEXT);
    GFL_BGSysReleaseBG(INFO_BG);
    GFL_ProcReleaseSubsystem(proc);
    return TRUE;
}

const GameProcFunctions ENTREE_INFO_PROC_FUNCTIONS = { EntreeInfo_Init, EntreeInfo_Main, EntreeInfo_Exit };

// ---- The list, on the bottom screen ---------------------------------------------------------------------------------

// The BGs of the list's text and of the background, and the background's file (the monolith's records screen's)
#define LIST_BG_TEXT 4
#define LIST_BG 6
#define LIST_SCREEN_FILE 5

// The list's window and the rows it shows
#define LIST_X 2
#define LIST_Y 1
#define LIST_WIDTH 26
#define LIST_ROWS 10

enum {
    LIST_SEQ_INPUT,
    LIST_SEQ_RETURN,
};

typedef struct {
    MonolithWork *wk;
    EntralinkProgress *progress;
    // ENTREE_ITEM_*
    u32 kind;
    BmpWin *window;
    PrintWindow print;
    BmpMenuList *list;
    ListMenuOption *options;
    MonolithReturnButton returnButton;
    // The text bank of the buffs' cards, the list's words, and strings to build lines, words and labels in
    MsgData *msgBuffs;
    WordSet *wordSet;
    StrBuf *raw;
    StrBuf *line;
    StrBuf *word;
    StrBuf *label;
    u16 ids[LIST_MAX];
    u32 count;
} EntreeListWork;

static const TouchRect sListTouchRects[] = {
    { 172, 188, 232, 248 },
    { TOUCH_RECT_END, 0, 0, 0 },
};

static const BGSetup sListBGSetups[2] = {
    { 0, 0, 0x800, 0, BGRES_256x256, GX_BG_COLORMODE_16, GX_BG_SCRBASE(0x1000), GX_BG_CHARBASE(0x0c000), 0x8000,
      GX_BG_EXTPLTT_01, 2, GX_BG_AREAOVER_XLU, FALSE },
    { 0, 0, 0x800, 0, BGRES_256x256, GX_BG_COLORMODE_16, GX_BG_SCRBASE(0x2000), GX_BG_CHARBASE(0x04000), 0x8000,
      GX_BG_EXTPLTT_01, 3, GX_BG_AREAOVER_XLU, FALSE },
};

// The menu's label of each list, by ENTREE_ITEM_*
static u32 EntreeList_GetTitle(u32 kind) {
    switch (kind) {
    case ENTREE_ITEM_NIGHTMARES:
        return BtlMainTitle_Text_EntreeNightmares;
    case ENTREE_ITEM_BOSSES:
        return BtlMainTitle_Text_EntreeBosses;
    case ENTREE_ITEM_SPECIAL:
        return BtlMainTitle_Text_EntreeSpecial;
    case ENTREE_ITEM_CATCHABLE:
        return BtlMainTitle_Text_EntreeCatchable;
    case ENTREE_ITEM_BUFFS:
        return BtlMainTitle_Text_EntreeBuffs;
    }
    return BtlMainTitle_Text_EntreeHallOfFame;
}

// ---- The text

// A message of a bank with the list's words in it, into dest
static void EntreeList_Format(EntreeListWork *lw, MsgData *msgData, u32 msgId, StrBuf *dest) {
    GFL_MsgDataLoadStrbuf(msgData, msgId, lw->raw);
    GFL_WordSetFormatStrbuf(lw->wordSet, dest, lw->raw);
}

// A message of the monolith's bank added to dest
static void EntreeList_Add(EntreeListWork *lw, u32 msgId, StrBuf *dest) {
    EntreeList_Format(lw, lw->wk->msgMonolith, msgId, lw->line);
    GFL_StrBufConcat(dest, lw->line);
}

static void EntreeList_AddNewline(EntreeListWork *lw, StrBuf *dest) {
    EntreeList_Add(lw, BtlMainTitle_Text_EntreeNewline, dest);
}

// A word set to a message of the monolith's bank
static void EntreeList_SetWordMsg(EntreeListWork *lw, u32 word, u32 msgId) {
    EntreeList_Format(lw, lw->wk->msgMonolith, msgId, lw->word);
    GFL_WordSetSetStrbuf(lw->wordSet, word, lw->word, 0, TRUE, 0);
}

static void EntreeList_SetNumber(EntreeListWork *lw, u32 word, u32 number) {
    WordSetNumber(lw->wordSet, word, number, NUMBER_DIGITS, 0, TRUE);
}

// A species' name, with its form when it isn't the first, into a word
static void EntreeList_SetSpeciesWord(EntreeListWork *lw, u32 word, u32 species, u32 form) {
    if (form == 0) {
        WordSet_LoadSpeciesName(lw->wordSet, word, species);
        return;
    }
    WordSet_LoadSpeciesName(lw->wordSet, 0, species);
    EntreeList_SetNumber(lw, 1, form);
    EntreeList_SetWordMsg(lw, word, BtlMainTitle_Text_EntreeSpecialForm);
}

// A buff card's title or description at a rank (a gold has a message a rank) added to dest; a type card's type is any.
// The bank's titles are in their tier's color, which ends in the field's text color: the monolith's is set back after
static void EntreeList_AddBuffText(EntreeListWork *lw, const EntralinkBuff *buff, u32 first, u32 rank, StrBuf *dest) {
    EntreeList_SetWordMsg(lw, ENTRALINK_BUFF_WORD_TYPE, BtlMainTitle_Text_EntreeAnyType);
    EntreeList_Format(lw, lw->msgBuffs, buff->tier == ENTRALINK_BUFF_TIER_GOLD ? first + rank - 1 : first, lw->line);
    GFL_StrBufConcat(dest, lw->line);
    EntreeList_Add(lw, BtlMainTitle_Text_EntreeTextColor, dest);
}

// The buff of a card key, or ENTRALINK_BUFF_NONE
static u32 EntreeList_FindBuff(u32 key) {
    u32 i;

    for (i = 0; i < Entree_GetBuffCount(); i++) {
        if (Entree_GetBuff(i)->key == key) {
            return i;
        }
    }
    return ENTRALINK_BUFF_NONE;
}

// ---- The entries

// Adds an entry: its label (a message of the monolith's bank, or the line already made when msgId is NOTHING) and id
static void EntreeList_AddEntry(EntreeListWork *lw, u32 msgId, u32 id) {
    if (lw->count >= LIST_MAX) {
        return;
    }
    if (msgId != NOTHING) {
        EntreeList_Format(lw, lw->wk->msgMonolith, msgId, lw->line);
    }
    ListMenuCore_AppendStrBufOption(lw->options, lw->line, lw->count, HEAPID_MONOLITH);
    lw->ids[lw->count++] = id;
}

// A heading the cursor skips
static void EntreeList_AddHeading(EntreeListWork *lw, u32 msgId) {
    EntreeList_Format(lw, lw->wk->msgMonolith, msgId, lw->line);
    ListMenuCore_AppendStrBufOption(lw->options, lw->line, BMPMENULIST_LABEL, HEAPID_MONOLITH);
}

static BOOL EntreeList_IsSeen(const EntralinkRecordEntry *record) {
    return record != NULL && (record->flags & ENTRALINK_RECORD_SEEN);
}

// Nightmares or the special forms: the codex's entries of the kind, unknown until met
static void EntreeList_AddCodex(EntreeListWork *lw, BOOL special) {
    u32 entry;
    u32 i;

    for (i = 0; i < Entree_GetCodexCount(); i++) {
        entry = Entree_GetCodexEntry(i);
        if (((entry & ENTRALINK_RECORDS_CODEX_SPECIAL) != 0) != special) {
            continue;
        }
        if (EntreeList_IsSeen(Entree_FindCodexRecord(lw->progress, entry))) {
            WordSet_LoadSpeciesName(lw->wordSet, 0, ENTRALINK_RECORDS_CODEX_SPECIES(entry));
            EntreeList_AddEntry(lw, BtlMainTitle_Text_EntreeNumber, i);
        } else {
            EntreeList_AddEntry(lw, BtlMainTitle_Text_EntreeUnknown, i);
        }
    }
}

static BOOL EntreeList_IsRoomFound(EntreeListWork *lw, const EntralinkRoom *room) {
    return (lw->progress->records.roomsDiscovered[room->recordId / 8] & (1 << (room->recordId % 8))) != 0;
}

// Bosses: the bosses' and the final rooms of rooms/, by their first enemy, unknown until found
static void EntreeList_AddBosses(EntreeListWork *lw) {
    const EntralinkRoom *room;
    u32 i;

    for (i = 0; i < Entree_GetRoomTableCount(); i++) {
        room = Entree_GetRoomEntry(i);
        if (!Entree_IsRoomOfRooms(room) || room->role == ENTRALINK_ROLE_ROOM || room->battleCount == 0) {
            continue;
        }
        if (EntreeList_IsRoomFound(lw, room)) {
            WordSet_LoadSpeciesName(lw->wordSet, 0, Entree_GetEnemy(Entree_GetBattle(room, 0), 0)->species);
            EntreeList_AddEntry(lw, BtlMainTitle_Text_EntreeNumber, i);
        } else {
            EntreeList_AddEntry(lw, BtlMainTitle_Text_EntreeUnknown, i);
        }
    }
}

// Whether an enemy of the table was listed already (another copy of a catch)
static BOOL EntreeList_HasCatch(EntreeListWork *lw, u32 catchId) {
    u32 i;

    for (i = 0; i < lw->count; i++) {
        if (Entree_GetEnemyEntry(lw->ids[i])->catchId == catchId) {
            return TRUE;
        }
    }
    return FALSE;
}

// Catchable: every enemy of the rooms of rooms/ that can be caught, once a catch
static void EntreeList_AddCatchable(EntreeListWork *lw) {
    const EntralinkRoom *room;
    const EntralinkBattle *battle;
    const EntralinkEnemy *enemy;
    u32 i;
    u32 j;
    u32 k;

    for (i = 0; i < Entree_GetRoomTableCount(); i++) {
        room = Entree_GetRoomEntry(i);
        if (!Entree_IsRoomOfRooms(room)) {
            continue;
        }
        for (j = 0; j < room->battleCount; j++) {
            battle = Entree_GetBattle(room, j);
            for (k = 0; k < battle->enemyCount; k++) {
                enemy = Entree_GetEnemy(battle, k);
                if (enemy->catchId == ENTRALINK_NONE || EntreeList_HasCatch(lw, enemy->catchId)) {
                    continue;
                }
                EntreeList_SetSpeciesWord(lw, 0, enemy->species, enemy->form);
                EntreeList_AddEntry(lw, BtlMainTitle_Text_EntreeNumber, enemy - Entree_GetEnemyEntry(0));
            }
        }
    }
}

// Buffs: every card, unknown until offered, its tier's color after
static void EntreeList_AddBuffs(EntreeListWork *lw) {
    const EntralinkBuff *buff;
    u32 i;

    for (i = 0; i < Entree_GetBuffCount(); i++) {
        buff = Entree_GetBuff(i);
        if (EntreeList_IsSeen(Entree_FindRecord(lw->progress->records.cards, ENTRALINK_RECORDS_CARDS_MAX, buff->key))) {
            GFL_StrBufClear(lw->label);
            EntreeList_AddBuffText(lw, buff, buff->title, 1, lw->label);
            GFL_StrBufCopy(lw->line, lw->label);
            EntreeList_AddEntry(lw, NOTHING, i);
        } else {
            EntreeList_AddEntry(lw, BtlMainTitle_Text_EntreeUnknown, i);
        }
    }
}

// Hall of Fame: the best run's turns and tier, its team by their nicknames, then its golds
static void EntreeList_AddHallOfFame(EntreeListWork *lw) {
    const EntralinkRecords *records = &lw->progress->records;
    const EntralinkHallGold *gold;
    BOOL golds = FALSE;
    u32 buff;
    u32 i;

    if (records->bestWinTurns == 0) {
        EntreeList_AddEntry(lw, BtlMainTitle_Text_EntreeHallNone, NOTHING);
        return;
    }
    EntreeList_SetNumber(lw, 0, records->bestWinTurns);
    Entree_SetTierWord(lw->wordSet, 1, records->hallTier);
    EntreeList_AddEntry(lw, BtlMainTitle_Text_EntreeHallTurns, NOTHING);
    for (i = 0; i < ENTRALINK_RECORDS_HALL_MONS; i++) {
        if (records->hallMons[i].species != 0) {
            GFL_StrBufLoadString(lw->line, records->hallMons[i].nickname);
            EntreeList_AddEntry(lw, NOTHING, i);
        }
    }
    for (i = 0; i < ENTRALINK_RECORDS_HALL_GOLDS; i++) {
        gold = &records->hallGolds[i];
        buff = gold->key != 0 ? EntreeList_FindBuff(gold->key) : ENTRALINK_BUFF_NONE;
        if (buff == ENTRALINK_BUFF_NONE) {
            continue;
        }
        if (!golds) {
            EntreeList_AddHeading(lw, BtlMainTitle_Text_EntreeHallGolds);
            golds = TRUE;
        }
        GFL_StrBufClear(lw->label);
        EntreeList_AddBuffText(lw, Entree_GetBuff(buff), Entree_GetBuff(buff)->title, gold->rank, lw->label);
        GFL_StrBufCopy(lw->line, lw->label);
        EntreeList_AddEntry(lw, NOTHING, HALL_GOLD + i);
    }
}

// ---- The descriptions

static void EntreeList_DescribeCodex(EntreeListWork *lw, u32 index, StrBuf *text) {
    u32 entry = Entree_GetCodexEntry(index);
    const EntralinkRecordEntry *record = Entree_FindCodexRecord(lw->progress, entry);

    if (entry & ENTRALINK_RECORDS_CODEX_SPECIAL) {
        EntreeList_SetSpeciesWord(lw, 0, ENTRALINK_RECORDS_CODEX_SPECIES(entry & ~ENTRALINK_RECORDS_CODEX_SPECIAL),
                                  ENTRALINK_RECORDS_CODEX_FORM(entry & ~ENTRALINK_RECORDS_CODEX_SPECIAL));
        EntreeList_Add(lw, BtlMainTitle_Text_EntreeNumber, text);
        EntreeList_AddNewline(lw, text);
    }
    if (!EntreeList_IsSeen(record)) {
        EntreeList_Add(lw, BtlMainTitle_Text_EntreeNotMet, text);
        return;
    }
    EntreeList_SetWordMsg(
        lw, 0, (record->flags & ENTRALINK_RECORD_TAKEN) ? BtlMainTitle_Text_EntreeYes : BtlMainTitle_Text_EntreeNo);
    EntreeList_SetNumber(lw, 1, record->count);
    EntreeList_Add(lw, BtlMainTitle_Text_EntreeCodex, text);
}

// Whether a room's enemy before this one, in its battles' order, is of the same species
static BOOL EntreeList_IsSpeciesNamed(const EntralinkRoom *room, const EntralinkEnemy *enemy) {
    const EntralinkBattle *battle;
    const EntralinkEnemy *other;
    u32 i;
    u32 j;

    for (i = 0; i < room->battleCount; i++) {
        battle = Entree_GetBattle(room, i);
        for (j = 0; j < battle->enemyCount; j++) {
            other = Entree_GetEnemy(battle, j);
            if (other == enemy) {
                return FALSE;
            }
            if (other->species == enemy->species) {
                return TRUE;
            }
        }
    }
    return FALSE;
}

// A room's enemies by name, each species once
static void EntreeList_AddEnemyNames(EntreeListWork *lw, const EntralinkRoom *room, StrBuf *text) {
    const EntralinkBattle *battle;
    const EntralinkEnemy *enemy;
    BOOL first = TRUE;
    u32 i;
    u32 j;

    for (i = 0; i < room->battleCount; i++) {
        battle = Entree_GetBattle(room, i);
        for (j = 0; j < battle->enemyCount; j++) {
            enemy = Entree_GetEnemy(battle, j);
            if (EntreeList_IsSpeciesNamed(room, enemy)) {
                continue;
            }
            if (!first) {
                EntreeList_Add(lw, BtlMainTitle_Text_EntreeSeparator, text);
            }
            first = FALSE;
            WordSet_LoadSpeciesName(lw->wordSet, 0, enemy->species);
            EntreeList_Add(lw, BtlMainTitle_Text_EntreeNumber, text);
        }
    }
}

static void EntreeList_DescribeBoss(EntreeListWork *lw, u32 index, StrBuf *text) {
    const EntralinkRoom *room = Entree_GetRoomEntry(index);
    const EntralinkRecords *records = &lw->progress->records;
    const EntralinkRecordEntry *record;

    EntreeList_Add(
        lw, room->role == ENTRALINK_ROLE_FINAL ? BtlMainTitle_Text_EntreeBossFinal : BtlMainTitle_Text_EntreeBossRound,
        text);
    EntreeList_AddNewline(lw, text);
    if (!EntreeList_IsRoomFound(lw, room)) {
        EntreeList_Add(lw, BtlMainTitle_Text_EntreeNotFound, text);
        return;
    }
    EntreeList_AddEnemyNames(lw, room, text);
    EntreeList_AddNewline(lw, text);
    record = Entree_FindRecord(records->bosses, ENTRALINK_RECORDS_BOSSES_MAX, room->recordId + 1);
    if (record == NULL || record->count == 0) {
        EntreeList_Add(lw, BtlMainTitle_Text_EntreeBossNever, text);
        return;
    }
    EntreeList_SetNumber(lw, 0, record->count);
    EntreeList_SetNumber(lw, 1, records->bossBestTurns[record - records->bosses]);
    EntreeList_Add(lw, BtlMainTitle_Text_EntreeBoss, text);
}

static BOOL EntreeList_MeetsRequirement(EntreeListWork *lw, u32 requirement) {
    if (requirement == ENTRALINK_REQUIRE_RUN_COMPLETED) {
        return EntralinkProgress_IsRunCompleted(lw->progress);
    }
    return EntralinkProgress_IsBattleWon(lw->progress, requirement);
}

// A catch's state: caught, locked with the battles to win first, or catchable now
static void EntreeList_DescribeCatch(EntreeListWork *lw, u32 index, StrBuf *text) {
    const EntralinkEnemy *enemy = Entree_GetEnemyEntry(index);
    const EntralinkBattle *battle;
    BOOL locked = FALSE;
    u32 requirement;
    u32 i;

    if (EntralinkProgress_IsCaught(lw->progress, enemy->catchId)) {
        EntreeList_Add(lw, BtlMainTitle_Text_EntreeCaught, text);
        return;
    }
    for (i = 0; i < enemy->requirementCount; i++) {
        requirement = Entree_GetRequirement(enemy, i);
        if (EntreeList_MeetsRequirement(lw, requirement)) {
            continue;
        }
        if (!locked) {
            EntreeList_Add(lw, BtlMainTitle_Text_EntreeLocked, text);
            locked = TRUE;
        }
        EntreeList_AddNewline(lw, text);
        battle = requirement != ENTRALINK_REQUIRE_RUN_COMPLETED ? Entree_FindBattle(requirement) : NULL;
        if (battle == NULL) {
            EntreeList_Add(lw, BtlMainTitle_Text_EntreeFinishRun, text);
        } else {
            WordSet_LoadSpeciesName(lw->wordSet, 0, Entree_GetEnemy(battle, 0)->species);
            EntreeList_Add(lw, BtlMainTitle_Text_EntreeBattleOf, text);
        }
    }
    if (!locked) {
        EntreeList_Add(lw, BtlMainTitle_Text_EntreeCatchableNow, text);
    }
}

// A card: unknown until offered, its name once offered, its descriptions at every rank once taken
static void EntreeList_DescribeBuff(EntreeListWork *lw, u32 index, StrBuf *text) {
    const EntralinkBuff *buff = Entree_GetBuff(index);
    const EntralinkRecordEntry *record =
        Entree_FindRecord(lw->progress->records.cards, ENTRALINK_RECORDS_CARDS_MAX, buff->key);
    u32 rank;

    if (!EntreeList_IsSeen(record)) {
        EntreeList_Add(lw, BtlMainTitle_Text_EntreeNotOffered, text);
        return;
    }
    if (!(record->flags & ENTRALINK_RECORD_TAKEN)) {
        EntreeList_Add(lw, BtlMainTitle_Text_EntreeOffered, text);
        return;
    }
    if (buff->tier == ENTRALINK_BUFF_TIER_GOLD) {
        for (rank = 1; rank <= buff->maxLevel; rank++) {
            EntreeList_AddBuffText(lw, buff, buff->title, rank, text);
            EntreeList_AddNewline(lw, text);
            EntreeList_AddBuffText(lw, buff, buff->description, rank, text);
            EntreeList_AddNewline(lw, text);
        }
    } else {
        EntreeList_AddBuffText(lw, buff, buff->description, 1, text);
        EntreeList_AddNewline(lw, text);
    }
    EntreeList_SetNumber(lw, 0, record->count);
    EntreeList_Add(lw, BtlMainTitle_Text_EntreeTaken, text);
}

static void EntreeList_DescribeHallOfFame(EntreeListWork *lw, u32 id, StrBuf *text) {
    const EntralinkRecords *records = &lw->progress->records;
    const EntralinkHallMon *mon;
    const EntralinkHallGold *gold;

    if (id >= HALL_GOLD) {
        gold = &records->hallGolds[id - HALL_GOLD];
        EntreeList_AddBuffText(lw, Entree_GetBuff(EntreeList_FindBuff(gold->key)),
                               Entree_GetBuff(EntreeList_FindBuff(gold->key))->description, gold->rank, text);
        return;
    }
    mon = &records->hallMons[id];
    EntreeList_SetSpeciesWord(lw, 0, mon->species, mon->form);
    EntreeList_SetWordMsg(lw, 1, mon->shiny ? BtlMainTitle_Text_EntreeHallShiny : BtlMainTitle_Text_EntreeEmpty);
    if (mon->item != 0) {
        loadItemNameToStrbuf(lw->wordSet, 2, mon->item);
    } else {
        EntreeList_SetWordMsg(lw, 2, BtlMainTitle_Text_EntreeHallNoItem);
    }
    EntreeList_Add(lw, BtlMainTitle_Text_EntreeHallMon, text);
}

// The description of the entry under the cursor, for the top screen
static void EntreeList_Describe(EntreeListWork *lw, u32 value) {
    u32 id = lw->ids[value];

    GFL_StrBufClear(sInfo.text);
    if (id != NOTHING) {
        switch (lw->kind) {
        case ENTREE_ITEM_NIGHTMARES:
        case ENTREE_ITEM_SPECIAL:
            EntreeList_DescribeCodex(lw, id, sInfo.text);
            break;
        case ENTREE_ITEM_BOSSES:
            EntreeList_DescribeBoss(lw, id, sInfo.text);
            break;
        case ENTREE_ITEM_CATCHABLE:
            EntreeList_DescribeCatch(lw, id, sInfo.text);
            break;
        case ENTREE_ITEM_BUFFS:
            EntreeList_DescribeBuff(lw, id, sInfo.text);
            break;
        default:
            EntreeList_DescribeHallOfFame(lw, id, sInfo.text);
            break;
        }
    }
    sInfo.changed = TRUE;
}

static void EntreeList_CursorCallback(BmpMenuList *list, s32 value, u8 init) {
    EntreeListWork *lw = BmpMenuList_GetWork(list);

    if (value >= 0 && value < lw->count) {
        EntreeList_Describe(lw, value);
    }
    if (!init) {
        GFL_SndSEPlay(SEQ_SE_SELECT1);
    }
}

// ---- The proc

static const BmpMenuListHeader sListHeader = {
    NULL,
    NULL,
    NULL,
    0,
    LIST_ROWS,
    0,
    12,
    0,
    0,
    15,
    0,
    2,
    0,
    0,
    BMPMENULIST_SKIP_LR_KEY,
    0,
    BMPMENULIST_CURSOR_SHOW,
    NULL,
    0,
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    2,
};

static void EntreeList_Create(MonolithScreenParam *screen, EntreeListWork *lw) {
    MonolithWork *wk = screen->work;
    BmpMenuListHeader header = sListHeader;

    lw->wk = wk;
    lw->progress = Entree_GetProgress(screen);
    lw->kind = screen->state->menuCursor;
    lw->msgBuffs = GFL_MsgSysLoadData(FALSE, ARCID_SCRIPT_MESSAGE, SCRIPT_TEXT_ENTRALINK_BUFFS, HEAPID_MONOLITH);
    lw->wordSet = GFL_WordSetSystemCreate(WORD_COUNT, WORD_LENGTH, HEAPID_MONOLITH);
    lw->raw = GFL_StrBufCreate(TEXT_LENGTH, HEAPID_MONOLITH);
    lw->line = GFL_StrBufCreate(TEXT_LENGTH, HEAPID_MONOLITH);
    lw->word = GFL_StrBufCreate(LINE_LENGTH, HEAPID_MONOLITH);
    lw->label = GFL_StrBufCreate(LINE_LENGTH, HEAPID_MONOLITH);
    sInfo.title = GFL_StrBufCreate(LINE_LENGTH, HEAPID_MONOLITH);
    sInfo.text = GFL_StrBufCreate(TEXT_LENGTH, HEAPID_MONOLITH);
    EntreeList_Format(lw, wk->msgMonolith, EntreeList_GetTitle(lw->kind), sInfo.title);
    lw->options = ListMenuCore_CreateOptionList(LIST_MAX + 2, HEAPID_MONOLITH);
    switch (lw->kind) {
    case ENTREE_ITEM_NIGHTMARES:
        EntreeList_AddCodex(lw, FALSE);
        break;
    case ENTREE_ITEM_SPECIAL:
        EntreeList_AddCodex(lw, TRUE);
        break;
    case ENTREE_ITEM_BOSSES:
        EntreeList_AddBosses(lw);
        break;
    case ENTREE_ITEM_CATCHABLE:
        EntreeList_AddCatchable(lw);
        break;
    case ENTREE_ITEM_BUFFS:
        EntreeList_AddBuffs(lw);
        break;
    default:
        EntreeList_AddHallOfFame(lw);
        break;
    }
    if (lw->count == 0) {
        EntreeList_AddEntry(lw, BtlMainTitle_Text_EntreeNothing, NOTHING);
    }
    lw->window = BmpWin_CreateDynamic(LIST_BG_TEXT, LIST_X, LIST_Y, LIST_WIDTH, LIST_ROWS * 2, 13, TRUE);
    PrintWindow_Init(&lw->print, lw->window);
    header.options = lw->options;
    header.count = ListMenuCore_GetFirstFreeIndex(lw->options);
    header.maxShown = header.count < LIST_ROWS ? header.count : LIST_ROWS;
    header.cursorCallback = EntreeList_CursorCallback;
    header.work = lw;
    header.fontSizeX = 12;
    header.fontSizeY = GFL_FontGetCharHeight(wk->font);
    header.printWindow = &lw->print;
    header.queue = wk->printQueue;
    header.font = wk->font;
    lw->list = BmpMenuList_Create(&header, 0, 0, HEAPID_MONOLITH);
    BmpMenuList_LoadCursor(lw->list, HEAPID_MONOLITH);
    BmpWin_FlushMap(lw->window);
}

static void EntreeList_Free(EntreeListWork *lw) {
    BmpMenuList_Free(lw->list, NULL, NULL);
    ListMenuCore_FreeOptionList(lw->options);
    BmpWin_Free(lw->window);
    sInfo.changed = FALSE;
    GFL_StrBufFree(sInfo.text);
    sInfo.text = NULL;
    GFL_StrBufFree(sInfo.title);
    sInfo.title = NULL;
    GFL_StrBufFree(lw->label);
    GFL_StrBufFree(lw->word);
    GFL_StrBufFree(lw->line);
    GFL_StrBufFree(lw->raw);
    GFL_WordSetSystemFree(lw->wordSet);
    GFL_MsgDataFree(lw->msgBuffs);
}

static BOOL EntreeList_Init(GameProc *proc, u32 *state, void *param, void *work) {
    MonolithScreenParam *screen = param;
    EntreeListWork *lw = GFL_ProcInitSubsystem(proc, sizeof(EntreeListWork), HEAPID_MONOLITH);

    MI_CpuFill8(lw, 0, sizeof(EntreeListWork));
    GFL_BGSysCreateBG(LIST_BG_TEXT, &sListBGSetups[0], BGMODE_TEXT);
    GFL_BGSysCreateBG(LIST_BG, &sListBGSetups[1], BGMODE_TEXT);
    GFL_BGSysFillScrArea(LIST_BG_TEXT, 0, 0, 0, 32, 32, 17);
    GFL_BGSysFillScrArea(LIST_BG, 0, 0, 0, 32, 32, 17);
    loadBGScrToVramByFileNoReserveNegAlign(screen->work->arc, LIST_SCREEN_FILE, LIST_BG, 0, 0, TRUE, HEAPID_MONOLITH);
    EntreeList_Create(screen, lw);
    MonolithTool_CreateReturnButton(screen->work, &lw->returnButton);
    GFL_BGSysLoadScr(LIST_BG);
    GFL_BGSysLoadScr(LIST_BG_TEXT);
    GFL_BGSysSetBGEnabled(LIST_BG_TEXT, TRUE);
    GFL_BGSysSetBGEnabled(LIST_BG, TRUE);
    GFL_BGSysSetBGEnabledB(GX_PLANEMASK_OBJ, TRUE);
    return TRUE;
}

static BOOL EntreeList_Main(GameProc *proc, u32 *state, void *param, void *work) {
    MonolithScreenParam *screen = param;
    EntreeListWork *lw = work;
    s32 picked;

    if (screen->exiting == TRUE) {
        return TRUE;
    }
    PrintWindow_Flush(&lw->print, screen->work->printQueue);
    MonolithTool_UpdateReturnButton(&lw->returnButton);
    switch (*state) {
    case LIST_SEQ_INPUT:
        if (GFL_HIDGetTouchPressedRect(sListTouchRects) != TOUCH_RECT_NONE) {
            picked = BMPMENULIST_CANCEL;
            GCTX_HIDSetUsingTouch(TRUE);
        } else if (PrintQueue_IsEmpty(screen->work->printQueue)) {
            picked = BmpMenuList_Update(lw->list);
        } else {
            break;
        }
        if (picked == BMPMENULIST_CANCEL) {
            MonolithTool_PressReturnButton(&lw->returnButton);
            GFL_SndSEPlay(SEQ_SE_CANCEL1);
            (*state)++;
        }
        break;
    case LIST_SEQ_RETURN:
        if (MonolithTool_IsReturnButtonBlinking(&lw->returnButton) == FALSE) {
            screen->next = ENTREE_SCREEN_MENU;
            return TRUE;
        }
        break;
    }
    return FALSE;
}

static BOOL EntreeList_Exit(GameProc *proc, u32 *state, void *param, void *work) {
    MonolithScreenParam *screen = param;
    EntreeListWork *lw = work;

    if (PrintQueue_IsEmpty(screen->work->printQueue) == FALSE) {
        return FALSE;
    }
    GFL_BGSysSetEnabledBGsB(GX_PLANEMASK_BG3);
    MonolithTool_DeleteReturnButton(&lw->returnButton);
    EntreeList_Free(lw);
    GFL_BGSysSetBGEnabled(LIST_BG_TEXT, FALSE);
    GFL_BGSysSetBGEnabled(LIST_BG, FALSE);
    GFL_BGSysReleaseBG(LIST_BG_TEXT);
    GFL_BGSysReleaseBG(LIST_BG);
    GFL_ProcReleaseSubsystem(proc);
    return TRUE;
}

const GameProcFunctions ENTREE_LIST_PROC_FUNCTIONS = { EntreeList_Init, EntreeList_Main, EntreeList_Exit };
