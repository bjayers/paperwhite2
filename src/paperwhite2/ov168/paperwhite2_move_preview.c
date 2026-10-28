// Paper White 2: Move Effectiveness Preview. A port of the PMC plugin MoveEffectivenessW2 0.4.1
// (bjayers/pokeweb-serverless, runtime/battle-type-hud/move_effectiveness.cpp, move_colors.h, move_immunity.h and
// move_layout.h), whose DLL is the one in the hack's ROM, with the colors that the hack's installer set.
//
// On the lower screen's move screen, a damaging move's name is drawn in one color if its type is super effective
// against the opponent, another if it is resisted and a third if the opponent is immune, and in white otherwise; a
// status move's stays white. Singles and rotation battles color the move screen against the opposing battler. In
// double and triple battles the move screen stays white, and the target screen shows the selected move's name above
// the target cards, colored against the selected opponent. It reads the current types (an Illusion disguise's while
// it lasts), abilities, items, conditions and field effects, but doesn't predict misses, Protect or redirection.
// Hidden Power takes the attacker's type and Normalize makes every move Normal; Struggle, Weather Ball, Natural Gift,
// Judgment and Techno Blast stay white, as do fixed-damage moves unless the opponent is immune. Abilities after
// Teravolt, which a hack would add, leave the move white. The colors take the text palette's unused entries 11 to 13.
//
// Differences from the plugin, which had to check that it was in the game it was built for: it reads the game's
// structs instead of offsets, calls the game's functions directly, and doesn't check that pointers are in main RAM
// (the DS and DSi bounds) or that the screen's bitmap has the size it always has.

#include "types.h"
#include "battle/btl_calc.h"
#include "battle/btl_field.h"
#include "battle/btl_main.h"
#include "battle/btl_pokeparam.h"
#include "battle/btlv_effect.h"
#include "battle/btlv_input.h"
#include "constants/abilities.h"
#include "constants/battle.h"
#include "constants/items.h"
#include "constants/moves.h"
#include "constants/pokemon.h"
#include "constants/types.h"
#include "gfl/bmp.h"
#include "gfl/bmpwin.h"
#include "nitro/hw.h"
#include "paperwhite2/battle_move_preview.h"
#include "pml/move.h"
#include "pml/poke_party.h"
#include "system/palanm.h"

// The lower screen's screens that the preview draws on
#define SCREEN_MOVES 2
#define SCREEN_TARGETS 3
#define SCREEN_ROTATION 5

// The message window's palette, BtlvInput_InitGraphics's, and its colors: the text's white, which the game draws the
// move names in, and the three entries that the font leaves unused, magenta, for the preview's colors
#define MOVE_TEXT_PALETTE 13
#define MOVE_COLOR_WHITE 1
#define MOVE_COLOR_SUPER_EFFECTIVE 11
#define MOVE_COLOR_RESISTED 12
#define MOVE_COLOR_IMMUNE 13
#define MOVE_COLOR_UNUSED 0x7c1f

// A move name's box on the move screen's bitmap, and where the target screen's carried name goes
#define MOVE_NAME_WIDTH 128
#define MOVE_NAME_HEIGHT 16
#define MOVE_NAME_TOP 10
#define MOVE_NAME_ROW_HEIGHT 48
#define MOVE_LABEL_LEFT 64
// The message window's bitmap is 32 tiles wide
#define MOVE_BITMAP_TILES_WIDE 32

// What the preview knows of each of the four moves: its type, and these flags
#define MOVE_ATTRIBUTE_TYPE_MASK 31
#define MOVE_ATTRIBUTE_SOUND (1 << 5)
#define MOVE_ATTRIBUTE_FIXED_DAMAGE (1 << 6)
#define MOVE_ATTRIBUTE_DAMAGING (1 << 7)

// getMoveFlag's bit of MOVE_FLAG_SOUND
#define MOVE_FLAG_BIT_SOUND 8

// The types the preview reads matchups for: the game's 17 and 17 itself, a Fairy type in hacks that add one
#define MOVE_PREVIEW_TYPE_COUNT 18

// A move's matchup: the effectiveness's steps from neutral, -2 to 2, or these
#define AFFINITY_IMMUNE (-8)
#define AFFINITY_UNKNOWN 8

// Why the preview stopped, kept for a look in a memory viewer: nothing reads it
enum {
    MOVE_FAILURE_NONE,
    MOVE_FAILURE_BITMAP = 7,
    MOVE_FAILURE_PALETTE_IN_USE,
};

typedef struct {
    BtlvInput *input;   // the lower screen the state is for
    PartyPkm *disguise; // the Illusion disguise whose types are in disguiseTypes
    PokeTypePair disguiseTypes;
    u16 selectedMove; // the move whose name the target screen carries
    u8 attributes[4]; // MOVE_ATTRIBUTE_*, by move slot
    u8 selectedSlot;  // the carried move's slot in bits 0 and 1, and in the rest the move screen's battle position
    u8 label;         // whether the target screen carries a name
    u8 paletteInstalled;
    u8 failure;
} MovePreviewState;

// The super effective, resisted and immune colors. The plugin's were 0x2b5e (yellow), 0x62b3 (grayish blue) and 0x211f
// (red); these are the ones that the hack's installer wrote into its DLL
static const u16 MOVE_PREVIEW_COLORS[3] = { 0x7ecc, 0x2f7e, 0x4210 };

// The moves whose damage doesn't depend on the type chart
static const u16 FIXED_DAMAGE_MOVES[] = {
    MOVE_GUILLOTINE,  MOVE_HORN_DRILL, MOVE_SONIC_BOOM,  MOVE_COUNTER,     MOVE_SEISMIC_TOSS,
    MOVE_DRAGON_RAGE, MOVE_FISSURE,    MOVE_NIGHT_SHADE, MOVE_PSYWAVE,     MOVE_SUPER_FANG,
    MOVE_MIRROR_COAT, MOVE_ENDEAVOR,   MOVE_SHEER_COLD,  MOVE_METAL_BURST,
};

static MovePreviewState sMovePreview;

static void MovePreview_Fail(u8 why) {
    if (sMovePreview.failure == MOVE_FAILURE_NONE) {
        sMovePreview.failure = why;
    }
}

static GFLBitmap *MovePreview_Bitmap(BtlvInput *work) {
    if (work->msgWin == NULL) {
        MovePreview_Fail(MOVE_FAILURE_BITMAP);
        return NULL;
    }
    return work->msgBitmap;
}

// The byte of a pixel of the 4bpp bitmap
static u32 MovePreview_PixelOffset(u32 x, u32 y) {
    return ((y / 8) * MOVE_BITMAP_TILES_WIDE + x / 8) * 32 + (y & 7) * 4 + (x & 7) / 2;
}

static u32 MovePreview_GetPixel(const GFLBitmap *bitmap, u32 x, u32 y) {
    return (bitmap->pixels[MovePreview_PixelOffset(x, y)] >> ((x & 1) * 4)) & 15;
}

// The bitmap is in main RAM, which BmpWin_FlushChar copies to VRAM
static void MovePreview_SetPixel(GFLBitmap *bitmap, u32 x, u32 y, u32 color) {
    u8 *pixel = &bitmap->pixels[MovePreview_PixelOffset(x, y)];
    u32 shift = (x & 1) * 4;

    *pixel = (*pixel & ~(15 << shift)) | (color << shift);
}

// The sub BG palettes' fade buffer
static PaletteBuffer *MovePreview_Fade(BtlvInput *work) {
    PaletteBuffer *buffer;

    if (work->paletteFade == NULL) {
        return NULL;
    }
    buffer = &work->paletteFade->buffers[PALFADE_BUFFER_SUB_BG];
    if (buffer->unfaded == NULL || buffer->faded == NULL ||
        buffer->size < (MOVE_TEXT_PALETTE * 16 + MOVE_COLOR_IMMUNE + 1) * 2) {
        return NULL;
    }
    return buffer;
}

static u16 MovePreview_Blend(u16 color, u16 target, int fraction) {
    u32 out = 0;
    u32 shift;

    for (shift = 0; shift < 15; shift += 5) {
        int from = (color >> shift) & 31;
        int to = (target >> shift) & 31;

        out |= (u32)(from + (((to - from) * fraction) >> 4)) << shift;
    }
    return out;
}

// The fade's fraction that the palette shows now, from colors that the preview never changes, since the fade's own
// step is the next frame's; -1 for an effect that isn't a fade toward one color
static int MovePreview_CurrentFade(const PaletteBuffer *buffer, u32 bank) {
    static const u8 probes[4] = { 1, 2, 3, 13 };
    const u16 *unfaded = buffer->unfaded + bank * 16;
    const u16 *faded = buffer->faded + bank * 16;
    int fraction;
    u32 i;

    for (fraction = 0; fraction <= 16; fraction++) {
        for (i = 0; i < 4; i++) {
            if (MovePreview_Blend(unfaded[probes[i]], buffer->fade.color, fraction) != faded[probes[i]]) {
                break;
            }
        }
        if (i == 4) {
            return fraction;
        }
    }
    return -1;
}

// Sets the text palette's entries 11 to 13 to the preview's colors, or back to the unused magenta with undo, in the
// fade's buffers and in the palette memory, at the fade's current fraction
static BOOL MovePreview_SetPalette(BtlvInput *work, BOOL undo) {
    PaletteBuffer *buffer = MovePreview_Fade(work);
    int fraction;
    u32 i;

    if (buffer == NULL) {
        return FALSE;
    }
    fraction = MovePreview_CurrentFade(buffer, MOVE_TEXT_PALETTE);
    if (fraction < 0) {
        return FALSE;
    }
    for (i = 0; i < 3; i++) {
        u32 at = MOVE_TEXT_PALETTE * 16 + MOVE_COLOR_SUPER_EFFECTIVE + i;
        u16 color = undo ? MOVE_COLOR_UNUSED : MOVE_PREVIEW_COLORS[i];
        u16 shown = MovePreview_Blend(color, buffer->fade.color, fraction);

        buffer->unfaded[at] = color;
        buffer->faded[at] = shown;
        ((u16 *)HW_DB_BG_PLTT)[at] = shown;
    }
    sMovePreview.paletteInstalled = !undo;
    return TRUE;
}

// Whether the preview can draw on this lower screen: a new one resets its state, and the palette entries it takes
// must be unused
static BOOL MovePreview_Bind(BtlvInput *work) {
    PaletteBuffer *buffer;
    const u16 *colors;

    if (MovePreview_Bitmap(work) == NULL) {
        return FALSE;
    }
    if (sMovePreview.input != work) {
        sMovePreview.input = work;
        sMovePreview.disguise = NULL;
        sMovePreview.label = FALSE;
        sMovePreview.paletteInstalled = FALSE;
    }
    if (!sMovePreview.paletteInstalled) {
        buffer = MovePreview_Fade(work);
        if (buffer == NULL) {
            return FALSE;
        }
        colors = buffer->unfaded + MOVE_TEXT_PALETTE * 16;
        if (colors[MOVE_COLOR_SUPER_EFFECTIVE] != MOVE_COLOR_UNUSED ||
            colors[MOVE_COLOR_RESISTED] != MOVE_COLOR_UNUSED || colors[MOVE_COLOR_IMMUNE] != MOVE_COLOR_UNUSED) {
            MovePreview_Fail(MOVE_FAILURE_PALETTE_IN_USE);
            return FALSE;
        }
    }
    return TRUE;
}

// The battler at a view position, or NULL
static BattleMon *MovePreview_Battler(u32 viewPos) {
    BtlMainModule *mainModule = BtlvEffect_GetMainModule();
    u8 pos = ViewPosToBattlePos(mainModule, viewPos);

    if (pos >= BTL_POS_MAX) {
        return NULL;
    }
    // The battle view's Pokémon container, BtlvCore's, which btl_main.c always creates it with
    return PokeCon_GetPosMonInner(&mainModule->pokeCons[0], pos);
}

// The target's types as the player sees them: an Illusion disguise's own, or its current ones
static BOOL MovePreview_GetTypes(BattleMon *target, PokeTypePair *pair) {
    PartyPkm *view;

    if (target == NULL) {
        return FALSE;
    }
    view = BattleMon_GetViewSrcData(target);
    if (view != NULL && view != target->core.src) {
        if (sMovePreview.disguise != view) {
            u32 type1 = PokeParty_GetParam(view, PKM_PARAM_TYPE1, NULL);
            u32 type2 = PokeParty_GetParam(view, PKM_PARAM_TYPE2, NULL);

            if (type1 >= MOVE_PREVIEW_TYPE_COUNT || type2 >= MOVE_PREVIEW_TYPE_COUNT) {
                return FALSE;
            }
            sMovePreview.disguiseTypes = PokeTypePair_Make(type1, type2);
            sMovePreview.disguise = view;
        }
        *pair = sMovePreview.disguiseTypes;
    } else {
        sMovePreview.disguise = NULL;
        *pair = GetPokeType(target);
    }
    return PokeTypePair_GetType1(*pair) < MOVE_PREVIEW_TYPE_COUNT &&
           PokeTypePair_GetType2(*pair) < MOVE_PREVIEW_TYPE_COUNT;
}

static BOOL MovePreview_IsFixedDamage(u32 move) {
    u32 i;

    for (i = 0; i < NELEMS(FIXED_DAMAGE_MOVES); i++) {
        if (move == FIXED_DAMAGE_MOVES[i]) {
            return TRUE;
        }
    }
    return FALSE;
}

static u32 MovePreview_Ability(BattleMon *mon) {
    return mon != NULL ? GetBattleMonStat(mon, BATTLEMON_EFFECTIVE_ABILITY) : 0;
}

// The battler whose moves the move screen shows: the rotation's current front one, or the one at the move screen's
// position
static BattleMon *MovePreview_Attacker(BtlvInput *work) {
    if (work->rule == BTL_STYLE_ROTATION) {
        u32 slot = work->pokeSlot;

        return slot < 3 ? work->mons[slot] : NULL;
    }
    return MovePreview_Battler(sMovePreview.selectedSlot >> 2);
}

// A move type's matchup against one of the defender's types: Foresight, Odor Sleuth and Miracle Eye (the condition's
// type and its flag), Scrappy against Ghost, and a grounded Flying type against Ground make an immunity neutral
static int MovePreview_TypeAffinity(u32 type, u32 defenseType, BattleConditionCont reveal, BOOL scrappy,
                                    BOOL flatGround) {
    s32 effectiveness = BtlCalc_GetTypePairEffectiveness(type, PokeTypePair_MakeMonotype(defenseType));
    BOOL revealed = reveal.common.type != 0 && Condition_GetParam(reveal) == defenseType;
    BOOL master = revealed && GetConditionFlag(reveal);

    if (master || (effectiveness == TYPE_EFFECTIVENESS_IMMUNE &&
                   (revealed || (scrappy && defenseType == TYPE_GHOST) || flatGround))) {
        effectiveness = TYPE_EFFECTIVENESS_NORMAL;
    }
    return effectiveness == TYPE_EFFECTIVENESS_IMMUNE ? AFFINITY_IMMUNE : effectiveness - TYPE_EFFECTIVENESS_NORMAL;
}

// A damaging move's matchup against the target with its current abilities, items, conditions and field effects. Only
// reads the battle's state: no event handlers run
static int MovePreview_Affinity(BtlvInput *work, u32 move, u32 attributes, BattleMon *target, PokeTypePair pair) {
    BattleMon *attacker = MovePreview_Attacker(work);
    u32 attackAbility;
    u32 defenseAbility;
    BtlField *field;
    BOOL gravity;
    BOOL magicRoom;
    u32 item;
    BOOL itemActive;
    BOOL rooted;
    BOOL smackedDown;
    BOOL grounded;
    BOOL moldBreaker;
    u32 defense;
    u32 type;
    BattleConditionCont reveal;
    int first;
    int second;
    int affinity;

    if (attacker == NULL) {
        return AFFINITY_UNKNOWN;
    }
    attackAbility = MovePreview_Ability(attacker);
    defenseAbility = MovePreview_Ability(target);
    if (attackAbility > ABILITY_TERAVOLT || defenseAbility > ABILITY_TERAVOLT) {
        return AFFINITY_UNKNOWN;
    }
    field = GetBtlField(BtlvEffect_GetMainModule());
    gravity = CheckFieldEffect(field, FIELD_CONDITION_GRAVITY) != FALSE;
    magicRoom = CheckFieldEffect(field, FIELD_CONDITION_MAGIC_ROOM) != FALSE;
    item = GetBattleMonHeldItem(target);
    itemActive = !magicRoom && !CheckCondition(target, CONDITION_EMBARGO) && defenseAbility != ABILITY_KLUTZ;
    rooted = CheckCondition(target, CONDITION_INGRAIN);
    smackedDown = CheckCondition(target, CONDITION_SMACK_DOWN);
    grounded = gravity || rooted || smackedDown || (itemActive && item == ITEM_IRON_BALL);
    moldBreaker = attackAbility == ABILITY_MOLD_BREAKER || attackAbility == ABILITY_TURBOBLAZE ||
                  attackAbility == ABILITY_TERAVOLT;
    defense = moldBreaker ? 0 : defenseAbility;
    type = attributes & MOVE_ATTRIBUTE_TYPE_MASK;
    reveal = GetConditionContinuationParam(target, CONDITION_FORESIGHT);
    first = MovePreview_TypeAffinity(type, PokeTypePair_GetType1(pair), reveal, attackAbility == ABILITY_SCRAPPY,
                                     type == TYPE_GROUND && (gravity || rooted || smackedDown));
    if (PokeTypePair_IsMonotype(pair)) {
        second = 0;
    } else {
        second = MovePreview_TypeAffinity(type, PokeTypePair_GetType2(pair), reveal, attackAbility == ABILITY_SCRAPPY,
                                          type == TYPE_GROUND && (gravity || rooted || smackedDown));
    }
    affinity = first == AFFINITY_IMMUNE || second == AFFINITY_IMMUNE ? AFFINITY_IMMUNE : first + second;
    if (type == TYPE_GROUND) {
        // An Iron Ball makes a Flying type's remaining immunity neutral overall, as the game does; Gravity, Ingrain
        // and Smack Down did for each type above
        if (affinity == AFFINITY_IMMUNE && grounded) {
            affinity = 0;
        }
        if (!grounded &&
            (defense == ABILITY_LEVITATE || (itemActive && item == ITEM_AIR_BALLOON) ||
             CheckCondition(target, CONDITION_MAGNET_RISE) || CheckCondition(target, CONDITION_TELEKINESIS))) {
            return AFFINITY_IMMUNE;
        }
    }
    if (affinity == AFFINITY_IMMUNE) {
        return AFFINITY_IMMUNE;
    }
    if ((type == TYPE_WATER &&
         (defense == ABILITY_WATER_ABSORB || defense == ABILITY_DRY_SKIN || defense == ABILITY_STORM_DRAIN)) ||
        (type == TYPE_ELECTRIC &&
         (defense == ABILITY_VOLT_ABSORB || defense == ABILITY_LIGHTNINGROD || defense == ABILITY_MOTOR_DRIVE)) ||
        (type == TYPE_FIRE && defense == ABILITY_FLASH_FIRE) || (type == TYPE_GRASS && defense == ABILITY_SAP_SIPPER) ||
        (defense == ABILITY_SOUNDPROOF && (attributes & MOVE_ATTRIBUTE_SOUND)) ||
        (defense == ABILITY_WONDER_GUARD && affinity <= 0)) {
        return AFFINITY_IMMUNE;
    }
    // Sturdy blocks one-hit KO moves at any HP
    if (defense == ABILITY_STURDY &&
        (move == MOVE_GUILLOTINE || move == MOVE_HORN_DRILL || move == MOVE_FISSURE || move == MOVE_SHEER_COLD)) {
        return AFFINITY_IMMUNE;
    }
    return affinity;
}

static u32 MovePreview_Color(BtlvInput *work, u32 move, u32 attributes, BattleMon *target) {
    PokeTypePair pair;
    int affinity;

    if (!(attributes & MOVE_ATTRIBUTE_DAMAGING) || !MovePreview_GetTypes(target, &pair)) {
        return MOVE_COLOR_WHITE;
    }
    if ((attributes & MOVE_ATTRIBUTE_TYPE_MASK) >= MOVE_PREVIEW_TYPE_COUNT) {
        return MOVE_COLOR_WHITE;
    }
    affinity = MovePreview_Affinity(work, move, attributes, target, pair);
    if (affinity == AFFINITY_IMMUNE) {
        return MOVE_COLOR_IMMUNE;
    }
    if (affinity == AFFINITY_UNKNOWN) {
        return MOVE_COLOR_WHITE;
    }
    if (attributes & MOVE_ATTRIBUTE_FIXED_DAMAGE) {
        return MOVE_COLOR_WHITE;
    }
    if (affinity > 0) {
        return MOVE_COLOR_SUPER_EFFECTIVE;
    }
    if (affinity < 0) {
        return MOVE_COLOR_RESISTED;
    }
    return MOVE_COLOR_WHITE;
}

// Recolors a move name's text, leaving its shadow and the PP. Returns whether a pixel changed
static BOOL MovePreview_TintName(GFLBitmap *bitmap, u32 left, u32 top, u32 color) {
    BOOL changed = FALSE;
    u32 x;
    u32 y;

    for (y = top; y < top + MOVE_NAME_HEIGHT; y++) {
        for (x = left; x < left + MOVE_NAME_WIDTH; x++) {
            u32 old = MovePreview_GetPixel(bitmap, x, y);

            if ((old == MOVE_COLOR_WHITE || old == MOVE_COLOR_SUPER_EFFECTIVE || old == MOVE_COLOR_RESISTED ||
                 old == MOVE_COLOR_IMMUNE) &&
                old != color) {
                MovePreview_SetPixel(bitmap, x, y, color);
                changed = TRUE;
            }
        }
    }
    return changed;
}

// Colors the four move names, or with moves NULL the target screen's carried name against selectedTarget, the
// target card's index or -1. Copies the bitmap to VRAM only when a pixel changed
static void MovePreview_Update(BtlvInput *work, const u16 *moves, int selectedTarget) {
    GFLBitmap *bitmap;
    BattleMon *target;
    BOOL changed = FALSE;
    u32 i;

    if (!MovePreview_Bind(work)) {
        return;
    }
    bitmap = MovePreview_Bitmap(work);
    if (moves != NULL) {
        if (work->rule == BTL_STYLE_SINGLE || work->rule == BTL_STYLE_ROTATION) {
            target = MovePreview_Battler(work->rule == BTL_STYLE_SINGLE ? 1 : 3);
        } else {
            target = NULL;
        }
        for (i = 0; i < 4; i++) {
            if (MovePreview_TintName(bitmap, (i & 1) * MOVE_NAME_WIDTH, MOVE_NAME_TOP + (i / 2) * MOVE_NAME_ROW_HEIGHT,
                                     MovePreview_Color(work, moves[i], sMovePreview.attributes[i], target))) {
                changed = TRUE;
            }
        }
    } else if (work->screen == SCREEN_TARGETS && sMovePreview.label) {
        // The opponents' cards have odd indices, and their view positions are 2 more
        if (selectedTarget >= 0 && selectedTarget < BTL_POS_MAX && (selectedTarget & 1)) {
            target = MovePreview_Battler(selectedTarget + 2);
        } else {
            target = NULL;
        }
        changed =
            MovePreview_TintName(bitmap, MOVE_LABEL_LEFT, 0,
                                 MovePreview_Color(work, sMovePreview.selectedMove,
                                                   sMovePreview.attributes[sMovePreview.selectedSlot & 3], target));
    }
    if (!sMovePreview.paletteInstalled) {
        MovePreview_SetPalette(work, FALSE);
    }
    if (changed) {
        BmpWin_FlushChar(work->msgWin);
    }
}

void PaperWhite2_MovePreviewAfterDrawMoves(BtlvInput *work, const BtlvInputMoveParam *param) {
    BattleMon *attacker = NULL;
    BOOL normalize;
    u32 i;

    if (!MovePreview_Bind(work)) {
        return;
    }
    if (work->rule == BTL_STYLE_ROTATION) {
        u32 slot = work->pokeSlot;

        if (slot < 3) {
            attacker = work->mons[slot];
        }
    } else {
        attacker = MovePreview_Battler(param->pos);
    }
    normalize = MovePreview_Ability(attacker) == ABILITY_NORMALIZE;
    sMovePreview.selectedSlot = param->pos << 2;
    sMovePreview.label = FALSE;
    for (i = 0; i < 4; i++) {
        u32 move = param->moves[i];
        // The move data cache holds these moves, which the game just drew
        u32 type = move ? PML_MoveGetParam(move, MOVE_PARAM_TYPE) : TYPE_NORMAL;
        BOOL damaging = move && PML_MoveGetParam(move, MOVE_PARAM_CATEGORY);
        BOOL sound;

        if (move == MOVE_HIDDEN_POWER) {
            if (attacker != NULL) {
                type = getHiddenPowerType(attacker->core.src);
            } else {
                damaging = FALSE;
            }
        }
        if (normalize) {
            type = TYPE_NORMAL;
        }
        // Struggle ignores the type chart, and the others' types depend on an item or the weather
        if (move == MOVE_STRUGGLE || move == MOVE_WEATHER_BALL || move == MOVE_NATURAL_GIFT || move == MOVE_JUDGMENT ||
            move == MOVE_TECHNO_BLAST) {
            damaging = FALSE;
        }
        sound = move && getMoveFlag(move, MOVE_FLAG_BIT_SOUND);
        sMovePreview.attributes[i] = type | (sound ? MOVE_ATTRIBUTE_SOUND : 0) |
                                     (damaging ? MOVE_ATTRIBUTE_DAMAGING : 0) |
                                     (MovePreview_IsFixedDamage(move) ? MOVE_ATTRIBUTE_FIXED_DAMAGE : 0);
    }
    MovePreview_Update(work, param->moves, -1);
}

void PaperWhite2_MovePreviewBeforeClear(BtlvInput *work, u32 nextScreen, PaperWhite2MoveLabel *label) {
    GFLBitmap *bitmap = MovePreview_Bitmap(work);
    u32 active = work->pokeIndex;
    u32 slot = active < 3 ? work->lastCursor[active][SCREEN_MOVES] : 255;
    u32 x;
    u32 y;
    u32 n;

    label->keep = bitmap != NULL && sMovePreview.input == work && nextScreen == SCREEN_TARGETS &&
                  work->screen == SCREEN_MOVES && slot < 4;
    if (label->keep) {
        sMovePreview.selectedSlot = (sMovePreview.selectedSlot & ~3) | slot;
        sMovePreview.selectedMove = work->moves[slot];
        // The name's text at 2 bits a pixel, white where the preview had colored it
        for (y = 0; y < MOVE_NAME_HEIGHT; y++) {
            for (x = 0; x < MOVE_NAME_WIDTH; x += 4) {
                u32 packed = 0;

                for (n = 0; n < 4; n++) {
                    u32 color = MovePreview_GetPixel(bitmap, (slot & 1) * MOVE_NAME_WIDTH + x + n,
                                                     MOVE_NAME_TOP + (slot / 2) * MOVE_NAME_ROW_HEIGHT + y);

                    if (color == MOVE_COLOR_SUPER_EFFECTIVE || color == MOVE_COLOR_RESISTED ||
                        color == MOVE_COLOR_IMMUNE) {
                        color = MOVE_COLOR_WHITE;
                    }
                    packed |= (color <= 2 ? color : 0) << (2 * n);
                }
                label->glyphs[y * (MOVE_NAME_WIDTH / 4) + x / 4] = packed;
            }
        }
    }
    if (sMovePreview.input == work && sMovePreview.paletteInstalled) {
        MovePreview_SetPalette(work, TRUE);
    }
}

void PaperWhite2_MovePreviewAfterClear(BtlvInput *work, const PaperWhite2MoveLabel *label) {
    GFLBitmap *bitmap;
    u32 x;
    u32 y;

    sMovePreview.label = label->keep;
    if (label->keep) {
        bitmap = work->msgBitmap;
        for (y = 0; y < MOVE_NAME_HEIGHT; y++) {
            for (x = 0; x < MOVE_NAME_WIDTH; x++) {
                MovePreview_SetPixel(bitmap, MOVE_LABEL_LEFT + x, y,
                                     (label->glyphs[y * (MOVE_NAME_WIDTH / 4) + x / 4] >> ((x & 3) * 2)) & 3);
            }
        }
        BmpWin_FlushChar(work->msgWin);
    }
}

void PaperWhite2_MovePreviewAfterKeyInput(BtlvInput *work, const BtlvInputKeyStop *stops, s32 touch) {
    if (work->screen == SCREEN_MOVES || work->screen == SCREEN_ROTATION) {
        MovePreview_Update(work, work->moves, -1);
    } else if (work->screen == SCREEN_TARGETS) {
        const BtlvInputKeyStop *stop = &stops[work->cursor];
        // The touched card, or the card that A picks at the cursor's stop, which has one card unless the move hits
        // several or the field
        int target = touch >= 0 ? touch : stop->a;
        u32 count = 0;
        u32 i;

        for (i = 0; i < 6; i++) {
            if (stop->corners[i] >= 0) {
                count++;
            }
        }
        if (touch < 0 && count != 1) {
            target = -1;
        }
        MovePreview_Update(work, NULL, target);
    }
}
