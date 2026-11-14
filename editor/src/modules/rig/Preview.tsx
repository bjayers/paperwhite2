// The Rig Editor's preview: the sprite as MCSS draws it (mcss.ts), live from the rig being edited, at the game's
// speed, zoomed with whole pixels. The selected part is outlined with its pivot, and the tool's gizmo moves it: the
// pivot (the pose's), or the current key's move, turn or scale (the key the part shows at the playhead).

import { useEffect, useMemo, useRef } from "react";
import { compose, forward, frameQuads, keyAt, loopCanvas, quadCorners, render, sequenceKeyAt, srtOf, type Canvas, type Pair, type Rig, type Srt } from "./mcss.ts";
import { changeKeys, fixedScale, keyAs, keyPartsAt, moveKeys, orderedKey, partClock, partKeyAt, turnKeysAbout, type Phase } from "./model.ts";
import { pickPart } from "./keying.ts";
import { hue, paletteWords, selectedParts, useClock, type RigView } from "./context.ts";
import { keyPoseAt, wouldCycle, type KeyPose } from "./armature.ts";
import { animationOf, autoKey, localAt, setParent, type Target } from "./armatureEdit.ts";

/** A gizmo drag keying an armature's bone or root: the key poses when it began, the key pose at the playhead. */
interface ArmatureDrag {
  tool: Tool;
  target: Target;
  start: Pair;
  center: Pair;
  /** Screen pixels (y up) to the bone's own move: back through the whole sprite's and the parent's turn and scale. */
  inverse: [number, number, number, number];
  base: KeyPose[];
  frame: number;
  key: KeyPose;
  moved: boolean;
}

/** The whole sprite's movement at a time (the sequence key's: the root as baked). */
function wholeAt(v: RigView, sequence: number, time: number): Srt {
  const seq = v.rig.sequences[sequence];
  return srtOf(sequenceKeyAt(seq, time).key, seq.key_type);
}

export type Tool = "pivot" | "move" | "rotate" | "scale";

export const TOOLS: { tool: Tool; label: string; key: string; note: string }[] = [
  { tool: "pivot", label: "Pivot", key: "P", note: "Drag to move the part's pivot, where it turns and scales about (the pose's, for every key)." },
  { tool: "move", label: "Move", key: "G", note: "Drag to move the part in the current key." },
  { tool: "rotate", label: "Rotate", key: "R", note: "Drag round the part's pivot to turn it in the current key (Shift: 5° steps)." },
  { tool: "scale", label: "Scale", key: "S", note: "Drag away from the pivot or towards it to scale the part in the current key (Shift: only across, Ctrl: only up and down)." },
];

const ONION = 6;

/** A gizmo drag over the chosen parts' keys at the playhead (flat rigs): the rig as it was when it began, with the keys
 * Auto-key split off, and where each key is; every move is worked out from that, so moves don't add up. */
interface GroupDrag {
  tool: Tool;
  start: Pair;
  center: Pair;
  inverse: [number, number, number, number];
  base: Rig;
  targets: { track: number; index: number; origin: Pair }[];
  primary: { track: number; index: number };
  moved: boolean;
}

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

export function Preview({ view, zoom, onion, guides, tool, bones = true, onMessage }: {
  view: RigView; zoom: number; onion: boolean; guides: boolean; tool: Tool; bones?: boolean; onMessage(message: string | null): void;
}) {
  const { rig, clock } = view;
  const sequence = useClock(clock, (s) => s.sequence);
  const stage: Canvas = useMemo(() => loopCanvas(rig, Math.min(sequence, rig.sequences.length - 1)), [rig, sequence]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ view, zoom, onion, guides, tool, stage, bones });
  latest.current = { view, zoom, onion, guides, tool, stage, bones };
  const owners = useRef<Uint8Array | null>(null);
  const drag = useRef<Drag | null>(null);
  const armature = useRef<ArmatureDrag | null>(null);
  const group = useRef<GroupDrag | null>(null);

  const draw = () => {
    const el = canvas.current;
    const { view: v, zoom: z, onion: o, guides: g, tool: tl, stage: st, bones: b } = latest.current;
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
      const frame = render(v.rig, pixelsOf, seq, t, st, idle, { owners: withOwners, hide: v.hidden });
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
    delete el.dataset.root;
    delete el.dataset.group;
    const toScreen = ([x, y]: Pair): Pair => [(st.originX + x) * z, (st.originY - y) * z];
    if (v.source && b) drawBones(ctx, v, seq, time, state.pose, toScreen, z);
    if (v.source && v.sel.root) {
      // The root's gizmo at the feet, where the whole sprite has moved them
      const o = toScreen(forward(0, 0, wholeAt(v, seq, time)));
      el.dataset.root = `${Math.round(o[0])},${Math.round(o[1])}`;
      ctx.strokeStyle = "#f0c75e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (tl === "rotate" || tl === "scale") ctx.arc(o[0], o[1], 30, 0, Math.PI * 2);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(o[0], o[1]);
        ctx.lineTo(o[0] + dx * 18, o[1] + dy * 18);
      }
      ctx.stroke();
      return;
    }
    if (part === null || v.sel.pose !== state.pose) return;
    ctx.lineWidth = 1;
    for (const quad of state.quads.filter((q) => q.part === part)) {
      const [a, b, c, d] = quadCorners(quad).map(toScreen);
      ctx.strokeStyle = hue(part);
      ctx.beginPath();
      ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...d); ctx.lineTo(...c); ctx.closePath();
      ctx.stroke();
    }
    // The other chosen parts: dashed outlines
    const others = v.sel.more.filter((m) => m !== part);
    if (others.length) {
      ctx.setLineDash([3, 3]);
      for (const m of others) {
        for (const quad of state.quads.filter((q) => q.part === m)) {
          const [a, b, c, d] = quadCorners(quad).map(toScreen);
          ctx.strokeStyle = hue(m);
          ctx.beginPath();
          ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...d); ctx.lineTo(...c); ctx.closePath();
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }
    const geometry = partGeometry(v, seq, time, state.pose, part);
    if (!geometry) return;
    const pivot = toScreen(geometry.pivotPoint), center = toScreen(geometry.center);
    if (others.length && (tl === "rotate" || tl === "move")) {
      // (the group's centre: what Rotate turns them about)
      const centers = [part, ...others].map((m) => partGeometry(v, seq, time, state.pose, m)?.center).filter((c): c is Pair => !!c);
      const g = toScreen([centers.reduce((n, c) => n + c[0], 0) / centers.length, centers.reduce((n, c) => n + c[1], 0) / centers.length]);
      el.dataset.group = `${Math.round(g[0])},${Math.round(g[1])}`;
      ctx.strokeStyle = "#ff7ab6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(g[0], g[1], 5, 0, Math.PI * 2);
      ctx.moveTo(g[0] - 9, g[1]); ctx.lineTo(g[0] + 9, g[1]);
      ctx.moveTo(g[0], g[1] - 9); ctx.lineTo(g[0], g[1] + 9);
      ctx.stroke();
    }
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
    // Choosing a bone's parent: the part clicked
    if (v.picking !== null && v.source) {
      if (hit) {
        const parent = v.rig.poses[state.pose].parts[hit - 1].track;
        if (parent === v.picking || wouldCycle(v.source, v.picking, parent)) onMessage(`${v.rig.tracks[parent].name} can't be ${v.rig.tracks[v.picking].name}'s parent: they'd go round in a circle.`);
        else {
          setParent(v, v.picking, parent);
          onMessage(`${v.rig.tracks[v.picking].name} is now parented to ${v.rig.tracks[parent].name}.`);
        }
      }
      v.setPicking(null);
      return;
    }
    // The root's gizmo, at the feet as the whole sprite moves them
    if (v.source && v.sel.root) {
      const whole = wholeAt(v, seq, time);
      const origin = forward(0, 0, whole);
      const close = Math.hypot((st.originX + origin[0]) * z - at[0], (st.originY - origin[1]) * z - at[1]) <= (tl === "move" || tl === "pivot" ? 20 : 40);
      if (close || !hit) {
        if (tl === "pivot") return;
        startArmatureDrag(e, { kind: "root", sequence: seq }, tl, at, [(st.originX + origin[0]) * z, (st.originY - origin[1]) * z], [1, 0, 0, 1]);
        return;
      }
    }
    let part = v.sel.part !== null && v.sel.pose === state.pose && !v.sel.root ? v.sel.part : null;
    // Another part's pixels choose it, but not near the chosen part's gizmo (its pivot often lies over another part)
    const handle = part !== null ? partGeometry(v, seq, time, state.pose, part) : null;
    const near = handle && [handle.center, handle.pivotPoint].some(([x, y]) =>
      Math.hypot((st.originX + x) * z - at[0], (st.originY - y) * z - at[1]) <= (tl === "rotate" || tl === "scale" ? 32 : 12));
    // Shift or Ctrl-click on a part adds it to (or takes it from) the chosen parts, with no drag
    if (hit && !v.source && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      const pick = pickPart(v.sel, hit - 1, e);
      if (pick) { v.select({ pose: state.pose, ...pick }); return; }
    }
    if (hit && hit - 1 !== part && !near) part = hit - 1;
    // A part already among several chosen ones is dragged with them, the main part staying the main one
    if (part !== null && v.sel.part !== null && part !== v.sel.part && selectedParts(v.sel).includes(part)) part = v.sel.part;
    if (part === null) {
      if (!hit) v.select({ part: null, key: null, root: false, keyPose: null });
      return;
    }
    const geometry = partGeometry(v, seq, time, state.pose, part);
    if (!geometry) return;
    const changedPart = part !== v.sel.part || v.sel.root;
    const together = !v.source && tl !== "pivot" && !changedPart ? selectedParts(v.sel) : [part];
    v.select({ pose: state.pose, part, key: { track: geometry.track, index: geometry.keyIndex }, picture: geometry.picture, sequenceKey: null, root: false,
               ...(changedPart ? { keyPose: null } : {}) });
    if (v.source && tl !== "pivot") {
      // The armature: the gizmo keys the bone at the playhead, in its parent's frame (as Blender poses a bone)
      const parent = v.source.bones[geometry.track]?.parent ?? null;
      let linear = compose([geometry.whole]);
      if (parent !== null && v.rig.tracks[parent]) {
        const pTrack = v.rig.tracks[parent];
        const pPart = v.rig.poses[state.pose].parts.find((p) => p.track === parent);
        const pk = keyAt(pTrack, pPart?.play === "continue" ? time : frameQuads(v.rig, seq, time).since);
        linear = compose([srtOf(pk.key, pTrack.key_type), geometry.whole]);
      }
      const [a, b, c, d] = linear;
      const det = a * d - b * c || 1;
      startArmatureDrag(e, { kind: "bone", track: geometry.track }, tl, at, [(st.originX + geometry.center[0]) * z, (st.originY - geometry.center[1]) * z],
                        [d / det, -b / det, -c / det, a / det]);
      return;
    }
    const type = v.rig.tracks[geometry.track].key_type;
    if (tl !== "pivot" && (type === "plain" || (type === "move" && tl !== "move"))) {
      onMessage(`This part's track (${v.rig.tracks[geometry.track].name}) keys ${type === "plain" ? "only a picture" : "only a move"}: give its keys turns and scales under Key (Key type: turn, scale and move) to ${tl} it.`);
      return;
    }
    if (tl !== "pivot") {
      startGroupDrag(e, v, state.pose, together, tl, at, seq, time, geometry);
      return;
    }
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

  /** Starts a gizmo drag over the chosen parts' keys at the playhead: with Auto-key on, a key begins at the playhead for
   * each (the key it is in is split there) when the drag first moves; off, the keys they hold at the playhead change. */
  const startGroupDrag = (e: React.PointerEvent, v: RigView, pose: number, parts: number[], tl: Tool, at: Pair, seq: number, time: number,
                          main: NonNullable<ReturnType<typeof partGeometry>>) => {
    const works = (k: number) => {
      const c = partClock(v.rig, seq, time, pose, k);
      const type = c ? v.rig.tracks[c.track].key_type : null;
      return !!c && (type === "srt" || (type === "move" && tl === "move"));
    };
    const usable = parts.filter(works);
    const made = v.autoKey ? keyPartsAt(v.rig, seq, time, pose, usable) : null;
    const base = made ? made.rig : v.rig;
    const keyOf = (k: number) => {
      if (made) return made.targets.find((t) => t.part === k);
      const c = partClock(v.rig, seq, time, pose, k)!;
      return { part: k, track: c.track, index: keyAt(v.rig.tracks[c.track], c.local).index, created: false };
    };
    const [a, b, c, d] = compose([main.whole]);
    const det = a * d - b * c || 1;
    const inverse: [number, number, number, number] = [d / det, -b / det, -c / det, a / det];
    const geometries = usable.map((k) => [k, partGeometry(v, seq, time, pose, k)] as const).filter(([, g]) => !!g);
    const gx = geometries.reduce((n, [, g]) => n + g!.center[0], 0) / geometries.length;
    const gy = geometries.reduce((n, [, g]) => n + g!.center[1], 0) / geometries.length;
    const st = latest.current.stage, z = latest.current.zoom;
    const targets = geometries.map(([k, g]) => {
      const key = keyOf(k)!;
      // (each key's origin from the group's centre, in the keys' own frame: y down, back through the whole sprite's turn)
      const rx = g!.center[0] - gx, ry = g!.center[1] - gy;
      return { track: key.track, index: key.index, origin: [inverse[0] * rx + inverse[1] * ry, -(inverse[2] * rx + inverse[3] * ry)] as Pair };
    });
    const first = keyOf(parts[0]) ?? targets[0];
    onMessage(parts.length > usable.length ? `${parts.length - usable.length} of the chosen parts' tracks can't ${tl} (give their keys turns and scales under Key); the rest do.` : null);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const centre: Pair = tl === "rotate" && usable.length > 1 ? [(st.originX + gx) * z, (st.originY - gy) * z] : [(st.originX + main.center[0]) * z, (st.originY - main.center[1]) * z];
    group.current = { tool: tl, start: at, center: centre, inverse, base, targets, primary: { track: first.track, index: first.index }, moved: false };
  };

  const onGroupMove = (e: React.PointerEvent, g: GroupDrag) => {
    const { view: v, zoom: z } = latest.current;
    const at = fromEvent(e);
    const sx = (at[0] - g.start[0]) / z, sy = -(at[1] - g.start[1]) / z;
    const [ia, ib, ic, id] = g.inverse;
    const dx = ia * sx + ib * sy, dy = ic * sx + id * sy;
    let next: Rig;
    if (g.tool === "move") {
      if (!g.moved && Math.round(dx) === 0 && Math.round(dy) === 0) return;
      next = moveKeys(g.base, g.targets, [dx, -dy]).rig;
    } else if (g.tool === "rotate") {
      const a0 = Math.atan2(g.start[1] - g.center[1], g.start[0] - g.center[0]);
      const a1 = Math.atan2(at[1] - g.center[1], at[0] - g.center[0]);
      let degrees = ((a1 - a0) * 180) / Math.PI;
      if (e.shiftKey) degrees = Math.round(degrees / 5) * 5;
      if (!g.moved && degrees === 0) return;
      next = turnKeysAbout(g.base, g.targets, [0, 0], degrees).rig;
    } else {
      const r0 = Math.hypot(g.start[0] - g.center[0], g.start[1] - g.center[1]) || 1;
      const ratio = Math.hypot(at[0] - g.center[0], at[1] - g.center[1]) / r0;
      if (!g.moved && Math.abs(ratio - 1) < 0.01) return;
      next = changeKeys(g.base, g.targets, (key) => {
        const scale = key.scale ?? [1, 1];
        return { ...key, scale: [e.ctrlKey ? scale[0] : fixedScale(scale[0] * ratio), e.shiftKey ? scale[1] : fixedScale(scale[1] * ratio)] };
      });
    }
    v.editor.replace(next, g.moved ? "move" : "start");
    if (!g.moved) v.select({ key: g.primary });
    g.moved = true;
  };

  /** Starts a gizmo drag that keys an armature's bone (or root) at the playhead. */
  const startArmatureDrag = (e: React.PointerEvent, target: Target, tl: Tool, at: Pair, center: Pair, inverse: [number, number, number, number]) => {
    const { view: v } = latest.current;
    const anim = animationOf(v, target);
    if (!anim) return;
    onMessage(null);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const frame = localAt(v, target);
    const base = anim.keys;
    const existing = keyPoseAt(base, frame, anim.frames, anim.loop, (k) => k);
    // In the window's coordinates: the canvas grows and shifts as the keyed sprite moves out of its loop's box
    const r = canvas.current!.getBoundingClientRect();
    armature.current = { tool: tl, target, start: [r.left + at[0], r.top + at[1]], center: [r.left + center[0], r.top + center[1]], inverse, base, frame,
                         key: existing.keys[existing.index], moved: false };
  };

  const onArmatureMove = (e: React.PointerEvent, d: ArmatureDrag) => {
    const { view: v, zoom: z } = latest.current;
    const at: Pair = [e.clientX, e.clientY];
    const sx = (at[0] - d.start[0]) / z, sy = -(at[1] - d.start[1]) / z;
    const [ia, ib, ic, id] = d.inverse;
    const dx = ia * sx + ib * sy, dy = ic * sx + id * sy;
    const k = d.key;
    let patch: Partial<KeyPose>;
    if (d.tool === "move") {
      const move = k.move ?? [0, 0];
      const snap = (n: number) => (e.altKey ? Math.round(n * 10) / 10 : Math.round(n));
      patch = { move: [snap(move[0] + dx), snap(move[1] - dy)] };
    } else if (d.tool === "rotate") {
      const a0 = Math.atan2(d.start[1] - d.center[1], d.start[0] - d.center[0]);
      const a1 = Math.atan2(at[1] - d.center[1], at[0] - d.center[0]);
      let degrees = ((a1 - a0) * 180) / Math.PI;
      if (degrees > 180) degrees -= 360;
      if (degrees < -180) degrees += 360;
      if (e.shiftKey) degrees = Math.round(degrees / 5) * 5;
      patch = { rotation: Math.round(((k.rotation ?? 0) + degrees) * 100) / 100 };
    } else {
      const r0 = Math.hypot(d.start[0] - d.center[0], d.start[1] - d.center[1]) || 1;
      const ratio = Math.hypot(at[0] - d.center[0], at[1] - d.center[1]) / r0;
      const scale = k.scale ?? [1, 1];
      patch = { scale: [e.ctrlKey ? scale[0] : fixedScale(scale[0] * ratio), e.shiftKey ? scale[1] : fixedScale(scale[1] * ratio)] };
    }
    const index = autoKey(v, d.target, d.base, (key) => ({ ...key, ...patch }), d.moved ? "move" : "start", d.frame);
    if (!d.moved) v.select({ keyPose: index });
    d.moved = true;
  };

  const onMove = (e: React.PointerEvent) => {
    if (armature.current) {
      onArmatureMove(e, armature.current);
      return;
    }
    if (group.current) {
      onGroupMove(e, group.current);
      return;
    }
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
    armature.current = null;
    group.current = null;
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

/** An armature's bones over the preview, as Blender draws them: each from its joint (the pivot where its key has moved
 * it) toward its picture's middle, a dashed line from each to its parent's tail (or to the root at the feet). */
function drawBones(ctx: CanvasRenderingContext2D, v: RigView, sequence: number, time: number, pose: number, toScreen: (p: Pair) => Pair, z: number) {
  const source = v.source;
  if (!source) return;
  const parts = v.rig.poses[pose]?.parts ?? [];
  const state = frameQuads(v.rig, sequence, time, v.clock.idle());
  const joints = new Map<number, { head: Pair; tail: Pair; part: number }>();
  parts.forEach((p, k) => {
    const g = partGeometry(v, sequence, time, pose, k);
    if (!g) return;
    const quad = state.quads.find((q) => q.part === k && q.rectangleIndex === 0);
    const corners = quad ? quadCorners(quad) : [g.center];
    const middle: Pair = [corners.reduce((n, c) => n + c[0], 0) / corners.length, corners.reduce((n, c) => n + c[1], 0) / corners.length];
    joints.set(p.track, { head: toScreen(g.center), tail: toScreen(middle), part: k });
  });
  const root = toScreen(forward(0, 0, wholeAt(v, sequence, time)));
  ctx.save();
  // Links: to the parent's tail, or to the root
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(240, 199, 94, 0.75)";
  for (const [track, j] of joints) {
    const parent = source.bones[track]?.parent ?? null;
    const to = parent !== null ? joints.get(parent)?.tail : root;
    if (!to) continue;
    ctx.beginPath();
    ctx.moveTo(...j.head);
    ctx.lineTo(...to);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const [, j] of joints) {
    const chosen = !v.sel.root && v.sel.part === j.part && v.sel.pose === pose;
    const [hx, hy] = j.head;
    let [dx, dy] = [j.tail[0] - hx, j.tail[1] - hy];
    let length = Math.hypot(dx, dy);
    if (length < 4 * z) {
      // (a picture centred on its pivot: a short bone pointing up)
      dx = 0; dy = -6 * z; length = 6 * z;
    }
    const ux = dx / length, uy = dy / length;
    const w = Math.min(length * 0.16, 3 * z);
    const mx = hx + dx * 0.22, my = hy + dy * 0.22;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(mx - uy * w, my + ux * w);
    ctx.lineTo(hx + dx, hy + dy);
    ctx.lineTo(mx + uy * w, my - ux * w);
    ctx.closePath();
    ctx.fillStyle = chosen ? "rgba(255, 211, 61, 0.55)" : "rgba(170, 200, 230, 0.35)";
    ctx.strokeStyle = chosen ? "#ffd33d" : "rgba(20, 30, 40, 0.85)";
    ctx.lineWidth = 1.2;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx, hy, Math.max(2, w * 0.45), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // The root: a ring at the feet
  ctx.beginPath();
  ctx.arc(root[0], root[1], 5, 0, Math.PI * 2);
  ctx.strokeStyle = v.sel.root ? "#ffd33d" : "rgba(240, 199, 94, 0.9)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}
