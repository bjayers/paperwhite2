#include "types.h"
#include "field/field.h"
#include "field/field_effect.h"
#include "field/field_map.h"
#include "field/field_player.h"
#include "paperwhite2/conditions.h"
#include "paperwhite2/following_field.h"
#include "paperwhite2/terrain_groups.h"

// Paper White 2: the conditions' field part, in the field's overlay beside the tiles it reads: a tile's terrain groups,
// from res/paperwhite2/conditions/terrain_groups.json (paperwhite2/terrain_groups.h), and the context's exterior,
// terrain and follower. See include/paperwhite2/conditions.h

// The groups of a tile class or a tile flag
typedef struct {
    u16 key;
    u32 groups;
} TerrainGroupEntry;

static const TerrainGroupEntry sTerrainGroupClasses[TERRAIN_GROUP_CLASS_COUNT] = { TERRAIN_GROUP_CLASSES };
static const TerrainGroupEntry sTerrainGroupFlags[TERRAIN_GROUP_FLAG_COUNT] = { TERRAIN_GROUP_FLAGS };

u32 Conditions_TerrainGroups(u32 tileType, BOOL exterior) {
    u32 groups = exterior ? TERRAIN_GROUPS_OUTDOOR : TERRAIN_GROUPS_INDOOR;
    u16 tileClass;
    u32 tileFlags;
    u32 i;

    if (!MapTile_IsValid(tileType)) {
        return groups;
    }
    tileClass = GetTileClass(tileType);
    tileFlags = GetTileFlags(tileType);
    for (i = 0; i < TERRAIN_GROUP_CLASS_COUNT; i++) {
        if (sTerrainGroupClasses[i].key == tileClass) {
            groups |= sTerrainGroupClasses[i].groups;
        }
    }
    for (i = 0; i < TERRAIN_GROUP_FLAG_COUNT; i++) {
        if (tileFlags & sTerrainGroupFlags[i].key) {
            groups |= sTerrainGroupFlags[i].groups;
        }
    }
    return groups;
}

void ConditionContext_FillField(ConditionContext *ctx, Field *field) {
    ctx->exterior = FieldEffects_GetAreaIsExterior(Field_GetFieldEffects(field)) != FALSE;
    ctx->terrain = Conditions_TerrainGroups(FieldPlayer_GetTileTypeUnder(Field_GetPlayer(field)), ctx->exterior);
    ctx->followerSpecies = PaperWhite2_FollowingGetSpecies();
    ctx->followerTerrain =
        ctx->followerSpecies == 0 ? 0 : Conditions_TerrainGroups(PaperWhite2_FollowingGetTile(), ctx->exterior);
    ctx->filled |= CONDITION_CONTEXT_FIELD | CONDITION_CONTEXT_FOLLOWER;
}

void ConditionContext_SetTerrain(ConditionContext *ctx, u32 tileType) {
    ctx->terrain = Conditions_TerrainGroups(tileType, ctx->exterior);
}
