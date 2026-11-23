#include "types.h"
#include "constants/arc.h"
#include "constants/pokemon.h"
#include "gfl/arc.h"
#include "nitro/gx.h"
#include "nitro/os.h"
#include "paperwhite2/icon_palettes.h"
#include "pml/personal.h"
#include "pml/poke_party.h"
#include "system/poke_icon.h"

// Paper White 2: party/box icons on their own battle palettes (include/paperwhite2/icon_palettes.h,
// docs/paperwhite2/design/icon-screens.md)

// The bytes of an entry's colours: the normal ones, then the shiny ones
#define ICON_ENTRY_SIZE (ICON_BATTLE_COLOURS * 2 * sizeof(u16))

// The colours being loaded: in main RAM, since the palette loads copy by DMA, which can't read the stack in DTCM
static u16 sColours[ICON_BATTLE_COLOURS];

// A Pokémon's icon as the icon functions take it
typedef struct {
    u32 species;
    u32 form;
    u32 sex;
    BOOL egg;
    BOOL shiny;
} IconPkm;

static void IconPkm_Read(IconPkm *icon, BoxPkm *pkm) {
    BOOL wasEncrypted = PML_PkmDecrypt(pkm);

    icon->species = PML_PkmGetParam(pkm, PKM_PARAM_SPECIES, NULL);
    icon->form = PML_PkmGetParam(pkm, PKM_PARAM_FORM, NULL);
    icon->sex = PML_PkmGetParam(pkm, PKM_PARAM_SEX, NULL);
    icon->egg = PML_PkmGetParam(pkm, PKM_PARAM_IS_EGG, NULL);
    icon->shiny = PML_PkmIsRare(pkm);
    PML_PkmReEncrypt(pkm, wasEncrypted);
}

u32 PaperWhite2_GetIconEntry(u32 species, u32 form, u32 sex, BOOL egg) {
    // A palette-only form (Arceus') shows its species' icon file, so its colours and pixels have entries of their own
    if (!egg && form != 0 && PML_PersonalGetParamSingle(species, 0, PERSONAL_PALETTE_FORMS) &&
        form < PML_PersonalGetParamSingle(species, 0, PERSONAL_FORM_COUNT)) {
        return ICON_BATTLE_ICON_ENTRIES + PML_PersonalGetParamSingle(species, 0, PERSONAL_FORM_SPRITE_OFFSET) + form -
               1;
    }
    return PokeParty_GetIconIndex(species, form, sex, egg) - ICON_BATTLE_FIRST_FILE;
}

u32 PaperWhite2_GetIconBattleFile(u32 species, u32 form, u32 sex, BOOL egg) {
    return ICON_BATTLE_CHARS_MEMBER + PaperWhite2_GetIconEntry(species, form, sex, egg);
}

u32 PaperWhite2_GetIconBattleFileOfPkm(BoxPkm *pkm) {
    IconPkm icon;

    IconPkm_Read(&icon, pkm);
    return PaperWhite2_GetIconBattleFile(icon.species, icon.form, icon.sex, icon.egg);
}

void PaperWhite2_ReadIconColours(u16 *colours, u32 species, u32 form, u32 sex, BOOL egg, BOOL shiny) {
    u32 offset = PaperWhite2_GetIconEntry(species, form, sex, egg) * ICON_ENTRY_SIZE;

    if (shiny && !egg) {
        offset += ICON_BATTLE_COLOURS * sizeof(u16);
    }
    GFL_ArcSysReadRange(colours, ARCID_POKEICON, ICON_BATTLE_PALETTES_MEMBER, offset,
                        ICON_BATTLE_COLOURS * sizeof(u16));
}

void PaperWhite2_ReadIconColoursOfPkm(u16 *colours, BoxPkm *pkm) {
    IconPkm icon;

    IconPkm_Read(&icon, pkm);
    PaperWhite2_ReadIconColours(colours, icon.species, icon.form, icon.sex, icon.egg, icon.shiny);
}

void PaperWhite2_LoadIconPalette(u32 species, u32 form, u32 sex, BOOL egg, BOOL shiny, BOOL sub, u32 row) {
    PaperWhite2_ReadIconColours(sColours, species, form, sex, egg, shiny);
    DC_FlushRange(sColours, sizeof(sColours));
    if (sub) {
        GXS_LoadOBJPltt(sColours, row * sizeof(sColours), sizeof(sColours));
    } else {
        GX_LoadOBJPltt(sColours, row * sizeof(sColours), sizeof(sColours));
    }
}

void PaperWhite2_LoadIconPaletteOfPkm(BoxPkm *pkm, BOOL sub, u32 row) {
    IconPkm icon;

    IconPkm_Read(&icon, pkm);
    PaperWhite2_LoadIconPalette(icon.species, icon.form, icon.sex, icon.egg, icon.shiny, sub, row);
}

void PaperWhite2_LoadIconExtPalette(u32 species, u32 form, u32 sex, BOOL egg, BOOL shiny, BOOL sub, u32 extPalette,
                                    u32 band) {
    // An extended palette is 256 colours, 16 bands of a row's size
    u32 offset = (extPalette * ICON_BATTLE_COLOURS + band) * sizeof(sColours);

    PaperWhite2_ReadIconColours(sColours, species, form, sex, egg, shiny);
    DC_FlushRange(sColours, sizeof(sColours));
    if (sub) {
        GXS_BeginLoadOBJExtPltt();
        GXS_LoadOBJExtPltt(sColours, offset, sizeof(sColours));
        GXS_EndLoadOBJExtPltt();
    } else {
        GX_BeginLoadOBJExtPltt();
        GX_LoadOBJExtPltt(sColours, offset, sizeof(sColours));
        GX_EndLoadOBJExtPltt();
    }
}

void PaperWhite2_LoadIconExtPaletteOfPkm(BoxPkm *pkm, BOOL sub, u32 extPalette, u32 band) {
    IconPkm icon;

    IconPkm_Read(&icon, pkm);
    PaperWhite2_LoadIconExtPalette(icon.species, icon.form, icon.sex, icon.egg, icon.shiny, sub, extPalette, band);
}
