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

## The atlas, built (2026-11-04)

`tools/paperwhite2/map_atlas.py build` reads all 1,065 map chunks of w2-original (overworld 187, caves and buildings
878) in under two minutes into `build/map_atlas.db` (0.9 GB, out of git), twice: alone, then with the roles the game
agrees on (`build/map_atlas_roles.json`: 538 textures whose role three quarters of five or more chunks share, and
edges' insides). Unsure tiles: 0.25% of the overworld's drawn tiles, 2.4% of the rest's. `roles`, `cases`, `record`
and `sql` query it. The reader takes the consensus when the roles file exists (MAP_READER_NO_ATLAS=1 reads alone).
Also made readable for it: chunks with a collision plane per tile (Join Avenue), skins whose joints are turned and
scaled and bound back.

## Round-trip findings (2026-11-04)

`tools/paperwhite2/map_roundtrip.py MODEL [--style STYLE] --out DIR` (a style is drafted from the chunk's reading
where none is given: its ground textures as terrains, its edge textures as plain one-tile edges). Scores over the
tiles the map maker can make (terrain, edge, height within 2 units, side cross-sections, texture cover):

| Chunk | Style | Triangles (vanilla → generated) | Terrain | Edge | Height | Textures differ |
| --- | --- | --- | --- | --- | --- | --- |
| Route 20, map04_20 | route_20 | 1,114 → 1,686 | 90% | 97% | 95% | 14% |
| Route 20, map05_20 | route_20 | 1,073 → 1,986 | 76% | 96% | 97% | 28% |
| Route 13, map22_08 | drafted | 619 → 649 | 91% | 95% | 90% | 35% |
| Virbank, map06_20 | drafted | 999 → 1,380 | 74% | 60% | 74% | 52% |
| Desert Resort, map11_15 | drafted | 267 → 498 | 91% | 98% | 100% | 52% |
| Desert Resort 2, 01_01 | drafted | 579 → 1,687 | 72% | 83% | 88% | 43% |
| Wellspring Cave, 00_00 | drafted | 2,245 → 2,533 | 82% | 60% | 82% | 49% |
| Nuvema Town, map24_23 | drafted | 955 → 410 | 97% | 95% | 82% | 61% |

Plain tiles come back nearly exact everywhere (terrain 100%, textures within 1–13%). What fails, in order of reach:

1. **Edges at height changes.** The game draws its edge textures where the ground steps: a cliff's or ledge's top,
   a cave floor's rim, the desert's sand over its cliffs, half-tile grass ledges. The map maker bands an edge only
   against a neighbour at the same height, so all of these come back as bare ground (the desert's and the cave's
   edges score 11–14%). This is the ledge and cliff family (with Route 20's half-tile ledges and the east cliff).
2. **Cliffs and slopes.** No cliff family: cliffs come back as flat blocked ground, dunes (yamasaba01) as flat
   sand.
3. **Chunk borders.** The map maker draws no band against tiles past the chunk; vanilla's edges run on into the
   neighbouring chunk (map05_20's path along its west border). Seams need the neighbour chunk's reading.
4. **Triangles.** Generated chunks have 1.1–2.9 times vanilla's triangles on simple ground (the ground rectangles
   split to meet every edge's corners); merging and the budget need work before large paintings.
5. **Towns** are decks, walls and props over a floor (Virbank's walkways over its canal): outside what painting
   makes, and best edited as objects.
6. Water edges: vanilla keeps a flat bed under its banks, ours slopes it (the ground's height differs by 5 units,
   the sides agree).

## Steps: ledges and cliffs (2026-11-04)

The atlas showed how the game draws a step: inside whole tiles on the lower side (they read as cliff), from the
higher side's border down. Route 20's half-tile grass ledge: a rim of gake1_1 down 4 units over half a tile, then
54ochigake to the bottom three quarters in, then the lower grass; its full cliffs: the same rim, then gake01a to the
bottom at the tile's far side. Most such tiles are blocked (0x810001); some half-tile ledges are walkable grass.

The map maker draws them as step edges: edge terrains painted on the lower tiles (Route 20's "Ledge, half a tile" and
"Cliff"), banded against higher neighbours, their rim lines measured from the higher side's height (`"from":
"outside"`), so one profile fits any drop, and no plain wall where they draw the drop. A family can now have several
edges (grass: ledges and cliffs), each drawn where its own edge terrain is painted (`edge`, `name`). The round trip
paints vanilla's cliff tiles with the step that fits the drop: on Route 20 cliff tiles went from 0% to 53–77%
matching, all tiles from 76–90% to 88–96%, and triangles closer to vanilla's (map04_20 1,464 against 1,114).

Profiles learned (2026-11-04, `tools/paperwhite2/map_profiles.py cross TEXTURE --drop UNITS`, the cross-section
across every straight run in the atlas): Route 20's ledge as measured (58 runs), with the lower grass flat under the
whole tile beneath its see-through faces (the seam at a ledge's foot); faces repeat by height, gake01a every 12
units, the rims and 54ochigake every 4. The style's faces take `v_units` (v by height down from the face's top line,
repeating) and the steps an underlay face. Round trip on Route 20: textures differ 1–4 points less.

The user's observation (2026-11-04): vanilla's corners are chamfered, not mitred. At a corner the edge texture
runs on along the diagonal cut (michi01a's grass and its shadow lie diagonal across the corner tile; water's inward
corners the same), so it isn't stretched; only the path's bends are mitred and stretched. The mitre the map maker
uses stretches the texture round every corner. The profile learner should take each corner's shape and mapping
from the atlas's corner cases rather than mitring.

Corners now (2026-11-05): a sharp outward corner banded on both sides is chamfered (its lines half as far in as a
mitre, vanilla's corner triangle); a rounded one keeps a constant width; an inward corner is chamfered out into the
diagonal tile, which is carved (the border's corner half a tile out along both normals, the lines 0.75 of their
offsets in from it, starting half a tile before the corner: Route 20's banks and paths both fit), where that tile is
painted and the previous corner isn't chamfered on a one-tile side. u runs by length round corners, by tile along
bends. Tiles whose inside line belongs to a region's hole (an island) are clipped to the hole's outside. Round trip
on Route 20 (all four chunks hole-free): terrain 89–97%, edges 96–98%. Triangles: 1,597–2,415, against vanilla's
952–1,426; map04_21's 2,415 is past the busiest vanilla overworld chunk (2,367): the triangle work matters.

Styles learned (2026-11-05, `map_profiles.py draft TEXTURE_SET`): a texture set's ground textures as terrains
(with their commonest tile types), its edge and slope textures as edges with profiles learned from their straight
runs (where the top texture changes across the tile; a step's lines measured from the higher side; faces mapped from
above, by height with v_units, or across), each edge's family (the ground inside an edge, under a step). For Route
20's set it learns, unaided, the ledge, cliff, tiers and path edges measured by hand; water banks don't come out yet
(their cross-sections vary). The round trip uses a learned style where none is given; against its earlier crude
draft: desert textures 51.9→45.9% differing, Desert Resort 2 edges 83→89%, Wellspring Cave terrain 87.2→94.5%;
Route 13 heights 89.6→86.1% and the cave's edges 59→55% are worse.

Verified learned styles (2026-11-05, `draft --verify`, which the round trip uses with the chunk as its focus): a
learned step takes the ground under it as its family and an underlay where the atlas shows one; it's a ramp where the
game's own tiles of it have sloped collision; and each learned edge is kept only if round trips on the three chunks
with most of it are clearly better with it, and the chunk being painted no worse (a texture set shared by many caves
fits each differently). Against the unverified learned styles: Desert Resort 2 terrain 72.4→96.3%, Route 13 heights
86.6→96.4%, Wellspring Cave edges 55→60.5% and heights 75.5→77.4% (its terrain 94.5→91.8% and Route 13's edges
94.5→91.4% are a little worse). Learned water banks and cliff tiers still fail verification.

Tall cliffs, stairs and hills (2026-11-05): tall cliffs are tiers of 16 units, each the cliff profile with a rock
rim (gake1_0) under the tier above (faces' `by_outside`); stairs and hills are ramps (`ramp`): one face down the
whole tile, sloped collision at the game's nearest plane (stairs: slope 8, as vanilla's). Route 20's style has
Stairs and Grass slope; Floccesy Ranch's hills: textures differ 13.6% → 6.0%.

Still to do for steps: vanilla's tall cliffs are tiers (gake1_0 faces between gake1_1 rims), not one face; corners
(the plateau's convex corners are the lower region's concave ones, not rounded yet); stairs (kaidan01a); slopes one
walks on (yamagrs01 hills, dunes).

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

## Corners as the game builds them (2026-11-02)

The user pointed out that vanilla's corners aren't chamfered in their geometry: the texture's own shape rounds them.
From Route 20's faces (map04_20 and its banks at w2-original), one rule for paths and banks alike:
- **Convex corners** (the region's own corner, a path turning): each line turns at one point, pulled in along the
  diagonal by CORNER_IN plus CORNER_SCALE of its offset (0.5 + 0.75 x offset: the border half a tile in, a line a
  tile in 1.25; the bank's lines at 0.5, 0.625 and 1 come out at 0.875, 0.97 and 1.25, as vanilla's), straight to it
  from the station two tiles back (the one a tile back moves onto that line; along a side of three tiles or less to
  another convex corner, a path's end, straight between the two). u mirrors at the corner.
- **Reflex corners** (the region round a corner of the outside, a T's corners): the border's corner stays square,
  and each other line cuts straight across it, from its offset in on one side to the same on the other; one triangle
  fills the corner, its texture fanning across it (u -0.5 to 0.5 in the game's).
- A path's longer slant into a corner is its point, not the corner's.
- The reading's paintings: where the region turns round a tile outside it that the game's edge faces still cover
  part of, the game's corner is convex there and the tile is painted as edge (the reading had called it grass, and the
  old generator pushed its chamfers out into it, carving the tile; those carves and half-tile stations didn't meet,
  the small black holes the user found).

Holes (points of a 1-unit grid that vanilla's opaque faces cover and the generated chunk's don't), round trips with
Route 20's style, before and after: map04_20 8 holed tiles to 0, map05_20 13 to 0, map04_21 19 to 4 (a two-tile
water notch between half-tile ledges, which the style has no profile for), map05_21 17 to 0. The debug-painted
map04_20 (its HEAD edits): 1,248 polygons and 3,733 vertices as the DS draws them, from 1,870 and 5,493, under
vanilla's busiest overworld chunk.
