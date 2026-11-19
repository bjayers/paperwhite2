#include "types.h"
#include "field/field.h"
#include "field/field_actor.h"
#include "field/field_actor_internal.h"
#include "field/field_camera.h"
#include "field/field_g3d_mapper.h"
#include "field/zone.h"
#include "gfl/arc.h"
#include "gfl/billboard_actor.h"
#include "gfl/g3d.h"
#include "nitro/fx.h"
#include "nitro/gx.h"
#include "nitro/mi.h"
#include "paperwhite2/entralink_markers.h"
#include "paperwhite2/entralink_run.h"
#include "paperwhite2/entralink_run_config.h"
#include "paperwhite2/entralink_run_state.h"
#include "system/game_data.h"
#include "system/game_system.h"

// Paper White 2: the Entralink run's markers (paperwhite2/entralink_markers.h). The ground markers are flat quads
// lying on the ground (BILLBOARD_ACTOR_TYPE_FACE_CAMERA_Y_FLAT, as the footprints and the actors' shadows lie), 2 by 2
// tiles; the NPC markers are quads facing the camera over the NPCs' heads, as the emote bubbles are, and over an item
// room's ball its item's bag icon, 2 by 2 tiles. Their art is the model table's members from ENTRALINK_RUN_MARKER_FILE
// (tools/paperwhite2/entralink_run.py; the icons the bag's own graphics and palettes), each a 16-color texture
// read with its palette, uploaded to VRAM and trimmed from main memory as the field's effects' textures are. They have
// a billboard system of their own, so the field's effects keep every material and actor they had

// The system's materials (each texture loaded once while the field lasts: the doors' at most 3, the NPC markers' and
// an item room's 3 icons) and actors (the doors' and the NPCs')
#define MARKER_MATERIALS 16
#define MARKER_NPCS 16
#define MARKER_ACTORS (ENTRALINK_RUN_DOORS + MARKER_NPCS)
// The frames between two looks at what the doors show (the catch marker follows the run's bag)
#define MARKER_REFRESH_FRAMES 16

// A ground marker is 32 by 32 texels over 2 by 2 tiles, an NPC's 16 by 16 texels over one: billboard.c's quad is 2
// units of an actor's scale either way, times the scene's, which is the field effects' (field_effect.c), 8
#define MARKER_SIZE 32
#define NPC_MARKER_SIZE 16
#define MARKER_TEX_SIZE (GX_TEXSIZE_S32 << 4 | GX_TEXSIZE_T32)
#define NPC_MARKER_TEX_SIZE (GX_TEXSIZE_S16 << 4 | GX_TEXSIZE_T16)
#define MARKER_SCALE FX32_CONST(2)
#define NPC_MARKER_SCALE FX32_CONST(1)
#define MARKER_SCENE_SCALE FX32_CONST(8)
// billboard.c's material format 0, GX_TEXFMT_PLTT16
#define MARKER_FORMAT_PLTT16 0
#define MARKER_ALPHA 31
// A tile, and the space between the top of an NPC's sprite (32 units for a person, whose head is a few under it) and
// its marker's middle, along the camera's up
#define TILE_SIZE FX32_CONST(16)
#define NPC_MARKER_GAP FX32_CONST(2)
// The space between the top of an item room ball's sprite and its icon's middle: the ball fills only the lower half of
// its 32-unit billboard, so the 32-unit icon's bottom sits just over the ball
#define ICON_GAP FX32_CONST(2)

#define NO_FILE 0xffff

typedef struct {
    BillboardActorSys *sys;
    // The run's room the actors are for, and whether it was done at the doors' last look
    u8 room;
    u8 cleared;
    u8 refresh;
    u8 materialCount;
    // Each material's member of the model table and its texture material in the system
    u16 materialFiles[MARKER_MATERIALS];
    u16 materials[MARKER_MATERIALS];
    // What each door and NPC shows (ENTRALINK_MARKER_*, an NPC marker, or none) and its actor
    u8 doorMarkers[ENTRALINK_RUN_DOORS];
    u16 doorActors[ENTRALINK_RUN_DOORS];
    u8 npcMarkers[MARKER_NPCS];
    u16 npcActors[MARKER_NPCS];
} EntralinkMarkers;

static EntralinkMarkers sMarkers;

// A marker's texture material: loaded the first time, or BILLBOARD_ACTOR_NONE when the art is missing or the
// materials are all used
static u32 Markers_GetMaterial(Field *field, u32 file, u32 size, u32 texSize) {
    ArcTool *arc = Field_GetActorSystem(field)->actorConfigArc;
    BillboardActorMatRequest request;
    u32 i;

    for (i = 0; i < sMarkers.materialCount; i++) {
        if (sMarkers.materialFiles[i] == file) {
            return sMarkers.materials[i];
        }
    }
    if (sMarkers.materialCount >= MARKER_MATERIALS || file >= GFL_ArcToolGetDataMax(arc)) {
        return BILLBOARD_ACTOR_NONE;
    }
    request.texResource = GFL_G3DSysReadArcToolResource(arc, file);
    if (request.texResource == NULL) {
        return BILLBOARD_ACTOR_NONE;
    }
    request.format = MARKER_FORMAT_PLTT16;
    request.size = texSize;
    request.faceWidth = size;
    request.faceHeight = size;
    request.mode = BILLBOARD_ACTOR_LOAD_TRIM;
    sMarkers.materialFiles[sMarkers.materialCount] = file;
    sMarkers.materials[sMarkers.materialCount] = BillboardActorSys_ExecMatLoadRequests(sMarkers.sys, &request, 1);
    return sMarkers.materials[sMarkers.materialCount++];
}

static u32 Markers_GetDoorMaterial(Field *field, u32 marker) {
    return Markers_GetMaterial(field, ENTRALINK_RUN_MARKER_FILE + marker, MARKER_SIZE, MARKER_TEX_SIZE);
}

static BOOL Markers_IsIcon(u32 marker) {
    return (marker & ENTRALINK_NPC_MARKER_ICON) != 0;
}

// An NPC marker's material, or an item's bag icon's (ENTRALINK_NPC_MARKER_ICON)
static u32 Markers_GetNpcMaterial(Field *field, u32 marker) {
    u32 icon = marker & ~ENTRALINK_NPC_MARKER_ICON;

    if (Markers_IsIcon(marker)) {
        if (icon >= ENTRALINK_RUN_ITEM_ICON_COUNT) {
            return BILLBOARD_ACTOR_NONE;
        }
        return Markers_GetMaterial(field, ENTRALINK_RUN_ITEM_ICON_FILE + icon, MARKER_SIZE, MARKER_TEX_SIZE);
    }
    if (marker >= ENTRALINK_RUN_NPC_MARKER_COUNT) {
        return BILLBOARD_ACTOR_NONE;
    }
    return Markers_GetMaterial(field, ENTRALINK_RUN_NPC_MARKER_FILE + marker, NPC_MARKER_SIZE, NPC_MARKER_TEX_SIZE);
}

// An actor of a material at a place, unlit (the texture's own colors), or BILLBOARD_ACTOR_NONE
static u16 Markers_AddActor(u32 material, const VecFx32 *pos, fx32 scale, u32 type) {
    BillboardActorRequest request;

    if (material == BILLBOARD_ACTOR_NONE) {
        return BILLBOARD_ACTOR_NONE;
    }
    request.texMat = material;
    request.scaleX = scale;
    request.scaleY = scale;
    request.alpha = MARKER_ALPHA;
    request.visible = TRUE;
    request.lights = 0;
    request.pos = *pos;
    request.callback = NULL;
    request.callbackData = NULL;
    return BillboardActorSys_ExecActorRequests(sMarkers.sys, 0, &request, 1, type);
}

static void Markers_DeleteActor(u16 *actor) {
    if (*actor != BILLBOARD_ACTOR_NONE) {
        BillboardActorSys_DeleteActors(sMarkers.sys, *actor, 1);
        *actor = BILLBOARD_ACTOR_NONE;
    }
}

static void Markers_SetActorPos(u16 actor, const VecFx32 *pos) {
    BillboardActorScene_SetActorPos(BillboardActorSys_GetScene(sMarkers.sys),
                                    BillboardActorSys_GetSceneActor(sMarkers.sys, actor), pos);
}

// Takes every marker away, keeping the textures
static void Markers_Clear(void) {
    u32 i;

    for (i = 0; i < ENTRALINK_RUN_DOORS; i++) {
        Markers_DeleteActor(&sMarkers.doorActors[i]);
        sMarkers.doorMarkers[i] = ENTRALINK_MARKER_NONE;
    }
    for (i = 0; i < MARKER_NPCS; i++) {
        Markers_DeleteActor(&sMarkers.npcActors[i]);
        sMarkers.npcMarkers[i] = ENTRALINK_NPC_MARKER_NONE;
    }
    sMarkers.refresh = 0;
}

// The middle of a door's marker, on the ground
static void Markers_GetDoorPos(Field *field, u32 door, VecFx32 *pos) {
    FieldG3DMapperTerrain terrain;
    u32 x;
    u32 z;

    EntralinkRun_GetMarkerSpot(door, &x, &z);
    pos->x = (fx32)(x + 1) * TILE_SIZE;
    pos->y = 0;
    pos->z = (fx32)(z + 1) * TILE_SIZE;
    if (FieldG3DMapper_GetTerrainAll(Field_GetG3DMapper(field), pos, &terrain) && terrain.layerCount != 0) {
        pos->y = terrain.layers[0].height;
    }
}

// What the doors show, once the room is done: made again where it changed (the catch marker comes and goes with the
// Nightmare Ball in the run's bag)
static void Markers_UpdateDoors(Field *field, GameData *gameData, EntralinkRunState *state) {
    VecFx32 pos;
    u32 marker;
    u32 door;

    for (door = 0; door < ENTRALINK_RUN_DOORS; door++) {
        marker = state->cleared ? EntralinkRun_GetDoorMarker(gameData, door) : ENTRALINK_MARKER_NONE;
        if (marker == sMarkers.doorMarkers[door]) {
            continue;
        }
        Markers_DeleteActor(&sMarkers.doorActors[door]);
        sMarkers.doorMarkers[door] = marker;
        if (marker != ENTRALINK_MARKER_NONE) {
            Markers_GetDoorPos(field, door, &pos);
            sMarkers.doorActors[door] = Markers_AddActor(Markers_GetDoorMaterial(field, marker), &pos, MARKER_SCALE,
                                                         BILLBOARD_ACTOR_TYPE_FACE_CAMERA_Y_FLAT);
        }
    }
}

// The way the camera's up points in the world, which a quad facing the camera stands along (billboard.c's rotation for
// BILLBOARD_ACTOR_TYPE_FACE_CAMERA, the camera's inverse): its up vector less its part along the view, so leaning
// back from the camera as far as the camera looks down
static void Markers_GetCameraUp(Field *field, VecFx32 *up) {
    G3DCamera *camera = FieldCamera_GetG3DCamera(Field_GetCameraSystem(field));
    VecFx32 eye;
    VecFx32 target;
    VecFx32 view;

    GFL_G3DCameraGetLookatPos(camera, &eye);
    GFL_G3DCameraGetLookatTarget(camera, &target);
    GFL_G3DCameraGetLookatUpVector(camera, up);
    VEC_Subtract(&eye, &target, &view);
    VEC_Normalize(&view, &view);
    VEC_MultAdd(-VEC_DotProduct(up, &view), &view, up, up);
    VEC_Normalize(up, up);
}

// The height of an NPC's sprite over its feet
static fx32 Markers_GetSpriteHeight(FieldActor *actor) {
    switch (GetActorMdlInfo(actor)->billboardSize) {
    case ACTOR_BILLBOARD_SIZE_16:
        return FX32_CONST(16);
    case ACTOR_BILLBOARD_SIZE_64:
        return FX32_CONST(64);
    }
    return FX32_CONST(32);
}

// Each NPC's marker over its head while it stands in the room. The NPC's sprite, a quad facing the camera, stands from
// its feet (the actors' scene's origin, fieldmap.c) along the camera's up, so the marker goes along it too, from where
// the sprite is drawn: straight up from the feet it was in front of the head, toward the camera. An item room ball's
// icon keeps straight up, over the ball in the lower half of its sprite
static void Markers_UpdateNpcs(Field *field) {
    MMSys *actorSystem = Field_GetActorSystem(field);
    FieldActor *actor;
    VecFx32 pos;
    VecFx32 offset;
    VecFx32 up;
    u32 marker;
    u32 i;

    Markers_GetCameraUp(field, &up);
    for (i = 0; i < MARKER_NPCS; i++) {
        marker = EntralinkRun_GetNpcMarker(i);
        actor = marker != ENTRALINK_NPC_MARKER_NONE ? FindFieldActor(actorSystem, i) : NULL;
        if (actor == NULL) {
            marker = ENTRALINK_NPC_MARKER_NONE;
        }
        if (marker != sMarkers.npcMarkers[i]) {
            Markers_DeleteActor(&sMarkers.npcActors[i]);
            sMarkers.npcMarkers[i] = marker;
        }
        if (actor == NULL) {
            continue;
        }
        if (Markers_IsIcon(marker)) {
            CopyActorWPos(actor, &pos);
            CopyActorPosOffset(actor, &offset);
            VEC_Add(&pos, &offset, &pos);
            pos.y += Markers_GetSpriteHeight(actor) + ICON_GAP;
        } else {
            CopyActorPosAllAdd(actor, &pos);
            pos.y += Field_GetActorYOffset(field);
            VEC_MultAdd(Markers_GetSpriteHeight(actor) + NPC_MARKER_GAP, &up, &pos, &pos);
        }
        if (sMarkers.npcActors[i] == BILLBOARD_ACTOR_NONE) {
            sMarkers.npcActors[i] = Markers_AddActor(Markers_GetNpcMaterial(field, marker), &pos,
                                                     Markers_IsIcon(marker) ? MARKER_SCALE : NPC_MARKER_SCALE,
                                                     BILLBOARD_ACTOR_TYPE_FACE_CAMERA);
        } else {
            Markers_SetActorPos(sMarkers.npcActors[i], &pos);
        }
    }
}

// Loads the room's textures as it is entered, while the screen fades in, so none is sent to VRAM in the middle of play:
// what the doors show now and the NPCs' markers
static void Markers_Preload(Field *field, GameData *gameData) {
    u32 marker;
    u32 i;

    for (i = 0; i < ENTRALINK_RUN_DOORS; i++) {
        marker = EntralinkRun_GetDoorMarker(gameData, i);
        if (marker != ENTRALINK_MARKER_NONE) {
            Markers_GetDoorMaterial(field, marker);
        }
    }
    for (i = 0; i < MARKER_NPCS; i++) {
        marker = EntralinkRun_GetNpcMarker(i);
        if (marker != ENTRALINK_NPC_MARKER_NONE) {
            Markers_GetNpcMaterial(field, marker);
        }
    }
}

// The scene's scale and polygon IDs, as the field's effects have them (FieldEffects_Create)
static void Markers_SetupScene(BillboardActorScene *scene) {
    VecFx32 scale = { MARKER_SCENE_SCALE, MARKER_SCENE_SCALE, MARKER_SCENE_SCALE };
    u8 polygonId = 0;

    BillboardActorScene_SetScale(scene, &scale);
    BillboardActorScene_SetBasePolyID(scene, &polygonId);
}

void PaperWhite2_EntralinkMarkersUpdate(Field *field) {
    GameData *gameData = GSYS_GetGameData(Field_GetGameSystem(field));
    EntralinkRunState *state = EntralinkRun_GetState();

    if (!EntralinkRun_IsActive(gameData) || !GetZoneIsEntreeForest(Field_GetPlayerStateZoneID(field))) {
        if (sMarkers.sys != NULL) {
            Markers_Clear();
        }
        return;
    }
    if (sMarkers.sys == NULL) {
        MI_CpuFill8(&sMarkers, 0, sizeof(sMarkers));
        sMarkers.sys =
            BillboardActorSys_Create(MARKER_MATERIALS, MARKER_ACTORS, FldActSys_VRAMUploadFunc, Field_GetHeapID(field));
        Markers_SetupScene(BillboardActorSys_GetScene(sMarkers.sys));
        MI_CpuFill16(sMarkers.doorActors, BILLBOARD_ACTOR_NONE, sizeof(sMarkers.doorActors));
        MI_CpuFill16(sMarkers.npcActors, BILLBOARD_ACTOR_NONE, sizeof(sMarkers.npcActors));
        MI_CpuFill8(sMarkers.doorMarkers, ENTRALINK_MARKER_NONE, sizeof(sMarkers.doorMarkers));
        MI_CpuFill8(sMarkers.npcMarkers, ENTRALINK_NPC_MARKER_NONE, sizeof(sMarkers.npcMarkers));
        sMarkers.room = state->room;
        Markers_Preload(field, gameData);
    }
    if (sMarkers.room != state->room) {
        Markers_Clear();
        sMarkers.room = state->room;
    }
    if (sMarkers.refresh == 0 || sMarkers.cleared != state->cleared) {
        sMarkers.refresh = MARKER_REFRESH_FRAMES;
        sMarkers.cleared = state->cleared;
        Markers_UpdateDoors(field, gameData, state);
    }
    sMarkers.refresh--;
    Markers_UpdateNpcs(field);
}

void PaperWhite2_EntralinkMarkersDraw(G3DCamera *camera, G3DLight *lights) {
    if (sMarkers.sys != NULL) {
        BillboardActorSys_Draw(sMarkers.sys, camera, lights);
    }
}

void PaperWhite2_EntralinkMarkersFree(void) {
    if (sMarkers.sys != NULL) {
        BillboardActorSys_Free(sMarkers.sys);
    }
    MI_CpuFill8(&sMarkers, 0, sizeof(sMarkers));
}
