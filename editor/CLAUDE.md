# The editor (editor/)

Read the repository's `CLAUDE.md` first: `editor/` belongs to the cloud session, everything outside it to the ROM
session. Never change files outside `editor/`; to test saving, point the server at a scratch copy of the checkout with
`PAPERWHITE_ROOT=/path/to/copy npx tsx server/main.ts`. `README.md` describes the editor and its layout.

## Rules

- **Nothing about a particular kind of data is hard-coded.** Kinds come from the schemas the files name, fields from
  the schemas, choices from the constants (via the build's own `datajson.constants()`). A module for one kind of
  data is fine, but it reads its format from the schema where it can, and the generic form must keep working for
  everything. The user wants the editor to need as little upkeep as possible while `res/` keeps changing.
- **The build is the authority.** Saving runs the build's validator; `shared/schema.ts` mirrors it for live feedback
  and `tests/validate.test.ts` keeps them in agreement. A keyword a schema starts using must be added to both.
- **Write files exactly as the data tools do** (`shared/json.ts` mirrors `datajson.dumps`; floats keep their point;
  object keys keep their order). `tests/format.test.ts` checks every file in `res/`. A file in no known layout is
  edited as text only.
- **No fs.watch over res/**: it takes one inotify watch per file or folder. `server/project.ts` polls instead.
- Commits from the editor stay disabled (`commitEnabled`) until the user turns them on.
- Code-only UI; modules are found by `import.meta.glob`, never listed by hand.

## Checks

```sh
npm run typecheck
npm test                 # reads the real res/, writes nothing
npx vite build           # the page
```

Screenshots: run the server against a scratch copy and drive it with Playwright (preinstalled in the cloud
container: `NODE_PATH=$(npm root -g) node script.cjs`).
