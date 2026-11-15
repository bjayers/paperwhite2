// The Pokémon Center page: edits to services.json round-trip (the file is written back as it was, an edit changes
// only its value) and validate with the schema, its odds read the weights as the generator draws them, and Graphics &
// Palettes' "Paper White 2's items" group takes the Link Cord and the three apples (items 114 and 120-122) from the data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileText, getIn, parseJson, setIn, detectLayout } from "../shared/json.ts";
import { validate, type Schema } from "../shared/schema.ts";
import { Project } from "../server/project.ts";
import { Python } from "../server/python.ts";
import { SERVICES_PATH, itemChance, oneIn, readTiers, tierShares } from "../src/modules/pokemoncenter/model.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const project = new Project(ROOT);
const constants = new Map(Object.entries(new Python(ROOT).constants()));
const text = readFileSync(project.abs(SERVICES_PATH), "utf8");
const data = parseJson(text);
const schema = JSON.parse(readFileSync(project.abs("res/paperwhite2/pokemon_center/services.schema.json"), "utf8")) as Schema;
const errors = (d: typeof data) => validate(d, schema, constants).map((e) => `${e.path.join(".")}: ${e.message}`);

test("services.json is written back as it was, and edits validate", () => {
  const layout = detectLayout(text, data);
  assert.ok(layout);
  assert.equal(fileText(data, layout), text);
  assert.deepEqual(errors(data), []);
  let edited = setIn(data, ["daycare", "transfer_fee"], 750);
  edited = setIn(edited, ["wonder_trade", "item_tiers", 0, "items", 0], new Map<string, string | number>([["item", "ITEM_ORAN_BERRY"], ["weight", 4]]));
  edited = setIn(edited, ["wonder_trade", "excluded_species", 0], "SPECIES_MEW");
  edited = setIn(edited, ["wonder_trade", "special_reward", "moves", 3], undefined);
  assert.deepEqual(errors(edited), []);
  const back = parseJson(fileText(edited, layout));
  assert.equal(getIn(back, ["daycare", "transfer_fee"]), 750);
  assert.equal(getIn(back, ["training", "move_relearner", "price"]), getIn(data, ["training", "move_relearner", "price"]));
  assert.deepEqual(errors(setIn(data, ["wonder_trade", "shiny_one_in"], 0)).length, 1);
  assert.deepEqual(errors(setIn(data, ["wonder_trade", "item_tiers", 0, "name"], "Common!")).length, 1);
});

test("a tier's shares and an item's 1 in N", () => {
  const tiers = readTiers(getIn(data, ["wonder_trade", "item_tiers"]));
  const shares = tierShares(tiers);
  assert.ok(Math.abs(shares.reduce((sum, s) => sum + s.share, 0) - 1) < 1e-9);
  for (const s of shares) assert.ok(Math.abs(s.items.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const small = readTiers([
    new Map<string, never>([["name", "a"], ["weight", 1], ["items", ["ITEM_POTION", new Map<string, string | number>([["item", "ITEM_MASTER_BALL"], ["weight", 3]])]]] as never),
  ] as never);
  assert.equal(itemChance(small, 40, "ITEM_MASTER_BALL"), 0.4 * 0.75);
  assert.equal(oneIn(0.4 * 0.75), "about 1 in 3 trades");
  assert.equal(oneIn(0), null);
  assert.equal(oneIn(1 / 2000), "about 1 in 2,000 trades");
});

test("the new-items group includes the Link Cord and the three apples", () => {
  const out = execFileSync("python3", ["-I", resolve(ROOT, "editor/server/python/item_icons.py"), "list"], { cwd: ROOT, maxBuffer: 64 << 20 }).toString();
  const items = (JSON.parse(out) as { items: { constant: string; id: number; hack: boolean }[] }).items;
  const hack = new Map(items.filter((i) => i.hack).map((i) => [i.id, i.constant]));
  for (const id of [114, 120, 121, 122]) assert.ok(hack.has(id), `item ${id}`);
  assert.equal(hack.get(120), "ITEM_TART_APPLE");
  assert.ok(!items.some((i) => i.hack && i.constant.startsWith("ITEM_UNUSED_")));
});
