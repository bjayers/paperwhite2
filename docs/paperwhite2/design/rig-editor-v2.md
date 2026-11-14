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
