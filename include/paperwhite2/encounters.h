#ifndef PAPERWHITE2_ENCOUNTERS_H
#define PAPERWHITE2_ENCOUNTERS_H

#include "types.h"
#include "field/enc_pokeset.h"
#include "field/encounter.h"
#include "gfl/arc.h"
#include "struct_decls.h"

// Paper White 2: the wild encounters (docs/paperwhite2/encounters.md). Each species' habitats, from
// res/paperwhite2/encounters/, are packed by tools/paperwhite2/encounters.py into one member after the original tables
// of the wild encounters' archive (a/1/2/7): a block for each area (an original table, ENCOUNTERS_*), each a list of
// candidates. When the field loads a zone's table, the area's block is read here and its rates replace the table's;
// when an encounter's slots are prepared (src/ov036/enc_pokeset.c), the candidates that can appear now become them,
// weighted by their rarity tiers, so the lead's abilities, Repel, fishing and the rustling spots work as before. A
// zone without an area keeps its table. Where no Pokémon can appear, there is no encounter

// The member's magic, "PENC", and its version
#define ENCOUNTERS_MAGIC 0x434e4550
#define ENCOUNTERS_VERSION 1
// The runtime's limits, which the packer checks: the tiers, an area's block, the slots of one encounter (the
// candidates, the rustling spots' species and the outbreaks) and the outbreak entries
#define ENCOUNTERS_TIER_MAX 8
#define ENCOUNTERS_BLOCK_MAX 0x1000
#define ENCOUNTERS_SLOT_MAX 64
#define ENCOUNTERS_OUTBREAK_MAX 128
// A candidate's rule when it has no extra conditions
#define ENCOUNTERS_NO_RULE 0xffff
// The slot function index (enc_pokeset.c's ENCOUNT_SLOT_RANDOMIZE_FUNCS) of PaperWhite2_Encounters_PickSlot
#define ENCOUNTERS_SLOT_FUNC 4
// ENCOUNTERS_SLOT_MAX and the slots added to the candidates: the rustling spots' species and an outbreak's
#define ENCOUNTERS_SLOTS (ENCOUNTERS_SLOT_MAX + 2)
// The most wild Pokémon of one encounter: a triple battle's
#define ENCOUNTERS_WILD_MAX 3

// What a species' minimum level is compared with
enum {
    ENCOUNTERS_GATE_PARTY,
    ENCOUNTERS_GATE_SCALED,
};

// The kinds of rustling spots, in the order of the header's fixed shares
enum {
    ENCOUNTERS_SPOTS_GRASS,
    ENCOUNTERS_SPOTS_DUST,
    ENCOUNTERS_SPOTS_SHADOW,
    ENCOUNTERS_SPOTS_COUNT,
};

// Who joins a double battle
enum {
    ENCOUNTERS_PARTNERS_FAMILY,
    ENCOUNTERS_PARTNERS_AREA,
};

typedef struct {
    u32 magic;
    u16 version;
    u16 areaCount;
    u16 outbreakCount;
    u8 outbreakIds;
    u8 tierCount;
    // Each tier's share in tenths of a percent
    u16 tierShares[ENCOUNTERS_TIER_MAX];
    u8 gate;
    u8 hiddenAbility;
    u8 outbreakShare;
    // A bit for each tier whose Pokémon the rustling spots draw from
    u8 rustlingTiers;
    // Shaking grass's own species and its levels
    u16 rustlingSpecies;
    u8 rustlingMin;
    u8 rustlingMax;
    // Each kind of spots' fixed share, in percent: the species for shaking grass, the game's items for the others
    u8 spotShares[ENCOUNTERS_SPOTS_COUNT];
    // A bit for each ENCTYPE_* whose Pokémon the rustling spots draw from
    u8 rustlingFrom;
    u32 outbreaks;
    u32 index;
} EncountersHeader;

// One area of one outbreak; an outbreak of several areas has an entry for each, with the same id
typedef struct {
    u16 area;
    // The area's first zone, which the gates' bulletin board names
    u16 zone;
    u16 species;
    u8 id;
    u8 form;
    u8 methods;
    u8 seasons;
    u8 times;
    u8 minLevel;
    u8 maxLevel;
    u8 padding;
} EncountersOutbreak;

typedef struct {
    u32 offset;
    u32 size;
} EncountersIndexEntry;

// An area's block: its rates, its spots and its candidates, then the ConditionTable of their extra conditions
typedef struct {
    u8 rates[4][ENCTYPE_MAX];
    u8 spots;
    u8 padding;
    u16 count;
    // The table's offset in the block, 0 for none
    u16 table;
    u16 padding2;
} EncountersArea;

// A habitat in an area for one season or for all of its seasons. The bits follow ENCTYPE_*, SEASON_*, DAY_PERIOD_* and
// WEATHER_* (0 for any weather)
typedef struct {
    u16 species;
    // The family's base species, for family partners
    u16 family;
    u16 weather;
    u16 rule;
    u8 form;
    u8 tier;
    u8 methods;
    u8 seasons;
    u8 times;
    u8 minLevel;
    u8 maxLevel;
    u8 hiddenAbility;
    u8 single;
    u8 doubleChance;
    u8 triple;
    u8 partners;
} EncountersCandidate;

// After EncData_Load of the field's table (EventData_LoadZoneEncData, src/ov012/eventdata_system.c): reads the
// zone's area into the block and gives encData the area's rates for the season. Without an area, the table stays as it
// was and the new data is off until the next zone
void PaperWhite2_Encounters_Load(ArcTool *arc, u16 zoneId, u8 season, EncData *encData);
// Whether the current zone's encounters come from the new data
BOOL PaperWhite2_Encounters_IsActive(void);
// Whether the new data has been read (the first zone with a table read its header)
BOOL PaperWhite2_Encounters_HasData(void);
// FieldEncount_PrepareActiveSlots's replacement: the candidates that can appear now by the manager's method become the
// slots, weighted; slotCount and slotFuncIndex are set. Returns the slot count, 0 for no encounter
u8 PaperWhite2_Encounters_PrepareSlots(EncountManager *manager, WildEncSlot *slots);
// ENCOUNT_SLOT_RANDOMIZE_FUNCS's weighted pick of the slots that PrepareSlots made (or of a partner's)
int PaperWhite2_Encounters_PickSlot(int count);
// After FieldEncount_SetupFromData made a param from a slot: notes the slot and rolls its hidden ability
void PaperWhite2_Encounters_SetupParam(const WildEncSlot *slot, WildPkmParam *param);
// After the first wild Pokémon is made: its battle styles may make it a double or a triple battle, with partners from
// its family or from the area. A double needs two of the party's Pokémon that can fight (able), a triple three, or it
// is a double. Sets the manager's doubleBattle and pokeCount
void PaperWhite2_Encounters_RollPartner(EncountManager *manager, u32 able);
// The next picks are the partner's, until EndPartner
void PaperWhite2_Encounters_BeginPartner(void);
void PaperWhite2_Encounters_EndPartner(void);
// Whether a dust cloud's or a bridge shadow's spot (ENCOUNTERS_SPOTS_*) gives an item rather than a battle: at its
// fixed share, or always when no Pokémon can appear there. Also sets the kind for the battle's slots
BOOL PaperWhite2_Encounters_SpotGivesItem(GameData *gameData, u32 spots);
// Sets the kind of the rustling spot whose battle is next (shaking grass gives its species)
void PaperWhite2_Encounters_SetSpots(u32 spots);
// The zone of the day's outbreak for the gates' bulletin board, or 0xffff for none (getSwarmLevelRangeFromData)
u16 PaperWhite2_Encounters_OutbreakZone(GameData *gameData);

#endif // PAPERWHITE2_ENCOUNTERS_H
