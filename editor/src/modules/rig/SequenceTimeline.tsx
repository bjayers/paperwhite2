// The new Rig Editor's sequence timeline (rig-editor-v2.md, "Built: step 3"): the open sequence's frames, a row per
// part (the shared bones, children under their parents) with its keys as diamonds, and a summary row of every key.
// The default pose is the hollow key at frame 0 where none is keyed, and again at the sequence's length: the end key,
// drawn one step past the last baked frame in the shaded stretch (it is the next loop's frame 0, never held twice).
// - The ruler: press or drag to move the playhead (snapped to 6 unless Alt; the snap is the dock's "Snap 6"); drag the
//   end's grip to change the length (multiples of 6).
// - Keys: click to choose (Shift or Ctrl: one more or one less), drag empty space to box-select (Shift adds), drag a
//   chosen key to move the chosen ones in time (by 6; Alt by frames). Moving the start or end key copies the default
//   pose there as a key. Double-click a key to put the playhead on it. Delete deletes the chosen keys (one undo step).

import { useMemo, useRef, useState } from "react";
import { hue, useClock } from "./context.ts";
import { boneTree } from "./setup.ts";
import { lastFrame, moveKeys, playheadAt, refId, refOf, rowKeys, sequenceBones, setLength, snapDelta, START, END, type KeyRef } from "./sequences.ts";
import { snapLength, STEP } from "./v2.ts";
import { PieceThumb } from "./SetupSheet.tsx";
import type { SetupView } from "./setupContext.ts";

const NAME_WIDTH = 170;
const ROW = 24;
const RULER = 22;
/** Room before frame 0, so its key is whole. */
const PAD = 10;

interface Box { x0: number; y0: number; x1: number; y1: number; add: boolean }

export function SequenceTimeline({ view, scale }: { view: SetupView; scale: number }) {
  const { src, sel, select, commit, seq, art, sheet, shiny, readOnly } = view;
  const s = seq!.sequence;
  const sequence = src.sequences[s];
  const clock = seq!.clock;
  const time = useClock(clock, (st) => Math.floor(st.time));
  const length = sequence?.frames ?? STEP;
  const bones = useMemo(() => {
    const drawn = new Set(sequenceBones(src, s));
    return boneTree(src).filter((t) => drawn.has(t.bone));
  }, [src, s]);
  const rows = useMemo(() => bones.map(({ bone }) => rowKeys(src, s, bone)), [bones, src, s]);
  const chosen = new Set(sel.keys);
  const body = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const width = PAD + (length + STEP * 2) * scale;
  const xOf = (frame: number) => PAD + frame * scale;
  /** A lane: a faint line every step. */
  const lane = { width, ["--step" as string]: `${STEP * scale}px`, backgroundPositionX: PAD } as React.CSSProperties;
  const frameAt = (x: number) => (x - PAD) / scale;

  // The summary row: every frame with a real key, standing for all of them
  const summary = useMemo(() => {
    const at = new Map<number, KeyRef[]>();
    rows.forEach((row) => row.forEach((k) => {
      if (k.implicit) return;
      at.set(k.frame, [...(at.get(k.frame) ?? []), k.ref]);
    }));
    return [...at].sort((a, b) => a[0] - b[0]);
  }, [rows]);
  if (!sequence) return null;

  // ---- The playhead
  const seekAt = (clientX: number, alt: boolean, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    clock.play(false);
    clock.seek(playheadAt(frameAt(clientX - r.left), length, seq!.snap && !alt));
  };
  const scrub = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    seekAt(e.clientX, e.altKey, el);
    const move = (ev: PointerEvent) => seekAt(ev.clientX, ev.altKey, el);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ---- The length
  const dragLength = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly) return;
    const start = e.clientX, base = src, was = length;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const raw = was + (ev.clientX - start) / scale;
      const frames = seq!.snap && !ev.altKey ? snapLength(raw) : Math.max(1, Math.round(raw));
      if (frames === (moved ? undefined : was)) return;
      commit(setLength(base, s, frames), moved ? "move" : "start");
      moved = true;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) commit(view.src, "end");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ---- Keys
  const grab = (e: React.PointerEvent, refs: KeyRef[]) => {
    e.preventDefault();
    e.stopPropagation();
    const ids = refs.map(refId);
    const toggle = e.shiftKey || e.ctrlKey || e.metaKey;
    const all = ids.every((id) => chosen.has(id));
    let keys: string[];
    if (toggle) keys = all ? sel.keys.filter((id) => !ids.includes(id)) : [...new Set([...ids, ...sel.keys])];
    else keys = all ? sel.keys : ids;
    const main = refs[0].bone;
    select({ keys, ...(toggle ? {} : { bones: sel.bones.includes(main) ? [main, ...sel.bones.filter((b) => b !== main)] : [main] }) });
    if (toggle || readOnly) return;
    const start = e.clientX, base = src;
    const moving = keys.map(refOf);
    let moved = false, last = 0;
    const move = (ev: PointerEvent) => {
      const delta = snapDelta((ev.clientX - start) / scale, seq!.snap && !ev.altKey);
      if (delta === last) return;
      last = delta;
      const r = moveKeys(base, s, moving, delta);
      commit(r.src, moved ? "move" : "start");
      moved = true;
      select({ keys: r.refs.map(refId) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) commit(view.src, "end");
      else if (all && !toggle && keys.length > 1) select({ keys: ids });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ---- Box select (and a click on empty space: the playhead, nothing chosen)
  const boxStart = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = body.current!;
    const r = el.getBoundingClientRect();
    const at = (ev: { clientX: number; clientY: number }): [number, number] => [ev.clientX - r.left - NAME_WIDTH, ev.clientY - r.top];
    const [x0, y0] = at(e);
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    let b: Box = { x0, y0, x1: x0, y1: y0, add };
    let moved = false;
    const move = (ev: PointerEvent) => {
      const [x1, y1] = at(ev);
      if (!moved && Math.hypot(x1 - x0, y1 - y0) < 4) return;
      moved = true;
      b = { ...b, x1, y1 };
      setBox(b);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setBox(null);
      if (!moved) {
        if (!add) select({ keys: [] });
        clock.play(false);
        clock.seek(playheadAt(frameAt(x0), length, seq!.snap && !ev.altKey));
        return;
      }
      const [lx, hx] = [Math.min(b.x0, b.x1), Math.max(b.x0, b.x1)], [ly, hy] = [Math.min(b.y0, b.y1), Math.max(b.y0, b.y1)];
      const inside: string[] = [];
      const take = (frame: number, row: number, refs: KeyRef[]) => {
        const x = xOf(frame), y = row * ROW + ROW / 2;
        if (x >= lx - 4 && x <= hx + 4 && y >= ly && y <= hy) inside.push(...refs.map(refId));
      };
      summary.forEach(([frame, refs]) => take(frame, 0, refs));
      rows.forEach((row, i) => row.forEach((k) => take(k.frame, i + 1, [k.ref])));
      select({ keys: [...new Set([...(add ? sel.keys : []), ...inside])] });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const every = scale >= 8 ? 12 : scale >= 4 ? 24 : 48;
  const ticks: { at: number; label: string | null }[] = [];
  for (let f = 0; f <= length + STEP * 2; f += STEP) ticks.push({ at: f, label: f % every === 0 || f === length ? String(f) : null });
  const end = lastFrame(length, seq!.snap);
  const diamond = (ref: KeyRef, frame: number, implicit: boolean, curve: string | undefined, label: string, extra = "") => {
    const id = refId(ref);
    return (
      <span key={id + extra} className={`rig-sq-key${implicit ? " implicit" : ""}${chosen.has(id) ? " selected" : ""}${curve ? ` curve-${curve}` : ""}${frame > length ? " past" : ""}`}
            style={{ left: xOf(frame) }} title={label}
            onPointerDown={(e) => grab(e, [ref])}
            onDoubleClick={() => { clock.play(false); clock.seek(Math.min(frame, end)); }} />
    );
  };

  return (
    <div className="rig-sq-timeline" style={{ ["--name" as string]: `${NAME_WIDTH}px` }}>
      <div className="rig-sq-scroll">
        <div className="rig-sq-grid" style={{ width: NAME_WIDTH + width }}>
          <div className="rig-sq-name rig-sq-head muted small" style={{ height: RULER }}>frame {time} of {length}</div>
          <div className="rig-sq-ruler" style={{ width, height: RULER }} onPointerDown={scrub}
               title="Press or drag to move the playhead (by 6 with Snap 6; Alt: by frames)">
            {ticks.map((t) => <span key={t.at} className={`rig-tick${t.label ? " major" : ""}`} style={{ left: xOf(t.at) }}>{t.label}</span>)}
            <span className="rig-sq-past" style={{ left: xOf(length), width: STEP * 2 * scale }} />
            <span className="rig-sq-length" style={{ left: xOf(length) }} onPointerDown={dragLength}
                  title={`The sequence's length: ${length} frames (${(length / 60).toFixed(2)} s). Drag to change it (multiples of 6; Alt: any).`}>⇔</span>
            <span className="rig-sq-playhead-cap" style={{ left: xOf(time) }} />
          </div>
          <div ref={body} className="rig-sq-body" style={{ gridColumn: "1 / span 2", width: NAME_WIDTH + width }}>
            <div className="rig-sq-row">
              <div className="rig-sq-name"><b>All parts</b> <span className="muted small">{summary.reduce((n, [, r]) => n + r.length, 0)} keys</span></div>
              <div className="rig-sq-lane summary" style={lane} onPointerDown={boxStart}>
                {summary.map(([frame, refs]) => (
                  <span key={frame} className={`rig-sq-key summary${refs.every((r) => chosen.has(refId(r))) ? " selected" : ""}${frame > length ? " past" : ""}`} style={{ left: xOf(frame) }}
                        title={`${refs.length} key${refs.length > 1 ? "s" : ""} at frame ${frame}: click to choose them, drag to move them`}
                        onPointerDown={(e) => grab(e, refs)} onDoubleClick={() => { clock.play(false); clock.seek(Math.min(frame, end)); }} />
                ))}
              </div>
            </div>
            {bones.map(({ bone: b, depth }, i) => {
              const bone = src.bones[b];
              const row = rows[i];
              return (
                <div key={b} className={`rig-sq-row${sel.bones.includes(b) ? " chosen" : ""}`}>
                  <div className={`rig-sq-name${sel.bones[0] === b ? " selected" : sel.bones.includes(b) ? " multi" : ""}`} style={{ paddingLeft: 6 + depth * 12 }}
                       onClick={(e) => select(e.shiftKey || e.ctrlKey || e.metaKey ? { bones: sel.bones.includes(b) ? sel.bones.filter((x) => x !== b) : [b, ...sel.bones] } : { bones: [b] })}
                       title="Click to choose this part (Shift or Ctrl: one more)">
                    <span className="rig-swatch" style={{ background: hue(b, 70, 70) }} />
                    <PieceThumb art={art} sheet={sheet} shiny={shiny} rectangles={bone.default?.piece !== undefined ? src.pieces[bone.default.piece]?.rectangles : undefined} size={18} />
                    <span className="rig-sq-label">{bone.name}</span>
                  </div>
                  <div className="rig-sq-lane" style={lane} onPointerDown={boxStart}>
                    {row.map((k) => diamond(k.ref, k.frame, k.implicit, k.key ? (k.key.curve ?? src.curve ?? "ease_in_out") : undefined, keyTitle(k.ref, k.frame, length, k.key?.curve)))}
                  </div>
                </div>
              );
            })}
            <span className="rig-sq-past rows" style={{ left: NAME_WIDTH + xOf(length), width: STEP * 2 * scale }} />
            <span className="rig-playhead" style={{ left: NAME_WIDTH + xOf(time) }} />
            {box && <span className="rig-sq-box" style={{ left: NAME_WIDTH + Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function keyTitle(ref: KeyRef, frame: number, length: number, curve: string | undefined) {
  if (ref.index === START) return "The default pose at frame 0 (the sequence starts there). Drag to copy it to another frame as a key; give it a curve to key it here.";
  if (ref.index === END) return `The end key at ${length}: the start again, one step past the last baked frame (the next loop's frame 0, never held twice). Drag it back to make the part settle into the default pose earlier.`;
  return `A key at frame ${frame}${frame === length ? " (the end key, made real)" : frame > length ? ", past the end: it never plays" : ""}${curve ? `, ${curve.replace(/_/g, " ")} to the next` : ""}. Drag to move it (by 6; Alt: by frames); double-click to go to it.`;
}

