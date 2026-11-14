// A number box whose label drags to change the value, as Figma's do: dragging left and right steps it (Shift finer,
// Alt coarser), and the box still takes a typed value. The drag is one change for undo: its first move is the step,
// the others amend it ("start", "move", then "end").

import { useRef, useState, type ReactNode } from "react";

export type ScrubPhase = "start" | "move" | "end" | "typed";

export function ScrubNumber({ value, onChange, step = 1, label, digits = 2 }: {
  value: number;
  onChange(value: number, phase: ScrubPhase): void;
  /** The change for each pixel dragged. */
  step?: number;
  label: ReactNode;
  digits?: number;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  const round = (v: number) => Math.round(v * 10 ** digits) / 10 ** digits;
  return (
    <span className="ow-scrub">
      <span className="ow-scrub-label" title="Drag left or right to change it (Shift finer, Alt coarser)"
            onPointerDown={(e) => {
              e.preventDefault();
              // Out of the box typed in last (the zone filter), so Ctrl+Z undoes the drag, not the typing
              (document.activeElement as HTMLElement | null)?.blur?.();
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, start: value, moved: false };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              const scale = e.shiftKey ? 0.1 : e.altKey ? 10 : 1;
              const next = round(d.start + (e.clientX - d.x) * step * scale);
              if (next === value) return;
              onChange(next, d.moved ? "move" : "start");
              d.moved = true;
            }}
            onPointerUp={() => {
              if (drag.current?.moved) onChange(value, "end");
              drag.current = null;
            }}>{label}</span>
      <input inputMode="decimal" className="ow-number-box" value={typed ?? String(round(value))}
             onChange={(e) => {
               const n = Number(e.target.value.trim());
               const ok = e.target.value.trim() !== "" && Number.isFinite(n);
               setTyped(ok ? null : e.target.value);
               if (ok) onChange(n, "typed");
             }}
             onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLElement).blur(); }}
             onBlur={() => setTyped(null)} />
    </span>
  );
}
