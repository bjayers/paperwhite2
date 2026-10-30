#include "types.h"
#include "app/pokelist.h"
#include "constants/pokemon.h"
#include "constants/sound.h"
#include "gfl/sound.h"
#include "paperwhite2/shiny_candy.h"
#include "pml/poke_party.h"
#include "text/system/btl_main_11.h"

// Paper White 2: the Shiny Candy, in the party list's overlay 165

BOOL PaperWhite2_UseShinyCandy(PokeListWork *wk) {
    PartyPkm *pkm = wk->pkm;
    u32 id;
    u32 pid;

    if (PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL) || PokeParty_IsRare(pkm)) {
        PokeList_ShowItemUseless(wk);
        return FALSE;
    }
    id = PokeParty_GetParam(pkm, PKM_PARAM_ID, NULL);
    pid = PokeParty_GetParam(pkm, PKM_PARAM_PID, NULL);
    // The setter decrypts the party data with the old PID, then encrypts it with the new one and sums it again
    PokeParty_SetParam(pkm, PKM_PARAM_PID, PaperWhite2_MakeShinyPID(id, pid));
    PokeListPlate_SetPkm(wk, wk->plates[wk->cursorPos], pkm, 0);
    wk->param->result = 10;
    PokeListMessage_CreateWordSet(wk, wk->message);
    PokeListMessage_SetPkmName(wk, wk->message, 0, pkm);
    PokeList_ShowMessage(wk, BtlMain11_Text_BecameShiny, TRUE, PokeList_MessageDoneItem);
    PokeListMessage_FreeWordSet(wk, wk->message);
    GFL_SndSEPlay(SEQ_SE_RECOVERY);
    return TRUE;
}
