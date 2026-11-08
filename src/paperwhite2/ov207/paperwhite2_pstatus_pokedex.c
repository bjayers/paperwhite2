#include "types.h"
#include "app/p_status.h"
#include "constants/arc.h"
#include "gfl/arc.h"
#include "gfl/arc_util.h"
#include "gfl/clact.h"
#include "gfl/heap.h"
#include "gfl/key.h"
#include "gfl/touchpanel.h"
#include "paperwhite2/pokedex_shortcut.h"

// Paper White 2: the summary screen's INFO button, which opens the Pokédex's page of the Pokémon shown
// (paperwhite2/pokedex_shortcut.h). It is the Pokédex touch bar's INFO (pokedex_detail_touchbar.c), its characters,
// cells and animations from the Pokédex's graphics, on the bar between the pages' tabs and the shortcut's checkbox,
// where the ribbons' tab shows for a Pokémon with ribbons. The bar's main OBJ palette has one free row, 15, so the
// button's two palettes, the normal one and the pushed one that its push flashes with, take turns there: the actor
// draws every object in row 15 (ClActor_SetPalette's mode 1), whatever its cell names, and the row gets the pushed
// colors while the push shows a cell of the pushed palette

// The Pokédex's graphics: the touch bar's palettes (normal, pushed, and a third the summary doesn't use), characters,
// cells and animations, and the INFO icon's animations, its normal one and its push, which alternates the pushed
// cells and the normal ones every 4 frames
#define TOUCHBAR_NCLR 3
#define TOUCHBAR_NCGR 13
#define TOUCHBAR_NCER 28
#define TOUCHBAR_NANR 45
#define INFO_SEQUENCE 0
#define INFO_PUSHED_SEQUENCE 4

// The main OBJ palette row free on the summary screen
#define BUTTON_PALETTE_ROW 15

// Where the button is on the bottom screen: 32 by 24, centred between the skills tab (to 80) and the checkbox (from
// 124), in the ribbons' tab's place, as high as the bar's other buttons
#define BUTTON_X 84
#define BUTTON_Y 168
#define BUTTON_WIDTH 32
#define BUTTON_HEIGHT 24

struct PStatusPokedexButton {
    u32 palette;
    u32 chars;
    u32 cellAnims;
    ClActor *actor;
    // The touch bar's palette file, and its pushed row, put in row 15 while the push shows a pushed cell
    void *paletteFile;
    NNSG2dPaletteData *normalColors;
    NNSG2dPaletteData pushedColors;
    BOOL pushedShown;
};

static const TouchRect sButtonRect[] = {
    { BUTTON_Y, BUTTON_Y + BUTTON_HEIGHT, BUTTON_X, BUTTON_X + BUTTON_WIDTH },
    { TOUCH_RECT_END, 0, 0, 0 },
};

BOOL PaperWhite2_PStatusPokedex_IsAvailable(const PStatusParam *param) {
    return param->fromFieldMenu == TRUE && param->mode == PSTATUS_MODE_NORMAL && param->dataType == PSTATUS_DATA_PARTY;
}

PStatusPokedexButton *PaperWhite2_PStatusPokedex_Create(ClActUnit *unit, HeapID heapId) {
    PStatusPokedexButton *button =
        GFL_HeapAllocate(heapId, sizeof(PStatusPokedexButton), TRUE, "paperwhite2_pstatus_pokedex.c", __LINE__);
    ArcTool *arc = GFL_ArcSysCreateFileHandle(ARCID_POKEDEX_GRA, heapId);
    ClActorSetup setup;

    button->palette =
        ClActSys_LoadPlttRange(arc, TOUCHBAR_NCLR, CLACT_VRAM_MAIN, BUTTON_PALETTE_ROW * 32, 0, 1, heapId);
    button->chars = ClActSys_LoadChars(arc, TOUCHBAR_NCGR, FALSE, CLACT_VRAM_MAIN, heapId);
    button->cellAnims = ClActSys_LoadCellAnims(arc, TOUCHBAR_NCER, TOUCHBAR_NANR, heapId);
    GFL_ArcToolFree(arc);
    button->paletteFile = GFL_G2DIOReadNCLR(ARCID_POKEDEX_GRA, TOUCHBAR_NCLR, &button->normalColors, heapId);
    button->pushedColors = *button->normalColors;
    button->pushedColors.pRawData = (u16 *)button->normalColors->pRawData + 16;

    setup.x = BUTTON_X;
    setup.y = BUTTON_Y;
    setup.sequence = INFO_SEQUENCE;
    setup.priority = 10;
    setup.bgPriority = 0;
    button->actor = ClActor_Create(unit, button->chars, button->palette, button->cellAnims, &setup, 0, heapId);
    ClActor_SetPalette(button->actor, 0, 1);
    ClActor_SetAutoAnim(button->actor, TRUE);
    ClActor_SetVisible(button->actor, FALSE);
    return button;
}

void PaperWhite2_PStatusPokedex_Free(PStatusPokedexButton *button) {
    ClActor_Delete(button->actor);
    GFL_HeapFree(button->paletteFile);
    ClActSys_FreePltt(button->palette);
    ClActSys_FreeChars(button->chars);
    ClActSys_FreeCellAnims(button->cellAnims);
    GFL_HeapFree(button);
}

void PaperWhite2_PStatusPokedex_SetVisible(PStatusPokedexButton *button, BOOL visible) {
    ClActor_SetVisible(button->actor, visible);
}

BOOL PaperWhite2_PStatusPokedex_IsPressed(PStatusPokedexButton *button) {
    if (GCTX_HIDGetPressedKeys() & PAD_BUTTON_START) {
        return TRUE;
    }
    return ClActor_IsVisible(button->actor) && GFL_HIDGetTouchPressedRect(sButtonRect) != TOUCH_RECT_NONE;
}

ClActor *PaperWhite2_PStatusPokedex_Push(PStatusPokedexButton *button) {
    ClActor_SetSequence(button->actor, INFO_PUSHED_SEQUENCE);
    return button->actor;
}

// The push's frames 0 and 2 show the pushed cells, 1 and 3 the normal ones
void PaperWhite2_PStatusPokedex_Update(PStatusPokedexButton *button) {
    BOOL pushed = ClActor_GetSequence(button->actor) == INFO_PUSHED_SEQUENCE && ClActor_IsAnimActive(button->actor) &&
                  ClActor_GetAnimFrame(button->actor) % 2 == 0;

    if (pushed != button->pushedShown) {
        button->pushedShown = pushed;
        ClActSys_ReplacePlttData(button->palette, pushed ? &button->pushedColors : button->normalColors, 1);
    }
}
