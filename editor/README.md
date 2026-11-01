# Paper White 2 Editor

An editor for the hack's data in `res/`, in place, and a button that builds the ROM. It runs in WSL and opens in
Edge.

## Starting it

In WSL, from the repository:

```sh
editor/start.sh
```

The first run installs what it needs (Node.js 22 or later must be installed). Then open **http://localhost:7420** in
Edge. To give it a window and a taskbar icon of its own: Edge's menu, **Apps**, **Install this site as an app**. Stop
it with Ctrl+C in the terminal.

If Edge can't reach it, WSL isn't forwarding the port: check that `localhostForwarding` isn't turned off in
`%UserProfile%\.wslconfig`.

## What it does

- **Specialty editors** at the top of the sidebar, under **Editors**: everything about one subject in one place. The
  first are the **Encounter Editor**, **Graphics & Palettes**, the **Follower Editor**, the **Text Editor**, the **Script Editor**, the **Pokémon Editor** and the **Trainer Editor** (below). The per-file editors are under **Data files**, which folds away. A page
  of a tool can be linked to: `http://localhost:7420/#tool/encounters`.
- **Every kind of data in `res/`, found by itself.** Each data file names its schema in `"$schema"`; the editor groups
  the files by schema, so a new kind of data, a new field or a new file shows up without changing the editor.
- **A form for any of it**, built from the schema: each field with its description, dropdowns of constants for
  fields that name one, lists you can add to and reorder, and the problems the build would refuse, where they are.
  The **Text** view shows the file itself; valid JSON typed there updates the form.
- **Saving is safe.** The build's own validator (`tools/data/datajson.py`) checks the new text before it replaces the
  file, and the file is written in the exact layout the data tools write, so an unchanged file stays unchanged in git.
  A crash never leaves half a file.
- **Files changed elsewhere** (by you, or a Claude session) reload in their tabs; one with unsaved changes asks first.
- **Build** (Ctrl+B) runs `python3 configure.py w2_us --hack && ninja` and shows the log; the hack build copies the
  ROM to your playtest folder. **Changes** lists what changed since the last commit, with each file's diff.

Keys: Ctrl+S save, Ctrl+Shift+S save all, Ctrl+Z / Ctrl+Y undo and redo, Ctrl+P open a file by name, Ctrl+B build.

## Settings

`editor/settings.local.json` (made on the first run, never committed):

| Setting | Default | |
| --- | --- | --- |
| `buildCommand` | `python3 configure.py w2_us --hack && ninja` | Run in the repository by the Build button |
| `commitEnabled` | `false` | The Commit button stays disabled until this is `true`; the Claude sessions commit for now |
| `port` | `7420` | |

Restart the editor after changing them. `PAPERWHITE_PORT` overrides the port for one run, so a second copy (a Claude
session's checks) can run beside yours.

## The Encounter Editor

The wild encounters' editor (`src/modules/encounters/`): everything about the wild Pokémon in one place, read from
and saved to `res/paperwhite2/encounters/` (`docs/paperwhite2/encounters.md`), with `res/paperwhite2/level_scaling.json`'s
percent and spread and the Hidden Grottoes' files. **Save** writes the files that changed, each checked by the build's
validator; **Revert** reads them again. With no data there yet, it starts from an import of the original tables, which
Save writes; `scripts/export-encounters.ts` does the same from the command line. Settings' import replaces every
habitat with a new import of the original tables (until saved). Its pages:

- **Pokémon**: the species list, sorted by number, family, generation or name, and filtered to those in the wild
  (a habitat, an outbreak or a Hidden Grotto entry), not in the wild, whose family isn't, or whose family can't be had
  at all (not wild nor traded, given or a static encounter); legendaries and mythicals are hidden unless asked for. A
  species' page has its levels, battle styles, hidden ability, habitats (a list or a map), outbreaks and Hidden Grotto
  entries. A habitat names areas or groups, and has a slot per season (methods, rarity, periods, weather): one for
  every season or each its own, the season buttons then coloured as the rows. **Whole family** shows every member on
  one page: their levels, and their own habitats or habitats they share (linked copies; each member keeps its own
  rarity and levels; each member's file still has its own).
- **Areas**: the groups of areas (one per parent zone from the import, and your own), which you can add, rename,
  change and remove; then every area by parent zone with its number of Pokémon, its rates, its kind of rustling spots
  (shaking grass, dust clouds, bridge shadows) and its Pokémon by method under the preview.
- **Map**: the game's town map art (`GET /api/screen` draws it from `res/graphics/townmap_gra/`) under the places,
  shaded by species, diversity, one Pokémon's share, or methods with nothing to meet (with methods to leave out), in
  three colour schemes. Clicking a place lists its Pokémon beside the map, with a button to open its area.
- **Settings**: the rarity tiers, level scaling and its gate, the hidden ability's chance, default battles, the
  rustling spots' rule (shaking grass: Audino 30%; dust clouds and bridge shadows: the game's items 30%; the rest from
  the area's Rare, Very rare and Exotic Pokémon, or all of it when there are none), the outbreaks' share (40%), and
  the import's tier thresholds and evolution margin.

The bar at the top sets the preview: season, period, weather, the party's level, and whether outbreaks are on.
`model.ts` has the planned files; `convert.ts` the import; `resolve.ts` the rules the game will follow; `load.ts`
what it reads, including the scripts' gifts and static battles and the swarm table through `GET /api/scan`;
`lookup.ts` the families, legendaries and ways to get each species.

## Graphics & Palettes

The game's 2D art (`src/modules/palettes/`), in three pages. The art itself is drawn in an image editor such as
Aseprite; these turn it into the game's files and set its colors.

### Screens

The screens art can replace (`res/paperwhite2/art/targets.json`, `docs/paperwhite2/art.md`): the boot logos, the
copyright notice, the hack's own boot screen after it, the title screen's logo and its other screen. Each shows as the
game draws it now. **Download as PNG** gives a screen as an indexed PNG in its palette to draw over; **Choose art**
takes a PNG of the screen's size (256×192 for a whole DS screen) and shows it as the DS will, with the tiles and palette
rows it takes and each 8×8 tile that can't be drawn, marked on the preview. **Apply to the game's files** writes the
tiles, screens and colors (`tools/paperwhite2/screen_art.py`, through `POST /api/art/convert`), and the next build packs
them. **Edit its palette** opens the target's palette on the other page.

### Palettes

Every JASC palette (`.pal`) under `res/`, by folder: a Pokémon's `normal` and `shiny`, a trainer's, an item's, a
graphics archive's members, the hack's own.

- **The colors** are the DS's: 5 bits an axis, 0 to 31, written as the data tools write them (`pal.ts`), so an
  untouched color never changes and the build reads what is shown. A palette of more than 16 colors shows in rows of
  16; each row's first color is transparent in a sprite.
- **Editing:** click a color (Shift for a range, Ctrl to add one) and set it by its axes, a hex code or the picker. The
  selection can be shifted in hue, saturation and lightness, made a ramp from its first color to its last, copied and
  pasted, or taken from the palette beside it. Ctrl+S saves, Ctrl+Z and Ctrl+Y undo and redo.
- **The preview** shows an indexed PNG of the folder in the palette (zoom, which row of the palette a 16-color image
  uses, color 0 transparent, only the selected colors), and the same image in another palette of the folder beside
  it: a sprite's shiny palette opens beside its normal one. Clicking a pixel chooses its color. **Open a PNG** shows
  one from your computer, such as work in progress in Aseprite.
- **Files:** **Download .pal** for Aseprite (its **Load Palette** reads JASC), **Import colors** from a .pal or an
  indexed PNG's palette, **Save as** and **New 16-color palette** for new files under `res/`.

### Shinies

Every Pokémon's and form's front sprite (`front_single.png`) in its `normal.pal`, then its `shiny.pal`, as the DS
shows them, by number, 48 a page, filtered by name or number, or to the shinies the same as their normal colors (5
today) or different. The musical's sprites are left out. **Edit shiny** opens the shiny palette on the Palettes page, with the normal one beside it.

## The Follower Editor

The Following Pokémon (`src/modules/followers/`, `docs/paperwhite2/following-pokemon.md`), in five pages. Every file
is edited through the shell's documents without a tab of its own (`documents.hold`), so the page's **Save** (Ctrl+S)
checks each with the build's validator, **Revert** throws the changes away, Ctrl+Z and Ctrl+Y undo and redo, and a
file changed on disk reloads.

- **Pokémon**: the species that have followers, by number (filtered by name, or to those with their own dialogue). A
  species' page has each of its followers (form, sex, shininess) with its sprite in its palette, or the sprite it
  shares, and its settings: the "follower" object of its field actor (`res/field/actors/followers/<name>/data.json`),
  its animation profile, art offset, side gap and walking gaps. Then its own dialogue
  (`res/paperwhite2/following/dialogue/species/<name>.json`), or a button that starts one, and the shared rules that
  name it.
- **Shared dialogue**: `dialogue/shared.json`, the rules every follower has (talk, ambient, pickup), the talk's
  friendship and the library's messages. A rule's **when** is a condition of the conditions engine, as its schema
  gives it.
- **Item pools** and **Interactions**: `pools.json` and `interactions.json`.
- **Emotes & balls**: the bubbles' and the balls' art, whose colors Graphics & Palettes edits.

Under each dialogue file, **How its messages look** shows every message as the game breaks it: pages at `[C]`, lines
at `[N]` and line breaks, a ▼ where `[L]` waits for A, the words filled with examples, and a line in red that is
probably too long for the window.

## The Text Editor

Every text bank (`src/modules/text/`, `docs/data.md`, Text): the story's, `res/text/script/` (each zone's and global
script file's messages), and the rest, `res/text/system/`. A bank lists its messages by their file's line number,
filtered by text or ID; **Search** finds a text in every bank. A message is edited with its line breaks as real ones,
and shown in the talk window as the game draws it: the bottom balloon of `talkmsgwin.c` (30 by 4 tiles, the frame of
`res/graphics/winframe/05.png` in `00.pal`), the game's own font 0 and its palette, printed a letter a frame. A click
is the A button: it finishes the text up to the next wait, or goes on after one. `{be01}` waits and the next line
scrolls, `{be00}` waits and starts a new box, `{ff00:n}` colors (1 red, 2 blue, 0 back), and a script's words
(`{0100:n}` and the like) show as `Word0`; a line that runs past the window is reported. Save (Ctrl+S) writes every
changed bank; Ctrl+Z and Ctrl+Y undo and redo outside the text box.

The font isn't in `res/`: `GET /api/font` reads it from the user's extracted ROM (`extract/w2_us/files/a/0/2/3`, or the
build's copy), and it is only shown. Without it, the preview says so.

Other editors reuse it: `<TextBox text={...} />` is the window alone, `<MessageEditor path={...} line={...} />` (or
`id={...}`) one message's editor with it, and `<TextEditor bank={...} line={...} />` the whole page.

## The Script Editor

The field scripts (`src/modules/scripts/`, `res/field/scripts/<file>.s`), a file whole or one of its scripts, by its
number in the file's `ScriptEntry` table (the number the zones' events call it by): from its label to the next
script's, with its own labels and movements. The text is highlighted: commands (in red when `field_script.inc` has no
such macro), labels and the labels they jump to, constants, numbers, comments, and message IDs. Clicking a line shows
its command's parameters, a **Go to** for a label it names, and a message ID's message from the text bank the file
includes, editable, in the talk window. Save (Ctrl+S) writes the scripts and messages changed; the build assembles
them, so a mistake shows in the build's log.

Other editors reuse it: `<ScriptEditor file={...} script={...} embedded />` is one file (and script) without the file
list, and `<CodeEditor value={...} onChange={...} commands={...} />` the highlighted text box alone.

## The Overworld Editor

A zone's events on its 3D map (`src/modules/overworld/`, `res/field/events/<zone>.json`; the design is
`docs/paperwhite2/design/overworld-editor.md`). The map is the zone's chunks from its matrix (each chunk's
`model.glb`, which **Models** hides) with its collision tiles drawn at their heights (by type, by flag or hidden),
layer 1 or 2 where a chunk has two. Modules: NPCs (their sprites facing their direction, facing arrows, leashes and a
trainer's line of sight), Proxies (background events), Triggers, Warps and Level scripts.

- **Mouse:** the left button selects, drags an entity to another tile (its height follows the tile) and paints; the
  middle button orbits, the right pans and the wheel zooms toward the cursor. Shift+click a tile adds one of the
  shown kind.
- **Heights and layers:** every height is in tiles (an NPC's y stores 65536 a tile, the others 16). The game stands an
  entity on the layer whose tile is nearest its height, and so does the map; on the other layer it is drawn faded.
- **The side panel:** the entity's fields, with groups (grid, area) open in place; the model with its sprite and
  **Browse…**, a grid of every model's sprite filtered by name and by bank (the code's high digit: 0 people and
  objects, 1 walking Pokémon, 2 3D models, 3 followers); **Show script** beside the script; the others on its tile;
  **←** back to the list. Remove leaves the other NPCs' IDs as they are.
- **Rectangles** (triggers, warps, camera rects): the chosen one has handles; drag it to move it, its edges and
  corners to resize it, or **Draw** and drag on the map. Each is one undo step.
- **Chunk sizes** follow the zone's map type (`MAP_CONFIGS` in `src/ov036/fieldmap.c`): 512 units and 32 tiles for most,
  1024 and 64 for the Pokémon League, 2048 for Skyarrow Bridge.
- **Overhead** looks straight down without perspective, north up; the camera only pans (right or middle button) and
  zooms. The tiles are drawn a few units nearer the camera along its lines of sight (the same on screen), over what
  lies just above the ground (autumn's fallen leaves) but behind walls and trees.
- **Rails** (Castelia City's streets, Skyarrow Bridge and the other zones without a grid; `rails.ts`): the zone's rails
  (`ZONE_RAIL_ASSIGNMENTS` → `res/field/rails/maps.json` → `res/field/rails/<rails>/`) drawn over the map as their
  tiles, straight or curved as the game places them, colored by their attributes; the NPCs, warps, triggers and
  proxies stand on them by line, front and side. Drag them along the rails, Shift+click a rail tile to add one,
  paint rail tiles' types (in `attributes/line_NN.csv`). **Rails** shows one height at a time (Castelia's rails are
  at several), and **Show** grid tiles, rail tiles or both in a zone with both. The panel notes an entity past its
  rail's edge. ▶ Movement moves the NPCs on rails too (RAIL_WALK_RANDOM, RAIL_TURN_RANDOM_*, RAIL_PATROL, as
  `field_actor_rail.c` does).
- **The Rails tab** (rail zones only) edits the rail file itself (`rails.json`, through its schema's form): points
  are balls, lines tubes along their middles. Drag a point to move it at its height (its lines follow); Shift+click
  adds a point; **New line from here**, then a click on another point (on the map, or in the list after ←), adds a
  line between them with its direction, a free slot at each end, a straight curve, the length it measures and new
  attributes (`attributes/line_NN.csv`). A line's panel sets its curve (straight, a flat arc or a 3D arc, and the
  arc's center in tiles) and fits its length to its shape, resizing its attributes. Only the last point or line can
  be removed, since the events and the attribute files name them by number. The rail cameras are edited by number for
  now.
- Painting keeps the flags it doesn't set (a tile's 0x80, which every rail tile has and no code names yet).
- **The Cameras tab** edits the zone's camera areas (`res/field/cameras/`, `cameras.ts`), the parts of the map where
  the camera changes as the player walks in: a rect of tiles whose camera blends across it (the arrow) or a rail map's
  ring. The panel shows angles in degrees, distances in units and the field of view as the whole vertical angle;
  **Preview the game's camera** puts the view where the game's camera would be (in the DS's 4:3 frame, without the
  editor's marks), with a slider from the area's first row to its last; the list can preview the zone's own default
  camera at a clicked tile. Every camera value's label drags to change it (Figma-style; Shift finer, Alt coarser),
  one undo step a drag, while the preview follows. A rect shows its first row green and its last orange; **Blends**
  turns it front to back or left to right (the game's width of 1), **Swap first and last** reverses it. The yaw turns the short way round between its two values (0° to 300° turns
  60° back), as Paper White 2's game does. Shift+click adds a rect, making the zone's file if it has none (the hack's build reads a
  file's "zones", so any zone can have camera areas). The preview draws only the zone's own chunks, so what the game
  shows of the zones around it is missing.
- **NPC spawns** (`res/paperwhite2/overworld/<zone>.json`, `spawns.ts`): an NPC's panel adds a **condition** (the
  season, time and weather chips, a chance a day, and every field of the conditions' format) and **instances**,
  copies of it that the game picks one of at zone entry (by weight, among those whose conditions hold), which makes it
  their host (drawn faded). Instances show with a purple box, move like NPCs and open in the panel with their own
  condition and weight. **▶ Conditions** previews what the game would show for the Season choice, a time, a weather
  and set flags; Reload rolls another day.
- **Buildings:** the chunks' props, as CTRMap edits them: each a model of the area's prop bundle
  (`res/field/props/`) placed in its chunk's GLB (`bw2_prop_<n>_id_<prop ID>` nodes, which the build packs). Click
  to choose (it turns half seen through), drag to move by whole tiles, Shift+click to add the last model chosen; a
  green outline marks the tiles under each model; the panel sets the model, the
  place in tiles and the turn. A prop has no collision: paint the tiles under it. Saving rewrites the chunk's
  `model.glb` (the server's `PUT /api/glb-props`).
- **▶ Movement** plays the NPCs' move codes as the game runs them (`movement.ts`: random walks and turns, back and
  forth, loops and routes, spins; 30 frames a second, 8 a step; blocked by the leash, the tiles, a height step of 20
  units and the other NPCs, not the player), from their tiles, which stay marked.
- **Scripts:** **Show script** opens the script over the lower half of the map, in the Script Editor, editable: a
  zone's own or a global one (GLOBAL_SCRIPT_TABLE in `src/ov012/script_sys.c` gives the ranges).
- **Seasons:** a zone whose area has seasons gets a **Season** choice, which shows the chunks the season puts in place
  (`res/field/map_replacements/`, as the game patches the matrix) with the season area's textures. Painting edits
  the chunks shown, so a season's own chunk has its own permissions.
- **Warps:** a warp's panel links to the zone it leads to, with the warp it arrives at chosen. Each zone keeps its
  unsaved changes and its undo while another is shown; Save writes them all.
- **Paint** (the map gets a light blue border) sets tiles' type (walkable, blocked, water, grass and the rest) or a
  flat height in tiles (the wheel over the box steps it by half a tile), in the chunk's `terrain_<layer>.csv`, colored
  as the stroke passes. A height is the nearest the game's height table has (half tiles from -10 to 10 tiles, but -8).
- The header's load bar is the events' packed size against the game's 2,436-byte buffer (green, yellow from 80%, red
  past it, with a warning; the build refuses such a zone). Save (Ctrl+S) writes the events and
  the painted terrain; Ctrl+Z and Ctrl+Y undo and redo moves, adds, removals, field edits and paint strokes (one step
  a stroke) in order. The server gives the models and their textures at `/res/...`.
- A save made on a map keeps its NPCs as they were, so after a build leave the map and come back to see the changes.

## The Map Editor

A zone's map chunks in 3D, in a season (`docs/paperwhite2/design/map-editor.md`). Click a cell of the matrix, or the
map, to choose a chunk; the middle button orbits, the right pans and the wheel zooms.

- **Chunks:** the zone's cells of its matrix, and the chosen chunk's inspector: its model and texture set, whether it
  packs as edits of the original model or as a whole model (`"written"` in its `data.json`), its triangles, vertices
  and materials against the busiest vanilla chunk's, its season variants (the chunks a season replacement swaps in,
  each a model of its own), and its textures against each season's set: a texture a season's set lacks draws wrong in
  that season.
- **Faces:** click a face to select it, Shift+click to add one, Ctrl+click to take one away. **Select connected** adds
  the faces sharing corners with the selection; **Select the stack** adds what stands with it, seen from above (a
  tree's trunk, its crossed cards and its layers of leaves, without the ground under it); **Select same material**
  takes every face of the selection's draw calls. **Delete** removes them; **Retexture** draws them with another
  texture of the area's set (those missing from another season's set are marked). Edits are written to the chunk's
  `model.glb` at once, with Ctrl+Z and Ctrl+Y. A retexture gives the chunk a new material and draw call, so its
  `data.json` gains `"written": true` (and the area's texture set where it had none), which packs the whole model with
  `tools/data/nitro_model_writer.py`. Clearing a tree: click its leaves, Select the stack, Delete, then paint its tiles
  walkable in the Overworld Editor (collision painting comes to the Map Editor later).
- **Tiles:** the tile libraries (`res/paperwhite2/map_tiles/<library>/library.json`) cut from the game's chunks by
  `tools/paperwhite2/map_tiles.py`: **Cut the tiles** makes the catalogue in `build/map_tiles/`, and the palette shows
  each tile's picture, most used first, filtered by kind and material. A tile's details give its footprint, triangles,
  materials, collision and where the chunks use it (**show** goes there on the map). Painting tiles into a chunk comes
  next.

## The Pokémon Editor

Every species and form (`src/modules/pokemon/`, `res/pokemon/<species>/data.json` and `form_<n>/data.json`), by number
with their icons. A species' page has its front sprite (normal or shiny), its name and types, its base stats as bars
with their total and its EV yields, its abilities, held items, breeding and the rest of its record, its evolutions
(each method's parameter as an item, a move, a species or a number, as the method takes) with the family's tree, whose
members open with a click, its learnset (by level, sorted; TMs and HMs; tutors; egg moves) and its Pokédex data. Save
(Ctrl+S) checks each file with the build's validator. `<SpeciesIcon species={...} />` is a species' party icon in the
colors poke_icon.c gives it, for any editor.

## The Trainer Editor

Every trainer (`src/modules/trainers/`, `res/trainers/data/`), filtered by name or class, with the class's sprite. The
trainer's settings (name, class, battle style, money, reward, healing, items, AI flags) are the schema's fields; the
party is cards: species with its icon, level, form, difficulty, ability and gender slots, and, as the whole party has
them or not, held items and its own moves (else the moves of their levels). Each of the trainer's lines is edited with
its talk window preview. Save (Ctrl+S) checks each file with the build's validator.

## Dragging values

Number fields that measure something have a ⇔ grip (in the forms) or a label (in the Overworld Editor's panels) that
drags left and right to change the value, Shift finer and Alt coarser, clamped to the schema's minimum and maximum; a
drag is one undo step. Numbers that name something (IDs, flags, scripts, an index into a list, values shown in hex)
don't drag.

## How it is built

| Folder | |
| --- | --- |
| `server/` | Node server: the index of `res/` (`project.ts`), saving, the build and git, and the build's Python for constants and validation (`python/`) |
| `shared/` | Used by both: JSON read and written without loss (`json.ts`), the schemas' validator (`schema.ts`), the API (`api.ts`) |
| `src/` | The page (React): the frame in `App.tsx` and `shell/`, open files in `documents.ts` |
| `src/modules/` | Editor modules, one folder each, found by themselves |
| `tests/` | `npm test`: every data file and palette round-trips byte for byte, the editor's validator agrees with the build's, and the Encounter Editor's import and pages work on the real `res/` |

### Adding a module

A module is a folder in `src/modules/` with a `module.tsx` whose default export is an `EditorModule`
(`src/modules/types.ts`). Nothing else needs changing.

- A **data view** opens files of the kinds of data it handles: `handles(type)` scores each kind, and the highest
  score wins. The generic form answers 1 for everything, so it is always there as the fallback and the Form view.
- A **tool** has a page in the sidebar, for work spanning many files. `requires` lists the schemas it needs; it hides
  itself while one is missing.

Modules change data only through the props they are given (`edit`, `replace`); saving, undo, validation and changes
on disk are the shell's. Build them around the schemas, so the editor and the build agree about every format.
