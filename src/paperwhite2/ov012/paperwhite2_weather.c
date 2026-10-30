#include "types.h"
#include "field/ev_time.h"
#include "nitro/rtc.h"
#include "paperwhite2/conditions.h"
#include "paperwhite2/weather.h"
#include "system/game_data.h"
#include "system/season.h"

// Paper White 2: the weather's date, in overlay 12 beside the original's calender.c, which calls it

#define MONTHS_PER_YEAR 12

// The calendar's days of each month, February with its 29th, as Calendar_GetDayOfYear counts them
static const u8 CALENDAR_MONTH_DAYS[MONTHS_PER_YEAR] = { 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };

void PaperWhite2_GetWeatherDate(GameData *gameData, u8 *month, u8 *day) {
    RTCDate *date = getAddressAdventureTimeBlk(gameData);
    s32 dayNumber = RTC_ConvertDateToDay(date);
    u8 season = GameData_GetSeason(gameData) % SEASON_COUNT;
    u32 seasonDays = 0;
    u32 pick;
    u32 i;

    if (dayNumber < 0) {
        // A date that RTC_ConvertDateToDay refuses, which the clock doesn't give: the original's date
        *month = GameData_GetMonth(gameData);
        *day = GameData_GetDay(gameData);
        return;
    }
    // The season's months are the original's, (month - 1) % SEASON_COUNT: spring is January, May and September
    for (i = season; i < MONTHS_PER_YEAR; i += SEASON_COUNT) {
        seasonDays += CALENDAR_MONTH_DAYS[i];
    }
    // A number that looks random but that the day and the season always give the same (the conditions' hash)
    pick = Conditions_Hash(dayNumber, season) % seasonDays;
    for (i = season; pick >= CALENDAR_MONTH_DAYS[i]; i += SEASON_COUNT) {
        pick -= CALENDAR_MONTH_DAYS[i];
    }
    *month = i + 1;
    *day = pick + 1;
}
