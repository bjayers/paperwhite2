// The new Rig Editor's timeline strip (rig-editor-v2.md, "Built: step 4"): the game's sequence 0 ("stay", the loop the
// battle plays all the time) as clips, like a video editor's, and the battle's pause, as pure functions of the source
// (v2.ts), so the page and the tests share them.
//
// - A clip is a run of the timeline's blocks that play the same sequence in a row (the user's "Idle x4"): each block is
//   one instance, a 2-byte key of the game's sequence 0 that refers to the sequence's pose, so repeats cost almost
//   nothing and editing the sequence changes every instance. Blocks in a row that are the same are one clip with a
//   count; a block of an original with its own length or place (`frames`, `move`, ...) only joins blocks equal to it.
// - A clip always plays its sequence's full length: the game's blocks restart the sequence's parts, so there is no
//   trimming (an original's block keeps its own `frames`, which loops the sequence within it).
// - Clips are added (at the end, or before a clip), repeated (x n), moved and deleted; the strip keeps at least one.
// - The pause: "Pauses in battle" (`pause`) and the "Keeps moving" parts (`keeps_moving`), which the bake turns into the
//   flat rig's idle parts (their places in the rig's layers).

import type { Block, V2 } from "./v2.ts";

export interface Clip {
  /** The first of its blocks in `timeline.blocks`. */
  block: number;
  /** How many blocks in a row (instances). */
  count: number;
  sequence: number;
  /** One instance's length: the block's own `frames`, else its sequence's. */
  frames: number;
  /** The frame of the strip it starts at. */
  at: number;
}

const sameBlock = (a: Block, b: Block) => JSON.stringify(a) === JSON.stringify(b);
const blockFrames = (src: V2, b: Block) => b.frames ?? src.sequences[b.sequence]?.frames ?? 0;
const withBlocks = (src: V2, blocks: Block[]): V2 => ({ ...src, timeline: { ...src.timeline, blocks } });

/** The strip as clips: runs of equal blocks. */
export function clipsOf(src: V2): Clip[] {
  const out: Clip[] = [];
  let at = 0;
  src.timeline.blocks.forEach((b, i) => {
    const frames = blockFrames(src, b);
    const last = out[out.length - 1];
    if (last && sameBlock(src.timeline.blocks[last.block], b)) last.count++;
    else out.push({ block: i, count: 1, sequence: b.sequence, frames, at });
    at += frames;
  });
  return out;
}

/** The whole strip's length: the game's sequence 0's, one loop. */
export const stripFrames = (src: V2) => src.timeline.blocks.reduce((n, b) => n + blockFrames(src, b), 0);

/** Where a frame of the strip is (looping): the clip, which of its instances, and the frame inside it. */
export function clipAt(src: V2, frame: number): { clip: number; instance: number; since: number } | null {
  const total = stripFrames(src);
  if (!total) return null;
  const t = ((Math.floor(frame) % total) + total) % total;
  const clips = clipsOf(src);
  for (let c = 0; c < clips.length; c++) {
    const k = clips[c];
    if (t < k.at + k.count * k.frames) {
      const into = t - k.at;
      return { clip: c, instance: Math.floor(into / Math.max(1, k.frames)), since: into % Math.max(1, k.frames) };
    }
  }
  return null;
}

/** How many times the strip plays each sequence (its blocks). */
export const playCount = (src: V2, s: number) => src.timeline.blocks.filter((b) => b.sequence === s).length;

/** A clip of a sequence added: before clip `before` (a clip index), or at the end. Next to a clip of the same sequence it
 * joins it (one more instance). */
export function addClip(src: V2, sequence: number, before?: number, count = 1): V2 {
  if (!src.sequences[sequence] || count < 1) return src;
  const clips = clipsOf(src);
  const at = before === undefined || before >= clips.length ? src.timeline.blocks.length : clips[Math.max(0, before)].block;
  const blocks = [...src.timeline.blocks];
  blocks.splice(at, 0, ...Array.from({ length: count }, () => ({ sequence })));
  return withBlocks(src, blocks);
}

/** A clip's instances set to n (at least 1): "x4". */
export function setRepeat(src: V2, clip: number, n: number): V2 {
  const k = clipsOf(src)[clip];
  const count = Math.max(1, Math.round(n));
  if (!k || count === k.count) return src;
  const block = src.timeline.blocks[k.block];
  const blocks = [...src.timeline.blocks];
  blocks.splice(k.block, k.count, ...Array.from({ length: count }, () => structuredClone(block)));
  return withBlocks(src, blocks);
}

/** A clip moved to before clip `to` (counted in the strip as it is, `clips.length` for the end). */
export function moveClip(src: V2, from: number, to: number): V2 {
  const clips = clipsOf(src);
  const k = clips[from];
  if (!k || to === from || to === from + 1 || to < 0 || to > clips.length) return src;
  const blocks = [...src.timeline.blocks];
  const moved = blocks.splice(k.block, k.count);
  const target = to >= clips.length ? src.timeline.blocks.length : clips[to].block;
  const at = target > k.block ? target - k.count : target;
  blocks.splice(at, 0, ...moved);
  return withBlocks(src, blocks);
}

/** Why a clip can't be deleted, or null: the strip is the battle's loop, so it keeps one. */
export const cantDeleteClip = (src: V2, clip: number) =>
  clipsOf(src).length <= 1 && clipsOf(src)[clip] ? "The timeline is the loop the battle plays, so it keeps at least one clip." : null;

/** A clip deleted (all its instances). */
export function deleteClip(src: V2, clip: number): V2 {
  const k = clipsOf(src)[clip];
  if (!k || cantDeleteClip(src, clip)) return src;
  const blocks = [...src.timeline.blocks];
  blocks.splice(k.block, k.count);
  return withBlocks(src, blocks);
}

// ---------------------------------------------------------------- The battle's pause

/** "Pauses in battle": on, the battle's random pause at the end of a loop (vanilla); off, never (the game's idle 0xff). */
export const setPause = (src: V2, on: boolean): V2 => ({ ...src, pause: on });

/** The bones that keep moving through the pause: `keeps_moving`, or (an original whose idle parts are kept as nodes) the
 * bones at those places in the rig's layers. */
export function keepsMovingOf(src: V2): number[] {
  if (!src.idle_nodes) return src.keeps_moving;
  const setup = src.layers ?? src.bones.map((_, i) => i);
  return [...new Set(src.idle_nodes.map((n) => setup[n]).filter((b) => b !== undefined))].sort((a, b) => a - b);
}

/** A part's "Keeps moving" toggled (an original's kept idle nodes become keeps-moving bones first). */
export function setKeepsMoving(src: V2, b: number, on: boolean): V2 {
  if (!src.bones[b]) return src;
  const now = keepsMovingOf(src);
  const next = on ? [...new Set([...now, b])].sort((x, y) => x - y) : now.filter((x) => x !== b);
  const { idle_nodes: _, ...rest } = src;
  return { ...rest, keeps_moving: next } as V2;
}
