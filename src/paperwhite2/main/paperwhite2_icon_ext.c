#include "types.h"
#include "nitro/gx.h"
#include "nitro/os.h"
#include "nnsys/g2d.h"
#include "paperwhite2/icon_ext.h"

// Paper White 2: party icons as 8bpp OBJs on extended palettes (include/paperwhite2/icon_ext.h)

void PaperWhite2_IconExt_SetCells8bpp(NNSG2dCellDataBank *cells) {
    u16 i;
    u16 j;

    for (i = 0; i < cells->numCells; i++) {
        // The screen's own copy, loaded on the heap, which the renderer reads through const pointers
        NNSG2dCellData *cell = (NNSG2dCellData *)NNS_G2dGetCellDataByIdx(cells, i);

        for (j = 0; j < cell->numOAMAttrs; j++) {
            NNSG2dCellOAMAttrData *oam = &cell->pOamAttrArray[j];
            u16 name = (oam->attr2 & GX_OAM_ATTR2_NAME_MASK) * 2;

            oam->attr0 |= GX_OAM_ATTR01_CM_MASK;
            oam->attr2 = (oam->attr2 & ~GX_OAM_ATTR2_NAME_MASK) | (name & GX_OAM_ATTR2_NAME_MASK);
        }
    }
}

void PaperWhite2_IconExt_Convert(u8 *dest, const u8 *src, u32 size, u32 band) {
    u32 base = band * (ICON_EXT_COLOURS / ICON_EXT_BANDS);
    u32 i;

    for (i = 0; i < size; i++) {
        u32 left = src[i] & 0xf;
        u32 right = src[i] >> 4;

        dest[i * 2] = left != 0 ? base + left : 0;
        dest[i * 2 + 1] = right != 0 ? base + right : 0;
    }
}

void PaperWhite2_IconExt_Upload(const u16 *colours, u32 offset, u32 size, BOOL sub) {
    DC_FlushRange(colours, size);
    if (sub) {
        GXS_BeginLoadOBJExtPltt();
        GXS_LoadOBJExtPltt(colours, offset, size);
        GXS_EndLoadOBJExtPltt();
    } else {
        GX_BeginLoadOBJExtPltt();
        GX_LoadOBJExtPltt(colours, offset, size);
        GX_EndLoadOBJExtPltt();
    }
}
