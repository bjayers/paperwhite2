# Following Pokémon: movement, drawing and per-frame cost (review for the rewrite)

Scope: `src/paperwhite2/ov036/paperwhite2_following_{field,trail,positioning,render,render_math,ambient,data}.c`,
`include/paperwhite2/following*.h`, `docs/paperwhite2/following-pokemon.md`, and the game's partner code
(`src/ov036/field_actor_movecode_pair.c`, `src/ov012/pair_sys.c`, `src/ov036/scrcmd_field_actor.c`,
`src/ov012/event_save.c`, `src/ov036/entrance_camera.c`, `src/ov012/field_actor_tool.c`).

Per the user's correction, the old Pokeweb symptoms (frame drops, overlap, up/down distance, line flicker, Castelia
recalls) aren't explained again. This report covers what is still risky or costly, which fixes cover a deeper design
problem, and whether the game's own partner movement would do the job.

**Read** means I read the code at that line. **Inferred** means reasoning I haven't checked in a build or emulator.

---

## 1. How the current follower works (read)

- **It's a real field actor with a fake move code.** `CreateNewActorByParam` gives it a follower object code. Its
  move vtable is then swapped for `sMoveCode = {0, Noop, Move, Removed, Noop}` (field.c:146, 2378-2385). It gets the
  flags HIDDEN | NOT_BLOCKING (0x80|0x100|0x8000) | NOT_QUERIED | KEEP_ZONE, plus attr-effect-off and landing-dust-off
  (field.c:2380-2384; flag meanings in following_field.h:17-35).
- **It doesn't step on tiles.** Every frame, `Move` (field.c:1296-1489) samples the player's world position, including
  `wPosOffset.y + outerDrawOffset.y` (field.c:436-448). It pushes that sample into a 64-entry ring
  (`FollowingTrail_PushDirectional`, trail.c:418-492) and writes the follower's `wPos` directly to the point one
  "metric tile" back along the trail. Its grid position is then made up from the world position
  (`SetGrid`, field.c:359-364, which also sets `initGPos = gPos`).
- **The trail metric** (`TrailDistance`, trail.c:193-201) is horizontal only (x, z). It's weighted per direction by
  the positioning row's gaps: 16 + gap world units count as one tile. Y comes only from the samples themselves.
- **One trail serves grids and rails.** Every sample is kind WORLD with rail 0 (field.c:442-446). Rails differ only in
  the swap (`BeginRailSwap`/`DriveRailSwap`, field.c:794-935) and the summon probes (`RailActor_GetHitBitsDirNoAttr`,
  field.c:1129).
- **Collision:**
  - The follower blocks nothing. Before each new pose, `FollowingScene_IsStepClear` (scene.c:795-845) loops over
    every actor in the system. For rail actors it also predicts the next rail position
    (`RailUnit_PredictNextPos`, scene.c:831-835). An NPC on the target sends the follower back into its ball
    (field.c:1466-1474).
  - NPCs are kept off the follower by hooks into the game's own checks (`CheckActorNewPosOtherActorCollision`,
    field_actor_tool.c:602-607; `RailActor_CheckCollision`, field_actor_rail.c:211-218).
- **Seamless connections:** `RebaseConnection` (field.c:366-434) guesses whether a zone change came with a coordinate
  jump of more than a tile. If so, it translates the whole trail and the actor using 64-bit sums.
- **Drawing:**
  - The follower uses the game's actor billboard. `PaperWhite2_FollowingDraw` replaces the field's
    `BillboardActorSys_Draw` of the actor scene (fieldmap.c:1453-1460).
  - Just before that submit, `FollowingRender_Draw` (render.c:753-857) edits the follower's quad in the shared scene:
    the Y offset from the registry plus `FOLLOWING_SPRITE_LIFT` -2, and the light mask. Near a wall it also changes
    the quad's face, its scaleY and the *shared material's* `faceHeight`, and adds strips.
  - After the submit it puts everything back, then draws a private strip scene (`BillboardActorScene_Draw`,
    render.c:854-856).
  - The grass pass (render.c:174-257) and the effects pass (field.c:2589-2598) work the same way.

## 2. What is still risky or costly in the current code

### 2a. Design problems that the fixes cover over

1. **The actor is off-grid, so the game's own systems were cut out and rewritten.** `Move` keeps out of the movement
   dispatch: "on a grid follower it reads the absent rail work and freezes the game" (field.c:1486-1488). Because of
   that, the code rewrites by hand:
   - the tile effects: splash, grass, shade (`UpdateTerrain`, field.c:2467-2525);
   - the shadow (`PaperWhite2_FldActEnsureShadow`, field.c:2545-2551; the shadow-flag logic at
     following_field.h:25-35);
   - collision both ways (scene.c:795-845 plus the two hooks above);
   - the movement flags (`FOLLOWING_ACTOR_MOVEMENT_UNREAD` cleared in `BindPose`, field.c:478-486).

   Any game system that reads `gPos`/`initGPos` (scripts, trainer sight, NPC collision) sees a tile number truncated
   from a position that moves every frame, and `initGPos` is always equal to `gPos` (field.c:360). The new hook
   noted in STATUS.md (Dell walking onto the player while the follower recalls) is the same kind of interaction.
2. **The scene policy exists because the follower is invisible to the game's event code.** Vanilla scripts already
   know a following actor. They stop every actor but let the partner (`MOVE_CODE_FOLLOW_PLAYER`) finish its step
   (scrcmd_field_actor.c:647-700, event_save.c:78-120), and they can address it as actor 0xf2
   (scrcmd_field_actor.c:101-102, event_action_call.c:105-106).

   The hack's follower isn't that actor. So the 1,224-line `paperwhite2_following_scene.c` plus hooks in `vm.c`,
   `game_event.c` and `field_actor.c` (allocate, delete, acmd and step hooks: field_actor.c:269, 349, 596, 611, 968,
   1154, 1734) decide when to recall it.
3. **The follower stands on its own pose, so features that come free on a grid had to be written separately**, each
   with its own state:
   - the swap (mirror, then ease: field.c:706-988);
   - the side stand (field.c:1009-1089);
   - the summon placement (field.c:1099-1294);
   - the gap ramp (field.c:651-676);
   - the cover cache (field.c:551-627).

   That's about 40 static state variables (field.c:150-261), all of which have to be reset correctly on each
   transition (`ClearSwap`, `ClearEase`, `DropSettled`, `ClearRestore`...).
4. **The lowered sprite causes the counter clipping, and `SplitSmallBody` works around it.** The docs say plainly that
   a native 32-pixel sprite clears the Pokémon Center counter, and the follower clips only because it is drawn lower
   (`FOLLOWING_SPRITE_LIFT` and the art's down frames; following-pokemon.md "Small followers in front of counters",
   render.c:47-53, 83-95). The lift is applied to the quad alone because the actor table's offset also moves the oval.
   - *Inferred, not tested:* `FieldActor.outerDrawOffset` is added to the body's drawn position but not to the
     oval's (following-pokemon.md "The oval over the feet"). For an NPC only the Surf Pokémon and boulders write it
     (fldeff_surf_pokemon.c:355, field_player_grid_event.c:288). So it could carry the registry Y and the lift with
     no quad editing at draw time.
   - Fixing the art's baseline would remove the reason for the small split altogether.
5. **The draw edits shared state in place.** `FollowingRender_Draw` writes the field's quad and the shared material's
   `faceHeight`, and relies on putting them back after `BillboardActorSys_Draw` (render.c:820-849). Guards like
   `IsMaterialShared` (render.c:450-461, a loop over every quad) exist only because of this.
6. **The grass pass guesses at memory.** It walks every billboard handle (up to 256) and treats each handle's
   `callbackData` as a grass task whenever the pointer falls in a main-RAM range (`IsTaskWork`, render.c:158-168,
   174-245). That's a guess at the type of foreign memory. It's guarded, but fragile.
7. **The connection rebase relies on a guess.** It infers a "seamless connection jump" from distance alone
   (field.c:346-357, 366-434). The game keeps a KEEP_ZONE actor across zones itself (pair_sys.c:44 `SetActorFlag32`
   = 0x20, field_actor.c:1413-1418), so I don't know if the rebase ever fires. Unverified.
8. **The line-flicker fix busy-waits.** The fix was `WaitVramWindow`, which spins on VCOUNT until lines 193-204
   before every texture upload (effects.c:200-219, called at 531, 576, 675, 1162). Each wait can last most of a frame,
   so every switch by L/R, new sheet, ball change and emote start costs a hitch by design. It is backed up by
   preloading at map spawn (field.c:1892-1930) and by delaying `Prepare` until after the body's first frame
   (field.c:2552-2563).

   The game's own path is the VBlank task `FldActSys_AsyncMatLoadTCBFunc` (fieldmap.c:313, 1065), which the comment
   at effects.c:204 itself names.

### 2b. Per-frame CPU (read; cycle counts are estimates)

- **Software 64-bit long division instead of the DS hardware divider.** These are 64-iteration bit loops:
  `ScaleStep` (trail.c:264-291), `MulDiv` (trail.c:518-551), `DivS64` (trail.c:636), `Divide` (render_math.c:19-41).
  - Each push calls `ScaleStep` 3 times plus a 64-bit `SquareRoot` (trail.c:164-188, 465-490).
  - `FollowingRender_Basis` (render_math.c:721-750) runs on every draw from `SplitSmallBody`. It costs about 10
    `Divide`s and 2 square roots (`ViewAxis` → `Axis`, render_math.c:100-122, 307-309).
  - Near a wall, `SplitSmallBody` calls `FollowingRender_Strips` 3 times, and each call recomputes `Basis`
    (render_math.c:813). That's about 40-50 software divisions, plus the s64 `ScreenOverlap` sums.
  - My estimate: about 1% of an ARM9 frame normally, several percent in front of walls. It's not dominant, but it is
    all avoidable: compute the basis once per frame, or use `FX_Div`/`CP_SetDiv64_32`.
- **O(actors) loops every moving frame:**
  - `FollowingScene_IsStepClear`, with rail prediction for every live rail NPC (scene.c:805-845). This is the
    heaviest movement cost on crowded rail maps (Castelia).
  - The free-actor and uid scans happen only while the actor is missing (field.c:2348-2370).
  - The grass handle walk runs every frame (render.c:197).
  - `IsMaterialShared` runs near walls.
- **Trail work every moving frame:**
  - the push and trim loop;
  - `Following_SwapMatch` → `IsAheadOrigin`, a loop over the trail (trail.c:559-634), whenever a settled pose exists;
  - `FollowingTrail_Remeasure` over all 64 samples on each gap-ramp step (trail.c:404-416, field.c:675);
  - `FollowingTrail_HeightAt` and `MetricToPoint` (trail.c:931-996, 1228-1282) only during swaps and eases.
- **Spikes on each tile step, from the ambient code:** `FollowingParty_Find` (5 `PokeParty_GetParam` per member,
  data.c:29-47), `FollowingRecord_AddStep` (a read and a write of the encrypted Pokémon data, data.c:73-84), the
  dialogue context and a conditions evaluation (ambient.c:150-171). That's every 8 frames walking and every 4
  running. *Inferred:* the main cost per step, after the VRAM waits.
- **Cached and cheap:** terrain per tile (field.c:2492-2497), the under-floor cover per tile (field.c:607-610), the
  wall-behind check per tile (render.c:375-378), the registry load once per field, and the party re-selection every
  30 ticks (field.c:2280).

## 3. The game's partner movement (read)

`MOVE_CODE_FOLLOW_PLAYER` = `{FieldActorMove_InitLookPlayer, MoveLookPlayer, DeleteLookPlayer}`
(field_actor_movedata.c:257-259, field_actor_movecode_pair.c:155-283):

- **Each frame:** if the player's `gPos` has changed since last saved (`HasPlayerMoved`, :218-230), it saves the new
  `gPos` and starts a step from the actor's tile toward the player's `initGPos` (the tile the player just left)
  (`StepToPlayerInitGrid`, :257-275). It then waits for that acmd to end (`LookPlayerWaitStep`, :193-199).
- **The step copies the player's own acmd**, with dash → `WALK_4F` and dash-uphill → `WALK_UPHILL_4F`
  (`GetPlayerCopyAcmd`, :232-255). So walk and run speeds match the player's, and stairs and slopes use the acmd's
  own height reads like any NPC.
- **No collision check:** `StartDirAcmd` is forced onto the tile the player just walked through.
- **Lifecycle** (pair_sys.c):
  - The script command `ActorPairSet` turns an existing NPC into the partner (`ChangeActorMoveCodeSeq`, uid 0xfe,
    KEEP_ZONE; :112-135).
  - A warp re-creates it one tile behind the player, or hidden and then put on the player's `initGPos`
    (`TryRespawnFollowActor`, `updateFollowerModel`, :14-74). The entrance code calls this (entrance_camera.c:417-420).
  - Fly, Escape Rope, Teleport and blackout end it (event_mapchange.c:588-589, 1388).
- **Event integration** (read): the field's script commands and the save event let it finish its step before they
  freeze it (scrcmd_field_actor.c:647-700, event_save.c:78-120). Scripts can address it as 0xf2.
- **Player passing through:** the player's collision ignores actors with flag 0x8000, NPCs' only 0x80
  (field_actor_tool.c:578-582). Setting only 0x8000 makes the follower passable for the player but solid for NPCs,
  natively, with no hooks.
- **No rail version exists.** Every rail move code is wait, walk or patrol (generated/move_codes.txt:89-105,
  field_actor_rail.c:390-700), and the partner code works on grid `gPos` only.
- **No map data uses it.** No `res/` event sets `MOVE_CODE_FOLLOW_PLAYER`; only the pair script command does.

## 4. Could a follower built on it deliver the features? (inferred unless cited)

**What it gives for free:**

- grid following one step behind, at the player's walk and run speed;
- heights, stairs and slopes through the acmds' map-height reads;
- grass, splash, shade, shadow, reflections and footprints through the normal actor attribute pass, with no
  `UpdateTerrain` or `EnsureShadow` copies;
- native NPC collision (leave 0x80 clear and set 0x8000);
- a natural swap when the player steps back: the player's `initGPos` becomes the follower's tile and the follower
  steps into the player's old one, so they cross in one step;
- event freezes after the current step, warp re-creation, and KEEP_ZONE across connections;
- the game's billboard, animation and async material loading. The hack's sprites already work as NPCs: the docs'
  step 3 test gives an NPC `OBJ_CODE_FOLLOWER_PIKACHU`, and both 32- and 64-pixel billboards exist natively
  (`ACTOR_BILLBOARD_SIZE_64`).

**It would drop:**

- the continuous sub-tile spacing and the per-species directional and side gaps from the positioning table (the
  follower sits exactly one tile, 16 units, behind);
- the mirrored swap with its ease, and the side-by-side stand;
- fine pose control for large sprites. A 64-pixel body one tile behind overlaps the player on screen; the docs give
  that as the reason for `FOLLOWING_LARGE_GAP_BONUS`, following.h:32-34.

**It would need new code:**

1. **Its own move-code ID** (a clone of the vtable) with checks added at the three 0xf2 / finish-step sites. Reusing
   `MOVE_CODE_FOLLOW_PLAYER` itself would clash with story partners: `FindActorByMoveCode` returns the first match
   (field_actor.c:1634-1643), and in the frame between `ActorPairSet` and the `REASON_PAIR` recall
   (field.c:2271-2273) both could exist.
2. **A short history of (tile, acmd)** instead of copying the player's acmd at that moment. Ledge jumps (`ACMD_JUMP_2`,
   field_acmd.h:33) and diagonal-free corners need the follower to replay the action that left each tile, one tile
   later. Copied directly, a jump started one tile behind lands on the player (inferred).
3. **A guard for not being adjacent.** Forced acmds go through walls, so when the follower isn't next to the player's
   `initGPos` (after a recall, a cutscene move or a summon), place it with the existing summon probe
   (`IsTileOpen`/`ActorRouteCollCheck*`, field.c:1099-1123) or hide it.
4. **Rail maps: a new rail move code.** It would keep a short ring of the player's `RailPosition`s
   (`RailActor_GetNowLocation`) and step with `RailActor_SetMoveRequest(dir, speed)` (field_actor_rail.c:169, 184-189)
   toward the previous knot. It would also need to handle the player switching between grid and rail. This is the
   biggest new piece, and the actor must be created as a rail actor on rail maps.
5. **Large sprites:** either follow two steps back (the same history), or push the quad back with
   `outerDrawOffset`/the table offset. The ball-under-floor and indoor rules stay as logic on top: hide the actor and
   show the ball effect.
6. **Bike and Surf:** the current code recalls on `FieldPlayer_GetExState` (field.c:2264-2266), and that can stay. If
   cycling should be followed, check which acmds the bike uses before copying them.
7. **Summon, cycle by L/R, talk, emotes and the ball effects** carry over, but anchored to a normal actor. The talk
   could even use the actor's own script id (pair_sys.c:43 `SetActorSCRID`).

**Verdict (inferred):** for grid maps, a native-movecode follower would remove most of `paperwhite2_following_trail.c`,
the swap, ease, cover and rebase state in `paperwhite2_following_field.c`, the terrain and shadow rewrites, and the
collision hooks. It would also cut most of the scene policy's reason to exist. The per-frame cost drops to one
`gPos` comparison and the actor's own acmd.

The price is losing tunable sub-tile gaps (set by tile only, plus a draw offset) and writing a rail follower from
scratch. Rendering can stay entirely native if the sprite baseline is fixed in the art and the registry offset goes
through `outerDrawOffset` or the table offset; the wall strips become optional polish. None of this has been built
or tried in game.
