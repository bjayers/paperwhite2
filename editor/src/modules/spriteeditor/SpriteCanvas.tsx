// An indexed sprite drawn large (the Sprite Editor's core view, for any indexed sprite): one frame of it, its indices
// through colours, index 0 on a checker or the box tray's grey, an optional pixel grid, and for the edited sprite the
// pointer: a hover preview of the pixels the tool would set (as Aseprite shows the brush), strokes and samples.

import { useEffect, useRef, useState } from "react";
import type { Frame, Rgb, Sprite } from "./model.ts";

/** The box tray's grey, behind the icons as in the PC. */
export const BOX = "#a8b8b0";

export type Backdrop = "checker" | "box";

export interface CanvasPointer {
  /** A stroke's pixels (in the sprite's coordinates): "start" on press, "move" while held, "end" on release. */
  onStroke?(x: number, y: number, phase: "start" | "move" | "end", alt: boolean): void;
  /** The pixels the tool would set at x, y (the hover preview), and their colour (null: transparency). */
  preview?(x: number, y: number): { points: [number, number][]; colour: Rgb | null } | null;
  /** The hovered pixel, or null when the pointer leaves. */
  onHover?(x: number | null, y: number | null): void;
  cursor?: string;
}

const css = (c: Rgb) => `rgb(${c[0]},${c[1]},${c[2]})`;

export function SpriteCanvas({ sprite, frame, colours, scale, grid = false, backdrop = "checker", pointer, title, onClick, className }: {
  sprite: Sprite;
  frame?: Frame;
  colours: (Rgb | null)[];
  scale: number;
  grid?: boolean;
  backdrop?: Backdrop;
  pointer?: CanvasPointer;
  title?: string;
  onClick?(): void;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const area = frame ?? { x: 0, y: 0, width: sprite.width, height: sprite.height };
  const [hover, setHover] = useState<[number, number] | null>(null);
  const held = useRef(false);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const { width, height } = area;
    const cell = Math.max(2, Math.round(scale * 2));
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const c = colours[sprite.pixels[(area.y + y) * sprite.width + area.x + x]];
        if (c) {
          ctx.fillStyle = css(c);
          ctx.fillRect(x * scale, y * scale, scale, scale);
        } else if (backdrop === "box") {
          ctx.fillStyle = BOX;
          ctx.fillRect(x * scale, y * scale, scale, scale);
        } else {
          // A checker of cells about two pixels across at this zoom
          for (let cy = 0; cy < scale; cy += cell)
            for (let cx = 0; cx < scale; cx += cell) {
              const odd = (Math.floor((x * scale + cx) / cell) + Math.floor((y * scale + cy) / cell)) % 2;
              ctx.fillStyle = odd ? "#cfcfcf" : "#f4f4f4";
              ctx.fillRect(x * scale + cx, y * scale + cy, Math.min(cell, scale - cx), Math.min(cell, scale - cy));
            }
        }
      }
    if (hover && pointer?.preview) {
      const shown = pointer.preview(hover[0], hover[1]);
      for (const [px, py] of shown?.points ?? []) {
        const x = px - area.x, y = py - area.y;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        ctx.fillStyle = shown!.colour ? css(shown!.colour) : "rgba(255,255,255,0.7)";
        ctx.globalAlpha = 0.75;
        ctx.fillRect(x * scale, y * scale, scale, scale);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x * scale + 0.5, y * scale + 0.5, scale - 1, scale - 1);
      }
    }
    if (grid && scale >= 4) {
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < width; x++) { ctx.moveTo(x * scale + 0.5, 0); ctx.lineTo(x * scale + 0.5, height * scale); }
      for (let y = 1; y < height; y++) { ctx.moveTo(0, y * scale + 0.5); ctx.lineTo(width * scale, y * scale + 0.5); }
      ctx.stroke();
      if (width >= 16) {
        // every 8 pixels a little darker, the DS's tiles
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        for (let x = 8; x < width; x += 8) { ctx.moveTo(x * scale + 0.5, 0); ctx.lineTo(x * scale + 0.5, height * scale); }
        for (let y = 8; y < height; y += 8) { ctx.moveTo(0, y * scale + 0.5); ctx.lineTo(width * scale, y * scale + 0.5); }
        ctx.stroke();
      }
    }
  });

  const at = (e: React.PointerEvent): [number, number] | null => {
    const box = ref.current!.getBoundingClientRect();
    const x = Math.floor((e.clientX - box.left) / (box.width / area.width));
    const y = Math.floor((e.clientY - box.top) / (box.height / area.height));
    return x < 0 || y < 0 || x >= area.width || y >= area.height ? null : [x + area.x, y + area.y];
  };

  return (
    <canvas ref={ref} className={`se-pixels${className ? ` ${className}` : ""}`} width={area.width * scale} height={area.height * scale}
            title={title} style={{ cursor: pointer?.cursor ?? (onClick ? "pointer" : undefined) }}
            onClick={onClick}
            onPointerDown={pointer?.onStroke ? (e) => {
              if (e.button !== 0) return;
              const p = at(e);
              if (!p) return;
              held.current = true;
              (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
              pointer.onStroke!(p[0], p[1], "start", e.altKey);
            } : undefined}
            onPointerMove={pointer ? (e) => {
              const p = at(e);
              setHover(p);
              pointer.onHover?.(p?.[0] ?? null, p?.[1] ?? null);
              if (held.current && p) pointer.onStroke?.(p[0], p[1], "move", e.altKey);
            } : undefined}
            onPointerUp={pointer?.onStroke ? (e) => {
              if (!held.current) return;
              held.current = false;
              const p = at(e);
              pointer.onStroke!(p?.[0] ?? -1, p?.[1] ?? -1, "end", e.altKey);
            } : undefined}
            onPointerLeave={pointer ? () => { setHover(null); pointer.onHover?.(null, null); } : undefined} />
  );
}
