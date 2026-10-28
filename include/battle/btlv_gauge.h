#ifndef POKEBW2_BATTLE_BTLV_GAUGE_H
#define POKEBW2_BATTLE_BTLV_GAUGE_H

// Overlay 168's btlv_gauge.c (named by its string), the battle view's gauges: each battler's name box with its level,
// HP bar and numbers, EXP bar, status icon and caught mark, and the pinch music. The names are ours; swan has none for
// this file

#include "types.h"
#include "gfl/clact.h"
#include "gfl/heap.h"
#include "struct_decls.h"

// The battle view's positions, which index the gauges: 0 and 1 in single battles, 2 to 5 in double battles and 2 to 7
// in triple and rotation battles, the player's even. An enum, which MWCC doesn't propagate constants into, so some
// loops over the gauges test their bound before the first pass
typedef enum {
    BTLV_GAUGE_POS_MAX = 8,
} BtlvGaugePos;

// What a gauge shows of its mon, cleared when a mon is set, 0x44 bytes
typedef struct {
    u32 type;       // 0x00  the battle's style, BTL_STYLE_*
    u32 side;       // 0x04  1 for the opponent's
    s32 hp;         // 0x08
    s32 maxHp;      // 0x0c
    s32 hpAnim;     // 0x10  the HP shown, in 1/256 when maxHp is below the bar's 48 pixels
    s32 exp;        // 0x14  since the level started
    s32 expMax;     // 0x18  the level's EXP
    s32 nextExpMax; // 0x1c  the next level's, after a level up
    s32 expDelta;   // 0x20  the EXP to take away, so negated
    s32 expAnim;    // 0x24
    s32 hpDelta;    // 0x28  the HP to take away
    u8 level;       // 0x2c
    u8 sex;         // 0x2d  2 for no sex mark
    u8 unk2e;
    u8 caught; // 0x2f
    // 0x30
    u32 hpMoving : 1;     // bit 0
    u32 expMoving : 1;    // bit 1
    u32 levelUp : 1;      // bit 2
    u32 shown : 1;        // bit 3
    u32 levelUpSeq : 4;   // bits 4-7
    u32 expSeFrames : 8;  // bits 8-15: frames since the EXP sound started
    u32 slideFrames : 4;  // bits 16-19
    u32 shaking : 1;      // bit 20
    u32 blinkCount : 5;   // bits 21-25: the lost HP's blinks left
    u32 blinking : 1;     // bit 26
    u32 changed : 1;      // bit 27
    u32 expSe : 1;        // bit 28: the EXP sound plays
    u32 visible : 1;      // bit 29
    u32 statusHidden : 1; // bit 30
    u32 unk30_31 : 1;
    u32 hpSpeed;    // 0x34  0 to change at once
    s32 hpDots;     // 0x38  the HP bar's pixels
    u32 status;     // 0x3c  the status icon's sequence, in mode 2
    TCB *slideTask; // 0x40
} BtlvGaugeMon;

// A battler's gauge, 0x84 bytes
typedef struct {
    ClActor *nameActor;   // 0x00  the box with the name, sex, level and caught mark
    ClActor *hpNumActor;  // 0x04
    ClActor *hpBarActor;  // 0x08
    ClActor *damageActor; // 0x0c  the HP the bar lost, which blinks
    ClActor *expActor;    // 0x10  the player's side in single and double battles only
    ClActor *statusActor; // 0x14
    u32 nameChars;        // 0x18
    u32 nameCellAnims;    // 0x1c
    u32 hpNumChars;       // 0x20
    u32 hpNumCellAnims;   // 0x24
    u32 hpBarChars;       // 0x28
    u32 hpBarCellAnims;   // 0x2c
    u32 damageChars;      // 0x30
    u32 damageCellAnims;  // 0x34
    u32 expChars;         // 0x38
    u32 expCellAnims;     // 0x3c
    BtlvGaugeMon mon;     // 0x40
} BtlvGaugeEntry;

// The gauges' work, 0x46c bytes
struct BtlvGauge {
    ClActUnit *unit;           // 0x000
    ArcTool *arc;              // 0x004  archive 11
    Font *font;                // 0x008
    TCB *flashTask;            // 0x00c
    void *charFile;            // 0x010
    u8 *chars;                 // 0x014  the tiles the gauges are drawn from
    u32 palettes[6];           // 0x018  by view position, the positions from 2 on taking 0 and 1's
    u32 statusChars;           // 0x030
    u32 statusCellAnims;       // 0x034
    u32 statusPalette;         // 0x038
    u32 statusPaletteDark;     // 0x03c  for the rotation's back mons
    BtlvGaugeEntry entries[8]; // 0x040  by view position
    // 0x460
    u32 unk460_0 : 1;
    u32 bgmFading : 1;     // bit 1
    u32 pinch : 1;         // bit 2: the pinch music plays
    u32 bgmReplayed : 1;   // bit 3
    u32 showNumbers : 1;   // bit 4: the player's HP numbers instead of the bar, in triple and rotation battles
    u32 shakeAngle : 16;   // bits 5-20
    u32 noPinchBgm : 1;    // bit 21
    u32 toggleRequest : 1; // bit 22
    u32 loaded : 1;        // bit 23
    u32 mode : 2;          // bits 24-25
    u32 unk460_26 : 6;
    u32 bgm;       // 0x464  the battle's music
    HeapID heapId; // 0x468
}; // 0x46c

// mode 2 shows no gauges and only keeps the statuses
BtlvGauge *BtlvGauge_Create(Font *font, u32 mode, HeapID heapId);
void BtlvGauge_Delete(BtlvGauge *gauge);
void BtlvGauge_Update(BtlvGauge *gauge);
// type is the battle's style, BTL_STYLE_*; index the gauge, by view position, even for the player's side
void BtlvGauge_SetBattleMon(BtlvGauge *gauge, BtlMainModule *mainModule, BattleMon *mon, u32 type, int index);
void BtlvGauge_SetPartyPkm(BtlvGauge *gauge, PokeDexSave *pokedex, PartyPkm *pkm, u32 type, int index);
u32 BtlvGauge_PaletteFile(void);
void BtlvGauge_Hide(BtlvGauge *gauge, int index);
void BtlvGauge_SetPos(BtlvGauge *gauge, int index, const ClActorPos *offset);
void BtlvGauge_StartHpChange(BtlvGauge *gauge, int index, s32 hp);
void BtlvGauge_SetHpAtOnce(BtlvGauge *gauge, int index, s32 hp);
void BtlvGauge_StartExpGain(BtlvGauge *gauge, int index, s32 exp);
void BtlvGauge_StartLevelUp(BtlvGauge *gauge, BattleMon *mon, int index);
BOOL BtlvGauge_IsBusy(BtlvGauge *gauge);
// side 2 is both sides
void BtlvGauge_SetSideVisible(BtlvGauge *gauge, BOOL visible, u32 side);
void BtlvGauge_SetVisible(BtlvGauge *gauge, BOOL visible, int index);
BOOL BtlvGauge_IsShown(BtlvGauge *gauge, int index);
BOOL BtlvGauge_CheckChanged(BtlvGauge *gauge, int index);
void BtlvGauge_SetStatus(BtlvGauge *gauge, u32 status, int index);
// index 8 stops every gauge's shake without starting one
void BtlvGauge_StartShake(BtlvGauge *gauge, int index);
BOOL BtlvGauge_IsPinch(BtlvGauge *gauge);
void BtlvGauge_SetPinch(BtlvGauge *gauge, BOOL pinch);
void BtlvGauge_SetBgm(BtlvGauge *gauge, u32 bgm);
void BtlvGauge_SetBgmReplayed(BtlvGauge *gauge, BOOL replayed);
void BtlvGauge_SetNoPinchBgm(BtlvGauge *gauge, BOOL noPinchBgm);
BOOL BtlvGauge_GetStatus(BtlvGauge *gauge, int index, u32 *color, u32 *status);
void BtlvGauge_RequestNumberToggle(BtlvGauge *gauge);
void BtlvGauge_HideStatus(BtlvGauge *gauge, int index);

#endif // POKEBW2_BATTLE_BTLV_GAUGE_H
