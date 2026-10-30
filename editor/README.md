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

Restart the editor after changing them.

## How it is built

| Folder | |
| --- | --- |
| `server/` | Node server: the index of `res/` (`project.ts`), saving, the build and git, and the build's Python for constants and validation (`python/`) |
| `shared/` | Used by both: JSON read and written without loss (`json.ts`), the schemas' validator (`schema.ts`), the API (`api.ts`) |
| `src/` | The page (React): the frame in `App.tsx` and `shell/`, open files in `documents.ts` |
| `src/modules/` | Editor modules, one folder each, found by themselves |
| `tests/` | `npm test`: every data file round-trips byte for byte, and the editor's validator agrees with the build's |

### Adding a module

A module is a folder in `src/modules/` with a `module.tsx` whose default export is an `EditorModule`
(`src/modules/types.ts`). Nothing else needs changing.

- A **data view** opens files of the kinds of data it handles: `handles(type)` scores each kind, and the highest
  score wins. The generic form answers 1 for everything, so it is always there as the fallback and the Form view.
- A **tool** has a page in the sidebar, for work spanning many files. `requires` lists the schemas it needs; it hides
  itself while one is missing.

Modules change data only through the props they are given (`edit`, `replace`); saving, undo, validation and changes
on disk are the shell's. Build them around the schemas, so the editor and the build agree about every format.
