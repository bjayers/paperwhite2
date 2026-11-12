#include "types.h"
#include "constants/species.h"
#include "gfl/heap.h"
#include "nitro/mi.h"
#include "paperwhite2/pokedex_save.h"
#include "save/pokedex_savedata.h"
#include "save/save_control.h"
#include "save/wifi_list.h"

// Paper White 2: the hack's Pokédex save (include/paperwhite2/pokedex_save.h,
// docs/paperwhite2/design/save-expansion.md): the upgrade of an old save's Pokédex into the area, the remap of its form
// bits when the ROM's form directory changes, the mirror into the original block at each save, and the Pal Pad's friend
// list in memory.

// The four form lists of a Pokédex, in this order: seen and shown, each normal and then shiny
enum {
    FORM_LIST_SEEN,
    FORM_LIST_SEEN_RARE,
    FORM_LIST_SHOWN,
    FORM_LIST_SHOWN_RARE,
    FORM_LIST_COUNT,
};

// A Pokédex's form bits and the directory they are in: the lists, their size, and the directory's entries
typedef struct {
    u8 *lists[FORM_LIST_COUNT];
    u32 listBytes;
    const u16 *entries;
    u32 entryCount;
} PokedexFormBits;

// The species lists that the form bits go with: seen and shown, a list of speciesBytes for each POKEDEX_KIND_*
typedef struct {
    const u8 *seen;
    const u8 *shown;
    u32 speciesBytes;
} PokedexSpeciesBits;

// What the remap of the area's own form bits keeps of them while it writes the new ones
typedef struct {
    u8 lists[FORM_LIST_COUNT][POKEDEX_FORM_BYTES];
    u16 entries[POKEDEX_FORM_ENTRY_MAX];
} PokedexFormBackup;

// The form list of the original block's bits: the original game's, and the hack's Spiky-eared Pichu, which the builds
// before the area appended to it
static const PokeDexFormEntry sPokedexVanillaFormList[] = {
    { SPECIES_UNOWN, 28 },
    { SPECIES_DEOXYS, 4 },
    { SPECIES_SHAYMIN, 2 },
    { SPECIES_GIRATINA, 2 },
    { SPECIES_ROTOM, 6 },
    { SPECIES_SHELLOS, 2 },
    { SPECIES_GASTRODON, 2 },
    { SPECIES_BURMY, 3 },
    { SPECIES_WORMADAM, 3 },
    { SPECIES_CASTFORM, 4 },
    { SPECIES_CHERRIM, 2 },
    { SPECIES_DEERLING, 4 },
    { SPECIES_SAWSBUCK, 4 },
    { SPECIES_MELOETTA, 2 },
    { SPECIES_DARMANITAN, 2 },
    { SPECIES_BASCULIN, 2 },
    { SPECIES_KYUREM, 3 },
    { SPECIES_KELDEO, 2 },
    { SPECIES_THUNDURUS, 2 },
    { SPECIES_TORNADUS, 2 },
    { SPECIES_LANDORUS, 2 },
    { SPECIES_PICHU, 2 },
    { 0, 0 },
};

static PalPadFriendList sPalPadFriendList;

static inline void SetBit(u8 *bits, u32 index) {
    bits[index >> 3] |= (u8)(1 << (index & 7));
}

static inline void ClearBit(u8 *bits, u32 index) {
    bits[index >> 3] &= (u8) ~(1 << (index & 7));
}

static inline BOOL CheckBit(const u8 *bits, u32 index) {
    return (bits[index >> 3] >> (index & 7)) & 1;
}

// Whether the species is in a kind's list of seen or shown species
static BOOL PokedexSave_CheckKind(const u8 *lists, u32 speciesBytes, u32 kind, u16 species) {
    return CheckBit(lists + kind * speciesBytes, species - 1);
}

static BOOL PokedexSave_IsSeenNormal(const PokedexSpeciesBits *species, u16 number) {
    return PokedexSave_CheckKind(species->seen, species->speciesBytes, POKEDEX_KIND_MALE, number) ||
           PokedexSave_CheckKind(species->seen, species->speciesBytes, POKEDEX_KIND_FEMALE, number);
}

static BOOL PokedexSave_IsSeenRare(const PokedexSpeciesBits *species, u16 number) {
    return PokedexSave_CheckKind(species->seen, species->speciesBytes, POKEDEX_KIND_RARE_MALE, number) ||
           PokedexSave_CheckKind(species->seen, species->speciesBytes, POKEDEX_KIND_RARE_FEMALE, number);
}

static BOOL PokedexSave_IsShownRare(const PokedexSpeciesBits *species, u16 number) {
    return PokedexSave_CheckKind(species->shown, species->speciesBytes, POKEDEX_KIND_RARE_MALE, number) ||
           PokedexSave_CheckKind(species->shown, species->speciesBytes, POKEDEX_KIND_RARE_FEMALE, number);
}

// The directory's entry of a species, with the bit of its first form in base, or -1
static int PokedexSave_FindFormEntry(const PokedexFormBits *bits, u16 species, u32 *base) {
    u32 i;
    u32 bit = 0;

    for (i = 0; i < bits->entryCount; i++) {
        if (POKEDEX_FORM_ENTRY_SPECIES(bits->entries[i]) == species) {
            *base = bit;
            return i;
        }
        bit += POKEDEX_FORM_ENTRY_FORMS(bits->entries[i]);
    }
    return -1;
}

// A form list as the directory's entries
static u32 PokedexSave_EncodeFormList(const PokeDexFormEntry *list, u16 *entries) {
    u32 count;

    for (count = 0; list[count].species != 0; count++) {
        entries[count] = POKEDEX_FORM_ENTRY(list[count].species, list[count].count);
    }
    return count;
}

// Writes dest's form bits from src's, species by species of dest's directory: a species in both keeps its bits of
// the forms both have; one new to the directory has its form 0 seen in the normal or shiny list if the species was
// seen normal or shiny, since the Pokédex knew no other; one gone drops its bits. Then a seen species without a shown
// form gets form 0, in the list of its shown kind, so that PokeDex_GetShownSexRareForm always finds one
static void PokedexSave_RemapForms(const PokedexFormBits *src, const PokedexFormBits *dest,
                                   const PokedexSpeciesBits *species) {
    u32 i;
    u32 list;
    u32 form;
    u32 forms;
    u32 srcBase;
    u32 destBase = 0;
    int srcIndex;
    u16 number;
    BOOL shown;

    for (list = 0; list < FORM_LIST_COUNT; list++) {
        MI_CpuFill8(dest->lists[list], 0, dest->listBytes);
    }
    for (i = 0; i < dest->entryCount; i++) {
        number = POKEDEX_FORM_ENTRY_SPECIES(dest->entries[i]);
        forms = POKEDEX_FORM_ENTRY_FORMS(dest->entries[i]);
        srcIndex = PokedexSave_FindFormEntry(src, number, &srcBase);
        if (srcIndex != -1) {
            if (forms > POKEDEX_FORM_ENTRY_FORMS(src->entries[srcIndex])) {
                forms = POKEDEX_FORM_ENTRY_FORMS(src->entries[srcIndex]);
            }
            for (form = 0; form < forms; form++) {
                for (list = 0; list < FORM_LIST_COUNT; list++) {
                    if (CheckBit(src->lists[list], srcBase + form)) {
                        SetBit(dest->lists[list], destBase + form);
                    }
                }
            }
        } else {
            if (PokedexSave_IsSeenNormal(species, number)) {
                SetBit(dest->lists[FORM_LIST_SEEN], destBase);
            }
            if (PokedexSave_IsSeenRare(species, number)) {
                SetBit(dest->lists[FORM_LIST_SEEN_RARE], destBase);
            }
        }
        forms = POKEDEX_FORM_ENTRY_FORMS(dest->entries[i]);
        if (PokedexSave_IsSeenNormal(species, number) || PokedexSave_IsSeenRare(species, number)) {
            shown = FALSE;
            for (form = 0; form < forms; form++) {
                if (CheckBit(dest->lists[FORM_LIST_SHOWN], destBase + form) ||
                    CheckBit(dest->lists[FORM_LIST_SHOWN_RARE], destBase + form)) {
                    shown = TRUE;
                }
            }
            if (!shown) {
                if (PokedexSave_IsShownRare(species, number)) {
                    SetBit(dest->lists[FORM_LIST_SHOWN_RARE], destBase);
                } else {
                    SetBit(dest->lists[FORM_LIST_SHOWN], destBase);
                }
            }
        }
        destBase += forms;
    }
}

// The area's form bits and its directory, or the original block's and their list
static void PokedexSave_GetAreaFormBits(PokeDexSave *pokedex, PokedexFormBits *bits) {
    bits->lists[FORM_LIST_SEEN] = pokedex->seenForms;
    bits->lists[FORM_LIST_SEEN_RARE] = pokedex->seenForms + POKEDEX_FORM_BYTES;
    bits->lists[FORM_LIST_SHOWN] = pokedex->shownForms;
    bits->lists[FORM_LIST_SHOWN_RARE] = pokedex->shownForms + POKEDEX_FORM_BYTES;
    bits->listBytes = POKEDEX_FORM_BYTES;
    bits->entries = pokedex->formEntries;
    bits->entryCount = pokedex->formEntryCount;
}

static void PokedexSave_GetVanillaFormBits(PokeDexVanillaSave *vanilla, u16 *entries, PokedexFormBits *bits) {
    bits->lists[FORM_LIST_SEEN] = vanilla->seenForms;
    bits->lists[FORM_LIST_SEEN_RARE] = vanilla->seenForms + POKEDEX_VANILLA_FORM_BYTES;
    bits->lists[FORM_LIST_SHOWN] = vanilla->shownForms;
    bits->lists[FORM_LIST_SHOWN_RARE] = vanilla->shownForms + POKEDEX_VANILLA_FORM_BYTES;
    bits->listBytes = POKEDEX_VANILLA_FORM_BYTES;
    bits->entries = entries;
    bits->entryCount = PokedexSave_EncodeFormList(sPokedexVanillaFormList, entries);
}

// Whether the Pal Pad's block holds the area: its magic, a version, and a directory that fits its lists. An old
// save's Pal Pad is zeros, or a friend's PlayerInfo, whose name would have to begin with the magic's two characters
static BOOL PokedexSave_IsArea(const PokeDexSave *pokedex) {
    u32 i;
    u32 bits = 0;

    if (pokedex->magic != POKEDEX_SAVE_MAGIC || pokedex->version == 0 ||
        pokedex->formEntryCount > POKEDEX_FORM_ENTRY_MAX) {
        return FALSE;
    }
    for (i = 0; i < pokedex->formEntryCount; i++) {
        bits += POKEDEX_FORM_ENTRY_FORMS(pokedex->formEntries[i]);
    }
    return bits <= POKEDEX_FORM_BYTES * 8;
}

// Builds the area from an old save's original block: its header, the same bits of the species lists and languages,
// and the form bits remapped from the original block's form list to the ROM's
static void PokedexSave_Upgrade(PokeDexSave *pokedex, PokeDexVanillaSave *vanilla) {
    u16 vanillaEntries[POKEDEX_FORM_ENTRY_MAX];
    PokedexFormBits src;
    PokedexFormBits dest;
    PokedexSpeciesBits species;
    u32 kind;

    initPokedex(pokedex);
    pokedex->nationalObtained = vanilla->nationalObtained;
    pokedex->habitatListEnabled = vanilla->habitatListEnabled;
    pokedex->given = vanilla->given;
    pokedex->mode = vanilla->mode;
    pokedex->lastSpecies = vanilla->lastSpecies;
    pokedex->spindaPersonality = vanilla->spindaPersonality;
    MI_CpuCopy8(vanilla->caught, pokedex->caught, POKEDEX_VANILLA_SPECIES_BYTES);
    for (kind = 0; kind < POKEDEX_KIND_COUNT; kind++) {
        MI_CpuCopy8(vanilla->seen + kind * POKEDEX_VANILLA_SPECIES_BYTES, pokedex->seen + kind * POKEDEX_SPECIES_BYTES,
                    POKEDEX_VANILLA_SPECIES_BYTES);
        MI_CpuCopy8(vanilla->shown + kind * POKEDEX_VANILLA_SPECIES_BYTES,
                    pokedex->shown + kind * POKEDEX_SPECIES_BYTES, POKEDEX_VANILLA_SPECIES_BYTES);
    }
    MI_CpuCopy8(vanilla->languages, pokedex->languages, POKEDEX_VANILLA_LANGUAGE_BYTES);
    PokedexSave_GetVanillaFormBits(vanilla, vanillaEntries, &src);
    PokedexSave_GetAreaFormBits(pokedex, &dest);
    species.seen = pokedex->seen;
    species.shown = pokedex->shown;
    species.speciesBytes = POKEDEX_SPECIES_BYTES;
    PokedexSave_RemapForms(&src, &dest, &species);
}

// Remaps the area's form bits from the directory it records to the ROM's
static void PokedexSave_RemapToRom(PokeDexSave *pokedex, const u16 *entries, u32 count) {
    PokedexFormBackup *backup = GFL_HeapAllocate(HEAPID_TAIL(HEAPID_USER), sizeof(PokedexFormBackup), FALSE,
                                                 "paperwhite2_pokedex_save.c", __LINE__);
    PokedexFormBits src;
    PokedexFormBits dest;
    PokedexSpeciesBits species;
    u32 list;

    PokedexSave_GetAreaFormBits(pokedex, &dest);
    for (list = 0; list < FORM_LIST_COUNT; list++) {
        MI_CpuCopy8(dest.lists[list], backup->lists[list], POKEDEX_FORM_BYTES);
        src.lists[list] = backup->lists[list];
    }
    MI_CpuCopy8(pokedex->formEntries, backup->entries, sizeof(backup->entries));
    src.listBytes = POKEDEX_FORM_BYTES;
    src.entries = backup->entries;
    src.entryCount = pokedex->formEntryCount;
    MI_CpuFill8(pokedex->formEntries, 0, sizeof(pokedex->formEntries));
    MI_CpuCopy8(entries, pokedex->formEntries, count * sizeof(u16));
    pokedex->formEntryCount = count;
    dest.entryCount = count;
    species.seen = pokedex->seen;
    species.shown = pokedex->shown;
    species.speciesBytes = POKEDEX_SPECIES_BYTES;
    PokedexSave_RemapForms(&src, &dest, &species);
    GFL_HeapFree(backup);
}

u32 PaperWhite2_PokedexSave_GetFormDirectory(u16 *entries) {
    return PokedexSave_EncodeFormList(PokeDex_PaperWhite2_GetFormList(), entries);
}

void PaperWhite2_PokedexSave_Sync(SaveControl *save) {
    PokeDexSave *pokedex = getPokedexSaveAddress(save);
    PokeDexVanillaSave *vanilla = SaveControl_GetBlockPtr(save, SAVE_BLOCK_POKEDEX);
    u16 entries[POKEDEX_FORM_ENTRY_MAX];
    u32 count;

    if (!PokedexSave_IsArea(pokedex)) {
        if (vanilla->magic == POKEDEX_MAGIC) {
            PokedexSave_Upgrade(pokedex, vanilla);
        } else {
            initPokedex(pokedex);
        }
        return;
    }
    count = PaperWhite2_PokedexSave_GetFormDirectory(entries);
    if (count != pokedex->formEntryCount || MI_CpuComp8(entries, pokedex->formEntries, count * sizeof(u16)) != 0) {
        PokedexSave_RemapToRom(pokedex, entries, count);
    }
}

void PaperWhite2_PokedexSave_Mirror(SaveControl *save) {
    PokeDexSave *pokedex = getPokedexSaveAddress(save);
    PokeDexVanillaSave *vanilla = SaveControl_GetBlockPtr(save, SAVE_BLOCK_POKEDEX);
    u16 vanillaEntries[POKEDEX_FORM_ENTRY_MAX];
    PokedexFormBits src;
    PokedexFormBits dest;
    PokedexSpeciesBits species;
    u32 kind;
    u32 bit;

    vanilla->magic = POKEDEX_MAGIC;
    vanilla->nationalObtained = pokedex->nationalObtained;
    vanilla->habitatListEnabled = pokedex->habitatListEnabled;
    vanilla->given = pokedex->given;
    vanilla->mode = pokedex->mode;
    // The original's field has 10 bits, and its species end at Genesect
    vanilla->lastSpecies = pokedex->lastSpecies <= SPECIES_GENESECT ? pokedex->lastSpecies : 0;
    vanilla->spindaPersonality = pokedex->spindaPersonality;
    MI_CpuCopy8(pokedex->caught, vanilla->caught, POKEDEX_VANILLA_SPECIES_BYTES);
    for (kind = 0; kind < POKEDEX_KIND_COUNT; kind++) {
        MI_CpuCopy8(pokedex->seen + kind * POKEDEX_SPECIES_BYTES, vanilla->seen + kind * POKEDEX_VANILLA_SPECIES_BYTES,
                    POKEDEX_VANILLA_SPECIES_BYTES);
        MI_CpuCopy8(pokedex->shown + kind * POKEDEX_SPECIES_BYTES,
                    vanilla->shown + kind * POKEDEX_VANILLA_SPECIES_BYTES, POKEDEX_VANILLA_SPECIES_BYTES);
    }
    // The original's lists have room past Genesect, for species it never has
    for (bit = SPECIES_GENESECT; bit < POKEDEX_VANILLA_SPECIES_BYTES * 8; bit++) {
        ClearBit(vanilla->caught, bit);
        for (kind = 0; kind < POKEDEX_KIND_COUNT; kind++) {
            ClearBit(vanilla->seen + kind * POKEDEX_VANILLA_SPECIES_BYTES, bit);
            ClearBit(vanilla->shown + kind * POKEDEX_VANILLA_SPECIES_BYTES, bit);
        }
    }
    MI_CpuCopy8(pokedex->languages, vanilla->languages, POKEDEX_VANILLA_LANGUAGE_BYTES);
    for (bit = POKEDEX_VANILLA_LANGUAGE_SPECIES_MAX * POKEDEX_LANGUAGE_COUNT; bit < POKEDEX_VANILLA_LANGUAGE_BYTES * 8;
         bit++) {
        ClearBit(vanilla->languages, bit);
    }
    PokedexSave_GetAreaFormBits(pokedex, &src);
    PokedexSave_GetVanillaFormBits(vanilla, vanillaEntries, &dest);
    species.seen = vanilla->seen;
    species.shown = vanilla->shown;
    species.speciesBytes = POKEDEX_VANILLA_SPECIES_BYTES;
    PokedexSave_RemapForms(&src, &dest, &species);
}

u32 PaperWhite2_PokedexVanillaSave_GetSize(void) {
    return sizeof(PokeDexVanillaSave);
}

void PaperWhite2_PokedexVanillaSave_Init(PokeDexVanillaSave *pokedex) {
    MI_CpuFill8(pokedex, 0, sizeof(PokeDexVanillaSave));
    pokedex->magic = POKEDEX_MAGIC;
    pokedex->given = 1;
}

PalPadFriendList *PaperWhite2_GetPalPadFriendList(void) {
    return &sPalPadFriendList;
}

// The area is the whole Pal Pad block, whose size an old save has, and the original block keeps its own
typedef char PokedexSaveSizeCheck[sizeof(PokeDexSave) == sizeof(PalPadFriendList) ? 1 : -1];
typedef char PokedexVanillaSaveSizeCheck[sizeof(PokeDexVanillaSave) == 0x4dc ? 1 : -1];
