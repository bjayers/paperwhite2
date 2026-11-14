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
import { lengthOf, render } from "../src/modules/rig/mcss.ts";
import { artBounds, copyPose, dataOf, dropLayer, freshRig, fromDegrees, generateObjs, isBlank, keyPartsAt, keyStartingAt, moveKeys, moveLayer, orderedKey, removeKey, removePicture, resetKey, rigOf, sizeProblem, swapPictureAt, trackSpans, turnKeysAbout, withHiddenPicture } from "../src/modules/rig/model.ts";
import type { Rig } from "../src/modules/rig/mcss.ts";

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

test("Start fresh makes a rig that passes the validator and mcss_rig.check, and draws the art", () => {
  const schema = JSON.parse(readFileSync(SCHEMA, "utf8")) as Schema;
  // A sheet with some art, as a sheet of palette indices
  const sheet = new Uint8Array(256 * 128);
  for (let y = 5; y < 41; y++) for (let x = 12; x < 40; x++) sheet[y * 256 + x] = 3;
  const bounds = artBounds(sheet);
  assert.deepEqual(bounds, [12, 5, 28, 36]);
  // a second piece of art far from the first is left out, and the first is the topmost
  for (let y = 90; y < 100; y++) for (let x = 100; x < 120; x++) sheet[y * 256 + x] = 2;
  assert.deepEqual(artBounds(sheet), bounds);
  const dir = mkdtempSync(join(tmpdir(), "rig-fresh-"));
  try {
    for (const [name, b] of [["art", bounds], ["empty sheet", null], ["wide art", [0, 0, 250, 120]], ["tall art", [200, 3, 30, 100]]] as const) {
      for (const side of ["front", "back"] as const) {
        const rig = freshRig(side, b as [number, number, number, number] | null);
        const data = dataOf(rig, "../battle_sprite_rig.schema.json");
        const text = fileText(data, { width: 120, indent: 2, compact: true });
        const file = join(dir, "front_rig.json");
        writeFileSync(file, text);
        assert.deepEqual(JSON.parse(python("editor/server/python/validate.py", `${file}\t${SCHEMA}\n`)), { ok: true }, name);
        assert.deepEqual(validate(data, schema, new Map()), [], name);
        const check = JSON.parse(python("editor/server/python/rig_check.py", text)) as { errors: string[]; warnings: string[]; sizes: { resident: number } };
        assert.deepEqual(check.errors, [], `${name} ${side}`);
        assert.ok(check.sizes.resident > 0);
        // One picture, one rectangle in the sheet; the stay loop plays; it draws the art
        assert.equal(rig.pictures.length, 1);
        assert.equal(rig.poses[0].parts.length, 1);
        assert.equal(rig.sequences[0].play, "loop");
        const [s, t] = rig.pictures[0].rectangles[0].sheet, [w, h] = rig.pictures[0].rectangles[0].size;
        assert.ok(s + w <= 256 && t + h <= 128 && sizeProblem(w, h) === null, name);
      }
    }
    // It covers the art (the rectangle drawn shows every art pixel)
    const rig = freshRig("front", bounds);
    const frame = render(rig, sheet, 0, 0);
    assert.equal(frame.pixels.filter((p) => p === 3).length, 28 * 36);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hiding a track leaves it undrawn, and nothing else", () => {
  const rig = rigOf(parseJson(read("pichu", "front")));
  const sheet = new Uint8Array(256 * 128).fill(2);
  const all = new Set(rig.tracks.map((_, i) => i));
  assert.equal(render(rig, sheet, 0, 0, undefined, undefined, { hide: all }).pixels.every((p) => p === 0), true);
  const plain = render(rig, sheet, 0, 0);
  const none = render(rig, sheet, 0, 0, plain, undefined, { hide: new Set() });
  assert.deepEqual(none.pixels, plain.pixels);
});

test("the layer list reorders as the timeline does (one shared drop), idle flags following", () => {
  const rig = rigOf(parseJson(read("charizard", "front")));
  const n = rig.poses[0].parts.length;
  assert.ok(n > 3);
  for (const [from, to] of [[3, 0], [0, n - 1], [2, 1]]) {
    const drop = dropLayer(rig, 0, from, to)!;
    assert.deepEqual(drop.rig, moveLayer(rig, 0, from, to));
    assert.equal(drop.selected, to);
    assert.equal(drop.rig.poses[0].parts[to].track, rig.poses[0].parts[from].track);
  }
  assert.equal(dropLayer(rig, 0, 2, 2), null);
});

// ---------------------------------------------------------------- Keys at the playhead, hidden pictures, poses, several parts

/** The build's validator and mcss_rig.check on a rig, both of which must pass. */
function passes(rig: Rig, name: string) {
  const dir = mkdtempSync(join(tmpdir(), "rig-ux-"));
  try {
    const data = dataOf(rig, "../battle_sprite_rig.schema.json");
    const text = fileText(data, { width: 120, indent: 2, compact: true });
    const file = join(dir, "front_rig.json");
    writeFileSync(file, text);
    assert.deepEqual(JSON.parse(python("editor/server/python/validate.py", `${file}\t${SCHEMA}\n`)), { ok: true }, name);
    assert.deepEqual(validate(data, JSON.parse(readFileSync(SCHEMA, "utf8")) as Schema, new Map()), [], name);
    const check = JSON.parse(python("editor/server/python/rig_check.py", text)) as { errors: string[] };
    assert.deepEqual(check.errors, [], name);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const fresh = () => freshRig("front", [8, 8, 32, 32]);

test("Key at playhead splits a held key, selects one already there, and gives an empty track its first key", () => {
  const rig = fresh();
  // the 60-frame key, the playhead at 20: two keys, 20 and 40 frames, the second chosen
  const a = keyPartsAt(rig, 0, 20, 0, [0]);
  assert.deepEqual(a.rig.tracks[0].keys.map((k) => k.frames), [20, 40]);
  assert.deepEqual(a.targets.map((t) => [t.track, t.index, t.created]), [[0, 1, true]]);
  // again at 20: a key begins there, nothing new
  const b = keyPartsAt(a.rig, 0, 20, 0, [0]);
  assert.equal(b.rig, a.rig);
  assert.equal(b.targets[0].created, false);
  assert.equal(b.targets[0].index, 1);
  // at 0 the first key begins already
  assert.equal(keyPartsAt(rig, 0, 0, 0, [0]).targets[0].created, false);
  passes(a.rig, "keyed at 20");
  // an empty track (as an older file or a hand edit may leave one) is given a key
  const made = keyStartingAt({ ...rig.tracks[0], keys: [] }, 0);
  assert.equal(made.keys.length, 1);
  assert.equal(made.index, 0);
  assert.ok(made.keys[0].frames >= 6);
  // a track that plays once, past its end: its last key holds up to the time, then a new key
  const past = keyStartingAt({ ...rig.tracks[0], play: "once" as const }, 100);
  assert.deepEqual(past.keys.map((k) => k.frames), [100, 6]);
});

test("Key all parts keys every part of the pose, a shared track once; a part not playing then is skipped", () => {
  const rig = rigOf(parseJson(read("pichu/form_1", "front")));
  const n = rig.poses[0].parts.length;
  const all = keyPartsAt(rig, 0, 7, 0, Array.from({ length: n }, (_, i) => i));
  assert.equal(all.targets.length, n);
  assert.equal(all.skipped.length, 0);
  // splitting keeps every track's length
  all.rig.tracks.forEach((t, i) => assert.equal(t.keys.reduce((m, k) => m + k.frames, 0), rig.tracks[i].keys.reduce((m, k) => m + k.frames, 0)));
  passes(all.rig, "key all parts");
  // the sequence shows pose 0 only: pose 1 isn't playing
  const two = copyPose(fresh(), 0, 1, true);
  assert.deepEqual(keyPartsAt(two, 0, 5, 1, [0]).skipped, [0]);
});

test("the last key of a track can't be deleted, only reset", () => {
  const rig = fresh();
  const track = { ...rig.tracks[0], key_type: "srt" as const, keys: [{ picture: 0, frames: 60, rotation: 100, scale: [2, 2] as [number, number], move: [3, 4] as [number, number] }] };
  assert.equal(removeKey(track, 0), null);
  assert.deepEqual(resetKey(track.keys[0], "srt"), { picture: 0, frames: 60, rotation: 0, scale: [1, 1], move: [0, 0] });
  const two = { ...track, keys: [...track.keys, { ...track.keys[0] }] };
  assert.equal(removeKey(two, 1)!.length, 1);
});

test("a hidden key shows a blank picture: valid, and the part draws nothing", () => {
  const rig = fresh();
  const sheet = new Uint8Array(256 * 128).fill(3);
  const h = withHiddenPicture(rig);
  assert.equal(h.picture, 1);
  assert.ok(isBlank(h.rig.pictures[1]) && !isBlank(h.rig.pictures[0]));
  // asking again finds the one it made
  assert.equal(withHiddenPicture(h.rig).picture, 1);
  assert.equal(withHiddenPicture(h.rig).rig, h.rig);
  // frames 0-19 show the art, 20-59 hidden
  const split = swapPictureAt(h.rig, 0, 20, h.picture);
  assert.deepEqual(split.rig.tracks[0].keys.map((k) => [k.picture, k.frames]), [[0, 20], [1, 40]]);
  passes(split.rig, "hidden key");
  const shown = render(split.rig, sheet, 0, 10);
  assert.ok(shown.pixels.some((p) => p !== 0));
  assert.ok(render(split.rig, sheet, 0, 30, shown).pixels.every((p) => p === 0));
});

test("a pose copied to another (or made new) keeps the parts, pivots and layers; duplicating gives it tracks of its own", () => {
  const rig = rigOf(parseJson(read("pichu/form_1", "front")));
  const parts = rig.poses[0].parts;
  const shared = copyPose(rig, 0, rig.poses.length, false);
  assert.equal(shared.poses.length, rig.poses.length + 1);
  assert.deepEqual(shared.poses[shared.poses.length - 1].parts, parts);
  assert.equal(shared.tracks.length, rig.tracks.length);
  const dup = copyPose(rig, 0, rig.poses.length, true);
  const newest = dup.poses[dup.poses.length - 1];
  assert.deepEqual(dup.poses[0], rig.poses[0]);
  assert.ok(newest.parts.every((p) => p.track >= rig.tracks.length));
  assert.equal(new Set(dup.tracks.map((t) => t.name)).size, dup.tracks.length);
  newest.parts.forEach((p, k) => {
    assert.deepEqual(dup.tracks[p.track].keys, rig.tracks[parts[k].track].keys);
    assert.deepEqual(p.pivot, parts[k].pivot);
  });
  // editing the copy's track leaves the original's alone
  const edited = { ...dup, tracks: dup.tracks.map((t, i) => (i === newest.parts[0].track ? { ...t, keys: t.keys.slice(0, 1) } : t)) };
  assert.deepEqual(edited.tracks[parts[0].track].keys, rig.tracks[parts[0].track].keys);
  passes(shared, "shared");
  passes(dup, "duplicated");
  const two = copyPose(copyPose(fresh(), 0, 1, true), 0, 1, true);
  assert.equal(two.poses.length, 2);
  passes(two, "copied over");
  assert.throws(() => copyPose(rig, 0, 0, false));
});

test("several parts' keys move together; a group turns about its centre", () => {
  const base = copyPose(fresh(), 0, 1, true);
  const rig: Rig = { ...base, tracks: base.tracks.map((t) => ({ ...t, key_type: "srt" as const, keys: t.keys.map((k) => ({ ...k, rotation: 0, scale: [1, 1] as [number, number], move: [10, 0] as [number, number] })) })) };
  const targets = [{ track: 0, index: 0 }, { track: 1, index: 0 }];
  const moved = moveKeys(rig, targets, [3, -2]);
  assert.equal(moved.left, 0);
  assert.deepEqual(moved.rig.tracks.map((t) => t.keys[0].move), [[13, -2], [13, -2]]);
  // the base is untouched, so a drag's later moves start from it
  assert.deepEqual(rig.tracks[0].keys[0].move, [10, 0]);
  // a plain track's key can't move and is counted
  const plain = { ...rig, tracks: rig.tracks.map((t, i) => (i === 1 ? { ...t, key_type: "plain" as const } : t)) };
  assert.equal(moveKeys(plain, targets, [1, 1]).left, 1);
  // a quarter turn (clockwise on the screen, y down) about the middle of two keys at (-10, 0) and (10, 0): they swing to (0, -10) and (0, 10)
  const turned = turnKeysAbout(rig, [{ track: 0, index: 0, origin: [-10, 0] }, { track: 1, index: 0, origin: [10, 0] }], [0, 0], 90);
  assert.equal(turned.rig.tracks[0].keys[0].rotation, fromDegrees(90));
  assert.deepEqual(turned.rig.tracks[0].keys[0].move, [10 + 10, 0 - 10]);
  assert.deepEqual(turned.rig.tracks[1].keys[0].move, [10 - 10, 0 + 10]);
  passes(turned.rig, "turned together");
});
