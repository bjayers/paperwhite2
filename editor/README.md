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
