// The Rig Editor's preview: the sprite as MCSS draws it (mcss.ts), live from the rig being edited, at the game's
// speed, zoomed with whole pixels. The selected part is outlined with its pivot, and the tool's gizmo moves it: the
// pivot (the pose's), or the current key's move, turn or scale (the key the part shows at the playhead).

import { useEffect, useMemo, useRef } from "react";
import { compose, forward, frameQuads, loopCanvas, quadCorners, render, type Canvas, type Pair, type Srt } from "./mcss.ts";
import { fixedScale, keyAs, orderedKey, partKeyAt, type Phase } from "./model.ts";
import { hue, paletteWords, useClock, type RigView } from "./context.ts";

export type Tool = "pivot" | "move" | "rotate" | "scale";

export const TOOLS: { tool: Tool; label: string; key: string; note: string }[] = [
  { tool: "pivot", label: "Pivot", key: "P", note: "Drag to move the part's pivot, where it turns and scales about (the pose's, for every key)." },
  { tool: "move", label: "Move", key: "G", note: "Drag to move the part in the current key." },
  { tool: "rotate", label: "Rotate", key: "R", note: "Drag round the part's pivot to turn it in the current key (Shift: 5° steps)." },
  { tool: "scale", label: "Scale", key: "S", note: "Drag away from the pivot or towards it to scale the part in the current key (Shift: only across, Ctrl: only up and down)." },
];

const ONION = 6;

interface Drag {
  tool: Tool;
  start: Pair;
  /** The inverse of the whole sprite's turn and scale, for moves. */
  inverse: [number, number, number, number];
  center: Pair;
  pose: number;
  part: number;
  track: number;
  key: number;
  pivot: Pair;
  original: Record<string, unknown>;
  moved: boolean;
}

export function Preview({ view, zoom, onion, guides, tool, onMessage }: {
  view: RigView; zoom: number; onion: boolean; guides: boolean; tool: Tool; onMessage(message: string | null): void;
}) {
  const { rig, clock } = view;
  const sequence = useClock(clock, (s) => s.sequence);
  const stage: Canvas = useMemo(() => loopCanvas(rig, Math.min(sequence, rig.sequences.length - 1)), [rig, sequence]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ view, zoom, onion, guides, tool, stage });
  latest.current = { view, zoom, onion, guides, tool, stage };
  const owners = useRef<Uint8Array | null>(null);
  const drag = useRef<Drag | null>(null);

  const draw = () => {
    const el = canvas.current;
    const { view: v, zoom: z, onion: o, guides: g, tool: tl, stage: st } = latest.current;
    if (!el) return;
    const ctx = el.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, el.width, el.height);
    const pixelsOf = v.art?.sheets[v.sheet];
    const words = paletteWords(v.shiny ? (v.art?.shiny ?? []) : (v.art?.normal ?? []));
    const { sequence: seq } = v.clock.state;
    const time = v.clock.frameTime;
    const idle = v.clock.idle();
    if (g) {
      ctx.strokeStyle = "rgba(128,128,128,0.45)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, st.originY * z + 0.5);
      ctx.lineTo(el.width, st.originY * z + 0.5);
      ctx.moveTo(st.originX * z + 0.5, 0);
      ctx.lineTo(st.originX * z + 0.5, el.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!pixelsOf || seq >= v.rig.sequences.length) return;
    const image = (t: number, alpha: number, withOwners: boolean) => {
      const frame = render(v.rig, pixelsOf, seq, t, st, idle, { owners: withOwners });
      const data = new ImageData(st.width, st.height);
      const out = new Uint32Array(data.data.buffer);
      for (let i = 0; i < frame.pixels.length; i++) out[i] = words[frame.pixels[i]];
      const off = new OffscreenCanvas(st.width, st.height);
      off.getContext("2d")!.putImageData(data, 0, 0);
      ctx.globalAlpha = alpha;
      ctx.drawImage(off, 0, 0, st.width * z, st.height * z);
      ctx.globalAlpha = 1;
      return frame;
    };
    try {
      if (o) {
        if (time >= ONION) image(time - ONION, 0.22, false);
        image(time + ONION, 0.22, false);
      }
      owners.current = image(time, 1, true).owners ?? null;
    } catch (e) {
      owners.current = null;
      ctx.fillStyle = "#e5534b";
      ctx.font = "12px sans-serif";
      ctx.fillText((e as Error).message, 6, 16);
      return;
    }
    // The selected part: its rectangles outlined, its pivot, and the tool's gizmo
    const state = frameQuads(v.rig, seq, time, idle);
    const part = v.sel.part;
    delete el.dataset.center;
    delete el.dataset.pivot;
    if (part === null || v.sel.pose !== state.pose) return;
    const toScreen = ([x, y]: Pair): Pair => [(st.originX + x) * z, (st.originY - y) * z];
    ctx.lineWidth = 1;
    for (const quad of state.quads.filter((q) => q.part === part)) {
      const [a, b, c, d] = quadCorners(quad).map(toScreen);
      ctx.strokeStyle = hue(part);
      ctx.beginPath();
      ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...d); ctx.lineTo(...c); ctx.closePath();
      ctx.stroke();
    }
    const geometry = partGeometry(v, seq, time, state.pose, part);
    if (!geometry) return;
    const pivot = toScreen(geometry.pivotPoint), center = toScreen(geometry.center);
    // (where the gizmo is, for scripts that drive the page)
    el.dataset.center = `${Math.round(center[0])},${Math.round(center[1])}`;
    el.dataset.pivot = `${Math.round(pivot[0])},${Math.round(pivot[1])}`;
    ctx.strokeStyle = "#ffd33d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pivot[0] - 7, pivot[1]); ctx.lineTo(pivot[0] + 7, pivot[1]);
    ctx.moveTo(pivot[0], pivot[1] - 7); ctx.lineTo(pivot[0], pivot[1] + 7);
    ctx.stroke();
    ctx.strokeStyle = "#58a6ff";
    if (tl === "move") {
      ctx.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(center[0], center[1]);
        ctx.lineTo(center[0] + dx * 16, center[1] + dy * 16);
        ctx.moveTo(center[0] + dx * 16 - dy * 4 - dx * 4, center[1] + dy * 16 - dx * 4 - dy * 4);
        ctx.lineTo(center[0] + dx * 16, center[1] + dy * 16);
        ctx.lineTo(center[0] + dx * 16 + dy * 4 - dx * 4, center[1] + dy * 16 + dx * 4 - dy * 4);
      }
      ctx.stroke();
    } else if (tl === "rotate") {
      const r = 26;
      ctx.beginPath();
      ctx.arc(center[0], center[1], r, 0, Math.PI * 2);
      ctx.stroke();
      const a = (geometry.rotation / 65536) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(center[0], center[1]);
      ctx.lineTo(center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r);
      ctx.stroke();
    } else if (tl === "scale") {
      const [ax, ay] = geometry.axes;
      ctx.beginPath();
      for (const [vx, vy] of [ax, ay]) {
        const end: Pair = [center[0] + vx * 20, center[1] + vy * 20];
        ctx.moveTo(...center); ctx.lineTo(...end);
        ctx.rect(end[0] - 3, end[1] - 3, 6, 6);
      }
      ctx.stroke();
    }
  };

  useEffect(() => clock.subscribe(draw));
  useEffect(() => { draw(); });

  const fromEvent = (e: React.PointerEvent): Pair => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const { view: v, zoom: z, stage: st, tool: tl } = latest.current;
    const at = fromEvent(e);
    const col = Math.floor(at[0] / z), row = Math.floor(at[1] / z);
    const hit = owners.current && col >= 0 && row >= 0 && col < st.width && row < st.height ? owners.current[row * st.width + col] : 0;
    v.clock.play(false);
    const time = v.clock.frameTime;
    const seq = v.clock.state.sequence;
    let state;
    try {
      state = frameQuads(v.rig, seq, time, v.clock.idle());
    } catch {
      return;
    }
    let part = v.sel.part !== null && v.sel.pose === state.pose ? v.sel.part : null;
    // Another part's pixels choose it, but not near the chosen part's gizmo (its pivot often lies over another part)
    const handle = part !== null ? partGeometry(v, seq, time, state.pose, part) : null;
    const near = handle && [handle.center, handle.pivotPoint].some(([x, y]) =>
      Math.hypot((st.originX + x) * z - at[0], (st.originY - y) * z - at[1]) <= (tl === "rotate" || tl === "scale" ? 32 : 12));
    if (hit && hit - 1 !== part && !near) part = hit - 1;
    if (part === null) {
      if (!hit) v.select({ part: null, key: null });
      return;
    }
    const geometry = partGeometry(v, seq, time, state.pose, part);
    if (!geometry) return;
    v.select({ pose: state.pose, part, key: { track: geometry.track, index: geometry.keyIndex }, picture: geometry.picture, sequenceKey: null });
    const type = v.rig.tracks[geometry.track].key_type;
    if (tl !== "pivot" && (type === "plain" || (type === "move" && tl !== "move"))) {
      onMessage(`This part's track (${v.rig.tracks[geometry.track].name}) keys ${type === "plain" ? "only a picture" : "only a move"}: give its keys turns and scales under Key (Key type: turn, scale and move) to ${tl} it.`);
      return;
    }
    onMessage(null);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const [a, b, c, d] = compose([geometry.whole]);
    const det = a * d - b * c || 1;
    drag.current = {
      tool: tl, start: at, inverse: [d / det, -b / det, -c / det, a / det],
      center: [(st.originX + geometry.center[0]) * z, (st.originY - geometry.center[1]) * z],
      pose: state.pose, part, track: geometry.track, key: geometry.keyIndex,
      pivot: v.rig.poses[state.pose].parts[part].pivot,
      original: { ...v.rig.tracks[geometry.track].keys[geometry.keyIndex] }, moved: false,
    };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const { view: v, zoom: z } = latest.current;
    const at = fromEvent(e);
    // The screen's change in the sprite's pixels (y up), undone through the whole sprite's turn and scale
    const sx = (at[0] - d.start[0]) / z, sy = -(at[1] - d.start[1]) / z;
    const [ia, ib, ic, id] = d.inverse;
    const dx = ia * sx + ib * sy, dy = ic * sx + id * sy;
    const phase: Phase = d.moved ? "move" : "start";
    const key = d.original as { rotation?: number; scale?: Pair; move?: Pair };
    const type = v.rig.tracks[d.track].key_type;
    if (d.tool === "pivot") {
      const pivot: Pair = [Math.round(d.pivot[0] + dx), Math.round(d.pivot[1] - dy)];
      if (pivot[0] === v.rig.poses[d.pose].parts[d.part].pivot[0] && pivot[1] === v.rig.poses[d.pose].parts[d.part].pivot[1]) return;
      v.editor.set(["poses", d.pose, "parts", d.part, "pivot"], pivot, phase);
    } else {
      let next: Record<string, unknown> = { ...key };
      if (d.tool === "move") {
        const move = key.move ?? [0, 0];
        next.move = [Math.round(move[0] + dx), Math.round(move[1] - dy)];
      } else if (d.tool === "rotate") {
        const a0 = Math.atan2(d.start[1] - d.center[1], d.start[0] - d.center[0]);
        const a1 = Math.atan2(at[1] - d.center[1], at[0] - d.center[0]);
        let degrees = ((a1 - a0) * 180) / Math.PI;
        if (e.shiftKey) degrees = Math.round(degrees / 5) * 5;
        next.rotation = ((Math.round((key.rotation ?? 0) + (degrees / 360) * 65536) % 65536) + 65536) % 65536;
      } else {
        const r0 = Math.hypot(d.start[0] - d.center[0], d.start[1] - d.center[1]) || 1;
        const r1 = Math.hypot(at[0] - d.center[0], at[1] - d.center[1]);
        const ratio = r1 / r0;
        const scale = key.scale ?? [1, 1];
        next.scale = [e.ctrlKey ? scale[0] : fixedScale(scale[0] * ratio), e.shiftKey ? scale[1] : fixedScale(scale[1] * ratio)];
      }
      next = keyAs(orderedKey(next as never), type) as never;
      v.editor.set(["tracks", d.track, "keys", d.key], next, phase);
    }
    d.moved = true;
  };

  const onUp = () => {
    drag.current = null;
  };

  return (
    <canvas ref={canvas} className="rig-preview-canvas" width={stage.width * zoom} height={stage.height * zoom}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      style={{ cursor: tool === "rotate" ? "grab" : tool === "scale" ? "nwse-resize" : "move" }} />
  );
}

/** Where a part is at a time: its pivot, its key's origin (the pivot and the key's move), its turn, its axes on the
 * screen, and the key and picture it shows. */
export function partGeometry(v: RigView, sequence: number, time: number, pose: number, part: number) {
  const at = partKeyAt(v.rig, sequence, time, pose, part);
  if (!at) return null;
  const seq = v.rig.sequences[sequence];
  const multi = seq.keys.length ? frameQuads(v.rig, sequence, time).quads.find((q) => q.part === part) : undefined;
  const p = v.rig.poses[pose].parts[part];
  const track = v.rig.tracks[at.track];
  const keySrt: Srt = track.key_type === "srt" ? [at.key.rotation ?? 0, at.key.scale?.[0] ?? 1, at.key.scale?.[1] ?? 1, at.key.move?.[0] ?? 0, at.key.move?.[1] ?? 0]
    : track.key_type === "move" ? [0, 1, 1, at.key.move?.[0] ?? 0, at.key.move?.[1] ?? 0] : [0, 1, 1, 0, 0];
  const pivotSrt: Srt = [0, 1, 1, p.pivot[0], p.pivot[1]];
  const whole: Srt = multi?.transforms[2] ?? [0, 1, 1, 0, 0];
  const through = (point: Pair, ts: Srt[]) => ts.reduce<Pair>((q, t) => forward(q[0], q[1], t), point);
  const center = through([0, 0], [keySrt, pivotSrt, whole]);
  const pivotPoint = through([0, 0], [pivotSrt, whole]);
  // The part's x and y axes on the screen (y down), for the scale gizmo
  const ax = through([1, 0], [keySrt, pivotSrt, whole]), ay = through([0, -1], [keySrt, pivotSrt, whole]);
  const unit = (q: Pair): Pair => {
    const vx = q[0] - center[0], vy = -(q[1] - center[1]);
    const n = Math.hypot(vx, vy) || 1;
    return [vx / n, vy / n];
  };
  return { track: at.track, keyIndex: at.index, picture: at.key.picture ?? 0, center, pivotPoint, whole,
           rotation: keySrt[0], axes: [unit(ax), unit(ay)] as [Pair, Pair] };
}
