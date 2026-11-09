#ifndef POKEBW2_APP_POKEDEX_INFO_H
#define POKEBW2_APP_POKEDEX_INFO_H

#include "types.h"
#include "gfl/clact.h"
#include "gfl/heap.h"
#include "gfl/msg.h"
#include "gfl/overlay.h"
#include "struct_decls.h"
#include "system/printsys.h"

// A Pokémon's Pokédex entry, overlay 296 (pokedex_info.c): its sprite, name, type, height, weight and description, in
// the game's language or another one. The Pokédex's detail screen draws one on each screen. None of these functions
// has a name yet

#define OVERLAY_POKEDEX_INFO OVERLAY_ID(296)

typedef struct PokedexInfo PokedexInfo;

// The same for a Pokémon of the party. national is whether the national Pokédex numbers it, caught whether its entry
// is shown or only its sprite, mode 0, 1 or 2 how it is shown (2 by the detail screen), engine 0 for the main screen
// and 1 for the sub screen
PokedexInfo *PokedexInfo_CreateForPartyPkm(HeapID heapId, PartyPkm *pkm, BOOL national, BOOL caught, u32 mode,
                                           u32 engine, u8 bgPriority, ClActUnit *unit, Font *font,
                                           PrintQueue *printQueue, MsgData *msgData0, MsgData *msgData1,
                                           MsgData *msgData2);
// sex, rare and form are what the Pokédex shows of the species (PokeDex_GetShownSexRareForm), personality a Spinda's
// spots. The print queue is not used, the entry makes its own. The message files are the species categories, the
// heights and the weights that the caller has loaded already, or NULL to load them
PokedexInfo *PokedexInfo_Create(HeapID heapId, u16 species, u16 form, u16 sex, u16 rare, u32 personality, BOOL national,
                                BOOL caught, u32 mode, u32 engine, u8 bgPriority, ClActUnit *unit, Font *font,
                                PrintQueue *printQueue, MsgData *msgData0, MsgData *msgData1, MsgData *msgData2);
void PokedexInfo_Free(PokedexInfo *info);
void PokedexInfo_Update(PokedexInfo *info);
// Frees the windows and what the entry shows, before PokedexInfo_Free frees the rest
void PokedexInfo_FreeEntry(PokedexInfo *info);
// Mode 0 waits for the caller to say that it is ready before the sprite slides in, and mode 1 for it to ask for the
// Pokémon's cry
void PokedexInfo_SetReady(PokedexInfo *info);
void PokedexInfo_RequestCry(PokedexInfo *info);
// Whether the sprite is sliding in, and whether the entry has finished its animation
BOOL PokedexInfo_IsSlidingIn(PokedexInfo *info);
BOOL PokedexInfo_IsDone(PokedexInfo *info);
// Starts mode 0's animation
void PokedexInfo_Start(PokedexInfo *info);
// Shows another Pokémon
void PokedexInfo_SetPokemon(PokedexInfo *info, u16 species, u16 form, u16 sex, u16 rare, u32 personality, BOOL caught);
// Shows the entry in another language
void PokedexInfo_SetLanguage(PokedexInfo *info, u32 language);
void PokedexInfo_SetPokemonInLanguage(PokedexInfo *info, u16 species, u16 form, u16 sex, u16 rare, u32 personality,
                                      BOOL caught, u32 language);
void PokedexInfo_Hide(PokedexInfo *info);
void PokedexInfo_Show(PokedexInfo *info);
#ifdef PAPERWHITE2
// Paper White 2: frees the entry's text windows, type icons and footprint for a while, and makes them again with the
// entry in a language (as PokedexInfo_SetLanguage), for the detail screen's info page's move panel and Area map
void PokedexInfo_FreeText(PokedexInfo *info);
void PokedexInfo_RestoreText(PokedexInfo *info, u32 language);
// Paper White 2: the info page's Area map takes the top entry's panels' VRAM on BGs 2 and 3 while it shows and puts
// their characters back as it closes: the ARCID_POKEDEX_GRA file they are, and where the BGs have them and the caught
// label's two windows (the mid BG's), each as CHAR_POS and CHAR_SIZE give them, by POKEDEX_INFO_PANEL_CHARS_*; their
// screens are still in the BGs' screen buffers
enum {
    POKEDEX_INFO_PANEL_CHARS_MID,
    POKEDEX_INFO_PANEL_CHARS_BACK,
    POKEDEX_INFO_PANEL_CHARS_LABEL_CAUGHT,
    POKEDEX_INFO_PANEL_CHARS_LABEL_UNCAUGHT,
    POKEDEX_INFO_PANEL_CHARS_COUNT,
};
u32 PokedexInfo_GetPanelChars(PokedexInfo *info, u32 *chars);
// The caught label's characters on the panels' BG back in VRAM too (in a VBlank: their screen is unchanged)
void PokedexInfo_ReloadLabel(PokedexInfo *info);
// Paper White 2: the info page's own text in the entry's text window (tiles 2, 17, 28 by 7 on the top screen's BG 1) in
// place of the description: PokedexInfo_BeginOtherText clears the window's bitmap and returns it, for the caller to
// draw into at once, and the entry's next update shows it; after PokedexInfo_EndOtherText, the entry's next print
// (PokedexInfo_SetLanguage, PokedexInfo_SetPokemonInLanguage) has the description again. The window's colors, in the
// font's palette row: the entry's white, its labels' grey and the shadow of both, and the page's own in colors the
// entry doesn't use: the gold, and a lighter grey with a dark shadow, for the ability's slot on the dark panel
#define POKEDEX_INFO_TEXT_WHITE 15
#define POKEDEX_INFO_TEXT_GREY 1
#define POKEDEX_INFO_TEXT_SHADOW 2
#define POKEDEX_INFO_TEXT_GOLD 3
#define POKEDEX_INFO_TEXT_LIGHT_GREY 4
#define POKEDEX_INFO_TEXT_DARK_SHADOW 5
// Paper White 2: the sex symbol's colors beside the name, the info page's Data's blue and pink
#define POKEDEX_INFO_TEXT_BLUE 6
#define POKEDEX_INFO_TEXT_PINK 7
GFLBitmap *PokedexInfo_BeginOtherText(PokedexInfo *info);
void PokedexInfo_EndOtherText(PokedexInfo *info);
// Paper White 2: whether the species' form has a female sprite of its own, which the Pokédex shows apart from the
// male's
BOOL PokedexInfo_HasSexDifference(u32 species, u32 form);
#endif

#endif // POKEBW2_APP_POKEDEX_INFO_H
