#ifndef PAPERWHITE2_SHINY_CANDY_H
#define PAPERWHITE2_SHINY_CANDY_H

#include "types.h"
#include "struct_decls.h"

// Paper White 2: the Shiny Candy, which makes a Pokémon shiny (src/paperwhite2/ov165/paperwhite2_shiny_candy.c), used
// from the bag on the party list's Pokémon, which the party list's item mode calls (src/ov165/plist_sys.c)

// Makes the list's Pokémon shiny and says so, or says that it won't have any effect on an egg or a shiny one.
// Returns whether the candy was used, which the caller takes from the bag
BOOL PaperWhite2_UseShinyCandy(PokeListWork *wk);
// A shiny PID for the trainer ID that keeps the low 18 bits of the old PID, so the sex, the nature, the ability slot,
// the box data's block order and the side that Wurmple evolves to stay (src/paperwhite2/main/paperwhite2_shiny_pid.c)
u32 PaperWhite2_MakeShinyPID(u32 id, u32 pid);

// A wild shiny Pokémon that the player defeats drops a Shiny Candy this often, in percent, and so does a shiny
// Pokémon that the player releases from the PC (src/paperwhite2/ov012/paperwhite2_shiny_candy_drop.c, from the wild
// battle's event in src/ov012/event_battle.c; the box app's release in src/ov255/box2_seq.c)
#define SHINY_CANDY_DROP_PERCENT 50
// The script that says the Shiny Candy dropped and gives it, or says the bag has no room: Script_20 of
// res/field/scripts/global_2800.s, an event of its own after a wild battle of the field
#define SCRID_SHINY_CANDY_DROP 2819

// Whether a shiny Pokémon of this PID drops a Shiny Candy, at SHINY_CANDY_DROP_PERCENT's chance over PIDs. The PID
// decides it when the Pokémon is made, so loading a save again doesn't roll the drop again
// (src/paperwhite2/main/paperwhite2_shiny_pid.c)
BOOL PaperWhite2_IsShinyCandyDropper(u32 pid);

// Whether one of the wild Pokémon of a battle's setup is shiny and one whose PID drops a Shiny Candy
BOOL PaperWhite2_HasShinyCandyFoe(BtlSetup *setup);
// After a wild battle of the field that the player won (result, a BTL_RESULT_*) with a shiny Pokémon among the wild
// ones whose PID drops a Shiny Candy, starts the drop's script under event
void PaperWhite2_ShinyCandyDrop(GameEvent *event, BOOL candyFoe, u32 result);

#endif // PAPERWHITE2_SHINY_CANDY_H
