#include "types.h"
#include "constants/bag.h"
#include "field/zone.h"
#include "paperwhite2/entralink_run_state.h"
#include "save/bag.h"
#include "system/game_data.h"
#include "system/zone_weather.h"

// Paper White 2: the Entralink run's state and its bag (paperwhite2/entralink_run_state.h)

static EntralinkRunState sRunState;
// The run's bag, the game's bag while a run is on
static BagSave sRunBag;
// The real bag, in the save's bag block, while the run's is the game's; NULL otherwise
static BagSave *sRealBag;

EntralinkRunState *EntralinkRun_GetState(void) {
    return &sRunState;
}

u32 EntralinkRun_GetFieldWeather(u32 zoneId) {
    if (sRunState.room == 0 || !GetZoneIsEntreeForest(zoneId) ||
        sRunState.fieldWeather == ENTRALINK_FIELD_WEATHER_ZONE) {
        return WEATHER_NONE;
    }
    return sRunState.fieldWeather;
}

BOOL EntralinkRun_IsCatchable(u32 pid) {
    u32 i;

    for (i = 0; i < ENTRALINK_RUN_ENEMIES_MAX; i++) {
        if (sRunState.catchIds[i] != ENTRALINK_CATCH_NONE && sRunState.catchPids[i] == pid) {
            return TRUE;
        }
    }
    return FALSE;
}

void EntralinkRun_SetCaught(u32 pid) {
    sRunState.caughtPid = pid;
    sRunState.caught = TRUE;
}

void EntralinkRun_KeepBag(GameData *gameData) {
    if (sRealBag != NULL) {
        return;
    }
    BagSave_Init(&sRunBag);
    sRealBag = GameData_GetBag(gameData);
    PaperWhite2_GameData_SetBag(gameData, &sRunBag);
}

void EntralinkRun_RestoreBag(GameData *gameData) {
    if (sRealBag == NULL) {
        return;
    }
    PaperWhite2_GameData_SetBag(gameData, sRealBag);
    sRealBag = NULL;
    BagSave_Init(&sRunBag);
}

BOOL EntralinkRun_IsRunBag(BagSave *bag) {
    return bag == &sRunBag;
}

u32 EntralinkRun_GetRunBagPocketMax(u32 pocket) {
    switch (pocket) {
    case BAG_POCKET_ITEMS:
        return ENTRALINK_RUN_BAG_ITEMS;
    case BAG_POCKET_MEDICINE:
        return ENTRALINK_RUN_BAG_MEDICINE;
    case BAG_POCKET_BERRIES:
        return ENTRALINK_RUN_BAG_BERRIES;
    default:
        return 0;
    }
}
