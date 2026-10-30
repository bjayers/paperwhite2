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
// battle's event in src/ov012/event_battle.c and the script's wild battle in src/ov036/scrcmd_encount.c; the box
// app's release in src/ov255/box2_seq.c)
#define SHINY_CANDY_DROP_PERCENT 50
// The scripts that say the Shiny Candy dropped and give it, or say the bag has no room, in
// res/field/scripts/global_2800.s: Script_20, an event of its own after a battle of the field, and Script_21, called
// from a script after its wild battle, which keeps the script's work values
#define SCRID_SHINY_CANDY_DROP 2819
#define SCRID_SHINY_CANDY_DROP_CALL 2820

// Whether a drop happens this time, at SHINY_CANDY_DROP_PERCENT's chance
static inline BOOL PaperWhite2_RollShinyCandyDrop(void) {
    return GFL_RandomLC(100) < SHINY_CANDY_DROP_PERCENT;
}

// Whether one of the wild Pokémon of a battle's setup is shiny
BOOL PaperWhite2_HasShinyFoe(BtlSetup *setup);
// After a wild battle of the field that the player won (result, a BTL_RESULT_*) with a shiny Pokémon among the wild
// ones, starts the drop's script under event at SHINY_CANDY_DROP_PERCENT's chance
void PaperWhite2_ShinyCandyDrop(GameEvent *event, BOOL shinyFoe, u32 result);
// The same for a script's wild battle, when it returns to the script: the drop waits for the script's end of the
// battle (CallWildBattleEnd)
void PaperWhite2_ShinyCandyDropForScript(BOOL shinyFoe, u32 result);
// In the script's end of the battle, once its fade in is done, calls the drop's script if the battle dropped one
void PaperWhite2_ShinyCandyDropAfterScriptBattle(VM *vm, FieldScriptEnv *env);

#endif // PAPERWHITE2_SHINY_CANDY_H
