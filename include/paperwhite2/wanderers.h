#ifndef PAPERWHITE2_WANDERERS_H
#define PAPERWHITE2_WANDERERS_H

#include "types.h"
#include "struct_decls.h"

// Paper White 2: the wanderers, wild Pokémon seen in tall and dark grass
// (src/paperwhite2/ov036/paperwhite2_wanderers.c, docs/paperwhite2/plugins.md, Wanderers): drawn as the ambients are,
// without an actor, up to WANDERERS_MAX at once, each picked as a step in its grass would pick it. Touching one starts
// a single battle with it

// The most on screen at once
#define WANDERERS_MAX 3

// None out, for a field being made (its billboards are new); and the wanderers spawned, moved and drawn, which the
// field's update calls every frame, after the ambients'
void PaperWhite2_WanderersReset(void);
void PaperWhite2_WanderersUpdate(Field *field);
// Whether an actor's step onto a tile is blocked by a wanderer there (or on its way there): blocked as the other
// checks found it, or TRUE. The player's step onto one touches it
BOOL PaperWhite2_WanderersCheckGridCollision(const FieldActor *actor, s16 x, s16 z, BOOL blocked);
// The touch's event, once one is waiting and the player is free, where the grid's checks found no event
GameEvent *PaperWhite2_WanderersGridEvent(GameSystem *gsys, Field *field, GameEvent *event);
// Whether a wanderer draws, or waits for, an object code's sprite (which an actor's going doesn't unload then)
BOOL PaperWhite2_WanderersUseObjCode(u16 objCode);

// A wanderer for the debug menu's readout: FALSE for a free slot
typedef struct {
    u16 species;
    u8 level;
    u8 shiny;
    u8 state;
    u8 pad;
    s16 x;
    s16 z;
} WandererInfo;

// The wanderer's states, as WandererInfo gives them
enum {
    WANDERER_FREE,
    WANDERER_LOADING,
    WANDERER_RISING,
    WANDERER_IDLE,
    WANDERER_WALKING,
    WANDERER_SINKING,
    WANDERER_TOUCHED,
};

BOOL PaperWhite2_WanderersGetInfo(u32 index, WandererInfo *out);

#endif // PAPERWHITE2_WANDERERS_H
