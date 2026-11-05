#ifndef PAPERWHITE2_DIFFICULTY_H
#define PAPERWHITE2_DIFFICULTY_H

#include "types.h"
#include "battle/btl_setup.h"
#include "struct_decls.h"

// Paper White 2: the difficulty, Easy, Normal or Challenge (GAME_DIFFICULTY_*), which the intro asks for and the
// Options screen's DIFFICULTY row changes. It is kept where the key system kept it (GetGameDifficulty), so the
// scripts that give the Gym Leaders their Challenge Mode teams still see it. The original's change of the shown level
// by the zone's offset (adjustPkmLvForChallengeKeys) is off; in its place trainers' Pokémon change level by
// res/paperwhite2/level_scaling.json's difficulty_easy, _normal or _challenge, with their Exp. and stats
// (src/paperwhite2/main/paperwhite2_difficulty.c)

// The levels the difficulty adds to trainers' Pokémon
s32 PaperWhite2_GetDifficultyLevels(GameData *gameData);
// Changes the levels of the opponents' parties (clients 1 and 3) of a trainer battle by the difficulty's, from 1 to 100
void PaperWhite2_ApplyDifficulty(BtlSetup *setup, GameData *gameData);

#endif // PAPERWHITE2_DIFFICULTY_H
