// The new Rig Editor's sequences (src/modules/rig/sequences.ts; rig-editor-v2.md, Built: step 3): the snapping of keys,
// the playhead and the length; an empty sequence holding the default pose; one middle key blending and returning; the
// end key past the end and the seam; keying from the values at a frame; Reset sequence; deleting keys across parts as
// one undo step; a preset curve applied to a key baked as the preset; keying never while the preview plays; the list's
// edits renumbering the timeline; and the preview's frames against mcss.render of the baked rig. Reads res/, writes
// nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseJson, fromPlain, type JsonValue } from "../shared/json.ts";
import { readIndexedPng } from "../src/modules/palettes/png.ts";
import { eased } from "../src/modules/rig/armature.ts";
import { render, type Pair, type Rig, type Track } from "../src/modules/rig/mcss.ts";
import { rigOf } from "../src/modules/rig/model.ts";
import { RigHistory, type HistoryStore } from "../src/modules/rig/history.ts";
import { bakeV2, snapLength, turnOf, type V2, type V2Bone } from "../src/modules/rig/v2.ts";
import { addSequence, copyKeys, deleteKeys, deleteSequence, duplicateSequence, END, keyParts, lastFrame, moveKeys, moveSequence, partValues, pasteKeys,
         pauseForKeying, playheadAt, resetSequence, rowKeys, sequenceRig, setCurve, setKeyAt, snapDelta, START, type KeyClock } from "../src/modules/rig/sequences.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const python = (script: string, input: string, ...args: string[]) =>
  execFileSync("python3", ["-I", join(ROOT, script), ...args], { cwd: ROOT, input, maxBuffer: 256 << 20 }).toString();
const pichu = rigOf(parseJson(readFileSync(join(ROOT, "res/pokemon/pichu/front_rig.json"), "utf8")));

/** Pichu's body, head and ear: the head the body's child, the ear connected to the head's tail; an Idle of 48 frames and
 * a Hop of 36, both on the timeline. */
function source(more: Partial<V2> = {}): V2 {
  const bones: V2Bone[] = [
    { name: "body", head: [4, -15], tail: [0, -18], parent: null, default: { piece: 0 } },
    { name: "head", head: [0, -18], tail: [-3, -23], parent: 0, default: { piece: 1 } },
    { name: "ear", head: [-3, -23], tail: [-6, -40], parent: 1, connected: true, default: { piece: 2 } },
  ];
  return {
    format: 2, side: "front", box: { width: 31, height: 45, x: 4, y: 3 }, stop_flags: 0, pause: true, keeps_moving: [],
    pieces: pichu.pictures.slice(0, 3).map((p, i) => ({ name: ["body", "head", "ear"][i], rectangles: p.rectangles, obj_attribute: p.obj_attribute })),
    bones, layers: [1, 2, 0],
    sequences: [{ name: "Idle", frames: 48, parts: [] }, { name: "Hop", frames: 36, parts: [] }],
    timeline: { name: "stay", blocks: [{ sequence: 0 }, { sequence: 1 }] },
    ...more,
  };
}

const trackOf = (src: V2, s: number, b: number): Track => {
  const baked = bakeV2(src);
  return baked.rig.tracks[baked.trackOf.get(`${s}/${b}`)!];
};
/** A track's keys as [start, frames, rotation in 65536ths]. */
const turns = (t: Track) => {
  let at = 0;
  return t.keys.map((k) => { const out = [at, k.frames, k.rotation ?? 0]; at += k.frames; return out; });
};
const moves = (t: Track) => {
  let at = 0;
  return t.keys.map((k) => { const out = [at, k.frames, k.move?.[1] ?? 0]; at += k.frames; return out; });
};

test("snapping: the playhead, a key's drag and the length go by steps of 6 (Alt: by frames)", () => {
  assert.equal(playheadAt(19, 48, true), 18);
  assert.equal(playheadAt(22, 48, true), 24);
  assert.equal(playheadAt(47, 48, true), 42, "the playhead stops at the last baked frame (48 is the next loop's 0)");
  assert.equal(playheadAt(47, 48, false), 47);
  assert.equal(playheadAt(-5, 48, true), 0);
  assert.equal(lastFrame(48, true), 42);
  assert.equal(snapDelta(8, true), 6);
  assert.equal(snapDelta(10, true), 12);
  assert.equal(snapDelta(8, false), 8);
  assert.equal(snapLength(50), 48);
  assert.equal(snapLength(52), 54);
  assert.equal(snapLength(2), 6);
  // A key dragged 10 frames with the snap goes 12; keys stay inside the loop (the end key at its length)
  let src = setKeyAt(source(), 0, 0, 24, () => ({ move: [0, -8] }));
  const moved = moveKeys(src, 0, [{ bone: 0, index: 0 }], snapDelta(10, true));
  assert.equal(moved.src.sequences[0].parts[0].keys[0].frame, 36);
  src = moveKeys(moved.src, 0, moved.refs, 100).src;
  assert.equal(src.sequences[0].parts[0].keys[0].frame, 48, "clamped at the end key's place");
});

test("an empty sequence holds the default pose; one middle key blends default -> key -> default", () => {
  const src = source();
  src.bones[1].default = { piece: 1, rotation: 5 };
  // Empty: one key per part, the default, held the whole loop
  assert.deepEqual(turns(trackOf(src, 0, 1)), [[0, 48, turnOf(5)]]);
  assert.deepEqual(moves(trackOf(src, 0, 0)), [[0, 48, 0]]);
  assert.deepEqual(rowKeys(src, 0, 1).map((k) => [k.ref.index, k.frame, k.implicit]), [[START, 0, true], [END, 48, true]], "the start and the end key past the end");
  // A key at 24 made by the gizmo: from the values there, then turned
  const keyed = setKeyAt(src, 0, 1, 24, (now) => ({ rotation: now.rotation + 20 }));
  assert.deepEqual(keyed.sequences[0].parts, [{ bone: 1, keys: [{ frame: 24, rotation: 25 }] }]);
  const t = turns(trackOf(keyed, 0, 1));
  const want = [0, 6, 12, 18, 24, 30, 36, 42].map((f) => {
    const u = f <= 24 ? f / 24 : (f - 24) / 24;
    const deg = f <= 24 ? 5 + 20 * eased("ease_in_out", u) : 25 - 20 * eased("ease_in_out", u);
    return [f, 6, turnOf(deg)];
  });
  assert.deepEqual(t, want);
  assert.equal(t.at(-1)![0] + t.at(-1)![1], 48, "the loop is 48 long; the default isn't held twice at the seam");
  // The values at a frame between keys are the curve's (what a new key there starts from)
  assert.ok(Math.abs(partValues(keyed, 0, 1, 12).rotation - 15) < 1e-9);
});

test("the end key past the end: moving or copying it makes a real key of the start's values; the seam stays", () => {
  let src = setKeyAt(source(), 0, 0, 12, () => ({ move: [0, -12] }));
  // The end key (48) moved back to 36: the body is back at the default at 36 and holds it to the loop's end
  src = moveKeys(src, 0, [{ bone: 0, index: END }], -12).src;
  assert.deepEqual(src.sequences[0].parts[0].keys, [{ frame: 12, move: [0, -12] }, { frame: 36 }]);
  assert.deepEqual(moves(trackOf(src, 0, 0)), [[0, 6, 0], [6, 6, -6], [12, 6, -12], [18, 6, -10], [24, 6, -6], [30, 6, -2], [36, 12, 0]]);
  // The implicit end stays (the start again at 48, never baked)
  assert.ok(rowKeys(src, 0, 0).some((k) => k.ref.index === END && k.implicit && k.frame === 48));
  // A start keyed with a move: the end key copied is the start's values
  let s2 = setKeyAt(source(), 0, 0, 0, () => ({ move: [0, -4] }));
  s2 = setKeyAt(s2, 0, 0, 24, () => ({ move: [0, -10] }));
  const copied = copyKeys(s2, 0, [{ bone: 0, index: END }]);
  assert.deepEqual(copied.keys, [{ bone: 0, offset: 0, key: { move: [0, -4] } }]);
  s2 = pasteKeys(s2, 0, copied, 42).src;
  assert.deepEqual(s2.sequences[0].parts[0].keys.map((k) => [k.frame, k.move]), [[0, [0, -4]], [24, [0, -10]], [42, [0, -4]]]);
  // An explicit end key at the length is the last segment's target and bakes to a key held 0 frames
  const e = setKeyAt(source(), 0, 0, 48, () => ({ move: [0, -6] }));
  const m = moves(trackOf(e, 0, 0));
  assert.deepEqual(m.at(-1), [48, 0, -6]);
  assert.equal(m.reduce((n, k) => n + k[1], 0), 48);
});

test("keying: K keys the chosen parts at a frame from their values; a key already there is kept", () => {
  let src = setKeyAt(source(), 0, 1, 24, () => ({ rotation: 30 }));
  const r = keyParts(src, 0, [0, 1, 2], 12);
  assert.equal(r.made, 3);
  // body and ear at their defaults (absent channels), the head between its default and the key
  assert.deepEqual(r.src.sequences[0].parts.map((l) => [l.bone, l.keys.map((k) => k.frame)]), [[0, [12]], [1, [12, 24]], [2, [12]]]);
  assert.deepEqual(r.src.sequences[0].parts[0].keys[0], { frame: 12 });
  assert.equal(r.src.sequences[0].parts[1].keys[0].rotation, 15);
  // Keying again changes nothing; the frame keyed is drawn as it was (its values are the curve's there)
  const again = keyParts(r.src, 0, [0, 1, 2], 12);
  assert.equal(again.made, 0);
  assert.deepEqual(again.src, r.src);
  assert.equal(turns(trackOf(r.src, 0, 1))[2][2], turns(trackOf(src, 0, 1))[2][2]);
  // A picture and Hidden per key
  src = setKeyAt(source(), 0, 2, 18, () => ({ hidden: true }));
  src = setKeyAt(src, 0, 2, 24, () => ({ hidden: false, piece: 2 }));
  assert.deepEqual(src.sequences[0].parts[0].keys, [{ frame: 18, hidden: true }, { frame: 24, piece: 2 }]);
  const pics = trackOf(src, 0, 2).keys.map((k) => k.picture);
  assert.equal(pics.length, 3);
  assert.equal(pics[0], 2);
  assert.equal(pics[2], 2);
  assert.notEqual(pics[1], 2);
});

test("Reset sequence: the default pose with no keys, touching nothing else", () => {
  let src = setKeyAt(source(), 0, 0, 24, () => ({ move: [0, -8] }));
  src = setKeyAt(src, 0, 1, 12, () => ({ rotation: 10 }));
  src = setKeyAt(src, 1, 0, 18, () => ({ move: [0, -20] }));
  const reset = resetSequence(src, 0);
  assert.deepEqual(reset.sequences[0], { name: "Idle", frames: 48, parts: [] });
  assert.deepEqual(reset.sequences[1], src.sequences[1]);
  assert.deepEqual({ ...reset, sequences: [] }, { ...src, sequences: [] });
  assert.deepEqual(bakeV2(reset).rig.tracks[bakeV2(reset).trackOf.get("0/0")!], trackOf(source(), 0, 0));
});

/** A stand-in for the page's documents: one data per path with its own undo stack, as documents.ts keeps. */
function store() {
  const docs = new Map<string, { data: JsonValue; undo: JsonValue[]; redo: JsonValue[] }>();
  const s: HistoryStore & { set(path: string, data: JsonValue): void; get(path: string): JsonValue } = {
    canUndo: (p) => !!docs.get(p)?.undo.length, canRedo: (p) => !!docs.get(p)?.redo.length,
    undo: (p) => { const d = docs.get(p)!; d.redo.push(d.data); d.data = d.undo.pop()!; },
    redo: (p) => { const d = docs.get(p)!; d.undo.push(d.data); d.data = d.redo.pop()!; },
    restore: (p, data) => { docs.get(p)!.data = data; },
    set: (p, data) => {
      const d = docs.get(p);
      if (!d) docs.set(p, { data, undo: [], redo: [] });
      else { d.undo.push(d.data); d.redo = []; d.data = data; }
    },
    get: (p) => docs.get(p)!.data,
  };
  return s;
}

test("box-selected keys across parts deleted as one undo step", () => {
  let src = setKeyAt(source(), 0, 0, 12, () => ({ move: [0, -8] }));
  src = setKeyAt(src, 0, 0, 30, () => ({ move: [0, 4] }));
  src = setKeyAt(src, 0, 1, 24, () => ({ rotation: 15 }));
  src = setKeyAt(src, 0, 2, 24, () => ({ rotation: -15 }));
  const s = store();
  const history = new RigHistory(s, () => undefined);
  const path = "res/pokemon/x/front_rig_v2.json";
  s.set(path, fromPlain(src));
  // A box over frames 10 to 26 of every row: the body's 12, the head's 24, the ear's 24 (and the starts are implicit)
  const box = [0, 1, 2].flatMap((b) => rowKeys(src, 0, b).filter((k) => k.frame >= 10 && k.frame <= 26).map((k) => k.ref));
  assert.equal(box.length, 3);
  const r = deleteKeys(src, 0, [...box, { bone: 0, index: START }]);
  assert.equal(r.deleted, 3, "the implicit start isn't a key to delete");
  s.set(path, fromPlain(r.src));
  history.note([path]);
  assert.deepEqual(r.src.sequences[0].parts, [{ bone: 0, keys: [{ frame: 30, move: [0, 4] }] }]);
  history.undo();
  assert.deepEqual(s.get(path), fromPlain(src), "one Ctrl+Z gives all three back");
  history.redo();
  assert.deepEqual(s.get(path), fromPlain(r.src));
});

test("a preset curve applied to a key bakes as the preset (back: past the default and back)", () => {
  let src = setKeyAt(source(), 0, 1, 24, () => ({ rotation: 20 }));
  src = setCurve(src, 0, [{ bone: 1, index: 0 }], "back");
  assert.deepEqual(src.sequences[0].parts[0].keys, [{ frame: 24, rotation: 20, curve: "back" }]);
  const t = turns(trackOf(src, 0, 1));
  for (const [f, , got] of t) {
    if (f < 24) continue;
    assert.equal(got, turnOf(20 - 20 * eased("back", (f - 24) / 24)), `at ${f}`);
  }
  // back overshoots the default (0) before the seam: a turn below 0 at some sample, as the preset does
  assert.ok(t.some(([f, , r]) => f > 24 && r > 32768), "past the default the other way");
  // The implicit start given a curve becomes a real key at 0 holding it
  const s2 = setCurve(src, 0, [{ bone: 1, index: START }], "snap");
  assert.deepEqual(s2.sequences[0].parts[0].keys[0], { frame: 0, curve: "snap" });
  const t2 = turns(trackOf(s2, 0, 1));
  assert.equal(t2[1][2], turnOf(20 * eased("snap", 6 / 24)));
  // One channel's curve
  const s3 = setCurve(src, 0, [{ bone: 1, index: 0 }], "linear", "rotation");
  assert.deepEqual(s3.sequences[0].parts[0].keys[0].curves, { rotation: "linear" });
});

test("keying never while the preview plays: a press pauses it on the step's frame first", () => {
  const clock: KeyClock & { seeks: number[] } = {
    state: { time: 40, playing: true }, seeks: [],
    play(p?: boolean) { clock.state = { ...clock.state, playing: p ?? !clock.state.playing }; },
    seek(t) { clock.state = { ...clock.state, time: t }; clock.seeks.push(t); },
  };
  const frame = pauseForKeying(clock, true);
  assert.equal(clock.state.playing, false);
  assert.equal(frame, 36);
  assert.equal(clock.state.time, 36);
  // Without the snap, the frame shown
  clock.state = { time: 40, playing: true };
  assert.equal(pauseForKeying(clock, false), 40);
  assert.equal(clock.state.playing, false);
  // Paused already, on a step: nothing moves
  clock.seeks = [];
  clock.state = { time: 24, playing: false };
  assert.equal(pauseForKeying(clock, true), 24);
  assert.deepEqual(clock.seeks, []);
});

test("the list: add, duplicate, reorder and delete keep the timeline playing the same sequences", () => {
  let src = setKeyAt(source(), 1, 0, 18, () => ({ move: [0, -20] }));
  const added = addSequence(src, "Special");
  assert.equal(added.sequence, 2);
  assert.deepEqual(added.src.sequences[2], { name: "Special", frames: 48, parts: [] });
  const dup = duplicateSequence(added.src, 0);
  assert.equal(dup.src.sequences[1].name, "Idle copy");
  assert.deepEqual(dup.src.timeline.blocks.map((b) => b.sequence), [0, 2], "Hop is 2 now");
  src = moveSequence(dup.src, 2, 0);
  assert.deepEqual(src.sequences.map((x) => x.name), ["Hop", "Idle", "Idle copy", "Special"]);
  assert.deepEqual(src.timeline.blocks.map((b) => b.sequence), [1, 0]);
  src = deleteSequence(src, 1);
  assert.deepEqual(src.timeline.blocks.map((b) => b.sequence), [0], "Idle's block went with it");
  assert.equal(deleteSequence({ ...src, sequences: [src.sequences[0]] }, 0).sequences.length, 1, "the last one stays");
  // Each bakes: the hop's track went with it to 0
  assert.deepEqual(moves(trackOf(src, 0, 0)).find((k) => k[0] === 18), [18, 6, -20]);
});

test("the preview plays the open sequence as the game does: its frames equal mcss.render of the baked rig", async () => {
  let src = source();
  src = setKeyAt(src, 0, 1, 24, () => ({ rotation: 20 }));
  src = setCurve(src, 0, [{ bone: 1, index: 0 }], "back");
  src = setKeyAt(src, 1, 0, 18, () => ({ move: [0, -14], scale: [0.9, 1.2] }));
  src = setKeyAt(src, 1, 2, 12, () => ({ rotation: -25 }));
  const png = readFileSync(join(ROOT, "res/pokemon/pichu/front.png"));
  const sheet = (await readIndexedPng(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer)).pixels;
  const baked = bakeV2(src);
  for (const [s, frames] of [[0, 48], [1, 36]] as const) {
    const preview = sequenceRig(baked.rig, s, frames);
    // The game's own: the same source with only this sequence on its timeline, baked and drawn by the build's renderer
    const alone = bakeV2({ ...src, timeline: { name: "stay", blocks: [{ sequence: s }] } }).rig;
    assert.deepEqual(alone.poses, preview.poses);
    assert.deepEqual(alone.tracks, preview.tracks);
    const times = [0, 5, 6, 18, 23, 24, 30, 35, frames - 1, frames, frames + 7];
    const want = JSON.parse(python("editor/tests/mcss_render_rig.py", JSON.stringify(alone), "res/pokemon/pichu/front.png", "front", `0:${times.join(",")}`)) as
      { time: number; width: number; height: number; origin: Pair; pixels: string }[];
    for (const w of want) {
      const got = render(preview as Rig, sheet, 0, w.time);
      assert.deepEqual([got.width, got.height, got.originX, got.originY], [w.width, w.height, ...w.origin], `${s} at ${w.time}`);
      assert.ok(Buffer.from(w.pixels, "hex").equals(Buffer.from(got.pixels)), `${s} at ${w.time}: the pixels`);
    }
  }
});
