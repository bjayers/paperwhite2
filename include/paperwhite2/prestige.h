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
// bits 10-29, in Prestige Points, one per PRESTIGE_EXP_UNIT Exp. (rounded), which is what the screens and the battle
// show, so the numbers stay short: a tenth of the Exp. A level's cost stops growing at what 20 bits hold (about
// prestige 245)

#define PRESTIGE_LEVEL_START 100
#define PRESTIGE_EXP_UNIT 10
// The parts of PKM_PARAM_PRESTIGE's value, and Exp. as the units it adds, rounded
#define PRESTIGE_LEVEL_OF(value) ((value) & 0x3ff)
#define PRESTIGE_PROGRESS_OF(value) ((value) >> 10)
#define PRESTIGE_UNITS_OF(exp) (((exp) + PRESTIGE_EXP_UNIT / 2) / PRESTIGE_EXP_UNIT)
// The greatest prestige level above 100
u32 PaperWhite2_GetPrestigeMax(void);
// The units of Exp. a species' prestige level above 100 costs to leave, the next one's
u32 PaperWhite2_GetPrestigeCost(u32 species, u32 form, u32 prestige);

// The level a screen shows: the Pokémon's, or 100 plus its prestige level at 100
u32 PaperWhite2_GetShownLevel(BoxPkm *pkm);
// Whether it shows a prestige level, which the screens print in gold
BOOL PaperWhite2_HasPrestige(BoxPkm *pkm);
// Adds Exp. to a level 100 Pokémon's prestige, and returns TRUE if its prestige level rose
BOOL PaperWhite2_AddPrestigeExp(BoxPkm *pkm, u32 exp);
// A level 100 Pokémon's Prestige Points toward its next prestige level, what that level costs, and all it has gained
// (the levels' costs and the progress); FALSE below level 100
BOOL PaperWhite2_GetPrestigeProgress(BoxPkm *pkm, u32 *progress, u32 *cost, u32 *total);
// Raises a level 100 Pokémon's prestige level by one, from no progress, for the debug menu; FALSE below level 100 or
// at the greatest
BOOL PaperWhite2_AddPrestigeLevel(BoxPkm *pkm);

// The colors a screen prints a prestige level in, for its font palette: the standard one (archive 23's palette 5,
// gold letters with the dark gray of normal text as the shadow); the party list's plates (archive 75's palette 0, its
// HP bar's gold with black); and the battle's HP box (gold, its near-black). Messages take {ff00:N} with N 256 +
// letter * 16 + shadow: 433 in a talk window (palette 5), 450 in a system window (palette 7, gold and its gray), 505
// in the battle's (btlv_scu.c's gold in color 15, and the text's gray)
#define PRESTIGE_PRINT_COLOR PRINT_COLOR(11, 1, 0)
#define PRESTIGE_PLATE_PRINT_COLOR PRINT_COLOR(13, 7, 0)
#define PRESTIGE_GAUGE_LETTER 9
#define PRESTIGE_GAUGE_SHADOW 4
// The summary's Exp. bar in the standard palette's gold
#define PRESTIGE_BAR_COLOR 11
// The battle's Exp. bar: its blue (colors 11 and 12 of the gauge's palette) drawn as the HP bar's gold (9 and 10)
#define PRESTIGE_GAUGE_BAR_FROM 11
#define PRESTIGE_GAUGE_BAR_TO 9

#endif // PAPERWHITE2_PRESTIGE_H
