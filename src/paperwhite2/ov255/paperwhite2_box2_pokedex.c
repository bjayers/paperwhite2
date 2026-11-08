#include "types.h"
#include "app/box2.h"
#include "app/box2_main.h"
#include "app/p_status.h"
#include "app/pokedex_detail.h"
#include "field/field_sound.h"
#include "gfl/heap.h"
#include "gfl/overlay.h"
#include "gfl/proc.h"
#include "paperwhite2/box2_pokedex.h"
#include "paperwhite2/pokedex_shortcut.h"
#include "pml/poke_party.h"
#include "system/game_data.h"

// Paper White 2: the Pokédex's detail screen from the PC box's summary, run by the box's proc manager between the
// summary's two runs. See include/paperwhite2/box2_pokedex.h

// The overlay of the Pokédex's list, whose code the detail screen's Area page uses (PokedexCommon_StartGlow)
#define OVERLAY_POKEDEX OVERLAY_ID(302)

// The music's volume while the page shows, for the cries, as the Pokédex has it, and its frames to fade
#define DUCKED_VOLUME 64
#define FULL_VOLUME 127
#define VOLUME_FADE_FRAMES 6

typedef struct {
    PStatusParam summary;
    PokedexShortcutList list;
    BOOL showingPokedex;
} Box2PokedexWork;

PStatusParam *PaperWhite2_Box2Pokedex_CreateSummaryParam(HeapID heapId) {
    Box2PokedexWork *work =
        GFL_HeapAllocate(heapId, sizeof(Box2PokedexWork), TRUE, "paperwhite2_box2_pokedex.c", __LINE__);

    work->summary.fromFieldMenu = PSTATUS_FROM_BOX;
    return &work->summary;
}

BOOL PaperWhite2_Box2Pokedex_Continue(Box2SysWork *syswk) {
    Box2PokedexWork *work = syswk->subProcWork;
    FieldSound *fieldSound = GameData_GetFieldSoundSystem(syswk->param->gameData);
    BoxPkm *pkm;
    u32 i;

    // Back from the page, the summary on the Pokémon last shown
    if (work->showingPokedex == TRUE) {
        work->showingPokedex = FALSE;
        GFL_OvlUnload(OVERLAY_POKEDEX);
        FieldSnd_SetPlayerVolumeFade(fieldSound, FULL_VOLUME, VOLUME_FADE_FRAMES);
        PaperWhite2_PokedexShortcutList_SetSummaryPokemon(&work->list, &work->summary);
        work->summary.result = PSTATUS_RESULT_BACK;
        QueueGameProc(syswk->procManager, OVERLAY_PSTATUS, &PSTATUS_PROC_FUNCTIONS, &work->summary);
        return TRUE;
    }
    if (work->summary.result != PSTATUS_RESULT_POKEDEX) {
        return FALSE;
    }

    PaperWhite2_PokedexShortcutList_Init(&work->list, syswk->param->gameData);
    for (i = 0; i < work->summary.partyCount; i++) {
        if (work->summary.dataType == PSTATUS_DATA_BOX) {
            pkm = (BoxPkm *)((u8 *)work->summary.party + PML_GetPkmRawSize() * i);
        } else {
            pkm = PokeParty_GetBoxPkm(PokeParty_GetPkm(work->summary.party, i));
        }
        PaperWhite2_PokedexShortcutList_Add(&work->list, pkm, i, work->summary.partyIndex);
    }
    FieldSnd_SetPlayerVolumeFade(fieldSound, DUCKED_VOLUME, VOLUME_FADE_FRAMES);
    GFL_OvlLoad(OVERLAY_POKEDEX);
    QueueGameProc(syswk->procManager, OVERLAY_POKEDEX_DETAIL, &POKEDEX_DETAIL_PROC_FUNCTIONS, &work->list.detail);
    work->showingPokedex = TRUE;
    return TRUE;
}
