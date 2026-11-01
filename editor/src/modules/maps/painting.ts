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
  objects?: [string, number, number][];
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

export type PaintTool = "terrain" | "height" | "both" | "raise" | "lower" | "place" | "select";
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

/** The cells of a stroke: as painted, or the rectangle from its first tile to its last. */
export function strokeCells(tiles: { x: number; z: number }[], shape: PaintShape): { x: number; z: number }[] {
  if (shape === "pencil" || tiles.length < 2) return tiles;
  const a = tiles[0], b = tiles[tiles.length - 1];
  const out: { x: number; z: number }[] = [];
  for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z); z++) for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) out.push({ x, z });
  return out;
}
