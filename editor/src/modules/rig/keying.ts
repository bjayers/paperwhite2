// Keys at the playhead and choosing several parts: the actions the Key at playhead buttons and shortcut (K), the layer
// list, the timeline and the preview share. The pure parts are in model.ts (keyPartsAt, swapPictureAt, copyPose).

import { animationOf, localAt } from "./armatureEdit.ts";
import { keyPoseAt, orderedKeyPose } from "./armature.ts";
import { selectedParts, type RigView, type Selection } from "./context.ts";
import type { Rig } from "./mcss.ts";
import { keyPartsAt, partClock, swapPictureAt } from "./model.ts";

/** A key beginning at the playhead for the chosen parts (or, `all`, every part of the pose shown): the key the playhead
 * is in is split there (same on both sides), a track with none gets one, a key already beginning there is just chosen.
 * Works on an empty or full track. With an armature it makes key poses on the bones. Returns what to tell the user. */
export function keyAtPlayhead(start: RigView, all: boolean): string {
  // (Pose mode on a sprite with no armature: the first key pose makes one, so there are key poses to key)
  let view = start;
  if (!view.source && view.mode === "pose" && !view.gameKeys && (all || view.sel.part !== null)) view = view.ensureArmature(true) ?? view;
  const { rig, sel, clock, editor, select } = view;
  // The Root chosen (the whole sprite): a key pose on the sequence's, which the root's gizmos and Turn, Move and Scale write
  if (sel.root && view.source && view.sourceEditor && !all) {
    clock.play(false);
    const n = Math.min(clock.state.sequence, rig.sequences.length - 1);
    const target = { kind: "root" as const, sequence: n };
    const anim = animationOf(view, target);
    if (!anim) return "The root has no key poses here.";
    const { keys, index } = keyPoseAt(view.source.sequences[n].keys, localAt(view, target, clock.frameTime), anim.frames, anim.loop, (key) => key, view.newCurve);
    view.commit({ source: { ...view.source, sequences: view.source.sequences.map((s, i) => (i === n ? { ...s, keys: keys.map(orderedKeyPose) } : s)) } });
    select({ keyPose: index });
    return `A key pose for the whole sprite (the Root) at frame ${clock.frameTime}; it holds what the curves give there. Set its Turn, Move or Scale in the Key pose panel, or with the gizmos.`;
  }
  const pose = sel.pose;
  const count = rig.poses[pose]?.parts.length ?? 0;
  const parts = all ? Array.from({ length: count }, (_, i) => i) : selectedParts(sel);
  if (!parts.length) return "Choose a part first (click it on the preview or the layer list), or use Key all parts.";
  clock.play(false);
  const time = clock.frameTime;
  const sequence = Math.min(clock.state.sequence, rig.sequences.length - 1);
  if (view.source && view.sourceEditor) {
    // One step for all the parts: the key poses made on a working copy of the armature, written once
    let working = view.source;
    let made = 0;
    let first = -1;
    for (const k of parts) {
      const part = rig.poses[pose].parts[k];
      const target = { kind: "bone" as const, track: part.track };
      const anim = animationOf(view, target);
      if (!anim) continue;
      const { keys, index } = keyPoseAt(working.bones[part.track].keys, localAt(view, target, time), anim.frames, anim.loop, (key) => key, view.newCurve);
      working = { ...working, bones: working.bones.map((b, i) => (i === part.track ? { ...b, keys: keys.map(orderedKeyPose) } : b)) };
      made++;
      if (k === parts[0]) first = index;
    }
    view.commit({ source: working });
    if (first >= 0) select({ keyPose: first });
    return `Key poses at frame ${time} for ${made} bone${made === 1 ? "" : "s"} (one already there is just chosen). They hold what the curves give there (new ones go to the next by the curve chosen under New key poses); move the part with a gizmo to change them.`;
  }
  const result = keyPartsAt(rig, sequence, time, pose, parts);
  if (!result.targets.length) return `The playhead (frame ${time}) isn't in pose ${pose}, so its parts aren't playing: move it into the pose, or choose the pose the playhead is in.`;
  const created = result.targets.filter((t) => t.created).length;
  if (created) editor.replace(result.rig);
  const first = result.targets[0];
  select({ key: { track: first.track, index: first.index } });
  const skipped = result.skipped.length ? ` ${result.skipped.length} not playing at this frame.` : "";
  return created
    ? `Keyed ${created} of ${result.targets.length} track${result.targets.length === 1 ? "" : "s"} at frame ${time}; ${result.targets.length - created} had a key beginning there.${skipped}`
    : `Every chosen part already has a key beginning at frame ${time}; the first is chosen.${skipped}`;
}

/** The chosen part shows `picture` from the playhead on: the key it is in is split at the playhead if need be.
 * `base` is the rig to edit (with a hidden picture added, say). */
export function swapPicture(view: RigView, picture: number, base: Rig = view.rig): string {
  const { sel, clock, editor, select } = view;
  if (sel.part === null) return "Choose a part first.";
  const sequence = Math.min(clock.state.sequence, view.rig.sequences.length - 1);
  const c = partClock(base, sequence, clock.frameTime, sel.pose, sel.part);
  if (!c) return "The playhead isn't in this pose, so the part isn't playing: move it into the pose.";
  clock.play(false);
  const done = swapPictureAt(base, c.track, c.local, picture);
  editor.replace(done.rig);
  select({ key: { track: c.track, index: done.index }, picture, rectangle: 0 });
  return `The part shows picture ${picture} from frame ${clock.frameTime}.`;
}

/** The selection a click on part `k` makes with the keyboard's modifiers: ctrl or cmd toggles it in the chosen parts,
 * shift chooses the range from the main part to it; null for a plain click. */
export function pickPart(sel: Selection, k: number, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): Partial<Selection> | null {
  const chosen = selectedParts(sel);
  if (e.shiftKey && sel.part !== null) {
    const [a, b] = [Math.min(sel.part, k), Math.max(sel.part, k)];
    const range = Array.from({ length: b - a + 1 }, (_, i) => a + i);
    const list = [sel.part, ...range.filter((n) => n !== sel.part)];
    return { part: list[0], more: list.slice(1), key: null, root: false, sequenceKey: null, keyPose: null };
  }
  if (e.ctrlKey || e.metaKey) {
    const list = chosen.includes(k) ? chosen.filter((n) => n !== k) : [...chosen, k];
    return { part: list[0] ?? null, more: list.slice(1), key: null, root: false, sequenceKey: null, keyPose: null };
  }
  return null;
}
