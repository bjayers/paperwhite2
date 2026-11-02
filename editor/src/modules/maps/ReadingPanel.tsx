// What the map reader (tools/paperwhite2/map_reader.py, docs/paperwhite2/design/map-reader.md) makes of the chosen
// chunk: the Reading layer over the map colours each tile by its reading, and a click shows a tile's whole record.

export interface TileRecord {
  x: number;
  z: number;
  reading: { terrain: string | null; edge: { texture: string; outside: string | null; of: string | null; cover: number } | null;
    structure: boolean; decoration: boolean; confidence: string; levels: number };
  ground: { y: number; texture: string; role: string | null; v: number } | null;
  [fact: string]: unknown;
}

export interface ChunkReading {
  model: string;
  size: number;
  chunk: { textures: Record<string, { role: string; alpha: string; tiles: number; pieces: number }> };
  tiles: TileRecord[];
}

export function ReadingPanel({ reading, tile, rev, setRev, loading, error, terrainName }: {
  reading: ChunkReading | null;
  tile: TileRecord | null;
  rev: "now" | "original";
  setRev(r: "now" | "original"): void;
  loading: boolean;
  error: string | null;
  terrainName(key: string | null): string;
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
      {!tile && reading && <p className="muted ow-note">Each tile is coloured by its terrain; an edge's arrow points at its outside; a dashed tile is unsure, a
        boxed one has a structure on it. Click a tile for its whole record.</p>}
      {tile && (
        <>
          <div className="me-row"><label>Tile</label><span>{tile.x}, {tile.z}</span></div>
          <div className="me-row"><label>Terrain</label><span>{terrainName(tile.reading.terrain)} <span className="muted">({tile.reading.confidence})</span></span></div>
          <div className="me-row"><label>Edge</label><span>{tile.reading.edge
            ? <>{tile.reading.edge.texture}, its outside {tile.reading.edge.outside ?? "?"}</> : <span className="muted">none</span>}</span></div>
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
