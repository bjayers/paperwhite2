// The new Rig Editor's import of a first-editor armature (rig-editor-v2.md, "Built: step 6"): a side's
// <side>_rig_source.json (armature.ts, battle-sprites.md section 19) turned into the v2 source, so a side rigged in the
// first editor opens in the new one.
//
// The flat rig the armature baked is converted first (convertToV2: one set of bones, the poses as sequences, the stay
// sequence as the timeline, byte for byte), then the armature's own structure is laid over it bone by bone, parents
// first, where it maps:
// - a bone's parent: the armature parents tracks (head_a under body_a); the v2 bone of a track's parent track (a part
//   parented in some sequences only takes it in all, its other tracks' keys kept where they are under it; two different
//   parents leave it at the root, reported);
// - its keys: the armature's key poses on each of the bone's tracks (move, turn, scale, curves, Bézier handles; the
//   picture held from key to key, as both formats hold it), which are relative to the parent in both formats. Kept only
//   where the result bakes to the same tracks as the flat rig; otherwise (the root's movement baked into a part, a key
//   the formats read differently) the part is parented keeping its transform (setup.ts reparentKeep, the converted keys
//   rewritten under the new parent) and, failing that too, left at the root with its converted keys (reported).
// So the import bakes to the same flat rig as the armature did before any change, part by part, or says which parts
// differ and why.

import type { Source } from "./armature.ts";
import type { Rig } from "./mcss.ts";
import { reparentKeep } from "./setup.ts";
import { bakeV2, convertToV2, orderedV2, type Lane, type V2, type V2Key } from "./v2.ts";

export interface ArmatureImport {
  src: V2;
  /** What was carried over and what wasn't, a line each. */
  report: string[];
  /** Whether the import bakes to the flat rig exactly (its tracks, poses and sequences). */
  exact: boolean;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** An armature's key poses as a lane's keys (the picture named only where it changes; `shownBefore` the default's). */
function keysOf(arm: Source, track: number, shownBefore: number | undefined): V2Key[] {
  let shown = shownBefore;
  return (arm.bones[track]?.keys ?? []).map((k) => {
    const out: V2Key = { frame: k.frame };
    const picture = k.picture ?? 0;
    if (picture !== shown) out.piece = picture;
    shown = picture;
    if (k.move && (k.move[0] || k.move[1])) out.move = [k.move[0], k.move[1]];
    if (k.rotation) out.rotation = k.rotation;
    if (k.scale && (k.scale[0] !== 1 || k.scale[1] !== 1)) out.scale = [k.scale[0], k.scale[1]];
    if (k.curve && k.curve !== "constant") out.curve = k.curve;
    if (k.curves) out.curves = k.curves;
    if (k.handles) out.handles = k.handles;
    if (k.flat) out.flat = k.flat;
    return out;
  });
}

/** The v2 source for a side whose flat rig `flat` its armature `arm` baked. */
export function importArmature(flat: Rig, arm: Source): ArmatureImport {
  const report: string[] = [];
  let src = convertToV2(flat);
  const base = bakeV2(src);
  // Each flat track's [sequence, bone] and each bone's tracks
  const owner = new Map<number, [number, number]>();
  for (const [id, t] of base.trackOf) {
    const [s, b] = id.split("/").map(Number);
    owner.set(t, [s, b]);
  }
  const tracksOf = (b: number) => [...owner].filter(([, [, ob]]) => ob === b).map(([t, [s]]) => ({ t, s }));
  // Each track's parent, as a bone (null: the root)
  const trackParent = (t: number): number | null => {
    const p = arm.bones[t]?.parent ?? null;
    return p === null ? null : owner.get(p)?.[1] ?? null;
  };
  // The parent each bone takes: the one its tracks name (a part the armature parented in some sequences only takes it in
  // all: the others' keys are kept where they are under it); two different parents leave it at the root
  const parentOf = new Map<number, number | null>();
  src.bones.forEach((bone, b) => {
    const parents = new Set(tracksOf(b).map(({ t }) => trackParent(t)).filter((p): p is number => p !== null && p !== b));
    if (parents.size > 1) {
      report.push(`${bone.name}: its tracks have different parents (${[...parents].map((p) => src.bones[p].name).join(", ")}); it stays at the root.`);
      parentOf.set(b, null);
    } else parentOf.set(b, [...parents][0] ?? null);
  });

  // Bones in an order with parents first
  const order: number[] = [];
  const visit = (b: number, seen: Set<number>) => {
    if (order.includes(b) || seen.has(b)) return;
    seen.add(b);
    const p = parentOf.get(b);
    if (p !== null && p !== undefined) visit(p, seen);
    order.push(b);
  };
  src.bones.forEach((_, b) => visit(b, new Set()));

  const tracksMatch = (s: V2, b: number) => {
    const baked = bakeV2(s);
    return tracksOf(b).every(({ t, s: seq }) => {
      const now = baked.trackOf.get(`${seq}/${b}`);
      return now !== undefined && same(baked.rig.tracks[now], flat.tracks[t]);
    });
  };
  /** The bone's lanes whose armature track has this parent given the armature's key poses. */
  const withArmatureKeys = (s0: V2, b: number, parent: number | null): V2 => ({
    ...s0,
    sequences: s0.sequences.map((seq, s) => ({
      ...seq,
      parts: seq.parts.map((lane): Lane => {
        if (lane.bone !== b) return lane;
        const t = base.trackOf.get(`${s}/${b}`);
        if (t === undefined || !arm.bones[t] || trackParent(t) !== parent) return lane;
        return { ...lane, keys: keysOf(arm, t, s0.bones[b].default?.piece) };
      }),
    })),
  });
  const curvesOf = (b: number) => tracksOf(b).some(({ t }) => arm.bones[t]?.keys.some((k) => (k.curve && k.curve !== "constant") || k.curves));
  let curved = 0, kept = 0, parented = 0;
  for (const b of order) {
    const parent = parentOf.get(b) ?? null;
    const name = src.bones[b].name;
    // Parented keeping where it is (its converted keys rewritten under the parent), then the armature's own key poses on
    // the tracks it parented the same way
    const placed = parent === null ? src : reparentKeep(src, b, parent);
    const withKeys = withArmatureKeys(placed, b, parent);
    if (tracksMatch(withKeys, b)) {
      src = withKeys;
      if (parent !== null) parented++;
      if (curvesOf(b)) curved++;
      continue;
    }
    if (parent !== null && tracksMatch(placed, b)) {
      src = placed;
      parented++;
      kept++;
      report.push(`${name}: parented to ${src.bones[parent].name}, its keys as the game holds them (every 6 frames) rather than the armature's key poses, which don't bake the same here (the root's movement in them, or a key read differently).`);
      continue;
    }
    if (parent !== null) report.push(`${name}: left at the root with its keys as the game holds them: parented to ${src.bones[parent].name} it doesn't bake back the same.`);
    else if (curvesOf(b)) report.push(`${name}: its keys as the game holds them: the armature's key poses don't bake the same here.`);
    if (parent !== null || curvesOf(b)) kept++;
  }
  src = orderedV2(src);
  const final = bakeV2(src).rig;
  const exact = same(final.tracks, flat.tracks) && same(final.poses, flat.poses) && same(final.sequences, flat.sequences) && same(final.pictures, flat.pictures);
  report.unshift(`${src.bones.length} bone${src.bones.length > 1 ? "s" : ""} from ${flat.tracks.length} tracks, ${src.sequences.length} sequence${src.sequences.length > 1 ? "s" : ""}; ${parented} parented as in the armature, ${curved} with its curves${kept ? `, ${kept} with the game's held keys` : ""}.`);
  if (!exact) report.push("The import doesn't bake to the armature's flat rig exactly: check the parts above before saving.");
  return { src, report, exact };
}
