#include "types.h"
#include "field/event_mapchange.h"
#include "field/field.h"
#include "field/field_actor.h"
#include "field/field_controller.h"
#include "field/field_event.h"
#include "field/field_player.h"
#include "field/field_script_event.h"
#include "field/player_state.h"
#include "field/zone.h"
#include "gfl/heap.h"
#include "nitro/fx.h"
#include "paperwhite2/version_key.h"
#include "system/game_data.h"
#include "system/game_event.h"
#include "system/game_system.h"

// Paper White 2: the field's event of the Version Key (paperwhite2/version_key.h), which the bag and the Y button's
// shortcut start. It switches Unova and says so, then fades out, loads the map again where the player stands and fades
// back in, as the other version's, in the zone that the place is now. Only where a map change keeps the player as they
// are: walking on the grid, in a normal zone; anywhere else it says it can't be used, and switches nothing

typedef struct {
    GameSystem *gsys;
    Field *field;
    VecFx32 pos;
    u16 zoneId;
    u16 dir;
} VersionKeyWork;

// Whether the map can be loaded again where the player stands
static BOOL VersionKey_CanReload(GameSystem *gsys, Field *field) {
    return Field_GetResolvedControllerTypeID(field) == FIELDMAP_CTRL_TYPE_GRID &&
           FieldPlayer_GetExState(Field_GetPlayer(field)) == 0 &&
           IsZoneNormal(PlayerState_GetZoneID(GSYS_GetPlayerState(gsys)));
}

static GameEventReturnCode VersionKey_Callback(GameEvent *event, u32 *state, void *data) {
    VersionKeyWork *work = data;
    GameData *gameData = GSYS_GetGameData(work->gsys);
    FieldPlayer *player;

    switch (*state) {
    case 0:
        if (!VersionKey_CanReload(work->gsys, work->field)) {
            GameEvent_Replace(event,
                              EventScriptCall_Create(work->gsys, SCRID_VERSION_KEY_NOT_HERE, NULL, HEAPID_FIELDMAP));
            return GAMEEVENT_CONTINUE;
        }
        player = Field_GetPlayer(work->field);
        FieldPlayer_GetWPos(player, &work->pos);
        work->dir = GetActorFaceDir(FieldPlayer_GetActor(player));
        // The zone the place is in after the switch: the one it stands in for, as the other version has it
        work->zoneId = PaperWhite2_GetUnversionedZone(PlayerState_GetZoneID(GSYS_GetPlayerState(work->gsys)));
        PaperWhite2_ToggleVersion(gameData);
        CityState_ApplyVersionZones(GameData_GetMyCityState(gameData));
        work->zoneId = GetVersionedMapChangeZoneNum2(work->zoneId);
        GameEvent_ChainNext(event,
                            EventScriptCall_Create(work->gsys,
                                                   PaperWhite2_IsBlackVersionWorld(gameData) ? SCRID_VERSION_KEY_BLACK
                                                                                             : SCRID_VERSION_KEY_WHITE,
                                                   NULL, HEAPID_FIELDMAP));
        (*state)++;
        break;
    case 1:
        GameEvent_ChainNext(
            event, CallFieldMapEntranceOutTransitionDefault(work->gsys, work->field, FIELD_TRANSITION_FADE_BLACK, 0));
        (*state)++;
        break;
    case 2:
        GameEvent_ChainNext(
            event, EventMapChange_CreateGridDefault(work->gsys, work->field, work->zoneId, &work->pos, work->dir));
        (*state)++;
        break;
    case 3:
        // (the map change leaves the screen black, for the caller's own way in)
        GameEvent_ChainNext(event, CallFieldMapEntranceInTransition(work->gsys, GSYS_GetField(work->gsys),
                                                                    FIELD_TRANSITION_FADE_BLACK, 0, 1, 0, 0));
        (*state)++;
        break;
    case 4:
        return GAMEEVENT_DONE;
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *PaperWhite2_EventVersionKey_Create(Field *field, GameSystem *gsys) {
    GameEvent *event = GameEvent_Create(gsys, NULL, VersionKey_Callback, sizeof(VersionKeyWork));
    VersionKeyWork *work = GameEvent_GetData(event);

    work->gsys = gsys;
    work->field = field;
    return event;
}
