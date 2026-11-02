# Paper White 2 status

Kept by both Claude sessions (see CLAUDE.md). Newest first.

## 2026-11-02 (night, later): ambients, first version

- Ambients (plugins.md, Ambients): `ambients` in the zones' overworld files, packed with the NPC rules; drawn as
  billboards from the actor system's sprite cache by `paperwhite2_ambients.c`, on perch, hover, ellipse, line and
  figure-eight paths. The Overworld Editor's Ambients tab: a list, Shift+click to add, drag to move (keeping the height
  over the ground), a panel of every field, and each drawn at its height on a line down to its tile.
- The first test, at the user's tile: `res/paperwhite2/overworld/route_20.json`, Pidove (`OBJ_CODE_POKEMON_PIDOVE`)
  perched on the tree at 183, 647, at height 46 (the canopy's top layer there, over ground at 0), turning and hopping.
- Built (hack, no warnings, DSi intact). **Not tested in game.** Not yet: shadows, flying off, the paths drawn in the
  editor, picking again in the zone, sprites from a set or the encounters.

## 2026-11-02 (night): NPCs picked again in the zone, rolls by the hour

- `Spawns_Repick` and `PaperWhite2_SpawnsUpdate` (plugins.md, NPC spawns): once a second while no event runs, a
  change of the hour or the time of day picks the zone's NPCs again; an NPC whose record should change is changed only
  while it, and where it would appear, are out of the field camera's view (a frustum test, two tiles of margin), its
  actor removed and made again if it shows. `EVENT_WORK_SPAWN_PICK` (0x4058) holds the key the picks were made for.
- Each NPC's `rolls` (overworld.schema.json; the Overworld Editor's Rolls box): the hour's seed by default, or the
  day's, the time of day's or each entry's. The conditions engine gained the hour's and the time of day's seeds.
- Built (hack, no warnings, DSi intact). **Not tested in game**; the test list is in the reply of 2026-11-02 night,
  with phase 2's (a night NPC at zone entry, a host with day and night instances).

## 2026-11-02 (evening): tile tasks for tonight (the user's notes on the debug paint; not started)

The user compared Route 20's map04_20 vanilla, debug-painted and hand-corrected overhead. River corners and the
round path corners now look like vanilla. Tasks, atlas first (map-maker-atlas-first):
1. **Reading mislabels some tiles:** the river corner by the large tree in the middle: the bottom-right tile of the
   tree's 3x3 footprint was read as water edge, not grass; painted as grass by hand, the corner matches vanilla. A
   reading fault, likely blocked tree tiles beside water.
2. **Path corners are too small:** vanilla's path corners span about 2.5 tiles and ours 1.5 (the user's markup:
   the corner's angle starts further back). River corners are right at 1.5. So the corner's size belongs to each
   edge's profile, measured from the atlas (CORNER_IN and CORNER_SCALE per edge, or a taper per edge). Path points
   (1.5 tiles each side, 3 in all) are right.
3. **Half-tile ledges' corners:** vanilla draws them square; ours come out rounded (they look good, but aren't the
   game's). The square corners the reading paints don't reach ledges.
4. **One-way ledges on paths are dropped:** the little jump-down ledges across the path on the left of map04_20
   aren't generated.
5. **Paths beside a half-tile ledge** go wrong (by the upper bridge).
6. Still open: ledges back to back with river banks; paths meeting bridges (their square corners there); cliffs
   (a ridge texture at the bottom, the face above, separate points along the top, per the user's 2026-11-02 notes);
   banks under cliffs.
7. **Real examples to check and match against (agreed in outline; to think on, maybe tried tonight):**
   - automatic: vanilla's tiles cut with a 5x5 neighbourhood key, heights normalized, beside the atlas, to score
     generated tiles against vanilla's in the same situation and fit the profiles (corner sizes, points, ledges);
   - manual **snippets**, the user's idea: the user selects tiles in an area and saves them to a snippet library
     (apart from the objects): the mesh cut at tile edges, its height normalized, with a reading of its tiles and a
     ring round them. The generator uses a snippet's mesh where a painting matches its pattern, ring included. A
     snippet's border must lie on plain ground so its seams can't show (the editor warns otherwise); no turning or
     mirroring unless the snippet is marked symmetric. Snippets double as test cases (generate their pattern, compare).
     Made per area as the user reaches it; for what doesn't follow patterns (paths at bridges, ledges at banks).
   - Order: the reading fixes and tonight's list first, the automatic checking with them, snippets after.

## 2026-11-02 (later): the user's first round of testing, fixed

- **Dark grass drawn black in game:** materials new to a chunk (kusa_ec1s and kusa_ec2s had never been in Route 20's
  map04_20) took the model writer's default record, which had no light on; the GPU colors a vertex with a normal by
  the lights on plus emission, so they drew black. A new material whose shapes have normals now has light 0 on, as
  98% of vanilla's do (map_model_data.py written_model). Rebuild to see it in game.
- **The debug button** (Paint the whole chunk from its reading) dropped trees, fences and bridges: the chunk's own
  structures and standing decorations are now kept wherever its copy exists, every tile painted or not. It raised the
  river to the land's height (banks read half a tile lower than the water, splitting each body from its banks): a
  bank now takes the height of the water beside it. Bridges keep the chunk under them (their walkway's collision).
  Pillars came from blocked tiles whose collision the hack raised (perches): such a tile is painted at its drawn
  ground, and the generated collision keeps a blocked tile's height where the chunk's was blocked too. It is now one
  painting edit with its generate, so Ctrl+Z undoes both (before, putting the chunk back left the painting fully
  painted, so the next stroke regenerated it all).
- **Vertices:** the editor counted the GLB's vertices, which say little of the DS's cost; the Chunks tab now shows the
  model packed as the build packs it (tools/paperwhite2/map_cost.py: vertex commands, polygons with a quad one),
  against vanilla's busiest by the same count (overworld 3,933 vertices, 1,873 polygons). The user's chunk with a
  little dark grass painted: 2,296 vertices to vanilla's 2,178. The writer packs a vanilla chunk about 10% heavier
  than Game Freak's lists. The user saw no slowdown on a 3DS with the debug-painted chunk (about 5,400 vertices).
- **Still to do (tiles):** the reading doesn't pick square path or water corners; path corners' chamfer cuts into the
  grass tile beside it instead of being a small corner of grass inside the path tile; the corner by the bridge; small
  dark holes at a few path and water corners; banks under cliffs (the water below a cliff face), not made yet.

## 2026-11-02: grass painted apart from terrain (the Decorations tab)

**Done:** grass is its own layer of a painting (`grass` rows), painted in the Map Editor's new Decorations tab
(pencil, rectangle, fill, eraser) and built by the map maker over whatever ground each tile has; repainting terrain
under it keeps it. Eight kinds learned from the atlas (`res/paperwhite2/map_grass/grass.json`,
`tools/paperwhite2/map_grass.py survey`): tall and dark grass, their "snowy rustle" (B) and "other rustle" (C) kinds,
and very tall grass and very tall dark grass (Route 7's textures only). Hidden Grotto "grass" is the entrance's trees,
left out. Route 20's Tall grass and Dark grass terrains are gone from its style (the grass tab replaces them). Details
in docs/paperwhite2/design/map-editor.md, "Grass, painted apart from the terrain".

Also: Start painting defaults to a style made for the chunk's texture set, or learns one ("auto", a minute for
Route 7); learned styles take a ground's commonest walkable tile type (Route 7's grass had come out blocked), which
also lifted its round trip's heights within 2 units from 93% to 99.5%.

**Tested:** browser runs on Route 20 (dark grass painted, a field of tall grass erased to the ground, path painted
under grass, collision checked) and Route 7 (very tall grass regenerated with no edits: vanilla's collision exactly,
looking the same, boardwalks over it); typecheck, tests, round trips. **Untested in game**, in particular the
encounters, the rustles and very tall grass's no-cycling.

**For the user:** paintings started before today have no grass rows; the Decorations tab offers "Take the chunk's
grass" for them. Grass painted over blocked tiles or boardwalks (orange) is drawn but keeps that collision.

## 2026-11-05 (morning): next — editor controls and the object library; tiles still needed

**Done (2026-11-05):** the editor controls the user asked for before more tiles:
- the object library's browser and viewer (Browse... in the Objects and Paint tabs; rename changes the name shown, the
  folder stays);
- the faded model off by default; the painted overlay drawn over the map (tops only, outlines drawn normally); the
  toolbar's Overhead view; the Paint tab's fill tool;
- the gizmo (three.js TransformControls): on the Faces tab's selection, arrows on each axis, stepping by the game's
  grid, a step in units, or smooth (Move section); drag an arrow or a plane square, or click an arrow for one step
  the way it points (Shift+click: back); on the Paint tab's selected object, by whole tiles across only. Each move is
  one undo step;
- quarter turns of placed objects (R, Shift+R, or the Turn buttons): projects' objects take an optional fourth value,
  quarter turns clockwise from above (schema updated); map_maker turns the model, normals, footprint and collision
  about the north-west tile. Tested in the browser: drawn, generated and collision tiles line up.
  **Untested on hardware.** Directional tile types (a ledge's jump direction) don't turn with the object; a turned
  ledge still jumps the way the original did.

**Dark grass (done):** Route 20's style has a Dark grass terrain (key d): tile type 0x240006 (the double-battle
grass class), blades kusa_ec3 / kusa_ec2s / kusa_ec1s at lifts 2, 6 and 10 as vanilla's dark grass has them. The
reader now takes the layered terrain with the most of its layers standing on a tile (tall and dark grass share
kusa_ec3); it reads Route 20's dark grass exactly (54 and 28 tiles in map05_20 and map04_21). Untested in game.

**Tiles still needed** (atlas, overworld edge and slope textures by tile count; done: paths, Route 20's banks,
ledges, cliffs and tiers, stairs, grass hills):
1. Sea shores and beaches: sea cliffs (sea_gake01, 2,227 tiles, 9 sets), wave foam (sea_zanami2), wet sand
   (sea_simi.1). The biggest left; Route 13, Humilau.
2. Area cliffs and paths: out57_gake*, out07_gake*, the desert's sabaku_el and ga_s1_0, Icirrus's c8_michi03b; learned
   banks and tiers (they fail verification).
3. Water: rapids and currents, deep and shallow sea (sea_asase), waterfalls.
4. Hedges, flower beds, rock edges, tree lines (plant01, iwa01, ki04bx): maybe library objects.
5. Towns' curbs and pavements (mostly structures and walls); caves' walls and water edges (Wellspring's edges 60%).
6. Winter chunks (Icirrus's winter05_05): a painted chunk with a winter counterpart needs it painted too.
7. Polygons (the user's decision after testing): T-junction splits and run counts; see below.

## 2026-11-05 (overnight, later): tiers, stairs, hills, learned styles; polygons are the open problem

- Tall cliffs as 16-unit tiers (rock rim under the tier above), stairs and grass slopes as ramps with sloped collision
  (vanilla's slope indices), styles learned for any texture set and verified by round trips (`map_profiles.py draft
  --verify`), learned underlays. Route 20 round trip: terrain 93–97%, edges 96–98%; Desert Resort 2 72→96% terrain
  with a learned style.
- **Polygons, for the user's decision.** The editor's bar now counts polygons as the DS does (a quad once, as the
  writer pairs triangles): the busiest vanilla overworld chunk has 1,345 (its 2,367 triangles are mostly quads),
  caves and buildings up to 2,457. Regenerated Route 20 chunks have 1,443–2,044 against vanilla's 519–790, so a
  fully painted chunk can pass the overworld's ceiling (map04_21 does). Measured on Route 20's four chunks:
  - not splitting the ground's edges at every corner on them (vanilla doesn't; we do to avoid T-junctions, which the
    user's tests have shown no cracks with) saves 20–27%; not splitting strips either, a further 5–10%. Whether the
    DS shows cracks without the splits needs an in-game test;
  - the rest is the bands: a strip per face per straight run, and runs break at every bend, chamfer and rounded
    corner (map04_21: 801 strips). Fewer runs means simpler corners, a trade against the look the user asked for.
  Quad-friendly strips and clean-corner fans are in (about 10–17% fewer triangles, 7% fewer polygons).

## 2026-11-05 (overnight): profiles from the atlas, chamfered corners, seams, borders

Working through the user's tile list on their go-ahead; each change checked with the round trip on Route 20's four
chunks (map_roundtrip.py; numbers in each commit) and the scratch-copy paintings, none tried in game.
- Ledges and cliffs: profiles measured across every straight run in the atlas (map_profiles.py); the lower ground
  drawn under the whole step tile (the seam at a ledge's foot); cliff faces repeat by height (v_units) instead of
  stretching.
- Corners as the game draws them (the user's chamfer observation, checked in the atlas): outward corners chamfered,
  rounded ones at a constant width, inward corners chamfered out into the diagonal tile (which is carved), u by
  length round corners. Tiles beside an island are clipped right (they had holes).
- The sliver where painted water ends against a vanilla bank is gone (a wedge strip along the end of the band).
- Path edges face a bridge's end (all 23 in the game do); tiles past the chunk's border are read from the
  neighbouring chunk.
- Round trip now (Route 20): terrain 89–97%, edges 96–98%, no holes. **For the morning:** triangles are up
  (1,606–2,339 against vanilla's 952–1,426; map04_21 is near the busiest vanilla overworld chunk, 2,367), so the
  triangle work matters before big paintings; generating near a chunk's border reads its neighbour (about a second
  each).

## 2026-11-04 (night): terrain-only cutting; the user's ledge and cliff test

- Painting over a chunk cuts only its terrain (ground, edges, slopes, walls that top out at a neighbour's ground,
  a terrain's own layers like tall grass, decals on the ground), by the textures' roles: trees (canopy, shadow,
  trunk), fences above the ground and bridges stay whole.
- The user's test of ledges and cliffs (2026-11-04): ledges look right but leave a seam at their foot (vanilla draws
  the lower ground across the whole tile under the see-through face) and meet water edges oddly; cliffs' textures
  stretch (v over the whole drop) and their corners are off; water edges' inward corners are square (never rounded:
  not a regression, checked); the sliver at vanilla banks and the bridge corner remain. The user's rule from now on:
  fix tile-building issues by what's learned from the atlas before any pinpointed fix. Plan: learn edge and step
  profiles from the atlas (faces, widths by drop, v per height, what's under see-through faces, corners), then seams
  matched to vanilla's side cross-sections (which also gives chunk borders), then stairs and walkable slopes, then
  triangles.

## 2026-11-04 (evening): the atlas

- `tools/paperwhite2/map_atlas.py build` (under two minutes; build/, out of git): every chunk of the original game
  read into SQLite, twice, the second time with the texture roles the game agrees on. 0 chunks fail. Next, by the
  user's order: the terrain types the round trip found missing (ledges and cliffs: edges at height changes; slopes),
  then chunk borders, then triangle counts.

## 2026-11-04 (later): the round trip, and what it found

- `tools/paperwhite2/map_roundtrip.py` reads a vanilla chunk, paints it from the reading, generates it in a
  temporary folder and compares tile by tile, with a page of the two from above. Findings in map-reader.md, Round-trip
  findings: plain ground comes back nearly exact; edges at height changes (cliff and ledge tops, cave rims, desert
  sand), cliffs, chunk borders and triangle counts are what's missing. The budget bars measure against the busiest
  vanilla chunk of the chunk's kind (overworld 2,367 triangles; caves and buildings 3,821).

## 2026-11-04: edge families learned per chunk; snow ground, billboards, moved joints

- Each edge texture's inside (the ground a tile toward where its v grows) is learned per chunk, and with no style a
  tile of the edge or a bend of it reads as that ground: Route 13's grassy road, the desert's sand edges and
  shorelines no longer flip colour tile to tile, and bends are found without a style. See-through flat ground lowest
  on its tiles is ground (Icirrus's snow over grass; not tree canopies). Sloped see-through faces that all lean one
  way are billboards (Floccesy's flowers), not slopes. Confidence is agreement among the points that found ground
  (a riverbank's bed showing at two points is sure). glb_mesh reads skins whose joints are moved and bound back
  (Nuvema Town). Humilau's door planks over its piers are honestly unsure (two surfaces share those tiles).

## 2026-11-03 (night): stairs, rivers, dunes; the grid hidden over the original game

- Tall grass needs its blades over half the tile (not stairs beside it); a tile's own texture rising over its middle
  (a stair's upper steps) isn't a structure on it. Under water the ground is the bed within two tiles under the
  surface, else a see-through surface over the whole tile (the sea), never a shadow or the rapids. An edge needs a
  fifth of the tile (not a sliver of sand edge on a dune). The Tile grid is hidden while the Reading layer shows the
  original game (it's drawn from the current collision, with the hack's height edits: Virbank's pipes are walkable
  only in the hack).
- Known: shoreline tiles (Route 13) read as wet sand or water by whichever has more of the tile; the atlas should
  learn that both are one shore.

## 2026-11-03 (evening): structures by their open sides; see-through water; empty tiles

- A texture is a structure (a deck) only where its sides are open: Route 20's bridges and Virbank's walkways over its
  canal (a second collision layer of water under them), not the desert's plateaus and cliff caps over the sand the
  game draws beneath. Water drawn see-through at the collision's height is a tile's ground (Virbank's canal under its
  pipe, which now reads as water with the pipe over it; the sea). Edges count only near the ground (not the desert's
  sand edge under a cliff's cap). A texture drawn by two materials takes its most common alpha. Tiles with no faces
  at all (Desert Resort 2's last row) are outlined grey; clicking a place again takes the next square down.

## 2026-11-03 (later): the reader on Virbank, the Desert Resort, Routes 12 and 13

- The Reading layer names textures by a style only where the style's texture set is the chunk's (no more "not in the
  style" against Route 20 everywhere); the atlas will learn texture roles from every area instead.
- A blocked tile's ground is its top surface (the desert's cliff caps, ga_s_futa at 48, over sand at the collision's
  0). A layer's surface may be blended (a canal's water). Layers with nothing drawn at their height (Route 13's
  invisible blockers in the air) aren't drawn on the layer; the Reading squares take clicks first (squares under a
  walkway, floating ones). Routes 12 and 13 and the Desert Resort otherwise read well by the user's check.

## 2026-11-03: the map reader, after the user's checks of Route 20 and Virbank

- Fixed: clipped slivers faced wrong (road tiles by the bridge, fence tiles), arrows in paths' middles (now bends),
  rapids as edges, cliffs as unsure, stairs far below a tile counted as its slope, ground under a canopy (from the
  neighbours), Virbank's roads read at the canal floor (the ground is now where the collision walks), red squares
  for textures the style doesn't know (confidence is now the geometry's agreement). New: decks and what's under
  them, a reading per collision layer, open sides (vanilla's unwalled holes). Next: the user's checks of Route 12,
  Route 13 and the Desert Resort.

## 2026-11-02 (night): the map reader

- `tools/paperwhite2/map_reader.py` reads a chunk tile by tile (map-reader.md, Built so far); the Map Editor's
  Reading toggle shows it, and a click a tile's record. On Route 20 (vanilla) it reads the paths with their edges'
  outsides, the river and its banks, the bridges as structures over water, tall grass by its blades, and forests by
  their tile type (unsure, no ground drawn under the canopy). Next: the user checks it on chunks of different
  terrain; then the round trip, then the atlas.

## 2026-11-02 (design): reading vanilla maps

- The user agreed to step back from per-case fixes: `docs/paperwhite2/design/map-reader.md` designs a reader of
  vanilla chunks (every face over each tile, read into the painting's own terms, shown as a layer in the Paint tab),
  a round-trip test (read, paint, generate, compare with vanilla), an atlas of every vanilla overworld chunk (SQLite,
  out of git, built only after the round trip passes on a few chunks of different terrain), an eyedropper (copy a
  tile's reading; stamp its faces as the exception), textures from other areas, seams matched to vanilla's side
  cross-sections, and rules as tables. Next: the reader.
- Open from the last test: the bridge's underside, a sliver where painted water meets a vanilla bank, road corners
  at a bridge (image 5 of the user's last test), the grid drawn at the painted height over water.

## 2026-11-02 (late): dents by what's at the border; bridges

- A rounded corner's gap next to a vanilla path's edge tile (michi01a) is grass, as that tile's outer side is.
- A kept tile whose ground texture no terrain has (a bridge's deck, hashi01a, path by its tile type) counts by its
  tile type for paths, so a road's grass edges run up to a bridge square, as vanilla's do, but water edges draw no
  bank against it. A pond by Route 20's lower bridge and a road ending at the bridge look right on the scratch copy;
  **not tried in game.** Plain Water tiles against the river's own bank tiles leave a drop to the bed: paint Water
  edge where painted water meets a vanilla bank.

## 2026-11-02 (night): vanilla's riverbank; square-corner edges; paths edged against water

- Water's profile is now Route 20's own bank: the land half a tile above the water's surface, the bank sloping down
  from its edge (gake1_1, gake01a2, the water's edge), the bed a tile below the land. Water and its edge tiles'
  collision is half a tile under their painted height (collision_lift), so paint water level with the land. No wall
  between painted tiles and the chunk's own of their family, and no lip where painted water meets the river: a pond
  joined to Route 20's river looks like the river's own banks (scratch copy). The meadow west of that river, level
  with the water under a ridge, is the game's other bank, not made yet.
- Path edge and Water edge have square-corner variants, for corners the rounding shouldn't touch. Path edges draw
  their grass against water and its edges too.
- Discarding a painted map's project or its copy discards both; generate says what to do when the copy is gone.
  Flat test chunk: 755 triangles; packs. **Not tried in game.**

## 2026-11-02 (evening): edges are painted; straight bends; kept tiles read by their texture

- The margin is gone (it overwrote a bridge and a bank). Borders are drawn where Path edge or Water edge tiles are
  painted, against what's outside them, which is read but not changed: kept tiles by their ground's texture, else
  their tile type. Water edge tiles are vanilla's bank type.
- Bends' sides are straight, as vanilla's; rounded corners no longer fold on the lines further in (the spike at a
  pond's corner). Test chunk with painted edges: 875 triangles; **not tried in game.**

## 2026-11-02 (later): paths' bends and corners as vanilla's; the margin round a painting

- Bends are three tiles wide and half a tile deep, one is always across from a T's branch, convex corners are cut
  round (paths and banks), and the gap a bend or corner leaves at the border is the outside's ground (no stretched
  grass). Kept riverbank tiles count as blocked grass, so a path beside them gets its border.
- Painting over a chunk draws its margin again (kept grass and path tiles up to two from the painting): their ground
  faces only, so fences and trees stay; a painted path joining a vanilla one turns into it. Test chunk: 904 triangles
  flat, 1,274 joined onto Route 20 (vanilla 1,114); packs. **Not tried in game.**

## 2026-11-02: vanilla-style paths and riverbanks; hiding faces; paste selects; discard in Changes

- **Edges as profiles** (`tools/paperwhite2/map_edges.py`, the style's `edges`): paths' grass edges now lie inside
  the path's outer tiles, as vanilla's do, with half-tile bends every third tile on alternating sides; painted water
  gets vanilla's riverbank (a dirt ridge, the water's edge, the bed half a tile down) in its outer tiles, which take
  the bank's tile type (0x830041, vanilla's). Straight runs are merged: a test chunk with three roads, a pond and tall
  grass is 392 triangles; packs. **Not tried in game**, nor whether the bank's tile type lets the player surf from
  it.
- The Faces tab: H hides the selection (from view and clicks; the model doesn't change), Alt+H shows it again; a
  paste selects what it pasted; Ctrl+Z now works while a checkbox has focus (it didn't after ticking Paste).
- Put it back can keep the chunk's collision. The Changes panel can check every file shown and discard the checked
  ones (back as last committed; new files deleted), after a confirm.

## 2026-11-01 (night): smart path edges, put back, faded painting, generate after each stroke

- **Smart edges** (`map_maker.py`, a style's `edges`): grass, tall grass and blocked grass blend into path with
  `michi01a` across a tile, corners rounded, as vanilla's paths are. A test chunk with a path, a branch and a square:
  171 triangles; packs. **Not tried in game.**
- Kept tiles take their heights from the chunk's model (its highest opaque ground face), not its collision, so
  collision raised for perches no longer makes pillars when painting starts. A height painted on a kept tile makes it
  a painted tile, so a generated area can be repainted.
- The Chunks tab's **Put it back** (as the original game, the tag `w2-original`, or as last committed): the chunk's
  folder as git has it, written to the working tree only; undoable. Checked byte for byte on a scratch copy.
- The Paint tab: the painting's colors and the model faded to half are two toggles; Generate can run after each
  stroke (one undo step with the stroke); the height drags; the tile grid lies at the tiles' heights.
- Painted water meeting a chunk's own river keeps the river's curved bed; no fix yet.

## 2026-11-01 (evening): the object library and painted maps

- The tile slicer and its Route 20 library are gone (the user's call): too many triangles, near-duplicate pieces,
  textures that didn't join.
- **Object library** (`tools/paperwhite2/map_objects.py`, `res/paperwhite2/map_objects/`): the Faces tab saves a
  selection as an object; the Objects tab places one on an existing chunk (faces pasted, collision painted).
- **Painted maps** (`tools/paperwhite2/map_maker.py`, `res/paperwhite2/map_styles/route_20.json`, projects in
  `res/paperwhite2/map_projects/`): the Paint tab paints terrain and heights, places and drags objects, and generates
  the chunk's model and collision. A test chunk (grass, a path, a river, a plateau, tall grass, trees): 417 triangles,
  packed. **Not tried in game.**
- The Map Editor's **Wireframe** toggle.
- Painting part of an existing chunk: start from the chunk as it is (terrain "." keeps it: its faces with the
  painted rectangles cut out, its collision); a copy of the chunk sits beside the painting, which Stop painting puts
  back; Generate is undoable. A pond in Route 20: 1,176 triangles (vanilla 1,114), packed; undo and stop give vanilla
  back byte for byte (scratch copy).
- Next: smart edges between terrains, bulk tools (forest scatter, fence paths), and the user's in-game tests.

## 2026-11-01 (afternoon): the written models' box, moving faces, pasting at the right height

- **Fixed: a chunk packed whole vanished** unless the camera was over its middle (the user's test on Route 20). The
  model writer stored the model box's scale without the position scale, so the game read the box 64 times too small
  and skipped drawing the chunk. `nitro_model_writer.py check` now builds every vanilla model's box and checks it
  holds every vertex. Route 20's chunk is back to vanilla (its data.json said "written" after the undo).
- Faces: **Move** (a tile, or a unit up and down; Alt+arrows), and a paste keeps the copy's height above its own ground
  (vanilla trees' shadows sit just over the grass). Both pack (scratch copy).

## 2026-11-01 (day): new maps, new routes, collision painting

- **New maps from unused zones** (`tools/paperwhite2/new_map.py`, the Map Editor's **New map…**): about 60 leftover
  zones (no events, no warp in, not named by the code, not on the town map) can become maps. The zone, its scripts and
  text bank are renamed, and new chunks copied from a template are appended after the game's (`map_models.txt`; the
  packer copies the template's container, `"template"` in data.json, and writes the model whole). A map of its own gets
  a matrix of its own; **a route** goes into the overworld's cells, seamless with its neighbours (the field swaps zones
  by the cell, fieldmap.c `Field_ShouldSwapZone`), ringed with a filler. Built in a scratch worktree, hack build with
  DSi intact, for both (a 2-chunk map, and a 2-cell route south of Route 20); **not tried in game**.
- The Map Editor's **Collision** tab: paint tile types (the game's classes from field_map.h, and flags), flat heights,
  or copied tiles, by drag, on either layer of two-layer chunks (Virbank Complex), with season variants painted too where
  their tile matched. Checked in the browser.
- Design doc: the seamless overworld research (what swaps at a cell boundary, what doesn't, the two overworld
  matrices, fillers, room in the matrix).
- **Copy and paste faces between chunks and zones**, and **textures imported between sets**
  (`tools/data/nitro_texture_writer.py`, all 409 vanilla sets written back byte for byte; a set's `imports.json`). Pinwheel
  Forest 2's doorway (the tree block with `d2mori01s` and `d2_hika02` at its east exit) pasted onto Route 20 and its two
  textures imported into Route 19's four season sets: both pack (scratch copy). **Not tried in game.**
- Next: in-game tests; the Map Editor showing a route's neighbours; warps between maps from the editor.

## 2026-11-01: the Map Editor's research, framework, model writer and Route 20's tiles

- `docs/paperwhite2/design/map-editor.md` (new): the research and plan: the chunk and model layout, the limits, the
  seasons (texture sets by name in 66 of the 70 seasonal areas; Route 20's autumn chunks, a different layout), unused
  zones (about 75 empty leftovers, no code needed) against new ones (possible, with three fixes), what a new map
  needs, the model writer and the tile library.
- `tools/data/nitro_model_writer.py` (new): reads a map model into its parts and writes one from them; all 1,065
  vanilla models write back byte for byte, and all 17,129 shapes draw again the same (`nitro_model_writer.py check`).
  The packer writes a whole model from the GLB when a model's `data.json` has `"written": true`, so a GLB can add
  materials and draw calls: every vanilla model with a confirmed set, written from its GLB, draws the same positions
  and UVs (lists about 5% larger at the median: strips or quads, whichever is shorter). **Not tried in game:** a written chunk.
- `tools/paperwhite2/map_tiles.py` (new): tile libraries, `res/paperwhite2/map_tiles/<library>/library.json`, cut into
  ground pieces and whole objects into `build/map_tiles/`. Route 20 (four chunks and their autumn variants): 3,274
  tiles.
- The editor's Map Editor (new): Chunks (the matrix, the inspector against the limits and each season's set, season
  variants), Faces (select, connected, the stack of a tree, delete, retexture, undo; written to model.glb at once) and
  Tiles (the palette). Checked in the browser on a scratch copy: a tree deleted and a face retextured, then packed (34
  materials and draw calls where vanilla has 33). **Not tested in game.**
- Layouts (`res/paperwhite2/map_layouts/<model>.json`): a chunk as tiles, started from a chunk as it is, painted in
  the Tiles tab, composed into the chunk's model.glb (`map_tiles.py compose`). Route 20's map04_20 rebuilt from its own
  layout looks the same in the editor (2,085 triangles against 1,114; 71 KB of the 86 KB buffer). A painted tile
  brings its source's terrain rows into the chunk's first layer, its planes moved to its height (refused where the
  game's height table lacks the height; split tiles keep the chunk's rows). **Not tried in game.**
- Next: smaller composed chunks (the composer moves each triangle's UVs on its own, so neighbours share no vertices
  for strips), New Map with an unused zone, collision painting in the Map Editor, two-layer chunks.

## 2026-10-31: NPC conditions and instances (phase 2)

- `res/paperwhite2/overworld/<zone>.json` (new, `tools/paperwhite2/overworld.py`, a member after a/1/2/6's files in
  the hack's build) and `Spawns_OnZoneInit` (`src/paperwhite2/ov012/paperwhite2_spawns.c`, filling the placeholder):
  NPCs hidden by their conditions (`EVENT_FLAG_SPAWN_HIDDEN`, 0x930) and hosts given an instance at zone entry
  (plugins.md, NPC spawns). The events' schema has its NPC record as `$defs/npc` now; the events pack the same.
- The Overworld Editor: conditions, instances and the conditions preview. Checked in the browser on a scratch copy
  (a night NPC and a host with two instances saved, packed and dumped; the preview shows the night NPC only at night).
  Built (hack, DSi intact). **Not tested in game:** an NPC with a time condition, and a host with day and night
  instances, at the two times.
- Next: picking again on a time-of-day change, then ambients, then groups.

## 2026-10-31: camera yaw the short way round, values to drag everywhere

- `src/ov036/fld_scenearea_loader.c` (`#ifdef PAPERWHITE2`): a camera rect's yaw blends the short way round between
  its two values (the original took the plain difference, so 0 to 300 degrees turned 300 on; no original area turns
  its yaw). The editor's preview does the same. Built; **not tested in game**.
- The forms' number fields drag (a ⇔ grip, clamped to the schema's range, not on IDs, flags and the like), and so do
  the Overworld Editor's heights, buildings' place and turn, and rail points and arc centers; a drag is one undo step.

## 2026-10-31: rectangles on the map, values to drag, chunk sizes (editor only)

- Triggers', warps' and camera rects' rectangles move, resize by their edges and corners, and draw on the map; the
  camera values drag (one undo step a drag); a rect's blend direction and ends are set in the panel. Revert drops a
  file the editor made and never saved (a new camera file stayed unsaved before).
- The map placed every chunk 512 units apart; the map type gives the size (Skyarrow Bridge's are 2048, the Pokémon
  League's 1024 with 64 by 64 tiles), which fixes Skyarrow Bridge's overlapping models. Checked in the browser.

## 2026-10-31: the camera areas in res/ and the Cameras tab

- `tools/data/camera_data.py` (new): `res/field/cameras/` holds the grid zones' camera areas (a/1/5/6, a file a zone
  group, `areas/<zone>.json`), the rail maps' (a/0/7/9, `rail_areas/`) and the default cameras (a/0/5/9,
  `defaults.json`); all three pack byte for byte as the original. The boundaries (`cam_bound`, a/1/0/9) aren't in res/
  yet.
- The hack's build reads which zones have which file from the files' "zones" (`camera_data.py archive` appends a table
  to a/1/5/6; `PaperWhite2_GetCameraIDForZone`, src/paperwhite2/ov036/paperwhite2_camera_areas.c, in
  `Field_LoadSceneArea` in place of `ZONE_CAMERA_ASSIGNMENTS`), so any zone can be given camera areas. Built (hack,
  DSi intact); **not tested in game**: check the Aspertia overlook's camera still works (the same data, read through
  the new table), then a new area.
- The Overworld Editor's Cameras tab: areas drawn, edited in degrees and units, previewed through the game's camera
  (checked in the browser on Aspertia's overlook, first row and last), added (a zone's file made if it has none) and
  removed. The preview shows only the zone's own chunks.

## 2026-10-31: the Rails tab (editor only)

- The Overworld Editor edits rail files: move points (also by their fields, in tiles), add points and lines (slots,
  direction, curve, measured length and a new attributes file), set a line's curve and center, fit its length
  (resizing its attributes), remove the last point or line. Checked in the browser on Castelia (edit, undo, add a
  point, add a line) and that a rail file with an added point, line, curve and attributes packs
  (`rail_data.py pack`). Not saved from the editor or built into a ROM yet.

## 2026-10-31: the user's walking Pokémon sprites out of Unown's forms

- Before the decomp the user drew 22 walking sprites for Pokémon the original game has none for in place of Unown and
  its forms 1 to 21. They are now codes of their own, `OBJ_CODE_POKEMON_PURRLOIN = 0x4000` on (generated/obj_codes.txt,
  `res/field/actors/pokemon/<species>/`, 8 frames, sprite_controller_type 14), the table's rows after the followers'
  (`GetIndexOfObjID`, src/system/field_actor_savedata.c); Unown's sprites are the original's again (w2-original), and
  the 18 NPCs that used them (9 zones; no original NPC or script used Unown) use the new codes. The follower's forced
  forms (Unown '?', Arceus Normal) are gone, so an Unown or Arceus follower shows its own form. Five the user named after:
  Applin, Hydrapple, Rufflet, Vullaby and Dipplin (the Applin line isn't in the game: the user's favorite, for an
  easter egg, perhaps a trainer saying it can't be found around here, with a nod to the Big Apple). Built (hack, DSi intact); **not tested in game**: check an NPC with a new code
  (Castelia's Trubbish), an Unown follower's letter and an Arceus follower's form.

## 2026-10-31: the Funfest mission spots removed from every zone

- The 1,690 proxies with condition 4 and script 0 (up to 20 a zone, in 118 zones) were the Entralink Funfest missions'
  places: `fest_mission_people.c` and `fest_mission_sparkle_place.c` pick their people's and sparkles' spots from a
  zone's condition-4 (and 5) proxies, and nothing else reads them (`CheckProxyEntityEvent` skips condition 3 and up).
  The user is removing the wireless features, so they are gone: 33,800 bytes, up to 400 a zone (11 NPCs). A mission
  of those kinds now finds no place in a zone and shows no people or sparkles (no crash: `PickPlaces` returns FALSE
  before placing any). Removing them shifts later proxies' indices, which only `ObjInitPointGPos` scripts
  (aspertia_city_2, driftveil_city_gym_2, hidden_grotto) and Join Avenue's shops use, none in zones that had spots.
- To do: remove those mission types from the Funfest's mission lists, or rework them with the new NPC spawn system.
  Packs; not yet built or tested in game.

## 2026-10-31: rails in the Overworld Editor (editor only)

- The zones without a grid show their rails (`editor/src/modules/overworld/rails.ts`, from `field_rail.c`,
  `field_rail_func.c` and `rail_attr.c`: straight lines, flat and 3D arcs, widths, attributes), with their NPCs,
  warps, triggers and proxies on them; dragging along rails, adding on them, painting rail tiles' types, and one
  height at a time (Castelia's levels: -3.5, about 1, 4.5, 7.5 and 10 tiles). Checked in the browser on Castelia City:
  the rails follow the plaza's arcs, and a drag, an add and a paint each undo in one step. Not saved or built.
- Painting now keeps a tile's flags other than collision, water, encounters and reflection (rail tiles carry 0x80).
- Next: editing the rails themselves (points, lines, curves, widths), then the new features (conditions first).

## 2026-10-31: seasons' maps, the events' limit in the build, buildings and movement previews

- **Seasons' map models:** `res/field/map_replacements/replacements.json` (new, `tools/data/map_replace_data.py`,
  `a/0/1/0` packed byte for byte in the build): the chunks and matrices that the season, the version or an event
  replace when the field loads a matrix (`MapMatrix_Patch`). The Overworld Editor's **Season** shows a seasonal
  zone's chunks and the season area's textures; painting edits the chunks shown (Route 20's autumn chunks have their
  own collision). Built (hack build, DSi intact); not tested in game, nothing in game changed.
- **The events' limit:** `event_data.py` refuses a zone whose packed events pass 2,436 bytes (the game freezes
  entering it); the editor shows the zone's load as a bar (green, yellow from 80%, red past it).
- **Buildings:** the chunks' props, drawn, moved, added, removed and turned, saved into the chunk's GLB through the
  server's new `PUT /api/glb-props`. Checked: the saved GLB packs (`patch_props`) with the new turn, and an unedited
  one still packs the ROM's chunk. Not built into a ROM or tested in game yet.
- **Movement previews** (▶ Movement): the move codes as `src/ov036/field_actor_movecode.c` runs them. Checked by eye
  in the browser; the ROUTE_* codes that read past their table in game start over in the preview.
- Also: a warp's link to the zone it leads to, a border while painting, the wheel on the painter's height.

## 2026-10-31: Overworld Editor fixes after the user's first test (editor only)

- Mouse: left selects, drags and paints; middle orbits, right pans, the wheel zooms to the cursor. The camera stays
  put after a paint. Paint shows during the stroke and is one undo step; one undo history covers the events and the
  terrain. Painting heights: a flat tile at a height in tiles, from the game's height table.
- Heights in tiles (an NPC's y is 65536 a tile, the others 16); entities stand on the layer nearest their height, as
  `FieldG3DMapper_GetTerrain` chooses (the birds on Virbank City's wall), faded on the other layer. Sprites face
  their direction (sheets: up, down, left; right mirrored). Global scripts open in the drawer (the table in
  `script_sys.c`), which lies over the map. The model picker (sprites, banks), Show script beside the script, groups
  open in place, the others on a tile, a back button.
- Checked in the browser (Aspertia City, Virbank City and Complex): pan, the panel, the picker, a global script,
  painting heights and its undo, layers. **Not yet checked:** saving and building these edits (the test ran on the
  real checkout, so nothing was saved).
- Found: the user's moved NPCs didn't show because the save file keeps a map's NPCs; leaving the map shows them.

## 2026-10-31: the Overworld Editor, phase 1 (editor only)

- `editor/src/modules/overworld/`: a zone's events on its 3D map (chunks' GLBs, collision tiles at their heights,
  two-layer chunks), NPCs with sprites, facing, leashes and sight; proxies, triggers, warps and level scripts; select,
  drag, Shift+click add, remove, the script drawer (the embedded Script Editor), a tile-type painter, and the 2,436-byte
  events budget. Tested in the browser on Virbank City, Virbank Complex (both layers) and Aspertia City Gym: loading,
  add, remove, drag, the script drawer and the layer switch work. **Not yet tested:** a saved move or paint built and
  run in game, painting's look on the map.
- Still to come in phase 1: Buildings (map props, as CTRMap edits them), the movement preview, heights in the painter,
  and a build check of the events budget. Then conditions and instances, ambients, groups (the design doc's phases).

## 2026-10-31: fixes after the user's test of the Habitat Dex and the editors

- **Habitat Dex** (built, DSi intact, plain `modules.ok` passes; **not yet tested in game**): touches on the text box
  are checked before the buttons' unterminated touch table (whose search ran into other data, so the text box never
  got them); an area shows each kind of habitat (water, fishing) the Habitat Dex has, past the original 30; Info leaves
  the Habitat Dex's list for the Pokédex's page (`src/paperwhite2/main/paperwhite2_habitat_dex_info.c`, taken in
  `PokedexCommon_LoadHabitatSpecies`), so it opens on the chosen Pokémon (Route 20 opened Patrat: the original list of
  the saved season didn't have the Pokémon).
- **Editor:**
  - forms stack each label over its field in narrow places (a container query), so nested numbers and dropdowns keep
    their width;
  - a palette's unused colors get a ring in the corner instead of being dimmed, so each swatch shows its true color;
  - `x-message` ("game" or "follower") in a schema shows the talk window under the field (the follower's dialogue, the
    trainers' lines);
  - the Text and Script editors have the files' numbers, a sort by name or number, collapsible groups (text), and the
    zones that use a file, with links;
  - the Script Editor shows the game's script ID (Frost's index is it minus 1) and the NPCs, background events,
    triggers and level scripts that run it;
  - the Trainer Editor has a Gym Leaders / Elite Four filter, grouping by area, and where each trainer appears (NPCs
    from script 3000 + its number, and scripts' `CallTrainerBattle`);
  - `#tool/<id>?<params>` links between the editors (`src/navigation.ts`), and `src/modules/world/world.ts` indexes the
    zones and their events.

## 2026-10-31: C-Gear research (nothing changed)

The user's questions about redesigning the C-Gear are answered in `docs/paperwhite2/design/cgear.md`: the native
markers can take new actions (one table and one `case` each), the right-hand top circle already has an unused touch
circle for a skin button, the battery is one sprite coordinate, the survey button can go and bottom-left buttons be
added as new sprites, more markers need arrays, palettes, cells and save bytes (0x25 are free), and the load-save
question and networking can be skipped with four hooks plus a sweep of what assumes a connection. Waiting on the
user's design before any change.

## 2026-10-31 (overnight, second batch): Text, Script, Pokémon and Trainer editors

All in `editor/` (README sections for each); every editor test passes; each checked with Playwright on the real `res/`
read only, and saving a text bank and a script on a scratch copy (each changed exactly the edited line).

- **Text Editor** (`src/modules/text/`): story and system banks, line numbers, search in a bank or all, and the
  reusable `TextBox`: the talk window of `talkmsgwin.c` (bottom balloon, `winframe/05.png` in `00.pal`), the game's
  font 0 and palette 5 from `extract/` (`GET /api/font`, never in `res/` or git), printed a letter a frame; `{be01}`
  waits then scrolls at the next line break, `{be00}` waits then starts a new box (its following line break, which all
  3,758 have, starts the box), `{ff00:n}` colors, words as `Word<n>`. Click = A. The game's fonts keep each glyph's
  widths in the first 3 bytes of its 48-byte cell. Also `MessageEditor` for other pages.
- **Script Editor** (`src/modules/scripts/`): a file whole or one script by its ScriptEntry number, highlighted
  (unknown commands from `field_script.inc` in red), the command's parameters at the cursor, Go to for labels, and the
  message an ID names (editable, previewed). Reusable `ScriptEditor embedded` and `CodeEditor`.
- **Pokémon Editor** (`src/modules/pokemon/`): sprite (normal/shiny), stats with bars, record, evolutions (parameter by
  method) and the family tree, learnset, Pokédex. `SpeciesIcon` reads `sPokeIconPalettes` for the icon's bank.
- **Trainer Editor** (`src/modules/trainers/`): class sprite, settings, party cards (items and moves for the whole
  party or none), lines with the talk window.
- **Not checked:** the preview against the game side by side (the frame and the line spacing are from the code, not a
  screenshot); the words' samples are placeholders, not the script's real words. The user's editor was restarted
  (detached) to serve the new endpoints.

## 2026-10-31 (overnight): the art converter and the boot screen

The user's plan for the night: 1. the art converter in the editor, with the boot and title screens editable and one
more boot screen after the copyright; 2. the Habitat Dex reworked; 3. a Follower Editor, fixing the editor's two old
test failures; 4. shiny extras in the Palette Editor. All four are done:

- **1. Art converter** (`docs/paperwhite2/art.md`): `tools/paperwhite2/screen_art.py` turns PNGs into a screen's
  tiles, screen resources and palette, for the targets of `res/paperwhite2/art/targets.json` (boot logos, copyright,
  the new boot screen, title logo, title's other screen). The editor's Palette Editor is now **Graphics & Palettes**,
  with a **Screens** page (preview, problems per tile, Apply) beside **Palettes**.
  - **New boot screen** after the copyright (`src/paperwhite2/ov162/paperwhite2_boot_screen.c`, hooked in
    `boot_screens.c`): `ARCID_COPYRIGHT` members 9 to 13, blank, skipped while its palette is all black.
  - **Checked:** every target's screens export and convert back pixel for pixel; art converted and built packs as
    16-color members with the same pixels; every target written with --write, built and decoded from the ROM's
    archives shows the same pixels as before (boot logos, copyright, title logo and streaks in 256 colors, the title's
    other screen); Playwright on a scratch copy (choose art, problems marked, Apply). Not yet tested in game: the boot
    with the new screen blank (should be unchanged) or with art.
- **2. Habitat Dex** (`docs/paperwhite2/encounters.md`, "The Habitat Dex"): the Habitat List's screen lists every
  Pokémon of the area's kind of habitat from a new member of `a/2/9/6` (written by `encounters.py habitats`), in pages
  of 20 (L/R, the side arrows, or the cursor past the last row), with method tabs (Select or touch) and season, time
  and weather filters (touch, "any" by default) in the text box. The map, areas and stamps are unchanged. **Not yet
  tested in game at all**; built without warnings, DSi intact.
- **3. Follower Editor** (`editor/README.md`): species' followers (sprites, placement settings), their own dialogue
  (or a button to start one), shared dialogue, item pools, interactions, emotes and balls, with message previews. The
  editor's tests all pass again: the hand-written compact JSON layout (indent 4 or 2) is a known layout, five files
  were rewritten in it with the same data, and `$schema` fragments (`#/$defs/name`) work in the index, forms and the
  save check. Tools hold files without tabs (`documents.hold`, `documents.create`); schemas' cross-file `$ref`s are
  merged as `datajson.load_schema` does. Checked with Playwright on a scratch copy (Snivy's page, a save that changed
  one line, the shared page).
- **4. Shinies** (Graphics & Palettes' third page): every Pokémon's and form's front sprite in its normal and shiny
  palettes, filtered to the five shinies identical to normal (the placeholder, the egg, Manaphy's egg, Castform's
  forms 1 and 3) or the rest; a click opens the shiny palette beside the normal.
  Checked with Playwright read-only on the real `res/`.
- **To test in the morning:** the boot (unchanged while the new screen is blank); the Habitat Dex (pages, tabs,
  filters, the cursor across pages, the stamps, the info button); the DexNav's tabs and cells; the editor's Graphics &
  Palettes (Screens, Palettes, Shinies) and Follower Editor.
- **Also:** I stopped the user's running editor by mistake while stopping my test servers, and restarted it detached
  (`setsid nohup editor/start.sh`, log in the session's scratchpad); it serves tonight's page.

## 2026-10-30: DexNav polish, its art templates, and the editor's Palette Editor

- **DexNav** (not yet tested in game after these changes; the first build was tested and worked):
  - each tab row spaced evenly by the labels' widths, the chosen tab underlined;
  - the cells' shares as wide as their icons and centered, an empty cell's share clear.
- **Art:** `res/paperwhite2/dexnav/` has the README for custom art (the DS's limits, an Aseprite workflow) and
  `templates/{top,touch}.png` of the current layout, from `tools/paperwhite2/dexnav_templates.py`. The converter and
  the app's wiring wait for the first art.
- **Editor:** the Palette Editor (`editor/src/modules/palettes/`, README): every `.pal` under `res/` in the DS's colors,
  on the folder's images, with a sprite's other palette beside it (normal and shiny), hue/saturation/lightness shifts,
  ramps, import from a .pal or a PNG, and .pal downloads for Aseprite. The server has `GET /api/list` (files under
  `res/` by glob). Checked with Playwright on a scratch copy: loading, the preview, saving. `tests/palettes.test.ts`:
  every palette round-trips; the PNG reader agrees with the build's.

## 2026-10-30: the DexNav (not yet tested in game)

- **Built** per docs/paperwhite2/design/dexnav.md ("As built"):
  - the Poké Radar as the DexNav, from Y or the bag;
  - an app in overlay 303 beside the Habitat List;
  - lists from the encounter engine, with "?" for unseen species, the user's method names, and a scrolling grid;
  - logic and screens in separate files, for a later redesign.
- **Along the way:**
  - The hack's `SHORTCUT_SAVE_MAX` is 36, using the save's two spare bytes.
  - `plugin_lcf.py` adds a `.data` section to a module without one.
  - The field saves the encounters' context whenever it closes for an app.
- **Checks:**
  - `--hack` builds without warnings; DSi intact; the plain `modules.ok` passes; main's DS arena has 137 KB left.
  - Overlay 303 can grow 384 KB more before the arena moves.

## 2026-10-30: triple battle fixes, the Dexnav's engine API, the generated Habitat List

- **Triples (the user tested them; they work):**
  - The intro message groups the same species ("Three wild X", "Two wild X and a wild Y").
  - The ball message says three with three up.
  - The editor notes that fishing is always single.
- **Engine:**
  - `PaperWhite2_Encounters_Build` is a side-effect-free core, with read-only getters, for the Dexnav.
  - Encounters' extra conditions now see the field's part (the player's tile, indoors and outdoors).
- **Habitat List:** the hack's build writes it from the encounter data (`encounters.py habitats`) and packs it. 16
  areas have more than its 30 species, and their extra species are left out until the Habitat Dex overhaul. The area
  map isn't regenerated yet.
- **Dexnav decisions:** docs/paperwhite2/design/dexnav.md. The Poké Radar becomes the Dexnav.
- **Checks:** `--hack` builds without warnings; DSi intact; the plain `modules.ok` passes; main's DS arena has 138 KB
  left.

## 2026-10-30: wild triple battles, and the Dexnav design (not yet tested in game)

- **Triples:** a species' triple chance now makes a wild triple battle (docs/paperwhite2/encounters.md, Wild
  triples): a new wild triple intro with a three-name message (the battle bank's message 201), three params,
  style 2, and the wild double's AI flag. `--hack` builds without warnings, DSi intact, plain `modules.ok` passes.
- **Dexnav:** the design is docs/paperwhite2/design/dexnav.md, based on Pokeweb's Pokenav, with eleven open questions
  for the user. Found while researching:
  - encounters' extra conditions can't test the terrain or indoors/outdoors, since BuildSlots fills only the game's
    context;
  - the Pokédex's Habitat List and area map still show the original tables.

## 2026-10-30: the new wild encounter engine (ROM session; not yet tested in game)

- **Built** per docs/paperwhite2/encounters.md:
  - **Data:** per-species data in `res/paperwhite2/encounters/`, with schemas, exported from the original tables by
    the editor's import (`editor/scripts/export-encounters.ts`). level_scaling.json's spread is now 3.
  - **Packer:** `tools/paperwhite2/encounters.py` packs it into one member after `a/1/2/7`'s tables (`check`,
    `odds`).
  - **Runtime:** `src/paperwhite2/main/paperwhite2_encounters.c`, hooked into the table load, the slot picking,
    `GenWildsCore`'s count and partner, the hidden ability, the bulletin board's swarm zone, and the rustling spots'
    item chance.
- **Failsafe:** where no Pokémon can appear, there is no encounter by any method, and an original table's empty slot
  gives none either.
- **Not yet:** wild triples (they count as doubles; the battle intro needs a 3-Pokémon wild version).
- **Behaviour change:** dark grass no longer rolls its own 40% double battle; doubles come from the species' battle
  styles, which default to 100% single.
- **Editor:** the Encounter Editor reads and saves the files (Save, Revert, Settings' import). `datajson.load_schema`
  now follows a `$ref` into another schema file (the habitats' `when`, the follower dialogue's).
- **Checks:**
  - `--hack` builds without warnings; `verify_dsi_rom.py` intact; the plain `modules.ok` passes; clang-format and
    check_style are clean.
  - The editor's tests pass, including `encounters-packed.test.ts`: the packed member's odds equal the editor's for a
    sample of places. Playwright: the editor reads the files with nothing to save, and an edit marks one file.

## 2026-10-30: the editor's first specialty editor, the Encounter Editor (ROM session, in editor/)

- **Who edits editor/ for now:** the user asked the ROM session to work in `editor/` until the encounter work is done,
  and the cloud session is paused meanwhile. The usual split (CLAUDE.md) returns after that.
- **The sidebar:** specialty editors first ("Editors", `ToolModule.section: "editors"`), then Tools, then the
  per-file editors folded under "Data files". `#tool/<id>` in the address opens a tool. New requests:
  `GET /api/data?schema=&keys=` (every file of a kind, parsed) and `GET /api/asset?path=` (a PNG under res/).
  `PAPERWHITE_PORT` runs a second copy on another port.
- **The Encounter Editor** (`editor/src/modules/encounters/`): the planned per-species format, built as a draft from
  the current tables, editable but not saved. The user's decisions are in it: rarity tiers Common 55, Uncommon 25,
  Rare 12, Very rare 7, Exotic 1 (editable, a tier's share split among its Pokémon); per-species min and max levels
  (min gates appearing, max caps), scaled level 80% ± 3; five periods with Day/Night groups; hidden ability 10%;
  single/double/triple chances with family or area partners. Planned files: `res/paperwhite2/encounters/settings.json`,
  `areas/<area>.json`, `species/<name>.json`. The habitat dex will need a new filterable app (location, season,
  weather, time).
- **Revised after the user's review:** list sorts (family, generation) and filters (not in the wild, family not in
  the wild, not obtainable: no family member wild, in a grotto, traded, gifted or static, read from `res/` and the
  scripts); habitats with several places or a whole group (groups by parent zone), several methods, and per-season
  slots ("Same in every season" or each its own); the import merges slots by species into one tier, methods and
  seasons that agree, and groups, and refines levels by evolution (max = evolution level + 2, min = the level it
  evolved at); the town map's real art (`07.png` + `16.nscr` + `00.pal`); a species habitat map coloured by season;
  heatmap colour schemes and an "empty method" measure; areas grouped by parent; rustling spots tentatively Audino
  30% and the rest from the area's Rare, Very rare and Exotic grass Pokémon; the level gate defaults to the scaled
  level. 2,053 habitats for 493 wild species; 31 families can't be had (the legendaries and mythicals).
- **Second revision:** outbreaks (the game's swarms, read from `SWARM_DATA`, White 2's) and Hidden Grotto entries on
  a species' page, counting as "in the wild" for the filters; a legendaries and mythicals switch (off); groups the
  user can add, rename, change and remove on the Areas page (removing one makes its habitats name its areas); a
  whole-family view with shared, linked habitats (each member keeps its rarity and levels); season-coloured buttons
  for per-season slots; on the map, places pinned by clicking with an Open area button, and methods to leave out of
  the empty measure; rustling spots by kind (shaking grass Audino 30%, dust clouds and bridge shadows the game's items
  30%, all of it with no Pokémon there), each area's kind from its zones (caves by battle background 4 and 5, bridges
  by map type 11 and 18).
- **Planned:** a rules pass over the encounter data (the user's rules and exceptions applied in bulk), and turning
  trade-only evolutions into level evolutions.
- **Checks:** `npm run typecheck`, the page builds, `tests/encounters.test.ts` (the import is exact, every slot is
  covered by a habitat, merges, levels, rustling by kind, outbreaks, grottoes, sources) and
  `tests/encounters-render.test.ts` pass; checked in Chromium with Playwright, no page errors. Two older editor tests fail on the conditions and
  follower JSON: those files aren't in the data tools' layout, and their `$schema` has a `#/$defs/...` fragment that
  the editor doesn't resolve.

## 2026-10-30: the follower's dialogue rules, gifts, pickups and steps (branch follower-dialogue, not yet tested in game)

- **Built** per the user's follower design notes, on the conditions engine (following-pokemon.md, "Dialogue rules,
  gifts and steps"): a dialogue library and item pools as `a/0/4/7` members 4 and 5 (`tools/paperwhite2/following_dialogue.py`
  from `res/paperwhite2/following/dialogue/` and `pools.json`, with schemas), talk rules as steps (message, box style,
  emote, motion, cry, action), Frost's `[N]` `[L]` `[C]` codes with multi-page messages, gifts as actions (an item or
  a pool), pickups and ambient emotes on the follower's steps, a talk's friendship once a day, a script step's
  hand-off. The old contextual dialogues, one-time gifts and their ribbon-bit claims are gone.
- **Engine:** new clause kinds `FACING`, `TILE_X`, `TILE_Y`, `TOTAL_STEPS`, `ITEM_WAITING` and the context part
  `CONDITION_CONTEXT_POSITION`; compiler, schema and tests (24) updated.
- **Storage:** five bytes the game never writes, block B 0x1c (u32) and block C 0x16 (u8): waiting item, steps since
  the last gift, total steps; Shedinja clears them. Variables 0x4052-0x4057 (`EVENT_WORK_FOLLOWER_TALK_DAY_0`-`_5`).
- **Debug:** START > Follower... (actions 38-42).
- `configure.py`'s tool dependencies now follow `from tools.paperwhite2 import X`.
- `--hack` builds without warnings, `verify_dsi_rom.py` intact, memory 148 KB left (2.3 KB used); matching
  `modules.ok` passes; check_style, clang-format and the conditions tests pass.
- **To test in game:** following-pokemon.md, "To test" of that section; what remains is at its end.

## 2026-10-30: the conditions engine, phase 1 (not committed, not yet tested in game)

- **Built** per `design/conditions.md` (§10's decisions; §11 lists where it differs): the condition format
  (`res/paperwhite2/conditions/condition.schema.json`, `terrain_groups.json`, `zone_groups.json`), the compiler
  `tools/paperwhite2/conditions.py` (hack-only in `configure.py`: members 2 and 3 of the weather calendar's archive
  `a/0/9/6`, and three generated headers), the matcher, selection, seeds and level scaling in main
  (`paperwhite2_conditions.c`, `paperwhite2_conditions_context.c`), the field part in overlay 36
  (`paperwhite2_conditions_field.c`), and the spawn system's empty placeholder (`include/paperwhite2/spawns.h`).
- **Zone-load counter**: `EVENT_WORK_ZONE_LOAD_COUNTER` (0x4051), found free by the new variable survey
  `tools/paperwhite2/var_usage.py`; bumped in `FieldScript_CallOnZoneInit` (`src/ov012/script_sys.c`).
- **Level scaling**: `res/paperwhite2/level_scaling.json`, adjusted = median * 80% (floor), 2-100, wild +-5.
- **Script commands**: `GetPartyLevel kind, result` (0x2f3) and `CheckCondition id, result` (0x2f4) in every hack
  build; `Debug` moved from 0x2f3 to 0x2f5 (scripts reassemble by name). `script_conditions.json` gives
  CheckCondition's IDs (`SCRIPT_CONDITION_NIGHT` ...).
- **Debug readout**: START menu > Conditions: the context in two messages, the nine sample rules' matches, the pick.
- The weather date's hash is now `Conditions_Hash` (same values; host-tested).
- `--hack` builds with no warnings, `verify_dsi_rom.py` intact, memory check passes (150 KB left, about 4.8 KB used);
  the matching `modules.ok` passes; check_style and clang-format clean; `global_scripts.py --check` current;
  `python3 -m unittest tools.paperwhite2.test_conditions` passes (23 tests).
- **To test in game**: plugins.md, Conditions, "The debug readout".

## 2026-10-29: the START debug menu built out (not committed, not yet tested)

- **Moved** from `global_10130.s` (back to the original's, with its text) to `global_10200.s`, the original's empty
  `dummy.ev` (10200-10249): `Script_2`, script 10201 (`SCRID_PAPERWHITE2_DEBUG_MENU`), its text at the end of
  `global_10200.txt` (a new bank would change the matching build's archive list). `global-scripts.md` regenerated.
- **One command**: `Debug action, arg1, arg2, result` (0x2f3) replaces `PokePartySetEV`; 34 actions in
  `include/paperwhite2/debug_actions.h`, handled in `paperwhite2_debug_commands.c`.
- **Menus**: Party (target cycling, EVs, IVs, level, nature, shiny, friendship, heal, give Pokémon), Items (give item,
  safe key items), World (time, season, weather overrides, flag and variable get/set), Encounters (Always shiny, No
  wild encounters, force species, wild level), Player (warp to last Center, warp to zone, walk through walls, money),
  Info. Number entry is the script's own adjuster (+/- step, step x10 or /10, Done, Cancel) with names shown.
- **Hooks**: `GetRealTimeDayPeriod` (rtc.c), the field's light seconds (fieldmap.c), `GetWeatherAll`
  (zone_weather.c), `EventWildBattleCall_CreateRandom` (field_encount.c, twice), `PlayerMoveCollCheck`
  (field_player_grid.c), `FieldPlayerRail_GetHitBits` (field_player_nogrid.c). The value overrides are RAM in main
  (`paperwhite2_debug.c`): a reset clears them. New flags 0xbda (No wild encounters) and 0xbdb (Walk through walls).
  The Shiny Candy's PID moved to main (`paperwhite2_shiny_pid.c`) for Make shiny.
- `--hack` builds with no warnings, `verify_dsi_rom.py` intact, memory check passes (155 KB left); the matching
  `modules.ok` passes; check_style, clang-format and `global_scripts.py --check` clean; `flag_usage.py` no conflicts.
- Tests: see plugins.md's Debug menu; each category once (Party on the lead and after Next target, a give with a full
  party, Items, each World override across a door, Encounters in grass, both warps, walls on a grid and a rail, Info).

## 2026-10-29: scripted drops reverted, EV bars grey what's out of reach, no wireless icon, Chaos shows ??? (not committed, not yet tested)

- **Shiny Candy from scripted wild battles: reverted** (`PaperWhite2_ShinyCandyDropForScript`,
  `PaperWhite2_ShinyCandyDropAfterScriptBattle`, `Script_21` of `global_2800.s`). Field-battle and release drops stay.
  The crash (Route 19's Patrat, a won battle with a drop): `GLOBAL_SCRIPT_TABLE` (`src/ov012/script_sys.c`) gives
  global_2800 the IDs 2800-2819 only, so `FieldScript_ResolveSCRID` hit `GFL_ASSERT_MSG(scriptId <= end)` for 2820 and
  the assert callback (`AssertFailErrorDisp`) showed "An error has occurred". The Venipede rolled no drop, so it never
  created the VM. A new global script beyond a range's end needs that range's end raised (or a new range) first.
  If retried: a script command (`PaperWhite2_GiveScriptShinyCandy`, say) that the hack's scripts call after
  `CallWildBattleEnd`, which reads a flag the battle's event set and, through `RTCallGlobal`'s path, calls a drop
  script whose ID the table covers; no hook in `CallWildBattleEnd`, which every script shares.
- **EV bars**: the track is white up to min(252, EV + 510 - sum) and grey from there to 252 (the part the stat can't
  reach any more); the IV bars have no grey. The old grey ran from the blue to the reach.
- **Wireless icon**: hidden in hack builds at its only writer, `WmIcon_WriteOam` (`src/gfl/wm_icon.c`): both of its OBJ
  (the icon and the OBJ window under it) are written hidden. The icon still exists, moves and takes its signal level;
  the net error screen and the Union Room's sub screen just have no unblended square. "EVs n/510" (ending at x 252) is
  no longer covered.
- **Season app**: in Chaos the status says "Season outside: ???" (`SeasonApp_Text_OutsideUnknown`); the banner stays
  the game's own season.
- `--hack` builds with no warnings, `verify_dsi_rom.py` intact, memory check passes (159 KB left); the matching
  `modules.ok` passes.
- Tests: Always shiny on; Route 19's Patrat (Script_13/17) and a field shiny: win, no crash, field drop still ~50%;
  release drop still works. Summary on a Pokémon with few EVs (no grey), one near 510 (right ends grey), one at 510
  (grey right after each blue). C-Gear on: no icon at the top right of the summary or the field; Union Room and an
  IR/wireless link still work. Season app in Chaos: "Season outside: ???".

## 2026-10-29: EV reach bars, the Season app's projected season, and more Shiny Candy drops (not committed, not yet tested)

- **Summary, hidden view**: each EV bar is grey after its blue up to min(252, EV + 510 - the sum), the most that stat
  can still reach; none at 252 or with the sum at 510. The title bar shows "EVs 85/510" at its right, where HIDDEN
  STATS was (the title window is 17 tiles again, to the screen's edge). IV bars unchanged (plugins.md).
- **Season app**: the status says "Season outside: X", the season the next exterior gets by the setting
  (`PaperWhite2_GetCurrentSeason`), not the game's current one; the banner and preview follow. On Dynamic Options the
  D-pad cursor previews each mode's season of today (Chaos: the game's own); on Set Hemisphere it previews the
  real-time season of that hemisphere, only while the mode is real time (in other modes the hemisphere changes nothing
  outside, so the top screen keeps the season outside). BACK returns to the projected season.
- **Shiny Candy from scripted wild battles** (`CallWildBattle`, `CallWildBattleEx`, every script): the battle's shiny
  foe is recorded at its start as before; on its return to the script a victory rolls the 50%
  (`PaperWhite2_ShinyCandyDropForScript`, from `EventWildBattleCall_Callback`), and the script's `CallWildBattleEnd`,
  after its fade in, calls `Script_21` of `global_2800.s` (script 2820) as `RTCallGlobal` would, which keeps the
  script's 0x8000-0x8010 values it uses. A catch, a run or a loss drops nothing.
- **Releasing a shiny** in the PC (box or party side of the box app): after "Bye-bye, X!", 50%: "X left behind a Shiny
  Candy!" with the candy in the bag, or "It left a Shiny Candy, but the Bag is full." (`Box2Seq_ReleaseDo`, text in
  `box2_bmp.txt`). Eggs can't be released. The party list has no release.
- **Flags**: 0xaef (Wurmple feeding) and 0xaf0 (the Center's lottery girl), the user's daily flags, in plugins.md.
- Tests: Always shiny on (START debug menu); a scripted static Pokémon (e.g. Dreamyard's Latias or Latios,
  any `CallWildBattle`): defeat it a few times (about half drop, message after the fade in, then the script goes on),
  catch it or run (no drop). Release a shiny from the PC a few times (about half), once with 999 Shiny Candies (bag
  full message). Summary: L/R on a Pokémon with some EVs. Season app: check the status in each mode and the hovers.

## 2026-10-29: fixes after the first test of the Shiny Candy, the Exp. Share and the summary (not committed, not yet tested)

- **Shiny Candy**: its own icon (`ITEM_ICON_SHINY_CANDY` and `_PALETTE_`, appended to `generated/item_icons.txt`;
  `res/items/shiny_candy/icon.png` and `icon.pal`, for now copies of the Rare Candy's to redraw), price 1 in the data
  (prices are in tens: ₽10), the Medicine pocket (data and `myitem_savedata.c`), sorted after the Rare Candy; still at
  Virbank. **Drops:** a wild battle won (`BTL_RESULT_VICTORY`) against a shiny Pokémon gives one if its PID says so
  (`PaperWhite2_IsShinyCandyDropper`: a hash of the whole PID, under `SHINY_CANDY_DROP_PERCENT` (50) of 100, so the
  Pokémon decides it when it is made and reloading doesn't reroll it; releasing a shiny uses the same test), back on
  the field: "The shiny Pokémon dropped a Shiny Candy!", then the usual
  obtained/put-away messages, or "no more room" with a full bag (`Script_20` of `global_2800.s`, script 2819, via
  `L_0151`). `src/paperwhite2/ov012/paperwhite2_shiny_candy_drop.c`, from `EventWildBattleCall_Callback`; the setup's
  shininess is read when the event is created (`candyFoe`), since the battle frees the setup. Grass, surfing and fishing
  encounters only: a scripted static battle returns before the field's fade back in.
- **Exp. Share from Y** never turned it on: `VMJumpIf CMP_STACK` jumps when the comparison is *false*, so Script_19
  took the "off" branch whenever the flag was set. Fixed (compare with 0). Its flag moved to 0x92f (the hack's block,
  see plugins.md's Flags); 0x5d0 is `EVENT_FLAG_0x05d0` again, so a save that turned it off is on again. The follower
  stayed recalled after it: the Y shortcut's events (`EventShortcutCallDirect_Callback`,
  `EventShortcutChoicePopup_Callback`) weren't known to the scene policy, so it now keeps the follower out through them
  as through the X menu; what they chain (an application, the bike, a script) is decided on as before. The Bag's
  description ends with "It is currently ON./OFF." (`itemmenu_disp.c`, text in `btl_main.txt`; the description is two
  lines now). The Bicycle's item-get effect is gone: effects are fixed 3D cut-ins (`Fld3DCi`), none shows an item's
  icon, so the Exp. Share gets the plain key-item fanfare.
- **Summary**: the IV order was right (each row reads its own stat's `PKM_PARAM_IV_*`, as the stat calculation and
  Hidden Power do). Bars added, "HIDDEN STATS" removed (plugins.md). Freeze review: the hidden view has no loop or
  timer; its redraw waits on the print queue only while connected; it found nothing that could hang.
- **Season globe**: back to the black fade while the preview reloads (5f58c202c7's parent).
- **Debug menu**: "Always shiny: ON/OFF" (`EVENT_FLAG_DEBUG_ALWAYS_SHINY`, 0xbd9), in a list built to take more toggles.
- `--hack` builds with no warnings, `verify_dsi_rom.py` intact, memory check passes; the matching `modules.ok` passes.

## 2026-10-29: shinies at 1/1024, the Shiny Candy, and the Gen 6 Exp. Share (not committed, not yet tested)

- **Shiny rate**: `PID_RARE_THRESHOLD` (`include/pml/poke_party.h`) is 64 in hack builds, 8 in the original;
  `PML_UtilPIDIsRare` uses it, and every check (wild and egg PIDs, the Shiny Charm's and the Masuda method's rerolls,
  `PML_GenPID`) goes through it. The Shiny Charm still adds two rerolls.
- **Shiny Candy** (`ITEM_SHINY_CANDY`, unused item 113, Items pocket, the Shiny Charm's icon, 10000): used from the bag
  on a party Pokémon (`src/paperwhite2/ov165/paperwhite2_shiny_candy.c`, called from the party list's item mode in
  `plist_sys.c`). It rewrites the PID's high half and keeps its low 18 bits (sex; bit 16, the ability slot; bit 17,
  which with bits 13-16 orders the box data's blocks) and Wurmple's evolution side; eggs and shinies get "It won't
  have any effect." For testing, Virbank City's second Mart clerk (shop 22) sells it (`scrcmd_shop.c`).
- **Exp. Share**: a registrable key item (same ID and icon). It is on while the bag has it and
  `EVENT_FLAG_EXP_SHARE_OFF` (0x5d0 then, 0x92f now) is clear, so it starts on when received. "Use" in the bag
  toggles it with a message; registered to Y (`SHORTCUT_EXP_SHARE`) it runs `FIELD_COMMON_EVENT_EXP_SHARE`, script 2818
  (`Script_19` of `global_2800.s`). Receiving it shows the Bicycle's item-get effect (`fld_wipe_3dobj.c`, effect 0x2c;
  check in a test that it isn't the Bicycle's own picture). In battle (`AddExpAndEVs`), while it is on, each party
  member that can battle but didn't face the defeated Pokémon gets half the undivided experience, and its EVs; the
  battlers' share is unchanged; holding one does nothing. A save that has it in the Items pocket won't find it.
- `--hack` builds with no warnings, `verify_dsi_rom.py` intact, memory check passes (159 KB left); the matching
  `modules.ok` passes. Next: test in melonDS.

## 2026-10-29: the follower's return after menus and battles, the ball's light, the recall's height (not committed)

Three fixes from the first melonDS test (docs/paperwhite2/following-pokemon.md, "Fixes after the first melonDS test"):
the follower comes back at once beside the player after a menu's application, a battle, or a warp a menu started (Fly,
Dig, Teleport, the Escape Rope), placed during the return's fade and the reopened X menu, while doors keep the walk-in;
the Poké Ball effect is lit as the follower's body (it showed light 0's color, about 2/3 of its palette by day and 1/3
at night); the recall's silhouette shrinks at the body's drawn height instead of sinking to its feet. `--hack` builds
with no warnings, `verify_dsi_rom.py` says intact, the memory check passes (0x285c0, 161 KB left). Next: test in melonDS.

## 2026-10-29: the follower's Options row and battle opening (branch following-port, not yet tested in an emulator)

Steps 5 and 6 of the Following Pokémon port are done, so the base package is ported
(docs/paperwhite2/following-pokemon.md, "Step 5" and "Step 6"). The Options screen has a sixth row, FOLLOWERS: ON/OFF,
saved in Config's `followersOff` (`src/paperwhite2/ov140/paperwhite2_following_options.c`; the screen's work types moved
unchanged into `include/app/config_panel_work.h`, with PAPERWHITE2 wrappers of seven statics in `config_panel.c`). Its
text, the four `title_2` entries the installer changed, is imported into `res/text/system/title_2.txt`; packed, they
equal the hack's (the hack's file is 10 bytes shorter only because the installer dropped four unchanged entries' second
terminator and the size rounding). A wild or trainer single battle that the field marked opens with the follower already
on the platform: no throw, ball or "Go!" (`src/ov167/btlv_scu.c` under PAPERWHITE2). Overlay 140 is
0x0219d320-0x0219fda0; overlay 167 grew 0x1a0, so overlay 168 starts at 0x021de0a0; the DS arena still has 0x28c00 (163
KB). `--hack` builds with no warnings, `verify_dsi_rom.py` says intact, nothing of the hack's is in the IRDO range, and
a plain configure passes `ninja build/w2_us/stamps/modules.ok`. Next: test in melonDS (the doc's lists for steps 3 to
6). Open question: the gifts' claims in block C's ribbons.

## 2026-10-29: the follower's events, talk and effects (branch following-port, not yet tested in an emulator)

Step 4 of the Following Pokémon port is done (docs/paperwhite2/following-pokemon.md, "Step 4"): the ball effects with
the follower's own ball type, the reactions and gifts, the talk (A in front of the follower), the events bridge in
overlay 12 with its actor hooks in `field_actor.c`, `field_actor_tool.c` and `field_actor_rail.c`, and the scene
policy, whose command and sound lists `tools/paperwhite2/following_scene_policy.py` generates from
`res/paperwhite2/following/event-policy.json` and `audio-event-policy.json`. The stubs header
`following_hooks.h` is gone: the follower now waits through talks, signs, prompts and music, and is recalled into its
ball when a script moves something through it. Overlay 36 ends at 0x021f8aa0, overlay 12 at 0x0216ef60; the DS arena
has 0x28c00 (163 KB) left. `--hack` builds with no warnings, `verify_dsi_rom.py` says intact, nothing of the hack's
is in the IRDO range, and a plain configure passes `ninja build/w2_us/stamps/modules.ok`. Open question for the user:
the gifts keep their claims in the top 16 bits of block C's ribbons, as the original did. Next: test in melonDS (the
doc's lists for steps 3 and 4), then step 5 (Options).

## 2026-10-29: the follower walks behind the player (branch following-port, not yet tested in an emulator)

Step 3 of the Following Pokémon port is done but for the talk (docs/paperwhite2/following-pokemon.md, "Step 3: the
follower in the field"): `field.c` and `render.c` are `src/paperwhite2/ov036/paperwhite2_following_field.c` and
`paperwhite2_following_render.c`, and the hooks field-actor-update, field-follower-matcache, field-unload, the three
billboard draws and field-player-recall-direction-gate are in `src/ov036/fieldmap.c` and `field_player.c`. The lead
follows on grids and rails with swaps, stairs and ledges, L/R switches it, SELECT turns it off and on. Ball effects,
talk, the scene policy and the events bridge are stubs (`include/paperwhite2/following_hooks.h`): no ball, and any
running event removes the follower, which walks in again after. Overlay 36 ends at 0x021ef3e0; the DS arena has
0x322c0 (200 KB) left. `--hack` builds with no warnings, `verify_dsi_rom.py` says intact, nothing of the hack's is in
the IRDO range, and a plain configure passes `ninja build/w2_us/stamps/modules.ok`. Next: test in melonDS (the
doc's list), then step 4.

## 2026-10-29: the followers' field actors as sources (branch following-port)

The Following Pokémon port has started on the branch `following-port` (docs/paperwhite2/following-pokemon.md: the
hooks, calls, data and steps). Step 2 is done: the 2,574 table rows and 348 sprites that Pokeweb's installer added to
`a/0/4/7` and `a/0/4/8` are `res/field/actors/followers/` (`tools/paperwhite2/import_followers.py`), with their
constants `OBJ_CODE_FOLLOWER_<SPECIES>[_FORM_<n>][_FEMALE][_SHINY]` from 0x3000 in `generated/obj_codes.txt`; rows
that show another code's sprite name it in `"sprite"`. Packed, both archives equal the hack ROM's byte for byte, so
STATUS's "Not imported yet" no longer has them. No code yet: the ROM has the entries, and nothing uses them.

## 2026-10-28: a 3D preview of Route 1 in the Season app (Remote Control session, not committed)

The Season app's top screen is now a live 3D view of the southern stretch of Route 1 in the previewed season, under
the season's banner (moved up as a label) and the message window (docs/paperwhite2/plugins.md, Season app: The
preview, The spot and the camera). The engines are swapped (main engine on top for the 3D, the touch UI on the sub
engine); VRAM B and C are the BGs, A the textures, F their palettes. `src/paperwhite2/ov312/paperwhite2_season_preview.c`
draws matrix cells 24,22 and 24,21 with the area's season texture set (`shared_dansa01a_2` to `_5`), its SRT animation
(water), its texture pattern animation (the yellow flowers), its props (the two signs and the `r01_a`/`r01_b` falling
petals or leaves, which the season's map replacement picks) and the lights of the time of day (light sets 140 to 143).
The spot and the camera are `res/paperwhite2/season_preview.json`, turned into a header by
`tools/paperwhite2/season_preview.py` in `--hack` builds: target (12592, 4, 11440), distance 300, yaw 30, pitch 45,
fov 20 (the field's Route 1 camera is distance 237, yaw 0, pitch 53.2, fov 20). If the preview doesn't fit, the old
banner-over-grid top screen comes back. The app's heap is 384 KB (was 256 KB); the preview takes about 90 KB, 104 KB
of texture VRAM and 4 KB of palette VRAM. Overlay 312 is 0x21e0 bytes, still under overlay 35's 0x2c40, so nothing
moved; the DS arena still has 210 KB (`0x34880`). `FieldLightEntry` and the GFBTP types moved, unchanged, into
`field/field_environment.h` and `field/field_terrain_animator.h`. `--hack` builds with no warnings, `verify_dsi_rom.py`
says intact, and a plain configure passes `ninja build/w2_us/stamps/modules.ok`. Not yet tested in an emulator or on
hardware. Offline renders of the framing (a software rasterizer of the GLBs, an approximation) were made in the session's
scratchpad. To test: open a Center's globe; the top screen should show Route 1 with "Spring" (or the current season) at
the top; on Set Season, move the key cursor over the four seasons (each change blinks the view dark and fades in the
season's textures); Cancel should fade out to the field cleanly. To reframe, edit the JSON and rebuild with `--hack`.

## 2026-10-28: one weather date a day, from an editable calendar; chaos never repeats (Remote Control session, not committed)

The calendar zones' weather is the original's again, read for one date a day (docs/paperwhite2/plugins.md, Seasons):
each real day picks one date of the current season's months (a hash of the save clock's day number and GameData's
season, uniform over the season's 92 or 90 days), and every calendar zone reads its original weather of that date
through `Calendar_ReadWeatherValue`, so neighbors agree (Virbank City and both Virbank Complex zones snow on the same
winter days). The per-season rates are gone (`res/paperwhite2/seasonal_weather.json`,
`tools/paperwhite2/seasonal_weather.py`, the hack-only `.inc` rule, the rates table). The calendar `a/0/9/6` is now
built from `res/field/weather_calendar/`, a JSON file per zone (each month's days with weather, by "day" or
"first-last", the rest sunny) plus `order.json`, by `tools/data/weather_calendar_data.py` in `DATA_PACKS`; dump and pack
of the base ROM round-trip byte for byte, and the matching build's archive check passes. More than 24 zones would need
`CALENDAR_ZONE_MAX` and `Calendar.zones[24]` raised. Chaos now draws among the three seasons other than GameData's, so
no two exteriors in a row share a season (a discarded interior draw doesn't change the saved season). `--hack` builds
with no warnings, `verify_dsi_rom.py` says intact, the memory check passes (`0x34880`, 210 KB left), `ninja
build/w2_us/stamps/modules.ok` and the `a/0/9/6` check pass on a plain configure, and a host test of the date pick
(every day of 2000-2099 in every season) passes. Not yet tested in game: on a winter day Virbank City and both Complex
zones should snow or not together; spring should bring rain on some days in most zones; in chaos every warp or Fly into
an exterior should change the season.

## 2026-10-28: DS Protect disarmed in hack builds (Remote Control session, not committed)

Hack builds never run DS Protect (docs/paperwhite2/plugins.md, DS Protect), the suspected cause of the shifted
build's black screen on the 3DS (Hardware tests below). Its four sites, in `game_system.c`, `event_battle.c`,
`event_mapchange.c` and `pokelist.c`, call under `PAPERWHITE2` the callbacks that its checks call when they pass, and
overlay 337 is never loaded. No object outside `lib/dsprot` references `DSProt_Init` or `DSProt_CallRunChecks*` in a
hack build. `--hack` and `--hack --shift 0x100` build with no warnings and `verify_dsi_rom.py` says intact for both,
and a plain configure passes `ninja build/w2_us/stamps/modules.ok`. To test on the 3DS through TWiLight Menu++, in DS
and DSi mode: `paperwhite2.nds` and `paperwhite2_shifted.nds` in the Windows folder (the shifted one is also
`build/paperwhite2_shifted.nds`). Load the save, change maps, battle, open the party list. If the shifted build still
goes black, DS Protect wasn't the cause (or not the only one).

## 2026-10-28: the Season app at the Centers' globe (Remote Control session, not committed)

The Pokémon Centers' globe opens a touch-screen Season app instead of Geonet, which hack builds no longer have
(docs/paperwhite2/plugins.md, Season app): `src/paperwhite2/ov312/paperwhite2_season_app.c`, linked into Geonet's
overlay 312 and started by `Scrcmd_ProcFld_CallGeonet` under `PAPERWHITE2`; `global_2100.s`'s `Script_9` no longer
checks `EVENT_FLAG_0x006a` in hack builds (the flag and the Castelia Geonet girl are untouched). It is Geonet's parts
without the globe: the grid on both screens, the message window on the top screen with the setting, the current
season and the game's season banner (its black made transparent over the grid), and on the touch screen Geonet's list
(Set Season, Dynamic Options, Set Hemisphere, Cancel) leading to pages of task-menu buttons with Geonet's Quit button
as BACK. Touch and D-pad + A/B both work; the current mode's or hemisphere's button is amber. Text is a new bank,
`res/text/system/season_app.txt` (`TEXT_BANK_SEASON_APP`); the buttons' art is three new members of Geonet's archive,
`res/graphics/geonet/08.png` (a copy of the task menus' frame), `09.pal` and `10.pal`, loaded through a new
`AppTaskMenuRes_CreateFromArchive` in `app_taskmenu.c`. `--hack` builds with no warnings, `verify_dsi_rom.py` says
intact, the memory check passes (209 KB left; overlay 312 0x3440 bytes, now the largest of its group, so overlays 36,
170 and 337 moved up 0x720, within overlay 36's room), and a plain configure passes `ninja
build/w2_us/stamps/modules.ok`. Not yet tested in an emulator or on hardware: plugins.md has the layout; the test is
to open the globe, try every page by touch and by keys, and leave the Center after each change to see its banner.

## 2026-10-28: the seasons ported, revised (Remote Control session, not committed)

The PMC season plugin is C again, revised rather than copied (docs/paperwhite2/plugins.md, Seasons): the setting is
still `EVENT_WORK_SEASON_SETTING` (bits 0-3 the mode, bit 4 the hemisphere; old saves' 0-7 mean what they meant), with a
southern hemisphere and a chaos mode (8) added, the daily mode counting real days (the plugin's `month * 31 + day`
skipped days at month ends) and the banner shown once for every mode but real time, which keeps the original's walk,
and chaos, which shows none. `Season_GetNext`/`GetPrevious` are the original's again. The 24 calendar zones' weather
is drawn once a day from per-season rates (`res/paperwhite2/seasonal_weather.json`, dumped from `a/0/9/6` by
`tools/paperwhite2/seasonal_weather.py`). `--hack` builds, `verify_dsi_rom.py` says intact, 210 KB (`0x34800`) left
in the main arena, `ninja build/w2_us/stamps/modules.ok` passes on a plain configure, and a host test of the date
math (every day of 2000-2099) passes. No in-game test yet; with the season NPC gone the mode can only be set by a
debug edit of the save's work value until the Season app exists.

## 2026-10-28: the season NPC removed (Remote Control session, not built yet)

The hack's season-change NPC (sets `EVENT_WORK_SEASON_SETTING`, the PMC season code's setting) is gone from the Pokémon
Centers of Aspertia, Floccesy and Virbank: its NPC (at 10,11, shown by `EVENT_FLAG_TRAINER_TEAM_PLASMA_GRUNT_3`), its
script and its messages. Floccesy's and Virbank's scripts and text are the original's again; Aspertia's keep the
hack's other changes, and the daily-gift NPC (global 10851) keeps its messages in Aspertia's bank. Castelia's Center
had only an unreachable copy of the script (no NPC, numeric message IDs past its text), now removed. Bianca's
post-gym scene in `aspertia_city.s` no longer resets that flag (nor Hugh's opening scene sets it), and her C-Gear
lines are the original's again (the hack had appended the "new service in the Pokémon Center" speech).

## 2026-10-28: the battle plugins ported (Remote Control session)

Type Icons (the angular-wedge "Solid" style the hack's ROM has) and Move Effectiveness Preview are C in overlay 168,
`src/paperwhite2/ov168/paperwhite2_{type_icons,move_preview}.c`, hooked from `btlv_effect.c`, `btlv_gauge.c` and
`btlv_input.c` under `PAPERWHITE2`. `docs/paperwhite2/plugins.md` has the files, the hook table and the data.

- The installer's panel expansion is in `res/graphics/btlv/438.png` (8 more blank tiles) and `439.ncer` (a third OAM
  piece); packed, `a/0/1/1` members 438 and 439 equal the hack ROM's.
- The move colors are the hack's (its installer edited the DLL's six color bytes at `0xba4`): super effective light
  blue `0x7ecc`, resisted yellow `0x2f7e`, immune gray `0x4210`.
- `BtlvGauge`, `BtlvInput` and `PaletteFade` moved from their `.c` files into their headers, unchanged; a plain
  `configure.py w2_us` build still passes `ninja build/w2_us/stamps/modules.ok`.
- The hack builds and `verify_dsi_rom.py` says intact. Memory: 210 KB left in the main arena after the heaps (was
  220 KB); overlay 168 is now the highest overlay.
- Not yet play-tested: wedges on the name boxes in single, double and triple battles (player and enemy), hidden under
  a status and back after a cure, following type changes (Roost, Soak, Reflect Type, Illusion); move names colored on
  the move screen in single and rotation battles, and the selected move's name above the target cards in double and
  triple battles.

## 2026-10-28: the trial and the first import (Remote Control session)

### Build

- `orig/baserom_w2_us.nds` matches `w2_us.sha1`. The hack ROM is `orig/paperwhite2_v0.21.nds` (SHA1 `71669351...`,
  trimmed to 297 MB).
- A matching White 2 builds in WSL (Ubuntu 26.04, Python 3.14): `python3 configure.py w2_us && ninja`.
- New `configure.py --hack`: builds `build/paperwhite2.nds` without the SHA1, module and archive checks (no padding,
  no BUGFIX). `python3 configure.py w2_us --hack && ninja`. A plain `configure.py w2_us` goes back to matching.
- The clean data is kept as the git tag `w2-original` (the fork point, 9a2dd68a0e) and, locally, as a copy in
  `extract/res_original/` (ignored). `git diff w2-original -- res/` shows every hack change.

### Imported into res/ (from the hack ROM, verified by rebuilding)

Each archive below, packed from `res/`, equals the hack ROM's member for member, except where noted.

| What | Archive | Files | Note |
| --- | --- | --- | --- |
| Script text | `a/0/0/3` | 17 in `res/text/script/` | Same text; 3 files encode smaller than Frost's (Frost writes uncompressed) |
| Berry descriptions | `a/0/0/2` | 10 `res/items/*_berry/data.json` | Cheri–Aspear gain a flavor line, Figy–Iapapa reworded |
| Zone header | `a/0/1/2` | `res/field/zones/black_city.json` | `enc_slot` 0 → 7 |
| Zone events | `a/1/2/6` | 17 in `res/field/events/` | 4 files (Castelia City 7, Aspertia City, Aspertia and Virbank gates) are 2 bytes shorter in the hack: Frost under-pads the init scripts. Harmless |
| Field scripts | `a/0/5/6` | 24 in `res/field/scripts/` | Byte for byte. No commands from code injection are used. Disassemble *after* importing the script text: the disassembler names messages from `res/text/script/` |
| Wild encounters | `a/1/2/7` | all 135 in `res/field/encounters/` | Byte for byte. Dumped as White 2 for both versions: the hack has seasonal tables where Black 2 has one, which the shared format can't hold, so Black 2's own encounters are gone |
| Trainers | `a/0/9/1`, `a/0/9/2` | Cheren ×2, Roxie ×2, Lass Isabel | Only the real changes; Frost's uncompressed names, reordered message table and a stray `\x{ffff}` on Colress's name were left out. Colress 2's type-20 message also differs in the hack, but the user didn't change it (Frost's table rebuild), so it stays original |
| Map terrain | `a/0/0/8` | 23 CSVs in 20 `res/field/maps/models/*/` | Collision/attributes only, no geometry. 23 tiles use shape 1, which the original never does; `map_terrain_data.py` now packs it unchanged |

Tool fixes: `trainer_data.py dump` named held items with `ITEM_ICON_*` constants (the `ITEM_` prefix lookup), now it
uses `items.txt`; `map_terrain_data.py` accepts tile shape 1.

The trial's comparison scripts are in `tools/paperwhite2/` (start of the editor's Import from ROM).

### Not imported yet

- **Following Pokémon** (port with its code): (done on the branch `following-port`: the 2,574 new field actors in
  `a/0/4/7`/`a/0/4/8`, and the Options text of `title_2`, `a/0/0/2` member 32); files in `following/`,
  `patches/`, `codeinjection/`, `overlay/overlay_0344.bin`, and the root `rail_data_index.tbl` and
  `field_camera_data_index.tbl`.
- (Done, see below: Unown sprites.)
- (Done, see below: Hidden Grottoes and Pokédex habitats.)
- (Done, see the battle plugins above: the type icons' `a/0/1/1` members 438–439.)
- (Done: the banner, see below.)
- Code: arm9 and overlays (PMC hooks, seasons, following) — the plugin port. (MoveEffectiveness and TypeIcons are
  done, see above.)

### Left alone on purpose

- (Corrected below: the rails are real edits.)
- Repacked with no member changes: `a/0/0/4`, `a/0/0/7`, `a/0/1/6`, `a/0/1/9`, `a/1/2/0`, `a/1/2/4`, `a/2/8/2`.

### Rails (found after the first test)

The user edited Castelia City's rails (zone 28 → `a/1/1/0` entry 1 → rail file 11, tile attributes file 36): copies
of the original rails at several heights, with new NPCs on them. Without them the NPCs are missing and leaving the
Castelia Pokémon Center freezes the game (the imported events use rail lines that the original file lacks).

Frost writes rail files with a 6-word header (no end offset, so the game takes the tile width, 0x1000, as the end of
the curves; it works because curves are only looked up by index). Every file it saved has that layout, which is all
26 changed files. The import must keep every point, line, camera and curve index, and write the game's 7-word header.

The root `rail_data_index.tbl` is Frost's zone → `a/1/1/0` index table (zone 28 → 1), and
`field_camera_data_index.tbl` the same for cameras; neither is read by the game.

### Field actor sprites

`tools/paperwhite2/import_field_actors.py BASE_FILES HACK_FILES [ROOT]` writes the sprites of the hack's changed
existing actors into `res/field/actors/`, reading only the base's 1,008 table entries and 975 graphics members (the
rest is the follower plugin's). It imported 23: `OBJ_CODE_POKEMON_UNOWN` and its forms 1–21 (Unown A–V, now other
species' 8-frame walking sprites, 256×32, which the follower plugin's entries also point at) and `OBJ_CODE_253`
(a Castelia NPC given back and walking frames). The table is unchanged, so the entries keep their 6-frame
`sprite_atlas_size` as in the hack. Packed, the graphics equal the hack's first 975 members.

### Rails, grottoes and habitats imported

- `tools/data/rail_data.py` (`res/field/rails/`), `grotto_data.py` (`res/field/grottoes/`) and `habitat_data.py`
  (`res/pokedex/habitats/`) are in `DATA_PACKS`; each packs the base ROM back byte for byte. Built, the rails equal the
  hack's with the header fixed (Castelia's rail file 11: 8 → 36 points, 6 → 30 lines, the originals an unchanged
  prefix), and the grottoes and habitats equal the hack's members.
- Grottoes: 18 of 20 changed, Pokémon only. Three slots had kept the gender thresholds of the species they replaced
  (Nidoran♂/♀ 0/0/100/100, Ditto 0, Kingler/Corsola 30/30/60/60); at the user's request Route 2's Tepig and Giant
  Chasm's Umbreon are now 12 and Route 18's Chatot 50, their species' ratios (31 and 127 of 256), and so are all
  15 starters in grottoes (12, in both versions' sets where the hack placed them). The original game
  sets most slots to 30 by hand, whatever the species.
- Build bug, fixed: `tools/build/files_tree.py` left the symlink to the extracted file at a path that had just started
  being built, so the first pack of a new `DATA_PACKS` archive wrote through it into `extract/<version>/files/` (it
  overwrote the base's `a/2/7/3` and `a/2/9/6`, restored from a fresh extract). It now removes that link.
- Habitats, as Frost regenerated them: every form icon is 0 (the base had 205 seasonal and regional forms), every area
  shows by season, and 18 areas are cut at the game's limit of 30 species (their encounters have 31–77). A habitat
  generator from `res/field/encounters/` that keeps forms belongs in the editor.
- `trade_data.py`'s dump names `held_item` with `name("ITEM_")`, which can give `ITEM_ICON_*` names (as trainer_data
  did); the current trade sources are right.

### Banner

`res/paperwhite2/banner/` (banner.yaml, bitmap.png, palette.png, animation.bin) is the hack's banner; `--hack` builds
point the ROM config at it (`banner_edit` in configure.py), matching builds keep the original. The title is the
hack's (English and Japanese "Paper White 2", the other languages "White Version 2" as in the hack); Frost had filled
the Chinese and Korean titles with 0xFFFF, and they are the original's again (empty, and the Korean "White Version
2"). The icon is the original's, as in the hack.

### DSi header check

`tools/build/verify_dsi_rom.py build/paperwhite2.nds`: every DS and DSi sector digest, block digest and the six
HMACs (ARM7, digest, banner, ARM9i, ARM7i, ARM9) are valid. The DSi settings (dsi.yaml: unit code, flags, access
control, SCFG, title ID) equal the original's; the header bytes that differ are the sizes, offsets, digests and HMACs
that dsd recomputes, and the header and logo CRCs are valid. The RSA signature is the original's, as in the hack,
which runs in DSi mode through TWiLight Menu++ (it doesn't verify it). Run the verifier after every change to the
ROM's layout or code. It can't read Frost's ROM, whose ARM9 isn't BLZ-compressed as it expects.

### First code build (2026-10-28)

With the user's DS ARM7 BIOS at `orig/bios7.bin` (16 KB, ignored by git), `--hack` builds with the example hook
(`PaperWhite2_NextFieldFrame` in ov036, called every field frame) and `--hack --shift 0x100` both build and pass
`verify_dsi_rom.py` (the secure area's own sector digests can't be checked from a decrypted ROM, so it skips them).
The user play-tests both: `build/paperwhite2.nds` and `build/paperwhite2_shifted.nds` (a copy; a shifted build
writes `build/paperwhite2.nds`).

### Hardware tests (2026-10-28)

On the user's 3DS through TWiLight Menu++ (nds-bootstrap; DSi mode at 133 MHz, and DS mode): the normal hack build
with the battle plugins boots, loads the save and battles. The `--shift 0x100` build reaches the title screen and
the save menu, then goes black on loading the save, in both modes; melonDS runs it. nds-bootstrap wrote no log
(`NDSBTSRP.LOG`). The suspected cause is DS Protect (overlay 337): nds-bootstrap disarms it with patches at the
original's addresses, which miss once code moves, and the first check after the save loads is the map change's. The
hack's builds no longer run DS Protect (2026-10-28 entry above); that fix is pending a 3DS test. It matters for normal
hack builds too: ARM9 main has grown since, so every overlay has moved.

### Upstream sync

Remote `upstream` is fuddlesworth/pokebw2; merge (never rebase) `upstream/main` between milestones. First sync
2026-10-28, 102 commits (8f5bf2788c): only data conflicts, in files the hack changed, because upstream renamed script
commands and changed `event_data.py`. Resolve such conflicts by taking upstream's file and dumping the hack's data
again with the new tools (`tools/paperwhite2/events_lenient.py`, `tools/script/field_script.py disasm` after the
hack's text is in `res/text/script/`), never by hand. Then check `ninja build/w2_us/stamps/modules.ok` (code still
matches), build `--hack`, run `verify_dsi_rom.py`, and compare the archives with `tools/paperwhite2/narc_diff.py`.

### NPCs moved back (2026-10-28)

The Aspertia science guy's line is the original again. Back to their original places: Aspertia's advice NPC
(script 5), Floccesy's school kid (script 4, with her original facing and movement), Castelia's Geonet girl
(script 4, 9,12 facing up; the user remembers her on the season NPCs' tile 10,11 facing down after her event,
which the data doesn't show: ask before moving her). Kept as the user placed them: Mr. Medal (global 10638) in the
top-left corner of every Center up to Castelia, moved there so his medals aren't triggered by accident, and
Castelia's upstairs clerk (script 6) moved to make room for him.

### The 3DS crashes: nds-bootstrap's IRDO anti-piracy fix (2026-10-29)

nds-bootstrap applies `retail/apfix/files/IRDO-FFFF.ips` to every ROM with game code IRDO, modified ones
included: it hooks the end of `MIi_UncompressBackward` (0x02004ea4) and writes a 224-byte stub over
0x020933d0-0x020934af. The original has an unused debug font there; once main moved, it overwrote AreaMan's and
the VRAM manager's tables, so billboard-actor and BG allocations failed (invisible NPCs and player, "Virban") and
the original's unchecked AREAMAN_FAIL path then freed garbage (Data Abort at 0x20202020). Confirmed on the 3DS: a
per-ROM override (`sd:/_nds/nds-bootstrap/apFix/<rom>.ips` restoring `bx lr`) fixed the failing build. Fix: hack
builds use game code IRDD, White 2's German code (`HACK_GAMECODE` in configure.py; the DSi title ID follows). IRDZ
was tried first, but emulators then don't know the save chip (melonDS: "The save data could not be accessed").
nds-bootstrap's fixes for IRDO and IRDJ match any CRC (FFFF), those for IRDD/F/I/S/K only the retail ROM's header CRC;
`tools/paperwhite2/check_header_crc.py` fails the build if ours ever equals IRDD's (0xE2DB). nds-bootstrap's Gen 5
fixes (alternate read method, ROM location, ARM9 patch) check only "IRD", so they still apply. DS Protect is
disarmed, so the AP fix isn't needed.

### Later (polish)

- The small follower's occasional clip at the Pokémon Center counter: the split runs there and clears the counter in a
  model of the real geometry; the user still sees something now and then. Look again with a screenshot.

- Boot-time repair of nds-bootstrap's IRDO anti-piracy fix: at startup, if the word at 0x02004ea4 isn't the original
  `bx lr`, restore it and copy back the build's own bytes of 0x020933d0-0x020934af from a copy the build embeds. That
  makes hack builds immune to that fix whatever their game code; it can't cover a future fix at other addresses.
  After any nds-bootstrap update, a quick Castelia check (NPCs visible) on the 3DS.
- If the follower's shadow ever misbehaves badly in Pokémon Centers: try switching camera setup 3 (`a/0/5/9`, used by
  every Pokémon Center) from W-buffering to Z-buffering. In W mode the field's projection depth offsets (actors full,
  shadows half, `FieldRenderPhase2_Fieldmap`) do nothing, so the floor and the oval beat the lowered follower; in Z
  mode the Centers would sort like outdoor maps, and the shadow pass's offset could be lowered to push the oval back
  without sinking it. Risks: z-fighting of near-coplanar details (floor emblem, rugs, counter top, trims), and any
  other map sharing setup 3 (check; give the Centers their own copy if so). One test build, revert if anything flickers.
  The user chose to leave it, since the current state works and the shadow has taken many rounds.

### Next

1. The user tests `build/paperwhite2.nds` (`\\wsl$\Ubuntu\home\riku\paperwhite2\build\paperwhite2.nds`) in melonDS
   (DSi mode) and on 3DS TWiLight Menu++. It is the hack's data on clean code: no followers, seasons or plugins.
3. Port the PMC plugins.
