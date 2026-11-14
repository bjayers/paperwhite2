// The new Rig Editor's preview of the whole timeline strip (rig-editor-v2.md, "Built: step 4"): the side's bake drawn
// exactly as the battle plays it, its sequence 0 (the strip's blocks) looping at the game's 60 frames a second on the
// clock of player.ts, with the battle's pause (BtlvMcss_OnAnimationEnd and BtlvMcss_IdleTask): at a loop's end, by the
// battle's roll or by "Preview a battle pause", the sprite stops and only the idle parts (the "Keeps moving" parts) go
// on, for 48, 56 or 64 frames. During a pause the parts that keep moving are outlined in green. Click a part to choose
// it (its Keeps moving toggle in the side panel).

import { useEffect, useMemo, useRef } from "react";
import { frameQuads, loopCanvas, quadBox, render, type Canvas, type Pair, type Rig } from "./mcss.ts";
import { paletteWords, useClock } from "./context.ts";
import type { Clock } from "./player.ts";
import { pickBone, type SetupView } from "./setupContext.ts";
import { layersOf } from "./v2.ts";

export function StripPreview({ view, rig, clock, zoom, feet }: { view: SetupView; rig: Rig | null; clock: Clock; zoom: number; feet: boolean }) {
  const { src, art, sheet, shiny, sel } = view;
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const state = useClock(clock, (st) => st);
  const pixels = art?.sheets[sheet];
  // A canvas that holds every frame of the loop (and of the pause's sequence, if any), so the sprite doesn't jump
  const stage = useMemo<Canvas | null>(() => {
    if (!rig) return null;
    const cs = [loopCanvas(rig, 0, 16), ...(rig.sequences.length > 1 ? [loopCanvas(rig, 1, 16)] : [])];
    const left = Math.min(...cs.map((c) => -c.originX)), top = Math.min(...cs.map((c) => -c.originY));
    const right = Math.max(...cs.map((c) => c.width - c.originX)), bottom = Math.max(...cs.map((c) => c.height - c.originY));
    return { width: right - left, height: bottom - top, originX: -left, originY: -top };
  }, [rig]);
  const idle = state.pause ? clock.idle() : undefined;
  const frame = useMemo(() => {
    if (!rig || !pixels || !stage) return null;
    try {
      const shown = frameQuads(rig, state.sequence, state.time, idle);
      return { ...render(rig, pixels, state.sequence, state.time, stage, idle, { owners: true }), shown };
    } catch {
      return null;
    }
    // (idle is made from the state, which holds its elapsed frames)
  }, [rig, pixels, stage, state]);
  const layers = useMemo(() => (frame ? layersOf(src, frame.shown.pose).map((l) => l.bone) : []), [src, frame?.shown.pose]);

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
    const outline = (test: (part: number) => boolean, colour: string, dash: number[]) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(dash);
      for (const quad of frame.shown.quads) {
        if (!test(quad.part)) continue;
        const [x0, x1, y0, y1] = quadBox(quad);
        const [sx, sy] = at([x0, -y1]);
        ctx.strokeRect(sx + 0.5, sy + 0.5, (x1 - x0) * z - 1, (y1 - y0) * z - 1);
      }
      ctx.setLineDash([]);
    };
    if (sel.bones.length) outline((part) => sel.bones.includes(layers[part]), "rgba(255, 211, 61, 0.9)", []);
    if (idle) outline((part) => idle.parts.has(part), "rgba(80, 220, 120, 0.95)", [4, 3]);
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
  }, [frame, art, shiny, zoom, sel.bones, layers, feet]);

  const onDown = (e: React.PointerEvent) => {
    if (!frame?.owners) return;
    const r = canvasEl.current!.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / zoom), y = Math.floor((e.clientY - r.top) / zoom);
    const owner = x >= 0 && y >= 0 && x < frame.width && y < frame.height ? frame.owners[y * frame.width + x] : 0;
    const b = owner ? layers[owner - 1] : undefined;
    if (b === undefined) { view.select({ bones: [] }); return; }
    view.select(pickBone(sel, b, e));
  };

  if (!pixels) return <p className="muted">{art ? `No ${sheet}.png` : "Reading the sheet…"}</p>;
  if (!frame) return <p className="muted">Nothing to draw yet.</p>;
  return (
    <div className="rig-strip-stage">
      <canvas ref={canvasEl} className="rig-preview-canvas" width={frame.width * zoom} height={frame.height * zoom} onPointerDown={onDown}
              data-feet={`${frame.originX},${frame.originY},${zoom}`} />
      {state.pause && (
        <span className="rig-pause-badge" title="The battle's pause: the sprite stops, only the Keeps moving parts (outlined green) go on">
          ⏸ Battle pause · {Math.floor(state.pause.elapsed)} of {state.pause.wait} frames{idle?.parts.size ? "" : " · everything frozen"}
        </span>
      )}
    </div>
  );
}
