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
  first are the **Encounter Editor**, **Graphics & Palettes**, the **Follower Editor**, the **Text Editor**, the **Script Editor**, the **Pokémon Editor**, the **Move Editor**, the **Ability Editor**, the **Rig Editor**, the **Trainer Editor** and the **Weather Editor** (below). The per-file editors are under **Data files**, which folds away. A page
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
  its animation profile, art offset, side gap and walking gaps (a walking sprite a row names is drawn too).
  `#tool/followers?species=SPECIES_X` opens on a species, `&form=N` with that form's first row open (the Pokémon
  Editor's Follower cards link there). Then its own dialogue
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
  and a clear "It can't evolve" where none is for it, which Eviolite follows too; Wonder Trade: in the random pool or
  not, `excluded_forms`; **Remove form** for the hack's last form), its Pokédex entry, its Battle sprite (below), its
  Art (whether its battle sprite is a copy of its species' or its own; the icon and the 96x96 stills imported as PNGs,
  checked and previewed, the icon's palette bank picked from its colours) and, with a record, the same data sections
  as a species but evolutions (a form's record has none: the game reads its species').
- **Battle sprite** (`BattleSpriteArt.tsx`, on every species' page and every form with art of its own;
  docs/paperwhite2/design/battle-sprites.md section 14): the sprite as the battle draws it, its "stay" animation played
  from the sheets on its rig, front and back, female, normal or shiny. **Edit rig…** opens the Rig Editor on it (below).
  **Export art (.zip)** gives the sheets, stills,
  palettes, a shiny-coloured copy of each picture, a guide per sheet (each piece's rectangle numbered, with the parts it
  belongs to) and a README of the rules, and also the party/box icon (`icon.png` as it is, a 2x preview and
  `icon_palette.pal`, its bank of the shared icon palettes) and the follower's walking sprite sheets
  (`follower/<code>.png` and `.pal`, each sheet its follower rows show, with a 3x preview; export only, as there is no
  checked import for overworld sprites). **Import art…** takes any of them back (PNGs, .pal files or the zip; the icon
  checked as the form icon import checks it, an original Pokémon's in the bank the game gives it): the
  errors, warnings (pixels outside the pieces, colours changed in one palette only) and the files it changes, and a
  preview of the new art animated on the rig, normal and shiny, with the stills, the sheets (changed pixels outside the
  pieces in red) and the palettes; **Apply** writes the res/ files. **Make stills from the sheets** draws the 96x96
  stills from the first frame. Each side's rig is
  `front_rig.json` / `back_rig.json` beside its sheet (battle-sprites.md section 17), which the build turns into the
  game's five files; it also shows under Data files as "A battle sprite's rig" (1,506 files, the
  compact JSON layout, written back byte for byte).
  `tools/paperwhite2/battle_sprite.py` (`export`, `check`, `import`) does the work, through `GET /api/battle-sprite/export`
  and `POST /api/battle-sprite/check` (with `write` to import); it writes res/ itself, so the card refuses while the
  group's files have unsaved edits.
- **Follower** card (`FollowerSprites.tsx`, on every species' page and every form's; inside an added species' Follower
  card): the follower rows of that species or form (normal, female, shiny, female shiny, each a field actor in
  `res/field/actors/followers/`), the walking sprite each shows (its `"sprite"`, an `OBJ_CODE_POKEMON_` walking sprite
  or a follower's own sheet) drawn facing down, left and right with its frame count, a picker of every such sheet
  (picking one also sets the row's animation profile to the sheet's: 8 frames asymmetric, 6 mirrored), and **Open in
  the Follower Editor** on that form's rows (`#tool/followers?species=…&form=N`). A row with a sheet of its own shows
  it, without a picker. The rows save with the page's Save.
- **Don't mirror (asymmetric)** under a species' or form's title: the personal data's `asymmetric` flag
  (`PERSONAL_NO_FLIP`), which keeps the Pokédex's pages and list, the trade and the musical from flipping the sprite.
  On a form with a record it is the record's; a form without one shows its species' ("· Pichu's"), and changing it
  gives the form a record first (`/api/pokemon-forms/record`, a copy of the species' data, after a confirm that says
  so and lists the files), then sets and saves the flag.
- Adding, removing and records run `tools/paperwhite2/pokemon_form.py` on the server (`/api/pokemon-forms`, `/add`,
  `/remove`, `/record`, `/art`), which writes `res/` itself (art and follower folders, `obj_codes.txt`, other species'
  offsets): the editor refuses while those files have unsaved edits, and reads the changed files again after.

New species (`AddedSpecies.tsx`, docs/paperwhite2/design/new-species.md sections 4 and 16):
- The list shows the species Paper White 2 added after Genesect in the National Pokédex's order (by display number,
  then those without one, then those out of the Pokédex), tagged "added", and "hidden" when retired; their number
  column is the display number, "???" or "—". The filter takes "added".
- **+ Add Pokémon** on the list's header opens a dialog: the name (up to 10 characters, starting with a letter; its
  constant and folder follow), the template ("Copy of": any species, or Blank, a "?" sprite with plain stats and
  Bulbasaur's cry), "In the Pokédex" (off: `"pokedex": false`, the roguelike's creatures), the display number (blank
  "???"; 999, a number in use or an original's refused), "In the Wonder Trade" (on by default) and "Follower: a copy
  of X's" (on by default: the template's followers copied with their codes; off for Blank, and the dry run says when
  the template has none). Its dry run says what it will write before Add.
- An added species' page has an **Added species** card (its ID and constant, its status, the display number with Set,
  the art formats' species; **Retire** hides it from the Pokédex, the Wonder Trade and the encounter pickers, keeping
  its ID so saved Pokémon stay valid, and **Bring back** undoes it; a retired one's **Reuse ID…** opens the dialog
  to make that ID a new species, warning that saved Pokémon of it become the new one; **Remove** only for the last
  added species, undoing everything Add did, its followers included), **Icon and stills** (PNG imports, as a
  form's), a **Follower** card (its followers; **Copy from** another species' with **Copy**, **Remove**, **Open in
  the Follower Editor** on its page, and each row's walking sprite with its picker, as above), and its Wonder Trade row says "Never" when it is retired or out of the Pokédex.
  Without a follower, the next party member follows while it leads.
- Every species' page has a **Cry** card: the cry played in the page, "Cry: a copy of X's" while an added species'
  cry.wav is its template's, a WAV import (mono or stereo, 8 to 32 bits; mixed down and resampled to 13,379 Hz where
  needed, refused past the game's 0x5c30-byte buffer, about 1.76 s) played as the game will play it before Apply,
  and the volume (`cry_volume`).
- These run `tools/paperwhite2/pokemon_species.py` on the server (`GET /api/pokemon-species`, `POST
  /api/pokemon-species/add`, `/reuse`, `/remove`, `/retire`, `/follower`, `/number`, `/cry`), which writes `res/` and
  `generated/species.txt` itself; after a change of the species list the server rereads the constants at once.
  `/api/asset` also serves `.wav` for the cry player.

## The Rig Editor

**The new editor (2026-11-14, docs/paperwhite2/design/rig-editor-v2.md, "Built: step 2")** is what **Edit rig…** and the
sidebar open (`src/modules/rig/SetupEditor.tsx`, its edits in `setup.ts`). It edits a side's source,
`<side>_rig_v2.json` (`v2.ts`), and bakes it on every change into `<side>_rig.json`, the build's input. A side without a
source opens as its flat rig converted (`convertToV2`, byte for byte), in memory: the first edit makes the file, so an
untouched side writes nothing; Undo of that edit takes the file away again. Save runs the rig-check route on the bake
and writes both files; Ctrl+Z and Ctrl+Y are one history over both (`history.ts`). A side with a first-editor armature
(`_rig_source.json`) shows a notice: open it in the Advanced editor, or **Start fresh…** (which deletes the armature
through the server). For now the editor's mode is **Rig setup** (sequences come next):

- **Pieces** (the sheet card): drag on the sheet to cut a piece (Shift: the chosen piece's second rectangle); drag a
  rectangle to move it, its edges or corners to resize it, snapped to tiles (Alt: pixels) and to sizes the DS's OBJs can
  be cut into. The pieces' list: thumbnail, name, sizes, the bones that show it, **+ Bone** (a bone showing it, the
  picture standing on the feet) and delete.
- **The preview** draws the default pose as MCSS does, with the bones from head (round end) to tail (small end),
  Blender's octahedral shape, an offset child's dashed link to its parent. Tools: **Bones** (B: drag a head to move the
  pivot with the pictures staying, a tail to point the bone with the connected children's heads following, a bone's
  body to move it with its pictures, a picture to place it on its bone; drag on empty space to draw a new bone, Ctrl a
  child of the chosen one), **Move** (G), **Rotate** (R), **Scale** (S, with X and Y handles and a ring) on the chosen
  bones' default pose. Click chooses, Shift or Ctrl adds; Delete deletes the chosen bones.
- **The side panel** (as the Ambients panel): **Bones**, the tree (drag a bone onto another to parent it keeping its
  place, onto Root to free it; a chip toggles connected and offset); **Bone** (name, the piece it shows, parent, link,
  head and tail); **Default pose** (move, turn, scale, Reset pose; the setup is the default pose, with no separate
  step); **Layers** front to back (drag to reorder; Hide and Draw); **Piece** (name, rectangles, its place on its bone);
  **Sequences** (read only); **Checks**.
- The header: **Rig setup** (and Sequences, coming), **Front** and **Back**, the size against ~40 KB, Revert, Save;
  **Copy front to back…** (on the back), **Start fresh…** (one piece round the sheet's first art and one bone), **Advanced
  (old editor)** (the first editor, `&editor=old`, which warns on a side that has a source), **? How rigs work**.

**The first editor, now the Advanced view.** One side of a battle sprite's rig (`src/modules/rig/`, `res/pokemon/<folder>/<side>_rig.json`; the design is
docs/paperwhite2/design/battle-sprites.md sections 15 to 18), opened from a Battle sprite card's **Edit rig…** or the
sidebar (`#tool/rig?folder=pichu/form_1&side=front`). The art stays a full 256×128 sheet drawn in Aseprite and brought
in with the card's Import art; here the pictures are cut from it and moved. The header switches **Front** and
**Back** (separate rigs; a • marks unsaved changes), the **Male** and **Female** sheet where there is one, and has
**Copy front to back** (or back to front, with a confirm: the whole rig, as a starting point), **Start fresh…** (a minimal rig in place of this side's: one picture round the sheet's first piece of art, one part, the stay loop; with a confirm, undoable until saved; it deletes the side's armature, if any), the size of the five
files the build will write against the ~40 KB guidance (section 15.6) with the stay loop's length, **Revert** and
**Save** (Ctrl+S). Save runs the build's checks first (`POST /api/battle-sprite/rig-check`, `server/python/rig_check.py`:
`mcss_rig.check`, refusing errors) and then the validator; Ctrl+Z and Ctrl+Y undo and redo.

- **Edit mode and Pose mode (2026-11-13; Tab switches, the header's Edit | Pose, remembered per viewer):** the editor works as
  Blender does. **Edit mode** is the rest setup, with no time (the preview draws each part as its track begins and the
  dock is gone): the **Sheet** and the pictures, the **layers**, each part's **Pivot**, and **parenting**. Its one tool is
  **Pivot** (P): dragging it (or typing the Part panel's Pivot) moves the pivot and the part's picture **stays where it is
  on screen**: the pivot is where the game places a part and turns it about, so the rectangles' `at` (and, for a key that turns
  or scales, that key's move) move back by the same, in every key of every action (`armature.ts`, `movePivot`; a picture another
  track shows is copied for this one; every part that plays the track moves with it). Parenting: drag a part onto another in
  **Parenting** (the outliner; onto Root to unparent), pick the parent under **Bone**, or **Pick parent on the preview**; the part
  stays where it is. Nothing is keyed in Edit mode, and K, G, R and S say so. **Pose mode** animates: the Move, Rotate and Scale
  gizmos (G, R, S) key the chosen part (or the Root) at the playhead, with the timeline, **Auto-key**, the Graph Editor and the bake.
  Pose mode's dock leads with a legend: **Key poses (yours)** (the diamonds) above **Baked keys (what the game plays, every 6
  frames)** (the blocks, read only). **New key poses** (ease in and out by default, or linear, ease in, ease out, held) is the curve
  a key pose made in Pose mode goes to the next by, so a start and an end key pose fill in the in-betweens.
- **No Convert button:** the first time you parent a part, or key one in Pose mode (a gizmo drag that changes something, K, or choosing
  the Root), a side with no armature gets one (`convertToArmature`: it bakes back to the file byte for byte, so it plays exactly as
  before until something changes), with a line saying so. It is part of the step that made it: Ctrl+Z takes the armature away again
  (`history.ts`), Ctrl+Y brings it back. **Remove armature** (Parenting panel) goes back to flat keys. **Game keys** (under the preview,
  Pose mode, a side with no armature) is the advanced view: the game's own held keys edited as stored, with the Key, Layers and
  sequence-key panels of the flat editor (the Pivot and parenting are Edit mode's in both).
- **Actions and the sequence:** in the panels and hints a pose is an **Action** (the file keeps "pose"): a set of parts with pivots and
  layers, each playing its own track. The **Stay / Stop** row is like Blender's NLA strip: each block plays one action for N frames;
  drag a block's right edge (Shift: steps of 6) to change how long that action plays (with an armature the blocks after it move along and the
  loop grows, `resizeBlock`; a run of pieces showing one action is one block), and each part's track keeps looping inside it at its own
  length (Bone, Loop). Choosing a block chooses its action. The Sequence panel has the sequence's loop length.
- **? How rigs work:** a collapsible guide in the header (the two modes, key poses and baked keys, actions, and the eyes-and-tilt example
  worked through).
- **Undo:** one history for the page across the flat rig and the armature (`history.ts`): a drag, an auto-key split, a pivot (both files),
  a parenting or an automatic conversion is one step; a step with nothing left to undo is skipped, not a dead key press; a checkbox, a
  slider or a list with the focus doesn't stop Ctrl+Z (only a text box does), and a press on the preview lets go of a focused field.
- **Layout:** the side panel runs the page's full height at the right with its own scroll; the docked timeline and graph
  sit under the preview and sheet, to its left (drag the dock's top edge to resize it). Dragging on the timeline never
  selects text; the ruler and empty lane space scrub the playhead while held.
- **Keys at the playhead:** **Key at playhead** (button, or **K**) puts a key beginning at the playhead on the chosen
  part(s)' tracks: the key the playhead is in is split in two there (the same on both sides), a key already beginning
  there is just chosen, an empty track gets one, and a track that plays once is held up to the time. **Key all parts**
  (**Shift+K**) does it for every part of the shown pose: the pose workflow (position the parts, key; move the
  playhead, move the parts, key). The last key of a track can't be deleted (the game plays a key per track): the button
  reads **Reset** and puts it back to resting. **Auto-key** (on by default, remembered): a Move, Rotate or Scale drag at
  a frame where no key begins first splits the key there, as Blender's auto-key makes a keyframe; off, the drag changes
  the whole held key. A line under the preview says which key a drag edits.
- **Pictures:** each key holds a picture. The Key panel's **Picture** picker shows every picture as a thumbnail; picking
  one makes the part show it from the playhead on (splitting the key if the playhead is inside it, so a swap is one
  click at a frame). Timeline key blocks show the picture's number and thumbnail. **Hidden** (first in the picker) is the
  way to turn a part off for a while and another on, as Game Freak's sprites do: a key showing a blank picture (one
  empty rectangle, `size [0, 0]`, which MCSS draws as nothing and `mcss_rig.check` allows; 106 original sides use it);
  the editor adds the blank picture on first use. Armature key poses have the same picker.
- **Several parts:** Shift-click (a range) or Ctrl-click (one more) in the layer list, the timeline's names or the
  preview chooses several parts (dashed outlines; a pink cross is the group's centre). The Move gizmo moves all their
  keys at the playhead, Rotate turns them about the group's centre, Scale scales each about its own pivot, Key at
  playhead keys them together; plain tracks (picture-only keys) are left, and the message says so (Game keys view). An armature
  (made by the first parenting or key pose) gives a Root that moves the whole sprite, and parents.
- **Poses:** the **Poses** section copies a pose's parts, pivots, layer order and tracks to another pose, or makes a
  new pose from it. **Duplicate the tracks** gives the copy tracks of its own (named by pose letter), so its animation
  can differ; **Share the tracks** plays the same ones (an edit shows in both; the only choice with an armature). One
  undo step; copying over an existing pose asks first.
- **Preview:** the sprite as MCSS draws it (`mcss.ts`, a port of `mcss.render` that `tests/rig-render.test.ts` proves
  pixel for pixel), live as the rig is edited, at 60 frames a second: play and pause (Space), a frame back and on
  (← →, Shift for 6), Home, a scrub bar; 2–6×; shiny; onion skin (6 frames before and after); **Battle pauses** (at
  each end of the stay loop the battle's roll, 1 in 3, 2, then 1: sequence 1, only the idle parts moving, 48, 56 or
  64 frames) and **Slowed** (a status's third speed); the feet's lines. Click a part to choose it: its rectangles are
  outlined and its pivot marked, and the tool's gizmo moves it: **Pivot** (P, the pose's pivot), **Move** (G),
  **Rotate** (R, Shift for 5° steps) and **Scale** (S, Shift across only, Ctrl up and down only), the last three
  writing the key the part shows at the playhead (each drag one undo step).
- **Sheet:** every picture's rectangles over the sheet, numbered (a second rectangle dashed, `N+`), the chosen
  picture's yellow with handles and the chosen part's other pictures in its colour. Click to choose, drag to move,
  drag an edge or corner to resize (snapped to 8 pixels, Alt for 1; a moved west or north edge keeps the picture in
  place on the part). The OBJs are made again from the rectangles (`generate_objs`). Art outside every rectangle is
  red, and listed under Checks, with sizes that can't be cut into OBJs and rectangles past the sheet.
- **Timeline:** the sequence (**Stay**, **Stop**) with its keys (the pose each shows, for how long), then the parts of
  the pose shown (following the playhead, or chosen) front to back: drag a name to reorder the layers (the idle parts
  follow), **idle** toggles. Each part's keys are blocks as wide as their frames, where the game plays them (from the
  pose's start for a part that restarts, on the sequence's time for one that continues); a looping track's later
  passes are faded, keys a pose never reaches hatched. Click a key to choose it, drag its right edge to change its
  frames (Shift: steps of 6, Game Freak's rhythm).
- **The side panel** (laid out as the Ambients panel): in a flat rig the **Layers** list first (the shown pose's parts front to
  back, as the outliner lists bones: drag to reorder, an eye that hides a part in the preview only and isn't saved, a
  thumbnail, click to choose); the **Part** (its track and name, pivot, whether its track
  restarts or continues, idle, layer forward and back, add and remove), its **Key** (picture, frames, turn in degrees,
  scale, move; Duplicate, Split at playhead, + Key after, Delete; the track's key type: picture only, move, or turn,
  scale and move, and loop or once), the **Picture** (each rectangle's place on the sheet, size and place from the
  pivot; a second rectangle; new, and remove when no key shows it, the later pictures renumbered) and the **Sequence
  key** (pose, frames). Under the sheet, the **Sprite** (whether the battle's idle pause stops it, the airborne flag,
  the box) and the **Checks**.
- **The docked panel:** the timeline sits at the page's bottom, with the **Graph Editor** (Timeline, Graph Editor or
  Both); drag its top edge to make it taller or shorter. The height and the choice are remembered per viewer
  (`localStorage`, read and written in try/catch).

### The armature (Blender-like bones and curves)

A side can have an armature, `<side>_rig_source.json` beside its rig (`src/modules/rig/armature.ts`,
`res/pokemon/battle_sprite_rig_source.schema.json`; docs/paperwhite2/design/battle-sprites.md section 19). The editor
bakes it into the flat rig on every change, and the preview, the timeline's blocks, the checks and the size meter all
show the bake, as the game will play it; Save writes the baked `<side>_rig.json` (checked first) and then the
armature. The build reads only the flat rig, and `tests/armature.test.ts` fails if a flat rig in res/ isn't what its
armature bakes.

- **The armature is made for you** (see Edit and Pose mode above; there is no Convert button): each part a bone of the root's, at its
  pivot, its keys held key poses; it bakes back to the rig byte for byte (all 1,506 sides). **Remove armature** deletes the file
  (the rig keeps what it baked).
- **Outliner** (Parenting in Edit mode, Parts in Pose mode): the Root (the whole sprite: the sequence's move, turn and scale about the feet, and
  the pose each key shows) and the shown action's bones as a tree. In Edit mode drag a bone onto another to parent it, onto Root to unparent it; or
  choose its parent under **Bone**, or **Pick parent on the preview**. Parenting keeps the part where it is (Blender's
  Keep Transform): its key poses are written again relative to the parent, so only the parent's keys from then on
  move it. A child follows its parent's turn, scale and move; rotation and even scale bake exactly, and a parent's
  uneven scale over a turned child (a shear the game can't draw) is warned of under Checks.
- **Posing:** with a bone (or the Root) chosen, the Move, Rotate and Scale gizmos key it at the playhead (auto-key:
  the key pose there, or a new one with the curves' values there), in its parent's frame. **Key pose** in the side
  panel: frame, picture (the root: pose), move, turn (degrees, not wrapped), scale, and the **curve** to the next key
  pose (Constant, Linear, Ease in, Ease out, Ease in and out, Bézier); + Key at playhead, Delete, Go to. **Bone**:
  parent, loop length, its own bake step, the key type it bakes to.
- **Timeline:** key poses are diamonds (coloured by curve) above the keys they bake to; drag a diamond in time (Shift:
  steps of 6), click to choose it. The baked blocks are read only. **Bake every** in the panel's header sets the shown
  sequence's step (6 frames, Game Freak's rhythm, by default; finer steps show on the size meter).
- **Graph Editor:** the chosen bone's or root's channels (move x and y, turn, scale x and y) as curves over its own
  time, each in its own range (Normalize) or one; the held values the bake writes dashed under them. Click a key to
  choose it and its channel, drag it in time and value (Shift: one direction), drag a Bézier key's handles (the other
  follows; Alt breaks them), set the chosen channel's curve (or every channel's) from the menu; a click elsewhere moves
  the playhead.
- **Preview:** the bones, from each joint toward its picture, with dashed links to the parent (or to the root's ring
  at the feet); the Bones toggle hides them. Ctrl+Z and Ctrl+Y undo across both files in one history.

## The Move Editor and the Ability Editor

Every move (`src/modules/moves/`, `res/moves/<move>/data.json`) and every ability (`src/modules/abilities/`,
`res/abilities/<ability>.json`), the original game's and those Paper White 2 adds after Fusion Bolt and Teravolt
(docs/paperwhite2/design/moves-and-abilities.md), tagged "added" (and "hidden" when retired, "C" when the hack's battle
code has rules of its own for it). The list filters by name, number, type (moves) and "Added"; `#tool/moves?move=MOVE_X`
and `#tool/abilities?ability=ABILITY_X` open on one. Save (Ctrl+S) checks each file with the build's validator.

- **A move's page**, in headed sections: **Basics** (type, category, power, accuracy, PP, priority, target, each with
  what it means); **Effect** (the quality, with its comment from `include/constants/battle.h`, and the fields it reads:
  stat changes and the condition, those it doesn't read folded away; hits, critical hits, flinch, drain, heal; the
  flags as checkboxes with their comments, Ballistic among them); **Battle** (where its rules beyond the data are: "This
  one has battle code in src/paperwhite2/ov167/paperwhite2_battle.c" for Grav Apple, an original move's EventAdd
  function, or "no handlers"; an added move's **Animation**, the original move whose animation and sounds it plays,
  and **Works like**, the original move whose handlers it takes; the **AI effect**); **Text** (the name against its 12
  characters, the description with its line breaks); **Who learns it**, read only: the species and forms by level,
  TM or HM (from `TM_MOVE_LIST`), tutor and egg, or evolving by it, each a link to the Pokémon Editor, the trainers
  (links to the Trainer Editor), the facility sets, other files and the code that name it.
- **An ability's page:** **Battle** ("handlers: C" with the same note for Bulletproof, an original ability's EventAdd
  function, or a warning that an added ability without handlers does nothing in battle yet; an added ability's
  **Works like** and its **Mold Breaker** checkbox, `"mold_breaker_ignores"`, which generates the list
  `src/ov169/btl_tables.c` checks; an original ability's place in `sMoldBreakerIgnoredAbilities`, read only);
  **Text**; **Who has it**: the species and forms by slot (first, second, hidden), with links.
- **+ Add move** / **+ Add ability** on the list's header: a name (12 characters, starting with a letter; the constant
  and file follow from it), a template (any move or ability, or Blank) and, for a move, its animation, "works like"
  and AI effect, each "As the template" unless chosen; for an ability, "works like" and Mold Breaker. A dry run says
  what it will write and warns of what a copy doesn't get: rules the battle code checks by the template's ID (Levitate's
  in `btl_client.c`), an added template's own C, handlers that tell their moves apart by ID (the pledges, refused).
- An added one's **Added move** / **Added ability** card: its ID and constant, **Retire** / **Bring back** (`"retired":
  true`: it keeps its ID and data for saved Pokémon, but every picker of the editor, the learnsets', trainers' and
  species' abilities, leaves it out) and **Remove**, for the last added only and refused while anything in `res/` or
  the code names it.
- Adding, removing and retiring are `tools/paperwhite2/moves.py` and `abilities.py` (`json`, `uses`, `add`, `remove`,
  `retire`, `unretire`) through `/api/moves` and `/api/abilities` (`/uses`, `/add`, `/remove`, `/retire`); they write
  `res/` and `generated/` themselves, so the editor refuses while those files have unsaved edits. After a change of a
  list the server rereads the constants and runs the build command's configure step again (build.ninja names each
  move's folder). `/api/constant-notes?prefix=` gives a prefix's comments from `include/constants/`.

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
