// The new Rig Editor's sheet: the side's 256×128 sheet with each piece's rectangles over it. Drag on empty sheet to cut
// a new piece (Shift: the chosen piece's second rectangle); click a rectangle to choose its piece; drag it to move it,
// its edges or corners to resize it. Rectangles snap to whole tiles (8 pixels; Alt for 1) and to sizes the DS's OBJs
// can be cut into (a side of 64 needs the other 32 or 64). The art no rectangle covers, which the game never shows,
// is red. Also the pieces' list, and a thumbnail of a piece for the other lists.

import { useEffect, useMemo, useRef, useState } from "react";
import { SHEET_HEIGHT, SHEET_WIDTH, type Pair, type Rectangle } from "./mcss.ts";
import { sizeProblem } from "./model.ts";
import { hue, paletteWords, type Art } from "./context.ts";
import { uncovered } from "./SheetView.tsx";
import { addBoneForPiece, addPiece, addRectangle, bonesShowing, deletePiece, piecesOf, setRectangle } from "./setup.ts";
import type { SetupView } from "./setupContext.ts";
import type { V2 } from "./v2.ts";

type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface Drag { piece: number; rectangle: number; handle: Handle | "new"; start: Pair; original: Rectangle; base: V2; moved: boolean; second: boolean }

/** The nearest size to (w, h) whose OBJs can be cut (sizeProblem), changing the dimensions being dragged: the first of
 * w, h or both that a step of 8 at a time fixes. */
export function validSize(w: number, h: number, changing: "w" | "h" | "both"): Pair {
  if (!sizeProblem(w, h)) return [w, h];
  for (let d = 8; d <= 64; d += 8) {
    for (const sign of [1, -1]) {
      const tries: Pair[] = [];
      if (changing !== "h") tries.push([w + sign * d, h]);
      if (changing !== "w") tries.push([w, h + sign * d]);
      for (const [a, b] of tries) if (a > 0 && b > 0 && !sizeProblem(a, b)) return [a, b];
    }
  }
  return [w, h];
}

/** The first rectangle of a piece, scaled to fit a small square. */
export function PieceThumb({ art, sheet, shiny, rectangles, size = 28 }: { art: Art | null; sheet: string; shiny: boolean; rectangles: Rectangle[] | undefined; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const pixels = art?.sheets[sheet];
    if (!el || !pixels || !art) return;
    const ctx = el.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);
    const r = rectangles?.find((q) => q.size[0] > 0 && q.size[1] > 0);
    if (!r) return;
    const [w, h] = r.size, [s0, t0] = r.sheet;
    const words = paletteWords(shiny ? art.shiny : art.normal);
    const z = Math.min(size / w, size / h);
    const ow = Math.max(1, Math.round(w * z)), oh = Math.max(1, Math.round(h * z));
    const data = new ImageData(ow, oh);
    const out = new Uint32Array(data.data.buffer);
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
      const s = s0 + Math.floor((x + 0.5) / z), t = t0 + Math.floor((y + 0.5) / z);
      if (s >= 0 && s < SHEET_WIDTH && t >= 0 && t < SHEET_HEIGHT) out[y * ow + x] = words[pixels[t * SHEET_WIDTH + s]];
    }
    ctx.putImageData(data, Math.floor((size - ow) / 2), Math.floor((size - oh) / 2));
  }, [art, sheet, shiny, rectangles, size]);
  return <canvas ref={canvas} className="rig-thumb" width={size} height={size} style={{ width: size, height: size }} />;
}

export function SetupSheet({ view, zoom }: { view: SetupView; zoom: number }) {
  const { src, art, sheet, shiny, sel, select, commit, readOnly } = view;
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const [hover, setHover] = useState<Handle | null>(null);
  const pixels = art?.sheets[sheet];
  const all = useMemo(() => src.pieces.flatMap((p) => p.rectangles.filter((r, k) => k === 0 || r.size[0])), [src.pieces]);
  const outside = useMemo(() => (pixels ? uncovered(pixels, all) : null), [pixels, all]);
  const shown = useMemo(() => new Set(sel.bones.flatMap((b) => [...piecesOf(src, b)])), [src, sel.bones]);

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
    ctx.strokeStyle = "rgba(128,128,128,0.6)";
    ctx.strokeRect(0.5, 0.5, SHEET_WIDTH * zoom - 1, SHEET_HEIGHT * zoom - 1);
    const order = src.pieces.map((_, i) => i).sort((a, b) => Number(a === sel.piece) - Number(b === sel.piece));
    ctx.font = "10px sans-serif";
    for (const i of order) {
      const piece = src.pieces[i];
      const chosen = i === sel.piece;
      piece.rectangles.forEach((r, k) => {
        if ((k > 0 && !r.size[0]) || !r.size[1]) return;
        const [x, y] = [r.sheet[0] * zoom, r.sheet[1] * zoom], [w, h] = [r.size[0] * zoom, r.size[1] * zoom];
        const bad = sizeProblem(r.size[0], r.size[1]) !== null;
        ctx.lineWidth = chosen ? 2 : 1;
        ctx.setLineDash(k ? [3, 2] : []);
        ctx.strokeStyle = bad ? "#e5534b" : chosen ? "#ffd33d" : shown.has(i) ? hue(i) : "rgba(200,200,200,0.55)";
        ctx.strokeRect(x + 0.5, y + 0.5, Math.max(w - 1, 1), Math.max(h - 1, 1));
        ctx.setLineDash([]);
        if (chosen || shown.has(i) || zoom >= 2) {
          ctx.fillStyle = chosen ? "#ffd33d" : shown.has(i) ? hue(i) : "rgba(220,220,220,0.85)";
          ctx.fillText(`${piece.name}${k ? " +" : ""}`, x + 2, y + 10);
        }
        if (chosen && k === sel.rectangle) {
          ctx.fillStyle = "#ffd33d";
          for (const [hx, hy] of handlePoints(x, y, w, h)) ctx.fillRect(hx - 3, hy - 3, 6, 6);
        }
      });
    }
  }, [pixels, art, shiny, zoom, src.pieces, sel.piece, sel.rectangle, shown, outside]);

  const at = (e: React.PointerEvent): Pair => {
    const r = canvas.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom];
  };

  const handleAt = (p: Pair): Handle | null => {
    if (sel.piece === null) return null;
    const r = src.pieces[sel.piece]?.rectangles[sel.rectangle];
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
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (readOnly) return;
    const p = at(e);
    const handle = handleAt(p);
    const start = (d: Omit<Drag, "start" | "base" | "moved">) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { ...d, start: p, base: src, moved: false };
    };
    if (handle && sel.piece !== null && !e.shiftKey) {
      start({ piece: sel.piece, rectangle: sel.rectangle, handle, original: src.pieces[sel.piece].rectangles[sel.rectangle], second: false });
      return;
    }
    // The smallest rectangle under the pointer: its piece chosen, and dragged
    let best: { piece: number; rectangle: number; area: number } | null = null;
    src.pieces.forEach((piece, i) => piece.rectangles.forEach((r, k) => {
      const [x, y] = r.sheet, [w, h] = r.size;
      if (p[0] >= x && p[0] < x + w && p[1] >= y && p[1] < y + h && (!best || w * h < best.area)) best = { piece: i, rectangle: k, area: w * h };
    }));
    const found = best as { piece: number; rectangle: number } | null;
    if (found && !e.shiftKey) {
      select({ piece: found.piece, rectangle: found.rectangle });
      start({ piece: found.piece, rectangle: found.rectangle, handle: "move", original: src.pieces[found.piece].rectangles[found.rectangle], second: false });
      return;
    }
    // Empty sheet (or Shift): a new rectangle drawn from here, a new piece's or the chosen piece's second
    const second = e.shiftKey && sel.piece !== null && (src.pieces[sel.piece]?.rectangles.length ?? 2) < 2;
    if (e.shiftKey && !second) view.say(sel.piece === null ? "Shift-drag draws the chosen piece's second rectangle: choose a piece first." : "A piece has at most two rectangles.");
    const snap = e.altKey ? 1 : 8;
    const corner: Pair = [Math.floor(p[0] / snap) * snap, Math.floor(p[1] / snap) * snap];
    start({ piece: second ? sel.piece! : -1, rectangle: second ? 1 : 0, handle: "new", original: { sheet: corner, size: [0, 0], at: [0, 0] }, second });
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
    const clampX = (v: number) => Math.max(0, Math.min(SHEET_WIDTH, v)), clampY = (v: number) => Math.max(0, Math.min(SHEET_HEIGHT, v));
    if (d.handle === "new") {
      const [x0, y0] = d.original.sheet;
      const x1 = clampX(round(p[0])), y1 = clampY(round(p[1]));
      let left = Math.min(x0, x1), top = Math.min(y0, y1);
      let [w, h] = [Math.abs(x1 - x0), Math.abs(y1 - y0)];
      if (w < snap || h < snap) return;
      [w, h] = validSize(w, h, "both");
      if (x1 < x0) left = x0 - w;
      if (y1 < y0) top = y0 - h;
      left = Math.max(0, left); top = Math.max(0, top);
      let next: V2;
      if (d.second) next = addRectangle(d.base, d.piece, [left, top], [w, h]);
      else {
        const made = addPiece(d.base, [left, top], [w, h]);
        next = made.src;
        if (!d.moved) select({ piece: made.piece, rectangle: 0 });
      }
      if (!d.moved && d.second) select({ rectangle: 1 });
      commit(next, d.moved ? "move" : "start");
      d.moved = true;
      return;
    }
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
      // To an OBJ size, keeping the edge that isn't dragged
      const changing = /[ew]/.test(d.handle) && /[ns]/.test(d.handle) ? "both" : /[ew]/.test(d.handle) ? "w" : "h";
      const [vw, vh] = validSize(right - left, bottom - top, changing);
      if (d.handle.includes("w")) left = right - vw; else right = left + vw;
      if (d.handle.includes("n")) top = bottom - vh; else bottom = top + vh;
    }
    left = Math.max(0, left); top = Math.max(0, top);
    const next: Rectangle = { ...d.original, sheet: [left, top], size: [right - left, bottom - top] };
    // A rectangle's top left stays where it was on the bone: moving the west or north edge moves "at" with it, so the
    // picture doesn't jump on the sprite
    if (d.handle !== "move") next.at = [d.original.at[0] + (left - s), d.original.at[1] - (top - t)];
    const current = d.base.pieces[d.piece].rectangles[d.rectangle];
    if (!d.moved && current.sheet[0] === next.sheet[0] && current.sheet[1] === next.sheet[1] && current.size[0] === next.size[0] && current.size[1] === next.size[1]) return;
    commit(setRectangle(d.base, d.piece, d.rectangle, next), d.moved ? "move" : "start");
    d.moved = true;
  };

  const end = () => {
    if (drag.current?.moved) commit(view.src, "end");
    drag.current = null;
  };
  const cursor = hover === "move" ? "move" : hover === "n" || hover === "s" ? "ns-resize" : hover === "e" || hover === "w" ? "ew-resize"
    : hover === "ne" || hover === "sw" ? "nesw-resize" : hover ? "nwse-resize" : "crosshair";
  if (!pixels) return <p className="muted">{art ? `No ${sheet}.png` : "Reading the sheet…"}</p>;
  return (
    <canvas ref={canvas} className="rig-sheet-canvas" width={SHEET_WIDTH * zoom} height={SHEET_HEIGHT * zoom} style={{ cursor }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end} onPointerLeave={() => setHover(null)} />
  );
}

function handlePoints(x: number, y: number, w: number, h: number): Pair[] {
  return [[x, y], [x + w / 2, y], [x + w, y], [x, y + h / 2], [x + w, y + h / 2], [x, y + h], [x + w / 2, y + h], [x + w, y + h]];
}

/** The pieces' list: a thumbnail, the name, the rectangles, the bones that show it; a bone for it, or delete it. */
export function PieceList({ view }: { view: SetupView }) {
  const { src, sel, select, commit, art, sheet, shiny, readOnly } = view;
  return (
    <div className="rig-outliner rig-piece-list">
      {src.pieces.map((p, i) => {
        const showers = bonesShowing(src, i);
        return (
          <div key={i} className={`rig-outliner-row${sel.piece === i ? " selected" : ""}`}
               onClick={() => select({ piece: i, rectangle: 0 })}
               title={`Piece ${i}: ${p.rectangles.length} rectangle${p.rectangles.length > 1 ? "s" : ""}`}>
            <span className="rig-swatch" style={{ background: hue(i) }} />
            <PieceThumb art={art} sheet={sheet} shiny={shiny} rectangles={p.rectangles} />
            <b>{p.name}</b>
            <span className="muted">{p.rectangles.filter((r) => r.size[0] && r.size[1]).map((r) => `${r.size[0]}×${r.size[1]}`).join(" + ") || "blank"}</span>
            <span className="muted">{showers.length ? `on ${showers.map((b) => src.bones[b].name).join(", ")}` : "no bone"}</span>
            <span className="spacer" />
            {!readOnly && (
              <span className="rig-row-actions">
                <button className="small" title="A new bone showing this piece, its head at the piece's middle" onClick={(e) => {
                  e.stopPropagation();
                  const made = addBoneForPiece(src, i);
                  commit(made.src);
                  select({ bones: [made.bone], piece: made.src.bones[made.bone].default?.piece ?? i });
                }}>+ Bone</button>
                <button className="small" title="Delete this piece: a bone that showed it shows nothing" onClick={(e) => {
                  e.stopPropagation();
                  commit(deletePiece(src, i));
                  select({ piece: null, rectangle: 0 });
                }}>✕</button>
              </span>
            )}
          </div>
        );
      })}
      {!src.pieces.length && <p className="muted ow-note">No pieces yet: drag a rectangle round a piece of art on the sheet.</p>}
    </div>
  );
}
