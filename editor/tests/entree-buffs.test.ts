// The Entree page's Buffs tab (src/modules/entree/buffs.ts): the catalogue reads and writes back byte for byte, passes
// the schema in the editor's check and the build's, its effect kinds come from the schema, new, duplicated and re-tiered
// cards stay valid with stable ids, the checks agree with the packer's (tools/paperwhite2/entralink_buffs.py), and the
// balance meter gives the doc's numbers (docs/paperwhite2/design/entralink-buffs.md, section 5) and the packer's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileText, parseJson, setIn, type JsonMap, type JsonPath, type JsonValue } from "../shared/json.ts";
import { validate, type Schema } from "../shared/schema.ts";
import { Python } from "../server/python.ts";
import {
  BUFFS, BUFFS_SCHEMA, ceilingHit, changeTier, checkBuffs, duplicateBuff, effectKinds, exampleHit, fieldOrder, filterBuffs, newBuff,
  categoryIconPath, pickedValue, readBuff, readCatalogue, tierPalettePath, tintIcon, uniqueId,
} from "../src/modules/entree/buffs.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const constants = new Map(Object.entries(new Python(ROOT).constants()));
const schema = JSON.parse(readFileSync(join(ROOT, BUFFS_SCHEMA), "utf8")) as Schema;
const text = readFileSync(join(ROOT, BUFFS), "utf8");
const data = () => parseJson(text) as JsonMap;
const errors = (d: JsonValue) => validate(d, schema, constants).map((e) => `${e.path.join(".")}: ${e.message}`);
const list = (d: JsonMap) => d.get("buffs") as JsonValue[];
const at = (d: JsonValue, path: JsonPath, value: JsonValue) => setIn(d, path, value) as JsonMap;
/** The build's own check of data written as the editor writes it. */
function buildCheck(d: JsonValue): { ok: boolean; error?: string } {
  const dir = mkdtempSync(join(tmpdir(), "entree-buffs-"));
  try {
    const file = join(dir, "buffs.json");
    writeFileSync(file, fileText(d));
    return JSON.parse(execFileSync("python3", ["-I", join(ROOT, "editor/server/python/validate.py")], { cwd: ROOT, input: `${file}\t${join(ROOT, BUFFS_SCHEMA)}\n` }).toString());
  } finally {
    rmSync(dir, { recursive: true });
  }
}
/** The packer's balance meter and checks on data written as the editor writes it. */
function packerCheck(d: JsonValue): { ok: boolean; output: string } {
  const dir = mkdtempSync(join(tmpdir(), "entree-buffs-pack-"));
  try {
    writeFileSync(join(dir, "buffs.json"), fileText(d));
    writeFileSync(join(dir, "buffs.schema.json"), readFileSync(join(ROOT, BUFFS_SCHEMA)));
    cpSync(join(ROOT, "res/paperwhite2/entralink/buff_icons"), join(dir, "buff_icons"), { recursive: true });
    const run = spawnSync("python3", ["-I", join(ROOT, "tools/paperwhite2/entralink_buffs.py"), "--check", "--source", dir], { cwd: ROOT, encoding: "utf8" });
    return { ok: run.status === 0, output: `${run.stdout}${run.stderr}` };
  } finally {
    rmSync(dir, { recursive: true });
  }
}

test("the catalogue reads, writes back byte for byte and is valid in both checks", () => {
  assert.equal(fileText(data()), text);
  assert.deepEqual(errors(data()), []);
  assert.deepEqual(buildCheck(data()), { ok: true });
  const cat = readCatalogue(data());
  assert.deepEqual(checkBuffs(cat).filter((p) => p.severity === "error"), []);
  assert.ok(cat.buffs.every((b) => ["blue", "purple", "gold"].includes(b.tier)));
});

test("the effect kinds come from the schema, and every card's kind is one of them", () => {
  const kinds = effectKinds(schema);
  assert.ok(kinds.length >= 25);
  assert.equal(kinds[0].kind, "damage_ratio");
  assert.equal(kinds[kinds.length - 1].kind, "custom");
  const ratio = kinds.find((k) => k.kind === "damage_ratio")!;
  assert.ok(ratio.params.includes("condition") && ratio.unit.startsWith("percent"));
  assert.deepEqual(kinds.find((k) => k.kind === "status_roll")!.required, ["roll"]);
  const names = new Set(kinds.map((k) => k.kind));
  for (const b of readCatalogue(data()).buffs) assert.ok(names.has(b.kind), b.id);
});

/** A fixture catalogue of the real one's shape (rebalance 2: no facts about the user's own cards): three attack cards
 * of known values, the buckets' caps fixed, and an example build. */
function fixture(): JsonMap {
  let d = data();
  const pick = (id: string) => list(d).find((r) => readBuff(r).id === id) as JsonMap;
  const card = (record: JsonMap, changes: Record<string, JsonValue>) => {
    let r = record;
    for (const [k, v] of Object.entries(changes)) r = setIn(r, [k], v) as JsonMap;
    return r;
  };
  const attack = card(pick("attack"), { step: 10, soft_limit: 6, cap: 80, bucket: "atk", effect: parseJson('{"kind": "stat_ratio", "stat": "attack"}') });
  const affinity = card(pick("type_affinity"), { step: 15, cap: 60, bucket: "pow", effect: parseJson('{"kind": "damage_ratio", "condition": {"card_type": true}}') });
  const galvanic = card(pick("galvanic"), { ranks: parseJson("[60, 80, 100]"), bucket: "cond", effect: parseJson('{"kind": "damage_ratio", "condition": {"defender_status": ["paralysis"]}}') });
  d = at(d, ["buffs"], [attack, affinity, galvanic]);
  const caps: Record<string, number> = { atk: 100, pow: 100, stab: 75, match: 40, cond: 125, crit: 50, final: 25, def: 100, guard: 50 };
  (d.get("buckets") as JsonValue[]).forEach((b, i) => { d = at(d, ["buckets", i, "cap"], caps[(b as JsonMap).get("id") as string]); });
  d = at(d, ["balance"], parseJson('{"reference_hit": 600, "example": [{"buff": "attack", "count": 3}, {"buff": "galvanic", "count": 2}], "typical_factor": [1, 50]}'));
  return d;
}

test("the meter multiplies the buckets held to their caps, as the packer does", () => {
  const d = fixture();
  const cat = readCatalogue(d);
  const top = ceilingHit(cat, 600);
  // ATK 1.8 x POW 1.6 x COND 2.0 = 5.76; a critical hit x2 (no CRIT entry)
  assert.equal(Math.round(top.factor * 1000) / 1000, 5.76);
  assert.equal(Math.round(top.criticalFactor * 100) / 100, 11.52);
  assert.equal(Math.round(top.hit), 3456);
  assert.equal(Math.round(ceilingHit(cat, 800).criticalHit), 9216);
  // ATK 1.3 x COND 1.8
  const typical = exampleHit(cat, cat.example, 600);
  assert.equal(Math.round(typical.factor * 100) / 100, 2.34);
  assert.equal(Math.round(typical.hit), 1404);
  const packed = packerCheck(d);
  assert.ok(packed.ok, packed.output);
  assert.match(packed.output, /critical x11\.52 = 6,912/);
  assert.match(packed.output, /example build: x2\.34 = 1,404/);
  // A blue's picks halve past the soft limit; the cap holds
  assert.equal(pickedValue(10, 6, 80, 7), 65);
  assert.equal(pickedValue(10, 6, 80, 30), 80);
  assert.equal(pickedValue(-1, undefined, -2, 3), -2);
});

test("a typical build past the clamp or outside its band warns in the editor and the packer alike; an extreme one doesn't", () => {
  const big = at(at(fixture(), ["balance", "reference_hit"], 9999), ["settings", "damage_cap"], 20000);
  const warns = (d: JsonMap, text: string) => checkBuffs(readCatalogue(d)).some((p) => p.severity === "warning" && p.message.includes(text));
  assert.ok(warns(big, "passes the damage cap"));
  assert.match(packerCheck(big).output, /passes the damage cap/);
  // No example: the strongest hit past the clamp alone is an extreme build's, fine
  const extreme = at(big, ["balance", "example"], []);
  assert.ok(!warns(extreme, "damage cap"));
  assert.doesNotMatch(packerCheck(extreme).output, /damage cap \(/);
  const band = at(fixture(), ["balance", "typical_factor"], parseJson("[10, 20]"));
  assert.ok(warns(band, "outside the typical band"));
  assert.match(packerCheck(band).output, /outside the typical band x10-20/);
});

test("new, duplicated and re-tiered cards are valid, with stable new ids", () => {
  let d = data();
  const cat = readCatalogue(d);
  const ids = cat.buffs.map((b) => b.id);
  for (const tier of ["blue", "purple", "gold"] as const) {
    const record = newBuff(tier, ids, "stall", fieldOrder(schema, tier));
    d = at(d, ["buffs", list(d).length], record);
    assert.equal(readBuff(record).id, `new_${tier}`);
  }
  const sniper = list(d).findIndex((r) => readBuff(r).id === "sniper");
  const copy = duplicateBuff(list(d)[sniper] as JsonMap, readCatalogue(d).buffs.map((b) => b.id), fieldOrder(schema, "gold"));
  assert.equal(readBuff(copy).id, "sniper_copy");
  assert.equal(readBuff(copy).core, false);
  d = at(d, ["buffs", list(d).length], copy);
  // Attack to gold and back, Galvanic to purple
  const attack = list(d).findIndex((r) => readBuff(r).id === "attack");
  const step = readBuff(list(d)[attack]).step;
  const goldAttack = changeTier(list(d)[attack] as JsonMap, "gold", 3, "speed", fieldOrder(schema, "gold"));
  assert.deepEqual(readBuff(goldAttack).ranks, [step, 2 * step, 3 * step]);
  assert.equal(readBuff(goldAttack).description.length, 3);
  d = at(d, ["buffs", attack], goldAttack);
  const galvanic = list(d).findIndex((r) => readBuff(r).id === "galvanic");
  const ranks = readBuff(list(d)[galvanic]).ranks;
  const purple = changeTier(list(d)[galvanic] as JsonMap, "purple", 3, undefined, fieldOrder(schema, "purple"));
  assert.equal(readBuff(purple).step, ranks[0]);
  assert.equal(readBuff(purple).cap, ranks[ranks.length - 1]);
  d = at(d, ["buffs", galvanic], purple);
  assert.deepEqual(errors(d), []);
  assert.deepEqual(buildCheck(d), { ok: true });
  // Galvanic was paralysis's core: the theme has none now, a warning
  assert.ok(checkBuffs(readCatalogue(d)).every((p) => p.severity === "warning"));
  assert.equal(uniqueId("Thorn Guard", ["thorn_guard"]), "thorn_guard_2");
  assert.equal(uniqueId("Pokémon!", []), "pokemon");
});

test("the checks refuse what the packer refuses", () => {
  const cases: [JsonMap, RegExp][] = [
    [at(data(), ["buffs", 1, "id"], "attack"), /used twice/],
    [at(data(), ["buffs", 0, "bucket"], "def"), /attack side/],
    [at(data(), ["settings", "tier_odds", "boss", "gold"], 60), /add up to/],
    [at(data(), ["settings", "tier_odds", "shop", "blue"], 0), /add up to/],
    [at(data(), ["buffs", 0, "description"], "Attack +10% if Supercalifragilisticexpialidocious hits"), /takes more than/],
  ];
  const cat = readCatalogue(data());
  const overcharge = cat.buffs.findIndex((b) => b.id === "overcharge");
  cases.push([at(data(), ["buffs", overcharge, "core"], true), /already has a core gold/]);
  const speed = cat.buffs.findIndex((b) => b.id === "speed");
  cases.push([at(data(), ["buffs", speed, "bucket"], "atk"), /isn't damage/]);
  for (const [d, message] of cases) {
    assert.ok(checkBuffs(readCatalogue(d)).some((p) => p.severity === "error" && message.test(p.message)), String(message));
    const packed = packerCheck(d);
    assert.equal(packed.ok, false, String(message));
    assert.match(packed.output, message);
  }
});

test("filters and the icon a card shows", () => {
  const cat = readCatalogue(data());
  const golds = filterBuffs(cat.buffs, { tier: "gold" });
  assert.equal(golds.length, 68);
  const stall = filterBuffs(cat.buffs, { theme: "stall" }).map((i) => cat.buffs[i]);
  assert.ok(stall.length > 0 && stall.every((b) => b.theme === "stall" || b.related.includes("stall")));
  assert.deepEqual(filterBuffs(cat.buffs, { text: "leech seed" }).map((i) => cat.buffs[i].id), ["parasite"]);
  assert.ok(filterBuffs(cat.buffs, { pool: "gift" }).every((i) => cat.buffs[i].tier !== "blue"));
  assert.equal(cat.buffs.find((b) => b.id === "overflow")!.category, "heal");
});

test("one icon a category, every tier's palette: each card's category exists, and an icon takes the tier's colors", () => {
  const cat = readCatalogue(data());
  assert.ok(cat.categories.length >= 10 && cat.categories.length <= 14);
  for (const c of cat.categories) assert.ok(existsSync(join(ROOT, categoryIconPath(c.id))), c.id);
  for (const t of ["blue", "purple", "gold"] as const) assert.ok(existsSync(join(ROOT, tierPalettePath(t))), t);
  const ids = new Set(cat.categories.map((c) => c.id));
  assert.ok(cat.buffs.every((b) => ids.has(b.category)));
  // Index 0 clear, the others the palette's color at that index
  const rgba = tintIcon([0, 1, 5], [[0, 0, 0], [10, 20, 30], [0, 0, 0], [0, 0, 0], [0, 0, 0], [200, 100, 50]]);
  assert.deepEqual([...rgba], [0, 0, 0, 0, 10, 20, 30, 255, 200, 100, 50, 255]);
  // A card with an unknown category is an error, in the editor and the packer
  const bad = at(data(), ["buffs", 0, "category"], "sword");
  assert.ok(checkBuffs(readCatalogue(bad)).some((p) => p.severity === "error" && /category/.test(p.message)));
  assert.match(packerCheck(bad).output, /isn't one of categories'/);
});
