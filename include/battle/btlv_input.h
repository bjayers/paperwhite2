#ifndef POKEBW2_BATTLE_BTLV_INPUT_H
#define POKEBW2_BATTLE_BTLV_INPUT_H

// Overlay 168's btlv_input.c (named by its string), the battle's lower screen: the command, move, target, yes/no,
// rotation and recorder screens, their transitions and their touch and key input. The names are ours; swan has none
// for this file. Another session's notes, ~/Projects/White2Decomp/docs/battle-ui-spec.md (White 2 addresses, +0x40),
// were the source of our understanding of the screens and their transitions, not of names or code

#include "types.h"
#include "gfl/clact.h"
#include "gfl/heap.h"
#include "gfl/touchpanel.h"
#include "struct_decls.h"

// A screen's buttons: their touch rectangles, a flag word per button (bit 0: a cancel, bit 1: a cancel for a later
// Pokémon on the command screen) and the palette rows a press flashes (-1: none, bit 16: the input stays unlocked)
typedef struct {
    const TouchRect *rects;
    const s32 *flags;
    const s32 *flashRows;
} BtlvInputButtonSet;

// A stop of the key cursor, 12 bytes
struct BtlvInputKeyStop {
    s8 corners[6]; // the rectangle each cursor actor sits on a corner of, -1 to hide it
    s8 up;         // the stop each key moves to, KEY_CURSOR_NONE for none; -n is the stop the cursor came from, or n
    s8 down;
    s8 left;
    s8 right;
    s8 a; // the result of A
    s8 b; // the result of B; -n presses stop n, only for a later Pokémon
};

#define KEY_CURSOR_NONE (-128)
// Set on a stop: the stop the cursor came from, if it is in the list the caller passes
#define KEY_CURSOR_LAST 0x40

// A party slot of the command screen; only the icon animation byte is read
typedef struct {
    u8 unk0;
    u8 iconAnim; // added to the actor's base sequence
    u16 unk2;
    u32 unk4;
    u32 unk8;
} BtlvInputPokeEntry;

// Screen 1, the command screen
typedef struct {
    BtlvInputPokeEntry entries[2][6]; // 0x00
    BOOL laterPoke;                   // 0x90  not the first mon to choose this turn
    BOOL secondRow;                   // 0x94
    u32 species[3];                   // 0x98  the party icons of the mons on the field
    u32 forms[3];                     // 0xa4
    u32 sexes[3];                     // 0xb0
    s32 pokePos;                      // 0xbc  the battle position, halved in place from 2 on into a slot
    u32 scdState;                     // 0xc0  the creator's scdState, which nothing reads
    u8 launcherPoints;                // 0xc4  the Wonder Launcher's points
    u8 ballSlide;                     // 0xc5  the ball count's slide, 0 for none
} BtlvInputCommandParam;

// Screen 2, the move screen
typedef struct {
    u16 moves[4];    // 0x00
    u8 pp[4];        // 0x08
    u8 maxPP[4];     // 0x0c
    u32 pos;         // 0x10  the battle position
    BOOL noMoveInfo; // 0x14  a move's information can't be shown with L held
} BtlvInputMoveParam;

// A panel of the target screen, 12 bytes
typedef struct {
    u8 msgForm : 2; // the name's message, by sex mark
    u8 selectable : 1;
    u8 unk1;
    u16 unk2;
    s16 hp; // 0: no mon in that position, or it has fainted
    s16 maxHp;
    PartyPkm *pkm;
} BtlvInputTargetEntry;

// Screen 3, the target screen
typedef struct {
    BtlvInputTargetEntry mons[6];
    u8 attackerPos; // 0x48
    u8 range;       // 0x49  the move's range
} BtlvInputTargetParam;

// Screen 4, yes or no
typedef struct {
    StrBuf *strs[2];
    BOOL canCancel;
} BtlvInputYesNoParam;

// Screen 5, the rotation screen
typedef struct {
    BattleMon *mons[3];
    BOOL moveUsable[3][4];
} BtlvInputRotationParam;

// Screen 6, the recorder screen
typedef struct {
    s32 unk0;
    s32 unk4; // printed left of the slash, in red when it differs from unk0
    s32 unk8; // printed right of it
    u32 mode; // 0 none, 1-3 a message (message 9-11) and BG 4 scrolled
} BtlvInputRecorderParam;

// An actor slot; the second word is never touched
typedef struct {
    ClActor *actor;
    u32 unk4;
} BtlvInputActor;

// The lower screen's work, 0x36c bytes
struct BtlvInput {
    TCBManager *tcbMgr;                // 0x000
    void *tcbMgrBuf;                   // 0x004
    TCB *tasks[8];                     // 0x008
    void (*taskEndFuncs[8])(TCB *tcb); // 0x028
    ArcTool *arc;                      // 0x048  archive 11
    GameData *gameData;                // 0x04c
    u32 rule;                          // 0x050  2 = triple
    u32 unk54;                         // 0x054
    u32 screen;                        // 0x058  0..7
    MsgData *msgData;                  // 0x05c
    BtlvFingerCursor *fingerCursor;    // 0x060
    PaletteFade *paletteFade;          // 0x064
    // 0x068
    u32 busy : 1;          // bit 0: a screen change runs
    u32 subTaskCount : 3;  // bits 1-3: running sub tasks
    u32 laterPoke : 1;     // bit 4: not the first mon to choose this turn
    u32 cursor : 4;        // bits 5-8: current button
    u32 prevCursor : 4;    // bits 9-12: initialised to 0xf
    u32 cursorRefresh : 1; // bit 13
    u32 secondRow : 1;     // bit 14
    u32 fadeMode : 2;      // bits 15-16
    u32 unk68_17 : 2;      // bits 17-18
    u32 pokeSlot : 2;      // bits 19-20: index into mons[] and moveUsable[]
    u32 unk68_21 : 2;      // bits 21-22: never touched
    u32 fingerSeq : 4;     // bits 23-26: the finger cursor demonstration's step
    u32 fingerCount : 4;   // bits 27-30
    u32 inputLocked : 1;   // bit 31
    // 0x06c
    u32 canCancel : 1;       // bit 0
    u32 selectionLocked : 1; // bit 1
    u32 pos : 8;             // bits 2-9: the move's range, the column of ov169's target tables
    u32 unk6c_10 : 8;        // never touched
    u32 noCancel : 1;        // bit 18: no cancel sound
    u32 unk6c_19 : 13;
    s32 pressedButton;                    // 0x070  -1 none; | 0x8000 when L is held
    BtlvInputPokeEntry pokeEntries[2][6]; // 0x074
    u32 chars;                            // 0x104
    u32 palette;                          // 0x108
    u32 cellAnims;                        // 0x10c
    u32 chars2;                           // 0x110
    u32 cellAnims2;                       // 0x114
    ClActUnit *pokeUnit;                  // 0x118
    BtlvInputActor pokeActors[2][6];      // 0x11c
    ClActUnit *cursorUnit;                // 0x17c
    BtlvInputActor cursorActors[6];       // 0x180
    u32 iconChars[3];                     // 0x1b0
    u32 iconPalette;                      // 0x1bc
    u32 iconCellAnims;                    // 0x1c0
    ClActUnit *iconUnit;                  // 0x1c4
    BtlvInputActor iconActors[3];         // 0x1c8
    u32 moveChars[4];                     // 0x1e0
    u32 movePalette;                      // 0x1f0
    u32 moveCellAnims;                    // 0x1f4
    ClActUnit *moveUnit;                  // 0x1f8
    ClActor *moveActors[4];               // 0x1fc
    ClActUnit *unit20c;                   // 0x20c
    ClActor *actors210[2];                // 0x210
    ClActUnit *unit218;                   // 0x218
    ClActor *actor21c;                    // 0x21c
    BOOL noUsableMove;                    // 0x220
    u32 typePalette;                      // 0x224
    u32 typeCellAnims;                    // 0x228
    ClActUnit *typeUnit;                  // 0x22c
    ClActor *typeActors[22];              // 0x230
    BOOL typeLoaded;                      // 0x288
    u8 *typePalBuf;                       // 0x28c  0x180 bytes
    u8 *typePalBuf2;                      // 0x290  0x1e0 bytes
    s32 typeAnimCounter;                  // 0x294  the position in the animation's palette list
    s32 typeAnimFrame;                    // 0x298  frames since the last palette, 0 to 4
    s32 typeAnimIndex;                    // 0x29c
    s32 typeAnimRepeat;                   // 0x2a0
    BOOL typePalLoaded;                   // 0x2a4
    Font *font;                           // 0x2a8
    BmpWin *msgWin;                       // 0x2ac
    GFLBitmap *msgBitmap;                 // 0x2b0
    BmpWin *subWin;                       // 0x2b4
    GFLBitmap *subBitmap;                 // 0x2b8
    TCB *coreTask;                        // 0x2bc
    BOOL inBattle;                        // 0x2c0
    HeapID heapId;                        // 0x2c4
    u8 lastCursor[3][8];                  // 0x2c6  [pokeIndex][screen]
    u8 buttonEnabled[8];                  // 0x2de
    u8 moveExists[4];                     // 0x2e6
    u16 lastMove[3];                      // 0x2ea  [pokeIndex]
    u16 moves[4];                         // 0x2f0
    u8 *keyCursorFlag;                    // 0x2f8
    u32 pokePos;                          // 0x2fc
    s32 pokeIndex;                        // 0x300
    BOOL noMoveInfo;                      // 0x304  the move screen's parameter
    u16 savedPalette[16];                 // 0x308
    u8 unk328;                            // 0x328
    u8 fileSet;                           // 0x329  2 selects the second set of archive 11's files
    u8 typeCount;                         // 0x32a
    u32 typeMask;                         // 0x32c
    BattleMon *mons[3];                   // 0x330
    BOOL moveUsable[3][4];                // 0x33c
}; // 0x36c

BtlvInput *BtlvInput_CreateSimple(GameData *gameData, u32 rule, PaletteFade *paletteFade, Font *font, u8 *keyCursorFlag,
                                  HeapID heapId);
BtlvInput *BtlvInput_CreateForBattle(GameData *gameData, u32 rule, u32 unk54, PaletteFade *paletteFade, Font *font,
                                     u8 *keyCursorFlag, u32 scdState, u8 unk328, u32 fileSet, u32 typeCount,
                                     u32 typeMask, BOOL noCancel, HeapID heapId);
void BtlvInput_Delete(BtlvInput *work);
void BtlvInput_Update(BtlvInput *work);
void BtlvInput_StartPaletteFade(BtlvInput *work, u32 mode);
void BtlvInput_StartFadeInWithGraphics(BtlvInput *work);
BOOL BtlvInput_IsFading(BtlvInput *work);
// screen: 0 standby, 1 command, 2 moves, 3 target, 4 yes/no, 5 rotation, 6 recorder, 7 the recorder's buttons; param
// is that screen's parameter struct
void BtlvInput_SetScreen(BtlvInput *work, u32 screen, void *param);
s32 BtlvInput_CheckInput(BtlvInput *work, const BtlvInputButtonSet *set, const BtlvInputKeyStop *stops);
BOOL BtlvInput_FingerDemoMain(BtlvInput *work);
BOOL BtlvInput_MoveScreenMain(BtlvInput *work, u8 *outSlot, s32 *outButton);
BOOL BtlvInput_IsBusy(BtlvInput *work);
u32 BtlvInput_GetScreen(BtlvInput *work);
void BtlvInput_SetTypeIconVisible(BtlvInput *work, BOOL visible, int index, int sequence);
void BtlvInput_StartTypeIconAnim(BtlvInput *work, int index);
u32 BtlvInput_GetTypeMask(BtlvInput *work);

#endif // POKEBW2_BATTLE_BTLV_INPUT_H
