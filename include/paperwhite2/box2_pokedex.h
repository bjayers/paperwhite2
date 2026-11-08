#ifndef POKEBW2_PAPERWHITE2_BOX2_POKEDEX_H
#define POKEBW2_PAPERWHITE2_BOX2_POKEDEX_H

#include "types.h"
#include "app/box2_main.h"
#include "app/p_status.h"
#include "gfl/heap.h"

// Paper White 2: the PC box's summary opens the Pokédex's detail screen on the info page of the Pokémon shown, by its
// INFO button or START, inside the box's own screens (src/paperwhite2/ov255/paperwhite2_box2_pokedex.c). Up and Down
// step through the box's Pokémon (or the party's, for the party's summary) without the eggs and the empty slots, and
// back from it the summary opens again on the Pokémon last shown. See paperwhite2/pokedex_shortcut.h

// The summary's sub proc, the first of box2_seq.c's sSubProcs
#define BOX2_SUBPROC_PSTATUS 0

// The summary's param, first in the work that also holds the Pokédex's list; zeroed, with fromFieldMenu
// PSTATUS_FROM_BOX
PStatusParam *PaperWhite2_Box2Pokedex_CreateSummaryParam(HeapID heapId);
// Once the summary's sub proc has ended: opens the Pokédex's page if the summary ended with INFO, or the summary again
// once the page has ended, and returns TRUE; FALSE when the summary was left for the box
BOOL PaperWhite2_Box2Pokedex_Continue(Box2SysWork *syswk);

#endif // POKEBW2_PAPERWHITE2_BOX2_POKEDEX_H
