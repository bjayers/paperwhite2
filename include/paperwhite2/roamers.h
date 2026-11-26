#ifndef POKEBW2_PAPERWHITE2_ROAMERS_H
#define POKEBW2_PAPERWHITE2_ROAMERS_H

#include "types.h"
#include "battle/btl_setup.h"
#include "field/enc_pokeset.h"
#include "field/field_script.h"
#include "paperwhite2/roamers_config.h"
#include "pml/poke_party.h"
#include "struct_decls.h"
#include "system/vm.h"

// Paper White 2: the roaming legendaries, phase 1 (docs/paperwhite2/design/roaming-legendaries.md, sections 9 and
// 9.2). Each roamer of res/paperwhite2/roamers/roamers.json is released by a script (Roamers, below) or the debug
// menu, then roams the routes of routes.json by its own clock ("settle, then scatter"): it stays ROAMERS_MOVE_SECONDS
// of real time on a route, the clock paused while the player is on it, then moves to a neighbouring route, never onto
// another roamer's route or the player's; after a battle it leaves, it moves at once at least ROAMERS_SCATTER_LINKS
// links away. It is met at the original's roaming roll (FieldEncount_RndCheckRoaming's place in
// EventWildBattleCall_CreateRandom) by its methods and odds, in a single battle built from its slot, and its HP and
// status are kept after the battle. Caught, it is gone; knocked out, it comes back the next day at full HP with a new
// PID, IVs and nature. Its route has its weather while it is there (GetDefaultWeatherValue). Nothing moves during an
// Entralink run. The core is in overlay 12 (src/paperwhite2/ov012/paperwhite2_roamers.c), the roll and the battle's
// Pokémon in overlay 36 (src/paperwhite2/ov036/paperwhite2_roamers_field.c)

// The save's slots, whatever the data's count (ROAMERS_COUNT, at most this)
#define ROAMERS_SAVE_SLOTS 8
#define ROAMERS_MAGIC 0x524d5750
#define ROAMERS_VERSION 1
// A roamer's HP while it is full, so that the battle makes its HP from its stats
#define ROAMERS_HP_FULL 0xffff
// No slot (the battle's roamer) and no route
#define ROAMERS_NONE 0xff
#define ROAMERS_ZONE_NONE 0xffff

// The original roaming battle's setup flag (FieldEncount_SetupRoaming's BtlSetup_SetFlag), which gives the foe the
// roaming AI (TR_AI_SCRIPT_ROAMING_POKEMON) and marks the battle as a roamer's
#define ROAMERS_BTL_SETUP_FLAG 8

// How a roamer is met (RoamerData's methods)
#define ROAMER_METHOD_WALK 1
#define ROAMER_METHOD_SURF 2
#define ROAMER_METHOD_FISH 4

// A roamer's state: not released yet, roaming, knocked out (back on the day after knockedOutDay), caught
enum {
    ROAMER_STATE_UNRELEASED,
    ROAMER_STATE_ROAMING,
    ROAMER_STATE_KNOCKED_OUT,
    ROAMER_STATE_CAUGHT,
};

// Roamer's flags: it has been met in battle
#define ROAMER_FLAG_SEEN 1

// One roamer of the data (ROAMERS_DATA, from roamers.json)
typedef struct {
    u16 species;
    u8 form;
    u8 level;
    u8 group;
    u8 odds;
    u8 methods;
    u16 weather;
    // A bit for each route of ROAMERS_ROUTES that it roams
    u32 routes;
} RoamerData;

// One route of the graph (ROAMERS_ROUTES, from routes.json): its outdoor zones and a bit for each route it links to
typedef struct {
    u16 zones[2];
    u32 links;
} RoamerRoute;

// A roamer's slot in the save
typedef struct {
    u16 species;       // 0x0
    u8 form;           // 0x2
    u8 level;          // 0x3
    u16 hp;            // 0x4, ROAMERS_HP_FULL while full
    u8 status;         // 0x6, the party's condition (sleep turns, poison, burn, freeze, paralysis, toxic)
    u8 state;          // 0x7, ROAMER_STATE_*
    u16 zone;          // 0x8, its route's first zone, or ROAMERS_ZONE_NONE
    u16 timer;         // 0xa, the seconds left before it moves
    u32 personality;   // 0xc
    u32 ivs;           // 0x10, six 5-bit IVs as PokeParty_CreatePkm takes them
    u8 nature;         // 0x14
    u8 flags;          // 0x15, ROAMER_FLAG_*
    u16 knockedOutDay; // 0x16, the day it was knocked out (days since 2000-01-01)
} Roamer;              // 0x18

// The roamers' save, in the World Trade block (SAVE_BLOCK_WORLDTRADE, 0xf8 bytes), which only the GTS used: its code
// is a shell (docs/paperwhite2/design/wireless-shells.md) and never reaches it. A block without the magic and version
// (the GTS's zeros, an old save) is cleared
typedef struct {
    u32 magic;   // 0x0
    u16 version; // 0x4
    // The roamer whose battle runs, from the roll to the battle's end, else ROAMERS_NONE
    u8 battleSlot; // 0x6
    // The debug menu's Freeze movement
    u8 frozen; // 0x7
    // The clock (seconds since 2000-01-01) when the roamers' timers were last counted, 0 before the first time
    u32 lastSeconds; // 0x8
    // The player's zone then
    u16 playerZone;                     // 0xc
    u16 unused;                         // 0xe
    Roamer roamers[ROAMERS_SAVE_SLOTS]; // 0x10
    u8 reserved[0xf8 - 0xd0];           // 0xd0
} RoamersSave;                          // 0xf8, the World Trade block's size

// The roamers' save, cleared first if it isn't theirs
RoamersSave *Roamers_GetSave(GameData *gameData);
const RoamerData *Roamers_GetData(u32 roamer);
// The route of a zone (an index of ROAMERS_ROUTES), or ROAMERS_NONE
u32 Roamers_GetRoute(u32 zoneId);

// Releases roamer, a group (ROAMERS_TARGET_GROUP + ROAMER_GROUP_*) or all (ROAMERS_TARGET_ALL), each that isn't
// released yet, onto a free route; returns how many
u32 Roamers_Release(GameData *gameData, u32 target);
// Counts the time since the last count on the roamers' clocks, the player having been in the zone of the last count,
// moves those whose time is up and brings back those knocked out on another day; then the player is in zoneId. Every
// zone change calls it (ZoneChange_OnMapChange and the field's seamless change), and every field that opens
// (ZoneChange_OnFieldLoad), which is how a continued save counts the time the game was off
void PaperWhite2_Roamers_OnZoneChange(GameData *gameData, u32 zoneId);
// After a battle (EventBattleCall_SyncGameDataOnReturn): a roamer's battle keeps its HP and status, or it is caught or
// knocked out; one that is left roaming scatters
void PaperWhite2_Roamers_OnBattleEnd(GameData *gameData, BtlSetup *setup);
// GetDefaultWeatherValue's weather: a roaming roamer's on its route, else WEATHER_NONE
u32 PaperWhite2_Roamers_GetWeather(GameData *gameData, u32 zoneId);
// Makes a roamer's PID, IVs and nature again, as at its release and its return
void Roamers_Reroll(GameData *gameData, Roamer *roamer);
// Moves a roaming roamer at least links links away (more when every route that near is taken), off the player's
// route; returns whether it found one
BOOL Roamers_Move(GameData *gameData, u32 slot, u32 links);
// Today, in days since 2000-01-01, by the clock
u32 Roamers_GetToday(void);

// The roll (src/paperwhite2/ov036/paperwhite2_roamers_field.c): at a step's encounter in zoneId of type encType, the
// roaming roamer there if its methods take encType, the Repel doesn't keep it off and its odds come up, which becomes
// the battle's roamer; else ROAMERS_NONE
u32 PaperWhite2_Roamers_Roll(EncountManager *manager, u32 zoneId, u32 encType);
// Makes the battle's Pokémon of a roamer's slot: species, form, level, PID, IVs, nature, then HP and status
void PaperWhite2_Roamers_MakePkm(PartyPkm *pkm, GameData *gameData, u32 slot, u32 trainerId);

// The script command (0x2f9): Roamers action, arg1, arg2, result, a ROAMERS_ACTION_* of paperwhite2/roamer_actions.h
BOOL Scrcmd_PaperWhite2_Roamers(VM *vm, FieldScriptEnv *env);

// The debug menu's (src/paperwhite2/ov012/paperwhite2_debug_commands.c): a roamer to the player's route (FALSE when
// the player isn't on one of its routes, or it was caught); healed (and back if knocked out); every knocked out one
// back now; every roamer unreleased; and the clocks of all run out, so that the next zone change moves them
BOOL Roamers_DebugBringHere(GameData *gameData, u32 slot);
void Roamers_DebugHeal(GameData *gameData, u32 slot);
u32 Roamers_DebugRespawn(GameData *gameData);
void Roamers_DebugReset(GameData *gameData);
void Roamers_DebugExpireTimers(GameData *gameData);

#endif // POKEBW2_PAPERWHITE2_ROAMERS_H
