#ifndef PAPERWHITE2_DEXNAV_H
#define PAPERWHITE2_DEXNAV_H

#include "types.h"
#include "field/enc_pokeset.h"
#include "gfl/proc.h"
#include "paperwhite2/conditions.h"
#include "paperwhite2/encounters.h"
#include "struct_decls.h"

// Paper White 2: the DexNav (docs/paperwhite2/design/dexnav.md), the Poké Radar's place in the bag: what can appear in
// the current area under the current conditions, by method, with the shares and levels of the wild encounters' rules
// (docs/paperwhite2/encounters.md). It opens from the bag or Y as one of the field's apps (FIELD_APP_DEXNAV,
// src/paperwhite2/ov012/paperwhite2_dexnav_event.c) and runs in the Pokédex's Habitat List's overlay 303, beside it.
//
// It is in two parts, so that its screens can be redesigned without its logic: Dexnav_Build (paperwhite2_dexnav_data.c)
// turns the encounter data into lists, and the app (paperwhite2_dexnav.c) only draws them and takes the player's input

// The methods in the order the app shows them: the water ones, then the land ones (ENCTYPE_*)
#define DEXNAV_METHOD_COUNT ENCTYPE_MAX
#define DEXNAV_WATER_METHODS 4
extern const u8 DEXNAV_METHOD_ORDER[DEXNAV_METHOD_COUNT];

// An entry's origin besides ENCOUNTERS_FROM_*: a dust cloud's or a bridge shadow's items
#define DEXNAV_FROM_ITEMS 0xfe
// The most entries of one method: the encounter's slots and the spots' items
#define DEXNAV_ENTRY_MAX (ENCOUNTERS_SLOTS + 1)

// One Pokémon (or the items) that can appear by a method now
typedef struct {
    // 0 for the items
    u16 species;
    // Its share of the method's encounters, in tenths of a percent
    u16 share;
    u8 form;
    // ENCOUNTERS_FROM_* or DEXNAV_FROM_ITEMS
    u8 from;
    u8 minLevel;
    u8 maxLevel;
    // The chance in percent of its hidden ability
    u8 hiddenAbility;
    u8 seen;
    u8 caught;
    u8 padding;
} DexnavEntry;

typedef struct {
    // The area's step rate for the method this season: 0 where the method isn't used here
    u8 rate;
    u8 count;
    DexnavEntry entries[DEXNAV_ENTRY_MAX];
} DexnavMethod;

typedef struct {
    // Whether the zone's encounters come from the new data at all
    BOOL active;
    DexnavMethod methods[DEXNAV_METHOD_COUNT];
} DexnavData;

// The lists of every method under a context (the field's, as the encounters see it), most common first, with the
// Pokédex's seen and caught marks. A chance clause of a habitat's rule rolls with the context's load seed, so the
// lists stay the same while the app is open
void Dexnav_Build(DexnavData *data, const ConditionContext *ctx, GameData *gameData);

// What the app takes: the game data and the field's context, saved before the field closed
typedef struct {
    GameData *gameData;
    ConditionContext ctx;
} DexnavParam;

extern const GameProcFunctions DEXNAV_PROC_FUNCTIONS;

#endif // PAPERWHITE2_DEXNAV_H
