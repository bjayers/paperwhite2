#ifndef POKEBW2_PAPERWHITE2_MOVE_TUTORS_H
#define POKEBW2_PAPERWHITE2_MOVE_TUTORS_H

#include "types.h"

// Paper White 2: the move tutors' lists, in ARM9 main so that the Pokédex can read them as well as the field's tutors
// (src/paperwhite2/main/paperwhite2_move_tutors.c). The shards' tutors' lists were scrcmd_shop.c's, which the hack's
// build reads from here instead, unchanged

// The free tutors' moves by their bit in a species' PERSONAL_TUTORS (PokeParty_CheckMoveTutorNormal): the three
// Pledges and the three ultimate moves at the PWT, and Draco Meteor in Opelucid City
#define TYPE_TUTOR_MOVE_COUNT 7

extern const u16 PaperWhite2_TypeTutorMoves[TYPE_TUTOR_MOVE_COUNT];

// The tutors who teach for shards, in the order of their words in a species' personal data (PERSONAL_TUTOR_PAID_1
// on, the shop's tutorIndex in scrcmd_shop.c): Driftveil City's, Lentimas Town's, Humilau City's and Nacrene City's
#define MOVE_TUTOR_COUNT 4

typedef struct {
    u16 move;
    // In the tutor's shards
    u32 price;
    // The move's place in the tutor's menu
    u16 index;
} PaperWhite2TutorMove;

// Each tutor's moves; a move's place in its list is its bit in the tutor's word
extern const PaperWhite2TutorMove *const PaperWhite2_MoveTutorMoves[MOVE_TUTOR_COUNT];
extern const u8 PaperWhite2_MoveTutorMoveCounts[MOVE_TUTOR_COUNT];

#endif // POKEBW2_PAPERWHITE2_MOVE_TUTORS_H
