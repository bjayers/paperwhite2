#include "types.h"
#include "constants/vars.h"
#include "gfl/random.h"
#include "nitro/rtc.h"
#include "paperwhite2/season.h"
#include "save/event_work.h"
#include "system/game_data.h"
#include "system/season.h"

// Paper White 2: the seasons by the player's setting, in ARM9 main beside the original's season.c, since the field,
// the map changes and the Pokédex all ask for the season

// The setting's event work: the mode in the low bits, the hemisphere above them
#define SEASON_SETTING_WORK EVENT_WORK_SEASON_SETTING
#define SEASON_SETTING_MODE_MASK 0xf
#define SEASON_SETTING_SOUTHERN (1 << 4)

#define DAYS_PER_WEEK 7
// 2000-01-01, the first day RTC_ConvertDateToDay counts, is a Saturday, so the Monday before it is 5 days earlier
#define DAYS_FROM_MONDAY_TO_FIRST_DAY 5

// The season on the first of each month, by the equinoxes and solstices: the season of March, June, September and
// December changes on the 21st
static const u8 SEASON_AT_MONTH_START[12] = {
    SEASON_WINTER, SEASON_WINTER, SEASON_WINTER, SEASON_SPRING, SEASON_SPRING, SEASON_SPRING,
    SEASON_SUMMER, SEASON_SUMMER, SEASON_SUMMER, SEASON_AUTUMN, SEASON_AUTUMN, SEASON_AUTUMN,
};
#define SEASON_CHANGE_DAY 21

static u16 *PaperWhite2_GetSeasonSetting(GameData *gameData);
static u32 PaperWhite2_GetDayNumber(const RTCDate *date);
static u8 PaperWhite2_GetSeasonOfSolstices(const RTCDate *date);

u8 PaperWhite2_GetSeasonMode(GameData *gameData) {
    u8 mode = *PaperWhite2_GetSeasonSetting(gameData) & SEASON_SETTING_MODE_MASK;

    if (mode >= SEASON_MODE_COUNT) {
        return SEASON_MODE_MONTHLY;
    }
    return mode;
}

void PaperWhite2_SetSeasonMode(GameData *gameData, u8 mode) {
    u16 *setting = PaperWhite2_GetSeasonSetting(gameData);

    *setting = (*setting & ~SEASON_SETTING_MODE_MASK) | (mode & SEASON_SETTING_MODE_MASK);
}

u8 PaperWhite2_GetSeasonHemisphere(GameData *gameData) {
    if (*PaperWhite2_GetSeasonSetting(gameData) & SEASON_SETTING_SOUTHERN) {
        return HEMISPHERE_SOUTHERN;
    }
    return HEMISPHERE_NORTHERN;
}

void PaperWhite2_SetSeasonHemisphere(GameData *gameData, u8 hemisphere) {
    u16 *setting = PaperWhite2_GetSeasonSetting(gameData);

    if (hemisphere == HEMISPHERE_SOUTHERN) {
        *setting |= SEASON_SETTING_SOUTHERN;
    } else {
        *setting &= ~SEASON_SETTING_SOUTHERN;
    }
}

u8 PaperWhite2_GetSeasonOfDate(u8 mode, u8 hemisphere, const RTCDate *date) {
    u8 season;

    switch (mode) {
    case SEASON_MODE_SPRING:
    case SEASON_MODE_SUMMER:
    case SEASON_MODE_AUTUMN:
    case SEASON_MODE_WINTER:
        return mode - SEASON_MODE_SPRING;
    case SEASON_MODE_WEEKLY:
        // The weeks from Monday to Sunday, counted from the one that 2000-01-01 is in
        return (PaperWhite2_GetDayNumber(date) + DAYS_FROM_MONDAY_TO_FIRST_DAY) / DAYS_PER_WEEK % SEASON_COUNT;
    case SEASON_MODE_DAILY:
        return PaperWhite2_GetDayNumber(date) % SEASON_COUNT;
    case SEASON_MODE_REAL_TIME:
        season = PaperWhite2_GetSeasonOfSolstices(date);
        if (hemisphere == HEMISPHERE_SOUTHERN) {
            // Spring and autumn change places, and summer and winter
            season = (season + SEASON_COUNT / 2) % SEASON_COUNT;
        }
        return season;
    default:
        return (date->month - 1) % SEASON_COUNT;
    }
}

u8 PaperWhite2_GetCurrentSeason(GameData *gameData) {
    u8 mode = PaperWhite2_GetSeasonMode(gameData);
    RTCDate date;

    if (mode == SEASON_MODE_CHAOS) {
        return GameData_GetSeason(gameData);
    }
    RTC_GetCachedDate(&date);
    return PaperWhite2_GetSeasonOfDate(mode, PaperWhite2_GetSeasonHemisphere(gameData), &date);
}

u8 PaperWhite2_GetSeasonForMapChange(GameData *gameData) {
    if (PaperWhite2_GetSeasonMode(gameData) == SEASON_MODE_CHAOS) {
        return GFL_RandomLC(SEASON_COUNT);
    }
    return PaperWhite2_GetCurrentSeason(gameData);
}

u8 PaperWhite2_GetSeasonBanner(GameData *gameData) {
    switch (PaperWhite2_GetSeasonMode(gameData)) {
    case SEASON_MODE_CHAOS:
        return SEASON_BANNER_NONE;
    case SEASON_MODE_REAL_TIME:
        return SEASON_BANNER_WALK;
    default:
        return SEASON_BANNER_SINGLE;
    }
}

u8 PaperWhite2_GetSeasonBannerStart(GameData *gameData, u8 startSeason, u8 endSeason) {
    if (PaperWhite2_GetSeasonBanner(gameData) == SEASON_BANNER_WALK) {
        return startSeason;
    }
    return endSeason;
}

static u16 *PaperWhite2_GetSeasonSetting(GameData *gameData) {
    return EventWork_GetWkPtr(GameData_GetEventWork(gameData), SEASON_SETTING_WORK);
}

// The days since 2000-01-01. A date that RTC_ConvertDateToDay refuses, which the clock doesn't give, counts as that day
static u32 PaperWhite2_GetDayNumber(const RTCDate *date) {
    s32 day = RTC_ConvertDateToDay(date);

    if (day < 0) {
        return 0;
    }
    return day;
}

static u8 PaperWhite2_GetSeasonOfSolstices(const RTCDate *date) {
    u8 season = SEASON_AT_MONTH_START[date->month - 1];

    if (date->month % 3 == 0 && date->day >= SEASON_CHANGE_DAY) {
        season = Season_GetNext(season);
    }
    return season;
}
