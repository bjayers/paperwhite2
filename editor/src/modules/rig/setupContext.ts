// What the new Rig Editor's views share (SetupEditor.tsx): the source, where its edits go, the selection, the pose the
// preview draws (the default pose in the rig setup, the open sequence at the playhead in Sequences), and the art.

import type { Map2 } from "./armature.ts";
import type { Art } from "./context.ts";
import type { Rig } from "./mcss.ts";
import type { Phase } from "./model.ts";
import type { Clock } from "./player.ts";
import type { CopiedKeys } from "./sequences.ts";
import type { BakedV2, Transform, V2 } from "./v2.ts";

export interface SetupSelection {
  /** The chosen bones, the main one first (the gizmos act on all of them). */
  bones: number[];
  /** The chosen piece, and which of its rectangles. */
  piece: number | null;
  rectangle: number;
  /** The chosen keys of the open sequence (sequences.ts refId: "bone:index", the implicit start -1, the end -2). */
  keys: string[];
}

export const NO_SETUP_SELECTION: SetupSelection = { bones: [], piece: null, rectangle: 0, keys: [] };

/** What the Sequences mode adds (rig-editor-v2.md, "Built: step 3"): the open sequence, the preview's clock and rig. */
export interface SequenceView {
  sequence: number;
  /** The preview's rig: the bake with one strip playing the open sequence (sequences.ts sequenceRig). */
  rig: Rig | null;
  clock: Clock;
  /** The frame keys go to: the start of the playhead's step with the snap, else its frame. */
  keyFrame: number;
  /** Keys and the playhead snap to 6 (Alt bypasses it while dragging). */
  snap: boolean;
  onion: boolean;
  /** Pauses the preview (keys are never made while it plays) and gives the frame keys go to. */
  keying(): number;
}

/** A part's pose as the gizmos edit it. */
export interface PoseValues { move: [number, number]; rotation: number; scale: [number, number] }
/** What the gizmos and the pose fields change: the default pose in the rig setup, the open sequence's key at the
 * playhead in Sequences (made from the values there). */
export type PoseEdit = (src: V2, b: number, change: (now: PoseValues) => Partial<PoseValues> & Pick<Transform, "piece" | "hidden">) => V2;

export interface SetupView {
  src: V2;
  /** Each bone's map from the rest arrangement to the sprite in the pose shown (setup.ts restMaps). */
  maps: Map2[];
  /** The default pose baked, for the preview; null with the error that stops the bake. */
  preview: BakedV2 | null;
  art: Art | null;
  /** The sheet shown, by name (front, front_female). */
  sheet: string;
  shiny: boolean;
  sel: SetupSelection;
  select(next: Partial<SetupSelection>): void;
  /** The source changed: one step of the page's history (a drag's later moves amend it; "end" does nothing). */
  commit(next: V2, phase?: Phase): void;
  say(message: string | null): void;
  /** A side the new editor can't edit yet (it has the first editor's armature). */
  readOnly: boolean;
  /** The Sequences mode's, or undefined in the rig setup. */
  seq?: SequenceView;
  pose: PoseEdit;
  /** Keys copied with Ctrl+C, pasted at the playhead with Ctrl+V. */
  copied?: CopiedKeys | null;
}

/** A selection toggled by Shift or Ctrl (adds or takes away one bone), or replaced by a plain click. */
export function pickBone(sel: SetupSelection, b: number, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): Partial<SetupSelection> {
  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    if (sel.bones.includes(b)) return { bones: sel.bones.filter((x) => x !== b) };
    return { bones: [b, ...sel.bones] };
  }
  return { bones: [b] };
}
