// The Overworld Editor (docs/paperwhite2/design/overworld-editor.md): a zone's map in 3D with its collision tiles, and
// what is placed on it: NPCs, proxies (background events), triggers, warps and level scripts, from the zone's events
// (res/field/events/<zone>.json). Click to choose, drag to move to another tile, Shift+click a tile to add one of the
// shown module's kind, and edit its fields beside the map; its script opens below the map. A permissions painter sets
// tiles' types in the chunks' collision. The size of the zone's events is checked against the field's buffer (2,436
// bytes, docs/paperwhite2/design/npc-research.md). Instances, ambients and groups come with the engine's next phase.

import { useCallback, useEffect, useMemo, useState } from "react";
import { documents, useDocuments } from "../../documents.ts";
import { toPlain, type JsonValue } from "../../../shared/json.ts";
import type { Schema } from "../../../shared/schema.ts";
import type { ToolProps } from "../types.ts";
import { navigate, useToolParams } from "../../navigation.ts";
import { DocForm, schemaAt, useHeld } from "../followers/DocForm.tsx";
import { defaultFor } from "../schema-form/form.tsx";
import { ScriptEditor } from "../scripts/ScriptEditor.tsx";
import { loadWorld, scriptFileOf, zoneLabel, type World } from "../world/world.ts";
import { KIND_LISTS, KIND_NAMES, entitiesOf, positionEdits, type Entity, type EntityKind } from "./entities.ts";
import { MapView, type OverlayMode } from "./MapView.tsx";
import { loadZoneMap, reloadLayers, tileAt, type ZoneMap } from "./terrain.ts";

const EVENTS_BUDGET = 2436;
const KINDS: EntityKind[] = ["npc", "proxy", "trigger", "warp", "level"];

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
  const [overlay, setOverlay] = useState<OverlayMode>("type");
  const [showModels, setShowModels] = useState(true);
  const [module, setModule] = useState<EntityKind>("npc");
  const [shown, setShown] = useState<Set<EntityKind>>(new Set(KINDS));
  const [selected, setSelected] = useState<{ kind: EntityKind; index: number } | null>(null);
  const [tile, setTile] = useState<{ x: number; z: number } | null>(null);
  const [painting, setPainting] = useState(false);
  const [paint, setPaint] = useState(0);
  const [scriptOpen, setScriptOpen] = useState(false);
  const { docs } = useDocuments();
  const params = useToolParams("overworld");

  const eventsPath = zone ? `res/field/events/${zone}.json` : null;
  const { data, schema } = useHeld(eventsPath);
  const entities = useMemo(() => entitiesOf(data), [data]);
  const visible = entities.filter((e) => shown.has(e.kind));
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
    loadZoneMap(zone).then(setMap, (e: Error) => setMapError(e.message));
  }, [zone]);

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
    if (!eventsPath) return;
    for (const edit of positionEdits(e, x, z, height)) documents.edit(eventsPath, edit.path, edit.value);
  }, [eventsPath]);

  /** A new entity of the module's kind on a tile: the schema's defaults, then its place. */
  const add = useCallback((x: number, z: number, height: number) => {
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
    documents.edit(eventsPath, [list, items.length], value);
    const entity: Entity = { kind: module, index: items.length, x, z, y: height, width: 1, depth: 1, label: "" };
    for (const edit of positionEdits(entity, x, z, height)) documents.edit(eventsPath, edit.path, edit.value);
    setSelected({ kind: module, index: items.length });
  }, [eventsPath, schema, data, module, constants]);

  const remove = () => {
    if (!eventsPath || !chosen) return;
    documents.edit(eventsPath, [KIND_LISTS[chosen.kind], chosen.index], undefined);
    setSelected(null);
  };

  /** Paints tiles' types on the shown layer, in the chunks' collision CSVs. */
  const onPaint = useCallback(async (tiles: { x: number; z: number }[]) => {
    if (!map) return;
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
      const col = head.indexOf("tile_type");
      for (const c of cells) {
        const i = 1 + c.z * 32 + c.x;
        const parts = lines[i]?.split(",");
        if (!parts) continue;
        parts[col] = String(PAINTS[paint].type);
        lines[i] = parts.join(",");
      }
      documents.editText(path, lines.join("\n"));
      // The view reads the edited text back
      await reloadLayersFromDocs(chunk);
    }
    setMap({ ...map });
  }, [map, layer, paint]);

  const save = useCallback(async () => {
    for (const p of documents.dirtyPaths().filter((p) => p.startsWith("res/field/"))) await documents.save(p);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") { e.preventDefault(); e.stopPropagation(); save(); }
      else if ((key === "z" || key === "y") && eventsPath && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault(); e.stopPropagation();
        if (key === "y" || e.shiftKey) documents.redo(eventsPath); else documents.undo(eventsPath);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [save, eventsPath]);

  const unsaved = [...docs.values()].filter((d) => d.dirty && d.path.startsWith("res/field/"));
  const onTile = tile ? entities.filter((e) => e.x !== null && e.z !== null && tile.x >= e.x && tile.x < e.x + e.width && tile.z >= e.z && tile.z < e.z + e.depth) : [];
  const scriptFile = zoneInfo?.scripts ? scriptFileOf(zoneInfo.scripts) : null;

  return (
    <div className="ow-editor">
      <header className="ow-header">
        <h2>Overworld Editor</h2>
        {zone && <strong>{zoneLabel(zone)}</strong>}
        {zone && <span className={`ow-budget${size > EVENTS_BUDGET ? " over" : size > EVENTS_BUDGET * 0.9 ? " near" : ""}`}
                       title="The zone's events, packed, against the field's buffer for them; past it the game freezes on entry">
          {size} / {EVENTS_BUDGET} bytes</span>}
        <span className="spacer" />
        {unsaved.length > 0 && <span className="muted">{unsaved.length} unsaved</span>}
        <button onClick={() => unsaved.forEach((d) => documents.reload(d.path))} disabled={!unsaved.length}>Revert</button>
        <button className="primary" onClick={save} disabled={!unsaved.length} title="Ctrl+S">Save</button>
      </header>
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
              <label className="ow-check"><input type="checkbox" checked={showModels} onChange={(e) => setShowModels(e.target.checked)} /> Models</label>
              <label className="ow-check" title="Drag over tiles to paint them"><input type="checkbox" checked={painting} onChange={(e) => setPainting(e.target.checked)} /> Paint</label>
              {painting && (
                <select value={paint} onChange={(e) => setPaint(Number(e.target.value))}>
                  {PAINTS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
                </select>
              )}
            </div>
          )}
          <div className="ow-map-wrap">
            {!zone ? <p className="muted ow-empty">Choose a zone.</p>
              : mapError ? <p className="ow-error ow-empty">{mapError}</p>
              : !map ? <p className="muted ow-empty">Reading the map…</p>
              : <MapView map={map} entities={visible} selected={chosen} layer={layer} overlay={overlay} showModels={showModels}
                         painting={painting} onSelect={select} onMove={move} onAdd={add} onPaint={onPaint} />}
          </div>
          {scriptOpen && scriptFile && chosen?.script !== undefined && (
            <div className="ow-script">
              <div className="ow-script-head">
                <strong>Script {chosen.script}</strong>
                <button className="link" onClick={() => navigate("scripts", { file: scriptFile, script: chosen.script! })}>open in the Script Editor</button>
                <span className="spacer" />
                <button className="icon" onClick={() => setScriptOpen(false)}>×</button>
              </div>
              <ScriptEditor file={chosen.script! >= 1 && chosen.script! < 2000 ? scriptFile : undefined} script={chosen.script} embedded constants={constants} open={open} />
            </div>
          )}
        </div>
        <div className="ow-side">
          {!zone ? null : chosen ? (
            <div className="ow-panel">
              <div className="ow-panel-head">
                <strong>{chosen.label}</strong>
                {chosen.x !== null && <span className="muted"> at {chosen.x}, {chosen.z}</span>}
                <span className="spacer" />
                {chosen.script !== undefined && chosen.script > 0 && scriptFile && (
                  <button onClick={() => setScriptOpen(true)} title="Its script below the map">Script</button>
                )}
                <button onClick={remove} title="Remove it">Remove</button>
              </div>
              {eventsPath && <DocForm key={`${chosen.kind}:${chosen.index}`} path={eventsPath} at={[KIND_LISTS[chosen.kind], chosen.index]} constants={constants} hideDescription />}
            </div>
          ) : (
            <div className="ow-panel">
              <p className="muted ow-note">
                Click an entity to edit it, drag it to another tile, or Shift+click a tile to add {module === "level" ? "one (not level scripts, which have no place)" : `a ${KIND_NAMES[module].toLowerCase().replace(/ies$/, "y").replace(/s$/, "")}`}.
                {tile && <> Tile {tile.x}, {tile.z}.</>}
              </p>
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
