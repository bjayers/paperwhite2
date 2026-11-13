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
  first are the **Encounter Editor**, **Graphics & Palettes**, the **Follower Editor**, the **Text Editor**, the **Script Editor**, the **Pokémon Editor**, the **Trainer Editor** and the **Weather Editor** (below). The per-file editors are under **Data files**, which folds away. A page
  of a tool can be linked to: `http://localhost:7420/#tool/encounters`.
- **Every kind of data in `res/`, found by itself.** Each data file names its schema in `"$schema"`; the editor groups
  the files by schema, so a new kind of data, a new field or a new file shows up without changing the editor.
- **A form for any of it**, built from the schema: each field with its description, dropdowns of constants for
  fields that name one, lists you can add to and reorder, and the problems the build would refuse, where they are.
  The **Text** view shows the file itself; valid JSON typed there updates the form.
- **Saving is safe.** The build's own validator (`tools/data/datajson.py`) checks the new text before it replaces the
  file, and the file is written in the exact layout the data tools write, so an unchanged file stays unchanged in git.
  A crash never leaves half a file.
- **Tabs for the editors and the files.** Each editor opened from the sidebar or a link gets a tab and stays open
  behind it, keeping its place (its zone, file, filter, selection). A link from one editor to another (a script's
  trainer, a flag's uses) opens the target's tab, and **← Back to …** at the strip's end returns to where it was
  followed from. Middle-click or × closes a tab. A hidden editor's keys are off and its 3D view stops drawing.
- **Files changed elsewhere** (by you, or a Claude session) reload in their tabs; one with unsaved changes asks first.
- **Build** (Ctrl+B) runs `python3 configure.py w2_us --hack && ninja` and shows the log; the hack build copies the
  ROM to your playtest folder. **Changes** lists what changed since the last commit, with each file's diff.
  **Push to GitHub** (under Changes) publishes edits for the cloud session, which sees only GitHub: it lists the checked
  files (or every one shown), commits them by name with a message you can change ("Editor: encounters, text"), merges
  `origin/main` in and pushes to `main`, trying again when the network fails. A conflict aborts the merge and lists its
  files; it never forces or rebases. ROMs, `orig/`, `extract/`, `build/`, the Script Editor's `notes.json` and files git
  ignores are never staged. It doesn't build.

Keys: Ctrl+S save, Ctrl+Shift+S save all, Ctrl+Z / Ctrl+Y undo and redo, Ctrl+P open a file by name, Ctrl+B build.

## Settings

`editor/settings.local.json` (made on the first run, never committed):

| Setting | Default | |
| --- | --- | --- |
| `buildCommand` | `python3 configure.py w2_us --hack && ninja` | Run in the repository by the Build button |
| `commitEnabled` | `false` | Commit, Discard and Push to GitHub stay disabled until this is `true` |
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
- **Map**: the town map as the Pokédex's area page draws it (`GET /api/town-map`, `server/python/town_map.py`: both BGs of
  `res/graphics/townmap_gra/` with the route lines, circles and dots, and each place's glow shape from the area OBJs of
  `res/graphics/pokedex_gra/`, coloured by the page; a place without one is a pill or circle), the places
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

The game's 2D art (`src/modules/palettes/`), in five pages. The art itself is drawn in an image editor such as
Aseprite; these turn it into the game's files and set its colors.

### Screens

The screens art can replace (`res/paperwhite2/art/targets.json`, `docs/paperwhite2/art.md`): the boot logos, the
copyright notice, the hack's own boot screen after it, the title screen's logo and its other screen. Each shows as the
game draws it now. **Download as PNG** gives a screen as an indexed PNG in its palette to draw over; **Choose art**
takes a PNG of the screen's size (256×192 for a whole DS screen) and shows it as the DS will, with the tiles and palette
rows it takes and each 8×8 tile that can't be drawn, marked on the preview. **Apply to the game's files** writes the
tiles, screens and colors (`tools/paperwhite2/screen_art.py`, through `POST /api/art/convert`), and the next build packs
them. **Edit its palette** opens the target's palette on the other page.

### Sprite sheets

Sheets of OBJ art that a build tool packs whole from one PNG (`SPRITE_SHEETS` in `server/main.ts`): so far the
Pokédex Area page's icons (`res/paperwhite2/pokedex_art/area_icons.png`, 160×80, packed by
`tools/paperwhite2/pokedex_area.py`). Each shows as the game will (on the page's grey, over its very light grey
copies) with its tool's check. **Download PNG** gives the sheet to draw over; **Import PNG** takes a PNG of the
sheet's size and runs the tool's `check` on it (`POST /api/sprite-sheets/check`): it says how the colors fit the
palette rows, or names the icons with too many colors; **Apply to the game's files** writes it over the sheet's PNG,
and the next build packs it.

### Item icons

Every item's bag icon, the hack's items first (the constants of `docs/paperwhite2/items.md`'s table), then all by
number, with a filter. An item shows the icon and palette that `src/system/pml_item.c`'s table gives it in the hack's
build, files of `res/items/` (`server/python/item_icons.py`, with the packer's `tools/data/item_icon_data.py`).
**Download PNG** gives the icon to draw over; **Import PNG** takes a 32×32 PNG, indexed with indices 0-15 (0
transparent) or RGB(A) with at most 15 colors besides transparent pixels, and shows it as the game will
(`POST /api/item-icons/check`); **Apply to the game's files** writes its icon and palette over the item's files, and
the next build packs them. Files that other items show too are named, since Apply changes those items' icon as well.

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
changed bank; Ctrl+Z and Ctrl+Y undo and redo outside the text box. A message shows its line and, where no `\from`
line stands for several, its number in the bank, which code and data use.

**Add line** appends an empty message after the bank's last one, with a new ID in the bank's style
(`<Bank>_Text_Empty_N`, as unpacking names empty messages), and **Remove last line** removes the last message if no
script, data file or code (`res/**/*.s`, `res/**/*.json`, `src/`, `include/`) names its ID. Messages are never
inserted in the middle: what names a message by its ID follows it, since the build rebuilds the IDs' header, but code
and data that give a message by its number (a range such as the Castelia crowds' `msg_base`, a C table, a bank read by
species) don't, and no search finds those for certain. `tests/text-banks.test.ts` checks that adding and removing a
message gives every bank back byte for byte.

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

- **Overworld map** (under the zone filter) opens the overworld's grid over the map: each area's cells in its own
  color, the current zone's outlined, filler cells (the trees and sea around the areas) grey. Click an area's cell to
  open its zone at that chunk, or a filler or empty cell to start a new route there (New map, as a route, with that
  cell picked).
- **New map…** (the header) takes one of the game's unused zones (about 60 empty leftovers: no events, no warp leads
  there, the code doesn't name them, not on the town map) and makes it a map, from the chunk chosen on the map as a
  template (`tools/paperwhite2/new_map.py`). The zone, its scripts and text bank are renamed after the map, and its
  chunks are new map models after the game's, each a copy of the template (props too, if asked), packed whole. Either:
  - **a map of its own**, which warps lead into: a matrix of width by height chunks, the area and parent chosen (or
    the template's zone's area, and itself);
  - **a route on the overworld**, beside the others and walked onto without a loading screen: pick the overworld's
    cells (empty, or filler with no zone) on the grid; the zone is written into them, the chunks go in both overworld
    matrices, and the empty cells around get a filler (trees or sea), as the game rings its areas. Use the neighbours'
    area: the field keeps the area it warped in with as the player walks across. The neighbour's edge chunk may need a
    path cut through it.

  Then give the map warps (Overworld Editor), and its look in the Faces, Collision and Paint tabs.
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
  `tools/data/nitro_model_writer.py`. **Move** moves the selection a tile at a time (the arrows, or Alt+arrow keys) or a
  unit up and down (Alt+Page Up and Down; with Shift, half a tile), keeping it selected. **Copy the faces** copies the selection, to paste in any chunk of any zone with
  **Paste where I click**: the faces' north-west corner goes on the tile clicked, as high above its ground as they stood
  above their own (a tree's shadow stays just over the grass, as vanilla's do), and
  the chunk is then packed as a whole model. Where the pasted faces use textures that the area's season sets lack,
  **Import the textures** adds them to every season's set (`imports.json`), copied from the faces' own set. Clearing a tree: click its leaves, Select the stack, Delete, then paint its tiles
  walkable in the Collision tab.
- **Collision:** the chunks' collision tiles of a layer drawn over the map, colored by type (blocked red, water blue,
  encounters green, the chosen class yellow). Click or drag to paint with the brush: a tile type (a class of the
  game's `TILE_CLASS_` enum, read from `include/field/field_map.h`, and its flags), a flat height, or a whole tile
  copied with Alt+click (Alt+click also gives the brush the tile's type and height). Two-layer chunks (Virbank Complex,
  bridges) choose their layer. Where a season replacement swaps a chunk (Route 20 in autumn), **Paint the season
  variants too** paints the same tile of the variants where it was the same. Ctrl+Z undoes a stroke; **Save** writes the
  collision files (and layouts), **Revert** drops what isn't saved.
- **Paint:** the chosen chunk as a painted map (`res/paperwhite2/map_projects/<model>.json`): **Start painting** from
  the chunk as it is (every tile kept, to paint only what changes: a pond in a field) or with every tile a terrain of
  a style (`res/paperwhite2/map_styles/`, Route 20's to start; a new map), at the chunk's collision heights or one
  height. A copy of the chunk is kept beside the painting (`<model>.base/`): kept tiles draw from it (its faces with
  the painted rectangles cut out, its collision), and **Stop painting and put the chunk back** restores it. The
  **Keep the chunk** brush is the eraser. Ctrl+Z undoes a generate too. Then paint each tile's terrain (grass, path, tall grass, water, blocked grass) and height (or raise
  and lower them half a tile) with a pencil or a rectangle; place objects of the library on a tile, and select and
  drag them to others (Delete removes one). **Generate the chunk** writes its model and collision
  (`tools/paperwhite2/map_maker.py`): the ground merged into large rectangles textured from above, so textures run on
  across tiles, walls (cliffs, riverbanks) where heights differ, tall grass's blades, the objects on their ground, and
  each tile's collision from its terrain and height (objects' footprints over it). The painting stays, to change and
  generate again. **Map shows** switches between the painting and the generated model.
- **Objects:** the library of whole objects (`res/paperwhite2/map_objects/<object>/`). In the Faces tab, **Save the
  faces as an object…** keeps a selection (Select the stack takes a whole tree) with its footprint, the collision
  under it, its textures and how high it stands over the ground. Here, **Place it where I click** puts one on an
  existing chunk (its faces join the model, its collision is painted, textures the area lacks can be imported); on
  painted maps it's placed in the Paint tab, where it stays an object to drag.
- **Wireframe** (the toolbar) draws the models' triangles' edges, to see what a click picks.

## The Pokémon Editor

Every species (`src/modules/pokemon/`, `res/pokemon/<species>/data.json`), by number with their icons, and under each
its alternate forms, every one its `forms.count` gives, by its Pokédex name (`pokedex.forms`), whether or not it has a
record (`form_<n>.json`); the hack's are tagged "added". A species' page has its front sprite (normal or shiny), its name and types, its base stats as bars
with their total and its EV yields, its abilities, held items, breeding and the rest of its record, its evolutions
(each method's parameter as an item, a move, a species or a number, as the method takes; for a species with forms, an
**Only form** picker, Any or one of its forms by name, so that any method can be one form's, an Alolan Vulpix's Ice
Rock beside a plain one's Fire Stone: the entry's `"form"`, docs/paperwhite2/design/form-evolutions.md) with the
family's tree (a one-form evolution says "(Alolan only)"), whose members open with a click, its learnset (by level, sorted; TMs and HMs; tutors; egg moves) and its Pokédex data. Save
(Ctrl+S) checks each file with the build's validator. `<SpeciesIcon species={...} />` is a species' party icon in the
colors poke_icon.c gives it, for any editor.

Forms (`FormPage.tsx`, docs/paperwhite2/design/forms-and-species.md section 11.6):
- A species' **Forms** card lists its forms and the sprite groups they take, and **Add form** makes a new one from the
  species or one of its forms: a name, and "Own stats, types, abilities and moves" (a record of its own; always, where
  the species' forms have records). A dry run says what it will write first. Its Wonder Trade row puts the species in
  or out of the random pool (`excluded_species`).
- A **form's page** has its sprite and icon, a Form section (Data: its own record on or off; Evolution: Can't evolve,
  `forms.no_evolution`, and under it the species' evolutions this form takes, read only, with what each makes of it,
  "Ninetales: Alolan", or "(no Alolan form yet: it becomes the normal form)", a link to edit them on the species' page,
  and a clear "It can't evolve" where none is for it, which Eviolite follows too; Wonder Trade: in the random pool or not, `excluded_forms`; **Remove form** for the hack's last
  form), its Pokédex entry, its Art (the icon and the 96x96 stills imported as PNGs, checked and previewed, the icon's
  palette bank picked from its colours; the animated battle sprite waits for the rig importer) and, with a record, the
  same data sections as a species but evolutions (a form's record has none: the game reads its species').
- Adding, removing and records run `tools/paperwhite2/pokemon_form.py` on the server (`/api/pokemon-forms`, `/add`,
  `/remove`, `/record`, `/art`), which writes `res/` itself (art and follower folders, `obj_codes.txt`, other species'
  offsets): the editor refuses while those files have unsaved edits, and reads the changed files again after.

## The Trainer Editor

Every trainer (`src/modules/trainers/`, `res/trainers/data/`), filtered by name or class, with the class's sprite. The
trainer's settings (name, class, battle style, money, reward, healing, items, AI flags) are the schema's fields; the
party is cards: species with its icon, level, form, difficulty, ability and gender slots, and, as the whole party has
them or not, held items and its own moves (else the moves of their levels). Each of the trainer's lines is edited with
its talk window preview. Save (Ctrl+S) checks each file with the build's validator.

## C-Gear Pictures

The pictures shown over the C-Gear's rings, which its help button cycles in the page's order, after none
(`res/paperwhite2/cgear_pictures/`: an indexed PNG for each and `pictures.json` for the order). Import a PNG of
256 by 192, transparent where the C-Gear should show through, or a `.cgb` skin file: the build's own tool
(`tools/paperwhite2/cgear_pictures.py`) converts it, keeping 15 colors and 255 distinct tiles (a tile and its flips
count once), so a busy PNG can lose detail, and the saved PNG is what the game shows. An existing name replaces its
picture. The arrows reorder, and Remove deletes the picture.

## Join Avenue

The avenue's people (`src/modules/joinavenue/`, `res/field/join_avenue/09_people.json`): the owners, who arrive one a
day and alone can be invited to open a shop, and the random visitors, who can only be recommended to. Each has a name
(7 characters), a gender, a look from the sprite browser, a trainer ID, and a greeting and two messages (8 characters
each); an owner also has the shop they want, by kind and variant, with its sign and the goods the variant sells at its
top level. The texts are messages of `res/text/script/global_10685.txt`: a text other people share gets a new message
of its own when it is changed. The owners arrive in the list's order: the first (but the Nursery's, which waits for rank 15) in the
tutorial, marked *tutorial*, the others one a day; ↑ Earlier and ↓ Later reorder them. Venus, the tutorial's visitor,
is listed apart. **+ Add** makes an owner with the next free ID and a shop kind no owner wants yet, and Remove owner
drops one (their texts stay in the bank). An owner's ID must be theirs alone, since the avenue knows
owners by ID; the original's visitors share some. An owner's **own lines** say what they say while waiting, when telling their dream, when invited and in their shop,
each with its talk window preview; **Use the usual line** gives a moment back to the avenue's generic line. A look
past the first 256 object codes is flagged: the avenue keeps looks in a byte. Save (Ctrl+S) writes the bank, then the table.

## The Weather Editor

Each location's weather (`src/modules/weather/`, `docs/paperwhite2/design/weather-editor.md`). The list has the zones
with a calendar (`res/field/weather_calendar/<zone>.json`), boxed together where zones share all their dates (Virbank
City and both Virbank Complex zones), then the other outdoor zones, then the indoor ones (folded; no weather). A zone
is outdoors when its zone header's area (`res/field/areas/<area>.json`) has `"exterior": true`; the others are offered
no weather, since the game would draw it inside.

- **Default weather:** the zone header's `weather` (`res/field/zones/<zone>.json`), the weather of a zone without a
  calendar, and of a calendar zone while the game's season isn't the current one.
- **Calendar:** each season as a strip of its 90–92 dates, its three months in order (spring is January, May and
  September). Choose a weather in the brush row (each with what it does in battle) and click or drag dates; Clear is
  the eraser. A painted month is written as the packer writes it (runs of a weather as `"first-last"`); an untouched
  month stays as it was. **Paint all** paints every zone that shares the dates, so they keep sharing. Under each
  season, each weather's share ("Rain 24 / 92 days (26%)").
- **Quick fill:** "N days of W" in a season puts W on exactly N dates spread evenly (the same each time, and nested: 10
  rainy dates are among the 20-day choice's), replacing what those dates had; **Make sunny** clears a season; **Copy
  every date** takes another zone's year, which puts the zone in its group.
- **Add a calendar** (sunny, or a copy of another zone's dates) and **Remove calendar** change the zone's file and
  `order.json`; the header shows the count against the table's limit, `CALENDAR_ZONE_MAX` in
  `tools/data/weather_calendar_data.py` (read when the server starts; 24, the original table, where it isn't there).
  Adding past it is refused. Special zones (the Entralink's forest, Route 7's event, Routes 14 and 15 on the birthday)
  say which rule of the game wins over their calendar.

Save (Ctrl+S) checks every calendar against the packer's rules first (days in their month, no day twice, weathers of
the enum, the table's zones and limit), then writes the files with the build's validator; a removed calendar's file
goes on Save. Ctrl+Z and Ctrl+Y undo and redo a stroke or fill (every zone it painted).

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
