#include "types.h"
#include "constants/arc.h"
#include "constants/text_banks.h"
#include "gfl/msg.h"
#include "gfl/str.h"
#include "paperwhite2/pokemon_forms_config.h"
#include "paperwhite2/species.h"
#include "save/pokedex_savedata.h"
#include "system/printsys.h"
#include "text/system/btl_server_flow_title.h"

// Paper White 2: the Pokédex's numbering of the added species (include/paperwhite2/species.h,
// docs/paperwhite2/design/new-species.md section 5): their display numbers, and their place in the National list,
// after Genesect by display number, where they show once seen. Without added species nothing calls these, so they
// aren't built and the ROM is the one before them

#if PAPERWHITE2_SPECIES_ADDED_COUNT != 0
// Each added species' display number, from the first
static const u16 sDisplayNumbers[PAPERWHITE2_SPECIES_ADDED_COUNT + 1] = { PAPERWHITE2_POKEDEX_DISPLAY_NUMBERS };
// The added species of the National list, in its order
static const u16 sAddedOrder[PAPERWHITE2_POKEDEX_ADDED_COUNT + 1] = { PAPERWHITE2_POKEDEX_ADDED_ORDER };
// The room between a list row's number and its name, as the original's 3 digits leave before the name
#define LIST_NAME_GAP 10

u16 PaperWhite2_GetAddedDisplayNumber(u32 species) {
    if (!PaperWhite2_IsAddedSpecies(species)) {
        return PAPERWHITE2_POKEDEX_NUMBER_NONE;
    }
    return sDisplayNumbers[species - PAPERWHITE2_SPECIES_FIRST_ADDED];
}

void PaperWhite2_PokedexLoadNumberNone(StrBuf *strbuf, HeapID heapId) {
    MsgData *msgData = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_BTL_SERVER_FLOW_TITLE, heapId);

    GFL_MsgDataLoadStrbuf(msgData, BtlServerFlowTitle_Text_Empty_173, strbuf);
    GFL_MsgDataFree(msgData);
}

u32 PaperWhite2_PokedexListNameX(const StrBuf *number, Font *font, u32 x) {
    u32 end = GFL_FontGetBlockWidth(number, font, 0) + LIST_NAME_GAP;

    return end > x ? end : x;
}

void PaperWhite2_PokedexAddSpecies(u16 *list) {
    u32 i;

    for (i = 0; i < PAPERWHITE2_POKEDEX_ADDED_COUNT; i++) {
        list[i] = sAddedOrder[i];
    }
}

u32 PaperWhite2_PokedexHideUnseen(PokeDexSave *pokedex, u16 *list, u32 count) {
    u32 shown = SPECIES_GENESECT;
    u32 i;

    for (i = SPECIES_GENESECT; i < count; i++) {
        if (PokeDex_IsSeen(pokedex, list[i]) == TRUE || PokeDex_IsCaught(pokedex, list[i]) == TRUE) {
            list[shown++] = list[i];
        }
    }
    return shown;
}

u16 PaperWhite2_PokedexGetCaughtOriginal(PokeDexSave *pokedex) {
    u16 count = 0;
    u32 species;

    for (species = 1; species <= SPECIES_GENESECT; species++) {
        if (PokeDex_IsCaught(pokedex, species) == TRUE) {
            count++;
        }
    }
    return count;
}
#endif
