// The new Rig Editor's timeline strip (rig-editor-v2.md, "Built: step 4"), docked at the bottom in Timeline mode: the
// game's sequence 0 (the loop the battle plays) as clips like a video editor's, each a run of instances of one sequence,
// as wide as it plays, in the sequence's colour. Drag a sequence from the side panel's list onto the strip to add it
// there; drag a clip to move it; click to choose it, double-click to open its sequence in Sequences mode; Delete deletes
// the chosen clip. The ruler and the playhead run over the whole strip; the clip playing is lit.

import { useRef, useState } from "react";
import { hue, useClock } from "./context.ts";
import type { Clock } from "./player.ts";
import { addClip, clipAt, clipsOf, moveClip, stripFrames } from "./timeline.ts";
import { STEP } from "./v2.ts";
import type { SetupView } from "./setupContext.ts";

/** The drag's types: a sequence from the list (its number), a clip of the strip (its index). */
export const SEQUENCE_DRAG = "application/x-rig-sequence";
const CLIP_DRAG = "application/x-rig-clip";
const PAD = 10;

/** A sequence's colour on the strip and in the lists. */
export const sequenceColour = (s: number, l = 62) => hue(s * 3 + 1, 55, l);

export function StripTimeline({ view, clock, scale, chosen, onChoose, onOpen }: {
  view: SetupView; clock: Clock; scale: number; chosen: number | null; onChoose(clip: number | null): void; onOpen(sequence: number): void;
}) {
  const { src, commit, readOnly, say } = view;
  const state = useClock(clock, (st) => st);
  const time = Math.floor(state.time);
  const total = stripFrames(src);
  const clips = clipsOf(src);
  const playing = state.pause ? null : clipAt(src, time);
  const [drop, setDrop] = useState<number | null>(null);
  const lane = useRef<HTMLDivElement>(null);
  const width = PAD * 2 + Math.max(total, STEP) * scale + 120;
  const xOf = (frame: number) => PAD + frame * scale;

  /** Where a drop at a point goes: before the clip whose middle is right of it. */
  const dropAt = (clientX: number) => {
    const r = lane.current!.getBoundingClientRect();
    const f = (clientX - r.left - PAD) / scale;
    const i = clips.findIndex((k) => f < k.at + (k.count * k.frames) / 2);
    return i < 0 ? clips.length : i;
  };
  const onDragOver = (e: React.DragEvent) => {
    if (readOnly || !(e.dataTransfer.types.includes(SEQUENCE_DRAG) || e.dataTransfer.types.includes(CLIP_DRAG))) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes(CLIP_DRAG) ? "move" : "copy";
    setDrop(dropAt(e.clientX));
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const at = dropAt(e.clientX);
    setDrop(null);
    const seq = e.dataTransfer.getData(SEQUENCE_DRAG), clip = e.dataTransfer.getData(CLIP_DRAG);
    if (seq !== "") {
      const s = Number(seq);
      commit(addClip(src, s, at));
      say(`Added ${src.sequences[s]?.name} to the timeline: the battle plays it there.`);
      onChoose(null);
    } else if (clip !== "") {
      const from = Number(clip);
      const next = moveClip(src, from, at);
      if (next !== src) {
        commit(next);
        onChoose(null);
      }
    }
  };

  const seekAt = (clientX: number) => {
    const r = lane.current!.getBoundingClientRect();
    const f = Math.round((clientX - r.left - PAD) / scale / STEP) * STEP;
    clock.play(false);
    clock.seek(Math.max(0, Math.min(Math.max(0, total - 1), f)), 0);
  };
  const scrub = (e: React.PointerEvent) => {
    e.preventDefault();
    seekAt(e.clientX);
    const move = (ev: PointerEvent) => seekAt(ev.clientX);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const every = scale >= 4 ? 30 : scale >= 2 ? 60 : 120;
  const ticks: { at: number; label: string | null }[] = [];
  for (let f = 0; f <= total + STEP * 4; f += STEP) ticks.push({ at: f, label: f % every === 0 ? `${f}` : null });

  return (
    <div className="rig-strip">
      <div className="rig-strip-scroll">
        <div className="rig-strip-inner" style={{ width }}>
          <div className="rig-sq-ruler rig-strip-ruler" onPointerDown={scrub} title="Press or drag to move the playhead over the strip (by 6)">
            {ticks.map((t) => <span key={t.at} className={`rig-tick${t.label ? " major" : ""}`} style={{ left: xOf(t.at) }}>{t.label}</span>)}
            <span className="rig-strip-end" style={{ left: xOf(total) }} title={`The loop's end: ${total} frames. The battle may pause here.`}>↻</span>
            <span className="rig-sq-playhead-cap" style={{ left: xOf(time) }} />
          </div>
          <div ref={lane} className={`rig-strip-lane${drop !== null ? " dropping" : ""}`} onDragOver={onDragOver} onDragLeave={() => setDrop(null)} onDrop={onDrop}
               onPointerDown={(e) => { if (e.target === e.currentTarget) onChoose(null); }}>
            {clips.map((k, i) => {
              const seq = src.sequences[k.sequence];
              const name = seq?.name ?? `sequence ${k.sequence}`;
              const lit = playing?.clip === i;
              return (
                <div key={`${k.block}-${k.sequence}`} className={`rig-clip${chosen === i ? " selected" : ""}${lit ? " playing" : ""}`}
                     style={{ left: xOf(k.at), width: Math.max(8, k.count * k.frames * scale - 2), background: sequenceColour(k.sequence, 40), borderColor: sequenceColour(k.sequence, 62) }}
                     draggable={!readOnly}
                     onDragStart={(e) => { e.dataTransfer.setData(CLIP_DRAG, String(i)); e.dataTransfer.effectAllowed = "move"; onChoose(i); }}
                     onDragEnd={() => setDrop(null)}
                     onClick={() => onChoose(i)}
                     onDoubleClick={() => onOpen(k.sequence)}
                     title={`${name}${k.count > 1 ? ` ×${k.count}` : ""}: ${k.frames} frames each${k.count > 1 ? `, ${k.count * k.frames} in all` : ""}, from frame ${k.at}. `
                       + "Click to choose it, drag to move it, double-click to open the sequence (editing it changes every instance)."}>
                  {Array.from({ length: k.count - 1 }, (_, n) => <span key={n} className="rig-clip-cut" style={{ left: (n + 1) * k.frames * scale - 1 }} />)}
                  {lit && <span className="rig-clip-now" style={{ left: playing!.instance * k.frames * scale, width: k.frames * scale - 2 }} />}
                  <span className="rig-clip-label"><b>{name}</b>{k.count > 1 && <span className="rig-clip-count">×{k.count}</span>}</span>
                  <span className="rig-clip-frames">{k.count * k.frames} f</span>
                </div>
              );
            })}
            {drop !== null && <span className="rig-strip-drop" style={{ left: xOf(drop < clips.length ? clips[drop].at : total) - 2 }} />}
            <span className="rig-playhead" style={{ left: xOf(time) }} />
          </div>
        </div>
      </div>
    </div>
  );
}
