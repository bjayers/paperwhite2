#include "types.h"
#include "gfl/clact.h"
#include "gfl/std.h"
#include "nitro/gx.h"
#include "nitro/hw.h"
#include "nitro/mi.h"
#include "nnsys/g2d.h"
#include "paperwhite2/box_icons.h"
#include "paperwhite2/icon_ext.h"
#include "paperwhite2/icon_palettes.h"

// Paper White 2: the PC box's Pokémon icons as 8bpp OBJs on extended palettes, each with its own battle colours. See
// include/paperwhite2/box_icons.h

// An extended palette's bands, each a standard row's 16 colours
#define BANDS (BOX_ICONS_EXT_COLOURS / ICON_BATTLE_COLOURS)
// The standard OBJ row that the outline draws with
#define OUTLINE_ROW 8

// The original search grey row's darkest and lightest greys (PokeIcon_GetAltPaletteFile's fourth row)
#define GREY_DARKEST 8
#define GREY_LIGHTEST 14

// RGB555's channels
#define RED(colour) ((colour) & 0x1f)
#define GREEN(colour) (((colour) >> 5) & 0x1f)
#define BLUE(colour) (((colour) >> 10) & 0x1f)

void PaperWhite2_BoxIcons_Init(PaperWhite2BoxIcons *icons, NNSG2dCellDataBank *cells) {
    PaperWhite2_IconExt_SetCells8bpp(cells);
    icons->changed = TRUE;
}

void PaperWhite2_BoxIcons_ReadColours(u16 *colours, BoxPkm *pkm, BOOL grey) {
    u32 i;

    PaperWhite2_ReadIconColoursOfPkm(colours, pkm);
    if (grey) {
        // Each colour's brightness as a grey, in the original grey row's range (8 to 14 of 31)
        for (i = 1; i < ICON_BATTLE_COLOURS; i++) {
            u32 light = (RED(colours[i]) * 77 + GREEN(colours[i]) * 150 + BLUE(colours[i]) * 29) >> 8;

            light = GREY_DARKEST + light * (GREY_LIGHTEST - GREY_DARKEST) / 31;
            colours[i] = GX_RGB(light, light, light);
        }
    }
}

void PaperWhite2_BoxIcons_Transfer(PaperWhite2BoxIcons *icons, ClActor *actor, u32 n, const u8 *chars,
                                   const u16 *colours) {
    PaperWhite2_IconExt_Convert(icons->chars, chars, BOX_ICONS_CHARS_4BPP, n % BANDS);
    ClActSys_WriteCharData(ClActor_GetCharIdx(actor), icons->chars, BOX_ICONS_CHARS_8BPP, 0, CLACT_VRAM_MAIN);
    PaperWhite2_BoxIcons_SetColours(icons, actor, n, colours);
}

void PaperWhite2_BoxIcons_SetColours(PaperWhite2BoxIcons *icons, ClActor *actor, u32 n, const u16 *colours) {
    u32 palette = n / BANDS;

    MI_CpuCopy16(colours, &icons->extPalettes[BOX_ICONS_FIRST_EXT_PALETTE + palette][(n % BANDS) * ICON_BATTLE_COLOURS],
                 ICON_BATTLE_COLOURS * sizeof(u16));
    ClActor_SetPalette(actor, palette, 1);
    icons->changed = TRUE;
}

void PaperWhite2_BoxIcons_VBlank(PaperWhite2BoxIcons *icons) {
    u32 i;

    if (icons->changed) {
        icons->changed = FALSE;
        MI_CpuCopy16((void *)HW_OBJ_PLTT, icons->extPalettes[0], sizeof(icons->extPalettes[0]));
        for (i = 0; i < BANDS; i++) {
            MI_CpuCopy16((u16 *)HW_OBJ_PLTT + OUTLINE_ROW * ICON_BATTLE_COLOURS,
                         &icons->extPalettes[BOX_ICONS_OUTLINE_EXT_PALETTE][i * ICON_BATTLE_COLOURS],
                         ICON_BATTLE_COLOURS * sizeof(u16));
        }
        PaperWhite2_IconExt_Upload(icons->extPalettes[0], 0, sizeof(icons->extPalettes), FALSE);
    }
}
