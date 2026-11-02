# Reading vanilla maps (design, 2026-11-02)

The map maker (`tools/paperwhite2/map_maker.py`, `map_edges.py`; [map-editor.md](map-editor.md), Painting maps) paints
over existing chunks far more often than it makes new ones, and nearly every flaw found in testing came from not
understanding the chunk around the painting: a bridge read as a path, a path's edge tile read as dirt, a riverbank
tile holding both land and water, vanilla faces cut along tile lines that their shapes don't follow. Each was patched
on its own. This design replaces the patches with a reader that describes every vanilla tile in the same terms the
user paints with, a test that proves the reading on whole chunks, and seams and rules built on it.

## Why the patches kept coming

- **One clue per tile.** A kept tile was classified by its tile type, then by the texture over its middle. Bank,
  bridge and path-edge tiles each hold several things (land and water; a deck over a bank; grass on one side, dirt on
  the other), so one label can't describe them.
- **Seams cut, not matched.** Where painted meets kept, vanilla's faces are cut along the tile line and the
  generated ones laid beside them. Vanilla's shapes don't follow tile lines (banks at 0.38 and 0.62 of a tile,
  bridges over banks), so the cut ends show: slivers, drops, stubs.
- **One height per tile.** A bank tile has land and water, a bridge tile a deck over a bed. (The tile grid drawn at
  the painted height rather than water's surface is a small case of this.)
- **Rules as code branches.** Every corner and edge decision is a branch in the generator, so each fix risks another
  case.

## The reader

`tools/paperwhite2/map_reader.py` reads a chunk (its model, collision and props, as the game has them) into one record
per tile, described from every face over the tile, not one point. What a record holds is in "The record" below. From
the raw facts it derives the tile's reading:

- its **terrain** and **family** (grass, path, water, and later ledges, cliffs), with a confidence;
- its **levels**: the ground, and where there are more, the water's surface and bed, a structure's deck;
- whether it's an **edge**, which way it faces and what's outside it: read from the texture's own gradient, since an
  edge texture runs from its outside (v 0, grass on michi01a) to its inside (v 1); and whether its corners are round,
  square or concave, and whether its border bends (a vanilla "point");
- what **stands on it**: structures (opaque, above the tile's own ground: a bridge's deck) and decorations
  (see-through: trees, fences, grass decals), which painting leaves alone unless told to erase them.

Which textures play which role isn't listed by hand: a terrain's ground is planar-mapped and flat; an edge texture is
mapped along a border with v across it; a wall is vertical; a decoration is masked or blended. The reader learns the
roles from how the chunks of an area use their texture set, and the style names the families.

**The Paint tab shows the reading** as a layer: each kept tile in its terrain's colour, edges with their direction,
structures and decorations outlined, low-confidence tiles marked. A misreading is seen before generating, and the
user corrects it by painting over it (or with the eyedropper below). The painting is the same vocabulary as the
reading: a painted tile is a reading the user chose.

## The round-trip test

Read a vanilla chunk, turn the reading into a painting, generate the chunk from it, and compare the result with
vanilla tile by tile: terrain, levels, the cross-sections along each tile side, texture coverage seen from above,
and a top-down render for the eye. If a chunk comes back as itself, the reader and the generator handle its real
cases; each tile that differs is a misreading or a missing rule, judged on whole chunks rather than the case at hand.
`map_reader.py roundtrip MODEL` prints the differing tiles and writes the renders side by side.

The test runs on a handful of chunks of different terrain before anything is built on it: Route 20's river and
forest (overworld_2_map04_20), a city block, a beach and the sea, a mountain route with cliffs and ledges, a desert
route. Only when those come back well is the atlas built.

## The atlas: every vanilla overworld chunk, read once

`map_reader.py atlas` reads every overworld chunk of the original game (from the tag `w2-original`, never the
working tree, so the user's edits never enter it) into one SQLite database, kept out of git (`build/map_atlas.db`;
it is derived from the decomp's own `res/`, and rebuilt in minutes whenever the reader changes). The game has about
190 overworld chunks of 32 by 32 tiles: some 190,000 tile records. It gives:

- **the texture roles**, learned across every area and texture set rather than from one chunk;
- **the corpus of real cases**: every neighbourhood the game has, indexed by its signature (the readings of a tile
  and its eight neighbours), so the generator's rules can be checked against how the game drew each case, and a rule
  missing for a case is found by query rather than by testing;
- **examples to borrow**: for a neighbourhood the rules don't cover, the closest vanilla tile's geometry, read and
  re-placed (see the eyedropper);
- **the round-trip test on everything**: every chunk, scored, so a change to the reader or the rules is measured on
  the whole game.

It is built only after the round trip passes on the test chunks above, as the user asked.

## The eyedropper

Two kinds, both on the Paint tab:

- **Copy the reading** (the default): Alt+click a tile, here or in any chunk of the atlas, takes its reading (terrain,
  edge, direction, corner kind, flags); clicking paints it. The generator then generates it, matching its
  neighbours. This fixes a misread tile, and places a case the user has seen elsewhere.
- **Stamp the tile**: takes the vanilla tile's own faces, clipped to the tile, and places them as they are (textures
  imported where the area's sets lack them). Its seams match only where the neighbours are as the source's were, so
  it's the exception, for a piece the generator can't make (a unique rock, a stair's foot). The Faces tab's copy and
  paste does the same for whole objects.

## Textures from other areas

The atlas records where each texture lives (its set, and its seasons' sets) and what it's used for, so a painting
can use a terrain whose textures aren't in the chunk's set: they are added through the texture imports the editor
already writes (`res/field/maps/textures/<set>/imports.json`), to every season's set, as pasting does now. Two
limits go with it, which the editor shows before importing: a set has its seasons' variants or it doesn't (a texture
with no autumn version stays the same in autumn), and the area's textures share the DS's texture memory, so the
import shows the set's size against what the game's largest sets use.

## The record

What the atlas keeps of each tile. Positions are in the tile's own coordinates (0 to 1 across, heights in units);
"over the tile" means the parts of faces inside the tile's square, faces being clipped to it.

**Where it is**: zone, chunk model, matrix cell, the tile's x and z in the chunk and on the overworld, the area and
its texture sets by season.

**Collision**: each layer's tile type (raw, and its flags where known), height, shape and slope, split planes.

**Surfaces**: per material over the tile:
- the texture, its alpha mode, its sampler (repeat or clamp), vertex colours if any;
- the share of the tile it covers seen from above, and its height range;
- its facing: flat, sloped (with the slope) or vertical (with the side it faces);
- its mapping: planar (u and v as x and z over a repeat, with the offset) or along a border (u along a direction, v
  across it, with v's value at each side's middle and at each corner);
- triangles and vertices, for the budget.

**Levels**: the topmost opaque flat surface (the ground), and under or over it the water's surface, the bed, a deck.

**Sides**: for each of the four sides, the cross-section along it: the surface heights sampled at eight points, with
the texture and v at each. This is the seam's signature: two tiles join cleanly where their shared side's
signatures agree, which is what seam matching compares, and what the round trip checks.

**Walls**: vertical faces on or near the tile's sides: their side, top and bottom, texture.

**What stands on it**: decorations and structures over the tile, each with its bounds, height above the ground,
textures, and the prop or object it belongs to (props are nodes of their own).

**Events**: warps, doors and other events on the tile (from the zone's events), so painting never buries a door.

**The reading** (derived): terrain and family, confidence, levels, edge direction(s) and what's outside, corner kind,
bend and its depth, structure and decoration flags.

**The neighbourhood** (derived, indexed): the readings of the eight neighbours and their heights relative to the
tile, as one signature to look cases up by.

Per texture the atlas also keeps its learned role and how often each role was seen, and per chunk its totals (for the
round trip's score).

## Seams matched to vanilla

Where a generated edge meets a kept tile, the generator reads the kept tile's side signature and ends its own
profile on those points: the band's lines meet the kept surface at its heights, and the cut follows the kept
geometry's own cross-section instead of slicing it along the tile line. Kept faces are only cut where they cross into
a painted tile; a kept tile is never redrawn (the user decided that, after a margin that redrew tiles overwrote a
bridge). Structures and decorations on painted tiles stay unless the user erases them, so painting under a bridge
keeps the bridge.

## Rules as data

Each family gets one table in the style: what is drawn for each layout of a tile's neighbours, by their readings:
straight, convex corner (round or square), concave corner, an end against a structure, a continuation into a kept
edge of the same family, a T. The generator looks cases up rather than branching, and the atlas lists the layouts the
game has that the table lacks. The square-corner brushes become a per-tile flag the table reads. A new tile kind
(half-tile grass ledges with their round convex corners, cliffs with their jutting pieces like the paths' bends) is
then a family, its profile and its table.

## Built so far (2026-11-02)

- `tools/paperwhite2/map_reader.py` (`read`, `show`; `--rev w2-original` reads the game as it shipped): every face of
  the chunk clipped to each tile, and the facts collision, surfaces, levels, sides, walls, ground, standing, props,
  budget, reading, filled and neighbourhood; the chunk's texture roles. The reading has an edge (an edge texture over
  half the tile or more, or with a bank's slopes), a bend (an edge texture reaching a little into a plain tile of its
  terrain, as a path's middle at a point), a slope (cliffs and banks: downhill from the faces' normals), and when no
  ground is drawn, the terrain of its neighbours (filled). Not yet told apart: stairs (read as a cliff), Virbank's
  diagonal pipes (a slope). The ground is where one walks: the surface at the first collision layer's height, so a
  bridge or a town's raised road is a deck (with what lies under it) rather than a hole to the floor below; each
  collision layer has its own reading (layers); confidence is how many of the ground's five points agree, and
  whether the style knows the texture is apart (known).
- **Vanilla's own holes**: the game leaves some drops without walls where the camera never looks (behind Route 20's
  forest, under some banks). The fact open_sides records them; the round trip and the atlas skip them rather than
  learn or copy them. A fact is one function registered with
  `@tile_fact` (or `@chunk_fact`): adding a record is adding one. Not yet: events (warps, doors), the atlas, the
  round trip.
- The Map Editor's **Reading** toggle: the chosen chunk's tiles coloured by their reading, arrows at edges' outsides,
  structures boxed, unsure tiles dashed; a click shows the tile's record; read as it is now or as the original game.

## Order

1. The reader, per chunk, and its layer in the Paint tab.
2. The round trip on the test chunks; the reader and the generator fixed on them.
3. The atlas, once the round trip passes.
4. Seam matching on side signatures.
5. Rule tables, then the eyedropper (reading first, then stamping).
6. Textures from other areas, with the season and memory checks.
7. New families: ledges, cliffs.

What stays from the current map maker: the profiles, the bends (which land where vanilla's do), the painted edge
terrains, the rounding and the strips. The rewrite is in the reading, the seams and the rules.
