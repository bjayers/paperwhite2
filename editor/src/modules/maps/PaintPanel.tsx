// The Map Editor's Paint tab: the chosen chunk as a painted map (res/paperwhite2/map_projects/<model>.json): each
// tile's terrain and height painted on the map, the library's objects placed and dragged on it, and the chunk's model
// and collision generated from it (tools/paperwhite2/map_maker.py).

import type { LibraryObject, MapStyle, PaintShape, PaintTool, Project } from "./painting.ts";

export function PaintPanel({ model, project, dirty, styles, objects, tool, setTool, shape, setShape, terrain, setTerrain, height, setHeight,
  placing, setPlacing, selected, onRemoveSelected, view, setView, onStart, onGenerate, busy }: {
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
  view: "painting" | "model";
  setView(v: "painting" | "model"): void;
  onStart(style: string, from: "chunk" | "flat", terrain: string, height: number): void;
  onGenerate(): void;
  busy: boolean;
}) {
  if (!model) return <p className="muted ow-note">Choose a chunk (the Chunks tab, or click the map).</p>;
  if (!project) return <StartPainting model={model} styles={styles} onStart={onStart} busy={busy} />;
  const style = styles.get(project.style);
  const selectedObject = selected !== null ? project.objects?.[selected] : null;
  return (
    <>
      <section className="me-section">
        <h4>Painted map</h4>
        <div className="me-row"><label>Style</label><span>{style?.name ?? project.style}</span></div>
        <div className="me-row"><label>Map shows</label>
          <span className="me-inline">
            <label className="ow-check"><input type="radio" checked={view === "painting"} onChange={() => setView("painting")} /> the painting</label>
            <label className="ow-check"><input type="radio" checked={view === "model"} onChange={() => setView("model")} /> the model</label>
          </span>
        </div>
        <div className="me-actions">
          <button className="primary" onClick={onGenerate} disabled={busy} title="Saves the painting, then writes the chunk's model and collision from it">
            {busy ? "Generating…" : "Generate the chunk"}</button>
          {dirty && <span className="muted">unsaved</span>}
        </div>
        <p className="muted ow-note">Generating writes the chunk's model.glb (the props stay) and its collision from the painting; edit the painting
          and generate again whenever you like.</p>
      </section>
      <section className="me-section">
        <h4>Brush</h4>
        <div className="me-row"><label>Paints</label>
          <select value={tool} onChange={(e) => setTool(e.target.value as PaintTool)}>
            <option value="terrain">the terrain</option>
            <option value="height">the height</option>
            <option value="both">the terrain and the height</option>
            <option value="raise">raise half a tile</option>
            <option value="lower">lower half a tile</option>
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
        {(tool === "terrain" || tool === "both") && (
          <div className="me-terrains">
            {(style?.terrains ?? []).map((t) => (
              <button key={t.key} className={`me-terrain${terrain === t.key ? " selected" : ""}`} onClick={() => setTerrain(t.key)}>
                <span className="me-swatch" style={{ background: t.color ?? "#888" }} />{t.name}
              </button>
            ))}
          </div>
        )}
        {(tool === "height" || tool === "both") && (
          <div className="me-row"><label>Height</label>
            <span className="me-inline"><input type="number" step={0.5} value={height / 2} className="me-number"
                                                onChange={(e) => setHeight(Math.round(Number(e.target.value) * 2))} /> tiles</span>
          </div>
        )}
        {tool === "place" && (
          <div className="me-row"><label>Object</label>
            <select value={placing} onChange={(e) => setPlacing(e.target.value)}>
              <option value="">Choose…</option>
              {objects.map((o) => <option key={o.id} value={o.id}>{o.category ? `${o.category}: ` : ""}{o.name} ({o.size[0]}×{o.size[1]})</option>)}
            </select>
          </div>
        )}
        {tool === "select" && (
          <>
            <p className="ow-note">{selectedObject ? <>Selected: <strong>{selectedObject[0]}</strong> at {selectedObject[1]}, {selectedObject[2]}</> : "Click an object to select it; drag it to move it."}</p>
            <div className="me-actions"><button disabled={selected === null} onClick={onRemoveSelected} title="Delete">Remove it</button></div>
          </>
        )}
        <p className="muted ow-note">{tool === "place" ? "Click the tile the object's north-west corner goes on." : tool === "select"
          ? "Drag an object to another tile; it stands on that tile's ground." : "Click or drag on the map; a rectangle fills from where the drag starts to where it ends."}
          {" "}Ctrl+Z undoes.</p>
      </section>
    </>
  );
}

function StartPainting({ model, styles, onStart, busy }: { model: string; styles: Map<string, MapStyle>;
  onStart(style: string, from: "chunk" | "flat", terrain: string, height: number): void; busy: boolean }) {
  const ids = [...styles.keys()];
  const first = ids[0] ?? "";
  return (
    <section className="me-section">
      <h4>Paint this chunk</h4>
      <p className="ow-note">{model} isn't a painted map yet. A painted map replaces the chunk's model and collision with ones generated from a
        grid you paint: each tile's terrain and height, and objects from the library.</p>
      <form onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onStart(String(f.get("style")), f.get("from") === "flat" ? "flat" : "chunk", String(f.get("terrain")), Math.round(Number(f.get("height")) * 2));
      }}>
        <div className="me-row"><label>Style</label>
          <select name="style" defaultValue={first}>{ids.map((id) => <option key={id} value={id}>{styles.get(id)!.name}</option>)}</select>
        </div>
        <div className="me-row"><label>Fill with</label>
          <select name="terrain" defaultValue={styles.get(first)?.terrains[0]?.key}>
            {(styles.get(first)?.terrains ?? []).map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>
        </div>
        <div className="me-row"><label>Heights</label>
          <span className="me-inline">
            <label className="ow-check"><input type="radio" name="from" value="chunk" defaultChecked /> the chunk's collision</label>
            <label className="ow-check"><input type="radio" name="from" value="flat" /> flat at</label>
            <input name="height" type="number" step={0.5} defaultValue={2} className="me-number" /> tiles
          </span>
        </div>
        <div className="me-actions"><button className="primary" type="submit" disabled={busy || !first}>Start painting</button></div>
      </form>
      <p className="muted ow-note">Nothing changes in the chunk until you generate it.</p>
    </section>
  );
}
