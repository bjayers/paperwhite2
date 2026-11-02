// What the map reader (tools/paperwhite2/map_reader.py, docs/paperwhite2/design/map-reader.md) makes of the chosen
// chunk: the Reading layer over the map colours each tile by its reading, and a click shows a tile's whole record.

export interface TileRecord {
  x: number;
  z: number;
  reading: { terrain: string | null; edge: { texture: string; outside: string | null; of: string | null; cover: number } | null;
    bend: { texture: string; from: string | null; cover: number } | null; slope: { texture: string; down: string | null; cover: number } | null;
    structure: boolean; deck: string | null; under: string | null; decoration: boolean; confidence: string; known?: boolean; levels: number };
  layers?: { layer: number; height: number | null; y: number | null; texture: string | null; terrain: string | null; tile_type: number }[];
  open_sides?: string[];
  filled?: string;
  ground: { y: number; texture: string; role: string | null; v: number } | null;
  [fact: string]: unknown;
}

export interface ChunkReading {
  model: string;
  size: number;
  chunk: { textures: Record<string, { role: string; alpha: string; tiles: number; pieces: number }> };
  tiles: TileRecord[];
}

export function ReadingPanel({ reading, tile, rev, setRev, loading, error, terrainName, legend }: {
  reading: ChunkReading | null;
  tile: TileRecord | null;
  rev: "now" | "original";
  setRev(r: "now" | "original"): void;
  loading: boolean;
  error: string | null;
  terrainName(key: string | null): string;
  /** The layer's colours, by terrain. */
  legend: [string, string][];
}) {
  const roles = reading?.chunk.textures ?? {};
  return (
    <section className="me-section">
      <h4>Reading</h4>
      <div className="me-row"><label>Read</label>
        <span className="me-inline">
          <label className="ow-check"><input type="radio" checked={rev === "now"} onChange={() => setRev("now")} /> as it is now</label>
          <label className="ow-check"><input type="radio" checked={rev === "original"} onChange={() => setRev("original")} /> as in the original game</label>
        </span>
      </div>
      {loading && <p className="muted ow-note">Reading…</p>}
      {error && <p className="ow-note">{error}</p>}
      {!tile && reading && <p className="muted ow-note">Each tile is coloured by its terrain; an edge's arrow points at its outside, a slope's downhill; a
        dashed tile is unsure, a boxed one has a structure on it (a deck: what lies under it is in its record). A tile on two levels has a square
        at each. Click a tile for its whole record.</p>}
      {reading && (
        <div className="me-legend">
          {legend.map(([key, color]) => <span key={key} className="me-legend-item"><span className="me-swatch" style={{ background: color }} />{terrainName(key)}</span>)}
        </div>
      )}
      {tile && (
        <>
          <div className="me-row"><label>Tile</label><span>{tile.x}, {tile.z}</span></div>
          <div className="me-row"><label>Terrain</label><span>{terrainName(tile.reading.terrain)} <span className="muted">({tile.reading.confidence}{tile.reading.known === false ? ", not in the style" : ""})</span></span></div>
          {tile.reading.deck && <div className="me-row"><label>Deck</label><span>{tile.reading.deck}{tile.reading.under ? <>, over {terrainName(tile.reading.under)}</> : ""}</span></div>}
          {(tile.layers?.length ?? 0) > 1 && <div className="me-row"><label>Layers</label><span>{tile.layers!.map((l) =>
            `${l.layer}: ${l.height ?? "?"}${l.terrain ? ` ${terrainName(l.terrain)}` : " (nothing drawn there)"}`).join("; ")}</span></div>}
          {(tile.open_sides?.length ?? 0) > 0 && <div className="me-row"><label>Open sides</label><span>{tile.open_sides!.join(", ")} <span className="muted">(no wall drawn: not copied)</span></span></div>}
          <div className="me-row"><label>Edge</label><span>{tile.reading.edge
            ? <>{tile.reading.edge.texture}, its outside {tile.reading.edge.outside ?? "?"}</>
            : tile.reading.bend ? <>a bend of {tile.reading.bend.texture} reaching in from {tile.reading.bend.from ?? "?"}</>
            : <span className="muted">none</span>}</span></div>
          {tile.reading.slope && <div className="me-row"><label>Slope</label><span>{tile.reading.slope.texture}, down to the {tile.reading.slope.down ?? "?"}</span></div>}
          {tile.filled && tile.filled !== "model" && <div className="me-row"><label>Read from</label><span>its {tile.filled} (no ground drawn)</span></div>}
          <div className="me-row"><label>Ground</label><span>{tile.ground ? <>{tile.ground.texture} at {tile.ground.y}</> : <span className="muted">none drawn</span>}</span></div>
          <div className="me-row"><label>On it</label><span>{[tile.reading.structure && "a structure", tile.reading.decoration && "decorations"]
            .filter(Boolean).join(", ") || <span className="muted">nothing</span>}</span></div>
          <details className="me-record">
            <summary>The whole record</summary>
            <pre className="me-mono">{JSON.stringify(tile, null, 1)}</pre>
          </details>
        </>
      )}
      {reading && (
        <details className="me-record">
          <summary>The chunk's textures, by their role</summary>
          <pre className="me-mono">{Object.entries(roles).sort((a, b) => a[1].role.localeCompare(b[1].role))
            .map(([t, r]) => `${r.role.padEnd(10)} ${t} (${r.tiles} tiles)`).join("\n")}</pre>
        </details>
      )}
    </section>
  );
}
