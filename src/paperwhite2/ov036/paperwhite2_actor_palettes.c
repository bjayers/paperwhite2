#include "types.h"
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
// can't be read back): those of every follower sprite, and of the sprites the slots wait for

// The colours of a sprite's palette (a 16-colour texture's)
#define ACTOR_PALETTE_COLORS 16
// How many sprites' colours are kept, the oldest replaced first unless a slot shows it
#define ACTOR_PALETTE_CAPTURES 8

typedef struct {
    u16 objCode;
    u16 count;
    u32 age;
    u16 colors[ACTOR_PALETTE_COLORS];
} CapturedPalette;

typedef struct {
    // The individual: its sprite, species and PID, and whether it changed since its colours were made
    u16 objCode;
    u8 changed;
    // Whether it has its copy: the billboard of sys it's on, the shared material it copies and the copy
    u8 bound;
    BillboardActorSys *sys;
    u16 billboard;
    u16 source;
    u16 material;
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

// The slot's colours made from its sprite's and sent to its palette; FALSE where its sprite's weren't kept
static BOOL ActorPalettes_Upload(ActorPalette *slot) {
    const CapturedPalette *captured = ActorPalettes_FindCaptured(slot->objCode);
    u32 plttAddr;

    if (captured == NULL) {
        return FALSE;
    }
    MI_CpuClear16(slot->colors, sizeof(slot->colors));
    MI_CpuCopy16(captured->colors, slot->colors, captured->count * sizeof(u16));
    PaperWhite2_VaryPalette(slot->colors, captured->count, slot->species, slot->personality);
    BillboardActorScene_GetMaterialPlttAddr(slot->sys->scene, slot->material, &plttAddr);
    if (slot->sys->transfer != NULL) {
        slot->sys->transfer(TRUE, plttAddr, slot->colors, sizeof(slot->colors));
    }
    slot->changed = FALSE;
    return TRUE;
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
static BOOL ActorPalettes_MakeCopy(ActorPalette *slot, BillboardActorSys *sys, u16 billboard, u16 source) {
    BillboardActorScene *scene = sys->scene;
    NNSGfdPlttKey key;
    u32 material;

    if (source >= scene->setup.materialCount || scene->materials[source].texFormat != GX_TEXFMT_PLTT16 ||
        ActorPalettes_FindCaptured(slot->objCode) == NULL) {
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
    return ActorPalettes_Upload(slot);
}

void PaperWhite2_ActorPalettes_Set(u32 slot, u16 objCode, u32 species, u32 personality) {
    ActorPalette *palette = &sSlots[slot];

    if (palette->objCode == objCode && palette->species == species && palette->personality == personality) {
        return;
    }
    // Another sprite is another material: the copy is made again on it
    if (palette->objCode != objCode) {
        ActorPalettes_Unbind(palette);
    }
    palette->objCode = objCode;
    palette->species = species;
    palette->personality = personality;
    palette->changed = TRUE;
}

void PaperWhite2_ActorPalettes_Bind(u32 slot, BillboardActorSys *sys, u16 billboard) {
    ActorPalette *palette = &sSlots[slot];
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
        if (!ActorPalettes_MakeCopy(palette, sys, billboard, source)) {
            ActorPalettes_Unbind(palette);
            return;
        }
    } else if (palette->changed && !ActorPalettes_Upload(palette)) {
        ActorPalettes_Unbind(palette);
        return;
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
    CapturedPalette *entry;
    NNSG3dResTex *tex;
    u32 count;
    u32 i;

    if (objCode == 0 || (objCode < FOLLOWING_CODE_BASE && !ActorPalettes_IsWanted(objCode))) {
        return;
    }
    tex = GFL_G3DResGetTexData(resource);
    // The palette's size is in units of 8 bytes, 4 colours
    count = tex->plttInfo.sizePltt * 4;
    if (count > ACTOR_PALETTE_COLORS) {
        count = ACTOR_PALETTE_COLORS;
    }
    if (count == 0) {
        return;
    }
    entry = ActorPalettes_FindCaptured(objCode);
    if (entry == NULL) {
        // A free one, or the oldest that no slot shows
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
    MI_CpuCopy16(GFL_G3DResGetTexPaletteData(resource), entry->colors, count * sizeof(u16));
}
