#include "types.h"
#include "app/pokedex_common.h"
#include "app/pokedex_detail.h"
#include "app/pokedex_info.h"
#include "app/ui/print_msg.h"
#include "constants/arc.h"
#include "constants/species.h"
#include "constants/text_banks.h"
#include "field/player_state.h"
#include "field/townmap_util.h"
#include "gfl/arc.h"
#include "gfl/arc_util.h"
#include "gfl/bg_sys.h"
#include "gfl/bmp.h"
#include "gfl/clact.h"
#include "gfl/heap.h"
#include "gfl/msg.h"
#include "gfl/str.h"
#include "gfl/tcb.h"
#include "nitro/fx.h"
#include "nitro/gx.h"
#include "nitro/hw.h"
#include "nitro/mi.h"
#include "nitro/os.h"
#include "nnsys/g2d.h"
#include "paperwhite2/pokedex_info.h"
#include "pml/species_names.h"
#include "system/bmp_winframe.h"
#include "system/game_data.h"
#include "system/gf_font.h"
#include "system/poke_icon.h"
#include "system/printsys.h"
#include "system/wordset.h"
#include "text/system/pokedex_data.h"

// Paper White 2: the Pokédex Info page's Area sub-page (docs/paperwhite2/design/pokedex-area.md). The index that
// tools/paperwhite2/encounters.py builds of the wild encounters (area_index) has each species' places on the town map
// with the seasons it is there, and its methods with their levels, rarities, rates, seasons, times and weathers; the
// page reads the shown species' part of it. The top screen shows the original AREA page's town map (its two 256-color
// BGs and an OBJ for each place, pokedex_detail_map.c) in place of the entry's panels, on BGs 2 and 3 of the same main
// engine, 24 pixels down under the head bar; each of the species' places glows in its season's color, a place it is
// at all year in white, and one it is at in some seasons only steps through them, with the current Pokémon's box (its
// party icon and name) over the head bar's right end. The bottom screen's content window has its seasons, up to four
// methods (their levels and rarities), and the times and weathers, each an icon from the user's sheet
// (tools/paperwhite2/pokedex_area.py), greyed out where it isn't met, or "All ..." where it is met in all of them

// ARCID_POKEDEX_GRA's members that tools/paperwhite2/pokedex_evo.py adds after Evo's: the index, the icons and the
// current Pokémon's box
#define AREA_INDEX_FILE 158
#define AREA_ICONS_FILE 159
#define AREA_BOX_FILE 160
#define AREA_INDEX_MAGIC 0x45524150 // "PARE"
#define AREA_INDEX_VERSION 1
// A species' part of the index is at most this long, as encounters.py checks (AREA_BLOCK_MAX)
#define AREA_BLOCK_MAX 512
// The rows that the bottom screen has room for, as encounters.py merges a species' methods into
#define AREA_ROW_MAX 4
// A species is at most at this many of the map's places (encounters.py checks)
#define AREA_PLACE_MAX 40

// The index's header, each species' block offset by its number (and the end's) at offsets, and the town map's places
typedef struct {
    u32 magic;
    u16 version;
    u16 speciesCount;
    u16 placeCount;
    u16 padding;
    u32 offsets;
    u32 places;
} AreaIndexHeader;

// A place of the town map: its zone, its area OBJ's place and animation on the map, and the place's own position, the
// player's marker's
typedef struct {
    u16 zone;
    s16 areaX;
    s16 areaY;
    u8 animation;
    u8 x;
    u8 y;
    u8 padding;
} AreaPlace;

// A species' block: this, its places (AreaSpeciesPlace) and its rows (AreaRow). The seasons, times and weathers are
// those of all its rows, with the preferred ones, where its share is the highest
typedef struct {
    u8 placeCount;
    u8 rowCount;
    u8 levelMin;
    u8 levelMax;
    u8 seasons;
    u8 times;
    u8 preferredTimes;
    u8 weathers;
    u8 preferredWeathers;
    u8 flags;
} AreaSpecies;

typedef struct {
    u8 place;
    u8 seasons;
} AreaSpeciesPlace;

// A method's row: AREA_METHOD_*, its rarities (AREA_TIER_*), its seasons, and its rates in tenths of a percent
typedef struct {
    u8 method;
    u8 tierLow;
    u8 tierHigh;
    u8 seasons;
    u16 rateLow;
    u16 rateHigh;
    u8 times;
    u8 preferredTimes;
    u8 weathers;
    u8 preferredWeathers;
    u8 flags;
    u8 padding;
} AreaRow;

// The index's methods, encounters.py's AREA_METHODS; rustling is by its kind of spots, or all of them in one row
enum {
    AREA_METHOD_GRASS,
    AREA_METHOD_DARK_GRASS,
    AREA_METHOD_SHAKING_GRASS,
    AREA_METHOD_DUST_CLOUD,
    AREA_METHOD_BRIDGE_SHADOW,
    AREA_METHOD_SURF,
    AREA_METHOD_RIPPLING_SURF,
    AREA_METHOD_FISHING,
    AREA_METHOD_RIPPLING_FISHING,
    AREA_METHOD_RUSTLING,
    AREA_METHOD_COUNT,
};

// The settings' rarity tiers (res/paperwhite2/encounters/settings.json), and none, for an outbreak's or shaking
// grass's own species
#define AREA_TIER_COUNT 5
#define AREA_TIER_NONE 0xff
#define AREA_FLAG_OUTBREAK (1 << 0)

#define AREA_SEASON_COUNT 4
#define AREA_TIME_COUNT 5
#define AREA_WEATHER_COUNT 5
#define AREA_ALL_SEASONS ((1 << AREA_SEASON_COUNT) - 1)
#define AREA_ALL_TIMES ((1 << AREA_TIME_COUNT) - 1)
#define AREA_ALL_WEATHERS ((1 << AREA_WEATHER_COUNT) - 1)

// The icon sheet's slots (pokedex_area.py): the seasons, the times, the weather groups, the methods and the
// outbreak's badge, each 32 by 16; the first three rows' icons have grey copies
enum {
    ICON_SPRING,
    ICON_MORNING = 5,
    ICON_CLEAR = 10,
    ICON_GRASS = 15,
    ICON_DARK_GRASS,
    ICON_SHAKING_GRASS,
    ICON_DUST_CLOUD,
    ICON_BRIDGE_SHADOW,
    ICON_SURF,
    ICON_RIPPLING_SURF,
    ICON_FISHING,
    ICON_RIPPLING_FISHING,
    ICON_OUTBREAK,
    ICON_COUNT,
};
#define ICON_GREY_COUNT ICON_GRASS
#define ICON_WIDTH 32
#define ICON_HEIGHT 16
#define ICON_TILES_ACROSS (ICON_WIDTH / 8)
#define ICON_TILES (ICON_TILES_ACROSS * ICON_HEIGHT / 8)
#define ICON_TILE_SIZE 0x20
#define ICON_PALETTE_ROWS 3
#define ICON_PALETTE_SIZE 0x20
// The most icons the bottom screen shows: 4 seasons, 5 times, 5 weathers, and a method and a badge for each row
#define ICON_SHOWN_MAX (AREA_SEASON_COUNT + AREA_TIME_COUNT + AREA_WEATHER_COUNT + AREA_ROW_MAX * 2)

// Each method's icon, by AREA_METHOD_*; the merged rustling shows shaking grass's
static const u8 sMethodIcons[AREA_METHOD_COUNT] = {
    ICON_GRASS, ICON_DARK_GRASS,    ICON_SHAKING_GRASS, ICON_DUST_CLOUD,       ICON_BRIDGE_SHADOW,
    ICON_SURF,  ICON_RIPPLING_SURF, ICON_FISHING,       ICON_RIPPLING_FISHING, ICON_SHAKING_GRASS,
};

static const u16 sTierNames[AREA_TIER_COUNT] = {
    PokedexData_Text_AreaTierCommon,   PokedexData_Text_AreaTierUncommon, PokedexData_Text_AreaTierRare,
    PokedexData_Text_AreaTierVeryRare, PokedexData_Text_AreaTierExotic,
};

// The palette rows of the icons' rows, by the sheet's bank (pokedex_area.py)
static const u8 sIconPaletteRows[ICON_PALETTE_ROWS] = {
    POKEDEX_INFO_AREA_ICON_ROW_0,
    POKEDEX_INFO_AREA_ICON_ROW_1,
    POKEDEX_INFO_AREA_ICON_ROW_2,
};

// The bottom screen, in its pixels (the content window starts at y 16), over the art's white; the icons are on the
// window's tiles, so every icon's place is a multiple of 8. The seasons' strip, the methods' rows and the times' and
// weathers' rows, each a label in font 1 and its icons (or "All ..." where they would all be colored)
#define LABEL_X 8
#define LABEL_OFFSET_Y 4
#define ICON_COLUMN_X 48
#define ICON_COLUMN_PITCH 40
#define SEASONS_Y 24
#define TIMES_Y 136
#define WEATHERS_Y 152
// The methods' rows: the method's icon, the levels in font 0, the rarity in font 1, and the outbreak's badge
#define ROW_Y 48
#define ROW_PITCH 24
#define ROW_ICON_X 16
#define ROW_LEVELS_X 52
#define ROW_TIER_X 108
#define ROW_BADGE_X 176
#define ROW_TEXT_OFFSET_Y 1
#define ROW_SMALL_TEXT_OFFSET_Y 3
#define UNKNOWN_X 128
#define UNKNOWN_Y 88

// The panels' palette (paperwhite2_pokedex_info_panels.c's sPanelColors), the content window's on Area
#define AREA_COLOR_CLEAR 0
#define AREA_COLOR_TEXT 1
#define AREA_COLOR_SHADOW 2
#define AREA_COLOR_DIM 5
#define AREA_TEXT_COLOR PRINT_COLOR(AREA_COLOR_TEXT, AREA_COLOR_SHADOW, AREA_COLOR_CLEAR)
#define AREA_LABEL_COLOR PRINT_COLOR(AREA_COLOR_DIM, AREA_COLOR_CLEAR, AREA_COLOR_CLEAR)

// The map: ARCID_TOWNMAP_GRA's files, as the original's page loads them (PokedexDetailMap_LoadMapBG): BG 2's
// characters and screen, BG 3's, and their extended palette, in slots 2 and 3
#define MAP_FRONT_CHARS 5
#define MAP_BACK_CHARS 7
#define MAP_FRONT_SCREEN 17
#define MAP_BACK_SCREEN 16
#define MAP_PALETTE 0
#define MAP_EXT_PALETTE_FRONT 0x4000
#define MAP_EXT_PALETTE_BACK 0x6000
#define MAP_EXT_PALETTE_SIZE 0x2000
// Where they go in main BG VRAM: the map's characters at the original's bases, over the entry's panels' characters,
// and its screens where the entry's are (pokedex_detail_graphic.c)
#define MAP_FRONT_CHAR_BASE 0x10000
#define MAP_BACK_CHAR_BASE 0x14000
#define MAP_FRONT_CHARS_SIZE 0x4000
#define MAP_BACK_CHARS_SIZE 0xc000
#define ENTRY_MID_CHAR_BASE 0x10000
#define ENTRY_BACK_CHAR_BASE 0x18000
#define FRONT_SCREEN_BASE 0x2000
#define BACK_SCREEN_BASE 0x3000
#define SCREEN_SIZE 0x800
#define TILE_SIZE 0x20
// The map's art is y 0-167, shown under the head bar from y 24 down
#define MAP_TOP 24
// The places' OBJs: ARCID_POKEDEX_GRA's characters, cells, animations and palette, over BG 2 as the original's; and
// the player's marker, the town map's (ARCID_TOWNMAP_GRA), in its palette's row 1
#define AREA_CHARS 15
#define AREA_CELLS 29
#define AREA_ANIMS 46
#define AREA_PALETTE 5
#define AREA_BG_PRIORITY 2
#define AREA_PRIORITY 4
#define MARKER_CHARS 8
#define MARKER_CELLS 12
#define MARKER_ANIMS 19
#define MARKER_PALETTE 2
#define MARKER_PALETTE_ROW 1
#define MARKER_SEQUENCE 6
#define MARKER_PRIORITY 0
// The main OBJ palette rows, which the info page leaves free (its entry's type icons are in 2-4, its footprint in 5,
// the move panel's in 8-13): the marker's, and the glow's for all year and each season. The places' palette resource
// is the all-year row, the others set as offsets from it
#define MARKER_OBJ_ROW 0
#define GLOW_ROW_ALL_YEAR 1
static const u8 sGlowRows[AREA_SEASON_COUNT] = { 6, 7, 14, 15 };
// The places' OBJs' red, three shades (PokedexDetailMap_CreateActors' palette)
#define GLOW_SHADE_FIRST 6
#define GLOW_SHADES 3
#define GLOW_COLORS 16
// The glow's colors, light to dark: each season's, then all year's (placeholders, area_glow_template.png's, until the
// user draws area_glow.png)
static const GXRgb sGlowColors[AREA_SEASON_COUNT + 1][GLOW_SHADES] = {
    { GX_RGB(31, 18, 25), GX_RGB(28, 12, 20), GX_RGB(21, 7, 14) },
    { GX_RGB(15, 28, 12), GX_RGB(9, 23, 7), GX_RGB(5, 16, 5) },
    { GX_RGB(31, 11, 7), GX_RGB(26, 7, 5), GX_RGB(18, 4, 4) },
    { GX_RGB(13, 21, 31), GX_RGB(7, 15, 28), GX_RGB(4, 9, 21) },
    { GX_RGB(31, 31, 31), GX_RGB(27, 27, 28), GX_RGB(21, 21, 23) },
};
// The glow: the original's alpha pulse (PokedexCommon_StepGlow, 64 frames), the places' OBJs semi-transparent over
// every layer; a step of the seasons is taken at its dimmest
#define GLOW_DIMMEST 0x8000
#define ALL_PLANES                                                                                                     \
    (GX_BLEND_PLANEMASK_BG0 | GX_BLEND_PLANEMASK_BG1 | GX_BLEND_PLANEMASK_BG2 | GX_BLEND_PLANEMASK_BG3 |               \
     GX_BLEND_PLANEMASK_OBJ | GX_BLEND_PLANEMASK_BD)
#define NO_SEASON 0xff

// The current Pokémon's box over the head bar's right end on the top screen, while the map shows: the user's art
// (res/paperwhite2/pokedex_art/area_top_box.png, AREA_BOX_FILE: its 16 colors, then its 128 by 32 pixels' tiles in
// the bitmap's order), its party icon and its name, both right of the art's slanted left edge. The box is a bitmap of
// the 4 OBJs of 32 by 32 from BOX_OBJ_X, as the party icons' cells make them; the box's OBJs and the icon (its two
// frames, animated as a healthy party Pokémon's, as Evo's) share one character resource. The icon's palette row is
// the shown Pokémon's of the party icons' three, written into BOX_ICON_ROW as it changes; the art's colors are in the
// next
#define BOX_HEIGHT 32
#define BOX_OBJ_X 128
#define BOX_OBJ_Y 0
#define BOX_OBJS 4
#define BOX_OBJ_WIDTH 32
#define BOX_OBJ_TILES_ACROSS (BOX_OBJ_WIDTH / 8)
#define BOX_OBJ_TILES (BOX_OBJ_TILES_ACROSS * BOX_HEIGHT / 8)
#define BOX_OBJ_SIZE (BOX_OBJ_TILES * TILE_SIZE)
#define BOX_TILES_ACROSS (BOX_OBJS * BOX_OBJ_TILES_ACROSS)
#define BOX_ICON_SIZE 0x400
#define BOX_CHARS_SIZE (BOX_OBJS * BOX_OBJ_SIZE + BOX_ICON_SIZE)
#define BOX_ICON_X 172
#define BOX_ICON_Y 16
#define BOX_ICON_SEQUENCE 1
#define BOX_NAME_X 190
#define BOX_NAME_RIGHT 252
#define BOX_NAME_Y 8
#define BOX_SMALL_NAME_Y 10
// In front of the head bar (BG 1), the icon in front of the box
#define BOX_BG_PRIORITY 0
#define BOX_ICON_PRIORITY 0
#define BOX_PRIORITY 1
// Main OBJ rows that the info page leaves free (measured unchanged and unused while Area shows)
#define BOX_ICON_ROW 12
#define BOX_ROW 13
#define PARTY_ICON_PALETTES 3
// The name's colors, the art's own (the top screen's art palette, as Evo's EVO_COLOR_DARK): its dark and a light grey
// for the shadow, over the art
#define BOX_COLOR_CLEAR 0
#define BOX_COLOR_SHADOW 6
#define BOX_COLOR_TEXT 11
#define BOX_TEXT_COLOR PRINT_COLOR(BOX_COLOR_TEXT, BOX_COLOR_SHADOW, BOX_COLOR_CLEAR)

// What the map's VBlank does next: show the map, or put the entry's panels back
enum {
    VBLANK_NONE,
    VBLANK_OPEN,
    VBLANK_CLOSE,
};

// A range of main BG VRAM, in bytes from its start: the entry's panels' characters (PokedexInfoArea_SetKeptRanges)
typedef struct {
    u32 start;
    u32 end;
} VramRange;
#define KEPT_RANGE_COUNT 6

// An icon drawn into the window: where, which, and whether grey
typedef struct {
    u8 x;
    u8 y;
    u8 icon;
    u8 grey;
} ShownIcon;

struct PokedexInfoArea {
    HeapID heapId;
    Font *font;
    Font *smallFont;
    MsgData *msgData;
    WordSet *wordSet;
    StrBuf *message;
    StrBuf *text;
    StrBuf *word;
    AreaIndexHeader header;
    AreaPlace *places;
    // The species drawn, its block's offsets in the index, and the block
    u16 species;
    BOOL found;
    u32 range[2];
    u8 block[AREA_BLOCK_MAX];
    // The icons' member: its palettes, each tile's row, and the tiles, wrapped as bitmaps of the colored and the grey
    void *icons;
    GFLBitmap *iconBitmap;
    GFLBitmap *greyBitmap;
    ShownIcon shown[ICON_SHOWN_MAX];
    u32 shownCount;
    // The map, while it is open: the files waiting for the VBlank, the OBJs, and the glow
    BOOL mapOpen;
    TCB *vblankTcb;
    u32 vblankRequest;
    void *files[4];
    void *frontChars;
    u32 frontCharsSize;
    void *backChars;
    u32 backCharsSize;
    void *frontScreen;
    void *backScreen;
    PokedexDetailBlend *blend;
    // The entry, its panels' characters' file and where they and its caught labels are, which come back as the map
    // closes, and the VRAM that the map's characters leave to them until it shows
    PokedexInfo *entry;
    u32 entryFile;
    u32 entryChars[POKEDEX_INFO_PANEL_CHARS_COUNT];
    VramRange kept[KEPT_RANGE_COUNT];
    ClActUnit *unit;
    u32 areaChars;
    u32 areaPalette;
    u32 areaCellAnims;
    u32 markerChars;
    u32 markerPalette;
    u32 markerCellAnims;
    ClActor *marker;
    ClActor *actors[AREA_PLACE_MAX];
    u8 actorSeasons[AREA_PLACE_MAX];
    u32 actorCount;
    GameData *gameData;
    u16 glowPhase;
    int glowEv;
    // The seasons that the map steps through (those of the places not met at all year), and the one it shows
    u8 seasonSteps;
    u8 glowSeason;
    // The current Pokémon's box: its OBJs' characters, palette and cells, its OBJs and the icon's, its bitmap, the
    // art (its colors, then its tiles), and the party icons' palettes' file and colors
    u32 boxChars;
    u32 boxPalette;
    u32 boxCellAnims;
    ClActor *boxObjs[BOX_OBJS];
    ClActor *boxIcon;
    GFLBitmap *boxBitmap;
    u8 *boxArt;
    void *iconPaletteFile;
    const GXRgb *iconColors;
};

static void PokedexInfoArea_Load(PokedexInfoArea *area, u16 species);
static const AreaSpecies *PokedexInfoArea_GetSpecies(PokedexInfoArea *area);
static const AreaSpeciesPlace *PokedexInfoArea_GetPlaces(PokedexInfoArea *area);
static const AreaRow *PokedexInfoArea_GetRows(PokedexInfoArea *area);
static void PokedexInfoArea_DrawConditions(PokedexInfoArea *area, GFLBitmap *bitmap, int top, u32 firstIcon, u32 count,
                                           u32 available, int y);
static void PokedexInfoArea_DrawRow(PokedexInfoArea *area, GFLBitmap *bitmap, int top, const AreaRow *row, int y);
static void PokedexInfoArea_DrawIcon(PokedexInfoArea *area, GFLBitmap *bitmap, int top, u32 icon, BOOL grey, int x,
                                     int y);
static u32 PokedexInfoArea_Print(PokedexInfoArea *area, GFLBitmap *bitmap, int top, Font *font, u32 messageId, int x,
                                 int y, u32 align, u16 color);
static void PokedexInfoArea_SetKeptRanges(PokedexInfoArea *area);
static void PokedexInfoArea_CopyMapChars(PokedexInfoArea *area, BOOL kept);
static void PokedexInfoArea_CopyPieces(PokedexInfoArea *area, const u8 *src, u32 dest, u32 size, BOOL kept);
static void PokedexInfoArea_VBlank(TCB *tcb, void *data);
static void PokedexInfoArea_ShowMapBGs(PokedexInfoArea *area);
static void PokedexInfoArea_ShowEntryBGs(PokedexInfoArea *area, BOOL blend);
static void PokedexInfoArea_FreeFiles(PokedexInfoArea *area);
static void PokedexInfoArea_CreateObjs(PokedexInfoArea *area);
static void PokedexInfoArea_FreeObjs(PokedexInfoArea *area);
static void PokedexInfoArea_LoadGlowColors(PokedexInfoArea *area);
static void PokedexInfoArea_ShowMarker(PokedexInfoArea *area);
static void PokedexInfoArea_StepSeason(PokedexInfoArea *area);
static void PokedexInfoArea_InitSeasons(PokedexInfoArea *area);
static void PokedexInfoArea_CreateBox(PokedexInfoArea *area);
static ClActor *PokedexInfoArea_CreateBoxActor(PokedexInfoArea *area, int x, u32 offset, u32 palette,
                                               ClActorSetup *setup);
static void PokedexInfoArea_FreeBox(PokedexInfoArea *area);

PokedexInfoArea *PokedexInfoArea_Create(HeapID heapId, Font *font, Font *smallFont, u32 bg) {
    PokedexInfoArea *area =
        GFL_HeapAllocate(heapId, sizeof(PokedexInfoArea), TRUE, "paperwhite2_pokedex_info_area.c", __LINE__);
    u32 i;

    area->heapId = heapId;
    area->font = font;
    area->smallFont = smallFont;
    area->msgData = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_POKEDEX_DATA, heapId);
    area->wordSet = GFL_WordSetSystemCreateDefault(heapId);
    area->message = GFL_StrBufCreate(0x40, heapId);
    area->text = GFL_StrBufCreate(0x40, heapId);
    area->word = GFL_StrBufCreate(0x20, heapId);
    area->species = SPECIES_NONE;
    area->glowSeason = NO_SEASON;
    // Read into the work, from the heap, as the file system reads by DMA
    GFL_ArcSysReadRange(&area->header, ARCID_POKEDEX_GRA, AREA_INDEX_FILE, 0, sizeof(AreaIndexHeader));
    // An index of another layout has no species
    if (area->header.magic != AREA_INDEX_MAGIC || area->header.version != AREA_INDEX_VERSION) {
        area->header.speciesCount = 0;
    }
    area->places = GFL_ArcSysReadHeapNewRange(ARCID_POKEDEX_GRA, AREA_INDEX_FILE, heapId, area->header.places,
                                              area->header.placeCount * sizeof(AreaPlace));
    area->icons = GFL_ArcSysReadHeapNew(ARCID_POKEDEX_GRA, AREA_ICONS_FILE, heapId);
    {
        u8 *tiles =
            (u8 *)area->icons + ICON_PALETTE_ROWS * ICON_PALETTE_SIZE + (ICON_COUNT + ICON_GREY_COUNT) * ICON_TILES;

        area->iconBitmap =
            GFL_BitmapWrap(tiles, ICON_TILES_ACROSS, ICON_COUNT * ICON_HEIGHT / 8, ICON_TILE_SIZE, heapId);
        area->greyBitmap = GFL_BitmapWrap(tiles + ICON_COUNT * ICON_TILES * ICON_TILE_SIZE, ICON_TILES_ACROSS,
                                          ICON_GREY_COUNT * ICON_HEIGHT / 8, ICON_TILE_SIZE, heapId);
    }
    // The first two rows aren't the other sub-pages', so they stay loaded; the third is loaded as Area shows
    for (i = 0; i < ICON_PALETTE_ROWS - 1; i++) {
        GFL_BGSysUploadStdPalette(bg, (u8 *)area->icons + i * ICON_PALETTE_SIZE, ICON_PALETTE_SIZE,
                                  sIconPaletteRows[i] * ICON_PALETTE_SIZE);
    }
    area->vblankTcb = GFL_VBlankTCBAdd(PokedexInfoArea_VBlank, area, 0);
    return area;
}

void PokedexInfoArea_Free(PokedexInfoArea *area) {
    GFL_TCBRemove(area->vblankTcb);
    PokedexInfoArea_FreeFiles(area);
    PokedexInfoArea_FreeObjs(area);
    GFL_BitmapFree(area->greyBitmap);
    GFL_BitmapFree(area->iconBitmap);
    GFL_HeapFree(area->icons);
    GFL_HeapFree(area->places);
    GFL_StrBufFree(area->word);
    GFL_StrBufFree(area->text);
    GFL_StrBufFree(area->message);
    GFL_WordSetSystemFree(area->wordSet);
    GFL_MsgDataFree(area->msgData);
    GFL_HeapFree(area);
}

const GXRgb *PokedexInfoArea_GetPalette(PokedexInfoArea *area) {
    return (const GXRgb *)((u8 *)area->icons + (ICON_PALETTE_ROWS - 1) * ICON_PALETTE_SIZE);
}

// The species' block of the index, if it has one, read into the work
static void PokedexInfoArea_Load(PokedexInfoArea *area, u16 species) {
    if (species == area->species) {
        return;
    }
    area->species = species;
    area->found = FALSE;
    if (species >= area->header.speciesCount) {
        return;
    }
    GFL_ArcSysReadRange(area->range, ARCID_POKEDEX_GRA, AREA_INDEX_FILE, area->header.offsets + species * sizeof(u32),
                        sizeof(area->range));
    if (area->range[1] > area->range[0] && area->range[1] - area->range[0] <= AREA_BLOCK_MAX) {
        GFL_ArcSysReadRange(area->block, ARCID_POKEDEX_GRA, AREA_INDEX_FILE, area->range[0],
                            area->range[1] - area->range[0]);
        area->found = TRUE;
    }
}

static const AreaSpecies *PokedexInfoArea_GetSpecies(PokedexInfoArea *area) {
    return (const AreaSpecies *)area->block;
}

static const AreaSpeciesPlace *PokedexInfoArea_GetPlaces(PokedexInfoArea *area) {
    return (const AreaSpeciesPlace *)(area->block + sizeof(AreaSpecies));
}

static const AreaRow *PokedexInfoArea_GetRows(PokedexInfoArea *area) {
    return (const AreaRow *)(area->block + sizeof(AreaSpecies) +
                             PokedexInfoArea_GetSpecies(area)->placeCount * sizeof(AreaSpeciesPlace));
}

// The seasons' strip: "All seasons" if each of its places is met all year, else each season's icon, grey where it isn't
// met; the methods' rows; and the times' and weathers' rows, each "All ..." if it is met in all of them. A species
// never met in the wild has a message instead
void PokedexInfoArea_Draw(PokedexInfoArea *area, GFLBitmap *bitmap, int top, u16 species) {
    const AreaSpecies *entry;
    const AreaRow *rows;
    u32 i;

    PokedexInfoArea_Load(area, species);
    area->shownCount = 0;
    area->seasonSteps = 0;
    area->glowSeason = NO_SEASON;
    if (!area->found) {
        PokedexInfoArea_Print(area, bitmap, top, area->font, PokedexData_Text_AreaUnknown, UNKNOWN_X, UNKNOWN_Y,
                              PRINT_ALIGN_CENTER, AREA_TEXT_COLOR);
        return;
    }
    entry = PokedexInfoArea_GetSpecies(area);
    rows = PokedexInfoArea_GetRows(area);
    PokedexInfoArea_InitSeasons(area);
    PokedexInfoArea_Print(area, bitmap, top, area->smallFont, PokedexData_Text_AreaSeasons, LABEL_X,
                          SEASONS_Y + LABEL_OFFSET_Y, PRINT_ALIGN_LEFT, AREA_LABEL_COLOR);
    if (area->seasonSteps == 0 && entry->seasons == AREA_ALL_SEASONS) {
        PokedexInfoArea_Print(area, bitmap, top, area->smallFont, PokedexData_Text_AreaAllSeasons, ICON_COLUMN_X,
                              SEASONS_Y + LABEL_OFFSET_Y, PRINT_ALIGN_LEFT, AREA_TEXT_COLOR);
    } else {
        PokedexInfoArea_DrawConditions(area, bitmap, top, ICON_SPRING, AREA_SEASON_COUNT, entry->seasons, SEASONS_Y);
    }
    for (i = 0; i < entry->rowCount && i < AREA_ROW_MAX; i++) {
        PokedexInfoArea_DrawRow(area, bitmap, top, &rows[i], ROW_Y + i * ROW_PITCH);
    }
    PokedexInfoArea_Print(area, bitmap, top, area->smallFont, PokedexData_Text_AreaTime, LABEL_X,
                          TIMES_Y + LABEL_OFFSET_Y, PRINT_ALIGN_LEFT, AREA_LABEL_COLOR);
    if (entry->times == AREA_ALL_TIMES) {
        PokedexInfoArea_Print(area, bitmap, top, area->smallFont, PokedexData_Text_AreaAllTimes, ICON_COLUMN_X,
                              TIMES_Y + LABEL_OFFSET_Y, PRINT_ALIGN_LEFT, AREA_TEXT_COLOR);
    } else {
        PokedexInfoArea_DrawConditions(area, bitmap, top, ICON_MORNING, AREA_TIME_COUNT, entry->times, TIMES_Y);
    }
    PokedexInfoArea_Print(area, bitmap, top, area->smallFont, PokedexData_Text_AreaWeather, LABEL_X,
                          WEATHERS_Y + LABEL_OFFSET_Y, PRINT_ALIGN_LEFT, AREA_LABEL_COLOR);
    if (entry->weathers == AREA_ALL_WEATHERS) {
        PokedexInfoArea_Print(area, bitmap, top, area->smallFont, PokedexData_Text_AreaAllWeathers, ICON_COLUMN_X,
                              WEATHERS_Y + LABEL_OFFSET_Y, PRINT_ALIGN_LEFT, AREA_TEXT_COLOR);
    } else {
        PokedexInfoArea_DrawConditions(area, bitmap, top, ICON_CLEAR, AREA_WEATHER_COUNT, entry->weathers, WEATHERS_Y);
    }
}

// A row of the seasons', times' or weathers' icons, grey where it isn't met
static void PokedexInfoArea_DrawConditions(PokedexInfoArea *area, GFLBitmap *bitmap, int top, u32 firstIcon, u32 count,
                                           u32 available, int y) {
    u32 i;

    for (i = 0; i < count; i++) {
        PokedexInfoArea_DrawIcon(area, bitmap, top, firstIcon + i, !(available & (1 << i)),
                                 ICON_COLUMN_X + i * ICON_COLUMN_PITCH, y);
    }
}

// A method's icon, its levels, its rarity (or the range of them), and the outbreak's badge if it has outbreaks there
static void PokedexInfoArea_DrawRow(PokedexInfoArea *area, GFLBitmap *bitmap, int top, const AreaRow *row, int y) {
    const AreaSpecies *entry = PokedexInfoArea_GetSpecies(area);
    u32 message;

    PokedexInfoArea_DrawIcon(area, bitmap, top,
                             row->method < AREA_METHOD_COUNT ? sMethodIcons[row->method] : ICON_GRASS, FALSE,
                             ROW_ICON_X, y);
    WordSetNumber(area->wordSet, 0, entry->levelMin, 3, 0, TRUE);
    WordSetNumber(area->wordSet, 1, entry->levelMax, 3, 0, TRUE);
    PokedexInfoArea_Print(area, bitmap, top, area->font,
                          entry->levelMin == entry->levelMax ? PokedexData_Text_AreaLevel : PokedexData_Text_AreaLevels,
                          ROW_LEVELS_X, y + ROW_TEXT_OFFSET_Y, PRINT_ALIGN_LEFT, AREA_TEXT_COLOR);
    if (row->tierLow >= AREA_TIER_COUNT) {
        message = (row->flags & AREA_FLAG_OUTBREAK) ? PokedexData_Text_AreaOutbreak : PokedexData_Text_AreaSpecial;
    } else if (row->tierHigh != row->tierLow && row->tierHigh < AREA_TIER_COUNT) {
        GFL_MsgDataLoadStrbuf(area->msgData, sTierNames[row->tierLow], area->word);
        GFL_WordSetSetStrbuf(area->wordSet, 0, area->word, 0, TRUE, 0);
        GFL_MsgDataLoadStrbuf(area->msgData, sTierNames[row->tierHigh], area->word);
        GFL_WordSetSetStrbuf(area->wordSet, 1, area->word, 0, TRUE, 0);
        message = PokedexData_Text_AreaTierRange;
    } else {
        message = sTierNames[row->tierLow];
    }
    PokedexInfoArea_Print(area, bitmap, top, area->smallFont, message, ROW_TIER_X, y + ROW_SMALL_TEXT_OFFSET_Y,
                          PRINT_ALIGN_LEFT, AREA_TEXT_COLOR);
    if (row->flags & AREA_FLAG_OUTBREAK) {
        PokedexInfoArea_DrawIcon(area, bitmap, top, ICON_OUTBREAK, FALSE, ROW_BADGE_X, y);
    }
}

// An icon into the window, on its tiles, which take the icon's palette rows (PokedexInfoArea_SetIconPalettes); its
// clear pixels show what is under the window
static void PokedexInfoArea_DrawIcon(PokedexInfoArea *area, GFLBitmap *bitmap, int top, u32 icon, BOOL grey, int x,
                                     int y) {
    ShownIcon *shown;

    if (area->shownCount >= ICON_SHOWN_MAX) {
        return;
    }
    if (grey && icon >= ICON_GREY_COUNT) {
        grey = FALSE;
    }
    shown = &area->shown[area->shownCount++];
    shown->x = x / 8;
    shown->y = y / 8;
    shown->icon = icon;
    shown->grey = grey;
    GFL_BitmapFillArea(bitmap, x, y - top, ICON_WIDTH, ICON_HEIGHT, AREA_COLOR_CLEAR);
    GFL_BitmapCopyArea(grey ? area->greyBitmap : area->iconBitmap, bitmap, 0, icon * ICON_HEIGHT, x, y - top,
                       ICON_WIDTH, ICON_HEIGHT, AREA_COLOR_CLEAR);
}

void PokedexInfoArea_SetIconPalettes(PokedexInfoArea *area, u32 bg) {
    const u8 *banks = (const u8 *)area->icons + ICON_PALETTE_ROWS * ICON_PALETTE_SIZE;
    u32 i;
    u32 j;

    for (i = 0; i < area->shownCount; i++) {
        const ShownIcon *shown = &area->shown[i];
        const u8 *iconBanks = banks + (shown->grey ? ICON_COUNT * ICON_TILES : 0) + shown->icon * ICON_TILES;

        for (j = 0; j < ICON_TILES; j++) {
            GFL_BGSysSetScrPaletteNo(bg, shown->x + j % ICON_TILES_ACROSS, shown->y + j / ICON_TILES_ACROSS, 1, 1,
                                     sIconPaletteRows[iconBanks[j]]);
        }
    }
}

static u32 PokedexInfoArea_Print(PokedexInfoArea *area, GFLBitmap *bitmap, int top, Font *font, u32 messageId, int x,
                                 int y, u32 align, u16 color) {
    u32 width;

    GFL_MsgDataLoadStrbuf(area->msgData, messageId, area->message);
    GFL_WordSetFormatStrbuf(area->wordSet, area->text, area->message);
    width = GFL_FontGetBlockWidth(area->text, font, 0);
    switch (align) {
    case PRINT_ALIGN_RIGHT:
        x -= width;
        break;
    case PRINT_ALIGN_CENTER:
        x -= width / 2;
        break;
    }
    GFL_TextRendererDrawToBitmapEx(bitmap, x, y - top, area->text, font, color);
    return width;
}

// ---------------------------------------------------------------------------------------------------------------- Map

// Frees the entry's text, its type icons and footprint, and reads the map's characters and screens; its extended
// palettes go to VRAM at once (no BG uses them until the map shows), and so do its characters but where the entry's
// panels have theirs, which the next VBlank copies with the screens as it switches the BGs: copying all 62 KB in it ran
// into the frame after. The places' OBJs are made with it, shown from that VBlank as the map is
void PokedexInfoArea_OpenMap(PokedexInfoArea *area, PokedexInfo *entry, ClActUnit *unit, GameData *gameData,
                             PokedexDetailBlend *blend) {
    ArcTool *arc;
    NNSG2dCharacterData *chars;
    NNSG2dScreenData *screen;

    if (area->mapOpen) {
        return;
    }
    area->mapOpen = TRUE;
    area->unit = unit;
    area->gameData = gameData;
    area->blend = blend;
    area->entry = entry;
    area->entryFile = PokedexInfo_GetPanelChars(entry, area->entryChars);
    PokedexInfoArea_SetKeptRanges(area);
    PokedexInfo_FreeText(entry);
    PokedexInfoArea_FreeFiles(area);
    arc = GFL_ArcSysCreateFileHandle(ARCID_TOWNMAP_GRA, area->heapId);
    GFL_G2DIOLoadArcNCLRDefault(arc, MAP_PALETTE, PALTYPE_MAIN_BG_EX, MAP_EXT_PALETTE_FRONT, MAP_EXT_PALETTE_SIZE,
                                area->heapId);
    GFL_G2DIOLoadArcNCLRDefault(arc, MAP_PALETTE, PALTYPE_MAIN_BG_EX, MAP_EXT_PALETTE_BACK, MAP_EXT_PALETTE_SIZE,
                                area->heapId);
    area->files[0] = GFL_G2DIOReadBGNCGRArc(arc, MAP_FRONT_CHARS, FALSE, &chars, HEAPID_TAIL(area->heapId));
    area->frontChars = chars->pRawData;
    area->frontCharsSize = chars->szByte < MAP_FRONT_CHARS_SIZE ? chars->szByte : MAP_FRONT_CHARS_SIZE;
    area->files[1] = GFL_G2DIOReadBGNCGRArc(arc, MAP_BACK_CHARS, FALSE, &chars, HEAPID_TAIL(area->heapId));
    area->backChars = chars->pRawData;
    area->backCharsSize = chars->szByte < MAP_BACK_CHARS_SIZE ? chars->szByte : MAP_BACK_CHARS_SIZE;
    area->files[2] = GFL_G2DIOReadNSCRArc(arc, MAP_FRONT_SCREEN, FALSE, &screen, HEAPID_TAIL(area->heapId));
    area->frontScreen = screen->rawData;
    area->files[3] = GFL_G2DIOReadNSCRArc(arc, MAP_BACK_SCREEN, FALSE, &screen, HEAPID_TAIL(area->heapId));
    area->backScreen = screen->rawData;
    GFL_ArcToolFree(arc);
    PokedexInfoArea_CopyMapChars(area, FALSE);
    PokedexInfoArea_CreateObjs(area);
    PokedexInfoArea_ShowPlaces(area);
    area->vblankRequest = VBLANK_OPEN;
}

// Puts the entry's panels back, in the next VBlank (or at once), and its text, and frees the map's OBJs
void PokedexInfoArea_CloseMap(PokedexInfoArea *area, PokedexInfo *entry, u32 language, BOOL now) {
    ArcTool *arc;
    NNSG2dCharacterData *chars;

    if (!area->mapOpen) {
        return;
    }
    area->mapOpen = FALSE;
    PokedexInfoArea_FreeObjs(area);
    PokedexInfoArea_FreeFiles(area);
    arc = GFL_ArcSysCreateFileHandle(ARCID_POKEDEX_GRA, area->heapId);
    area->files[0] = GFL_G2DIOReadBGNCGRArc(arc, area->entryFile, FALSE, &chars, HEAPID_TAIL(area->heapId));
    GFL_ArcToolFree(arc);
    area->frontChars = chars->pRawData;
    area->frontCharsSize = chars->szByte;
    if (now) {
        area->vblankRequest = VBLANK_NONE;
        PokedexInfoArea_ShowEntryBGs(area, FALSE);
        PokedexInfoArea_FreeFiles(area);
    } else {
        area->vblankRequest = VBLANK_CLOSE;
    }
    PokedexInfo_RestoreText(entry, language);
}

BOOL PokedexInfoArea_IsMapOpen(PokedexInfoArea *area) {
    return area->mapOpen;
}

// The VRAM that the entry's panels' characters take, which the map's mustn't overwrite while the entry shows: each
// BG's first character (the blank one of its screens' clear tiles), the mid BG's panel characters and caught labels,
// and the back BG's panel characters
static void PokedexInfoArea_SetKeptRanges(PokedexInfoArea *area) {
    static const u8 sBases[KEPT_RANGE_COUNT] = { 0, 0, 0, 1, 1, 0 };
    static const u8 sChars[KEPT_RANGE_COUNT] = {
        POKEDEX_INFO_PANEL_CHARS_COUNT, POKEDEX_INFO_PANEL_CHARS_MID,  POKEDEX_INFO_PANEL_CHARS_LABEL_CAUGHT,
        POKEDEX_INFO_PANEL_CHARS_COUNT, POKEDEX_INFO_PANEL_CHARS_BACK, POKEDEX_INFO_PANEL_CHARS_LABEL_UNCAUGHT,
    };
    u32 i;

    for (i = 0; i < KEPT_RANGE_COUNT; i++) {
        u32 base = sBases[i] ? ENTRY_BACK_CHAR_BASE : ENTRY_MID_CHAR_BASE;

        if (sChars[i] == POKEDEX_INFO_PANEL_CHARS_COUNT) {
            area->kept[i].start = base;
            area->kept[i].end = base + TILE_SIZE;
        } else {
            u32 chars = area->entryChars[sChars[i]];

            area->kept[i].start = base + CHAR_POS(chars) * TILE_SIZE;
            area->kept[i].end = area->kept[i].start + CHAR_SIZE(chars);
        }
    }
}

// The map's characters into VRAM, outside the kept ranges or inside them
static void PokedexInfoArea_CopyMapChars(PokedexInfoArea *area, BOOL kept) {
    PokedexInfoArea_CopyPieces(area, area->frontChars, MAP_FRONT_CHAR_BASE, area->frontCharsSize, kept);
    PokedexInfoArea_CopyPieces(area, area->backChars, MAP_BACK_CHAR_BASE, area->backCharsSize, kept);
}

static void PokedexInfoArea_CopyPieces(PokedexInfoArea *area, const u8 *src, u32 dest, u32 size, BOOL kept) {
    u32 offset = dest;
    u32 end = dest + size;
    u32 i;

    while (offset < end) {
        BOOL inside = FALSE;
        u32 next = end;

        for (i = 0; i < KEPT_RANGE_COUNT; i++) {
            if (offset >= area->kept[i].start && offset < area->kept[i].end) {
                inside = TRUE;
                if (area->kept[i].end < next) {
                    next = area->kept[i].end;
                }
            } else if (area->kept[i].start > offset && area->kept[i].start < next) {
                next = area->kept[i].start;
            }
        }
        if (inside == kept) {
            MIi_CpuCopyFast(src + (offset - dest), (void *)(HW_BG_VRAM + offset), next - offset);
        }
        offset = next;
    }
}

// Runs in the VBlank, before the BGs' screens and the OAM are loaded, so that the map, its OBJs and the entry's
// cleared text change in the same frame
static void PokedexInfoArea_VBlank(TCB *tcb, void *data) {
    PokedexInfoArea *area = data;

    switch (area->vblankRequest) {
    case VBLANK_OPEN:
        PokedexInfoArea_ShowMapBGs(area);
        break;
    case VBLANK_CLOSE:
        PokedexInfoArea_ShowEntryBGs(area, TRUE);
        break;
    }
    area->vblankRequest = VBLANK_NONE;
}

// BGs 2 and 3 as the map's 256-color affine BGs (mode 5, BG 0 still the 3D, hidden), the rest of its characters and its
// screens in, 24 pixels down, and the glow on
static void PokedexInfoArea_ShowMapBGs(PokedexInfoArea *area) {
    MtxFx22 identity;

    PokedexInfoArea_CopyMapChars(area, TRUE);
    MIi_CpuCopyFast(area->frontScreen, (void *)(HW_BG_VRAM + FRONT_SCREEN_BASE), SCREEN_SIZE);
    MIi_CpuCopyFast(area->backScreen, (void *)(HW_BG_VRAM + BACK_SCREEN_BASE), SCREEN_SIZE);
    G2_SetBG2Control256x16Pltt(GX_BG_SCRSIZE_256x16PLTT_256x256, GX_BG_AREAOVER_XLU, GX_BG_SCRBASE(FRONT_SCREEN_BASE),
                               GX_BG_CHARBASE(MAP_FRONT_CHAR_BASE));
    G2_SetBG3Control256x16Pltt(GX_BG_SCRSIZE_256x16PLTT_256x256, GX_BG_AREAOVER_XLU, GX_BG_SCRBASE(BACK_SCREEN_BASE),
                               GX_BG_CHARBASE(MAP_BACK_CHAR_BASE));
    MTX_Identity22_(&identity);
    G2_SetBG2Affine(&identity, 0, 0, 0, -MAP_TOP);
    G2_SetBG3Affine(&identity, 0, 0, 0, -MAP_TOP);
    GX_SetGraphicsMode(GX_DISPMODE_GRAPHICS, GX_BGMODE_5, GX_BG0_AS_3D);
    GFL_BGSysSetBGEnabled(0, FALSE);
    PokedexCommon_StartGlow(&area->glowPhase, &area->glowEv);
    G2x_SetBlendAlpha_(REG_BLDCNT_ADDR, 0, ALL_PLANES, area->glowEv, 16 - area->glowEv);
}

// The entry's panels back: their characters where the BG system loaded them and its caught label's, their screens
// from its buffers, BGs 2 and 3 as 16-color text BGs again (as pokedex_detail_graphic.c makes them), mode 0 with the
// 3D shown, and the page's blending as it was
static void PokedexInfoArea_ShowEntryBGs(PokedexInfoArea *area, BOOL blend) {
    u32 mid = area->entryChars[POKEDEX_INFO_PANEL_CHARS_MID];
    u32 back = area->entryChars[POKEDEX_INFO_PANEL_CHARS_BACK];

    MIi_CpuCopyFast(area->frontChars, (void *)(HW_BG_VRAM + ENTRY_MID_CHAR_BASE + CHAR_POS(mid) * TILE_SIZE),
                    CHAR_SIZE(mid) < area->frontCharsSize ? CHAR_SIZE(mid) : area->frontCharsSize);
    MIi_CpuCopyFast(area->frontChars, (void *)(HW_BG_VRAM + ENTRY_BACK_CHAR_BASE + CHAR_POS(back) * TILE_SIZE),
                    CHAR_SIZE(back) < area->frontCharsSize ? CHAR_SIZE(back) : area->frontCharsSize);
    MIi_CpuCopyFast(GFL_BGSysIsScrHeapExists(2), (void *)(HW_BG_VRAM + FRONT_SCREEN_BASE), SCREEN_SIZE);
    MIi_CpuCopyFast(GFL_BGSysIsScrHeapExists(3), (void *)(HW_BG_VRAM + BACK_SCREEN_BASE), SCREEN_SIZE);
    G2_SetBG2ControlText(GX_BG_SCRSIZE_TEXT_256x256, GX_BG_COLORMODE_16, GX_BG_SCRBASE(FRONT_SCREEN_BASE),
                         GX_BG_CHARBASE(ENTRY_MID_CHAR_BASE));
    G2_SetBG3ControlText(GX_BG_SCRSIZE_TEXT_256x256, GX_BG_COLORMODE_16, GX_BG_SCRBASE(BACK_SCREEN_BASE),
                         GX_BG_CHARBASE(ENTRY_BACK_CHAR_BASE));
    GX_SetGraphicsMode(GX_DISPMODE_GRAPHICS, GX_BGMODE_0, GX_BG0_AS_3D);
    GFL_BGSysSetBGEnabled(0, TRUE);
    PokedexInfo_ReloadLabel(area->entry);
    if (blend) {
        PokedexDetailBlend_SetIn(0, area->blend);
    }
}

static void PokedexInfoArea_FreeFiles(PokedexInfoArea *area) {
    u32 i;

    for (i = 0; i < NELEMS(area->files); i++) {
        if (area->files[i] != NULL) {
            GFL_HeapFree(area->files[i]);
            area->files[i] = NULL;
        }
    }
}

// The places' and the marker's resources, with the glow's colors in their rows, and the marker at the player's place
static void PokedexInfoArea_CreateObjs(PokedexInfoArea *area) {
    ArcTool *arc = GFL_ArcSysCreateFileHandle(ARCID_POKEDEX_GRA, area->heapId);
    ClActorSetup setup;

    area->areaPalette =
        ClActSys_LoadPlttRange(arc, AREA_PALETTE, CLACT_VRAM_MAIN, GLOW_ROW_ALL_YEAR * 0x20, 0, 1, area->heapId);
    area->areaChars = ClActSys_LoadChars(arc, AREA_CHARS, FALSE, CLACT_VRAM_MAIN, area->heapId);
    area->areaCellAnims = ClActSys_LoadCellAnims(arc, AREA_CELLS, AREA_ANIMS, area->heapId);
    GFL_ArcToolFree(arc);
    arc = GFL_ArcSysCreateFileHandle(ARCID_TOWNMAP_GRA, area->heapId);
    area->markerPalette = ClActSys_LoadPlttRange(arc, MARKER_PALETTE, CLACT_VRAM_MAIN, MARKER_OBJ_ROW * 0x20,
                                                 MARKER_PALETTE_ROW, 1, area->heapId);
    area->markerChars = ClActSys_LoadChars(arc, MARKER_CHARS, FALSE, CLACT_VRAM_MAIN, area->heapId);
    area->markerCellAnims = ClActSys_LoadCellAnims(arc, MARKER_CELLS, MARKER_ANIMS, area->heapId);
    GFL_ArcToolFree(arc);
    PokedexInfoArea_LoadGlowColors(area);
    PokedexInfoArea_CreateBox(area);

    MI_CpuFill8(&setup, 0, sizeof(ClActorSetup));
    setup.sequence = MARKER_SEQUENCE;
    setup.priority = MARKER_PRIORITY;
    setup.bgPriority = AREA_BG_PRIORITY;
    area->marker = ClActor_Create(area->unit, area->markerChars, area->markerPalette, area->markerCellAnims, &setup,
                                  CLACT_SURFACE_MAIN, area->heapId);
    ClActor_SetPalette(area->marker, 0, TRUE);
    ClActor_SetAutoAnim(area->marker, TRUE);
    ClActor_SetVisible(area->marker, FALSE);
    PokedexInfoArea_ShowMarker(area);
}

static void PokedexInfoArea_FreeObjs(PokedexInfoArea *area) {
    u32 i;

    if (area->marker == NULL) {
        return;
    }
    PokedexInfoArea_FreeBox(area);
    for (i = 0; i < area->actorCount; i++) {
        ClActor_Delete(area->actors[i]);
    }
    area->actorCount = 0;
    ClActor_Delete(area->marker);
    area->marker = NULL;
    ClActSys_FreeCellAnims(area->markerCellAnims);
    ClActSys_FreeChars(area->markerChars);
    ClActSys_FreePltt(area->markerPalette);
    ClActSys_FreeCellAnims(area->areaCellAnims);
    ClActSys_FreeChars(area->areaChars);
    ClActSys_FreePltt(area->areaPalette);
}

// The places' palette row's colors, with the three shades of red as each season's and all year's glow, into the
// rows: the all-year row is the places' palette resource's, the others the info page doesn't use (from the heap,
// which DMA can read)
static void PokedexInfoArea_LoadGlowColors(PokedexInfoArea *area) {
    NNSG2dPaletteData *palette;
    void *file = GFL_ArcSysReadHeapNew(ARCID_POKEDEX_GRA, AREA_PALETTE, HEAPID_TAIL(area->heapId));
    GXRgb *colors = GFL_HeapAllocate(HEAPID_TAIL(area->heapId), GLOW_COLORS * sizeof(GXRgb), FALSE,
                                     "paperwhite2_pokedex_info_area.c", __LINE__);
    u32 i;
    u32 j;

    NNS_G2dGetUnpackedPaletteData(file, &palette);
    for (i = 0; i <= AREA_SEASON_COUNT; i++) {
        MI_CpuCopy16(palette->pRawData, colors, GLOW_COLORS * sizeof(GXRgb));
        for (j = 0; j < GLOW_SHADES; j++) {
            colors[GLOW_SHADE_FIRST + j] = sGlowColors[i][j];
        }
        DC_FlushRange(colors, GLOW_COLORS * sizeof(GXRgb));
        GX_LoadOBJPltt(colors, (i < AREA_SEASON_COUNT ? sGlowRows[i] : GLOW_ROW_ALL_YEAR) * 0x20,
                       GLOW_COLORS * sizeof(GXRgb));
    }
    GFL_HeapFree(colors);
    GFL_HeapFree(file);
}

// The player's marker at the place of the zone the player is in, as the original's map shows it, if it is on the map
static void PokedexInfoArea_ShowMarker(PokedexInfoArea *area) {
    u16 zone = TownMap_GetMapZone(area->gameData, PlayerState_GetZoneID(GameData_GetPlayerState(area->gameData)));
    u32 i;

    for (i = 0; i < area->header.placeCount; i++) {
        if (area->places[i].zone == zone) {
            ClActorPos pos;

            pos.x = area->places[i].x;
            pos.y = area->places[i].y + MAP_TOP;
            ClActor_SetSurfacePos(area->marker, &pos, CLACT_SURFACE_MAIN);
            ClActor_SetVisible(area->marker, TRUE);
            return;
        }
    }
}

// An OBJ for each of the drawn species' places, at the place's area in its animation, semi-transparent for the glow,
// in its first season's color (all year's if it is there all year); the seasons the map steps through are those of
// the places that aren't all year
void PokedexInfoArea_ShowPlaces(PokedexInfoArea *area) {
    const AreaSpeciesPlace *places;
    ClActorSetup setup;
    u32 count;
    u32 i;

    if (!area->mapOpen) {
        return;
    }
    for (i = 0; i < area->actorCount; i++) {
        ClActor_Delete(area->actors[i]);
    }
    area->actorCount = 0;
    if (!area->found) {
        return;
    }
    places = PokedexInfoArea_GetPlaces(area);
    count = PokedexInfoArea_GetSpecies(area)->placeCount;
    MI_CpuFill8(&setup, 0, sizeof(ClActorSetup));
    setup.priority = AREA_PRIORITY;
    setup.bgPriority = AREA_BG_PRIORITY;
    for (i = 0; i < count && area->actorCount < AREA_PLACE_MAX; i++) {
        const AreaPlace *place;
        ClActor *actor;

        if (places[i].place >= area->header.placeCount) {
            continue;
        }
        place = &area->places[places[i].place];
        setup.x = place->areaX;
        setup.y = place->areaY + MAP_TOP;
        setup.sequence = place->animation;
        actor = ClActor_Create(area->unit, area->areaChars, area->areaPalette, area->areaCellAnims, &setup,
                               CLACT_SURFACE_MAIN, area->heapId);
        ClActor_SetAutoAnim(actor, TRUE);
        ClActor_SetObjMode(actor, GX_OAM_MODE_XLU);
        area->actors[area->actorCount] = actor;
        area->actorSeasons[area->actorCount] = places[i].seasons;
        area->actorCount++;
    }
    for (i = 0; i < area->actorCount; i++) {
        u32 seasons = area->actorSeasons[i];
        u32 season = 0;

        if (seasons == AREA_ALL_SEASONS) {
            ClActor_SetPalette(area->actors[i], 0, TRUE);
            continue;
        }
        if (area->glowSeason != NO_SEASON && (seasons & (1 << area->glowSeason))) {
            season = area->glowSeason;
        } else {
            while (!(seasons & (1 << season))) {
                season++;
            }
        }
        ClActor_SetPalette(area->actors[i], sGlowRows[season] - GLOW_ROW_ALL_YEAR, TRUE);
    }
}

// The seasons the map steps through, those of the species' places that it isn't at all year, and the first of them,
// which the map shows first
static void PokedexInfoArea_InitSeasons(PokedexInfoArea *area) {
    const AreaSpeciesPlace *places = PokedexInfoArea_GetPlaces(area);
    u32 count = PokedexInfoArea_GetSpecies(area)->placeCount;
    u32 i;

    area->seasonSteps = 0;
    for (i = 0; i < count; i++) {
        if (places[i].seasons != AREA_ALL_SEASONS) {
            area->seasonSteps |= places[i].seasons;
        }
    }
    area->glowSeason = NO_SEASON;
    for (i = 0; i < AREA_SEASON_COUNT; i++) {
        if (area->seasonSteps & (1 << i)) {
            area->glowSeason = i;
            break;
        }
    }
}

// The next of the seasons the map steps through: each place there in it glows in its color, the others keep theirs
static void PokedexInfoArea_StepSeason(PokedexInfoArea *area) {
    u32 season = area->glowSeason;
    u32 i;

    if (area->seasonSteps == 0) {
        area->glowSeason = NO_SEASON;
        return;
    }
    do {
        season = season == NO_SEASON ? 0 : (season + 1) % AREA_SEASON_COUNT;
    } while (!(area->seasonSteps & (1 << season)));
    area->glowSeason = season;
    for (i = 0; i < area->actorCount; i++) {
        if (area->actorSeasons[i] != AREA_ALL_SEASONS && (area->actorSeasons[i] & (1 << season))) {
            ClActor_SetPalette(area->actors[i], sGlowRows[season] - GLOW_ROW_ALL_YEAR, TRUE);
        }
    }
}

void PokedexInfoArea_Update(PokedexInfoArea *area) {
    if (area->vblankRequest != VBLANK_NONE) {
        return;
    }
    // The files waited for the VBlank that put them in VRAM
    PokedexInfoArea_FreeFiles(area);
    if (!area->mapOpen) {
        return;
    }
    PokedexCommon_StepGlow(&area->glowPhase, &area->glowEv);
    G2x_SetBlendAlpha_(REG_BLDCNT_ADDR, 0, ALL_PLANES, area->glowEv, 16 - area->glowEv);
    if (area->glowPhase == GLOW_DIMMEST) {
        PokedexInfoArea_StepSeason(area);
    }
}

// ------------------------------------------------------------------------------------------------- The current Pokémon

// The box's resources and OBJs, with the party icons' palettes' first two rows as their palette resource (the icon's
// row and the box's), the art's colors into its row, the art kept to draw the name over, and the party icons'
// palettes kept to write the shown one's
static void PokedexInfoArea_CreateBox(PokedexInfoArea *area) {
    ArcTool *arc = GFL_ArcSysCreateFileHandle(ARCID_POKEICON, area->heapId);
    NNSG2dPaletteData *palette;
    ClActorSetup setup;
    u32 i;

    area->boxPalette = ClActSys_LoadPlttRange(arc, PokeIcon_GetPaletteFile(), CLACT_VRAM_MAIN, BOX_ICON_ROW * 0x20, 0,
                                              BOX_ROW - BOX_ICON_ROW + 1, area->heapId);
    area->boxCellAnims =
        ClActSys_LoadCellAnims(arc, PokeIcon_GetCellFile_Main(), getOBJTileMapping_MainEng(), area->heapId);
    area->iconPaletteFile = GFL_ArcToolReadHeapNew(arc, PokeIcon_GetPaletteFile(), area->heapId);
    GFL_ArcToolFree(arc);
    NNS_G2dGetUnpackedPaletteData(area->iconPaletteFile, &palette);
    area->iconColors = palette->pRawData;
    DC_FlushRange(area->iconColors, PARTY_ICON_PALETTES * GLOW_COLORS * sizeof(GXRgb));
    area->boxChars = ClActSys_AllocChars(BOX_CHARS_SIZE, CLACT_VRAM_MAIN, area->heapId);
    area->boxBitmap = GFL_BitmapCreate(BOX_TILES_ACROSS, BOX_HEIGHT / 8, TILE_SIZE, area->heapId);
    area->boxArt = GFL_ArcSysReadHeapNew(ARCID_POKEDEX_GRA, AREA_BOX_FILE, area->heapId);
    DC_FlushRange(area->boxArt, GLOW_COLORS * sizeof(GXRgb));
    GX_LoadOBJPltt(area->boxArt, BOX_ROW * 0x20, GLOW_COLORS * sizeof(GXRgb));

    MI_CpuFill8(&setup, 0, sizeof(ClActorSetup));
    setup.y = BOX_OBJ_Y + BOX_HEIGHT / 2;
    setup.bgPriority = BOX_BG_PRIORITY;
    setup.priority = BOX_PRIORITY;
    for (i = 0; i < BOX_OBJS; i++) {
        area->boxObjs[i] = PokedexInfoArea_CreateBoxActor(area, BOX_OBJ_X + i * BOX_OBJ_WIDTH + BOX_OBJ_WIDTH / 2,
                                                          i * BOX_OBJ_SIZE, BOX_ROW - BOX_ICON_ROW, &setup);
    }
    setup.y = BOX_ICON_Y;
    setup.sequence = BOX_ICON_SEQUENCE;
    setup.priority = BOX_ICON_PRIORITY;
    area->boxIcon = PokedexInfoArea_CreateBoxActor(area, BOX_ICON_X, BOX_OBJS * BOX_OBJ_SIZE, 0, &setup);
    ClActor_SetAutoAnim(area->boxIcon, TRUE);
}

// An OBJ of the box's, on its characters from offset, centered at x as the party icons' cells are
static ClActor *PokedexInfoArea_CreateBoxActor(PokedexInfoArea *area, int x, u32 offset, u32 palette,
                                               ClActorSetup *setup) {
    NNSG2dImageProxy proxy;
    ClActor *actor;

    setup->x = x;
    actor = ClActor_Create(area->unit, area->boxChars, area->boxPalette, area->boxCellAnims, setup, CLACT_SURFACE_MAIN,
                           area->heapId);
    ClActSys_GetCharProxy(area->boxChars, &proxy);
    proxy.vramLocation.baseAddrOfVram[NNS_G2D_VRAM_TYPE_2DMAIN] += offset;
    ClActor_SetImageProxy(actor, &proxy);
    ClActor_SetPalette(actor, palette, TRUE);
    return actor;
}

static void PokedexInfoArea_FreeBox(PokedexInfoArea *area) {
    u32 i;

    if (area->boxIcon == NULL) {
        return;
    }
    ClActor_Delete(area->boxIcon);
    area->boxIcon = NULL;
    for (i = 0; i < BOX_OBJS; i++) {
        ClActor_Delete(area->boxObjs[i]);
    }
    GFL_BitmapFree(area->boxBitmap);
    GFL_HeapFree(area->boxArt);
    GFL_HeapFree(area->iconPaletteFile);
    ClActSys_FreeChars(area->boxChars);
    ClActSys_FreeCellAnims(area->boxCellAnims);
    ClActSys_FreePltt(area->boxPalette);
}

// The box of the Pokémon shown, while the map is open: the art with its name (in font 1 if font 0's is too long),
// its tiles into the OBJs' order, and its party icon in its form and sex with its palette, as Evo's
void PokedexInfoArea_ShowPokemon(PokedexInfoArea *area, u16 species, u16 form, u16 sex) {
    GFLBitmap *bitmap = area->boxBitmap;
    Font *font = area->font;
    int nameY = BOX_NAME_Y;
    const u8 *pixels;
    u8 *chars;
    NNSG2dCharacterData *icon;
    void *file;
    u32 i;

    if (area->boxIcon == NULL) {
        return;
    }
    MI_CpuCopy32(area->boxArt + GLOW_COLORS * sizeof(GXRgb), GFL_BitmapGetPixelData(bitmap), BOX_OBJS * BOX_OBJ_SIZE);
    GFL_MsgDataLoadStrbuf(g_PMLSpeciesNamesResident, species, area->text);
    if (BOX_NAME_X + GFL_FontGetBlockWidth(area->text, font, 0) > BOX_NAME_RIGHT) {
        font = area->smallFont;
        nameY = BOX_SMALL_NAME_Y;
    }
    GFL_TextRendererDrawToBitmapEx(bitmap, BOX_NAME_X - BOX_OBJ_X, nameY, area->text, font, BOX_TEXT_COLOR);

    pixels = GFL_BitmapGetPixelData(bitmap);
    chars = GFL_HeapAllocate(HEAPID_TAIL(area->heapId), BOX_OBJS * BOX_OBJ_SIZE, FALSE,
                             "paperwhite2_pokedex_info_area.c", __LINE__);
    for (i = 0; i < BOX_OBJS * BOX_OBJ_TILES; i++) {
        u32 obj = i / BOX_OBJ_TILES;
        u32 tile = i % BOX_OBJ_TILES;
        u32 source =
            tile / BOX_OBJ_TILES_ACROSS * BOX_TILES_ACROSS + obj * BOX_OBJ_TILES_ACROSS + tile % BOX_OBJ_TILES_ACROSS;

        MI_CpuCopy32(pixels + source * TILE_SIZE, chars + i * TILE_SIZE, TILE_SIZE);
    }
    ClActSys_WriteCharData(area->boxChars, chars, BOX_OBJS * BOX_OBJ_SIZE, 0, CLACT_VRAM_MAIN);
    GFL_HeapFree(chars);

    file = GFL_ArcSysReadHeapNew(ARCID_POKEICON, PokeParty_GetIconIndex(species, form, sex, FALSE),
                                 HEAPID_TAIL(area->heapId));
    NNS_G2dGetUnpackedCharacterData(file, &icon);
    ClActSys_WriteCharData(area->boxChars, icon->pRawData, BOX_ICON_SIZE, BOX_OBJS * BOX_OBJ_SIZE, CLACT_VRAM_MAIN);
    GFL_HeapFree(file);
    GX_LoadOBJPltt(area->iconColors + PokeIcon_GetPalette(species, form, sex, FALSE) * GLOW_COLORS, BOX_ICON_ROW * 0x20,
                   GLOW_COLORS * sizeof(GXRgb));
}
