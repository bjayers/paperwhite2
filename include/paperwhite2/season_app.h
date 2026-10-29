#ifndef PAPERWHITE2_SEASON_APP_H
#define PAPERWHITE2_SEASON_APP_H

#include "types.h"
#include "gfl/proc.h"

// Paper White 2: the Season app (src/paperwhite2/ov312/paperwhite2_season_app.c), which the Pokémon Centers' globe
// opens in Geonet's place, in Geonet's overlay (OVERLAY_GEONET, app/geonet.h). The process takes the game data, as
// Geonet's does, and sets the season setting of paperwhite2/season.h

extern const GameProcFunctions SEASON_APP_PROC_FUNCTIONS;

#endif // PAPERWHITE2_SEASON_APP_H
