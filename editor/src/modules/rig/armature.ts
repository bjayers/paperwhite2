// The Rig Editor's armature (docs/paperwhite2/design/battle-sprites.md section 19): a source layer above a side's flat
// rig, <side>_rig_source.json beside <side>_rig.json (res/pokemon/battle_sprite_rig_source.schema.json), and its bake
// into the flat rig's keys, which is all the game (and the build) reads.
//
// - A bone for each track (by the same number): its parent (another track's bone, or the root), and its key poses on
//   the track's own time, each channel (move x and y, turn, scale x and y) going to the next key pose by a curve
//   (constant, linear, eased, Bezier). The picture is held from key pose to key pose.
// - A sequence's key poses: the pose shown (held) and the root's channels, the whole sprite's move, turn and scale
//   about the feet.
// - The bake samples every channel at the step (6 frames, Game Freak's rhythm, by default; per sequence or bone if
//   wanted) and at each key pose, composes each part with its parent's baked key (so a child follows exactly what the
//   game shows of its parent), and merges equal samples between two key poses into one held key. Every key pose starts
//   a key of its own, so a flat rig converted to key poses (convertToArmature) bakes back to itself, byte for byte.
// - The root goes where Game Freak put a whole sprite's movement: into the sequence's keys, split at the step (Abra,
//   Amoonguss: 57 keys of 6 frames), when the pose's parts continue on the sequence's time. A sequence key that
//   changes restarts the parts that restart (NNS's SetMCDataToMCInstanceImpl_ on every key), so over a pose whose parts
//   restart the sequence key holds the root where it starts and the root's movement from there is composed into the
//   parts' own tracks instead (unrolled over the key's span).
// - Rotation and uniform scale compose exactly; a parent's non-uniform scale over a turned child would need a shear,
//   which MCSS can't draw: the bake keeps the nearest turn and scale and warns.

import { keyAt, lengthOf, loops, type Key, type KeyType, type Pair, type Rig, type Srt, type Track } from "./mcss.ts";
import { fixedScale, orderedKey, signedDegrees } from "./model.ts";

// ---------------------------------------------------------------- The source

export type Curve = "constant" | "linear" | "ease_in" | "ease_out" | "ease_in_out" | "bezier";
export const CURVES: { curve: Curve; label: string }[] = [
  { curve: "constant", label: "Constant" }, { curve: "linear", label: "Linear" }, { curve: "ease_in", label: "Ease in" },
  { curve: "ease_out", label: "Ease out" }, { curve: "ease_in_out", label: "Ease in and out" }, { curve: "bezier", label: "Bézier" },
];
export const CHANNELS = ["move_x", "move_y", "rotation", "scale_x", "scale_y"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABELS: Record<Channel, string> = { move_x: "Move x", move_y: "Move y", rotation: "Turn", scale_x: "Scale x", scale_y: "Scale y" };
/** A Bezier handle: frames and value from its key pose. */
export type Handle = [number, number];

export interface KeyPose {
  frame: number;
  picture?: number;
  pose?: number;
  move?: Pair;
  /** Degrees, clockwise, not wrapped. */
  rotation?: number;
  scale?: Pair;
  curve?: Curve;
  curves?: Partial<Record<Channel, Curve>>;
  handles?: Partial<Record<Channel, [Handle, Handle]>>;
  /** The flat key's fields kept only where a file differs (unused, marker, result_copy). */
  flat?: Record<string, number>;
}

export interface Bone {
  parent: number | null;
  key_type: KeyType;
  frames: number;
  step?: number;
  keys: KeyPose[];
}

export interface SourceSequence {
  key_type: KeyType;
  frames: number;
  step?: number;
  keys: KeyPose[];
}

export interface Source {
  format: 1;
  side: "front" | "back";
  step: number;
  bones: Bone[];
  sequences: SourceSequence[];
  [other: string]: unknown;
}

/** Game Freak's rhythm. */
export const DEFAULT_STEP = 6;
/** The longest a bone's bake is unrolled to (its loop and its parent's), in frames. */
const LONGEST = 3600;
/** The skew (sine of its angle) above which a baked key is warned of as a shear the game can't draw. */
const SHEAR = 0.01;

// ---------------------------------------------------------------- Channels and curves

export function channelValue(key: KeyPose, channel: Channel): number {
  switch (channel) {
    case "move_x": return key.move?.[0] ?? 0;
    case "move_y": return key.move?.[1] ?? 0;
    case "rotation": return key.rotation ?? 0;
    case "scale_x": return key.scale?.[0] ?? 1;
    case "scale_y": return key.scale?.[1] ?? 1;
  }
}

/** A key pose with one channel's value changed (its pair made where it had none). */
export function withChannel(key: KeyPose, channel: Channel, value: number): KeyPose {
  switch (channel) {
    case "move_x": return { ...key, move: [value, key.move?.[1] ?? 0] };
    case "move_y": return { ...key, move: [key.move?.[0] ?? 0, value] };
    case "rotation": return { ...key, rotation: value };
    case "scale_x": return { ...key, scale: [value, key.scale?.[1] ?? 1] };
    case "scale_y": return { ...key, scale: [key.scale?.[0] ?? 1, value] };
  }
}

export const curveOf = (key: KeyPose, channel: Channel): Curve => key.curves?.[channel] ?? key.curve ?? "constant";

/** A key pose's fields in the file's order. */
export function orderedKeyPose(key: KeyPose): KeyPose {
  const out: Record<string, unknown> = {};
  for (const field of ["frame", "picture", "pose", "move", "rotation", "scale", "curve", "curves", "handles", "flat"] as const)
    if (key[field] !== undefined) out[field] = key[field];
  return out as unknown as KeyPose;
}

/** The handles a channel's key pose has: its own, or flat ones a third of the way to its neighbours. */
export function handlesOf(keys: KeyPose[], i: number, channel: Channel, frames: number): [Handle, Handle] {
  const own = keys[i].handles?.[channel];
  if (own) return own;
  const f = keys[i].frame;
  const before = i > 0 ? f - keys[i - 1].frame : DEFAULT_STEP * 3;
  const after = i + 1 < keys.length ? keys[i + 1].frame - f : Math.max(frames - f, DEFAULT_STEP);
  return [[-before / 3, 0], [after / 3, 0]];
}

/** A cubic Bezier's value at a frame: (x0, y0) to (x3, y3) through the two handles' points, x solved by halving. */
export function bezierAt(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x: number): number {
  // Handles past the other key would loop back in time: kept inside the segment, as Blender does
  x1 = Math.min(Math.max(x1, x0), x3);
  x2 = Math.min(Math.max(x2, x0), x3);
  const at = (a: number, b: number, c: number, d: number, u: number) => {
    const v = 1 - u;
    return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d;
  };
  let lo = 0, hi = 1;
  for (let n = 0; n < 50; n++) {
    const mid = (lo + hi) / 2;
    if (at(x0, x1, x2, x3, mid) < x) lo = mid;
    else hi = mid;
  }
  return at(y0, y1, y2, y3, (lo + hi) / 2);
}

/** The eased share of the way from one key to the next, u from 0 to 1. */
export function eased(curve: Curve, u: number): number {
  switch (curve) {
    case "constant": return 0;
    case "linear": return u;
    case "ease_in": return 1 - Math.cos((u * Math.PI) / 2);
    case "ease_out": return Math.sin((u * Math.PI) / 2);
    case "ease_in_out": return (1 - Math.cos(u * Math.PI)) / 2;
    case "bezier": return u;
  }
}

/** Where a key pose's segment goes: the next key pose, or for a looping track the first again at the loop's end. */
export function targetOf(keys: KeyPose[], i: number, frames: number, loop: boolean): { key: KeyPose; frame: number; index: number } | null {
  if (i + 1 < keys.length) return { key: keys[i + 1], frame: keys[i + 1].frame, index: i + 1 };
  if (loop && keys.length && frames > keys[i].frame) return { key: keys[0], frame: frames + keys[0].frame, index: 0 };
  return null;
}

/** A channel's value at a frame t of key pose i's segment (t from its frame to the next's). */
export function channelAt(keys: KeyPose[], i: number, channel: Channel, t: number, frames: number, loop: boolean): number {
  const a = keys[i];
  const va = channelValue(a, channel);
  const curve = curveOf(a, channel);
  const target = targetOf(keys, i, frames, loop);
  if (curve === "constant" || !target || target.frame <= a.frame || t <= a.frame) return va;
  let vb = channelValue(target.key, channel);
  // A loop's first key pose again, a turn later: the turn goes on to it rather than back
  if (channel === "rotation" && target.index === 0 && i > 0) vb = va + ((((vb - va) % 360) + 540) % 360) - 180;
  const span = target.frame - a.frame;
  const u = Math.min(1, (t - a.frame) / span);
  if (curve === "bezier") {
    const [, right] = handlesOf(keys, i, channel, frames);
    const [left] = handlesOf(keys, target.index, channel, frames);
    return bezierAt(a.frame, va, a.frame + right[0], va + right[1], target.frame + left[0], vb + left[1], target.frame, vb, t);
  }
  return va + (vb - va) * eased(curve, u);
}

/** The key pose whose segment holds a frame of the track's time (the last of several at one frame). */
export function segmentAt(keys: KeyPose[], t: number): number {
  let index = 0;
  for (let i = 0; i < keys.length; i++) if (keys[i].frame <= t) index = i;
  return index;
}

/** Every channel's value at a frame of the track's own time, and the picture or pose held there. */
export interface Values { picture: number; pose: number; move: Pair; rotation: number; scale: Pair }

export function valuesAt(keys: KeyPose[], t: number, frames: number, loop: boolean, i = segmentAt(keys, t)): Values {
  const at = (c: Channel) => channelAt(keys, i, c, t, frames, loop);
  return { picture: keys[i].picture ?? 0, pose: keys[i].pose ?? 0, move: [at("move_x"), at("move_y")], rotation: at("rotation"), scale: [at("scale_x"), at("scale_y")] };
}

// ---------------------------------------------------------------- Movements as maps

/** An affine map, y up: x' = a x + b y + e, y' = c x + d y + f (mcss.ts's Affine). */
export type Map2 = [number, number, number, number, number, number];

const IDENTITY: Map2 = [1, 0, 0, 1, 0, 0];

/** A key's movement (rotation in 65536ths, possibly fractional) as MCSS applies it (mcss.ts affineOf). */
function mapOf(t: Srt): Map2 {
  const [rot, sx, sy, mx, my] = t;
  const angle = (rot / 65536) * 2 * Math.PI;
  const sin = -Math.sin(angle), cos = Math.cos(angle);
  return [cos * sx, -sin * sy, sin * sx, cos * sy, mx, -my];
}

/** p then q: q(p(x)). */
function then(p: Map2, q: Map2): Map2 {
  const [a, b, c, d, e, f] = p;
  const [A, B, C, D, E, F] = q;
  return [A * a + B * c, A * b + B * d, C * a + D * c, C * b + D * d, A * e + B * f + E, C * e + D * f + F];
}

function inverse(m: Map2): Map2 {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c || 1e-12;
  const ia = d / det, ib = -b / det, ic = -c / det, id = a / det;
  return [ia, ib, ic, id, -(ia * e + ib * f), -(ic * e + id * f)];
}

const shift = (x: number, y: number): Map2 => [1, 0, 0, 1, x, y];

/** A part's whole movement, y up: its key's, then to its pivot (y down in the rig). */
const partMap = (key: Srt, pivot: Pair): Map2 => then(mapOf(key), shift(pivot[0], -pivot[1]));

/** The key that gives a part a movement about its pivot, rounded as the files hold it, and how far it is from being a
 * turn and a scale (a shear's skew, 0 for none). `expected` is the turn (65536ths) to choose a mirror's way by. */
function keyOfMap(m: Map2, pivot: Pair, expected: number): { srt: Srt; skew: number } {
  const [a, b, c, d, e, f] = then(m, shift(-pivot[0], pivot[1]));
  const length = Math.hypot(a, c) || 1e-12;
  const options = [1, -1].map((sign) => {
    const sx = sign * length;
    const cos = a / sx, sin = c / sx;
    const angle = Math.atan2(-sin, cos);
    const sy = d * cos - b * sin;
    const skew = Math.abs(b * cos + d * sin) / (Math.hypot(b, d) || 1);
    const rot = (angle / (2 * Math.PI)) * 65536;
    const off = Math.abs(((((rot - expected) % 65536) + 98304) % 65536) - 32768);
    return { sx, sy, rot, skew, off };
  });
  const best = options[0].off <= options[1].off ? options[0] : options[1];
  return { srt: [best.rot, best.sx, best.sy, e, -f], skew: best.skew };
}

/** A float movement rounded as a key holds it: 65536ths, 1/4096ths of scale, whole pixels. */
function rounded(t: Srt): Srt {
  const turn = ((Math.round(t[0]) % 65536) + 65536) % 65536;
  return [turn, fixedScale(t[1]) + 0, fixedScale(t[2]) + 0, Math.round(t[3]) + 0, Math.round(t[4]) + 0];
}

/** Key pose values as a movement (rotation in 65536ths, fractional). */
const srtOfValues = (v: Values): Srt => [(v.rotation / 360) * 65536, v.scale[0], v.scale[1], v.move[0], v.move[1]];

/** A flat key's movement, by its track's type. */
function srtOfKey(key: Key, type: KeyType): Srt {
  if (type === "srt") return [key.rotation ?? 0, key.scale?.[0] ?? 1, key.scale?.[1] ?? 1, key.move?.[0] ?? 0, key.move?.[1] ?? 0];
  if (type === "move") return [0, 1, 1, key.move?.[0] ?? 0, key.move?.[1] ?? 0];
  return [0, 1, 1, 0, 0];
}

const TYPE_ORDER: KeyType[] = ["plain", "move", "srt"];
const fuller = (a: KeyType, b: KeyType) => (TYPE_ORDER.indexOf(a) >= TYPE_ORDER.indexOf(b) ? a : b);
const typeNeeded = (t: Srt): KeyType => (t[0] !== 0 || t[1] !== 1 || t[2] !== 1 ? "srt" : t[3] !== 0 || t[4] !== 0 ? "move" : "plain");

/** A flat key of a type: picture or pose, frames, then the type's fields, then the kept extras. */
function flatKey(head: { picture?: number; pose?: number }, frames: number, t: Srt, type: KeyType, extra?: Record<string, number>): Key {
  const key: Key = { ...head, frames };
  if (type === "srt") Object.assign(key, { rotation: t[0], scale: [t[1], t[2]], move: [t[3], t[4]] });
  else if (type === "move") key.move = [t[3], t[4]];
  return orderedKey({ ...key, ...(extra ?? {}) });
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

// ---------------------------------------------------------------- The bake

export interface Baked {
  rig: Rig;
  warnings: string[];
  /** Per track: the keys baked with a shear approximated. */
  shears: Map<number, number>;
  /** The root's movement a root-level part restarting under a moving root is given at a time of its track (the
   * sequence key's own taken back out), or null where the root goes into the sequence. */
  rootMove(track: number, time: number): Map2 | null;
}

/** A sample of a baked span: from a frame, the movement held there. */
interface Piece { from: number; srt: Srt; head: { picture?: number; pose?: number }; skew?: boolean }

/** The step a sequence bakes at. */
export const sequenceStep = (source: Source, n: number) => source.sequences[n]?.step ?? source.step ?? DEFAULT_STEP;

/** The step a bone bakes at: its own, else the finest of the sequences that show a pose playing it. */
export function boneStep(source: Source, rig: Rig, track: number): number {
  const own = source.bones[track]?.step;
  if (own) return own;
  let step = 0;
  rig.sequences.forEach((seq, n) => {
    if (seq.keys.some((k) => rig.poses[k.pose ?? 0]?.parts.some((p) => p.track === track))) {
      const s = sequenceStep(source, n);
      step = step ? Math.min(step, s) : s;
    }
  });
  return step || source.step || DEFAULT_STEP;
}

/** Key poses in frame order (stable, so key poses at one frame keep theirs). */
const sortedKeys = (keys: KeyPose[]) => keys.map((k, i) => [k, i] as const).sort((a, b) => a[0].frame - b[0].frame || a[1] - b[1]).map(([k]) => k);

/** The spans a key pose list bakes into over `length` frames of its own time (repeated each `frames` when longer):
 * each key pose's from its frame to the next's, a key pose at the very end lasting 0. */
function segmentsOf(keys: KeyPose[], frames: number, length: number) {
  const out: { index: number; from: number; to: number; base: number }[] = [];
  if (frames <= 0) {
    keys.forEach((_, i) => out.push({ index: i, from: 0, to: 0, base: 0 }));
    return out;
  }
  for (let base = 0; base < length; base += frames) {
    const last = base + frames >= length;
    keys.forEach((key, i) => {
      if (key.frame >= frames && !last) return; // (the end's key pose, which the next loop's first is at)
      const from = base + key.frame;
      if (from > length) return;
      const next = i + 1 < keys.length ? keys[i + 1].frame : frames;
      out.push({ index: i, from, to: Math.min(base + next, length), base });
    });
  }
  return out;
}

/** Pieces of a span: cut at each multiple of the step and at the cuts given, a sample at each piece's start. */
function cutsOf(from: number, to: number, step: number, cuts: number[]): number[] {
  const points = new Set<number>([from]);
  for (let g = Math.ceil((from + 1) / step) * step; g < to; g += step) points.add(g);
  for (const c of cuts) if (c > from && c < to) points.add(c);
  return [...points].sort((a, b) => a - b);
}

const sameSrt = (a: Srt, b: Srt) => a.every((v, i) => v === b[i]);

/** The flat keys of pieces: each held to the next's start (or the span's end), equal neighbours merged. */
function keysOfPieces(pieces: Piece[], to: number, type: KeyType, extra?: Record<string, number>, skewed?: { count: number }): Key[] {
  const out: { piece: Piece; frames: number }[] = [];
  pieces.forEach((piece, i) => {
    const end = i + 1 < pieces.length ? pieces[i + 1].from : to;
    const prev = out.at(-1);
    if (prev && sameSrt(prev.piece.srt, piece.srt) && prev.piece.head.picture === piece.head.picture && prev.piece.head.pose === piece.head.pose) prev.frames += end - piece.from;
    else out.push({ piece, frames: end - piece.from });
  });
  if (skewed) skewed.count += out.filter((o) => o.piece.skew).length;
  return out.map((o, i) => flatKey(o.piece.head, o.frames, o.piece.srt, type, i === 0 ? extra : undefined));
}

/** The frames at which a baked track's keys start, over `length` frames of its time. */
function boundariesOf(track: Track, length: number): number[] {
  const total = lengthOf(track);
  if (!total) return [];
  const out: number[] = [];
  const reps = loops(track.play) ? Math.ceil(length / total) : 1;
  for (let r = 0; r < reps; r++) {
    let t = r * total;
    for (const key of track.keys) {
      out.push(t);
      t += key.frames;
    }
  }
  return out;
}

const constantTrack = (track: Track) => track.keys.every((k) => sameSrt(srtOfKey(k, track.key_type), srtOfKey(track.keys[0], track.key_type)));

/** Whether every value a sequence's key pose segment shows of the root is the same, rounded. */
function rootConstant(keys: KeyPose[], i: number, from: number, to: number, frames: number, loop: boolean): boolean {
  const first = rounded(srtOfValues(valuesAt(keys, from, frames, loop, i)));
  for (let t = from + 1; t < to; t++) if (!sameSrt(first, rounded(srtOfValues(valuesAt(keys, t, frames, loop, i))))) return false;
  return true;
}

/** Bakes a source into the flat rig: its tracks' and sequences' keys (and key types), everything else as it is. */
export function bake(source: Source, flat: Rig): Baked {
  const warnings: string[] = [];
  const shears = new Map<number, number>();
  const tracks = flat.tracks.slice();
  const sequences = flat.sequences.slice();

  // Which pose plays each track first, its part there, and whether the poses' parts continue on the sequence's time
  const firstUse = new Map<number, { pose: number; part: number }>();
  flat.poses.forEach((pose, p) => pose.parts.forEach((part, k) => { if (!firstUse.has(part.track)) firstUse.set(part.track, { pose: p, part: k }); }));
  const pivotOf = (track: number, pose?: number): Pair => {
    const inPose = pose !== undefined ? flat.poses[pose]?.parts.find((x) => x.track === track) : undefined;
    if (inPose) return inPose.pivot;
    const use = firstUse.get(track);
    return use ? flat.poses[use.pose].parts[use.part].pivot : [0, 0];
  };

  // ---- Sequences, and the root's movement that goes into restarting parts' tracks
  /** The root's movement over a sequence key's span, by track: from the sequence key's (rounded) to each frame's. */
  const deltas = new Map<number, { sequence: number; start: number; span: number; at: Map2; keys: KeyPose[]; frames: number; loop: boolean }>();
  source.sequences.forEach((sq, n) => {
    const target = flat.sequences[n];
    if (!target) return;
    const keys = sortedKeys(sq.keys);
    const loop = loops(target.play);
    const step = sequenceStep(source, n);
    const out: Key[] = [];
    let type: KeyType = sq.key_type;
    const pieces: { pieces: Piece[]; to: number; extra?: Record<string, number> }[] = [];
    const segments = segmentsOf(keys, sq.frames, sq.frames).map((seg) => ({
      ...seg, still: seg.to <= seg.from || rootConstant(keys, seg.index, seg.from, seg.to, sq.frames, loop) }));
    for (let g = 0; g < segments.length; g++) {
      const seg = segments[g];
      const key = keys[seg.index];
      const pose = key.pose ?? 0;
      const head = { pose };
      const sample = (t: number, index = seg.index): Piece => ({ from: t, srt: rounded(srtOfValues(valuesAt(keys, t, sq.frames, loop, index))), head });
      if (seg.still) {
        pieces.push({ pieces: [sample(seg.from)], to: seg.to, extra: key.flat });
        continue;
      }
      const parts = flat.poses[pose]?.parts ?? [];
      if (parts.every((p) => p.play === "continue")) {
        pieces.push({ pieces: cutsOf(seg.from, seg.to, step, []).map((t) => sample(t)), to: seg.to, extra: key.flat });
        continue;
      }
      // Parts that restart: one sequence key, which holds the root where it starts, for the root's key poses that move
      // on the same pose (and the still one after them); the root's movement from there goes into the parts
      let end = g;
      while (end + 1 < segments.length && (keys[segments[end + 1].index].pose ?? 0) === pose && segments[end + 1].to > segments[end + 1].from
             && (!segments[end].still || !segments[end + 1].still)) end++;
      const to = segments[end].to;
      const start = sample(seg.from);
      pieces.push({ pieces: [start], to, extra: key.flat });
      if (parts.some((p) => p.play === "continue"))
        warnings.push(`Sequence ${n}'s root moves over pose ${pose}, whose parts partly continue: only the parts that restart follow it (make them all restart or all continue).`);
      for (const part of parts) {
        if (part.play !== "restart" || (source.bones[part.track]?.parent ?? null) !== null) continue;
        const had = deltas.get(part.track);
        if (had) {
          if (had.sequence !== n || had.start !== seg.from)
            warnings.push(`${tracks[part.track]?.name}: its pose is shown by more than one sequence key the root moves in; it follows the first (sequence ${had.sequence}, frame ${had.start}).`);
          continue;
        }
        deltas.set(part.track, { sequence: n, start: seg.from, span: to - seg.from, at: mapOf(start.srt), keys, frames: sq.frames, loop });
      }
      g = end;
    }
    for (const p of pieces) {
      for (const piece of p.pieces) type = fuller(type, typeNeeded(piece.srt));
    }
    for (const p of pieces) out.push(...keysOfPieces(p.pieces, p.to, type, p.extra));
    sequences[n] = { ...target, key_type: type, keys: out };
  });
  // Restarting parts whose pose some sequence key shows with a still root: they move there too
  for (const [track, delta] of deltas) {
    const pose = firstUse.get(track)?.pose;
    const elsewhere = source.sequences.some((sq, n) => sortedKeys(sq.keys).some((k) => flat.poses[k.pose ?? 0]?.parts.some((p) => p.track === track) && !(n === delta.sequence && k.frame >= delta.start && k.frame < delta.start + delta.span)));
    if (elsewhere && pose !== undefined)
      warnings.push(`${tracks[track]?.name}: the root's movement is baked into its track, which another sequence key (or sequence) also plays, where it moves the same way.`);
  }

  /** The root's movement from the sequence key's: back through the key's, then the root's at that time. */
  const rootMove = (track: number, time: number): Map2 | null => {
    const delta = deltas.get(track);
    if (!delta || (source.bones[track]?.parent ?? null) !== null) return null;
    const root = srtOfValues(valuesAt(delta.keys, delta.start + Math.min(time, delta.span), delta.frames, delta.loop));
    return then(mapOf(root), inverse(delta.at));
  };

  // ---- Bones, parents first
  const order: number[] = [];
  const state = new Map<number, "busy" | "done">();
  const parentOf = (t: number): number | null => {
    const p = source.bones[t]?.parent ?? null;
    return p !== null && p >= 0 && p < flat.tracks.length && p !== t ? p : null;
  };
  const visit = (t: number) => {
    if (state.get(t) === "done") return;
    if (state.get(t) === "busy") return;
    state.set(t, "busy");
    const p = parentOf(t);
    if (p !== null) {
      if (state.get(p) === "busy") warnings.push(`${tracks[t]?.name} and its parents go round in a circle: it bakes as if parented to the root.`);
      else visit(p);
    }
    state.set(t, "done");
    order.push(t);
  };
  for (let t = 0; t < flat.tracks.length; t++) visit(t);
  const cyclic = new Set<number>();
  for (const t of order) {
    let p = parentOf(t);
    const seen = new Set<number>([t]);
    while (p !== null) {
      if (seen.has(p)) { cyclic.add(t); break; }
      seen.add(p);
      p = parentOf(p);
    }
  }

  for (const t of order) {
    const bone = source.bones[t];
    const track = flat.tracks[t];
    if (!bone || !track) continue;
    const keys = sortedKeys(bone.keys);
    if (!keys.length) continue;
    const frames = bone.frames;
    const loop = loops(track.play);
    const step = boneStep(source, flat, t);
    const parent = cyclic.has(t) ? null : parentOf(t);
    const parentTrack = parent !== null ? tracks[parent] : undefined;
    const use = firstUse.get(t);
    const pivot = pivotOf(t, use?.pose);
    const delta = parent === null ? deltas.get(t) : undefined;
    const parentLength = parentTrack ? lengthOf(parentTrack) : 0;
    const parentMoves = parentTrack ? !constantTrack(parentTrack) : false;
    if (parent !== null && use) {
      const childPart = flat.poses[use.pose].parts[use.part];
      const parentPart = flat.poses[use.pose].parts.find((x) => x.track === parent);
      if (!parentPart) warnings.push(`${track.name}'s parent ${tracks[parent]?.name} isn't in pose ${use.pose}: it follows it all the same, about its pivot in another pose.`);
      else if (parentPart.play !== childPart.play && parentMoves)
        warnings.push(`${track.name} ${childPart.play}s with its pose and its parent ${tracks[parent]?.name} ${parentPart.play}s: they keep different clocks, so it follows only roughly.`);
      if (flat.idle_parts && flat.idle_parts.includes(use.part) && parentPart && parentMoves && !flat.idle_parts.includes(flat.poses[use.pose].parts.indexOf(parentPart)))
        warnings.push(`${track.name} is an idle part and its parent ${tracks[parent]?.name} isn't: in the battle's idle pause it goes on with its parent's movement while the parent stops.`);
    }

    // How long the bake runs: the track's loop, or long enough for its parent's loop too, or the root's span
    let length = frames;
    if (delta) length = Math.max(frames, delta.span);
    else if (parentMoves && parentLength > 0 && frames > 0 && loop && frames % parentLength !== 0) {
      const lcm = (frames / gcd(frames, parentLength)) * parentLength;
      if (lcm <= LONGEST) {
        length = lcm;
        warnings.push(`${track.name} loops every ${frames} frames and its parent ${tracks[parent!]?.name} every ${parentLength}: baked over ${lcm} frames so it follows exactly.`);
      } else warnings.push(`${track.name} loops every ${frames} frames and its parent ${tracks[parent!]?.name} every ${parentLength}: they'd meet again only after ${lcm}; it follows the parent only within its own loop. Give them lengths that divide each other.`);
    }
    if (delta && delta.span > frames && frames > 0 && !loop)
      warnings.push(`${track.name} plays once (${frames} frames) and the root moves for ${delta.span}: it's baked over the root's span.`);

    const parentCuts = parentTrack && parentMoves ? boundariesOf(parentTrack, length) : [];
    const parentPivot = parent !== null ? pivotOf(parent, use?.pose) : [0, 0] as Pair;
    const parentRest = parent !== null ? shift(parentPivot[0], -parentPivot[1]) : IDENTITY;
    let type: KeyType = bone.key_type;
    const spans: { pieces: Piece[]; to: number; extra?: Record<string, number> }[] = [];
    for (const seg of segmentsOf(keys, frames, length)) {
      const key = keys[seg.index];
      const head = { picture: key.picture ?? 0 };
      const sample = (time: number): Piece => {
        const local = Math.min(time - seg.base, frames);
        const own = srtOfValues(valuesAt(keys, local, frames, loop, seg.index));
        let srt: Srt;
        if (parent === null && !delta) srt = rounded(own);
        else {
          let world = partMap(own, pivot);
          let expected = own[0];
          if (parentTrack) {
            const pk = keyAt(parentTrack, time);
            const ps = srtOfKey(pk.key, parentTrack.key_type);
            // The parent's movement from where it rests: its key about its pivot
            world = then(world, then(inverse(parentRest), partMap(ps, parentPivot)));
            expected += ps[0];
          } else if (delta) {
            world = then(world, rootMove(t, time)!);
          }
          const out = keyOfMap(world, pivot, expected);
          srt = rounded(out.srt);
          if (out.skew > SHEAR) return { from: time, srt, head, skew: true };
        }
        return { from: time, srt, head };
      };
      if (seg.to <= seg.from) spans.push({ pieces: [sample(seg.from)], to: seg.to, extra: key.flat });
      else spans.push({ pieces: cutsOf(seg.from, seg.to, step, parentCuts).map(sample), to: seg.to, extra: key.flat });
    }
    for (const s of spans) for (const piece of s.pieces) type = fuller(type, typeNeeded(piece.srt));
    const out: Key[] = [];
    const counter = { count: 0 };
    for (const s of spans) out.push(...keysOfPieces(s.pieces, s.to, type, s.extra, counter));
    tracks[t] = { ...track, key_type: type, keys: out };
    const skewed = counter.count;
    if (skewed) {
      shears.set(t, skewed);
      warnings.push(`${track.name}: ${skewed} baked keys would need a shear the game can't draw (a parent's uneven scale over a turned child); they keep the nearest turn and scale. Keep ${tracks[parent!]?.name ?? "the root"}'s scale even, or the child unturned.`);
    }
  }
  if (source.bones.length < flat.tracks.length)
    warnings.push(`${flat.tracks.length - source.bones.length} tracks have no bone yet: they keep their keys as they are.`);
  return { rig: { ...flat, tracks, sequences }, warnings, shears, rootMove };
}

// ---------------------------------------------------------------- Convert to armature

/** Key poses for a flat track's (or sequence's) keys: one at each key's start, held (constant), the turn in degrees
 * unwrapped from the key before. */
function keyPosesOf(track: Track, field: "picture" | "pose"): KeyPose[] {
  let frame = 0;
  let turn = 0;
  return track.keys.map((key) => {
    const out: KeyPose = { frame };
    out[field] = key[field] ?? 0;
    if (track.key_type !== "plain") out.move = [key.move?.[0] ?? 0, key.move?.[1] ?? 0];
    if (track.key_type === "srt") {
      let d = signedDegrees(key.rotation ?? 0);
      while (d - turn > 180) d -= 360;
      while (d - turn < -180) d += 360;
      turn = d;
      out.rotation = d;
      out.scale = [key.scale?.[0] ?? 1, key.scale?.[1] ?? 1];
    }
    const extra: Record<string, number> = {};
    for (const x of ["unused", "marker", "result_copy"] as const) if (key[x] !== undefined) extra[x] = key[x]!;
    if (Object.keys(extra).length) out.flat = extra;
    frame += key.frames;
    return orderedKeyPose(out);
  });
}

/** An armature for a flat rig: each part a bone of the root's, at its pivot, its held keys as constant key poses; it
 * bakes back to the flat rig exactly. */
export function convertToArmature(rig: Rig, step = DEFAULT_STEP): Source {
  return {
    format: 1,
    side: rig.side,
    step,
    bones: rig.tracks.map(boneOf),
    sequences: rig.sequences.map((seq) => ({ key_type: seq.key_type, frames: lengthOf(seq), keys: keyPosesOf(seq, "pose") })),
  };
}

/** A bone for a flat track, as convertToArmature makes it. */
export function boneOf(track: Track): Bone {
  return { parent: null, key_type: track.key_type, frames: lengthOf(track), keys: keyPosesOf(track, "picture") };
}

// ---------------------------------------------------------------- Edits

/** A key pose list with one at a frame: the one there (the last of several) changed, or a new one with the values the
 * curves give there, its curve the key pose's before it. Returns the list and the key pose's place. */
export function keyPoseAt(keys: KeyPose[], frame: number, frames: number, loop: boolean, change: (key: KeyPose) => KeyPose): { keys: KeyPose[]; index: number } {
  const sorted = sortedKeys(keys);
  let at = -1;
  for (let i = 0; i < sorted.length; i++) if (sorted[i].frame === frame) at = i;
  if (at >= 0) {
    const next = sorted.slice();
    next[at] = orderedKeyPose(change(sorted[at]));
    return { keys: next, index: at };
  }
  const i = segmentAt(sorted, frame);
  const v = valuesAt(sorted, frame, frames, loop, i);
  const before = sorted[i];
  const fresh: KeyPose = { frame };
  if (before.picture !== undefined) fresh.picture = before.picture;
  if (before.pose !== undefined) fresh.pose = before.pose;
  fresh.move = [round3(v.move[0]), round3(v.move[1])];
  fresh.rotation = round3(v.rotation);
  fresh.scale = [fixedScale(v.scale[0]), fixedScale(v.scale[1])];
  fresh.curve = before.curve ?? "constant";
  if (before.curves) fresh.curves = before.curves;
  const index = sorted.findIndex((k) => k.frame > frame);
  const next = sorted.slice();
  const place = index < 0 ? next.length : index;
  next.splice(place, 0, orderedKeyPose(change(fresh)));
  return { keys: next, index: place };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000 + 0;

/** The local frame of a track (or the root) at a time of the sequence, as the flat rig plays it, within its loop. */
export function localFrame(frames: number, loop: boolean, time: number): number {
  if (frames <= 0) return 0;
  return loop ? ((time % frames) + frames) % frames : Math.min(time, frames);
}

/** The flat rig's sequences and tracks rebuilt where a source misses bones (a part added): bones for them. */
export function withBones(source: Source, rig: Rig): Source {
  if (source.bones.length >= rig.tracks.length && source.sequences.length >= rig.sequences.length) return source;
  return {
    ...source,
    bones: [...source.bones, ...rig.tracks.slice(source.bones.length).map(boneOf)],
    sequences: [...source.sequences, ...rig.sequences.slice(source.sequences.length).map((seq) => ({ key_type: seq.key_type, frames: lengthOf(seq), keys: keyPosesOf(seq, "pose") }))],
  };
}

/** The source with a picture removed: key poses showing a later one show the one before it now (as removePicture). */
export function sourceWithoutPicture(source: Source, picture: number): Source {
  return { ...source, bones: source.bones.map((b) => ({ ...b, keys: b.keys.map((k) => (k.picture !== undefined && k.picture > picture ? { ...k, picture: k.picture - 1 } : k)) })) };
}

/** A bone given a new parent (or the root's, null) where it stays drawn where it is, as Blender's Keep Transform: its key
 * poses written again, relative to the new parent, as constant key poses at each of its baked keys and each of the new
 * parent's (so it bakes back to the keys it had: exactly, where the parents only move, as most original parts do). Its
 * curves become held keys, which a parent's own keys cut. */
export function reparent(source: Source, flat: Rig, bone: number, parent: number | null): Source {
  const before = bake(source, flat).rig.tracks[bone];
  const next: Source = { ...source, bones: source.bones.map((b, i) => (i === bone ? { ...b, parent } : b)) };
  if (!before || !source.bones[bone]) return next;
  const after = bake(next, flat);
  const own = source.bones[bone];
  const parentTrack = parent !== null ? after.rig.tracks[parent] : undefined;
  const firstUse = flat.poses.map((pose, p) => ({ p, part: pose.parts.find((x) => x.track === bone) })).find((x) => x.part);
  const pose = firstUse?.p;
  const pivotOf = (track: number): Pair => {
    const inPose = pose !== undefined ? flat.poses[pose].parts.find((x) => x.track === track) : undefined;
    return inPose?.pivot ?? flat.poses.flatMap((x) => x.parts).find((x) => x.track === track)?.pivot ?? [0, 0];
  };
  const pivot = pivotOf(bone);
  const parentPivot = parent !== null ? pivotOf(parent) : [0, 0] as Pair;
  // Over the child's loop, or long enough for a moving parent's loop too (as the bake unrolls it)
  const ownLength = lengthOf(before);
  const parentLength = parentTrack ? lengthOf(parentTrack) : 0;
  let length = ownLength;
  if (parentTrack && !constantTrack(parentTrack) && parentLength > 0 && ownLength > 0 && loops(before.play) && ownLength % parentLength) {
    const lcm = (ownLength / gcd(ownLength, parentLength)) * parentLength;
    if (lcm <= LONGEST) length = lcm;
  }
  const cycle: Key[] = [];
  for (let n = 0; n < Math.max(1, length / Math.max(ownLength, 1)); n++) {
    // (a key held 0 frames at a loop's end only at the last loop's)
    const last = (n + 1) * ownLength >= length;
    cycle.push(...before.keys.filter((key, i) => last || key.frames > 0 || i < before.keys.length - 1));
  }
  const cuts = parentTrack && !constantTrack(parentTrack) ? boundariesOf(parentTrack, length) : [];
  const keys: KeyPose[] = [];
  let turn = 0;
  let start = 0;
  cycle.forEach((key) => {
    const end = start + key.frames;
    const times = [start, ...cuts.filter((c) => c > start && c < end)].sort((a, b) => a - b);
    for (const time of times) {
      const k0 = srtOfKey(key, before.key_type);
      let world = partMap(k0, pivot);
      let expected = k0[0];
      if (parentTrack) {
        const ps = srtOfKey(keyAt(parentTrack, time).key, parentTrack.key_type);
        world = then(world, inverse(then(inverse(shift(parentPivot[0], -parentPivot[1])), partMap(ps, parentPivot))));
        expected -= ps[0];
      } else {
        const d = after.rootMove(bone, time);
        if (d) world = then(world, inverse(d));
      }
      const srt = keyOfMap(world, pivot, expected).srt;
      const r = ((Math.round(srt[0]) % 65536) + 65536) % 65536;
      let d = signedDegrees(r);
      while (d - turn > 180) d -= 360;
      while (d - turn < -180) d += 360;
      turn = d;
      const pose: KeyPose = { frame: time, picture: key.picture ?? 0 };
      const move: Pair = [tidyMove(srt[3]), tidyMove(srt[4])];
      if (own.key_type !== "plain" || move[0] || move[1]) pose.move = move;
      const scale: Pair = [fixedScale(srt[1]) + 0, fixedScale(srt[2]) + 0];
      if (own.key_type === "srt" || d || scale[0] !== 1 || scale[1] !== 1) { pose.rotation = d; pose.scale = scale; }
      const extra: Record<string, number> = {};
      for (const x of ["unused", "marker", "result_copy"] as const) if (key[x] !== undefined) extra[x] = key[x]!;
      if (time === start && Object.keys(extra).length) pose.flat = extra;
      keys.push(orderedKeyPose(pose));
    }
    start = end;
  });
  return { ...next, bones: next.bones.map((b, i) => (i === bone ? { ...b, frames: length, keys } : b)) };
}

const tidyMove = (v: number) => {
  const whole = Math.round(v);
  return (Math.abs(v - whole) < 1e-6 ? whole : Math.round(v * 1000) / 1000) + 0;
};

/** Whether making `parent` the bone's parent would make a circle. */
export function wouldCycle(source: Source, bone: number, parent: number | null): boolean {
  let p = parent;
  const seen = new Set<number>();
  while (p !== null && p !== undefined) {
    if (p === bone || seen.has(p)) return true;
    seen.add(p);
    p = source.bones[p]?.parent ?? null;
  }
  return false;
}
