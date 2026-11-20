#ifndef PAPERWHITE2_ENTRALINK_RESERVE_H
#define PAPERWHITE2_ENTRALINK_RESERVE_H

#include "types.h"
#include "field/field_script.h"
#include "struct_decls.h"

// Paper White 2: the Entralink's Reserve Box (entralink-buffs.md, phase 7). In the hub, before a run, the player sets
// aside up to run.json's reserve_slots Pokémon of the PC boxes, which a rest stop's swap NPC (ENTRALINK_NPC_SWAP) can
// bring into the run's team for Dream Dust, as a level 100 copy in place of one of the team's copies
// (paperwhite2/entralink_run_party.h). The box keeps live links, not copies: only each Pokémon's PID, in the progress
// block (paperwhite2/entralink_progress.h's reservePids), and whenever the box is used (listed, or a Pokémon swapped
// in) the PC boxes are searched for it and the Pokémon is used as it is then; moving it between boxes keeps the link,
// and one that isn't in a box any more (released, or moved into the party) drops off, its slot freed. Code in overlay
// 12, beside the run's script command, whose actions ENTRALINK_RUN_ACTION_RESERVE_COUNT to ENTRALINK_RUN_ACTION_SWAP
// (paperwhite2/entralink_run_actions.h) it runs

// The Reserve Box's and the swap's actions of the script command EntralinkRun; returns TRUE when the script waits (the
// PC Box's pick)
BOOL EntralinkReserve_Action(FieldScriptEnv *env, u16 action, u16 arg, u16 arg2, u16 *result);

#endif // PAPERWHITE2_ENTRALINK_RESERVE_H
