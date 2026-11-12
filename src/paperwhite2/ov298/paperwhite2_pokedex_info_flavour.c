#include "types.h"
#include "constants/arc.h"
#include "constants/species.h"
#include "constants/text_banks.h"
#include "gfl/arc.h"
#include "gfl/arc_util.h"
#include "gfl/bmp.h"
#include "gfl/clact.h"
#include "gfl/heap.h"
#include "gfl/msg.h"
#include "gfl/str.h"
#include "gfl/tcb.h"
#include "nitro/gx.h"
#include "nitro/mi.h"
#include "nitro/os.h"
#include "nnsys/g2d.h"
#include "paperwhite2/pokedex_info.h"
#include "save/pokedex_savedata.h"
#include "system/gf_font.h"
#include "system/poke_icon.h"
#include "system/printsys.h"
#include "text/system/pokedex_data.h"
#include "text/system/pokedex_detail_form.h"

// Paper White 2: the Pokédex Info page's Flavour (docs/paperwhite2/design/pokedex-flavour.md): the other games'
// Pokédex entries of the shown species, from the member that tools/paperwhite2/dex_flavour.py makes from the user's own
// ROMs at build time, and the version tab on the top screen that names the game of the entry shown. Only the shown
// species' entries are read, by range; the tab is the user's art (res/paperwhite2/pokedex_art/version_flavour.png) as
// TAB_OBJS main OBJs of 32 by 32, and its label LABEL_OBJS OBJs of their own in front of them, whose characters go to
// VRAM in the VBlank with the entry's text (PokedexInfo's VBlank task). While this game's own description shows, the
// tab names the shown form instead, for a species whose forms have names of their own

// ARCID_POKEDEX_GRA's members that tools/paperwhite2/pokedex_evo.py adds (FLAVOUR_MEMBER and TAB_MEMBER there): the
// entries, FLAVOUR_VERSION, then a u32 for each species from SPECIES_NONE to SPECIES_GENESECT where its entries start
// and the end after the last, then each entry's games (a bit each, in FLAVOUR_GAME_* order, in two halves), its flags,
// its characters' count and its characters, ending with the terminator; and the tab's 16 colors, the label's 16, then
// the tab's TAB_WIDTH by TAB_HEIGHT pixels' tiles in the bitmap's order
#define FLAVOUR_FILE 166
#define TAB_FILE 167
#define FLAVOUR_VERSION 2
#define ENTRY_GAMES_LOW 0
#define ENTRY_GAMES_HIGH 1
#define ENTRY_FLAGS 2
#define ENTRY_LENGTH 3
#define ENTRY_HEADER_SIZE 4
// The entry's flag for one too long for the page's font in its window, drawn in the small font
#define ENTRY_SMALL_FONT (1 << 0)

// The games, as the member's bits, in the order they came out
enum {
    FLAVOUR_GAME_RED,
    FLAVOUR_GAME_BLUE,
    FLAVOUR_GAME_YELLOW,
    FLAVOUR_GAME_GOLD,
    FLAVOUR_GAME_SILVER,
    FLAVOUR_GAME_CRYSTAL,
    FLAVOUR_GAME_RUBY,
    FLAVOUR_GAME_SAPPHIRE,
    FLAVOUR_GAME_FIRERED,
    FLAVOUR_GAME_LEAFGREEN,
    FLAVOUR_GAME_EMERALD,
    FLAVOUR_GAME_DIAMOND,
    FLAVOUR_GAME_PEARL,
    FLAVOUR_GAME_PLATINUM,
    FLAVOUR_GAME_HEARTGOLD,
    FLAVOUR_GAME_SOULSILVER,
    FLAVOUR_GAME_BLACK,
    FLAVOUR_GAME_WHITE,
    FLAVOUR_GAME_BLACK2,
    FLAVOUR_GAME_COUNT,
};

// The small font's entry (dex_flavour.py's SMALL_*): from SMALL_TEXT_DY below the page's text, so that its glyphs' tops
// are level with font 0's, a line every SMALL_LINE_STEP pixels (a pixel less than font 1's line feed, so that five
// lines fit the box; the renderer's new line steps font 0's 16), each line drawn on its own
#define SMALL_TEXT_DY 2
#define SMALL_LINE_STEP 9
#define CHAR_NEWLINE 0xFFFE
#define CHAR_EOM 0xFFFF

// The tab: the OBJs' region of the screen (the art's tab is x 0-111, y 123-139), the party icons' cells making each
// OBJ, and its label in font 1 on the first LABEL_OBJS of that region, from TAB_TEXT_X, or as far left as it must to
// end by TAB_TEXT_RIGHT (left of the art's stripes), but not left of TAB_TEXT_MIN_X, as dex_flavour.py checks the
// labels: the game's name, or the short names of the games sharing the entry LABEL_GAP apart, each game in its colour
// over the label's shadow
#define TAB_X 0
#define TAB_Y 120
#define TAB_OBJS 4
#define LABEL_OBJS 3
#define TAB_OBJ_WIDTH 32
#define TAB_HEIGHT 32
#define TAB_OBJ_TILES_ACROSS (TAB_OBJ_WIDTH / 8)
#define TAB_OBJ_TILES (TAB_OBJ_TILES_ACROSS * TAB_HEIGHT / 8)
#define TILE_SIZE 0x20
#define TAB_OBJ_SIZE (TAB_OBJ_TILES * TILE_SIZE)
#define TAB_TILES_ACROSS (TAB_OBJS * TAB_OBJ_TILES_ACROSS)
#define TAB_CHARS_SIZE (TAB_OBJS * TAB_OBJ_SIZE)
#define LABEL_TILES_ACROSS (LABEL_OBJS * TAB_OBJ_TILES_ACROSS)
#define LABEL_CHARS_SIZE (LABEL_OBJS * TAB_OBJ_SIZE)
#define TAB_COLORS 16
#define TAB_TEXT_X 11
#define TAB_TEXT_RIGHT 89
#define TAB_TEXT_MIN_X 2
#define TAB_TEXT_Y 8
#define LABEL_GAP 2
// The label's palette's shadow (dex_flavour.py's LABEL_SHADOW)
#define LABEL_SHADOW 1
// The forms' names, the forms page's (pokedex_detail_form.c): TEXT_BANK_POKEDEX_DETAIL_FORM's message of a species'
// first form is the species', and each next form's follows the last's through the table of next forms (its member 0).
// The widest, "Blue-Striped Form", is 78 pixels in font 1, the label's room from TAB_TEXT_X to TAB_TEXT_RIGHT
#define ARCID_FORM_NAME_TABLE 97
// No form's name on the tab: message 0 is SPECIES_NONE's, never a form's
#define FORM_TEXT_NONE 0
// In front of the entry's BGs (its panels on BG 2 and 3, its text on BG 1), the label in front of the tab
#define TAB_BG_PRIORITY 0
#define TAB_PRIORITY 2
#define LABEL_PRIORITY 1
// Main OBJ palette rows that nothing on the page uses while the tab shows: the type icons have rows 2-4, the footprint
// 5, the move panel's icons 9-11, and Area's map 0, 1, 6, 7 and 12-15 (the move panel and the map hide the tab, and
// both palettes load again with the label's characters when it shows)
#define TAB_ROW 8
#define LABEL_ROW 13

struct PokedexInfoFlavour {
    HeapID heapId;
    Font *smallFont;
    MsgData *msgData;
    StrBuf *text;
    StrBuf *word;
    // Whether the member is of this page's format
    BOOL valid;
    // The species' place in the member, read into the work as the file system reads by DMA, its entries, and where each
    // starts in them
    u32 range[2];
    u16 *entries;
    const u16 *starts[FLAVOUR_GAME_COUNT];
    u32 count;
    // The tab: its OBJs' characters, the tab's then the label's in one resource (the page's character resources are
    // few: Area's map going to Evo leaves one free), their palettes and cells, the OBJs, the member with the art's and
    // the label's colors, the bitmap the label is drawn in, its characters waiting for the VBlank, and the games whose
    // label it shows, 0 while it is hidden
    u32 chars;
    u32 palette;
    u32 cellAnims;
    ClActor *tabObjs[TAB_OBJS];
    ClActor *labelObjs[LABEL_OBJS];
    u16 *art;
    GFLBitmap *bitmap;
    u8 *pending;
    u32 shownGames;
    TCB *vblankTcb;
    // The forms' names and the table of next forms, the shown species, whether its forms have names that tell them
    // apart (not Unown's "One form" or Arceus's "Arceus" for each), and the form's name the tab shows, FORM_TEXT_NONE
    // while it shows the games or is hidden
    MsgData *formMsgData;
    u16 *formNameTable;
    u16 species;
    BOOL formsNamed;
    u32 shownFormText;
};

static void PokedexInfoFlavour_VBlank(TCB *tcb, void *data);
static void PokedexInfoFlavour_LoadColors(PokedexInfoFlavour *flavour);
static ClActor *PokedexInfoFlavour_CreateObj(PokedexInfoFlavour *flavour, ClActUnit *unit, u32 offset, u32 i,
                                             u8 priority);
static void PokedexInfoFlavour_CreateTab(PokedexInfoFlavour *flavour, ClActUnit *unit);
static void PokedexInfoFlavour_ToObjOrder(const u8 *pixels, u32 tilesAcross, u32 objs, u8 *chars);
static u32 PokedexInfoFlavour_MakeLabel(PokedexInfoFlavour *flavour, u32 games, GFLBitmap *bitmap, int x);
static void PokedexInfoFlavour_DrawLabel(PokedexInfoFlavour *flavour, u32 games, u32 formText);
static int PokedexInfoFlavour_GetLabelX(u32 width);
static u32 PokedexInfoFlavour_GetFormText(PokedexInfoFlavour *flavour, u32 form);

// Each game's name, for an entry of its own, and its short name, for one that games share
static const u16 sGameNames[FLAVOUR_GAME_COUNT] = {
    PokedexData_Text_GameRed,        PokedexData_Text_GameBlue,     PokedexData_Text_GameYellow,
    PokedexData_Text_GameGold,       PokedexData_Text_GameSilver,   PokedexData_Text_GameCrystal,
    PokedexData_Text_GameRuby,       PokedexData_Text_GameSapphire, PokedexData_Text_GameFireRed,
    PokedexData_Text_GameLeafGreen,  PokedexData_Text_GameEmerald,  PokedexData_Text_GameDiamond,
    PokedexData_Text_GamePearl,      PokedexData_Text_GamePlatinum, PokedexData_Text_GameHeartGold,
    PokedexData_Text_GameSoulSilver, PokedexData_Text_GameBlack,    PokedexData_Text_GameWhite,
    PokedexData_Text_GameBlack2,
};
static const u16 sGameShortNames[FLAVOUR_GAME_COUNT] = {
    PokedexData_Text_GameShortRed,        PokedexData_Text_GameShortBlue,     PokedexData_Text_GameShortYellow,
    PokedexData_Text_GameShortGold,       PokedexData_Text_GameShortSilver,   PokedexData_Text_GameShortCrystal,
    PokedexData_Text_GameShortRuby,       PokedexData_Text_GameShortSapphire, PokedexData_Text_GameShortFireRed,
    PokedexData_Text_GameShortLeafGreen,  PokedexData_Text_GameShortEmerald,  PokedexData_Text_GameShortDiamond,
    PokedexData_Text_GameShortPearl,      PokedexData_Text_GameShortPlatinum, PokedexData_Text_GameShortHeartGold,
    PokedexData_Text_GameShortSoulSilver, PokedexData_Text_GameShortBlack,    PokedexData_Text_GameShortWhite,
    PokedexData_Text_GameShortBlack2,
};
// Each game's colour of the label, a slot of its palette (dex_flavour.py's LABEL_COLORS): games of one colour have
// names that tell them apart and are never side by side
static const u8 sGameColors[FLAVOUR_GAME_COUNT] = { 2, 3, 4, 5, 6, 7, 8, 9, 2, 10, 10, 3, 11, 12, 4, 13, 14, 15, 14 };

PokedexInfoFlavour *PokedexInfoFlavour_Create(HeapID heapId, Font *smallFont, ClActUnit *unit) {
    PokedexInfoFlavour *flavour =
        GFL_HeapAllocate(heapId, sizeof(PokedexInfoFlavour), TRUE, "paperwhite2_pokedex_info_flavour.c", __LINE__);
    u32 size;

    flavour->heapId = heapId;
    flavour->smallFont = smallFont;
    flavour->msgData = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_POKEDEX_DATA, heapId);
    flavour->text = GFL_StrBufCreate(0x100, heapId);
    flavour->word = GFL_StrBufCreate(0x20, heapId);
    flavour->formMsgData = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_POKEDEX_DETAIL_FORM, heapId);
    flavour->formNameTable = GFL_ArcSysReadHeapNewLZGetLen(ARCID_FORM_NAME_TABLE, 0, FALSE, heapId, &size);
    GFL_ArcSysReadRange(flavour->range, ARCID_POKEDEX_GRA, FLAVOUR_FILE, 0, sizeof(u32));
    flavour->valid = flavour->range[0] == FLAVOUR_VERSION;
    PokedexInfoFlavour_CreateTab(flavour, unit);
    flavour->vblankTcb = GFL_VBlankTCBAdd(PokedexInfoFlavour_VBlank, flavour, 0);
    return flavour;
}

void PokedexInfoFlavour_Free(PokedexInfoFlavour *flavour) {
    u32 i;

    GFL_TCBRemove(flavour->vblankTcb);
    if (flavour->pending != NULL) {
        GFL_HeapFree(flavour->pending);
    }
    for (i = 0; i < TAB_OBJS; i++) {
        ClActor_Delete(flavour->tabObjs[i]);
    }
    for (i = 0; i < LABEL_OBJS; i++) {
        ClActor_Delete(flavour->labelObjs[i]);
    }
    GFL_BitmapFree(flavour->bitmap);
    GFL_HeapFree(flavour->art);
    ClActSys_FreeChars(flavour->chars);
    ClActSys_FreeCellAnims(flavour->cellAnims);
    ClActSys_FreePltt(flavour->palette);
    if (flavour->entries != NULL) {
        GFL_HeapFree(flavour->entries);
    }
    GFL_HeapFree(flavour->formNameTable);
    GFL_MsgDataFree(flavour->formMsgData);
    GFL_StrBufFree(flavour->word);
    GFL_StrBufFree(flavour->text);
    GFL_MsgDataFree(flavour->msgData);
    GFL_HeapFree(flavour);
}

// Reads the species' entries, the other games' that differ from this game's, and whether its forms' names tell them
// apart: a species of forms has them all named the same or each its own (the first two say which)
void PokedexInfoFlavour_LoadSpecies(PokedexInfoFlavour *flavour, u16 species) {
    const u16 *entry;
    const u16 *end;

    flavour->species = species;
    flavour->formsNamed = FALSE;
    if (species <= SPECIES_GENESECT && getNumberOfForms(species) >= 2) {
        GFL_MsgDataLoadStrbuf(flavour->formMsgData, PokedexInfoFlavour_GetFormText(flavour, 0), flavour->word);
        GFL_MsgDataLoadStrbuf(flavour->formMsgData, PokedexInfoFlavour_GetFormText(flavour, 1), flavour->text);
        flavour->formsNamed = !GFL_StrBufCmp(flavour->word, flavour->text);
    }
    if (flavour->entries != NULL) {
        GFL_HeapFree(flavour->entries);
        flavour->entries = NULL;
    }
    flavour->count = 0;
    if (!flavour->valid || species > SPECIES_GENESECT) {
        return;
    }
    GFL_ArcSysReadRange(flavour->range, ARCID_POKEDEX_GRA, FLAVOUR_FILE, (species + 1) * sizeof(u32),
                        sizeof(flavour->range));
    if (flavour->range[1] <= flavour->range[0]) {
        return;
    }
    flavour->entries = GFL_ArcSysReadHeapNewRange(ARCID_POKEDEX_GRA, FLAVOUR_FILE, flavour->heapId, flavour->range[0],
                                                  flavour->range[1] - flavour->range[0]);
    entry = flavour->entries;
    end = flavour->entries + (flavour->range[1] - flavour->range[0]) / sizeof(u16);
    while (entry < end && flavour->count < FLAVOUR_GAME_COUNT) {
        flavour->starts[flavour->count++] = entry;
        entry += ENTRY_HEADER_SIZE + entry[ENTRY_LENGTH];
    }
}

u32 PokedexInfoFlavour_GetCount(PokedexInfoFlavour *flavour) {
    return flavour->count;
}

// Draws the species' entry (from 1, in the member's order) into the bitmap, as PokedexInfo prints its description, or
// in the small font for one too long for the window in font
void PokedexInfoFlavour_DrawEntry(PokedexInfoFlavour *flavour, u32 index, GFLBitmap *bitmap, Font *font, int x, int y,
                                  u16 color) {
    const u16 *entry = flavour->starts[index - 1];
    const u16 *line = entry + ENTRY_HEADER_SIZE;
    u32 length;

    if (!(entry[ENTRY_FLAGS] & ENTRY_SMALL_FONT)) {
        GFL_StrBufLoadString(flavour->text, line);
        GFL_TextRendererDrawToBitmapEx(bitmap, x, y, flavour->text, font, color);
        return;
    }
    y += SMALL_TEXT_DY;
    for (;;) {
        for (length = 0; line[length] != CHAR_EOM && line[length] != CHAR_NEWLINE; length++) {
        }
        GFL_StrBufLoadFixedString(flavour->text, line, length + 1);
        GFL_TextRendererDrawToBitmapEx(bitmap, x, y, flavour->text, flavour->smallFont, color);
        if (line[length] == CHAR_EOM) {
            break;
        }
        line += length + 1;
        y += SMALL_LINE_STEP;
    }
}

// Shows the tab of the entry (from 1); for 0, the form's name while the description shows, if the species' forms have
// names, else hides it. The OBJs show or hide with the OAM, and a new label's characters load, in the next VBlank, with
// the entry's text
void PokedexInfoFlavour_ShowTab(PokedexInfoFlavour *flavour, u32 index, BOOL description, u16 form) {
    const u16 *entry = index != 0 ? flavour->starts[index - 1] : NULL;
    u32 games = entry != NULL ? entry[ENTRY_GAMES_LOW] | entry[ENTRY_GAMES_HIGH] << 16 : 0;
    u32 formText = games == 0 && description && flavour->formsNamed ? PokedexInfoFlavour_GetFormText(flavour, form)
                                                                    : FORM_TEXT_NONE;
    BOOL shown = games != 0 || formText != FORM_TEXT_NONE;
    u32 i;

    if (games == flavour->shownGames && formText == flavour->shownFormText) {
        return;
    }
    if (shown) {
        PokedexInfoFlavour_DrawLabel(flavour, games, formText);
    }
    if (shown != (flavour->shownGames != 0 || flavour->shownFormText != FORM_TEXT_NONE)) {
        for (i = 0; i < TAB_OBJS; i++) {
            ClActor_SetVisible(flavour->tabObjs[i], shown);
        }
        for (i = 0; i < LABEL_OBJS; i++) {
            ClActor_SetVisible(flavour->labelObjs[i], shown);
        }
    }
    flavour->shownGames = games;
    flavour->shownFormText = formText;
}

static void PokedexInfoFlavour_VBlank(TCB *tcb, void *data) {
    PokedexInfoFlavour *flavour = data;

    if (flavour->pending != NULL) {
        ClActSys_WriteCharData(flavour->chars, flavour->pending, LABEL_CHARS_SIZE, TAB_CHARS_SIZE, CLACT_VRAM_MAIN);
        PokedexInfoFlavour_LoadColors(flavour);
        GFL_HeapFree(flavour->pending);
        flavour->pending = NULL;
    }
}

// The tab's and the label's colors into their rows, again each time the label changes, in case the move panel or
// Area's map, which hide the tab, had the rows
static void PokedexInfoFlavour_LoadColors(PokedexInfoFlavour *flavour) {
    GX_LoadOBJPltt(flavour->art, TAB_ROW * 0x20, TAB_COLORS * sizeof(GXRgb));
    GX_LoadOBJPltt(flavour->art + TAB_COLORS, LABEL_ROW * 0x20, TAB_COLORS * sizeof(GXRgb));
}

// The tab's or the label's OBJ i, hidden, on the party icons' cells, its characters the ith 32 by 32 from offset in
// the characters
static ClActor *PokedexInfoFlavour_CreateObj(PokedexInfoFlavour *flavour, ClActUnit *unit, u32 offset, u32 i,
                                             u8 priority) {
    NNSG2dImageProxy proxy;
    ClActorSetup setup;
    ClActor *obj;

    MI_CpuFill8(&setup, 0, sizeof(ClActorSetup));
    setup.x = TAB_X + i * TAB_OBJ_WIDTH + TAB_OBJ_WIDTH / 2;
    setup.y = TAB_Y + TAB_HEIGHT / 2;
    setup.bgPriority = TAB_BG_PRIORITY;
    setup.priority = priority;
    obj = ClActor_Create(unit, flavour->chars, flavour->palette, flavour->cellAnims, &setup, CLACT_SURFACE_MAIN,
                         flavour->heapId);
    ClActSys_GetCharProxy(flavour->chars, &proxy);
    proxy.vramLocation.baseAddrOfVram[NNS_G2D_VRAM_TYPE_2DMAIN] += offset + i * TAB_OBJ_SIZE;
    ClActor_SetImageProxy(obj, &proxy);
    ClActor_SetVisible(obj, FALSE);
    return obj;
}

// The tab's OBJs, with its art's characters, and the label's in front of them, on the party icons' cells with one row
// of the party icons' palettes as their palette resource, the tab's and the label's colors loaded over it and the next
static void PokedexInfoFlavour_CreateTab(PokedexInfoFlavour *flavour, ClActUnit *unit) {
    ArcTool *arc = GFL_ArcSysCreateFileHandle(ARCID_POKEICON, flavour->heapId);
    u8 *chars;
    u32 i;

    flavour->palette =
        ClActSys_LoadPlttRange(arc, PokeIcon_GetPaletteFile(), CLACT_VRAM_MAIN, TAB_ROW * 0x20, 0, 1, flavour->heapId);
    flavour->cellAnims =
        ClActSys_LoadCellAnims(arc, PokeIcon_GetCellFile_Main(), getOBJTileMapping_MainEng(), flavour->heapId);
    GFL_ArcToolFree(arc);
    flavour->chars = ClActSys_AllocChars(TAB_CHARS_SIZE + LABEL_CHARS_SIZE, CLACT_VRAM_MAIN, flavour->heapId);
    flavour->bitmap = GFL_BitmapCreate(LABEL_TILES_ACROSS, TAB_HEIGHT / 8, TILE_SIZE, flavour->heapId);
    flavour->art = GFL_ArcSysReadHeapNew(ARCID_POKEDEX_GRA, TAB_FILE, flavour->heapId);
    DC_FlushRange(flavour->art, 2 * TAB_COLORS * sizeof(GXRgb));
    PokedexInfoFlavour_LoadColors(flavour);

    chars = GFL_HeapAllocate(HEAPID_TAIL(flavour->heapId), TAB_CHARS_SIZE, FALSE, "paperwhite2_pokedex_info_flavour.c",
                             __LINE__);
    PokedexInfoFlavour_ToObjOrder((const u8 *)(flavour->art + 2 * TAB_COLORS), TAB_TILES_ACROSS, TAB_OBJS, chars);
    DC_FlushRange(chars, TAB_CHARS_SIZE);
    ClActSys_WriteCharData(flavour->chars, chars, TAB_CHARS_SIZE, 0, CLACT_VRAM_MAIN);
    GFL_HeapFree(chars);

    for (i = 0; i < TAB_OBJS; i++) {
        flavour->tabObjs[i] = PokedexInfoFlavour_CreateObj(flavour, unit, 0, i, TAB_PRIORITY);
        ClActor_SetPalette(flavour->tabObjs[i], 0, TRUE);
    }
    for (i = 0; i < LABEL_OBJS; i++) {
        flavour->labelObjs[i] = PokedexInfoFlavour_CreateObj(flavour, unit, TAB_CHARS_SIZE, i, LABEL_PRIORITY);
        ClActor_SetPalette(flavour->labelObjs[i], LABEL_ROW - TAB_ROW, TRUE);
    }
}

// A region's tiles, tilesAcross by the OBJs' height, into the order of objs OBJs of 32 by 32 from its left
static void PokedexInfoFlavour_ToObjOrder(const u8 *pixels, u32 tilesAcross, u32 objs, u8 *chars) {
    u32 i;

    for (i = 0; i < objs * TAB_OBJ_TILES; i++) {
        u32 obj = i / TAB_OBJ_TILES;
        u32 tile = i % TAB_OBJ_TILES;
        u32 source =
            tile / TAB_OBJ_TILES_ACROSS * tilesAcross + obj * TAB_OBJ_TILES_ACROSS + tile % TAB_OBJ_TILES_ACROSS;

        MI_CpuCopy32(pixels + source * TILE_SIZE, chars + i * TILE_SIZE, TILE_SIZE);
    }
}

// The tab's label of the games sharing an entry: the game's name, or each game's short name LABEL_GAP after the last,
// each in its colour. With no bitmap it only measures the label; returns its width
static u32 PokedexInfoFlavour_MakeLabel(PokedexInfoFlavour *flavour, u32 games, GFLBitmap *bitmap, int x) {
    u32 width = 0;
    u32 i;

    for (i = 0; i < FLAVOUR_GAME_COUNT; i++) {
        if (!(games & (1u << i))) {
            continue;
        }
        if (width != 0) {
            width += LABEL_GAP;
        }
        GFL_MsgDataLoadStrbuf(flavour->msgData, games == 1u << i ? sGameNames[i] : sGameShortNames[i], flavour->word);
        if (bitmap != NULL) {
            GFL_TextRendererDrawToBitmapEx(bitmap, x + width - TAB_X, TAB_TEXT_Y, flavour->word, flavour->smallFont,
                                           PRINT_COLOR(sGameColors[i], LABEL_SHADOW, 0));
        }
        width += GFL_FontGetBlockWidth(flavour->word, flavour->smallFont, 0);
    }
    return width;
}

// The games' label, or with no games the form's name in Black's colour, its tiles into the OBJs' order, for the next
// VBlank
static void PokedexInfoFlavour_DrawLabel(PokedexInfoFlavour *flavour, u32 games, u32 formText) {
    GFLBitmap *bitmap = flavour->bitmap;
    int x;

    GFL_BitmapFill(bitmap, 0);
    if (games != 0) {
        x = PokedexInfoFlavour_GetLabelX(PokedexInfoFlavour_MakeLabel(flavour, games, NULL, 0));
        PokedexInfoFlavour_MakeLabel(flavour, games, bitmap, x);
    } else {
        GFL_MsgDataLoadStrbuf(flavour->formMsgData, formText, flavour->word);
        x = PokedexInfoFlavour_GetLabelX(GFL_FontGetBlockWidth(flavour->word, flavour->smallFont, 0));
        GFL_TextRendererDrawToBitmapEx(bitmap, x - TAB_X, TAB_TEXT_Y, flavour->word, flavour->smallFont,
                                       PRINT_COLOR(sGameColors[FLAVOUR_GAME_BLACK], LABEL_SHADOW, 0));
    }

    if (flavour->pending == NULL) {
        flavour->pending = GFL_HeapAllocate(HEAPID_TAIL(flavour->heapId), LABEL_CHARS_SIZE, FALSE,
                                            "paperwhite2_pokedex_info_flavour.c", __LINE__);
    }
    PokedexInfoFlavour_ToObjOrder(GFL_BitmapGetPixelData(bitmap), LABEL_TILES_ACROSS, LABEL_OBJS, flavour->pending);
    DC_FlushRange(flavour->pending, LABEL_CHARS_SIZE);
}

// A label's left, for its width: from TAB_TEXT_X, or as far left as it must to end by TAB_TEXT_RIGHT, but not left of
// TAB_TEXT_MIN_X
static int PokedexInfoFlavour_GetLabelX(u32 width) {
    int x = TAB_TEXT_RIGHT - (int)width;

    if (x > TAB_TEXT_X) {
        x = TAB_TEXT_X;
    } else if (x < TAB_TEXT_MIN_X) {
        x = TAB_TEXT_MIN_X;
    }
    return x;
}

// The form's name's message, as the forms page finds it (PokedexDetailForm's entries' names): the species', then each
// next form's through the table, the species' again past the table's end
static u32 PokedexInfoFlavour_GetFormText(PokedexInfoFlavour *flavour, u32 form) {
    u32 message = flavour->species;
    u32 i;

    for (i = 0; i != form; i++) {
        message = flavour->formNameTable[message];
        if (message == 0) {
            return flavour->species;
        }
    }
    return message;
}
