#ifndef POKEBW2_PAPERWHITE2_FIELD_MOVES_H
#define POKEBW2_PAPERWHITE2_FIELD_MOVES_H

#include "types.h"
#include "field/field_script.h"
#include "field/player_action.h"
#include "pml/poke_party.h"
#include "struct_decls.h"
#include "system/vm.h"

// Paper White 2: the HMs' field moves (Cut, Fly, Surf, Strength, Waterfall, Dive) can be used by a party Pokémon that
// can learn them, without knowing them (src/paperwhite2/main/paperwhite2_field_moves.c, in ARM9 main for the field's
// scripts, the party list and the field's app calls). See docs/paperwhite2/plugins.md, HMs by learners

// The slot PaperWhite2_FieldMoves_FindUser gives when no party Pokémon can use the move, as PokePartyHasMoveAny's
#define FIELD_MOVE_NO_USER PARTY_SIZE

// Whether a Pokémon, not an egg, can learn the HM's move by its machine, from the HMs' bits of its personal data
BOOL PaperWhite2_FieldMoves_CanLearnHM(PartyPkm *pkm, u16 move);
// The party slot of the Pokémon that uses the move in the field: the first, not an egg, that knows it, otherwise, for
// an HM's move, the first that can learn it; FIELD_MOVE_NO_USER if none can. Fainted Pokémon count, as they do for the
// moves they know in the original
u32 PaperWhite2_FieldMoves_FindUser(PokeParty *party, u16 move);

// Field script command 0x2f6, PartyFieldMoveUser result, move (src/paperwhite2/ov012/paperwhite2_field_moves_field.c):
// PaperWhite2_FieldMoves_FindUser's slot into the variable result. The HMs' global scripts (res/field/scripts/
// global_10000.s) check with it where they checked PokePartyHasMoveAny, which still asks only for a Pokémon that knows
// the move (Driftveil City's TM request)
BOOL Scrcmd_PaperWhite2_PartyFieldMoveUser(VM *vm, FieldScriptEnv *env);
// The party slot of the Pokémon that flies from the Town Map, FIELD_MOVE_NO_USER if Fly can't be used where the player
// stands (CheckAllowHMEvent, with the field's action possibilities) or no Pokémon can use it. The Town Map, from the
// bag, the Y button or the C-Gear, then picks where to fly (FieldAppCall_CreateTownMapParam)
u32 PaperWhite2_FieldMoves_FindFlyUser(GameSystem *gsys, PlayerActionPossibilities *action);

#endif // POKEBW2_PAPERWHITE2_FIELD_MOVES_H
