#include "types.h"
#include "app/pokedex_detail.h"
#include "app/pokedex_info.h"
#include "app/ui/ui_scene.h"
#include "constants/abilities.h"
#include "constants/arc.h"
#include "constants/items.h"
#include "constants/language.h"
#include "constants/pokemon.h"
#include "constants/sound.h"
#include "constants/species.h"
#include "constants/text_banks.h"
#include "gfl/bg_sys.h"
#include "gfl/bmp.h"
#include "gfl/clact.h"
#include "gfl/heap.h"
#include "gfl/key.h"
#include "gfl/msg.h"
#include "gfl/overlay.h"
#include "gfl/sound.h"
#include "gfl/std.h"
#include "gfl/str.h"
#include "gfl/tcb.h"
#include "gfl/touchpanel.h"
#include "gfl/ui.h"
#include "nitro/fx.h"
#include "nitro/gx.h"
#include "paperwhite2/pokedex_info.h"
#include "pml/personal.h"
#include "pml/poke_graphic.h"
#include "save/pokedex_savedata.h"
#include "system/app_taskmenu.h"
#include "system/game_data.h"
#include "system/gf_font.h"
#include "system/mcss.h"
#include "system/printsys.h"
#include "system/wordset.h"
#include "text/system/pokedex_data.h"

// Paper White 2: the Pokédex detail screen's info page (docs/paperwhite2/design/pokedex.md, step 2). The detail screen
// shows the main engine on the top screen while this page runs (pokedex_detail.c), so the top has the 3D: the
// Pokémon's entry from overlay 296, as the original's bottom screen showed it, with the battle's animated sprite (MCSS,
// on BG 0) where the still one was. The bottom screen, the sub engine's, has the sub-pages Stats, Data, Moves, Evo and
// Matchups (paperwhite2_pokedex_info_panels.c), and, on Stats, the buttons Cry, Turn, Form, Shiny, Language and
// Abilities in the menus' style. A button that can't do anything for the Pokémon is hidden, and the others keep their
// places. Abilities shows the species' abilities in turn in the entry's text window, in place of its description, and
// on Data that window shows the species' wild held items. On
// Matchups, a button for each of the species' abilities picks the one whose effect the type chart shows. Moves lists
// a set of the Pokémon's moves, with a panel of the cursor's move over the top screen
// (paperwhite2_pokedex_move_panel.c). Left and Right step through the sub-pages, and on Moves L and R through its sets;
// the touch bar's Left and Right (to Area, Cry and Forms, still there by touch) are the page's while it runs, and on
// Moves its Up and Down and, while the panel is open, its B

// Where the sprite stands on the top screen, in pixels: the middle of its feet, in the entry's left panel, where the
// original's still sprite had its 96 by 96 frame centered at 50, 72
#define SPRITE_X 50
#define SPRITE_Y 96
// The size of a pixel at the sprites' depth: the detail screen's camera (pokedex_detail_graphic.c), 70 units away with
// a 40 degree field of view, shows 2 * 70 * tan(20 degrees) units in the screen's 192 pixels
#define SPRITE_PIXEL_SIZE FX32_CONST(0.2654)
#define SCREEN_CENTER_X 128
#define SCREEN_CENTER_Y 96
// The sprites at once: the shown one, and room for its next while the old one is removed
#define SPRITE_CAPACITY 2

// The buttons' column on the bottom screen, in tiles, on POKEDEX_INFO_BUTTON_BG, with one place for each button
#define BUTTON_X 22
#define BUTTON_Y 3
#define BUTTON_WIDTH 9
#define BUTTON_HEIGHT 3
#define BUTTON_PITCH 3
// The text's colors in the buttons' palettes, as the menus' YES and NO have them
#define BUTTON_TEXT_COLOR PRINT_COLOR(14, 15, 3)

// The page's text in the entry's text window (PokedexInfo_BeginOtherText), in its pixels: its lines where the
// description's are, and the held items' rates ending (their last column the one before) as far in from the window's
// right as the lines start from its left. An ability's name is in the gold, which of the species' abilities it is in
// the entry's labels' grey, the rest in the entry's white
#define TOP_TEXT_X 2
#define TOP_TEXT_Y 5
#define TOP_TEXT_LINE_PITCH 16
#define TOP_TEXT_GOLD PRINT_COLOR(POKEDEX_INFO_TEXT_GOLD, POKEDEX_INFO_TEXT_SHADOW, 0)
#define TOP_TEXT_WHITE PRINT_COLOR(POKEDEX_INFO_TEXT_WHITE, POKEDEX_INFO_TEXT_SHADOW, 0)
#define TOP_TEXT_GREY PRINT_COLOR(POKEDEX_INFO_TEXT_GREY, POKEDEX_INFO_TEXT_SHADOW, 0)
// The wild held items, as the field gives them (FieldEncount_SetRandomHeldItem, enc_pokeset.c's HELD_ITEM_RATES): the
// first 50% and the second 5% of the time, the third 1% in dark grass only (its rate says so), and a first that is
// also the second always
#define HELD_ITEM_COUNT 3
#define HELD_ITEM_DARK_GRASS 2
#define HELD_ITEM_ALWAYS 100

// Matchups' ability buttons, in tiles: a row along the bottom of the sub-page above the touch bar, side by side and
// centered on ABILITY_BUTTON_CENTER_X, as many as the species has abilities. A name wider than the button's text area
// (its width less 16 pixels of frame) in font 0 is in font 1
#define ABILITY_BUTTON_CENTER_X 16
#define ABILITY_BUTTON_Y 18
#define ABILITY_BUTTON_WIDTH 10
#define ABILITY_BUTTON_HEIGHT 3
#define ABILITY_BUTTON_TEXT_WIDTH (ABILITY_BUTTON_WIDTH * 8 - 16)
// The two abilities and the hidden one
#define ABILITY_MAX 3

// The entry's languages other than the game's, as PokedexInfo numbers them, and the game's own after them
#define LANGUAGE_COUNT 6
#define LANGUAGE_GAME LANGUAGE_COUNT

// Seen with any sex, or in either color
#define SEX_ANY (GENDER_UNKNOWN + 1)
#define RARE_ANY 2

enum {
    SEQ_INIT,
    SEQ_FADE_IN,
    SEQ_WAIT_FADE_IN,
    SEQ_MAIN,
    SEQ_WAIT_FADE_OUT,
    SEQ_WAIT_HEADBAR,
    SEQ_EXIT,
};

// How the page ends
enum {
    EXIT_NONE,
    EXIT_PAGE,
    EXIT_SCREEN,
};

// The buttons, top to bottom
enum {
    BUTTON_CRY,
    BUTTON_TURN,
    BUTTON_FORM,
    BUTTON_SHINY,
    BUTTON_LANGUAGE,
    BUTTON_ABILITIES,
    BUTTON_COUNT,
};
#define BUTTON_NONE BUTTON_COUNT

typedef struct {
    PokedexInfo *entry;
    PokedexDetailBlend *blendMain;
    PokedexDetailBlend *blendSub;
    int exit;
    BOOL inputEnabled;
    // Font 0, and the categories, heights and weights, for the entry
    Font *font;
    MsgData *msgData[3];
    PokedexInfoPanels *panels;
    u32 subpage;
    AppTaskMenuRes *buttonRes;
    // The same buttons with font 1's text
    AppTaskMenuRes *smallButtonRes;
    // The shown sub-page's buttons: Stats' by BUTTON_*, Matchups' by ability
    AppTaskMenuWin *buttons[BUTTON_COUNT];
    // The button flashing after a touch, or BUTTON_NONE
    u32 pushed;
    MCSSSystem *mcssSys;
    MCSS *mcss;
    void *tcbBuffer;
    TCBManager *tcbMgr;
    // What the page shows: the Pokémon, its form, sex and color, Spinda's spots, whether it has been caught, its back
    // or its front, and the entry's language
    u16 species;
    u16 form;
    u16 sex;
    u16 rare;
    u32 personality;
    BOOL caught;
    BOOL back;
    u32 language;
    // The shown form's distinct abilities, the hidden one once caught, and the one Matchups shows, by its place
    u16 abilities[ABILITY_MAX];
    u32 abilityCount;
    u32 chosenAbility;
    // The ability that the top screen's text window shows on Stats, by its place in sAbilityParams, or ABILITY_MAX for
    // the description, and whether the window shows the page's text (an ability or the held items)
    u32 shownAbility;
    BOOL otherText;
    // Moves' set, which it keeps when another sub-page shows, and the top screen's panel of its moves
    PokedexInfoMoves moves;
    PokedexMovePanel *movePanel;
    // Whether Moves shows the panel: on as Moves is entered, by A and by a touch on a row, off by B
    BOOL movePanelOn;
    // The shown Pokémon's entry, under the open panel, is changed only as the panel closes
    BOOL entryStale;
    // A touch held on the scroll bar scrolls the list, and the panel shows the cursor's move as it lets go
    BOOL draggingKnob;
} PokedexInfoPageWork;

static void PokedexInfoPage_LoadPokemon(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                        PokedexDetailCommon *common);
static void PokedexInfoPage_ChangePokemon(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                          PokedexDetailCommon *common);
static void PokedexInfoPage_CheckInput(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                       PokedexDetailCommon *common);
static void PokedexInfoPage_SetSubpage(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                       PokedexDetailCommon *common, u32 subpage);
static void PokedexInfoPage_ShowSubpage(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                        PokedexDetailCommon *common);
static void PokedexInfoPage_ShowPanels(PokedexInfoPageWork *wk);
static void PokedexInfoPage_Step(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk, PokedexDetailCommon *common,
                                 BOOL forward);
static void PokedexInfoPage_SetMoveSet(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                       PokedexDetailCommon *common, u32 set);
static BOOL PokedexInfoPage_CheckMovesInput(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                            PokedexDetailCommon *common);
static BOOL PokedexInfoPage_CheckKnobDrag(PokedexInfoPageWork *wk, PokedexDetailCommon *common);
static void PokedexInfoPage_ShowMove(PokedexInfoPageWork *wk, PokedexDetailCommon *common);
static void PokedexInfoPage_UpdateMovePanel(PokedexInfoPageWork *wk, PokedexDetailCommon *common);
static void PokedexInfoPage_CloseMovePanel(PokedexInfoPageWork *wk);
static void PokedexInfoPage_TakeTouchbarKeys(PokedexInfoPageWork *wk, PokedexDetailCommon *common);
static void PokedexInfoPage_LoadAbilities(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk);
static void PokedexInfoPage_CreateMCSS(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk);
static void PokedexInfoPage_FreeMCSS(PokedexInfoPageWork *wk);
static void PokedexInfoPage_AddSprite(PokedexInfoPageWork *wk);
static void PokedexInfoPage_RemoveSprite(PokedexInfoPageWork *wk);
static void PokedexInfoPage_ResetButtons(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                         PokedexDetailCommon *common);
static void PokedexInfoPage_CreateAbilityButtons(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk);
static void PokedexInfoPage_FreeButtons(PokedexInfoPageWork *wk, PokedexDetailCommon *common);
static void PokedexInfoPage_UpdateButtons(PokedexInfoPageWork *wk, PokedexDetailCommon *common);
static BOOL PokedexInfoPage_CheckButtons(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                         PokedexDetailCommon *common);
static BOOL PokedexInfoPage_GetButtonPlace(PokedexInfoPageWork *wk, u32 button, u32 *x, u32 *y, u32 *width,
                                           u32 *height);
static void PokedexInfoPage_PressButton(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                        PokedexDetailCommon *common, u32 button);
static BOOL PokedexInfoPage_IsButtonUsable(PokedexInfoPageWork *wk, PokedexDetailCommon *common, u32 button);
static BOOL PokedexInfoPage_HasSeenForm(PokeDexSave *pokedex, u16 species, u32 form, u32 sex, u32 rare);
static u32 PokedexInfoPage_CountSeenForms(PokeDexSave *pokedex, u16 species);
static void PokedexInfoPage_NextForm(PokeDexSave *pokedex, PokedexInfoPageWork *wk);
static BOOL PokedexInfoPage_HasLanguage(PokeDexSave *pokedex, u16 species, u32 language);
static void PokedexInfoPage_NextShownAbility(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk);
static void PokedexInfoPage_ShowTopText(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk);
static void PokedexInfoPage_EndOtherText(PokedexInfoPageWork *wk);
static void PokedexInfoPage_DrawAbility(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk, GFLBitmap *bitmap);
static void PokedexInfoPage_DrawHeldItems(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk, GFLBitmap *bitmap);
static void PokedexInfoPage_DrawItemLine(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk, GFLBitmap *bitmap,
                                         MsgData *names, u32 line, u32 item, u32 rate, BOOL darkGrass);
static void PokedexInfoPage_DrawRight(PokedexInfoPageWork *wk, GFLBitmap *bitmap, const StrBuf *text, u32 y, u16 color);
static void PokedexInfoPage_DrawCentered(PokedexInfoPageWork *wk, GFLBitmap *bitmap, u32 messageId, u32 line);

// The language codes of PokedexInfo's languages: Japanese, French, German, Italian, Spanish and Korean
static const u8 sLanguageCodes[LANGUAGE_COUNT] = {
    LANGUAGE_JAPANESE, LANGUAGE_FRENCH, LANGUAGE_GERMAN, LANGUAGE_ITALIAN, LANGUAGE_SPANISH, LANGUAGE_KOREAN,
};

// The personal data's abilities, the hidden one last
static const u8 sAbilityParams[ABILITY_MAX] = {
    PERSONAL_ABILITY_1,
    PERSONAL_ABILITY_2,
    PERSONAL_ABILITY_HIDDEN,
};

static const u16 sButtonLabels[BUTTON_COUNT] = {
    PokedexData_Text_Cry,   PokedexData_Text_Turn,     PokedexData_Text_Form,
    PokedexData_Text_Shiny, PokedexData_Text_Language, PokedexData_Text_Abilities,
};

// Which of the species' abilities the top screen shows, by its place in sAbilityParams
static const u16 sAbilitySlotLabels[ABILITY_MAX] = {
    PokedexData_Text_AbilitySlot1,
    PokedexData_Text_AbilitySlot2,
    PokedexData_Text_AbilitySlotHidden,
};

// The held items' rates, by their place in the personal data
static const u8 sHeldItemRates[HELD_ITEM_COUNT] = { 50, 5, 1 };

BOOL PokedexInfoPage_Init(PokedexDetailProcSys *sys, int *seq, void *param_, void *work, PokedexDetailCommon *common) {
    PokedexDetailInfoParam *param = param_;
    PokedexInfoPageWork *wk;

    GFL_OvlLoad(OVERLAY_APP_UI);
    GFL_OvlLoad(OVERLAY_POKEDEX_INFO);
    wk = PokedexDetailProcSys_AllocWork(sys, sizeof(PokedexInfoPageWork), param->heapId);
    MI_CpuFill8(wk, 0, sizeof(PokedexInfoPageWork));
    wk->pushed = BUTTON_NONE;
    wk->language = LANGUAGE_GAME;
    wk->shownAbility = ABILITY_MAX;
    wk->blendMain = PokedexDetailBlend_Create(param->heapId);
    wk->blendSub = PokedexDetailBlend_Create(param->heapId);
    PokedexDetailBlend_InitPlanes(wk->blendMain);
    PokedexDetailBlend_InitPlanes(wk->blendSub);
    // The entry's text shares BG 1 with the head bar, so BG 1 fades with the page on the top screen, the bar with it
    wk->blendMain->plane1 |= GX_BLEND_PLANEMASK_BG1;
    wk->blendMain->plane2 |= GX_BLEND_PLANEMASK_BG1;
    PokedexDetailBlend_SetOut(0, wk->blendMain);
    PokedexDetailBlend_SetOut(1, wk->blendSub);
    wk->exit = EXIT_NONE;
    wk->inputEnabled = TRUE;
    return TRUE;
}

BOOL PokedexInfoPage_Exit(PokedexDetailProcSys *sys, int *seq, void *param_, void *work, PokedexDetailCommon *common) {
    PokedexInfoPageWork *wk = work;

    PokedexInfoPage_FreeButtons(wk, common);
    AppTaskMenuRes_Free(wk->smallButtonRes);
    AppTaskMenuRes_Free(wk->buttonRes);
    // The panel has the entry's text until it closes, as the page's end closes it
    PokedexInfoPage_CloseMovePanel(wk);
    PokedexMovePanel_Free(wk->movePanel);
    PokedexInfoPanels_Free(wk->panels);
    PokedexInfo_Free(wk->entry);
    GFL_FontFree(wk->font);
    GFL_MsgDataFree(wk->msgData[2]);
    GFL_MsgDataFree(wk->msgData[1]);
    GFL_MsgDataFree(wk->msgData[0]);
    PokedexDetailBlend_Free(wk->blendSub);
    PokedexDetailBlend_Free(wk->blendMain);
    // The other pages have the touch bar's keys
    PokedexDetailTouchbar_SetDisabledKeys(PokedexDetailCommon_GetTouchbar(common), 0);
    PokedexDetailProcSys_FreeWork(sys);
    GFL_OvlUnload(OVERLAY_POKEDEX_INFO);
    GFL_OvlUnload(OVERLAY_APP_UI);
    return TRUE;
}

BOOL PokedexInfoPage_Main(PokedexDetailProcSys *sys, int *seq, void *param_, void *work, PokedexDetailCommon *common) {
    PokedexDetailInfoParam *param = param_;
    PokedexInfoPageWork *wk = work;
    PokedexDetailGraphic *graphic = PokedexDetailCommon_GetGraphic(common);
    PokedexDetailTouchbar *touchbar = PokedexDetailCommon_GetTouchbar(common);
    PokedexDetailHeadbar *headbar = PokedexDetailCommon_GetHeadbar(common);

    switch (*seq) {
    case SEQ_INIT: {
        PokeDexSave *pokedex = GameData_GetPokedex(PokedexDetailCommon_GetGameData(common));
        BOOL national;
        u8 bg;

        *seq = SEQ_FADE_IN;
        wk->font = GFL_FontCreate(ARCID_FONT, 0, 1, FALSE, param->heapId);
        wk->msgData[0] = GFL_MsgSysLoadData(TRUE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_SPECIES_CATEGORIES, param->heapId);
        wk->msgData[1] = GFL_MsgSysLoadData(TRUE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_POKEDEX_HEIGHTS, param->heapId);
        wk->msgData[2] = GFL_MsgSysLoadData(TRUE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_POKEDEX_WEIGHTS, param->heapId);
        for (bg = 0; bg <= 7; bg++) {
            if (bg != 1 && bg != 5) {
                GFL_BGSysMoveBG(bg, BG_MOVE_SET_X, 0);
                GFL_BGSysMoveBG(bg, BG_MOVE_SET_Y, 0);
                GFL_BGSysClearBG(bg);
            }
        }

        if (PokedexDetailTouchbar_GetState(touchbar) != POKEDEX_DETAIL_TOUCHBAR_SHOWN) {
            PokedexDetailTouchbar_SetType(touchbar, POKEDEX_DETAIL_TOUCHBAR_GENERAL, POKEDEX_DETAIL_PAGE_INFO - 1,
                                          PokedexDetailCommon_GetCount(common) > 1 ? TRUE : FALSE);
            PokedexDetailTouchbar_Appear(touchbar, 0);
        } else {
            PokedexDetailTouchbar_SetPage(touchbar, POKEDEX_DETAIL_PAGE_INFO - 1);
        }
        PokedexDetailTouchbar_SetActive(touchbar, FALSE);
        PokedexInfoPage_TakeTouchbarKeys(wk, common);
        PokedexDetailTouchbar_SetCheck(
            touchbar, GameData_IsShortcutRegistered(PokedexDetailCommon_GetGameData(common), SHORTCUT_POKEDEX_INFO));
        // The entry moves BG 1 into place at once, so the bar is shown with it rather than sliding in, and both fade
        // in with the page
        if (PokedexDetailHeadbar_GetState(headbar) != POKEDEX_DETAIL_TOUCHBAR_SHOWN) {
            PokedexDetailHeadbar_SetTitle(headbar, 0);
            PokedexDetailHeadbar_Appear(headbar);
        }

        GX_SetGraphicsMode(GX_DISPMODE_GRAPHICS, GX_BGMODE_0, GX_BG0_AS_3D);
        PokedexDetailGraphic_Create3D(graphic, param->heapId);
        PokedexInfoPage_CreateMCSS(param, wk);

        switch (PokeDex_GetMode(pokedex)) {
        case 0:
            national = FALSE;
            break;
        case 1:
            national = TRUE;
            break;
        case 2:
            national = PokeDex_IsNationalObtained(pokedex);
            break;
        }
        PokedexInfoPage_LoadPokemon(param, wk, common);
        wk->entry = PokedexInfo_Create(param->heapId, wk->species, wk->form, wk->sex, wk->rare, wk->personality,
                                       national, wk->caught, 2, 0, 1, PokedexDetailGraphic_GetClActUnit(graphic),
                                       wk->font, PokedexDetailCommon_GetPrintQueue(common), wk->msgData[0],
                                       wk->msgData[1], wk->msgData[2]);
        GFL_BGSysSetBGEnabled(2, TRUE);
        GFL_BGSysSetBGEnabled(3, TRUE);
        PokedexInfoPage_AddSprite(wk);

        wk->panels =
            PokedexInfoPanels_Create(param->heapId, wk->font, PokedexDetailGraphic_GetClActUnit(graphic), &wk->moves);
        wk->movePanel =
            PokedexMovePanel_Create(param->heapId, wk->font, PokedexDetailGraphic_GetClActUnit(graphic), wk->blendMain);
        wk->buttonRes = AppTaskMenuRes_Create(POKEDEX_INFO_BUTTON_BG, POKEDEX_INFO_BUTTON_PALETTE, wk->font,
                                              PokedexDetailCommon_GetPrintQueue(common), param->heapId);
        wk->smallButtonRes = AppTaskMenuRes_Create(POKEDEX_INFO_BUTTON_BG, POKEDEX_INFO_BUTTON_PALETTE,
                                                   PokedexInfoPanels_GetSmallFont(wk->panels),
                                                   PokedexDetailCommon_GetPrintQueue(common), param->heapId);
        GFL_BGSysSetBGPriority(POKEDEX_INFO_BUTTON_BG, POKEDEX_INFO_ART_PRIORITY);
        GFL_BGSysSetBGEnabled(POKEDEX_INFO_BUTTON_BG, TRUE);
        wk->subpage = POKEDEX_INFO_SUBPAGE_STATS;
        PokedexInfoPage_ShowSubpage(param, wk, common);
        break;
    }
    case SEQ_FADE_IN:
        *seq = SEQ_WAIT_FADE_IN;
        PokedexDetailBlend_StartIn(wk->blendMain);
        PokedexDetailBlend_StartIn(wk->blendSub);
        break;
    case SEQ_WAIT_FADE_IN:
        if (!PokedexDetailBlend_IsActive(wk->blendMain) &&
            PokedexDetailTouchbar_GetState(touchbar) == POKEDEX_DETAIL_TOUCHBAR_SHOWN &&
            PokedexDetailHeadbar_GetState(headbar) == POKEDEX_DETAIL_TOUCHBAR_SHOWN) {
            PokedexDetailTouchbar_Unlock(touchbar);
            PokedexDetailTouchbar_SetActive(touchbar, TRUE);
            *seq = SEQ_MAIN;
        }
        break;
    case SEQ_MAIN:
        // Keys that the page gave back go back to the bar only now, after the frame that the page took them in, so
        // that the bar doesn't also see the key that closed the move panel
        PokedexInfoPage_TakeTouchbarKeys(wk, common);
        if (wk->exit != EXIT_NONE) {
            PokedexInfoPage_CloseMovePanel(wk);
            *seq = SEQ_WAIT_FADE_OUT;
            PokedexDetailBlend_StartOut(wk->blendMain);
            PokedexDetailBlend_StartOut(wk->blendSub);
            if (wk->exit == EXIT_SCREEN) {
                PokedexDetailTouchbar_Disappear(touchbar, 0);
            }
        } else if (!PokedexDetailTouchbar_IsArrowTriggered(touchbar) && wk->inputEnabled && wk->pushed == BUTTON_NONE) {
            PokedexInfoPage_CheckInput(param, wk, common);
        }
        break;
    case SEQ_WAIT_FADE_OUT:
        // The head bar slides out once the screen is dark, so the entry's text on its BG isn't seen moving with it
        if (!PokedexDetailBlend_IsActive(wk->blendMain) && !PokedexDetailBlend_IsActive(wk->blendSub)) {
            PokedexDetailHeadbar_Disappear(headbar);
            *seq = SEQ_WAIT_HEADBAR;
        }
        break;
    case SEQ_WAIT_HEADBAR:
        if (PokedexDetailHeadbar_GetState(headbar) == POKEDEX_DETAIL_TOUCHBAR_HIDDEN &&
            (wk->exit != EXIT_SCREEN || PokedexDetailTouchbar_GetState(touchbar) == POKEDEX_DETAIL_TOUCHBAR_HIDDEN)) {
            *seq = SEQ_EXIT;
        }
        break;
    case SEQ_EXIT:
        // The other pages expect BG 0 in 2D
        PokedexInfoPage_FreeMCSS(wk);
        PokedexDetailGraphic_Free3D(graphic);
        GX_SetGraphicsMode(GX_DISPMODE_GRAPHICS, GX_BGMODE_0, GX_BG0_AS_2D);
        return TRUE;
    }

    if (*seq >= SEQ_WAIT_FADE_IN) {
        PokedexInfo_Update(wk->entry);
        PokedexInfoPanels_Update(wk->panels);
        PokedexInfoPage_UpdateButtons(wk, common);
    }
    if (wk->mcssSys != NULL) {
        GFL_TCBMgrUpdate(wk->tcbMgr);
        MCSSSys_Update(wk->mcssSys);
    }
    PokedexDetailBlend_Update(wk->blendMain, wk->blendSub);
    return FALSE;
}

// As the original page: input waits while the touch bar's icons play their animations, and Up and Down change the
// Pokémon as their icons are pushed
void PokedexInfoPage_Command(PokedexDetailProcSys *sys, int *seq, void *param, void *work, PokedexDetailCommon *common,
                             int command) {
    PokedexInfoPageWork *wk = work;

    if (wk != NULL) {
        PokedexDetailTouchbar *touchbar = PokedexDetailCommon_GetTouchbar(common);
        BOOL unlock = FALSE;

        switch (command) {
        case POKEDEX_DETAIL_CMD_CLOSE_TOUCH:
        case POKEDEX_DETAIL_CMD_RETURN_TOUCH:
        case POKEDEX_DETAIL_CMD_CUR_D_TOUCH:
        case POKEDEX_DETAIL_CMD_CUR_U_TOUCH:
        case POKEDEX_DETAIL_CMD_CHECK_TOUCH:
        case POKEDEX_DETAIL_CMD_MAP_TOUCH:
        case POKEDEX_DETAIL_CMD_VOICE_TOUCH:
        case POKEDEX_DETAIL_CMD_FORM_TOUCH:
            wk->inputEnabled = FALSE;
            break;
        }
        switch (command) {
        case POKEDEX_DETAIL_CMD_CLOSE:
        case POKEDEX_DETAIL_CMD_RETURN:
        case POKEDEX_DETAIL_CMD_CUR_D:
        case POKEDEX_DETAIL_CMD_CUR_U:
        case POKEDEX_DETAIL_CMD_CHECK:
        case POKEDEX_DETAIL_CMD_MAP:
        case POKEDEX_DETAIL_CMD_VOICE:
        case POKEDEX_DETAIL_CMD_FORM:
            unlock = TRUE;
            wk->inputEnabled = TRUE;
            break;
        }

        switch (command) {
        case POKEDEX_DETAIL_CMD_CUR_D_TOUCH: {
            u16 species = PokedexDetailCommon_GetSpecies(common);

            PokedexDetailCommon_GoNext(common);
            if (species != PokedexDetailCommon_GetSpecies(common) && wk->entry != NULL) {
                PokedexInfoPage_ChangePokemon(param, wk, common);
            }
            break;
        }
        case POKEDEX_DETAIL_CMD_CUR_U_TOUCH: {
            u16 species = PokedexDetailCommon_GetSpecies(common);

            PokedexDetailCommon_GoPrev(common);
            if (species != PokedexDetailCommon_GetSpecies(common) && wk->entry != NULL) {
                PokedexInfoPage_ChangePokemon(param, wk, common);
            }
            break;
        }
        }

        switch (command) {
        case POKEDEX_DETAIL_CMD_NONE:
            break;
        case POKEDEX_DETAIL_CMD_CLOSE:
        case POKEDEX_DETAIL_CMD_RETURN:
            wk->exit = EXIT_SCREEN;
            break;
        case POKEDEX_DETAIL_CMD_MAP:
        case POKEDEX_DETAIL_CMD_VOICE:
        case POKEDEX_DETAIL_CMD_FORM:
            wk->exit = EXIT_PAGE;
            break;
        case POKEDEX_DETAIL_CMD_CUR_D:
        case POKEDEX_DETAIL_CMD_CUR_U:
            PokedexDetailTouchbar_Unlock(touchbar);
            break;
        case POKEDEX_DETAIL_CMD_CHECK:
            GameData_SetKeyItemRegistration(PokedexDetailCommon_GetGameData(common), SHORTCUT_POKEDEX_INFO,
                                            PokedexDetailTouchbar_GetCheck(touchbar));
            PokedexDetailTouchbar_Unlock(touchbar);
            break;
        default:
            if (unlock) {
                PokedexDetailTouchbar_Unlock(touchbar);
            }
            break;
        }
    }
}

void PokedexInfoPage_Draw(PokedexDetailProcSys *sys, int *seq, void *param, void *work, PokedexDetailCommon *common) {
    PokedexInfoPageWork *wk = work;

    if (wk != NULL && wk->mcssSys != NULL) {
        MCSSSys_Draw(wk->mcssSys);
    }
}

// The Pokémon the list is at, as the Pokédex shows it, from the front. The entry stays in its language if the
// Pokédex has the Pokémon's entry in it
static void PokedexInfoPage_LoadPokemon(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                        PokedexDetailCommon *common) {
    PokeDexSave *pokedex = GameData_GetPokedex(PokedexDetailCommon_GetGameData(common));
    u32 sex;
    u32 rare;
    u32 form;

    wk->species = PokedexDetailCommon_GetSpecies(common);
    PokeDex_GetShownSexRareForm(pokedex, wk->species, &sex, &rare, &form, param->heapId);
    wk->sex = sex;
    wk->rare = rare;
    wk->form = form;
    wk->personality = 0;
    if (wk->species == SPECIES_SPINDA) {
        wk->personality = PokeDex_GetSpindaPersonality(pokedex, 0);
    }
    wk->caught = PokeDex_IsCaught(pokedex, wk->species);
    wk->back = FALSE;
    wk->chosenAbility = 0;
    wk->shownAbility = ABILITY_MAX;
    if (!PokedexInfoPage_HasLanguage(pokedex, wk->species, wk->language)) {
        wk->language = LANGUAGE_GAME;
    }
}

// The move panel stays open on Moves, on the new Pokémon's first move, over the entry, which changes as it closes. The
// top screen's text window goes back to the description, but on Data, where it shows the new Pokémon's held items
static void PokedexInfoPage_ChangePokemon(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                          PokedexDetailCommon *common) {
    PokedexInfoPage_LoadPokemon(param, wk, common);
    if (PokedexMovePanel_IsOpen(wk->movePanel)) {
        wk->entryStale = TRUE;
    } else {
        if (wk->subpage != POKEDEX_INFO_SUBPAGE_DATA) {
            PokedexInfoPage_EndOtherText(wk);
        }
        PokedexInfo_SetPokemonInLanguage(wk->entry, wk->species, wk->form, wk->sex, wk->rare, wk->personality,
                                         wk->caught, wk->language);
    }
    PokedexInfoPage_RemoveSprite(wk);
    PokedexInfoPage_AddSprite(wk);
    PokedexInfoPage_ShowSubpage(param, wk, common);
}

// Touching a sub-page's tab switches to it, Moves takes its own touches and keys, and on Stats and Matchups touching a
// button pushes it; Left and Right step through the sub-pages
static void PokedexInfoPage_CheckInput(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                       PokedexDetailCommon *common) {
    u32 typed = GCTX_HIDGetTypedKeys();
    u32 touched = PokedexInfoPanels_GetTouchedSubpage();

    if (touched != POKEDEX_INFO_SUBPAGE_COUNT) {
        if (touched != wk->subpage) {
            GCTX_HIDSetUsingTouch(TRUE);
            PokedexInfoPage_SetSubpage(param, wk, common, touched);
        }
    } else if (wk->subpage == POKEDEX_INFO_SUBPAGE_MOVES && PokedexInfoPage_CheckMovesInput(param, wk, common)) {
        return;
    } else if (PokedexInfoPage_CheckButtons(param, wk, common)) {
        GCTX_HIDSetUsingTouch(TRUE);
    } else if (typed & PAD_KEY_RIGHT) {
        GCTX_HIDSetUsingTouch(FALSE);
        PokedexInfoPage_Step(param, wk, common, TRUE);
    } else if (typed & PAD_KEY_LEFT) {
        GCTX_HIDSetUsingTouch(FALSE);
        PokedexInfoPage_Step(param, wk, common, FALSE);
    }
}

// The next or the previous of the sub-pages, wrapping round: Stats, Data, Moves (in the set it showed last), Evo,
// Matchups
static void PokedexInfoPage_Step(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk, PokedexDetailCommon *common,
                                 BOOL forward) {
    u32 subpage;

    if (forward) {
        subpage = (wk->subpage + 1) % POKEDEX_INFO_SUBPAGE_COUNT;
    } else {
        subpage = (wk->subpage + POKEDEX_INFO_SUBPAGE_COUNT - 1) % POKEDEX_INFO_SUBPAGE_COUNT;
    }
    PokedexInfoPage_SetSubpage(param, wk, common, subpage);
}

// Entering Moves turns its move panel on, and takes the touch bar's Up and Down at once, before the bar sees them this
// frame; leaving it closes the panel. The top screen's text window goes back to the description, or on Data shows the
// held items
static void PokedexInfoPage_SetSubpage(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                       PokedexDetailCommon *common, u32 subpage) {
    wk->subpage = subpage;
    wk->shownAbility = ABILITY_MAX;
    if (subpage == POKEDEX_INFO_SUBPAGE_MOVES) {
        wk->movePanelOn = TRUE;
        PokedexInfoPage_TakeTouchbarKeys(wk, common);
    }
    PokedexInfoPage_ShowSubpage(param, wk, common);
    GFL_SndSEPlay(SEQ_SE_SELECT1);
}

// Moves' set, its cursor on its first move, which the move panel shows if it is on
static void PokedexInfoPage_SetMoveSet(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                       PokedexDetailCommon *common, u32 set) {
    wk->moves.set = set;
    PokedexInfoPage_ShowSubpage(param, wk, common);
    GFL_SndSEPlay(SEQ_SE_SELECT1);
}

// Draws the sub-page of the shown Pokémon and form, with its buttons; Moves loads its set again, its cursor at the top,
// and the move panel shows its first move or closes, before the top screen's text window shows what the sub-page has
// there, as a closing panel gives the window back
static void PokedexInfoPage_ShowSubpage(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                        PokedexDetailCommon *common) {
    wk->draggingKnob = FALSE;
    if (wk->subpage == POKEDEX_INFO_SUBPAGE_MOVES) {
        PokedexInfoMoves_Load(&wk->moves, wk->moves.set, wk->species, wk->form, param->heapId);
    }
    PokedexInfoPage_LoadAbilities(param, wk);
    PokedexInfoPage_ShowPanels(wk);
    PokedexInfoPage_ResetButtons(param, wk, common);
    PokedexInfoPage_UpdateMovePanel(wk, common);
    PokedexInfoPage_ShowTopText(param, wk);
}

// On Moves: touching a set's name shows that set, as L and R step through them, wrapping round; a touch on the scroll
// bar scrolls the list while it is held; touching a row puts the cursor on it and opens the move panel with its move,
// as A does with the cursor's; B closes the panel; Up and Down move the cursor, stopping at the list's ends, and show
// its move in the panel while it is open. TRUE if one of them was used
static BOOL PokedexInfoPage_CheckMovesInput(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                            PokedexDetailCommon *common) {
    u32 pressed = GCTX_HIDGetPressedKeys();
    u32 typed = GCTX_HIDGetTypedKeys();
    u32 set = PokedexInfoPanels_GetTouchedMoveSet();
    u32 row = PokedexInfoPanels_GetTouchedMoveRow();
    BOOL open = PokedexMovePanel_IsOpen(wk->movePanel);

    if (PokedexInfoPage_CheckKnobDrag(wk, common)) {
        return TRUE;
    }
    if (set != POKEDEX_INFO_MOVES_SET_COUNT) {
        if (set != wk->moves.set) {
            GCTX_HIDSetUsingTouch(TRUE);
            PokedexInfoPage_SetMoveSet(param, wk, common, set);
        }
        return TRUE;
    }
    if (typed & (PAD_BUTTON_L | PAD_BUTTON_R)) {
        GCTX_HIDSetUsingTouch(FALSE);
        if (typed & PAD_BUTTON_R) {
            set = (wk->moves.set + 1) % POKEDEX_INFO_MOVES_SET_COUNT;
        } else {
            set = (wk->moves.set + POKEDEX_INFO_MOVES_SET_COUNT - 1) % POKEDEX_INFO_MOVES_SET_COUNT;
        }
        PokedexInfoPage_SetMoveSet(param, wk, common, set);
        return TRUE;
    }
    if (row != POKEDEX_INFO_MOVE_ROWS) {
        if (PokedexInfoMoves_SelectRow(&wk->moves, row)) {
            GCTX_HIDSetUsingTouch(TRUE);
            wk->movePanelOn = TRUE;
            PokedexInfoPanels_ShowMoves(wk->panels);
            PokedexInfoPage_ShowMove(wk, common);
            GFL_SndSEPlay(SEQ_SE_DECIDE1);
        }
        return TRUE;
    }
    if ((pressed & PAD_BUTTON_B) && open) {
        GCTX_HIDSetUsingTouch(FALSE);
        wk->movePanelOn = FALSE;
        PokedexInfoPage_CloseMovePanel(wk);
        GFL_SndSEPlay(SEQ_SE_CANCEL1);
        return TRUE;
    }
    if ((pressed & PAD_BUTTON_A) && !open && wk->moves.count != 0) {
        GCTX_HIDSetUsingTouch(FALSE);
        wk->movePanelOn = TRUE;
        PokedexInfoPage_ShowMove(wk, common);
        GFL_SndSEPlay(SEQ_SE_DECIDE1);
        return TRUE;
    }
    if (typed & (PAD_KEY_UP | PAD_KEY_DOWN)) {
        GCTX_HIDSetUsingTouch(FALSE);
        if (PokedexInfoMoves_MoveCursor(&wk->moves, (typed & PAD_KEY_UP) ? -1 : 1)) {
            PokedexInfoPanels_ShowMoves(wk->panels);
            if (open) {
                PokedexInfoPage_ShowMove(wk, common);
            }
            GFL_SndSEPlay(SEQ_SE_SELECT1);
        }
        return TRUE;
    }
    return FALSE;
}

// A touch on the scroll bar's track, of a list longer than its rows, starts a drag: while it is held, the list scrolls
// to the place on the track that it is at, as the Pokédex's list does (FrameList's bar), the cursor staying on its
// row; as it lets go, the open panel shows the cursor's move. TRUE while it lasts
static BOOL PokedexInfoPage_CheckKnobDrag(PokedexInfoPageWork *wk, PokedexDetailCommon *common) {
    u32 scroll;

    if (!wk->draggingKnob) {
        if (wk->moves.count <= POKEDEX_INFO_MOVE_ROWS || !PokedexInfoPanels_IsMoveTrackTouched()) {
            return FALSE;
        }
        GCTX_HIDSetUsingTouch(TRUE);
        wk->draggingKnob = TRUE;
        GFL_SndSEPlay(SEQ_SE_SELECT1);
    }
    if (PokedexInfoPanels_GetHeldMoveScroll(wk->panels, &scroll)) {
        if (PokedexInfoMoves_SetScroll(&wk->moves, scroll)) {
            PokedexInfoPanels_ShowMoves(wk->panels);
        }
        return TRUE;
    }
    wk->draggingKnob = FALSE;
    if (PokedexMovePanel_IsOpen(wk->movePanel)) {
        PokedexInfoPage_ShowMove(wk, common);
    }
    return TRUE;
}

// Opens the move panel with the cursor's move, or shows it there, and takes the touch bar's B at once, which closes it
static void PokedexInfoPage_ShowMove(PokedexInfoPageWork *wk, PokedexDetailCommon *common) {
    PokedexMovePanel_Show(wk->movePanel, wk->entry, wk->moves.moves[wk->moves.cursor].move);
    PokedexInfoPage_TakeTouchbarKeys(wk, common);
}

// On Moves the panel shows the cursor's move while it is on and the set has moves; otherwise it is closed
static void PokedexInfoPage_UpdateMovePanel(PokedexInfoPageWork *wk, PokedexDetailCommon *common) {
    if (wk->subpage == POKEDEX_INFO_SUBPAGE_MOVES && wk->movePanelOn && wk->moves.count != 0) {
        PokedexInfoPage_ShowMove(wk, common);
    } else {
        PokedexInfoPage_CloseMovePanel(wk);
    }
}

// The entry is printed again as the panel closes, of the Pokémon shown now if it changed while the panel was open
static void PokedexInfoPage_CloseMovePanel(PokedexInfoPageWork *wk) {
    if (!PokedexMovePanel_IsOpen(wk->movePanel)) {
        return;
    }
    PokedexMovePanel_Close(wk->movePanel, wk->entry, wk->language);
    if (wk->entryStale) {
        wk->entryStale = FALSE;
        PokedexInfo_SetPokemonInLanguage(wk->entry, wk->species, wk->form, wk->sex, wk->rare, wk->personality,
                                         wk->caught, wk->language);
    }
}

// The touch bar's keys that the page takes: Left and Right always, as they step through the sub-pages; Up and Down
// on Moves, which move its cursor (the Pokémon changes there by the bar's arrows, touched); B while the move panel is
// open, which closes it
static void PokedexInfoPage_TakeTouchbarKeys(PokedexInfoPageWork *wk, PokedexDetailCommon *common) {
    u32 keys = PAD_KEY_LEFT | PAD_KEY_RIGHT;

    if (wk->subpage == POKEDEX_INFO_SUBPAGE_MOVES) {
        keys |= PAD_KEY_UP | PAD_KEY_DOWN;
    }
    if (wk->movePanel != NULL && PokedexMovePanel_IsOpen(wk->movePanel)) {
        keys |= PAD_BUTTON_B;
    }
    PokedexDetailTouchbar_SetDisabledKeys(PokedexDetailCommon_GetTouchbar(common), keys);
}

// Draws the sub-page's panels, Matchups with the chosen ability
static void PokedexInfoPage_ShowPanels(PokedexInfoPageWork *wk) {
    PokedexInfoPanels_Show(wk->panels, wk->subpage, wk->species, wk->form, wk->caught,
                           wk->abilityCount != 0 ? wk->abilities[wk->chosenAbility] : ABILITY_NONE);
}

// Matchups' choices of the shown form's abilities, of its first and second, and its hidden one once the species is
// caught: "Default" (ABILITY_NONE) first, for all of them that don't change the chart, if it has any, then each that
// does, once. Most have Default only
static void PokedexInfoPage_LoadAbilities(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk) {
    PersonalData *personal = PML_PersonalLoad(wk->species, wk->form, param->heapId);
    u32 count = wk->caught ? ABILITY_MAX : ABILITY_MAX - 1;
    u32 i;
    u32 j;

    wk->abilityCount = 0;
    for (i = 0; i < count; i++) {
        u32 ability = PML_PersonalGetParam(personal, sAbilityParams[i]);

        if (ability != ABILITY_NONE && !PokedexInfoPanels_IsMatchupAbility(ability)) {
            wk->abilities[wk->abilityCount++] = ABILITY_NONE;
            break;
        }
    }
    for (i = 0; i < count; i++) {
        u32 ability = PML_PersonalGetParam(personal, sAbilityParams[i]);
        BOOL listed = !PokedexInfoPanels_IsMatchupAbility(ability);

        for (j = 0; j < wk->abilityCount; j++) {
            if (wk->abilities[j] == ability) {
                listed = TRUE;
            }
        }
        if (!listed) {
            wk->abilities[wk->abilityCount++] = ability;
        }
    }
    PML_PersonalFree(personal);
    // A species with no ability at all still has the chart's choice
    if (wk->abilityCount == 0) {
        wk->abilities[wk->abilityCount++] = ABILITY_NONE;
    }
    if (wk->chosenAbility >= wk->abilityCount) {
        wk->chosenAbility = 0;
    }
}

static void PokedexInfoPage_CreateMCSS(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk) {
    wk->mcssSys = MCSSSys_Create(SPRITE_CAPACITY, param->heapId);
    MCSSSys_SetTexBase(wk->mcssSys, 0);
    MCSSSys_EnableOrtho(wk->mcssSys);
    MCSSSys_OpenArc(wk->mcssSys, GetPokemonGraphicsARCID());
    wk->tcbBuffer = GFL_HeapAllocate(param->heapId, GFL_TCBMgrCalcAllocSize(SPRITE_CAPACITY), FALSE,
                                     "paperwhite2_pokedex_info.c", __LINE__);
    wk->tcbMgr = GFL_TCBMgrCreate(SPRITE_CAPACITY, wk->tcbBuffer);
    MCSSSys_SetTCBManager(wk->mcssSys, wk->tcbMgr);
}

static void PokedexInfoPage_FreeMCSS(PokedexInfoPageWork *wk) {
    PokedexInfoPage_RemoveSprite(wk);
    MCSSSys_CloseArc(wk->mcssSys);
    MCSSSys_Free(wk->mcssSys);
    wk->mcssSys = NULL;
    GFL_TCBMgrDelete(wk->tcbMgr);
    GFL_HeapFree(wk->tcbBuffer);
}

// The shown Pokémon's sprite, front or back, its animation looping, as the forms page adds its sprites
// (PokedexDetailForm_AddMCSS) at a scale of one pixel to a pixel
static void PokedexInfoPage_AddSprite(PokedexInfoPageWork *wk) {
    VecFx32 scale = { FX32_ONE * 16, FX32_ONE * 16, FX32_ONE };
    VecFx32 offset;
    MCSSLoadInfo info;

    if (wk->species == SPECIES_SPINDA) {
        MCSSSys_SetSpindaLoadCallback(wk->mcssSys, wk->personality);
    }
    SetupPokemonLoaderFSTool(wk->species, wk->form, wk->sex, wk->rare, FALSE, &info, wk->back);
    wk->mcss = MCSSSys_Add(wk->mcssSys, (SPRITE_X - SCREEN_CENTER_X) * SPRITE_PIXEL_SIZE,
                           (SCREEN_CENTER_Y - SPRITE_Y) * SPRITE_PIXEL_SIZE, 0, &info);
    MCSS_SetNoShadow(wk->mcss, 1);
    MCSS_SetScale(wk->mcss, &scale);
    MCSS_SetLoopAnimation(wk->mcss);
    // Centered on its frame, as the forms page's sprites (PokedexDetailForm_SetShadow)
    offset.x = -MCSS_GetOffsetX(wk->mcss) * (FX32_ONE / 4);
    offset.y = 0;
    offset.z = 0;
    MCSS_SetPositionOffset(wk->mcss, &offset);
}

static void PokedexInfoPage_RemoveSprite(PokedexInfoPageWork *wk) {
    if (wk->mcss != NULL) {
        MCSS_Hide(wk->mcss);
        MCSSSys_Remove(wk->mcssSys, wk->mcss);
        wk->mcss = NULL;
    }
}

// Makes the buttons of the shown sub-page again: on Stats, those that can do something for the Pokémon
static void PokedexInfoPage_ResetButtons(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                         PokedexDetailCommon *common) {
    u32 i;

    PokedexInfoPage_FreeButtons(wk, common);
    // The art first, as it replaces the buttons' BG's screen
    PokedexInfoPanels_LoadArt(wk->panels, wk->subpage);
    if (wk->subpage == POKEDEX_INFO_SUBPAGE_MATCHUPS) {
        PokedexInfoPage_CreateAbilityButtons(param, wk);
        return;
    }
    if (wk->subpage != POKEDEX_INFO_SUBPAGE_STATS) {
        return;
    }
    for (i = 0; i < BUTTON_COUNT; i++) {
        if (PokedexInfoPage_IsButtonUsable(wk, common, i)) {
            AppTaskMenuItem item;

            item.str = PokedexInfoPanels_LoadMessage(wk->panels, sButtonLabels[i]);
            item.color = BUTTON_TEXT_COLOR;
            item.type = 0;
            wk->buttons[i] = AppTaskMenuWin_CreateEx(wk->buttonRes, &item, BUTTON_X, BUTTON_Y + i * BUTTON_PITCH,
                                                     BUTTON_WIDTH, BUTTON_HEIGHT, FALSE, TRUE, param->heapId);
            GFL_StrBufFree(item.str);
        }
    }
}

// Matchups' buttons, one for each choice with its ability's name or "Default", the chosen one shown as the menus show
// their cursor's
static void PokedexInfoPage_CreateAbilityButtons(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk) {
    MsgData *names = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_ABILITY_NAMES, param->heapId);
    u32 i;

    for (i = 0; i < wk->abilityCount; i++) {
        AppTaskMenuItem item;
        AppTaskMenuRes *res = wk->buttonRes;
        u32 x;
        u32 y;
        u32 width;
        u32 height;

        PokedexInfoPage_GetButtonPlace(wk, i, &x, &y, &width, &height);
        item.str = wk->abilities[i] == ABILITY_NONE
                       ? PokedexInfoPanels_LoadMessage(wk->panels, PokedexData_Text_DefaultAbility)
                       : GFL_MsgDataLoadStrbufNew(names, wk->abilities[i]);
        item.color = BUTTON_TEXT_COLOR;
        item.type = 0;
        // Centering a text wider than the button would place it past the button's end (AppTaskMenuWin_CreateCore)
        if (GFL_FontGetBlockWidth(item.str, wk->font, 0) > ABILITY_BUTTON_TEXT_WIDTH) {
            res = wk->smallButtonRes;
        }
        wk->buttons[i] = AppTaskMenuWin_CreateEx(res, &item, x, y, width, height, FALSE, TRUE, param->heapId);
        GFL_StrBufFree(item.str);
        if (i == wk->chosenAbility) {
            AppTaskMenuWin_SetActive(wk->buttons[i], TRUE);
        }
    }
    GFL_MsgDataFree(names);
}

// Frees the buttons once their text is printed, and ends a push
static void PokedexInfoPage_FreeButtons(PokedexInfoPageWork *wk, PokedexDetailCommon *common) {
    PrintQueue *queue = PokedexDetailCommon_GetPrintQueue(common);
    u32 i;

    while (!PrintQueue_IsEmpty(queue)) {
        PrintQueue_Main(queue);
    }
    for (i = 0; i < BUTTON_COUNT; i++) {
        if (wk->buttons[i] != NULL) {
            AppTaskMenuWin_Free(wk->buttons[i]);
            wk->buttons[i] = NULL;
        }
    }
    GFL_BGSysQueueScrLoad(POKEDEX_INFO_BUTTON_BG);
    if (wk->pushed != BUTTON_NONE) {
        wk->pushed = BUTTON_NONE;
        PokedexDetailTouchbar_SetActive(PokedexDetailCommon_GetTouchbar(common), TRUE);
    }
}

// Shows the buttons as their text is printed, and ends a push once the button has flashed
static void PokedexInfoPage_UpdateButtons(PokedexInfoPageWork *wk, PokedexDetailCommon *common) {
    u32 i;

    for (i = 0; i < BUTTON_COUNT; i++) {
        if (wk->buttons[i] != NULL) {
            AppTaskMenuWin_Update(wk->buttons[i]);
        }
    }
    if (wk->pushed != BUTTON_NONE && AppTaskMenuWin_IsFlashFinished(wk->buttons[wk->pushed])) {
        AppTaskMenuWin_ResetFlash(wk->buttons[wk->pushed]);
        // A chosen ability stays shown as chosen
        AppTaskMenuWin_SetActive(wk->buttons[wk->pushed], wk->subpage == POKEDEX_INFO_SUBPAGE_MATCHUPS);
        wk->pushed = BUTTON_NONE;
        PokedexDetailTouchbar_SetActive(PokedexDetailCommon_GetTouchbar(common), TRUE);
    }
}

// Pushes the button touched this frame, which flashes while the touch bar waits. Its own check isn't used, as it
// takes a button's bottom from its width (AppTaskMenuWin_IsTouched), and the buttons show as much higher than their
// tiles as the sub-page lifts their BG
static BOOL PokedexInfoPage_CheckButtons(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                         PokedexDetailCommon *common) {
    u32 touchX;
    u32 touchY;
    u32 i;

    if (!GFL_HIDGetTouchPressedPoint(&touchX, &touchY)) {
        return FALSE;
    }
    // The touch in the tiles' places, below where the lifted buttons show
    touchY += PokedexInfoPanels_GetLift(wk->subpage);
    for (i = 0; i < BUTTON_COUNT; i++) {
        u32 x;
        u32 y;
        u32 width;
        u32 height;

        if (wk->buttons[i] != NULL && PokedexInfoPage_GetButtonPlace(wk, i, &x, &y, &width, &height) &&
            touchX >= x * 8 && touchX < (x + width) * 8 && touchY >= y * 8 && touchY < (y + height) * 8) {
            // The chosen ability is chosen already
            if (wk->subpage == POKEDEX_INFO_SUBPAGE_MATCHUPS && i == wk->chosenAbility) {
                return FALSE;
            }
            wk->pushed = i;
            AppTaskMenuWin_SetFlashing(wk->buttons[i], TRUE);
            PokedexDetailTouchbar_SetActive(PokedexDetailCommon_GetTouchbar(common), FALSE);
            PokedexInfoPage_PressButton(param, wk, common, i);
            return TRUE;
        }
    }
    return FALSE;
}

// Where the shown sub-page's button is, in tiles: Stats' in their column, Matchups' in their row. FALSE on a sub-page
// without buttons
static BOOL PokedexInfoPage_GetButtonPlace(PokedexInfoPageWork *wk, u32 button, u32 *x, u32 *y, u32 *width,
                                           u32 *height) {
    switch (wk->subpage) {
    case POKEDEX_INFO_SUBPAGE_STATS:
        *x = BUTTON_X;
        *y = BUTTON_Y + button * BUTTON_PITCH;
        *width = BUTTON_WIDTH;
        *height = BUTTON_HEIGHT;
        return TRUE;
    case POKEDEX_INFO_SUBPAGE_MATCHUPS:
        *x = ABILITY_BUTTON_CENTER_X - wk->abilityCount * ABILITY_BUTTON_WIDTH / 2 + button * ABILITY_BUTTON_WIDTH;
        *y = ABILITY_BUTTON_Y;
        *width = ABILITY_BUTTON_WIDTH;
        *height = ABILITY_BUTTON_HEIGHT;
        return TRUE;
    }
    return FALSE;
}

static void PokedexInfoPage_PressButton(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                        PokedexDetailCommon *common, u32 button) {
    PokeDexSave *pokedex = GameData_GetPokedex(PokedexDetailCommon_GetGameData(common));

    // On Matchups, the touched ability is chosen, and the chart shows it
    if (wk->subpage == POKEDEX_INFO_SUBPAGE_MATCHUPS) {
        AppTaskMenuWin_SetActive(wk->buttons[wk->chosenAbility], FALSE);
        wk->chosenAbility = button;
        PokedexInfoPage_ShowPanels(wk);
        GFL_SndSEPlay(SEQ_SE_SELECT3);
        return;
    }
    switch (button) {
    case BUTTON_CRY:
        // As the cry page plays it (pokedex_detail_voice.c)
        PokeVoice_Play(wk->species, wk->form, 64, 0, 0, 0, 0, NULL);
        return;
    case BUTTON_TURN:
        wk->back = !wk->back;
        break;
    case BUTTON_FORM:
        PokedexInfoPage_NextForm(pokedex, wk);
        // The new form's entry, with its description
        wk->shownAbility = ABILITY_MAX;
        PokedexInfoPage_EndOtherText(wk);
        PokedexInfo_SetPokemonInLanguage(wk->entry, wk->species, wk->form, wk->sex, wk->rare, wk->personality,
                                         wk->caught, wk->language);
        // A new form's abilities start from its first again
        wk->chosenAbility = 0;
        PokedexInfoPage_LoadAbilities(param, wk);
        PokedexInfoPage_ShowPanels(wk);
        break;
    case BUTTON_SHINY:
        wk->rare = !wk->rare;
        break;
    case BUTTON_LANGUAGE: {
        u32 i;

        // The next language the Pokédex has the entry in, the game's own after the others
        for (i = 1; i <= LANGUAGE_COUNT; i++) {
            u32 language = (wk->language + i) % (LANGUAGE_COUNT + 1);

            if (PokedexInfoPage_HasLanguage(pokedex, wk->species, language)) {
                wk->language = language;
                break;
            }
        }
        // With the description, if an ability showed
        wk->shownAbility = ABILITY_MAX;
        PokedexInfoPage_EndOtherText(wk);
        PokedexInfo_SetLanguage(wk->entry, wk->language);
        GFL_SndSEPlay(SEQ_SE_SELECT3);
        return;
    }
    case BUTTON_ABILITIES:
        PokedexInfoPage_NextShownAbility(param, wk);
        PokedexInfoPage_ShowTopText(param, wk);
        GFL_SndSEPlay(SEQ_SE_SELECT3);
        return;
    }
    PokedexInfoPage_RemoveSprite(wk);
    PokedexInfoPage_AddSprite(wk);
    GFL_SndSEPlay(SEQ_SE_SELECT3);
}

// Cry, Turn and Abilities always; Form once two forms have been seen, Shiny once a shiny one has, and Language once the
// Pokédex has the entry in another language
static BOOL PokedexInfoPage_IsButtonUsable(PokedexInfoPageWork *wk, PokedexDetailCommon *common, u32 button) {
    PokeDexSave *pokedex = GameData_GetPokedex(PokedexDetailCommon_GetGameData(common));
    u32 i;

    switch (button) {
    case BUTTON_FORM:
        return PokedexInfoPage_CountSeenForms(pokedex, wk->species) >= 2;
    case BUTTON_SHINY:
        for (i = 0; i < getNumberOfForms(wk->species); i++) {
            if (PokedexInfoPage_HasSeenForm(pokedex, wk->species, i, SEX_ANY, TRUE)) {
                return TRUE;
            }
        }
        return FALSE;
    case BUTTON_LANGUAGE:
        for (i = 0; i < LANGUAGE_COUNT; i++) {
            if (PokedexInfoPage_HasLanguage(pokedex, wk->species, i)) {
                return TRUE;
            }
        }
        return FALSE;
    }
    return TRUE;
}

// Whether the Pokédex has seen the form in the sex and color, or in any with SEX_ANY and RARE_ANY
static BOOL PokedexInfoPage_HasSeenForm(PokeDexSave *pokedex, u16 species, u32 form, u32 sex, u32 rare) {
    u32 i;
    u32 j;

    for (i = GENDER_MALE; i <= GENDER_UNKNOWN; i++) {
        for (j = FALSE; j <= TRUE; j++) {
            if ((sex == SEX_ANY || sex == i) && (rare == RARE_ANY || rare == j) &&
                PokeDex_HasSeenVariant(pokedex, species, i, j, form)) {
                return TRUE;
            }
        }
    }
    return FALSE;
}

static u32 PokedexInfoPage_CountSeenForms(PokeDexSave *pokedex, u16 species) {
    u32 count = 0;
    u32 i;

    for (i = 0; i < getNumberOfForms(species); i++) {
        if (PokedexInfoPage_HasSeenForm(pokedex, species, i, SEX_ANY, RARE_ANY)) {
            count++;
        }
    }
    return count;
}

// The next form seen, in the same sex if it has been seen in it, else in the first sex it has been seen in. The color
// stays as Shiny set it
static void PokedexInfoPage_NextForm(PokeDexSave *pokedex, PokedexInfoPageWork *wk) {
    u32 count = getNumberOfForms(wk->species);
    u32 i;
    u32 sex;

    for (i = 1; i < count; i++) {
        u32 form = (wk->form + i) % count;

        if (PokedexInfoPage_HasSeenForm(pokedex, wk->species, form, SEX_ANY, RARE_ANY)) {
            wk->form = form;
            if (!PokedexInfoPage_HasSeenForm(pokedex, wk->species, form, wk->sex, RARE_ANY)) {
                for (sex = GENDER_MALE; sex <= GENDER_UNKNOWN; sex++) {
                    if (PokedexInfoPage_HasSeenForm(pokedex, wk->species, form, sex, RARE_ANY)) {
                        wk->sex = sex;
                        break;
                    }
                }
            }
            return;
        }
    }
}

// Whether the Pokédex has the species' entry in a language as PokedexInfo numbers them; it always has the game's
static BOOL PokedexInfoPage_HasLanguage(PokeDexSave *pokedex, u16 species, u32 language) {
    if (language == LANGUAGE_GAME) {
        return TRUE;
    }
    return PokeDex_HasLanguage(pokedex, species, sLanguageCodes[language]);
}

// The next of the shown form's abilities that the top screen shows, after the shown one, or the description after the
// last: the first, the second if it is another, then the hidden one if it is another, or, until the species is caught,
// if it has one at all
static void PokedexInfoPage_NextShownAbility(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk) {
    PersonalData *personal = PML_PersonalLoad(wk->species, wk->form, param->heapId);
    u32 first = PML_PersonalGetParam(personal, sAbilityParams[0]);
    u32 second = PML_PersonalGetParam(personal, sAbilityParams[1]);
    u32 i = wk->shownAbility == ABILITY_MAX ? 0 : wk->shownAbility + 1;

    for (; i < ABILITY_MAX; i++) {
        u32 ability = PML_PersonalGetParam(personal, sAbilityParams[i]);

        if (ability == ABILITY_NONE || (i == 1 && ability == first) ||
            (i == 2 && wk->caught && (ability == first || ability == second))) {
            continue;
        }
        break;
    }
    PML_PersonalFree(personal);
    wk->shownAbility = i;
}

// The top screen's text window: on Data the species' held items, on Stats the ability that Abilities shows, else the
// entry's description, printed again in the entry's language if the page's text was there. Never while the move panel
// has freed the entry's windows
static void PokedexInfoPage_ShowTopText(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk) {
    if (PokedexMovePanel_IsOpen(wk->movePanel)) {
        return;
    }
    if (wk->subpage == POKEDEX_INFO_SUBPAGE_DATA) {
        PokedexInfoPage_DrawHeldItems(param, wk, PokedexInfo_BeginOtherText(wk->entry));
        wk->otherText = TRUE;
    } else if (wk->shownAbility != ABILITY_MAX) {
        PokedexInfoPage_DrawAbility(param, wk, PokedexInfo_BeginOtherText(wk->entry));
        wk->otherText = TRUE;
    } else if (wk->otherText) {
        PokedexInfoPage_EndOtherText(wk);
        PokedexInfo_SetLanguage(wk->entry, wk->language);
    }
}

// The entry's next print has its description again
static void PokedexInfoPage_EndOtherText(PokedexInfoPageWork *wk) {
    PokedexInfo_EndOtherText(wk->entry);
    wk->otherText = FALSE;
}

// The shown ability's name in gold on the first line, with which of the species' abilities it is right-aligned there,
// and its description, two lines, on the others; the hidden one until the species is caught only says that it is
// undiscovered, on the second line
static void PokedexInfoPage_DrawAbility(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk, GFLBitmap *bitmap) {
    PersonalData *personal = PML_PersonalLoad(wk->species, wk->form, param->heapId);
    u32 ability = PML_PersonalGetParam(personal, sAbilityParams[wk->shownAbility]);
    MsgData *msgData;
    StrBuf *text;

    PML_PersonalFree(personal);
    if (sAbilityParams[wk->shownAbility] == PERSONAL_ABILITY_HIDDEN && !wk->caught) {
        PokedexInfoPage_DrawCentered(wk, bitmap, PokedexData_Text_HiddenAbilityUndiscovered, 1);
        return;
    }
    msgData = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_ABILITY_NAMES, param->heapId);
    text = GFL_MsgDataLoadStrbufNew(msgData, ability);
    GFL_TextRendererDrawToBitmapEx(bitmap, TOP_TEXT_X, TOP_TEXT_Y, text, wk->font, TOP_TEXT_GOLD);
    GFL_StrBufFree(text);
    GFL_MsgDataFree(msgData);
    text = PokedexInfoPanels_LoadMessage(wk->panels, sAbilitySlotLabels[wk->shownAbility]);
    PokedexInfoPage_DrawRight(wk, bitmap, text, TOP_TEXT_Y, TOP_TEXT_GREY);
    GFL_StrBufFree(text);
    msgData = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_ABILITY_DESCRIPTIONS, param->heapId);
    text = GFL_MsgDataLoadStrbufNew(msgData, ability);
    GFL_TextRendererDrawToBitmapEx(bitmap, TOP_TEXT_X, TOP_TEXT_Y + TOP_TEXT_LINE_PITCH, text, wk->font,
                                   TOP_TEXT_WHITE);
    GFL_StrBufFree(text);
    GFL_MsgDataFree(msgData);
}

// The species' wild held items, one a line, each with its rate, once it is caught (Data shows "?" until then), or
// that it has none: a first item that is also the second is the only one, always held
static void PokedexInfoPage_DrawHeldItems(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk, GFLBitmap *bitmap) {
    PersonalData *personal;
    MsgData *names;
    u16 items[HELD_ITEM_COUNT];
    u32 lines = 0;
    u32 i;

    if (!wk->caught) {
        PokedexInfoPage_DrawCentered(wk, bitmap, PokedexData_Text_Unknown, 1);
        return;
    }
    personal = PML_PersonalLoad(wk->species, wk->form, param->heapId);
    for (i = 0; i < HELD_ITEM_COUNT; i++) {
        items[i] = PML_PersonalGetParam(personal, PERSONAL_ITEM_1 + i);
    }
    PML_PersonalFree(personal);
    names = GFL_MsgSysLoadData(FALSE, ARCID_SYSTEM_MESSAGE, TEXT_BANK_ITEM_NAMES, param->heapId);
    if (items[0] == items[1]) {
        if (items[0] != ITEM_NONE) {
            PokedexInfoPage_DrawItemLine(param, wk, bitmap, names, lines++, items[0], HELD_ITEM_ALWAYS, FALSE);
        }
    } else {
        for (i = 0; i < HELD_ITEM_COUNT; i++) {
            if (items[i] != ITEM_NONE) {
                PokedexInfoPage_DrawItemLine(param, wk, bitmap, names, lines++, items[i], sHeldItemRates[i],
                                             i == HELD_ITEM_DARK_GRASS);
            }
        }
    }
    GFL_MsgDataFree(names);
    if (lines == 0) {
        PokedexInfoPage_DrawCentered(wk, bitmap, PokedexData_Text_NoHeldItems, 1);
    }
}

// An item's name on a line, from its start, and its rate, ending TOP_TEXT_X from the window's right; the dark grass
// item's rate says that it is held only there
static void PokedexInfoPage_DrawItemLine(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk, GFLBitmap *bitmap,
                                         MsgData *names, u32 line, u32 item, u32 rate, BOOL darkGrass) {
    WordSet *wordSet = GFL_WordSetSystemCreateDefault(param->heapId);
    StrBuf *format = PokedexInfoPanels_LoadMessage(wk->panels, darkGrass ? PokedexData_Text_ItemRateDarkGrass
                                                                         : PokedexData_Text_ItemRate);
    StrBuf *text = GFL_StrBufCreate(0x20, param->heapId);
    StrBuf *name = GFL_MsgDataLoadStrbufNew(names, item);
    u32 y = TOP_TEXT_Y + line * TOP_TEXT_LINE_PITCH;

    GFL_TextRendererDrawToBitmapEx(bitmap, TOP_TEXT_X, y, name, wk->font, TOP_TEXT_WHITE);
    WordSetNumber(wordSet, 0, rate, 3, NUM_PAD_NONE, TRUE);
    GFL_WordSetFormatStrbuf(wordSet, text, format);
    PokedexInfoPage_DrawRight(wk, bitmap, text, y, TOP_TEXT_WHITE);
    GFL_StrBufFree(name);
    GFL_StrBufFree(text);
    GFL_StrBufFree(format);
    GFL_WordSetSystemFree(wordSet);
}

// A text right-aligned on a line, ending TOP_TEXT_X from the window's right
static void PokedexInfoPage_DrawRight(PokedexInfoPageWork *wk, GFLBitmap *bitmap, const StrBuf *text, u32 y,
                                      u16 color) {
    GFL_TextRendererDrawToBitmapEx(bitmap,
                                   GFL_BitmapGetWidth(bitmap) - TOP_TEXT_X - GFL_FontGetBlockWidth(text, wk->font, 0),
                                   y, text, wk->font, color);
}

// A message of the page's bank in white, centered across the window on a line
static void PokedexInfoPage_DrawCentered(PokedexInfoPageWork *wk, GFLBitmap *bitmap, u32 messageId, u32 line) {
    StrBuf *text = PokedexInfoPanels_LoadMessage(wk->panels, messageId);

    GFL_TextRendererDrawToBitmapEx(bitmap, (GFL_BitmapGetWidth(bitmap) - GFL_FontGetBlockWidth(text, wk->font, 0)) / 2,
                                   TOP_TEXT_Y + line * TOP_TEXT_LINE_PITCH, text, wk->font, TOP_TEXT_WHITE);
    GFL_StrBufFree(text);
}
