#include "types.h"
#include "app/pokelist.h"
#include "constants/items.h"
#include "constants/moves.h"
#include "constants/pokemon.h"
#include "field/hidden_event.h"
#include "paperwhite2/field_moves.h"
#include "paperwhite2/pokelist_field_moves.h"
#include "pml/item.h"
#include "pml/poke_party.h"

// Paper White 2: the learnable HMs in the party list's menu (paperwhite2/pokelist_field_moves.h)

// The first result of the moves outside battle, Cut's, which CheckAllowHMEvent's kinds count from
#define POKELIST_HM_RESULT_FIRST 11

// The result of an HM's move, as PokeList_GetHMResult gives for a known one
static u32 PaperWhite2_PokeList_GetMoveHMResult(u16 move) {
    switch (move) {
    case MOVE_CUT:
        return 11;
    case MOVE_FLY:
        return 15;
    case MOVE_SURF:
        return 12;
    case MOVE_STRENGTH:
        return 14;
    case MOVE_WATERFALL:
        return 13;
    case MOVE_DIVE:
        return 21;
    }
    return 0;
}

// Whether the Pokémon can learn the HM of the number from 0 and doesn't know its move, which the menu lists already
static BOOL PaperWhite2_PokeList_IsLearnableHM(PartyPkm *pkm, u32 hm) {
    u16 move = PML_ItemGetTMMoveID(ITEM_HM01 + hm);
    u32 slot;

    if (PaperWhite2_PokeList_GetMoveHMResult(move) == 0 || !PaperWhite2_FieldMoves_CanLearnHM(pkm, move)) {
        return FALSE;
    }
    for (slot = 0; slot < 4; slot++) {
        if (PokeParty_GetParam(pkm, PKM_PARAM_MOVE1 + slot, NULL) == move) {
            return FALSE;
        }
    }
    return TRUE;
}

u32 PaperWhite2_PokeList_AddLearnableHMs(PokeListWork *wk, u16 *items, u32 count, u32 room) {
    BOOL listed[POKELIST_MENU_LEARNABLE_HM_COUNT];
    u32 learnable = 0;
    u32 chosen = 0;
    u32 hm;

    for (hm = 0; hm < POKELIST_MENU_LEARNABLE_HM_COUNT; hm++) {
        listed[hm] = PaperWhite2_PokeList_IsLearnableHM(wk->pkm, hm);
        if (listed[hm]) {
            learnable++;
        }
    }
    // Too many to fit: the ones usable here first, then the rest by number, until the room is used up
    if (learnable > room) {
        for (hm = 0; hm < POKELIST_MENU_LEARNABLE_HM_COUNT; hm++) {
            if (listed[hm]) {
                u32 kind = PaperWhite2_PokeList_GetMoveHMResult(PML_ItemGetTMMoveID(ITEM_HM01 + hm)) -
                           POKELIST_HM_RESULT_FIRST;

                if (chosen < room && CheckAllowHMEvent(kind, &wk->param->action) == 0) {
                    chosen++;
                } else {
                    listed[hm] = FALSE;
                }
            }
        }
        for (hm = 0; hm < POKELIST_MENU_LEARNABLE_HM_COUNT && chosen < room; hm++) {
            if (!listed[hm] && PaperWhite2_PokeList_IsLearnableHM(wk->pkm, hm)) {
                listed[hm] = TRUE;
                chosen++;
            }
        }
    }
    for (hm = 0; hm < POKELIST_MENU_LEARNABLE_HM_COUNT; hm++) {
        if (listed[hm]) {
            items[count] = POKELIST_MENU_LEARNABLE_HM + hm;
            count++;
        }
    }
    return count;
}

BOOL PaperWhite2_PokeList_IsLearnableHMItem(u32 item) {
    return item >= POKELIST_MENU_LEARNABLE_HM && item < POKELIST_MENU_LEARNABLE_HM + POKELIST_MENU_LEARNABLE_HM_COUNT;
}

u16 PaperWhite2_PokeList_GetLearnableHMMove(u32 item) {
    return PML_ItemGetTMMoveID(ITEM_HM01 + item - POKELIST_MENU_LEARNABLE_HM);
}

u32 PaperWhite2_PokeList_GetMenuHMResult(PokeListWork *wk, u32 item) {
    if (PaperWhite2_PokeList_IsLearnableHMItem(item)) {
        return PaperWhite2_PokeList_GetMoveHMResult(PaperWhite2_PokeList_GetLearnableHMMove(item));
    }
    return PokeList_GetHMResult(wk->pkm, item - 16);
}
