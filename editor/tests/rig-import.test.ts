// The new Rig Editor's import of a first-editor armature (src/modules/rig/importArmature.ts; rig-editor-v2.md, "Built:
// step 6"): scratch armatures made with the first editor's own functions (convertToArmature, reparent, keyPoseAt) on
// Pichu's front and Budew's back, baked by the first editor (armature.ts bake), imported, and baked by the new one: the
// same flat rig before any change, the armature's parents and curves carried over. Reads res/, writes nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseJson } from "../shared/json.ts";
import { rigOf } from "../src/modules/rig/model.ts";
import { bake, convertToArmature, keyPoseAt, reparent, type Source } from "../src/modules/rig/armature.ts";
import { importArmature } from "../src/modules/rig/importArmature.ts";
import { bakeV2 } from "../src/modules/rig/v2.ts";
import { validate, type Schema } from "../shared/schema.ts";
import { v2Data } from "../src/modules/rig/setupFiles.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const flatOf = (folder: string, side: string) => rigOf(parseJson(readFileSync(join(ROOT, "res/pokemon", folder, `${side}_rig.json`), "utf8")));
const V2_SCHEMA = JSON.parse(readFileSync(join(ROOT, "res/pokemon/battle_sprite_rig_v2.schema.json"), "utf8")) as Schema;

/** The first editor's armature for a flat rig, worked on as the user would: tracks parented (keeping where they are), a
 * part keyed with eased curves in Pose mode; then baked by the first editor. */
function scratch(folder: string, side: string, parents: [number, number][], curved: number[]): { flat: Rig; arm: Source } {
  const rig0 = flatOf(folder, side);
  let arm = convertToArmature(rig0);
  for (const [child, parent] of parents) arm = reparent(arm, rig0, child, parent);
  for (const t of curved) {
    const bone = arm.bones[t];
    // (a frame between its key poses, so Pose mode makes a new key pose with the smooth curve)
    const at = [3, 9, 15, 21, 1].find((f) => f < bone.frames && !bone.keys.some((k) => k.frame === f)) ?? 1;
    const { keys } = keyPoseAt(bone.keys, at, bone.frames, true, (k) => ({ ...k, rotation: (k.rotation ?? 0) + 20, move: [(k.move?.[0] ?? 0) + 2, k.move?.[1] ?? 0] }), "ease_in_out");
    arm = { ...arm, bones: arm.bones.map((b, i) => (i === t ? { ...b, key_type: "srt", keys } : b)) };
  }
  return { flat: bake(arm, rig0).rig, arm };
}
type Rig = ReturnType<typeof flatOf>;

const sameRig = (a: Rig, b: Rig) => {
  assert.deepEqual(a.tracks, b.tracks);
  assert.deepEqual(a.poses, b.poses);
  assert.deepEqual(a.sequences, b.sequences);
  assert.deepEqual(a.pictures, b.pictures);
};

test("an untouched armature imports as the vanilla conversion: the same flat rig", () => {
  const rig = flatOf("pichu", "front");
  const r = importArmature(rig, convertToArmature(rig));
  assert.equal(r.exact, true, r.report.join("\n"));
  sameRig(bakeV2(r.src).rig, rig);
  assert.ok(r.src.bones.every((b) => b.parent === null));
});

test("a worked armature (parents, eased keys) imports with its parents and curves and bakes to the same flat rig", () => {
  // Pichu's front: the head (tracks 1 and 10) under the body (0 and 9), the ears under the head, the right ear's track
  // in the first pose keyed with an eased turn
  const { flat, arm } = scratch("pichu", "front", [[1, 0], [10, 9], [2, 1], [3, 1], [11, 10], [12, 10]], [2]);
  const r = importArmature(flat, arm);
  assert.equal(r.exact, true, r.report.join("\n"));
  sameRig(bakeV2(r.src).rig, flat);
  const bone = (name: string) => r.src.bones.findIndex((b) => b.name === name);
  assert.equal(r.src.bones[bone("head")].parent, bone("body"));
  assert.equal(r.src.bones[bone("ear_r")].parent, bone("head"));
  assert.equal(r.src.bones[bone("ear_l")].parent, bone("head"));
  assert.equal(r.src.bones[bone("tail")].parent, null);
  // The eased key is a key with its curve in the source, not the game's held keys
  const lane = r.src.sequences[0].parts.find((l) => l.bone === bone("ear_r"))!;
  assert.ok(lane.keys.some((k) => k.curve === "ease_in_out"), JSON.stringify(lane.keys));
  assert.equal(lane.keys.length, arm.bones[2].keys.length, "the armature's key poses, one key each");
  // The source is valid for the build's schema
  assert.deepEqual(validate(v2Data(r.src, "../battle_sprite_rig_v2.schema.json"), V2_SCHEMA, new Map()), []);
});

test("parts the armature parented in one sequence only (Charmander's back) take the parent in all, baking the same", () => {
  // Its three sequences' tracks (head01, head02, head011) are one bone each in the new editor; only the first sequence's
  // head, tail and flame were parented, and the flame keyed
  const { flat, arm } = scratch("charmander", "back", [[0, 1], [8, 1], [9, 8]], [9]);
  const r = importArmature(flat, arm);
  assert.equal(r.exact, true, r.report.join("\n"));
  sameRig(bakeV2(r.src).rig, flat);
  const bone = (name: string) => r.src.bones.findIndex((b) => b.name === name);
  assert.equal(r.src.bones[bone("head01")].parent, bone("body01"));
  assert.equal(r.src.bones[bone("ef01")].parent, bone("tail01"));
  assert.ok(r.src.sequences[0].parts.find((l) => l.bone === bone("ef01"))!.keys.some((k) => k.curve === "ease_in_out"));
});

test("a second armature (Budew's back, a part keyed and parented) imports exactly too", () => {
  const { flat, arm } = scratch("budew", "back", [[1, 0]], [0, 1]);
  const r = importArmature(flat, arm);
  assert.equal(r.exact, true, r.report.join("\n"));
  sameRig(bakeV2(r.src).rig, flat);
});
