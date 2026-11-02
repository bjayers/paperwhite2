#ifndef PAPERWHITE2_FIELD_H
#define PAPERWHITE2_FIELD_H

#include "types.h"
#include "struct_decls.h"

// Paper White 2: the hack's code in the field's overlay 36 (src/paperwhite2/ov036/paperwhite2_field.c)

// Gives the field's frame counter's next value. Field_CallRoutines calls it every frame, as the example of a call from
// the game's code into the hack's (docs/paperwhite2/plugins.md)
u32 PaperWhite2_NextFieldFrame(u32 frames);

// The zone's NPC spawns picked again when the hour or the time of day changes, and the NPCs out of the camera's view
// changed (src/paperwhite2/ov036/paperwhite2_spawns_field.c); called every frame, after the actors' update
void PaperWhite2_SpawnsUpdate(Field *field);

#endif // PAPERWHITE2_FIELD_H
