#include "types.h"
#include "field/field_actor.h"
#include "field/field_actor_internal.h"
#include "gfl/arc.h"
#include "gfl/billboard_actor.h"
#include "gfl/g3d.h"
#include "nitro/gx.h"
#include "nitro/mi.h"
#include "nnsys/gfd.h"
#include "paperwhite2/actor_palettes.h"
#include "paperwhite2/following.h"
#include "paperwhite2/palette_variation.h"

// Paper White 2: field billboards with a palette of their own (paperwhite2/actor_palettes.h,
// docs/paperwhite2/design/palette-variation.md). The field's sprites share one material an object code, and so one
// palette: every wanderer of a species, and the follower, looked alike. A slot's billboard draws a copy of its material
// instead, the same texture VRAM with a 16-colour palette of its own, its sprite's colours varied by its PID. The
// sprite's colours are kept as its sheet loads (a trimmed sheet keeps no palette in main memory, and palette VRAM
// can't be read back): those of every follower sprite, and of the sprites the slots wait for. A slot whose sprite's
// colours aren't kept (loaded before it was wanted, its colours since replaced by others') reads them from the sheet's
// file in the archive, its palette only. A follower code's colours are its row's battle palette, normal or shiny, which
// the build writes into the model table (FOLLOWING_PALETTES_FILE, docs/paperwhite2/design/follower-palette-remap.md):
// the sheet's indices are the battle palette's, so a shiny follower or wanderer shows its normal row's sheet in the
// shiny colours

// The colours of a sprite's palette (a 16-colour texture's)
#define ACTOR_PALETTE_COLORS 16
// How many sprites' colours are kept, the oldest replaced first unless a slot shows it
#define ACTOR_PALETTE_CAPTURES 8
// The kind of a G3D file's texture block, "TEX0"
#define ACTOR_PALETTE_TEX_BLOCK 0x30584554
// The followers' palettes' header: "FWCL", its version and the count of codes it covers; then a u16 a code, the index
// of its pair of palettes (normal, then shiny) or ACTOR_PALETTE_NONE
#define ACTOR_PALETTE_MAGIC 0x4c435746
#define ACTOR_PALETTE_VERSION 1
#define ACTOR_PALETTE_HEADER_SIZE 8
#define ACTOR_PALETTE_NONE 0xffff

typedef struct {
    u16 objCode;
    u16 count;
    u32 age;
    u16 colors[ACTOR_PALETTE_COLORS];
} CapturedPalette;

typedef struct {
    // The individual: its sprite, species and PID (and shininess, below), and whether it changed since its colours
    // were made
    u16 objCode;
    u8 changed;
    // Whether it has its copy: the billboard of sys it's on, the shared material it copies and the copy
    u8 bound;
    BillboardActorSys *sys;
    u16 billboard;
    u16 source;
    u16 material;
    // Whether its sprite's colours were neither kept nor could be read from its file: it stays on the shared material
    // and isn't read again until its sprite changes
    u8 unreadable;
    // Whether it is shiny: its colours are its code's battle shiny palette
    u8 shiny;
    u32 species;
    u32 personality;
    // Its colours, which the VBlank's transfer reads (in main memory, not the stack)
    u16 colors[ACTOR_PALETTE_COLORS];
} ActorPalette;

static ActorPalette sSlots[ACTOR_PALETTES];
static CapturedPalette sCaptured[ACTOR_PALETTE_CAPTURES];
static u32 sAge;

static CapturedPalette *ActorPalettes_FindCaptured(u16 objCode) {
    u32 i;

    for (i = 0; i < ACTOR_PALETTE_CAPTURES; i++) {
        if (sCaptured[i].count != 0 && sCaptured[i].objCode == objCode) {
            return &sCaptured[i];
        }
    }
    return NULL;
}

static BOOL ActorPalettes_IsWanted(u16 objCode) {
    u32 i;

    for (i = 0; i < ACTOR_PALETTES; i++) {
        if (sSlots[i].objCode == objCode) {
            return TRUE;
        }
    }
    return FALSE;
}

// Whether a handle of sys is a billboard that's out
static BOOL ActorPalettes_IsOut(BillboardActorSys *sys, u16 billboard) {
    return billboard < sys->handleCount && sys->handles[billboard].actor != BILLBOARD_ACTOR_NONE;
}

// Keeps a sprite's colours, in its entry or a free one, or else the oldest that no slot shows
static void ActorPalettes_Keep(u16 objCode, const u16 *colors, u32 count) {
    CapturedPalette *entry = ActorPalettes_FindCaptured(objCode);
    u32 i;

    if (entry == NULL) {
        for (i = 0; i < ACTOR_PALETTE_CAPTURES; i++) {
            if (sCaptured[i].count == 0) {
                entry = &sCaptured[i];
                break;
            }
            if (!ActorPalettes_IsWanted(sCaptured[i].objCode) && (entry == NULL || sCaptured[i].age < entry->age)) {
                entry = &sCaptured[i];
            }
        }
        if (entry == NULL) {
            return;
        }
    }
    entry->objCode = objCode;
    entry->count = (u16)count;
    entry->age = ++sAge;
    MI_CpuCopy16(colors, entry->colors, count * sizeof(u16));
}

// The colours of a sprite whose load wasn't seen, read from its sheet's file in the field actors' archive and kept as a
// capture's: the file's header, its texture block's offset and header, then the palette, 124 bytes of reads in all and
// never the sheet. FALSE where the file isn't a texture with a palette
static BOOL ActorPalettes_ReadFromArchive(MMSys *actorSystem, u16 objCode) {
    ArcTool *arc = GetMMSysDataArcHandle(actorSystem);
    FieldActorConfig config;
    NNSG3dResFileHeader header;
    NNSG3dResTex tex;
    u16 colors[ACTOR_PALETTE_COLORS];
    u32 fileId;
    u32 length;
    u32 offset;
    u32 blockOfs;
    u32 count;

    GetNPCMdlInfoForOBJCODE(actorSystem, objCode, &config);
    fileId = GetNPCMdlInfoG2DRscGroup(&config)->res1;
    if (config.uid != objCode || fileId >= GFL_ArcToolGetDataMax(arc)) {
        return FALSE;
    }
    length = GFL_ArcToolGetDataLength(arc, fileId);
    if (length < sizeof(header)) {
        return FALSE;
    }
    GFL_ArcToolReadRange(arc, fileId, 0, sizeof(header), &header);
    // The texture block is a texture file's only one, and a model file's second (as NNS_G3dGetTex finds it); the
    // blocks' offsets follow the header
    if (header.dataBlocks == 0 || (header.dataBlocks == 1 && header.signature != NNS_G3D_SIGNATURE_BTX0)) {
        return FALSE;
    }
    offset = header.headerSize + (header.dataBlocks == 1 ? 0 : sizeof(u32));
    if (offset + sizeof(blockOfs) > length) {
        return FALSE;
    }
    GFL_ArcToolReadRange(arc, fileId, offset, sizeof(blockOfs), &blockOfs);
    if (blockOfs >= length || length - blockOfs < sizeof(tex)) {
        return FALSE;
    }
    GFL_ArcToolReadRange(arc, fileId, blockOfs, sizeof(tex), &tex);
    // The palette's size is in units of 8 bytes, 4 colours
    count = tex.plttInfo.sizePltt * 4;
    if (count > ACTOR_PALETTE_COLORS) {
        count = ACTOR_PALETTE_COLORS;
    }
    if (tex.header.kind != ACTOR_PALETTE_TEX_BLOCK || count == 0 || tex.plttInfo.ofsPlttData >= length - blockOfs ||
        length - blockOfs - tex.plttInfo.ofsPlttData < count * sizeof(u16)) {
        return FALSE;
    }
    GFL_ArcToolReadRange(arc, fileId, blockOfs + tex.plttInfo.ofsPlttData, count * sizeof(u16), colors);
    ActorPalettes_Keep(objCode, colors, count);
    return TRUE;
}

// A follower code's colours from the followers' palettes, its battle group's normal or shiny palette. FALSE where the
// code has none (its sheet keeps its own colours) or the member isn't there
static BOOL ActorPalettes_ReadGenerated(MMSys *actorSystem, ActorPalette *slot) {
    ArcTool *arc = actorSystem->actorConfigArc;
    u32 header[ACTOR_PALETTE_HEADER_SIZE / sizeof(u32)];
    u32 count;
    u32 length;
    u32 offset;
    u16 index;

    if (slot->objCode < FOLLOWING_CODE_BASE || arc == NULL || GFL_ArcToolGetDataMax(arc) <= FOLLOWING_PALETTES_FILE) {
        return FALSE;
    }
    length = GFL_ArcToolGetDataLength(arc, FOLLOWING_PALETTES_FILE);
    if (length < sizeof(header)) {
        return FALSE;
    }
    GFL_ArcToolReadRange(arc, FOLLOWING_PALETTES_FILE, 0, sizeof(header), header);
    count = header[1] >> 16;
    if (header[0] != ACTOR_PALETTE_MAGIC || (header[1] & 0xffff) != ACTOR_PALETTE_VERSION ||
        slot->objCode - FOLLOWING_CODE_BASE >= count || length < sizeof(header) + count * sizeof(u16)) {
        return FALSE;
    }
    GFL_ArcToolReadRange(arc, FOLLOWING_PALETTES_FILE,
                         sizeof(header) + (slot->objCode - FOLLOWING_CODE_BASE) * sizeof(u16), sizeof(index), &index);
    if (index == ACTOR_PALETTE_NONE) {
        return FALSE;
    }
    // A pair is the normal palette, then the shiny one
    offset = sizeof(header) + count * sizeof(u16) + (index * 2 + (slot->shiny ? 1 : 0)) * sizeof(slot->colors);
    if (offset > length || length - offset < sizeof(slot->colors)) {
        return FALSE;
    }
    GFL_ArcToolReadRange(arc, FOLLOWING_PALETTES_FILE, offset, sizeof(slot->colors), slot->colors);
    return TRUE;
}

// The slot's unvaried colours: its code's battle palette, else its sprite's colours as kept, else read from its file
// (once a sprite). FALSE where there are none
static BOOL ActorPalettes_LoadBase(ActorPalette *slot, MMSys *actorSystem) {
    const CapturedPalette *captured;

    MI_CpuClear16(slot->colors, sizeof(slot->colors));
    if (ActorPalettes_ReadGenerated(actorSystem, slot)) {
        return TRUE;
    }
    captured = ActorPalettes_FindCaptured(slot->objCode);
    if (captured == NULL && !slot->unreadable && ActorPalettes_ReadFromArchive(actorSystem, slot->objCode)) {
        captured = ActorPalettes_FindCaptured(slot->objCode);
    }
    if (captured == NULL) {
        slot->unreadable = TRUE;
        return FALSE;
    }
    MI_CpuCopy16(captured->colors, slot->colors, captured->count * sizeof(u16));
    return TRUE;
}

// The slot's colours varied by its PID and sent to its palette
static void ActorPalettes_Upload(ActorPalette *slot) {
    u32 plttAddr;

    PaperWhite2_VaryPalette(slot->colors, ACTOR_PALETTE_COLORS, slot->species, slot->personality);
    BillboardActorScene_GetMaterialPlttAddr(slot->sys->scene, slot->material, &plttAddr);
    if (slot->sys->transfer != NULL) {
        slot->sys->transfer(TRUE, plttAddr, slot->colors, sizeof(slot->colors));
    }
    slot->changed = FALSE;
}

// The slot's copy freed, and its billboard, if still on it, put back on the shared material
static void ActorPalettes_Unbind(ActorPalette *slot) {
    BillboardActorScene *scene;

    if (!slot->bound) {
        return;
    }
    scene = slot->sys->scene;
    if (ActorPalettes_IsOut(slot->sys, slot->billboard)) {
        u32 actor = slot->sys->handles[slot->billboard].actor;
        u16 material;

        BillboardActorScene_GetActorMaterial(scene, actor, &material);
        if (material == slot->material) {
            BillboardActorScene_SetActorMaterial(scene, actor, &slot->source);
        }
    }
    PaperWhite2_BillboardActorScene_FreeMaterialOwnPltt(scene, slot->material);
    slot->bound = FALSE;
}

// The slot's copy of the billboard's material, with its palette
static BOOL ActorPalettes_MakeCopy(ActorPalette *slot, MMSys *actorSystem, BillboardActorSys *sys, u16 billboard,
                                   u16 source) {
    BillboardActorScene *scene = sys->scene;
    NNSGfdPlttKey key;
    u32 material;

    if (source >= scene->setup.materialCount || scene->materials[source].texFormat != GX_TEXFMT_PLTT16) {
        return FALSE;
    }
    if (!ActorPalettes_LoadBase(slot, actorSystem)) {
        return FALSE;
    }
    key = NNS_GfdAllocPlttVram(sizeof(slot->colors), FALSE, 0);
    if (key == NNS_GFD_ALLOC_ERROR_PLTTKEY) {
        return FALSE;
    }
    material = PaperWhite2_BillboardActorScene_AddMaterialOwnPltt(scene, source, key);
    if (material == BILLBOARD_ACTOR_MATERIAL_NONE) {
        NNS_GfdFreePlttVram(key);
        return FALSE;
    }
    slot->sys = sys;
    slot->billboard = billboard;
    slot->source = source;
    slot->material = (u16)material;
    slot->bound = TRUE;
    ActorPalettes_Upload(slot);
    return TRUE;
}

void PaperWhite2_ActorPalettes_Set(u32 slot, u16 objCode, u32 species, u32 personality, BOOL shiny) {
    ActorPalette *palette = &sSlots[slot];

    if (palette->objCode == objCode && palette->species == species && palette->personality == personality &&
        palette->shiny == shiny) {
        return;
    }
    // Another sprite is another material: the copy is made again on it
    if (palette->objCode != objCode) {
        ActorPalettes_Unbind(palette);
        palette->unreadable = FALSE;
    }
    palette->objCode = objCode;
    palette->species = species;
    palette->personality = personality;
    palette->shiny = (u8)shiny;
    palette->changed = TRUE;
}

void PaperWhite2_ActorPalettes_Bind(u32 slot, MMSys *actorSystem, u16 billboard) {
    ActorPalette *palette = &sSlots[slot];
    BillboardActorSys *sys = FieldBillboardActor_GetBillboardActorSys(FldActSys_GetFieldBillboardActor(actorSystem));
    u16 source;
    u32 actor;
    u16 material;

    if (palette->bound && palette->sys != sys) {
        // (another field's, freed with it)
        palette->bound = FALSE;
    }
    if (palette->objCode == 0 || billboard == BILLBOARD_ACTOR_NONE || !ActorPalettes_IsOut(sys, billboard)) {
        ActorPalettes_Unbind(palette);
        return;
    }
    source = BillboardActorSys_GetTexMatMaterial(sys, sys->handles[billboard].texMat);
    if (palette->bound && (palette->billboard != billboard || palette->source != source)) {
        ActorPalettes_Unbind(palette);
    }
    if (!palette->bound) {
        if (!ActorPalettes_MakeCopy(palette, actorSystem, sys, billboard, source)) {
            ActorPalettes_Unbind(palette);
            return;
        }
    } else if (palette->changed) {
        if (!ActorPalettes_LoadBase(palette, actorSystem)) {
            ActorPalettes_Unbind(palette);
            return;
        }
        ActorPalettes_Upload(palette);
    }
    // On the copy, unless something else than its shared material was put on the billboard
    actor = sys->handles[billboard].actor;
    BillboardActorScene_GetActorMaterial(sys->scene, actor, &material);
    if (material == source) {
        BillboardActorScene_SetActorMaterial(sys->scene, actor, &palette->material);
    }
}

void PaperWhite2_ActorPalettes_Release(u32 slot) {
    ActorPalette *palette = &sSlots[slot];

    ActorPalettes_Unbind(palette);
    palette->objCode = 0;
    palette->changed = FALSE;
    palette->unreadable = FALSE;
}

void PaperWhite2_ActorPalettes_ReleaseAll(BillboardActorSys *sys) {
    u32 i;

    for (i = 0; i < ACTOR_PALETTES; i++) {
        if (sSlots[i].bound && sSlots[i].sys == sys) {
            ActorPalettes_Unbind(&sSlots[i]);
        }
    }
}

void PaperWhite2_ActorPalettes_Capture(u16 objCode, G3DResource *resource) {
    NNSG3dResTex *tex;
    u32 count;

    if (objCode == 0 || (objCode < FOLLOWING_CODE_BASE && !ActorPalettes_IsWanted(objCode))) {
        return;
    }
    tex = GFL_G3DResGetTexData(resource);
    // The palette's size is in units of 8 bytes, 4 colours
    count = tex->plttInfo.sizePltt * 4;
    if (count > ACTOR_PALETTE_COLORS) {
        count = ACTOR_PALETTE_COLORS;
    }
    if (count != 0) {
        ActorPalettes_Keep(objCode, GFL_G3DResGetTexPaletteData(resource), count);
    }
}
