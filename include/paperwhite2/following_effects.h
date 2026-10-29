#ifndef PAPERWHITE2_FOLLOWING_EFFECTS_H
#define PAPERWHITE2_FOLLOWING_EFFECTS_H

#include "types.h"
#include "gfl/g3d.h"
#include "nitro/fx.h"
#include "struct_decls.h"

// Paper White 2: the Following Pokémon's ball effects: the send-out flash, the recall into the ball, the closed ball
// that rests where a recalled follower waits and shakes where a switch is refused, and the reaction bubbles above the
// follower's head (src/paperwhite2/ov036/paperwhite2_following_effects.c), ported from Pokeweb's effects.c

// The files of ARCID_MMODEL_TBL that the effects read: the emotes' BTX0s, two frames a bubble (heart, happy, sad,
// angry, note, poison, ellipsis), the ball's model, the send-out flash's model and its texture animation, and the
// balls' art
#define FOLLOWING_EMOTE_FILE 6
#define FOLLOWING_EMOTE_FILE_COUNT 14
#define FOLLOWING_EFFECTS_FILE_BALL 20
#define FOLLOWING_EFFECTS_FILE_FLASH 21
#define FOLLOWING_EFFECTS_FILE_FLASH_ANIMATION 22
// The balls' art: for each ball ID from 1 its 16 by 16 texture, linear 4bpp rows, then its 16 colors
#define FOLLOWING_EFFECTS_FILE_BALLS 23

// The ball IDs that have their own art, from 1
#define FOLLOWING_BALL_COUNT 25
#define FOLLOWING_BALL_TEXTURE_SIZE 128
#define FOLLOWING_BALL_PALETTE_SIZE 32
#define FOLLOWING_BALL_RECORD_SIZE (FOLLOWING_BALL_TEXTURE_SIZE + FOLLOWING_BALL_PALETTE_SIZE)

// The count of the files of the graphics archive (ARCID_MMODEL_GRA), whose file a follower's white silhouette is read
// from; 0 while the registry isn't read
void FollowingEffects_SetResourceCount(u32 count);
// Loads the effects through system's open model table, unless its field heap is low, and the actor's sheet as the
// recall's silhouette: two colors from its palette's light and dark halves
void FollowingEffects_Prepare(FieldActor *actor);
// Copies the follower's quad as the field drew it, for the silhouette of the recall and the send-out
void FollowingEffects_Snapshot(FieldActor *actor);
// The send-out: the ball for four frames, then the ball's flash while the silhouette grows out of it to the standing
// body, which then shows
void FollowingEffects_Out(FieldActor *actor);
// The recall: the silhouette shrinks from the standing body into the ball, with the ball's sound
void FollowingEffects_Recall(FieldActor *actor);
// The effects' frame, from the field's update
void FollowingEffects_Tick(void);
// The follower's ball ID, 1 to FOLLOWING_BALL_COUNT; any other shows the Poké Ball
void FollowingEffects_SetBall(u32 ball);
void FollowingEffects_Cancel(void);
// Drops the effects with the field: an unload, a battle or a new actor system
void FollowingEffects_Destroy(void);
// Uploads the effects' banks while a door or return fade is up, unless system's field heap is low. Neither a billboard
// of the follower nor an emote is bound here: the talk binds those
void FollowingEffects_Warm(MMSys *system);
// Whether the send-out's first frames hide the follower
BOOL FollowingEffects_HidesActor(void);
// Whether the send-out's silhouette stands in for the follower's body this frame: the actors' pass doesn't submit it
BOOL FollowingEffects_CoversBody(void);
// The closed ball at at, with a shake of a pixel either way and the refusal beep
void FollowingEffects_Cue(const VecFx32 *at);
// The closed ball resting at at while no effect plays; NULL removes it
void FollowingEffects_RestAt(const VecFx32 *at);
BOOL FollowingEffects_IsResting(void);
// The resting ball leaves with the ball's sound
void FollowingEffects_RestRecall(void);
// One bounce of the resting ball once it is up: a switch to it
void FollowingEffects_RestBounce(void);
BOOL FollowingEffects_IsBusy(void);
BOOL FollowingEffects_IsRecalling(void);
// Whether the effects are loaded: L and R switch the follower only then
BOOL FollowingEffects_IsAvailable(void);
// The player, only to keep a bubble behind them when they stand in front of it; NULL for none
void FollowingEffects_SetPlayer(FieldActor *player);
// The effects' draw, in the field's pass of its effect billboards
void FollowingEffects_Draw(G3DCamera *camera, G3DLight *lights);

// The reaction bubbles, whose frames are their own resources and never share a palette with an actor's. A bubble is
// two frames from emote, counted from FOLLOWING_EMOTE_FILE, above actor's head: FALSE when it can't be shown
BOOL FollowingEffects_EmoteBegin(FieldActor *actor, u32 emote);
// Shows frame (0 or 1) of the bubble
void FollowingEffects_EmoteFrame(FieldActor *actor, u32 frame);
void FollowingEffects_EmoteEnd(void);

#endif // PAPERWHITE2_FOLLOWING_EFFECTS_H
