// Events that send requests to the field's sound system. The file's name is descriptive, a guess: the ROM has no
// string for it. Names from swan (https://github.com/ds-pokemon-hacking/swan, GPL-3.0), except EventSoundWork,
// EventWaitFieldSound_Create and EventWaitFieldSound_Callback

#include "types.h"
#include "constants/sound.h"
#include "field/event_sound.h"
#include "field/field_sound.h"
#include "system/game_data.h"
#include "system/game_event.h"
#include "system/game_system.h"

#ifdef PAPERWHITE2
#include "paperwhite2/following_sound_policy.h"
#endif

static GameEventReturnCode EventBGMFadeIn_Callback(GameEvent *event, u32 *state, void *data);
static GameEventReturnCode EventBGMFadeOut_Callback(GameEvent *event, u32 *state, void *data);
static GameEventReturnCode EventBGMPushWait_Callback(GameEvent *event, u32 *state, void *data);
static GameEventReturnCode EventPushBGMFinish_Callback(GameEvent *event, u32 *state, void *data);
static GameEventReturnCode EventBGMPop_Callback(GameEvent *event, u32 *state, void *data);
static GameEventReturnCode EventBGMPopAll_Callback(GameEvent *event, u32 *state, void *data);
static GameEventReturnCode EventBGMPlayPushEx_Callback(GameEvent *event, u32 *state, void *data);
static GameEventReturnCode EventMEPlay_Callback(GameEvent *event, u32 *state, void *data);
static GameEventReturnCode EventBGMChange_Callback(GameEvent *event, u32 *state, void *data);
static GameEventReturnCode EventBGMFadeStop_Callback(GameEvent *event, u32 *state, void *data);
static GameEventReturnCode EventBGMPlay_Callback(GameEvent *event, u32 *state, void *data);
static GameEventReturnCode EventBGMPlayEx_Callback(GameEvent *event, u32 *state, void *data);
static GameEventReturnCode ChangeBGMToFieldSilence_Callback(GameEvent *event, u32 *state, void *data);
static GameEventReturnCode EventBGMPlayPush_Callback(GameEvent *event, u32 *state, void *data);
static GameEventReturnCode EventBattleBGMPlay_Callback(GameEvent *event, u32 *state, void *data);
static GameEventReturnCode EventWaitFieldSound_Callback(GameEvent *event, u32 *state, void *data);
static GameEventReturnCode EventBGMFadeWait_Callback(GameEvent *event, u32 *state, void *data);

static GameEventReturnCode EventBGMFadeIn_Callback(GameEvent *event, u32 *state, void *data) {
    EventSoundWork *work = data;
    FieldSound *fieldSound = work->fieldSound;

    switch (*state) {
    case 0:
        FieldSnd_SendRequest(fieldSound, FIELD_SND_FADE_IN, 0, 0, work->fadeInFrames);
        (*state)++;
        break;
    case 1:
        return GAMEEVENT_DONE;
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *EventBGMFadeIn_Create(GameSystem *gsys, u32 fadeInFrames) {
    GameData *gameData = GSYS_GetGameData(gsys);
    GameEvent *event = GameEvent_Create(gsys, NULL, EventBGMFadeIn_Callback, sizeof(EventSoundWork));
    EventSoundWork *work = GameEvent_GetData(event);
    work->fieldSound = GameData_GetFieldSoundSystem(gameData);
    work->fadeInFrames = fadeInFrames;
    return event;
}

static GameEventReturnCode EventBGMFadeOut_Callback(GameEvent *event, u32 *state, void *data) {
    EventSoundWork *work = data;
    FieldSound *fieldSound = work->fieldSound;

    switch (*state) {
    case 0:
        FieldSnd_SendRequest(fieldSound, FIELD_SND_FADE_OUT, 0, work->fadeOutFrames, 0);
        (*state)++;
        break;
    case 1:
        return GAMEEVENT_DONE;
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *EventBGMFadeOut_Create(GameSystem *gsys, u32 fadeOutFrames) {
    GameData *gameData = GSYS_GetGameData(gsys);
    GameEvent *event = GameEvent_Create(gsys, NULL, EventBGMFadeOut_Callback, sizeof(EventSoundWork));
    EventSoundWork *work = GameEvent_GetData(event);
    work->fieldSound = GameData_GetFieldSoundSystem(gameData);
    work->fadeOutFrames = fadeOutFrames;
    return event;
}

static GameEventReturnCode EventBGMPushWait_Callback(GameEvent *event, u32 *state, void *data) {
    EventSoundWork *work = data;
    FieldSound *fieldSound = work->fieldSound;

    switch (*state) {
    case 0:
        FieldSnd_SendRequest(fieldSound, FIELD_SND_BGM_PUSH, 0, work->fadeOutFrames, 0);
        (*state)++;
        break;
    case 1:
        if (FieldSnd_IsBusy(fieldSound) == FALSE) {
            (*state)++;
        }
        break;
    case 2:
        return GAMEEVENT_DONE;
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *EventBGMPushWait_Create(GameSystem *gsys, u32 fadeOutFrames) {
    GameData *gameData = GSYS_GetGameData(gsys);
    GameEvent *event = GameEvent_Create(gsys, NULL, EventBGMPushWait_Callback, sizeof(EventSoundWork));
    EventSoundWork *work = GameEvent_GetData(event);
    work->fieldSound = GameData_GetFieldSoundSystem(gameData);
    work->fadeOutFrames = fadeOutFrames;
    return event;
}

static GameEventReturnCode EventPushBGMFinish_Callback(GameEvent *event, u32 *state, void *data) {
    EventSoundWork *work = data;
    FieldSound *fieldSound = work->fieldSound;

    switch (*state) {
    case 0:
        FieldSnd_SendRequest(fieldSound, FIELD_SND_BGM_POP, 0, work->fadeOutFrames, work->fadeInFrames);
        (*state)++;
        break;
    case 1:
        if (FieldSnd_IsBusy(fieldSound) == FALSE) {
            (*state)++;
        }
        break;
    case 2:
        return GAMEEVENT_DONE;
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *EventPushBGMFinish_Create(GameSystem *gsys, u32 fadeOutFrames, u32 fadeInFrames) {
    GameData *gameData = GSYS_GetGameData(gsys);
    GameEvent *event = GameEvent_Create(gsys, NULL, EventPushBGMFinish_Callback, sizeof(EventSoundWork));
    EventSoundWork *work = GameEvent_GetData(event);
    work->fieldSound = GameData_GetFieldSoundSystem(gameData);
    work->fadeInFrames = fadeInFrames;
    work->fadeOutFrames = fadeOutFrames;
    return event;
}

static GameEventReturnCode EventBGMPop_Callback(GameEvent *event, u32 *state, void *data) {
    EventSoundWork *work = data;
    FieldSound *fieldSound = work->fieldSound;

    switch (*state) {
    case 0:
        FieldSnd_SendRequest(fieldSound, FIELD_SND_BGM_POP, 0, work->fadeOutFrames, work->fadeInFrames);
        (*state)++;
        break;
    case 1:
        return GAMEEVENT_DONE;
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *EventBGMPop_CreateEx(GameSystem *gsys, u32 fadeOutFrames, u32 fadeInFrames) {
    GameData *gameData = GSYS_GetGameData(gsys);
    GameEvent *event = GameEvent_Create(gsys, NULL, EventBGMPop_Callback, sizeof(EventSoundWork));
    EventSoundWork *work = GameEvent_GetData(event);
    work->fieldSound = GameData_GetFieldSoundSystem(gameData);
    work->fadeInFrames = fadeInFrames;
    work->fadeOutFrames = fadeOutFrames;
    return event;
}

static GameEventReturnCode EventBGMPopAll_Callback(GameEvent *event, u32 *state, void *data) {
    EventSoundWork *work = data;
    FieldSound *fieldSound = work->fieldSound;
    s32 depth;
    s32 i;

    switch (*state) {
    case 0:
        depth = FieldSnd_BGMGetStackIndex(fieldSound);
        if (depth > 0) {
            // Pops all but the last at once, and fades in the BGM under them
            for (i = 0; i < depth - 1; i++) {
                FieldSnd_SendRequest(fieldSound, FIELD_SND_BGM_POP, 0, 0, 0);
            }
            FieldSnd_SendRequest(fieldSound, FIELD_SND_BGM_POP, 0, 0, work->fadeInFrames);
        }
        (*state)++;
        break;
    case 1:
        return GAMEEVENT_DONE;
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *EventBGMPopAll_Create(GameSystem *gsys, u32 fadeInFrames) {
    GameData *gameData = GSYS_GetGameData(gsys);
    GameEvent *event = GameEvent_Create(gsys, NULL, EventBGMPopAll_Callback, sizeof(EventSoundWork));
    EventSoundWork *work = GameEvent_GetData(event);
    work->fieldSound = GameData_GetFieldSoundSystem(gameData);
    work->fadeInFrames = fadeInFrames;
    return event;
}

static GameEventReturnCode EventBGMPlayPushEx_Callback(GameEvent *event, u32 *state, void *data) {
    EventSoundWork *work = data;
    FieldSound *fieldSound = work->fieldSound;

    switch (*state) {
    case 0:
        FieldSnd_SendRequest(fieldSound, FIELD_SND_BGM_PUSH, 0, work->fadeOutFrames, 0);
        FieldSnd_SendRequest(fieldSound, FIELD_SND_BGM_CHANGE, work->bgm, 0, work->fadeInFrames);
        (*state)++;
        break;
    case 1:
        return GAMEEVENT_DONE;
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *EventBGMPlayPushEx_Create(GameSystem *gsys, u32 bgm, u32 fadeOutFrames, u32 fadeInFrames) {
    GameData *gameData = GSYS_GetGameData(gsys);
    GameEvent *event = GameEvent_Create(gsys, NULL, EventBGMPlayPushEx_Callback, sizeof(EventSoundWork));
    EventSoundWork *work = GameEvent_GetData(event);
    work->fieldSound = GameData_GetFieldSoundSystem(gameData);
    work->bgm = bgm;
    work->fadeInFrames = fadeInFrames;
    work->fadeOutFrames = fadeOutFrames;
    return event;
}

static GameEventReturnCode EventMEPlay_Callback(GameEvent *event, u32 *state, void *data) {
    EventSoundWork *work = data;
    FieldSound *fieldSound = work->fieldSound;

    switch (*state) {
    case 0:
        FieldSnd_SendRequest(fieldSound, FIELD_SND_BGM_PUSH, 0, 6, 0);
        FieldSnd_SendRequest(fieldSound, FIELD_SND_BGM_PLAY, work->bgm, 0, 0);
        (*state)++;
        break;
    case 1:
        return GAMEEVENT_DONE;
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *EventMEPlay_Create(GameSystem *gsys, u32 meId) {
    GameData *gameData = GSYS_GetGameData(gsys);
    GameEvent *event = GameEvent_Create(gsys, NULL, EventMEPlay_Callback, sizeof(EventSoundWork));
    EventSoundWork *work = GameEvent_GetData(event);
    work->fieldSound = GameData_GetFieldSoundSystem(gameData);
    work->bgm = meId;
    work->fadeOutFrames = 0;
    return event;
}

static GameEventReturnCode EventBGMChange_Callback(GameEvent *event, u32 *state, void *data) {
    EventSoundWork *work = data;
    FieldSound *fieldSound = work->fieldSound;

    switch (*state) {
    case 0:
        FieldSnd_SendRequest(fieldSound, FIELD_SND_BGM_CHANGE, work->bgm, work->fadeOutFrames, work->fadeInFrames);
        (*state)++;
        break;
    case 1:
        return GAMEEVENT_DONE;
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *EventBGMChange_Create(GameSystem *gsys, u32 bgm, u32 fadeOutFrames, u32 fadeInFrames) {
    GameData *gameData = GSYS_GetGameData(gsys);
    GameEvent *event = GameEvent_Create(gsys, NULL, EventBGMChange_Callback, sizeof(EventSoundWork));
    EventSoundWork *work = GameEvent_GetData(event);
    work->fieldSound = GameData_GetFieldSoundSystem(gameData);
    work->bgm = bgm;
    work->fadeInFrames = fadeInFrames;
    work->fadeOutFrames = fadeOutFrames;
    return event;
}

static GameEventReturnCode EventBGMFadeStop_Callback(GameEvent *event, u32 *state, void *data) {
    EventSoundWork *work = data;
    GameData *gameData = GSYS_GetGameData(work->gsys);
    FieldSound *fieldSound = work->fieldSound;

    switch (*state) {
    case 0:
        FieldSnd_SendRequest(fieldSound, FIELD_SND_FADE_OUT, 0, work->fadeOutFrames, 0);
        (*state)++;
        break;
    case 1:
        if (FieldSnd_IsBusy(fieldSound) == FALSE) {
            (*state)++;
        }
        break;
    case 2:
        FieldSnd_Release(fieldSound, gameData);
        (*state)++;
        break;
    case 3:
        return GAMEEVENT_DONE;
    }
    return GAMEEVENT_CONTINUE;
}

static GameEventReturnCode EventBGMPlay_Callback(GameEvent *event, u32 *state, void *data) {
    EventSoundWork *work = data;
    FieldSound *fieldSound = work->fieldSound;

    switch (*state) {
    case 0:
        FieldSnd_SendRequest(fieldSound, FIELD_SND_FADE_OUT, 0, 6, 0);
        FieldSnd_SendRequest(fieldSound, FIELD_SND_BGM_PLAY, work->bgm, 0, 0);
        (*state)++;
        break;
    case 1:
        if (FieldSnd_IsBusy(fieldSound) == FALSE) {
            return GAMEEVENT_DONE;
        }
        break;
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *EventBGMPlay_Create(GameSystem *gsys, u32 bgm) {
    GameData *gameData = GSYS_GetGameData(gsys);
    GameEvent *event = GameEvent_Create(gsys, NULL, EventBGMPlay_Callback, sizeof(EventSoundWork));
    EventSoundWork *work = GameEvent_GetData(event);
    work->fieldSound = GameData_GetFieldSoundSystem(gameData);
    work->bgm = bgm;
    return event;
}

static GameEventReturnCode EventBGMPlayEx_Callback(GameEvent *event, u32 *state, void *data) {
    EventSoundWork *work = data;
    FieldSound *fieldSound = work->fieldSound;

    switch (*state) {
    case 0:
        FieldSnd_SendRequest(fieldSound, FIELD_SND_FADE_OUT, 0, work->fadeOutFrames, 0);
        FieldSnd_SendRequest(fieldSound, FIELD_SND_BGM_PLAY, work->bgm, 0, 0);
        (*state)++;
        break;
    case 1:
        if (FieldSnd_IsBusy(fieldSound) == FALSE) {
            return GAMEEVENT_DONE;
        }
        break;
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *EventBGMPlayEx_Create(GameSystem *gsys, u32 bgm, u32 fadeOutFrames) {
    GameData *gameData = GSYS_GetGameData(gsys);
    GameEvent *event = GameEvent_Create(gsys, NULL, EventBGMPlayEx_Callback, sizeof(EventSoundWork));
    EventSoundWork *work = GameEvent_GetData(event);
    work->fieldSound = GameData_GetFieldSoundSystem(gameData);
    work->bgm = bgm;
    work->fadeOutFrames = fadeOutFrames;
    return event;
}

static GameEventReturnCode ChangeBGMToFieldSilence_Callback(GameEvent *event, u32 *state, void *data) {
    EventSoundWork *work = data;
    FieldSound *fieldSound = work->fieldSound;

    if (*state == 0) {
        FieldSnd_SendRequest(fieldSound, FIELD_SND_FADE_OUT, 0, work->fadeOutFrames, 0);
        FieldSnd_SendRequest(fieldSound, FIELD_SND_BGM_PLAY, SEQ_BGM_SILENCE_FIELD, 0, 0);
        return GAMEEVENT_DONE;
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *CreateBGMFadeOutEvent(GameSystem *gsys, u32 fadeOutFrames) {
    GameData *gameData = GSYS_GetGameData(gsys);
    GameEvent *event = GameEvent_Create(gsys, NULL, ChangeBGMToFieldSilence_Callback, sizeof(EventSoundWork));
    EventSoundWork *work = GameEvent_GetData(event);
    work->fieldSound = GameData_GetFieldSoundSystem(gameData);
    work->fadeOutFrames = fadeOutFrames;
    return event;
}

static GameEventReturnCode EventBGMPlayPush_Callback(GameEvent *event, u32 *state, void *data) {
    EventSoundWork *work = data;
    FieldSound *fieldSound = work->fieldSound;

    switch (*state) {
    case 0:
        FieldSnd_SendRequest(fieldSound, FIELD_SND_BGM_PUSH, 0, 6, 0);
        FieldSnd_SendRequest(fieldSound, FIELD_SND_BGM_PLAY, work->bgm, 0, 0);
        (*state)++;
        break;
    case 1:
        if (FieldSnd_IsBusy(fieldSound) == FALSE) {
            return GAMEEVENT_DONE;
        }
        break;
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *EventBGMPlayPush_Create(GameSystem *gsys, u32 bgm) {
    GameData *gameData = GSYS_GetGameData(gsys);
    GameEvent *event = GameEvent_Create(gsys, NULL, EventBGMPlayPush_Callback, sizeof(EventSoundWork));
    EventSoundWork *work = GameEvent_GetData(event);
    work->fieldSound = GameData_GetFieldSoundSystem(gameData);
    work->bgm = bgm;
    return event;
}

GameEvent *EventBGMFadeStop_Create(GameSystem *gsys, u16 fadeOutFrames) {
    GameData *gameData = GSYS_GetGameData(gsys);
    GameEvent *event = GameEvent_Create(gsys, NULL, EventBGMFadeStop_Callback, sizeof(EventSoundWork));
    EventSoundWork *work = GameEvent_GetData(event);
    work->gsys = gsys;
    work->fieldSound = GameData_GetFieldSoundSystem(gameData);
    work->fadeOutFrames = fadeOutFrames;
    return event;
}

static GameEventReturnCode EventBattleBGMPlay_Callback(GameEvent *event, u32 *state, void *data) {
    EventSoundWork *work = data;
    FieldSound *fieldSound = work->fieldSound;

    switch (*state) {
    case 0:
        // Keeps the field's BGM to come back to, unless one is already pushed
        if (FieldSnd_BGMGetStackIndex(fieldSound) == 0) {
            FieldSnd_SendRequest(fieldSound, FIELD_SND_BGM_PUSH, 0, 6, 0);
        } else {
            FieldSnd_SendRequest(fieldSound, FIELD_SND_FADE_OUT, 0, 6, 0);
        }
        (*state)++;
        break;
    case 1:
        if (FieldSnd_IsBusy(fieldSound) == FALSE) {
            (*state)++;
        }
        break;
    case 2:
        FieldSnd_SendRequest(fieldSound, FIELD_SND_BGM_PLAY, work->bgm, 0, 0);
        (*state)++;
        break;
    case 3:
        return GAMEEVENT_DONE;
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *EventBattleBGMPlay_Create(GameSystem *gsys, u32 bgm) {
    GameData *gameData = GSYS_GetGameData(gsys);
    GameEvent *event = GameEvent_Create(gsys, NULL, EventBattleBGMPlay_Callback, sizeof(EventSoundWork));
    EventSoundWork *work = GameEvent_GetData(event);
    work->fieldSound = GameData_GetFieldSoundSystem(gameData);
    work->bgm = bgm;
    return event;
}

GameEvent *EventBGMFadePop_Create(GameSystem *gsys) {
    GameData *gameData = GSYS_GetGameData(gsys);
    GameEvent *event = GameEvent_Create(gsys, NULL, EventBGMPop_Callback, sizeof(EventSoundWork));
    EventSoundWork *work = GameEvent_GetData(event);
    work->fieldSound = GameData_GetFieldSoundSystem(gameData);
    work->fadeInFrames = 60;
    work->fadeOutFrames = 30;
    return event;
}

static GameEventReturnCode EventWaitFieldSound_Callback(GameEvent *event, u32 *state, void *data) {
    EventSoundWork *work = data;
    FieldSound *fieldSound = work->fieldSound;

    switch (*state) {
    case 0:
        if (FieldSnd_IsBGMChanging(fieldSound) == FALSE) {
            (*state)++;
        }
        break;
    case 1:
        return GAMEEVENT_DONE;
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *EventWaitFieldSound_Create(GameSystem *gsys) {
    GameData *gameData = GSYS_GetGameData(gsys);
    GameEvent *event = GameEvent_Create(gsys, NULL, EventWaitFieldSound_Callback, sizeof(EventSoundWork));
    EventSoundWork *work = GameEvent_GetData(event);
    work->fieldSound = GameData_GetFieldSoundSystem(gameData);
    return event;
}

static GameEventReturnCode EventBGMFadeWait_Callback(GameEvent *event, u32 *state, void *data) {
    EventSoundWork *work = data;
    FieldSound *fieldSound = work->fieldSound;

    switch (*state) {
    case 0:
        if (FieldSnd_IsPopDone(fieldSound) == TRUE) {
            (*state)++;
        }
        break;
    case 1:
        return GAMEEVENT_DONE;
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *EventBGMFadeWait_Create(GameSystem *gsys) {
    GameData *gameData = GSYS_GetGameData(gsys);
    GameEvent *event = GameEvent_Create(gsys, NULL, EventBGMFadeWait_Callback, sizeof(EventSoundWork));
    EventSoundWork *work = GameEvent_GetData(event);
    work->fieldSound = GameData_GetFieldSoundSystem(gameData);
    return event;
}

#ifdef PAPERWHITE2
// Paper White 2: whether a callback is one of the sound events that the Following Pokémon's scene policy lets
// run with the follower kept, those of res/paperwhite2/following/audio-event-policy.json
// (paperwhite2_following_scene.c)
BOOL PaperWhite2_IsFollowingSoundCallback(GameEventCallback callback) {
    return Following_IsSoundCallback(callback);
}

// Paper White 2: whether a callback is the wait for the field's music to fade back, or its pop, which a battle's
// return runs; the Following Pokémon's scene policy lets them run with the follower placed
BOOL PaperWhite2_IsBGMRestoreCallback(GameEventCallback callback) {
    return callback == EventBGMFadeWait_Callback || callback == EventBGMPop_Callback;
}
#endif
