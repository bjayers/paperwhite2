#include "types.h"
#include "app/pokedex_list_main.h"
#include "constants/arc.h"
#include "gfl/arc.h"
#include "gfl/arc_util.h"
#include "gfl/clact.h"
#include "gfl/heap.h"
#include "nitro/gx.h"
#include "nitro/os.h"
#include "nnsys/g2d.h"
#include "paperwhite2/icon_ext.h"
#include "paperwhite2/icon_palettes.h"
#include "paperwhite2/pokedex_list_icons.h"
#include "system/palanm.h"

// Paper White 2: the Pokédex list's icons on their own battle colours (include/paperwhite2/pokedex_list_icons.h)

// The top screen's rows that its fades leave alone (PokedexListMain_StartFade's sub OBJ mask)
#define SUB_ROW_UNFADED 14
#define SUB_ROWS 16

static u32 PokedexListIcons_FindSubRow(PokedexListWork *wk, u32 n);

void PaperWhite2_PokedexListIcons_Init(PokedexListWork *wk) {
    NNSG2dImagePaletteProxy proxy;
    u32 i;

    // The touch screen's icons share one cell bank, the list's own copy
    PaperWhite2_IconExt_SetCells8bpp(wk->actors[POKEDEX_LIST_OBJ_ICON]->anim.cells);
    // Their palette is the extended palette's number itself, whatever row their palette resource is at
    for (i = 0; i < POKEDEX_LIST_ICON_COUNT; i++) {
        ClActor *actor = wk->actors[POKEDEX_LIST_OBJ_ICON + i];

        ClActor_GetPlttProxy(actor, &proxy);
        NNS_G2dSetImagePaletteLocation(&proxy, NNS_G2D_VRAM_TYPE_2DMAIN, 0);
        ClActor_SetPlttProxy(actor, &proxy);
        ClActor_SetPalette(actor, POKEDEX_LIST_ICON_EXT_PALETTE, 1);
    }
}

void PaperWhite2_PokedexListIcons_Load(PokedexListWork *wk, u32 id, u16 species, u16 form, u16 sex, BOOL touchScreen) {
    ArcTool *arc = GFL_ArcSysCreateFileHandle(ARCID_POKEICON, HEAPID_POKEDEX_LIST | HEAPID_TAIL_BIT);
    NNSG2dCharacterData *chars;
    void *file = GFL_G2DIOReadOBJNCGRArc(arc, PaperWhite2_GetIconBattleFile(species, form, sex, FALSE), FALSE, &chars,
                                         HEAPID_POKEDEX_LIST | HEAPID_TAIL_BIT);

    PaperWhite2_ReadIconColours(wk->iconColours, species, form, sex, FALSE, FALSE);
    if (touchScreen == TRUE) {
        u32 band = id - POKEDEX_LIST_OBJ_ICON;

        PaperWhite2_IconExt_Convert(wk->iconChars, chars->pRawData, POKEDEX_LIST_ICON_SIZE, band);
        ClActSys_WriteCharData(ClActor_GetCharIdx(wk->actors[id]), wk->iconChars, POKEDEX_LIST_ICON_SIZE_8BPP, 0,
                               CLACT_VRAM_MAIN);
        PaletteFade_LoadData(wk->paletteFade, wk->iconColours, PALFADE_BUFFER_MAIN_OBJ_EX,
                             POKEDEX_LIST_ICON_EXT_PALETTE * ICON_EXT_COLOURS + band * ICON_BATTLE_COLOURS,
                             sizeof(wk->iconColours));
        wk->iconPaletteChanged = TRUE;
    } else {
        u32 n = id - POKEDEX_LIST_OBJ_ICON_SUB;
        u32 row = PokedexListIcons_FindSubRow(wk, n);

        ClActSys_WriteCharData(ClActor_GetCharIdx(wk->actors[id]), chars->pRawData, POKEDEX_LIST_ICON_SIZE, 0,
                               CLACT_VRAM_SUB);
        PaletteFade_LoadData(wk->paletteFade, wk->iconColours, PALFADE_BUFFER_SUB_OBJ, row * ICON_BATTLE_COLOURS,
                             sizeof(wk->iconColours));
        DC_FlushRange(wk->iconColours, sizeof(wk->iconColours));
        GXS_LoadOBJPltt(wk->iconColours, row * sizeof(wk->iconColours), sizeof(wk->iconColours));
        wk->iconRowsSub[n] = row;
        // The top screen icons' palette resource is at row 0, and the window copy's palette doesn't show
        ClActor_SetPalette(wk->actors[id], row, 1);
    }
    GFL_HeapFree(file);
    GFL_ArcToolFree(arc);
}

// A row that no other shown icon of the top screen has: at most 8 show at once, of 15 rows
static u32 PokedexListIcons_FindSubRow(PokedexListWork *wk, u32 n) {
    u32 row;
    u32 i;

    for (row = 0; row < SUB_ROWS; row++) {
        BOOL taken = row == SUB_ROW_UNFADED;

        for (i = 0; i < POKEDEX_LIST_ICON_COUNT && !taken; i++) {
            taken = i != n && ClActor_IsVisible(wk->actors[POKEDEX_LIST_OBJ_ICON_SUB + i]) && wk->iconRowsSub[i] == row;
        }
        if (!taken) {
            return row;
        }
    }
    return 0;
}

void PaperWhite2_PokedexListIcons_VBlank(PokedexListWork *wk) {
    if (wk->iconPaletteChanged) {
        wk->iconPaletteChanged = FALSE;
        PaperWhite2_IconExt_Upload(PaletteFade_GetFadedBuffer(wk->paletteFade, PALFADE_BUFFER_MAIN_OBJ_EX), 0,
                                   ICON_EXT_COLOURS * sizeof(u16), FALSE);
    }
}
