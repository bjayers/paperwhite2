// The Entree page's room ambients: an ambient NPC with its reaction (behaviour, near, return, far, distance) as the
// editor writes it passes the schema in the editor's check and the build's, reads back, and the checks catch what the
// packer refuses (a fleeing one that returns, a return not farther than its fade, an ambient's keys on another type)
// and warn of an ambient's unused dialogue.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileText, fromPlain, getIn, setIn, type JsonValue } from "../shared/json.ts";
import { validate, type Schema } from "../shared/schema.ts";
import { Python } from "../server/python.ts";
import { AMBIENT_DEFAULTS, LADY_SPRITE, ROOM_SCHEMA, checkRoom, newNpc, newRoomData, npcSprite, readRoom, type Room } from "../src/modules/entree/model.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const constants = new Map(Object.entries(new Python(ROOT).constants()));
const roomSchema = JSON.parse(readFileSync(join(ROOT, ROOM_SCHEMA), "utf8")) as Schema;
const errors = (d: JsonValue) => validate(d, roomSchema, constants).map((e) => `${e.path.join(".")}: ${e.message}`)
  .filter((e) => !e.endsWith("progress_id is missing"));

function buildCheck(data: JsonValue): { ok: boolean; error?: string } {
  const dir = mkdtempSync(join(tmpdir(), "entree8-"));
  try {
    const file = join(dir, "data.json");
    writeFileSync(file, fileText(data));
    return JSON.parse(execFileSync("python3", ["-I", join(ROOT, "editor/server/python/validate.py")], { cwd: ROOT, input: `${file}\t${join(ROOT, ROOM_SCHEMA)}\n` }).toString());
  } finally {
    rmSync(dir, { recursive: true });
  }
}

const ambients = [
  { type: "ambient", x: 4, z: 4, facing: "DIR_DOWN", sprite: "OBJ_CODE_POKEMON_DARKRAI" },
  { type: "ambient", x: 6, z: 4, facing: "DIR_DOWN", sprite: "OBJ_CODE_POKEMON_DARKRAI", near: 2, return: true, far: 7 },
  { type: "ambient", x: 8, z: 4, facing: "DIR_LEFT", sprite: "OBJ_CODE_POKEMON_DARKRAI", behaviour: "flee", distance: 5, chance: 50 },
];

test("ambients: valid in both checks, read back with their reactions, the Lady by default", () => {
  const base = setIn(newRoomData("Decoys"), ["battles", 0, "progress_id"], 0);
  const data = setIn(base, ["npcs"], [...(getIn(base, ["npcs"]) as JsonValue[]), ...ambients.map((a) => fromPlain(a))]);
  assert.deepEqual(errors(data), []);
  assert.deepEqual(buildCheck(data), { ok: true });
  const room = readRoom(data);
  const read = room.npcs.filter((n) => n.type === "ambient");
  assert.deepEqual(read.map((n) => [n.behaviour ?? AMBIENT_DEFAULTS.behaviour, n.near ?? AMBIENT_DEFAULTS.near, !!n.return, n.far, n.distance]),
    [["fade", 3, false, undefined, undefined], ["fade", 2, true, 7, undefined], ["flee", 3, false, undefined, 5]]);
  assert.deepEqual(checkRoom(room, constants).filter((p) => p.severity === "error"), []);
  const plain = readRoom(setIn(base, ["npcs"], [newNpc("ambient", 3, 3, room)]));
  assert.equal(npcSprite(plain.npcs[0], plain, constants), LADY_SPRITE);
  // A bad behaviour or distance is the schema's
  assert.ok(errors(setIn(data, ["npcs", 1, "behaviour"], "hide")).length > 0);
  assert.ok(errors(setIn(data, ["npcs", 1, "near"], 0)).length > 0);
});

test("ambients: the checks refuse what the packer refuses, and warn of unused dialogue", () => {
  const room = readRoom(setIn(newRoomData("Decoys"), ["npcs"], ambients.map((a) => fromPlain(a))));
  const messages = (r: Room) => checkRoom(r, constants).map((p) => `${p.severity}: ${p.message}`);
  const with_ = (i: number, change: Partial<Room["npcs"][number]>): Room => ({ ...room, npcs: room.npcs.map((n, k) => (k === i ? { ...n, ...change } : n)) });
  assert.ok(messages(with_(2, { return: true })).some((m) => m.startsWith("error") && m.includes("only a fading ambient comes back")));
  assert.ok(messages(with_(1, { far: 2 })).some((m) => m.startsWith("error") && m.includes("isn't farther")));
  assert.ok(messages(with_(0, { type: "rest", near: 2 })).some((m) => m.startsWith("error") && m.includes("isn't an ambient")));
  assert.ok(messages(with_(0, { dialogue: { before: "Boo" } })).some((m) => m.startsWith("warning") && m.includes("says nothing")));
  // One on the arrival tile is an error, as any NPC's
  assert.ok(messages(with_(0, { x: 15, z: 23 })).some((m) => m.includes("where the player arrives")));
});
