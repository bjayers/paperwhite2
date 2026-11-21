// The Entree page's rooms (src/modules/entree/model.ts): each room file is written back as it was and passes the
// schema in the editor's check and the build's; an edit saves and reads back; the checks find a battle NPC naming no
// battle, a battle no NPC starts, too many enemies for a format, NPCs on exits, blocked tiles or the arrival tile, and,
// over all the rooms, the run's draw (runProblems, as the build's check); the clearings all have the same exits.
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
  EXIT_SCRIPTS, ROOMS_DIR, ROOM_SCHEMA, assignProgressIds, checkRoom, checkRooms, freeId, idFromName, newNpc, newRoomData, npcSprite, readRoom,
  readRun, roundSummary, runProblems, type Exit, type MapInfo, type Room,
  DEFAULT_MARKER_SPOTS, DOORS, MARKER_TYPES, ROLE_MARKERS,
} from "../src/modules/entree/model.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const constants = new Map(Object.entries(new Python(ROOT).constants()));
const schema = JSON.parse(readFileSync(join(ROOT, ROOM_SCHEMA), "utf8")) as Schema;
const files = globSync(`${ROOMS_DIR}/*.json`, { cwd: ROOT }).sort();
const orders = { battle: Object.keys(schema.$defs!.battle.properties!), enemy: Object.keys(schema.$defs!.enemy.properties!) };
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

test("the real rooms are written back as they are, and valid", () => {
  // (the user's own rooms: whatever is there, each written back unchanged and passing the build's validator; what the
  // panel's checks say of a room in progress (a battle short of enemies) is the user's to settle, so it isn't asserted
  // here: the checks' messages are the fixtures' tests, below and in entree-step6.test.ts)
  assert.ok(files.length > 0);
  const errorsOf = (problems: { severity: string; message: string }[]) => problems.filter((p) => p.severity === "error").map((p) => p.message);
  for (const file of files) {
    const text = readFileSync(join(ROOT, file), "utf8");
    const data = parseJson(text);
    const layout = detectLayout(text, data);
    assert.ok(layout, file);
    assert.equal(fileText(data, layout), text, file);
    assert.deepEqual(errors(data), [], file);
    assert.deepEqual(buildCheck(join(ROOT, file)), { ok: true }, file);
    checkRoom(readRoom(data), constants, clearings());
  }
  const rooms = files.map((f) => ({ id: f.replace(/^.*\//, "").replace(/\.json$/, ""), room: readRoom(parseJson(readFileSync(join(ROOT, f), "utf8"))) }));
  assert.equal(rooms.filter((r) => r.room.role === "final").length, 1);
  assert.deepEqual(checkRooms(rooms), []);
  const run = readRun(parseJson(readFileSync(join(ROOT, "res/paperwhite2/entralink/run.json"), "utf8")));
  assert.deepEqual(errorsOf(runProblems(run, rooms)), []);
  assert.match(roundSummary(rooms, 1, run.rounds[0], false), /^Round 1: /);
});


test("a new room, edited, saves in the data tools' layout and passes the build's check", () => {
  let data = newRoomData("Kyogre and Groudon");
  // A new battle's progress id comes on save
  assert.deepEqual(errors(data), ["battles.0: progress_id is missing"]);
  data = setIn(data, ["rounds"], [2, 3]);
  data = setIn(data, ["battles", 0], fromPlain({ id: "weather_trio", format: "double", enemies: [
    { species: "SPECIES_KYOGRE", level: 75, moves: ["MOVE_WATER_SPOUT", "MOVE_ICE_BEAM"] }, { species: "SPECIES_GROUDON", shiny: true }] }));
  data = setIn(data, ["npcs", 0, "battle"], "weather_trio");
  data = setIn(data, ["npcs", 1], fromPlain({ type: "battle", battle: "weather_trio", enemy: 1, x: 17, z: 14, facing: "DIR_DOWN" }));
  data = setIn(data, ["npcs", 2], fromPlain({ type: "item", item: "ITEM_POTION", count: 2, chance: 50, x: 12, z: 18, facing: "DIR_DOWN" }));
  data = setIn(data, ["npcs", 3], fromPlain({ type: "rest", sprite: "OBJ_CODE_LADY", requires: ["dialga/dialga", "run/completed"], x: 20, z: 18, facing: "DIR_LEFT" }));
  data = assignProgressIds([{ path: "x", data }], { next_battle: 4, next_catch: 0 }, orders).changed.get("x")!;
  assert.deepEqual(errors(data), []);
  const room = readRoom(data);
  assert.deepEqual(checkRoom(room, constants, clearings()), []);
  // Each battle NPC shows its own enemy; the item NPC the item ball
  assert.equal(npcSprite(room.npcs[0], room, constants), "OBJ_CODE_POKEMON_KYOGRE");
  assert.equal(npcSprite(room.npcs[1], room, constants), "OBJ_CODE_POKEMON_GROUDON");
  assert.equal(npcSprite(room.npcs[2], room, constants), "OBJ_CODE_110");
  // As the packer's walking_sprite: the hack's own walking sprites (no row in the game's walking table), a form's,
  // a sex's, and a form without its own shows its species'
  const codes = new Map([["OBJ_CODE_POKEMON_NEWMON", 0x4015], ["OBJ_CODE_POKEMON_FORMED", 1], ["OBJ_CODE_POKEMON_FORMED_FORM_1", 2],
    ["OBJ_CODE_POKEMON_SEXED_MALE", 3], ["OBJ_CODE_POKEMON_SEXED_FEMALE", 4]]);
  const shows = (enemy: Room["battles"][number]["enemies"][number]) =>
    npcSprite(room.npcs[0], { ...room, battles: [{ ...room.battles[0], enemies: [enemy] }] }, codes);
  assert.equal(shows({ species: "SPECIES_NEWMON" }), "OBJ_CODE_POKEMON_NEWMON");
  assert.equal(shows({ species: "SPECIES_FORMED", form: 1 }), "OBJ_CODE_POKEMON_FORMED_FORM_1");
  assert.equal(shows({ species: "SPECIES_FORMED", form: 2 }), "OBJ_CODE_POKEMON_FORMED");
  assert.equal(shows({ species: "SPECIES_SEXED" }), "OBJ_CODE_POKEMON_SEXED_MALE");
  assert.equal(shows({ species: "SPECIES_SEXED", gender: "female" }), "OBJ_CODE_POKEMON_SEXED_FEMALE");
  assert.equal(shows({ species: "SPECIES_NONE" }), null);
  // As the packer's follower_sprite: a species without a walking sprite shows its follower, the female's where it has
  // the row, a form's, and the female's alone for a species that is always female; the walking one comes first
  const followers = new Map([...codes, ["OBJ_CODE_FOLLOWER_UNOVAN", 0x3100], ["OBJ_CODE_FOLLOWER_UNOVAN_FEMALE", 0x3102],
    ["OBJ_CODE_FOLLOWER_UNOVAN_FORM_1", 0x3104], ["OBJ_CODE_FOLLOWER_LADYLIKE_FEMALE", 0x3110], ["OBJ_CODE_FOLLOWER_NEWMON", 0x3120]]);
  const showsFollower = (enemy: Room["battles"][number]["enemies"][number]) =>
    npcSprite(room.npcs[0], { ...room, battles: [{ ...room.battles[0], enemies: [enemy] }] }, followers);
  assert.equal(showsFollower({ species: "SPECIES_UNOVAN" }), "OBJ_CODE_FOLLOWER_UNOVAN");
  assert.equal(showsFollower({ species: "SPECIES_UNOVAN", gender: "female" }), "OBJ_CODE_FOLLOWER_UNOVAN_FEMALE");
  assert.equal(showsFollower({ species: "SPECIES_UNOVAN", form: 1, gender: "female" }), "OBJ_CODE_FOLLOWER_UNOVAN_FORM_1");
  assert.equal(showsFollower({ species: "SPECIES_UNOVAN", form: 2 }), "OBJ_CODE_FOLLOWER_UNOVAN");
  assert.equal(showsFollower({ species: "SPECIES_LADYLIKE" }), "OBJ_CODE_FOLLOWER_LADYLIKE_FEMALE");
  assert.equal(showsFollower({ species: "SPECIES_NEWMON" }), "OBJ_CODE_POKEMON_NEWMON");
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
  // Too few: a double or triple takes exactly its places' enemies
  assert.deepEqual(messages({ ...base, battles: [{ id: "battle", format: "triple", enemies: [mon] }] }), [
    "error: Battle \"battle\" has one enemy; a triple battle takes 3.",
  ]);
  assert.deepEqual(messages({ ...base, battles: [{ id: "battle", format: "double", enemies: [mon, mon] }] }), []);
  // On an exit, on the arrival tile, on a blocked tile, two on one tile
  const at = (x: number, z: number) => ({ ...base.npcs[0], x, z });
  assert.deepEqual(messages({ ...base, npcs: [at(16, 9), at(15, 23), at(3, 3), at(3, 3)] }, [[3, 3]]).filter((m) => !m.includes("may all")), [
    "error: NPC 1 (battle) stands on the up exit (16, 9), in 7 clearing(s).",
    "error: NPC 2 (battle) stands where the player arrives (15, 23).",
    "warning: NPC 3 (battle) stands on a blocked tile (3, 3) in every clearing.",
    "error: NPC 4 (battle) stands on the same tile as NPC 3 (3, 3).",
    "warning: NPC 4 (battle) stands on a blocked tile (3, 3) in every clearing.",
  ]);
  // A rest NPC with no sprite shows the Lady (step 6); an item NPC with no item
  assert.deepEqual(messages({ ...base, npcs: [base.npcs[0], { type: "rest", x: 10, z: 10, facing: "DIR_DOWN", requires: [] }, { type: "item", x: 11, z: 10, facing: "DIR_DOWN", requires: [] }] }), [
    "error: NPC 3 (item) gives no item: choose one.",
  ]);
  // A species with no walking or follower sprite needs one of its own
  const npc = { ...base.npcs[0] };
  const unsprited = { ...base, battles: [{ id: "battle", format: "single" as const, enemies: [{ species: "SPECIES_NONE" }] }], npcs: [npc] };
  assert.match(messages(unsprited)[0], /has no walking or follower sprite/);
  assert.deepEqual(messages({ ...unsprited, npcs: [{ ...npc, sprite: "OBJ_CODE_LADY" }] }), []);
  // Over all rooms: the run's draw, as the build checks it
  const run = { rounds: [{ rooms: 2, boss: true }, { rooms: 1, boss: true }, { rooms: 1, boss: false }], roomMaps: [] };
  const messagesOf = (rooms: { id: string; room: Room }[], r = run) => runProblems(r, rooms).map((p) => `${p.severity}: ${p.message}`);
  assert.deepEqual(messagesOf([{ id: "a", room: { ...base, rounds: [1] } }]), [
    "error: No room is the final room, which every run ends with.",
    "warning: Round 1 draws 2 rooms, but only a can come up in it: it comes up each time, twice in a row.",
    "error: Round 1 ends with a boss, but no boss room can come up in it (role boss, kept to it or to no round).",
    "error: Round 2 draws 1 room, but no room can come up in it (role room, any round or round 2).",
    "error: Round 2 ends with a boss, but no boss room can come up in it (role boss, kept to it or to no round).",
    "error: Round 3 draws 1 room, but no room can come up in it (role room, any round or round 3).",
    "warning: The rounds draw 2 rooms from 1, so rooms come up more than once in a run (the least used first, never twice in a row).",
  ]);
  const full = [{ id: "a", room: base }, { id: "a2", room: base }, { id: "b", room: { ...base, role: "boss" as const } }, { id: "c", room: { ...base, role: "final" as const } }];
  assert.deepEqual(messagesOf(full), [
    "warning: The rounds draw 4 rooms from 2, so rooms come up more than once in a run (the least used first, never twice in a row).",
    "warning: The run has 2 bosses from 1 boss room, so a boss comes up twice.",
  ]);
  // A boss kept to round 1 ends it; round 2 has none of its own, so it takes the generic one
  const kept = [...full, { id: "k", room: { ...base, role: "boss" as const, rounds: [1 as const] } }];
  assert.deepEqual(messagesOf(kept, { ...run, rounds: [{ rooms: 1, boss: true }, { rooms: 1, boss: true }] }), []);
  assert.deepEqual(messagesOf(full, { ...run, rounds: [{ rooms: 1, boss: false }, { rooms: 1, boss: false }, { rooms: 0, boss: true }] }),
    ["error: Round 3 can't end with a boss: the final room ends it."]);
  assert.deepEqual(checkRooms(full), []);
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

test("a message's window style is read, written in the schema's order and valid", () => {
  let data = newRoomData("Styles");
  data = setIn(data, ["npcs", 0, "dialogue"], fromPlain({ before: "Halt!", after: "Well fought.", before_style: "yell", after_style: "event" }));
  assert.deepEqual(readRoom(data).npcs[0].dialogue, { before: "Halt!", after: "Well fought.", beforeStyle: "yell", afterStyle: "event" });
  const real = (d: JsonValue) => errors(d).filter((e) => !e.endsWith("progress_id is missing"));
  assert.deepEqual(real(data), []);
  assert.equal(real(setIn(data, ["npcs", 0, "dialogue", "before_style"], "whisper")).length, 1);
});

test("markers: a room's and an NPC's are read and valid, the run's spots and fogs read, NPCs on a spot warned", () => {
  let data = newRoomData("Markers");
  data = setIn(data, ["marker"], "gift");
  data = setIn(data, ["npcs", 0, "marker"], "rest");
  const room = readRoom(data);
  assert.equal(room.marker, "gift");
  assert.equal(room.npcs[0].marker, "rest");
  const real = (d: JsonValue) => errors(d).filter((e) => !e.endsWith("progress_id is missing"));
  assert.deepEqual(real(data), []);
  // catch is the game's, never set by hand
  assert.equal(real(setIn(data, ["marker"], "catch")).length, 1);
  assert.ok(!(MARKER_TYPES as readonly string[]).includes("catch"));
  assert.deepEqual(ROLE_MARKERS, { room: "enemy", boss: "boss", final: "final" });
  // Every marker type and every NPC marker named has its art
  for (const m of MARKER_TYPES) readFileSync(join(ROOT, "res/paperwhite2/entralink/markers", `${m}.png`));
  readFileSync(join(ROOT, "res/paperwhite2/entralink/markers/catch.png"));
  // The real run: three fogs, spots, the chance
  const run = readRun(parseJson(readFileSync(join(ROOT, "res/paperwhite2/entralink/run.json"), "utf8")));
  assert.deepEqual(run.rounds.map((r) => r.fieldWeather), ["WEATHER_CUSTOM_TINT_9", "WEATHER_CUSTOM_TINT_8", "WEATHER_CUSTOM_TINT_7"]);
  assert.deepEqual(run.markerSpots, DEFAULT_MARKER_SPOTS);
  assert.equal(run.unknownChance, 5);
  assert.deepEqual(readRun(fromPlain({ rounds: [] })).markerSpots, DEFAULT_MARKER_SPOTS);
  // An NPC on a marker's spot, and one whose marker has no art
  const npc = { ...room.npcs[0], x: DEFAULT_MARKER_SPOTS.north[0] + 1, z: DEFAULT_MARKER_SPOTS.north[1] + 1, marker: "nothing" };
  const found = checkRoom({ ...room, npcs: [npc] }, constants, [], undefined, { spots: DEFAULT_MARKER_SPOTS, npcMarkers: new Set(["rest"]) })
    .map((p) => `${p.severity}: ${p.message}`);
  assert.ok(found.some((m) => m.startsWith("warning:") && m.includes("north door's marker")), found.join("; "));
  assert.ok(found.some((m) => m.startsWith("error:") && m.includes("npc_markers/nothing.png")), found.join("; "));
  assert.equal(DOORS.length, 3);
});
