#include "types.h"
#include "field/zone.h"
#include "gfl/std.h"
#include "paperwhite2/entralink_progress.h"
#include "paperwhite2/entralink_run_actions.h"
#include "save/save_control.h"
#include "save/symbol_save.h"
#include "system/zone_weather.h"

// Paper White 2: the Entralink roguelike's progress in the Symbol block (paperwhite2/entralink_progress.h)

// The forest's original data, which only its old code reads, in RAM; sOldForestReady once it is an empty forest
static AreaNPCSave sOldForest;
static BOOL sOldForestReady;

u32 EntralinkProgress_GetSize(void) {
    return sizeof(EntralinkProgress);
}

void EntralinkProgress_Init(EntralinkProgress *progress) {
    MI_CpuFill8(progress, 0, sizeof(EntralinkProgress));
    progress->magic = ENTRALINK_PROGRESS_MAGIC;
    progress->version = ENTRALINK_PROGRESS_VERSION;
}

EntralinkProgress *EntralinkProgress_Get(SaveControl *save) {
    EntralinkProgress *progress = SaveControl_GetBlockPtr(save, SAVE_BLOCK_SYMBOL);

    // An old save's forest data, or a block of a later version that this one can't read
    if (progress->magic != ENTRALINK_PROGRESS_MAGIC || progress->version != ENTRALINK_PROGRESS_VERSION) {
        EntralinkProgress_Init(progress);
    }
    return progress;
}

static BOOL EntralinkProgress_GetBit(const u8 *bits, u32 index) {
    return (bits[index / 8] >> (index % 8)) & 1;
}

BOOL EntralinkProgress_IsBattleWon(EntralinkProgress *progress, u32 progressId) {
    return progressId < ENTRALINK_PROGRESS_BATTLES_MAX && EntralinkProgress_GetBit(progress->battlesWon, progressId);
}

void EntralinkProgress_SetBattleWon(EntralinkProgress *progress, u32 progressId) {
    if (progressId < ENTRALINK_PROGRESS_BATTLES_MAX) {
        progress->battlesWon[progressId / 8] |= 1 << (progressId % 8);
    }
}

BOOL EntralinkProgress_IsCaught(EntralinkProgress *progress, u32 progressId) {
    return progressId < ENTRALINK_PROGRESS_CATCHES_MAX && EntralinkProgress_GetBit(progress->caught, progressId);
}

void EntralinkProgress_SetCaught(EntralinkProgress *progress, u32 progressId) {
    if (progressId < ENTRALINK_PROGRESS_CATCHES_MAX) {
        progress->caught[progressId / 8] |= 1 << (progressId % 8);
    }
}

BOOL EntralinkProgress_IsRunCompleted(EntralinkProgress *progress) {
    return progress->runsCompleted != 0;
}

void EntralinkProgress_AddRunCompleted(EntralinkProgress *progress) {
    if (progress->runsCompleted != 0xffff) {
        progress->runsCompleted++;
    }
}

u32 EntralinkProgress_GetHubWeather(SaveControl *save, u32 zoneId) {
    // The forest's rounds' tints, by ENTRALINK_HUB_FOG_*
    static const u16 FOGS[ENTRALINK_HUB_FOG_COUNT] = { WEATHER_NONE, WEATHER_CUSTOM_TINT_9, WEATHER_CUSTOM_TINT_8,
                                                       WEATHER_CUSTOM_TINT_7 };
    u32 fog;

    if (!IsZoneEntralinkHub(zoneId)) {
        return WEATHER_NONE;
    }
    fog = EntralinkProgress_Get(save)->hubFog;
    return fog < NELEMS(FOGS) ? FOGS[fog] : WEATHER_NONE;
}

AreaNPCSave *EntralinkProgress_GetOldForestBlock(void) {
    // An empty forest, encrypted as the original's new game makes it
    if (!sOldForestReady) {
        initNpcData(&sOldForest);
        sOldForestReady = TRUE;
    }
    return &sOldForest;
}
