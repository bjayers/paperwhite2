#ifndef PAPERWHITE2_ENTRALINK_RUN_PARTY_H
#define PAPERWHITE2_ENTRALINK_RUN_PARTY_H

#include "types.h"
#include "struct_decls.h"

// Paper White 2: the Entralink run's team (paperwhite2/entralink_run.h). A run plays with copies of the player's party
// at level 100, healed; the game's party is the copies for the run, so every screen, the follower and the battles show
// them, and the real party stays untouched in the save's party block, which is what any save writes. Damage carries
// from room to room in the copies. At the run's end the real party is the game's again, as it was, with the prestige
// that a Pokémon already at level 100 gained in the run's battles written back to it; a copy of one below 100 gains
// none. The copies are in ARM9 main (src/paperwhite2/main/paperwhite2_entralink_run_party.c), which no map change,
// battle or menu frees

// Puts the run's copies in the game's party, unless they already are
void EntralinkRun_KeepParty(GameData *gameData);
// Puts the real party back, with its level 100 Pokémon's prestige from their copies, if the copies are the party
void EntralinkRun_RestoreParty(GameData *gameData);
// Whether the game's party is the run's copies
BOOL EntralinkRun_IsPartyKept(void);
// Whether a level 100 Pokémon of a battle may gain prestige: always, unless it is a run's copy of one below level 100
BOOL EntralinkRun_CanGainPrestige(BoxPkm *pkm);
// The party a caught Pokémon joins: the real one in a run, which keeps it after the run at its own level, never the
// copies (EventBattleReturn_Main)
PokeParty *EntralinkRun_GetCatchParty(GameData *gameData);
// The max HP of a Pokémon as PokeParty_RecalcStats works it out: a run's copy (the copies and the battle's copies of
// them, by PID) gets the max_hp buffs' percent (entralink-buffs.md, phase 4), at most ENTRALINK_BUFF_MAX_HP_LIMIT and
// never below its own; anyone else's is as it was
u32 EntralinkRun_GetMaxHP(PartyPkm *pkm, u32 maxHP);
// Works the run's copies' stats out again after the max_hp buffs changed: a raise heals the HP it adds (a fainted
// Pokémon stays fainted), a fall keeps the HP within the new max
void EntralinkRun_RefreshMaxHP(void);

#endif // PAPERWHITE2_ENTRALINK_RUN_PARTY_H
