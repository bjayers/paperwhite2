// What the Rig Editor's views share: the rig, where edits go, the selection, the clock and the art.

import { useSyncExternalStore } from "react";
import type { Rig } from "./mcss.ts";
import type { Editor, Phase } from "./model.ts";
import type { Baked, Source } from "./armature.ts";
import type { Clock, ClockState } from "./player.ts";

export interface Selection {
  /** A picture (cell), and which of its rectangles. */
  picture: number | null;
  rectangle: number;
  /** A part, by its place in the pose shown, and that pose. */
  pose: number;
  part: number | null;
  /** A key of a track, or of the sequence played. */
  key: { track: number; index: number } | null;
  sequenceKey: number | null;
  /** The armature's root (the whole sprite: the sequence's key poses) chosen instead of a part. */
  root: boolean;
  /** A key pose of the chosen bone (or the root), by its place in its key poses. */
  keyPose: number | null;
}

export const NO_SELECTION: Selection = { picture: null, rectangle: 0, pose: 0, part: null, key: null, sequenceKey: null, root: false, keyPose: null };

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
