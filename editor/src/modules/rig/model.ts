// The Rig Editor's model: the rig read from the document's data (shared where unchanged, so a small edit converts
// little), the edits it makes, the OBJs a picture's rectangles give (mcss_rig.generate_objs), the sizes a rectangle may
// have, and the timeline's layout of a track over the sequence's time.
//
// Edits are written into the document at a path where they can be (documents.edit, a step for undo; amend for a drag's
// later moves), and as the whole rig where they renumber (removing a picture, reordering parts).

import { JsonFloat, fromPlain, type JsonValue } from "../../../shared/json.ts";
import { keyAt, lengthOf, loops, sequenceKeyAt, type Key, type KeyType, type Obj, type Pair, type Picture, type Rectangle,
         type Rig, type Sequence, type Track } from "./mcss.ts";

// ---------------------------------------------------------------- Reading

const plain = new WeakMap<object, unknown>();

/** Plain JavaScript for the editor's JSON values, cached by object so an edit's untouched branches convert once. */
export function plainOf(v: JsonValue): unknown {
  if (v instanceof JsonFloat) return v.value;
  if (v === null || typeof v !== "object") return v;
  const cached = plain.get(v);
  if (cached !== undefined) return cached;
  const out = v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [k, plainOf(x)])) : (v as JsonValue[]).map(plainOf);
  plain.set(v, out);
  return out;
}

/** The rig a document holds, without its "$schema". */
export function rigOf(data: JsonValue): Rig {
  return plainOf(data) as Rig;
}

// ---------------------------------------------------------------- Writing

export type Phase = "start" | "move" | "end" | "typed";

/** Where an edit goes: the document's data at a path, a step of its own or a drag's later move. */
export interface Editor {
  set(path: (string | number)[], value: unknown, phase?: Phase): void;
  /** The whole rig in one step (keeping "$schema" first). */
  replace(rig: Rig, phase?: Phase): void;
}

/** A key with its fields in the files' order: picture or pose, frames, rotation, scale, move, then the rest. */
export function orderedKey(key: Key): Key {
  const out: Record<string, unknown> = {};
  for (const field of ["picture", "pose", "frames", "rotation", "scale", "move", "unused", "marker", "result_copy"] as const)
    if (key[field] !== undefined) out[field] = key[field];
  return out as unknown as Key;
}

/** A key as a track of another type holds it: a move kept, a turn and scale given or dropped. */
export function keyAs(key: Key, type: KeyType): Key {
  const { rotation, scale, move, unused, ...rest } = key;
  if (type === "plain") return orderedKey(rest);
  if (type === "move") return orderedKey({ ...rest, move: move ?? [0, 0], ...(unused !== undefined ? { unused } : {}) });
  return orderedKey({ ...rest, rotation: rotation ?? 0, scale: scale ?? [1, 1], move: move ?? [0, 0] });
}

/** The rig as the document's data: "$schema" first, the rest in the rig's order. */
export function dataOf(rig: Rig, schema: unknown): JsonValue {
  return fromPlain({ ...(schema !== undefined ? { $schema: schema } : {}), ...Object.fromEntries(Object.entries(rig).filter(([k]) => k !== "$schema")) });
}

// ---------------------------------------------------------------- OBJs and rectangle sizes

/** The OBJ sizes (width, height) of the DS. */
export const OBJ_SIZES: Pair[] = [[8, 8], [16, 16], [32, 32], [64, 64], [16, 8], [32, 8], [32, 16], [64, 32], [8, 16], [8, 32], [16, 32], [32, 64]];
const isObjSize = (w: number, h: number) => OBJ_SIZES.some(([a, b]) => a === w && b === h);

function cut(length: number): number[] {
  const out: number[] = [];
  for (const piece of [64, 32, 16, 8]) while (length >= piece) { out.push(piece); length -= piece; }
  return out;
}

/** Why a rectangle's size can't be cut into OBJs as the originals' are (mcss_rig.generate_objs: rows and columns of
 * 64, 32, 16 and 8), or null. MCSS draws any size; the cells' OBJs need these. */
export function sizeProblem(w: number, h: number): string | null {
  if (w <= 0 || h <= 0) return "it has no width or height";
  if (w % 8 || h % 8) return `${w}×${h} isn't in whole tiles (multiples of 8)`;
  for (const pw of cut(w)) for (const ph of cut(h)) if (!isObjSize(pw, ph)) return `its ${pw}×${ph} piece isn't an OBJ size (a side of 64 needs the other 32 or 64)`;
  return null;
}

/** The OBJs for a picture whose rectangles changed, as NITRO-CHARACTER laid them out (mcss_rig.generate_objs, double
 * size): the second rectangle's first, each cut into rows and columns of 64, 32, 16 and 8. MCSS never draws them. */
export function generateObjs(picture: Picture): Obj[] {
  const objs: Obj[] = [];
  const list = picture.rectangles.map((r, k) => [r, k] as const).reverse();
  for (const [r, k] of list) {
    const [s, t] = r.sheet, [w, h] = r.size, [x, y] = r.at;
    let down = 0;
    for (const ph of cut(Math.trunc(h))) {
      let across = 0;
      for (const pw of cut(Math.trunc(w))) {
        if (!isObjSize(pw, ph)) throw new Error(`a ${pw} by ${ph} piece of a rectangle isn't an OBJ size`);
        objs.push({ x: Math.trunc(x) + across - pw / 2, y: -Math.trunc(y) + down - ph / 2, size: [pw, ph],
                    tile: Math.floor((Math.trunc(t) + down) / 8) * 32 + Math.floor((Math.trunc(s) + across) / 8),
                    attributes: [(k ? 0x400 : 0) | 0x300, 0, 0] });
        across += pw;
      }
      down += ph;
    }
  }
  return objs;
}

/** A picture with new rectangles, its OBJs made again (kept as they were where the rectangles cut into none). */
export function withRectangles(picture: Picture, rectangles: Rectangle[]): Picture {
  const next = { ...picture, rectangles };
  try {
    return { ...next, objs: generateObjs(next) };
  } catch {
    return next;
  }
}

// ---------------------------------------------------------------- Uses

/** The tracks (and their keys) that show a picture. */
export function pictureUses(rig: Rig, picture: number): { track: number; key: number }[] {
  const out: { track: number; key: number }[] = [];
  rig.tracks.forEach((track, t) => track.keys.forEach((key, k) => { if (key.picture === picture) out.push({ track: t, key: k }); }));
  return out;
}

/** The parts (pose, place) that play a track. */
export function trackUses(rig: Rig, track: number): { pose: number; part: number }[] {
  const out: { pose: number; part: number }[] = [];
  rig.poses.forEach((pose, p) => pose.parts.forEach((part, k) => { if (part.track === track) out.push({ pose: p, part: k }); }));
  return out;
}

/** A part's name from its track's (head_a: head), without the pose's letter. */
export function partName(track: Track | undefined): string {
  if (!track) return "?";
  const m = /^(.+)_[a-f]$/.exec(track.name);
  return m ? m[1] : track.name;
}

/** The rig without a picture: keys showing a later picture show the one before it now, renumbered. */
export function removePicture(rig: Rig, picture: number): Rig {
  return {
    ...rig,
    pictures: rig.pictures.filter((_, i) => i !== picture),
    tracks: rig.tracks.map((track) => ({ ...track, keys: track.keys.map((key) =>
      key.picture !== undefined && key.picture > picture ? { ...key, picture: key.picture - 1 } : key) })),
  };
}

/** A pose's parts reordered (from one place to another), the idle parts following the part moved. */
export function moveLayer(rig: Rig, pose: number, from: number, to: number): Rig {
  const parts = rig.poses[pose].parts.slice();
  const [moved] = parts.splice(from, 1);
  parts.splice(to, 0, moved);
  const order = rig.poses[pose].parts.map((_, i) => i);
  const [o] = order.splice(from, 1);
  order.splice(to, 0, o);
  // order[newPlace] = oldPlace
  const idle = rig.idle_parts === null ? null
    : rig.idle_parts.map((old) => order.indexOf(old)).filter((n) => n >= 0).sort((a, b) => a - b);
  return { ...rig, idle_parts: idle, poses: rig.poses.map((p, i) => (i === pose ? { ...p, parts } : p)) };
}

// ---------------------------------------------------------------- The timeline

/** A key's place on the timeline: frames from the sequence's start. */
export interface Span {
  key: number;
  from: number;
  to: number;
  /** Which time through the track (0 the first); later passes are shown faded. */
  pass: number;
  /** Past a track that plays once: its last key held. */
  held?: boolean;
  /** Keys of the first pass that the pose's time on the sequence ends before: not played. */
  unplayed?: boolean;
}

/** A track's keys laid over a stretch of the sequence: from `start` (the sequence's time) for `duration` frames, the
 * track's own clock at `local` when it begins. */
export function trackSpans(track: Track, start: number, duration: number, local: number, overflow = false): Span[] {
  const out: Span[] = [];
  const length = lengthOf(track);
  if (!track.keys.length) return out;
  if (length === 0) return [{ key: 0, from: start, to: start + duration, pass: 0 }];
  const end = start + duration;
  let pass = loops(track.play) ? Math.floor(local / length) : 0;
  let t = local;
  if (!loops(track.play) && t >= length) {
    const last = keyAt(track, t).index;
    return [{ key: last, from: start, to: end, pass: 0, held: true }];
  }
  let at = keyAt(track, t);
  let x = start - at.since;
  let index = at.index;
  // (zero-frame keys before the first are shown at its start, on the first pass)
  while (x < end) {
    const key = track.keys[index];
    const from = x, to = x + key.frames;
    if (to > start || key.frames === 0) {
      if (key.frames > 0 || pass === 0) out.push({ key: index, from: Math.max(from, start), to: Math.min(to, end), pass });
    }
    x = to;
    index++;
    if (index >= track.keys.length) {
      if (!loops(track.play)) {
        if (x < end) out.push({ key: keyAt(track, length - 1).index, from: x, to: end, pass: 0, held: true });
        break;
      }
      index = 0;
      pass++;
    }
  }
  if (overflow && local === 0 && length > duration) {
    // The first pass's keys past the stretch's end, shown as not played
    let y = start;
    track.keys.forEach((key, k) => {
      if (y >= end && key.frames > 0) out.push({ key: k, from: y, to: y + key.frames, pass: 0, unplayed: true });
      y += key.frames;
    });
  }
  return out;
}

/** The stretches of a sequence's loop: each key's pose, from and to. */
export function sequenceSegments(sequence: Sequence): { key: number; pose: number; from: number; to: number }[] {
  let t = 0;
  return sequence.keys.map((key, k) => {
    const from = t;
    t += key.frames;
    return { key: k, pose: key.pose ?? 0, from, to: t };
  });
}

/** The key a part shows at a time of the sequence, as the preview draws it. */
export function partKeyAt(rig: Rig, sequence: number, time: number, pose: number, part: number) {
  const seq = rig.sequences[sequence];
  const at = sequenceKeyAt(seq, time);
  const p = rig.poses[pose]?.parts[part];
  if (!p || (at.key.pose ?? 0) !== pose) return null;
  const track = rig.tracks[p.track];
  return { track: p.track, ...keyAt(track, p.play === "restart" ? at.since : time) };
}

// ---------------------------------------------------------------- Units

/** 65536ths of a turn as degrees, and back (rounded to the nearest 65536th). */
export const toDegrees = (rotation: number) => (rotation / 65536) * 360;
export const fromDegrees = (degrees: number) => ((Math.round((degrees / 360) * 65536) % 65536) + 65536) % 65536;
/** A turn shown between -180 and 180 degrees. */
export const signedDegrees = (rotation: number) => {
  const d = toDegrees(rotation);
  return d > 180 ? d - 360 : d;
};
/** A scale as the files hold it: a multiple of 1/4096. */
export const fixedScale = (v: number) => Math.round(v * 4096) / 4096;
