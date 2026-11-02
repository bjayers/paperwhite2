#ifndef PAPERWHITE2_AMBIENTS_H
#define PAPERWHITE2_AMBIENTS_H

#include "types.h"
#include "struct_decls.h"

// Paper White 2: the ambients, sprites drawn without an actor on paths round their places
// (src/paperwhite2/ov036/paperwhite2_ambients.c; their records in paperwhite2/spawns.h)

// The zone's ambients made when the zone or the field is new, and moved and animated; the field's update calls it every
// frame, after the actors' update
void PaperWhite2_AmbientsUpdate(Field *field);

#endif // PAPERWHITE2_AMBIENTS_H
