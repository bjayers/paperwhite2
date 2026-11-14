// The new Rig Editor's preview of the rig setup: the default pose drawn as MCSS draws it (the source's bake, setup.ts
// defaultPoseRig), the bones over it from head to tail (Blender's octahedral shape: the round end the head, where the
// bone turns, the small end the tail), and the tools:
// - Bones (B): drag a head to move the pivot (the pictures stay), a tail to point the bone (connected children's heads
//   follow), a bone's body to move it with its pictures, a picture to move it on its bone; drag on empty space to draw
//   a new bone from head to tail (Ctrl: a child of the chosen bone, connected when drawn from its tail).
// - Move (G), Rotate (R), Scale (S): the chosen bones' default pose (the rest arrangement every sequence starts and
//   ends at), Scale with an X and a Y handle each scaling one axis and a ring scaling both.

import { useEffect, useMemo, useRef } from "react";
import { canvasOf, frameQuads, quadBox, render, type Canvas, type Pair } from "./mcss.ts";
import { fixedScale } from "./model.ts";
import { hue, paletteWords } from "./context.ts";
import { addBone, axesOf, boneEnds, moveBone, moveHead, movePieces, moveTail, parentMapOf, parentOf, restDelta, setDefault } from "./setup.ts";
import { pickBone, type SetupView } from "./setupContext.ts";
import { layersOf, type V2 } from "./v2.ts";
import type { Map2 } from "./armature.ts";

export type SetupTool = "bones" | "move" | "rotate" | "scale";

export const SETUP_TOOLS: { tool: SetupTool; label: string; key: string; note: string }[] = [
  { tool: "bones", label: "Bones", key: "B", note: "Drag a bone's round end (its head, the pivot it turns about) to move it: the pictures stay where they are. Drag its small end (the tail) to point it; connected children's heads follow. Drag a bone's body to move it with its pictures, a picture to move it on its bone, and empty space to draw a new bone from head to tail (Ctrl: a child of the chosen bone)." },
  { tool: "move", label: "Move", key: "G", note: "Drag to move the chosen bones in the default pose (a connected bone's head is locked to its parent's tail: turn it instead)." },
  { tool: "rotate", label: "Rotate", key: "R", note: "Drag round the chosen bone's head to turn the chosen bones in the default pose (Shift: 5° steps)." },
  { tool: "scale", label: "Scale", key: "S", note: "Drag the red X handle to scale across only, the green Y handle for up and down only, or the ring (or anywhere else) for both; Shift locks the ring's drag to the nearer axis." },
];

// ---------------------------------------------------------------- The Scale gizmo's handles (from the paused first-editor branch)

type ScaleAxis = "x" | "y" | "both";
interface ScaleGrab { axis: ScaleAxis; axes: [Pair, Pair] }
/** The handles' distance from the bone's head, and the ring's radius, in canvas pixels. */
const HANDLE = 36, RING = 22;

function grabOf(at: Pair, center: Pair, axes: [Pair, Pair]): ScaleGrab {
  const names: ScaleAxis[] = ["x", "y"];
  for (let i = 0; i < 2; i++) {
    const end: Pair = [center[0] + axes[i][0] * HANDLE, center[1] + axes[i][1] * HANDLE];
    if (Math.hypot(at[0] - end[0], at[1] - end[1]) <= 11) return { axis: names[i], axes };
  }
  return { axis: "both", axes };
}

/** The factors a scale drag gives x and y: one axis alone, or both by the distance from the centre. */
function scaleRatios(grab: ScaleGrab, center: Pair, start: Pair, at: Pair, lock: boolean): Pair {
  const along = (p: Pair, i: number) => (p[0] - center[0]) * grab.axes[i][0] + (p[1] - center[1]) * grab.axes[i][1];
  const axisRatio = (i: number) => {
    const a = along(start, i);
    return Math.abs(a) < 2 ? 1 : along(at, i) / a;
  };
  if (grab.axis === "x") return [axisRatio(0), 1];
  if (grab.axis === "y") return [1, axisRatio(1)];
  if (lock) return Math.abs(along(start, 0)) >= Math.abs(along(start, 1)) ? [axisRatio(0), 1] : [1, axisRatio(1)];
  const r0 = Math.hypot(start[0] - center[0], start[1] - center[1]) || 1;
  const r = Math.hypot(at[0] - center[0], at[1] - center[1]) / r0;
  return [r, r];
}

// ---------------------------------------------------------------- Drawing

interface Drag {
  kind: "head" | "tail" | "body" | "pieces" | "new" | "move" | "rotate" | "scale";
  bone: number;
  bones: number[];
  base: V2;
  maps: Map2[];
  start: Pair;
  moved: boolean;
  center: Pair;
  grab?: ScaleGrab;
  /** Where a new bone's head was pressed, on the sprite. */
  from?: Pair;
  /** A new bone's parent and whether it is connected (drawn from the parent's tail). */
  parent?: number | null;
  connected?: boolean;
}

const roundPair = (p: Pair): Pair => [Math.round(p[0]) + 0, Math.round(p[1]) + 0];
const distanceToSegment = (p: Pair, a: Pair, b: Pair) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

export function SetupPreview({ view, zoom, tool, showBones, feet }: { view: SetupView; zoom: number; tool: SetupTool; showBones: boolean; feet: boolean }) {
  const { src, maps, preview, art, sheet, shiny, sel } = view;
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const kept = useRef<Canvas | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const pixels = art?.sheets[sheet];
  const layers = useMemo(() => layersOf({ ...src, sequences: [{ name: "", frames: 6, parts: [] }] }, 0).map((l) => l.bone).filter((b) => src.bones[b]), [src]);

  // The canvas: the pictures, the bones and the feet with a margin; while a drag goes on it only grows, so it doesn't jump
  const frame = useMemo(() => {
    if (!preview || !pixels) return null;
    try {
      const boxes = frameQuads(preview.rig, 0, 0).quads.map(quadBox);
      boxes.push([-12, 12, 0, 12]);
      src.bones.forEach((_, b) => {
        const e = boneEnds(src, maps, b);
        for (const p of [e.head, e.tail]) boxes.push([p[0], p[0], -p[1], -p[1]]);
      });
      const c0 = canvasOf(boxes);
      const margin = 24;
      let c: Canvas = { width: c0.width + 2 * margin, height: c0.height + 2 * margin, originX: c0.originX + margin, originY: c0.originY + margin };
      const k = kept.current;
      if (k && drag.current) {
        const left = Math.min(-c.originX, -k.originX), top = Math.min(-c.originY, -k.originY);
        const right = Math.max(c.width - c.originX, k.width - k.originX), bottom = Math.max(c.height - c.originY, k.height - k.originY);
        c = { width: right - left, height: bottom - top, originX: -left, originY: -top };
      }
      kept.current = c;
      return render(preview.rig, pixels, 0, 0, c, undefined, { owners: true });
    } catch {
      return null;
    }
  }, [preview, pixels, src, maps]);

  const toScreen = (p: Pair): Pair => (frame ? [(frame.originX + p[0]) * zoom, (frame.originY + p[1]) * zoom] : [0, 0]);
  const toSprite = (p: Pair): Pair => (frame ? [p[0] / zoom - frame.originX, p[1] / zoom - frame.originY] : [0, 0]);

  useEffect(() => {
    const el = canvasEl.current;
    if (!el || !frame || !art) return;
    const ctx = el.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const words = paletteWords(shiny ? art.shiny : art.normal);
    const data = new ImageData(frame.width, frame.height);
    const out = new Uint32Array(data.data.buffer);
    for (let i = 0; i < frame.pixels.length; i++) out[i] = words[frame.pixels[i]];
    const off = new OffscreenCanvas(frame.width, frame.height);
    off.getContext("2d")!.putImageData(data, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.drawImage(off, 0, 0, frame.width * zoom, frame.height * zoom);
    const z = zoom;
    const at = (p: Pair): Pair => [(frame.originX + p[0]) * z, (frame.originY + p[1]) * z];
    // The chosen bones' pictures outlined
    if (preview && sel.bones.length) {
      ctx.strokeStyle = "rgba(255, 211, 61, 0.9)";
      ctx.lineWidth = 1;
      for (const quad of frameQuads(preview.rig, 0, 0).quads) {
        const bone = layers[quad.part];
        if (!sel.bones.includes(bone)) continue;
        const [x0, x1, y0, y1] = quadBox(quad);
        const [sx, sy] = at([x0, -y1]);
        ctx.strokeRect(sx + 0.5, sy + 0.5, (x1 - x0) * z - 1, (y1 - y0) * z - 1);
      }
    }
    if (feet) {
      ctx.strokeStyle = "rgba(120, 200, 255, 0.7)";
      ctx.setLineDash([4, 3]);
      const [fx, fy] = at([0, 0]);
      ctx.beginPath();
      ctx.moveTo(fx - 14 * z, fy + 0.5); ctx.lineTo(fx + 14 * z, fy + 0.5);
      ctx.moveTo(fx + 0.5, fy - 4 * z); ctx.lineTo(fx + 0.5, fy + 4 * z);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!showBones) return;
    // The bones, back to front as listed, the chosen ones last (on top)
    const order = src.bones.map((_, b) => b).sort((a, b) => Number(sel.bones.includes(a)) - Number(sel.bones.includes(b)));
    for (const b of order) {
      const ends = boneEnds(src, maps, b);
      const head = at(ends.head), tail = at(ends.tail);
      const p = parentOf(src, b);
      // An offset child's link to its parent (dashed), as Blender's relationship line
      if (p !== null && !src.bones[b].connected) {
        const pt = at(boneEnds(src, maps, p).tail);
        ctx.strokeStyle = "rgba(200, 200, 210, 0.7)";
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(...pt); ctx.lineTo(...head); ctx.stroke();
        ctx.setLineDash([]);
      }
      const main = sel.bones[0] === b, chosen = sel.bones.includes(b);
      const dx = tail[0] - head[0], dy = tail[1] - head[1];
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const w = Math.max(3, Math.min(10, len * 0.12));
      const mid: Pair = [head[0] + ux * len * 0.2, head[1] + uy * len * 0.2];
      ctx.beginPath();
      ctx.moveTo(...head);
      ctx.lineTo(mid[0] - uy * w, mid[1] + ux * w);
      ctx.lineTo(...tail);
      ctx.lineTo(mid[0] + uy * w, mid[1] - ux * w);
      ctx.closePath();
      ctx.fillStyle = main ? "rgba(255, 160, 50, 0.55)" : chosen ? "rgba(255, 210, 120, 0.45)" : "rgba(210, 210, 225, 0.35)";
      ctx.fill();
      ctx.lineWidth = main ? 2 : 1.25;
      ctx.strokeStyle = main ? "#ff9d2e" : chosen ? "#ffd98a" : "rgba(30, 30, 40, 0.85)";
      ctx.stroke();
      ctx.strokeStyle = main ? "#ff9d2e" : chosen ? "#ffd98a" : "rgba(235, 235, 245, 0.9)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mid[0] - uy * w, mid[1] + ux * w); ctx.lineTo(mid[0] + uy * w, mid[1] - ux * w); ctx.stroke();
      for (const [pt, r] of [[head, 4.5], [tail, 3.5]] as [Pair, number][]) {
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], r, 0, Math.PI * 2);
        ctx.fillStyle = main ? "#ff9d2e" : chosen ? "#ffd98a" : hue(b, 70, 70);
        ctx.fill();
        ctx.strokeStyle = "rgba(20, 20, 30, 0.9)";
        ctx.stroke();
      }
      if (main || zoom >= 4) {
        ctx.font = "11px sans-serif";
        ctx.fillStyle = main ? "#ffcf8a" : "rgba(235, 235, 245, 0.9)";
        ctx.fillText(src.bones[b].name, tail[0] + 6, tail[1] - 4);
      }
    }
    // The gizmo on the main chosen bone
    const b = sel.bones[0];
    if (b === undefined || !src.bones[b] || tool === "bones") return;
    const center = at(boneEnds(src, maps, b).head);
    ctx.lineWidth = 2;
    ctx.strokeStyle = ctx.fillStyle = "#4fc3f7";
    if (tool === "move") {
      ctx.beginPath();
      for (const [vx, vy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(...center); ctx.lineTo(center[0] + vx * 16, center[1] + vy * 16); }
      ctx.stroke();
      ctx.strokeRect(center[0] - 5, center[1] - 5, 10, 10);
    } else if (tool === "rotate") {
      ctx.beginPath(); ctx.arc(center[0], center[1], 28, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(center[0], center[1], RING, 0, Math.PI * 2); ctx.stroke();
      axesOf(maps[b]).forEach(([vx, vy], i) => {
        const end: Pair = [center[0] + vx * HANDLE, center[1] + vy * HANDLE];
        ctx.strokeStyle = ctx.fillStyle = i === 0 ? "#ff5d5d" : "#5dd35d";
        ctx.beginPath(); ctx.moveTo(...center); ctx.lineTo(...end); ctx.stroke();
        ctx.fillRect(end[0] - 5, end[1] - 5, 10, 10);
        ctx.font = "bold 10px sans-serif";
        ctx.fillText(i === 0 ? "X" : "Y", end[0] + vx * 9 - 3, end[1] + vy * 9 + 3);
      });
    }
  }, [frame, art, shiny, zoom, src, maps, sel.bones, tool, showBones, feet, preview, layers]);

  // ---- Picking
  const local = (e: React.PointerEvent): Pair => {
    const r = canvasEl.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  /** What is under a point (canvas pixels): a bone's head or tail, its body, or a picture. */
  const hitAt = (p: Pair): { bone: number; part: "head" | "tail" | "body" | "picture" } | null => {
    const v = viewRef.current;
    const order = v.src.bones.map((_, b) => b).sort((a, b) => Number(v.sel.bones.includes(b)) - Number(v.sel.bones.includes(a)));
    if (showBones) {
      // The chosen bones first (their ends, then their bodies), then the others': what is being worked on wins
      const chosen = order.filter((b) => v.sel.bones.includes(b)), others = order.filter((b) => !v.sel.bones.includes(b));
      for (const group of [chosen, others]) {
        for (const b of group) {
          const e = boneEnds(v.src, v.maps, b);
          if (Math.hypot(...sub(p, toScreen(e.tail))) <= 7) return { bone: b, part: "tail" };
          if (Math.hypot(...sub(p, toScreen(e.head))) <= 7) return { bone: b, part: "head" };
        }
        for (const b of group) {
          const e = boneEnds(v.src, v.maps, b);
          if (distanceToSegment(p, toScreen(e.head), toScreen(e.tail)) <= 5) return { bone: b, part: "body" };
        }
      }
    }
    if (frame?.owners) {
      const x = Math.floor(p[0] / zoom), y = Math.floor(p[1] / zoom);
      if (x >= 0 && y >= 0 && x < frame.width && y < frame.height) {
        const owner = frame.owners[y * frame.width + x];
        if (owner) return { bone: layers[owner - 1], part: "picture" };
      }
    }
    return null;
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur?.();
    const v = viewRef.current;
    if (v.readOnly || !frame) return;
    const p = local(e);
    // A drag works in the window's coordinates: the canvas grows and shifts as the sprite does
    const offset = sub([e.clientX, e.clientY], p);
    const begin = (d: Omit<Drag, "base" | "maps" | "start" | "moved">) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { ...d, center: [d.center[0] + offset[0], d.center[1] + offset[1]], base: v.src, maps: v.maps, start: [e.clientX, e.clientY], moved: false };
    };
    const main = v.sel.bones[0];
    if (tool !== "bones" && main !== undefined && v.src.bones[main]) {
      const center = toScreen(boneEnds(v.src, v.maps, main).head);
      const reach = tool === "move" ? 20 : tool === "rotate" ? 40 : HANDLE + 12;
      if (Math.hypot(...sub(p, center)) <= reach && !(e.shiftKey && tool === "move")) {
        begin({ kind: tool, bone: main, bones: v.sel.bones, center, grab: tool === "scale" ? grabOf(p, center, axesOf(v.maps[main])) : undefined });
        return;
      }
    }
    const hit = hitAt(p);
    if (!hit) {
      if (tool === "bones") {
        // A new bone from here (Ctrl: a child of the chosen bone, connected when drawn from its tail)
        const parent = (e.ctrlKey || e.metaKey) && main !== undefined ? main : null;
        const fromTail = parent !== null && Math.hypot(...sub(p, toScreen(boneEnds(v.src, v.maps, parent).tail))) <= 10;
        begin({ kind: "new", bone: -1, bones: [], center: p, parent, connected: fromTail, from: toSprite(p) });
        return;
      }
      v.select({ bones: [] });
      return;
    }
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      v.select(pickBone(v.sel, hit.bone, e));
      return;
    }
    if (!v.sel.bones.includes(hit.bone)) v.select({ bones: [hit.bone], piece: v.src.bones[hit.bone].default?.piece ?? v.sel.piece });
    const bones = v.sel.bones.includes(hit.bone) ? [hit.bone, ...v.sel.bones.filter((x) => x !== hit.bone)] : [hit.bone];
    if (tool === "bones") {
      const kind = hit.part === "picture" ? "pieces" : hit.part;
      begin({ kind, bone: hit.bone, bones: [hit.bone], center: p });
    } else {
      const center = toScreen(boneEnds(v.src, v.maps, hit.bone).head);
      begin({ kind: tool, bone: hit.bone, bones, center, grab: tool === "scale" ? grabOf(p, center, axesOf(v.maps[hit.bone])) : undefined });
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const v = viewRef.current;
    if (!d) return;
    const p: Pair = [e.clientX, e.clientY];
    const screen = sub(p, d.start);
    if (!d.moved && Math.hypot(...screen) < 3) return;
    const delta: Pair = [screen[0] / zoom, screen[1] / zoom];
    const base = d.base;
    let next: V2 | null = null;
    let note: string | null = null;
    const b = d.bone;
    if (d.kind === "head") {
      const bone = base.bones[b];
      const m = bone.connected && parentOf(base, b) !== null ? d.maps[bone.parent!] : parentMapOf(base, d.maps, b);
      next = moveHead(base, b, roundPair(restDelta(m, delta))).src;
      if (bone.connected && parentOf(base, b) !== null) note = `${bone.name} is connected: its head is ${base.bones[bone.parent!].name}'s tail, which moves with it.`;
    } else if (d.kind === "tail") {
      next = moveTail(base, b, roundPair(restDelta(d.maps[b], delta))).src;
    } else if (d.kind === "body") {
      const r = moveBone(base, b, roundPair(restDelta(parentMapOf(base, d.maps, b), delta)));
      if (!r) note = `${base.bones[b].name} is connected: its head is its parent's tail. Drag its tail to point it, or its parent's tail to move it.`;
      next = r?.src ?? null;
    } else if (d.kind === "pieces") {
      const r = restDelta(d.maps[b], delta);
      next = movePieces(base, b, roundPair([r[0], -r[1]])).src;
    } else if (d.kind === "new") {
      const parent = d.parent ?? null;
      const head = d.connected && parent !== null ? base.bones[parent].tail : roundPair(d.from!);
      const tail = roundPair([d.from![0] + delta[0], d.from![1] + delta[1]]);
      if (Math.hypot(tail[0] - head[0], tail[1] - head[1]) < 2) return;
      // (a child's ends drawn on the sprite are its rest ends where its parent is at rest)
      const made = addBone(base, { head, tail, parent, connected: !!d.connected });
      next = made.src;
      if (!d.moved) v.select({ bones: [made.bone] });
    } else if (d.kind === "move") {
      next = base;
      for (const x of d.bones) {
        if (base.bones[x]?.connected && parentOf(base, x) !== null) { note = `${base.bones[x].name} is connected (its head is its parent's tail): it turns and scales, but doesn't move on its own.`; continue; }
        const r = restDelta(parentMapOf(base, d.maps, x), delta);
        next = setDefault(next, x, (t) => ({ ...t, move: roundPair([(base.bones[x].default?.move?.[0] ?? 0) + r[0], (base.bones[x].default?.move?.[1] ?? 0) + r[1]]) }));
      }
    } else if (d.kind === "rotate") {
      const a0 = Math.atan2(d.start[1] - d.center[1], d.start[0] - d.center[0]);
      const a1 = Math.atan2(p[1] - d.center[1], p[0] - d.center[0]);
      let deg = ((a1 - a0) * 180) / Math.PI;
      if (deg > 180) deg -= 360;
      if (deg < -180) deg += 360;
      if (e.shiftKey) deg = Math.round(deg / 5) * 5;
      next = base;
      for (const x of d.bones) next = setDefault(next, x, (t) => ({ ...t, rotation: Math.round(((base.bones[x].default?.rotation ?? 0) + deg) * 10) / 10 }));
    } else if (d.kind === "scale" && d.grab) {
      const [rx, ry] = scaleRatios(d.grab, d.center, d.start, p, e.shiftKey);
      next = base;
      for (const x of d.bones) {
        const s = base.bones[x].default?.scale ?? [1, 1];
        next = setDefault(next, x, (t) => ({ ...t, scale: [fixedScale(s[0] * rx), fixedScale(s[1] * ry)] }));
      }
    }
    if (note) v.say(note);
    if (!next) return;
    v.commit(next, d.moved ? "move" : "start");
    d.moved = true;
  };

  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) viewRef.current.commit(viewRef.current.src, "end");
  };

  if (!pixels) return <p className="muted">{art ? `No ${sheet}.png` : "Reading the sheet…"}</p>;
  if (!frame) return <p className="muted">Nothing to draw yet: draw a piece on the sheet, then give it a bone.</p>;
  return (
    <canvas ref={canvasEl} className="rig-preview-canvas" width={frame.width * zoom} height={frame.height * zoom}
      data-feet={`${frame.originX},${frame.originY},${zoom}`}
      style={{ cursor: tool === "bones" ? "crosshair" : "default" }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end} />
  );
}

const sub = (a: Pair, b: Pair): Pair => [a[0] - b[0], a[1] - b[1]];
