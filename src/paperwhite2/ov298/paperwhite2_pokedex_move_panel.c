#include "types.h"
#include "app/pokedex_detail.h"
#include "app/pokedex_info.h"
#include "app/ui/print_msg.h"
#include "constants/arc.h"
#include "constants/text_banks.h"
#include "constants/types.h"
#include "gfl/arc.h"
#include "gfl/bg_sys.h"
#include "gfl/bmp.h"
#include "gfl/bmpwin.h"
#include "gfl/clact.h"
#include "gfl/heap.h"
#include "gfl/msg.h"
#include "gfl/str.h"
#include "nitro/gx.h"
#include "nitro/hw.h"
#include "paperwhite2/pokedex_info.h"
#include "pml/move.h"
#include "system/app_menu_common.h"
#include "system/gf_font.h"
#include "system/printsys.h"
#include "system/wordset.h"
#include "text/system/pokedex_data.h"

// Paper White 2: the Pokédex info page's move panel, over the top screen's entry while a move of the Moves sub-page is
// chosen (docs/paperwhite2/design/pokedex.md, "Moves and Evo tabs"): the move's name and type, its category, power,
// accuracy, PP and priority, and its description, on a light panel with a dark border, the rest of the top screen
// dimmed. It is drawn on the main engine's BG 1, over the entry, whose BG it shares with the head bar: BG 1 has 16 KB
// of characters, which the head bar and the entry's windows fill, so the entry's windows are freed while the panel is
// open (PokedexInfo_FreeText) and the panel takes their room. Its fill and border are a few characters repeated over
// the screen, and only its text has windows. Every place is a constant here, in the top screen's pixels or tiles

// BG 1 and a palette of it that the top screen doesn't use, its colors sPanelColors
#define PANEL_BG 1
#define PANEL_PALETTE 6
// The panel in tiles: from the second column to the last, and from the row under the head bar to the 22nd. Its border
// is a pixel inside that, at x 9 and 248, y 24 and 169, so the tiles of its edges are partly clear
#define PANEL_TILE_X 1
#define PANEL_TILE_Y 3
#define PANEL_TILE_WIDTH 31
#define PANEL_TILE_HEIGHT 19
#define TILE_SIZE 0x20

// The windows of its text, in tiles: the name, the left numbers (Category, Power, Accuracy), the right ones (PP,
// Priority) and the description
#define NAME_WINDOW_X 2
#define NAME_WINDOW_Y 4
#define NAME_WINDOW_WIDTH 18
#define NAME_WINDOW_HEIGHT 2
#define LEFT_WINDOW_X 2
#define LEFT_WINDOW_Y 8
#define LEFT_WINDOW_WIDTH 13
#define LEFT_WINDOW_HEIGHT 6
#define RIGHT_WINDOW_X 17
#define RIGHT_WINDOW_Y 8
#define RIGHT_WINDOW_WIDTH 13
#define RIGHT_WINDOW_HEIGHT 4
#define DESCRIPTION_WINDOW_X 2
#define DESCRIPTION_WINDOW_Y 15
#define DESCRIPTION_WINDOW_WIDTH 28
#define DESCRIPTION_WINDOW_HEIGHT 6

// The text, in the screen's pixels: the name, the labels' column and rows, the values centered on their columns, the
// right labels' column, and the description's lines
#define NAME_X 20
#define NAME_Y 32
#define LABEL_X 20
#define CATEGORY_Y 64
#define POWER_Y 77
#define ACCURACY_Y 91
#define POWER_VALUE_X 93
#define ACCURACY_VALUE_X 94
#define RIGHT_LABEL_X 138
#define PP_Y 64
#define PRIORITY_Y 77
#define RIGHT_VALUE_X 212
#define DESCRIPTION_X 20
#define DESCRIPTION_Y 120
#define DESCRIPTION_LINE_PITCH 14
#define DESCRIPTION_LINES 3

// The type icon at the top right and the category icon after its label, centered on these, over the panel
#define TYPE_ICON_X 224
#define TYPE_ICON_Y 40
#define CATEGORY_ICON_X 99
#define CATEGORY_ICON_Y 70
// The icons' palette, the menus' type icons' three rows, in main OBJ rows the top screen doesn't use, and their cells
// for the main engine's 1D 128 KB mapping
#define ICON_PALETTE 9
#define ICON_PALETTE_COUNT 3
#define ICON_MAPPING 2

// The dimming of the rest of the top screen: BG 0 (the sprite), 2 (the panels), 3 (the grid) and the backdrop, but not
// BG 1, where the panel and the head bar are, nor the OBJs, the panel's icons
#define DIM_PLANES (GX_BLEND_PLANEMASK_BG0 | GX_BLEND_PLANEMASK_BG2 | GX_BLEND_PLANEMASK_BG3 | GX_BLEND_PLANEMASK_BD)
#define DIM_BRIGHTNESS (-8)

// A power of 1 or less is a move's own rule (PML_MoveGetParam), shown as a dash, as the relearner shows it
#define POWER_NONE 1

enum {
    COLOR_CLEAR,
    COLOR_TEXT,
    COLOR_SHADOW,
    COLOR_FILL,
    COLOR_BORDER,
};

static const GXRgb sPanelColors[] = {
    GX_RGB(0, 0, 0), GX_RGB(4, 4, 5), GX_RGB(21, 21, 22), GX_RGB(29, 29, 29), GX_RGB(7, 7, 8),
};

#define TEXT_COLOR PRINT_COLOR(COLOR_TEXT, COLOR_SHADOW, COLOR_CLEAR)

// The edges of a tile of the panel, each a bit
enum {
    EDGE_LEFT = 1 << 0,
    EDGE_RIGHT = 1 << 1,
    EDGE_TOP = 1 << 2,
    EDGE_BOTTOM = 1 << 3,
};

// The panel's tiles: its fill, and its edges and corners
enum {
    TILE_FILL,
    TILE_TOP,
    TILE_BOTTOM,
    TILE_LEFT,
    TILE_RIGHT,
    TILE_TOP_LEFT,
    TILE_TOP_RIGHT,
    TILE_BOTTOM_LEFT,
    TILE_BOTTOM_RIGHT,
    TILE_COUNT,
};

static const u8 sTileEdges[TILE_COUNT] = {
    0,
    EDGE_TOP,
    EDGE_BOTTOM,
    EDGE_LEFT,
    EDGE_RIGHT,
    EDGE_TOP | EDGE_LEFT,
    EDGE_TOP | EDGE_RIGHT,
    EDGE_BOTTOM | EDGE_LEFT,
    EDGE_BOTTOM | EDGE_RIGHT,
};

enum {
    WINDOW_NAME,
    WINDOW_LEFT,
    WINDOW_RIGHT,
    WINDOW_DESCRIPTION,
    WINDOW_COUNT,
};

// Each window's place and size, in tiles
static const u8 sWindowRects[WINDOW_COUNT][4] = {
    { NAME_WINDOW_X, NAME_WINDOW_Y, NAME_WINDOW_WIDTH, NAME_WINDOW_HEIGHT },
    { LEFT_WINDOW_X, LEFT_WINDOW_Y, LEFT_WINDOW_WIDTH, LEFT_WINDOW_HEIGHT },
    { RIGHT_WINDOW_X, RIGHT_WINDOW_Y, RIGHT_WINDOW_WIDTH, RIGHT_WINDOW_HEIGHT },
    { DESCRIPTION_WINDOW_X, DESCRIPTION_WINDOW_Y, DESCRIPTION_WINDOW_WIDTH, DESCRIPTION_WINDOW_HEIGHT },
};

struct PokedexMovePanel {
    HeapID heapId;
    Font *font;
    PokedexDetailBlend *blend;
    MsgData *msgData;
    MsgData *moveNames;
    MsgData *descriptions;
    WordSet *wordSet;
    StrBuf *message;
    StrBuf *text;
    StrBuf *line;
    // The tiles' pixels, and where they are on BG 1 while the panel is open
    u32 tiles[TILE_COUNT][TILE_SIZE / 4];
    u32 tilePos;
    BmpWin *windows[WINDOW_COUNT];
    BOOL open;
    // The icons, and the characters each shows, loaded for each move
    u32 iconPalette;
    u32 iconCellAnims;
    u32 typeChars;
    u32 categoryChars;
    ClActor *typeIcon;
    ClActor *categoryIcon;
};

static void PokedexMovePanel_MakeTiles(PokedexMovePanel *panel);
static void PokedexMovePanel_Open(PokedexMovePanel *panel, PokedexInfo *entry);
static void PokedexMovePanel_DrawMove(PokedexMovePanel *panel, u16 move);
static void PokedexMovePanel_SetIcons(PokedexMovePanel *panel, u16 move);
static u32 PokedexMovePanel_ReplaceChars(PokedexMovePanel *panel, ClActor *actor, u32 chars, u32 fileId);
static void PokedexMovePanel_Print(PokedexMovePanel *panel, u32 window, const StrBuf *text, int x, int y, u32 align);
static void PokedexMovePanel_PrintMessage(PokedexMovePanel *panel, u32 window, u32 messageId, int x, int y, u32 align);
static void PokedexMovePanel_PrintValue(PokedexMovePanel *panel, u32 window, BOOL known, u32 value, int x, int y);

PokedexMovePanel *PokedexMovePanel_Create(HeapID heapId, Font *font, ClActUnit *unit, PokedexDetailBlend *blend) {
    PokedexMovePanel *panel =
        GFL_HeapAllocate(heapId, sizeof(PokedexMovePanel), TRUE, "paperwhite2_pokedex_move_panel.c", __LINE__);
    ArcTool *arc = GFL_ArcSysCreateFileHandle(ARCID_APP_MENU_COMMON, heapId);
    ClActorSetup setup;

    panel->heapId = heapId;
    panel->font = font;
    panel->blend = blend;
    panel->msgData = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_POKEDEX_DATA, heapId);
    panel->moveNames = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_MOVE_NAMES, heapId);
    panel->descriptions = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_BTL_MAIN_13, heapId);
    panel->wordSet = GFL_WordSetSystemCreateDefault(heapId);
    panel->message = GFL_StrBufCreate(0x80, heapId);
    panel->text = GFL_StrBufCreate(0x100, heapId);
    panel->line = GFL_StrBufCreate(0x80, heapId);
    PokedexMovePanel_MakeTiles(panel);

    // The icons, hidden while the panel is closed, each with the first type's or category's characters until a move
    // is shown
    panel->iconPalette = ClActSys_LoadPlttRange(arc, AppMenuCommon_GetTypeIconPaletteFile(), CLACT_VRAM_MAIN,
                                                ICON_PALETTE * 0x20, 0, ICON_PALETTE_COUNT, heapId);
    panel->iconCellAnims = ClActSys_LoadCellAnims(arc, AppMenuCommon_GetTypeIconCellFile(ICON_MAPPING),
                                                  AppMenuCommon_GetTypeIconAnimFile(ICON_MAPPING), heapId);
    panel->typeChars = ClActSys_LoadChars(arc, AppMenuCommon_GetTypeIconCharFile(0), FALSE, CLACT_VRAM_MAIN, heapId);
    panel->categoryChars =
        ClActSys_LoadChars(arc, AppMenuCommon_GetCategoryIconCharFile(0), FALSE, CLACT_VRAM_MAIN, heapId);
    GFL_ArcToolFree(arc);
    setup.sequence = 0;
    setup.priority = 0;
    // Over BG 1, which has the panel
    setup.bgPriority = 0;
    setup.x = TYPE_ICON_X;
    setup.y = TYPE_ICON_Y;
    panel->typeIcon = ClActor_Create(unit, panel->typeChars, panel->iconPalette, panel->iconCellAnims, &setup,
                                     CLACT_SURFACE_MAIN, heapId);
    setup.x = CATEGORY_ICON_X;
    setup.y = CATEGORY_ICON_Y;
    panel->categoryIcon = ClActor_Create(unit, panel->categoryChars, panel->iconPalette, panel->iconCellAnims, &setup,
                                         CLACT_SURFACE_MAIN, heapId);
    ClActor_SetVisible(panel->typeIcon, FALSE);
    ClActor_SetVisible(panel->categoryIcon, FALSE);
    return panel;
}

// The page closes the panel before it frees the entry
void PokedexMovePanel_Free(PokedexMovePanel *panel) {
    ClActor_Delete(panel->categoryIcon);
    ClActor_Delete(panel->typeIcon);
    ClActSys_FreeChars(panel->categoryChars);
    ClActSys_FreeChars(panel->typeChars);
    ClActSys_FreeCellAnims(panel->iconCellAnims);
    ClActSys_FreePltt(panel->iconPalette);
    GFL_StrBufFree(panel->line);
    GFL_StrBufFree(panel->text);
    GFL_StrBufFree(panel->message);
    GFL_WordSetSystemFree(panel->wordSet);
    GFL_MsgDataFree(panel->descriptions);
    GFL_MsgDataFree(panel->moveNames);
    GFL_MsgDataFree(panel->msgData);
    GFL_HeapFree(panel);
}

// An opening panel's screen goes to VRAM at once, after its windows' characters, so that no frame shows the entry's
// old screen over the panel's characters or the panel's screen over the entry's old characters; the dimming starts
// with it
void PokedexMovePanel_Show(PokedexMovePanel *panel, PokedexInfo *entry, u16 move) {
    BOOL opening = !panel->open;

    if (opening) {
        PokedexMovePanel_Open(panel, entry);
    }
    PokedexMovePanel_DrawMove(panel, move);
    PokedexMovePanel_SetIcons(panel, move);
    if (opening) {
        GFL_BGSysLoadScr(PANEL_BG);
        G2x_SetBlendBrightness_(REG_BLDCNT_ADDR, DIM_PLANES, DIM_BRIGHTNESS);
    }
}

// The panel's screen is cleared at once, as the entry's windows will take its characters, and the entry is printed
// again; the dimming ends as the page's blend leaves the screen, shown
void PokedexMovePanel_Close(PokedexMovePanel *panel, PokedexInfo *entry, u32 language) {
    u32 i;

    if (!panel->open) {
        return;
    }
    panel->open = FALSE;
    for (i = 0; i < WINDOW_COUNT; i++) {
        BmpWin_Free(panel->windows[i]);
        panel->windows[i] = NULL;
    }
    GFL_BGSysFillScrArea(PANEL_BG, 0, PANEL_TILE_X, PANEL_TILE_Y, PANEL_TILE_WIDTH, PANEL_TILE_HEIGHT, 0);
    GFL_BGSysLoadScr(PANEL_BG);
    GFL_BGSysFreeCharMemory(PANEL_BG, panel->tilePos, TILE_COUNT * TILE_SIZE);
    ClActor_SetVisible(panel->typeIcon, FALSE);
    ClActor_SetVisible(panel->categoryIcon, FALSE);
    PokedexDetailBlend_SetIn(0, panel->blend);
    PokedexInfo_RestoreText(entry, language);
}

BOOL PokedexMovePanel_IsOpen(PokedexMovePanel *panel) {
    return panel->open;
}

// Each tile's pixels from its edges: an edge's line is the border, a pixel in from the tile's side for the left and
// bottom edges, with clear pixels outside it, and the rest is the fill
static void PokedexMovePanel_MakeTiles(PokedexMovePanel *panel) {
    u32 i;
    u32 x;
    u32 y;

    for (i = 0; i < TILE_COUNT; i++) {
        u8 *pixels = (u8 *)panel->tiles[i];
        u32 edges = sTileEdges[i];

        for (y = 0; y < 8; y++) {
            for (x = 0; x < 8; x++) {
                u8 color = COLOR_FILL;

                if (((edges & EDGE_LEFT) && x == 0) || ((edges & EDGE_RIGHT) && x != 0) ||
                    ((edges & EDGE_BOTTOM) && y > 1)) {
                    color = COLOR_CLEAR;
                } else if (((edges & EDGE_LEFT) && x == 1) || (edges & EDGE_RIGHT) || ((edges & EDGE_TOP) && y == 0) ||
                           ((edges & EDGE_BOTTOM) && y == 1)) {
                    color = COLOR_BORDER;
                }
                // Two pixels a byte, the left one in the low nibble
                pixels[y * 4 + x / 2] |= color << (x % 2 * 4);
            }
        }
    }
}

// Frees the entry's text, puts the panel's tiles and palette on BG 1, and fills the panel's screen in the screen buffer
// with its tiles and its windows
static void PokedexMovePanel_Open(PokedexMovePanel *panel, PokedexInfo *entry) {
    u32 right = PANEL_TILE_X + PANEL_TILE_WIDTH - 1;
    u32 bottom = PANEL_TILE_Y + PANEL_TILE_HEIGHT - 1;
    u32 i;

    PokedexInfo_FreeText(entry);
    panel->tilePos = GFL_BGSysLoadCharDynamic(PANEL_BG, panel->tiles, TILE_COUNT * TILE_SIZE);
    GFL_BGSysUploadStdPalette(PANEL_BG, sPanelColors, sizeof(sPanelColors), PANEL_PALETTE * 0x20);
    GFL_BGSysFillScrArea(PANEL_BG, panel->tilePos + TILE_FILL, PANEL_TILE_X + 1, PANEL_TILE_Y + 1, PANEL_TILE_WIDTH - 2,
                         PANEL_TILE_HEIGHT - 2, PANEL_PALETTE);
    GFL_BGSysFillScrArea(PANEL_BG, panel->tilePos + TILE_TOP, PANEL_TILE_X + 1, PANEL_TILE_Y, PANEL_TILE_WIDTH - 2, 1,
                         PANEL_PALETTE);
    GFL_BGSysFillScrArea(PANEL_BG, panel->tilePos + TILE_BOTTOM, PANEL_TILE_X + 1, bottom, PANEL_TILE_WIDTH - 2, 1,
                         PANEL_PALETTE);
    GFL_BGSysFillScrArea(PANEL_BG, panel->tilePos + TILE_LEFT, PANEL_TILE_X, PANEL_TILE_Y + 1, 1, PANEL_TILE_HEIGHT - 2,
                         PANEL_PALETTE);
    GFL_BGSysFillScrArea(PANEL_BG, panel->tilePos + TILE_RIGHT, right, PANEL_TILE_Y + 1, 1, PANEL_TILE_HEIGHT - 2,
                         PANEL_PALETTE);
    GFL_BGSysFillScrArea(PANEL_BG, panel->tilePos + TILE_TOP_LEFT, PANEL_TILE_X, PANEL_TILE_Y, 1, 1, PANEL_PALETTE);
    GFL_BGSysFillScrArea(PANEL_BG, panel->tilePos + TILE_TOP_RIGHT, right, PANEL_TILE_Y, 1, 1, PANEL_PALETTE);
    GFL_BGSysFillScrArea(PANEL_BG, panel->tilePos + TILE_BOTTOM_LEFT, PANEL_TILE_X, bottom, 1, 1, PANEL_PALETTE);
    GFL_BGSysFillScrArea(PANEL_BG, panel->tilePos + TILE_BOTTOM_RIGHT, right, bottom, 1, 1, PANEL_PALETTE);
    for (i = 0; i < WINDOW_COUNT; i++) {
        panel->windows[i] = BmpWin_CreateDynamic(PANEL_BG, sWindowRects[i][0], sWindowRects[i][1], sWindowRects[i][2],
                                                 sWindowRects[i][3], PANEL_PALETTE, FALSE);
        BmpWin_FlushMap(panel->windows[i]);
    }
    panel->open = TRUE;
}

// The labels and the move's text, into the windows filled with the panel's color, whose characters go to VRAM at once
static void PokedexMovePanel_DrawMove(PokedexMovePanel *panel, u16 move) {
    u32 power = PML_MoveGetParam(move, MOVE_PARAM_POWER);
    u32 accuracy = PML_MoveGetParam(move, MOVE_PARAM_ACCURACY);
    s32 priority = PML_MoveGetParam(move, MOVE_PARAM_PRIORITY);
    u32 lines;
    u32 i;

    for (i = 0; i < WINDOW_COUNT; i++) {
        GFL_BitmapFill(BmpWin_GetBitmap(panel->windows[i]), COLOR_FILL);
    }
    GFL_MsgDataLoadStrbuf(panel->moveNames, move, panel->text);
    PokedexMovePanel_Print(panel, WINDOW_NAME, panel->text, NAME_X, NAME_Y, PRINT_ALIGN_LEFT);

    PokedexMovePanel_PrintMessage(panel, WINDOW_LEFT, PokedexData_Text_Category, LABEL_X, CATEGORY_Y, PRINT_ALIGN_LEFT);
    PokedexMovePanel_PrintMessage(panel, WINDOW_LEFT, PokedexData_Text_Power, LABEL_X, POWER_Y, PRINT_ALIGN_LEFT);
    PokedexMovePanel_PrintMessage(panel, WINDOW_LEFT, PokedexData_Text_Accuracy, LABEL_X, ACCURACY_Y, PRINT_ALIGN_LEFT);
    PokedexMovePanel_PrintValue(panel, WINDOW_LEFT, power > POWER_NONE, power, POWER_VALUE_X, POWER_Y);
    PokedexMovePanel_PrintValue(panel, WINDOW_LEFT, accuracy != 0 && !PML_MoveIsAlwaysHit(move), accuracy,
                                ACCURACY_VALUE_X, ACCURACY_Y);

    PokedexMovePanel_PrintMessage(panel, WINDOW_RIGHT, PokedexData_Text_PP, RIGHT_LABEL_X, PP_Y, PRINT_ALIGN_LEFT);
    PokedexMovePanel_PrintMessage(panel, WINDOW_RIGHT, PokedexData_Text_Priority, RIGHT_LABEL_X, PRIORITY_Y,
                                  PRINT_ALIGN_LEFT);
    PokedexMovePanel_PrintValue(panel, WINDOW_RIGHT, TRUE, PML_MoveGetParam(move, MOVE_PARAM_PP), RIGHT_VALUE_X, PP_Y);
    if (priority == 0) {
        PokedexMovePanel_PrintValue(panel, WINDOW_RIGHT, TRUE, 0, RIGHT_VALUE_X, PRIORITY_Y);
    } else {
        WordSetNumber(panel->wordSet, 0, priority > 0 ? priority : -priority, 1, NUM_PAD_NONE, TRUE);
        PokedexMovePanel_PrintMessage(panel, WINDOW_RIGHT,
                                      priority > 0 ? PokedexData_Text_PriorityPlus : PokedexData_Text_PriorityMinus,
                                      RIGHT_VALUE_X, PRIORITY_Y, PRINT_ALIGN_CENTER);
    }

    // The description's lines, each on its own to space them as the panel does
    GFL_MsgDataLoadStrbuf(panel->descriptions, move, panel->text);
    lines = GFL_FontGetLineCount(panel->text);
    for (i = 0; i < lines && i < DESCRIPTION_LINES; i++) {
        GFL_FontCopyLine(panel->text, panel->line, i);
        PokedexMovePanel_Print(panel, WINDOW_DESCRIPTION, panel->line, DESCRIPTION_X,
                               DESCRIPTION_Y + i * DESCRIPTION_LINE_PITCH, PRINT_ALIGN_LEFT);
    }
    for (i = 0; i < WINDOW_COUNT; i++) {
        BmpWin_FlushChar(panel->windows[i]);
    }
}

// The icons of the move's type and category, shown with their palettes
static void PokedexMovePanel_SetIcons(PokedexMovePanel *panel, u16 move) {
    u32 type = PML_MoveGetParam(move, MOVE_PARAM_TYPE);
    u32 category = PML_MoveGetParam(move, MOVE_PARAM_CATEGORY);

    panel->typeChars = PokedexMovePanel_ReplaceChars(panel, panel->typeIcon, panel->typeChars,
                                                     AppMenuCommon_GetTypeIconCharFile(type));
    ClActor_SetPalette(panel->typeIcon, AppMenuCommon_GetTypeIconPaletteIndex(type), TRUE);
    panel->categoryChars = PokedexMovePanel_ReplaceChars(panel, panel->categoryIcon, panel->categoryChars,
                                                         AppMenuCommon_GetCategoryIconCharFile(category));
    ClActor_SetPalette(panel->categoryIcon, AppMenuCommon_GetCategoryIconPaletteIndex(category), TRUE);
    ClActor_SetVisible(panel->typeIcon, TRUE);
    ClActor_SetVisible(panel->categoryIcon, TRUE);
}

// Shows a file's characters with an actor: they are loaded into a new place first, which the screen doesn't show yet,
// and the old ones are freed after, so that the frame being drawn never shows half of each. Returns the new ones
static u32 PokedexMovePanel_ReplaceChars(PokedexMovePanel *panel, ClActor *actor, u32 chars, u32 fileId) {
    ArcTool *arc = GFL_ArcSysCreateFileHandle(ARCID_APP_MENU_COMMON, panel->heapId);
    u32 newChars = ClActSys_LoadChars(arc, fileId, FALSE, CLACT_VRAM_MAIN, panel->heapId);
    NNSG2dImageProxy proxy;

    GFL_ArcToolFree(arc);
    ClActSys_GetCharProxy(newChars, &proxy);
    ClActor_SetImageProxy(actor, &proxy);
    ClActSys_FreeChars(chars);
    return newChars;
}

// Draws a string into a window, at x and y in the screen's pixels; x is where it starts, ends or is centered
static void PokedexMovePanel_Print(PokedexMovePanel *panel, u32 window, const StrBuf *text, int x, int y, u32 align) {
    u32 width = GFL_FontGetBlockWidth(text, panel->font, 0);

    switch (align) {
    case PRINT_ALIGN_RIGHT:
        x -= width;
        break;
    case PRINT_ALIGN_CENTER:
        x -= width / 2;
        break;
    }
    GFL_TextRendererDrawToBitmapEx(BmpWin_GetBitmap(panel->windows[window]), x - sWindowRects[window][0] * 8,
                                   y - sWindowRects[window][1] * 8, text, panel->font, TEXT_COLOR);
}

// A message of the Pokédex's bank, formatted with the word set
static void PokedexMovePanel_PrintMessage(PokedexMovePanel *panel, u32 window, u32 messageId, int x, int y, u32 align) {
    GFL_MsgDataLoadStrbuf(panel->msgData, messageId, panel->message);
    GFL_WordSetFormatStrbuf(panel->wordSet, panel->text, panel->message);
    PokedexMovePanel_Print(panel, window, panel->text, x, y, align);
}

// A number centered at x, or a dash where the move has none
static void PokedexMovePanel_PrintValue(PokedexMovePanel *panel, u32 window, BOOL known, u32 value, int x, int y) {
    if (!known) {
        PokedexMovePanel_PrintMessage(panel, window, PokedexData_Text_NoValue, x, y, PRINT_ALIGN_CENTER);
        return;
    }
    WordSetNumber(panel->wordSet, 0, value, 3, NUM_PAD_NONE, TRUE);
    PokedexMovePanel_PrintMessage(panel, window, PokedexData_Text_Number, x, y, PRINT_ALIGN_CENTER);
}
