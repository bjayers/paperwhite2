#include "types.h"
#include "constants/directions.h"
#include "constants/items.h"
#include "constants/sound.h"
#include "constants/species.h"
#include "field/field.h"
#include "field/field_actor.h"
#include "field/field_actor_internal.h"
#include "field/field_camera.h"
#include "field/field_internal.h"
#include "field/field_msgbg.h"
#include "field/field_player.h"
#include "field/field_script_event.h"
#include "field/scrcmd_msg.h"
#include "field/talkmsgwin.h"
#include "gfl/arc.h"
#include "gfl/heap.h"
#include "gfl/key.h"
#include "gfl/sound.h"
#include "gfl/str.h"
#include "nitro/fx.h"
#include "nitro/mi.h"
#include "paperwhite2/conditions.h"
#include "paperwhite2/following.h"
#include "paperwhite2/following_data.h"
#include "paperwhite2/following_dialogue.h"
#include "paperwhite2/following_effects.h"
#include "paperwhite2/following_field.h"
#include "paperwhite2/following_interaction.h"
#include "paperwhite2/following_reactions.h"
#include "paperwhite2/following_render.h"
#include "system/game_data.h"
#include "system/game_event.h"
#include "system/game_system.h"
#include "system/wordset.h"

// Paper White 2: talking to the Following Pokémon, ported from Pokeweb's interaction.c. A in front of the follower
// starts an event of its own that plays, step by step, the follower's motion, its bubble and cry, a message and an
// action: a rule of the dialogue library (paperwhite2/following_dialogue.h, file 4 of ARCID_MMODEL_TBL), or when none
// matches an interaction of HeartGold's (file 3), which the talk reads whole through the field actors' open handle of
// the archive. The original read them as ROM files, and checked the emotes' file's size and CRC-32 against a record in
// the interactions; the files are now members of the model table, which the packer writes together, and that check is
// gone, so a step's bubble always plays. The original's contextual dialogues and one-time gifts are the library's
// rules now, whose gifts are steps (docs/paperwhite2/following-pokemon.md, "Dialogue rules, gifts and steps"). Its
// FollowingTalkDebug and FollowingGiftDebug, blocks of values for its emulator tests, aren't ported

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

// The plain window of FOLLOWING_BOX_EVENT, as InfoMsg opens it: across the bottom rows, its text 8 pixels in
#define PLAIN_WIN_X 1
#define PLAIN_WIN_Y 0x13
#define PLAIN_WIN_WIDTH 0x1e
#define PLAIN_WIN_HEIGHT 4
#define PLAIN_WIN_TEXT_X 8

// The talk's stages: the next step, its motion, its bubble's start and its frames, its message, the window printing,
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

// A step as it plays, of either kind: the motion, the bubble and the cry of HeartGold's steps; the window, the action
// and the wait of the library's; and its message, HeartGold's (message, from 1) or a text of the library (textWords
// with its end at text), 0 for none
typedef struct {
    u16 motion;
    u16 cry;
    u16 message;
    u16 textWords;
    u32 text;
    u16 wait;
    u16 arg;
    u8 bubble;
    u8 box;
    u8 action;
    s8 amount;
} FollowingTalkStep;

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
    InfoMsgWin *plain;
    StrBuf *string;
    FollowingReactionSnapshot snapshot;
    FollowingReactionMotion motion;
    FollowingTalkStep step;
    FollowingBubble bubble;
    // The follower's draw offset when the talk began, which its motions are relative to, and where the balloon is
    VecFx32 offset;
    VecFx32 position;
    u16 text[FOLLOWING_TEXT_CAPACITY];
    u32 generation;
    u32 rule;
    // The library's rule, or -1 for HeartGold's interaction rule
    s32 dialogueRule;
    u32 stepIndex;
    u32 stage;
    u32 age;
    u32 bubbleIndex;
    u32 bubbleAge;
    // The item that the step's text names, and a script that the step hands the talk over to after it
    u16 item;
    u16 script;
    u16 face;
    BOOL active;
    // A and B were let go since the balloon began to wait
    BOOL released;
    u32 cryPending;
    // The event ended this frame, which FollowingTalk_FieldOwns consumes
    BOOL finished;
} FollowingTalk;

// The interactions stay read until the field unloads; the library keeps the follower's species' block
static u32 sInteractionBytes[FOLLOWING_INTERACTIONS_CAPACITY / 4];
static FollowingInteractions sInteractions;
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

BOOL FollowingTalk_GetBubble(MMSys *system, u32 bubble, FollowingBubble *out) {
    return Load(system) && FollowingReactions_GetBubble(&sInteractions, bubble, out);
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
    if (sTalk.plain != NULL) {
        MsgBGPrinter_DeletePlainWin(sTalk.plain);
        sTalk.plain = NULL;
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
    FollowingDialogue_Unload();
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

// The talk's party member, found again each time it is changed: NULL once it has left the party
static PartyPkm *GetPartyPkm(void) {
    return FollowingParty_Find(sTalk.field->gameData, sTalk.snapshot.pokemon.personality,
                               sTalk.snapshot.pokemon.trainer, sTalk.snapshot.pokemon.species,
                               sTalk.snapshot.pokemon.form);
}

// The step to play, of the library's rule or HeartGold's: FALSE past the last
static BOOL GetStep(void) {
    const FollowingTalkRule *rule;
    const FollowingDialogueStep *step;
    FollowingReactionStep interaction;

    MI_CpuFill8(&sTalk.step, 0, sizeof(sTalk.step));
    if (sTalk.dialogueRule < 0) {
        if (!FollowingReactions_GetStep(&sInteractions, sTalk.rule, sTalk.stepIndex, &interaction)) {
            return FALSE;
        }
        sTalk.step.motion = interaction.motion;
        sTalk.step.message = interaction.message;
        sTalk.step.cry = interaction.cry;
        sTalk.step.bubble = interaction.bubble;
        sTalk.step.wait = interaction.wait;
        return TRUE;
    }
    rule = FollowingDialogue_GetRule(FOLLOWING_TABLE_TALK, sTalk.dialogueRule);
    if (rule == NULL || sTalk.stepIndex >= rule->stepCount) {
        return FALSE;
    }
    step = &rule->steps[sTalk.stepIndex];
    sTalk.step.motion = step->motion;
    sTalk.step.cry = step->cry;
    sTalk.step.text = step->text;
    sTalk.step.textWords = step->textWords;
    sTalk.step.wait = step->wait;
    sTalk.step.arg = step->arg;
    sTalk.step.bubble = step->emote;
    sTalk.step.box = step->box;
    sTalk.step.action = step->action;
    sTalk.step.amount = step->amount;
    return TRUE;
}

// A gift's item, which the step's text names, and in place of the text the library's message of a full Bag unless the
// item went into it
static void NoteGift(u32 item, u32 result) {
    u32 text;
    u32 words;

    sTalk.item = item;
    if (result != FOLLOWING_GIFT_GIVEN && FollowingDialogue_GetBagFullText(&text, &words)) {
        sTalk.step.text = text;
        sTalk.step.textWords = words;
    }
}

// The step's action, as it begins: FALSE skips the step, a gift of an item that isn't there
static BOOL RunAction(void) {
    GameData *gameData = sTalk.field->gameData;
    PartyPkm *pkm;
    FollowingRecord record;
    u32 quantity;
    u32 item;
    u16 waiting;

    if (sTalk.step.action == FOLLOWING_ACTION_NONE) {
        return TRUE;
    }
    pkm = GetPartyPkm();
    if (pkm == NULL) {
        return FALSE;
    }
    switch (sTalk.step.action) {
    case FOLLOWING_ACTION_GIVE_ITEM:
        NoteGift(sTalk.step.arg, FollowingGift_Give(gameData, pkm, sTalk.step.arg, (u8)sTalk.step.amount));
        break;
    case FOLLOWING_ACTION_GIVE_POOL:
        item = FollowingDialogue_RollPool(sTalk.system->actorConfigArc, sTalk.step.arg, &sRng, &quantity,
                                          Field_GetHeapID(sTalk.field));
        if (item == ITEM_NONE) {
            return FALSE;
        }
        NoteGift(item, FollowingGift_Give(gameData, pkm, item, quantity));
        break;
    case FOLLOWING_ACTION_GIVE_WAITING:
        item = FollowingGift_GiveWaiting(gameData, pkm, &waiting);
        if (item == FOLLOWING_GIFT_NOT_GIVEN) {
            return FALSE;
        }
        NoteGift(waiting, item);
        break;
    case FOLLOWING_ACTION_FRIENDSHIP:
        FollowingFriendship_Add(pkm, sTalk.step.amount);
        break;
    case FOLLOWING_ACTION_SCRIPT:
        sTalk.script = sTalk.step.arg;
        break;
    case FOLLOWING_ACTION_RESET_STEPS:
        FollowingRecord_Read(pkm, &record);
        record.steps = 0;
        FollowingRecord_Write(pkm, &record);
        break;
    }
    return TRUE;
}

// The step's message: a text of the library with its words put in, or HeartGold's with the names
static StrBuf *MakeString(HeapID heapId) {
    WordSet *words;
    StrBuf *string;

    if (sTalk.step.textWords != 0) {
        words = FollowingDialogue_CreateWords(sTalk.field->gameData, GetPartyPkm(), sTalk.snapshot.zone, sTalk.item,
                                              heapId);
        string = FollowingDialogue_ReadText(sTalk.system->actorConfigArc, sTalk.step.text, sTalk.step.textWords, words,
                                            heapId);
        GFL_WordSetSystemFree(words);
        return string;
    }
    if (FollowingReactions_GetText(&sInteractions, sTalk.step.message, &sTalk.snapshot, sTalk.text,
                                   FOLLOWING_TEXT_CAPACITY) == 0) {
        return NULL;
    }
    string = GFL_StrBufCreate(FOLLOWING_TEXT_CAPACITY, heapId);
    GFL_StrBufLoadString(string, sTalk.text);
    return string;
}

// Opens the step's message in its window: a balloon over the follower, or the plain window
static BOOL OpenMessage(void) {
    FieldMsgBG *bg = Field_GetMsgBGSys(sTalk.field);
    HeapID heapId = Field_GetHeapID(sTalk.field);
    FieldCamera *camera;
    VecFx32 offset;
    u32 position;
    u32 type = TALK_WIN_TYPE;
    u32 tail = TALKMSG_WIN_TAIL_NONE;
    u32 frame = TALKMSG_WIN_FRAME_NORMAL;

    if (bg == NULL || GFL_HeapGetFreeSize(heapId) < FIELD_HEAP_KEPT) {
        return FALSE;
    }
    sTalk.position = sTalk.actor->wPos;
    // A balloon goes where an NPC's ActorMsg with MSG_WIN_POS_AUTO puts it: above when the follower is farther up the
    // screen than the player, else below, with its tail to it
    if (sTalk.step.box == FOLLOWING_BOX_BUBBLE || sTalk.step.box == FOLLOWING_BOX_YELL) {
        position = ActorMsgWin_CalcWinPosAuto(FieldPlayer_GetActor(sTalk.field->player), &sTalk.position);
        ActorMsgWin_GetBalloonTailParams(position, &type, &tail);
        camera = Field_GetCameraSystem(sTalk.field);
        ActorMsgWin_GetBalloonOffset(&sTalk.position, &offset, FieldCamera_GetG3DCamera(camera), camera, position);
        sTalk.position.x += offset.x;
        sTalk.position.y += offset.y;
        sTalk.position.z += offset.z;
        if (sTalk.step.box == FOLLOWING_BOX_YELL) {
            frame = TALKMSG_WIN_FRAME_SPIKY;
        }
    }
    if (sTalk.step.box != FOLLOWING_BOX_EVENT && !PaperWhite2_CanOpenActorMsgWin(bg, type)) {
        return FALSE;
    }
    sTalk.string = MakeString(heapId);
    if (sTalk.string == NULL) {
        return FALSE;
    }
    if (sTalk.step.box == FOLLOWING_BOX_EVENT) {
        sTalk.plain = MsgBGPrinter_CreatePlainWin(bg, NULL, TALKMSG_WIN_FRAME_NORMAL, PLAIN_WIN_X, PLAIN_WIN_Y,
                                                  PLAIN_WIN_WIDTH, PLAIN_WIN_HEIGHT);
        MsgBGPrinter_PlainWinPrintStream(sTalk.plain, PLAIN_WIN_TEXT_X, 0, sTalk.string);
        return TRUE;
    }
    sTalk.window = ActorMsgWin_CheckAndCreate(bg, type, &sTalk.position, sTalk.string, frame, tail);
    return sTalk.window != NULL;
}

// Hands the field over to the step's script once the talk's own windows and pose are put away, so the scene sees the
// follower back on its trail, as after an NPC's talk, when the script's event begins
static GameEventReturnCode HandOff(GameEvent *event) {
    GameSystem *gsys = sTalk.gsys;
    FieldActor *actor = sTalk.actor;
    u16 script = sTalk.script;

    CloseResources();
    sTalk.event = NULL;
    GameEvent_Replace(event, EventScriptCall_Create(gsys, script, actor, HEAPID_FIELDMAP));
    return GAMEEVENT_CONTINUE;
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
        if (!GetStep()) {
            return FinishEvent();
        }
        if (!RunAction()) {
            sTalk.stepIndex++;
            break;
        }
        MI_CpuFill8(&sTalk.motion, 0, sizeof(sTalk.motion));
        sTalk.motion.face = (u8)sTalk.face;
        // A library's step without a motion cries as it begins; HeartGold's cry only with a motion's frame
        if (sTalk.dialogueRule >= 0 && sTalk.step.motion == 0 && sTalk.step.cry != 0) {
            sTalk.cryPending = sTalk.step.cry;
            Cry();
        }
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
        if (sTalk.step.message != 0 || sTalk.step.textWords != 0) {
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
        // The windows' streams wait for A or B at each page and scrolled line of the text themselves
        if (sTalk.plain != NULL ? MsgBGPrinter_PlainWinMain(sTalk.plain) : MsgBGPrinter_TalkWinMain(sTalk.window)) {
            sTalk.stage = STAGE_INPUT;
            sTalk.released = FALSE;
        }
        break;
    case STAGE_INPUT:
        if (sTalk.plain != NULL) {
            MsgBGPrinter_PlainWinDrawCursor(sTalk.plain);
        } else {
            MsgBGPrinter_TalkWinDrawCursor(sTalk.window);
        }
        if (sTalk.released && (pressed & TALK_KEYS)) {
            sTalk.age = 0;
            sTalk.released = FALSE;
            // The plain window closes at once, as InfoMsgClose closes it
            if (sTalk.plain != NULL) {
                MsgBGPrinter_DeletePlainWin(sTalk.plain);
                sTalk.plain = NULL;
                GFL_StrBufFree(sTalk.string);
                sTalk.string = NULL;
                sTalk.stage = STAGE_WAIT;
                break;
            }
            MsgBGPrinter_DeleteTalkWin(sTalk.window);
            sTalk.stage = STAGE_CLOSE;
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
        if (++sTalk.age >= sTalk.step.wait) {
            if (sTalk.script != 0) {
                return HandOff(event);
            }
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
    PartyPkm *pkm;
    ConditionContext ctx;
    BOOL library = FALSE;
    s32 dx;
    s32 dz;
    u32 face;
    u32 rng;
    s32 dialogueRule = -1;
    s32 rule = -1;

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
    pkm = FollowingParty_Find(gameData, current.pokemon.personality, current.pokemon.trainer, current.pokemon.species,
                              current.pokemon.form);
    // A rule of the library comes first, chosen by the conditions' selection, then an interaction of HeartGold's
    if (pkm != NULL && FollowingDialogue_Load(actor->actorSystem->actorConfigArc, current.pokemon.species) &&
        FollowingDialogue_FillContext(&ctx, field, pkm, face, (u16)current.tileX, (u16)current.tileY)) {
        library = TRUE;
        rng = Conditions_Seed(&ctx, CONDITION_SEED_CHECK, 0);
        dialogueRule = FollowingDialogue_Select(FOLLOWING_TABLE_TALK, &ctx, &rng);
    }
    if (dialogueRule < 0) {
        rule = FollowingReactions_Choose(&sInteractions, &current, &sRng);
        if (rule < 0) {
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
    sTalk.dialogueRule = dialogueRule;
    sTalk.item = ITEM_NONE;
    sTalk.script = 0;
    sTalk.stage = STAGE_STEP;
    sTalk.stepIndex = sTalk.age = 0;
    sTalk.window = NULL;
    sTalk.plain = NULL;
    sTalk.string = NULL;
    sTalk.released = FALSE;
    sTalk.cryPending = 0;
    sTalk.finished = FALSE;
    sTalk.event = GameEvent_Create(gsys, NULL, TalkEvent, EVENT_DATA_SIZE);
    if (sTalk.event == NULL) {
        Following_EndInteraction(follower);
        return NULL;
    }
    // A talk's friendship, once a day for each Pokémon
    if (library) {
        FollowingFriendship_GiveDaily(GameData_GetEventWork(gameData), pkm, ctx.dayNumber,
                                      FollowingDialogue_GetTalkFriendship());
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
