#ifndef PAPERWHITE2_DEXNAV_EVENT_H
#define PAPERWHITE2_DEXNAV_EVENT_H

#include "types.h"
#include "field/app_call.h"

// Paper White 2: the DexNav as one of the field's apps (FIELD_APP_DEXNAV of FIELD_PROC_LINK_LIST,
// src/ov012/event_field_proclink.c): its param and result (src/paperwhite2/ov012/paperwhite2_dexnav_event.c). The bag's
// Use gives BAG_RESULT_DEXNAV (src/ov142/itemmenu.c), which opens it, and Y opens it as SHORTCUT_DEXNAV

// The bag's result for the DexNav's Use, after the original's results
#define BAG_RESULT_DEXNAV 40

void *PaperWhite2_FieldAppCall_CreateDexnavParam(FieldAppCallWork *work, s32 appParam, s32 prevAppId,
                                                 const void *prevParam);
u32 PaperWhite2_FieldAppCall_GetDexnavResult(FieldAppCallWork *work, void *param);

#endif // PAPERWHITE2_DEXNAV_EVENT_H
