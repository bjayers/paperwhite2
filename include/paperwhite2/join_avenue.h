#ifndef PAPERWHITE2_JOIN_AVENUE_H
#define PAPERWHITE2_JOIN_AVENUE_H

#include "types.h"
#include "field/resort.h"
#include "save/join_avenue.h"
#include "struct_decls.h"

// Paper White 2: the Join Avenue's owners (src/paperwhite2/ov137/paperwhite2_join_avenue.c,
// docs/paperwhite2/design/join-avenue.md). They are the rows of the people's table
// (res/field/join_avenue/09_people.json) of type JOIN_AVENUE_OWNER_TYPE, each wanting its shop; only they can be
// invited, and they don't leave

// The people's table's type of the owners, after the original's types
#define JOIN_AVENUE_OWNER_TYPE 8

// The avenue script's GetValue (Scrcmd_Resort_GetValue) of whether the person talked to is an owner, after the
// original's values
#define JOIN_AVENUE_VALUE_IS_OWNER 100

// The daily visitors' first: one owner who isn't on the avenue yet (not an occupant, not waiting), but for the
// Nursery's before its unlock. A full list of entries makes room by sending one visitor away, never an owner or a
// special visitor
void PaperWhite2_JoinAvenue_AddOwner(ResortSys *sys, GameData *gameData, JoinAvenueSave *joinAvenue, HeapID heapId);
// Whether a trainer ID is one of the owners'
BOOL PaperWhite2_JoinAvenue_IsOwner(ResortSys *sys, u32 trainerId);

#endif // PAPERWHITE2_JOIN_AVENUE_H
