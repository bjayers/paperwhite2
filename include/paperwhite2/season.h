#ifndef PAPERWHITE2_SEASON_H
#define PAPERWHITE2_SEASON_H

#include "types.h"
#include "nitro/rtc.h"
#include "struct_decls.h"

// Paper White 2: the seasons by the player's setting (src/paperwhite2/main/paperwhite2_season.c), in place of the
// original's season by the month. The setting is event work EVENT_WORK_SEASON_SETTING, which the original game doesn't use:
// its low four bits are the mode and bit 4 the hemisphere (docs/paperwhite2/plugins.md, Seasons)

// The season setting's modes. A value past the last is taken as monthly
enum {
    // The original's season, by the month: spring in January, May and September, and so on
    SEASON_MODE_MONTHLY,
    // One season, which never changes
    SEASON_MODE_SPRING,
    SEASON_MODE_SUMMER,
    SEASON_MODE_AUTUMN,
    SEASON_MODE_WINTER,
    // A new season each Monday
    SEASON_MODE_WEEKLY,
    // A new season each day, at midnight
    SEASON_MODE_DAILY,
    // The season of the date in the hemisphere: it changes on the 21st of March, June, September and December
    SEASON_MODE_REAL_TIME,
    // A random season, drawn again at each map change with a loading screen into an exterior
    SEASON_MODE_CHAOS,
    SEASON_MODE_COUNT,
};

// The hemisphere of the real-time mode, whose seasons the southern one turns around
enum {
    HEMISPHERE_NORTHERN,
    HEMISPHERE_SOUTHERN,
};

// How a change of season shows on a map change
enum {
    // No banner: the season changes all the same
    SEASON_BANNER_NONE,
    // One banner, of the new season
    SEASON_BANNER_SINGLE,
    // The original's banners of every season from the one after the saved one to the new one
    SEASON_BANNER_WALK,
};

u8 PaperWhite2_GetSeasonMode(GameData *gameData);
// Sets the mode and keeps the hemisphere. The new mode's season comes at the next map change with a loading screen
// into an exterior, as the original's monthly one does
void PaperWhite2_SetSeasonMode(GameData *gameData, u8 mode);
u8 PaperWhite2_GetSeasonHemisphere(GameData *gameData);
void PaperWhite2_SetSeasonHemisphere(GameData *gameData, u8 hemisphere);
// The season of a date in a mode, for every mode but chaos, which is the monthly one here
u8 PaperWhite2_GetSeasonOfDate(u8 mode, u8 hemisphere, const RTCDate *date);
// The season now, by the setting and the clock; for chaos the one the game has. It replaces the original's
// Season_GetRealTime wherever the game asks for the season it should have
u8 PaperWhite2_GetCurrentSeason(GameData *gameData);
// The season a map change with a loading screen moves to: the current one, or for chaos a new draw. Only
// GameData_GetSeasons calls it
u8 PaperWhite2_GetSeasonForMapChange(GameData *gameData);
// How the setting's mode shows a change of season: no banner for chaos, the walk for real time, else one banner
u8 PaperWhite2_GetSeasonBanner(GameData *gameData);
// The first season a banner shows, given the original's first and last: its first for the walk, else its last
u8 PaperWhite2_GetSeasonBannerStart(GameData *gameData, u8 startSeason, u8 endSeason);

#endif // PAPERWHITE2_SEASON_H
