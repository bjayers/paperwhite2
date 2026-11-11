#include "types.h"
#include "constants/arc.h"
#include "constants/species.h"
#include "constants/text_banks.h"
#include "gfl/arc.h"
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
#include "system/gf_font.h"
#include "system/poke_icon.h"
#include "system/printsys.h"
#include "text/system/pokedex_data.h"

// Paper White 2: the Pokédex Info page's Flavour (docs/paperwhite2/design/pokedex-flavour.md): the other games'
// Pokédex entries of the shown species, from the member that tools/paperwhite2/dex_flavour.py makes from the user's own
// ROMs at build time, and the version tab on the top screen that names the game of the entry shown. Only the shown
// species' entries are read, by range; the tab is the user's art (res/paperwhite2/pokedex_art/version_flavour.png) as
// TAB_OBJS main OBJs of 32 by 32, with the label drawn over it into their characters, which go to VRAM in the VBlank
// with the entry's text (PokedexInfo's VBlank task)

// ARCID_POKEDEX_GRA's members that tools/paperwhite2/pokedex_evo.py adds (FLAVOUR_MEMBER and TAB_MEMBER there): the
// entries, a u32 for each species from SPECIES_NONE to SPECIES_GENESECT where its entries start and the end after the
// last, then each entry's games (a bit each, in FLAVOUR_GAME_* order), its characters' count and its characters,
// ending with the terminator; and the tab's 16 colors, then its TAB_WIDTH by TAB_HEIGHT pixels' tiles in the bitmap's
// order
#define FLAVOUR_FILE 166
#define TAB_FILE 167
#define ENTRY_HEADER_SIZE 2

// The games, as the member's bits
enum {
    FLAVOUR_GAME_BLACK,
    FLAVOUR_GAME_WHITE,
    FLAVOUR_GAME_BLACK2,
    FLAVOUR_GAME_DIAMOND,
    FLAVOUR_GAME_PEARL,
    FLAVOUR_GAME_PLATINUM,
    FLAVOUR_GAME_HEARTGOLD,
    FLAVOUR_GAME_SOULSILVER,
    FLAVOUR_GAME_COUNT,
};

// The tab: the OBJs' region of the screen (the art's tab is x 0-86, y 123-139), the party icons' cells making each
// OBJ, and its label in font 1 from TAB_TEXT_X, or as far left as it must to end by TAB_TEXT_RIGHT (left of the art's
// stripes), but not left of TAB_TEXT_MIN_X, as dex_flavour.py checks the labels: the art's light grey with its dark
// grey shadow, as the user's example has it
#define TAB_X 0
#define TAB_Y 120
#define TAB_OBJS 3
#define TAB_OBJ_WIDTH 32
#define TAB_HEIGHT 32
#define TAB_OBJ_TILES_ACROSS (TAB_OBJ_WIDTH / 8)
#define TAB_OBJ_TILES (TAB_OBJ_TILES_ACROSS * TAB_HEIGHT / 8)
#define TILE_SIZE 0x20
#define TAB_OBJ_SIZE (TAB_OBJ_TILES * TILE_SIZE)
#define TAB_TILES_ACROSS (TAB_OBJS * TAB_OBJ_TILES_ACROSS)
#define TAB_CHARS_SIZE (TAB_OBJS * TAB_OBJ_SIZE)
#define TAB_COLORS 16
#define TAB_TEXT_X 11
#define TAB_TEXT_RIGHT 64
#define TAB_TEXT_MIN_X 2
#define TAB_TEXT_Y 8
#define TAB_TEXT_COLOR PRINT_COLOR(4, 9, 0)
// In front of the entry's BGs (its panels on BG 2 and 3, its text on BG 1)
#define TAB_BG_PRIORITY 0
#define TAB_PRIORITY 1
// A main OBJ palette row that nothing on the page uses: the type icons have rows 2-4, the footprint 5, the move panel's
// icons 9-11, and Area's map 0, 1, 6, 7 and 12-15
#define TAB_ROW 8

struct PokedexInfoFlavour {
    HeapID heapId;
    Font *smallFont;
    MsgData *msgData;
    StrBuf *text;
    StrBuf *word;
    // The species' place in the member, read into the work as the file system reads by DMA, its entries, and where each
    // starts in them
    u32 range[2];
    u16 *entries;
    const u16 *starts[FLAVOUR_GAME_COUNT];
    u32 count;
    // The tab: its OBJs' characters, palette and cells, its OBJs, the art and the bitmap the label is drawn over it in,
    // the characters waiting for the VBlank, and the games whose label it shows, 0 while it is hidden
    u32 chars;
    u32 palette;
    u32 cellAnims;
    ClActor *objs[TAB_OBJS];
    u8 *art;
    GFLBitmap *bitmap;
    u8 *pending;
    u32 shownGames;
    TCB *vblankTcb;
};

static void PokedexInfoFlavour_VBlank(TCB *tcb, void *data);
static void PokedexInfoFlavour_CreateTab(PokedexInfoFlavour *flavour, ClActUnit *unit);
static void PokedexInfoFlavour_MakeLabel(PokedexInfoFlavour *flavour, u32 games);
static void PokedexInfoFlavour_DrawTab(PokedexInfoFlavour *flavour, u32 games);

// Each game's name, for an entry of its own, and its short name, for one that games share
static const u16 sGameNames[FLAVOUR_GAME_COUNT] = {
    PokedexData_Text_GameBlack,     PokedexData_Text_GameWhite,      PokedexData_Text_GameBlack2,
    PokedexData_Text_GameDiamond,   PokedexData_Text_GamePearl,      PokedexData_Text_GamePlatinum,
    PokedexData_Text_GameHeartGold, PokedexData_Text_GameSoulSilver,
};
static const u16 sGameShortNames[FLAVOUR_GAME_COUNT] = {
    PokedexData_Text_GameShortBlack,     PokedexData_Text_GameShortWhite,      PokedexData_Text_GameShortBlack2,
    PokedexData_Text_GameShortDiamond,   PokedexData_Text_GameShortPearl,      PokedexData_Text_GameShortPlatinum,
    PokedexData_Text_GameShortHeartGold, PokedexData_Text_GameShortSoulSilver,
};

PokedexInfoFlavour *PokedexInfoFlavour_Create(HeapID heapId, Font *smallFont, ClActUnit *unit) {
    PokedexInfoFlavour *flavour =
        GFL_HeapAllocate(heapId, sizeof(PokedexInfoFlavour), TRUE, "paperwhite2_pokedex_info_flavour.c", __LINE__);

    flavour->heapId = heapId;
    flavour->smallFont = smallFont;
    flavour->msgData = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_POKEDEX_DATA, heapId);
    flavour->text = GFL_StrBufCreate(0x100, heapId);
    flavour->word = GFL_StrBufCreate(0x20, heapId);
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
        ClActor_Delete(flavour->objs[i]);
    }
    GFL_BitmapFree(flavour->bitmap);
    GFL_HeapFree(flavour->art);
    ClActSys_FreeChars(flavour->chars);
    ClActSys_FreeCellAnims(flavour->cellAnims);
    ClActSys_FreePltt(flavour->palette);
    if (flavour->entries != NULL) {
        GFL_HeapFree(flavour->entries);
    }
    GFL_StrBufFree(flavour->word);
    GFL_StrBufFree(flavour->text);
    GFL_MsgDataFree(flavour->msgData);
    GFL_HeapFree(flavour);
}

// Reads the species' entries, the other games' that differ from this game's
void PokedexInfoFlavour_LoadSpecies(PokedexInfoFlavour *flavour, u16 species) {
    const u16 *entry;
    const u16 *end;

    if (flavour->entries != NULL) {
        GFL_HeapFree(flavour->entries);
        flavour->entries = NULL;
    }
    flavour->count = 0;
    if (species > SPECIES_GENESECT) {
        return;
    }
    GFL_ArcSysReadRange(flavour->range, ARCID_POKEDEX_GRA, FLAVOUR_FILE, species * sizeof(u32), sizeof(flavour->range));
    if (flavour->range[1] <= flavour->range[0]) {
        return;
    }
    flavour->entries = GFL_ArcSysReadHeapNewRange(ARCID_POKEDEX_GRA, FLAVOUR_FILE, flavour->heapId, flavour->range[0],
                                                  flavour->range[1] - flavour->range[0]);
    entry = flavour->entries;
    end = flavour->entries + (flavour->range[1] - flavour->range[0]) / sizeof(u16);
    while (entry < end && flavour->count < FLAVOUR_GAME_COUNT) {
        flavour->starts[flavour->count++] = entry;
        entry += ENTRY_HEADER_SIZE + entry[1];
    }
}

u32 PokedexInfoFlavour_GetCount(PokedexInfoFlavour *flavour) {
    return flavour->count;
}

// Draws the species' entry (from 1, in the member's order) into the bitmap, as PokedexInfo prints its description
void PokedexInfoFlavour_DrawEntry(PokedexInfoFlavour *flavour, u32 index, GFLBitmap *bitmap, Font *font, int x, int y,
                                  u16 color) {
    GFL_StrBufLoadString(flavour->text, flavour->starts[index - 1] + ENTRY_HEADER_SIZE);
    GFL_TextRendererDrawToBitmapEx(bitmap, x, y, flavour->text, font, color);
}

// Shows the tab of the entry (from 1), or hides it for 0. The OBJs show or hide with the OAM, and a new label's
// characters load, in the next VBlank, with the entry's text
void PokedexInfoFlavour_ShowTab(PokedexInfoFlavour *flavour, u32 index) {
    u32 games = index != 0 ? flavour->starts[index - 1][0] : 0;
    u32 i;

    if (games == flavour->shownGames) {
        return;
    }
    if (games != 0) {
        PokedexInfoFlavour_DrawTab(flavour, games);
    }
    if ((games != 0) != (flavour->shownGames != 0)) {
        for (i = 0; i < TAB_OBJS; i++) {
            ClActor_SetVisible(flavour->objs[i], games != 0);
        }
    }
    flavour->shownGames = games;
}

static void PokedexInfoFlavour_VBlank(TCB *tcb, void *data) {
    PokedexInfoFlavour *flavour = data;

    if (flavour->pending != NULL) {
        ClActSys_WriteCharData(flavour->chars, flavour->pending, TAB_CHARS_SIZE, 0, CLACT_VRAM_MAIN);
        GFL_HeapFree(flavour->pending);
        flavour->pending = NULL;
    }
}

// The tab's OBJs, hidden, on the party icons' cells with one row of the party icons' palettes as their palette
// resource, the art's colors loaded over it
static void PokedexInfoFlavour_CreateTab(PokedexInfoFlavour *flavour, ClActUnit *unit) {
    ArcTool *arc = GFL_ArcSysCreateFileHandle(ARCID_POKEICON, flavour->heapId);
    NNSG2dImageProxy proxy;
    ClActorSetup setup;
    u32 i;

    flavour->palette =
        ClActSys_LoadPlttRange(arc, PokeIcon_GetPaletteFile(), CLACT_VRAM_MAIN, TAB_ROW * 0x20, 0, 1, flavour->heapId);
    flavour->cellAnims =
        ClActSys_LoadCellAnims(arc, PokeIcon_GetCellFile_Main(), getOBJTileMapping_MainEng(), flavour->heapId);
    GFL_ArcToolFree(arc);
    flavour->chars = ClActSys_AllocChars(TAB_CHARS_SIZE, CLACT_VRAM_MAIN, flavour->heapId);
    flavour->bitmap = GFL_BitmapCreate(TAB_TILES_ACROSS, TAB_HEIGHT / 8, TILE_SIZE, flavour->heapId);
    flavour->art = GFL_ArcSysReadHeapNew(ARCID_POKEDEX_GRA, TAB_FILE, flavour->heapId);
    DC_FlushRange(flavour->art, TAB_COLORS * sizeof(GXRgb));
    GX_LoadOBJPltt(flavour->art, TAB_ROW * 0x20, TAB_COLORS * sizeof(GXRgb));

    MI_CpuFill8(&setup, 0, sizeof(ClActorSetup));
    setup.y = TAB_Y + TAB_HEIGHT / 2;
    setup.bgPriority = TAB_BG_PRIORITY;
    setup.priority = TAB_PRIORITY;
    ClActSys_GetCharProxy(flavour->chars, &proxy);
    for (i = 0; i < TAB_OBJS; i++) {
        NNSG2dImageProxy objProxy = proxy;

        setup.x = TAB_X + i * TAB_OBJ_WIDTH + TAB_OBJ_WIDTH / 2;
        flavour->objs[i] = ClActor_Create(unit, flavour->chars, flavour->palette, flavour->cellAnims, &setup,
                                          CLACT_SURFACE_MAIN, flavour->heapId);
        objProxy.vramLocation.baseAddrOfVram[NNS_G2D_VRAM_TYPE_2DMAIN] += i * TAB_OBJ_SIZE;
        ClActor_SetImageProxy(flavour->objs[i], &objProxy);
        ClActor_SetPalette(flavour->objs[i], 0, TRUE);
        ClActor_SetVisible(flavour->objs[i], FALSE);
    }
}

// The tab's label of the games sharing an entry: the game's name, or each game's short name with the separator between
static void PokedexInfoFlavour_MakeLabel(PokedexInfoFlavour *flavour, u32 games) {
    u32 i;

    GFL_StrBufClear(flavour->text);
    for (i = 0; i < FLAVOUR_GAME_COUNT; i++) {
        if (games == 1u << i) {
            GFL_MsgDataLoadStrbuf(flavour->msgData, sGameNames[i], flavour->text);
            return;
        }
    }
    for (i = 0; i < FLAVOUR_GAME_COUNT; i++) {
        if (games & (1u << i)) {
            if (GFL_StrBufGetCharCount(flavour->text) != 0) {
                GFL_MsgDataLoadStrbuf(flavour->msgData, PokedexData_Text_GameSeparator, flavour->word);
                GFL_StrBufConcat(flavour->text, flavour->word);
            }
            GFL_MsgDataLoadStrbuf(flavour->msgData, sGameShortNames[i], flavour->word);
            GFL_StrBufConcat(flavour->text, flavour->word);
        }
    }
}

// The art with the games' label drawn over it, its tiles into the OBJs' order, for the next VBlank
static void PokedexInfoFlavour_DrawTab(PokedexInfoFlavour *flavour, u32 games) {
    GFLBitmap *bitmap = flavour->bitmap;
    const u8 *pixels;
    int x;
    u32 i;

    MI_CpuCopy32(flavour->art + TAB_COLORS * sizeof(GXRgb), GFL_BitmapGetPixelData(bitmap), TAB_CHARS_SIZE);
    PokedexInfoFlavour_MakeLabel(flavour, games);
    x = TAB_TEXT_RIGHT - (int)GFL_FontGetBlockWidth(flavour->text, flavour->smallFont, 0);
    if (x > TAB_TEXT_X) {
        x = TAB_TEXT_X;
    } else if (x < TAB_TEXT_MIN_X) {
        x = TAB_TEXT_MIN_X;
    }
    GFL_TextRendererDrawToBitmapEx(bitmap, x - TAB_X, TAB_TEXT_Y, flavour->text, flavour->smallFont, TAB_TEXT_COLOR);

    pixels = GFL_BitmapGetPixelData(bitmap);
    if (flavour->pending == NULL) {
        flavour->pending = GFL_HeapAllocate(HEAPID_TAIL(flavour->heapId), TAB_CHARS_SIZE, FALSE,
                                            "paperwhite2_pokedex_info_flavour.c", __LINE__);
    }
    for (i = 0; i < TAB_OBJS * TAB_OBJ_TILES; i++) {
        u32 obj = i / TAB_OBJ_TILES;
        u32 tile = i % TAB_OBJ_TILES;
        u32 source =
            tile / TAB_OBJ_TILES_ACROSS * TAB_TILES_ACROSS + obj * TAB_OBJ_TILES_ACROSS + tile % TAB_OBJ_TILES_ACROSS;

        MI_CpuCopy32(pixels + source * TILE_SIZE, flavour->pending + i * TILE_SIZE, TILE_SIZE);
    }
    DC_FlushRange(flavour->pending, TAB_CHARS_SIZE);
}
