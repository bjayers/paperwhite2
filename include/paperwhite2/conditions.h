#ifndef PAPERWHITE2_CONDITIONS_H
#define PAPERWHITE2_CONDITIONS_H

#include "types.h"
#include "gfl/heap.h"
#include "struct_decls.h"

// Paper White 2: the conditions module, which answers "does this apply right now?" for every feature that needs it
// (docs/paperwhite2/design/conditions.md, docs/paperwhite2/plugins.md's Conditions). A condition is a list of clauses
// that all have to hold; tools/paperwhite2/conditions.py compiles them from JSON (res/paperwhite2/conditions/
// condition.schema.json) into a ConditionTable of rules, each its clauses, a priority and a weight. The matcher, the
// selection, the seeds and the level scaling are src/paperwhite2/main/paperwhite2_conditions.c; the context's fills
// from the game are src/paperwhite2/main/paperwhite2_conditions_context.c, and its field part (the exterior, the
// terrain and the follower) src/paperwhite2/ov036/paperwhite2_conditions_field.c. The numbers of the enums below are
// the binary format's: the compiler reads them from this header

// What a clause tests. Each kind reads one value of the context, which op compares with the clause's arg and value
enum {
    // value: a bit for each SEASON_* (system/season.h), from the field's season (GameData_GetSeason)
    CONDITION_KIND_SEASON = 0,
    // value: a bit for each DAY_PERIOD_* (system/rtc.h), from GetRealTimeDayPeriod of the season
    CONDITION_KIND_PERIOD = 1,
    // value: a bit for each WEATHER_* (system/zone_weather.h), from the zone's computed weather (GetNowWeather)
    CONDITION_KIND_WEATHER = 2,
    // arg: an event flag; op SET or UNSET
    CONDITION_KIND_FLAG = 3,
    // arg: a saved event variable; op EQ to LT against value
    CONDITION_KIND_VAR = 4,
    // The current zone: op EQ with arg a zone, or IN_LIST with arg a list of zones. A zone group compiles to one
    CONDITION_KIND_ZONE = 5,
    // value: 1 outdoors, 0 indoors (AreaData_IsExterior), from the field
    CONDITION_KIND_EXTERIOR = 6,
    // value: a bit for each terrain group (paperwhite2/terrain_groups.h) of the subject's tile, from the field
    CONDITION_KIND_TERRAIN = 7,
    // RANGE of the party's median level, the lower middle one for an even count
    CONDITION_KIND_PARTY_LEVEL = 8,
    // RANGE of the adjusted party median, the level wild Pokémon scale to (Conditions_ScaledLevel)
    CONDITION_KIND_SCALED_LEVEL = 9,
    // RANGE of the subject's level. The subject is the lead (party slot 0) for encounters and spawns, the follower
    // for the follower's rules
    CONDITION_KIND_LEVEL = 10,
    // The subject's species and form: op EQ with arg a species entry, or IN_LIST (CONDITION_SPECIES_ENTRY)
    CONDITION_KIND_SPECIES = 11,
    // value: a bit for each TYPE_*; either of the subject's two types
    CONDITION_KIND_TYPE = 12,
    // value: a bit for each NATURE_*
    CONDITION_KIND_NATURE = 13,
    // RANGE of the subject's HP in percent of its maximum, rounded down
    CONDITION_KIND_HP = 14,
    // value: a bit for each CONDITION_STATUS_*
    CONDITION_KIND_STATUS = 15,
    // RANGE of the subject's friendship
    CONDITION_KIND_FRIENDSHIP = 16,
    // RANGE of the steps the caller gives with the subject (the follower's steps as the follower)
    CONDITION_KIND_STEPS = 17,
    // The follower's species: op EQ with arg a species, IN_LIST, or ANY for any follower
    CONDITION_KIND_FOLLOWER = 18,
    // value: a percent, rolled with the check's random state each time the clause is tested
    CONDITION_KIND_CHANCE = 19,
    // value: a bit for each DIR_UP to DIR_RIGHT: the way the subject faces, given by the consumer (the follower's to
    // look at the player)
    CONDITION_KIND_FACING = 20,
    // RANGE of the player's tile in the map matrix, x and then z (gPos), given by the consumer
    CONDITION_KIND_TILE_X = 21,
    CONDITION_KIND_TILE_Y = 22,
    // RANGE of the subject's total steps, which the consumer gives (the follower's, as the follower, which never reset)
    CONDITION_KIND_TOTAL_STEPS = 23,
    // The item the subject keeps for the player (the follower's pickup): op ANY for one, EQ with arg 0 for none
    CONDITION_KIND_ITEM_WAITING = 24,
    CONDITION_KIND_COUNT,
};

// How a clause compares
enum {
    // The context's value against arg (value for CONDITION_KIND_VAR)
    CONDITION_OP_EQ = 0,
    CONDITION_OP_NE = 1,
    CONDITION_OP_GE = 2,
    CONDITION_OP_LE = 3,
    CONDITION_OP_GT = 4,
    CONDITION_OP_LT = 5,
    // The context's value is in the table's sorted list number arg
    CONDITION_OP_IN_LIST = 6,
    // The context's value isn't 0 (a follower is out)
    CONDITION_OP_ANY = 7,
    // arg <= the context's value <= value
    CONDITION_OP_RANGE = 8,
    // Bit (the context's value) of value is set
    CONDITION_OP_MASK = 9,
    // The flag is set, or clear
    CONDITION_OP_SET = 10,
    CONDITION_OP_UNSET = 11,
};

// The subject's status condition, for CONDITION_KIND_STATUS's bits: none, or the major status it has (bad poison is
// poison), in the order the follower's dialogue rules check them
enum {
    CONDITION_STATUS_NONE = 0,
    CONDITION_STATUS_POISON = 1,
    CONDITION_STATUS_SLEEP = 2,
    CONDITION_STATUS_BURN = 3,
    CONDITION_STATUS_FREEZE = 4,
    CONDITION_STATUS_PARALYSIS = 5,
};

// The parts of a context that its fills set (ConditionContext.filled). A clause on a part that isn't filled fails
#define CONDITION_CONTEXT_WORLD 0x1
#define CONDITION_CONTEXT_FIELD 0x2
#define CONDITION_CONTEXT_SUBJECT 0x4
#define CONDITION_CONTEXT_PARTY 0x8
#define CONDITION_CONTEXT_FOLLOWER 0x10
#define CONDITION_CONTEXT_POSITION 0x20

// The seeds a pick starts its random state from (Conditions_Seed): stable while the player stays in the zone and new on
// the next zone load; stable for the day; or new for each check
enum {
    CONDITION_SEED_LOAD = 0,
    CONDITION_SEED_DAY = 1,
    CONDITION_SEED_CHECK = 2,
};

// A species entry of a CONDITION_KIND_SPECIES clause or list: the species, and in the bits above it the form plus one,
// or 0 for any form
#define CONDITION_SPECIES_BITS 11
#define CONDITION_SPECIES_MASK ((1 << CONDITION_SPECIES_BITS) - 1)
#define CONDITION_SPECIES_ENTRY(species, form) ((species) | (((form) + 1) << CONDITION_SPECIES_BITS))

// A table's header: "PWCT"
#define CONDITION_TABLE_MAGIC 0x54435750
#define CONDITION_TABLE_VERSION 1
// The most rules a table can have, which Conditions_Select keeps a bit of each for on the stack
#define CONDITION_TABLE_MAX_RULES 256
// A share of 100% always picks from the highest priority that matches
#define CONDITION_SHARE_ALL 100
// The archive and its members that hold the compiled tables, after the weather calendar's two files
// (tools/paperwhite2/conditions.py): the debug menu's samples, and the conditions that scripts test (CheckCondition)
#define CONDITION_TABLE_ARCHIVE ARCID_CALENDAR
#define CONDITION_TABLE_MEMBER_DEBUG_SAMPLES 2
#define CONDITION_TABLE_MEMBER_SCRIPT 3

// One clause, 8 bytes
typedef struct {
    u8 kind;
    u8 op;
    // A flag, a variable, a zone, a species entry, a list's number, or a range's least
    u16 arg;
    // A bit mask, a compared value, or a range's greatest
    u32 value;
} Condition;

// A rule's header, followed by its clauses and then its consumer's payload, up to the next rule
typedef struct {
    u8 clauseCount;
    u8 priority;
    u16 weight;
} ConditionRule;

// A compiled table: this header, then an offset for each rule and then each list, from the table's start. Rules and
// lists start on 4 bytes. A list is a u16 count and that many sorted u16s
typedef struct {
    u32 magic;
    u8 version;
    // The percent of the checks that pick from the highest priority that matches, before the next one is tried
    u8 share;
    u16 ruleCount;
    u16 listCount;
    // The table's size in bytes, which ends the last rule's payload
    u16 size;
    u16 offsets[];
} ConditionTable;

// What the clauses read, filled by part before a check
typedef struct {
    u32 filled;
    // World (ConditionContext_FillWorld)
    EventWork *eventWork;
    u8 season;
    u8 period;
    u16 weather;
    u16 zone;
    // The zone's parent zone (GetZoneParentZone), which groups a town's buildings with it; shown by the readout
    u16 zoneParent;
    u16 zoneLoadCounter;
    s32 dayNumber;
    u32 loadSeed;
    u32 daySeed;
    // Field (ConditionContext_FillField, overlay 36)
    u8 exterior;
    u32 terrain;
    u32 followerTerrain;
    // Follower (ConditionContext_FillField)
    u16 followerSpecies;
    // Subject (ConditionContext_FillSubject)
    u16 species;
    u8 form;
    u8 level;
    u8 type1;
    u8 type2;
    u8 nature;
    u8 friendship;
    u8 hpPercent;
    u8 status;
    u16 steps;
    u16 itemWaiting;
    u32 totalSteps;
    // Position (set by the consumer): the subject's facing, a DIR_*, and the player's tile
    u8 facing;
    u16 tileX;
    u16 tileY;
    // Party (ConditionContext_FillParty)
    u8 partyCount;
    u8 medianLevel;
    u8 scaledLevel;
} ConditionContext;

// The matcher and the selection (main, paperwhite2_conditions.c)

// A number that looks random but that a and b always give the same: the mixing of MurmurHash3's finalizer. The
// weather's date of the day is Conditions_Hash(day, season)
u32 Conditions_Hash(u32 a, u32 b);
// The next number below max of a pick's random state: a linear congruential generator's step, mixed by Conditions_Hash
u32 Conditions_Random(u32 *state, u32 max);
// The random state a pick starts from: a CONDITION_SEED_* of the context, mixed with key (a group's ID, or a key that
// groups share to take the same pick). CONDITION_SEED_CHECK draws a new one
u32 Conditions_Seed(const ConditionContext *ctx, u32 seed, u32 key);

// Whether the table is one: its magic, version and offsets. Conditions_LoadTable checks it
BOOL Conditions_IsTableValid(const ConditionTable *table, u32 size);
const ConditionRule *Conditions_GetRule(const ConditionTable *table, u32 index);
const Condition *Conditions_GetClauses(const ConditionRule *rule);
// A rule's consumer payload, and its size in bytes through *size
const void *Conditions_GetPayload(const ConditionTable *table, u32 index, u32 *size);
// Whether every clause of the table's rule holds in the context. A CHANCE clause draws from rng
BOOL Conditions_MatchRule(const ConditionTable *table, u32 index, const ConditionContext *ctx, u32 *rng);
// The selection over the table's rules: of the rules that match, the highest priority is picked from by weight in
// share percent of the checks (CONDITION_SHARE_ALL always), and otherwise the next lower one; the lowest priority that
// matches is always picked from. The rule's index, or -1 if none matches. matched, if not NULL, gets a bit for each
// rule that matched (CONDITION_TABLE_MAX_RULES / 32 words)
s32 Conditions_Select(const ConditionTable *table, const ConditionContext *ctx, u32 share, u32 *rng, u32 *matched);

// The median of count levels, the lower middle one for an even count; 0 for none. Sorts levels
u32 Conditions_MedianLevel(u8 *levels, u32 count);
// The adjusted party median: the level wild Pokémon scale to, from the median by res/paperwhite2/level_scaling.json
// (paperwhite2/level_scaling_config.h): median * percent / 100 + offset, rounded down, within the least and greatest
u32 Conditions_ScaledLevel(u32 median);
// The lowest and highest wild level around a scaled level, by the spread of level_scaling.json
u32 Conditions_ScaledLevelMin(u32 scaled);
u32 Conditions_ScaledLevelMax(u32 scaled);

// The context's fills (main, paperwhite2_conditions_context.c)

void ConditionContext_Init(ConditionContext *ctx);
// The season, the period, the weather, the zone and its parent, the flags and variables, and the seeds
void ConditionContext_FillWorld(ConditionContext *ctx, GameData *gameData);
// The subject from a party member, with steps the caller counts. FALSE, with the subject not filled, for an Egg. The
// total steps and the waiting item are 0; a consumer that counts them sets them after
BOOL ConditionContext_FillSubject(ConditionContext *ctx, PartyPkm *pkm, u16 steps);
// The position: the subject's facing (a DIR_*) and the player's tile
void ConditionContext_SetPosition(ConditionContext *ctx, u32 facing, u32 tileX, u32 tileY);
// The subject from the lead, party slot 0
BOOL ConditionContext_FillLead(ConditionContext *ctx, PokeParty *party);
// The party's median and adjusted median levels, of the members that aren't Eggs
void ConditionContext_FillParty(ConditionContext *ctx, PokeParty *party);
// The world, the lead and the party: what a script's check reads besides the field
void ConditionContext_FillGame(ConditionContext *ctx, GameData *gameData);
// Bumps the zone-load counter (EVENT_WORK_ZONE_LOAD_COUNTER), which the load seed mixes in; at every zone init
// (FieldScript_CallOnZoneInit, ov012/script_sys.c), so not after a battle or a menu
void Conditions_OnZoneInit(GameData *gameData);
// Reads a compiled table from its member of the archive (CONDITION_TABLE_MEMBER_*) into the heap, or NULL if it isn't
// a valid table. Free it with GFL_HeapFree
ConditionTable *Conditions_LoadTable(u32 member, HeapID heapId);

// The field's part (overlay 36, paperwhite2_conditions_field.c)

// The terrain groups of a tile (paperwhite2/terrain_groups.h's bits), with indoor or outdoor from exterior
u32 Conditions_TerrainGroups(u32 tileType, BOOL exterior);
// The exterior, the terrain under the player and under the follower, and the follower's species. The clauses'
// terrain is the player's
void ConditionContext_FillField(ConditionContext *ctx, Field *field);
// Sets the clauses' terrain to a tile's, as a consumer whose subject stands elsewhere does (the follower's own rules)
void ConditionContext_SetTerrain(ConditionContext *ctx, u32 tileType);

#endif // PAPERWHITE2_CONDITIONS_H
