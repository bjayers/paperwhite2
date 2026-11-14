// The new Rig Editor's side panel in Timeline mode (rig-editor-v2.md, "Built: step 4"), laid out as the Ambients
// panel: the sequences to put on the strip (drag one onto it, or + Add; how often each plays, "not played"), the chosen
// clip (its sequence, how many times in a row, open it, move it, delete it), and the battle's pause (Pauses in battle,
// and each part's Keeps moving: the idle parts that go on animating while the rest freezes).

import { ScrubNumber, type ScrubPhase } from "../overworld/ScrubNumber.tsx";
import { hue } from "./context.ts";
import { boneTree, layersOfSetup } from "./setup.ts";
import { keyCount } from "./sequences.ts";
import { addClip, cantDeleteClip, clipsOf, deleteClip, keepsMovingOf, moveClip, playCount, setKeepsMoving, setPause, setRepeat, stripFrames } from "./timeline.ts";
import { SEQUENCE_DRAG, sequenceColour } from "./StripTimeline.tsx";
import { Row } from "./SetupPanel.tsx";
import type { SetupView } from "./setupContext.ts";
import type { Sizes } from "./sizes.ts";

const seconds = (frames: number) => `${(frames / 60).toFixed(2)} s`;

// ---------------------------------------------------------------- The sequences to place

export function StripSequencesSection({ view, onOpen, onAdded }: { view: SetupView; onOpen(s: number): void; onAdded(clip: number): void }) {
  const { src, commit, readOnly, say } = view;
  const add = (s: number) => {
    const next = addClip(src, s);
    commit(next);
    onAdded(clipsOf(next).length - 1);
    say(`Added ${src.sequences[s].name} at the end of the timeline.`);
  };
  return (
    <section className="ow-panel-box ow-section">
      <h5>Sequences <span className="muted">drag one onto the timeline</span></h5>
      <div className="rig-outliner">
        {src.sequences.map((seq, i) => {
          const uses = playCount(src, i);
          const keys = keyCount(seq);
          return (
            <div key={i} className="rig-outliner-row" draggable={!readOnly}
                 onDragStart={(e) => { e.dataTransfer.setData(SEQUENCE_DRAG, String(i)); e.dataTransfer.effectAllowed = "copy"; }}
                 title="Drag onto the timeline to add it there; double-click to open it in Sequences mode" onDoubleClick={() => onOpen(i)}>
              <span className="rig-grip">⠿</span>
              <span className="rig-swatch" style={{ background: sequenceColour(i) }} />
              <b>{seq.name}</b>
              <span className="muted">{seq.frames} f · {keys ? `${keys} key${keys > 1 ? "s" : ""}` : "default pose"}</span>
              <span className="spacer" />
              <span className={uses ? "muted" : "rig-not-played"} title={uses ? `The timeline plays it ${uses} time${uses > 1 ? "s" : ""} a loop` : "The battle never shows it: add it to the timeline"}>
                {uses ? `played ×${uses}` : "not played"}
              </span>
              <button className="small" disabled={readOnly} onClick={() => add(i)} title="Add it at the end of the timeline">+ Add</button>
            </div>
          );
        })}
      </div>
      <p className="muted ow-note">Each clip is an instance: editing a sequence (double-click it, or Sequences at the top) changes every clip of it.
        Repeats cost almost nothing (one 8-byte key each); the sequence's tracks are stored once.</p>
    </section>
  );
}

// ---------------------------------------------------------------- The chosen clip

export function ClipSection({ view, clip, onChoose, onOpen, sizes }: { view: SetupView; clip: number | null; onChoose(c: number | null): void; onOpen(s: number): void; sizes: Sizes | null }) {
  const { src, commit, readOnly } = view;
  const clips = clipsOf(src);
  const total = stripFrames(src);
  const k = clip !== null ? clips[clip] : undefined;
  const head = (
    <h5>Timeline <span className="muted">{clips.length} clip{clips.length === 1 ? "" : "s"}, {src.timeline.blocks.length} block{src.timeline.blocks.length === 1 ? "" : "s"}, {total} frames ({seconds(total)}) a loop</span></h5>
  );
  if (!k) {
    return (
      <section className="ow-panel-box ow-section">
        {head}
        <p className="muted ow-note">Click a clip on the timeline to choose it. The battle plays the strip from left to right and loops; at each loop's end it may pause
          (below).{sizes ? ` The strip itself is ${sizes.multi_animations} bytes of the side's ${(sizes.resident / 1024).toFixed(1)} KB.` : ""}</p>
      </section>
    );
  }
  const seq = src.sequences[k.sequence];
  const why = cantDeleteClip(src, clip!);
  const setCount = (n: number, ph: ScrubPhase) => !readOnly && commit(setRepeat(src, clip!, n), ph);
  return (
    <section className="ow-panel-box ow-section">
      {head}
      <div className="ow-section-actions">
        <button onClick={() => onOpen(k.sequence)} title="Edit the sequence in Sequences mode: every clip of it changes">Open {seq?.name}</button>
        <button disabled={readOnly || clip === 0} onClick={() => { commit(moveClip(src, clip!, clip! - 1)); onChoose(clip! - 1); }} title="Move the clip one place earlier">◀ Earlier</button>
        <button disabled={readOnly || clip === clips.length - 1} onClick={() => { commit(moveClip(src, clip!, clip! + 2)); onChoose(clip! + 1); }} title="Move the clip one place later">Later ▶</button>
        <button disabled={readOnly || !!why} title={why ?? "Delete the clip (all its repeats) from the timeline (Delete)"} onClick={() => { commit(deleteClip(src, clip!)); onChoose(null); }}>Delete clip</button>
      </div>
      <div className="ow-condition">
        <Row label="Sequence"><span className="rig-swatch" style={{ background: sequenceColour(k.sequence) }} /> <b>{seq?.name}</b></Row>
        <Row label="Repeats" hint="times in a row (×4: four instances)">
          <ScrubNumber label="×" value={k.count} step={1} digits={0} onChange={setCount} />
          <button className="small" disabled={readOnly || k.count <= 1} onClick={() => commit(setRepeat(src, clip!, k.count - 1))}>−1</button>
          <button className="small" disabled={readOnly} onClick={() => commit(setRepeat(src, clip!, k.count + 1))}>+1</button>
        </Row>
        <Row label="Length" hint={k.frames === seq?.frames ? "a clip plays its sequence's full length (change it in Sequences)" : "an original's block, playing its own length"}>
          <span>{k.frames} frames{k.count > 1 ? ` × ${k.count} = ${k.frames * k.count}` : ""} ({seconds(k.frames * k.count)})</span>
        </Row>
        <Row label="Starts at"><span>frame {k.at} of {total}</span></Row>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- The battle's pause

export function PauseSection({ view }: { view: SetupView }) {
  const { src, commit, readOnly, sel, select } = view;
  const keeps = new Set(keepsMovingOf(src));
  const inLayers = new Set(layersOfSetup(src));
  const bones = boneTree(src).filter((t) => inLayers.has(t.bone));
  return (
    <section className="ow-panel-box ow-section">
      <h5>Battle pause <span className="muted">{src.pause ? (keeps.size ? `${keeps.size} part${keeps.size > 1 ? "s" : ""} keep${keeps.size > 1 ? "" : "s"} moving` : "everything freezes") : "never pauses"}</span></h5>
      <div className="ow-condition">
        <Row label="Pauses in battle" hint={src.pause ? "at a loop's end, now and then (as vanilla sprites), for 48 to 64 frames" : "the sprite never stops (a few vanilla sprites do this)"}>
          <label className="ow-check"><input type="checkbox" checked={src.pause} disabled={readOnly} onChange={(e) => commit(setPause(src, e.target.checked))} /> {src.pause ? "On" : "Off"}</label>
        </Row>
      </div>
      <h6 className="rig-sub-head">Keeps moving <span className="muted">during the pause</span></h6>
      <div className="rig-outliner">
        {bones.map(({ bone: b, depth }) => (
          <div key={b} className={`rig-outliner-row${sel.bones[0] === b ? " selected" : sel.bones.includes(b) ? " multi" : ""}`} style={{ paddingLeft: 6 + depth * 12 }}
               onClick={() => select({ bones: [b] })}>
            <span className="rig-swatch" style={{ background: hue(b, 70, 70) }} />
            <span>{src.bones[b].name}</span>
            <span className="spacer" />
            <label className="ow-check" onClick={(e) => e.stopPropagation()} title="On: this part goes on animating while the rest of the sprite is paused (a flame, a blink)">
              <input type="checkbox" checked={keeps.has(b)} disabled={readOnly || !src.pause} onChange={(e) => commit(setKeepsMoving(src, b, e.target.checked))} /> Keeps moving
            </label>
          </div>
        ))}
      </div>
      <p className="muted ow-note">{src.pause
        ? "During the pause the sprite holds the strip's first frame; a part that keeps moving plays its track on (Charizard's flame). Preview a battle pause under the preview to see it."
        : "Turn Pauses in battle on to choose parts that keep moving."}</p>
    </section>
  );
}
