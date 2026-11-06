# Following Pokémon: event and recall logic review

Scope: `src/paperwhite2/ov036/paperwhite2_following_scene.c` (scene), `src/paperwhite2/ov012/paperwhite2_following_events.c`
(bridge), the recall parts of `paperwhite2_following_effects.c` (effects) and `paperwhite2_following_field.c` (field),
`res/paperwhite2/following/event-policy.json` + `tools/paperwhite2/following_scene_policy.py`, and the hook sites in
the original code. Read only. Per the coordinator's correction, the old Pokeweb symptoms (area-change recalls,
Castelia recalls, frame drops) are not explained here; the focus is on what remains risky in the current code.

"Read" = I read the code at that line. "Inferred" = my reasoning from what I read, not tested in game.

---

## 1. The state machine as it is

Three layers hold state, each with its own flags, and they are not one state machine.

**Scene (`sScene`, scene.c:115-144)**: `active`, `recalled`, `previousState`, `pcActive`, `pcFade`, `boxPreserve`,
`naturalRun`, `menuRoot`, `wasOut`, `returnEvents[16]`, `pcVm`, `battleRoot`, `battleSetup`, `events[16]`, `vms[48]`.
Effectively three states (read, scene.c:1164-1213):

| State | Meaning | Entered by | Left by |
|---|---|---|---|
| IDLE (`!active`) | no event | Poll's reset (scene.c:1177-1207), Detach | `Pause()` from any event callback, opcode, `MarkMenu`, or Recall |
| PAUSED (`active && !recalled`) | follower frozen in place, `state = EVENT_PAUSED` (scene.c:156-168) | `Pause()` | `Recall()`, or Poll seeing `gsys->event == NULL && !eventRunning` → resets, restores `previousState`, returns REFRESH |
| RECALLED (`active && recalled`) | follower deleted (RecallForScene → Cleanup) | `Recall()` (scene.c:170-184) | same reset as PAUSED; the follower is rebuilt later by UpdateBefore |

Poll is called once per frame from `UpdateBefore` (field.c:2227) before `FldActSys_Update`.

**Effects (`sFx.mode`, effects.c:27-33)**: NONE / OUT / RECALL / CUE, each a 12 (or 30) frame timer ticked at the start
of `PaperWhite2_FollowingUpdate` (effects.c:866-893, field.c:2528). `RECALL` is what the hold keys on
(effects.c:850-852). A separate resting-ball state `sRest.on` (effects.c:795-844).

**Field (`sFollower.state` + ~25 statics, field.c:180-260)**: ABSENT / WAITING / FOLLOWING / EVENT_PAUSED /
INTERACTING, plus `sSummon`, `sReturnSummon`, `sReturnHold`, `sMenuSession`, `sBallOff`, `sHeld`, `sCyclePending`,
`sRestore`, `sReason` (a bit mask of REASON_* that, when non-zero, deletes the follower each frame, field.c:2343-2358).

The follower is a real `FieldActor` (created field.c:2398-2406, flags `HIDDEN | NOT_BLOCKING | NOT_QUERIED |
KEEP_ZONE`, its own `sMoveCode` vtable), so vanilla's `DeleteAllActors` on a seamless swap keeps it (`0x20`,
field_actor.c:1685, following_field.h:23), and vanilla collision ignores it (NOT_BLOCKING) — which is why the ambient
collision hook exists.

## 2. Every recall trigger

### 2a. Scene `Recall()` (deletes the follower, then the hold below applies)

| # | Trigger | file:line |
|---|---|---|
| 1 | `FinishScriptSubEvents` with an active sub event outside the finisher mask, or work shape unexpected | scene.c:439-443 |
| 2 | Event table full (more than 16 distinct live events tracked) | scene.c:464-467 |
| 3 | Any event in the live chain whose callback isn't in `IsSafeCallback`, or from another gsys | scene.c:480-483 |
| 4 | Chain deeper than 16 | scene.c:488-490 |
| 5 | The callback just notified isn't safe (checked again after InspectChain) | scene.c:1016-1018 |
| 6 | The follower's own actor gets an action command | scene.c:635-638 |
| 7 | The player gets any moving action during an active scene (except a held run with no event: `naturalRun`) | scene.c:643-653 |
| 8 | An actor's stay/turn-type action while its footprint already overlaps the follower | scene.c:660-666 |
| 9 | Any action code not in the known walk/jump ranges (magic list: 0x45..EMOTION, 0x67, 0x99, 0xa0, 0xa1, 0xbd, 0xbe, …) | scene.c:677-679 |
| 10 | Rail actor: an action outside the 4 walk rates (non-crowd), or a replayed rail step that hits the follower or can't be replayed | scene.c:693-700 |
| 11 | Grid walk/jump whose swept tiles overlap the follower | scene.c:720-723 |
| 12 | VM table full (48) | scene.c:906-908 |
| 13 | **Any script opcode not in the allow-list** (375 of 0x2f3 + 4 hack commands), except battle calls with the follower as lead, PC fades, and Repel rearm in script 10144 | scene.c:940-945 |
| 14 | Zone entity allocation with the follower's UID, or no free actor slot | scene.c:958-961 |
| 15 | Zone entity allocation (active scene, non-rail) within a 3x2 bound of the follower | scene.c:974-976 |
| 16 | **No event running**: any non-player actor's position write/world step (move code set up or not) that overlaps the follower ("special controllers") | scene.c:1030-1050 |
| 17 | Active scene: player position change (except naturalRun near-step) | scene.c:1064-1071 |
| 18 | Active scene: the follower's own position written by someone else | scene.c:1072-1073 |
| 19 | Active scene: another actor's position write overlapping the follower | scene.c:1074-1075 |
| 20 | Active scene: the follower's actor is deleted | scene.c:1078-1080 |

### 2b. Field recalls outside the scene (effect + hide, sometimes trail clear)

| Trigger | file:line |
|---|---|
| REASON_EX_STATE / REASON_EVENT / REASON_PAIR (and every other reason, without the effect) → recall effect + Cleanup | field.c:2343-2358 |
| REASON_EVENT = `Field_IsEventRunning && !ownTalk && !paused`, or `field->fadeFlag` outside the PC fade and battle entry | field.c:2281-2284 |
| Follower's next trail step not clear (`FollowingScene_IsStepClear`) | field.c:1461-1469 |
| Large follower held/barred (64px indoors etc.) → ball | field.c:1426-1446 |
| Swap / rail swap / step-beside blocked → `RecallBlocked` | field.c:821, 871, 921, 972 |
| `RebaseConnection` fails (bad jump) / trail push < 0 → hidden, WAITING (no effect) | field.c:1320-1327, 1345-1352 |
| L/R cycle, SELECT toggle | field.c:2031, 2106 |

## 3. The hold mechanism

Read: `GameEvent_RunCallback` (src/system/game_event.c:46-54) asks `PaperWhite2_FollowingHoldEvent`; the bridge's
`OnCallback` (events.c:120-125) first notifies the scene (which may call `Recall()` → `FollowingEffects_Recall` sets
`mode = RECALL`), then returns `hold()` = `FollowingEffects_IsRecalling()` (bound at scene.c:1091). While it is TRUE,
**every event of the game system returns CONTINUE without running its callback**, for up to `RECALL_TICKS` = 12
frames (effects.c:44, 879-886). In parallel `FieldPlayer_GetMoveDirByKey` returns `PLAYER_DIR_NONE`
(field_player.c:153-161) while `PaperWhite2_FollowingHoldsPlayer` (field.c:1528-1531: recalling and not the resting
ball).

What the hold does **not** stop (read, fieldmap.c:549-551; field.c:2527-2530): `FldActSys_Update` (every actor's TCB,
move codes, queued acmds), the actors' rail units, TCB-driven camera moves, screen fades (hardware/wipe tasks),
sound sequences already playing, the field's per-frame systems (weather, place name, subscreen, comm). Only event
callbacks are frozen. The event's world keeps moving; the event's logic doesn't.

### Where a held event can let state drift (inferred from the above, with the call sites)

1. **Any event that measures the world before it pauses it.** The Dell bug is the pattern: `EventTrainerEye`
   measured the range, then pausing came later inside the held event. Fixed for that one function only
   (event_trainer_eye.c:342-359, `#ifdef PAPERWHITE2`). Same class, not fixed:
   - **NPC talk**: the field event provider creates the script event when A is pressed on an adjacent NPC
     (fieldmap_event.c:343-348); the NPC is paused only by the script's first `PauseEventMModels` /
     `DisableAllButEventActorsMovement` (scrcmd_field_actor.c:649-706). If a recall is in progress when the event
     starts (L/R, SELECT, a blocked trail step a frame earlier, or the talk itself triggering a recall), a wandering
     NPC keeps walking for up to 12 frames, then `FacePlayer`/`ActorSetEyeToEye` runs from wherever it is.
   - **Double-sight trainers, spinners and look-around trainers**: their facing changes while held; the eye event's
     cached `dir` is forced back (`CheckSetActorFaceDir`, event_trainer_eye.c:340), and the re-measure keeps the
     stale range when no longer in line (`dist == -1`).
   - **Coordinate triggers and scene-change scripts** (`CheckReserveEventScriptCall`, `CheckTriggerScrEvent`,
     fieldmap_event.c:777-893): scripts that assume NPC positions at trigger time (escort, rival walk-ups computed
     with `GetPlayerPos` then `ApplyMovement`) see positions 12 frames later.
2. **Choreography inside a script**: the hold can start mid-script (an `ApplyMovement` whose path crosses the
   follower, scene.c:720-723, or an unsafe opcode, scene.c:940-945). The acmd is already queued and the actors keep
   executing it; the VM is frozen. Commands timed relative to movement without a wait (`VMSleep N`, an SE, a camera
   move, a second `ApplyMovement` later) slip by up to 12 frames. Vanilla scripts only use `WaitMovement` for the
   end, not for intermediate sync.
3. **Battle starts not carried by the follower** (double battle, follower not lead): the battle call isn't safe
   (scene.c:258-298, 357) → Recall → the battle event is held 12 frames: encounter flash/BGM delayed, NPCs move, the
   player input is gated. Benign but a vanilla deviation of every such battle.
4. **Map change / warp events**: held after their first notify; the fade-out task may already be running (inferred);
   arrival script NPC positions are unaffected (new field). Low risk.
5. **Comm/Entralink/Union events**: held 12 frames; network timeouts are long. Low risk, but a hold touching
   communication events is in principle unsafe.
6. **Player input gate with no event**: a blocked trail step (field.c:1461-1469), L/R or SELECT drop D-pad input
   for 12 frames (field_player.c:157). This breaks a run's momentum and can make the player stop on a tile vanilla
   would have walked through — e.g. a trainer's sight tile or a trigger tile is reached 12 frames later, and NPC
   patrol phase differs from vanilla.
7. **Recall is synchronous inside the hook that saw it**: `Recall()` → `RecallForScene` → `Cleanup` →
   `DeleteActor(follower)` (field.c:1535-1546, 1499-1505) runs from inside `VM_Run`'s opcode fetch (vm.c:94-96),
   `FldAct_SetAcmd` (field_actor.c:596, 611), `SetActorWPosValue` (field_actor.c:1154), `CreateNewActorByEntity`
   (field_actor.c:269), and from `FieldScript_Run` of the zone's init scripts during `Field_SwapZoneByMatrix`
   (fieldmap.c:1220, script_sys.c:438-456) — i.e. mid actor-update loop and mid zone swap. It works today because
   only the follower is deleted and the hook contract handles "subject deleted", but it is the most fragile
   ordering in the system.

### Other places the scene changes vanilla behavior or state (read)

- **NPC movement**: `CheckAmbientCollision` (scene.c:765-781, hooked at field_actor_tool.c:607 and
  field_actor_rail.c:215) makes every NPC's own move code treat the follower's `gPos` **and `initGPos`** as blocked.
  NPC wander routes, patroller turn points (Dell's `WALK_BACK_AND_FORTH`), and the RNG draws of wanderers differ from
  vanilla whenever the follower is near. Expected for a follower, but it is a gameplay change and it interacts with
  trainer sight timing.
- **Battle setup is written by a predicate**: `IsBattleEvent` sets `FOLLOWING_BATTLE_PRESENT` in the `BtlSetup`
  (scene.c:294) and is called from `IsSafeCallback` → `IsBattleChain`, i.e. every frame from InspectChain.
- **Return events are trusted by address only**: `IsReturnRoot` (scene.c:320-329) never re-checks the callback;
  `GameEvent_Transplant` (game_event.c:74-81) changes an event's callback in place without a free, so a transplanted
  return event stays "safe" whatever it becomes.
- **The allow-list's integrity data is dead**: event-policy.json pins each command by White 2 handler address and
  first bytes (`handler`, `expectedHex`); the generator only checks that they *look* pinned (following_scene_policy.py
  :49-51). The list is pure opcode numbers; command arguments aren't considered (e.g. `ApplyMovement` is safe for any
  target, relying on the action hook). `COMMAND_LIMIT = 0x2F3` (py:31) and the four hack opcodes are hard-coded
  (scene.c:70-73, 190-191): any new hack command recalls by default.
- **Fixed capacities recall**: 16 events, 48 VMs, chain depth 16 (scene.c:48-49, 464-467, 488-490, 906-908).
- **Per-frame cost** (inferred from call sites): every event callback every frame → `TrackEvent` + `InspectChain`
  (walks the chain, each link running `IsBattleChain` and `IsReturnEvent`, each walking the chain again: O(depth²)),
  then Poll walks it once more; every script opcode → 48-slot scan + binary search; every moving actor's every
  position write → `Observe` with sweep tests even outside events (scene.c:1030-1050); every follower step →
  scan of the whole actor heap (scene.c:795-844).

## 4. Which earlier fixes are patches over the design

Each of these exists because the scene judges events by *which code ran* and stops the world's *logic* (not its
actors) while recalling:

- `naturalRun` (scene.c:130-131, 644-650, 1065-1070): a seamless swap's event racing the player's own run.
- PC: `pcActive`, `pcFade`, `pcVm`, the quick-fade opcodes, `boxPreserve` + the restore token (scene.c:51-65,
  912-937, 393-396; field.c:2346-2463). The PC is "safe" only because three special cases agree.
- Repel prompt script ID exception (scene.c:75-76, 943).
- `returnEvents` / `BeginReturn` / `MarkMenu` / `sMenuSession` / `sReturnSummon` / `sReturnHold`
  (scene.c:320-350, 1119-1145; field.c:205-224): returning from menus and battles was recalling, because the return
  events weren't in the list.
- `FinishScriptSubEvents` finisher mask, PokeVoice "live VM" check, Yes/No env check (scene.c:404-445).
- `IsRelocating` > 3 tiles, the 3x2 allocation bound, `OBJ_CODE_185` placeholder, the hand-listed acmd ranges
  (scene.c:94-103, 512-524, 660-679, 967-975).
- The Trainer-eye re-measure (event_trainer_eye.c:342-359): vanilla code patched to tolerate the hold.

## 5. Is an allow-list the right approach?

No, in my judgement. It decides on *mechanism* (which opcode, which callback) when what matters is *effect* (does
anything need the follower's tile, does the player leave, does the screen go dark, does the field unload). The
consequences are visible in the code: 375 opcodes reviewed against a ROM that no longer exists, ten-odd structural
exceptions, recalls from table sizes, and a default of "recall" for everything new. And recall costs a 12-frame
hold of the whole event system, which is the source of state drift.

Vanilla's own partner (`MOVE_CODE_FOLLOW_PLAYER`, pair_sys.c:101, 187) needs none of this (read): it is an ordinary
actor; scripts address it as `0xf2` (scrcmd_field_actor.c:41, 97-103; event_action_call.c:104-107); when an event
starts, `PauseEventMModels` / `DisableAllButEventActorsMovement` freeze every actor but let the partner finish its
current step and then disable it (scrcmd_field_actor.c:610-706); its TCB runs right after the player's
(field_actor.c:1706-1708). Nothing is held; nothing inspects the script. Scripts that conflict with it are written
for it — which a hack's follower can't rely on, so we still need conflict detection, but only that.

## 6. A simpler, deterministic policy (proposal)

Principles: **never hold a game event, never gate input, never edit vanilla to compensate**. Decide from world state
at a few edges, not per opcode.

1. **Event start (edge `gsys->event` NULL → non-NULL)**: freeze the follower like vanilla's partner — let it finish
   the current trail step, then stand. Have its move code honor `MOVEMENT_DISABLED` so the game's own
   `DisableAllActorsMovement` does this. No script inspection.
2. **During the event, hide (not "recall with hold") on conflict only**, by effect:
   - an action command or position write of any actor whose path/destination covers the follower's tile (the
     existing acmd/position/allocation hooks, but only these three, with one footprint rule);
   - the player is moved by script (non-turn acmd on the player) — the follower can't know the scripted route;
   - the field fades out (fade to black/white starts) or the field unloads.
   Hiding is immediate in logic (actor hidden and non-blocking that frame). The recall animation, if wanted, plays
   as a detached effect at the old position (the silhouette and ball are already private billboards/G3D models,
   effects.c:20-25), so nothing waits for it.
3. **Event end (edge non-NULL → NULL)**: if hidden, re-place it with the existing summon placement (behind / side /
   beside) with the send-out; if frozen, resume the trail. Party changes made by the event are picked up by the
   existing reselection.
4. **Fade/unload restore, one rule for PC, menu, battle return and save**: on hide-by-fade or unload, store
   {zone, player tile, follower pose, selection}. On the next field-in, if zone and player tile match, place the
   follower back at that pose at once; otherwise walk in. This replaces `pcActive/pcFade/pcVm/boxPreserve`,
   `returnEvents`, `BeginReturn`, `MarkMenu`, `sMenuSession`, `sReturnSummon/Hold`, and keeps the summon token.
5. **Outside events**: NPC ambient blocking as now (it's the one deliberate gameplay change), but on the follower's
   *current* tile only (drop `initGPos`); a crowd/controller move that still enters the tile hides the follower
   without a hold and without gating input; the follower's own blocked step waits or hides, never stops the player.
6. **Battle mark**: set `FOLLOWING_BATTLE_PRESENT` once, when the battle event is created (an explicit hook in the
   battle call), not from a predicate run every frame.
7. **Remove**: the opcode hook, the event-callback hold, the event/VM tables, the allow-list JSON and generator,
   `naturalRun`, the Repel/PokeVoice/YesNo/finisher special cases, the player D-pad gate, and (after testing) the
   Trainer-eye re-measure, which then matches vanilla again.

Features kept: stays out through talk, signs, menus, prompts, camera cutscenes, music; disappears when a script needs
its tile or moves the player; comes back after menus, PC, battles and warps in the same place when the player hasn't
moved; battle opening mark; NPCs walk around it. What changes: the recall animation no longer delays the game, and a
script that walks a NPC through the follower sees the follower vanish at the moment the path is set (as now, minus
the 12-frame stall).

Risks of the proposal (inferred): a conflict detected only at the position write (rail crowds, special
controllers) means the follower vanishes the frame the actor arrives, which may look abrupt — acceptable, or predict
one step ahead as now. A follower frozen through an event whose script spawns an NPC on its tile is covered by the
allocation hook. Scripts that teleport the player without a fade (`ObjInitWarpGPos`, rail repositioning) are covered
by the player-position rule.
