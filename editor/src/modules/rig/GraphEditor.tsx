// The Rig Editor's graph editor, as Blender's: the chosen bone's (or the root's) channels as curves over its own time,
// move x and y, turn, scale x and y, through its key poses; and dashed under them the values the bake holds, sampled at
// the step and at each key pose, as the game plays them. Click a key to choose it, drag it (in time and value; Shift
// keeps to the way it went first), drag a Bézier key's handles (the other follows, Alt breaks them); the curve menu
// sets how the chosen channel (or every channel) goes on to the next key pose. A click elsewhere moves the playhead.

import { useEffect, useMemo, useRef, useState } from "react";
import { useClock, type RigView } from "./context.ts";
import { boneStep, channelAt, channelValue, CHANNEL_LABELS, CHANNELS, CURVES, curveOf, handlesOf, segmentAt, sequenceStep, withChannel,
         type Channel, type Curve, type Handle, type KeyPose } from "./armature.ts";
import { animationOf, localAt, setKeys, targetName, targetOf } from "./armatureEdit.ts";
import { fixedScale } from "./model.ts";

const COLORS: Record<Channel, string> = { move_x: "#e5534b", move_y: "#57ab5a", rotation: "#539bf5", scale_x: "#d29922", scale_y: "#b083f0" };
const MARGIN = { left: 46, right: 12, top: 12, bottom: 20 };

/** A value as a channel's key holds it in the editor: pixels and degrees to a hundredth, scale to 1/4096. */
const tidy = (channel: Channel, v: number) => (channel.startsWith("scale") ? fixedScale(v) : Math.round(v * 100) / 100) + 0;

type Range = [number, number];

interface Drag {
  kind: "key" | "handle";
  index: number;
  channel: Channel;
  side?: 0 | 1;
  start: [number, number];
  base: KeyPose[];
  ranges: Record<string, Range>;
  moved: boolean;
  lock?: "x" | "y";
}

export function GraphEditor({ view }: { view: RigView }) {
  const { source, sel, select, clock } = view;
  const target = targetOf(view);
  const anim = target ? animationOf(view, target) : null;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<[number, number]>([600, 200]);
  const [normalize, setNormalize] = useState(true);
  const [picked, setPicked] = useState<Set<Channel> | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const drag = useRef<Drag | null>(null);
  const targetKey = target ? (target.kind === "root" ? `root${target.sequence}` : `bone${target.track}`) : "";
  useEffect(() => { setPicked(null); setChannel(null); }, [targetKey]);
  useClock(clock, (s) => Math.floor(s.time));

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize([Math.max(200, el.clientWidth), Math.max(80, el.clientHeight)]));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const keys = anim?.keys ?? [];
  const frames = Math.max(anim?.frames ?? 1, 1);
  const loop = anim?.loop ?? true;
  // The channels the target uses: those that change, else its moves
  const used = useMemo(() => {
    const out = CHANNELS.filter((c) => keys.some((k) => channelValue(k, c) !== channelValue(keys[0], c)));
    return out.length ? out : (["move_x", "move_y"] as Channel[]);
  }, [keys]);
  const shown = CHANNELS.filter((c) => (picked ?? new Set(used)).has(c));
  const step = !target || !source ? 6 : target.kind === "root" ? sequenceStep(source, target.sequence) : boneStep(source, view.rig, target.track);

  const valueAt = (c: Channel, t: number) => channelAt(keys, segmentAt(keys, t), c, t, frames, loop);
  const rangeOf = (c: Channel): Range => {
    let lo = Infinity, hi = -Infinity;
    const add = (v: number) => { lo = Math.min(lo, v); hi = Math.max(hi, v); };
    for (let t = 0; t <= frames; t += Math.max(1, frames / 300)) add(valueAt(c, t));
    keys.forEach((k, i) => {
      add(channelValue(k, c));
      if (curveOf(k, c) === "bezier" || (i > 0 && curveOf(keys[i - 1], c) === "bezier")) for (const h of handlesOf(keys, i, c, frames)) add(channelValue(k, c) + h[1]);
    });
    const unit = c.startsWith("scale") ? 0.1 : 1;
    if (hi - lo < unit) { const mid = (hi + lo) / 2; lo = mid - unit; hi = mid + unit; }
    const pad = (hi - lo) * 0.1;
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
  const plotW = w - MARGIN.left - MARGIN.right, plotH = h - MARGIN.top - MARGIN.bottom;
  const xOf = (f: number) => MARGIN.left + (f / frames) * plotW;
  const frameOf = (x: number) => ((x - MARGIN.left) / plotW) * frames;
  const yOf = (c: Channel, v: number, r = ranges) => { const [lo, hi] = r[c] ?? [0, 1]; return MARGIN.top + (1 - (v - lo) / (hi - lo)) * plotH; };
  const valueOfY = (c: Channel, y: number, r = ranges) => { const [lo, hi] = r[c] ?? [0, 1]; return lo + (1 - (y - MARGIN.top) / plotH) * (hi - lo); };
  const playhead = target ? localAt(view, target) : 0;
  const chosen = sel.keyPose !== null && sel.keyPose < keys.length ? sel.keyPose : null;

  /** The handles shown: the chosen key pose's, on the channels whose curves are Bézier on either side. */
  const handleList = () => {
    const out: { channel: Channel; side: 0 | 1; at: [number, number] }[] = [];
    if (chosen === null) return out;
    const k = keys[chosen];
    for (const c of shown) {
      if (channel && c !== channel) continue;
      const [left, right] = handlesOf(keys, chosen, c, frames);
      const v = channelValue(k, c);
      if (chosen > 0 && curveOf(keys[chosen - 1], c) === "bezier") out.push({ channel: c, side: 0, at: [xOf(k.frame + left[0]), yOf(c, v + left[1])] });
      if (curveOf(k, c) === "bezier") out.push({ channel: c, side: 1, at: [xOf(k.frame + right[0]), yOf(c, v + right[1])] });
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
    // Frames: a line every step, labels every few
    const every = frames / (plotW / 40) > 30 ? 60 : frames / (plotW / 40) > 12 ? 24 : frames / (plotW / 40) > 6 ? 12 : 6;
    for (let f = 0; f <= frames; f += step) {
      ctx.strokeStyle = f % every === 0 ? border : "rgba(128,128,128,0.15)";
      ctx.beginPath(); ctx.moveTo(xOf(f) + 0.5, MARGIN.top); ctx.lineTo(xOf(f) + 0.5, h - MARGIN.bottom); ctx.stroke();
      if (f % every === 0) { ctx.fillStyle = muted; ctx.fillText(String(f), xOf(f) + 2, h - 6); }
    }
    if (!anim || !shown.length) return;
    // Values: the range's ends of the first channel shown (all of them when not normalized)
    ctx.fillStyle = muted;
    for (const c of normalize ? shown.slice(0, 1) : shown.slice(0, 1)) {
      const [lo, hi] = ranges[c];
      ctx.fillText(`${+hi.toFixed(2)}`, 4, MARGIN.top + 8);
      ctx.fillText(`${+lo.toFixed(2)}`, 4, h - MARGIN.bottom);
      if (!normalize && lo < 0 && hi > 0) {
        ctx.strokeStyle = border;
        ctx.beginPath(); ctx.moveTo(MARGIN.left, yOf(c, 0)); ctx.lineTo(w - MARGIN.right, yOf(c, 0)); ctx.stroke();
        ctx.fillText("0", 4, yOf(c, 0) + 3);
      }
    }
    // The baked values: held from each sample (the step's and each key pose's) to the next
    const samples = new Set<number>();
    for (let f = 0; f < frames; f += step) samples.add(f);
    for (const k of keys) if (k.frame <= frames) samples.add(k.frame);
    const times = [...samples].sort((a, b) => a - b);
    for (const c of shown) {
      ctx.strokeStyle = COLORS[c];
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      times.forEach((t, i) => {
        const v = valueAt(c, t);
        const end = i + 1 < times.length ? times[i + 1] : frames;
        const y = yOf(c, c === "rotation" ? Math.round((v / 360) * 65536) / 65536 * 360 : c.startsWith("move") ? Math.round(v) : fixedScale(v));
        if (i === 0) ctx.moveTo(xOf(t), y); else ctx.lineTo(xOf(t), y);
        ctx.lineTo(xOf(end), y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      // The curve
      ctx.lineWidth = channel === c ? 2.2 : 1.5;
      ctx.beginPath();
      const n = Math.max(2, Math.ceil(plotW / 2));
      for (let s = 0; s <= n; s++) {
        const t = (s / n) * frames;
        const y = yOf(c, valueAt(c, t));
        if (s === 0) ctx.moveTo(xOf(t), y); else ctx.lineTo(xOf(t), y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      // The keys
      keys.forEach((k, i) => {
        const x = xOf(k.frame), y = yOf(c, channelValue(k, c));
        ctx.beginPath();
        ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath();
        ctx.fillStyle = i === chosen ? (channel === null || channel === c ? "#ffffff" : "#ffd33d") : COLORS[c];
        ctx.strokeStyle = "#111";
        ctx.fill(); ctx.stroke();
      });
    }
    // The chosen key pose's handles
    if (chosen !== null) {
      const k = keys[chosen];
      for (const handle of handleList()) {
        const kx = xOf(k.frame), ky = yOf(handle.channel, channelValue(k, handle.channel));
        ctx.strokeStyle = COLORS[handle.channel];
        ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(...handle.at); ctx.stroke();
        ctx.beginPath(); ctx.arc(handle.at[0], handle.at[1], 4, 0, Math.PI * 2);
        ctx.fillStyle = "#111"; ctx.fill(); ctx.stroke();
      }
    }
    // The playhead
    ctx.strokeStyle = "#e5534b";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(xOf(playhead), MARGIN.top - 4); ctx.lineTo(xOf(playhead), h - MARGIN.bottom); ctx.stroke();
    ctx.lineWidth = 1;
  });

  if (!source) return <p className="muted ow-note">The graph editor shows an armature's curves: convert the rig to an armature first (Armature, in the side panel).</p>;
  if (!target || !anim) return <p className="muted ow-note">Choose a bone (a part on the preview, a bone in the outliner) or the Root to see its curves.</p>;

  const pointerAt = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const write = (next: KeyPose[], d: Drag, index: number) => {
    setKeys(view, target, next, d.moved ? "move" : "start");
    d.moved = true;
    const order = next.map((k, i) => [k, i] as const).sort((a, b) => a[0].frame - b[0].frame || a[1] - b[1]).map(([, i]) => i);
    select({ keyPose: order.indexOf(index) });
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const [px, py] = pointerAt(e);
    clock.play(false);
    const near = (x: number, y: number) => Math.hypot(x - px, y - py) <= 7;
    for (const handle of handleList()) {
      if (near(...handle.at)) {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { kind: "handle", index: chosen!, channel: handle.channel, side: handle.side, start: [px, py], base: keys, ranges: { ...ranges }, moved: false };
        return;
      }
    }
    for (const c of [...shown].reverse()) {
      for (let i = keys.length - 1; i >= 0; i--) {
        if (near(xOf(keys[i].frame), yOf(c, channelValue(keys[i], c)))) {
          select({ keyPose: i });
          setChannel(c);
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { kind: "key", index: i, channel: c, start: [px, py], base: keys, ranges: { ...ranges }, moved: false };
          return;
        }
      }
    }
    // Elsewhere: the playhead, in this bone's time (on from where its pose's stretch began)
    const frame = Math.max(0, Math.min(frames, Math.round(frameOf(px))));
    const time = target.kind === "root" ? frame : Math.max(0, clock.frameTime - playhead + frame);
    clock.seek(time);
    setChannel(null);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const [px, py] = pointerAt(e);
    const key = d.base[d.index];
    if (d.kind === "key") {
      let dx = px - d.start[0], dy = py - d.start[1];
      if (e.shiftKey) {
        d.lock ??= Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (d.lock === "x") dy = 0; else dx = 0;
      } else d.lock = undefined;
      let frame = Math.round(key.frame + (dx / plotW) * frames);
      frame = Math.max(0, Math.min(anim.frames, frame));
      const y0 = yOf(d.channel, channelValue(key, d.channel), d.ranges);
      const value = tidy(d.channel, valueOfY(d.channel, y0 + dy, d.ranges));
      const next = d.base.map((k, i) => (i === d.index ? withChannel({ ...k, frame }, d.channel, dy ? value : channelValue(k, d.channel)) : k));
      write(next, d, d.index);
    } else {
      const c = d.channel;
      const v = channelValue(key, c);
      let dt = frameOf(px) - key.frame;
      const dv = valueOfY(c, py, d.ranges) - v;
      dt = d.side === 0 ? Math.min(0, dt) : Math.max(0, dt);
      const handles = handlesOf(d.base, d.index, c, anim.frames).map((x) => [...x] as Handle) as [Handle, Handle];
      const mine: Handle = [Math.round(dt * 100) / 100, tidy(c, dv)];
      handles[d.side!] = mine;
      if (!e.altKey && Math.abs(dt) > 1e-6) {
        // Aligned, as Blender's: the other handle keeps its length in time and points the opposite way
        const other = handles[1 - d.side!];
        const r = Math.abs(other[0]) / Math.abs(dt);
        handles[1 - d.side!] = [-dt * r, tidy(c, -dv * r)];
        handles[1 - d.side!][0] = Math.round(handles[1 - d.side!][0] * 100) / 100;
      }
      const next = d.base.map((k, i) => (i === d.index ? { ...k, handles: { ...(k.handles ?? {}), [c]: handles } } : k));
      write(next, d, d.index);
    }
  };

  const onUp = () => { drag.current = null; };

  const setCurve = (curve: Curve) => {
    if (chosen === null) return;
    const k = keys[chosen];
    let next: KeyPose;
    if (channel) {
      const curves = { ...(k.curves ?? {}), [channel]: curve };
      if (curve === (k.curve ?? "constant")) delete curves[channel];
      next = { ...k, curves: Object.keys(curves).length ? curves : undefined };
    } else next = { ...k, curve, curves: undefined };
    setKeys(view, target, keys.map((x, i) => (i === chosen ? next : x)));
  };

  const k = chosen !== null ? keys[chosen] : null;
  return (
    <div className="rig-graph">
      <div className="rig-graph-head">
        <b>{targetName(view, target)}</b>
        <span className="muted">{frames} frames · baked every {step} (dashed)</span>
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
        <span className="spacer" />
        <span className="muted">{k ? `key pose ${chosen! + 1} (frame ${k.frame})${channel ? `, ${CHANNEL_LABELS[channel]}` : ", every channel"}:` : "choose a key"}</span>
        <select disabled={!k} value={k ? curveOf(k, channel ?? "move_x") : "constant"} onChange={(e) => setCurve(e.target.value as Curve)} title="How it goes on to the next key pose">
          {CURVES.map((c) => <option key={c.curve} value={c.curve}>{c.label}</option>)}
        </select>
        {channel && <button onClick={() => setChannel(null)} title="Set every channel's curve at once">every channel</button>}
      </div>
      <div className="rig-graph-canvas-wrap" ref={wrap}>
        <canvas ref={canvas} className="rig-graph-canvas" style={{ width: w, height: h }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      </div>
    </div>
  );
}
