#include "types.h"
#include "gfl/random.h"
#include "paperwhite2/conditions.h"
#include "paperwhite2/shiny_candy.h"
#include "pml/poke_party.h"

// Paper White 2: the shiny PID that the Shiny Candy (overlay 165) and the debug menu's Make shiny (overlay 12) give,
// and the PID's Shiny Candy drop (overlays 12 and 255), in main so that all of them can call it

// The values of the XOR of the trainer ID's and the PID's halves that the new PID can take: those below the threshold
// whose two low bits are the ones that keep bits 16 and 17 of the PID
#define SHINY_CANDY_CHOICES (PID_RARE_THRESHOLD >> 2)

// The drop's key of Conditions_Hash, so that its hash of a PID is the drop's own
#define SHINY_CANDY_DROP_KEY 0x5ca7d0

// A shiny PID that keeps the low 18 bits of the old one: the low 16 give the sex (and Gen 5 keeps the nature in a
// field of its own), bit 16 the ability slot, and bits 13 to 17 the order of the box data's blocks
// (PML_PkmGetParamBlockCore), which a new PID doesn't reorder. Of the shiny high halves, it takes a random one that
// also keeps the side that Wurmple evolves to, by the high half's last digit (evolution_check.c), where one does
u32 PaperWhite2_MakeShinyPID(u32 id, u32 pid) {
    u32 high = pid >> 16;
    // The high half whose XOR with the other three halves is 0
    u32 zero = (id >> 16) ^ (id & 0xffff) ^ (pid & 0xffff);
    u32 start = GFL_RandomLC(SHINY_CANDY_CHOICES);
    u32 first = 0;
    u32 candidate;
    u32 i;

    for (i = 0; i < SHINY_CANDY_CHOICES; i++) {
        candidate = zero ^ ((((start + i) % SHINY_CANDY_CHOICES) << 2) | ((zero ^ high) & 3));
        if (i == 0) {
            first = candidate;
        }
        if ((candidate % 10 < 5) == (high % 10 < 5)) {
            return (candidate << 16) | (pid & 0xffff);
        }
    }
    return (first << 16) | (pid & 0xffff);
}

// The PID mixed by Conditions_Hash, which every bit of it moves: the PID's own bits follow the sex, the ability slot,
// the shiny variant and the trainer ID, which the drop must not
BOOL PaperWhite2_IsShinyCandyDropper(u32 pid) {
    return Conditions_Hash(pid, SHINY_CANDY_DROP_KEY) % 100 < SHINY_CANDY_DROP_PERCENT;
}
