#ifndef PAPERWHITE2_FOLLOWING_H
#define PAPERWHITE2_FOLLOWING_H

#include "types.h"
#include "nitro/fx.h"
#include "struct_decls.h"

// Paper White 2: the Following Pokémon's follower, its trail behind the player and the choice of the party member that
// follows (src/paperwhite2/ov036/paperwhite2_following_trail.c), ported from Pokeweb's following.h
// (docs/paperwhite2/following-pokemon.md). Positions are the field's 20.12 world units, in which a tile is 16

// The samples the trail keeps, a little more than a tile's walk in unit steps
#define FOLLOWING_TRAIL_CAPACITY 64
#define FOLLOWING_PARTY_CAPACITY 6

// The first object code of a follower, and the count of the game's own rows of the model table before the followers'
#define FOLLOWING_CODE_BASE 0x3000
#define FOLLOWING_STOCK_ROWS 1008

// The highest species that can follow, and the most rows the registry can have
#define FOLLOWING_MAX_SPECIES 649
#define FOLLOWING_MAX_ROWS 4096

#define FOLLOWING_TILE (16 * FX32_ONE)

// The gaps between the follower and the player are in world units, about pixels at the field's ordinary camera. A
// registry row's side gap is at most 6, and the automatic gap adds up to 6 more
#define FOLLOWING_MAX_SIDE_GAP 6u
#define FOLLOWING_DEFAULT_SIDE_GAP_BONUS 6u
// The positioning table's rows and the automatic gap stay in 0 to 12
#define FOLLOWING_MAX_AUTHORED_GAP (FOLLOWING_MAX_SIDE_GAP + FOLLOWING_DEFAULT_SIDE_GAP_BONUS)
// A 64-pixel body is about twice an NPC's width, so its edge stands on the player at an authored gap: the follower's
// code adds this on every side
#define FOLLOWING_LARGE_GAP_BONUS 8u
#define FOLLOWING_MAX_DIRECTIONAL_GAP (FOLLOWING_MAX_AUTHORED_GAP + FOLLOWING_LARGE_GAP_BONUS)
// The units of a gap past the two-tile corridor that an authored gap fits in
#define FOLLOWING_GAP_BEYOND(gap) ((gap) > FOLLOWING_MAX_AUTHORED_GAP ? (gap) - FOLLOWING_MAX_AUTHORED_GAP : 0u)
// How far in front of the player the follower can be talked to, at a gap
#define FOLLOWING_DIALOGUE_REACH(gap) (FOLLOWING_TILE + ((gap) + 1u) * FX32_ONE)

// The distance the player travels while the gap after a swap eases from the close pose out to one tile of the trail's
// metric, the rest after a fresh load. A distance and not frames, so a run covers it in fewer steps than a walk
#define FOLLOWING_EASE_TRAVEL (2u * FOLLOWING_TILE)
// The smallest metric distance that ease starts from, less than a tile
#define FOLLOWING_EASE_START_KEEP (FOLLOWING_TILE * 5u / 8u)

typedef enum {
    FOLLOWING_STATE_ABSENT,
    FOLLOWING_STATE_WAITING,
    FOLLOWING_STATE_FOLLOWING,
    FOLLOWING_STATE_INTERACTING,
    FOLLOWING_STATE_SUPPRESSED,
    FOLLOWING_STATE_DESTROYING,
    FOLLOWING_STATE_EVENT_PAUSED,
} FollowingState;

// Why the follower is kept away: each reason counts how many times it was entered
typedef enum {
    FOLLOWING_REASON_MENU,
    FOLLOWING_REASON_DIALOGUE,
    FOLLOWING_REASON_SCRIPT,
    FOLLOWING_REASON_WARP,
    FOLLOWING_REASON_BATTLE,
    FOLLOWING_REASON_BLACKOUT,
    FOLLOWING_REASON_PARTNER,
    FOLLOWING_REASON_BIKE,
    FOLLOWING_REASON_SURF,
    FOLLOWING_REASON_DIVE,
    FOLLOWING_REASON_FISHING,
    FOLLOWING_REASON_FIELD_MOVE,
    FOLLOWING_REASON_COMMUNICATION,
    FOLLOWING_REASON_ACTIVITY,
    FOLLOWING_REASON_RESOURCE_FAILURE,
    FOLLOWING_REASON_DISABLED,
    FOLLOWING_REASON_COUNT,
} FollowingReason;

// How a sample was walked: a sample's kind
typedef enum {
    FOLLOWING_MOVEMENT_GRID,
    FOLLOWING_MOVEMENT_LEDGE,
    FOLLOWING_MOVEMENT_RAIL,
    FOLLOWING_MOVEMENT_WORLD,
} FollowingMovement;

// What the follower's code needs of a party member
typedef struct {
    u16 species;
    u8 form;
    u8 gender;
    u8 shiny;
    u8 egg;
    u16 hp;
    u16 maxHp;
    u32 personality;
    u32 trainer;
} FollowingPokemon;

// One of the player's steps: where, in which map (generation and space) and on which rail, facing which way
typedef struct {
    fx32 x;
    fx32 y;
    fx32 z;
    u32 generation;
    u32 space;
    u16 rail;
    u16 connection;
    u8 direction;
    // A FollowingMovement
    u8 kind;
    u16 duration;
} FollowingSample;

// The player's recent steps, a ring of samples from the oldest at head, and their metric length
typedef struct {
    FollowingSample samples[FOLLOWING_TRAIL_CAPACITY];
    u32 distance;
    u16 head;
    u16 count;
} FollowingTrail;

typedef struct {
    FollowingState state;
    u8 suppression[FOLLOWING_REASON_COUNT];
    u32 generation;
    FieldActor *actor;
    FollowingPokemon selected;
    s8 slot;
    u8 hasSelection;
    // 0 to 6 world units
    u8 sideGap;
    // The registry's offset of the sprite alone, so the shadow stays on the ground
    s8 spriteY;
    FollowingTrail trail;
    // Up, down, left and right, from the follower's row of the positioning table
    u8 directionalGap[4];
} Follower;

// The party member that follows: the first healthy one that isn't an Egg, or the first that isn't an Egg, or -1
s32 FollowingParty_SelectSlot(const FollowingPokemon *party, u32 count);
// The next party member for L and R, wrapping over those that aren't Eggs and preferring the healthy ones as
// FollowingParty_SelectSlot does, or -1. The party's order stays
s32 FollowingParty_CycleSlot(const FollowingPokemon *party, u32 count, s32 current, s32 direction);
BOOL FollowingPokemon_IsSame(const FollowingPokemon *a, const FollowingPokemon *b);
// At a quarter of its HP or less
BOOL FollowingPokemon_IsTired(const FollowingPokemon *mon);
// The billboard plays its own walking loop: this keeps its last pose while an interaction, a scene or an effect has
// the follower
BOOL Following_IsIdleAnimationEnabled(FollowingState state, BOOL visible, BOOL effectBusy);
void Following_Init(Follower *follower, u32 generation);
void Following_Enter(Follower *follower, FollowingReason reason);
void Following_Leave(Follower *follower, FollowingReason reason);
BOOL Following_IsSuppressed(const Follower *follower);
BOOL Following_StartInteraction(Follower *follower);
void Following_EndInteraction(Follower *follower);

void FollowingTrail_Clear(FollowingTrail *trail);
// -1 on a break in the trail or when it is full (the caller recalls the follower), 0 while it is seeded, 1 when the
// follower's pose on the trail is ready in follower. That pose is one tile of the trail's metric behind the player, so
// a long run step doesn't leave it farther back than a walk, and it is always on the walked route
s32 FollowingTrail_Push(FollowingTrail *trail, const FollowingSample *sample, FollowingSample *follower, u32 sideGap);
s32 FollowingTrail_PushDirectional(FollowingTrail *trail, const FollowingSample *sample, FollowingSample *follower,
                                   const u8 *gaps);
// Sums the trail's distance again under new gaps
void FollowingTrail_Remeasure(FollowingTrail *trail, const u8 *gaps);
// TRUE, and the corner, when the trail's newest steps face down (-side on a rail) onto a corner and then one step
// sideways: HeartGold and SoulSilver's side-by-side stand
BOOL FollowingTrail_FindSideCorner(const FollowingTrail *trail, BOOL rail, VecFx32 *corner);
// Moves every sample by a map connection's offset, which keeps the distances. FALSE, with the trail cleared, if a
// coordinate would overflow
BOOL FollowingTrail_Translate(FollowingTrail *trail, fx32 dx, fx32 dy, fx32 dz);
// The tile a coordinate is in, rounding down. A tile's center is at tile * FOLLOWING_TILE + FOLLOWING_TILE / 2
s32 Following_Tile(fx32 coord);
// TRUE when follower stands one tile from origin, face points from origin onto that tile, their heights are at most
// two tiles apart and the trail's next tile is origin: the player stepping back onto the follower
BOOL Following_SwapMatch(const FollowingTrail *trail, const VecFx32 *follower, const VecFx32 *origin, u32 face);
// Mirrors the player's progress from origin toward follower onto the follower's walk from follower back to origin. 1
// at the far end, 0 on the way and -1 if the player left that line
s32 Following_SwapMirror(const VecFx32 *follower, const VecFx32 *origin, const VecFx32 *player, VecFx32 *out);
// The walked height at (x, z), TRUE when a recorded step covers that point. The swap's chord is straight between the
// follower and the tile it settles on, and stairs and slopes aren't, so only the swap uses this
BOOL FollowingTrail_HeightAt(const FollowingTrail *trail, fx32 x, fx32 z, fx32 *y);
// Rail points aren't tiles: the follower is the next recorded point behind origin, up to eight tiles away
BOOL Following_RailSwapMatch(const FollowingTrail *trail, const VecFx32 *follower, const VecFx32 *origin);
// The swap on the whole rail segment, diagonal too. 1 at the far end, or when stepSettled and the player has moved
// toward the follower (a rail knot is often shorter than the follow gap), 0 while that step still moves, -1 if the
// player left the segment
s32 Following_RailSwapMirror(const VecFx32 *follower, const VecFx32 *origin, const VecFx32 *player, VecFx32 *out,
                             BOOL stepSettled);
// The follower's facing: moving is the step back toward origin, and the finished swap takes the player's own
u32 Following_SwapFace(u32 playerFace, BOOL moving);
// A rail facing is relative to the line: 0 +side, 1 -side, 2 +front, 3 -front. The larger axis wins, and a tie faces
// along the line. front is the +front step and side the +side step, as world offsets. 4 when both steps are too short
u32 Following_RailFaceAt(s32 relX, s32 relZ, s32 frontX, s32 frontZ, s32 sideX, s32 sideZ);
// The facing after a swap. Both actors are on the player's line, so it is the player's rail facing, straight or on a
// curve. The chord is the step just taken, not a compass to round
u32 Following_RailSwapTurn(u32 playerFace, s32 chordX, s32 chordZ);
// The form of the follower's sprite, palette and size row: Unown (201) always '?' (form 27) and Arceus (493) always
// Normal (form 0), the others their own
u32 Following_DisplayForm(u32 species, u32 form);
// Replaces the trail with a walk of unit steps that ends on player, under gaps. Its pose is one tile of the metric
// behind, the rest after a fresh load, which later steps keep. follower gives the far end's height. The samples take
// player's direction, so the next step doesn't use the facing from before the turn
BOOL FollowingTrail_Reseed(FollowingTrail *trail, const FollowingSample *follower, const FollowingSample *player,
                           const u8 *gaps, FollowingSample *out);
// The same rest, walked along the chord from from to player instead of a compass axis, since rail facings aren't
// world axes
BOOL FollowingTrail_ReseedAlong(FollowingTrail *trail, const FollowingSample *from, const FollowingSample *player,
                                const u8 *gaps, FollowingSample *out);
// A smoothstep in 16.16: 0 at the start, 65536 at length, flat at both ends
u32 Following_EaseSmoothstep(u32 traveled, u32 length);
// The metric distance kept: fullKeep once traveled reaches length, or when closeKeep is already there
u32 Following_EaseKeep(u32 traveled, u32 length, u32 closeKeep, u32 fullKeep);
// The length on the ground between two points: the ease's clock
u32 Following_Travel(fx32 x0, fx32 z0, fx32 x1, fx32 z1);
// The point keep metric units behind the newest sample. At FOLLOWING_TILE it is FollowingTrail_PushDirectional's,
// with the older sample's direction too
BOOL FollowingTrail_PoseBehind(const FollowingTrail *trail, const u8 *gaps, u32 keep, FollowingSample *out);
// The metric distance from the newest sample back to (x, z) on the trail, 0 when it isn't on it, at most a tile
u32 FollowingTrail_MetricToPoint(const FollowingTrail *trail, const u8 *gaps, fx32 x, fx32 z);
// TRUE when follower is on the segment from the player to the next rail point, which can be longer than a tile. A
// point past that rail point isn't
BOOL Following_RailSegmentReach(const VecFx32 *player, const VecFx32 *follower, const VecFx32 *forward, u32 gap);
// Keeps a follower that is nearly next to the player within the forward reach of dialogue, without changing its
// route or gap
BOOL Following_ClampDialoguePose(VecFx32 *pose, const VecFx32 *player, const VecFx32 *artOffset, u32 face, u32 gap);

#endif // PAPERWHITE2_FOLLOWING_H
