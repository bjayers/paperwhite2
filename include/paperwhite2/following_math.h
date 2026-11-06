#ifndef PAPERWHITE2_FOLLOWING_MATH_H
#define PAPERWHITE2_FOLLOWING_MATH_H

#include "types.h"
#include "nitro/cp.h"

// Paper White 2: the Following Pokémon's 64-bit divisions and square roots on the DS's divider and square root unit,
// in place of the bit-at-a-time loops they had (paperwhite2_following_trail.c, paperwhite2_following_render_math.c).
// The results are the same: the units truncate, as the loops did, and main code uses them as FX_Div does

// n / d, truncated, saturating at 0x7fffffff; d is not 0. A numerator of 2^63 or more always saturates, since d is less
// than 2^32
static inline u32 Following_DivideSaturating(u64 n, u32 d) {
    u64 q;

    if (n >> 63) {
        return 0x7fffffff;
    }
    CP_SetDiv64_64(n, d);
    q = (u64)CP_GetDivResult64();
    return q > 0x7fffffff ? 0x7fffffff : (u32)q;
}

// The square root of n, rounded down
static inline u32 Following_SquareRoot64(u64 n) {
    CP_SetSqrt64(n);
    return CP_GetSqrtResult32();
}

#endif // PAPERWHITE2_FOLLOWING_MATH_H
