#include "types.h"
#include "constants/moves.h"
#include "paperwhite2/move_tutors.h"
#include "paperwhite2/shops_config.h"

// Paper White 2: the move tutors' lists (paperwhite2/move_tutors.h). The shards' tutors' are
// res/field/shops/move_tutors.json's (tools/data/shop_data.py writes paperwhite2/shops_config.h), which the matching
// build has as scrcmd_shop.c's MOVE_TUTOR_ITEMS_*, MOVE_TUTOR_SHOP_ITEMS and MOVE_TUTOR_SHOP_ITEM_COUNTS

const u16 PaperWhite2_TypeTutorMoves[TYPE_TUTOR_MOVE_COUNT] = {
    MOVE_GRASS_PLEDGE, MOVE_FIRE_PLEDGE,  MOVE_WATER_PLEDGE, MOVE_FRENZY_PLANT,
    MOVE_BLAST_BURN,   MOVE_HYDRO_CANNON, MOVE_DRACO_METEOR,
};

static const PaperWhite2TutorMove sDriftveilCityMoves[] = { PAPERWHITE2_MOVE_TUTOR_MOVES_0 };

static const PaperWhite2TutorMove sLentimasTownMoves[] = { PAPERWHITE2_MOVE_TUTOR_MOVES_1 };

static const PaperWhite2TutorMove sHumilauCityMoves[] = { PAPERWHITE2_MOVE_TUTOR_MOVES_2 };

static const PaperWhite2TutorMove sNacreneCityMoves[] = { PAPERWHITE2_MOVE_TUTOR_MOVES_3 };

const PaperWhite2TutorMove *const PaperWhite2_MoveTutorMoves[MOVE_TUTOR_COUNT] = {
    sDriftveilCityMoves, sLentimasTownMoves, sHumilauCityMoves, sNacreneCityMoves
};

const u8 PaperWhite2_MoveTutorMoveCounts[MOVE_TUTOR_COUNT] = { PAPERWHITE2_MOVE_TUTOR_MOVE_COUNTS };
