#ifndef PAPERWHITE2_BATTLE_WEATHER_H
#define PAPERWHITE2_BATTLE_WEATHER_H

#include "types.h"

// Paper White 2: a battle's weather that stays in the field afterwards
// (src/paperwhite2/main/paperwhite2_battle_weather.c and src/paperwhite2/ov012/paperwhite2_battle_weather_event.c,
// docs/paperwhite2/plugins.md, Battle weather). When a battle ends with a weather that a move or an ability set, the
// zone has that weather, over its own, until the player leaves the zone, the time below runs out, or another battle
// ends with another weather. It lives in RAM only, so saving and loading drop it

// How long the battle's weather stays, in seconds of real time
#define BATTLE_WEATHER_SECONDS (5 * 60)

// Main: the battle's weather at its end, a BTL_WEATHER_* (constants/battle.h), from overlay 167, and taking it once
// the battle has returned
void PaperWhite2_BattleWeather_SetBattleEnd(u32 btlWeather);
u32 PaperWhite2_BattleWeather_TakeBattleEnd(void);
// Main: the zone has the field weather weather, a WEATHER_* (system/zone_weather.h), from now
void PaperWhite2_BattleWeather_Start(u32 weather, u32 zoneId);
// Main: the zone's battle weather, or WEATHER_NONE once the player is in another zone or the time is up, which also
// ends it. GetWeatherAll asks it first
u32 PaperWhite2_BattleWeather_Get(u32 zoneId);
// Main: whether a battle weather is on and its time is up, which the field checks every frame
BOOL PaperWhite2_BattleWeather_HasExpired(void);

// Overlay 12: after a battle, before the zone's weather is reset, starts the battle's weather in the zone if it ended
// with one other than the one it started with (the field's) and the zone is outdoors
void PaperWhite2_BattleWeather_OnBattleReturn(u32 zoneId, u32 startBtlWeather);

#endif // PAPERWHITE2_BATTLE_WEATHER_H
