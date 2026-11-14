// The new Rig Editor's loop clips in the Sequences mode's side panel (rig-editor-v2.md, "Built: step 5"), laid out as the
// Ambients panel: the list (add, duplicate, delete; drag one onto a part's row of the timeline to place it; Edit opens
// its own timeline), the clip being edited (its name, length, its step and where it is placed), and the chosen part's
// clips in the open sequence (their starts, removing one, "+ Loop clip"). The edits are loopClips.ts's.

import { useMemo, useState } from "react";
import { ScrubNumber, type ScrubPhase } from "../overworld/ScrubNumber.tsx";
import { addLoopClip, CLIP_STEPS, clipCost, clipFits, clipStepOf, clipUses, deleteLoopClip, duplicateLoopClip, placeClip, renameLoopClip, setClipFrames,
         setClipStart, setClipStep, unplaceClip, unrolledFrames, usesOn } from "./loopClips.ts";
import { NameInput, Row } from "./SetupPanel.tsx";
import { LOOP_CLIP_DRAG } from "./SequenceTimeline.tsx";
import type { SetupView } from "./setupContext.ts";
import { hue } from "./context.ts";

const seconds = (frames: number) => `${(frames / 60).toFixed(2)} s`;

// ---------------------------------------------------------------- The list

export function LoopClipsSection({ view, chosen, editing, onChoose, onEdit }: {
  view: SetupView; chosen: number | null; editing: number | null; onChoose(c: number | null): void; onEdit(c: number): void;
}) {
  const { src, commit, readOnly, say } = view;
  const clips = src.loop_clips ?? [];
  const pick = editing ?? chosen;
  const costs = useMemo(() => clips.map((_, c) => clipCost(src, c)), [src, clips]);
  return (
    <section className="ow-panel-box ow-section">
      <h5>Loop clips <span className="muted">{clips.length ? `${clips.length}, shared by the sequences` : "none yet"}</span></h5>
      <div className="ow-section-actions">
        <button disabled={readOnly} title="A new loop clip of 12 frames (keys every 3): a fire's flicker, a blink. It opens for editing; then drag it onto a part"
                onClick={() => {
                  const r = addLoopClip(src);
                  commit(r.src);
                  onChoose(r.clip);
                  onEdit(r.clip);
                  say(`Added ${r.src.loop_clips![r.clip].name}: key its pictures (or a small move, turn or scale) on its own timeline, then place it on a part.`);
                }}>+ Loop clip</button>
        <button disabled={readOnly || pick === null} title="A copy of the chosen clip (placed nowhere yet)"
                onClick={() => { const r = duplicateLoopClip(src, pick!); commit(r.src); onChoose(r.clip); }}>Duplicate</button>
        <button disabled={readOnly || pick === null} title="Delete the chosen clip, and take it off every part it's placed on"
                onClick={() => {
                  const uses = clipUses(src, pick!).length;
                  if (uses && !confirm(`Delete ${clips[pick!].name}? It comes off the ${uses} part${uses > 1 ? "s" : ""} it's placed on. Undo brings it back.`)) return;
                  commit(deleteLoopClip(src, pick!));
                  onChoose(null);
                }}>Delete</button>
      </div>
      {clips.length > 0 && (
        <div className="rig-outliner">
          {clips.map((clip, c) => {
            const uses = clipUses(src, c);
            const parts = new Set(uses.map((u) => u.bone)).size;
            return (
              <div key={c} className={`rig-outliner-row rig-clip-row${pick === c ? " selected" : ""}${editing === c ? " editing" : ""}`}
                   draggable={!readOnly && editing === null} onDragStart={(e) => { e.dataTransfer.setData(LOOP_CLIP_DRAG, String(c)); e.dataTransfer.effectAllowed = "copy"; }}
                   onClick={() => onChoose(c)} onDoubleClick={() => onEdit(c)}
                   title={editing === null ? "Drag onto a part's row of the timeline to place it there; double-click (or Edit) to edit its keys" : "Double-click to edit this one instead"}>
                <span className="rig-grip">⠿</span>
                <span className="rig-swatch" style={{ background: hue(c + 3, 55, 45) }} />
                <b>{clip.name}</b>
                <span className="muted">{clip.frames} f · keys every {clipStepOf(clip)}</span>
                <span className="muted">{clip.keys.length} key{clip.keys.length > 1 ? "s" : ""}</span>
                <span className="spacer" />
                <span className={uses.length ? "muted" : "rig-not-played"} title={uses.length ? `Placed ${uses.length} time${uses.length > 1 ? "s" : ""}: it adds ${costs[c] ?? "?"} bytes to the side's files (each change of picture or value is a key)` : "Not placed on any part: it plays nowhere"}>
                  {uses.length ? `on ${parts} part${parts > 1 ? "s" : ""} · +${costs[c] ?? "?"} B` : "not placed"}
                </span>
                {editing !== c && <button className="small" onClick={(e) => { e.stopPropagation(); onEdit(c); }} title="Edit its keys on its own timeline">Edit</button>}
              </div>
            );
          })}
        </div>
      )}
      <p className="muted ow-note">A loop clip plays on a part on its own rhythm, looping, under the sequence's keys: pictures swapped for a flickering fire,
        a blink, a small twitch. Its moves and turns add to the part's, its scales multiply. Drag one onto a part's row of the timeline, or use + Loop clip in Part.</p>
    </section>
  );
}

// ---------------------------------------------------------------- The clip being edited

export function LoopClipSection({ view, clip: c, part, onPart, onDone, onOpenSequence }: {
  view: SetupView; clip: number; part: number | null; onPart(b: number): void; onDone(): void; onOpenSequence(s: number, b: number): void;
}) {
  const { src, commit, readOnly } = view;
  const clip = src.loop_clips?.[c];
  if (!clip) return null;
  const step = clipStepOf(clip);
  const uses = clipUses(src, c);
  const setFrames = (n: number, ph: ScrubPhase) => !readOnly && commit(setClipFrames(src, c, Math.max(1, Math.round(n))), ph);
  const late = clip.keys.filter((k) => k.frame >= clip.frames).length;
  return (
    <section className="ow-panel-box ow-section">
      <h5>Loop clip <span className="muted">{clip.name}, {clip.frames} frames ({seconds(clip.frames)}), looping</span></h5>
      <div className="ow-section-actions">
        <button className="primary" onClick={onDone} title="Back to the sequence (Escape)">Done</button>
      </div>
      <div className="ow-condition">
        <Row label="Name"><NameInput value={clip.name} disabled={readOnly} onCommit={(n) => commit(renameLoopClip(src, c, n))} /></Row>
        <Row label="Length" hint={late ? `${late} key${late > 1 ? "s are" : " is"} past the end and never play${late > 1 ? "" : "s"}` : `frames; it loops (a sequence of ${clip.frames * 4} plays it 4 times)`}>
          <ScrubNumber label="f" value={clip.frames} step={1} digits={0} onChange={setFrames} />
          <button className="small" disabled={readOnly || clip.frames <= step} onClick={() => commit(setClipFrames(src, c, clip.frames - step))}>−{step}</button>
          <button className="small" disabled={readOnly} onClick={() => commit(setClipFrames(src, c, clip.frames + step))}>+{step}</button>
        </Row>
        <Row label="Keys every" hint="frames: the clip's own snap. Sequences go by 6, Game Freak's rhythm; a flicker usually wants 2 to 4 (3 by default). A clip that curves is sampled this often too.">
          <span className="view-switch">
            {CLIP_STEPS.map((n) => <button key={n} className={step === n ? "active" : ""} disabled={readOnly} onClick={() => commit(setClipStep(src, c, n))}>{n}</button>)}
          </span>
        </Row>
        <Row label="Shown on" hint="the part the preview plays it on (its pictures and pivot)">
          <select value={part ?? ""} onChange={(e) => onPart(Number(e.target.value))}>
            {src.bones.map((b, i) => <option key={i} value={i}>{b.name}</option>)}
          </select>
        </Row>
      </div>
      <h5>Placed on <span className="muted">{uses.length ? `${uses.length} part${uses.length > 1 ? "s" : ""} of sequences` : "nothing yet"}</span></h5>
      <div className="rig-clip-uses">
        {uses.map((u, i) => {
          const seq = src.sequences[u.sequence];
          const fits = clipFits(seq.frames, clip.frames);
          return (
            <div key={i} className="rig-clip-use">
              <b>{seq.name}</b> <span>{src.bones[u.bone]?.name}</span>
              <span className="muted">from frame {usesOn(src, u.sequence, u.bone)[u.index]?.start ?? 0}</span>
              {!fits && <span className="pkm-error" title={`The clip's ${clip.frames} frames don't go into the sequence's ${seq.frames}: each play of the sequence restarts the clip part way (a hitch), and the part's track is baked over ${unrolledFrames(seq.frames, clip.frames)} frames (bigger).`}>⚠ {seq.frames} isn't a multiple of {clip.frames}</span>}
              <button className="small" onClick={() => onOpenSequence(u.sequence, u.bone)} title="Open that sequence with the part chosen">Open</button>
            </div>
          );
        })}
      </div>
      {!uses.length && <p className="muted ow-note">Done, then drag it from the list onto a part's row of a sequence's timeline (or the Part section's + Loop clip).</p>}
    </section>
  );
}

// ---------------------------------------------------------------- The chosen part's clips in the open sequence

export function PartClipsRows({ view, sequence: s, bone: b, onEdit }: { view: SetupView; sequence: number; bone: number; onEdit(c: number): void }) {
  const { src, commit, readOnly, say } = view;
  const [adding, setAdding] = useState("");
  const clips = src.loop_clips ?? [];
  const uses = usesOn(src, s, b);
  const seq = src.sequences[s];
  if (!seq) return null;
  return (
    <Row label="Loop clips" hint={uses.length ? "playing on it from the frame given, looping, under its keys" : clips.length ? "none on this part" : "make one in Loop clips below"}>
      <span className="rig-clip-uses">
        {uses.map((u, index) => {
          const clip = clips[u.clip];
          if (!clip) return null;
          const fits = clipFits(seq.frames, clip.frames);
          return (
            <span key={index} className="rig-clip-use">
              <span className="rig-swatch" style={{ background: hue(u.clip + 3, 55, 45) }} />
              <b>{clip.name}</b>
              <ScrubNumber label="from" value={u.start ?? 0} step={1} digits={0}
                           onChange={(n, ph) => !readOnly && commit(setClipStart(src, s, b, index, Math.round(n)), ph)} />
              {!fits && <span className="pkm-error" title={`${clip.frames} frames don't go into the sequence's ${seq.frames}: baked over ${unrolledFrames(seq.frames, clip.frames)} frames`}>⚠</span>}
              <button className="small" onClick={() => onEdit(u.clip)} title="Edit the clip (every part it's on changes)">Edit</button>
              <button className="small" disabled={readOnly} onClick={() => commit(unplaceClip(src, s, b, index))} title="Take it off this part">✕</button>
            </span>
          );
        })}
        {clips.length > 0 && (
          <select value={adding} disabled={readOnly} title="Place a loop clip on this part in this sequence"
                  onChange={(e) => {
                    const c = Number(e.target.value);
                    setAdding("");
                    if (!clips[c]) return;
                    commit(placeClip(src, s, b, c).src);
                    say(`Placed ${clips[c].name} on ${src.bones[b].name}: it loops every ${clips[c].frames} frames under the part's keys.`);
                  }}>
            <option value="">+ Loop clip…</option>
            {clips.map((clip, c) => <option key={c} value={c}>{clip.name} ({clip.frames} f)</option>)}
          </select>
        )}
      </span>
    </Row>
  );
}
