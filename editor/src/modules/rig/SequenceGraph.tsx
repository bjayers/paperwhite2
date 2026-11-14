// The new Rig Editor's graph editor (rig-editor-v2.md, "Built: step 3"), as Blender's: the chosen parts' channels in the
// open sequence as curves (move x and y, turn, scale x and y) from the default pose at frame 0 to the end key at the
// length, and faintly under them the 6-frame steps the bake holds (what the game shows). Click a key to choose it
// (Shift or Ctrl: one more), drag empty space to box-select, drag a key in time (the chosen keys together, by 6; Alt
// by frames) and in value (Shift keeps to the way it went first); a Bézier key's handles drag (the other follows; Alt
// breaks them). The curve buttons set how the chosen keys go on to the next: on the chosen channel or every channel,
// with the presets (snap, back, bounce, elastic). A click on empty space moves the playhead.

import { useEffect, useMemo, useRef, useState } from "react";
import { hue, useClock } from "./context.ts";
import { channelAt, CHANNEL_LABELS, CHANNELS, curveOf, handlesOf, segmentAt, type Channel, type Curve, type Handle } from "./armature.ts";
import { fixedScale } from "./model.ts";
import { keyChannel, moveKeys, partPoses, playheadAt, refId, refOf, setCurve, setHandles, setKeyChannel, snapDelta, usedChannels, START, type KeyRef } from "./sequences.ts";
import { bakedFrames, DEFAULT_CURVE, STEP } from "./v2.ts";
import type { SetupView } from "./setupContext.ts";

const COLORS: Record<Channel, string> = { move_x: "#e5534b", move_y: "#57ab5a", rotation: "#539bf5", scale_x: "#d29922", scale_y: "#b083f0" };
const MARGIN = { left: 46, right: 14, top: 12, bottom: 20 };
/** The curve buttons: the plain ones, then the presets (step 1's named functions). */
export const PLAIN_CURVES: { curve: Curve; label: string; note: string }[] = [
  { curve: "constant", label: "Constant", note: "held until the next key (no in-betweens)" },
  { curve: "linear", label: "Linear", note: "a steady change" },
  { curve: "ease_in", label: "Ease in", note: "starts slowly" },
  { curve: "ease_out", label: "Ease out", note: "ends slowly" },
  { curve: "ease_in_out", label: "Ease in-out", note: "starts and ends slowly (the default)" },
  { curve: "bezier", label: "Bézier", note: "shaped by the handles in the graph" },
];
export const PRESET_CURVES: { curve: Curve; label: string; note: string }[] = [
  { curve: "snap", label: "Snap", note: "most of the way at once, then settles" },
  { curve: "back", label: "Back", note: "goes about 10% past the next key, then back" },
  { curve: "bounce", label: "Bounce", note: "lands on the next key and bounces three times" },
  { curve: "elastic", label: "Elastic", note: "swings about the next key, dying away" },
];

const tidy = (channel: Channel, v: number) => (channel.startsWith("scale") ? fixedScale(v) : Math.round(v * 100) / 100) + 0;
/** A value as the bake holds it: whole pixels, 65536ths of a turn, 4096ths of a scale. */
const baked = (channel: Channel, v: number) => (channel === "rotation" ? (Math.round((v / 360) * 65536) / 65536) * 360 : channel.startsWith("move") ? Math.round(v) : fixedScale(v));

type Range = [number, number];
interface Point { ref: KeyRef; bone: number; channel: Channel; frame: number; value: number; implicit: boolean }

interface Drag {
  kind: "key" | "handle" | "box";
  ref?: KeyRef;
  channel?: Channel;
  side?: 0 | 1;
  start: [number, number];
  base: SetupView["src"];
  ranges: Record<string, Range>;
  moved: boolean;
  lock?: "x" | "y";
  refs?: KeyRef[];
  add?: boolean;
}

export function SequenceGraph({ view }: { view: SetupView }) {
  const { src, sel, select, commit, seq, readOnly } = view;
  const s = seq!.sequence;
  const sequence = src.sequences[s];
  const clock = seq!.clock;
  const time = useClock(clock, (st) => Math.floor(st.time));
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<[number, number]>([600, 200]);
  const [normalize, setNormalize] = useState(true);
  const [picked, setPicked] = useState<Set<Channel> | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [box, setBox] = useState<[number, number, number, number] | null>(null);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize([Math.max(200, el.clientWidth), Math.max(80, el.clientHeight)]));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The parts shown: the chosen bones (and those of the chosen keys)
  const bones = useMemo(() => [...new Set([...sel.bones, ...sel.keys.map((id) => refOf(id).bone)])].filter((b) => src.bones[b]), [sel.bones, sel.keys, src]);
  const frames = Math.max(sequence?.frames ?? STEP, 1);
  const parts = useMemo(() => bones.map((b) => ({ bone: b, ...partPoses(src, s, b) })), [bones, src, s]);
  const used = useMemo(() => {
    const out = new Set<Channel>();
    for (const b of bones) for (const c of usedChannels(src, s, b)) out.add(c);
    return out.size ? CHANNELS.filter((c) => out.has(c)) : (["rotation", "move_y"] as Channel[]);
  }, [bones, src, s]);
  const shown = CHANNELS.filter((c) => (picked ?? new Set(used)).has(c));
  const chosen = new Set(sel.keys);
  const lane = (b: number) => sequence?.parts.find((l) => l.bone === b);

  /** Every key's point on every channel shown, the implicit start and end too (hollow). */
  const points: Point[] = [];
  for (const b of bones) {
    const keys = lane(b)?.keys ?? [];
    const start = keys.find((k) => k.frame === 0);
    for (const c of shown) {
      const startValue = keyChannel(src, b, start ?? {}, c);
      if (!start) points.push({ ref: { bone: b, index: START }, bone: b, channel: c, frame: 0, value: startValue, implicit: true });
      keys.forEach((k, index) => points.push({ ref: { bone: b, index }, bone: b, channel: c, frame: k.frame, value: keyChannel(src, b, k, c), implicit: false }));
      if (!keys.some((k) => k.frame === frames)) points.push({ ref: { bone: b, index: -2 }, bone: b, channel: c, frame: frames, value: startValue, implicit: true });
    }
  }
  const valueAt = (part: (typeof parts)[number], c: Channel, t: number) =>
    channelAt(part.poses, segmentAt(part.poses, t), c, Math.min(t, part.frames), part.frames, part.loop);

  const rangeOf = (c: Channel): Range => {
    let lo = Infinity, hi = -Infinity;
    const add = (v: number) => { lo = Math.min(lo, v); hi = Math.max(hi, v); };
    for (const part of parts) {
      for (let t = 0; t <= frames; t += Math.max(1, frames / 300)) add(valueAt(part, c, t));
      part.poses.forEach((k, i) => {
        if (curveOf(k, c) === "bezier" || (i > 0 && curveOf(part.poses[i - 1], c) === "bezier")) for (const h of handlesOf(part.poses, i, c, part.frames)) add(valueAt(part, c, k.frame) + h[1]);
      });
    }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    const unit = c.startsWith("scale") ? 0.1 : 1;
    if (hi - lo < unit) { const mid = (hi + lo) / 2; lo = mid - unit; hi = mid + unit; }
    const pad = (hi - lo) * 0.12;
    return [lo - pad, hi + pad];
  };
  const ranges: Record<string, Range> = {};
  if (normalize) for (const c of shown) ranges[c] = rangeOf(c);
  else {
    let lo = Infinity, hi = -Infinity;
    for (const c of shown) { const [a, b] = rangeOf(c); lo = Math.min(lo, a); hi = Math.max(hi, b); }
    for (const c of shown) ranges[c] = [lo, hi];
  }
  const [w, h] = size;
  const span = frames + STEP;
  const plotW = w - MARGIN.left - MARGIN.right, plotH = h - MARGIN.top - MARGIN.bottom;
  const xOf = (f: number) => MARGIN.left + (f / span) * plotW;
  const frameOf = (x: number) => ((x - MARGIN.left) / plotW) * span;
  const yOf = (c: Channel, v: number, r = ranges) => { const [lo, hi] = r[c] ?? [0, 1]; return MARGIN.top + (1 - (v - lo) / (hi - lo)) * plotH; };
  const valueOfY = (c: Channel, y: number, r = ranges) => { const [lo, hi] = r[c] ?? [0, 1]; return lo + (1 - (y - MARGIN.top) / plotH) * (hi - lo); };
  const main = sel.keys.length ? refOf(sel.keys[0]) : null;

  /** The handles shown: the main chosen key's, on the channels whose curves are Bézier on either side. */
  const handleList = () => {
    const out: { channel: Channel; side: 0 | 1; at: [number, number]; from: [number, number] }[] = [];
    if (!main || main.index < 0) return out;
    const part = parts.find((p) => p.bone === main.bone);
    const k = lane(main.bone)?.keys[main.index];
    if (!part || !k) return out;
    const i = part.poses.findIndex((p) => p.frame === k.frame);
    if (i < 0) return out;
    for (const c of shown) {
      if (channel && c !== channel) continue;
      const [left, right] = handlesOf(part.poses, i, c, part.frames);
      const v = keyChannel(src, main.bone, k, c);
      const from: [number, number] = [xOf(k.frame), yOf(c, v)];
      if (i > 0 && curveOf(part.poses[i - 1], c) === "bezier") out.push({ channel: c, side: 0, at: [xOf(k.frame + left[0]), yOf(c, v + left[1])], from });
      if (curveOf(part.poses[i], c) === "bezier") out.push({ channel: c, side: 1, at: [xOf(k.frame + right[0]), yOf(c, v + right[1])], from });
    }
    return out;
  };

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    el.width = w * dpr;
    el.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const style = getComputedStyle(el);
    const muted = style.getPropertyValue("--muted") || "#8b949e";
    const border = style.getPropertyValue("--border") || "#30363d";
    ctx.font = "10px sans-serif";
    // Frames: a line every step, labels every few; past the end shaded (the end key is the next loop's start)
    const every = span / (plotW / 40) > 12 ? 24 : span / (plotW / 40) > 6 ? 12 : 6;
    ctx.fillStyle = "rgba(128,128,128,0.12)";
    ctx.fillRect(xOf(frames), MARGIN.top, xOf(span) - xOf(frames), plotH);
    for (let f = 0; f <= span; f += STEP) {
      ctx.strokeStyle = f % every === 0 || f === frames ? border : "rgba(128,128,128,0.15)";
      ctx.beginPath(); ctx.moveTo(xOf(f) + 0.5, MARGIN.top); ctx.lineTo(xOf(f) + 0.5, h - MARGIN.bottom); ctx.stroke();
      if (f % every === 0 || f === frames) { ctx.fillStyle = muted; ctx.fillText(String(f), xOf(f) + 2, h - 6); }
    }
    if (!parts.length || !shown.length) return;
    const [lo, hi] = ranges[shown[0]];
    ctx.fillStyle = muted;
    ctx.fillText(`${+hi.toFixed(2)}`, 4, MARGIN.top + 8);
    ctx.fillText(`${+lo.toFixed(2)}`, 4, h - MARGIN.bottom);
    for (const part of parts) {
      const several = parts.length > 1;
      for (const c of shown) {
        const color = COLORS[c];
        // The baked steps: each sample (every 6, and each key's frame) held to the next, as the game shows them
        const samples = new Set(bakedFrames(part.frames));
        for (const k of part.poses) if (k.frame < part.frames) samples.add(k.frame);
        const times = [...samples].sort((a, b) => a - b);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 3;
        ctx.beginPath();
        times.forEach((t, i) => {
          const y = yOf(c, baked(c, valueAt(part, c, t)));
          const end = i + 1 < times.length ? times[i + 1] : part.frames;
          if (i === 0) ctx.moveTo(xOf(t), y); else ctx.lineTo(xOf(t), y);
          ctx.lineTo(xOf(end), y);
        });
        ctx.stroke();
        ctx.globalAlpha = 1;
        // The curve, to the end key
        ctx.lineWidth = channel === c ? 2.2 : 1.5;
        if (several) ctx.setLineDash(part.bone === bones[0] ? [] : [6, 3]);
        ctx.beginPath();
        const n = Math.max(2, Math.ceil(((xOf(frames) - xOf(0)) / 2)));
        for (let i = 0; i <= n; i++) {
          const t = (i / n) * frames;
          const y = yOf(c, valueAt(part, c, t));
          if (i === 0) ctx.moveTo(xOf(t), y); else ctx.lineTo(xOf(t), y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
      }
      if (several) {
        ctx.fillStyle = hue(part.bone, 70, 70);
        ctx.fillText(src.bones[part.bone].name, MARGIN.left + 4, MARGIN.top + 10 + 12 * bones.indexOf(part.bone));
      }
    }
    for (const p of points) {
      const x = xOf(p.frame), y = yOf(p.channel, p.value);
      ctx.beginPath();
      ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath();
      const on = chosen.has(refId(p.ref));
      ctx.fillStyle = p.implicit ? "rgba(0,0,0,0)" : on ? (channel === null || channel === p.channel ? "#ffffff" : "#ffd33d") : COLORS[p.channel];
      ctx.strokeStyle = p.implicit ? (on ? "#ffd33d" : COLORS[p.channel]) : "#111";
      ctx.lineWidth = p.implicit ? 1.5 : 1;
      ctx.fill(); ctx.stroke();
    }
    for (const handle of handleList()) {
      ctx.strokeStyle = COLORS[handle.channel];
      ctx.beginPath(); ctx.moveTo(...handle.from); ctx.lineTo(...handle.at); ctx.stroke();
      ctx.beginPath(); ctx.arc(handle.at[0], handle.at[1], 4, 0, Math.PI * 2);
      ctx.fillStyle = "#111"; ctx.fill(); ctx.stroke();
    }
    ctx.strokeStyle = "#e5534b";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(xOf(time), MARGIN.top - 4); ctx.lineTo(xOf(time), h - MARGIN.bottom); ctx.stroke();
    ctx.lineWidth = 1;
    if (box) {
      ctx.strokeStyle = "#ffd33d";
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(Math.min(box[0], box[2]), Math.min(box[1], box[3]), Math.abs(box[2] - box[0]), Math.abs(box[3] - box[1]));
      ctx.setLineDash([]);
    }
  });

  if (!sequence) return null;
  if (!bones.length) return <p className="muted ow-note">Choose a part (on the preview, in the timeline or in the Parts list) to see its curves in {sequence.name}.</p>;

  const pointerAt = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const [px, py] = pointerAt(e);
    const near = (x: number, y: number) => Math.hypot(x - px, y - py) <= 7;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    for (const handle of handleList()) {
      if (near(...handle.at) && !readOnly) {
        clock.play(false);
        drag.current = { kind: "handle", ref: main!, channel: handle.channel, side: handle.side, start: [px, py], base: src, ranges: { ...ranges }, moved: false };
        return;
      }
    }
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      if (!near(xOf(p.frame), yOf(p.channel, p.value))) continue;
      const id = refId(p.ref);
      const toggle = e.shiftKey || e.ctrlKey || e.metaKey;
      const keys = toggle ? (chosen.has(id) ? sel.keys.filter((x) => x !== id) : [id, ...sel.keys]) : chosen.has(id) ? [id, ...sel.keys.filter((x) => x !== id)] : [id];
      select({ keys });
      setChannel(p.channel);
      if (toggle || readOnly) return;
      clock.play(false);
      drag.current = { kind: "key", ref: p.ref, channel: p.channel, start: [px, py], base: src, ranges: { ...ranges }, moved: false, refs: keys.map(refOf) };
      return;
    }
    drag.current = { kind: "box", start: [px, py], base: src, ranges, moved: false, add: e.shiftKey || e.ctrlKey || e.metaKey };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const [px, py] = pointerAt(e);
    let dx = px - d.start[0], dy = py - d.start[1];
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    if (d.kind === "box") {
      d.moved = true;
      setBox([d.start[0], d.start[1], px, py]);
      return;
    }
    if (d.kind === "key") {
      if (e.shiftKey) {
        d.lock ??= Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (d.lock === "x") dy = 0; else dx = 0;
      } else d.lock = undefined;
      const c = d.channel!;
      let next = d.base;
      // The value: the grabbed key's channel (an implicit key is the default pose: it moves only in time)
      if (dy && d.ref!.index >= 0) {
        const k = d.base.sequences[s].parts.find((l) => l.bone === d.ref!.bone)?.keys[d.ref!.index];
        if (k) {
          const y0 = yOf(c, keyChannel(d.base, d.ref!.bone, k, c), d.ranges);
          next = setKeyChannel(next, s, d.ref!, c, tidy(c, valueOfY(c, y0 + dy, d.ranges)));
        }
      }
      // The time: every chosen key together
      const delta = snapDelta((dx / plotW) * span, seq!.snap && !e.altKey);
      let refs = d.refs!;
      if (delta) {
        const r = moveKeys(next, s, refs, delta);
        next = r.src;
        refs = r.refs;
      }
      commit(next, d.moved ? "move" : "start");
      d.moved = true;
      if (delta) select({ keys: refs.map(refId) });
    } else if (d.kind === "handle") {
      const c = d.channel!;
      const r = d.ref!;
      const part = partPoses(d.base, s, r.bone);
      const k = d.base.sequences[s].parts.find((l) => l.bone === r.bone)?.keys[r.index];
      const i = k ? part.poses.findIndex((p) => p.frame === k.frame) : -1;
      if (!k || i < 0) return;
      const v = keyChannel(d.base, r.bone, k, c);
      let dt = frameOf(px) - k.frame;
      const dv = valueOfY(c, py, d.ranges) - v;
      dt = d.side === 0 ? Math.min(0, dt) : Math.max(0, dt);
      const handles = handlesOf(part.poses, i, c, part.frames).map((x) => [...x] as Handle) as [Handle, Handle];
      handles[d.side!] = [Math.round(dt * 100) / 100, tidy(c, dv)];
      if (!e.altKey && Math.abs(dt) > 1e-6) {
        // Aligned, as Blender's: the other handle keeps its length in time and points the opposite way
        const other = handles[1 - d.side!];
        const ratio = Math.abs(other[0]) / Math.abs(dt);
        handles[1 - d.side!] = [Math.round(-dt * ratio * 100) / 100, tidy(c, -dv * ratio)];
      }
      commit(setHandles(d.base, s, r, c, handles), d.moved ? "move" : "start");
      d.moved = true;
    }
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "box") {
      setBox(null);
      if (!d.moved) {
        // A click on empty space: the playhead there, nothing chosen
        if (!d.add) select({ keys: [] });
        clock.play(false);
        clock.seek(playheadAt(frameOf(d.start[0]), frames, seq!.snap && !e.altKey));
        setChannel(null);
        return;
      }
      const [px, py] = pointerAt(e);
      const [lx, hx] = [Math.min(d.start[0], px), Math.max(d.start[0], px)], [ly, hy] = [Math.min(d.start[1], py), Math.max(d.start[1], py)];
      const inside = points.filter((p) => { const x = xOf(p.frame), y = yOf(p.channel, p.value); return x >= lx && x <= hx && y >= ly && y <= hy; }).map((p) => refId(p.ref));
      select({ keys: [...new Set([...(d.add ? sel.keys : []), ...inside])] });
    } else if (d.moved) commit(src, "end");
  };

  const applyCurve = (curve: Curve) => {
    if (!sel.keys.length || readOnly) return;
    commit(setCurve(src, s, sel.keys.map(refOf), curve, channel));
  };
  const mainKey = main && main.index >= 0 ? lane(main.bone)?.keys[main.index] : null;
  // The main chosen key's curve (the implicit start's is the file's; the end key has none: nothing comes after it)
  const current: Curve | null = !main || (main.index !== START && !mainKey) ? null
    : (channel ? mainKey?.curves?.[channel] : undefined) ?? mainKey?.curve ?? src.curve ?? DEFAULT_CURVE;

  return (
    <div className="rig-graph">
      <div className="rig-graph-head">
        <b>{bones.map((b) => src.bones[b].name).join(", ")}</b>
        <span className="muted">in {sequence.name}, {frames} frames · the game's 6-frame steps faint underneath</span>
        {CHANNELS.map((c) => (
          <label key={c} className="rig-channel" title={used.includes(c) ? "This channel changes" : "This channel stays the same"}>
            <input type="checkbox" checked={shown.includes(c)} onChange={(e) => {
              const next = new Set(shown);
              if (e.target.checked) next.add(c); else next.delete(c);
              setPicked(next);
            }} />
            <span className="rig-channel-swatch" style={{ background: COLORS[c] }} />{CHANNEL_LABELS[c]}
          </label>
        ))}
        <label className="ow-check" title="Each channel in its own range, so pixels, degrees and scales fit together"><input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} /> Normalize</label>
      </div>
      <CurveButtons count={sel.keys.length} channel={channel} current={current} disabled={readOnly} onCurve={applyCurve} onEveryChannel={() => setChannel(null)} />
      <div className="rig-graph-canvas-wrap" ref={wrap}>
        <canvas ref={canvas} className="rig-graph-canvas" style={{ width: w, height: h }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      </div>
    </div>
  );
}

/** The curve menu: how the chosen keys go on to the next, the plain curves then the presets. */
export function CurveButtons({ count, channel, current, disabled, onCurve, onEveryChannel }: {
  count: number; channel: Channel | null; current: Curve | null; disabled?: boolean; onCurve(curve: Curve): void; onEveryChannel?(): void;
}) {
  return (
    <div className="rig-curve-buttons">
      <span className="muted small">{count ? `${count} key${count > 1 ? "s" : ""}${channel ? `, ${CHANNEL_LABELS[channel]} only` : ", every channel"}: to the next by` : "Choose keys to set their curve"}</span>
      <span className="view-switch">
        {PLAIN_CURVES.map((c) => <button key={c.curve} disabled={!count || disabled} className={current === c.curve ? "active" : ""} title={c.note} onClick={() => onCurve(c.curve)}>{c.label}</button>)}
      </span>
      <span className="muted small">presets</span>
      <span className="view-switch">
        {PRESET_CURVES.map((c) => <button key={c.curve} disabled={!count || disabled} className={current === c.curve ? "active" : ""} title={c.note} onClick={() => onCurve(c.curve)}>{c.label}</button>)}
      </span>
      {channel && onEveryChannel && <button className="small" onClick={onEveryChannel} title="Set the curve of every channel at once">every channel</button>}
    </div>
  );
}
