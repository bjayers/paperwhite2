// The Map Editor (docs/paperwhite2/design/map-editor.md): a zone's map chunks in 3D, in a season, with four tabs:
// - Chunks: the matrix's cells and the chosen chunk's inspector (its polygons, vertices and materials against the
//   game's limits, its textures against each season's set, and its season variants);
// - Faces: faces picked on the map (Shift adds, Ctrl removes, Select connected takes a whole tree or ledge) deleted or
//   drawn with another texture of the area's set, written to the chunk's model.glb at once, with undo;
// - Collision: the chunks' collision tiles of a layer, painted with a type, a height or a copied tile (collision.ts);
// - Tiles: the tile libraries cut from the game's chunks (tools/paperwhite2/map_tiles.py), and the chosen chunk's
//   layout, painted with them and composed into its model.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { api } from "../../api.ts";
import { currentText, documents, useDocuments } from "../../documents.ts";
import { fromPlain, toPlain } from "../../../shared/json.ts";
import { navigate, useToolParams } from "../../navigation.ts";
import type { ToolProps } from "../types.ts";
import { loadWorld, type World } from "../world/world.ts";
import { SEASONS, TILE, heightTables, loadZoneMap, reloadLayers, type ZoneMap } from "../overworld/terrain.ts";
import { CollisionPanel, type CollisionBrush } from "./CollisionPanel.tsx";
import { NewMapDialog } from "./NewMapDialog.tsx";
import { paintTiles, tileRow } from "./collision.ts";
import { ChunkScene, connectedFaces, faceKey, stackedFaces, type ChunkModel, type Face, type LayoutTiles } from "./ChunkScene.ts";
import { seasonSets, seasonVariants, type SeasonSet } from "./seasons.ts";
import { TilePanel, type PaintHeight, type PaintMode } from "./TilePanel.tsx";
import type { Catalogue, Tile } from "./tiles.ts";

type Tab = "chunks" | "faces" | "collision" | "tiles";

/** The busiest vanilla chunks (map04_20's spring chunk has 1,114 triangles): the DS draws 2,048 polygons and 6,144
 * vertices a frame, all chunks, props and actors together, and the game's own chunks reach these, so a chunk past them
 * is busier than anything the game draws. */
const POLYGON_BUDGET = 2133;
const VERTEX_BUDGET = 6677;
const MATERIAL_LIMIT = 255;

/** One step of the history: a chunk's GLB before and after a face edit, as base64; or an edit of a layout, which its
 * document's own history holds. */
type Step = { kind: "faces"; path: string; before: string; after: string; what: string } | { kind: "docs"; paths: string[]; what: string };

const layoutPath = (model: string) => `res/paperwhite2/map_layouts/${model}.json`;

async function glbBase64(path: string): Promise<string> {
  const response = await fetch(`/${path}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: ${response.statusText}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

export function MapEditor({ constants }: ToolProps) {
  const params = useToolParams("maps");
  const [world, setWorld] = useState<World | null>(null);
  const [filter, setFilter] = useState("");
  const [zone, setZone] = useState<string | null>(null);
  const [season, setSeason] = useState(0);
  const [map, setMap] = useState<ZoneMap | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chunks");
  const [chunk, setChunk] = useState<number | null>(null);
  const [faces, setFaces] = useState<Face[]>([]);
  const [grid, setGrid] = useState(true);
  const [loaded, setLoaded] = useState(0);
  const [sets, setSets] = useState<SeasonSet[]>([]);
  const [variants, setVariants] = useState<string[] | null>(null);
  const [chunkData, setChunkData] = useState<{ texture_set: string | null; written?: boolean; texture_preview?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [history, setHistory] = useState<{ done: Step[]; undone: Step[] }>({ done: [], undone: [] });
  const [library, setLibrary] = useState("");
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [tile, setTile] = useState<Tile | null>(null);
  const [paint, setPaint] = useState<PaintMode>("off");
  const [paintHeight, setPaintHeight] = useState<PaintHeight>("cell");
  const [layoutShown, setLayoutShown] = useState(true);
  const [layoutExists, setLayoutExists] = useState<Record<string, boolean>>({});
  const { docs } = useDocuments();
  const [layer, setLayer] = useState(0);
  const [newMap, setNewMap] = useState(false);
  /** Bumped to read the zone's map and sets again (after textures are imported). */
  const [mapVersion, setMapVersion] = useState(0);
  /** Faces copied, from any zone: their GLB, the faces, where they start (their north-west tile corner and lowest
   * point, in their chunk's own coordinates) and what they are, for the message. */
  const [clipboard, setClipboard] = useState<{ source: string; faces: { primitive: number; triangles: number[] }[];
    anchor: [number, number, number]; label: string } | null>(null);
  const [pasting, setPasting] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [brush, setBrush] = useState<CollisionBrush>({ kind: "type", tileClass: 0, flags: 0, heightTiles: 2, row: null, variants: true });
  const [variantFolders, setVariantFolders] = useState<Map<string, string[]>>(new Map());
  const [retexture, setRetexture] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ChunkScene | null>(null);

  useEffect(() => { if (constants.size) loadWorld(constants).then(setWorld, () => setWorld(null)); }, [constants]);
  useEffect(() => { const z = params.get("zone"); if (z) setZone(z); }, [params]);
  useEffect(() => {
    if (!zone || !constants.size) return;
    let live = true;
    setMapError(null);
    loadZoneMap(zone, season, constants).then((m) => { if (live) setMap(m); }, (e: Error) => { if (live) setMapError(e.message); });
    seasonSets(zone, constants).then((s) => { if (live) setSets(s); }, () => setSets([]));
    return () => { live = false; };
  }, [zone, season, constants, mapVersion]);
  useEffect(() => { setChunk(null); setFaces([]); }, [zone]);

  // The scene lives as long as the page
  useEffect(() => {
    if (!host.current) return;
    const s = new ChunkScene(host.current);
    scene.current = s;
    s.onLoaded = () => setLoaded((n) => n + 1);
    return () => { s.dispose(); scene.current = null; };
  }, []);
  useEffect(() => { if (map) scene.current?.setMap(map); }, [map]);
  useEffect(() => { scene.current?.drawCells(chunk, grid); }, [chunk, grid, map]);
  useEffect(() => { scene.current?.showFaces(faces); }, [faces, loaded]);

  const pickFace = useRef<(face: Face | null, chunk: number | null, ev: PointerEvent, point: THREE.Vector3 | null,
                           tile: { x: number; z: number } | null) => void>(() => {});
  pickFace.current = (face, picked, ev, point, tilePicked) => {
    if (tab === "collision") {
      if (picked !== null) setChunk(picked);
      if (ev.altKey && tilePicked && map) eyedropper(tilePicked);
      return;
    }
    if (tab === "tiles" && paint !== "off" && layoutDoc && point && picked === chunk) {
      paintAt(point);
      return;
    }
    if (tab !== "faces") {
      setChunk(picked);
      return;
    }
    if (pasting && clipboard && picked !== null && point) {
      pasteAt(picked, point);
      return;
    }
    if (!face) {
      if (!ev.shiftKey && !ev.ctrlKey) setFaces([]);
      return;
    }
    setChunk(face.chunk);
    const key = faceKey(face);
    if (ev.ctrlKey) setFaces((f) => f.filter((x) => faceKey(x) !== key));
    else if (ev.shiftKey) setFaces((f) => (f.some((x) => faceKey(x) === key) ? f : [...f, face]));
    else setFaces([face]);
  };
  useEffect(() => {
    if (scene.current) scene.current.onPick = (r, ev) => pickFace.current(r.face, r.chunk, ev, r.point, r.tile);
  }, []);

  const current = map && chunk !== null ? map.chunks[chunk] : null;
  const model: ChunkModel | undefined = chunk !== null ? scene.current?.models.get(chunk) : undefined;
  useEffect(() => {
    if (!current || !map) { setVariants(null); setChunkData(null); return; }
    let live = true;
    const name = `MAP_MODEL_${current.folder.slice(current.folder.lastIndexOf("/") + 1).toUpperCase()}`;
    seasonVariants(map.matrix, name, constants).then((v) => { if (live) setVariants(v); }, () => setVariants(null));
    api.file(`${current.folder}/data.json`).then((f) => { if (live) setChunkData(JSON.parse(f.text)); }, () => setChunkData(null));
    return () => { live = false; };
  }, [current, map, constants, loaded]);

  const zones = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (world?.zones ?? []).filter((z) => !f || z.name.includes(f) || String(z.number) === f);
  }, [world, filter]);

  /** The faces selected, by chunk and primitive, as the server takes them. */
  const faceSets = (list: Face[]) => {
    const by = new Map<string, { primitive: number; triangles: number[] }>();
    for (const f of list) {
      const k = String(f.primitive);
      if (!by.has(k)) by.set(k, { primitive: f.primitive, triangles: [] });
      by.get(k)!.triangles.push(f.triangle);
    }
    return [...by.values()];
  };

  /** Writes an edit of the chosen chunk's faces, recording the GLB before and after for undo. */
  const editFaces = async (what: string, edits: Parameters<typeof api.glbFaces>[1]) => {
    if (!current || !faces.length || busy) return;
    if (new Set(faces.map((f) => f.chunk)).size > 1) {
      setMessage({ text: "Select faces of one chunk at a time.", error: true });
      return;
    }
    const path = `${current.folder}/model.glb`;
    setBusy(true);
    try {
      const before = await glbBase64(path);
      const set = sets[Math.min(season, sets.length - 1)];
      const result = await api.glbFaces(path, edits, set?.constant ?? undefined);
      const after = await glbBase64(path);
      setHistory((h) => ({ done: [...h.done, { kind: "faces", path, before, after, what }], undone: [] }));
      setFaces([]);
      reloadChunk(current.folder);
      setMessage({ text: `${what}.${result.written ? " The chunk's data.json now has the whole model written (\"written\"), since its draw calls changed." : ""}` });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  const reloadChunk = (folder: string) => {
    const s = scene.current;
    if (!s) return;
    s.versions.set(folder, (s.versions.get(folder) ?? 0) + 1);
    s.reload();
  };

  const step = useCallback(async (back: boolean) => {
    const list = back ? history.done : history.undone;
    const last = list[list.length - 1];
    if (!last || busy) return;
    const moved = () => setHistory((h) => back ? { done: h.done.slice(0, -1), undone: [...h.undone, last] }
      : { done: [...h.done, last], undone: h.undone.slice(0, -1) });
    if (last.kind === "docs") {
      for (const path of last.paths) { if (back) documents.undo(path); else documents.redo(path); }
      moved();
      await reloadTerrain(last.paths);
      setMessage({ text: `${back ? "Undid" : "Redid"}: ${last.what}.` });
      return;
    }
    setBusy(true);
    try {
      await api.glbRaw(last.path, back ? last.before : last.after);
      moved();
      setFaces([]);
      reloadChunk(last.path.replace(/\/model\.glb$/, ""));
      setMessage({ text: `${back ? "Undid" : "Redid"}: ${last.what}.` });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }, [history, busy]);

  // The chosen chunk's layout, held as a document so it saves, undoes and reloads as files do
  const modelName = current ? current.folder.slice(current.folder.lastIndexOf("/") + 1) : null;
  const layoutFile = modelName ? layoutPath(modelName) : null;
  useEffect(() => {
    if (!layoutFile || layoutExists[layoutFile] !== undefined) return;
    api.list(layoutFile).then((found) => {
      const exists = found.includes(layoutFile);
      setLayoutExists((m) => ({ ...m, [layoutFile]: exists }));
      if (exists) documents.hold(layoutFile).catch(() => {});
    }, () => {});
  }, [layoutFile, layoutExists]);
  const layoutDoc = layoutFile && layoutExists[layoutFile] ? docs.get(layoutFile) : undefined;
  const layoutData = useMemo(() => (layoutDoc?.data ? toPlain(layoutDoc.data) as LayoutTiles & { size?: number } : null), [layoutDoc?.data]);
  useEffect(() => {
    const show = tab === "tiles" && layoutShown && layoutData && chunk !== null;
    scene.current?.showLayout(show ? chunk : null, show ? layoutData : null);
  }, [tab, layoutShown, layoutData, chunk, loaded]);

  /** Paints the chosen tile, or erases objects, at a point on the chosen chunk's layout; a tile brings its collision. */
  const paintAt = async (point: THREE.Vector3) => {
    if (!map || !current || !layoutFile || !layoutData) return;
    const x = Math.floor((point.x - current.column * map.chunkSize) / TILE), z = Math.floor((point.z - current.row * map.chunkSize) / TILE);
    if (x < 0 || z < 0 || x >= map.chunkTiles || z >= map.chunkTiles) return;
    const cell = layoutData.ground.findIndex((g) => g[0] === x && g[1] === z);
    const groundY = cell >= 0 ? layoutData.ground[cell][3] : Math.round(point.y);
    const record = (what: string, paths: string[]) => setHistory((h) => ({ done: [...h.done, { kind: "docs", paths, what }], undone: [] }));
    if (paint === "erase") {
      const keys = new Map((catalogue?.tiles ?? []).map((t) => [t.key, t]));
      const kept = layoutData.objects.filter(([key, ox, oz]) => {
        const size = keys.get(key)?.size ?? [1, 1];
        return !(x >= ox && x < ox + size[0] && z >= oz && z < oz + size[1]);
      });
      if (kept.length === layoutData.objects.length) return;
      documents.edit(layoutFile, ["objects"], fromPlain(kept));
      record(`Removed ${layoutData.objects.length - kept.length} object(s) at ${x}, ${z}`, [layoutFile]);
      return;
    }
    if (!tile) return;
    const y = paintHeight === "tile" ? tile.at[0]?.y ?? groundY : groundY;
    if (tile.kind === "ground") documents.edit(layoutFile, ["ground", cell >= 0 ? cell : layoutData.ground.length], fromPlain([x, z, tile.key, y]));
    else documents.edit(layoutFile, ["objects", layoutData.objects.length], fromPlain([tile.key, x, z, y]));
    const terrain = await paintCollision(tile, x, z, y);
    record(`${tile.kind === "ground" ? "Painted" : "Placed an object at"} ${x}, ${z}`, terrain.path ? [layoutFile, terrain.path] : [layoutFile]);
    setMessage(terrain.note ? { text: terrain.note } : null);
  };

  /** A painted tile's collision: its source's terrain rows under it, written into the chunk's chosen layer where it
   * goes, each plane moved with the tile (its offset taken again from the game's table, which must have it). Split
   * tiles keep the chunk's rows, to paint in the Overworld Editor. */
  const paintCollision = async (t: Tile, x: number, z: number, y: number): Promise<{ path: string | null; note: string | null }> => {
    const path = current?.layers[Math.min(layer, (current?.layers.length ?? 1) - 1)]?.path;
    const source = t.at[0];
    if (!path || !source || !map) return { path: null, note: "The chunk has no collision to paint." };
    const tb = await heightTables();
    const doc = await documents.hold(path);
    const lines = currentText(doc).split("\n");
    const head = lines[0].split(",");
    const col = (name: string) => head.indexOf(name);
    const skipped: string[] = [];
    let changed = false;
    t.collision.forEach((row, dz) => row.forEach((rowTerrain, dx) => {
      const cx = x + dx, cz = z + dz;
      if (!rowTerrain || cx >= map.chunkTiles || cz >= map.chunkTiles) return;
      const i = 1 + cz * map.chunkTiles + cx;
      const parts = lines[i]?.split(",");
      if (!parts) return;
      if (rowTerrain.shape !== 0) { skipped.push(`${cx}, ${cz} (a split tile)`); return; }
      // The plane at the source, moved by the tile's step across and up: offset' = offset - n.x dx - n.z dz - n.y dy
      const n = tb.slopes[rowTerrain.slope] ?? [0, 1, 0];
      const want = tb.offsets[rowTerrain.offset] - n[0] * (x - source.x) * TILE - n[2] * (z - source.z) * TILE - n[1] * (y - source.y);
      let best = 0;
      tb.offsets.forEach((o, k) => { if (Math.abs(o - want) < Math.abs(tb.offsets[best] - want)) best = k; });
      if (Math.abs(tb.offsets[best] - want) > 0.05) { skipped.push(`${cx}, ${cz} (no height there in the game's table)`); return; }
      parts[col("shape")] = "0";
      parts[col("slope")] = String(rowTerrain.slope);
      parts[col("offset")] = String(best);
      parts[col("tile_type")] = String(rowTerrain.tile_type >>> 0);
      parts[col("diagonal")] = String(rowTerrain.diagonal);
      lines[i] = parts.join(",");
      changed = true;
    }));
    if (changed) documents.editText(path, lines.join("\n"));
    return { path: changed ? path : null, note: skipped.length ? `Collision left as it was at ${skipped.join("; ")}.` : null };
  };

  const startLayout = async () => {
    if (!modelName || !library) return;
    setBusy(true);
    try {
      const { path } = await api.startLayout(library, modelName);
      await documents.hold(path);
      setLayoutExists((m) => ({ ...m, [path]: true }));
      setLayoutShown(true);
      setMessage({ text: `Started ${path} from the chunk as it is.` });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  const composeLayout = async () => {
    if (!modelName || !layoutFile || !current) return;
    setBusy(true);
    try {
      // The layout and the collision painted with it
      for (const path of [layoutFile, ...current.layers.map((l) => l.path)]) {
        if (documents.get(path)?.dirty && !(await documents.save(path))) throw new Error(`${path}: ${documents.get(path)?.saveError ?? "didn't save"}`);
      }
      const result = await api.composeLayout(modelName);
      reloadChunk(current.folder);
      setLayoutShown(false);
      setMessage({ text: `${result.output}. The chunk's model.glb is written from its layout; the map shows it now.` });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------- Collision

  // Each chunk's season variants, whose collision a stroke paints too where it was the same
  useEffect(() => {
    if (!map) return;
    let live = true;
    Promise.all(map.chunks.map(async (c) => {
      const name = `MAP_MODEL_${c.folder.slice(c.folder.lastIndexOf("/") + 1).toUpperCase()}`;
      const v = await seasonVariants(map.matrix, name, constants).catch(() => null);
      return [c.folder, (v ?? []).map((m) => `res/field/maps/models/${m.replace(/^MAP_MODEL_/, "").toLowerCase()}`)] as const;
    })).then((entries) => { if (live) setVariantFolders(new Map(entries)); });
    return () => { live = false; };
  }, [map, constants]);
  const layers = map ? Math.max(1, ...map.chunks.map((c) => c.layers.length)) : 1;
  useEffect(() => { if (layer >= layers) setLayer(0); }, [layers, layer]);

  /** Reads the chunks' terrain again from the documents, after painting or undo. */
  const reloadTerrain = async (paths: string[]) => {
    if (!map || !paths.some((p) => p.endsWith(".csv"))) return;
    for (const c of map.chunks) {
      if (c.layers.some((l) => paths.includes(l.path))) await reloadLayers(c, (path) => documents.get(path)?.text ?? null, map.chunkSize);
    }
    setMap({ ...map });
  };

  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    s.painting = tab === "collision";
    s.showTerrain(tab === "collision" ? layer : null, tab === "collision" && brush.kind === "type" ? brush.tileClass : null);
  }, [tab, layer, map, brush.kind, brush.tileClass, loaded]);

  const paintStroke = useRef<(tiles: { x: number; z: number }[]) => void>(() => {});
  paintStroke.current = async (tiles) => {
    if (!map) return;
    const b = brush.kind === "type" ? { kind: "type" as const, tileType: ((brush.flags << 16) | brush.tileClass) >>> 0 }
      : brush.kind === "height" ? { kind: "height" as const, tiles: brush.heightTiles }
      : brush.row ? { kind: "copy" as const, row: brush.row } : null;
    if (!b) { setMessage({ text: "Alt+click a tile to copy it first.", error: true }); return; }
    const result = await paintTiles(map, tiles, layer, b, (folder) => (brush.variants ? variantFolders.get(folder) ?? [] : []));
    if (result.paths.length) setHistory((h) => ({ done: [...h.done, { kind: "docs", paths: result.paths, what: `Painted ${tiles.length} tile(s)` }], undone: [] }));
    await reloadTerrain(result.paths);
    const others = result.paths.filter((p) => !map.chunks.some((c) => c.layers.some((l) => l.path === p))).length;
    setMessage(result.note || others ? { text: [result.note, others ? `Also painted in ${others} season variant file(s) where the tile was the same.` : null].filter(Boolean).join(" ") } : null);
  };
  useEffect(() => { if (scene.current) scene.current.onPaint = (tiles) => paintStroke.current(tiles); }, []);

  /** Alt+click: the brush takes the tile's type, height and whole row. */
  const eyedropper = async (t: { x: number; z: number }) => {
    if (!map) return;
    const row = await tileRow(map, t.x, t.z, layer);
    if (!row) return;
    const chunkAt = map.chunks.find((c) => Math.floor(t.x / map.chunkTiles) === c.column && Math.floor(t.z / map.chunkTiles) === c.row);
    const l = chunkAt?.layers[Math.min(layer, chunkAt.layers.length - 1)];
    const index = (t.z % map.chunkTiles) * map.chunkTiles + (t.x % map.chunkTiles);
    const height = l ? Math.round((l.heights[index] / TILE) * 2) / 2 : brush.heightTiles;
    setBrush((b) => ({ ...b, tileClass: row.tile_type & 0xffff, flags: (row.tile_type >>> 16) & 0xffff, heightTiles: height, row }));
    setMessage({ text: `Picked the tile at ${t.x}, ${t.z}: type 0x${(row.tile_type >>> 0).toString(16)}, height ${height} tiles.` });
  };

  /** The files the Map Editor edits as documents (collision and layouts), unsaved. */
  const unsaved = [...docs.values()].filter((d) => d.dirty
    && (/^res\/field\/maps\/models\/[^/]+\/terrain_\d+(_splits)?\.csv$/.test(d.path) || d.path.startsWith("res/paperwhite2/map_layouts/")));
  const save = async () => {
    for (const d of unsaved) await documents.save(d.path);
  };
  const revert = async () => {
    const paths = unsaved.map((d) => d.path);
    for (const path of paths) await documents.reload(path);
    setHistory((h) => ({ done: h.done.filter((st) => st.kind !== "docs"), undone: h.undone.filter((st) => st.kind !== "docs") }));
    await reloadTerrain(paths);
  };

  // ---------------------------------------------------------------- Copy and paste

  /** Copies the selected faces: their chunk's GLB and where they start. */
  const copyFaces = () => {
    if (!current || !model || !faces.length || !map) return;
    const half = map.chunkSize / 2;
    const p = new THREE.Vector3();
    let x0 = Infinity, y0 = Infinity, z0 = Infinity;
    for (const f of faces) {
      const geometry = model.primitives[f.primitive].mesh.geometry;
      for (let k = 0; k < 3; k++) {
        const v = geometry.index ? geometry.index.getX(f.triangle * 3 + k) : f.triangle * 3 + k;
        p.fromBufferAttribute(geometry.attributes.position as THREE.BufferAttribute, v);
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); z0 = Math.min(z0, p.z);
      }
    }
    const snap = (v: number) => Math.floor((v + half) / TILE) * TILE - half;
    setClipboard({ source: `${current.folder}/model.glb`, faces: faceSets(faces), anchor: [snap(x0), Math.round(y0), snap(z0)],
                   label: `${faces.length} face(s) of ${current.folder.slice(current.folder.lastIndexOf("/") + 1)}` });
    setMessage({ text: `Copied ${faces.length} face(s). Turn on Paste where I click, and click the tile their north-west corner goes on, in any zone.` });
  };

  /** Pastes the copied faces with their north-west corner on the tile clicked and their foot at its height. */
  const pasteAt = async (index: number, point: THREE.Vector3) => {
    if (!clipboard || !map || busy) return;
    const target = map.chunks[index];
    const set = sets[Math.min(season, Math.max(0, sets.length - 1))];
    if (!set?.set) { setMessage({ text: "The zone's area has no texture set to bind the faces to.", error: true }); return; }
    const half = map.chunkSize / 2;
    const lx = point.x - (target.column * map.chunkSize + half), lz = point.z - (target.row * map.chunkSize + half);
    const snap = (v: number) => Math.floor((v + half) / TILE) * TILE - half;
    const offset: [number, number, number] = [snap(lx) - clipboard.anchor[0], Math.round(point.y) - clipboard.anchor[1], snap(lz) - clipboard.anchor[2]];
    const path = `${target.folder}/model.glb`;
    setBusy(true);
    try {
      const before = await glbBase64(path);
      const result = await api.glbPaste(path, clipboard.source, clipboard.faces, offset, set.set);
      const after = await glbBase64(path);
      const what = `Pasted ${clipboard.label}`;
      setHistory((h) => ({ done: [...h.done, { kind: "faces", path, before, after, what }], undone: [] }));
      setChunk(index);
      reloadChunk(target.folder);
      // The images every season's set must have, by name
      const lacking = result.pngs.filter((p) => sets.some((s) => !s.textures.has(p.slice(p.indexOf("/") + 1))));
      setMissing(lacking);
      setMessage({ text: `${what} onto ${target.folder.slice(target.folder.lastIndexOf("/") + 1)}.${lacking.length
        ? ` ${lacking.length} texture(s) aren't in every season's set of this area: ${lacking.map((p) => p.slice(p.indexOf("/") + 1, -4)).join(", ")}; import them in the Faces tab.` : ""}` });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  /** Adds the textures the pasted faces need to every season's set of the zone's area. */
  const importMissing = async () => {
    const targets = sets.map((s) => s.set).filter((s): s is string => !!s);
    setBusy(true);
    try {
      const result = await api.importTextures(targets, missing);
      setMissing([]);
      setMapVersion((v) => v + 1);
      setMessage({ text: `Imported into ${targets.length} set(s): ${result.added.length} file(s). The texture packer copies them from their sets as encoded there (imports.json).` });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  const removeFaces = () => editFaces(`Deleted ${faces.length} face(s)`, { remove: faceSets(faces) });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]");
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); step(!e.shiftKey); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); step(false); }
      else if (tab === "faces" && (e.key === "Delete" || e.key === "Backspace") && faces.length) { e.preventDefault(); removeFaces(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const set = sets[Math.min(season, Math.max(0, sets.length - 1))];
  const everySeason = (png: string) => sets.length > 0 && sets.every((s) => s.textures.has(png));
  const textureChoices = useMemo(() => [...(set?.textures ?? [])].sort(), [set]);
  const imageUri = (png: string) => `../../textures/${set?.set}/${png}`;

  return (
    <div className="ow-editor me-editor">
      {newMap && (
        <NewMapDialog template={modelName ? `MAP_MODEL_${modelName.toUpperCase()}` : null} constants={constants} onClose={() => setNewMap(false)}
                      onCreated={(file, models) => {
                        setNewMap(false);
                        setMessage({ text: `Made ${file}: ${models.length} chunk(s) copied from the template. Give it warps in the Overworld Editor, and its look in the Faces, Collision and Tiles tabs.` });
                        // The world's zone list follows the constants, which the server reads again
                        setTimeout(() => setZone(file), 1500);
                      }} />
      )}
      <header className="ow-header">
        <h2>Map Editor</h2>
        {zone && <strong>{zone}</strong>}
        <span className="spacer" />
        <button onClick={() => setNewMap(true)} title="Make one of the game's unused zones a new map, from the chosen chunk">New map…</button>
        {zone && <button onClick={() => navigate("overworld", { zone })}>Open in the Overworld Editor</button>}
        {unsaved.length > 0 && <span className="muted">{unsaved.length} unsaved</span>}
        <button onClick={revert} disabled={!unsaved.length} title="Collision and layouts as they were last saved">Revert</button>
        <button className="primary" onClick={save} disabled={!unsaved.length} title="Saves the painted collision and layouts (face edits are written as they're made)">Save</button>
      </header>
      {mapError && <div className="ow-error ow-bar">{mapError}</div>}
      {message && <div className={`ow-bar ${message.error ? "ow-error" : "muted"}`}>{message.text}</div>}
      <div className="ow-body">
        <div className="ow-zones">
          <input className="filter" placeholder={`Filter ${world?.zones.length ?? 0} zones…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="ow-zone-list">
            {zones.map((z) => (
              <button key={z.name} className={`ow-zone${z.name === zone ? " selected" : ""}`} onClick={() => setZone(z.name)}>
                <span className="ow-number">{z.number}</span> {z.name}
              </button>
            ))}
          </div>
        </div>
        <div className="ow-center">
          <div className="ow-toolbar">
            <div className="view-switch">
              {(["chunks", "faces", "collision", "tiles"] as Tab[]).map((t) => (
                <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
              ))}
            </div>
            {map?.seasonal && (
              <label className="ow-inline">Season
                <select value={season} onChange={(e) => setSeason(Number(e.target.value))}>
                  {SEASONS.map((s, i) => <option key={s} value={i}>{s}</option>)}
                </select>
              </label>
            )}
            <label className="ow-check"><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Tile grid</label>
            <span className="spacer" />
            <button onClick={() => step(true)} disabled={!history.done.length || busy} title="Ctrl+Z">Undo</button>
            <button onClick={() => step(false)} disabled={!history.undone.length || busy} title="Ctrl+Y">Redo</button>
          </div>
          <div className={`ow-map-wrap${tab === "faces" ? " me-picking" : ""}${(tab === "tiles" && paint !== "off" && layoutDoc) || tab === "collision" ? " painting" : ""}`}>
            <div className="ow-map" ref={host} />
            {!zone && <div className="ow-empty me-empty muted">Choose a zone.</div>}
          </div>
        </div>
        <div className="ow-side">
          <div className="ow-panel">
            {tab === "chunks" && (
              <>
                <section className="me-section">
                  <h4>Matrix</h4>
                  {map ? <MatrixGrid map={map} selected={chunk} onSelect={(i) => { setChunk(i); scene.current?.frameChunk(i); }} />
                    : <p className="muted ow-note">Choose a zone.</p>}
                  <p className="muted ow-note">The zone's cells of its matrix ({map?.matrix.replace(/^MAP_MATRIX_/, "").toLowerCase()}). Click one, or click the map.</p>
                </section>
                {current && (
                  <ChunkInspector folder={current.folder} model={model} data={chunkData} variants={variants} season={season} sets={sets} />
                )}
              </>
            )}
            {tab === "collision" && map && (
              <CollisionPanel brush={brush} setBrush={setBrush} layer={layer} setLayer={setLayer} layers={layers}
                              hasVariants={[...variantFolders.values()].some((v) => v.length > 0)} />
            )}
            {tab === "faces" && (
              <>
                <section className="me-section">
                  <h4>Selection</h4>
                  <p className="ow-note"><strong>{faces.length}</strong> face(s){current ? ` of ${current.folder.slice(current.folder.lastIndexOf("/") + 1)}` : ""}</p>
                  <div className="me-actions">
                    <button disabled={!faces.length || !model} title="Add every face that shares a corner with the selection: a whole tree, a ledge"
                            onClick={() => model && setFaces((f) => uniqueFaces(f.flatMap((x) => connectedFaces(model, x))))}>Select connected</button>
                    <button disabled={!faces.length || !model} title="Add every face within the selection's footprint from above: a tree's trunk and its layers of leaves, a sign, a fence"
                            onClick={() => model && setFaces((f) => uniqueFaces([...f, ...stackedFaces(model, uniqueFaces(f.flatMap((x) => connectedFaces(model, x))))]))}>Select the stack</button>
                    <button disabled={!faces.length || !model} title="Every face drawn with the selection's materials, in this chunk"
                            onClick={() => model && setFaces((f) => {
                              const prims = new Set(f.map((x) => x.primitive));
                              return uniqueFaces([...prims].flatMap((p) => Array.from({ length: model.primitives[p].triangles }, (_, t) => ({ chunk: f[0].chunk, primitive: p, triangle: t }))));
                            })}>Select same material</button>
                    <button disabled={!faces.length} onClick={() => setFaces([])}>Clear</button>
                  </div>
                  <p className="muted ow-note">Click a face; Shift+click adds one, Ctrl+click takes one away. Edits are written to the chunk's
                    model.glb as you make them; Ctrl+Z undoes them.</p>
                </section>
                <section className="me-section">
                  <h4>Delete</h4>
                  <div className="me-actions"><button className="danger" disabled={!faces.length || busy} onClick={removeFaces} title="Delete">Delete the faces</button></div>
                  <p className="muted ow-note">Clearing a tree: click its leaves, Select the stack, then delete, and paint its tiles walkable in the
                    Collision tab. Route 20's forests are layers over many tiles; clear part of one by Shift+clicking its faces.</p>
                </section>
                <section className="me-section">
                  <h4>Copy and paste</h4>
                  <div className="me-actions">
                    <button disabled={!faces.length} onClick={copyFaces} title="Copies the selected faces, to paste in any chunk of any zone">Copy the faces</button>
                    <label className="ow-check"><input type="checkbox" checked={pasting} disabled={!clipboard} onChange={(e) => setPasting(e.target.checked)} />
                      Paste where I click</label>
                  </div>
                  {clipboard && <p className="ow-note">Copied: {clipboard.label}.</p>}
                  {missing.length > 0 && (
                    <div className="me-actions">
                      <button className="primary" disabled={busy} onClick={importMissing}
                              title="Adds them to every season's texture set of this zone's area (imports.json), as their own set encodes them">
                        Import {missing.length} texture(s) into the area's sets</button>
                    </div>
                  )}
                  <p className="muted ow-note">Click the tile the faces' north-west corner goes on; their foot goes at the height clicked. A paste adds
                    draw calls, so the chunk is packed as a whole model. Textures the area's sets lack can be imported from the faces' own set.</p>
                </section>
                <section className="me-section">
                  <h4>Retexture</h4>
                  <div className="me-row">
                    <label>Texture</label>
                    <select value={retexture} onChange={(e) => setRetexture(e.target.value)}>
                      <option value="">Choose…</option>
                      {textureChoices.map((t) => <option key={t} value={t}>{t.replace(/\.png$/, "")}{everySeason(t) ? "" : " (not every season)"}</option>)}
                    </select>
                  </div>
                  {retexture && set?.set && <img className="me-texture" src={`/res/field/maps/textures/${set.set}/${retexture}`} alt="" />}
                  <div className="me-actions">
                    <button disabled={!faces.length || !retexture || busy}
                            onClick={() => editFaces(`Drew ${faces.length} face(s) with ${retexture.replace(/\.png$/, "")}`,
                              { retexture: [{ faces: faceSets(faces), image: imageUri(retexture) }] })}>Apply to the faces</button>
                  </div>
                  <p className="muted ow-note">From the area's set in {set?.season ?? "its season"}. A texture marked "not every season" is missing
                    from another season's set, where the faces would draw with the wrong texture. A new texture gives the chunk a
                    material and a draw call, so it's packed as a whole model.</p>
                </section>
              </>
            )}
            {tab === "tiles" && <TilePanel map={map} onShow={(m) => {
              const i = map?.chunks.findIndex((c) => c.folder.endsWith(`/${m}`)) ?? -1;
              if (i >= 0) { setChunk(i); scene.current?.frameChunk(i); }
              return i >= 0;
            }} library={library} setLibrary={setLibrary} catalogue={catalogue} setCatalogue={setCatalogue} chosen={tile} setChosen={setTile}
              layout={{ model: modelName, path: layoutDoc ? layoutFile : null, dirty: !!layoutDoc?.dirty, shown: layoutShown }}
              onStart={startLayout} onCompose={composeLayout} onShowLayout={setLayoutShown}
              paint={paint} setPaint={setPaint} height={paintHeight} setHeight={setPaintHeight} busy={busy} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function uniqueFaces(list: Face[]): Face[] {
  const seen = new Set<string>();
  return list.filter((f) => { const k = faceKey(f); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** The matrix's cells, the zone's clickable, by column and row. */
function MatrixGrid({ map, selected, onSelect }: { map: ZoneMap; selected: number | null; onSelect(index: number): void }) {
  const columns = Math.max(...map.chunks.map((c) => c.column)) + 1, rows = Math.max(...map.chunks.map((c) => c.row)) + 1;
  const firstColumn = Math.min(...map.chunks.map((c) => c.column)), firstRow = Math.min(...map.chunks.map((c) => c.row));
  if (!map.chunks.length) return <p className="muted ow-note">The zone has no chunks.</p>;
  return (
    <div className="me-matrix" style={{ gridTemplateColumns: `repeat(${columns - firstColumn}, minmax(0, 1fr))` }}>
      {Array.from({ length: rows - firstRow }, (_, r) => Array.from({ length: columns - firstColumn }, (_, c) => {
        const index = map.chunks.findIndex((ch) => ch.column === c + firstColumn && ch.row === r + firstRow);
        const ch = map.chunks[index];
        return ch ? (
          <button key={`${r}:${c}`} className={`me-cell${index === selected ? " selected" : ""}`} onClick={() => onSelect(index)}
                  title={`${ch.folder.slice(ch.folder.lastIndexOf("/") + 1)}: column ${ch.column}, row ${ch.row}`}>
            {ch.folder.slice(ch.folder.lastIndexOf("/") + 1).replace(/^overworld_2?_?/, "")}
          </button>
        ) : <span key={`${r}:${c}`} className="me-cell empty" />;
      }))}
    </div>
  );
}

/** A count against a limit: green under 80%, yellow from 80%, red past it. */
function Budget({ used, limit, unit, title }: { used: number; limit: number; unit: string; title: string }) {
  const share = used / limit;
  const level = share > 1 ? "over" : share >= 0.8 ? "near" : "ok";
  return (
    <span className={`ow-load ${level}`} title={title}>
      <span className="ow-load-bar"><span className="ow-load-fill" style={{ width: `${Math.min(100, share * 100)}%` }} /></span>
      <span className="ow-load-text">{used} / {limit} {unit} · {Math.round(share * 100)}%</span>
    </span>
  );
}

function ChunkInspector({ folder, model, data, variants, season, sets }: {
  folder: string; model: ChunkModel | undefined; data: { texture_set: string | null; written?: boolean; texture_preview?: string } | null;
  variants: string[] | null; season: number; sets: SeasonSet[];
}) {
  const name = folder.slice(folder.lastIndexOf("/") + 1);
  const textures = useMemo(() => {
    const by = new Map<string, number>();
    for (const p of model?.primitives ?? []) if (p.image) by.set(p.image, (by.get(p.image) ?? 0) + p.triangles);
    return [...by].sort((a, b) => b[1] - a[1]);
  }, [model]);
  const materials = new Set(model?.primitives.map((p) => p.material)).size;
  return (
    <>
      <section className="me-section">
        <h4>Chunk</h4>
        <div className="me-row"><label>Model</label><span className="me-mono">{name}</span></div>
        <div className="me-row"><label>Texture set</label><span>{data?.texture_set ? data.texture_set.replace(/^MAP_TEXTURE_SET_/, "").toLowerCase()
          : <span className="muted">none confirmed{data?.texture_preview ? ` (shown with ${data.texture_preview.replace(/^MAP_TEXTURE_SET_/, "").toLowerCase()})` : ""}</span>}</span></div>
        <div className="me-row"><label>Packed</label><span>{data?.written ? "as a whole model (written)" : "as edits of the original model"}</span></div>
      </section>
      <section className="me-section">
        <h4>Against the busiest vanilla chunk</h4>
        {model ? (
          <>
            <div className="me-row"><label>Polygons</label><Budget used={model.triangles} limit={POLYGON_BUDGET} unit="triangles"
              title="Against the busiest vanilla chunk's 2,133 polygons (the median is 417). The DS draws 2,048 polygons a frame, all chunks, props and actors together; quads count once, so the game's count is lower than the triangles here." /></div>
            <div className="me-row"><label>Vertices</label><Budget used={model.vertices} limit={VERTEX_BUDGET} unit="vertices"
              title="Against the busiest vanilla chunk's 6,677 vertices. The DS draws 6,144 vertices a frame; the game's lists share vertices differently, so this is a guide." /></div>
            <div className="me-row"><label>Materials</label><Budget used={materials} limit={MATERIAL_LIMIT} unit="materials" title="A model holds at most 255 materials and draw calls." /></div>
            <div className="me-row"><label>Draw calls</label><span>{model.primitives.length}</span></div>
          </>
        ) : <p className="muted ow-note">Loading the model…</p>}
      </section>
      {variants && (
        <section className="me-section">
          <h4>Season variants</h4>
          <p className="ow-note">A season replacement swaps this cell's chunk:</p>
          <ul className="me-list">
            {variants.map((v, i) => <li key={i} className={i === season ? "me-current" : ""}>{SEASONS[i]}: <span className="me-mono">{v.replace(/^MAP_MODEL_/, "").toLowerCase()}</span></li>)}
          </ul>
          <p className="muted ow-note">Each variant is a model of its own: edits to one don't reach the others. Change the season to edit another.</p>
        </section>
      )}
      <section className="me-section">
        <h4>Textures</h4>
        <table className="me-table">
          <thead><tr><th>Texture</th><th>Triangles</th>{sets.length > 1 && sets.map((s) => <th key={s.season} title={s.set ?? ""}>{s.season.slice(0, 3)}</th>)}</tr></thead>
          <tbody>
            {textures.map(([png, count]) => (
              <tr key={png}>
                <td className="me-mono">{png.replace(/\.png$/, "")}</td>
                <td>{count}</td>
                {sets.length > 1 && sets.map((s) => <td key={s.season} className={s.textures.has(png) ? "" : "ow-error"}>{s.textures.has(png) ? "✓" : "missing"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {sets.length > 1 && <p className="muted ow-note">Each season's set must have every texture the chunk uses, by name; a missing one draws wrong in that season.</p>}
      </section>
    </>
  );
}
