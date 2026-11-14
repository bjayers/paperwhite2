// The new Rig Editor's side panel in Sequences mode (rig-editor-v2.md, "Built: step 3"), laid out as the Ambients
// panel: the sequences list (open one; add, duplicate, delete, drag to reorder), the open sequence (its name, its
// length in steps of 6, Reset sequence), and the chosen part at the playhead (its key there, or its values there:
// changing one keys it at the playhead's frame; the picture and Hidden per key; the curve to the next key).

import { useState } from "react";
import { ScrubNumber, type ScrubPhase } from "../overworld/ScrubNumber.tsx";
import { addSequence, cantDelete, deleteKeys, deleteSequence, duplicateSequence, keyCount, keyParts, laneOf, moveSequence, partValues, refId, renameSequence,
         resetSequence, sequenceBones, setCurve, setLength, START } from "./sequences.ts";
import { parentOf } from "./setup.ts";
import { snapLength, STEP, V2_CURVES, DEFAULT_CURVE } from "./v2.ts";
import { PieceThumb } from "./SetupSheet.tsx";
import { NameInput, Row } from "./SetupPanel.tsx";
import type { SetupView } from "./setupContext.ts";
import type { Curve } from "./armature.ts";
import { PLAIN_CURVES, PRESET_CURVES } from "./SequenceGraph.tsx";

const seconds = (frames: number) => `${(frames / 60).toFixed(2)} s`;
const CURVE_LABELS = new Map([...PLAIN_CURVES, ...PRESET_CURVES].map((c) => [c.curve, c.label]));

// ---------------------------------------------------------------- The list

export function SequenceListSection({ view, open, onOpen }: { view: SetupView; open: number; onOpen(s: number): void }) {
  const { src, commit, readOnly, say } = view;
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const why = cantDelete(src, open);
  return (
    <section className="ow-panel-box ow-section">
      <h5>Sequences <span className="muted">{src.sequences.length}, one open</span></h5>
      <div className="ow-section-actions">
        <button disabled={readOnly} title="A new sequence holding the default pose (48 frames), after the others"
                onClick={() => { const r = addSequence(src); commit(r.src); onOpen(r.sequence); say(`Added ${r.src.sequences[r.sequence].name}: it holds the default pose until you key it.`); }}>+ Sequence</button>
        <button disabled={readOnly} title="A copy of the open sequence (its length and keys), after it"
                onClick={() => { const r = duplicateSequence(src, open); commit(r.src); onOpen(r.sequence); }}>Duplicate</button>
        <button disabled={readOnly || !!why} title={why ?? "Delete the open sequence (and its blocks on the timeline)"}
                onClick={() => {
                  if (!confirm(`Delete ${src.sequences[open].name}? Its blocks on the timeline go with it. Undo brings it back.`)) return;
                  commit(deleteSequence(src, open));
                  onOpen(Math.max(0, open - 1));
                }}>Delete</button>
      </div>
      <div className="rig-outliner">
        {src.sequences.map((seq, i) => {
          const keys = keyCount(seq);
          const uses = src.timeline.blocks.filter((b) => b.sequence === i).length;
          return (
            <div key={i} className={`rig-outliner-row${i === open ? " selected" : ""}${over === i ? " drop" : ""}${drag === i ? " dragging" : ""}`}
                 draggable={!readOnly} onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setDrag(null); setOver(null); }}
                 onDragOver={(e) => { if (drag !== null) { e.preventDefault(); setOver(i); } }} onDragLeave={() => setOver(null)}
                 onDrop={(e) => {
                   e.preventDefault();
                   if (drag !== null && drag !== i) {
                     commit(moveSequence(src, drag, i));
                     if (open === drag) onOpen(i);
                     else if (drag < open && i >= open) onOpen(open - 1);
                     else if (drag > open && i <= open) onOpen(open + 1);
                   }
                   setDrag(null); setOver(null);
                 }}
                 onClick={() => onOpen(i)} title="Click to open it; drag to reorder">
              <span className="rig-grip">⠿</span>
              <b>{seq.name}</b>
              <span className="muted">{seq.frames} f · {seconds(seq.frames)}</span>
              <span className="muted">{keys ? `${keys} key${keys > 1 ? "s" : ""}` : "default pose"}</span>
              <span className="spacer" />
              <span className="muted" title={uses ? `The timeline (the game's stay loop) plays it ${uses} time${uses > 1 ? "s" : ""}: the timeline strip comes in the next step`
                : "The timeline (the game's stay loop) doesn't play it yet: the timeline strip comes in the next step"}>{uses ? `played ×${uses}` : "not played"}</span>
            </div>
          );
        })}
      </div>
      <p className="muted ow-note">Every sequence starts and ends at the default pose (the rig setup). The game plays the timeline's blocks;
        a sequence that isn't on it is kept but not shown in battle until the timeline strip (next step) places it.</p>
    </section>
  );
}

// ---------------------------------------------------------------- The open sequence

export function SequenceSection({ view, open }: { view: SetupView; open: number }) {
  const { src, commit, readOnly, select, seq: sv } = view;
  const seq = src.sequences[open];
  if (!seq || !sv) return null;
  const keys = keyCount(seq);
  const setFrames = (n: number, ph: ScrubPhase) => !readOnly && commit(setLength(src, open, sv.snap ? snapLength(n) : Math.max(1, Math.round(n))), ph);
  return (
    <section className="ow-panel-box ow-section">
      <h5>Sequence <span className="muted">{seq.name}, {seq.frames} frames ({seconds(seq.frames)})</span></h5>
      <div className="ow-section-actions">
        <button disabled={readOnly || !keys} title="Back to the default pose with no keys (its length and everything else stay)"
                onClick={() => {
                  if (!confirm(`Reset ${seq.name}? Its ${keys} key${keys > 1 ? "s" : ""} are removed, so it holds the default pose; its length and the other sequences stay. Undo brings them back.`)) return;
                  commit(resetSequence(src, open));
                  select({ keys: [] });
                }}>Reset sequence…</button>
      </div>
      <div className="ow-condition">
        <Row label="Name"><NameInput value={seq.name} disabled={readOnly} onCommit={(n) => commit(renameSequence(src, open, n))} /></Row>
        <Row label="Length" hint={`frames, in steps of ${STEP} (with Snap 6); the end key is at ${seq.frames}, the next loop's frame 0`}>
          <ScrubNumber label="f" value={seq.frames} step={1} digits={0} onChange={setFrames} />
          <button className="small" disabled={readOnly || seq.frames <= STEP} onClick={() => commit(setLength(src, open, seq.frames - STEP))}>−6</button>
          <button className="small" disabled={readOnly} onClick={() => commit(setLength(src, open, seq.frames + STEP))}>+6</button>
        </Row>
      </div>
      <p className="muted ow-note">With no keys a part holds the default pose; a key between blends default → it → default, and any number of keys can follow.
        The game samples the curves every 6 frames.</p>
    </section>
  );
}

// ---------------------------------------------------------------- The chosen part at the playhead

export function KeySection({ view, open, onMessage }: { view: SetupView; open: number; onMessage(m: string): void }) {
  const { src, sel, select, commit, readOnly, seq: sv, art, sheet, shiny } = view;
  const b = sel.bones[0];
  const bone = b !== undefined ? src.bones[b] : undefined;
  const seq = src.sequences[open];
  if (!sv || !seq) return null;
  const frame = sv.keyFrame;
  const keyAll = () => {
    const at = sv.keying();
    const r = keyParts(src, open, sequenceBones(src, open), at);
    commit(r.src);
    onMessage(r.made ? `Keyed ${r.made} part${r.made > 1 ? "s" : ""} at frame ${at}.` : `Every part already has a key at frame ${at}.`);
  };
  if (!bone) {
    return (
      <section className="ow-panel-box ow-section">
        <h5>Part <span className="muted">none chosen</span></h5>
        <div className="ow-section-actions">
          <button disabled={readOnly} onClick={keyAll} title="A key for every part at the playhead, from what each shows there (Shift+K)">◆ Key all parts <kbd>⇧K</kbd></button>
        </div>
        <p className="muted ow-note">Click a part on the preview or a row of the timeline. Move (G), Rotate (R) and Scale (S) on the preview key it at the playhead.</p>
      </section>
    );
  }
  const values = partValues(src, open, b, frame);
  const keyIndex = laneOf(seq, b)?.keys.findIndex((k) => k.frame === frame) ?? -1;
  const key = keyIndex >= 0 ? laneOf(seq, b)!.keys[keyIndex] : undefined;
  const connected = !!bone.connected && parentOf(src, b) !== null;
  const set = (change: Parameters<SetupView["pose"]>[2], ph: ScrubPhase) => {
    if (readOnly) return;
    sv.keying();
    commit(view.pose(src, b, change), ph);
  };
  const keyHere = () => {
    const at = sv.keying();
    const bones = sel.bones.length ? sel.bones : [b];
    const r = keyParts(src, open, bones, at);
    commit(r.src);
    onMessage(r.made ? `Keyed ${bones.map((x) => src.bones[x].name).join(", ")} at frame ${at}.` : `Already keyed at frame ${at}.`);
  };
  const curve: Curve = key?.curve ?? src.curve ?? DEFAULT_CURVE;
  return (
    <section className="ow-panel-box ow-section">
      <h5>Part <span className="muted">{bone.name} at frame {frame}{key ? ", keyed" : ", no key here"}{sel.bones.length > 1 ? ` (+${sel.bones.length - 1} chosen)` : ""}</span></h5>
      <div className="ow-section-actions">
        <button disabled={readOnly} onClick={keyHere} title="A key at the playhead for the chosen parts, from what they show there (K)">◇ Key <kbd>K</kbd></button>
        <button disabled={readOnly} onClick={keyAll} title="A key for every part at the playhead (Shift+K)">◆ Key all parts <kbd>⇧K</kbd></button>
        <button disabled={readOnly || !key} onClick={() => { commit(deleteKeys(src, open, [{ bone: b, index: keyIndex }]).src); select({ keys: [] }); }}
                title="Delete this part's key at the playhead">Delete key</button>
      </div>
      <p className="muted ow-note">{key ? "Its key at the playhead: changing a value changes it." : "Not keyed here: these are its values from the curves, and changing one keys it at the playhead."}</p>
      <div className="ow-condition">
        <Row label="Picture" hint="held until a key shows another (blinks, mouths); Hidden draws nothing">
          <span className="rig-sq-pictures">
            <button className={`rig-sq-pic${values.hidden ? " active" : ""}`} disabled={readOnly} onClick={() => set(() => ({ hidden: true }), "typed")} title="Hidden: the part draws nothing from here">Hidden</button>
            {src.pieces.map((p, n) => (
              <button key={n} className={`rig-sq-pic${!values.hidden && values.piece === n ? " active" : ""}`} disabled={readOnly} title={`${p.name}: show it from here`}
                      onClick={() => set(() => ({ hidden: false, piece: n }), "typed")}>
                <PieceThumb art={art} sheet={sheet} shiny={shiny} rectangles={p.rectangles} size={24} />
              </button>
            ))}
          </span>
        </Row>
        <Row label="Move" hint={connected ? "locked: a connected bone's head stays on its parent's tail" : "pixels from the default pose's place, in its parent's frame"}>
          <ScrubNumber label="X" value={Math.round(values.move[0] * 100) / 100} step={0.25} digits={0} onChange={(n, ph) => !connected && set(() => ({ move: [Math.round(n), values.move[1]] }), ph)} />
          <ScrubNumber label="Y" value={Math.round(values.move[1] * 100) / 100} step={0.25} digits={0} onChange={(n, ph) => !connected && set(() => ({ move: [values.move[0], Math.round(n)] }), ph)} />
        </Row>
        <Row label="Turn" hint="degrees about the head, clockwise">
          <ScrubNumber label="°" value={Math.round(values.rotation * 10) / 10} step={0.5} digits={1} onChange={(n, ph) => set(() => ({ rotation: n }), ph)} />
        </Row>
        <Row label="Scale" hint="both axes, or one (the gizmo's X and Y handles)">
          <ScrubNumber label="X" value={values.scale[0]} step={0.01} digits={3} onChange={(n, ph) => set(() => ({ scale: [n, values.scale[1]] }), ph)} />
          <ScrubNumber label="Y" value={values.scale[1]} step={0.01} digits={3} onChange={(n, ph) => set(() => ({ scale: [values.scale[0], n] }), ph)} />
        </Row>
        <Row label="To the next" hint={key ? "how it goes on to the next key (the graph editor sets one channel's)" : "key it here first"}>
          <select value={curve} disabled={readOnly || !key} onChange={(e) => commit(setCurve(src, open, [{ bone: b, index: keyIndex }], e.target.value as Curve))}>
            {V2_CURVES.map((c) => <option key={c} value={c}>{CURVE_LABELS.get(c) ?? c}</option>)}
          </select>
          {frame === 0 && !key && <button className="small" disabled={readOnly} onClick={() => select({ keys: [refId({ bone: b, index: START })] })}>choose the start key</button>}
        </Row>
      </div>
    </section>
  );
}
