#ifndef PAPERWHITE2_POKEDEX_SAVE_H
#define PAPERWHITE2_POKEDEX_SAVE_H

#include "types.h"
#include "save/pokedex_savedata.h"
#include "save/save_control.h"
#include "save/wifi_list.h"

// Paper White 2: the hack's Pokédex save, an area of 1504 species and 1024 forms a list in the Pal Pad's block
// (docs/paperwhite2/design/save-expansion.md, src/paperwhite2/main/paperwhite2_pokedex_save.c). The block keeps its
// size, so the save's layout is the original's and old saves load. Every Pokédex function reads and writes the area
// (getPokedexSaveAddress); the original block 0x36 is the source of an old save's upgrade, and each save writes the
// area back into it for species 1 to 649, so tools and older builds still read the Pokédex.
#define SAVE_BLOCK_PAPERWHITE2_POKEDEX SAVE_BLOCK_PAL_PAD

// The ROM's form directory (POKEDEX_FORM_LIST) as the area records it, into entries (POKEDEX_FORM_ENTRY_MAX of
// them); returns how many
u32 PaperWhite2_PokedexSave_GetFormDirectory(u16 *entries);
// After a save is loaded (SaveControl_Create, SaveControl_Reload): an area without its magic is an old save's Pal Pad,
// so the area is built from the original block (its lists, languages and remapped form bits), and an area whose form
// directory isn't the ROM's has its form bits remapped. Only the save in memory changes, until the player saves
void PaperWhite2_PokedexSave_Sync(SaveControl *save);
// Before a save is written (SaveControl_StartSave, SaveControl_StartExtraSave): the area into the original block, for
// species 1 to 649 (languages to 493, the original's), its form bits by the original block's form list
void PaperWhite2_PokedexSave_Mirror(SaveControl *save);
// The original block's size and a new game's original block, as the original initPokedex made it (save_table.c)
u32 PaperWhite2_PokedexVanillaSave_GetSize(void);
void PaperWhite2_PokedexVanillaSave_Init(PokeDexVanillaSave *pokedex);
// The Pal Pad's friend list now that its block is the Pokédex's: one in memory only, which the remaining wireless
// features (link trades, the GTS, Wi-Fi battles) read and write until they go (getPalPadFriendListAddress)
PalPadFriendList *PaperWhite2_GetPalPadFriendList(void);

#endif // PAPERWHITE2_POKEDEX_SAVE_H
