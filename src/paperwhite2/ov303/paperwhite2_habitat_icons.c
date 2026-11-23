#include "types.h"
#include "app/pokedex_habitat.h"
#include "app/pokedex_habitat_graphic.h"
#include "app/ui/ui_scene.h"
#include "gfl/arc.h"
#include "gfl/arc_util.h"
#include "gfl/clact.h"
#include "gfl/heap.h"
#include "nnsys/g2d.h"
#include "paperwhite2/habitat_icons.h"
#include "paperwhite2/icon_ext.h"
#include "paperwhite2/icon_palettes.h"
#include "system/palanm.h"

// Paper White 2: the Habitat list's icons on their own battle colours (include/paperwhite2/habitat_icons.h)

void PaperWhite2_HabitatIcons_InitRes(UIObjRes *res) {
    ClActSys_FreeChars(res->chars);
    res->chars = ClActSys_AllocChars(HABITAT_ICONS_SIZE_8BPP, CLACT_VRAM_MAIN, HEAPID_POKEDEX_HABITAT);
}

void PaperWhite2_HabitatIcons_Init(PokedexHabitatGraphic *graphic) {
    NNSG2dImagePaletteProxy proxy;
    u32 i;
    u32 j;

    for (i = 0; i < POKEDEX_HABITAT_ICON_COUNT; i++) {
        ClActor *actor = graphic->icons[i];
        BOOL shared = FALSE;

        // Each cell's resources have their own copy of the cells, but one shared with an earlier cell is set once
        for (j = 0; j < i && !shared; j++) {
            shared = graphic->icons[j]->anim.cells == actor->anim.cells;
        }
        if (!shared) {
            PaperWhite2_IconExt_SetCells8bpp(actor->anim.cells);
        }
        // The palette is the extended palette's number itself, whatever row the palette resource is at
        ClActor_GetPlttProxy(actor, &proxy);
        NNS_G2dSetImagePaletteLocation(&proxy, NNS_G2D_VRAM_TYPE_2DMAIN, 0);
        ClActor_SetPlttProxy(actor, &proxy);
        ClActor_SetPalette(actor, i / ICON_EXT_BANDS, 1);
    }
}

void PaperWhite2_HabitatIcons_Load(PokedexHabitatGraphic *graphic, u8 cell, u32 species, u32 form, u32 sex) {
    NNSG2dCharacterData *chars;
    void *file = GFL_G2DIOReadOBJNCGRArc(graphic->iconArc, PaperWhite2_GetIconBattleFile(species, form, sex, FALSE),
                                         FALSE, &chars, HEAPID_POKEDEX_HABITAT);
    u8 *pixels = GFL_HeapAllocate(HEAPID_POKEDEX_HABITAT | HEAPID_TAIL_BIT, HABITAT_ICONS_SIZE_8BPP, FALSE,
                                  "paperwhite2_habitat_icons.c", __LINE__);

    PaperWhite2_IconExt_Convert(pixels, chars->pRawData, HABITAT_ICONS_SIZE, cell % ICON_EXT_BANDS);
    ClActSys_WriteCharData(ClActor_GetCharIdx(graphic->icons[cell]), pixels, HABITAT_ICONS_SIZE_8BPP, 0,
                           CLACT_VRAM_MAIN);
    GFL_HeapFree(pixels);
    GFL_HeapFree(file);
    PaperWhite2_ReadIconColours(graphic->iconColours, species, form, sex, FALSE, FALSE);
    PaletteFade_LoadData(graphic->paletteFade, graphic->iconColours, PALFADE_BUFFER_MAIN_OBJ_EX,
                         cell * ICON_BATTLE_COLOURS, sizeof(graphic->iconColours));
    graphic->iconPaletteChanged = TRUE;
}

void PaperWhite2_HabitatIcons_VBlank(PokedexHabitatGraphic *graphic) {
    if (graphic->iconPaletteChanged) {
        graphic->iconPaletteChanged = FALSE;
        PaperWhite2_IconExt_Upload(PaletteFade_GetFadedBuffer(graphic->paletteFade, PALFADE_BUFFER_MAIN_OBJ_EX), 0,
                                   HABITAT_ICONS_EXT_PALETTES * ICON_EXT_COLOURS * sizeof(u16), FALSE);
    }
}
