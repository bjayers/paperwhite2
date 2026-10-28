// Paper White 2: Type Icons, the "angular HUD wedges" style. A port of the PMC plugin TypeIconsSolidW2 0.3.24-solid
// (bjayers/pokeweb-serverless, runtime/battle-type-hud/battle_type_hud.cpp built with ICON_VARIANT_SOLID, and its
// assets-solid.h), whose DLL is the one in the hack's ROM. It colors the light checkered face at the stair-stepped left
// edge of each battler's name box with the battler's current types: a monotype fills it, a dual type colors its upper
// and lower fields. The colors take the box's palette entries 4 and 15, whose shadow pixels it moves to the outline's
// index 2 first, and follow the battle's palette fades. It also shifts the enemy's name, sex and level, and the
// player's in single and double battles, to the right to leave room. Rotation battles and the Pokéstar Studios'
// gauges are left alone. The player's name box in single and double battles has eight more blank tiles and a third
// OAM piece in res/graphics/btlv/438.png and 439.ncer, the installer's panel expansion, which this checks for.
//
// Differences from the plugin, which had to check that it was in the game it was built for: it reads the game's
// structs instead of offsets, calls the game's functions directly, and doesn't check that pointers are in main RAM
// (the DS and DSi bounds), since in the game's own code they are. The other checks stay.

#include "types.h"
#include "battle/btl_pokeparam.h"
#include "battle/btlv_effect.h"
#include "battle/btlv_gauge.h"
#include "constants/battle.h"
#include "constants/pokemon.h"
#include "gfl/clact.h"
#include "nitro/gx.h"
#include "nitro/hw.h"
#include "nnsys/g2d.h"
#include "paperwhite2/battle_type_icons.h"
#include "pml/poke_party.h"
#include "system/palanm.h"

// The name box's palette entries that the wedges take: the native shadow's two colors, whose pixels become the
// outline's near-black. A monotype takes the second for its dark edge shade
#define ICON_COLOR_OUTLINE 2
#define ICON_COLOR_PRIMARY 4
#define ICON_COLOR_SECONDARY 15
// The two grays of the native face's checkerboard
#define FACE_COLOR_LIGHT 3
#define FACE_COLOR_DARK 13
// How many palette entries TypeIcons_CurrentFade compares, entries that the wedges never change
#define FADE_PROBE_COLORS 4

// The wedge's box in the name box: 12 pixels wide, from row 18, 11 rows tall on the player's box in single and double
// battles and 7 on the others
#define ICON_TOP 18
#define ICON_WIDTH 12
#define ICON_HEIGHT_TALL 11
#define ICON_HEIGHT_COMPACT 7
// The rows of the native face that PANEL_BACKGROUND holds, 26 pixels wide
#define BACKGROUND_TOP 15
#define BACKGROUND_ROWS 17
#define BACKGROUND_WIDTH 26

// The name box's characters, in halfwords of four pixels: 128 by 32 pixels as two 64-pixel-wide pieces, and the eight
// blank tiles of the player's box in single and double battles, or of the enemy's in triple battles
#define CHAR_WORDS 1024
#define CHAR_WORDS_EXPANDED 1152

// The header, the rows of the name, sex and level, and where its name and its sex and level start
#define HEADER_ROWS 16
#define HEADER_WIDTH 128

// The types the wedges have colors for: the game's 17 and 17 itself, which is a Fairy type in hacks that add one
#define ICON_TYPE_COUNT 18

// The name boxes, one per view position, 2 and 3 sharing 0 and 1's
#define ICON_RECORD_COUNT 6

// The HP numbers' character with the slash, which their updates never redraw
#define HP_NUMBERS_SLASH_CHAR 3
// The OBJ VRAM of the main engine that the battle's characters are in (BtlvCore's VRAM setup, GX_VRAM_OBJ_64_E)
#define OBJ_VRAM_SIZE 0x10000
#define VRAMCNT_E_MASK 0x87
#define VRAMCNT_E_MAIN_OBJ 0x82

// Why the icons stopped, kept for a look in a memory viewer: nothing reads it
enum {
    ICON_FAILURE_NONE,
    ICON_FAILURE_BAD_POINTER,
    ICON_FAILURE_BAD_LAYOUT,
    ICON_FAILURE_BAD_GRAPHICS,
    ICON_FAILURE_BAD_PALETTE,
    ICON_FAILURE_SHARED_PALETTE,
    ICON_FAILURE_BAD_TYPES,
};

struct PaperWhite2TypeIcon {
    BtlvGauge *gauge; // NULL when the record is free
    BattleMon *mon;
    PartyPkm *disguise; // the Illusion disguise whose types are in disguiseTypes
    u16 *chars;         // the name box's characters in OBJ VRAM
    u32 charsId;        // the entry's nameChars when the box was attached
    u32 hash;           // of the characters after the last paint, 0 to paint again
    // The checker phase of each face pixel under the wedge, a bit each, 1 for FACE_COLOR_DARK
    u8 backup[10];
    u8 headerMoved; // whether the header is shifted, by nameShift and infoShift
    u8 nameShift;
    u8 infoShift;
    u32 headerHash;  // the low 24 bits of TypeIcons_HeaderHash before the shift
    u16 original[2]; // the palette entries 4 and 15 to restore
    PokeTypePair types;
    PokeTypePair disguiseTypes;
    u8 pos : 3; // the view position
    u8 status : 3;
    u8 painted : 1;
    u8 valid : 1; // attached to the name box's characters and palette
    u8 bank;      // the box's OBJ palette
    u8 monId;     // the mon's ID, which a switch changes
    u8 layout;    // the gauge's style: BTL_STYLE_SINGLE for single and double battles, or BTL_STYLE_TRIPLE
};

typedef struct {
    PaperWhite2TypeIcon icons[ICON_RECORD_COUNT];
    u8 failure;
    u8 bindings;
    u16 redraws;
} TypeIconsState;

// A wedge's rows, as masks of 12 pixels whose bit 11 is the leftmost: the face's light pixels that it replaces, and
// which of them a dual type's first and second type fill, the shaded edges of those two, and a monotype's fill and edge
typedef struct {
    u16 face[ICON_HEIGHT_TALL];
    u16 primary[ICON_HEIGHT_TALL];
    u16 secondary[ICON_HEIGHT_TALL];
    u16 primaryShade[ICON_HEIGHT_TALL];
    u16 secondaryShade[ICON_HEIGHT_TALL];
    u16 mono[ICON_HEIGHT_TALL];
    u16 monoShade[ICON_HEIGHT_TALL];
} TypeIconWedge;

// clang-format off
static const TypeIconWedge TALL_WEDGE = {
    { 0x3f8, 0x3f8, 0x7f0, 0x7f0, 0xfe0, 0xfe0, 0x7f0, 0x3f8, 0x1fc, 0x0fe, 0x07f },
    { 0x1e0, 0x1e0, 0x3c0, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000 },
    { 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x3c0, 0x1e0, 0x0f0, 0x078, 0x03c },
    { 0x210, 0x210, 0x420, 0x7e0, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000 },
    { 0x000, 0x000, 0x000, 0x000, 0x000, 0xfc0, 0x420, 0x210, 0x108, 0x084, 0x042 },
    { 0x1e0, 0x1e0, 0x3c0, 0x3c0, 0x780, 0x780, 0x3c0, 0x1e0, 0x0f0, 0x078, 0x03c },
    { 0x210, 0x210, 0x420, 0x420, 0x840, 0x840, 0x420, 0x210, 0x108, 0x084, 0x042 },
};

static const TypeIconWedge COMPACT_WEDGE = {
    { 0x7f0, 0x7f0, 0xfe0, 0xfe0, 0x7f0, 0x3f8, 0x1fc },
    { 0x3c0, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000 },
    { 0x000, 0x000, 0x000, 0x000, 0x3c0, 0x1e0, 0x0f0 },
    { 0x420, 0x7e0, 0x000, 0x000, 0x000, 0x000, 0x000 },
    { 0x000, 0x000, 0x000, 0xfc0, 0x420, 0x210, 0x108 },
    { 0x3c0, 0x3c0, 0x780, 0x780, 0x3c0, 0x1e0, 0x0f0 },
    { 0x420, 0x420, 0x840, 0x840, 0x420, 0x210, 0x108 },
};
// clang-format on

// Each type's fill, by type ID, and a monotype's darker edge, sampled from the summary screen's type labels
static const u16 TYPE_COLORS[ICON_TYPE_COUNT] = {
    0x4210, 0x125c, 0x6aae, 0x6552, 0x1dd4, 0x4295, 0x1694, 0x390e, 0x66ad,
    0x1d9c, 0x7266, 0x1e68, 0x16fc, 0x45bd, 0x6729, 0x5dab, 0x210a, 0x723c,
};
static const u16 TYPE_SHADES[ICON_TYPE_COUNT] = {
    0x294a, 0x18e9, 0x4948, 0x28e9, 0x0d4e, 0x0d4e, 0x1da8, 0x28e9, 0x294a,
    0x048e, 0x4948, 0x1da8, 0x0d4e, 0x1ced, 0x4948, 0x48e9, 0x18e9, 0x48e9,
};

// The native pixels of the name boxes at x 0 to 25 and y 15 to 31, two to a byte with the left one low: the player's
// and the enemy's in single and double battles, then in triple battles. Copied from the plugin, which took them from
// a/0/1/1's boxes
static const u8 PANEL_BACKGROUND[4][BACKGROUND_ROWS][BACKGROUND_WIDTH / 2] = {
    {
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x20, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22 },
        { 0x00, 0x00, 0x00, 0x00, 0x32, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d },
        { 0x00, 0x00, 0x00, 0x00, 0xd2, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3 },
        { 0x00, 0x00, 0x00, 0x20, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d },
        { 0x00, 0x00, 0x00, 0x20, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3 },
        { 0x00, 0x00, 0x00, 0x32, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d },
        { 0x00, 0x00, 0x00, 0xd2, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3 },
        { 0x00, 0x00, 0x00, 0x20, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0xdd, 0x22, 0x22, 0x32 },
        { 0x00, 0x00, 0x00, 0x00, 0xd2, 0xd3, 0xd3, 0xd3, 0xd3, 0x23, 0xbc, 0xbb, 0xd2 },
        { 0x00, 0x00, 0x00, 0x00, 0x20, 0x3d, 0x3d, 0x3d, 0x3d, 0x2d, 0xcb, 0x22, 0x32 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0xd2, 0xd3, 0xd3, 0xd3, 0xc2, 0xbb, 0x2c, 0xd3 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0xdd, 0xdd, 0xdd, 0xb2, 0x2c, 0x22, 0x22 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x22, 0x22, 0x22, 0xbc, 0xbb, 0x22, 0xb2 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0x22, 0x22, 0x22, 0x22, 0x22 },
    },
    {
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x32, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0xd2, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xd2, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x22, 0x22, 0x22, 0x22, 0x22 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0x22, 0x22, 0x22, 0x22 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
    },
    {
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22 },
        { 0x00, 0x00, 0x00, 0x00, 0x20, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3 },
        { 0x00, 0x00, 0x00, 0x00, 0x20, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d },
        { 0x00, 0x00, 0x00, 0x00, 0xd2, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3 },
        { 0x00, 0x00, 0x00, 0x00, 0x32, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d },
        { 0x00, 0x00, 0x00, 0x00, 0x20, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x32, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
    },
    {
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x32, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xd2, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x32, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d, 0x3d },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3, 0xd3 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xd2, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0x22, 0x22, 0x22, 0x22, 0x22 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
        { 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 },
    },
};

// The HP numbers' slash character as the game's graphics have it with its shadow moved from 4 to 2
static const u16 HP_NUMBERS_SLASH[16] = {
    0x0000, 0x0000, 0x2000, 0x0022, 0x2000, 0x0021, 0xe200, 0x002e,
    0x1200, 0x0002, 0xee20, 0x0002, 0x2120, 0x0000, 0x2220, 0x0000,
};

// The OAM pieces of the enemy's name box (two in single and double battles, three in triple battles) and of the
// player's in single and double battles, with the third piece of the panel expansion
static const NNSG2dCellOAMAttrData ENEMY_PANEL_OAMS[3] = {
    { 0x40f0, 0xc1c0, 0x0000 },
    { 0x40f0, 0xc000, 0x0010 },
    { 0x80f0, 0x8040, 0x0020 },
};
static const NNSG2dCellOAMAttrData PLAYER_PANEL_OAMS[3] = {
    { 0x40f0, 0xc1c0, 0x0000 },
    { 0x40f0, 0xc000, 0x0010 },
    { 0x40f4, 0x81bc, 0x0020 },
};

static TypeIconsState sTypeIcons;

static void TypeIcons_Fail(u8 why) {
    if (sTypeIcons.failure == ICON_FAILURE_NONE) {
        sTypeIcons.failure = why;
    }
}

static BtlvGaugeEntry *TypeIcons_Entry(const PaperWhite2TypeIcon *icon) {
    return &icon->gauge->entries[icon->pos];
}

static PaperWhite2TypeIcon *TypeIcons_Find(u32 pos) {
    if (pos < BTLV_GAUGE_POS_MAX) {
        return &sTypeIcons.icons[pos < 2 ? pos : pos - 2];
    }
    return NULL;
}

static BOOL TypeIcons_IsEnemy(const PaperWhite2TypeIcon *icon) {
    return icon->pos & 1;
}

// The player's box in single and double battles, whose header is shifted too
static BOOL TypeIcons_BesideName(const PaperWhite2TypeIcon *icon) {
    return icon->layout == BTL_STYLE_SINGLE && !TypeIcons_IsEnemy(icon);
}

static BOOL TypeIcons_IsCompact(const PaperWhite2TypeIcon *icon) {
    return TypeIcons_IsEnemy(icon) || icon->layout >= BTL_STYLE_TRIPLE;
}

static const TypeIconWedge *TypeIcons_Wedge(const PaperWhite2TypeIcon *icon) {
    return TypeIcons_IsCompact(icon) ? &COMPACT_WEDGE : &TALL_WEDGE;
}

static u32 TypeIcons_Height(const PaperWhite2TypeIcon *icon) {
    return TypeIcons_IsCompact(icon) ? ICON_HEIGHT_COMPACT : ICON_HEIGHT_TALL;
}

static u32 TypeIcons_Left(const PaperWhite2TypeIcon *icon) {
    if (!TypeIcons_IsEnemy(icon)) {
        return icon->layout >= BTL_STYLE_TRIPLE ? 9 : 7;
    }
    return icon->layout >= BTL_STYLE_TRIPLE ? 12 : 11;
}

static u32 TypeIcons_CharWords(const PaperWhite2TypeIcon *icon) {
    BOOL expanded = icon->layout >= BTL_STYLE_TRIPLE ? TypeIcons_IsEnemy(icon) : !TypeIcons_IsEnemy(icon);

    return expanded ? CHAR_WORDS_EXPANDED : CHAR_WORDS;
}

static BOOL TypeIcons_IsMonotype(const PaperWhite2TypeIcon *icon) {
    return PokeTypePair_IsMonotype(icon->types);
}

// The halfword of a pixel of a 64-pixel-wide piece of 4bpp characters
static u32 TypeIcons_CharOffset(u32 x, u32 y) {
    return ((y / 8) * 8 + x / 8) * 16 + (y & 7) * 2 + (x & 7) / 4;
}

static u32 TypeIcons_GetPixel(const PaperWhite2TypeIcon *icon, u32 x, u32 y) {
    return (icon->chars[TypeIcons_CharOffset(x, y)] >> ((x & 3) * 4)) & 15;
}

// VRAM takes no byte writes, so each pixel is written as its halfword
static void TypeIcons_SetPixel(PaperWhite2TypeIcon *icon, u32 x, u32 y, u32 color) {
    u16 *dst = icon->chars + TypeIcons_CharOffset(x, y);
    u32 shift = (x & 3) * 4;

    *dst = (*dst & ~(15 << shift)) | (color << shift);
}

static u32 TypeIcons_Background(const PaperWhite2TypeIcon *icon, u32 x, u32 y) {
    u32 panel = (icon->layout >= BTL_STYLE_TRIPLE ? 2 : 0) + TypeIcons_IsEnemy(icon);

    return (PANEL_BACKGROUND[panel][y - BACKGROUND_TOP][x / 2] >> ((x & 1) * 4)) & 15;
}

// The header's 128 pixels are the two pieces side by side
static u32 TypeIcons_HeaderOffset(u32 x, u32 y) {
    return TypeIcons_CharOffset(x & 63, y + (x >= 64 ? 32 : 0));
}

static u32 TypeIcons_GetHeaderPixel(const PaperWhite2TypeIcon *icon, u32 x, u32 y) {
    return (icon->chars[TypeIcons_HeaderOffset(x, y)] >> ((x & 3) * 4)) & 15;
}

static void TypeIcons_SetHeaderPixel(PaperWhite2TypeIcon *icon, u32 x, u32 y, u32 color) {
    u16 *dst = icon->chars + TypeIcons_HeaderOffset(x, y);
    u32 shift = (x & 3) * 4;
    u16 value = (*dst & ~(15 << shift)) | (color << shift);

    if (value != *dst) {
        *dst = value;
    }
}

// Shifts the header's name by nameShift and its sex and level by infoShift to the right, or back with undo. A copy of
// each row keeps the two from overwriting each other
static void TypeIcons_MoveHeader(PaperWhite2TypeIcon *icon, u32 nameShift, u32 infoShift, BOOL undo) {
    u16 row[HEADER_WIDTH / 4];
    u32 start = TypeIcons_IsEnemy(icon) ? 16 : 8;
    u32 split = TypeIcons_IsEnemy(icon) ? 80 : 72;
    u32 x;
    u32 y;

    for (y = 0; y < HEADER_ROWS; y++) {
        for (x = 0; x < HEADER_WIDTH; x += 4) {
            row[x / 4] = icon->chars[TypeIcons_HeaderOffset(x, y)];
        }
        for (x = start; x < HEADER_WIDTH; x++) {
            u32 from = HEADER_WIDTH;

            if (undo) {
                if (x >= split) {
                    from = x + infoShift;
                } else if (x + nameShift < split + infoShift) {
                    from = x + nameShift;
                }
            } else {
                if (x >= split + infoShift) {
                    from = x - infoShift;
                } else if (x >= start + nameShift && x < split + nameShift) {
                    from = x - nameShift;
                }
            }
            TypeIcons_SetHeaderPixel(icon, x, y, from < HEADER_WIDTH ? (row[from / 4] >> ((from & 3) * 4)) & 15 : 0);
        }
    }
}

static void TypeIcons_UndoHeader(PaperWhite2TypeIcon *icon) {
    if ((TypeIcons_IsEnemy(icon) || TypeIcons_BesideName(icon)) && icon->headerMoved) {
        TypeIcons_MoveHeader(icon, icon->nameShift, icon->infoShift, TRUE);
        icon->headerMoved = FALSE;
        icon->nameShift = 0;
        icon->infoShift = 0;
    }
}

// An FNV-1a hash of the header as the game draws it, with the shadow's colors as reclaimed
static u32 TypeIcons_HeaderHash(const PaperWhite2TypeIcon *icon) {
    u32 hash = 2166136261;
    u32 x;
    u32 y;

    for (y = 0; y < HEADER_ROWS; y++) {
        for (x = TypeIcons_IsEnemy(icon) ? 16 : 8; x < HEADER_WIDTH; x++) {
            u32 color = TypeIcons_GetHeaderPixel(icon, x, y);

            if (color == ICON_COLOR_PRIMARY || color == ICON_COLOR_SECONDARY) {
                color = ICON_COLOR_OUTLINE;
            }
            hash = (hash ^ color) * 16777619;
        }
    }
    return hash;
}

// Shifts the header to leave room for the wedge: the player's name by 12 and its sex and level by 8, the enemy's so
// that its name starts at screen x 23 or later. Fails if the header isn't as the game draws it
static BOOL TypeIcons_PrepareHeader(PaperWhite2TypeIcon *icon) {
    BOOL player = TypeIcons_BesideName(icon);
    u32 start;
    u32 split;
    u32 first;
    u32 last;
    u32 infoFirst;
    u32 infoLast;
    u32 anchor;
    u32 minimum;
    u32 nameShift;
    u32 infoShift;
    u32 clearEnd;
    u32 x;
    u32 y;

    if ((!TypeIcons_IsEnemy(icon) && !player) || icon->headerMoved) {
        return TRUE;
    }
    start = player ? 8 : 16;
    split = player ? 72 : 80;
    first = split;
    last = start;
    infoFirst = HEADER_WIDTH;
    infoLast = split;
    for (y = 0; y < HEADER_ROWS; y++) {
        for (x = start; x < HEADER_WIDTH; x++) {
            if (!TypeIcons_GetHeaderPixel(icon, x, y)) {
                continue;
            }
            if (x < split) {
                if (x < first) {
                    first = x;
                }
                if (x > last) {
                    last = x;
                }
            } else {
                if (x < infoFirst) {
                    infoFirst = x;
                }
                if (x > infoLast) {
                    infoLast = x;
                }
            }
        }
    }
    if (first == split) {
        first = last = player ? 16 : 24;
    }
    // The boxes' resting screen x: 60 in single battles, 64 and 60 in double battles, 64, 60 and 56 in triple ones
    anchor = icon->pos == 1 ? 60 : 70 - 2 * icon->pos;
    minimum = 87 - anchor;
    if (player) {
        nameShift = 12;
        infoShift = 8;
    } else {
        nameShift = first < minimum ? minimum - first : 0;
        infoShift = last + nameShift + 2 > infoFirst ? last + nameShift + 2 - infoFirst : 0;
    }
    if (nameShift > 15 || infoShift > 15 || infoLast + infoShift >= (player ? 120 : 128) ||
        (player ? last + nameShift + 2 > infoFirst + infoShift
                : first + nameShift < 22 || first + nameShift - 22 > 43)) {
        TypeIcons_Fail(ICON_FAILURE_BAD_LAYOUT);
        return FALSE;
    }
    // The enemy's x 8 to 15 is the caught mark's, which the shift starts after; the pixels before must be blank
    clearEnd = TypeIcons_IsEnemy(icon) ? 8 : start;
    for (y = 0; y < HEADER_ROWS; y++) {
        for (x = 0; x < clearEnd; x++) {
            if (TypeIcons_GetHeaderPixel(icon, x, y)) {
                TypeIcons_Fail(ICON_FAILURE_BAD_LAYOUT);
                return FALSE;
            }
        }
    }
    // The hash tells a reload of the header by the game from the shifted one
    icon->headerHash = TypeIcons_HeaderHash(icon) & 0xffffff;
    TypeIcons_MoveHeader(icon, nameShift, infoShift, FALSE);
    icon->headerMoved = TRUE;
    icon->nameShift = nameShift;
    icon->infoShift = infoShift;
    return TRUE;
}

static BOOL TypeIcons_IsInk(const PaperWhite2TypeIcon *icon, u32 x, u32 y) {
    return TypeIcons_Wedge(icon)->face[y] & (0x800 >> x);
}

// The bit of the backup of a wedge pixel: every row has seven
static u32 TypeIcons_BackupIndex(const PaperWhite2TypeIcon *icon, u32 x, u32 y) {
    u32 before = 0;
    u32 i;

    for (i = 0; i < x; i++) {
        if (TypeIcons_IsInk(icon, i, y)) {
            before++;
        }
    }
    return 7 * y + before;
}

// The native pixel under a wedge pixel, with its checker phase from the backup
static u32 TypeIcons_Restored(const PaperWhite2TypeIcon *icon, u32 x, u32 y) {
    u32 index = TypeIcons_BackupIndex(icon, x, y);
    u32 color = TypeIcons_Background(icon, TypeIcons_Left(icon) + x, ICON_TOP + y);

    if (!TypeIcons_IsInk(icon, x, y)) {
        return color;
    }
    if (color == FACE_COLOR_LIGHT || color == FACE_COLOR_DARK) {
        return (icon->backup[index / 8] >> (index & 7)) & 1 ? FACE_COLOR_DARK : FACE_COLOR_LIGHT;
    }
    return color;
}

// Saves the checker phase of the face under the wedge. Fails if the face isn't the game's
static BOOL TypeIcons_Snapshot(PaperWhite2TypeIcon *icon) {
    u32 left = TypeIcons_Left(icon);
    u32 x;
    u32 y;
    u32 i;

    for (i = 0; i < sizeof(icon->backup); i++) {
        icon->backup[i] = 0;
    }
    for (y = 0; y < TypeIcons_Height(icon); y++) {
        for (x = 0; x < ICON_WIDTH; x++) {
            u32 color;
            u32 want;
            u32 dark = 0;
            u32 index;

            if (!TypeIcons_IsInk(icon, x, y)) {
                continue;
            }
            color = TypeIcons_GetPixel(icon, left + x, ICON_TOP + y);
            want = TypeIcons_Background(icon, left + x, ICON_TOP + y);
            if (want == FACE_COLOR_LIGHT || want == FACE_COLOR_DARK) {
                if (color != FACE_COLOR_LIGHT && color != FACE_COLOR_DARK) {
                    TypeIcons_Fail(ICON_FAILURE_BAD_LAYOUT);
                    return FALSE;
                }
                dark = color == FACE_COLOR_DARK;
            } else if (color != want) {
                TypeIcons_Fail(ICON_FAILURE_BAD_LAYOUT);
                return FALSE;
            }
            index = TypeIcons_BackupIndex(icon, x, y);
            icon->backup[index / 8] |= dark << (index & 7);
        }
    }
    return TRUE;
}

// The color of a wedge pixel. A monotype's edge takes the second entry for its shade; a dual type's edges, whose two
// entries hold the two fills, alternate the fill with the outline's black
static u32 TypeIcons_Expected(const PaperWhite2TypeIcon *icon, u32 x, u32 y) {
    const TypeIconWedge *wedge = TypeIcons_Wedge(icon);
    u32 mask = 0x800 >> x;

    if (TypeIcons_IsMonotype(icon) && (wedge->mono[y] & mask)) {
        return ICON_COLOR_PRIMARY;
    }
    if (TypeIcons_IsMonotype(icon) && (wedge->monoShade[y] & mask)) {
        return ICON_COLOR_SECONDARY;
    }
    if (wedge->primary[y] & mask) {
        return ICON_COLOR_PRIMARY;
    }
    if (wedge->secondary[y] & mask) {
        return ICON_COLOR_SECONDARY;
    }
    if (wedge->primaryShade[y] & mask) {
        return (x + y) & 1 ? ICON_COLOR_PRIMARY : ICON_COLOR_OUTLINE;
    }
    if (wedge->secondaryShade[y] & mask) {
        return (x + y) & 1 ? ICON_COLOR_SECONDARY : ICON_COLOR_OUTLINE;
    }
    return ICON_COLOR_OUTLINE;
}

// Takes the wedge off, leaving the pixels that the game drew over it since
static void TypeIcons_Restore(PaperWhite2TypeIcon *icon) {
    u32 left = TypeIcons_Left(icon);
    u32 x;
    u32 y;

    if (!icon->valid || !icon->painted) {
        return;
    }
    for (y = 0; y < TypeIcons_Height(icon); y++) {
        for (x = 0; x < ICON_WIDTH; x++) {
            if (!TypeIcons_IsInk(icon, x, y)) {
                continue;
            }
            if (TypeIcons_GetPixel(icon, left + x, ICON_TOP + y) == TypeIcons_Expected(icon, x, y)) {
                TypeIcons_SetPixel(icon, left + x, ICON_TOP + y, TypeIcons_Restored(icon, x, y));
            }
        }
    }
    icon->painted = FALSE;
}

// An FNV-1a hash of the box's characters, which tells when the game redrew them
static u32 TypeIcons_CharsHash(const PaperWhite2TypeIcon *icon) {
    u32 hash = 2166136261;
    u32 i;

    for (i = 0; i < TypeIcons_CharWords(icon); i++) {
        hash = (hash ^ icon->chars[i]) * 16777619;
    }
    return hash;
}

// Moves the native shadow's pixels to the outline's color, freeing its two palette entries
static void TypeIcons_Reclaim(PaperWhite2TypeIcon *icon) {
    u32 i;
    u32 shift;

    for (i = 0; i < TypeIcons_CharWords(icon); i++) {
        u16 old = icon->chars[i];
        u16 value = old;

        for (shift = 0; shift < 16; shift += 4) {
            u32 color = (old >> shift) & 15;

            if (color == ICON_COLOR_PRIMARY || color == ICON_COLOR_SECONDARY) {
                value = (value & ~(15 << shift)) | (ICON_COLOR_OUTLINE << shift);
            }
        }
        if (value != old) {
            icon->chars[i] = value;
        }
    }
}

static u16 TypeIcons_SlashShadow(u16 value) {
    u32 shift;

    for (shift = 0; shift < 16; shift += 4) {
        if (((value >> shift) & 15) == ICON_COLOR_PRIMARY) {
            value = (value & ~(15 << shift)) | (ICON_COLOR_OUTLINE << shift);
        }
    }
    return value;
}

// The player's HP numbers are characters of their own, with the box's palette: their slash's shadow moves from 4 to
// 2 too. Checks the slash's shape first
static BOOL TypeIcons_ProtectHpNumbers(PaperWhite2TypeIcon *icon) {
    ClActor *actor;
    NNSG2dImageProxy proxy;
    u32 base;
    u16 *slash;
    u32 i;

    if (TypeIcons_IsEnemy(icon)) {
        return TRUE;
    }
    actor = TypeIcons_Entry(icon)->hpNumActor;
    if (actor == NULL) {
        TypeIcons_Fail(ICON_FAILURE_BAD_POINTER);
        return FALSE;
    }
    ClActor_GetImageProxy(actor, &proxy);
    base = proxy.vramLocation.baseAddrOfVram[NNS_G2D_VRAM_TYPE_2DMAIN];
    if ((base & 31) || base > OBJ_VRAM_SIZE - 256) {
        TypeIcons_Fail(ICON_FAILURE_BAD_GRAPHICS);
        return FALSE;
    }
    slash = (u16 *)(HW_OBJ_VRAM + base + HP_NUMBERS_SLASH_CHAR * 32);
    for (i = 0; i < 16; i++) {
        if (TypeIcons_SlashShadow(slash[i]) != HP_NUMBERS_SLASH[i]) {
            TypeIcons_Fail(ICON_FAILURE_BAD_LAYOUT);
            return FALSE;
        }
    }
    for (i = 0; i < 16; i++) {
        if (slash[i] != HP_NUMBERS_SLASH[i]) {
            slash[i] = HP_NUMBERS_SLASH[i];
        }
    }
    return TRUE;
}

// The main OBJ palettes' fade buffer
static PaletteBuffer *TypeIcons_Fade(void) {
    PaletteFade *fade = BtlvEffect_GetPaletteFade();
    PaletteBuffer *buffer;

    if (fade == NULL) {
        return NULL;
    }
    buffer = &fade->buffers[PALFADE_BUFFER_MAIN_OBJ];
    if (buffer->unfaded == NULL || buffer->faded == NULL || buffer->size < 0x200) {
        return NULL;
    }
    return buffer;
}

static u16 TypeIcons_Blend(u16 color, u16 target, int fraction) {
    u32 out = 0;
    u32 shift;

    for (shift = 0; shift < 15; shift += 5) {
        int from = (color >> shift) & 31;
        int to = (target >> shift) & 31;

        out |= (u32)(from + (((to - from) * fraction) >> 4)) << shift;
    }
    return out;
}

// The fade's fraction that the palette shows now, from colors that nothing recolors, since the fade's own step is
// the next frame's; -1 for an effect that isn't a fade toward one color
static int TypeIcons_CurrentFade(const PaletteBuffer *buffer, u32 bank) {
    static const u8 probes[FADE_PROBE_COLORS] = { 1, 2, 3, 13 };
    const u16 *unfaded = buffer->unfaded + bank * 16;
    const u16 *faded = buffer->faded + bank * 16;
    int fraction;
    u32 i;

    for (fraction = 0; fraction <= 16; fraction++) {
        for (i = 0; i < FADE_PROBE_COLORS; i++) {
            if (TypeIcons_Blend(unfaded[probes[i]], buffer->fade.color, fraction) != faded[probes[i]]) {
                break;
            }
        }
        if (i == FADE_PROBE_COLORS) {
            return fraction;
        }
    }
    return -1;
}

// Sets the box's palette entries 4 and 15 to the types' colors, or back with undo, in the fade's buffers and in the
// palette memory, at the fade's current fraction
static BOOL TypeIcons_SetPalette(PaperWhite2TypeIcon *icon, BOOL undo) {
    static const u8 entries[2] = { ICON_COLOR_PRIMARY, ICON_COLOR_SECONDARY };
    PaletteBuffer *buffer = TypeIcons_Fade();
    int fraction;
    u32 i;

    if (buffer == NULL) {
        TypeIcons_Fail(ICON_FAILURE_BAD_PALETTE);
        return FALSE;
    }
    fraction = TypeIcons_CurrentFade(buffer, icon->bank);
    if (fraction < 0) {
        return FALSE;
    }
    for (i = 0; i < 2; i++) {
        u32 at = icon->bank * 16 + entries[i];
        u32 type = i & 1 ? PokeTypePair_GetType2(icon->types) : PokeTypePair_GetType1(icon->types);
        u16 color;
        u16 shown;

        if (undo) {
            color = icon->original[i];
        } else if (i != 0 && TypeIcons_IsMonotype(icon)) {
            color = TYPE_SHADES[type];
        } else {
            color = TYPE_COLORS[type];
        }
        buffer->unfaded[at] = color;
        shown = TypeIcons_Blend(color, buffer->fade.color, fraction);
        buffer->faded[at] = shown;
        ((u16 *)HW_OBJ_PLTT)[at] = shown;
    }
    return TRUE;
}

static BOOL TypeIcons_CellMatches(ClActor *actor, u16 count, const NNSG2dCellOAMAttrData *oams) {
    const NNSG2dCellData *cell = actor->anim.cellAnim.pCurrentCell;
    u32 i;

    if (cell == NULL || cell->numOAMAttrs != count || cell->cellAttr != (count == 2 ? 17 : 21) ||
        cell->pOamAttrArray == NULL) {
        return FALSE;
    }
    for (i = 0; i < count; i++) {
        if (cell->pOamAttrArray[i].attr0 != oams[i].attr0 || cell->pOamAttrArray[i].attr1 != oams[i].attr1 ||
            cell->pOamAttrArray[i].attr2 != oams[i].attr2) {
            return FALSE;
        }
    }
    return TRUE;
}

static BOOL TypeIcons_IsEnemyPanel(ClActor *actor, u32 layout) {
    return TypeIcons_CellMatches(actor, layout < BTL_STYLE_TRIPLE ? 2 : 3, ENEMY_PANEL_OAMS);
}

// The player's box in single and double battles, with the panel expansion's third piece
static BOOL TypeIcons_IsExpandedPanel(ClActor *actor) {
    return TypeIcons_CellMatches(actor, 3, PLAYER_PANEL_OAMS);
}

// Whether the box is still the one attached: the same characters, at the same place, with the same cell
static BOOL TypeIcons_IsSameBox(PaperWhite2TypeIcon *icon) {
    BtlvGaugeEntry *entry = TypeIcons_Entry(icon);
    ClActor *actor = entry->nameActor;
    NNSG2dImageProxy proxy;

    if (entry->nameChars != icon->charsId || actor == NULL) {
        return FALSE;
    }
    ClActor_GetImageProxy(actor, &proxy);
    if (icon->chars != (u16 *)(HW_OBJ_VRAM + proxy.vramLocation.baseAddrOfVram[NNS_G2D_VRAM_TYPE_2DMAIN])) {
        return FALSE;
    }
    if (TypeIcons_IsEnemy(icon)) {
        return TypeIcons_IsEnemyPanel(actor, icon->layout);
    }
    return icon->layout >= BTL_STYLE_TRIPLE || TypeIcons_IsExpandedPanel(actor);
}

static void TypeIcons_Forget(PaperWhite2TypeIcon *icon) {
    // Only a box that is still attached is touched: every teardown reaches here before the game frees it
    if (icon->gauge != NULL && icon->valid && TypeIcons_IsSameBox(icon)) {
        TypeIcons_Restore(icon);
        TypeIcons_UndoHeader(icon);
        TypeIcons_SetPalette(icon, TRUE);
    }
    icon->gauge = NULL;
    icon->valid = FALSE;
    icon->painted = FALSE;
}

// The mon's types as shown: an Illusion disguise's own, or the mon's current ones, which type changes and Roost change
static BOOL TypeIcons_GetTypes(PaperWhite2TypeIcon *icon, PokeTypePair *pair) {
    PartyPkm *view = BattleMon_GetViewSrcData(icon->mon);

    if (view != NULL && view != icon->mon->core.src) {
        if (view != icon->disguise) {
            u32 type1 = PokeParty_GetParam(view, PKM_PARAM_TYPE1, NULL);
            u32 type2 = PokeParty_GetParam(view, PKM_PARAM_TYPE2, NULL);

            if (type1 >= ICON_TYPE_COUNT || type2 >= ICON_TYPE_COUNT) {
                TypeIcons_Fail(ICON_FAILURE_BAD_TYPES);
                return FALSE;
            }
            icon->disguiseTypes = PokeTypePair_Make(type1, type2);
            icon->disguise = view;
        }
        *pair = icon->disguiseTypes;
    } else {
        icon->disguise = NULL;
        *pair = GetPokeType(icon->mon);
    }
    if (PokeTypePair_GetType1(*pair) >= ICON_TYPE_COUNT || PokeTypePair_GetType2(*pair) >= ICON_TYPE_COUNT) {
        TypeIcons_Fail(ICON_FAILURE_BAD_TYPES);
        return FALSE;
    }
    return TRUE;
}

// Whether the box is as the game drew it where the wedge goes: the expansion's tiles blank, and the face's pixels the
// game's, unless the status icon covers them
static BOOL TypeIcons_CheckBackground(const PaperWhite2TypeIcon *icon) {
    u32 left = TypeIcons_Left(icon);
    u32 x;
    u32 y;
    u32 i;

    if (TypeIcons_BesideName(icon)) {
        for (i = CHAR_WORDS; i < CHAR_WORDS_EXPANDED; i++) {
            if (icon->chars[i] != 0) {
                return FALSE;
            }
        }
    }
    if (icon->status) {
        return TRUE;
    }
    for (y = 0; y < TypeIcons_Height(icon); y++) {
        for (x = 0; x < ICON_WIDTH; x++) {
            u32 color;

            if (!TypeIcons_IsInk(icon, x, y)) {
                continue;
            }
            color = TypeIcons_GetPixel(icon, left + x, ICON_TOP + y);
            if (color == ICON_COLOR_PRIMARY || color == ICON_COLOR_SECONDARY) {
                color = ICON_COLOR_OUTLINE;
            }
            if (color != TypeIcons_Background(icon, left + x, ICON_TOP + y)) {
                return FALSE;
            }
        }
    }
    return TRUE;
}

// Whether a palette's entries 4 and 15 hold the wedge's colors for these types
static BOOL TypeIcons_UsesWedgeColors(PokeTypePair types, const u16 *palette) {
    return palette[ICON_COLOR_PRIMARY] == TYPE_COLORS[PokeTypePair_GetType1(types)] &&
           palette[ICON_COLOR_SECONDARY] == (PokeTypePair_IsMonotype(types)
                                                 ? TYPE_SHADES[PokeTypePair_GetType2(types)]
                                                 : TYPE_COLORS[PokeTypePair_GetType2(types)]);
}

// Attaches the record to its box's characters and palette, and frees the shadow's palette entries
static BOOL TypeIcons_Attach(PaperWhite2TypeIcon *icon) {
    BtlvGaugeEntry *entry = TypeIcons_Entry(icon);
    ClActor *actor = entry->nameActor;
    NNSG2dImageProxy proxy;
    u32 base;
    u32 address;
    u32 previousBank;
    PaletteBuffer *buffer;
    BOOL ours;
    int i;

    icon->charsId = entry->nameChars;
    if (actor == NULL) {
        TypeIcons_Fail(ICON_FAILURE_BAD_POINTER);
        return FALSE;
    }
    if (TypeIcons_IsEnemy(icon) && !TypeIcons_IsEnemyPanel(actor, icon->layout)) {
        TypeIcons_Fail(ICON_FAILURE_BAD_LAYOUT);
        return FALSE;
    }
    if (!TypeIcons_IsEnemy(icon) && icon->layout < BTL_STYLE_TRIPLE && !TypeIcons_IsExpandedPanel(actor)) {
        TypeIcons_Fail(ICON_FAILURE_BAD_LAYOUT);
        return FALSE;
    }
    ClActor_GetImageProxy(actor, &proxy);
    base = proxy.vramLocation.baseAddrOfVram[NNS_G2D_VRAM_TYPE_2DMAIN];
    if (GX_GetOBJVRamModeChar() != GX_OBJVRAMMODE_CHAR_1D_64K ||
        (reg_GX_VRAMCNT_E & VRAMCNT_E_MASK) != VRAMCNT_E_MAIN_OBJ || (base & 31) ||
        base > OBJ_VRAM_SIZE - TypeIcons_CharWords(icon) * 2) {
        TypeIcons_Fail(ICON_FAILURE_BAD_GRAPHICS);
        return FALSE;
    }
    icon->chars = (u16 *)(HW_OBJ_VRAM + base);
    if (!TypeIcons_CheckBackground(icon)) {
        TypeIcons_Fail(ICON_FAILURE_BAD_LAYOUT);
        return FALSE;
    }
    address = ClActSys_GetPlttVramAddr(icon->gauge->palettes[icon->pos < 2 ? icon->pos : icon->pos - 2], FALSE);
    if (address >= 0x200 || (address & 31)) {
        TypeIcons_Fail(ICON_FAILURE_BAD_PALETTE);
        return FALSE;
    }
    previousBank = icon->bank;
    icon->bank = address / 32;
    for (i = 0; i < ICON_RECORD_COUNT; i++) {
        PaperWhite2TypeIcon *other = &sTypeIcons.icons[i];

        if (other != icon && other->valid && (other->bank == icon->bank || other->chars == icon->chars)) {
            TypeIcons_Fail(ICON_FAILURE_SHARED_PALETTE);
            return FALSE;
        }
    }
    buffer = TypeIcons_Fade();
    if (buffer == NULL) {
        TypeIcons_Fail(ICON_FAILURE_BAD_PALETTE);
        return FALSE;
    }
    // Characters that moved may keep their palette, whose entries hold the wedge's colors then, not the ones to restore
    ours = previousBank == icon->bank && PokeTypePair_GetType1(icon->types) < ICON_TYPE_COUNT &&
           PokeTypePair_GetType2(icon->types) < ICON_TYPE_COUNT &&
           TypeIcons_UsesWedgeColors(icon->types, buffer->unfaded + icon->bank * 16);
    if (!ours) {
        icon->original[0] = buffer->unfaded[icon->bank * 16 + ICON_COLOR_PRIMARY];
        icon->original[1] = buffer->unfaded[icon->bank * 16 + ICON_COLOR_SECONDARY];
    }
    if (!TypeIcons_ProtectHpNumbers(icon)) {
        return FALSE;
    }
    TypeIcons_Reclaim(icon);
    icon->valid = TRUE;
    icon->hash = 0;
    icon->headerMoved = FALSE;
    icon->nameShift = 0;
    icon->infoShift = 0;
    return TRUE;
}

// Paints the wedge again if the types, the box's characters, the status or the palette changed
static void TypeIcons_Refresh(PaperWhite2TypeIcon *icon) {
    BtlvGaugeEntry *entry;
    PaletteBuffer *buffer;
    PokeTypePair pair;
    BOOL paletteDirty;
    u32 hash;
    u32 left;
    u32 x;
    u32 y;

    if (icon->gauge == NULL) {
        return;
    }
    entry = TypeIcons_Entry(icon);
    if (!entry->mon.shown || icon->mon->core.monId != icon->monId) {
        TypeIcons_Forget(icon);
        return;
    }
    if (icon->valid && !TypeIcons_IsSameBox(icon)) {
        icon->valid = FALSE;
        icon->painted = FALSE;
        icon->disguise = NULL;
    }
    if (!icon->valid && !TypeIcons_Attach(icon)) {
        icon->gauge = NULL;
        return;
    }
    // The HP numbers' characters can be loaded again on their own, which the box's hash doesn't see
    if (!TypeIcons_ProtectHpNumbers(icon)) {
        TypeIcons_Forget(icon);
        return;
    }
    if (!TypeIcons_GetTypes(icon, &pair)) {
        TypeIcons_Restore(icon);
        return;
    }
    buffer = TypeIcons_Fade();
    if (buffer == NULL) {
        TypeIcons_Restore(icon);
        return;
    }
    paletteDirty = !TypeIcons_UsesWedgeColors(pair, buffer->unfaded + icon->bank * 16);
    hash = TypeIcons_CharsHash(icon);
    if (pair == icon->types && hash == icon->hash && icon->painted == !icon->status &&
        (icon->status || !paletteDirty)) {
        return;
    }
    // The game drew the header again unshifted: only the wedge's pixels that it left are restored
    if ((TypeIcons_IsEnemy(icon) || TypeIcons_BesideName(icon)) && icon->headerMoved &&
        (TypeIcons_HeaderHash(icon) & 0xffffff) == icon->headerHash) {
        TypeIcons_Restore(icon);
        icon->painted = FALSE;
        icon->headerMoved = FALSE;
        icon->nameShift = 0;
        icon->infoShift = 0;
    }
    TypeIcons_Restore(icon);
    TypeIcons_Reclaim(icon);
    icon->types = pair;
    if (!TypeIcons_PrepareHeader(icon)) {
        TypeIcons_Forget(icon);
        return;
    }
    if (!icon->status && !TypeIcons_Snapshot(icon)) {
        TypeIcons_SetPalette(icon, TRUE);
        icon->gauge = NULL;
        icon->valid = FALSE;
        return;
    }
    if (!icon->status && TypeIcons_SetPalette(icon, FALSE)) {
        left = TypeIcons_Left(icon);
        icon->painted = TRUE;
        for (y = 0; y < TypeIcons_Height(icon); y++) {
            for (x = 0; x < ICON_WIDTH; x++) {
                u32 color;

                if (!TypeIcons_IsInk(icon, x, y)) {
                    continue;
                }
                color = TypeIcons_Expected(icon, x, y);
                if (color != TypeIcons_GetPixel(icon, left + x, ICON_TOP + y)) {
                    TypeIcons_SetPixel(icon, left + x, ICON_TOP + y, color);
                }
            }
        }
    }
    icon->hash = TypeIcons_CharsHash(icon);
    sTypeIcons.redraws++;
}

static void TypeIcons_Clear(BtlvGauge *gauge, u32 pos) {
    PaperWhite2TypeIcon *icon = TypeIcons_Find(pos);

    if (icon != NULL && icon->gauge == gauge && icon->pos == pos) {
        TypeIcons_Forget(icon);
    }
}

void PaperWhite2_TypeIconsSetBattleMon(BtlvGauge *gauge, BtlMainModule *mainModule, BattleMon *mon, u32 type,
                                       int index) {
    PaperWhite2TypeIcon *icon = TypeIcons_Find(index);

    if (icon != NULL && icon->gauge != NULL) {
        TypeIcons_Forget(icon);
    }
    BtlvGauge_SetBattleMon(gauge, mainModule, mon, type, index);
    if (icon == NULL || type > BTL_STYLE_TRIPLE) {
        return;
    }
    // The Pokéstar Studios' gauges keep only the statuses
    if (gauge->mode == 2) {
        return;
    }
    icon->gauge = gauge;
    icon->mon = mon;
    icon->pos = index;
    icon->layout = type;
    icon->monId = mon->core.monId;
    icon->disguise = NULL;
    icon->types = 0xffff;
    icon->valid = FALSE;
    icon->painted = FALSE;
    icon->status = gauge->entries[index].mon.unk2e;
    sTypeIcons.bindings++;
    TypeIcons_Refresh(icon);
}

void PaperWhite2_TypeIconsSetPartyPkm(BtlvGauge *gauge, PokeDexSave *pokedex, PartyPkm *pkm, u32 type, int index) {
    TypeIcons_Clear(gauge, index);
    BtlvGauge_SetPartyPkm(gauge, pokedex, pkm, type, index);
}

void PaperWhite2_TypeIconsUpdate(BtlvGauge *gauge) {
    int i;

    BtlvGauge_Update(gauge);
    for (i = 0; i < ICON_RECORD_COUNT; i++) {
        if (sTypeIcons.icons[i].gauge == gauge) {
            TypeIcons_Refresh(&sTypeIcons.icons[i]);
        }
    }
}

void PaperWhite2_TypeIconsHide(BtlvGauge *gauge, int index) {
    TypeIcons_Clear(gauge, index);
    BtlvGauge_Hide(gauge, index);
}

void PaperWhite2_TypeIconsRelease(BtlvGauge *gauge) {
    int i;

    for (i = 0; i < ICON_RECORD_COUNT; i++) {
        if (sTypeIcons.icons[i].gauge == gauge) {
            TypeIcons_Forget(&sTypeIcons.icons[i]);
        }
    }
}

void PaperWhite2_TypeIconsSetStatus(BtlvGauge *gauge, u32 status, int index) {
    PaperWhite2TypeIcon *icon = TypeIcons_Find(index);

    if (icon != NULL && icon->gauge == gauge && icon->pos == index && icon->valid && TypeIcons_IsSameBox(icon)) {
        TypeIcons_Restore(icon);
    }
    BtlvGauge_SetStatus(gauge, status, index);
    if (icon != NULL && icon->gauge == gauge && icon->pos == index) {
        icon->status = status;
        icon->hash = 0;
        TypeIcons_Refresh(icon);
    }
}

PaperWhite2TypeIcon *PaperWhite2_TypeIconsBeforeText(BtlvGauge *gauge, BtlvGaugeEntry *entry) {
    PaperWhite2TypeIcon *bound = NULL;
    int i;

    for (i = 0; i < ICON_RECORD_COUNT; i++) {
        if (sTypeIcons.icons[i].gauge == gauge && &gauge->entries[sTypeIcons.icons[i].pos] == entry) {
            bound = &sTypeIcons.icons[i];
            break;
        }
    }
    if (bound != NULL && bound->valid && TypeIcons_IsSameBox(bound)) {
        TypeIcons_Restore(bound);
        TypeIcons_UndoHeader(bound);
    }
    return bound;
}

void PaperWhite2_TypeIconsAfterText(PaperWhite2TypeIcon *icon) {
    if (icon != NULL) {
        icon->hash = 0;
        TypeIcons_Refresh(icon);
    }
}
