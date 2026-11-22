// The Entree page's difficulty tiers (run.json's tiers): the defaults for a file without them, a tier written back in
// the schema's keys and order, and the run.json schema's own modifiers list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileText, fromPlain, type JsonValue } from "../shared/json.ts";
import { DEFAULT_TIERS, TIER_COUNT, readRun, readTiers, tierJson } from "../src/modules/entree/model.ts";

const ROOT = resolve(import.meta.dirname, "../..");

test("a run.json without tiers takes the four defaults, and one with too few does too", () => {
  assert.deepEqual(readRun(fromPlain({ rounds: [] }) as JsonValue).tiers, DEFAULT_TIERS);
  assert.deepEqual(readTiers(fromPlain([{ name: "One", level: 5 }]) as JsonValue), DEFAULT_TIERS);
  assert.equal(DEFAULT_TIERS.length, TIER_COUNT);
});

test("a tier writes back in the schema's order, its multiplier keeping its point", () => {
  const schema = JSON.parse(readFileSync(resolve(ROOT, "res/paperwhite2/entralink/run.schema.json"), "utf8"));
  const keys = Object.keys(schema.properties.tiers.items.properties);
  const json = tierJson({ name: "T", level: 80, aiFlags: ["AI_FLAG_BASIC"], shardMultiplier: 1, modifiers: ["heavy_fog"] });
  assert.deepEqual([...json.keys()], keys);
  assert.match(fileText(json), /"shard_multiplier": 1\.0/);
  for (const t of DEFAULT_TIERS) for (const m of t.modifiers) assert.ok(schema.properties.tiers.items.properties.modifiers.items.enum.includes(m), m);
});

test("a given tier reads back as written", () => {
  const given = [0, 1, 2, 3].map((i) => tierJson({ name: `T${i}`, level: 60 + i, aiFlags: [], shardMultiplier: 2.5, modifiers: [] }));
  const tiers = readTiers(given as JsonValue);
  assert.deepEqual(tiers.map((t) => [t.name, t.level, t.shardMultiplier]), [["T0", 60, 2.5], ["T1", 61, 2.5], ["T2", 62, 2.5], ["T3", 63, 2.5]]);
});
