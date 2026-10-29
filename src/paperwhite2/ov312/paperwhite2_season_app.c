#include "types.h"
#include "constants/arc.h"
#include "constants/sound.h"
#include "constants/text_banks.h"
#include "gfl/arc.h"
#include "gfl/arc_util.h"
#include "gfl/bg_sys.h"
#include "gfl/bmp.h"
#include "gfl/bmpwin.h"
#include "gfl/graphics.h"
#include "gfl/gx_layers.h"
#include "gfl/heap.h"
#include "gfl/key.h"
#include "gfl/msg.h"
#include "gfl/proc.h"
#include "gfl/sound.h"
#include "gfl/str.h"
#include "gfl/touchpanel.h"
#include "gfl/ui.h"
#include "nitro/gx.h"
#include "nitro/hw.h"
#include "nitro/mi.h"
#include "nnsys/g2d.h"
#include "paperwhite2/season.h"
#include "paperwhite2/season_app.h"
#include "paperwhite2/season_preview.h"
#include "system/app_taskmenu.h"
#include "system/bmp_menulist.h"
#include "system/bmp_menuwork.h"
#include "system/bmp_winframe.h"
#include "system/game_data.h"
#include "system/gf_font.h"
#include "system/printsys.h"
#include "system/season.h"
#include "system/wipe.h"
#include "text/system/season_app.h"

// Paper White 2: the Season app, which the Pokémon Centers' globe opens in Geonet's place, in Geonet's overlay 312. It
// is built from Geonet's parts (src/ov312/geonet.c): its grid on both screens, its message window, its list menu and
// its touch buttons, without the globe. The top screen shows the setting, the season and the season's banner; on the
// touch screen a list leads to pages of buttons that set the season setting of paperwhite2/season.h. Behind the top
// screen's banner, a 3D preview shows a spot of the field's map in the season (paperwhite2/season_preview.h), or
// Geonet's grid if it doesn't load (docs/paperwhite2/plugins.md, Season app)

// Geonet's heap, which the app takes in its place, at 384 KB, with room for the preview's map, textures and props;
// Geonet's own was 512 KB
#define HEAPID_SEASON_APP 0x7c
#define SEASON_APP_HEAP_SIZE 0x60000

// Geonet's graphics (ARCID_GEONET): its grid, then the app's buttons, a frame laid out as the menus' common archive's
// file 0x20 is, and the palettes of the buttons and of the button of the current setting
#define NARC_GEONET_BG_NCGR 5
#define NARC_GEONET_BG_NCLR 6
#define NARC_GEONET_BG_NSCR 7
#define NARC_GEONET_BUTTON_NCGR 8
#define NARC_GEONET_BUTTON_NCLR 9
#define NARC_GEONET_BUTTON_CURRENT_NCLR 10

// The season banners' files (ARCID_SEASON_BANNER), as EventSeasonBanner_LoadGraphics loads them: a palette,
// characters and a screen for each season
enum {
    BANNER_FILE_NCLR,
    BANNER_FILE_NCGR,
    BANNER_FILE_NSCR,
    BANNER_FILE_COUNT,
};

// The banners' color around the season's name, which the app makes transparent so that the grid or the preview shows
// there
#define BANNER_BACKGROUND_COLOR 1
// The middle of the season's name in the banners' art, which centers it on the screen
#define BANNER_NAME_CENTER_Y 94
// How far the banner is moved up over the preview, so that the season's name is centered in the view above the
// message window, the top screen's first 144 lines, with the preview's shadow behind it
#define BANNER_PREVIEW_OFFSET_Y 22

// The frames that the preview stays dark after it loads a season, while the frame drawn with the last one's textures
// is shown, then the frames it takes to fade in
#define PREVIEW_DARK_FRAMES 2
#define PREVIEW_FADE_FRAMES 6
#define PREVIEW_DARK_BRIGHTNESS -16

// The BGs: on the top screen, the main engine's, the message window over the banner over the 3D preview, or over the
// grid without it, and on the touch screen, the sub engine's, the list and the buttons over the grid
enum {
    BG_TOP_3D = 0,
    BG_TOP_BANNER = 1,
    BG_TOP_TEXT = 2,
    BG_TOP_GRID = 3,
    BG_TOUCH_TEXT = 6,
    BG_TOUCH_GRID = 7,
};

// The priority of the 3D preview's BG, under the banner's
#define BG_TOP_3D_PRIORITY 3

// The palettes: the grid has 0 to 3 of both engines, and the font and the window frames are Geonet's
#define PALETTE_FONT 4
#define FRAME_MESSAGE_CHAR 4
#define FRAME_MESSAGE_PALETTE 6
#define FRAME_MENU_CHAR 0x22
#define FRAME_MENU_PALETTE 7
// The top screen's banner
#define PALETTE_BANNER 8
// The touch screen's buttons: the cursor's and the others', then the same for the button of the current setting
#define PALETTE_BUTTONS 9
#define PALETTE_BUTTON_CURRENT 11

// The color the windows are cleared to, and the height of a line of the message window
#define WINDOW_FILL_COLOR 15
#define MESSAGE_LINE_HEIGHT 16

// The buttons' size in tiles, and the Back button's place, Geonet's Quit button's
#define BUTTON_WIDTH 13
#define BUTTON_HEIGHT 3
#define BACK_BUTTON_X 23
#define BACK_BUTTON_Y 21
#define BACK_BUTTON_WIDTH 9
// The most buttons a page has, with its Back button
#define BUTTON_MAX 6

#define BUTTON_TEXT_COLOR PRINT_COLOR(14, 15, 3)

enum {
    SEQ_INIT,
    SEQ_FADE_IN,
    SEQ_LIST_OPEN,
    SEQ_LIST,
    SEQ_PAGE,
    SEQ_PAGE_PICKED,
    SEQ_FADE_OUT,
    SEQ_END,
};

// The list's items, whose values are the pages they open, and the pages
enum {
    PAGE_SEASON,
    PAGE_DYNAMIC,
    PAGE_HEMISPHERE,
    LIST_CANCEL,
    LIST_ITEM_COUNT,
};

#define PAGE_COUNT LIST_CANCEL
#define PAGE_NONE PAGE_COUNT

typedef struct {
    u8 bg;
    u8 x;
    u8 y;
    u8 width;
    u8 height;
    u8 palette;
} SeasonAppWindowSetup;

// A button of a page: its label, the message once it is picked, the SEASON_MODE_* or HEMISPHERE_* it sets, and its
// place in tiles
typedef struct {
    u32 label;
    u32 confirmation;
    u8 value;
    u8 x;
    u8 y;
} SeasonAppButtonSetup;

typedef struct {
    const SeasonAppButtonSetup *buttons;
    u8 count;
} SeasonAppPage;

typedef struct {
    HeapID heapId;
    GameData *gameData;
    Font *font;
    MsgData *msgData;
    PrintQueue *queue;
    u8 textColors[3];
    BmpWin *messageWindow;
    PrintWindow messagePrint;
    BmpWin *listWindow;
    PrintWindow listPrint;
    BmpMenuList *list;
    ListMenuOption *options;
    // The list's row of the cursor, kept while a page is open
    u16 listRow;
    TouchRect listRects[LIST_ITEM_COUNT + 1];
    AppTaskMenuRes *buttonRes;
    AppTaskMenuRes *currentButtonRes;
    // PAGE_* or PAGE_NONE
    u8 page;
    u8 buttonCount;
    u8 cursor;
    // The season of the message window's text, and the season the banner shows, SEASON_COUNT before the first
    u8 messageSeason;
    u8 bannerSeason;
    AppTaskMenuWin *buttons[BUTTON_MAX];
    TouchRect buttonRects[BUTTON_MAX + 1];
    // The 3D preview, NULL once it fails to load, and the frames left of its fade in after a season loads
    SeasonPreview *preview;
    u8 previewFade;
    // Whether the BGs are on, as they are from the fade in
    u8 bgsEnabled;
} SeasonAppWork;

static BOOL SeasonAppProc_Init(GameProc *proc, u32 *state, void *param, void *procWork);
static BOOL SeasonAppProc_Main(GameProc *proc, u32 *state, void *param, void *procWork);
static BOOL SeasonApp_Main(SeasonAppWork *work, u32 *state);
static BOOL SeasonAppProc_End(GameProc *proc, u32 *state, void *param, void *procWork);
static void SeasonApp_SetVRAMBanks(void);
static void SeasonApp_InitGraphics(HeapID heapId);
static void SeasonApp_FreeGraphics(void);
static void SeasonApp_SetBGsEnabled(SeasonAppWork *work, BOOL enabled);
static void SeasonApp_LoadBGs(SeasonAppWork *work);
static void SeasonApp_LoadGrid(ArcTool *arc, u8 bg, u32 palType, HeapID heapId);
static void SeasonApp_FreeBGs(SeasonAppWork *work);
static BmpWin *SeasonApp_CreateWindow(const SeasonAppWindowSetup *setup);
static void SeasonApp_ClearMessage(SeasonAppWork *work);
static void SeasonApp_PrintLine(SeasonAppWork *work, u32 message, u8 line);
static void SeasonApp_ShowStatus(SeasonAppWork *work);
static void SeasonApp_ShowHemisphere(SeasonAppWork *work);
static void SeasonApp_ShowBanner(SeasonAppWork *work, u8 season);
static void SeasonApp_ShowPreview(SeasonAppWork *work, u8 season);
static void SeasonApp_FreePreview(SeasonAppWork *work);
static void SeasonApp_UpdatePreviewFade(SeasonAppWork *work);
static void SeasonApp_ClearBannerBackground(u8 *chars, u32 size);
static void SeasonApp_UpdatePreview(SeasonAppWork *work);
static void SeasonApp_ListCursorCallback(BmpMenuList *list, s32 value, u8 init);
static void SeasonApp_CreateList(SeasonAppWork *work);
static s32 SeasonApp_UpdateList(SeasonAppWork *work);
static void SeasonApp_FreeList(SeasonAppWork *work);
static void SeasonApp_OpenPage(SeasonAppWork *work, u8 page);
static void SeasonApp_ClosePage(SeasonAppWork *work);
static u8 SeasonApp_GetCurrentValue(SeasonAppWork *work);
static void SeasonApp_CreateButtons(SeasonAppWork *work);
static void SeasonApp_CreateButton(SeasonAppWork *work, u8 index, AppTaskMenuRes *res, u32 label, u32 type, u8 x, u8 y,
                                   u8 width);
static void SeasonApp_FreeButtons(SeasonAppWork *work);
static void SeasonApp_UpdateButtons(SeasonAppWork *work);
static BOOL SeasonApp_UpdatePage(SeasonAppWork *work);
static u8 SeasonApp_FindButton(SeasonAppWork *work, int directionX, int directionY);
static BOOL SeasonApp_PickButton(SeasonAppWork *work);
static void SeasonApp_ApplyButton(SeasonAppWork *work);

// The preview's textures in VRAM A and their palettes in VRAM F, slot 0 of each as the 3D system manages them
static const BGSysVRAMConfig sSeasonAppVRAMConfig = {
    GX_VRAM_BG_128_B, GX_VRAM_BGEXTPLTT_NONE,  GX_VRAM_SUB_BG_128_C,       GX_VRAM_SUB_BGEXTPLTT_NONE,
    GX_VRAM_OBJ_64_E, GX_VRAM_OBJEXTPLTT_NONE, GX_VRAM_SUB_OBJ_16_I,       GX_VRAM_SUB_OBJEXTPLTT_NONE,
    GX_VRAM_TEX_0_A,  GX_VRAM_TEXPLTT_0_F,     GX_OBJVRAMMODE_CHAR_1D_32K, GX_OBJVRAMMODE_CHAR_1D_32K,
};

static const BGSysLCDConfig sSeasonAppLCDConfig = { GX_DISPMODE_GRAPHICS, GX_BGMODE_0, GX_BGMODE_0, TRUE };

// Each engine's BG VRAM has the screens first, then the text's characters, the banner's and the grid's
static const BGSetup sSeasonAppTextBGSetup = {
    0,
    0,
    0x800,
    0,
    BGRES_256x256,
    GX_BG_COLORMODE_16,
    GX_BG_SCRBASE(0x0000),
    GX_BG_CHARBASE(0x04000),
    0x4000,
    GX_BG_EXTPLTT_01,
    0,
    GX_BG_AREAOVER_XLU,
    FALSE,
};
static const BGSetup sSeasonAppBannerBGSetup = {
    0,
    0,
    0x800,
    0,
    BGRES_256x256,
    GX_BG_COLORMODE_16,
    GX_BG_SCRBASE(0x0800),
    GX_BG_CHARBASE(0x08000),
    0x8000,
    GX_BG_EXTPLTT_01,
    2,
    GX_BG_AREAOVER_XLU,
    FALSE,
};
static const BGSetup sSeasonAppGridBGSetup = {
    0,
    0,
    0x800,
    0,
    BGRES_256x256,
    GX_BG_COLORMODE_16,
    GX_BG_SCRBASE(0x1000),
    GX_BG_CHARBASE(0x10000),
    0x4000,
    GX_BG_EXTPLTT_01,
    3,
    GX_BG_AREAOVER_XLU,
    FALSE,
};

// Geonet's message window, at the bottom of the top screen, and the list in the middle of the touch screen
static const SeasonAppWindowSetup sSeasonAppMessageWindow = { BG_TOP_TEXT, 2, 19, 28, 4, PALETTE_FONT };
static const SeasonAppWindowSetup sSeasonAppListWindow = { BG_TOUCH_TEXT, 9, 8, 14, 8, PALETTE_FONT };

static const BmpMenuListHeader sSeasonAppListHeader = {
    NULL,
    NULL,
    NULL,
    LIST_ITEM_COUNT,
    LIST_ITEM_COUNT,
    0,
    12,
    0,
    0,
    1,
    15,
    2,
    0,
    0,
    BMPMENULIST_SKIP_NONE,
    0,
    BMPMENULIST_CURSOR_SHOW,
    NULL,
    0,
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    20,
};

static const u32 sSeasonAppListItems[LIST_ITEM_COUNT] = {
    SeasonApp_Text_SetSeason,
    SeasonApp_Text_DynamicOptions,
    SeasonApp_Text_SetHemisphere,
    SeasonApp_Text_Cancel,
};

// clang-format off
static const SeasonAppButtonSetup sSeasonAppSeasonButtons[] = {
    {SeasonApp_Text_Spring, SeasonApp_Text_ChangeToSpring, SEASON_MODE_SPRING, 2, 5},
    {SeasonApp_Text_Summer, SeasonApp_Text_ChangeToSummer, SEASON_MODE_SUMMER, 17, 5},
    {SeasonApp_Text_Autumn, SeasonApp_Text_ChangeToAutumn, SEASON_MODE_AUTUMN, 2, 10},
    {SeasonApp_Text_Winter, SeasonApp_Text_ChangeToWinter, SEASON_MODE_WINTER, 17, 10},
};

static const SeasonAppButtonSetup sSeasonAppDynamicButtons[] = {
    {SeasonApp_Text_Monthly, SeasonApp_Text_ChangeMonthly, SEASON_MODE_MONTHLY, 2, 3},
    {SeasonApp_Text_Weekly, SeasonApp_Text_ChangeWeekly, SEASON_MODE_WEEKLY, 17, 3},
    {SeasonApp_Text_Daily, SeasonApp_Text_ChangeDaily, SEASON_MODE_DAILY, 2, 8},
    {SeasonApp_Text_RealTime, SeasonApp_Text_ChangeRealTime, SEASON_MODE_REAL_TIME, 17, 8},
    {SeasonApp_Text_Chaos, SeasonApp_Text_ChangeChaos, SEASON_MODE_CHAOS, 9, 13},
};

static const SeasonAppButtonSetup sSeasonAppHemisphereButtons[] = {
    {SeasonApp_Text_Northern, SeasonApp_Text_ChangeNorthern, HEMISPHERE_NORTHERN, 2, 8},
    {SeasonApp_Text_Southern, SeasonApp_Text_ChangeSouthern, HEMISPHERE_SOUTHERN, 17, 8},
};

// clang-format on

static const SeasonAppPage sSeasonAppPages[PAGE_COUNT] = {
    { sSeasonAppSeasonButtons, NELEMS(sSeasonAppSeasonButtons) },
    { sSeasonAppDynamicButtons, NELEMS(sSeasonAppDynamicButtons) },
    { sSeasonAppHemisphereButtons, NELEMS(sSeasonAppHemisphereButtons) },
};

// The real-time mode's message is the northern hemisphere's here
static const u32 sSeasonAppModeMessages[SEASON_MODE_COUNT] = {
    SeasonApp_Text_ModeMonthly, SeasonApp_Text_ModeSpring,           SeasonApp_Text_ModeSummer,
    SeasonApp_Text_ModeAutumn,  SeasonApp_Text_ModeWinter,           SeasonApp_Text_ModeWeekly,
    SeasonApp_Text_ModeDaily,   SeasonApp_Text_ModeRealTimeNorthern, SeasonApp_Text_ModeChaos,
};

static const u32 sSeasonAppCurrentSeasonMessages[SEASON_COUNT] = {
    SeasonApp_Text_CurrentSpring,
    SeasonApp_Text_CurrentSummer,
    SeasonApp_Text_CurrentAutumn,
    SeasonApp_Text_CurrentWinter,
};

const GameProcFunctions SEASON_APP_PROC_FUNCTIONS = { SeasonAppProc_Init, SeasonAppProc_Main, SeasonAppProc_End };

static BOOL SeasonAppProc_Init(GameProc *proc, u32 *state, void *param, void *procWork) {
    SeasonAppWork *work;

    GFL_HeapCreateChild(HEAPID_USER, HEAPID_SEASON_APP, SEASON_APP_HEAP_SIZE);
    work = GFL_ProcInitSubsystem(proc, sizeof(SeasonAppWork), HEAPID_SEASON_APP);
    MI_CpuFill8(work, 0, sizeof(SeasonAppWork));
    work->heapId = HEAPID_SEASON_APP;
    work->gameData = param;
    work->page = PAGE_NONE;
    work->bannerSeason = SEASON_COUNT;
    SeasonApp_SetVRAMBanks();
    SeasonApp_InitGraphics(work->heapId);
    GFL_BGSysSetDisplayLayout(GX_DISP_SELECT_MAIN_SUB);
    work->queue = PrintQueue_CreateDefault(work->heapId);
    work->msgData = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_SEASON_APP, work->heapId);
    return TRUE;
}

static BOOL SeasonAppProc_Main(GameProc *proc, u32 *state, void *param, void *procWork) {
    SeasonAppWork *work = procWork;
    BOOL result = SeasonApp_Main(work, state);

    SeasonApp_UpdateButtons(work);
    PrintQueue_Main(work->queue);
    if (work->preview != NULL) {
        SeasonApp_UpdatePreviewFade(work);
        SeasonPreview_Draw(work->preview);
    }
    return result;
}

static BOOL SeasonApp_Main(SeasonAppWork *work, u32 *state) {
    BOOL result = FALSE;

    switch (*state) {
    case SEQ_INIT:
        SeasonApp_LoadBGs(work);
        work->preview = SeasonPreview_Create(work->heapId, BANNER_NAME_CENTER_Y - BANNER_PREVIEW_OFFSET_Y);
        SeasonApp_ShowStatus(work);
        GFL_WipeSet(WIPE_MODE_BOTH, WIPE_TYPE_FADE_IN, WIPE_TYPE_FADE_IN, WIPE_COLOR_BLACK, 6, 1, work->heapId);
        SeasonApp_SetBGsEnabled(work, TRUE);
        *state = SEQ_FADE_IN;
        break;
    case SEQ_FADE_IN:
        if (GFL_WipeIsFinished() == TRUE) {
            *state = SEQ_LIST_OPEN;
        }
        break;
    case SEQ_LIST_OPEN:
        SeasonApp_CreateList(work);
        *state = SEQ_LIST;
        break;
    case SEQ_LIST:
        if (PrintQueue_IsEmpty(work->queue)) {
            s32 choice = SeasonApp_UpdateList(work);

            if (choice != BMPMENULIST_NULL) {
                SeasonApp_FreeList(work);
                if (choice == LIST_CANCEL || choice == BMPMENULIST_CANCEL) {
                    GFL_SndSEPlay(SEQ_SE_CANCEL1);
                    *state = SEQ_FADE_OUT;
                } else {
                    GFL_SndSEPlay(SEQ_SE_DECIDE1);
                    work->listRow = choice;
                    SeasonApp_OpenPage(work, choice);
                    *state = SEQ_PAGE;
                }
            }
        }
        break;
    case SEQ_PAGE:
        if (SeasonApp_UpdatePage(work) == TRUE) {
            *state = SEQ_PAGE_PICKED;
        }
        break;
    case SEQ_PAGE_PICKED:
        if (AppTaskMenuWin_IsFlashFinished(work->buttons[work->cursor])) {
            if (work->cursor == work->buttonCount - 1) {
                SeasonApp_ClosePage(work);
                SeasonApp_ShowStatus(work);
                *state = SEQ_LIST_OPEN;
            } else {
                SeasonApp_ApplyButton(work);
                *state = SEQ_PAGE;
            }
        }
        break;
    case SEQ_FADE_OUT:
        GFL_WipeSet(WIPE_MODE_BOTH, WIPE_TYPE_FADE_OUT, WIPE_TYPE_FADE_OUT, WIPE_COLOR_BLACK, 6, 1, work->heapId);
        *state = SEQ_END;
        break;
    case SEQ_END:
        if (GFL_WipeIsFinished() == TRUE) {
            SeasonApp_FreePreview(work);
            SeasonApp_FreeBGs(work);
            result = TRUE;
        }
        break;
    }

    if (work->list != NULL) {
        PrintWindow_Flush(&work->listPrint, work->queue);
    }
    if (work->messageWindow != NULL) {
        PrintWindow_Flush(&work->messagePrint, work->queue);
    }
    return result;
}

static BOOL SeasonAppProc_End(GameProc *proc, u32 *state, void *param, void *procWork) {
    SeasonAppWork *work = procWork;
    HeapID heapId = work->heapId;

    PrintQueue_Clear(work->queue);
    PrintQueue_Free(work->queue);
    GFL_MsgDataFree(work->msgData);
    SeasonApp_SetBGsEnabled(work, FALSE);
    GFL_BGSysSetDisplayLayout(GX_DISP_SELECT_MAIN_SUB);
    SeasonApp_FreeGraphics();
    GFL_ProcReleaseSubsystem(proc);
    GFL_HeapDelete(heapId);
    return TRUE;
}

// Clears VRAM, the OAM and the palettes, and sets the banks, as Geonet does
static void SeasonApp_SetVRAMBanks(void) {
    GX_SetBankForLCDC(GX_VRAM_LCDC_ALL);
    MIi_CpuClearFast(0, (void *)HW_LCDC_VRAM, HW_LCDC_VRAM_SIZE);
    GX_DisableBankForLCDC();
    MIi_CpuClearFast(0xc0, (void *)HW_OAM, HW_OAM_SIZE);
    MIi_CpuClearFast(0, (void *)HW_BG_PLTT, HW_PLTT_SIZE);
    MIi_CpuClearFast(0xc0, (void *)HW_DB_OAM, HW_OAM_SIZE);
    MIi_CpuClearFast(0, (void *)HW_DB_BG_PLTT, HW_PLTT_SIZE);
    GFL_BGSysSetVRAMBanks(&sSeasonAppVRAMConfig);
}

static void SeasonApp_InitGraphics(HeapID heapId) {
    GFL_BGSysCreate(heapId);
    GFL_BGSysSetLCDConfig(&sSeasonAppLCDConfig);
    BmpWin_InitAllocator(heapId);
    GFL_BGSysEnableEngines();
}

static void SeasonApp_FreeGraphics(void) {
    BmpWin_FreeAllocator();
    GFL_BGSysFree();
}

// The top screen has the preview or, without it, the grid
static void SeasonApp_SetBGsEnabled(SeasonAppWork *work, BOOL enabled) {
    work->bgsEnabled = enabled;
    GFL_BGSysSetBGEnabled(BG_TOP_TEXT, enabled);
    GFL_BGSysSetBGEnabled(BG_TOP_BANNER, enabled);
    if (work->preview != NULL && enabled) {
        GFL_BGSysSet3DBGPriority(BG_TOP_3D_PRIORITY);
        GFL_BGSysSetBGEnabled(BG_TOP_GRID, FALSE);
    } else {
        GFL_BGSysSetBGEnabled(BG_TOP_3D, FALSE);
        GFL_BGSysSetBGEnabled(BG_TOP_GRID, enabled);
    }
    GFL_BGSysSetBGEnabled(BG_TOUCH_TEXT, enabled);
    GFL_BGSysSetBGEnabled(BG_TOUCH_GRID, enabled);
}

static void SeasonApp_LoadBGs(SeasonAppWork *work) {
    ArcTool *arc = GFL_ArcSysCreateFileHandle(ARCID_GEONET, work->heapId);

    work->font = GFL_FontCreate(ARCID_FONT, 0, 0, FALSE, work->heapId);
    GFL_TextRndGetGlobalColors(&work->textColors[0], &work->textColors[1], &work->textColors[2]);
    GFL_TextRndUpdateColorIndexLUT(1, 2, WINDOW_FILL_COLOR);

    GFL_BGSysCreateBG(BG_TOP_TEXT, &sSeasonAppTextBGSetup, BGMODE_TEXT);
    GFL_BGSysClearScr(BG_TOP_TEXT);
    GFL_BGSysCreateBG(BG_TOP_BANNER, &sSeasonAppBannerBGSetup, BGMODE_TEXT);
    GFL_BGSysClearScr(BG_TOP_BANNER);
    SeasonApp_LoadGrid(arc, BG_TOP_GRID, PALTYPE_MAIN_BG, work->heapId);
    LoadSysMsgBox(BG_TOP_TEXT, FRAME_MESSAGE_CHAR, FRAME_MESSAGE_PALETTE, 0, work->heapId);
    GFL_BGSysLoadNCLRDefault(ARCID_FONT, 5, PALTYPE_MAIN_BG, PALETTE_FONT * 0x20, 0x20, work->heapId);
    GFL_BGSysClearCharCore(BG_TOP_TEXT, 0x20, 0, work->heapId);
    GFL_BGSysResetStdPalette(BG_TOP_TEXT, GX_RGB(19, 26, 17));
    work->messageWindow = SeasonApp_CreateWindow(&sSeasonAppMessageWindow);
    BmpWin_DrawFrame(work->messageWindow, WINFRAME_TRANSFER_NOW, FRAME_MESSAGE_CHAR, FRAME_MESSAGE_PALETTE);
    BmpWin_FlushChar(work->messageWindow);
    PrintWindow_Init(&work->messagePrint, work->messageWindow);

    GFL_BGSysCreateBG(BG_TOUCH_TEXT, &sSeasonAppTextBGSetup, BGMODE_TEXT);
    GFL_BGSysClearScr(BG_TOUCH_TEXT);
    SeasonApp_LoadGrid(arc, BG_TOUCH_GRID, PALTYPE_SUB_BG, work->heapId);
    LoadSysMsgBox(BG_TOUCH_TEXT, FRAME_MENU_CHAR, FRAME_MENU_PALETTE, 0, work->heapId);
    GFL_BGSysLoadNCLRDefault(ARCID_FONT, 5, PALTYPE_SUB_BG, PALETTE_FONT * 0x20, 0x20, work->heapId);
    GFL_BGSysClearCharCore(BG_TOUCH_TEXT, 0x20, 0, work->heapId);
    GFL_BGSysResetStdPalette(BG_TOUCH_TEXT, GX_RGB(0, 0, 0));
    work->buttonRes =
        AppTaskMenuRes_CreateFromArchive(BG_TOUCH_TEXT, PALETTE_BUTTONS, ARCID_GEONET, NARC_GEONET_BUTTON_NCGR,
                                         NARC_GEONET_BUTTON_NCLR, work->font, work->queue, work->heapId);
    work->currentButtonRes =
        AppTaskMenuRes_CreateFromArchive(BG_TOUCH_TEXT, PALETTE_BUTTON_CURRENT, ARCID_GEONET, NARC_GEONET_BUTTON_NCGR,
                                         NARC_GEONET_BUTTON_CURRENT_NCLR, work->font, work->queue, work->heapId);
    GFL_ArcToolFree(arc);
}

static void SeasonApp_LoadGrid(ArcTool *arc, u8 bg, u32 palType, HeapID heapId) {
    GFL_BGSysCreateBG(bg, &sSeasonAppGridBGSetup, BGMODE_TEXT);
    GFL_BGSysLoadArcNCGRStatic(arc, NARC_GEONET_BG_NCGR, bg, 0, 0, FALSE, heapId);
    GFL_G2DIOLoadArcNCLRDefault(arc, NARC_GEONET_BG_NCLR, palType, 0, 0x80, heapId);
    loadBGScrToVramByFileNoReserveNegAlign(arc, NARC_GEONET_BG_NSCR, bg, 0, 0, FALSE, heapId);
}

static void SeasonApp_FreeBGs(SeasonAppWork *work) {
    AppTaskMenuRes_Free(work->currentButtonRes);
    AppTaskMenuRes_Free(work->buttonRes);
    BmpWin_Free(work->messageWindow);
    work->messageWindow = NULL;
    GFL_BGSysReleaseBG(BG_TOUCH_TEXT);
    GFL_BGSysReleaseBG(BG_TOUCH_GRID);
    GFL_BGSysReleaseBG(BG_TOP_TEXT);
    GFL_BGSysReleaseBG(BG_TOP_BANNER);
    GFL_BGSysReleaseBG(BG_TOP_GRID);
    GFL_FontFree(work->font);
    GFL_TextRndUpdateColorIndexLUT(work->textColors[0], work->textColors[1], work->textColors[2]);
}

static BmpWin *SeasonApp_CreateWindow(const SeasonAppWindowSetup *setup) {
    BmpWin *window =
        BmpWin_CreateDynamic(setup->bg, setup->x, setup->y, setup->width, setup->height, setup->palette, TRUE);

    GFL_BitmapFill(BmpWin_GetBitmap(window), WINDOW_FILL_COLOR);
    BmpWin_FlushMap(window);
    return window;
}

// Clears the message window once what it was printing is done
static void SeasonApp_ClearMessage(SeasonAppWork *work) {
    GFLBitmap *bitmap = BmpWin_GetBitmap(work->messageWindow);

    while (PrintQueue_IsBitmapPending(work->queue, bitmap)) {
        PrintQueue_Main(work->queue);
    }
    GFL_BitmapFill(bitmap, WINDOW_FILL_COLOR);
}

static void SeasonApp_PrintLine(SeasonAppWork *work, u32 message, u8 line) {
    StrBuf *strbuf = GFL_MsgDataLoadStrbufNew(work->msgData, message);

    PrintWindow_PrintNoColor(&work->messagePrint, work->queue, 0, line * MESSAGE_LINE_HEIGHT, strbuf, work->font);
    GFL_StrBufFree(strbuf);
}

// Shows the setting and the season the game has, and that season's banner
static void SeasonApp_ShowStatus(SeasonAppWork *work) {
    u8 mode = PaperWhite2_GetSeasonMode(work->gameData);
    u32 modeMessage = sSeasonAppModeMessages[mode];

    if (mode == SEASON_MODE_REAL_TIME && PaperWhite2_GetSeasonHemisphere(work->gameData) == HEMISPHERE_SOUTHERN) {
        modeMessage = SeasonApp_Text_ModeRealTimeSouthern;
    }
    work->messageSeason = GameData_GetSeason(work->gameData);
    SeasonApp_ClearMessage(work);
    SeasonApp_PrintLine(work, modeMessage, 0);
    SeasonApp_PrintLine(work, sSeasonAppCurrentSeasonMessages[work->messageSeason], 1);
    SeasonApp_UpdatePreview(work);
}

static void SeasonApp_ShowHemisphere(SeasonAppWork *work) {
    SeasonApp_ClearMessage(work);
    if (PaperWhite2_GetSeasonHemisphere(work->gameData) == HEMISPHERE_SOUTHERN) {
        SeasonApp_PrintLine(work, SeasonApp_Text_HemisphereSouthern, 0);
    } else {
        SeasonApp_PrintLine(work, SeasonApp_Text_HemisphereNorthern, 0);
    }
    SeasonApp_PrintLine(work, SeasonApp_Text_HemisphereUsedByRealTime, 1);
}

// Shows a season's banner, as EventSeasonBanner_LoadGraphics loads it, in the banner's palette of the top screen, and
// the season in the preview
static void SeasonApp_ShowBanner(SeasonAppWork *work, u8 season) {
    ArcTool *arc;
    void *file;
    NNSG2dPaletteData *palette;
    NNSG2dCharacterData *character;
    NNSG2dScreenData *screen;

    if (season == work->bannerSeason) {
        return;
    }
    work->bannerSeason = season;
    arc = GFL_ArcSysCreateFileHandle(ARCID_SEASON_BANNER, work->heapId);

    file = GFL_ArcToolReadHeapNew(arc, season * BANNER_FILE_COUNT + BANNER_FILE_NCLR, work->heapId);
    NNS_G2dGetUnpackedPaletteData(file, &palette);
    GFL_BGSysUploadStdPalette(BG_TOP_BANNER, palette->pRawData, 0x20, PALETTE_BANNER * 0x20);
    GFL_HeapFree(file);

    file = GFL_ArcToolReadHeapNew(arc, season * BANNER_FILE_COUNT + BANNER_FILE_NCGR, work->heapId);
    NNS_G2dGetUnpackedBGCharacterData(file, &character);
    SeasonApp_ClearBannerBackground(character->pRawData, character->szByte);
    GFL_BGSysLoadChar(BG_TOP_BANNER, character->pRawData, character->szByte, 0);
    GFL_HeapFree(file);

    file = GFL_ArcToolReadHeapNew(arc, season * BANNER_FILE_COUNT + BANNER_FILE_NSCR, work->heapId);
    NNS_G2dGetUnpackedScreenData(file, &screen);
    GFL_BGSysBufferScr(BG_TOP_BANNER, screen->rawData, screen->szByte, 0);
    GFL_HeapFree(file);
    GFL_BGSysSetScrPaletteNo(BG_TOP_BANNER, 0, 0, 32, 32, PALETTE_BANNER);
    GFL_BGSysQueueScrLoad(BG_TOP_BANNER);

    GFL_ArcToolFree(arc);
    SeasonApp_ShowPreview(work, season);
}

// Loads the season in the preview, dark until a frame is drawn with it, then fading in. If it doesn't load, the top
// screen goes back to the grid, without the preview
static void SeasonApp_ShowPreview(SeasonAppWork *work, u8 season) {
    if (work->preview == NULL) {
        return;
    }
    G2x_SetBlendBrightness_(REG_BLDCNT_ADDR, GX_BLEND_PLANEMASK_BG0, PREVIEW_DARK_BRIGHTNESS);
    if (SeasonPreview_Load(work->preview, season)) {
        work->previewFade = PREVIEW_DARK_FRAMES + PREVIEW_FADE_FRAMES;
        GFL_BGSysMoveBG(BG_TOP_BANNER, BG_MOVE_SET_Y, BANNER_PREVIEW_OFFSET_Y);
        return;
    }
    SeasonApp_FreePreview(work);
    GFL_BGSysMoveBG(BG_TOP_BANNER, BG_MOVE_SET_Y, 0);
    if (work->bgsEnabled) {
        SeasonApp_SetBGsEnabled(work, TRUE);
    }
}

static void SeasonApp_FreePreview(SeasonAppWork *work) {
    if (work->preview == NULL) {
        return;
    }
    SeasonPreview_Free(work->preview);
    work->preview = NULL;
    G2_BlendNone();
}

// Brightens the preview from dark, a step a frame
static void SeasonApp_UpdatePreviewFade(SeasonAppWork *work) {
    if (work->previewFade == 0) {
        return;
    }
    work->previewFade--;
    if (work->previewFade == 0) {
        G2_BlendNone();
    } else if (work->previewFade < PREVIEW_FADE_FRAMES) {
        G2x_ChangeBlendBrightness_(REG_BLDCNT_ADDR, PREVIEW_DARK_BRIGHTNESS * work->previewFade / PREVIEW_FADE_FRAMES);
    }
}

// Makes the banner's background color transparent in its 4bpp characters, two pixels a byte
static void SeasonApp_ClearBannerBackground(u8 *chars, u32 size) {
    u32 i;

    for (i = 0; i < size; i++) {
        if ((chars[i] & 0xf) == BANNER_BACKGROUND_COLOR) {
            chars[i] &= 0xf0;
        }
        if ((chars[i] >> 4) == BANNER_BACKGROUND_COLOR) {
            chars[i] &= 0x0f;
        }
    }
}

// Shows the banner of the season under the cursor on the season page, or else of the message's season
static void SeasonApp_UpdatePreview(SeasonAppWork *work) {
    u8 season = work->messageSeason;

    if (work->page == PAGE_SEASON && work->cursor < work->buttonCount - 1 && GCTX_HIDIsUsingTouch() == FALSE) {
        season = sSeasonAppSeasonButtons[work->cursor].value - SEASON_MODE_SPRING;
    }
    SeasonApp_ShowBanner(work, season);
}

static void SeasonApp_ListCursorCallback(BmpMenuList *list, s32 value, u8 init) {
    if (!init) {
        GFL_SndSEPlay(SEQ_SE_MESSAGE);
    }
}

// Geonet's menu, with the cursor where it was, and the rows' rectangles of the touch screen
static void SeasonApp_CreateList(SeasonAppWork *work) {
    BmpMenuListHeader header;
    u32 rowHeight;
    int i;

    work->listWindow = SeasonApp_CreateWindow(&sSeasonAppListWindow);
    work->options = ListMenuCore_CreateOptionList(LIST_ITEM_COUNT, work->heapId);
    for (i = 0; i < LIST_ITEM_COUNT; i++) {
        ListMenuCore_AppendMsgOption(work->options, work->msgData, sSeasonAppListItems[i], i, work->heapId);
    }
    PrintWindow_Init(&work->listPrint, work->listWindow);
    header = sSeasonAppListHeader;
    header.options = work->options;
    header.cursorCallback = SeasonApp_ListCursorCallback;
    header.fontSizeX = 12;
    header.fontSizeY = GFL_FontGetCharHeight(work->font);
    header.msgData = work->msgData;
    header.printWindow = &work->listPrint;
    header.queue = work->queue;
    header.font = work->font;
    work->list = BmpMenuList_Create(&header, 0, work->listRow, work->heapId);
    BmpMenuList_LoadCursor(work->list, work->heapId);
    BmpWin_DrawFrame(work->listWindow, WINFRAME_TRANSFER_NOW, FRAME_MENU_CHAR, FRAME_MENU_PALETTE);
    BmpWin_FlushChar(work->listWindow);

    rowHeight = BmpMenuList_GetParam(work->list, BMPMENULIST_PARAM_ROW_HEIGHT);
    for (i = 0; i < LIST_ITEM_COUNT; i++) {
        work->listRects[i].top = sSeasonAppListWindow.y * 8 + BmpMenuList_GetRowY(work->list, i);
        work->listRects[i].bottom = work->listRects[i].top + rowHeight - 1;
        work->listRects[i].left = sSeasonAppListWindow.x * 8;
        work->listRects[i].right = (sSeasonAppListWindow.x + sSeasonAppListWindow.width) * 8 - 1;
    }
    work->listRects[i].top = TOUCH_RECT_END;
}

// Reads the touch screen, where a row's item is chosen at once, then the keys. Returns BmpMenuList_Update's result
static s32 SeasonApp_UpdateList(SeasonAppWork *work) {
    s32 row = GFL_HIDGetTouchPressedRect(work->listRects);
    s32 choice;

    if (row != TOUCH_RECT_NONE) {
        GCTX_HIDSetUsingTouch(TRUE);
        return BmpMenuList_GetOptionValue(work->list, row);
    }
    choice = BmpMenuList_Update(work->list);
    if (choice != BMPMENULIST_NULL) {
        GCTX_HIDSetUsingTouch(FALSE);
    }
    return choice;
}

static void SeasonApp_FreeList(SeasonAppWork *work) {
    while (PrintQueue_IsBitmapPending(work->queue, BmpWin_GetBitmap(work->listWindow))) {
        PrintQueue_Main(work->queue);
    }
    BmpWin_ClearScreen(work->listWindow);
    BmpWin_ClearFrame(work->listWindow, WINFRAME_TRANSFER_VBLANK);
    BmpWin_Free(work->listWindow);
    BmpMenuList_Free(work->list, NULL, NULL);
    ListMenuCore_FreeOptionList(work->options);
    work->list = NULL;
}

static void SeasonApp_OpenPage(SeasonAppWork *work, u8 page) {
    const SeasonAppPage *setup = &sSeasonAppPages[page];
    u8 current;
    u8 i;

    work->page = page;
    work->buttonCount = setup->count + 1;
    // The cursor starts on the button of the current setting, if the page has it
    work->cursor = 0;
    current = SeasonApp_GetCurrentValue(work);
    for (i = 0; i < setup->count; i++) {
        if (setup->buttons[i].value == current) {
            work->cursor = i;
        }
    }
    SeasonApp_CreateButtons(work);
    if (page == PAGE_HEMISPHERE) {
        SeasonApp_ShowHemisphere(work);
    }
    SeasonApp_UpdatePreview(work);
}

static void SeasonApp_ClosePage(SeasonAppWork *work) {
    SeasonApp_FreeButtons(work);
    work->page = PAGE_NONE;
    work->buttonCount = 0;
}

// The setting that the page's buttons set
static u8 SeasonApp_GetCurrentValue(SeasonAppWork *work) {
    if (work->page == PAGE_HEMISPHERE) {
        return PaperWhite2_GetSeasonHemisphere(work->gameData);
    }
    return PaperWhite2_GetSeasonMode(work->gameData);
}

// Makes the page's buttons, the current setting's in its own colors, then the Back button, and their rectangles of
// the touch screen
static void SeasonApp_CreateButtons(SeasonAppWork *work) {
    const SeasonAppPage *setup = &sSeasonAppPages[work->page];
    u8 current = SeasonApp_GetCurrentValue(work);
    u8 i;

    for (i = 0; i < setup->count; i++) {
        const SeasonAppButtonSetup *button = &setup->buttons[i];
        AppTaskMenuRes *res = button->value == current ? work->currentButtonRes : work->buttonRes;

        SeasonApp_CreateButton(work, i, res, button->label, 0, button->x, button->y, BUTTON_WIDTH);
    }
    SeasonApp_CreateButton(work, setup->count, work->buttonRes, SeasonApp_Text_Back, APP_TASKMENU_ITEM_RETURN,
                           BACK_BUTTON_X, BACK_BUTTON_Y, BACK_BUTTON_WIDTH);
    work->buttonRects[work->buttonCount].top = TOUCH_RECT_END;
    if (GCTX_HIDIsUsingTouch() == FALSE) {
        AppTaskMenuWin_SetActive(work->buttons[work->cursor], TRUE);
    }
}

// Makes a button of the page and its rectangle: the Back button as Geonet's Quit button, the others with their text
// centered
static void SeasonApp_CreateButton(SeasonAppWork *work, u8 index, AppTaskMenuRes *res, u32 label, u32 type, u8 x, u8 y,
                                   u8 width) {
    AppTaskMenuItem item;
    TouchRect *rect;

    item.str = GFL_MsgDataLoadStrbufNew(work->msgData, label);
    item.color = BUTTON_TEXT_COLOR;
    item.type = type;
    if (type == APP_TASKMENU_ITEM_RETURN) {
        work->buttons[index] = AppTaskMenuWin_Create(res, &item, x, y, width, work->heapId);
    } else {
        work->buttons[index] =
            AppTaskMenuWin_CreateEx(res, &item, x, y, width, BUTTON_HEIGHT, FALSE, TRUE, work->heapId);
    }
    GFL_StrBufFree(item.str);

    rect = &work->buttonRects[index];
    rect->top = y * 8;
    rect->bottom = (y + BUTTON_HEIGHT) * 8 - 1;
    rect->left = x * 8;
    rect->right = (x + width) * 8 - 1;
}

// Frees the buttons once their text is printed
static void SeasonApp_FreeButtons(SeasonAppWork *work) {
    u8 i;

    while (PrintQueue_IsEmpty(work->queue) == FALSE) {
        PrintQueue_Main(work->queue);
    }
    for (i = 0; i < BUTTON_MAX; i++) {
        if (work->buttons[i] != NULL) {
            AppTaskMenuWin_Free(work->buttons[i]);
            work->buttons[i] = NULL;
        }
    }
    GFL_BGSysQueueScrLoad(BG_TOUCH_TEXT);
}

static void SeasonApp_UpdateButtons(SeasonAppWork *work) {
    u8 i;

    for (i = 0; i < BUTTON_MAX; i++) {
        if (work->buttons[i] != NULL) {
            AppTaskMenuWin_Update(work->buttons[i]);
        }
    }
}

// Reads the touch screen and the keys as the game's task menus do: a touch picks a button, and in touch mode the first
// key but B only shows the cursor again. B picks the Back button. Returns whether a button was picked
static BOOL SeasonApp_UpdatePage(SeasonAppWork *work) {
    u32 pressed = GCTX_HIDGetPressedKeys();
    u32 typed = GCTX_HIDGetTypedKeys();
    s32 touched = GFL_HIDGetTouchPressedRect(work->buttonRects);
    u8 next = work->cursor;

    if (touched != TOUCH_RECT_NONE) {
        AppTaskMenuWin_SetActive(work->buttons[work->cursor], FALSE);
        GCTX_HIDSetUsingTouch(TRUE);
        work->cursor = touched;
        return SeasonApp_PickButton(work);
    }
    if (pressed & PAD_BUTTON_B) {
        AppTaskMenuWin_SetActive(work->buttons[work->cursor], FALSE);
        work->cursor = work->buttonCount - 1;
        return SeasonApp_PickButton(work);
    }
    if (GCTX_HIDIsUsingTouch() == TRUE) {
        if (pressed & (PAD_BUTTON_A | PAD_KEY_UP | PAD_KEY_DOWN | PAD_KEY_LEFT | PAD_KEY_RIGHT)) {
            GCTX_HIDSetUsingTouch(FALSE);
            AppTaskMenuWin_SetActive(work->buttons[work->cursor], TRUE);
            GFL_SndSEPlay(SEQ_SE_SELECT1);
            SeasonApp_UpdatePreview(work);
        }
        return FALSE;
    }
    if (pressed & PAD_BUTTON_A) {
        return SeasonApp_PickButton(work);
    }

    if (typed & PAD_KEY_UP) {
        next = SeasonApp_FindButton(work, 0, -1);
    } else if (typed & PAD_KEY_DOWN) {
        next = SeasonApp_FindButton(work, 0, 1);
    } else if (typed & PAD_KEY_LEFT) {
        next = SeasonApp_FindButton(work, -1, 0);
    } else if (typed & PAD_KEY_RIGHT) {
        next = SeasonApp_FindButton(work, 1, 0);
    }
    if (next != work->cursor) {
        AppTaskMenuWin_SetActive(work->buttons[work->cursor], FALSE);
        work->cursor = next;
        AppTaskMenuWin_SetActive(work->buttons[work->cursor], TRUE);
        GFL_SndSEPlay(SEQ_SE_SELECT1);
        SeasonApp_UpdatePreview(work);
    }
    return FALSE;
}

// The button the cursor moves to in a direction: up or down, the nearest row's button nearest the cursor's; left or
// right, the nearest in the cursor's row. The cursor's own if there is none. Centers are compared at twice their
// value, the sums of the rectangles' edges
static u8 SeasonApp_FindButton(SeasonAppWork *work, int directionX, int directionY) {
    const TouchRect *from = &work->buttonRects[work->cursor];
    int fromX = from->left + from->right;
    int fromY = from->top + from->bottom;
    int bestDistance = 0;
    int bestOffset = 0;
    u8 best = work->cursor;
    u8 i;

    for (i = 0; i < work->buttonCount; i++) {
        const TouchRect *rect = &work->buttonRects[i];
        int dx = rect->left + rect->right - fromX;
        int dy = rect->top + rect->bottom - fromY;
        int distance = dx * directionX + dy * directionY;
        int offset = directionX != 0 ? dy : dx;

        if (distance <= 0 || (directionX != 0 && offset != 0)) {
            continue;
        }
        if (offset < 0) {
            offset = -offset;
        }
        if (best == work->cursor || distance < bestDistance || (distance == bestDistance && offset < bestOffset)) {
            best = i;
            bestDistance = distance;
            bestOffset = offset;
        }
    }
    return best;
}

// Flashes the cursor's button, as Geonet's Quit button flashes, with the Back button's sound for it
static BOOL SeasonApp_PickButton(SeasonAppWork *work) {
    AppTaskMenuWin_SetFlashing(work->buttons[work->cursor], TRUE);
    if (work->cursor == work->buttonCount - 1) {
        GFL_SndSEPlay(SEQ_SE_CANCEL1);
    } else {
        GFL_SndSEPlay(SEQ_SE_DECIDE1);
    }
    return TRUE;
}

// Sets what the picked button sets, shows the new current button and says what changes, with the banner of the
// season the next map change into an exterior brings, the game's own for chaos
static void SeasonApp_ApplyButton(SeasonAppWork *work) {
    const SeasonAppButtonSetup *button = &sSeasonAppPages[work->page].buttons[work->cursor];

    if (work->page == PAGE_HEMISPHERE) {
        PaperWhite2_SetSeasonHemisphere(work->gameData, button->value);
    } else {
        PaperWhite2_SetSeasonMode(work->gameData, button->value);
    }
    SeasonApp_FreeButtons(work);
    SeasonApp_CreateButtons(work);
    work->messageSeason = PaperWhite2_GetCurrentSeason(work->gameData);
    SeasonApp_ClearMessage(work);
    SeasonApp_PrintLine(work, button->confirmation, 0);
    SeasonApp_UpdatePreview(work);
}
