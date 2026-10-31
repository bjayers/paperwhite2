// A zone's map as the field builds it (docs/data.md, Map model sources and Map matrices): its map matrix
// (res/field/matrices/<matrix>.json) places a map chunk in each cell, 32 by 32 tiles of 16 units, centered on the cell;
// each chunk's collision is one or two layers of tiles (terrain_<layer>.csv), each with a shape, a slope and a height
// index into the tables of src/ov036/field_map_chunk_height.c, and its tile type: flags in the high 16 bits (bit 0
// blocks walking, 0x2 water, 0x4 wild encounters, 0x40 reflections) and the tile class in the low 16.

import { api } from "../../api.ts";

export const TILE = 16;
export const CHUNK_TILES = 32;
export const CHUNK = TILE * CHUNK_TILES;

export const TILE_FLAG_COLLISION = 0x1;
export const TILE_FLAG_WATER = 0x2;
export const TILE_FLAG_ENCOUNT = 0x4;
export const TILE_FLAG_REFLECT = 0x40;

export interface TerrainTile {
  x: number;
  z: number;
  shape: number;
  slope: number;
  offset: number;
  tileType: number;
  diagonal: number;
}

export interface TerrainLayer {
  /** The CSV's path, which the permissions painter writes. */
  path: string;
  tiles: TerrainTile[];
  /** Each tile's height at its center, in units, by index (z * 32 + x). */
  heights: number[];
  /** The split planes (terrain_<layer>_splits.csv), by index: slope0, slope1, offset0, offset1. */
  splits: number[][];
}

export interface Chunk {
  model: string;
  /** Its folder: res/field/maps/models/<model>/. */
  folder: string;
  /** Its cell in the matrix. */
  column: number;
  row: number;
  layers: TerrainLayer[];
}

export interface ZoneMap {
  zone: string;
  matrix: string;
  /** The matrix's size, in cells. */
  columns: number;
  rows: number;
  chunks: Chunk[];
}

interface HeightTables {
  /** Each slope's normal, x, y and z, already as the game reads it (z negated), in units. */
  slopes: number[][];
  offsets: number[];
}

let tables: Promise<HeightTables> | null = null;

/** The slope and height tables, read from the C source so they stay the game's. */
function heightTables(): Promise<HeightTables> {
  if (!tables) {
    tables = api.scan("src/ov036/field_map_chunk_height.c", ".").then((lines) => {
      const text = lines.map((l) => l.text).join("\n");
      const numbers = (name: string) => {
        const start = text.indexOf(name);
        const body = text.slice(text.indexOf("{", start) + 1, text.indexOf("};", start));
        return [...body.matchAll(/-?0x[0-9a-fA-F]+|-?\d+/g)].map((m) => {
          const v = m[0];
          return v.replace("-", "").startsWith("0x") ? (v.startsWith("-") ? -1 : 1) * parseInt(v.replace("-", ""), 16) : Number(v);
        });
      };
      const raw = numbers("MAP_HEIGHT_SLOPE_TABLE[]");
      const slopes: number[][] = [];
      for (let i = 0; i + 2 < raw.length; i += 3) slopes.push([raw[i] / 4096, raw[i + 1] / 4096, -raw[i + 2] / 4096]);
      return { slopes, offsets: numbers("MAP_HEIGHT_OFFSET_TABLE[]").map((v) => v / 4096) };
    });
    tables.catch(() => { tables = null; });
  }
  return tables;
}

function parseCsv(text: string): Record<string, number>[] {
  const lines = text.trim().split("\n");
  const head = lines[0].split(",");
  return lines.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [head[i], Number(v)])));
}

/** A tile's height at a point of it, relative to the chunk's center (FieldChunkAccessor_GetTerrainCore). */
function heightAt(t: TerrainTile, splits: number[][], tb: HeightTables, px: number, pz: number, inX: number, inZ: number): number {
  let slope = t.slope;
  let offset = t.offset;
  if (t.shape === 2) {
    const s = splits[t.offset];
    if (!s) return 0;
    const first = t.diagonal === 0 ? inX + inZ < TILE : inX > inZ;
    slope = first ? s[0] : s[1];
    offset = first ? s[2] : s[3];
  } else if (t.shape !== 0) {
    return 0;
  }
  const n = tb.slopes[slope] ?? [0, 1, 0];
  const o = tb.offsets[offset] ?? 0;
  return n[1] ? -(o + n[0] * px + n[2] * pz) / n[1] : 0;
}

/** Where a layer's text comes from: the file, or an unsaved copy (the painter's). */
type TextSource = (path: string) => string | null;

async function loadLayer(path: string, splitsPath: string, tb: HeightTables, source?: TextSource): Promise<TerrainLayer | null> {
  let text: string;
  const own = source?.(path);
  if (own !== null && own !== undefined) text = own;
  else {
    try {
      text = (await api.file(path)).text;
    } catch {
      return null;
    }
  }
  const splitsText = await api.file(splitsPath).then((f) => f.text, () => "");
  const splits = splitsText.trim() ? parseCsv(splitsText).map((r) => [r.slope0 ?? 0, r.slope1 ?? 0, r.offset0 ?? 0, r.offset1 ?? 0]) : [];
  const tiles = parseCsv(text) as unknown as TerrainTile[];
  tiles.forEach((t) => (t.tileType = Number((t as unknown as Record<string, number>).tile_type)));
  const heights = tiles.map((t) => heightAt(t, splits, tb, t.x * TILE + TILE / 2 - CHUNK / 2, t.z * TILE + TILE / 2 - CHUNK / 2, TILE / 2, TILE / 2));
  return { path, tiles, heights, splits };
}

/** A chunk's terrain layers again, after the painter changed one. */
export async function reloadLayers(chunk: Chunk, source?: TextSource): Promise<void> {
  const tb = await heightTables();
  const layers: TerrainLayer[] = [];
  for (let layer = 0; layer < 2; layer++) {
    const l = await loadLayer(`${chunk.folder}/terrain_${layer}.csv`, `${chunk.folder}/terrain_${layer}_splits.csv`, tb, source);
    if (l) layers.push(l);
  }
  chunk.layers = layers;
}

/** The zone's chunks: the matrix's cells that are the zone's (the overworld's name their zones), or all of a small
 * matrix's. */
export async function loadZoneMap(zone: string): Promise<ZoneMap> {
  const zoneData = JSON.parse((await api.file(`res/field/zones/${zone}.json`)).text) as { matrix: string };
  const matrixFile = `res/field/matrices/${zoneData.matrix.replace(/^MAP_MATRIX_/, "").toLowerCase()}.json`;
  const matrix = JSON.parse((await api.file(matrixFile)).text) as { maps: (string | null)[][]; zones?: (string | null)[][] };
  const tb = await heightTables();
  const constant = `ZONE_${zone.toUpperCase()}`;
  const cells: { model: string; column: number; row: number }[] = [];
  matrix.maps.forEach((row, r) => row.forEach((model, c) => {
    if (!model) return;
    if (matrix.zones && matrix.zones[r]?.[c] !== constant) return;
    cells.push({ model, column: c, row: r });
  }));
  const chunks = await Promise.all(cells.map(async (cell) => {
    const folder = `res/field/maps/models/${cell.model.replace(/^MAP_MODEL_/, "").toLowerCase()}`;
    const chunk: Chunk = { ...cell, folder, layers: [] };
    const layers: TerrainLayer[] = [];
    // Two layers only where the chunk has the second's file
    const files = await api.list(`${folder}/terrain_*.csv`);
    for (let layer = 0; layer < 2; layer++) {
      if (!files.includes(`${folder}/terrain_${layer}.csv`)) continue;
      const l = await loadLayer(`${folder}/terrain_${layer}.csv`, `${folder}/terrain_${layer}_splits.csv`, tb);
      if (l) layers.push(l);
    }
    chunk.layers = layers;
    return chunk;
  }));
  return { zone, matrix: zoneData.matrix, columns: matrix.maps[0]?.length ?? 0, rows: matrix.maps.length, chunks };
}

/** The tile at a global tile position, and its height, on a layer. */
export function tileAt(map: ZoneMap, gx: number, gz: number, layer = 0): { chunk: Chunk; tile: TerrainTile; height: number } | null {
  const column = Math.floor(gx / CHUNK_TILES), row = Math.floor(gz / CHUNK_TILES);
  const chunk = map.chunks.find((c) => c.column === column && c.row === row);
  const l = chunk?.layers[Math.min(layer, (chunk?.layers.length ?? 1) - 1)];
  if (!chunk || !l) return null;
  const i = (gz - row * CHUNK_TILES) * CHUNK_TILES + (gx - column * CHUNK_TILES);
  return l.tiles[i] ? { chunk, tile: l.tiles[i], height: l.heights[i] } : null;
}

/** A tile's flags and class, from its type. */
export const tileFlags = (t: number) => (t >>> 16) & 0xffff;
export const tileClass = (t: number) => t & 0xffff;
