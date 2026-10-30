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
  first is the **Encounter Editor** (below). The per-file editors are under **Data files**, which folds away. A page
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

The new wild encounter system's editor (`src/modules/encounters/`), built before the system itself so that everything
to be edited is settled first. **It doesn't save yet**: the new format isn't in `res/`, so it builds a draft from the
current slot tables (`res/field/encounters/`), the game's swarms and the Hidden Grottoes, and keeps edits until the
page is reloaded. Its pages:

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

## How it is built

| Folder | |
| --- | --- |
| `server/` | Node server: the index of `res/` (`project.ts`), saving, the build and git, and the build's Python for constants and validation (`python/`) |
| `shared/` | Used by both: JSON read and written without loss (`json.ts`), the schemas' validator (`schema.ts`), the API (`api.ts`) |
| `src/` | The page (React): the frame in `App.tsx` and `shell/`, open files in `documents.ts` |
| `src/modules/` | Editor modules, one folder each, found by themselves |
| `tests/` | `npm test`: every data file round-trips byte for byte, the editor's validator agrees with the build's, and the Encounter Editor's import and pages work on the real `res/` |

### Adding a module

A module is a folder in `src/modules/` with a `module.tsx` whose default export is an `EditorModule`
(`src/modules/types.ts`). Nothing else needs changing.

- A **data view** opens files of the kinds of data it handles: `handles(type)` scores each kind, and the highest
  score wins. The generic form answers 1 for everything, so it is always there as the fallback and the Form view.
- A **tool** has a page in the sidebar, for work spanning many files. `requires` lists the schemas it needs; it hides
  itself while one is missing.

Modules change data only through the props they are given (`edit`, `replace`); saving, undo, validation and changes
on disk are the shell's. Build them around the schemas, so the editor and the build agree about every format.
