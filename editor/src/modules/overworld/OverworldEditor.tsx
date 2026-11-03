// The Overworld Editor (docs/paperwhite2/design/overworld-editor.md): a zone's map in 3D with its collision tiles, and
// what is placed on it: NPCs, proxies (background events), triggers, warps and level scripts, from the zone's events
// (res/field/events/<zone>.json). Click to choose, drag to move to another tile, Shift+click a tile to add one of the
// shown module's kind, and edit its fields beside the map; its script opens below the map. A permissions painter sets
// tiles' types and heights in the chunks' collision. One undo history covers the events and the terrain. The size of the zone's events is checked against the field's buffer (2,436
// bytes, docs/paperwhite2/design/npc-research.md). Instances, ambients and groups come with the engine's next phase.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { currentText, documents, useDocuments, useFileEpoch } from "../../documents.ts";
import { fromPlain, toPlain, type JsonValue } from "../../../shared/json.ts";
import type { Schema } from "../../../shared/schema.ts";
import type { ToolProps } from "../types.ts";
import { navigate, useToolParams } from "../../navigation.ts";
import { DocForm, schemaAt, useHeld } from "../followers/DocForm.tsx";
import { defaultFor, type FormContext } from "../schema-form/form.tsx";
import { ScriptEditor } from "../scripts/ScriptEditor.tsx";
import { loadWorld, resolveScript, zoneLabel, type World } from "../world/world.ts";
import { KIND_LISTS, KIND_NAMES, entitiesOf, positionEdits, railEdits, type Entity, type EntityKind } from "./entities.ts";
import { loadRails, oppositeRailDir, railDirOf, railEntities, railLevels, railToWorld, resizeAttributes, setRailTile, sidesAt,
  type RailMap, type RailPlace } from "./rails.ts";
import { RailPanel } from "./RailPanel.tsx";
import { CameraPanel } from "./CameraPanel.tsx";
import { InstancePanel, SpawnSection } from "./SpawnPanel.tsx";
import { AMBIENTS_MAX, AMBIENTS_SHOWN, RARE_LIKELY, SPRITE_CACHE_ORIGINAL, flagNumber, spriteCacheSize, preloadLists, seasonalOf, spriteLoad, type Seasonal, type SpriteLoad } from "./spriteLoad.ts";
import { SEASON_NAMES, TIME_NAMES, ambientEntities, spriteCodeOf, instanceEntities, newAmbient, previewPicks, spawnPath, type Ambient, type PreviewWorld,
  type SpawnEntry } from "./spawns.ts";
import { WEATHERS } from "../encounters/model.ts";
import { cameraEntities, cameraFileOf, circleCamera, defaultCamera, newRectArea, rectCamera, type CameraArea, type DefaultCamera,
  type ViewCamera } from "./cameras.ts";
import { api } from "../../api.ts";
import { entityFields } from "./fields.tsx";
import { AmbientPanel } from "./AmbientPanel.tsx";
import { OverworldGrid } from "../maps/OverworldGrid.tsx";
import { WildPanel } from "./WildPanel.tsx";
import { EventPanel, hasEventLayout } from "./EventPanel.tsx";
import { BuildingPanel } from "./BuildingPanel.tsx";
import { MapView, hasRect, type OverlayMode, type TileRect } from "./MapView.tsx";
import { amendProps, bundleModels, buildingEntities, dirtyPropChunks, loadProps, propsOf, propsSaveError, redoProps, revertProps, saveProps, setProps,
  undoProps, usePropsVersion } from "./props.ts";
import { SEASONS, TILE, flatTileFor, paintOver, loadZoneMap, reloadLayers, standingOn, tileAt, type ZoneMap } from "./terrain.ts";

const EVENTS_BUDGET = 2436;
const KINDS: EntityKind[] = ["npc", "proxy", "building", "rail", "trigger", "warp", "level", "camera", "ambient"];
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
  /** The zone's rails, for a zone without a grid. */
  const [rails, setRails] = useState<RailMap | null>(null);
  const [railLevel, setRailLevel] = useState<number | null>(null);
  const [ground, setGround] = useState<"both" | "grid" | "rails">("both");
  /** The zone's camera area file (or where a new one goes), its areas, the default cameras and the preview. */
  const [cameraFile, setCameraFile] = useState<{ path: string; exists: boolean } | null>(null);
  const [defaults, setDefaults] = useState<DefaultCamera[]>([]);
  const [zoneCamera, setZoneCamera] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [previewT, setPreviewT] = useState(0);
  const [previewDefault, setPreviewDefault] = useState(false);
  /** An NPC with spawn data being removed, while the editor asks what becomes of its condition and instances. */
  const [removing, setRemoving] = useState<{ index: number; npcId: number } | null>(null);
  const [moveToId, setMoveToId] = useState<number | null>(null);
  /** Drawing the chosen entity's rectangle on the map. */
  const [drawing, setDrawing] = useState(false);
  useEffect(() => {
    api.file("res/field/cameras/defaults.json").then((f) => setDefaults((JSON.parse(f.text) as { cameras: DefaultCamera[] }).cameras), () => setDefaults([]));
  }, []);
  /** The point a new line starts from, while the next point clicked ends it. */
  const [connecting, setConnecting] = useState<number | null>(null);
  const railsPath = rails ? `${rails.folder}/rails.json` : null;
  const railsName = rails ? rails.folder.slice(rails.folder.lastIndexOf("/") + 1) : null;
  useEffect(() => {
    setCameraFile(null);
    setPreviewing(false);
    setPreviewDefault(false);
    if (!zone) return;
    // Only the latest lookup counts: a zone change asks once with the last zone's rails still loaded, then again
    let live = true;
    cameraFileOf(zone, railsName).then((f) => { if (live) setCameraFile(f); }, () => { if (live) setCameraFile(null); });
    api.file(`res/field/zones/${zone}.json`).then((f) => { if (live) setZoneCamera(Number((JSON.parse(f.text) as { camera?: number }).camera ?? 0)); },
                                                   () => { if (live) setZoneCamera(0); });
    return () => { live = false; };
  }, [zone, railsName]);
  const { data: cameraData } = useHeld(cameraFile?.exists || (cameraFile && documents.get(cameraFile.path)) ? cameraFile.path : null);
  const cameraAreas = useMemo(() => (cameraData instanceof Map ? ((toPlain(cameraData) as { areas?: CameraArea[] }).areas ?? []) : null), [cameraData]);
  const { data: railsData } = useHeld(railsPath);
  // The rail file as the editor holds it, read again after each edit
  useEffect(() => {
    if (!zone || !railsData) return;
    let live = true;
    loadRails(zone, railSource).then((r) => { if (live && r) setRails(r); });
    return () => { live = false; };
  }, [railsData, zone]);
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
  /** A note on the last thing the editor couldn't do, shown in the side panel. */
  const [note, setNote] = useState<string | null>(null);
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
  // The zone's spawn file: its NPCs' conditions and instances (spawns.ts), held once it exists or is made
  const spawnFile = zone ? spawnPath(zone) : null;
  // (looked at again when it changes on disk: deleted, or back)
  const spawnEpoch = useFileEpoch(spawnFile);
  const [spawnExists, setSpawnExists] = useState(false);
  useEffect(() => {
    setSpawnExists(false);
    if (!spawnFile) return;
    let live = true;
    api.list(spawnFile).then((found) => { if (live) setSpawnExists(found.length > 0); }, () => undefined);
    return () => { live = false; };
  }, [spawnFile, spawnEpoch]);
  const { data: spawnData } = useHeld(spawnFile && (spawnExists || docs.get(spawnFile)) ? spawnFile : null);
  const spawnEntries = useMemo(() => (spawnData instanceof Map ? ((toPlain(spawnData) as { npcs?: SpawnEntry[] }).npcs ?? []) : []), [spawnData]);
  const ambients = useMemo(() => (spawnData instanceof Map ? ((toPlain(spawnData) as { ambients?: Ambient[] }).ambients ?? []) : []), [spawnData]);
  /** The zone's spawn file, made with the list at key if it has none yet. */
  const holdSpawnFile = useCallback((key: "npcs" | "ambients") => {
    if (!spawnFile) return;
    if (!documents.get(spawnFile)) {
      documents.create(spawnFile, "res/paperwhite2/overworld/overworld.schema.json", fromPlain({ $schema: "overworld.schema.json", [key]: [] }));
      setSpawnExists(true);
    }
  }, [spawnFile]);
  const entities = useMemo(() => {
    // A host (an NPC with instances) is drawn faded: its own fields are unused
    const hosts = new Set(spawnEntries.filter((e) => e.instances?.length).map((e) => e.id));
    const npcs = entitiesOf(data).map((e) => (e.kind === "npc" && hosts.has(e.npcId!) ? { ...e, host: true } : e));
    return [...npcs, ...instanceEntities(spawnEntries), ...ambientEntities(ambients), ...(map ? buildingEntities(map, models) : []),
            ...(rails ? railEntities(rails) : []), ...(cameraAreas ? cameraEntities(cameraAreas) : [])];
  },
    // propsVersion: the chunks' props changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, map, models, propsVersion, rails, cameraAreas, spawnEntries, ambients]);
  // The conditions preview: the world it checks against, and what it shows
  const [conditionsPreview, setConditionsPreview] = useState(false);
  const [previewTime, setPreviewTime] = useState<string>("day");
  const [previewWeather, setPreviewWeather] = useState("WEATHER_SUNNY");
  const [previewFlags, setPreviewFlags] = useState("");
  const [previewSeed, setPreviewSeed] = useState(1);
  const picks = useMemo(() => {
    if (!conditionsPreview || !zone) return null;
    const world: PreviewWorld = { season: SEASON_NAMES[season], time: previewTime, weather: previewWeather, zone, exterior: null, seed: previewSeed,
                                  flags: new Set(previewFlags.split(/[\s,]+/).filter(Boolean)) };
    return previewPicks(spawnEntries, world);
  }, [conditionsPreview, zone, season, previewTime, previewWeather, previewFlags, previewSeed, spawnEntries]);
  const visible = useMemo(() => entities.filter((e) => {
    if (!shown.has(e.kind === "instance" ? "npc" : e.kind)) return false;
    if (!picks) return true;
    // The preview shows what the game would: no NPC whose condition fails, a host as its pick
    if (e.kind === "npc") { const p = picks.get(e.npcId!); return !p || (p.shown && p.instance === null && !e.host); }
    if (e.kind === "instance") { const p = picks.get(e.spawn!.host); return !!p && p.shown && p.instance === e.spawn!.instance; }
    return true;
  }), [entities, shown, picks]);
  const chosen = selected ? entities.find((e) => e.kind === selected.kind && e.index === selected.index) ?? null : null;
  const size = eventsSize(data);
  // The sprites the zone can have loaded at once, in the worst case, against the sprite cache (spriteLoad.ts)
  const [npcCache, setNpcCache] = useState<number | null>(null);
  const [cacheSize, setCacheSize] = useState(SPRITE_CACHE_ORIGINAL);
  // The overworld's chunk map over the map view, as the Map Editor has it
  const [overworld, setOverworld] = useState(false);
  // The zone's wild Pokémon, for reference, over the map view
  const [wild, setWild] = useState(false);
  useEffect(() => { void spriteCacheSize().then(setCacheSize); }, []);
  // Whether the zone's scripts run 10852, the seasonal spawns, which the count works out (spriteLoad.ts)
  const [seasonal, setSeasonal] = useState<Seasonal>({ runs: false, night: false });
  useEffect(() => {
    if (!zone) return;
    let live = true;
    api.file(`res/field/zones/${zone}.json`).then(async (f) => {
      const header = JSON.parse(f.text) as { npc_cache?: number; scripts?: string };
      if (live) setNpcCache(Number(header.npc_cache ?? 255));
      const scripts = header.scripts?.replace(/^SCRIPTS_/, "").toLowerCase();
      const text = scripts ? await api.file(`res/field/scripts/${scripts}.s`).then((t) => t.text, () => "") : "";
      if (live) setSeasonal(seasonalOf(text));
    }, () => { if (live) setNpcCache(null); });
    return () => { live = false; };
  }, [zone]);
  const [sprites, setSprites] = useState<SpriteLoad | null>(null);
  useEffect(() => {
    if (!zone || npcCache === null) return;
    let live = true;
    const npcs = entities.filter((e) => e.kind === "npc");
    const records = data instanceof Map ? ((toPlain(data) as { npcs?: { id: number; flag?: unknown }[] }).npcs ?? []) : [];
    const flags = new Map(records.map((r) => [r.id, flagNumber(r.flag)]));
    preloadLists().then((lists) => spriteLoad(npcs, spawnEntries, ambients, lists[npcCache] ?? [], (id) => flags.get(id) ?? null, seasonal))
      .then((load) => { if (live) setSprites(load); }, () => { if (live) setSprites(null); });
    return () => { live = false; };
  }, [zone, npcCache, entities, spawnEntries, ambients, data, seasonal]);

  // The sprites the zone already has, which the ambients' sprite picker marks: its preloads, NPCs, instances and ambients
  const usedSprites = useMemo(() => new Set<string>([
    ...(sprites?.preloadedCodes ?? []),
    ...entities.filter((e) => e.kind === "npc").map((e) => e.model ?? ""),
    ...spawnEntries.flatMap((e) => e.instances?.map((i) => String(i.npc.model ?? "")) ?? []),
    ...ambients.flatMap((a) => (a.sprites ?? [a.sprite]).map((s) => String(spriteCodeOf(s)))),
  ].filter((m) => m.startsWith("OBJ_CODE_"))), [sprites, entities, spawnEntries, ambients]);

  useEffect(() => { if (constants.size) loadWorld(constants).then(setWorld, () => setWorld(null)); }, [constants]);
  useEffect(() => { const z = params.get("zone"); if (z) setZone(z); }, [params]);
  useEffect(() => {
    if (!zone) return;
    setMap(null);
    setMapError(null);
    setSelected(null);
    setLayer(0);
    setRails(null);
    setRailLevel(null);
    setGround("both");
    if (!histories.current.has(zone)) histories.current.set(zone, { undo: [], redo: [] });
    history.current = histories.current.get(zone)!;
  }, [zone]);
  // The zone's map in the season; a new season keeps the view until its map is read
  useEffect(() => {
    if (!zone || !constants.size) return;
    let live = true;
    loadZoneMap(zone, season, constants).then((m) => { if (live) setMap(m); }, (e: Error) => { if (live) setMapError(e.message); });
    loadRails(zone, railSource).then((r) => { if (live) setRails(r); }, () => { if (live) setRails(null); });
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
    setDrawing(false);
    if (connecting !== null && e?.railPart?.type === "point" && e.railPart.index !== connecting) {
      connect(connecting, e.railPart.index);
      setConnecting(null);
      return;
    }
    setSelected(e ? { kind: e.kind, index: e.index } : null);
    if (e) setModule(e.kind);
    setTile(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connecting, rails, railsPath]);

  /** An entity's rectangle of tiles moved, resized or drawn: a trigger's or a warp's grid (its height the first tile's),
   * a camera rect's tiles in the way it blends. One step for undo. */
  const onRect = useCallback((e: Entity, r: TileRect) => {
    setDrawing(false);
    const height = map ? tileAt(map, r.x, r.z, layer)?.height ?? 0 : 0;
    if (e.kind === "camera" && cameraFile?.path) {
      const area = cameraAreas?.[e.index]?.rect;
      if (!area) return;
      const alongX = area.width === 1;
      const next = alongX ? { ...area, x: r.x, z: r.z, width: 1, height: r.width, unk06: r.depth }
        : { ...area, x: r.x, z: r.z, width: Math.max(2, r.width), height: r.depth, unk06: area.unk06 };
      documents.edit(cameraFile.path, ["areas", e.index, "rect"], fromPlain(next));
      record([cameraFile.path]);
      return;
    }
    if (!eventsPath || (e.kind !== "trigger" && e.kind !== "warp")) return;
    const doc = documents.get(eventsPath);
    if (!(doc?.data instanceof Map)) return;
    const item = (doc.data.get(KIND_LISTS[e.kind]) as JsonValue[])[e.index] as Map<string, JsonValue>;
    const grid = new Map(item.get("grid") as Map<string, JsonValue>);
    for (const edit of positionEdits(e, r.x, r.z, height)) grid.set(String(edit.path[edit.path.length - 1]), edit.value);
    grid.set("width", r.width);
    grid.set("height", r.depth);
    documents.edit(eventsPath, [KIND_LISTS[e.kind], e.index, "grid"], grid);
    record([eventsPath]);
  }, [map, layer, cameraFile, cameraAreas, eventsPath, record]);

  /** A rail point moved to a spot at its height, in units. */
  const moveRailPoint = useCallback((index: number, x: number, z: number) => {
    if (!railsPath || !rails) return;
    const p = rails.points[index];
    documents.edit(railsPath, ["points", index, "pos"], [x * 4096, p.pos[1], z * 4096]);
    record([railsPath]);
  }, [railsPath, rails, record]);

  /** A new line from one point to another: its direction from their spots, a free slot at each end, a straight curve,
   * the length its shape measures, and attributes copied from the start point's first line (or walkable). */
  function connect(a: number, b: number) {
    if (!railsPath || !rails) return;
    const doc = documents.get(railsPath);
    if (!(doc?.data instanceof Map)) return;
    const pa = rails.points[a], pb = rails.points[b];
    const slotA = pa.lines.indexOf(65535), slotB = pb.lines.indexOf(65535);
    if (slotA < 0 || slotB < 0) { setNote("A point has four line slots, and one of these has none free."); return; }
    const dir = railDirOf(pb.pos[0] - pa.pos[0], pb.pos[2] - pa.pos[2]);
    const lineIndex = rails.lines.length, curveIndex = rails.curves.length;
    const width = pa.widths[slotA] || 32;
    const length = Math.max(1, Math.round(Math.hypot(pb.pos[0] - pa.pos[0], pb.pos[1] - pa.pos[1], pb.pos[2] - pa.pos[2]) / 4096 / 16));
    const plain = toPlain(doc.data) as { points: Record<string, unknown>[]; lines: unknown[]; curves: unknown[] };
    const setSlot = (p: number, slot: number, d: number) => {
      const point = plain.points[p] as { lines: number[]; dirs: number[]; widths: number[] };
      point.lines[slot] = lineIndex;
      point.dirs[slot] = d;
      point.widths[slot] = width;
    };
    setSlot(a, slotA, dir);
    setSlot(b, slotB, oppositeRailDir(dir));
    plain.curves.push({ handler: 0, center: [0, 0, 0] });
    plain.lines.push({ name: `RE_LINE_${lineIndex}`, point_a: a, point_b: b, dir, curve: curveIndex, camera: pa.camera, length });
    documents.replace(railsPath, fromPlain(plain));
    // Its attributes: the start point's first line's middle column, or walkable rail tiles
    const csv = `${rails.folder}/attributes/line_${String(lineIndex).padStart(2, "0")}.csv`;
    const first = pa.lines.find((l) => l !== 65535 && l !== lineIndex);
    const sample = first !== undefined ? rails.attributes[first]?.rows[0] : undefined;
    const value = sample ? `0x${(sample[Math.floor(sample.length / 2)] >>> 0).toString(16).padStart(8, "0")}` : "0x00800000";
    const columns = 2 * Math.floor(width / 16) + 1;
    if (!documents.get(csv)) documents.create(csv, null, null);
    documents.editText(csv, Array.from({ length }, () => Array(columns).fill(value).join(",")).join("\n") + "\n");
    record([railsPath, csv]);
    setSelected({ kind: "rail", index: rails.points.length + lineIndex });
  }

  /** A line's length set, its attributes resized to it. */
  const fitLength = useCallback(async (line: number, length: number) => {
    if (!railsPath || !rails) return;
    const csv = rails.attributes[line]?.path;
    documents.edit(railsPath, ["lines", line, "length"], length);
    if (csv) {
      const doc = await documents.hold(csv);
      documents.editText(csv, resizeAttributes(currentText(doc), length));
    }
    record(csv ? [railsPath, csv] : [railsPath]);
  }, [railsPath, rails, record]);

  /** An entity moved along the rails: its line, front and side, one step for undo. */
  const moveRail = useCallback((e: Entity, place: RailPlace) => {
    if (e.kind === "instance" && spawnFile) {
      const s = e.spawn!;
      const at = ["npcs", s.entry, "instances", s.instance, "npc", "rail"];
      const rail = new Map<string, JsonValue>([["component", place.line], ["front", place.front], ["side", place.side]]);
      documents.edit(spawnFile, at, rail);
      record([spawnFile]);
      return;
    }
    const doc = eventsPath ? documents.get(eventsPath) : undefined;
    if (!eventsPath || !(doc?.data instanceof Map)) return;
    const item = (doc.data.get(KIND_LISTS[e.kind]) as JsonValue[])[e.index] as Map<string, JsonValue>;
    const rail = new Map(item.get("rail") as Map<string, JsonValue>);
    for (const edit of railEdits(e, place)) rail.set(String(edit.path[edit.path.length - 1]), edit.value);
    documents.edit(eventsPath, [KIND_LISTS[e.kind], e.index, "rail"], rail);
    record([eventsPath]);
  }, [eventsPath, record]);

  const move = useCallback((e: Entity, x: number, z: number, height: number) => {
    if (e.kind === "ambient" && spawnFile) {
      // To another tile, keeping its height over the ground it stood on
      const a = ambients[e.index];
      if (!a) return;
      const ground = map ? standingOn(map, a.x, a.z, a.y)?.height : undefined;
      const over = ground !== undefined ? a.y - ground : 16;
      documents.edit(spawnFile, ["ambients", e.index], fromPlain({ ...a, x, z, y: Math.round(height + over) }));
      record([spawnFile]);
      return;
    }
    if (e.kind === "instance" && spawnFile) {
      // An instance's record, in the spawn file
      const s = e.spawn!;
      const at = ["npcs", s.entry, "instances", s.instance, "npc"];
      const doc = documents.get(spawnFile);
      if (!(doc?.data instanceof Map)) return;
      let item: JsonValue | undefined = doc.data;
      for (const k of at) item = item instanceof Map ? item.get(String(k)) : Array.isArray(item) ? item[k as number] : undefined;
      if (!(item instanceof Map)) return;
      const grid = new Map(item.get("grid") as Map<string, JsonValue>);
      for (const edit of positionEdits({ ...e, kind: "npc" }, x, z, height)) grid.set(String(edit.path[edit.path.length - 1]), edit.value);
      documents.edit(spawnFile, [...at, "grid"], grid);
      record([spawnFile]);
      return;
    }
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
  }, [eventsPath, record, spawnFile, ambients, map]);

  /** A new entity of the module's kind on a tile: the schema's defaults, then its place. */
  const [lastProp, setLastProp] = useState<number | null>(null);
  const add = useCallback((x: number, z: number, height: number, onRail?: RailPlace) => {
    if (module === "ambient") {
      if (!spawnFile) return;
      if (ambients.length >= AMBIENTS_MAX) { setNote(`A zone has at most ${AMBIENTS_MAX} ambients.`); return; }
      holdSpawnFile("ambients");
      documents.edit(spawnFile, ["ambients"], fromPlain([...ambients, newAmbient(x, z, height, ambients.length)]));
      record([spawnFile]);
      setSelected({ kind: "ambient", index: ambients.length });
      return;
    }
    if (module === "camera") {
      // A rect of 4 by 4 tiles from the tile, the zone's default camera at both ends; the zone's file is made if it has none
      if (!cameraFile?.path || rails) { setNote(rails ? "Camera areas on rails are circles: edit the rail map's area, or ask for new ones to be added." : "No camera file for this zone."); return; }
      const area = newRectArea(x, z, defaults[zoneCamera]);
      const existing = documents.get(cameraFile.path);
      if (!existing) {
        void (async () => {
          const ref = await api.file("res/field/cameras/areas/aspertia_city.json");
          documents.create(cameraFile.path, ref.schema, fromPlain({ $schema: "../cameras.schema.json", zones: [`ZONE_${zone!.toUpperCase()}`], areas: [area] }));
          const order = "res/field/cameras/order.json";
          const doc = await documents.hold(order);
          const areas = (doc.data instanceof Map ? (doc.data.get("areas") as JsonValue[]) : []) ?? [];
          documents.edit(order, ["areas", areas.length], zone!);
          record([cameraFile.path, order]);
          setCameraFile({ ...cameraFile, exists: true });
          setSelected({ kind: "camera", index: 0 });
        })();
        return;
      }
      const list = existing.data instanceof Map ? ((existing.data.get("areas") as JsonValue[] | undefined) ?? []) : [];
      documents.edit(cameraFile.path, ["areas", list.length], fromPlain(area));
      record([cameraFile.path]);
      setSelected({ kind: "camera", index: list.length });
      return;
    }
    if (module === "rail") {
      // A point where the tile (or rail tile) is, its lines and camera to come
      if (!railsPath || !rails) return;
      const doc = documents.get(railsPath);
      if (!(doc?.data instanceof Map)) return;
      const spot = onRail ? railToWorld(rails, onRail.line, onRail.front, onRail.side) : [x * TILE + TILE / 2, height, z * TILE + TILE / 2];
      if (!spot) return;
      const plain = toPlain(doc.data) as { points: unknown[] };
      const index = plain.points.length;
      plain.points.push({ name: `RE_POINT_${index}`, lines: [65535, 65535, 65535, 65535], dirs: [0, 0, 0, 0], widths: [32, 32, 32, 32],
                          pos: spot.map((v) => Math.round(v * 4096)), camera: rails.points[0]?.camera ?? 0 });
      documents.replace(railsPath, fromPlain(plain));
      record([railsPath]);
      setSelected({ kind: "rail", index });
      return;
    }
    if (module === "building") {
      // The last prop chosen, or the bundle's first, at the tile's center
      const found = map ? tileAt(map, x, z, layer) : null;
      const id = lastProp ?? [...models.keys()].sort((a, b) => a - b)[0];
      if (!found || id === undefined) return;
      const c = found.chunk;
      const n = map!.chunkTiles, half = map!.chunkSize / 2;
      const list = [...propsOf(c.folder), { id, x: (x - c.column * n) * TILE + TILE / 2 - half, y: height,
                                              z: (z - c.row * n) * TILE + TILE / 2 - half, angle: 0 }];
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
    // On a rail: its place there, with each kind's rail fields as the events write them
    if (value instanceof Map && onRail) {
      value.delete("grid");
      const rail = new Map<string, JsonValue>([["component", onRail.line], ["front", onRail.front], ["side", onRail.side]]);
      if (module === "warp" || module === "trigger") { rail.set("front_span", 1); rail.set("side_span", 1); }
      if (module === "warp") rail.set("param", 0);
      value.set("rail", rail);
      if (module === "npc") {
        value.set("params", [0, 0, 0]);
        value.set("area", new Map<string, JsonValue>([["width", 0], ["height", 0]]));
        value.set("movement", "MOVE_CODE_RAIL_STAY");
      }
      documents.edit(eventsPath, [list, items.length], value);
      record([eventsPath]);
      setSelected({ kind: module, index: items.length });
      return;
    }
    // Its place on the grid, with each kind's grid fields as the events write them
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
  }, [eventsPath, schema, data, module, constants, record, map, layer, lastProp, models, rails, railsPath, cameraFile, defaults, zoneCamera, zone,
      ambients, spawnFile, holdSpawnFile]);

  const remove = () => {
    if (chosen?.kind === "ambient" && spawnFile) {
      documents.edit(spawnFile, ["ambients"], fromPlain(ambients.filter((_, i) => i !== chosen.index)));
      record([spawnFile]);
      setSelected(null);
      return;
    }
    if (chosen?.kind === "instance" && spawnFile) {
      const s = chosen.spawn!;
      const list = spawnEntries.map((e) => ({ ...e }));
      list[s.entry] = { ...list[s.entry], instances: (list[s.entry].instances ?? []).filter((_, k) => k !== s.instance) };
      if (!list[s.entry].instances!.length) delete list[s.entry].instances;
      documents.edit(spawnFile, ["npcs"], fromPlain(list.filter((e) => e.when || e.instances?.length)));
      record([spawnFile]);
      setSelected(null);
      return;
    }
    if (chosen?.kind === "camera" && cameraFile?.path) {
      documents.edit(cameraFile.path, ["areas", chosen.index], undefined);
      record([cameraFile.path]);
      setSelected(null);
      setPreviewing(false);
      return;
    }
    if (chosen?.railPart && railsPath && rails) {
      const { type, index } = chosen.railPart;
      const doc = documents.get(railsPath);
      if (!(doc?.data instanceof Map)) return;
      const plain = toPlain(doc.data) as { points: { lines: number[]; dirs: number[] }[]; lines: { curve: number }[]; curves: unknown[] };
      if (type === "point") {
        if (index !== plain.points.length - 1 || plain.points[index].lines.some((l) => l !== 65535)) {
          setNote("Only the last point, with no lines, can be removed: the lines and the events name points by number.");
          return;
        }
        plain.points.pop();
      } else {
        if (index !== plain.lines.length - 1) { setNote("Only the last line can be removed: the events and attribute files name lines by number."); return; }
        const [removed] = plain.lines.splice(index, 1);
        if (removed.curve === plain.curves.length - 1 && !plain.lines.some((l) => l.curve === removed.curve)) plain.curves.pop();
        for (const p of plain.points) p.lines.forEach((l, k) => { if (l === index) { p.lines[k] = 65535; p.dirs[k] = 0; } });
      }
      documents.replace(railsPath, fromPlain(plain));
      record([railsPath]);
      setSelected(null);
      return;
    }
    if (chosen?.building) {
      const b = chosen.building;
      setProps(b.chunk, propsOf(b.chunk).filter((_, i) => i !== b.index));
      record([PROPS + b.chunk]);
      setSelected(null);
      return;
    }
    if (!eventsPath || !chosen) return;
    // An NPC with a condition or instances: asked what becomes of them first
    if (chosen.kind === "npc" && spawnEntries.some((e) => e.id === chosen.npcId)) {
      setRemoving({ index: chosen.index, npcId: chosen.npcId! });
      return;
    }
    removeNpc(chosen.index, null);
  };

  /** Removes an NPC of the events; its spawn data goes with it, or to another NPC (moveTo), in the same step. */
  const removeNpc = (index: number, moveTo: number | null | "delete") => {
    if (!eventsPath || !chosen) return;
    const paths = [eventsPath];
    const npcId = chosen.npcId;
    if (moveTo !== null && spawnFile && npcId !== undefined) {
      const list = spawnEntries.flatMap((e) => (e.id !== npcId ? [e] : moveTo === "delete" ? [] : [{
        ...e, id: moveTo, instances: e.instances?.map((inst) => ({ ...inst, npc: { ...inst.npc, id: moveTo } })),
      }]));
      documents.edit(spawnFile, ["npcs"], fromPlain(list));
      paths.push(spawnFile);
    }
    // The others keep their IDs (scripts name NPCs by ID); only the later ones' places in the list move up
    documents.edit(eventsPath, [KIND_LISTS[chosen.kind], index], undefined);
    record(paths);
    setSelected(null);
    setRemoving(null);
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
      entry.cells.push({ x: t.x - found.chunk.column * map.chunkTiles, z: t.z - found.chunk.row * map.chunkTiles });
      byFile.set(l.path, entry);
    }
    for (const [path, { chunk, cells }] of byFile) {
      const doc = await documents.hold(path);
      const lines = doc.text.split("\n");
      const head = lines[0].split(",");
      const col = (name: string) => head.indexOf(name);
      for (const c of cells) {
        const i = 1 + c.z * map.chunkTiles + c.x;
        const parts = lines[i]?.split(",");
        if (!parts) continue;
        if (flat) {
          parts[col("shape")] = "0";
          parts[col("slope")] = String(flat.slope);
          parts[col("offset")] = String(flat.offset);
        } else {
          parts[col("tile_type")] = String(paintOver(Number(parts[col("tile_type")]), PAINTS[paint].type));
        }
        lines[i] = parts.join(",");
      }
      documents.editText(path, lines.join("\n"));
      // The view reads the edited text back
      await reloadLayersFromDocs(chunk, map.chunkSize);
    }
    if (byFile.size) record([...byFile.keys()]);
    setMap({ ...map });
  }, [map, layer, paint, paintMode, paintHeight, record]);

  /** Paints rail tiles' types, in their lines' attribute CSVs: one undo step a stroke. */
  const onPaintRail = useCallback(async (places: RailPlace[]) => {
    if (!rails || paintMode !== "type") {
      setPaintNote(rails && paintMode !== "type" ? "A rail's height is its points' and curves': the painter sets rail tiles' types only." : null);
      return;
    }
    const byPath = new Map<string, RailPlace[]>();
    for (const p of places) {
      const path = rails.attributes[p.line]?.path;
      if (path) byPath.set(path, [...(byPath.get(path) ?? []), p]);
    }
    for (const [path, list] of byPath) {
      let text = (await documents.hold(path)).text;
      for (const p of list) text = setRailTile(text, p, (old) => paintOver(old, PAINTS[paint].type));
      documents.editText(path, text);
    }
    if (byPath.size) record([...byPath.keys()]);
    setRails(await loadRails(zone!, railSource));
  }, [rails, paintMode, paint, record, zone]);

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
    if (zone && rails && paths.some((p) => p.startsWith(rails.folder))) setRails(await loadRails(zone, railSource));
    if (map && paths.some((p) => p.endsWith(".csv"))) {
      for (const chunk of map.chunks) if (chunk.layers.some((l) => paths.includes(l.path))) await reloadLayersFromDocs(chunk, map.chunkSize);
      setMap({ ...map });
    }
  }, [eventsPath, map, rails, zone]);

  const save = useCallback(async () => {
    for (const p of documents.dirtyPaths().filter(ownFile)) await documents.save(p);
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

  /** The game's camera to look through: the chosen area's at the preview's point, or the zone's default at the tile. */
  const viewCamera = useMemo<ViewCamera | null>(() => {
    const area = chosen?.kind === "camera" ? cameraAreas?.[chosen.index] : undefined;
    const ground = (x: number, z: number) => (map ? tileAt(map, x, z, layer)?.height ?? 0 : 0);
    if (previewing && area?.rect) {
      const r = area.rect;
      const alongX = r.width === 1;
      const step = Math.min(r.height - 1, Math.floor(previewT * r.height));
      const x = alongX ? r.x + step : r.x + Math.floor(r.width / 2), z = alongX ? r.z + Math.floor(r.unk06 / 2) : r.z + step;
      return rectCamera(r, previewT, ground(x, z));
    }
    if (previewing && area?.circle) return circleCamera(area.circle, area.stay);
    if (previewDefault && tile && defaults[zoneCamera]) return defaultCamera(defaults[zoneCamera], [tile.x * TILE + 8, ground(tile.x, tile.z), tile.z * TILE + 8]);
    return null;
  }, [chosen, cameraAreas, previewing, previewT, previewDefault, tile, defaults, zoneCamera, map, layer]);

  const unsavedDocs = [...docs.values()].filter((d) => d.dirty && ownFile(d.path));
  const unsavedProps = dirtyPropChunks();
  const unsaved = [...unsavedDocs.map((d) => ({ path: d.path, saveError: d.saveError })),
                   ...unsavedProps.map((c) => ({ path: `${c}/model.glb`, saveError: propsSaveError(c) }))];
  const onTile = tile ? entities.filter((e) => e.x !== null && e.z !== null && tile.x >= e.x && tile.x < e.x + e.width && tile.z >= e.z && tile.z < e.z + e.depth) : [];
  const script = world && chosen?.script ? resolveScript(world, zoneInfo, chosen.script) : null;
  const chosenHere = chosen && chosen.x !== null && chosen.z !== null
    ? entities.filter((e) => e !== chosen && e.x !== null && e.z !== null && chosen.x! >= e.x && chosen.x! < e.x + e.width && chosen.z! >= e.z && chosen.z! < e.z + e.depth)
    : [];
  const fields = useMemo(() => (chosen ? entityFields(chosen.kind, () => setScriptOpen(true)) : undefined), [chosen?.kind]);
  const instanceFields = useMemo<FormContext["render"]>(() => {
    if (!chosen?.spawn) return undefined;
    const base = ["npcs", chosen.spawn.entry, "instances", chosen.spawn.instance, "npc"];
    const fields = entityFields("npc", () => setScriptOpen(true), base);
    // Its id is always the host's: the game keeps the host's when it writes the instance in
    return (path, value, schema, ctx) => (path.length === base.length + 1 && path[base.length] === "id"
      ? <span className="muted">the host's, {String(value)}</span> : fields?.(path, value, schema, ctx));
  }, [chosen?.spawn?.entry, chosen?.spawn?.instance]);
  const revert = async () => {
    for (const d of unsavedDocs) await documents.reload(d.path).catch(() => undefined);
    revertProps();
    // A camera file made and never saved is gone again
    if (zone) cameraFileOf(zone, railsName).then(setCameraFile, () => setCameraFile(null));
    for (const h of histories.current.values()) { h.undo = []; h.redo = []; }
    if (map) {
      for (const chunk of map.chunks) await reloadLayersFromDocs(chunk, map.chunkSize);
      setMap({ ...map });
    }
    if (zone && rails) setRails(await loadRails(zone, railSource));
  };

  return (
    <div className="ow-editor">
      {removing && (() => {
        const entry = spawnEntries.find((e) => e.id === removing.npcId);
        const others = entities.filter((e) => e.kind === "npc" && e.npcId !== removing.npcId && !spawnEntries.some((x) => x.id === e.npcId));
        const target = moveToId ?? others[0]?.npcId ?? null;
        return (
          <div className="overlay" onMouseDown={() => setRemoving(null)}>
            <div className="ow-dialog" onMouseDown={(e) => e.stopPropagation()}>
              <h4>Remove NPC {removing.npcId}?</h4>
              <p>It has {entry?.when ? "a condition" : ""}{entry?.when && entry?.instances?.length ? " and " : ""}
                {entry?.instances?.length ? `${entry.instances.length} instance${entry.instances.length > 1 ? "s" : ""}` : ""}.</p>
              <div className="ow-dialog-actions">
                <button onClick={() => removeNpc(removing.index, "delete")}>Remove it and them</button>
                {others.length > 0 && target !== null && (
                  <span className="ow-inline">
                    <button onClick={() => removeNpc(removing.index, target)}>Remove it, give them to NPC</button>
                    <select value={target} onChange={(e) => setMoveToId(Number(e.target.value))}>
                      {others.map((o) => <option key={o.npcId} value={o.npcId}>{o.npcId} {o.model?.replace(/^OBJ_CODE_/, "")}</option>)}
                    </select>
                  </span>
                )}
                <button className="primary" onClick={() => setRemoving(null)}>Cancel</button>
              </div>
              <p className="muted">The other NPCs keep their IDs either way. Ctrl+Z puts it all back.</p>
            </div>
          </div>
        );
      })()}
      <header className="ow-header">
        <h2>Overworld Editor</h2>
        {zone && <strong>{zoneLabel(zone)}</strong>}
        {zone && <LoadBar used={size} limit={EVENTS_BUDGET} />}
        {zone && sprites && <SpriteBar load={sprites} cacheList={npcCache} seasonal={seasonal} size={cacheSize} />}
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
          <button className={`me-overworld-button${overworld ? " active" : ""}`} onClick={() => setOverworld(!overworld)}
                  title="The overworld's grid: click an area's cell to open its zone">🗺 Overworld map</button>
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
                {KINDS.filter((k) => (k !== "rail" || rails) && (k !== "camera" || cameraFile)).map((k) => (
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
              {rails && (
                <label className="ow-inline" title="Which tiles to draw and pick in a zone with a grid and rails: an NPC is placed on whichever its tile is">Show
                  <select value={ground} onChange={(e) => setGround(e.target.value as "both" | "grid" | "rails")}>
                    <option value="both">grid and rails</option><option value="grid">grid</option><option value="rails">rails</option>
                  </select>
                </label>
              )}
              {rails && railLevels(rails).length > 1 && (
                <label className="ow-inline" title="The rails at one height (and the ramps that reach it), with what stands on them">Rails
                  <select value={railLevel ?? ""} onChange={(e) => setRailLevel(e.target.value === "" ? null : Number(e.target.value))}>
                    <option value="">every height</option>
                    {railLevels(rails).map((h) => <option key={h} value={h}>at {Math.round((h / TILE) * 10) / 10} tiles</option>)}
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
              <button className={conditionsPreview ? "active" : ""} onClick={() => setConditionsPreview(!conditionsPreview)}
                      title="Shows what the game would for a season (the Season choice), a time, a weather and set flags: no NPC whose condition fails, each host as its instance">
                {conditionsPreview ? "■ Conditions" : "▶ Conditions"}</button>
              <button className={preview ? "active" : ""} onClick={() => setPreview(!preview)}
                      title="The NPCs move as their move codes move them in game (at 30 frames a second, blocked as the game blocks them, without the player), and the ambients along their paths as the game moves them; their tiles stay marked">
                {preview ? "■ Stop" : "▶ Movement"}</button>
              <label className="ow-check" title="Drag over tiles to paint them"><input type="checkbox" checked={painting} onChange={(e) => setPainting(e.target.checked)} /> Paint</label>
              <button className={wild ? "active" : ""} onClick={() => setWild(!wild)} disabled={!zone}
                      title="The Pokémon of this zone's encounter area: their methods, seasons, times, rarity and levels, sortable">🐾 Wild Pokémon</button>
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
          {conditionsPreview && (
            <div className="ow-toolbar ow-preview-bar">
              <strong>Conditions preview</strong>
              <span className="muted">{SEASON_NAMES[season]} (the Season choice)</span>
              <label className="ow-inline">Time <select value={previewTime} onChange={(e) => setPreviewTime(e.target.value)}>
                {TIME_NAMES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select></label>
              <label className="ow-inline">Weather <select value={previewWeather} onChange={(e) => setPreviewWeather(e.target.value)}>
                {WEATHERS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></label>
              <label className="ow-inline" title="Flags set, by name, separated by spaces or commas">Flags set
                <input className="ow-flags" value={previewFlags} onChange={(e) => setPreviewFlags(e.target.value)} placeholder="EVENT_FLAG_…" /></label>
              <button onClick={() => setPreviewSeed(previewSeed + 1)} title="Another day: chances and instances rolled again">Reload</button>
              <span className="muted">The party, the lead, variables and the terrain count as holding.</span>
            </div>
          )}
          <div className={`ow-map-wrap${painting ? " painting" : ""}`}>
            {wild && zone && <WildPanel zone={zone} onClose={() => setWild(false)} />}
            {overworld && (
              <div className="me-overworld-panel">
                <div className="me-overworld-head"><strong>Overworld</strong><span className="spacer" /><button onClick={() => setOverworld(false)}>Close</button></div>
                <OverworldGrid current={zone ? `ZONE_${zone.toUpperCase()}` : null}
                               onCell={(cell) => { if (cell.zone) { setZone(cell.zone.replace(/^ZONE_/, "").toLowerCase()); setOverworld(false); } }}
                               hint="Click an area's cell to open its zone (the Map Editor adds routes on grey or empty cells)." />
              </div>
            )}
            {!zone ? <p className="muted ow-empty">Choose a zone.</p>
              : mapError ? <p className="ow-error ow-empty">{mapError}</p>
              : !map ? <p className="muted ow-empty">Reading the map…</p>
              : <MapView map={map} entities={visible} selected={chosen} layer={layer} overlay={overlay} showModels={showModels}
                         painting={painting} preview={preview} overhead={overhead} paintType={paintMode === "type" ? PAINTS[paint].type : null}
                         onSelect={select} onMove={move} onAdd={add} onPaint={onPaint}
                         cameraAreas={cameraAreas} viewCamera={viewCamera} onRect={onRect} drawRect={drawing ? chosen : null}
                         rails={rails} railLevel={railLevel} ground={ground} onMoveRailPoint={moveRailPoint} onMoveRail={moveRail} onAddRail={(place, h) => add(0, 0, h, place)} onPaintRail={onPaintRail} />}
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
          {note && <p className="ow-note ow-error ow-side-note" onClick={() => setNote(null)} title="Click to dismiss">{note}</p>}
          {!zone ? null : chosen ? (
            <div className="ow-panel">
              <div className="ow-panel-head">
                <button onClick={() => setSelected(null)} title={`Back to the ${KIND_NAMES[chosen.kind]}`}>← {KIND_NAMES[chosen.kind]}</button>
                <strong>{chosen.label}</strong>
                {chosen.x !== null && <span className="muted"> at {chosen.x}, {chosen.z}</span>}
                {chosen.rail && <span className="muted" title="Its place on the rails: the line, the tiles along it from its first point, and across it from its middle">
                  {" "}on line {chosen.rail.line}, front {chosen.rail.front}, side {chosen.rail.side}</span>}
                <span className="spacer" />
                {(chosen.kind === "trigger" || chosen.kind === "warp") && hasRect(chosen, cameraAreas) && (
                  <button className={drawing ? "active" : ""} onClick={() => setDrawing(!drawing)}
                          title="Drag on the map to draw its tiles; or drag it to move it, and its edges and corners to resize it">{drawing ? "Drag on the map…" : "Draw"}</button>
                )}
                <button onClick={remove} title="Remove it (the others keep their IDs)">Remove</button>
              </div>
              {chosen.rail && rails && (() => {
                const r = chosen.rail;
                const length = rails.lines[r.line]?.length ?? 0;
                const sides = r.front < length ? sidesAt(rails, r.line, r.front) : [];
                if (r.line < rails.lines.length && r.front < length && sides.includes(r.side)) return null;
                return <p className="muted ow-note">Past its rail: {r.line >= rails.lines.length ? `the rails have no line ${r.line}`
                  : r.front >= length ? `line ${r.line} is ${length} tiles long (front 0 to ${length - 1})`
                  : `line ${r.line} is ${sides.length ? `${sides[sides.length - 1]} tiles wide each way here (side ${sides[0]} to ${sides[sides.length - 1]})` : "no width here"}`}.
                  It stands past the rail's edge, where the player can't walk; the original game has one such NPC (Dragonspiral Tower).</p>;
              })()}
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
              {chosen.kind === "camera" && cameraFile && cameraAreas?.[chosen.index] ? (
                <CameraPanel path={cameraFile.path} index={chosen.index} area={cameraAreas[chosen.index]} constants={constants} onEdit={() => record([cameraFile.path])}
                             previewing={previewing} onPreview={setPreviewing} t={previewT} onT={setPreviewT}
                             drawing={drawing} onDraw={() => setDrawing(!drawing)} />
              ) : chosen.railPart && rails && railsPath ? (
                <RailPanel rails={rails} path={railsPath} part={chosen.railPart} constants={constants} onEdit={() => record([railsPath])}
                           connecting={connecting !== null} onConnect={() => setConnecting(connecting === null ? chosen.railPart!.index : null)}
                           onFitLength={(length) => fitLength(chosen.railPart!.index, length)} />
              ) : chosen.building ? (
                <BuildingPanel key={`${chosen.building.chunk}:${chosen.building.index}`} entity={chosen} models={models} chunkSize={map?.chunkSize ?? 512}
                               onChange={(p, phase) => {
                                 const b = chosen.building!;
                                 const list = propsOf(b.chunk).map((q, i) => (i === b.index ? p : q));
                                 // A drag is one step: its first change, then amended
                                 if (phase === "end") return;
                                 if (phase === "move") { amendProps(b.chunk, list); return; }
                                 setProps(b.chunk, list);
                                 record([PROPS + b.chunk]);
                                 setLastProp(p.id);
                               }} />
              ) : chosen.kind === "ambient" && spawnFile ? (
                <>
                  <p className="ow-note muted">A sprite the game draws without an actor, on its path round its place: nothing collides with it and it
                    isn't talked to. Drag it to another tile to move it, keeping its height over the ground.</p>
                  {ambients[chosen.index] && (
                    <AmbientPanel path={spawnFile} index={chosen.index} ambient={ambients[chosen.index]} constants={constants}
                                  ground={map ? standingOn(map, ambients[chosen.index].x, ambients[chosen.index].z, ambients[chosen.index].y)?.height ?? null : null}
                                  used={usedSprites} onEdit={() => record([spawnFile])} />
                  )}
                </>
              ) : chosen.kind === "instance" && spawnFile ? (
                <>
                  <p className="ow-note"><button className="link" onClick={() => {
                    const host = entities.find((e) => e.kind === "npc" && e.npcId === chosen.spawn!.host);
                    if (host) setSelected({ kind: "npc", index: host.index });
                  }}>Its host, NPC {chosen.spawn!.host}</button> <span className="muted">The field writes it into the host's record when it's picked; its id stays the host's.</span></p>
                  {spawnEntries[chosen.spawn!.entry]?.instances?.[chosen.spawn!.instance] && (
                    <InstancePanel path={spawnFile} entry={chosen.spawn!.entry} instance={chosen.spawn!.instance}
                                   inst={spawnEntries[chosen.spawn!.entry].instances![chosen.spawn!.instance]} constants={constants}
                                   onEdit={() => record([spawnFile])} npcFields={instanceFields} />
                  )}
                </>
              ) : eventsPath && hasEventLayout(chosen.kind) ? (
                <EventPanel key={`${chosen.kind}:${chosen.index}`} kind={chosen.kind} path={eventsPath} index={chosen.index} constants={constants}
                            render={fields} onEdit={() => record([eventsPath])}>
                  {chosen.kind === "npc" && spawnFile && data instanceof Map && (
                    <SpawnSection path={spawnFile} entries={spawnEntries} npcId={chosen.npcId!} constants={constants}
                                  npcRecord={toPlain((data.get("npcs") as JsonValue[])[chosen.index]) as Record<string, unknown>}
                                  onEdit={(paths) => { record(paths); setSpawnExists(true); }}
                                  onOpenInstance={(entry, k) => {
                                    const inst = entities.find((e) => e.spawn?.entry === entry && e.spawn.instance === k);
                                    if (inst) setSelected({ kind: "instance", index: inst.index });
                                  }} />
                  )}
                </EventPanel>
              ) : eventsPath && (
                <>
                  {chosen.kind === "npc" && spawnFile && data instanceof Map && (
                    <SpawnSection path={spawnFile} entries={spawnEntries} npcId={chosen.npcId!} constants={constants}
                                  npcRecord={toPlain((data.get("npcs") as JsonValue[])[chosen.index]) as Record<string, unknown>}
                                  onEdit={(paths) => { record(paths); setSpawnExists(true); }}
                                  onOpenInstance={(entry, k) => {
                                    const inst = entities.find((e) => e.spawn?.entry === entry && e.spawn.instance === k);
                                    if (inst) setSelected({ kind: "instance", index: inst.index });
                                  }} />
                  )}
                  <DocForm key={`${chosen.kind}:${chosen.index}`} path={eventsPath} at={[KIND_LISTS[chosen.kind], chosen.index]} constants={constants}
                           hideDescription flat render={fields} onEdit={() => record([eventsPath])} />
                </>
              )}
            </div>
          ) : (
            <div className="ow-panel">
              <p className="muted ow-note">
                Click an entity to edit it, drag it to another tile, or Shift+click a tile to add {module === "level" ? "one (not level scripts, which have no place)" : `a ${KIND_NAMES[module].toLowerCase().replace(/ies$/, "y").replace(/s$/, "")}`}.
                {tile && <> Tile {tile.x}, {tile.z}.</>}
              </p>
              {module === "camera" && (
                <div className="ow-panel-box">
                  <p className="ow-note">{cameraFile?.exists ? `Camera areas: ${cameraFile.path.replace("res/field/cameras/", "")}.` : "This zone has no camera areas yet: Shift+click a tile to add one (it makes the zone's file)."}
                    {" "}The zone's own camera is default camera {zoneCamera}.</p>
                  <label className="ow-check" title="Click a tile first: the player stands there">
                    <input type="checkbox" checked={previewDefault} onChange={(e) => setPreviewDefault(e.target.checked)} disabled={!tile} /> Preview the zone's camera at the tile</label>
                </div>
              )}
              <p className="muted ow-note">A save made on a map keeps its NPCs as they were: after a build, leave the map and come back to see the changes.</p>
              {onTile.length > 1 && <p className="ow-note">On this tile: {onTile.map((e) => (
                <button key={`${e.kind}${e.index}`} className="link" onClick={() => setSelected({ kind: e.kind, index: e.index })}>{e.label} </button>
              ))}</p>}
              <h4>{KIND_NAMES[module]} <span className="muted">{entities.filter((e) => e.kind === module).length}</span></h4>
              {module === "ambient" && sprites && sprites.ambientsAtOnce > AMBIENTS_SHOWN && (
                <p className="notice warning ow-note">Up to {sprites.ambientsAtOnce} of these can hold at once, and the game shows {AMBIENTS_SHOWN}: the first {AMBIENTS_SHOWN} in
                  this list whose conditions hold. Give them conditions that don't overlap, or order them by which matter most.</p>
              )}
              <div className="ow-list">
                {entities.filter((e) => e.kind === module).map((e) => (
                  <button key={e.index} className="ow-item" onClick={() => select(e, null)}>
                    {e.label}{e.model ? <span className="muted"> {e.model.replace(/^OBJ_CODE_/, "")}</span> : null}
                    {e.x !== null ? <span className="muted"> · {e.x}, {e.z}</span>
                      : e.rail ? <span className="muted"> · line {e.rail.line}, {e.rail.front}, {e.rail.side}</span>
                      : <span className="muted"> · no place</span>}
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

/** The files the Overworld Editor edits, which its Save and Revert cover: the field's data and the zones' spawn files. */
const ownFile = (path: string) => path.startsWith("res/field/") || path.startsWith("res/paperwhite2/overworld/");

/** The rails' attributes from the document store, where the painter left them unsaved. */
const railSource = (path: string) => { const doc = documents.get(path); return doc ? currentText(doc) : null; };

/** A chunk's layers again from the painter's edited text (still unsaved, so from the document store). */
async function reloadLayersFromDocs(chunk: Parameters<typeof reloadLayers>[0], chunkSize: number) {
  await reloadLayers(chunk, (path) => documents.get(path)?.text ?? null, chunkSize);
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

const short = (code: string) => code.replace(/^OBJ_CODE_/, "").toLowerCase();

/** How many sprites the zone can have loaded at once, in the worst case, against the sprite cache's entries (size, as
 * the hack's build sets it): green under 80%, yellow from 80%, red past it. */
function SpriteBar({ load, cacheList, seasonal, size }: { load: SpriteLoad; cacheList: number | null; seasonal: Seasonal; size: number }) {
  const share = load.total / size;
  const level = share > 1 ? "over" : share >= 0.8 ? "near" : "ok";
  const title = [
    `Sprites the zone can have loaded at once, in the worst case: ${load.total} of the ${size} the game's sprite cache holds (include/paperwhite2/sprites.h). Past it, or with too little texture memory free, a sprite waits, and shows once there's room.`,
    `${load.preloaded} preloaded by the zone (list ${cacheList ?? "none"}, res/field/actors/preloads.json); an NPC of one of those costs nothing more.`,
    `${load.player} for the player (walking, and cycling or surfing) and ${load.follower} for the Following Pokémon.`,
    `${load.npcs} more for NPCs and instances, and ${load.ambients} for ambients${load.worst ? `, at worst in ${load.worst}` : ""} (every chance coming up; ${seasonal.runs ? "script 10852's seasonal NPCs, flags 500 to 599, as the script shows them together" : "flags 500 to 599 count as shown, since the zone doesn't run script 10852"}; another flag, a story flag, counts as shown, unknown here).`,
    ...(load.likely !== null && load.likely < load.total ? [`With at most ${RARE_LIKELY} of script 10852's ten 10% NPCs at once (93% of entries): ${load.likely} of ${size}. The bar is the most that can ever show.`] : []),
    `Past the preloads: ${load.extraCodes.map(short).join(", ") || "none"}.`,
    `Preloaded: ${load.preloadedCodes.map(short).join(", ") || "none"}.`,
  ].join("\n");
  return (
    <span className={`ow-load ${level}`} title={title}>
      <span className="ow-load-bar"><span className="ow-load-fill" style={{ width: `${Math.min(100, share * 100)}%` }} /></span>
      <span className="ow-load-text">{load.total} / {size} sprites · {Math.round(share * 100)}%</span>
    </span>
  );
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
