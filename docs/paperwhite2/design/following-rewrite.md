# The Following Pokémon: review and rebuild plan (2026-11-05)

The user asked for an in-depth review of the follower runtime and, if it's worth it, a rebuild with the same features
that is more stable and cheaper. This is the plan. Nothing in it is built yet; the user approves it first. The four
review reports, with file:line evidence for everything below, are in `following-review/`:
[hooks.md](following-review/hooks.md), [events.md](following-review/events.md),
[movement.md](following-review/movement.md) and the feature checklist [features.md](following-review/features.md).
They were read from the code, not tested in game, and say which points are inferred.

## What's wrong

The runtime (12,800 lines in 16 files and 4 headers, about 60 KB of code and 19 KB of data in overlay 36) already
works much better than the Pokeweb plugin it came from. Its remaining trouble comes from two design choices, which
most of the special cases exist to patch.

**1. It steers the game instead of following it.** It has 35 hooks into the original code, and several of them
change what the game does rather than only watching it:

- **The event hold.** While the recall animation plays (12 ticks), every running game event is paused, the first step
  included, but NPCs, actor moves and the camera keep going (`src/system/game_event.c:47-52`). Policeman Dell was one
  case: a patrolling trainer walked on while his walk's distance waited. Anything that measures or freezes the world
  in its first steps can drift the same way: an NPC wandering off after being talked to, a spinning trainer turning,
  a scene script reading positions late. Every battle the follower isn't carried into starts 12 frames late. The D-pad
  is gated during the hold too (`src/ov036/field_player.c:154`).
- **The opcode policy.** Every command of every field script is checked against a list of 376 "safe" commands, and
  anything else recalls the follower (`src/system/vm.c:94`). It's a default-deny list that has to grow with every new
  kind of script, and the zones' start-up scripts at seamless connections run through it too, so whether the follower
  is recalled there depends on which branch a script takes.
- **Hooks on every actor.** Every actor's moves, steps and placements are reported, every frame, and the follower can
  be recalled from inside the game's own code partway through its work (`src/ov012/field_actor.c:593-616, 1152,
  1732`). The state that decides all this is spread over three layers with about 20 reasons to recall.

**2. It rebuilds what the game already has.** The follower is a field actor that the game's movement code doesn't
move: each frame the runtime places it on the player's recorded path (`paperwhite2_following_trail.c`), so it had to
write its own tile effects, shadow, collision both ways (with hooks into the game's collision checks), heights,
connections and swap, about 40 state variables for the swap and stand alone. Its per-frame cost is about 1% of a frame
normally and a few percent near walls or in busy Castelia (estimated): 64-step software divisions, the camera basis
recomputed up to four times a draw, a pass over every actor with rail prediction, and a busy-wait for the scanline
before each texture upload, the line-flicker fix (`paperwhite2_following_effects.c:207-221`).

**What's good and stays:** the data and content side: the registry of sprites and sizes, the follower sprites, the
dialogue and interactions with their tools and the Follower Editor, the ball effects' art, emotes, the Options row,
the battle opening and the save bit. Those are features; the problems are in the core that moves the follower and
decides when it shows.

## The plan: rebuild the core, keep the content

### 1. Events: watch, never hold

From the events review's proposal (`following-review/events.md` section 6), with three rules:

- **Never hold a game event, never gate input, never change vanilla code to make up for the follower.**
- **Decide once a frame from the world's state, not per script command.** When an event starts, the follower stops
  where it is, the way the game stops its own partner NPCs (it finishes its step, then stands). During the event it
  **hides at once** only when something needs its place: a scripted move of an actor whose path covers its tile, a
  scripted move of the player, an actor created on its tile, or a fade or unload. The recall animation plays on its
  own over the spot, and nothing waits for it.
- **One rule brings it back.** When the event ends, or the field fades back in, it comes back where it was if the
  player is on the same tile in the same zone, or walks in otherwise. That single rule replaces today's separate
  handling of the PC, menus, battles and the return screens.

This drops the event hold, the input gate, the script-command hook and the 376-command list with its generator, the
event and VM tables, and the special cases built on them (`naturalRun`, the PC flags, the Repel, cry and Yes/No checks,
the finisher). The Dell fix in `event_trainer_eye.c` can go back to vanilla once nothing holds events.

### 2. Movement: the game's own partner movement

The game already has partner NPCs that walk behind the player (`MOVE_CODE_FOLLOW_PLAYER`,
`src/ov036/field_actor_movecode_pair.c:155-283`): when the player steps, the partner steps onto the tile the player
just left, with the player's own walk or run. The new follower would be a normal field actor with **its own copy of
that move code**, so it gets for free what the runtime now rebuilds: heights, stairs and slopes, grass, splash,
shadow and reflections, being stopped by events after its step, and collision. The game even has the flag for
"NPCs walk around it, the player walks through it" (0x8000, `src/ov012/field_actor_tool.c:578-582`), which would
replace the collision hooks; trainer sight needs a test with it.

What the copy adds to the game's partner code:
- **A short history of the player's steps**, so it replays the move that left each tile one tile later. Copied at
  once, a ledge jump started a tile behind would land on the player.
- **A check that it's next to the player**, since the partner's steps go through walls: after a summon or a
  cutscene it's placed with today's summon placement, or hidden.
- **Rail maps** (Castelia's streets and the like): the game has no rail partner, so this is a new rail move code that
  keeps a short list of the player's rail positions and steps along it. It's the largest new piece.
- **Large (64-pixel) sprites**: one tile back they overlap the player on screen, so they follow two tiles back, or
  draw pushed back with the actor's own draw offset.

### 3. Drawing: the game's billboards

The hack's sprites already work as ordinary NPCs (an NPC with `OBJ_CODE_FOLLOWER_PIKACHU` was tested in step 3 of
the port), and the game has 64-pixel billboards. The follower would be drawn by the game like any NPC, with its
per-species height through the actor's draw offset instead of moving the drawn quad every frame. The ball, flash and
emotes keep one draw hook of their own. The hooks go from 35 to about 8, all of them watching or on rare paths: the
per-frame update, the map's load and unload, one draw, the graphics lookups, the talk, the battle opening, and the
Options row and save bit (`following-review/hooks.md` section 3).

## What would change for the player

- **Lost:** the per-species fine spacing (the follower sits on the tile behind, with large ones two back), the eased
  swap animation, and the HeartGold side-by-side stand, unless they're rebuilt on top (the stand could be: it's a
  pose, not a movement).
- **Different:** a recall no longer pauses the game for a moment; a script that walks an NPC through the follower
  makes it vanish as the path is set, as now but without the stall.
- **Kept:** everything else in `following-review/features.md`, which is the checklist each stage is tested against.

## The user's decisions (2026-11-05)

1. **Spacing, the smooth swap and the side-by-side stand stay as they are.** So the movement and drawing aren't
   rebuilt on the game's partner movement (section 2 and 3 above are kept as the research, not the plan): they're
   tidied, with the same behavior.
2. **One spacing value in all four directions**, which is what the code already does (the largest of the four): the
   data and the Follower Editor become one value.
3. **The L/R choice isn't saved**, as now.

## The plan as decided

On the branch `follower-rebuild`, from the tag `follower-before-rebuild` on `main`. The two aims are stability and
keeping every feature. Each stage builds, passes the DSi check and is tested in game against
[features.md](following-review/features.md) before the next.

1. **Events: watch, never hold** (section 1 above). Drop the event hold, the input gate, the script-command hook and
   its list, the event and VM tables and their special cases. The follower stops when an event starts, hides at once
   only when something needs its place, and comes back by the one rule. The Dell re-measure goes back to vanilla once
   this is tested.
2. **Tidy movement and drawing, the same behavior.** Texture uploads in the vertical blank instead of the
   busy-wait for the scanline; the per-frame math made cheaper (the software divisions, the camera basis computed once
   a draw, the pass over the actors); the collision hooks kept unless the game's 0x8000 flag does the same.
3. **One spacing value** in the data, its tools and the Follower Editor.
4. **Clean up and measure:** remove what the stages left unused, measure memory and frame time against
   `follower-before-rebuild`, update `following-pokemon.md` and STATUS.
5. **Merge** once the user has played through on the branch.
