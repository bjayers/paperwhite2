#include "types.h"
#include "field/player_state.h"
#include "field/zone.h"
#include "paperwhite2/version_key.h"
#include "paperwhite2/version_places.h"
#include "system/game_data.h"

// Paper White 2: the Version Key's state (paperwhite2/version_key.h): every place of paperwhite2/version_places.h at
// once, which the bag, the field's event and the scripts read

BOOL PaperWhite2_IsBlackVersionWorld(GameData *gameData) {
    return PaperWhite2_AreAllPlacesBlack2(GameData_GetEventWork(gameData));
}

BOOL PaperWhite2_ToggleVersion(GameData *gameData) {
    EventWork *eventWork = GameData_GetEventWork(gameData);
    BOOL black2 = !PaperWhite2_AreAllPlacesBlack2(eventWork);
    u32 place;

    for (place = 0; place < VERSION_PLACE_COUNT; place++) {
        PaperWhite2_SetPlaceBlack2(eventWork, place, black2);
    }
    // The city the field plays, as CityState_InitFromSave sets it from the flag when the game starts
    GameData_GetMyCityState(gameData)->city = black2 ? CITY_BLACK_CITY : CITY_WHITE_FOREST;
    return black2;
}

BOOL PaperWhite2_ScriptSeesOtherVersion(GameData *gameData) {
    return PaperWhite2_IsZoneBlack2(GameData_GetEventWork(gameData),
                                    PlayerState_GetZoneID(GameData_GetPlayerState(gameData)));
}
