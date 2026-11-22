#include "types.h"
#include "field/entree_forest.h"
#include "field/field.h"
#include "field/field_script_event.h"
#include "field/intrude_work.h"
#include "field/player_state.h"
#include "field/zone.h"
#include "struct_decls.h"
#include "system/game_system.h"
#ifdef PAPERWHITE2
#include "paperwhite2/entralink_ranks.h"
#include "paperwhite2/entralink_run.h"
#endif

// Where the warp leads
static const VecFx32 sWarpPos = { FX32_CONST(248), 0, FX32_CONST(376) };

GameEvent *CheckEntralinkForestFirstWarpEvent(Field *field, GameSystem *gsys, FieldPlayer *player) {
    u16 zoneId;
    VecFx32 playerPos;
    VecFx32 warpPos;
    s32 i;
    fx32 startX;
#ifdef PAPERWHITE2
    GameEvent *event;
#endif

    zoneId = PlayerState_GetZoneID(GSYS_GetPlayerState(gsys));
    Intrude_GetCommWork(GSYS_GetGameCommSystem(gsys));
    if (!IsZoneEntralinkHub(zoneId)) {
        return NULL;
    }
    FieldPlayer_GetWPos(player, &playerPos);
    for (i = 0; i < 3; i++) {
        if (playerPos.x >= (0x7e << 14) + (i << 22) && playerPos.x <= (0x7e << 14) + (i << 22) &&
            playerPos.z >= (0xb2 << 14) && playerPos.z <= (0xb2 << 14)) {
            return EventScriptCall_Create(gsys, 0xe, NULL, Field_GetHeapID(field));
        }
    }
    startX = (0x7e << 14);
    for (i = 0; i < 3; i++, startX += (1 << 22)) {
        if (playerPos.x >= startX && playerPos.x < startX + (2 << 16) && playerPos.z == (0x56 << 14)) {
            warpPos = sWarpPos;
            warpPos.x += playerPos.x - startX;
#ifdef PAPERWHITE2
            // Paper White 2: the forest is the Entralink roguelike's run now, which starts here
            // (paperwhite2/entralink_run.h); with the skip_round reward a script asks whether to skip round 1 first,
            // and warps (paperwhite2/entralink_ranks.h)
            event = EntralinkRanks_CreateRunStartEvent(gsys, &warpPos, Field_GetHeapID(field));
            if (event != NULL) {
                return event;
            }
            EntralinkRun_Start(GSYS_GetGameData(gsys), FALSE);
#endif
            return EventEntreeForestWarp_Create(gsys, 1, &warpPos, 0, 4);
        }
    }
    return NULL;
}
