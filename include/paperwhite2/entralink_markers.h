#ifndef PAPERWHITE2_ENTRALINK_MARKERS_H
#define PAPERWHITE2_ENTRALINK_MARKERS_H

#include "types.h"
#include "gfl/g3d.h"
#include "struct_decls.h"

// Paper White 2: the Entralink run's markers (src/paperwhite2/ov036/paperwhite2_entralink_markers.c): on the ground in
// front of a done room's forward doors, what is behind each (paperwhite2/entralink_run.h's EntralinkRun_GetDoorMarker),
// and over an NPC its icon. A billboard system of their own, made in the field's heap the first time a run's room needs
// it and freed with the field's 3D (FieldG3D_Free), drawn with the field's effects

// Makes, changes and places the markers of the run's room; the field's update calls it every frame
void PaperWhite2_EntralinkMarkersUpdate(Field *field);
// Draws them, in the field's effects pass (FieldG3D_RenderFieldmap)
void PaperWhite2_EntralinkMarkersDraw(G3DCamera *camera, G3DLight *lights);
// Frees them and their textures, with the field's billboard systems
void PaperWhite2_EntralinkMarkersFree(void);

#endif // PAPERWHITE2_ENTRALINK_MARKERS_H
