# Following Pokémon: feature specification for the rewrite

Read from the source as of `4a274a02fa` (main, 2026-11-05). Every item is a behavior the current runtime has, with
the evidence for it. Paths are from `/home/riku/paperwhite2`. Abbreviations: `field.c` =
`src/paperwhite2/ov036/paperwhite2_following_field.c`, `scene.c`, `effects.c`, `interaction.c`, `dialogue.c`,
`ambient.c`, `data.c`, `reactions.c`, `render.c`, `trail.c` = the `paperwhite2_following_*.c` of the same name in
`src/paperwhite2/ov036/`; `events.c` = `src/paperwhite2/ov012/paperwhite2_following_events.c`; `resident.c` =
`src/paperwhite2/main/paperwhite2_following_resident.c`; `options.c` =
`src/paperwhite2/ov140/paperwhite2_following_options.c`; the doc = `docs/paperwhite2/following-pokemon.md`.

Each checkbox is meant to be tested in game. **[KEEP]** marks behavior the user has asked for or accepted. **[ISSUE]**
marks known problems the rewrite should fix or at least not make worse. **[DECIDE]** marks things that look like
accidents of the port rather than design and need the user's decision.

Note: the doc's "What remains" still says "Nothing has been tested in an emulator yet". That is stale: STATUS.md records
three rounds of melonDS tests and real-hardware tests (doc sections "Fixes after the first/second melonDS test",
"Small followers in front of counters", STATUS 2026-11-05).

---

## 1. Who follows, and what it looks like

### 1.1 Choosing the party member
- [ ] The follower is the **first party member that is healthy (HP > 0) and not an Egg**; if none is healthy, the first
  non-Egg (a fainted one follows). Species 1 to 649 only. `trail.c:9-32` (`CanFollow`, `FollowingParty_SelectSlot`).
- [ ] The choice is re-checked when there's no actor, every 30 field ticks, and the frame an event ends
  (`FOLLOWING_SCENE_REFRESH`) (`field.c:2288-2311`). A changed lead (party reorder, a faint, an evolution, a form
  change) swaps the follower to the new one within half a second.
- [ ] Identity is PID + trainer ID + species + form + gender + shininess (`trail.c:72-75`), so an evolution or form
  change counts as a new follower.
- [ ] **L / R** switches to the next / previous eligible party member (wrapping, skipping Eggs; healthy ones preferred
  while any is healthy) without reordering the party (`trail.c:34-70`, `field.c:1932-2044`). L and R together do
  nothing (`field.c:1951-1954`). Allowed only while the follower is out and walking, with no talk or effect running and
  the ball effects loaded (`field.c:1955-1975`).
- [ ] With nobody else to switch to, or every candidate refused: the **refused cue** (closed ball shakes a pixel either
  way for 12 of 30 frames, `SEQ_SE_BEEP`) (`field.c:2022-2024`, `effects.c:785-793`, `CUE_TICKS`/`CUE_SHAKE` at
  `effects.c:50-51`).
- [ ] A manual L/R choice stays while that Pokémon can still follow (in the party, not an Egg, not fainted unless the
  lead is fainted too) (`field.c:1828-1849`), and survives map changes within a session (`field.c:2176-2204`). It is
  **not saved**: after a reset the lead follows again. [DECIDE] whether that should persist.

### 1.2 Sprites and sizes (the registry)
- [ ] 2,574 follower field actors, object codes `OBJ_CODE_FOLLOWER_<SPECIES>[_FORM_n][_FEMALE][_SHINY]` from 0x3000,
  table rows from 1,008 (`src/system/field_actor_savedata.c:193-203` `GetIndexOfObjID`; `src/ov012/field_actor.c`
  `GetNPCMdlInfoForOBJCODE` keeps the 32-bit offset, doc line 70). Data: `res/field/actors/followers/<name>/data.json`
  (+ `sprite.png` for the 348 with their own art; the rest name another code's `"sprite"`). 2,490 are 32-pixel
  (`billboard_size` 0), 84 are 64-pixel (`billboard_size` 2); 983 rows are placeholders; animation profile
  `mirrored` (1,406) or `asymmetric` (1,168); all 649 species covered.
- [ ] Row choice for a Pokémon = best score over its species' rows: form match +8 (form 0 row 0, other −20), sex match
  +4 (sex-less row +2, mismatch −20), shiny match +1 (mismatch −20) (`field.c:1642-1688` `FindFollowerRow`). A species
  without rows doesn't follow.
- [ ] Per-row settings read from the registry: sprite Y offset (`spriteY`), art X offset, side gap 0–6
  (`field.c:1709-1766` `GetFollowerCode`). Walking gap = min(side gap + 6, 10 − |art X|), capped 12, **then replaced by
  the positioning row's largest of its four gaps for all four directions** (`field.c:1745-1763`). [DECIDE] the
  per-direction gaps in `data.json` `follower.gaps` are effectively uniform at runtime.
- [ ] 64-pixel followers keep 8 extra units of gap on every side (`FOLLOWING_LARGE_GAP_BONUS`, `following.h:31-34`,
  `field.c:510-521`).
- [ ] Unown and Arceus followers show their own form (STATUS 2026-10-31; the forced forms are gone).
- [ ] The registry is also used by the **wanderers** (wild Pokémon in grass) for their sprites:
  `PaperWhite2_FollowingCodeFor` (`field.c:1690-1705`, used at `src/paperwhite2/ov036/paperwhite2_wanderers.c:521`).
  The rewrite must keep that API (or give wanderers their own lookup).
- [ ] [ISSUE] Shiny placeholder rows (e.g. Swinub, Wurmple, Silcoon) show the non-shiny art; the user chose to leave
  them for shared shiny palettes (STATUS 2026-11-03, design/shiny-palettes.md 1.3).

**Data formats:** `a/0/4/7` (`ARCID_MMODEL_TBL`) member 1 = registry "FWDB" v3 (32-byte header, 24-byte rows sorted by
`species*2048 + form*8 + sex*2 + shiny`), member 2 = positioning "FWPO" v1 (12-byte rows: four gaps + 8 rider bytes),
both packed by `tools/paperwhite2/following_data.py` from the `follower` objects (doc lines 296-298, 374-397). Read
in 1 KB pages through the field actors' open archive handle (`field.c:1574-1638`, `following_registry.h:12`), with a
per-species index (`sIndex`, `field.c:234`). The registry's CRC is checked against the positioning table's copy.

### 1.3 Drawing
- [ ] Drawn 2 units lower than an NPC (`FOLLOWING_SPRITE_LIFT -2`, `render.c:54`) plus the row's sprite Y; stands on
  the ground (commits `635731a602`, `e827b08ada`). [KEEP]
- [ ] The engine's own shadow oval under it (`field.c:2551-2555`, `PaperWhite2_FldActEnsureShadow`); Pokeweb's shadow
  pass and the pull over the oval are gone (doc 654-681). [ISSUE] In W-buffered rooms (every Pokémon Center, camera
  setup 3) the oval can show over the lowest rows of some sheets; the user chose to leave it (STATUS "Later").
- [ ] Shade: on a tile with the shade flag the follower takes light 3 like other actors, else light 0
  (`field.c:2508`, `render.h` `FOLLOWING_LIGHTS_*`).
- [ ] 64-pixel body in front of a wall up to 4 tiles behind: drawn as 7 strips of 8 rows moved toward the camera so it
  isn't cut by the wall (`render.c:63-87`, doc 405-408).
- [ ] 32-pixel body with a non-walkable tile right behind it (counters, PC): bottom 8 rows stay, 3 strips of 8 above
  move toward the camera up to the wall line; strips never draw over the player (stay ≥1 unit behind the player's quad
  where they overlap on screen) [KEEP the user's rule: never move the player] (`render.c:100-105`, doc 690-754).
  [ISSUE] the user still sees an occasional clip at the Center counter (STATUS "Later (polish)").
- [ ] Grass on its tile and the player's covers their feet (wild-effects pass) (`render.c` `FollowingRender_GrassDraw`,
  hook `src/ov036/fieldmap.c:1457`).
- [ ] The walk animation pauses (holds its last pose) while talking, while an event holds it, and during effects
  (`trail.c:81-83`, `field.c:1309-1316`).
- [ ] The first frame its body appears, and on any hidden→shown change, the sheet bind waits for the VBlank-safe window
  so no line tears on hardware (`effects.c:200-221` `WaitVramWindow`, doc 541-546). [ISSUE/perf] this busy-waits on
  VCOUNT (up to 0x100000 spins) on the main thread.

---

## 2. Movement in the field

### 2.1 Walking behind
- [ ] The follower is a field actor (uids 0xF0–0xF8, the first free; needs 2 free actor slots and 32 KB of field heap
  free) (`field.c:54-61`, `2354-2404`). It doesn't block the player or NPCs and no query sees it
  (`FOLLOWING_ACTOR_FLAG_NOT_BLOCKING|NOT_QUERIED|KEEP_ZONE`, `following_field.h`; `field.c:2396-2399`).
- [ ] It walks the player's recorded trail (64 samples), one tile of trail distance behind the player plus its gap
  (`following.h:9-12`, `trail.c` `FollowingTrail_PushDirectional`). Running and walking keep the same distance (the
  distance is measured, not frames) (`following.h:37-41`).
- [ ] Stairs, slopes and ledges: it follows the heights recorded by the trail (`FOLLOWING_MOVEMENT_LEDGE`); an eased
  pose that would jump more than a tile in height snaps to the trail instead (`field.c:1404-1418`).
- [ ] Rails (Skyarrow Bridge, Driftveil Drawbridge): follows along the rail (`FOLLOWING_MOVEMENT_RAIL`), swap and talk
  work on rails (doc 441-443).
- [ ] Seamless zone changes (map connections): the trail is translated by the connection's offset, so the follower
  doesn't vanish crossing a border (`field.c:368-435` `RebaseConnection`, `trail.c` `FollowingTrail_Translate`). A
  trail break or a full trail hides it and it walks in again (`field.c:1345-1354`).
- [ ] Grass: shakes the grass on each new tile it enters (`field.c:2521-2524`); shallow water / puddles: the splash
  effect follows it (`field.c:2515-2520`). Flying-type followers get neither (`field.c:2482`, `sFlying`, set at
  `field.c:1863`).
- [ ] The trail and the follower's tile type (`PaperWhite2_FollowingGetTile`, `field.c:2739-2744`) feed the conditions
  engine's "terrain under the follower" (`src/paperwhite2/ov036/paperwhite2_conditions_field.c:50-52`) and the debug
  readout.

### 2.2 The swap
- [ ] Stepping back onto the follower's tile: they swap places, the follower walking a mirrored chord back toward the
  player's old tile, then easing out to its normal gap over 2 tiles of travel (`field.c:727-990`, `following.h:37-41`,
  `trail.c` `Following_SwapMatch`/`SwapMirror`). Also on rails (`DriveRailSwap`, `BeginRailSwap`). A resting ball swaps
  too (`field.c:~950`).

### 2.3 HeartGold's side-by-side stand (Easter egg) [KEEP]
- [ ] 32-pixel only: walk down, step one tile left/right, then turn to face down in place → the follower steps onto
  the corner and stands beside the player facing down, until the trail passes that corner (`field.c:986-1090`
  `StepBeside`/`HoldBeside`, comment at field.c ~986-990).

### 2.4 Large followers in buildings, caves and under floors
- [ ] A 64-pixel follower is **kept in its ball** wherever the area isn't flagged exterior (buildings, and any interior
  area such as caves) (`field.c:535-549` `IsLargeBarredAt`), and **under a walkable floor** 1.5–3.5 tiles over its feet
  (bridges, upper walkways), checked at its tile and one tile either way along the line to the player
  (`field.c:551-626`). It goes back in a tile before it walks under and comes out a tile after; it waits 20 updates
  after leaving cover so it doesn't flicker (`COVER_CLEAR`, `field.c:676-700`).
- [ ] While kept, a **closed resting ball** sits on the trail where it would stand, hopping as it moves (8 hop steps,
  10-frame bounce), its gap ramping to 0 at 2 units an update and back at 1 (`field.c:633-674`,
  `effects.c:120-131`, `795-845`). NPCs walk around the ball (`scene.c:755-763`). An NPC stepping onto the ball's spot
  takes it back in with the ball's sound and the trail restarts (`field.c:1434-1448`).
- [ ] L/R where large followers are barred: brings out a small one, or the **lead** as its ball (one bounce,
  `FollowingEffects_RestBounce`); a large non-lead is skipped/refused with the cue. Under a floor L/R are locked (cue)
  (`field.c:1959-2007`, `2405-2445`).
- [ ] [ISSUE] the zone overrides of Pokeweb's positioning member 1 aren't ported (none existed) (`field.c:535-537`).

### 2.5 NPCs and the follower
- [ ] NPCs' own wandering movement doesn't walk into the follower or its resting ball, on grids and rails
  (`scene.c:765-781`; hooks `src/ov012/field_actor_tool.c:607`, `src/ov036/field_actor_rail.c:215`,
  `src/ov012/field_actor.c:968-974`).
- [ ] If an NPC or the player is standing on (or stepping onto) the follower's next trail tile, the follower is
  recalled into its ball and walks in again later (`field.c:1458-1470`, `scene.c:795-844` `IsStepClear`).
- [ ] Outside events, an NPC moved onto the follower by special movement controllers recalls it (`scene.c:1029-1050`).
- [ ] Castelia crowds (sidewalk wall walks) don't trigger recalls unless they really enter its tile
  (`scene.c:493-509`, doc 525-526).

---

## 3. Ball effects (send-out, recall, cue)

All in `effects.c`; assets in `a/0/4/7` members 20-23 (HeartGold's ball BMD0, send-out flash BMD0 + BTA0; ball art
for ball IDs 1–25, 16×16 4bpp + 16 colors, from `res/paperwhite2/following/effects/` and `balls/*.png`)
(`following_effects.h`, doc 300-302).

- [ ] **Send-out** (12 frames): 4 frames of the closed ball, then the ball's sound (`SEQ_SE_BOWA2`) and flash while a
  white/cyan silhouette of the sprite grows out of the ball through 5 sizes, then 3 frames of the silhouette at the
  standing pose; the body shows on the next frame with the same pixels (`effects.c:40-48`, `761-773`, doc 646-652).
- [ ] **Recall** (12 frames): 3 frames of the silhouette exactly over the body's last drawn quad (whole draw offset,
  mid-step too), 5 shrinking from body to ball (3440→768/4096), 4 of the ball; the ball sits 6 units in front of the
  follower's ground (`effects.c:40-55`, `774-783`, `891-936`, doc 626-644). Silhouette colors: the flash palette's
  `GX_RGB(19,28,31)` and white (`effects.c:35-38`).
- [ ] The follower's **own ball type** (`PKM_PARAM_POKEBALL`; any ID without art shows the Poké Ball)
  (`field.c:2128-2162` `SyncBall`, `effects.c:102-118`, `468-541`). A recall already running keeps its old ball.
- [ ] The ball is **lit like the body** (white by day, (21,21,28) at night), not by HeartGold's ambient-only material
  (`effects.c:937-1015` `LightBall`, doc 619-624).
- [ ] While a recall plays (not the resting ball's), the player's D-pad is held (`field.c:1528-1531`, hook
  `src/ov036/field_player.c:157`), and **every game event waits** until it finishes (`events.c` hold →
  `resident.c:124`, hook `src/system/game_event.c:49`). [ISSUE] this event hold let a patrolling Trainer walk on and
  stop short of / onto the player (Route 4's Dell); patched in `src/ov036/event_trainer_eye.c:343-...` by re-measuring,
  not yet tested (STATUS 2026-11-05). The rewrite should avoid holding the game's events, or prove it's harmless.
- [ ] The effects' banks are uploaded under the entrance fade (`PaperWhite2_FollowingPreloadFollower`,
  `field.c:1887-1930`) or under an event's fade (`field.c:2323-2325`), never mid-frame; resources are freed a few
  ticks late so the GPU's queued frame doesn't read freed textures (`effects.c:83-89`).
- [ ] Without the effects loaded (low heap: needs 64 KB of field heap free, `effects.c:56-58`) the follower just
  appears/disappears; L/R is disabled (`field.c:1972-1975`).

---

## 4. Talking to the follower

### 4.1 Starting a talk
- [ ] **A** in front of the follower, after the field's own checks (NPCs, signs, BG events) found nothing
  (`field.c:2685-2737`; hooks `src/ov036/fieldmap_event.c:447` grid, `:542` rails). On a grid it counts as "a script
  called".
- [ ] Only when: follower out and walking (not a ball, not hidden), no effect running, the player standing (move observe
  none/end), not cycling/surfing (ExState 0), no fade, no event, A/B released since the last talk, ≥16 KB game-event
  heap (`field.c:2693-2717`, `interaction.c:217-221`, `833-853`).
- [ ] Reach (`interaction.c:316-478` `CanReach`): within one tile plus its gap (+8 for 64-pixel) in the facing
  direction, height within 8 units, the trail between them straight (a corridor), half a tile of sideways slack, the
  grid tile in front or the one past it, no wall in front; on rails, the knot the player faces counts even past two
  tiles. A follower whose draw anchor sticks past the limit is pulled back onto it.
- [ ] The follower turns to face the player (on rails, the rail's frame), the player is braked, and the message sound
  plays (`interaction.c:855-935`).

### 4.2 What it says (selection)
- [ ] **First the dialogue library** (`a/0/4/7` member 4 "FWDL"): the conditions engine's selection over the talk table
  of the follower's species block (shared rules without a species clause + shared rules naming it + its own): highest
  priority among matches, then weighted pick (`interaction.c:880-892`, `dialogue.c:114-216`).
- [ ] **Else HeartGold's interactions** (`a/0/4/7` member 3 "FWTK", 34 rules, 12 motions, 27 messages, 7 bubbles from
  `res/paperwhite2/following/interactions.json`): the first rule whose HP band (5), friendship band (10), status
  (healthy/burn/freeze/paralysis/poison/any/sleep) and facing match and whose chance roll succeeds
  (`reactions.c:46-72`, `FollowingReactions_Choose`). No match → no talk.
- [ ] Clauses the follower's rules can use (subject = the follower): `chance, exterior, facing, flags, follower,
  friendship, hp, item_waiting, level, nature, party_level, scaled_level, season, species, status, steps, terrain,
  tile_x, tile_y, time, total_steps, type, vars, weather, zone, zone_group`
  (`res/paperwhite2/conditions/condition.schema.json`). Context: world, field, party, the follower's record, the
  follower's own tile's terrain, facing toward the player, the player's tile (`dialogue.c:231-254`).
- [ ] **Daily friendship**: a talk that used the library gives `settings.talk_friendship` (1) once a day per Pokémon,
  max 255, tracked in `EVENT_WORK_FOLLOWER_TALK_DAY_0..5` (0x4052–0x4057: 8-bit PID hash + low byte of the day
  number) (`data.c:87-125`, `interaction.c:923-927`, doc 874-876). Note: given even when the library had no matching
  rule and the HeartGold fallback played.

### 4.3 How a talk plays (steps)
- [ ] A rule has 1–16 steps (HeartGold rules up to 5). Each step, in order: its **action** (as it begins), its
  **motion** (sprite offset only; Diglett/Dugtrio never rise), its **bubble** (emote, 4 timed frames + 2 end frames),
  its **cry** (none / cry / slowed cry at speed −2143), its **message**, then its **wait** in frames
  (`interaction.c:87-99`, `687-831`). A library step with no motion cries as it begins; HeartGold's cry on the motion's
  cry frame.
- [ ] Cries never block: deferred while the sound system's load thread runs (`interaction.c:480-492`).
- [ ] **Message boxes** (`interaction.c:622-666`, doc 825-832):
  - `default`: the talk balloon at the bottom, tail to the follower's side;
  - `bubble`: an NPC-style balloon above/below by `MSG_WIN_POS_AUTO`;
  - `yell`: the bubble with the spiky frame that shakes as it opens;
  - `event`: InfoMsg's plain window across the bottom (1,0x13, 30×4 tiles), closes at once with A/B.
- [ ] Messages page with A at `[L]`/`[C]`, close with A or B (only after A/B were released); a balloon that doesn't
  close within 120 frames ends the talk (`interaction.c:58-63`, `778-817`). Up to 1023 words over many pages.
- [ ] Text codes: `[N]` newline, `[L]` next line after A, `[C]` new page after A; `{nickname}`, `{player}`,
  `{location}` (zone's place name), `{item}` → word set 0–3 (`dialogue.c:29-32`, doc 791-794). HeartGold's texts use
  0xFFF0 nickname, 0xFFF1 player, 0xFFFE newline.
- [ ] **Actions** (`interaction.c:550-598`, `following_dialogue.h` actions enum):
  - `give_item` (item, quantity): into the Bag; if no room, one becomes the Pokémon's waiting item (if it has none) and
    the library's `bag_full` message replaces the step's text (`data.c:137-157`, `interaction.c:537-548`);
  - `give_pool`: an item rolled by weight from a pool (`pools.json`, `a/0/4/7` member 5 "FWPL"); no item → step skipped;
  - `give_waiting`: gives the found item; on success clears it and the steps since the last gift (`data.c:158-175`);
  - `friendship` (−128..127, clamped 0..255);
  - `script` (a script ID): after the step, the talk closes its windows and pose, ends, and `GameEvent_Replace`s itself
    with `EventScriptCall_Create(script, follower actor)` (`interaction.c:668-679`); the scene policy then treats it
    as any script;
  - `reset_steps`.
- [ ] The talk is cancelled cleanly by any field change, fade, or replaced actor, restoring the follower's pose and
  facing (`interaction.c:242-304`, `694-696`).

### 4.4 Emotes (bubbles)
- [ ] Seven bubbles, two frames each, 32×32 16-color, from HeartGold: heart, happy, sad, angry, note, poison, ellipsis
  (`a/0/4/7` members 6-19 from `res/paperwhite2/following/emotes/<name>_{1,2}.png/.pal`) (`following_effects.h`,
  doc 300). Drawn above the head with 8 source pixels of clearance measured from the sheet's opaque rows
  (`effects.c:80-81`, `223-269`), in a private scene so no actor palette changes; kept behind the player when the
  player stands in front (`FollowingEffects_SetPlayer`). Needs 32 KB field heap free (`effects.c:57`).

---

## 5. While walking: steps, pickups, ambient emotes

`ambient.c:122-175`, called once a frame from `field.c:2563-2570`.

- [ ] **Steps**: each player step to a new tile while the follower walks behind (or waits as its resting ball) adds one
  to the follower's steps-since-gift (max 4095) and total steps (max 262,143) on the Pokémon (`data.c:73-85`). Not
  while recalled, during events, or in menus. Zone changes restart tracking without counting.
- [ ] **Pickup**: after a step, if it keeps no item, the pickup table's selected rule rolls its pool; the item (one,
  whatever the pool's quantity) waits on the Pokémon (`ambient.c:77-98`). Shown later by a talk rule
  (`item_waiting`).
- [ ] **Ambient emote**: while out and visible, no talk/effect, cooldown 0: the ambient table's selected rule shows its
  bubble over the follower (walking with it, not stopping the player), optionally with a cry (skipped while the sound
  loader runs), then its cooldown in steps (`ambient.c:100-120`, `163-174`). Ended by a talk, an effect or a hide.
- [ ] The sample content in `res/paperwhite2/following/dialogue/` — shared: found item (prio 20, 2 steps), low HP ≤25%
  (10), rain outdoors (5), night outdoors (4), grass (3), cave (3), water (3); ambient: note while an item waits
  (cooldown **500**), happy after 50 steps at friendship ≥100 (1% chance, cooldown 50); pickup `berries` after
  **2000** steps at **5%**. Keldeo: Resolute yell (2), water two-step (6), default, friendship ≥200. Snivy: sunny
  daytime (2), default. [The doc's "sample content" (doc 886-893) gives older values (cooldown 20, 100 steps at 10%);
  the JSON is the truth.]

---

## 6. Events, scripts, menus: when it waits and when it's recalled (the scene policy)

`scene.c` (policy), `events.c` (bridge of overlay 12/36 hooks), `resident.c` (main-RAM hooks and tokens). Policy data:
`res/paperwhite2/following/event-policy.json` (375 safe script opcodes, the safe sub-event finishers) and
`audio-event-policy.json` (8 sound events), generated by `tools/paperwhite2/following_scene_policy.py` into
`build/include/generated/paperwhite2/following_{scene,sound}_policy.h`.

- [ ] **Waits in place** (paused, animation held, walks on after) through: NPC talks and signs, Yes/No prompts, list
  menus, camera waits, music and fanfare commands, cries from scripts, the X menu and Y shortcut while they stay on the
  field, the field's opening, the Repel's "use another?" (script 10144), the hack's own commands GetPartyLevel,
  CheckCondition, ReloadMapHere, Debug (`scene.c:51-76`, `186-204`, `352-449`).
- [ ] **Recalled into its ball** (script waits for the ball, follower comes out after) for: any command or event the
  policy doesn't know, an event that moves the follower, the player (except the player's own run between events), or
  an actor through the follower's tile; a new NPC allocated on or near it; an unsafe sub-event finisher; more than 16
  events or 48 VMs tracked (`scene.c:170-184`, `451-491`, `624-726`, `886-1081`).
- [ ] **Warps, doors, cutscenes moving the player**: recalled, and the next field has it walk in from the trail (comes
  out with a send-out once the player has walked a tile) (`field.c:2649-2683`, doc 617).
- [ ] **PC**: log in, storage, log off: the follower stays through the PC's fades and comes back on its exact tile
  facing the same way if the player and follower are unchanged (restore token "FWSR", 60 bytes,
  `scene.c:912-937`, `field.c:2340-2353`, `2446-2457`; `following_events.h` `FollowingRestore`). Changed lead in the
  storage → the new follower walks in. [BUG kept] `EventFieldSubprocessTransitionWithCallback` never counts as the PC
  storage's (`// BUG:` in `PaperWhite2_IsFieldSubprocessCallback`, doc 497-499).
- [ ] **Menus (X)**: waits; after an application that closes the field (party, bag, Pokédex…), the follower is placed
  at once beside/behind the player during the fade back in (summon token, source MENU) (`field.c:2604-2683`,
  `2191-2214`, `1216-1292`; `scene.c:1119-1145`; doc 596-617). An application that keeps the field (save) gives it
  back beside the player when the menu's events end (`field.c:1533-1546`). An application that hands off to a field
  move, item event or script (types 2, 3, 5) doesn't keep it; the follower comes after that event.
- [ ] **Fly, Dig, Teleport, Escape Rope, Infinity dungeon retire** (warps started from a menu): placed at once on the
  arrival field once its arrival events end (`sMenuSession`, `field.c:221`, `2194-2198`, `2655-2656`).
- [ ] **Battles**: on return to the same tile, placed at once (summon token, source BATTLE) if it was out when the
  battle began or Followers are off; a loss/whiteout elsewhere → walk-in (`field.c:2616-2620`, `2649-2671`).
- [ ] **Load a save / boot**: the boot summon token (valid from boot, `resident.c:17-20`) places the follower at once
  beside the player once the field's opening ends (doc 596-598).
- [ ] **Placement rule (summon)**: behind the player; if facing down and 32-pixel, beside (left, then right) facing
  down; else a free side; on rails too; a 64-pixel one indoors comes as its resting ball (`field.c:1216-1292`). With
  no open tile it stays hidden and walks in.
- [ ] Double, multi, link, Trial House, rental and battles whose setup the caller frees: recall (not carried into the
  battle) (`scene.c:257-298`, `following_battle_entry.h`).
- [ ] Partner (tag-along NPC, `GameData_CheckPairFlag`): no follower (`field.c:2285-2287`).

---

## 7. Battle opening

`src/ov167/btlv_scu.c:900-958` (hooks at `:558`, `:568` in `BtlvScu_StartEncount`); marking in `scene.c:219-318`.

- [ ] A **local single** wild or trainer battle (not linked, not multi, not recorded playback) that starts with the
  follower **visible, healthy, party slot 0** and in front is marked (`FOLLOWING_BATTLE_PRESENT` = bit 31 of
  `BtlSetup.flags`, never saved). Battle commands in scripts keep the follower if it's a candidate
  (`scene.c:940-945`).
- [ ] In the marked battle the follower's Pokémon is already on the player's platform as the battle fades in; after
  the opponent's message there's no ball throw, no ball, no "Go!"; the battle camera (effect 0x236) runs and the
  player's HP bar shows; in trainer battles the opponent's send-out is as usual and its gauge is shown.
- [ ] If the lead isn't party member 0 after all, the mark is dropped and the original opening plays. The mark is
  removed when the opening ends, so the next battle opens normally.
- [ ] The follower keeps "out" across the battle so it's placed at once on return (section 6).

---

## 8. Settings and controls

- [ ] **Options row** (`options.c`, hooks `src/ov140/config_panel.c:393,414,975,1742,1766,1784,1908`): sixth row
  FOLLOWERS: ON/OFF under SAVE BEFORE IR, same colors/bevel; explanation "Choose whether Pokémon follow you."; up/down
  through it to Confirm/Quit; left/right or touch picks with `SEQ_SE_SELECT1` (`options.c:247-252`); changing only it
  then Quit asks to save changes; Confirm writes `Config.followersOff` (bit 11, `include/save/config.h:22`). Text in
  `res/text/system/title_2.txt` (`Title2_Text_Followers`, `FollowersOn`, `FollowersOff`,
  `ChooseWhetherPokemonFollow`). Doc 532-571 is the test list.
- [ ] **SELECT** toggles the same setting on the spot, from a free field only (no event/talk/fade/effect/partner, player
  standing, walking): off → recall (or rest-ball recall, or `SEQ_SE_BOWA2` with nothing visible); on → placed beside
  the player with a send-out (`field.c:2073-2126`). [DECIDE] SELECT is also a common hack key; keep?
- [ ] Off survives save and reload (it's in the save's Config); a fresh save is "on" (zero).
- [ ] `FOLLOWING_ENABLED` 1: the ROM-wide switch (`following_field.h`).

---

## 9. Riding, surfing, other player states

- [ ] Cycling, Surf, Dive and the other player forms (ExState ≠ 0: fishing, field-move poses…): the follower is
  recalled and comes back (walk-in) when the player walks again (`field.c:2278-2280`, `2326-2328`;
  `src/ov036/field_player.c:50-62` forms). No riding, no surfing follower (the full package was dropped, doc 5-9).
- [ ] [DECIDE] the doc's ROADMAP or the user may want follower-on-bike later; nothing exists now.

---

## 10. Save data

- [ ] **On the Pokémon** (5 bytes, `FollowingRecord`, `following_data.h`, doc 839-872): block B 0x1C–0x1F
  (`PKM_PARAM_UNK72`, PK5 0x44) + block C 0x16 (`PKM_PARAM_UNK76`, PK5 0x5E): bits 0–9 waiting item (past `ITEM_LAST`
  reads as none), 10–21 steps since last gift, 22–39 total steps. Travels with the Pokémon (party, PC, save). Shedinja
  starts at 0 (`src/ov284/evolution_demo.c:1357-1362`). Evidence that the game never writes those bytes: doc 854-872.
- [ ] **In the save's event work**: `EVENT_WORK_FOLLOWER_TALK_DAY_0..5` (0x4052–0x4057) for the daily friendship.
- [ ] **In Config**: `followersOff` bit 11.
- [ ] **Not saved**: the follower's actor (its movement flag 0x100000 is the actor save's skip bit,
  `src/system/field_actor_savedata.c:29-40`), the L/R choice, the trail, the tokens.
- [ ] The old Pokeweb one-time gift claims in block C's ribbon bits are gone; those bits are the game's again (doc
  504-505).

---

## 11. Debug menu (START > Follower..., `res/field/scripts/global_10200.s` actions 38–42)

`src/paperwhite2/ov012/paperwhite2_debug_commands.c:89-93,225-226,422-440`; `ambient.c:177-318`;
`include/paperwhite2/debug_actions.h:110-123`; texts `res/text/script/global_10200.txt:149-161`.

- [ ] Title: species, steps, waiting item. **Steps and item**; **Set steps...** (≤4095); **Force a pickup** (a matching
  pickup rule at max steps ignoring chance, else pool 0); **Clear waiting item**; **Rules now** (talk rule with priority
  and match count, ambient and pickup rules). "No Pokémon is following you." without one.
- [ ] Debug Info and the Conditions readout show the follower's species and terrain under it
  (`global_10200.txt:137-141`).
- [ ] The debug menu's own script commands keep the follower (CMD_DEBUG safe, `scene.c:67-73`).

---

## 12. Editor (what the user edits) — `editor/src/modules/followers/`

`FollowerEditor.tsx:1-5`, `data.ts:1-14`:
- [ ] Pokémon page: each species' follower variants (form/sex/shiny), sprites and the `follower` object of each
  `data.json` (species, form, sex, shiny, placeholder, `animation_profile`, `art_offset`, `side_gap`, `gaps`
  up/down/left/right), plus its own dialogue file (or create one), with the shared rules that name it.
- [ ] Shared dialogue (`dialogue/shared.json`: talk `rules`, `ambient`, `pickup`, `messages.bag_full`,
  `settings.talk_friendship`), Item pools (`pools.json`), Interactions (`interactions.json`), Emotes & balls (art).
- [ ] Message previews (talk window). Schemas: `dialogue.schema.json`, `pools.schema.json`,
  `interactions.schema.json`, `field_actor.schema.json`.
- The rewrite must keep these source formats (or migrate them together with the editor, which is the cloud session's).

---

## 13. Build-side data and tools

| Tool | Makes |
| --- | --- |
| `tools/paperwhite2/following_data.py` | `a/0/4/7` members 1 (registry) and 2 (positioning) from the followers' `data.json` |
| `tools/paperwhite2/following_assets.py` | members 3 (interactions), 6–19 (emotes), 20–22 (effects), 23 (balls' art) |
| `tools/paperwhite2/following_dialogue.py` | members 4 ("FWDL", blocks ≤4096 bytes) and 5 ("FWPL"); `dump` decodes |
| `tools/paperwhite2/following_scene_policy.py` | the generated scene and sound policy headers |
| `tools/paperwhite2/import_followers.py`, `import_following_assets.py` | one-time importers from the v0.21 ROM |

Note: `build/w2_us/src/paperwhite2/ov036/paperwhite2_following_gifts.o` is a stale object (its source is gone).

---

## 14. Memory budget (measured from the current hack build's objects, `arm-none-eabi-size`)

| Module | Code (.text) | .rodata | .data | .bss |
| --- | --- | --- | --- | --- |
| main (`resident`) | 336 | 0 | 124 | 16 |
| ov012 (`events`) | 972 | 16 | 0 | 28 |
| ov036 field | 15,246 | 20 | 8 | 4,526 |
| ov036 trail | 9,310 | 0 | 0 | 0 |
| ov036 render + render_math | 12,014 | 0 | 8 | 400 |
| ov036 scene | 6,132 | 750 | 0 | 652 |
| ov036 effects | 5,784 | 40 | 1 | 752 |
| ov036 interaction | 4,740 | 0 | 4 | 8,872 (8 KB interactions buffer) |
| ov036 reactions | 2,576 | 4 | 0 | 0 |
| ov036 dialogue | 1,744 | 33 | 5 | 4,132 (4 KB block buffer) |
| ov036 ambient, data, registry, positioning | 3,650 | 0 | 1 | 48 |
| ov140 (`options`) | 1,704 | 36 | 0 | 40 |
| ov167 (`btlv_scu.c` additions) | ~0x1a0 (doc 585) | | | |

- Overlay 36 carries about **60 KB of follower code + 19 KB .bss** of its 0x7FE20 (512 KB) total; the hooks in
  original files add a little more. `build/w2_us/memory.txt` (whole hack today): OV036 0x02189900–0x02209720, grows 0
  before the arena moves; **DS main arena: 87 KB left** (0x15ca0). Every KB the rewrite saves in ov036 is arena.
- Heaps at run time: needs 32 KB free on the field heap to create the actor (`field.c:61`), 64 KB to load effects and
  32 KB for a bubble (`effects.c:57-58`), 32 KB field heap and 16 KB game-event heap for a talk
  (`interaction.c:49-50`), 4 KB extra for the ball palette (`effects.c:116`); a message's words + StrBuf are on the
  field heap while it shows; a pool roll briefly reads its entries.
- Actor pool: one slot (and keeps 2 free) and one uid in 0xF0–0xF8.
- VRAM: the follower's sheet is a normal static billboard resource (`FldActSys_LoadStaticBillboardActor`,
  `field.c:1929`); the effects add the ball model + texture (16×16 4bpp), the flash model + texture animation, a private
  recolored copy of the follower's sheet for the silhouette (sheets measured up to 128 KB, `effects.c:63-71`), and the
  two 32×32 frames of a bubble. Nothing in the docs gives total VRAM use; `paperwhite2_vram_stats.c` may measure it.
- Main RAM `0x020933d0`–`0x020934af` must stay free of hack code/data (nds-bootstrap's IRDO fix overwrites it) (doc
  326-328).

---

## 15. Known open issues and TODOs to carry or fix

1. Trainer patrol walking onto the player while the recall holds events (Dell, Route 4); patched in
   `event_trainer_eye.c`, untested (STATUS 2026-11-05). Root cause: the event hold.
2. Pokémon Center counter: occasional clip of a 32-pixel follower's rows (STATUS "Later").
3. Oval over the feet in W-buffered rooms (Centers); camera setup 3 W→Z idea parked (STATUS "Later").
4. Shiny placeholder rows show non-shiny art (STATUS 2026-11-03).
5. Rails: `facing` clauses read the rail's line (0–3), not the compass; tile bounds read the grid tile, which rails
   don't move (doc 930-931).
6. Movement routines on tiles (run a circle, run off and back) not built; motions are sprite offsets only (doc 924-927).
7. No sample `script` step yet (doc 928-929).
8. Editor: motions are numbers until `interactions.json` names them (doc 933).
9. Per-direction gaps collapse to their max (section 1.2) [DECIDE].
10. L/R choice not saved [DECIDE].
11. Kept `// BUG:` — PC storage transition event comparison (doc 497-499).
12. User's next step (STATUS): collect the user's list of follower oddities and weigh building on the game's own
    `MOVE_CODE_FOLLOW_PLAYER` partner movement, on a branch with a backup tag.

## 16. Non-functional behavior the rewrite must keep (stability)

- Never touch an actor that isn't the follower's own (checks of system, slot range, in-use flag, move code vtable:
  `field.c:1491-1497`, `interaction.c:209-215`); never follow a stale event pointer (`scene.c` tracks only live events,
  the talk's cancel walks the live chain, `interaction.c:279-304`).
- Never freeze: the follower stays out of the actors' movement dispatch, which reads absent rail work on a grid
  follower and froze the game (`field.c:1485-1487`); cries never spin on the sound loader.
- Never assert: leave 2 free actor slots; check heaps before allocating (`GFL_HeapAllocateCore` returns NULL).
- No screen tear on hardware when binding textures; no streaks from freeing textures the GPU still reads.
- Everything is torn down on the field's unload before the field's actors (`field.c:2649-2683`, hook
  `src/ov036/fieldmap.c:624`), and main's hooks are unbound when the field goes.
- DSi mode: `tools/build/verify_dsi_rom.py` after any layout change (CLAUDE.md).
