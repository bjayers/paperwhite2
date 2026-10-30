// The packed encounter data agrees with the editor: for a sample of places, the odds that tools/paperwhite2/encounters.py
// computes from the packed member (as the game does, src/paperwhite2/main/paperwhite2_encounters.c) are the odds that
// the editor's preview shows for the same files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readDraft, readSettings, type EncounterFiles } from "../src/modules/encounters/files.ts";
import { readGrottoes } from "../src/modules/encounters/convert.ts";
import { placeOdds, scaledLevel } from "../src/modules/encounters/resolve.ts";
import { loadFromDisk } from "../scripts/encounter-files.ts";
import { globSync } from "node:fs";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));

test("the packed member's odds are the editor's", () => {
  const loaded = loadFromDisk();
  const files: EncounterFiles = {
    settings: read("res/paperwhite2/encounters/settings.json"),
    levelScaling: read("res/paperwhite2/level_scaling.json"),
    groups: read("res/paperwhite2/encounters/groups.json"),
    areas: globSync("res/paperwhite2/encounters/areas/*.json", { cwd: ROOT }).map((p) => ({ id: p.split("/").pop()!.replace(".json", ""), data: read(p) })),
    species: globSync("res/paperwhite2/encounters/species/*.json", { cwd: ROOT }).map((p) => ({ folder: p.split("/").pop()!.replace(".json", ""), data: read(p) })),
  };
  const settings = readSettings(files);
  const draft = readDraft(files, loaded.tables, loaded.zones, readGrottoes(loaded.grottoes));
  const numberOf = new Map<number, string>();
  for (const id of loaded.species.keys()) numberOf.set(loaded.species.get(id)!.dex, id);
  const party = 30;
  const scaled = scaledLevel(party, settings);
  const places: [string, string][] = [["route_20", "grass"], ["route_20", "rustling"], ["route_20", "dark_grass"], ["castelia_sewers", "grass"],
    ["chargestone_cave", "grass"], ["route_4", "surf"], ["route_6", "fishing"], ["giant_chasm", "rustling"], ["virbank_complex_2", "grass"]];
  for (const [area, method] of places) {
    for (const season of ["spring", "autumn"] as const) {
      const out = execFileSync("python3", ["tools/paperwhite2/encounters.py", "odds", area, method, season, "night", "WEATHER_RAIN",
        String(scaled), String(party)], { cwd: ROOT }).toString().trim();
      const packed = new Map<string, number>();
      for (const line of out ? out.split("\n") : []) {
        const [name, , form, , , share] = line.trim().split(/\s+/);
        packed.set(`${name}:${form}`, (packed.get(`${name}:${form}`) ?? 0) + parseFloat(share));
      }
      const ctx = { season, time: "night" as const, weather: "WEATHER_RAIN", partyLevel: party, outbreak: false };
      const editor = new Map<string, number>();
      for (const o of placeOdds(draft, settings, ctx, area, method as never)) {
        if (o.item) continue;
        editor.set(`${o.species}:${o.form}`, (editor.get(`${o.species}:${o.form}`) ?? 0) + o.share);
      }
      assert.deepEqual([...packed.keys()].sort(), [...editor.keys()].sort(), `${area} ${method} ${season}`);
      for (const [key, share] of packed) assert.ok(Math.abs(share - editor.get(key)!) < 0.05, `${area} ${method} ${season} ${key}: ${share} vs ${editor.get(key)}`);
    }
  }
  assert.ok(numberOf.size > 600);
});
