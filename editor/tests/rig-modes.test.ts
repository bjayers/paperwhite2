// The Rig Editor's Edit and Pose modes (src/modules/rig/): the Pivot tool keeps what a part draws where it is on screen, in
// every frame, flat or with an armature; parenting a flat rig converts it and bakes back to the file byte for byte before
// any key changes; one history across the flat rig's and the armature's documents undoes a gizmo drag, an auto-key split
// and an automatic conversion exactly, and redoes them; Edit mode's rest view. Reads res/, writes nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectLayout, fileText, fromPlain, getIn, parseJson, type JsonValue, type Layout } from "../shared/json.ts";
import { documents } from "../src/documents.ts";
import { frameQuads, lengthOf, quadCorners, type Pair, type Rig } from "../src/modules/rig/mcss.ts";
import { copyPose, dataOf, restRig, rigOf } from "../src/modules/rig/model.ts";
import { bake, convertToArmature, keyPoseAt, movePivot, reparent, resizeBlock, type Source } from "../src/modules/rig/armature.ts";
import { RigHistory } from "../src/modules/rig/history.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const COMPACT: Layout = { width: 120, indent: 2, compact: true };
const text = (folder: string, side: string) => readFileSync(join(ROOT, "res/pokemon", folder, `${side}_rig.json`), "utf8");
const rigAt = (folder: string, side: string) => rigOf(parseJson(text(folder, side)));

/** Every drawn rectangle's corners for each part of a rig, every 4 frames of each sequence. */
function corners(rig: Rig): Map<string, Pair[]> {
  const out = new Map<string, Pair[]>();
  rig.sequences.forEach((seq, n) => {
    for (let t = 0; t < lengthOf(seq); t += 4) {
      const state = frameQuads(rig, n, t);
      for (const q of state.quads) out.set(`${n}/${t}/${state.pose}/${q.part}/${q.rectangleIndex}`, quadCorners(q));
    }
  });
  return out;
}

/** The largest distance between two rigs' corners, per part (by name), and over those parts of `except`. */
function drift(a: Rig, b: Rig, tracks: Set<number>): { moved: number; others: number } {
  const ca = corners(a), cb = corners(b);
  assert.deepEqual([...ca.keys()], [...cb.keys()]);
  let moved = 0, others = 0;
  const partTrack = (key: string) => {
    const [, , pose, part] = key.split("/").map(Number);
    return a.poses[pose].parts[part].track;
  };
  for (const [key, ps] of ca) {
    const qs = cb.get(key)!;
    const d = Math.max(...ps.map((p, i) => Math.hypot(p[0] - qs[i][0], p[1] - qs[i][1])));
    if (tracks.has(partTrack(key))) moved = Math.max(moved, d);
    else others = Math.max(others, d);
  }
  return { moved, others };
}

const trackOf = (rig: Rig, name: string) => rig.tracks.findIndex((t) => t.name === name);
const partOf = (rig: Rig, pose: number, track: number) => rig.poses[pose].parts.findIndex((p) => p.track === track);

test("the Pivot tool keeps the picture where it is on screen, in every frame of every action (flat rig)", () => {
  for (const [folder, name] of [["pichu/form_1", "ear_r_a"], ["pichu/form_1", "head_a"], ["pichu", "tail_a"]]) {
    const rig = rigAt(folder, "front");
    const track = trackOf(rig, name);
    assert.ok(track >= 0, name);
    const part = partOf(rig, 0, track);
    const done = movePivot(rig, 0, part, [5, -3]);
    // The pivot moved; nothing else the part's own
    assert.deepEqual(done.rig.poses[0].parts[part].pivot, [rig.poses[0].parts[part].pivot[0] + 5, rig.poses[0].parts[part].pivot[1] - 3]);
    // (the bug this fixes: only the pivot changed, and the picture went with it)
    const naive = { ...rig, poses: rig.poses.map((p, i) => (i !== 0 ? p : { ...p, parts: p.parts.map((q, k) => (k === part ? { ...q, pivot: [q.pivot[0] + 5, q.pivot[1] - 3] as Pair } : q)) })) };
    assert.ok(drift(rig, naive, new Set([track])).moved > 4, `${folder} ${name}: moving the pivot alone moves the picture`);
    const d = drift(rig, done.rig, new Set([track]));
    assert.equal(d.others, 0, `${folder} ${name}: other parts untouched`);
    // (a key that turns has its move rounded to a whole pixel: within a pixel)
    assert.ok(d.moved <= 1.01, `${folder} ${name}: the part drew within ${d.moved} px of where it was`);
    // Where no key turns or scales, exactly
    const turns = rig.tracks[track].keys.some((k) => k.rotation || (k.scale && (k.scale[0] !== 1 || k.scale[1] !== 1)));
    if (!turns) assert.equal(d.moved, 0);
  }
});

test("the Pivot tool: an exact case, a turned key, and a shared track moves every part that plays it", () => {
  const rig = rigAt("pichu/form_1", "front");
  const track = trackOf(rig, "ear_r_a");
  const part = partOf(rig, 0, track);
  // Share the track with a copy of the action: both actions' parts move their pivots, and both keep their pictures
  const shared = copyPose(rig, 0, 2, false);
  const done = movePivot(shared, 0, part, [-4, 2]);
  assert.deepEqual(done.rig.poses[2].parts[part].pivot, [shared.poses[2].parts[part].pivot[0] - 4, shared.poses[2].parts[part].pivot[1] + 2]);
  assert.ok(drift(shared, done.rig, new Set([track])).moved <= 1.01);
  // Zero movement is no change
  assert.equal(movePivot(rig, 0, part, [0, 0]).rig, rig);
});

test("a picture two parts show is copied for the part whose pivot moves, so the other keeps its place", () => {
  const rig = rigAt("pichu/form_1", "front");
  const a = trackOf(rig, "ear_l_a"), b = trackOf(rig, "ear_r_a");
  // Make the right ear show the left ear's picture too
  const picture = rig.tracks[a].keys[0].picture!;
  const tracks = rig.tracks.map((t, i) => (i === b ? { ...t, keys: t.keys.map((k) => ({ ...k, picture })) } : t));
  const shared = { ...rig, tracks };
  const done = movePivot(shared, 0, partOf(shared, 0, a), [3, 3]);
  assert.equal(done.copied, 1);
  assert.equal(done.rig.pictures.length, shared.pictures.length + 1);
  const d = drift(shared, done.rig, new Set([a]));
  assert.equal(d.others, 0);
  assert.ok(d.moved <= 1.01);
});

test("the Pivot tool with an armature: key poses are corrected, the bake draws what it drew", () => {
  const rig = rigAt("pichu/form_1", "front");
  const head = trackOf(rig, "head_a"), ear = trackOf(rig, "ear_r_a"), body = trackOf(rig, "body_a");
  let source = convertToArmature(rig);
  source = reparent(source, rig, head, body);
  source = reparent(source, rig, ear, head);
  const baked = bake(source, rig).rig;
  const done = movePivot(baked, 0, partOf(baked, 0, ear), [4, -6], source);
  assert.ok(done.source);
  const after = bake(done.source!, done.rig);
  assert.deepEqual(after.warnings, []);
  const d = drift(baked, after.rig, new Set([ear]));
  assert.equal(d.others, 0, "the parents and the other parts are as they were");
  assert.ok(d.moved <= 1.01, `the ear drew within ${d.moved} px`);
  // And the part's pivot really is elsewhere
  assert.notDeepEqual(after.rig.poses[0].parts[partOf(after.rig, 0, ear)].pivot, baked.poses[0].parts[partOf(baked, 0, ear)].pivot);
});

test("parenting a flat rig converts it first, and bakes back to the file byte for byte before any key changes", () => {
  for (const folder of ["pichu", "pichu/form_1"]) {
    const original = text(folder, "front");
    const data = parseJson(original);
    const rig = rigOf(data);
    const name = (n: string) => rig.tracks.findIndex((t) => t.name === n);
    // What the editor does for the first parenting: convert as it is, then reparent
    let source = convertToArmature(rig);
    source = reparent(source, rig, name("head_a"), name("body_a"));
    source = reparent(source, rig, name("ear_l_a"), name("head_a"));
    source = reparent(source, rig, name("ear_r_a"), name("head_a"));
    const out = bake(source, rig);
    assert.deepEqual(out.warnings, [], folder);
    assert.equal(fileText(dataOf(out.rig, getIn(data, ["$schema"])), detectLayout(original, data)!), original, folder);
  }
});

test("Edit mode's rest view: each part at how its track begins, nothing played", () => {
  const rig = rigAt("pichu/form_1", "front");
  const rest = restRig(rig, 1);
  assert.equal(rest.tracks.length, rig.tracks.length);
  assert.ok(rest.tracks.every((t) => t.keys.length === 1));
  assert.ok(rest.sequences.every((s) => s.keys.length === 1 && s.keys[0].pose === 1));
  // The same at any time, and what the track's first key draws
  const first = frameQuads(rest, 0, 0), later = frameQuads(rest, 0, 977);
  assert.deepEqual(first.quads.map((q) => quadCorners(q)), later.quads.map((q) => quadCorners(q)));
  const start = frameQuads(rig, 0, 240).quads.map((q) => quadCorners(q));
  // (action 1's parts at its first frame: the rest view draws them the same, the parts of this sprite restarting there)
  assert.deepEqual(first.quads.map((q) => quadCorners(q)), start);
});

// ---------------------------------------------------------------- One history across the two documents

const FLAT = "res/test/front_rig.json";
const SOURCE = "res/test/front_rig_source.json";
const SOURCE_SCHEMA = "res/pokemon/battle_sprite_rig_source.schema.json";
const sourceData = (s: Source): JsonValue => fromPlain({ $schema: "../battle_sprite_rig_source.schema.json", ...s });
const flatText = () => fileText(documents.get(FLAT)!.data!, COMPACT);
const sourceText = () => (documents.get(SOURCE)?.data ? fileText(documents.get(SOURCE)!.data!, COMPACT) : null);

/** What the page does: the flat rig kept as the armature bakes. */
function rebake() {
  const s = documents.get(SOURCE);
  const f = documents.get(FLAT)!;
  if (!s?.data) return;
  const flat = rigOf(f.data!);
  const source = rigOf(s.data) as unknown as Source;
  documents.amend(FLAT, [], dataOf(bake(source, flat).rig, "../battle_sprite_rig.schema.json"));
}

function setup(withSource: boolean) {
  const rig = rigAt("pichu/form_1", "front");
  documents.create(FLAT, "res/pokemon/battle_sprite_rig.schema.json", dataOf(rig, "../battle_sprite_rig.schema.json"), COMPACT);
  documents.stash(SOURCE);
  if (withSource) documents.create(SOURCE, SOURCE_SCHEMA, sourceData(convertToArmature(rig)), COMPACT);
  let stashed: ReturnType<typeof documents.stash>;
  const history = new RigHistory({
    canUndo: (p) => documents.canUndo(p), canRedo: (p) => documents.canRedo(p), undo: (p) => documents.undo(p), redo: (p) => documents.redo(p),
    restore: (p, data) => documents.amend(p, [], data),
  }, (hidden) => {
    if (hidden) stashed = documents.stash(SOURCE);
    else if (stashed) { documents.restore(stashed); stashed = undefined; }
  });
  return { rig, history };
}

/** A gizmo drag in armature mode: the first change starts the step, the later ones amend it; the flat rig re-bakes. */
function drag(history: RigHistory, bone: number, frame: number, rotations: number[]) {
  const source = rigOf(documents.get(SOURCE)!.data!) as unknown as Source;
  const rig = rigOf(documents.get(FLAT)!.data!);
  const b = source.bones[bone];
  rotations.forEach((rotation, i) => {
    const phase = i === 0 ? "start" : "move";
    const { keys } = keyPoseAt(b.keys, frame, b.frames, true, (k) => ({ ...k, rotation }), "ease_in_out");
    const data = sourceData({ ...source, bones: source.bones.map((x, n) => (n === bone ? { ...x, keys } : x)) });
    if (phase === "start") documents.replace(SOURCE, data);
    else documents.amend(SOURCE, [], data);
    history.note([SOURCE], phase);
    rebake();
  });
  void rig;
}

test("undo after a gizmo drag and after an auto-key split in armature mode restores exactly, and redo brings it back", () => {
  const { rig, history } = setup(true);
  const ear = rig.tracks.findIndex((t) => t.name === "ear_r_a");
  const before = { flat: flatText(), source: sourceText() };
  // A drag of the Rotate gizmo at frame 30: many moves, one step (the key pose at 30 is new: an auto-key split)
  drag(history, ear, 30, [4, 9, 15, 22]);
  const dragged = { flat: flatText(), source: sourceText() };
  assert.notEqual(dragged.source, before.source);
  assert.notEqual(dragged.flat, before.flat);
  // A second drag, on an existing key pose
  drag(history, ear, 30, [25, 30]);
  const second = { flat: flatText(), source: sourceText() };
  assert.notEqual(second.source, dragged.source);

  assert.equal(history.undo([SOURCE, FLAT]), true);
  rebake();
  assert.deepEqual({ flat: flatText(), source: sourceText() }, dragged, "one undo undoes the whole second drag");
  assert.equal(history.undo([SOURCE, FLAT]), true);
  rebake();
  assert.deepEqual({ flat: flatText(), source: sourceText() }, before, "and one the whole first drag");
  assert.equal(history.undo([SOURCE, FLAT]), false, "nothing more to undo");
  assert.equal(history.redo([SOURCE, FLAT]), true);
  rebake();
  assert.deepEqual({ flat: flatText(), source: sourceText() }, dragged);
  assert.equal(history.redo([SOURCE, FLAT]), true);
  rebake();
  assert.deepEqual({ flat: flatText(), source: sourceText() }, second);
  assert.equal(history.redo([SOURCE, FLAT]), false);
});

test("a step that changed both documents (a pivot) is one undo; a step with nothing left to undo is skipped, not a dead key press", () => {
  const { rig, history } = setup(true);
  const ear = rig.tracks.findIndex((t) => t.name === "ear_r_a");
  const before = { flat: flatText(), source: sourceText() };
  const baked = bake(rigOf(documents.get(SOURCE)!.data!) as unknown as Source, rigOf(documents.get(FLAT)!.data!)).rig;
  const done = movePivot(baked, 0, partOf(baked, 0, ear), [3, -2], rigOf(documents.get(SOURCE)!.data!) as unknown as Source);
  // The page's commit: both documents, one step (a drag's moves amend it)
  documents.replace(FLAT, dataOf(done.rig, "../battle_sprite_rig.schema.json"));
  documents.replace(SOURCE, sourceData(done.source!));
  history.note([FLAT, SOURCE], "start");
  rebake();
  const moved = { flat: flatText(), source: sourceText() };
  assert.notEqual(moved.flat, before.flat);
  // A step noted for a document that was reverted since: nothing to undo there
  history.note([SOURCE], "typed");
  documents.undo(SOURCE); // (an undo made elsewhere took the source's step already: the history's second entry has nothing left)
  assert.equal(history.undo([SOURCE, FLAT]), true, "the dead step is skipped and the pivot step undone");
  rebake();
  assert.deepEqual({ flat: flatText(), source: sourceText() }, before);
});

test("an armature made by the first parenting or key pose is part of the step: undo takes it away and gives the flat rig back, redo restores it with its edits", () => {
  const { rig, history } = setup(false);
  const original = flatText();
  assert.equal(sourceText(), null);
  // The page: a drag in Pose mode on a sprite with no armature. The first move makes the armature (joined to the step)...
  const made = convertToArmature(rig);
  history.created({ source: SOURCE, flat: FLAT, flatData: documents.get(FLAT)!.data! }, true);
  documents.create(SOURCE, SOURCE_SCHEMA, sourceData(made), COMPACT);
  const ear = rig.tracks.findIndex((t) => t.name === "ear_r_a");
  drag(history, ear, 40, [6, 12]);
  const edited = { flat: flatText(), source: sourceText() };
  assert.notEqual(edited.flat, original);
  // ...and one Ctrl+Z undoes both
  assert.equal(history.undo([SOURCE, FLAT]), true);
  rebake();
  assert.equal(sourceText(), null, "the armature is gone");
  assert.equal(flatText(), original, "the flat rig is what it was, byte for byte");
  assert.equal(history.undo([SOURCE, FLAT]), false);
  assert.equal(history.redo([SOURCE, FLAT]), true);
  rebake();
  assert.deepEqual({ flat: flatText(), source: sourceText() }, edited, "redo: the armature and the edit are back");

  // Parenting on a flat rig: the conversion is a step of its own, undone to the flat rig
  documents.stash(SOURCE);
  documents.amend(FLAT, [], dataOf(rig, "../battle_sprite_rig.schema.json"));
  const h2 = new RigHistory({
    canUndo: (p) => documents.canUndo(p), canRedo: (p) => documents.canRedo(p), undo: (p) => documents.undo(p), redo: (p) => documents.redo(p),
    restore: (p, data) => documents.amend(p, [], data),
  }, (hidden) => { if (hidden) documents.stash(SOURCE); });
  const name = (n: string) => rig.tracks.findIndex((t) => t.name === n);
  h2.created({ source: SOURCE, flat: FLAT, flatData: documents.get(FLAT)!.data! });
  documents.create(SOURCE, SOURCE_SCHEMA, sourceData(reparent(convertToArmature(rig), rig, name("ear_r_a"), name("head_a"))), COMPACT);
  rebake();
  assert.equal(flatText(), original, "parenting alone changes no key");
  assert.equal(h2.undo([SOURCE, FLAT]), true);
  assert.equal(sourceText(), null);
  assert.equal(flatText(), original);
});

test("changing a sequence block's length moves the key poses after it and nothing before it (NLA-like)", () => {
  const seq = { key_type: "srt" as const, frames: 348, keys: [{ frame: 0, pose: 0 }, { frame: 30, pose: 0, rotation: 5 }, { frame: 240, pose: 1 }, { frame: 348, pose: 1 }] };
  const longer = resizeBlock(seq, 240, 30);
  assert.deepEqual(longer.keys.map((k) => k.frame), [0, 30, 270, 378]);
  assert.equal(longer.frames, 378);
  const shorter = resizeBlock(seq, 240, -60);
  assert.deepEqual(shorter.keys.map((k) => k.frame), [0, 30, 180, 288]);
  assert.equal(shorter.frames, 288);
  assert.equal(resizeBlock(seq, 240, 0), seq);
});
