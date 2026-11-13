// The Rig Editor's sheet: the side's 256×128 sheet with every picture's rectangles over it, numbered. Click a
// rectangle to choose its picture; drag it to move it on the sheet, or a corner or edge to resize it, snapped to whole
// tiles (8 pixels; Alt for single pixels). The art no rectangle covers, which the game never shows, is marked red.

import { useEffect, useMemo, useRef, useState } from "react";
import { SHEET_HEIGHT, SHEET_WIDTH, type Pair, type Rectangle } from "./mcss.ts";
import { sizeProblem, withRectangles } from "./model.ts";
import { hue, paletteWords, type RigView } from "./context.ts";

type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface Drag { picture: number; rectangle: number; handle: Handle; start: Pair; original: Rectangle; moved: boolean }

/** The sheet's pixels that no rectangle of any picture covers (and that the game so never shows). */
export function uncovered(sheet: Uint8Array, rectangles: Rectangle[]): Uint8Array {
  const covered = new Uint8Array(SHEET_WIDTH * SHEET_HEIGHT);
  for (const r of rectangles) {
    const [s, t] = r.sheet, [w, h] = r.size;
    for (let y = Math.max(0, Math.floor(t)); y < Math.min(SHEET_HEIGHT, Math.ceil(t + h)); y++)
      for (let x = Math.max(0, Math.floor(s)); x < Math.min(SHEET_WIDTH, Math.ceil(s + w)); x++) covered[y * SHEET_WIDTH + x] = 1;
  }
  const out = new Uint8Array(SHEET_WIDTH * SHEET_HEIGHT);
  for (let i = 0; i < out.length; i++) if (sheet[i] && !covered[i]) out[i] = 1;
  return out;
}

export function SheetView({ view, zoom, highlight }: {
  view: RigView; zoom: number;
  /** The pictures the selected part's track shows. */
  highlight: ReadonlySet<number>;
}) {
  const { rig, art, sheet, shiny, sel, select, editor } = view;
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const [hover, setHover] = useState<Handle | null>(null);
  const pixels = art?.sheets[sheet];
  const all = useMemo(() => rig.pictures.flatMap((p) => p.rectangles.filter((r, k) => k === 0 || r.size[0])), [rig.pictures]);
  const outside = useMemo(() => (pixels ? uncovered(pixels, all) : null), [pixels, all]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !pixels || !art) return;
    const ctx = el.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const words = paletteWords(shiny ? art.shiny : art.normal);
    const data = new ImageData(SHEET_WIDTH, SHEET_HEIGHT);
    const out = new Uint32Array(data.data.buffer);
    for (let i = 0; i < pixels.length; i++) out[i] = outside?.[i] ? 0xff3030e0 : words[pixels[i]];
    const off = new OffscreenCanvas(SHEET_WIDTH, SHEET_HEIGHT);
    off.getContext("2d")!.putImageData(data, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.drawImage(off, 0, 0, SHEET_WIDTH * zoom, SHEET_HEIGHT * zoom);
    // The sheet's edge (rectangles past it show the sheet mirrored)
    ctx.strokeStyle = "rgba(128,128,128,0.6)";
    ctx.strokeRect(0.5, 0.5, SHEET_WIDTH * zoom - 1, SHEET_HEIGHT * zoom - 1);
    const order = rig.pictures.map((_, i) => i).sort((a, b) => Number(a === sel.picture) - Number(b === sel.picture));
    ctx.font = "10px sans-serif";
    for (const i of order) {
      const picture = rig.pictures[i];
      const chosen = i === sel.picture;
      picture.rectangles.forEach((r, k) => {
        if (k > 0 && !r.size[0]) return;
        const [x, y] = [r.sheet[0] * zoom, r.sheet[1] * zoom], [w, h] = [r.size[0] * zoom, r.size[1] * zoom];
        const bad = sizeProblem(r.size[0], r.size[1]) !== null && r.size[0] > 0;
        ctx.lineWidth = chosen ? 2 : 1;
        ctx.setLineDash(k ? [3, 2] : []);
        ctx.strokeStyle = bad ? "#e5534b" : chosen ? "#ffd33d" : highlight.has(i) ? hue(i) : "rgba(200,200,200,0.55)";
        ctx.strokeRect(x + 0.5, y + 0.5, Math.max(w - 1, 1), Math.max(h - 1, 1));
        ctx.setLineDash([]);
        if (chosen || highlight.has(i) || zoom >= 3) {
          ctx.fillStyle = chosen ? "#ffd33d" : highlight.has(i) ? hue(i) : "rgba(220,220,220,0.8)";
          ctx.fillText(`${i}${k ? "+" : ""}`, x + 2, y + 10);
        }
        if (chosen && k === sel.rectangle) {
          ctx.fillStyle = "#ffd33d";
          for (const [hx, hy] of handlePoints(x, y, w, h)) ctx.fillRect(hx - 3, hy - 3, 6, 6);
        }
      });
    }
  }, [pixels, art, shiny, zoom, rig.pictures, sel.picture, sel.rectangle, highlight, outside]);

  const at = (e: React.PointerEvent): Pair => {
    const r = canvas.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom];
  };

  const handleAt = (p: Pair): Handle | null => {
    if (sel.picture === null) return null;
    const r = rig.pictures[sel.picture]?.rectangles[sel.rectangle];
    if (!r) return null;
    const [x, y] = r.sheet, [w, h] = r.size;
    const near = 5 / zoom;
    const west = Math.abs(p[0] - x) <= near, east = Math.abs(p[0] - (x + w)) <= near;
    const north = Math.abs(p[1] - y) <= near, south = Math.abs(p[1] - (y + h)) <= near;
    const inX = p[0] >= x - near && p[0] <= x + w + near, inY = p[1] >= y - near && p[1] <= y + h + near;
    if (!inX || !inY) return null;
    const v = north ? "n" : south ? "s" : "", hz = west ? "w" : east ? "e" : "";
    if (v || hz) return (v + hz) as Handle;
    return p[0] >= x && p[0] < x + w && p[1] >= y && p[1] < y + h ? "move" : null;
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const p = at(e);
    const handle = handleAt(p);
    if (handle && sel.picture !== null) {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { picture: sel.picture, rectangle: sel.rectangle, handle, start: p,
                       original: rig.pictures[sel.picture].rectangles[sel.rectangle], moved: false };
      return;
    }
    // The smallest rectangle under the pointer, its picture chosen
    let best: { picture: number; rectangle: number; area: number } | null = null;
    rig.pictures.forEach((picture, i) => picture.rectangles.forEach((r, k) => {
      const [x, y] = r.sheet, [w, h] = r.size;
      if (p[0] >= x && p[0] < x + w && p[1] >= y && p[1] < y + h && (!best || w * h < best.area)) best = { picture: i, rectangle: k, area: w * h };
    }));
    const found = best as { picture: number; rectangle: number } | null;
    select({ picture: found?.picture ?? null, rectangle: found?.rectangle ?? 0 });
    if (found) {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { picture: found.picture, rectangle: found.rectangle, handle: "move", start: p,
                       original: rig.pictures[found.picture].rectangles[found.rectangle], moved: false };
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const p = at(e);
    const d = drag.current;
    if (!d) {
      setHover(handleAt(p));
      return;
    }
    const snap = e.altKey ? 1 : 8;
    const round = (v: number) => Math.round(v / snap) * snap;
    const dx = p[0] - d.start[0], dy = p[1] - d.start[1];
    const [s, t] = d.original.sheet, [w, h] = d.original.size;
    let left = s, top = t, right = s + w, bottom = t + h;
    if (d.handle === "move") {
      left = round(s + dx); top = round(t + dy);
      right = left + w; bottom = top + h;
    } else {
      if (d.handle.includes("w")) left = Math.min(round(s + dx), right - snap);
      if (d.handle.includes("e")) right = Math.max(round(s + w + dx), left + snap);
      if (d.handle.includes("n")) top = Math.min(round(t + dy), bottom - snap);
      if (d.handle.includes("s")) bottom = Math.max(round(t + h + dy), top + snap);
    }
    left = Math.max(0, left); top = Math.max(0, top);
    const next: Rectangle = { ...d.original, sheet: [left, top], size: [right - left, bottom - top] };
    // A rectangle's top left stays where it was on the part: moving the west or north edge moves "at" with it, so the
    // picture doesn't jump on the sprite
    next.at = [d.original.at[0] + (left - s) * (d.handle === "move" ? 0 : 1), d.original.at[1] - (top - t) * (d.handle === "move" ? 0 : 1)];
    const current = rig.pictures[d.picture].rectangles[d.rectangle];
    if (current.sheet[0] === next.sheet[0] && current.sheet[1] === next.sheet[1] && current.size[0] === next.size[0] && current.size[1] === next.size[1]) return;
    const rectangles = rig.pictures[d.picture].rectangles.map((r, k) => (k === d.rectangle ? next : r));
    editor.set(["pictures", d.picture], withRectangles(rig.pictures[d.picture], rectangles), d.moved ? "move" : "start");
    d.moved = true;
  };

  const cursor = hover === "move" ? "move" : hover === "n" || hover === "s" ? "ns-resize" : hover === "e" || hover === "w" ? "ew-resize"
    : hover === "ne" || hover === "sw" ? "nesw-resize" : hover ? "nwse-resize" : "pointer";
  if (!pixels) return <p className="muted">{art ? `No ${sheet}.png` : "Reading the sheet…"}</p>;
  return (
    <canvas ref={canvas} className="rig-sheet-canvas" width={SHEET_WIDTH * zoom} height={SHEET_HEIGHT * zoom} style={{ cursor }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onPointerLeave={() => setHover(null)} />
  );
}

function handlePoints(x: number, y: number, w: number, h: number): Pair[] {
  return [[x, y], [x + w / 2, y], [x + w, y], [x, y + h / 2], [x + w, y + h / 2], [x, y + h], [x + w / 2, y + h], [x + w, y + h]];
}
