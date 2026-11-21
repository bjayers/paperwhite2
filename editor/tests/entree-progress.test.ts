// The Entree page's step 3 (src/modules/entree/model.ts): NPC dialogue and catches written into a room and read back,
// valid in the editor's check and the build's; progress ids given on save to new battles and catches only, above
// every number ever given (progress_ids.json), never changing one, a copied room getting new ones; the keys between
// rooms renamed with a battle or a room; the run's field weather.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileText, fromPlain, getIn, parseJson, setIn, type JsonValue } from "../shared/json.ts";
import { validate, type Schema } from "../shared/schema.ts";
import { Python } from "../server/python.ts";
import {
  PROGRESS_IDS, PROGRESS_IDS_SCHEMA, ROOMS_DIR, ROOM_SCHEMA, assignProgressIds, battleKeys, checkRoom, checkRooms, newRoomData, readRoom,
  renameKeys, withoutProgressIds,
} from "../src/modules/entree/model.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const constants = new Map(Object.entries(new Python(ROOT).constants()));
const schema = JSON.parse(readFileSync(join(ROOT, ROOM_SCHEMA), "utf8")) as Schema;
const orders = { battle: Object.keys(schema.$defs!.battle.properties!), enemy: Object.keys(schema.$defs!.enemy.properties!),
  room: Object.keys(schema.properties!) };
const errors = (d: JsonValue, s: Schema = schema) => validate(d, s, constants).map((e) => `${e.path.join(".")}: ${e.message}`);
/** The build's own check of data against a schema, on a scratch file. */
function buildCheck(data: JsonValue, schemaFile = ROOM_SCHEMA): { ok: boolean } {
  const dir = mkdtempSync(join(tmpdir(), "entree-"));
  try {
    const file = join(dir, "x.json");
    writeFileSync(file, fileText(setIn(data, ["$schema"], join(ROOT, schemaFile))));
    return JSON.parse(execFileSync("python3", ["-I", join(ROOT, "editor/server/python/validate.py")], { cwd: ROOT, input: `${file}\t${join(ROOT, schemaFile)}\n` }).toString());
  } finally {
    rmSync(dir, { recursive: true });
  }
}
const real = globSync(`${ROOMS_DIR}/*.json`, { cwd: ROOT }).sort().map((path) => ({ path, data: parseJson(readFileSync(join(ROOT, path), "utf8")) }));
const listed = (rooms: { path: string; data: JsonValue }[]) => rooms.map((r) => ({ id: r.path.replace(/^.*\//, "").replace(/\.json$/, ""), room: readRoom(r.data) }));

test("dialogue is written into the room, read back as it was, and valid", () => {
  const before = "Hello there, {0100:0}!\nYou look lost.{be01}\nCare for a battle?";
  const after = "Well fought.{be00}\nThe way is open.";
  let data: JsonValue = assignProgressIds([{ path: "r", data: newRoomData("Talk") }], null, orders).changed.get("r")!;
  data = setIn(data, ["npcs", 0, "dialogue"], fromPlain({ before, after }));
  data = setIn(data, ["npcs", 1], fromPlain({ type: "item", item: "ITEM_POTION", x: 12, z: 18, facing: "DIR_DOWN", dialogue: { before: "Take this!", after: "Unused" } }));
  assert.deepEqual(errors(data), []);
  assert.deepEqual(buildCheck(data), { ok: true });
  // Its line breaks are JSON's, as the trainers' messages keep them; the text survives the file
  const text = fileText(data);
  assert.ok(text.includes('"before": "Hello there, {0100:0}!\\nYou look lost.{be01}\\nCare for a battle?"'));
  const back = readRoom(parseJson(text));
  assert.deepEqual(back.npcs[0].dialogue, { before, after });
  assert.deepEqual(back.npcs[1].dialogue, { before: "Take this!", after: "Unused" });
  // An item NPC's "after" isn't said
  assert.deepEqual(checkRoom(back, constants).map((p) => p.message), ['NPC 2 (item) has an "after the battle" message, which only battle NPCs say.']);
  // Each message is the text files' editor form: x-message "game", so the generic form previews it too
  assert.equal(schema.$defs!.npc.properties!.dialogue.properties!.before["x-message"], "game");
});

test("catches and spawn conditions name battles of any room", () => {
  let data: JsonValue = assignProgressIds([{ path: "r", data: newRoomData("Palkia") }], null, orders).changed.get("r")!;
  data = setIn(data, ["battles", 0, "enemies", 0, "catch"], fromPlain({ after: ["dialga/dialga"], once: false }));
  data = setIn(data, ["npcs", 1], fromPlain({ type: "item", item: "ITEM_POTION", requires: ["dialga/dialga", "run/completed"], x: 12, z: 18, facing: "DIR_DOWN" }));
  assert.deepEqual(errors(data), []);
  assert.deepEqual(buildCheck(data), { ok: true });
  const room = readRoom(data);
  assert.deepEqual(room.battles[0].enemies[0].catch, { after: ["dialga/dialga"], once: false });
  assert.deepEqual(readRoom(setIn(data, ["battles", 0, "enemies", 0, "catch"], fromPlain({}))).battles[0].enemies[0].catch, { after: [], once: true });
  assert.deepEqual(room.npcs[1].requires, ["dialga/dialga", "run/completed"]);
  const known = battleKeys(listed(real));
  assert.ok(known.has("dialga/dialga"));
  assert.deepEqual(checkRoom(room, constants, [], known), []);
  // A battle no room has
  const gone = readRoom(setIn(setIn(data, ["battles", 0, "enemies", 0, "catch", "after"], ["palkia/nothing"]), ["npcs", 1, "requires"], ["nowhere/x"]));
  assert.deepEqual(checkRoom(gone, constants, [], known).map((p) => p.message), [
    "Battle \"battle\"'s enemy 1 can be caught only after winning \"palkia/nothing\", which no room has.",
    "NPC 2 (item) spawns only after winning \"nowhere/x\", which no room has.",
  ]);
  // A key is "<room>/<battle>" or run/completed; the old event flag is gone
  assert.equal(errors(setIn(data, ["npcs", 1, "requires"], ["dialga"])).length, 1);
  assert.equal(buildCheck(setIn(data, ["npcs", 1, "flag"], "EVENT_FLAG_0x0001")).ok, false);
});

test("progress ids: new battles and catches get the next numbers, old ones never change", () => {
  // The converted rooms have theirs, and progress_ids.json is past them
  const counters = JSON.parse(readFileSync(join(ROOT, PROGRESS_IDS), "utf8"));
  const none = assignProgressIds(real, counters, orders);
  assert.equal(none.changed.size, 0);
  assert.deepEqual(none.counters, { next_battle: counters.next_battle, next_catch: counters.next_catch, next_room: counters.next_room });
  assert.deepEqual(errors(parseJson(readFileSync(join(ROOT, PROGRESS_IDS), "utf8")), JSON.parse(readFileSync(join(ROOT, PROGRESS_IDS_SCHEMA), "utf8"))), []);
  assert.deepEqual(checkRooms(listed(real)).filter((m) => m.includes("progress id")), []);

  // A new room with a catchable enemy, after three deleted battles and catches past the real ones: numbers above them
  const nextBattle = counters.next_battle + 3, nextCatch = counters.next_catch + 3, nextRoom = counters.next_room + 3;
  let fresh = newRoomData("New");
  fresh = setIn(fresh, ["battles", 0, "enemies", 0, "catch"], fromPlain({ after: [], once: true }));
  const rooms = [...real, { path: `${ROOMS_DIR}/zz_new.json`, data: fresh }];
  const given = assignProgressIds(rooms, { next_battle: nextBattle, next_catch: nextCatch, next_room: nextRoom }, orders);
  assert.deepEqual([...given.changed.keys()], [`${ROOMS_DIR}/zz_new.json`]);
  const out = given.changed.get(`${ROOMS_DIR}/zz_new.json`)!;
  assert.equal(getIn(out, ["battles", 0, "progress_id"]), nextBattle);
  assert.equal(getIn(out, ["battles", 0, "enemies", 0, "progress_id"]), nextCatch);
  assert.deepEqual(given.counters, { next_battle: nextBattle + 1, next_catch: nextCatch + 1, next_room: nextRoom + 1 });
  assert.equal(getIn(out, ["progress_id"]), nextRoom);
  // In the schema's order: a battle's after its id, an enemy's after its catch
  assert.deepEqual([...(getIn(out, ["battles", 0]) as Map<string, JsonValue>).keys()], ["id", "progress_id", "format", "enemies"]);
  assert.deepEqual([...(getIn(out, ["battles", 0, "enemies", 0]) as Map<string, JsonValue>).keys()], ["species", "level", "catch", "progress_id"]);
  assert.deepEqual(errors(out), []);
  assert.deepEqual(buildCheck(out), { ok: true });
  // Saved again: nothing changes
  const again = assignProgressIds([...real, { path: `${ROOMS_DIR}/zz_new.json`, data: out }], given.counters, orders);
  assert.equal(again.changed.size, 0);
  assert.deepEqual(again.counters, given.counters);

  // Without progress_ids.json, or with one behind the rooms: above every number in use
  assert.deepEqual(assignProgressIds(rooms, null, orders).counters,
    { next_battle: counters.next_battle + 1, next_catch: counters.next_catch + 1, next_room: counters.next_room + 1 });
  assert.equal(getIn(assignProgressIds(rooms, { next_battle: 0, next_catch: 0, next_room: 0 }, orders).changed.get(`${ROOMS_DIR}/zz_new.json`)!, ["battles", 0, "progress_id"]), counters.next_battle);

  // A copy of a room gets new numbers; a copy with its old ones would share them
  const copy = { path: `${ROOMS_DIR}/zz_new_copy.json`, data: out };
  assert.deepEqual(checkRooms(listed([...real, { path: `${ROOMS_DIR}/zz_new.json`, data: out }, copy])).filter((m) => m.includes("progress id")), [
    `zz_new_copy has the same room progress id (${nextRoom}) as zz_new: remove one's progress_id in the text view and save to give it a new one.`,
    `zz_new_copy/battle has the same battle progress id (${nextBattle}) as zz_new/battle: remove one's progress_id in the text view and save to give it a new one.`,
    `zz_new_copy/battle enemy 1 has the same catch progress id (${nextCatch}) as zz_new/battle enemy 1: remove one's progress_id in the text view and save to give it a new one.`,
  ]);
  const copied = assignProgressIds([{ path: `${ROOMS_DIR}/zz_new.json`, data: out }, { ...copy, data: withoutProgressIds(out) }], given.counters, orders);
  assert.equal(getIn(copied.changed.get(copy.path)!, ["battles", 0, "progress_id"]), nextBattle + 1);
  assert.equal(getIn(copied.changed.get(copy.path)!, ["battles", 0, "enemies", 0, "progress_id"]), nextCatch + 1);
  assert.equal(getIn(copied.changed.get(copy.path)!, ["progress_id"]), nextRoom + 1);
  assert.equal(copied.changed.has(`${ROOMS_DIR}/zz_new.json`), false);

  // A catch turned off keeps its number, for when it's turned on again; the save's bits run out at their limits
  const off = setIn(out, ["battles", 0, "enemies", 0, "catch"], undefined);
  assert.equal(assignProgressIds([{ path: "x", data: off }], given.counters, orders).changed.size, 0);
  assert.match(assignProgressIds([{ path: "x", data: newRoomData("x") }], { next_battle: 1024, next_catch: 0, next_room: 0 }, orders).error ?? "", /1024 battles/);
});

test("renaming a battle or a room renames what the rooms name of it", () => {
  let data = newRoomData("Palkia");
  data = setIn(data, ["battles", 0, "enemies", 0, "catch"], fromPlain({ after: ["dialga/dialga", "ho_oh/ho_oh"], once: true }));
  data = setIn(data, ["npcs", 0, "requires"], ["dialga/dialga", "run/completed"]);
  const battle = renameKeys(data, "dialga/dialga", "dialga/main")!;
  assert.deepEqual(getIn(battle, ["battles", 0, "enemies", 0, "catch", "after"]), ["dialga/main", "ho_oh/ho_oh"]);
  assert.deepEqual(getIn(battle, ["npcs", 0, "requires"]), ["dialga/main", "run/completed"]);
  const room = renameKeys(data, "dialga/", "nightmare_dialga/", true)!;
  assert.deepEqual(getIn(room, ["npcs", 0, "requires"]), ["nightmare_dialga/dialga", "run/completed"]);
  assert.equal(renameKeys(data, "darkrai/", "x/", true), null);
  assert.ok(checkRooms([{ id: "run", room: readRoom(data) }]).some((m) => m.startsWith('A room is called "run"')));
});

test("the run's field weather", () => {
  const runSchema = JSON.parse(readFileSync(join(ROOT, "res/paperwhite2/entralink/run.schema.json"), "utf8")) as Schema;
  const run = parseJson(readFileSync(join(ROOT, "res/paperwhite2/entralink/run.json"), "utf8"));
  assert.deepEqual(errors(setIn(run, ["field_weather"], "WEATHER_RAIN"), runSchema), []);
  assert.deepEqual(buildCheck(setIn(run, ["field_weather"], "WEATHER_RAIN"), "res/paperwhite2/entralink/run.schema.json"), { ok: true });
  assert.equal(buildCheck(setIn(run, ["field_weather"], "BTL_WEATHER_RAIN"), "res/paperwhite2/entralink/run.schema.json").ok, false);
});

test("room record ids: rooms/ only, in the schema's order, above every one given, refused past the save's 128", () => {
  const rooms = [{ path: `${ROOMS_DIR}/a.json`, data: newRoomData("A") }, { path: `${ROOMS_DIR}/b.json`, data: setIn(newRoomData("B"), ["progress_id"], 7) },
    { path: "res/paperwhite2/entralink/templates/rest.json", data: newRoomData("Rest") }];
  const given = assignProgressIds(rooms, { next_battle: 0, next_catch: 0, next_room: 2 }, orders);
  const a = given.changed.get(`${ROOMS_DIR}/a.json`)!;
  assert.equal(getIn(a, ["progress_id"]), 8);
  assert.deepEqual([...(a as Map<string, JsonValue>).keys()].slice(1, 4), ["name", "progress_id", "role"]);
  assert.equal(getIn(given.changed.get("res/paperwhite2/entralink/templates/rest.json")!, ["progress_id"]), undefined);
  assert.equal(given.counters.next_room, 9);
  assert.deepEqual(errors(a), []);
  assert.match(assignProgressIds([rooms[0]], { next_battle: 0, next_catch: 0, next_room: 128 }, orders).error ?? "", /128 rooms/);
});
