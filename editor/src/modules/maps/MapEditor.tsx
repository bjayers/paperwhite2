// The Map Editor (docs/paperwhite2/design/map-editor.md): a zone's map chunks in 3D, in a season, with three tabs:
// - Chunks: the matrix's cells and the chosen chunk's inspector (its polygons, vertices and materials against the
//   game's limits, its textures against each season's set, and its season variants);
// - Faces: faces picked on the map (Shift adds, Ctrl removes, Select connected takes a whole tree or ledge) deleted or
//   drawn with another texture of the area's set, written to the chunk's model.glb at once, with undo;
// - Tiles: the tile libraries cut from the game's chunks (tools/paperwhite2/map_tiles.py), to browse.
// Collision is the Overworld Editor's permissions painter for now, which the header links to.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { api } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import { fromPlain, toPlain } from "../../../shared/json.ts";
import { navigate, useToolParams } from "../../navigation.ts";
import type { ToolProps } from "../types.ts";
import { loadWorld, type World } from "../world/world.ts";
import { SEASONS, TILE, loadZoneMap, type ZoneMap } from "../overworld/terrain.ts";
import { ChunkScene, connectedFaces, faceKey, stackedFaces, type ChunkModel, type Face, type LayoutTiles } from "./ChunkScene.ts";
import { seasonSets, seasonVariants, type SeasonSet } from "./seasons.ts";
import { TilePanel, type PaintHeight, type PaintMode } from "./TilePanel.tsx";
import type { Catalogue, Tile } from "./tiles.ts";

type Tab = "chunks" | "faces" | "tiles";

/** The busiest vanilla chunks (map04_20's spring chunk has 1,114 triangles): the DS draws 2,048 polygons and 6,144
 * vertices a frame, all chunks, props and actors together, and the game's own chunks reach these, so a chunk past them
 * is busier than anything the game draws. */
const POLYGON_BUDGET = 2133;
const VERTEX_BUDGET = 6677;
const MATERIAL_LIMIT = 255;

/** One step of the history: a chunk's GLB before and after a face edit, as base64; or an edit of a layout, which its
 * document's own history holds. */
type Step = { kind: "faces"; path: string; before: string; after: string; what: string } | { kind: "layout"; path: string; what: string };

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
  }, [zone, season, constants]);
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

  const pickFace = useRef<(face: Face | null, chunk: number | null, ev: PointerEvent, point: THREE.Vector3 | null) => void>(() => {});
  pickFace.current = (face, picked, ev, point) => {
    if (tab === "tiles" && paint !== "off" && layoutDoc && point && picked === chunk) {
      paintAt(point);
      return;
    }
    if (tab !== "faces") {
      setChunk(picked);
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
    if (scene.current) scene.current.onPick = (r, ev) => pickFace.current(r.face, r.chunk, ev, r.point);
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
    if (last.kind === "layout") {
      if (back) documents.undo(last.path); else documents.redo(last.path);
      moved();
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

  /** Paints the chosen tile, or erases objects, at a point on the chosen chunk's layout. */
  const paintAt = (point: THREE.Vector3) => {
    if (!map || !current || !layoutFile || !layoutData) return;
    const x = Math.floor((point.x - current.column * map.chunkSize) / TILE), z = Math.floor((point.z - current.row * map.chunkSize) / TILE);
    if (x < 0 || z < 0 || x >= map.chunkTiles || z >= map.chunkTiles) return;
    const cell = layoutData.ground.findIndex((g) => g[0] === x && g[1] === z);
    const groundY = cell >= 0 ? layoutData.ground[cell][3] : Math.round(point.y);
    const record = (what: string) => setHistory((h) => ({ done: [...h.done, { kind: "layout", path: layoutFile, what }], undone: [] }));
    if (paint === "erase") {
      const keys = new Map((catalogue?.tiles ?? []).map((t) => [t.key, t]));
      const kept = layoutData.objects.filter(([key, ox, oz]) => {
        const size = keys.get(key)?.size ?? [1, 1];
        return !(x >= ox && x < ox + size[0] && z >= oz && z < oz + size[1]);
      });
      if (kept.length === layoutData.objects.length) return;
      documents.edit(layoutFile, ["objects"], fromPlain(kept));
      record(`Removed ${layoutData.objects.length - kept.length} object(s) at ${x}, ${z}`);
      return;
    }
    if (!tile) return;
    const y = paintHeight === "tile" ? tile.at[0]?.y ?? groundY : groundY;
    if (tile.kind === "ground") {
      documents.edit(layoutFile, ["ground", cell >= 0 ? cell : layoutData.ground.length], fromPlain([x, z, tile.key, y]));
      record(`Painted ${x}, ${z}`);
    } else {
      documents.edit(layoutFile, ["objects", layoutData.objects.length], fromPlain([tile.key, x, z, y]));
      record(`Placed an object at ${x}, ${z}`);
    }
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
      if (layoutDoc?.dirty && !(await documents.save(layoutFile))) throw new Error(documents.get(layoutFile)?.saveError ?? "The layout didn't save");
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
      <header className="ow-header">
        <h2>Map Editor</h2>
        {zone && <strong>{zone}</strong>}
        <span className="spacer" />
        {zone && <button onClick={() => navigate("overworld", { zone })} title="Collision and permissions are painted there for now">Open in the Overworld Editor</button>}
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
              {(["chunks", "faces", "tiles"] as Tab[]).map((t) => (
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
            <label className="ow-check"><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Tile grid on the chunk</label>
            <span className="spacer" />
            <button onClick={() => step(true)} disabled={!history.done.length || busy} title="Ctrl+Z">Undo</button>
            <button onClick={() => step(false)} disabled={!history.undone.length || busy} title="Ctrl+Y">Redo</button>
          </div>
          <div className={`ow-map-wrap${tab === "faces" ? " me-picking" : ""}${tab === "tiles" && paint !== "off" && layoutDoc ? " painting" : ""}`}>
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
                    Overworld Editor. Route 20's forests are layers over many tiles; clear part of one by Shift+clicking its faces.</p>
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
