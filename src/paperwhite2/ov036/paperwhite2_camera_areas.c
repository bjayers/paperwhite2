#include "constants/arc.h"
#include "field/zone.h"
#include "gfl/arc.h"
#include "paperwhite2/camera_areas.h"

// Paper White 2: which camera area file a zone has, from data rather than ZONE_CAMERA_ASSIGNMENTS, so that the
// editor can give a zone camera areas: the last file of the camera areas' archive is a u16 count, then a u16 zone and
// a u16 file for each zone that has a file (tools/data/camera_data.py archive, from res/field/cameras/areas/)

u16 PaperWhite2_GetCameraIDForZone(u16 zoneId, HeapID heapId) {
    ArcTool *arc = GFL_ArcSysCreateFileHandle(ARCID_FIELD_CAMERA_MAP_PARAM, heapId);
    u32 table = GFL_ArcToolGetDataMax(arc) - 1;
    u16 result = ZONE_CAMERA_NONE;
    u16 count;
    u16 entry[2];
    u32 i;

    // The zone the version swaps in, as GetCameraIDForZone looks it up
    zoneId = GetVersionedMapChangeZoneNum2(zoneId);
    GFL_ArcToolReadRange(arc, table, 0, sizeof(count), &count);
    for (i = 0; i < count; i++) {
        GFL_ArcToolReadRange(arc, table, sizeof(count) + i * sizeof(entry), sizeof(entry), entry);
        if (entry[0] == zoneId) {
            result = entry[1];
            break;
        }
    }
    GFL_ArcToolFree(arc);
    return result;
}
