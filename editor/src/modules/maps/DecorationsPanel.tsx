// The Map Editor's Decorations tab: grass painted over a painted map's terrain (the project's grass rows), each kind
// as vanilla builds it (res/paperwhite2/map_grass/grass.json, tools/paperwhite2/map_grass.py). The terrain under it
// can be repainted in the Paint tab without touching it; generating builds it over whatever ground is there.

import { StartPainting } from "./PaintPanel.tsx";
import { NO_GRASS, grassTextures, type GrassKind, type MapStyle, type Project } from "./painting.ts";

export type GrassShape = "pencil" | "rect" | "fill";

export function DecorationsPanel({ model, textureSet, project, dirty, styles, kinds, textures, grassKey, setGrassKey, shape, setShape, counts,
  blocked, keeps, onAddKind, autoGenerate, setAutoGenerate, onStart, onGenerate, onTakeGrass, busy }: {
  model: string | null;
  /** The chunk's texture set. */
  textureSet: string | null;
  project: Project | null;
  dirty: boolean;
  styles: Map<string, MapStyle>;
  kinds: GrassKind[];
  /** The PNGs the painting's texture set has (null: still reading them). */
  textures: Set<string> | null;
  /** A kind's letter, or . to erase. */
  grassKey: string;
  setGrassKey(k: string): void;
  shape: GrassShape;
  setShape(s: GrassShape): void;
  /** How many tiles of each kind the painting has. */
  counts: Map<string, number>;
  /** Grass tiles that can't hold it (water, edges, slopes), which generating skips. */
  blocked: number;
  /** Grass tiles drawn over a tile that keeps its own collision (blocked, a boardwalk). */
  keeps: number;
  /** Adds a kind's textures to the area's texture sets (each season's), from sets of the same season that have them. */
  onAddKind(key: string): void;
  autoGenerate: boolean;
  setAutoGenerate(on: boolean): void;
  onStart(style: string, fill: string, flat?: number): void;
  onGenerate(): void;
  /** Gives a painting made before grass rows its chunk's grass, as rows. */
  onTakeGrass(): void;
  busy: boolean;
}) {
  if (!model) return <p className="muted ow-note">Choose a chunk (the Chunks tab, or click the map).</p>;
  if (!project) return (
    <>
      <p className="ow-note">Grass is painted over a painted map. Start one here (the chunk as it is, its grass included) or in the Paint tab.</p>
      <StartPainting model={model} styles={styles} textureSet={textureSet} onStart={onStart} busy={busy} />
    </>
  );
  const has = (k: GrassKind) => !textures || grassTextures(k).every((t) => textures.has(t));
  const native = kinds.filter(has), missing = kinds.filter((k) => !has(k));
  return (
    <>
      {!project.grass && (
        <section className="me-section">
          <h4>Grass rows</h4>
          <p className="ow-note">This painting was started before grass was painted apart, so the chunk's grass is still part of its model.
            Take it into grass rows to paint and erase it here; generating then builds all of the chunk's grass from them.</p>
          <div className="me-actions"><button className="primary" disabled={busy} onClick={onTakeGrass}>Take the chunk's grass</button></div>
        </section>
      )}
      <section className="me-section">
        <h4>Grass</h4>
        <div className="me-terrains">
          <button className={`me-terrain${grassKey === NO_GRASS ? " selected" : ""}`} onClick={() => setGrassKey(NO_GRASS)}
                  title="Removes grass: the tile takes its terrain's tile type again">
            <span className="me-swatch me-swatch-keep" />Eraser
          </button>
          {native.map((k) => (
            <button key={k.key} className={`me-terrain${grassKey === k.key ? " selected" : ""}`} onClick={() => setGrassKey(k.key)}
                    title={[k.description, `Tile type 0x${k.tile_type.toString(16)}`].filter(Boolean).join(". ")}>
              <span className="me-swatch" style={{ background: k.color }} />{k.name}
              {counts.get(k.key) ? <span className="muted"> · {counts.get(k.key)}</span> : null}
            </button>
          ))}
        </div>
        {missing.length > 0 && (
          <>
            <div className="muted me-category-name">Not in this area's textures</div>
            <div className="me-terrains">
              {missing.map((k) => (
                <button key={k.key} className="me-terrain" disabled={busy} onClick={() => onAddKind(k.key)}
                        title={`Adds ${k.name}'s images to this area's texture set in each season, copied from an area of that season that has them (under 1 KB of texture memory a set)`}>
                  <span className="me-swatch" style={{ background: k.color }} />Add {k.name}
                </button>
              ))}
            </div>
          </>
        )}
        {(() => { const k = kinds.find((x) => x.key === grassKey); return k?.description ? <p className="muted ow-note">{k.name}: {k.description}.</p> : null; })()}
      </section>
      <section className="me-section">
        <h4>Brush</h4>
        <div className="me-row"><label>Shape</label>
          <span className="me-inline">
            <label className="ow-check"><input type="radio" checked={shape === "pencil"} onChange={() => setShape("pencil")} /> pencil</label>
            <label className="ow-check"><input type="radio" checked={shape === "rect"} onChange={() => setShape("rect")} /> rectangle</label>
            <label className="ow-check"><input type="radio" checked={shape === "fill"} onChange={() => setShape("fill")} /> fill</label>
          </span>
        </div>
        <p className="muted ow-note">{shape === "fill" ? "Click a tile: it and every tile joined to it with the same grass (or none) take the brush."
          : "Click or drag on the map; a rectangle fills from where the drag starts to where it ends."} Ctrl+Z undoes.</p>
        {blocked > 0 && <p className="ow-note"><span className="me-swatch" style={{ background: "#e03030" }} /> {blocked} grass tile(s) marked red
          can't hold grass (water, an edge or a slope): generating leaves them bare.</p>}
        {keeps > 0 && <p className="ow-note"><span className="me-swatch" style={{ background: "#f08c20" }} /> {keeps} grass tile(s) marked orange
          keep their own collision (blocked, or a boardwalk's): the grass is drawn there, as under Route 7's boardwalks, but
          has no encounters.</p>}
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
          <button className="primary" onClick={onGenerate} disabled={busy}>{busy ? "Generating…" : "Generate the chunk"}</button>
          {dirty && <span className="muted">unsaved</span>}
        </div>
        <p className="muted ow-note">Grass is built over the ground the terrain gives each tile, whatever it is, and its tiles take the grass's
          tile type; repaint the terrain under it in the Paint tab and the grass stays. Placed objects' collision wins over it.</p>
      </section>
    </>
  );
}
