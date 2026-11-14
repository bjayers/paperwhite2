// The layer list of a flat rig (no armature): the shown pose's parts front to back, as the armature's outliner lists
// its bones. Each row has a grip (drag to reorder, as the timeline's names do), an eye that hides the part in the
// preview only (editor state, never saved), its colour, a thumbnail of the picture it shows first, and its name.

import { useEffect, useRef, useState } from "react";
import { hue, paletteWords, selectedParts, type RigView } from "./context.ts";
import { dropLayer, partName } from "./model.ts";
import { pickPart } from "./keying.ts";
import { SHEET_HEIGHT, SHEET_WIDTH } from "./mcss.ts";

/** The first drawn rectangle of a picture, scaled to fit a small square (nearest). */
export function Thumb({ view, picture, size = 28, className = "rig-thumb" }: { view: RigView; picture: number; size?: number; className?: string }) {
  const THUMB = size;
  const canvas = useRef<HTMLCanvasElement>(null);
  const { art, rig, sheet, shiny } = view;
  useEffect(() => {
    const el = canvas.current;
    const pixels = art?.sheets[sheet];
    if (!el || !pixels || !art) return;
    const ctx = el.getContext("2d")!;
    ctx.clearRect(0, 0, THUMB, THUMB);
    const r = rig.pictures[picture]?.rectangles.find((q) => q.size[0] > 0 && q.size[1] > 0);
    if (!r) return;
    const [w, h] = r.size, [s0, t0] = r.sheet;
    const words = paletteWords(shiny ? art.shiny : art.normal);
    const z = Math.min(THUMB / w, THUMB / h);
    const ow = Math.max(1, Math.round(w * z)), oh = Math.max(1, Math.round(h * z));
    const data = new ImageData(ow, oh);
    const out = new Uint32Array(data.data.buffer);
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
      const s = s0 + Math.floor((x + 0.5) / z), t = t0 + Math.floor((y + 0.5) / z);
      if (s >= 0 && s < SHEET_WIDTH && t >= 0 && t < SHEET_HEIGHT) out[y * ow + x] = words[pixels[t * SHEET_WIDTH + s]];
    }
    ctx.putImageData(data, Math.floor((THUMB - ow) / 2), Math.floor((THUMB - oh) / 2));
  }, [art, rig, sheet, shiny, picture, THUMB]);
  return <canvas ref={canvas} className={className} width={THUMB} height={THUMB} />;
}

export function LayerList({ view }: { view: RigView }) {
  const { rig, sel, select, editor, hidden, toggleHidden } = view;
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const parts = rig.poses[sel.pose]?.parts ?? [];
  const hiddenHere = parts.filter((p) => hidden.has(p.track));
  const chosen = new Set(selectedParts(sel));
  return (
    <section className="ow-panel-box ow-section">
      <h5>Layers <span className="muted">pose {sel.pose}: {parts.length} part{parts.length === 1 ? "" : "s"}, front first</span></h5>
      <div className="ow-section-actions">
        <button disabled={!hiddenHere.length} onClick={() => hiddenHere.forEach((p) => toggleHidden(p.track))}
                title="Show every part of this pose in the preview again">Show all</button>
      </div>
      <div className="rig-outliner">
        {parts.map((p, k) => {
          const track = rig.tracks[p.track];
          const off = hidden.has(p.track);
          return (
            <div key={k} className={`rig-outliner-row${sel.part === k ? " selected" : chosen.has(k) ? " multi" : ""}${over === k ? " drop" : ""}${drag === k ? " dragging" : ""}${off ? " hidden-layer" : ""}`}
                 draggable onDragStart={(e) => { setDrag(k); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setDrag(null); setOver(null); }}
                 onDragOver={(e) => { if (drag !== null) { e.preventDefault(); setOver(k); } }} onDragLeave={() => setOver(null)}
                 onDrop={(e) => {
                   e.preventDefault();
                   const d = drag === null ? null : dropLayer(rig, sel.pose, drag, k);
                   setDrag(null);
                   setOver(null);
                   if (!d) return;
                   editor.replace(d.rig);
                   select({ part: d.selected, key: null });
                 }}
                 onClick={(e) => select(pickPart(sel, k, e) ?? { part: k, more: [], key: null, picture: track?.keys[0]?.picture ?? null, rectangle: 0, sequenceKey: null, root: false, keyPose: null })}
                 title={`Layer ${k}${k === 0 ? " (front)" : k === parts.length - 1 ? " (back)" : ""}: track ${p.track} (${track?.name}). Drag to reorder the layers; the eye hides it in the preview only.`}>
              <span className="rig-grip">⠿</span>
              <button className={`rig-eye${off ? " off" : ""}`} title={off ? "Hidden in the preview (not saved): click to show" : "Hide in the preview (not saved)"}
                      onClick={(e) => { e.stopPropagation(); toggleHidden(p.track); }}>{off ? "◌" : "●"}</button>
              <span className="rig-swatch" style={{ background: hue(k) }} />
              <Thumb view={view} picture={track?.keys[0]?.picture ?? 0} />
              <b>{partName(track)}</b>
              <span className="muted">{track?.name}</span>
            </div>
          );
        })}
      </div>
      <p className="muted ow-note">Front to back, the layer order. Click to choose a part (as clicking the preview does), drag to reorder (idle parts follow);
        the eye hides a part in the preview only, to see what is behind it. <b>Shift-click</b> (a range) or <b>Ctrl-click</b> (one more) chooses several parts:
        the Move gizmo then moves all of them, Rotate turns them about the group's centre, and Key at playhead keys them together.
        To move or turn the whole sprite, or parent parts so one follows another, use Convert to armature (Armature, above): its Root moves the whole sprite, and a child follows its parent.</p>
    </section>
  );
}
