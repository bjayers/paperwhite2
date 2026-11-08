#include "types.h"
#include "constants/arc.h"
#include "constants/pokemon.h"
#include "constants/species.h"
#include "constants/text_banks.h"
#include "gfl/arc.h"
#include "gfl/bg_sys.h"
#include "gfl/bmp.h"
#include "gfl/clact.h"
#include "gfl/heap.h"
#include "gfl/msg.h"
#include "gfl/str.h"
#include "gfl/touchpanel.h"
#include "nitro/gx.h"
#include "nitro/mi.h"
#include "nnsys/g2d.h"
#include "paperwhite2/pokedex_info.h"
#include "pml/evolution.h"
#include "pml/species_names.h"
#include "save/pokedex_savedata.h"
#include "system/gf_font.h"
#include "system/poke_icon.h"
#include "system/printsys.h"
#include "system/str_tool.h"
#include "system/wordset.h"
#include "text/system/pokedex_data.h"

// Paper White 2: the Pokédex Info page's Evo sub-page (docs/paperwhite2/design/pokedex.md): the shown species' whole
// family, from its root, as a strip of their party icons (sub OBJs) under the tab bar and a tree below it, each row a
// Poké Ball icon (caught, seen or not), the name and how it evolves from its parent, with gold lines from each parent
// down and across to its evolutions. All but the icons is drawn into the panels' content window. The game's evolution
// data only points forward, so tools/paperwhite2/pokedex_evo.py packs each species' family root as a member of
// ARCID_POKEDEX_GRA, and the tree is read from the root down through the evolution data (ARCID_EVOLUTIONS)

// ARCID_POKEDEX_GRA's members that tools/paperwhite2/pokedex_evo.py adds after the art's: the family roots (a u16 for
// each species by its number) and the tree's balls (their 16 colors, then each ball's 2 by 2 tiles of 4bpp)
#define EVO_FAMILY_FILE 152
#define EVO_BALLS_FILE 153
#define EVO_BALL_SIZE 16
#define EVO_BALL_TILES 2
#define EVO_PALETTE_SIZE 0x20

enum {
    EVO_BALL_CAUGHT,
    EVO_BALL_SEEN,
    EVO_BALL_UNKNOWN,
    EVO_BALL_COUNT,
};

// The balls' palette is the art's (the top screen's row 0): the colors that the page draws in
#define EVO_COLOR_CLEAR 0
#define EVO_COLOR_WHITE 4
#define EVO_COLOR_DARK 11
#define EVO_COLOR_GOLD 15
#define EVO_TEXT_COLOR PRINT_COLOR(EVO_COLOR_WHITE, EVO_COLOR_DARK, EVO_COLOR_CLEAR)
#define EVO_SHOWN_COLOR PRINT_COLOR(EVO_COLOR_GOLD, EVO_COLOR_DARK, EVO_COLOR_CLEAR)

// The strip of icons, in the screen's pixels: a light band, the icons centered on it in a row, EVO_STRIP_PITCH_MAX
// apart or closer to fit in EVO_STRIP_WIDTH; touching one is touching its column of the band
#define EVO_STRIP_Y 25
#define EVO_STRIP_HEIGHT 33
#define EVO_STRIP_ICON_Y 41
#define EVO_STRIP_CENTER_X 128
#define EVO_STRIP_WIDTH 224
#define EVO_STRIP_PITCH_MAX 32
// The tree's dark panel, with a border EVO_PANEL_BORDER thick
#define EVO_PANEL_X 20
#define EVO_PANEL_Y 64
#define EVO_PANEL_WIDTH 217
#define EVO_PANEL_HEIGHT 98
#define EVO_PANEL_BORDER 2
// The tree's rows, each a ball centered at EVO_ROW_X (EVO_DEPTH_INDENT further for each stage) and the row's center,
// the name EVO_NAME_OFFSET_X right of the ball's center, and the method in font 1 right-aligned at EVO_METHOD_RIGHT,
// at least EVO_METHOD_GAP after the names beside it: half a row higher, between the row and its parent, where the
// parent is the row above (PokedexInfoEvo_IsMethodRaised says when), else on its own row. Up to
// EVO_ROWS_NORMAL rows have their names in font 0 at EVO_ROW_PITCH; more have font 1 at EVO_SMALL_ROW_PITCH, so that
// Eevee's 8 fit
#define EVO_ROW_X 34
#define EVO_DEPTH_INDENT 20
#define EVO_ROW_Y 78
#define EVO_ROW_PITCH 15
#define EVO_ROWS_NORMAL 5
#define EVO_SMALL_ROW_Y 74
#define EVO_SMALL_ROW_PITCH 11
#define EVO_NAME_OFFSET_X 10
#define EVO_METHOD_RIGHT 226
#define EVO_METHOD_GAP 4
// From a row's center to its text's top, in font 0 and font 1 (a raised method's from half a row above its row's)
#define EVO_TEXT_OFFSET_Y 8
#define EVO_SMALL_TEXT_OFFSET_Y 5
// The lines from a parent to its evolutions, as thick as this
#define EVO_LINE_WIDTH 2
// The stages a family has at most: a root, its evolutions and theirs
#define EVO_DEPTH_COUNT 3

// The party icons: the icons' three palettes in sub OBJ rows 5 to 7 (after Moves' cursor and knob, below the touch
// bar's), and each icon's two frames of 32 by 32 pixels, all in one character resource, one after another. Their
// animation is a healthy party Pokémon's
#define EVO_ICON_PALETTE 5
#define EVO_ICON_PALETTE_COUNT 3
#define EVO_ICON_SIZE 0x400
#define EVO_ICON_SEQUENCE 1

// What an evolution's parameter is, for its text: a number (a level, a Beauty), an item, a move or a species; Shedinja
// names its parent, and a trade for a species names the other of Karrablast and Shelmet
enum {
    EVO_PARAM_NUMBER,
    EVO_PARAM_ITEM,
    EVO_PARAM_MOVE,
    EVO_PARAM_SPECIES,
    EVO_PARAM_PARENT,
    EVO_PARAM_PARTNER,
};

// Each method's text in full and shortened, and its parameter's kind, by EVO_METHOD_* (EVO_METHOD_NONE's is never
// shown)
typedef struct {
    u16 message;
    u16 shortMessage;
    u8 param;
} EvoMethodText;

static const EvoMethodText sEvoMethodTexts[] = {
    { PokedexData_Text_EvoLevel, PokedexData_Text_EvoLevelShort, EVO_PARAM_NUMBER },
    { PokedexData_Text_EvoFriendship, PokedexData_Text_EvoFriendshipShort, EVO_PARAM_NUMBER },
    { PokedexData_Text_EvoFriendshipDay, PokedexData_Text_EvoFriendshipDayShort, EVO_PARAM_NUMBER },
    { PokedexData_Text_EvoFriendshipNight, PokedexData_Text_EvoFriendshipNightShort, EVO_PARAM_NUMBER },
    { PokedexData_Text_EvoLevel, PokedexData_Text_EvoLevelShort, EVO_PARAM_NUMBER },
    { PokedexData_Text_EvoTrade, PokedexData_Text_EvoTrade, EVO_PARAM_NUMBER },
    { PokedexData_Text_EvoTradeItem, PokedexData_Text_EvoTradeItemShort, EVO_PARAM_ITEM },
    { PokedexData_Text_EvoTradeSpecies, PokedexData_Text_EvoTradeSpecies, EVO_PARAM_PARTNER },
    { PokedexData_Text_EvoItem, PokedexData_Text_EvoItemShort, EVO_PARAM_ITEM },
    { PokedexData_Text_EvoAttackHigher, PokedexData_Text_EvoAttackHigherShort, EVO_PARAM_NUMBER },
    { PokedexData_Text_EvoAttackEqual, PokedexData_Text_EvoAttackEqualShort, EVO_PARAM_NUMBER },
    { PokedexData_Text_EvoAttackLower, PokedexData_Text_EvoAttackLowerShort, EVO_PARAM_NUMBER },
    { PokedexData_Text_EvoPersonality, PokedexData_Text_EvoPersonalityShort, EVO_PARAM_NUMBER },
    { PokedexData_Text_EvoPersonality, PokedexData_Text_EvoPersonalityShort, EVO_PARAM_NUMBER },
    // Ninjask, as Nincada evolves by level
    { PokedexData_Text_EvoLevel, PokedexData_Text_EvoLevelShort, EVO_PARAM_NUMBER },
    { PokedexData_Text_EvoShedinja, PokedexData_Text_EvoShedinjaShort, EVO_PARAM_PARENT },
    { PokedexData_Text_EvoBeauty, PokedexData_Text_EvoBeautyShort, EVO_PARAM_NUMBER },
    { PokedexData_Text_EvoItemMale, PokedexData_Text_EvoItemMaleShort, EVO_PARAM_ITEM },
    { PokedexData_Text_EvoItemFemale, PokedexData_Text_EvoItemFemaleShort, EVO_PARAM_ITEM },
    { PokedexData_Text_EvoHeldItemDay, PokedexData_Text_EvoHeldItemDayShort, EVO_PARAM_ITEM },
    { PokedexData_Text_EvoHeldItemNight, PokedexData_Text_EvoHeldItemNightShort, EVO_PARAM_ITEM },
    { PokedexData_Text_EvoKnowsMove, PokedexData_Text_EvoKnowsMoveShort, EVO_PARAM_MOVE },
    { PokedexData_Text_EvoSpeciesInParty, PokedexData_Text_EvoSpeciesInPartyShort, EVO_PARAM_SPECIES },
    { PokedexData_Text_EvoLevelMale, PokedexData_Text_EvoLevelMaleShort, EVO_PARAM_NUMBER },
    { PokedexData_Text_EvoLevelFemale, PokedexData_Text_EvoLevelFemaleShort, EVO_PARAM_NUMBER },
    { PokedexData_Text_EvoMagneticField, PokedexData_Text_EvoMagneticFieldShort, EVO_PARAM_NUMBER },
    { PokedexData_Text_EvoMossRock, PokedexData_Text_EvoMossRockShort, EVO_PARAM_NUMBER },
    { PokedexData_Text_EvoIceRock, PokedexData_Text_EvoIceRockShort, EVO_PARAM_NUMBER },
};

// The wordings that a row's method is tried in until one fits: both methods (of a species that evolves two ways, as
// Feebas) in full, then shortened, then the first alone in full, then shortened
enum {
    EVO_WORDING_BOTH,
    EVO_WORDING_BOTH_SHORT,
    EVO_WORDING_FIRST,
    EVO_WORDING_FIRST_SHORT,
    EVO_WORDING_COUNT,
};

// A row of the tree: a species, its stage, its parent's row, and the evolution from the parent into it, with a second
// one if the parent has another (EVO_METHOD_NONE if not)
typedef struct {
    u16 species;
    u8 depth;
    u8 parent;
    Evolution evolution;
    Evolution other;
} EvoRow;

struct PokedexInfoEvo {
    HeapID heapId;
    Font *font;
    Font *smallFont;
    ClActUnit *unit;
    PokeDexSave *pokedex;
    MsgData *msgData;
    WordSet *wordSet;
    StrBuf *message;
    StrBuf *text;
    StrBuf *first;
    StrBuf *second;
    // The balls' file, its colors then its pixels, and a bitmap of the pixels, the balls one under the other
    void *balls;
    GFLBitmap *ballBitmap;
    // The shown family, in the tree's order, and the shown species, its form and sex. Read by the file system, so in
    // the heap: the root, and the evolutions of a row of each stage but the last as its evolutions are added
    EvoRow rows[POKEDEX_INFO_EVO_FAMILY_MAX];
    u32 count;
    u16 species;
    u16 root;
    Evolution evolutions[EVO_DEPTH_COUNT - 1][EVOLUTION_COUNT];
    // The icons, while Evo shows
    BOOL iconsLoaded;
    u32 iconPalette;
    u32 iconCellAnims;
    u32 iconChars;
    ClActor *icons[POKEDEX_INFO_EVO_FAMILY_MAX];
};

static void PokedexInfoEvo_LoadFamily(PokedexInfoEvo *evo, u16 species);
static void PokedexInfoEvo_AddEvolutions(PokedexInfoEvo *evo, u32 row);
static void PokedexInfoEvo_DrawRow(PokedexInfoEvo *evo, GFLBitmap *bitmap, int top, u32 row);
static void PokedexInfoEvo_DrawMethod(PokedexInfoEvo *evo, GFLBitmap *bitmap, int top, u32 row);
static BOOL PokedexInfoEvo_IsMethodRaised(PokedexInfoEvo *evo, u32 row);
static void PokedexInfoEvo_LoadName(PokedexInfoEvo *evo, u32 row);
static int PokedexInfoEvo_GetNameRight(PokedexInfoEvo *evo, u32 row);
static void PokedexInfoEvo_FormatMethod(PokedexInfoEvo *evo, u32 row, const Evolution *evolution, BOOL shortened,
                                        StrBuf *dest);
static void PokedexInfoEvo_ShowIcons(PokedexInfoEvo *evo, u16 form, u16 sex);
static void PokedexInfoEvo_LoadIcons(PokedexInfoEvo *evo);
static BOOL PokedexInfoEvo_IsSmall(PokedexInfoEvo *evo);
static int PokedexInfoEvo_GetRowX(PokedexInfoEvo *evo, u32 row);
static int PokedexInfoEvo_GetRowY(PokedexInfoEvo *evo, u32 row);
static int PokedexInfoEvo_GetRowPitch(PokedexInfoEvo *evo);
static int PokedexInfoEvo_GetIconX(PokedexInfoEvo *evo, u32 row);
static int PokedexInfoEvo_GetIconPitch(PokedexInfoEvo *evo);

PokedexInfoEvo *PokedexInfoEvo_Create(HeapID heapId, Font *font, Font *smallFont, ClActUnit *unit, PokeDexSave *pokedex,
                                      u32 bg, u32 paletteRow) {
    PokedexInfoEvo *evo =
        GFL_HeapAllocate(heapId, sizeof(PokedexInfoEvo), TRUE, "paperwhite2_pokedex_info_evo.c", __LINE__);

    evo->heapId = heapId;
    evo->font = font;
    evo->smallFont = smallFont;
    evo->unit = unit;
    evo->pokedex = pokedex;
    evo->msgData = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_POKEDEX_DATA, heapId);
    evo->wordSet = GFL_WordSetSystemCreateDefault(heapId);
    evo->message = GFL_StrBufCreate(0x80, heapId);
    evo->text = GFL_StrBufCreate(0x80, heapId);
    evo->first = GFL_StrBufCreate(0x80, heapId);
    evo->second = GFL_StrBufCreate(0x80, heapId);
    evo->balls = GFL_ArcSysReadHeapNew(ARCID_POKEDEX_GRA, EVO_BALLS_FILE, heapId);
    evo->ballBitmap = GFL_BitmapWrap((u8 *)evo->balls + EVO_PALETTE_SIZE, EVO_BALL_TILES,
                                     EVO_BALL_TILES * EVO_BALL_COUNT, 0x20, heapId);
    // From the heap, which DMA can read
    GFL_BGSysUploadStdPalette(bg, evo->balls, EVO_PALETTE_SIZE, paletteRow * 0x20);
    return evo;
}

void PokedexInfoEvo_Free(PokedexInfoEvo *evo) {
    PokedexInfoEvo_Hide(evo);
    GFL_BitmapFree(evo->ballBitmap);
    GFL_HeapFree(evo->balls);
    GFL_StrBufFree(evo->second);
    GFL_StrBufFree(evo->first);
    GFL_StrBufFree(evo->text);
    GFL_StrBufFree(evo->message);
    GFL_WordSetSystemFree(evo->wordSet);
    GFL_MsgDataFree(evo->msgData);
    GFL_HeapFree(evo);
}

// The window's characters change at once and the icons in the next VBlank, as the other sub-pages' do. The strip and
// the panel are the user's art (res/paperwhite2/pokedex_art/info_evo.png)
void PokedexInfoEvo_Show(PokedexInfoEvo *evo, GFLBitmap *bitmap, int top, u16 species, u16 form, u16 sex) {
    u32 i;

    PokedexInfoEvo_LoadFamily(evo, species);
    // The lines first, so that the balls cover their ends
    for (i = 1; i < evo->count; i++) {
        u32 parent = evo->rows[i].parent;
        int parentX = PokedexInfoEvo_GetRowX(evo, parent);
        int parentY = PokedexInfoEvo_GetRowY(evo, parent);
        int y = PokedexInfoEvo_GetRowY(evo, i);

        GFL_BitmapFillArea(bitmap, parentX - EVO_LINE_WIDTH / 2, parentY - top, EVO_LINE_WIDTH, y - parentY + 1,
                           EVO_COLOR_GOLD);
        GFL_BitmapFillArea(bitmap, parentX - EVO_LINE_WIDTH / 2, y - EVO_LINE_WIDTH / 2 - top,
                           PokedexInfoEvo_GetRowX(evo, i) - parentX + EVO_LINE_WIDTH / 2, EVO_LINE_WIDTH,
                           EVO_COLOR_GOLD);
    }
    for (i = 0; i < evo->count; i++) {
        PokedexInfoEvo_DrawRow(evo, bitmap, top, i);
    }
    PokedexInfoEvo_ShowIcons(evo, form, sex);
}

void PokedexInfoEvo_Hide(PokedexInfoEvo *evo) {
    u32 i;

    if (!evo->iconsLoaded) {
        return;
    }
    for (i = 0; i < POKEDEX_INFO_EVO_FAMILY_MAX; i++) {
        ClActor_Delete(evo->icons[i]);
    }
    ClActSys_FreeChars(evo->iconChars);
    ClActSys_FreeCellAnims(evo->iconCellAnims);
    ClActSys_FreePltt(evo->iconPalette);
    evo->iconsLoaded = FALSE;
}

// A touch on a species' icon's column of the strip, or across its row of the tree
u16 PokedexInfoEvo_GetTouchedSpecies(PokedexInfoEvo *evo) {
    u32 touchX;
    u32 touchY;
    int x;
    int y;
    u32 i;

    if (!GFL_HIDGetTouchPressedPoint(&touchX, &touchY)) {
        return SPECIES_NONE;
    }
    x = touchX;
    y = touchY;
    for (i = 0; i < evo->count; i++) {
        int iconLeft = PokedexInfoEvo_GetIconX(evo, i) - PokedexInfoEvo_GetIconPitch(evo) / 2;
        int rowTop = PokedexInfoEvo_GetRowY(evo, i) - PokedexInfoEvo_GetRowPitch(evo) / 2;

        if (y >= EVO_STRIP_Y && y < EVO_STRIP_Y + EVO_STRIP_HEIGHT && x >= iconLeft &&
            x < iconLeft + PokedexInfoEvo_GetIconPitch(evo)) {
            return evo->rows[i].species;
        }
        if (x >= EVO_PANEL_X && x < EVO_PANEL_X + EVO_PANEL_WIDTH && y >= rowTop &&
            y < rowTop + PokedexInfoEvo_GetRowPitch(evo)) {
            return evo->rows[i].species;
        }
    }
    return SPECIES_NONE;
}

// The family of the species, from its root down: each species followed by its evolutions and theirs. A species past
// the family table (none has evolutions) is its own root
static void PokedexInfoEvo_LoadFamily(PokedexInfoEvo *evo, u16 species) {
    evo->species = species;
    evo->root = species;
    if (species <= SPECIES_GENESECT) {
        GFL_ArcSysReadRange(&evo->root, ARCID_POKEDEX_GRA, EVO_FAMILY_FILE, species * sizeof(u16), sizeof(u16));
    }
    MI_CpuFill8(evo->rows, 0, sizeof(evo->rows));
    evo->rows[0].species = evo->root;
    evo->count = 1;
    PokedexInfoEvo_AddEvolutions(evo, 0);
}

// Adds the species that a row's species evolves into after it, each followed by its own evolutions. A species that the
// row's evolves into twice (Feebas, by Beauty or by a trade) is one row with both evolutions
static void PokedexInfoEvo_AddEvolutions(PokedexInfoEvo *evo, u32 row) {
    u32 depth = evo->rows[row].depth;
    Evolution *evolutions = evo->evolutions[depth];
    u32 i;
    u32 j;

    if (depth + 1 >= EVO_DEPTH_COUNT) {
        return;
    }
    GFL_ArcSysRead(evolutions, ARCID_EVOLUTIONS, evo->rows[row].species);
    for (i = 0; i < EVOLUTION_COUNT; i++) {
        EvoRow *child = NULL;

        if (evolutions[i].method == EVO_METHOD_NONE || evolutions[i].species == SPECIES_NONE) {
            continue;
        }
        for (j = row + 1; j < evo->count; j++) {
            if (evo->rows[j].parent == row && evo->rows[j].species == evolutions[i].species) {
                child = &evo->rows[j];
            }
        }
        if (child != NULL) {
            if (child->other.method == EVO_METHOD_NONE) {
                child->other = evolutions[i];
            }
            continue;
        }
        if (evo->count >= POKEDEX_INFO_EVO_FAMILY_MAX) {
            return;
        }
        child = &evo->rows[evo->count];
        child->species = evolutions[i].species;
        child->depth = depth + 1;
        child->parent = row;
        child->evolution = evolutions[i];
        evo->count++;
        PokedexInfoEvo_AddEvolutions(evo, evo->count - 1);
    }
}

// A row's ball, by whether its species has been caught or seen, its name, in gold for the shown species and "????"
// for one not yet seen, and how it evolves from its parent
static void PokedexInfoEvo_DrawRow(PokedexInfoEvo *evo, GFLBitmap *bitmap, int top, u32 row) {
    u16 species = evo->rows[row].species;
    Font *font = PokedexInfoEvo_IsSmall(evo) ? evo->smallFont : evo->font;
    int x = PokedexInfoEvo_GetRowX(evo, row);
    int y = PokedexInfoEvo_GetRowY(evo, row);
    u32 ball = EVO_BALL_UNKNOWN;

    if (PokeDex_IsCaught(evo->pokedex, species)) {
        ball = EVO_BALL_CAUGHT;
    } else if (PokeDex_IsSeen(evo->pokedex, species)) {
        ball = EVO_BALL_SEEN;
    }
    GFL_BitmapCopyArea(evo->ballBitmap, bitmap, 0, ball * EVO_BALL_SIZE, x - EVO_BALL_SIZE / 2,
                       y - EVO_BALL_SIZE / 2 - top, EVO_BALL_SIZE, EVO_BALL_SIZE, EVO_COLOR_CLEAR);
    PokedexInfoEvo_LoadName(evo, row);
    GFL_TextRendererDrawToBitmapEx(bitmap, x + EVO_NAME_OFFSET_X,
                                   y - (PokedexInfoEvo_IsSmall(evo) ? EVO_SMALL_TEXT_OFFSET_Y : EVO_TEXT_OFFSET_Y) -
                                       top,
                                   evo->text, font, species == evo->species ? EVO_SHOWN_COLOR : EVO_TEXT_COLOR);
    if (row != 0) {
        PokedexInfoEvo_DrawMethod(evo, bitmap, top, row);
    }
}

// The row's method in font 1, right-aligned at EVO_METHOD_RIGHT in the first wording that fits after the names beside
// it, its row's and, raised between its row and its parent's, its parent's too; if none fits, the shortest from there
static void PokedexInfoEvo_DrawMethod(PokedexInfoEvo *evo, GFLBitmap *bitmap, int top, u32 row) {
    const EvoRow *evoRow = &evo->rows[row];
    int y = PokedexInfoEvo_GetRowY(evo, row) - EVO_SMALL_TEXT_OFFSET_Y - top;
    int left = PokedexInfoEvo_GetNameRight(evo, row);
    u32 wording = evoRow->other.method != EVO_METHOD_NONE ? EVO_WORDING_BOTH : EVO_WORDING_FIRST;
    u32 width;

    if (PokedexInfoEvo_IsMethodRaised(evo, row)) {
        y -= PokedexInfoEvo_GetRowPitch(evo) / 2;
        if (PokedexInfoEvo_GetNameRight(evo, row - 1) > left) {
            left = PokedexInfoEvo_GetNameRight(evo, row - 1);
        }
    }
    left += EVO_METHOD_GAP;

    for (; wording < EVO_WORDING_COUNT; wording++) {
        BOOL shortened = wording == EVO_WORDING_BOTH_SHORT || wording == EVO_WORDING_FIRST_SHORT;

        PokedexInfoEvo_FormatMethod(evo, row, &evoRow->evolution, shortened, evo->first);
        if (wording < EVO_WORDING_FIRST) {
            PokedexInfoEvo_FormatMethod(evo, row, &evoRow->other, shortened, evo->second);
            GFL_WordSetSetStrbuf(evo->wordSet, 0, evo->first, 0, TRUE, 0);
            GFL_WordSetSetStrbuf(evo->wordSet, 1, evo->second, 0, TRUE, 0);
            GFL_MsgDataLoadStrbuf(evo->msgData, PokedexData_Text_EvoOr, evo->message);
            GFL_WordSetFormatStrbuf(evo->wordSet, evo->text, evo->message);
        } else {
            GFL_StrBufCopy(evo->text, evo->first);
        }
        width = GFL_FontGetBlockWidth(evo->text, evo->smallFont, 0);
        if (left + (int)width <= EVO_METHOD_RIGHT) {
            GFL_TextRendererDrawToBitmapEx(bitmap, EVO_METHOD_RIGHT - width, y, evo->text, evo->smallFont,
                                           EVO_TEXT_COLOR);
            return;
        }
    }
    GFL_TextRendererDrawToBitmapEx(bitmap, left, y, evo->text, evo->smallFont, EVO_TEXT_COLOR);
}

// Whether a row's method is half a row up, between it and its parent: where the row above is its parent (Pignite under
// Tepig) and that row's own method, if any, is raised too, as it would be in the way on its row (Cascoon's, above
// Dustox). Under a sibling or another branch (Glaceon under Leafeon, Cascoon under Beautifly) it stays on its row
static BOOL PokedexInfoEvo_IsMethodRaised(PokedexInfoEvo *evo, u32 row) {
    if (row == 0 || evo->rows[row].parent != row - 1) {
        return FALSE;
    }
    return row - 1 == 0 || PokedexInfoEvo_IsMethodRaised(evo, row - 1);
}

// A row's name into evo->text: its species' name, or "????" for one not yet seen
static void PokedexInfoEvo_LoadName(PokedexInfoEvo *evo, u32 row) {
    u16 species = evo->rows[row].species;

    if (PokeDex_IsSeen(evo->pokedex, species)) {
        GFL_MsgDataLoadStrbuf(g_PMLSpeciesNamesResident, species, evo->text);
    } else {
        GFL_MsgDataLoadStrbuf(evo->msgData, PokedexData_Text_EvoUnknownName, evo->text);
    }
}

// Where a row's name ends, on its right
static int PokedexInfoEvo_GetNameRight(PokedexInfoEvo *evo, u32 row) {
    PokedexInfoEvo_LoadName(evo, row);
    return PokedexInfoEvo_GetRowX(evo, row) + EVO_NAME_OFFSET_X +
           GFL_FontGetBlockWidth(evo->text, PokedexInfoEvo_IsSmall(evo) ? evo->smallFont : evo->font, 0);
}

// An evolution's text, in full or shortened: its number in the word set's slot 0 and its item's, move's or species'
// name in slot 1. Karrablast and Shelmet evolve when traded for each other, which the game checks by their species
// (evolution_check.c), so their parameter is none
static void PokedexInfoEvo_FormatMethod(PokedexInfoEvo *evo, u32 row, const Evolution *evolution, BOOL shortened,
                                        StrBuf *dest) {
    const EvoMethodText *text = &sEvoMethodTexts[EVO_METHOD_LEVEL];
    u16 parent = evo->rows[evo->rows[row].parent].species;

    if (evolution->method < NELEMS(sEvoMethodTexts)) {
        text = &sEvoMethodTexts[evolution->method];
    }
    WordSetNumber(evo->wordSet, 0, evolution->param, 3, NUM_PAD_NONE, TRUE);
    switch (text->param) {
    case EVO_PARAM_ITEM:
        loadItemNameToStrbuf(evo->wordSet, 1, evolution->param);
        break;
    case EVO_PARAM_MOVE:
        loadMoveNameToStrbuf(evo->wordSet, 1, evolution->param);
        break;
    case EVO_PARAM_SPECIES:
        WordSet_LoadSpeciesName(evo->wordSet, 1, evolution->param);
        break;
    case EVO_PARAM_PARENT:
        WordSet_LoadSpeciesName(evo->wordSet, 1, parent);
        break;
    case EVO_PARAM_PARTNER:
        if (evolution->param != SPECIES_NONE) {
            WordSet_LoadSpeciesName(evo->wordSet, 1, evolution->param);
        } else {
            WordSet_LoadSpeciesName(evo->wordSet, 1,
                                    parent == SPECIES_KARRABLAST ? SPECIES_SHELMET : SPECIES_KARRABLAST);
        }
        break;
    }
    GFL_MsgDataLoadStrbuf(evo->msgData, shortened ? text->shortMessage : text->message, evo->message);
    GFL_WordSetFormatStrbuf(evo->wordSet, dest, evo->message);
}

// Each species' party icon in the strip, or the "?" of the Bad Egg's for one not yet seen: its two frames written into
// its place in the icons' characters, which its actor shows. The icons show in the shown species' form and sex where
// they have them (Burmy's cloaks are Wormadam's), as the icons' files fall back to the first form and the male
static void PokedexInfoEvo_ShowIcons(PokedexInfoEvo *evo, u16 form, u16 sex) {
    ArcTool *arc;
    u32 i;

    PokedexInfoEvo_LoadIcons(evo);
    arc = GFL_ArcSysCreateFileHandle(ARCID_POKEICON, evo->heapId);
    for (i = 0; i < POKEDEX_INFO_EVO_FAMILY_MAX; i++) {
        u16 species = evo->rows[i].species;
        u16 iconForm = form;
        u16 iconSex = sex;
        NNSG2dImageProxy proxy;
        NNSG2dCharacterData *chars;
        ClActorPos pos;
        void *file;

        if (i >= evo->count) {
            ClActor_SetVisible(evo->icons[i], FALSE);
            continue;
        }
        if (!PokeDex_IsSeen(evo->pokedex, species)) {
            species = SPECIES_BAD_EGG;
            iconForm = 0;
            iconSex = 0;
        }
        file = GFL_ArcToolReadHeapNew(arc, PokeParty_GetIconIndex(species, iconForm, iconSex, FALSE),
                                      HEAPID_TAIL(evo->heapId));
        NNS_G2dGetUnpackedCharacterData(file, &chars);
        ClActSys_WriteCharData(evo->iconChars, chars->pRawData, EVO_ICON_SIZE, i * EVO_ICON_SIZE, CLACT_VRAM_SUB);
        GFL_HeapFree(file);
        ClActSys_GetCharProxy(evo->iconChars, &proxy);
        proxy.vramLocation.baseAddrOfVram[NNS_G2D_VRAM_TYPE_2DSUB] += i * EVO_ICON_SIZE;
        ClActor_SetImageProxy(evo->icons[i], &proxy);
        ClActor_SetPalette(evo->icons[i], PokeIcon_GetPalette(species, iconForm, iconSex, FALSE), TRUE);
        pos.x = PokedexInfoEvo_GetIconX(evo, i);
        pos.y = EVO_STRIP_ICON_Y;
        ClActor_SetSurfacePos(evo->icons[i], &pos, CLACT_SURFACE_SUB);
        ClActor_SetVisible(evo->icons[i], TRUE);
    }
    GFL_ArcToolFree(arc);
}

// The icons' palettes, cells and one character resource for all of them, with an actor for each, hidden, loaded as
// Evo shows and freed as it hides, so that they take three of the screen's OBJ resources only then. They are
// semi-transparent, as the page's other OBJs are, so that the page's fades darken them
static void PokedexInfoEvo_LoadIcons(PokedexInfoEvo *evo) {
    ArcTool *arc;
    ClActorSetup setup;
    u32 i;

    if (evo->iconsLoaded) {
        return;
    }
    arc = GFL_ArcSysCreateFileHandle(ARCID_POKEICON, evo->heapId);
    evo->iconPalette = ClActSys_LoadPlttRange(arc, PokeIcon_GetPaletteFile(), CLACT_VRAM_SUB, EVO_ICON_PALETTE * 0x20,
                                              0, EVO_ICON_PALETTE_COUNT, evo->heapId);
    evo->iconCellAnims =
        ClActSys_LoadCellAnims(arc, PokeIcon_GetCellFile_Sub(), getOBJTileMapping_SubEng(), evo->heapId);
    GFL_ArcToolFree(arc);
    evo->iconChars = ClActSys_AllocChars(EVO_ICON_SIZE * POKEDEX_INFO_EVO_FAMILY_MAX, CLACT_VRAM_SUB, evo->heapId);
    setup.x = EVO_STRIP_CENTER_X;
    setup.y = EVO_STRIP_ICON_Y;
    setup.sequence = EVO_ICON_SEQUENCE;
    setup.priority = 0;
    // Over the panels' windows
    setup.bgPriority = 1;
    for (i = 0; i < POKEDEX_INFO_EVO_FAMILY_MAX; i++) {
        evo->icons[i] = ClActor_Create(evo->unit, evo->iconChars, evo->iconPalette, evo->iconCellAnims, &setup,
                                       CLACT_SURFACE_SUB, evo->heapId);
        ClActor_SetAutoAnim(evo->icons[i], TRUE);
        ClActor_SetObjMode(evo->icons[i], GX_OAM_MODE_XLU);
        ClActor_SetVisible(evo->icons[i], FALSE);
    }
    evo->iconsLoaded = TRUE;
}

// A family of more rows than EVO_ROWS_NORMAL has font 1 and the closer rows
static BOOL PokedexInfoEvo_IsSmall(PokedexInfoEvo *evo) {
    return evo->count > EVO_ROWS_NORMAL;
}

// A row's ball's center
static int PokedexInfoEvo_GetRowX(PokedexInfoEvo *evo, u32 row) {
    return EVO_ROW_X + evo->rows[row].depth * EVO_DEPTH_INDENT;
}

static int PokedexInfoEvo_GetRowY(PokedexInfoEvo *evo, u32 row) {
    if (PokedexInfoEvo_IsSmall(evo)) {
        return EVO_SMALL_ROW_Y + row * EVO_SMALL_ROW_PITCH;
    }
    return EVO_ROW_Y + row * EVO_ROW_PITCH;
}

static int PokedexInfoEvo_GetRowPitch(PokedexInfoEvo *evo) {
    return PokedexInfoEvo_IsSmall(evo) ? EVO_SMALL_ROW_PITCH : EVO_ROW_PITCH;
}

// An icon's center in the strip, the row of them centered
static int PokedexInfoEvo_GetIconX(PokedexInfoEvo *evo, u32 row) {
    int pitch = PokedexInfoEvo_GetIconPitch(evo);

    return EVO_STRIP_CENTER_X - (int)(evo->count - 1) * pitch / 2 + (int)row * pitch;
}

static int PokedexInfoEvo_GetIconPitch(PokedexInfoEvo *evo) {
    if (evo->count * EVO_STRIP_PITCH_MAX > EVO_STRIP_WIDTH) {
        return EVO_STRIP_WIDTH / evo->count;
    }
    return EVO_STRIP_PITCH_MAX;
}
