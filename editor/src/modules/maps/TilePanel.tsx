// The Map Editor's Tiles tab: a tile library's palette, most used first, each tile's picture drawn from its model; the
// chosen tile's details (its footprint, materials, uses and where the chunks use it, its collision); and the chosen
// chunk's layout (res/paperwhite2/map_layouts/<model>.json): started from the chunk as it is, painted with tiles on the
// map, and composed into the chunk's model.glb.

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type TileLibraryInfo } from "../../api.ts";
import type { ZoneMap } from "../overworld/terrain.ts";
import { forgetTiles, loadCatalogue, tileLabel, tileThumbnail, type Catalogue, type Tile } from "./tiles.ts";

const PAGE = 120;

export type PaintMode = "off" | "tile" | "erase";
export type PaintHeight = "cell" | "tile";

export interface LayoutState {
  /** The chosen chunk's model folder's name, and its layout's path when it has one. */
  model: string | null;
  path: string | null;
  dirty: boolean;
  shown: boolean;
}

export function TilePanel({ map, onShow, library, setLibrary, catalogue, setCatalogue, chosen, setChosen, layout, onStart,
  onCompose, onShowLayout, paint, setPaint, height, setHeight, busy }: {
  map: ZoneMap | null;
  onShow(model: string): boolean;
  library: string;
  setLibrary(id: string): void;
  catalogue: Catalogue | null;
  setCatalogue(c: Catalogue | null): void;
  chosen: Tile | null;
  setChosen(t: Tile | null): void;
  layout: LayoutState;
  onStart(): void;
  onCompose(): void;
  onShowLayout(on: boolean): void;
  paint: PaintMode;
  setPaint(mode: PaintMode): void;
  height: PaintHeight;
  setHeight(h: PaintHeight): void;
  busy: boolean;
}) {
  const [libraries, setLibraries] = useState<TileLibraryInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slicing, setSlicing] = useState(false);
  const [filter, setFilter] = useState("");
  const [kind, setKind] = useState<"all" | "ground" | "object">("all");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    api.tileLibraries().then((l) => { setLibraries(l); if (l.length && !library) setLibrary(l[0].id); }, (e: Error) => setError(e.message));
  }, []);
  const info = libraries?.find((l) => l.id === library);
  useEffect(() => {
    if (catalogue?.library && info && catalogue.library === info.name) return;
    setCatalogue(null);
    setChosen(null);
    if (!info?.sliced) return;
    loadCatalogue(library).then(setCatalogue, (e: Error) => setError(e.message));
  }, [library, info?.sliced]);

  const slice = async () => {
    setSlicing(true);
    setError(null);
    try {
      await api.sliceTiles(library);
      forgetTiles(library);
      setLibraries(await api.tileLibraries());
      setCatalogue(await loadCatalogue(library));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSlicing(false);
    }
  };

  const tiles = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (catalogue?.tiles ?? []).filter((t) => !t.hidden && (kind === "all" || t.kind === kind)
      && (!f || tileLabel(t).toLowerCase().includes(f) || t.materials.some((m) => m.toLowerCase().includes(f)) || t.category?.toLowerCase().includes(f)));
  }, [catalogue, filter, kind]);
  useEffect(() => setShown(PAGE), [filter, kind, library]);
  // A new map's chunk (named after its map) starts from its template's tiles, which the server checks
  const cuts = !!layout.model && (!!info?.sources.includes(layout.model) || !layout.model.startsWith("overworld") && !/_m_/.test(layout.model));

  return (
    <>
      <section className="me-section">
        <h4>Library</h4>
        <div className="me-row">
          <label>Library</label>
          <select value={library} onChange={(e) => setLibrary(e.target.value)}>
            {(libraries ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        {info && <p className="muted ow-note">Cut from {info.sources.length} chunks: {info.sources.join(", ")}.</p>}
        <div className="me-actions">
          <button onClick={slice} disabled={!library || slicing}>{slicing ? "Cutting…" : info?.sliced ? "Cut again" : "Cut the tiles"}</button>
        </div>
        {error && <p className="ow-error ow-note">{error}</p>}
        {catalogue && (
          <p className="muted ow-note">{catalogue.tiles.length} tiles: {catalogue.tiles.filter((t) => t.kind === "ground").length} ground pieces
            (what a chunk draws over one tile) and {catalogue.tiles.filter((t) => t.kind === "object").length} objects (kept whole).</p>
        )}
      </section>
      <section className="me-section">
        <h4>Layout of the chunk</h4>
        {!layout.model ? <p className="muted ow-note">Choose a chunk (the Chunks tab, or click the map).</p> : layout.path ? (
          <>
            <div className="me-row"><label>Layout</label><span className="me-mono">{layout.path.slice(layout.path.lastIndexOf("/") + 1)}{layout.dirty ? " •" : ""}</span></div>
            <div className="me-row"><label>Map shows</label>
              <span className="me-inline">
                <label className="ow-check"><input type="radio" checked={layout.shown} onChange={() => onShowLayout(true)} /> the layout</label>
                <label className="ow-check"><input type="radio" checked={!layout.shown} onChange={() => onShowLayout(false)} /> the chunk's model</label>
              </span>
            </div>
            <div className="me-row"><label>Click paints</label>
              <select value={paint} onChange={(e) => setPaint(e.target.value as PaintMode)}>
                <option value="off">nothing (off)</option>
                <option value="tile" disabled={!chosen}>the chosen tile{chosen ? "" : " (choose one below)"}</option>
                <option value="erase">away the objects on a tile</option>
              </select>
            </div>
            <div className="me-row"><label>Height</label>
              <select value={height} onChange={(e) => setHeight(e.target.value as PaintHeight)}>
                <option value="cell">the ground the tile goes on</option>
                <option value="tile">where the tile came from</option>
              </select>
            </div>
            <div className="me-actions">
              <button className="primary" onClick={onCompose} disabled={busy} title="Saves the layout and the collision painted with it, then writes the chunk's model.glb from its tiles">
                {busy ? "Composing…" : "Compose into the chunk"}</button>
            </div>
            <p className="muted ow-note">A ground tile replaces the cell's; an object goes on top; each brings its collision (moved to its
              height; a split tile keeps the chunk's). Compose saves the layout and the collision and writes the chunk's model from the
              layout (the props stay), marked written. Ctrl+Z undoes painting.</p>
          </>
        ) : (
          <>
            <p className="ow-note">{layout.model} has no layout.</p>
            <div className="me-actions">
              <button onClick={onStart} disabled={!cuts || busy}
                      title={cuts ? "A layout of the chunk as it is (a new map's chunk: as its template is), from this library's tiles" : "This library isn't cut from this chunk"}>Start a layout from the chunk</button>
            </div>
            {!cuts && <p className="muted ow-note">The library isn't cut from this chunk; add it to the library's sources first.</p>}
            {cuts && !info?.sources.includes(layout.model) && <p className="muted ow-note">A new map's chunk starts from its template's tiles,
              which the library must be cut from.</p>}
          </>
        )}
      </section>
      {catalogue && (
        <section className="me-section">
          <h4>Tiles</h4>
          <div className="me-row">
            <label>Show</label>
            <span className="me-inline">
              <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="all">all</option><option value="ground">ground</option><option value="object">objects</option>
              </select>
              <input className="filter" placeholder="Material or name…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </span>
          </div>
          <div className="me-palette">
            {tiles.slice(0, shown).map((t) => (
              <TileButton key={t.key} library={library} tile={t} chosen={chosen?.key === t.key} onClick={() => setChosen(t)} />
            ))}
          </div>
          {tiles.length > shown && <div className="me-actions"><button onClick={() => setShown((n) => n + PAGE)}>Show more ({tiles.length - shown} left)</button></div>}
        </section>
      )}
      {chosen && (
        <section className="me-section">
          <h4>{tileLabel(chosen)}</h4>
          <div className="me-row"><label>Kind</label><span>{chosen.kind === "ground" ? "ground piece" : "object"}, {chosen.size[0]} × {chosen.size[1]} tile(s)</span></div>
          <div className="me-row"><label>Used</label><span>{chosen.uses} time(s)</span></div>
          <div className="me-row"><label>Triangles</label><span>{chosen.triangles}</span></div>
          <div className="me-row"><label>Materials</label><span className="me-mono">{chosen.materials.join(", ")}</span></div>
          <div className="me-row"><label>Collision</label><span className="me-mono">{chosen.collision.flat().map((c) => c ? `0x${(c.tile_type >>> 0).toString(16)}` : "none").join(" ")}</span></div>
          <h4>Where it's used</h4>
          <ul className="me-list">
            {chosen.at.map((a, i) => (
              <li key={i}><span className="me-mono">{a.model}</span> at tile {a.x}, {a.z}, height {a.y}{" "}
                {map?.chunks.some((c) => c.folder.endsWith(`/${a.model}`)) && <button className="link" onClick={() => onShow(a.model)}>show</button>}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function TileButton({ library, tile, chosen, onClick }: { library: string; tile: Tile; chosen: boolean; onClick(): void }) {
  const [src, setSrc] = useState("");
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Drawn when it scrolls into view
    const el = ref.current;
    if (!el) return;
    let live = true;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      tileThumbnail(library, tile).then((url) => { if (live) setSrc(url); }, () => {});
    });
    observer.observe(el);
    return () => { live = false; observer.disconnect(); };
  }, [library, tile]);
  return (
    <button ref={ref} className={`me-tile${chosen ? " selected" : ""}`} onClick={onClick} title={`${tileLabel(tile)}: used ${tile.uses} time(s)`}>
      {src ? <img src={src} alt="" /> : <span className="me-tile-blank" />}
      <span className="me-tile-name">{tileLabel(tile)}</span>
      <span className="me-tile-uses muted">×{tile.uses}{tile.kind === "object" ? ` · ${tile.size[0]}×${tile.size[1]}` : ""}</span>
    </button>
  );
}
