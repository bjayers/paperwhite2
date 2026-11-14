// The new Rig Editor's loop clips (rig-editor-v2.md, "Built: step 5"): the user's "sequences within a sequence", a part's
// short looping clip (fire flickering through 2 or 3 pictures, a blink, a twitch) placed on parts of sequences, playing
// on its own rhythm under the sequence's keys. The format and the bake are step 1's (v2.ts: `loop_clips`, a lane's
// `clips`, clipValues); these are the edits, as pure functions of the source.
//
// - The list: add (a key at frame 0, its own step 3), rename, duplicate, delete (its placings with it, the later clips'
//   numbers moved down), its length and its step (the snap of its keys, and the sampling of a curved clip).
// - Placing: a clip on a part of a sequence from a start frame (several clips on one part add up), moved, removed.
// - Editing: a clip as a one-part sequence (clipSource) so the sequence timeline, the Part section and the keyboard
//   edit its keys with the same functions as a sequence's, written back with fromClipSource. Its keys hold only what
//   they change (absent channels are no change, the picture the part's own), constant unless they name a curve, and a
//   clip always has a key at frame 0 (the format's clips start there; the editor's start key).
// - The preview: the side baked with one sequence playing the clip on a part, alone or on the sprite (clipPreviewSource).
// - The cost: the bytes the clip's placings add to the side's files (clipCost).

import { gcd } from "./armature.ts";
import { freeName, parentOf } from "./setup.ts";
import { bakeV2, STEP, type ClipUse, type Lane, type LoopClip, type V2, type V2Key, type V2Sequence } from "./v2.ts";
import { rigSizes } from "./sizes.ts";

/** A new clip's step: picture flicker usually wants 2 to 4 frames between pictures, finer than the sequences' 6. */
export const DEFAULT_CLIP_STEP = 3;
/** The steps a clip's keys can snap to. */
export const CLIP_STEPS = [1, 2, 3, 6];
/** A clip's step: its own, else the part's (Game Freak's 6), as the bake samples it. */
export const clipStepOf = (clip: LoopClip | undefined) => clip?.step ?? STEP;

const clone = <T>(v: T): T => structuredClone(v);
const clipsOf = (src: V2) => src.loop_clips ?? [];
const withClip = (src: V2, c: number, clip: LoopClip): V2 => ({ ...src, loop_clips: clipsOf(src).map((x, i) => (i === c ? clip : x)) });
/** A clip's keys in frame order, with a key at frame 0. */
const tidyKeys = (keys: V2Key[]): V2Key[] => {
  const out = keys.map((k, i) => [k, i] as const).sort((a, b) => a[0].frame - b[0].frame || a[1] - b[1]).map(([k]) => k);
  return out.some((k) => k.frame === 0) ? out : [{ frame: 0 }, ...out];
};

// ---------------------------------------------------------------- The list

/** A new clip after the others: `frames` long, its own step, one key at 0 (no change: the part as it is). */
export function addLoopClip(src: V2, name = "flicker", frames = 12, step = DEFAULT_CLIP_STEP): { src: V2; clip: number } {
  const clips = clipsOf(src);
  const clip: LoopClip = { name: freeName(clips.map((x) => x.name), name), frames, step, keys: [{ frame: 0 }] };
  return { src: { ...src, loop_clips: [...clips, clip] }, clip: clips.length };
}

export const renameLoopClip = (src: V2, c: number, name: string): V2 =>
  (clipsOf(src)[c] && name.trim() ? withClip(src, c, { ...clipsOf(src)[c], name: name.trim() }) : src);

/** A clip's length (its keys past it stay, but never play: the checks say so). */
export const setClipFrames = (src: V2, c: number, frames: number): V2 =>
  (clipsOf(src)[c] ? withClip(src, c, { ...clipsOf(src)[c], frames: Math.max(1, Math.round(frames)) }) : src);

/** A clip's step: what its keys snap to in the editor, and how often the bake samples it where it curves. */
export const setClipStep = (src: V2, c: number, step: number): V2 =>
  (clipsOf(src)[c] ? withClip(src, c, { ...clipsOf(src)[c], step }) : src);

/** A copy of a clip after the others (not placed anywhere). */
export function duplicateLoopClip(src: V2, c: number): { src: V2; clip: number } {
  const clip = clipsOf(src)[c];
  if (!clip) return { src, clip: c };
  const clips = clipsOf(src);
  return { src: { ...src, loop_clips: [...clips, { ...clone(clip), name: freeName(clips.map((x) => x.name), `${clip.name} copy`) }] }, clip: clips.length };
}

/** Every lane's clip uses changed (`to(use)`: the use, changed, or null to remove it); lanes left bare tidied. */
function mapUses(src: V2, to: (use: ClipUse, s: number, b: number, index: number) => ClipUse | null): V2 {
  return {
    ...src,
    sequences: src.sequences.map((seq, s) => {
      let changed = false;
      const parts = seq.parts.flatMap((lane) => {
        if (!lane.clips?.length) return [lane];
        const clips = lane.clips.flatMap((u, i) => {
          const n = to(u, s, lane.bone, i);
          if (n !== u) changed = true;
          return n ? [n] : [];
        });
        return [tidyLane(src, seq, { ...lane, clips })].filter((l): l is Lane => !!l);
      });
      return changed ? { ...seq, parts } : seq;
    }),
  };
}

/** A lane without clips loses the field, and a lane left with nothing of a part the sequence draws goes (as
 * sequences.ts withLane drops it: it bakes as no lane does). */
function tidyLane(src: V2, seq: V2Sequence, lane: Lane): Lane | null {
  const out: Lane = { ...lane };
  if (!out.clips?.length) delete out.clips;
  const bare = !out.keys.length && Object.keys(out).every((f) => f === "bone" || f === "keys");
  const drawn = (seq.layers ?? (src.layers ?? src.bones.map((_, i) => i)).map((bone) => ({ bone }))).some((l) => l.bone === lane.bone);
  return bare && drawn ? null : out;
}

/** A clip deleted, with its placings; the later clips' numbers moved down. */
export function deleteLoopClip(src: V2, c: number): V2 {
  if (!clipsOf(src)[c]) return src;
  const next = mapUses(src, (u) => (u.clip === c ? null : u.clip > c ? { ...u, clip: u.clip - 1 } : u));
  return { ...next, loop_clips: clipsOf(src).filter((_, i) => i !== c) };
}

// ---------------------------------------------------------------- Placing

/** Where a clip is placed: a sequence, a part, and its place in the part's clips. */
export interface UseRef { sequence: number; bone: number; index: number }

export function clipUses(src: V2, c: number): UseRef[] {
  const out: UseRef[] = [];
  src.sequences.forEach((seq, s) => seq.parts.forEach((lane) => (lane.clips ?? []).forEach((u, index) => {
    if (u.clip === c) out.push({ sequence: s, bone: lane.bone, index });
  })));
  return out;
}

/** A part's clips in a sequence. */
export const usesOn = (src: V2, s: number, b: number): ClipUse[] => src.sequences[s]?.parts.find((l) => l.bone === b)?.clips ?? [];

/** A clip placed on a part of a sequence from `start` (its lane made where it has none). */
export function placeClip(src: V2, s: number, b: number, c: number, start = 0): { src: V2; index: number } {
  const seq = src.sequences[s];
  if (!seq || !src.bones[b] || !clipsOf(src)[c]) return { src, index: -1 };
  const use: ClipUse = start ? { clip: c, start } : { clip: c };
  const lane = seq.parts.find((l) => l.bone === b);
  const parts = lane ? seq.parts.map((l) => (l === lane ? { ...l, clips: [...(l.clips ?? []), use] } : l))
    : [...seq.parts, { bone: b, clips: [use], keys: [] } as Lane].sort((x, y) => x.bone - y.bone);
  const next: V2 = { ...src, sequences: src.sequences.map((x, i) => (i === s ? { ...seq, parts } : x)) };
  return { src: next, index: (lane?.clips ?? []).length };
}

/** A placing removed. */
export const unplaceClip = (src: V2, s: number, b: number, index: number): V2 =>
  mapUses(src, (u, s0, b0, i) => (s0 === s && b0 === b && i === index ? null : u));

/** A placing's start: the frame of the sequence its clip's frame 0 plays at (kept inside one clip length). */
export function setClipStart(src: V2, s: number, b: number, index: number, start: number): V2 {
  return mapUses(src, (u, s0, b0, i) => {
    if (s0 !== s || b0 !== b || i !== index) return u;
    const frames = clipsOf(src)[u.clip]?.frames ?? 1;
    const at = ((Math.round(start) % frames) + frames) % frames;
    const { start: _, ...rest } = u;
    return at ? { ...rest, start: at } : rest;
  });
}

/** Whether a clip's loop goes into the sequence's evenly; otherwise each play of the sequence restarts the clip part way
 * (a hitch at the seam) and the bake unrolls the part's track to both lengths' least common multiple (bigger), for the
 * battle's pause, where a keeps-moving part plays on past the sequence's end. */
export const clipFits = (sequenceFrames: number, clipFrames: number) => clipFrames > 0 && sequenceFrames % clipFrames === 0;
/** The frames a part's track is baked over with a clip that doesn't fit. */
export const unrolledFrames = (sequenceFrames: number, clipFrames: number) => (sequenceFrames / gcd(sequenceFrames, clipFrames)) * clipFrames;

/** The bytes a clip's placings add to the side's files (its uses removed, baked again): fast flicker makes keys. */
export function clipCost(src: V2, c: number): number | null {
  if (!clipUses(src, c).length) return 0;
  try {
    const without = mapUses(src, (u) => (u.clip === c ? null : u));
    return rigSizes(bakeV2(src).rig).resident - rigSizes(bakeV2(without).rig).resident;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Editing a clip as a sequence

/** The clip-editing views' source: the clip as one sequence with one part (bone 0, named after the clip), so the
 * sequence timeline, the Part section and the keys' edits work on it as on a sequence. The part's default is no change
 * (its curve constant, as a clip's keys are), its picture none of the pieces (`ownPiece`, the part's own), so choosing a
 * piece or Hidden on a key always writes it. */
export function clipSource(src: V2, c: number): V2 {
  const clip = clipsOf(src)[c];
  const frames = clip?.frames ?? STEP;
  return {
    ...src, curve: "constant", keeps_moving: [], idle_nodes: undefined, strips: undefined, track_order: undefined, kept_tracks: undefined,
    bones: [{ name: clip?.name ?? "clip", head: [0, 0], tail: [0, -8], parent: null, default: { piece: ownPiece(src) } }],
    layers: [0],
    sequences: [{ name: clip?.name ?? "clip", frames, ...(clip?.step ? { step: clip.step } : {}), parts: [{ bone: 0, keys: clone(clip?.keys ?? []) }] }],
    loop_clips: [],
    timeline: { name: "clip", blocks: [{ sequence: 0 }] },
  };
}
/** The clip source's "the part's own picture": no piece. */
export const ownPiece = (src: V2) => src.pieces.length;

/** The clip as the clip-editing views left it, written back: its keys (a key at 0 kept), its length. */
export function fromClipSource(src: V2, c: number, edited: V2): V2 {
  const clip = clipsOf(src)[c];
  const seq = edited.sequences[0];
  if (!clip || !seq) return src;
  const own = ownPiece(src);
  const keys = tidyKeys((seq.parts.find((l) => l.bone === 0)?.keys ?? []).map((k) => {
    const out = { ...k };
    if (out.piece === own) delete out.piece;
    return out;
  }));
  return withClip(src, c, { ...clip, name: seq.name || clip.name, frames: seq.frames, keys });
}

/** The side with one sequence playing a clip on a part (from its start, in its default pose otherwise), alone (only
 * that part drawn, where it stands on the sprite: its parents baked but not drawn) or on the sprite (every part in the
 * default pose), for the clip's preview: the bake's own frames. */
export function clipPreviewSource(src: V2, c: number, b: number, alone: boolean): V2 {
  const clip = clipsOf(src)[c];
  const chain: number[] = [];
  for (let p = parentOf(src, b); p !== null && !chain.includes(p); p = parentOf(src, p)) chain.push(p);
  const parts: Lane[] = [...chain.map((p) => ({ bone: p, keys: [] })), { bone: b, keys: [], clips: [{ clip: c }] }].sort((x, y) => x.bone - y.bone);
  return {
    ...src, pause: false, keeps_moving: [], idle_nodes: undefined, strips: undefined, track_order: undefined, kept_tracks: undefined,
    sequences: [{ name: clip?.name ?? "clip", frames: Math.max(1, clip?.frames ?? STEP), parts, ...(alone ? { layers: [{ bone: b }] } : {}) }],
    timeline: { name: "preview", blocks: [{ sequence: 0 }] },
  };
}
