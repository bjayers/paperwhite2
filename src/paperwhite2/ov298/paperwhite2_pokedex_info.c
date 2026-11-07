#include "types.h"
#include "app/pokedex_detail.h"
#include "app/pokedex_info.h"
#include "app/ui/ui_scene.h"
#include "constants/arc.h"
#include "constants/language.h"
#include "constants/pokemon.h"
#include "constants/sound.h"
#include "constants/species.h"
#include "constants/text_banks.h"
#include "gfl/bg_sys.h"
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
#include "pml/poke_graphic.h"
#include "save/pokedex_savedata.h"
#include "system/app_taskmenu.h"
#include "system/game_data.h"
#include "system/gf_font.h"
#include "system/mcss.h"
#include "system/printsys.h"
#include "text/system/pokedex_data.h"

// Paper White 2: the Pokédex detail screen's info page (docs/paperwhite2/design/pokedex.md, step 2). The detail screen
// shows the main engine on the top screen while this page runs (pokedex_detail.c), so the top has the 3D: the
// Pokémon's entry from overlay 296, as the original's bottom screen showed it, with the battle's animated sprite (MCSS,
// on BG 0) where the still one was. The bottom screen, the sub engine's, has the sub-pages that L and R cycle
// (paperwhite2_pokedex_info_panels.c) and, on Stats, the buttons Cry, Turn, Form, Shiny and Language in the menus'
// style. A button that can't do anything for the Pokémon is hidden, and the others keep their places

// Where the sprite stands on the top screen, in pixels: the middle of its feet, in the entry's left panel, where the
// original's still sprite had its 96 by 96 frame centered at 50, 72
#define SPRITE_X 50
#define SPRITE_Y 120
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
#define BUTTON_PRIORITY 1
// The text's colors in the buttons' palettes, as the menus' YES and NO have them
#define BUTTON_TEXT_COLOR PRINT_COLOR(14, 15, 3)

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
static void PokedexInfoPage_CreateMCSS(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk);
static void PokedexInfoPage_FreeMCSS(PokedexInfoPageWork *wk);
static void PokedexInfoPage_AddSprite(PokedexInfoPageWork *wk);
static void PokedexInfoPage_RemoveSprite(PokedexInfoPageWork *wk);
static void PokedexInfoPage_ResetButtons(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                         PokedexDetailCommon *common);
static void PokedexInfoPage_FreeButtons(PokedexInfoPageWork *wk, PokedexDetailCommon *common);
static void PokedexInfoPage_UpdateButtons(PokedexInfoPageWork *wk, PokedexDetailCommon *common);
static BOOL PokedexInfoPage_CheckButtons(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                         PokedexDetailCommon *common);
static void PokedexInfoPage_PressButton(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                        PokedexDetailCommon *common, u32 button);
static BOOL PokedexInfoPage_IsButtonUsable(PokedexInfoPageWork *wk, PokedexDetailCommon *common, u32 button);
static BOOL PokedexInfoPage_HasSeenForm(PokeDexSave *pokedex, u16 species, u32 form, u32 sex, u32 rare);
static u32 PokedexInfoPage_CountSeenForms(PokeDexSave *pokedex, u16 species);
static void PokedexInfoPage_NextForm(PokeDexSave *pokedex, PokedexInfoPageWork *wk);
static BOOL PokedexInfoPage_HasLanguage(PokeDexSave *pokedex, u16 species, u32 language);

// The language codes of PokedexInfo's languages: Japanese, French, German, Italian, Spanish and Korean
static const u8 sLanguageCodes[LANGUAGE_COUNT] = {
    LANGUAGE_JAPANESE, LANGUAGE_FRENCH, LANGUAGE_GERMAN, LANGUAGE_ITALIAN, LANGUAGE_SPANISH, LANGUAGE_KOREAN,
};

static const u16 sButtonLabels[BUTTON_COUNT] = {
    PokedexData_Text_Cry,   PokedexData_Text_Turn,     PokedexData_Text_Form,
    PokedexData_Text_Shiny, PokedexData_Text_Language,
};

BOOL PokedexInfoPage_Init(PokedexDetailProcSys *sys, int *seq, void *param_, void *work, PokedexDetailCommon *common) {
    PokedexDetailInfoParam *param = param_;
    PokedexInfoPageWork *wk;

    GFL_OvlLoad(OVERLAY_APP_UI);
    GFL_OvlLoad(OVERLAY_POKEDEX_INFO);
    wk = PokedexDetailProcSys_AllocWork(sys, sizeof(PokedexInfoPageWork), param->heapId);
    MI_CpuFill8(wk, 0, sizeof(PokedexInfoPageWork));
    wk->pushed = BUTTON_NONE;
    wk->language = LANGUAGE_GAME;
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
    AppTaskMenuRes_Free(wk->buttonRes);
    PokedexInfoPanels_Free(wk->panels);
    PokedexInfo_Free(wk->entry);
    GFL_FontFree(wk->font);
    GFL_MsgDataFree(wk->msgData[2]);
    GFL_MsgDataFree(wk->msgData[1]);
    GFL_MsgDataFree(wk->msgData[0]);
    PokedexDetailBlend_Free(wk->blendSub);
    PokedexDetailBlend_Free(wk->blendMain);
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

        wk->panels = PokedexInfoPanels_Create(param->heapId, wk->font);
        wk->buttonRes = AppTaskMenuRes_Create(POKEDEX_INFO_BUTTON_BG, POKEDEX_INFO_BUTTON_PALETTE, wk->font,
                                              PokedexDetailCommon_GetPrintQueue(common), param->heapId);
        GFL_BGSysSetBGPriority(POKEDEX_INFO_BUTTON_BG, BUTTON_PRIORITY);
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
        if (wk->exit != EXIT_NONE) {
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
    if (!PokedexInfoPage_HasLanguage(pokedex, wk->species, wk->language)) {
        wk->language = LANGUAGE_GAME;
    }
}

static void PokedexInfoPage_ChangePokemon(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                          PokedexDetailCommon *common) {
    PokedexInfoPage_LoadPokemon(param, wk, common);
    PokedexInfo_SetPokemonInLanguage(wk->entry, wk->species, wk->form, wk->sex, wk->rare, wk->personality, wk->caught,
                                     wk->language);
    PokedexInfoPage_RemoveSprite(wk);
    PokedexInfoPage_AddSprite(wk);
    PokedexInfoPage_ShowSubpage(param, wk, common);
}

// Touching a sub-page's name switches to it, and on Stats touching a button pushes it; L and R cycle the sub-pages
static void PokedexInfoPage_CheckInput(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                       PokedexDetailCommon *common) {
    u32 typed = GCTX_HIDGetTypedKeys();
    u32 touched = PokedexInfoPanels_GetTouchedSubpage();

    if (touched != POKEDEX_INFO_SUBPAGE_COUNT) {
        if (touched != wk->subpage) {
            GCTX_HIDSetUsingTouch(TRUE);
            PokedexInfoPage_SetSubpage(param, wk, common, touched);
        }
    } else if (wk->subpage == POKEDEX_INFO_SUBPAGE_STATS && PokedexInfoPage_CheckButtons(param, wk, common)) {
        GCTX_HIDSetUsingTouch(TRUE);
    } else if (typed & PAD_BUTTON_R) {
        GCTX_HIDSetUsingTouch(FALSE);
        PokedexInfoPage_SetSubpage(param, wk, common, (wk->subpage + 1) % POKEDEX_INFO_SUBPAGE_COUNT);
    } else if (typed & PAD_BUTTON_L) {
        GCTX_HIDSetUsingTouch(FALSE);
        PokedexInfoPage_SetSubpage(param, wk, common,
                                   (wk->subpage + POKEDEX_INFO_SUBPAGE_COUNT - 1) % POKEDEX_INFO_SUBPAGE_COUNT);
    }
}

static void PokedexInfoPage_SetSubpage(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                       PokedexDetailCommon *common, u32 subpage) {
    wk->subpage = subpage;
    PokedexInfoPage_ShowSubpage(param, wk, common);
    GFL_SndSEPlay(SEQ_SE_SELECT1);
}

// Draws the sub-page of the shown Pokémon and form, with the buttons on Stats
static void PokedexInfoPage_ShowSubpage(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                        PokedexDetailCommon *common) {
    PokedexInfoPanels_Show(wk->panels, wk->subpage, wk->species, wk->form, wk->caught);
    PokedexInfoPage_ResetButtons(param, wk, common);
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
        AppTaskMenuWin_SetActive(wk->buttons[wk->pushed], FALSE);
        wk->pushed = BUTTON_NONE;
        PokedexDetailTouchbar_SetActive(PokedexDetailCommon_GetTouchbar(common), TRUE);
    }
}

// Pushes the button touched this frame, which flashes while the touch bar waits. Its own check isn't used, as it
// takes a button's bottom from its width (AppTaskMenuWin_IsTouched)
static BOOL PokedexInfoPage_CheckButtons(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                         PokedexDetailCommon *common) {
    u32 x;
    u32 y;
    u32 i;

    if (!GFL_HIDGetTouchPressedPoint(&x, &y)) {
        return FALSE;
    }
    for (i = 0; i < BUTTON_COUNT; i++) {
        u32 top = (BUTTON_Y + i * BUTTON_PITCH) * 8;

        if (wk->buttons[i] != NULL && x >= BUTTON_X * 8 && x < (BUTTON_X + BUTTON_WIDTH) * 8 && y >= top &&
            y < top + BUTTON_HEIGHT * 8) {
            wk->pushed = i;
            AppTaskMenuWin_SetFlashing(wk->buttons[i], TRUE);
            PokedexDetailTouchbar_SetActive(PokedexDetailCommon_GetTouchbar(common), FALSE);
            PokedexInfoPage_PressButton(param, wk, common, i);
            return TRUE;
        }
    }
    return FALSE;
}

static void PokedexInfoPage_PressButton(PokedexDetailInfoParam *param, PokedexInfoPageWork *wk,
                                        PokedexDetailCommon *common, u32 button) {
    PokeDexSave *pokedex = GameData_GetPokedex(PokedexDetailCommon_GetGameData(common));

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
        PokedexInfo_SetPokemonInLanguage(wk->entry, wk->species, wk->form, wk->sex, wk->rare, wk->personality,
                                         wk->caught, wk->language);
        PokedexInfoPanels_Show(wk->panels, wk->subpage, wk->species, wk->form, wk->caught);
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
        PokedexInfo_SetLanguage(wk->entry, wk->language);
        GFL_SndSEPlay(SEQ_SE_SELECT3);
        return;
    }
    }
    PokedexInfoPage_RemoveSprite(wk);
    PokedexInfoPage_AddSprite(wk);
    GFL_SndSEPlay(SEQ_SE_SELECT3);
}

// Cry and Turn always; Form once two forms have been seen, Shiny once a shiny one has, and Language once the Pokédex
// has the entry in another language
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
