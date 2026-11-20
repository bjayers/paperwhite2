// The Entree page's step 6 (src/modules/entree/model.ts): room types and the markers they give, the templates every
// generated room of a type is, the new NPC types with their default sprites and markers, the rounds' type weights and
// the run's chances, the item table and its pools' chances (the Nightmare Ball's rule), and the clearings' flower tiles;
// each written as the editor writes it passes the schema in the editor's check and the build's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileText, fromPlain, parseJson, setIn, type JsonValue } from "../shared/json.ts";
import { validate, type Schema } from "../shared/schema.ts";
import { Python } from "../server/python.ts";
import {
  DEFAULT_TYPE_WEIGHTS, FLOWER_TILES_SCHEMA, ITEMS_SCHEMA, ITEM_BALL_SPRITE, LADY_SPRITE, NIGHTMARE_BALL, NPC_TYPES, ROOM_SCHEMA, ROOM_TYPES,
  TEMPLATES, TEMPLATES_DIR, TEMPLATE_TYPES, TYPE_MARKERS, WEIGHT_ORDER, checkItems, checkRoom, checkTemplates, defaultMarker, newItemEntry,
  newNpc, newRoomData, newTemplateData, npcSprite, percent, poolChances, readFlowerTiles, readItems, readRoom, readRun, runProblems,
  setFlowerTiles, typeChances, type NpcType, type Room,
} from "../src/modules/entree/model.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const constants = new Map(Object.entries(new Python(ROOT).constants()));
const load = (path: string) => JSON.parse(readFileSync(join(ROOT, path), "utf8")) as Schema;
const roomSchema = load(ROOM_SCHEMA);
const runSchema = load("res/paperwhite2/entralink/run.schema.json");
const itemsSchema = load(ITEMS_SCHEMA);
const flowerSchema = load(FLOWER_TILES_SCHEMA);
const errors = (d: JsonValue, s: Schema) => validate(d, s, constants).map((e) => `${e.path.join(".")}: ${e.message}`);
/** The build's own check of data written as the editor writes it. */
function buildCheck(data: JsonValue, schema: string): { ok: boolean; error?: string } {
  const dir = mkdtempSync(join(tmpdir(), "entree6-"));
  try {
    const file = join(dir, "data.json");
    writeFileSync(file, fileText(data));
    return JSON.parse(execFileSync("python3", ["-I", join(ROOT, "editor/server/python/validate.py")], { cwd: ROOT, input: `${file}\t${join(ROOT, schema)}\n` }).toString());
  } finally {
    rmSync(dir, { recursive: true });
  }
}
const markers = new Set(["rest", "buff", "item", "shop"]);

test("room types: read, enemy by default, the door's marker follows the type unless set, valid", () => {
  let data = newRoomData("Typed");
  assert.equal(readRoom(data).type, undefined);
  assert.equal(defaultMarker(readRoom(data)), "enemy");
  for (const type of ROOM_TYPES) {
    data = setIn(data, ["type"], type);
    const room = readRoom(data);
    assert.equal(room.type, type);
    assert.equal(defaultMarker(room), TYPE_MARKERS[type]);
    assert.deepEqual(errors(data, roomSchema).filter((e) => !e.endsWith("progress_id is missing")), [], type);
  }
  assert.deepEqual(TYPE_MARKERS, { enemy: "enemy", enemy_choice: "enemy_choice", challenge: "challenge", rest: "rest", item: "gift", buff: "gift", shop: "shop", event: "event" });
  // A boss or final room's is its role's, and a type there is warned as unused
  const boss = { ...readRoom(data), role: "boss" as const, type: "rest" as const };
  assert.equal(defaultMarker(boss), "boss");
  assert.ok(checkRoom(boss, constants).some((p) => p.severity === "warning" && p.message.includes("type isn't used")));
  assert.equal(errors(setIn(data, ["type"], "treasure"), roomSchema).filter((e) => !e.endsWith("progress_id is missing")).length, 1);
});

test("the new NPC types: valid, their default sprites and markers, item-choice rooms of fewer than 3 warned", () => {
  const room = readRoom(newRoomData("x"));
  const npcs = NPC_TYPES.map((t, i) => newNpc(t, 3 + i, 4, room, markers));
  // Their markers: heal, revive and swap their own (step 7, the buffs' phase 7; none where the art isn't given), gift
  // the item, shop the shop, buff balls the buff; item-choice balls none
  assert.deepEqual(npcs.map((n) => n.get("marker") ?? null), [null, null, null, null, "item", "shop", null, null, "buff", "rest", "buff"]);
  const step7 = new Set([...markers, "heal", "revive", "swap"]);
  assert.deepEqual(["heal", "revive", "swap"].map((t) => newNpc(t as NpcType, 3, 4, room, step7).get("marker")), ["heal", "revive", "swap"]);
  // Without npc_markers/ art, none
  assert.equal(newNpc("heal", 0, 0, room, new Set()).has("marker"), false);
  const data = setIn(newRoomData("x"), ["npcs"], npcs);
  assert.deepEqual(errors(data, roomSchema).filter((e) => !e.endsWith("progress_id is missing")), []);
  const read = readRoom(data);
  // Sprites: balls the item ball, people the Lady; none written
  assert.deepEqual(read.npcs.map((n) => (n.type === "battle" ? "battle" : npcSprite(n, read, constants))),
    ["battle", ITEM_BALL_SPRITE, LADY_SPRITE, LADY_SPRITE, LADY_SPRITE, LADY_SPRITE, LADY_SPRITE, ITEM_BALL_SPRITE, ITEM_BALL_SPRITE, LADY_SPRITE, LADY_SPRITE]);
  assert.ok(npcs.every((n) => !n.has("sprite")));
  const ball = read.npcs.find((x) => x.type === "item_choice")!;
  const choices = (n: number): Room => ({ ...read, npcs: read.npcs.filter((x) => x.type === "item_choice").concat(
    Array.from({ length: n - 1 }, (_, k) => ({ ...ball, x: 20 + k }))) });
  const warned = (r: Room) => checkRoom(r, constants).filter((p) => p.message.includes("item-choice ball")).map((p) => p.message);
  assert.deepEqual(warned(choices(2)), ["The room has 2 item-choice balls; an item room offers 3 to choose from."]);
  assert.deepEqual(warned(choices(3)), []);
  // An item-choice ball's item is drawn, never set
  assert.ok(checkRoom({ ...read, npcs: [{ ...ball, item: "ITEM_POTION" }] }, constants).some((p) => p.message.includes("drawn as the room is entered")));
});

test("templates: the placeholders are valid rooms of their types, a missing one is an error, and the real ones are valid", () => {
  for (const id of TEMPLATES) {
    const data = newTemplateData(id, markers);
    assert.deepEqual(errors(data, roomSchema), [], id);
    assert.deepEqual(buildCheck(data, ROOM_SCHEMA), { ok: true }, id);
    const room = readRoom(data);
    assert.equal(room.type, TEMPLATE_TYPES[id]);
    assert.deepEqual(checkRoom(room, constants), [], id);
  }
  assert.deepEqual(readRoom(newTemplateData("rest")).npcs.map((n) => n.type), ["heal", "revive", "gift", "swap"]);
  assert.deepEqual(readRoom(newTemplateData("item")).npcs.map((n) => n.type), ["item_choice", "item_choice", "item_choice"]);
  assert.deepEqual(readRoom(newTemplateData("pre_boss_rest")).npcs.map((n) => n.type), ["heal", "revive", "gift", "shop", "swap"]);
  assert.equal(TEMPLATE_TYPES.pre_boss_rest, "rest");
  assert.deepEqual(checkTemplates(TEMPLATES), []);
  assert.deepEqual(checkTemplates(["rest", "item", "buff", "shop"]), [
    "Template missing: templates/pre_boss_rest.json, the rest before each boss. Make it under Templates."]);
  for (const file of globSync(`${TEMPLATES_DIR}/*.json`, { cwd: ROOT })) {
    const data = parseJson(readFileSync(join(ROOT, file), "utf8"));
    assert.deepEqual(errors(data, roomSchema), [], file);
  }
});

test("the rounds' type weights and the run's chances: read with their defaults, written valid, the draw's checks", () => {
  const real = parseJson(readFileSync(join(ROOT, "res/paperwhite2/entralink/run.json"), "utf8"));
  const run = readRun(real);
  assert.deepEqual(run.rounds[0].typeWeights, DEFAULT_TYPE_WEIGHTS);
  assert.deepEqual([...WEIGHT_ORDER], ["enemy", "enemy_choice", "challenge", "item", "buff", "rest", "event", "shop"]);
  // The editor writes all seven once one is changed, in the file's order
  const weights = new Map<string, JsonValue>(WEIGHT_ORDER.map((t) => [t, t === "shop" ? 0 : DEFAULT_TYPE_WEIGHTS[t]]));
  let data = setIn(real, ["rounds", 0, "type_weights"], weights);
  data = setIn(data, ["custom_chance"], 40);
  data = setIn(data, ["ground_item_chance"], 0);
  data = setIn(data, ["hidden_item_chance"], 100);
  assert.deepEqual(errors(data, runSchema), []);
  assert.deepEqual(buildCheck(data, "res/paperwhite2/entralink/run.schema.json"), { ok: true });
  const back = readRun(data);
  assert.equal(back.rounds[0].typeWeights!.shop, 0);
  assert.deepEqual([back.customChance, back.groundItemChance, back.hiddenItemChance], [40, 0, 100]);
  assert.deepEqual([run.customChance, run.groundItemChance, run.hiddenItemChance], [25, 30, 20]);
  assert.equal(errors(setIn(data, ["rounds", 0, "type_weights", "enemy"], 256), runSchema).length, 1);
  // The chances: the defaults add up to 100
  assert.deepEqual(typeChances(DEFAULT_TYPE_WEIGHTS), { enemy: 42, enemy_choice: 8, challenge: 12, item: 10, buff: 10, rest: 10, event: 5, shop: 3 });
  assert.equal(percent(100 / 3), "33%");
  assert.equal(percent(3.333), "3.3%");
  // The draw: with the templates known, a round of only generic enemy rooms skips enemy_choice, challenge and event; weights of 0 are
  // an error; a round with no premade room draws from the templates
  const rooms = ["a", "b", "c"].map((id) => ({ id, room: readRoom(newRoomData(id)) }));
  rooms.push({ id: "f", room: { ...readRoom(newRoomData("f")), role: "final" } });
  const all = new Set(TEMPLATES);
  const messages = (r: Parameters<typeof runProblems>[0], t = all as ReadonlySet<string>) => runProblems(r, rooms, t).map((p) => `${p.severity}: ${p.message}`);
  assert.deepEqual(messages({ rounds: [{ rooms: 2, boss: false, typeWeights: DEFAULT_TYPE_WEIGHTS }] }),
    ["warning: Round 1: no enemy_choice or challenge or event room can come up, so those types are skipped (the other types' chances rise)."]);
  const zero = Object.fromEntries(WEIGHT_ORDER.map((t) => [t, 0])) as typeof DEFAULT_TYPE_WEIGHTS;
  assert.deepEqual(messages({ rounds: [{ rooms: 2, boss: false, typeWeights: zero }] }),
    ["error: Round 1's room-type weights add up to 0, so its doors can't draw a room."]);
  const restOnly = { ...zero, rest: 1 };
  assert.deepEqual(messages({ rounds: [{ rooms: 2, boss: false, typeWeights: restOnly }] }), []);
  assert.deepEqual(messages({ rounds: [{ rooms: 2, boss: false, typeWeights: restOnly }] }, new Set()),
    ["error: Round 1 draws 2 rooms, but no type with a weight has a room or a template."]);
  // A premade challenge room makes challenge drawable
  rooms.push({ id: "ch", room: { ...readRoom(newRoomData("ch")), type: "challenge" } });
  assert.deepEqual(messages({ rounds: [{ rooms: 2, boss: false, typeWeights: DEFAULT_TYPE_WEIGHTS }] }),
    ["warning: Round 1: no enemy_choice or event room can come up, so those types are skipped (the other types' chances rise)."]);
});

test("the item table: entries read and written valid, each pool's chances, the Nightmare Ball only while catchable, the checks", () => {
  const entry = (item: string, weight: number, pools: string[], rounds?: number[]) => fromPlain({ item, weight, ...(rounds && { rounds }), pools });
  const data = fromPlain({ $schema: "items.schema.json", items: [] });
  const table = setIn(data, ["items"], [
    newItemEntry(), entry("ITEM_SUPER_POTION", 5, ["item_room", "gift"], [2, 3]), entry("ITEM_REVIVE", 5, ["gift", "ground"]),
    entry(NIGHTMARE_BALL, 10, ["item_room", "gift", "ground"]), entry("ITEM_ETHER", 10, ["gift", "shop"]),
  ]);
  assert.deepEqual(errors(table, itemsSchema), []);
  assert.deepEqual(buildCheck(table, ITEMS_SCHEMA), { ok: true });
  assert.equal(errors(setIn(table, ["items", 0, "pools", 0], "chest"), itemsSchema).length, 1);
  assert.equal(errors(setIn(table, ["items", 0, "weight"], 0), itemsSchema).length, 1);
  const entries = readItems(table);
  assert.deepEqual(entries[1], { item: "ITEM_SUPER_POTION", weight: 5, rounds: [2, 3], price: 0, pools: ["item_room", "gift"] });
  const chances = (pool: Parameters<typeof poolChances>[1], round: 1 | 2 | 3, catchable = true) =>
    poolChances(entries, pool, round, catchable).map((c) => `${c.item} ${Math.round(c.chance)}`);
  // Round 1: the Super Potion is kept to rounds 2-3
  assert.deepEqual(chances("item_room", 1), ["ITEM_POTION 50", `${NIGHTMARE_BALL} 50`]);
  assert.deepEqual(chances("item_room", 2), ["ITEM_POTION 40", "ITEM_SUPER_POTION 20", `${NIGHTMARE_BALL} 40`]);
  // Nothing catchable: the ball's weight is left out
  assert.deepEqual(chances("item_room", 1, false), ["ITEM_POTION 100"]);
  const found = checkItems(entries).map((p) => `${p.severity}: ${p.message}`);
  assert.deepEqual(found, [
    "warning: The item room pool offers 3 different items, but has fewer in round 1, 2, 3 (without the Nightmare Ball).",
    "warning: The gift pool offers 3 different items, but has fewer in round 1 (without the Nightmare Ball).",
  ]);
  assert.ok(checkItems([]).some((p) => p.message === "The gift pool has no item in round 1, 2, 3."));
  assert.ok(checkItems(readItems(setIn(table, ["items", 5], newItemEntry())))
    .some((p) => p.message === "Entry 6 draws ITEM_POTION in a pool and round that entry 1 does too: their weights add up."));
  // The real table, once the game side has made it
  for (const file of globSync("res/paperwhite2/entralink/items.json", { cwd: ROOT })) {
    assert.deepEqual(errors(parseJson(readFileSync(join(ROOT, file), "utf8")), itemsSchema), [], file);
  }
});

test("flower tiles: toggled per clearing, kept in the file's order, valid (patternProperties, as the build checks)", () => {
  let data: JsonValue = fromPlain({ $schema: "flower_tiles.schema.json", ZONE_ENTREE_FOREST_3: [[4, 5], [6, 7]] });
  data = setFlowerTiles(data, "ZONE_ENTREE_FOREST_3", [{ x: 1, z: 1 }, { x: 4, z: 5 }, { x: 1, z: 1 }], true);
  assert.deepEqual(readFlowerTiles(data, "ZONE_ENTREE_FOREST_3"), [[4, 5], [6, 7], [1, 1]]);
  data = setFlowerTiles(data, "ZONE_ENTREE_FOREST_3", [{ x: 6, z: 7 }], false);
  assert.deepEqual(readFlowerTiles(data, "ZONE_ENTREE_FOREST_3"), [[4, 5], [1, 1]]);
  // A new clearing goes among the others by its number; one with none left is left out
  data = setFlowerTiles(data, "ZONE_ENTREE_FOREST_10", [{ x: 2, z: 2 }], true);
  data = setFlowerTiles(data, "ZONE_ENTREE_FOREST", [{ x: 9, z: 9 }], true);
  assert.deepEqual([...(data as Map<string, JsonValue>).keys()], ["$schema", "ZONE_ENTREE_FOREST", "ZONE_ENTREE_FOREST_3", "ZONE_ENTREE_FOREST_10"]);
  data = setFlowerTiles(data, "ZONE_ENTREE_FOREST", [{ x: 9, z: 9 }], false);
  assert.equal((data as Map<string, JsonValue>).has("ZONE_ENTREE_FOREST"), false);
  assert.deepEqual(errors(data, flowerSchema), []);
  assert.deepEqual(buildCheck(data, FLOWER_TILES_SCHEMA), { ok: true });
  // The editor's check refuses what the build does: a tile off the grid, a key no pattern takes
  const bad = setIn(data, ["ZONE_ENTREE_FOREST_3", 0, 0], 40);
  assert.deepEqual(errors(bad, flowerSchema), ["ZONE_ENTREE_FOREST_3.0.0: 40 is not from 0 to 31"]);
  assert.equal(buildCheck(bad, FLOWER_TILES_SCHEMA).ok, false);
  const stray = setIn(data, ["ZONE_ROUTE_1"], [[1, 1]]);
  assert.deepEqual(errors(stray, flowerSchema), ["ZONE_ROUTE_1: ZONE_ROUTE_1 is not a field here"]);
  assert.equal(buildCheck(stray, FLOWER_TILES_SCHEMA).ok, false);
});
