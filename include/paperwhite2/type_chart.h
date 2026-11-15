#ifndef POKEBW2_PAPERWHITE2_TYPE_CHART_H
#define POKEBW2_PAPERWHITE2_TYPE_CHART_H

#include "types.h"
#include "constants/types.h"

// Paper White 2: the type chart, moved from the battle's overlay (btl_calc.c) to ARM9 main so that the Pokédex can read
// it too (src/paperwhite2/main/paperwhite2_type_chart.c), and grown for the Fairy type
// (docs/paperwhite2/design/fairy-type.md)

// The types the chart has, TYPE_NORMAL to TYPE_FAIRY (constants/types.h). TYPE_NULL's row and column, 17, are all
// normal and never read: GetTypeEffectiveness returns normal for TYPE_NULL first
#define TYPE_CHART_SIZE (TYPE_FAIRY + 1)

// The original types, TYPE_NORMAL to TYPE_DARK: the ones the saves' per-type records (the Medal Box's type medals, the
// PWT's Type Expert tournaments) and the original tables by type have
#define ORIGINAL_TYPE_COUNT TYPE_NULL

// The damage of a move of each attacking type, the first index, against each defending type, in quarters: 0 (none), 2
// (half), 4 (normal) or 8 (double)
#define TYPE_CHART_NORMAL 4

extern const u8 PaperWhite2_TypeChart[TYPE_CHART_SIZE][TYPE_CHART_SIZE];

// The types a screen shows, by slot: TYPE_NORMAL to TYPE_DARK in slots 0 to 16 and TYPE_FAIRY in slot 17, the one that
// TYPE_NULL has in the chart. An array of a screen's type icons has TYPE_SLOT_COUNT entries, indexed by slot
#define TYPE_SLOT_COUNT (ORIGINAL_TYPE_COUNT + 1)

// The slot of a type, TYPE_NORMAL to TYPE_DARK or TYPE_FAIRY
static inline u32 PaperWhite2_TypeSlot(u32 type) {
    return type == TYPE_FAIRY ? ORIGINAL_TYPE_COUNT : type;
}

// The type in a slot, 0 to TYPE_SLOT_COUNT - 1
static inline u32 PaperWhite2_SlotType(u32 slot) {
    return slot == ORIGINAL_TYPE_COUNT ? TYPE_FAIRY : slot;
}

#endif // POKEBW2_PAPERWHITE2_TYPE_CHART_H
