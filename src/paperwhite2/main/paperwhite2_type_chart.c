#include "types.h"
#include "paperwhite2/type_chart.h"

// Paper White 2: the battle's type chart (btl_calc.c's original table), in ARM9 main for the battle and the Pokédex's
// Matchups (paperwhite2/type_chart.h). Rows are the attacking types, columns the defending ones, both in the types'
// order: Normal, Fighting, Flying, Poison, Ground, Rock, Bug, Ghost, Steel, Fire, Water, Grass, Electric, Psychic,
// Ice, Dragon, Dark
const u8 PaperWhite2_TypeChart[TYPE_CHART_SIZE][TYPE_CHART_SIZE] = {
    { 4, 4, 4, 4, 4, 2, 4, 0, 2, 4, 4, 4, 4, 4, 4, 4, 4 }, { 8, 4, 2, 2, 4, 8, 2, 0, 8, 4, 4, 4, 4, 2, 8, 4, 8 },
    { 4, 8, 4, 4, 4, 2, 8, 4, 2, 4, 4, 8, 2, 4, 4, 4, 4 }, { 4, 4, 4, 2, 2, 2, 4, 2, 0, 4, 4, 8, 4, 4, 4, 4, 4 },
    { 4, 4, 0, 8, 4, 8, 2, 4, 8, 8, 4, 2, 8, 4, 4, 4, 4 }, { 4, 2, 8, 4, 2, 4, 8, 4, 2, 8, 4, 4, 4, 4, 8, 4, 4 },
    { 4, 2, 2, 2, 4, 4, 4, 2, 2, 2, 4, 8, 4, 8, 4, 4, 8 }, { 0, 4, 4, 4, 4, 4, 4, 8, 2, 4, 4, 4, 4, 8, 4, 4, 2 },
    { 4, 4, 4, 4, 4, 8, 4, 4, 2, 2, 2, 4, 2, 4, 8, 4, 4 }, { 4, 4, 4, 4, 4, 2, 8, 4, 8, 2, 2, 8, 4, 4, 8, 2, 4 },
    { 4, 4, 4, 4, 8, 8, 4, 4, 4, 8, 2, 2, 4, 4, 4, 2, 4 }, { 4, 4, 2, 2, 8, 8, 2, 4, 2, 2, 8, 2, 4, 4, 4, 2, 4 },
    { 4, 4, 8, 4, 0, 4, 4, 4, 4, 4, 8, 2, 2, 4, 4, 2, 4 }, { 4, 8, 4, 8, 4, 4, 4, 4, 2, 4, 4, 4, 4, 2, 4, 4, 0 },
    { 4, 4, 8, 4, 8, 4, 4, 4, 2, 2, 2, 8, 4, 4, 2, 8, 4 }, { 4, 4, 4, 4, 4, 4, 4, 4, 2, 4, 4, 4, 4, 4, 4, 8, 4 },
    { 4, 2, 4, 4, 4, 4, 4, 8, 2, 4, 4, 4, 4, 8, 4, 4, 2 },
};
