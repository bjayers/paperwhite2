#ifndef PAPERWHITE2_SHINY_CANDY_H
#define PAPERWHITE2_SHINY_CANDY_H

#include "types.h"
#include "struct_decls.h"

// Paper White 2: the Shiny Candy, which makes a Pokémon shiny (src/paperwhite2/ov165/paperwhite2_shiny_candy.c), used
// from the bag on the party list's Pokémon, which the party list's item mode calls (src/ov165/plist_sys.c)

// Makes the list's Pokémon shiny and says so, or says that it won't have any effect on an egg or a shiny one.
// Returns whether the candy was used, which the caller takes from the bag
BOOL PaperWhite2_UseShinyCandy(PokeListWork *wk);

#endif // PAPERWHITE2_SHINY_CANDY_H
