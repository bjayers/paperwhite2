#include "types.h"
#include "constants/moves.h"
#include "paperwhite2/move_tutors.h"

// Paper White 2: the move tutors' lists (paperwhite2/move_tutors.h). The shards' tutors' are scrcmd_shop.c's
// MOVE_TUTOR_ITEMS_*, MOVE_TUTOR_SHOP_ITEMS and MOVE_TUTOR_SHOP_ITEM_COUNTS, unchanged

const u16 PaperWhite2_TypeTutorMoves[TYPE_TUTOR_MOVE_COUNT] = {
    MOVE_GRASS_PLEDGE, MOVE_FIRE_PLEDGE,  MOVE_WATER_PLEDGE, MOVE_FRENZY_PLANT,
    MOVE_BLAST_BURN,   MOVE_HYDRO_CANNON, MOVE_DRACO_METEOR,
};

static const PaperWhite2TutorMove sDriftveilCityMoves[] = {
    { MOVE_BUG_BITE, 2, 1 },        { MOVE_COVET, 2, 0 },        { MOVE_SUPER_FANG, 6, 6 },  { MOVE_DUAL_CHOP, 6, 9 },
    { MOVE_SIGNAL_BEAM, 4, 4 },     { MOVE_IRON_HEAD, 4, 5 },    { MOVE_SEED_BOMB, 6, 8 },   { MOVE_DRILL_RUN, 4, 2 },
    { MOVE_BOUNCE, 4, 3 },          { MOVE_LOW_KICK, 8, 10 },    { MOVE_GUNK_SHOT, 8, 11 },  { MOVE_UPROAR, 6, 7 },
    { MOVE_THUNDER_PUNCH, 10, 13 }, { MOVE_FIRE_PUNCH, 10, 12 }, { MOVE_ICE_PUNCH, 10, 14 },
};

static const PaperWhite2TutorMove sLentimasTownMoves[] = {
    { MOVE_MAGIC_COAT, 4, 3 },   { MOVE_BLOCK, 6, 4 },         { MOVE_EARTH_POWER, 8, 10 },
    { MOVE_FOUL_PLAY, 8, 12 },   { MOVE_GRAVITY, 10, 14 },     { MOVE_MAGNET_RISE, 4, 2 },
    { MOVE_IRON_DEFENSE, 2, 1 }, { MOVE_LAST_RESORT, 2, 0 },   { MOVE_SUPERPOWER, 10, 13 },
    { MOVE_ELECTROWEB, 6, 6 },   { MOVE_ICY_WIND, 6, 7 },      { MOVE_AQUA_TAIL, 8, 9 },
    { MOVE_DARK_PULSE, 10, 16 }, { MOVE_ZEN_HEADBUTT, 8, 11 }, { MOVE_DRAGON_PULSE, 10, 15 },
    { MOVE_HYPER_VOICE, 6, 5 },  { MOVE_IRON_TAIL, 6, 8 },
};

static const PaperWhite2TutorMove sHumilauCityMoves[] = {
    { MOVE_BIND, 2, 0 },       { MOVE_SNORE, 2, 1 },        { MOVE_KNOCK_OFF, 4, 3 },   { MOVE_SYNTHESIS, 6, 4 },
    { MOVE_HEAT_WAVE, 10, 8 }, { MOVE_ROLE_PLAY, 8, 7 },    { MOVE_HEAL_BELL, 4, 2 },   { MOVE_TAILWIND, 10, 12 },
    { MOVE_SKY_ATTACK, 8, 6 }, { MOVE_PAIN_SPLIT, 10, 11 }, { MOVE_GIGA_DRAIN, 10, 9 }, { MOVE_DRAIN_PUNCH, 10, 10 },
    { MOVE_ROOST, 6, 5 },
};

static const PaperWhite2TutorMove sNacreneCityMoves[] = {
    { MOVE_GASTRO_ACID, 6, 1 },   { MOVE_WORRY_SEED, 6, 0 },   { MOVE_SPITE, 8, 6 },        { MOVE_AFTER_YOU, 8, 3 },
    { MOVE_HELPING_HAND, 8, 2 },  { MOVE_TRICK, 10, 8 },       { MOVE_MAGIC_ROOM, 8, 4 },   { MOVE_WONDER_ROOM, 8, 5 },
    { MOVE_ENDEAVOR, 12, 11 },    { MOVE_OUTRAGE, 10, 10 },    { MOVE_RECYCLE, 10, 7 },     { MOVE_SNATCH, 12, 14 },
    { MOVE_STEALTH_ROCK, 10, 9 }, { MOVE_SLEEP_TALK, 12, 12 }, { MOVE_SKILL_SWAP, 12, 13 },
};

const PaperWhite2TutorMove *const PaperWhite2_MoveTutorMoves[MOVE_TUTOR_COUNT] = {
    sDriftveilCityMoves, sLentimasTownMoves, sHumilauCityMoves, sNacreneCityMoves
};

const u8 PaperWhite2_MoveTutorMoveCounts[MOVE_TUTOR_COUNT] = { 15, 17, 13, 15 };
