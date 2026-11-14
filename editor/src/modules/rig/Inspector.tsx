// The Rig Editor's side panel, laid out as the Overworld Editor's Ambients panel is: a headed section for what is
// chosen (the key, the part, the picture, the sequence's key), each with its actions at its top, a label column beside
// the controls, numbers in the user's units (degrees, pixels, frames) whose labels drag; then the sprite's own settings.

import { useRef, useState, type ReactNode } from "react";
import type { Source } from "./armature.ts";
import { boneStep, CHANNEL_LABELS, CURVES, movePivot, sourceWithoutPicture, wouldCycle, type Channel, type Curve, type KeyPose } from "./armature.ts";
import { animationOf, autoKey, localAt, setKeys, targetName, targetOf } from "./armatureEdit.ts";
import { ScrubNumber, type ScrubPhase } from "../overworld/ScrubNumber.tsx";
import { keyAt, lengthOf, sequenceKeyAt, type Key, type KeyType, type Pair, type Picture, type Rectangle, type Rig, type Track } from "./mcss.ts";
import { copyPose, fixedScale, fromDegrees, generateObjs, keyAs, orderedKey, partClock, partName, pictureUses, removeKey, removePicture, resetKey, signedDegrees, sizeProblem,
         trackUses, withHiddenPicture, withRectangles, type Phase } from "./model.ts";
import { LayerList } from "./LayerList.tsx";
import { PicturePicker } from "./PicturePicker.tsx";
import { keyAtPlayhead, pickPart, swapPicture } from "./keying.ts";
import { hue, useClock, type RigView } from "./context.ts";

const KEY_TYPES: { type: KeyType; label: string; note: string }[] = [
  { type: "plain", label: "Picture", note: "Each key only shows a picture: the part stays at its pivot." },
  { type: "move", label: "Move", note: "Each key shows a picture moved by whole pixels." },
  { type: "srt", label: "Turn, scale, move", note: "Each key shows a picture turned, scaled and moved about the pivot." },
];

const phaseOf = (p: ScrubPhase): Phase => p;

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <>
      <span className="ow-condition-label">{label}</span>
      <span className="ow-xyz">
        {children}
        {hint && <span className="muted hint">{hint}</span>}
      </span>
    </>
  );
}

/** Two numbers of a pair, each label dragging. */
function PairInput({ value, labels, onChange, step = 0.25, digits = 0 }: {
  value: Pair; labels: [string, string]; onChange(v: Pair, phase: Phase): void; step?: number; digits?: number;
}) {
  return (
    <>
      <ScrubNumber label={labels[0]} value={value[0]} step={step} digits={digits} onChange={(n, p) => onChange([n, value[1]], phaseOf(p))} />
      <ScrubNumber label={labels[1]} value={value[1]} step={step} digits={digits} onChange={(n, p) => onChange([value[0], n], phaseOf(p))} />
    </>
  );
}

export function Inspector({ view, onMessage, onRemoveArmature }: { view: RigView; onTimeChanged(): void; onMessage(message: string): void; onRemoveArmature(): void }) {
  const edit = view.mode === "edit";
  const raw = !view.source && view.gameKeys;
  return (
    <div className="rig-inspector">
      {edit ? (
        <>
          <OutlinerSection view={view} onRemove={onRemoveArmature} onMessage={onMessage} />
          <LayerList view={view} />
          <PartSection view={view} />
          <BoneSection view={view} onMessage={onMessage} />
          <PictureSection view={view} />
        </>
      ) : (
        <>
          <PosesSection view={view} onMessage={onMessage} />
          <OutlinerSection view={view} onRemove={onRemoveArmature} onMessage={onMessage} />
          {view.source ? <KeyPoseSection view={view} /> : raw ? <KeySection view={view} onTimeChanged={() => undefined} onMessage={onMessage} /> : <NoArmatureNote />}
          {view.source && <BoneSection view={view} onMessage={onMessage} />}
          {view.source && <SequenceSection view={view} />}
          {raw && <SequenceKeySection view={view} />}
        </>
      )}
    </div>
  );
}

function NoArmatureNote() {
  return (
    <section className="ow-panel-box ow-section">
      <h5>Key pose <span className="muted">choose a part</span></h5>
      <p className="muted ow-note">Click a part on the preview and drag Move, Rotate or Scale (or press K) to set its key pose at the playhead. The first one makes
        an armature of this sprite (it plays exactly as before until you change something, and Ctrl+Z takes it away); then a start and an end key pose with a curve
        between fill in the keys every 6 frames. Parenting is in Edit mode (Tab). Game keys, under the preview, edits the game's own keys instead.</p>
    </section>
  );
}

// ---------------------------------------------------------------- The outliner: parents (Edit mode) and choosing (both)

function OutlinerSection({ view, onRemove, onMessage }: { view: RigView; onRemove(): void; onMessage(message: string): void }) {
  const { rig, source, sel, select } = view;
  const edit = view.mode === "edit";
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | "root" | null>(null);
  const pose = rig.poses[sel.pose];
  const parts = pose?.parts ?? [];
  const inPose = new Map(parts.map((p, k) => [p.track, k] as const));
  const parentOf = (track: number) => source?.bones[track]?.parent ?? null;
  const children = (parent: number | null) => parts.map((p, k) => [p, k] as const).filter(([p]) => {
    const up = parentOf(p.track);
    return parent === null ? up === null || !inPose.has(up) : up === parent;
  });
  const cycle = (track: number, parent: number | null) => (source ? wouldCycle(source, track, parent) : track === parent);
  const parentTo = (track: number, parent: number | null) => {
    if (parent === parentOf(track) || cycle(track, parent)) return;
    onMessage(view.parentBone(track, parent) ?? "");
  };
  const rows: ReactNode[] = [];
  const walk = (parent: number | null, depth: number, seen: Set<number>) => {
    for (const [p, k] of children(parent)) {
      if (seen.has(p.track)) continue;
      seen.add(p.track);
      const up = parentOf(p.track);
      rows.push(
        <div key={k} className={`rig-outliner-row${sel.part === k && !sel.root ? " selected" : ""}${over === p.track ? " drop" : ""}`} style={{ paddingLeft: 8 + depth * 16 }}
             draggable={edit} onDragStart={(e) => { setDrag(p.track); e.dataTransfer.effectAllowed = "link"; }} onDragEnd={() => { setDrag(null); setOver(null); }}
             onDragOver={(e) => { if (edit && drag !== null && drag !== p.track && !cycle(drag, p.track)) { e.preventDefault(); setOver(p.track); } }}
             onDragLeave={() => setOver(null)}
             onDrop={(e) => { e.preventDefault(); if (edit && drag !== null) parentTo(drag, p.track); setDrag(null); setOver(null); }}
             onClick={(e) => select(pickPart(sel, k, e) ?? { part: k, more: [], root: false, key: null, keyPose: null, sequenceKey: null, picture: rig.tracks[p.track]?.keys[0]?.picture ?? null })}
             title={`${rig.tracks[p.track]?.name}${edit ? ": drag onto another part to parent it there, onto the root to unparent it" : ""}`}>
          <span className="rig-tree-line">{depth ? "└" : "·"}</span>
          <span className="rig-swatch" style={{ background: hue(k) }} />
          <b>{partName(rig.tracks[p.track])}</b>
          <span className="muted">{rig.tracks[p.track]?.name}</span>
          {up !== null && !inPose.has(up) && <span className="muted">(parent {rig.tracks[up]?.name}, not in this action)</span>}
        </div>,
      );
      walk(p.track, depth + 1, seen);
    }
  };
  walk(null, 1, new Set());
  return (
    <section className="ow-panel-box ow-section">
      <h5>{edit ? "Parenting" : "Parts"} <span className="muted">action {sel.pose}: {parts.length} parts{source ? ` · baked every ${source.step} frames` : " · no armature yet"}</span></h5>
      {source && (
        <div className="ow-section-actions">
          <button onClick={onRemove} title="Back to editing the rig's keys flat (they keep what the armature baked)">Remove armature</button>
        </div>
      )}
      <div className="rig-outliner">
        <div className={`rig-outliner-row${sel.root ? " selected" : ""}${over === "root" ? " drop" : ""}`}
             onDragOver={(e) => { if (edit && drag !== null) { e.preventDefault(); setOver("root"); } }} onDragLeave={() => setOver(null)}
             onDrop={(e) => { e.preventDefault(); if (edit && drag !== null) parentTo(drag, null); setDrag(null); setOver(null); }}
             onClick={() => {
               if (edit) return;
               // (choosing the Root to key the whole sprite: a sprite with no armature gets one)
               const v = view.source ? view : view.gameKeys ? null : view.ensureArmature();
               if (v) select({ root: true, part: null, key: null, keyPose: null, sequenceKey: null });
             }}
             title={edit ? "The root: the whole sprite. Drop a part here to unparent it." : "The root: the whole sprite (the sequence's move, turn and scale, about the feet). Click to choose it and key the whole sprite."}>
          <span className="rig-bone-icon">◆</span><b>Root</b><span className="muted">the whole sprite, about the feet</span>
        </div>
        {rows}
      </div>
      {edit ? (
        <p className="muted ow-note">Drag a part onto another to parent it (onto Root to unparent), or use Pick parent under Bone. A child follows its parent's turn,
          scale and move as Blender's bones do; the bake writes that into the child's own keys, as the game has no parents. Parenting keeps the part where it is
          (Keep Transform). The first parent makes an armature of the sprite; it plays exactly as before.</p>
      ) : (
        <p className="muted ow-note">Click a part to pose it. Parents are set in Edit mode (Tab). Root poses the whole sprite.</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- The bone

function BoneSection({ view, onMessage }: { view: RigView; onMessage(message: string): void }) {
  const { rig, source, sourceEditor, sel, picking, setPicking } = view;
  const edit = view.mode === "edit";
  const part = sel.part !== null ? rig.poses[sel.pose]?.parts[sel.part] : undefined;
  if (!part || (!edit && (!source || !sourceEditor))) return null;
  const t = part.track;
  const bone = source?.bones[t];
  const others = rig.tracks.map((tr, i) => [tr, i] as const).filter(([, i]) => i !== t && !(source && wouldCycle(source, t, i)));
  return (
    <section className="ow-panel-box ow-section">
      <h5>{edit ? "Bone" : "Bone"} <span className="muted">{rig.tracks[t].name}{bone ? ` · ${bone.keys.length} key poses over ${bone.frames} frames` : ""}</span></h5>
      {edit && (
        <div className="ow-section-actions">
          <button className={picking === t ? "primary" : ""} onClick={() => setPicking(picking === t ? null : t)} title="Then click the parent's part on the preview">{picking === t ? "Click the parent on the preview… (cancel)" : "Pick parent on the preview"}</button>
        </div>
      )}
      <div className="ow-condition">
        {edit && (
          <Row label="Parent" hint="it turns, scales and moves with its parent, about the parent's pivot; it stays where it is when you parent it">
            <select value={bone?.parent ?? -1} onChange={(e) => onMessage(view.parentBone(t, Number(e.target.value) < 0 ? null : Number(e.target.value)) ?? "")}>
              <option value={-1}>Root (none)</option>
              {others.map(([tr, i]) => <option key={i} value={i}>{i}: {tr.name}</option>)}
            </select>
          </Row>
        )}
        {!edit && source && bone && sourceEditor && (
          <>
            <Row label="Loop" hint={`frames of this part's own loop (key poses from 0 to ${bone.frames}; one at the end lasts 0, as Game Freak's do): the part loops inside the action at this length`}>
              <ScrubNumber label="⇔" value={bone.frames} step={0.2} digits={0} onChange={(n, p) => sourceEditor.set(["bones", t, "frames"], Math.max(0, Math.min(65535, Math.round(n))), phaseOf(p))} />
            </Row>
            <Row label="Bake every" hint={`its own step, else the sequence's (now ${boneStep(source, rig, t)} frames)`}>
              <select value={bone.step ?? 0} onChange={(e) => sourceEditor.set(["bones", t, "step"], Number(e.target.value) || undefined)}>
                <option value={0}>the sequence's</option>
                {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n} frame{n > 1 ? "s" : ""}</option>)}
              </select>
            </Row>
            <Row label="Baked as" hint="the key type the bake writes: the least that holds its keys">
              <span className="muted">{rig.tracks[t].key_type === "srt" ? "turn, scale and move" : rig.tracks[t].key_type === "move" ? "move" : "picture"} · {rig.tracks[t].keys.length} keys</span>
            </Row>
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- The sequence (Pose mode, armature)

/** The shown sequence as the NLA strip it is: blocks that each play an action for N frames, and its loop length. */
function SequenceSection({ view }: { view: RigView }) {
  const { rig, source, sourceEditor, clock } = view;
  const n = useClock(clock, (s) => Math.min(s.sequence, rig.sequences.length - 1));
  const seq = rig.sequences[n];
  const src = source?.sequences[n];
  if (!source || !sourceEditor || !seq || !src) return null;
  let at = 0;
  return (
    <section className="ow-panel-box ow-section">
      <h5>Sequence <span className="muted">{n === 0 ? "Stay" : n === 1 ? "Stop" : `Sequence ${n}`} · {seq.name}</span></h5>
      <div className="ow-condition">
        <Row label="Loop" hint="how long the whole sequence runs before it starts again; the Root's key poses are on this time">
          <ScrubNumber label="⇔" value={src.frames} step={0.5} digits={0} onChange={(v, p) => sourceEditor.set(["sequences", n, "frames"], Math.max(1, Math.min(65535, Math.round(v))), phaseOf(p))} />
        </Row>
      </div>
      <div className="rig-nla">
        {seq.keys.map((k, i) => {
          const from = at;
          at += k.frames;
          return <span key={i} className="rig-nla-block" title={`Block ${i}: action ${k.pose ?? 0} for ${k.frames} frames (from ${from}), as the bake makes it`}>action {k.pose ?? 0} · {k.frames}</span>;
        })}
      </div>
      <p className="muted ow-note">Like Blender's NLA strip: each block plays one action for N frames. Drag a block's right edge on the timeline to change how long that
        action plays (the blocks after it move along); each part's track keeps looping at its own length inside it. The blocks come from the Root's key poses
        (the action each one shows).</p>
    </section>
  );
}

// ---------------------------------------------------------------- A key pose (of a bone or the root)

function KeyPoseSection({ view }: { view: RigView }) {
  const { rig, sel, select, clock } = view;
  // (the playhead shown, and where + Key puts a key pose)
  useClock(clock, (s) => `${s.sequence}|${Math.floor(s.time)}`);
  const target = targetOf(view);
  const anim = target ? animationOf(view, target) : null;
  if (!target || !anim) {
    return (
      <section className="ow-panel-box ow-section">
        <h5>Key pose <span className="muted">choose a bone or the root</span></h5>
        <p className="muted ow-note">Click a part on the preview, a bone in the outliner or a diamond on the timeline. The gizmos (Move G, Rotate R, Scale S) key
          the chosen bone at the playhead: they change the key pose there, or make one.</p>
      </section>
    );
  }
  const { keys, frames, loop } = anim;
  const index = sel.keyPose !== null && sel.keyPose < keys.length ? sel.keyPose : null;
  const key = index !== null ? keys[index] : undefined;
  const here = localAt(view, target);
  const setKey = (patch: Partial<KeyPose>, phase: Phase = "typed") => {
    if (index === null || !key) return;
    const next = keys.map((k, i) => (i === index ? { ...k, ...patch } : k));
    setKeys(view, target, next, phase);
    if (patch.frame !== undefined) {
      const order = next.map((k, i) => [k, i] as const).sort((a, b) => a[0].frame - b[0].frame || a[1] - b[1]).map(([, i]) => i);
      select({ keyPose: order.indexOf(index) });
    }
  };
  const root = target.kind === "root";
  return (
    <section className="ow-panel-box ow-section">
      <h5>Key pose <span className="muted">{targetName(view, target)}{key ? `, ${index! + 1} of ${keys.length}, frame ${key.frame}` : ` · ${keys.length} key poses`} · playhead at {here} of {frames}</span></h5>
      <div className="ow-section-actions">
        <button title="A key pose at the playhead with the curves' values there (or choose the one there)" onClick={() => select({ keyPose: autoKey(view, target, keys, (k) => k, "typed", here) })}>+ Key at playhead</button>
        <button disabled={!key || keys.length < 2} onClick={() => { setKeys(view, target, keys.filter((_, i) => i !== index)); select({ keyPose: null }); }}>Delete</button>
        <button disabled={!key} title="Moves the playhead to it" onClick={() => {
          if (!key) return;
          clock.play(false);
          clock.seek(root ? key.frame : Math.max(0, clock.frameTime - here + key.frame));
        }}>Go to</button>
      </div>
      {key ? (
        <div className="ow-condition">
          <Row label="Frame" hint={`of the ${root ? "sequence" : "track"}'s ${frames} (0 to ${frames})`}>
            <ScrubNumber label="⇔" value={key.frame} step={0.2} digits={0} onChange={(n, p) => setKey({ frame: Math.max(0, Math.min(frames, Math.round(n))) }, phaseOf(p))} />
          </Row>
          {root ? (
            <Row label="Pose" hint="the set of parts shown from here (held)">
              <select value={key.pose ?? 0} onChange={(e) => setKey({ pose: Number(e.target.value) })}>
                {rig.poses.map((p, i) => <option key={i} value={i}>pose {i}: {p.parts.length} parts</option>)}
              </select>
            </Row>
          ) : (
            <Row label="Picture" hint="shown from here (held, never tweened); Hidden draws nothing">
              <PicturePicker view={view} value={key.picture ?? 0} onPick={(n) => { setKey({ picture: n }); select({ picture: n, rectangle: 0 }); }}
                onHide={() => { const h = withHiddenPicture(rig); if (h.rig !== rig) view.editor.set(["pictures"], h.rig.pictures); setKey({ picture: h.picture }); }} />
            </Row>
          )}
          <Row label="Move" hint={root ? "the whole sprite, pixels, y down" : "pixels from the pivot (in its parent's frame), y down; baked to whole pixels"}>
            <PairInput value={key.move ?? [0, 0]} labels={["x", "y"]} step={0.1} digits={1} onChange={(v, p) => setKey({ move: [round(v[0], 10), round(v[1], 10)] }, p)} />
          </Row>
          <Row label="Turn" hint="degrees, clockwise, not wrapped (370 turns once and 10 more)">
            <ScrubNumber label="°" value={key.rotation ?? 0} step={0.5} digits={2} onChange={(n, p) => setKey({ rotation: round(n, 100) }, phaseOf(p))} />
          </Row>
          <Row label="Scale" hint={root ? "the whole sprite" : "keep a parent's even (x = y) where its children turn: the game can't shear"}>
            <PairInput value={key.scale ?? [1, 1]} labels={["x", "y"]} step={0.01} digits={3} onChange={(v, p) => setKey({ scale: [fixedScale(v[0]), fixedScale(v[1])] }, p)} />
          </Row>
          <Row label="Curve" hint={key.curves ? `to the next key pose; some channels have their own (${Object.entries(key.curves).map(([c, v]) => `${CHANNEL_LABELS[c as Channel]}: ${v}`).join(", ")})` : "to the next key pose, every channel (the graph editor sets one channel's)"}>
            <select value={key.curve ?? "constant"} onChange={(e) => setKey({ curve: e.target.value as Curve, curves: undefined })}>
              {CURVES.map((c) => <option key={c.curve} value={c.curve}>{c.label}</option>)}
            </select>
          </Row>
        </div>
      ) : <p className="muted ow-note">Click a diamond on the timeline, or + Key at playhead.{loop ? "" : " (Plays once: it holds its last key pose.)"}</p>}
    </section>
  );
}

const round = (v: number, by: number) => Math.round(v * by) / by + 0;

// ---------------------------------------------------------------- The key

function KeySection({ view, onTimeChanged, onMessage }: { view: RigView; onTimeChanged(): void; onMessage(message: string): void }) {
  const { rig, sel, select, editor, clock } = view;
  // (the playhead, for the key it is in)
  useClock(clock, (s) => `${s.sequence}|${Math.floor(s.time)}`);
  const part = sel.part !== null ? rig.poses[sel.pose]?.parts[sel.part] : undefined;
  if (!part) {
    return (
      <section className="ow-panel-box ow-section">
        <h5>Key <span className="muted">choose a part</span></h5>
        <p className="muted ow-note">Click a part on the preview or a key on the timeline. The gizmos (Pivot P, Move G, Rotate R, Scale S) edit the key
          the part shows at the playhead.</p>
      </section>
    );
  }
  const trackIndex = part.track;
  const track = rig.tracks[trackIndex];
  const index = sel.key?.track === trackIndex ? sel.key.index : null;
  const key = index !== null ? track.keys[index] : undefined;
  const path = (i: number) => ["tracks", trackIndex, "keys", i];
  const setKey = (patch: Partial<Key>, phase: Phase = "typed") => {
    if (index === null || !key) return;
    editor.set(path(index), orderedKey({ ...key, ...patch }), phase);
  };
  const setKeys = (keys: Key[], chosen: number | null) => {
    editor.set(["tracks", trackIndex, "keys"], keys);
    select({ key: chosen === null ? null : { track: trackIndex, index: chosen } });
  };
  const playhead = () => {
    const seq = rig.sequences[Math.min(clock.state.sequence, rig.sequences.length - 1)];
    const at = sequenceKeyAt(seq, clock.frameTime);
    return keyAt(track, part.play === "restart" ? at.since : clock.frameTime);
  };
  const length = lengthOf(track);
  const hereClock = partClock(rig, Math.min(clock.state.sequence, rig.sequences.length - 1), clock.frameTime, sel.pose, sel.part!);
  const hereKey = hereClock ? keyAt(rig.tracks[hereClock.track], hereClock.local) : null;
  return (
    <section className="ow-panel-box ow-section">
      <h5>Key <span className="muted">{track.name}{key ? `, key ${index} of ${track.keys.length}` : ""} · {track.keys.length} keys, {length} frames ({track.play})</span></h5>
      <div className="ow-section-actions">
        <button className="primary" title="A key beginning at the playhead for the chosen part(s): splits the key the playhead is in, or makes one on an empty track (K)"
                onClick={() => onMessage(keyAtPlayhead(view, false))}>◇ Key at playhead (K)</button>
        <button title="The same for every part of the pose (Shift+K): the pose workflow" onClick={() => onMessage(keyAtPlayhead(view, true))}>◆ Key all parts</button>
      </div>
      <div className="ow-condition">
        <Row label="Picture" hint={`from the playhead on (frame ${clock.frameTime}${hereKey ? `, key ${hereKey.index}` : ""}): a key that holds another picture swaps it in; picking splits the key if the playhead is inside it`}>
          <PicturePicker view={view} value={hereKey?.key.picture ?? 0}
            onPick={(n) => onMessage(swapPicture(view, n))}
            onHide={() => { const h = withHiddenPicture(rig); onMessage(swapPicture(view, h.picture, h.rig)); }} />
        </Row>
      </div>
      {key ? (
        <>
          <div className="ow-section-actions">
            <button title="A copy of this key after it" onClick={() => setKeys([...track.keys.slice(0, index! + 1), { ...key }, ...track.keys.slice(index! + 1)], index! + 1)}>Duplicate</button>
            <button title="Splits the key the playhead is in, where it is: two keys, the same, one before and one after"
              onClick={() => {
                const at = playhead();
                if (at.since <= 0) return;
                const keys = track.keys.slice();
                keys.splice(at.index, 1, orderedKey({ ...keys[at.index], frames: at.since }), orderedKey({ ...keys[at.index], frames: keys[at.index].frames - at.since }));
                setKeys(keys, at.index + 1);
                onTimeChanged();
              }}>Split at playhead</button>
            <button title="A new key after this one, held 6 frames, showing what it shows" onClick={() => setKeys([...track.keys.slice(0, index! + 1), orderedKey({ ...key, frames: 6 }), ...track.keys.slice(index! + 1)], index! + 1)}>+ Key after</button>
            <button title={track.keys.length < 2 ? "A track needs at least one key (the game plays it): Reset puts this key back to resting (no move, turn or scale)" : "Removes the key; the keys after it start earlier"}
              onClick={() => {
                const next = removeKey(track, index!);
                if (next) setKeys(next, Math.max(0, index! - 1));
                else editor.set(path(index!), orderedKey(resetKey(key, track.key_type)));
              }}>{track.keys.length < 2 ? "Reset" : "Delete"}</button>
          </div>
          <div className="ow-condition">
            <Row label="This key" hint={`picture, of ${rig.pictures.length}; the picker above changes the key at the playhead`}>
              <select value={key.picture ?? 0} onChange={(e) => { setKey({ picture: Number(e.target.value) }); select({ picture: Number(e.target.value), rectangle: 0 }); }}>
                {rig.pictures.map((p, i) => <option key={i} value={i}>{i}: {p.rectangles.map((r) => `${r.size[0]}×${r.size[1]}`).join(" + ")}</option>)}
              </select>
            </Row>
            <Row label="Frames" hint={`held ${(key.frames / 60).toFixed(2)} s; Game Freak keyed every 6 frames${key.frames === 0 ? "; 0: never shown" : ""}`}>
              <ScrubNumber label="⇔" value={key.frames} step={0.2} digits={0} onChange={(n, p) => setKey({ frames: Math.max(0, Math.min(65535, Math.round(n))) }, phaseOf(p))} />
            </Row>
            {track.key_type === "srt" && (
              <>
                <Row label="Turn" hint="degrees, clockwise (stored in 65536ths of a turn)">
                  <ScrubNumber label="°" value={Math.round(signedDegrees(key.rotation ?? 0) * 100) / 100} step={0.5} digits={2}
                    onChange={(n, p) => setKey({ rotation: fromDegrees(n) }, phaseOf(p))} />
                </Row>
                <Row label="Scale" hint="1 is the picture's size; negative mirrors">
                  <PairInput value={key.scale ?? [1, 1]} labels={["x", "y"]} step={0.01} digits={3} onChange={(v, p) => setKey({ scale: [fixedScale(v[0]), fixedScale(v[1])] }, p)} />
                </Row>
              </>
            )}
            {track.key_type !== "plain" && (
              <Row label="Move" hint="pixels from the pivot, x right, y down">
                <PairInput value={key.move ?? [0, 0]} labels={["x", "y"]} onChange={(v, p) => setKey({ move: [Math.round(v[0]), Math.round(v[1])] }, p)} />
              </Row>
            )}
          </div>
        </>
      ) : <p className="muted ow-note">Click one of the part's keys on the timeline, or drag a gizmo on the preview.</p>}
      <div className="ow-condition">
        <Row label="Key type" hint={KEY_TYPES.find((t) => t.type === track.key_type)?.note}>
          <span className="view-switch">
            {KEY_TYPES.map((t) => (
              <button key={t.type} className={track.key_type === t.type ? "active" : ""} title={t.note}
                onClick={() => {
                  if (t.type === track.key_type) return;
                  const lost = t.type === "plain" ? track.keys.some((k) => k.move?.some(Boolean) || k.rotation || (k.scale && (k.scale[0] !== 1 || k.scale[1] !== 1)))
                    : t.type === "move" && track.keys.some((k) => k.rotation || (k.scale && (k.scale[0] !== 1 || k.scale[1] !== 1)));
                  if (lost && !confirm(`Some of ${track.name}'s keys turn, scale or move it; as ${t.label} keys they lose that. Go on?`)) return;
                  editor.set(["tracks", trackIndex], { ...track, key_type: t.type, keys: track.keys.map((k) => keyAs(k, t.type)) } satisfies Track);
                }}>{t.label}</button>
            ))}
          </span>
        </Row>
        <Row label="Plays" hint={track.play === "loop" ? "round and round" : track.play === "once" ? "once, then holds its last key" : "forward, then back"}>
          <span className="view-switch">
            {(["loop", "once"] as const).map((p) => (
              <button key={p} className={track.play === p ? "active" : ""} onClick={() => editor.set(["tracks", trackIndex, "play"], p)}>{p === "loop" ? "Loop" : "Once"}</button>
            ))}
          </span>
        </Row>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- The part

/** A part's pivot as two numbers: moving it keeps what the part draws where it is (movePivot), as the Pivot tool does. */
function PivotInput({ view, pose, part }: { view: RigView; pose: number; part: number }) {
  const base = useRef<{ rig: Rig; source: Source | null } | null>(null);
  const current = view.rig.poses[pose].parts[part].pivot;
  const change = (target: Pair, phase: Phase) => {
    if (phase === "start" || phase === "typed" || !base.current) base.current = { rig: view.rig, source: view.source };
    const b = base.current;
    const from = b.rig.poses[pose].parts[part].pivot;
    const done = movePivot(b.rig, pose, part, [target[0] - from[0], target[1] - from[1]], b.source);
    view.commit({ rig: done.rig, ...(done.source ? { source: done.source } : {}) }, phase);
    if (phase === "end" || phase === "typed") base.current = null;
  };
  return <PairInput value={current} labels={["x", "y"]} onChange={(v, p) => change([Math.round(v[0]), Math.round(v[1])], p)} />;
}

function PartSection({ view }: { view: RigView }) {
  const { rig, sel, select, editor } = view;
  const pose = rig.poses[sel.pose];
  const k = sel.part;
  const part = k !== null ? pose?.parts[k] : undefined;
  const addPart = () => {
    // A new track (turn, scale and move keys, one key as long as the sequence) at the front of the pose
    const picture = sel.picture ?? 0;
    const frames = Math.max(1, lengthOf(rig.sequences[0]));
    const track: Track = { name: `part${rig.tracks.length}`, key_type: "srt", play: "loop",
                           keys: [{ picture, frames, rotation: 0, scale: [1, 1], move: [0, 0] }] };
    const idle = rig.idle_parts === null ? null : rig.idle_parts.map((n) => n + 1);
    editor.replace({ ...rig, idle_parts: idle, tracks: [...rig.tracks, track],
                     poses: rig.poses.map((p, i) => (i === sel.pose ? { ...p, parts: [{ track: rig.tracks.length, pivot: [0, -16], play: "restart" }, ...p.parts] } : p)) });
    select({ part: 0, key: { track: rig.tracks.length, index: 0 } });
  };
  if (!part || k === null) {
    return (
      <section className="ow-panel-box ow-section">
        <h5>Part <span className="muted">pose {sel.pose}: {pose?.parts.length ?? 0} parts</span></h5>
        <div className="ow-section-actions"><button onClick={addPart} title="A new part at the front of this pose, with a track of its own showing the chosen picture">+ Add part</button></div>
        <p className="muted ow-note">A part is a piece of the Pokémon in this pose: it plays a track (its keys) about its pivot. The timeline lists them front to back.</p>
      </section>
    );
  }
  const track = rig.tracks[part.track];
  const at = ["poses", sel.pose, "parts", k];
  const set = (field: string, value: unknown, phase: Phase = "typed") => editor.set([...at, field], value, phase);
  const shared = trackUses(rig, part.track).filter((u) => !(u.pose === sel.pose && u.part === k));
  const idle = new Set(rig.idle_parts ?? []);
  const move = (to: number) => {
    const parts = pose.parts.slice();
    const [p] = parts.splice(k, 1);
    parts.splice(to, 0, p);
    const order = pose.parts.map((_, i) => i);
    const [o] = order.splice(k, 1);
    order.splice(to, 0, o);
    const idleNext = rig.idle_parts === null ? null : rig.idle_parts.map((n) => order.indexOf(n)).filter((n) => n >= 0).sort((a, b) => a - b);
    editor.replace({ ...rig, idle_parts: idleNext, poses: rig.poses.map((q, i) => (i === sel.pose ? { ...q, parts } : q)) });
    select({ part: to });
  };
  return (
    <section className="ow-panel-box ow-section">
      <h5><span className="rig-swatch" style={{ background: hue(k) }} /> Part {k} <span className="muted">{partName(track)} · layer {k + 1} of {pose.parts.length}, front to back</span></h5>
      <div className="ow-section-actions">
        <button disabled={k === 0} onClick={() => move(k - 1)} title="One layer nearer the front">↑ Forward</button>
        <button disabled={k === pose.parts.length - 1} onClick={() => move(k + 1)} title="One layer further back">↓ Back</button>
        <button onClick={addPart}>+ Add part</button>
        <button disabled={pose.parts.length < 2} title="Takes the part out of this pose; its track stays"
          onClick={() => {
            if (!confirm(`Take ${track?.name} out of pose ${sel.pose}? Its track stays in the rig.`)) return;
            const idleNext = rig.idle_parts === null ? null : rig.idle_parts.filter((n) => n !== k).map((n) => (n > k ? n - 1 : n));
            editor.replace({ ...rig, idle_parts: idleNext, poses: rig.poses.map((q, i) => (i === sel.pose ? { ...q, parts: q.parts.filter((_, j) => j !== k) } : q)) });
            select({ part: null, key: null });
          }}>Remove</button>
      </div>
      <div className="ow-condition">
        <Row label="Track" hint={shared.length ? `also played by ${shared.map((u) => `pose ${u.pose}'s part ${u.part}`).join(", ")}: edits change both` : "the keys it plays"}>
          <select value={part.track} onChange={(e) => set("track", Number(e.target.value))}>
            {rig.tracks.map((t, i) => <option key={i} value={i}>{i}: {t.name}</option>)}
          </select>
        </Row>
        <Row label="Name" hint="the track's label, which names the part (head_a: the head in pose a)">
          <input className="rig-name-input" value={track?.name ?? ""} onChange={(e) => editor.set(["tracks", part.track, "name"], e.target.value)} />
        </Row>
        <Row label="Pivot" hint="where it turns and scales about, in pixels from the feet, x right, y down; or drag it with the Pivot tool. The picture stays where it is on screen.">
          <PivotInput view={view} pose={sel.pose} part={k} />
        </Row>
        <Row label="Track time" hint={part.play === "restart" ? "starts again each time the sequence shows this pose" : "runs on the sequence's time, so switching poses keeps its phase"}>
          <span className="view-switch">
            {(["restart", "continue"] as const).map((p) => (
              <button key={p} className={part.play === p ? "active" : ""} onClick={() => set("play", p)}>{p === "restart" ? "Restarts" : "Continues"}</button>
            ))}
          </span>
        </Row>
        <Row label="Idle" hint={rig.idle_parts === null ? "this sprite never pauses" : "keeps animating in the battle's idle pause, while the rest stops (by layer, in every pose)"}>
          <label className="ow-check"><input type="checkbox" disabled={rig.idle_parts === null} checked={idle.has(k)}
            onChange={(e) => {
              const next = new Set(idle);
              if (e.target.checked) next.add(k);
              else next.delete(k);
              editor.set(["idle_parts"], [...next].sort((a, b) => a - b));
            }} /> idle part</label>
        </Row>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- The picture

function PictureSection({ view }: { view: RigView }) {
  const { rig, sel, select, editor } = view;
  const i = sel.picture;
  const picture = i !== null ? rig.pictures[i] : undefined;
  const newPicture = () => {
    const from = picture ?? rig.pictures[0];
    const copy: Picture = { ...from, rectangles: from.rectangles.slice(0, 1).map((r) => ({ ...r })) };
    editor.set(["pictures"], [...rig.pictures, { ...copy, objs: safeObjs(copy) }]);
    select({ picture: rig.pictures.length, rectangle: 0 });
  };
  if (!picture || i === null) {
    return (
      <section className="ow-panel-box ow-section">
        <h5>Picture <span className="muted">{rig.pictures.length} pictures</span></h5>
        <div className="ow-section-actions"><button onClick={newPicture}>+ New picture</button></div>
        <p className="muted ow-note">A picture is what a part shows: one or two rectangles of the sheet. Click one on the sheet.</p>
      </section>
    );
  }
  const uses = pictureUses(rig, i);
  const tracks = [...new Set(uses.map((u) => u.track))];
  const setRectangles = (rectangles: Rectangle[], phase: Phase = "typed") => editor.set(["pictures", i], withRectangles(picture, rectangles), phase);
  const setRect = (k: number, patch: Partial<Rectangle>, phase: Phase) => setRectangles(picture.rectangles.map((r, j) => (j === k ? { ...r, ...patch } : r)), phase);
  return (
    <section className="ow-panel-box ow-section">
      <h5>Picture {i} <span className="muted">{picture.rectangles.length} rectangle{picture.rectangles.length > 1 ? "s" : ""} · shown by {tracks.length ? tracks.map((t) => rig.tracks[t].name).join(", ") : "no key"}</span></h5>
      <div className="ow-section-actions">
        {picture.rectangles.length < 2
          ? <button title="A second rectangle, drawn in front of the first (eyes over a head)" onClick={() => {
              const r = picture.rectangles[0];
              setRectangles([...picture.rectangles, { sheet: [r.sheet[0], r.sheet[1]], size: [8, 8], at: [r.at[0], r.at[1]] }]);
              select({ rectangle: 1 });
            }}>+ Second rectangle</button>
          : <button onClick={() => { setRectangles(picture.rectangles.slice(0, 1)); select({ rectangle: 0 }); }}>Remove the second</button>}
        <button onClick={newPicture} title="A new picture, a copy of this one's first rectangle, to move on the sheet">+ New picture</button>
        <button disabled={uses.length > 0} title={uses.length ? "Keys show it: show another picture there first" : "Removes it; later pictures' numbers go down by one"}
          onClick={() => {
            // (an armature's key poses show pictures too: renumbered the same way)
            if (view.source && view.sourceEditor) view.sourceEditor.set(["bones"], sourceWithoutPicture(view.source, i).bones);
            editor.replace(removePicture(rig, i));
            select({ picture: null });
          }}>Remove</button>
      </div>
      {picture.rectangles.map((r, k) => {
        const problem = sizeProblem(r.size[0], r.size[1]);
        const past = r.sheet[0] + r.size[0] > 256 || r.sheet[1] + r.size[1] > 128;
        return (
          <div key={k} className={`rig-rect${sel.rectangle === k ? " selected" : ""}`} onClick={() => select({ rectangle: k })}>
            <div className="muted small">{k ? "Second rectangle, in front" : "First rectangle"}</div>
            <div className="ow-condition">
              <Row label="On the sheet" hint={past ? "⚠ past the 256×128 sheet: it shows the sheet mirrored there" : "its top left; drag it on the sheet (snaps to 8, Alt for 1)"}>
                <PairInput value={r.sheet} labels={["x", "y"]} onChange={(v, p) => setRect(k, { sheet: [Math.max(0, Math.round(v[0])), Math.max(0, Math.round(v[1]))] }, p)} />
              </Row>
              <Row label="Size" hint={problem && r.size[0] ? `⚠ ${problem}` : "whole tiles; a 64 side needs 32 or 64 across"}>
                <PairInput value={r.size} labels={["w", "h"]} step={0.1} onChange={(v, p) => setRect(k, { size: [Math.max(0, Math.round(v[0])), Math.max(0, Math.round(v[1]))] }, p)} />
              </Row>
              <Row label="At" hint="its top left from the part's pivot, x right, y up">
                <PairInput value={r.at} labels={["x", "y"]} onChange={(v, p) => setRect(k, { at: [Math.round(v[0]), Math.round(v[1])] }, p)} />
              </Row>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function safeObjs(picture: Picture) {
  try {
    return generateObjs(picture);
  } catch {
    return picture.objs;
  }
}

// ---------------------------------------------------------------- The sequence's key

function SequenceKeySection({ view }: { view: RigView }) {
  const { rig, sel, select, editor, clock } = view;
  const n = Math.min(clock.state.sequence, rig.sequences.length - 1);
  const seq = rig.sequences[n];
  const k = sel.sequenceKey;
  const key = k !== null ? seq.keys[k] : undefined;
  if (!key || k === null) return null;
  const setKey = (patch: Partial<Key>, phase: Phase = "typed") => editor.set(["sequences", n, "keys", k], orderedKey({ ...key, ...patch }), phase);
  const setKeys = (keys: Key[], chosen: number) => {
    editor.set(["sequences", n, "keys"], keys);
    select({ sequenceKey: chosen });
  };
  return (
    <section className="ow-panel-box ow-section">
      <h5>Sequence key <span className="muted">{seq.name}, key {k} of {seq.keys.length} · {lengthOf(seq)} frames a loop</span></h5>
      <div className="ow-section-actions">
        <button onClick={() => setKeys([...seq.keys.slice(0, k + 1), { ...key }, ...seq.keys.slice(k + 1)], k + 1)}>Duplicate</button>
        <button disabled={seq.keys.length < 2} onClick={() => setKeys(seq.keys.filter((_, i) => i !== k), Math.max(0, k - 1))}>Delete</button>
      </div>
      <div className="ow-condition">
        <Row label="Pose" hint="the whole Pokémon's set of parts shown">
          <select value={key.pose ?? 0} onChange={(e) => { setKey({ pose: Number(e.target.value) }); select({ pose: Number(e.target.value), part: null, key: null }); }}>
            {rig.poses.map((p, i) => <option key={i} value={i}>pose {i}: {p.parts.length} parts</option>)}
          </select>
        </Row>
        <Row label="Frames" hint={`held ${(key.frames / 60).toFixed(2)} s`}>
          <ScrubNumber label="⇔" value={key.frames} step={0.5} digits={0} onChange={(v, p) => setKey({ frames: Math.max(0, Math.min(65535, Math.round(v))) }, phaseOf(p))} />
        </Row>
        {seq.key_type === "srt" && (
          <>
            <Row label="Turn" hint="the whole sprite, degrees clockwise">
              <ScrubNumber label="°" value={Math.round(signedDegrees(key.rotation ?? 0) * 100) / 100} step={0.5} digits={2} onChange={(v, p) => setKey({ rotation: fromDegrees(v) }, phaseOf(p))} />
            </Row>
            <Row label="Scale">
              <PairInput value={key.scale ?? [1, 1]} labels={["x", "y"]} step={0.01} digits={3} onChange={(v, p) => setKey({ scale: [fixedScale(v[0]), fixedScale(v[1])] }, p)} />
            </Row>
          </>
        )}
        {seq.key_type !== "plain" && (
          <Row label="Move" hint="the whole sprite, pixels, y down">
            <PairInput value={key.move ?? [0, 0]} labels={["x", "y"]} onChange={(v, p) => setKey({ move: [Math.round(v[0]), Math.round(v[1])] }, p)} />
          </Row>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Poses

/** Copying a pose to another (or making a new pose from one): its parts, pivots, layer order and which tracks they play. */
function PosesSection({ view, onMessage }: { view: RigView; onMessage(message: string): void }) {
  const { rig, sel, editor, select, source } = view;
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | "new">("new");
  const [duplicate, setDuplicate] = useState(true);
  const a = Math.min(from ?? sel.pose, rig.poses.length - 1);
  const b = to === "new" || to === a || to >= rig.poses.length ? "new" : to;
  const dup = duplicate && !source;
  const run = () => {
    if (b !== "new" && !confirm(`Replace pose ${b} (${rig.poses[b].parts.length} parts) with a copy of pose ${a} (${rig.poses[a].parts.length} parts)? `
      + `${dup ? "Its parts get copies of pose " + a + "'s tracks, so its animation can differ." : "Both poses play the same tracks, so editing one's animation changes both."} Undo takes it back.`)) return;
    const target = b === "new" ? rig.poses.length : b;
    const next = copyPose(rig, a, target, dup);
    if (dup) editor.replace(next);
    else {
      editor.set(["poses"], next.poses);
      if (JSON.stringify(next.idle_parts) !== JSON.stringify(rig.idle_parts)) editor.set(["idle_parts"], next.idle_parts);
    }
    select({ pose: target, part: null, key: null });
    onMessage(`${b === "new" ? `Made pose ${target}` : `Pose ${target} is now`} a copy of pose ${a}${dup ? " with tracks of its own" : ", playing the same tracks"}.${b === "new" ? " Show it in a sequence key (Pose, in the Sequence key panel, or the timeline's pose row) to see it play." : ""} Save to keep it.`);
  };
  return (
    <section className="ow-panel-box ow-section">
      <h5>Actions <span className="muted">{rig.poses.length} (the file's poses)</span></h5>
      <div className="ow-condition">
        <Row label="Copy action" hint="its parts, pivots, layer order and the tracks they play">
          <select value={a} onChange={(e) => setFrom(Number(e.target.value))}>
            {rig.poses.map((p, i) => <option key={i} value={i}>pose {i} ({p.parts.length} parts)</option>)}
          </select>
          <span className="muted">to</span>
          <select value={b} onChange={(e) => setTo(e.target.value === "new" ? "new" : Number(e.target.value))}>
            <option value="new">a new pose</option>
            {rig.poses.map((p, i) => i === a ? null : <option key={i} value={i}>pose {i} (replaces it)</option>)}
          </select>
        </Row>
        <Row label="Tracks" hint={source ? "with an armature the copy plays the same tracks (their bones are shared)" : dup ? "pose copies get their own tracks: animate them differently without changing the original" : "the same tracks: an edit to a key shows in both poses"}>
          <span className="view-switch">
            <button className={dup ? "active" : ""} disabled={!!source} onClick={() => setDuplicate(true)}>Duplicate the tracks</button>
            <button className={!dup ? "active" : ""} onClick={() => setDuplicate(false)}>Share the tracks</button>
          </span>
        </Row>
      </div>
      <div className="ow-section-actions">
        <button className="primary" disabled={rig.poses.length < 1} onClick={run}>{b === "new" ? `+ New pose (copy of pose ${a})` : `Copy pose ${a} to pose ${b}…`}</button>
      </div>
    </section>
  );
}
