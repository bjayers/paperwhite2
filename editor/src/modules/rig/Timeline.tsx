// The Rig Editor's timeline: the sequence played over its loop, a row a key of it (the pose it shows and for how
// long), then a row for each part of the pose shown, front to back (the layer order; drag a name to reorder), with its
// track's keys as blocks as wide as the frames they're held, where the game plays them: from the pose's start for a
// part that restarts, on the sequence's time for one that continues; later passes of a looping track faded. Click a
// key to choose it, drag its right edge to change how long it's held (Shift: whole 6-frame steps, Game Freak's
// rhythm). A click on the ruler moves the playhead.

import { useEffect, useMemo, useRef, useState } from "react";
import { lengthOf, sequenceKeyAt } from "./mcss.ts";
import { moveLayer, partName, sequenceSegments, signedDegrees, trackSpans, type Span } from "./model.ts";
import { hue, useClock, type RigView } from "./context.ts";

const NAME_WIDTH = 210;

export function Timeline({ view, scale, follow }: { view: RigView; scale: number; follow: boolean }) {
  const { rig, sel, select, clock, editor } = view;
  const sequence = useClock(clock, (s) => Math.min(s.sequence, rig.sequences.length - 1));
  const seq = rig.sequences[sequence];
  const length = lengthOf(seq) || 1;
  const segments = useMemo(() => sequenceSegments(seq), [seq]);
  const playingPose = useClock(clock, (s) => {
    try {
      return sequenceKeyAt(rig.sequences[Math.min(s.sequence, rig.sequences.length - 1)], Math.floor(s.time)).key.pose ?? 0;
    } catch {
      return 0;
    }
  });
  useEffect(() => {
    if (follow && playingPose !== sel.pose && playingPose < rig.poses.length) {
      select({ pose: playingPose, part: sel.part !== null && sel.part < rig.poses[playingPose].parts.length ? sel.part : null, key: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingPose, follow]);
  const pose = Math.min(sel.pose, rig.poses.length - 1);
  const parts = rig.poses[pose]?.parts ?? [];
  const width = length * scale;
  const idle = new Set(rig.idle_parts ?? []);
  const [dragging, setDragging] = useState<number | null>(null);

  const seek = (e: React.MouseEvent, lane: HTMLElement) => {
    const r = lane.getBoundingClientRect();
    clock.play(false);
    clock.seek(Math.max(0, Math.min(length - 1, Math.floor((e.clientX - r.left) / scale))));
  };

  const edgeDrag = (e: React.PointerEvent, path: (string | number)[], frames: number) => {
    e.stopPropagation();
    e.preventDefault();
    const start = e.clientX;
    let moved = false;
    const move = (ev: PointerEvent) => {
      let next = Math.max(0, frames + Math.round((ev.clientX - start) / scale));
      if (ev.shiftKey) next = Math.max(6, Math.round(next / 6) * 6);
      editor.set([...path, "frames"], next, moved ? "move" : "start");
      moved = true;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const spansOf = (k: number): Span[] => {
    const part = parts[k];
    const track = rig.tracks[part.track];
    if (!track) return [];
    const out: Span[] = [];
    let first = true;
    for (const segment of segments) {
      if (segment.pose !== pose) continue;
      const local = part.play === "restart" ? 0 : segment.from;
      out.push(...trackSpans(track, segment.from, segment.to - segment.from, local, first && part.play === "restart"));
      if (part.play === "restart") first = false;
    }
    return out;
  };

  const ticks = useMemo(() => {
    const out: { at: number; label: string | null }[] = [];
    const minor = scale >= 3 ? 6 : 12;
    const major = scale >= 3 ? 60 : 120;
    for (let t = 0; t <= length; t += minor) out.push({ at: t, label: t % major === 0 ? String(t) : null });
    return out;
  }, [length, scale]);

  return (
    <div className="rig-timeline" style={{ ["--name" as string]: `${NAME_WIDTH}px` }}>
      <div className="rig-tl-scroll">
        <div className="rig-tl-grid" style={{ width: NAME_WIDTH + width + 24 }}>
          <div className="rig-tl-name rig-tl-head muted small">frames</div>
          <div className="rig-tl-lane rig-tl-ruler" style={{ width }} onMouseDown={(e) => seek(e, e.currentTarget)}>
            {ticks.map((t) => (
              <span key={t.at} className={`rig-tick${t.label ? " major" : ""}`} style={{ left: t.at * scale }}>{t.label}</span>
            ))}
            <Playhead view={view} scale={scale} length={length} />
          </div>

          <div className="rig-tl-name rig-tl-seq">
            <b>{seq.name}</b> <span className="muted small">sequence {sequence}</span>
          </div>
          <div className="rig-tl-lane" style={{ width }} onMouseDown={(e) => { if (e.target === e.currentTarget) seek(e, e.currentTarget); }}>
            {segments.map((s) => (
              <div key={s.key} className={`rig-key rig-seq-key${sel.sequenceKey === s.key ? " selected" : ""}${s.pose === pose ? " shown" : ""}`}
                   style={{ left: s.from * scale, width: Math.max((s.to - s.from) * scale, 3), ["--hue" as string]: hue(s.pose + 3, 45, 45) }}
                   title={`Key ${s.key}: pose ${s.pose} for ${s.to - s.from} frames (from ${s.from})`}
                   onMouseDown={(e) => {
                     e.stopPropagation();
                     clock.play(false);
                     clock.seek(s.from);
                     select({ sequenceKey: s.key, key: null, pose: Math.min(s.pose, rig.poses.length - 1) });
                   }}>
                <span className="rig-key-text">pose {s.pose} · {s.to - s.from}</span>
                <span className="rig-key-edge" onPointerDown={(e) => edgeDrag(e, ["sequences", sequence, "keys", s.key], s.to - s.from)} />
              </div>
            ))}
            <Playhead view={view} scale={scale} length={length} />
          </div>

          <div className="rig-tl-name rig-tl-head muted small">pose {pose}: {parts.length} parts, front to back</div>
          <div className="rig-tl-lane rig-tl-pose" style={{ width }}>
            {segments.filter((s) => s.pose === pose).map((s) => (
              <span key={s.key} className="rig-pose-span" style={{ left: s.from * scale, width: (s.to - s.from) * scale }} />
            ))}
          </div>

          {parts.map((part, k) => {
            const track = rig.tracks[part.track];
            const chosen = sel.part === k;
            return [
              <div key={`n${k}`} className={`rig-tl-name rig-part-name${chosen ? " selected" : ""}${dragging === k ? " dragging" : ""}`}
                   draggable onDragStart={(e) => { setDragging(k); e.dataTransfer.effectAllowed = "move"; }}
                   onDragEnd={() => setDragging(null)}
                   onDragOver={(e) => { if (dragging !== null) e.preventDefault(); }}
                   onDrop={(e) => {
                     e.preventDefault();
                     if (dragging === null || dragging === k) return;
                     editor.replace(moveLayer(rig, pose, dragging, k));
                     select({ part: k, key: null });
                     setDragging(null);
                   }}
                   onClick={() => select({ part: k, key: null, picture: track?.keys[0]?.picture ?? null, rectangle: 0, sequenceKey: null })}
                   title={`Part ${k}: track ${part.track} (${track?.name}), pivot ${part.pivot.join(", ")}, ${part.play}s with the pose. Drag to reorder the layers.`}>
                <span className="rig-grip">⠿</span>
                <span className="rig-swatch" style={{ background: hue(k) }} />
                <span className="rig-part-label">{partName(track)}</span>
                <span className="muted small">{track?.name}</span>
                <label className="rig-idle" title="Keeps animating in the battle's idle pause (an idle part)" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" disabled={rig.idle_parts === null} checked={idle.has(k)}
                    onChange={(e) => {
                      const next = new Set(idle);
                      if (e.target.checked) next.add(k);
                      else next.delete(k);
                      editor.set(["idle_parts"], [...next].sort((a, b) => a - b));
                    }} />
                  idle
                </label>
              </div>,
              <div key={`l${k}`} className={`rig-tl-lane${chosen ? " selected" : ""}`} style={{ width }}
                   onMouseDown={(e) => { if (e.target === e.currentTarget) { seek(e, e.currentTarget); select({ part: k, sequenceKey: null }); } }}>
                {track && spansOf(k).map((span, i) => {
                  const key = track.keys[span.key];
                  const picked = sel.key?.track === part.track && sel.key.index === span.key && chosen;
                  const turn = key.rotation ? `${Math.round(signedDegrees(key.rotation))}°` : "";
                  return (
                    <div key={i} className={`rig-key${picked ? " selected" : ""}${span.pass || span.held ? " ghost" : ""}${span.unplayed ? " unplayed" : ""}${span.from === span.to ? " zero" : ""}`}
                         style={{ left: span.from * scale, width: Math.max((span.to - span.from) * scale, 3), ["--hue" as string]: hue(k, 55, 42) }}
                         title={`${track.name} key ${span.key}: picture ${key.picture}, ${key.frames} frames${turn ? `, turn ${turn}` : ""}${key.move ? `, move ${key.move.join(", ")}` : ""}${key.scale && (key.scale[0] !== 1 || key.scale[1] !== 1) ? `, scale ${key.scale.join(" × ")}` : ""}${span.held ? " (held: the track plays once)" : span.unplayed ? " (not played: the pose ends first)" : ""}`}
                         onMouseDown={(e) => {
                           e.stopPropagation();
                           clock.play(false);
                           if (!span.unplayed && span.to > span.from) clock.seek(span.from);
                           select({ part: k, key: { track: part.track, index: span.key }, picture: key.picture ?? null, rectangle: 0, sequenceKey: null });
                         }}>
                      <span className="rig-key-text">{key.picture}{turn ? ` ${turn}` : ""}</span>
                      {!span.pass && !span.held && <span className="rig-key-edge" onPointerDown={(e) => edgeDrag(e, ["tracks", part.track, "keys", span.key], key.frames)} />}
                    </div>
                  );
                })}
                <Playhead view={view} scale={scale} length={length} />
              </div>,
            ];
          })}
        </div>
      </div>
    </div>
  );
}

function Playhead({ view, scale, length }: { view: RigView; scale: number; length: number }) {
  const time = useClock(view.clock, (s) => Math.floor(s.time) % length);
  return <span className="rig-playhead" style={{ left: time * scale }} />;
}

/** The time shown: frame and seconds of the loop, and the pause. */
export function TimeReadout({ view }: { view: RigView }) {
  const { rig, clock } = view;
  const state = useClock(clock, (s) => `${s.sequence}|${Math.floor(s.time)}|${s.pause ? Math.floor(s.pause.elapsed) : -1}|${s.pause?.wait ?? 0}`);
  const [sequence, time, elapsed, wait] = state.split("|").map(Number);
  const length = lengthOf(rig.sequences[Math.min(sequence, rig.sequences.length - 1)]) || 1;
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <span ref={ref} className="rig-readout">
      frame <b>{time % length}</b> / {length} <span className="muted">({((time % length) / 60).toFixed(2)} s of {(length / 60).toFixed(2)} s)</span>
      {elapsed >= 0 && <span className="rig-pause"> · idle pause {elapsed} / {wait}</span>}
    </span>
  );
}
