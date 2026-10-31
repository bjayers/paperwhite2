#ifndef PAPERWHITE2_BOOT_SCREEN_H
#define PAPERWHITE2_BOOT_SCREEN_H

#include "types.h"
#include "gfl/heap.h"

// Paper White 2: the hack's own boot screen, after the copyright notice (src/ov162/boot_screens.c), its art in
// ARCID_COPYRIGHT's members 9 to 13 (res/graphics/copyright/, the target "boot_extra" of res/paperwhite2/art/). While
// its palette is all black it has no art, and the boot screens skip it

// Whether the screen has art, from its palette
BOOL PaperWhite2_BootScreen_HasArt(HeapID heapId);

// Loads its art into the boot screens' BGs, 1 on the main engine and 5 on the sub engine
void PaperWhite2_BootScreen_Load(HeapID heapId);

#endif // PAPERWHITE2_BOOT_SCREEN_H
