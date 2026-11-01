#ifndef PAPERWHITE2_CAMERA_AREAS_H
#define PAPERWHITE2_CAMERA_AREAS_H

#include "types.h"
#include "gfl/heap.h"

// Paper White 2: the camera area file of a zone (archive ARCID_FIELD_CAMERA_MAP_PARAM's number), or
// ZONE_CAMERA_NONE, from the archive's last file, the table that tools/data/camera_data.py packs from
// res/field/cameras/areas/'s zones in place of ZONE_CAMERA_ASSIGNMENTS (GetCameraIDForZone)
u16 PaperWhite2_GetCameraIDForZone(u16 zoneId, HeapID heapId);

#endif // PAPERWHITE2_CAMERA_AREAS_H
