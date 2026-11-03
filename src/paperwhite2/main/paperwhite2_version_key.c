#include "types.h"
#include "constants/places.h"
#include "field/player_state.h"
#include "field/zone.h"
#include "paperwhite2/version_key.h"
#include "save/key_info.h"
#include "save/save_control.h"
#include "system/game_data.h"

// Paper White 2: the Version Key's state (paperwhite2/version_key.h), the save's city key, which the bag, the field's
// event, the map's loading and Opelucid City's scripts read

static KeyInfoSave *VersionKey_GetKeyInfo(GameData *gameData) {
    return getKeyInfoSaveBlk(GameData_GetSaveControl(gameData));
}

BOOL PaperWhite2_IsVersionSwitched(GameData *gameData) {
    return KeyInfo_GetCityKey(VersionKey_GetKeyInfo(gameData)) != 0;
}

BOOL PaperWhite2_IsBlackVersionWorld(GameData *gameData) {
#ifdef BLACK2
    return !PaperWhite2_IsVersionSwitched(gameData);
#else
    return PaperWhite2_IsVersionSwitched(gameData);
#endif
}

BOOL PaperWhite2_ToggleVersion(GameData *gameData) {
    CityState *city = GameData_GetMyCityState(gameData);

    KeyInfo_SetCityKey(VersionKey_GetKeyInfo(gameData), !PaperWhite2_IsVersionSwitched(gameData));
    // The city the field plays, as CityState_InitFromSave sets it from the key when the game starts
    city->city = PaperWhite2_IsBlackVersionWorld(gameData) ? CITY_BLACK_CITY : CITY_WHITE_FOREST;
    return PaperWhite2_IsBlackVersionWorld(gameData);
}

BOOL PaperWhite2_ScriptSeesOtherVersion(GameData *gameData) {
    u16 place;

    if (!PaperWhite2_IsVersionSwitched(gameData)) {
        return FALSE;
    }
    place = ZoneData_GetPlaceNameID(PlayerState_GetZoneID(GameData_GetPlayerState(gameData)));
    return place == PLACE_OPELUCID_CITY || place == PLACE_OPELUCID_CITY_2;
}
