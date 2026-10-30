#ifndef PAPERWHITE2_DEBUG_H
#define PAPERWHITE2_DEBUG_H

#include "types.h"
#include "field/enc_pokeset.h"
#include "struct_decls.h"

// Paper White 2: the debug menu's overrides (src/paperwhite2/main/paperwhite2_debug.c), which its script commands set
// (src/paperwhite2/ov012/paperwhite2_debug_commands.c) and the game's hooks read, in main, in overlay 12 and in overlay
// 36. They are kept in RAM, not in the save, so a reset turns them all off. The menu's toggles are event flags instead
// (EVENT_FLAG_DEBUG_*, docs/paperwhite2/plugins.md's Flags), which the save keeps. Under PAPERWHITE2_DEBUG_MENU

#ifdef PAPERWHITE2_DEBUG_MENU
// The overrides, each a value or DEBUG_OVERRIDE_OFF
enum {
    // A DAY_PERIOD_* (system/rtc.h) for the time of day
    DEBUG_OVERRIDE_DAY_PERIOD,
    // A WEATHER_* (system/zone_weather.h) for every zone's weather
    DEBUG_OVERRIDE_WEATHER,
    // The species of every random wild encounter
    DEBUG_OVERRIDE_WILD_SPECIES,
    // The level of every random wild encounter
    DEBUG_OVERRIDE_WILD_LEVEL,
    // The season mode (a SEASON_MODE_*, paperwhite2/season.h) that Force season replaced, which Off sets again
    DEBUG_OVERRIDE_SAVED_SEASON_MODE,
    DEBUG_OVERRIDE_COUNT,
};

// An override that is off
#define DEBUG_OVERRIDE_OFF 0xffff

u16 PaperWhite2_Debug_GetOverride(u32 override);
void PaperWhite2_Debug_SetOverride(u32 override, u16 value);
// The time of day: the period the game computed, or the override's (GetRealTimeDayPeriod, system/rtc.c)
u16 PaperWhite2_Debug_GetDayPeriod(u16 period);
// The seconds of the day that the field's lights follow: the game's, or with a time of day override half an hour into
// that period's first hour in the season (Field_Create and Field_Draw3D's FieldLight_Update, ov036/fieldmap.c)
s32 PaperWhite2_Debug_GetDaySeconds(u32 season, s32 seconds);
// Whether the debug menu's Walk through walls is on
BOOL PaperWhite2_Debug_IsWalkingThroughWalls(GameData *gameData);
// The collision of the player's next step with Walk through walls on: only the bits of kept, which leave the rail's
// end blocking. hit as the game computed it otherwise
u32 PaperWhite2_Debug_FilterPlayerHit(GameData *gameData, u32 hit, u32 kept);
// Sets the species and the level overrides on the wild Pokémon of a random encounter, before they are made
// (EventWildBattleCall_CreateRandom, ov036/field_encount.c)
void PaperWhite2_Debug_OverrideWilds(WildPkmParam *params, int count);
#endif

#endif // PAPERWHITE2_DEBUG_H
