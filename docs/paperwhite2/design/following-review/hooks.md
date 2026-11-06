# Following Pokémon: hooks into the original game code

Read-only review, 2026-11-05, of `main` at 4a274a02fa. Scope: every `#ifdef PAPERWHITE2` edit outside `src/paperwhite2/`
that serves the follower. I found them by extracting every `PAPERWHITE2` block that mentions "follow", then grepping
for each function declared in `include/paperwhite2/following*.h` in code outside the runtime. Hooks for other hack
features (conditions, spawns, wanderers, DexNav, prestige, C-Gear, debug) are left out, except where they share a hook
with the follower.

How I mark evidence: **[read]** means I read it in the code at the line given. **[infer]** means I reasoned it from
that code and did not run or test it. Costs are estimates from the code paths, not measurements.

How the pieces connect [read]: main's resident shims (`src/paperwhite2/main/paperwhite2_following_resident.c`) call
function pointers that `FollowingEvents_Bind` sets (`src/paperwhite2/ov012/paperwhite2_following_events.c:138`). The
overlay-12 bridge calls `Notify`, which calls a single observer, `Observe` (`src/paperwhite2/ov036/paperwhite2_following_scene.c:988`).
The hold callback is `FollowingEffects_IsRecalling` (scene.c:1091). The effect lasts `RECALL_TICKS` = 12 ticks
(effects.c:45, 866-889).

---

## 1. Table of hooks

Column key. Kind: **O** observes only; **A** alters vanilla behavior (says how); **X** is an export or wrapper that
changes no vanilla behavior. Freq: F = once a frame; AF = once per actor per frame; E = once per event step or
script command; R = rare (load, unload, menu, battle start).

| # | Site (file:line) | Original function | What it does | Kind | Freq / cost | Risk |
|---|---|---|---|---|---|---|
| 1 | `src/system/game_event.c:47-52` | `GameEvent_RunCallback` | Sends each callback to the observer (TrackEvent, InspectChain, IsSafeCallback, possibly Recall), then **returns `GAMEEVENT_CONTINUE` without running the callback** while a recall effect plays | **A: holds every event**, including its first step | E: each running event's callback, every frame, plus extra calls in a frame for `CONTINUE_DIRECT`. Each call walks the chain, which is O(depth²) (InspectChain × IsBattleChain / IsReturnEvent, up to 16 deep). Low to medium cost | **High** (see 2.1) |
| 2 | `src/system/game_event.c:57-60` | `GameEvent_Free` | Drops the event from the scene's tables (ForgetEvent loops over 16+16+16+48 entries) | O | E, cheap | Low |
| 3 | `src/system/game_event.c:67-73` | (new) `PaperWhite2_GameEventFree` | Exports the static free so the talk can cancel its event | X | R | Low (reentrancy, 2.8) |
| 4 | `src/system/vm.c:94-97` | `VM_Run` (after `VM_Read16`) | Every field-script opcode goes to ObserveCommand: it calls `Pause()`, loops 48 VM slots, binary-searches the safe list, and recalls on any opcode that isn't safe | O on the VM, but **A on the follower**: any opcode that isn't safe recalls it, and any opcode at all marks the scene "active" | E: every opcode of every field script, including the synchronous zone-init scripts (`FieldScript_Run`, `src/ov012/script_sys.c:418-436`). About 50 to 100 loop iterations per opcode | **High** (2.2) |
| 5 | `src/system/vm.c:37-40` | `VM_Free` | Forgets the VM (48-slot loop) | O | E | Low |
| 6 | `src/ov012/field_actor.c:266-270` | `CreateNewActorByEntity` | ObserveAllocation: counts free slots over the whole heap; recalls if there are none, if the entity's uid is the follower's, or if the new NPC's 3×2 box overlaps the follower while the scene is active | O (the recall frees a slot first, by design) | R to AF: zone hot-swaps and script spawns. O(capacity) per spawn | Medium (2.4) |
| 7 | `src/ov012/field_actor.c:346-352` | `DeleteActor` | Notifies DELETE. **Skips the whole original** when the actor was in use before the notify and isn't after it (the follower that the observer already removed) | A (an early return, follower only) | R | Low to medium (2.7) |
| 8 | `src/ov012/field_actor.c:593-601` | `FldAct_SetAcmd` | CheckAction: replays the walk or jump sweep, or a rail-step replay, and recalls if it crosses the follower. Skips `SetNextActorAcmd` if the actor was deleted, **but still writes the acmd state and movement flags** | O on NPCs; A on the follower. Touches **every actor that a script or controller moves** | E: each acmd. A rail replay is up to 16 `RailUnit_UpdateMove` calls on a copy | Medium to high (2.3) |
| 9 | `src/ov012/field_actor.c:608-616` | `FldAct_SetLocalAcmd` | Same as #8 | same | same | same |
| 10 | `src/ov012/field_actor.c:965-975` | `FldAct_CallMoveProc` | Saves and restores `sBridge.ambient = actor` around each actor's own move code, so that #11 and #12 apply only inside it | O (sets context) | AF, trivial | Low |
| 11 | `src/ov012/field_actor_tool.c:565-607` | `CheckActorNewPosOtherActorCollision` (the original renamed `CheckOtherActorCollision`) | Inside a move proc, with no event and the scene not active: also blocks the follower's tile, both `gPos` and `initGPos`, at the follower's model footprint. Also wraps the wanderers' check | **A: vetoes NPC steps** | Per collision query from move codes, cheap | Medium (2.5) |
| 12 | `src/ov036/field_actor_rail.c:212-218` | `RailActor_GetHitBitsDir` (doc: `RailActor_CheckCollision`) | The same on rails, as a sphere test with radius unitScale/4 | **A: vetoes rail NPC steps** | Per rail query, cheap | Medium |
| 13 | `src/ov012/field_actor.c:1152-1157` | `SetActorWPosValue` | Notifies WORLD_STEP (or POSITION before the move code is set up). With no event: any non-player NPC whose sweep crosses the follower **recalls it**. With an event: also the player, unless it is a natural run. Skips the write if the follower was deleted | O on NPCs; A on the follower. **Every moving actor** | **AF**: 48 call sites; every moving actor writes `wPos` every frame. Cheap arithmetic, run often | **High** (2.3) |
| 14 | `src/ov012/field_actor.c:1732-1737` | `SetActorWPosAll` | The same as POSITION, then the original calls `SetActorWPosValue`, which notifies **a second time** | same | R to AF | High (with #13) |
| 15 | `src/ov012/field_actor.c:1886-1892` | `GetNPCMdlInfoForOBJCODE` | Makes the table offset 32-bit, not u16 | A (a data width) | R | Low |
| 16 | `src/system/field_actor_savedata.c:193-204` | `GetIndexOfObjID` | Maps follower object codes, and the wanderers' walking Pokémon, to rows 0x3f0 and up | A (new codes only) | R (per model lookup) | Low |
| 17 | `src/ov036/fieldmap.c:549-560` | `FieldRoutine_Run` | Replaces `FldActSys_Update` with `PaperWhite2_FollowingUpdate`: effects tick, UpdateBefore (poll, create, recall, move), `FldActSys_Update`, terrain, shadow, Prepare and Snapshot, ambient | A (wraps; vanilla actors update the same way) | F. **The largest per-frame cost**: it includes `FollowingScene_Poll` → InspectChain while an event runs, and `GFL_HeapGetFreeSize` in Prepare every frame | Medium (perf, 2.6) |
| 18 | `src/ov036/fieldmap.c:472-476` | `FieldRoutine_MapSpawnFinish` | Preloads and binds the follower sprite before the fade | O | R | Low |
| 19 | `src/ov036/fieldmap.c:622-625` | `FieldRoutine_MapUnload` | Decides the summon token, detaches the bridge, deletes the actor, frees effects | O (its own teardown) | R | Medium (lifetime: the bridge must unbind here before ov036 goes) |
| 20 | `src/ov036/fieldmap.c:1453-1461` | `FieldRenderPhase2_Fieldmap` | Replaces the actor billboard draw with `FollowingRender_Draw`. That one changes, for the draw only, the follower quad's Y, lights, face and scaleY, and the **shared material's `faceHeight`**, then restores them; it also draws a private "strips" scene | A (temporary changes to the draw) | F. s64 camera math and a second scene submit. Low to medium | Medium (2.9) |
| 21 | `src/ov036/fieldmap.c:1453-1461` | same | Replaces the wild-grass draw with `FollowingRender_GrassDraw`: walks up to 256 handles and temporarily moves the grass quads of the follower **and the player** | A (temporary; touches the player's grass) | F. Up to 256 handle checks | Low to medium |
| 22 | `src/ov036/fieldmap.c:1470-1475` | same | Effects draw: the vanilla draw, then Snapshot, the ball, the flash and emotes | O, plus its own draws | F | Low |
| 23 | `src/ov036/field_player.c:154-160` | `FieldPlayer_GetMoveDirByKey` | Returns `PLAYER_DIR_NONE` while a recall that isn't the rest-ball recall plays | **A: drops the player's input** for about 12 ticks | F | Medium (2.6) |
| 24 | `src/ov036/fieldmap_event.c:444-451` | `FieldEventProvider_Grid` | Marks the menu event, and with no event starts a talk on A | A (adds an event; sets `scriptCalled`) | F while no event | Low |
| 25 | `src/ov036/fieldmap_event.c:540-543` | `FieldEventProvider_NoGrid` | The talk on rails | A (adds an event) | F | Low |
| 26 | `src/ov036/event_trainer_eye.c:342-359` | `EventTrainerEyeSub_ForceTrainerDir` | **A symptom fix for #1**: measures the trainer's walk distance again after it stops | A (**non-follower actor, vanilla trainer logic**) | R | Medium (it covers this one case only) |
| 27 | `src/ov167/btlv_scu.c:557-571, 901-959` | `BtlvScu_StartEncount` (wild and trainer single intro) | The follower's intro: skips the throw, ball and "Go!" when the field set `FOLLOWING_BATTLE_PRESENT` (bit 31 of `setup->flags`, set in scene.c:294) | A (only when the bit is set; otherwise the vanilla procs) | R | Medium (it jumps to hard-coded vanilla seq numbers: 5/6 → 9/11) |
| 28 | `src/ov140/config_panel.c:391-417, 973-978, 1740-1787, 1906-1952` | `ConfigPanel_Init/Exit`, `ConfigPanelAppBar_Main`, `ConfigPanelSeq_Input/Save` | The FOLLOWERS row; wrapper exports | A (menu UI) | R | Low |
| 29 | `include/save/config.h:20-26` | the Config save bitfield | `followersOff` uses one of the 5 spare bits | A (save format) | R | Low |
| 30 | `src/ov284/evolution_demo.c:1357-1362` | Shedinja's copy | Clears the follower record kept in `PKM_PARAM_UNK72/76` | A (Pokémon data) | R | Low |
| 31 | `src/ov036/field_actor_g3dobj.c:755-765` | (new) wrappers | `RailActor_EnsureShadow`, `RailActor_MapAttrGrassProc12` for the follower | X | F (shadow) / per tile | Low |
| 32 | `src/ov036/fldeff_grass.c:322-332` | (new) `PaperWhite2_IsShakingGrassTask` | Recovers a task from its work by a byte offset; checks the vtable | X (reads only) | F × handles | Low (pointer guess, guarded by `IsTaskWork`) |
| 33 | `src/ov036/field_msgbg.c:1199-1206` | (new) `PaperWhite2_CanOpenActorMsgWin` | Whether a balloon can open | X | R | Low |
| 34 | `src/gfl/billboard.c:174-185`, `src/gfl/g3d_system.c:953-962` | (new) wrappers | Material bind/set; the G3D heap id; a resource's data swap | X | R | Low |
| 35 | Predicate exports: `field_transition.c:850`, `scrcmd_camera.c:194`, `scrcmd_menu.c:188`, `scrcmd_sound.c:419`, `event_battle.c:708`, `field_menu_event.c:67`, `event_sound.c:516`, `field_event.c:403`, `script_sub_event.c:83` (and their headers) | (new) | "Is this callback X" tests for the scene policy | X | Inside #1/#4 | Low on their own; they are what holds the policy's complexity together |

Hooks that touch **non-follower actors** [read]: #6, #8, #9, #11, #12, #13 and #14 (every actor's moves and steps; #11
and #12 veto NPC steps), #21 (the player's grass quads, drawn moved), #23 (the player's input), #26 (trainers), and #1
and #4 (every event and script).

### Where the doc's Hooks section differs from the code

- **event-callback** (doc line 72) says "forwards the callback and notes the running event". The code also **vetoes the
  callback** while a recall plays (game_event.c:49, events.c:217). The doc's hook table never mentions that hold.
- The hook table doesn't list #26 (the trainer-eye fix), #29, #30, #31-#35, or the export at #3.
- **object-code-lookup** (doc line 69) says "as many as the registry has". The code uses fixed ranges
  (`OBJ_CODE_FOLLOWER_BULBASAUR..GENESECT_FORM_4_SHINY`), and the wanderers' walking-Pokémon rows sit after them
  (field_actor_savedata.c:193-204).
- **ambient-grid-collision** is now also the wanderers' collision (field_actor_tool.c:603-607). **ambient-rail-collision**
  is in `RailActor_GetHitBitsDir`, the function at field_actor_rail.c:195-218, and the doc calls it
  `RailActor_CheckCollision`.
- The rest match what I read: the call sites, before or after, and the early returns.

---

## 2. The risky hooks in detail

### 2.1 #1: the event hold (`GameEvent_RunCallback`)

[read] `OnCallback` notifies first, then returns `hold()`. `hold` is `FollowingEffects_IsRecalling` (events.c:213-218),
so it applies to whatever event is on top, its very first step included. A recall that Notify itself started on this
call holds the event right away. `FldActSys_Update` is not held: it runs from the field proc (fieldmap.c:551). NPC move
codes, acmds in progress, the camera, sound, and tasks all keep running.

Concrete failures:
- **The Dell bug** [read and infer]. The follower stands behind the player. A trainer walking toward the player crosses
  the follower's tile, through #8 (CheckAction's sweep) or #13, and that recalls it. The trainer-eye event is then held
  for about 12 ticks before `ForceTrainerDir` stops the trainer, so the distance it measured is stale. #26 fixes this
  one event only.
- **The same pattern in any event whose first steps freeze or measure the world** [infer]. Script events that pause
  actors in their first callback. Talking to a wandering NPC: if the talk's first callback is held, that NPC and others
  keep walking. Scripts that read positions and then queue acmds. Events with timing against sound or the camera. Any
  event that the policy calls unsafe (warps, field moves, items, a wild battle when the follower isn't the lead) recalls
  on its first callback and is then held on that same call.
- **Events chained with `GAMEEVENT_CONTINUE_DIRECT`** [infer] expect to keep going in the same frame. A hold breaks the
  chain at that frame.
- **The hold doesn't depend on why the recall began** [read]. `FollowingEffects_IsRecalling` is also true for recalls
  that `UpdateBefore` starts with no event (REASON_EX_STATE/EVENT/PAIR, field.c:2326-2328). An event that starts during
  that window is held too.

### 2.2 #4: the opcode observer, with #1's policy

[read] Every opcode of every field VM (filtered by `EVCMD_TABLE`, plus a subwork with the bound mmSys) runs `Pause()`.
That sets `sScene.active` even when no `GameEvent` exists. An opcode not in the 376-entry safe list, or the four hack
commands, recalls the follower (scene.c:940-945).

- **"Recalls on area changes only sometimes, in the same spots"** [infer, strong]. `Field_SwapZoneByMatrix`
  (fieldmap.c:1187-1227), on a seamless zone change, runs `FieldScript_CallOnZoneInit` → `FieldScript_Run`, a
  synchronous `VM_Run` loop. Zone-init scripts branch on flags, time and season. Wherever a branch reaches an opcode
  that isn't safe, the follower is recalled at that border on some days or states and not on others. The same swap also
  calls `DeleteAllActors`, which the follower survives through flag 0x20, then `Field_HotswapSpawnActors`. Each new
  NPC passes through #6 and #14. While `sScene.active`, which the zone-init opcodes just set, a spawn on or near the
  follower's tile recalls it. Where the follower stands depends on how the player walked in, which is another source of
  "sometimes" (scene.c:948-977, 1029-1077).
- Cost spikes at zone changes [infer]: hundreds of opcodes × the 48-slot loop, plus `Pause()`, per zone-init.
- This is a "default deny" policy keyed on raw opcode numbers, with a JSON of handler addresses (`event-policy.json`).
  Every new script command or new event type recalls the follower until someone adds it to the list.

### 2.3 #8, #9, #13, #14: actor moves, steps and placements

[read] With no event (`!sScene.active`), every NPC position write whose sweep (`IntersectsActor`, the follower's model
footprint) crosses the follower recalls it (scene.c:1030-1050). The code's own comment says "the special controllers
can ignore the collisions on purpose: they go on, and a write that conflicts recalls".

- **Random recalls on busy Castelia streets** [infer, strong]. The sidewalk crowds (acmds 0x69-0x98) walk without asking
  the collision check. A crowd walker passing through the follower's tile triggers this recall. Crowd respawns that move
  more than 3 tiles are checked at their destination (`IsRelocating`), so a walker that respawns onto the follower
  recalls it too. The footprint is `follower->collisionWidth/Height` (`GetFollowerSpan`, scene.c:550-555). A large
  model's footprint is more than one tile, so it is hit more often. scene.c:739-741 notes the same mistake for
  `IsStepClear`.
- While an event is active, the player's own position writes recall the follower unless they pass the
  `naturalRun`/`IsNearStep` exception (scene.c:1064-1071). That exception exists because a seamless zone change's event
  can end between the poll and the run (scene.c:644-652). It is a race that depends on the order of updates within a
  frame [read the comment; the race is inferred].
- #14 notifies twice per placement (`SetActorWPosAll` → `SetActorWPosValue`) [read].
- #8 and #9: when the observer deletes the actor (the follower moved by a script), `SetNextActorAcmd` is skipped, but
  `FldAct_SetAcmdState(actor, 0)` and the movement flags are **still written to the freed slot**
  (field_actor.c:598-604) [read]. That is harmless only if `InitNewActor` clears the slot later [infer].

### 2.4 #6: allocation

[read] `free == 0` → Recall, and the recall deletes the follower at once, before `GetPtrToFirstFreeActorSlot`. That
works, but the follower is a real `FieldActor` that competes for slots with vanilla NPCs and for uids (0xf0-0xf8, a
range a script could in principle use). A map near the actor cap loses the follower whenever NPCs spawn there.

### 2.5 #11 and #12: NPC collision vetoes

[read] Inside an NPC's move proc, with no event, its step into the follower's tile is blocked. This changes vanilla NPC
wandering and patrol routes. A patrolling trainer whose route crosses the follower stops. [infer] In a corridor one tile
wide, the NPC can't step into the follower, and the follower can't step into the NPC (`FollowingScene_IsStepClear`,
scene.c:795-844). The follower then waits, so its distance from the player grows; this may be part of the follow-distance
complaints. Outside move procs (trainer sight, `event_trainer_eye.c:559-568`) the follower is invisible to collision,
thanks to its 0x80 flag (follower flags at field.c:2396; the ignore mask at field_actor_tool.c:578-582). That is correct.

### 2.6 #17 and #23: per-frame cost and stutter

- [read] Each frame: `FollowingScene_Poll` → InspectChain while an event runs, which repeats the work of #1's
  InspectChain on the same frame. Then `SelectFollower` every 30 ticks, which makes several `PokeParty_GetParam` calls,
  each of which decrypts. Then `IsStepClear`, which loops over all actors. Then `FollowingEffects_Prepare`, which calls
  `GFL_HeapGetFreeSize` every frame before its early return (effects.c:624). [infer] That free-size call walks the
  heap's free list. When the sheet changes, `GFL_G3DSysReadArcToolResource` does a synchronous file read inside the
  field frame (effects.c:637). That is a likely frame drop when the follower appears or changes.
- [read] #23 drops D-pad input for the whole recall. [infer] A recall that a crowd NPC triggers (2.3) therefore freezes
  the player for about 12 ticks. That could be part of what the user reports as "frame drops": the player stops and
  starts with a brake.

### 2.7 #7: `DeleteActor` early return

[read] The original is skipped only when the subject was in use before the notify and isn't after it. In practice that
is only the follower, deleted by the observer's own recall. Low risk. The re-entrancy guard `sBridge.notifying`
silences the notify of the inner `DeleteActor` that the recall calls.

### 2.8 Re-entrancy (#1, #3, #8, #13)

[infer] The recall runs `Cleanup` (field.c:1499-1522), which runs `FollowingTalk_Cancel`, which can free an event (#3),
and `DeleteActor`. It does this **inside** vanilla code that is halfway through its own work: inside
`GameEvent_RunCallback`, `VM_Run`, `FldAct_SetAcmd`, `SetActorWPosValue`, and allocation. Observe guards one case (the
talk's own event, scene.c:1010). Any other path where the freed event or actor is the one the caller holds would be a
use-after-free. I found no such path in what I read, but the design can't rule one out.

### 2.9 #20: draw-time changes

[read] `material->faceHeight` of the field scene's material is changed for the draw and put back after
(render.c:568, 746, 838-842). This is guarded by `IsMaterialShared`. A wanderer that uses a follower code shares the
follower's sprite resources [infer], so that guard is what keeps it correct. [infer] The Y lift
(`spriteY - wPosOffsetY + FOLLOWING_SPRITE_LIFT`, render.c:795) moves the sprite up and down on screen, which is the
axis of up/down walking. If the lift is wrong, the gap looks different walking north than south. The cause is more
likely the directional gaps (`GetWalkGaps`, field.c:510), which are outside this review's scope.

---

## 3. What a rewrite could drop or replace

**Drop:**
- **#1's hold.** It is the most dangerous hook. A recall should be visual only (the ball and silhouette drawn over a
  follower that is already hidden) and should never stop the game's events. Without the hold, #26 can go back to
  vanilla.
- **#4 and #5 (opcode observation)** and **#2, plus most of #35 (event tracking).** Replace them with polling in the
  per-frame hook. Read `gsys->event` and its parents' callbacks once a frame, and freeze the follower in place for a
  short allow-list (menu, Yes/No, message, cry, camera wait, battle start), hiding it at once for anything else. No
  default-deny on opcodes, no VM or event token tables, no per-opcode cost.
- **#13, #14, #6 and #7 (position, step, allocation and delete observers).** Replace them with one pass over the actors
  per frame, run after `FldActSys_Update`. If an NPC now overlaps the follower, the follower steps aside or waits; it
  doesn't recall. A recall belongs only to scripted moves. Detect deletion by checking ownership each frame
  (`IsOwned()` already does this).
- **#23 (the input gate).** A recall should never hold the player.
- **#8 and #9** can drop to "observe only, scripted moves only": recall the follower (hide at once) if a script queues
  a move whose path enters its tile. They could also go if the follower simply hides at the start of any script that
  isn't on the allow-list.

**Replace with something less invasive:**
- **The follower as a `FieldActor`.** Consider a follower that **isn't in the actor heap**: its own `BillboardActor`
  plus shadow and grass, which the runtime already half-builds through #31 and #32. That removes the competition for
  slots and uids, the `DeleteAllActors` and script interactions, and vanilla collision with it. If it stays a
  `FieldActor`, vanilla already has the flag for "blocks NPCs, not the player": collision ignores 0x8000 only for the
  player (field_actor_tool.c:578-582). Setting 0x8000 without 0x80 would make NPC move codes avoid the follower with
  **no collision hooks**. The catch is trainer sight, `ActorRouteCollCheck` in event_trainer_eye.c:559-568, which would
  then see the follower as an obstacle; that needs testing or a one-line exception. If that fails, keep #10, #11 and #12
  as they are: they are cheap and scoped.
- **#20 and #21 (draw replacements).** If the follower's config offsets and lights are set on the actor, or on its own
  billboard, the engine draws it, and the strip and grass passes are optional extras. Keep at most one draw call after
  `BillboardActorSys_Draw` for the ball, flash and emotes (#22). Vanilla's emotion bubbles are field effects too.

**The minimum set a follower truly needs:**
1. **Per-frame update** (#17), placed after `FldActSys_Update` rather than wrapping it.
2. **Map lifecycle**: the preload (#18) and the unload (#19).
3. **One draw hook** for its effects (#22), plus #20 only if it isn't an engine-drawn actor.
4. **Graphics data**: the object-code rows (#16) and the 32-bit descriptor offset (#15). Alternatively, lay the data
   out so that neither is needed.
5. **Talking to it**: the event providers (#24, #25).
6. **Battle opening** (#27), for the "already out" intro. Better: check that a vanilla step was reached, not jump to
   fixed seq numbers.
7. **Options and save**: #28 and #29. **Pokémon data**: #30, only while the record lives in `UNK72/76`.
8. **Optional**, only if NPCs must avoid it: #10 + #11 + #12, or the 0x8000-flag approach.

That is about 8 hooks, all observe-only or on rare paths, against today's 35. It drops every hook that can veto or
delay a vanilla event, or that runs inside vanilla code halfway through its work.
