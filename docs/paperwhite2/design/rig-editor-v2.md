# The Rig Editor, version 2: sequences and a timeline (design, 2026-11-14)

The user's own design, worked out after using the first Rig Editor (battle-sprites.md sections 18-19) on Applin. The
first editor exposed the game's storage (poses, Stay/Stop blocks, restart/continue tracks, baked keys); this one is
built around how the user thinks: a default pose, reusable sequences that start and end at it, and a timeline that
lays sequences out like clips in a video editor. The game's format already works this way underneath.

## How it maps onto the game

| The user's word | The game's (battle-sprites.md section 3) |
| --- | --- |
| Piece | A picture (one or two rectangles on the 256x128 sheet) |
| Bone / part | A part (multi-cell node) with its pivot, playing a track (cell animation) |
| Sequence | An action: a pose (multi-cell) whose parts play their own tracks, restarting at each block |
| The timeline | Sequence 0 ("stay"): a strip of blocks, each playing one action from its start |
| Keeps moving | An idle part: animates during the battle's random pause while the rest freezes |
| Loop clip | A part's own short looping track (flicker, blink) merged into its keys |

Instances are free in the game: a block refers to an action, so the idle played four times costs no more space than
once.

## The workflow

1. **Sheet**: drawn in Aseprite, imported with the art import (section 14), Live2D-style pieces on the 256x128 sheet.
2. **Pieces**: a rectangle per piece on the sheet, named.
3. **Rig setup and the default pose**:
   - A bone per part, with two ends to drag: the **head** (the pivot) and the **tail** (where children attach).
   - Parenting either **connected** (the child's head is locked to the parent's tail: tails, spines, necks) or
     **keep offset** (the child follows the parent from where it is).
   - The piece's picture placed relative to its bone.
   - **The default pose**: the rest arrangement every sequence starts and ends at. Front and back each have a rig and a
     default pose; "Copy front to back" starts the back from the front.
4. **Sequences** (a list: "Idle", "Hop", ...), each with its own timeline:
   - Its length is a multiple of 6 frames; the playhead and every keyframe snap to 6.
   - The default pose is automatically at the start and, effectively, at the end: the last keyframe sits one step
     (6 frames) past the end, shown outside the sequence as Blender does, so it can still be moved or copied, while the
     loop never holds the default twice at the seam.
   - With no keyframes in between, the sequence holds the default pose. A keyframe in between blends default -> it ->
     default; any number of keyframes per part.
   - Each part keys move, rotation and scale (both axes or one), relative to its bone and parent; a picture per
     keyframe (picture swaps: blinks, mouths) and Hidden.
   - The graph editor eases each part's channels: ease in/out, linear, constant, Bezier handles, and presets for
     snap, back (overshoot), bounce and elastic.
   - **Reset sequence**: back to the default pose with no keyframes, touching nothing else.
   - **Loop clips** (the user's "sequences within a sequence"): a short looping clip for a part (fire flickering
     through 2-3 pictures, a blink every few seconds) placed on a part in a sequence, playing on its own rhythm under
     the sequence's other motion, so it isn't keyed by hand while everything else moves.
5. **The timeline**: a strip at the bottom like a video editor; sequences dragged on, repeated, reordered, deleted
   (e.g. Idle x4, Hop, Idle x3, Special). Editing a sequence changes every instance. The preview plays the strip as
   the game will.
6. **Keeps moving**: a per-part toggle; during the battle's random pause (about a second, at the end of a loop), only
   those parts animate (Charizard's flame). Off for every part = the whole sprite freezes.

The game's 6-frame keys are made from this when the side is saved (the flat rig file the build packs), never shown as
something to edit.

## The game's limits the editor keeps

- **No bending or warping**: a piece is a flat rectangle that moves, rotates and scales. A bend is several pieces in
  a chain (connected bones make that easy) or pictures drawn bent and swapped (Roggenrola).
- **No skew**: a parent's uneven scale over a rotated child can't be drawn; the editor warns.
- At most 64 parts; one 256x128 sheet per side; front and back share one 16-colour palette (the shiny palette
  recolours the same indices).
- Size: the number of distinct keys; a meter against the ~40 KB guidance (section 15).
- The summary and Pokédex play the same timeline as the battle.
- Vanilla sprites open as sequences (one per action) with their keys as they are.

## Build steps (each tried by the user before the next)

1. **The model and the bake**: the source format (rig setup with heads, tails, connected/offset parents, the default
   pose; sequences with per-part keyframes and curves; loop clips; the timeline; keeps-moving parts) and its bake to
   the game's files, byte-identical for a converted vanilla sprite with nothing changed; tests.
2. **Rig setup**: pieces on the sheet, bones with both ends, parenting connected or offset, the default pose.
3. **Sequences**: the list, a sequence's timeline (snap 6, the default at both ends, the end key past the end), the
   keyframe editing, the graph editor with presets, Reset sequence, multi-select and delete of keys.
4. **The timeline strip and the preview**: clips, instances, the battle pause, keeps-moving parts, the size meter.
5. **Loop clips**.
6. **Old rigs**: vanilla sprites and the first editor's armatures open in the new model; Start fresh.

The first editor stays reachable as an Advanced view until the new one covers everything.

## The user's decisions

- A sequence ends one interpolation step (6 frames) before the default, with the end keyframe shown just past the
  sequence's end (Blender's way), so the loop is perfect and the end key stays editable.
- Keeps-moving parts are wanted (fire, blinks), and loop clips inside sequences.
- Sequence lengths are multiples of 6; the playhead and keyframes snap to 6.
- Applin's earlier practice rig isn't carried over; the user starts Applin fresh in the new editor.
- **One set of parts for every sequence**: no per-sequence duplicates (the `_a`/`_b` tracks). The game needs a track
  per part per action, so the save generates them (named consistently, e.g. `head_a`, `head_b`); the source and the
  editor only ever show the shared parts. A part a sequence doesn't move just holds its default pose there.

## Built: step 1, the model and the bake (2026-11-14)

The format and its bake, with no new UI yet: `editor/src/modules/rig/v2.ts` (the format's types, `bakeV2`,
`convertToV2`, the snapping rules), `sizes.ts` (the size estimate), `res/pokemon/battle_sprite_rig_v2.schema.json`; the
curve presets in `armature.ts` (`eased`). The first editor's armature (battle-sprites.md section 19) is unchanged.

### The file: `<side>_rig_v2.json`

A new file beside `<side>_rig.json`, not a new version of `_rig_source.json`: the first editor reads that one and stays
reachable as the Advanced view, so the two never meet in one file. A side has one or the other, never both (tested);
step 6 turns a first-editor armature into this. **The flat `<side>_rig.json` stays the build's only input**, written by
the bake on save, as in battle-sprites.md section 19.1; `tests/rig-v2.test.ts` checks that every `_rig_v2.json` in res/
bakes to its flat rig exactly. The editor's compact layout (two spaces, a key a line). An excerpt of a fresh rig:

```json
{
  "$schema": "../battle_sprite_rig_v2.schema.json",
  "format": 2, "side": "front", "step": 6,
  "box": { "width": 31, "height": 45, "x": 4, "y": 3 }, "stop_flags": 0,
  "pause": true, "keeps_moving": [ 2 ],
  "pieces": [ { "name": "body", "rectangles": [ { "sheet": [ 56, 24 ], "size": [ 16, 16 ], "at": [ -11, 0 ] } ] }, ... ],
  "bones": [
    { "name": "body", "head": [ 4, -15 ], "tail": [ 0, -18 ], "parent": null, "default": { "piece": 0 } },
    { "name": "head", "head": [ 0, -18 ], "tail": [ -3, -23 ], "parent": 0, "default": { "piece": 1 } },
    { "name": "ear", "head": [ -3, -23 ], "tail": [ -6, -40 ], "parent": 1, "connected": true, "default": { "piece": 2 } }
  ],
  "layers": [ 1, 2, 0 ],
  "sequences": [
    { "name": "Idle", "frames": 24, "parts": [
        { "bone": 0, "keys": [ { "frame": 12, "move": [ 0, -8 ], "curve": "back" } ] },
        { "bone": 2, "clips": [ { "clip": 0 } ], "keys": [] } ] },
    { "name": "Hop", "frames": 36, "parts": [ ... ] }
  ],
  "loop_clips": [ { "name": "twitch", "frames": 8, "keys": [ { "frame": 0 }, { "frame": 4, "rotation": 10 } ] } ],
  "timeline": { "name": "stay", "blocks": [ { "sequence": 0 }, { "sequence": 0 }, { "sequence": 1 }, { "sequence": 0 } ] }
}
```

- **Pieces** are the flat rig's pictures by number: a name, one or two rectangles, `at` placing each from the head of
  the bone that shows it (y up), which is the piece's placement on its bone (step 2's Pivot tool moves the head and the
  `at`s back, as `movePivot` does); `objs` only where they aren't `generate_objs`'s; `obj_attribute` (default 0).
- **Bones, one set shared by every sequence**: `head` (the pivot, from the feet, y down), `tail`, `parent` (`null`:
  the root), `connected` (the head is the parent's tail and the bone's own move is locked; otherwise it keeps its
  offset), `default` (the default pose: `piece`, `hidden`, `move`, `rotation` in degrees, `scale`; absent fields are
  identity, and hidden when there's no piece). The source never holds a part per action: the bake makes each
  sequence's tracks.
- **`layers`**: the rig's layer order, front to back (absent: the bones in order). Every sequence draws it.
- **Sequences** (the game's actions): `name`, `frames` (the length, a multiple of 6 for the editor's own), optional
  `step`, and `parts`: per bone its `keys` (`frame`, `piece`, `hidden`, `move`, `rotation`, `scale`, `curve`, per-channel
  `curves` and Bézier `handles` as in section 19.2) and `clips`. A key's absent channel is the default pose's; its absent
  `piece` is the one shown before (held, never tweened); `hidden: true` shows the blank picture until a key with a piece
  or `hidden: false`. A key's absent `curve` is the file's `curve` (absent: `ease_in_out`).
- **Curves**: constant, linear, ease in, out, in and out (sine), Bézier, and the presets, each a named function of the
  share u (0 to 1) of the way to the next key, which the bake samples; they arrive at the next key with their effect:
  **snap** 1 − (1 − u)⁵ (quintic ease out: three quarters of the way after a quarter), **back** Penner's ease-out back
  (overshoot constant 1.70158: about 10% past the key, then back), **bounce** Penner's ease-out bounce (lands, bounces
  three times, never past the key), **elastic** Penner's ease-out elastic (2^(−10u)·sin((10u − 0.75)·2π/3) + 1: swings
  about the key, dying away).
- **Loop clips** (`loop_clips`): `name`, `frames` (its own length) and `keys` on its own time (constant unless they name a
  curve), placed on a part of a sequence by `{"clip": n, "start": f}`; it plays from the block's start (plus `start`),
  looping. Its channels **add** to the part's (moves and turns added, scales multiplied), and a clip key with a piece
  (or hidden) shows it over the part's until the next such clip key.
- **The timeline**: the game's sequence 0, a strip of blocks, each `{"sequence": n}` playing that sequence from its
  start (its parts restart: NNS restarts restarting parts at every sequence key) for `frames` (default: the sequence's
  length; longer loops it). Instances are separate blocks and cost a 2-byte key each; editing a sequence changes every
  instance (one pose, one set of tracks).
- **Keeps moving**: `pause` (false: the sprite never pauses, the game's idle 0xff) and `keeps_moving` (bones), baked as
  the idle parts: their places in `layers`.

### The bake (`bakeV2(source)`: the flat rig, warnings, shears, each part's track; deterministic)

- **Tracks**: one per part per sequence, for every bone the sequence draws (a part with no keys holds the default pose:
  one key), named `<bone>_<letter>` (a to z, then the number; characters a label can't hold become `_`), **ordered by
  sequence, then bone**. **Poses**: one per sequence, its parts the layers front to back at the bones' heads (a
  connected bone's at its parent's tail), restarting. **Sequences**: the timeline's blocks as keys `{pose, frames}`; the
  originals' other `strips` after it.
- **A part's keys**: an implicit key at frame 0 at the default pose (with the file's curve) unless one is keyed there;
  each key goes to the next by its curves; the last goes to the start key again at the length (a turn going on to it
  rather than back, as in section 19.2), which is the default pose unless the start was keyed. Then sampled as section
  19.3: every key starts a flat key of its own; inside its span a sample at each multiple of the step from the block's
  start (and at every cut below), each held to the next, equal samples merged; turns to 65536ths, scales to 1/4096,
  moves to whole pixels; key types grow plain, move, srt.
- **The seam**: a sequence of length L bakes frames 0 to L − 1: samples at 0, 6, ... up to the last multiple of 6 below
  L, each held 6 frames, so the flat track is L long and loops. Frame L is the next loop's frame 0, so the default pose
  (the end key) is never held there: it is held once, at frame 0. A middle key at 12 of a 24-frame loop bakes 0, −6,
  −12, −6 (eased in and out), not a second 0. A key placed at frame L itself (the end key, shown past the end, made
  explicit by moving it) is the last segment's target and bakes to a key held 0 frames at the end, as 4,730 original
  tracks end; it changes nothing the game shows.
- **Parents** (baked first; a circle is broken and warned of): a child's sample is its own movement about its pivot,
  then its parent's **baked** key's movement about the parent's pivot (the parent's track in the same sequence; the
  samples are also cut where the parent's keys change), turned back into a key about the child's pivot, as in section
  19.3. Connected: the pivot is the parent's tail and the child's move is 0. A parent's uneven scale over a turned child
  needs a shear: the nearest turn and scale, and the **shear warning** with the count (a quarter turn is exact). A
  parent the sequence doesn't draw is warned of (the child moves as the root's).
- **Pictures**: the pieces, then (only if a key or default is hidden and no piece is blank) one blank picture, Game
  Freak's (one empty rectangle at 256, −256).
- **Loop clips**: cuts at each clip key's frame in every repetition (and at the clip's step where it curves), the clip's
  values merged into each sample; a clip whose length doesn't divide the part's loop unrolls the track to both lengths'
  least common multiple (at most 3,600 frames; warned of either way).
- **Size**: `rigSizes(rig)` gives the five files' resident sizes exactly as `mcss_rig.files_from_rig` writes them
  (tested against `rig_check.py`), for the meter against the ~40 KB guidance (`RESIDENT_GUIDANCE`); the archive's LZ11
  size is left to `rig_check.py`.
- **Snapping** (the editor's rules; the format takes any frame, so converted originals keep theirs): `snapFrame` (the
  nearest multiple of 6, at least 0), `snapLength` (the nearest multiple of 6, at least 6), `bakedFrames` (the samples
  of the seam rule).

### Converting a vanilla sprite (`convertToV2`)

Each pose a sequence, each track's keys constant keyframes at their starts (the turn unwrapped in degrees, a piece named
only where it changes), the stay sequence the timeline, the others `strips`, the idle parts `keeps_moving`, and **one
set of parts**: a pose's part is matched to a bone by its track's name without the action's letter (`head_a` and
`head_b` are `head`), else by its place in the first pose (where that part's name isn't in the pose), else it is a new
bone; the bones are ordered by the first track they play, so the usual track order is usually the original's. A part
an action doesn't draw is absent from that sequence's layers. Where the originals don't follow the rules, a few
originals-only fields keep them, written only where needed (counts over the 1,516 sides):

| Field | Holds | Uses |
| --- | --- | --- |
| a part's `name` | its track's name where it isn't `<bone>_<letter>` (most originals' names: `body`, `bodyBa`) | 22,685 parts |
| a part's `frames` | its own loop where it isn't the sequence's (a converted sequence is as long as its longest part) | 3,534 parts |
| a part's `key_type`, `play`, `loop_start`, `bank_type` | the track's | |
| a sequence's `layers` | its own nodes: `head` where the pivot isn't the bone's (1,305), `play: continue`, `track_of` [sequence, bone] for a track shared with another pose (2,028), `instance`, `flags` | 1,586 sequences |
| a block's `frames`, `move`, `rotation`, `scale`, `flat` | the sequence key's (the whole sprite's place) | |
| `track_order` | the tracks' order where it isn't by sequence, then bone | 527 sides |
| `kept_tracks` | tracks no pose plays, as they are | 446 sides |
| `strips` | sequences 1 on (stop, the egg's) | 101 sides |
| `kept` | `info_padding`, `obj_mapping`, `extension`, `picture_labels` | 2 sides |
| `idle_nodes` | the idle parts as they are, where `keeps_moving` can't give them | none needed |

14,198 bones for the originals' 26,282 tracks. **Proven on all 1,516 sides** (every species, form, egg, Pokéstar group,
front and back): each converts, is written as the file's text, passes the editor's validator and the build's, and bakes
back to its flat rig **byte for byte with no warnings**, no exceptions (`npx tsx tests/v2-sweep.mts`, about 17 s).

### Tests (`tests/rig-v2.test.ts`, 14 of `npm test`'s 152)

The default pose (an empty sequence holds it; one middle key blends default, key, default; the seam; an explicit end
key; a keyed start; a default that isn't the rest); snapping and the step; each curve preset's samples (back's 10%
peak, elastic's swing, bounce never past) and a preset baked; connected against offset parenting at the analytic places
(a 90° turn of the head carrying its tail and the connected ear to (5, −21), the ear's move locked, an offset child's
move turned with its parent, a parent's move carrying both); the shear warning; a loop clip merged (pictures every 4
frames, a move added, a start offset, an odd length unrolled); hidden keys; the timeline (blocks sharing a sequence,
tracks named and ordered, poses, one edit changing every instance, determinism); the pause and the keeps-moving parts;
Pichu, Budew, Charizard and Kyurem form 2 (front and back) converted and baked back byte for byte; the source through
both validators (a bad curve refused by both); baked rigs through the build's rig validator and `mcss_rig.check`
(`rig_check.py`), with `rigSizes` equal to its sizes; a baked fresh rig (parents, curves, a preset, a clip, a hidden
key, two sequences on a four-block timeline) drawn by the editor's `render` against `mcss.render`
(`tests/mcss_render_rig.py`) pixel for pixel at 22 times; and the guard over res/'s `_rig_v2.json` files.

### What step 2 (the rig setup) builds on

- Load a side's `_rig_v2.json` if it has one, else `convertToV2` of its flat rig (vanilla; step 6 for first-editor
  armatures). Save: `bakeV2`, `mcss_rig.check` through the existing rig-check route, then write `<side>_rig.json` and
  `<side>_rig_v2.json` (both documents in the one undo history, as in section 19.8). Start fresh: `emptyV2` plus a first
  piece and bone. The server's Start fresh fix on the paused branch `worktree-agent-a9c612451c95305c3` (deleting a
  side's source through the server) is needed then, for `_rig_v2.json` too; this step didn't take it.
- Pieces are the `pieces` list. Moving a bone's head while moving its pieces' `at` back (as `movePivot`) keeps the
  picture in place; a connected child's head follows its parent's tail, so moving a tail must move the connected
  children's pieces back the same way. `layers` is the layer list; `default` is what the gizmos edit with no sequence.
- `bakedPoint` gives a point of a bone on the sprite as the game draws it (for gizmos), `trackOf` maps a part of a
  sequence to its flat track (for the preview's picking), `rigSizes` feeds the meter.
- Open: converted sprites have every bone parented to the root (their keys already follow their parents by hand);
  parenting one keeps it where it is only with a Keep Transform like section 19.4's `reparent`, which step 6 should
  port. Converted tails are a guess (toward the first picture's middle). Nothing in res/ changes in this step, so the
  ROM is unchanged and nothing was tried in the game.

## Built: step 2, the rig setup (2026-11-14)

The new editor is what **Edit rig…** and the sidebar open (`#tool/rig?folder=...&side=...`); the first editor is its
**Advanced (old editor)** view (`&editor=old`), which warns on a side that has a `_rig_v2.json`. The page is
`editor/src/modules/rig/SetupEditor.tsx` with `SetupPreview.tsx`, `SetupSheet.tsx`, `SetupPanel.tsx` and `SetupGuide.tsx`;
every edit is a pure function of the source in `setup.ts`, and the side's files are `setupFiles.ts`.

### Opening and saving a side

- A side opens from its `_rig_v2.json`, else from `convertToV2` of its flat rig, **in memory**: the file is made by the
  first edit (as part of that edit's undo step, the first editor's way of making an armature, so Ctrl+Z takes the file
  away again and gives the flat rig back). An untouched vanilla side opened and saved writes nothing (tested on four
  sides, and tried in the editor: an edit, undo, Save says "Nothing to save" and the file is unchanged).
- Every change of the source is baked (`bakeV2`) into the flat rig's document without a step of its own, so the size,
  the checks, Save and the Build button see what the game will get; one history over both (`history.ts`). Save checks
  the bake with the rig-check route (`mcss_rig.check`), then writes `<side>_rig.json` and `<side>_rig_v2.json`, both sides
  if both changed. The source is written as `orderedV2` in the compact layout with `$schema` first.
- A side with a first-editor armature (`_rig_source.json`) opens read-only with a notice: the Advanced editor, or
  **Start fresh…**, which deletes the armature through the server (`removable` in `server/weather.ts` now allows a
  side's `_rig_source.json` and `_rig_v2.json`, never its flat rig; the first editor's Remove armature and Start fresh
  say so when the server refuses, ported from the paused branch). Step 6 converts such armatures.

### The rig setup's edits (`setup.ts`)

- **Where things are**: `restMaps` gives each bone's map from the rest arrangement to the sprite in the default pose, the
  bake's composition (its own movement about its pivot, then its parent's) without the files' rounding; `boneEnds` its
  head and tail on the sprite; `restDelta` turns a drag on the sprite into a movement of the rest arrangement under a
  map (a head under its parent's, a tail under its own). The preview draws `defaultPoseRig`: the source with one empty
  sequence, every part holding its default, baked.
- **A head** (`moveHead`): the pivot moves and every picture stays where it is: the pieces the bone shows (by default or
  in a key) move their `at` back, a piece another bone shows too is copied for this one first, and the default's and
  each key's move are corrected where they turn or scale (by (R S − 1) of the shift, as `movePivot`), so the bone's map
  from the rest arrangement is unchanged and so are its children; the sequences' own pivots for it (converted
  originals' per-action heads) move with it. Exact where the corrected moves are whole pixels (a turn of a quarter, a
  scale of 2); otherwise the bake's rounding can shift a picture by a pixel. A connected bone's head is its parent's
  tail, so dragging it moves that.
- **A tail** (`moveTail`): the connected children's heads follow (their pivots move, their pictures staying, by the
  same rule); their own tails stay where they are, as in Blender. A connected child turned or scaled in its default
  can't keep its pictures exactly (its move is locked); they shift by (1 − R S) of the movement.
- **A whole bone** (`moveBone`): head and tail with its pictures; the connected children's heads follow; a connected
  bone can't move on its own. **A picture on its bone** (`movePieces`): the `at` of its pieces.
- **Parenting** (`reparentKeep`, the first armature's `reparent` for this format): the bone keeps where it is. Its
  default pose is written again relative to the new parent's (the same map from the rest arrangement), and each
  sequence's keys of it as constant keys at each of its baked keys and each of the new parent's key starts, computed from
  its baked track and the new parent's baked track (as section 19.4), keeping a key held 0 frames at the end and the
  originals' extra key fields. A vanilla sprite's part parented this way bakes back to the same flat rig byte for byte
  (Pichu's and Budew's back, tested); a parent's uneven scale over a turned child is warned of as a shear.
- **Connected** (`setConnected`): the head moves to the parent's tail with the pictures staying, and the bone's own
  moves are dropped (said so: they're locked); **Keep offset** keeps the head where it is.
- **Bones**: `addBone` (in front of every layer, and in the sequences that keep their own layers and the tracks' order),
  `addBoneForPiece` (its head where the picture stands on the feet, the middle of a piece centred on its head, or for a
  piece another bone shows, a copy placed so the picture stays), `deleteBone` (its children to its parent keeping their
  place, every bone number after it renumbered: parents, layers, lanes, `track_of`, keeps-moving, the tracks' order).
  **Pieces**: `addPiece` (centred on its bone's head, `at` [−w/2, h/2], which also keeps the OBJs' offsets small),
  `addRectangle` (placed beside the first as on the sheet), `setRectangle` (the piece's own `objs` dropped: they're
  generated again), `deletePiece` (a bone or key that showed it shows nothing). **Layers**: `moveLayer`, `setInLayers`.
- **Start fresh** (`freshV2`): `emptyV2`, one piece round the sheet's first art (`freshRectangle`), one bone showing
  it, the head at its middle, the picture standing on the feet. **Copy front to back** (`copySide`, on the back): the
  front's source with the side changed, the back keeping its box and stop flags.

### The page

- **Pieces** (the sheet card): drag on the sheet to cut a piece (Shift: the chosen piece's second rectangle); move and
  resize snapped to tiles (Alt: pixels) and then to the nearest size the DS's OBJs can be cut into (`validSize`: a side
  of 64 needs the other 32 or 64). The list: thumbnail, name, sizes, the bones showing it, + Bone, delete.
- **The preview**: the default pose, bones as Blender's octahedral shape from the round head to the small tail, an offset
  child's dashed link. **Bones** (B) drags heads, tails, bodies and pictures, and draws new bones on empty space (Ctrl: a
  child of the chosen bone, connected when drawn from its tail); **Move** (G), **Rotate** (R, Shift 5°), **Scale**
  (S: the X and Y handles and the ring from the paused first-editor branch) pose the chosen bones' default. The chosen
  bones' ends and bodies are picked before the others'. Drags work in window coordinates, the canvas only growing
  during a drag.
- **The side panel**, as the Ambients panel: Bones (the tree; drag onto a bone to parent, onto Root to free; the
  connected/offset chip), Bone (name, shows, parent, link, head, tail), Default pose (move, turn, scale, Reset pose, and
  the one-line hint that the setup is the default pose), Layers (drag to reorder, Hide/Draw), Piece (name, rectangles,
  its place on its bone), Sequences (read only), Checks (the bake's warnings, `mcss_rig.check`, rectangles' sizes, art
  outside every piece).
- **? How rigs work**: pieces, bones and their two ends, parenting connected or offset, layers, the default pose.

### Tests (`tests/rig-setup.test.ts`, 6 of `npm test`'s 158)

A head dragged keeps the default pose's pixels identical (at rest, turned a quarter, turned and scaled by 2 with a move;
a root and a child bone; a shared piece copied); a tail dragged moves the connected ear's head, its file head and its
baked pivot, keeps the pixels, and turning the parent then carries the ear's head with the tail (analytic place); the
body's tail moves no one; a whole bone; a piece on its bone. Parenting keeps the transform (unparenting and parenting
again a turned child of a turned and moved parent: the ends and the pixels the same), refuses a circle, and keeps
Pichu's front and Budew's back baking to their files byte for byte. Connected keeps the pixels; deleting a bone
renumbers and keeps the child's place; pieces added, a second rectangle, a bone for a piece standing on the feet, a
piece deleted; a bone added to Kyurem's converted rig bakes with no warnings. Start fresh (two sizes) and Copy front to
back pass both validators, and their bakes the rig validator and `rig_check.py`. An untouched vanilla side's
conversion bakes to its file's text (four sides). Also tried in the editor (a scratch copy of Budew, removed): two
rectangles drawn, two bones, parented in the outliner and connected, the body's tail dragged with the bud following,
the default pose turned, saved (both files, which pass the res/ guard), undo and redo; the armature notice and Start
fresh deleting it; Copy front to back.

### What step 3 (sequences) builds on

- The mode switch in the header (Rig setup | Sequences) and the read-only Sequences section become the sequences'
  list; the page's `commit(next, phase)` already takes any source change as one step, drags amending it.
- The gizmos' maths (`restMaps` under a pose: it takes the transform of each bone, so a key's values at the playhead
  give the posed maps; `restDelta`, `axesOf`) and the preview's picking (`owners` through the layers to bones) carry
  over to keying: a sequence's preview is `bakeV2` of the source at the playhead's frame instead of `defaultPoseRig`.
- `reparentKeep` already rewrites keys; `moveHead` corrects keys' moves. Neither yet handles loop clips (step 5).
- The size meter is `rigSizes` of the bake; the checks list the bake's warnings.

## Built: step 3, sequences (2026-11-14)

The header's **Sequences** switch (beside Rig setup, remembered per viewer) opens the sequences: the list, the open
sequence's preview, its timeline and graph editor in the dock, and the chosen part at the playhead. Every edit is a
pure function of the source in `editor/src/modules/rig/sequences.ts`; the page is `SetupEditor.tsx` with
`SequenceTimeline.tsx`, `SequenceGraph.tsx` and `SequencePanel.tsx`, and `SetupPreview.tsx` draws both modes. The save
path is step 2's: every change baked into the flat rig's document, Save through the rig-check route, both files, one
undo history.

### The rules (sequences.ts)

- **A part's values at a frame** (`partValues`) are its curves there, read through the bake's own key poses
  (`lanePoses`, taken out of `bakeV2` so the two can't differ): the implicit start at the default pose, the pictures held
  from key to key. **Keying** (`setKeyAt`) changes the key at a frame or makes one from those values, so making a key
  changes nothing until it is moved. **A key holds only what it changes**: a channel it had, or one that differs from
  the default pose (an absent channel is the default's, the format's rule); a piece or Hidden only where the picture
  changes. So edits of the rig setup (the default pose, heads, parents) still carry into every sequence.
- **Keys are named by their place in their part's lane** (`KeyRef`); lanes are kept in frame order. A drawn part's lane
  left with no keys is dropped (it bakes as no lane does); a part the sequence doesn't draw keeps its empty lane, so its
  children still follow its track.
- **The implicit start and end.** The start (`START`) is the default pose at 0 where nothing is keyed; the end (`END`) is
  the start again at the length, drawn one step past the last baked frame (the next loop's 0; the seam rule of step 1).
  Neither can be deleted. Moving or copying one makes a real key with its values where it lands (the end: the start's
  values, and its picture where the part shows another before; `{ "frame": 30 }` alone is the default pose), so dragging
  the end key back makes a part settle early. A curve given to the start makes it a real key at 0 holding it
  (`{ "frame": 0, "curve": "snap" }`). A real key at the length is the explicit end key (held 0 frames, as step 1 says).
- **Moving keys** (`moveKeys`) moves the chosen ones together by a delta (whole steps with the snap), inside 0 to the
  length; a moved key replaces one it lands on. **Copy and paste** (`copyKeys`, `pasteKeys`) keep the keys' parts and
  their spacing, pasted from the playhead. **Deleting** (`deleteKeys`) takes any keys of any parts in one change.
- **Curves** (`setCurve`): every channel's, or one channel's (`curves`), the presets included; Bézier handles
  (`setHandles`) as section 19.2 of battle-sprites.md.
- **Snapping** (the editor's): the playhead to the nearest multiple of 6, stopping at the last baked frame
  (`playheadAt`); a key drag by whole steps (`snapDelta`); the length by `snapLength`; keys made at the start of the
  playhead's step (`keyFrameOf`), which is the frame the game is showing. Alt bypasses the snap while dragging, and
  **Snap 6** turns it off.
- **Never keyed while playing**: a gizmo press, K, Shift+K, a field of the Part section or a paste first pauses the
  preview and puts the playhead on the step's frame (`pauseForKeying`), then keys there.
- **The list**: `addSequence` (48 frames, the default pose), `duplicateSequence` (after it, an original's own track names
  not copied), `deleteSequence` (refused for the last one, and for an original's sequence whose tracks another plays),
  `moveSequence`, `renameSequence`, `setLength`, `resetSequence` (no keys; its length, layers, loop clips and the other
  sequences untouched). Each renumbers every sequence number in the source: the timeline's and the strips' blocks (a
  deleted sequence's dropped; an empty timeline plays the first), `track_order` (a new sequence's tracks appended),
  `track_of`.
- **The preview's rig** (`sequenceRig`): the side's bake with its strips replaced by one that plays the open sequence,
  looping, so the preview is the game's own frames of that sequence; `posedMaps` places the bones at the frame keys go to.

### The page

- **The preview**: the open sequence at the playhead, playing at 60 frames a second (`player.ts`'s Clock, no battle
  pauses here), play and pause (Space), ±6 (the arrows; ±1 with the snap off), Home, a scrub bar; onion skin (6 before and
  after), Bones, Feet, Shiny, 2–6×; Move (G), Rotate (R), Scale (S, X and Y handles and the ring) key the chosen parts.
  The canvas only grows while a sequence is open, so the sprite doesn't jump as it plays.
- **The dock** at the bottom, left of the side panel (drag its top edge; Timeline, Graph or Both, remembered), with
  **Snap 6** and the timeline's zoom.
  - **Timeline**: the ruler (press or drag to scrub; the end's ⇔ grip changes the length), an **All parts** row (a key
    there stands for every key at its frame) and a row per part in the bones' tree order. Keys coloured by their curve
    (presets pink); the hollow start and end keys; the stretch past the end shaded. Click, Shift/Ctrl-click, box-select
    on empty space (Shift adds), drag the chosen keys in time, double-click to go to one; Delete, Ctrl+C, Ctrl+V, K,
    Shift+K, Escape.
  - **Graph**: the chosen parts' curves (the first part solid, the others dashed and named), the 6-frame steps the bake
    holds faint underneath, the implicit keys hollow; click, box-select, drag in time and value, Bézier handles (Alt
    breaks them); the curve buttons, plain then presets, for the chosen keys on every channel or the one clicked.
- **The side panel** (Ambients layout): **Sequences** (open, + Sequence, Duplicate, Delete, drag to reorder; each row's
  length, keys, and how often the timeline plays it), **Sequence** (name, length in frames with −6 and +6, **Reset
  sequence…** with a confirm, one undo step), **Part** (the chosen part at the playhead: ◇ Key, ◆ Key all parts, Delete key;
  its picture as thumbnails with Hidden; move, turn, scale; its curve to the next), **Checks** (the bake's warnings
  include a key past the end).
- The rig setup's Sequences section is a summary now; **? How rigs work** gained Sequences, Keys and Curves.

### Tests (`tests/rig-sequences.test.ts`, 10 of `npm test`'s 168)

Snapping (the playhead by 6 stopping at the last baked frame, Alt's frames, a drag of 10 going 12, lengths, keys held
inside the loop); an empty sequence holding the default pose and one middle key blending default → it → default (the
baked turns against `eased`, no second default at the seam, the values between keys the curve's); the end key moved back
(`{ "frame": 36 }`, the samples settling, the implicit end still at 48) and copied (the start's values pasted at 42), and
an explicit end key baking to a key held 0 frames; K and Shift+K from the values (a second K changes nothing; pictures
and Hidden per key); Reset sequence touching nothing else; three keys box-selected across three parts deleted with the
start ignored, undone and redone as one step of `RigHistory`; "back" applied to a key baking each sample as the preset
(past the default the other way), the start given "snap" becoming a key at 0, one channel's curve; keying never while
playing (a playing clock paused on the step's frame, without the snap on the frame shown, a paused one untouched); the
list's add, duplicate, reorder and delete keeping the timeline on the same sequences; and **the preview's frames equal
mcss.render**: for both sequences of a keyed source, the preview's rig has the same poses and tracks as the source baked
with only that sequence on its timeline, and the editor's `render` of it equals `tools/paperwhite2/mcss.py`'s render of
that bake (through the five files) pixel for pixel at 11 times each, past the loop's end too.

Also tried in the editor end to end (a scratch copy of Budew in the worktree, removed after): three bones (bud connected
to the body, a foot keeping its offset); **Idle** of 48 frames with the bud turned at 24 by the Rotate gizmo (the
playhead clicked at 22 snapped to 24) given **Back**, its overshoot in the graph; **Hop** of 36 with the body moved up 14
at 18 by the Move gizmo, a squash at 6 and the landing at 30 typed in the Part section, Shift+K at 12 and 24; a box over
frames 9 to 15 of every row choosing the three keys at 12 and Delete removing them (Ctrl+Z bringing all three back, Ctrl+Y
taking them again); the bud's end key dragged to 30; Reset sequence and its undo; Ctrl+S writing both files, which bake to
each other (`npm test`'s res/ guard ran with them in place). A vanilla side (Budew's back) opens in Sequences mode with its
converted keys (4-frame keys, two sequences) playing as before. Nothing in res/ changed in this step.

### What step 4 (the timeline strip and the preview) builds on

- The timeline is `src.timeline.blocks` (`{ sequence, frames? }`); the list's edits already keep it on the same sequences
  (`renumber` in sequences.ts), and each row shows how often it plays a sequence. A new sequence isn't on it yet, so the
  battle doesn't show it until step 4 places it.
- The preview's rig is `sequenceRig`: step 4's strip preview is the bake's own sequence 0 (the timeline as baked) with
  the battle's pauses (`Clock.pauses`, the keeps-moving parts as `idle_parts`), on the same Clock; `SetupPreview` already
  draws any rig at a clock's time with its own layers.
- The dock (`rig-dock`, Timeline / Graph / Both) has room for a strip view: blocks dragged like keys, with the snapping
  helpers (`snapDelta`, `snapLength`) and the timeline's box-select and drag code to borrow.
- The size meter is still `rigSizes` of the bake: every instance is one 2-byte block key, so step 4 can show the cost of a
  block next to it.
- Open: loop clips (step 5) aren't shown or edited; `reparentKeep` and `moveHead` don't touch them either. Keys hold
  absolute values per channel (as the format says), so changing a default pose's channel that a key also holds doesn't
  move that key.

## Built: step 4, the timeline strip and the battle pause (2026-11-14)

The header's third mode, **Timeline** (beside Rig setup and Sequences, remembered per viewer): the loop the battle plays
as a strip of clips in the dock, its preview at game speed with the battle's pause, and the side panel's sequences, the
chosen clip and the pause. A mode rather than a dock tab in Sequences, because what it previews differs (the whole strip
with the pauses, not the open sequence on its own) and its panel edits the sprite as a whole (what plays, what keeps
moving); double-clicking a clip goes to Sequences with that sequence open. Every edit is a pure function of the source in
`editor/src/modules/rig/timeline.ts`; the page is `SetupEditor.tsx` with `StripTimeline.tsx`, `StripPreview.tsx` and
`StripPanel.tsx`. The save path is unchanged (the bake in the flat rig's document, Save through the rig-check route,
both files, one undo history). The format needed nothing new: the strip is `timeline.blocks`, the pause `pause` and
`keeps_moving`, as step 1 defined them.

### The rules (timeline.ts)

- **A clip is a run of equal blocks** (`clipsOf`): the blocks in a row that play the same sequence are one clip with a
  count, the user's "Idle ×4". Each block is still one instance, one key of the game's sequence 0 (`{pose, frames}`); the
  sequence's pose and tracks are stored once, so editing it changes every instance and a repeat costs one 8-byte key (and
  its 2-byte result, shared). Blocks of an original with their own fields (`frames`, `move`, ...) join only blocks equal
  to them. (Not the format's `clips`, which are a part's loop clips: step 5.)
- **No trimming**: a clip plays its sequence's full length, since the game's blocks restart the sequence's parts; an
  editor-made block has no `frames`, so it follows the sequence's length when that changes. An original's block keeps its
  own `frames` (shown as such).
- **Edits**: `addClip` (at the end, or before a clip; beside a clip of the same sequence it joins it), `setRepeat` (×n,
  at least 1), `moveClip` (before another clip, or to the end; two runs of one sequence that come to touch are one clip),
  `deleteClip` (all its instances; refused for the last clip, as the strip is the battle's loop: `cantDeleteClip`).
  `stripFrames` is the loop's length, `clipAt` the clip, instance and frame at a time of the strip (looping), `playCount`
  how often a sequence plays.
- **The pause**: `setPause` (Pauses in battle: false bakes `idle_parts: null`, the game's 0xff, and keeps the
  keeps-moving parts for when it's on again), `setKeepsMoving` (a bone in or out of `keeps_moving`; an original's kept
  `idle_nodes` become bones first: `keepsMovingOf`). The bake gives the idle parts as the bones' places in the rig's
  layers (step 1).
- **The pause's simulation** is the first editor's (`player.ts`'s Clock, `BtlvMcss_OnAnimationEnd` and
  `BtlvMcss_IdleTask`): at a loop's end a roll (1 in 3, then 2, then surely) starts the pause; the strip's time stands at
  the loop's start (sequence 1 where an original has a stop strip), only the idle parts' tracks go on (from the block's
  start plus the pause's frames), for 48, 56 or 64 frames, then the loop again. `Clock.pauseNow` starts one on demand,
  as it starts at a loop's end.

### The page

- **The strip** (the dock, full width left of the side panel): clips as wide as they play, in their sequence's colour,
  the instances divided by dashes, the name and ×N, the frames; the ruler (press or drag: the playhead, by 6), ↻ at the
  loop's end, the playhead over the whole strip, the clip and instance playing lit. Drag a sequence from the side panel
  onto the strip (a marker shows where it goes), drag a clip to move it, click to choose it (Delete deletes it, Escape
  lets go), double-click to open its sequence. The header: clips, frames, the strip's bytes; zoom 1–6.
- **The preview** (`StripPreview`): the bake itself, whose sequence 0 is the strip, drawn by `render` on a canvas that
  holds every frame of the loop (so it doesn't jump), at 60 frames a second on its own Clock. Play and pause (Space),
  ±6 (the arrows), Home, scrub; under it the frame, the clip, which instance and its frame. **Preview a battle pause**
  (again: end it) and **Random pauses, as in battle**; during a pause a badge counts its frames and the parts that keep
  moving are outlined green ("everything frozen" when none). Feet, Shiny, 2–6×; a click chooses the part under it.
- **The side panel** (Ambients layout): **Sequences** (each with its colour, length, keys, played ×N or **not played**,
  **+ Add**; drag onto the strip; double-click to open), **Timeline** (clips, blocks, the loop's length; the chosen clip:
  Open, ◀ Earlier, Later ▶, Delete clip; its sequence, **Repeats** ×N with −1 and +1, its length, where it starts), **Battle
  pause** (**Pauses in battle** On/Off; **Keeps moving** per part, in the bones' tree, for the parts the rig draws),
  **Checks**. The size meter in the header is `rigSizes` of the bake, which is the strip's.
- Sequences mode's list: a sequence on no clip shows **not played** and **+ Add** (to the end of the timeline).
- **? How rigs work** gained The timeline and The battle's pause.

### Tests (`tests/rig-timeline.test.ts`, 6 of `npm test`'s 174)

Clips added, repeated, moved and deleted as `timeline.blocks` and the baked sequence 0 (Idle ×4 + Hop:
`[0,0,0,0,1]`, keys `{pose 0, 48}` ×4 and `{pose 1, 36}`; joining beside a clip of the same sequence; Idle ×4, Hop,
Idle ×3 with Hop moved first making Idle ×7; the last clip kept; an original's 240-frame block not joining plain ones;
`clipAt` across instances and the loop); clip edits as single undo steps of `RigHistory` with the bake following; one edit
of Idle changing all four instances' rendered frames (no extra tracks or poses, the hop untouched); **the strip's preview
equal to `mcss.render`** of the bake through the five files (`tests/mcss_render_rig.py`) pixel for pixel at 16 times over
the whole strip and past its loop; Pauses in battle and Keeps moving baked to `idle_parts` (the ear the second layer:
`[1]`; off: `null`; an original's `idle_nodes` turned into bones); and the pause's simulation (`pauseNow(56)`: for 55
frames the head and body keep their keys and the strip's time stands at 0 while the keeps-moving ear goes through its
keys, then the loop again at 0; with none keeping moving everything is frozen; with Pauses off no pause starts, forced or
random; the random roll, won, starting a 48-frame pause at the loop's end).

Also tried in the editor end to end (a scratch copy of Budew in the worktree, removed after; CDP): Start fresh, three
bones (bud connected to the body, a foot keeping its offset); **Idle** 48 with the bud turned 25° at 24, **Hop** 36 with
the body up 14 at 18 (Hop showing **not played**); in Timeline, Idle ×4 by +1, Hop dragged from the list onto the strip's
end, dragged to the front and back with Later ▶; Idle added with + Add, chosen and deleted with Delete, Ctrl+Z and Ctrl+Y;
the bud's Keeps moving on; the strip played (Idle 3 of 4, then Hop, lit); **Preview a battle pause** (48 or 56 frames:
the badge counting, the bud outlined green and turning, the canvas's pixels changing through the pause while the rest
stood, then the loop again); Ctrl+S writing both files (`timeline.blocks` `[0,0,0,0,1]`, `keeps_moving` `[0]`, the flat
rig's `idle_parts` `[2]` and its sequence 0 the five blocks), which pass the res/ guard; double-clicking Hop's clip
opening Hop in Sequences mode. Nothing in res/ changed in this step.

### What step 5 (loop clips) builds on

- The format already holds them (`loop_clips`, a lane's `clips: [{clip, start}]`) and the bake merges them into each
  part's track (step 1); nothing in the editor shows or edits them yet. Name them **loop clips** in the UI: "clip" on the
  timeline strip means a run of blocks (`timeline.ts`).
- A loop clip lives on a part's lane in a sequence, so its natural home is the Sequences mode's timeline (a sub-row or a
  bar under the part's keys) with its own small editor for its keys on its own time; `sequenceRig` and the step-3 preview
  already play whatever the bake gives, clips included, and `partValues`/`lanePoses` don't include them yet.
- **Keeps moving with a loop clip** is the flame case: during the pause an idle part plays its baked track on, and a loop
  clip is merged into that track, so a keeps-moving part with a flicker clip flickers through the pause with no more work
  (the Timeline mode's Preview a battle pause shows it). A clip that doesn't divide its sequence's loop unrolls the track
  (warned, up to 3,600 frames), which the size meter shows.
- `reparentKeep` and `moveHead` don't account for loop clips yet (a clip's move adds to the part's, so a moved head or a
  new parent changes what a clip's move means); `deleteBone` drops the bone's lane with its clip uses, and `deletePiece`
  already renumbers the pieces the clips' keys show.
