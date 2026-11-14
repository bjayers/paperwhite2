// The new Rig Editor's sequences (rig-editor-v2.md, "Built: step 3"): the edits of a side's _rig_v2.json that animate
// it, as pure functions of the source (v2.ts), so the page, its timeline, its graph editor and the tests share them.
//
// - The list: add (holding the default pose), rename, duplicate, delete, reorder; every sequence number in the source
//   (the timeline's and the strips' blocks, the tracks' order, the originals' shared tracks) renumbered with it.
// - A sequence's keyframes per part, on the shared bones: a part's values at a frame (the curves between its keys, from
//   the default pose at frame 0 and back to it at the length), keying at a frame from those values (the gizmos, K,
//   Shift+K), deleting, moving and copying keys (the implicit start and end keys too: moving or copying one makes it a
//   real key), the curves of keys with the presets, Reset sequence.
// - The preview's rig: the side's bake with one strip playing the open sequence, so the preview is exactly the game's.
//
// Keys are named by their place in their part's lane (KeyRef); the lanes are kept in frame order. The implicit start
// (the default pose at frame 0 where no key is) and end (the start again at the length, one step past the last baked
// frame) are START and END.

import { CHANNELS, valuesAt, type Channel, type Curve, type Handle, type KeyPose, type Map2 } from "./armature.ts";
import { loops, type Pair, type Rig } from "./mcss.ts";
import { fixedScale } from "./model.ts";
import { freeName, parentOf, restMaps } from "./setup.ts";
import { DEFAULT_CURVE, lanePoses, layersOf, STEP, type Lane, type Layer, type Transform, type V2, type V2Key, type V2Sequence } from "./v2.ts";

// ---------------------------------------------------------------- Keys and their names

/** The implicit start key (the default pose at frame 0, where no key is) and end key (the start again at the length). */
export const START = -1;
export const END = -2;

/** A key of a part in the open sequence: its place in the part's lane, or START or END. */
export interface KeyRef { bone: number; index: number }
export const refId = (r: KeyRef) => `${r.bone}:${r.index}`;
export const refOf = (id: string): KeyRef => {
  const [bone, index] = id.split(":").map(Number);
  return { bone, index };
};

export const laneOf = (seq: V2Sequence | undefined, b: number): Lane | undefined => seq?.parts.find((l) => l.bone === b);
/** A part's loop in a sequence: its own (originals) or the sequence's. */
export const loopOf = (seq: V2Sequence, b: number) => laneOf(seq, b)?.frames ?? seq.frames;

/** The keys a ref list still names in the source (a ref to a key that is gone, after an undo, is dropped). */
export function liveRefs(src: V2, s: number, refs: KeyRef[]): KeyRef[] {
  const seq = src.sequences[s];
  if (!seq) return [];
  return refs.filter((r) => src.bones[r.bone] && (r.index === START ? !hasKeyAt(seq, r.bone, 0) : r.index === END ? !hasKeyAt(seq, r.bone, loopOf(seq, r.bone))
    : r.index >= 0 && r.index < (laneOf(seq, r.bone)?.keys.length ?? 0)));
}
const hasKeyAt = (seq: V2Sequence, b: number, frame: number) => !!laneOf(seq, b)?.keys.some((k) => k.frame === frame);

/** Every key shown on a part's row: its lane's, and the implicit start and end where no key is. */
export function rowKeys(src: V2, s: number, b: number): { ref: KeyRef; frame: number; implicit: boolean; key?: V2Key }[] {
  const seq = src.sequences[s];
  if (!seq) return [];
  const keys = laneOf(seq, b)?.keys ?? [];
  const length = loopOf(seq, b);
  const out: { ref: KeyRef; frame: number; implicit: boolean; key?: V2Key }[] = [];
  if (!keys.some((k) => k.frame === 0)) out.push({ ref: { bone: b, index: START }, frame: 0, implicit: true });
  keys.forEach((key, index) => out.push({ ref: { bone: b, index }, frame: key.frame, implicit: false, key }));
  if (!keys.some((k) => k.frame === length)) out.push({ ref: { bone: b, index: END }, frame: length, implicit: true });
  return out;
}

/** A key's frame (START 0, END the part's loop). */
export function frameOfRef(src: V2, s: number, r: KeyRef): number {
  const seq = src.sequences[s];
  if (r.index === START) return 0;
  if (r.index === END) return loopOf(seq, r.bone);
  return laneOf(seq, r.bone)?.keys[r.index]?.frame ?? 0;
}

// ---------------------------------------------------------------- A part's values

const HIDDEN = -1;

/** A part's keys in a sequence as the bake reads them (v2.ts lanePoses), its picture HIDDEN where it shows nothing. */
export function partPoses(src: V2, s: number, b: number): { poses: KeyPose[]; frames: number; loop: boolean } {
  const seq = src.sequences[s];
  const lane = laneOf(seq, b);
  const locked = !!src.bones[b]?.connected && parentOf(src, b) !== null;
  const poses = lanePoses(src, b, lane, locked, (shown, hidden) => (hidden || shown === undefined ? HIDDEN : shown));
  return { poses, frames: lane?.frames ?? seq.frames, loop: loops(lane?.play ?? "loop") };
}

export interface PartValues { move: Pair; rotation: number; scale: Pair; piece: number | undefined; hidden: boolean }

/** A part's values at a frame of a sequence (unrounded, from its curves): what keying there starts from. */
export function partValues(src: V2, s: number, b: number, frame: number): PartValues {
  const { poses, frames, loop } = partPoses(src, s, b);
  const local = frames > 0 ? (loop && frame > frames ? frame % frames : Math.min(frame, frames)) : 0;
  const v = valuesAt(poses, local, frames, loop);
  return { move: v.move, rotation: v.rotation, scale: v.scale, piece: v.picture === HIDDEN ? undefined : v.picture, hidden: v.picture === HIDDEN };
}

/** Each bone's map from the rest arrangement to the sprite at a frame of a sequence (setup.ts restMaps under the pose):
 * where the bones are drawn and what the gizmos turn a drag into. */
export function posedMaps(src: V2, s: number, frame: number): Map2[] {
  if (!src.sequences[s]) return restMaps(src);
  const values = src.bones.map((_, b) => partValues(src, s, b, frame));
  return restMaps(src, (b) => ({ move: values[b].move, rotation: values[b].rotation, scale: values[b].scale }));
}

/** A channel's value as a key holds it (absent: the default pose's), a connected bone's move 0. */
export function keyChannel(src: V2, b: number, key: Transform, channel: Channel): number {
  const d = src.bones[b]?.default ?? {};
  const locked = !!src.bones[b]?.connected && parentOf(src, b) !== null;
  switch (channel) {
    case "move_x": return locked ? 0 : key.move?.[0] ?? d.move?.[0] ?? 0;
    case "move_y": return locked ? 0 : key.move?.[1] ?? d.move?.[1] ?? 0;
    case "rotation": return key.rotation ?? d.rotation ?? 0;
    case "scale_x": return key.scale?.[0] ?? d.scale?.[0] ?? 1;
    case "scale_y": return key.scale?.[1] ?? d.scale?.[1] ?? 1;
  }
}

// ---------------------------------------------------------------- Snapping (the editor's)

/** The last frame a sequence shows (its last baked sample with the snap; else its last frame). */
export const lastFrame = (frames: number, snap: boolean, step = STEP) => (snap ? Math.max(0, (Math.ceil(frames / step) - 1) * step) : Math.max(0, frames - 1));
/** The playhead at a frame: the nearest multiple of 6 with the snap (Alt bypasses it), inside the sequence. */
export const playheadAt = (frame: number, frames: number, snap: boolean, step = STEP) =>
  Math.max(0, Math.min(lastFrame(frames, snap, step), snap ? Math.round(frame / step) * step : Math.round(frame)));
/** A drag in frames as the keys move: whole steps with the snap. */
export const snapDelta = (frames: number, snap: boolean, step = STEP) => (snap ? Math.round(frames / step) * step : Math.round(frames)) + 0;
/** The frame keys go to from a playhead (the start of the step it is in, with the snap, so the picture doesn't change). */
export const keyFrameOf = (time: number, snap: boolean, step = STEP) => (snap ? Math.floor(time / step) * step : Math.floor(time));

/** What keying needs of the preview's clock (player.ts Clock). */
export interface KeyClock { state: { time: number; playing: boolean }; play(playing?: boolean): void; seek(time: number): void }

/** A gizmo pressed or a key typed while the preview plays: the clock is paused first and the playhead put on the frame
 * the key goes to, so a key is never made while playing; returns that frame. */
export function pauseForKeying(clock: KeyClock, snap: boolean, step = STEP): number {
  if (clock.state.playing) clock.play(false);
  const frame = keyFrameOf(clock.state.time, snap, step);
  if (frame !== clock.state.time) clock.seek(frame);
  return frame;
}

// ---------------------------------------------------------------- Small helpers

const tidy = (v: number) => {
  const whole = Math.round(v);
  return (Math.abs(v - whole) < 1e-6 ? whole : Math.round(v * 1000) / 1000) + 0;
};
const sameNumber = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const byFrame = (keys: V2Key[]) => keys.map((k, i) => [k, i] as const).sort((a, b) => a[0].frame - b[0].frame || a[1] - b[1]).map(([k]) => k);
const clone = <T>(v: T): T => structuredClone(v);

/** A sequence replaced. */
const withSequence = (src: V2, s: number, seq: V2Sequence): V2 => ({ ...src, sequences: src.sequences.map((x, i) => (i === s ? seq : x)) });

/** A part's lane changed (made where it had none, kept in frame order; an empty lane of a drawn part dropped, since it
 * bakes as no lane does, while a part the sequence doesn't draw keeps it for its children's sake). */
function withLane(src: V2, s: number, b: number, change: (keys: V2Key[]) => V2Key[]): V2 {
  const seq = src.sequences[s];
  if (!seq || !src.bones[b]) return src;
  const lane = laneOf(seq, b);
  const keys = byFrame(change((lane?.keys ?? []).map((k) => ({ ...k }))));
  let parts: Lane[];
  if (lane) {
    const next: Lane = { ...lane, keys };
    const bare = !keys.length && Object.keys(next).every((f) => f === "bone" || f === "keys") && layersOf(src, s).some((l) => l.bone === b);
    parts = bare ? seq.parts.filter((l) => l !== lane) : seq.parts.map((l) => (l === lane ? next : l));
  } else if (keys.length) parts = [...seq.parts, { bone: b, keys }].sort((x, y) => x.bone - y.bone);
  else return src;
  return withSequence(src, s, { ...seq, parts });
}

/** The values a key is given: each channel that it had, or that differs from the default pose (absent channels are the
 * default's); a piece or Hidden only where the picture changes. */
function writeKey(src: V2, b: number, old: V2Key, now: PartValues, next: PartValues): V2Key {
  const d = src.bones[b].default ?? {};
  const locked = !!src.bones[b].connected && parentOf(src, b) !== null;
  const key: V2Key = { ...old };
  const dm = d.move ?? [0, 0], ds = d.scale ?? [1, 1];
  if (locked) delete key.move;
  else if (old.move !== undefined || !sameNumber(next.move[0], dm[0]) || !sameNumber(next.move[1], dm[1])) key.move = [tidy(next.move[0]), tidy(next.move[1])];
  if (old.rotation !== undefined || !sameNumber(next.rotation, d.rotation ?? 0)) key.rotation = Math.round(next.rotation * 1e6) / 1e6 + 0;
  if (old.scale !== undefined || !sameNumber(next.scale[0], ds[0]) || !sameNumber(next.scale[1], ds[1])) key.scale = [fixedScale(next.scale[0]) + 0, fixedScale(next.scale[1]) + 0];
  if (next.hidden !== now.hidden || (!next.hidden && next.piece !== now.piece)) {
    // (a piece shows it from here, ending a Hidden held from before)
    if (next.hidden) key.hidden = true;
    else {
      delete key.hidden;
      if (next.piece !== undefined) key.piece = next.piece;
    }
  }
  return key;
}

// ---------------------------------------------------------------- Keying

/** A part keyed at a frame: the key there changed, or one made from the part's values there (so making it changes
 * nothing until `change` does). `change` gets the values at the frame and returns the ones to change. */
export function setKeyAt(src: V2, s: number, b: number, frame: number, change: (now: PartValues) => Partial<PartValues> = () => ({})): V2 {
  if (!src.sequences[s] || !src.bones[b]) return src;
  const now = partValues(src, s, b, frame);
  const next = { ...now, ...change(now) };
  return withLane(src, s, b, (keys) => {
    let at = -1;
    keys.forEach((k, i) => { if (k.frame === frame) at = i; });
    const key = writeKey(src, b, at >= 0 ? keys[at] : { frame }, now, next);
    if (at >= 0) keys[at] = key;
    else keys.push(key);
    return keys;
  });
}

/** K and Shift+K: a key at a frame for each of these parts, from their values there; how many were new. */
export function keyParts(src: V2, s: number, bones: number[], frame: number): { src: V2; made: number } {
  let next = src;
  let made = 0;
  for (const b of bones) {
    if (!hasKeyAt(next.sequences[s], b, frame)) made++;
    next = setKeyAt(next, s, b, frame);
  }
  return { src: next, made };
}

/** The bones a sequence draws or keys (Shift+K's parts). */
export const sequenceBones = (src: V2, s: number) =>
  src.bones.map((_, b) => b).filter((b) => layersOf(src, s).some((l: Layer) => l.bone === b) || !!laneOf(src.sequences[s], b));

/** The implicit start or end key as a real key's values (no frame): the start the default pose, or its own key; the end
 * the start's, with its picture where the part shows another before it. */
function implicitKey(src: V2, s: number, r: KeyRef, at: number): Omit<V2Key, "frame"> {
  if (r.index === START) return {};
  const seq = src.sequences[s];
  const start = laneOf(seq, r.bone)?.keys.find((k) => k.frame === 0);
  const out: Omit<V2Key, "frame"> = {};
  if (start?.move) out.move = [...start.move];
  if (start?.rotation !== undefined) out.rotation = start.rotation;
  if (start?.scale) out.scale = [...start.scale];
  const first = partValues(src, s, r.bone, 0), before = partValues(src, s, r.bone, Math.max(0, at - 1));
  if (first.hidden !== before.hidden || first.piece !== before.piece) {
    if (first.hidden) out.hidden = true;
    else if (first.piece !== undefined) out.piece = first.piece;
  }
  return out;
}

/** Keys deleted (the implicit start and end can't be: they are the default pose). */
export function deleteKeys(src: V2, s: number, refs: KeyRef[]): { src: V2; deleted: number } {
  let next = src;
  let deleted = 0;
  for (const b of new Set(refs.map((r) => r.bone))) {
    const gone = new Set(refs.filter((r) => r.bone === b && r.index >= 0).map((r) => r.index));
    if (!gone.size) continue;
    next = withLane(next, s, b, (keys) => keys.filter((_, i) => {
      if (!gone.has(i)) return true;
      deleted++;
      return false;
    }));
  }
  return { src: next, deleted };
}

/** Keys moved in time by `delta` frames (inside 0 to the part's loop; the end key at the loop is a real end key). A
 * moved key replaces one it lands on. The implicit start or end moved is copied there as a real key (it stays where it
 * is: it is the default pose). Gives the moved keys' refs. */
export function moveKeys(src: V2, s: number, refs: KeyRef[], delta: number): { src: V2; refs: KeyRef[] } {
  const seq = src.sequences[s];
  if (!seq || !delta) return { src, refs };
  let next = src;
  const out: KeyRef[] = [];
  for (const b of new Set(refs.map((r) => r.bone))) {
    const length = loopOf(seq, b);
    const mine = refs.filter((r) => r.bone === b);
    const moved: V2Key[] = [];
    const implicit = mine.filter((r) => r.index < 0).map((r) => {
      const from = r.index === START ? 0 : length;
      const frame = Math.max(0, Math.min(length, from + delta));
      return frame === from ? null : { ...implicitKey(src, s, r, frame), frame } as V2Key;
    }).filter((k): k is V2Key => !!k);
    next = withLane(next, s, b, (keys) => {
      const moving = new Set(mine.filter((r) => r.index >= 0).map((r) => r.index));
      const kept: V2Key[] = [];
      keys.forEach((k, i) => {
        if (moving.has(i)) moved.push({ ...k, frame: Math.max(0, Math.min(length, k.frame + delta)) });
        else kept.push(k);
      });
      moved.push(...implicit);
      const landed = new Set(moved.map((k) => k.frame));
      return [...kept.filter((k) => !landed.has(k.frame)), ...moved];
    });
    const lane = laneOf(next.sequences[s], b)?.keys ?? [];
    for (const k of moved) out.push({ bone: b, index: lane.indexOf(k) });
  }
  // (refs by the keys' places once sorted)
  return { src: next, refs: out.filter((r) => r.index >= 0) };
}

/** Keys copied: each with its part and its frame from the first copied (the implicit ones as real keys' values). */
export interface CopiedKeys { keys: { bone: number; offset: number; key: Omit<V2Key, "frame"> }[] }

export function copyKeys(src: V2, s: number, refs: KeyRef[]): CopiedKeys {
  const seq = src.sequences[s];
  if (!seq || !refs.length) return { keys: [] };
  const frames = refs.map((r) => frameOfRef(src, s, r));
  const first = Math.min(...frames);
  return {
    keys: refs.map((r, i) => {
      const key = r.index >= 0 ? clone(laneOf(seq, r.bone)!.keys[r.index]) : { ...implicitKey(src, s, r, frames[i]), frame: frames[i] };
      const { frame: _, ...rest } = key as V2Key;
      return { bone: r.bone, offset: frames[i] - first, key: rest };
    }),
  };
}

/** Copied keys pasted from a frame (on the same parts, each replacing a key at its frame). */
export function pasteKeys(src: V2, s: number, copied: CopiedKeys, at: number): { src: V2; refs: KeyRef[] } {
  const seq = src.sequences[s];
  if (!seq) return { src, refs: [] };
  let next = src;
  const placed: { bone: number; frame: number }[] = [];
  for (const c of copied.keys) {
    if (!next.bones[c.bone]) continue;
    const frame = Math.max(0, Math.min(loopOf(seq, c.bone), at + c.offset));
    next = withLane(next, s, c.bone, (keys) => [...keys.filter((k) => k.frame !== frame), { frame, ...clone(c.key) } as V2Key]);
    placed.push({ bone: c.bone, frame });
  }
  const refs = placed.map(({ bone, frame }) => ({ bone, index: (laneOf(next.sequences[s], bone)?.keys ?? []).findIndex((k) => k.frame === frame) }));
  return { src: next, refs: refs.filter((r) => r.index >= 0) };
}

/** How keys go on to the next: one channel's curve, or every channel's (the implicit start made a real key at 0 to
 * hold it; the end key has nothing after it). */
export function setCurve(src: V2, s: number, refs: KeyRef[], curve: Curve, channel: Channel | null = null): V2 {
  let next = src;
  for (const b of new Set(refs.map((r) => r.bone))) {
    const mine = refs.filter((r) => r.bone === b);
    const indices = new Set(mine.filter((r) => r.index >= 0).map((r) => r.index));
    const start = mine.some((r) => r.index === START);
    next = withLane(next, s, b, (keys) => {
      const out = keys.map((k, i) => (indices.has(i) ? curved(k, curve, channel, src.curve ?? DEFAULT_CURVE) : k));
      if (start && !out.some((k) => k.frame === 0)) out.push(curved({ frame: 0 }, curve, channel, src.curve ?? DEFAULT_CURVE));
      return out;
    });
  }
  return next;
}

function curved(k: V2Key, curve: Curve, channel: Channel | null, fileCurve: Curve): V2Key {
  if (!channel) {
    const { curves: _, ...rest } = k;
    return { ...rest, curve };
  }
  const curves = { ...(k.curves ?? {}), [channel]: curve };
  if (curve === (k.curve ?? fileCurve)) delete curves[channel];
  const out: V2Key = { ...k };
  if (Object.keys(curves).length) out.curves = curves;
  else delete out.curves;
  return out;
}

/** A key's channel set to a value (the graph editor's drags): the move of a connected bone stays locked. */
export function setKeyChannel(src: V2, s: number, r: KeyRef, channel: Channel, value: number): V2 {
  if (r.index < 0) return src;
  const locked = !!src.bones[r.bone]?.connected && parentOf(src, r.bone) !== null;
  if (locked && channel.startsWith("move")) return src;
  return withLane(src, s, r.bone, (keys) => keys.map((k, i) => {
    if (i !== r.index) return k;
    const get = (c: Channel) => keyChannel(src, r.bone, k, c);
    const out: V2Key = { ...k };
    if (channel === "move_x") out.move = [tidy(value), get("move_y")];
    else if (channel === "move_y") out.move = [get("move_x"), tidy(value)];
    else if (channel === "rotation") out.rotation = Math.round(value * 1e6) / 1e6 + 0;
    else if (channel === "scale_x") out.scale = [fixedScale(value), get("scale_y")];
    else out.scale = [get("scale_x"), fixedScale(value)];
    return out;
  }));
}

/** A key's Bézier handles on a channel. */
export function setHandles(src: V2, s: number, r: KeyRef, channel: Channel, handles: [Handle, Handle]): V2 {
  if (r.index < 0) return src;
  return withLane(src, s, r.bone, (keys) => keys.map((k, i) => (i === r.index ? { ...k, handles: { ...(k.handles ?? {}), [channel]: handles } } : k)));
}

/** The channels a part's keys change in a sequence (the graph editor's shown ones), else its moves. */
export function usedChannels(src: V2, s: number, b: number): Channel[] {
  const { poses } = partPoses(src, s, b);
  const out = CHANNELS.filter((c) => poses.some((k) => {
    const v = c === "move_x" ? k.move?.[0] : c === "move_y" ? k.move?.[1] : c === "rotation" ? k.rotation : c === "scale_x" ? k.scale?.[0] : k.scale?.[1];
    const v0 = c === "move_x" ? poses[0].move?.[0] : c === "move_y" ? poses[0].move?.[1] : c === "rotation" ? poses[0].rotation : c === "scale_x" ? poses[0].scale?.[0] : poses[0].scale?.[1];
    return v !== v0;
  }));
  return out;
}

// ---------------------------------------------------------------- The sequence

/** A sequence's length (snapped by the editor). Keys past it stay, but don't play (the checks say so). */
export const setLength = (src: V2, s: number, frames: number): V2 => (src.sequences[s] ? withSequence(src, s, { ...src.sequences[s], frames }) : src);

export const renameSequence = (src: V2, s: number, name: string): V2 => (src.sequences[s] && name.trim() ? withSequence(src, s, { ...src.sequences[s], name: name.trim() }) : src);

/** Reset sequence: back to the default pose with no keys, touching nothing else (its length, layers, loop clips and the
 * other sequences stay). */
export function resetSequence(src: V2, s: number): V2 {
  const seq = src.sequences[s];
  if (!seq) return src;
  let next = src;
  for (const lane of seq.parts) next = withLane(next, s, lane.bone, () => []);
  return next;
}

/** How many keys a sequence has. */
export const keyCount = (seq: V2Sequence) => seq.parts.reduce((n, l) => n + l.keys.length, 0);

/** Every sequence number in the source renumbered (`to(old)`: its new number, or null for one deleted): the
 * timeline's and the strips' blocks (a deleted one's dropped; an empty timeline plays the first sequence), the tracks'
 * order, the originals' shared tracks. */
function renumber(src: V2, sequences: V2Sequence[], to: (old: number) => number | null): V2 {
  const blocks = (strip: V2["timeline"]) => ({
    ...strip,
    blocks: strip.blocks.flatMap((bl) => {
      const n = to(bl.sequence);
      return n === null ? [] : [{ ...bl, sequence: n }];
    }),
  });
  const timeline = blocks(src.timeline);
  if (!timeline.blocks.length && sequences.length) timeline.blocks = [{ sequence: 0 }];
  const next: V2 = {
    ...src,
    sequences: sequences.map((seq) => (seq.layers ? {
      ...seq,
      layers: seq.layers.map((l) => {
        if (!l.track_of) return l;
        const n = to(l.track_of[0]);
        return n === null ? { ...l, track_of: undefined } : { ...l, track_of: [n, l.track_of[1]] as [number, number] };
      }),
    } : seq)),
    timeline,
    ...(src.strips ? { strips: src.strips.map(blocks) } : {}),
  };
  if (src.track_order) {
    next.track_order = src.track_order.flatMap(([s, b]) => {
      if (s === null) return [[s, b] as [number | null, number]];
      const n = to(s);
      return n === null ? [] : [[n, b] as [number | null, number]];
    });
  }
  return next;
}

/** The tracks a sequence bakes ([sequence, bone]), for a source with its own track order. */
function tracksOf(src: V2, s: number): [number, number][] {
  const seq = src.sequences[s];
  const bones = new Set<number>();
  for (const l of layersOf(src, s)) if (!l.track_of) bones.add(l.bone);
  for (const l of seq.parts) bones.add(l.bone);
  return [...bones].sort((a, b) => a - b).map((b) => [s, b]);
}

/** A sequence put in at a place (the others after it renumbered); its tracks at the end of a source's own track order. */
function insertSequence(src: V2, at: number, seq: V2Sequence): V2 {
  const sequences = [...src.sequences.slice(0, at), seq, ...src.sequences.slice(at)];
  const next = renumber(src, sequences, (old) => (old >= at ? old + 1 : old));
  if (next.track_order) next.track_order = [...next.track_order, ...tracksOf(next, at)];
  return next;
}

/** A new sequence after the others, holding the default pose (no keys), 48 frames. */
export function addSequence(src: V2, name = "Sequence", frames = 48): { src: V2; sequence: number } {
  const n = src.sequences.length;
  return { src: insertSequence(src, n, { name: freeName(src.sequences.map((x) => x.name), name), frames, parts: [] }), sequence: n };
}

/** A copy of a sequence, after it: its length, keys and layers (an original's own track names aren't copied). */
export function duplicateSequence(src: V2, s: number): { src: V2; sequence: number } {
  const seq = src.sequences[s];
  if (!seq) return { src, sequence: s };
  const copy: V2Sequence = { ...clone(seq), name: freeName(src.sequences.map((x) => x.name), `${seq.name} copy`), parts: clone(seq.parts).map(({ name: _, ...l }) => l) };
  return { src: insertSequence(src, s + 1, copy), sequence: s + 1 };
}

/** Why a sequence can't be deleted, or null: the last one, or one whose tracks another sequence plays (originals). */
export function cantDelete(src: V2, s: number): string | null {
  if (src.sequences.length <= 1) return "A side needs at least one sequence.";
  const sharing = src.sequences.findIndex((seq, i) => i !== s && (seq.layers ?? []).some((l) => l.track_of?.[0] === s));
  if (sharing >= 0) return `${src.sequences[sharing].name} plays ${src.sequences[s].name}'s tracks (as the original does), so it can't go.`;
  return null;
}

/** A sequence deleted, with its blocks on the timeline. */
export function deleteSequence(src: V2, s: number): V2 {
  if (cantDelete(src, s)) return src;
  return renumber(src, src.sequences.filter((_, i) => i !== s), (old) => (old === s ? null : old > s ? old - 1 : old));
}

/** A sequence moved in the list (the timeline keeps playing the same sequences). */
export function moveSequence(src: V2, from: number, to: number): V2 {
  if (from === to || !src.sequences[from] || to < 0 || to >= src.sequences.length) return src;
  const order = src.sequences.map((_, i) => i);
  order.splice(to, 0, ...order.splice(from, 1));
  const where = new Map(order.map((old, n) => [old, n]));
  return renumber(src, order.map((old) => src.sequences[old]), (old) => where.get(old) ?? null);
}

// ---------------------------------------------------------------- The preview

/** The baked rig playing one sequence, looping (one strip of one block): what the preview draws, the game's own frames
 * of that sequence. */
export function sequenceRig(rig: Rig, s: number, frames: number): Rig {
  return { ...rig, sequences: [{ name: "preview", key_type: "plain", play: "loop", keys: [{ pose: s, frames: Math.max(1, frames) }] }] };
}
