// The Map Editor's Paint tab: the chosen chunk as a painted map (res/paperwhite2/map_projects/<model>.json): each
// tile's terrain and height painted on the map, the library's objects placed and dragged on it, and the chunk's model
// and collision generated from it (tools/paperwhite2/map_maker.py).

import { useState } from "react";
import { ScrubNumber } from "../overworld/ScrubNumber.tsx";
import { ObjectBrowser } from "./ObjectBrowser.tsx";
import type { LibraryObject, MapStyle, PaintShape, PaintTool, Project } from "./painting.ts";

export function PaintPanel({ model, project, dirty, styles, objects, tool, setTool, shape, setShape, terrain, setTerrain, height, setHeight,
  placing, setPlacing, selected, onRemoveSelected, showPaint, setShowPaint, fadeModel, setFadeModel, onStart, onGenerate,
  autoGenerate, setAutoGenerate, onStop, onPaintFromReading, onLibraryChanged, busy }: {
  model: string | null;
  project: Project | null;
  dirty: boolean;
  styles: Map<string, MapStyle>;
  objects: LibraryObject[];
  tool: PaintTool;
  setTool(t: PaintTool): void;
  shape: PaintShape;
  setShape(s: PaintShape): void;
  terrain: string;
  setTerrain(k: string): void;
  /** In half tiles. */
  height: number;
  setHeight(h: number): void;
  placing: string;
  setPlacing(id: string): void;
  selected: number | null;
  onRemoveSelected(): void;
  showPaint: boolean;
  setShowPaint(on: boolean): void;
  fadeModel: boolean;
  setFadeModel(on: boolean): void;
  autoGenerate: boolean;
  setAutoGenerate(on: boolean): void;
  /** fill: a terrain, or "." to keep the chunk; flat: one height in tiles, else the chunk's collision's. */
  onStart(style: string, fill: string, flat?: number): void;
  onGenerate(): void;
  onStop(): void;
  /** Debug: the whole chunk painted from its reading and generated. */
  onPaintFromReading(): void;
  onLibraryChanged(): void;
  busy: boolean;
}) {
  const [browsing, setBrowsing] = useState(false);
  if (!model) return <p className="muted ow-note">Choose a chunk (the Chunks tab, or click the map).</p>;
  if (!project) return (
    <>
      <StartPainting model={model} styles={styles} onStart={onStart} busy={busy} />
      <Debug onPaintFromReading={onPaintFromReading} busy={busy} />
    </>
  );
  const style = styles.get(project.style);
  const selectedObject = selected !== null ? project.objects?.[selected] : null;
  return (
    <>
      <section className="me-section">
        <h4>Painted map</h4>
        <div className="me-row"><label>Style</label><span>{style?.name ?? project.style}</span></div>
        <div className="me-row"><label>Map shows</label>
          <span className="me-stack">
            <label className="ow-check"><input type="checkbox" checked={showPaint} onChange={(e) => setShowPaint(e.target.checked)} /> the painting's colors</label>
            <label className="ow-check"><input type="checkbox" checked={fadeModel} onChange={(e) => setFadeModel(e.target.checked)} /> the model faded to half</label>
          </span>
        </div>
      </section>
      <section className="me-section">
        <h4>Generating</h4>
        <div className="me-row"><label>When</label>
          <span className="me-stack">
            <label className="ow-check"><input type="radio" checked={!autoGenerate} onChange={() => setAutoGenerate(false)} /> when I click Generate</label>
            <label className="ow-check"><input type="radio" checked={autoGenerate} onChange={() => setAutoGenerate(true)} /> after each stroke</label>
          </span>
        </div>
        <div className="me-actions">
          <button className="primary" onClick={onGenerate} disabled={busy} title="Saves the painting, then writes the chunk's model and collision from it">
            {busy ? "Generating…" : "Generate the chunk"}</button>
          {dirty && <span className="muted">unsaved</span>}
        </div>
        <p className="muted ow-note">Generating writes the chunk's model.glb (the props stay) and its collision from the painting: painted tiles
          generated, kept tiles as the chunk had them. Edit the painting and generate again whenever you like. Ctrl+Z undoes a generate;
          after each stroke, it undoes the stroke and its generate together.</p>
      </section>
      <section className="me-section">
        <h4>Put the chunk back</h4>
        <div className="me-actions">
          <button className="danger" onClick={onStop} disabled={busy}
                  title="Puts the chunk's model and collision back as they were when painting started, and removes the painting">Stop painting and put the chunk back</button>
        </div>
        <p className="muted ow-note">Stop painting puts the chunk back as it was when painting started, with any edits made before it. To put it back
          as the original game or the last commit has it, use Put it back in the Chunks tab (the painting stays).</p>
      </section>
      <Debug onPaintFromReading={onPaintFromReading} busy={busy} />
      <section className="me-section">
        <h4>Brush</h4>
        <div className="me-row"><label>Paints</label>
          <select value={tool} onChange={(e) => setTool(e.target.value as PaintTool)}>
            <option value="terrain">the terrain</option>
            <option value="height">the height</option>
            <option value="both">the terrain and the height</option>
            <option value="raise">raise half a tile</option>
            <option value="lower">lower half a tile</option>
            <option value="fill">fill: the tile and the same tiles joined to it</option>
            <option value="place">objects: place</option>
            <option value="select">objects: select and drag</option>
          </select>
        </div>
        {["terrain", "height", "both", "raise", "lower"].includes(tool) && (
          <div className="me-row"><label>Shape</label>
            <span className="me-inline">
              <label className="ow-check"><input type="radio" checked={shape === "pencil"} onChange={() => setShape("pencil")} /> pencil</label>
              <label className="ow-check"><input type="radio" checked={shape === "rect"} onChange={() => setShape("rect")} /> rectangle</label>
            </span>
          </div>
        )}
        {["terrain", "both", "height", "raise", "lower", "fill"].includes(tool) && (
          <div className="me-terrains">
            {(tool === "height" || tool === "raise" || tool === "lower") && <div className="muted me-category-name">Kept tiles a height is painted on become</div>}
            <button className={`me-terrain${terrain === "." ? " selected" : ""}`} onClick={() => setTerrain(".")}
                    title="The chunk as it was on these tiles: an eraser for painted tiles">
              <span className="me-swatch me-swatch-keep" />Keep the chunk
            </button>
            {(style?.terrains ?? []).map((t) => (
              <button key={t.key} className={`me-terrain${terrain === t.key ? " selected" : ""}`} onClick={() => setTerrain(t.key)}>
                <span className="me-swatch" style={{ background: t.color ?? "#888" }} />{t.name}
              </button>
            ))}
          </div>
        )}
        {(tool === "height" || tool === "both") && (
          <div className="me-row"><label>Height</label>
            <span className="me-inline"><ScrubNumber label="tiles" value={height / 2} step={0.05} digits={1}
                                                     onChange={(v) => setHeight(Math.max(-40, Math.min(80, Math.round(v * 2))))} /></span>
          </div>
        )}
        {tool === "place" && (
          <div className="me-row"><label>Object</label>
            <select value={placing} onChange={(e) => setPlacing(e.target.value)}>
              <option value="">Choose…</option>
              {objects.map((o) => <option key={o.id} value={o.id}>{o.category ? `${o.category}: ` : ""}{o.name} ({o.size[0]}×{o.size[1]})</option>)}
            </select>
            <button onClick={() => setBrowsing(true)} title="Choose from previews">Browse…</button>
          </div>
        )}
        {browsing && <ObjectBrowser objects={objects} chosen={placing} onClose={() => setBrowsing(false)} onChanged={onLibraryChanged}
                                    onChoose={(id) => { setPlacing(id); setBrowsing(false); }} />}
        {tool === "select" && (
          <>
            <p className="ow-note">{selectedObject ? <>Selected: <strong>{selectedObject[0]}</strong> at {selectedObject[1]}, {selectedObject[2]}</> : "Click an object to select it; drag it to move it."}</p>
            <div className="me-actions"><button disabled={selected === null} onClick={onRemoveSelected} title="Delete">Remove it</button></div>
          </>
        )}
        <p className="muted ow-note">{tool === "place" ? "Click the tile the object's north-west corner goes on." : tool === "select"
          ? "Drag an object to another tile; it stands on that tile's ground." : tool === "fill"
          ? "Click a tile: it and every tile joined to it of the same terrain at the same height take the terrain chosen."
          : "Click or drag on the map; a rectangle fills from where the drag starts to where it ends."}
          {tool === "height" || tool === "raise" || tool === "lower" ? " A height painted on a kept tile paints it the terrain chosen above (Keep the chunk: the first terrain)." : ""}
          {" "}Ctrl+Z undoes.</p>
      </section>
    </>
  );
}

function Debug({ onPaintFromReading, busy }: { onPaintFromReading(): void; busy: boolean }) {
  return (
    <section className="me-section">
      <h4>Debug</h4>
      <div className="me-actions">
        <button disabled={busy} onClick={onPaintFromReading}
                title="Every tile painted as the map reader reads it, then generated: what the map maker makes of this chunk, and its polygons">
          Paint the whole chunk from its reading</button>
      </div>
      <p className="muted ow-note">Repaints every tile as the chunk reads now and generates it, to compare the generated terrain and its polygons with
        the original (Wireframe, and the Chunks tab's Polygons bar). Stop painting puts the chunk back. The first time for an area without a style,
        one is learned from the atlas (a couple of minutes), saved in res/paperwhite2/map_styles/.</p>
    </section>
  );
}

function StartPainting({ model, styles, onStart, busy }: { model: string; styles: Map<string, MapStyle>;
  onStart(style: string, fill: string, flat?: number): void; busy: boolean }) {
  const ids = [...styles.keys()];
  const [style, setStyle] = useState(ids[0] ?? "");
  const [from, setFrom] = useState<"keep" | "fill">("keep");
  const [fill, setFill] = useState("");
  const [flat, setFlat] = useState<number | null>(null);
  const chosen = style || ids[0] || "";
  const terrains = styles.get(chosen)?.terrains ?? [];
  const fillKey = fill || terrains[0]?.key || "g";
  return (
    <section className="me-section">
      <h4>Paint this chunk</h4>
      <p className="ow-note">Paint terrain and heights over {model}, place objects of the library, then generate its model and collision.</p>
      <div className="me-row"><label>Style</label>
        <select value={chosen} onChange={(e) => setStyle(e.target.value)}>{ids.map((id) => <option key={id} value={id}>{styles.get(id)!.name}</option>)}</select>
      </div>
      <div className="me-row"><label>Start from</label>
        <span className="me-stack">
          <label className="ow-check"><input type="radio" checked={from === "keep"} onChange={() => setFrom("keep")} /> the chunk as it is: paint only
            what you change (a pond in a field)</label>
          <label className="ow-check"><input type="radio" checked={from === "fill"} onChange={() => setFrom("fill")} /> every tile
            <select value={fillKey} disabled={from !== "fill"} onChange={(e) => setFill(e.target.value)}>
              {terrains.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
            (a new map)</label>
        </span>
      </div>
      <div className="me-row"><label>Heights</label>
        <span className="me-inline">
          <label className="ow-check"><input type="radio" checked={flat === null} onChange={() => setFlat(null)} /> the chunk's collision</label>
          <label className="ow-check"><input type="radio" checked={flat !== null} onChange={() => setFlat(2)} /> flat at</label>
          <input type="number" step={0.5} value={flat ?? 2} disabled={flat === null} className="me-number" onChange={(e) => setFlat(Number(e.target.value))} /> tiles
        </span>
      </div>
      <div className="me-actions">
        <button className="primary" disabled={busy || !chosen} onClick={() => onStart(chosen, from === "keep" ? "." : fillKey, flat ?? undefined)}>Start painting</button>
      </div>
      <p className="muted ow-note">Nothing changes in the chunk until you generate it, and a copy of it is kept: Stop painting puts it back.</p>
    </section>
  );
}
