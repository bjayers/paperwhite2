// The Rig Editor's model (src/modules/rig/model.ts): a rig opened and written back unchanged is the file byte for
// byte; an edited key and pivot pass the build's validator, the editor's, and mcss_rig.check (server/python/
// rig_check.py), and read back as edited; the OBJs it makes for a picture are mcss_rig.generate_objs's; and its edits
// that renumber (a picture removed, layers reordered) keep the rig's references right. Reads res/, writes only
// temporary files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectLayout, fileText, fromPlain, getIn, parseJson, setIn } from "../shared/json.ts";
import { validate, type Schema } from "../shared/schema.ts";
import { lengthOf } from "../src/modules/rig/mcss.ts";
import { dataOf, fromDegrees, generateObjs, moveLayer, orderedKey, removePicture, rigOf, sizeProblem, trackSpans } from "../src/modules/rig/model.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCHEMA = join(ROOT, "res/pokemon/battle_sprite_rig.schema.json");
const python = (script: string, input: string, ...args: string[]) =>
  execFileSync("python3", ["-I", join(ROOT, script), ...args], { cwd: ROOT, input, maxBuffer: 64 << 20 }).toString();
const read = (folder: string, side: string) => readFileSync(join(ROOT, "res/pokemon", folder, `${side}_rig.json`), "utf8");

test("a rig opened and written back unchanged is the file, byte for byte", () => {
  for (const [folder, side] of [["pichu", "front"], ["pichu/form_1", "back"], ["charizard", "front"], ["kyurem/form_2", "back"], ["pokestar/prop_c1", "front"]]) {
    const text = read(folder, side);
    const data = parseJson(text);
    const layout = detectLayout(text, data);
    assert.ok(layout, `${folder} ${side}: a layout the editor writes`);
    // Through the editor's rig and back, as a whole-rig edit (replace) writes it
    const again = dataOf(rigOf(data), getIn(data, ["$schema"]));
    assert.equal(fileText(again, layout!), text, `${folder} ${side}`);
  }
});

test("an edited key and pivot pass the build's checks and read back as edited", () => {
  const text = read("pichu/form_1", "front");
  const data = parseJson(text);
  const layout = detectLayout(text, data)!;
  const rig = rigOf(data);
  const ear = rig.tracks.findIndex((t) => t.name === "ear_r_a");
  assert.ok(ear >= 0);
  const key = rig.tracks[ear].keys[3];
  const turned = orderedKey({ ...key, rotation: fromDegrees(-20), move: [1, -2] });
  let edited = setIn(data, ["tracks", ear, "keys", 3], fromPlain(turned));
  const part = rig.poses[0].parts.findIndex((p) => p.track === ear);
  edited = setIn(edited, ["poses", 0, "parts", part, "pivot"], fromPlain([9, -22]));
  const out = fileText(edited, layout);
  assert.notEqual(out, text);
  // Only the two lines changed
  const before = text.split("\n"), after = out.split("\n");
  assert.equal(before.length, after.length);
  assert.equal(before.filter((line, i) => line !== after[i]).length, 2);

  const dir = mkdtempSync(join(tmpdir(), "rig-edit-"));
  try {
    const file = join(dir, "front_rig.json");
    writeFileSync(file, out);
    // The build's validator, as Save runs it
    assert.deepEqual(JSON.parse(python("editor/server/python/validate.py", `${file}\t${SCHEMA}\n`)), { ok: true });
    // The editor's own
    assert.deepEqual(validate(edited, JSON.parse(readFileSync(SCHEMA, "utf8")) as Schema, new Map()), []);
    // The game's limits, and the files' sizes
    const check = JSON.parse(python("editor/server/python/rig_check.py", out)) as { errors: string[]; sizes: { resident: number } };
    assert.deepEqual(check.errors, []);
    assert.ok(check.sizes.resident > 3000 && check.sizes.resident < 40 * 1024);
    // Read back
    const back = rigOf(parseJson(readFileSync(file, "utf8")));
    assert.equal(back.tracks[ear].keys[3].rotation, fromDegrees(-20));
    assert.deepEqual(back.tracks[ear].keys[3].move, [1, -2]);
    assert.deepEqual(back.poses[0].parts[part].pivot, [9, -22]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the checks catch a key the game can't hold", () => {
  const rig = rigOf(parseJson(read("pichu", "front")));
  const bad = { ...rig, tracks: rig.tracks.map((t, i) => (i === 0 ? { ...t, keys: [{ ...t.keys[0], picture: 99 }, ...t.keys.slice(1)] } : t)) };
  const check = JSON.parse(python("editor/server/python/rig_check.py", JSON.stringify(bad))) as { errors: string[]; sizes: unknown };
  assert.ok(check.errors.some((e) => e.includes("picture 99")), check.errors.join("; "));
  assert.equal(check.sizes, null);
});

test("a picture's OBJs are mcss_rig.generate_objs's", () => {
  for (const folder of ["pichu", "charizard", "kyurem/form_2"]) {
    const rig = rigOf(parseJson(read(folder, "front")));
    const want = JSON.parse(execFileSync("python3", ["-I", "-c",
      "import json, sys; sys.path.insert(0, '.'); from tools.paperwhite2 import mcss_rig; "
      + "rig = mcss_rig.read_side(__import__('pathlib').Path(sys.argv[1]), 'front'); "
      + "print(json.dumps([mcss_rig.generate_objs(p) for p in rig['pictures']]))", join(ROOT, "res/pokemon", folder)], { cwd: ROOT }).toString());
    assert.deepEqual(rig.pictures.map(generateObjs), want, folder);
  }
});

test("rectangle sizes: whole tiles that cut into OBJs", () => {
  assert.equal(sizeProblem(24, 16), null);
  assert.equal(sizeProblem(64, 32), null);
  assert.equal(sizeProblem(96, 64), null);
  assert.match(sizeProblem(20, 16)!, /whole tiles/);
  assert.match(sizeProblem(64, 8)!, /OBJ size/);
  assert.match(sizeProblem(72, 16)!, /OBJ size/);
});

test("removing a picture renumbers the keys after it; reordering layers keeps the idle parts with theirs", () => {
  const rig = rigOf(parseJson(read("charizard", "front")));
  const shown = new Set(rig.tracks.flatMap((t) => t.keys.map((k) => k.picture)));
  const unused = rig.pictures.findIndex((_, i) => !shown.has(i));
  const target = unused >= 0 ? unused : rig.pictures.length - 1;
  const fewer = removePicture(rig, target);
  assert.equal(fewer.pictures.length, rig.pictures.length - 1);
  rig.tracks.forEach((t, i) => t.keys.forEach((k, j) => {
    const now = fewer.tracks[i].keys[j].picture!;
    assert.equal(now, k.picture! > target ? k.picture! - 1 : k.picture);
  }));
  // Charizard's front pauses with its flame going on: the idle part follows the flame's layer
  assert.ok(rig.idle_parts?.length);
  const flame = rig.idle_parts![0];
  const moved = moveLayer(rig, 0, flame, 0);
  assert.equal(moved.poses[0].parts[0].track, rig.poses[0].parts[flame].track);
  assert.deepEqual(moved.idle_parts, [0]);
});

test("the timeline lays a track's keys where the game plays them", () => {
  const rig = rigOf(parseJson(read("pichu", "front")));
  const track = rig.tracks[rig.poses[0].parts[0].track];
  const length = lengthOf(track);
  const spans = trackSpans(track, 0, 240, 0);
  assert.equal(spans[0].from, 0);
  // Covers the stretch without gaps, its later passes marked
  const played = spans.filter((s) => s.to > s.from);
  for (let i = 1; i < played.length; i++) assert.equal(played[i].from, played[i - 1].to);
  assert.equal(played.at(-1)!.to, 240);
  assert.ok(played.some((s) => s.pass === 1 && s.from === length));
});
