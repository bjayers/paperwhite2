// The Overworld Editor (docs/paperwhite2/design/overworld-editor.md): a zone's map in 3D with its collision tiles, and
// what is placed on it: NPCs, proxies (background events), triggers, warps and level scripts, from the zone's events
// (res/field/events/<zone>.json). Click to choose, drag to move to another tile, Shift+click a tile to add one of the
// shown module's kind, and edit its fields beside the map; its script opens below the map. A permissions painter sets
// tiles' types and heights in the chunks' collision. One undo history covers the events and the terrain. The size of the zone's events is checked against the field's buffer (2,436
// bytes, docs/paperwhite2/design/npc-research.md). Instances, ambients and groups come with the engine's next phase.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { documents, useDocuments } from "../../documents.ts";
import { toPlain, type JsonValue } from "../../../shared/json.ts";
import type { Schema } from "../../../shared/schema.ts";
import type { ToolProps } from "../types.ts";
import { navigate, useToolParams } from "../../navigation.ts";
import { DocForm, schemaAt, useHeld } from "../followers/DocForm.tsx";
import { defaultFor } from "../schema-form/form.tsx";
import { ScriptEditor } from "../scripts/ScriptEditor.tsx";
import { loadWorld, resolveScript, zoneLabel, type World } from "../world/world.ts";
import { KIND_LISTS, KIND_NAMES, entitiesOf, positionEdits, type Entity, type EntityKind } from "./entities.ts";
import { entityFields } from "./fields.tsx";
import { BuildingPanel } from "./BuildingPanel.tsx";
import { MapView, type OverlayMode } from "./MapView.tsx";
import { bundleModels, buildingEntities, dirtyPropChunks, loadProps, propsOf, propsSaveError, redoProps, revertProps, saveProps, setProps,
  undoProps, usePropsVersion } from "./props.ts";
import { CHUNK, CHUNK_TILES, SEASONS, TILE, flatTileFor, loadZoneMap, reloadLayers, tileAt, type ZoneMap } from "./terrain.ts";

const EVENTS_BUDGET = 2436;
const KINDS: EntityKind[] = ["npc", "proxy", "building", "trigger", "warp", "level"];
/** The undo history's name for a chunk's props, which aren't a document of the store. */
const PROPS = "props:";

/** The zone's events' packed size, as tools/data/event_data.py packs them. */
function eventsSize(data: JsonValue | null): number {
  if (!(data instanceof Map)) return 0;
  const e = toPlain(data) as Record<string, unknown[] | undefined> & { extra_padding?: number };
  const n = (k: string) => (e[k] ?? []).length;
  let init = 2;
  for (const s of (e.init_scripts ?? []) as { type: number; conditions?: unknown[] }[]) {
    init += 6;
    if (s.type === 1) init += 6 * (s.conditions?.length ?? 0) + 2;
  }
  init += -init & 3;
  return 8 + 20 * n("bg_events") + 36 * n("npcs") + 20 * n("warps") + 22 * n("triggers") + init + (e.extra_padding ?? 0);
}

/** The tile types the painter offers: walkable, blocked, and the common kinds, as the game's tile types write them. */
const PAINTS: { label: string; type: number }[] = [
  { label: "Walkable", type: 0x00000000 },
  { label: "Blocked", type: 0x00010000 },
  { label: "Grass (encounters)", type: 0x00040004 },
  { label: "Water", type: 0x00020014 },
  { label: "Sand", type: 0x0000000b },
];

export function OverworldEditor({ constants, open }: ToolProps) {
  const [world, setWorld] = useState<World | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [map, setMap] = useState<ZoneMap | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [layer, setLayer] = useState(0);
  const [season, setSeason] = useState(0);
  /** An entity to select once its zone is read: the warp another zone's warp leads to. */
  const [pending, setPending] = useState<{ kind: EntityKind; index: number } | null>(null);
  const [overlay, setOverlay] = useState<OverlayMode>("type");
  const [showModels, setShowModels] = useState(true);
  const [module, setModule] = useState<EntityKind>("npc");
  const [shown, setShown] = useState<Set<EntityKind>>(new Set(KINDS));
  const [selected, setSelected] = useState<{ kind: EntityKind; index: number } | null>(null);
  const [tile, setTile] = useState<{ x: number; z: number } | null>(null);
  const [painting, setPainting] = useState(false);
  const [preview, setPreview] = useState(false);
  const [overhead, setOverhead] = useState(false);
  const [paint, setPaint] = useState(0);
  /** What the painter sets: a tile type (PAINTS), or a flat height in tiles. */
  const [paintMode, setPaintMode] = useState<"type" | "height">("type");
  const [paintHeight, setPaintHeight] = useState(0);
  const [paintNote, setPaintNote] = useState<string | null>(null);
  /** The editor's edits in order, each the files it changed, for one undo over the events and the terrain; each zone
   * keeps its own, and its unsaved changes, while another is shown. */
  const histories = useRef(new Map<string, { undo: string[][]; redo: string[][] }>());
  const history = useRef<{ undo: string[][]; redo: string[][] }>({ undo: [], redo: [] });
  const record = useCallback((paths: string[]) => { history.current.undo.push(paths); history.current.redo = []; }, []);
  const [scriptOpen, setScriptOpen] = useState(false);
  const { docs } = useDocuments();
  const params = useToolParams("overworld");

  const eventsPath = zone ? `res/field/events/${zone}.json` : null;
  const { data, schema } = useHeld(eventsPath);
  const propsVersion = usePropsVersion();
  const [models, setModels] = useState<Map<number, string>>(new Map());
  useEffect(() => {
    setModels(new Map());
    if (!map) return;
    for (const c of map.chunks) loadProps(c.folder);
    if (map.propBundle) bundleModels(map.propBundle).then(setModels, () => setModels(new Map()));
  }, [map]);
  const entities = useMemo(() => [...entitiesOf(data), ...(map ? buildingEntities(map, models) : [])],
    // propsVersion: the chunks' props changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, map, models, propsVersion]);
  const visible = useMemo(() => entities.filter((e) => shown.has(e.kind)), [entities, shown]);
  const chosen = selected ? entities.find((e) => e.kind === selected.kind && e.index === selected.index) ?? null : null;
  const size = eventsSize(data);

  useEffect(() => { if (constants.size) loadWorld(constants).then(setWorld, () => setWorld(null)); }, [constants]);
  useEffect(() => { const z = params.get("zone"); if (z) setZone(z); }, [params]);
  useEffect(() => {
    if (!zone) return;
    setMap(null);
    setMapError(null);
    setSelected(null);
    setLayer(0);
    if (!histories.current.has(zone)) histories.current.set(zone, { undo: [], redo: [] });
    history.current = histories.current.get(zone)!;
  }, [zone]);
  // The zone's map in the season; a new season keeps the view until its map is read
  useEffect(() => {
    if (!zone || !constants.size) return;
    let live = true;
    loadZoneMap(zone, season, constants).then((m) => { if (live) setMap(m); }, (e: Error) => { if (live) setMapError(e.message); });
    return () => { live = false; };
  }, [zone, season, constants]);
  useEffect(() => {
    if (pending && entities.some((e) => e.kind === pending.kind && e.index === pending.index)) {
      setSelected(pending);
      setModule(pending.kind);
      setPending(null);
    }
  }, [pending, entities]);

  const zones = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (world?.zones ?? []).filter((z) => !q || z.name.includes(q.replace(/ /g, "_")) || String(z.number) === q);
  }, [world, filter]);
  const zoneInfo = zone ? world?.byName.get(zone) : undefined;
  const layers = Math.max(1, ...(map?.chunks.map((c) => c.layers.length) ?? [1]));

  const select = useCallback((e: Entity | null, t: { x: number; z: number } | null) => {
    setSelected(e ? { kind: e.kind, index: e.index } : null);
    if (e) setModule(e.kind);
    setTile(t);
  }, []);

  const move = useCallback((e: Entity, x: number, z: number, height: number) => {
    if (e.building) {
      // By whole tiles, keeping its place in the tile and its height
      const b = e.building;
      const list = propsOf(b.chunk).map((p, i) => (i === b.index ? { ...p, x: p.x + (x - e.x!) * TILE, z: p.z + (z - e.z!) * TILE } : p));
      setProps(b.chunk, list);
      record([PROPS + b.chunk]);
      return;
    }
    if (!eventsPath) return;
    // One step for undo: the position's fields at once
    const doc = documents.get(eventsPath);
    if (!(doc?.data instanceof Map)) return;
    const item = (doc.data.get(KIND_LISTS[e.kind]) as JsonValue[])[e.index] as Map<string, JsonValue>;
    const grid = new Map(item.get("grid") as Map<string, JsonValue>);
    for (const edit of positionEdits(e, x, z, height)) grid.set(String(edit.path[edit.path.length - 1]), edit.value);
    documents.edit(eventsPath, [KIND_LISTS[e.kind], e.index, "grid"], grid);
    record([eventsPath]);
  }, [eventsPath, record]);

  /** A new entity of the module's kind on a tile: the schema's defaults, then its place. */
  const [lastProp, setLastProp] = useState<number | null>(null);
  const add = useCallback((x: number, z: number, height: number) => {
    if (module === "building") {
      // The last prop chosen, or the bundle's first, at the tile's center
      const found = map ? tileAt(map, x, z, layer) : null;
      const id = lastProp ?? [...models.keys()].sort((a, b) => a - b)[0];
      if (!found || id === undefined) return;
      const c = found.chunk;
      const list = [...propsOf(c.folder), { id, x: (x - c.column * CHUNK_TILES) * TILE + TILE / 2 - CHUNK / 2, y: height,
                                              z: (z - c.row * CHUNK_TILES) * TILE + TILE / 2 - CHUNK / 2, angle: 0 }];
      setProps(c.folder, list);
      record([PROPS + c.folder]);
      // Buildings are numbered through the chunks in the map's order
      const before = map!.chunks.slice(0, map!.chunks.indexOf(c)).reduce((n, other) => n + propsOf(other.folder).length, 0);
      setSelected({ kind: "building", index: before + list.length - 1 });
      return;
    }
    if (!eventsPath || !schema || !(data instanceof Map) || module === "level") return;
    const list = KIND_LISTS[module];
    const itemSchema: Schema = schemaAt(schema, [list, 0]);
    const value = defaultFor(itemSchema, { root: schema, constants });
    const items = (data.get(list) as JsonValue[] | undefined) ?? [];
    if (value instanceof Map && module === "npc") {
      // A plain NPC: the next free ID, the zone's first NPC's model (or a townsperson's), standing still, facing down
      const ids = items.map((n) => Number((n as Map<string, JsonValue>).get("id") ?? 0));
      const first = items[0] instanceof Map ? (items[0] as Map<string, JsonValue>) : null;
      value.set("id", ids.length ? Math.max(...ids) + 1 : 0);
      value.set("model", typeof first?.get("model") === "string" ? first.get("model")! : "OBJ_CODE_291");
      value.set("movement", "MOVE_CODE_NONE");
      value.set("type", "ACTOR_EVENT_TYPE_NONE");
      value.set("flag", 0);
      value.set("script", 0);
      value.set("direction", "DIR_DOWN");
    }
    // Its place on the grid (not a rail), with each kind's grid fields as the events write them
    if (value instanceof Map) {
      value.delete("rail");
      const grid = (keys: string[]) => new Map<string, JsonValue>(keys.map((k) => [k, k === "width" || k === "height" ? 1 : 0]));
      const grids: Record<string, string[]> = {
        npc: ["x", "z", "y"], proxy: ["x", "y", "z"], trigger: ["x", "z", "width", "height", "y"], warp: ["x", "y", "z", "width", "height", "unk0a"],
      };
      value.set("grid", grid(grids[module]));
      if (module === "npc") {
        value.set("params", [0, 0, 0]);
        value.set("area", new Map<string, JsonValue>([["width", 0], ["height", 0]]));
      }
    }
    const entity: Entity = { kind: module, index: items.length, x, z, y: height, width: 1, depth: 1, label: "" };
    if (value instanceof Map) {
      const grid = value.get("grid") as Map<string, JsonValue>;
      for (const edit of positionEdits(entity, x, z, height)) grid.set(String(edit.path[edit.path.length - 1]), edit.value);
    }
    documents.edit(eventsPath, [list, items.length], value);
    record([eventsPath]);
    setSelected({ kind: module, index: items.length });
  }, [eventsPath, schema, data, module, constants, record, map, layer, lastProp, models]);

  const remove = () => {
    if (chosen?.building) {
      const b = chosen.building;
      setProps(b.chunk, propsOf(b.chunk).filter((_, i) => i !== b.index));
      record([PROPS + b.chunk]);
      setSelected(null);
      return;
    }
    if (!eventsPath || !chosen) return;
    // The others keep their IDs (scripts name NPCs by ID); only the later ones' places in the list move up
    documents.edit(eventsPath, [KIND_LISTS[chosen.kind], chosen.index], undefined);
    record([eventsPath]);
    setSelected(null);
  };

  /** Paints tiles' types or heights on the shown layer, in the chunks' collision CSVs: one undo step a stroke. */
  const onPaint = useCallback(async (tiles: { x: number; z: number }[]) => {
    if (!map) return;
    const flat = paintMode === "height" ? await flatTileFor(paintHeight * TILE) : null;
    setPaintNote(flat && Math.abs(flat.height - paintHeight * TILE) > 0.1
      ? `The game's height table has no ${paintHeight} tiles; painted the nearest, ${Math.round((flat.height / TILE) * 1000) / 1000}.` : null);
    const byFile = new Map<string, { chunk: (typeof map.chunks)[number]; cells: { x: number; z: number }[] }>();
    for (const t of tiles) {
      const found = tileAt(map, t.x, t.z, layer);
      if (!found) continue;
      const l = found.chunk.layers[Math.min(layer, found.chunk.layers.length - 1)];
      const entry = byFile.get(l.path) ?? { chunk: found.chunk, cells: [] };
      entry.cells.push({ x: t.x - found.chunk.column * 32, z: t.z - found.chunk.row * 32 });
      byFile.set(l.path, entry);
    }
    for (const [path, { chunk, cells }] of byFile) {
      const doc = await documents.hold(path);
      const lines = doc.text.split("\n");
      const head = lines[0].split(",");
      const col = (name: string) => head.indexOf(name);
      for (const c of cells) {
        const i = 1 + c.z * 32 + c.x;
        const parts = lines[i]?.split(",");
        if (!parts) continue;
        if (flat) {
          parts[col("shape")] = "0";
          parts[col("slope")] = String(flat.slope);
          parts[col("offset")] = String(flat.offset);
        } else {
          parts[col("tile_type")] = String(PAINTS[paint].type);
        }
        lines[i] = parts.join(",");
      }
      documents.editText(path, lines.join("\n"));
      // The view reads the edited text back
      await reloadLayersFromDocs(chunk);
    }
    if (byFile.size) record([...byFile.keys()]);
    setMap({ ...map });
  }, [map, layer, paint, paintMode, paintHeight, record]);

  /** Undoes or redoes the editor's last edit, in every file it changed; the terrain is read again after. */
  const step = useCallback(async (redo: boolean) => {
    const h = history.current;
    const from = redo ? h.redo : h.undo;
    // Edits from elsewhere (the form's own fields) are the events file's
    const paths = from.pop() ?? (eventsPath ? [eventsPath] : []);
    (redo ? h.undo : h.redo).push(paths);
    for (const p of paths) {
      if (p.startsWith(PROPS)) { if (redo) redoProps(p.slice(PROPS.length)); else undoProps(p.slice(PROPS.length)); }
      else if (redo) documents.redo(p);
      else documents.undo(p);
    }
    if (map && paths.some((p) => p.endsWith(".csv"))) {
      for (const chunk of map.chunks) if (chunk.layers.some((l) => paths.includes(l.path))) await reloadLayersFromDocs(chunk);
      setMap({ ...map });
    }
  }, [eventsPath, map]);

  const save = useCallback(async () => {
    for (const p of documents.dirtyPaths().filter((p) => p.startsWith("res/field/"))) await documents.save(p);
    for (const chunk of dirtyPropChunks()) await saveProps(chunk);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") { e.preventDefault(); e.stopPropagation(); save(); }
      else if ((key === "z" || key === "y") && eventsPath && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault(); e.stopPropagation();
        step(key === "y" || e.shiftKey);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [save, eventsPath, step]);

  const unsavedDocs = [...docs.values()].filter((d) => d.dirty && d.path.startsWith("res/field/"));
  const unsavedProps = dirtyPropChunks();
  const unsaved = [...unsavedDocs.map((d) => ({ path: d.path, saveError: d.saveError })),
                   ...unsavedProps.map((c) => ({ path: `${c}/model.glb`, saveError: propsSaveError(c) }))];
  const onTile = tile ? entities.filter((e) => e.x !== null && e.z !== null && tile.x >= e.x && tile.x < e.x + e.width && tile.z >= e.z && tile.z < e.z + e.depth) : [];
  const script = world && chosen?.script ? resolveScript(world, zoneInfo, chosen.script) : null;
  const chosenHere = chosen && chosen.x !== null && chosen.z !== null
    ? entities.filter((e) => e !== chosen && e.x !== null && e.z !== null && chosen.x! >= e.x && chosen.x! < e.x + e.width && chosen.z! >= e.z && chosen.z! < e.z + e.depth)
    : [];
  const fields = useMemo(() => (chosen ? entityFields(chosen.kind, () => setScriptOpen(true)) : undefined), [chosen?.kind]);
  const revert = async () => {
    for (const d of unsavedDocs) await documents.reload(d.path);
    revertProps();
    for (const h of histories.current.values()) { h.undo = []; h.redo = []; }
    if (map) {
      for (const chunk of map.chunks) await reloadLayersFromDocs(chunk);
      setMap({ ...map });
    }
  };

  return (
    <div className="ow-editor">
      <header className="ow-header">
        <h2>Overworld Editor</h2>
        {zone && <strong>{zoneLabel(zone)}</strong>}
        {zone && <LoadBar used={size} limit={EVENTS_BUDGET} />}
        <span className="spacer" />
        {unsaved.length > 0 && <span className="muted">{unsaved.length} unsaved</span>}
        <button onClick={revert} disabled={!unsaved.length}>Revert</button>
        <button className="primary" onClick={save} disabled={!unsaved.length} title="Ctrl+S">Save</button>
      </header>
      {size > EVENTS_BUDGET && (
        <div className="ow-error ow-bar">This zone's events take {size} bytes, past the {EVENTS_BUDGET} the game reads them into: the build
          refuses them (the game would freeze entering the zone). Remove {Math.ceil((size - EVENTS_BUDGET) / 36)} NPC(s), or other events.</div>
      )}
      {unsaved.filter((d) => d.saveError).map((d) => <div key={d.path} className="ow-error ow-bar">{d.path}: {d.saveError}</div>)}
      <div className="ow-body">
        <div className="ow-zones">
          <input className="filter" placeholder={`Filter ${world?.zones.length ?? 0} zones…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="ow-zone-list">
            {zones.map((z) => (
              <button key={z.name} className={`ow-zone${z.name === zone ? " selected" : ""}`} onClick={() => setZone(z.name)}>
                <span className="ow-number">{z.number}</span> {z.name}{docs.get(`res/field/events/${z.name}.json`)?.dirty ? " •" : ""}
              </button>
            ))}
          </div>
        </div>
        <div className="ow-center">
          {zone && (
            <div className="ow-toolbar">
              <div className="view-switch">
                {KINDS.map((k) => (
                  <button key={k} className={module === k ? "active" : ""} onClick={() => setModule(k)}
                          title={k === "level" ? "Level scripts have no place on the map" : `Shift+click a tile to add one`}>{KIND_NAMES[k]}</button>
                ))}
              </div>
              <label className="ow-check" title="Show this kind on the map"><input type="checkbox" checked={shown.has(module)}
                onChange={(e) => { const s = new Set(shown); if (e.target.checked) s.add(module); else s.delete(module); setShown(s); }} /> Shown</label>
              <label className="ow-inline">Tiles
                <select value={overlay} onChange={(e) => setOverlay(e.target.value as OverlayMode)}>
                  <option value="type">by type</option><option value="walk">walkable or not</option><option value="off">hidden</option>
                </select>
              </label>
              {layers > 1 && (
                <label className="ow-inline">Layer
                  <select value={layer} onChange={(e) => setLayer(Number(e.target.value))}>
                    {Array.from({ length: layers }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}
                  </select>
                </label>
              )}
              {map?.seasonal && (
                <label className="ow-inline" title="The zone's chunks and textures in a season, as the game replaces them; painting edits the chunks shown">Season
                  <select value={season} onChange={(e) => setSeason(Number(e.target.value))}>
                    {SEASONS.map((n, i) => <option key={i} value={i}>{n}</option>)}
                  </select>
                </label>
              )}
              <label className="ow-check" title="Straight down, without perspective, north up: the right or middle button pans, the wheel zooms">
                <input type="checkbox" checked={overhead} onChange={(e) => setOverhead(e.target.checked)} /> Overhead</label>
              <label className="ow-check"><input type="checkbox" checked={showModels} onChange={(e) => setShowModels(e.target.checked)} /> Models</label>
              <button className={preview ? "active" : ""} onClick={() => setPreview(!preview)}
                      title="The NPCs move as their move codes move them in game (at 30 frames a second, blocked as the game blocks them, without the player); their tiles stay marked">
                {preview ? "■ Stop" : "▶ Movement"}</button>
              <label className="ow-check" title="Drag over tiles to paint them"><input type="checkbox" checked={painting} onChange={(e) => setPainting(e.target.checked)} /> Paint</label>
              {painting && (
                <>
                  <select value={paintMode} onChange={(e) => setPaintMode(e.target.value as "type" | "height")}>
                    <option value="type">type</option><option value="height">height</option>
                  </select>
                  {paintMode === "type" ? (
                    <select value={paint} onChange={(e) => setPaint(Number(e.target.value))}>
                      {PAINTS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
                    </select>
                  ) : (
                    <label className="ow-inline" title="A flat tile at this height, in tiles (0.5 is half a tile)">
                      <WheelNumber value={paintHeight} step={0.5} onChange={setPaintHeight} /> tiles
                    </label>
                  )}
                </>
              )}
            </div>
          )}
          {painting && paintNote && <div className="ow-bar muted">{paintNote}</div>}
          <div className={`ow-map-wrap${painting ? " painting" : ""}`}>
            {!zone ? <p className="muted ow-empty">Choose a zone.</p>
              : mapError ? <p className="ow-error ow-empty">{mapError}</p>
              : !map ? <p className="muted ow-empty">Reading the map…</p>
              : <MapView map={map} entities={visible} selected={chosen} layer={layer} overlay={overlay} showModels={showModels}
                         painting={painting} preview={preview} overhead={overhead} paintType={paintMode === "type" ? PAINTS[paint].type : null}
                         onSelect={select} onMove={move} onAdd={add} onPaint={onPaint} />}
            {/* Over the map, so the map's view doesn't change when it opens */}
            {scriptOpen && chosen?.script !== undefined && (
              <div className="ow-script">
                <div className="ow-script-head">
                  <strong>Script {chosen.script}</strong>
                  {script ? (
                    <>
                      <span className="muted">{script.file.slice(script.file.lastIndexOf("/") + 1)}, entry {script.entry}</span>
                      <button className="link" onClick={() => navigate("scripts", { file: script.file, script: script.entry })}>open in the Script Editor</button>
                    </>
                  ) : <span className="muted">runs no script</span>}
                  <span className="spacer" />
                  <button className="icon" onClick={() => setScriptOpen(false)} title="Close">×</button>
                </div>
                {script && <ScriptEditor key={`${script.file}:${script.entry}`} file={script.file} script={script.entry} embedded constants={constants} open={open} />}
              </div>
            )}
          </div>
        </div>
        <div className="ow-side">
          {!zone ? null : chosen ? (
            <div className="ow-panel">
              <div className="ow-panel-head">
                <button onClick={() => setSelected(null)} title={`Back to the ${KIND_NAMES[chosen.kind]}`}>← {KIND_NAMES[chosen.kind]}</button>
                <strong>{chosen.label}</strong>
                {chosen.x !== null && <span className="muted"> at {chosen.x}, {chosen.z}</span>}
                <span className="spacer" />
                <button onClick={remove} title="Remove it (the others keep their IDs)">Remove</button>
              </div>
              {chosen.target && (
                <p className="ow-note">Leads to warp {chosen.target.warp} of{" "}
                  <button className="link" title="Show that zone, with the warp chosen; this zone's unsaved changes stay unsaved"
                          onClick={() => { setPending({ kind: "warp", index: chosen.target!.warp }); setZone(chosen.target!.zone); }}>
                    {zoneLabel(chosen.target.zone)}</button>
                </p>
              )}
              {chosenHere.length > 0 && (
                <p className="ow-note">Also on this tile: {chosenHere.map((e) => (
                  <button key={`${e.kind}${e.index}`} className="link" onClick={() => setSelected({ kind: e.kind, index: e.index })}>{e.label}{e.model ? ` (${e.model.replace(/^OBJ_CODE_/, "")})` : ""}</button>
                )).reduce<ReactNode[]>((a, b, i) => (i ? [...a, ", ", b] : [b]), [])}</p>
              )}
              {chosen.building ? (
                <BuildingPanel key={`${chosen.building.chunk}:${chosen.building.index}`} entity={chosen} models={models}
                               onChange={(p) => { setProps(chosen.building!.chunk, propsOf(chosen.building!.chunk).map((q, i) => (i === chosen.building!.index ? p : q)));
                                                  record([PROPS + chosen.building!.chunk]); setLastProp(p.id); }} />
              ) : eventsPath && <DocForm key={`${chosen.kind}:${chosen.index}`} path={eventsPath} at={[KIND_LISTS[chosen.kind], chosen.index]} constants={constants}
                                      hideDescription flat render={fields} onEdit={() => record([eventsPath])} />}
            </div>
          ) : (
            <div className="ow-panel">
              <p className="muted ow-note">
                Click an entity to edit it, drag it to another tile, or Shift+click a tile to add {module === "level" ? "one (not level scripts, which have no place)" : `a ${KIND_NAMES[module].toLowerCase().replace(/ies$/, "y").replace(/s$/, "")}`}.
                {tile && <> Tile {tile.x}, {tile.z}.</>}
              </p>
              <p className="muted ow-note">A save made on a map keeps its NPCs as they were: after a build, leave the map and come back to see the changes.</p>
              {onTile.length > 1 && <p className="ow-note">On this tile: {onTile.map((e) => (
                <button key={`${e.kind}${e.index}`} className="link" onClick={() => setSelected({ kind: e.kind, index: e.index })}>{e.label} </button>
              ))}</p>}
              <h4>{KIND_NAMES[module]} <span className="muted">{entities.filter((e) => e.kind === module).length}</span></h4>
              <div className="ow-list">
                {entities.filter((e) => e.kind === module).map((e) => (
                  <button key={e.index} className="ow-item" onClick={() => setSelected({ kind: e.kind, index: e.index })}>
                    {e.label}{e.model ? <span className="muted"> {e.model.replace(/^OBJ_CODE_/, "")}</span> : null}
                    {e.x !== null ? <span className="muted"> · {e.x}, {e.z}</span> : <span className="muted"> · no place</span>}
                  </button>
                ))}
              </div>
              {eventsPath && <p className="ow-note"><button className="link" onClick={() => open(eventsPath)}>Open the events file</button></p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A chunk's layers again from the painter's edited text (still unsaved, so from the document store). */
async function reloadLayersFromDocs(chunk: Parameters<typeof reloadLayers>[0]) {
  await reloadLayers(chunk, (path) => documents.get(path)?.text ?? null);
}

/** A number box that the mouse wheel steps while the pointer is over it (only here: the painter's height, in a bar
 * that doesn't scroll). */
function WheelNumber({ value, step, onChange }: { value: number; step: number; onChange(v: number): void }) {
  const ref = useRef<HTMLInputElement>(null);
  const current = useRef(value);
  current.current = value;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Not passive, so the wheel doesn't also scroll or zoom the page
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      onChange(Math.round((current.current + (e.deltaY < 0 ? step : -step)) / step) * step);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [step, onChange]);
  return <input ref={ref} type="number" step={step} className="ow-height" value={value} title="Scroll over it to step by half a tile"
                onChange={(e) => onChange(Number(e.target.value))} />;
}

/** How full the zone's events buffer is: green under 80%, yellow from 80%, red past it. */
function LoadBar({ used, limit }: { used: number; limit: number }) {
  const share = used / limit;
  const level = share > 1 ? "over" : share >= 0.8 ? "near" : "ok";
  return (
    <span className={`ow-load ${level}`} title={`The zone's events, packed, take ${used} of the ${limit} bytes the game reads them into; past it the game freezes on entry. An NPC takes 36 bytes, a proxy and a warp 20, a trigger 22.`}>
      <span className="ow-load-bar"><span className="ow-load-fill" style={{ width: `${Math.min(100, share * 100)}%` }} /></span>
      <span className="ow-load-text">{used} / {limit} bytes · {Math.round(share * 100)}%</span>
    </span>
  );
}
