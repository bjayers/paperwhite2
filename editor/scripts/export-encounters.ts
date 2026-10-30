// Writes the new encounter data (res/paperwhite2/encounters/, and level_scaling.json's percent and spread) from the
// original slot tables, the game's swarms and the zone headers, with the Encounter Editor's import and default
// settings: the starting point that the editor and the packer (tools/paperwhite2/encounters.py) then work from.
//
//   npx tsx scripts/export-encounters.ts [--force]
//
// It refuses to replace existing data without --force, since that loses every edit made since.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileText, parseJson } from "../shared/json.ts";
import { draftFiles, levelScalingFile, LEVEL_SCALING, ROOT as DATA, settingsPath } from "../src/modules/encounters/files.ts";
import { buildDraft } from "../src/modules/encounters/load.ts";
import { DEFAULT_SETTINGS } from "../src/modules/encounters/model.ts";
import { loadFromDisk } from "./encounter-files.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const text = (data: unknown) => fileText(parseJson(JSON.stringify(data)), 120);

if (existsSync(join(ROOT, settingsPath)) && !process.argv.includes("--force")) {
  console.error(`${settingsPath} exists: pass --force to replace the encounter data with a new import`);
  process.exit(1);
}
const loaded = loadFromDisk();
const draft = buildDraft(loaded, DEFAULT_SETTINGS);
for (const folder of ["areas", "species"]) rmSync(join(ROOT, DATA, folder), { recursive: true, force: true });
const files = draftFiles(draft, DEFAULT_SETTINGS, loaded.species);
for (const [path, data] of files) {
  mkdirSync(dirname(join(ROOT, path)), { recursive: true });
  writeFileSync(join(ROOT, path), text(data));
}
const scaling = JSON.parse(readFileSync(join(ROOT, LEVEL_SCALING), "utf8"));
writeFileSync(join(ROOT, LEVEL_SCALING), text(levelScalingFile(scaling, DEFAULT_SETTINGS)));
console.log(`${files.size} files written under ${DATA}`);
