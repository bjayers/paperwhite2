#include "types.h"
#include "gfl/heap.h"
#include "nitro/mi.h"
#include "paperwhite2/habitat_dex.h"

// Paper White 2: the Habitat Dex's list for the Pokédex's page of a Pokémon (paperwhite2/habitat_dex.h), in main so
// that the Habitat List (overlay 303) can leave it for the Pokédex (overlay 302) when it opens a Pokémon's page

static u16 sInfoSpecies[HABITAT_DEX_LIST_MAX];
static u16 sInfoCount;

void PaperWhite2_HabitatDex_SetInfoList(const u16 *species, u32 count) {
    if (count > HABITAT_DEX_LIST_MAX) {
        count = HABITAT_DEX_LIST_MAX;
    }
    MI_CpuCopy8(species, sInfoSpecies, count * sizeof(u16));
    sInfoCount = count;
}

u32 PaperWhite2_HabitatDex_TakeInfoList(u16 **list, HeapID heapId) {
    u32 count = sInfoCount;

    if (count == 0) {
        return 0;
    }
    *list = GFL_HeapAllocate(heapId, count * sizeof(u16), TRUE, "paperwhite2_habitat_dex_info.c", __LINE__);
    MI_CpuCopy8(sInfoSpecies, *list, count * sizeof(u16));
    sInfoCount = 0;
    return count;
}
