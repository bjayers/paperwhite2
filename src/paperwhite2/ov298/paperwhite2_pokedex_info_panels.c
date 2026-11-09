#include "types.h"
#include "app/pokedex_detail.h"
#include "app/ui/print_msg.h"
#include "constants/abilities.h"
#include "constants/arc.h"
#include "constants/pokemon.h"
#include "constants/text_banks.h"
#include "constants/types.h"
#include "gfl/arc.h"
#include "gfl/arc_util.h"
#include "gfl/bg_sys.h"
#include "gfl/bmp.h"
#include "gfl/bmpwin.h"
#include "gfl/clact.h"
#include "gfl/heap.h"
#include "gfl/msg.h"
#include "gfl/str.h"
#include "gfl/tcb.h"
#include "gfl/touchpanel.h"
#include "nitro/fx.h"
#include "nitro/gx.h"
#include "nitro/os.h"
#include "paperwhite2/pokedex_info.h"
#include "paperwhite2/type_chart.h"
#include "pml/move.h"
#include "pml/personal.h"
#include "system/app_menu_common.h"
#include "system/bmp_winframe.h"
#include "system/gf_font.h"
#include "system/printsys.h"
#include "system/scroll_bar.h"
#include "system/str_tool.h"
#include "system/wordset.h"
#include "text/system/pokedex_data.h"

// Paper White 2: the bottom screen of the Pokédex's info page, on the sub engine above the touch bar: the bar of the
// sub-pages' tabs at the top, and below it the shown sub-page's panel, Stats, Data, Moves, Evo (drawn by
// paperwhite2_pokedex_info_evo.c), Area (paperwhite2_pokedex_info_area.c) or Matchups, read from the species' data at
// run time. The text and bars are drawn
// into two windows over the user's art (below), and a sub-page without art yet gets fills in its place, so every place
// is a constant here: the screen's pixels, the windows' tiles

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
// The content window's palette while Matchups shows (sMatchupColors) or Evo (the art's colors, with its balls,
// paperwhite2_pokedex_info_evo.c), after the art's six and before the touch bar's 13, and Area's third row of icons
// (POKEDEX_INFO_AREA_ICON_ROW_2): each loaded into it as its sub-page shows, in the VBlank that shows it
#define PALETTE_CONTENT 12
#define PALETTE_SIZE 0x20
// The art's screen, the whole screen in tiles, and the BG's whole screen (256 by 256), whose rows past the screen's
// show at the bottom, under the touch bar, while the BG is lifted (sSubpageLift)
#define ART_TILES_ACROSS 32
#define ART_TILES_DOWN 24
#define ART_BG_TILES_DOWN 32
// Evo's banner under the tab bar: the inside of the art's band (tile rows 3 to 6, y 24-55) is moved onto the grid's BG,
// which scrolls, so that its pattern moves as the grid does; the art's band shows only its edges there (y 22-23 and
// 56-58, rows of one color, which look the same scrolled). The art's band must repeat across with a period that divides
// the BG's 256 pixels, so that it wraps without a seam (the user's: 4 px). Its tiles are copied into the grid's BG,
// as many as the band has different ones, and its map entries keep the art's palette row
#define BANNER_TILE_Y 3
#define BANNER_TILES_DOWN 4
#define BANNER_ENTRIES (ART_TILES_ACROSS * BANNER_TILES_DOWN)
#define BANNER_SUBPAGE POKEDEX_INFO_SUBPAGE_EVO
// A map entry's character, flips and palette, and a tile's bytes
#define MAP_CHAR_MASK 0x3ff
#define MAP_FLIPS (3 << 10)
#define MAP_PALETTE_SHIFT 12
#define TILE_SIZE 0x20
// The grid's characters (PokedexDetailBackground_Create's, ARCID_POKEDEX_GRA member 12) fill the whole of its BG's
// 0x8000 bytes (pokedex_detail_graphic.c), so none of them can be allocated, but its screens draw only the first 41 and
// the rest are blank: the banner's tiles take the last ones
#define GRID_CHAR_COUNT 1024
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
// The windows whose characters go to VRAM in the next VBlank (PokedexInfoPanels_VBlank)
#define PENDING_BAR (1 << 0)
#define PENDING_CONTENT (1 << 1)

// The bar: the art draws a tab for each sub-page, an icon, the first centered at BAR_TAB_X and the others BAR_TAB_PITCH
// apart, with the shown one's tab hanging below the bar. Touching a tab's column switches to its sub-page. A sub-page
// without art has a dark strip with its name centered on it in font 1
#define BAR_TAB_X 48
#define BAR_TAB_PITCH 32
#define BAR_TOUCH_BOTTOM 17
#define BAR_TEXT_Y 3
#define BAR_NAME_X 128

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
#define DATA_VALUE_RIGHT 169
#define EGG_PANEL_X 183
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

// Moves: a bar of its four sets below the tab bar, each name in font 1, the shown one in the panels' text color and
// the others light, and touching one shows it; the first of its x is where the name starts
#define MOVES_SET_BAR_Y 16
#define MOVES_SET_BAR_HEIGHT 16
#define MOVES_SET_TEXT_Y 20
#define MOVES_SET_TOUCH_TOP 18
#define MOVES_SET_TOUCH_BOTTOM 31
#define MOVES_SET_TOUCH_LEFT 0
#define MOVES_SET_TOUCH_RIGHT 240
// Below it, POKEDEX_INFO_MOVE_ROWS rows of moves the size of the move relearner's (move_tutor_main.c), so that its
// cursor fits round one, centered between the sets' bar (to y 31) and the touch bar (from y 168): each a
// parallelogram ROW_WIDTH wide, its bottom ROW_SLANT right of its top, with a light end
// from ROW_END_X (at its top) for the set's detail. A row has the move's type icon (an OBJ centered at ROW_ICON_X),
// the name after it in font 0 and the detail right-aligned at ROW_DETAIL_RIGHT, either in font 1 if it is wider than
// its room
#define MOVES_ROW_X 21
#define MOVES_ROW_Y 41
#define MOVES_ROW_WIDTH 208
#define MOVES_ROW_HEIGHT 22
#define MOVES_ROW_PITCH 24
#define MOVES_ROW_SLANT 6
#define MOVES_ROW_END_X 152
#define MOVES_ROW_ICON_X 47
#define MOVES_ROW_ICON_OFFSET_Y 11
#define MOVES_ROW_NAME_X 67
#define MOVES_ROW_NAME_WIDTH 84
#define MOVES_ROW_TEXT_OFFSET_Y 3
#define MOVES_ROW_DETAIL_RIGHT 220
#define MOVES_ROW_DETAIL_WIDTH 60
// Until the species is caught, no rows: "Learnset Unknown" in font 0 (a 16 px line) centered at MOVES_UNKNOWN_X and on
// y 100, between the sets' bar (to y 31) and the touch bar (from y 168), as a row's name in white with a dark shadow,
// to read on the grid
#define MOVES_UNKNOWN_X 128
#define MOVES_UNKNOWN_Y 92
// The TMs, whose machines' bits come before the HMs' (PML_ItemGetTMBitMask)
#define MOVES_TM_COUNT 95
// Font 1's text this much lower than font 0's, to be centered in the row
#define MOVES_SMALL_TEXT_OFFSET_Y 3
// The rows' touch areas, the relearner's
#define MOVES_ROW_TOUCH_LEFT 21
#define MOVES_ROW_TOUCH_RIGHT 233
// The relearner's cursor, its cell's place from a row's top (ACTOR_CURSOR, MoveTutor_SetCursorActor), made for the
// sub engine's 1D 128 KB mapping as ARCID_POKEDEX_GRA's 137 to 139 (tools/paperwhite2/obj_remap.py) from
// ARCID_MOVE_TUTOR's 17, 07 and 08, with that archive's palette 5
#define MOVES_CURSOR_X 130
#define MOVES_CURSOR_OFFSET_Y 15
#define CURSOR_CHARS 137
#define CURSOR_CELLS 138
#define CURSOR_ANIMS 139
#define CURSOR_PALETTE 5
// The scroll bar: a thin track, centered on the rows, and the Pokédex list's knob (ARCID_POKEDEX_GRA's characters 57,
// palette 53's row 3, cells 63 and animations 73, its sequence 2, pokedex_list_obj.c), placed by the scroll from the
// track's top to its bottom. Touching the track, from the rows' touch areas to the screen's edge, and holding it
// scrolls the list to the touch's place
#define MOVES_TRACK_X 240
#define MOVES_TRACK_TOP 45
#define MOVES_TRACK_BOTTOM 155
#define MOVES_KNOB_HALF_HEIGHT 4
#define MOVES_TRACK_TOUCH_LEFT (MOVES_ROW_TOUCH_RIGHT + 1)
#define MOVES_TRACK_TOUCH_RIGHT 255
#define KNOB_CHARS 57
#define KNOB_PALETTE 53
#define KNOB_PALETTE_ROW 3
#define KNOB_CELLS 63
#define KNOB_ANIMS 73
#define KNOB_SEQUENCE 2
// The cursor's and the knob's sub OBJ palette rows, after the type icons' and below the touch bar's
#define PALETTE_CURSOR 3
#define PALETTE_KNOB 4

// Matchups: a chart of the attacking types in the types' order, MATCHUPS_COLUMNS to a row, each its type icon (an OBJ
// centered on its place) with the damage multiplier against the species centered under it in font 0. The page's
// ability buttons are below it (paperwhite2_pokedex_info.c), so the placeholder panel ends above them
#define MATCHUPS_PANEL_X 4
#define MATCHUPS_PANEL_Y 20
#define MATCHUPS_PANEL_WIDTH 248
#define MATCHUPS_PANEL_HEIGHT 120
#define MATCHUPS_COLUMNS 6
// The first icon's center, and the distances between the icons' centers
#define MATCHUPS_ICON_X 28
#define MATCHUPS_ICON_Y 40
#define MATCHUPS_COLUMN_PITCH 40
#define MATCHUPS_ROW_PITCH 35
// From an icon's center to its multiplier's top
#define MATCHUPS_VALUE_OFFSET_Y 10
// The type icons' sub OBJ palette rows (a/0/8/2's three, from this one), below the touch bar's 8 to 13, and their
// cells for the sub engine's 1D 128 KB mapping (pokedex_detail_graphic.c)
#define PALETTE_TYPE_ICONS 0
#define TYPE_ICON_PALETTE_COUNT 3
#define TYPE_ICON_MAPPING 2
// A multiplier's 1 in its fixed point, 64ths, so that a quarter halved or times 1.25 stays exact
#define MULTIPLIER_ONE 64

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

// The battle's move colors above and below 1, in sPanelColors' red's and orange's places, and a light grey for 0, the
// art's (148, 148, 148), in green's (MATCHUPS_COLOR_*)
static const GXRgb sMatchupColors[16] = {
    GX_RGB(0, 0, 0),    GX_RGB(4, 4, 5),  GX_RGB(22, 22, 23), GX_RGB(31, 31, 31), GX_RGB(7, 7, 8),   GX_RGB(15, 15, 16),
    GX_RGB(12, 22, 31), GX_RGB(19, 4, 4), GX_RGB(30, 27, 11), GX_RGB(31, 12, 21), GX_RGB(31, 29, 3), GX_RGB(22, 18, 2),
    GX_RGB(18, 18, 18), GX_RGB(4, 17, 4), GX_RGB(7, 17, 31),  GX_RGB(3, 9, 21),
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
// Moves' sets other than the shown one, light grey on the light bar; a row's move name, white on its grey
#define MOVES_SET_OTHER_COLOR PRINT_COLOR(PANELS_COLOR_SHADOW, PANELS_COLOR_CLEAR, PANELS_COLOR_CLEAR)
#define MOVES_NAME_COLOR PRINT_COLOR(PANELS_COLOR_PANEL, PANELS_COLOR_BORDER, PANELS_COLOR_CLEAR)
// The Matchups' multipliers: above 1 light blue and below it yellow, the battle's move colors (MOVE_PREVIEW_COLORS,
// paperwhite2_move_preview.c), 0 light grey, each with the panels' text's light shadow, and 1 as the panels' text.
// They are in sMatchupColors, the panels' palette with them in the place of three of the stat bars' colors, which
// Matchups doesn't use, as the content window's palette while Matchups shows
#define MATCHUPS_COLOR_SUPER PANELS_COLOR_RED
#define MATCHUPS_COLOR_RESISTED PANELS_COLOR_ORANGE
#define MATCHUPS_COLOR_IMMUNE PANELS_COLOR_GREEN
#define MULTIPLIER_UP_COLOR PRINT_COLOR(MATCHUPS_COLOR_SUPER, PANELS_COLOR_SHADOW, PANELS_COLOR_CLEAR)
#define MULTIPLIER_DOWN_COLOR PRINT_COLOR(MATCHUPS_COLOR_RESISTED, PANELS_COLOR_SHADOW, PANELS_COLOR_CLEAR)
#define MULTIPLIER_NONE_COLOR PRINT_COLOR(MATCHUPS_COLOR_IMMUNE, PANELS_COLOR_SHADOW, PANELS_COLOR_CLEAR)
#define MULTIPLIER_NORMAL_COLOR TEXT_COLOR
// The multipliers' font, the small one (the user's choice, the rows closer for the art's margin), and its "×"'s place
// against the number's top, the same font's
#define MULTIPLIER_SIGN_OFFSET_Y 0

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

// What an ability does to the damage of the moves it takes in: a type's, or the super-effective ones' (above 1), or
// the others'. Their multiplier is times quarters / 4
enum {
    MATCHUP_TARGET_SUPER_EFFECTIVE = TYPE_CHART_SIZE,
    MATCHUP_TARGET_NOT_SUPER_EFFECTIVE,
};

typedef struct {
    u16 ability;
    u8 target;
    u8 quarters;
} MatchupRule;

static const MatchupRule sMatchupRules[] = {
    { ABILITY_LEVITATE, TYPE_GROUND, 0 },
    { ABILITY_FLASH_FIRE, TYPE_FIRE, 0 },
    { ABILITY_WATER_ABSORB, TYPE_WATER, 0 },
    { ABILITY_STORM_DRAIN, TYPE_WATER, 0 },
    { ABILITY_VOLT_ABSORB, TYPE_ELECTRIC, 0 },
    { ABILITY_MOTOR_DRIVE, TYPE_ELECTRIC, 0 },
    { ABILITY_LIGHTNINGROD, TYPE_ELECTRIC, 0 },
    { ABILITY_SAP_SIPPER, TYPE_GRASS, 0 },
    { ABILITY_THICK_FAT, TYPE_FIRE, 2 },
    { ABILITY_THICK_FAT, TYPE_ICE, 2 },
    { ABILITY_HEATPROOF, TYPE_FIRE, 2 },
    { ABILITY_DRY_SKIN, TYPE_WATER, 0 },
    { ABILITY_DRY_SKIN, TYPE_FIRE, 5 },
    { ABILITY_FILTER, MATCHUP_TARGET_SUPER_EFFECTIVE, 3 },
    { ABILITY_SOLID_ROCK, MATCHUP_TARGET_SUPER_EFFECTIVE, 3 },
    { ABILITY_WONDER_GUARD, MATCHUP_TARGET_NOT_SUPER_EFFECTIVE, 0 },
};

// Each tab's column, BAR_TAB_PITCH wide and centered on its icon
#define BAR_TAB_RECT(i)                                                                                                \
    { 0, BAR_TOUCH_BOTTOM, BAR_TAB_X + (i) * BAR_TAB_PITCH - BAR_TAB_PITCH / 2,                                        \
      BAR_TAB_X + (i) * BAR_TAB_PITCH + BAR_TAB_PITCH / 2 - 1 }

static const TouchRect sSubpageRects[] = {
    BAR_TAB_RECT(POKEDEX_INFO_SUBPAGE_STATS),
    BAR_TAB_RECT(POKEDEX_INFO_SUBPAGE_DATA),
    BAR_TAB_RECT(POKEDEX_INFO_SUBPAGE_MOVES),
    BAR_TAB_RECT(POKEDEX_INFO_SUBPAGE_EVO),
    BAR_TAB_RECT(POKEDEX_INFO_SUBPAGE_AREA),
    BAR_TAB_RECT(POKEDEX_INFO_SUBPAGE_MATCHUPS),
    { TOUCH_RECT_END, 0, 0, 0 },
};

static const u16 sSubpageNames[POKEDEX_INFO_SUBPAGE_COUNT] = {
    PokedexData_Text_Stats, PokedexData_Text_Data, PokedexData_Text_Moves,
    PokedexData_Text_Evo,   PokedexData_Text_Area, PokedexData_Text_Matchups,
};

// Moves' sets' names, where each starts, and the area touching each, from its start to the next one's (the gap after
// TM/HM is the shown tab's, x 98-125 in the six-tab bar)
static const u16 sMoveSetNames[POKEDEX_INFO_MOVES_SET_COUNT] = {
    PokedexData_Text_LevelUp,
    PokedexData_Text_Machines,
    PokedexData_Text_Tutor,
    PokedexData_Text_EggMoves,
};
static const u8 sMoveSetX[POKEDEX_INFO_MOVES_SET_COUNT] = { 10, 59, 154, 196 };

static const TouchRect sMoveSetRects[] = {
    { MOVES_SET_TOUCH_TOP, MOVES_SET_TOUCH_BOTTOM, MOVES_SET_TOUCH_LEFT, 58 },
    { MOVES_SET_TOUCH_TOP, MOVES_SET_TOUCH_BOTTOM, 59, 97 },
    { MOVES_SET_TOUCH_TOP, MOVES_SET_TOUCH_BOTTOM, 126, 195 },
    { MOVES_SET_TOUCH_TOP, MOVES_SET_TOUCH_BOTTOM, 196, MOVES_SET_TOUCH_RIGHT },
    { TOUCH_RECT_END, 0, 0, 0 },
};

#define MOVES_ROW_RECT(i)                                                                                              \
    { MOVES_ROW_Y + (i) * MOVES_ROW_PITCH, MOVES_ROW_Y + (i) * MOVES_ROW_PITCH + MOVES_ROW_HEIGHT - 1,                 \
      MOVES_ROW_TOUCH_LEFT, MOVES_ROW_TOUCH_RIGHT }

static const TouchRect sMoveRowRects[] = {
    MOVES_ROW_RECT(0), MOVES_ROW_RECT(1), MOVES_ROW_RECT(2),
    MOVES_ROW_RECT(3), MOVES_ROW_RECT(4), { TOUCH_RECT_END, 0, 0, 0 },
};

static const TouchRect sMoveTrackRects[] = {
    { MOVES_TRACK_TOP, MOVES_TRACK_BOTTOM, MOVES_TRACK_TOUCH_LEFT, MOVES_TRACK_TOUCH_RIGHT },
    { TOUCH_RECT_END, 0, 0, 0 },
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
    { 131, 132, 133 }, { 134, 135, 136 }, { 140, 141, 142 }, { 146, 147, 148 }, { 152, 153, 154 }, { 149, 150, 151 },
};

// How many pixels each sub-page scrolls BG_ART up while it shows, to lift its buttons off the tile grid (Stats' last
// one off the touch bar, Matchups' centred between the chart's panel and the bar): its art is converted as many pixels
// lower (offset_y in res/paperwhite2/art/targets.json), so it shows where it was drawn
static const u8 sSubpageLift[POKEDEX_INFO_SUBPAGE_COUNT] = { 2, 0, 0, 0, 0, 3 };

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
    // The windows drawn since the last VBlank (PENDING_*), whose characters go to VRAM in the next one, with their
    // screen, the BGs' and the OBJs' changes, so that a frame never shows new characters in an old palette or place
    TCB *vblankTcb;
    u32 pendingWindows;
    PokedexDetailBackground *grid;
    // The grid's map entries where Evo's banner shows, kept for the other sub-pages, and the banner's: its tiles,
    // copied into the grid's BG, and their map entries there
    u16 gridEntries[BANNER_ENTRIES];
    u16 bannerEntries[BANNER_ENTRIES];
    u32 bannerTileCount;
    // Each sub-page's art's characters on BG_ART, all loaded with the page so that changing sub-page only changes the
    // screen; 0 for a sub-page without art
    u32 artChars[POKEDEX_INFO_SUBPAGE_COUNT];
    // The Matchups' type icons, loaded with the page and shown on Matchups only
    u32 typeIconPalette;
    u32 typeIconCellAnims;
    u32 typeIconChars[TYPE_CHART_SIZE];
    ClActor *typeIcons[TYPE_CHART_SIZE];
    // Moves: the page's set, the moves' and places' names, and the rows' type icons (the Matchups' characters), the
    // cursor and the scroll knob, shown on Moves only
    const PokedexInfoMoves *moves;
    // Whether the shown species is caught: until then Moves shows no list
    BOOL movesKnown;
    MsgData *moveNames;
    MsgData *placeNames;
    ClActor *moveIcons[POKEDEX_INFO_MOVE_ROWS];
    u32 cursorPalette;
    u32 cursorChars;
    u32 cursorCellAnims;
    ClActor *cursor;
    u32 knobPalette;
    u32 knobChars;
    u32 knobCellAnims;
    ClActor *knob;
    // Evo's family, its strip of icons and its tree
    PokedexInfoEvo *evo;
    // Area's seasons, methods, times and weathers, and its map on the top screen
    PokedexInfoArea *area;
    // The shown sub-page, and the colors that PALETTE_CONTENT takes in the next VBlank, or NULL
    u32 subpage;
    const GXRgb *pendingPalette;
};

static void PokedexInfoPanels_VBlank(TCB *tcb, void *data);
static void PokedexInfoPanels_Transfer(PokedexInfoPanels *panels, BmpWin *window, u32 pending);
static void PokedexInfoPanels_CreateBanner(PokedexInfoPanels *panels, ArcTool *arc);
static void PokedexInfoPanels_DrawBar(PokedexInfoPanels *panels, u32 subpage);
static void PokedexInfoPanels_CreateArt(PokedexInfoPanels *panels);
static void PokedexInfoPanels_FreeArt(PokedexInfoPanels *panels);
static void PokedexInfoPanels_CreateTypeIcons(PokedexInfoPanels *panels, ClActUnit *unit);
static void PokedexInfoPanels_FreeTypeIcons(PokedexInfoPanels *panels);
static void PokedexInfoPanels_CreateMoveActors(PokedexInfoPanels *panels, ClActUnit *unit);
static void PokedexInfoPanels_FreeMoveActors(PokedexInfoPanels *panels);
static void PokedexInfoPanels_DrawStats(PokedexInfoPanels *panels, PersonalData *personal, BOOL caught);
static void PokedexInfoPanels_DrawData(PokedexInfoPanels *panels, PersonalData *personal, BOOL caught);
static void PokedexInfoPanels_DrawEgg(PokedexInfoPanels *panels, PersonalData *personal, BOOL caught);
static void PokedexInfoPanels_DrawMoves(PokedexInfoPanels *panels);
static void PokedexInfoPanels_DrawMove(PokedexInfoPanels *panels, GFLBitmap *bitmap, const PokedexInfoMove *move,
                                       int top);
static void PokedexInfoPanels_DrawMoveRow(GFLBitmap *bitmap, int y);
static void PokedexInfoPanels_UpdateMoveActors(PokedexInfoPanels *panels, BOOL shown);
static void PokedexInfoPanels_DrawMatchups(PokedexInfoPanels *panels, PersonalData *personal, u32 ability);
static u32 PokedexInfoPanels_GetMultiplier(u32 attackType, u32 type1, u32 type2, u32 ability);
static u32 PokedexInfoPanels_GetWidth(PokedexInfoPanels *panels, Font *font, u32 messageId);
static void PokedexInfoPanels_PrintMultiplier(PokedexInfoPanels *panels, GFLBitmap *bitmap, u32 multiplier, int x,
                                              int y);
static void PokedexInfoPanels_DrawPanel(GFLBitmap *bitmap, int x, int y, int width, int height);
static void PokedexInfoPanels_DrawStatBar(GFLBitmap *bitmap, int x, int y, u32 value);
static u32 PokedexInfoPanels_Print(PokedexInfoPanels *panels, GFLBitmap *bitmap, int top, Font *font, u32 messageId,
                                   int x, int y, u32 align, u16 color);
static u32 PokedexInfoPanels_PrintText(GFLBitmap *bitmap, int top, Font *font, const StrBuf *text, int x, int y,
                                       u32 align, u16 color);
static void PokedexInfoPanels_PrintFitting(PokedexInfoPanels *panels, GFLBitmap *bitmap, const StrBuf *text, u32 width,
                                           int x, int y, u32 align, u16 color);
static void PokedexInfoPanels_PrintValue(PokedexInfoPanels *panels, u32 messageId, BOOL known, int y);
static void PokedexInfoPanels_DrawGender(PokedexInfoPanels *panels, GFLBitmap *bitmap, u32 sexRatio, int y);
static void PokedexInfoPanels_SetShare(WordSet *wordSet, u32 index, u32 permille);
static u32 PokedexInfoPanels_GetFemalePermille(u32 sexRatio);
static u32 PokedexInfoPanels_GetCatchPermille(u32 catchRate);
static u32 PokedexInfoPanels_GetFavoriteFlavor(PersonalData *personal);

PokedexInfoPanels *PokedexInfoPanels_Create(HeapID heapId, Font *font, ClActUnit *unit, const PokedexInfoMoves *moves,
                                            PokeDexSave *pokedex) {
    PokedexInfoPanels *panels =
        GFL_HeapAllocate(heapId, sizeof(PokedexInfoPanels), TRUE, "paperwhite2_pokedex_info_panels.c", __LINE__);

    panels->heapId = heapId;
    panels->font = font;
    // Streamed, its glyphs read as they are drawn, as the panels draw little text and the page already holds font 0
    panels->smallFont = GFL_FontCreate(ARCID_FONT, 1, 0, FALSE, heapId);
    panels->msgData = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_POKEDEX_DATA, heapId);
    panels->moveNames = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_MOVE_NAMES, heapId);
    panels->placeNames = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_PLACE_NAMES, heapId);
    panels->moves = moves;
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
    panels->vblankTcb = GFL_VBlankTCBAdd(PokedexInfoPanels_VBlank, panels, 0);
    PokedexInfoPanels_CreateTypeIcons(panels, unit);
    PokedexInfoPanels_CreateMoveActors(panels, unit);
    panels->evo = PokedexInfoEvo_Create(heapId, font, panels->smallFont, unit, pokedex);
    panels->area = PokedexInfoArea_Create(heapId, font, panels->smallFont, BG_PANELS);
    panels->subpage = POKEDEX_INFO_SUBPAGE_COUNT;
    GFL_BGSysSetBGEnabled(BG_GRID, TRUE);
    GFL_BGSysSetBGEnabled(BG_PANELS, TRUE);
    return panels;
}

void PokedexInfoPanels_Free(PokedexInfoPanels *panels) {
    GFL_TCBRemove(panels->vblankTcb);
    PokedexInfoArea_Free(panels->area);
    PokedexInfoEvo_Free(panels->evo);
    PokedexInfoPanels_FreeMoveActors(panels);
    PokedexInfoPanels_FreeTypeIcons(panels);
    PokedexInfoPanels_FreeArt(panels);
    GFL_BGSysFillScrArea(BG_ART, 0, 0, 0, ART_TILES_ACROSS, ART_BG_TILES_DOWN, 0);
    GFL_BGSysQueueScrLoad(BG_ART);
    GFL_BGSysMoveBGReq(BG_ART, BG_MOVE_SET_Y, 0);
    BmpWin_ClearScreen(panels->contentWindow);
    BmpWin_ClearScreen(panels->barWindow);
    GFL_BGSysQueueScrLoad(BG_PANELS);
    BmpWin_Free(panels->contentWindow);
    BmpWin_Free(panels->barWindow);
    PokedexDetailBackground_Free(panels->grid);
    GFL_StrBufFree(panels->text);
    GFL_StrBufFree(panels->message);
    GFL_WordSetSystemFree(panels->wordSet);
    GFL_MsgDataFree(panels->placeNames);
    GFL_MsgDataFree(panels->moveNames);
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
    if (sSubpageArt[BANNER_SUBPAGE].screen != ART_NONE) {
        PokedexInfoPanels_CreateBanner(panels, arc);
    }
    GFL_ArcToolFree(arc);
}

// Evo's banner on the grid's BG: the art's tiles of the band's inside, each of its different ones once, loaded over the
// grid's last, blank characters (GRID_CHAR_COUNT; from the heap, which DMA can read), and the band's map entries moved
// to them, in the art's palette row; and the grid's own map entries there, which the other sub-pages show
static void PokedexInfoPanels_CreateBanner(PokedexInfoPanels *panels, ArcTool *arc) {
    const PanelsArt *art = &sSubpageArt[BANNER_SUBPAGE];
    const u16 *grid = GFL_BGSysIsScrHeapExists(BG_GRID);
    NNSG2dCharacterData *chars;
    NNSG2dScreenData *screen;
    void *charsFile = GFL_G2DIOReadBGNCGRArc(arc, art->chars, FALSE, &chars, panels->heapId);
    void *screenFile = GFL_G2DIOReadNSCRArc(arc, art->screen, FALSE, &screen, panels->heapId);
    const u16 *entries = (const u16 *)screen->rawData + BANNER_TILE_Y * ART_TILES_ACROSS;
    // The art's tile of each of the banner's, by the banner's
    u16 *tiles = GFL_HeapAllocate(HEAPID_TAIL(panels->heapId), BANNER_ENTRIES * sizeof(u16), FALSE,
                                  "paperwhite2_pokedex_info_panels.c", __LINE__);
    u8 *pixels;
    u32 firstChar;
    u32 i;
    u32 j;

    panels->bannerTileCount = 0;
    for (i = 0; i < BANNER_ENTRIES; i++) {
        u16 tile = entries[i] & MAP_CHAR_MASK;

        panels->gridEntries[i] = grid[BANNER_TILE_Y * ART_TILES_ACROSS + i];
        for (j = 0; j < panels->bannerTileCount; j++) {
            if (tiles[j] == tile) {
                break;
            }
        }
        if (j == panels->bannerTileCount) {
            tiles[panels->bannerTileCount++] = tile;
        }
        // The banner's tile, placed below
        panels->bannerEntries[i] = j | (entries[i] & MAP_FLIPS);
    }
    pixels = GFL_HeapAllocate(HEAPID_TAIL(panels->heapId), panels->bannerTileCount * TILE_SIZE, FALSE,
                              "paperwhite2_pokedex_info_panels.c", __LINE__);
    for (j = 0; j < panels->bannerTileCount; j++) {
        MI_CpuCopy8((const u8 *)chars->pRawData + tiles[j] * TILE_SIZE, pixels + j * TILE_SIZE, TILE_SIZE);
    }
    firstChar = GRID_CHAR_COUNT - panels->bannerTileCount;
    GFL_BGSysLoadChar(BG_GRID, pixels, panels->bannerTileCount * TILE_SIZE, firstChar);
    for (i = 0; i < BANNER_ENTRIES; i++) {
        u16 entry = panels->bannerEntries[i];

        panels->bannerEntries[i] = (firstChar + (entry & MAP_CHAR_MASK)) | (entry & MAP_FLIPS) |
                                   (PALETTE_ART + BANNER_SUBPAGE) << MAP_PALETTE_SHIFT;
    }
    GFL_HeapFree(pixels);
    GFL_HeapFree(tiles);
    GFL_HeapFree(screenFile);
    GFL_HeapFree(charsFile);
}

// The sub-page's art's screen replaces BG_ART's whole screen, so the page makes its buttons after it. Only the screen
// changes, in the screen buffer, which goes to VRAM in the next VBlank, so the change shows all at once: writing it
// at once (as a sync load does) showed it a frame in the palette's first row, before its own row was set. The BG's
// lift is set in the same VBlank, and the rows below the art, which it shows under the touch bar, are cleared
void PokedexInfoPanels_LoadArt(PokedexInfoPanels *panels, u32 subpage) {
    const PanelsArt *art = &sSubpageArt[subpage];

    GFL_BGSysFillScrArea(BG_ART, 0, 0, 0, ART_TILES_ACROSS, ART_BG_TILES_DOWN, 0);
    GFL_BGSysMoveBGReq(BG_ART, BG_MOVE_SET_Y, sSubpageLift[subpage]);
    if (art->screen != ART_NONE) {
        ArcTool *arc = GFL_ArcSysCreateFileHandle(ARCID_POKEDEX_GRA, panels->heapId);

        // The screen's entries are the art's own tiles in its palette's first row, moved to where they are loaded
        GFL_G2DIOLoadNSCRAsync(arc, art->screen, BG_ART, 0, CHAR_POS(panels->artChars[subpage]), 0, FALSE,
                               panels->heapId);
        GFL_BGSysSetScrPaletteNo(BG_ART, 0, 0, ART_TILES_ACROSS, ART_TILES_DOWN, PALETTE_ART + subpage);
        GFL_ArcToolFree(arc);
    }
    // Evo's banner shows on the grid's BG, in the same VBlank as the art, which leaves its place clear; the other
    // sub-pages show the grid there
    if (panels->bannerTileCount != 0) {
        if (subpage == BANNER_SUBPAGE) {
            GFL_BGSysFillScrArea(BG_ART, 0, 0, BANNER_TILE_Y, ART_TILES_ACROSS, BANNER_TILES_DOWN, 0);
            GFL_BGSysLoadScrAreaAll(BG_GRID, panels->bannerEntries, 0, BANNER_TILE_Y, ART_TILES_ACROSS,
                                    BANNER_TILES_DOWN);
        } else {
            GFL_BGSysLoadScrAreaAll(BG_GRID, panels->gridEntries, 0, BANNER_TILE_Y, ART_TILES_ACROSS,
                                    BANNER_TILES_DOWN);
        }
        GFL_BGSysQueueScrLoad(BG_GRID);
    }
    GFL_BGSysQueueScrLoad(BG_ART);
}

u32 PokedexInfoPanels_GetLift(u32 subpage) {
    return sSubpageLift[subpage];
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

// The type icons of Matchups, hidden, each in its place on the sub-page. Its palette, cells and characters stay loaded
// while the page runs, so a sub-page change only shows or hides them, in the next VBlank as the BGs change
static void PokedexInfoPanels_CreateTypeIcons(PokedexInfoPanels *panels, ClActUnit *unit) {
    ArcTool *arc = GFL_ArcSysCreateFileHandle(ARCID_APP_MENU_COMMON, panels->heapId);
    ClActorSetup setup;
    u32 i;

    panels->typeIconPalette =
        ClActSys_LoadPlttRange(arc, AppMenuCommon_GetTypeIconPaletteFile(), CLACT_VRAM_SUB, PALETTE_TYPE_ICONS * 0x20,
                               0, TYPE_ICON_PALETTE_COUNT, panels->heapId);
    panels->typeIconCellAnims =
        ClActSys_LoadCellAnims(arc, AppMenuCommon_GetTypeIconCellFile(TYPE_ICON_MAPPING),
                               AppMenuCommon_GetTypeIconAnimFile(TYPE_ICON_MAPPING), panels->heapId);
    setup.sequence = 0;
    setup.priority = 0;
    // Over the panels' windows
    setup.bgPriority = PRIORITY_PANELS;
    for (i = 0; i < TYPE_CHART_SIZE; i++) {
        setup.x = MATCHUPS_ICON_X + i % MATCHUPS_COLUMNS * MATCHUPS_COLUMN_PITCH;
        setup.y = MATCHUPS_ICON_Y + i / MATCHUPS_COLUMNS * MATCHUPS_ROW_PITCH;
        panels->typeIconChars[i] =
            ClActSys_LoadChars(arc, AppMenuCommon_GetTypeIconCharFile(i), FALSE, CLACT_VRAM_SUB, panels->heapId);
        panels->typeIcons[i] = ClActor_Create(unit, panels->typeIconChars[i], panels->typeIconPalette,
                                              panels->typeIconCellAnims, &setup, CLACT_SURFACE_SUB, panels->heapId);
        ClActor_SetPalette(panels->typeIcons[i], AppMenuCommon_GetTypeIconPaletteIndex(i), TRUE);
        // Semi-transparent, as the entry's type icons are (PokedexInfo_InitTypeIcons), so that the page's fades darken
        // them with the BGs
        ClActor_SetObjMode(panels->typeIcons[i], GX_OAM_MODE_XLU);
        ClActor_SetVisible(panels->typeIcons[i], FALSE);
    }
    GFL_ArcToolFree(arc);
}

static void PokedexInfoPanels_FreeTypeIcons(PokedexInfoPanels *panels) {
    u32 i;

    for (i = 0; i < TYPE_CHART_SIZE; i++) {
        ClActor_Delete(panels->typeIcons[i]);
        ClActSys_FreeChars(panels->typeIconChars[i]);
    }
    ClActSys_FreeCellAnims(panels->typeIconCellAnims);
    ClActSys_FreePltt(panels->typeIconPalette);
}

// Moves' actors, hidden: a type icon for each row, which shows the type of its move by showing that type's Matchups
// characters, the relearner's cursor and the list's scroll knob. They are semi-transparent as the type icons are, so
// that the page's fades darken them
static void PokedexInfoPanels_CreateMoveActors(PokedexInfoPanels *panels, ClActUnit *unit) {
    ArcTool *arc = GFL_ArcSysCreateFileHandle(ARCID_POKEDEX_GRA, panels->heapId);
    ArcTool *tutorArc = GFL_ArcSysCreateFileHandle(ARCID_MOVE_TUTOR, panels->heapId);
    ClActorSetup setup;
    u32 i;

    panels->cursorPalette =
        ClActSys_LoadPlttRange(tutorArc, CURSOR_PALETTE, CLACT_VRAM_SUB, PALETTE_CURSOR * 0x20, 0, 1, panels->heapId);
    panels->cursorChars = ClActSys_LoadChars(arc, CURSOR_CHARS, FALSE, CLACT_VRAM_SUB, panels->heapId);
    panels->cursorCellAnims = ClActSys_LoadCellAnims(arc, CURSOR_CELLS, CURSOR_ANIMS, panels->heapId);
    panels->knobPalette = ClActSys_LoadPlttRange(arc, KNOB_PALETTE, CLACT_VRAM_SUB, PALETTE_KNOB * 0x20,
                                                 KNOB_PALETTE_ROW, 1, panels->heapId);
    panels->knobChars = ClActSys_LoadChars(arc, KNOB_CHARS, FALSE, CLACT_VRAM_SUB, panels->heapId);
    panels->knobCellAnims = ClActSys_LoadCellAnims(arc, KNOB_CELLS, KNOB_ANIMS, panels->heapId);
    GFL_ArcToolFree(tutorArc);
    GFL_ArcToolFree(arc);

    setup.x = MOVES_ROW_ICON_X;
    setup.sequence = 0;
    // Over the panels' windows, the cursor over the icons
    setup.priority = 1;
    setup.bgPriority = PRIORITY_PANELS;
    for (i = 0; i < POKEDEX_INFO_MOVE_ROWS; i++) {
        setup.y = MOVES_ROW_Y + i * MOVES_ROW_PITCH + MOVES_ROW_ICON_OFFSET_Y;
        panels->moveIcons[i] = ClActor_Create(unit, panels->typeIconChars[0], panels->typeIconPalette,
                                              panels->typeIconCellAnims, &setup, CLACT_SURFACE_SUB, panels->heapId);
        ClActor_SetObjMode(panels->moveIcons[i], GX_OAM_MODE_XLU);
        ClActor_SetVisible(panels->moveIcons[i], FALSE);
    }
    setup.x = MOVES_CURSOR_X;
    setup.y = MOVES_ROW_Y + MOVES_CURSOR_OFFSET_Y;
    setup.priority = 0;
    panels->cursor = ClActor_Create(unit, panels->cursorChars, panels->cursorPalette, panels->cursorCellAnims, &setup,
                                    CLACT_SURFACE_SUB, panels->heapId);
    ClActor_SetAutoAnim(panels->cursor, TRUE);
    ClActor_SetObjMode(panels->cursor, GX_OAM_MODE_XLU);
    ClActor_SetVisible(panels->cursor, FALSE);
    setup.x = MOVES_TRACK_X;
    setup.y = MOVES_TRACK_TOP + MOVES_KNOB_HALF_HEIGHT;
    setup.sequence = KNOB_SEQUENCE;
    panels->knob = ClActor_Create(unit, panels->knobChars, panels->knobPalette, panels->knobCellAnims, &setup,
                                  CLACT_SURFACE_SUB, panels->heapId);
    // The knob's cell names the list's palette row; it is the only row loaded, as this one
    ClActor_SetPalette(panels->knob, 0, TRUE);
    ClActor_SetObjMode(panels->knob, GX_OAM_MODE_XLU);
    ClActor_SetVisible(panels->knob, FALSE);
}

static void PokedexInfoPanels_FreeMoveActors(PokedexInfoPanels *panels) {
    u32 i;

    ClActor_Delete(panels->knob);
    ClActor_Delete(panels->cursor);
    for (i = 0; i < POKEDEX_INFO_MOVE_ROWS; i++) {
        ClActor_Delete(panels->moveIcons[i]);
    }
    ClActSys_FreeCellAnims(panels->knobCellAnims);
    ClActSys_FreeChars(panels->knobChars);
    ClActSys_FreePltt(panels->knobPalette);
    ClActSys_FreeCellAnims(panels->cursorCellAnims);
    ClActSys_FreeChars(panels->cursorChars);
    ClActSys_FreePltt(panels->cursorPalette);
}

void PokedexInfoPanels_Update(PokedexInfoPanels *panels) {
    PokedexDetailBackground_Update(panels->grid);
}

void PokedexInfoPanels_Show(PokedexInfoPanels *panels, u32 subpage, u16 species, u16 form, u16 sex, BOOL caught,
                            u32 ability) {
    PersonalData *personal = PML_PersonalLoad(species, form, panels->heapId);
    GFLBitmap *bitmap = BmpWin_GetBitmap(panels->contentWindow);
    u32 i;

    panels->movesKnown = caught;
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
    case POKEDEX_INFO_SUBPAGE_MOVES:
        PokedexInfoPanels_DrawMoves(panels);
        break;
    case POKEDEX_INFO_SUBPAGE_EVO:
        PokedexInfoEvo_Show(panels->evo, bitmap, CONTENT_TOP, species, form, sex);
        break;
    case POKEDEX_INFO_SUBPAGE_AREA:
        PokedexInfoArea_Draw(panels->area, bitmap, CONTENT_TOP, species);
        break;
    case POKEDEX_INFO_SUBPAGE_MATCHUPS:
        PokedexInfoPanels_DrawMatchups(panels, personal, ability);
        break;
    }
    for (i = 0; i < TYPE_CHART_SIZE; i++) {
        ClActor_SetVisible(panels->typeIcons[i], subpage == POKEDEX_INFO_SUBPAGE_MATCHUPS);
    }
    PokedexInfoPanels_UpdateMoveActors(panels, subpage == POKEDEX_INFO_SUBPAGE_MOVES);
    // Evo's icons take OBJ resources only while it shows
    if (subpage != POKEDEX_INFO_SUBPAGE_EVO) {
        PokedexInfoEvo_Hide(panels->evo);
    }
    PML_PersonalFree(personal);
    // PALETTE_CONTENT takes the sub-page's colors as it changes, in the VBlank that shows it
    if (subpage != panels->subpage) {
        switch (subpage) {
        case POKEDEX_INFO_SUBPAGE_MATCHUPS:
            panels->pendingPalette = sMatchupColors;
            break;
        case POKEDEX_INFO_SUBPAGE_EVO:
            panels->pendingPalette = PokedexInfoEvo_GetPalette(panels->evo);
            break;
        case POKEDEX_INFO_SUBPAGE_AREA:
            panels->pendingPalette = PokedexInfoArea_GetPalette(panels->area);
            break;
        }
        if (panels->pendingPalette != NULL) {
            DC_FlushRange(panels->pendingPalette, PALETTE_SIZE);
        }
    }
    panels->subpage = subpage;
    switch (subpage) {
    case POKEDEX_INFO_SUBPAGE_MATCHUPS:
    case POKEDEX_INFO_SUBPAGE_EVO:
        BmpWin_SetPalette(panels->contentWindow, PALETTE_CONTENT);
        break;
    default:
        BmpWin_SetPalette(panels->contentWindow, PALETTE_PANELS);
        break;
    }
    PokedexInfoPanels_Transfer(panels, panels->barWindow, PENDING_BAR);
    PokedexInfoPanels_Transfer(panels, panels->contentWindow, PENDING_CONTENT);
    // Area's icons' tiles take their own rows, over the window's
    if (subpage == POKEDEX_INFO_SUBPAGE_AREA) {
        PokedexInfoArea_SetIconPalettes(panels->area, BG_PANELS);
    }
}

PokedexInfoArea *PokedexInfoPanels_GetArea(PokedexInfoPanels *panels) {
    return panels->area;
}

// Area's glow on the open map, and the season marked on its legend, whose characters go to VRAM in the next VBlank
void PokedexInfoPanels_UpdateArea(PokedexInfoPanels *panels) {
    if (PokedexInfoArea_Update(panels->area, BmpWin_GetBitmap(panels->contentWindow), CONTENT_TOP)) {
        panels->pendingWindows |= PENDING_CONTENT;
    }
}

// Only the list and its actors change, all in the next VBlank, as a change of sub-page shows
void PokedexInfoPanels_ShowMoves(PokedexInfoPanels *panels) {
    GFL_BitmapFill(BmpWin_GetBitmap(panels->contentWindow), PANELS_COLOR_CLEAR);
    PokedexInfoPanels_DrawMoves(panels);
    PokedexInfoPanels_UpdateMoveActors(panels, TRUE);
    PokedexInfoPanels_Transfer(panels, panels->contentWindow, PENDING_CONTENT);
}

// A window's map entries go to the screen buffer, which goes to VRAM in the next VBlank, and its characters wait for
// that VBlank too (PokedexInfoPanels_VBlank). Loaded at once, as BmpWin_Transfer loads them, the characters showed
// for the rest of the frame in the old map entries' palette row (Evo's balls in the panels' or Matchups' colors) and
// before the OBJs moved with them (Moves' icons, cursor and knob)
static void PokedexInfoPanels_Transfer(PokedexInfoPanels *panels, BmpWin *window, u32 pending) {
    BmpWin_FlushMap(window);
    GFL_BGSysQueueScrLoad(BmpWin_GetBGIndex(window));
    panels->pendingWindows |= pending;
}

// Runs in the VBlank, before the BGs' screens are loaded (GFL_VBlankUpdate), so that a window's characters and its
// screen show from the same frame, with the OBJs that the frame moved
static void PokedexInfoPanels_VBlank(TCB *tcb, void *data) {
    PokedexInfoPanels *panels = data;

    if (panels->pendingPalette != NULL) {
        GXS_LoadBGPltt(panels->pendingPalette, PALETTE_CONTENT * PALETTE_SIZE, PALETTE_SIZE);
        panels->pendingPalette = NULL;
    }
    if (panels->pendingWindows & PENDING_BAR) {
        BmpWin_FlushChar(panels->barWindow);
    }
    if (panels->pendingWindows & PENDING_CONTENT) {
        BmpWin_FlushChar(panels->contentWindow);
    }
    panels->pendingWindows = 0;
}

u32 PokedexInfoPanels_GetTouchedSubpage(void) {
    s32 rect = GFL_HIDGetTouchPressedRect(sSubpageRects);

    if (rect == TOUCH_RECT_NONE) {
        return POKEDEX_INFO_SUBPAGE_COUNT;
    }
    return rect;
}

u32 PokedexInfoPanels_GetTouchedMoveSet(void) {
    s32 rect = GFL_HIDGetTouchPressedRect(sMoveSetRects);

    if (rect == TOUCH_RECT_NONE) {
        return POKEDEX_INFO_MOVES_SET_COUNT;
    }
    return rect;
}

u32 PokedexInfoPanels_GetTouchedMoveRow(void) {
    s32 rect = GFL_HIDGetTouchPressedRect(sMoveRowRects);

    if (rect == TOUCH_RECT_NONE) {
        return POKEDEX_INFO_MOVE_ROWS;
    }
    return rect;
}

u16 PokedexInfoPanels_GetTouchedEvoSpecies(PokedexInfoPanels *panels) {
    return PokedexInfoEvo_GetTouchedSpecies(panels->evo);
}

BOOL PokedexInfoPanels_IsMoveTrackTouched(void) {
    return GFL_HIDGetTouchPressedRect(sMoveTrackRects) != TOUCH_RECT_NONE;
}

// The scroll whose knob is at the touch's height, as the knob is placed (PokedexInfoPanels_UpdateMoveActors), from the
// first scroll at the knob's highest place and above to the last at its lowest and below
BOOL PokedexInfoPanels_GetHeldMoveScroll(PokedexInfoPanels *panels, u32 *scroll) {
    u32 x;
    u32 y;

    if (!GFL_HIDGetTouchHeldPoint(&x, &y)) {
        return FALSE;
    }
    *scroll = ScrollBar_GetValue(panels->moves->count - POKEDEX_INFO_MOVE_ROWS, y, MOVES_TRACK_TOP, MOVES_TRACK_BOTTOM,
                                 MOVES_KNOB_HALF_HEIGHT * 2);
    return TRUE;
}

StrBuf *PokedexInfoPanels_LoadMessage(PokedexInfoPanels *panels, u32 messageId) {
    return GFL_MsgDataLoadStrbufNew(panels->msgData, messageId);
}

Font *PokedexInfoPanels_GetSmallFont(PokedexInfoPanels *panels) {
    return panels->smallFont;
}

// The art draws the tabs; a sub-page without art has a dark strip with its own name, so that it can be told apart
static void PokedexInfoPanels_DrawBar(PokedexInfoPanels *panels, u32 subpage) {
    GFLBitmap *bitmap = BmpWin_GetBitmap(panels->barWindow);

    if (sSubpageArt[subpage].screen != ART_NONE) {
        GFL_BitmapFill(bitmap, PANELS_COLOR_CLEAR);
        return;
    }
    GFL_BitmapFill(bitmap, PANELS_COLOR_BORDER);
    PokedexInfoPanels_Print(panels, bitmap, 0, panels->smallFont, sSubpageNames[subpage], BAR_NAME_X, BAR_TEXT_Y,
                            PRINT_ALIGN_CENTER, BAR_SHOWN_COLOR);
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

// The egg's column: the egg groups, one or two in font 1, and the hatch cycles with their steps
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
        PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->smallFont, message, EGG_CENTER_X,
                                EGG_GROUP_Y + i * EGG_GROUP_PITCH, PRINT_ALIGN_CENTER, EGG_VALUE_COLOR);
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

// The bar of the sets, and the rows of the shown set from its scroll, or "No moves" for an empty one, with the scroll
// bar's track; until there is art, the bar is a light strip. The art draws the tabs and the sets' bar only, so the
// rows' placeholders and the track are drawn over it. Until the species is caught, the bar only, and "Learnset
// Unknown"
static void PokedexInfoPanels_DrawMoves(PokedexInfoPanels *panels) {
    const PokedexInfoMoves *moves = panels->moves;
    GFLBitmap *bitmap = BmpWin_GetBitmap(panels->contentWindow);
    BOOL art = sSubpageArt[POKEDEX_INFO_SUBPAGE_MOVES].screen != ART_NONE;
    u32 i;

    if (!art) {
        GFL_BitmapFillArea(bitmap, 0, MOVES_SET_BAR_Y - CONTENT_TOP, CONTENT_WINDOW_WIDTH * 8, MOVES_SET_BAR_HEIGHT,
                           PANELS_COLOR_PANEL);
    }
    for (i = 0; i < POKEDEX_INFO_MOVES_SET_COUNT; i++) {
        PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->smallFont, sMoveSetNames[i], sMoveSetX[i],
                                MOVES_SET_TEXT_Y, PRINT_ALIGN_LEFT,
                                i == moves->set ? TEXT_COLOR : MOVES_SET_OTHER_COLOR);
    }
    if (!panels->movesKnown) {
        PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->font, PokedexData_Text_LearnsetUnknown,
                                MOVES_UNKNOWN_X, MOVES_UNKNOWN_Y, PRINT_ALIGN_CENTER, MOVES_NAME_COLOR);
        return;
    }
    GFL_BitmapFillArea(bitmap, MOVES_TRACK_X - 1, MOVES_TRACK_TOP - CONTENT_TOP, 3,
                       MOVES_TRACK_BOTTOM - MOVES_TRACK_TOP, PANELS_COLOR_BORDER);
    GFL_BitmapFillArea(bitmap, MOVES_TRACK_X, MOVES_TRACK_TOP + 1 - CONTENT_TOP, 1,
                       MOVES_TRACK_BOTTOM - MOVES_TRACK_TOP - 2, PANELS_COLOR_PANEL);
    for (i = 0; i < POKEDEX_INFO_MOVE_ROWS; i++) {
        int top = MOVES_ROW_Y + i * MOVES_ROW_PITCH;

        PokedexInfoPanels_DrawMoveRow(bitmap, top - CONTENT_TOP);
        if (moves->scroll + i < moves->count) {
            PokedexInfoPanels_DrawMove(panels, bitmap, &moves->moves[moves->scroll + i], top);
        }
    }
    if (moves->count == 0) {
        PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->font, PokedexData_Text_NoMoves, MOVES_ROW_NAME_X,
                                MOVES_ROW_Y + MOVES_ROW_TEXT_OFFSET_Y, PRINT_ALIGN_LEFT, MOVES_NAME_COLOR);
    }
}

// A row's move name, and its detail in the row's end: the level it is learnt at, its machine, the town of its tutor,
// or a dash for an egg move
static void PokedexInfoPanels_DrawMove(PokedexInfoPanels *panels, GFLBitmap *bitmap, const PokedexInfoMove *move,
                                       int top) {
    int y = top + MOVES_ROW_TEXT_OFFSET_Y;
    u32 message = PokedexData_Text_EggMove;

    GFL_MsgDataLoadStrbuf(panels->moveNames, move->move, panels->text);
    PokedexInfoPanels_PrintFitting(panels, bitmap, panels->text, MOVES_ROW_NAME_WIDTH, MOVES_ROW_NAME_X, y,
                                   PRINT_ALIGN_LEFT, MOVES_NAME_COLOR);
    switch (panels->moves->set) {
    case POKEDEX_INFO_MOVES_LEVEL_UP:
        WordSetNumber(panels->wordSet, 0, move->detail, 3, NUM_PAD_NONE, TRUE);
        message = PokedexData_Text_MoveLevel;
        break;
    case POKEDEX_INFO_MOVES_MACHINES:
        // The TMs' bits are their numbers from 0, the HMs' follow the TMs'
        if (move->detail < MOVES_TM_COUNT) {
            WordSetNumber(panels->wordSet, 0, move->detail + 1, 2, NUM_PAD_ZERO, TRUE);
            message = PokedexData_Text_MoveTM;
        } else {
            WordSetNumber(panels->wordSet, 0, move->detail - MOVES_TM_COUNT + 1, 2, NUM_PAD_ZERO, TRUE);
            message = PokedexData_Text_MoveHM;
        }
        break;
    case POKEDEX_INFO_MOVES_TUTOR:
        GFL_MsgDataLoadStrbuf(panels->placeNames, move->detail, panels->text);
        PokedexInfoPanels_PrintFitting(panels, bitmap, panels->text, MOVES_ROW_DETAIL_WIDTH, MOVES_ROW_DETAIL_RIGHT, y,
                                       PRINT_ALIGN_RIGHT, TEXT_COLOR);
        return;
    }
    PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->font, message, MOVES_ROW_DETAIL_RIGHT, y,
                            PRINT_ALIGN_RIGHT, TEXT_COLOR);
}

// A row's placeholder as the relearner's rows are shaped: a grey parallelogram with a light end and a dark border,
// each line ROW_SLANT / (ROW_HEIGHT - 1) right of the one above
static void PokedexInfoPanels_DrawMoveRow(GFLBitmap *bitmap, int y) {
    int line;

    for (line = 0; line < MOVES_ROW_HEIGHT; line++) {
        int shift = line * MOVES_ROW_SLANT / (MOVES_ROW_HEIGHT - 1);
        int left = MOVES_ROW_X + shift;
        int end = MOVES_ROW_END_X + shift;
        int right = MOVES_ROW_X + MOVES_ROW_WIDTH - 1 + shift;

        GFL_BitmapFillArea(bitmap, left, y + line, right - left + 1, 1, PANELS_COLOR_BORDER);
        if (line != 0 && line != MOVES_ROW_HEIGHT - 1) {
            GFL_BitmapFillArea(bitmap, left + 1, y + line, end - left - 1, 1, PANELS_COLOR_DIM);
            GFL_BitmapFillArea(bitmap, end, y + line, right - end, 1, PANELS_COLOR_PANEL);
        }
    }
}

// Each row's type icon to its move's type, the cursor on its row and the knob at the scroll's place on the track, or
// all hidden off Moves and until the species is caught
static void PokedexInfoPanels_UpdateMoveActors(PokedexInfoPanels *panels, BOOL shown) {
    const PokedexInfoMoves *moves = panels->moves;
    ClActorPos pos;
    u32 i;

    shown = shown && panels->movesKnown;

    for (i = 0; i < POKEDEX_INFO_MOVE_ROWS; i++) {
        BOOL visible = FALSE;

        if (shown && moves->scroll + i < moves->count) {
            u32 type = PML_MoveGetParam(moves->moves[moves->scroll + i].move, MOVE_PARAM_TYPE);

            if (type < TYPE_CHART_SIZE) {
                NNSG2dImageProxy proxy;

                ClActSys_GetCharProxy(panels->typeIconChars[type], &proxy);
                ClActor_SetImageProxy(panels->moveIcons[i], &proxy);
                ClActor_SetPalette(panels->moveIcons[i], AppMenuCommon_GetTypeIconPaletteIndex(type), TRUE);
                visible = TRUE;
            }
        }
        ClActor_SetVisible(panels->moveIcons[i], visible);
    }
    pos.x = MOVES_CURSOR_X;
    pos.y = MOVES_ROW_Y + (moves->cursor - moves->scroll) * MOVES_ROW_PITCH + MOVES_CURSOR_OFFSET_Y;
    ClActor_SetSurfacePos(panels->cursor, &pos, CLACT_SURFACE_SUB);
    ClActor_SetVisible(panels->cursor, shown && moves->count != 0);
    pos.x = MOVES_TRACK_X;
    pos.y = MOVES_TRACK_TOP + MOVES_KNOB_HALF_HEIGHT;
    if (moves->count > POKEDEX_INFO_MOVE_ROWS) {
        pos.y += (MOVES_TRACK_BOTTOM - MOVES_TRACK_TOP - MOVES_KNOB_HALF_HEIGHT * 2) * moves->scroll /
                 (moves->count - POKEDEX_INFO_MOVE_ROWS);
    }
    ClActor_SetSurfacePos(panels->knob, &pos, CLACT_SURFACE_SUB);
    ClActor_SetVisible(panels->knob, shown);
}

// Each attacking type's multiplier against the species' types and the ability, under its icon. Shown once the species
// is seen, as the types are
static void PokedexInfoPanels_DrawMatchups(PokedexInfoPanels *panels, PersonalData *personal, u32 ability) {
    GFLBitmap *bitmap = BmpWin_GetBitmap(panels->contentWindow);
    u32 type1 = PML_PersonalGetParam(personal, PERSONAL_TYPE_1);
    u32 type2 = PML_PersonalGetParam(personal, PERSONAL_TYPE_2);
    u32 i;

    if (sSubpageArt[POKEDEX_INFO_SUBPAGE_MATCHUPS].screen == ART_NONE) {
        PokedexInfoPanels_DrawPanel(bitmap, MATCHUPS_PANEL_X, MATCHUPS_PANEL_Y - CONTENT_TOP, MATCHUPS_PANEL_WIDTH,
                                    MATCHUPS_PANEL_HEIGHT);
    }
    for (i = 0; i < TYPE_CHART_SIZE; i++) {
        PokedexInfoPanels_PrintMultiplier(panels, bitmap, PokedexInfoPanels_GetMultiplier(i, type1, type2, ability),
                                          MATCHUPS_ICON_X + i % MATCHUPS_COLUMNS * MATCHUPS_COLUMN_PITCH,
                                          MATCHUPS_ICON_Y + i / MATCHUPS_COLUMNS * MATCHUPS_ROW_PITCH +
                                              MATCHUPS_VALUE_OFFSET_Y);
    }
}

// The damage multiplier of a move of the attacking type against the types, a species of one having it twice, and
// then the ability's rules, in MULTIPLIER_ONE's fixed point
static u32 PokedexInfoPanels_GetMultiplier(u32 attackType, u32 type1, u32 type2, u32 ability) {
    u32 multiplier = PaperWhite2_TypeChart[attackType][type1] * (MULTIPLIER_ONE / TYPE_CHART_NORMAL);
    u32 i;

    if (type2 != type1) {
        multiplier = multiplier * PaperWhite2_TypeChart[attackType][type2] / TYPE_CHART_NORMAL;
    }
    for (i = 0; i < NELEMS(sMatchupRules); i++) {
        const MatchupRule *rule = &sMatchupRules[i];

        if (rule->ability == ability &&
            (rule->target == attackType ||
             (rule->target == MATCHUP_TARGET_SUPER_EFFECTIVE && multiplier > MULTIPLIER_ONE) ||
             (rule->target == MATCHUP_TARGET_NOT_SUPER_EFFECTIVE && multiplier <= MULTIPLIER_ONE))) {
            multiplier = multiplier * rule->quarters / 4;
        }
    }
    return multiplier;
}

// A multiplier as a small "×" and the number with its decimals, as many as it has (64ths have at most six), centered
// at x
static void PokedexInfoPanels_PrintMultiplier(PokedexInfoPanels *panels, GFLBitmap *bitmap, u32 multiplier, int x,
                                              int y) {
    u32 fraction = multiplier % MULTIPLIER_ONE;
    u32 decimals = 0;
    u32 digits = 0;
    u16 color = MULTIPLIER_NORMAL_COLOR;
    u32 message = PokedexData_Text_Number;
    u32 signWidth;
    u32 numberWidth;

    while (fraction != 0) {
        fraction *= 10;
        decimals = decimals * 10 + fraction / MULTIPLIER_ONE;
        fraction %= MULTIPLIER_ONE;
        digits++;
    }
    if (multiplier == 0) {
        color = MULTIPLIER_NONE_COLOR;
    } else if (multiplier > MULTIPLIER_ONE) {
        color = MULTIPLIER_UP_COLOR;
    } else if (multiplier < MULTIPLIER_ONE) {
        color = MULTIPLIER_DOWN_COLOR;
    }
    WordSetNumber(panels->wordSet, 0, multiplier / MULTIPLIER_ONE, 2, NUM_PAD_NONE, TRUE);
    if (digits != 0) {
        // The decimals with their leading zeros
        WordSetNumber(panels->wordSet, 1, decimals, digits, NUM_PAD_ZERO, TRUE);
        message = PokedexData_Text_MultiplierDecimal;
    }
    signWidth = PokedexInfoPanels_GetWidth(panels, panels->smallFont, PokedexData_Text_Multiplier);
    numberWidth = PokedexInfoPanels_GetWidth(panels, panels->smallFont, message);
    x -= (signWidth + numberWidth) / 2;
    PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->smallFont, PokedexData_Text_Multiplier, x,
                            y + MULTIPLIER_SIGN_OFFSET_Y, PRINT_ALIGN_LEFT, color);
    PokedexInfoPanels_Print(panels, bitmap, CONTENT_TOP, panels->smallFont, message, x + signWidth, y, PRINT_ALIGN_LEFT,
                            color);
}

// A message's width in a font, formatted with the word set
static u32 PokedexInfoPanels_GetWidth(PokedexInfoPanels *panels, Font *font, u32 messageId) {
    GFL_MsgDataLoadStrbuf(panels->msgData, messageId, panels->message);
    GFL_WordSetFormatStrbuf(panels->wordSet, panels->text, panels->message);
    return GFL_FontGetBlockWidth(panels->text, font, 0);
}

BOOL PokedexInfoPanels_IsMatchupAbility(u32 ability) {
    u32 i;

    for (i = 0; i < NELEMS(sMatchupRules); i++) {
        if (sMatchupRules[i].ability == ability) {
            return TRUE;
        }
    }
    return FALSE;
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
    GFL_MsgDataLoadStrbuf(panels->msgData, messageId, panels->message);
    GFL_WordSetFormatStrbuf(panels->wordSet, panels->text, panels->message);
    return PokedexInfoPanels_PrintText(bitmap, top, font, panels->text, x, y, align, color);
}

// Draws a string as PokedexInfoPanels_Print draws a message
static u32 PokedexInfoPanels_PrintText(GFLBitmap *bitmap, int top, Font *font, const StrBuf *text, int x, int y,
                                       u32 align, u16 color) {
    u32 width = GFL_FontGetBlockWidth(text, font, 0);

    switch (align) {
    case PRINT_ALIGN_RIGHT:
        x -= width;
        break;
    case PRINT_ALIGN_CENTER:
        x -= width / 2;
        break;
    }
    GFL_TextRendererDrawToBitmapEx(bitmap, x, y - top, text, font, color);
    return width;
}

// Draws a string into the content window in font 0, or in font 1 a little lower if font 0 makes it wider than width
static void PokedexInfoPanels_PrintFitting(PokedexInfoPanels *panels, GFLBitmap *bitmap, const StrBuf *text, u32 width,
                                           int x, int y, u32 align, u16 color) {
    if (GFL_FontGetBlockWidth(text, panels->font, 0) > width) {
        PokedexInfoPanels_PrintText(bitmap, CONTENT_TOP, panels->smallFont, text, x, y + MOVES_SMALL_TEXT_OFFSET_Y,
                                    align, color);
    } else {
        PokedexInfoPanels_PrintText(bitmap, CONTENT_TOP, panels->font, text, x, y, align, color);
    }
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
