// The Entree page's step 7 (docs/paperwhite2/design/entralink-roguelike-prototype.md, Step 7): the enemy_choice room
// type and its checks, the run's Dream Dust and shop settings, read with their defaults and written valid as the build
// checks them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileText, fromPlain, parseJson, setIn, type JsonValue } from "../shared/json.ts";
import { validate, type Schema } from "../shared/schema.ts";
import { Python } from "../server/python.ts";
import {
  DEFAULT_DUST, DEFAULT_RESERVE_SLOTS, DEFAULT_SHOP_ITEMS, DEFAULT_SWAP_DUST, DUST_KINDS, MAX_RESERVE_SLOTS, MAX_SWAP_DUST, MARKER_TYPES, ROOM_SCHEMA, ROOM_TYPES, WEIGHT_ORDER, checkRoom, defaultMarker, newRoomData,
  readRoom, readRun,
} from "../src/modules/entree/model.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const constants = new Map(Object.entries(new Python(ROOT).constants()));
const load = (path: string) => JSON.parse(readFileSync(join(ROOT, path), "utf8")) as Schema;
const RUN_SCHEMA = "res/paperwhite2/entralink/run.schema.json";
const roomSchema = load(ROOM_SCHEMA);
const runSchema = load(RUN_SCHEMA);
const errors = (d: JsonValue, s: Schema) => validate(d, s, constants).map((e) => `${e.path.join(".")}: ${e.message}`);
function buildCheck(data: JsonValue, schema: string): { ok: boolean; error?: string } {
  const dir = mkdtempSync(join(tmpdir(), "entree7-"));
  try {
    const file = join(dir, "data.json");
    writeFileSync(file, fileText(data));
    return JSON.parse(execFileSync("python3", ["-I", join(ROOT, "editor/server/python/validate.py")], { cwd: ROOT, input: `${file}\t${join(ROOT, schema)}\n` }).toString());
  } finally {
    rmSync(dir, { recursive: true });
  }
}
const typeWarnings = (data: JsonValue) => checkRoom(readRoom(data), constants).filter((p) => p.where.field === "type").map((p) => p.message);

test("enemy_choice: a room type with its own marker and weight; an enemy room of 2 battles and an enemy_choice room of 1 warned", () => {
  assert.ok(ROOM_TYPES.includes("enemy_choice") && MARKER_TYPES.includes("enemy_choice") && WEIGHT_ORDER.includes("enemy_choice"));
  let data = setIn(newRoomData("Choose"), ["type"], "enemy_choice");
  assert.equal(defaultMarker(readRoom(data)), "enemy_choice");
  assert.equal(errors(data, roomSchema).filter((e) => !e.endsWith("progress_id is missing")).length, 0);
  assert.equal(typeWarnings(data).length, 1);
  const second = fromPlain({ id: "second", format: "single", enemies: [{ species: "SPECIES_IVYSAUR" }] });
  data = setIn(data, ["battles", 1], second);
  data = setIn(data, ["npcs", 1], fromPlain({ type: "battle", battle: "second", x: 17, z: 14, facing: "DIR_DOWN" }));
  assert.deepEqual(typeWarnings(data), []);
  assert.equal(typeWarnings(setIn(data, ["type"], "enemy")).length, 1);
  assert.equal(errors(setIn(data, ["marker"], "enemy_choice"), roomSchema).filter((e) => !e.endsWith("progress_id is missing")).length, 0);
});

test("the run's Dream Dust and shop items: read with their defaults, written valid, out of range caught", () => {
  const real = parseJson(readFileSync(join(ROOT, "res/paperwhite2/entralink/run.json"), "utf8"));
  const run = readRun(real);
  assert.deepEqual(run.dust, DEFAULT_DUST);
  assert.deepEqual(run.dustRoundPercent, [100, 150, 200]);
  assert.equal(run.shopItems, DEFAULT_SHOP_ITEMS);
  let data = setIn(real, ["dust"], new Map<string, JsonValue>(DUST_KINDS.map((k) => [k, k === "final" ? 500 : DEFAULT_DUST[k]])));
  data = setIn(data, ["dust_round_percent"], [100, 200]);
  data = setIn(data, ["shop_items"], 8);
  assert.deepEqual(errors(data, runSchema), []);
  assert.deepEqual(buildCheck(data, RUN_SCHEMA), { ok: true });
  const back = readRun(data);
  assert.equal(back.dust.final, 500);
  // A round left out takes the last percent given
  assert.deepEqual(back.dustRoundPercent, [100, 200, 200]);
  assert.equal(errors(setIn(data, ["shop_items"], 9), runSchema).length, 1);
  assert.equal(errors(setIn(data, ["dust", "boss"], 10000), runSchema).length, 1);
});

test("the buffs' phase 7: a swap's Dust and the Reserve Box's slots, read with their defaults, written valid, out of range caught", () => {
  const real = parseJson(readFileSync(join(ROOT, "res/paperwhite2/entralink/run.json"), "utf8"));
  const base = new Map(asEntries(real).filter(([k]) => k !== "swap_dust" && k !== "reserve_slots"));
  const run = readRun(base);
  assert.equal(run.swapDust, DEFAULT_SWAP_DUST);
  assert.equal(run.reserveSlots, DEFAULT_RESERVE_SLOTS);
  const data = setIn(setIn(base, ["swap_dust"], MAX_SWAP_DUST), ["reserve_slots"], MAX_RESERVE_SLOTS);
  assert.deepEqual(errors(data, runSchema), []);
  assert.deepEqual(buildCheck(data, RUN_SCHEMA), { ok: true });
  assert.deepEqual([readRun(data).swapDust, readRun(data).reserveSlots], [MAX_SWAP_DUST, MAX_RESERVE_SLOTS]);
  assert.equal(errors(setIn(data, ["swap_dust"], MAX_SWAP_DUST + 1), runSchema).length, 1);
  assert.equal(errors(setIn(data, ["reserve_slots"], MAX_RESERVE_SLOTS + 1), runSchema).length, 1);
  assert.equal(errors(setIn(data, ["reserve_slots"], 0), runSchema).length, 1);
});

const asEntries = (v: JsonValue): [string, JsonValue][] => [...(v as Map<string, JsonValue>).entries()];
