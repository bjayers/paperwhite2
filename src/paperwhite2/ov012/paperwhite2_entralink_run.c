#include "types.h"
#include "battle/btl_result.h"
#include "battle/btl_setup.h"
#include "constants/arc.h"
#include "constants/battle.h"
#include "constants/directions.h"
#include "constants/items.h"
#include "constants/moves.h"
#include "constants/obj_codes.h"
#include "constants/pokemon.h"
#include "constants/script_text_banks.h"
#include "constants/zones.h"
#include "field/entree_forest.h"
#include "field/event_battle.h"
#include "field/event_mapchange.h"
#include "field/event_wild_battle.h"
#include "field/field.h"
#include "field/field_actor.h"
#include "field/field_event.h"
#include "field/field_script.h"
#include "field/scrcmd_msg.h"
#include "field/talkmsgwin.h"
#include "field/zone.h"
#include "gfl/heap.h"
#include "gfl/msg.h"
#include "gfl/random.h"
#include "paperwhite2/entralink_progress.h"
#include "paperwhite2/entralink_run.h"
#include "paperwhite2/entralink_run_actions.h"
#include "paperwhite2/entralink_run_battle.h"
#include "paperwhite2/entralink_run_config.h"
#include "paperwhite2/entralink_run_party.h"
#include "paperwhite2/entralink_run_state.h"
#include "pml/poke_party.h"
#include "save/bag.h"
#include "save/player_info.h"
#include "system/game_data.h"
#include "system/game_event.h"
#include "system/game_system.h"
#include "system/tpoke_data.h"
#include "system/vm.h"
#include "system/wordset.h"

// Paper White 2: the Entralink roguelike, in overlay 12 beside the Entree Forest's script commands. See
// include/paperwhite2/entralink_run.h and docs/paperwhite2/design/entralink-roguelike-prototype.md

// The script that talking to a room's NPC runs, and finding its hidden item: global_10490.s's Script_9 and Script_10
#define SCRID_ENTRALINK_RUN_NPC 10498
#define SCRID_ENTRALINK_RUN_HIDDEN_ITEM 10499
#define SCRID_NONE 0xffff
// The Entree Forest's entrance area (SymbolMap), which a run's warps keep in GameData's forest area
#define ENTREE_FOREST_ENTRANCE_AREA 4
// The party slot of a raid's enemy, which a triple battle puts in the center
#define RAID_CENTER_SLOT 1
// More uses than any room has in a run
#define USES_NONE 0xff
// The rooms a room of a round is drawn from: those kept to the round or to none, only those kept to it, or only those
// kept to none
#define POOL_ANY 0
#define POOL_KEPT 1
#define POOL_GENERIC 2
// The clearings' shared grid: its size, and its exits' tiles (the north and back exits' two, the side exits' three)
#define GRID_TILES 32
#define TILE_SIZE 16
#define NORTH_EXIT_Z 9
#define BACK_EXIT_Z 24
#define EXIT_X 15
#define WEST_EXIT_X 5
#define EAST_EXIT_X 26
#define SIDE_EXIT_Z 15
#define SIDE_EXIT_TILES 3
// The tile where a room is entered (sRoomArrivalPos)
#define ARRIVAL_X 15
#define ARRIVAL_Z 23

// Which rooms a draw takes: their role, round (0: any), pool (POOL_*) and type (ENTRALINK_TYPE_*, or
// ENTRALINK_TYPE_ANY)
typedef struct {
    u8 role;
    u8 round;
    u8 pool;
    u8 type;
} RoomFilter;

// Where a room is entered: its bottom exit, as from the hub (entree_forest_first_warp.c), the one exit every room has
static const VecFx32 sRoomArrivalPos = { FX32_CONST(248), 0, FX32_CONST(376) };
// The hub's entrance, where the Entralink's warp in arrives (entralink_warp.c)
static const VecFx32 sHubEntrancePos = { FX32_CONST(511), FX32_CONST(32), FX32_CONST(584) };

static const EntralinkRoom sRooms[ENTRALINK_RUN_ROOM_COUNT] = ENTRALINK_RUN_ROOMS;
static const EntralinkBattle sBattles[ENTRALINK_RUN_BATTLE_COUNT] = ENTRALINK_RUN_BATTLES;
static const EntralinkEnemy sEnemies[ENTRALINK_RUN_ENEMY_COUNT] = ENTRALINK_RUN_ENEMIES;
static const EntralinkNpc sNpcs[ENTRALINK_RUN_NPC_COUNT] = ENTRALINK_RUN_NPCS;
static const u16 sRequirements[ENTRALINK_RUN_REQUIREMENT_COUNT] = ENTRALINK_RUN_REQUIREMENTS;
static const EntralinkRound sRounds[ENTRALINK_RUN_ROUND_COUNT] = ENTRALINK_RUN_ROUNDS;
static const u16 sRoomZones[ENTRALINK_RUN_ROOM_ZONE_COUNT] = ENTRALINK_RUN_ROOM_ZONES;
static const u8 sTypeTemplates[ENTRALINK_TYPE_COUNT] = ENTRALINK_RUN_TYPE_TEMPLATES;
static const EntralinkItem sItems[ENTRALINK_RUN_ITEM_COUNT] = ENTRALINK_RUN_ITEMS;
static const EntralinkClearing sClearings[ENTRALINK_RUN_CLEARING_COUNT] = ENTRALINK_RUN_CLEARINGS;
static const u8 sFlowerTiles[ENTRALINK_RUN_FLOWER_TILE_COUNT][2] = ENTRALINK_RUN_FLOWER_TILES;

static EntralinkProgress *EntralinkRun_GetProgress(GameData *gameData) {
    return EntralinkProgress_Get(GameData_GetSaveControl(gameData));
}

// Whether all of a list of requirements hold: battles won ever, or a finished run
static BOOL EntralinkRun_MeetsRequirements(GameData *gameData, u32 first, u32 count) {
    EntralinkProgress *progress = EntralinkRun_GetProgress(gameData);
    u32 i;

    for (i = first; i < first + count; i++) {
        if (sRequirements[i] == ENTRALINK_REQUIRE_RUN_COMPLETED) {
            if (!EntralinkProgress_IsRunCompleted(progress)) {
                return FALSE;
            }
        } else if (!EntralinkProgress_IsBattleWon(progress, sRequirements[i])) {
            return FALSE;
        }
    }
    return TRUE;
}

static BOOL EntralinkRun_IsFinalRoom(EntralinkRunState *state) {
    return state->room == state->roomCount;
}

// The room the player is in, or NULL outside a run
static const EntralinkRoom *EntralinkRun_GetRoom(void) {
    EntralinkRunState *state = EntralinkRun_GetState();

    if (state->room == 0) {
        return NULL;
    }
    return &sRooms[state->order[state->room - 1]];
}

// Whether a room fits a draw: not a template, of its role and type, and fitting its round (round 0: any) as its pool
// takes them: kept to the round, kept to no round (generic), or either
static BOOL EntralinkRun_IsInPool(u32 index, const RoomFilter *filter) {
    const EntralinkRoom *room = &sRooms[index];
    BOOL kept;

    if (room->isTemplate || room->role != filter->role) {
        return FALSE;
    }
    if (filter->type != ENTRALINK_TYPE_ANY && room->type != filter->type) {
        return FALSE;
    }
    if (filter->round == 0) {
        return TRUE;
    }
    kept = (room->rounds & (1 << (filter->round - 1))) != 0;
    switch (filter->pool) {
    case POOL_KEPT:
        return kept;
    case POOL_GENERIC:
        return room->rounds == 0;
    }
    return kept || room->rounds == 0;
}

// Whether a room can be drawn: in the pool, not excluded (the room just played, the other doors' rooms), and among the
// least used so far
static BOOL EntralinkRun_IsDrawable(u32 index, const RoomFilter *filter, const u8 *excluded, const u8 *uses,
                                    u32 fewest) {
    return !excluded[index] && uses[index] == fewest && EntralinkRun_IsInPool(index, filter);
}

// The pool a round's room of a role is drawn from: a round's rooms from those kept to it and the generic ones, its boss
// from the bosses kept to it if there are any, else the generic ones
static u32 EntralinkRun_GetPool(u32 role, u32 round) {
    RoomFilter filter;
    u32 i;

    if (role != ENTRALINK_ROLE_BOSS) {
        return POOL_ANY;
    }
    filter.role = role;
    filter.round = round;
    filter.pool = POOL_KEPT;
    filter.type = ENTRALINK_TYPE_ANY;
    for (i = 0; i < ENTRALINK_RUN_ROOM_COUNT; i++) {
        if (EntralinkRun_IsInPool(i, &filter)) {
            return POOL_KEPT;
        }
    }
    return POOL_GENERIC;
}

// A room of a role and type (ENTRALINK_TYPE_ANY: any) for a round (0: any), at random among those of its pool not
// excluded that have come up the fewest times in the run so far: so no room comes up twice while one that fits hasn't
// come up. ENTRALINK_RUN_ROOM_NONE if none fits
static u32 EntralinkRun_DrawRoom(EntralinkRunState *state, u32 role, u32 round, u32 type, const u8 *excluded) {
    u8 uses[ENTRALINK_RUN_ROOM_COUNT];
    RoomFilter filter;
    u32 fewest = USES_NONE;
    u32 count = 0;
    u32 pick;
    u32 i;

    filter.role = role;
    filter.round = round;
    filter.pool = EntralinkRun_GetPool(role, round);
    filter.type = type;
    MI_CpuFill8(uses, 0, sizeof(uses));
    for (i = 0; i < state->room; i++) {
        uses[state->order[i]]++;
    }
    for (i = 0; i < ENTRALINK_RUN_ROOM_COUNT; i++) {
        if (!excluded[i] && uses[i] < fewest && EntralinkRun_IsInPool(i, &filter)) {
            fewest = uses[i];
        }
    }
    if (fewest == USES_NONE) {
        return ENTRALINK_RUN_ROOM_NONE;
    }
    for (i = 0; i < ENTRALINK_RUN_ROOM_COUNT; i++) {
        if (EntralinkRun_IsDrawable(i, &filter, excluded, uses, fewest)) {
            count++;
        }
    }
    pick = GFL_RandomLC(count);
    for (i = 0; i < ENTRALINK_RUN_ROOM_COUNT; i++) {
        if (EntralinkRun_IsDrawable(i, &filter, excluded, uses, fewest)) {
            if (pick == 0) {
                break;
            }
            pick--;
        }
    }
    return i;
}

// The role of a place of the run (from 1): one of a round's rooms, the pre-boss rest and its boss, or the pre-boss rest
// and the final room after the last round; and its round, from 1 (the final room's is the last round's)
static u32 EntralinkRun_GetPlace(u32 place, u32 *round) {
    u32 count = 0;
    u32 i;

    for (i = 0; i < ENTRALINK_RUN_ROUND_COUNT; i++) {
        *round = i + 1;
        count += sRounds[i].rooms;
        if (place <= count) {
            return ENTRALINK_ROLE_ROOM;
        }
        if (sRounds[i].boss) {
            count += 2;
            if (place == count - 1) {
                return ENTRALINK_ROLE_PRE_BOSS;
            }
            if (place == count) {
                return ENTRALINK_ROLE_BOSS;
            }
        }
    }
    *round = ENTRALINK_RUN_ROUND_COUNT;
    if (place == count + 1) {
        return ENTRALINK_ROLE_PRE_BOSS;
    }
    return ENTRALINK_ROLE_FINAL;
}

// How many rooms a run has: each round's rooms, and its pre-boss rest and boss, then the pre-boss rest and the final
// room
static u32 EntralinkRun_CountPlaces(void) {
    u32 count = 2;
    u32 i;

    for (i = 0; i < ENTRALINK_RUN_ROUND_COUNT; i++) {
        count += sRounds[i].rooms + 2 * sRounds[i].boss;
    }
    return count < ENTRALINK_RUN_ROOMS_MAX ? count : ENTRALINK_RUN_ROOMS_MAX;
}

// A room for a place: the final room is drawn from every final room, whatever its round
static u32 EntralinkRun_GetDrawRound(u32 role, u32 round) {
    return role == ENTRALINK_ROLE_FINAL ? 0 : round;
}

// The room behind a door: never the room just played, and another than the other doors' while enough rooms fit;
// the room just played only if it is the only one that fits
static u32 EntralinkRun_DrawDoorRoom(EntralinkRunState *state, u32 role, u32 round, u32 type) {
    u8 excluded[ENTRALINK_RUN_ROOM_COUNT];
    u32 previous = state->order[state->room - 1];
    u32 room;
    u32 door;

    MI_CpuFill8(excluded, 0, sizeof(excluded));
    excluded[previous] = TRUE;
    for (door = 0; door < ENTRALINK_RUN_DOORS; door++) {
        if (state->doorRooms[door] != ENTRALINK_RUN_ROOM_NONE) {
            excluded[state->doorRooms[door]] = TRUE;
        }
    }
    room = EntralinkRun_DrawRoom(state, role, round, type, excluded);
    if (room != ENTRALINK_RUN_ROOM_NONE) {
        return room;
    }
    // Fewer rooms fit than there are doors: one behind another door again
    MI_CpuFill8(excluded, 0, sizeof(excluded));
    excluded[previous] = TRUE;
    room = EntralinkRun_DrawRoom(state, role, round, type, excluded);
    if (room != ENTRALINK_RUN_ROOM_NONE) {
        return room;
    }
    MI_CpuFill8(excluded, 0, sizeof(excluded));
    return EntralinkRun_DrawRoom(state, role, round, type, excluded);
}

// A room of a type behind a door: enemy and challenge rooms are rooms/'s, an event room rooms/'s, else its template if
// there is one; a rest, item, buff or shop room is rooms/'s at run.json's custom chance if one fits, else its type's
// template. ENTRALINK_RUN_ROOM_NONE if the type has none
static u32 EntralinkRun_DrawRoomOfType(EntralinkRunState *state, u32 round, u32 type) {
    u32 room;

    switch (type) {
    case ENTRALINK_TYPE_ENEMY:
    case ENTRALINK_TYPE_CHALLENGE:
        return EntralinkRun_DrawDoorRoom(state, ENTRALINK_ROLE_ROOM, round, type);
    case ENTRALINK_TYPE_EVENT:
        room = EntralinkRun_DrawDoorRoom(state, ENTRALINK_ROLE_ROOM, round, type);
        return room != ENTRALINK_RUN_ROOM_NONE ? room : sTypeTemplates[type];
    }
    if (GFL_RandomLC(100) < ENTRALINK_RUN_CUSTOM_CHANCE) {
        room = EntralinkRun_DrawDoorRoom(state, ENTRALINK_ROLE_ROOM, round, type);
        if (room != ENTRALINK_RUN_ROOM_NONE) {
            return room;
        }
    }
    return sTypeTemplates[type];
}

// The room behind a door to a round's room: its type drawn by the round's weights, never a rest room after a rest
// room nor a rest or shop room just before the pre-boss rest, a type with no room skipped; ENTRALINK_RUN_ROOM_NONE if
// no type has one
static u32 EntralinkRun_DrawTypedRoom(EntralinkRunState *state, u32 round, BOOL beforeRest) {
    u8 weights[ENTRALINK_TYPE_COUNT];
    u32 total;
    u32 pick;
    u32 type;
    u32 room;

    MI_CpuCopy8(sRounds[round - 1].typeWeights, weights, sizeof(weights));
    if (sRooms[state->order[state->room - 1]].type == ENTRALINK_TYPE_REST) {
        weights[ENTRALINK_TYPE_REST] = 0;
    }
    if (beforeRest) {
        weights[ENTRALINK_TYPE_REST] = 0;
        weights[ENTRALINK_TYPE_SHOP] = 0;
    }
    for (;;) {
        total = 0;
        for (type = 0; type < ENTRALINK_TYPE_COUNT; type++) {
            total += weights[type];
        }
        if (total == 0) {
            return ENTRALINK_RUN_ROOM_NONE;
        }
        pick = GFL_RandomLC(total);
        for (type = 0; pick >= weights[type]; type++) {
            pick -= weights[type];
        }
        room = EntralinkRun_DrawRoomOfType(state, round, type);
        if (room != ENTRALINK_RUN_ROOM_NONE) {
            return room;
        }
        weights[type] = 0;
    }
}

// The rooms behind the room's forward doors, for the run's next place: a round's room of a drawn type behind each,
// with a chance of showing the unknown marker; before the pre-boss rest, it alone, and before a boss or the final room
// (in the pre-boss rest), it alone, behind the north door (the pre-boss map's one way on). Nothing after the final room
static void EntralinkRun_DrawDoors(EntralinkRunState *state) {
    BOOL beforeRest;
    u32 round;
    u32 next;
    u32 role;
    u32 door;

    for (door = 0; door < ENTRALINK_RUN_DOORS; door++) {
        state->doorRooms[door] = ENTRALINK_RUN_ROOM_NONE;
    }
    state->doorUnknown = 0;
    if (EntralinkRun_IsFinalRoom(state)) {
        return;
    }
    role = EntralinkRun_GetPlace(state->room + 1, &round);
    if (role == ENTRALINK_ROLE_PRE_BOSS) {
        state->doorRooms[ENTRALINK_DOOR_NORTH] = ENTRALINK_RUN_PRE_BOSS_REST;
        return;
    }
    if (role != ENTRALINK_ROLE_ROOM) {
        state->doorRooms[ENTRALINK_DOOR_NORTH] =
            EntralinkRun_DrawDoorRoom(state, role, EntralinkRun_GetDrawRound(role, round), ENTRALINK_TYPE_ANY);
        return;
    }
    beforeRest = EntralinkRun_GetPlace(state->room + 2, &next) == ENTRALINK_ROLE_PRE_BOSS;
    for (door = 0; door < ENTRALINK_RUN_DOORS; door++) {
        state->doorRooms[door] = EntralinkRun_DrawTypedRoom(state, round, beforeRest);
        if (state->doorRooms[door] != ENTRALINK_RUN_ROOM_NONE && GFL_RandomLC(100) < ENTRALINK_RUN_UNKNOWN_CHANCE) {
            state->doorUnknown |= 1 << door;
        }
    }
}

// Whether the Nightmare Ball catches an enemy now: it has a catch, whose requirements hold, and that isn't spent
static BOOL EntralinkRun_CanCatch(GameData *gameData, const EntralinkEnemy *enemy) {
    if (enemy->catchId == ENTRALINK_NONE) {
        return FALSE;
    }
    if (enemy->catchOnce && EntralinkProgress_IsCaught(EntralinkRun_GetProgress(gameData), enemy->catchId)) {
        return FALSE;
    }
    return EntralinkRun_MeetsRequirements(gameData, enemy->firstRequirement, enemy->requirementCount);
}

// Whether the Nightmare Ball catches one of a room's enemies now
static BOOL EntralinkRun_RoomHasCatch(GameData *gameData, const EntralinkRoom *room) {
    const EntralinkBattle *battle;
    u32 i;
    u32 j;

    for (i = 0; i < room->battleCount; i++) {
        battle = &sBattles[room->firstBattle + i];
        for (j = 0; j < battle->enemyCount; j++) {
            if (EntralinkRun_CanCatch(gameData, &sEnemies[battle->firstEnemy + j])) {
                return TRUE;
            }
        }
    }
    return FALSE;
}

// Whether the Nightmare Ball can still catch something in the run: an enemy it catches now in a room that can still
// come up, from the round on (kept to it or a later one, generic, or the final)
static BOOL EntralinkRun_IsAnythingCatchable(GameData *gameData, u32 round) {
    const EntralinkRoom *room;
    u32 i;

    for (i = 0; i < ENTRALINK_RUN_ROOM_COUNT; i++) {
        room = &sRooms[i];
        if (room->isTemplate) {
            continue;
        }
        if (room->role != ENTRALINK_ROLE_FINAL && room->rounds != 0 && (room->rounds >> (round - 1)) == 0) {
            continue;
        }
        if (EntralinkRun_RoomHasCatch(gameData, room)) {
            return TRUE;
        }
    }
    return FALSE;
}

// Whether an entry of the item table can be drawn: in the pool and the round, not one of the items excluded (the
// others of a choice), and the Nightmare Ball only while something can be caught
static BOOL EntralinkRun_ItemFits(const EntralinkItem *entry, u32 pool, u32 round, const u16 *excluded, u32 count,
                                  BOOL catchable) {
    u32 i;

    if (!(entry->pools & (1 << pool)) || (entry->rounds != 0 && !(entry->rounds & (1 << (round - 1))))) {
        return FALSE;
    }
    if (entry->item == ITEM_NIGHTMARE_BALL && !catchable) {
        return FALSE;
    }
    for (i = 0; i < count; i++) {
        if (excluded[i] == entry->item) {
            return FALSE;
        }
    }
    return TRUE;
}

// An item of a pool (ENTRALINK_POOL_*) for a round, at random by the entries' weights, other than the items excluded;
// ITEM_NONE if none fits
static u16 EntralinkRun_DrawItem(GameData *gameData, u32 pool, u32 round, const u16 *excluded, u32 count) {
    BOOL catchable = EntralinkRun_IsAnythingCatchable(gameData, round);
    u32 total = 0;
    u32 pick;
    u32 i;

    for (i = 0; i < ENTRALINK_RUN_ITEM_COUNT; i++) {
        if (EntralinkRun_ItemFits(&sItems[i], pool, round, excluded, count, catchable)) {
            total += sItems[i].weight;
        }
    }
    if (total == 0) {
        return ITEM_NONE;
    }
    pick = GFL_RandomLC(total);
    for (i = 0; i < ENTRALINK_RUN_ITEM_COUNT; i++) {
        if (!EntralinkRun_ItemFits(&sItems[i], pool, round, excluded, count, catchable)) {
            continue;
        }
        if (pick < sItems[i].weight) {
            break;
        }
        pick -= sItems[i].weight;
    }
    return sItems[i].item;
}

// The clearing of a zone, or NULL if the run's maps don't have it
static const EntralinkClearing *EntralinkRun_GetClearing(u32 zone) {
    u32 i;

    for (i = 0; i < ENTRALINK_RUN_CLEARING_COUNT; i++) {
        if (sClearings[i].zone == zone) {
            return &sClearings[i];
        }
    }
    return NULL;
}

// Whether one of the room's NPCs that came up stands on a tile
static BOOL EntralinkRun_IsNpcTile(EntralinkRunState *state, const EntralinkRoom *room, u32 x, u32 z) {
    const EntralinkNpc *npc;
    u32 i;

    for (i = 0; i < room->npcCount; i++) {
        npc = &sNpcs[room->firstNpc + i];
        if ((state->npcsSpawned & (1 << i)) && npc->x == x && npc->z == z) {
            return TRUE;
        }
    }
    return FALSE;
}

// Whether a tile of the clearings' grid is an exit, under a door's marker, or next to where the player arrives
static BOOL EntralinkRun_IsKeptClear(u32 x, u32 z) {
    u32 spotX;
    u32 spotZ;
    u32 door;

    if ((z == NORTH_EXIT_Z || z == BACK_EXIT_Z) && (x == EXIT_X || x == EXIT_X + 1)) {
        return TRUE;
    }
    if ((x == WEST_EXIT_X || x == EAST_EXIT_X) && z >= SIDE_EXIT_Z && z < SIDE_EXIT_Z + SIDE_EXIT_TILES) {
        return TRUE;
    }
    for (door = 0; door < ENTRALINK_RUN_DOORS; door++) {
        EntralinkRun_GetMarkerSpot(door, &spotX, &spotZ);
        if (x >= spotX && x <= spotX + 1 && z >= spotZ && z <= spotZ + 1) {
            return TRUE;
        }
    }
    return x + 1 >= ARRIVAL_X && x <= ARRIVAL_X + 1 && z + 1 >= ARRIVAL_Z && z <= ARRIVAL_Z + 1;
}

// Whether the ball on the ground can lie on a tile: one that can be walked on, kept clear of the exits, the markers
// and the arrival, with no NPC on it
static BOOL EntralinkRun_IsGroundTile(EntralinkRunState *state, const EntralinkRoom *room,
                                      const EntralinkClearing *clearing, u32 x, u32 z) {
    if (clearing->blocked[z] & (1 << x)) {
        return FALSE;
    }
    return !EntralinkRun_IsKeptClear(x, z) && !EntralinkRun_IsNpcTile(state, room, x, z);
}

// Puts the ball on the ground on a random tile it can lie on, if there is one
static void EntralinkRun_PlaceGroundItem(EntralinkRunState *state, const EntralinkRoom *room,
                                         const EntralinkClearing *clearing, u16 item) {
    u32 count = 0;
    u32 pick;
    u32 x;
    u32 z;

    for (z = 0; z < GRID_TILES; z++) {
        for (x = 0; x < GRID_TILES; x++) {
            count += EntralinkRun_IsGroundTile(state, room, clearing, x, z);
        }
    }
    if (count == 0) {
        return;
    }
    pick = GFL_RandomLC(count);
    for (z = 0; z < GRID_TILES; z++) {
        for (x = 0; x < GRID_TILES; x++) {
            if (!EntralinkRun_IsGroundTile(state, room, clearing, x, z)) {
                continue;
            }
            if (pick == 0) {
                state->groundItem = item;
                state->groundX = x;
                state->groundZ = z;
                return;
            }
            pick--;
        }
    }
}

// Whether the hidden item can lie on a flower tile: no NPC and not the ball on the ground on it
static BOOL EntralinkRun_IsHiddenTile(EntralinkRunState *state, const EntralinkRoom *room, const u8 *tile) {
    if (state->groundItem != ITEM_NONE && tile[0] == state->groundX && tile[1] == state->groundZ) {
        return FALSE;
    }
    return !EntralinkRun_IsNpcTile(state, room, tile[0], tile[1]);
}

// Hides the item on a random flower tile of the clearing, if it has one it can lie on
static void EntralinkRun_PlaceHiddenItem(EntralinkRunState *state, const EntralinkRoom *room,
                                         const EntralinkClearing *clearing, u16 item) {
    const u8 *tile;
    u32 count = 0;
    u32 pick;
    u32 i;

    for (i = 0; i < clearing->flowerCount; i++) {
        count += EntralinkRun_IsHiddenTile(state, room, sFlowerTiles[clearing->firstFlower + i]);
    }
    if (count == 0) {
        return;
    }
    pick = GFL_RandomLC(count);
    for (i = 0; i < clearing->flowerCount; i++) {
        tile = sFlowerTiles[clearing->firstFlower + i];
        if (!EntralinkRun_IsHiddenTile(state, room, tile)) {
            continue;
        }
        if (pick == 0) {
            state->hiddenItem = item;
            state->hiddenX = tile[0];
            state->hiddenZ = tile[1];
            return;
        }
        pick--;
    }
}

// Whether a room has an NPC placed by hand to give an item (an item NPC or an item room's ball), which keeps the ball
// on the ground out of it
static BOOL EntralinkRun_HasItemNpc(const EntralinkRoom *room) {
    u32 type;
    u32 i;

    for (i = 0; i < room->npcCount; i++) {
        type = sNpcs[room->firstNpc + i].type;
        if (type == ENTRALINK_NPC_ITEM || type == ENTRALINK_NPC_ITEM_CHOICE) {
            return TRUE;
        }
    }
    return FALSE;
}

// The items of the room as it is entered: its item room balls' (each another item), its gift NPC's choice of 3, the
// ball on the ground (run.json's ground_item_chance, in a room with no item NPC) and the hidden item
// (hidden_item_chance), the last two from the ground pool
static void EntralinkRun_DrawRoomItems(GameData *gameData, EntralinkRunState *state, const EntralinkRoom *room,
                                       u32 round) {
    const EntralinkClearing *clearing = EntralinkRun_GetClearing(EntralinkRun_GetRoomZone(gameData));
    BOOL gift = FALSE;
    u16 item;
    u32 type;
    u32 i;

    state->choiceMade = FALSE;
    state->groundItem = ITEM_NONE;
    state->hiddenItem = ITEM_NONE;
    MI_CpuFill16(state->npcItems, ITEM_NONE, sizeof(state->npcItems));
    MI_CpuFill16(state->giftItems, ITEM_NONE, sizeof(state->giftItems));
    for (i = 0; i < room->npcCount; i++) {
        type = sNpcs[room->firstNpc + i].type;
        if (!(state->npcsSpawned & (1 << i))) {
            continue;
        }
        if (type == ENTRALINK_NPC_ITEM_CHOICE) {
            state->npcItems[i] = EntralinkRun_DrawItem(gameData, ENTRALINK_POOL_ITEM_ROOM, round, state->npcItems,
                                                       ENTRALINK_RUN_NPCS_MAX);
        } else if (type == ENTRALINK_NPC_GIFT) {
            gift = TRUE;
        }
    }
    if (gift) {
        for (i = 0; i < ENTRALINK_RUN_GIFT_ITEMS; i++) {
            state->giftItems[i] =
                EntralinkRun_DrawItem(gameData, ENTRALINK_POOL_GIFT, round, state->giftItems, ENTRALINK_RUN_GIFT_ITEMS);
        }
    }
    if (clearing == NULL) {
        return;
    }
    if (!EntralinkRun_HasItemNpc(room) && GFL_RandomLC(100) < ENTRALINK_RUN_GROUND_ITEM_CHANCE) {
        item = EntralinkRun_DrawItem(gameData, ENTRALINK_POOL_GROUND, round, NULL, 0);
        if (item != ITEM_NONE) {
            EntralinkRun_PlaceGroundItem(state, room, clearing, item);
        }
    }
    if (GFL_RandomLC(100) < ENTRALINK_RUN_HIDDEN_ITEM_CHANCE) {
        item = EntralinkRun_DrawItem(gameData, ENTRALINK_POOL_GROUND, round, NULL, 0);
        if (item != ITEM_NONE) {
            EntralinkRun_PlaceHiddenItem(state, room, clearing, item);
        }
    }
}

// As the player enters the room: which of its NPCs come up (their requirements and chance, rolled once), whether it is
// done from the start (nothing came up), its round's field weather, its items, and the rooms behind its doors
static void EntralinkRun_EnterRoom(GameData *gameData) {
    EntralinkRunState *state = EntralinkRun_GetState();
    const EntralinkRoom *room = EntralinkRun_GetRoom();
    const EntralinkNpc *npc;
    u32 round;
    u32 i;

    state->npcsSpawned = 0;
    state->npcsGone = 0;
    state->npcsUsed = 0;
    for (i = 0; i < room->npcCount; i++) {
        npc = &sNpcs[room->firstNpc + i];
        if (!EntralinkRun_MeetsRequirements(gameData, npc->firstRequirement, npc->requirementCount)) {
            continue;
        }
        if (GFL_RandomLC(100) >= npc->chance) {
            continue;
        }
        state->npcsSpawned |= 1 << i;
    }
    state->cleared = state->npcsSpawned == 0;
    EntralinkRun_GetPlace(state->room, &round);
    state->fieldWeather = sRounds[round - 1].fieldWeather;
    EntralinkRun_DrawRoomItems(gameData, state, room, round);
    EntralinkRun_DrawDoors(state);
}

void EntralinkRun_Start(GameData *gameData) {
    EntralinkRunState *state = EntralinkRun_GetState();
    u8 excluded[ENTRALINK_RUN_ROOM_COUNT];
    u32 round;
    u32 role;
    u32 room;

    MI_CpuFill8(state, 0, sizeof(EntralinkRunState));
    MI_CpuFill8(excluded, 0, sizeof(excluded));
    // The first room, an enemy room if there is one (it is no door's, whose types are drawn); each room draws the
    // rooms behind its doors as the player enters it
    state->roomCount = EntralinkRun_CountPlaces();
    role = EntralinkRun_GetPlace(1, &round);
    if (role == ENTRALINK_ROLE_PRE_BOSS) {
        room = ENTRALINK_RUN_PRE_BOSS_REST;
    } else {
        room = EntralinkRun_DrawRoom(state, role, EntralinkRun_GetDrawRound(role, round),
                                     role == ENTRALINK_ROLE_ROOM ? ENTRALINK_TYPE_ENEMY : ENTRALINK_TYPE_ANY, excluded);
    }
    if (room == ENTRALINK_RUN_ROOM_NONE) {
        room = EntralinkRun_DrawRoom(state, role, EntralinkRun_GetDrawRound(role, round), ENTRALINK_TYPE_ANY, excluded);
    }
    if (room == ENTRALINK_RUN_ROOM_NONE) {
        return;
    }
    state->order[0] = room;
    state->room = 1;
    EntralinkRun_EnterRoom(gameData);
    // The team, the party's copies at level 100 (paperwhite2/entralink_run_party.h), and the run's own bag, empty
    EntralinkRun_KeepParty(gameData);
    EntralinkRun_KeepBag(gameData);
}

BOOL EntralinkRun_IsActive(GameData *gameData) {
    return EntralinkRun_GetState()->room != 0;
}

// Ends the run, and puts the real party back with the prestige gained, and the real bag
static void EntralinkRun_End(GameData *gameData) {
    MI_CpuFill8(EntralinkRun_GetState(), 0, sizeof(EntralinkRunState));
    EntralinkRun_RestoreParty(gameData);
    EntralinkRun_RestoreBag(gameData);
}

void EntralinkRun_OnFieldLoad(GameData *gameData, u16 zoneId) {
    if (!EntralinkRun_IsActive(gameData) && !EntralinkRun_IsPartyKept()) {
        return;
    }
    // A run is only ever in the forest, with its copies as the party: anywhere else (the debug menu's warps), or
    // without them, it is over
    if (!GetZoneIsEntreeForest(zoneId) || !EntralinkRun_IsActive(gameData) || !EntralinkRun_IsPartyKept()) {
        EntralinkRun_End(gameData);
    }
}

u16 EntralinkRun_GetRoomZone(GameData *gameData) {
    EntralinkRunState *state = EntralinkRun_GetState();
    u32 round;

    if (EntralinkRun_IsFinalRoom(state)) {
        return ENTRALINK_RUN_FINAL_ZONE;
    }
    // The room before a boss or the final room is in the pre-boss map, if run.json has one
    if (EntralinkRun_GetPlace(state->room + 1, &round) != ENTRALINK_ROLE_ROOM &&
        ENTRALINK_RUN_PRE_BOSS_ZONE != ENTRALINK_PRE_BOSS_ZONE_NONE) {
        return ENTRALINK_RUN_PRE_BOSS_ZONE;
    }
    // The room maps in turn, so that two rooms in a row are two maps when run.json lists two
    return sRoomZones[(state->room - 1) % ENTRALINK_RUN_ROOM_ZONE_COUNT];
}

static GameEvent *EntralinkRun_CreateHubWarp(GameSystem *gsys) {
    EntralinkRun_End(GSYS_GetGameData(gsys));
    return EventMapChangeWarp_CreateGrid(gsys, GSYS_GetField(gsys), ZONE_ENTRALINK, &sHubEntrancePos, DIR_UP, FALSE);
}

// The forward door of an exit, or ENTRALINK_DOOR_NONE for the back door
static u32 EntralinkRun_GetExitDoor(u32 exit) {
    switch (exit) {
    case ENTRALINK_RUN_NORTH_EXIT:
        return ENTRALINK_DOOR_NORTH;
    case ENTRALINK_RUN_EAST_EXIT:
        return ENTRALINK_DOOR_EAST;
    case ENTRALINK_RUN_WEST_EXIT:
        return ENTRALINK_DOOR_WEST;
    }
    return ENTRALINK_DOOR_NONE;
}

// The room behind an exit, or ENTRALINK_RUN_ROOM_NONE
static u32 EntralinkRun_GetExitRoom(EntralinkRunState *state, u32 exit) {
    u32 door = EntralinkRun_GetExitDoor(exit);

    if (door == ENTRALINK_DOOR_NONE) {
        return ENTRALINK_RUN_ROOM_NONE;
    }
    return state->doorRooms[door];
}

GameEvent *EntralinkRun_CreateExitEvent(GameSystem *gsys, u32 exit) {
    GameData *gameData = GSYS_GetGameData(gsys);
    EntralinkRunState *state = EntralinkRun_GetState();
    u32 room = EntralinkRun_GetExitRoom(state, exit);

    if (EntralinkRun_IsFinalRoom(state) || room == ENTRALINK_RUN_ROOM_NONE) {
        return EntralinkRun_CreateHubWarp(gsys);
    }
    state->order[state->room] = room;
    state->room++;
    EntralinkRun_EnterRoom(gameData);
    return EventEntreeForestWarp_Create(gsys, TRUE, &sRoomArrivalPos, DIR_UP, ENTREE_FOREST_ENTRANCE_AREA);
}

// An actor of the room, which faces a way and runs the NPCs' script when talked to, unless it is there already
static void EntralinkRun_SpawnActor(Field *field, u16 uid, u16 modelId, u32 direction, u32 x, u32 z) {
    static const u16 FACE_MOVE_CODES[] = { MOVE_CODE_FACE_UP, MOVE_CODE_FACE_DOWN, MOVE_CODE_FACE_LEFT,
                                           MOVE_CODE_FACE_RIGHT };
    MMSys *actorSystem = Field_GetActorSystem(field);
    ZoneNPC zoneNpc;

    if (FindFieldActor(actorSystem, uid) != NULL) {
        return;
    }
    MI_CpuFill8(&zoneNpc, 0, sizeof(ZoneNPC));
    zoneNpc.uid = uid;
    zoneNpc.modelId = modelId;
    zoneNpc.moveCode = FACE_MOVE_CODES[direction];
    zoneNpc.evType = ACTOR_EVENT_TYPE_NONE;
    zoneNpc.scrId = SCRID_ENTRALINK_RUN_NPC;
    zoneNpc.direction = direction;
    zoneNpc.areaW = 0xffff;
    zoneNpc.areaH = 0xffff;
    zoneNpc.pos.grid.x = x;
    zoneNpc.pos.grid.z = z;
    zoneNpc.pos.grid.y = 0;
    CreateNewActorByEntityNoWKOBJCODE(actorSystem, &zoneNpc, Field_GetPlayerStateZoneID(field));
}

// The actor of an NPC, which faces where the data says: its own sprite, or a battle NPC's enemy's walking Pokémon
static void EntralinkRun_SpawnNpc(Field *field, TPokeData *pokemonData, const EntralinkRoom *room,
                                  const EntralinkNpc *npc, u16 uid) {
    const EntralinkEnemy *enemy;
    u16 modelId;

    if (npc->sprite != 0) {
        modelId = npc->sprite;
    } else {
        enemy = &sEnemies[sBattles[room->firstBattle + npc->battle].firstEnemy + npc->enemy];
        modelId =
            GetPokemonFieldOBJCODE(pokemonData, enemy->species, enemy->gender == ENTRALINK_GENDER_FEMALE, enemy->form);
    }
    EntralinkRun_SpawnActor(field, uid, modelId, npc->direction, npc->x, npc->z);
}

void EntralinkRun_SpawnRoom(GameSystem *gsys) {
    EntralinkRunState *state = EntralinkRun_GetState();
    Field *field = GSYS_GetField(gsys);
    const EntralinkRoom *room = EntralinkRun_GetRoom();
    TPokeData *pokemonData;
    u32 i;

    if (room == NULL) {
        return;
    }
    pokemonData = LoadTPokeData(Field_GetHeapID(field));
    for (i = 0; i < room->npcCount; i++) {
        if ((state->npcsSpawned & (1 << i)) && !(state->npcsGone & (1 << i))) {
            EntralinkRun_SpawnNpc(field, pokemonData, room, &sNpcs[room->firstNpc + i], i);
        }
    }
    FreeTPokeData(pokemonData);
    // The ball on the ground, an item ball
    if (state->groundItem != ITEM_NONE) {
        EntralinkRun_SpawnActor(field, ENTRALINK_RUN_GROUND_ITEM_NPC, OBJ_CODE_110, DIR_DOWN, state->groundX,
                                state->groundZ);
    }
}

// Takes an NPC, or the ball on the ground, away for the rest of the room
static void EntralinkRun_RemoveNpc(GameSystem *gsys, u32 index) {
    FieldActor *actor = FindFieldActor(Field_GetActorSystem(GSYS_GetField(gsys)), index);
    EntralinkRunState *state = EntralinkRun_GetState();

    if (index == ENTRALINK_RUN_GROUND_ITEM_NPC) {
        state->groundItem = ITEM_NONE;
    } else {
        state->npcsGone |= 1 << index;
    }
    if (actor != NULL) {
        DeleteActor(actor);
    }
}

// Whether an NPC type makes the room's choice when used (a rest's heal, revive and gift, an item room's ball, a buff
// ball; the shop will when it sells, step 7), and whether it is one of the room's choice NPCs that go once the choice
// is made, the shop's among them
static BOOL EntralinkRun_IsChoiceType(u32 type) {
    switch (type) {
    case ENTRALINK_NPC_HEAL:
    case ENTRALINK_NPC_REVIVE:
    case ENTRALINK_NPC_GIFT:
    case ENTRALINK_NPC_ITEM_CHOICE:
    case ENTRALINK_NPC_BUFF_CHOICE:
        return TRUE;
    }
    return FALSE;
}

static BOOL EntralinkRun_IsChoiceNpcType(u32 type) {
    return EntralinkRun_IsChoiceType(type) || type == ENTRALINK_NPC_SHOP;
}

// Whether a choice NPC came up in the room and its choice isn't made yet: a rest or item room, which its battles (bonus
// battles) don't open
static BOOL EntralinkRun_IsChoicePending(EntralinkRunState *state, const EntralinkRoom *room) {
    u32 i;

    if (state->choiceMade) {
        return FALSE;
    }
    for (i = 0; i < room->npcCount; i++) {
        if ((state->npcsSpawned & (1 << i)) && EntralinkRun_IsChoiceType(sNpcs[room->firstNpc + i].type)) {
            return TRUE;
        }
    }
    return FALSE;
}

// After a won battle, its NPCs and the other battles' go: the room has been fought, and is done, unless it waits for
// its choice
static void EntralinkRun_ClearRoom(GameSystem *gsys, const EntralinkRoom *room) {
    EntralinkRunState *state = EntralinkRun_GetState();
    u32 i;

    for (i = 0; i < room->npcCount; i++) {
        if (sNpcs[room->firstNpc + i].type == ENTRALINK_NPC_BATTLE) {
            EntralinkRun_RemoveNpc(gsys, i);
        }
    }
    if (!EntralinkRun_IsChoicePending(state, room)) {
        state->cleared = TRUE;
    }
}

// A room with no battle and no choice is done once every NPC that came up in it has been used: talked to, or its item
// taken; a room with a choice once it is made
static void EntralinkRun_CheckRoomDone(void) {
    EntralinkRunState *state = EntralinkRun_GetState();
    const EntralinkRoom *room = EntralinkRun_GetRoom();
    u32 type;
    u32 i;

    if (room == NULL) {
        return;
    }
    if (state->choiceMade) {
        state->cleared = TRUE;
        return;
    }
    for (i = 0; i < room->npcCount; i++) {
        if (!(state->npcsSpawned & (1 << i))) {
            continue;
        }
        type = sNpcs[room->firstNpc + i].type;
        if (type == ENTRALINK_NPC_BATTLE || EntralinkRun_IsChoiceType(type)) {
            return;
        }
        if (!((state->npcsGone | state->npcsUsed) & (1 << i))) {
            return;
        }
    }
    state->cleared = TRUE;
}

// The talked-to choice NPC was used: the room's choice is made, its other choice NPCs go, and it is done
static void EntralinkRun_MakeChoice(GameSystem *gsys) {
    EntralinkRunState *state = EntralinkRun_GetState();
    const EntralinkRoom *room = EntralinkRun_GetRoom();
    u32 i;

    if (room == NULL || state->talkedNpc >= room->npcCount) {
        return;
    }
    state->npcsUsed |= 1 << state->talkedNpc;
    state->choiceMade = TRUE;
    for (i = 0; i < room->npcCount; i++) {
        if (i != state->talkedNpc && (state->npcsSpawned & (1 << i)) && !(state->npcsGone & (1 << i)) &&
            EntralinkRun_IsChoiceNpcType(sNpcs[room->firstNpc + i].type)) {
            EntralinkRun_RemoveNpc(gsys, i);
        }
    }
    state->cleared = TRUE;
}

// An enemy of the data as a Pokémon, as the Entree Forest makes its own (EntreeForest_CreateSymbolMon)
static PartyPkm *EntralinkRun_CreateEnemyPkm(GameData *gameData, const EntralinkEnemy *enemy, HeapID heapId) {
    static const u8 PID_GENDERS[] = { GENDER_UNKNOWN, GENDER_MALE, GENDER_FEMALE };
    u32 id = getIDAsUInt(GetGameDataPlayerInfo(gameData));
    u32 pid = PML_GenPID(id, enemy->species, enemy->form, PID_GENDERS[enemy->gender], 0,
                         enemy->shiny ? PID_RARE_ALWAYS : PID_RARE_NEVER);
    PartyPkm *pkm = PokeParty_NewTempPkm(enemy->species, enemy->level, -1, heapId);
    u32 i;

    PokeParty_CreatePkm(pkm, enemy->species, enemy->level, id, PKM_IVS_RANDOM, pid);
    PokeParty_ChangeForme(pkm, enemy->form);
    if (enemy->ability == ENTRALINK_ABILITY_HIDDEN) {
        PokeParty_SetHiddenAbil(pkm, enemy->species, enemy->form);
    } else if (enemy->ability != ENTRALINK_ABILITY_SPECIES) {
        PokeParty_SetParam(pkm, PKM_PARAM_ABILITY, enemy->ability);
    }
    PokeParty_SetParam(pkm, PKM_PARAM_ITEM, enemy->item);
    // Moves given replace the level's
    if (enemy->moves[0] != MOVE_NONE) {
        for (i = 0; i < NELEMS(enemy->moves); i++) {
            PokeParty_SetMove(pkm, enemy->moves[i], i);
        }
    }
    return pkm;
}

u32 EntralinkRun_GetDoorMarker(GameData *gameData, u32 door) {
    EntralinkRunState *state = EntralinkRun_GetState();
    const EntralinkRoom *room;

    if (state->room == 0 || door >= ENTRALINK_RUN_DOORS || state->doorRooms[door] == ENTRALINK_RUN_ROOM_NONE) {
        return ENTRALINK_MARKER_NONE;
    }
    if (state->doorUnknown & (1 << door)) {
        return ENTRALINK_MARKER_UNKNOWN;
    }
    room = &sRooms[state->doorRooms[door]];
    switch (room->marker) {
    case ENTRALINK_MARKER_ENEMY:
    case ENTRALINK_MARKER_CHALLENGE:
    case ENTRALINK_MARKER_BOSS:
        // A Nightmare in it to catch, and the ball to catch it with
        if (EntralinkRun_RoomHasCatch(gameData, room) &&
            BagSave_CheckAmount(GameData_GetBag(gameData), ITEM_NIGHTMARE_BALL, 1, HEAPID_GAMEEVENT)) {
            return ENTRALINK_MARKER_CATCH;
        }
        break;
    }
    return room->marker;
}

void EntralinkRun_GetMarkerSpot(u32 door, u32 *x, u32 *z) {
    static const u8 SPOTS[ENTRALINK_RUN_DOORS][2] = ENTRALINK_RUN_MARKER_SPOTS;

    *x = SPOTS[door][0];
    *z = SPOTS[door][1];
}

// The bag icon of an item among the item room's, or ENTRALINK_ICON_NONE
static u32 EntralinkRun_GetItemIcon(u16 item) {
    u32 i;

    for (i = 0; i < ENTRALINK_RUN_ITEM_COUNT; i++) {
        if (sItems[i].item == item && sItems[i].icon != ENTRALINK_ICON_NONE) {
            return sItems[i].icon;
        }
    }
    return ENTRALINK_ICON_NONE;
}

u32 EntralinkRun_GetNpcMarker(u32 index) {
    EntralinkRunState *state = EntralinkRun_GetState();
    const EntralinkRoom *room = EntralinkRun_GetRoom();
    const EntralinkNpc *npc;
    u32 icon;

    if (room == NULL || index >= room->npcCount || !(state->npcsSpawned & (1 << index)) ||
        (state->npcsGone & (1 << index))) {
        return ENTRALINK_NPC_MARKER_NONE;
    }
    npc = &sNpcs[room->firstNpc + index];
    if (npc->type == ENTRALINK_NPC_ITEM_CHOICE) {
        icon = EntralinkRun_GetItemIcon(state->npcItems[index]);
        if (icon != ENTRALINK_ICON_NONE) {
            return ENTRALINK_NPC_MARKER_ICON | icon;
        }
    }
    return npc->marker;
}

u16 EntralinkRun_CheckHiddenItem(u16 zoneId, const VecFx32 *pos) {
    EntralinkRunState *state = EntralinkRun_GetState();

    if (state->room == 0 || state->hiddenItem == ITEM_NONE || !GetZoneIsEntreeForest(zoneId)) {
        return SCRID_NONE;
    }
    if (FX_Whole(pos->x) / TILE_SIZE != state->hiddenX || FX_Whole(pos->z) / TILE_SIZE != state->hiddenZ) {
        return SCRID_NONE;
    }
    return SCRID_ENTRALINK_RUN_HIDDEN_ITEM;
}

// Adds an enemy to the battle's party, and to the battle's catches if the Nightmare Ball catches it
static void EntralinkRun_AddEnemy(GameData *gameData, PokeParty *party, const EntralinkEnemy *enemy, u32 slot,
                                  BOOL fainted) {
    EntralinkRunState *state = EntralinkRun_GetState();
    PartyPkm *pkm = EntralinkRun_CreateEnemyPkm(gameData, enemy, HEAPID_GAMEEVENT);

    if (fainted) {
        PokeParty_SetParam(pkm, PKM_PARAM_HP, 0);
    } else if (EntralinkRun_CanCatch(gameData, enemy)) {
        state->catchPids[slot] = PokeParty_GetParam(pkm, PKM_PARAM_PID, NULL);
        state->catchIds[slot] = enemy->catchId;
    }
    PokeParty_AddPkm(party, pkm);
    GFL_HeapFree(pkm);
}

// The battle as a wild one (battle type 0, which a wild battle's script result commands read), with balls refused but
// the Nightmare Ball on its catchable enemies (ENTRALINK_RUN_BTL_SETUP_FLAG). A raid is a triple battle whose two sides
// are fainted copies of its enemy, so the enemy stands in the center and the battle plays as any triple with two foes
// down
static GameEvent *EntralinkRun_CreateBattle(GameSystem *gsys, const EntralinkRoom *room,
                                            const EntralinkBattle *battle) {
    static const u8 FORMAT_STYLES[] = { BTL_STYLE_SINGLE, BTL_STYLE_DOUBLE, BTL_STYLE_TRIPLE, BTL_STYLE_TRIPLE };
    EntralinkRunState *state = EntralinkRun_GetState();
    GameData *gameData = GSYS_GetGameData(gsys);
    Field *field = GSYS_GetField(gsys);
    BtlSetup *setup = BtlSetup_Create(HEAPID_GAMEEVENT);
    PokeParty *party = PokeParty_Create(HEAPID_GAMEEVENT);
    BtlFieldStatus status;
    u32 i;

    for (i = 0; i < ENTRALINK_RUN_ENEMIES_MAX; i++) {
        state->catchIds[i] = ENTRALINK_CATCH_NONE;
    }
    state->caught = FALSE;
    if (battle->format == ENTRALINK_FORMAT_RAID) {
        for (i = 0; i < 3; i++) {
            EntralinkRun_AddEnemy(gameData, party, &sEnemies[battle->firstEnemy], i, i != RAID_CENTER_SLOT);
        }
    } else {
        for (i = 0; i < battle->enemyCount; i++) {
            EntralinkRun_AddEnemy(gameData, party, &sEnemies[battle->firstEnemy + i], i, FALSE);
        }
    }
    SaveBtlFieldStatus(&status, gameData, field);
    if (room->weather != ENTRALINK_WEATHER_FIELD) {
        status.weather = room->weather;
    }
    BtlSetup_SetWildNormal(setup, gameData, party, &status, FORMAT_STYLES[battle->format], HEAPID_GAMEEVENT);
    BtlSetup_SetFlag(setup, ENTRALINK_RUN_BTL_SETUP_FLAG);
    GFL_HeapFree(party);
    return EventWildBattleCall_Create(gsys, field, setup, TRUE, ENCOUNT_MODE_NORMAL);
}

// The battle's catch, if it caught one: its enemy's bit in the save's progress
static void EntralinkRun_RecordCatch(GameData *gameData) {
    EntralinkRunState *state = EntralinkRun_GetState();
    u32 i;

    if (!state->caught) {
        return;
    }
    for (i = 0; i < ENTRALINK_RUN_ENEMIES_MAX; i++) {
        if (state->catchIds[i] != ENTRALINK_CATCH_NONE && state->catchPids[i] == state->caughtPid) {
            EntralinkProgress_SetCaught(EntralinkRun_GetProgress(gameData), state->catchIds[i]);
        }
    }
}

// After the room's battle, what the script does next (ENTRALINK_RUN_RESULT_*)
static u16 EntralinkRun_FinishBattle(GameSystem *gsys, const EntralinkBattle *battle) {
    GameData *gameData = GSYS_GetGameData(gsys);
    EntralinkRunState *state = EntralinkRun_GetState();
    EntralinkProgress *progress = EntralinkRun_GetProgress(gameData);
    u32 result = GameData_GetLastBtlResult(gameData);
    u32 i;

    if (result != BTL_RESULT_VICTORY && result != BTL_RESULT_CAPTURE) {
        // A loss or running away ends the run, with the real party back as it was
        EntralinkRun_End(gameData);
        return result == BTL_RESULT_FLEE ? ENTRALINK_RUN_RESULT_FORFEIT : ENTRALINK_RUN_RESULT_LOST;
    }
    // A capture counts as a win
    EntralinkProgress_SetBattleWon(progress, battle->progressId);
    EntralinkRun_RecordCatch(gameData);
    for (i = 0; i < ENTRALINK_RUN_ENEMIES_MAX; i++) {
        state->catchIds[i] = ENTRALINK_CATCH_NONE;
    }
    state->caught = FALSE;
    // The room is done once the script has shown the after message (ENTRALINK_RUN_ACTION_CLEAR_ROOM)
    if (EntralinkRun_IsFinalRoom(state)) {
        EntralinkProgress_AddRunCompleted(progress);
        return ENTRALINK_RUN_RESULT_RUN_WON;
    }
    return ENTRALINK_RUN_RESULT_CLEARED;
}

// What an exit does (ENTRALINK_RUN_EXIT_*)
static u16 EntralinkRun_CheckExit(u32 exit) {
    EntralinkRunState *state = EntralinkRun_GetState();

    if (state->room == 0) {
        return ENTRALINK_RUN_EXIT_OPEN;
    }
    if (exit == ENTRALINK_RUN_BACK_EXIT) {
        return ENTRALINK_RUN_EXIT_BACK;
    }
    // A door opens once the room is done, if a room is behind it
    if (!state->cleared ||
        (!EntralinkRun_IsFinalRoom(state) && EntralinkRun_GetExitRoom(state, exit) == ENTRALINK_RUN_ROOM_NONE)) {
        return ENTRALINK_RUN_EXIT_BLOCKED;
    }
    return ENTRALINK_RUN_EXIT_OPEN;
}

// The talked-to NPC's message, if it has one
static u16 EntralinkRun_GetDialogue(const EntralinkNpc *npc, u32 after) {
    if (npc == NULL) {
        return ENTRALINK_RUN_NO_MESSAGE;
    }
    return after ? npc->after : npc->before;
}

// Shows the talked-to NPC's message (after: its after one) in its style's window: over the NPC (talk, yell), across
// the bottom of the screen (bubble), or the system window (event), with the script's words as it set them, and has the
// script wait for it to print. FALSE (no wait) if it has none
static BOOL EntralinkRun_ShowDialogue(VM *vm, FieldScriptEnv *env, const EntralinkNpc *npc, u32 after) {
    ScriptWork *work = FieldScriptEnv_GetScriptWork(env);
    StrBuf *message = ScriptWork_GetMainStrBuf(work);
    StrBuf *text = ScriptWork_GetAltStrBuf(work);
    u16 msgId = EntralinkRun_GetDialogue(npc, after);
    u16 actorId = EntralinkRun_GetState()->talkedNpc;
    MsgData *msgData;

    if (msgId == ENTRALINK_RUN_NO_MESSAGE) {
        return FALSE;
    }
    msgData =
        GFL_MsgSysLoadData(FALSE, ARCID_SCRIPT_MESSAGE, SCRIPT_TEXT_ENTRALINK_DIALOGUE, FieldScriptEnv_GetHeapID(env));
    GFL_MsgDataLoadStrbuf(msgData, msgId, text);
    GFL_MsgDataFree(msgData);
    GFL_WordSetFormatStrbuf(ScriptWork_GetWordSet(work), message, text);
    switch (after ? npc->afterStyle : npc->beforeStyle) {
    case ENTRALINK_STYLE_BUBBLE:
        return loadMsgBox(vm, env, message, TALKMSG_WIN_FRAME_NORMAL, MSG_WIN_POS_BOTTOM);
    case ENTRALINK_STYLE_YELL:
        return CallFieldActorMessageDispStrBuf(vm, env, message, actorId, MSG_WIN_POS_AUTO, TALKMSG_WIN_FRAME_SPIKY);
    case ENTRALINK_STYLE_EVENT:
        return PaperWhite2_SystemMsgStrBuf(vm, env, message, MSG_WIN_POS_BOTTOM);
    }
    return CallFieldActorMessageDispStrBuf(vm, env, message, actorId, MSG_WIN_POS_AUTO, TALKMSG_WIN_FRAME_NORMAL);
}

// The item the talked-to NPC gives, and how many: an item NPC's, an item room ball's drawn one, or the ball on the
// ground's
static u16 EntralinkRun_GetTalkedItem(const EntralinkNpc *npc, u32 *count) {
    EntralinkRunState *state = EntralinkRun_GetState();

    *count = 1;
    if (state->talkedNpc == ENTRALINK_RUN_GROUND_ITEM_NPC) {
        return state->groundItem;
    }
    if (npc == NULL) {
        return ITEM_NONE;
    }
    if (npc->type == ENTRALINK_NPC_ITEM_CHOICE) {
        return state->npcItems[state->talkedNpc];
    }
    *count = npc->count;
    return npc->item;
}

// Gives the talked-to NPC's item into the run's bag, and takes the NPC away
static BOOL EntralinkRun_GiveItem(GameSystem *gsys, const EntralinkNpc *npc, HeapID heapId) {
    u32 count;
    u16 item = EntralinkRun_GetTalkedItem(npc, &count);

    if (item == ITEM_NONE || !BagSave_AddItem(GameData_GetBag(GSYS_GetGameData(gsys)), item, count, heapId)) {
        return FALSE;
    }
    EntralinkRun_RemoveNpc(gsys, EntralinkRun_GetState()->talkedNpc);
    EntralinkRun_CheckRoomDone();
    return TRUE;
}

// Heals every Pokémon of the party that hasn't fainted: HP, status and PP
static void EntralinkRun_Heal(GameData *gameData) {
    PokeParty *party = GameData_GetParty(gameData);
    PartyPkm *pkm;
    int count = PokeParty_GetPkmCount(party);
    int i;

    for (i = 0; i < count; i++) {
        pkm = PokeParty_GetPkm(party, i);
        if (PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL) || PokeParty_GetParam(pkm, PKM_PARAM_HP, NULL) == 0) {
            continue;
        }
        PokeParty_Recover(pkm);
    }
}

// Whether a Pokémon of the party (not an egg) has fainted
static BOOL EntralinkRun_IsFainted(PartyPkm *pkm) {
    return !PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL) && PokeParty_GetParam(pkm, PKM_PARAM_HP, NULL) == 0;
}

static BOOL EntralinkRun_CanRevive(GameData *gameData) {
    PokeParty *party = GameData_GetParty(gameData);
    int count = PokeParty_GetPkmCount(party);
    int i;

    for (i = 0; i < count; i++) {
        if (EntralinkRun_IsFainted(PokeParty_GetPkm(party, i))) {
            return TRUE;
        }
    }
    return FALSE;
}

// Revives the fainted Pokémon in a party slot to full HP, its status cleared; FALSE if it hasn't fainted
static BOOL EntralinkRun_Revive(GameData *gameData, u32 slot) {
    PokeParty *party = GameData_GetParty(gameData);
    PartyPkm *pkm;

    if (slot >= PokeParty_GetPkmCount(party)) {
        return FALSE;
    }
    pkm = PokeParty_GetPkm(party, slot);
    if (!EntralinkRun_IsFainted(pkm)) {
        return FALSE;
    }
    PokeParty_SetParam(pkm, PKM_PARAM_HP, PokeParty_GetParam(pkm, PKM_PARAM_MAX_HP, NULL));
    PokeParty_SetParam(pkm, PKM_PARAM_STATUS, 0);
    return TRUE;
}

// A gift NPC's item of its choice of 3, or ITEM_NONE
static u16 EntralinkRun_GetGiftItem(u32 index) {
    return index < ENTRALINK_RUN_GIFT_ITEMS ? EntralinkRun_GetState()->giftItems[index] : ITEM_NONE;
}

// The hidden item into the run's bag, which takes it from the room
static BOOL EntralinkRun_TakeHiddenItem(GameData *gameData, HeapID heapId) {
    EntralinkRunState *state = EntralinkRun_GetState();

    if (state->hiddenItem == ITEM_NONE || !BagSave_AddItem(GameData_GetBag(gameData), state->hiddenItem, 1, heapId)) {
        return FALSE;
    }
    state->hiddenItem = ITEM_NONE;
    return TRUE;
}

BOOL Scrcmd_PaperWhite2_EntralinkRun(VM *vm, FieldScriptEnv *env) {
    u16 action = ScriptReadAny(vm, env);
    u16 arg = ScriptReadAny(vm, env);
    GameSystem *gsys = FieldScriptEnv_GetGameSystem(env);
    EntralinkRunState *state = EntralinkRun_GetState();
    const EntralinkRoom *room = EntralinkRun_GetRoom();
    const EntralinkNpc *npc = NULL;
    const EntralinkBattle *battle = NULL;
    FieldActor *actor;
    u32 count;
    u16 *result;

    // The second argument, which no action takes yet
    ScriptReadAny(vm, env);
    result = ScriptReadVar(vm, env);
    if (room != NULL && state->talkedNpc < room->npcCount) {
        npc = &sNpcs[room->firstNpc + state->talkedNpc];
        if (npc->type == ENTRALINK_NPC_BATTLE) {
            battle = &sBattles[room->firstBattle + npc->battle];
        }
    }

    switch (action) {
    case ENTRALINK_RUN_ACTION_CAN_LEAVE:
        *result = EntralinkRun_CheckExit(arg);
        return FALSE;
    case ENTRALINK_RUN_ACTION_TALK:
        actor = ScriptWork_GetParentActor(FieldScriptEnv_GetScriptWork(env));
        *result = ENTRALINK_NPC_REST;
        if (room == NULL || actor == NULL) {
            return FALSE;
        }
        if (GetActorUID(actor) == ENTRALINK_RUN_GROUND_ITEM_NPC && state->groundItem != ITEM_NONE) {
            state->talkedNpc = ENTRALINK_RUN_GROUND_ITEM_NPC;
            *result = ENTRALINK_RUN_NPC_GROUND;
        } else if (GetActorUID(actor) < room->npcCount) {
            state->talkedNpc = GetActorUID(actor);
            *result = sNpcs[room->firstNpc + state->talkedNpc].type;
            // A choice NPC whose choice was made only wishes the player well
            if (EntralinkRun_IsChoiceType(*result) && state->choiceMade) {
                *result = ENTRALINK_RUN_NPC_DONE;
            }
        }
        return FALSE;
    case ENTRALINK_RUN_ACTION_GET_ACTOR:
        *result = state->talkedNpc;
        return FALSE;
    case ENTRALINK_RUN_ACTION_GET_SPECIES:
        *result = battle != NULL ? sEnemies[battle->firstEnemy + npc->enemy].species : 0;
        return FALSE;
    case ENTRALINK_RUN_ACTION_DIALOGUE:
        *result = EntralinkRun_GetDialogue(npc, arg);
        return FALSE;
    case ENTRALINK_RUN_ACTION_SHOW_DIALOGUE:
        *result = EntralinkRun_GetDialogue(npc, arg);
        return EntralinkRun_ShowDialogue(vm, env, npc, arg);
    case ENTRALINK_RUN_ACTION_BATTLE:
        if (battle == NULL) {
            return FALSE;
        }
        ScriptWork_CallEvent(FieldScriptEnv_GetScriptWork(env), EntralinkRun_CreateBattle(gsys, room, battle));
        return TRUE;
    case ENTRALINK_RUN_ACTION_BATTLE_RESULT:
        *result = battle != NULL ? EntralinkRun_FinishBattle(gsys, battle) : ENTRALINK_RUN_RESULT_LOST;
        return FALSE;
    case ENTRALINK_RUN_ACTION_CLEAR_ROOM:
        if (room != NULL) {
            EntralinkRun_ClearRoom(gsys, room);
        }
        return FALSE;
    case ENTRALINK_RUN_ACTION_GET_ITEM:
        *result = EntralinkRun_GetTalkedItem(npc, &count);
        return FALSE;
    case ENTRALINK_RUN_ACTION_GET_ITEM_COUNT:
        EntralinkRun_GetTalkedItem(npc, &count);
        *result = count;
        return FALSE;
    case ENTRALINK_RUN_ACTION_GIVE_ITEM:
        *result = EntralinkRun_GiveItem(gsys, npc, FieldScriptEnv_GetHeapID(env));
        return FALSE;
    case ENTRALINK_RUN_ACTION_NPC_USED:
        if (npc != NULL) {
            state->npcsUsed |= 1 << state->talkedNpc;
            EntralinkRun_CheckRoomDone();
        }
        return FALSE;
    case ENTRALINK_RUN_ACTION_HEAL:
        EntralinkRun_Heal(GSYS_GetGameData(gsys));
        return FALSE;
    case ENTRALINK_RUN_ACTION_CAN_REVIVE:
        *result = EntralinkRun_CanRevive(GSYS_GetGameData(gsys));
        return FALSE;
    case ENTRALINK_RUN_ACTION_REVIVE:
        *result = EntralinkRun_Revive(GSYS_GetGameData(gsys), arg);
        return FALSE;
    case ENTRALINK_RUN_ACTION_GET_GIFT_ITEM:
        *result = EntralinkRun_GetGiftItem(arg);
        return FALSE;
    case ENTRALINK_RUN_ACTION_GIVE_GIFT:
        *result = EntralinkRun_GetGiftItem(arg) != ITEM_NONE &&
                  BagSave_AddItem(GameData_GetBag(GSYS_GetGameData(gsys)), EntralinkRun_GetGiftItem(arg), 1,
                                  FieldScriptEnv_GetHeapID(env));
        return FALSE;
    case ENTRALINK_RUN_ACTION_MAKE_CHOICE:
        EntralinkRun_MakeChoice(gsys);
        return FALSE;
    case ENTRALINK_RUN_ACTION_GET_HIDDEN_ITEM:
        *result = state->hiddenItem;
        return FALSE;
    case ENTRALINK_RUN_ACTION_TAKE_HIDDEN_ITEM:
        *result = EntralinkRun_TakeHiddenItem(GSYS_GetGameData(gsys), FieldScriptEnv_GetHeapID(env));
        return FALSE;
    case ENTRALINK_RUN_ACTION_WARP_HUB:
        ScriptWork_CallEvent(FieldScriptEnv_GetScriptWork(env), EntralinkRun_CreateHubWarp(gsys));
        return TRUE;
    }
    return FALSE;
}
