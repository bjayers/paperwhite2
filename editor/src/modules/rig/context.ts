// What the Rig Editor's views share: the rig, where edits go, the selection, the clock and the art.

import { useSyncExternalStore } from "react";
import type { Rig } from "./mcss.ts";
import type { Editor } from "./model.ts";
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
}

export const NO_SELECTION: Selection = { picture: null, rectangle: 0, pose: 0, part: null, key: null, sequenceKey: null };

export interface Art {
  /** The sheets by name (front, front_female), as palette indices. */
  sheets: Record<string, Uint8Array>;
  normal: [number, number, number][];
  shiny: [number, number, number][];
}

export interface RigView {
  rig: Rig;
  editor: Editor;
  sel: Selection;
  select(next: Partial<Selection>): void;
  clock: Clock;
  art: Art | null;
  /** The sheet shown, by name. */
  sheet: string;
  shiny: boolean;
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
