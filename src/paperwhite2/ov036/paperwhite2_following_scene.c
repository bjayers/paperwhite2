#include "types.h"
#include "battle/btl_setup.h"
#include "constants/obj_codes.h"
#include "constants/pokemon.h"
#include "field/app_call.h"
#include "field/event_battle.h"
#include "field/event_sound.h"
#include "field/field_acmd.h"
#include "field/field_actor.h"
#include "field/field_actor_internal.h"
#include "field/field_event.h"
#include "field/field_internal.h"
#include "field/field_menu.h"
#include "field/field_nogrid_mapper.h"
#include "field/field_rail.h"
#include "field/field_script.h"
#include "field/field_script_event.h"
#include "field/pc_sound.h"
#include "field/scrcmd_camera.h"
#include "field/scrcmd_menu.h"
#include "field/scrcmd_sound.h"
#include "field/zone.h"
#include "nitro/mi.h"
#include "paperwhite2/following.h"
#include "paperwhite2/following_battle_entry.h"
#include "paperwhite2/following_effects.h"
#include "paperwhite2/following_events.h"
#include "paperwhite2/following_field.h"
#include "paperwhite2/following_interaction.h"
#include "paperwhite2/following_scene.h"
#include "paperwhite2/following_scene_policy.h"
#include "pml/poke_party.h"
#include "system/game_data.h"
#include "system/game_event.h"
#include "system/game_system.h"
#include "system/vm.h"

// Paper White 2: the Following Pokémon's scene policy, ported from Pokeweb's scene.c. While an event runs, the follower
// waits if each event of the chain and each script command is one the policy knows to leave it alone, and is recalled
// otherwise, or when an actor of the event would walk into it. It never follows a token it has kept: those are only
// identities, of events and scripts the bridge says are still alive

// A FieldActor's flag that no other actor's collision sees it (CheckActorNewPosOtherActorCollision's)
#define ACTOR_FLAG_NO_COLLISION 0x80

// The events and the scripts' machines the scene keeps track of; more recalls the follower
#define EVENT_LIMIT 16
#define VM_LIMIT 48

// The script commands that the policy treats apart (the command table's handlers): a PC's storage opens and idles
// (Scrcmd_Buildmodel_PokecenPCOpen, Scrcmd_Buildmodel_PokecenPCIdle), its quick fades and their wait
// (Scrcmd_Fade_FadeInBlackQ, Scrcmd_Fade_FadeOutBlackQ, Scrcmd_Fade_FadeWait), the storage itself
// (Scrcmd_ProcFld_CallPC), the battles (Scrcmd_Trainer_CallTrainerBattle, Scrcmd_Encount_CallWildBattle,
// Scrcmd_Encount_CallWildBattleEx) and the Repel's spray when the prompt says yes (Scrcmd_Encount_RepelRearm)
#define CMD_PC_OPEN 0x130
#define CMD_PC_IDLE 0x131
#define CMD_FADE_IN_BLACK_QUICK 0x1a3
#define CMD_FADE_OUT_BLACK_QUICK 0x1a4
#define CMD_FADE_WAIT 0x1a7
#define CMD_CALL_PC 0x14f
#define CMD_CALL_TRAINER_BATTLE 0x85
#define CMD_CALL_WILD_BATTLE 0x174
#define CMD_CALL_WILD_BATTLE_EX 0x297
#define CMD_REPEL_REARM 0x2c2

// The script of the Repel's "Use another?" prompt, in res/field/scripts/global_10130.s
#define SCRIPT_REPEL_PROMPT 10144

// The script's end finishes the sub events from the index up to the count, which is the count of finish functions
#define SUB_EVENT_FINISH_COUNT 15

// The highest state of a battle's event while it still starts the battle
#define BATTLE_EVENT_STARTING 3

// The event types of an application's result (EventFieldAppCall_ConvAppResultToEventType) after which the field menu
// goes on to another event once the field is back: a field move (CreateHMEvent: Fly, Dig, Teleport, Cut and the rest),
// an item's common event (the Escape Rope) and a script
#define APP_EVENT_FIELD_MOVE 2
#define APP_EVENT_COMMON 3
#define APP_EVENT_SCRIPT 5

// A rail's step is replayed for at most this many frames, its slowest walk
#define RAIL_STEP_FRAMES 16

// The action commands the policy reads (field_acmd.h names the families it has): facing, the codes of the stay walks
// (and the two families after them) that move no actor, the dashes that the player's own run gives, and the
// sidewalk crowds' wall walks
#define ACMD_STAY_LAST 0x33
#define ACMD_NO_MOVE_FIRST 0x3c
#define ACMD_NO_MOVE_LAST 0x42
#define ACMD_PLAYER_RUN_FIRST 0x54
#define ACMD_PLAYER_RUN_LAST 0x5b
#define ACMD_CROWD_FIRST 0x69
#define ACMD_CROWD_LAST 0x98

typedef struct FollowingSceneEvent {
    GameEvent *event;
    GameEventCallback callback;
} FollowingSceneEvent;

typedef struct FollowingSceneVm {
    VM *vm;
    GameEvent *event;
} FollowingSceneVm;

typedef struct FollowingScene {
    MMSys *system;
    FieldActor *player;
    Follower *follower;
    Field *field;
    GameSystem *gsys;
    u32 generation;
    BOOL active;
    BOOL recalled;
    FollowingState previousState;
    // A PC's storage runs, and it fades the screen
    BOOL pcActive;
    BOOL pcFade;
    // The PC's storage kept a restore token
    BOOL boxPreserve;
    // The player's own run, which a seamless zone change's event can end between the poll and the run
    BOOL naturalRun;
    GameEvent *menuRoot;
    // The follower was out, its body or its resting ball, when the running events began
    BOOL wasOut;
    // The events that were running when the field came back from a menu's application or a battle, which the follower
    // waits through; their fades back in and music restores too
    GameEvent *returnEvents[EVENT_LIMIT];
    VM *pcVm;
    GameEvent *battleRoot;
    BtlSetup *battleSetup;
    void (*recall)(void);
    FollowingSceneEvent events[EVENT_LIMIT];
    FollowingSceneVm vms[VM_LIMIT];
} FollowingScene;

static FollowingScene sScene;

static s32 Min(s32 a, s32 b) {
    return a < b ? a : b;
}

static s32 Max(s32 a, s32 b) {
    return a > b ? a : b;
}

static void Pause(void) {
    if (!sScene.active) {
        sScene.active = TRUE;
        sScene.previousState = sScene.follower->state;
        sScene.wasOut =
            (sScene.follower->actor != NULL && !(sScene.follower->actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN)) ||
            FollowingEffects_IsResting();
    }
    if (!sScene.recalled && sScene.follower->actor != NULL && sScene.follower->state != FOLLOWING_STATE_INTERACTING) {
        sScene.follower->state = FOLLOWING_STATE_EVENT_PAUSED;
        sScene.follower->actor->flags |= FOLLOWING_ACTOR_FLAG_PAUSE_ANIMATION;
    }
}

static void Recall(void) {
    Pause();
    if (sScene.battleSetup != NULL) {
        sScene.battleSetup->flags &= ~FOLLOWING_BATTLE_PRESENT;
        sScene.battleSetup = NULL;
        sScene.battleRoot = NULL;
    }
    if (!sScene.recalled) {
        FollowingEvents_Discard();
        sScene.pcActive = FALSE;
        sScene.pcFade = FALSE;
        sScene.recalled = TRUE;
        sScene.recall();
    }
}

static BOOL IsSafeCommand(u32 cmd) {
    u32 lo = 0;
    u32 hi = NELEMS(FOLLOWING_SAFE_COMMANDS);

    while (lo < hi) {
        u32 mid = (lo + hi) / 2;

        if (FOLLOWING_SAFE_COMMANDS[mid] < cmd) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo < NELEMS(FOLLOWING_SAFE_COMMANDS) && FOLLOWING_SAFE_COMMANDS[lo] == cmd;
}

// The script work of event, a field script's event of the bound game system that the script work names as its own
static ScriptWork *GetScriptEventWork(GameEvent *event) {
    EventScriptCallData *data;
    ScriptWork *work;

    if (event == NULL || event->callback != EventScriptCall_Callback || event->gsys != sScene.gsys) {
        return NULL;
    }
    data = event->data;
    work = data != NULL ? data->work : NULL;
    return work != NULL && work->event == event ? work : NULL;
}

// Whether party's lead is the follower, visible and healthy, the first of the party. The follower's slot is a choice
// (-1 automatic), not the party's place, so the lead's identity is checked in both cases; a script's rental or
// reordered party can't take the follower's place from its slot alone
static BOOL IsBattleLead(PokeParty *party) {
    FieldActor *actor;
    u32 count;
    PartyPkm *pkm;

    if (sScene.follower == NULL || sScene.recalled || !sScene.follower->hasSelection || sScene.follower->slot > 0 ||
        sScene.follower->slot < -1 || sScene.follower->actor == NULL || FollowingEffects_IsBusy() ||
        FollowingTalk_IsActive()) {
        return FALSE;
    }
    actor = sScene.follower->actor;
    if (actor->actorSystem != sScene.system ||
        (actor->flags & (FOLLOWING_ACTOR_FLAG_USE | FOLLOWING_ACTOR_FLAG_HIDDEN)) != FOLLOWING_ACTOR_FLAG_USE ||
        party == NULL) {
        return FALSE;
    }
    count = PokeParty_GetPkmCount(party);
    if (count == 0 || count > FOLLOWING_PARTY_CAPACITY) {
        return FALSE;
    }
    pkm = PokeParty_GetPkm(party, 0);
    if (pkm == NULL) {
        return FALSE;
    }
    return !PokeParty_GetParam(pkm, PKM_PARAM_IS_EGG, NULL) && PokeParty_GetParam(pkm, PKM_PARAM_HP, NULL) &&
           PokeParty_GetParam(pkm, PKM_PARAM_PID, NULL) == sScene.follower->selected.personality &&
           PokeParty_GetParam(pkm, PKM_PARAM_ID, NULL) == sScene.follower->selected.trainer &&
           PokeParty_GetParam(pkm, PKM_PARAM_SPECIES, NULL) == sScene.follower->selected.species &&
           PokeParty_GetParam(pkm, PKM_PARAM_FORM, NULL) == sScene.follower->selected.form;
}

static BOOL IsBattleCandidate(void) {
    return sScene.field != NULL && IsBattleLead(GameData_GetParty(sScene.field->gameData));
}

// Whether event is a local single battle's that the follower in front carries into, which marks its setup
static BOOL IsBattleEvent(GameEvent *event) {
    BtlSetup *setup;

    if (event == NULL || event->gsys != sScene.gsys || event->data == NULL) {
        return FALSE;
    }
    if (PaperWhite2_IsWildBattleCallCallback(event->callback)) {
        EventWildBattleCallWork *work = event->data;

        if (work->gsys != sScene.gsys) {
            return FALSE;
        }
        setup = work->setup;
    } else if (PaperWhite2_IsBattleCallCallback(event->callback)) {
        EventBattleCallWork *work = event->data;

        if (work->gsys != sScene.gsys) {
            return FALSE;
        }
        // The Trial House's battles and those whose setup the caller frees have a facility's or a rental's lifetime
        if (work->unk1C || work->unk20) {
            return FALSE;
        }
        setup = work->setup;
    } else {
        return FALSE;
    }
    if (!FollowingBattle_IsLocalSingle(setup) || event->state > BATTLE_EVENT_STARTING) {
        return FALSE;
    }
    if (sScene.battleSetup == setup && !sScene.recalled) {
        return TRUE;
    }
    if (!IsBattleCandidate() || !IsBattleLead(setup->party[0])) {
        return FALSE;
    }
    setup->flags |= FOLLOWING_BATTLE_PRESENT;
    sScene.battleSetup = setup;
    sScene.battleRoot = event;
    return TRUE;
}

// The battle's event owns its transition's children, the encounter effects too, which no other script or later battle
// can borrow
static BOOL IsBattleChain(GameEvent *event) {
    u32 depth;

    for (depth = 0; event != NULL && depth < EVENT_LIMIT; depth++, event = event->parent) {
        if (event->gsys != sScene.gsys) {
            return FALSE;
        }
        if (IsBattleEvent(event)) {
            return TRUE;
        }
    }
    return FALSE;
}

BOOL FollowingScene_IsBattleEntry(void) {
    return sScene.battleSetup != NULL && !sScene.recalled && IsBattleChain(sScene.gsys->event);
}

static BOOL IsReturnRoot(GameEvent *event) {
    u32 i;

    for (i = 0; i < EVENT_LIMIT; i++) {
        if (sScene.returnEvents[i] != NULL && sScene.returnEvents[i] == event) {
            return TRUE;
        }
    }
    return FALSE;
}

// Whether event is one of the return's: an event that was running when the field came back, or a fade back in or a
// music restore under one. A freed event leaves the list (ForgetEvent), so its address can't be trusted again; a new
// application, field move or script that the menu starts is none of these, and the policy decides on it as ever
static BOOL IsReturnEvent(GameEvent *event) {
    u32 depth;

    for (depth = 0; event != NULL && depth < EVENT_LIMIT; depth++, event = event->parent) {
        if (event->gsys != sScene.gsys) {
            return FALSE;
        }
        if (IsReturnRoot(event)) {
            return TRUE;
        }
        if (!PaperWhite2_IsFieldFadeInCallback(event->callback) && !PaperWhite2_IsFieldOpenCallback(event->callback) &&
            !PaperWhite2_IsBGMRestoreCallback(event->callback)) {
            return FALSE;
        }
    }
    return FALSE;
}

// Whether the policy lets event run with the follower kept. A recycled event's address or another application's
// child is never trusted: each exception checks its event's work against the bound game system and field
static BOOL IsSafeCallback(GameEvent *event, GameEventCallback callback) {
    void *work;

    if (IsBattleChain(event) || IsReturnEvent(event)) {
        return TRUE;
    }
    work = event->data;
    // The sound events of the music and fanfare commands only own a sound work, under a root event or a cleanup's or
    // menu's: their field sound must be the game's. Their parents are inspected as well
    if (PaperWhite2_IsFollowingSoundCallback(callback)) {
        GameData *gameData = sScene.gsys->gameData;
        FieldSound *sound = gameData != NULL ? GameData_GetFieldSoundSystem(gameData) : NULL;

        return work != NULL && sound != NULL && event->gsys == sScene.gsys &&
               ((EventSoundWork *)work)->fieldSound == sound;
    }
    // The menu, and the event that returns from the screen it opened
    if (callback == EventFieldMenu_Callback) {
        FieldMenuWork *menu = work;

        return menu != NULL && menu->gameSystem == sScene.gsys && menu->field == sScene.field;
    }
    if (PaperWhite2_IsFieldMenuReturnCallback(callback)) {
        EventFieldMenuReturn *menuReturn = work;

        return menuReturn != NULL && menuReturn->gsys == sScene.gsys && menuReturn->field == sScene.field;
    }
    if (callback == pcEntrySound || callback == func_ov033_021799e8 || callback == pcLogOffSound) {
        struct PCSoundEventData *pc = work;

        return sScene.pcActive && pc != NULL && pc->gameSystem == sScene.gsys && pc->field == sScene.field;
    }
    // The storage closes the field and opens it again, only in a PC's storage that the scene saw begin
    if (sScene.pcActive && PaperWhite2_IsFieldSubprocessCallback(callback)) {
        return TRUE;
    }
    // The field's opening waits for the field before the Repel's script begins: only that work's shape counts, and the
    // later callbacks and commands are checked as ever
    if (PaperWhite2_IsFieldOpenCallback(callback)) {
        EventFieldOpenWork *open = work;

        return open != NULL && open->gsys == sScene.gsys && open->gameData == sScene.gsys->gameData;
    }
    // The cry's event, under the live script that played it: it can't borrow this once that script or its event is
    // freed
    if (PaperWhite2_IsPokeVoicePlayCallback(callback)) {
        FieldScriptEnv *env = work != NULL ? ((PokeVoiceEvent *)work)->env : NULL;
        GameEvent *parent = event->parent;
        u32 i;

        if (env == NULL || parent == NULL || parent->callback != EventScriptCall_Callback ||
            parent->gsys != sScene.gsys) {
            return FALSE;
        }
        for (i = 0; i < VM_LIMIT; i++) {
            ScriptSubwork *subwork;

            if (sScene.vms[i].event != parent || sScene.vms[i].vm == NULL || sScene.vms[i].vm->env != env) {
                continue;
            }
            subwork = env->subwork;
            return subwork != NULL && subwork->gsys == sScene.gsys && subwork->mmSys != NULL &&
                   subwork->mmSys->field == sScene.field;
        }
        return FALSE;
    }
    // The Yes/No prompt, under the script that the prompt's environment names
    if (PaperWhite2_IsYesNoEventCallback(callback)) {
        ScriptWork *scriptWork = GetScriptEventWork(event->parent);
        FieldScriptEnv *prompt = work != NULL ? ((YesNoEvent *)work)->env : NULL;

        return scriptWork != NULL && prompt != NULL && prompt->args.work == scriptWork;
    }
    // The script's end, which finishes its sub events: any that the policy doesn't know recalls the follower
    if (callback == EventFinishScriptSubEvents_Callback) {
        FinishScriptSubEventsWork *finish = work;
        u32 active = PaperWhite2_GetActiveFieldScriptSubEvents();

        if (finish == NULL || finish->gsys != sScene.gsys || (u32)finish->index >= SUB_EVENT_FINISH_COUNT ||
            finish->count != SUB_EVENT_FINISH_COUNT || (active & ~FOLLOWING_SAFE_FINISHERS)) {
            Recall();
            return FALSE;
        }
        return TRUE;
    }
    // The field script's own event, the list's choices and the camera's waits
    return callback == EventScriptCall_Callback || PaperWhite2_IsListMenuEventCallback(callback) ||
           PaperWhite2_IsCameraWaitCallback(callback);
}

static void TrackEvent(GameEvent *event, GameEventCallback callback) {
    u32 free = EVENT_LIMIT;
    u32 i;

    for (i = 0; i < EVENT_LIMIT; i++) {
        if (sScene.events[i].event == event) {
            sScene.events[i].callback = callback;
            return;
        }
        if (sScene.events[i].event == NULL) {
            free = i;
        }
    }
    if (free == EVENT_LIMIT) {
        Recall();
        return;
    }
    sScene.events[free].event = event;
    sScene.events[free].callback = callback;
}

// Walks the game system's live chain only: the events freed are already off the tokens
static void InspectChain(void) {
    GameEvent *event = sScene.gsys->event;
    u32 depth;

    for (depth = 0; event != NULL && depth < EVENT_LIMIT; depth++) {
        GameEventCallback callback = event->callback;

        if (event->gsys != sScene.gsys || !IsSafeCallback(event, callback)) {
            Recall();
            return;
        }
        Pause();
        TrackEvent(event, callback);
        event = event->parent;
    }
    if (event != NULL) {
        Recall();
    }
}

// The sidewalk crowds' wall walks, whose directions start one past a multiple of four, unlike the compass walks. Their
// jump families cover two or three tiles, the walks one
static BOOL IsCrowdWalk(u32 code, u32 *direction, u32 *distance) {
    if (code < ACMD_CROWD_FIRST || code > ACMD_CROWD_LAST) {
        return FALSE;
    }
    *direction = (code - 1) & 3;
    if (code >= 0x75 && code <= 0x78) {
        *distance = 3;
    } else if (code >= 0x85 && code <= 0x90) {
        *distance = 2;
    } else {
        *distance = 1;
    }
    return TRUE;
}

// A move longer than the longest step is a relocation (a crowd's respawn, a despawn or a slot reused off screen): only
// its destination is checked. A real step still sweeps every tile it crosses
static BOOL IsRelocating(const VecFx32 *from, const VecFx32 *to) {
    fx32 dx = from->x - to->x;
    fx32 dz;

    if (dx < 0) {
        dx = -dx;
    }
    dz = from->z - to->z;
    if (dz < 0) {
        dz = -dz;
    }
    return dx > 3 * FOLLOWING_TILE || dz > 3 * FOLLOWING_TILE;
}

static BOOL IsNearStep(fx32 next, fx32 current, u32 limit) {
    u32 delta = (u32)next - (u32)current;

    return delta <= limit || 0u - delta <= limit;
}

// The game's volumes grow by width toward +X and by depth toward -Z. A sweep covers both its ends and keeps its
// heights apart; it overestimates a diagonal, and never reads the screen
static BOOL Overlaps(s32 fx, s32 fz, s32 fy, s32 spanWidth, s32 spanDepth, const VecFx32 *from, const VecFx32 *to,
                     u32 width, u32 depth) {
    s32 x0 = from->x / FOLLOWING_TILE;
    s32 x1 = to->x / FOLLOWING_TILE;
    s32 z0 = from->z / FOLLOWING_TILE;
    s32 z1 = to->z / FOLLOWING_TILE;

    if (fy < Min(from->y / FOLLOWING_TILE, to->y / FOLLOWING_TILE) ||
        fy > Max(from->y / FOLLOWING_TILE, to->y / FOLLOWING_TILE)) {
        return FALSE;
    }
    return Min(x0, x1) <= fx + spanWidth - 1 && Max(x0, x1) + (s32)width - 1 >= fx &&
           Min(z0, z1) - (s32)depth + 1 <= fz && Max(z0, z1) >= fz - spanDepth + 1;
}

// The follower's footprint, one tile while it waits as its closed ball
static s32 GetFollowerSpan(const FieldActor *follower, BOOL depth) {
    if (FollowingEffects_IsResting() && (follower->flags & FOLLOWING_ACTOR_FLAG_HIDDEN)) {
        return 1;
    }
    return Max(depth ? follower->collisionHeight : follower->collisionWidth, 1);
}

static BOOL Intersects(const VecFx32 *from, const VecFx32 *to, u32 width, u32 depth) {
    FieldActor *follower = sScene.follower->actor;
    s32 spanWidth;
    s32 spanDepth;
    s32 wx;
    s32 wy;
    s32 wz;

    if (follower == NULL) {
        return FALSE;
    }
    spanWidth = GetFollowerSpan(follower, FALSE);
    spanDepth = GetFollowerSpan(follower, TRUE);
    if (Overlaps(follower->gPos.x, follower->gPos.z, follower->gPos.y, spanWidth, spanDepth, from, to, width, depth)) {
        return TRUE;
    }
    // The same volume on the tile of the pose, which is its grid tile while the follower stands
    wx = follower->wPos.x / FOLLOWING_TILE;
    wy = follower->wPos.y / FOLLOWING_TILE;
    wz = follower->wPos.z / FOLLOWING_TILE;
    if (wx == follower->gPos.x && wy == follower->gPos.y && wz == follower->gPos.z) {
        return FALSE;
    }
    return Overlaps(wx, wz, wy, spanWidth, spanDepth, from, to, width, depth);
}

static BOOL IntersectsActor(const FieldActor *actor, const VecFx32 *from, const VecFx32 *to) {
    return Intersects(from, to, Max(actor->collisionWidth, 1), Max(actor->collisionHeight, 1));
}

// Replays one rail step of actor on a copy of its rail unit, with the game's switches, connections and curves, and
// changes no actor, shared unit, camera or rail: 1 when the step is clear, 0 when it crosses the follower, -1 when it
// can't be told
static s32 CheckRailStep(FieldActor *actor, u32 direction) {
    RailUnit *unit = FldAct_GetRailUnit(actor);
    RailUnit copy;
    VecFx32 previous;
    VecFx32 current;
    u32 frame;

    if (unit == NULL || unit->rail == NULL) {
        return -1;
    }
    // A unit at a point, or with no component, isn't one the policy knows
    if (unit->onLine != RAIL_COMPONENT_LINE) {
        return -1;
    }
    copy = *unit;
    // Another rail step still runs
    if (copy.movePending) {
        return -1;
    }
    if (!RailUnit_RequestMove(&copy, 0, ConvDirToRailDir(direction))) {
        return -1;
    }
    previous = actor->wPos;
    for (frame = 0; frame < RAIL_STEP_FRAMES; frame++) {
        RailUnit_UpdateMove(&copy);
        RailUnit_GetCalcPos(&copy, &current);
        if (IntersectsActor(actor, &previous, &current)) {
            return 0;
        }
        previous = current;
    }
    return copy.movePending ? -1 : 1;
}

static void CheckAction(FieldActor *actor, u32 code) {
    u32 distance = 1;
    u32 direction = code & 3;
    BOOL walking;
    VecFx32 previous;
    VecFx32 target;
    u32 step;

    if (!sScene.active || sScene.recalled || sScene.follower->actor == NULL) {
        return;
    }
    if (actor == sScene.follower->actor) {
        Recall();
        return;
    }
    if (code < ACMD_WALK_32F || (code >= ACMD_NO_MOVE_FIRST && code <= ACMD_NO_MOVE_LAST) || code == ACMD_END ||
        code == ACMD_NONE) {
        return;
    }
    if (actor == sScene.player) {
        // A seamless zone change's event can end between the poll and the player's next action, and a held run then
        // starts with no event while the scene still waits: that is the player's own input, not a script's movement,
        // and a new event takes the exception back. A live event still recalls
        if (sScene.gsys->event == NULL && code >= ACMD_PLAYER_RUN_FIRST && code <= ACMD_PLAYER_RUN_LAST) {
            sScene.naturalRun = TRUE;
            return;
        }
        Recall();
        return;
    }
    // An event's setup pauses the movement of ordinary actors, which can still have an action queued here that their
    // move code won't start: guessing those routes recalled the follower at signs, furniture and wandering NPCs. Their
    // real moves come to the position and step hooks before any coordinate is written
    if (actor->movementFlags & FOLLOWING_ACTOR_MOVEMENT_DISABLED) {
        return;
    }
    if ((code >= ACMD_STAY_WALK_32F && code <= ACMD_STAY_LAST) || (code >= 0x45 && code <= ACMD_EMOTION_BUBBLE) ||
        code == 0x67 || code == 0x99 || code == 0xa0 || code == 0xa1 || code == 0xbd || code == 0xbe) {
        if (IntersectsActor(actor, &actor->wPos, &actor->wPos)) {
            Recall();
        }
        return;
    }
    walking = (code >= ACMD_WALK_32F && code < ACMD_STAY_WALK_32F) ||
              (code >= ACMD_WALK_UPHILL_4F && code <= ACMD_PLAYER_RUN_LAST) ||
              (code >= ACMD_WALK_7F && code < ACMD_WALK_7F + 4) ||
              (code >= ACMD_BIKE_DEEP_SAND && code < ACMD_BIKE_DEEP_SAND + 4) ||
              (code >= ACMD_WALK_UPHILL_8F && code < ACMD_WALK_UPHILL_8F + 4);
    if (IsCrowdWalk(code, &direction, &distance)) {
        walking = TRUE;
    }
    if (code >= ACMD_JUMP_1 && code < ACMD_JUMP_2 + 4) {
        distance = code >= ACMD_JUMP_2 ? 2 : 1;
    } else if (!walking) {
        Recall();
        return;
    }
    if (code >= ACMD_BIKE_DEEP_SAND && code < ACMD_BIKE_DEEP_SAND + 4) {
        direction = code - ACMD_BIKE_DEEP_SAND;
    }
    if (code >= ACMD_WALK_UPHILL_8F && code < ACMD_WALK_UPHILL_8F + 4) {
        direction = code - ACMD_WALK_UPHILL_8F;
    }
    if (actor->flags & ACTOR_FLAG_RAIL) {
        // The game has the rails' four walk rates (16, 8, 4 and 2 frames); their other actions, the jumps among them,
        // aren't known. A crowd's walk is a real step, and a replay that can't run isn't a hit for it
        BOOL crowd = code >= ACMD_CROWD_FIRST && code <= ACMD_CROWD_LAST;
        s32 clear;

        if ((code < ACMD_WALK_16F || code >= ACMD_STAY_WALK_32F) && !crowd) {
            Recall();
            return;
        }
        clear = CheckRailStep(actor, direction);
        if (clear == 0 || (clear < 0 && !crowd)) {
            Recall();
        }
        return;
    }
    // A rail map gives the player a movement controller, and a grid crowd there still takes ordinary steps: the
    // controller isn't a collision, nor is a failed height. The position write recalls if the step really enters the
    // follower
    previous = actor->wPos;
    target = previous;
    for (step = 0; step < distance; step++) {
        fx32 height;

        if (direction < 2) {
            target.z += (direction ? 1 : -1) * FOLLOWING_TILE;
        } else {
            target.x += (direction == 3 ? 1 : -1) * FOLLOWING_TILE;
        }
        if (!GetHeightFromMap(actor, &target, &height)) {
            return;
        }
        target.y = height;
        if (IntersectsActor(actor, &previous, &target)) {
            Recall();
            return;
        }
        previous = target;
    }
}

// The game's grid volumes grow toward +X and -Z and hold both ends of a step
static BOOL OverlapsGrid(const FieldActor *a, const VecFx32 *p, const FieldActor *b, const GPosXYZ *q) {
    s32 aw = Max(a->collisionWidth, 1);
    s32 ad = Max(a->collisionHeight, 1);
    s32 bw = GetFollowerSpan(b, FALSE);
    s32 bd = GetFollowerSpan(b, TRUE);

    return p->y == q->y && p->x <= q->x + bw - 1 && p->x + aw - 1 >= q->x && p->z - ad + 1 <= q->z &&
           p->z >= q->z - bd + 1;
}

// The follower's own tile against b's footprint. The follower walks the player's trail one tile wide whatever its
// model's collision: a 64-pixel model's footprint took an NPC beside a corner for one stepped into
static BOOL OverlapsTile(const VecFx32 *p, const FieldActor *b, const GPosXYZ *q) {
    s32 bw = Max(b->collisionWidth, 1);
    s32 bd = Max(b->collisionHeight, 1);

    return p->y == q->y && p->x <= q->x + bw - 1 && p->x >= q->x && p->z <= q->z && p->z >= q->z - bd + 1;
}

static BOOL OverlapsSphere(const VecFx32 *a, const VecFx32 *b, fx32 radius) {
    if (radius <= 0 || radius > FOLLOWING_TILE * 4) {
        return FALSE;
    }
    return FieldRailSystem_IsPosNear(a, b, radius);
}

// The resting ball isn't drawn, but NPCs still walk around it
static BOOL IsFollowerValid(void) {
    FieldActor *follower = sScene.follower != NULL ? sScene.follower->actor : NULL;

    return follower != NULL && sScene.system != NULL && sScene.system->field == sScene.field &&
           sScene.follower->generation == sScene.generation && follower->actorSystem == sScene.system &&
           (follower->flags & FOLLOWING_ACTOR_FLAG_USE) &&
           (!(follower->flags & FOLLOWING_ACTOR_FLAG_HIDDEN) || FollowingEffects_IsResting());
}

static void CheckAmbientCollision(u32 kind, FieldActor *actor, FollowingEventCollision *query) {
    FieldActor *follower;

    if (!IsFollowerValid() || sScene.recalled || sScene.active || actor == NULL || actor == sScene.player ||
        actor->uid == ACTOR_UID_PLAYER || actor->actorSystem != sScene.system || actor == sScene.follower->actor ||
        (actor->movementFlags & FOLLOWING_ACTOR_MOVEMENT_DISABLED) || sScene.gsys->event != NULL ||
        sScene.gsys->eventRunning) {
        return;
    }
    follower = sScene.follower->actor;
    if (kind == FOLLOWING_EVENT_AMBIENT_GRID) {
        query->blocked = OverlapsGrid(actor, &query->position, follower, &follower->gPos) ||
                         OverlapsGrid(actor, &query->position, follower, &follower->initGPos);
    } else {
        query->blocked = OverlapsSphere(&query->position, &follower->wPos, query->radius);
    }
}

// The quarter of the rail's unit, the rail actors' collision radius
static fx32 GetRailRadius(MMSys *system, BOOL *found) {
    NoGridMapper *mapper = FldActSys_GetNoGridMapper(system);
    FieldRailSystem *rail = mapper != NULL ? FieldNoGridMapper_GetRailSystem(mapper) : NULL;

    *found = rail != NULL;
    return rail != NULL ? FieldRailSystem_GetUnitScale(rail) / 4 : FOLLOWING_TILE / 4;
}

// Called before the follower takes its next sample of the trail. The NPCs' destinations are already held in the
// game's grid and rail work, whatever the order of the updates; the player and the actors that no collision sees
// don't count
BOOL FollowingScene_IsStepClear(FieldActor *follower, const VecFx32 *target) {
    VecFx32 grid;
    u32 i;

    if (sScene.system == NULL || sScene.follower == NULL || sScene.follower->actor != follower) {
        return TRUE;
    }
    grid.x = target->x / FOLLOWING_TILE;
    grid.y = target->y / FOLLOWING_TILE;
    grid.z = target->z / FOLLOWING_TILE;
    for (i = 0; i < sScene.system->actorCapacity; i++) {
        FieldActor *actor = &sScene.system->actorHeap[i];

        if (actor == follower || actor == sScene.player || actor->uid == ACTOR_UID_PLAYER ||
            (actor->flags & (FOLLOWING_ACTOR_FLAG_USE | FOLLOWING_ACTOR_FLAG_HIDDEN | ACTOR_FLAG_NO_COLLISION)) !=
                FOLLOWING_ACTOR_FLAG_USE) {
            continue;
        }
        if (actor->flags & ACTOR_FLAG_RAIL) {
            // A crowd's actor marked as on the rails before its unit is placed doesn't stand here; a live unit does
            RailUnit *unit = FldAct_GetRailUnit(actor);
            BOOL found;
            fx32 radius;
            VecFx32 point;

            if (unit == NULL || unit->rail == NULL) {
                continue;
            }
            radius = GetRailRadius(sScene.system, &found);
            if (!found) {
                return FALSE;
            }
            RailUnit_GetPreviousCalcPos(unit, &point);
            if (OverlapsSphere(target, &point, radius)) {
                return FALSE;
            }
            if (unit->movePending) {
                if (!RailUnit_PredictNextPos(unit, RailUnit_GetMoveDirection(unit), NULL, &point)) {
                    return FALSE;
                }
                if (OverlapsSphere(target, &point, radius)) {
                    return FALSE;
                }
            }
        } else if (OverlapsTile(&grid, actor, &actor->gPos) || OverlapsTile(&grid, actor, &actor->initGPos)) {
            return FALSE;
        }
    }
    return TRUE;
}

static void ForgetVm(VM *vm) {
    u32 i;

    for (i = 0; i < VM_LIMIT; i++) {
        if (sScene.vms[i].vm == vm) {
            sScene.vms[i].vm = NULL;
            sScene.vms[i].event = NULL;
        }
    }
}

static void ForgetEvent(GameEvent *event) {
    u32 i;

    if (event == sScene.menuRoot) {
        sScene.menuRoot = NULL;
    }
    for (i = 0; i < EVENT_LIMIT; i++) {
        if (sScene.returnEvents[i] == event) {
            sScene.returnEvents[i] = NULL;
        }
    }
    if (event == sScene.battleRoot) {
        sScene.battleRoot = NULL;
        sScene.battleSetup = NULL;
    }
    for (i = 0; i < EVENT_LIMIT; i++) {
        if (sScene.events[i].event == event) {
            sScene.events[i].event = NULL;
            sScene.events[i].callback = NULL;
        }
    }
    for (i = 0; i < VM_LIMIT; i++) {
        if (sScene.vms[i].event == event) {
            sScene.vms[i].vm = NULL;
            sScene.vms[i].event = NULL;
        }
    }
}

static void ObserveCommand(VM *vm, u32 cmd) {
    FieldScriptEnv *env = vm->env;
    ScriptWork *work = env->subwork->work;
    u32 scriptId = work != NULL ? work->scriptId : 0xffff;
    GameEvent *event = work != NULL ? ScriptWork_GetEvent(work) : NULL;
    u32 free = VM_LIMIT;
    BOOL pcFade;
    u32 i;

    sScene.naturalRun = FALSE;
    Pause();
    for (i = 0; i < VM_LIMIT; i++) {
        if (sScene.vms[i].vm == vm) {
            free = i;
            break;
        }
        if (sScene.vms[i].vm == NULL) {
            free = i;
        }
    }
    if (free == VM_LIMIT) {
        Recall();
    } else {
        sScene.vms[free].vm = vm;
        sScene.vms[free].event = event;
    }
    if (cmd == CMD_PC_OPEN || cmd == CMD_PC_IDLE) {
        sScene.pcActive = TRUE;
        sScene.pcVm = vm;
    }
    pcFade = sScene.pcActive && sScene.pcVm == vm &&
             (cmd == CMD_FADE_IN_BLACK_QUICK || cmd == CMD_FADE_OUT_BLACK_QUICK || cmd == CMD_FADE_WAIT);
    if (pcFade) {
        sScene.pcFade = TRUE;
    }
    if (cmd == CMD_CALL_PC && sScene.pcActive && !sScene.recalled && sScene.follower->actor != NULL &&
        sScene.player != NULL && !(sScene.follower->actor->flags & FOLLOWING_ACTOR_FLAG_HIDDEN)) {
        FieldActor *follower = sScene.follower->actor;
        FollowingRestore restore;

        restore.magic = FOLLOWING_RESTORE_MAGIC;
        restore.player = sScene.player->wPos;
        restore.follower = follower->wPos;
        restore.grid[0] = follower->gPos.x;
        restore.grid[1] = follower->gPos.y;
        restore.grid[2] = follower->gPos.z;
        restore.face = follower->faceDir;
        restore.zone = sScene.player->zoneId;
        restore.selected = sScene.follower->selected;
        FollowingEvents_Preserve(sScene.field, sScene.generation, &restore);
        sScene.boxPreserve = TRUE;
    }
    // Yes at the Repel's prompt sprays another, only in that script; the move query before it is a read-only command
    // of the policy
    if (!IsSafeCommand(cmd) && !pcFade &&
        !((cmd == CMD_CALL_TRAINER_BATTLE || cmd == CMD_CALL_WILD_BATTLE || cmd == CMD_CALL_WILD_BATTLE_EX) &&
          IsBattleCandidate()) &&
        !(cmd == CMD_REPEL_REARM && scriptId == SCRIPT_REPEL_PROMPT)) {
        Recall();
    }
}

static void ObserveAllocation(const ZoneNPC *entity) {
    u32 free = 0;
    u32 i;
    VecFx32 target;

    for (i = 0; i < sScene.system->actorCapacity; i++) {
        if (!(sScene.system->actorHeap[i].flags & FOLLOWING_ACTOR_FLAG_USE)) {
            free++;
        }
    }
    if (entity->uid == sScene.follower->actor->uid || free == 0) {
        Recall();
        return;
    }
    if (!sScene.active) {
        return;
    }
    // A rail's or a placeholder sprite's entity has no grid destination: its allocation isn't a collision, its
    // position write is
    if (entity->isRail || entity->modelId == OBJ_CODE_185) {
        return;
    }
    target.x = (s16)entity->pos.grid.x * FOLLOWING_TILE + FOLLOWING_TILE / 2;
    target.y = entity->pos.grid.y;
    target.z = (s16)entity->pos.grid.z * FOLLOWING_TILE + FOLLOWING_TILE / 2;
    // Every model of the game fits 3 by 2 tiles, the bound until the new actor's model is set up
    if (Intersects(&target, &target, 3, 2)) {
        Recall();
    }
}

static BOOL IsSamePosition(const FieldActor *actor, const VecFx32 *target) {
    return target->x == actor->wPos.x && target->y == actor->wPos.y && target->z == actor->wPos.z;
}

// The origin of a move's sweep: its start for a step, its destination for a placement or a relocation
static const VecFx32 *GetSweepStart(u32 kind, const FieldActor *actor, const VecFx32 *target) {
    return kind == FOLLOWING_EVENT_WORLD_STEP && !IsRelocating(&actor->wPos, target) ? &actor->wPos : target;
}

static void Observe(u32 kind, void *subject, uptr value) {
    if (sScene.system == NULL || sScene.system->field != sScene.field ||
        sScene.follower->generation != sScene.generation) {
        return;
    }
    switch (kind) {
    case FOLLOWING_EVENT_AMBIENT_GRID:
    case FOLLOWING_EVENT_AMBIENT_RAIL:
        CheckAmbientCollision(kind, subject, (FollowingEventCollision *)value);
        return;
    case FOLLOWING_EVENT_VM_FREE:
        if (subject == sScene.pcVm) {
            sScene.pcVm = NULL;
            sScene.pcFade = FALSE;
        }
        ForgetVm(subject);
        return;
    case FOLLOWING_EVENT_FREE:
        ForgetEvent(subject);
        return;
    case FOLLOWING_EVENT_CALLBACK:
        sScene.naturalRun = FALSE;
        if (FollowingTalk_Owns(sScene.field) && subject == sScene.gsys->event) {
            return;
        }
        Pause();
        TrackEvent(subject, (GameEventCallback)value);
        InspectChain();
        if (!IsSafeCallback(subject, (GameEventCallback)value)) {
            Recall();
        }
        return;
    case FOLLOWING_EVENT_OPCODE:
        ObserveCommand(subject, value);
        return;
    case FOLLOWING_EVENT_ALLOCATE:
        if (sScene.follower->actor != NULL && subject == sScene.system) {
            ObserveAllocation((const ZoneNPC *)value);
        }
        return;
    }
    // The special controllers can ignore the collisions on purpose: they go on, and a write that conflicts recalls
    if (!sScene.active && (kind == FOLLOWING_EVENT_WORLD_STEP || kind == FOLLOWING_EVENT_POSITION) &&
        IsFollowerValid() && subject != sScene.player && subject != sScene.follower->actor) {
        FieldActor *actor = subject;
        const VecFx32 *target = (const VecFx32 *)value;

        if (actor->actorSystem == sScene.system && !IsSamePosition(actor, target)) {
            BOOL hit;

            if (actor->flags & ACTOR_FLAG_RAIL) {
                BOOL found;
                fx32 radius = GetRailRadius(sScene.system, &found);

                hit = OverlapsSphere(target, &sScene.follower->actor->wPos, radius);
            } else {
                hit = IntersectsActor(actor, GetSweepStart(kind, actor, target), target);
            }
            if (hit) {
                Recall();
            }
        }
    }
    if (!sScene.active || sScene.recalled || sScene.follower->actor == NULL || FollowingScene_IsBattleEntry()) {
        return;
    }
    if (kind == FOLLOWING_EVENT_ACTION) {
        CheckAction(subject, value);
    }
    if (kind == FOLLOWING_EVENT_POSITION || kind == FOLLOWING_EVENT_WORLD_STEP) {
        FieldActor *actor = subject;
        const VecFx32 *target = (const VecFx32 *)value;

        if (IsSamePosition(actor, target)) {
            return;
        }
        if (actor == sScene.player) {
            if (kind == FOLLOWING_EVENT_WORLD_STEP && sScene.naturalRun && sScene.gsys->event == NULL &&
                IsNearStep(target->x, actor->wPos.x, FOLLOWING_TILE) &&
                IsNearStep(target->y, actor->wPos.y, FOLLOWING_TILE * 2) &&
                IsNearStep(target->z, actor->wPos.z, FOLLOWING_TILE)) {
                return;
            }
            Recall();
        } else if (actor == sScene.follower->actor) {
            Recall();
        } else if (IntersectsActor(actor, GetSweepStart(kind, actor, target), target)) {
            Recall();
        }
    }
    if (kind == FOLLOWING_EVENT_DELETE && subject == sScene.follower->actor) {
        Recall();
    }
}

BOOL FollowingScene_Attach(MMSys *system, Follower *follower, u32 generation, void (*recall)(void)) {
    FollowingScene_Detach();
    sScene.system = system;
    sScene.field = system->field;
    sScene.gsys = sScene.field != NULL ? sScene.field->gameSystem : NULL;
    sScene.follower = follower;
    sScene.generation = generation;
    sScene.recall = recall;
    if (!FollowingEvents_Bind(sScene.field, sScene.gsys, generation, Observe, FollowingEffects_IsRecalling)) {
        sScene.system = NULL;
        return FALSE;
    }
    return TRUE;
}

void FollowingScene_SetPlayer(FieldActor *player) {
    sScene.player = player;
}

void FollowingScene_MarkMenu(GameEvent *event) {
    if (event == NULL || sScene.system == NULL || sScene.recalled) {
        return;
    }
    sScene.menuRoot = event;
    Pause();
    TrackEvent(event, event->callback);
}

BOOL FollowingScene_IsMenuActive(void) {
    return sScene.menuRoot != NULL && !sScene.recalled;
}

BOOL FollowingScene_WasOut(void) {
    return sScene.active && sScene.wasOut;
}

BOOL FollowingScene_BeginReturn(void) {
    GameEvent *event;
    u32 depth;

    if (sScene.system == NULL) {
        return FALSE;
    }
    // An application that hands the menu a field move, an item's event or a script: the follower waits for that event
    // to end, or for the field it leads to
    for (event = sScene.gsys->event, depth = 0; event != NULL && depth < EVENT_LIMIT; depth++, event = event->parent) {
        if (event->gsys != sScene.gsys) {
            return FALSE;
        }
        if (event->callback == EventFieldAppCall_Callback) {
            FieldAppCallWork *work = event->data;
            u32 type = work != NULL && work->input != NULL ? work->input->eventType : APP_EVENT_SCRIPT;

            if (type == APP_EVENT_FIELD_MOVE || type == APP_EVENT_COMMON || type == APP_EVENT_SCRIPT) {
                return FALSE;
            }
        }
    }
    for (event = sScene.gsys->event, depth = 0; event != NULL && depth < EVENT_LIMIT; depth++, event = event->parent) {
        sScene.returnEvents[depth] = event;
    }
    return TRUE;
}

BOOL FollowingScene_TakeRestore(FollowingRestore *restore) {
    if (sScene.system == NULL || !FollowingEvents_Consume(restore)) {
        return FALSE;
    }
    sScene.pcActive = TRUE;
    sScene.pcFade = TRUE;
    sScene.previousState = FOLLOWING_STATE_FOLLOWING;
    return TRUE;
}

void FollowingScene_Detach(void) {
    if (sScene.system != NULL) {
        FollowingEvents_Unbind(sScene.field, sScene.generation);
    }
    MI_CpuFill8(&sScene, 0, sizeof(sScene));
}

u32 FollowingScene_Poll(void) {
    if (sScene.system == NULL) {
        return FOLLOWING_SCENE_NONE;
    }
    if (sScene.system->field != sScene.field || sScene.follower->generation != sScene.generation) {
        FollowingScene_Detach();
        return FOLLOWING_SCENE_INVALID;
    }
    if (sScene.gsys->event != NULL) {
        sScene.naturalRun = FALSE;
        if (!FollowingTalk_Owns(sScene.field)) {
            InspectChain();
        }
    } else if (sScene.active && !sScene.gsys->eventRunning) {
        BOOL recalled = sScene.recalled;
        u32 i;

        if (sScene.boxPreserve) {
            FollowingEvents_Discard();
        }
        sScene.active = FALSE;
        sScene.recalled = FALSE;
        sScene.pcActive = FALSE;
        sScene.pcFade = FALSE;
        sScene.boxPreserve = FALSE;
        sScene.naturalRun = FALSE;
        sScene.menuRoot = NULL;
        sScene.wasOut = FALSE;
        sScene.pcVm = NULL;
        sScene.battleRoot = NULL;
        sScene.battleSetup = NULL;
        for (i = 0; i < EVENT_LIMIT; i++) {
            sScene.events[i].event = NULL;
            sScene.events[i].callback = NULL;
            sScene.returnEvents[i] = NULL;
        }
        for (i = 0; i < VM_LIMIT; i++) {
            sScene.vms[i].vm = NULL;
            sScene.vms[i].event = NULL;
        }
        if (!recalled && sScene.follower->state == FOLLOWING_STATE_EVENT_PAUSED) {
            sScene.follower->state = sScene.previousState;
        }
        return FOLLOWING_SCENE_REFRESH;
    }
    if (!sScene.active) {
        return FOLLOWING_SCENE_NONE;
    }
    return sScene.recalled ? FOLLOWING_SCENE_RECALLED : FOLLOWING_SCENE_PAUSED;
}

BOOL FollowingScene_IsPcFade(void) {
    return sScene.active && !sScene.recalled && sScene.pcActive && sScene.pcFade;
}

void FollowingScene_PauseAs(FollowingState state) {
    if (sScene.active && !sScene.recalled) {
        sScene.previousState = state;
        sScene.follower->state = FOLLOWING_STATE_EVENT_PAUSED;
    }
}
