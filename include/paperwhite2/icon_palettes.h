#ifndef PAPERWHITE2_ICON_PALETTES_H
#define PAPERWHITE2_ICON_PALETTES_H

#include "types.h"
#include "paperwhite2/species.h"
#include "struct_decls.h"

// Paper White 2: party/box icons on their own battle palettes (docs/paperwhite2/design/icon-screens.md). Each icon is
// drawn from res/pokemon/<group>/icon_battle.png, whose indices 1-13 are battle palette indices (its icon_battle.json's
// slots) and 14-15 the two outline greys. tools/paperwhite2/poke_icons.py builds, at build time, members after the
// icon archive's own (ARCID_POKEICON, a/0/0/7):
// - the icons' own files (the ones PokeParty_GetIconIndex gives) hold the icon drawn in its shared bank, each slot on
//   the bank's colour that the vanilla icon used there: the fallback for a screen that still loads the three banks;
// - ICON_BATTLE_PALETTES_MEMBER: per entry, the 16 normal colours then the 16 shiny ones (RGB555, 64 bytes);
// - from ICON_BATTLE_CHARS_MEMBER, per entry, the icon's characters on its slots, in its own file's format.
// An entry is an icon file's place after the archive's shared files (PokeParty_GetIconIndex's file minus
// ICON_BATTLE_FIRST_FILE), then one for each palette-only form (Arceus'), by its forms.sprite_offset + form - 1. An
// egg's entry is the egg icon on its bank's colours, normal and shiny alike; an icon without icon_battle.png likewise.

// The first icon file of the archive, after its palettes, cells and animations (poke_icon.c's POKEICON_FILE_ICONS)
#define ICON_BATTLE_FIRST_FILE 8
// The icon files: the original archive's, the hack's form groups' and the added species' (two files each)
#define ICON_BATTLE_ICON_ENTRIES                                                                                       \
    (PAPERWHITE2_SPECIES_ICON_FILES + PAPERWHITE2_SPECIES_ADDED_COUNT * 2 - ICON_BATTLE_FIRST_FILE)
#define ICON_BATTLE_PALETTES_MEMBER (ICON_BATTLE_FIRST_FILE + ICON_BATTLE_ICON_ENTRIES)
#define ICON_BATTLE_CHARS_MEMBER (ICON_BATTLE_PALETTES_MEMBER + 1)
// The colours of an icon: a palette row
#define ICON_BATTLE_COLOURS 16

// The entry of a Pokémon's icon
u32 PaperWhite2_GetIconEntry(u32 species, u32 form, u32 sex, BOOL egg);

// The ARCID_POKEICON member with the icon's characters on its battle palette slots, in place of PokeParty_GetIconIndex
// or PokeIcon_GetFileOfPkm's file, for a screen that loads the icon's own palette below
u32 PaperWhite2_GetIconBattleFile(u32 species, u32 form, u32 sex, BOOL egg);
u32 PaperWhite2_GetIconBattleFileOfPkm(BoxPkm *pkm);

// Reads an icon's 16 colours into colours, the shiny ones with shiny (never for an egg)
void PaperWhite2_ReadIconColours(u16 *colours, u32 species, u32 form, u32 sex, BOOL egg, BOOL shiny);
// The same for a Pokémon, with its own shininess: for a screen that keeps the colours and loads them itself
void PaperWhite2_ReadIconColoursOfPkm(u16 *colours, BoxPkm *pkm);

// Loads an icon's colours into an OBJ palette row (0-15) of the main engine, or the sub engine with sub
void PaperWhite2_LoadIconPalette(u32 species, u32 form, u32 sex, BOOL egg, BOOL shiny, BOOL sub, u32 row);
// The same for a Pokémon, with its own shininess
void PaperWhite2_LoadIconPaletteOfPkm(BoxPkm *pkm, BOOL sub, u32 row);

// Loads an icon's colours into band (0-15) of OBJ extended palette extPalette (0-15), for an 8bpp icon whose pixels are
// band * 16 + its 4bpp index. The extended palette's bank must be mapped as OBJ extended palette
void PaperWhite2_LoadIconExtPalette(u32 species, u32 form, u32 sex, BOOL egg, BOOL shiny, BOOL sub, u32 extPalette,
                                    u32 band);
void PaperWhite2_LoadIconExtPaletteOfPkm(BoxPkm *pkm, BOOL sub, u32 extPalette, u32 band);

#endif // PAPERWHITE2_ICON_PALETTES_H
