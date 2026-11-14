// The Rig Editor's edits of an armature (armature.ts): what a view's selection points at (a bone, or the root of the
// sequence shown), its key poses, the playhead in its own time, and writing its key poses back, kept in frame order.

import { loops, sequenceKeyAt } from "./mcss.ts";
import { keyPoseAt, localFrame, orderedKeyPose, reparent, wouldCycle, type KeyPose } from "./armature.ts";
import type { Phase } from "./model.ts";
import type { RigView } from "./context.ts";

/** A bone (by its track) or the root of a sequence. */
export type Target = { kind: "bone"; track: number } | { kind: "root"; sequence: number };

/** What the selection animates: the root when it's chosen, else the chosen part's bone. */
export function targetOf(view: RigView): Target | null {
  if (!view.source) return null;
  if (view.sel.root) return { kind: "root", sequence: Math.min(view.clock.state.sequence, view.rig.sequences.length - 1) };
  const part = view.sel.part !== null ? view.rig.poses[view.sel.pose]?.parts[view.sel.part] : undefined;
  return part ? { kind: "bone", track: part.track } : null;
}

export const targetName = (view: RigView, t: Target) =>
  t.kind === "root" ? `root (${view.rig.sequences[t.sequence]?.name ?? `sequence ${t.sequence}`})` : view.rig.tracks[t.track]?.name ?? `track ${t.track}`;

/** A target's key poses (in frame order), its length and whether it loops. */
export function animationOf(view: RigView, t: Target): { keys: KeyPose[]; frames: number; loop: boolean } | null {
  const s = view.source;
  if (!s) return null;
  if (t.kind === "root") {
    const sq = s.sequences[t.sequence];
    return sq ? { keys: sq.keys, frames: sq.frames, loop: loops(view.rig.sequences[t.sequence].play) } : null;
  }
  const bone = s.bones[t.track];
  return bone ? { keys: bone.keys, frames: bone.frames, loop: loops(view.rig.tracks[t.track].play) } : null;
}

const pathOf = (t: Target): (string | number)[] => (t.kind === "root" ? ["sequences", t.sequence] : ["bones", t.track]);

/** Writes a target's key poses (sorted by frame, each in the file's field order). */
export function setKeys(view: RigView, t: Target, keys: KeyPose[], phase: Phase = "typed") {
  const sorted = keys.map((k, i) => [k, i] as const).sort((a, b) => a[0].frame - b[0].frame || a[1] - b[1]).map(([k]) => orderedKeyPose(k));
  view.sourceEditor?.set([...pathOf(t), "keys"], sorted, phase);
}

export function setField(view: RigView, t: Target, field: string, value: unknown, phase: Phase = "typed") {
  view.sourceEditor?.set([...pathOf(t), field], value, phase);
}

/** The playhead in a target's own time: the sequence's for the root; a part's track time (from its pose's start, or
 * on the sequence's time), within the bone's loop. */
export function localAt(view: RigView, t: Target, time = view.clock.frameTime): number {
  const anim = animationOf(view, t);
  if (!anim) return 0;
  const n = Math.min(view.clock.state.sequence, view.rig.sequences.length - 1);
  if (t.kind === "root") return localFrame(anim.frames, anim.loop, time);
  const seq = view.rig.sequences[n];
  const at = sequenceKeyAt(seq, time);
  const part = view.rig.poses[at.key.pose ?? 0]?.parts.find((p) => p.track === t.track) ?? view.rig.poses[view.sel.pose]?.parts.find((p) => p.track === t.track);
  return localFrame(anim.frames, anim.loop, part?.play === "continue" ? time : at.since);
}

/** Auto-key: the key pose at the playhead (made where there is none), changed. Returns its place. */
export function autoKey(view: RigView, t: Target, base: KeyPose[], change: (key: KeyPose) => KeyPose, phase: Phase, frame = localAt(view, t)): number {
  const anim = animationOf(view, t);
  if (!anim) return -1;
  const { keys, index } = keyPoseAt(base, frame, anim.frames, anim.loop, change, view.newCurve);
  setKeys(view, t, keys, phase);
  return index;
}

/** The sequence times where a bone's key poses play in the sequence shown, over the stretches its pose is shown
 * (first: the first pass, the rest later passes), as the timeline places them. */
export function keyPoseTimes(pose: number, frames: number, keys: KeyPose[], restart: boolean, segments: { pose: number; from: number; to: number }[]) {
  const out: { index: number; at: number; later: boolean }[] = [];
  if (frames <= 0) return out;
  for (const seg of segments) {
    if (seg.pose !== pose) continue;
    keys.forEach((key, index) => {
      if (key.frame > frames) return;
      if (restart) {
        for (let at = seg.from + key.frame, pass = 0; at < seg.to || (at === seg.to && key.frame === frames && pass === 0); at += frames, pass++) {
          out.push({ index, at, later: pass > 0 });
          if (frames === 0) break;
        }
      } else {
        let at = seg.from + ((((key.frame - seg.from) % frames) + frames) % frames);
        for (; at < seg.to; at += frames) out.push({ index, at, later: at >= frames });
      }
    });
  }
  return out;
}

/** Parents a bone (null: to the root) keeping it where it is drawn, as Blender's Keep Transform (armature.reparent):
 * its key poses are written again relative to the new parent, so only what the parent does from now on moves it. */
export function setParent(view: RigView, bone: number, parent: number | null) {
  const s = view.source;
  if (!s || !view.sourceEditor || (parent !== null && wouldCycle(s, bone, parent))) return;
  view.sourceEditor.set(["bones", bone], reparent(s, view.rig, bone, parent).bones[bone]);
}
