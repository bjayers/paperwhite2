#include "types.h"
#include "constants/items.h"
#include "constants/places.h"
#include "gfl/arc.h"
#include "gfl/heap.h"
#include "paperwhite2/move_tutors.h"
#include "paperwhite2/pokedex_info.h"
#include "pml/item.h"
#include "pml/personal.h"

// Paper White 2: the sets of moves that the Pokédex info page's Moves sub-page lists (docs/paperwhite2/design/
// pokedex.md, "Moves and Evo tabs"), read as the game reads them where the moves are learnt: the learnset by level
// (PML_LearnsetLvUpLoad), the machines' and tutors' bits of the personal data, and the egg moves (day_care.c)

// The egg moves' archive, a file for each species of a u16 count and the moves (inheritEggMoves, day_care.c). Forms
// share their species' moves
#define ARCID_EGG_MOVES 124

// The machines' bits in a species' personal data (PML_ItemGetTMBitMask): TM01 to TM92, TM93 to TM95, then HM01 to
// HM06
#define MACHINE_COUNT 101
#define TM_COUNT_FIRST 92
#define TM_COUNT 95
#define MACHINE_WORD_BITS 32

// Where the free tutors teach: the Pledges and the ultimate moves at the PWT, Draco Meteor in Opelucid City (the
// scripts of res/field/scripts/global_2280.s that pwt.json's and opelucid_city_2.s's events start)
#define TYPE_TUTOR_PWT_MOVES 6

// Where each of the shards' tutors is, in PaperWhite2_MoveTutorMoves' order: the zones whose events start
// global_2280.s's Script_4 to Script_7 (driftveil_city_2, lentimas_town_2, humilau_city_2 and nacrene_city_8)
static const u16 sMoveTutorPlaces[MOVE_TUTOR_COUNT] = {
    PLACE_DRIFTVEIL_CITY,
    PLACE_LENTIMAS_TOWN,
    PLACE_HUMILAU_CITY,
    PLACE_NACRENE_CITY,
};

static void PokedexInfoMoves_LoadLevelUp(PokedexInfoMoves *moves, u16 species, u16 form);
static void PokedexInfoMoves_LoadMachines(PokedexInfoMoves *moves, PersonalData *personal);
static void PokedexInfoMoves_LoadTutors(PokedexInfoMoves *moves, PersonalData *personal);
static void PokedexInfoMoves_LoadEggMoves(PokedexInfoMoves *moves, u16 species, HeapID heapId);
static void PokedexInfoMoves_Add(PokedexInfoMoves *moves, u16 move, u16 detail);
static u16 PokedexInfoMoves_GetMachineItem(u32 bit);

void PokedexInfoMoves_Load(PokedexInfoMoves *moves, u32 set, u16 species, u16 form, HeapID heapId) {
    PersonalData *personal;

    moves->set = set;
    moves->count = 0;
    moves->cursor = 0;
    moves->scroll = 0;
    switch (set) {
    case POKEDEX_INFO_MOVES_LEVEL_UP:
        PokedexInfoMoves_LoadLevelUp(moves, species, form);
        break;
    case POKEDEX_INFO_MOVES_MACHINES:
        personal = PML_PersonalLoad(species, form, heapId);
        PokedexInfoMoves_LoadMachines(moves, personal);
        PML_PersonalFree(personal);
        break;
    case POKEDEX_INFO_MOVES_TUTOR:
        personal = PML_PersonalLoad(species, form, heapId);
        PokedexInfoMoves_LoadTutors(moves, personal);
        PML_PersonalFree(personal);
        break;
    case POKEDEX_INFO_MOVES_EGG:
        PokedexInfoMoves_LoadEggMoves(moves, species, heapId);
        break;
    }
}

BOOL PokedexInfoMoves_MoveCursor(PokedexInfoMoves *moves, int delta) {
    int cursor = (int)moves->cursor + delta;

    if (cursor < 0 || cursor >= (int)moves->count) {
        return FALSE;
    }
    moves->cursor = cursor;
    if (moves->cursor < moves->scroll) {
        moves->scroll = moves->cursor;
    } else if (moves->cursor >= moves->scroll + POKEDEX_INFO_MOVE_ROWS) {
        moves->scroll = moves->cursor - POKEDEX_INFO_MOVE_ROWS + 1;
    }
    return TRUE;
}

BOOL PokedexInfoMoves_SelectRow(PokedexInfoMoves *moves, u32 row) {
    if (moves->scroll + row >= moves->count) {
        return FALSE;
    }
    moves->cursor = moves->scroll + row;
    return TRUE;
}

// In the learnset's order, by level
static void PokedexInfoMoves_LoadLevelUp(PokedexInfoMoves *moves, u16 species, u16 form) {
    LearnsetEntry learnset[LEARNSET_MAX];
    u32 i;

    PML_LearnsetLvUpLoad(species, form, learnset);
    for (i = 0; i < LEARNSET_MAX && !LearnsetEntry_IsEnd(learnset[i]); i++) {
        PokedexInfoMoves_Add(moves, LearnsetEntry_GetMove(learnset[i]), LearnsetEntry_GetLevel(learnset[i]));
    }
}

// The TMs by number, then the HMs
static void PokedexInfoMoves_LoadMachines(PokedexInfoMoves *moves, PersonalData *personal) {
    u32 i;

    for (i = 0; i < MACHINE_COUNT; i++) {
        u32 word = PML_PersonalGetParam(personal, PERSONAL_MACHINES_1 + i / MACHINE_WORD_BITS);

        if (word & (1 << (i % MACHINE_WORD_BITS))) {
            PokedexInfoMoves_Add(moves, PML_ItemGetTMMoveID(PokedexInfoMoves_GetMachineItem(i)), i);
        }
    }
}

// The free tutors' moves, then each shards' tutor's in the order of its menu
static void PokedexInfoMoves_LoadTutors(PokedexInfoMoves *moves, PersonalData *personal) {
    u32 word = PML_PersonalGetParam(personal, PERSONAL_TUTORS);
    u32 tutor;
    u32 i;

    for (i = 0; i < TYPE_TUTOR_MOVE_COUNT; i++) {
        if (word & (1 << i)) {
            PokedexInfoMoves_Add(moves, PaperWhite2_TypeTutorMoves[i],
                                 i < TYPE_TUTOR_PWT_MOVES ? PLACE_PWT : PLACE_OPELUCID_CITY);
        }
    }
    for (tutor = 0; tutor < MOVE_TUTOR_COUNT; tutor++) {
        const PaperWhite2TutorMove *tutorMoves = PaperWhite2_MoveTutorMoves[tutor];
        u32 count = PaperWhite2_MoveTutorMoveCounts[tutor];
        u32 index;

        word = PML_PersonalGetParam(personal, PERSONAL_TUTOR_PAID_1 + tutor);
        for (index = 0; index < count; index++) {
            for (i = 0; i < count; i++) {
                if (tutorMoves[i].index == index && (word & (1 << i))) {
                    PokedexInfoMoves_Add(moves, tutorMoves[i].move, sMoveTutorPlaces[tutor]);
                }
            }
        }
    }
}

static void PokedexInfoMoves_LoadEggMoves(PokedexInfoMoves *moves, u16 species, HeapID heapId) {
    u16 *eggMoves = GFL_ArcSysReadHeapNew(ARCID_EGG_MOVES, species, heapId);
    u32 i;

    for (i = 1; i <= eggMoves[0]; i++) {
        PokedexInfoMoves_Add(moves, eggMoves[i], 0);
    }
    GFL_HeapFree(eggMoves);
}

static void PokedexInfoMoves_Add(PokedexInfoMoves *moves, u16 move, u16 detail) {
    if (moves->count < POKEDEX_INFO_MOVES_MAX) {
        moves->moves[moves->count].move = move;
        moves->moves[moves->count].detail = detail;
        moves->count++;
    }
}

// The item of a machine's bit, as PML_ItemGetTMBitMask numbers them
static u16 PokedexInfoMoves_GetMachineItem(u32 bit) {
    if (bit < TM_COUNT_FIRST) {
        return ITEM_TM01 + bit;
    }
    if (bit < TM_COUNT) {
        return ITEM_TM93 + bit - TM_COUNT_FIRST;
    }
    return ITEM_HM01 + bit - TM_COUNT;
}
