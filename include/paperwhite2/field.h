#ifndef PAPERWHITE2_FIELD_H
#define PAPERWHITE2_FIELD_H

#include "types.h"

// Paper White 2: the hack's code in the field's overlay 36 (src/paperwhite2/ov036/paperwhite2_field.c)

// Gives the field's frame counter's next value. Field_CallRoutines calls it every frame, as the example of a call from
// the game's code into the hack's (docs/paperwhite2/plugins.md)
u32 PaperWhite2_NextFieldFrame(u32 frames);

#endif // PAPERWHITE2_FIELD_H
