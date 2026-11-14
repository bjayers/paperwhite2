// What the Rig Editor's views share: the rig, where edits go, the selection, the clock and the art.

import { useSyncExternalStore } from "react";
import type { Rig } from "./mcss.ts";
import type { Editor, Phase } from "./model.ts";
import type { Baked, Curve, Source } from "./armature.ts";
import type { Clock, ClockState } from "./player.ts";

export interface Selection {
  /** A picture (cell), and which of its rectangles. */
  picture: number | null;
  rectangle: number;
  /** A part, by its place in the pose shown, and that pose. */
  pose: number;
  part: number | null;
  /** Other parts of the pose shown chosen with it (shift or ctrl click): the gizmos act on all of them. */
  more: number[];
  /** A key of a track, or of the sequence played. */
  key: { track: number; index: number } | null;
  sequenceKey: number | null;
  /** The armature's root (the whole sprite: the sequence's key poses) chosen instead of a part. */
  root: boolean;
  /** A key pose of the chosen bone (or the root), by its place in its key poses. */
  keyPose: number | null;
}

export const NO_SELECTION: Selection = { picture: null, rectangle: 0, pose: 0, part: null, more: [], key: null, sequenceKey: null, root: false, keyPose: null };

/** Every part chosen: the main one first, then the others. */
export const selectedParts = (sel: Selection): number[] => (sel.part === null ? [] : [sel.part, ...sel.more.filter((m) => m !== sel.part)]);

/** Where an armature's edits go: its document, a step for undo, a drag's later moves amending it. */
export interface SourceEditor {
  set(path: (string | number)[], value: unknown, phase?: Phase): void;
}

export interface Art {
  /** The sheets by name (front, front_female), as palette indices. */
  sheets: Record<string, Uint8Array>;
  normal: [number, number, number][];
  shiny: [number, number, number][];
}

/** Edit mode sets a sprite up at rest (pictures, parts, pivots, parents); Pose mode animates it (key poses, curves). */
export type Mode = "edit" | "pose";

export interface RigView {
  /** The flat rig: the file's, or with an armature what the armature bakes to. */
  rig: Rig;
  /** The side's armature, if it has one (a bone for each of the flat rig's tracks). */
  source: Source | null;
  sourceEditor: SourceEditor | null;
  baked: Baked | null;
  /** A bone whose parent is being chosen by clicking a part on the preview. */
  picking: number | null;
  setPicking(bone: number | null): void;
  editor: Editor;
  sel: Selection;
  select(next: Partial<Selection>): void;
  clock: Clock;
  art: Art | null;
  /** The sheet shown, by name. */
  sheet: string;
  shiny: boolean;
  /** Tracks hidden in the preview by the layer list's eyes (editor only, never saved). */
  hidden: ReadonlySet<number>;
  toggleHidden(track: number): void;
  mode: Mode;
  /** The raw game keys of a sprite with no armature, edited as the game holds them (the advanced view). */
  gameKeys: boolean;
  /** Edits the flat rig and/or the armature as one step (a drag's later moves amend it). */
  commit(next: { rig?: Rig; source?: Source }, phase?: Phase): void;
  /** The view with an armature: the side's, or one made now from the flat rig (converted as it is, byte for byte) and said so,
   * as part of the step being made (`joinNext`: the edit that follows). Null when the rig isn't loaded. */
  ensureArmature(joinNext?: boolean, apply?: (source: Source) => Source): RigView | null;
  /** Parents a part's bone (null: to the root), keeping the part where it is; makes the armature first if there is none.
   * Returns what to tell the user, or null. */
  parentBone(bone: number, parent: number | null): string | null;
  /** The curve a new key pose gets (and the one before it, if that was held). */
  newCurve: Curve;
  /** Gizmo drags at a frame where no key begins start one there (split off the key the playhead is in). */
  autoKey: boolean;
}

/** A value of the clock's state, which a component re-renders on only when it changes. */
export function useClock<T>(clock: Clock, pick: (state: ClockState) => T): T {
  return useSyncExternalStore(clock.subscribe, () => pick(clock.state));
}

/** RGBA words (little-endian ImageData) of a palette, index 0 clear. */
export function paletteWords(colors: [number, number, number][]): Uint32Array {
  const out = new Uint32Array(16);
  colors.slice(0, 16).forEach(([r, g, b], i) => { out[i] = i ? (0xff << 24) | (b << 16) | (g << 8) | r : 0; });
  return out;
}

/** A distinct colour for the n-th picture or part. */
export function hue(n: number, s = 85, l = 60): string {
  return `hsl(${(n * 137.508) % 360} ${s}% ${l}%)`;
}
