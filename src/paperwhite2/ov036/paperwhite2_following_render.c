#include "types.h"
#include "field/field_actor.h"
#include "field/field_actor_internal.h"
#include "field/field_effect.h"
#include "field/field_g3d_mapper.h"
#include "field/field_map.h"
#include "gfl/billboard_actor.h"
#include "gfl/g3d.h"
#include "limits.h"
#include "nitro/fx.h"
#include "nitro/os.h"
#include "paperwhite2/following.h"
#include "paperwhite2/following_field.h"
#include "paperwhite2/following_render.h"
#include "paperwhite2/following_render_math.h"

// Paper White 2: the Following Pokémon's draws, ported from Pokeweb's render.c. Each pass changes the follower's
// quads just before the field's own submit of their billboards and puts them back after it. The original's
// FollowingRenderDebug, a block of values for its emulator tests, isn't ported, nor the depth readings that only it
// kept (the view distance and gap, the swap's ease and the shadow's push). The follower's shadow is the engine's own
// oval, drawn as every actor's (fldeff_shadow.c): Pokeweb's shadow pass, which looked for it among the effects' quads
// to push it behind the body, only looked at camera-facing quads and never found the flat oval

// The bodies the last actors' pass submitted, for the grass and the effects drawn on them
typedef struct {
    FieldActor *actor;
    VecFx32 world;
    VecFx32 native;
    u16 resource;
    FollowingEffectPose submitted;
    FieldActor *player;
    VecFx32 playerWorld;
    FollowingEffectPose playerSubmitted;
} FollowingSubmitted;

// Where the strips of a tall body stand, cached while the follower stays on its tile and the camera looks the same way
typedef struct {
    s16 x;
    s16 z;
    s16 y;
    s8 sx;
    s8 sz;
    u8 valid;
    u8 tiles;
    u8 limit;
} FollowingWallBehind;

// World pixels added to every follower's height. Pokeweb's runtime lifts every follower by 2 so that the walking hop
// can't dip a sheet's feet through the floor, which leaves them all floating; the user's playtests put the feet on the
// ground 4 pixels below that. The actor table's offset can't carry it: FldeffShadow_Draw adds the actor's model offset
// to the oval too, which would then sink a unit or more under the floor, and a W-buffered room (the Pokémon Centers)
// draws the floor over it. So the lift is the quad's alone. Pulling the quad toward the camera to keep the feet in
// front of the oval was tried, and drew the follower over the player; the oval may show over the lowest rows instead
#define FOLLOWING_SPRITE_LIFT -2

// A camera-facing quad leans back by its height, so a 64-pixel body reaches walls a 32-pixel NPC never touches. It
// draws as it is unless a wall stands within four tiles behind it. Then the field's submit keeps the bottom
// STRIP_BASE_ROWS rows: the feet, where grass and the oval meet the body. The rows above go through one submit of the
// follower's own as STRIP_COUNT strips of STRIP_ROWS, each moved toward the camera only as far as its top needs to
// clear the wall line (FollowingRender_Strips). Small steps keep distance fog from showing one bright block. The same
// polygon ID as the live scene, so the strips meet without an edge-marking seam; the live scene's custom normal and
// texture offsets, so lighting and mirrored frames match
#define STRIP_ROWS 8
#define STRIP_COUNT 7
// The base's window and the strips' tile the frame: 64 rows are 8 base windows, and a base window is one strip
#define STRIP_BASE_ROWS (64 - STRIP_COUNT * STRIP_ROWS)

// The wall behind. Each time the follower changes tile, the four tiles behind it, away from the camera along the
// ground, are read in three columns: the feet's and one tile either side, as wide as the sprite. A side column whose
// tile beside the feet is already unwalkable is skipped. The nearest tile that isn't walkable at the follower's height
// is the wall: no walkable layer within a tile of the feet, that layer blocks movement, or a layer 1 to 4 tiles above
// them. Its face is that tile's near edge. From WALL_RISE up, anything may jut out of it, ramping to WALL_JUT over
// WALL_RAMP of height (awnings, window boxes, eaves); lower rows only clear the face, so a low ledge stays in front of
// them. Nothing in front of the follower is read, and NPCs and the player aren't consulted
#define WALL_TILES 4
#define WALL_JUT FOLLOWING_TILE
#define WALL_RISE (20 * FX32_ONE)
#define WALL_RAMP (14 * FX32_ONE)
#define WALL_MARGIN FX32_ONE

// Where the strips' top edges stand: a line along the ground from the feet (toward the camera when positive) a unit in
// front of the wall's face, and from WALL_RISE up a further WALL_JUT, ramped in. Rows that already clear it stay as
// they are, so the sprite leans back with the camera up to the line and stands straight up from there. sLine is the
// face's line; with no wall it is LINE_NATIVE, behind every row of a 56-unit body at any pitch, and the follower draws
// whole. It moves LINE_STEP a draw toward its target, so a wall coming into range or a change of distance doesn't pop
#define LINE_NATIVE (-4 * FOLLOWING_TILE)
#define LINE_STEP (12 * FX32_ONE)

// A 32-pixel body leans back half as far, and a native 32-pixel sprite (the player, an NPC) already clears the walls
// and counters the maps put behind it. The follower is drawn lower than one: FOLLOWING_SPRITE_LIFT, and the walk's
// down frames sit up to two more pixels low, so in a W-buffered room (the Pokémon Centers, where the actors' clip Z
// offset does nothing) the rows that a counter's top only just cleared go into it. So the split is smaller: only a wall
// SMALL_WALL_TILES behind is read, the field's quad keeps the bottom SMALL_STRIP_BASE_ROWS rows (the feet, which never
// move), and the rows above are SMALL_STRIP_COUNT strips of SMALL_STRIP_ROWS. Each moves toward the camera only as far
// as its top needs to clear the wall's face (no jut) and never along the ground past the feet, within the large
// split's FOLLOWING_RENDER_SPLIT_CAP. At the Pokémon Centers' 39-degree camera a counter's face 8 units back takes the
// strips 15.3, 9.7 and 3.8 units of depth (top to bottom)
#define SMALL_STRIP_ROWS 8
#define SMALL_STRIP_COUNT 3
#define SMALL_STRIP_BASE_ROWS (32 - SMALL_STRIP_COUNT * SMALL_STRIP_ROWS)
#define SMALL_WALL_TILES 1
// With no wall, behind every row of a 24-unit stack at any pitch
#define SMALL_LINE_NATIVE (-2 * FOLLOWING_TILE)

// A terrain layer whose class is this has no tile
#define TILE_CLASS_NONE 0xff

// The fixed pool that the field effects' tasks are in lies in main RAM, a task's work 24 bytes into it, with the
// original's 192-byte tail margin. On a DSi main RAM goes on to the second bound
#define TASK_WORK_LOW 0x02000018
#define TASK_WORK_HIGH 0x023fff40
#define TASK_WORK_HIGH_TWL 0x02ffff40

// The most handles that a pass walks, and the grass quads that one changes
#define HANDLE_LIMIT 256
#define GRASS_LIMIT 8

// The follower's upper strips and the material that shows them
typedef struct {
    BillboardActorScene scene;
    BillboardActor strips[STRIP_COUNT];
    BillboardActorMaterial material;
    // The field's material, while its face height is changed; NULL when no split is active
    BillboardActorMaterial *live;
    u16 face;
    s16 scaleY;
    // The material's face height, and the base windows that the face is cut into
    u8 faceHeight;
    u8 windows;
} FollowingUpper;

static FollowingSubmitted sSubmitted;
static FollowingWallBehind sBehind;
static s32 sLine = LINE_NATIVE;
static s32 sSmallLine = SMALL_LINE_NATIVE;
static FollowingUpper sUpper;

static void GetCamera(G3DCamera *camera, FollowingCamera *view) {
    GFL_G3DCameraGetLookatPos(camera, &view->eye);
    GFL_G3DCameraGetLookatTarget(camera, &view->target);
    view->projection = GFL_G3DCameraGetProjectionType(camera);
}

static BOOL SamePosition(const VecFx32 *a, const VecFx32 *b) {
    return a->x == b->x && a->y == b->y && a->z == b->z;
}

void FollowingRender_Anchor(FieldActor *actor, u32 face) {
    if (actor == NULL) {
        return;
    }
    actor->modelPosOffsetZ = actor->config.wPosOffsetZ;
}

// Whether work can be a field effect task's work: inside the task pool's span of main RAM and aligned
static BOOL IsTaskWork(const void *work) {
    u32 address = (u32)work;

    if (address < TASK_WORK_LOW || (address & 3)) {
        return FALSE;
    }
    if (address <= TASK_WORK_HIGH) {
        return TRUE;
    }
    return address <= TASK_WORK_HIGH_TWL && OS_IsRunOnTwl();
}

void FollowingRender_ClearGrass(void) {
    sSubmitted.actor = sSubmitted.player = NULL;
}

void FollowingRender_GrassDraw(BillboardActorSys *system, G3DCamera *camera, G3DLight *lights, FieldActor *follower) {
    // The grass's quads keep their task's work in their handle's callbackData. The live handles are walked rather than
    // the steps remembered: the player's own steps and grass that two actors share or that is reused need the same
    // correction as the follower's
    BillboardActor *changed[GRASS_LIMIT];
    BillboardActor original[GRASS_LIMIT];
    u32 count = 0;
    u32 i;

    if (system != NULL && camera != NULL && follower != NULL && sSubmitted.actor == follower &&
        !(follower->flags & FOLLOWING_ACTOR_FLAG_HIDDEN) && SamePosition(&sSubmitted.world, &follower->wPos)) {
        BillboardActorScene *scene = system->scene;
        FollowingCamera view;
        u32 capacity = system->handleCount;
        BillboardActorHandle *handles = system->handles;
        FieldActor *player = sSubmitted.player;
        BOOL playerLive = player != NULL && player->actorSystem == follower->actorSystem &&
                          !(player->flags & FOLLOWING_ACTOR_FLAG_HIDDEN) &&
                          SamePosition(&player->wPos, &sSubmitted.playerWorld);
        FollowingPose followerBody;
        FollowingPose playerBody;

        GetCamera(camera, &view);
        followerBody.position = sSubmitted.submitted.position;
        followerBody.scaleX = sSubmitted.submitted.scaleX;
        followerBody.scaleY = sSubmitted.submitted.scaleY;
        playerBody.position = sSubmitted.playerSubmitted.position;
        playerBody.scaleX = sSubmitted.playerSubmitted.scaleX;
        playerBody.scaleY = sSubmitted.playerSubmitted.scaleY;
        for (i = 0; scene != NULL && handles != NULL && capacity <= HANDLE_LIMIT && i < capacity && count < GRASS_LIMIT;
             i++) {
            BillboardActorHandle *handle = &handles[i];
            GrassTask *grass;
            FieldActor *owner;
            BillboardActor *quad;
            FollowingPose native;
            FollowingPose out;
            const FollowingPose *body;
            const FollowingPose *other;

            if (handle->actor >= scene->setup.actorCount) {
                continue;
            }
            // Other effects' handles have other work too: it has to be in the task pool before it is read as a task
            grass = handle->callbackData;
            if (!IsTaskWork(grass) || !PaperWhite2_IsShakingGrassTask(grass)) {
                continue;
            }
            // The task's actor, as it was when the grass started, is the live one: a reused task can't make another
            // NPC's grass the follower's
            owner = grass->params.actor;
            if ((owner != follower && (!playerLive || owner != player)) || grass->params.grass == NULL ||
                grass->params.grass->billboardActor != system || grass->identity.uid != owner->uid ||
                grass->identity.objCode != owner->modelId || grass->identity.zoneId != owner->zoneId ||
                grass->actorIndex != i || grass->params.gx != owner->gPos.x || grass->params.gz != owner->gPos.z) {
                continue;
            }
            quad = &scene->actors[handle->actor];
            if (quad->type != 0 || quad->material == BILLBOARD_ACTOR_MATERIAL_NONE || !quad->visible) {
                continue;
            }
            native.position = quad->pos;
            native.scaleX = quad->scaleX;
            native.scaleY = quad->scaleY;
            body = owner == follower ? &followerBody : &playerBody;
            other = NULL;
            if (playerLive) {
                other = owner == follower ? &playerBody : &followerBody;
            }
            if (FollowingRender_CoverFeet(&native, body, other, &view, &out)) {
                changed[count] = quad;
                original[count] = *quad;
                count++;
                quad->pos = out.position;
                quad->scaleX = (s16)out.scaleX;
                quad->scaleY = (s16)out.scaleY;
            }
        }
    }
    BillboardActorSys_Draw(system, camera, lights);
    for (i = 0; i < count; i++) {
        *changed[i] = original[i];
    }
}

BOOL FollowingRender_EffectPose(FieldActor *actor, const VecFx32 *live, FollowingEffectPose *out) {
    s64 x;
    s64 y;
    s64 z;

    if (actor == NULL || live == NULL || out == NULL || sSubmitted.actor != actor ||
        sSubmitted.resource != actor->config.rscIndices.res1) {
        return FALSE;
    }
    // The draw hasn't put the quad back yet: the live quad is the submitted pose
    if (SamePosition(&sSubmitted.world, &actor->wPos) && SamePosition(live, &sSubmitted.submitted.position)) {
        *out = sSubmitted.submitted;
        return TRUE;
    }
    // Put back, a bob that landed after it was, or a step taken since. The draw-only move (the registry's Y,
    // FOLLOWING_SPRITE_LIFT and the pull over the oval along the eye ray) barely changes within a step, so it stays:
    // an effect started mid-step is drawn where the body is, not at the native quad. Pokeweb's runtime gave up on a
    // moved actor, and a recall begun while walking drew its silhouette at the native height
    x = (s64)live->x + sSubmitted.submitted.position.x - sSubmitted.native.x;
    y = (s64)live->y + sSubmitted.submitted.position.y - sSubmitted.native.y;
    z = (s64)live->z + sSubmitted.submitted.position.z - sSubmitted.native.z;
    if (x < LONG_MIN || x > LONG_MAX || y < LONG_MIN || y > LONG_MAX || z < LONG_MIN || z > LONG_MAX) {
        return FALSE;
    }
    *out = sSubmitted.submitted;
    out->position.x = (fx32)x;
    out->position.y = (fx32)y;
    out->position.z = (fx32)z;
    return TRUE;
}

// The actor's quad in system, when it is the field's, in use, drawn, and a plain quad that is visible
static BillboardActor *GetBillboard(BillboardActorSys *system, FieldActor *actor) {
    FieldBillboardActor *fieldBillboard;
    BillboardActorScene *scene;
    const u16 *work;
    u32 index;
    BillboardActor *quad;

    if (actor == NULL || !(actor->flags & FOLLOWING_ACTOR_FLAG_USE) || (actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN) ||
        actor->actorSystem == NULL) {
        return NULL;
    }
    fieldBillboard = FldActSys_GetFieldBillboardActor(actor->actorSystem);
    if (fieldBillboard == NULL || FieldBillboardActor_GetBillboardActorSys(fieldBillboard) != system) {
        return NULL;
    }
    scene = system->scene;
    // The actor's billboard work starts with its handle
    work = FldAct_GetBillboardActorWorkPtr(actor);
    if (scene == NULL || system->handles == NULL || *work >= system->handleCount) {
        return NULL;
    }
    index = system->handles[*work].actor;
    if (index >= scene->setup.actorCount || scene->actors == NULL) {
        return NULL;
    }
    quad = &scene->actors[index];
    if (quad->type != 0 || !quad->visible) {
        return NULL;
    }
    return quad;
}

// Whether the tile at x, z is a wall at the follower's height: no walkable layer within a tile of the feet, that layer
// blocks movement, or a layer 1 to 4 tiles above them
static BOOL IsWallAt(FieldG3DMapper *mapper, const FieldActor *actor, fx32 x, fx32 z) {
    FieldG3DMapperTerrain terrain;
    VecFx32 at;
    u32 layers;
    BOOL walkable;
    BOOL raised;
    u32 i;

    at.x = x;
    at.y = actor->wPos.y;
    at.z = z;
    if (!FieldG3DMapper_GetTerrainAll(mapper, &at, &terrain)) {
        return TRUE;
    }
    layers = terrain.layerCount;
    if (layers > FIELD_G3D_MAPPER_LAYER_MAX) {
        layers = FIELD_G3D_MAPPER_LAYER_MAX;
    }
    walkable = FALSE;
    raised = FALSE;
    for (i = 0; i < layers; i++) {
        u32 type = terrain.layers[i].tileType;
        s64 above = (s64)terrain.layers[i].height - actor->wPos.y;

        if (type == TILE_TYPE_NONE || GetTileClass(type) == TILE_CLASS_NONE) {
            continue;
        }
        if (above > FOLLOWING_TILE && above < 4 * (s64)FOLLOWING_TILE) {
            raised = TRUE;
        } else if (above >= -FOLLOWING_TILE && above <= FOLLOWING_TILE && !(GetTileFlags(type) & TILE_FLAG_COLLISION)) {
            walkable = TRUE;
        }
    }
    return raised || !walkable;
}

// The tiles behind the follower to the nearest wall along sx, sz, 0 for none within limit
static u32 GetWallTiles(FieldActor *actor, s8 sx, s8 sz, u32 limit) {
    s16 tx = actor->gPos.x;
    s16 tz = actor->gPos.z;
    s16 ty = (s16)(actor->wPos.y / FOLLOWING_TILE);
    FieldG3DMapper *mapper;
    u32 found;
    // Columns run across the back axis. A side column whose own tile, beside the feet, is already a wall (a railing, a
    // fence) is beside the sprite, not behind it, and isn't read further
    BOOL open[3];
    s32 side;
    s32 k;

    if (sBehind.valid && sBehind.x == tx && sBehind.z == tz && sBehind.y == ty && sBehind.sx == sx &&
        sBehind.sz == sz && sBehind.limit == limit) {
        return sBehind.tiles;
    }
    mapper = actor->actorSystem != NULL ? GetMMSysG3DMapper(actor->actorSystem) : NULL;
    found = 0;
    open[0] = open[1] = open[2] = TRUE;
    for (side = -1; mapper != NULL && side <= 1; side += 2) {
        open[side + 1] = !IsWallAt(mapper, actor, actor->wPos.x + (sx ? 0 : side) * FOLLOWING_TILE,
                                   actor->wPos.z + (sz ? 0 : side) * FOLLOWING_TILE);
    }
    for (k = 1; mapper != NULL && !found && k <= (s32)limit; k++) {
        for (side = -1; !found && side <= 1; side++) {
            if (open[side + 1] && IsWallAt(mapper, actor, actor->wPos.x + (sx * k + (sx ? 0 : side)) * FOLLOWING_TILE,
                                           actor->wPos.z + (sz * k + (sz ? 0 : side)) * FOLLOWING_TILE)) {
                found = k;
            }
        }
    }
    sBehind.x = tx;
    sBehind.z = tz;
    sBehind.y = ty;
    sBehind.sx = sx;
    sBehind.sz = sz;
    sBehind.valid = TRUE;
    sBehind.tiles = (u8)found;
    sBehind.limit = (u8)limit;
    return found;
}

// The line the strips' tops stand on, from the feet along the ground: a unit in front of the face of the nearest wall
// within limit tiles behind the follower, away from the camera on the nearer grid axis. native, or no farther back
// than it, with no wall
static s32 GetWallLine(FieldActor *actor, const FollowingCameraBasis *basis, u32 limit, s32 native) {
    s32 ax = basis->toward.x < 0 ? -basis->toward.x : basis->toward.x;
    s32 az = basis->toward.z < 0 ? -basis->toward.z : basis->toward.z;
    s8 sx = 0;
    s8 sz = 0;
    u32 tiles;
    s32 target;

    if (ax >= az) {
        sx = basis->toward.x > 0 ? -1 : 1;
    } else {
        sz = basis->toward.z > 0 ? -1 : 1;
    }
    tiles = GetWallTiles(actor, sx, sz, limit);
    target = native;
    if (tiles != 0) {
        // The face is the near edge of the wall's tile, from the feet as they are
        fx32 c = sx ? actor->wPos.x : actor->wPos.z;
        s32 dir = sx ? sx : sz;
        s32 t = Following_Tile(c);
        fx32 edge = (dir < 0 ? t - (s32)tiles + 1 : t + (s32)tiles) * FOLLOWING_TILE;
        fx32 face = dir < 0 ? c - edge : edge - c;

        target = WALL_MARGIN - face;
        if (target < native) {
            target = native;
        }
    }
    return target;
}

// Moves line one step of LINE_STEP toward target
static s32 EaseLine(s32 line, s32 target) {
    if (line < target) {
        return line + LINE_STEP < target ? line + LINE_STEP : target;
    }
    if (line > target) {
        return line - LINE_STEP > target ? line - LINE_STEP : target;
    }
    return line;
}

// Whether a visible quad of another actor than quad is on material mat, and would lose rows to a split
static BOOL IsMaterialShared(const BillboardActorScene *scene, const BillboardActor *quad, u32 mat) {
    u32 i;

    for (i = 0; i < scene->setup.actorCount; i++) {
        const BillboardActor *other = &scene->actors[i];

        if (other != quad && other->visible && other->material == mat) {
            return TRUE;
        }
    }
    return FALSE;
}

// Splits a tall body in front of a wall: the field's quad keeps the base rows, and sUpper holds the strips above
static BOOL SplitBody(BillboardActorSys *system, BillboardActor *quad, FieldActor *actor,
                      const FollowingCamera *camera) {
    BillboardActorScene *scene;
    u32 mat;
    BillboardActorMaterial *material;
    s64 scale;
    s64 height;
    s64 half;
    FollowingCameraBasis basis;
    s32 target;
    FollowingPose body;
    s32 row;
    s16 stripScaleY;
    u32 sheetRow;
    u32 col;
    FollowingPose out[STRIP_COUNT];
    FollowingStripStack stack;
    u32 i;

    sUpper.live = NULL;
    // A 64-pixel billboard that isn't flipped upside down
    if (actor->config.billboardSize != ACTOR_BILLBOARD_SIZE_64 || quad->flipT) {
        return FALSE;
    }
    scene = system->scene;
    mat = quad->material;
    if (scene == NULL || scene->materials == NULL || scene->actors == NULL || mat >= scene->setup.materialCount) {
        return FALSE;
    }
    material = &scene->materials[mat];
    if (material->faceWidth != 64 || material->faceHeight != 64 || material->facesPerRow == 0 || quad->scaleY <= 0 ||
        (quad->scaleY & 63) || quad->scaleX <= 0) {
        return FALSE;
    }
    // The quad is 2 * scale * scaleY tall and scale * scaleX either side of its feet
    scale = scene->setup.scale.x;
    if (scale <= 0) {
        return FALSE;
    }
    height = (2 * scale * quad->scaleY) >> FX32_SHIFT;
    half = (scale * quad->scaleX) >> FX32_SHIFT;
    if (height <= 0 || height > 4 * (s64)FOLLOWING_TILE || half <= 0 || half > 4 * (s64)FOLLOWING_TILE) {
        return FALSE;
    }
    if (!FollowingRender_Basis(camera, &basis)) {
        return FALSE;
    }
    target = GetWallLine(actor, &basis, WALL_TILES, LINE_NATIVE);
    sLine = EaseLine(sLine, target);
    if (sLine <= LINE_NATIVE) {
        return FALSE;
    }
    // A visible quad of another actor on the follower's material would lose its upper rows
    if (IsMaterialShared(scene, quad, mat)) {
        return FALSE;
    }
    body.position = quad->pos;
    body.scaleX = quad->scaleX;
    body.scaleY = quad->scaleY;
    row = (s32)height / 64;
    stripScaleY = (s16)(quad->scaleY / (64 / STRIP_ROWS));
    // Faces are rows of the sheet. Face height h puts 64 / h faces in each 64-pixel row r, the first at r * 64 / h. A
    // row of the sheet holds one or two faces, so the face's row and column are counted out
    sheetRow = 0;
    col = quad->face;
    while (col >= material->facesPerRow) {
        col -= material->facesPerRow;
        sheetRow++;
    }
    stack.base = sLine;
    stack.forward = WALL_JUT;
    stack.rise = WALL_RISE;
    stack.ramp = WALL_RAMP;
    stack.cap = FOLLOWING_RENDER_SPLIT_CAP;
    if (!FollowingRender_Strips(&body, camera, (s32)half, (s32)height, row * STRIP_ROWS, STRIP_COUNT, &stack,
                                stripScaleY, out)) {
        return FALSE;
    }
    // Strip i shows rows 8i to 8i + 7 from the top of the frame; the field's quad keeps the last 8
    for (i = 0; i < STRIP_COUNT; i++) {
        BillboardActor *strip = &sUpper.strips[i];

        *strip = *quad;
        strip->material = 0;
        strip->type = 0;
        strip->pos = out[i].position;
        strip->scaleX = (s16)out[i].scaleX;
        strip->scaleY = (s16)out[i].scaleY;
        strip->face = (u16)((sheetRow * (64 / STRIP_ROWS) + i) * material->facesPerRow + col);
    }
    sUpper.material = *material;
    sUpper.material.faceHeight = STRIP_ROWS;
    FollowingRender_PrivateScene(&sUpper.scene, scene, sUpper.strips, &sUpper.material, STRIP_COUNT, 1);
    sUpper.scene.setup.basePolygonId = scene->setup.basePolygonId;
    sUpper.scene.setup.origin = scene->setup.origin;
    sUpper.scene.customNormal = scene->customNormal;
    sUpper.scene.normal = scene->normal;
    sUpper.scene.texOffsetS = scene->texOffsetS;
    sUpper.scene.texOffsetT = scene->texOffsetT;
    sUpper.live = material;
    sUpper.face = quad->face;
    sUpper.scaleY = quad->scaleY;
    sUpper.faceHeight = 64;
    sUpper.windows = 64 / STRIP_BASE_ROWS;
    material->faceHeight = STRIP_BASE_ROWS;
    quad->face = (u16)((sheetRow * (64 / STRIP_BASE_ROWS) + 64 / STRIP_BASE_ROWS - 1) * material->facesPerRow + col);
    quad->scaleY = (s16)(quad->scaleY / (64 / STRIP_BASE_ROWS));
    return TRUE;
}

// SplitBody for a 32-pixel body in front of a wall a tile behind it: the field's quad keeps the base rows, which don't
// move, and sUpper holds the strips above, each moved toward the camera to clear it, never past the feet's line
static BOOL SplitSmallBody(BillboardActorSys *system, BillboardActor *quad, FieldActor *actor,
                           const FollowingCamera *camera) {
    BillboardActorScene *scene;
    u32 mat;
    BillboardActorMaterial *material;
    s64 scale;
    s64 height;
    s64 half;
    FollowingCameraBasis basis;
    s32 target;
    FollowingPose body;
    s32 row;
    s16 stripScaleY;
    u32 sheetRow;
    u32 col;
    FollowingPose out[SMALL_STRIP_COUNT];
    FollowingStripStack stack;
    u32 i;

    sUpper.live = NULL;
    // A 32-pixel billboard that isn't flipped upside down
    if (actor->config.billboardSize != ACTOR_BILLBOARD_SIZE_32 || quad->flipT) {
        return FALSE;
    }
    scene = system->scene;
    mat = quad->material;
    if (scene == NULL || scene->materials == NULL || scene->actors == NULL || mat >= scene->setup.materialCount) {
        return FALSE;
    }
    material = &scene->materials[mat];
    if (material->faceWidth != 32 || material->faceHeight != 32 || material->facesPerRow == 0 || quad->scaleY <= 0 ||
        (quad->scaleY & 31) || quad->scaleX <= 0) {
        return FALSE;
    }
    // The quad is 2 * scale * scaleY tall and scale * scaleX either side of its feet
    scale = scene->setup.scale.x;
    if (scale <= 0) {
        return FALSE;
    }
    height = (2 * scale * quad->scaleY) >> FX32_SHIFT;
    half = (scale * quad->scaleX) >> FX32_SHIFT;
    if (height <= 0 || height > 2 * (s64)FOLLOWING_TILE || half <= 0 || half > 2 * (s64)FOLLOWING_TILE) {
        return FALSE;
    }
    if (!FollowingRender_Basis(camera, &basis)) {
        return FALSE;
    }
    // Never past the feet along the ground: the blinds lean forward, but no slat passes the bottom one
    target = GetWallLine(actor, &basis, SMALL_WALL_TILES, SMALL_LINE_NATIVE);
    if (target > 0) {
        target = 0;
    }
    sSmallLine = EaseLine(sSmallLine, target);
    if (sSmallLine <= SMALL_LINE_NATIVE || IsMaterialShared(scene, quad, mat)) {
        return FALSE;
    }
    body.position = quad->pos;
    body.scaleX = quad->scaleX;
    body.scaleY = quad->scaleY;
    row = (s32)height / 32;
    stripScaleY = (s16)(quad->scaleY / (32 / SMALL_STRIP_ROWS));
    sheetRow = 0;
    col = quad->face;
    while (col >= material->facesPerRow) {
        col -= material->facesPerRow;
        sheetRow++;
    }
    stack.base = sSmallLine;
    stack.forward = 0;
    stack.rise = 0;
    stack.ramp = FX32_ONE;
    stack.cap = FOLLOWING_RENDER_SPLIT_CAP;
    if (!FollowingRender_Strips(&body, camera, (s32)half, (s32)height, row * SMALL_STRIP_ROWS, SMALL_STRIP_COUNT,
                                &stack, stripScaleY, out)) {
        return FALSE;
    }
    // Strip i shows rows 8i to 8i + 7 from the top of the frame; the field's quad keeps the last 8
    for (i = 0; i < SMALL_STRIP_COUNT; i++) {
        BillboardActor *strip = &sUpper.strips[i];

        *strip = *quad;
        strip->material = 0;
        strip->type = 0;
        strip->pos = out[i].position;
        strip->scaleX = (s16)out[i].scaleX;
        strip->scaleY = (s16)out[i].scaleY;
        strip->face = (u16)((sheetRow * (32 / SMALL_STRIP_ROWS) + i) * material->facesPerRow + col);
    }
    sUpper.material = *material;
    sUpper.material.faceHeight = SMALL_STRIP_ROWS;
    FollowingRender_PrivateScene(&sUpper.scene, scene, sUpper.strips, &sUpper.material, SMALL_STRIP_COUNT, 1);
    sUpper.scene.setup.basePolygonId = scene->setup.basePolygonId;
    sUpper.scene.setup.origin = scene->setup.origin;
    sUpper.scene.customNormal = scene->customNormal;
    sUpper.scene.normal = scene->normal;
    sUpper.scene.texOffsetS = scene->texOffsetS;
    sUpper.scene.texOffsetT = scene->texOffsetT;
    sUpper.live = material;
    sUpper.face = quad->face;
    sUpper.scaleY = quad->scaleY;
    sUpper.faceHeight = 32;
    sUpper.windows = 32 / SMALL_STRIP_BASE_ROWS;
    material->faceHeight = SMALL_STRIP_BASE_ROWS;
    quad->face =
        (u16)((sheetRow * (32 / SMALL_STRIP_BASE_ROWS) + 32 / SMALL_STRIP_BASE_ROWS - 1) * material->facesPerRow + col);
    quad->scaleY = (s16)(quad->scaleY / (32 / SMALL_STRIP_BASE_ROWS));
    return TRUE;
}

void FollowingRender_Draw(BillboardActorSys *system, G3DCamera *camera, G3DLight *lights, FieldActor *follower,
                          FieldActor *player, s32 spriteY, BOOL shaded, BOOL covered) {
    BillboardActor *quad = NULL;
    BillboardActor *playerQuad = NULL;
    FollowingPose original;
    FollowingPose adjusted;
    FollowingPose drawn;
    BOOL changed = FALSE;
    BOOL lightingChanged = FALSE;
    BOOL hidden = FALSE;
    u16 originalLights = 0;

    sSubmitted.actor = sSubmitted.player = NULL;
    if (system != NULL && camera != NULL && follower != NULL && player != NULL && follower != player &&
        follower->actorSystem == player->actorSystem) {
        quad = GetBillboard(system, follower);
        playerQuad = GetBillboard(system, player);
        if (quad != NULL) {
            FollowingCamera view;
            s32 delta;
            s64 y;

            original.position = quad->pos;
            original.scaleX = quad->scaleX;
            original.scaleY = quad->scaleY;
            adjusted = original;
            if (playerQuad != NULL && quad != playerQuad) {
                // As FldAct_SyncLights: a shaded actor has light 3 alone, any other light 0 alone. The follower's own
                // tile decides, not the player's. A map that gives the player any other mask keeps sharing it
                u16 mask = playerQuad->lights;

                if (mask == FOLLOWING_LIGHTS_SUN || mask == FOLLOWING_LIGHTS_SHADE) {
                    mask = shaded ? FOLLOWING_LIGHTS_SHADE : FOLLOWING_LIGHTS_SUN;
                }
                originalLights = quad->lights;
                quad->lights = mask;
                lightingChanged = quad->lights != originalLights;
            }
            GetCamera(camera, &view);
            // The registry's Y replaces the config's on this quad only. Every facing uses that one offset, then
            // FOLLOWING_SPRITE_LIFT. The engine's hop stays in the field's billboard. No facing adds Z, and the actor
            // and its oval aren't written
            delta = spriteY - follower->config.wPosOffsetY + FOLLOWING_SPRITE_LIFT;
            y = (s64)adjusted.position.y + (s64)delta * FX32_ONE;
            if (delta != 0 && y >= LONG_MIN && y <= LONG_MAX) {
                adjusted.position.y = (fx32)y;
                changed = TRUE;
            }
            drawn = adjusted;
            sSubmitted.world = follower->wPos;
            sSubmitted.native = original.position;
            sSubmitted.resource = follower->config.rscIndices.res1;
            sSubmitted.submitted.position = drawn.position;
            sSubmitted.submitted.scaleX = (s16)drawn.scaleX;
            sSubmitted.submitted.scaleY = (s16)drawn.scaleY;
            sSubmitted.actor = follower;
            if (playerQuad != NULL) {
                sSubmitted.player = player;
                sSubmitted.playerWorld = player->wPos;
                sSubmitted.playerSubmitted.position = playerQuad->pos;
                sSubmitted.playerSubmitted.scaleX = playerQuad->scaleX;
                sSubmitted.playerSubmitted.scaleY = playerQuad->scaleY;
            }
            if (covered) {
                // A ball effect draws the body's silhouette in its place this frame
                quad->visible = FALSE;
                hidden = TRUE;
            } else {
                // The strips are cut from the lowered quad, whose scale is a whole number of rows, then the base
                // window is pulled with the rest of the body
                quad->pos = adjusted.position;
                if (SplitBody(system, quad, follower, &view) || SplitSmallBody(system, quad, follower, &view)) {
                    quad->scaleY = (s16)(drawn.scaleY / sUpper.windows);
                } else {
                    quad->scaleY = (s16)drawn.scaleY;
                }
                quad->pos = drawn.position;
                quad->scaleX = (s16)drawn.scaleX;
            }
        }
    }
    BillboardActorSys_Draw(system, camera, lights);
    // The draw uses the quads at once. The player's quad is never written: only the follower's quad, its material and
    // its light mask are put back
    if (sUpper.live != NULL) {
        sUpper.live->faceHeight = sUpper.faceHeight;
        quad->face = sUpper.face;
        quad->scaleY = sUpper.scaleY;
    }
    if (changed) {
        quad->pos = original.position;
        quad->scaleX = (s16)original.scaleX;
        quad->scaleY = (s16)original.scaleY;
    }
    if (lightingChanged) {
        quad->lights = originalLights;
    }
    if (hidden) {
        quad->visible = TRUE;
    }
    if (sUpper.live != NULL) {
        sUpper.live = NULL;
        BillboardActorScene_Draw(&sUpper.scene, camera, lights);
    }
}
