// The Entree page's random enemy rooms (docs/paperwhite2/design/entralink-roguelike-prototype.md, "Random enemy
// rooms"): run.json's random_enemy_chance and random_rooms read with their defaults, written valid as the build checks
// them, and the run's checks counting enemy and enemy_choice doors as drawable while random rooms are on.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseJson, setIn, type JsonValue } from "../shared/json.ts";
import { validate, type Schema } from "../shared/schema.ts";
import { Python } from "../server/python.ts";
import {
  DEFAULT_RANDOM_ENEMY_CHANCE, DEFAULT_RANDOM_ROOMS, DEFAULT_TYPE_WEIGHTS, WEIGHT_ORDER, newRoomData, randomRoomsJson, readRoom, readRun, runProblems,
} from "../src/modules/entree/model.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const constants = new Map(Object.entries(new Python(ROOT).constants()));
const runSchema = JSON.parse(readFileSync(join(ROOT, "res/paperwhite2/entralink/run.schema.json"), "utf8")) as Schema;
const errors = (d: JsonValue) => validate(d, runSchema, constants).map((e) => `${e.path.join(".")}: ${e.message}`);
const minimal = parseJson(JSON.stringify({ rounds: [{ rooms: 2 }], room_maps: ["ZONE_ENTREE_FOREST"], final_map: "ZONE_ENTREE_FOREST_2" }));

test("random rooms: the defaults, and what is written reads back and validates", () => {
  const run = readRun(minimal);
  assert.equal(run.randomEnemyChance, DEFAULT_RANDOM_ENEMY_CHANCE);
  assert.deepEqual(run.randomRooms, DEFAULT_RANDOM_ROOMS);
  const changed = { ...DEFAULT_RANDOM_ROOMS, bst: [{ min: 250, max: 400 }, { min: 300, max: 500 }, { min: 400, max: 650 }], tmChance: 0 };
  const data = setIn(setIn(minimal, ["random_enemy_chance"], 100), ["random_rooms"], randomRoomsJson(changed));
  assert.deepEqual(errors(data), []);
  assert.deepEqual(readRun(data).randomRooms, changed);
  assert.equal(readRun(data).randomEnemyChance, 100);
  assert.equal(errors(setIn(data, ["random_enemy_chance"], 101)).length, 1);
  assert.equal(errors(setIn(data, ["random_rooms", "move_pool"], 3)).length, 1);
});

test("random rooms: a round of only enemy_choice doors draws while random rooms are on", () => {
  const typeWeights = Object.fromEntries(WEIGHT_ORDER.map((t) => [t, t === "enemy_choice" ? 1 : 0])) as typeof DEFAULT_TYPE_WEIGHTS;
  const rounds = [{ rooms: 2, boss: false, typeWeights }];
  const final = [{ id: "last", room: { ...readRoom(newRoomData("Last")), role: "final" as const } }];
  const fatal = (chance: number) => runProblems({ rounds, randomEnemyChance: chance }, final, new Set()).filter((p) => p.severity === "error");
  assert.deepEqual(fatal(50), []);
  assert.equal(fatal(0).length, 1);
});
