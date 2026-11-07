#ifndef POKEBW2_PAPERWHITE2_TYPE_CHART_H
#define POKEBW2_PAPERWHITE2_TYPE_CHART_H

#include "types.h"

// Paper White 2: the type chart, moved from the battle's overlay (btl_calc.c) to ARM9 main so that the Pokédex can read
// it too (src/paperwhite2/main/paperwhite2_type_chart.c)

// The types the chart has, TYPE_NORMAL to TYPE_DARK (constants/types.h); a new type (Fairy) would make it 18
#define TYPE_CHART_SIZE 17

// The damage of a move of each attacking type, the first index, against each defending type, in quarters: 0 (none), 2
// (half), 4 (normal) or 8 (double)
#define TYPE_CHART_NORMAL 4

extern const u8 PaperWhite2_TypeChart[TYPE_CHART_SIZE][TYPE_CHART_SIZE];

#endif // POKEBW2_PAPERWHITE2_TYPE_CHART_H
