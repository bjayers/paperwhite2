#include "types.h"
#include "app/pokelist.h"
#include "constants/pokemon.h"
#include "constants/sound.h"
#include "gfl/random.h"
#include "gfl/sound.h"
#include "paperwhite2/shiny_candy.h"
#include "pml/poke_party.h"
#include "text/system/btl_main_11.h"

// Paper White 2: the Shiny Candy, in the party list's overlay 165

// The values of the XOR of the trainer ID's and the PID's halves that the new PID can take: those below the threshold
// whose two low bits are the ones that keep bits 16 and 17 of the PID
#define SHINY_CANDY_CHOICES (PID_RARE_THRESHOLD >> 2)

static u32 PaperWhite2_MakeShinyPID(u32 id, u32 pid);

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

// A shiny PID that keeps the low 18 bits of the old one: the low 16 give the sex (and Gen 5 keeps the nature in a
// field of its own), bit 16 the ability slot, and bits 13 to 17 the order of the box data's blocks
// (PML_PkmGetParamBlockCore), which a new PID doesn't reorder. Of the shiny high halves, it takes a random one that
// also keeps the side that Wurmple evolves to, by the high half's last digit (evolution_check.c), where one does
static u32 PaperWhite2_MakeShinyPID(u32 id, u32 pid) {
    u32 high = pid >> 16;
    // The high half whose XOR with the other three halves is 0
    u32 zero = (id >> 16) ^ (id & 0xffff) ^ (pid & 0xffff);
    u32 start = GFL_RandomLC(SHINY_CANDY_CHOICES);
    u32 first = 0;
    u32 candidate;
    u32 i;

    for (i = 0; i < SHINY_CANDY_CHOICES; i++) {
        candidate = zero ^ ((((start + i) % SHINY_CANDY_CHOICES) << 2) | ((zero ^ high) & 3));
        if (i == 0) {
            first = candidate;
        }
        if ((candidate % 10 < 5) == (high % 10 < 5)) {
            return (candidate << 16) | (pid & 0xffff);
        }
    }
    return (first << 16) | (pid & 0xffff);
}
