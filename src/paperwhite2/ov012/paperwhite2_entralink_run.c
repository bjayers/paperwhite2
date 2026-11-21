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
#include "nitro/math.h"
#include "paperwhite2/entralink_buffs.h"
#include "paperwhite2/entralink_hub_shop.h"
#include "paperwhite2/entralink_progress.h"
#include "paperwhite2/entralink_random_rooms.h"
#include "paperwhite2/entralink_records.h"
#include "paperwhite2/entralink_reserve.h"
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
#include "system/str_tool.h"
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
// The most cards a list of cards has (an offer's, a gift NPC's, a shop's buffs), and the digits of a Dream Dust price
#define CARDS_MAX 8
#define DUST_DIGITS 5
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
    // A random room's row stands for the room made as the player entered it
    if (sRooms[state->order[state->room - 1]].random) {
        return &EntralinkRun_GetRandomRoom()->room;
    }
    return &sRooms[state->order[state->room - 1]];
}

// A room's NPC, battle, and a battle's enemy, by their places in the room and the battle: the tables', or those of the
// random room made (a random room's row has none)
static const EntralinkNpc *EntralinkRun_GetNpc(const EntralinkRoom *room, u32 index) {
    if (room->random) {
        return &EntralinkRun_GetRandomRoom()->npcs[index];
    }
    return &sNpcs[room->firstNpc + index];
}

static const EntralinkBattle *EntralinkRun_GetBattle(const EntralinkRoom *room, u32 index) {
    if (room->random) {
        return &EntralinkRun_GetRandomRoom()->battles[index];
    }
    return &sBattles[room->firstBattle + index];
}

static const EntralinkEnemy *EntralinkRun_GetEnemy(const EntralinkRoom *room, const EntralinkBattle *battle,
                                                   u32 index) {
    if (room->random) {
        return &EntralinkRun_GetRandomRoom()->enemies[battle->firstEnemy + index];
    }
    return &sEnemies[battle->firstEnemy + index];
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

// A place's index among all the run's rooms of role room (from 0, the depth that the enemies' room curves follow), or 0
// for a pre-boss rest, a boss or the final room
static u32 EntralinkRun_GetRoomDepth(u32 place) {
    u32 count = 0;
    u32 rooms = 0;
    u32 i;

    for (i = 0; i < ENTRALINK_RUN_ROUND_COUNT; i++) {
        if (place <= count + sRounds[i].rooms) {
            return rooms + place - count - 1;
        }
        count += sRounds[i].rooms + 2 * sRounds[i].boss;
        rooms += sRounds[i].rooms;
        if (place <= count) {
            return 0;
        }
    }
    return 0;
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

// An enemy or enemy choice door's random room: at run.json's random enemy chance, or when no premade room of the type
// fits (unless the chance is 0); else ENTRALINK_RUN_ROOM_NONE
static u32 EntralinkRun_DrawRandomRoom(u32 type, BOOL premade) {
    if (ENTRALINK_RUN_RANDOM_ENEMY_CHANCE == 0 || (premade && GFL_RandomLC(100) >= ENTRALINK_RUN_RANDOM_ENEMY_CHANCE)) {
        return ENTRALINK_RUN_ROOM_NONE;
    }
    return type == ENTRALINK_TYPE_ENEMY_CHOICE ? ENTRALINK_RUN_RANDOM_CHOICE_ROOM : ENTRALINK_RUN_RANDOM_ENEMY_ROOM;
}

// A room of a type behind a door: enemy and enemy choice rooms are random rooms at run.json's random enemy chance,
// else rooms/'s (a random room if none fits); challenge rooms are rooms/'s, an event room rooms/'s, else its template
// if there is one; a rest, item, buff or shop room is rooms/'s at run.json's custom chance if one fits, else its
// type's template. ENTRALINK_RUN_ROOM_NONE if the type has none
static u32 EntralinkRun_DrawRoomOfType(EntralinkRunState *state, u32 round, u32 type) {
    u32 room;

    switch (type) {
    case ENTRALINK_TYPE_ENEMY:
    case ENTRALINK_TYPE_ENEMY_CHOICE:
        room = EntralinkRun_DrawRandomRoom(type, TRUE);
        if (room == ENTRALINK_RUN_ROOM_NONE) {
            room = EntralinkRun_DrawDoorRoom(state, ENTRALINK_ROLE_ROOM, round, type);
        }
        return room != ENTRALINK_RUN_ROOM_NONE ? room : EntralinkRun_DrawRandomRoom(type, FALSE);
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
        battle = EntralinkRun_GetBattle(room, i);
        for (j = 0; j < battle->enemyCount; j++) {
            if (EntralinkRun_CanCatch(gameData, EntralinkRun_GetEnemy(room, battle, j))) {
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

// Which entries of the item table a draw takes: its pool (ENTRALINK_POOL_*) and round, the items excluded (the others
// of a choice), whether the Nightmare Ball can still catch something, and whether the run's bag holds the Dowsing MCHN
typedef struct {
    u32 pool;
    u32 round;
    const u16 *excluded;
    u32 count;
    BOOL catchable;
    BOOL dowsing;
} ItemFilter;

// Whether an entry of the item table can be drawn: in the pool and the round, not one of the items excluded, the
// Nightmare Ball only while something can be caught, and the Dowsing MCHN only while the run's bag doesn't hold it
static BOOL EntralinkRun_ItemFits(const EntralinkItem *entry, const ItemFilter *filter) {
    u32 i;

    if (!(entry->pools & (1 << filter->pool)) ||
        (entry->rounds != 0 && !(entry->rounds & (1 << (filter->round - 1))))) {
        return FALSE;
    }
    if ((entry->item == ITEM_NIGHTMARE_BALL && !filter->catchable) ||
        (entry->item == ITEM_DOWSING_MCHN && filter->dowsing)) {
        return FALSE;
    }
    for (i = 0; i < filter->count; i++) {
        if (filter->excluded[i] == entry->item) {
            return FALSE;
        }
    }
    return TRUE;
}

// The entry of an item of a pool (ENTRALINK_POOL_*) for a round, at random by the entries' weights, other than the
// items excluded; NULL if none fits
static const EntralinkItem *EntralinkRun_DrawItemEntry(GameData *gameData, u32 pool, u32 round, const u16 *excluded,
                                                       u32 count) {
    ItemFilter filter;
    u32 total = 0;
    u32 pick;
    u32 i;

    filter.pool = pool;
    filter.round = round;
    filter.excluded = excluded;
    filter.count = count;
    filter.catchable = EntralinkRun_IsAnythingCatchable(gameData, round);
    filter.dowsing = BagSave_CheckAmount(GameData_GetBag(gameData), ITEM_DOWSING_MCHN, 1, HEAPID_GAMEEVENT);
    for (i = 0; i < ENTRALINK_RUN_ITEM_COUNT; i++) {
        if (EntralinkRun_ItemFits(&sItems[i], &filter)) {
            total += sItems[i].weight;
        }
    }
    if (total == 0) {
        return NULL;
    }
    pick = GFL_RandomLC(total);
    for (i = 0; i < ENTRALINK_RUN_ITEM_COUNT; i++) {
        if (!EntralinkRun_ItemFits(&sItems[i], &filter)) {
            continue;
        }
        if (pick < sItems[i].weight) {
            break;
        }
        pick -= sItems[i].weight;
    }
    return &sItems[i];
}

// The same, the item; ITEM_NONE if none fits
static u16 EntralinkRun_DrawItem(GameData *gameData, u32 pool, u32 round, const u16 *excluded, u32 count) {
    const EntralinkItem *entry = EntralinkRun_DrawItemEntry(gameData, pool, round, excluded, count);

    return entry != NULL ? entry->item : ITEM_NONE;
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
        npc = EntralinkRun_GetNpc(room, i);
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
        type = EntralinkRun_GetNpc(room, i)->type;
        if (type == ENTRALINK_NPC_ITEM || type == ENTRALINK_NPC_ITEM_CHOICE) {
            return TRUE;
        }
    }
    return FALSE;
}

// The room's shop's goods, each another item of the shop pool at its price, up to run.json's shop_items, and its
// buffs (buffs.json's shop_buffs of the shop pool, sold beside the Mart's screen at their prices)
static void EntralinkRun_DrawShop(GameData *gameData, EntralinkRunState *state, u32 round) {
    const EntralinkItem *entry;
    u32 i;

    for (i = 0; i < ENTRALINK_BUFF_SHOP_BUFFS; i++) {
        EntralinkBuffs_DrawCard(gameData, ENTRALINK_BUFF_SOURCE_SHOP, round, state->shopBuffs, i, &state->shopBuffs[i]);
    }
    while (state->shopCount < ENTRALINK_RUN_SHOP_ITEMS) {
        entry = EntralinkRun_DrawItemEntry(gameData, ENTRALINK_POOL_SHOP, round, state->shopItems, state->shopCount);
        if (entry == NULL) {
            return;
        }
        state->shopItems[state->shopCount] = entry->item;
        state->shopPrices[state->shopCount] = entry->price;
        state->shopCount++;
    }
}

// The items of the room as it is entered: its item room balls' (each another item), its gift NPC's choice of 3, its
// shop's goods, the ball on the ground (run.json's ground_item_chance, in a room with no item NPC) and the hidden item
// (hidden_item_chance), the last two from the ground pool
static void EntralinkRun_DrawRoomItems(GameData *gameData, EntralinkRunState *state, const EntralinkRoom *room,
                                       u32 round) {
    const EntralinkClearing *clearing = EntralinkRun_GetClearing(EntralinkRun_GetRoomZone(gameData));
    BOOL gift = FALSE;
    BOOL shop = FALSE;
    BOOL buffBall = FALSE;
    u16 item;
    u32 type;
    u32 i;

    state->choiceMade = FALSE;
    state->groundItem = ITEM_NONE;
    state->hiddenItem = ITEM_NONE;
    state->shopCount = 0;
    MI_CpuFill16(state->npcItems, ITEM_NONE, sizeof(state->npcItems));
    MI_CpuFill16(state->giftItems, ITEM_NONE, sizeof(state->giftItems));
    MI_CpuFill8(state->giftBuffs, 0, sizeof(state->giftBuffs));
    MI_CpuFill8(state->roomOffer, 0, sizeof(state->roomOffer));
    MI_CpuFill8(state->shopBuffs, 0, sizeof(state->shopBuffs));
    for (i = 0; i < room->npcCount; i++) {
        type = EntralinkRun_GetNpc(room, i)->type;
        if (!(state->npcsSpawned & (1 << i))) {
            continue;
        }
        if (type == ENTRALINK_NPC_ITEM_CHOICE) {
            state->npcItems[i] = EntralinkRun_DrawItem(gameData, ENTRALINK_POOL_ITEM_ROOM, round, state->npcItems,
                                                       ENTRALINK_RUN_NPCS_MAX);
        } else if (type == ENTRALINK_NPC_GIFT) {
            gift = TRUE;
        } else if (type == ENTRALINK_NPC_SHOP) {
            shop = TRUE;
        } else if (type == ENTRALINK_NPC_BUFF_CHOICE) {
            buffBall = TRUE;
        }
    }
    if (gift) {
        // Each card a buff of the gift pool at buffs.json's gift_buff_chance, else (or if no buff fits) an item of the
        // item table's gift pool
        for (i = 0; i < ENTRALINK_RUN_GIFT_ITEMS; i++) {
            if (GFL_RandomLC(100) < ENTRALINK_BUFF_GIFT_BUFF_CHANCE) {
                EntralinkBuffs_DrawCard(gameData, ENTRALINK_BUFF_SOURCE_GIFT, round, state->giftBuffs, i,
                                        &state->giftBuffs[i]);
            }
            if (state->giftBuffs[i].kind == ENTRALINK_CARD_NONE) {
                state->giftItems[i] = EntralinkRun_DrawItem(gameData, ENTRALINK_POOL_GIFT, round, state->giftItems,
                                                            ENTRALINK_RUN_GIFT_ITEMS);
            }
        }
    }
    if (buffBall) {
        EntralinkBuffs_DrawOffer(gameData, ENTRALINK_BUFF_SOURCE_BUFF_ROOM, round, state->roomOffer,
                                 ENTRALINK_BUFF_OFFERS);
    }
    if (shop) {
        EntralinkRun_DrawShop(gameData, state, round);
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
    const EntralinkRoom *room;
    const EntralinkNpc *npc;
    u32 blocking = 0;
    u32 round;
    u32 i;

    // A random room's battles, enemies and NPCs are made now, for the place's round
    EntralinkRun_GetPlace(state->room, &round);
    if (sRooms[state->order[state->room - 1]].random) {
        EntralinkRun_MakeRandomRoom(&sRooms[state->order[state->room - 1]], round);
    }
    room = EntralinkRun_GetRoom();
    state->npcsSpawned = 0;
    state->npcsGone = 0;
    state->npcsUsed = 0;
    for (i = 0; i < room->npcCount; i++) {
        npc = EntralinkRun_GetNpc(room, i);
        if (!EntralinkRun_MeetsRequirements(gameData, npc->firstRequirement, npc->requirementCount)) {
            continue;
        }
        if (GFL_RandomLC(100) >= npc->chance) {
            continue;
        }
        state->npcsSpawned |= 1 << i;
        // (an ambient never keeps the room from being done)
        if (npc->type != ENTRALINK_NPC_AMBIENT) {
            blocking |= 1 << i;
        }
    }
    state->cleared = blocking == 0;
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
    EntralinkBuffs_Clear();
    MI_CpuFill8(excluded, 0, sizeof(excluded));
    // The first room, an enemy room if there is one (it is no door's, whose types are drawn); each room draws the
    // rooms behind its doors as the player enters it
    state->roomCount = EntralinkRun_CountPlaces();
    role = EntralinkRun_GetPlace(1, &round);
    if (role == ENTRALINK_ROLE_PRE_BOSS) {
        room = ENTRALINK_RUN_PRE_BOSS_REST;
    } else {
        room = role == ENTRALINK_ROLE_ROOM ? EntralinkRun_DrawRandomRoom(ENTRALINK_TYPE_ENEMY, TRUE)
                                           : ENTRALINK_RUN_ROOM_NONE;
        if (room == ENTRALINK_RUN_ROOM_NONE) {
            room = EntralinkRun_DrawRoom(state, role, EntralinkRun_GetDrawRound(role, round),
                                         role == ENTRALINK_ROLE_ROOM ? ENTRALINK_TYPE_ENEMY : ENTRALINK_TYPE_ANY,
                                         excluded);
        }
    }
    if (room == ENTRALINK_RUN_ROOM_NONE) {
        room = EntralinkRun_DrawRoom(state, role, EntralinkRun_GetDrawRound(role, round), ENTRALINK_TYPE_ANY, excluded);
    }
    if (room == ENTRALINK_RUN_ROOM_NONE) {
        return;
    }
    // The hub shop's picks bought are held from the start, before the room's offers are drawn
    EntralinkHubShop_HoldBought(gameData);
    state->order[0] = room;
    state->room = 1;
    EntralinkRun_EnterRoom(gameData);
    // The team, the party's copies at level 100 (paperwhite2/entralink_run_party.h), and the run's own bag, empty
    EntralinkRun_KeepParty(gameData);
    EntralinkRun_KeepBag(gameData);
    EntralinkRecords_StartRun(gameData);
}

BOOL EntralinkRun_IsActive(GameData *gameData) {
    return EntralinkRun_GetState()->room != 0;
}

// Ends the run, its buffs gone with the rest of its state, and puts the real party back with the prestige gained, and
// the real bag. A run that was on gives its Dream Shards (the hub shop), which the cleared state keeps in shardsGained
static void EntralinkRun_End(GameData *gameData) {
    EntralinkRunState *state = EntralinkRun_GetState();
    BOOL active = state->room != 0;
    u32 shards = EntralinkHubShop_GetRunShards();
    u32 round;
    u32 i;

    // The records (paperwhite2/entralink_records.h): the rooms entered, those left behind done (their exits opened
    // only then) and the one the player is in if it is, or is the final room beaten; and the run's own, from its state
    // and its team before they go
    if (active) {
        for (i = 0; i < state->room; i++) {
            EntralinkRecords_SetRoom(gameData, sRooms[state->order[i]].recordId,
                                     i + 1 < state->room || state->cleared || state->won);
        }
        EntralinkRun_GetPlace(state->room, &round);
        EntralinkRecords_EndRun(gameData, round, shards);
    }
    MI_CpuFill8(state, 0, sizeof(EntralinkRunState));
    EntralinkBuffs_Clear();
    EntralinkRun_RestoreParty(gameData);
    EntralinkRun_RestoreBag(gameData);
    if (active) {
        state->shardsGained = EntralinkHubShop_AddShards(gameData, shards);
    }
}

void EntralinkRun_EndHere(GameData *gameData) {
    if (EntralinkRun_IsActive(gameData)) {
        EntralinkRun_End(gameData);
    }
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
        enemy = EntralinkRun_GetEnemy(room, EntralinkRun_GetBattle(room, npc->battle), npc->enemy);
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
            EntralinkRun_SpawnNpc(field, pokemonData, room, EntralinkRun_GetNpc(room, i), i);
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

const EntralinkNpc *EntralinkRun_GetAmbient(u32 index) {
    EntralinkRunState *state = EntralinkRun_GetState();
    const EntralinkRoom *room = EntralinkRun_GetRoom();
    const EntralinkNpc *npc;

    if (room == NULL || index >= room->npcCount || !(state->npcsSpawned & (1 << index)) ||
        (state->npcsGone & (1 << index))) {
        return NULL;
    }
    npc = EntralinkRun_GetNpc(room, index);
    return npc->type == ENTRALINK_NPC_AMBIENT ? npc : NULL;
}

FieldActor *EntralinkRun_SpawnAmbient(Field *field, u32 index) {
    const EntralinkRoom *room = EntralinkRun_GetRoom();
    FieldActor *actor;

    if (EntralinkRun_GetAmbient(index) == NULL) {
        return NULL;
    }
    // (an ambient always has a sprite of its own, so its spawn reads no Pokémon data)
    EntralinkRun_SpawnNpc(field, NULL, room, EntralinkRun_GetNpc(room, index), index);
    actor = FindFieldActor(Field_GetActorSystem(field), index);
    if (actor != NULL) {
        SetActorHidden(actor, TRUE);
    }
    return actor;
}

void EntralinkRun_RemoveAmbient(Field *field, u32 index) {
    if (EntralinkRun_GetAmbient(index) != NULL) {
        EntralinkRun_RemoveNpc(Field_GetGameSystem(field), index);
    }
}

// Whether an NPC type makes the room's choice when used, and is one of the room's choice NPCs that go once the choice
// is made: a rest's heal, revive, gift and swap, a shop (once talked to, whether anything is bought or not), an item
// room's ball, a buff ball
static BOOL EntralinkRun_IsChoiceType(u32 type) {
    switch (type) {
    case ENTRALINK_NPC_HEAL:
    case ENTRALINK_NPC_REVIVE:
    case ENTRALINK_NPC_GIFT:
    case ENTRALINK_NPC_SHOP:
    case ENTRALINK_NPC_ITEM_CHOICE:
    case ENTRALINK_NPC_BUFF_CHOICE:
    case ENTRALINK_NPC_SWAP:
        return TRUE;
    }
    return FALSE;
}

// Whether a choice NPC came up in the room and its choice isn't made yet: a rest or item room, which its battles (bonus
// battles) don't open
static BOOL EntralinkRun_IsChoicePending(EntralinkRunState *state, const EntralinkRoom *room) {
    u32 i;

    if (state->choiceMade) {
        return FALSE;
    }
    for (i = 0; i < room->npcCount; i++) {
        if ((state->npcsSpawned & (1 << i)) && EntralinkRun_IsChoiceType(EntralinkRun_GetNpc(room, i)->type)) {
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
        if (EntralinkRun_GetNpc(room, i)->type == ENTRALINK_NPC_BATTLE) {
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
        type = EntralinkRun_GetNpc(room, i)->type;
        if (type == ENTRALINK_NPC_AMBIENT) {
            continue;
        }
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
            EntralinkRun_IsChoiceType(EntralinkRun_GetNpc(room, i)->type)) {
            EntralinkRun_RemoveNpc(gsys, i);
        }
    }
    // A buff ball goes once its card is taken, as an item room's ball does with its item
    if (EntralinkRun_GetNpc(room, state->talkedNpc)->type == ENTRALINK_NPC_BUFF_CHOICE &&
        !(state->npcsGone & (1 << state->talkedNpc))) {
        EntralinkRun_RemoveNpc(gsys, state->talkedNpc);
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
    case ENTRALINK_MARKER_ENEMY_CHOICE:
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
    npc = EntralinkRun_GetNpc(room, index);
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
// The battle's enemies' stat multipliers (phase 5 and the rebalance), which the battle applies at its start: a room's
// (a raid in a room too) by its depth across the run, a boss's and the final room's by the round's boss values (the
// curve at its round's last room times its bonus, rebalance 2), times each enemy's own scale, at most 0xffff. A
// raid's HP also takes the raid factor, wherever it is, as three players hit it; a boss's foes in a double or triple
// share its HP bonus by run.json's boss_double_factor and boss_triple_factor (a raid is one foe)
static void EntralinkRun_SetEnemyScale(EntralinkRunState *state, const EntralinkRoom *room,
                                       const EntralinkBattle *battle) {
    static const EntralinkScaling SCALING[ENTRALINK_STAT_COUNT] = ENTRALINK_RUN_ENEMY_SCALING;
    const EntralinkScaling *scaling;
    const EntralinkEnemy *enemy;
    u32 round;
    u32 depth = EntralinkRun_GetRoomDepth(state->room);
    BOOL boss = room->role == ENTRALINK_ROLE_BOSS || room->role == ENTRALINK_ROLE_FINAL;
    BOOL raid = battle->format == ENTRALINK_FORMAT_RAID;
    u32 percent;
    u32 stat;
    u32 i;

    EntralinkRun_GetPlace(state->room, &round);
    for (stat = 0; stat < ENTRALINK_STAT_COUNT; stat++) {
        scaling = &SCALING[stat];
        if (boss) {
            percent = scaling->boss[round - 1];
        } else {
            percent = scaling->rooms[depth];
        }
        if (raid && stat == ENTRALINK_STAT_HP) {
            percent = percent * ENTRALINK_RUN_RAID_HP_PERCENT / 100;
        } else if (boss && stat == ENTRALINK_STAT_HP && battle->enemyCount == 2) {
            percent = percent * ENTRALINK_RUN_BOSS_DOUBLE_HP_PERCENT / 100;
        } else if (boss && stat == ENTRALINK_STAT_HP && battle->enemyCount >= 3) {
            percent = percent * ENTRALINK_RUN_BOSS_TRIPLE_HP_PERCENT / 100;
        }
        for (i = 0; i < ENTRALINK_RUN_ENEMIES_MAX; i++) {
            // A raid's three are its one enemy
            if (raid) {
                enemy = EntralinkRun_GetEnemy(room, battle, 0);
            } else if (i < battle->enemyCount) {
                enemy = EntralinkRun_GetEnemy(room, battle, i);
            } else {
                state->enemyScale[i][stat] = 100;
                continue;
            }
            state->enemyScale[i][stat] = MATH_MIN(percent * enemy->scale / 100, 0xffff);
        }
    }
}

// The battle's enemies in the records' codex (paperwhite2/entralink_records.h): met as it starts; once won, the one
// caught, or else every one beaten (a raid's three are its one enemy)
static void EntralinkRun_RecordEnemies(GameData *gameData, const EntralinkRoom *room, const EntralinkBattle *battle,
                                       BOOL won) {
    EntralinkRunState *state = EntralinkRun_GetState();
    u32 count = battle->format == ENTRALINK_FORMAT_RAID ? 1 : battle->enemyCount;
    u32 caught = ENTRALINK_RUN_ENEMIES_MAX;
    const EntralinkEnemy *enemy;
    u32 what;
    u32 i;

    for (i = 0; i < ENTRALINK_RUN_ENEMIES_MAX; i++) {
        if (won && state->caught && state->catchIds[i] != ENTRALINK_CATCH_NONE &&
            state->catchPids[i] == state->caughtPid) {
            caught = battle->format == ENTRALINK_FORMAT_RAID ? 0 : i;
        }
    }
    for (i = 0; i < count; i++) {
        enemy = EntralinkRun_GetEnemy(room, battle, i);
        if (!won) {
            what = ENTRALINK_RECORDS_MET;
        } else if (caught < ENTRALINK_RUN_ENEMIES_MAX) {
            if (i != caught) {
                continue;
            }
            what = ENTRALINK_RECORDS_CAUGHT;
        } else {
            what = ENTRALINK_RECORDS_BEATEN;
        }
        EntralinkRecords_AddEnemy(gameData, enemy->species, enemy->form, what);
    }
}

static GameEvent *EntralinkRun_CreateBattle(GameSystem *gsys, const EntralinkRoom *room,
                                            const EntralinkBattle *battle) {
    static const u8 FORMAT_STYLES[] = { BTL_STYLE_SINGLE, BTL_STYLE_DOUBLE, BTL_STYLE_TRIPLE, BTL_STYLE_TRIPLE };
    EntralinkRunState *state = EntralinkRun_GetState();
    GameData *gameData = GSYS_GetGameData(gsys);
    Field *field = GSYS_GetField(gsys);
    BtlSetup *setup = BtlSetup_Create(HEAPID_GAMEEVENT);
    PokeParty *party = PokeParty_Create(HEAPID_GAMEEVENT);
    BtlFieldStatus status;
    u32 format = battle->format;
    u32 i;

    // A double or triple with fewer enemies than places plays as the format they fill: the foe's AI reads each place
    // of its side as a Pokémon (AIGetHighestDamagingMoveWithPartners), and an empty one makes it write through a null
    // pointer, over the ITCM's code. The packer and the editor refuse such a battle; this keeps one from crashing
    if (format != ENTRALINK_FORMAT_RAID && battle->enemyCount != 0 && battle->enemyCount <= format) {
        format = battle->enemyCount - 1;
    }
    for (i = 0; i < ENTRALINK_RUN_ENEMIES_MAX; i++) {
        state->catchIds[i] = ENTRALINK_CATCH_NONE;
    }
    state->caught = FALSE;
    EntralinkRun_SetEnemyScale(state, room, battle);
    if (battle->format == ENTRALINK_FORMAT_RAID) {
        for (i = 0; i < 3; i++) {
            EntralinkRun_AddEnemy(gameData, party, EntralinkRun_GetEnemy(room, battle, 0), i, i != RAID_CENTER_SLOT);
        }
    } else {
        for (i = 0; i < battle->enemyCount; i++) {
            EntralinkRun_AddEnemy(gameData, party, EntralinkRun_GetEnemy(room, battle, i), i, FALSE);
        }
    }
    EntralinkRun_RecordEnemies(gameData, room, battle, FALSE);
    state->battleTurns = 0;
    SaveBtlFieldStatus(&status, gameData, field);
    if (room->weather != ENTRALINK_WEATHER_FIELD) {
        status.weather = room->weather;
    }
    BtlSetup_SetWildNormal(setup, gameData, party, &status, FORMAT_STYLES[format], HEAPID_GAMEEVENT);
    BtlSetup_SetFlag(setup, ENTRALINK_RUN_BTL_SETUP_FLAG);
    // A boss's, the final room's and a raid's foes have the bosses' protections (paperwhite2/entralink_battle.h)
    if (room->role == ENTRALINK_ROLE_BOSS || room->role == ENTRALINK_ROLE_FINAL ||
        battle->format == ENTRALINK_FORMAT_RAID) {
        BtlSetup_SetFlag(setup, ENTRALINK_RUN_BOSS_BTL_SETUP_FLAG);
    }
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

// The Dream Dust a battle won in the room gives: its kind's (a boss's, the final room's, an enemy choice or challenge
// room's, else an enemy room's) times its round's percent
static u32 EntralinkRun_GetBattleDust(EntralinkRunState *state, const EntralinkRoom *room) {
    static const u16 DUST[ENTRALINK_DUST_KINDS] = ENTRALINK_RUN_DUST;
    static const u16 ROUND_PERCENTS[] = ENTRALINK_RUN_DUST_ROUND_PERCENT;
    u32 kind;
    u32 round;

    switch (room->role) {
    case ENTRALINK_ROLE_BOSS:
        kind = ENTRALINK_DUST_BOSS;
        break;
    case ENTRALINK_ROLE_FINAL:
        kind = ENTRALINK_DUST_FINAL;
        break;
    default:
        switch (room->type) {
        case ENTRALINK_TYPE_ENEMY_CHOICE:
            kind = ENTRALINK_DUST_ENEMY_CHOICE;
            break;
        case ENTRALINK_TYPE_CHALLENGE:
            kind = ENTRALINK_DUST_CHALLENGE;
            break;
        default:
            kind = ENTRALINK_DUST_ENEMY;
            break;
        }
        break;
    }
    EntralinkRun_GetPlace(state->room, &round);
    return DUST[kind] * ROUND_PERCENTS[round - 1] / 100;
}

// Adds Dream Dust to the run's, which holds at most ENTRALINK_DUST_MAX; returns what it added
static u32 EntralinkRun_AddDust(EntralinkRunState *state, u32 dust) {
    if (state->dust + dust > ENTRALINK_DUST_MAX) {
        dust = ENTRALINK_DUST_MAX - state->dust;
    }
    state->dust += dust;
    return dust;
}

// After a battle won, the heal_after_battle buffs (Vigor) heal each Pokémon of the party that is still standing by
// their percent of its max HP (entralink-buffs.md, phase 3); a fainted one stays fainted
static void EntralinkRun_HealAfterBattle(GameData *gameData) {
    PokeParty *party = GameData_GetParty(gameData);
    PartyPkm *pkm;
    u32 percent = 0;
    u32 buff;
    u32 hp;
    u32 maxHP;
    int i;

    for (buff = 0; buff < ENTRALINK_BUFF_COUNT; buff++) {
        if (EntralinkBuffs_GetKind(buff) == ENTRALINK_BUFF_KIND_HEAL_AFTER_BATTLE) {
            percent += EntralinkBuffs_GetValue(buff, EntralinkBuffs_GetLevel(buff));
        }
    }
    if (percent == 0) {
        return;
    }
    for (i = 0; i < PokeParty_GetPkmCount(party); i++) {
        pkm = PokeParty_GetPkm(party, i);
        hp = PokeParty_GetParam(pkm, PKM_PARAM_HP, NULL);
        if (PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL) || hp == 0) {
            continue;
        }
        maxHP = PokeParty_GetParam(pkm, PKM_PARAM_MAX_HP, NULL);
        hp += maxHP * percent / 100;
        PokeParty_SetParam(pkm, PKM_PARAM_HP, hp > maxHP ? maxHP : hp);
    }
}

// After the room's battle, what the script does next (ENTRALINK_RUN_RESULT_*)
static u16 EntralinkRun_FinishBattle(GameSystem *gsys, const EntralinkRoom *room, const EntralinkBattle *battle) {
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
    // A capture counts as a win, which gives the room's Dream Dust
    EntralinkProgress_SetBattleWon(progress, battle->progressId);
    EntralinkRun_RecordCatch(gameData);
    // The records: the battle's turns (which the battle set as it ended), its enemies, a boss's or the final room's
    state->turns = MATH_MIN(state->turns + state->battleTurns, 0xffff);
    EntralinkRun_RecordEnemies(gameData, room, battle, TRUE);
    if (room->role == ENTRALINK_ROLE_BOSS || room->role == ENTRALINK_ROLE_FINAL) {
        EntralinkRecords_BeatBoss(gameData, room->recordId, state->battleTurns);
    }
    state->dustGained = EntralinkRun_AddDust(state, EntralinkRun_GetBattleDust(state, room));
    EntralinkRun_HealAfterBattle(gameData);
    for (i = 0; i < ENTRALINK_RUN_ENEMIES_MAX; i++) {
        state->catchIds[i] = ENTRALINK_CATCH_NONE;
    }
    state->caught = FALSE;
    // The hub shop's Dream Shards for a boss beaten, and the final room's (with its room's, as the run ends there)
    if (room->role == ENTRALINK_ROLE_BOSS) {
        state->shardBonus += ENTRALINK_RUN_BOSS_SHARDS;
    }
    // The room is done once the script has shown the after message (ENTRALINK_RUN_ACTION_CLEAR_ROOM)
    if (EntralinkRun_IsFinalRoom(state)) {
        state->shardBonus += ENTRALINK_RUN_FINAL_SHARDS + ENTRALINK_RUN_ROOM_SHARDS;
        state->won = TRUE;
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

// The source of the offer after the room's battle: a boss's, a challenge room's, else an enemy room's (an enemy
// choice room's, a rest room's bonus battle)
static u32 EntralinkRun_GetOfferSource(const EntralinkRoom *room) {
    if (room->role == ENTRALINK_ROLE_BOSS) {
        return ENTRALINK_BUFF_SOURCE_BOSS;
    }
    return room->type == ENTRALINK_TYPE_CHALLENGE ? ENTRALINK_BUFF_SOURCE_CHALLENGE : ENTRALINK_BUFF_SOURCE_ENEMY;
}

// Draws the offer after the room's battle won; none after the final room's, which ends the run. Returns how many
// cards it drew
static u32 EntralinkRun_DrawBattleOffer(GameData *gameData, const EntralinkRoom *room) {
    EntralinkRunState *state = EntralinkRun_GetState();
    u32 round;

    MI_CpuFill8(state->offer, 0, sizeof(state->offer));
    if (room == NULL || EntralinkRun_IsFinalRoom(state)) {
        return 0;
    }
    EntralinkRun_GetPlace(state->room, &round);
    return EntralinkBuffs_DrawOffer(gameData, EntralinkRun_GetOfferSource(room), round, state->offer,
                                    ENTRALINK_BUFF_OFFERS);
}

// The cards of a list (ENTRALINK_RUN_CARDS_*, but the buffs held) into cards, which has room for CARDS_MAX; returns
// how many places the list has. A gift card is its item, or else its buff
static u32 EntralinkRun_GetCards(EntralinkRunState *state, u32 list, EntralinkCard *cards) {
    u32 i;

    switch (list) {
    case ENTRALINK_RUN_CARDS_OFFER:
        MI_CpuCopy8(state->offer, cards, sizeof(state->offer));
        return ENTRALINK_BUFF_OFFERS;
    case ENTRALINK_RUN_CARDS_BUFF_ROOM:
        MI_CpuCopy8(state->roomOffer, cards, sizeof(state->roomOffer));
        return ENTRALINK_BUFF_OFFERS;
    case ENTRALINK_RUN_CARDS_GIFT:
        for (i = 0; i < ENTRALINK_RUN_GIFT_ITEMS; i++) {
            cards[i] = state->giftBuffs[i];
            if (state->giftItems[i] != ITEM_NONE) {
                cards[i].kind = ENTRALINK_CARD_ITEM;
                cards[i].id = state->giftItems[i];
                cards[i].type = 0;
            }
        }
        return ENTRALINK_RUN_GIFT_ITEMS;
    case ENTRALINK_RUN_CARDS_SHOP:
        MI_CpuCopy8(state->shopBuffs, cards, sizeof(state->shopBuffs));
        return ENTRALINK_BUFF_SHOP_BUFFS;
    }
    return 0;
}

// How many cards a list has left, or how many buffs are held
static u32 EntralinkRun_CountCards(EntralinkRunState *state, u32 list) {
    EntralinkCard cards[CARDS_MAX];
    u8 held[ENTRALINK_BUFF_COUNT];
    u32 count;
    u32 left = 0;
    u32 i;

    if (list == ENTRALINK_RUN_CARDS_HELD) {
        return EntralinkBuffs_ListHeld(held, ENTRALINK_BUFF_COUNT);
    }
    count = EntralinkRun_GetCards(state, list, cards);
    for (i = 0; i < count; i++) {
        if (cards[i].kind != ENTRALINK_CARD_NONE) {
            left++;
        }
    }
    return left;
}

// Picks a card of a list for ENTRALINK_RUN_ACTION_TAKE_CARD: its title (at the rank it would have) in word 1, a
// shop's price in word 2. Returns what taking it does (ENTRALINK_RUN_PICK_*)
static u16 EntralinkRun_PickCard(FieldScriptEnv *env, u32 list, u32 index) {
    EntralinkRunState *state = EntralinkRun_GetState();
    EntralinkCard cards[CARDS_MAX];
    u32 count = EntralinkRun_GetCards(state, list, cards);
    u32 price;

    state->picked.kind = ENTRALINK_CARD_NONE;
    if (index >= count || cards[index].kind == ENTRALINK_CARD_NONE) {
        return ENTRALINK_RUN_PICK_NONE;
    }
    state->picked = cards[index];
    state->pickedList = list;
    state->pickedIndex = index;
    EntralinkBuffs_SetTitleWord(env, 1, &state->picked, EntralinkBuffs_GetShownRank(&state->picked, FALSE));
    if (list == ENTRALINK_RUN_CARDS_SHOP) {
        price = EntralinkBuffs_GetPrice(&state->picked);
        WordSetNumber(ScriptWork_GetWordSet(FieldScriptEnv_GetScriptWork(env)), 2, price, DUST_DIGITS, NUM_PAD_NONE,
                      TRUE);
        if (state->dust < price) {
            return ENTRALINK_RUN_PICK_NO_DUST;
        }
    }
    return EntralinkBuffs_GetTakeKind(&state->picked);
}

// Takes the card picked: an item into the run's bag, a buff (a shop's for its price; a new gold with every slot full
// in place of the gold in a slot, whose title goes in word 2). The card leaves its list, and its title at the rank now
// held goes in word 1. FALSE if the bag had no room, the Dream Dust wasn't enough or no slot was given
static BOOL EntralinkRun_TakeCard(FieldScriptEnv *env, u32 slot) {
    EntralinkRunState *state = EntralinkRun_GetState();
    EntralinkCard card = state->picked;
    EntralinkCard replaced;
    u32 price = 0;

    if (card.kind == ENTRALINK_CARD_NONE) {
        return FALSE;
    }
    if (card.kind == ENTRALINK_CARD_ITEM) {
        if (!BagSave_AddItem(GameData_GetBag(FieldScriptEnv_GetGameData(env)), card.id, 1,
                             FieldScriptEnv_GetHeapID(env))) {
            return FALSE;
        }
    } else {
        if (state->pickedList == ENTRALINK_RUN_CARDS_SHOP) {
            price = EntralinkBuffs_GetPrice(&card);
        }
        if (state->dust < price) {
            return FALSE;
        }
        if (EntralinkBuffs_GetTakeKind(&card) == ENTRALINK_TAKE_REPLACE) {
            if (EntralinkBuffs_GetGoldSlot(slot) == ENTRALINK_BUFF_NONE) {
                return FALSE;
            }
            replaced.kind = ENTRALINK_CARD_BUFF;
            replaced.id = EntralinkBuffs_GetGoldSlot(slot);
            replaced.type = 0;
            EntralinkBuffs_SetTitleWord(env, 2, &replaced, EntralinkBuffs_GetShownRank(&replaced, TRUE));
        }
        state->dust -= price;
        EntralinkBuffs_Take(&card, slot);
        EntralinkRecords_TakeCard(FieldScriptEnv_GetGameData(env), &card);
    }
    switch (state->pickedList) {
    case ENTRALINK_RUN_CARDS_OFFER:
        MI_CpuFill8(state->offer, 0, sizeof(state->offer));
        break;
    case ENTRALINK_RUN_CARDS_BUFF_ROOM:
        MI_CpuFill8(state->roomOffer, 0, sizeof(state->roomOffer));
        break;
    case ENTRALINK_RUN_CARDS_SHOP:
        state->shopBuffs[state->pickedIndex].kind = ENTRALINK_CARD_NONE;
        break;
    }
    EntralinkBuffs_SetTitleWord(env, 1, &card, EntralinkBuffs_GetShownRank(&card, TRUE));
    state->picked.kind = ENTRALINK_CARD_NONE;
    return TRUE;
}

// The buff actions' part of the script command (ENTRALINK_RUN_ACTION_OFFER and on)
static void EntralinkRun_BuffAction(FieldScriptEnv *env, const EntralinkRoom *room, u16 action, u16 arg, u16 arg2,
                                    u16 *result) {
    EntralinkRunState *state = EntralinkRun_GetState();
    EntralinkCard cards[CARDS_MAX];
    u32 count;

    switch (action) {
    case ENTRALINK_RUN_ACTION_OFFER:
        *result = EntralinkRun_DrawBattleOffer(FieldScriptEnv_GetGameData(env), room);
        break;
    case ENTRALINK_RUN_ACTION_ADD_CARDS:
        if (arg == ENTRALINK_RUN_CARDS_HELD || arg == ENTRALINK_RUN_CARDS_GOLDS) {
            *result = EntralinkBuffs_AddHeldOptions(env, arg == ENTRALINK_RUN_CARDS_GOLDS);
            break;
        }
        count = EntralinkRun_GetCards(state, arg, cards);
        EntralinkRecords_SeeCards(FieldScriptEnv_GetGameData(env), cards, count);
        *result = EntralinkBuffs_AddCardOptions(env, cards, count, arg == ENTRALINK_RUN_CARDS_SHOP);
        break;
    case ENTRALINK_RUN_ACTION_PICK_CARD:
        *result = EntralinkRun_PickCard(env, arg, arg2);
        break;
    case ENTRALINK_RUN_ACTION_TAKE_CARD:
        *result = EntralinkRun_TakeCard(env, arg);
        break;
    case ENTRALINK_RUN_ACTION_SKIP_OFFER:
        EntralinkRun_AddDust(state, ENTRALINK_BUFF_SKIP_DUST);
        MI_CpuFill8(state->offer, 0, sizeof(state->offer));
        *result = state->dust;
        break;
    case ENTRALINK_RUN_ACTION_COUNT_CARDS:
        *result = EntralinkRun_CountCards(state, arg);
        break;
    case ENTRALINK_RUN_ACTION_FORECAST:
        if (arg == 0) {
            *result = EntralinkBuffs_NeedsWeather();
        } else {
            state->forecastWeather = arg;
            *result = arg;
        }
        break;
    }
}

BOOL Scrcmd_PaperWhite2_EntralinkRun(VM *vm, FieldScriptEnv *env) {
    u16 action = ScriptReadAny(vm, env);
    u16 arg = ScriptReadAny(vm, env);
    u16 arg2 = ScriptReadAny(vm, env);
    GameSystem *gsys = FieldScriptEnv_GetGameSystem(env);
    EntralinkRunState *state = EntralinkRun_GetState();
    const EntralinkRoom *room = EntralinkRun_GetRoom();
    const EntralinkNpc *npc = NULL;
    const EntralinkBattle *battle = NULL;
    FieldActor *actor;
    u32 count;
    u16 *result;

    result = ScriptReadVar(vm, env);
    if (room != NULL && state->talkedNpc < room->npcCount) {
        npc = EntralinkRun_GetNpc(room, state->talkedNpc);
        if (npc->type == ENTRALINK_NPC_BATTLE) {
            battle = EntralinkRun_GetBattle(room, npc->battle);
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
            *result = EntralinkRun_GetNpc(room, state->talkedNpc)->type;
            // A choice NPC whose choice was made only wishes the player well, but a shop that was the choice opens
            // again
            if (EntralinkRun_IsChoiceType(*result) && state->choiceMade &&
                !(*result == ENTRALINK_NPC_SHOP && (state->npcsUsed & (1 << state->talkedNpc)))) {
                *result = ENTRALINK_RUN_NPC_DONE;
            }
        }
        return FALSE;
    case ENTRALINK_RUN_ACTION_GET_ACTOR:
        *result = state->talkedNpc;
        return FALSE;
    case ENTRALINK_RUN_ACTION_GET_SPECIES:
        *result = battle != NULL ? EntralinkRun_GetEnemy(room, battle, npc->enemy)->species : 0;
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
        *result = battle != NULL ? EntralinkRun_FinishBattle(gsys, room, battle) : ENTRALINK_RUN_RESULT_LOST;
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
    case ENTRALINK_RUN_ACTION_GET_DUST:
        switch (arg) {
        case 0:
            *result = state->dustGained;
            break;
        case 1:
            *result = state->dust;
            break;
        case 2:
            *result = ENTRALINK_BUFF_SKIP_DUST;
            break;
        case 4:
            *result = ENTRALINK_RUN_SWAP_DUST;
            break;
        default:
            *result = EntralinkBuffs_GetPrice(&state->picked);
            break;
        }
        return FALSE;
    case ENTRALINK_RUN_ACTION_OFFER:
    case ENTRALINK_RUN_ACTION_ADD_CARDS:
    case ENTRALINK_RUN_ACTION_PICK_CARD:
    case ENTRALINK_RUN_ACTION_TAKE_CARD:
    case ENTRALINK_RUN_ACTION_SKIP_OFFER:
    case ENTRALINK_RUN_ACTION_COUNT_CARDS:
    case ENTRALINK_RUN_ACTION_FORECAST:
        EntralinkRun_BuffAction(env, room, action, arg, arg2, result);
        return FALSE;
    case ENTRALINK_RUN_ACTION_WARP_HUB:
        ScriptWork_CallEvent(FieldScriptEnv_GetScriptWork(env), EntralinkRun_CreateHubWarp(gsys));
        return TRUE;
    case ENTRALINK_RUN_ACTION_RESERVE_COUNT:
    case ENTRALINK_RUN_ACTION_RESERVE_ADD_OPTIONS:
    case ENTRALINK_RUN_ACTION_RESERVE_PICK_BOX:
    case ENTRALINK_RUN_ACTION_RESERVE_ADD:
    case ENTRALINK_RUN_ACTION_RESERVE_NAME:
    case ENTRALINK_RUN_ACTION_RESERVE_REMOVE:
    case ENTRALINK_RUN_ACTION_SWAP_CHECK:
    case ENTRALINK_RUN_ACTION_SWAP_CAN_LEAVE:
    case ENTRALINK_RUN_ACTION_SWAP:
        // Phase 7: the Reserve Box, in the hub too, and the swap NPC
        return EntralinkReserve_Action(env, action, arg, arg2, result);
    case ENTRALINK_RUN_ACTION_SHARDS:
    case ENTRALINK_RUN_ACTION_SHOP_ADD_CARDS:
    case ENTRALINK_RUN_ACTION_SHOP_PICK:
    case ENTRALINK_RUN_ACTION_SHOP_BUY:
    case ENTRALINK_RUN_ACTION_SHOP_RESET:
        // The hub shop and Dream Shards
        EntralinkHubShop_Action(env, action, arg, arg2, result);
        return FALSE;
    }
    return FALSE;
}
