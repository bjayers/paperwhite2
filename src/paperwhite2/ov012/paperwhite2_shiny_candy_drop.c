#include "types.h"
#include "battle/btl_result.h"
#include "battle/btl_setup.h"
#include "field/field_script.h"
#include "field/field_script_event.h"
#include "gfl/heap.h"
#include "gfl/random.h"
#include "paperwhite2/shiny_candy.h"
#include "pml/poke_party.h"
#include "system/game_event.h"
#include "system/vm.h"

// Paper White 2: the Shiny Candy that a wild shiny Pokémon drops when the player defeats it, in overlay 12 beside
// the wild battle's event (event_battle.c) and the script system, which stay loaded through a script's battle

// What ScriptWork_AddVM gives when the script's three VMs are all in use
#define SCRIPT_VM_NONE 3

// Whether the last script's wild battle dropped a Shiny Candy, which its end of the battle gives
static BOOL sScriptDropPending;

static BOOL PaperWhite2_IsShinyCandyDropped(BOOL shinyFoe, u32 result);
static BOOL PaperWhite2_ScriptNative_StartShinyCandyDrop(VM *vm, void *data);

BOOL PaperWhite2_HasShinyFoe(BtlSetup *setup) {
    PokeParty *party = BtlSetup_GetParty(setup, 1);
    int count;
    int i;

    if (party == NULL) {
        return FALSE;
    }
    count = PokeParty_GetPkmCount(party);
    for (i = 0; i < count; i++) {
        if (PokeParty_IsRare(PokeParty_GetPkm(party, i))) {
            return TRUE;
        }
    }
    return FALSE;
}

void PaperWhite2_ShinyCandyDrop(GameEvent *event, BOOL shinyFoe, u32 result) {
    if (!PaperWhite2_IsShinyCandyDropped(shinyFoe, result)) {
        return;
    }
    GameEvent_ChainNext(
        event, EventScriptCall_Create(GameEvent_GetGameSystem(event), SCRID_SHINY_CANDY_DROP, NULL, HEAPID_FIELDMAP));
}

void PaperWhite2_ShinyCandyDropForScript(BOOL shinyFoe, u32 result) {
    sScriptDropPending = PaperWhite2_IsShinyCandyDropped(shinyFoe, result);
}

// The script's command waits on the fade in, the event it chained, then on this native callback, which calls the drop's
// script as RTCallGlobal does (Scrcmd_Vm_RTCallGlobal) and waits for it to end
void PaperWhite2_ShinyCandyDropAfterScriptBattle(VM *vm, FieldScriptEnv *env) {
    if (!sScriptDropPending) {
        return;
    }
    sScriptDropPending = FALSE;
    if (!FieldScriptEnv_IsReducedFeatureLevel(env)) {
        VM_SetNativeCallback(vm, PaperWhite2_ScriptNative_StartShinyCandyDrop);
    }
}

// Only a victory counts: the wild Pokémon fainted, rather than being caught or running away
static BOOL PaperWhite2_IsShinyCandyDropped(BOOL shinyFoe, u32 result) {
    return shinyFoe && result == BTL_RESULT_VICTORY && PaperWhite2_RollShinyCandyDrop();
}

// Runs once the fade in is done: the drop's script in a VM of its own, which the script's VM then waits for
static BOOL PaperWhite2_ScriptNative_StartShinyCandyDrop(VM *vm, void *data) {
    FieldScriptEnv *env = data;
    ScriptWork *work = FieldScriptEnv_GetScriptWork(env);
    u32 index = ScriptWork_AddVM(work, FieldScriptEnv_GetZoneID(env), SCRID_SHINY_CANDY_DROP_CALL);

    if (index == SCRIPT_VM_NONE) {
        return TRUE;
    }
    SetScrEnvVMIndex(env, index);
    FieldScriptEnv_Save(env);
    VM_SetNativeCallback(vm, ScriptNative_WaitFinishSubScript);
    return FALSE;
}
