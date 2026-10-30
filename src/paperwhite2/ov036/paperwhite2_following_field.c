#include "types.h"
#include "constants/pokemon.h"
#include "constants/sound.h"
#include "constants/types.h"
#include "field/event_battle.h"
#include "field/field.h"
#include "field/field_actor.h"
#include "field/field_actor_internal.h"
#include "field/field_effect.h"
#include "field/field_g3d_mapper.h"
#include "field/field_internal.h"
#include "field/field_map.h"
#include "field/field_menu.h"
#include "field/field_player.h"
#include "gfl/arc.h"
#include "gfl/billboard_actor.h"
#include "gfl/heap.h"
#include "gfl/key.h"
#include "gfl/sound.h"
#include "limits.h"
#include "nitro/fx.h"
#include "nitro/mi.h"
#include "paperwhite2/following.h"
#include "paperwhite2/following_ambient.h"
#include "paperwhite2/following_effects.h"
#include "paperwhite2/following_events.h"
#include "paperwhite2/following_field.h"
#include "paperwhite2/following_interaction.h"
#include "paperwhite2/following_positioning.h"
#include "paperwhite2/following_reactions.h"
#include "paperwhite2/following_registry.h"
#include "paperwhite2/following_render.h"
#include "paperwhite2/following_resident.h"
#include "paperwhite2/following_scene.h"
#include "pml/poke_party.h"
#include "save/config.h"
#include "save/player_info.h"
#include "save/trainer_data_savedata.h"
#include "system/game_data.h"
#include "system/game_event.h"
#include "system/game_system.h"

// Paper White 2: the Following Pokémon's follower in the field, ported from Pokeweb's field.c (its base package). The
// follower is a field actor of the party member's follower code that doesn't run a move of its own: each frame it
// walks the player's trail (paperwhite2_following_trail.c), with the swap when the player steps back onto it, the stand
// beside the player, the ball that a large follower stays in under a floor or indoors, L and R to switch it, and A in
// front of it to talk to it (paperwhite2_following_interaction.c), from the field's event checks. Its state lives here
// and goes with overlay 36; what must outlive the field is a resident token. The scene policy
// (paperwhite2_following_scene.c) says which events keep the follower and which recall it; the ball effects are
// paperwhite2_following_effects.c.
// The original's FollowingDebug, a block of values for its emulator tests, isn't ported; the last reason that kept the
// follower away, which its talk reads, is sReason

// The uids that the follower takes, the first free one
#define FOLLOWER_UID_FIRST 0xf0
#define FOLLOWER_UID_LAST 0xf8

// The actors' pool asserts when it is full, so the follower leaves two free, and the field's heap for its resources
// keeps this much
#define FREE_ACTORS_KEPT 2
#define FREE_HEAP_KEPT 0x8000

// The most bytes the registry can be: its header and the most rows
#define REGISTRY_HEADER_SIZE 32
#define REGISTRY_MAX (REGISTRY_HEADER_SIZE + FOLLOWING_MAX_ROWS * 24)

// The reasons that keep the follower away, a bit each: the data or the config, the field's actors not running, the
// player not there or held, the player riding or surfing, an event, the partner, no party member to follow, too few
// free actors, no free uid, too little heap, the events bridge, the scene recalled it, and the Followers Off choice
#define REASON_CONFIG 0x1
#define REASON_FIELD 0x2
#define REASON_PLAYER 0x4
#define REASON_EX_STATE 0x8
#define REASON_EVENT 0x10
#define REASON_PAIR 0x20
#define REASON_SELECTION 0x40
#define REASON_ACTORS 0x80
#define REASON_UID 0x100
#define REASON_HEAP 0x200
#define REASON_EVENTS_BRIDGE 0x400
#define REASON_SCENE 0x800
#define REASON_OFF 0x1000

// The actors' system's flags that the follower needs set (its actors run and draw), and those it needs clear
#define SYSTEM_FLAGS_RUNNING (0x1 | 0x10)
#define SYSTEM_FLAGS_STOPPED (0x2 | 0x4)

// A tile's flags (GetTileFlags): grass, which the follower shakes once a tile it enters, and the shade, which gives an
// actor light 3 (RailActor_UpdateShadowGroup reads it the same way)
#define TILE_FLAG_GRASS 0x20
#define TILE_FLAG_SHADE 0x100
// A terrain layer whose class is this has no tile
#define TILE_CLASS_NONE 0xff

// The steps of a switch by L or R that cover the party
#define FOLLOWER_SELECT_STEPS FOLLOWING_PARTY_CAPACITY

// A 64-pixel body is 56 world units tall. A walkable layer over its feet lower than that (a bridge, an upper walkway)
// has the sprite coming up through it. Layers within a tile and a half are stairs and ledges. The trail's point is
// probed, and a tile either way along the line toward the player, so the follower goes into its ball a tile before it
// walks under and comes out a tile after. Three terrain queries a trail tile
#define FLOOR_LOW (FOLLOWING_TILE + FOLLOWING_TILE / 2)
#define LARGE_TALL (3 * FOLLOWING_TILE + FOLLOWING_TILE / 2)
// The updates that a large follower waits in its ball after leaving cover, so a trail along a floor's edge doesn't
// flash it in and out
#define COVER_CLEAR 20

// The side-by-side stand's last distance to its corner, a tile and a half
#define BESIDE_START (FOLLOWING_TILE + FOLLOWING_TILE / 2)

// The swap: active during a step back onto the follower; departed once the player has left the tile it vacated; rail
// on a rail. savedFace is the follower's face before it, and follower, origin and player its poses
typedef struct {
    u8 active;
    u8 departed;
    u8 rail;
    u16 savedFace;
    VecFx32 follower;
    VecFx32 origin;
    VecFx32 player;
} FollowingSwap;

// The gap after a swap, which eases from the pose the swap reached (closeKeep, its metric) out to a tile as the player
// travels
typedef struct {
    u8 active;
    u32 traveled;
    u32 closeKeep;
    VecFx32 last;
} FollowingEase;

// The HeartGold and SoulSilver side-by-side stand: the follower on the corner tile beside the player, held until the
// trail passes that corner again
typedef struct {
    u8 active;
    VecFx32 at;
    u32 last;
} FollowingBeside;

// Whether the trail's point at x, y, z, coming from sx, sz, is under a floor, cached for the tile
typedef struct {
    s32 x;
    s32 z;
    s32 y;
    s32 sx;
    s32 sz;
    u8 valid;
    u8 covered;
} FollowingCover;

static void Noop(FieldActor *actor);
static void Move(FieldActor *actor);
static void Removed(FieldActor *actor);
static BOOL IsOwned(void);
static BOOL IsLargeKept(const FieldActor *actor);
static void Cleanup(void);
static BOOL IsMenuCallback(GameEventCallback callback);
static BOOL IsChainOf(Field *field, BOOL (*isEvent)(GameEventCallback callback));
static BOOL IsSummonOrigin(Field *field, const FollowingSummon *request);

// The follower's move: its code, then its init, update, delete and return functions. Its update is the follower's step
// on the trail
static const FieldActorMoveCode sMoveCode = { 0, Noop, Move, Removed, Noop };

// No original structure owns this state. It goes with overlay 36
static Follower sFollower;
static MMSys *sOwner;
static FieldActor *sPlayer;
static u32 sTick;
static u32 sGeneration;
static u16 sCode;
static u8 sFlying;
static u32 sRegistryCrc;
static u16 sDescriptorCount;
// The follower's movement bypasses the actors' own, so only the last visible tile whose terrain effect was checked is
// remembered
static FieldActor *sTerrainActor;
static FieldEffects *sTerrainEffects;
static s16 sTerrainX;
static s16 sTerrainZ;
static u16 sTerrainZone;
// The shade under the follower, which ActorTerrainEffect_Shadow gives an NPC. That pass never runs for this actor, so
// the terrain update reads the same flag once a tile
static u8 sShaded;
// The tile under the follower that the terrain update read last, TILE_TYPE_NONE when it isn't out (the conditions'
// terrain, PaperWhite2_FollowingGetTile)
static u32 sTerrainTile = TILE_TYPE_NONE;
// The last zone of the player whose trail samples share the current frame of coordinates. A seamless connection that
// jumps more than a tile translates the trail instead of clearing it
static u16 sTrailZone;
static u8 sTrailZoneValid;
// TRUE after a draw has seen this actor shown. The update that first clears its hidden flag still has FALSE here, which
// is the body's first frame
static u8 sShownNow;
static u8 sReveal;
static s32 sConfigState;
static BOOL sEventsReady;
// A choice by L or R lives only in the field code; the party's data is untouched. The last safe tile of the follower
// is kept for the recall and the send-out
static VecFx32 sCyclePose;
static u16 sCycleFace;
static u8 sCyclePending;
static FollowingRestore sRestore;
// TRUE while the next follower should be placed at once, with its send-out, instead of waiting for the player to walk:
// at boot, when SELECT turns it on, after a menu's application or a battle that closed the field, and after a warp that
// a menu started (Fly, Dig, Teleport, the Escape Rope). A door or another map change is none of these, so it keeps the
// walk-in. The request crosses the overlay's reload as the resident summon token: valid from boot, stored only by a
// menu's or battle's unload (PaperWhite2_FollowingUnload), read once by the next field. A battle's return must be on
// the unload's zone and tile, so a loss's warp to a Pokémon Center walks in. The player moving first, or no open tile,
// clears it
static u8 sSummon;
static u8 sSummonSeen;
static VecFx32 sSummonAt;
// TRUE while the summon is placed during the return's events, as the field fades back in or under the menu that the
// application went back to: the field came back from a menu's application or a battle on the tile it left
// (FollowingScene_BeginReturn). Otherwise the summon waits until no event holds the field
static u8 sReturnSummon;
// TRUE from a field that a menu's application brought back until no event holds it: the menu's chain goes on, and a
// field move or item that it started (Fly, Dig, Teleport, the Escape Rope) and that warps arms the summon as the menu
// does, though the menu's own event is gone from the chain by then
static u8 sMenuSession;
// TRUE while the actor made for the return's summon waits hidden for its place: the scene's pause doesn't reveal it
static u8 sReturnHold;
// TRUE after something stepped onto the resting ball: the trail restarts and the ball stays away until the hold places
// it again
static u8 sBallOff;
// The party slot a fresh map would bring out. Indoors, L and R still offer it as its ball when it is large
static s32 sLeadSlot = -1;
static u8 sPage[FOLLOWING_REGISTRY_PAGE];
static u16 sIndex[FOLLOWING_MAX_SPECIES + 2];
static u32 sRegistrySize;
static u32 sStride;
static u32 sPageFirst;
static u32 sPageCount;
// The last frame's reasons that kept the follower away
static u32 sReason;
static FollowingSwap sSwap;
static FollowingEase sEase;
static VecFx32 sSettled;
static u8 sHaveSettled;
static u8 sHaveLast;
static FollowingBeside sBeside;
// Units taken off every gap, 0 to FOLLOWING_MAX_DIRECTIONAL_GAP. GapRamp walks it up while the follower waits in its
// ball on the trail, so the ball keeps the tile right behind the player, and back down once it is sent out
static u8 sShrink;
static u8 sGaps[4];
static FollowingCover sCover;
static u8 sHeld;
static u8 sHeldClear;
// The actors' system whose effect banks the map's spawn already uploaded. The field update's change of owner keeps them
static MMSys *sWarmed;
static fx32 sRampX;
static fx32 sRampZ;
// The follower's ball, read from the party only when the pick changes
static u32 sBallWho;
static u32 sBallTrainer;
static u8 sBallKnown;

static void ClearSwap(void) {
    sSwap.active = sSwap.departed = sSwap.rail = FALSE;
}

static void ClearEase(void) {
    sEase.active = FALSE;
    sEase.traveled = sEase.closeKeep = 0;
}

static void DropSettled(void) {
    sHaveSettled = FALSE;
    sHaveLast = FALSE;
}

static void ClearRestore(void) {
    sRestore.magic = 0;
    sRestore.player.x = sRestore.player.y = sRestore.player.z = 0;
    sRestore.follower.x = sRestore.follower.y = sRestore.follower.z = 0;
    sRestore.grid[0] = sRestore.grid[1] = sRestore.grid[2] = 0;
    sRestore.face = sRestore.zone = 0;
}

static void Noop(FieldActor *actor) {
}

static void Removed(FieldActor *actor) {
    if (actor == sFollower.actor) {
        FollowingTalk_Cancel();
        sFollower.actor = NULL;
        sFollower.state = FOLLOWING_STATE_ABSENT;
        if (!sCyclePending) {
            FollowingTrail_Clear(&sFollower.trail);
        }
        ClearEase();
    }
}

// The billboard plays the follower's walking loop itself. Its pause belongs to the picture alone: it doesn't play while
// a talk, a scene or a ball effect has the follower
static void GateAnimation(FieldActor *actor) {
    if (Following_IsIdleAnimationEnabled(sFollower.state, !(actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN),
                                         FollowingEffects_IsBusy())) {
        actor->flags &= ~FOLLOWING_ACTOR_FLAG_PAUSE_ANIMATION;
    } else {
        actor->flags |= FOLLOWING_ACTOR_FLAG_PAUSE_ANIMATION;
    }
}

// The actor's creation puts BILLBOARD_ACTOR_NONE in its billboard work, so it draws no quad until the material's
// loading writes a real handle
static BOOL IsBodySheetReady(FieldActor *actor) {
    const u16 *work = FldAct_GetBillboardActorWorkPtr(actor);

    return *work != BILLBOARD_ACTOR_NONE;
}

static void RevealFollower(FieldActor *actor) {
    // Every reveal comes through here: the trail, a swap, an event's pause. A large follower kept in its ball (indoors,
    // under a floor) stays there
    if (!FollowingEffects_HidesActor() && IsBodySheetReady(actor) && !IsLargeKept(actor)) {
        actor->flags &= ~FOLLOWING_ACTOR_FLAG_HIDDEN;
    }
}

static BOOL IsCoordinate(s64 v) {
    return v >= LONG_MIN && v <= LONG_MAX;
}

static BOOL AddCoordinate(VecFx32 *v, fx32 dx, fx32 dy, fx32 dz) {
    s64 x = (s64)v->x + dx;
    s64 y = (s64)v->y + dy;
    s64 z = (s64)v->z + dz;

    if (!IsCoordinate(x) || !IsCoordinate(y) || !IsCoordinate(z)) {
        return FALSE;
    }
    v->x = (fx32)x;
    v->y = (fx32)y;
    v->z = (fx32)z;
    return TRUE;
}

// The trail's own test of a break: more than a tile in X and Z, or two in Y
static BOOL IsConnectionJump(s64 dx, s64 dy, s64 dz) {
    s64 ax = dx < 0 ? -dx : dx;
    s64 ay = dy < 0 ? -dy : dy;
    s64 az = dz < 0 ? -dz : dz;
    // As the trail's square root: a gap breaks only once the distance is more than a tile
    s64 limit = (s64)FOLLOWING_TILE + 1;

    if (ay > 2 * (s64)FOLLOWING_TILE || ax > 2 * (s64)FOLLOWING_TILE || az > 2 * (s64)FOLLOWING_TILE) {
        return TRUE;
    }
    return ax * ax + az * az >= limit * limit;
}

static void SetGrid(FieldActor *actor) {
    actor->initGPos = actor->gPos;
    actor->gPos.x = (s16)(actor->wPos.x / FOLLOWING_TILE);
    actor->gPos.y = (s16)(actor->wPos.y / FOLLOWING_TILE);
    actor->gPos.z = (s16)(actor->wPos.z / FOLLOWING_TILE);
}

// A change of zone with a large jump of coordinates is a seamless connection, not a warp: the trail (and the follower,
// if it is still live) shifts by that jump. A door's warp rebuilds the actors' system and still drops the trail
static BOOL RebaseConnection(FieldActor *actor, VecFx32 *pose, const FollowingSample *sample) {
    FollowingTrail *trail;
    const FollowingSample *last;
    s64 dx;
    s64 dy;
    s64 dz;
    VecFx32 savedActor;
    VecFx32 savedPose;

    if (!sTrailZoneValid) {
        sTrailZone = sPlayer->zoneId;
        sTrailZoneValid = TRUE;
        return TRUE;
    }
    if (sPlayer->zoneId == sTrailZone) {
        return TRUE;
    }
    sTrailZone = sPlayer->zoneId;
    trail = &sFollower.trail;
    if (trail->count == 0) {
        return TRUE;
    }
    last = &trail->samples[(trail->head + trail->count - 1u) % FOLLOWING_TRAIL_CAPACITY];
    dx = (s64)sample->x - last->x;
    dy = (s64)sample->y - last->y;
    dz = (s64)sample->z - last->z;
    if (!IsConnectionJump(dx, dy, dz)) {
        return TRUE;
    }
    if (!IsCoordinate(dx) || !IsCoordinate(dy) || !IsCoordinate(dz)) {
        FollowingTrail_Clear(trail);
        return FALSE;
    }
    savedActor.x = savedActor.y = savedActor.z = 0;
    savedPose = savedActor;
    if (actor != NULL) {
        savedActor = actor->wPos;
    }
    if (pose != NULL) {
        savedPose = *pose;
    }
    if (actor != NULL && !AddCoordinate(&actor->wPos, (fx32)dx, (fx32)dy, (fx32)dz)) {
        FollowingTrail_Clear(trail);
        return FALSE;
    }
    if (pose != NULL && !AddCoordinate(pose, (fx32)dx, (fx32)dy, (fx32)dz)) {
        if (actor != NULL) {
            actor->wPos = savedActor;
        }
        FollowingTrail_Clear(trail);
        return FALSE;
    }
    if (!FollowingTrail_Translate(trail, (fx32)dx, (fx32)dy, (fx32)dz)) {
        if (actor != NULL) {
            actor->wPos = savedActor;
        }
        if (pose != NULL) {
            *pose = savedPose;
        }
        return FALSE;
    }
    if (actor != NULL) {
        SetGrid(actor);
    }
    return TRUE;
}

// The player's step as the trail records it, at the height its draw offsets give
static void GetPlayerSample(FollowingSample *sample) {
    sample->x = sPlayer->wPos.x;
    sample->y = sPlayer->wPos.y + sPlayer->wPosOffset.y + sPlayer->outerDrawOffset.y;
    sample->z = sPlayer->wPos.z;
    sample->generation = sGeneration;
    sample->space = 1;
    sample->rail = 0;
    sample->connection = 0;
    sample->direction = (u8)sPlayer->faceDir;
    sample->kind = FOLLOWING_MOVEMENT_WORLD;
    sample->duration = 1;
}

// Whether a position is a tile's center
static BOOL IsCentered(const VecFx32 *v) {
    return ((u32)v->x & 0xffff) == 0x8000 && ((u32)v->z & 0xffff) == 0x8000;
}

static BOOL IsSameTile(fx32 x, fx32 z, fx32 ox, fx32 oz) {
    return Following_Tile(x) == Following_Tile(ox) && Following_Tile(z) == Following_Tile(oz);
}

static BOOL IsOnRail(void) {
    return (sPlayer->flags & ACTOR_FLAG_RAIL) && FldAct_GetRailUnit(sPlayer) != NULL;
}

// The centers of the grid still settle at once. A rail's point is almost never a tile's center, so the last frame's
// rail position is the step's origin. The first frame only records that a position exists
static void NoteSettled(void) {
    if (sSwap.active) {
        return;
    }
    if (IsCentered(&sPlayer->wPos)) {
        sSettled = sPlayer->wPos;
        sHaveSettled = TRUE;
    } else if (IsOnRail() && sHaveLast) {
        sSettled = sPlayer->wPos;
        sHaveSettled = TRUE;
    }
    sHaveLast = TRUE;
}

static void BindPose(FieldActor *actor, fx32 x, fx32 y, fx32 z, u32 face) {
    actor->wPos.x = x;
    actor->wPos.y = y;
    actor->wPos.z = z;
    SetGrid(actor);
    SetActorFaceDir(actor, face);
    FollowingRender_Anchor(actor, face);
    actor->movementFlags &= ~FOLLOWING_ACTOR_MOVEMENT_UNREAD;
}

static void RecallBlocked(FieldActor *actor) {
    if (!(actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN)) {
        FollowingEffects_Recall(actor);
    } else if (FollowingEffects_IsResting()) {
        FollowingEffects_RestRecall();
        sBallOff = TRUE;
    }
    actor->flags |= FOLLOWING_ACTOR_FLAG_HIDDEN;
    sFollower.state = FOLLOWING_STATE_WAITING;
    FollowingTrail_Clear(&sFollower.trail);
    ClearSwap();
    ClearEase();
    DropSettled();
}

static BOOL IsLargeActor(const FieldActor *actor) {
    return actor->config.billboardSize == ACTOR_BILLBOARD_SIZE_64;
}

// The stored gaps plus the 64-pixel size's bonus, less the shrink. The directional gaps keep the chosen positioning
// row's, 0 to 12, so a later edit of that row still tunes a large follower. Before the actor exists the bonus is 0;
// the trail simply waits for the extra distance once it does
static const u8 *GetWalkGaps(void) {
    u32 bonus = IsOwned() && IsLargeActor(sFollower.actor) ? FOLLOWING_LARGE_GAP_BONUS : 0;
    u32 i;

    for (i = 0; i < 4; i++) {
        u32 gap = sFollower.directionalGap[i] + bonus;

        gap = gap > sShrink ? gap - sShrink : 0;
        sGaps[i] = (u8)(gap > FOLLOWING_MAX_DIRECTIONAL_GAP ? FOLLOWING_MAX_DIRECTIONAL_GAP : gap);
    }
    return sGaps;
}

// The billboard size of an object code before an actor exists, from its config, which GetNPCMdlInfoForOBJCODE also
// reads for the follower codes
static BOOL IsCodeLarge(MMSys *system, u16 code) {
    FieldActorConfig config;

    if (system == NULL || code == 0) {
        return FALSE;
    }
    GetNPCMdlInfoForOBJCODE(system, code, &config);
    return config.billboardSize == ACTOR_BILLBOARD_SIZE_64;
}

// Interiors keep a 64-pixel follower in its ball and exteriors let it out, by the area's exterior flag. Without field
// effects nothing is barred. The original's zone overrides, a second member of positioning.narc that swapped the rule
// for a zone, aren't ported: the hack has none, and that member's place is now the registry's
static BOOL IsLargeBarredAt(Field *field) {
    FieldEffects *effects = field != NULL ? Field_GetFieldEffects(field) : NULL;

    if (effects == NULL) {
        return FALSE;
    }
    return !FieldEffects_GetAreaIsExterior(effects);
}

static BOOL IsLargeBarred(void) {
    return sOwner != NULL && sPlayer != NULL && IsLargeBarredAt(sOwner->field);
}

static BOOL IsFloorOver(FieldG3DMapper *mapper, fx32 x, fx32 y, fx32 z, BOOL ground) {
    FieldG3DMapperTerrain terrain;
    VecFx32 at;
    u32 layers;
    BOOL over;
    BOOL walk;
    u32 i;

    at.x = x;
    at.y = y;
    at.z = z;
    if (!FieldG3DMapper_GetTerrainAll(mapper, &at, &terrain)) {
        return FALSE;
    }
    layers = terrain.layerCount;
    if (layers > FIELD_G3D_MAPPER_LAYER_MAX) {
        layers = FIELD_G3D_MAPPER_LAYER_MAX;
    }
    over = FALSE;
    walk = !ground;
    for (i = 0; i < layers; i++) {
        u32 type = terrain.layers[i].tileType;
        s64 above = (s64)terrain.layers[i].height - y;

        if (type == TILE_TYPE_NONE || GetTileClass(type) == TILE_CLASS_NONE) {
            continue;
        }
        if (above > FLOOR_LOW && above < LARGE_TALL) {
            over = TRUE;
        } else if (above >= -FOLLOWING_TILE && above <= FOLLOWING_TILE && !(GetTileFlags(type) & TILE_FLAG_COLLISION)) {
            walk = TRUE;
        }
    }
    return over && walk;
}

static BOOL IsUnderFloor(FieldActor *actor, const FollowingSample *sample) {
    s32 tx = Following_Tile(sample->x);
    s32 tz = Following_Tile(sample->z);
    s32 sx = 0;
    s32 sz = 0;
    FieldG3DMapper *mapper;
    BOOL covered;

    if (sPlayer != NULL) {
        s64 dx = (s64)sPlayer->wPos.x - sample->x;
        s64 dz = (s64)sPlayer->wPos.z - sample->z;
        s64 ax = dx < 0 ? -dx : dx;
        s64 az = dz < 0 ? -dz : dz;

        if (ax >= az && dx != 0) {
            sx = dx > 0 ? FOLLOWING_TILE : -FOLLOWING_TILE;
        } else if (dz != 0) {
            sz = dz > 0 ? FOLLOWING_TILE : -FOLLOWING_TILE;
        }
    }
    if (sCover.valid && sCover.x == tx && sCover.z == tz && sCover.y == sample->y && sCover.sx == sx &&
        sCover.sz == sz) {
        return sCover.covered;
    }
    mapper = GetMMSysG3DMapper(actor->actorSystem);
    // A tile ahead or behind counts only where the follower could walk under it: walkable ground at its feet. A raised
    // hedge or roof beside a corner isn't a bridge
    covered = mapper != NULL &&
              (IsFloorOver(mapper, sample->x, sample->y, sample->z, FALSE) ||
               ((sx != 0 || sz != 0) && (IsFloorOver(mapper, sample->x + sx, sample->y, sample->z + sz, TRUE) ||
                                         IsFloorOver(mapper, sample->x - sx, sample->y, sample->z - sz, TRUE))));
    sCover.x = tx;
    sCover.z = tz;
    sCover.y = sample->y;
    sCover.sx = sx;
    sCover.sz = sz;
    sCover.valid = TRUE;
    sCover.covered = (u8)covered;
    return covered;
}

// A 64-pixel follower barred here, or held under a floor by Move
static BOOL IsLargeKept(const FieldActor *actor) {
    return IsLargeActor(actor) && (sHeld || IsLargeBarred());
}

// A large follower kept in its ball, under a floor or indoors, leaves the closed ball out on its hidden pose, so the
// player sees where it went. The release sends it out from there; indoors it stays until an exterior
static const VecFx32 *GetRestBall(void) {
    const FieldActor *actor;

    if (!IsOwned()) {
        return NULL;
    }
    actor = sFollower.actor;
    if (!sHeld || sBallOff || !(actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN) || !IsLargeActor(actor) ||
        (sFollower.state != FOLLOWING_STATE_WAITING && sFollower.state != FOLLOWING_STATE_EVENT_PAUSED)) {
        return NULL;
    }
    return &actor->wPos;
}

// Only while the player moves, so nothing drifts while still: the ball closes in two units an update, and the sent-out
// follower eases back one, half the walking pace. The trail is summed again under each new gap
static void GapRamp(void) {
    BOOL moved;
    u32 target;
    u32 shrink;

    if (!IsOwned() || sPlayer == NULL) {
        return;
    }
    moved = sPlayer->wPos.x != sRampX || sPlayer->wPos.z != sRampZ;
    sRampX = sPlayer->wPos.x;
    sRampZ = sPlayer->wPos.z;
    target = GetRestBall() != NULL ? FOLLOWING_MAX_DIRECTIONAL_GAP : 0;
    shrink = sShrink;
    if (moved && shrink < target) {
        shrink = shrink + 2 > target ? target : shrink + 2;
    } else if (moved && shrink > target) {
        shrink--;
    }
    if (shrink == sShrink) {
        return;
    }
    sShrink = (u8)shrink;
    FollowingTrail_Remeasure(&sFollower.trail, GetWalkGaps());
}

// TRUE while a 64-pixel follower stays in its ball: barred here, or under a floor. Leaving cover waits COVER_CLEAR
// updates
static BOOL IsLargeHeld(FieldActor *actor, const FollowingSample *target) {
    if (!IsLargeActor(actor)) {
        sHeld = FALSE;
        return FALSE;
    }
    if (IsLargeBarred()) {
        sHeld = TRUE;
        sHeldClear = COVER_CLEAR;
        return TRUE;
    }
    if (IsUnderFloor(actor, target)) {
        sHeld = TRUE;
        sHeldClear = 0;
        return TRUE;
    }
    if (!sHeld) {
        return FALSE;
    }
    if (sHeldClear < COVER_CLEAR) {
        sHeldClear++;
        return TRUE;
    }
    sHeld = FALSE;
    return FALSE;
}

// TRUE when natural is nearer than a fresh load along the trail sown again: the follower turns on that pose, or on
// the start's floor when the mirrored end is nearer than that, and the next walk eases out from there
static BOOL EaseFrom(const VecFx32 *natural, const VecFx32 *player, FollowingSample *start) {
    u32 close = FollowingTrail_MetricToPoint(&sFollower.trail, GetWalkGaps(), natural->x, natural->z);

    if (close == 0 || close >= FOLLOWING_TILE) {
        ClearEase();
        return FALSE;
    }
    if (close < FOLLOWING_EASE_START_KEEP) {
        close = FOLLOWING_EASE_START_KEEP;
    }
    if (!FollowingTrail_PoseBehind(&sFollower.trail, GetWalkGaps(), close, start)) {
        ClearEase();
        return FALSE;
    }
    sEase.active = TRUE;
    sEase.traveled = 0;
    sEase.closeKeep = close;
    sEase.last = *player;
    return TRUE;
}

static void FinishSwap(FieldActor *actor, const FollowingSample *sample, const VecFx32 *player,
                       const VecFx32 *natural) {
    // The grid keeps the compass the player walks. A rail's facing is the line's frame (0 +side, 1 -side, 2 +front,
    // 3 -front): it is copied, and every sample is sown again with it before this returns. Move doesn't push the trail
    // this frame, so the head before the turn can't replace the turn. The sown pose is the fresh load's rest, and
    // binding it here is the snap. The mirrored end is kept when it is already past the start's floor; a nearer end
    // starts from that floor, still on the trail, and eases out from there
    BOOL rail = sSwap.rail;
    u32 face = rail ? Following_RailSwapTurn(sPlayer->faceDir, player->x - sSwap.origin.x, player->z - sSwap.origin.z)
                    : sPlayer->faceDir;
    FollowingSample start = *sample;
    FollowingSample end = *sample;
    FollowingSample pose;
    FollowingSample eased;
    fx32 walked;
    BOOL seeded;

    start.x = sSwap.origin.x;
    start.y = sSwap.origin.y;
    start.z = sSwap.origin.z;
    start.direction = (u8)face;
    // The heights as the trail records them (with the player's draw offsets), so the slope sown again matches ordinary
    // following on an incline
    if (FollowingTrail_HeightAt(&sFollower.trail, start.x, start.z, &walked)) {
        start.y = walked;
    }
    end.x = player->x;
    end.y = sample->y;
    end.z = player->z;
    end.direction = (u8)face;
    seeded = rail ? FollowingTrail_ReseedAlong(&sFollower.trail, &start, &end, GetWalkGaps(), &pose)
                  : FollowingTrail_Reseed(&sFollower.trail, &start, &end, GetWalkGaps(), &pose);
    if (seeded && EaseFrom(natural, player, &eased)) {
        BindPose(actor, eased.x, eased.y, eased.z, face);
    } else if (seeded) {
        BindPose(actor, pose.x, pose.y, pose.z, face);
    } else {
        FollowingTrail_Clear(&sFollower.trail);
        ClearEase();
        BindPose(actor, sSwap.origin.x, sSwap.origin.y, sSwap.origin.z, face);
    }
    // The tile the swap left behind goes: the grid matches the pose just bound
    actor->initGPos = actor->gPos;
    ClearSwap();
    sSettled = sPlayer->wPos;
    sHaveSettled = IsCentered(&sSettled) ? TRUE : FALSE;
    RevealFollower(actor);
    // A ball that swapped stays the ball
    if (!(actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN)) {
        sFollower.state = FOLLOWING_STATE_FOLLOWING;
    }
    GateAnimation(actor);
}

static BOOL IsNearOrigin(const VecFx32 *p) {
    s64 dx = (s64)p->x - sSwap.origin.x;
    s64 dy = (s64)p->y - sSwap.origin.y;
    s64 dz = (s64)p->z - sSwap.origin.z;

    if (dy > FX32_ONE || dy < -FX32_ONE) {
        return FALSE;
    }
    return dx * dx + dz * dz <= (s64)FX32_ONE * FX32_ONE;
}

// The centers of tiles aren't rail knots. A knot shorter than the follow gap never reaches the follower's pose, so the
// travel's facing would stay applied
static BOOL DriveRailSwap(FieldActor *actor, const FollowingSample *sample, const VecFx32 *player) {
    VecFx32 mirrored;
    VecFx32 vacated;
    s32 dx = player->x - sSwap.player.x;
    s32 dz = player->z - sSwap.player.z;
    BOOL stepSettled;
    s32 mirror;
    fx32 walked;

    if (dx < 0) {
        dx = -dx;
    }
    if (dz < 0) {
        dz = -dz;
    }
    // A finished knot sits still. A bob of less than a unit doesn't keep the travel's facing applied; a real step moves
    // far more than this between frames
    stepSettled = sSwap.departed && dx <= 256 && dz <= 256;
    mirror = Following_RailSwapMirror(&sSwap.follower, &sSwap.origin, player, &mirrored, stepSettled);
    if (mirror < 0) {
        ClearSwap();
        return FALSE;
    }
    if (FollowingTrail_HeightAt(&sFollower.trail, mirrored.x, mirrored.z, &walked)) {
        mirrored.y = walked;
    }
    vacated = sSwap.origin;
    if (!FollowingScene_IsStepClear(actor, &vacated)) {
        RecallBlocked(actor);
        return TRUE;
    }
    if (mirror == 1) {
        FinishSwap(actor, sample, player, &mirrored);
        return TRUE;
    }
    if (IsNearOrigin(player) && mirror == 0 && sSwap.departed) {
        BindPose(actor, sSwap.follower.x, sSwap.follower.y, sSwap.follower.z, sSwap.savedFace);
        ClearSwap();
        sSettled = sPlayer->wPos;
        sHaveSettled = TRUE;
        GateAnimation(actor);
        return TRUE;
    }
    if (!IsNearOrigin(player)) {
        sSwap.departed = TRUE;
    }
    sSwap.player = *player;
    BindPose(actor, mirrored.x, mirrored.y, mirrored.z, Following_SwapFace(sPlayer->faceDir, TRUE));
    if (sFollower.state == FOLLOWING_STATE_FOLLOWING) {
        RevealFollower(actor);
    }
    GateAnimation(actor);
    return TRUE;
}

// TRUE when this frame belongs to the swap. A mirror of -1 falls through, so the untouched trail rules again
static BOOL DriveSwap(FieldActor *actor, const FollowingSample *sample, const VecFx32 *player) {
    VecFx32 mirrored;
    VecFx32 vacated;
    s32 mirror;
    fx32 walked;
    BOOL onFollower;
    BOOL onOrigin;
    BOOL gridLeads;

    if (sSwap.rail) {
        return DriveRailSwap(actor, sample, player);
    }
    mirror = Following_SwapMirror(&sSwap.follower, &sSwap.origin, player, &mirrored);
    if (mirror < 0) {
        ClearSwap();
        return FALSE;
    }
    if (FollowingTrail_HeightAt(&sFollower.trail, mirrored.x, mirrored.z, &walked)) {
        mirrored.y = walked;
    }
    vacated = sSwap.origin;
    if (!FollowingScene_IsStepClear(actor, &vacated)) {
        RecallBlocked(actor);
        return TRUE;
    }
    onFollower = IsCentered(&sPlayer->wPos) && IsSameTile(player->x, player->z, sSwap.follower.x, sSwap.follower.z);
    onOrigin = IsCentered(&sPlayer->wPos) && IsSameTile(player->x, player->z, sSwap.origin.x, sSwap.origin.z);
    if (mirror == 1 || onFollower) {
        FinishSwap(actor, sample, player, &mirrored);
        return TRUE;
    }
    gridLeads = sPlayer->gPos.x == (s16)Following_Tile(sSwap.follower.x) &&
                sPlayer->gPos.z == (s16)Following_Tile(sSwap.follower.z);
    if (onOrigin && mirror == 0 && (sSwap.departed || !gridLeads)) {
        BindPose(actor, sSwap.follower.x, sSwap.follower.y, sSwap.follower.z, sSwap.savedFace);
        ClearSwap();
        sSettled = sPlayer->wPos;
        sHaveSettled = TRUE;
        GateAnimation(actor);
        return TRUE;
    }
    if (!(onOrigin && mirror == 0)) {
        sSwap.departed = TRUE;
    }
    BindPose(actor, mirrored.x, mirrored.y, mirrored.z, sPlayer->faceDir ^ 1);
    if (sFollower.state == FOLLOWING_STATE_FOLLOWING) {
        RevealFollower(actor);
    }
    GateAnimation(actor);
    return TRUE;
}

static BOOL BeginRailSwap(FieldActor *actor, const FollowingSample *sample, const VecFx32 *player) {
    VecFx32 follower = actor->wPos;
    VecFx32 origin = sSettled;
    VecFx32 probe;
    VecFx32 vacated;

    if (player->x == origin.x && player->y == origin.y && player->z == origin.z) {
        return FALSE;
    }
    if (!Following_RailSwapMatch(&sFollower.trail, &follower, &origin)) {
        return FALSE;
    }
    if (Following_RailSwapMirror(&follower, &origin, player, &probe, FALSE) < 0) {
        return FALSE;
    }
    if (probe.x == follower.x && probe.y == follower.y && probe.z == follower.z) {
        return FALSE;
    }
    vacated = origin;
    if (!FollowingScene_IsStepClear(actor, &vacated)) {
        RecallBlocked(actor);
        return TRUE;
    }
    ClearEase();
    sBeside.active = FALSE;
    sSwap.active = TRUE;
    sSwap.departed = FALSE;
    sSwap.rail = TRUE;
    sSwap.follower = follower;
    sSwap.origin = origin;
    sSwap.player = *player;
    sSwap.savedFace = actor->faceDir;
    return DriveSwap(actor, sample, player);
}

static BOOL BeginSwap(FieldActor *actor, const FollowingSample *sample, const VecFx32 *player) {
    VecFx32 follower;
    VecFx32 origin;
    VecFx32 probe;
    VecFx32 vacated;
    BOOL stepping;
    BOOL gridLeads;
    BOOL jumped;

    if (sSwap.active || !sHaveSettled || FollowingEffects_HidesActor()) {
        return FALSE;
    }
    // The resting ball swaps with the player as the follower does
    if (sFollower.state != FOLLOWING_STATE_FOLLOWING && GetRestBall() == NULL) {
        return FALSE;
    }
    if (IsOnRail()) {
        return BeginRailSwap(actor, sample, player);
    }
    follower = actor->wPos;
    origin = sSettled;
    if (!Following_SwapMatch(&sFollower.trail, &follower, &origin, sPlayer->faceDir)) {
        return FALSE;
    }
    stepping = !IsCentered(&sPlayer->wPos);
    gridLeads = IsCentered(&sPlayer->wPos) && sPlayer->gPos.x == (s16)Following_Tile(follower.x) &&
                sPlayer->gPos.z == (s16)Following_Tile(follower.z);
    jumped = IsCentered(&sPlayer->wPos) && IsSameTile(player->x, player->z, follower.x, follower.z);
    if (!stepping && !gridLeads && !jumped) {
        return FALSE;
    }
    if (Following_SwapMirror(&follower, &origin, player, &probe) < 0) {
        return FALSE;
    }
    vacated = origin;
    if (!FollowingScene_IsStepClear(actor, &vacated)) {
        RecallBlocked(actor);
        return TRUE;
    }
    ClearEase();
    sBeside.active = FALSE;
    sSwap.active = TRUE;
    sSwap.departed = FALSE;
    sSwap.follower = follower;
    sSwap.origin = origin;
    sSwap.savedFace = actor->faceDir;
    return DriveSwap(actor, sample, player);
}

// An Easter egg from HeartGold and SoulSilver, for 32-pixel followers only. Walk down, step a tile left or right, then
// turn to face down in place: the follower, still behind the corner by its gap, takes the rest of the step onto the
// corner and stands beside the player facing down. On a rail, down is -side and the step aside is a knot along +front
// or -front. Two units an update on each axis, the walking pace. Any other facing, a moving player, a swap, an ease,
// the ball, a large follower or an NPC on the corner leave it as it is
static u32 GetCornerSpan(fx32 x, fx32 z, const VecFx32 *corner) {
    u32 dx = x > corner->x ? (u32)x - (u32)corner->x : (u32)corner->x - (u32)x;
    u32 dz = z > corner->z ? (u32)z - (u32)corner->z : (u32)corner->z - (u32)z;

    return dx > dz ? dx : dz;
}

static fx32 StepToward(fx32 from, fx32 to) {
    s64 d = (s64)to - from;

    if (d > 2 * FX32_ONE) {
        d = 2 * FX32_ONE;
    } else if (d < -2 * FX32_ONE) {
        d = -2 * FX32_ONE;
    }
    return (fx32)(from + d);
}

static BOOL StepBeside(FieldActor *actor) {
    BOOL rail = IsOnRail();
    const FollowingTrail *trail;
    const FollowingSample *newest;
    VecFx32 corner;
    fx32 x;
    fx32 z;

    if (IsLargeActor(actor) || sFollower.state != FOLLOWING_STATE_FOLLOWING ||
        (actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN) || sSwap.active || sEase.active || FollowingEffects_IsBusy() ||
        sPlayer->faceDir != DIR_DOWN || (!rail && !IsCentered(&sPlayer->wPos))) {
        return FALSE;
    }
    trail = &sFollower.trail;
    if (trail->count == 0) {
        return FALSE;
    }
    // The player stands on the newest sample: turned in place, not moving
    newest = &trail->samples[(trail->head + trail->count - 1u) % FOLLOWING_TRAIL_CAPACITY];
    if (newest->x != sPlayer->wPos.x || newest->z != sPlayer->wPos.z) {
        return FALSE;
    }
    if (!FollowingTrail_FindSideCorner(trail, rail, &corner)) {
        return FALSE;
    }
    if (GetCornerSpan(actor->wPos.x, actor->wPos.z, &corner) > FOLLOWING_TILE) {
        return FALSE;
    }
    if (!rail && (actor->wPos.x != corner.x || actor->wPos.z > corner.z)) {
        return FALSE;
    }
    if (actor->wPos.x == corner.x && actor->wPos.z == corner.z) {
        sBeside.active = TRUE;
        sBeside.at = corner;
        sBeside.last = BESIDE_START;
        return FALSE;
    }
    if (!FollowingScene_IsStepClear(actor, &corner)) {
        return FALSE;
    }
    x = StepToward(actor->wPos.x, corner.x);
    z = StepToward(actor->wPos.z, corner.z);
    BindPose(actor, x, x == corner.x && z == corner.z ? corner.y : actor->wPos.y, z, DIR_DOWN);
    sBeside.active = TRUE;
    sBeside.at = corner;
    sBeside.last = BESIDE_START;
    return TRUE;
}

// Once the player moves on, the trail's pose starts behind the corner and walks through it. The follower is held where
// it stands, on the corner or part way to it, while the trail's pose is still closing on the corner, so there is no
// step back. A pose that comes as close as the follower, or that has stepped over the corner and moves away from it,
// ends the hold for good; the follower is then on its ordinary pose
static void HoldBeside(const FieldActor *actor, FollowingSample *target) {
    u32 held;
    u32 trail;

    if (!sBeside.active) {
        return;
    }
    held = GetCornerSpan(actor->wPos.x, actor->wPos.z, &sBeside.at);
    trail = GetCornerSpan(target->x, target->z, &sBeside.at);
    if (held <= FOLLOWING_TILE && trail > held && trail <= sBeside.last) {
        sBeside.last = trail;
        target->x = actor->wPos.x;
        target->y = actor->wPos.y;
        target->z = actor->wPos.z;
        return;
    }
    sBeside.active = FALSE;
}

// The summon's placement, on grids and rails. Steps are probed from the player with the game's checks: on a grid the
// NPCs' step check (ActorRouteCollCheck: terrain, height, actors, bounds), on a rail the rail's hit bits, with the
// world point one step that way from FieldPlayer_GetWPosInDir. The trail is sown along that step toward the player,
// recorded facing the player.
//  1. A 32-pixel follower with the player facing down (-side on a rail): the tile beside, facing down, as the
//     side-by-side stand leaves it.
//  2. Behind at the follow distance, facing the player's way; on a grid the next tile too when the pose reaches it.
//  3. Either side at the follow distance, facing the player.
// Neither: the ordinary walk-in. A large follower kept in its ball here comes out as the resting ball, a tile away as
// the ball walks
static s32 GetDirX(u32 dir) {
    return dir == DIR_LEFT ? -1 : dir == DIR_RIGHT ? 1 : 0;
}

static s32 GetDirZ(u32 dir) {
    return dir == DIR_UP ? -1 : dir == DIR_DOWN ? 1 : 0;
}

static BOOL IsTileOpen(FieldActor *player, s32 steps, u32 dir, fx32 *height) {
    s16 x = (s16)(player->gPos.x + GetDirX(dir) * steps);
    s16 z = (s16)(player->gPos.z + GetDirZ(dir) * steps);
    VecFx32 at;

    if (steps == 1) {
        if (ActorRouteCollCheckOneTileInDir(player, dir)) {
            return FALSE;
        }
    } else {
        VecFx32 from;

        from.x = (player->gPos.x + GetDirX(dir) * (steps - 1)) * FOLLOWING_TILE + FOLLOWING_TILE / 2;
        from.y = player->wPos.y;
        from.z = (player->gPos.z + GetDirZ(dir) * (steps - 1)) * FOLLOWING_TILE + FOLLOWING_TILE / 2;
        if (ActorRouteCollCheckCore(player, &from, x, player->gPos.y, z, dir)) {
            return FALSE;
        }
    }
    at.x = x * FOLLOWING_TILE + FOLLOWING_TILE / 2;
    at.y = player->wPos.y;
    at.z = z * FOLLOWING_TILE + FOLLOWING_TILE / 2;
    return GetHeightFromMap(player, &at, height);
}

// The first step from the player in dir, whether it is open, and its world point
static BOOL IsStepOpen(FieldActor *actor, FieldActor *player, FieldPlayer *fieldPlayer, BOOL rail, u32 dir,
                       VecFx32 *at) {
    if (rail) {
        if (RailActor_GetHitBitsDirNoAttr(player, dir) & 3) {
            return FALSE;
        }
        FieldPlayer_GetWPosInDir(fieldPlayer, dir, at);
    } else {
        fx32 height;

        if (!IsTileOpen(player, 1, dir, &height)) {
            return FALSE;
        }
        at->x = player->wPos.x + GetDirX(dir) * FOLLOWING_TILE;
        at->y = height;
        at->z = player->wPos.z + GetDirZ(dir) * FOLLOWING_TILE;
    }
    return FollowingScene_IsStepClear(actor, at);
}

// Sows the trail along step toward the player and gives its pose. On a grid, a pose past the first tile needs the next
// tile open too, unless the follower stands on the step itself (loose) and is held there
static BOOL GetStepPose(FieldActor *actor, FieldActor *player, BOOL rail, u32 dir, const VecFx32 *step,
                        FollowingSample *pose, BOOL loose) {
    FollowingSample from;
    FollowingSample toward;
    VecFx32 at;

    GetPlayerSample(&toward);
    from = toward;
    from.x = step->x;
    from.y = step->y;
    from.z = step->z;
    toward.direction = (u8)(dir ^ 1);
    if (!FollowingTrail_ReseedAlong(&sFollower.trail, &from, &toward, GetWalkGaps(), pose)) {
        return FALSE;
    }
    if (!rail) {
        pose->y = step->y;
        if (loose) {
            return TRUE;
        }
        if (Following_Tile(pose->x) != Following_Tile(step->x) || Following_Tile(pose->z) != Following_Tile(step->z)) {
            fx32 height;

            if (!IsTileOpen(player, 2, dir, &height)) {
                return FALSE;
            }
            pose->y = height;
        }
    }
    if (loose) {
        return TRUE;
    }
    at.x = pose->x;
    at.y = pose->y;
    at.z = pose->z;
    return FollowingScene_IsStepClear(actor, &at);
}

// GetStepPose, then the ball's choice at the pose the follower would stand on: a large follower whose pose is under a
// floor comes out as the ball, posed again a tile away at the ball's zero gap
static BOOL GetPlacePose(FieldActor *actor, FieldActor *player, BOOL rail, u32 dir, const VecFx32 *step,
                         FollowingSample *pose, BOOL *ball) {
    if (!GetStepPose(actor, player, rail, dir, step, pose, FALSE)) {
        return FALSE;
    }
    if (*ball || !IsLargeActor(actor) || !IsUnderFloor(actor, pose)) {
        return TRUE;
    }
    *ball = TRUE;
    sShrink = FOLLOWING_MAX_DIRECTIONAL_GAP;
    return GetStepPose(actor, player, rail, dir, step, pose, FALSE);
}

static void SummonOut(FieldActor *actor, BOOL ball) {
    if (ball) {
        sHeld = TRUE;
        sHeldClear = 0;
        sBallOff = FALSE;
        sFollower.state = FOLLOWING_STATE_WAITING;
    } else {
        if (!FollowingEffects_IsAvailable()) {
            FollowingEffects_Prepare(actor);
        }
        FollowingEffects_Out(actor);
        sFollower.state = FOLLOWING_STATE_FOLLOWING;
    }
    NoteSettled();
}

static BOOL PlaceSummon(FieldActor *actor) {
    FieldActor *player = sPlayer;
    BOOL rail = IsOnRail();
    Field *field;
    FieldPlayer *fieldPlayer;
    FollowingSample pose;
    BOOL large;
    BOOL ball;
    VecFx32 step;
    u32 back;
    u32 i;

    // During the return's events the scene holds the waiting follower as paused
    if ((sFollower.state != FOLLOWING_STATE_WAITING &&
         !(sReturnSummon && sFollower.state == FOLLOWING_STATE_EVENT_PAUSED)) ||
        !(actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN) || sSwap.active || player->faceDir > DIR_RIGHT ||
        (!rail && !IsCentered(&player->wPos))) {
        return FALSE;
    }
    // The body's sheet and any running effect are waited for; the summon stays pending
    if (!IsBodySheetReady(actor) || FollowingEffects_IsBusy()) {
        return FALSE;
    }
    field = actor->actorSystem->field;
    fieldPlayer = field != NULL ? field->player : NULL;
    if (fieldPlayer == NULL) {
        return FALSE;
    }
    sSummon = FALSE;
    large = IsLargeActor(actor);
    ball = large && IsLargeBarred();
    // The ball keeps the tile behind; its gap is already walked to 0. Under a floor it is chosen at the follower's pose
    // (GetPlacePose)
    if (ball) {
        sShrink = FOLLOWING_MAX_DIRECTIONAL_GAP;
        FollowingTrail_Clear(&sFollower.trail);
    }
    if (!large && player->faceDir == DIR_DOWN) {
        for (i = 0; i < 2; i++) {
            u32 dir = DIR_LEFT + i;

            if (!IsStepOpen(actor, player, fieldPlayer, rail, dir, &step) ||
                !GetStepPose(actor, player, rail, dir, &step, &pose, TRUE)) {
                continue;
            }
            ClearEase();
            BindPose(actor, step.x, step.y, step.z, DIR_DOWN);
            sBeside.active = TRUE;
            sBeside.at = step;
            sBeside.last = BESIDE_START;
            SummonOut(actor, FALSE);
            return TRUE;
        }
    }
    back = player->faceDir ^ 1;
    if (IsStepOpen(actor, player, fieldPlayer, rail, back, &step) &&
        GetPlacePose(actor, player, rail, back, &step, &pose, &ball)) {
        ClearEase();
        BindPose(actor, pose.x, pose.y, pose.z, player->faceDir);
        SummonOut(actor, ball);
        return TRUE;
    }
    for (i = 0; i < 2; i++) {
        u32 dir = player->faceDir < DIR_LEFT ? DIR_LEFT + i : DIR_UP + i;

        if (!IsStepOpen(actor, player, fieldPlayer, rail, dir, &step) ||
            !GetPlacePose(actor, player, rail, dir, &step, &pose, &ball)) {
            continue;
        }
        ClearEase();
        BindPose(actor, pose.x, pose.y, pose.z, dir ^ 1);
        SummonOut(actor, ball);
        return TRUE;
    }
    FollowingTrail_Clear(&sFollower.trail);
    return FALSE;
}

// The follower's frame, as its actor's move: the trail's next pose, the swap, the stand beside, the ball and the
// summon
static void Move(FieldActor *actor) {
    BOOL paused;
    FollowingSample sample;
    FollowingSample target;
    u16 zoneBefore;
    u8 zoneValid;
    VecFx32 player;
    s32 result;
    VecFx32 next;

    if (actor != sFollower.actor || sPlayer == NULL || actor->actorSystem != sOwner) {
        return;
    }
    if (sFollower.state == FOLLOWING_STATE_INTERACTING) {
        actor->flags |= FOLLOWING_ACTOR_FLAG_PAUSE_ANIMATION;
        return;
    }
    paused = sFollower.state == FOLLOWING_STATE_EVENT_PAUSED;
    if (paused) {
        actor->flags |= FOLLOWING_ACTOR_FLAG_PAUSE_ANIMATION;
    }
    GetPlayerSample(&sample);
    zoneBefore = sTrailZone;
    zoneValid = sTrailZoneValid;
    if (!RebaseConnection(actor, NULL, &sample)) {
        actor->flags |= FOLLOWING_ACTOR_FLAG_HIDDEN;
        sFollower.state = FOLLOWING_STATE_WAITING;
        ClearSwap();
        ClearEase();
        DropSettled();
        GateAnimation(actor);
        return;
    }
    if (zoneValid && sPlayer->zoneId != zoneBefore) {
        ClearSwap();
        ClearEase();
        DropSettled();
    }
    player = sPlayer->wPos;
    if (paused) {
        ClearSwap();
        DropSettled();
    } else if (sSwap.active) {
        if (DriveSwap(actor, &sample, &player)) {
            return;
        }
    } else if (BeginSwap(actor, &sample, &player)) {
        return;
    }
    result = FollowingTrail_PushDirectional(&sFollower.trail, &sample, &target, GetWalkGaps());
    if (result < 0) {
        actor->flags |= FOLLOWING_ACTOR_FLAG_HIDDEN;
        sFollower.state = FOLLOWING_STATE_WAITING;
        ClearSwap();
        ClearEase();
        DropSettled();
        GateAnimation(actor);
        return;
    }
    // An event may own the sprite, but the route keeps the player's steps, or a short pause while running would grow
    // past a tile and the trail would drop. A pause and a full stop don't advance the ease, so a held gap stays put.
    // The return's summon is placed during its events and waits there with them; without an open tile it stays hidden
    // until they end and walks in
    if (paused) {
        if (sSummon && sReturnSummon && PlaceSummon(actor)) {
            sReturnHold = FALSE;
            FollowingScene_PauseAs(sFollower.state);
        }
        return;
    }
    if (sSummon && PlaceSummon(actor)) {
        if (sReturnSummon) {
            sReturnHold = FALSE;
            FollowingScene_PauseAs(sFollower.state);
        }
        GateAnimation(actor);
        return;
    }
    if (sFollower.state == FOLLOWING_STATE_FOLLOWING) {
        RevealFollower(actor);
    }
    if (result != 1) {
        StepBeside(actor);
        NoteSettled();
        GateAnimation(actor);
        return;
    }
    if (sEase.active) {
        if (sFollower.trail.count == 0) {
            ClearEase();
        } else {
            u32 step = Following_Travel(sEase.last.x, sEase.last.z, player.x, player.z);
            u32 traveled = sEase.traveled + step;

            if (traveled < sEase.traveled) {
                traveled = 0xffffffff;
            }
            sEase.last = player;
            // Past the travel's budget the push's output is the fresh load's rest, exactly
            if (traveled >= FOLLOWING_EASE_TRAVEL) {
                ClearEase();
            } else {
                u32 keep;
                FollowingSample posed;

                sEase.traveled = traveled;
                keep = Following_EaseKeep(traveled, FOLLOWING_EASE_TRAVEL, sEase.closeKeep, FOLLOWING_TILE);
                if (FollowingTrail_PoseBehind(&sFollower.trail, GetWalkGaps(), keep, &posed)) {
                    // A ledge or a stair's drop moves the eased pose more than a tile in one update and ends on the
                    // trail's ordinary pose. An incline climbs a little each update and keeps easing, though the player
                    // is soon more than a tile above or below the follower
                    s64 dy = (s64)posed.y - actor->wPos.y;

                    if (dy < 0) {
                        dy = -dy;
                    }
                    if (dy > FOLLOWING_TILE) {
                        ClearEase();
                    } else {
                        target.x = posed.x;
                        target.y = posed.y;
                        target.z = posed.z;
                    }
                }
            }
        }
    }
    HoldBeside(actor, &target);
    if (IsLargeHeld(actor, &target)) {
        VecFx32 ball;

        // The blocked step's recall. The trail keeps recording and the hidden actor keeps its pose, so a release or a
        // switch by L or R sends it out from there
        if (!(actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN) && sFollower.state == FOLLOWING_STATE_FOLLOWING) {
            FollowingEffects_Recall(actor);
        }
        actor->flags |= FOLLOWING_ACTOR_FLAG_HIDDEN;
        sFollower.state = FOLLOWING_STATE_WAITING;
        // The ball is on the trail, so an NPC stepping onto it takes it back as it would the follower. The trail
        // restarts and the ball comes back with it
        ball.x = target.x;
        ball.y = target.y;
        ball.z = target.z;
        if (!FollowingScene_IsStepClear(actor, &ball)) {
            if (!sBallOff && FollowingEffects_IsResting()) {
                FollowingEffects_RestRecall();
            }
            sBallOff = TRUE;
            FollowingTrail_Clear(&sFollower.trail);
            ClearEase();
            GateAnimation(actor);
            return;
        }
        sBallOff = FALSE;
        actor->wPos = ball;
        SetGrid(actor);
        SetActorFaceDir(actor, target.direction);
        FollowingRender_Anchor(actor, target.direction);
        GateAnimation(actor);
        NoteSettled();
        return;
    }
    next.x = target.x;
    next.y = target.y;
    next.z = target.z;
    if (!FollowingScene_IsStepClear(actor, &next)) {
        if (!(actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN)) {
            FollowingEffects_Recall(actor);
        }
        actor->flags |= FOLLOWING_ACTOR_FLAG_HIDDEN;
        sFollower.state = FOLLOWING_STATE_WAITING;
        FollowingTrail_Clear(&sFollower.trail);
        ClearEase();
        return;
    }
    actor->wPos = next;
    SetGrid(actor);
    SetActorFaceDir(actor, target.direction);
    FollowingRender_Anchor(actor, target.direction);
    actor->movementFlags &= ~FOLLOWING_ACTOR_MOVEMENT_UNREAD;
    if (sFollower.state != FOLLOWING_STATE_FOLLOWING) {
        // A send-out must have its ball: the banks are loaded now if nothing has
        if (!FollowingEffects_IsAvailable()) {
            FollowingEffects_Prepare(actor);
        }
        FollowingEffects_Out(actor);
    }
    RevealFollower(actor);
    sFollower.state = FOLLOWING_STATE_FOLLOWING;
    // The actors' movement dispatch belongs to a movement context that this actor doesn't have: on a grid follower it
    // reads the absent rail work and freezes the game, so the follower stays out of it
    GateAnimation(actor);
    NoteSettled();
}

static BOOL IsOwned(void) {
    FieldActor *actor = sFollower.actor;

    return actor != NULL && sOwner != NULL && actor >= sOwner->actorHeap &&
           actor < sOwner->actorHeap + sOwner->actorCapacity && (actor->flags & FOLLOWING_ACTOR_FLAG_USE) &&
           actor->actorSystem == sOwner && actor->moveCodeVTable == &sMoveCode;
}

static void CleanupKeepingTrail(BOOL keepTrail) {
    FollowingRender_ClearGrass();
    FollowingTalk_Cancel();
    FollowingAmbient_Reset();
    if (IsOwned()) {
        DeleteActor(sFollower.actor);
    }
    sFollower.actor = NULL;
    sPlayer = NULL;
    sFollower.state = FOLLOWING_STATE_ABSENT;
    sShownNow = sReveal = FALSE;
    if (!keepTrail) {
        FollowingTrail_Clear(&sFollower.trail);
        sTrailZoneValid = FALSE;
    }
    sTerrainActor = NULL;
    sCyclePending = FALSE;
    sBallOff = FALSE;
    sBeside.active = FALSE;
    ClearSwap();
    ClearEase();
    DropSettled();
    sSettled.x = sSettled.y = sSettled.z = 0;
}

static void Cleanup(void) {
    CleanupKeepingTrail(FALSE);
}

BOOL PaperWhite2_FollowingHoldsPlayer(void) {
    // Not a recall into the resting ball: that one rolls on with the player
    return FollowingEffects_IsRecalling() && GetRestBall() == NULL;
}

// The scene policy's recall. An application of the menu that keeps the field (the save) gives the follower back
// beside the player once the menu's events end, as one that closes the field does on the next
static void RecallForScene(void) {
    if (IsOwned() && !(sFollower.actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN)) {
        FollowingEffects_Recall(sFollower.actor);
    } else if (FollowingEffects_IsResting()) {
        FollowingEffects_RestRecall();
    }
    Cleanup();
    if (sOwner != NULL && IsChainOf(sOwner->field, IsMenuCallback)) {
        sSummon = TRUE;
        sSummonSeen = FALSE;
    }
}

static u16 Read16(const u8 *p) {
    return p[0] | (u16)p[1] << 8;
}

static Config *GetConfig(GameData *gameData) {
    SaveControl *save = gameData != NULL ? GameData_GetSaveControl(gameData) : NULL;

    return save != NULL ? (Config *)getTrainerDataBlkAddress(save) : NULL;
}

// The save's Followers Off choice, which the Options row writes. Zero keeps every save from before it as it was
static BOOL IsFollowersOff(GameData *gameData) {
    Config *config = GetConfig(gameData);

    return config != NULL && config->followersOff;
}

static void SetFollowersOff(GameData *gameData, BOOL off) {
    Config *config = GetConfig(gameData);

    if (config != NULL) {
        config->followersOff = off ? 1 : 0;
    }
}

// The registry's reader, through the field actors' open handle of ARCID_MMODEL_TBL
static BOOL ReadRegistry(void *context, u32 offset, void *dest, u32 size) {
    if (offset > sRegistrySize || size > sRegistrySize - offset) {
        return FALSE;
    }
    GFL_ArcToolReadRange(context, FOLLOWING_REGISTRY_FILE, offset, size, dest);
    return TRUE;
}

// Reads and checks the registry once a field, with the model table's count of rows, the graphics archive's count of
// files, and the registry's CRC-32 from the positioning table, which the packer writes with it. The original read
// those from native.bin, which checked an installer's files against each other
static BOOL LoadConfig(MMSys *system) {
    ArcTool *arc;
    u32 descriptors;
    u32 resources;
    u32 crc;
    FollowingRegistryInput input;
    BOOL ok;

    if (sConfigState != 0) {
        return sConfigState > 0;
    }
    sConfigState = -1;
    sPageCount = 0;
    if (!FOLLOWING_ENABLED || system == NULL || system->actorConfigArc == NULL || system->dataArc == NULL) {
        return FALSE;
    }
    arc = system->actorConfigArc;
    if (GFL_ArcToolGetDataMax(arc) <= FOLLOWING_REGISTRY_FILE || !FollowingPositioning_ReadRegistryCrc(arc, &crc)) {
        return FALSE;
    }
    // The model table starts with its count of rows
    GFL_ArcToolReadRange(arc, 0, 0, sizeof(descriptors), &descriptors);
    resources = GFL_ArcToolGetDataMax(system->dataArc);
    sRegistrySize = GFL_ArcToolGetDataLength(arc, FOLLOWING_REGISTRY_FILE);
    if (sRegistrySize < REGISTRY_HEADER_SIZE || sRegistrySize > REGISTRY_MAX || descriptors > 0xffff ||
        resources > 0xffff) {
        sRegistrySize = 0;
        return FALSE;
    }
    sRegistryCrc = crc;
    sDescriptorCount = (u16)descriptors;
    input.read = ReadRegistry;
    input.context = arc;
    input.page = sPage;
    input.index = sIndex;
    input.indexCount = FOLLOWING_MAX_SPECIES + 2;
    input.size = sRegistrySize;
    input.outerCrc = crc;
    input.descriptors = (u16)descriptors;
    input.resources = (u16)resources;
    input.count = 0;
    input.stride = 0;
    ok = FollowingRegistry_Stream(&input);
    sPageCount = 0;
    if (ok) {
        sStride = input.stride;
        FollowingEffects_SetResourceCount(resources);
        sConfigState = 1;
    } else {
        FollowingEffects_SetResourceCount(0);
        sRegistrySize = sStride = 0;
    }
    return ok;
}

// The follower code of a party member, from its species' rows of the registry: the best match of form, sex and
// shininess. Also sets the follower's side gap, its sprite's Y and its walking gaps. Only called when the choice or the
// appearance changes, never while moving or drawing
static u16 GetFollowerCode(MMSys *system, const FollowingPokemon *mon) {
    u32 first;
    u32 end;
    u16 fallback;
    s32 best;
    s32 artX;
    u32 i;
    u32 maximum;
    u32 gap;

    if (sConfigState != 1 || mon == NULL || mon->species == 0 || mon->species > FOLLOWING_MAX_SPECIES) {
        return 0;
    }
    first = sIndex[mon->species];
    end = sIndex[mon->species + 1];
    sFollower.sideGap = 0;
    sFollower.spriteY = 0;
    fallback = FOLLOWING_CODE_BASE;
    best = -100;
    artX = 0;
    for (i = first; i < end; i++) {
        const u8 *row;
        u32 species;
        u32 form;
        u32 gender;
        u32 shiny;
        u32 modelRow;
        u32 shown;
        s32 score;

        if (i < sPageFirst || i - sPageFirst >= sPageCount) {
            u32 n = FOLLOWING_REGISTRY_PAGE / sStride;

            if (n > end - i) {
                n = end - i;
            }
            sPageCount = 0;
            if (!ReadRegistry(system->actorConfigArc, REGISTRY_HEADER_SIZE + i * sStride, sPage, n * sStride)) {
                return 0;
            }
            sPageFirst = i;
            sPageCount = n;
        }
        row = sPage + (i - sPageFirst) * sStride;
        species = Read16(row);
        form = row[2];
        gender = row[3];
        shiny = row[4];
        modelRow = Read16(row + 6);
        if (species != mon->species) {
            sPageCount = 0;
            return 0;
        }
        shown = Following_DisplayForm(mon->species, mon->form);
        score = form == shown ? 8 : form == 0 ? 0 : -20;
        score += gender == mon->gender ? 4 : gender == 2 ? 2 : -20;
        score += shiny == mon->shiny ? 1 : -20;
        if (score > best) {
            best = score;
            fallback = (u16)(FOLLOWING_CODE_BASE + modelRow - FOLLOWING_STOCK_ROWS);
            sFollower.sideGap = row[15];
            sFollower.spriteY = (s8)row[13];
            artX = (s8)row[12];
        }
    }
    if (artX < 0) {
        artX = -artX;
    }
    maximum = artX < 10 ? 10 - (u32)artX : 0;
    gap = sFollower.sideGap + FOLLOWING_DEFAULT_SIDE_GAP_BONUS;
    if (gap > maximum) {
        gap = maximum;
    }
    if (gap > FOLLOWING_MAX_AUTHORED_GAP) {
        gap = FOLLOWING_MAX_AUTHORED_GAP;
    }
    for (i = 0; i < 4; i++) {
        sFollower.directionalGap[i] = (u8)gap;
    }
    if (first < end && fallback >= FOLLOWING_CODE_BASE) {
        u8 positions[FOLLOWING_POSITIONING_ROW_SIZE];

        if (FollowingPositioning_ReadLand(system->actorConfigArc, fallback - FOLLOWING_CODE_BASE,
                                          sDescriptorCount - FOLLOWING_STOCK_ROWS, sRegistryCrc, positions)) {
            u32 uniform = 0;

            for (i = 0; i < 4; i++) {
                if (positions[i] > uniform) {
                    uniform = positions[i];
                }
            }
            if (uniform > FOLLOWING_MAX_AUTHORED_GAP) {
                uniform = FOLLOWING_MAX_AUTHORED_GAP;
            }
            for (i = 0; i < 4; i++) {
                sFollower.directionalGap[i] = (u8)uniform;
            }
        }
    }
    return first < end ? fallback : 0;
}

// The party member that follows: the lead, or for direction (1 for L, -1 for R) the next from the current one, or the
// one that L or R chose while it can still follow. With snapshot, also what the talk's reactions read of it and of the
// player, but for the zone, which the talk adds
static BOOL SelectFollower(GameData *gameData, FollowingPokemon *out, s32 direction, s32 *chosenSlot,
                           FollowingReactionSnapshot *snapshot) {
    PokeParty *party = GameData_GetParty(gameData);
    u32 count;
    FollowingPokemon mons[FOLLOWING_PARTY_CAPACITY];
    s32 slot;
    PartyPkm *selected;
    u32 type1;
    u32 type2;
    u32 i;

    if (party == NULL) {
        return FALSE;
    }
    count = PokeParty_GetPkmCount(party);
    if (count > FOLLOWING_PARTY_CAPACITY) {
        return FALSE;
    }
    for (i = 0; i < count; i++) {
        PartyPkm *pkm = PokeParty_GetPkm(party, i);

        if (pkm == NULL) {
            return FALSE;
        }
        mons[i].species = PokeParty_GetParam(pkm, PKM_PARAM_SPECIES, NULL);
        mons[i].form = PokeParty_GetParam(pkm, PKM_PARAM_FORM, NULL);
        mons[i].gender = PokeParty_GetParam(pkm, PKM_PARAM_SEX, NULL);
        mons[i].egg = PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL);
        mons[i].hp = PokeParty_GetParam(pkm, PKM_PARAM_HP, NULL);
        mons[i].maxHp = PokeParty_GetParam(pkm, PKM_PARAM_MAX_HP, NULL);
        mons[i].personality = PokeParty_GetParam(pkm, PKM_PARAM_PID, NULL);
        mons[i].trainer = PokeParty_GetParam(pkm, PKM_PARAM_ID, NULL);
        mons[i].shiny = PokeParty_IsRare(pkm);
    }
    slot = FollowingParty_SelectSlot(mons, count);
    if (slot < 0) {
        return FALSE;
    }
    sLeadSlot = slot;
    if (direction != 0) {
        s32 current = -1;

        if (sFollower.hasSelection) {
            s32 hint = sFollower.slot;

            if (hint >= 0 && (u32)hint < count && FollowingPokemon_IsSame(&mons[hint], &sFollower.selected)) {
                current = hint;
            } else {
                for (i = 0; i < count; i++) {
                    if (FollowingPokemon_IsSame(&mons[i], &sFollower.selected)) {
                        current = (s32)i;
                        break;
                    }
                }
            }
        }
        slot = FollowingParty_CycleSlot(mons, count, current, direction);
    } else if (sFollower.slot >= 0 && sFollower.hasSelection) {
        s32 manual = -1;
        s32 hint = sFollower.slot;

        if ((u32)hint < count && FollowingPokemon_IsSame(&mons[hint], &sFollower.selected)) {
            manual = hint;
        } else {
            for (i = 0; i < count; i++) {
                if (FollowingPokemon_IsSame(&mons[i], &sFollower.selected)) {
                    manual = (s32)i;
                    break;
                }
            }
        }
        if (manual >= 0 && !mons[manual].egg && mons[manual].species != 0 &&
            mons[manual].species <= FOLLOWING_MAX_SPECIES && (mons[manual].hp != 0 || mons[slot].hp == 0)) {
            slot = manual;
            sFollower.slot = (s8)manual;
        } else {
            sFollower.slot = -1;
        }
    }
    if (slot < 0) {
        return FALSE;
    }
    *out = mons[slot];
    if (chosenSlot != NULL) {
        *chosenSlot = slot;
    }
    selected = PokeParty_GetPkm(party, slot);
    if (selected == NULL) {
        return FALSE;
    }
    type1 = PokeParty_GetParam(selected, PKM_PARAM_TYPE1, NULL);
    type2 = PokeParty_GetParam(selected, PKM_PARAM_TYPE2, NULL);
    sFlying = type1 == TYPE_FLYING || type2 == TYPE_FLYING;
    if (snapshot != NULL) {
        PlayerInfo *info;

        MI_CpuFill8(snapshot, 0, sizeof(*snapshot));
        snapshot->pokemon = *out;
        snapshot->friendship = (u8)PokeParty_GetParam(selected, PKM_PARAM_HAPPINESS, NULL);
        snapshot->status = PokeParty_GetParam(selected, PKM_PARAM_STATUS, NULL);
        snapshot->type1 = (u8)type1;
        snapshot->type2 = (u8)type2;
        PokeParty_GetParam(selected, PKM_PARAM_NICKNAME_RAW, snapshot->nickname);
        snapshot->nickname[NELEMS(snapshot->nickname) - 1] = 0xffff;
        info = GetGameDataPlayerInfo(gameData);
        if (info == NULL) {
            return FALSE;
        }
        for (i = 0; i < NELEMS(info->name); i++) {
            snapshot->playerName[i] = info->name[i];
        }
        snapshot->playerName[NELEMS(snapshot->playerName) - 1] = 0xffff;
    }
    return TRUE;
}

// The map's spawn has finished its actors and weather, and the entrance fade hasn't run, so binding the follower's
// sheet here is the game's own covered upload. The actor itself is built hidden by the field update and sent out
// with its ball once its trail is ready, as a map entry always was; a body created here appeared already out, with
// no send-out. A miss of the config on this first try is cleared, so the field update can try again. The emotes'
// sheets stay off this path
void PaperWhite2_FollowingPreloadFollower(Field *field, MMSys *system) {
    GameData *gameData;
    BOOL fresh;
    FollowingPokemon selected;
    s32 slot;
    u16 code;

    if (field == NULL || system == NULL) {
        return;
    }
    gameData = field->gameData;
    if (gameData == NULL || IsFollowersOff(gameData)) {
        return;
    }
    fresh = sConfigState == 0;
    if (!LoadConfig(system)) {
        if (fresh) {
            sConfigState = 0;
        }
        return;
    }
    // The effects' banks are uploaded here, the last field work before the entrance fade's picture is swapped, so the
    // write stays off the frames the fade shows. The first field update on this system then sees a new owner and keeps
    // these banks
    if (sOwner != system) {
        FollowingEffects_Destroy();
    }
    FollowingEffects_Warm(system);
    sWarmed = FollowingEffects_IsAvailable() ? system : NULL;
    slot = -1;
    if (!SelectFollower(gameData, &selected, 0, &slot, NULL)) {
        return;
    }
    code = GetFollowerCode(system, &selected);
    if (code == 0) {
        return;
    }
    FldActSys_LoadStaticBillboardActor(system, code);
}

static void CycleFollower(GameData *gameData) {
    u32 keys = GCTX_HIDGetPressedKeys() & (PAD_BUTTON_L | PAD_BUTTON_R);
    FieldActor *actor;
    BOOL barred;
    BOOL held;
    u8 oldFlying;
    u8 oldGap;
    u8 oldDirectional[4];
    s8 oldY;
    FollowingPokemon start;
    FollowingPokemon next;
    s8 startSlot;
    u8 startHas;
    s32 slot;
    BOOL refused;
    u16 code;
    FieldActor *keep;
    u32 i;

    // Both shoulders together have no direction
    if (keys != PAD_BUTTON_R && keys != PAD_BUTTON_L) {
        return;
    }
    if (!IsOwned() || sPlayer == NULL || FollowingTalk_IsActive() || FollowingEffects_IsBusy()) {
        return;
    }
    actor = sFollower.actor;
    // Where a large follower is barred, L or R brings out a small one, or the lead as its ball, and a large one in its
    // ball can still be switched out. Under a floor, L and R are locked while the ball waits on the trail
    barred = IsLargeBarred();
    if (!barred && GetRestBall() != NULL) {
        FollowingEffects_Cue(&actor->wPos);
        return;
    }
    held = barred && sHeld && IsLargeActor(actor) && (actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN) &&
           sFollower.state == FOLLOWING_STATE_WAITING;
    if (!held && (sFollower.state != FOLLOWING_STATE_FOLLOWING || (actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN))) {
        return;
    }
    FollowingEffects_Prepare(actor);
    // A switch must have its recall and send-out effects
    if (!FollowingEffects_IsAvailable()) {
        return;
    }
    oldFlying = sFlying;
    oldGap = sFollower.sideGap;
    for (i = 0; i < 4; i++) {
        oldDirectional[i] = sFollower.directionalGap[i];
    }
    oldY = sFollower.spriteY;
    start = sFollower.selected;
    startSlot = sFollower.slot;
    startHas = sFollower.hasSelection;
    slot = -1;
    refused = FALSE;
    code = 0;
    // SelectFollower steps from the current pick; a large one skipped becomes the pick for the next step. Six steps
    // cover the party
    for (i = 0; i < FOLLOWER_SELECT_STEPS; i++) {
        if (!SelectFollower(gameData, &next, keys == PAD_BUTTON_R ? 1 : -1, &slot, NULL)) {
            code = 0;
            break;
        }
        code = GetFollowerCode(sOwner, &next);
        if (code == 0 || !barred || slot == sLeadSlot || !IsCodeLarge(sOwner, code)) {
            break;
        }
        code = 0;
        refused = TRUE;
        if (startHas && FollowingPokemon_IsSame(&next, &start)) {
            break;
        }
        sFollower.selected = next;
        sFollower.slot = (s8)slot;
        sFollower.hasSelection = TRUE;
    }
    sFollower.selected = start;
    sFollower.slot = startSlot;
    sFollower.hasSelection = startHas;
    if (code == 0) {
        // GetFollowerCode also read a skipped row: the current one is read again
        if (refused && startHas) {
            GetFollowerCode(sOwner, &start);
        }
        sFollower.sideGap = oldGap;
        sFollower.spriteY = oldY;
        for (i = 0; i < 4; i++) {
            sFollower.directionalGap[i] = oldDirectional[i];
        }
        sFlying = oldFlying;
        if (refused) {
            FollowingEffects_Cue(&actor->wPos);
        }
        return;
    }
    sCyclePose = actor->wPos;
    sCycleFace = actor->faceDir;
    if (!held) {
        FollowingEffects_Snapshot(actor);
        FollowingEffects_Recall(actor);
    }
    keep = sPlayer;
    // The actor's delete function must keep the route
    sCyclePending = TRUE;
    CleanupKeepingTrail(TRUE);
    sPlayer = keep;
    sFollower.selected = next;
    sFollower.hasSelection = TRUE;
    sFollower.slot = (s8)slot;
    sCode = code;
    sCyclePending = TRUE;
    ClearRestore();
}

// While the switched follower's actor waits to be built, the player's steps still move its pose
static void TrackCycle(void) {
    FollowingSample sample;
    FollowingSample target;
    s32 step;

    if (!sCyclePending || sPlayer == NULL) {
        return;
    }
    GetPlayerSample(&sample);
    if (!RebaseConnection(NULL, &sCyclePose, &sample)) {
        sCyclePending = FALSE;
        return;
    }
    step = FollowingTrail_PushDirectional(&sFollower.trail, &sample, &target, GetWalkGaps());
    if (step < 0) {
        sCyclePending = FALSE;
        return;
    }
    if (step == 1) {
        sCyclePose.x = target.x;
        sCyclePose.y = target.y;
        sCyclePose.z = target.z;
        sCycleFace = target.direction;
    }
}

// SELECT turns the Followers setting on or off on the spot, from a free field only: no event, talk, fade, effect, ride
// or player's step. Off recalls a visible follower, or takes the resting ball, then removes it. On places the new
// follower beside the player with its send-out (PlaceSummon in Move)
static void ToggleBySelect(Field *field, BOOL ownTalk, BOOL paused, u32 *reason) {
    GameData *gameData;
    FieldPlayer *fieldPlayer;
    FieldActor *player;

    if (!(GCTX_HIDGetPressedKeys() & PAD_BUTTON_SELECT)) {
        return;
    }
    gameData = field->gameData;
    fieldPlayer = field->player;
    // No event: the original read the word at 0x18 of the GameData for it, where the game system has its event, which
    // in the GameData is a word of the player's saved state. The game system's event is what its other checks read
    if (gameData == NULL || fieldPlayer == NULL || ownTalk || paused || FollowingTalk_IsActive() ||
        FollowingEffects_IsBusy() || GSYS_GetNowEvent(field->gameSystem) != NULL || field->fadeFlag ||
        Field_IsEventRunning(field) || GameData_CheckPairFlag(gameData)) {
        return;
    }
    player = FieldPlayer_GetActor(fieldPlayer);
    if (player == NULL || !(player->flags & FOLLOWING_ACTOR_FLAG_USE) ||
        (player->flags & FOLLOWING_ACTOR_FLAG_HIDDEN) || (player->movementFlags & FOLLOWING_ACTOR_MOVEMENT_DISABLED) ||
        FieldPlayer_GetMoveObserveStatus(fieldPlayer) != PLAYER_OBSERVE_NONE ||
        FieldPlayer_GetExState(fieldPlayer) != 0) {
        return;
    }
    if (!IsFollowersOff(gameData)) {
        if (IsOwned()) {
            FieldActor *actor = sFollower.actor;

            if (!(actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN)) {
                FollowingEffects_Snapshot(actor);
                FollowingEffects_Recall(actor);
            } else if (FollowingEffects_IsResting()) {
                FollowingEffects_RestRecall();
            } else {
                GFL_SndSEPlay(SEQ_SE_BOWA2);
            }
        } else {
            GFL_SndSEPlay(SEQ_SE_BOWA2);
        }
        Cleanup();
        SetFollowersOff(gameData, TRUE);
        sSummon = FALSE;
        *reason |= REASON_OFF;
    } else {
        SetFollowersOff(gameData, FALSE);
        *reason &= ~REASON_OFF;
        sSummon = TRUE;
        sSummonSeen = TRUE;
        sSummonAt = player->wPos;
    }
}

// The follower's ball (a ball ID) for the effects. The party is read only when the pick changes, by personality and
// trainer, since the slot is -1 for an automatic lead. A recall that still runs keeps its old ball
static void SyncBall(GameData *gameData) {
    const FollowingPokemon *who = &sFollower.selected;
    PokeParty *party;
    u32 count;
    u32 ball;
    u32 i;

    if (gameData == NULL || !sFollower.hasSelection) {
        return;
    }
    if (sBallKnown && sBallWho == who->personality && sBallTrainer == who->trainer) {
        return;
    }
    party = GameData_GetParty(gameData);
    if (party == NULL) {
        return;
    }
    count = PokeParty_GetPkmCount(party);
    ball = 0;
    for (i = 0; i < count && i < FOLLOWING_PARTY_CAPACITY; i++) {
        PartyPkm *pkm = PokeParty_GetPkm(party, i);

        if (pkm != NULL && PokeParty_GetParam(pkm, PKM_PARAM_PID, NULL) == who->personality &&
            PokeParty_GetParam(pkm, PKM_PARAM_ID, NULL) == who->trainer) {
            ball = PokeParty_GetParam(pkm, PKM_PARAM_POKEBALL, NULL);
            break;
        }
    }
    sBallWho = who->personality;
    sBallTrainer = who->trainer;
    sBallKnown = TRUE;
    FollowingEffects_SetBall(ball);
}

// Before the actors' update: the field's checks, the choice of the follower, its actor's creation, and L and R
static void UpdateBefore(MMSys *system) {
    Field *field;
    BOOL ownTalk;
    u32 eventState;
    BOOL paused;
    u32 reason;
    FieldActor *actor;

    FollowingTalk_PollInput();
    sTick++;
    if (sOwner != system) {
        FollowingPokemon manual = sFollower.selected;
        s32 manualSlot = sFollower.slot;
        BOOL keepManual = sOwner != NULL && sFollower.hasSelection && manualSlot >= 0;
        FollowingSummon request;

        FollowingScene_Detach();
        Cleanup();
        FollowingTalk_Unload();
        if (system != sWarmed) {
            FollowingEffects_Destroy();
        }
        sWarmed = NULL;
        sOwner = system;
        sSummonSeen = FALSE;
        sSummon = sReturnSummon = sReturnHold = sMenuSession = FALSE;
        if (PaperWhite2_FollowingTokenConsume(FOLLOWING_TOKEN_SUMMON, &request, sizeof(request))) {
            BOOL here = request.source != FOLLOWING_SUMMON_BOOT && IsSummonOrigin(system->field, &request);

            // A menu's request also stands after the warp of a field move or item it started, which lands elsewhere
            sSummon = request.source != FOLLOWING_SUMMON_BATTLE || here;
            sReturnSummon = here;
            sMenuSession = request.source == FOLLOWING_SUMMON_MENU;
        }
        Following_Init(&sFollower, ++sGeneration);
        if (keepManual) {
            sFollower.selected = manual;
            sFollower.slot = (s8)manualSlot;
            sFollower.hasSelection = TRUE;
        }
        sEventsReady = FollowingScene_Attach(system, &sFollower, sGeneration, RecallForScene);
        if (sReturnSummon && !(sEventsReady && FollowingScene_BeginReturn())) {
            sReturnSummon = FALSE;
        }
        ClearRestore();
        if (system != NULL && system->field != NULL && IsFollowersOff(system->field->gameData)) {
            FollowingEvents_Discard();
        } else if (sEventsReady) {
            FollowingScene_TakeRestore(&sRestore);
        }
    }
    field = system->field;
    if (field != NULL) {
        SyncBall(field->gameData);
        if (GSYS_GetNowEvent(field->gameSystem) == NULL) {
            sMenuSession = FALSE;
        }
    }
    if (FollowingTalk_IsActive() && !FollowingTalk_Owns(field)) {
        FollowingTalk_Cancel();
    }
    ownTalk = FollowingTalk_FieldOwns(field);
    eventState = FollowingScene_Poll();
    if (eventState == FOLLOWING_SCENE_INVALID) {
        sEventsReady = FALSE;
    }
    paused = eventState == FOLLOWING_SCENE_PAUSED;
    reason = 0;
    if (!LoadConfig(system)) {
        reason |= REASON_CONFIG;
    }
    if (field != NULL && IsFollowersOff(field->gameData)) {
        reason |= REASON_OFF;
    }
    if (!sEventsReady) {
        reason |= REASON_EVENTS_BRIDGE;
    }
    if (eventState == FOLLOWING_SCENE_RECALLED) {
        reason |= REASON_SCENE;
    }
    if (field == NULL || (system->flags & SYSTEM_FLAGS_RUNNING) != SYSTEM_FLAGS_RUNNING ||
        (system->flags & SYSTEM_FLAGS_STOPPED)) {
        reason |= REASON_FIELD;
    }
    if (!(reason & ~REASON_OFF)) {
        ToggleBySelect(field, ownTalk, paused, &reason);
    }
    if (reason == 0) {
        FieldPlayer *fieldPlayer = field->player;
        GameData *gameData = field->gameData;

        sPlayer = fieldPlayer != NULL ? FieldPlayer_GetActor(fieldPlayer) : NULL;
        FollowingScene_SetPlayer(sPlayer);
        // Judged once no event holds the field, so a warp's arrival script has already moved the player; a return's
        // summon was judged on the field's first frame and may already be placed (Move)
        if (sSummon && sPlayer != NULL && !paused) {
            VecFx32 at = sPlayer->wPos;

            if (!sSummonSeen) {
                sSummonSeen = TRUE;
                sSummonAt = at;
            } else if (at.x != sSummonAt.x || at.y != sSummonAt.y || at.z != sSummonAt.z) {
                sSummon = FALSE;
            }
        }
        if (!paused) {
            sReturnSummon = sReturnHold = FALSE;
        }
        if (sPlayer == NULL || !(sPlayer->flags & FOLLOWING_ACTOR_FLAG_USE) ||
            (sPlayer->flags & FOLLOWING_ACTOR_FLAG_HIDDEN) ||
            ((sPlayer->movementFlags & FOLLOWING_ACTOR_MOVEMENT_DISABLED) && !ownTalk && !paused)) {
            reason |= REASON_PLAYER;
        }
        if (fieldPlayer != NULL && FieldPlayer_GetExState(fieldPlayer) != 0) {
            reason |= REASON_EX_STATE;
        }
        if ((Field_IsEventRunning(field) && !ownTalk && !paused) ||
            (field->fadeFlag && !FollowingScene_IsPcFade() && !FollowingScene_IsBattleEntry())) {
            reason |= REASON_EVENT;
        }
        if (GameData_CheckPairFlag(gameData)) {
            reason |= REASON_PAIR;
        }
        if (reason == 0 && !ownTalk &&
            (!paused || sRestore.magic == FOLLOWING_RESTORE_MAGIC || (sSummon && sReturnSummon)) &&
            (sFollower.actor == NULL || sTick % 30 == 0 || (eventState & FOLLOWING_SCENE_REFRESH))) {
            FollowingPokemon selected;

            if (!SelectFollower(gameData, &selected, 0, NULL, NULL)) {
                reason |= REASON_SELECTION;
            } else if (!sFollower.hasSelection || !FollowingPokemon_IsSame(&selected, &sFollower.selected)) {
                u16 code = GetFollowerCode(system, &selected);

                if (code == 0) {
                    reason |= REASON_CONFIG;
                    sConfigState = -1;
                } else {
                    FieldActor *keep = sPlayer;

                    Cleanup();
                    sPlayer = keep;
                    sFollower.selected = selected;
                    sFollower.hasSelection = TRUE;
                    sCode = code;
                }
            }
        }
        if (reason == 0 && !ownTalk && !paused && !FollowingTalk_IsActive()) {
            CycleFollower(gameData);
        }
    }
    sReason = reason;
    if (reason != 0) {
        if (sEventsReady) {
            FollowingEvents_Discard();
        }
        ClearRestore();
        FollowingTalk_Cancel();
        if (!(reason & REASON_OFF) && (reason & REASON_EVENT)) {
            FollowingEffects_Warm(system);
        }
        if (IsOwned() && !(sFollower.actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN) &&
            (reason & (REASON_EX_STATE | REASON_EVENT | REASON_PAIR))) {
            FollowingEffects_Recall(sFollower.actor);
        } else if (sFollower.actor != NULL) {
            FollowingEffects_Cancel();
        }
        Cleanup();
        return;
    }
    if (sFollower.actor != NULL && !IsOwned()) {
        sFollower.actor = NULL;
        FollowingTrail_Clear(&sFollower.trail);
        ClearEase();
    }
    // Only a matching return from the PC's storage, or the return's summon, may build the follower again during a
    // paused event
    if (paused && sRestore.magic != FOLLOWING_RESTORE_MAGIC && !(sSummon && sReturnSummon)) {
        return;
    }
    if (sRestore.magic == FOLLOWING_RESTORE_MAGIC &&
        (!FollowingPokemon_IsSame(&sRestore.selected, &sFollower.selected) || sRestore.zone != sPlayer->zoneId ||
         sRestore.player.x != sPlayer->wPos.x || sRestore.player.y != sPlayer->wPos.y ||
         sRestore.player.z != sPlayer->wPos.z)) {
        ClearRestore();
    }
    if (paused && sRestore.magic != FOLLOWING_RESTORE_MAGIC && !(sSummon && sReturnSummon)) {
        return;
    }
    if (sFollower.actor == NULL) {
        u32 freeActors;
        u32 uid;
        u32 i;

        if (FollowingEffects_IsBusy()) {
            TrackCycle();
            return;
        }
        freeActors = 0;
        for (i = 0; i < system->actorCapacity; i++) {
            if (!(system->actorHeap[i].flags & FOLLOWING_ACTOR_FLAG_USE)) {
                freeActors++;
            }
        }
        if (freeActors < FREE_ACTORS_KEPT) {
            sReason = REASON_ACTORS;
            return;
        }
        for (uid = FOLLOWER_UID_FIRST; uid <= FOLLOWER_UID_LAST; uid++) {
            for (i = 0; i < system->actorCapacity; i++) {
                if ((system->actorHeap[i].flags & FOLLOWING_ACTOR_FLAG_USE) && system->actorHeap[i].uid == uid) {
                    break;
                }
            }
            if (i == system->actorCapacity) {
                break;
            }
        }
        if (uid > FOLLOWER_UID_LAST) {
            sReason = REASON_UID;
            return;
        }
        if (GFL_HeapGetFreeSize(system->fieldHeapId) < FREE_HEAP_KEPT) {
            sReason = REASON_HEAP;
            return;
        }
        actor = CreateNewActorByParam(system, sPlayer->gPos.x, sPlayer->gPos.z, sPlayer->faceDir, uid, sCode, 0,
                                      sPlayer->zoneId);
        if (actor == NULL) {
            return;
        }
        actor->flags |= FOLLOWING_ACTOR_FLAG_HIDDEN | FOLLOWING_ACTOR_FLAG_NOT_BLOCKING |
                        FOLLOWING_ACTOR_FLAG_NOT_QUERIED | FOLLOWING_ACTOR_FLAG_KEEP_ZONE;
        actor->movementFlags |= FOLLOWING_ACTOR_MOVEMENT_ATTR_EFFECT_OFF | FOLLOWING_ACTOR_MOVEMENT_LANDING_DUST_OFF;
        actor->movementFlags &= ~(FOLLOWING_ACTOR_MOVEMENT_DISABLED | FOLLOWING_ACTOR_MOVEMENT_UNREAD);
        actor->moveCodeVTable = &sMoveCode;
        actor->wPos = sPlayer->wPos;
        FollowingRender_Anchor(actor, sPlayer->faceDir);
        sFollower.actor = actor;
        sFollower.state = FOLLOWING_STATE_WAITING;
        if (sCyclePending) {
            BOOL ball;
            FollowingSample posed;
            VecFx32 at;

            sCyclePending = FALSE;
            // The kept trail was summed under the old follower's gaps. It is summed again under the new one's (a
            // 64-pixel bonus, or the ball's zero gap) and the new follower stands on its own pose, so the distance is
            // right at once rather than after the player's next turn
            ball = IsLargeKept(actor);
            sShrink = ball ? FOLLOWING_MAX_DIRECTIONAL_GAP : 0;
            FollowingTrail_Remeasure(&sFollower.trail, GetWalkGaps());
            at = sCyclePose;
            if (sFollower.trail.count != 0 &&
                FollowingTrail_PoseBehind(&sFollower.trail, GetWalkGaps(), FOLLOWING_TILE, &posed)) {
                VecFx32 own;

                own.x = posed.x;
                own.y = posed.y;
                own.z = posed.z;
                if (FollowingScene_IsStepClear(actor, &own)) {
                    at = own;
                }
            }
            if (FollowingScene_IsStepClear(actor, &at)) {
                BindPose(actor, at.x, at.y, at.z, sCycleFace);
                actor->initGPos = actor->gPos;
                if (ball) {
                    // The lead switched to indoors comes out as its closed ball, with one bounce; Move keeps it on the
                    // trail
                    sHeld = TRUE;
                    sHeldClear = COVER_CLEAR;
                    sBallOff = FALSE;
                    sFollower.state = FOLLOWING_STATE_WAITING;
                    FollowingEffects_RestBounce();
                } else {
                    FollowingEffects_Out(actor);
                    RevealFollower(actor);
                    sFollower.state = FOLLOWING_STATE_FOLLOWING;
                }
            }
        } else if (sRestore.magic == FOLLOWING_RESTORE_MAGIC && sRestore.zone == sPlayer->zoneId &&
                   sRestore.player.x == sPlayer->wPos.x && sRestore.player.y == sPlayer->wPos.y &&
                   sRestore.player.z == sPlayer->wPos.z) {
            actor->wPos = sRestore.follower;
            actor->gPos.x = actor->initGPos.x = sRestore.grid[0];
            actor->gPos.y = actor->initGPos.y = sRestore.grid[1];
            actor->gPos.z = actor->initGPos.z = sRestore.grid[2];
            SetActorFaceDir(actor, sRestore.face);
            FollowingRender_Anchor(actor, sRestore.face);
            RevealFollower(actor);
            sFollower.state = FOLLOWING_STATE_FOLLOWING;
            FollowingScene_PauseAs(FOLLOWING_STATE_FOLLOWING);
        } else if (paused && sSummon && sReturnSummon) {
            // Hidden until Move places it. The events' end gives it back as waiting
            sReturnHold = TRUE;
            FollowingScene_PauseAs(FOLLOWING_STATE_WAITING);
        }
        ClearRestore();
    }
}

static void UpdateTerrain(void) {
    FieldActor *actor;
    FieldEffects *effects;
    VecFx32 center;
    u32 tile;
    BOOL found;
    ActorTerrainEffectParam param;

    if (!IsOwned()) {
        sTerrainActor = NULL;
        sShaded = FALSE;
        sTerrainTile = TILE_TYPE_NONE;
        return;
    }
    actor = sFollower.actor;
    if ((actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN) || sFlying) {
        if (actor->movementFlags & FOLLOWING_ACTOR_MOVEMENT_SPLASHED) {
            FldAct_SetSplashed(actor, FALSE);
        }
        sTerrainActor = NULL;
        sShaded = FALSE;
        sTerrainTile = TILE_TYPE_NONE;
        return;
    }
    // The actor's field effects, as the actors' own grass reads them (FldAct_GetFieldEffects). The tile's query is
    // apart from the rail movement's dispatch, which reads this actor's absent rail work
    effects = Field_GetFieldEffects(GetMMSysField(GetActorMModelSystem(actor)));
    if (effects == NULL) {
        return;
    }
    if (actor == sTerrainActor && effects == sTerrainEffects && actor->gPos.x == sTerrainX &&
        actor->gPos.z == sTerrainZ && actor->zoneId == sTerrainZone) {
        return;
    }
    center.x = actor->gPos.x * FOLLOWING_TILE + FOLLOWING_TILE / 2;
    center.y = actor->wPos.y;
    center.z = actor->gPos.z * FOLLOWING_TILE + FOLLOWING_TILE / 2;
    // A tile without a mark reports no type. The shallow water's effect still runs, so it clears its bit and ends the
    // splash attached to the actor
    tile = 0;
    found = GetTileTypeAtPosByActor(actor, &center, &tile);
    sShaded = found && tile != TILE_TYPE_NONE && (GetTileFlags(tile) & TILE_FLAG_SHADE);
    sTerrainTile = found ? tile : TILE_TYPE_NONE;
    sTerrainActor = actor;
    sTerrainEffects = effects;
    sTerrainX = actor->gPos.x;
    sTerrainZ = actor->gPos.z;
    sTerrainZone = actor->zoneId;
    // The shallow water's effect reads only the tile's class and the field effects. It owns the splash that follows the
    // actor and its bit; unlike the movement's dispatch, it doesn't read the rail work
    MI_CpuFill8(&param, 0, sizeof(param));
    param.tileClass = (u16)tile;
    param.effects = effects;
    ActorTerrainEffect_Splash(actor, &param);
    // Grass stays an effect of entering, once a tile crossed
    if (tile != TILE_TYPE_NONE && (GetTileFlags(tile) & TILE_FLAG_GRASS)) {
        PaperWhite2_FldActEnterGrass(actor, tile);
    }
}

void PaperWhite2_FollowingUpdate(MMSys *system) {
    FollowingEffects_Tick();
    UpdateBefore(system);
    FldActSys_Update(system);
    UpdateTerrain();
    if (IsOwned()) {
        FieldActor *actor = sFollower.actor;
        BOOL shown;
        BOOL firstBody;

        // Move can run before the material's loading writes the billboard's handle. Here the hidden flag clears on the
        // frame that handle becomes real. The VBlank task owns the upload, which isn't finished here
        if ((actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN) && !sReturnHold &&
            (sFollower.state == FOLLOWING_STATE_FOLLOWING || sFollower.state == FOLLOWING_STATE_EVENT_PAUSED)) {
            RevealFollower(actor);
        }
        // The actor's move writes its coordinates itself, so the actors' attribute pass at a move's start never
        // registers its shadow: the game's shadow helper owns the effect's task, billboard, visibility and teardown.
        // The body's first frame is its billboard alone. The shadow's task and a repeated bind of the sheet wait until
        // the next update. The entrance's upload itself is the map spawn's hook; the effects' preparation returns once
        // that sheet is bound
        shown = !(actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN);
        firstBody = shown && !sShownNow;
        sReveal = firstBody;
        if (shown && !firstBody && sPlayer != NULL && (sPlayer->movementFlags & FOLLOWING_ACTOR_MOVEMENT_SHADOW_SET) &&
            !(sPlayer->movementFlags & FOLLOWING_ACTOR_MOVEMENT_SHADOW_HIDDEN) &&
            !(actor->movementFlags & FOLLOWING_ACTOR_MOVEMENT_SHADOW_SET)) {
            PaperWhite2_FldActEnsureShadow(actor);
        }
        // A hidden door's actor isn't on screen yet. Binding its sheet on the frame the world comes back, or on the
        // body's first frame, is the line on the screen
        if (shown && !firstBody) {
            FollowingEffects_Prepare(actor);
            FollowingEffects_Snapshot(actor);
        }
    }
    // Its steps count while it walks behind the player or waits as its resting ball, and its ambient emotes show while
    // it is out
    FollowingAmbient_Update(
        system->field, IsOwned() ? sFollower.actor : NULL, sPlayer, &sFollower.selected,
        IsOwned() && sReason == 0 && sFollower.hasSelection &&
            (sFollower.state == FOLLOWING_STATE_FOLLOWING || (sFollower.state == FOLLOWING_STATE_WAITING && sHeld)),
        IsOwned() && sFollower.state == FOLLOWING_STATE_FOLLOWING &&
            !(sFollower.actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN));
    FollowingEffects_RestAt(GetRestBall());
    GapRamp();
}

BOOL FollowingField_IsFirstBody(void) {
    return sReveal;
}

BOOL FollowingField_IsShaded(void) {
    return sShaded;
}

void PaperWhite2_FollowingDraw(BillboardActorSys *system, G3DCamera *camera, G3DLight *lights) {
    sShownNow = IsOwned() && !(sFollower.actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN);
    FollowingRender_Draw(system, camera, lights, IsOwned() ? sFollower.actor : NULL, sPlayer, sFollower.spriteY,
                         FollowingField_IsShaded(), FollowingEffects_CoversBody());
}

void PaperWhite2_FollowingEffectsDraw(BillboardActorSys *system, G3DCamera *camera, G3DLight *lights) {
    // The shadows are the engine's, the follower's oval too
    BillboardActorSys_Draw(system, camera, lights);
    // The body as this frame drew it, for a silhouette that starts or grows from it
    if (sShownNow && IsOwned()) {
        FollowingEffects_Snapshot(sFollower.actor);
    }
    FollowingEffects_SetPlayer(sPlayer != NULL && !(sPlayer->flags & FOLLOWING_ACTOR_FLAG_HIDDEN) ? sPlayer : NULL);
    FollowingEffects_Draw(camera, lights);
}

void PaperWhite2_FollowingTerrainDraw(BillboardActorSys *system, G3DCamera *camera, G3DLight *lights) {
    FollowingRender_GrassDraw(system, camera, lights, IsOwned() ? sFollower.actor : NULL);
}

// The events of the chain that closes the field, from the one running up through its parents
#define CHAIN_DEPTH 16

// The field menu's chain of events leaving the field for an application: EventFieldMenu_Callback, the
// EventFieldAppCall_Callback it chains, or the menu's return; the Y button's shortcut menu chains the same application
// call. The scene policy recalls the follower for that application before this unload, so the menu's marker and the
// actor are both gone by then; the chain isn't
static BOOL IsMenuCallback(GameEventCallback callback) {
    return callback == EventFieldMenu_Callback || callback == EventFieldAppCall_Callback ||
           PaperWhite2_IsFieldMenuReturnCallback(callback);
}

// A battle's chain: the wild battle's event or the battle call that every wild, trainer and scripted battle runs,
// whether or not the follower was carried into it
static BOOL IsBattleCallback(GameEventCallback callback) {
    return PaperWhite2_IsWildBattleCallCallback(callback) || PaperWhite2_IsBattleCallCallback(callback);
}

static BOOL IsChainOf(Field *field, BOOL (*isEvent)(GameEventCallback callback)) {
    GameSystem *gsys = field != NULL ? field->gameSystem : NULL;
    GameEvent *event = gsys != NULL ? GSYS_GetNowEvent(gsys) : NULL;
    u32 depth;

    for (depth = 0; event != NULL && depth < CHAIN_DEPTH; depth++, event = event->parent) {
        if (event->gsys != gsys) {
            return FALSE;
        }
        if (isEvent(event->callback)) {
            return TRUE;
        }
    }
    return FALSE;
}

// Whether the field that request was stored for is back, in the same zone and on the same tile: a menu's or a
// battle's return, and not a warp's. A rail's player is placed again from its rail position, so the tile is compared
// rather than the exact point
static BOOL IsSummonOrigin(Field *field, const FollowingSummon *request) {
    FieldActor *player = field != NULL && field->player != NULL ? FieldPlayer_GetActor(field->player) : NULL;

    return player != NULL && field->zoneId == request->zone &&
           Following_Tile(player->wPos.x) == Following_Tile(request->x) &&
           Following_Tile(player->wPos.z) == Following_Tile(request->z);
}

void PaperWhite2_FollowingUnload(GameSystem *gsys, Field *field) {
    // Only a menu's application, a warp that a menu started, or a battle closing the field places the follower on the
    // next field; every other map change goes through this same unload and keeps the walk-in. A battle arms when the
    // follower was out as it began, or Followers are off (SELECT or the Options turn them on later)
    FieldPlayer *fieldPlayer = field != NULL ? field->player : NULL;
    FieldActor *player = fieldPlayer != NULL ? FieldPlayer_GetActor(fieldPlayer) : NULL;
    BOOL menu = FollowingScene_IsMenuActive() || IsChainOf(field, IsMenuCallback) ||
                (sMenuSession && GSYS_GetNowEvent(gsys) != NULL);
    BOOL battle = !menu && IsChainOf(field, IsBattleCallback);
    BOOL arm = player != NULL &&
               (menu || (battle && (IsOwned() || FollowingScene_WasOut() || IsFollowersOff(field->gameData))));
    FollowingSummon request;

    request.source = menu ? FOLLOWING_SUMMON_MENU : FOLLOWING_SUMMON_BATTLE;
    request.zone = field != NULL ? field->zoneId : 0;
    request.x = player != NULL ? player->wPos.x : 0;
    request.z = player != NULL ? player->wPos.z : 0;
    // A map change consumes any older request, so it can't carry over
    if (arm) {
        PaperWhite2_FollowingTokenStore(FOLLOWING_TOKEN_SUMMON, &request, sizeof(request));
    } else {
        PaperWhite2_FollowingTokenConsume(FOLLOWING_TOKEN_SUMMON, &request, sizeof(request));
    }
    sSummon = sReturnSummon = sReturnHold = sMenuSession = FALSE;
    FollowingScene_Detach();
    sEventsReady = FALSE;
    Cleanup();
    FollowingTalk_Unload();
    FollowingEffects_Destroy();
    FollowingEffects_SetResourceCount(0);
    sPageCount = sStride = 0;
    sOwner = NULL;
    sConfigState = 0;
    sRegistrySize = 0;
}

// The field's own events come first. A in front of the follower, with the player standing and nothing else running,
// talks to it
static GameEvent *TryTalk(GameSystem *gsys, Field *field) {
    FieldPlayer *fieldPlayer;
    u32 status;
    FollowingPokemon selected;
    FollowingReactionSnapshot snapshot;

    if (!IsOwned() || sOwner->field != field || FollowingTalk_IsActive() || sPlayer == NULL ||
        sFollower.state != FOLLOWING_STATE_FOLLOWING || sReason != 0) {
        return NULL;
    }
    if (!(GCTX_HIDGetPressedKeys() & PAD_BUTTON_A) || field->fadeFlag) {
        return NULL;
    }
    fieldPlayer = field->player;
    if (fieldPlayer == NULL) {
        return NULL;
    }
    status = FieldPlayer_GetMoveObserveStatus(fieldPlayer);
    if (status != PLAYER_OBSERVE_NONE && status != PLAYER_OBSERVE_END) {
        return NULL;
    }
    if (FieldPlayer_GetExState(fieldPlayer) != 0) {
        return NULL;
    }
    if (!SelectFollower(field->gameData, &selected, 0, NULL, &snapshot) ||
        !FollowingPokemon_IsSame(&selected, &sFollower.selected)) {
        return NULL;
    }
    snapshot.zone = field->zoneId;
    snapshot.direction = (u8)(sPlayer->faceDir ^ 1);
    return FollowingTalk_Begin(&sFollower, sPlayer, sFollower.actor, field, gsys, &snapshot);
}

GameEvent *PaperWhite2_FollowingGridEvent(GameSystem *gsys, Field *field, GameEvent *event, BOOL *scriptCalled,
                                          BOOL menuOpened) {
    if (event != NULL) {
        if (menuOpened) {
            FollowingScene_MarkMenu(event);
        }
        return event;
    }
    event = TryTalk(gsys, field);
    if (event != NULL) {
        *scriptCalled = TRUE;
    }
    return event;
}

GameEvent *PaperWhite2_FollowingRailEvent(GameSystem *gsys, Field *field, GameEvent *event) {
    return event != NULL ? event : TryTalk(gsys, field);
}

u32 PaperWhite2_FollowingGetTile(void) {
    if (!sFollower.hasSelection || sFollower.state == FOLLOWING_STATE_ABSENT) {
        return TILE_TYPE_NONE;
    }
    return sTerrainTile;
}

BOOL PaperWhite2_FollowingGetSelection(FollowingPokemon *pokemon, FieldActor **actor) {
    if (!sFollower.hasSelection) {
        return FALSE;
    }
    *pokemon = sFollower.selected;
    *actor = IsOwned() ? sFollower.actor : NULL;
    return TRUE;
}

u16 PaperWhite2_FollowingGetSpecies(void) {
    if (!sFollower.hasSelection || sFollower.state == FOLLOWING_STATE_ABSENT) {
        return 0;
    }
    return sFollower.selected.species;
}
