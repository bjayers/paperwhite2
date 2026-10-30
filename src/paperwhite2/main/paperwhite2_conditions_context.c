#include "types.h"
#include "constants/arc.h"
#include "constants/pokemon.h"
#include "constants/vars.h"
#include "field/player_state.h"
#include "field/zone.h"
#include "gfl/arc.h"
#include "gfl/heap.h"
#include "nitro/mi.h"
#include "nitro/rtc.h"
#include "paperwhite2/conditions.h"
#include "pml/poke_party.h"
#include "save/adventure.h"
#include "save/event_work.h"
#include "save/save_control.h"
#include "system/game_data.h"
#include "system/rtc.h"

// Paper White 2: the conditions' context, filled from the game by main's own functions, so an app overlay can fill it
// as the field does, and the zone-load counter and the tables' loading. See include/paperwhite2/conditions.h

#define PERCENT 100
#define PARTY_MAX 6

// The bits of a status condition: sleep's turns, poison, burn, freeze, paralysis and bad poison
#define STATUS_BITS_SLEEP 0x7
#define STATUS_BITS_POISON 0x8
#define STATUS_BITS_BURN 0x10
#define STATUS_BITS_FREEZE 0x20
#define STATUS_BITS_PARALYSIS 0x40
#define STATUS_BITS_BAD_POISON 0x80

static u32 ConditionContext_GetStatus(u32 bits);

void ConditionContext_Init(ConditionContext *ctx) {
    MI_CpuFill8(ctx, 0, sizeof(ConditionContext));
}

void ConditionContext_FillWorld(ConditionContext *ctx, GameData *gameData) {
    EventWork *eventWork = GameData_GetEventWork(gameData);
    AdventureTime *time = getSaveAdventureTimeBlock(GameData_GetSaveControl(gameData));

    ctx->eventWork = eventWork;
    ctx->season = GameData_GetSeason(gameData);
    ctx->period = GetRealTimeDayPeriod(ctx->season);
    ctx->weather = GetNowWeather(gameData);
    ctx->zone = PlayerState_GetZoneID(GameData_GetPlayerState(gameData));
    ctx->zoneParent = GetZoneParentZone(ctx->zone);
    ctx->zoneLoadCounter = *EventWork_GetWkPtr(eventWork, EVENT_WORK_ZONE_LOAD_COUNTER);
    // The save clock's day, as the weather's date takes it: stable all day and after a reload
    ctx->dayNumber = RTC_ConvertDateToDay(&time->date);
    ctx->loadSeed = Conditions_Hash(ctx->zoneLoadCounter, ctx->zone);
    ctx->daySeed = Conditions_Hash(ctx->dayNumber, ctx->zone);
    ctx->filled |= CONDITION_CONTEXT_WORLD;
}

BOOL ConditionContext_FillSubject(ConditionContext *ctx, PartyPkm *pkm, u16 steps) {
    u32 maxHp;

    ctx->filled &= ~CONDITION_CONTEXT_SUBJECT;
    if (pkm == NULL || PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL)) {
        return FALSE;
    }
    ctx->species = PokeParty_GetParam(pkm, PKM_PARAM_SPECIES, NULL);
    ctx->form = PokeParty_GetParam(pkm, PKM_PARAM_FORM, NULL);
    ctx->level = PokeParty_GetParam(pkm, PKM_PARAM_LEVEL, NULL);
    ctx->type1 = PokeParty_GetParam(pkm, PKM_PARAM_TYPE1, NULL);
    ctx->type2 = PokeParty_GetParam(pkm, PKM_PARAM_TYPE2, NULL);
    ctx->nature = PokeParty_GetParam(pkm, PKM_PARAM_NATURE, NULL);
    ctx->friendship = PokeParty_GetParam(pkm, PKM_PARAM_HAPPINESS, NULL);
    maxHp = PokeParty_GetParam(pkm, PKM_PARAM_MAX_HP, NULL);
    ctx->hpPercent = maxHp == 0 ? 0 : PokeParty_GetParam(pkm, PKM_PARAM_HP, NULL) * PERCENT / maxHp;
    ctx->status = ConditionContext_GetStatus(PokeParty_GetParam(pkm, PKM_PARAM_STATUS, NULL));
    ctx->steps = steps;
    ctx->totalSteps = 0;
    ctx->itemWaiting = 0;
    ctx->filled |= CONDITION_CONTEXT_SUBJECT;
    return TRUE;
}

void ConditionContext_SetPosition(ConditionContext *ctx, u32 facing, u32 tileX, u32 tileY) {
    ctx->facing = facing;
    ctx->tileX = tileX;
    ctx->tileY = tileY;
    ctx->filled |= CONDITION_CONTEXT_POSITION;
}

BOOL ConditionContext_FillLead(ConditionContext *ctx, PokeParty *party) {
    if (PokeParty_GetPkmCount(party) == 0) {
        ctx->filled &= ~CONDITION_CONTEXT_SUBJECT;
        return FALSE;
    }
    return ConditionContext_FillSubject(ctx, PokeParty_GetPkm(party, 0), 0);
}

void ConditionContext_FillParty(ConditionContext *ctx, PokeParty *party) {
    u8 levels[PARTY_MAX];
    PartyPkm *pkm;
    u32 count = 0;
    s32 i;

    for (i = 0; i < PokeParty_GetPkmCount(party) && count < PARTY_MAX; i++) {
        pkm = PokeParty_GetPkm(party, i);
        if (!PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL)) {
            levels[count++] = PokeParty_GetParam(pkm, PKM_PARAM_LEVEL, NULL);
        }
    }
    ctx->partyCount = count;
    ctx->medianLevel = Conditions_MedianLevel(levels, count);
    ctx->scaledLevel = Conditions_ScaledLevel(ctx->medianLevel);
    ctx->filled |= CONDITION_CONTEXT_PARTY;
}

void ConditionContext_FillGame(ConditionContext *ctx, GameData *gameData) {
    PokeParty *party = GameData_GetParty(gameData);

    ConditionContext_FillWorld(ctx, gameData);
    ConditionContext_FillLead(ctx, party);
    ConditionContext_FillParty(ctx, party);
}

void Conditions_OnZoneInit(GameData *gameData) {
    u16 *counter = EventWork_GetWkPtr(GameData_GetEventWork(gameData), EVENT_WORK_ZONE_LOAD_COUNTER);

    // After 65535 it goes round to 0, which only changes which picks repeat
    (*counter)++;
}

ConditionTable *Conditions_LoadTable(u32 member, HeapID heapId) {
    u32 size = GFL_ArcSysGetDataLength(CONDITION_TABLE_ARCHIVE, member);
    ConditionTable *table = GFL_ArcSysReadHeapNew(CONDITION_TABLE_ARCHIVE, member, heapId);

    if (table != NULL && !Conditions_IsTableValid(table, size)) {
        GFL_HeapFree(table);
        return NULL;
    }
    return table;
}

// A status condition's CONDITION_STATUS_*, poison first as the follower's dialogue rules take it
static u32 ConditionContext_GetStatus(u32 bits) {
    if (bits & (STATUS_BITS_POISON | STATUS_BITS_BAD_POISON)) {
        return CONDITION_STATUS_POISON;
    }
    if (bits & STATUS_BITS_SLEEP) {
        return CONDITION_STATUS_SLEEP;
    }
    if (bits & STATUS_BITS_BURN) {
        return CONDITION_STATUS_BURN;
    }
    if (bits & STATUS_BITS_FREEZE) {
        return CONDITION_STATUS_FREEZE;
    }
    if (bits & STATUS_BITS_PARALYSIS) {
        return CONDITION_STATUS_PARALYSIS;
    }
    return CONDITION_STATUS_NONE;
}
