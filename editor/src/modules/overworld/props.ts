// The buildings: each map chunk's props, the nodes of its GLB named bw2_prop_<index>_id_<prop ID> (map_model_data.py
// packs them into the chunk), as CTRMap edits them. A prop is a model of the area's prop bundle
// (res/field/props/<exterior|interior>/models/<bundle>/<model>/, whose data.json's res_id is the ID), placed at a
// translation from the chunk's center, in units, and turned about y. The GLB isn't a document of the editor's store,
// so this module keeps each chunk's props with their own undo, and saves them through the server
// (PUT /api/glb-props), which rewrites the nodes.

import { useSyncExternalStore } from "react";
import { api } from "../../api.ts";
import type { Entity } from "./entities.ts";
import { TILE, type ZoneMap } from "./terrain.ts";

export interface Prop {
  id: number;
  /** From the chunk's center, in units, as the GLB has it (y up). */
  x: number;
  y: number;
  z: number;
  /** The turn about y, in degrees. */
  angle: number;
}

interface ChunkProps {
  saved: Prop[];
  current: Prop[];
  undo: Prop[][];
  redo: Prop[][];
  saveError?: string;
}

const PROP = /^bw2_prop_(\d+)_id_(\d+)(?:\.\d+)?$/;
const chunks = new Map<string, ChunkProps>();
const loading = new Map<string, Promise<ChunkProps>>();
const listeners = new Set<() => void>();
let version = 0;

function changed() {
  version++;
  for (const l of listeners) l();
}

/** A GLB's JSON chunk. */
function glbJson(buffer: ArrayBuffer): { nodes?: { name?: string; translation?: number[]; rotation?: number[] }[] } {
  const view = new DataView(buffer);
  const length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)));
}

/** A chunk's props (its folder's model.glb), read once. */
export function loadProps(folder: string): Promise<ChunkProps> {
  const have = chunks.get(folder);
  if (have) return Promise.resolve(have);
  if (!loading.has(folder)) {
    loading.set(folder, fetch(`/${folder}/model.glb`, { cache: "no-store" }).then((r) => r.arrayBuffer()).then((buffer) => {
      const props: { order: number; prop: Prop }[] = [];
      for (const n of glbJson(buffer).nodes ?? []) {
        const m = PROP.exec(n.name ?? "");
        if (!m) continue;
        const [x, y, z] = n.translation ?? [0, 0, 0];
        const [, qy, , qw] = n.rotation ?? [0, 0, 0, 1];
        props.push({ order: Number(m[1]), prop: { id: Number(m[2]), x, y, z, angle: Math.round((2 * Math.atan2(qy, qw) * 180) / Math.PI * 1000) / 1000 } });
      }
      const list = props.sort((a, b) => a.order - b.order).map((p) => p.prop);
      const entry: ChunkProps = { saved: list, current: list, undo: [], redo: [] };
      chunks.set(folder, entry);
      loading.delete(folder);
      changed();
      return entry;
    }));
  }
  return loading.get(folder)!;
}

export function propsOf(folder: string): Prop[] {
  return chunks.get(folder)?.current ?? [];
}

/** Replaces a chunk's props, one step for undo. */
export function setProps(folder: string, props: Prop[]) {
  const c = chunks.get(folder);
  if (!c) return;
  c.undo.push(c.current);
  c.redo = [];
  c.current = props;
  changed();
}

/** Replaces a chunk's props as part of the last step (a value being dragged). */
export function amendProps(folder: string, props: Prop[]) {
  const c = chunks.get(folder);
  if (!c) return;
  c.current = props;
  changed();
}

export function undoProps(folder: string) {
  const c = chunks.get(folder);
  const last = c?.undo.pop();
  if (!c || !last) return;
  c.redo.push(c.current);
  c.current = last;
  changed();
}

export function redoProps(folder: string) {
  const c = chunks.get(folder);
  const next = c?.redo.pop();
  if (!c || !next) return;
  c.undo.push(c.current);
  c.current = next;
  changed();
}

export const propsDirty = (folder: string) => {
  const c = chunks.get(folder);
  return !!c && JSON.stringify(c.current) !== JSON.stringify(c.saved);
};

export const dirtyPropChunks = () => [...chunks.keys()].filter(propsDirty);

export function revertProps() {
  for (const c of chunks.values()) {
    c.current = c.saved;
    c.undo = [];
    c.redo = [];
  }
  changed();
}

/** Writes a chunk's props into its GLB. */
export async function saveProps(folder: string): Promise<void> {
  const c = chunks.get(folder);
  if (!c) return;
  const props = c.current.map((p) => {
    const half = (p.angle * Math.PI) / 360;
    return { id: p.id, translation: [p.x, p.y, p.z], rotation: [0, Math.sin(half), 0, Math.cos(half)] };
  });
  try {
    await api.glbProps(`${folder}/model.glb`, props);
    c.saved = c.current;
    c.saveError = undefined;
  } catch (e) {
    c.saveError = (e as Error).message;
  }
  changed();
}

export const propsSaveError = (folder: string) => chunks.get(folder)?.saveError;

/** Re-renders on any change of the props. */
export function usePropsVersion(): number {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version);
}

/** A bundle's models by prop ID: their folders under res/field/props/. */
const bundles = new Map<string, Promise<Map<number, string>>>();
export function bundleModels(bundleFolder: string): Promise<Map<number, string>> {
  if (!bundles.has(bundleFolder)) {
    bundles.set(bundleFolder, api.scan(`${bundleFolder}/*/data.json`, '"res_id"').then((lines) => {
      const byId = new Map<number, string>();
      for (const { path, text } of lines) {
        const m = /"res_id":\s*(\d+)/.exec(text);
        if (m && !byId.has(Number(m[1]))) byId.set(Number(m[1]), path.slice(0, path.lastIndexOf("/")));
      }
      return byId;
    }));
  }
  return bundles.get(bundleFolder)!;
}

/** The zone's buildings as the map's entities, at the tile under each prop's origin. */
export function buildingEntities(map: ZoneMap, models: Map<number, string>): Entity[] {
  const out: Entity[] = [];
  for (const chunk of map.chunks) {
    propsOf(chunk.folder).forEach((p, index) => {
      const ux = chunk.column * map.chunkSize + map.chunkSize / 2 + p.x, uz = chunk.row * map.chunkSize + map.chunkSize / 2 + p.z;
      const model = models.get(p.id) ?? null;
      out.push({
        kind: "building", index: out.length, x: Math.floor(ux / TILE), z: Math.floor(uz / TILE), y: p.y, width: 1, depth: 1,
        label: `${model ? model.slice(model.lastIndexOf("/") + 1) : "Prop"} (${p.id})`,
        building: { chunk: chunk.folder, index, id: p.id, model, ux, uy: p.y, uz, angle: p.angle },
      });
    });
  }
  return out;
}
