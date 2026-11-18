#include "types.h"
#include "battle/btl_result.h"
#include "battle/btl_setup.h"
#include "constants/arc.h"
#include "constants/battle.h"
#include "constants/directions.h"
#include "constants/items.h"
#include "constants/moves.h"
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

// The script that talking to a room's NPC runs: global_10490.s's Script_9
#define SCRID_ENTRALINK_RUN_NPC 10498
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

// Whether a room is of a role and fits a round (round 0: any) as a pool takes them: kept to the round, kept to no
// round (generic), or either
static BOOL EntralinkRun_IsInPool(u32 index, u32 role, u32 round, u32 pool) {
    const EntralinkRoom *room = &sRooms[index];
    BOOL kept;

    if (room->role != role) {
        return FALSE;
    }
    if (round == 0) {
        return TRUE;
    }
    kept = (room->rounds & (1 << (round - 1))) != 0;
    switch (pool) {
    case POOL_KEPT:
        return kept;
    case POOL_GENERIC:
        return room->rounds == 0;
    }
    return kept || room->rounds == 0;
}

// Whether a room can be drawn: in the pool, not excluded (the room just played, the other doors' rooms), and among the
// least used so far
static BOOL EntralinkRun_IsDrawable(u32 index, u32 role, u32 round, u32 pool, const u8 *excluded, const u8 *uses,
                                    u32 fewest) {
    return !excluded[index] && uses[index] == fewest && EntralinkRun_IsInPool(index, role, round, pool);
}

// The pool a round's room of a role is drawn from: a round's rooms from those kept to it and the generic ones, its boss
// from the bosses kept to it if there are any, else the generic ones
static u32 EntralinkRun_GetPool(u32 role, u32 round) {
    u32 i;

    if (role != ENTRALINK_ROLE_BOSS) {
        return POOL_ANY;
    }
    for (i = 0; i < ENTRALINK_RUN_ROOM_COUNT; i++) {
        if (EntralinkRun_IsInPool(i, role, round, POOL_KEPT)) {
            return POOL_KEPT;
        }
    }
    return POOL_GENERIC;
}

// A room of a role for a round (0: any), at random among those of its pool not excluded that have come up the fewest
// times in the run so far: so no room comes up twice while one that fits hasn't come up. ENTRALINK_RUN_ROOM_NONE if
// none fits
static u32 EntralinkRun_DrawRoom(EntralinkRunState *state, u32 role, u32 round, const u8 *excluded) {
    u8 uses[ENTRALINK_RUN_ROOM_COUNT];
    u32 pool = EntralinkRun_GetPool(role, round);
    u32 fewest = USES_NONE;
    u32 count = 0;
    u32 pick;
    u32 i;

    MI_CpuFill8(uses, 0, sizeof(uses));
    for (i = 0; i < state->room; i++) {
        uses[state->order[i]]++;
    }
    for (i = 0; i < ENTRALINK_RUN_ROOM_COUNT; i++) {
        if (!excluded[i] && uses[i] < fewest && EntralinkRun_IsInPool(i, role, round, pool)) {
            fewest = uses[i];
        }
    }
    if (fewest == USES_NONE) {
        return ENTRALINK_RUN_ROOM_NONE;
    }
    for (i = 0; i < ENTRALINK_RUN_ROOM_COUNT; i++) {
        if (EntralinkRun_IsDrawable(i, role, round, pool, excluded, uses, fewest)) {
            count++;
        }
    }
    pick = GFL_RandomLC(count);
    for (i = 0; i < ENTRALINK_RUN_ROOM_COUNT; i++) {
        if (EntralinkRun_IsDrawable(i, role, round, pool, excluded, uses, fewest)) {
            if (pick == 0) {
                break;
            }
            pick--;
        }
    }
    return i;
}

// The role of a place of the run (from 1): one of a round's rooms, its boss, or the final room after the last round;
// and its round, from 1 (the final room's is the last round's)
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
            count++;
            if (place == count) {
                return ENTRALINK_ROLE_BOSS;
            }
        }
    }
    *round = ENTRALINK_RUN_ROUND_COUNT;
    return ENTRALINK_ROLE_FINAL;
}

// How many rooms a run has: each round's rooms and boss, and the final room
static u32 EntralinkRun_CountPlaces(void) {
    u32 count = 1;
    u32 i;

    for (i = 0; i < ENTRALINK_RUN_ROUND_COUNT; i++) {
        count += sRounds[i].rooms + sRounds[i].boss;
    }
    return count < ENTRALINK_RUN_ROOMS_MAX ? count : ENTRALINK_RUN_ROOMS_MAX;
}

// A room for a place: the final room is drawn from every final room, whatever its round
static u32 EntralinkRun_GetDrawRound(u32 role, u32 round) {
    return role == ENTRALINK_ROLE_FINAL ? 0 : round;
}

// The room behind a door: never the room just played, and another than the other doors' while enough rooms fit;
// the room just played only if it is the only one that fits
static u32 EntralinkRun_DrawDoorRoom(EntralinkRunState *state, u32 role, u32 round) {
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
    room = EntralinkRun_DrawRoom(state, role, round, excluded);
    if (room != ENTRALINK_RUN_ROOM_NONE) {
        return room;
    }
    // Fewer rooms fit than there are doors: one behind another door again
    MI_CpuFill8(excluded, 0, sizeof(excluded));
    excluded[previous] = TRUE;
    room = EntralinkRun_DrawRoom(state, role, round, excluded);
    if (room != ENTRALINK_RUN_ROOM_NONE) {
        return room;
    }
    MI_CpuFill8(excluded, 0, sizeof(excluded));
    return EntralinkRun_DrawRoom(state, role, round, excluded);
}

// The rooms behind the room's forward doors, for the run's next place: a round's room behind each, with a chance of
// showing the unknown marker; before a boss or the final room, it alone, behind the north door (the pre-boss map's one
// way on). Nothing after the final room
static void EntralinkRun_DrawDoors(EntralinkRunState *state) {
    u32 round;
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
    if (role != ENTRALINK_ROLE_ROOM) {
        state->doorRooms[ENTRALINK_DOOR_NORTH] =
            EntralinkRun_DrawDoorRoom(state, role, EntralinkRun_GetDrawRound(role, round));
        return;
    }
    for (door = 0; door < ENTRALINK_RUN_DOORS; door++) {
        state->doorRooms[door] = EntralinkRun_DrawDoorRoom(state, role, round);
        if (state->doorRooms[door] != ENTRALINK_RUN_ROOM_NONE && GFL_RandomLC(100) < ENTRALINK_RUN_UNKNOWN_CHANCE) {
            state->doorUnknown |= 1 << door;
        }
    }
}

// As the player enters the room: which of its NPCs come up (their requirements and chance, rolled once), whether it is
// done from the start (nothing came up), its round's field weather, and the rooms behind its doors
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
    // The first room; each room draws the rooms behind its doors as the player enters it
    state->roomCount = EntralinkRun_CountPlaces();
    role = EntralinkRun_GetPlace(1, &round);
    room = EntralinkRun_DrawRoom(state, role, EntralinkRun_GetDrawRound(role, round), excluded);
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

// The actor of an NPC, which faces where the data says and runs the NPCs' script when talked to: its own sprite, or a
// battle NPC's enemy's walking Pokémon
static void EntralinkRun_SpawnNpc(Field *field, TPokeData *pokemonData, const EntralinkRoom *room,
                                  const EntralinkNpc *npc, u16 uid) {
    static const u16 FACE_MOVE_CODES[] = { MOVE_CODE_FACE_UP, MOVE_CODE_FACE_DOWN, MOVE_CODE_FACE_LEFT,
                                           MOVE_CODE_FACE_RIGHT };
    MMSys *actorSystem = Field_GetActorSystem(field);
    const EntralinkEnemy *enemy;
    ZoneNPC zoneNpc;

    if (FindFieldActor(actorSystem, uid) != NULL) {
        return;
    }
    MI_CpuFill8(&zoneNpc, 0, sizeof(ZoneNPC));
    zoneNpc.uid = uid;
    if (npc->sprite != 0) {
        zoneNpc.modelId = npc->sprite;
    } else {
        enemy = &sEnemies[sBattles[room->firstBattle + npc->battle].firstEnemy + npc->enemy];
        zoneNpc.modelId =
            GetPokemonFieldOBJCODE(pokemonData, enemy->species, enemy->gender == ENTRALINK_GENDER_FEMALE, enemy->form);
    }
    zoneNpc.moveCode = FACE_MOVE_CODES[npc->direction];
    zoneNpc.evType = ACTOR_EVENT_TYPE_NONE;
    zoneNpc.scrId = SCRID_ENTRALINK_RUN_NPC;
    zoneNpc.direction = npc->direction;
    zoneNpc.areaW = 0xffff;
    zoneNpc.areaH = 0xffff;
    zoneNpc.pos.grid.x = npc->x;
    zoneNpc.pos.grid.z = npc->z;
    zoneNpc.pos.grid.y = 0;
    CreateNewActorByEntityNoWKOBJCODE(actorSystem, &zoneNpc, Field_GetPlayerStateZoneID(field));
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
}

// Takes an NPC away for the rest of the room
static void EntralinkRun_RemoveNpc(GameSystem *gsys, u32 index) {
    FieldActor *actor = FindFieldActor(Field_GetActorSystem(GSYS_GetField(gsys)), index);

    EntralinkRun_GetState()->npcsGone |= 1 << index;
    if (actor != NULL) {
        DeleteActor(actor);
    }
}

// After a won battle, its NPCs and the other battles' go: the room has been fought, and is done
static void EntralinkRun_ClearRoom(GameSystem *gsys, const EntralinkRoom *room) {
    u32 i;

    for (i = 0; i < room->npcCount; i++) {
        if (sNpcs[room->firstNpc + i].type == ENTRALINK_NPC_BATTLE) {
            EntralinkRun_RemoveNpc(gsys, i);
        }
    }
    EntralinkRun_GetState()->cleared = TRUE;
}

// A room with no battle is done once every NPC that came up in it has been used: talked to, or its item taken
static void EntralinkRun_CheckRoomDone(void) {
    EntralinkRunState *state = EntralinkRun_GetState();
    const EntralinkRoom *room = EntralinkRun_GetRoom();
    u32 i;

    if (room == NULL) {
        return;
    }
    for (i = 0; i < room->npcCount; i++) {
        if (!(state->npcsSpawned & (1 << i))) {
            continue;
        }
        if (sNpcs[room->firstNpc + i].type == ENTRALINK_NPC_BATTLE) {
            return;
        }
        if (!((state->npcsGone | state->npcsUsed) & (1 << i))) {
            return;
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

u32 EntralinkRun_GetNpcMarker(u32 index) {
    EntralinkRunState *state = EntralinkRun_GetState();
    const EntralinkRoom *room = EntralinkRun_GetRoom();

    if (room == NULL || index >= room->npcCount || !(state->npcsSpawned & (1 << index)) ||
        (state->npcsGone & (1 << index))) {
        return ENTRALINK_NPC_MARKER_NONE;
    }
    return sNpcs[room->firstNpc + index].marker;
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

// Gives an item NPC's item into the run's bag, and takes the NPC away
static BOOL EntralinkRun_GiveItem(GameSystem *gsys, const EntralinkNpc *npc, HeapID heapId) {
    if (npc == NULL || !BagSave_AddItem(GameData_GetBag(GSYS_GetGameData(gsys)), npc->item, npc->count, heapId)) {
        return FALSE;
    }
    EntralinkRun_RemoveNpc(gsys, EntralinkRun_GetState()->talkedNpc);
    EntralinkRun_CheckRoomDone();
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
        if (room != NULL && actor != NULL && GetActorUID(actor) < room->npcCount) {
            state->talkedNpc = GetActorUID(actor);
            *result = sNpcs[room->firstNpc + state->talkedNpc].type;
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
        *result = npc != NULL ? npc->item : 0;
        return FALSE;
    case ENTRALINK_RUN_ACTION_GET_ITEM_COUNT:
        *result = npc != NULL ? npc->count : 0;
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
    case ENTRALINK_RUN_ACTION_WARP_HUB:
        ScriptWork_CallEvent(FieldScriptEnv_GetScriptWork(env), EntralinkRun_CreateHubWarp(gsys));
        return TRUE;
    }
    return FALSE;
}
