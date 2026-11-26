#include "types.h"
#include "battle/btl_result.h"
#include "battle/btl_setup.h"
#include "constants/flags.h"
#include "constants/items.h"
#include "constants/natures.h"
#include "constants/pokemon.h"
#include "field/field_script.h"
#include "field/player_state.h"
#include "gfl/random.h"
#include "gfl/rtc_cache.h"
#include "gfl/std.h"
#include "nitro/rtc.h"
#include "paperwhite2/entralink_run.h"
#include "paperwhite2/roamer_actions.h"
#include "paperwhite2/roamers.h"
#include "pml/poke_party.h"
#include "save/bag.h"
#include "save/event_work.h"
#include "save/high_link.h"
#include "save/player_info.h"
#include "save/save_control.h"
#include "system/game_data.h"
#include "system/vm.h"
#include "system/zone_weather.h"

// Paper White 2: the roaming legendaries' save, clocks, moves, release, battle's end and weather, in overlay 12, which
// the field keeps loaded, beside the zone changes and the battle's event. See include/paperwhite2/roamers.h and
// docs/paperwhite2/design/roaming-legendaries.md

#define NATURE_COUNT (NATURE_QUIRKY + 1)
// PokeParty_CreatePkm's six 5-bit IVs
#define IVS_MASK 0x3fffffff
// The Shiny Charm's extra rolls of a PID, as a wild Pokémon's (FieldEncount_RollPID)
#define SHINY_CHARM_ROLLS 2
#ifdef PAPERWHITE2_DEBUG_MENU
// The debug menu's Always shiny: rolls until the PID is shiny, as the wild Pokémon's ALWAYS_SHINY_ROLLS
#define ALWAYS_SHINY_ROLLS 0x4000
#endif

static const RoamerData sRoamerData[ROAMERS_COUNT] = ROAMERS_DATA;
static const RoamerRoute sRoamerRoutes[ROAMERS_ROUTE_COUNT] = ROAMERS_ROUTES;

static void Roamers_InitSave(RoamersSave *save);
static u32 Roamers_GetSeconds(void);
static BOOL Roamers_IsTarget(u32 slot, u32 target);
static void Roamers_Place(GameData *gameData, u32 slot);
static void Roamers_Return(GameData *gameData, u32 slot);
static void Roamers_CountDown(GameData *gameData, u32 slot, u32 elapsed);
static u32 Roamers_GetTakenRoutes(GameData *gameData, RoamersSave *save, u32 slot);
static void Roamers_GetDistances(u32 route, u8 *distances);
static u32 Roamers_PickRoute(u32 routes);

RoamersSave *Roamers_GetSave(GameData *gameData) {
    RoamersSave *save = SaveControl_GetBlockPtr(GameData_GetSaveControl(gameData), SAVE_BLOCK_WORLDTRADE);

    if (save->magic != ROAMERS_MAGIC || save->version != ROAMERS_VERSION) {
        Roamers_InitSave(save);
    }
    return save;
}

static void Roamers_InitSave(RoamersSave *save) {
    u32 i;

    MI_CpuFill8(save, 0, sizeof(RoamersSave));
    save->magic = ROAMERS_MAGIC;
    save->version = ROAMERS_VERSION;
    save->battleSlot = ROAMERS_NONE;
    save->playerZone = ROAMERS_ZONE_NONE;
    for (i = 0; i < ROAMERS_SAVE_SLOTS; i++) {
        save->roamers[i].zone = ROAMERS_ZONE_NONE;
    }
}

const RoamerData *Roamers_GetData(u32 roamer) {
    return &sRoamerData[roamer];
}

u32 Roamers_GetRoute(u32 zoneId) {
    u32 i;

    for (i = 0; i < ROAMERS_ROUTE_COUNT; i++) {
        if (sRoamerRoutes[i].zones[0] == zoneId || sRoamerRoutes[i].zones[1] == zoneId) {
            return i;
        }
    }
    return ROAMERS_NONE;
}

u32 Roamers_GetToday(void) {
    RTCDate date;
    RTCTime time;
    s32 day;

    RTC_GetCachedDateTime(&date, &time);
    day = RTC_ConvertDateToDay(&date);
    return day < 0 ? 0 : day;
}

// The clock's seconds since 2000-01-01, 0 for a time it refuses
static u32 Roamers_GetSeconds(void) {
    RTCDate date;
    RTCTime time;
    s64 seconds;

    RTC_GetCachedDateTime(&date, &time);
    seconds = RTC_ConvertDateTimeToSecond(&date, &time);
    return seconds < 0 ? 0 : (u32)seconds;
}

void Roamers_Reroll(GameData *gameData, Roamer *roamer) {
    u32 trainerId = getIDAsUInt(GetGameDataPlayerInfo(gameData));
    u32 rolls = 1;
    u32 pid;
    u32 i;

    if (BagSave_CheckAmount(GameData_GetBag(gameData), ITEM_SHINY_CHARM, 1, 4)) {
        rolls += SHINY_CHARM_ROLLS;
    }
    rolls = PassPower_ApplyLuckyShiny(rolls);
#ifdef PAPERWHITE2_DEBUG_MENU
    if (EventWork_FlagGet(GameData_GetEventWork(gameData), EVENT_FLAG_DEBUG_ALWAYS_SHINY)) {
        rolls = ALWAYS_SHINY_ROLLS;
    }
#endif
    for (i = 0; i < rolls; i++) {
        pid = GFL_RandomMT();
        if (PML_UtilPIDIsRare(trainerId, pid)) {
            break;
        }
    }
    roamer->personality = pid;
    roamer->ivs = GFL_RandomMT() & IVS_MASK;
    roamer->nature = GFL_RandomLCAlt(NATURE_COUNT);
}

static BOOL Roamers_IsTarget(u32 slot, u32 target) {
    if (target == ROAMERS_TARGET_ALL) {
        return TRUE;
    }
    if (target >= ROAMERS_TARGET_GROUP) {
        return sRoamerData[slot].group == target - ROAMERS_TARGET_GROUP;
    }
    return slot == target;
}

u32 Roamers_Release(GameData *gameData, u32 target) {
    RoamersSave *save = Roamers_GetSave(gameData);
    u32 count = 0;
    u32 i;

    for (i = 0; i < ROAMERS_COUNT; i++) {
        Roamer *roamer = &save->roamers[i];

        if (roamer->state == ROAMER_STATE_UNRELEASED && Roamers_IsTarget(i, target)) {
            roamer->flags = 0;
            Roamers_Return(gameData, i);
            count++;
        }
    }
    return count;
}

// A roaming roamer onto a free route of its own, anywhere
static void Roamers_Place(GameData *gameData, u32 slot) {
    RoamersSave *save = Roamers_GetSave(gameData);
    u32 routes = sRoamerData[slot].routes & ~Roamers_GetTakenRoutes(gameData, save, slot);
    u32 route = Roamers_PickRoute(routes);

    save->roamers[slot].zone = route == ROAMERS_NONE ? ROAMERS_ZONE_NONE : sRoamerRoutes[route].zones[0];
    save->roamers[slot].timer = ROAMERS_MOVE_SECONDS;
}

// The data's species, form and level (as they are now, so a changed level comes with the next return), a new PID, IVs
// and nature, full HP and no status, roaming on a free route: a release, and a knocked out roamer's return
static void Roamers_Return(GameData *gameData, u32 slot) {
    Roamer *roamer = &Roamers_GetSave(gameData)->roamers[slot];

    roamer->species = sRoamerData[slot].species;
    roamer->form = sRoamerData[slot].form;
    roamer->level = sRoamerData[slot].level;
    Roamers_Reroll(gameData, roamer);
    roamer->hp = ROAMERS_HP_FULL;
    roamer->status = 0;
    roamer->state = ROAMER_STATE_ROAMING;
    Roamers_Place(gameData, slot);
}

void PaperWhite2_Roamers_OnZoneChange(GameData *gameData, u32 zoneId) {
    RoamersSave *save = Roamers_GetSave(gameData);
    u32 now = Roamers_GetSeconds();
    u32 today = Roamers_GetToday();
    u32 pausedRoute = Roamers_GetRoute(save->playerZone);
    u32 elapsed = 0;
    u32 i;

    // A clock set back counts nothing; a long time counts as the most moves
    if (save->lastSeconds != 0 && now > save->lastSeconds) {
        elapsed = now - save->lastSeconds;
    }
    if (elapsed > ROAMERS_OFFLINE_MOVES_MAX * ROAMERS_MOVE_SECONDS) {
        elapsed = ROAMERS_OFFLINE_MOVES_MAX * ROAMERS_MOVE_SECONDS;
    }
    save->lastSeconds = now;
    save->playerZone = zoneId;
    if (save->frozen || EntralinkRun_IsActive(gameData)) {
        return;
    }
    for (i = 0; i < ROAMERS_COUNT; i++) {
        Roamer *roamer = &save->roamers[i];

        // Knocked out, it is back on any later day (or an earlier one, if the clock went back)
        if (roamer->state == ROAMER_STATE_KNOCKED_OUT && today != roamer->knockedOutDay) {
            Roamers_Return(gameData, i);
        } else if (roamer->state == ROAMER_STATE_ROAMING) {
            if (roamer->zone == ROAMERS_ZONE_NONE) {
                Roamers_Place(gameData, i);
            } else if (Roamers_GetRoute(roamer->zone) != pausedRoute) {
                Roamers_CountDown(gameData, i, elapsed);
            }
        }
    }
}

// A roamer's clock less elapsed seconds, with a move to a neighbouring route each time it runs out
static void Roamers_CountDown(GameData *gameData, u32 slot, u32 elapsed) {
    Roamer *roamer = &Roamers_GetSave(gameData)->roamers[slot];

    while (elapsed >= roamer->timer) {
        elapsed -= roamer->timer;
        roamer->timer = ROAMERS_MOVE_SECONDS;
        Roamers_Move(gameData, slot, 1);
    }
    roamer->timer -= elapsed;
}

// The routes that the other roaming roamers are on, and the player's: the one the player is in and the one of the
// last count, which are the same but during a zone change
static u32 Roamers_GetTakenRoutes(GameData *gameData, RoamersSave *save, u32 slot) {
    u32 taken = 0;
    u32 route;
    u32 i;

    for (i = 0; i < ROAMERS_COUNT; i++) {
        if (i != slot && save->roamers[i].state == ROAMER_STATE_ROAMING) {
            route = Roamers_GetRoute(save->roamers[i].zone);
            if (route != ROAMERS_NONE) {
                taken |= 1 << route;
            }
        }
    }
    route = Roamers_GetRoute(save->playerZone);
    if (route != ROAMERS_NONE) {
        taken |= 1 << route;
    }
    route = Roamers_GetRoute(PlayerState_GetZoneID(GameData_GetPlayerState(gameData)));
    if (route != ROAMERS_NONE) {
        taken |= 1 << route;
    }
    return taken;
}

// Each route's links from route, by a search outward one link at a time; ROAMERS_NONE for one not reached
static void Roamers_GetDistances(u32 route, u8 *distances) {
    u32 pending = 1 << route;
    u32 distance = 0;
    u32 next;
    u32 i;
    u32 j;

    MI_CpuFill8(distances, ROAMERS_NONE, ROAMERS_ROUTE_COUNT);
    distances[route] = 0;
    while (pending != 0) {
        distance++;
        next = 0;
        for (i = 0; i < ROAMERS_ROUTE_COUNT; i++) {
            if (!(pending & (1 << i))) {
                continue;
            }
            for (j = 0; j < ROAMERS_ROUTE_COUNT; j++) {
                if ((sRoamerRoutes[i].links & (1 << j)) && distances[j] == ROAMERS_NONE) {
                    distances[j] = distance;
                    next |= 1 << j;
                }
            }
        }
        pending = next;
    }
}

// One of the routes of a mask at random, or ROAMERS_NONE for none
static u32 Roamers_PickRoute(u32 routes) {
    u32 count = 0;
    u32 pick;
    u32 i;

    for (i = 0; i < ROAMERS_ROUTE_COUNT; i++) {
        if (routes & (1 << i)) {
            count++;
        }
    }
    if (count == 0) {
        return ROAMERS_NONE;
    }
    pick = GFL_RandomLCAlt(count);
    for (i = 0; i < ROAMERS_ROUTE_COUNT; i++) {
        if (routes & (1 << i)) {
            if (pick == 0) {
                return i;
            }
            pick--;
        }
    }
    return ROAMERS_NONE;
}

BOOL Roamers_Move(GameData *gameData, u32 slot, u32 links) {
    RoamersSave *save = Roamers_GetSave(gameData);
    Roamer *roamer = &save->roamers[slot];
    u32 free = sRoamerData[slot].routes & ~Roamers_GetTakenRoutes(gameData, save, slot);
    u32 route = Roamers_GetRoute(roamer->zone);
    u8 distances[ROAMERS_ROUTE_COUNT];
    u32 distance;
    u32 routes;
    u32 i;

    if (route == ROAMERS_NONE) {
        Roamers_Place(gameData, slot);
        return roamer->zone != ROAMERS_ZONE_NONE;
    }
    Roamers_GetDistances(route, distances);
    // The nearest free routes at least links away: a route between that is taken or not its own is passed over
    for (distance = links; distance < ROAMERS_ROUTE_COUNT; distance++) {
        routes = 0;
        for (i = 0; i < ROAMERS_ROUTE_COUNT; i++) {
            if ((free & (1 << i)) && distances[i] == distance) {
                routes |= 1 << i;
            }
        }
        if (routes != 0) {
            roamer->zone = sRoamerRoutes[Roamers_PickRoute(routes)].zones[0];
            return TRUE;
        }
    }
    return FALSE;
}

void PaperWhite2_Roamers_OnBattleEnd(GameData *gameData, BtlSetup *setup) {
    RoamersSave *save = Roamers_GetSave(gameData);
    u32 slot = save->battleSlot;
    Roamer *roamer;
    PartyPkm *pkm;
    u32 hp;

    save->battleSlot = ROAMERS_NONE;
    if (slot >= ROAMERS_COUNT || setup->battleType != 0 || !BtlSetup_CheckFlag(setup, ROAMERS_BTL_SETUP_FLAG)) {
        return;
    }
    roamer = &save->roamers[slot];
    if (roamer->state != ROAMER_STATE_ROAMING) {
        return;
    }
    if (setup->result == BTL_RESULT_CAPTURE) {
        roamer->state = ROAMER_STATE_CAUGHT;
        roamer->zone = ROAMERS_ZONE_NONE;
        return;
    }
    // The battle copies the foe's party back into the setup at its end (BtlMain's wild battles)
    pkm = PokeParty_GetPkm(BtlSetup_GetParty(setup, 1), 0);
    hp = PokeParty_GetParam(pkm, PKM_PARAM_HP, NULL);
    if (hp == 0) {
        roamer->state = ROAMER_STATE_KNOCKED_OUT;
        roamer->knockedOutDay = Roamers_GetToday();
        roamer->zone = ROAMERS_ZONE_NONE;
        return;
    }
    roamer->hp = hp == PokeParty_GetParam(pkm, PKM_PARAM_MAX_HP, NULL) ? ROAMERS_HP_FULL : hp;
    roamer->status = PokeParty_GetParam(pkm, PKM_PARAM_STATUS, NULL);
    // It fled, the player ran or lost: it scatters
    roamer->timer = ROAMERS_MOVE_SECONDS;
    Roamers_Move(gameData, slot, ROAMERS_SCATTER_LINKS);
}

u32 PaperWhite2_Roamers_GetWeather(GameData *gameData, u32 zoneId) {
    u32 route = Roamers_GetRoute(zoneId);
    RoamersSave *save;
    u32 i;

    if (route == ROAMERS_NONE) {
        return WEATHER_NONE;
    }
    save = Roamers_GetSave(gameData);
    for (i = 0; i < ROAMERS_COUNT; i++) {
        if (save->roamers[i].state == ROAMER_STATE_ROAMING && Roamers_GetRoute(save->roamers[i].zone) == route) {
            return sRoamerData[i].weather;
        }
    }
    return WEATHER_NONE;
}

BOOL Scrcmd_PaperWhite2_Roamers(VM *vm, FieldScriptEnv *env) {
    u16 action = ScriptReadAny(vm, env);
    u16 arg1 = ScriptReadAny(vm, env);
    u16 *result;
    GameData *gameData = FieldScriptEnv_GetGameData(env);
    RoamersSave *save = Roamers_GetSave(gameData);

    // The second argument is for later actions
    ScriptReadAny(vm, env);
    result = ScriptReadVar(vm, env);
    switch (action) {
    case ROAMERS_ACTION_RELEASE:
        *result = Roamers_Release(gameData, arg1);
        break;
    case ROAMERS_ACTION_GET_STATE:
        *result = arg1 < ROAMERS_COUNT ? save->roamers[arg1].state : ROAMER_STATE_UNRELEASED;
        break;
    case ROAMERS_ACTION_GET_ZONE:
        *result = arg1 < ROAMERS_COUNT && save->roamers[arg1].state == ROAMER_STATE_ROAMING ? save->roamers[arg1].zone
                                                                                            : ROAMERS_ZONE_NONE;
        break;
    default:
        *result = 0;
        break;
    }
    return FALSE;
}

BOOL Roamers_DebugBringHere(GameData *gameData, u32 slot) {
    RoamersSave *save = Roamers_GetSave(gameData);
    Roamer *roamer = &save->roamers[slot];
    u32 route = Roamers_GetRoute(PlayerState_GetZoneID(GameData_GetPlayerState(gameData)));
    u32 i;

    if (route == ROAMERS_NONE || !(sRoamerData[slot].routes & (1 << route)) || roamer->state == ROAMER_STATE_CAUGHT) {
        return FALSE;
    }
    if (roamer->state == ROAMER_STATE_UNRELEASED) {
        Roamers_Release(gameData, slot);
    } else if (roamer->state == ROAMER_STATE_KNOCKED_OUT) {
        Roamers_Return(gameData, slot);
    }
    // One roamer a route: another here moves away
    for (i = 0; i < ROAMERS_COUNT; i++) {
        if (i != slot && save->roamers[i].state == ROAMER_STATE_ROAMING &&
            Roamers_GetRoute(save->roamers[i].zone) == route) {
            Roamers_Move(gameData, i, 1);
        }
    }
    roamer->zone = sRoamerRoutes[route].zones[0];
    roamer->timer = ROAMERS_MOVE_SECONDS;
    return TRUE;
}

void Roamers_DebugHeal(GameData *gameData, u32 slot) {
    Roamer *roamer = &Roamers_GetSave(gameData)->roamers[slot];

    if (roamer->state == ROAMER_STATE_KNOCKED_OUT) {
        Roamers_Return(gameData, slot);
    }
    roamer->hp = ROAMERS_HP_FULL;
    roamer->status = 0;
}

u32 Roamers_DebugRespawn(GameData *gameData) {
    RoamersSave *save = Roamers_GetSave(gameData);
    u32 count = 0;
    u32 i;

    for (i = 0; i < ROAMERS_COUNT; i++) {
        if (save->roamers[i].state == ROAMER_STATE_KNOCKED_OUT) {
            Roamers_Return(gameData, i);
            count++;
        }
    }
    return count;
}

void Roamers_DebugReset(GameData *gameData) {
    Roamers_InitSave(Roamers_GetSave(gameData));
}

void Roamers_DebugExpireTimers(GameData *gameData) {
    RoamersSave *save = Roamers_GetSave(gameData);
    u32 i;

    for (i = 0; i < ROAMERS_COUNT; i++) {
        save->roamers[i].timer = 0;
    }
}
