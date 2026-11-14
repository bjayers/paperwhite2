// The Rig Editor v2's Inherit scale (v2.ts InheritScale; rig-editor-v2.md, "Built: Inherit scale"): a child under a
// parent's uneven scale aligned (no shear, its head where the parent's whole movement puts it, its pictures rectangles
// scaled by the parent's x and y along its own turned axes), none (not scaled), full (as before: the nearest turn and
// scale, warned of), a chain of three, the preview's posed bones on the bake's quads, the bake drawn as mcss.render
// draws it, and reparentKeep and moveHead keeping the pixels under each mode. Reads res/, writes nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileText, fromPlain, parseJson } from "../shared/json.ts";
import { validate, type Schema } from "../shared/schema.ts";
import { orderedV2 } from "../src/modules/rig/v2.ts";
import { readIndexedPng } from "../src/modules/palettes/png.ts";
import { inverse, keyOfMap, partMap, rounded, shift, srtOfKey, then } from "../src/modules/rig/armature.ts";
import { canvasOf, forward, frameQuads, keyAt, quadBox, quadCorners, render, type Canvas, type Pair, type Rig } from "../src/modules/rig/mcss.ts";
import { rigOf } from "../src/modules/rig/model.ts";
import { posedMaps } from "../src/modules/rig/sequences.ts";
import { moveHead, pivotOf, placed, reparentKeep, setInheritScale } from "../src/modules/rig/setup.ts";
import { bakedPoint, bakeV2, inheritScaleOf, turnOf, type InheritScale, type V2, type V2Key } from "../src/modules/rig/v2.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const pichu = rigOf(parseJson(readFileSync(join(ROOT, "res/pokemon/pichu/front_rig.json"), "utf8")));

/** Pichu's body, head and ear (the head the body's child keeping its offset, the ear connected to the head's tail), the
 * head's and ear's Inherit scale as given; one sequence with the keys given by bone. */
function source(parts: Record<number, V2Key[]>, head?: InheritScale, ear?: InheritScale, frames = 24): V2 {
  return {
    format: 2, side: "front", box: { width: 31, height: 45, x: 4, y: 3 }, stop_flags: 0, pause: true, keeps_moving: [],
    pieces: pichu.pictures.slice(0, 3).map((p, i) => ({ name: ["body", "head", "ear"][i], rectangles: p.rectangles, obj_attribute: p.obj_attribute })),
    bones: [
      { name: "body", head: [4, -15], tail: [0, -18], parent: null, default: { piece: 0 } },
      { name: "head", head: [0, -18], tail: [-3, -23], parent: 0, ...(head ? { inherit_scale: head } : {}), default: { piece: 1 } },
      { name: "ear", head: [-3, -23], tail: [-6, -40], parent: 1, connected: true, ...(ear ? { inherit_scale: ear } : {}), default: { piece: 2 } },
    ],
    layers: [1, 2, 0],
    sequences: [{ name: "Idle", frames, parts: Object.entries(parts).map(([b, keys]) => ({ bone: Number(b), keys })) }],
    timeline: { name: "stay", blocks: [{ sequence: 0 }] },
  };
}
/** The body scaled 2 across, the head turned 30 degrees, the ear 20 more, held. */
const stretched = (head?: InheritScale, ear?: InheritScale) => source({
  0: [{ frame: 0, scale: [2, 1], curve: "constant" }], 1: [{ frame: 0, rotation: 30, curve: "constant" }], 2: [{ frame: 0, rotation: 20, curve: "constant" }],
}, head, ear);

/** A part's first quad's corners on the sprite (y up) at a time: top left, top right, bottom left, bottom right. */
function corners(rig: Rig, track: number, time: number): Pair[] {
  const q = frameQuads(rig, 0, time).quads.find((x) => x.track === track && x.rectangleIndex === 0);
  assert.ok(q, `track ${track} is drawn`);
  return quadCorners(q);
}
const sub = (a: Pair, b: Pair): Pair => [a[0] - b[0], a[1] - b[1]];
const near = (a: Pair, b: Pair, tolerance: number, what: string) =>
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance, `${what}: ${JSON.stringify(a)} against ${JSON.stringify(b)}`);
/** A quad's edges (width, height, y up) against the analytic turn and scale of its part. */
function edgesAre(c: Pair[], turnDegrees: number, scale: Pair, size: Pair, what: string) {
  near(sub(c[1], c[0]), forward(size[0], 0, [turnOf(turnDegrees), scale[0], scale[1], 0, 0]), 0.02, `${what}: the width edge`);
  near(sub(c[2], c[0]), forward(0, -size[1], [turnOf(turnDegrees), scale[0], scale[1], 0, 0]), 0.02, `${what}: the height edge`);
  const w = sub(c[1], c[0]), h = sub(c[2], c[0]);
  assert.ok(Math.abs(w[0] * h[0] + w[1] * h[1]) / (Math.hypot(...w) * Math.hypot(...h)) < 1e-3, `${what}: a rectangle (its edges square)`);
}

test("the default: aligned under a parent, full for a root bone; written only where it isn't", () => {
  const src = stretched();
  assert.deepEqual(src.bones.map(inheritScaleOf), ["full", "aligned", "aligned"]);
  const full = setInheritScale(src, 1, "full");
  assert.equal(full.bones[1].inherit_scale, "full");
  assert.equal(setInheritScale(full, 1, "aligned").bones[1].inherit_scale, undefined, "the default isn't written");
  assert.equal(setInheritScale(src, 0, "aligned").bones[0].inherit_scale, "aligned", "a root bone's aligned is written (against the root)");
});

test("inherit_scale passes the editor's validator and the build's; another word is refused by both", () => {
  const V2_SCHEMA = join(ROOT, "res/pokemon/battle_sprite_rig_v2.schema.json");
  const schema = JSON.parse(readFileSync(V2_SCHEMA, "utf8")) as Schema;
  const dir = mkdtempSync(join(tmpdir(), "rig-inherit-"));
  try {
    const text = fileText(fromPlain({ $schema: "../battle_sprite_rig_v2.schema.json", ...orderedV2(stretched("full", "none")) }), { width: 120, indent: 2, compact: true });
    const bones = text.slice(text.indexOf('"bones"'));
    const ear = bones.slice(bones.indexOf('"name": "ear"'));
    assert.ok(ear.indexOf('"connected"') < ear.indexOf('"inherit_scale": "none"') && ear.indexOf('"inherit_scale"') < ear.indexOf('"default"'), "written after connected");
    const file = join(dir, "front_rig_v2.json");
    const check = (t: string) => {
      writeFileSync(file, t);
      return [validate(parseJson(t), schema, new Map()).length === 0,
              (JSON.parse(execFileSync("python3", ["-I", join(ROOT, "editor/server/python/validate.py")], { cwd: ROOT, input: `${file}\t${V2_SCHEMA}\n` }).toString()) as { ok: boolean }).ok];
    };
    assert.deepEqual(check(text), [true, true]);
    assert.deepEqual(check(text.replace('"inherit_scale": "full"', '"inherit_scale": "half"')), [false, false]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("aligned under an uneven-scaled parent: no shear; the head where the full movement puts it; a rectangle scaled along its own axes", () => {
  const aligned = bakeV2(stretched());
  assert.deepEqual(aligned.warnings, []);
  assert.deepEqual(aligned.sheared, []);
  const full = bakeV2(stretched("full", "full"));
  assert.ok(full.warnings.some((w) => w.includes("head_a") && w.includes("shear") && w.includes("Aligned")), full.warnings.join("; "));
  assert.deepEqual(full.sheared, [1, 2]);
  // The head's pivot: the body's (4, -15) plus (-4, -3) from it, scaled 2 across: (-4, -18) under both modes
  assert.deepEqual(bakedPoint(aligned, stretched(), 0, 1, 0, [0, 0]), [-4, -18]);
  assert.deepEqual(bakedPoint(full, stretched("full", "full"), 0, 1, 0, [0, 0]), [-4, -18]);
  // Its picture: turned 30 degrees and 2 along its own x, 1 along its own y
  const head = pichu.pictures[1].rectangles[0];
  edgesAre(corners(aligned.rig, aligned.trackOf.get("0/1")!, 0), 30, [2, 1], head.size, "the aligned head");
  // A chain of three: the ear (connected to the head's tail) turned 50 in all, the head's effective (2, 1) along its axes
  const ear = pichu.pictures[2].rectangles[0];
  edgesAre(corners(aligned.rig, aligned.trackOf.get("0/2")!, 0), 50, [2, 1], ear.size, "the aligned ear");
  // ...its head on the head's tail as the head is drawn (moves round to whole pixels)
  near(bakedPoint(aligned, stretched(), 0, 2, 0, [0, 0]), bakedPoint(aligned, stretched(), 0, 1, 0, [-3, -5]), 1, "the ear's head on the head's tail");
});

test("none: the place and the turn follow the parent, the scale doesn't", () => {
  const src = stretched("none", "none");
  const baked = bakeV2(src);
  assert.deepEqual(baked.warnings, []);
  assert.deepEqual(bakedPoint(baked, src, 0, 1, 0, [0, 0]), [-4, -18]);
  edgesAre(corners(baked.rig, baked.trackOf.get("0/1")!, 0), 30, [1, 1], pichu.pictures[1].rectangles[0].size, "the head");
  edgesAre(corners(baked.rig, baked.trackOf.get("0/2")!, 0), 50, [1, 1], pichu.pictures[2].rectangles[0].size, "the ear");
});

test("full is the parent's whole movement as before; every mode agrees where the parent's scale is even", () => {
  const src = stretched("full", "full");
  const baked = bakeV2(src);
  // The head's key: the parent's baked key about its pivot after the head's own, the nearest turn and scale (the bake's rule before Inherit scale)
  const body = baked.rig.tracks[baked.trackOf.get("0/0")!];
  const ps = srtOfKey(keyAt(body, 0).key, body.key_type);
  const world = then(partMap([turnOf(30), 1, 1, 0, 0], [0, -18]), then(inverse(shift(4, 15)), partMap(ps, [4, -15])));
  const want = rounded(keyOfMap(world, [0, -18], turnOf(30)).srt);
  const head = baked.rig.tracks[baked.trackOf.get("0/1")!].keys[0];
  assert.deepEqual([head.rotation, head.scale![0], head.scale![1], head.move![0], head.move![1]], want);
  // An even scale (and a flip): the three modes bake the same rig
  for (const scale of [[1.5, 1.5], [-1, 1], [-2, -2]] as Pair[]) {
    const even = (m?: InheritScale) => bakeV2(source({ 0: [{ frame: 0, scale, curve: "constant" }], 1: [{ frame: 0, rotation: 30, curve: "constant" }],
                                                       2: [{ frame: 0, rotation: 20, curve: "constant" }] }, m, m)).rig;
    assert.deepEqual(even("aligned"), even("full"), `aligned is full under ${scale}`);
    if (scale[0] === scale[1] && scale[0] > 0) continue;
    assert.deepEqual(even("none").tracks[1].keys[0].rotation, even("full").tracks[1].keys[0].rotation);
  }
  // Unturned children: the same too
  const unturned = (m?: InheritScale) => bakeV2(source({ 0: [{ frame: 0, scale: [2, 1], curve: "constant" }] }, m, m)).rig;
  assert.deepEqual(unturned("aligned"), unturned("full"));
});

/** A sequence where everything moves: the body stretching (eased), the head and the ear turning and the head moving. */
const moving = (head?: InheritScale, ear?: InheritScale) => source({
  0: [{ frame: 12, scale: [1.5, 0.8] }],
  1: [{ frame: 6, rotation: 25 }, { frame: 18, rotation: -15, move: [2, -1] }],
  2: [{ frame: 12, rotation: 35, scale: [1, 1.25] }],
}, head, ear);

test("the preview's posed bones are where the bake draws them, under each mode", () => {
  for (const mode of ["aligned", "full", "none"] as InheritScale[]) {
    const src = moving(mode, mode);
    const baked = bakeV2(src);
    for (const t of [0, 6, 12, 18]) {
      const maps = posedMaps(src, 0, t);
      for (const b of [0, 1, 2]) {
        const r = pichu.pictures[b].rectangles[0];
        const pivot = pivotOf(src, b);
        // The quad's corners from the bone's map (the rest arrangement, y down) against the baked quad (y up)
        const rest: Pair[] = [[0, 0], [r.size[0], 0], [0, r.size[1]], [r.size[0], r.size[1]]].map(([u, v]) => [pivot[0] + r.at[0] + u, pivot[1] - r.at[1] + v]);
        const got = corners(baked.rig, baked.trackOf.get(`0/${b}`)!, t);
        // (full shears where the bake can't, so only its place is compared; the bake rounds moves to whole pixels)
        rest.forEach((p, k) => {
          const y = placed(maps[b], p);
          if (mode !== "full" || b === 0) near([y[0], -y[1]], got[k], 1.5, `${mode}, ${src.bones[b].name} at ${t}, corner ${k}`);
        });
      }
    }
  }
});

test("an aligned rig is drawn by the editor as mcss.render draws it", async () => {
  const rig = bakeV2(moving()).rig;
  const png = readFileSync(join(ROOT, "res/pokemon/pichu/front.png"));
  const sheet = (await readIndexedPng(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer)).pixels;
  const times = [0, 3, 6, 9, 12, 15, 18, 21];
  const out = execFileSync("python3", ["-I", join(ROOT, "editor/tests/mcss_render_rig.py"), "res/pokemon/pichu/front.png", "front", `0:${times.join(",")}`],
                           { cwd: ROOT, input: JSON.stringify(rig), maxBuffer: 256 << 20 }).toString();
  const frames = JSON.parse(out) as { time: number; width: number; height: number; origin: Pair; pixels: string }[];
  for (const want of frames) {
    const got = render(rig, sheet, 0, want.time);
    assert.deepEqual([got.width, got.height, got.originX, got.originY], [want.width, want.height, ...want.origin]);
    const pixels = Buffer.from(want.pixels, "hex");
    let differ = 0;
    for (let i = 0; i < pixels.length; i++) if (pixels[i] !== got.pixels[i]) differ++;
    assert.equal(differ, 0, `at ${want.time}`);
  }
});

function frames(src: V2, sheet: Uint8Array, canvas?: Canvas) {
  const rig = bakeV2(src).rig;
  const c = canvas ?? (() => {
    const k = canvasOf(Array.from({ length: 24 }, (_, t) => frameQuads(rig, 0, t).quads.map(quadBox)).flat());
    return { width: k.width + 40, height: k.height + 40, originX: k.originX + 20, originY: k.originY + 20 };
  })();
  return { all: Array.from({ length: 24 }, (_, t) => render(rig, sheet, 0, t, c).pixels), canvas: c };
}
const differing = (a: Uint8Array[], b: Uint8Array[]) => a.reduce((n, x, t) => n + x.reduce((m, v, i) => m + (v !== b[t][i] ? 1 : 0), 0), 0);

test("reparentKeep keeps the pixels under each mode; moveHead keeps the points at the keys", async () => {
  const png = readFileSync(join(ROOT, "res/pokemon/pichu/front.png"));
  const sheet = (await readIndexedPng(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer)).pixels;
  // The head a root bone turning, the body stretched unevenly (aligned, none) or evenly and turned (full: it can't keep a
  // turned child under an uneven scale, which would need a shear); the head parented to the body by each mode
  for (const mode of ["aligned", "none", "full"] as InheritScale[]) {
    const body: V2Key = mode === "full" ? { frame: 0, rotation: 20, scale: [1.25, 1.25], curve: "constant" } : { frame: 0, scale: [1.5, 1], curve: "constant" };
    let src = source({ 0: [body], 1: [{ frame: 0, rotation: 10, curve: "constant" }, { frame: 12, rotation: 30, curve: "constant" }] }, mode);
    src = { ...src, bones: src.bones.map((x, i) => (i === 1 ? { ...x, parent: null } : x)) };
    const before = frames(src, sheet);
    const kept = reparentKeep(src, 1, 0);
    assert.equal(kept.bones[1].parent, 0);
    assert.equal(inheritScaleOf(kept.bones[1]), mode);
    assert.equal(differing(frames(kept, sheet, before.canvas).all, before.all), 0, `${mode}: reparentKeep keeps every frame's pixels`);
    assert.deepEqual(bakeV2(kept).warnings, []);
  }
  // Aligned and none write different keys for the same picture (the mode is respected)
  const at = (mode: InheritScale) => {
    let src = source({ 0: [{ frame: 0, scale: [1.5, 1], curve: "constant" }], 1: [{ frame: 0, rotation: 30, curve: "constant" }] }, mode);
    src = { ...src, bones: src.bones.map((x, i) => (i === 1 ? { ...x, parent: null } : x)) };
    return reparentKeep(src, 1, 0).sequences[0].parts.find((l) => l.bone === 1)!.keys[0].scale;
  };
  assert.deepEqual(at("none") ?? [1, 1], [1, 1], "none: its own scale stays 1");
  assert.ok(Math.abs(at("aligned")![0] - 1 / 1.5) < 1e-3, "aligned: its own scale divides the parent's out");
  // moveHead under an aligned parent stretching over the sequence: the head's picture stays at every key
  const src = moving();
  const baked = bakeV2(src);
  const { src: moved } = moveHead(src, 1, [9, -12]);
  const after = bakeV2(moved);
  for (const t of [0, 6, 18]) {
    const a = corners(baked.rig, baked.trackOf.get("0/1")!, t), b = corners(after.rig, after.trackOf.get("0/1")!, t);
    a.forEach((p, k) => near(b[k], p, 1.01, `the moved head's corner ${k} at ${t}`));
  }
});
