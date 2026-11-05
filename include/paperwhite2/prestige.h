#ifndef PAPERWHITE2_PRESTIGE_H
#define PAPERWHITE2_PRESTIGE_H

#include "types.h"
#include "struct_decls.h"

// Paper White 2: Prestige levels, a trophy past level 100. A level 100 Pokémon in the player's party keeps the Exp. it
// would have gained (as the battle works it out, the Exp. Share's too) as prestige, and each prestige level costs
// res/paperwhite2/level_scaling.json's prestige_growth_percent more than the one before, the first what its species'
// level 99 to 100 does. Its level stays 100 in every calculation; only the screens that show a level show 100 plus its
// prestige level, in gold, up to prestige_max (src/paperwhite2/main/paperwhite2_prestige.c).
//
// Stored in PKM_PARAM_PRESTIGE's 30 bits: the prestige level above 100 in bits 0-9, and the Exp. toward the next in
// bits 10-29, in units of PRESTIGE_EXP_UNIT. A level's cost stops growing at what 20 bits hold (about prestige 260)

#define PRESTIGE_LEVEL_START 100
#define PRESTIGE_EXP_UNIT 16

// The level a screen shows: the Pokémon's, or 100 plus its prestige level at 100
u32 PaperWhite2_GetShownLevel(BoxPkm *pkm);
// Whether it shows a prestige level, which the screens print in gold
BOOL PaperWhite2_HasPrestige(BoxPkm *pkm);
// Adds Exp. to a level 100 Pokémon's prestige, and returns TRUE if its prestige level rose
BOOL PaperWhite2_AddPrestigeExp(BoxPkm *pkm, u32 exp);
// Raises a level 100 Pokémon's prestige level by one, from no progress, for the debug menu; FALSE below level 100 or
// at the greatest
BOOL PaperWhite2_AddPrestigeLevel(BoxPkm *pkm);

// The colors a screen prints a prestige level in, for its font palette: the standard one (archive 23's palette 5,
// gold letters with the dark gray of normal text as the shadow), and the battle's HP box (gold, its near-black)
#define PRESTIGE_PRINT_COLOR PRINT_COLOR(11, 1, 0)
#define PRESTIGE_GAUGE_LETTER 9
#define PRESTIGE_GAUGE_SHADOW 4

#endif // PAPERWHITE2_PRESTIGE_H
