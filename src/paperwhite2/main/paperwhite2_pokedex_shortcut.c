#include "types.h"
#include "app/p_status.h"
#include "app/pokedex_detail.h"
#include "constants/pokemon.h"
#include "paperwhite2/pokedex_shortcut.h"
#include "paperwhite2/species.h"
#include "pml/poke_party.h"

// Paper White 2: the Pokémon that the Pokédex's detail screen steps through when the party screen, the summary or the
// PC box's summary opens it, which the field app call (overlay 12) and the box (overlay 255) both build. See
// include/paperwhite2/pokedex_shortcut.h

void PaperWhite2_PokedexShortcutList_Init(PokedexShortcutList *list, GameData *gameData) {
    list->detail.gameData = gameData;
    list->detail.page = POKEDEX_DETAIL_PAGE_INFO;
    list->detail.list = list->species;
    list->detail.count = 0;
    list->detail.index = 0;
    list->detail.mode = 0;
    list->detail.pokemon = list->pokemon;
}

void PaperWhite2_PokedexShortcutList_Add(PokedexShortcutList *list, BoxPkm *pkm, u8 slot, u8 openedSlot) {
    u16 count = list->detail.count;

    // A species that never enters the Pokédex has no page there (paperwhite2/species.h)
    if (count >= POKEDEX_SHORTCUT_LIST_MAX || !PML_PkmGetParam(pkm, PKM_PARAM_SPECIES_VALID, NULL) ||
        PML_PkmGetParam(pkm, PKM_PARAM_IS_EGG, NULL) ||
        PaperWhite2_IsNotInPokedex(PML_PkmGetParam(pkm, PKM_PARAM_SPECIES, NULL))) {
        return;
    }
    if (slot == openedSlot) {
        list->detail.index = count;
    }
    list->species[count] = PML_PkmGetParam(pkm, PKM_PARAM_SPECIES, NULL);
    list->pokemon[count].form = PML_PkmGetParam(pkm, PKM_PARAM_FORM, NULL);
    list->pokemon[count].sex = PML_PkmGetParam(pkm, PKM_PARAM_SEX, NULL);
    list->pokemon[count].rare = PML_PkmIsRare(pkm);
    list->pokemon[count].personality = PML_PkmGetParam(pkm, PKM_PARAM_PID, NULL);
    list->slots[count] = slot;
    list->detail.count = count + 1;
}

u8 PaperWhite2_PokedexShortcutList_GetSlot(const PokedexShortcutList *list) {
    return list->slots[list->detail.index];
}

void PaperWhite2_PokedexShortcutList_SetSummaryPokemon(const PokedexShortcutList *list, PStatusParam *summary) {
    u8 slot = PaperWhite2_PokedexShortcutList_GetSlot(list);

    // The ribbons' page is only for a Pokémon with ribbons, which the summary steps to; another one opens on its info
    if (slot != summary->partyIndex && summary->page == PSTATUS_PAGE_RIBBON) {
        summary->page = PSTATUS_PAGE_INFO;
    }
    summary->partyIndex = slot;
}
