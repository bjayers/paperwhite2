// The new Rig Editor's rig setup (src/modules/rig/setup.ts; rig-editor-v2.md, Built: step 2): a head dragged keeps
// the pictures in place (turned and scaled defaults too, shared pieces copied); a tail dragged moves the connected
// children's heads with it, their pictures staying; parenting keeps the transform (a fresh rig's default pose, and a
// vanilla sprite's keys baking back to the same flat rig); Connected and Keep offset; deleting bones and pieces; Start
// fresh valid for the build; and an untouched vanilla side opened and saved writes nothing. Reads res/, writes
// temporary files only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { detectLayout, fileText, parseJson } from "../shared/json.ts";
import { validate, type Schema } from "../shared/schema.ts";
import { readIndexedPng } from "../src/modules/palettes/png.ts";
import { canvasOf, frameQuads, quadBox, render, type Canvas, type Pair, type Rig } from "../src/modules/rig/mcss.ts";
import { rigOf } from "../src/modules/rig/model.ts";
import { bakeV2, convertToV2, type V2, type V2Bone } from "../src/modules/rig/v2.ts";
import { addBone, addBoneForPiece, addPiece, addRectangle, boneEnds, copySide, defaultPoseRig, deleteBone, deletePiece, freshV2, moveBone,
         moveHead, movePieces, moveTail, pivotOf, reparentKeep, restMaps, setConnected, setDefault, wouldCycle } from "../src/modules/rig/setup.ts";
import { flatData, V2_LAYOUT, v2Data } from "../src/modules/rig/setupFiles.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const V2_SCHEMA = join(ROOT, "res/pokemon/battle_sprite_rig_v2.schema.json");
const RIG_SCHEMA = join(ROOT, "res/pokemon/battle_sprite_rig.schema.json");
const python = (script: string, input: string, ...args: string[]) =>
  execFileSync("python3", ["-I", join(ROOT, script), ...args], { cwd: ROOT, input, maxBuffer: 256 << 20 }).toString();
const read = (folder: string, side: string) => readFileSync(join(ROOT, "res/pokemon", folder, `${side}_rig.json`), "utf8");
const pichu = rigOf(parseJson(read("pichu", "front")));
const sheetOf = async (folder: string, side: string) => {
  const png = readFileSync(join(ROOT, "res/pokemon", folder, `${side}.png`));
  return (await readIndexedPng(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer)).pixels;
};

/** Pichu's body, head and right ear as a fresh rig: the head the body's child keeping its offset, the ear connected to
 * the head's tail; no keys. */
function setup(more: Partial<V2> = {}, bones?: V2Bone[]): V2 {
  return {
    format: 2, side: "front", box: { width: 31, height: 45, x: 4, y: 3 }, stop_flags: 0, pause: true, keeps_moving: [],
    pieces: pichu.pictures.slice(0, 3).map((p, i) => ({ name: ["body", "head", "ear"][i], rectangles: p.rectangles })),
    bones: bones ?? [
      { name: "body", head: [4, -15], tail: [0, -18], parent: null, default: { piece: 0 } },
      { name: "head", head: [0, -18], tail: [-3, -23], parent: 0, default: { piece: 1 } },
      { name: "ear", head: [-3, -23], tail: [-6, -40], parent: 1, connected: true, default: { piece: 2 } },
    ],
    layers: [1, 2, 0],
    sequences: [{ name: "Idle", frames: 24, parts: [] }],
    timeline: { name: "stay", blocks: [{ sequence: 0 }] },
    ...more,
  };
}

/** The default pose drawn on a canvas (palette indices). */
function drawn(src: V2, sheet: Uint8Array, canvas?: Canvas): { pixels: Uint8Array; canvas: Canvas } {
  const { baked, error } = defaultPoseRig(src);
  assert.equal(error, null);
  const rig = baked!.rig;
  const c = canvas ?? (() => {
    const k = canvasOf(frameQuads(rig, 0, 0).quads.map(quadBox));
    return { width: k.width + 40, height: k.height + 40, originX: k.originX + 20, originY: k.originY + 20 };
  })();
  return { pixels: render(rig, sheet, 0, 0, c).pixels, canvas: c };
}
const samePixels = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const near = (a: Pair, b: Pair, by = 1e-6) => Math.abs(a[0] - b[0]) <= by && Math.abs(a[1] - b[1]) <= by;

test("dragging a head moves the pivot and keeps every picture where it is (turned and scaled defaults too)", async () => {
  const sheet = await sheetOf("pichu", "front");
  for (const pose of [{}, { rotation: 90 }, { rotation: 90, scale: [2, 1] as Pair, move: [3, -1] as Pair }]) {
    const src = setDefault(setup(), 1, (d) => ({ ...d, ...pose }));
    const before = drawn(src, sheet);
    for (const b of [0, 1]) {
      const { src: next, copied } = moveHead(src, b, [5, -3]);
      assert.equal(copied, 0);
      assert.deepEqual(next.bones[b].head, [src.bones[b].head[0] + 5, src.bones[b].head[1] - 3]);
      assert.ok(samePixels(drawn(next, sheet, before.canvas).pixels, before.pixels), `bone ${b} ${JSON.stringify(pose)}`);
      // The children keep their heads (an offset child's is its own; the connected ear's is the head's tail)
      assert.deepEqual(pivotOf(next, 2), pivotOf(src, 2));
    }
  }
  // A piece another bone shows too is copied for the bone whose head moved
  const shared = setup({}, [
    { name: "a", head: [0, -10], tail: [0, -20], parent: null, default: { piece: 0 } },
    { name: "b", head: [10, -10], tail: [10, -20], parent: null, default: { piece: 0 } },
  ]);
  shared.layers = [0, 1];
  const before = drawn(shared, sheet);
  const moved = moveHead(shared, 1, [-4, 2]);
  assert.equal(moved.copied, 1);
  assert.equal(moved.src.pieces.length, 4);
  assert.equal(moved.src.bones[1].default?.piece, 3);
  assert.deepEqual(moved.src.pieces[0], shared.pieces[0]);
  assert.ok(samePixels(drawn(moved.src, sheet, before.canvas).pixels, before.pixels));
  // A connected bone's head is its parent's tail: dragging it moves that
  const ear = moveHead(setup(), 2, [1, 1]).src;
  assert.deepEqual(ear.bones[1].tail, [-2, -22]);
  assert.deepEqual(pivotOf(ear, 2), [-2, -22]);
});

test("dragging a tail moves the connected children's heads with it, their pictures staying; offset children stay", async () => {
  const sheet = await sheetOf("pichu", "front");
  const src = setup();
  const before = drawn(src, sheet);
  const { src: next } = moveTail(src, 1, [4, -6]);
  assert.deepEqual(next.bones[1].tail, [1, -29]);
  // The ear (connected) now turns about the new tail, and its file head says so; its own tail stays
  assert.deepEqual(pivotOf(next, 2), [1, -29]);
  assert.deepEqual(next.bones[2].head, [1, -29]);
  assert.deepEqual(next.bones[2].tail, [-6, -40]);
  assert.ok(samePixels(drawn(next, sheet, before.canvas).pixels, before.pixels));
  const baked = bakeV2(next);
  assert.deepEqual(baked.rig.poses[0].parts[1].pivot, [1, -29]);
  // Turning the head now carries the ear about the head's pivot: the ear's head is where the head's tail goes
  const turned = setDefault(next, 1, (d) => ({ ...d, rotation: 90 }));
  const maps = restMaps(turned);
  const ends = boneEnds(turned, maps, 1);
  assert.ok(near(boneEnds(turned, maps, 2).head, ends.tail));
  // The head's tail (1, -29) turned a quarter about its head (0, -18): 11 up becomes 11 to the right... and 1 right 1 down
  assert.ok(near(ends.tail, [11, -17]), JSON.stringify(ends.tail));
  // Moving the body's tail moves no one (the head keeps its offset)
  const body = moveTail(src, 0, [3, 3]).src;
  assert.deepEqual(body.bones[1].head, src.bones[1].head);
  assert.ok(samePixels(drawn(body, sheet, before.canvas).pixels, before.pixels));
  // A whole bone moved takes its pictures with it, and the connected ear's head with its tail
  const whole = moveBone(src, 1, [2, 0])!.src;
  assert.deepEqual([whole.bones[1].head, whole.bones[1].tail, pivotOf(whole, 2)], [[2, -18], [-1, -23], [-1, -23]]);
  assert.equal(moveBone(src, 2, [1, 0]), null);
  // A piece moved within its bone
  const shifted = movePieces(src, 0, [2, 1]).src;
  assert.deepEqual(shifted.pieces[0].rectangles[0].at, [src.pieces[0].rectangles[0].at[0] + 2, src.pieces[0].rectangles[0].at[1] + 1]);
});

test("parenting keeps the transform: a fresh rig's default pose, and a vanilla sprite's keys", async () => {
  const sheet = await sheetOf("pichu", "front");
  // The body turned and moved, the head under it: unparented, then parented again, the head stays where it is
  const src = setDefault(setDefault(setup(), 0, (d) => ({ ...d, rotation: 90, move: [2, 3] })), 1, (d) => ({ ...d, rotation: -30 }));
  const before = drawn(src, sheet);
  const head = (s: V2) => boneEnds(s, restMaps(s), 1);
  const free = reparentKeep(src, 1, null);
  assert.equal(free.bones[1].parent, null);
  assert.ok(near(head(free).head, head(src).head) && near(head(free).tail, head(src).tail));
  assert.ok(near(boneEnds(free, restMaps(free), 2).tail, boneEnds(src, restMaps(src), 2).tail));
  assert.ok(samePixels(drawn(free, sheet, before.canvas).pixels, before.pixels));
  const back = reparentKeep(free, 1, 0);
  assert.equal(back.bones[1].parent, 0);
  assert.ok(near(head(back).tail, head(src).tail));
  assert.ok(samePixels(drawn(back, sheet, before.canvas).pixels, before.pixels));
  assert.ok(wouldCycle(src, 0, 2));
  assert.equal(reparentKeep(src, 0, 2), src);
  // A vanilla sprite: every part is the root's, and parenting one keeps its keys (it bakes back to the same flat rig)
  for (const [folder, side] of [["pichu", "front"], ["budew", "back"]]) {
    const text = read(folder, side);
    const data = parseJson(text);
    const converted = convertToV2(rigOf(data));
    const layout = detectLayout(text, data)!;
    const baked = (s: V2) => fileText(flatData(bakeV2(s).rig, data), layout);
    assert.equal(baked(converted), text);
    const child = reparentKeep(converted, 1, 0);
    assert.equal(child.bones[1].parent, 0);
    assert.equal(baked(child), text, `${folder} ${side}`);
    // (a parent that scales unevenly over a turned child is warned of, though these keys still bake back exactly)
    assert.ok(bakeV2(child).warnings.every((w) => w.includes("shear")), `${folder} ${side}`);
  }
});

test("Connected and Keep offset; bones and pieces added and deleted, the references renumbered", async () => {
  const sheet = await sheetOf("pichu", "front");
  const src = setup();
  const before = drawn(src, sheet);
  // The head connected to the body: its head goes to the body's tail, the pictures staying
  const on = setConnected(src, 1, true).src;
  assert.equal(on.bones[1].connected, true);
  assert.deepEqual(pivotOf(on, 1), [0, -18]);
  assert.ok(samePixels(drawn(on, sheet, before.canvas).pixels, before.pixels));
  const off = setConnected(src, 2, false).src;
  assert.equal(off.bones[2].connected, undefined);
  assert.deepEqual(off.bones[2].head, [-3, -23]);
  // Deleting the head: the ear goes to the body keeping its place, the layers and parents renumbered
  const earTail = boneEnds(src, restMaps(src), 2).tail;
  const gone = deleteBone(src, 1);
  assert.deepEqual(gone.bones.map((b) => [b.name, b.parent]), [["body", null], ["ear", 0]]);
  assert.deepEqual(gone.layers, [1, 0]);
  assert.ok(near(boneEnds(gone, restMaps(gone), 1).tail, earTail));
  assert.deepEqual(bakeV2(gone).warnings, []);
  // Pieces: a new one, its second rectangle beside it as on the sheet, a bone for it standing on the feet; deleted
  let s = addPiece(src, [128, 0], [16, 16]).src;
  assert.deepEqual(s.pieces[3].rectangles[0].at, [-8, 8]);
  s = addRectangle(s, 3, [144, 8], [8, 8]);
  assert.deepEqual(s.pieces[3].rectangles[1].at, [8, 0]);
  const made = addBoneForPiece(s, 3);
  assert.deepEqual([made.src.bones[3].head, made.src.bones[3].default], [[0, -8], { piece: 3 }]);
  assert.deepEqual(made.src.layers?.[0], 3);
  const quads = frameQuads(defaultPoseRig(made.src).baked!.rig, 0, 0).quads.filter((q) => q.picture === 3);
  assert.deepEqual(quadBox(quads.find((q) => q.rectangleIndex === 0)!), [-8, 8, 0, 16]);
  const dropped = deletePiece(made.src, 0);
  assert.equal(dropped.bones[0].default, undefined);
  assert.equal(dropped.bones[3].default?.piece, 2);
  assert.deepEqual(bakeV2(dropped).warnings, []);
  // A bone added to a converted original goes into its sequences' own layers and the tracks' order
  const kyurem = convertToV2(rigOf(parseJson(read("kyurem/form_2", "front"))));
  const added = addBone(kyurem, { head: [0, -10], tail: [0, -20] }).src;
  assert.deepEqual(bakeV2(added).warnings, []);
});

test("Start fresh and Copy front to back give sources the build takes", () => {
  const schema = JSON.parse(readFileSync(V2_SCHEMA, "utf8")) as Schema;
  const dir = mkdtempSync(join(tmpdir(), "rig-setup-"));
  try {
    for (const src of [freshV2("front", [0, 0], [64, 64]), freshV2("back", [40, 16], [32, 32]), copySide(setup(), "back")]) {
      const text = fileText(v2Data(src, "../battle_sprite_rig_v2.schema.json"), V2_LAYOUT);
      assert.deepEqual(validate(parseJson(text), schema, new Map()), []);
      const file = join(dir, `${src.side}_rig_v2.json`);
      writeFileSync(file, text);
      assert.deepEqual(JSON.parse(python("editor/server/python/validate.py", `${file}\t${V2_SCHEMA}\n`)), { ok: true });
      const baked = bakeV2(src);
      assert.deepEqual(baked.warnings, []);
      const flat = fileText(flatData(baked.rig, parseJson('{"$schema": "../battle_sprite_rig.schema.json"}')), V2_LAYOUT);
      writeFileSync(join(dir, "front_rig.json"), flat);
      assert.deepEqual(JSON.parse(python("editor/server/python/validate.py", `${join(dir, "front_rig.json")}\t${RIG_SCHEMA}\n`)), { ok: true });
      const check = JSON.parse(python("editor/server/python/rig_check.py", flat)) as { errors: string[] };
      assert.deepEqual(check.errors, []);
    }
    const fresh = freshV2("front", [0, 0], [64, 64]);
    assert.deepEqual([fresh.pieces.length, fresh.bones.length, fresh.bones[0].head, fresh.pieces[0].rectangles[0].at], [1, 1, [0, -32], [-32, 32]]);
    assert.equal(copySide(setup(), "back").side, "back");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an untouched vanilla side opened and saved writes nothing: its conversion bakes to its file's text", () => {
  for (const [folder, side] of [["pichu", "front"], ["pichu", "back"], ["charizard", "front"], ["kyurem/form_2", "back"]]) {
    const text = read(folder, side);
    const data = parseJson(text);
    // The page keeps the flat rig's document as the source's bake (amended only where the text differs) and makes the
    // _rig_v2.json document only at the first edit: so nothing is dirty, and Save has nothing to write
    const again = fileText(flatData(bakeV2(convertToV2(rigOf(data) as Rig)).rig, data), detectLayout(text, data)!);
    assert.equal(again, text, `${folder} ${side}`);
  }
});
