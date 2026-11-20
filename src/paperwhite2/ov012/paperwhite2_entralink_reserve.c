#include "types.h"
#include "app/box2.h"
#include "app/box2_main.h"
#include "constants/arc.h"
#include "constants/pokemon.h"
#include "constants/script_text_banks.h"
#include "field/field_event.h"
#include "field/field_msgbg.h"
#include "field/field_script.h"
#include "gfl/heap.h"
#include "gfl/msg.h"
#include "gfl/std.h"
#include "gfl/str.h"
#include "paperwhite2/entralink_progress.h"
#include "paperwhite2/entralink_reserve.h"
#include "paperwhite2/entralink_run_actions.h"
#include "paperwhite2/entralink_run_config.h"
#include "paperwhite2/entralink_run_party.h"
#include "paperwhite2/entralink_run_state.h"
#include "pml/poke_party.h"
#include "save/box.h"
#include "save/player_info.h"
#include "save/pokedex_savedata.h"
#include "save/trainer_data_savedata.h"
#include "system/bmp_menuwork.h"
#include "system/game_data.h"
#include "system/game_event.h"
#include "system/game_system.h"
#include "system/str_tool.h"
#include "system/wordset.h"
#include "text/script/global_10490.h"

// Paper White 2: the Entralink's Reserve Box and the rest stops' swaps, in overlay 12 beside the run (phase 7). See
// include/paperwhite2/entralink_reserve.h and docs/paperwhite2/design/entralink-buffs.md, "Phase 7"

// A list line's strings, and the most options a script's list menu holds (InitListMenu's), the last kept for the
// script's own (Cancel)
#define LINE_LENGTH 64
#define LIST_OPTIONS_MAX 32
// The digits of a level in a list line, and of a count in a message
#define LEVEL_DIGITS 3
#define COUNT_DIGITS 2
// The PC Box's species flags (Box2Param's unk20, a bit per species): every species, so the pick refuses only eggs
#define SPECIES_FLAG_BYTES 0x100

// The PC Box's pick, and where its callback puts the position
typedef struct {
    Box2Param box;
    u8 *speciesFlags;
    u16 *result;
} ReservePickWork;

static EntralinkProgress *EntralinkReserve_GetProgress(GameData *gameData) {
    return EntralinkProgress_Get(GameData_GetSaveControl(gameData));
}

// The box Pokémon of a Reserve Box slot as it is now, and its box in *box (if not NULL); NULL for a free slot, or one
// whose Pokémon isn't in the boxes any more (released, or moved into the party), which frees the slot
static BoxPkm *EntralinkReserve_GetPkm(GameData *gameData, u32 slot, u32 *box) {
    EntralinkProgress *progress = EntralinkReserve_GetProgress(gameData);
    BoxPkm *pkm;

    if (slot >= ENTRALINK_RESERVE_MAX || !(progress->reserveSlots & (1 << slot))) {
        return NULL;
    }
    pkm = EntralinkRun_FindBoxPkm(gameData, progress->reservePids[slot], box);
    if (pkm == NULL) {
        progress->reserveSlots &= ~(1 << slot);
        progress->reservePids[slot] = 0;
    }
    return pkm;
}

// Whether a reserved Pokémon can join the run: not an egg, and not one that joined it already
static BOOL EntralinkReserve_CanJoin(BoxPkm *pkm) {
    return !PML_PkmGetParam(pkm, PKM_PARAM_IS_EGG, NULL) &&
           !EntralinkRun_HasJoined(PML_PkmGetParam(pkm, PKM_PARAM_PID, NULL));
}

// How many of the Reserve Box's Pokémon are in the boxes (or, with joinable, can join the run)
static u32 EntralinkReserve_Count(GameData *gameData, BOOL joinable) {
    BoxPkm *pkm;
    u32 count = 0;
    u32 slot;

    for (slot = 0; slot < ENTRALINK_RESERVE_MAX; slot++) {
        pkm = EntralinkReserve_GetPkm(gameData, slot, NULL);
        if (pkm != NULL && (!joinable || EntralinkReserve_CanJoin(pkm))) {
            count++;
        }
    }
    return count;
}

// Adds a slot's Pokémon to the open list menu: its name and level, with its species and box as its description
static BOOL EntralinkReserve_AddOption(FieldScriptEnv *env, MsgData *msgData, WordSet *wordSet, BoxPkm *pkm, u32 box,
                                       u32 slot) {
    ScriptListMenu *menu = &env->subwork->listMenu;
    HeapID heapId = FieldScriptEnv_GetHeapID(env);
    u32 index = ListMenuCore_GetFirstFreeIndex(menu->options);
    StrBuf *format;
    StrBuf *label;

    if (index >= LIST_OPTIONS_MAX - 1) {
        return FALSE;
    }
    format = GFL_StrBufCreate(LINE_LENGTH, heapId);
    label = GFL_StrBufCreate(LINE_LENGTH, heapId);
    loadBoxPokemonNameToStrbuf(wordSet, 0, pkm);
    WordSetNumber(wordSet, 1, PML_PkmGetLevel(pkm), LEVEL_DIGITS, 0, TRUE);
    setBoxPokemonSpeciesNameToStrbuf(wordSet, 2, pkm);
    loadBoxNameForDisplay(wordSet, 3, GameData_GetBoxSaveAccessor(FieldScriptEnv_GetGameData(env)), box);
    GFL_MsgDataLoadStrbuf(msgData, Global10490_Text_RunReserveEntryInfo, format);
    GFL_WordSetFormatStrbuf(wordSet, label, format);
    menu->descriptions[index] = GFL_StrBufClone(label, heapId);
    GFL_MsgDataLoadStrbuf(msgData, Global10490_Text_RunReserveEntry, format);
    GFL_WordSetFormatStrbuf(wordSet, label, format);
    AppendListMenuOption(menu->options, label, slot, heapId);
    GFL_StrBufFree(label);
    GFL_StrBufFree(format);
    return TRUE;
}

static u32 EntralinkReserve_AddOptions(FieldScriptEnv *env, BOOL joinable) {
    GameData *gameData = FieldScriptEnv_GetGameData(env);
    HeapID heapId = FieldScriptEnv_GetHeapID(env);
    MsgData *msgData = GFL_MsgSysLoadData(FALSE, ARCID_SCRIPT_MESSAGE, SCRIPT_TEXT_GLOBAL_10490, heapId);
    WordSet *wordSet = GFL_WordSetSystemCreateDefault(heapId);
    BoxPkm *pkm;
    u32 added = 0;
    u32 slot;
    u32 box;

    for (slot = 0; slot < ENTRALINK_RESERVE_MAX; slot++) {
        pkm = EntralinkReserve_GetPkm(gameData, slot, &box);
        if (pkm == NULL || joinable && !EntralinkReserve_CanJoin(pkm)) {
            continue;
        }
        if (EntralinkReserve_AddOption(env, msgData, wordSet, pkm, box, slot)) {
            added++;
        }
    }
    GFL_WordSetSystemFree(wordSet);
    GFL_MsgDataFree(msgData);
    return added;
}

// Puts the position the PC Box's pick chose, or ENTRALINK_RESERVE_NONE
static void EntralinkReserve_FinishPick(void *data) {
    ReservePickWork *work = data;

    if (work->box.tray == BOX2_GET_NONE && work->box.position == BOX2_GET_NONE) {
        *work->result = ENTRALINK_RESERVE_NONE;
    } else {
        *work->result = work->box.tray * BOX_MAX_POS + work->box.position;
    }
    GFL_HeapFree(work->speciesFlags);
    GFL_HeapFree(work);
}

// The PC Box in the Dream World's mode, which only picks a Pokémon, with every species flagged so that it refuses only
// eggs; its title and messages are the Reserve Box's (Box2Param's pick), as the Wonder Trade's pick does
static void EntralinkReserve_CallBox(FieldScriptEnv *env, u16 *result) {
    GameSystem *gsys = FieldScriptEnv_GetGameSystem(env);
    GameData *gameData = GSYS_GetGameData(gsys);
    ReservePickWork *work =
        GFL_HeapAllocate(HEAPID_GAMEEVENT, sizeof(ReservePickWork), TRUE, "paperwhite2_entralink_reserve.c", __LINE__);

    work->result = result;
    work->speciesFlags =
        GFL_HeapAllocate(HEAPID_GAMEEVENT, SPECIES_FLAG_BYTES, FALSE, "paperwhite2_entralink_reserve.c", __LINE__);
    MI_CpuFill8(work->speciesFlags, 0xff, SPECIES_FLAG_BYTES);
    work->box.gameData = gameData;
    work->box.boxes = GameData_GetBoxSaveAccessor(gameData);
    work->box.party = GameData_GetParty(gameData);
    work->box.bag = GameData_GetBag(gameData);
    work->box.playerInfo = GetGameDataPlayerInfo(gameData);
    work->box.trainerData = getTrainerDataBlkAddress(GameData_GetSaveControl(gameData));
    work->box.isNationalDex = PokeDex_IsNationalObtained(GameData_GetPokedex(gameData));
    work->box.unk20 = work->speciesFlags;
    work->box.mode = BOX2_MODE_DREAM_WORLD;
    work->box.pick = BOX2_PICK_RESERVE;
    ScriptWork_CallEvent(FieldScriptEnv_GetScriptWork(env),
                         EventFieldSubprocessCall_CreateWithCallback(gsys, GSYS_GetField(gsys), OVERLAY_BOX2,
                                                                     &BOX2_PROC_FUNCTIONS, &work->box,
                                                                     EntralinkReserve_FinishPick, work));
}

// Reserves the Pokémon at a Box position (box * BOX_MAX_POS + position), with its name in word 0
static u16 EntralinkReserve_Add(FieldScriptEnv *env, u32 index) {
    GameData *gameData = FieldScriptEnv_GetGameData(env);
    EntralinkProgress *progress = EntralinkReserve_GetProgress(gameData);
    BoxSaveAccessor *boxes = GameData_GetBoxSaveAccessor(gameData);
    u32 box = index / BOX_MAX_POS;
    u32 position = index % BOX_MAX_POS;
    BoxPkm *pkm;
    u32 pid;
    u32 slot;

    if (box >= BOX_MAX_TRAY || BoxSaveAccessor_GetPkmParam(boxes, box, position, PKM_PARAM_SPECIES, NULL) == 0) {
        return ENTRALINK_RESERVE_NOT_ADDED;
    }
    pkm = BoxSaveAccessor_GetPkm(boxes, box, position);
    loadBoxPokemonNameToStrbuf(ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env)), 0, pkm);
    if (PML_PkmGetParam(pkm, PKM_PARAM_IS_EGG, NULL)) {
        return ENTRALINK_RESERVE_NOT_ADDED;
    }
    pid = PML_PkmGetParam(pkm, PKM_PARAM_PID, NULL);
    // Counting frees the slots whose Pokémon dropped off
    if (EntralinkReserve_Count(gameData, FALSE) >= ENTRALINK_RUN_RESERVE_SLOTS) {
        return ENTRALINK_RESERVE_FULL;
    }
    for (slot = 0; slot < ENTRALINK_RESERVE_MAX; slot++) {
        if ((progress->reserveSlots & (1 << slot)) && progress->reservePids[slot] == pid) {
            return ENTRALINK_RESERVE_ALREADY;
        }
    }
    for (slot = 0; slot < ENTRALINK_RESERVE_MAX; slot++) {
        if (!(progress->reserveSlots & (1 << slot))) {
            progress->reserveSlots |= 1 << slot;
            progress->reservePids[slot] = pid;
            return ENTRALINK_RESERVE_ADDED;
        }
    }
    return ENTRALINK_RESERVE_FULL;
}

// Whether the copy in a party slot can leave the run in a swap: not an egg, and not fainted
static BOOL EntralinkReserve_CanLeave(GameData *gameData, u32 slot) {
    PokeParty *party = GameData_GetParty(gameData);
    PartyPkm *pkm;

    if (slot >= (u32)PokeParty_GetPkmCount(party)) {
        return FALSE;
    }
    pkm = PokeParty_GetPkm(party, slot);
    return !PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL) && PokeParty_GetParam(pkm, PKM_PARAM_HP, NULL) != 0;
}

static u16 EntralinkReserve_CheckSwap(GameData *gameData) {
    u32 slot;

    if (!EntralinkRun_CanSwap() || EntralinkReserve_Count(gameData, TRUE) == 0) {
        return ENTRALINK_SWAP_NONE;
    }
    if (EntralinkRun_GetState()->dust < ENTRALINK_RUN_SWAP_DUST) {
        return ENTRALINK_SWAP_NO_DUST;
    }
    for (slot = 0; slot < (u32)PokeParty_GetPkmCount(GameData_GetParty(gameData)); slot++) {
        if (EntralinkReserve_CanLeave(gameData, slot)) {
            return ENTRALINK_SWAP_OK;
        }
    }
    return ENTRALINK_SWAP_ALL_FAINTED;
}

// A swap: the slot's Pokémon into the party slot for the swap's Dream Dust, checked again
static BOOL EntralinkReserve_Swap(FieldScriptEnv *env, u32 slot, u32 partySlot) {
    GameData *gameData = FieldScriptEnv_GetGameData(env);
    EntralinkRunState *state = EntralinkRun_GetState();
    BoxPkm *pkm = EntralinkReserve_GetPkm(gameData, slot, NULL);

    if (pkm == NULL || !EntralinkReserve_CanJoin(pkm) || !EntralinkReserve_CanLeave(gameData, partySlot) ||
        state->dust < ENTRALINK_RUN_SWAP_DUST || !EntralinkRun_SwapIn(pkm, partySlot, FieldScriptEnv_GetHeapID(env))) {
        return FALSE;
    }
    state->dust -= ENTRALINK_RUN_SWAP_DUST;
    return TRUE;
}

BOOL EntralinkReserve_Action(FieldScriptEnv *env, u16 action, u16 arg, u16 arg2, u16 *result) {
    GameData *gameData = FieldScriptEnv_GetGameData(env);
    WordSet *wordSet = ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env));
    EntralinkProgress *progress;
    BoxPkm *pkm;
    u32 count;

    switch (action) {
    case ENTRALINK_RUN_ACTION_RESERVE_COUNT:
        if (arg == 1) {
            *result = ENTRALINK_RUN_RESERVE_SLOTS;
        } else {
            count = EntralinkReserve_Count(gameData, FALSE);
            *result = arg == 0 ? count : count < ENTRALINK_RUN_RESERVE_SLOTS ? ENTRALINK_RUN_RESERVE_SLOTS - count : 0;
        }
        WordSetNumber(wordSet, arg2, *result, COUNT_DIGITS, 0, TRUE);
        break;
    case ENTRALINK_RUN_ACTION_RESERVE_ADD_OPTIONS:
        *result = EntralinkReserve_AddOptions(env, arg != 0);
        break;
    case ENTRALINK_RUN_ACTION_RESERVE_PICK_BOX:
        EntralinkReserve_CallBox(env, result);
        return TRUE;
    case ENTRALINK_RUN_ACTION_RESERVE_ADD:
        *result = EntralinkReserve_Add(env, arg);
        break;
    case ENTRALINK_RUN_ACTION_RESERVE_NAME:
        pkm = EntralinkReserve_GetPkm(gameData, arg, NULL);
        *result = pkm != NULL;
        if (pkm != NULL) {
            loadBoxPokemonNameToStrbuf(wordSet, arg2, pkm);
        }
        break;
    case ENTRALINK_RUN_ACTION_RESERVE_REMOVE:
        if (arg < ENTRALINK_RESERVE_MAX) {
            progress = EntralinkReserve_GetProgress(gameData);
            progress->reserveSlots &= ~(1 << arg);
            progress->reservePids[arg] = 0;
        }
        break;
    case ENTRALINK_RUN_ACTION_SWAP_CHECK:
        *result = EntralinkReserve_CheckSwap(gameData);
        break;
    case ENTRALINK_RUN_ACTION_SWAP_CAN_LEAVE:
        *result = EntralinkReserve_CanLeave(gameData, arg);
        break;
    case ENTRALINK_RUN_ACTION_SWAP:
        *result = EntralinkReserve_Swap(env, arg, arg2);
        break;
    }
    return FALSE;
}
