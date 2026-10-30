// The Encounter Editor's inputs read from the real res/, as the server would give them, for its tests and scripts.
import { globSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DataFile, ScanMatch } from "../shared/api.ts";
import { fromFiles, SCRIPTS, SPECIES_KEYS, SWARMS, SWARM_LINES, ZONE_KEYS, type Loaded } from "../src/modules/encounters/load.ts";

const ROOT = resolve(import.meta.dirname, "../..");

function files(pattern: string, keys?: string[]): DataFile[] {
  return globSync(pattern, { cwd: ROOT }).filter((f) => !f.endsWith(".schema.json")).map((path) => {
    const data = JSON.parse(readFileSync(join(ROOT, path), "utf8"));
    return { path, data: keys && !Array.isArray(data) ? Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]])) : data };
  }).filter((f) => !Array.isArray(f.data) && "$schema" in JSON.parse(readFileSync(join(ROOT, f.path), "utf8")));
}

function scan(pattern: string, regex: RegExp): ScanMatch[] {
  return globSync(pattern, { cwd: ROOT }).flatMap((path) =>
    readFileSync(join(ROOT, path), "utf8").split("\n").map((text, i) => ({ path, line: i + 1, text })).filter((m) => regex.test(m.text)));
}

/** The constants the editor would read: here only the species' numbers, from generated/species.txt (one name a line,
 * counting up, or NAME = N to set the count). */
function speciesConstants(): Map<string, number> {
  const constants = new Map<string, number>();
  let next = 0;
  for (const line of readFileSync(join(ROOT, "generated/species.txt"), "utf8").split("\n")) {
    const m = /^(SPECIES_\w+)(?:\s*=\s*(\d+))?\s*$/.exec(line.trim());
    if (!m) continue;
    if (m[2] !== undefined) next = Number(m[2]);
    constants.set(m[1], next++);
  }
  return constants;
}

export function loadFromDisk(): Loaded {
  return fromFiles({
    tables: files("res/field/encounters/*.json"),
    zones: files("res/field/zones/*.json", ZONE_KEYS),
    species: files("res/pokemon/*/data.json", SPECIES_KEYS),
    places: files("res/town_map/*.json", ["zone", "type", "position", "hit"]),
    trades: files("res/field/trades/*.json", ["species"]),
    grottoes: files("res/field/grottoes/*.json", ["white2"]),
    scripts: scan(SCRIPTS, /PokePartyAdd|CallWildBattle|WorkSetConst/),
    swarms: scan(SWARMS, new RegExp(SWARM_LINES)),
  }, speciesConstants());
}
