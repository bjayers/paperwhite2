// A zone's map as the field builds it (docs/data.md, Map model sources and Map matrices): its map matrix
// (res/field/matrices/<matrix>.json) places a map chunk in each cell, 32 by 32 tiles of 16 units, centered on the cell;
// each chunk's collision is one or two layers of tiles (terrain_<layer>.csv), each with a shape, a slope and a height
// index into the tables of src/ov036/field_map_chunk_height.c, and its tile type: flags in the high 16 bits (bit 0
// blocks walking, 0x2 water, 0x4 wild encounters, 0x40 reflections) and the tile class in the low 16.
//
// Seasons (and the version and some events) replace chunks or whole matrices
// (res/field/map_replacements/replacements.json, as MapMatrix_Patch applies them): a season's chunk is another map
// model, with its own collision. The zone's area, whose number the season adds to (AreaData_Create), gives the
// texture set the models are drawn with.

import { api } from "../../api.ts";
import type { Constants } from "../../../shared/schema.ts";

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

export const SEASONS = ["Spring", "Summer", "Autumn", "Winter"];

export interface ZoneMap {
  zone: string;
  /** The season it is shown in, 0 to 3, and whether the zone's area has seasons. */
  season: number;
  seasonal: boolean;
  /** The texture set of the zone's area in the season (res/field/maps/textures/<set>/), and its files' names. */
  textureSet: string | null;
  textures: Set<string>;
  /** The area's prop bundle in the season, whose models the chunks' props are (res/field/props/.../models/<bundle>). */
  propBundle: string | null;
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
export function heightTables(): Promise<HeightTables> {
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
  // The layers it has, in their files: terrain_<layer>.csv and its splits
  for (const old of chunk.layers) {
    const l = await loadLayer(old.path, old.path.replace(/\.csv$/, "_splits.csv"), tb, source);
    if (l) layers.push(l);
  }
  chunk.layers = layers;
}

interface Replacement {
  matrix: string | number;
  kind: "chunk" | "matrix";
  condition: string | number;
  values: (string | number)[];
}

const AREA_SEASONS_FIRST = 2;
const AREA_SEASONS_END = 0x11a;

/** A constant's name for a value, of a prefix. */
function nameOf(constants: Constants, prefix: string, value: number): string | null {
  for (const [k, v] of constants) if (v === value && k.startsWith(prefix)) return k;
  return null;
}

/** The value a replacement gives in White 2 in a season, or null for one an event or the version decides by default. */
function replacementValue(r: Replacement, season: number): string | number | null {
  switch (r.condition) {
    case "season": return r.values[season] ?? null;
    case "version_season": return r.values[season + 1] ?? null;
    case "version": return r.values[1] ?? null;
    default: return null;
  }
}

/** The zone's chunks in a season: the matrix's cells that are the zone's (the overworld's name their zones), or all of
 * a small matrix's, after the season's replacements. */
export async function loadZoneMap(zone: string, season: number, constants: Constants): Promise<ZoneMap> {
  const zoneData = JSON.parse((await api.file(`res/field/zones/${zone}.json`)).text) as { matrix: string; area?: string };
  const same = (a: string | number, b: string | number) => a === b || (constants.get(String(a)) ?? a) === (constants.get(String(b)) ?? b);
  const replacements = await api.file("res/field/map_replacements/replacements.json")
    .then((f) => (JSON.parse(f.text) as { replacements: Replacement[] }).replacements, () => [] as Replacement[]);
  // A matrix the season replaces, as the field loads the replacement
  let matrixName = zoneData.matrix;
  for (const r of replacements) {
    if (r.kind !== "matrix" || !same(r.matrix, matrixName) || !same(r.values[0], matrixName)) continue;
    const v = replacementValue(r, season);
    if (v !== null) matrixName = typeof v === "number" ? nameOf(constants, "MAP_MATRIX_", v) ?? matrixName : v;
  }
  const matrixFile = `res/field/matrices/${matrixName.replace(/^MAP_MATRIX_/, "").toLowerCase()}.json`;
  const matrix = JSON.parse((await api.file(matrixFile)).text) as { maps: (string | null)[][]; zones?: (string | null)[][] };
  const chunkSwaps = replacements.filter((r) => r.kind === "chunk" && same(r.matrix, zoneData.matrix));
  const swapped = (model: string): string => {
    for (const r of chunkSwaps) {
      if (!same(r.values[0], model)) continue;
      const v = replacementValue(r, season);
      if (v !== null) return typeof v === "number" ? nameOf(constants, "MAP_MODEL_", v) ?? model : v;
    }
    return model;
  };
  // The area in the season, and its texture set
  const areaNumber = zoneData.area ? constants.get(zoneData.area) : undefined;
  const seasonal = areaNumber !== undefined && areaNumber >= AREA_SEASONS_FIRST && areaNumber < AREA_SEASONS_END;
  let textureSet: string | null = null;
  let textures = new Set<string>();
  let propBundle: string | null = null;
  const areaName = areaNumber === undefined ? null : seasonal ? nameOf(constants, "AREA_", areaNumber + season) : zoneData.area!;
  if (areaName) {
    const area = await api.file(`res/field/areas/${areaName.replace(/^AREA_/, "").toLowerCase()}.json`)
      .then((f) => JSON.parse(f.text) as { texture_set?: string; prop_bundle?: string }, () => null);
    const bundle = /^FIELD_PROPS_(EXTERIOR|INTERIOR)_(.+)$/.exec(area?.prop_bundle ?? "");
    if (bundle) propBundle = `res/field/props/${bundle[1].toLowerCase()}/models/${bundle[2].toLowerCase()}`;
    if (area?.texture_set) {
      textureSet = area.texture_set.replace(/^MAP_TEXTURE_SET_/, "").toLowerCase();
      textures = new Set((await api.list(`res/field/maps/textures/${textureSet}/*.png`)).map((p) => p.slice(p.lastIndexOf("/") + 1)));
    }
  }
  const tb = await heightTables();
  const constant = `ZONE_${zone.toUpperCase()}`;
  const cells: { model: string; column: number; row: number }[] = [];
  matrix.maps.forEach((row, r) => row.forEach((model, c) => {
    if (!model) return;
    if (matrix.zones && matrix.zones[r]?.[c] !== constant) return;
    cells.push({ model: swapped(model), column: c, row: r });
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
  return { zone, season, seasonal, textureSet, textures, propBundle, matrix: matrixName, columns: matrix.maps[0]?.length ?? 0, rows: matrix.maps.length, chunks };
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

/** A tile type the game counts as a tile (MapTile_IsValid): not TILE_TYPE_NONE, nor of TILE_CLASS_NONE. */
export const tileIsValid = (t: number) => t >>> 0 !== 0xffffffff && (t & 0xffff) !== 0xff;

/** The layer an entity at a height stands on, and its height there: of the layers with a tile here, the one nearest
 * the height (FieldG3DMapper_GetTerrain), as the game places an actor. Null off the map. */
export function standingOn(map: ZoneMap, gx: number, gz: number, y: number): { layer: number; height: number } | null {
  const column = Math.floor(gx / CHUNK_TILES), row = Math.floor(gz / CHUNK_TILES);
  const chunk = map.chunks.find((c) => c.column === column && c.row === row);
  if (!chunk?.layers.length) return null;
  const i = (gz - row * CHUNK_TILES) * CHUNK_TILES + (gx - column * CHUNK_TILES);
  if (chunk.layers.length === 1) return chunk.layers[0].tiles[i] ? { layer: 0, height: chunk.layers[0].heights[i] } : null;
  let best: { layer: number; height: number } | null = null;
  chunk.layers.forEach((l, layer) => {
    const t = l.tiles[i];
    if (!t || !tileIsValid(t.tileType)) return;
    if (!best || Math.abs(l.heights[i] - y) < Math.abs(best.height - y)) best = { layer, height: l.heights[i] };
  });
  return best ?? (chunk.layers[0].tiles[i] ? { layer: 0, height: chunk.layers[0].heights[i] } : null);
}

/** The flat tile nearest a height, in units: slope 0 and the offset whose height is nearest, and that height (the
 * offsets are the game's table, so not every height is there; half tiles are, from -10 to 10 tiles but -8). */
export async function flatTileFor(height: number): Promise<{ slope: number; offset: number; height: number }> {
  const tb = await heightTables();
  const ny = tb.slopes[0][1];
  let offset = 0;
  tb.offsets.forEach((o, i) => { if (Math.abs(-o / ny - height) < Math.abs(-tb.offsets[offset] / ny - height)) offset = i; });
  return { slope: 0, offset, height: -tb.offsets[offset] / ny };
}

/** The flags the painter sets; it keeps a tile's others (rail tiles have 0x80, which no code names yet). */
const PAINTED_FLAGS = (TILE_FLAG_COLLISION | TILE_FLAG_WATER | TILE_FLAG_ENCOUNT | TILE_FLAG_REFLECT) << 16;

/** A tile type painted over another: the paint's class and known flags, the tile's other flags. */
export const paintOver = (tile: number, paint: number) => ((((tile >>> 0) & ~(PAINTED_FLAGS | 0xffff)) | paint) >>> 0);

/** A tile's flags and class, from its type. */
export const tileFlags = (t: number) => (t >>> 16) & 0xffff;
export const tileClass = (t: number) => t & 0xffff;
