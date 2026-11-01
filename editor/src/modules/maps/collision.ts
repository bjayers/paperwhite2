// The Map Editor's collision painting: tiles of a chunk's terrain CSVs (res/field/maps/models/<model>/terrain_<layer>
// .csv, map_terrain_data.py) given a tile type, a flat height, or a whole tile copied from another, on one layer, and,
// where a season replacement swaps the chunk, on the variants whose tile was the same.
//
// A tile type is a class in its low 16 bits (the TILE_CLASS_ enum of include/field/field_map.h, read from there so it
// stays the game's) and flags in the high 16: collision, water, encounters, reflection (TILE_FLAG_).

import { api } from "../../api.ts";
import { currentText, documents } from "../../documents.ts";
import { TILE, flatTileFor, type Chunk, type ZoneMap } from "../overworld/terrain.ts";

export interface TileClass { value: number; name: string }

let classes: Promise<TileClass[]> | null = null;

/** The game's tile classes, by name, from field_map.h. */
export function tileClasses(): Promise<TileClass[]> {
  if (!classes) {
    classes = api.scan("include/field/field_map.h", "^\\s*TILE_CLASS_\\w+ = 0x[0-9a-fA-F]+").then((lines) => lines.map((l) => {
      const m = /TILE_CLASS_(\w+) = (0x[0-9a-fA-F]+)/.exec(l.text)!;
      return { value: parseInt(m[2], 16), name: m[1].toLowerCase().replace(/_/g, " ") };
    }));
    classes.catch(() => { classes = null; });
  }
  return classes;
}

export const FLAGS = [
  { bit: 0x1, label: "Blocked", title: "TILE_FLAG_COLLISION: the player can't walk onto it" },
  { bit: 0x2, label: "Water", title: "TILE_FLAG_WATER: surfed on" },
  { bit: 0x4, label: "Encounters", title: "TILE_FLAG_ENCOUNT: wild Pokémon appear on it" },
  { bit: 0x40, label: "Reflects", title: "TILE_FLAG_REFLECT: the player's reflection shows on it" },
];

/** What a stroke paints: a tile type (class and flags), a flat height, or a whole tile's row copied from another. */
export type Brush =
  | { kind: "type"; tileType: number }
  | { kind: "height"; tiles: number }
  | { kind: "copy"; row: Record<string, number> };

export interface PaintResult { paths: string[]; note: string | null }

/** The columns a brush writes. */
const WRITES: Record<Brush["kind"], string[]> = {
  type: ["tile_type"],
  height: ["shape", "slope", "offset"],
  copy: ["shape", "slope", "offset", "tile_type", "diagonal"],
};

/** Paints tiles (global tile positions) of a map on a layer. variants gives, for a chunk's folder, the folders of its
 * season variants, whose tile is painted too where it was the same as the chunk's. */
export async function paintTiles(map: ZoneMap, tiles: { x: number; z: number }[], layer: number, brush: Brush,
                                 variants: (folder: string) => string[]): Promise<PaintResult> {
  let note: string | null = null;
  let values: Record<string, number>;
  if (brush.kind === "height") {
    const flat = await flatTileFor(brush.tiles * TILE);
    if (Math.abs(flat.height - brush.tiles * TILE) > 0.1)
      note = `The game's height table has no ${brush.tiles} tiles; painted the nearest, ${Math.round((flat.height / TILE) * 1000) / 1000}.`;
    values = { shape: 0, slope: flat.slope, offset: flat.offset };
  } else if (brush.kind === "type") values = { tile_type: brush.tileType >>> 0 };
  else values = brush.row;
  if (brush.kind === "copy" && brush.row.shape === 2) return { paths: [], note: "A split tile names a row of its own chunk's splits, so it can't be copied yet." };
  const columns = WRITES[brush.kind];
  const byChunk = new Map<Chunk, { x: number; z: number }[]>();
  for (const t of tiles) {
    const chunk = map.chunks.find((c) => Math.floor(t.x / map.chunkTiles) === c.column && Math.floor(t.z / map.chunkTiles) === c.row);
    if (!chunk) continue;
    const cells = byChunk.get(chunk) ?? [];
    cells.push({ x: t.x - chunk.column * map.chunkTiles, z: t.z - chunk.row * map.chunkTiles });
    byChunk.set(chunk, cells);
  }
  const paths: string[] = [];
  for (const [chunk, cells] of byChunk) {
    const l = chunk.layers[Math.min(layer, chunk.layers.length - 1)];
    if (!l) continue;
    const name = l.path.slice(l.path.lastIndexOf("/") + 1);
    const before = await editRows(l.path, cells, map.chunkTiles, columns, values, null);
    if (before) paths.push(l.path);
    for (const folder of variants(chunk.folder)) {
      const path = `${folder}/${name}`;
      if (path === l.path || !(await api.list(path)).includes(path)) continue;
      if (await editRows(path, cells, map.chunkTiles, columns, values, before)) paths.push(path);
    }
  }
  return { paths, note };
}

/** Writes values into a terrain CSV's rows at cells; with match, only where the row was the same as match's before.
 * Returns the rows as they were, by cell, or null when nothing changed. */
async function editRows(path: string, cells: { x: number; z: number }[], width: number, columns: string[],
                        values: Record<string, number>, match: Map<string, string> | null): Promise<Map<string, string> | null> {
  const doc = await documents.hold(path);
  const lines = currentText(doc).split("\n");
  const head = lines[0].split(",");
  const before = new Map<string, string>();
  let changed = false;
  for (const c of cells) {
    const i = 1 + c.z * width + c.x;
    const row = lines[i];
    if (!row) continue;
    const key = `${c.x},${c.z}`;
    if (match && match.get(key) !== row) continue;
    before.set(key, row);
    const parts = row.split(",");
    for (const column of columns) parts[head.indexOf(column)] = String(values[column]);
    const next = parts.join(",");
    if (next !== row) { lines[i] = next; changed = true; }
  }
  if (!changed) return null;
  documents.editText(path, lines.join("\n"));
  return before;
}

/** The row of a tile, for the copy brush and the eyedropper. */
export async function tileRow(map: ZoneMap, x: number, z: number, layer: number): Promise<Record<string, number> | null> {
  const chunk = map.chunks.find((c) => Math.floor(x / map.chunkTiles) === c.column && Math.floor(z / map.chunkTiles) === c.row);
  const l = chunk?.layers[Math.min(layer, chunk.layers.length - 1)];
  if (!chunk || !l) return null;
  const lines = currentText(await documents.hold(l.path)).split("\n");
  const head = lines[0].split(",");
  const row = lines[1 + (z - chunk.row * map.chunkTiles) * map.chunkTiles + (x - chunk.column * map.chunkTiles)];
  return row ? Object.fromEntries(row.split(",").map((v, i) => [head[i], Number(v)])) : null;
}
