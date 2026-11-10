#ifndef POKEBW2_FIELD_CALENDER_H
#define POKEBW2_FIELD_CALENDER_H

// Overlay 12's calender.c: the weather of the zones whose weather follows the date. Names from swan
// (https://github.com/ds-pokemon-hacking/swan, GPL-3.0)

#include "types.h"
#include "gfl/arc.h"
#include "gfl/heap.h"
#include "struct_decls.h"

// A zone with weather by date, and where its year of weather starts in the archive's first file
typedef struct {
    u16 zoneId;
    u16 offset;
} CalendarZone;

struct Calendar {
    HeapID heapId;
    GameData *gameData;
    ArcTool *arc;
#ifdef PAPERWHITE2
    // Paper White 2: the table's count of zones, whose entries each query reads from the archive (calender.c), in
    // place of the original's 24 entries in RAM
    u16 zoneCount;
#else
    CalendarZone zones[24];
#endif
};

Calendar *Calendar_Create(GameData *gameData, HeapID heapId);
void Calendar_Free(Calendar *calendar);
u16 Calendar_GetWeather(Calendar *calendar, u16 zoneId);

#endif // POKEBW2_FIELD_CALENDER_H
