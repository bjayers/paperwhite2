#ifndef POKEBW2_SAVE_C_GEAR_SAVEDATA_H
#define POKEBW2_SAVE_C_GEAR_SAVEDATA_H

#include "types.h"
#include "save/shortcut.h"
#include "struct_decls.h"
#include "system/pms_data.h"

#define CGEAR_PHRASE_MAX 5
#define CGEAR_PANEL_MAX 6
#define CGEAR_COLOR_MAX 3
#ifdef PAPERWHITE2
// Paper White 2: two more markers' places, in the settings' unused bytes
#define CGEAR_EXTRA_COLOR_MAX 2
// What CGearSettings_GetColor gives for a marker with no place yet
#define CGEAR_COLOR_NONE 0xff
#endif

// The C-Gear's settings, in the middle of its save block (CGearSettings_GetFromSave)
struct CGearSettings {
    // Which panel sits in each of the six places
    u8 panels[CGEAR_PANEL_MAX];
    // Whether the C-Gear was on when it last showed, so that it plays its startup once it has been turned on
    u8 wasOn;
    // Whether the C-Gear is on, which the start menu reads to know if it was on when the game was saved
    u8 on;
    u8 colors[CGEAR_COLOR_MAX];
    // The skin, of the built-in ones
    u8 skin;
    // The CRC of the downloaded skin, and whether there is one
    u16 skinCrc;
    u8 skinValid;
#ifdef PAPERWHITE2
    // Paper White 2: the places of the C-Gear's fourth and fifth markers, plus one (0 for none yet)
    u8 extraColors[CGEAR_EXTRA_COLOR_MAX];
    // Paper White 2: the background picture shown, of the hack's (0 for none)
    u8 picture;
    u8 padding14[0x25 - CGEAR_EXTRA_COLOR_MAX - 1];
#else
    u8 padding0F[0x25];
#endif
}; // size: 0x34

// Block 0x20 (swan's getCGearDataBlkAddress): the C-Gear's phrases, its settings, the shortcuts and a name
struct CGearSave {
    PMSData phrases[CGEAR_PHRASE_MAX];
    CGearSettings settings;
    ShortcutSave shortcuts;
    u16 name[9];
}; // size: 0x92

u32 CGearSave_GetSize(void);
void CGearSave_Init(CGearSave *cgear);
u32 CGearSettings_GetSize(void);
void CGearSettings_Init(CGearSettings *settings);
void CGearSettings_SetOn(CGearSettings *settings, u8 on);
u8 CGearSettings_IsOn(CGearSettings *settings);
void CGearSettings_SetSkin(CGearSettings *settings, u8 value);
u8 CGearSettings_GetSkin(CGearSettings *settings);
void CGearSettings_SetSkinValid(CGearSettings *settings, u8 valid);
u8 CGearSettings_GetSkinValid(CGearSettings *settings);
void CGearSettings_SetSkinCrc(CGearSettings *settings, u16 crc);
u16 CGearSettings_GetSkinCrc(CGearSettings *settings);
void CGearSettings_SetPanel(CGearSettings *settings, u32 place, u32 panel);
u8 CGearSettings_GetPanel(CGearSettings *settings, u32 place);
void CGearSettings_SetColor(CGearSettings *settings, s32 index, u8 color);
u8 CGearSettings_GetColor(CGearSettings *settings, s32 index);
void CGearSettings_SetWasOn(CGearSettings *settings, u32 value);
u8 CGearSettings_GetWasOn(CGearSettings *settings);
#ifdef PAPERWHITE2
void CGearSettings_SetPicture(CGearSettings *settings, u8 picture);
u8 CGearSettings_GetPicture(CGearSettings *settings);
#endif
CGearSettings *CGearSettings_GetFromSave(SaveControl *save);
CGearSettings *CGearSettings_GetFromGameData(GameData *gameData);

#endif // POKEBW2_SAVE_C_GEAR_SAVEDATA_H
