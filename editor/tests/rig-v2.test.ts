// The Rig Editor's second version's source and bake (src/modules/rig/v2.ts; rig-editor-v2.md, Built: step 1): the
// default pose at both ends of a sequence and the seam, the snapping rules, the curve presets, connected and offset
// parents against the analytic places, loop clips merged into a part's keys, blocks sharing a sequence, the pause and
// the keeps-moving parts, the shear warning, hidden keys, vanilla sprites converted and baked back byte for byte, the
// source and the baked rig through the build's validators and mcss_rig.check, the size estimate, and the editor's
// drawing of a baked rig against mcss.render. Reads res/, writes temporary files only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { detectLayout, fileText, fromPlain, getIn, parseJson, type Layout } from "../shared/json.ts";
import { validate, type Schema } from "../shared/schema.ts";
import { readIndexedPng } from "../src/modules/palettes/png.ts";
import { eased, type Curve } from "../src/modules/rig/armature.ts";
import { lengthOf, render, type Pair, type Rig, type Track } from "../src/modules/rig/mcss.ts";
import { dataOf, isBlank, rigOf } from "../src/modules/rig/model.ts";
import { rigSizes } from "../src/modules/rig/sizes.ts";
import { bakedFrames, bakedPoint, bakeV2, convertToV2, snapFrame, snapLength, turnOf, type V2, type V2Bone, type V2Key, type V2Sequence } from "../src/modules/rig/v2.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const V2_SCHEMA = join(ROOT, "res/pokemon/battle_sprite_rig_v2.schema.json");
const RIG_SCHEMA = join(ROOT, "res/pokemon/battle_sprite_rig.schema.json");
const COMPACT: Layout = { width: 120, indent: 2, compact: true };
const python = (script: string, input: string, ...args: string[]) =>
  execFileSync("python3", ["-I", join(ROOT, script), ...args], { cwd: ROOT, input, maxBuffer: 256 << 20 }).toString();
const read = (folder: string, side: string) => readFileSync(join(ROOT, "res/pokemon", folder, `${side}_rig.json`), "utf8");
const pichu = rigOf(parseJson(read("pichu", "front")));

/** Pichu's body, head and right ear as a fresh rig: the head the body's child keeping its offset, the ear connected
 * to the head's tail; one sequence of `frames` with the keys given by bone. */
function source(parts: Record<number, V2Key[]> = {}, frames = 24, more: Partial<V2> = {}): V2 {
  const bones: V2Bone[] = [
    { name: "body", head: [4, -15], tail: [0, -18], parent: null, default: { piece: 0 } },
    { name: "head", head: [0, -18], tail: [-3, -23], parent: 0, default: { piece: 1 } },
    { name: "ear", head: [-3, -23], tail: [-6, -40], parent: 1, connected: true, default: { piece: 2 } },
  ];
  return {
    format: 2, side: "front", box: { width: 31, height: 45, x: 4, y: 3 }, stop_flags: 0, pause: true, keeps_moving: [],
    pieces: pichu.pictures.slice(0, 3).map((p, i) => ({ name: ["body", "head", "ear"][i], rectangles: p.rectangles, obj_attribute: p.obj_attribute })),
    bones, layers: [1, 2, 0],
    sequences: [{ name: "Idle", frames, parts: Object.entries(parts).map(([b, keys]) => ({ bone: Number(b), keys })) }],
    timeline: { name: "stay", blocks: [{ sequence: 0 }] },
    ...more,
  };
}

const trackFor = (src: V2, s: number, b: number): Track => {
  const baked = bakeV2(src);
  return baked.rig.tracks[baked.trackOf.get(`${s}/${b}`)!];
};
/** A track's keys as [start frame, frames, move y]. */
const moves = (t: Track) => {
  let at = 0;
  return t.keys.map((k) => { const out = [at, k.frames, k.move?.[1] ?? 0]; at += k.frames; return out; });
};

test("the default pose: an empty sequence holds it; a middle key blends default -> key -> default; the seam", () => {
  // No keys: one key of the whole length, the default pose
  const empty = trackFor(source(), 0, 0);
  assert.deepEqual(empty.keys, [{ picture: 0, frames: 24 }]);
  assert.equal(empty.key_type, "plain");
  // One key at 12 (eased in and out, the default curve): 0, -6, -12, -6, held 6 frames each; frame 24 is the loop's 0
  const hop = trackFor(source({ 0: [{ frame: 12, move: [0, -12] }] }), 0, 0);
  assert.deepEqual(moves(hop), [[0, 6, 0], [6, 6, -6], [12, 6, -12], [18, 6, -6]]);
  assert.equal(lengthOf(hop), 24);
  assert.deepEqual(bakedFrames(24), [0, 6, 12, 18]);
  // The default is held once at the seam: the loop's last key isn't the default, its first is
  assert.notEqual(hop.keys.at(-1)!.move?.[1], 0);
  assert.equal(hop.keys[0].move?.[1], 0);
  // Linear to a key at 18 and back: the end (frame 24) is the default again, never baked
  const linear = trackFor(source({ 0: [{ frame: 0, curve: "linear" }, { frame: 18, move: [0, -18], curve: "linear" }] }), 0, 0);
  assert.deepEqual(moves(linear), [[0, 6, 0], [6, 6, -6], [12, 6, -12], [18, 6, -18]]);
  // An explicit end key (shown past the end) is the curve's target and bakes to a key held 0 frames, as the originals' do
  const end = trackFor(source({ 0: [{ frame: 0, curve: "linear" }, { frame: 24, move: [0, -24] }] }), 0, 0);
  assert.deepEqual(moves(end), [[0, 6, 0], [6, 6, -6], [12, 6, -12], [18, 6, -18], [24, 0, -24]]);
  // The start can be keyed too, and the loop goes back to it rather than to the default
  const start = trackFor(source({ 0: [{ frame: 0, move: [0, -6], curve: "linear" }, { frame: 12, move: [0, -18], curve: "linear" }] }), 0, 0);
  assert.deepEqual(moves(start), [[0, 6, -6], [6, 6, -12], [12, 6, -18], [18, 6, -12]]);
  // A default pose that isn't the rest: a part with no keys holds it
  const src = source();
  src.bones[0].default = { piece: 0, move: [1, 2], rotation: 90 };
  assert.deepEqual(trackFor(src, 0, 0).keys, [{ picture: 0, frames: 24, rotation: 16384, scale: [1, 1], move: [1, 2] }]);
});

test("snapping: frames and lengths to 6, samples every 6 from the block's start, a key between steps keeps its frame", () => {
  assert.deepEqual([0, 2, 3, 4, 8, 9, 10, -4].map((f) => snapFrame(f)), [0, 0, 6, 6, 6, 12, 12, 0]);
  assert.deepEqual([1, 6, 8, 9, 100].map((f) => snapLength(f)), [6, 6, 6, 12, 102]);
  assert.deepEqual(bakedFrames(30), [0, 6, 12, 18, 24]);
  // A key at 9 (a converted original's, or before snapping) starts a key of its own; the step's samples go on at 12, 18
  const t = trackFor(source({ 0: [{ frame: 0, curve: "linear" }, { frame: 9, move: [0, -9], curve: "linear" }] }), 0, 0);
  assert.deepEqual(moves(t).map(([at]) => at), [0, 6, 9, 12, 18]);
  // A step of 3 for the sequence: samples every 3
  const src = source({ 0: [{ frame: 12, move: [0, -12], curve: "linear" }] });
  src.sequences[0].step = 3;
  assert.deepEqual(moves(trackFor(src, 0, 0)).map(([at]) => at), [0, 3, 6, 9, 12, 15, 18, 21]);
});

test("the curves: each preset's samples, and a preset baked", () => {
  const at = (c: Curve) => [0, 0.25, 0.5, 0.75, 1].map((u) => Math.round(eased(c, u) * 1e4) / 1e4);
  assert.deepEqual(at("constant"), [0, 0, 0, 0, 0]);
  assert.deepEqual(at("linear"), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(at("ease_in"), [0, 0.0761, 0.2929, 0.6173, 1]);
  assert.deepEqual(at("ease_out"), [0, 0.3827, 0.7071, 0.9239, 1]);
  assert.deepEqual(at("ease_in_out"), [0, 0.1464, 0.5, 0.8536, 1]);
  assert.deepEqual(at("snap"), [0, 0.7627, 0.9688, 0.999, 1]);
  assert.deepEqual(at("back"), [0, 0.8174, 1.0877, 1.0641, 1]);
  assert.deepEqual(at("bounce"), [0, 0.4727, 0.7656, 0.9727, 1]);
  assert.deepEqual(at("elastic"), [0, 0.9116, 1.0156, 1.0055, 1]);
  // back overshoots about 10%, elastic swings past and back, bounce never passes the key
  const peak = (c: Curve) => Math.max(...Array.from({ length: 1001 }, (_, i) => eased(c, i / 1000)));
  assert.ok(Math.abs(peak("back") - 1.1) < 0.002);
  assert.ok(peak("elastic") > 1.3);
  assert.ok(peak("bounce") <= 1 + 1e-12);
  // A turn of 60 degrees with back over 24 frames, sampled every 6: past 60 at 12 and 18, then the end key
  const t = trackFor(source({ 0: [{ frame: 0, curve: "back" }, { frame: 24, rotation: 60 }] }), 0, 0);
  const turns = t.keys.map((k) => Math.round(((k.rotation ?? 0) / 65536) * 360 * 100) / 100);
  assert.deepEqual(turns, [0, Math.round(eased("back", 0.25) * 6000) / 100, Math.round(eased("back", 0.5) * 6000) / 100, Math.round(eased("back", 0.75) * 6000) / 100, 60]
    .map((d) => Math.round(((Math.round((d / 360) * 65536) / 65536) * 360) * 100) / 100));
  assert.ok(turns[2] > 60 && turns[3] > 60);
});

test("parenting: a connected child's head follows its parent's tail; one keeping its offset moves in its parent's frame", () => {
  // The head turns 90 degrees (clockwise) about its pivot (0, -18): its tail (-3, -23) goes to (5, -21)
  const src = source({ 1: [{ frame: 0, rotation: 90, curve: "constant" }] });
  const baked = bakeV2(src);
  assert.deepEqual(baked.warnings, []);
  const tail = bakedPoint(baked, src, 0, 1, 0, [-3 - 0, -23 - -18]);
  assert.deepEqual(tail.map((v) => Math.round(v * 1e6) / 1e6), [5, -21]);
  // The ear (connected at the head's tail) has its head there too, and is turned with it
  const ear = bakedPoint(baked, src, 0, 2, 0, [0, 0]);
  assert.deepEqual(ear.map((v) => Math.round(v * 1e6) / 1e6), [5, -21]);
  const earTrack = baked.rig.tracks[baked.trackOf.get("0/2")!];
  assert.equal(earTrack.keys[0].rotation, 16384);
  // The ear's own move is locked (connected): a key moving it changes nothing
  const locked = bakeV2(source({ 2: [{ frame: 0, move: [5, 5], curve: "constant" }] }));
  assert.deepEqual(locked.rig.tracks[locked.trackOf.get("0/2")!].keys, [{ picture: 2, frames: 24 }]);
  // Unconnected (keeping its offset), the same move is the head's frame's: turned 90 degrees with it
  const offset = source({ 1: [{ frame: 0, rotation: 90, curve: "constant" }], 2: [{ frame: 0, move: [4, 0], curve: "constant" }] });
  offset.bones[2].connected = false;
  const b = bakeV2(offset);
  // (4, 0) in the head's frame turned clockwise 90 degrees on the screen (y down) is (0, 4)
  const moved = bakedPoint(b, offset, 0, 2, 0, [0, 0]);
  assert.deepEqual(moved.map((v) => Math.round(v * 1e6) / 1e6), [5 + 0, -21 + 4]);
  // A body's move carries both children by as much
  const hop = source({ 0: [{ frame: 0, move: [0, -10], curve: "constant" }] });
  const h = bakeV2(hop);
  assert.deepEqual(bakedPoint(h, hop, 0, 2, 0, [0, 0]), [-3, -33]);
  assert.deepEqual(bakedPoint(h, hop, 0, 1, 0, [0, 0]), [0, -28]);
});

test("the shear warning: a parent's uneven scale over a turned child; a quarter turn is exact", () => {
  const sheared = source({ 0: [{ frame: 0, scale: [2, 1], curve: "constant" }], 1: [{ frame: 0, rotation: 30, curve: "constant" }] });
  const out = bakeV2(sheared);
  assert.ok(out.warnings.some((w) => w.includes("shear")), out.warnings.join("; "));
  assert.equal(out.shears.get(out.trackOf.get("0/1")!), 1);
  const quarter = source({ 0: [{ frame: 0, scale: [2, 1], curve: "constant" }], 1: [{ frame: 0, rotation: 90, curve: "constant" }] });
  assert.deepEqual(bakeV2(quarter).warnings, []);
});

test("a loop clip merges into its part's keys at its own frames", () => {
  const flicker = { name: "flicker", frames: 12, keys: [{ frame: 0, piece: 0 }, { frame: 4, piece: 1 }, { frame: 8, piece: 2, move: [0, -1] } as V2Key] };
  const src = source({}, 24, { loop_clips: [flicker] });
  src.sequences[0].parts.push({ bone: 0, keys: [], clips: [{ clip: 0 }] });
  const t = trackFor(src, 0, 0);
  assert.deepEqual(t.keys.map((k) => [k.picture, k.frames, k.move?.[1] ?? 0]),
                   [[0, 4, 0], [1, 4, 0], [2, 4, -1], [0, 4, 0], [1, 4, 0], [2, 4, -1]]);
  // Under the part's own movement: the clip's move adds to it, and a clip started 2 frames in
  src.sequences[0].parts[0] = { bone: 0, keys: [{ frame: 0, move: [0, -3], curve: "constant" }], clips: [{ clip: 0, start: 2 }] };
  const u = trackFor(src, 0, 0);
  assert.deepEqual(u.keys.map((k) => [k.picture, k.frames, k.move?.[1] ?? 0]),
                   [[2, 2, -4], [0, 4, -3], [1, 4, -3], [2, 4, -4], [0, 4, -3], [1, 4, -3], [2, 2, -4]]);
  // A clip that doesn't divide the sequence: baked over both (the part's track 48 long), warned of
  const odd = source({}, 24, { loop_clips: [{ ...flicker, frames: 16 }] });
  odd.sequences[0].parts.push({ bone: 0, keys: [], clips: [{ clip: 0 }] });
  const o = bakeV2(odd);
  assert.equal(lengthOf(o.rig.tracks[o.trackOf.get("0/0")!]), 48);
  assert.ok(o.warnings.some((w) => w.includes("48")));
});

test("hidden keys show the blank picture (added once), and a part shows its piece again after", () => {
  const src = source({ 1: [{ frame: 6, hidden: true, curve: "constant" }, { frame: 12, hidden: false, curve: "constant" }] });
  const out = bakeV2(src);
  assert.equal(out.rig.pictures.length, 4);
  assert.ok(isBlank(out.rig.pictures[3]));
  assert.deepEqual(out.rig.tracks[out.trackOf.get("0/1")!].keys.map((k) => [k.picture, k.frames]), [[1, 6], [3, 6], [1, 12]]);
});

test("the timeline: blocks of sequences, one pose and one track per part per sequence, named by sequence", () => {
  const src = source({ 0: [{ frame: 12, move: [0, -12] }] });
  src.sequences.push({ name: "Hop", frames: 36, parts: [{ bone: 1, keys: [{ frame: 18, rotation: 15 }] }] });
  src.timeline.blocks = [{ sequence: 0 }, { sequence: 0 }, { sequence: 1 }, { sequence: 0, frames: 48 }];
  const out = bakeV2(src);
  assert.deepEqual(out.rig.sequences, [{ name: "stay", key_type: "plain", play: "loop",
    keys: [{ pose: 0, frames: 24 }, { pose: 0, frames: 24 }, { pose: 1, frames: 36 }, { pose: 0, frames: 48 }] }]);
  assert.deepEqual(out.rig.tracks.map((t) => [t.name, lengthOf(t)]),
                   [["body_a", 24], ["head_a", 24], ["ear_a", 24], ["body_b", 36], ["head_b", 36], ["ear_b", 36]]);
  // Every pose draws the rig's layers (head, ear, body) at the bones' heads, the ear's at the head's tail
  assert.deepEqual(out.rig.poses.map((p) => p.parts.map((x) => [x.track, x.pivot])),
                   [[[1, [0, -18]], [2, [-3, -23]], [0, [4, -15]]], [[4, [0, -18]], [5, [-3, -23]], [3, [4, -15]]]]);
  // Editing a sequence changes every block that plays it: the same track
  const edited = structuredClone(src);
  edited.sequences[0].parts[0].keys[0].move = [0, -20];
  const again = bakeV2(edited);
  assert.notDeepEqual(again.rig.tracks[0], out.rig.tracks[0]);
  assert.deepEqual(again.rig.sequences, out.rig.sequences);
  // Deterministic: the same source (or its JSON again) bakes to the same rig
  assert.deepEqual(bakeV2(JSON.parse(JSON.stringify(src))).rig, out.rig);
});

test("the pause and the keeps-moving parts: by their place in the rig's layers", () => {
  assert.deepEqual(bakeV2(source({}, 24, { keeps_moving: [2] })).rig.idle_parts, [1]);
  assert.deepEqual(bakeV2(source({}, 24, { keeps_moving: [0, 1] })).rig.idle_parts, [0, 2]);
  assert.deepEqual(bakeV2(source()).rig.idle_parts, []);
  assert.equal(bakeV2(source({}, 24, { pause: false, keeps_moving: [2] })).rig.idle_parts, null);
});

/** A vanilla side converted, written as its file and read back, then baked. */
function convertBack(folder: string, side: string) {
  const text = read(folder, side);
  const data = parseJson(text);
  const rig = rigOf(data);
  const sourceText = fileText(fromPlain({ $schema: "../battle_sprite_rig_v2.schema.json", ...convertToV2(rig) }), COMPACT);
  const src = rigOf(parseJson(sourceText)) as unknown as V2;
  const out = bakeV2(src);
  return { text, data, rig, sourceText, src, out, again: fileText(dataOf(out.rig, getIn(data, ["$schema"])), detectLayout(text, data)!) };
}

test("vanilla sprites converted bake back byte for byte, one set of parts across their actions", () => {
  for (const folder of ["pichu", "budew", "charizard", "kyurem/form_2"]) {
    for (const side of ["front", "back"]) {
      const c = convertBack(folder, side);
      assert.deepEqual(c.out.warnings, [], `${folder} ${side}`);
      assert.equal(c.again, c.text, `${folder} ${side}`);
    }
  }
  // Pichu's head_a and head_b are one part, keyed in two sequences; the tracks' names and order come from the rule
  const p = convertBack("pichu", "front").src;
  assert.deepEqual(p.bones.map((b) => b.name), ["body", "head", "ear_r", "ear_l", "hand_r", "hand_l", "foot_r", "foot_l", "tail"]);
  assert.deepEqual(p.sequences.map((s: V2Sequence) => [s.frames, s.parts.length, s.layers === undefined]), [[120, 9, true], [108, 9, true]]);
  assert.equal(p.track_order, undefined);
  assert.ok(p.sequences.every((s) => s.parts.every((l) => l.name === undefined)));
  assert.deepEqual(p.timeline.blocks, [{ sequence: 0, frames: 240 }, { sequence: 1 }]);
  // Charizard's flame keeps moving through the pause
  const z = convertBack("charizard", "front").src;
  assert.deepEqual(z.keeps_moving.map((b) => z.bones[b].name), ["hi"]);
});

test("a source passes the editor's validator and the build's; a bad curve is refused by both", () => {
  const schema = JSON.parse(readFileSync(V2_SCHEMA, "utf8")) as Schema;
  const fresh = source({ 0: [{ frame: 12, move: [0, -12], curve: "elastic", handles: { move_y: [[-2, 0], [2, 1]] } }] }, 24,
                       { loop_clips: [{ name: "blink", frames: 60, keys: [{ frame: 0, piece: 1 }, { frame: 54, hidden: true }] }] });
  fresh.sequences[0].parts[0].clips = [{ clip: 0 }];
  const dir = mkdtempSync(join(tmpdir(), "rig-v2-"));
  try {
    for (const [name, src] of [["fresh", fresh], ["kyurem", convertBack("kyurem/form_2", "front").src]] as const) {
      const text = fileText(fromPlain({ $schema: "../battle_sprite_rig_v2.schema.json", ...src }), COMPACT);
      assert.deepEqual(validate(parseJson(text), schema, new Map()), [], name);
      const file = join(dir, "front_rig_v2.json");
      writeFileSync(file, text);
      assert.deepEqual(JSON.parse(python("editor/server/python/validate.py", `${file}\t${V2_SCHEMA}\n`)), { ok: true }, name);
      const bad = text.replace(/"curve": "[a-z_]+"/, '"curve": "wobbly"');
      assert.notEqual(bad, text);
      assert.ok(validate(parseJson(bad), schema, new Map()).length > 0);
      writeFileSync(file, bad);
      assert.equal(JSON.parse(python("editor/server/python/validate.py", `${file}\t${V2_SCHEMA}\n`)).ok, false);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A fresh rig with everything: parents, curves, a preset, a clip, two sequences on the timeline, a hidden key. */
function fullSource(): V2 {
  const src = source({
    0: [{ frame: 12, move: [0, -8], curve: "back" }],
    1: [{ frame: 6, rotation: -20 }, { frame: 18, rotation: 15 }],
  }, 24, { keeps_moving: [2], loop_clips: [{ name: "twitch", frames: 8, keys: [{ frame: 0 }, { frame: 4, rotation: 10 }] }] });
  src.sequences[0].parts.push({ bone: 2, keys: [], clips: [{ clip: 0 }] });
  src.sequences.push({ name: "Hop", frames: 36, parts: [
    { bone: 0, keys: [{ frame: 18, move: [0, -14], scale: [1.25, 0.8], curve: "ease_out" }] },
    { bone: 2, keys: [{ frame: 12, hidden: true, curve: "constant" }, { frame: 24, hidden: false }] },
  ] });
  src.timeline.blocks = [{ sequence: 0 }, { sequence: 0 }, { sequence: 1 }, { sequence: 0 }];
  return src;
}

test("a baked rig passes the build's validator and mcss_rig.check, and the size estimate is the writer's", () => {
  const dir = mkdtempSync(join(tmpdir(), "rig-v2-"));
  try {
    for (const rig of [bakeV2(fullSource()).rig, convertBack("kyurem/form_2", "back").out.rig, convertBack("charizard", "front").out.rig, pichu]) {
      const text = fileText(dataOf(rig, "../battle_sprite_rig.schema.json"), COMPACT);
      const file = join(dir, "front_rig.json");
      writeFileSync(file, text);
      assert.deepEqual(JSON.parse(python("editor/server/python/validate.py", `${file}\t${RIG_SCHEMA}\n`)), { ok: true });
      const check = JSON.parse(python("editor/server/python/rig_check.py", text)) as { errors: string[]; warnings: string[]; sizes: Record<string, number> };
      assert.deepEqual(check.errors, []);
      const { animations_compressed: _, ...sizes } = check.sizes;
      assert.deepEqual(rigSizes(rig as Rig), sizes);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the editor draws a baked rig over its timeline as mcss.render does", async () => {
  const rig = bakeV2(fullSource()).rig;
  const png = readFileSync(join(ROOT, "res/pokemon/pichu/front.png"));
  const sheet = (await readIndexedPng(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer)).pixels;
  const total = lengthOf(rig.sequences[0]);
  assert.equal(total, 108);
  const times = [0, 3, 6, 11, 12, 18, 23, 24, 30, 47, 48, 54, 60, 66, 72, 78, 83, 84, 96, 107, 108, 130];
  const frames = JSON.parse(python("editor/tests/mcss_render_rig.py", JSON.stringify(rig), "res/pokemon/pichu/front.png", "front", `0:${times.join(",")}`)) as
    { time: number; width: number; height: number; origin: Pair; pixels: string }[];
  assert.equal(frames.length, times.length);
  let drawn = 0;
  for (const want of frames) {
    const got = render(rig, sheet, 0, want.time);
    assert.deepEqual([got.width, got.height, got.originX, got.originY], [want.width, want.height, ...want.origin], `at ${want.time}: the canvas`);
    const pixels = Buffer.from(want.pixels, "hex");
    let differ = 0;
    for (let i = 0; i < pixels.length; i++) if (pixels[i] !== got.pixels[i]) differ++;
    assert.equal(differ, 0, `at ${want.time}: ${differ} pixels differ`);
    for (const p of pixels) if (p) drawn++;
  }
  assert.ok(drawn > 5000);
  // The hop's top (frame 48 + 18, the body up 14 and stretched) is drawn taller than the rest pose
  assert.ok(frames.find((f) => f.time === 66)!.height > frames.find((f) => f.time === 0)!.height);
  assert.equal(turnOf(-20), 65536 - 3641);
});

test("every <side>_rig_v2.json in res/ bakes to its flat rig exactly (the flat rig is never edited without its source)", () => {
  for (const file of globSync("res/pokemon/**/*_rig_v2.json", { cwd: ROOT })) {
    const src = rigOf(parseJson(readFileSync(join(ROOT, file), "utf8"))) as unknown as V2;
    const text = readFileSync(join(ROOT, file.replace(/_rig_v2\.json$/, "_rig.json")), "utf8");
    const data = parseJson(text);
    assert.equal(fileText(dataOf(bakeV2(src).rig, getIn(data, ["$schema"])), detectLayout(text, data)!), text, file);
    assert.equal(existsSync(join(ROOT, file.replace(/_rig_v2\.json$/, "_rig_source.json"))), false, `${file}: a side has the first armature or this, not both`);
  }
});
