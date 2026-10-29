#include "types.h"
#include "constants/directions.h"
#include "constants/sound.h"
#include "constants/species.h"
#include "field/field.h"
#include "field/field_actor.h"
#include "field/field_actor_internal.h"
#include "field/field_internal.h"
#include "field/field_msgbg.h"
#include "field/field_player.h"
#include "field/talkmsgwin.h"
#include "gfl/arc.h"
#include "gfl/heap.h"
#include "gfl/key.h"
#include "gfl/sound.h"
#include "gfl/str.h"
#include "nitro/fx.h"
#include "nitro/mi.h"
#include "paperwhite2/following.h"
#include "paperwhite2/following_effects.h"
#include "paperwhite2/following_field.h"
#include "paperwhite2/following_gifts.h"
#include "paperwhite2/following_interaction.h"
#include "paperwhite2/following_reactions.h"
#include "paperwhite2/following_render.h"
#include "system/game_event.h"
#include "system/game_system.h"

// Paper White 2: talking to the Following Pokémon, ported from Pokeweb's interaction.c. A in front of the follower
// starts an event of its own that plays, step by step, the follower's motion, its bubble and cry and a message balloon
// over it: an interaction of HeartGold's (file 3 of ARCID_MMODEL_TBL), a contextual dialogue (file 4) or a gift
// (file 5), which the talk reads whole through the field actors' open handle of the archive. The original read them as
// ROM files, and checked the emotes' file's size and CRC-32 against a record in the interactions; the files are now
// members of the model table, which the packer writes together, and that check is gone, so a step's bubble always
// plays. Its FollowingTalkDebug and FollowingGiftDebug, blocks of values for its emulator tests, aren't ported

// The heap that the talk's event is allocated from, and how much of it, and of the field's heap for the balloon, the
// talk leaves
#define EVENT_HEAP_KEPT 0x4000
#define FIELD_HEAP_KEPT 0x8000
// The talk's event has data of this size, which nothing reads
#define EVENT_DATA_SIZE 4

// The balloon opens at the bottom of the screen, framed as an NPC's, without a tail
#define TALK_WIN_TYPE ACTOR_MSG_WIN_BOTTOM

// A and B: either closes the balloon, and both must be let go before the next talk
#define TALK_KEYS (PAD_BUTTON_A | PAD_BUTTON_B)

// The frames that the closing balloon may take, after which the talk ends anyway
#define CLOSE_FRAMES 120
// The frames that the last bubble step stays after it ends
#define BUBBLE_END_FRAMES 2

// The cry's pan, the center, and a cry of 2's speed: HeartGold's distressed cry is 96/768 of an octave lower, and
// round(25825 * (2^(-96/768) - 1)) of the DS waveform's speed of 25825 is -2143
#define CRY_PAN 64
#define CRY_DISTRESSED 2
#define CRY_DISTRESSED_SPEED (-2143)
// The cry's handle is valid below this
#define CRY_HANDLES 16

// The reach is measured in world units over REACH_SCALE: a tile is REACH_TILE of them and a world unit REACH_ONE
#define REACH_SCALE 256
#define REACH_TILE (FOLLOWING_TILE / REACH_SCALE)
#define REACH_ONE (FX32_ONE / REACH_SCALE)
// Half a tile, the most that the follower's height may differ from the player's and its draw offset be
#define REACH_HEIGHT (8 * FX32_ONE)

// The talk's stages: the next step, its motion, its bubble's start and its frames, its message, the balloon printing,
// waiting for A or B, closing, and the step's wait
enum {
    STAGE_STEP,
    STAGE_MOTION,
    STAGE_BUBBLE,
    STAGE_BUBBLE_FRAMES,
    STAGE_MESSAGE,
    STAGE_PRINT,
    STAGE_INPUT,
    STAGE_CLOSE,
    STAGE_WAIT,
};

// The running talk. follower, generation, actor, system and moveCode are what the talk began with, so a follower
// replaced since is never touched
typedef struct {
    Follower *follower;
    const FieldActorMoveCode *moveCode;
    MMSys *system;
    FieldActor *actor;
    Field *field;
    GameSystem *gsys;
    GameEvent *event;
    ActorMsgWin *window;
    StrBuf *string;
    FollowingReactionSnapshot snapshot;
    FollowingReactionMotion motion;
    FollowingReactionStep step;
    FollowingBubble bubble;
    // The follower's draw offset when the talk began, which its motions are relative to, and where the balloon is
    VecFx32 offset;
    VecFx32 position;
    u16 text[FOLLOWING_TEXT_CAPACITY];
    u32 generation;
    u32 rule;
    u32 contextRule;
    u32 giftRule;
    u32 stepIndex;
    u32 stage;
    u32 age;
    u32 bubbleIndex;
    u32 bubbleAge;
    BOOL contextual;
    BOOL gift;
    s32 giftGranted;
    u16 face;
    BOOL active;
    // A and B were let go since the balloon began to wait
    BOOL released;
    u32 cryPending;
    // The event ended this frame, which FollowingTalk_FieldOwns consumes
    BOOL finished;
} FollowingTalk;

// The interactions stay read until the field unloads; the dialogues and the gifts share one buffer, read again at each
// talk, since only one of them is used by a talk
static u32 sInteractionBytes[FOLLOWING_INTERACTIONS_CAPACITY / 4];
static u32 sContextBytes[FOLLOWING_CONTEXT_CAPACITY / 4];
static FollowingInteractions sInteractions;
static FollowingContextRules sDialogues;
static FollowingContextRules sGifts;
// 1 once the interactions are read and valid, -1 once that failed, which stays until the unload
static s32 sLoaded;
static BOOL sNeedRelease;
// The random state of the talk's choices, from the original's seed, "SGSH"
static u32 sRng = 'S' | 'G' << 8 | 'S' << 16 | (u32)'H' << 24;
static FollowingTalk sTalk;

static s32 Abs(s32 x) {
    return x < 0 ? -x : x;
}

// File file of the model table, whole: its size, or 0 when it isn't there or is bigger than capacity
static u32 ReadMember(ArcTool *arc, u32 file, void *out, u32 capacity) {
    u32 size;

    if (arc == NULL || GFL_ArcToolGetDataMax(arc) <= file) {
        return 0;
    }
    size = GFL_ArcToolGetDataLength(arc, file);
    if (size == 0 || size > capacity) {
        return 0;
    }
    GFL_ArcToolRead(arc, file, out);
    return size;
}

static BOOL Load(MMSys *system) {
    u32 size;

    if (sLoaded != 0) {
        return sLoaded > 0;
    }
    sLoaded = -1;
    size =
        ReadMember(system->actorConfigArc, FOLLOWING_INTERACTIONS_FILE, sInteractionBytes, sizeof(sInteractionBytes));
    if (size == 0 || !FollowingReactions_ValidateInteractions(&sInteractions, sInteractionBytes, size)) {
        return FALSE;
    }
    sLoaded = 1;
    return TRUE;
}

static BOOL IsValidActor(void) {
    FieldActor *actor = sTalk.actor;

    return sTalk.follower != NULL && sTalk.follower->generation == sTalk.generation && sTalk.follower->actor == actor &&
           actor != NULL && (actor->flags & FOLLOWING_ACTOR_FLAG_USE) && actor->actorSystem == sTalk.system &&
           actor->moveCodeVTable == sTalk.moveCode;
}

void FollowingTalk_PollInput(void) {
    if (sNeedRelease && !(GCTX_HIDGetHeldKeys() & TALK_KEYS)) {
        sNeedRelease = FALSE;
    }
}

BOOL FollowingTalk_IsActive(void) {
    return sTalk.active;
}

BOOL FollowingTalk_Owns(Field *field) {
    return sTalk.active && sTalk.field == field && sTalk.gsys != NULL && GSYS_GetNowEvent(sTalk.gsys) == sTalk.event;
}

// The game system notes an event at the frame's start, before it runs the callbacks, and updates the field after it
// frees an event that ended, so that frame the field still sees one. The ended talk counts once, and never a new
// event or a replaced actor
BOOL FollowingTalk_FieldOwns(Field *field) {
    BOOL finished = sTalk.finished;

    sTalk.finished = FALSE;
    return FollowingTalk_Owns(field) || (finished && sTalk.field == field && IsValidActor() && sTalk.gsys != NULL &&
                                         GSYS_GetNowEvent(sTalk.gsys) == NULL);
}

static void CloseResources(void) {
    FollowingEffects_EmoteEnd();
    if (sTalk.window != NULL) {
        MsgBGPrinter_ClearTalkWin(sTalk.window);
        sTalk.window = NULL;
    }
    if (sTalk.string != NULL) {
        GFL_StrBufFree(sTalk.string);
        sTalk.string = NULL;
    }
    if (IsValidActor()) {
        sTalk.actor->wPosOffset = sTalk.offset;
        SetActorFaceDir(sTalk.actor, sTalk.face);
        FollowingRender_Anchor(sTalk.actor, sTalk.face);
        sTalk.actor->flags |= FOLLOWING_ACTOR_FLAG_PAUSE_ANIMATION;
    }
    if (sTalk.follower != NULL && sTalk.follower->generation == sTalk.generation &&
        sTalk.follower->actor == sTalk.actor) {
        Following_EndInteraction(sTalk.follower);
    }
    sTalk.active = FALSE;
    sNeedRelease = TRUE;
}

static GameEventReturnCode FinishEvent(void) {
    BOOL owned = FollowingTalk_Owns(sTalk.field) && IsValidActor();

    CloseResources();
    sTalk.event = NULL;
    sTalk.finished = owned;
    return GAMEEVENT_DONE;
}

// Only a live event of the talk's own is taken off the chain: a saved event that the game has since replaced or freed
// is never read, and another event's place is never given up
void FollowingTalk_Cancel(void) {
    GameEvent *event;
    GameEvent **link;
    u32 i;

    sTalk.finished = FALSE;
    if (!sTalk.active) {
        return;
    }
    event = sTalk.event;
    link = sTalk.gsys != NULL ? &sTalk.gsys->event : NULL;
    CloseResources();
    for (i = 0; link != NULL && *link != NULL && i < 16; i++) {
        GameEvent *node = *link;

        if (node == event) {
            *link = node->parent;
            PaperWhite2_GameEventFree(node);
            break;
        }
        link = &node->parent;
    }
    sTalk.event = NULL;
}

void FollowingTalk_Unload(void) {
    FollowingTalk_Cancel();
    sLoaded = 0;
    MI_CpuFill8(&sInteractions, 0, sizeof(sInteractions));
    MI_CpuFill8(&sDialogues, 0, sizeof(sDialogues));
    MI_CpuFill8(&sGifts, 0, sizeof(sGifts));
}

// Whether the follower stands where A talks to it: in front of the player within its gap, on the trail between them.
// A follower that passes but whose draw anchor sticks past the talk's limit is pulled back onto it; one that fails is
// left as it was
static BOOL CanReach(Follower *follower, FieldActor *player, FieldActor *actor, Field *field) {
    s32 gap;
    s32 x;
    s32 y;
    s32 z;
    s32 vx;
    s32 vz;
    s32 axis;
    s32 length;
    BOOL box;
    BOOL rail = FALSE;
    u32 controller;
    u32 face;
    u32 i;
    s64 ox;
    s64 oy;
    s64 oz;

    if (follower == NULL || follower->state != FOLLOWING_STATE_FOLLOWING || player == NULL || actor == NULL ||
        (actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN) || FollowingEffects_IsBusy() || player->faceDir > DIR_RIGHT ||
        follower->trail.count < 2) {
        return FALSE;
    }
    face = player->faceDir;
    // The same bonus that a 64-pixel body's walk adds
    gap = follower->directionalGap[face] +
          (actor->config.billboardSize == ACTOR_BILLBOARD_SIZE_64 ? (s32)FOLLOWING_LARGE_GAP_BONUS : 0);
    if (gap > (s32)FOLLOWING_MAX_DIRECTIONAL_GAP) {
        return FALSE;
    }
    x = actor->wPos.x - player->wPos.x;
    z = actor->wPos.z - player->wPos.z;
    y = actor->wPos.y - (player->wPos.y + player->wPosOffset.y + player->outerDrawOffset.y);
    if (Abs(y) > REACH_HEIGHT) {
        return FALSE;
    }
    box = Abs(x) > (s32)(face >= DIR_LEFT ? FOLLOWING_DIALOGUE_REACH(gap) : FOLLOWING_DIALOGUE_REACH(0)) ||
          Abs(z) > (s32)(face < DIR_LEFT ? FOLLOWING_DIALOGUE_REACH(gap) : FOLLOWING_DIALOGUE_REACH(0));
    controller = Field_GetResolvedControllerTypeID(field);
    vx = face == DIR_LEFT ? -REACH_TILE : face == DIR_RIGHT ? REACH_TILE : 0;
    vz = face == DIR_UP ? -REACH_TILE : face == DIR_DOWN ? REACH_TILE : 0;
    axis = 2 * REACH_TILE + (s32)FOLLOWING_GAP_BEYOND((u32)gap) * REACH_ONE;
    if (controller != 0) {
        VecFx32 front;
        VecFx32 playerAt;

        // A rail's facings are along its curve, not the compass. Only the player's own rail work is asked, never the
        // follower's. Rail knots can be farther apart than a tile: a follower on the knot the player faces is in reach,
        // past the compass box and the two-tile limit; anywhere else both still apply
        if (!(player->flags & ACTOR_FLAG_RAIL) || FldAct_GetRailUnit(player) == NULL) {
            return FALSE;
        }
        if (RailActor_GetHitBitsDirNoAttr(player, face) & 3) {
            return FALSE;
        }
        FieldPlayer_GetWPosInDir(field->player, face, &front);
        playerAt.x = player->wPos.x;
        playerAt.y = player->wPos.y + player->wPosOffset.y + player->outerDrawOffset.y;
        playerAt.z = player->wPos.z;
        rail = Following_RailSegmentReach(&playerAt, &actor->wPos, &front, (u32)gap);
        vx = (front.x - player->wPos.x) / REACH_SCALE;
        vz = (front.z - player->wPos.z) / REACH_SCALE;
        if (!rail) {
            if (box || Abs(vx) > 2 * REACH_TILE || Abs(vz) > 2 * REACH_TILE) {
                return FALSE;
            }
        } else {
            s32 reach = Abs(vx) > Abs(vz) ? Abs(vx) : Abs(vz);

            axis = reach + REACH_TILE / 4;
            if (axis < 2 * REACH_TILE + (s32)FOLLOWING_GAP_BEYOND((u32)gap) * REACH_ONE) {
                axis = 2 * REACH_TILE + (s32)FOLLOWING_GAP_BEYOND((u32)gap) * REACH_ONE;
            }
        }
    } else if (box) {
        return FALSE;
    }
    // A turn leaves the follower partway across its tile, facing its own way: half a tile sideways is let in, whatever
    // its width or facing, on a rail's turned line too. The tiles, what is in the way and the trail still limit it
    length = vx * vx + vz * vz;
    if (!rail) {
        s32 px = x / REACH_SCALE;
        s32 pz = z / REACH_SCALE;
        s32 along = px * vx + pz * vz;
        s32 lateral = px * vz - pz * vx;

        if (length == 0 || along < length / 2 || along > length + length / 8 + gap * length / 16 ||
            Abs(lateral) > (s32)((u32)length / 2)) {
            return FALSE;
        }
    } else if (length == 0) {
        return FALSE;
    }
    // The trail from the player back to the follower shows they are in one corridor, along the rail's line too, as long
    // as the segment on a wide knot. A follower on a recorded sample, as the side-by-side stand leaves it on its
    // corner, ends the corridor there: the older leg behind it turns away and isn't between them. One between samples
    // checks the whole trail
    i = follower->trail.count;
    while (i > 0) {
        const FollowingSample *s;
        s32 dx;
        s32 dz;

        i--;
        s = &follower->trail.samples[(follower->trail.head + i) % FOLLOWING_TRAIL_CAPACITY];
        if (s->generation != follower->generation || Abs(s->y - actor->wPos.y) > REACH_HEIGHT) {
            return FALSE;
        }
        dx = (s->x - player->wPos.x) / REACH_SCALE;
        dz = (s->z - player->wPos.z) / REACH_SCALE;
        if (Abs(dx) > axis || Abs(dz) > axis || Abs(dx * vz - dz * vx) > (s32)((u32)length / 2)) {
            return FALSE;
        }
        if (i + 1 < follower->trail.count && s->x == actor->wPos.x && s->z == actor->wPos.z) {
            break;
        }
    }
    if (controller == 0) {
        s16 gx;
        s16 gy;
        s16 gz;
        s32 dx;
        s32 dz;
        BOOL next;

        // A step partway done, or the draw anchor's clamp, can put even a small follower a tile past the one in front.
        // The distance and the straight trail above still bound it
        FieldPlayer_GetGPosInFront(field->player, &gx, &gy, &gz);
        dx = actor->gPos.x - gx;
        dz = actor->gPos.z - gz;
        next = (face == DIR_UP && dx == 0 && dz == -1) || (face == DIR_DOWN && dx == 0 && dz == 1) ||
               (face == DIR_LEFT && dx == -1 && dz == 0) || (face == DIR_RIGHT && dx == 1 && dz == 0);
        if ((dx != 0 || dz != 0) && !next) {
            return FALSE;
        }
        if (ActorRouteCollCheckOneTileInDir(player, face)) {
            return FALSE;
        }
    }
    ox = (s64)actor->wPosOffset.x + actor->outerDrawOffset.x;
    oy = (s64)actor->wPosOffset.y + actor->outerDrawOffset.y;
    oz = (s64)actor->wPosOffset.z + actor->outerDrawOffset.z;
    if (ox >= -REACH_HEIGHT && ox <= REACH_HEIGHT && oy >= -REACH_HEIGHT && oy <= REACH_HEIGHT && oz >= -REACH_HEIGHT &&
        oz <= REACH_HEIGHT) {
        VecFx32 pose = actor->wPos;
        VecFx32 playerPose;
        VecFx32 art;

        playerPose.x = player->wPos.x;
        playerPose.y = player->wPos.y + player->wPosOffset.y + player->outerDrawOffset.y;
        playerPose.z = player->wPos.z;
        art.x = (fx32)ox;
        art.y = (fx32)oy;
        art.z = (fx32)oz;
        if (Following_ClampDialoguePose(&pose, &playerPose, &art, face, (u32)gap)) {
            actor->wPos.x = pose.x;
            actor->wPos.z = pose.z;
            actor->gPos.x = (s16)(pose.x / FOLLOWING_TILE);
            actor->gPos.z = (s16)(pose.z / FOLLOWING_TILE);
        }
    }
    return TRUE;
}

// The cry waits while the sound system loads, which PokeVoice_Play would spin on, so the field never blocks
static void Cry(void) {
    u32 handle;

    if (sTalk.cryPending == 0 || GFL_SndIsLoadThreadRunning()) {
        return;
    }
    handle = PokeVoice_Play(sTalk.snapshot.pokemon.species, sTalk.snapshot.pokemon.form, CRY_PAN, 0, 0, 0, 0, NULL);
    if (sTalk.cryPending == CRY_DISTRESSED && handle < CRY_HANDLES) {
        PokeVoice_AdjustSpeed(handle, CRY_DISTRESSED_SPEED);
    }
    sTalk.cryPending = 0;
}

// The message of a gift that the bag had no room for. The base package's own English text; the original's Italian
// build read it from a file of its language instead
static u32 GetFullBagText(u16 *out) {
    static const u16 text[] = {
        'T', 'h', 'e', ' ', 'B', 'a', 'g', ' ', 'i', 's', ' ', 'f', 'u', 'l', 'l', '.', 0xffff
    };
    u32 i;

    for (i = 0; i < NELEMS(text); i++) {
        out[i] = text[i];
    }
    return NELEMS(text) - 1;
}

static u32 GetText(void) {
    if (sTalk.gift) {
        if (sTalk.giftGranted) {
            return FollowingReactions_GetGiftText(&sGifts, sTalk.giftRule, &sTalk.snapshot, sTalk.text,
                                                  FOLLOWING_TEXT_CAPACITY);
        }
        return GetFullBagText(sTalk.text);
    }
    if (sTalk.contextual) {
        return FollowingReactions_GetDialogueText(&sDialogues, sTalk.contextRule, &sTalk.snapshot, sTalk.text,
                                                  FOLLOWING_TEXT_CAPACITY);
    }
    return FollowingReactions_GetText(&sInteractions, sTalk.step.message, &sTalk.snapshot, sTalk.text,
                                      FOLLOWING_TEXT_CAPACITY);
}

// Opens the step's message in a balloon over the follower
static BOOL OpenMessage(void) {
    FieldMsgBG *bg;
    HeapID heapId;

    if (GetText() == 0) {
        return FALSE;
    }
    bg = Field_GetMsgBGSys(sTalk.field);
    if (bg == NULL || !PaperWhite2_CanOpenActorMsgWin(bg, TALK_WIN_TYPE)) {
        return FALSE;
    }
    heapId = Field_GetHeapID(sTalk.field);
    if (GFL_HeapGetFreeSize(heapId) < FIELD_HEAP_KEPT) {
        return FALSE;
    }
    sTalk.string = GFL_StrBufCreate(FOLLOWING_TEXT_CAPACITY, heapId);
    if (sTalk.string == NULL) {
        return FALSE;
    }
    GFL_StrBufLoadString(sTalk.string, sTalk.text);
    sTalk.position = sTalk.actor->wPos;
    sTalk.window = ActorMsgWin_CheckAndCreate(bg, TALK_WIN_TYPE, &sTalk.position, sTalk.string,
                                              TALKMSG_WIN_FRAME_NORMAL, TALKMSG_WIN_TAIL_NONE);
    return sTalk.window != NULL;
}

static void Pose(const VecFx32 *offset, u32 face) {
    sTalk.actor->wPosOffset = *offset;
    SetActorFaceDir(sTalk.actor, face);
    FollowingRender_Anchor(sTalk.actor, face);
}

static GameEventReturnCode TalkEvent(GameEvent *event, u32 *state, void *data) {
    u32 held;
    u32 pressed;

    if (!sTalk.active || event != sTalk.event) {
        return GAMEEVENT_DONE;
    }
    if (!IsValidActor() || !FollowingTalk_Owns(sTalk.field) || sTalk.field->fadeFlag) {
        return FinishEvent();
    }
    held = GCTX_HIDGetHeldKeys();
    pressed = GCTX_HIDGetPressedKeys();
    if (!(held & TALK_KEYS)) {
        sTalk.released = TRUE;
    }
    Cry();
    switch (sTalk.stage) {
    case STAGE_STEP:
        // A gift is one step: its message, with the cry and the first bubble when the item was given
        if (sTalk.gift) {
            sTalk.step.motion = 0;
            sTalk.step.message = 1;
            sTalk.step.wait = 1;
            sTalk.step.cry = sTalk.giftGranted ? 1 : 0;
            sTalk.step.bubble = sTalk.giftGranted ? 1 : 0;
            sTalk.stage = sTalk.giftGranted ? STAGE_BUBBLE : STAGE_MESSAGE;
            break;
        }
        if (!(sTalk.contextual
                  ? FollowingReactions_GetDialogueStep(&sDialogues, sTalk.contextRule, sTalk.stepIndex, &sTalk.step)
                  : FollowingReactions_GetStep(&sInteractions, sTalk.rule, sTalk.stepIndex, &sTalk.step))) {
            return FinishEvent();
        }
        MI_CpuFill8(&sTalk.motion, 0, sizeof(sTalk.motion));
        sTalk.motion.face = (u8)sTalk.face;
        sTalk.stage = STAGE_MOTION;
        break;
    case STAGE_MOTION: {
        BOOL cry = FALSE;

        // Diglett and Dugtrio stay in the ground
        if (FollowingReactions_TickMotion(&sInteractions, sTalk.step.motion, &sTalk.motion,
                                          sTalk.snapshot.pokemon.species == SPECIES_DIGLETT ||
                                              sTalk.snapshot.pokemon.species == SPECIES_DUGTRIO,
                                          &cry)) {
            VecFx32 offset;

            offset.x = sTalk.offset.x + sTalk.motion.x;
            offset.y = sTalk.offset.y + sTalk.motion.y;
            offset.z = sTalk.offset.z + sTalk.motion.z;
            Pose(&offset, sTalk.motion.face);
            if (cry) {
                sTalk.cryPending = sTalk.step.cry;
                Cry();
            }
            break;
        }
        Pose(&sTalk.offset, sTalk.face);
        sTalk.stage = STAGE_BUBBLE;
        break;
    }
    case STAGE_BUBBLE:
        sTalk.bubbleIndex = sTalk.bubbleAge = 0;
        sTalk.age = 0;
        if (sTalk.step.bubble != 0 && FollowingReactions_GetBubble(&sInteractions, sTalk.step.bubble, &sTalk.bubble) &&
            FollowingEffects_EmoteBegin(sTalk.actor, sTalk.bubble.emote)) {
            sTalk.stage = STAGE_BUBBLE_FRAMES;
            break;
        }
        sTalk.stage = STAGE_MESSAGE;
        break;
    case STAGE_BUBBLE_FRAMES:
        if (sTalk.bubbleIndex < FOLLOWING_BUBBLE_STEPS) {
            FollowingEffects_EmoteFrame(sTalk.actor, sTalk.bubble.frames[sTalk.bubbleIndex]);
            if (++sTalk.bubbleAge >= sTalk.bubble.durations[sTalk.bubbleIndex]) {
                sTalk.bubbleAge = 0;
                sTalk.bubbleIndex++;
            }
        } else if (++sTalk.age >= BUBBLE_END_FRAMES) {
            FollowingEffects_EmoteEnd();
            sTalk.stage = STAGE_MESSAGE;
        }
        break;
    case STAGE_MESSAGE:
        if (sTalk.step.message != 0) {
            if (!OpenMessage()) {
                return FinishEvent();
            }
            sTalk.stage = STAGE_PRINT;
        } else {
            sTalk.age = 0;
            sTalk.stage = STAGE_WAIT;
        }
        break;
    case STAGE_PRINT:
        if (MsgBGPrinter_TalkWinMain(sTalk.window)) {
            MsgBGPrinter_TalkWinDrawCursor(sTalk.window);
            sTalk.stage = STAGE_INPUT;
            sTalk.released = FALSE;
        }
        break;
    case STAGE_INPUT:
        MsgBGPrinter_TalkWinDrawCursor(sTalk.window);
        if (sTalk.released && (pressed & TALK_KEYS)) {
            MsgBGPrinter_DeleteTalkWin(sTalk.window);
            sTalk.age = 0;
            sTalk.stage = STAGE_CLOSE;
            sTalk.released = FALSE;
        }
        break;
    case STAGE_CLOSE:
        if (MsgBGPrinter_WaitTalkWinClose(sTalk.window)) {
            sTalk.window = NULL;
            GFL_StrBufFree(sTalk.string);
            sTalk.string = NULL;
            sTalk.age = 0;
            sTalk.stage = STAGE_WAIT;
        } else if (++sTalk.age > CLOSE_FRAMES) {
            return FinishEvent();
        }
        break;
    case STAGE_WAIT:
        if (sTalk.gift) {
            return FinishEvent();
        }
        if (++sTalk.age >= sTalk.step.wait) {
            sTalk.stepIndex++;
            sTalk.stage = STAGE_STEP;
        }
        break;
    default:
        return FinishEvent();
    }
    return GAMEEVENT_CONTINUE;
}

GameEvent *FollowingTalk_Begin(Follower *follower, FieldActor *player, FieldActor *actor, Field *field,
                               GameSystem *gsys, const FollowingReactionSnapshot *snapshot) {
    FollowingReactionSnapshot current;
    GameData *gameData;
    ArcTool *arc;
    s32 dx;
    s32 dz;
    u32 face;
    s32 giftRule = -1;
    s32 contextRule = -1;
    s32 rule = -1;
    u16 claims = 0;
    FollowingGiftChoice choice;
    u32 size;
    BOOL giftChosen;

    if (sTalk.active || sNeedRelease || actor == NULL || !Load(actor->actorSystem) ||
        !CanReach(follower, player, actor, field) || GSYS_GetNowEvent(gsys) != NULL) {
        return NULL;
    }
    if (GFL_HeapGetFreeSize(HEAPID_GAMEEVENT) < EVENT_HEAP_KEPT) {
        return NULL;
    }
    current = *snapshot;
    // The actor's gPos is the matrix's tile; its y is the height, and z the map's tile row
    current.tileX = player->gPos.x;
    current.tileY = player->gPos.z;
    dx = player->wPos.x - actor->wPos.x;
    dz = player->wPos.z - actor->wPos.z;
    face = Abs(dx) > Abs(dz) ? (dx < 0 ? DIR_LEFT : DIR_RIGHT) : (dz < 0 ? DIR_UP : DIR_DOWN);
    // On a grid the facing is the compass. On a rail the same numbers are the line's: 0 +side, 1 -side, 2 +front and 3
    // -front, which are the compass only while the line is straight on an axis, so a follower on a curved ring faced
    // away or down. The follower keeps the rail's facing in the face that the game converts for a rail NPC
    if (field->player != NULL && (player->flags & ACTOR_FLAG_RAIL) && FldAct_GetRailUnit(player) != NULL &&
        player->faceDir <= DIR_RIGHT) {
        VecFx32 side;
        VecFx32 ahead;
        u32 railFace;

        FieldPlayer_GetWPosInDir(field->player, 0, &side);
        FieldPlayer_GetWPosInDir(field->player, 2, &ahead);
        railFace = Following_RailFaceAt(dx, dz, ahead.x - player->wPos.x, ahead.z - player->wPos.z,
                                        side.x - player->wPos.x, side.z - player->wPos.z);
        face = railFace <= 3 ? railFace : player->faceDir ^ 1;
    }
    current.direction = (u8)face;
    gameData = field->gameData;
    arc = actor->actorSystem->actorConfigArc;
    MI_CpuFill8(&choice, 0, sizeof(choice));
    // A gift that the follower hasn't given yet comes first, then a dialogue of the place, then an interaction
    size = ReadMember(arc, FOLLOWING_GIFTS_FILE, sContextBytes, sizeof(sContextBytes));
    giftChosen = size != 0 && FollowingReactions_ValidateGifts(&sGifts, sContextBytes, size) && gameData != NULL &&
                 FollowingGifts_ReadClaims(gameData, &current, &claims) &&
                 FollowingReactions_ChooseGift(&sGifts, &current, claims, &choice);
    if (giftChosen) {
        giftRule = (s32)choice.rule;
    }
    if (giftRule < 0) {
        size = ReadMember(arc, FOLLOWING_DIALOGUES_FILE, sContextBytes, sizeof(sContextBytes));
        MI_CpuFill8(&sDialogues, 0, sizeof(sDialogues));
        if (size != 0) {
            FollowingReactions_ValidateDialogues(&sDialogues, sContextBytes, size);
        }
        contextRule = FollowingReactions_ChooseDialogue(&sDialogues, &current, &sRng);
        rule = contextRule < 0 ? FollowingReactions_Choose(&sInteractions, &current, &sRng) : 0;
        if (contextRule < 0 && rule < 0) {
            return NULL;
        }
    }
    if (!Following_StartInteraction(follower)) {
        return NULL;
    }
    sTalk.follower = follower;
    sTalk.moveCode = actor->moveCodeVTable;
    sTalk.system = actor->actorSystem;
    sTalk.actor = actor;
    sTalk.field = field;
    sTalk.gsys = gsys;
    sTalk.snapshot = current;
    sTalk.generation = follower->generation;
    sTalk.offset = actor->wPosOffset;
    sTalk.face = (u16)face;
    sTalk.rule = (u32)(rule < 0 ? 0 : rule);
    sTalk.contextRule = (u32)(contextRule < 0 ? 0 : contextRule);
    sTalk.giftRule = (u32)(giftRule < 0 ? 0 : giftRule);
    sTalk.contextual = contextRule >= 0;
    sTalk.gift = giftRule >= 0;
    // The item goes into the bag now; the talk only says so. A party member that changed since is no gift
    sTalk.giftGranted = sTalk.gift ? FollowingGifts_Grant(gameData, &current, &choice) : FOLLOWING_GIFT_NOT_GIVEN;
    if (sTalk.gift && sTalk.giftGranted < 0) {
        Following_EndInteraction(follower);
        return NULL;
    }
    sTalk.stage = STAGE_STEP;
    sTalk.stepIndex = sTalk.age = 0;
    sTalk.window = NULL;
    sTalk.string = NULL;
    sTalk.released = FALSE;
    sTalk.cryPending = 0;
    sTalk.finished = FALSE;
    sTalk.event = GameEvent_Create(gsys, NULL, TalkEvent, EVENT_DATA_SIZE);
    if (sTalk.event == NULL) {
        Following_EndInteraction(follower);
        return NULL;
    }
    sTalk.active = TRUE;
    actor->flags |= FOLLOWING_ACTOR_FLAG_PAUSE_ANIMATION;
    SetActorFaceDir(actor, sTalk.face);
    FollowingRender_Anchor(actor, sTalk.face);
    FieldPlayer_ForceBrake(field->player);
    // An NPC's talk script opens with the message sound: it plays once the event is the talk's
    GFL_SndSEPlay(SEQ_SE_MESSAGE);
    return sTalk.event;
}
