// The new Rig Editor's timeline strip and the battle's pause (rig-editor-v2.md, "Built: step 4"): clips added, repeated,
// moved and deleted as the timeline's blocks and the baked sequence 0; one edit of a sequence changing every instance;
// the strip's preview (the bake's own sequence 0) against the build's renderer; Pauses in battle and Keeps moving baked
// to the idle parts; and the pause's simulation freezing every part that doesn't keep moving.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseJson } from "../shared/json.ts";
import { readIndexedPng } from "../src/modules/palettes/png.ts";
import { frameQuads, render, type Pair, type Rig } from "../src/modules/rig/mcss.ts";
import { rigOf } from "../src/modules/rig/model.ts";
import { Clock } from "../src/modules/rig/player.ts";
import { RigHistory, type HistoryStore } from "../src/modules/rig/history.ts";
import { setKeyAt } from "../src/modules/rig/sequences.ts";
import { addClip, cantDeleteClip, clipAt, clipsOf, deleteClip, keepsMovingOf, moveClip, playCount, setKeepsMoving, setPause, setRepeat,
         stripFrames } from "../src/modules/rig/timeline.ts";
import { bakeV2, type V2, type V2Bone } from "../src/modules/rig/v2.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const python = (script: string, input: string, ...args: string[]) =>
  execFileSync("python3", ["-I", join(ROOT, script), ...args], { cwd: ROOT, input, maxBuffer: 256 << 20 }).toString();
const pichu = rigOf(parseJson(readFileSync(join(ROOT, "res/pokemon/pichu/front_rig.json"), "utf8")));

// (the clock's frames are stepped by hand here)
(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= () => 1;
(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame ??= () => undefined;

/** Pichu's body, head and ear (the head the body's child, the ear connected to it); Idle of 48 frames and Hop of 36,
 * keyed, with only Idle on the timeline. */
function source(more: Partial<V2> = {}): V2 {
  const bones: V2Bone[] = [
    { name: "body", head: [4, -15], tail: [0, -18], parent: null, default: { piece: 0 } },
    { name: "head", head: [0, -18], tail: [-3, -23], parent: 0, default: { piece: 1 } },
    { name: "ear", head: [-3, -23], tail: [-6, -40], parent: 1, connected: true, default: { piece: 2 } },
  ];
  let src: V2 = {
    format: 2, side: "front", box: { width: 31, height: 45, x: 4, y: 3 }, stop_flags: 0, pause: true, keeps_moving: [],
    pieces: pichu.pictures.slice(0, 3).map((p, i) => ({ name: ["body", "head", "ear"][i], rectangles: p.rectangles, obj_attribute: p.obj_attribute })),
    bones, layers: [1, 2, 0],
    sequences: [{ name: "Idle", frames: 48, parts: [] }, { name: "Hop", frames: 36, parts: [] }],
    timeline: { name: "stay", blocks: [{ sequence: 0 }] },
    ...more,
  };
  src = setKeyAt(src, 0, 1, 24, () => ({ rotation: 20 }));
  src = setKeyAt(src, 0, 2, 12, () => ({ rotation: -30 }));
  src = setKeyAt(src, 1, 0, 18, () => ({ move: [0, -14] }));
  return src;
}
const blocks = (src: V2) => src.timeline.blocks.map((b) => b.sequence);
const stay = (src: V2) => bakeV2(src).rig.sequences[0].keys.map((k) => [k.pose, k.frames]);
async function pichuSheet() {
  const png = readFileSync(join(ROOT, "res/pokemon/pichu/front.png"));
  return (await readIndexedPng(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer)).pixels;
}

test("clips: added, repeated, moved and deleted as the timeline's blocks and the baked sequence 0", () => {
  let src = source();
  // Idle x4 + Hop: a clip is a run of one sequence's blocks
  src = setRepeat(src, 0, 4);
  src = addClip(src, 1);
  assert.deepEqual(blocks(src), [0, 0, 0, 0, 1]);
  assert.deepEqual(clipsOf(src).map((k) => [k.sequence, k.count, k.frames, k.at]), [[0, 4, 48, 0], [1, 1, 36, 192]]);
  assert.equal(stripFrames(src), 228);
  assert.deepEqual(stay(src), [[0, 48], [0, 48], [0, 48], [0, 48], [1, 36]], "each instance a key showing the sequence's pose, its length");
  assert.equal(playCount(src, 0), 4);
  // Added next to a clip of the same sequence joins it; added before a clip goes there
  assert.deepEqual(clipsOf(addClip(src, 0)).map((k) => [k.sequence, k.count]), [[0, 4], [1, 1], [0, 1]]);
  assert.deepEqual(blocks(addClip(src, 1, 0)), [1, 0, 0, 0, 0, 1]);
  assert.deepEqual(blocks(addClip(src, 0, 1)), [0, 0, 0, 0, 0, 1], "before Hop, next to Idle x4: Idle x5");
  // Idle x4, Hop, Idle x3 (the user's example), then Hop moved to the start
  src = setRepeat(addClip(src, 0), 2, 3);
  assert.deepEqual(blocks(src), [0, 0, 0, 0, 1, 0, 0, 0]);
  const moved = moveClip(src, 1, 0);
  assert.deepEqual(blocks(moved), [1, 0, 0, 0, 0, 0, 0, 0], "the two Idle runs now touch: one clip x7");
  assert.deepEqual(clipsOf(moved).map((k) => [k.sequence, k.count]), [[1, 1], [0, 7]]);
  assert.deepEqual(blocks(moveClip(src, 0, 3)), [1, 0, 0, 0, 0, 0, 0, 0], "Idle x4 to the end");
  assert.deepEqual(blocks(moveClip(src, 0, 1)), blocks(src), "to where it is: no change");
  // Deleted (all its instances); the last clip stays
  src = deleteClip(src, 0);
  assert.deepEqual(blocks(src), [1, 0, 0, 0]);
  assert.deepEqual(stay(src), [[1, 36], [0, 48], [0, 48], [0, 48]]);
  src = deleteClip(src, 1);
  assert.deepEqual(blocks(src), [1]);
  assert.deepEqual(blocks(deleteClip(src, 0)), [1], "the last clip stays");
  const one = deleteClip(source(), 0);
  assert.deepEqual(blocks(one), [0], "the strip keeps one clip");
  assert.ok(cantDeleteClip(one, 0));
  // An original's block with its own length only joins blocks equal to it
  const original = source({ timeline: { name: "stay", blocks: [{ sequence: 0, frames: 240 }, { sequence: 0 }, { sequence: 0 }] } });
  assert.deepEqual(clipsOf(original).map((k) => [k.count, k.frames, k.at]), [[1, 240, 0], [2, 48, 240]]);
  assert.deepEqual(setRepeat(original, 0, 2).timeline.blocks, [{ sequence: 0, frames: 240 }, { sequence: 0, frames: 240 }, { sequence: 0 }, { sequence: 0 }]);
  // Where the playhead is: the clip, the instance and the frame in it, looping over the strip
  const strip = addClip(setRepeat(source(), 0, 4), 1);
  assert.deepEqual(clipAt(strip, 0), { clip: 0, instance: 0, since: 0 });
  assert.deepEqual(clipAt(strip, 100), { clip: 0, instance: 2, since: 4 });
  assert.deepEqual(clipAt(strip, 200), { clip: 1, instance: 0, since: 8 });
  assert.deepEqual(clipAt(strip, 228 + 50), { clip: 0, instance: 1, since: 2 });
});

test("clip edits are one undo step each of the page's history, the bake following", () => {
  // The page commits each edit as one replace of the source (history.ts): undo gives the strip before it back
  const docs = new Map<string, { stack: V2[]; at: number }>();
  const store: HistoryStore = {
    canUndo: (p) => (docs.get(p)?.at ?? 0) > 0, canRedo: (p) => { const d = docs.get(p); return !!d && d.at < d.stack.length - 1; },
    undo: (p) => { const d = docs.get(p)!; d.at--; }, redo: (p) => { const d = docs.get(p)!; d.at++; },
    restore: () => undefined,
  };
  const history = new RigHistory(store, () => undefined);
  const path = "front_rig_v2.json";
  docs.set(path, { stack: [source()], at: 0 });
  const commit = (next: V2) => { const d = docs.get(path)!; d.stack = [...d.stack.slice(0, d.at + 1), next]; d.at++; history.note([path], "typed"); };
  const now = () => docs.get(path)!.stack[docs.get(path)!.at];
  commit(setRepeat(now(), 0, 4));
  commit(addClip(now(), 1));
  assert.deepEqual(blocks(now()), [0, 0, 0, 0, 1]);
  history.undo([path]);
  assert.deepEqual(blocks(now()), [0, 0, 0, 0]);
  history.undo([path]);
  assert.deepEqual(blocks(now()), [0]);
  history.redo([path]);
  assert.deepEqual(stay(now()), [[0, 48], [0, 48], [0, 48], [0, 48]]);
});

test("editing a sequence changes every instance: one pose and one set of tracks for all its clips", async () => {
  const sheet = await pichuSheet();
  let src = addClip(setRepeat(source(), 0, 4), 1);
  const before = bakeV2(src).rig;
  // Every Idle instance draws the same frames
  for (const t of [0, 6, 18, 24, 42]) {
    const first = render(before, sheet, 0, t).pixels;
    for (const n of [1, 2, 3]) assert.ok(Buffer.from(render(before, sheet, 0, n * 48 + t).pixels).equals(Buffer.from(first)), `instance ${n + 1} at ${t}`);
  }
  // One edit of Idle: the head turned further at 24
  src = setKeyAt(src, 0, 1, 24, () => ({ rotation: 45 }));
  const after = bakeV2(src).rig;
  assert.equal(after.tracks.length, before.tracks.length, "no tracks per instance");
  assert.equal(after.poses.length, 2, "one pose per sequence, whatever the instances");
  for (const n of [0, 1, 2, 3]) {
    const was = render(before, sheet, 0, n * 48 + 24).pixels, now = render(after, sheet, 0, n * 48 + 24);
    assert.ok(!Buffer.from(now.pixels).equals(Buffer.from(was)) || now.pixels.length !== was.length, `instance ${n + 1} changed`);
    assert.ok(Buffer.from(now.pixels).equals(Buffer.from(render(after, sheet, 0, 24).pixels)), `instance ${n + 1} equals the first`);
  }
  // The hop is untouched
  assert.ok(Buffer.from(render(after, sheet, 0, 192 + 18).pixels).equals(Buffer.from(render(before, sheet, 0, 192 + 18).pixels)));
});

test("the strip's preview is the bake's sequence 0: its frames equal mcss.render over the whole strip", async () => {
  const sheet = await pichuSheet();
  const src = addClip(setRepeat(source(), 0, 4), 1);
  const rig = bakeV2(src).rig;
  const times = [0, 5, 24, 47, 48, 60, 100, 150, 191, 192, 198, 210, 227, 228, 240, 500];
  const want = JSON.parse(python("editor/tests/mcss_render_rig.py", JSON.stringify(rig), "res/pokemon/pichu/front.png", "front", `0:${times.join(",")}`)) as
    { time: number; width: number; height: number; origin: Pair; pixels: string }[];
  assert.equal(want.length, times.length);
  for (const w of want) {
    const got = render(rig as Rig, sheet, 0, w.time);
    assert.deepEqual([got.width, got.height, got.originX, got.originY], [w.width, w.height, ...w.origin], `at ${w.time}`);
    assert.ok(Buffer.from(w.pixels, "hex").equals(Buffer.from(got.pixels)), `at ${w.time}: the pixels`);
  }
});

test("Pauses in battle and Keeps moving bake to the idle parts (their places in the rig's layers)", () => {
  let src = source();
  assert.deepEqual(bakeV2(src).rig.idle_parts, [], "pauses, everything freezing");
  src = setKeepsMoving(src, 2, true);
  assert.deepEqual(src.keeps_moving, [2]);
  assert.deepEqual(bakeV2(src).rig.idle_parts, [1], "the ear is the second layer (head, ear, body)");
  src = setKeepsMoving(src, 0, true);
  assert.deepEqual(bakeV2(src).rig.idle_parts, [1, 2]);
  src = setKeepsMoving(src, 2, false);
  assert.deepEqual(bakeV2(src).rig.idle_parts, [2]);
  assert.equal(bakeV2(setPause(src, false)).rig.idle_parts, null, "never pauses: the game's 0xff");
  assert.deepEqual(setPause(src, false).keeps_moving, [0], "the parts are kept for when it's on again");
  // An original's idle nodes kept as they are become keeps-moving bones when one is toggled
  const kept = { ...source(), idle_nodes: [0] };
  assert.deepEqual(keepsMovingOf(kept), [1]);
  const toggled = setKeepsMoving(kept, 2, true);
  assert.equal(toggled.idle_nodes, undefined);
  assert.deepEqual(bakeV2(toggled).rig.idle_parts, [0, 1]);
});

test("the pause's simulation: everything but the keeps-moving parts freezes, for 48, 56 or 64 frames, then the loop again", () => {
  // The ear keeps moving (it turns from 0 to -30 and back over Idle's 48 frames); the head turns too, but freezes
  const src = setKeepsMoving(source(), 2, true);
  const rig = bakeV2(src).rig;
  const clock = new Clock();
  clock.setRig(rig);
  clock.play(false);
  const keysAt = () => {
    const quads = frameQuads(rig, clock.state.sequence, clock.state.time, clock.idle()).quads;
    return new Map(quads.map((q) => [q.part, q.keyIndex]));
  };
  clock.pauseNow(56);
  assert.ok(clock.state.pause);
  assert.equal(clock.state.pause!.wait, 56);
  const start = keysAt();
  const seenEar = new Set<number>();
  for (let f = 0; f < 55; f++) {
    clock.advance(1);
    assert.ok(clock.state.pause, `still paused at ${f + 1}`);
    assert.equal(clock.state.time, 0, "the strip's time stands still");
    const now = keysAt();
    assert.equal(now.get(0), start.get(0), "the head (layer 0) is frozen");
    assert.equal(now.get(2), start.get(2), "the body (layer 2) is frozen");
    seenEar.add(now.get(1)!);
  }
  assert.ok(seenEar.size > 3, "the ear (layer 1) keeps moving through its keys");
  clock.advance(1);
  assert.equal(clock.state.pause, null, "over after 56 frames");
  assert.deepEqual([clock.state.sequence, clock.state.time], [0, 0], "the loop again from its start");
  // Nothing keeps moving: every part frozen
  const still = bakeV2(source()).rig;
  const c2 = new Clock();
  c2.setRig(still);
  c2.play(false);
  c2.pauseNow(48);
  const s0 = frameQuads(still, 0, c2.state.time, c2.idle()).quads.map((q) => q.keyIndex);
  c2.advance(30);
  assert.deepEqual(frameQuads(still, 0, c2.state.time, c2.idle()).quads.map((q) => q.keyIndex), s0);
  // Pauses in battle off: no pause, ever
  const never = bakeV2(setPause(src, false)).rig;
  const c3 = new Clock();
  c3.setRig(never);
  c3.pauseNow();
  assert.equal(c3.state.pause, null);
  c3.pauses = true;
  c3.play(false);
  c3.advance(48 * 6);
  assert.equal(c3.state.pause, null, "random pauses never start");
  // The battle's roll at each loop's end (here always won): the strip's end starts a pause of 48, 56 or 64
  const random = Math.random;
  try {
    Math.random = () => 0;
    const c4 = new Clock();
    c4.setRig(rig);
    c4.pauses = true;
    c4.play(false);
    c4.advance(47);
    assert.equal(c4.state.pause, null);
    c4.advance(1);
    assert.deepEqual(c4.state.pause, { elapsed: 0, wait: 48 });
  } finally {
    Math.random = random;
  }
});
