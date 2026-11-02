// The Map Editor's painted maps and object library, as the editor reads them (docs/paperwhite2/design/map-editor.md,
// Painting maps): a project (res/paperwhite2/map_projects/<model>.json), its style (res/paperwhite2/map_styles/
// <style>.json) and the library's objects (res/paperwhite2/map_objects/<object>/object.json).

import { api } from "../../api.ts";

export interface Project {
  model: string;
  style: string;
  size?: number;
  terrain: string[];
  /** In half tiles. */
  height: number[][];
  /** Its name, the x and z of its north-west tile, and how many quarter turns clockwise it's turned (none: 0). */
  objects?: PlacedObject[];
}

export type PlacedObject = [string, number, number] | [string, number, number, number];

/** A placed object's footprint in tiles, east by south, as it's turned. */
export function footprint(object: PlacedObject, library: LibraryObject[]): [number, number] {
  const size = library.find((o) => o.id === object[0])?.size ?? [1, 1];
  return (object[3] ?? 0) % 2 ? [size[1], size[0]] : [size[0], size[1]];
}

export interface MapStyle {
  name: string;
  texture_set: string;
  terrains: { key: string; name: string; color?: string; tile_type: number }[];
}

export interface LibraryObject {
  id: string;
  name: string;
  category?: string;
  size: [number, number];
  collision?: (number | null)[][];
  textures?: string[];
  triangles?: number;
}

export type PaintTool = "terrain" | "height" | "both" | "raise" | "lower" | "fill" | "place" | "select";
export type PaintShape = "pencil" | "rect";

export const PROJECT_SCHEMA = "res/paperwhite2/map_projects/map_project.schema.json";
export const projectPath = (model: string) => `res/paperwhite2/map_projects/${model}.json`;

export async function loadStyles(): Promise<Map<string, MapStyle>> {
  const files = (await api.list("res/paperwhite2/map_styles/*.json")).filter((p) => !p.endsWith(".schema.json"));
  const out = new Map<string, MapStyle>();
  for (const path of files) out.set(path.slice(path.lastIndexOf("/") + 1, -5), JSON.parse((await api.file(path)).text));
  return out;
}

export async function loadLibrary(): Promise<LibraryObject[]> {
  const files = await api.list("res/paperwhite2/map_objects/*/object.json");
  const out: LibraryObject[] = [];
  for (const path of files) {
    const id = path.split("/")[3];
    out.push({ id, ...JSON.parse((await api.file(path)).text) });
  }
  return out.sort((a, b) => `${a.category ?? ""}${a.name}`.localeCompare(`${b.category ?? ""}${b.name}`));
}

/** A project with a stroke painted: the cells (chunk tiles) given the brush's terrain and height. A height painted on a
 * tile that keeps the chunk paints it fallback too, since the generator gives kept tiles the chunk's own heights. */
export function painted(project: Project, cells: { x: number; z: number }[], tool: PaintTool, terrain: string, height: number,
                        fallback: string): Project {
  const rows = project.terrain.map((r) => [...r]);
  const heights = project.height.map((r) => [...r]);
  for (const { x, z } of cells) {
    if (!rows[z] || rows[z][x] === undefined) continue;
    if (tool === "terrain" || tool === "both") rows[z][x] = terrain;
    if ((tool === "height" || tool === "raise" || tool === "lower") && rows[z][x] === ".") rows[z][x] = fallback;
    if (tool === "height" || tool === "both") heights[z][x] = height;
    if (tool === "raise") heights[z][x] = Math.min(80, heights[z][x] + 1);
    if (tool === "lower") heights[z][x] = Math.max(-40, heights[z][x] - 1);
  }
  return { ...project, terrain: rows.map((r) => r.join("")), height: heights };
}

/** A fill's cells: the tile clicked and every tile joined to it, side by side, of the same terrain at the same height. */
export function fillCells(project: Project, start: { x: number; z: number }): { x: number; z: number }[] {
  const at = (x: number, z: number) => project.terrain[z]?.[x] === undefined ? null : `${project.terrain[z][x]}:${project.height[z][x]}`;
  const want = at(start.x, start.z);
  if (want === null) return [];
  const seen = new Set<string>([`${start.x},${start.z}`]);
  const out: { x: number; z: number }[] = [];
  const queue = [start];
  while (queue.length) {
    const c = queue.pop()!;
    out.push(c);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: c.x + dx, z: c.z + dz };
      const key = `${n.x},${n.z}`;
      if (!seen.has(key) && at(n.x, n.z) === want) { seen.add(key); queue.push(n); }
    }
  }
  return out;
}

/** The cells of a stroke: as painted, or the rectangle from its first tile to its last. */
export function strokeCells(tiles: { x: number; z: number }[], shape: PaintShape): { x: number; z: number }[] {
  if (shape === "pencil" || tiles.length < 2) return tiles;
  const a = tiles[0], b = tiles[tiles.length - 1];
  const out: { x: number; z: number }[] = [];
  for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z); z++) for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) out.push({ x, z });
  return out;
}
