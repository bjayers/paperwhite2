#include "types.h"
#include "constants/battle.h"
#include "nitro/os.h"
#include "paperwhite2/battle_weather.h"
#include "system/zone_weather.h"

// Paper White 2: the battle weather's state, in ARM9 main since the battle (overlay 167), the battle's event
// (overlay 12), the zone's weather (zone_weather.c, main) and the field (overlay 36) all reach it. See
// include/paperwhite2/battle_weather.h

// The system timer ticks every 64 cycles of the system clock
#define TICKS_PER_SECOND (OS_SYSTEM_CLOCK / 64)

typedef struct {
    // The weather the last battle ended with, a BTL_WEATHER_*
    u8 battleEnd;
    // The field weather, a WEATHER_*, or WEATHER_MAX when there is none
    u8 weather;
    u16 zoneId;
    // When it started, in system timer ticks
    u64 startTick;
} BattleWeather;

static BattleWeather sBattleWeather = { BTL_WEATHER_NONE, WEATHER_MAX, 0, 0 };

void PaperWhite2_BattleWeather_SetBattleEnd(u32 btlWeather) {
    sBattleWeather.battleEnd = btlWeather;
}

u32 PaperWhite2_BattleWeather_TakeBattleEnd(void) {
    u32 btlWeather = sBattleWeather.battleEnd;

    sBattleWeather.battleEnd = BTL_WEATHER_NONE;
    return btlWeather;
}

void PaperWhite2_BattleWeather_Start(u32 weather, u32 zoneId) {
    sBattleWeather.weather = weather;
    sBattleWeather.zoneId = zoneId;
    sBattleWeather.startTick = OS_GetTick();
}

BOOL PaperWhite2_BattleWeather_HasExpired(void) {
    if (sBattleWeather.weather == WEATHER_MAX) {
        return FALSE;
    }
    return OS_GetTick() - sBattleWeather.startTick >= (u64)BATTLE_WEATHER_SECONDS * TICKS_PER_SECOND;
}

u32 PaperWhite2_BattleWeather_Get(u32 zoneId) {
    if (sBattleWeather.weather == WEATHER_MAX) {
        return WEATHER_NONE;
    }
    if (zoneId != sBattleWeather.zoneId || PaperWhite2_BattleWeather_HasExpired()) {
        sBattleWeather.weather = WEATHER_MAX;
        return WEATHER_NONE;
    }
    return sBattleWeather.weather;
}
