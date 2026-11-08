// The ROM names this file zukan_detail.c.
#include "types.h"
#include "app/pokedex_detail.h"
#include "constants/arc.h"
#include "gfl/fade.h"
#include "gfl/heap.h"
#include "gfl/net.h"
#include "gfl/proc.h"
#include "gfl/std.h"
#include "gfl/tcb.h"
#include "save/pokedex_savedata.h"
#include "system/game_data.h"
#include "system/gf_font.h"
#include "system/printsys.h"

#ifdef PAPERWHITE2
#include "gfl/bg_sys.h"
#include "gfl/gx_layers.h"
#include "nitro/gx.h"
#endif

// The Pokédex's detail screen: sets up the bars and the systems that its pages share, and runs the page that the bars
// switch to

typedef struct {
    HeapID heapId;
    PokedexDetailGraphic *graphic;
    Font *font;
    PrintQueue *printQueue;
    TCB *vblankTcb;
    PokedexDetailTouchbar *touchbar;
    PokedexDetailHeadbar *headbar;
    PokedexDetailCommon *common;
    PokedexDetailProcSys *procSys;
    void *pageParam;
    // The page to switch to once the current one has exited, or POKEDEX_DETAIL_PAGE_NONE
    int nextPage;
#ifdef PAPERWHITE2
    // Whether the main engine drives the top screen, as on the info page, and the step of a change of it
    BOOL mainOnTop;
    int layoutStep;
#endif
} PokedexDetailWork;

#ifdef PAPERWHITE2
// Paper White 2: the info page shows the main engine, the only one with 3D, on the top screen, and the other pages show
// it on the bottom screen as the original does. A change moves the bars to the engines of their screens: the touch bar
// first, drawn on the hidden head bar's BG while that BG is hidden, then the screens swap in the VBlank, and the head
// bar moves to the touch bar's old BG in the next frame, before the new page shows it. Every page change leaves the
// head bar hidden, so nothing shows on the wrong screen
enum {
    LAYOUT_STEP_NONE,
    LAYOUT_STEP_MOVE_TOUCHBAR,
    LAYOUT_STEP_SWAP,
    LAYOUT_STEP_MOVE_HEADBAR,
};
#endif

static BOOL PokedexDetail_Init(GameProc *proc, u32 *state, void *param, void *work);
static BOOL PokedexDetail_Exit(GameProc *proc, u32 *state, void *param, void *work);
static BOOL PokedexDetail_Main(GameProc *proc, u32 *state, void *param, void *work);
static void PokedexDetail_VBlank(TCB *tcb, void *data);
static void PokedexDetail_StartPage(PokedexDetailParam *param, PokedexDetailWork *wk);
#ifdef PAPERWHITE2
static void PokedexDetail_UpdateLayout(PokedexDetailWork *wk);
#endif

const GameProcFunctions POKEDEX_DETAIL_PROC_FUNCTIONS = { PokedexDetail_Init, PokedexDetail_Main, PokedexDetail_Exit };

static BOOL PokedexDetail_Init(GameProc *proc, u32 *state, void *param_, void *work) {
    PokedexDetailParam *param = param_;
    PokedexDetailWork *wk;

#ifdef PAPERWHITE2
    // Paper White 2: 64 KB more, for the info page's sub-pages and its next sprite, which loads while the shown one
    // stays (paperwhite2_pokedex_info.c). The Pokédex opens this screen with about 700 KB of HEAPID_USER free; opened
    // from the party and summary screens (paperwhite2/pokedex_shortcut.h), it leaves about 710 KB of it free
    GFL_HeapCreateChild(HEAPID_USER, HEAPID_POKEDEX_DETAIL, 0xa0000);
#else
    GFL_HeapCreateChild(HEAPID_USER, HEAPID_POKEDEX_DETAIL, 0x90000);
#endif
    wk = GFL_ProcInitSubsystem(proc, sizeof(PokedexDetailWork), HEAPID_POKEDEX_DETAIL);
    MI_CpuFill8(wk, 0, sizeof(PokedexDetailWork));
    wk->heapId = HEAPID_POKEDEX_DETAIL;
    param->result = POKEDEX_DETAIL_RESULT_CLOSE;

    // The graphics are created with the 3D system and freed at once, then created for good without it
    wk->graphic = PokedexDetailGraphic_Create(0, wk->heapId, TRUE);
    PokedexDetailGraphic_Free(wk->graphic);
    wk->graphic = PokedexDetailGraphic_Create(0, wk->heapId, FALSE);
    wk->font = GFL_FontCreate(ARCID_FONT, 0, 0, FALSE, wk->heapId);
    wk->printQueue = PrintQueue_CreateDefault(wk->heapId);
    wk->vblankTcb = GFL_VBlankTCBAdd(PokedexDetail_VBlank, wk, 1);
    wk->touchbar =
        PokedexDetailTouchbar_Create(wk->heapId, PokeDex_IsGiven(GameData_GetPokedex(param->gameData)), param->mode);
    wk->headbar = PokedexDetailHeadbar_Create(wk->heapId, wk->font);
    wk->common = PokedexDetailCommon_Create(wk->heapId, param->gameData, wk->graphic, wk->font, wk->printQueue,
                                            wk->touchbar, wk->headbar, param->list, param->count, &param->index);
#ifdef PAPERWHITE2
    // Paper White 2: a party Pokémon's page shows that Pokémon (paperwhite2/pokedex_shortcut.h)
    wk->common->pokemon = param->pokemon;
#endif
    wk->procSys = NULL;
    wk->pageParam = NULL;
    PokedexDetail_StartPage(param, wk);
    wk->nextPage = POKEDEX_DETAIL_PAGE_NONE;

    GFL_FadeSet(3, 0, 0, 0);
    GFL_NetSetIconScreen(TRUE, wk->heapId);
    return TRUE;
}

static BOOL PokedexDetail_Exit(GameProc *proc, u32 *state, void *param, void *work) {
    PokedexDetailWork *wk = work;

    GFL_FadeSet(3, 16, 16, 0);
#ifdef PAPERWHITE2
    // Paper White 2: leaves the main engine on the bottom screen, as the original does, with the screens black
    if (wk->mainOnTop) {
        GFL_BGSysSetDisplayLayout(GX_DISP_SELECT_SUB_MAIN);
        GFL_NetSetIconScreen(TRUE, wk->heapId);
    }
#endif
    if (wk->procSys != NULL) {
        PokedexDetailProcSys_Free(wk->procSys);
    }
    if (wk->pageParam != NULL) {
        GFL_HeapFree(wk->pageParam);
    }
    PokedexDetailCommon_Free(wk->common);
    PokedexDetailHeadbar_Free(wk->headbar);
    PokedexDetailTouchbar_Free(wk->touchbar);
    GFL_TCBRemove(wk->vblankTcb);
    PrintQueue_Clear(wk->printQueue);
    PrintQueue_Free(wk->printQueue);
    GFL_FontFree(wk->font);
    PokedexDetailGraphic_Free(wk->graphic);
    GFL_ProcReleaseSubsystem(proc);
    GFL_HeapDelete(HEAPID_POKEDEX_DETAIL);
    return TRUE;
}

static BOOL PokedexDetail_Main(GameProc *proc, u32 *state, void *param_, void *work) {
    PokedexDetailParam *param = param_;
    PokedexDetailWork *wk = work;
    BOOL pageChanged = FALSE;
    int command;

    // The state counts the first frames, and the original compares it as signed
    if ((int)*state <= 8) {
        (*state)++;
    }

#ifdef PAPERWHITE2
    PokedexDetail_UpdateLayout(wk);
#endif
    if (PokedexDetailProcSys_Main(wk->procSys, wk->common)) {
        if (wk->nextPage != POKEDEX_DETAIL_PAGE_NONE) {
            param->page = wk->nextPage;
            PokedexDetail_StartPage(param, wk);
            wk->nextPage = POKEDEX_DETAIL_PAGE_NONE;
            pageChanged = TRUE;
        } else {
            return TRUE;
        }
    }

    if (!pageChanged) {
        command = PokedexDetailTouchbar_GetTrigger(wk->touchbar);
        if (command == POKEDEX_DETAIL_CMD_NONE) {
            command = PokedexDetailTouchbar_GetTouch(wk->touchbar);
        }
        PokedexDetailProcSys_Command(wk->procSys, wk->common, command);
        switch (command) {
        case POKEDEX_DETAIL_CMD_CLOSE:
            param->result = POKEDEX_DETAIL_RESULT_CLOSE;
            break;
        case POKEDEX_DETAIL_CMD_RETURN:
            param->result = POKEDEX_DETAIL_RESULT_RETURN;
            break;
        case POKEDEX_DETAIL_CMD_INFO:
            wk->nextPage = POKEDEX_DETAIL_PAGE_INFO;
            break;
        case POKEDEX_DETAIL_CMD_MAP:
            wk->nextPage = POKEDEX_DETAIL_PAGE_MAP;
            break;
        case POKEDEX_DETAIL_CMD_VOICE:
            wk->nextPage = POKEDEX_DETAIL_PAGE_VOICE;
            break;
        case POKEDEX_DETAIL_CMD_FORM:
            wk->nextPage = POKEDEX_DETAIL_PAGE_FORM;
            break;
        case POKEDEX_DETAIL_CMD_MAP_PLACE_TOUCH:
            param->place = ((PokedexDetailMapParam *)wk->pageParam)->place;
            param->result = POKEDEX_DETAIL_RESULT_PLACE;
            break;
        }
    }

    PokedexDetailTouchbar_Update(wk->touchbar);
    PokedexDetailHeadbar_Update(wk->headbar);
    PrintQueue_Main(wk->printQueue);
    PokedexDetailGraphic_Update(wk->graphic);
    PokedexDetailGraphic_Begin3D(wk->graphic);
    if (!pageChanged) {
        PokedexDetailProcSys_Draw(wk->procSys, wk->common);
    }
    PokedexDetailGraphic_End3D(wk->graphic);
    return FALSE;
}

static void PokedexDetail_VBlank(TCB *tcb, void *data) {
#ifdef PAPERWHITE2
    PokedexDetailWork *wk = data;

    // Paper White 2: swaps the screens once the touch bar is on the engine of its new screen, showing it there and
    // hiding its old BG on the other screen
    if (wk->layoutStep == LAYOUT_STEP_SWAP) {
        GFL_BGSysSetDisplayLayout(wk->mainOnTop ? GX_DISP_SELECT_MAIN_SUB : GX_DISP_SELECT_SUB_MAIN);
        GFL_BGSysSetBGEnabled(wk->mainOnTop ? 5 : 1, TRUE);
        GFL_BGSysSetBGEnabled(wk->mainOnTop ? 1 : 5, FALSE);
        wk->layoutStep = LAYOUT_STEP_MOVE_HEADBAR;
    }
#endif
}

static void PokedexDetail_StartPage(PokedexDetailParam *param, PokedexDetailWork *wk) {
    const PokedexDetailProcFuncs *funcs;

    if (wk->procSys != NULL) {
        PokedexDetailProcSys_Free(wk->procSys);
    }
    if (wk->pageParam != NULL) {
        GFL_HeapFree(wk->pageParam);
    }

    switch (param->page) {
    case POKEDEX_DETAIL_PAGE_INFO: {
        PokedexDetailInfoParam *pageParam =
            GFL_HeapAllocate(wk->heapId, sizeof(PokedexDetailInfoParam), TRUE, "zukan_detail.c", 462);
        PokedexDetailInfo_InitParam(pageParam, wk->heapId);
        wk->pageParam = pageParam;
        funcs = &POKEDEX_DETAIL_INFO_PROC_FUNCS;
        break;
    }
    case POKEDEX_DETAIL_PAGE_MAP: {
        PokedexDetailMapParam *pageParam =
            GFL_HeapAllocate(wk->heapId, sizeof(PokedexDetailMapParam), TRUE, "zukan_detail.c", 470);
        PokedexDetailMap_InitParam(pageParam, wk->heapId);
        wk->pageParam = pageParam;
        funcs = &POKEDEX_DETAIL_MAP_PROC_FUNCS;
        break;
    }
    case POKEDEX_DETAIL_PAGE_VOICE: {
        PokedexDetailVoiceParam *pageParam =
            GFL_HeapAllocate(wk->heapId, sizeof(PokedexDetailVoiceParam), TRUE, "zukan_detail.c", 478);
        PokedexDetailVoice_InitParam(pageParam, wk->heapId);
        wk->pageParam = pageParam;
        funcs = &POKEDEX_DETAIL_VOICE_PROC_FUNCS;
        break;
    }
    case POKEDEX_DETAIL_PAGE_FORM: {
        PokedexDetailFormParam *pageParam =
            GFL_HeapAllocate(wk->heapId, sizeof(PokedexDetailFormParam), TRUE, "zukan_detail.c", 486);
        PokedexDetailForm_InitParam(pageParam, wk->heapId);
        wk->pageParam = pageParam;
        funcs = &POKEDEX_DETAIL_FORM_PROC_FUNCS;
        break;
    }
    }

    wk->procSys = PokedexDetailProcSys_Create(funcs, wk->pageParam, wk->heapId);
#ifdef PAPERWHITE2
    // Paper White 2: the info page swaps the engines' screens, from the next frame (PokedexDetail_UpdateLayout)
    if (wk->mainOnTop != (param->page == POKEDEX_DETAIL_PAGE_INFO)) {
        wk->mainOnTop = param->page == POKEDEX_DETAIL_PAGE_INFO;
        wk->layoutStep = LAYOUT_STEP_MOVE_TOUCHBAR;
    }
#endif
}

#ifdef PAPERWHITE2
// Paper White 2: the steps of a change of the screens' engines before and after the VBlank that swaps them. The old
// page has exited a frame before, so no OBJ of it is in the OAM, and the head bar is hidden
static void PokedexDetail_UpdateLayout(PokedexDetailWork *wk) {
    // BG 1 of the engine that drives the bottom screen after the swap, and of the one that drives the top screen
    u8 bottomBG = wk->mainOnTop ? 5 : 1;
    u8 topBG = wk->mainOnTop ? 1 : 5;

    switch (wk->layoutStep) {
    case LAYOUT_STEP_MOVE_TOUCHBAR:
        GFL_BGSysSetBGEnabled(bottomBG, FALSE);
        GFL_BGSysClearScr(bottomBG);
        PokedexDetailTouchbar_SetBG(wk->touchbar, bottomBG);
        wk->layoutStep = LAYOUT_STEP_SWAP;
        break;
    case LAYOUT_STEP_MOVE_HEADBAR:
        GFL_BGSysClearScr(topBG);
        PokedexDetailHeadbar_SetBG(wk->headbar, topBG);
        GFL_BGSysSetBGEnabled(topBG, TRUE);
        GFL_NetSetIconScreen(TRUE, wk->heapId);
        wk->layoutStep = LAYOUT_STEP_NONE;
        break;
    }
}
#endif
