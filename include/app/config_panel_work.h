#ifndef POKEBW2_APP_CONFIG_PANEL_WORK_H
#define POKEBW2_APP_CONFIG_PANEL_WORK_H

#include "types.h"
#include "app/ui/touchbar.h"
#include "gfl/clact.h"
#include "nnsys/g2d.h"
#include "struct_decls.h"
#include "system/app_printsys_common.h"
#include "system/app_taskmenu.h"
#include "system/printsys.h"

// config_panel.c: the options screen's constants and the parts of its work that Paper White 2's Following Pokémon row
// (src/paperwhite2/ov140/paperwhite2_following_options.c) reads too

#define BG_COUNT 6
#define BG_BAR 0
#define BG_TEXT 1
#define BG_ROWS 2
#define BG_CONFIRM 3
#define BG_MESSAGE 4

// The windows: the values, the options' names, the title, the explanation and the question
#define LABEL_COUNT 16
enum {
    WINDOW_OPTION = 11,
    WINDOW_TITLE = 16,
    WINDOW_MESSAGE,
    WINDOW_CONFIRM,
    WINDOW_COUNT,
};

// The actors: the values' frames from ACTOR_ITEM on
#define ACTOR_COUNT 14
#define ACTOR_ITEM 2

// The options and all their values
enum {
    OPTION_TEXT_SPEED,
    OPTION_BATTLE_SCENE,
    OPTION_BATTLE_STYLE,
    OPTION_SOUND,
    OPTION_SAVE_BEFORE_IR,
    OPTION_COUNT,
};
#define ITEM_COUNT 11

// The cursor: an option, or one of the buttons
enum {
    CURSOR_CONFIRM = OPTION_COUNT,
    CURSOR_QUIT,
    CURSOR_MAX = CURSOR_QUIT,
};

// What the player did this frame
enum {
    INPUT_NONE,
    INPUT_SLIDE,
    INPUT_2,
    INPUT_TOUCH,
    INPUT_UP,
    INPUT_DOWN,
    INPUT_RIGHT,
    INPUT_LEFT,
    INPUT_DECIDE,
    INPUT_CANCEL,
    INPUT_UP_HELD,
    INPUT_DOWN_HELD,
    INPUT_Y,
    INPUT_X,
    // The first key after the touch screen, which only brings the cursor back
    INPUT_KEY_MODE,
};

typedef struct {
    s32 x;
    s32 y;
} ConfigPanelPoint;

// A text of the screen: its message and its window, in tiles. The width is set from the text
typedef struct {
    u32 msgId;
    u8 x;
    u8 y;
    u8 width;
    u8 height;
} ConfigPanelLabel;

// The options as the screen edits them. changed is the value last picked, ITEM_COUNT when none
typedef struct {
    u8 values[OPTION_COUNT];
    u8 changed;
    Config *config;
} ConfigPanelOptions;

typedef struct {
    BmpWin *windows[WINDOW_COUNT];
    u16 pulseAngle;
    u16 pad4E;
    u16 pulseColor;
    void *titleCharBuf;
    NNSG2dCharacterData *titleChars;
    u16 cursorPalette[16];
} ConfigPanelBg;

typedef struct {
    ClActUnit *unit;
    u32 palette;
    u32 chars;
    u32 cellAnims;
    u32 knobChars;
    u32 knobCellAnims;
    ClActor *actors[ACTOR_COUNT];
    u16 frame;
} ConfigPanelObj;

typedef struct {
    ConfigPanelBg bg;
    ConfigPanelObj obj;
    TCB *vblankTcb;
} ConfigPanelGraphic;

typedef struct {
    u32 input;
    ConfigPanelPoint start;
    ConfigPanelPoint slide;
    ConfigPanelPoint now;
    BOOL touching;
} ConfigPanelUi;

typedef struct {
    MsgData *msgData;
    Font *font;
    PrintStream *stream;
    TCBExManager *tcbManager;
    BmpWin *window;
    StrBuf *strbuf;
    u16 clearColor;
    u16 heapId;
    PrintWindow printWindow;
    PrintQueue *queue;
    u32 mode;
    AppPrintsysCommon common;
    u32 unk34;
} ConfigPanelMsg;

typedef struct {
    Font *font;
    PrintQueue *queue;
    TouchBar *touchBar;
    s32 button;
    BOOL decided;
    AppTaskMenuRes *res;
    MsgData *msgData;
    AppTaskMenuItem items[2];
    AppTaskMenuWin *wins[2];
    GameData *gameData;
    // Whether a button or an icon was touched this frame, which hides the cursor
    BOOL touched;
} ConfigPanelAppBar;

typedef struct {
    u16 textBg;
    u16 rowsBg;
    s32 cursor;
    ClActor *actors[ITEM_COUNT];
    s32 y;
    u32 repeat;
    u32 unk3C;
    u32 unk40;
    ConfigPanelOptions options;
    BOOL update;
    BOOL cursorVisible;
} ConfigPanelScroll;

#ifdef PAPERWHITE2
// Paper White 2: the screen's functions that the Following Pokémon's row calls
void PaperWhite2_ConfigPanelScrollInit(ConfigPanelScroll *scroll, u16 textBg, u16 rowsBg, ConfigPanelGraphic *graphic,
                                       const ConfigPanelOptions *options, HeapID heapId);
void PaperWhite2_ConfigPanelScrollExit(ConfigPanelScroll *scroll);
void PaperWhite2_ConfigPanelScrollMain(ConfigPanelScroll *scroll, ConfigPanelUi *ui, ConfigPanelMsg *msg,
                                       ConfigPanelGraphic *graphic, ConfigPanelAppBar *appBar);
s32 PaperWhite2_ConfigPanelScrollGetCursor(ConfigPanelScroll *scroll);
BOOL PaperWhite2_ConfigPanelOptionsEquals(const ConfigPanelOptions *a, const ConfigPanelOptions *b);
void PaperWhite2_ConfigPanelOptionsApply(const ConfigPanelOptions *options);
void PaperWhite2_ConfigPanelMsgPrint(ConfigPanelMsg *msg, u32 msgId, s32 wait, BOOL stream);
#endif

#endif // POKEBW2_APP_CONFIG_PANEL_WORK_H
