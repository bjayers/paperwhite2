// The Rig Editor's timeline: the sequence played over its loop, a row a key of it (the pose it shows and for how
// long), then a row for each part of the pose shown, front to back (the layer order; drag a name to reorder), with its
// track's keys as blocks as wide as the frames they're held, where the game plays them: from the pose's start for a
// part that restarts, on the sequence's time for one that continues; later passes of a looping track faded. Click a
// key to choose it, drag its right edge to change how long it's held (Shift: whole 6-frame steps, Game Freak's
// rhythm). A click on the ruler moves the playhead.

import { useEffect, useMemo, useRef, useState } from "react";
import { lengthOf, sequenceKeyAt } from "./mcss.ts";
import { dropLayer, isBlank, partName, sequenceSegments, signedDegrees, trackSpans, type Span } from "./model.ts";
import { Thumb } from "./LayerList.tsx";
import { pickPart } from "./keying.ts";
import { hue, selectedParts, useClock, type RigView } from "./context.ts";
import { keyPoseTimes, setKeys, type Target } from "./armatureEdit.ts";
import { curveOf, type KeyPose } from "./armature.ts";

const NAME_WIDTH = 210;

/** An armature's key poses on a row: diamonds where they play, dragged in time (Shift: steps of 6), clicked to choose. */
function Diamonds({ view, target, keys, frames, times, scale, chosen, onChoose }: {
  view: RigView; target: Target; keys: KeyPose[]; frames: number; times: { index: number; at: number; later: boolean }[];
  scale: number; chosen: number | null; onChoose(index: number, at: number): void;
}) {
  const drag = (e: React.PointerEvent, index: number, at: number) => {
    e.stopPropagation();
    e.preventDefault();
    onChoose(index, at);
    const start = e.clientX;
    const original = keys;
    const moving = original[index];
    let moved = false;
    const move = (ev: PointerEvent) => {
      let frame = moving.frame + Math.round((ev.clientX - start) / scale);
      if (ev.shiftKey) frame = Math.round(frame / 6) * 6;
      frame = Math.max(0, Math.min(frames, frame));
      if (frame === moving.frame && !moved) return;
      const next = original.map((k, i) => (i === index ? { ...k, frame } : k));
      setKeys(view, target, next, moved ? "move" : "start");
      moved = true;
      // The key pose's place once sorted (setKeys keeps them in frame order)
      const order = next.map((k, i) => [k, i] as const).sort((a, b) => a[0].frame - b[0].frame || a[1] - b[1]).map(([, i]) => i);
      view.select({ keyPose: order.indexOf(index) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <>
      {times.map(({ index, at, later }, i) => {
        const key = keys[index];
        const curve = curveOf(key, "move_x");
        return (
          <span key={i} className={`rig-diamond curve-${curve}${chosen === index ? " selected" : ""}${later ? " later" : ""}`} style={{ left: at * scale }}
                title={`Key pose ${index} at frame ${key.frame} of ${frames}${key.picture !== undefined ? `: picture ${key.picture}` : key.pose !== undefined ? `: pose ${key.pose}` : ""}, ${curve} to the next. Drag to move it in time (Shift: steps of 6).`}
                onPointerDown={(e) => drag(e, index, at)} />
        );
      })}
    </>
  );
}

export function Timeline({ view, scale, follow }: { view: RigView; scale: number; follow: boolean }) {
  const { rig, sel, select, clock, editor, source } = view;
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

  const seekTo = (clientX: number, lane: HTMLElement) => {
    const r = lane.getBoundingClientRect();
    clock.play(false);
    clock.seek(Math.max(0, Math.min(length - 1, Math.floor((clientX - r.left) / scale))));
  };
  /** A press on the ruler or an empty stretch of a lane moves the playhead there and follows the pointer while it is
   * held (scrubbing); the default action is stopped so the drag doesn't select the page's text. */
  const seek = (e: React.MouseEvent, lane: HTMLElement) => {
    e.preventDefault();
    seekTo(e.clientX, lane);
    const move = (ev: MouseEvent) => seekTo(ev.clientX, lane);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
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

          <div className={`rig-tl-name rig-tl-seq${source ? " with-poses" : ""}${sel.root ? " selected" : ""}`}
               onClick={source ? () => select({ root: true, part: null, key: null, keyPose: null, sequenceKey: null }) : undefined}
               title={source ? "The root: the whole sprite's move, turn and scale, about the feet, and the pose each key shows. Click to choose it." : undefined}>
            {source && <span className="rig-bone-icon">◆</span>}
            <b>{source ? "Root" : seq.name}</b> <span className="muted small">{source ? `${seq.name} · ` : ""}sequence {sequence}</span>
          </div>
          <div className={`rig-tl-lane${source ? " with-poses" : ""}${sel.root ? " selected" : ""}`} style={{ width }} onMouseDown={(e) => { if (e.target === e.currentTarget) seek(e, e.currentTarget); }}>
            {source?.sequences[sequence] && (
              <Diamonds view={view} target={{ kind: "root", sequence }} keys={source.sequences[sequence].keys} frames={source.sequences[sequence].frames}
                times={source.sequences[sequence].keys.map((k, index) => ({ index, at: k.frame, later: false }))} scale={scale}
                chosen={sel.root ? sel.keyPose : null}
                onChoose={(index, at) => { clock.play(false); clock.seek(Math.min(at, length - 1)); select({ root: true, part: null, key: null, keyPose: index, sequenceKey: null }); }} />
            )}
            {segments.map((s) => (
              <div key={s.key} className={`rig-key rig-seq-key${sel.sequenceKey === s.key ? " selected" : ""}${s.pose === pose ? " shown" : ""}`}
                   style={{ left: s.from * scale, width: Math.max((s.to - s.from) * scale, 3), ["--hue" as string]: hue(s.pose + 3, 45, 45) }}
                   title={`Key ${s.key}: pose ${s.pose} for ${s.to - s.from} frames (from ${s.from})`}
                   onMouseDown={(e) => {
                     e.stopPropagation();
                     e.preventDefault();
                     clock.play(false);
                     clock.seek(s.from);
                     select({ sequenceKey: s.key, key: null, pose: Math.min(s.pose, rig.poses.length - 1) });
                   }}>
                <span className="rig-key-text">pose {s.pose} · {s.to - s.from}</span>
                {!source && <span className="rig-key-edge" onPointerDown={(e) => edgeDrag(e, ["sequences", sequence, "keys", s.key], s.to - s.from)} />}
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
            const also = !chosen && selectedParts(sel).includes(k);
            return [
              <div key={`n${k}`} className={`rig-tl-name rig-part-name${chosen ? " selected" : also ? " multi" : ""}${dragging === k ? " dragging" : ""}`}
                   draggable onDragStart={(e) => { setDragging(k); e.dataTransfer.effectAllowed = "move"; }}
                   onDragEnd={() => setDragging(null)}
                   onDragOver={(e) => { if (dragging !== null) e.preventDefault(); }}
                   onDrop={(e) => {
                     e.preventDefault();
                     const drop = dragging === null ? null : dropLayer(rig, pose, dragging, k);
                     if (!drop) return;
                     editor.replace(drop.rig);
                     select({ part: drop.selected, key: null });
                     setDragging(null);
                   }}
                   onClick={(e) => select(pickPart(sel, k, e) ?? { part: k, more: [], key: null, picture: track?.keys[0]?.picture ?? null, rectangle: 0, sequenceKey: null, root: false, keyPose: null })}
                   title={`Part ${k}: track ${part.track} (${track?.name}), pivot ${part.pivot.join(", ")}, ${part.play}s with the pose. Drag to reorder the layers.`}>
                <span className="rig-grip">⠿</span>
                <span className="rig-swatch" style={{ background: hue(k) }} />
                <span className="rig-part-label">{partName(track)}</span>
                <span className="muted small">{track?.name}</span>
                {source && source.bones[part.track]?.parent != null && <span className="rig-parent-tag" title="Its parent bone">↳ {partName(rig.tracks[source.bones[part.track].parent!])}</span>}
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
              <div key={`l${k}`} className={`rig-tl-lane${chosen ? " selected" : ""}${source ? " with-poses" : ""}`} style={{ width }}
                   onMouseDown={(e) => { if (e.target === e.currentTarget) { seek(e, e.currentTarget); select({ part: k, sequenceKey: null, root: false }); } }}>
                {source?.bones[part.track] && (
                  <Diamonds view={view} target={{ kind: "bone", track: part.track }} keys={source.bones[part.track].keys} frames={source.bones[part.track].frames}
                    times={keyPoseTimes(pose, source.bones[part.track].frames, source.bones[part.track].keys, part.play === "restart", segments)} scale={scale}
                    chosen={chosen && !sel.root ? sel.keyPose : null}
                    onChoose={(index, at) => { clock.play(false); clock.seek(Math.min(at, length - 1)); select({ part: k, root: false, key: null, keyPose: index, sequenceKey: null, picture: source.bones[part.track].keys[index].picture ?? null }); }} />
                )}
                {track && spansOf(k).map((span, i) => {
                  const key = track.keys[span.key];
                  const picked = sel.key?.track === part.track && sel.key.index === span.key && chosen;
                  const turn = key.rotation ? `${Math.round(signedDegrees(key.rotation))}°` : "";
                  return (
                    <div key={i} className={`rig-key${picked ? " selected" : ""}${span.pass || span.held ? " ghost" : ""}${span.unplayed ? " unplayed" : ""}${span.from === span.to ? " zero" : ""}${isBlank(rig.pictures[key.picture ?? 0]) ? " blank" : ""}`}
                         style={{ left: span.from * scale, width: Math.max((span.to - span.from) * scale, 3), ["--hue" as string]: hue(k, 55, 42) }}
                         title={`${track.name} key ${span.key}: picture ${key.picture}, ${key.frames} frames${turn ? `, turn ${turn}` : ""}${key.move ? `, move ${key.move.join(", ")}` : ""}${key.scale && (key.scale[0] !== 1 || key.scale[1] !== 1) ? `, scale ${key.scale.join(" × ")}` : ""}${span.held ? " (held: the track plays once)" : span.unplayed ? " (not played: the pose ends first)" : ""}`}
                         onMouseDown={(e) => {
                           e.stopPropagation();
                           e.preventDefault();
                           clock.play(false);
                           if (!span.unplayed && span.to > span.from) clock.seek(span.from);
                           select({ part: k, key: { track: part.track, index: span.key }, picture: key.picture ?? null, rectangle: 0, sequenceKey: null });
                         }}>
                      {(span.to - span.from) * scale >= 44 && (rig.pictures[key.picture ?? 0] && !isBlank(rig.pictures[key.picture ?? 0])
                        ? <Thumb view={view} picture={key.picture ?? 0} size={20} className="rig-key-thumb" /> : null)}
                      <span className="rig-key-text">{isBlank(rig.pictures[key.picture ?? 0]) ? "hidden" : `#${key.picture ?? 0}`}{turn ? ` ${turn}` : ""}</span>
                      {!source && !span.pass && !span.held && <span className="rig-key-edge" onPointerDown={(e) => edgeDrag(e, ["tracks", part.track, "keys", span.key], key.frames)} />}
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
