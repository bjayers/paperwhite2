#ifndef PAPERWHITE2_SHINY_CANDY_H
#define PAPERWHITE2_SHINY_CANDY_H

#include "types.h"
#include "gfl/random.h"
#include "struct_decls.h"

// Paper White 2: the Shiny Candy, which makes a Pokémon shiny (src/paperwhite2/ov165/paperwhite2_shiny_candy.c), used
// from the bag on the party list's Pokémon, which the party list's item mode calls (src/ov165/plist_sys.c)

// Makes the list's Pokémon shiny and says so, or says that it won't have any effect on an egg or a shiny one.
// Returns whether the candy was used, which the caller takes from the bag
BOOL PaperWhite2_UseShinyCandy(PokeListWork *wk);

// A wild shiny Pokémon that the player defeats drops a Shiny Candy this often, in percent, and so does a shiny
// Pokémon that the player releases from the PC (src/paperwhite2/ov012/paperwhite2_shiny_candy_drop.c, from the wild
// battle's event in src/ov012/event_battle.c; the box app's release in src/ov255/box2_seq.c)
#define SHINY_CANDY_DROP_PERCENT 50
// The script that says the Shiny Candy dropped and gives it, or says the bag has no room: Script_20 of
// res/field/scripts/global_2800.s, an event of its own after a wild battle of the field
#define SCRID_SHINY_CANDY_DROP 2819

// Whether a drop happens this time, at SHINY_CANDY_DROP_PERCENT's chance
static inline BOOL PaperWhite2_RollShinyCandyDrop(void) {
    return GFL_RandomLC(100) < SHINY_CANDY_DROP_PERCENT;
}

// Whether one of the wild Pokémon of a battle's setup is shiny
BOOL PaperWhite2_HasShinyFoe(BtlSetup *setup);
// After a wild battle of the field that the player won (result, a BTL_RESULT_*) with a shiny Pokémon among the wild
// ones, starts the drop's script under event at SHINY_CANDY_DROP_PERCENT's chance
void PaperWhite2_ShinyCandyDrop(GameEvent *event, BOOL shinyFoe, u32 result);

#endif // PAPERWHITE2_SHINY_CANDY_H
