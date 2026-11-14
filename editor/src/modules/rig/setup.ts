// The new Rig Editor's rig setup (rig-editor-v2.md, "Built: step 2"): the edits of a side's _rig_v2.json that set the
// sprite up, as pure functions of the source (v2.ts), so the page, its preview and the tests share them.
//
// - Where things are in the default pose: each bone's map from the rest arrangement to the sprite (as bakeV2 composes
//   a part through its parents, without the files' rounding), its head and tail on the sprite.
// - Bones: moving the head (the pivot) with the pictures staying where they are (the pieces' `at` moved back, and a
//   turned or scaled default's or key's move corrected, as the first editor's movePivot), the tail (connected children's
//   heads following it, their pictures staying), the whole bone, a piece within its bone; adding, renaming, deleting.
// - Parenting with Keep Transform (the first armature's reparent, for the new format): the default pose and every key
//   written again relative to the new parent, so the part is drawn where it was; Connected and Keep offset.
// - Pieces and their rectangles; the layer order; Start fresh; the default-pose rig the preview draws.

import { forward, keyAt, type Pair, type Rectangle } from "./mcss.ts";
import { fixedScale } from "./model.ts";
import { boundariesOf, constantTrack, IDENTITY, inverse, keyOfMap, mapOf, partMap, shift, srtOfKey, srtOfValues, then, type Map2 } from "./armature.ts";
import { bakeV2, emptyV2, layersOf, orderedV2, STEP, type BakedV2, type Lane, type Transform, type V2, type V2Bone, type V2Key, type V2Piece } from "./v2.ts";

// ---------------------------------------------------------------- Where things are in the default pose

/** A point of the rest arrangement (x right, y down from the feet) in the maps' space (y up). */
const up = (p: Pair): Pair => [p[0], -p[1]];
const shiftUp = (p: Pair): Map2 => shift(p[0], -p[1]);
/** A map applied to a point, y up. */
export const apply = (m: Map2, p: Pair): Pair => [m[0] * p[0] + m[1] * p[1] + m[4], m[2] * p[0] + m[3] * p[1] + m[5]];
/** A map's linear part applied to a vector, y up. */
export const applyLinear = (m: Map2, v: Pair): Pair => [m[0] * v[0] + m[1] * v[1], m[2] * v[0] + m[3] * v[1]];
const linearInverse = (m: Map2): Map2 => inverse([m[0], m[1], m[2], m[3], 0, 0]);

/** A bone's pivot: its head, or a connected bone's parent's tail (v2.ts headOf). */
export function pivotOf(src: V2, b: number): Pair {
  const bone = src.bones[b];
  if (bone?.connected && bone.parent !== null && src.bones[bone.parent]) return src.bones[bone.parent].tail;
  return bone?.head ?? [0, 0];
}

/** The parent a bone is baked under (null: the root, also for a parent that would make a circle). */
export function parentOf(src: V2, b: number): number | null {
  const seen = new Set<number>([b]);
  let p = src.bones[b]?.parent ?? null;
  const first = p;
  while (p !== null && src.bones[p]) {
    if (seen.has(p)) return null;
    seen.add(p);
    p = src.bones[p].parent;
  }
  return first !== null && src.bones[first] ? first : null;
}

/** A transform's movement (rotation in 65536ths), a connected bone's move locked. */
function srtOf(t: Transform | undefined, locked: boolean) {
  return srtOfValues({ picture: 0, pose: 0, move: locked ? [0, 0] : (t?.move ?? [0, 0]), rotation: t?.rotation ?? 0, scale: t?.scale ?? [1, 1] });
}

/** Each bone's map from the rest arrangement (y up) to the sprite (y up) in a pose (by default the default pose): its
 * own movement about its pivot, then its parent's, as bakeV2 composes them (without rounding). */
export function restMaps(src: V2, poseOf: (b: number) => Transform | undefined = (b) => src.bones[b]?.default): Map2[] {
  const out: (Map2 | undefined)[] = [];
  const busy = new Set<number>();
  const of = (b: number): Map2 => {
    if (out[b]) return out[b]!;
    if (busy.has(b)) return IDENTITY;
    busy.add(b);
    const p = parentOf(src, b);
    const pivot = pivotOf(src, b);
    const own = then(inverse(shiftUp(pivot)), partMap(srtOf(poseOf(b), !!src.bones[b].connected && p !== null), pivot));
    const m = p === null ? own : then(own, of(p));
    busy.delete(b);
    out[b] = m;
    return m;
  };
  return src.bones.map((_, b) => of(b));
}

/** The map of a bone's parent (the identity for a root bone). */
export const parentMapOf = (src: V2, maps: Map2[], b: number): Map2 => {
  const p = parentOf(src, b);
  return p === null ? IDENTITY : maps[p];
};

/** A point of the rest arrangement (y down) on the sprite (y down) through a map. */
export const placed = (m: Map2, p: Pair): Pair => {
  const [x, y] = apply(m, up(p));
  return [x, -y];
};

/** A bone's head and tail on the sprite (x right, y down from the feet) in the default pose. */
export function boneEnds(src: V2, maps: Map2[], b: number): { head: Pair; tail: Pair } {
  return { head: placed(maps[b], pivotOf(src, b)), tail: placed(maps[b], src.bones[b].tail) };
}

/** A movement on the sprite (y down) as a movement of the rest arrangement under a map (y down): what to add to a rest
 * point so it moves by `delta` on the sprite. */
export function restDelta(m: Map2, delta: Pair): Pair {
  const [x, y] = applyLinear(linearInverse(m), up(delta));
  return [x, -y];
}

/** A bone's axes on the sprite (y down), unit length: where its x (right) and y (down) point. */
export function axesOf(m: Map2): [Pair, Pair] {
  const norm = (v: Pair): Pair => {
    const n = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / n, v[1] / n];
  };
  const x = applyLinear(m, [1, 0]), y = applyLinear(m, [0, -1]);
  return [norm([x[0], -x[1]]), norm([y[0], -y[1]])];
}

/** The source the preview draws the default pose from: one empty sequence (every part holds its default) on a timeline
 * of one block, nothing of the originals' storage. */
export function defaultPoseSource(src: V2): V2 {
  return {
    ...src, sequences: [{ name: "Default pose", frames: STEP, parts: [] }], timeline: { name: "stay", blocks: [{ sequence: 0 }] },
    strips: undefined, track_order: undefined, kept_tracks: undefined, idle_nodes: undefined, keeps_moving: [], loop_clips: [],
    layers: (src.layers ?? src.bones.map((_, i) => i)).filter((b) => src.bones[b]),
  };
}

/** The default pose baked (the flat rig the preview draws, its one pose the rig's layers), or the error that stops it. */
export function defaultPoseRig(src: V2): { baked: BakedV2 | null; error: string | null } {
  try {
    return { baked: bakeV2(defaultPoseSource(src)), error: null };
  } catch (e) {
    return { baked: null, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------- Small helpers

const tidy = (v: number) => {
  const whole = Math.round(v);
  return (Math.abs(v - whole) < 1e-6 ? whole : Math.round(v * 1000) / 1000) + 0;
};
const addPair = (a: Pair, b: Pair): Pair => [a[0] + b[0], a[1] + b[1]];
const samePair = (a: Pair | undefined, b: Pair | undefined) => (a?.[0] ?? 0) === (b?.[0] ?? 0) && (a?.[1] ?? 0) === (b?.[1] ?? 0);
const clone = <T>(v: T): T => structuredClone(v);

/** A transform without the fields that hold the identity (absent: identity). */
export function tidyTransform(t: Transform): Transform {
  const out: Transform = {};
  if (t.piece !== undefined) out.piece = t.piece;
  if (t.hidden) out.hidden = true;
  if (t.move && (t.move[0] || t.move[1])) out.move = [tidy(t.move[0]), tidy(t.move[1])];
  // (turns kept to a millionth of a degree: a converted original's turn bakes back to its 65536ths)
  if (t.rotation && Math.abs(t.rotation) > 1e-9) out.rotation = Math.round(t.rotation * 1e6) / 1e6 + 0;
  if (t.scale && (t.scale[0] !== 1 || t.scale[1] !== 1)) out.scale = [fixedScale(t.scale[0]) + 0, fixedScale(t.scale[1]) + 0];
  return out;
}

/** A bone with a new default pose (dropped when it is all identity). */
function withDefault(bone: V2Bone, t: Transform): V2Bone {
  const d = tidyTransform(t);
  const next: V2Bone = { ...bone };
  if (Object.keys(d).length) next.default = d;
  else delete next.default;
  return next;
}

/** A name not yet taken: the name, or with a number after it. */
export function freeName(taken: string[], name: string): string {
  if (!taken.includes(name)) return name;
  for (let n = 2; ; n++) if (!taken.includes(`${name} ${n}`)) return `${name} ${n}`;
}

/** The pieces a bone shows: its default's, and its keys' in every sequence. */
export function piecesOf(src: V2, b: number): Set<number> {
  const out = new Set<number>();
  const d = src.bones[b]?.default?.piece;
  if (d !== undefined) out.add(d);
  for (const seq of src.sequences) for (const lane of seq.parts) if (lane.bone === b) for (const k of lane.keys) if (k.piece !== undefined) out.add(k.piece);
  return out;
}

/** The bones that show a piece (by default or in a key). */
export function bonesShowing(src: V2, n: number): number[] {
  return src.bones.map((_, b) => b).filter((b) => piecesOf(src, b).has(n));
}

/** The source with each of a bone's pieces that another bone shows too copied for this one, and the copies' numbers. */
function ownPieces(src: V2, b: number): { src: V2; pieces: number[]; copied: number } {
  const shown = [...piecesOf(src, b)].filter((n) => src.pieces[n]);
  const remap = new Map<number, number>();
  const pieces = src.pieces.slice();
  for (const n of shown) {
    if (bonesShowing(src, n).some((o) => o !== b)) {
      remap.set(n, pieces.length);
      pieces.push({ ...clone(src.pieces[n]), name: freeName(pieces.map((p) => p.name), `${src.pieces[n].name} (${src.bones[b].name})`) });
    }
  }
  if (!remap.size) return { src, pieces: shown, copied: 0 };
  const re = (n: number | undefined) => (n === undefined ? undefined : remap.get(n) ?? n);
  const next: V2 = {
    ...src, pieces,
    bones: src.bones.map((bone, i) => (i === b && bone.default?.piece !== undefined ? { ...bone, default: { ...bone.default, piece: re(bone.default.piece) } } : bone)),
    sequences: src.sequences.map((seq) => ({ ...seq, parts: seq.parts.map((lane) => (lane.bone !== b ? lane : {
      ...lane, keys: lane.keys.map((k) => (k.piece !== undefined ? { ...k, piece: re(k.piece) } : k)),
    })) })),
  };
  if (next.kept?.picture_labels) delete next.kept;
  return { src: next, pieces: shown.map((n) => remap.get(n) ?? n), copied: remap.size };
}

/** Each lane of a bone, changed. */
const mapLanes = (src: V2, b: number, change: (lane: Lane) => Lane): V2 => ({
  ...src, sequences: src.sequences.map((seq) => ({ ...seq, parts: seq.parts.map((lane) => (lane.bone === b ? change(lane) : lane)) })),
});

// ---------------------------------------------------------------- Moving a bone's ends

/** A bone's pivot moved by `delta` (x right, y down) while everything it draws stays where it is: its pieces' `at` move
 * back (copied first where another bone shows them too), and the default's and each key's move are corrected where they
 * turn or scale, so each picture is exactly where it was; the sequences' own pivots for it (converted originals) move
 * with it. The head field follows (a connected bone's is its parent's tail: the caller moves that). */
function shiftPivot(src0: V2, b: number, delta: Pair): { src: V2; copied: number } {
  if (!delta[0] && !delta[1]) return { src: src0, copied: 0 };
  const own = ownPieces(src0, b);
  let src = own.src;
  const shiftUpBy = up(delta);
  const pieces = src.pieces.map((p, n) => (!own.pieces.includes(n) ? p : {
    ...p, rectangles: p.rectangles.map((r) => (r.size[0] && r.size[1] ? { ...r, at: [r.at[0] - shiftUpBy[0], r.at[1] - shiftUpBy[1]] as Pair } : r)),
  }));
  src = { ...src, pieces };
  // A turn and a scale carry the shift: the move changes by (R S - 1) of it
  const spread = (rotation: number, scale: Pair): Pair => {
    const moved = forward(shiftUpBy[0], shiftUpBy[1], [(rotation / 360) * 65536, scale[0], scale[1], 0, 0]);
    return [moved[0] - shiftUpBy[0], -(moved[1] - shiftUpBy[1])];
  };
  const bone = src.bones[b];
  const locked = !!bone.connected && parentOf(src, b) !== null;
  const d = bone.default ?? {};
  const dSpread = spread(d.rotation ?? 0, d.scale ?? [1, 1]);
  const newDefaultMove: Pair = addPair(d.move ?? [0, 0], dSpread);
  const bones = src.bones.map((x, i) => (i !== b ? x : {
    ...(locked ? x : withDefault(x, { ...d, move: newDefaultMove })),
    ...(x.connected && parentOf(src, b) !== null ? {} : { head: addPair(x.head, delta) }),
  }));
  src = { ...src, bones };
  if (!locked) {
    src = mapLanes(src, b, (lane) => ({ ...lane, keys: lane.keys.map((k) => {
      if (k.rotation === undefined && k.scale === undefined && k.move === undefined) return k;
      const s = spread(k.rotation ?? d.rotation ?? 0, k.scale ?? d.scale ?? [1, 1]);
      const move = addPair(k.move ?? d.move ?? [0, 0], s);
      const next: V2Key = { ...k };
      if (samePair(move, newDefaultMove) && k.move === undefined) return next;
      next.move = [tidy(move[0]), tidy(move[1])];
      return next;
    }) }));
  }
  // The sequences' own pivots for this bone (converted originals' per-action heads)
  src = { ...src, sequences: src.sequences.map((seq) => (!seq.layers ? seq : {
    ...seq, layers: seq.layers.map((l) => (l.bone === b && l.head && !l.track_of ? { ...l, head: addPair(l.head, delta) } : l)),
  })) };
  return { src, copied: own.copied };
}

/** The connected children of a bone. */
export const connectedChildren = (src: V2, b: number) => src.bones.map((_, i) => i).filter((i) => src.bones[i].parent === b && src.bones[i].connected);

/** A bone's head (its pivot) moved by `delta` in the rest arrangement (x right, y down), the pictures staying where they
 * are. A connected bone's head is its parent's tail, so that moves instead (moveTail). */
export function moveHead(src: V2, b: number, delta: Pair): { src: V2; copied: number } {
  const bone = src.bones[b];
  if (!bone) return { src, copied: 0 };
  if (bone.connected && parentOf(src, b) !== null) return moveTail(src, bone.parent!, delta);
  return shiftPivot(src, b, delta);
}

/** A bone's tail moved by `delta`: the heads of its connected children follow it (each child's pivot moves, its pictures
 * staying where they are), as Blender's do; the children's own tails stay where they are. */
export function moveTail(src0: V2, b: number, delta: Pair): { src: V2; copied: number } {
  if (!src0.bones[b] || (!delta[0] && !delta[1])) return { src: src0, copied: 0 };
  let src: V2 = { ...src0, bones: src0.bones.map((x, i) => (i === b ? { ...x, tail: addPair(x.tail, delta) } : x)) };
  let copied = 0;
  for (const c of connectedChildren(src0, b)) {
    // The child's pivot was the old tail: its pieces move back by as much (shiftPivot reads the pivot before this change)
    const r = shiftPivot({ ...src, bones: src.bones.map((x, i) => (i === b ? src0.bones[b] : x)) }, c, delta);
    copied += r.copied;
    src = { ...r.src, bones: r.src.bones.map((x, i) => (i === b ? src.bones[b] : i === c ? { ...x, head: addPair(src0.bones[b].tail, delta) } : x)) };
  }
  return { src, copied };
}

/** A whole bone moved (head and tail, its pictures with it); its connected children's heads follow, their pictures
 * staying. A connected bone can't move on its own (its head is its parent's tail): null. */
export function moveBone(src: V2, b: number, delta: Pair): { src: V2; copied: number } | null {
  const bone = src.bones[b];
  if (!bone) return null;
  if (bone.connected && parentOf(src, b) !== null) return null;
  const moved: V2 = { ...src, bones: src.bones.map((x, i) => (i === b ? { ...x, head: addPair(x.head, delta) } : x)) };
  // The pieces and the default stay relative to the head, so the pictures go with it; the tail moves as the children's heads
  return moveTail(moved, b, delta);
}

/** The pictures a bone shows moved by `delta` within the bone (their `at`, y up from its head), copied first where another
 * bone shows them too. */
export function movePieces(src0: V2, b: number, deltaUp: Pair): { src: V2; copied: number } {
  if (!deltaUp[0] && !deltaUp[1]) return { src: src0, copied: 0 };
  const own = ownPieces(src0, b);
  const pieces = own.src.pieces.map((p, n) => (!own.pieces.includes(n) ? p : {
    ...p, rectangles: p.rectangles.map((r) => ({ ...r, at: [r.at[0] + deltaUp[0], r.at[1] + deltaUp[1]] as Pair })),
  }));
  return { src: { ...own.src, pieces }, copied: own.copied };
}

/** A bone's default pose changed (the gizmos, the fields): `change` gets the default as it is, every channel given. */
export function setDefault(src: V2, b: number, change: (t: Required<Pick<Transform, "move" | "rotation" | "scale">> & Transform) => Transform): V2 {
  const bone = src.bones[b];
  if (!bone) return src;
  const d = bone.default ?? {};
  const full = { ...d, move: d.move ?? [0, 0] as Pair, rotation: d.rotation ?? 0, scale: d.scale ?? [1, 1] as Pair };
  return { ...src, bones: src.bones.map((x, i) => (i === b ? withDefault(x, change(full)) : x)) };
}

// ---------------------------------------------------------------- Parenting

/** Whether making `parent` the bone's parent would make a circle. */
export function wouldCycle(src: V2, b: number, parent: number | null): boolean {
  const seen = new Set<number>();
  for (let p = parent; p !== null && p !== undefined; p = src.bones[p]?.parent ?? null) {
    if (p === b || seen.has(p)) return true;
    seen.add(p);
  }
  return false;
}

/** A map's movement about a pivot as a transform (degrees, the turn chosen nearest `expected`). */
function transformOf(m: Map2, pivot: Pair, expectedDegrees: number, piece: Transform): Transform {
  const { srt } = keyOfMap(m, pivot, (expectedDegrees / 360) * 65536);
  let deg = (srt[0] / 65536) * 360;
  while (deg - expectedDegrees > 180) deg -= 360;
  while (deg - expectedDegrees < -180) deg += 360;
  deg = Math.round(deg * 1e6) / 1e6 + 0;
  return { ...piece, move: [tidy(srt[3]), tidy(srt[4])], rotation: deg, scale: [srt[1], srt[2]] };
}

/** A bone given a new parent (null: the root) where it stays drawn where it is, as Blender's Keep Transform: its default
 * pose written again relative to the new parent, and each sequence's keys of it as constant keys at each of its baked
 * keys and each of the new parent's (so it bakes back to the keys it had: exactly where the parents only move, as most
 * original parts do; its curves become held keys there). The bone keeps its offset (not connected). */
export function reparentKeep(src: V2, b: number, parent: number | null): V2 {
  if (!src.bones[b] || wouldCycle(src, b, parent)) return src;
  const bone = src.bones[b];
  const beforeMaps = restMaps(src);
  const pivot = pivotOf(src, b);
  let next: V2 = { ...src, bones: src.bones.map((x, i) => {
    if (i !== b) return x;
    const y: V2Bone = { ...x, parent, head: pivot };
    delete y.connected;
    return y;
  }) };
  // The default pose: the same map from the rest arrangement, under the new parent's
  const parentMapAfter = parent === null ? IDENTITY : restMaps(next)[parent];
  const want = then(shiftUp(pivot), then(beforeMaps[b], inverse(parentMapAfter)));
  const d = bone.default ?? {};
  const t = transformOf(want, pivot, d.rotation ?? 0, { ...(d.piece !== undefined ? { piece: d.piece } : {}), ...(d.hidden ? { hidden: true } : {}) });
  next = { ...next, bones: next.bones.map((x, i) => (i === b ? withDefault(x, t) : x)) };

  // Each sequence's keys of it, as constant keys where it or the new parent changes
  if (!src.sequences.some((seq) => seq.parts.some((l) => l.bone === b && l.keys.length))) return orderedV2(next);
  const before = bakeV2(src);
  const after = bakeV2(next);
  const sequences = next.sequences.map((seq, s) => {
    const lane = seq.parts.find((l) => l.bone === b);
    const t0 = before.trackOf.get(`${s}/${b}`);
    if (!lane || !lane.keys.length || t0 === undefined) return seq;
    const track = before.rig.tracks[t0];
    const pivotHere = before.rig.poses[s]?.parts.find((p) => p.track === t0)?.pivot ?? pivot;
    const pTrack = parent !== null ? after.trackOf.get(`${s}/${parent}`) : undefined;
    const parentTrack = pTrack !== undefined ? after.rig.tracks[pTrack] : undefined;
    const parentPivot = pTrack !== undefined ? after.rig.poses[s]?.parts.find((p) => p.track === pTrack)?.pivot ?? [0, 0] as Pair : [0, 0] as Pair;
    const frames = lane.frames ?? seq.frames;
    // A sample at each of its baked keys' starts (a key at the length itself, held 0 frames at the end, only where the
    // lane has one there) and at each of the new parent's key starts inside it
    const endKey = lane.keys.some((k) => k.frame === frames);
    const cuts = parentTrack && !constantTrack(parentTrack) ? boundariesOf(parentTrack, frames).filter((c) => c > 0 && c < frames) : [];
    const samples: { time: number; key: (typeof track.keys)[number]; start: boolean }[] = [];
    let at = 0;
    for (const k of track.keys) {
      if (at < frames || !samples.length || (at === frames && endKey)) {
        samples.push({ time: at, key: k, start: true });
        for (const c of cuts) if (c > at && c < at + k.frames) samples.push({ time: c, key: k, start: false });
      }
      at += k.frames;
    }
    let turn = 0;
    let shown: number | undefined = bone.default?.piece;
    let hiddenNow = bone.default?.hidden ?? bone.default?.piece === undefined;
    const keys: V2Key[] = samples.map(({ time, key: k, start }) => {
      let world = partMap(srtOfKey(k, track.key_type), pivotHere);
      if (parentTrack) {
        const ps = srtOfKey(keyAt(parentTrack, time).key, parentTrack.key_type);
        world = then(world, inverse(then(inverse(shiftUp(parentPivot)), partMap(ps, parentPivot))));
      }
      const tr = transformOf(world, pivotHere, turn, {});
      turn = tr.rotation ?? 0;
      const out: V2Key = { frame: time };
      const picture = k.picture ?? 0;
      if (picture < src.pieces.length) {
        if (picture !== shown || hiddenNow) out.piece = picture;
        shown = picture;
        hiddenNow = false;
      } else if (!hiddenNow) {
        out.hidden = true;
        hiddenNow = true;
      }
      const tt = tidyTransform(tr);
      if (tt.move) out.move = tt.move;
      if (tt.rotation) out.rotation = tt.rotation;
      if (tt.scale) out.scale = tt.scale;
      // Absent channels are the default's: give them where the default isn't the identity
      const nd = next.bones[b].default ?? {};
      if (!out.move && nd.move) out.move = [0, 0];
      if (out.rotation === undefined && nd.rotation) out.rotation = 0;
      if (!out.scale && nd.scale) out.scale = [1, 1];
      if ((src.curve ?? "ease_in_out") !== "constant") out.curve = "constant";
      if (start) {
        const extra: Record<string, number> = {};
        for (const x of ["unused", "marker", "result_copy"] as const) if (k[x] !== undefined) extra[x] = k[x]!;
        if (Object.keys(extra).length) out.flat = extra;
      }
      return out;
    });
    const nextLane: Lane = { ...lane, keys };
    if (lane.key_type) nextLane.key_type = lane.key_type;
    return { ...seq, parts: seq.parts.map((l) => (l === lane ? nextLane : l)) };
  });
  return orderedV2({ ...next, sequences });
}

/** Connected (the head locked to the parent's tail: it moves there, the pictures staying where they are, and the bone's
 * own move is no more) or keeping its offset (the head where it is, free to move). */
export function setConnected(src: V2, b: number, on: boolean): { src: V2; dropped: boolean } {
  const bone = src.bones[b];
  if (!bone || bone.parent === null || !src.bones[bone.parent]) return { src, dropped: false };
  if (!on) {
    const head = pivotOf(src, b);
    return { src: { ...src, bones: src.bones.map((x, i) => {
      if (i !== b) return x;
      const y = { ...x, head };
      delete y.connected;
      return y;
    }) }, dropped: false };
  }
  if (bone.connected) return { src, dropped: false };
  const tail = src.bones[bone.parent].tail;
  const moved = shiftPivot(src, b, [tail[0] - bone.head[0], tail[1] - bone.head[1]]).src;
  const d = moved.bones[b].default ?? {};
  const dropped = !!(d.move && (d.move[0] || d.move[1])) || moved.sequences.some((seq) => seq.parts.some((l) => l.bone === b && l.keys.some((k) => k.move && (k.move[0] || k.move[1]))));
  const out: V2 = { ...moved, bones: moved.bones.map((x, i) => {
    if (i !== b) return x;
    const y = withDefault({ ...x, head: tail, connected: true }, { ...d, move: undefined });
    return orderedV2({ ...src, bones: [y] }).bones[0];
  }) };
  return { src: mapLanes(out, b, (lane) => ({ ...lane, keys: lane.keys.map((k) => {
    const y = { ...k };
    delete y.move;
    return y;
  }) })), dropped };
}

// ---------------------------------------------------------------- Bones

/** A new bone at the end of the list, in front of every other part (and in the sequences that keep their own layers). */
export function addBone(src: V2, bone: Partial<V2Bone> & { head: Pair; tail: Pair }): { src: V2; bone: number } {
  const b = src.bones.length;
  const made: V2Bone = orderedV2({ ...src, bones: [{
    name: freeName(src.bones.map((x) => x.name), bone.name ?? "bone"), head: bone.head, tail: bone.tail, parent: bone.parent ?? null,
    ...(bone.connected ? { connected: true } : {}), ...(bone.default ? { default: tidyTransform(bone.default) } : {}),
  }] }).bones[0];
  if (!made.default) delete made.default;
  const layers = [b, ...(src.layers ?? src.bones.map((_, i) => i))];
  const sequences = src.sequences.map((seq) => (seq.layers ? { ...seq, layers: [{ bone: b }, ...seq.layers] } : seq));
  // The tracks' order, where the file keeps one: the new part's tracks after the rest
  const trackOrder = src.track_order ? [...src.track_order, ...src.sequences.map((_, s) => [s, b] as [number, number])] : undefined;
  return { src: { ...src, bones: [...src.bones, made], layers, sequences, ...(trackOrder ? { track_order: trackOrder } : {}) }, bone: b };
}

/** A bone for a piece: its head at the middle of the piece's first rectangle (where the picture is on the sprite, if a
 * bone already shows it; else at the piece's own place from the feet), its tail at the rectangle's top, showing it. */
export function addBoneForPiece(src: V2, n: number): { src: V2; bone: number } {
  const piece = src.pieces[n];
  const r = piece?.rectangles[0];
  if (!piece || !r) return addBone(src, { head: [0, -16], tail: [0, -32] });
  const name = freeName(src.bones.map((x) => x.name), piece.name);
  const [w, h] = r.size;
  const shower = src.bones.findIndex((x) => x.default?.piece === n);
  if (shower < 0) {
    // Shown by no bone yet: the bone's head where the picture stands on the feet, its middle the head (for a piece
    // centred on its head, as new pieces are), the tail at its top
    const head: Pair = [Math.round(-(r.at[0] + w / 2)) + 0, Math.round(r.at[1] - h) + 0];
    const tail: Pair = [head[0], head[1] - Math.max(8, Math.round(r.at[1]))];
    return addBone(src, { name, head, tail, default: { piece: n } });
  }
  // Shown already: a copy of the piece for the new bone, its head at the middle of the picture as the other bone draws
  // it, placed so the picture is where it was
  const maps = restMaps(src);
  const origin = pivotOf(src, shower);
  const mid: Pair = [origin[0] + r.at[0] + w / 2, origin[1] - (r.at[1] - h / 2)];
  const top: Pair = [origin[0] + r.at[0] + w / 2, origin[1] - r.at[1]];
  const head = placed(maps[shower], mid).map(Math.round) as Pair;
  const tail = placed(maps[shower], top).map(Math.round) as Pair;
  if (tail[0] === head[0] && tail[1] === head[1]) tail[1] -= 8;
  const delta: Pair = [head[0] - origin[0], head[1] - origin[1]];
  const copy: V2Piece = { ...clone(piece), name: freeName(src.pieces.map((p) => p.name), `${piece.name} 2`) };
  copy.rectangles = copy.rectangles.map((q) => ({ ...q, at: [q.at[0] - delta[0], q.at[1] + delta[1]] as Pair }));
  const next: V2 = { ...src, pieces: [...src.pieces, copy] };
  return addBone(next, { name, head, tail, default: { piece: next.pieces.length - 1 } });
}

/** A bone's piece shown by default (undefined: none, hidden). */
export function setBonePiece(src: V2, b: number, piece: number | undefined): V2 {
  return setDefault(src, b, (d) => {
    const t: Transform = { ...d, piece };
    delete t.hidden;
    if (piece === undefined) delete t.piece;
    return t;
  });
}

/** A bone deleted: its children go to its parent keeping their transform, and every reference to a bone after it is
 * renumbered (parents, layers, lanes, the keeps-moving parts, the tracks' order). Its pieces stay. */
export function deleteBone(src0: V2, b: number): V2 {
  if (!src0.bones[b]) return src0;
  let src = src0;
  const grand = src.bones[b].parent;
  for (const c of src.bones.map((_, i) => i).filter((i) => src0.bones[i].parent === b)) src = reparentKeep(src, c, grand !== null && grand !== b ? grand : null);
  const re = (i: number) => (i > b ? i - 1 : i);
  const bones = src.bones.filter((_, i) => i !== b).map((x) => ({ ...x, parent: x.parent === null ? null : re(x.parent) }));
  const layers = (src.layers ?? src.bones.map((_, i) => i)).filter((i) => i !== b).map(re);
  const sequences = src.sequences.map((seq) => ({
    ...seq,
    ...(seq.layers ? { layers: seq.layers.filter((l) => l.bone !== b && l.track_of?.[1] !== b).map((l) => ({
      ...l, bone: re(l.bone), ...(l.track_of ? { track_of: [l.track_of[0], re(l.track_of[1])] as [number, number] } : {}),
    })) } : {}),
    parts: seq.parts.filter((l) => l.bone !== b).map((l) => ({ ...l, bone: re(l.bone) })),
  }));
  const next: V2 = { ...src, bones, layers, sequences, keeps_moving: src.keeps_moving.filter((i) => i !== b).map(re) };
  if (src.track_order) next.track_order = src.track_order.filter(([s, x]) => s === null || x !== b).map(([s, x]) => [s, s === null ? x : re(x)]);
  if (src.idle_nodes) delete next.idle_nodes;
  return next;
}

/** A bone renamed (a name not taken by another bone). */
export function renameBone(src: V2, b: number, name: string): V2 {
  const clean = name.trim() || "bone";
  return { ...src, bones: src.bones.map((x, i) => (i === b ? { ...x, name: freeName(src.bones.filter((_, j) => j !== b).map((y) => y.name), clean) } : x)) };
}

/** The layer order (front to back) with one bone moved to another place. */
export function moveLayer(src: V2, from: number, to: number): V2 {
  const layers = (src.layers ?? src.bones.map((_, i) => i)).slice();
  if (from < 0 || from >= layers.length || to < 0 || to >= layers.length || from === to) return src;
  const [b] = layers.splice(from, 1);
  layers.splice(to, 0, b);
  return { ...src, layers };
}

/** A bone put into the rig's layers (at the front) or taken out of them (drawn only where a sequence's own layers have it). */
export function setInLayers(src: V2, b: number, on: boolean): V2 {
  const layers = src.layers ?? src.bones.map((_, i) => i);
  if (on === layers.includes(b)) return src;
  return { ...src, layers: on ? [b, ...layers] : layers.filter((x) => x !== b) };
}

// ---------------------------------------------------------------- Pieces

/** A new piece of one rectangle, placed with its middle at its bone's head. */
export function addPiece(src: V2, sheet: Pair, size: Pair, name = "piece"): { src: V2; piece: number } {
  const piece: V2Piece = { name: freeName(src.pieces.map((p) => p.name), name), rectangles: [{ sheet, size, at: [-size[0] / 2, size[1] / 2] }] };
  return { src: { ...src, pieces: [...src.pieces, piece] }, piece: src.pieces.length };
}

/** A piece's second rectangle, placed beside the first as they are on the sheet. */
export function addRectangle(src: V2, n: number, sheet: Pair, size: Pair): V2 {
  const p = src.pieces[n];
  if (!p || p.rectangles.length >= 2) return src;
  const first = p.rectangles[0];
  const at: Pair = first ? [first.at[0] + (sheet[0] - first.sheet[0]), first.at[1] - (sheet[1] - first.sheet[1])] : [-size[0] / 2, size[1] / 2];
  const next = { ...p, rectangles: [...p.rectangles, { sheet, size, at }] };
  delete next.objs;
  return { ...src, pieces: src.pieces.map((x, i) => (i === n ? next : x)) };
}

/** A piece's rectangle changed (its OBJs are made again from the rectangles, so a piece's own OBJs are dropped). */
export function setRectangle(src: V2, n: number, k: number, r: Rectangle): V2 {
  const p = src.pieces[n];
  if (!p?.rectangles[k]) return src;
  const next: V2Piece = { ...p, rectangles: p.rectangles.map((x, i) => (i === k ? r : x)) };
  delete next.objs;
  return { ...src, pieces: src.pieces.map((x, i) => (i === n ? next : x)) };
}

export function removeRectangle(src: V2, n: number, k: number): V2 {
  const p = src.pieces[n];
  if (!p || p.rectangles.length < 2) return src;
  const next: V2Piece = { ...p, rectangles: p.rectangles.filter((_, i) => i !== k) };
  delete next.objs;
  return { ...src, pieces: src.pieces.map((x, i) => (i === n ? next : x)) };
}

export function renamePiece(src: V2, n: number, name: string): V2 {
  const clean = name.trim() || "piece";
  return { ...src, pieces: src.pieces.map((x, i) => (i === n ? { ...x, name: freeName(src.pieces.filter((_, j) => j !== n).map((y) => y.name), clean) } : x)) };
}

/** A piece deleted: a bone or key that showed it shows nothing (hidden), and the pieces after it are renumbered. */
export function deletePiece(src: V2, n: number): V2 {
  if (!src.pieces[n]) return src;
  const re = (i: number) => (i > n ? i - 1 : i);
  const key = (k: V2Key): V2Key => {
    if (k.piece === undefined) return k;
    if (k.piece === n) {
      const y = { ...k, hidden: true };
      delete y.piece;
      return y;
    }
    return { ...k, piece: re(k.piece) };
  };
  const next: V2 = {
    ...src,
    pieces: src.pieces.filter((_, i) => i !== n),
    bones: src.bones.map((x) => {
      const d = x.default;
      if (d?.piece === undefined) return x;
      if (d.piece === n) return withDefault(x, { ...d, piece: undefined });
      return { ...x, default: { ...d, piece: re(d.piece) } };
    }),
    sequences: src.sequences.map((seq) => ({ ...seq, parts: seq.parts.map((l) => ({ ...l, keys: l.keys.map(key) })) })),
    ...(src.loop_clips ? { loop_clips: src.loop_clips.map((c) => ({ ...c, keys: c.keys.map(key) })) } : {}),
  };
  if (src.kept?.picture_labels) {
    next.kept = { ...src.kept, picture_labels: src.kept.picture_labels.filter((_, i) => i !== n) };
  }
  return next;
}

// ---------------------------------------------------------------- Whole sides

/** Start fresh: an empty source (emptyV2) with one piece round the sheet's first art (the rectangle given) and one bone
 * showing it, the picture standing on the feet with the bone's head at its middle. */
export function freshV2(side: "front" | "back", sheet: Pair, size: Pair): V2 {
  const base = emptyV2(side);
  const { src, piece } = addPiece({ ...base, box: { width: size[0], height: size[1], x: 0, y: 0 } }, sheet, size, "body");
  const h = Math.min(size[1], 128);
  const made = addBone(src, { name: "body", head: [0, -Math.round(h / 2)], tail: [0, -h], default: { piece } }).src;
  return orderedV2(made);
}

/** The front's source as the back's start (Copy front to back): everything the same, the side changed. */
export function copySide(src: V2, side: "front" | "back"): V2 {
  return orderedV2({ ...clone(src), side });
}

/** Every bone's layer order front to back (the rig's, or the bones in order). */
export const layersOfSetup = (src: V2) => (src.layers ?? src.bones.map((_, i) => i));

/** The bones of a sequence's own layers that differ from the rig's (converted originals keep these). */
export const ownLayerSequences = (src: V2) => src.sequences.map((s, i) => [s, i] as const).filter(([s]) => !!s.layers).map(([, i]) => i);

/** Whether a sequence draws a bone (its layers, or the rig's). */
export const drawsBone = (src: V2, s: number, b: number) => layersOf(src, s).some((l) => l.bone === b);

/** A bone's tree depth and the order to list bones in (children under their parent). */
export function boneTree(src: V2): { bone: number; depth: number }[] {
  const out: { bone: number; depth: number }[] = [];
  const seen = new Set<number>();
  const visit = (b: number, depth: number) => {
    if (seen.has(b)) return;
    seen.add(b);
    out.push({ bone: b, depth });
    src.bones.forEach((x, i) => { if (x.parent === b && parentOf(src, i) === b) visit(i, depth + 1); });
  };
  src.bones.forEach((_, i) => { if (parentOf(src, i) === null) visit(i, 0); });
  src.bones.forEach((_, i) => visit(i, 0));
  return out;
}

export { mapOf };
