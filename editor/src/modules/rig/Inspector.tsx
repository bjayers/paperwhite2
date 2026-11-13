// The Rig Editor's side panel, laid out as the Overworld Editor's Ambients panel is: a headed section for what is
// chosen (the key, the part, the picture, the sequence's key), each with its actions at its top, a label column beside
// the controls, numbers in the user's units (degrees, pixels, frames) whose labels drag; then the sprite's own settings.

import type { ReactNode } from "react";
import { ScrubNumber, type ScrubPhase } from "../overworld/ScrubNumber.tsx";
import { keyAt, lengthOf, sequenceKeyAt, type Key, type KeyType, type Pair, type Picture, type Rectangle, type Track } from "./mcss.ts";
import { fixedScale, fromDegrees, generateObjs, keyAs, orderedKey, partName, pictureUses, removePicture, signedDegrees, sizeProblem,
         trackUses, withRectangles, type Phase } from "./model.ts";
import { hue, type RigView } from "./context.ts";

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

export function Inspector({ view, onTimeChanged }: { view: RigView; onTimeChanged(): void }) {
  return (
    <div className="rig-inspector">
      <PartSection view={view} />
      <KeySection view={view} onTimeChanged={onTimeChanged} />
      <PictureSection view={view} />
      <SequenceKeySection view={view} />
    </div>
  );
}

// ---------------------------------------------------------------- The key

function KeySection({ view, onTimeChanged }: { view: RigView; onTimeChanged(): void }) {
  const { rig, sel, select, editor, clock } = view;
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
  return (
    <section className="ow-panel-box ow-section">
      <h5>Key <span className="muted">{track.name}{key ? `, key ${index} of ${track.keys.length}` : ""} · {track.keys.length} keys, {length} frames ({track.play})</span></h5>
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
            <button disabled={track.keys.length < 2} title="Removes the key; the keys after it start earlier" onClick={() => setKeys(track.keys.filter((_, i) => i !== index), Math.max(0, index! - 1))}>Delete</button>
          </div>
          <div className="ow-condition">
            <Row label="Picture" hint={`of ${rig.pictures.length}: what the part shows`}>
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
        <Row label="Pivot" hint="where it turns and scales about, in pixels from the feet, x right, y down; or drag it with the Pivot tool">
          <PairInput value={part.pivot} labels={["x", "y"]} onChange={(v, p) => set("pivot", [Math.round(v[0]), Math.round(v[1])], p)} />
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
          onClick={() => { editor.replace(removePicture(rig, i)); select({ picture: null }); }}>Remove</button>
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
