# The Map Editor (design, 2026-11-01)

The user's plan: a Map Editor in the Paper White 2 editor, on the Overworld Editor's map view, in two parts:

1. **Editing existing maps:** clearing trees, laying roads, and adding gates, cave doors and gaps in forests as ways to
   new maps; adding grass tiles; later, berry trees.
2. **Making new maps from the game's own geometry and textures,** as Trifindo's Pokémon DS Map Studio (PDSMS) does:
   paint 3D tiles on a grid, each with its collision, permissions and height; take the tiles from vanilla maps; preview
   the whole model; and add it to the game with its zone header and parent map.

Custom models from Blender come later (the user, 2026-10-31); the design keeps them in mind, since they reach the
game through the same model writer. The more the editor can do without other software, the better.

This document is the research and the plan. The research came from the code and from measuring all 1,065 chunks; it
cites files as `path:line`. **What is built so far** is at the end.

## How a map is made

- A **zone** (`res/field/zones/<zone>.json`, 615 of them, `generated/zones.txt`) names its **matrix**, its **area**
  and its map type.
- A **matrix** (`res/field/matrices/<matrix>.json`) is a grid of **chunks**: each cell names a map model
  (`MAP_MODEL_*`), and the overworld's matrices also name each cell's zone.
- A **chunk** (`res/field/maps/models/<model>/`) is a container of one Nitro model, its collision and its props. The
  game reads the whole file into a fixed buffer. The containers (`src/ov036/field_map_chunk_{wb,gc,ng,rd}.c`) start
  with `u16 magic, u16 sections` and then u32 offsets:

  | Type | Chunks | Sections |
  | --- | --- | --- |
  | WB | 961 | model, terrain, props |
  | GC | 60 | model, terrain layer 0, terrain layer 1, props (the two-layer chunks: Virbank Complex and others) |
  | NG | 36 | model, props, no collision |
  | RD | 8 | model, terrain with two planes stored per tile, props |

  The sources: `model.glb` (the model, with props as `bw2_prop_NNNN_id_XXXXX` empties), `terrain_<layer>.csv` and
  `terrain_<layer>_splits.csv` (collision), and `data.json` (its texture set).
- An **area** (`res/field/areas/<area>.json`) gives the chunk's **texture set** (`res/field/maps/textures/<set>/`, the
  PNGs every chunk of the area binds to by name), its prop bundle, its lights and its animations. Seasonal areas have
  four records in a row (`<area>`, `_summer`, `_autumn`, `_winter`).
- **Map replacements** (`res/field/map_replacements/replacements.json`) swap a chunk or a whole matrix by season,
  version or event.

### The chunk's model

Every chunk's model is one BMD0 with one MDL0, laid out the same way in all 1,065 (`lib/nnsys/include/nnsys/g3d.h`
has the structs):

- model info: one node, a material and a shape per draw call, the position scale (64 in 843 models), the counts, and
  the **bounding box**, which the game tests before drawing a chunk (`FieldChunk_CheckModelBBox`,
  `src/ov012/field_g3d_map.c:441`): a wrong box makes the chunk vanish;
- one node, identity;
- the render commands: `NODEDESC, NODE 0 visible, POSSCALE, (MAT m, SHP s) per draw call, POSSCALE inverse, RET`;
- materials: 44-byte records (flag 0x1fce, modulate, repeat), with dictionaries pairing each **texture name and
  palette name** with the materials that use it;
- shapes: 16-byte records and their display lists of packed GPU commands.

**No chunk carries textures.** The area's texture set is loaded once per map and bound to each chunk's materials by
name (`FieldChunk_LinkMdlTex`, `src/ov012/field_g3d_map.c:421`, through `NNS_G3dBindMdlTex`,
`lib/nnsys/src/g3d/kernel.c:322`). A name the set lacks fails silently: the material draws with the wrong texture.
`tools/data/nitro_dictionary.py` reproduces every vanilla dictionary byte for byte.

### What the converter does today

`tools/data/map_model_data.py` packs `model.glb` edits back into the original model: positions, UVs, material colors
and opacity, texture rebinding within a confirmed set, and new triangles in an existing draw call (it re-encodes the
display lists). It keeps the original's materials and draw calls, so it **can't add a material or a draw call**, and
`pack` takes each chunk from the original archive, so it **can't add a chunk**. Those are the model writer's job.

## Limits

| What | Limit | Source |
| --- | --- | --- |
| Chunk file | 86,020 bytes for most map types; 110,600 for some, 344,080 for one; the largest vanilla chunk is 99,884 | `MAP_CONFIGS`, `src/ov012/fieldmap.c:213`; `chunkBufferSize` |
| Chunks drawn | usually 2×2 around the player (4); up to 6 in some map types | `chunkCapacity`, `src/ov036/field_g3d_mapper.c:213` |
| Props per chunk | 32 | `propCapacity1`, `field_g3d_mapper.c:239` |
| Polygons | the DS draws 2,048 polygons and 6,144 vertices a frame, all chunks, props, actors and effects together (hardware). Vanilla chunks: median 417 polygons, largest 2,133 | measured |
| Materials and draw calls | 255 each (u8 indices); vanilla's most is 48; names of 16 characters | `nitro_dictionary.py:22` |
| Texture VRAM | 384 KB (banks A to C), with 16 KB of palettes, shared with actors, props and effects; the largest vanilla set uses 168 KB | `fieldmap.c:297`, `g3d_system.c:140` |

The editor shows each chunk's polygons, vertices, materials and file size against these, with the Overworld Editor's
load bar (green under 80%, yellow from 80%, red over). A chunk's budget is a quarter of the frame's polygons, since
four are drawn at once: about 500 polygons, as vanilla's median shows.

## Seasons

Maps change with the seasons in two ways, and both reach the editor.

**Small changes: the textures and lights.** The area's four records name a texture set each. In 66 of the 70
seasonal areas the four sets have **the same texture names** with different pixels, so one chunk works in every
season, the names finding each season's look. Route 19's autumn set (which Route 20 uses) adds 7 textures. Icirrus
City, Twist Mountain and the Moor of Icirrus differ in winter, and those are exactly where winter replaces chunks. Only
the texture set and the lights change between the four records; the prop bundle, animations and colors don't.

- **Editing a chunk:** a texture chosen for a face must be in all four of the area's sets; the picker shows the
  textures every season has, and marks the others.
- **New maps:** use an area whose four sets share names, and the map gets the seasons for free.

**Large changes: whole chunks.** 23 season replacements and one version-and-season (Driftveil's market) swap chunks
or matrices:
- Route 20's autumn swaps its four chunks for `AUTUMN04_20` … `AUTUMN05_21`, a different layout: fallen leaves where
  spring has blocked tiles and puddles (43 to 211 terrain rows differ a chunk, heights in 17 to 174 cells), 2 to 4 more
  materials (the `54ochiba` and `54ki02` textures), the same props.
- Route 1 swaps chunks that differ only by one prop (`r01_b_spring` … `r01_b_winter`).
- Icirrus City, Dragonspiral Tower and Route 8 swap 6 chunks in winter: swamp becomes ice and snow, collision too.
- Twist Mountain, the Moor of Icirrus, Castelia Sewers and Pledge Grove swap their whole matrix.

A chunk replacement swaps **every cell** of the matrix that shows the base model (`src/ov012/map_matrix.c:70`), so a
new map that reuses a seasonal chunk becomes seasonal too.

- **Editing a chunk that has variants:** the editor shows the variants as tabs (Spring, Autumn) with the season the
  game would show. Collision edits offer **"apply to every season"** for cells whose collision is the same in every
  variant, and ask per season where it differs. Props can follow too, except the ones whose model changes by season.
  Geometry is per variant: the faces of two different models can't be matched up automatically.
- **New maps with large changes:** build a variant chunk per season (the editor copies the spring layout to start),
  and the editor adds the replacement entry.
- A season change shows after a map change or a reload.

## New zones or unused ones

The user asked about both.

**Unused zones: the easy route.** About 75 zones are empty leftovers. Each has the 1×1 `MAP_MATRIX_BLACK_CITY_3`
matrix, `AREA_BLACK_CITY_3`, no events, an empty script, a text bank of its own, and no warp leading in:

- Relic Castle 3-15, 18, 20, 24-31 (zones 162-190);
- Victory Road 3-15 and the Trial Chamber (215-229);
- N's Castle's gates (265-276); N's Castle itself (264) is on the town map;
- Route 10 and 10_2-10 (355-364), Challenger's Cave 352-354;
- Black City 3 and 4, Village Bridge 8, Lostlorn Forest 2 (386), Undella Town 4 (417).

Reusing one takes no code: rename it (`tools/data/rename_constant.py`), then give it a matrix, area, place name and
parent. **Don't edit `BLACK_CITY_3`'s chunk**: about 70 zones share it.

**New zones: possible, with three fixes.** The zone list sets the count, and the header archive grows with it; nothing
in the save data is sized by the zone count. But `ZONE_MAX` (615, `include/field/zone.h:12`) also means "no zone":
- the gate boards (`src/ov104/gimmick_obj_elboard.c:375`) and the weather and place-name lists use it as a wildcard
  or an empty entry, so `ZONE_MAX` stays 615, and zone 615 is a dummy;
- the zone header cache starts at 615 (`src/system/zonedata.c:232`), so a real zone 615 would read an empty header
  the first time: a one-line fix;
- beacons reject a zone or parent of 615 and more (`game_beacon_accessor.c:296`); new maps give a parent below 615,
  or the limit rises.

The rail and camera tables' fields fit 2,047 zones, the others u16. `res/field/events/order.json` lists the zones'
events files and must list the new one (its entry 615 is the null placeholder).

**The plan:** start with unused zones, which need no code; add the zone fixes when they run out.

### What a new map needs

In order, each with what packs it:

1. A zone (`zone_data.py`): its matrix, area, map type (which picks `MAP_CONFIGS`: the chunk buffer, the load window,
   the camera), scripts and text bank, BGM, weather, battle background, place name, flags (fly, escape rope, bike,
   running) and **parent**.
2. A matrix (`map_matrix_data.py`): its cells' chunks.
3. Its chunks (`map_model_data.py`, extended by the model writer): models, collision, props.
4. Its events (`event_data.py`), with warps both ways: a warp names a zone and the index of a warp in that zone's list,
   and the player arrives on that warp's tile. `res/field/events/<zone>.json`.
5. Its scripts and text (`SCRIPTS_*` with its init file right after; a text bank).
6. Optional: encounters, a town map entry and a respawn row for flying, a camera, rails, Paper White 2's own data.

**Parent** is the zone a map belongs to: it decides the town map's spot, the Pokédex's habitat and beacons, the
battle background of wild battles, some music, and Paper White 2's conditions and encounter groups. Interiors name
their town; a map of its own names itself.

The editor's **New Map** dialog will do these steps: pick an unused zone (or append one), name it, choose a map type,
an area (its look and seasons), a parent, the matrix's size, and a warp from an existing map.

## Seamless routes on the overworld (researched 2026-11-01)

Route 20 and Floccesy Town join without a loading screen because both zones live in the overworld matrix
(`MAP_MATRIX_OVERWORLD`, map type 0): every frame, `Field_ShouldSwapZone` (`src/ov036/fieldmap.c:1138`) reads the zone
of the player's cell (32 tiles), and when it differs, `Field_SwapZoneByMatrix` swaps zones in place. A cell with no zone
keeps the one before.

- **What swaps** at the boundary: the events (NPCs, warps, triggers), encounters, BGM (not while surfing), weather,
  the fog and lights' index, the camera boundary and camera areas, the place-name popup, the zone's init scripts.
- **What doesn't:** the map type, the area (texture set, props, animations, lights), the matrix. These are set when
  the player warps or flies in. So a new route's chunks must use textures and props that the neighbours' areas have
  (simplest: the neighbouring route's area), and the zone has map type 0 and the overworld's matrix.
- **The two overworld matrices:** `overworld_2` has the same chunks, and only the gates' zones (and Cold Storage) use
  it. A new route's chunks go in both; its zone goes in `overworld`'s zones only.
- **The edges:** map type 0 draws the 2×2 chunks around the player, and nothing at an empty cell. The game rings its
  playable areas with filler chunks with no zone (`OUTTREE` 45 cells, `OUTSEA` 30, `OUTTREE1` 15), and a new route
  needs the same.
- **Room:** the matrix is 29×27 (783 cells) of the 900 `struct MapMatrix` holds (`include/field/field_map.h:19`). About
  55 empty cells touch a zoned one: by the start, (5,19) and (4–5,22) border Route 20, (3,19) borders Floccesy, and
  (1–2,20) and (0,21) border Route 19. A larger matrix needs a hack change to that struct. Grow it only to the right or
  bottom, since a new top row or left column moves every world position.
- **What follows a zone, not a cell:** the town map and fly points (`res/town_map/<zone>.json`, in pixels), the fly
  landing point (the header, in tiles), camera areas, hidden items (`src/ov012/hidden_item.c`), the Pokédex's habitat.
  The town map and habitat images need the route drawn on them.

`tools/paperwhite2/new_map.py route` does the map's side, from an unused zone:
- it renames the zone and its scripts and text after the route;
- it makes a new chunk, copied from a template, for each overworld cell given;
- it names the zone in those cells and puts the chunks in both matrices;
- optionally, it rings the route with a filler model;
- it gives the header map type 0 and the overworld's matrix.

What's left to do by hand: warps to any houses, events (at world positions: cell × 32 + the tile), encounters, the
place name, the town map, and testing the walk across in game (BGM, popup, NPCs, encounters, no void at the edges).

## Painting maps: objects, generated terrain, smart edges (decided 2026-11-01)

The user's test of the tile library showed that cutting maps into tiles is the wrong base: thousands of near-duplicate
pieces, textures that don't join, twice the polygons. The plan instead, in three layers:

1. **An object library**, curated by hand: a whole object (a tree, a ledge, the Pinwheel doorway) saved from a Faces
   selection in a vanilla map, with its textures, footprint, collision and height above the ground; placed and moved
   whole on existing and new maps. Later: importing custom models into it. Bulk tools: forest scatter (density, a set
   to pick from, footprints that don't overlap), and a fence path (start, middle and end pieces repeated to a length).
2. **Generated terrain**: a 2D grid painted with what each tile is (grass, road, sand, water, cliff, pond, tall
   grass) and its height; the editor generates the ground itself, so heights, UVs and textures line up and the
   polygon count stays low, then the objects stand on it. Collision comes from the same grid.
3. **Smart edges** between terrains (path borders, riverbanks, cliff tops), picked from vanilla pieces by the
   neighbours, with a manual override per tile.

### Built so far (2026-11-01)

- **Objects:** saved from a Faces selection (`map_objects.py save`): `model.glb` (x east and z south from the
  footprint's north-west corner, y up from the ground under it, each image the PNG of the set it came from) and
  `object.json` (`map_object.schema.json`: name, category, footprint, the tile types under it, its textures, where it
  came from). Placed on existing chunks by pasting all its faces; on painted maps by the generator.
- **Painted maps:** a project (`map_project.schema.json`) names its chunk, its style, each tile's terrain (a letter a
  tile, a string a row) and height (half tiles), and its objects ([object, x, z]). A style (`map_style.schema.json`)
  gives each terrain its ground texture and repeat, layers above it (tall grass's blades), a wall (riverbanks) and its
  tile type; Route 20's is measured from its chunks (grass repeats every 4 tiles, paths every tile, the river bed
  every 2; tall grass's blades 2, 6 and 8 units up).
- **The generator** (`map_maker.py generate`): ground rectangles per terrain and height as large as the texture's
  reach, UVs from above; each rectangle's edges split where another's corner or a wall's end lies on them, and
  fanned around its middle there, so no T-junction; walls along straight runs, facing the lower side (the lower
  terrain's wall, else the higher's, else the style's); objects on their tile's ground; collision flat at each height
  from the game's table, the terrain's type, the objects' footprints over it. Route 20's chunk painted with grass, a
  path, a river, a plateau, tall grass and three trees: 417 triangles (vanilla's median), packed.

### What PDSMS does, and what to take from it

Trifindo's Pokémon DS Map Studio (github.com/Trifindo/Pokemon-DS-Map-Studio), read 2026-11-01:
- A tile is one OBJ model with a footprint of up to 6×6 cells and flags for tiling; a map is 32×32 cells in 8 layers,
  each with a tile and an integer height per cell; a rotated tile is another tile. Export goes map → OBJ → IMD →
  Nintendo's g3dcvtr (not shipped) → NSBMD, with textures in one NSBTX per area.
- Its only polygon reduction: a greedy rectangle of cells with the same tile and height becomes one stretched tile,
  capped at 16 cells for Gen 5 (the DS's UV range). Global texture mapping (u = (x + column) · scale) makes textures
  line up across tiles and lets quad strips form; each polygon's UVs move by whole repeats, clamped to the DS's range.
  It warns above 1,200 triangles or 1,300 polygons a model.
- Its smart drawing is a flood fill of one terrain with a 3×3 template plus inner corners: no transitions between two
  terrains, no updates when a neighbour changes.
- Its Gen 5 collision is edited by hand, apart from the model, in the same slope and height tables as ours.

**Take:** greedy merging by (terrain, height, material), capped by the texture's UV reach rather than a count (our
writer's composer already does this); planar world UVs moved by whole repeats per polygon; texture sets per area;
polygon warnings (we show the busiest vanilla chunk's).
**Avoid:** T-junctions where stretched quads meet unstretched ones (they gap on the DS; split shared edges or merge
only where both sides match), unwelded vertices, collision kept apart from the ground (ours comes from the painted
grid, snapped to the game's plane tables, with the ground generated on the same planes), a one-terrain autotile, and
stacking a path over the grass at the same height (z-fighting): paths are cut into the generated ground.
**Our autotile:** corner-based (16 cases per pair of terrains, or the 47-case blob), a stored auto or manual flag per
tile, neighbours updated live, and a chunk's edge read from the neighbouring chunk.

## The model writer

A model writer that lays out a model from scratch, as vanilla does, closes both gaps. Its input is what a GLB holds:
materials, each with a texture name in the area's set (and its palette, `<texture>_pl` or the set's pairing), colors,
opacity and sides; and draw calls, each a material and its triangles with positions, UVs and normals or colors. The
editor's edits and tile builds are GLBs, and Blender's models will be too, so one path takes them all to the game.

Its steps (`tools/data/nitro_model_writer.py`):
1. check each texture name against the set, and take each texture's size from it;
2. quantize positions to the display lists' s3.12 at the model's scale, and UVs to texels;
3. encode each draw call's display list with packed commands;
4. lay out the model: info and box, node, render commands, materials and their pairing dictionaries, shapes and
   display lists; then the MDL0, the BMD0 and the chunk container with its collision and props.

**Verifying it without Apicula:** read every vanilla model into the writer's input and write it back. The headers,
dictionaries, render commands and materials must match byte for byte, and the display lists must decode (with the
converter's own `gpu_commands`, `decoded_positions` and `canonical_indices`) to the same triangles, positions, UVs,
colors and normals. Then one written chunk in place of a vanilla one in an emulator.

**New chunks in the archive:** `pack` takes each chunk from the original archive by index and wants exactly 1,065
folders. A chunk the writer writes needs no original, so `pack` writes it whole; new chunks get new `MAP_MODEL_*`
constants after the vanilla ones. About 186 vanilla models aren't used by a matrix, a replacement or the code's
names; they may be loaded by number from code, so new chunks are appended rather than reusing them.

**Adding a texture to a set** (later): `map_texture_data.py` only rewrites pixels; adding a vanilla texture from
another set means rebuilding TEX0 (texels, palette, dictionary records, sizes), within VRAM.

## The editor

One module, **Map Editor** (`editor/src/modules/maps/`), on the Overworld Editor's map view (`MapScene`), with a link
each way. Its modes, each with its own side panel in the Overworld Editor's layout:

| Mode | What it edits |
| --- | --- |
| **Chunks** | the matrix as a grid: each cell's chunk, swapped by picking another; the chunk inspector (polygons, vertices, materials, textures and file size against the limits, and its season variants) |
| **Collision** | the terrain CSVs: paint tile types (grass, water, ledges, warps' tiles and so on), heights and slopes, walls; two-layer chunks by layer; "apply to every season" |
| **Faces** | the model: select faces (click, box, by material), delete them, retexture them with a texture of the area's set, copy and paste them, move them up or down. Clearing trees is selecting a tree's faces and deleting them, then painting the tiles walkable |
| **Tiles** | building from the tile library: a palette of tiles; paint them onto the grid, each with its height and collision; stamps (a rectangle of tiles copied from a vanilla map, such as a house front, a gate or a forest edge) |
| **Props** | the chunk's props, as the Overworld Editor's Buildings do |

### The tile library (retired 2026-11-01)

The first try cut vanilla chunks into tiles (`map_tiles.py`, Route 20's 5,554 tiles) and composed chunks back from them.
It worked (a chunk rebuilt from its own tiles looked the same) but made twice the triangles and thousands of
near-duplicate pieces, and its textures didn't join where tiles from different places met. The painted maps and the
object library below replace it; the slicer and its library are gone.

### Pitfalls

- A texture must be in every season's set of the area, or the material draws with the wrong texture in that season.
- Animated textures (water scrolling, flowers) find their materials and textures by name, so a copied water tile keeps
  its material's name.
- Vanilla Route 20's chunks have no confirmed texture set (`texture_set: null` in `data.json`), and the packer won't
  rebind their materials without one; the Map Editor sets it when it edits a chunk.
- A chunk's file must fit its map type's buffer.

## Phases

1. Research and this design (done).
2. The framework: the module, the matrix grid and chunk inspector, the tile library's slicer and palette.
3. The model writer, verified on every vanilla model; the packer writing new and rewritten chunks.
4. Faces: select, delete, retexture, copy and paste; collision painting with heights and slopes.
5. Tiles: painting, stamps, building a chunk; New Map with an unused zone.
6. Seasons: variants, "apply to every season", season replacements for new maps.
7. Later: appended zones, adding textures to a set, Blender models, berry trees.

## What is built so far

- The model writer (`tools/data/nitro_model_writer.py`) and the packer's `"written"` models.
- The Map Editor's tabs (`editor/src/modules/maps/`, `editor/README.md`): Chunks, Faces (select, delete, retexture,
  move, copy and paste, save as an object), Collision, Paint (painted maps) and Objects (the library).
- The object library (`tools/paperwhite2/map_objects.py`, `res/paperwhite2/map_objects/`) and the map maker
  (`tools/paperwhite2/map_maker.py`, `res/paperwhite2/map_styles/`, `res/paperwhite2/map_projects/`), which share
  `tools/paperwhite2/glb_mesh.py`.

Smart edges so far (`tools/paperwhite2/map_edges.py`): a style's `edges` are profiles laid along a terrain's border,
inside its outer tiles, as the game lays its own. Its paths are three tiles wide: the outer two drawn with `michi01a`
from grass at the border to path a tile in, the middle one plain path. Straight borders bend half a tile in over three
tiles (centred on a tile, ending on tile corners), every third tile on alternating sides and always across from a
T-junction's branch; convex corners are cut round (pulled half a tile in along the diagonal, over two tiles each way).
The ground of the terrain outside fills the gap where the border's line moves in, so its texture isn't stretched, and
the tiles the inside line crosses are clipped along it. Its riverbanks are the water's outer tiles: the land
is half a tile above the water's surface, and the bank slopes down from its edge (`gake1_1`, `gake01a2`) to the water's
edge (`kawa_fuchi.1`), the bed (`kawa_soko`) a tile below the land, with rounded corners too; water is painted level
with the land, and its collision lies half a tile under that (`collision_lift`). Edge terrains marked `square` keep
their corners square. A border to the same terrain, past the chunk
or to a terrain the edge doesn't name has no band.

Edges are painted (the user's call, 2026-11-02, after a margin that redrew the tiles round a painting overwrote a
bridge): a style's edge terrains (`edge_of`: Route 20's Path edge and Water edge) are painted where a border is
wanted, and make one region with their terrain's tiles. The border is drawn in the edge tiles only, against what lies
outside them, which the generator reads but never changes: a kept tile is the terrain whose texture its ground is drawn
with (a terrain's ground, or an edge's face), else the one with its tile type. Bends and rounded corners are placed
along straight runs of edge tiles by themselves. An edge tile has its own tile type (Water edge: vanilla's bank,
0x830041).

Known limits of the map maker so far: walls are one texture stretched down their height, objects stand on their
north-west tile's ground, it writes only a chunk's first collision layer, collision edits made after painting started
are replaced by the generated collision, painted water meets kept water without a bank but with the kept water's own,
and paths narrower than three tiles have no plain middle.

See `docs/paperwhite2/STATUS.md` for the latest, and what is still untested in game.
