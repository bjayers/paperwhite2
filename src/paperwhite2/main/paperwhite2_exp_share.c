#include "types.h"
#include "constants/flags.h"
#include "constants/items.h"
#include "paperwhite2/exp_share.h"
#include "save/bag.h"
#include "save/event_work.h"
#include "system/game_data.h"

// Paper White 2: the Exp. Share's state, which the bag, the Y button's script and the battle's experience read

BOOL PaperWhite2_IsExpShareOn(GameData *gameData) {
    if (gameData == NULL) {
        return FALSE;
    }
    if (!BagSave_CheckAmount(GameData_GetBag(gameData), ITEM_EXP_SHARE, 1, 0)) {
        return FALSE;
    }
    return !EventWork_FlagGet(GameData_GetEventWork(gameData), EVENT_FLAG_EXP_SHARE_OFF);
}

BOOL PaperWhite2_ToggleExpShare(GameData *gameData) {
    EventWork *eventWork = GameData_GetEventWork(gameData);

    if (EventWork_FlagGet(eventWork, EVENT_FLAG_EXP_SHARE_OFF)) {
        EventWork_FlagReset(eventWork, EVENT_FLAG_EXP_SHARE_OFF);
        return TRUE;
    }
    EventWork_FlagSet(eventWork, EVENT_FLAG_EXP_SHARE_OFF);
    return FALSE;
}
