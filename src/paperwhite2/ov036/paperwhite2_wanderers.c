#include "types.h"
#include "constants/directions.h"
#include "constants/flags.h"
#include "constants/pokemon.h"
#include "constants/sound.h"
#include "field/enc_pokeset.h"
#include "field/event_wild_battle.h"
#include "field/field.h"
#include "field/field_actor.h"
#include "field/field_actor_drawdata.h"
#include "field/field_effect.h"
#include "field/field_g3d_mapper.h"
#include "field/field_internal.h"
#include "field/field_map.h"
#include "field/field_player.h"
#include "field/player_state.h"
#include "gfl/billboard_actor.h"
#include "gfl/random.h"
#include "gfl/sound.h"
#include "nitro/fx.h"
#include "nitro/mi.h"
#include "paperwhite2/encounters.h"
#include "paperwhite2/following_field.h"
#include "paperwhite2/wanderers.h"
#include "pml/poke_party.h"
#include "save/encounter.h"
#include "save/event_work.h"
#include "save/save_control.h"
#include "system/game_data.h"
#include "system/game_event.h"
#include "system/game_system.h"

// Paper White 2: the wanderers (paperwhite2/wanderers.h; docs/paperwhite2/plugins.md, Wanderers;
// docs/paperwhite2/design/overworld-editor.md, Overworld encounters). Every few seconds while fewer than WANDERERS_MAX
// are out, one rises out of a grass tile near the screen's edge, away from the player: the Pokémon a step in that grass
// would bring (EventWildBattleCall_PickWanderer), drawn with its follower sprite, shiny or of its gender as it was
// rolled. It wanders tile to tile in grass of the same kind with pauses, and sinks back into it after its time, or goes
// once it's far out of view. A wanderer is solid: an actor's step onto its tile, or the one it walks to, is blocked
// (PaperWhite2_WanderersCheckGridCollision), and the player's touches it, as one stepping into the player does. A
// touch, once the player is free, faces the two to each other, plays its cry and starts the single battle with it.
// They're drawn as the ambients are, billboards of the actor system's sprite cache without an actor; a battle or a
// menu tears the field down, and they start again from none

// The field's frames a second
#define WANDERER_FRAMES_A_SECOND 30
// How long one takes to rise and to sink, and how deep it starts, in units
#define WANDERER_RISE_FRAMES 12
#define WANDERER_RISE_DEPTH FX32_CONST(20)
// A tile's walk, and a pause between steps (from MIN, up to MIN + SPAN)
#define WANDERER_WALK_FRAMES 12
#define WANDERER_PAUSE_MIN 20
#define WANDERER_PAUSE_SPAN 60
// An aggressive one's: how near the player it notices it, in tiles (and goes toward it), its tile's walk and its pauses
// (from MIN, up to MIN + SPAN); and how near the player a passive one keeps away from it
#define WANDERER_NOTICE 5
#define WANDERER_FAST_WALK_FRAMES 8
#define WANDERER_FAST_PAUSE_MIN 6
#define WANDERER_FAST_PAUSE_SPAN 14
#define WANDERER_FLEE 4
// Its time out, from 20 to 40 seconds
#define WANDERER_LIFE_MIN (20 * WANDERER_FRAMES_A_SECOND)
#define WANDERER_LIFE_SPAN (20 * WANDERER_FRAMES_A_SECOND)
// How often one more is tried, from 3 to 6 seconds, and the first after the field opens
#define WANDERER_SPAWN_MIN (2 * WANDERER_FRAMES_A_SECOND)
#define WANDERER_SPAWN_SPAN (2 * WANDERER_FRAMES_A_SECOND)
// How soon one more is tried after a try that found no grass in view
#define WANDERER_SPAWN_RETRY WANDERER_FRAMES_A_SECOND
#define WANDERER_SPAWN_FIRST (2 * WANDERER_FRAMES_A_SECOND)
// Where one spawns: a grass tile within the screen's tiles round the player and not within WANDERER_SPAWN_NEAR of it,
// picked among all of them, those ahead of the player (the way it faces) WANDERER_SPAWN_AHEAD times as likely
#define WANDERER_SPAWN_RANGE_X 8
#define WANDERER_SPAWN_RANGE_Z 6
#define WANDERER_SPAWN_NEAR 4
#define WANDERER_SPAWN_AHEAD 3
// Past this many tiles from the player it goes at once, out of view; and one off the screen (past its tiles round the
// player, and a tile more) goes after a while there, so that the ones the player left behind make room
#define WANDERER_FAR 11
#define WANDERER_OFFSCREEN_X (WANDERER_SPAWN_RANGE_X + 1)
#define WANDERER_OFFSCREEN_Z (WANDERER_SPAWN_RANGE_Z + 1)
#define WANDERER_OFFSCREEN_FRAMES (2 * WANDERER_FRAMES_A_SECOND)
// The most a step's ground may rise or drop, in units
#define WANDERER_STEP_HEIGHT FX32_CONST(8)
// How long a touch waits before the battle (as long as its "!" takes: FldeffEmotionBubble_StepAnimation's hop and 30
// frames), and how long a waiting touch is kept while the player isn't free
#define WANDERER_TOUCH_FRAMES 36
#define WANDERER_TOUCH_KEEP 60
// How long a sprite may take to load before the spawn is given up
#define WANDERER_LOAD_FRAMES (5 * WANDERER_FRAMES_A_SECOND)
// A person's billboard animations, past which a sprite has one a direction (as paperwhite2_ambients.c)
#define WANDERER_ANIM_PERSON 12
// A cry's pan: the middle
#define WANDERER_CRY_PAN 64
#define WANDERER_NONE (-1)
// The rustle's sound as one rises out of its grass or sinks into it
#define WANDERER_RUSTLE_SE SEQ_SE_FLD_70
// A tile's flag of the grass an actor stands in (ActorTerrainEffect_GrassStill's)
#define WANDERER_TILE_FLAG_GRASS 0x20
// A shiny one's sparkle (the Join Avenue's, FLDEFF_FES_SPARKLE): as it rises, and again every few seconds while it's
// out, a little over its feet
#define WANDERER_SPARKLE_FRAMES 15
#define WANDERER_SPARKLE_EVERY (5 * WANDERER_FRAMES_A_SECOND)
#define WANDERER_SPARKLE_LIFT FX32_CONST(3)

typedef struct {
    WildPkmParam param;
    // The material's flags and the billboard's index, as FldBillboardActor_AddActorPosOrReserve gives them
    u16 billboard[2];
    u16 objCode;
    // Its state's frames left, and its time out
    u16 timer;
    u16 life;
    s16 x;
    s16 z;
    // The tile it walks to, while it walks
    s16 toX;
    s16 toZ;
    // Its tile's ground and the one it walks to
    fx32 y;
    fx32 toY;
    u8 state;
    u8 facing;
    u8 encType;
    u8 shiny;
    u8 byDirection;
    // How it wanders (ENCOUNTERS_WANDERS_*), whether it floats over its grass, and whether it walks fast now (an
    // aggressive one going for the player)
    u8 wanders;
    u8 noGrass;
    u8 fast;
    // The animation it was last given
    u16 anim;
    // The grass it stands in, as an actor does (FLDEFF_GRASS); its sparkle's frames left, and the frames to its next
    FieldEffectTask *grass;
    u16 sparkleTimer;
    u16 sparkleNext;
    // How long it has been off the screen
    u16 offscreen;
} Wanderer;

typedef struct {
    // The billboard system the billboards were made in: another one means the field was made again
    BillboardActorSys *sys;
    Field *field;
    u16 zone;
    u16 spawnTimer;
    // The wanderer the player touched, or that touched the player (touchedPlayer), and how long its touch has waited
    s8 touch;
    u8 touchWait;
    u8 touchedPlayer;
    // The shiny ones' sparkles, one a wanderer, made when the first is needed
    FieldEffectTask *sparkles;
    Wanderer list[WANDERERS_MAX];
} WandererState;

typedef struct {
    Field *field;
    WildPkmParam param;
    u32 encType;
    u16 wait;
    s8 index;
    // Whether the wanderer walked into the player (who is surprised), rather than the player into it
    u8 touchedPlayer;
} WandererTouch;

static WandererState sWanderers;

static const s8 DIR_DX[4] = { 0, 0, -1, 1 };
static const s8 DIR_DZ[4] = { -1, 1, 0, 0 };

static BillboardActorSys *Wanderers_GetSys(MMSys *actorSystem) {
    return FieldBillboardActor_GetBillboardActorSys(FldActSys_GetFieldBillboardActor(actorSystem));
}

static s32 Wanderers_Abs(s32 n) {
    return n < 0 ? -n : n;
}

// The direction from one tile to another next to it (or toward it, by the longer axis)
static u8 Wanderers_DirTo(s32 dx, s32 dz) {
    if (Wanderers_Abs(dx) > Wanderers_Abs(dz)) {
        return dx > 0 ? DIR_RIGHT : DIR_LEFT;
    }
    return dz > 0 ? DIR_DOWN : DIR_UP;
}

// A tile's ground nearest a height, and its encounter type there; FALSE where the map has none
static BOOL Wanderers_TileAt(Field *field, s16 x, s16 z, fx32 near, fx32 *ground, u32 *encType) {
    FieldG3DMapperTerrain terrain;
    VecFx32 pos;
    BOOL found = FALSE;
    u32 tile;
    u32 i;

    ConvGXZToVector(x, z, &pos);
    pos.y = near;
    if (!FieldG3DMapper_GetTerrainAll(field->g3DMapper, &pos, &terrain)) {
        return FALSE;
    }
    for (i = 0; i < terrain.layerCount; i++) {
        fx32 height = terrain.layers[i].height;

        if (!found || Wanderers_Abs(height - near) < Wanderers_Abs(*ground - near)) {
            *ground = height;
            found = TRUE;
        }
    }
    if (!found) {
        return FALSE;
    }
    pos.y = *ground;
    tile = GetTileTypeAtPos(field->g3DMapper, &pos);
    *encType = tile == TILE_TYPE_NONE ? ENCTYPE_NONE : EncSys_GetTileEncType(tile);
    return TRUE;
}

// Whether a wanderer stands on a tile, or walks to it
static BOOL Wanderers_Covers(const Wanderer *wanderer, s16 x, s16 z) {
    if (wanderer->state == WANDERER_FREE || wanderer->state == WANDERER_LOADING) {
        return FALSE;
    }
    if (wanderer->x == x && wanderer->z == z) {
        return TRUE;
    }
    return wanderer->state == WANDERER_WALKING && wanderer->toX == x && wanderer->toZ == z;
}

// Whether an actor (the player aside) or another wanderer is on a tile or on its way to it
static BOOL Wanderers_IsTaken(Field *field, const Wanderer *self, s16 x, s16 z) {
    FieldActor *player = FieldPlayer_GetActor(field->player);
    FieldActor *actor;
    u32 index = 0;
    u32 i;

    while (NextActor(field->actorSystem, &actor, &index) == TRUE) {
        if (actor == player) {
            continue;
        }
        if ((GetGPosX(actor) == x && GetGPosZ(actor) == z) ||
            (FldAct_GetInitGPosX(actor) == x && FldAct_GetInitGPosZ(actor) == z)) {
            return TRUE;
        }
    }
    for (i = 0; i < WANDERERS_MAX; i++) {
        if (&sWanderers.list[i] != self && Wanderers_Covers(&sWanderers.list[i], x, z)) {
            return TRUE;
        }
    }
    return FALSE;
}

// Whether the player is on a tile or on its way to it
static BOOL Wanderers_IsPlayer(Field *field, s16 x, s16 z) {
    FieldActor *player = FieldPlayer_GetActor(field->player);

    return (GetGPosX(player) == x && GetGPosZ(player) == z) ||
           (FldAct_GetInitGPosX(player) == x && FldAct_GetInitGPosZ(player) == z);
}

// Whether a tile is beside the player's, or the one it walks to
static BOOL Wanderers_IsNearPlayer(Field *field, s16 x, s16 z) {
    FieldActor *player = FieldPlayer_GetActor(field->player);

    return (Wanderers_Abs(x - GetGPosX(player)) <= 1 && Wanderers_Abs(z - GetGPosZ(player)) <= 1) ||
           (Wanderers_Abs(x - FldAct_GetInitGPosX(player)) <= 1 && Wanderers_Abs(z - FldAct_GetInitGPosZ(player)) <= 1);
}

// The grass an actor stands in at a tile, where the tile has it and the wanderer stands in grass (its kind by the tile
// and the season, as an actor's is), shaking first when animate; NULL where it has none
static FieldEffectTask *Wanderers_Grass(Field *field, const Wanderer *wanderer, s16 x, s16 z, fx32 ground,
                                        BOOL animate) {
    VecFx32 pos;
    u32 tile;

    // (none under one that flies or hovers)
    if (wanderer->noGrass) {
        return NULL;
    }
    ConvGXZToVector(x, z, &pos);
    pos.y = ground;
    tile = GetTileTypeAtPos(field->g3DMapper, &pos);
    if (tile == TILE_TYPE_NONE || !(GetTileFlags(tile) & WANDERER_TILE_FLAG_GRASS)) {
        return NULL;
    }
    return GrassTask_StartAt(field->fieldEffects, x, z, ground, animate,
                             ActorTerrainEffect_GetGrassKind(GetTileClass(tile), GameData_GetSeason(field->gameData)));
}

static void Wanderers_DeleteGrass(FieldEffectTask **grass) {
    if (*grass != NULL) {
        FieldEffects_DeleteObject(*grass);
        *grass = NULL;
    }
}

// A shiny one's sparkle shown for its frames (where the field has the sparkles' effect)
static void Wanderers_Sparkle(Field *field, Wanderer *wanderer) {
    if (!wanderer->shiny) {
        return;
    }
    if (sWanderers.sparkles == NULL && FieldEffects_IsLoaded(field->fieldEffects, FLDEFF_FES_SPARKLE)) {
        sWanderers.sparkles = FldeffFesSparkle_Start(field->fieldEffects);
    }
    wanderer->sparkleTimer = WANDERER_SPARKLE_FRAMES;
    wanderer->sparkleNext = WANDERER_SPARKLE_EVERY;
}

// A wanderer's billboard deleted (or its load cancelled) and its sprite released
static void Wanderers_Remove(MMSys *actorSystem, Wanderer *wanderer) {
    u16 objCode = wanderer->objCode;

    if (wanderer->state == WANDERER_FREE) {
        return;
    }
    Wanderers_DeleteGrass(&wanderer->grass);
    if (sWanderers.sparkles != NULL) {
        FldeffFesSparkle_Hide(sWanderers.sparkles, (u8)(wanderer - sWanderers.list));
    }
    if (wanderer->billboard[1] == BILLBOARD_ACTOR_NONE) {
        FldBillboardActor_CancelPendingPos(actorSystem, wanderer->billboard);
    }
    FldBillboardActor_DeleteActorPos(actorSystem, wanderer->billboard);
    wanderer->state = WANDERER_FREE;
    FldBillboardActor_ReleaseObjCode(actorSystem, objCode);
    if (sWanderers.touch == wanderer - sWanderers.list) {
        sWanderers.touch = WANDERER_NONE;
    }
}

static void Wanderers_Clear(MMSys *actorSystem) {
    u32 i;

    for (i = 0; i < WANDERERS_MAX; i++) {
        Wanderers_Remove(actorSystem, &sWanderers.list[i]);
    }
    sWanderers.touch = WANDERER_NONE;
}

// One more, on a grass tile near the screen's edge that a step there would bring one from, if its sprite can load;
// FALSE where no grass tile in view would do
static BOOL Wanderers_Spawn(Field *field, Wanderer *wanderer) {
    FieldActor *player = FieldPlayer_GetActor(field->player);
    s16 px = GetGPosX(player);
    s16 pz = GetGPosZ(player);
    u8 facing = (u8)GetActorFaceDir(player);
    VecFx32 at;
    FieldActorConfig config;
    s16 x = 0;
    s16 z = 0;
    fx32 y = 0;
    u32 type = ENCTYPE_NONE;
    u32 total = 0;
    s16 dx;
    s16 dz;
    u8 gender;
    BOOL shiny;

    // Every tile of the ring, one picked by weight as it's found
    FieldPlayer_GetWPos(field->player, &at);
    for (dz = -WANDERER_SPAWN_RANGE_Z; dz <= WANDERER_SPAWN_RANGE_Z; dz++) {
        for (dx = -WANDERER_SPAWN_RANGE_X; dx <= WANDERER_SPAWN_RANGE_X; dx++) {
            fx32 ground;
            u32 encType;
            u32 weight;

            if (Wanderers_Abs(dx) < WANDERER_SPAWN_NEAR && Wanderers_Abs(dz) < WANDERER_SPAWN_NEAR) {
                continue;
            }
            if (!Wanderers_TileAt(field, px + dx, pz + dz, at.y, &ground, &encType) ||
                (encType != ENCTYPE_GRASS && encType != ENCTYPE_GRASS_RARE) ||
                Wanderers_IsTaken(field, wanderer, px + dx, pz + dz)) {
                continue;
            }
            weight = DIR_DX[facing] * dx + DIR_DZ[facing] * dz > 0 ? WANDERER_SPAWN_AHEAD : 1;
            total += weight;
            if (GFL_RandomLC(total) < weight) {
                x = px + dx;
                z = pz + dz;
                y = ground;
                type = encType;
            }
        }
    }
    if (total == 0) {
        return FALSE;
    }
    MI_CpuFill8(wanderer, 0, sizeof(Wanderer));
    if (!EventWildBattleCall_PickWanderer(Field_GetEncountSystem(field), type, &wanderer->param, &gender, &shiny)) {
        return TRUE;
    }
    wanderer->objCode = PaperWhite2_FollowingCodeFor(field->actorSystem, wanderer->param.species, wanderer->param.form,
                                                     gender, (u8)shiny);
    if (wanderer->objCode == 0 || !FldBillboardActor_CanLoadObjCode(field->actorSystem, wanderer->objCode)) {
        return TRUE;
    }
    GetNPCMdlInfoForOBJCODE(field->actorSystem, wanderer->objCode, &config);
    if (config.uid != wanderer->objCode) {
        return TRUE;
    }
    wanderer->x = x;
    wanderer->z = z;
    wanderer->y = y;
    wanderer->encType = (u8)type;
    wanderer->shiny = (u8)shiny;
    wanderer->wanders =
        (PaperWhite2_Encounters_GetSpeciesOverworld(wanderer->param.species) >> ENCOUNTERS_WANDERS_SHIFT) &
        ENCOUNTERS_WANDERS_MASK;
    wanderer->noGrass =
        (PaperWhite2_Encounters_GetSpeciesOverworld(wanderer->param.species) & ENCOUNTERS_NO_GRASS) != 0;
    wanderer->facing = (u8)GFL_RandomLC(4);
    wanderer->life = WANDERER_LIFE_MIN + GFL_RandomLC(WANDERER_LIFE_SPAN);
    wanderer->anim = 0xffff;
    wanderer->byDirection = FIELD_BILLBOARD_ANIM_SETS[config.spriteControllerType].count < WANDERER_ANIM_PERSON;
    wanderer->billboard[1] = BILLBOARD_ACTOR_NONE;
    wanderer->state = WANDERER_LOADING;
    wanderer->timer = WANDERER_LOAD_FRAMES;
    ConvGXZToVector(wanderer->x, wanderer->z, &at);
    at.y = y - WANDERER_RISE_DEPTH;
    FldBillboardActor_AddActorPosOrReserve(field->actorSystem, &config, wanderer->billboard, &at, NULL, NULL,
                                           func_ov012_02166fc0(field->actorSystem));
    return TRUE;
}

// A tile's walk and a pause between steps, faster for one going for the player
static u16 Wanderers_WalkFrames(const Wanderer *wanderer) {
    return wanderer->fast ? WANDERER_FAST_WALK_FRAMES : WANDERER_WALK_FRAMES;
}

static u16 Wanderers_Pause(const Wanderer *wanderer) {
    return wanderer->fast ? WANDERER_FAST_PAUSE_MIN + GFL_RandomLC(WANDERER_FAST_PAUSE_SPAN)
                          : WANDERER_PAUSE_MIN + GFL_RandomLC(WANDERER_PAUSE_SPAN);
}

// Whether a Repel keeps a wanderer away: one is on, and it's weaker than the first Pokémon that can battle, as a
// Repel keeps a step's away (enc_pokeset.c)
static BOOL Wanderers_IsRepelled(Field *field, const Wanderer *wanderer) {
    PokeParty *party = GameData_GetParty(field->gameData);

    if (EncountSave_IsRepelDepleted(SaveControl_GetEncountSave(GameData_GetSaveControl(field->gameData)))) {
        return FALSE;
    }
    return wanderer->param.level <
           PokeParty_GetParam(PokeParty_GetPkm(party, PokeParty_GetFirstBattleReady(party)), PKM_PARAM_LEVEL, NULL);
}

// A step tried, in an order by how it wanders: at random; toward the player when it's an aggressive one near enough
// (faster); away from it when it's a passive one near, or one a Repel keeps away. Onto a free tile of its grass, or
// into the player, which touches it (not one that keeps away)
static void Wanderers_Step(Field *field, Wanderer *wanderer, s32 index) {
    FieldActor *player = FieldPlayer_GetActor(field->player);
    s32 px = GetGPosX(player);
    s32 pz = GetGPosZ(player);
    s32 distance = Wanderers_Abs(wanderer->x - px) + Wanderers_Abs(wanderer->z - pz);
    u8 behind = (u8)(GetActorFaceDir(player) ^ 1);
    BOOL repelled = Wanderers_IsRepelled(field, wanderer);
    u32 wanders = repelled ? ENCOUNTERS_WANDERS_PASSIVE : wanderer->wanders;
    u32 first = GFL_RandomLC(4);
    u8 order[4];
    s32 after[4];
    u32 i;
    u32 j;

    if ((wanders == ENCOUNTERS_WANDERS_AGGRESSIVE && distance > WANDERER_NOTICE) ||
        (wanders == ENCOUNTERS_WANDERS_PASSIVE && distance > WANDERER_FLEE)) {
        wanders = ENCOUNTERS_WANDERS_RANDOM;
    }
    wanderer->fast = wanders == ENCOUNTERS_WANDERS_AGGRESSIVE;
    // The directions from a random one, sorted for a chase or a flight by the distance each leaves (nearest first, or
    // farthest)
    for (i = 0; i < 4; i++) {
        order[i] = (u8)((first + i) & 3);
        after[i] =
            Wanderers_Abs(wanderer->x + DIR_DX[order[i]] - px) + Wanderers_Abs(wanderer->z + DIR_DZ[order[i]] - pz);
    }
    if (wanders != ENCOUNTERS_WANDERS_RANDOM) {
        for (i = 1; i < 4; i++) {
            for (j = i; j > 0 &&
                        (wanders == ENCOUNTERS_WANDERS_AGGRESSIVE ? after[j] < after[j - 1] : after[j] > after[j - 1]);
                 j--) {
                u8 dir = order[j];
                s32 d = after[j];

                order[j] = order[j - 1];
                after[j] = after[j - 1];
                order[j - 1] = dir;
                after[j - 1] = d;
            }
        }
    }
    for (i = 0; i < 4; i++) {
        u8 dir = order[i];
        s16 x = wanderer->x + DIR_DX[dir];
        s16 z = wanderer->z + DIR_DZ[dir];
        fx32 ground;
        u32 encType;

        // A chase doesn't step away, and a flight doesn't step closer
        if ((wanders == ENCOUNTERS_WANDERS_AGGRESSIVE && after[i] > distance) ||
            (wanders == ENCOUNTERS_WANDERS_PASSIVE && after[i] < distance)) {
            break;
        }
        if (Wanderers_IsPlayer(field, x, z)) {
            if (wanders == ENCOUNTERS_WANDERS_PASSIVE) {
                continue;
            }
            wanderer->facing = dir;
            wanderer->state = WANDERER_TOUCHED;
            sWanderers.touch = (s8)index;
            sWanderers.touchWait = 0;
            sWanderers.touchedPlayer = TRUE;
            return;
        }
        // Never onto the tile behind the player, where the follower walks; and, but for a chase, never beside it
        if ((x == px + DIR_DX[behind] && z == pz + DIR_DZ[behind]) ||
            (wanders != ENCOUNTERS_WANDERS_AGGRESSIVE && Wanderers_IsNearPlayer(field, x, z))) {
            continue;
        }
        if (!Wanderers_TileAt(field, x, z, wanderer->y, &ground, &encType) || encType != wanderer->encType ||
            Wanderers_Abs(ground - wanderer->y) > WANDERER_STEP_HEIGHT || Wanderers_IsTaken(field, wanderer, x, z)) {
            continue;
        }
        wanderer->facing = dir;
        wanderer->toX = x;
        wanderer->toZ = z;
        wanderer->toY = ground;
        wanderer->state = WANDERER_WALKING;
        wanderer->timer = Wanderers_WalkFrames(wanderer);
        // Its grass as an actor's is, on one tile only: going down or sideways it leaves the tile it starts from at
        // once for the one it walks to; going up it keeps it until it arrives (Wanderers_Tick)
        if (dir != DIR_UP) {
            Wanderers_DeleteGrass(&wanderer->grass);
            wanderer->grass = Wanderers_Grass(field, wanderer, x, z, ground, TRUE);
        }
        return;
    }
    wanderer->timer = Wanderers_Pause(wanderer);
}

// A wanderer a frame on: its state's time, its steps, its going
static void Wanderers_Tick(Field *field, Wanderer *wanderer, s32 index) {
    FieldActor *player = FieldPlayer_GetActor(field->player);

    if (wanderer->state == WANDERER_LOADING) {
        if (wanderer->billboard[1] != BILLBOARD_ACTOR_NONE) {
            wanderer->state = WANDERER_RISING;
            wanderer->timer = WANDERER_RISE_FRAMES;
            wanderer->grass = Wanderers_Grass(field, wanderer, wanderer->x, wanderer->z, wanderer->y, TRUE);
            GFL_SndSEPlay(WANDERER_RUSTLE_SE);
            Wanderers_Sparkle(field, wanderer);
        } else if (--wanderer->timer == 0) {
            Wanderers_Remove(field->actorSystem, wanderer);
        }
        return;
    }
    if (wanderer->state == WANDERER_TOUCHED) {
        return;
    }
    // Far out of view: gone at once; off the screen for a while: gone too, unseen
    if (Wanderers_Abs(wanderer->x - GetGPosX(player)) > WANDERER_FAR ||
        Wanderers_Abs(wanderer->z - GetGPosZ(player)) > WANDERER_FAR) {
        Wanderers_Remove(field->actorSystem, wanderer);
        return;
    }
    if (Wanderers_Abs(wanderer->x - GetGPosX(player)) > WANDERER_OFFSCREEN_X ||
        Wanderers_Abs(wanderer->z - GetGPosZ(player)) > WANDERER_OFFSCREEN_Z) {
        if (++wanderer->offscreen >= WANDERER_OFFSCREEN_FRAMES) {
            Wanderers_Remove(field->actorSystem, wanderer);
            return;
        }
    } else {
        wanderer->offscreen = 0;
    }
    if (wanderer->life != 0) {
        wanderer->life--;
    }
    if (wanderer->sparkleTimer != 0 && --wanderer->sparkleTimer == 0 && sWanderers.sparkles != NULL) {
        FldeffFesSparkle_Hide(sWanderers.sparkles, (u8)index);
    }
    if (wanderer->shiny && wanderer->state != WANDERER_SINKING && --wanderer->sparkleNext == 0) {
        Wanderers_Sparkle(field, wanderer);
    }
    switch (wanderer->state) {
    case WANDERER_RISING:
        if (--wanderer->timer == 0) {
            wanderer->state = WANDERER_IDLE;
            wanderer->timer = WANDERER_PAUSE_MIN + GFL_RandomLC(WANDERER_PAUSE_SPAN);
        }
        break;
    case WANDERER_IDLE:
        if (wanderer->life == 0) {
            wanderer->state = WANDERER_SINKING;
            wanderer->timer = WANDERER_RISE_FRAMES;
            // (its grass shakes again as it goes)
            Wanderers_DeleteGrass(&wanderer->grass);
            wanderer->grass = Wanderers_Grass(field, wanderer, wanderer->x, wanderer->z, wanderer->y, TRUE);
            GFL_SndSEPlay(WANDERER_RUSTLE_SE);
        } else if (--wanderer->timer == 0) {
            Wanderers_Step(field, wanderer, index);
        }
        break;
    case WANDERER_WALKING:
        if (--wanderer->timer == 0) {
            wanderer->x = wanderer->toX;
            wanderer->z = wanderer->toZ;
            wanderer->y = wanderer->toY;
            // (going up, its grass moves to the tile it came to once it's there)
            if (wanderer->facing == DIR_UP) {
                Wanderers_DeleteGrass(&wanderer->grass);
                wanderer->grass = Wanderers_Grass(field, wanderer, wanderer->x, wanderer->z, wanderer->y, TRUE);
            }
            wanderer->state = WANDERER_IDLE;
            wanderer->timer = Wanderers_Pause(wanderer);
        }
        break;
    case WANDERER_SINKING:
        if (--wanderer->timer == 0) {
            Wanderers_Remove(field->actorSystem, wanderer);
        }
        break;
    }
}

// Its billboard placed and animated: risen as far as its rise or sink has come, part way along its step
static void Wanderers_Draw(Field *field, BillboardActorSys *sys, Wanderer *wanderer) {
    VecFx32 pos;
    u16 anim;

    if (wanderer->state == WANDERER_FREE || wanderer->billboard[1] == BILLBOARD_ACTOR_NONE) {
        return;
    }
    ConvGXZToVector(wanderer->x, wanderer->z, &pos);
    pos.y = wanderer->y;
    if (wanderer->state == WANDERER_WALKING) {
        VecFx32 to;
        fx32 t = FX32_ONE * (Wanderers_WalkFrames(wanderer) - wanderer->timer) / Wanderers_WalkFrames(wanderer);

        ConvGXZToVector(wanderer->toX, wanderer->toZ, &to);
        pos.x += FX_Mul(to.x - pos.x, t);
        pos.z += FX_Mul(to.z - pos.z, t);
        pos.y += FX_Mul(wanderer->toY - wanderer->y, t);
    } else if (wanderer->state == WANDERER_RISING || wanderer->state == WANDERER_LOADING) {
        pos.y -= WANDERER_RISE_DEPTH * wanderer->timer / WANDERER_RISE_FRAMES;
    } else if (wanderer->state == WANDERER_SINKING) {
        pos.y -= WANDERER_RISE_DEPTH * (WANDERER_RISE_FRAMES - wanderer->timer) / WANDERER_RISE_FRAMES;
    }
    if (wanderer->sparkleTimer != 0 && sWanderers.sparkles != NULL) {
        VecFx32 at = pos;

        at.y += WANDERER_SPARKLE_LIFT;
        FldeffFesSparkle_Show(sWanderers.sparkles, (u8)(wanderer - sWanderers.list), 0, &at);
    }
    pos.y += Field_GetActorYOffset(field);
    BillboardActorScene_SetActorPos(BillboardActorSys_GetScene(sys), wanderer->billboard[1], &pos);
    // A walking Pokémon's animation: one a direction, always playing (as an ambient's)
    anim = wanderer->byDirection ? wanderer->facing : wanderer->facing + 2 * 4;
    if (anim != wanderer->anim) {
        wanderer->anim = anim;
        BillboardActorSys_SetActorAnim(sys, wanderer->billboard[1], anim);
        BillboardActorSys_SetActorAnimating(sys, wanderer->billboard[1], TRUE);
    }
}

void PaperWhite2_WanderersReset(void) {
    MI_CpuFill8(&sWanderers, 0, sizeof(sWanderers));
    sWanderers.touch = WANDERER_NONE;
}

void PaperWhite2_WanderersUpdate(Field *field) {
    MMSys *actorSystem = field->actorSystem;
    PlayerState *playerState;
    BillboardActorSys *sys;
    BOOL paused;
    u32 count = 0;
    u32 i;

    if (actorSystem == NULL || field->player == NULL) {
        return;
    }
    sys = Wanderers_GetSys(actorSystem);
    playerState = GameData_GetPlayerState(field->gameData);
    if (sWanderers.sys != sys) {
        // The field was made again (after a battle or a menu): its billboards went with the old one
        MI_CpuFill8(&sWanderers, 0, sizeof(sWanderers));
        sWanderers.sys = sys;
        sWanderers.zone = PlayerState_GetZoneID(playerState);
        sWanderers.spawnTimer = WANDERER_SPAWN_FIRST;
        sWanderers.touch = WANDERER_NONE;
    }
    sWanderers.field = field;
    // None on rails, with a partner, after another zone's or with the debug menu's No wanderers
    if (sWanderers.zone != PlayerState_GetZoneID(playerState) || PlayerState_IsRail(playerState) ||
        GameData_CheckPairFlag(field->gameData)
#ifdef PAPERWHITE2_DEBUG_MENU
        || EventWork_FlagGet(GameData_GetEventWork(field->gameData), EVENT_FLAG_DEBUG_NO_WANDERERS)
#endif
    ) {
        Wanderers_Clear(actorSystem);
        sWanderers.zone = PlayerState_GetZoneID(playerState);
        sWanderers.spawnTimer = WANDERER_SPAWN_FIRST;
        return;
    }
    // Still while an event or a menu runs
    paused = GSYS_GetNowEvent(field->gameSystem) != NULL || Field_IsEventRunning(field) || field->fadeFlag;
    for (i = 0; i < WANDERERS_MAX; i++) {
        Wanderer *wanderer = &sWanderers.list[i];

        if (!paused) {
            Wanderers_Tick(field, wanderer, (s32)i);
        }
        if (wanderer->state != WANDERER_FREE) {
            count++;
        }
        Wanderers_Draw(field, sys, wanderer);
    }
    // A touch the player wasn't free for in time lets it go on
    if (!paused && sWanderers.touch != WANDERER_NONE && ++sWanderers.touchWait > WANDERER_TOUCH_KEEP) {
        sWanderers.list[sWanderers.touch].state = WANDERER_IDLE;
        sWanderers.list[sWanderers.touch].timer = WANDERER_PAUSE_MIN;
        sWanderers.touch = WANDERER_NONE;
    }
    if (!paused && count < WANDERERS_MAX && --sWanderers.spawnTimer == 0) {
        BOOL found = FALSE;

        for (i = 0; i < WANDERERS_MAX; i++) {
            if (sWanderers.list[i].state == WANDERER_FREE) {
                found = Wanderers_Spawn(field, &sWanderers.list[i]);
                break;
            }
        }
        sWanderers.spawnTimer = found ? WANDERER_SPAWN_MIN + GFL_RandomLC(WANDERER_SPAWN_SPAN) : WANDERER_SPAWN_RETRY;
    }
}

BOOL PaperWhite2_WanderersCheckGridCollision(const FieldActor *actor, s16 x, s16 z, BOOL blocked) {
    Field *field = sWanderers.field;
    u32 i;

    if (blocked || field == NULL || field->player == NULL) {
        return blocked;
    }
    for (i = 0; i < WANDERERS_MAX; i++) {
        Wanderer *wanderer = &sWanderers.list[i];

        if (!Wanderers_Covers(wanderer, x, z)) {
            continue;
        }
        // The player's step into one touches it, unless it's going
        if (actor == FieldPlayer_GetActor(field->player) && wanderer->state != WANDERER_SINKING &&
            sWanderers.touch == WANDERER_NONE) {
            wanderer->state = WANDERER_TOUCHED;
            sWanderers.touch = (s8)i;
            sWanderers.touchWait = 0;
            sWanderers.touchedPlayer = FALSE;
        }
        return TRUE;
    }
    return FALSE;
}

// The touch: the two face each other, its cry, a moment, then the battle
static GameEventReturnCode Wanderers_TouchEvent(GameEvent *event, u32 *state, void *data) {
    WandererTouch *touch = data;
    Field *field = touch->field;
    Wanderer *wanderer = &sWanderers.list[touch->index];
    FieldActor *player = FieldPlayer_GetActor(field->player);

    switch (*state) {
    case 0: {
        u8 dir = Wanderers_DirTo(wanderer->x - GetGPosX(player), wanderer->z - GetGPosZ(player));
        VecFx32 at;

        SetActorFaceDir(player, dir);
        // (DIR_UP and DIR_DOWN, DIR_LEFT and DIR_RIGHT are each other's)
        wanderer->facing = (u8)(dir ^ 1);
        // A "!" over the one walked into, the surprised one, with the bubble's sound
        if (touch->touchedPlayer) {
            FldeffEmotionBubble_SetActor(field->fieldEffects, player, EMOTION_BUBBLE_EXCLAMATION, TRUE);
        } else {
            ConvGXZToVector(wanderer->x, wanderer->z, &at);
            at.y = wanderer->y;
            FldeffEmotionBubble_SetPos(field->fieldEffects, &at, EMOTION_BUBBLE_EXCLAMATION, TRUE);
        }
        if (!GFL_SndIsLoadThreadRunning()) {
            PokeVoice_Play(touch->param.species, touch->param.form, WANDERER_CRY_PAN, 0, 0, 0, 0, NULL);
        }
        touch->wait = WANDERER_TOUCH_FRAMES;
        (*state)++;
        break;
    }
    case 1:
        if (touch->wait-- != 0) {
            break;
        }
        // (it stays on the field through the battle's transition; the field's closing clears it)
        GameEvent_ChainNext(
            event, EventWildBattleCall_CreateWanderer(Field_GetEncountSystem(field), &touch->param, touch->encType));
        (*state)++;
        break;
    default:
        return GAMEEVENT_DONE;
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *PaperWhite2_WanderersGridEvent(GameSystem *gsys, Field *field, GameEvent *event) {
    GameEvent *touchEvent;
    WandererTouch *touch;
    Wanderer *wanderer;
    u32 observe;

    if (event != NULL || sWanderers.touch == WANDERER_NONE || sWanderers.field != field || field->fadeFlag ||
        Field_IsEventRunning(field)) {
        return event;
    }
    observe = FieldPlayer_GetMoveObserveStatus(field->player);
    if (observe != PLAYER_OBSERVE_NONE && observe != PLAYER_OBSERVE_END) {
        return event;
    }
    wanderer = &sWanderers.list[sWanderers.touch];
    touchEvent = GameEvent_Create(gsys, NULL, Wanderers_TouchEvent, sizeof(WandererTouch));
    touch = GameEvent_GetData(touchEvent);
    touch->field = field;
    touch->param = wanderer->param;
    touch->encType = wanderer->encType;
    touch->index = sWanderers.touch;
    touch->touchedPlayer = sWanderers.touchedPlayer;
    return touchEvent;
}

BOOL PaperWhite2_WanderersUseObjCode(u16 objCode) {
    u32 i;

    for (i = 0; i < WANDERERS_MAX; i++) {
        if (sWanderers.list[i].state != WANDERER_FREE && sWanderers.list[i].objCode == objCode) {
            return TRUE;
        }
    }
    return FALSE;
}

BOOL PaperWhite2_WanderersGetInfo(u32 index, WandererInfo *out) {
    const Wanderer *wanderer;

    MI_CpuFill8(out, 0, sizeof(WandererInfo));
    if (index >= WANDERERS_MAX || sWanderers.list[index].state == WANDERER_FREE) {
        return FALSE;
    }
    wanderer = &sWanderers.list[index];
    out->species = wanderer->param.species;
    out->level = wanderer->param.level;
    out->shiny = wanderer->shiny;
    out->state = wanderer->state;
    out->x = wanderer->x;
    out->z = wanderer->z;
    return TRUE;
}
