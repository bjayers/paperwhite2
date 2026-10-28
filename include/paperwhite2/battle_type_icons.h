#ifndef PAPERWHITE2_BATTLE_TYPE_ICONS_H
#define PAPERWHITE2_BATTLE_TYPE_ICONS_H

#include "types.h"
#include "battle/btlv_gauge.h"
#include "struct_decls.h"

// Paper White 2: Type Icons (src/paperwhite2/ov168/paperwhite2_type_icons.c), which colors the light face at the left
// edge of each battler's name box with its current types. The gauges' code (btlv_gauge.c, btlv_effect.c) calls these
// where the PMC plugin hooked it: each wrapper does the plugin's part around the gauge function it names

// A name box the icons are drawn into, by view position
typedef struct PaperWhite2TypeIcon PaperWhite2TypeIcon;

void PaperWhite2_TypeIconsSetBattleMon(BtlvGauge *gauge, BtlMainModule *mainModule, BattleMon *mon, u32 type,
                                       int index);
void PaperWhite2_TypeIconsSetPartyPkm(BtlvGauge *gauge, PokeDexSave *pokedex, PartyPkm *pkm, u32 type, int index);
void PaperWhite2_TypeIconsUpdate(BtlvGauge *gauge);
void PaperWhite2_TypeIconsHide(BtlvGauge *gauge, int index);
void PaperWhite2_TypeIconsSetStatus(BtlvGauge *gauge, u32 status, int index);
// Takes the icons off every name box of the gauges before BtlvGauge_Delete frees their resources
void PaperWhite2_TypeIconsRelease(BtlvGauge *gauge);
// Around the drawing of a name box's name, sex or level: takes the icons and the header's shift off first, and gives
// the box they were on, or NULL, to draw them again after
PaperWhite2TypeIcon *PaperWhite2_TypeIconsBeforeText(BtlvGauge *gauge, BtlvGaugeEntry *entry);
void PaperWhite2_TypeIconsAfterText(PaperWhite2TypeIcon *icon);

#endif // PAPERWHITE2_BATTLE_TYPE_ICONS_H
