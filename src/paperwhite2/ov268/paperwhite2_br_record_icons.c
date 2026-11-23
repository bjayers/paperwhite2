#include "types.h"
#include "gfl/arc.h"
#include "gfl/arc_util.h"
#include "gfl/clact.h"
#include "gfl/heap.h"
#include "gfl/tcb.h"
#include "nitro/gx.h"
#include "nnsys/g2d.h"
#include "paperwhite2/br_record_icons.h"
#include "paperwhite2/icon_ext.h"
#include "paperwhite2/icon_palettes.h"
#include "save/battle_rec.h"

// Paper White 2: the Battle Recorder video screen's icons on their own battle colours
// (include/paperwhite2/br_record_icons.h)

// Extended palette 0's bands, one per icon, in main RAM for the DMA
static u16 sColours[BATTLE_REC_HEADER_PKM_MAX * ICON_BATTLE_COLOURS];
static TCB *sTask;
static BOOL sColoursChanged;

static void PaperWhite2_BrRecordIcons_VBlank(TCB *tcb, void *data) {
    if (sColoursChanged) {
        sColoursChanged = FALSE;
        PaperWhite2_IconExt_Upload(sColours, 0, sizeof(sColours), FALSE);
    }
}

u32 PaperWhite2_BrRecordIcons_LoadChars(ArcTool *handle, u32 species, u32 form, u32 sex, u32 band, HeapID heapId) {
    NNSG2dCharacterData *chars;
    u32 res = ClActSys_AllocChars(BR_RECORD_ICONS_SIZE_8BPP, CLACT_VRAM_MAIN, heapId);
    void *file = GFL_G2DIOReadOBJNCGRArc(handle, PaperWhite2_GetIconBattleFile(species, form, sex, FALSE), FALSE,
                                         &chars, HEAPID_TAIL(heapId));
    u8 *pixels = GFL_HeapAllocate(HEAPID_TAIL(heapId), BR_RECORD_ICONS_SIZE_8BPP, FALSE,
                                  "paperwhite2_br_record_icons.c", __LINE__);

    PaperWhite2_IconExt_Convert(pixels, chars->pRawData, BR_RECORD_ICONS_SIZE, band);
    ClActSys_WriteCharData(res, pixels, BR_RECORD_ICONS_SIZE_8BPP, 0, CLACT_VRAM_MAIN);
    GFL_HeapFree(pixels);
    GFL_HeapFree(file);
    PaperWhite2_ReadIconColours(&sColours[band * ICON_BATTLE_COLOURS], species, form, sex, FALSE, FALSE);
    return res;
}

void PaperWhite2_BrRecordIcons_InitActor(ClActor *actor) {
    NNSG2dImagePaletteProxy proxy;

    ClActor_GetPlttProxy(actor, &proxy);
    NNS_G2dSetImagePaletteLocation(&proxy, NNS_G2D_VRAM_TYPE_2DMAIN, 0);
    ClActor_SetPlttProxy(actor, &proxy);
    ClActor_SetPalette(actor, 0, 1);
}

void PaperWhite2_BrRecordIcons_Start(ClActor *first) {
    if (first == NULL) {
        return;
    }
    // The icons share one cell resource, the screen's own copy
    PaperWhite2_IconExt_SetCells8bpp(first->anim.cells);
    GX_SetBankForOBJExtPltt(GX_VRAM_OBJEXTPLTT_0_G);
    sColoursChanged = TRUE;
    sTask = GFL_VBlankTCBAdd(PaperWhite2_BrRecordIcons_VBlank, NULL, 0);
}

void PaperWhite2_BrRecordIcons_End(void) {
    if (sTask != NULL) {
        GFL_TCBRemove(sTask);
        sTask = NULL;
        GX_DisableBankForOBJExtPltt();
    }
}
