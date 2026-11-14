// The new Rig Editor's loop clips (src/modules/rig/loopClips.ts; rig-editor-v2.md, "Built: step 5"): a clip edited as a
// one-part sequence and written back; placed on a part, bakes as the format defines (pictures every 4 frames, a start
// offset, moves added, an odd length unrolled and warned of) and costs bytes; partValues with the clips equal to the
// bake; a flicker on a keeps-moving part animating through the battle pause's simulation while the rest freezes; and
// moveHead and reparentKeep keeping the pixels of a part with clips. Reads res/, writes nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseJson } from "../shared/json.ts";
import { readIndexedPng } from "../src/modules/palettes/png.ts";
import { canvasOf, frameQuads, keyAt, quadBox, render, type Canvas, type Rig } from "../src/modules/rig/mcss.ts";
import { rigOf } from "../src/modules/rig/model.ts";
import { Clock } from "../src/modules/rig/player.ts";
import { deleteKeys, moveKeys, partValues, setKeyAt } from "../src/modules/rig/sequences.ts";
import { moveHead, reparentKeep } from "../src/modules/rig/setup.ts";
import { setKeepsMoving } from "../src/modules/rig/timeline.ts";
import { addLoopClip, clipCost, clipFits, clipPreviewSource, clipSource, clipUses, deleteLoopClip, duplicateLoopClip, fromClipSource, placeClip,
         setClipStart, unplaceClip, unrolledFrames } from "../src/modules/rig/loopClips.ts";
import { bakeV2, type V2 } from "../src/modules/rig/v2.ts";
import { rigSizes } from "../src/modules/rig/sizes.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const pichu = rigOf(parseJson(readFileSync(join(ROOT, "res/pokemon/pichu/front_rig.json"), "utf8")));
(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= () => 1;
(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame ??= () => undefined;
async function pichuSheet() {
  const png = readFileSync(join(ROOT, "res/pokemon/pichu/front.png"));
  return (await readIndexedPng(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer)).pixels;
}

/** Pichu's body, head and ear (the head the body's child keeping its offset, the ear connected to the head); five pieces
 * (three for the flicker); Idle of 48 frames with the body hopping and the head turning, on the timeline. */
function source(): V2 {
  let src: V2 = {
    format: 2, side: "front", box: { width: 31, height: 45, x: 4, y: 3 }, stop_flags: 0, pause: true, keeps_moving: [],
    pieces: pichu.pictures.slice(0, 5).map((p, i) => ({ name: ["body", "head", "ear", "four", "five"][i], rectangles: p.rectangles, obj_attribute: p.obj_attribute })),
    bones: [
      { name: "body", head: [4, -15], tail: [0, -18], parent: null, default: { piece: 0 } },
      { name: "head", head: [0, -18], tail: [-3, -23], parent: 0, default: { piece: 1 } },
      { name: "ear", head: [-3, -23], tail: [-6, -40], parent: 1, connected: true, default: { piece: 2 } },
    ],
    layers: [1, 2, 0],
    sequences: [{ name: "Idle", frames: 48, parts: [] }],
    timeline: { name: "stay", blocks: [{ sequence: 0 }, { sequence: 0 }] },
  };
  src = setKeyAt(src, 0, 0, 24, () => ({ move: [0, -6] }));
  src = setKeyAt(src, 0, 1, 12, () => ({ rotation: 15 }));
  return src;
}

/** A "flicker" clip made through the clip-editing views: 3 pictures × 4 frames (12 frames, step 1 so keys go anywhere). */
function flicker(src0: V2, pieces = [2, 3, 4]): { src: V2; clip: number } {
  const made = addLoopClip(src0, "flicker", 12, 1);
  let src = made.src;
  const c = made.clip;
  pieces.forEach((piece, i) => {
    const edit = setKeyAt(clipSource(src, c), 0, 0, i * 4, () => ({ hidden: false, piece }));
    src = fromClipSource(src, c, edit);
  });
  return { src, clip: c };
}

const picturesOf = (rig: Rig, track: number, frames: number) => Array.from({ length: frames }, (_, t) => keyAt(rig.tracks[track], t).key.picture);

test("a loop clip edited as a sequence: keys at 0, 4 and 8 with pictures, moved, deleted, its key at 0 kept", () => {
  const { src, clip } = flicker(source());
  assert.deepEqual(src.loop_clips![clip], { name: "flicker", frames: 12, step: 1, keys: [{ frame: 0, piece: 2 }, { frame: 4, piece: 3 }, { frame: 8, piece: 4 }] });
  // The clip source holds one part playing it; a second key at a frame changes nothing
  const view = clipSource(src, clip);
  assert.equal(view.sequences[0].frames, 12);
  assert.deepEqual(fromClipSource(src, clip, setKeyAt(view, 0, 0, 8)), src);
  // Hidden on a key, a turn keyed (constant: the clip's curve), a key moved, the key at 0 deleted
  let next = fromClipSource(src, clip, setKeyAt(view, 0, 0, 6, () => ({ rotation: 10 })));
  assert.deepEqual(next.loop_clips![clip].keys[2], { frame: 6, rotation: 10 });
  next = fromClipSource(next, clip, moveKeys(clipSource(next, clip), 0, [{ bone: 0, index: 2 }], 4).src);
  assert.deepEqual(next.loop_clips![clip].keys.map((k) => k.frame), [0, 4, 8, 10]);
  next = fromClipSource(next, clip, deleteKeys(clipSource(next, clip), 0, [{ bone: 0, index: 0 }]).src);
  assert.deepEqual(next.loop_clips![clip].keys[0], { frame: 0 }, "a clip keeps a key at 0 (no change: the part as it is)");
  // Length from the clip timeline's grip
  const longer = clipSource(src, clip);
  longer.sequences[0] = { ...longer.sequences[0], frames: 18 };
  assert.equal(fromClipSource(src, clip, longer).loop_clips![clip].frames, 18);
});

test("a loop clip placed on a part bakes as defined: pictures every 4 frames under the keys, a start offset, moves added, its cost", () => {
  const base = source();
  const { src: withClip, clip } = flicker(base);
  const placed = placeClip(withClip, 0, 2, clip);
  assert.equal(placed.index, 0);
  const src = placed.src;
  assert.deepEqual(src.sequences[0].parts.find((l) => l.bone === 2), { bone: 2, keys: [], clips: [{ clip: 0 }] });
  const baked = bakeV2(src);
  assert.deepEqual(baked.warnings, []);
  const ear = baked.trackOf.get("0/2")!;
  const expected = Array.from({ length: 48 }, (_, t) => [2, 3, 4][Math.floor((t % 12) / 4)]);
  assert.deepEqual(picturesOf(baked.rig, ear, 48), expected);
  // The other parts bake as before, and the ear's moves (its head following the turning head) are unchanged
  const before = bakeV2(withClip);
  for (const b of [0, 1]) assert.deepEqual(baked.rig.tracks[baked.trackOf.get(`0/${b}`)!], before.rig.tracks[before.trackOf.get(`0/${b}`)!]);
  const earBefore = before.rig.tracks[before.trackOf.get("0/2")!];
  for (let t = 0; t < 48; t++) {
    const a = keyAt(baked.rig.tracks[ear], t).key, b = keyAt(earBefore, t).key;
    assert.deepEqual([a.rotation, a.move], [b.rotation, b.move], `frame ${t}`);
  }
  // Each picture swap is a key: the size grows, and clipCost says by how much
  const cost = clipCost(src, clip)!;
  assert.ok(cost > 0);
  assert.equal(cost, sizeOf(src) - sizeOf(withClip));
  // A start offset of 2: the clip's frame 0 at the sequence's 2 (frames 0 and 1 its last picture)
  const offset = setClipStart(src, 0, 2, 0, 2);
  assert.deepEqual(offset.sequences[0].parts.find((l) => l.bone === 2)!.clips, [{ clip: 0, start: 2 }]);
  const o = bakeV2(offset);
  assert.deepEqual(picturesOf(o.rig, o.trackOf.get("0/2")!, 8), [4, 4, 2, 2, 2, 2, 3, 3]);
  // A move clip on the body: added to its own keys (the hop), every frame
  let twitch = addLoopClip(src, "twitch", 6, 3);
  let moved = fromClipSource(twitch.src, twitch.clip, setKeyAt(clipSource(twitch.src, twitch.clip), 0, 0, 3, () => ({ move: [1, 0] })));
  moved = placeClip(moved, 0, 0, twitch.clip).src;
  const m = bakeV2(moved);
  // (the root body: each baked key its own eased move at the sample, cut every 3 frames by the clip's keys, plus the clip's)
  const body1 = m.rig.tracks[m.trackOf.get("0/0")!];
  for (let t = 0; t < 48; t++) {
    const at = Math.floor(t / 3) * 3;
    const own = partValues(moved, 0, 0, at).move;
    assert.deepEqual(keyAt(body1, t).key.move ?? [0, 0], [Math.round(own[0] + (t % 6 >= 3 ? 1 : 0)) + 0, Math.round(own[1]) + 0], `frame ${t}`);
  }
  // partValues with the clips is what the bake shows (the picture, the move added)
  for (let t = 0; t < 48; t += 1) {
    const v = partValues(moved, 0, 2, t, true);
    assert.equal(v.piece, expected[t]);
    const bodyV = partValues(moved, 0, 0, t, true), own = partValues(moved, 0, 0, t);
    assert.equal(bodyV.move[0] - own.move[0], t % 6 >= 3 ? 1 : 0);
  }
  // A clip whose length doesn't go into the sequence's: unrolled to both's least common multiple, warned of
  twitch = addLoopClip(src, "odd", 10, 1);
  const odd = placeClip(twitch.src, 0, 0, twitch.clip).src;
  const ob = bakeV2(odd);
  assert.equal(clipFits(48, 10), false);
  assert.equal(unrolledFrames(48, 10), 240);
  assert.ok(ob.warnings.some((w) => w.includes("baked over 240 frames")), ob.warnings.join("; "));
  // Unplaced and deleted: the lane tidied away, the later clips renumbered
  assert.deepEqual(bakeV2(unplaceClip(src, 0, 2, 0)).rig, bakeV2(withClip).rig);
  assert.equal(unplaceClip(src, 0, 2, 0).sequences[0].parts.some((l) => l.bone === 2), false);
  const dup = duplicateLoopClip(src, clip);
  const two = placeClip(dup.src, 0, 1, dup.clip).src;
  const gone = deleteLoopClip(two, clip);
  assert.equal(gone.loop_clips!.length, 1);
  assert.deepEqual(clipUses(gone, 0), [{ sequence: 0, bone: 1, index: 0 }]);
  assert.equal(gone.sequences[0].parts.some((l) => l.bone === 2), false);
});

const sizeOf = (src: V2) => rigSizes(bakeV2(src).rig).resident;

test("the flame case: a flicker on a keeps-moving part goes on flickering through the battle pause while the rest freezes", () => {
  const { src: withClip, clip } = flicker(source());
  const src = setKeepsMoving(placeClip(withClip, 0, 2, clip).src, 2, true);
  const rig = bakeV2(src).rig;
  assert.deepEqual(rig.idle_parts, [1], "the ear (the rig's second layer) is the idle part");
  const clock = new Clock();
  clock.setRig(rig);
  clock.play(false);
  clock.pauseNow(64);
  const shown = () => new Map(frameQuads(rig, clock.state.sequence, clock.state.time, clock.idle()).quads.map((q) => [q.part, q.picture]));
  const keys = () => new Map(frameQuads(rig, clock.state.sequence, clock.state.time, clock.idle()).quads.map((q) => [q.part, q.keyIndex]));
  const start = keys();
  const pictures: number[] = [];
  for (let f = 0; f < 63; f++) {
    clock.advance(1);
    assert.ok(clock.state.pause);
    const k = keys();
    assert.equal(k.get(0), start.get(0), "the head is frozen");
    assert.equal(k.get(2), start.get(2), "the body is frozen");
    pictures.push(shown().get(1)!);
  }
  // The ear flickers 2, 3, 4 every 4 frames on through the pause (from its frame 1 there)
  assert.deepEqual(pictures, Array.from({ length: 63 }, (_, f) => [2, 3, 4][Math.floor(((f + 1) % 12) / 4)]));
  // Without keeps moving, the flicker freezes with the rest
  const still = bakeV2(placeClip(withClip, 0, 2, clip).src).rig;
  const c2 = new Clock();
  c2.setRig(still);
  c2.play(false);
  c2.pauseNow(48);
  const p0 = frameQuads(still, 0, c2.state.time, c2.idle()).quads.map((q) => q.picture);
  for (let f = 0; f < 40; f++) {
    c2.advance(1);
    assert.deepEqual(frameQuads(still, 0, c2.state.time, c2.idle()).quads.map((q) => q.picture), p0);
  }
});

/** Every frame of the sequence drawn (palette indices), on one canvas. */
function frames(src: V2, sheet: Uint8Array, canvas?: Canvas) {
  const rig = bakeV2(src).rig;
  const c = canvas ?? (() => {
    const k = canvasOf(Array.from({ length: 48 }, (_, t) => frameQuads(rig, 0, t).quads.map(quadBox)).flat());
    return { width: k.width + 40, height: k.height + 40, originX: k.originX + 20, originY: k.originY + 20 };
  })();
  return { all: Array.from({ length: 48 }, (_, t) => render(rig, sheet, 0, t, c).pixels), canvas: c };
}
const same = (a: Uint8Array[], b: Uint8Array[]) => a.every((x, t) => x.length === b[t].length && x.every((v, i) => v === b[t][i]));

test("a moved head and a new parent keep the pixels of a part with loop clips (pictures, a move, a turn)", async () => {
  const sheet = await pichuSheet();
  const { src: f, clip } = flicker(source(), [1, 3, 4]);
  let src = placeClip(f, 0, 1, clip).src;
  // A turn-and-move clip on the head too, and the flicker shared with the body (so moving the head's pivot copies it)
  const tw = addLoopClip(src, "twitch", 12, 3);
  src = fromClipSource(tw.src, tw.clip, setKeyAt(clipSource(tw.src, tw.clip), 0, 0, 6, () => ({ rotation: 90, move: [1, 0] })));
  src = placeClip(src, 0, 1, tw.clip, 3).src;
  src = placeClip(src, 0, 0, clip).src;
  // (the head's own keys don't turn, so the clip's turn is exact; a move of 4 eased in and out, so no sample lands on a half pixel, where rounding a tie could go either way)
  src = { ...src, sequences: [{ ...src.sequences[0], parts: src.sequences[0].parts.map((l) => (l.bone === 1 ? { ...l, keys: [{ frame: 12, move: [4, -4] }] } : l)) }] };
  const before = frames(src, sheet);
  const { src: moved } = moveHead(src, 1, [3, -4]);
  assert.equal(moved.loop_clips!.length, 3, "the flicker the body plays too was copied for the head");
  assert.deepEqual(moved.sequences[0].parts.find((l) => l.bone === 0)!.clips, [{ clip: 0 }], "the body keeps the original");
  assert.ok(same(frames(moved, sheet, before.canvas).all, before.all), "moveHead keeps every frame's pixels");
  // The head unparented (its parent only moves: exact) and parented again
  const free = reparentKeep(src, 1, null);
  assert.equal(free.bones[1].parent, null);
  assert.deepEqual(free.sequences[0].parts.find((l) => l.bone === 1)!.clips, src.sequences[0].parts.find((l) => l.bone === 1)!.clips, "the clips stay on the part");
  assert.ok(same(frames(free, sheet, before.canvas).all, before.all), "reparentKeep (to the root) keeps every frame's pixels");
  assert.ok(same(frames(reparentKeep(free, 1, 0), sheet, before.canvas).all, before.all), "and back to the body");
});

test("a clip's preview: the part alone where it stands, and on the sprite in the default pose", () => {
  const { src: f, clip } = flicker(source());
  const src = placeClip(f, 0, 2, clip).src;
  const alone = bakeV2(clipPreviewSource(src, clip, 2, true)).rig;
  assert.equal(alone.poses[0].parts.length, 1);
  assert.deepEqual(picturesOf(alone, alone.poses[0].parts[0].track, 12), [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]);
  const all = bakeV2(clipPreviewSource(src, clip, 2, false)).rig;
  assert.equal(all.poses[0].parts.length, 3);
  // The part alone stands where it does on the sprite (its parents baked, not drawn)
  const a = frameQuads(alone, 0, 5).quads[0], b = frameQuads(all, 0, 5).quads.find((q) => q.part === 1)!;
  assert.deepEqual(quadBox(a), quadBox(b));
});
