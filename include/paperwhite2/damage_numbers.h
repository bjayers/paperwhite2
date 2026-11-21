#ifndef PAPERWHITE2_DAMAGE_NUMBERS_H
#define PAPERWHITE2_DAMAGE_NUMBERS_H

#include "types.h"
#include "struct_decls.h"

// Paper White 2: the damage numbers (docs/paperwhite2/design/entralink-buffs.md, phase 6), overlay 168's
// src/paperwhite2/ov168/paperwhite2_damage_numbers.c. Each hit of the team's on a foe (in the run's battles, or every
// battle but link battles, by settings' damage_numbers.battles) pops its full damage over the foe: the server puts
// SC_DAMAGE_NUMBER before the hit's SC_OP_SUBTRACT_HP, and the client hands it to the view, which draws it as 3D
// quads over the scene (translucent, scaled freely, no OBJ or affine slots), from the digits' sheet
// (res/paperwhite2/battle/damage_digits.png, tools/paperwhite2/damage_digits.py) loaded into texture VRAM once a
// battle. The number appears large and see-through, shrinks into place, holds, then fades as it rises; its digits
// may play their shine frames left to right once it lands. Nothing waits for it. It is placed over the foe as the
// battle camera shows it at rest (not the attack's camera), kept inside the screen at every size, drawn in front of
// everything in the scene (a W-buffer depth under the scene's), and its digits are spaced by their glyphs' widths in
// the sheet (settings' overlap and group_space)

// The battle view's archive's members that tools/paperwhite2/damage_digits.py adds after its own: the digits' sheet
// and the cell of a foe's HP line (two 32 by 8 pieces)
#define DAMAGE_DIGITS_MEMBER 573
#define DAMAGE_NUMBERS_HP_LINE_CELL 574

// ENTRALINK_DAMAGE_NUMBERS_BATTLES (settings' damage_numbers.battles): none, the run's, every battle but link ones
#define DAMAGE_NUMBERS_BATTLES_OFF 0
#define DAMAGE_NUMBERS_BATTLES_RUN 1
#define DAMAGE_NUMBERS_BATTLES_ALL 2
// ENTRALINK_DAMAGE_NUMBERS_SHINE (settings' damage_numbers.shine): never, critical or capped hits, every hit
#define DAMAGE_NUMBERS_SHINE_OFF 0
#define DAMAGE_NUMBERS_SHINE_CRITICAL 1
#define DAMAGE_NUMBERS_SHINE_ALWAYS 2

// SC_DAMAGE_NUMBER's flags: the hit was critical, the damage cap cut it
#define DAMAGE_NUMBER_CRITICAL (1 << 0)
#define DAMAGE_NUMBER_CAPPED (1 << 1)

// The battle view starts (BtlvEffect_Init, its stage made): when the battle shows damage numbers, loads the digits
// into VRAM
void PaperWhite2_DamageNumbersInit(BtlMainModule *mainModule, HeapID heapId);
// The battle view ends (BtlvEffect_Exit): frees the VRAM
void PaperWhite2_DamageNumbersExit(void);
// Each frame, after the scene's 3D (BtlvEffect_Main): moves the numbers on and draws them
void PaperWhite2_DamageNumbersDraw(void);
// A hit's number over the Pokémon at a view position: its damage and its DAMAGE_NUMBER_* flags
void PaperWhite2_DamageNumbersShow(u32 viewPos, u32 damage, u32 flags);
// Whether a foe's gauge shows its HP in this battle (settings' damage_numbers.hp_numbers in the run's battles)
BOOL PaperWhite2_DamageNumbersFoeHP(void);

#endif // PAPERWHITE2_DAMAGE_NUMBERS_H
