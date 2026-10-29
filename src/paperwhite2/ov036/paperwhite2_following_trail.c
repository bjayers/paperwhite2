#include "types.h"
#include "limits.h"
#include "nitro/fx.h"
#include "paperwhite2/following.h"

// Paper White 2: the Following Pokémon's follower, its trail behind the player, the swap when the player steps back
// onto it and the choice of the party member that follows, ported from Pokeweb's following.c

typedef struct {
    u32 species;
    u32 form;
} FollowingForcedForm;

// The display forms of the follower's sprite, palette and size row. Identity, dialogue, gifts and cries keep the
// party member's own form. Every species without a row shows its own
static const FollowingForcedForm sForcedForms[] = {
    // Unown '?': forms 0 to 25 are A to Z, 26 is '!' and 27 is '?'
    { 201, 27 },
    // Arceus in its Normal form, whatever plate it holds
    { 493, 0 },
};

static BOOL CanFollow(const FollowingPokemon *mon) {
    return !mon->egg && mon->species != 0 && mon->species <= FOLLOWING_MAX_SPECIES;
}

s32 FollowingParty_SelectSlot(const FollowingPokemon *party, u32 count) {
    s32 fallback = -1;
    u32 i;

    if (party == NULL || count > FOLLOWING_PARTY_CAPACITY) {
        return -1;
    }
    for (i = 0; i < count; i++) {
        if (!CanFollow(&party[i])) {
            continue;
        }
        if (fallback < 0) {
            fallback = i;
        }
        if (party[i].hp != 0) {
            return i;
        }
    }
    return fallback;
}

s32 FollowingParty_CycleSlot(const FollowingPokemon *party, u32 count, s32 current, s32 direction) {
    s32 baseline;
    BOOL healthy;
    s32 slot;
    u32 i;
    u32 step;

    if (party == NULL || count == 0 || count > FOLLOWING_PARTY_CAPACITY || (direction != -1 && direction != 1)) {
        return -1;
    }
    baseline = FollowingParty_SelectSlot(party, count);
    if (baseline < 0) {
        return -1;
    }
    if (current < 0 || (u32)current >= count) {
        current = baseline;
    }
    healthy = FALSE;
    for (i = 0; i < count; i++) {
        if (CanFollow(&party[i]) && party[i].hp != 0) {
            healthy = TRUE;
        }
    }
    slot = current;
    for (step = 1; step <= count; step++) {
        slot += direction;
        if (slot < 0) {
            slot = count - 1;
        } else if ((u32)slot >= count) {
            slot = 0;
        }
        if (CanFollow(&party[slot]) && (!healthy || party[slot].hp != 0)) {
            return slot == current ? -1 : slot;
        }
    }
    return -1;
}

BOOL FollowingPokemon_IsSame(const FollowingPokemon *a, const FollowingPokemon *b) {
    return a->personality == b->personality && a->trainer == b->trainer && a->species == b->species &&
           a->form == b->form && a->gender == b->gender && a->shiny == b->shiny;
}

BOOL FollowingPokemon_IsTired(const FollowingPokemon *mon) {
    return mon->maxHp != 0 && (u32)mon->hp * 4 <= mon->maxHp;
}

BOOL Following_IsIdleAnimationEnabled(FollowingState state, BOOL visible, BOOL effectBusy) {
    return state == FOLLOWING_STATE_FOLLOWING && visible && !effectBusy;
}

void FollowingTrail_Clear(FollowingTrail *trail) {
    trail->head = trail->count = 0;
    trail->distance = 0;
}

void Following_Init(Follower *follower, u32 generation) {
    u32 i;

    follower->state = FOLLOWING_STATE_ABSENT;
    follower->actor = NULL;
    follower->generation = generation;
    follower->slot = -1;
    follower->hasSelection = FALSE;
    follower->sideGap = 0;
    for (i = 0; i < FOLLOWING_REASON_COUNT; i++) {
        follower->suppression[i] = 0;
    }
    FollowingTrail_Clear(&follower->trail);
}

BOOL Following_IsSuppressed(const Follower *follower) {
    u32 i;

    for (i = 0; i < FOLLOWING_REASON_COUNT; i++) {
        if (follower->suppression[i] != 0) {
            return TRUE;
        }
    }
    return FALSE;
}

void Following_Enter(Follower *follower, FollowingReason reason) {
    if ((u32)reason >= FOLLOWING_REASON_COUNT) {
        return;
    }
    // A count at 255 stays there, rather than wrapping round to a release that isn't safe
    if (follower->suppression[reason] < 255) {
        follower->suppression[reason]++;
    }
    follower->state = FOLLOWING_STATE_SUPPRESSED;
    FollowingTrail_Clear(&follower->trail);
}

void Following_Leave(Follower *follower, FollowingReason reason) {
    if ((u32)reason >= FOLLOWING_REASON_COUNT) {
        return;
    }
    if (follower->suppression[reason] != 0 && follower->suppression[reason] != 255) {
        follower->suppression[reason]--;
    }
    if (!Following_IsSuppressed(follower) && follower->state == FOLLOWING_STATE_SUPPRESSED) {
        follower->state = FOLLOWING_STATE_WAITING;
    }
}

BOOL Following_StartInteraction(Follower *follower) {
    if (follower->state != FOLLOWING_STATE_FOLLOWING || Following_IsSuppressed(follower) || follower->actor == NULL) {
        return FALSE;
    }
    follower->state = FOLLOWING_STATE_INTERACTING;
    return TRUE;
}

void Following_EndInteraction(Follower *follower) {
    if (follower->state == FOLLOWING_STATE_INTERACTING) {
        follower->state = Following_IsSuppressed(follower) ? FOLLOWING_STATE_SUPPRESSED : FOLLOWING_STATE_FOLLOWING;
    }
}

// The distance between two coordinates, or three tiles for any more than two
static u32 AbsDelta(s32 a, s32 b) {
    s64 d = (s64)a - b;

    if (d > FOLLOWING_TILE * 2 || d < -FOLLOWING_TILE * 2) {
        return FOLLOWING_TILE * 3;
    }
    return d < 0 ? -d : d;
}

static u32 SquareRoot(u64 n) {
    u64 bit = (u64)1 << 62;
    u64 result = 0;

    while (bit > n) {
        bit >>= 2;
    }
    while (bit != 0) {
        if (n >= result + bit) {
            n -= result + bit;
            result = (result >> 1) + bit;
        } else {
            result >>= 1;
        }
        bit >>= 2;
    }
    return result;
}

static u32 Distance(const FollowingSample *a, const FollowingSample *b) {
    u32 x = AbsDelta(a->x, b->x);
    u32 z = AbsDelta(a->z, b->z);

    return SquareRoot((u64)x * x + (u64)z * z);
}

// The trail's metric, one for each appearance: a tile is 16 + gap units across and 16 down. Corners follow the
// recorded poses instead of changing the distance to keep at once, and whole-number weights keep the spacing exact
// along the axes with no more history
static u32 TrailDistance(const FollowingSample *a, const FollowingSample *b, const u8 *gaps) {
    u32 gx = b->x < a->x ? gaps[2] : gaps[3];
    u32 gz = b->z < a->z ? gaps[0] : gaps[1];
    u32 rawX = AbsDelta(a->x, b->x);
    u32 rawZ = AbsDelta(a->z, b->z);
    u32 x = (rawX * 16u + 15u + gx) / (16u + gx);
    u32 z = (rawZ * 16u + 15u + gz) / (16u + gz);

    return SquareRoot((u64)x * x + (u64)z * z);
}

BOOL Following_ClampDialoguePose(VecFx32 *pose, const VecFx32 *player, const VecFx32 *artOffset, u32 face, u32 gap) {
    VecFx32 offset;
    s64 along;
    s64 lateral;
    s64 artAlong;
    s64 artLateral;
    s64 height;
    s64 limit;
    s64 farthest;
    s64 shift;
    s64 value;

    if (pose == NULL || player == NULL || face > 3 || gap > FOLLOWING_MAX_DIRECTIONAL_GAP) {
        return FALSE;
    }
    if (artOffset != NULL) {
        offset = *artOffset;
    } else {
        VEC_Set(&offset, 0, 0, 0);
    }
    along = face == 0   ? (s64)player->z - pose->z
            : face == 1 ? (s64)pose->z - player->z
            : face == 2 ? (s64)player->x - pose->x
                        : (s64)pose->x - player->x;
    lateral = face < 2 ? (s64)pose->x - player->x : (s64)pose->z - player->z;
    artAlong = along + (face == 0 ? -(s64)offset.z : face == 1 ? offset.z : face == 2 ? -(s64)offset.x : offset.x);
    artLateral = lateral + (face < 2 ? offset.x : offset.z);
    height = (s64)pose->y - player->y;
    limit = FOLLOWING_DIALOGUE_REACH(gap);
    // A part of a step and the sprite's draw offset can put the actor just out of reach. This corrects half a tile
    // at most, within the same two-tile corridor, and never pulls an actor that is far off, or off to the side, across
    // a turn, a wall, a stair or a break in the trail to make it talkable
    farthest = along > artAlong ? along : artAlong;
    if (farthest <= limit || along > 2 * (s64)FOLLOWING_TILE + (s64)FOLLOWING_GAP_BEYOND(gap) * FX32_ONE ||
        along > limit + 8 * FX32_ONE || farthest > limit + 16 * FX32_ONE || lateral < -(s64)FOLLOWING_TILE / 3 ||
        lateral > (s64)FOLLOWING_TILE / 3 || artLateral < -(s64)FOLLOWING_TILE / 3 ||
        artLateral > (s64)FOLLOWING_TILE / 3 || height < -8 * FX32_ONE || height > 8 * FX32_ONE) {
        return FALSE;
    }
    shift = farthest - limit;
    value = face == 0   ? (s64)pose->z + shift
            : face == 1 ? (s64)pose->z - shift
            : face == 2 ? (s64)pose->x + shift
                        : (s64)pose->x - shift;
    if (value < LONG_MIN || value > LONG_MAX) {
        return FALSE;
    }
    if (face < 2) {
        pose->z = (s32)value;
    } else {
        pose->x = (s32)value;
    }
    return TRUE;
}

static u32 IndexAt(const FollowingTrail *trail, u32 at) {
    return (trail->head + at) % FOLLOWING_TRAIL_CAPACITY;
}

// (delta * over) / span, by a 64-bit long division a bit at a time, the quotient saturating
static s32 ScaleStep(s32 delta, u32 over, u32 span) {
    BOOL negative;
    u64 n;
    u64 q;
    u64 r;
    u32 bit;

    if (span == 0 || over == 0 || delta == 0) {
        return 0;
    }
    negative = delta < 0;
    n = (negative ? (u64)(-(s64)delta) : (u64)delta) * over;
    q = 0;
    r = 0;
    for (bit = 0; bit < 64; bit++) {
        r = (r << 1) | (n >> 63);
        n <<= 1;
        q <<= 1;
        if (r >= span) {
            r -= span;
            q |= 1;
        }
    }
    if (q > LONG_MAX) {
        q = LONG_MAX;
    }
    return negative ? -(s32)q : (s32)q;
}

BOOL FollowingTrail_Translate(FollowingTrail *trail, fx32 dx, fx32 dy, fx32 dz) {
    FollowingSample *sample;
    s64 x;
    s64 y;
    s64 z;
    u32 i;

    if (trail == NULL) {
        return FALSE;
    }
    if (trail->count == 0 || (dx == 0 && dy == 0 && dz == 0)) {
        return TRUE;
    }
    for (i = 0; i < trail->count; i++) {
        sample = &trail->samples[IndexAt(trail, i)];
        x = (s64)sample->x + dx;
        y = (s64)sample->y + dy;
        z = (s64)sample->z + dz;
        if (x < LONG_MIN || x > LONG_MAX || y < LONG_MIN || y > LONG_MAX || z < LONG_MIN || z > LONG_MAX) {
            FollowingTrail_Clear(trail);
            return FALSE;
        }
    }
    for (i = 0; i < trail->count; i++) {
        sample = &trail->samples[IndexAt(trail, i)];
        sample->x += dx;
        sample->y += dy;
        sample->z += dz;
    }
    return TRUE;
}

static u32 Span(const FollowingSample *a, const FollowingSample *b) {
    u64 x = AbsDelta(a->x, b->x);
    u64 z = AbsDelta(a->z, b->z);

    return SquareRoot(x * x + z * z);
}

// HeartGold and SoulSilver's side-by-side stand, read from the facings that the trail recorded (the player's: a
// compass on a grid, the line's frame on a rail). Walking back from the newest sample, on the player's tile: one step
// facing 2 or 3 (left or right, or +front or -front) to the corner, whose sample faces 1 (down, or -side). Behind
// the corner, samples facing 1 for a tile or to the trail's end, at least one of them away from it. A grid step is
// exactly a tile on one axis, and a rail step is a knot, half a tile to a tile and a half
BOOL FollowingTrail_FindSideCorner(const FollowingTrail *trail, BOOL rail, VecFx32 *corner) {
    const FollowingSample *player;
    const FollowingSample *cornerSample;
    const FollowingSample *sample;
    s32 i;
    u32 dx;
    u32 dz;
    u32 side;
    u32 back;
    BOOL up;

    if (trail == NULL || corner == NULL || trail->count < 3) {
        return FALSE;
    }
    player = &trail->samples[IndexAt(trail, trail->count - 1)];
    cornerSample = NULL;
    if (player->direction != 2 && player->direction != 3) {
        return FALSE;
    }
    for (i = trail->count - 2; i >= 0; i--) {
        sample = &trail->samples[IndexAt(trail, i)];
        if (sample->direction == 1) {
            cornerSample = sample;
            break;
        }
        if (sample->direction != player->direction) {
            return FALSE;
        }
    }
    if (cornerSample == NULL) {
        return FALSE;
    }
    dx = AbsDelta(cornerSample->x, player->x);
    dz = AbsDelta(cornerSample->z, player->z);
    side = Span(cornerSample, player);
    if (!rail && !((dx == FOLLOWING_TILE && dz == 0) || (dz == FOLLOWING_TILE && dx == 0))) {
        return FALSE;
    }
    if (rail && (side < FOLLOWING_TILE / 2 || side > FOLLOWING_TILE + FOLLOWING_TILE / 2)) {
        return FALSE;
    }
    up = FALSE;
    for (i--; i >= 0; i--) {
        sample = &trail->samples[IndexAt(trail, i)];
        back = Span(cornerSample, sample);
        if (back >= FOLLOWING_TILE) {
            up = TRUE;
            break;
        }
        if (sample->direction != 1) {
            return FALSE;
        }
        if (back != 0) {
            up = TRUE;
        }
    }
    if (!up) {
        return FALSE;
    }
    corner->x = cornerSample->x;
    corner->y = cornerSample->y;
    corner->z = cornerSample->z;
    return TRUE;
}

// A push adds its step's distance under the gaps of that push, and trimming subtracts under the current ones, so after
// a change of gaps the sum is taken again to keep the two in step: a stale sum could wrap below zero on the next trim
void FollowingTrail_Remeasure(FollowingTrail *trail, const u8 *gaps) {
    u32 total;
    u32 i;

    if (trail == NULL || gaps == NULL || trail->count == 0) {
        return;
    }
    total = 0;
    for (i = 1; i < trail->count; i++) {
        total += TrailDistance(&trail->samples[IndexAt(trail, i - 1)], &trail->samples[IndexAt(trail, i)], gaps);
    }
    trail->distance = total;
}

s32 FollowingTrail_PushDirectional(FollowingTrail *trail, const FollowingSample *sample, FollowingSample *follower,
                                   const u8 *gaps) {
    const FollowingSample *last;
    const FollowingSample *older;
    const FollowingSample *next;
    u32 delta;
    BOOL disconnected;
    u32 step;
    u32 span;
    u32 over;

    if (gaps == NULL || gaps[0] > FOLLOWING_MAX_DIRECTIONAL_GAP || gaps[1] > FOLLOWING_MAX_DIRECTIONAL_GAP ||
        gaps[2] > FOLLOWING_MAX_DIRECTIONAL_GAP || gaps[3] > FOLLOWING_MAX_DIRECTIONAL_GAP || sample == NULL ||
        follower == NULL || sample->kind > FOLLOWING_MOVEMENT_WORLD || sample->direction > 3 ||
        sample->generation == 0) {
        FollowingTrail_Clear(trail);
        return -1;
    }
    if (trail->count == 0) {
        trail->samples[0] = *sample;
        trail->head = 0;
        trail->count = 1;
        return 0;
    }
    last = &trail->samples[IndexAt(trail, trail->count - 1)];
    delta = Distance(last, sample);
    disconnected = last->generation != sample->generation || last->space != sample->space || delta > FOLLOWING_TILE ||
                   AbsDelta(last->y, sample->y) > FOLLOWING_TILE * 2;
    if (last->kind == FOLLOWING_MOVEMENT_RAIL && sample->kind == FOLLOWING_MOVEMENT_RAIL &&
        last->rail != sample->rail && (last->connection == 0xffff || last->connection != sample->connection)) {
        disconnected = TRUE;
    }
    if (disconnected || trail->count == FOLLOWING_TRAIL_CAPACITY) {
        FollowingTrail_Clear(trail);
        return -1;
    }
    // Turning on the spot doesn't use up the history
    if (delta == 0 && last->y == sample->y) {
        return 0;
    }
    trail->samples[IndexAt(trail, trail->count++)] = *sample;
    trail->distance += TrailDistance(last, sample, gaps);
    if (trail->distance < FOLLOWING_TILE) {
        return 0;
    }
    while (trail->count > 1) {
        older = &trail->samples[trail->head];
        next = &trail->samples[IndexAt(trail, 1)];
        step = TrailDistance(older, next, gaps);
        if (trail->distance - step < FOLLOWING_TILE) {
            break;
        }
        trail->distance -= step;
        trail->head = (trail->head + 1) % FOLLOWING_TRAIL_CAPACITY;
        trail->count--;
    }
    // Standing on the older sample would lag up to a whole step behind: a run step is long enough to rest out of
    // reach of dialogue, and the next walking step then drops that sample and the follower jumps forward. The point
    // over along this step is exactly a tile of the trail's metric
    *follower = trail->samples[trail->head];
    if (trail->count > 1 && trail->distance > FOLLOWING_TILE) {
        next = &trail->samples[IndexAt(trail, 1)];
        span = TrailDistance(&trail->samples[trail->head], next, gaps);
        over = trail->distance - FOLLOWING_TILE;
        if (span != 0 && over != 0) {
            if (over > span) {
                over = span;
            }
            follower->x += ScaleStep(next->x - follower->x, over, span);
            follower->y += ScaleStep(next->y - follower->y, over, span);
            follower->z += ScaleStep(next->z - follower->z, over, span);
        }
    }
    return 1;
}

s32 FollowingTrail_Push(FollowingTrail *trail, const FollowingSample *sample, FollowingSample *follower, u32 sideGap) {
    u8 gaps[4];

    if (sideGap > FOLLOWING_MAX_SIDE_GAP) {
        FollowingTrail_Clear(trail);
        return -1;
    }
    gaps[0] = 0;
    gaps[1] = 0;
    gaps[2] = sideGap;
    gaps[3] = sideGap;
    return FollowingTrail_PushDirectional(trail, sample, follower, gaps);
}

s32 Following_Tile(fx32 coord) {
    s32 tile = coord / FOLLOWING_TILE;

    if (coord % FOLLOWING_TILE < 0) {
        tile -= 1;
    }
    return tile;
}

// (delta * num) / den, the signs applied after an unsigned long division
static s32 MulDiv(s32 delta, s32 num, s32 den) {
    BOOL negative;
    u64 absDelta;
    u64 absNum;
    u32 span;
    u64 n;
    u64 q;
    u64 r;
    u32 bit;

    if (den == 0 || num == 0 || delta == 0) {
        return 0;
    }
    negative = (delta < 0) ^ (num < 0) ^ (den < 0);
    absDelta = delta < 0 ? (u64) - (s64)delta : (u64)delta;
    absNum = num < 0 ? (u64) - (s64)num : (u64)num;
    span = den < 0 ? (u32) - (s64)den : (u32)den;
    n = absDelta * absNum;
    q = 0;
    r = 0;
    for (bit = 0; bit < 64; bit++) {
        r = (r << 1) | (n >> 63);
        n <<= 1;
        q <<= 1;
        if (r >= span) {
            r -= span;
            q |= 1;
        }
    }
    if (q > LONG_MAX) {
        q = LONG_MAX;
    }
    return negative ? -(s32)q : (s32)q;
}

static const FollowingSample *TrailSample(const FollowingTrail *trail, u32 at) {
    return &trail->samples[(trail->head + at) % FOLLOWING_TRAIL_CAPACITY];
}

// TRUE when the first tile ahead of the follower, walking the recorded route toward the player, is origin. A head
// sample still on the tile before counts when the trail then ends on origin
static BOOL IsAheadOrigin(const FollowingTrail *trail, const VecFx32 *follower, const VecFx32 *origin) {
    const FollowingSample *sample;
    const FollowingSample *head;
    const FollowingSample *last;
    s32 fx;
    s32 fz;
    s32 ox;
    s32 oz;
    s32 tx;
    s32 tz;
    s32 hx;
    s32 hz;
    BOOL seen;
    u32 i;

    if (trail == NULL || trail->count < 2) {
        return FALSE;
    }
    fx = Following_Tile(follower->x);
    fz = Following_Tile(follower->z);
    ox = Following_Tile(origin->x);
    oz = Following_Tile(origin->z);
    seen = FALSE;
    for (i = 0; i < trail->count; i++) {
        sample = TrailSample(trail, i);
        tx = Following_Tile(sample->x);
        tz = Following_Tile(sample->z);
        if (tx == fx && tz == fz) {
            seen = TRUE;
            continue;
        }
        if (seen) {
            return tx == ox && tz == oz;
        }
    }
    if (seen) {
        return FALSE;
    }
    head = TrailSample(trail, 0);
    last = TrailSample(trail, trail->count - 1);
    if (Following_Tile(last->x) != ox || Following_Tile(last->z) != oz) {
        return FALSE;
    }
    hx = Following_Tile(head->x);
    hz = Following_Tile(head->z);
    for (i = 1; i < trail->count; i++) {
        sample = TrailSample(trail, i);
        tx = Following_Tile(sample->x);
        tz = Following_Tile(sample->z);
        if (tx != hx || tz != hz) {
            return tx == ox && tz == oz;
        }
    }
    return FALSE;
}

BOOL Following_SwapMatch(const FollowingTrail *trail, const VecFx32 *follower, const VecFx32 *origin, u32 face) {
    s64 dy;
    s32 tx;
    s32 tz;
    BOOL cardinal;

    if (trail == NULL || follower == NULL || origin == NULL || face > 3) {
        return FALSE;
    }
    dy = (s64)follower->y - origin->y;
    if (dy > 2 * (s64)FOLLOWING_TILE || dy < -2 * (s64)FOLLOWING_TILE) {
        return FALSE;
    }
    tx = Following_Tile(follower->x) - Following_Tile(origin->x);
    tz = Following_Tile(follower->z) - Following_Tile(origin->z);
    cardinal = (face == 0 && tx == 0 && tz == -1) || (face == 1 && tx == 0 && tz == 1) ||
               (face == 2 && tx == -1 && tz == 0) || (face == 3 && tx == 1 && tz == 0);
    return cardinal && IsAheadOrigin(trail, follower, origin);
}

// n / d, by a 64-bit long division a bit at a time, the quotient saturating
static s32 DivS64(s64 n, u32 d) {
    BOOL negative;
    u64 u;
    u64 q;
    u64 r;
    u32 bit;

    if (d == 0 || n == 0 || n == LLONG_MIN) {
        return 0;
    }
    negative = n < 0;
    u = negative ? (u64)(-n) : (u64)n;
    q = 0;
    r = 0;
    for (bit = 0; bit < 64; bit++) {
        r = (r << 1) | (u >> 63);
        u <<= 1;
        q <<= 1;
        if (r >= d) {
            r -= d;
            q |= 1;
        }
    }
    if (q > LONG_MAX) {
        q = LONG_MAX;
    }
    return negative ? -(s32)q : (s32)q;
}

static u32 SegmentSpan(s64 dx, s64 dz) {
    s64 ax = dx < 0 ? -dx : dx;
    s64 az = dz < 0 ? -dz : dz;

    return SquareRoot((u64)ax * (u64)ax + (u64)az * (u64)az);
}

// The height of reseed step i of units, (units - i) units behind the player: the slope dy over span (the player's
// point less the follower's) carried back from the player. A follower on the player's point has no slope, and keeps
// the blend from fromY instead
static s32 SlopeY(s32 playerY, s32 dy, u32 span, s32 fromY, s32 i, s32 units) {
    s64 y;

    if (span < FX32_ONE || span > (u32)LONG_MAX) {
        return fromY + MulDiv(dy, i, units);
    }
    y = (s64)playerY - MulDiv(dy, (units - i) * FX32_ONE, (s32)span);
    return y > LONG_MAX ? LONG_MAX : y < LONG_MIN ? LONG_MIN : (s32)y;
}

static BOOL IsNearSample(const FollowingSample *sample, const VecFx32 *point, s32 tolerance) {
    s32 dx = sample->x - point->x;
    s32 dz = sample->z - point->z;

    if (dx < 0) {
        dx = -dx;
    }
    if (dz < 0) {
        dz = -dz;
    }
    return dx <= tolerance && dz <= tolerance;
}

u32 Following_SwapFace(u32 playerFace, BOOL moving) {
    if (playerFace > 3) {
        return 0;
    }
    return moving ? playerFace ^ 1u : playerFace;
}

u32 Following_RailFaceAt(s32 relX, s32 relZ, s32 frontX, s32 frontZ, s32 sideX, s32 sideZ) {
    u32 spanFront = SegmentSpan(frontX, frontZ);
    u32 spanSide = SegmentSpan(sideX, sideZ);
    BOOL useFront = spanFront >= 256u;
    BOOL useSide = spanSide >= 256u;
    s32 projFront;
    s32 projSide;
    s32 absFront;
    s32 absSide;

    if (!useFront && !useSide) {
        return 4;
    }
    projFront = useFront ? DivS64((s64)relX * frontX + (s64)relZ * frontZ, spanFront) : 0;
    projSide = useSide ? DivS64((s64)relX * sideX + (s64)relZ * sideZ, spanSide) : 0;
    absFront = projFront < 0 ? -projFront : projFront;
    absSide = projSide < 0 ? -projSide : projSide;
    if (!useSide || (useFront && absFront >= absSide)) {
        return projFront >= 0 ? 2 : 3;
    }
    return projSide >= 0 ? 0 : 1;
}

u32 Following_RailSwapTurn(u32 playerFace, s32 chordX, s32 chordZ) {
    // The follower is put back on the player's line, so a knot behind them needs no facing of its own. A compass read
    // from the chord would agree with this only while the line is along an axis
    (void)chordX;
    (void)chordZ;
    return playerFace > 3 ? 0 : playerFace;
}

BOOL Following_RailSwapMatch(const FollowingTrail *trail, const VecFx32 *follower, const VecFx32 *origin) {
    const FollowingSample *sample;
    s64 dy;
    u32 span;
    BOOL seen;
    u32 i;

    if (trail == NULL || follower == NULL || origin == NULL || trail->count < 2) {
        return FALSE;
    }
    dy = (s64)follower->y - origin->y;
    if (dy > 2 * (s64)FOLLOWING_TILE || dy < -2 * (s64)FOLLOWING_TILE) {
        return FALSE;
    }
    span = SegmentSpan((s64)follower->x - origin->x, (s64)follower->z - origin->z);
    if (span < FX32_ONE || span > 8u * (u32)FOLLOWING_TILE) {
        return FALSE;
    }
    seen = FALSE;
    for (i = 0; i < trail->count; i++) {
        sample = TrailSample(trail, i);
        if (!seen) {
            if (IsNearSample(sample, follower, FOLLOWING_TILE)) {
                seen = TRUE;
            }
            continue;
        }
        if (IsNearSample(sample, origin, 2 * FX32_ONE)) {
            return TRUE;
        }
    }
    return FALSE;
}

s32 Following_RailSwapMirror(const VecFx32 *follower, const VecFx32 *origin, const VecFx32 *player, VecFx32 *out,
                             BOOL stepSettled) {
    s64 sx;
    s64 sy;
    s64 sz;
    s64 mx;
    s64 my;
    s64 mz;
    u32 span;
    s32 proj;
    s64 lateral2;
    s32 tolerance;
    u32 pace;
    s32 walked;
    BOOL passed;
    BOOL done;

    if (follower == NULL || origin == NULL || player == NULL || out == NULL) {
        return -1;
    }
    *out = *follower;
    sx = (s64)follower->x - origin->x;
    sz = (s64)follower->z - origin->z;
    sy = (s64)follower->y - origin->y;
    if (sy > 2 * (s64)FOLLOWING_TILE || sy < -2 * (s64)FOLLOWING_TILE) {
        return -1;
    }
    span = SegmentSpan(sx, sz);
    if (span < FX32_ONE || span > 8u * (u32)FOLLOWING_TILE) {
        return -1;
    }
    mx = (s64)player->x - origin->x;
    mz = (s64)player->z - origin->z;
    my = (s64)player->y - origin->y;
    if (my > 2 * (s64)FOLLOWING_TILE || my < -2 * (s64)FOLLOWING_TILE) {
        return -1;
    }
    proj = DivS64(mx * sx + mz * sz, span);
    // A step away from the follower isn't on this segment. A step forward of one unit is a real walk, not slack, and
    // doesn't start a swap
    if (proj < 0) {
        return -1;
    }
    lateral2 = mx * mx + mz * mz - (s64)proj * proj;
    tolerance = FOLLOWING_TILE / 4;
    if (lateral2 > (s64)tolerance * tolerance) {
        return -1;
    }
    // The follower walks back to the origin while the player walks to it, at the player's pace. Past the longest
    // authored gap (the 64-pixel bonus) they would only pass halfway along, after a one-tile knot has already ended,
    // so the follower reaches the origin in one tile instead
    pace = span > (u32)FOLLOWING_TILE + FOLLOWING_MAX_AUTHORED_GAP * FX32_ONE ? (u32)FOLLOWING_TILE : span;
    walked = proj >= (s32)pace ? (s32)span : DivS64((s64)proj * span, pace);
    // A knot often ends before the follow gap. A step that has stopped while still moving toward the follower is, on a
    // rail, arriving on its tile, once the two have passed. A knot that stops short of that keeps the swap open: the
    // reseed and its ease start behind the player, and a follower still in front of them would snap back to the rest
    passed = proj >= (s32)span - walked;
    done = proj >= (s32)span || (stepSettled && proj >= FX32_ONE && passed);
    out->x = follower->x + DivS64(((s64)origin->x - follower->x) * walked, span);
    out->y = follower->y + DivS64(((s64)origin->y - follower->y) * walked, span);
    out->z = follower->z + DivS64(((s64)origin->z - follower->z) * walked, span);
    return done;
}

u32 Following_DisplayForm(u32 species, u32 form) {
    u32 i;

    for (i = 0; i < NELEMS(sForcedForms); i++) {
        if (sForcedForms[i].species == species) {
            return sForcedForms[i].form;
        }
    }
    return form;
}

BOOL Following_RailSegmentReach(const VecFx32 *player, const VecFx32 *follower, const VecFx32 *forward, u32 gap) {
    s64 dy;
    s64 sx;
    s64 sz;
    s64 mx;
    s64 mz;
    u32 span;
    s32 proj;
    s32 slack;
    s64 lateral2;
    s32 tolerance;

    if (player == NULL || follower == NULL || forward == NULL || gap > FOLLOWING_MAX_DIRECTIONAL_GAP) {
        return FALSE;
    }
    dy = (s64)follower->y - player->y;
    if (dy > 8 * FX32_ONE || dy < -8 * FX32_ONE) {
        return FALSE;
    }
    sx = (s64)forward->x - player->x;
    sz = (s64)forward->z - player->z;
    span = SegmentSpan(sx, sz);
    if (span < FX32_ONE || span > 8u * (u32)FOLLOWING_TILE) {
        return FALSE;
    }
    mx = (s64)follower->x - player->x;
    mz = (s64)follower->z - player->z;
    proj = DivS64(mx * sx + mz * sz, span);
    slack = (s32)span / 8 + (s32)gap * (s32)span / 16;
    if (proj < (s32)span / 2 || proj > (s32)span + slack) {
        return FALSE;
    }
    lateral2 = mx * mx + mz * mz - (s64)proj * proj;
    tolerance = FOLLOWING_TILE / 2;
    return lateral2 <= (s64)tolerance * tolerance;
}

s32 Following_SwapMirror(const VecFx32 *follower, const VecFx32 *origin, const VecFx32 *player, VecFx32 *out) {
    s64 dx;
    s64 dz;
    s64 ax;
    s64 az;
    s64 span;
    s64 rx;
    s64 ry;
    s64 rz;
    s64 py;
    BOOL alongX;
    s64 moved;
    s64 lateral;
    s64 clamped;

    if (follower == NULL || origin == NULL || player == NULL || out == NULL) {
        return -1;
    }
    *out = *follower;
    dx = (s64)follower->x - origin->x;
    dz = (s64)follower->z - origin->z;
    ax = dx < 0 ? -dx : dx;
    az = dz < 0 ? -dz : dz;
    span = ax >= az ? dx : dz;
    if (span == 0 || span > LONG_MAX || span <= LONG_MIN) {
        return -1;
    }
    rx = (s64)origin->x - follower->x;
    ry = (s64)origin->y - follower->y;
    rz = (s64)origin->z - follower->z;
    if (rx > LONG_MAX || rx < LONG_MIN || ry > LONG_MAX || ry < LONG_MIN || rz > LONG_MAX || rz < LONG_MIN) {
        return -1;
    }
    py = (s64)player->y - origin->y;
    if (py > 2 * (s64)FOLLOWING_TILE || py < -2 * (s64)FOLLOWING_TILE) {
        return -1;
    }
    alongX = ax >= az;
    moved = alongX ? (s64)player->x - origin->x : (s64)player->z - origin->z;
    lateral = alongX ? (s64)player->z - origin->z : (s64)player->x - origin->x;
    if (lateral > FX32_ONE || lateral < -FX32_ONE) {
        return -1;
    }
    if ((span > 0 && moved < 0) || (span < 0 && moved > 0)) {
        return -1;
    }
    clamped = moved;
    if (span > 0) {
        if (clamped > span) {
            clamped = span;
        }
    } else if (clamped < span) {
        clamped = span;
    }
    out->x = follower->x + MulDiv((s32)rx, (s32)clamped, (s32)span);
    out->y = follower->y + MulDiv((s32)ry, (s32)clamped, (s32)span);
    out->z = follower->z + MulDiv((s32)rz, (s32)clamped, (s32)span);
    return clamped == span;
}

BOOL FollowingTrail_HeightAt(const FollowingTrail *trail, fx32 x, fx32 z, fx32 *y) {
    const FollowingSample *a;
    const FollowingSample *b;
    s32 tolerance;
    u64 bestLateral;
    s32 bestY;
    BOOL found;
    s64 sx;
    s64 sz;
    s64 mx;
    s64 mz;
    s64 lateral2;
    s64 dy;
    u32 span;
    s32 proj;
    u32 i;

    // The chord from the follower to the origin it settles on cuts through a stair's riser: too low onto the upper
    // tread, too high onto the lower one. The samples are the heights the player already walked, and on flat ground
    // they agree with the chord
    if (trail == NULL || y == NULL || trail->count < 2) {
        return FALSE;
    }
    tolerance = FOLLOWING_TILE / 4;
    bestLateral = ~(u64)0;
    bestY = 0;
    found = FALSE;
    for (i = 0; i + 1 < trail->count; i++) {
        a = TrailSample(trail, i);
        b = TrailSample(trail, i + 1);
        sx = (s64)b->x - a->x;
        sz = (s64)b->z - a->z;
        span = SegmentSpan(sx, sz);
        if (span == 0) {
            continue;
        }
        mx = (s64)x - a->x;
        mz = (s64)z - a->z;
        proj = DivS64(mx * sx + mz * sz, span);
        if (proj < 0 || (u32)proj > span) {
            continue;
        }
        lateral2 = mx * mx + mz * mz - (s64)proj * proj;
        if (lateral2 < 0) {
            lateral2 = 0;
        }
        if (lateral2 > (s64)tolerance * tolerance) {
            continue;
        }
        if (found && (u64)lateral2 > bestLateral) {
            continue;
        }
        dy = (s64)b->y - a->y;
        if (dy > LONG_MAX || dy < LONG_MIN) {
            continue;
        }
        bestY = a->y + ScaleStep((s32)dy, (u32)proj, span);
        bestLateral = lateral2;
        found = TRUE;
    }
    if (!found) {
        return FALSE;
    }
    *y = bestY;
    return TRUE;
}

static BOOL AreGapsValid(const u8 *gaps) {
    return gaps != NULL && gaps[0] <= FOLLOWING_MAX_DIRECTIONAL_GAP && gaps[1] <= FOLLOWING_MAX_DIRECTIONAL_GAP &&
           gaps[2] <= FOLLOWING_MAX_DIRECTIONAL_GAP && gaps[3] <= FOLLOWING_MAX_DIRECTIONAL_GAP;
}

// The unit steps of a reseed: twelve past the largest metric tile (16 + 20 at the 64-pixel bonus) and within the
// trail's 64 samples. Steps of one unit are what a walked load gives
#define RESEED_UNITS (16 + FOLLOWING_MAX_DIRECTIONAL_GAP + 12)

BOOL FollowingTrail_Reseed(FollowingTrail *trail, const FollowingSample *follower, const FollowingSample *player,
                           const u8 *gaps, FollowingSample *out) {
    FollowingSample step;
    s64 dy64;
    s32 dy;
    s64 back;
    s32 x;
    s32 z;
    s32 dx;
    s32 dz;
    u32 span;
    s32 ready;
    s32 i;

    if (trail == NULL || follower == NULL || player == NULL || gaps == NULL || out == NULL || player->direction > 3 ||
        player->generation == 0) {
        return FALSE;
    }
    if (gaps[0] > FOLLOWING_MAX_DIRECTIONAL_GAP || gaps[1] > FOLLOWING_MAX_DIRECTIONAL_GAP ||
        gaps[2] > FOLLOWING_MAX_DIRECTIONAL_GAP || gaps[3] > FOLLOWING_MAX_DIRECTIONAL_GAP) {
        return FALSE;
    }
    dy64 = (s64)player->y - follower->y;
    if (dy64 > LONG_MAX || dy64 < LONG_MIN) {
        return FALSE;
    }
    dy = (s32)dy64;
    back = (s64)RESEED_UNITS * FX32_ONE;
    x = player->x;
    z = player->z;
    dx = 0;
    dz = 0;
    if (player->direction == 0) {
        if ((s64)z + back > LONG_MAX) {
            return FALSE;
        }
        z += (s32)back;
        dz = -FX32_ONE;
    } else if (player->direction == 1) {
        if ((s64)z - back < LONG_MIN) {
            return FALSE;
        }
        z -= (s32)back;
        dz = FX32_ONE;
    } else if (player->direction == 2) {
        if ((s64)x + back > LONG_MAX) {
            return FALSE;
        }
        x += (s32)back;
        dx = -FX32_ONE;
    } else {
        if ((s64)x - back < LONG_MIN) {
            return FALSE;
        }
        x -= (s32)back;
        dx = FX32_ONE;
    }
    // The heights keep the slope between the follower and the player, so the follower's own point stands at its own
    // height on a slope
    span = SegmentSpan((s64)player->x - follower->x, (s64)player->z - follower->z);
    FollowingTrail_Clear(trail);
    ready = 0;
    for (i = 0; i <= RESEED_UNITS; i++) {
        step = *player;
        step.x = x + dx * i;
        step.z = z + dz * i;
        step.y = SlopeY(player->y, dy, span, follower->y, i, RESEED_UNITS);
        step.direction = player->direction;
        ready = FollowingTrail_PushDirectional(trail, &step, out, gaps);
        if (ready < 0) {
            return FALSE;
        }
    }
    return ready == 1;
}

BOOL FollowingTrail_ReseedAlong(FollowingTrail *trail, const FollowingSample *from, const FollowingSample *player,
                                const u8 *gaps, FollowingSample *out) {
    FollowingSample step;
    s64 dy64;
    s64 dx;
    s64 dz;
    u32 span;
    s64 back;
    s32 ox;
    s32 oz;
    s64 fx;
    s64 fz;
    s32 dy;
    s32 ready;
    s32 i;

    // The same history as FollowingTrail_Reseed's, walked along the chord the player travelled, since rail facings
    // aren't world axes
    if (trail == NULL || from == NULL || player == NULL || gaps == NULL || out == NULL || player->direction > 3 ||
        player->generation == 0) {
        return FALSE;
    }
    if (gaps[0] > FOLLOWING_MAX_DIRECTIONAL_GAP || gaps[1] > FOLLOWING_MAX_DIRECTIONAL_GAP ||
        gaps[2] > FOLLOWING_MAX_DIRECTIONAL_GAP || gaps[3] > FOLLOWING_MAX_DIRECTIONAL_GAP) {
        return FALSE;
    }
    dy64 = (s64)player->y - from->y;
    if (dy64 > LONG_MAX || dy64 < LONG_MIN) {
        return FALSE;
    }
    dx = (s64)player->x - from->x;
    dz = (s64)player->z - from->z;
    span = SegmentSpan(dx, dz);
    if (span < 256) {
        return FALSE;
    }
    back = (s64)RESEED_UNITS * FX32_ONE;
    ox = DivS64(dx * back, span);
    oz = DivS64(dz * back, span);
    fx = (s64)player->x - ox;
    fz = (s64)player->z - oz;
    if (fx < LONG_MIN || fx > LONG_MAX || fz < LONG_MIN || fz > LONG_MAX) {
        return FALSE;
    }
    dy = (s32)dy64;
    FollowingTrail_Clear(trail);
    ready = 0;
    for (i = 0; i <= RESEED_UNITS; i++) {
        step = *player;
        step.x = (s32)fx + MulDiv(ox, i, RESEED_UNITS);
        step.z = (s32)fz + MulDiv(oz, i, RESEED_UNITS);
        step.y = SlopeY(player->y, dy, span, from->y, i, RESEED_UNITS);
        step.direction = player->direction;
        ready = FollowingTrail_PushDirectional(trail, &step, out, gaps);
        if (ready < 0) {
            return FALSE;
        }
    }
    return ready == 1;
}

u32 Following_Travel(fx32 x0, fx32 z0, fx32 x1, fx32 z1) {
    return SegmentSpan((s64)x1 - x0, (s64)z1 - z0);
}

u32 Following_EaseSmoothstep(u32 traveled, u32 length) {
    s32 u;
    u32 u2;
    u32 three;
    u32 s;

    if (length == 0 || traveled >= length) {
        return 65536;
    }
    u = DivS64((s64)traveled << 16, length);
    if (u <= 0) {
        return 0;
    }
    if (u >= 65536) {
        return 65536;
    }
    u2 = ((u64)(u32)u * (u32)u) >> 16;
    three = 3u * 65536u - 2u * (u32)u;
    s = ((u64)u2 * three) >> 16;
    return s > 65536u ? 65536u : s;
}

u32 Following_EaseKeep(u32 traveled, u32 length, u32 closeKeep, u32 fullKeep) {
    u32 s;
    u32 span;
    u32 add;
    u32 keep;

    if (length == 0 || traveled >= length || closeKeep >= fullKeep) {
        return fullKeep;
    }
    s = Following_EaseSmoothstep(traveled, length);
    span = fullKeep - closeKeep;
    add = ((u64)span * s) >> 16;
    keep = closeKeep + add;
    return keep > fullKeep ? fullKeep : keep;
}

BOOL FollowingTrail_PoseBehind(const FollowingTrail *trail, const u8 *gaps, u32 keep, FollowingSample *out) {
    const FollowingSample *a;
    const FollowingSample *b;
    u32 remain;
    u32 span;
    u32 i;

    if (trail == NULL || out == NULL || !AreGapsValid(gaps) || trail->count == 0) {
        return FALSE;
    }
    if (trail->count == 1 || keep == 0) {
        *out = *TrailSample(trail, trail->count - 1);
        return TRUE;
    }
    if (keep >= trail->distance) {
        *out = *TrailSample(trail, 0);
        return TRUE;
    }
    // The metric distance from the oldest sample, which FollowingTrail_PushDirectional measures from too
    remain = trail->distance - keep;
    for (i = 0; i + 1 < trail->count; i++) {
        a = TrailSample(trail, i);
        b = TrailSample(trail, i + 1);
        span = TrailDistance(a, b, gaps);
        if (remain <= span || i + 2 == trail->count) {
            *out = *a;
            if (span != 0 && remain != 0) {
                if (remain > span) {
                    remain = span;
                }
                out->x += ScaleStep(b->x - out->x, remain, span);
                out->y += ScaleStep(b->y - out->y, remain, span);
                out->z += ScaleStep(b->z - out->z, remain, span);
            }
            return TRUE;
        }
        remain -= span;
    }
    *out = *TrailSample(trail, trail->count - 1);
    return TRUE;
}

u32 FollowingTrail_MetricToPoint(const FollowingTrail *trail, const u8 *gaps, fx32 x, fx32 z) {
    const FollowingSample *a;
    const FollowingSample *b;
    u32 back;
    s32 tolerance;
    u32 span;
    u32 world;
    s64 sx;
    s64 sz;
    s64 mx;
    s64 mz;
    s32 proj;
    s64 lateral2;
    u32 along;
    u32 keep;
    u32 n;

    if (trail == NULL || !AreGapsValid(gaps) || trail->count < 2) {
        return 0;
    }
    back = 0;
    tolerance = FOLLOWING_TILE / 2;
    for (n = trail->count - 1; n > 0; n--) {
        b = TrailSample(trail, n);
        a = TrailSample(trail, n - 1);
        span = TrailDistance(a, b, gaps);
        sx = (s64)a->x - b->x;
        sz = (s64)a->z - b->z;
        world = SegmentSpan(sx, sz);
        if (world != 0 && span != 0) {
            mx = (s64)x - b->x;
            mz = (s64)z - b->z;
            proj = DivS64(mx * sx + mz * sz, world);
            if (proj >= 0 && (u32)proj <= world) {
                lateral2 = mx * mx + mz * mz - (s64)proj * proj;
                if (lateral2 < 0) {
                    lateral2 = 0;
                }
                if (lateral2 <= (s64)tolerance * tolerance) {
                    along = DivS64((s64)span * proj, world);
                    if (along > span) {
                        along = span;
                    }
                    keep = back + along;
                    return keep > FOLLOWING_TILE ? FOLLOWING_TILE : keep;
                }
            }
        }
        back += span;
        if (back >= FOLLOWING_TILE) {
            return FOLLOWING_TILE;
        }
    }
    return 0;
}
