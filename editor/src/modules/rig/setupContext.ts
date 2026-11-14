// What the new Rig Editor's rig setup views share (SetupEditor.tsx): the source, where its edits go, the selection,
// the default pose as the preview draws it, and the art.

import type { Map2 } from "./armature.ts";
import type { Art } from "./context.ts";
import type { Phase } from "./model.ts";
import type { BakedV2, V2 } from "./v2.ts";

export interface SetupSelection {
  /** The chosen bones, the main one first (the gizmos act on all of them). */
  bones: number[];
  /** The chosen piece, and which of its rectangles. */
  piece: number | null;
  rectangle: number;
}

export const NO_SETUP_SELECTION: SetupSelection = { bones: [], piece: null, rectangle: 0 };

export interface SetupView {
  src: V2;
  /** Each bone's map from the rest arrangement to the sprite in the default pose (setup.ts restMaps). */
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
}

/** A selection toggled by Shift or Ctrl (adds or takes away one bone), or replaced by a plain click. */
export function pickBone(sel: SetupSelection, b: number, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): Partial<SetupSelection> {
  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    if (sel.bones.includes(b)) return { bones: sel.bones.filter((x) => x !== b) };
    return { bones: [b, ...sel.bones] };
  }
  return { bones: [b] };
}
