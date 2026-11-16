// The Entree page's rooms (src/modules/entree/model.ts): each room file is written back as it was and passes the
// schema in the editor's check and the build's; an edit saves and reads back; the checks find a battle NPC naming no
// battle, a battle no NPC starts, too many enemies for a format, NPCs on exits, blocked tiles or the arrival tile, and,
// over all the rooms, a missing final room or a round without rooms or a boss; the clearings all have the same exits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { detectLayout, fileText, fromPlain, getIn, parseJson, setIn, type JsonValue } from "../shared/json.ts";
import { validate, type Schema } from "../shared/schema.ts";
import { Python } from "../server/python.ts";
import { removable } from "../server/weather.ts";
import {
  EXIT_SCRIPTS, ROOMS_DIR, ROOM_SCHEMA, checkRoom, checkRooms, freeId, idFromName, newNpc, newRoomData, npcSprite, readRoom,
  type Exit, type MapInfo,
} from "../src/modules/entree/model.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const constants = new Map(Object.entries(new Python(ROOT).constants()));
const schema = JSON.parse(readFileSync(join(ROOT, ROOM_SCHEMA), "utf8")) as Schema;
const files = globSync(`${ROOMS_DIR}/*.json`, { cwd: ROOT }).sort();
const errors = (d: JsonValue) => validate(d, schema, constants).map((e) => `${e.path.join(".")}: ${e.message}`);
const buildCheck = (file: string) =>
  JSON.parse(execFileSync("python3", ["-I", join(ROOT, "editor/server/python/validate.py")], { cwd: ROOT, input: `${file}\t${join(ROOT, ROOM_SCHEMA)}\n` }).toString());

/** The clearings' exits, read from their events as the page reads them; no tile blocked but the ones given. */
function clearings(blocked: [number, number][] = []): MapInfo[] {
  return globSync("res/field/events/entree_forest*.json", { cwd: ROOT }).map((file) => {
    const events = JSON.parse(readFileSync(join(ROOT, file), "utf8")) as { triggers: { script: number; grid: { x: number; z: number; width: number; height: number } }[] };
    const exits: Exit[] = events.triggers.filter((t) => EXIT_SCRIPTS[t.script])
      .map((t) => ({ side: EXIT_SCRIPTS[t.script], x: t.grid.x, z: t.grid.z, width: t.grid.width, depth: t.grid.height }));
    return { zone: `ZONE_${file.replace(/^.*\//, "").replace(/\.json$/, "").toUpperCase()}`, exits, blocked: (x, z) => blocked.some(([bx, bz]) => bx === x && bz === z) };
  });
}

test("the prototype's four challenges are rooms, written back as they are, and valid", () => {
  assert.deepEqual(files.map((f) => f.replace(/^.*\//, "")), ["darkrai.json", "dialga.json", "ho_oh.json", "rayquaza_raid.json"]);
  for (const file of files) {
    const text = readFileSync(join(ROOT, file), "utf8");
    const data = parseJson(text);
    const layout = detectLayout(text, data);
    assert.ok(layout, file);
    assert.equal(fileText(data, layout), text, file);
    assert.deepEqual(errors(data), [], file);
    assert.deepEqual(buildCheck(join(ROOT, file)), { ok: true }, file);
    assert.deepEqual(checkRoom(readRoom(data), constants, clearings()), [], file);
  }
  const rooms = files.map((f) => ({ id: f, room: readRoom(parseJson(readFileSync(join(ROOT, f), "utf8"))) }));
  assert.equal(rooms.filter((r) => r.room.role === "final").length, 1);
  // The prototype has no bosses yet
  assert.deepEqual(checkRooms(rooms), ["Round 1 has no boss to end it.", "Round 2 has no boss to end it."]);
});

test("a new room, edited, saves in the data tools' layout and passes the build's check", () => {
  let data = newRoomData("Kyogre and Groudon");
  assert.deepEqual(errors(data), []);
  data = setIn(data, ["rounds"], [2, 3]);
  data = setIn(data, ["battles", 0], fromPlain({ id: "weather_trio", format: "double", enemies: [
    { species: "SPECIES_KYOGRE", level: 75, moves: ["MOVE_WATER_SPOUT", "MOVE_ICE_BEAM"] }, { species: "SPECIES_GROUDON", shiny: true }] }));
  data = setIn(data, ["npcs", 0, "battle"], "weather_trio");
  data = setIn(data, ["npcs", 1], fromPlain({ type: "battle", battle: "weather_trio", enemy: 1, x: 17, z: 14, facing: "DIR_DOWN" }));
  data = setIn(data, ["npcs", 2], fromPlain({ type: "item", item: "ITEM_POTION", count: 2, chance: 50, x: 12, z: 18, facing: "DIR_DOWN" }));
  data = setIn(data, ["npcs", 3], fromPlain({ type: "rest", sprite: "OBJ_CODE_LADY", flag: "EVENT_FLAG_0x0001", x: 20, z: 18, facing: "DIR_LEFT" }));
  assert.deepEqual(errors(data), []);
  const room = readRoom(data);
  assert.deepEqual(checkRoom(room, constants, clearings()), []);
  // Each battle NPC shows its own enemy; the item NPC the item ball
  assert.equal(npcSprite(room.npcs[0], room, constants), "OBJ_CODE_POKEMON_KYOGRE");
  assert.equal(npcSprite(room.npcs[1], room, constants), "OBJ_CODE_POKEMON_GROUDON");
  assert.equal(npcSprite(room.npcs[2], room, constants), "OBJ_CODE_110");
  const dir = mkdtempSync(join(tmpdir(), "entree-"));
  try {
    const file = join(dir, "room.json");
    const text = fileText(setIn(data, ["$schema"], join(ROOT, ROOM_SCHEMA)));
    writeFileSync(file, text);
    assert.deepEqual(buildCheck(file), { ok: true });
    const back = parseJson(readFileSync(file, "utf8"));
    assert.equal(getIn(back, ["battles", 0, "enemies", 1, "species"]), "SPECIES_GROUDON");
    assert.equal(fileText(back, detectLayout(text, back)!), text);
    // The build refuses what the schema does
    writeFileSync(file, fileText(setIn(data, ["rounds"], [4])));
    assert.equal(buildCheck(file).ok, false);
  } finally {
    rmSync(dir, { recursive: true });
  }
  assert.equal(removable(`${ROOMS_DIR}/kyogre.json`), true);
  assert.equal(removable("res/paperwhite2/entralink/run.json"), false);
});

test("the checks", () => {
  const base = readRoom(newRoomData("Test"));
  const messages = (room: typeof base, blocked: [number, number][] = []) => checkRoom(room, constants, clearings(blocked)).map((p) => `${p.severity}: ${p.message}`);
  // A battle NPC naming a missing battle, and the battle then started by none
  assert.deepEqual(messages({ ...base, npcs: [{ ...base.npcs[0], battle: "nothing" }] }), [
    "warning: No NPC starts battle \"battle\": it can't be fought.",
    "error: NPC 1 (battle) starts battle \"nothing\", which the room doesn't have.",
  ]);
  // Too many enemies for the format, and an NPC showing an enemy past them
  const mon = { species: "SPECIES_PIKACHU" };
  assert.deepEqual(messages({ ...base, battles: [{ id: "battle", format: "raid", enemies: [mon, mon] }], npcs: [{ ...base.npcs[0], enemy: 2 }] }), [
    "error: Battle \"battle\" has 2 enemies; a raid battle takes one.",
    "error: NPC 1 (battle) shows enemy 3, but battle \"battle\" has 2.",
  ]);
  // On an exit, on the arrival tile, on a blocked tile, two on one tile
  const at = (x: number, z: number) => ({ ...base.npcs[0], x, z });
  assert.deepEqual(messages({ ...base, npcs: [at(16, 9), at(15, 23), at(3, 3), at(3, 3)] }, [[3, 3]]).filter((m) => !m.includes("may all")), [
    "error: NPC 1 (battle) stands on the up exit (16, 9), in 6 clearing(s).",
    "error: NPC 2 (battle) stands where the player arrives (15, 23).",
    "warning: NPC 3 (battle) stands on a blocked tile (3, 3) in every clearing.",
    "error: NPC 4 (battle) stands on the same tile as NPC 3 (3, 3).",
    "warning: NPC 4 (battle) stands on a blocked tile (3, 3) in every clearing.",
  ]);
  // A rest NPC with no sprite; an item NPC with no item
  assert.deepEqual(messages({ ...base, npcs: [base.npcs[0], { type: "rest", x: 10, z: 10, facing: "DIR_DOWN" }, { type: "item", x: 11, z: 10, facing: "DIR_DOWN" }] }), [
    "error: NPC 3 (item) gives no item: choose one.",
    "error: NPC 2 (rest) has no sprite: choose one.",
  ].sort((a, b) => (a.includes("NPC 2") ? -1 : b.includes("NPC 2") ? 1 : 0)));
  // A species with no walking sprite needs one of its own
  const npc = { ...base.npcs[0] };
  const unsprited = { ...base, battles: [{ id: "battle", format: "single" as const, enemies: [{ species: "SPECIES_NONE" }] }], npcs: [npc] };
  assert.match(messages(unsprited)[0], /has no walking sprite/);
  assert.deepEqual(messages({ ...unsprited, npcs: [{ ...npc, sprite: "OBJ_CODE_LADY" }] }), []);
  // Over all rooms
  assert.deepEqual(checkRooms([{ id: "a", room: { ...base, rounds: [1] } }]), [
    "No room is the final room: a run has no end.", "Round 1 has no boss to end it.", "Round 2 has no rooms.", "Round 2 has no boss to end it.", "Round 3 has no rooms.",
  ]);
  assert.deepEqual(checkRooms([{ id: "a", room: base }, { id: "b", room: { ...base, role: "boss" } }, { id: "c", room: { ...base, role: "final" } }]), []);
});

test("new NPCs, IDs and the clearings' shared exits", () => {
  const room = readRoom(newRoomData("x"));
  assert.deepEqual(Object.fromEntries(newNpc("item", 3, 4, room)), { type: "item", item: "ITEM_POTION", x: 3, z: 4, facing: "DIR_DOWN" });
  assert.equal(newNpc("battle", 0, 0, room).get("battle"), "battle");
  assert.equal(idFromName("Nightmare Ho-Oh!"), "nightmare_ho_oh");
  assert.equal(freeId("dialga", new Set(["dialga", "dialga_2"])), "dialga_3");
  // Every clearing has its exits (one to four) at the same tiles
  for (const c of clearings()) {
    assert.ok(c.exits.length > 0, c.zone);
    for (const e of c.exits) assert.deepEqual([e.x, e.z], { up: [15, 9], down: [15, 24], left: [5, 15], right: [26, 15] }[e.side], c.zone);
  }
});
