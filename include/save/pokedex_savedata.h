#ifndef POKEBW2_SAVE_POKEDEX_SAVEDATA_H
#define POKEBW2_SAVE_POKEDEX_SAVEDATA_H

#include "types.h"
#include "gfl/heap.h"
#include "struct_decls.h"

#ifdef PAPERWHITE2
// Paper White 2: the Pokédex's save is the hack's own area, the whole of the Pal Pad's block 0x1f
// (SAVE_BLOCK_PAPERWHITE2_POKEDEX, docs/paperwhite2/design/save-expansion.md), with room for 1504 species and 1024
// forms a list; the original block 0x36 keeps its layout, PokeDexVanillaSave, as the source of an old save's upgrade
// and a mirror of the area that each save writes (src/paperwhite2/main/paperwhite2_pokedex_save.c). The lists of bits
// are by species - 1, and the ones of forms by the form's place in the ROM's form directory (POKEDEX_FORM_LIST,
// generated from res/pokemon), which the area records in formEntries
#define POKEDEX_SPECIES_CAPACITY 1504
#define POKEDEX_SPECIES_BYTES (POKEDEX_SPECIES_CAPACITY / 8)
#define POKEDEX_FORM_BYTES 0x80
// The directory's entries: the species in bits 0 to 10, its count of forms less 1 in bits 11 to 15
#define POKEDEX_FORM_ENTRY_MAX 128
#define POKEDEX_FORM_ENTRY(species, count) ((u16)((species) | (((count) - 1) << 11)))
#define POKEDEX_FORM_ENTRY_SPECIES(entry) ((entry) & 0x7ff)
#define POKEDEX_FORM_ENTRY_FORMS(entry) (((entry) >> 11) + 1)
// The species that the Pokédex keeps the languages of: added species have no entries in other languages
#define POKEDEX_LANGUAGE_SPECIES_MAX 649
#define POKEDEX_LANGUAGE_COUNT 7
#define POKEDEX_LANGUAGE_BYTES 0x238
#define POKEDEX_SAVE_MAGIC 0x44325750
#define POKEDEX_SAVE_VERSION 1

// The original block's layout and its constants
#define POKEDEX_VANILLA_SPECIES_BYTES 0x54
#define POKEDEX_VANILLA_FORM_BYTES 0xb
#define POKEDEX_VANILLA_LANGUAGE_SPECIES_MAX 493
#define POKEDEX_VANILLA_LANGUAGE_BYTES 0x1b0
#define POKEDEX_MAGIC 0xbeefcafe
#else
// The Pokédex's save block 0x36 (swan's getPokedexSaveAddress). The lists of bits are by species - 1, and the ones of
// forms by the form's place in pokemonFormList

#define POKEDEX_SPECIES_BYTES 0x54
#define POKEDEX_FORM_BYTES 0xb
// The species that the Pokédex has entries in other languages of
#define POKEDEX_LANGUAGE_SPECIES_MAX 493
#define POKEDEX_LANGUAGE_COUNT 7
#define POKEDEX_LANGUAGE_BYTES 0x1b0
#define POKEDEX_MAGIC 0xbeefcafe
#endif

// The lists of species seen and shown: by sex, and then the same of shiny Pokémon
enum {
    POKEDEX_KIND_MALE,
    POKEDEX_KIND_FEMALE,
    POKEDEX_KIND_RARE_MALE,
    POKEDEX_KIND_RARE_FEMALE,
    POKEDEX_KIND_COUNT,
};

// A species with forms and the count of them, a row of the Pokédex's form list
typedef struct {
    u16 species;
    u16 count;
} PokeDexFormEntry;

#ifdef PAPERWHITE2
typedef struct PokeDexVanillaSave {
    u32 magic;
    u32 nationalObtained : 1;
    u32 habitatListEnabled : 1;
    u32 given : 8;
    u32 mode : 2;
    u32 lastSpecies : 10;
    u32 unused4_22 : 10;
    u8 caught[POKEDEX_VANILLA_SPECIES_BYTES];
    u8 seen[POKEDEX_KIND_COUNT * POKEDEX_VANILLA_SPECIES_BYTES];
    u8 shown[POKEDEX_KIND_COUNT * POKEDEX_VANILLA_SPECIES_BYTES];
    // By the place in the original game's form list and the hack's Pichu after it (sPokedexVanillaFormList)
    u8 seenForms[2 * POKEDEX_VANILLA_FORM_BYTES];
    u8 shownForms[2 * POKEDEX_VANILLA_FORM_BYTES];
    u8 languages[POKEDEX_VANILLA_LANGUAGE_BYTES];
    u32 spindaPersonality;
} PokeDexVanillaSave; // size: 0x4dc

struct PokeDexSave {
    // POKEDEX_SAVE_MAGIC ("PW2D") and POKEDEX_SAVE_VERSION once the area holds a Pokédex; an old save's Pal Pad has
    // neither
    u32 magic;
    u16 version;
    // The entries of formEntries in use
    u16 formEntryCount;
    u32 nationalObtained : 1;
    u32 habitatListEnabled : 1;
    // Set to 1 when the player is given the Pokédex, which the list's search and the detail screen check
    u32 given : 8;
    // Which Pokédex the list shows and the detail screen counts, a DEX_* value (PokeDex_GetMode)
    u32 mode : 2;
    u32 unused8_12 : 20;
    // The species that the Pokédex's list was last on
    u16 lastSpecies;
    u16 unusedE;
    // The personality of the first Spinda seen
    u32 spindaPersonality;
    u8 unused14[12];
    u8 caught[POKEDEX_SPECIES_BYTES];
    // A list of POKEDEX_SPECIES_BYTES for each kind
    u8 seen[POKEDEX_KIND_COUNT * POKEDEX_SPECIES_BYTES];
    // Which of them the Pokédex shows of a species: one bit set among the four lists
    u8 shown[POKEDEX_KIND_COUNT * POKEDEX_SPECIES_BYTES];
    // The forms seen and the form shown: a list of POKEDEX_FORM_BYTES for the normal ones, then one for the shiny
    u8 seenForms[2 * POKEDEX_FORM_BYTES];
    u8 shownForms[2 * POKEDEX_FORM_BYTES];
    // The form directory the form bits were written in, POKEDEX_FORM_ENTRY values in bit order
    u16 formEntries[POKEDEX_FORM_ENTRY_MAX];
    // The languages a species was caught in, POKEDEX_LANGUAGE_COUNT bits a species
    u8 languages[POKEDEX_LANGUAGE_BYTES];
    // Free, zero: the block's size is the Pal Pad's, which an old save has
    u8 reserved[0x160];
}; // size: 0xd54
#else
struct PokeDexSave {
    u32 magic;
    u32 nationalObtained : 1;
    u32 habitatListEnabled : 1;
    // Set to 1 when the player is given the Pokédex, which the list's search and the detail screen check
    u32 given : 8;
    // Which Pokédex the list shows and the detail screen counts, a DEX_* value (PokeDex_GetMode)
    u32 mode : 2;
    // The species that the Pokédex's list was last on
    u32 lastSpecies : 10;
    u32 unused4_22 : 10;
    u8 caught[POKEDEX_SPECIES_BYTES];
    // A list of POKEDEX_SPECIES_BYTES for each kind
    u8 seen[POKEDEX_KIND_COUNT * POKEDEX_SPECIES_BYTES];
    // Which of them the Pokédex shows of a species: one bit set among the four lists
    u8 shown[POKEDEX_KIND_COUNT * POKEDEX_SPECIES_BYTES];
    // The forms seen and the form shown: a list of POKEDEX_FORM_BYTES for the normal ones, then one for the shiny
    u8 seenForms[2 * POKEDEX_FORM_BYTES];
    u8 shownForms[2 * POKEDEX_FORM_BYTES];
    // The languages a species was caught in, POKEDEX_LANGUAGE_COUNT bits a species
    u8 languages[POKEDEX_LANGUAGE_BYTES];
    // The personality of the first Spinda seen
    u32 spindaPersonality;
}; // size: 0x4dc
#endif

BOOL PokeDex_IsNationalObtained(PokeDexSave *pokedex);
u32 getSizeofPokedexData(void);
void initPokedex(PokeDexSave *pokedex);
void PokeDex_SetNationalObtained(PokeDexSave *pokedex);
void PokeDex_EnableHabitatList(PokeDexSave *pokedex);
BOOL PokeDex_IsHabitatListEnabled(PokeDexSave *pokedex);
void givePlayerPokedex(PokeDexSave *pokedex);
u32 PokeDex_IsGiven(PokeDexSave *pokedex);
// Which Pokédex the list shows and the detail screen counts: the regional one, the national one, or the habitat list,
// which the list's select button goes to when the player does not have the national one
enum {
    DEX_REGIONAL,
    DEX_NATIONAL,
    DEX_HABITAT,
};

u32 PokeDex_GetMode(PokeDexSave *pokedex);
// Sets which Pokédex the list shows, a DEX_* value
void PokeDex_SetMode(PokeDexSave *pokedex, u32 mode);
BOOL PokeDex_IsCaught(PokeDexSave *pokedex, u16 species);
BOOL PokeDex_IsSeen(PokeDexSave *pokedex, u16 species);
// The species that the Pokédex's list was last on, and sets it
void PokeDex_SetLastSpecies(PokeDexSave *pokedex, u16 species);
u16 PokeDex_GetLastSpecies(PokeDexSave *pokedex);
// Sets the sex, shininess and form that the Pokédex shows of a species
void addToDex(PokeDexSave *pokedex, u16 species, u32 sex, BOOL rare, u32 form);
// The forms of a species, 1 for one without any
u16 getNumberOfForms(u16 species);
// The sex, shininess and form that the Pokédex shows of a species
void PokeDex_GetShownSexRareForm(PokeDexSave *pokedex, u16 species, u32 *sex, u32 *rare, u32 *form, HeapID heapId);
// Whether the Pokédex has seen the species in that sex, shininess and form
BOOL PokeDex_HasSeenVariant(PokeDexSave *pokedex, u16 species, u32 sex, BOOL rare, u32 form);
// The personality of the Spinda the Pokédex shows, for index 0
u32 PokeDex_GetSpindaPersonality(PokeDexSave *pokedex, u32 index);
// Whether the Pokédex has the species' entry in a language
BOOL PokeDex_HasLanguage(PokeDexSave *pokedex, u16 species, u32 language);
u16 PokeDex_GetSeenNoNational(PokeDexSave *pokedex);
u16 PokeDex_GetCaughtNoNational(PokeDexSave *pokedex);
// The same of the regional Pokédex, whose table they load on the heap
u16 PokeDex_GetSeenNoUnova(PokeDexSave *pokedex, HeapID heapId);
u16 PokeDex_GetCaughtNoUnova(PokeDexSave *pokedex, HeapID heapId);
// Registers a Pokémon as seen
void PokeDex_RegistPkm(PokeDexSave *pokedex, PartyPkm *pkm);
// Registers a Pokémon as seen and caught, with its language
void addPkmToDex(PokeDexSave *pokedex, PartyPkm *pkm);
// The count of seen Pokémon, in the national Pokédex once the player has it
u32 countSeenDexPokes(PokeDexSave *pokedex, HeapID heapId);
// Whether all the species are caught but the mythical ones, in the regional Pokédex too, and whether all of the
// regional one are seen
BOOL PokeDex_IsCompleteNational(PokeDexSave *pokedex);
BOOL PokeDex_IsCompleteUnova(PokeDexSave *pokedex, HeapID heapId);
BOOL PokeDex_IsSeenAllUnova(PokeDexSave *pokedex, HeapID heapId);
// What the professor says of the Pokédex: the message, the count it tells and unk, which the tables give for the count
// without the mythical species, for one of these modes
enum {
    POKEDEX_EVALUATION_NATIONAL_CAUGHT = 1,
    POKEDEX_EVALUATION_REGIONAL_SEEN,
    POKEDEX_EVALUATION_REGIONAL_CAUGHT,
};

void PokeDex_GetEvaluationParams(PokeDexSave *pokedex, u16 mode, HeapID heapId, u16 *message, u16 *count, u16 *unk);

#ifdef PAPERWHITE2
// Paper White 2: the ROM's form directory (POKEDEX_FORM_LIST, generated from res/pokemon), which a { 0, 0 } ends
const PokeDexFormEntry *PokeDex_PaperWhite2_GetFormList(void);
#endif

#ifdef PAPERWHITE2_DEBUG_MENU
// Paper White 2: the debug menu's Fill Pokédex: every species seen and caught in each sex, normal and shiny, form and
// language it can have; spindaPersonality is Spinda's when the Pokédex has none. The National Pokédex isn't given
void PokeDex_PaperWhite2_FillAll(PokeDexSave *pokedex, u32 spindaPersonality);
#endif

#endif // POKEBW2_SAVE_POKEDEX_SAVEDATA_H
