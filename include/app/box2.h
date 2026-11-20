#ifndef POKEBW2_APP_BOX2_H
#define POKEBW2_APP_BOX2_H

#include "types.h"
#include "gfl/overlay.h"
#include "gfl/proc.h"
#include "struct_decls.h"

// The PC Box
#define OVERLAY_BOX2 OVERLAY_ID(255)

#define BOX2_MODE_BATTLE_BOX 4
#define BOX2_MODE_DREAM_WORLD 5

#ifdef PAPERWHITE2
// Paper White 2: Box2Param's pick
#define BOX2_PICK_NONE 0
#define BOX2_PICK_WONDER_TRADE 1
#define BOX2_PICK_RESERVE 2
#endif

typedef struct {
    GameData *gameData;
    BoxSaveAccessor *boxes;
    PokeParty *party;
    BagSave *bag;
    PlayerInfo *playerInfo;
    // The Battle Box's team is locked: its Pokémon can't be moved and their markings can't change
    u32 battleBoxLocked;
    TrainerDataSave *trainerData;
    // Passed on to the summary
    u32 isNationalDex;
    // Flags by species, which Box2Main_IsSpeciesFlagged reads
    u8 *unk20;
    u32 mode;
    // Set when the player left with the close button, cleared when he backed out
    u16 closed;
    // Where the chosen Pokemon is, 0xff for both if none was chosen
    u8 tray;
    u8 position;
#ifdef PAPERWHITE2
    // Paper White 2: with BOX2_MODE_DREAM_WORLD, whose pick it is (BOX2_PICK_*), whose title and messages it shows: the
    // Wonder Trade's (src/paperwhite2/ov012/paperwhite2_wonder_trade.c) or the Entralink's Reserve Box's
    // (src/paperwhite2/ov012/paperwhite2_entralink_reserve.c); BOX2_PICK_NONE for the Dream World's own
    u32 pick;
#endif
} Box2Param;

extern const GameProcFunctions BOX2_PROC_FUNCTIONS;

#endif // POKEBW2_APP_BOX2_H
