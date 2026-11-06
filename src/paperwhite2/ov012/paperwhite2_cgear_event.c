#include "types.h"
#include "constants/flags.h"
#include "constants/items.h"
#include "field/app_call.h"
#include "field/field.h"
#include "field/field_actor.h"
#include "field/field_menu.h"
#include "field/field_script_event.h"
#include "field/hidden_event.h"
#include "field/itemuse_event.h"
#include "field/player_state.h"
#include "field/subscreen.h"
#include "field/zone.h"
#include "gfl/heap.h"
#include "gfl/std.h"
#include "paperwhite2/cgear_event.h"
#include "save/bag.h"
#include "save/event_work.h"
#include "system/game_data.h"
#include "system/game_event.h"
#include "system/game_system.h"

// Paper White 2: the C-Gear's markers open the field's apps. See include/paperwhite2/cgear_event.h

typedef struct {
    GameSystem *gsys;
    Field *field;
    u16 code;
    FieldAppCallInput input;
} CGearAppEvent;

// The field menu's script for an app's result 5
#define CGEAR_APP_RESULT_SCRIPT 0x2a01

BOOL PaperWhite2_CGearEvent_CanOpen(GameSystem *gsys, s32 appId) {
    GameData *gameData = GSYS_GetGameData(gsys);
    EventWork *eventWork = GameData_GetEventWork(gameData);
    BagSave *bag = GameData_GetBag(gameData);

    switch (appId) {
    case FIELD_APP_POKEDEX:
        return EventWork_FlagGet(eventWork, EVENT_FLAG_0x0962);
    case FIELD_APP_POKELIST:
        return EventWork_FlagGet(eventWork, EVENT_FLAG_0x0961);
    case FIELD_APP_BAG:
        return !IsZoneBlackTowerOrWhiteTreehollow(PlayerState_GetZoneID(GSYS_GetPlayerState(gsys)));
    case FIELD_APP_DEXNAV:
        return BagSave_GetItemCountByID(bag, ITEM_POKE_RADAR, HEAPID_GAMEEVENT) != 0;
    case FIELD_APP_TOWNMAP:
        return BagSave_GetItemCountByID(bag, ITEM_TOWN_MAP, HEAPID_GAMEEVENT) != 0;
    case FIELD_APP_SAVE: {
        // Where the field menu has no Save
        u16 zoneId = PlayerState_GetZoneID(GSYS_GetPlayerState(gsys));

        return !GetZoneIsUnionRoom(zoneId) && !IsZone150Or151(zoneId) && !IsZoneRoyalUnova(zoneId) &&
               !GameData_IsForceSeasonSync(gameData);
    }
    }
    return FALSE;
}

static GameEventReturnCode PaperWhite2_CGearEvent_Main(GameEvent *event, u32 *state, void *data) {
    CGearAppEvent *work = data;
    FieldAppCallInput *input = &work->input;
    PlayerActionPossibilities possibilities;
    HiddenEventArgs args;
    GameEvent *next;

    switch (*state) {
    case 0:
        GameEvent_ChainNext(event, EventFieldAppCall_Create(input, work->code));
        *state = 1;
        break;
    case 1:
        // The app call opened the field again
        work->field = GSYS_GetField(work->gsys);
        switch (input->eventType) {
        case 2:
            *state = 2;
            break;
        case 3:
            *state = 3;
            break;
        case 5:
            *state = 4;
            break;
        default:
            EnableAllActorsMovement(Field_GetActorSystem(work->field));
            // Saving's No changes the touch screen to the field menu, which it came from in the original
            if (input->appId == FIELD_APP_SAVE && input->eventType == 0) {
                GameEvent_Replace(event, EventFieldMenuReturn_Create(work->gsys, work->field, 0));
                return GAMEEVENT_CONTINUE;
            }
            return GAMEEVENT_DONE;
        }
        break;
    case 2:
        // A field move chosen in the party
        EnableAllActorsMovement(Field_GetActorSystem(work->field));
        CalcPlayerActionPossibilities(work->field, &possibilities);
        HiddenEventArgs_Set(&args, input->partySlot, input->eventId, input->eventValue);
        next = CreateHMEvent(input->eventId, &args, &possibilities);
        if (next == NULL) {
            return GAMEEVENT_DONE;
        }
        GameEvent_Replace(event, next);
        break;
    case 3:
        // An item used from the bag
        EnableAllActorsMovement(Field_GetActorSystem(work->field));
        GameEvent_Replace(event, CallFieldCommonEventFunc(input->eventId, work->gsys, work->field));
        break;
    case 4:
        if (FieldSubscreen_IsReady(Field_GetSubscreen(work->field))) {
            EnableAllActorsMovement(Field_GetActorSystem(work->field));
            GameEvent_Replace(
                event, EventScriptCall_Create(work->gsys, CGEAR_APP_RESULT_SCRIPT, NULL, Field_GetHeapID(work->field)));
        }
        break;
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *PaperWhite2_CGearEvent_Create(GameSystem *gsys, Field *field, s32 appId) {
    GameEvent *event = GameEvent_Create(gsys, NULL, PaperWhite2_CGearEvent_Main, sizeof(CGearAppEvent));
    CGearAppEvent *work = GameEvent_GetData(event);

    MI_CpuFill8(work, 0, sizeof(CGearAppEvent));
    work->gsys = gsys;
    work->field = field;
    work->code = Field_GetHeapID(field);
    work->input.gameSystem = gsys;
    work->input.field = field;
    work->input.parent = event;
    work->input.appId = appId;
    work->input.appParam = -1;
    DisableAllActorsMovement(Field_GetActorSystem(field));
    return event;
}
