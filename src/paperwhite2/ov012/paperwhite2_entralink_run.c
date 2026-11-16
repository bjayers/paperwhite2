#include "types.h"
#include "battle/btl_result.h"
#include "battle/btl_setup.h"
#include "constants/battle.h"
#include "constants/directions.h"
#include "constants/moves.h"
#include "constants/pokemon.h"
#include "constants/vars.h"
#include "constants/zones.h"
#include "field/entree_forest.h"
#include "field/event_battle.h"
#include "field/event_mapchange.h"
#include "field/event_wild_battle.h"
#include "field/field.h"
#include "field/field_actor.h"
#include "field/field_event.h"
#include "field/field_script.h"
#include "field/zone.h"
#include "gfl/heap.h"
#include "gfl/random.h"
#include "paperwhite2/entralink_run.h"
#include "paperwhite2/entralink_run_actions.h"
#include "paperwhite2/entralink_run_battle.h"
#include "paperwhite2/entralink_run_config.h"
#include "paperwhite2/entralink_run_party.h"
#include "pml/poke_party.h"
#include "save/event_work.h"
#include "save/player_info.h"
#include "system/game_data.h"
#include "system/game_event.h"
#include "system/game_system.h"
#include "system/tpoke_data.h"
#include "system/vm.h"

// Paper White 2: the Entralink roguelike's prototype, in overlay 12 beside the Entree Forest's script commands. See
// include/paperwhite2/entralink_run.h and docs/paperwhite2/design/entralink-roguelike-prototype.md

// The script that talking to a room's enemy runs: global_10490.s's Script_9
#define SCRID_ENTRALINK_RUN_ENEMY 10498
// The Entree Forest's entrance area (SymbolMap), which a run's warps keep in GameData's forest area
#define ENTREE_FOREST_ENTRANCE_AREA 4
// The bits of a room's challenge in EVENT_WORK_ENTRALINK_RUN_ORDER
#define ORDER_BITS 4
#define ORDER_MASK 0xf
// The party slot of a raid's enemy, which a triple battle puts in the center
#define RAID_CENTER_SLOT 1

// Where a room is entered: its bottom exit, as from the hub (entree_forest_first_warp.c), the one exit every room has
static const VecFx32 sRoomArrivalPos = { FX32_CONST(248), 0, FX32_CONST(376) };
// The hub's entrance, where the Entralink's warp in arrives (entralink_warp.c)
static const VecFx32 sHubEntrancePos = { FX32_CONST(511), FX32_CONST(32), FX32_CONST(584) };

static const EntralinkChallenge sChallenges[ENTRALINK_RUN_CHALLENGE_COUNT] = ENTRALINK_RUN_CHALLENGES;
static const EntralinkEnemy sEnemies[ENTRALINK_RUN_ENEMY_COUNT] = ENTRALINK_RUN_ENEMIES;
static const u8 sPool[ENTRALINK_RUN_POOL_COUNT] = ENTRALINK_RUN_POOL;
static const u16 sRoomZones[ENTRALINK_RUN_ROOM_ZONE_COUNT] = ENTRALINK_RUN_ROOM_ZONES;

static u16 *EntralinkRun_GetVar(GameData *gameData, u16 var) {
    return EventWork_GetWkPtr(GameData_GetEventWork(gameData), var);
}

// How many rooms a run has: the pool's draws, then the final challenge's
static u32 EntralinkRun_GetRoomCount(void) {
    return ENTRALINK_RUN_POOL_ROOMS + 1;
}

static BOOL EntralinkRun_IsFinalRoom(u32 room) {
    return room == EntralinkRun_GetRoomCount();
}

void EntralinkRun_Start(GameData *gameData) {
    u8 pool[ENTRALINK_RUN_POOL_COUNT];
    u32 order = 0;
    u32 i;
    u32 pick;
    u8 swap;

    // The pool's places shuffled with the game's random (Fisher-Yates), of which the run takes the first
    for (i = 0; i < ENTRALINK_RUN_POOL_COUNT; i++) {
        pool[i] = i;
    }
    for (i = ENTRALINK_RUN_POOL_COUNT - 1; i > 0; i--) {
        pick = GFL_RandomLC(i + 1);
        swap = pool[i];
        pool[i] = pool[pick];
        pool[pick] = swap;
    }
    for (i = 0; i < ENTRALINK_RUN_POOL_ROOMS; i++) {
        order |= pool[i] << (i * ORDER_BITS);
    }
    *EntralinkRun_GetVar(gameData, EVENT_WORK_ENTRALINK_RUN_ORDER) = order;
    *EntralinkRun_GetVar(gameData, EVENT_WORK_ENTRALINK_RUN_ROOM) = 1;
    *EntralinkRun_GetVar(gameData, EVENT_WORK_ENTRALINK_RUN_CLEARED) = FALSE;
    // The team: the party's copies at level 100 (paperwhite2/entralink_run_party.h)
    EntralinkRun_KeepParty(gameData);
}

BOOL EntralinkRun_IsActive(GameData *gameData) {
    u32 room = *EntralinkRun_GetVar(gameData, EVENT_WORK_ENTRALINK_RUN_ROOM);

    return room != 0 && room <= EntralinkRun_GetRoomCount();
}

// Ends the run, and puts the real party back with the prestige gained
static void EntralinkRun_End(GameData *gameData) {
    *EntralinkRun_GetVar(gameData, EVENT_WORK_ENTRALINK_RUN_ROOM) = 0;
    *EntralinkRun_GetVar(gameData, EVENT_WORK_ENTRALINK_RUN_CLEARED) = FALSE;
    EntralinkRun_RestoreParty(gameData);
}

void EntralinkRun_OnFieldLoad(GameData *gameData, u16 zoneId) {
    if (!EntralinkRun_IsActive(gameData) && !EntralinkRun_IsPartyKept()) {
        return;
    }
    // A run is only ever in the forest, with its copies as the party: anywhere else (the debug menu's warps), or
    // without them (a game loaded from a save made in a run), it is over
    if (!GetZoneIsEntreeForest(zoneId) || !EntralinkRun_IsPartyKept()) {
        EntralinkRun_End(gameData);
    }
}

static BOOL EntralinkRun_IsRoomCleared(GameData *gameData) {
    return *EntralinkRun_GetVar(gameData, EVENT_WORK_ENTRALINK_RUN_CLEARED);
}

// The challenge of the room the player is in, or NULL outside a run
static const EntralinkChallenge *EntralinkRun_GetChallenge(GameData *gameData) {
    u32 room = *EntralinkRun_GetVar(gameData, EVENT_WORK_ENTRALINK_RUN_ROOM);
    u32 order;

    if (!EntralinkRun_IsActive(gameData)) {
        return NULL;
    }
    if (EntralinkRun_IsFinalRoom(room)) {
        return &sChallenges[ENTRALINK_RUN_FINAL_CHALLENGE];
    }
    order = *EntralinkRun_GetVar(gameData, EVENT_WORK_ENTRALINK_RUN_ORDER);
    return &sChallenges[sPool[(order >> ((room - 1) * ORDER_BITS)) & ORDER_MASK]];
}

u16 EntralinkRun_GetRoomZone(GameData *gameData) {
    u32 room = *EntralinkRun_GetVar(gameData, EVENT_WORK_ENTRALINK_RUN_ROOM);

    if (EntralinkRun_IsFinalRoom(room)) {
        return ENTRALINK_RUN_FINAL_ZONE;
    }
    // The room maps in turn, so that two rooms in a row are two maps when run.json lists two
    return sRoomZones[(room - 1) % ENTRALINK_RUN_ROOM_ZONE_COUNT];
}

static GameEvent *EntralinkRun_CreateHubWarp(GameSystem *gsys) {
    EntralinkRun_End(GSYS_GetGameData(gsys));
    return EventMapChangeWarp_CreateGrid(gsys, GSYS_GetField(gsys), ZONE_ENTRALINK, &sHubEntrancePos, DIR_UP, FALSE);
}

GameEvent *EntralinkRun_CreateExitEvent(GameSystem *gsys) {
    GameData *gameData = GSYS_GetGameData(gsys);
    u16 *room = EntralinkRun_GetVar(gameData, EVENT_WORK_ENTRALINK_RUN_ROOM);

    if (EntralinkRun_IsFinalRoom(*room)) {
        return EntralinkRun_CreateHubWarp(gsys);
    }
    (*room)++;
    *EntralinkRun_GetVar(gameData, EVENT_WORK_ENTRALINK_RUN_CLEARED) = FALSE;
    return EventEntreeForestWarp_Create(gsys, TRUE, &sRoomArrivalPos, DIR_UP, ENTREE_FOREST_ENTRANCE_AREA);
}

// The actor of an enemy, which faces where the data says and runs the enemies' script when talked to
static void EntralinkRun_SpawnEnemy(Field *field, TPokeData *pokemonData, const EntralinkEnemy *enemy, u16 uid) {
    static const u16 FACE_MOVE_CODES[] = { MOVE_CODE_FACE_UP, MOVE_CODE_FACE_DOWN, MOVE_CODE_FACE_LEFT,
                                           MOVE_CODE_FACE_RIGHT };
    MMSys *actorSystem = Field_GetActorSystem(field);
    ZoneNPC npc;

    if (FindFieldActor(actorSystem, uid) != NULL) {
        return;
    }
    MI_CpuFill8(&npc, 0, sizeof(ZoneNPC));
    npc.uid = uid;
    npc.modelId =
        GetPokemonFieldOBJCODE(pokemonData, enemy->species, enemy->gender == ENTRALINK_GENDER_FEMALE, enemy->form);
    npc.moveCode = FACE_MOVE_CODES[enemy->direction];
    npc.evType = ACTOR_EVENT_TYPE_NONE;
    npc.scrId = SCRID_ENTRALINK_RUN_ENEMY;
    npc.direction = enemy->direction;
    npc.areaW = 0xffff;
    npc.areaH = 0xffff;
    npc.pos.grid.x = enemy->x;
    npc.pos.grid.z = enemy->z;
    npc.pos.grid.y = 0;
    CreateNewActorByEntityNoWKOBJCODE(actorSystem, &npc, Field_GetPlayerStateZoneID(field));
}

void EntralinkRun_SpawnRoom(GameSystem *gsys) {
    GameData *gameData = GSYS_GetGameData(gsys);
    Field *field = GSYS_GetField(gsys);
    const EntralinkChallenge *challenge = EntralinkRun_GetChallenge(gameData);
    TPokeData *pokemonData;
    u32 i;

    if (challenge == NULL || EntralinkRun_IsRoomCleared(gameData)) {
        return;
    }
    pokemonData = LoadTPokeData(Field_GetHeapID(field));
    for (i = 0; i < challenge->enemyCount; i++) {
        EntralinkRun_SpawnEnemy(field, pokemonData, &sEnemies[challenge->firstEnemy + i], i);
    }
    FreeTPokeData(pokemonData);
}

static void EntralinkRun_RemoveEnemies(GameSystem *gsys, const EntralinkChallenge *challenge) {
    MMSys *actorSystem = Field_GetActorSystem(GSYS_GetField(gsys));
    FieldActor *actor;
    u32 i;

    for (i = 0; i < challenge->enemyCount; i++) {
        actor = FindFieldActor(actorSystem, i);
        if (actor != NULL) {
            DeleteActor(actor);
        }
    }
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

// The challenge's battle as a wild one (battle type 0, which a wild battle's script result commands read), with
// balls refused (ENTRALINK_RUN_BTL_SETUP_FLAG). A raid is a triple battle whose two sides are fainted copies of its
// enemy, so the enemy stands in the center and the battle plays as any triple with two foes down
static GameEvent *EntralinkRun_CreateBattle(GameSystem *gsys, const EntralinkChallenge *challenge) {
    static const u8 FORMAT_STYLES[] = { BTL_STYLE_SINGLE, BTL_STYLE_DOUBLE, BTL_STYLE_TRIPLE, BTL_STYLE_TRIPLE };
    GameData *gameData = GSYS_GetGameData(gsys);
    Field *field = GSYS_GetField(gsys);
    BtlSetup *setup = BtlSetup_Create(HEAPID_GAMEEVENT);
    PokeParty *party = PokeParty_Create(HEAPID_GAMEEVENT);
    BtlFieldStatus status;
    PartyPkm *pkm;
    u32 i;

    if (challenge->format == ENTRALINK_FORMAT_RAID) {
        for (i = 0; i < 3; i++) {
            pkm = EntralinkRun_CreateEnemyPkm(gameData, &sEnemies[challenge->firstEnemy], HEAPID_GAMEEVENT);
            if (i != RAID_CENTER_SLOT) {
                PokeParty_SetParam(pkm, PKM_PARAM_HP, 0);
            }
            PokeParty_AddPkm(party, pkm);
            GFL_HeapFree(pkm);
        }
    } else {
        for (i = 0; i < challenge->enemyCount; i++) {
            pkm = EntralinkRun_CreateEnemyPkm(gameData, &sEnemies[challenge->firstEnemy + i], HEAPID_GAMEEVENT);
            PokeParty_AddPkm(party, pkm);
            GFL_HeapFree(pkm);
        }
    }
    SaveBtlFieldStatus(&status, gameData, field);
    if (challenge->weather != ENTRALINK_WEATHER_FIELD) {
        status.weather = challenge->weather;
    }
    BtlSetup_SetWildNormal(setup, gameData, party, &status, FORMAT_STYLES[challenge->format], HEAPID_GAMEEVENT);
    BtlSetup_SetFlag(setup, ENTRALINK_RUN_BTL_SETUP_FLAG);
    GFL_HeapFree(party);
    return EventWildBattleCall_Create(gsys, field, setup, TRUE, ENCOUNT_MODE_NORMAL);
}

// After the room's battle, what the script does next (ENTRALINK_RUN_RESULT_*)
static u16 EntralinkRun_FinishBattle(GameSystem *gsys, const EntralinkChallenge *challenge) {
    GameData *gameData = GSYS_GetGameData(gsys);
    u32 room = *EntralinkRun_GetVar(gameData, EVENT_WORK_ENTRALINK_RUN_ROOM);
    u32 result = GameData_GetLastBtlResult(gameData);

    if (result != BTL_RESULT_VICTORY) {
        // A loss or running away ends the run, with the real party back as it was
        EntralinkRun_End(gameData);
        return result == BTL_RESULT_FLEE ? ENTRALINK_RUN_RESULT_FORFEIT : ENTRALINK_RUN_RESULT_LOST;
    }
    EntralinkRun_RemoveEnemies(gsys, challenge);
    *EntralinkRun_GetVar(gameData, EVENT_WORK_ENTRALINK_RUN_CLEARED) = TRUE;
    if (EntralinkRun_IsFinalRoom(room)) {
        return ENTRALINK_RUN_RESULT_RUN_WON;
    }
    return ENTRALINK_RUN_RESULT_CLEARED;
}

BOOL Scrcmd_PaperWhite2_EntralinkRun(VM *vm, FieldScriptEnv *env) {
    u16 action = ScriptReadAny(vm, env);
    GameSystem *gsys = FieldScriptEnv_GetGameSystem(env);
    GameData *gameData = GSYS_GetGameData(gsys);
    const EntralinkChallenge *challenge = EntralinkRun_GetChallenge(gameData);
    u16 *result;

    // The two arguments, which no action takes yet
    ScriptReadAny(vm, env);
    ScriptReadAny(vm, env);
    result = ScriptReadVar(vm, env);

    switch (action) {
    case ENTRALINK_RUN_ACTION_CAN_LEAVE:
        *result = challenge == NULL || EntralinkRun_IsRoomCleared(gameData);
        return FALSE;
    case ENTRALINK_RUN_ACTION_GET_SPECIES:
        *result = challenge != NULL ? sEnemies[challenge->firstEnemy].species : 0;
        return FALSE;
    case ENTRALINK_RUN_ACTION_BATTLE:
        if (challenge == NULL) {
            return FALSE;
        }
        ScriptWork_CallEvent(FieldScriptEnv_GetScriptWork(env), EntralinkRun_CreateBattle(gsys, challenge));
        return TRUE;
    case ENTRALINK_RUN_ACTION_BATTLE_RESULT:
        *result = challenge != NULL ? EntralinkRun_FinishBattle(gsys, challenge) : ENTRALINK_RUN_RESULT_LOST;
        return FALSE;
    case ENTRALINK_RUN_ACTION_WARP_HUB:
        ScriptWork_CallEvent(FieldScriptEnv_GetScriptWork(env), EntralinkRun_CreateHubWarp(gsys));
        return TRUE;
    }
    return FALSE;
}
