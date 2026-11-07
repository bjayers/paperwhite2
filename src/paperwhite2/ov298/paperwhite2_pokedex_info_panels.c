#include "types.h"
#include "app/pokedex_detail.h"
#include "app/ui/print_msg.h"
#include "constants/arc.h"
#include "constants/pokemon.h"
#include "constants/text_banks.h"
#include "gfl/arc.h"
#include "gfl/arc_util.h"
#include "gfl/bg_sys.h"
#include "gfl/bmp.h"
#include "gfl/bmpwin.h"
#include "gfl/heap.h"
#include "gfl/msg.h"
#include "gfl/str.h"
#include "gfl/touchpanel.h"
#include "nitro/fx.h"
#include "nitro/gx.h"
#include "paperwhite2/pokedex_info.h"
#include "pml/personal.h"
#include "system/bmp_winframe.h"
#include "system/gf_font.h"
#include "system/printsys.h"
#include "system/wordset.h"
#include "text/system/pokedex_data.h"

// Paper White 2: the bottom screen of the Pokédex's info page, on the sub engine above the touch bar: the bar of the
// sub-pages' names at the top, and below it the shown sub-page's panel, Stats, Data or Matchups, read from the
// species' personal data at run time. The text and bars are drawn into two windows over the user's art (below), and
// a sub-page without art yet gets fills in its place, so every place is a constant here: the screen's pixels, the
// windows' tiles

// The sub engine's BGs: the grid at the back, the user's art over it on the page's buttons' BG
// (POKEDEX_INFO_BUTTON_BG, at POKEDEX_INFO_ART_PRIORITY), and the panels' windows above both, all under the touch
// bar's 0. The windows are clear but for their text, so the buttons show through them
#define BG_GRID 4
#define BG_ART POKEDEX_INFO_BUTTON_BG
#define BG_PANELS 7
#define PRIORITY_PANELS 1
#define PRIORITY_GRID 3
// The palettes: the grid's two (its top 21 rows and its bottom 3, PokedexDetailBackground_Create), and the panels'
#define PALETTE_GRID_TOP 1
#define PALETTE_GRID_BOTTOM 2
#define PALETTE_PANELS 3
// The art's palettes, after the buttons' two (POKEDEX_INFO_BUTTON_PALETTE): each sub-page's art has its own row, from
// this one in the sub-pages' order
#define PALETTE_ART 6
// The art's screen, the whole screen in tiles
#define ART_TILES_ACROSS 32
#define ART_TILES_DOWN 24
// The grid of the info page's top screen in the original, the backgrounds' page 0
#define GRID_PAGE (POKEDEX_DETAIL_PAGE_INFO - 1)

// The windows, in tiles: the bar, and the panels' window below it down to the touch bar
#define BAR_WINDOW_X 0
#define BAR_WINDOW_Y 0
#define BAR_WINDOW_WIDTH 32
#define BAR_WINDOW_HEIGHT 2
#define CONTENT_WINDOW_X 0
#define CONTENT_WINDOW_Y 2
#define CONTENT_WINDOW_WIDTH 32
#define CONTENT_WINDOW_HEIGHT 19
// Everything below is in the bottom screen's pixels; the panels' window starts this far down
#define CONTENT_TOP (CONTENT_WINDOW_Y * 8)

// The bar: L at the left, R at the right and the sub-pages' names centered between them, in font 1, the shown one
// bright, and the area of each name that touching switches to it
#define BAR_TEXT_Y 3
#define BAR_L_X 8
#define BAR_R_RIGHT 248
#define BAR_STATS_X 76
#define BAR_DATA_X 128
#define BAR_MATCHUPS_X 180
#define BAR_TOUCH_HALF_WIDTH 26
#define BAR_TOUCH_BOTTOM (BAR_WINDOW_HEIGHT * 8 - 1)

// Stats: a panel of the six base stats, each a row of its name, its value right-aligned and its bar, then a line and
// the total
#define STATS_PANEL_X 4
#define STATS_PANEL_Y 20
#define STATS_PANEL_WIDTH 168
#define STATS_PANEL_HEIGHT 144
#define STATS_ROW_Y 35
#define STATS_ROW_PITCH 16
#define STATS_NAME_X 18
#define STATS_VALUE_RIGHT 93
#define STATS_BAR_X 104
#define STATS_BAR_WIDTH 53
#define STATS_BAR_HEIGHT 6
// From the row's top
#define STATS_BAR_OFFSET_Y 5
#define STATS_TOTAL_Y 141
// The base stat that fills a bar; a higher one shows it full
#define STATS_BAR_MAX 180

// Data: a panel of rows, each its label in font 1 and its value right-aligned, and the egg's column at the right
#define DATA_PANEL_X 4
#define DATA_PANEL_Y 20
#define DATA_PANEL_WIDTH 176
#define DATA_PANEL_HEIGHT 144
#define DATA_ROW_Y 34
#define DATA_ROW_PITCH 16
#define DATA_LABEL_X 14
// Font 1's labels a little lower than font 0's values
#define DATA_LABEL_OFFSET_Y 3
#define DATA_VALUE_RIGHT 170
#define EGG_PANEL_X 184
#define EGG_PANEL_Y 20
#define EGG_PANEL_WIDTH 68
#define EGG_PANEL_HEIGHT 144
#define EGG_CENTER_X (EGG_PANEL_X + EGG_PANEL_WIDTH / 2)
#define EGG_HEADING_Y 30
#define EGG_GROUP_LABEL_Y 62
#define EGG_GROUP_Y 74
#define EGG_GROUP_PITCH 16
#define EGG_CYCLES_LABEL_Y 108
#define EGG_CYCLES_Y 120
#define EGG_STEPS_Y 138
// The steps of an egg cycle (fieldmap_event.c)
#define EGG_CYCLE_STEPS 256

// Matchups: an empty panel for now
#define MATCHUPS_PANEL_X 4
#define MATCHUPS_PANEL_Y 20
#define MATCHUPS_PANEL_WIDTH 248
#define MATCHUPS_PANEL_HEIGHT 144

// The Data panel's rows
enum {
    DATA_ROW_GENDER,
    DATA_ROW_CATCH_RATE,
    DATA_ROW_GROWTH,
    DATA_ROW_FLAVOR,
    DATA_ROW_EV_YIELD,
    DATA_ROW_BASE_EXP,
    DATA_ROW_FRIENDSHIP,
};

// The panels' palette, until the user's art: text and its shadow, the panels and their border (also the bar's
// strip), dim text, and the stat bars' five colors, each light above its shade
enum {
    PANELS_COLOR_CLEAR,
    PANELS_COLOR_TEXT,
    PANELS_COLOR_SHADOW,
    PANELS_COLOR_PANEL,
    PANELS_COLOR_BORDER,
    PANELS_COLOR_DIM,
    PANELS_COLOR_RED,
    PANELS_COLOR_RED_SHADE,
    PANELS_COLOR_ORANGE,
    PANELS_COLOR_PINK,
    PANELS_COLOR_YELLOW,
    PANELS_COLOR_YELLOW_SHADE,
    PANELS_COLOR_GREEN,
    PANELS_COLOR_GREEN_SHADE,
    PANELS_COLOR_BLUE,
    PANELS_COLOR_BLUE_SHADE,
};

static const GXRgb sPanelColors[16] = {
    GX_RGB(0, 0, 0),  GX_RGB(4, 4, 5),  GX_RGB(22, 22, 23), GX_RGB(31, 31, 31), GX_RGB(7, 7, 8),   GX_RGB(15, 15, 16),
    GX_RGB(30, 7, 6), GX_RGB(19, 4, 4), GX_RGB(31, 18, 4),  GX_RGB(31, 12, 21), GX_RGB(31, 29, 3), GX_RGB(22, 18, 2),
    GX_RGB(9, 26, 7), GX_RGB(4, 17, 4), GX_RGB(7, 17, 31),  GX_RGB(3, 9, 21),
};

#define TEXT_COLOR PRINT_COLOR(PANELS_COLOR_TEXT, PANELS_COLOR_SHADOW, PANELS_COLOR_CLEAR)
// The male and female shares' colors
#define MALE_COLOR PRINT_COLOR(PANELS_COLOR_BLUE, PANELS_COLOR_SHADOW, PANELS_COLOR_CLEAR)
#define FEMALE_COLOR PRINT_COLOR(PANELS_COLOR_PINK, PANELS_COLOR_SHADOW, PANELS_COLOR_CLEAR)
// The Egg column's, on the art's dark column: its heading in the art's yellow, its values white
#define EGG_HEADING_COLOR PRINT_COLOR(PANELS_COLOR_YELLOW, PANELS_COLOR_BORDER, PANELS_COLOR_CLEAR)
#define EGG_VALUE_COLOR PRINT_COLOR(PANELS_COLOR_PANEL, PANELS_COLOR_BORDER, PANELS_COLOR_CLEAR)
#define LABEL_COLOR PRINT_COLOR(PANELS_COLOR_DIM, PANELS_COLOR_CLEAR, PANELS_COLOR_CLEAR)
#define BAR_SHOWN_COLOR PRINT_COLOR(PANELS_COLOR_PANEL, PANELS_COLOR_CLEAR, PANELS_COLOR_CLEAR)
#define BAR_OTHER_COLOR PRINT_COLOR(PANELS_COLOR_DIM, PANELS_COLOR_CLEAR, PANELS_COLOR_CLEAR)

// A stat bar's color: the first whose limit the stat is under, else blue
typedef struct {
    u8 limit;
    u8 color;
} StatBarTier;

static const StatBarTier sStatBarTiers[] = {
    { 50, PANELS_COLOR_RED },
    { 80, PANELS_COLOR_ORANGE },
    { 100, PANELS_COLOR_YELLOW },
    { 130, PANELS_COLOR_GREEN },
};
#define STAT_BAR_TOP_COLOR PANELS_COLOR_BLUE

// The stats in the rows' order, with their names
static const u8 sStatParams[] = {
    PERSONAL_BASE_HP,        PERSONAL_BASE_ATTACK,     PERSONAL_BASE_DEFENSE,
    PERSONAL_BASE_SP_ATTACK, PERSONAL_BASE_SP_DEFENSE, PERSONAL_BASE_SPEED,
};
static const u16 sStatNames[NELEMS(sStatParams)] = {
    PokedexData_Text_HP,       PokedexData_Text_Attack,    PokedexData_Text_Defense,
    PokedexData_Text_SpAttack, PokedexData_Text_SpDefense, PokedexData_Text_Speed,
};
// The EV yields in the same order, with their short names, and the messages of one, two and three of them
static const u8 sEvParams[NELEMS(sStatParams)] = {
    PERSONAL_EV_HP,        PERSONAL_EV_ATTACK,     PERSONAL_EV_DEFENSE,
    PERSONAL_EV_SP_ATTACK, PERSONAL_EV_SP_DEFENSE, PERSONAL_EV_SPEED,
};
static const u16 sEvNames[NELEMS(sStatParams)] = {
    PokedexData_Text_EvHP,       PokedexData_Text_EvAttack,    PokedexData_Text_EvDefense,
    PokedexData_Text_EvSpAttack, PokedexData_Text_EvSpDefense, PokedexData_Text_EvSpeed,
};
static const u16 sEvYieldMessages[] = {
    PokedexData_Text_EvYield1,
    PokedexData_Text_EvYield2,
    PokedexData_Text_EvYield3,
};
#define EV_YIELD_MAX NELEMS(sEvYieldMessages)

static const u16 sDataLabels[] = {
    PokedexData_Text_GenderLabel,     PokedexData_Text_CatchRateLabel, PokedexData_Text_GrowthLabel,
    PokedexData_Text_FlavorLabel,     PokedexData_Text_EvYieldLabel,   PokedexData_Text_BaseExpLabel,
    PokedexData_Text_FriendshipLabel,
};

// By GROWTH_*
static const u16 sGrowthNames[] = {
    PokedexData_Text_MediumFast, PokedexData_Text_Erratic, PokedexData_Text_Fluctuating,
    PokedexData_Text_MediumSlow, PokedexData_Text_Fast,    PokedexData_Text_Slow,
};

// By EGG_GROUP_*
static const u16 sEggGroupNames[] = {
    PokedexData_Text_EggGroupNone, PokedexData_Text_Monster, PokedexData_Text_Water1,  PokedexData_Text_Bug,
    PokedexData_Text_Flying,       PokedexData_Text_Field,   PokedexData_Text_Fairy,   PokedexData_Text_Grass,
    PokedexData_Text_HumanLike,    PokedexData_Text_Water3,  PokedexData_Text_Mineral, PokedexData_Text_Amorphous,
    PokedexData_Text_Water2,       PokedexData_Text_Ditto,   PokedexData_Text_Dragon,  PokedexData_Text_Undiscovered,
};

// The favorite flavors, which the species have no table of yet (design/pokedex.md)
enum {
    FLAVOR_SPICY,
    FLAVOR_DRY,
    FLAVOR_SWEET,
    FLAVOR_BITTER,
    FLAVOR_SOUR,
    FLAVOR_NONE,
};

static const u16 sFlavorNames[] = {
    PokedexData_Text_Spicy,  PokedexData_Text_Dry,  PokedexData_Text_Sweet,
    PokedexData_Text_Bitter, PokedexData_Text_Sour, PokedexData_Text_NoFlavor,
};

static const TouchRect sSubpageRects[] = {
    { 0, BAR_TOUCH_BOTTOM, BAR_STATS_X - BAR_TOUCH_HALF_WIDTH, BAR_STATS_X + BAR_TOUCH_HALF_WIDTH - 1 },
    { 0, BAR_TOUCH_BOTTOM, BAR_DATA_X - BAR_TOUCH_HALF_WIDTH, BAR_DATA_X + BAR_TOUCH_HALF_WIDTH - 1 },
    { 0, BAR_TOUCH_BOTTOM, BAR_MATCHUPS_X - BAR_TOUCH_HALF_WIDTH, BAR_MATCHUPS_X + BAR_TOUCH_HALF_WIDTH - 1 },
    { TOUCH_RECT_END, 0, 0, 0 },
};

static const u8 sSubpageCenters[POKEDEX_INFO_SUBPAGE_COUNT] = { BAR_STATS_X, BAR_DATA_X, BAR_MATCHUPS_X };
static const u16 sSubpageNames[POKEDEX_INFO_SUBPAGE_COUNT] = {
    PokedexData_Text_Stats,
    PokedexData_Text_Data,
    PokedexData_Text_Matchups,
};

// The user's art of each sub-page, members of ARCID_POKEDEX_GRA that tools/paperwhite2/screen_art.py makes from
// res/paperwhite2/pokedex_art/ (res/paperwhite2/art/targets.json, pokedex_info_*): its palette, tiles and screen.
// ART_NONE for a sub-page that has none yet, drawn with fills
#define ART_NONE 0xffff

typedef struct {
    u16 palette;
    u16 chars;
    u16 screen;
} PanelsArt;

static const PanelsArt sSubpageArt[POKEDEX_INFO_SUBPAGE_COUNT] = {
    { 131, 132, 133 },
    { 134, 135, 136 },
    { ART_NONE, ART_NONE, ART_NONE },
};

struct PokedexInfoPanels {
    HeapID heapId;
    Font *font;
    Font *smallFont;
    MsgData *msgData;
    WordSet *wordSet;
    // A message as loaded, and formatted
    StrBuf *message;
    StrBuf *text;
    BmpWin *barWindow;
    BmpWin *contentWindow;
    PokedexDetailBackground *grid;
    // Each sub-page's art's characters on BG_ART, all loaded with the page so that changing sub-page only changes the
    // screen; 0 for a sub-page without art
    u32 artChars[POKEDEX_INFO_SUBPAGE_COUNT];
};

static void PokedexInfoPanels_DrawBar(PokedexInfoPanels *panels, u32 subpage);
static void PokedexInfoPanels_CreateArt(PokedexInfoPanels *panels);
static void PokedexInfoPanels_FreeArt(PokedexInfoPanels *panels);
static void PokedexInfoPanels_DrawStats(PokedexInfoPanels *panels, PersonalData *personal, BOOL caught);
static void PokedexInfoPanels_DrawData(PokedexInfoPanels *panels, PersonalData *personal, BOOL caught);
static void PokedexInfoPanels_DrawEgg(PokedexInfoPanels *panels, PersonalData *personal, BOOL caught);
static void PokedexInfoPanels_DrawPanel(GFLBitmap *bitmap, int x, int y, int width, int height);
static void PokedexInfoPanels_DrawStatBar(GFLBitmap *bitmap, int x, int y, u32 value);
static u32 PokedexInfoPanels_Print(PokedexInfoPanels *panels, GFLBitmap *bitmap, int top, Font *font, u32 messageId,
                                   int x, int y, u32 align, u16 color);
static void PokedexInfoPanels_PrintValue(PokedexInfoPanels *panels, u32 messageId, BOOL known, int y);
static void PokedexInfoPanels_DrawGender(PokedexInfoPanels *panels, GFLBitmap *bitmap, u32 sexRatio, int y);
static Font *PokedexInfoPanels_GetFittingFont(PokedexInfoPanels *panels, u32 messageId, u32 width);
static void PokedexInfoPanels_SetShare(WordSet *wordSet, u32 index, u32 permille);
static u32 PokedexInfoPanels_GetFemalePermille(u32 sexRatio);
static u32 PokedexInfoPanels_GetCatchPermille(u32 catchRate);
static u32 PokedexInfoPanels_GetFavoriteFlavor(PersonalData *personal);

PokedexInfoPanels *PokedexInfoPanels_Create(HeapID heapId, Font *font) {
    PokedexInfoPanels *panels =
        GFL_HeapAllocate(heapId, sizeof(PokedexInfoPanels), TRUE, "paperwhite2_pokedex_info_panels.c", __LINE__);

    panels->heapId = heapId;
    panels->font = font;
    // Streamed, its glyphs read as they are drawn, as the panels draw little text and the page already holds font 0
    panels->smallFont = GFL_FontCreate(ARCID_FONT, 1, 0, FALSE, heapId);
    panels->msgData = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_POKEDEX_DATA, heapId);
    panels->wordSet = GFL_WordSetSystemCreateDefault(heapId);
    panels->message = GFL_StrBufCreate(0x80, heapId);
    panels->text = GFL_StrBufCreate(0x80, heapId);

    GFL_BGSysSetBGPriority(BG_PANELS, PRIORITY_PANELS);
    GFL_BGSysSetBGPriority(BG_GRID, PRIORITY_GRID);
    panels->grid = PokedexDetailBackground_Create(heapId, GRID_PAGE, BG_GRID, PALETTE_GRID_BOTTOM, PALETTE_GRID_TOP);
    GFL_BGSysUploadStdPalette(BG_PANELS, sPanelColors, sizeof(sPanelColors), PALETTE_PANELS * 0x20);
    panels->barWindow = BmpWin_CreateDynamic(BG_PANELS, BAR_WINDOW_X, BAR_WINDOW_Y, BAR_WINDOW_WIDTH, BAR_WINDOW_HEIGHT,
                                             PALETTE_PANELS, FALSE);
    panels->contentWindow = BmpWin_CreateDynamic(BG_PANELS, CONTENT_WINDOW_X, CONTENT_WINDOW_Y, CONTENT_WINDOW_WIDTH,
                                                 CONTENT_WINDOW_HEIGHT, PALETTE_PANELS, FALSE);
    PokedexInfoPanels_CreateArt(panels);
    GFL_BGSysSetBGEnabled(BG_GRID, TRUE);
    GFL_BGSysSetBGEnabled(BG_PANELS, TRUE);
    return panels;
}

void PokedexInfoPanels_Free(PokedexInfoPanels *panels) {
    PokedexInfoPanels_FreeArt(panels);
    GFL_BGSysFillScrArea(BG_ART, 0, 0, 0, ART_TILES_ACROSS, ART_TILES_DOWN, 0);
    GFL_BGSysQueueScrLoad(BG_ART);
    BmpWin_ClearScreen(panels->contentWindow);
    BmpWin_ClearScreen(panels->barWindow);
    GFL_BGSysQueueScrLoad(BG_PANELS);
    BmpWin_Free(panels->contentWindow);
    BmpWin_Free(panels->barWindow);
    PokedexDetailBackground_Free(panels->grid);
    GFL_StrBufFree(panels->text);
    GFL_StrBufFree(panels->message);
    GFL_WordSetSystemFree(panels->wordSet);
    GFL_MsgDataFree(panels->msgData);
    GFL_FontFree(panels->smallFont);
    GFL_HeapFree(panels);
}

// Every sub-page's art's palette and characters, kept while the page runs
static void PokedexInfoPanels_CreateArt(PokedexInfoPanels *panels) {
    ArcTool *arc = GFL_ArcSysCreateFileHandle(ARCID_POKEDEX_GRA, panels->heapId);
    u32 i;

    for (i = 0; i < POKEDEX_INFO_SUBPAGE_COUNT; i++) {
        const PanelsArt *art = &sSubpageArt[i];

        if (art->screen != ART_NONE) {
            GFL_G2DIOLoadArcNCLR(arc, art->palette, PALTYPE_SUB_BG, 0, (PALETTE_ART + i) * 0x20, 0x20, panels->heapId);
            panels->artChars[i] = GFL_BGSysLoadArcNCGRDynamic(arc, art->chars, BG_ART, 0, FALSE, panels->heapId);
        }
    }
    GFL_ArcToolFree(arc);
}

// The sub-page's art's screen replaces BG_ART's whole screen, so the page makes its buttons after it. Only the screen
// changes, in the screen buffer, which goes to VRAM in the next VBlank, so the change shows all at once: writing it
// at once (as a sync load does) showed it a frame in the palette's first row, before its own row was set
void PokedexInfoPanels_LoadArt(PokedexInfoPanels *panels, u32 subpage) {
    const PanelsArt *art = &sSubpageArt[subpage];

    GFL_BGSysFillScrArea(BG_ART, 0, 0, 0, ART_TILES_ACROSS, ART_TILES_DOWN, 0);
    if (art->screen != ART_NONE) {
        ArcTool *arc = GFL_ArcSysCreateFileHandle(ARCID_POKEDEX_GRA, panels->heapId);

        // The screen's entries are the art's own tiles in its palette's first row, moved to where they are loaded
        GFL_G2DIOLoadNSCRAsync(arc, art->screen, BG_ART, 0, CHAR_POS(panels->artChars[subpage]), 0, FALSE,
                               panels->heapId);
        GFL_BGSysSetScrPaletteNo(BG_ART, 0, 0, ART_TILES_ACROSS, ART_TILES_DOWN, PALETTE_ART + subpage);
        GFL_ArcToolFree(arc);
    }
    GFL_BGSysQueueScrLoad(BG_ART);
}

static void PokedexInfoPanels_FreeArt(PokedexInfoPanels *panels) {
    u32 i;

    for (i = 0; i < POKEDEX_INFO_SUBPAGE_COUNT; i++) {
        if (panels->artChars[i] != 0) {
            GFL_BGSysFreeCharMemory(BG_ART, CHAR_POS(panels->artChars[i]), CHAR_SIZE(panels->artChars[i]));
            panels->artChars[i] = 0;
        }
    }
}

void PokedexInfoPanels_Update(PokedexInfoPanels *panels) {
    PokedexDetailBackground_Update(panels->grid);
}

void PokedexInfoPanels_Show(PokedexInfoPanels *panels, u32 subpage, u16 species, u16 form, BOOL caught) {
    PersonalData *personal = PML_PersonalLoad(species, form, panels->heapId);
    GFLBitmap *bitmap = BmpWin_GetBitmap(panels->contentWindow);

    PokedexInfoPanels_DrawBar(panels, subpage);
    GFL_BitmapFill(bitmap, PANELS_COLOR_CLEAR);
    switch (subpage) {
    case POKEDEX_INFO_SUBPAGE_STATS:
        PokedexInfoPanels_DrawStats(panels, personal, caught);
        break;
    case POKEDEX_INFO_SUBPAGE_DATA:
        PokedexInfoPanels_DrawData(panels, personal, caught);
        PokedexInfoPanels_DrawEgg(panels, personal, caught);
        break;
    case POKEDEX_INFO_SUBPAGE_MATCHUPS:
        PokedexInfoPanels_DrawPanel(bitmap, MATCHUPS_PANEL_X, MATCHUPS_PANEL_Y - CONTENT_TOP, MATCHUPS_PANEL_WIDTH,
                                    MATCHUPS_PANEL_HEIGHT);
        break;
    }
    PML_PersonalFree(personal);
    BmpWin_Transfer(panels->barWindow);
    BmpWin_Transfer(panels->contentWindow);
}

u32 PokedexInfoPanels_GetTouchedSubpage(void) {
    s32 rect = GFL_HIDGetTouchPressedRect(sSubpageRects);

    if (rect == TOUCH_RECT_NONE) {
        return POKEDEX_INFO_SUBPAGE_COUNT;
    }
    return rect;
}

StrBuf *PokedexInfoPanels_LoadMessage(PokedexInfoPanels *panels, u32 messageId) {
    return GFL_MsgDataLoadStrbufNew(panels->msgData, messageId);
}

// L, the names and R, over the art's strip, or a dark strip of their own where the sub-page has no art
static void PokedexInfoPanels_DrawBar(PokedexInfoPanels *panels, u32 subpage) {
    GFLBitmap *bitmap = BmpWin_GetBitmap(panels->barWindow);
    u32 i;

    GFL_BitmapFill(bitmap, sSubpageArt[subpage].screen != ART_NONE ? PANELS_COLOR_CLEAR : PANELS_COLOR_BORDER);
    PokedexInfoPanels_Print(panels, bitmap, 0, panels->smallFont, PokedexData_Text_SubpageL, BAR_L_X, BAR_TEXT_Y,
                            PRINT_ALIGN_LEFT, BAR_OTHER_COLOR);
    PokedexInfoPanels_Print(panels, bitmap, 0, panels->smallFont, PokedexData_Text_SubpageR, BAR_R_RIGHT, BAR_TEXT_Y,
                            PRINT_ALIGN_RIGHT, BAR_OTHER_COLOR);
    for (i = 0; i < POKEDEX_INFO_SUBPAGE_COUNT; i++) {
        PokedexInfoPanels_Print(panels, bitmap, 0, panels->smallFont, sSubpageNames[i], sSubpageCenters[i], BAR_TEXT_Y,
                                PRINT_ALIGN_CENTER, i == subpage ? BAR_SHOWN_COLOR : BAR_OTHER_COLOR);
    }
}

// The six base stats and their total, each "?" with an empty bar until the species is caught
static void PokedexInfoPanels_DrawStats(PokedexInfoPanels *panels, PersonalData *personal, BOOL caught) {
    GFLBitmap *bitmap = BmpWin_GetBitmap(panels->contentWindow);
    u32 total = 0;
    u32 i;

    if (sSubpageArt[POKEDEX_INFO_SUBPAGE_STATS].screen == ART_NONE) {
        PokedexInfoPanels_DrawPanel(bitmap, STATS_PANEL_X, STATS_PANEL_Y - CONTENT_TOP, STATS_PANEL_WIDTH,
                                    STATS_PANEL_HEIGHT);
    }
    for (i = 0; i < NELEMS(sStatParams); i++) {
        int y = STATS_ROW_Y + i * STATS_ROW_PITCH;
        u32 value = PML_PersonalGetParam(personal, sStatParams[i]);

        total += value;
        PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->font, sStatNames[i], STATS_NAME_X, y,
                                PRINT_ALIGN_LEFT, TEXT_COLOR);
        WordSetNumber(panels->wordSet, 0, value, 3, 0, TRUE);
        PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->font,
                                caught ? PokedexData_Text_Number : PokedexData_Text_Unknown, STATS_VALUE_RIGHT, y,
                                PRINT_ALIGN_RIGHT, TEXT_COLOR);
        PokedexInfoPanels_DrawStatBar(bitmap, STATS_BAR_X, y + STATS_BAR_OFFSET_Y - CONTENT_TOP, caught ? value : 0);
    }
    PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->font, PokedexData_Text_Total, STATS_NAME_X,
                            STATS_TOTAL_Y, PRINT_ALIGN_LEFT, TEXT_COLOR);
    WordSetNumber(panels->wordSet, 0, total, 3, 0, TRUE);
    PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->font,
                            caught ? PokedexData_Text_Number : PokedexData_Text_Unknown, STATS_VALUE_RIGHT,
                            STATS_TOTAL_Y, PRINT_ALIGN_RIGHT, TEXT_COLOR);
}

// The rows of the Data panel. The gender split, catch rate, EV yield and base Exp. show once the species is seen, as
// the page only shows a seen one, and the others once it is caught
static void PokedexInfoPanels_DrawData(PokedexInfoPanels *panels, PersonalData *personal, BOOL caught) {
    GFLBitmap *bitmap = BmpWin_GetBitmap(panels->contentWindow);
    u32 sexRatio = PML_PersonalGetParam(personal, PERSONAL_SEX_RATIO);
    u32 growth = PML_PersonalGetParam(personal, PERSONAL_GROWTH_RATE);
    u32 catchRate = PML_PersonalGetParam(personal, PERSONAL_CATCH_RATE);
    u32 catchPermille = PokedexInfoPanels_GetCatchPermille(catchRate);
    u32 message;
    u32 count = 0;
    u32 i;

    if (sSubpageArt[POKEDEX_INFO_SUBPAGE_DATA].screen == ART_NONE) {
        PokedexInfoPanels_DrawPanel(bitmap, DATA_PANEL_X, DATA_PANEL_Y - CONTENT_TOP, DATA_PANEL_WIDTH,
                                    DATA_PANEL_HEIGHT);
    }
    for (i = 0; i < NELEMS(sDataLabels); i++) {
        PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->smallFont, sDataLabels[i], DATA_LABEL_X,
                                DATA_ROW_Y + i * DATA_ROW_PITCH + DATA_LABEL_OFFSET_Y, PRINT_ALIGN_LEFT, LABEL_COLOR);
    }

    PokedexInfoPanels_DrawGender(panels, bitmap, sexRatio, DATA_ROW_Y + DATA_ROW_GENDER * DATA_ROW_PITCH);

    WordSetNumber(panels->wordSet, 0, catchRate, 3, 0, TRUE);
    PokedexInfoPanels_SetShare(panels->wordSet, 1, catchPermille);
    PokedexInfoPanels_PrintValue(panels, PokedexData_Text_CatchRate, TRUE,
                                 DATA_ROW_Y + DATA_ROW_CATCH_RATE * DATA_ROW_PITCH);

    PokedexInfoPanels_PrintValue(panels,
                                 growth < NELEMS(sGrowthNames) ? sGrowthNames[growth] : PokedexData_Text_Unknown,
                                 caught, DATA_ROW_Y + DATA_ROW_GROWTH * DATA_ROW_PITCH);
    PokedexInfoPanels_PrintValue(panels, sFlavorNames[PokedexInfoPanels_GetFavoriteFlavor(personal)], caught,
                                 DATA_ROW_Y + DATA_ROW_FLAVOR * DATA_ROW_PITCH);

    // Each stat's yield and short name, in the word set's slots in pairs
    for (i = 0; i < NELEMS(sEvParams); i++) {
        u32 yield = PML_PersonalGetParam(personal, sEvParams[i]);

        if (yield != 0 && count < EV_YIELD_MAX) {
            WordSetNumber(panels->wordSet, count * 2, yield, 1, 0, TRUE);
            GFL_MsgDataLoadStrbuf(panels->msgData, sEvNames[i], panels->message);
            GFL_WordSetSetStrbuf(panels->wordSet, count * 2 + 1, panels->message, 0, TRUE, 0);
            count++;
        }
    }
    PokedexInfoPanels_PrintValue(panels, count != 0 ? sEvYieldMessages[count - 1] : PokedexData_Text_NoEvYield, TRUE,
                                 DATA_ROW_Y + DATA_ROW_EV_YIELD * DATA_ROW_PITCH);

    WordSetNumber(panels->wordSet, 0, PML_PersonalGetParam(personal, PERSONAL_BASE_EXP), 3, 0, TRUE);
    PokedexInfoPanels_PrintValue(panels, PokedexData_Text_Number, TRUE,
                                 DATA_ROW_Y + DATA_ROW_BASE_EXP * DATA_ROW_PITCH);
    WordSetNumber(panels->wordSet, 0, PML_PersonalGetParam(personal, PERSONAL_FRIENDSHIP), 3, 0, TRUE);
    PokedexInfoPanels_PrintValue(panels, PokedexData_Text_Number, caught,
                                 DATA_ROW_Y + DATA_ROW_FRIENDSHIP * DATA_ROW_PITCH);
}

// The egg's column: the egg groups, one or two, and the hatch cycles with their steps
static void PokedexInfoPanels_DrawEgg(PokedexInfoPanels *panels, PersonalData *personal, BOOL caught) {
    GFLBitmap *bitmap = BmpWin_GetBitmap(panels->contentWindow);
    u32 groups[2];
    u32 cycles = PML_PersonalGetParam(personal, PERSONAL_HATCH_CYCLES);
    u32 i;

    groups[0] = PML_PersonalGetParam(personal, PERSONAL_EGG_GROUP_1);
    groups[1] = PML_PersonalGetParam(personal, PERSONAL_EGG_GROUP_2);
    if (sSubpageArt[POKEDEX_INFO_SUBPAGE_DATA].screen == ART_NONE) {
        PokedexInfoPanels_DrawPanel(bitmap, EGG_PANEL_X, EGG_PANEL_Y - CONTENT_TOP, EGG_PANEL_WIDTH, EGG_PANEL_HEIGHT);
    }
    PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->font, PokedexData_Text_EggHeading, EGG_CENTER_X,
                            EGG_HEADING_Y, PRINT_ALIGN_CENTER, EGG_HEADING_COLOR);
    PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->smallFont, PokedexData_Text_Group, EGG_CENTER_X,
                            EGG_GROUP_LABEL_Y, PRINT_ALIGN_CENTER, LABEL_COLOR);
    for (i = 0; i < 2; i++) {
        u32 message = groups[i] < NELEMS(sEggGroupNames) ? sEggGroupNames[groups[i]] : PokedexData_Text_Unknown;

        // A species of one group has it twice
        if (i == 1 && (groups[1] == groups[0] || !caught)) {
            break;
        }
        if (!caught) {
            message = PokedexData_Text_Unknown;
        }
        PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP,
                                PokedexInfoPanels_GetFittingFont(panels, message, EGG_PANEL_WIDTH - 4), message,
                                EGG_CENTER_X, EGG_GROUP_Y + i * EGG_GROUP_PITCH, PRINT_ALIGN_CENTER, EGG_VALUE_COLOR);
    }

    PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->smallFont, PokedexData_Text_Cycles, EGG_CENTER_X,
                            EGG_CYCLES_LABEL_Y, PRINT_ALIGN_CENTER, LABEL_COLOR);
    WordSetNumber(panels->wordSet, 0, cycles, 3, 0, TRUE);
    PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->font,
                            caught ? PokedexData_Text_Number : PokedexData_Text_Unknown, EGG_CENTER_X, EGG_CYCLES_Y,
                            PRINT_ALIGN_CENTER, EGG_VALUE_COLOR);
    if (caught) {
        WordSetNumber(panels->wordSet, 0, cycles * EGG_CYCLE_STEPS, 5, 0, TRUE);
        PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->smallFont, PokedexData_Text_Steps, EGG_CENTER_X,
                                EGG_STEPS_Y, PRINT_ALIGN_CENTER, LABEL_COLOR);
    }
}

// A filled rectangle with a border, without its corners, as the summary screen's hidden stats' bars are drawn
static void PokedexInfoPanels_DrawPanel(GFLBitmap *bitmap, int x, int y, int width, int height) {
    GFL_BitmapFillArea(bitmap, x + 1, y, width - 2, height, PANELS_COLOR_BORDER);
    GFL_BitmapFillArea(bitmap, x, y + 1, width, height - 2, PANELS_COLOR_BORDER);
    GFL_BitmapFillArea(bitmap, x + 1, y + 1, width - 2, height - 2, PANELS_COLOR_PANEL);
}

// A stat's bar as the summary screen's EV and IV bars (p_sta_skill.c): an outline without its corners round a white
// track, and the fill over it, its last line in the shade, colored by the stat's tier and full at STATS_BAR_MAX
static void PokedexInfoPanels_DrawStatBar(GFLBitmap *bitmap, int x, int y, u32 value) {
    u8 color = STAT_BAR_TOP_COLOR;
    u32 fill;
    u32 i;

    for (i = 0; i < NELEMS(sStatBarTiers); i++) {
        if (value < sStatBarTiers[i].limit) {
            color = sStatBarTiers[i].color;
            break;
        }
    }
    if (value > STATS_BAR_MAX) {
        value = STATS_BAR_MAX;
    }
    fill = value * (STATS_BAR_WIDTH - 2) / STATS_BAR_MAX;
    GFL_BitmapFillArea(bitmap, x + 1, y, STATS_BAR_WIDTH - 2, STATS_BAR_HEIGHT, PANELS_COLOR_BORDER);
    GFL_BitmapFillArea(bitmap, x, y + 1, STATS_BAR_WIDTH, STATS_BAR_HEIGHT - 2, PANELS_COLOR_BORDER);
    GFL_BitmapFillArea(bitmap, x + 1, y + 1, STATS_BAR_WIDTH - 2, STATS_BAR_HEIGHT - 2, PANELS_COLOR_PANEL);
    if (fill != 0) {
        GFL_BitmapFillArea(bitmap, x + 1, y + 1, fill, STATS_BAR_HEIGHT - 3, color);
        // Each color's shade follows it in the palette, but orange's, whose place is pink's, which takes red's
        GFL_BitmapFillArea(bitmap, x + 1, y + STATS_BAR_HEIGHT - 2, fill, 1,
                           color == PANELS_COLOR_ORANGE ? PANELS_COLOR_RED_SHADE : color + 1);
    }
}

// Draws a message, formatted with the word set, into a window whose top is at top on the screen. x is where it
// starts, ends or is centered, by a PRINT_ALIGN_*. Returns its width
static u32 PokedexInfoPanels_Print(PokedexInfoPanels *panels, GFLBitmap *bitmap, int top, Font *font, u32 messageId,
                                   int x, int y, u32 align, u16 color) {
    u32 width;

    GFL_MsgDataLoadStrbuf(panels->msgData, messageId, panels->message);
    GFL_WordSetFormatStrbuf(panels->wordSet, panels->text, panels->message);
    width = GFL_FontGetBlockWidth(panels->text, font, 0);
    switch (align) {
    case PRINT_ALIGN_RIGHT:
        x -= width;
        break;
    case PRINT_ALIGN_CENTER:
        x -= width / 2;
        break;
    }
    GFL_TextRendererDrawToBitmapEx(bitmap, x, y - top, panels->text, font, color);
    return width;
}

// The gender row's value, right-aligned: the male share in blue and the female share in pink, either alone for a
// species of one gender, or "Genderless"
static void PokedexInfoPanels_DrawGender(PokedexInfoPanels *panels, GFLBitmap *bitmap, u32 sexRatio, int y) {
    int right = DATA_VALUE_RIGHT;
    u32 female;

    switch (sexRatio) {
    case GENDER_RATIO_GENDERLESS:
        PokedexInfoPanels_PrintValue(panels, PokedexData_Text_Genderless, TRUE, y);
        return;
    case GENDER_RATIO_MALE_ONLY:
        PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->font, PokedexData_Text_MaleOnly, right, y,
                                PRINT_ALIGN_RIGHT, MALE_COLOR);
        return;
    case GENDER_RATIO_FEMALE_ONLY:
        PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->font, PokedexData_Text_FemaleOnly, right, y,
                                PRINT_ALIGN_RIGHT, FEMALE_COLOR);
        return;
    }
    female = PokedexInfoPanels_GetFemalePermille(sexRatio);
    PokedexInfoPanels_SetShare(panels->wordSet, 0, 1000 - female);
    PokedexInfoPanels_SetShare(panels->wordSet, 2, female);
    right -= PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->font, PokedexData_Text_GenderFemale, right, y,
                                     PRINT_ALIGN_RIGHT, FEMALE_COLOR);
    right -= PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->font, PokedexData_Text_GenderSeparator, right,
                                     y, PRINT_ALIGN_RIGHT, TEXT_COLOR);
    PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->font, PokedexData_Text_GenderMale, right, y,
                            PRINT_ALIGN_RIGHT, MALE_COLOR);
}

// A Data row's value, right-aligned, or "?" while it isn't known
static void PokedexInfoPanels_PrintValue(PokedexInfoPanels *panels, u32 messageId, BOOL known, int y) {
    PokedexInfoPanels_Print(panels, BmpWin_GetBitmap(panels->contentWindow), CONTENT_TOP, panels->font,
                            known ? messageId : PokedexData_Text_Unknown, DATA_VALUE_RIGHT, y, PRINT_ALIGN_RIGHT,
                            TEXT_COLOR);
}

// Font 0, or font 1 for a message wider than width in font 0
static Font *PokedexInfoPanels_GetFittingFont(PokedexInfoPanels *panels, u32 messageId, u32 width) {
    GFL_MsgDataLoadStrbuf(panels->msgData, messageId, panels->message);
    if (GFL_FontGetBlockWidth(panels->message, panels->font, 0) > width) {
        return panels->smallFont;
    }
    return panels->font;
}

// A share in tenths of a percent, as its whole percent and its tenth in two of the word set's slots
static void PokedexInfoPanels_SetShare(WordSet *wordSet, u32 index, u32 permille) {
    WordSetNumber(wordSet, index, permille / 10, 3, 0, TRUE);
    WordSetNumber(wordSet, index + 1, permille % 10, 1, 0, TRUE);
}

// The share of females in tenths of a percent. The game makes a Pokémon female when its personality's low byte is under
// the ratio (PML_UtilDerivePkmSex), so a ratio of 31 makes 31 in 256 female, 12.1%; but the ratios stand for eighths,
// and the page shows those, as the games' guides do: 31 is 12.5%
static u32 PokedexInfoPanels_GetFemalePermille(u32 sexRatio) {
    return (sexRatio + 1) * 1000 / 256;
}

// The chance in tenths of a percent that a Poké Ball catches the species at full HP without a status, by the battle's
// formula (CheckBallCapture, btl_server_flow_sub.c): a value of a third of the catch rate, then three shake checks
// that each pass with a chance of b / 65536, b being 65536 / (255 / value)^(1/4). A value of 255 always catches
static u32 PokedexInfoPanels_GetCatchPermille(u32 catchRate) {
    fx32 value = (catchRate << FX32_SHIFT) / 3;
    u32 shake;
    u64 chance;

    if (value >= FX32_CONST(255)) {
        return 1000;
    }
    if (value == 0) {
        return 0;
    }
    shake = FX_Div(FX32_CONST(65536), FX_Sqrt(FX_Sqrt(FX_Div(FX32_CONST(255), value)))) >> FX32_SHIFT;
    // The three checks' chance, rounded to the nearest tenth of a percent
    chance = (u64)shake * shake * shake * 1000;
    return (chance + (1ULL << 47)) >> 48;
}

// The species' favorite flavor. Paper White 2 has no table of them yet: it will be read here, from the personal data's
// species and form, once it exists (design/pokedex.md, "Favourite flavour")
static u32 PokedexInfoPanels_GetFavoriteFlavor(PersonalData *personal) {
    return FLAVOR_NONE;
}
