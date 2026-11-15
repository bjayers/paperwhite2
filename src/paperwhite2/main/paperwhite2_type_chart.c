#include "types.h"
#include "paperwhite2/type_chart.h"

// Paper White 2: the battle's type chart (btl_calc.c's original table), in ARM9 main for the battle and the Pokédex's
// Matchups (paperwhite2/type_chart.h). Rows are the attacking types, columns the defending ones, both in the types'
// order: Normal, Fighting, Flying, Poison, Ground, Rock, Bug, Ghost, Steel, Fire, Water, Grass, Electric, Psychic,
// Ice, Dragon, Dark, TYPE_NULL's unused row and column (all normal), Fairy. Changed from the original: Fairy's row and
// column (Gen 6's), and Ghost and Dark normal against Steel (Gen 6's, the original has them half)
// clang-format off
const u8 PaperWhite2_TypeChart[TYPE_CHART_SIZE][TYPE_CHART_SIZE] = {
    { 4, 4, 4, 4, 4, 2, 4, 0, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4 }, // Normal
    { 8, 4, 2, 2, 4, 8, 2, 0, 8, 4, 4, 4, 4, 2, 8, 4, 8, 4, 2 }, // Fighting
    { 4, 8, 4, 4, 4, 2, 8, 4, 2, 4, 4, 8, 2, 4, 4, 4, 4, 4, 4 }, // Flying
    { 4, 4, 4, 2, 2, 2, 4, 2, 0, 4, 4, 8, 4, 4, 4, 4, 4, 4, 8 }, // Poison
    { 4, 4, 0, 8, 4, 8, 2, 4, 8, 8, 4, 2, 8, 4, 4, 4, 4, 4, 4 }, // Ground
    { 4, 2, 8, 4, 2, 4, 8, 4, 2, 8, 4, 4, 4, 4, 8, 4, 4, 4, 4 }, // Rock
    { 4, 2, 2, 2, 4, 4, 4, 2, 2, 2, 4, 8, 4, 8, 4, 4, 8, 4, 2 }, // Bug
    { 0, 4, 4, 4, 4, 4, 4, 8, 4, 4, 4, 4, 4, 8, 4, 4, 2, 4, 4 }, // Ghost
    { 4, 4, 4, 4, 4, 8, 4, 4, 2, 2, 2, 4, 2, 4, 8, 4, 4, 4, 8 }, // Steel
    { 4, 4, 4, 4, 4, 2, 8, 4, 8, 2, 2, 8, 4, 4, 8, 2, 4, 4, 4 }, // Fire
    { 4, 4, 4, 4, 8, 8, 4, 4, 4, 8, 2, 2, 4, 4, 4, 2, 4, 4, 4 }, // Water
    { 4, 4, 2, 2, 8, 8, 2, 4, 2, 2, 8, 2, 4, 4, 4, 2, 4, 4, 4 }, // Grass
    { 4, 4, 8, 4, 0, 4, 4, 4, 4, 4, 8, 2, 2, 4, 4, 2, 4, 4, 4 }, // Electric
    { 4, 8, 4, 8, 4, 4, 4, 4, 2, 4, 4, 4, 4, 2, 4, 4, 0, 4, 4 }, // Psychic
    { 4, 4, 8, 4, 8, 4, 4, 4, 2, 2, 2, 8, 4, 4, 2, 8, 4, 4, 4 }, // Ice
    { 4, 4, 4, 4, 4, 4, 4, 4, 2, 4, 4, 4, 4, 4, 4, 8, 4, 4, 0 }, // Dragon
    { 4, 2, 4, 4, 4, 4, 4, 8, 4, 4, 4, 4, 4, 8, 4, 4, 2, 4, 2 }, // Dark
    { 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4 }, // (none)
    { 4, 8, 4, 2, 4, 4, 4, 4, 2, 2, 4, 4, 4, 4, 4, 8, 8, 4, 4 }, // Fairy
};
// clang-format on
