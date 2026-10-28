#ifndef PAPERWHITE2_BATTLE_MOVE_PREVIEW_H
#define PAPERWHITE2_BATTLE_MOVE_PREVIEW_H

#include "types.h"
#include "battle/btlv_input.h"
#include "struct_decls.h"

// Paper White 2: Move Effectiveness Preview (src/paperwhite2/ov168/paperwhite2_move_preview.c), which colors the names
// of damaging moves on the battle's lower screen by their type matchup against the opponent. The lower screen's code
// (btlv_input.c) calls these where the PMC plugin hooked it

// The selected move's name, which the preview carries from the move screen to the target screen across the screen's
// clearing: its 128 by 16 pixels at 2 bits each, and whether there is one
typedef struct {
    u8 glyphs[16 * 32];
    BOOL keep;
} PaperWhite2MoveLabel;

// After BtlvInput_DrawMoveTiles: reads the moves' types and colors their names
void PaperWhite2_MovePreviewAfterDrawMoves(BtlvInput *work, const BtlvInputMoveParam *param);
// Around BtlvInput_SetScreen's clearing of the screen: going from the move screen to the target screen, keeps the
// selected move's name and draws it above the target cards. Restores the text palette's entries first
void PaperWhite2_MovePreviewBeforeClear(BtlvInput *work, u32 nextScreen, PaperWhite2MoveLabel *label);
void PaperWhite2_MovePreviewAfterClear(BtlvInput *work, const PaperWhite2MoveLabel *label);
// After BtlvInput_KeyInput: colors the moves again on the move screen, or the carried name against the selected
// target on the target screen. touch is the key input's touch result
void PaperWhite2_MovePreviewAfterKeyInput(BtlvInput *work, const BtlvInputKeyStop *stops, s32 touch);

#endif // PAPERWHITE2_BATTLE_MOVE_PREVIEW_H
