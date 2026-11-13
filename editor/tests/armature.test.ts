// The Rig Editor's armature (src/modules/rig/armature.ts): a flat rig converted to an armature bakes back to its file
// byte for byte; a parent's turn and scale carry its child as the analytic composition says; the curves sample as
// they should; the step and the merging of equal keys; the shear warning; the root into the sequence or the parts; and
// the source file passes both validators. Reads res/, writes only temporary files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { detectLayout, fileText, fromPlain, getIn, parseJson, type Layout } from "../shared/json.ts";
import { validate, type Schema } from "../shared/schema.ts";
import { frameQuads, quadCorners, type Rig } from "../src/modules/rig/mcss.ts";
import { dataOf, rigOf } from "../src/modules/rig/model.ts";
import { bake, channelAt, convertToArmature, keyPoseAt, reparent, type KeyPose, type Source } from "../src/modules/rig/armature.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const SOURCE_SCHEMA = join(ROOT, "res/pokemon/battle_sprite_rig_source.schema.json");
const COMPACT: Layout = { width: 120, indent: 2, compact: true };
const read = (folder: string, side: string) => readFileSync(join(ROOT, "res/pokemon", folder, `${side}_rig.json`), "utf8");

test("convert to armature, then bake: the flat rig again, byte for byte", () => {
  for (const folder of ["pichu", "pichu/form_1", "charizard", "kyurem/form_2"]) {
    for (const side of ["front", "back"]) {
      const text = read(folder, side);
      const data = parseJson(text);
      const rig = rigOf(data);
      // Through the source file's text, as the editor writes and reads it
      const sourceText = fileText(fromPlain({ $schema: "../battle_sprite_rig_source.schema.json", ...convertToArmature(rig) }), COMPACT);
      const source = rigOf(parseJson(sourceText)) as unknown as Source;
      const out = bake(source, rig);
      assert.deepEqual(out.warnings, [], `${folder} ${side}`);
      assert.equal(fileText(dataOf(out.rig, getIn(data, ["$schema"])), detectLayout(text, data)!), text, `${folder} ${side}`);
    }
  }
});

test("a source file passes the editor's validator and the build's", () => {
  const schema = JSON.parse(readFileSync(SOURCE_SCHEMA, "utf8")) as Schema;
  const rig = rigOf(parseJson(read("kyurem/form_2", "front")));
  const source = convertToArmature(rig);
  source.bones[1].parent = 0;
  source.bones[1].keys[0] = { ...source.bones[1].keys[0], curve: "bezier", handles: { move_y: [[-2, 0], [3, 1.5]] }, curves: { rotation: "ease_in_out" } };
  const data = fromPlain({ $schema: "../battle_sprite_rig_source.schema.json", ...source });
  const text = fileText(data, COMPACT);
  assert.deepEqual(validate(parseJson(text), schema, new Map()), []);
  assert.equal(detectLayout(text, parseJson(text))?.indent, 2);
  const dir = mkdtempSync(join(tmpdir(), "rig-source-"));
  try {
    const file = join(dir, "front_rig_source.json");
    writeFileSync(file, text);
    const out = execFileSync("python3", ["-I", join(ROOT, "editor/server/python/validate.py")], { cwd: ROOT, input: `${file}\t${SOURCE_SCHEMA}\n` }).toString();
    assert.deepEqual(JSON.parse(out), { ok: true });
    // A bad curve is caught by both
    const bad = text.replace('"bezier"', '"wobbly"');
    assert.ok(validate(parseJson(bad), schema, new Map()).length > 0);
    writeFileSync(file, bad);
    const refused = JSON.parse(execFileSync("python3", ["-I", join(ROOT, "editor/server/python/validate.py")], { cwd: ROOT, input: `${file}\t${SOURCE_SCHEMA}\n` }).toString());
    assert.equal(refused.ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A small rig: a parent part and a child part, each one 8×8 picture, playing srt tracks of `frames`. */
function twoParts(parentPivot: [number, number], childPivot: [number, number], frames = 24, play: "restart" | "continue" = "restart"): Rig {
  const key = { picture: 0, frames, rotation: 0, scale: [1, 1], move: [0, 0] };
  return {
    format: 1, side: "front", box: { width: 8, height: 8, x: 0, y: 0 }, stop_flags: 0, idle_parts: [],
    pictures: [{ rectangles: [{ sheet: [0, 0], size: [8, 8], at: [-4, 4] }], objs: [], obj_attribute: 0 }],
    tracks: [{ name: "body_a", key_type: "srt", play: "loop", keys: [{ ...key }] }, { name: "head_a", key_type: "srt", play: "loop", keys: [{ ...key }] }],
    poses: [{ parts: [{ track: 1, pivot: childPivot, play }, { track: 0, pivot: parentPivot, play }] }],
    sequences: [{ name: "stay", key_type: "plain", play: "loop", keys: [{ pose: 0, frames }] }],
  } as unknown as Rig;
}

const pose = (frame: number, v: Partial<KeyPose> = {}): KeyPose => ({ frame, picture: 0, move: [0, 0], rotation: 0, scale: [1, 1], ...v });

test("a parent's turn carries its child about the parent's pivot", () => {
  const rig = twoParts([0, -10], [10, -10]);
  const source = convertToArmature(rig);
  source.bones[1].parent = 0;
  source.bones[0].keys = [pose(0, { rotation: 90 })];
  const out = bake(source, rig);
  assert.deepEqual(out.warnings, []);
  // The child's pivot, 10 right of the parent's, turned 90° clockwise about it: 10 below it, at the feet
  const key = out.rig.tracks[1].keys[0];
  assert.equal(key.rotation, 16384);
  assert.deepEqual(key.move, [-10, 10]);
});

test("a parent's turn and even scale bake exactly: the child's corners are the composition's", () => {
  for (const [rotation, scale, childTurn] of [[30, 1, 0], [-45, 1.5, 20], [135, 0.75, -60], [200, -1, 10]]) {
    const rig = twoParts([3, -12], [9, -20]);
    const source = convertToArmature(rig);
    source.bones[1].parent = 0;
    source.bones[0].keys = [pose(0, { rotation, scale: [scale, scale], move: [2, -1] })];
    source.bones[1].keys = [pose(0, { rotation: childTurn })];
    const out = bake(source, rig);
    assert.deepEqual(out.warnings, []);
    // Expected: the unparented child (its own turn) moved by the parent's movement about its pivot
    const alone = convertToArmature(rig);
    alone.bones[0].keys = [pose(0, { rotation, scale: [scale, scale], move: [2, -1] })];
    alone.bones[1].keys = [pose(0, { rotation: childTurn })];
    const unparented = bake(alone, rig).rig;
    const parentQuad = frameQuads(unparented, 0, 0).quads.find((q) => q.part === 1)!;
    const childQuad = frameQuads(unparented, 0, 0).quads.find((q) => q.part === 0)!;
    const [pa, pb, pc, pd, pe, pf] = (() => {
      // The parent's movement about its pivot, y up, from its key's (mcss.ts conventions)
      const angle = (rotation / 360) * 2 * Math.PI, sin = -Math.sin(angle), cos = Math.cos(angle);
      const px = 3, py = 12;
      const a = cos * scale, b = -sin * scale, c = sin * scale, d = cos * scale;
      return [a, b, c, d, px + 2 - (a * px + b * py), py - -1 - (c * px + d * py)];
    })();
    void parentQuad;
    const expected = quadCorners(childQuad).map(([x, y]) => [pa * x + pb * y + pe, pc * x + pd * y + pf]);
    const baked = quadCorners(frameQuads(out.rig, 0, 0).quads.find((q) => q.part === 0)!);
    // Within the half pixel of rounding the child's move to whole pixels
    baked.forEach(([x, y], i) => {
      assert.ok(Math.abs(x - expected[i][0]) <= 0.5 + 1e-9 && Math.abs(y - expected[i][1]) <= 0.5 + 1e-9, `turn ${rotation}, scale ${scale}: corner ${i} ${x},${y} vs ${expected[i]}`);
    });
  }
});

test("curves: constant, linear, eased and Bézier", () => {
  const keys = (curve: KeyPose["curve"], extra: Partial<KeyPose> = {}) => [pose(0, { move: [0, 0], curve, ...extra }), pose(12, { move: [12, 0] })];
  const at = (ks: KeyPose[], t: number) => channelAt(ks, 0, "move_x", t, 24, false);
  assert.equal(at(keys("constant"), 6), 0);
  assert.equal(at(keys("linear"), 6), 6);
  assert.equal(at(keys("linear"), 3), 3);
  assert.ok(Math.abs(at(keys("ease_in"), 6) - 12 * (1 - Math.cos(Math.PI / 4))) < 1e-12);
  assert.ok(Math.abs(at(keys("ease_out"), 6) - 12 * Math.sin(Math.PI / 4)) < 1e-12);
  assert.ok(Math.abs(at(keys("ease_in_out"), 6) - 6) < 1e-12);
  assert.ok(at(keys("ease_in_out"), 3) < 3 && at(keys("ease_in_out"), 9) > 9);
  // Bézier with flat handles (the default): the ends, and symmetric about the middle, slow at both ends
  const b = keys("bezier");
  assert.equal(at(b, 0), 0);
  assert.ok(Math.abs(at(b, 6) - 6) < 1e-6);
  assert.ok(at(b, 2) < 2 && at(b, 10) > 10);
  // A handle that overshoots: the curve goes past the end's value before coming back to it
  const over = [pose(0, { curve: "bezier", handles: { move_x: [[-4, 0], [4, 20]] } }), pose(12, { move: [12, 0], handles: { move_x: [[-4, 10], [4, 0]] } })];
  assert.ok(at(over, 6) > 12);
  assert.ok(Math.abs(at(over, 12) - 12) < 1e-6);
});

test("the bake: keys at the step and at each key pose, equal samples merged, never across a key pose", () => {
  const rig = twoParts([0, -10], [0, -20], 24);
  const source = convertToArmature(rig);
  source.bones[0].keys = [pose(0, { move: [0, 0], curve: "linear" }), pose(12, { move: [12, 0] }), pose(24, { move: [12, 0] })];
  const six = bake(source, rig).rig.tracks[0].keys.map((k) => [k.frames, k.move![0]]);
  assert.deepEqual(six, [[6, 0], [6, 6], [12, 12], [0, 12]]);
  source.step = 3;
  const three = bake(source, rig).rig.tracks[0].keys.map((k) => [k.frames, k.move![0]]);
  assert.deepEqual(three, [[3, 0], [3, 3], [3, 6], [3, 9], [12, 12], [0, 12]]);
  // Per sequence: the stay loop's step
  source.step = 6;
  source.sequences[0].step = 2;
  assert.equal(bake(source, rig).rig.tracks[0].keys.length, 8);
  // Two key poses with equal values stay two keys (as Game Freak's originals hold them)
  source.sequences[0].step = undefined;
  source.bones[0].keys = [pose(0, { move: [1, 0] }), pose(6, { move: [1, 0] })];
  assert.deepEqual(bake(source, rig).rig.tracks[0].keys.map((k) => k.frames), [6, 18]);
  // A key type the values need: a move track turned becomes srt; a plain one moved becomes move
  const flat = { ...rig, tracks: rig.tracks.map((t) => ({ ...t, key_type: "plain" as const, keys: [{ picture: 0, frames: 24 }] })) };
  const plain = convertToArmature(flat);
  assert.equal(bake(plain, flat).rig.tracks[0].key_type, "plain");
  plain.bones[0].keys = [{ frame: 0, picture: 0, move: [0, 2] }];
  assert.deepEqual(bake(plain, flat).rig.tracks[0].keys, [{ picture: 0, frames: 24, move: [0, 2] }]);
});

test("a picture swap stays held, at its own frame between steps", () => {
  const rig = twoParts([0, -10], [0, -20], 24);
  const source = convertToArmature(rig);
  source.bones[0].keys = [pose(0, { curve: "linear" }), pose(9, { picture: 0, move: [9, 0], curve: "linear" }), pose(24)];
  const keys = bake(source, rig).rig.tracks[0].keys;
  assert.deepEqual(keys.map((k) => k.frames), [6, 3, 3, 6, 6, 0]);
});

test("a parent's uneven scale over a turned child is warned of as a shear", () => {
  const rig = twoParts([0, -10], [10, -10]);
  const source = convertToArmature(rig);
  source.bones[1].parent = 0;
  source.bones[0].keys = [pose(0, { scale: [2, 1] })];
  source.bones[1].keys = [pose(0, { rotation: 45 })];
  const out = bake(source, rig);
  assert.equal(out.shears.get(1), 1); // one baked key (four equal samples merged)
  assert.ok(out.warnings.some((w) => w.includes("shear")));
  // Unturned, or turned a quarter, the same uneven scale is exact
  source.bones[1].keys = [pose(0, { rotation: 90 })];
  assert.equal(bake(source, rig).shears.size, 0);
});

test("the root: into the sequence's keys over parts that continue, into the parts' tracks over parts that restart", () => {
  const jump = [pose(0, { pose: 0, picture: undefined, curve: "ease_out" }), pose(12, { pose: 0, picture: undefined, move: [0, -12], curve: "ease_in" }), pose(24, { pose: 0, picture: undefined, move: [0, 0] })];
  // Continue: the sequence splits at the step, like Abra's
  const go = twoParts([0, -10], [0, -20], 48, "continue");
  const a = convertToArmature(go);
  a.sequences[0].keys = jump.map((k) => ({ ...k }));
  const ao = bake(a, go).rig;
  assert.equal(ao.sequences[0].key_type, "move");
  assert.deepEqual(ao.sequences[0].keys.map((k) => [k.frames, k.move![1]]), [[6, 0], [6, -8], [6, -12], [6, -8], [24, 0]]);
  assert.deepEqual(ao.tracks, go.tracks);
  // Restart: one sequence key; the parts move instead, and the drawn sprite is the same
  const re = twoParts([0, -10], [0, -20], 48, "restart");
  const b = convertToArmature(re);
  b.sequences[0].keys = jump.map((k) => ({ ...k }));
  const bo = bake(b, re).rig;
  assert.equal(bo.sequences[0].keys.length, 1);
  for (const t of [0, 6, 12, 18, 30]) {
    const one = frameQuads(ao, 0, t).quads.map(quadCorners);
    const two = frameQuads(bo, 0, t).quads.map(quadCorners);
    assert.deepEqual(two, one, `frame ${t}`);
  }
});

test("auto-key: a key pose at the playhead, made with the curve's values there", () => {
  const keys = [pose(0, { curve: "linear" }), pose(12, { move: [12, 0] })];
  const { keys: out, index } = keyPoseAt(keys, 6, 24, true, (k) => ({ ...k, rotation: 30 }));
  assert.equal(index, 1);
  assert.deepEqual(out[1].move, [6, 0]);
  assert.equal(out[1].rotation, 30);
  assert.equal(out[1].curve, "linear");
  const again = keyPoseAt(out, 6, 24, true, (k) => ({ ...k, rotation: 40 }));
  assert.equal(again.keys.length, 3);
  assert.equal(again.keys[1].rotation, 40);
});

test("every armature source in res/ bakes to its flat rig", () => {
  for (const file of globSync("res/pokemon/**/*_rig_source.json", { cwd: ROOT })) {
    const flatFile = file.replace("_rig_source.json", "_rig.json");
    const text = readFileSync(join(ROOT, flatFile), "utf8");
    const data = parseJson(text);
    const source = rigOf(parseJson(readFileSync(join(ROOT, file), "utf8"))) as unknown as Source;
    const out = bake(source, rigOf(data));
    assert.equal(fileText(dataOf(out.rig, getIn(data, ["$schema"])), detectLayout(text, data)!), text, `${flatFile} isn't what ${file} bakes`);
  }
});

test("parenting keeps a part where it is (Keep Transform): Pichu's head to its body and its ears to its head bake to the rig as it was", () => {
  for (const [folder, side] of [["pichu/form_1", "front"], ["pichu", "front"], ["charizard", "front"]]) {
    const text = read(folder, side);
    const data = parseJson(text);
    const rig = rigOf(data);
    const named = (n: string) => rig.tracks.findIndex((t) => t.name === n);
    let source = convertToArmature(rig);
    const body = rig.tracks.findIndex((u) => u.name.startsWith("karada"));
    const pairs: (readonly [number, number])[] = folder === "charizard"
      ? rig.tracks.map((_, i) => [i, body] as const).filter(([i]) => body >= 0 && i !== body).slice(0, 6)
      : (["a", "b"] as const).flatMap((s) => [[named(`head_${s}`), named(`body_${s}`)], [named(`ear_r_${s}`), named(`head_${s}`)], [named(`ear_l_${s}`), named(`head_${s}`)]] as const)
        .filter(([a, b]) => a >= 0 && b >= 0);
    assert.ok(pairs.length >= 3, folder);
    for (const [child, parent] of pairs) source = reparent(source, rig, child, parent);
    const out = bake(source, rig);
    if (folder !== "charizard") {
      // Parents that only move: exact
      assert.equal(fileText(dataOf(out.rig, getIn(data, ["$schema"])), detectLayout(text, data)!), text, `${folder} ${side}`);
      continue;
    }
    // Charizard's body turns: each child is kept within the rounding of its move to whole pixels, every frame
    let worst = 0;
    for (let t = 0; t < 432; t += 3) {
      const a = frameQuads(rig, 0, t).quads, b = frameQuads(out.rig, 0, t).quads;
      a.forEach((q, i) => quadCorners(q).forEach(([x, y], c) => { worst = Math.max(worst, Math.hypot(x - quadCorners(b[i])[c][0], y - quadCorners(b[i])[c][1])); }));
    }
    assert.ok(worst <= Math.SQRT1_2 + 1e-9, `charizard: a corner ${worst} pixels from where it was`);
  }
});

test("parenting under a turning parent keeps the child within rounding, and the child then follows the parent's new moves", () => {
  const rig = twoParts([0, -10], [10, -10], 24);
  let source = convertToArmature(rig);
  source.bones[0].keys = [pose(0, { rotation: 0, curve: "linear" }), pose(12, { rotation: 60 }), pose(24, { rotation: 0 })];
  const before = bake(source, rig).rig;
  source = reparent(source, rig, 1, 0);
  const after = bake(source, rig).rig;
  for (const t of [0, 6, 12, 18]) {
    const a = quadCorners(frameQuads(before, 0, t).quads.find((q) => q.part === 0)!), b = quadCorners(frameQuads(after, 0, t).quads.find((q) => q.part === 0)!);
    a.forEach(([x, y], i) => assert.ok(Math.hypot(x - b[i][0], y - b[i][1]) <= 1.5, `frame ${t}: ${x},${y} vs ${b[i]}`));
  }
  // A move of the parent now carries the child
  source.bones[0].keys = source.bones[0].keys.map((k) => ({ ...k, move: [0, -5] as [number, number] }));
  const moved = bake(source, rig).rig;
  const c0 = quadCorners(frameQuads(after, 0, 0).quads.find((q) => q.part === 0)!)[0];
  const c1 = quadCorners(frameQuads(moved, 0, 0).quads.find((q) => q.part === 0)!)[0];
  assert.deepEqual([c1[0] - c0[0], c1[1] - c0[1]], [0, 5]);
});
