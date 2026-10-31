#include "types.h"
#include "field/app_call.h"
#include "gfl/heap.h"
#include "paperwhite2/dexnav.h"
#include "paperwhite2/dexnav_event.h"
#include "paperwhite2/encounters.h"
#include "system/game_system.h"

// Paper White 2: the DexNav as one of the field's apps, beside the field app call in overlay 12. See
// include/paperwhite2/dexnav_event.h

// The app takes the game data and the field's context that EventFieldAppCall_Callback saved as the field closed
void *PaperWhite2_FieldAppCall_CreateDexnavParam(FieldAppCallWork *work, s32 appParam, s32 prevAppId,
                                                 const void *prevParam) {
    DexnavParam *param =
        GFL_HeapAllocate(HEAPID_GAMEEVENT, sizeof(DexnavParam), TRUE, "paperwhite2_dexnav_event.c", __LINE__);

    param->gameData = GSYS_GetGameData(work->input->gameSystem);
    param->ctx = *PaperWhite2_Encounters_GetViewContext();
    return param;
}

// Back to the field
u32 PaperWhite2_FieldAppCall_GetDexnavResult(FieldAppCallWork *work, void *param) {
    return 1;
}
