#ifndef POKEBW2_FIELD_EVENT_SOUND_H
#define POKEBW2_FIELD_EVENT_SOUND_H

// Events that send requests to the field's sound system (src/system/event_sound.c, a descriptive name). Names from
// swan (https://github.com/ds-pokemon-hacking/swan, GPL-3.0), except EventWaitFieldSound_Create. Frame counts are
// fade lengths

#include "types.h"
#include "struct_decls.h"
#include "system/game_event.h"

// The work of every event in this file; each uses only some of it
typedef struct {
    GameSystem *gsys;
    FieldSound *fieldSound;
    u32 bgm;
    u16 fadeInFrames;
    u16 fadeOutFrames;
} EventSoundWork;

GameEvent *EventBGMFadeIn_Create(GameSystem *gsys, u32 fadeInFrames);
GameEvent *EventBGMFadeOut_Create(GameSystem *gsys, u32 fadeOutFrames);
// Pushes the BGM and waits until the sound system is idle
GameEvent *EventBGMPushWait_Create(GameSystem *gsys, u32 fadeOutFrames);
// Pops the BGM and waits until the sound system is idle
GameEvent *EventPushBGMFinish_Create(GameSystem *gsys, u32 fadeOutFrames, u32 fadeInFrames);
GameEvent *EventBGMPop_CreateEx(GameSystem *gsys, u32 fadeOutFrames, u32 fadeInFrames);
// Pops every pushed BGM, fading in the last
GameEvent *EventBGMPopAll_Create(GameSystem *gsys, u32 fadeInFrames);
GameEvent *EventBGMPlayPushEx_Create(GameSystem *gsys, u32 bgm, u32 fadeOutFrames, u32 fadeInFrames);
GameEvent *EventMEPlay_Create(GameSystem *gsys, u32 meId);
GameEvent *EventBGMChange_Create(GameSystem *gsys, u32 bgm, u32 fadeOutFrames, u32 fadeInFrames);
GameEvent *EventBGMPlay_Create(GameSystem *gsys, u32 bgm);
GameEvent *EventBGMPlayEx_Create(GameSystem *gsys, u32 bgm, u32 fadeOutFrames);
// Fades out to the field's silence
GameEvent *CreateBGMFadeOutEvent(GameSystem *gsys, u32 fadeOutFrames);
GameEvent *EventBGMPlayPush_Create(GameSystem *gsys, u32 bgm);
// Fades out, waits, then releases the field's sound
GameEvent *EventBGMFadeStop_Create(GameSystem *gsys, u16 fadeOutFrames);
GameEvent *EventBattleBGMPlay_Create(GameSystem *gsys, u32 bgm);
GameEvent *EventBGMFadePop_Create(GameSystem *gsys);
// Waits until the BGM has stopped changing
GameEvent *EventWaitFieldSound_Create(GameSystem *gsys);
// Waits until no pop is left
GameEvent *EventBGMFadeWait_Create(GameSystem *gsys);

#ifdef PAPERWHITE2
// Paper White 2: main's event_sound.c, for the Following Pokémon
BOOL PaperWhite2_IsFollowingSoundCallback(GameEventCallback callback);
BOOL PaperWhite2_IsBGMRestoreCallback(GameEventCallback callback);
#endif
#endif // POKEBW2_FIELD_EVENT_SOUND_H
