// The new Rig Editor's Root and empty sequences (rig-editor-v2.md, "Built: Root and empty sequences"): deleting a
// vanilla side's sequences down to one new empty one saves (the source through both validators, the bake through
// mcss_rig.check), an empty timeline and an emptied strip bake to what the game takes and say so, an empty sequence
// holds the default pose; the Root's keys (sequences[i].root) bake into every part without a parent about the feet,
// exactly as the analytic turn and move give, the editor's posed bones and gizmo place agree with the bake, the
// preview's frames equal mcss.render, and the rig setup's Root moves the whole default pose. Reads res/, writes nothing
// there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileText, fromPlain, parseJson, type Layout } from "../shared/json.ts";
import { validate, type Schema } from "../shared/schema.ts";
import { readIndexedPng } from "../src/modules/palettes/png.ts";
import { lengthOf, render, type Pair, type Rig } from "../src/modules/rig/mcss.ts";
import { dataOf, rigOf } from "../src/modules/rig/model.ts";
import { bakedPoint, bakeV2, convertToV2, ROOT, type V2, type V2Bone } from "../src/modules/rig/v2.ts";
import { addSequence, deleteKeys, deleteSequence, keyCount, moveKeys, partValues, posedMaps, rowKeys, sequenceRig, setKeyAt, START } from "../src/modules/rig/sequences.ts";
import { checkText } from "../src/modules/rig/checkText.ts";
import { boneEnds, moveDefaultPose, partHead, reparentKeep, restMaps } from "../src/modules/rig/setup.ts";

const REPO = resolve(import.meta.dirname, "../..");
const V2_SCHEMA = join(REPO, "res/pokemon/battle_sprite_rig_v2.schema.json");
const RIG_SCHEMA = join(REPO, "res/pokemon/battle_sprite_rig.schema.json");
const COMPACT: Layout = { width: 120, indent: 2, compact: true };
const python = (script: string, input: string, ...args: string[]) =>
  execFileSync("python3", ["-I", join(REPO, script), ...args], { cwd: REPO, input, maxBuffer: 256 << 20 }).toString();
const flatOf = (folder: string, side: string) => rigOf(parseJson(readFileSync(join(REPO, "res/pokemon", folder, `${side}_rig.json`), "utf8")));
const pichu = flatOf("pichu", "front");
const round = (p: Pair) => p.map((v) => Math.round(v * 1e6) / 1e6 + 0);

/** Both files as Save writes them, through the build's validators and checks: the errors of each (none: it saves). */
function saveChecks(src: V2): { source: unknown; rig: unknown; check: string[] } {
  const dir = mkdtempSync(join(tmpdir(), "rig-root-"));
  try {
    const sourceFile = join(dir, "front_rig_v2.json"), rigFile = join(dir, "front_rig.json");
    const sourceText = fileText(fromPlain({ $schema: "../battle_sprite_rig_v2.schema.json", ...src }), COMPACT);
    const rigText = fileText(dataOf(bakeV2(src).rig, "../battle_sprite_rig.schema.json"), COMPACT);
    writeFileSync(sourceFile, sourceText);
    writeFileSync(rigFile, rigText);
    const schema = JSON.parse(readFileSync(V2_SCHEMA, "utf8")) as Schema;
    assert.deepEqual(validate(parseJson(sourceText), schema, new Map()), [], "the editor's validator");
    return {
      source: JSON.parse(python("editor/server/python/validate.py", `${sourceFile}\t${V2_SCHEMA}\n`)),
      rig: JSON.parse(python("editor/server/python/validate.py", `${rigFile}\t${RIG_SCHEMA}\n`)),
      check: (JSON.parse(python("editor/server/python/rig_check.py", rigText)) as { errors: string[] }).errors,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a vanilla side's sequences deleted down to one new empty one saves: the stop strip goes, the timeline plays it", () => {
  const budew = flatOf("budew", "front");
  let src = convertToV2(budew);
  assert.equal(src.sequences.length, 2);
  assert.equal(src.strips?.length, 1, "Budew's front has a stop strip");
  // Before the fix: the stop strip emptied, which mcss_rig.check refuses (the user's "sequence 1 (CellAnime1) has no keys")
  src = addSequence(src).src;
  const notes: string[] = [];
  while (src.sequences.length > 1) src = deleteSequence(src, 0, notes);
  assert.equal(src.sequences[0].name, "Sequence");
  assert.equal(keyCount(src.sequences[0]), 0);
  assert.deepEqual(src.timeline.blocks, [{ sequence: 0 }]);
  assert.equal(src.strips, undefined, "the emptied stop strip is gone");
  assert.ok(notes.some((n) => n.includes("stop strip") && n.includes("gone")), notes.join(" | "));
  const saved = saveChecks(src);
  assert.deepEqual(saved, { source: { ok: true }, rig: { ok: true }, check: [] });
  // The empty sequence bakes to held keys: every part one key held its 48 frames, at its default pose
  const baked = bakeV2(src);
  assert.deepEqual(baked.warnings, []);
  assert.equal(baked.rig.sequences.length, 1);
  assert.deepEqual(baked.rig.sequences[0].keys.map((k) => [k.pose, k.frames]), [[0, 48]]);
  for (const t of baked.rig.tracks) {
    assert.equal(t.keys.length, 1, t.name);
    assert.equal(lengthOf(t), 48, t.name);
  }
  // The pause: no sequence 1, so it holds the loop's start (Pichu's rigs have none either)
  assert.equal(pichu.sequences.length, 1);
});

test("an empty timeline and an emptied strip bake to what the game takes, and the checks say so in plain words", () => {
  const budew = convertToV2(flatOf("budew", "front"));
  // An empty timeline (a hand-edited file): the bake plays the first sequence once, looping, and warns
  const empty: V2 = { ...budew, timeline: { ...budew.timeline, blocks: [] } };
  const baked = bakeV2(empty);
  assert.ok(baked.warnings.some((w) => w.startsWith("Nothing is on the timeline: the battle plays Sequence 1")), baked.warnings.join(" | "));
  assert.deepEqual(baked.rig.sequences[0].keys.map((k) => [k.pose, k.frames]), [[0, empty.sequences[0].frames]]);
  assert.deepEqual((JSON.parse(python("editor/server/python/rig_check.py", fileText(dataOf(baked.rig, "x"), COMPACT))) as { errors: string[] }).errors, []);
  // The stop strip emptied in the file: left out of the bake, warned
  const noStop: V2 = { ...budew, strips: [{ ...budew.strips![0], blocks: [] }] };
  const b2 = bakeV2(noStop);
  assert.equal(b2.rig.sequences.length, 1);
  assert.ok(b2.warnings.some((w) => w.includes("stop strip") && w.includes("left out")), b2.warnings.join(" | "));
  // An emptied strip before another keeps the later strips' numbers: it plays the timeline's first sequence
  const two: V2 = { ...budew, strips: [{ ...budew.strips![0], blocks: [] }, { name: "egg", blocks: [{ sequence: 1 }] }] };
  const b3 = bakeV2(two);
  assert.deepEqual(b3.rig.sequences.map((q) => q.keys.map((k) => k.pose)), [budew.timeline.blocks.map((b) => b.sequence), [0], [1]]);
  // Deleting down to an empty timeline puts the first sequence on it, with a note
  const notes: string[] = [];
  const one: V2 = { ...budew, timeline: { ...budew.timeline, blocks: [{ sequence: 1 }] } };
  const after = deleteSequence(one, 1, notes);
  assert.deepEqual(after.timeline.blocks, [{ sequence: 0 }]);
  assert.ok(notes.some((n) => n.startsWith("Nothing was left on the timeline, so it plays Sequence 1")), notes.join(" | "));
  // The check's own words, as the editor shows them
  assert.equal(checkText("sequence 1 (CellAnime1) has no keys", budew), "The stop strip (CellAnime1, the battle's pause) plays nothing. Delete and re-add a sequence, or undo the change that emptied it.");
  assert.equal(checkText("sequence 0 (stay) has no keys", budew), "Nothing is on the timeline (the battle's loop). Add a sequence to it in Timeline mode.");
  assert.match(checkText("picture 0's OBJ 1 is 24 by 8, not an OBJ size", budew), /^Piece .+ can't be cut into the DS's sprite sizes/);
  assert.match(checkText("something new", budew), /^The game's check refuses it: something new\. /);
});

/** Pichu's body, head and ear (the head the body's child, the ear connected to its tail); Idle 48 frames. */
function source(): V2 {
  const bones: V2Bone[] = [
    { name: "body", head: [4, -15], tail: [0, -18], parent: null, default: { piece: 0 } },
    { name: "head", head: [0, -18], tail: [-3, -23], parent: 0, default: { piece: 1 } },
    { name: "ear", head: [-3, -23], tail: [-6, -40], parent: 1, connected: true, default: { piece: 2 } },
  ];
  return {
    format: 2, side: "front", box: { width: 31, height: 45, x: 4, y: 3 }, stop_flags: 0, pause: true, keeps_moving: [],
    pieces: pichu.pictures.slice(0, 3).map((p, i) => ({ name: ["body", "head", "ear"][i], rectangles: p.rectangles, obj_attribute: p.obj_attribute })),
    bones, layers: [1, 2, 0], sequences: [{ name: "Idle", frames: 48, parts: [] }], timeline: { name: "stay", blocks: [{ sequence: 0 }] },
  };
}
/** Turned clockwise (y down) by degrees about the feet. */
const turned = (p: Pair, degrees: number): Pair => {
  const a = (degrees * Math.PI) / 180;
  return [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
};

test("the Root keyed: a turn at the midpoint turns every part about the feet; a move moves them all; the editor agrees", () => {
  let src = source();
  // K on the Root at 24 with a quarter turn (the gizmo's and the Part section's edit), linear so the midpoint is exact
  src = setKeyAt(src, 0, ROOT, 24, () => ({ rotation: 90 }));
  assert.deepEqual(src.sequences[0].root, { keys: [{ frame: 24, rotation: 90 }] });
  assert.deepEqual(src.sequences[0].parts, [], "the parts' lanes untouched");
  assert.deepEqual(rowKeys(src, 0, ROOT).map((k) => [k.frame, k.implicit]), [[0, true], [24, false], [48, true]]);
  const baked = bakeV2(src);
  assert.deepEqual(baked.warnings, []);
  assert.equal(baked.rig.tracks.length, 3, "the root is no track of its own");
  // At 24 every bone's pivot and tail is where the quarter turn about the feet puts it
  const pivots: Pair[] = [[4, -15], [0, -18], [-3, -23]];
  const tails: Pair[] = [[0, -18], [-3, -23], [-6, -40]];
  for (let b = 0; b < 3; b++) {
    assert.deepEqual(round(bakedPoint(baked, src, 0, b, 24, [0, 0])), round(turned(pivots[b], 90)), `${src.bones[b].name}'s pivot`);
    const tail: Pair = [tails[b][0] - pivots[b][0], tails[b][1] - pivots[b][1]];
    assert.deepEqual(round(bakedPoint(baked, src, 0, b, 24, tail)), round(turned(tails[b], 90)), `${src.bones[b].name}'s tail`);
    // At 0 and the loop's end, at rest
    assert.deepEqual(round(bakedPoint(baked, src, 0, b, 0, [0, 0])), pivots[b]);
  }
  // The editor's posed bones and the root's gizmo place agree with the bake
  const maps = posedMaps(src, 0, 24);
  for (let b = 0; b < 3; b++) assert.deepEqual(round(boneEnds(src, maps, b).head), round(turned(pivots[b], 90)));
  assert.deepEqual(round(partHead(src, maps, ROOT)), [0, 0], "the feet stay where they are under a turn");
  assert.equal(partValues(src, 0, ROOT, 24).rotation, 90);
  // A move of the root: every part moved by it (whole pixels), the root's gizmo with it
  let moved = setKeyAt(source(), 0, ROOT, 24, () => ({ move: [5, -3] }));
  const bm = bakeV2(moved);
  for (let b = 0; b < 3; b++) assert.deepEqual(round(bakedPoint(bm, moved, 0, b, 24, [0, 0])), [pivots[b][0] + 5, pivots[b][1] - 3]);
  assert.deepEqual(round(partHead(moved, posedMaps(moved, 0, 24), ROOT)), [5, -3]);
  // The root's keys move and delete like a part's; none left, no root
  moved = moveKeys(moved, 0, [{ bone: ROOT, index: 0 }], 6).src;
  assert.equal(moved.sequences[0].root!.keys[0].frame, 30);
  moved = deleteKeys(moved, 0, [{ bone: ROOT, index: 0 }, { bone: ROOT, index: START }]).src;
  assert.equal(moved.sequences[0].root, undefined);
  // Through both validators and the game's checks
  assert.deepEqual(saveChecks(src), { source: { ok: true }, rig: { ok: true }, check: [] });
});

test("the Root's preview equals mcss.render of the bake, and the root goes on composing through reparenting", async () => {
  let src = source();
  src = setKeyAt(src, 0, ROOT, 12, () => ({ rotation: -15, move: [2, -6] }));
  src = setKeyAt(src, 0, ROOT, 30, () => ({ scale: [1.25, 0.8] }));
  src = setKeyAt(src, 0, 1, 24, () => ({ rotation: 20 }));
  const baked = bakeV2(src);
  const preview = sequenceRig(baked.rig, 0, 48);
  const png = readFileSync(join(REPO, "res/pokemon/pichu/front.png"));
  const sheet = (await readIndexedPng(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer)).pixels;
  const times = [0, 6, 11, 12, 18, 24, 29, 30, 36, 42, 47, 48, 55];
  const want = JSON.parse(python("editor/tests/mcss_render_rig.py", JSON.stringify(baked.rig), "res/pokemon/pichu/front.png", "front", `0:${times.join(",")}`)) as
    { time: number; width: number; height: number; origin: Pair; pixels: string }[];
  let changed = 0;
  const still = render(preview as Rig, sheet, 0, 0);
  for (const w of want) {
    const got = render(preview as Rig, sheet, 0, w.time);
    assert.deepEqual([got.width, got.height, got.originX, got.originY], [w.width, w.height, ...w.origin], `at ${w.time}`);
    assert.ok(Buffer.from(w.pixels, "hex").equals(Buffer.from(got.pixels)), `at ${w.time}: the pixels`);
    if (!Buffer.from(got.pixels).equals(Buffer.from(still.pixels))) changed++;
  }
  assert.ok(changed >= 6, `the root moves the sprite (${changed} of ${times.length} frames differ from frame 0)`);
  // The head freed to the root keeping its transform: the bake draws the same (its keys written under the root's movement)
  const freed = reparentKeep(src, 1, null);
  assert.equal(freed.bones[1].parent, null);
  const bf = bakeV2(freed);
  for (const t of [0, 12, 24, 36]) {
    const a = render(sequenceRig(baked.rig, 0, 48) as Rig, sheet, 0, t), b = render(sequenceRig(bf.rig, 0, 48) as Rig, sheet, 0, t);
    let off = 0;
    for (let i = 0; i < a.pixels.length; i++) if (a.pixels[i] !== b.pixels[i]) off++;
    assert.ok(off <= 12, `at ${t}: ${off} pixels differ (the turn's rounding)`);
  }
});

test("the rig setup's Root moves, turns and scales the whole default pose about the feet", () => {
  const src = source();
  const before = restMaps(src);
  const moved = moveDefaultPose(src, { move: [3, -2] });
  assert.deepEqual(moved.bones[0].default, { piece: 0, move: [3, -2] }, "the body (no parent) takes it; its children follow");
  assert.deepEqual(moved.bones[1].default, src.bones[1].default);
  const after = restMaps(moved);
  for (let b = 0; b < 3; b++) {
    const h0 = boneEnds(src, before, b).head, h1 = boneEnds(moved, after, b).head;
    assert.deepEqual(round([h1[0] - h0[0], h1[1] - h0[1]]), [3, -2]);
  }
  const quarter = moveDefaultPose(src, { rotation: 90 });
  const qm = restMaps(quarter);
  for (let b = 0; b < 3; b++) assert.deepEqual(round(boneEnds(quarter, qm, b).head), round(turned(boneEnds(src, before, b).head, 90)));
  assert.equal(quarter.bones[0].default!.rotation, 90);
});

test("a side's rig files are the Rig Editor's to save: other editors' saves and save-everything skip them", async () => {
  const { isRigFile } = await import("../src/modules/rig/setupFiles.ts");
  for (const p of ["res/pokemon/applin/front_rig.json", "res/pokemon/applin/front_rig_v2.json", "res/pokemon/pichu/form_1/back_rig_source.json"]) assert.ok(isRigFile(p), p);
  for (const p of ["res/pokemon/applin/data.json", "res/pokemon/battle_sprite_rig_v2.schema.json", "res/pokemon/applin/front.png"]) assert.ok(!isRigFile(p), p);
});
