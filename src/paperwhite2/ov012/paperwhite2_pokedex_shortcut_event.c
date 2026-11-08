#include "types.h"
#include "app/p_status.h"
#include "app/pokedex_detail.h"
#include "app/pokelist.h"
#include "field/app_call.h"
#include "field/field_sound.h"
#include "gfl/heap.h"
#include "gfl/overlay.h"
#include "gfl/std.h"
#include "paperwhite2/pokedex_shortcut.h"
#include "pml/poke_party.h"
#include "system/game_data.h"
#include "system/game_system.h"

// Paper White 2: the Pokédex's detail screen on a party Pokémon's info page, as one of the field's apps, beside the
// field app call in overlay 12. See include/paperwhite2/pokedex_shortcut.h

// The overlay of the Pokédex's list, whose code the detail screen's Area page uses (PokedexCommon_StartGlow)
#define OVERLAY_POKEDEX OVERLAY_ID(302)

// The list first, whose detail screen's param the screen and FieldProcLink_FreeParam take. The list is the party's
// Pokémon but its eggs; the screen it was opened from is opened again from what is kept here
typedef struct {
    PokedexShortcutList list;
    // The screen to go back to, FIELD_APP_POKELIST or FIELD_APP_POKESTATUS, and the summary's param as it was
    s32 returnApp;
    PStatusParam summary;
} PokedexShortcutParam;

void *PaperWhite2_FieldAppCall_CreatePokedexInfoParam(FieldAppCallWork *work, s32 appParam, s32 prevAppId,
                                                      const void *prevParam) {
    PokedexShortcutParam *param = GFL_HeapAllocate(HEAPID_GAMEEVENT, sizeof(PokedexShortcutParam), TRUE,
                                                   "paperwhite2_pokedex_shortcut_event.c", __LINE__);
    GameData *gameData = GSYS_GetGameData(work->input->gameSystem);
    PokeParty *party;
    u8 openedSlot;
    u32 i;

    if (prevAppId == FIELD_APP_POKESTATUS) {
        const PStatusParam *summary = prevParam;

        param->summary = *summary;
        party = summary->party;
        openedSlot = summary->partyIndex;
    } else {
        const PokeListParam *list = prevParam;

        party = list->party;
        openedSlot = list->index;
    }
    param->returnApp = prevAppId;

    PaperWhite2_PokedexShortcutList_Init(&param->list, gameData);
    for (i = 0; i < PokeParty_GetPkmCount(party); i++) {
        PaperWhite2_PokedexShortcutList_Add(&param->list, PokeParty_GetBoxPkm(PokeParty_GetPkm(party, i)), i,
                                            openedSlot);
    }

    // As the Pokédex does, for the cries
    FieldSnd_DuckVolume(GameData_GetFieldSoundSystem(gameData), GameSystem_GetISS(work->input->gameSystem));
    GFL_OvlLoad(OVERLAY_POKEDEX);
    return param;
}

// Whatever the screen ended with (its return, X, or a place picked on the Area page's map), back to where it was
// opened from
u32 PaperWhite2_FieldAppCall_GetPokedexInfoResult(FieldAppCallWork *work, void *param_) {
    PokedexShortcutParam *param = param_;

    GFL_OvlUnload(OVERLAY_POKEDEX);
    FieldSnd_RestoreVolume(GameData_GetFieldSoundSystem(param->list.detail.gameData),
                           GameSystem_GetISS(work->input->gameSystem));
    work->nextAppId = param->returnApp;
    return FIELD_APP_RESULT_NEXT;
}

u32 PaperWhite2_PokedexShortcut_GetPartySlot(const void *param_) {
    const PokedexShortcutParam *param = param_;

    return PaperWhite2_PokedexShortcutList_GetSlot(&param->list);
}

void PaperWhite2_PokedexShortcut_RestoreSummary(PStatusParam *summary, const void *param_) {
    const PokedexShortcutParam *param = param_;

    *summary = param->summary;
    PaperWhite2_PokedexShortcutList_SetSummaryPokemon(&param->list, summary);
}
