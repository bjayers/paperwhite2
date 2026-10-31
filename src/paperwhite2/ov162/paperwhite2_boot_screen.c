#include "types.h"
#include "constants/arc.h"
#include "gfl/arc_util.h"
#include "gfl/bg_sys.h"
#include "gfl/heap.h"
#include "nitro/gx.h"
#include "nnsys/g2d.h"
#include "paperwhite2/boot_screen.h"

// Paper White 2: the hack's own boot screen (paperwhite2/boot_screen.h), loaded as the copyright notice is

// ARCID_COPYRIGHT's members of the screen, after the original's 0 to 8
#define NARC_BOOT_SCREEN_NCLR 9
#define NARC_BOOT_SCREEN_TOP_NCGR 10
#define NARC_BOOT_SCREEN_TOP_NSCR 11
#define NARC_BOOT_SCREEN_TOUCH_NCGR 12
#define NARC_BOOT_SCREEN_TOUCH_NSCR 13
#define BOOT_SCREEN_CHAR_SIZE 0x8000

BOOL PaperWhite2_BootScreen_HasArt(HeapID heapId) {
    NNSG2dPaletteData *palette;
    void *file = GFL_G2DIOReadNCLR(ARCID_COPYRIGHT, NARC_BOOT_SCREEN_NCLR, &palette, heapId);
    const u16 *colors = palette->pRawData;
    BOOL hasArt = FALSE;
    u32 i;

    for (i = 0; i < palette->szByte / sizeof(u16); i++) {
        if ((colors[i] & GX_RGB(31, 31, 31)) != 0) {
            hasArt = TRUE;
            break;
        }
    }
    GFL_HeapFree(file);
    return hasArt;
}

void PaperWhite2_BootScreen_Load(HeapID heapId) {
    GFL_BGSysLoadNCGRStatic(ARCID_COPYRIGHT, NARC_BOOT_SCREEN_TOP_NCGR, 1, 0, BOOT_SCREEN_CHAR_SIZE, FALSE, heapId);
    loadBGScrToVramByNarcNoReserveNegAlign(ARCID_COPYRIGHT, NARC_BOOT_SCREEN_TOP_NSCR, 1, 0, 0, FALSE, heapId);
    GFL_BGSysLoadNCLRDefault(ARCID_COPYRIGHT, NARC_BOOT_SCREEN_NCLR, 0, 0, 0, heapId);
    GFL_BGSysLoadNCGRStatic(ARCID_COPYRIGHT, NARC_BOOT_SCREEN_TOUCH_NCGR, 5, 0, BOOT_SCREEN_CHAR_SIZE, FALSE, heapId);
    loadBGScrToVramByNarcNoReserveNegAlign(ARCID_COPYRIGHT, NARC_BOOT_SCREEN_TOUCH_NSCR, 5, 0, 0, FALSE, heapId);
    GFL_BGSysLoadNCLRDefault(ARCID_COPYRIGHT, NARC_BOOT_SCREEN_NCLR, 4, 0, 0, heapId);
    GFL_BGSysLoadScr(1);
    GFL_BGSysLoadScr(5);
}
