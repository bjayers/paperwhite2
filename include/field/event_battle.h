#ifndef POKEBW2_FIELD_EVENT_BATTLE_H
#define POKEBW2_FIELD_EVENT_BATTLE_H

// Overlay 12's event_battle.c: the events that run battles from the field. Function names from swan
// (https://github.com/ds-pokemon-hacking/swan, GPL-3.0)

#include "types.h"
#include "app/event_battle_return.h"
#include "gfl/heap.h"
#include "struct_decls.h"
#include "system/game_event.h"

// The work of EventBattleCall_Callback, the battle itself
typedef struct {
    GameSystem *gsys;
    GameData *gameData;
    BtlSetup *setup;
    EventBattleReturnParam battleReturnParam;
    // Whether the caller returns to the field itself
    u32 unk14;
    // Whether losing doesn't black the player out
    u32 unk18;
    // Whether it is the Trial House's
    u32 unk1C;
    // Whether the caller frees the setup
    u32 unk20;
    u32 encEffect;
    u32 flags;
} EventBattleCallWork;

// The work of EventWildBattleCall_Callback
typedef struct {
    GameSystem *gsys;
    BtlSetup *setup;
    u8 unk08;
    u8 specialIndex;
    u8 unk0A;
    u32 unk0C;
#ifdef PAPERWHITE2
    // Paper White 2: whether a wild Pokémon of the battle is shiny, for the Shiny Candy that it may drop
    BOOL shinyFoe;
#endif
} EventWildBattleCallWork;

// A wild battle, and the same with the index of the special Pokémon met, 0xff for none
GameEvent *EventWildBattleCall_CreateCore(GameSystem *gsys, Field *field, BtlSetup *setup, u8 a3, u32 a4,
                                          u8 specialIndex);
GameEvent *EventWildBattleCall_Create(GameSystem *gsys, Field *field, BtlSetup *setup, u8 a3, u32 a4);
// A battle against a trainer of the field, with flags for its kind
GameEvent *EventTrainerBattleCall_Create(GameSystem *gsys, Field *field, u32 a2, u32 a3, u32 trainerId, u32 a5,
                                         u32 flags);
GameEvent *EventBSubwayBattleCall_Create(GameSystem *gsys, Field *field, BtlSetup *setup);
GameEvent *CreateTrialHouseBattleEvent(GameSystem *gsys, Field *field, BtlSetup *setup);
GameEvent *EventInfinityDungeonBattleCall_Create(GameSystem *gsys, Field *field, BtlSetup *setup);
GameEvent *EventWbtBattleCall_Create(GameSystem *gsys, Field *field, BtlSetup *setup);
// The capture demonstration's battle
GameEvent *EventCaptureDemo_Create(GameSystem *gsys, Field *field, HeapID heapId);
// A battle against a trainer, who sends out the Pokémon of the in-game trade of the index once it is done
GameEvent *LoadTradedPokemonBattleStats(GameSystem *gsys, Field *field, u32 a2, u32 a3, u32 trainerId, u32 a5,
                                        u32 flags, u32 index);

#ifdef PAPERWHITE2
// Paper White 2: overlay 12's event_battle.c, for the Following Pokémon
BOOL PaperWhite2_IsWildBattleCallCallback(GameEventCallback callback);
BOOL PaperWhite2_IsBattleCallCallback(GameEventCallback callback);
#endif
#endif // POKEBW2_FIELD_EVENT_BATTLE_H
