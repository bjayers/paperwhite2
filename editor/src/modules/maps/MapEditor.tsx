// The Map Editor (docs/paperwhite2/design/map-editor.md): a zone's map chunks in 3D, in a season, with four tabs:
// - Chunks: the matrix's cells and the chosen chunk's inspector (its polygons, vertices and materials against the
//   game's limits, its textures against each season's set, and its season variants);
// - Faces: faces picked on the map (Shift adds, Ctrl removes, Select connected takes a whole tree or ledge) deleted or
//   drawn with another texture of the area's set, written to the chunk's model.glb at once, with undo;
// - Collision: the chunks' collision tiles of a layer, painted with a type, a height or a copied tile (collision.ts);
// - Paint: the chosen chunk as a painted map (each tile's terrain and height, and objects of the library), from which
//   its model and collision are generated (painting.ts, tools/paperwhite2/map_maker.py);
// - Objects: the library of whole objects saved from maps' faces, placed on existing chunks.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { api } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import { fromPlain, toPlain } from "../../../shared/json.ts";
import { navigate, useToolParams } from "../../navigation.ts";
import type { ToolProps } from "../types.ts";
import { loadWorld, type World } from "../world/world.ts";
import { SEASONS, TILE, loadZoneMap, reloadLayers, type ZoneMap } from "../overworld/terrain.ts";
import { CollisionPanel, type CollisionBrush } from "./CollisionPanel.tsx";
import { NewMapDialog } from "./NewMapDialog.tsx";
import { OverworldGrid, type OverworldCell } from "./OverworldGrid.tsx";
import { paintTiles, tileRow } from "./collision.ts";
import { ChunkScene, connectedFaces, faceKey, forgetObject, stackedFaces, type ChunkModel, type Face } from "./ChunkScene.ts";
import { seasonSets, seasonVariants, type SeasonSet } from "./seasons.ts";
import { ReadingPanel, type ChunkReading } from "./ReadingPanel.tsx";
import { PaintPanel } from "./PaintPanel.tsx";
import { ObjectsPanel } from "./ObjectsPanel.tsx";
import { loadLibrary, loadStyles, painted, projectPath, strokeCells, type LibraryObject, type MapStyle, type PaintShape,
  type PaintTool, type Project } from "./painting.ts";

type Tab = "chunks" | "faces" | "collision" | "paint" | "objects";

/** The busiest vanilla chunks (map04_20's spring chunk has 1,114 triangles): the DS draws 2,048 polygons and 6,144
 * vertices a frame, all chunks, props and actors together, and the game's own chunks reach these, so a chunk past them
 * is busier than anything the game draws. */
const POLYGON_BUDGET = 2133;
const VERTEX_BUDGET = 6677;
const MATERIAL_LIMIT = 255;

/** One step of the history: a chunk's GLB before and after a face edit, as base64; or edits of documents (collision,
 * document's own history holds. */
type Step = { kind: "faces"; path: string; before: Snapshot; after: Snapshot; what: string } | { kind: "docs"; paths: string[]; what: string }
  | { kind: "group"; steps: Step[]; what: string };

/** A chunk's model.glb, as base64, and its data.json, which an edit may mark written; with its collision files where
 * the step rewrote them (a generate). */
/** Whether a step edits documents (path: that one), so it goes when they are reverted. */
const editsDocs = (st: Step, path?: string): boolean =>
  st.kind === "docs" ? !path || st.paths.includes(path) : st.kind === "group" && st.steps.some((inner) => editsDocs(inner, path));

interface Snapshot { glb: string; data: string; files?: Record<string, string> }


async function glbBase64(path: string, collision = false): Promise<Snapshot> {
  const response = await fetch(`/${path}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: ${response.statusText}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const data = (await api.file(path.replace(/model\.glb$/, "data.json"))).text;
  if (!collision) return { glb: btoa(text), data };
  const files: Record<string, string> = {};
  for (const name of ["terrain_0.csv", "terrain_0_splits.csv", "terrain_1.csv", "terrain_1_splits.csv"]) {
    const file = await api.file(path.replace(/model\.glb$/, name)).catch(() => null);
    if (file) files[name] = file.text;
  }
  return { glb: btoa(text), data, files };
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
  const [wireframe, setWireframe] = useState(false);
  // The map reader's layer: the chunk's tiles as it reads them, and the tile whose record is shown
  const [readingOn, setReadingOn] = useState(false);
  const [readingRev, setReadingRev] = useState<"now" | "original">("now");
  const [reading, setReading] = useState<ChunkReading | null>(null);
  const [readingState, setReadingState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const [readingTile, setReadingTile] = useState<{ x: number; z: number } | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [sets, setSets] = useState<SeasonSet[]>([]);
  const [variants, setVariants] = useState<string[] | null>(null);
  const [chunkData, setChunkData] = useState<{ texture_set: string | null; written?: boolean; texture_preview?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [history, setHistory] = useState<{ done: Step[]; undone: Step[] }>({ done: [], undone: [] });
  const [styles, setStyles] = useState<Map<string, MapStyle>>(new Map());
  const [library, setLibrary] = useState<LibraryObject[]>([]);
  const [libraryVersion, setLibraryVersion] = useState(0);
  const [projectExists, setProjectExists] = useState<Record<string, boolean>>({});
  const [tool, setTool] = useState<PaintTool>("terrain");
  const [shape, setShape] = useState<PaintShape>("pencil");
  const [terrainKey, setTerrainKey] = useState("g");
  const [paintHeightHalf, setPaintHeightHalf] = useState(4);
  const [placing, setPlacing] = useState("");
  const [selectedObject, setSelectedObject] = useState<number | null>(null);
  const [showPaint, setShowPaint] = useState(true);
  const [fadeModel, setFadeModel] = useState(true);
  const [autoGenerate, setAutoGenerate] = useState(() => { try { return localStorage.getItem("maps.autoGenerate") === "1"; } catch { return false; } });
  const [pendingGenerate, setPendingGenerate] = useState(0);
  useEffect(() => { try { localStorage.setItem("maps.autoGenerate", autoGenerate ? "1" : "0"); } catch { /* not kept */ } }, [autoGenerate]);
  const [chosenObject, setChosenObject] = useState("");
  const [placingOnChunk, setPlacingOnChunk] = useState(false);
  const [saveAs, setSaveAs] = useState<{ name: string; category: string } | null>(null);
  const { docs } = useDocuments();
  const [layer, setLayer] = useState(0);
  const [newMap, setNewMap] = useState<false | { route?: [number, number][] }>(false);
  const [overworld, setOverworld] = useState(false);
  /** A chunk to choose once its zone's map has loaded, by its matrix cell. */
  const [pendingCell, setPendingCell] = useState<{ column: number; row: number } | null>(null);
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
  useEffect(() => { setFaces([]); if (!pendingCell) setChunk(null); }, [zone]);

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
  useEffect(() => { scene.current?.setWireframe(wireframe); }, [wireframe, loaded]);
  useEffect(() => { scene.current?.showFaces(faces); }, [faces, loaded]);

  const pickFace = useRef<(face: Face | null, chunk: number | null, ev: PointerEvent, point: THREE.Vector3 | null,
                           tile: { x: number; z: number } | null) => void>(() => {});
  pickFace.current = (face, picked, ev, point, tilePicked) => {
    if (readingOn && picked !== null && point && map) {
      // The Reading layer: a click shows the tile's record
      const c = map.chunks[picked];
      setChunk(picked);
      setReadingTile({ x: Math.floor((point.x - c.column * map.chunkSize) / TILE), z: Math.floor((point.z - c.row * map.chunkSize) / TILE) });
      return;
    }
    if (tab === "collision") {
      if (picked !== null) setChunk(picked);
      if (ev.altKey && tilePicked && map) eyedropper(tilePicked);
      return;
    }
    if (tab === "paint" && project) {
      // Strokes paint; a click elsewhere chooses another chunk
      if (picked !== chunk && picked !== null) setChunk(picked);
      return;
    }
    if (tab === "objects" && placingOnChunk && chosenObject && picked !== null && (tilePicked || point)) {
      // The tile under the point clicked (on the model, or the ground under it)
      placeOnChunk(picked, tilePicked ?? { x: Math.floor(point!.x / TILE), z: Math.floor(point!.z / TILE) });
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
    if (scene.current) scene.current.onPick = (r, ev) => {
      if (r.readingTile && r.chunk !== null) { setChunk(r.chunk); setReadingTile(r.readingTile); return; }
      pickFace.current(r.face, r.chunk, ev, r.point, r.tile);
    };
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

  /** Puts one step's files back (back) or forward again; a group's steps in turn. */
  const apply = async (st: Step, back: boolean): Promise<void> => {
    if (st.kind === "group") {
      for (const inner of back ? [...st.steps].reverse() : st.steps) await apply(inner, back);
      return;
    }
    if (st.kind === "docs") {
      for (const path of st.paths) { if (back) documents.undo(path); else documents.redo(path); }
      await reloadTerrain(st.paths);
      return;
    }
    const snapshot = back ? st.before : st.after;
    await api.glbRaw(st.path, snapshot.glb, snapshot.data, snapshot.files);
    if (snapshot.files) {
      const folder = st.path.replace(/\/model\.glb$/, "");
      const paths = Object.keys(snapshot.files).map((n) => `${folder}/${n}`);
      for (const p of paths) if (documents.get(p)) await documents.reload(p);
      setMapVersion((v) => v + 1);
    }
    setFaces([]);
    reloadChunk(st.path.replace(/\/model\.glb$/, ""));
  };

  const step = useCallback(async (back: boolean) => {
    const list = back ? history.done : history.undone;
    const last = list[list.length - 1];
    if (!last || busy) return;
    setBusy(true);
    try {
      await apply(last, back);
      setHistory((h) => back ? { done: h.done.slice(0, -1), undone: [...h.undone, last] }
        : { done: [...h.done, last], undone: h.undone.slice(0, -1) });
      setMessage({ text: `${back ? "Undid" : "Redid"}: ${last.what}.` });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }, [history, busy]);

  // ---------------------------------------------------------------- The overworld's grid

  /** A cell of the overworld clicked: its zone's chunk chosen, or a new route offered on a filler or empty cell. */
  const overworldCell = (cell: OverworldCell) => {
    if (!cell.zone) {
      setNewMap({ route: [[cell.column, cell.row]] });
      return;
    }
    const file = cell.zone.replace(/^ZONE_/, "").toLowerCase();
    setPendingCell({ column: cell.column, row: cell.row });
    if (file !== zone) setZone(file);
    setOverworld(false);
  };
  useEffect(() => {
    if (!pendingCell || !map) return;
    const index = map.chunks.findIndex((c) => c.column === pendingCell.column && c.row === pendingCell.row);
    if (index < 0) return;
    setPendingCell(null);
    setChunk(index);
    // After the zone's frame, when it has just loaded
    setTimeout(() => scene.current?.frameChunk(index), 50);
  }, [pendingCell, map]);

  // ---------------------------------------------------------------- Painted maps

  const modelName = current ? current.folder.slice(current.folder.lastIndexOf("/") + 1) : null;
  const projectFile = modelName ? projectPath(modelName) : null;
  useEffect(() => { loadStyles().then(setStyles, () => setStyles(new Map())); }, []);
  useEffect(() => { loadLibrary().then(setLibrary, () => setLibrary([])); }, [libraryVersion]);
  useEffect(() => {
    if (!projectFile || projectExists[projectFile] !== undefined) return;
    api.list(projectFile).then((found) => {
      const exists = found.includes(projectFile);
      setProjectExists((m) => ({ ...m, [projectFile]: exists }));
      if (exists) documents.hold(projectFile).catch(() => {});
    }, () => {});
  }, [projectFile, projectExists]);
  const projectDoc = projectFile && projectExists[projectFile] ? docs.get(projectFile) : undefined;
  const project = useMemo(() => (projectDoc?.data ? toPlain(projectDoc.data) as Project : null), [projectDoc?.data]);
  const projectStyle = project ? styles.get(project.style) : undefined;
  // The reading of the chosen chunk, by the painting's style (else the first), read again after each change to it
  // (a style only names the textures of its own texture set: elsewhere, textures are shown by their names)
  const chunkSet = chunkData?.texture_set ?? chunkData?.texture_preview ?? null;
  const readingStyleName = project?.style ?? [...styles.entries()].find(([, st]) => st.texture_set === chunkSet)?.[0] ?? null;
  const readingStyle = readingStyleName ? styles.get(readingStyleName) : undefined;
  useEffect(() => {
    setReading(null);
    if (!readingOn || !modelName) return;
    let live = true;
    setReadingState({ loading: true, error: null });
    api.readChunk<ChunkReading>(modelName, readingStyleName, readingRev === "original").then(
      (r) => { if (live) { setReading(r); setReadingState({ loading: false, error: null }); } },
      (e: Error) => { if (live) setReadingState({ loading: false, error: e.message }); });
    return () => { live = false; };
  }, [readingOn, modelName, readingRev, readingStyleName, mapVersion]);
  const readingColor = (terrain: string | null) => {
    const color = readingStyle?.terrains.find((t) => t.key === terrain)?.color;
    if (color) return color;
    if (!terrain) return "#202020";
    if (terrain === "cliff") return "#a07850";
    return `hsl(${[...terrain].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)}, 60%, 55%)`;
  };
  const readingLegend = useMemo((): [string, string][] => [...new Set((reading?.tiles ?? []).map((t) => t.reading.terrain ?? ""))]
    .filter(Boolean).sort().map((k) => [k, readingColor(k)]), [reading, readingStyle]);
  useEffect(() => {
    if (!readingOn || !reading || chunk === null) { scene.current?.showReading(null, null); return; }
    // Each tile at where one walks (the higher of its ground and its first collision layer: water's surface over
    // its bed), and a square more for each other collision layer at another height (a canal under a walkway)
    const squares: Parameters<ChunkScene["showReading"]>[1] = [];
    for (const t of reading.tiles) {
      const layers = (t.layers as { layer: number; height: number | null; y: number | null; terrain: string | null }[] | undefined) ?? [];
      const first = layers.find((l) => l.layer === 0)?.height ?? null;
      const y = Math.max(t.ground?.y ?? -1e9, first ?? -1e9);
      squares!.push({ x: t.x, z: t.z, y: y > -1e8 ? y : 0, color: readingColor(t.reading.terrain),
        outside: t.reading.edge?.outside ?? t.reading.slope?.down ?? null, unsure: t.reading.confidence === "low", structure: t.reading.structure,
        selected: !!readingTile && readingTile.x === t.x && readingTile.z === t.z });
      for (const l of layers) {
        // A layer with nothing drawn at its height (an invisible blocker high up) stays in the record only
        if (l.layer === 0 || l.height === null || !l.terrain || Math.abs(l.height - y) < 8) continue;
        squares!.push({ x: t.x, z: t.z, y: l.height, color: readingColor(l.terrain), outside: null, unsure: !l.terrain, structure: false, selected: false });
      }
    }
    scene.current?.showReading(chunk, squares);
  }, [readingOn, reading, chunk, readingTile, readingStyle, loaded]);
  useEffect(() => { setSelectedObject(null); }, [modelName]);
  useEffect(() => {
    const show = tab === "paint" && project && chunk !== null;
    const colors = Object.fromEntries((projectStyle?.terrains ?? []).map((t) => [t.key, t.color ?? "#888888"]));
    scene.current?.showPainting(show ? chunk : null, show ? { terrain: project.terrain, height: project.height, objects: project.objects ?? [], colors,
                                                             show: showPaint, fade: fadeModel } : null, selectedObject);
  }, [tab, showPaint, fadeModel, project, projectStyle, chunk, loaded, selectedObject]);

  /** A painting's change, as one step; generated after it, as part of that step, where that is chosen. */
  const changeProject = (next: Project, what: string) => {
    if (!projectFile) return;
    documents.replace(projectFile, fromPlain(next));
    setHistory((h) => ({ done: [...h.done, { kind: "docs", paths: [projectFile], what }], undone: [] }));
    if (autoGenerate) setPendingGenerate((n) => n + 1);
  };
  // After the render that has the change, so the generate saves the painting as changed; strokes made while one runs
  // wait for it
  const generatedFor = useRef(0);
  useEffect(() => {
    if (pendingGenerate > generatedFor.current && !busy) {
      generatedFor.current = pendingGenerate;
      void generate(true);
    }
  }, [pendingGenerate, busy]);

  /** A stroke on the painting: its tiles (global) painted, or an object placed on its first. */
  const paintProject = (tiles: { x: number; z: number }[]) => {
    if (!project || !map || !current) return;
    const local = tiles.map((t) => ({ x: t.x - current.column * map.chunkTiles, z: t.z - current.row * map.chunkTiles }));
    if (tool === "place") {
      if (!placing) { setMessage({ text: "Choose an object to place.", error: true }); return; }
      const at = local[local.length - 1];
      changeProject({ ...project, objects: [...(project.objects ?? []), [placing, at.x, at.z]] }, `Placed ${placing} at ${at.x}, ${at.z}`);
      setSelectedObject((project.objects ?? []).length);
      return;
    }
    if (tool === "select") return;
    const cells = strokeCells(local, shape);
    const fallback = terrainKey !== "." ? terrainKey : projectStyle?.terrains[0]?.key ?? "g";
    changeProject(painted(project, cells, tool, terrainKey, paintHeightHalf, fallback), `Painted ${cells.length} tile(s)`);
  };

  /** An object dragged to another tile, or clicked. */
  const objectMoved = (index: number, tile: { x: number; z: number } | null) => {
    setSelectedObject(index);
    if (!project || !tile) return;
    const objects = [...(project.objects ?? [])];
    const [name, x, z] = objects[index];
    if (x === tile.x && z === tile.z) return;
    objects[index] = [name, tile.x, tile.z];
    changeProject({ ...project, objects }, `Moved ${name} to ${tile.x}, ${tile.z}`);
  };

  const removeSelectedObject = () => {
    if (!project || selectedObject === null) return;
    const objects = (project.objects ?? []).filter((_, i) => i !== selectedObject);
    changeProject({ ...project, objects }, "Removed an object");
    setSelectedObject(null);
  };

  /** Starts a painted map of the chosen chunk: every tile fill ("." keeps the chunk), at its collision's heights or
   * one height; the server keeps a copy of the chunk, which kept tiles draw from and Stop puts back. */
  const startProject = async (style: string, fill: string, flat?: number) => {
    if (!projectFile || !modelName) return;
    setBusy(true);
    try {
      await api.startPainting(modelName, style, fill, flat);
      await documents.hold(projectFile);
      setProjectExists((m) => ({ ...m, [projectFile]: true }));
      setTerrainKey(fill === "." ? (styles.get(style)?.terrains[0]?.key ?? "g") : fill);
      setShowPaint(true);
      setMessage({ text: `Started ${projectFile}${fill === "." ? ", every tile kept as the chunk has it: paint only what you change" : ""}. Generate the chunk when it's ready.` });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  /** Puts the chunk back as it was before painting, and removes the painting. */
  const stopProject = async () => {
    if (!modelName || !projectFile || !current) return;
    if (!window.confirm(`Put ${modelName} back as it was before painting? Its painting is removed.`)) return;
    setBusy(true);
    try {
      const result = await api.stopPainting(modelName);
      documents.close(projectFile);
      setProjectExists((m) => ({ ...m, [projectFile]: false }));
      setHistory((h) => ({ done: h.done.filter((st) => !editsDocs(st, projectFile)), undone: h.undone.filter((st) => !editsDocs(st, projectFile)) }));
      for (const l of current.layers) if (documents.get(l.path)) await documents.reload(l.path);
      reloadChunk(current.folder);
      setMapVersion((v) => v + 1);
      setMessage({ text: result.output.includes("no copy") ? `${modelName}'s painting is removed (it was started before copies of the chunk were kept, so the chunk stays as it is).`
        : `${modelName} is back as it was before painting.` });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  /** Puts the chunk's model, data.json and collision back as the original game or the last commit has them. */
  const revertChunk = async (to: "vanilla" | "commit", keepCollision: boolean) => {
    if (!modelName || !current) return;
    const as = `${to === "vanilla" ? "as it is in the original game" : "as it was last committed"}${keepCollision ? ", keeping its collision" : ""}`;
    if (!window.confirm(`Put ${modelName} back ${as}? Its model${keepCollision ? "" : " and collision"} are replaced (Ctrl+Z undoes this).`)) return;
    setBusy(true);
    try {
      for (const l of current.layers) if (documents.get(l.path)?.dirty) throw new Error(`${l.path} has unsaved edits: save or revert them first`);
      const path = `${current.folder}/model.glb`;
      const before = await glbBase64(path, true);
      await api.revertChunk(modelName, to, keepCollision);
      const after = await glbBase64(path, true);
      setHistory((h) => ({ done: [...h.done, { kind: "faces", path, before, after, what: `Put the chunk back ${as}` }], undone: [] }));
      for (const l of current.layers) if (documents.get(l.path)) await documents.reload(l.path);
      reloadChunk(current.folder);
      setMapVersion((v) => v + 1);
      setMessage({ text: `${modelName} is back ${as}.` });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  /** Generates the chunk from its painting; join makes it one step with the stroke before it (generating after
   * each stroke). */
  const generate = async (join = false) => {
    if (!modelName || !projectFile || !current) return;
    setBusy(true);
    try {
      if (documents.get(projectFile)?.dirty && !(await documents.save(projectFile))) throw new Error(documents.get(projectFile)?.saveError ?? "The painting didn't save");
      // The collision the generator writes over must not be held unsaved
      for (const l of current.layers) if (documents.get(l.path)?.dirty) throw new Error(`${l.path} has unsaved edits: save or revert them first`);
      const path = `${current.folder}/model.glb`;
      const before = await glbBase64(path, true);
      const result = await api.generateMap(modelName);
      const after = await glbBase64(path, true);
      const generated: Step = { kind: "faces", path, before, after, what: "Generated the chunk" };
      setHistory((h) => {
        const stroke = h.done[h.done.length - 1];
        if (!join || !stroke || !editsDocs(stroke, projectFile)) return { done: [...h.done, generated], undone: [] };
        return { done: [...h.done.slice(0, -1), { kind: "group", steps: [stroke, generated], what: `${stroke.what}, and generated the chunk` }], undone: [] };
      });
      for (const l of current.layers) if (documents.get(l.path)) await documents.reload(l.path);
      reloadChunk(current.folder);
      setMapVersion((v) => v + 1);
      setMessage({ text: `${result.output}. The chunk's model and collision are generated.` });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------- The object library

  /** Saves the selected faces as an object of the library: their footprint and the ground under them, as Copy does. */
  const saveObject = async (name: string, category: string) => {
    if (!current || !model || !faces.length || !map || chunk === null || !modelName) return;
    const half = map.chunkSize / 2;
    const p = new THREE.Vector3();
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, y0 = Infinity;
    for (const f of faces) {
      const geometry = model.primitives[f.primitive].mesh.geometry;
      for (let k = 0; k < 3; k++) {
        const v = geometry.index ? geometry.index.getX(f.triangle * 3 + k) : f.triangle * 3 + k;
        p.fromBufferAttribute(geometry.attributes.position as THREE.BufferAttribute, v);
        x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); y0 = Math.min(y0, p.y);
      }
    }
    const snap = (v: number) => Math.floor((v + half) / TILE) * TILE - half;
    const ax = snap(x0 + 0.01), az = snap(z0 + 0.01);
    const size = [Math.max(1, Math.ceil((x1 - 0.01 - ax) / TILE)), Math.max(1, Math.ceil((z1 - 0.01 - az) / TILE))];
    const ground = groundUnder(chunk, (x0 + x1) / 2, (z0 + z1) / 2) ?? y0;
    setBusy(true);
    try {
      const saved = await api.saveMapObject({ name, category: category || undefined, chunk: modelName, faces: faceSets(faces),
                                              anchor: [ax, Math.round(ground), az], size });
      setLibraryVersion((v) => v + 1);
      setChosenObject(saved.id);
      setSaveAs(null);
      setMessage({ text: `Saved ${name} to the library (${size[0]}×${size[1]} tiles), res/paperwhite2/map_objects/${saved.id}/.` });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  /** Places the chosen object on an existing chunk: its faces pasted into the model on the tile's ground, and its
   * collision painted under it. */
  const placeOnChunk = async (index: number, tile: { x: number; z: number }) => {
    const object = library.find((o) => o.id === chosenObject);
    if (!object || !map || busy) return;
    const target = map.chunks[index];
    const set = sets[Math.min(season, Math.max(0, sets.length - 1))];
    if (!set?.set) return;
    const half = map.chunkSize / 2;
    const tx = tile.x - target.column * map.chunkTiles, tz = tile.z - target.row * map.chunkTiles;
    const ground = groundUnder(index, tx * TILE - half + TILE / 2, tz * TILE - half + TILE / 2) ?? 0;
    const path = `${target.folder}/model.glb`;
    setBusy(true);
    try {
      const before = await glbBase64(path);
      const result = await api.glbPaste(path, `res/paperwhite2/map_objects/${object.id}/model.glb`, "all", [tx * TILE - half, Math.round(ground), tz * TILE - half], set.set);
      const after = await glbBase64(path);
      const what = `Placed ${object.name} at ${tx}, ${tz}`;
      setHistory((h) => ({ done: [...h.done, { kind: "faces", path, before, after, what }], undone: [] }));
      setChunk(index);
      reloadChunk(target.folder);
      // Selected, so the move buttons can put them right where the click missed
      setFaces(result.faces.flatMap((f) => f.triangles.map((triangle) => ({ chunk: index, primitive: f.primitive, triangle }))));
      setPasting(false);
      // Its collision, tile by tile
      const painted: string[] = [];
      for (const [dz, row] of (object.collision ?? []).entries()) for (const [dx, type] of row.entries()) {
        if (type === null) continue;
        const r = await paintTiles(map, [{ x: tile.x + dx, z: tile.z + dz }], layer, { kind: "type", tileType: type }, () => []);
        painted.push(...r.paths);
      }
      await reloadTerrain(painted);
      const lacking = result.pngs.filter((p) => sets.some((s) => !s.textures.has(p.slice(p.indexOf("/") + 1))));
      setMissing(lacking);
      setMessage({ text: `${what}${painted.length ? "; its collision painted (save it in the header)" : ""}.${lacking.length ? ` Import ${lacking.length} texture(s) below.` : ""}` });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  const deleteObject = async (id: string) => {
    if (!window.confirm(`Delete ${id} from the library? Painted maps that place it won't generate until it's removed from them.`)) return;
    try {
      await api.deleteMapObject(id);
      forgetObject(id);
      setLibraryVersion((v) => v + 1);
      setChosenObject("");
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
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
    const painting = tab === "paint" && !!project;
    s.painting = tab === "collision" || (painting && tool !== "select");
    s.dragObjects = painting && tool === "select";
    if (!painting) s.showTerrain(tab === "collision" ? layer : null, tab === "collision" && brush.kind === "type" ? brush.tileClass : null);
  }, [tab, layer, map, brush.kind, brush.tileClass, loaded, project, tool]);

  const paintStroke = useRef<(tiles: { x: number; z: number }[]) => void>(() => {});
  paintStroke.current = async (tiles) => {
    if (!map) return;
    if (tab === "paint") { paintProject(tiles); return; }
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
  const objectDrag = useRef<(index: number, tile: { x: number; z: number } | null) => void>(() => {});
  objectDrag.current = (index, tile) => objectMoved(index, tile);
  useEffect(() => { if (scene.current) scene.current.onObject = (i, t) => objectDrag.current(i, t); }, []);

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
    && (/^res\/field\/maps\/models\/[^/]+\/terrain_\d+(_splits)?\.csv$/.test(d.path) || d.path.startsWith("res/paperwhite2/map_projects/")));
  const save = async () => {
    for (const d of unsaved) await documents.save(d.path);
  };
  const revert = async () => {
    const paths = unsaved.map((d) => d.path);
    for (const path of paths) await documents.reload(path);
    setHistory((h) => ({ done: h.done.filter((st) => !editsDocs(st)), undone: h.undone.filter((st) => !editsDocs(st)) }));
    await reloadTerrain(paths);
  };

  // ---------------------------------------------------------------- Copy and paste

  /** The height of a chunk's ground (its collision, on the chosen layer) under a point in its own coordinates. */
  const groundUnder = (index: number, x: number, z: number): number | null => {
    if (!map) return null;
    const l = map.chunks[index]?.layers[Math.min(layer, (map.chunks[index]?.layers.length ?? 1) - 1)];
    const half = map.chunkSize / 2;
    const tx = Math.floor((x + half) / TILE), tz = Math.floor((z + half) / TILE);
    if (!l || tx < 0 || tz < 0 || tx >= map.chunkTiles || tz >= map.chunkTiles) return null;
    const h = l.heights[tz * map.chunkTiles + tx];
    return Number.isFinite(h) ? h : null;
  };

  /** Copies the selected faces: their chunk's GLB and where they start: their north-west tile corner, and the height
   * of the ground under their middle, so that a paste keeps how far they stand above it (a tree's shadow does). */
  const copyFaces = () => {
    if (!current || !model || !faces.length || !map || chunk === null) return;
    const half = map.chunkSize / 2;
    const p = new THREE.Vector3();
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const f of faces) {
      const geometry = model.primitives[f.primitive].mesh.geometry;
      for (let k = 0; k < 3; k++) {
        const v = geometry.index ? geometry.index.getX(f.triangle * 3 + k) : f.triangle * 3 + k;
        p.fromBufferAttribute(geometry.attributes.position as THREE.BufferAttribute, v);
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z);
      }
    }
    const snap = (v: number) => Math.floor((v + half) / TILE) * TILE - half;
    const ground = groundUnder(chunk, (x0 + x1) / 2, (z0 + z1) / 2) ?? y0;
    setClipboard({ source: `${current.folder}/model.glb`, faces: faceSets(faces), anchor: [snap(x0), Math.round(ground), snap(z0)],
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
    // On the ground the tile clicked has, as the copy stood on its own (the point clicked may be a treetop)
    const ground = groundUnder(index, lx + TILE / 2, lz + TILE / 2) ?? point.y;
    const offset: [number, number, number] = [snap(lx) - clipboard.anchor[0], Math.round(ground) - clipboard.anchor[1], snap(lz) - clipboard.anchor[2]];
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
      // Selected, so the move buttons can put them right where the click missed
      setFaces(result.faces.flatMap((f) => f.triangles.map((triangle) => ({ chunk: index, primitive: f.primitive, triangle }))));
      setPasting(false);
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

  /** Moves the selected faces by whole tiles across, or units up and down; they stay selected. */
  const moveFaces = async (dx: number, dy: number, dz: number) => {
    if (!current || !faces.length || busy || chunk === null) return;
    const set = sets[Math.min(season, Math.max(0, sets.length - 1))];
    if (!set?.set) return;
    const path = `${current.folder}/model.glb`;
    setBusy(true);
    try {
      const before = await glbBase64(path);
      const result = await api.glbMove(path, faceSets(faces), [dx * TILE, dy, dz * TILE], set.set);
      const after = await glbBase64(path);
      const what = `Moved ${faces.length} face(s) ${dx || dz ? `${dx}, ${dz} tile(s)` : ""}${dy ? ` ${dy > 0 ? "up" : "down"} ${Math.abs(dy)}` : ""}`;
      setHistory((h) => ({ done: [...h.done, { kind: "faces", path, before, after, what }], undone: [] }));
      reloadChunk(current.folder);
      const at = chunk;
      setFaces(result.faces.flatMap((f) => f.triangles.map((triangle) => ({ chunk: at, primitive: f.primitive, triangle }))));
      setMessage({ text: `${what}.` });
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

  /** Hides the selected faces from view and clicks (the model stays as it is), to reach the faces behind them. */
  const [hiddenCount, setHiddenCount] = useState(0);
  const hideSelected = () => {
    scene.current?.hideFaces(faces);
    setFaces([]);
    setHiddenCount(scene.current?.hiddenCount() ?? 0);
  };
  const showHidden = () => {
    scene.current?.showHidden();
    setHiddenCount(0);
  };

  const removeFaces = () => editFaces(`Deleted ${faces.length} face(s)`, { remove: faceSets(faces) });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Typing in a box keeps its own undo; a checkbox or radio button that has focus doesn't
      const typing = (e.target as HTMLElement)?.closest?.("input:not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable]");
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); step(!e.shiftKey); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); step(false); }
      else if (tab === "faces" && (e.key === "Delete" || e.key === "Backspace") && faces.length) { e.preventDefault(); removeFaces(); }
      else if (tab === "faces" && e.key.toLowerCase() === "h" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (e.altKey) showHidden(); else if (faces.length) hideSelected();
      }
      else if (tab === "paint" && (e.key === "Delete" || e.key === "Backspace") && selectedObject !== null) { e.preventDefault(); removeSelectedObject(); }
      else if (tab === "faces" && faces.length && e.altKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(e.key)) {
        // Alt+arrows move the selection a tile (the arrows alone pan the view); Alt+Page Up and Down, a unit up or down
        e.preventDefault();
        const step = e.shiftKey ? 8 : 1;
        if (e.key === "ArrowLeft") moveFaces(-1, 0, 0);
        else if (e.key === "ArrowRight") moveFaces(1, 0, 0);
        else if (e.key === "ArrowUp") moveFaces(0, 0, -1);
        else if (e.key === "ArrowDown") moveFaces(0, 0, 1);
        else moveFaces(0, e.key === "PageUp" ? step : -step, 0);
      }
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
                      route={newMap.route}
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
        <button onClick={() => setNewMap({})} title="Make one of the game's unused zones a new map, from the chosen chunk">New map…</button>
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
          <button className={`me-overworld-button${overworld ? " active" : ""}`} onClick={() => setOverworld(!overworld)}
                  title="The overworld's grid: click an area's cell to open its chunk, or a filler or empty cell to add a route there">🗺 Overworld map</button>
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
              {(["chunks", "faces", "collision", "paint", "objects"] as Tab[]).map((t) => (
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
            <label className="ow-check" title="The models' triangles' edges, to see what a click picks"><input type="checkbox" checked={wireframe}
              onChange={(e) => setWireframe(e.target.checked)} /> Wireframe</label>
            <label className="ow-check" title="What the map reader makes of the chunk's tiles; a click shows a tile's record"><input type="checkbox"
              checked={readingOn} onChange={(e) => setReadingOn(e.target.checked)} /> Reading</label>
            <span className="spacer" />
            <button onClick={() => step(true)} disabled={!history.done.length || busy} title="Ctrl+Z">Undo</button>
            <button onClick={() => step(false)} disabled={!history.undone.length || busy} title="Ctrl+Y">Redo</button>
          </div>
          <div className={`ow-map-wrap${tab === "faces" ? " me-picking" : ""}${tab === "collision" || (tab === "paint" && project && tool !== "select") ? " painting" : ""}`}>
            <div className="ow-map" ref={host} />
            {overworld && (
              <div className="me-overworld-panel">
                <div className="me-overworld-head"><strong>Overworld</strong><span className="spacer" /><button onClick={() => setOverworld(false)}>Close</button></div>
                <OverworldGrid current={zone ? `ZONE_${zone.toUpperCase()}` : null} onCell={overworldCell}
                               hint="Click an area's cell to open its chunk; a grey (filler) or empty cell, to add a route there." />
              </div>
            )}
            {!zone && <div className="ow-empty me-empty muted">Choose a zone.</div>}
          </div>
        </div>
        <div className="ow-side">
          <div className="ow-panel">
            {readingOn && (
              <ReadingPanel reading={reading} rev={readingRev} setRev={setReadingRev} loading={readingState.loading} error={readingState.error}
                            tile={reading && readingTile ? reading.tiles.find((t) => t.x === readingTile.x && t.z === readingTile.z) ?? null : null}
                            terrainName={(key) => readingStyle?.terrains.find((t) => t.key === key)?.name ?? key ?? "none"}
                            legend={readingLegend} />
            )}
            {tab === "chunks" && (
              <>
                <section className="me-section">
                  <h4>Matrix</h4>
                  {map ? <MatrixGrid map={map} selected={chunk} onSelect={(i) => { setChunk(i); scene.current?.frameChunk(i); }} />
                    : <p className="muted ow-note">Choose a zone.</p>}
                  <p className="muted ow-note">The zone's cells of its matrix ({map?.matrix.replace(/^MAP_MATRIX_/, "").toLowerCase()}). Click one, or click the map.</p>
                </section>
                {current && (
                  <ChunkInspector folder={current.folder} model={model} data={chunkData} variants={variants} season={season} sets={sets}
                                  onRevert={revertChunk} busy={busy} painting={!!project} />
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
                  <div className="me-actions">
                    <button disabled={!faces.length} onClick={hideSelected} title="H: hidden from view and from clicks until shown again; the model doesn't change">Hide them</button>
                    <button disabled={!hiddenCount} onClick={showHidden} title="Alt+H">Show hidden{hiddenCount ? ` (${hiddenCount})` : ""}</button>
                  </div>
                  <p className="muted ow-note">Click a face; Shift+click adds one, Ctrl+click takes one away; H hides the selection, to reach faces
                    behind it, and Alt+H shows them again. Edits are written to the chunk's model.glb as you make them; Ctrl+Z undoes them.</p>
                </section>
                <section className="me-section">
                  <h4>Delete</h4>
                  <div className="me-actions"><button className="danger" disabled={!faces.length || busy} onClick={removeFaces} title="Delete">Delete the faces</button></div>
                  <p className="muted ow-note">Clearing a tree: click its leaves, Select the stack, then delete, and paint its tiles walkable in the
                    Collision tab. Route 20's forests are layers over many tiles; clear part of one by Shift+clicking its faces.</p>
                </section>
                <section className="me-section">
                  <h4>Move</h4>
                  <div className="me-move">
                    <span />
                    <button disabled={!faces.length || busy} onClick={() => moveFaces(0, 0, -1)} title="A tile north (Alt+↑)">↑</button>
                    <span />
                    <button disabled={!faces.length || busy} onClick={() => moveFaces(0, 1, 0)} title="A unit up (Alt+Page Up; with Shift, half a tile)">Up</button>
                    <button disabled={!faces.length || busy} onClick={() => moveFaces(-1, 0, 0)} title="A tile west (Alt+←)">←</button>
                    <button disabled={!faces.length || busy} onClick={() => moveFaces(0, 0, 1)} title="A tile south (Alt+↓)">↓</button>
                    <button disabled={!faces.length || busy} onClick={() => moveFaces(1, 0, 0)} title="A tile east (Alt+→)">→</button>
                    <button disabled={!faces.length || busy} onClick={() => moveFaces(0, -1, 0)} title="A unit down (Alt+Page Down; with Shift, half a tile)">Down</button>
                  </div>
                  <p className="muted ow-note">Moves the selection a tile at a time (Alt+arrows) or a unit up and down (Alt+Page Up and Down; with
                    Shift, half a tile); it stays selected. Its collision stays where it was: repaint it in the Collision tab.</p>
                </section>
                <section className="me-section">
                  <h4>Save as an object</h4>
                  {saveAs ? (
                    <form onSubmit={(e) => { e.preventDefault(); if (saveAs.name.trim()) saveObject(saveAs.name.trim(), saveAs.category.trim()); }}>
                      <div className="me-row"><label>Name</label>
                        <input autoFocus value={saveAs.name} onChange={(e) => setSaveAs({ ...saveAs, name: e.target.value })} placeholder="Route 20 tree" /></div>
                      <div className="me-row"><label>Category</label>
                        <input value={saveAs.category} onChange={(e) => setSaveAs({ ...saveAs, category: e.target.value })} placeholder="trees" /></div>
                      <div className="me-actions">
                        <button className="primary" type="submit" disabled={busy || !saveAs.name.trim()}>Save to the library</button>
                        <button type="button" onClick={() => setSaveAs(null)}>Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <div className="me-actions">
                      <button disabled={!faces.length} onClick={() => setSaveAs({ name: "", category: "" })}
                              title="Saves the selected faces as a whole object of the library, to place on any map">Save the faces as an object…</button>
                    </div>
                  )}
                  <p className="muted ow-note">Keeps the faces, their footprint, the collision under them and how high they stand over the ground, to
                    place whole from the Objects and Paint tabs.</p>
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
                  <p className="muted ow-note">Click the tile the faces' north-west corner goes on; they stand as high above its ground as they stood
                    above their own. A paste adds
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
            {tab === "paint" && (
              <PaintPanel model={modelName} project={project} dirty={!!projectDoc?.dirty} styles={styles} objects={library} tool={tool} setTool={setTool}
                          shape={shape} setShape={setShape} terrain={terrainKey} setTerrain={setTerrainKey} height={paintHeightHalf} setHeight={setPaintHeightHalf}
                          placing={placing} setPlacing={setPlacing} selected={selectedObject} onRemoveSelected={removeSelectedObject}
                          showPaint={showPaint} setShowPaint={setShowPaint} fadeModel={fadeModel} setFadeModel={setFadeModel} onStart={startProject} onGenerate={() => void generate()} autoGenerate={autoGenerate} setAutoGenerate={setAutoGenerate} onStop={stopProject} busy={busy} />
            )}
            {tab === "objects" && (
              <ObjectsPanel objects={library} chosen={chosenObject} setChosen={setChosenObject} placing={placingOnChunk} setPlacing={setPlacingOnChunk}
                            missing={missing} onImport={importMissing} onDelete={deleteObject} busy={busy} />
            )}
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

function ChunkInspector({ folder, model, data, variants, season, sets, onRevert, busy, painting }: {
  folder: string; model: ChunkModel | undefined; data: { texture_set: string | null; written?: boolean; texture_preview?: string } | null;
  variants: string[] | null; season: number; sets: SeasonSet[]; onRevert(to: "vanilla" | "commit", keepCollision: boolean): void; busy: boolean;
  painting: boolean;
}) {
  const [keepCollision, setKeepCollision] = useState(false);
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
        <div className="me-row"><label>Put it back</label>
          <span className="me-inline">
            <button className="danger" disabled={busy} onClick={() => onRevert("vanilla", keepCollision)}
                    title="Its model, data.json and collision as the original game has them (the tag w2-original)">as in the original game</button>
            <button disabled={busy} onClick={() => onRevert("commit", keepCollision)}
                    title="Its model, data.json and collision as the last commit has them">as last committed</button>
          </span>
        </div>
        <div className="me-row"><label />
          <label className="ow-check"><input type="checkbox" checked={keepCollision} onChange={(e) => setKeepCollision(e.target.checked)} />
            keep its collision as it is now (put back only the model)</label>
        </div>
        <p className="muted ow-note">Ctrl+Z undoes it.{painting ? " Its painting stays: Stop painting in the Paint tab removes it." : ""}</p>
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
