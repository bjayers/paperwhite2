#ifndef PAPERWHITE2_ACTOR_PALETTES_H
#define PAPERWHITE2_ACTOR_PALETTES_H

#include "types.h"
#include "gfl/billboard_actor.h"
#include "gfl/g3d.h"
#include "paperwhite2/wanderers.h"

// Paper White 2: field billboards with a palette of their own, so that each wanderer and the follower shows its own
// palette variation by its PID though its sprite's material is shared by object code
// (src/paperwhite2/ov036/paperwhite2_actor_palettes.c, docs/paperwhite2/design/palette-variation.md). Each owner has
// a slot: a copy of its billboard's material that draws the same texture with its own 16 colours in palette VRAM

// The slots: one a wanderer (0 to WANDERERS_MAX - 1), then the follower's
#define ACTOR_PALETTE_FOLLOWER WANDERERS_MAX
#define ACTOR_PALETTES (WANDERERS_MAX + 1)

// The individual a slot shows: its sprite's object code, species and PID. Called before its sprite's load is asked
// for, so that the load keeps the sprite's colours (PaperWhite2_ActorPalettes_Capture); objCode 0 for none
void PaperWhite2_ActorPalettes_Set(u32 slot, u16 objCode, u32 species, u32 personality);
// Gives the slot's billboard (a handle of sys) its own palette, made the first time and again when the billboard, its
// material or the individual changes; called every frame its billboard is out. Where there's no room (a material slot
// or palette VRAM) or the sprite's colours weren't kept, the billboard keeps its shared material
void PaperWhite2_ActorPalettes_Bind(u32 slot, BillboardActorSys *sys, u16 billboard);
// The slot's palette freed, its billboard (if still out) back on its shared material, and the slot emptied
void PaperWhite2_ActorPalettes_Release(u32 slot);
// Every slot of sys freed, as the field's billboards go (FldBillboardActor_Exit)
void PaperWhite2_ActorPalettes_ReleaseAll(BillboardActorSys *sys);
// FldBillboardActor_LoadMaterial's hook, before the sheet is uploaded: keeps the colours of a follower sprite or of a
// sprite a slot waits for
void PaperWhite2_ActorPalettes_Capture(u16 objCode, G3DResource *resource);

#endif // PAPERWHITE2_ACTOR_PALETTES_H
