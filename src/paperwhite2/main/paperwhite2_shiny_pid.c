#include "types.h"
#include "gfl/random.h"
#include "paperwhite2/shiny_candy.h"
#include "pml/poke_party.h"

// Paper White 2: the shiny PID that the Shiny Candy (overlay 165) and the debug menu's Make shiny (overlay 12) give, in
// main so that both can call it

// The values of the XOR of the trainer ID's and the PID's halves that the new PID can take: those below the threshold
// whose two low bits are the ones that keep bits 16 and 17 of the PID
#define SHINY_CANDY_CHOICES (PID_RARE_THRESHOLD >> 2)

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
