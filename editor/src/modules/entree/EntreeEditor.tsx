// The Entree page: the rooms of the Entralink roguelike (res/paperwhite2/entralink/rooms/, model.ts). The list of rooms
// on the left (new, duplicate, delete, filtered by round and role); in the middle the forest clearings' shared 32 by 32
// grid, top down (the Overworld Editor's map view), with one clearing faint behind it for reference, its exits, and the
// room's NPCs as their sprites, chosen, dragged and added there (a room has no map of its own: the game picks the
// clearing by the door taken); and on the right the room's checks and its headed sections, laid out as the Ambients panel
// is: Room, Battles, NPCs, with the run's own settings (run.json) above the list. Step 6: the rooms' types, the
// templates every generated room of a type is (templates/, a group under the rooms, edited as rooms are), the new NPC
// types, the rounds' type weights and the run's chances, the clearings' flower tiles on the grid (flower_tiles.json) and
// the Items tab (the item table, items.json: ItemsPage.tsx); the buffs' phase 1, the Buffs tab (the buff catalogue,
// buffs.json: BuffsPage.tsx). Every room file is held in the
// document store, so undo, the build's check on Save and changes on disk work as for any file. Save first gives the
// new battles and catchable enemies their progress ids (model.ts, assignProgressIds; progress_ids.json); renaming a
// battle or a room renames what every room's catches and spawn conditions name of it.

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import { fromPlain, getIn, setIn, type JsonMap, type JsonPath, type JsonValue } from "../../../shared/json.ts";
import { validate, type Constants, type Schema } from "../../../shared/schema.ts";
import { SearchSelect, type Option } from "../../shell/SearchSelect.tsx";
import { constantLabel, constantOptions } from "../schema-form/form.tsx";
import { SpeciesIcon } from "../pokemon/SpeciesIcon.tsx";
import { useMoveOptions } from "../moves/learnable.ts";
import { MapView } from "../overworld/MapView.tsx";
import { ModelPicker, SpriteImage } from "../overworld/fields.tsx";
import type { Entity } from "../overworld/entities.ts";
import { TILE_FLAG_COLLISION, loadZoneMap, tileAt, tileFlags, tileIsValid, type ZoneMap } from "../overworld/terrain.ts";
import { DIALOGUE_INSERTS, DialogueField, type DialogueInsert } from "../text/DialogueField.tsx";
import { weatherLabel, weatherNote } from "../weather/weathers.ts";
import { useToolActive } from "../active.ts";
import type { ToolProps } from "../types.ts";
import { ItemsPage } from "./ItemsPage.tsx";
import { BuffsPage } from "./BuffsPage.tsx";
import { BUFFS } from "./buffs.ts";
import { NumberBox, Row, Section, Switch, cap } from "./parts.tsx";
import {
  ARRIVAL, CLEARINGS_PREFIX, exitAt, ROUNDS, ROUND_NOTES, clearingName, inRound, DEFAULT_CHANCE, DEFAULT_COUNT, DEFAULT_LEVEL, EXIT_SCRIPTS, FACINGS, FORMAT_ENEMIES, FORMATS, ID_PATTERN,
  ITEM_BALL_SPRITE, ROLES, ROOMS_DIR, ROOM_SCHEMA, checkRoom, checkRooms, freeId, idFromName, newNpc,
  newRoomData, npcSprite, readRoom, roomId, roomPath, shownEnemy, walkingSprite,
  DEFAULT_ONCE, PROGRESS_IDS, PROGRESS_IDS_SCHEMA, RUN_COMPLETED, assignProgressIds, battleKey, battleKeys, renameKeys, withoutProgressIds,
  MESSAGE_STYLES, MESSAGE_STYLE_NOTES, readRun, roundSummary, runProblems, type MessageStyle,
  DOORS, MARKER_NOTES, MARKER_TYPES, NPC_MARKERS_DIR, markerArt, npcMarkerArt, type Door,
  BALL_TYPES, DEFAULT_ROOM_TYPE, DEFAULT_TYPE_WEIGHTS, DUST_KINDS, DUST_NOTES, MAX_SHOP_ITEMS, MAX_SWAP_DUST, MAX_RESERVE_SLOTS, MAX_SHOP_PRICES, MAX_SHOP_TOTAL_CAP, shopPrice, DEFAULT_ENEMY_SCALE, SCALED_STATS, SCALED_STAT_NAMES, CURVE_KEYS, CURVE_KEY_NAMES, CURVE_KEY_TITLES, type StatScaling, FLOWER_TILES, FLOWER_TILES_SCHEMA, ITEMS, LADY_SPRITE, NPC_DEFAULT_MARKERS, NPC_TYPE_NOTES,
  ROOM_TYPES, ROOM_TYPE_NOTES, TEMPLATES, TEMPLATES_DIR, TEMPLATE_NOTES, TEMPLATE_TYPES, WEIGHT_ORDER, checkTemplates, defaultMarker,
  isTemplateFile, newTemplateData, percent, readFlowerTiles, setFlowerTiles, templatePath, typeChances, type RoomType,
  type Round, type Exit, type MapInfo, type NpcType, type Problem, type ProgressCounters, type Role, type Room,
  AMBIENT_BEHAVIOURS, AMBIENT_DEFAULTS, type AmbientBehaviour,
  RANDOM_FORMATS, randomRoomsJson, type RandomRooms, type RunLayout,
} from "./model.ts";

// The run's dialogue: its script puts the player's name in word 0 before every message (global_10490.s)
const ROOM_INSERTS: DialogueInsert[] = [...DIALOGUE_INSERTS, { label: "Player's name", code: "{0100:0}", title: "The player's name ({0100:0})" }];
const ROOM_WORDS: Record<number, string> = { 0: "Player" };
/** An NPC's dialogue's keys, in room.schema.json's order. */
const DIALOGUE_KEYS = ["before", "after", "before_style", "after_style"];

const ARROWS: Record<string, string> = { DIR_UP: "↑", DIR_DOWN: "↓", DIR_LEFT: "←", DIR_RIGHT: "→" };
const FACING_NAMES: Record<string, string> = { DIR_UP: "Up", DIR_DOWN: "Down", DIR_LEFT: "Left", DIR_RIGHT: "Right" };
const ROLE_NOTES: Record<Role, string> = {
  room: "One of a round's rooms, drawn at random.",
  boss: "Ends round 1 or 2: drawn from the bosses' own pool.",
  final: "The run's last room.",
};
const FORMAT_NOTES: Record<string, string> = {
  single: "One enemy against one of the player's Pokémon.",
  double: "Up to two enemies, two against two.",
  triple: "Up to three enemies, three against three.",
  raid: "One enemy in the center against three of the player's Pokémon.",
};
const TYPE_NOTES = NPC_TYPE_NOTES;
const TYPE_LABELS: Record<NpcType, string> = {
  battle: "Battle", item: "Item", heal: "Heal", revive: "Revive", gift: "Gift", shop: "Shop", swap: "Swap", item_choice: "Item choice",
  buff_choice: "Buff choice", ambient: "Ambient", rest: "Rest (old)", buff: "Buff (old)",
};
/** What an ambient's reactions do, for its Behaviour switch. */
const AMBIENT_NOTES: Record<AmbientBehaviour, string> = {
  fade: "Fades out where it stands (about a quarter of a second); with Return it fades back in once the player is Far tiles away",
  flee: "Turns and runs Distance tiles away from the player (fewer where its way is blocked), fading as it goes, then is gone for the room",
};
/** The NPC types in the Add and Type pickers, grouped. */
const TYPE_GROUPS: [string, NpcType[]][] = [
  ["Battles and items", ["battle", "item"]],
  ["Rests and choices", ["heal", "revive", "gift", "shop", "swap", "item_choice", "buff_choice"]],
  ["Scenery", ["ambient"]],
  ["Old placeholders", ["rest", "buff"]],
];
/** What a message box asks for, by the NPC's type. */
const TALK_PLACEHOLDERS: Partial<Record<NpcType, string>> = {
  battle: "What it says before the battle starts", item: "What it says as it gives its item",
  heal: "What it says before healing", revive: "What it says before reviving", gift: "What it says before the choice of 3",
  shop: "What it says (the shop comes later)", swap: "What it says before the Reserve Box's list", item_choice: "Left empty: \"It's a <item>! Take it?\"", buff_choice: "What it says (buffs come later)",
};
const FLOWER_COLOR = 0xff3fb4;
const RUN = "res/paperwhite2/entralink/run.json";
const RUN_SCHEMA = "res/paperwhite2/entralink/run.schema.json";
const TINTS = "res/paperwhite2/field_tints/tints.json";
/** The files the page's Save saves: the rooms, the templates, the run, the item table, the flower tiles and the buff
 * catalogue. */
const isPageFile = (p: string) => p.startsWith(`${ROOMS_DIR}/`) || isTemplateFile(p) || p === RUN || p === ITEMS || p === FLOWER_TILES || p === BUFFS;
/** The schema's own complaint about a battle or catch with no progress id yet: Save gives it one. */
const awaitsId = (e: { path: JsonPath; message: string }) => e.message === "progress_id is missing";
const zoneFile = (zone: string) => zone.replace(/^ZONE_/, "").toLowerCase();
const asMap = (v: JsonValue | undefined): JsonMap => (v instanceof Map ? v : new Map());
const asList = (v: JsonValue | undefined): JsonValue[] => (Array.isArray(v) ? v : []);
const label = (name: string | undefined, prefix: string) => (name ? constantLabel(name, prefix) : "");

/** A record with a key set (or removed, for undefined), the keys kept in the schema's order. */
function put(record: JsonMap, key: string, value: JsonValue | undefined, order: string[]): JsonMap {
  const next = new Map(record);
  if (value === undefined) next.delete(key);
  else next.set(key, value);
  const rank = (k: string) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
  return new Map([...next].sort((a, b) => rank(a[0]) - rank(b[0])));
}

// ---- The map's information: its exits (the events' exit triggers) and its blocked tiles ------------------------------

const maps = new Map<string, Promise<{ map: ZoneMap; info: MapInfo }>>();
function loadRoomMap(zone: string, constants: Constants): Promise<{ map: ZoneMap; info: MapInfo }> {
  if (!maps.has(zone)) {
    const p = (async () => {
      const map = await loadZoneMap(zoneFile(zone), 0, constants);
      const events = JSON.parse((await api.file(`res/field/events/${zoneFile(zone)}.json`)).text) as
        { triggers?: { script: number; grid?: { x: number; z: number; width: number; height: number } }[] };
      const exits: Exit[] = (events.triggers ?? []).filter((t) => EXIT_SCRIPTS[t.script] && t.grid)
        .map((t) => ({ side: EXIT_SCRIPTS[t.script], x: t.grid!.x, z: t.grid!.z, width: t.grid!.width, depth: t.grid!.height }));
      const blocked = (x: number, z: number) => {
        const t = tileAt(map, x, z, 0);
        return !t || !tileIsValid(t.tile.tileType) || (tileFlags(t.tile.tileType) & TILE_FLAG_COLLISION) !== 0;
      };
      return { map, info: { zone, exits, blocked } };
    })();
    p.catch(() => maps.delete(zone));
    maps.set(zone, p);
  }
  return maps.get(zone)!;
}

// ---- The page --------------------------------------------------------------------------------------------------------

interface Listed { id: string; path: string; room: Room; dirty: boolean; data: JsonValue | null; template: boolean }

/** The page's tab, remembered in this browser. */
const VIEW_KEY = "entree.view";
type View = "rooms" | "items" | "buffs";
function readView(): View {
  try { const v = localStorage.getItem(VIEW_KEY); return v === "items" || v === "buffs" ? v : "rooms"; } catch { return "rooms"; }
}

export function EntreeEditor({ constants }: ToolProps) {
  const { docs } = useDocuments();
  const toolActive = useToolActive();
  const [diskPaths, setDiskPaths] = useState<string[]>([]);
  const [templatePaths, setTemplatePaths] = useState<string[] | null>(null);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [view, setViewState] = useState<View>(readView);
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* kept for this visit */ } };
  const [typeFilter, setTypeFilter] = useState<RoomType | "all">("all");
  const [mapMode, setMapMode] = useState<"npcs" | "flowers">("npcs");
  const [showFlowers, setShowFlowers] = useState(true);
  const [npcIndex, setNpcIndex] = useState<number | null>(null);
  const [roundFilter, setRoundFilter] = useState<"all" | "1" | "2" | "3">("all");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [text, setText] = useState("");
  const [creating, setCreating] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [clearings, setClearings] = useState<Map<string, { map: ZoneMap; info: MapInfo }>>(new Map());
  const [mapError, setMapError] = useState<string | null>(null);
  const [shownZone, setShownZone] = useState(CLEARINGS_PREFIX);
  const [faint, setFaint] = useState(true);
  const [showBlocked, setShowBlocked] = useState(true);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.list(`${ROOMS_DIR}/*.json`).then((paths) => setDiskPaths(paths), (e: Error) => setError(e.message));
    api.list(`${TEMPLATES_DIR}/*.json`).then((paths) => setTemplatePaths(paths), () => setTemplatePaths([]));
  }, []);
  useEffect(() => {
    refresh();
    return documents.onFiles((paths) => { if (paths.some((p) => p.startsWith(`${ROOMS_DIR}/`) || p.startsWith(`${TEMPLATES_DIR}/`))) refresh(); });
  }, [refresh]);
  useEffect(() => { api.schema(ROOM_SCHEMA).then(setSchema, (e: Error) => setError(e.message)); }, []);
  // The NPC markers' art, by name (npc_markers/<name>.png)
  const [npcMarkers, setNpcMarkers] = useState<string[]>([]);
  useEffect(() => {
    api.list(`${NPC_MARKERS_DIR}/*.png`).then((paths) => setNpcMarkers(paths.map((p) => p.slice(p.lastIndexOf("/") + 1).replace(/\.png$/, "")).sort()), () => undefined);
  }, []);
  // The doors' marker spots, from run.json (the Run section holds it), which NPCs should keep clear of
  useEffect(() => { documents.hold(RUN).catch(() => undefined); documents.hold(FLOWER_TILES).catch(() => undefined); }, []);
  const runData = docs.get(RUN)?.data;
  const markerSpots = useMemo(() => readRun(runData instanceof Map ? runData : null).markerSpots, [runData]);
  const markerInfo = useMemo(() => ({ spots: markerSpots, npcMarkers: new Set(npcMarkers) }), [markerSpots, npcMarkers]);
  const markerNames = markerInfo.npcMarkers;

  // Every room held, for the list and the checks over all of them; new ones are held unsaved until Save
  const paths = useMemo(() => {
    const held = [...docs.keys()].filter((p) => p.startsWith(`${ROOMS_DIR}/`) && p.endsWith(".json"));
    return [...new Set([...diskPaths, ...held])].sort();
  }, [diskPaths, docs]);
  useEffect(() => {
    for (const p of [...diskPaths, ...(templatePaths ?? [])]) if (!documents.get(p)) documents.hold(p).catch(() => undefined);
  }, [diskPaths, templatePaths]);
  const rooms: Listed[] = useMemo(() => paths.flatMap((path) => {
    const doc = docs.get(path);
    if (!doc) return [];
    return [{ id: roomId(path), path, room: readRoom(doc.data), dirty: doc.dirty, data: doc.data, template: false }];
  }), [paths, docs]);
  // The templates, held as the rooms are; a template's type is its file's
  const templates: Listed[] = useMemo(() => {
    const held = [...docs.keys()].filter(isTemplateFile);
    return [...new Set([...(templatePaths ?? []), ...held])].sort().flatMap((path) => {
      const doc = docs.get(path);
      if (!doc) return [];
      const id = roomId(path);
      return [{ id, path, room: { ...readRoom(doc.data), type: TEMPLATE_TYPES[id] }, dirty: doc.dirty, data: doc.data, template: true }];
    });
  }, [templatePaths, docs]);
  const everything = useMemo(() => [...rooms, ...templates], [rooms, templates]);

  useEffect(() => {
    if (selectedPath === null && rooms.length) setSelectedPath(rooms[0].path);
  }, [rooms, selectedPath]);
  const current = everything.find((r) => r.path === selectedPath) ?? null;
  const path = current?.path ?? null;
  const room = current?.room ?? null;

  // Every clearing, for the checks (an NPC is checked against all of them) and the reference behind the grid,
  // by name (Entree Forest 10 after 9)
  const zones = useMemo(() => [...constants].filter(([k]) => k.startsWith(CLEARINGS_PREFIX)).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([k]) => k), [constants]);
  useEffect(() => {
    let live = true;
    for (const zone of zones) {
      loadRoomMap(zone, constants).then((m) => { if (live) setClearings((old) => new Map(old).set(zone, m)); },
        (e: Error) => { if (live && zone === CLEARINGS_PREFIX) setMapError(`${zone}: ${e.message}`); });
    }
    return () => { live = false; };
  }, [zones, constants]);
  const infos = useMemo(() => [...clearings.values()].map((c) => c.info), [clearings]);
  const shown = clearings.get(shownZone) ?? null;
  const mapInfo = shown?.info ?? null;

  const set = useCallback((at: JsonPath, value: JsonValue | undefined) => { if (path) documents.edit(path, at, value); }, [path]);
  const get = (at: JsonPath) => (current?.data ? getIn(current.data, at) : undefined);
  const orderOf = (def: string): string[] => Object.keys(((schema?.$defs?.[def] ?? schema) as Schema | undefined)?.properties ?? {});
  /** Sets a field of a record (the room, a battle, an enemy, an NPC) in its schema's order. */
  const setField = (at: JsonPath, def: string, key: string, value: JsonValue | undefined) => {
    const record = def === "" ? asMap(current?.data ?? undefined) : asMap(get(at));
    const next = put(record, key, value, orderOf(def));
    if (def === "") { if (path) documents.replace(path, next); } else set(at, next);
  };

  /** Gives the new battles and catchable enemies of every room held their progress ids, and progress_ids.json its new
   * counters, saved first so that no number is given twice even if a room then fails to save. */
  const giveProgressIds = useCallback(async (): Promise<boolean> => {
    let counters: ProgressCounters | null = null;
    const held = await documents.hold(PROGRESS_IDS).catch(() => null);
    if (held?.data instanceof Map) counters = { next_battle: Number(held.data.get("next_battle") ?? 0), next_catch: Number(held.data.get("next_catch") ?? 0) };
    const result = assignProgressIds(everything.flatMap((r) => (r.data ? [{ path: r.path, data: r.data }] : [])), counters,
      { battle: orderOf("battle"), enemy: orderOf("enemy") });
    if (result.error) { setNote(result.error); return false; }
    if (!result.changed.size && counters && counters.next_battle === result.counters.next_battle && counters.next_catch === result.counters.next_catch) return true;
    const data = fromPlain({ $schema: "progress_ids.schema.json", ...result.counters });
    if (held) documents.replace(PROGRESS_IDS, data);
    else documents.create(PROGRESS_IDS, PROGRESS_IDS_SCHEMA, data);
    if (!(await documents.save(PROGRESS_IDS))) {
      setNote(`Couldn't save ${PROGRESS_IDS}, so no progress ids were given: ${documents.get(PROGRESS_IDS)?.saveError ?? ""}`);
      return false;
    }
    for (const [p, next] of result.changed) documents.replace(p, next);
    return true;
  }, [everything, schema]);
  const save = useCallback(async () => {
    if (!(await giveProgressIds())) return;
    for (const p of documents.dirtyPaths().filter(isPageFile)) await documents.save(p);
    refresh();
  }, [refresh, giveProgressIds]);
  useEffect(() => {
    if (!toolActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") { e.preventDefault(); e.stopPropagation(); void save(); return; }
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      // The Buffs tab undoes the catalogue; the others the chosen room
      const target = view === "buffs" ? BUFFS : path;
      if (!target || inField || (key !== "z" && key !== "y")) return;
      e.preventDefault(); e.stopPropagation();
      if (key === "y" || e.shiftKey) documents.redo(target); else documents.undo(target);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [save, toolActive, path, view]);

  const taken = useMemo(() => new Set(rooms.map((r) => r.id)), [rooms]);
  const create = (name: string, data: JsonValue) => {
    const id = freeId(idFromName(name), taken);
    documents.create(roomPath(id), ROOM_SCHEMA, data);
    setSelectedPath(roomPath(id));
    setNpcIndex(null);
  };
  /** A missing template, made with the spec's placeholders. */
  const createTemplate = (id: string) => {
    documents.create(templatePath(id), ROOM_SCHEMA, newTemplateData(id, markerNames));
    setSelectedPath(templatePath(id));
    setNpcIndex(null);
  };
  const duplicate = () => {
    if (!current?.data || current.template) return;
    const name = `${current.room.name} (copy)`;
    const id = freeId(`${current.id}_copy`, taken);
    // Its battles and catches are new ones, with progress ids of their own on save
    documents.create(roomPath(id), ROOM_SCHEMA, setIn(withoutProgressIds(current.data), ["name"], name));
    setSelectedPath(roomPath(id));
  };
  const remove = async () => {
    if (!current || current.template) return;
    setConfirmDelete(false);
    try {
      if (diskPaths.includes(current.path)) await api.removeFile(current.path);
      documents.close(current.path);
      setSelectedPath(rooms.find((r) => r.id !== current.id)?.path ?? null);
      refresh();
    } catch (e) {
      setNote(`Couldn't delete ${current.path}: ${(e as Error).message}`);
    }
  };
  const rename = async (to: string) => {
    if (!current?.data || current.template || to === current.id) return;
    if (!ID_PATTERN.test(to)) { setNote("An ID is lower-case letters, digits and underscores."); return; }
    if (taken.has(to)) { setNote(`There is already a room ${to}.`); return; }
    const next = roomPath(to);
    // What every room's catches and spawn conditions name of it, renamed with it
    const from = `${current.id}/`;
    for (const r of rooms) if (r.id !== current.id && r.data) {
      const renamed = renameKeys(r.data, from, `${to}/`, true);
      if (renamed) documents.replace(r.path, renamed);
    }
    documents.create(next, ROOM_SCHEMA, renameKeys(current.data, from, `${to}/`, true) ?? current.data);
    if (!(await documents.save(next))) {
      setNote(`Couldn't save ${next}: ${documents.get(next)?.saveError ?? ""}`);
      documents.close(next);
      return;
    }
    if (diskPaths.includes(current.path)) await api.removeFile(current.path).catch(() => undefined);
    documents.close(current.path);
    setSelectedPath(next);
    refresh();
  };

  const schemaErrors = useMemo(() => (current?.data && schema ? validate(current.data, schema, constants).filter((e) => !awaitsId(e)) : []), [current?.data, schema, constants]);
  const known = useMemo(() => battleKeys(rooms), [rooms]);
  const problems = useMemo(() => (room ? checkRoom(room, constants, infos, known, markerInfo) : []), [room, constants, infos, known, markerInfo]);
  const templateIds = useMemo(() => new Set(templates.map((t) => t.id)), [templates]);
  const overall = useMemo(() => [...checkRooms(everything), ...(templatePaths ? checkTemplates(templateIds) : [])], [everything, templateIds, templatePaths]);
  const roomProblems = useMemo(() => new Map(everything.map((r): [string, number] =>
    [r.path, checkRoom(r.room, constants, infos, known, markerInfo).filter((p) => p.severity === "error").length])), [everything, constants, infos, known, markerInfo]);
  /** Every room's battles, for the catches' and spawn conditions' pickers. */
  const battleOptions: Option[] = useMemo(() => rooms.flatMap((r) => r.room.battles.map((b) => ({
    value: battleKey(r.id, b.id), label: `${r.room.name || r.id}: ${b.id}`, detail: battleKey(r.id, b.id),
  }))), [rooms]);
  /** Renames what every other room's catches and spawn conditions name of one of this room's battles. */
  const renameKeyElsewhere = (from: string, to: string) => {
    for (const r of rooms) if (r.id !== current?.id && r.data) {
      const renamed = renameKeys(r.data, from, to);
      if (renamed) documents.replace(r.path, renamed);
    }
  };

  const listed = rooms.filter((r) => (roundFilter === "all" || inRound(r.room, Number(roundFilter) as Round)) && (roleFilter === "all" || r.room.role === roleFilter) &&
    (typeFilter === "all" || (r.room.role === "room" && (r.room.type ?? DEFAULT_ROOM_TYPE) === typeFilter)) &&
    (!text.trim() || `${r.id} ${r.room.name}`.toLowerCase().includes(text.trim().toLowerCase())));
  const unsaved = [...everything.filter((r) => r.dirty).map((r) => r.path), ...[RUN, ITEMS, FLOWER_TILES, BUFFS].filter((p) => docs.get(p)?.dirty)];

  // The shown clearing's flower tiles (flower_tiles.json), drawn over the grid and toggled in the Flower tiles mode
  const flowerDoc = docs.get(FLOWER_TILES);
  const flowers = useMemo(() => readFlowerTiles(flowerDoc?.data, shownZone), [flowerDoc?.data, shownZone]);
  const flowerMarks = useMemo(() => (showFlowers || mapMode === "flowers" ? { tiles: flowers.map(([x, z]) => ({ x, z })), color: FLOWER_COLOR, opacity: 0.75 } : undefined),
    [flowers, showFlowers, mapMode]);
  /** A click or a stroke in the Flower tiles mode: the tiles become flowers, or stop being, by the first one. */
  const paintFlowers = (tiles: { x: number; z: number }[]) => {
    if (!tiles.length) return;
    const on = !flowers.some(([x, z]) => x === tiles[0].x && z === tiles[0].z);
    const next = setFlowerTiles(flowerDoc?.data, shownZone, tiles, on);
    if (flowerDoc) documents.replace(FLOWER_TILES, next);
    else documents.create(FLOWER_TILES, FLOWER_TILES_SCHEMA, new Map([["$schema", "flower_tiles.schema.json"], ...[...next].filter(([k]) => k !== "$schema")]));
  };

  // The map's entities: the NPCs, then the exits (as the triggers they are)
  const entities: Entity[] = useMemo(() => {
    if (!room) return [];
    const npcs: Entity[] = room.npcs.map((n, i) => ({
      kind: "npc", index: i, x: n.x, z: n.z, y: 0, width: 1, depth: 1,
      label: `${i + 1}: ${n.type}`, model: npcSprite(n, room, constants) ?? undefined, direction: n.facing,
      faded: (n.chance ?? DEFAULT_CHANCE) < 100 || n.requires.length > 0,
    }));
    const exits: Entity[] = (mapInfo?.exits ?? []).map((e, k) => ({
      kind: "trigger", index: 1000 + k, x: e.x, z: e.z, y: 0, width: e.width, depth: e.depth, label: `${e.side} exit`,
    }));
    // The doors' markers' spots, 2 by 2, which NPCs should keep clear of
    const spots: Entity[] = DOORS.map((d, k) => ({
      kind: "trigger", index: 2000 + k, x: markerSpots[d][0], z: markerSpots[d][1], y: 0, width: 2, depth: 2, label: `${d} marker: keep clear`,
    }));
    return [...npcs, ...exits, ...spots];
  }, [room, mapInfo, constants, markerSpots]);
  const selectedEntity = npcIndex !== null ? entities.find((e) => e.kind === "npc" && e.index === npcIndex) ?? null : null;

  const moveNpc = (i: number, x: number, z: number) => {
    const npc = asMap(get(["npcs", i]));
    set(["npcs", i], new Map([...npc].map(([k, v]) => [k, k === "x" ? x : k === "z" ? z : v])));
  };
  const addNpc = (type: NpcType, x: number, z: number) => {
    if (!room) return;
    const list = asList(get(["npcs"]));
    set(["npcs"], [...list, newNpc(type, x, z, room, markerNames)]);
    setNpcIndex(list.length);
  };
  const freeTile = (): { x: number; z: number } => {
    if (!room) return { x: 15, z: 14 };
    for (let r = 0; r < 8; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const x = 15 + dx, z = 14 + dz;
      if (room.npcs.some((n) => n.x === x && n.z === z) || infos.some((c) => c.blocked(x, z) || exitAt(c, x, z)) || (x === ARRIVAL.x && z === ARRIVAL.z)) continue;
      return { x, z };
    }
    return { x: 15, z: 14 };
  };

  return (
    <div className="en-editor">
      <header className="en-header">
        <h2>Entree</h2>
        <Switch<View> value={view} options={["rooms", "items", "buffs"]} onChange={setView}
                      titles={{ rooms: "The rooms, the templates and the run", items: "The item table (items.json): what item rooms, gifts, shops and the ground hand out",
                                buffs: "The buff catalogue (buffs.json): the blue, purple and gold cards, their themes and the balance meter" }} />
        <span className="muted en-lead">{view === "rooms"
          ? "The Entralink roguelike's rooms: their battles, what stands in them and the markers in front of the doors leading to them."
          : view === "items" ? "The items a run hands out, by pool." : "The buff cards a run offers, their effects and the strongest hit they allow."}</span>
        <span className="spacer" />
        {unsaved.length > 0 && <span className="muted">{unsaved.length} unsaved</span>}
        <button onClick={() => unsaved.forEach((p) => void documents.reload(p))} disabled={!unsaved.length}>Revert</button>
        <button className="primary" onClick={() => void save()} disabled={!unsaved.length} title="Ctrl+S">Save</button>
      </header>
      {error && <p className="ow-error ow-bar">{error}</p>}
      {unsaved.filter((p) => docs.get(p)?.saveError).map((p) => <p key={p} className="ow-error ow-bar">{p}: {docs.get(p)?.saveError}</p>)}
      {view === "buffs" ? <BuffsPage constants={constants} /> : view === "items" ? <ItemsPage constants={constants} rooms={rooms} /> : <div className="en-body">
        <aside className="en-list">
          <RunSection rooms={rooms} templates={templateIds} />
          <div className="en-list-section">
            <h5>Rooms <span className="muted">{listed.length === rooms.length ? rooms.length : `${listed.length} of ${rooms.length}`}</span></h5>
            <div className="en-list-actions">
              <button onClick={() => setCreating(creating === null ? "" : null)} className={creating !== null ? "active" : ""} title="A new room with one battle">New</button>
              <button onClick={duplicate} disabled={!current || current.template} title={current?.template ? "A template can't be copied" : "A copy of the chosen room"}>Duplicate</button>
              {!confirmDelete
                ? <button onClick={() => setConfirmDelete(true)} disabled={!current || current.template} title={current?.template ? "A template can't be deleted" : "Delete the chosen room's file"}>Delete</button>
                : <span className="en-confirm">Delete {current?.id}? <button className="danger" onClick={() => void remove()}>Yes</button><button onClick={() => setConfirmDelete(false)}>No</button></span>}
            </div>
            {creating !== null && (
              <form className="en-create" onSubmit={(e) => { e.preventDefault(); if (creating.trim()) { create(creating.trim(), newRoomData(creating.trim())); setCreating(null); } }}>
                <input autoFocus placeholder="The new room's name" value={creating} onChange={(e) => setCreating(e.target.value)} />
                <button type="submit" disabled={!creating.trim()}>Add</button>
                <span className="muted small">file {freeId(idFromName(creating || "room"), taken)}.json</span>
              </form>
            )}
            <input className="filter" placeholder="Filter by name" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="en-filters">
              <span className="muted small">Round</span>
              <Switch<"all" | "1" | "2" | "3"> value={roundFilter} options={["all", "1", "2", "3"]} onChange={setRoundFilter}
                      titles={{ all: "Every room", 1: "Rooms that can come up in round 1", 2: "… in round 2", 3: "… in round 3" }} />
              <span className="muted small">Role</span>
              <Switch<Role | "all"> value={roleFilter} options={["all", ...ROLES]} onChange={setRoleFilter} />
              <span className="muted small">Type</span>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as RoomType | "all")} title="Rooms of role room of a type (enemy when not set)">
                <option value="all">All</option>
                {ROOM_TYPES.map((t) => <option key={t} value={t}>{cap(t)}</option>)}
              </select>
            </div>
          </div>
          <div className="en-items">
            {listed.map((r) => (
              <button key={r.id} className={`en-item ${r.path === selectedPath ? "selected" : ""}`} onClick={() => { setSelectedPath(r.path); setNpcIndex(null); setConfirmDelete(false); }}>
                <span className="en-item-name">{r.room.name || r.id}{r.dirty ? " •" : ""}</span>
                <span className="muted en-item-detail">
                  {r.room.role !== "room" ? <span className={`en-role en-role-${r.room.role}`}>{r.room.role}</span>
                    : <span className={`en-role en-type-${r.room.type ?? DEFAULT_ROOM_TYPE}`}>{r.room.type ?? DEFAULT_ROOM_TYPE}</span>}
                  {r.room.rounds.length ? `round ${r.room.rounds.join(", ")}` : "any round"}
                  {(roomProblems.get(r.path) ?? 0) > 0 && <span className="en-bad" title="Errors to fix"> ⚠ {roomProblems.get(r.path)}</span>}
                </span>
              </button>
            ))}
            {!listed.length && <p className="muted en-empty">{rooms.length ? "No room matches the filters." : "No rooms yet."}</p>}
            <h5 className="en-group-head">Templates <span className="muted">every generated room of a type is its template</span></h5>
            <p className="muted small en-empty">Random enemy rooms have no template: their battles are made as the room is entered, by the Run section's Random rooms settings.</p>
            {[...TEMPLATES, ...(templateIds.has("event") ? ["event"] : [])].map((id) => {
              const t = templates.find((x) => x.id === id);
              if (!t) return (
                <div key={id} className="en-item en-item-missing">
                  <span className="en-item-name">{cap(id.replace(/_/g, " "))} <span className="en-bad small">missing</span></span>
                  <span className="muted en-item-detail">templates/{id}.json <button className="small" onClick={() => createTemplate(id)} title="Make it with the placeholder NPCs">Make</button></span>
                </div>
              );
              return (
                <button key={id} className={`en-item ${t.path === selectedPath ? "selected" : ""}`} onClick={() => { setSelectedPath(t.path); setNpcIndex(null); setConfirmDelete(false); }}>
                  <span className="en-item-name">{t.room.name || t.id}{t.dirty ? " •" : ""}</span>
                  <span className="muted en-item-detail">
                    <span className={`en-role en-type-${TEMPLATE_TYPES[id]}`}>{TEMPLATE_TYPES[id]}</span>
                    templates/{id}.json
                    {(roomProblems.get(t.path) ?? 0) > 0 && <span className="en-bad" title="Errors to fix"> ⚠ {roomProblems.get(t.path)}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          {overall.length > 0 && (
            <div className="en-overall">
              <h5>Over all rooms</h5>
              {overall.map((m) => <p key={m} className="en-warn small">{m}</p>)}
            </div>
          )}
        </aside>

        <div className="ow-center">
          <div className="en-map-bar">
            <strong>Grid</strong>
            <span className="muted" title="Every clearing has the same 32 by 32 grid; the game picks the clearing by the door the player takes">over</span>
            <select value={shownZone} onChange={(e) => setShownZone(e.target.value)} title="The clearing drawn behind the grid, to check the NPCs' places in it">
              {zones.map((z) => <option key={z} value={z}>{clearingName(z)}{clearings.get(z) ? ` (exits ${clearings.get(z)!.info.exits.map((e) => e.side).join(", ")})` : ""}</option>)}
            </select>
            <label className="ow-check"><input type="checkbox" checked={faint} onChange={(e) => setFaint(e.target.checked)} /> Faint</label>
            <label className="ow-check"><input type="checkbox" checked={showBlocked} onChange={(e) => setShowBlocked(e.target.checked)} /> Blocked tiles</label>
            <label className="ow-check" title="The shown clearing's flower tiles (flower_tiles.json), where a hidden item may lie">
              <input type="checkbox" checked={showFlowers || mapMode === "flowers"} disabled={mapMode === "flowers"} onChange={(e) => setShowFlowers(e.target.checked)} /> Flowers
            </label>
            <span className="spacer" />
            <span className="muted small">Edit</span>
            <Switch<"npcs" | "flowers"> value={mapMode} options={["npcs", "flowers"]} onChange={setMapMode} labels={{ npcs: "NPCs", flowers: "Flower tiles" }}
                                        titles={{ npcs: "Choose, drag and add the room's NPCs", flowers: `Click or drag over tiles to make them ${clearingName(shownZone)}'s flower tiles, or not` }} />
          </div>
          <div className="en-map-hint muted small">
            {mapMode === "npcs" ? "Click an NPC to choose it, drag to move it, Shift+click a tile to add one"
              : <>{clearingName(shownZone)}: {flowers.length} flower tile{flowers.length === 1 ? "" : "s"} (every room in this clearing shares them; a hidden item lies on one). Click a tile to toggle it, drag to paint; the first tile decides on or off.</>}
            {flowerDoc?.dirty ? " • flower tiles unsaved" : ""}
          </div>
          <div className="ow-map-wrap">
            {mapError ? <p className="ow-error en-pad">{mapError}</p> : shown && room ? (
              <MapView map={shown.map} modelOpacity={faint ? 0.35 : 1} entities={entities} selected={selectedEntity} layer={0} overlay={showBlocked ? "walk" : "off"}
                       showModels painting={mapMode === "flowers"} paintType={null} preview={false} overhead tileMarks={flowerMarks}
                       onSelect={(e) => setNpcIndex(e?.kind === "npc" ? e.index : null)}
                       onMove={(e, x, z) => { if (e.kind === "npc") moveNpc(e.index, x, z); }}
                       onAdd={(x, z) => { if (mapMode === "npcs") addNpc(room.battles.length ? "battle" : current?.template ? "heal" : "item", x, z); }}
                       onPaint={paintFlowers} rails={null} railLevel={null} ground="grid"
                       onMoveRail={() => undefined} onAddRail={() => undefined} onPaintRail={() => undefined}
                       cameraAreas={null} viewCamera={null} onRect={() => undefined} drawRect={null} onMoveRailPoint={() => undefined} />
            ) : <p className="muted en-pad">{room ? "Loading the clearing…" : "Choose a room."}</p>}
          </div>
        </div>

        <div className="ow-side">
          {note && <p className="ow-note ow-error ow-side-note" onClick={() => setNote(null)} title="Click to dismiss">{note}</p>}
          {current && room && current.data !== null ? (
            <div className="ow-panel">
              <Checks problems={problems} schemaErrors={schemaErrors.map((e) => `${e.path.join(".") || "room"}: ${e.message}`)}
                      onNpc={setNpcIndex} />
              <RoomSection id={current.id} room={room} constants={constants} saved={diskPaths.includes(current.path)} template={current.template}
                           setField={(key, v) => setField([], "", key, v)} rename={rename} />
              <BattlesSection room={room} constants={constants} get={get} set={set} setField={setField} roomId={current.id}
                              replace={(data) => path && documents.replace(path, data)} data={current.data} battleOptions={battleOptions}
                              renameKeyElsewhere={renameKeyElsewhere} />
              <NpcsSection room={room} constants={constants} get={get} set={set} setField={setField} selected={npcIndex} battleOptions={battleOptions}
                           select={setNpcIndex} add={(type) => { const t = freeTile(); addNpc(type, t.x, t.z); }}
                           openPicker={() => setPicking(true)} npcOrder={orderOf("npc")} npcMarkers={npcMarkers} />
            </div>
          ) : current?.data === null ? <p className="ow-error en-pad">{current.path} isn't in a layout the editor can write back; edit it as text.</p>
            : <p className="muted en-pad">Choose a room, or make one with New.</p>}
        </div>
      </div>}
      {picking && room && npcIndex !== null && room.npcs[npcIndex] && (
        <ModelPicker constants={constants} value={room.npcs[npcIndex].sprite ?? npcSprite(room.npcs[npcIndex], room, constants) ?? ""}
                     onClose={() => setPicking(false)} onPick={(m) => { setField(["npcs", npcIndex], "npc", "sprite", m); setPicking(false); }} />
      )}
    </div>
  );
}

/** A battle's or a catch's progress id, shown and never edited: its bit in the save. */
function ProgressId({ id, kind }: { id: number | undefined; kind: "battle" | "catch" }) {
  const what = kind === "battle" ? "won-ever" : "caught-ever";
  return id === undefined
    ? <span className="en-pid en-pid-new" title={`Gets its ${what} progress id when saved`}>new id</span>
    : <span className="en-pid" title={`Its ${what} bit in the save: given once, never changed`}>{kind === "battle" ? "id" : "catch id"} {id}</span>;
}

/** A list of keys (battles won, a finished run) chosen from options, each removable; one no room has any more is
 * shown in red. */
function KeysPicker({ value, options, onChange, empty }: { value: string[]; options: Option[]; onChange(v: string[]): void; empty: string }) {
  const byKey = new Map(options.map((o) => [o.value, o]));
  return (
    <span className="en-keys">
      {value.map((k) => (
        <span key={k} className={`en-chip ${byKey.has(k) ? "" : "en-chip-bad"}`} title={byKey.has(k) ? k : `${k}: no room has this battle`}>
          {byKey.get(k)?.label ?? k}
          <button className="icon" title="Remove" onClick={() => onChange(value.filter((x) => x !== k))}>×</button>
        </span>
      ))}
      <SearchSelect value="" options={options.filter((o) => !value.includes(o.value))} placeholder={value.length ? "And…" : empty}
                    onChange={(v) => { if (v && !value.includes(v)) onChange([...value, v]); }} />
    </span>
  );
}

// ---- Run -------------------------------------------------------------------------------------------------------------

/** The Run section's open or closed state, remembered in this browser. */
const RUN_OPEN_KEY = "entree.runOpen";
function readRunOpen(): boolean {
  try { return localStorage.getItem(RUN_OPEN_KEY) !== "0"; } catch { return true; }
}

/** The Run section's random enemy rooms: the chance an enemy or enemy choice door leads to one, and how one is made
 * (run.json's random_enemy_chance and random_rooms; tools/paperwhite2/entralink_random.py checks and packs them). */
function RandomRoomsSettings({ run, setKey }: { run: RunLayout; setKey: (key: string, v: JsonValue | undefined) => void }) {
  const r = run.randomRooms;
  const set = (change: Partial<RandomRooms>) => setKey("random_rooms", randomRoomsJson({ ...r, ...change }));
  const row = (label: string, value: number, min: number, max: number, unit: string, title: string, onChange: (n: number) => void) => (
    <div className="en-run" title={title}>
      <span className="muted small">{label}</span>
      <span className="en-run-controls">
        <NumberBox value={value} min={min} max={max} width={52} onChange={onChange} />
        {unit && <span className="small">{unit}</span>}
      </span>
    </div>
  );
  return <>
    <h6 className="en-sub en-run-head">Random rooms <span className="muted">enemy and enemy choice doors</span></h6>
    {row("Random rooms", run.randomEnemyChance, 0, 100, "%", "The chance that an enemy or enemy choice door leads to a random room rather than a premade one; a random room too when no premade one fits, unless this is 0",
      (n) => setKey("random_enemy_chance", n))}
    <span className="muted small">A random room has one battle behind an enemy door, a choice of 2 or 3 behind an enemy choice door; never a raid, boss or final room. Its enemies are made as it is entered, scaled by the room curve</span>
    {RANDOM_FORMATS.map((f) => row(cap(f), r.formatWeights[f], 0, 255, "weight", `The weight a random battle is a ${f} by`,
      (n) => set({ formatWeights: { ...r.formatWeights, [f]: n } })))}
    {r.bst.map((band, i) => (
      <div key={i} className="en-run">
        <span className="muted small">Round {i + 1} BST</span>
        <span className="en-run-controls" title={`Round ${i + 1}'s random enemies' base stat total, from min to max`}>
          <NumberBox value={band.min} min={1} max={1530} width={64} onChange={(n) => set({ bst: r.bst.map((b, k) => (k === i ? { ...b, min: n } : b)) })} />
          <span className="small">to</span>
          <NumberBox value={band.max} min={1} max={1530} width={64} onChange={(n) => set({ bst: r.bst.map((b, k) => (k === i ? { ...b, max: n } : b)) })} />
        </span>
      </div>
    ))}
    <span className="muted small">Any species of the Pokédex with a walking sprite but those of legendaries.json, from its round's base stat total band; the choices of one room of different types and families</span>
    {row("Themed battles", r.themeChance, 0, 100, "%", "The chance that a double or triple's enemies all share a type or an evolution family with its first", (n) => set({ themeChance: n }))}
    {row("Level", r.level, 1, 100, "", "The random enemies' level", (n) => set({ level: n }))}
    {row("Move pool", r.movePool, 4, 12, "moves", "Its 4 moves are drawn from this many of the last level-up moves it knows at its level", (n) => set({ movePool: n }))}
    {row("TM moves", r.tmChance, 0, 100, "%", "The chance that one move is replaced by a TM, HM, tutor or egg move; one move is always damaging", (n) => set({ tmChance: n }))}
    {row("Hidden ability", r.hiddenAbilityChance, 0, 100, "%", "The chance of its hidden ability rather than one of its two", (n) => set({ hiddenAbilityChance: n }))}
    {r.anchors.map((group, n) => group.map(([x, z], k) => {
      const move = (axis: 0 | 1, v: number) => set({ anchors: r.anchors.map((g, j) => (j === n ? g.map((a, i) => (i === k ? (axis ? [a[0], v] : [v, a[1]]) as [number, number] : a)) : g)) });
      return (
        <div key={`${n}-${k}`} className="en-run">
          <span className="muted small">{n ? `${n + 1} choices, ${["1st", "2nd", "3rd"][k]}` : "1 choice"}</span>
          <span className="en-run-controls" title="The battle's tile: a single's enemy on it, a double's there and to its right, a triple's there and one tile back on either side">
            <span className="small">x</span>
            <NumberBox value={x} min={0} max={31} width={52} onChange={(v) => move(0, v)} />
            <span className="small">z</span>
            <NumberBox value={z} min={0} max={31} width={52} onChange={(v) => move(1, v)} />
          </span>
        </div>
      );
    }))}
    <span className="muted small">Where the battles stand, facing down; the build checks every format's tiles against every clearing's walls, the exits, the markers and the arrival, and that choices stand 2 tiles apart</span>
  </>;
}

/** run.json: the forest's field weather, the rounds (how many rooms each draws and whether a boss ends rounds 1 and
 * 2; the final room ends the last), with each round's pool and the draw's checks (model.ts, runProblems, as the build
 * makes them), and the maps the rooms are in, read only. */
function RunSection({ rooms, templates }: { rooms: { id: string; room: Room }[]; templates: ReadonlySet<string> }) {
  const { docs } = useDocuments();
  const [schema, setSchema] = useState<Schema | null>(null);
  const [open, setOpen] = useState(readRunOpen);
  useEffect(() => {
    documents.hold(RUN).catch(() => undefined);
    documents.hold(TINTS).catch(() => undefined);
    api.schema(RUN_SCHEMA).then(setSchema, () => undefined);
  }, []);
  // The custom tints' names (WEATHER_CUSTOM_TINT_<n> is slot n of tints.json), so the fogs read as what they are
  const tints = asList(asMap(docs.get(TINTS)?.data ?? undefined).get("tints"));
  const fogLabel = (w: string) => {
    const slot = /^WEATHER_CUSTOM_TINT_(\d+)$/.exec(w);
    const name = slot ? asMap(tints[Number(slot[1]) - 1]).get("name") : undefined;
    return typeof name === "string" ? `${weatherLabel(w)}: ${name}` : weatherLabel(w);
  };
  const doc = docs.get(RUN);
  const data = doc?.data instanceof Map ? doc.data : null;
  const run = useMemo(() => readRun(data), [data]);
  const problems = useMemo(() => runProblems(run, rooms, templates), [run, rooms, templates]);
  const weather = typeof data?.get("field_weather") === "string" ? String(data.get("field_weather")) : "";
  const choices = (schema?.$defs?.field_weather?.enum ?? schema?.properties?.field_weather?.enum ?? []).map(String);
  const order = Object.keys(schema?.properties ?? {});
  const roundSchema = schema?.$defs?.round;
  const roundOrder = Object.keys(roundSchema?.properties ?? { rooms: 0, boss: 0 });
  const maxRounds = schema?.properties?.rounds?.maxItems ?? 3;
  const maxRooms = roundSchema?.properties?.rooms?.maximum ?? 8;
  if (!data || !choices.length) return null;

  const toggle = () => {
    setOpen(!open);
    try { localStorage.setItem(RUN_OPEN_KEY, open ? "0" : "1"); } catch { /* a viewer without storage keeps it open */ }
  };
  const setKey = (key: string, v: JsonValue | undefined) => documents.replace(RUN, put(data, key, v, order));
  /** A key of run.json's hub_shop, in its schema's order. */
  const shopOrder = Object.keys(schema?.properties?.hub_shop?.properties ?? {});
  const setShop = (key: string, v: JsonValue) => setKey("hub_shop", put(asMap(data.get("hub_shop")), key, v, shopOrder));
  const rounds = asList(data.get("rounds"));
  const setRound = (i: number, key: "rooms" | "boss" | "field_weather" | "type_weights", v: JsonValue | undefined) =>
    setKey("rounds", rounds.map((r, k) => (k === i ? put(asMap(r), key, v, roundOrder) : r)));
  const total = run.rounds.reduce((n, r, i) => n + r.rooms + (r.boss && i < 2 ? 1 : 0), 0) + 1;
  /** A door's spot, every door's written once one is changed. */
  const setSpot = (door: Door, axis: 0 | 1, n: number) => {
    const spots = new Map<string, JsonValue>(DOORS.map((d) => [d, d === door ? run.markerSpots[d].map((v, k) => (k === axis ? n : v)) : [...run.markerSpots[d]]]));
    setKey("marker_spots", spots);
  };
  /** A round's weight of a type, every type's written once one is changed, in the file's order. */
  const setWeight = (i: number, type: RoomType, n: number) => {
    const weights = run.rounds[i].typeWeights ?? DEFAULT_TYPE_WEIGHTS;
    setRound(i, "type_weights", new Map<string, JsonValue>(WEIGHT_ORDER.map((t) => [t, t === type ? n : weights[t]])));
  };
  const weightsSet = rounds.some((r) => asMap(r).has("type_weights"));
  const errors = problems.filter((p) => p.severity === "error").length;
  const warnings = problems.length - errors;
  const state = [errors && `${errors} error${errors > 1 ? "s" : ""}`, warnings && `${warnings} warning${warnings > 1 ? "s" : ""}`].filter(Boolean).join(", ");
  return (
    <div className="en-list-section en-run-section">
      <h5>
        Run <span className="muted">{run.rounds.length} round{run.rounds.length === 1 ? "" : "s"}, {total} rooms{doc?.dirty ? " •" : ""}</span>
        {!open && state && <span className={errors ? "en-error small" : "en-warn small"}>{state}</span>}
        <span className="spacer" />
        <button className="link small" onClick={toggle} title={open ? "Hide the run's settings" : "Show the run's settings"}>{open ? "Hide" : "Show"}</button>
      </h5>
      {open && <>
        <div className="en-run">
          <span className="muted small">Field weather</span>
          <select value={weather} onChange={(e) => setKey("field_weather", e.target.value || undefined)} title={weather ? weatherNote(weather) : "No field weather"}>
            <option value="">None</option>
            {choices.map((w) => <option key={w} value={w}>{fogLabel(w)}</option>)}
          </select>
        </div>
        <span className="muted small">On the field in the rounds with no fog of their own</span>
        <div className="en-run">
          <span className="muted small">Unknown doors</span>
          <span className="en-run-controls">
            <NumberBox value={run.unknownChance} min={0} max={100} width={52} onChange={(n) => setKey("unknown_chance", n)} />
            <span className="small">%</span>
          </span>
        </div>
        <span className="muted small">The chance that a door to a round's room shows ??? whatever is behind it</span>
        <div className="en-run">
          <span className="muted small">Premade rooms</span>
          <span className="en-run-controls">
            <NumberBox value={run.customChance} min={0} max={100} width={52} onChange={(n) => setKey("custom_chance", n)} />
            <span className="small">%</span>
          </span>
        </div>
        <span className="muted small">The chance that a rest, item, buff or shop door leads to a premade room of the type (if one fits) instead of its template</span>
        <RandomRoomsSettings run={run} setKey={setKey} />
        <div className="en-run">
          <span className="muted small">Ground items</span>
          <span className="en-run-controls">
            <NumberBox value={run.groundItemChance} min={0} max={100} width={52} onChange={(n) => setKey("ground_item_chance", n)} />
            <span className="small">%</span>
          </span>
        </div>
        <span className="muted small">A ball of the ground pool on a free tile, in a room with no item or item-choice NPC</span>
        <div className="en-run">
          <span className="muted small">Hidden items</span>
          <span className="en-run-controls">
            <NumberBox value={run.hiddenItemChance} min={0} max={100} width={52} onChange={(n) => setKey("hidden_item_chance", n)} />
            <span className="small">%</span>
          </span>
        </div>
        <span className="muted small">An item of the ground pool hidden on one of the clearing's flower tiles (the grid's Flower tiles)</span>

        <h6 className="en-sub en-run-head">Dream Dust <span className="muted">the run's currency, for its shops</span></h6>
        {DUST_KINDS.map((kind) => (
          <div key={kind} className="en-run">
            <span className="muted small">{kind === "enemy_choice" ? "Enemy choice" : kind[0].toUpperCase() + kind.slice(1)}</span>
            <span className="en-run-controls" title={DUST_NOTES[kind]}>
              <NumberBox value={run.dust[kind]} min={0} max={9999} width={64}
                         onChange={(n) => setKey("dust", new Map<string, JsonValue>(DUST_KINDS.map((k) => [k, k === kind ? n : run.dust[k]])))} />
              <span className="small">Dust a win</span>
            </span>
          </div>
        ))}
        {run.dustRoundPercent.map((p, i) => (
          <div key={i} className="en-run">
            <span className="muted small">Round {i + 1}</span>
            <span className="en-run-controls" title={`Round ${i + 1}'s battles give this percent of their Dust`}>
              <NumberBox value={p} min={0} max={1000} width={64}
                         onChange={(n) => setKey("dust_round_percent", run.dustRoundPercent.map((v, k) => (k === i ? n : v)))} />
              <span className="small">% of it</span>
            </span>
          </div>
        ))}
        <span className="muted small">What a battle won gives (a catch counts as a win), times its round's percent; none at a run's start, lost at its end</span>
        <div className="en-run">
          <span className="muted small">Shop items</span>
          <span className="en-run-controls">
            <NumberBox value={run.shopItems} min={1} max={MAX_SHOP_ITEMS} width={52} onChange={(n) => setKey("shop_items", n)} />
          </span>
        </div>
        <span className="muted small">How many different items of the shop pool a shop sells, drawn as its room is entered, at their prices in Dream Dust (the Items tab)</span>
        <div className="en-run">
          <span className="muted small">Swap Dust</span>
          <span className="en-run-controls">
            <NumberBox value={run.swapDust} min={0} max={MAX_SWAP_DUST} width={64} onChange={(n) => setKey("swap_dust", n)} />
          </span>
        </div>
        <span className="muted small">What a swap NPC takes for bringing a Pokémon of the Reserve Box into the team in place of a copy that hasn't fainted</span>
        <div className="en-run">
          <span className="muted small">Reserve Box</span>
          <span className="en-run-controls">
            <NumberBox value={run.reserveSlots} min={1} max={MAX_RESERVE_SLOTS} width={52} onChange={(n) => setKey("reserve_slots", n)} />
            <span className="small">Pokémon</span>
          </span>
        </div>
        <span className="muted small">How many box Pokémon the Entralink's Reserve Box NPC lets the player set aside for swaps (saved as links: each is used as it is in its box when called)</span>

        <h6 className="en-sub en-run-head">Hub shop <span className="muted">Dream Shards, kept between runs</span></h6>
        {([["roomShards", "room_shards", "Room done", "a room (rests too)", 99],
          ["bossShards", "boss_shards", "Boss beaten", "more a boss", 999],
          ["finalShards", "final_shards", "Final room", "more", 999]] as const).map(([field, key, label, unit, max]) => (
          <div key={key} className="en-run">
            <span className="muted small">{label}</span>
            <span className="en-run-controls">
              <NumberBox value={run.hubShop[field]} min={0} max={max} width={52} onChange={(n) => setShop(key, n)} />
              <span className="small">Shards, {unit}</span>
            </span>
          </div>
        ))}
        <span className="muted small">Every run's end gives them (a win, a loss, the forfeit, the back door), saved in the progress block</span>
        <div className="en-run">
          <span className="muted small">Prices</span>
          <span className="en-run-controls" style={{ flexWrap: "wrap" }}>
            {run.hubShop.prices.map((p, i) => (
              <NumberBox key={i} value={p} min={0} max={9999} width={52}
                         onChange={(n) => setShop("prices", run.hubShop.prices.map((v, k) => (k === i ? n : v)))} />
            ))}
            {run.hubShop.prices.length < MAX_SHOP_PRICES && (
              <button className="icon" title="Add a price for the next pick" onClick={() => setShop("prices", [...run.hubShop.prices, shopPrice(run.hubShop, run.hubShop.prices.length)])}>+</button>
            )}
            {run.hubShop.prices.length > 1 && (
              <button className="icon" title="Remove the last price" onClick={() => setShop("prices", run.hubShop.prices.slice(0, -1))}>−</button>
            )}
          </span>
        </div>
        <div className="en-run">
          <span className="muted small">Then each pick</span>
          <span className="en-run-controls">
            <span className="small">+</span>
            <NumberBox value={run.hubShop.priceStep} min={0} max={9999} width={52} onChange={(n) => setShop("price_step", n)} />
            <span className="small">Shards</span>
          </span>
        </div>
        <span className="muted small">A card's price for its 1st, 2nd, 3rd... bought pick: {Array.from({ length: 6 }, (_, i) => shopPrice(run.hubShop, i)).join(", ")}...</span>
        <div className="en-run">
          <span className="muted small">Picks in all</span>
          <span className="en-run-controls">
            <NumberBox value={run.hubShop.totalCap} min={0} max={MAX_SHOP_TOTAL_CAP} width={52} onChange={(n) => setShop("total_cap", n)} />
            <span className="small">picks</span>
          </span>
        </div>
        <span className="muted small">The hub's shop sells blue and purple cards (not type cards) a pick at a time, up to this many across every card; each bought pick is held from every run's start and counts toward the card's cap. A Reset in the shop gives every Shard spent back</span>

        <h6 className="en-sub en-run-head">Enemy scaling <span className="muted">stats in percent, by depth</span></h6>
        <span className="muted small">A room (a raid in a room too) multiplies its enemies' stat by a curve of its depth across the whole run: First room, rising to Last room along the depth raised to Curve / 100 (so changing a round's rooms keeps the run's arc). A round's boss (round 3's: the final room) takes the curve at its round's last room times its Boss bonus; then each enemy's own Scale. tools/paperwhite2/entralink_sim.py simulates a run with them (and --fit proposes them)</span>
        <table className="en-scaling">
          <thead>
            <tr>
              <th />
              {CURVE_KEYS.map((key) => <th key={key} className="muted small" title={CURVE_KEY_TITLES[key]}>{CURVE_KEY_NAMES[key]}</th>)}
              {run.rounds.map((_, i) => <th key={i} className="muted small" title={`${i === run.rounds.length - 1 ? `Round ${i + 1}'s boss: the final room` : `Round ${i + 1}'s boss`}, in percent of the curve at its round's last room`}>Boss bonus R{i + 1}</th>)}
            </tr>
          </thead>
          <tbody>
            {SCALED_STATS.map((stat) => {
              const set = (change: (v: StatScaling) => StatScaling) => setKey("enemy_scaling", fromPlain(Object.fromEntries(SCALED_STATS.map((s) => {
                const v = s === stat ? change(run.enemyScaling[s]) : run.enemyScaling[s];
                return [s, { start: v.start, end: v.end, curve: v.curve, boss_bonus: v.bossBonus.slice(0, run.rounds.length) }];
              }))));
              return (
                <tr key={stat}>
                  <td className="muted small">{SCALED_STAT_NAMES[stat]}</td>
                  {CURVE_KEYS.map((key) => (
                    <td key={key}>
                      <NumberBox value={run.enemyScaling[stat][key]} min={key === "curve" ? 25 : 10} max={key === "curve" ? 1000 : 50000} width={76} title={CURVE_KEY_TITLES[key]}
                                 onChange={(n) => set((v) => ({ ...v, [key]: n }))} />
                    </td>
                  ))}
                  {run.rounds.map((_, i) => (
                    <td key={i}>
                      <NumberBox value={run.enemyScaling[stat].bossBonus[i]} min={10} max={50000} width={76}
                                 onChange={(n) => set((v) => ({ ...v, bossBonus: v.bossBonus.map((b, j) => (j === i ? n : b)) }))} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="en-run">
          <span className="muted small">Raid HP ×</span>
          <span className="en-run-controls">
            <NumberBox value={run.raidHpFactor} min={0.1} max={20} step={0.1} onChange={(n) => setKey("raid_hp_factor", n)} />
          </span>
        </div>
        <span className="muted small">A raid (three attackers against one foe) has its HP multiplied by this on top of its place's (a room's curve, or a boss's), the other stats as its place's (3.0 if left out)</span>
        <div className="en-run">
          <span className="muted small">Boss HP bonus, 2 foes ×</span>
          <span className="en-run-controls">
            <NumberBox value={run.bossDoubleFactor} min={0.1} max={2} step={0.05} onChange={(n) => setKey("boss_double_factor", n)} />
            <span className="muted small">3 foes ×</span>
            <NumberBox value={run.bossTripleFactor} min={0.1} max={2} step={0.05} onChange={(n) => setKey("boss_triple_factor", n)} />
          </span>
        </div>
        <span className="muted small">A boss (or the final room) of two or three foes has each foe's HP bonus multiplied by these, as its foes share the boss's HP; a raid is one foe and takes neither (0.85 and 0.7 if left out)</span>

        <h6 className="en-sub en-run-head">Rounds <span className="muted">then the final room</span></h6>
        <div className="en-list-actions">
          <button onClick={() => setKey("rounds", [...rounds, new Map<string, JsonValue>([["rooms", 3]])])} disabled={rounds.length >= maxRounds}
                  title={`A round of 3 rooms at the end (at most ${maxRounds})`}>Add round</button>
          <button onClick={() => setKey("rounds", rounds.slice(0, -1))} disabled={rounds.length <= 1} title="Removes the last round">Remove last</button>
        </div>
        {run.rounds.map((r, i) => {
          const round = (i + 1) as Round;
          const last = i === run.rounds.length - 1;
          return (
            <div key={i} className="en-run-round">
              <div className="en-run">
                <span className="muted small">Round {round}</span>
                <span className="en-run-controls">
                  <NumberBox value={r.rooms} min={0} max={maxRooms} width={52} onChange={(n) => setRound(i, "rooms", n)} />
                  <span className="small">rooms</span>
                  {round < 3
                    ? <label className="ow-check small" title="A room of role boss ends the round"><input type="checkbox" checked={r.boss} onChange={(e) => setRound(i, "boss", e.target.checked || undefined)} /> then a boss</label>
                    : <span className="muted small">then the final</span>}
                </span>
              </div>
              <div className="en-run">
                <span className="muted small">Fog</span>
                <select value={r.fieldWeather ?? ""} title={r.fieldWeather ? weatherNote(r.fieldWeather) : "The run's field weather"}
                        onChange={(e) => setRound(i, "field_weather", e.target.value || undefined)}>
                  <option value="">The run's ({weather ? fogLabel(weather) : "none"})</option>
                  {choices.map((w) => <option key={w} value={w}>{fogLabel(w)}</option>)}
                </select>
              </div>
              <span className="muted small en-run-summary">{roundSummary(rooms, round, r, last)}{last ? "; the final room takes this round's fog" : ""}</span>
            </div>
          );
        })}

        <h6 className="en-sub en-run-head">Room types <span className="muted">each door draws a type by its round's weights</span></h6>
        <div className="en-list-actions">
          <button onClick={() => setKey("rounds", rounds.map((r) => put(asMap(r), "type_weights", undefined, roundOrder)))} disabled={!weightsSet}
                  title={`Every round back to the defaults: ${WEIGHT_ORDER.map((t) => `${t} ${DEFAULT_TYPE_WEIGHTS[t]}`).join(", ")}`}>Defaults</button>
          <span className="muted small">{weightsSet ? "" : "the defaults"}</span>
        </div>
        <div className="en-weights" style={{ gridTemplateColumns: `72px repeat(${run.rounds.length}, 1fr)` }}>
          <span />
          {run.rounds.map((_, i) => <span key={i} className="muted small en-weights-head">Round {i + 1}</span>)}
          {WEIGHT_ORDER.map((t) => (
            <WeightRow key={t} type={t} rounds={run.rounds} onChange={setWeight} />
          ))}
          <span className="muted small">Sum</span>
          {run.rounds.map((r, i) => {
            const sum = WEIGHT_ORDER.reduce((n, t) => n + (r.typeWeights ?? DEFAULT_TYPE_WEIGHTS)[t], 0);
            return <span key={i} className={`small en-weights-cell ${sum ? "" : "en-error"}`}>{sum}</span>;
          })}
        </div>
        <span className="muted small">Never two rests in a row, no rest or shop just before the pre-boss rest, and a type with no room is skipped, so the chances shown are before those rules.</span>

        <h6 className="en-sub en-run-head">Maps <span className="muted">read only, run.json</span></h6>
        <div className="en-run">
          <span className="muted small">Rooms</span>
          <span className="small" title="The rooms before the final take these in turn">{run.roomMaps.map(clearingName).join(", ") || "none"}</span>
          <span className="muted small">Final</span>
          <span className="small">{run.finalMap ? clearingName(run.finalMap) : "none"}</span>
          <span className="muted small">Pre-boss</span>
          <span className="small" title="The room played just before a boss or the final room: its north door leads there">
            {run.preBossMap ? clearingName(run.preBossMap) : "none: the room maps, north door only"}</span>
        </div>

        <h6 className="en-sub en-run-head">Marker spots <span className="muted">2 by 2 from the top-left tile; drawn on the grid</span></h6>
        {DOORS.map((d) => (
          <div key={d} className="en-run">
            <span className="muted small">{cap(d)}</span>
            <span className="en-run-controls">
              <span className="muted small">x</span>
              <NumberBox value={run.markerSpots[d][0]} min={0} max={30} width={48} onChange={(n) => setSpot(d, 0, n)} />
              <span className="muted small">z</span>
              <NumberBox value={run.markerSpots[d][1]} min={0} max={30} width={48} onChange={(n) => setSpot(d, 1, n)} />
            </span>
          </div>
        ))}

        {problems.length > 0 && (
          <ul className="en-problems en-run-problems">
            {problems.map((p) => <li key={p.message} className={p.severity === "error" ? "en-error" : "en-warn"}>{p.message}</li>)}
          </ul>
        )}
      </>}
    </div>
  );
}

/** One room type's weights, a box per round with the chance it makes under it. */
function WeightRow({ type, rounds, onChange }: { type: RoomType; rounds: { typeWeights?: Record<RoomType, number> }[]; onChange(i: number, type: RoomType, n: number): void }) {
  return (
    <>
      <span className="small en-weights-type" title={ROOM_TYPE_NOTES[type]}>{cap(type)}</span>
      {rounds.map((r, i) => {
        const weights = r.typeWeights ?? DEFAULT_TYPE_WEIGHTS;
        return (
          <span key={i} className="en-weights-cell">
            <NumberBox value={weights[type]} min={0} max={255} width={50} onChange={(n) => onChange(i, type, n)} title={`Round ${i + 1}'s weight of ${type} rooms (0-255)`} />
            <span className="muted small">{percent(typeChances(weights)[type])}</span>
          </span>
        );
      })}
    </>
  );
}

/** A marker's icon, as its art draws it. */
function MarkerIcon({ path, size = 24, title }: { path: string; size?: number; title?: string }) {
  return <img className="en-marker-icon" src={api.assetUrl(path)} width={size} height={size} alt="" title={title} />;
}

// ---- Checks ----------------------------------------------------------------------------------------------------------

function Checks({ problems, schemaErrors, onNpc }: { problems: Problem[]; schemaErrors: string[]; onNpc(i: number): void }) {
  const errors = problems.filter((p) => p.severity === "error").length + schemaErrors.length;
  const warnings = problems.filter((p) => p.severity === "warning").length;
  if (!errors && !warnings) return <p className="en-ok small">✓ No problems found in this room.</p>;
  return (
    <Section title="Checks" summary={[errors && `${errors} error${errors > 1 ? "s" : ""}`, warnings && `${warnings} warning${warnings > 1 ? "s" : ""}`].filter(Boolean).join(", ")}>
      <ul className="en-problems">
        {schemaErrors.map((m) => <li key={m} className="en-error">{m}</li>)}
        {problems.map((p, i) => (
          <li key={i} className={p.severity === "error" ? "en-error" : "en-warn"}>
            {p.where.npc !== undefined ? <button className="link" onClick={() => onNpc(p.where.npc!)}>{p.message}</button> : p.message}
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---- Room ------------------------------------------------------------------------------------------------------------

const TEMPLATE_TYPE_SET = new Set<RoomType>(["rest", "item", "buff", "shop"]);
const TYPE_MARKER_NAME: Record<RoomType, string> = { enemy: "enemy", enemy_choice: "enemy choice", challenge: "challenge", rest: "rest", item: "gift", buff: "gift", shop: "shop", event: "event" };

function RoomSection({ id, room, constants, saved, template, setField, rename }: {
  id: string; room: Room; constants: Constants; saved: boolean; template: boolean;
  setField(key: string, v: JsonValue | undefined): void; rename(to: string): Promise<void>;
}) {
  const [newId, setNewId] = useState(id);
  useEffect(() => setNewId(id), [id]);
  const weathers: Option[] = [{ value: "", label: "Random", detail: "" }, ...constantOptions(constants, "BTL_WEATHER_")];
  const type = room.type ?? DEFAULT_ROOM_TYPE;
  const marker = room.marker ?? defaultMarker(room);
  if (template) return (
    <Section title="Template" summary={`${type}, templates/${id}.json`}>
      <p className="en-template-note small">{TEMPLATE_NOTES[id] ?? "A template."} Every room the run makes from it has its NPCs, sprites, markers and dialogue as set here; the door in front shows the {TYPE_MARKER_NAME[type]} marker.</p>
      <div className="ow-condition">
        <Row label="Name" hint="For the editor">
          <input className="en-wide" value={room.name} onChange={(e) => setField("name", e.target.value)} />
        </Row>
        <Row label="Type" hint="A template's type is its file's">
          <span className="small">{cap(type)}</span>
          <span className="muted small">{ROOM_TYPE_NOTES[type]}</span>
        </Row>
        <Row label="Weather" hint={room.weather ? "Its battles start in it" : "Its battles take the field's"}>
          <SearchSelect value={room.weather ?? ""} options={weathers} placeholder="The field's / random" onChange={(v) => setField("weather", v || undefined)} />
        </Row>
      </div>
    </Section>
  );
  return (
    <Section title="Room" summary={`${room.role === "room" ? type : room.role}, ${room.rounds.length ? `round ${room.rounds.join(", ")}` : "any round"}`}>
      <div className="ow-condition">
        <Row label="Name">
          <input className="en-wide" value={room.name} onChange={(e) => setField("name", e.target.value)} />
        </Row>
        <Row label="File" hint={saved ? "Rename saves the room under its new name at once" : "Saved under this name with Save"}>
          <input className="en-id" value={newId} onChange={(e) => setNewId(e.target.value.toLowerCase())} />
          <span className="muted">.json</span>
          {saved && <button disabled={newId === id || !ID_PATTERN.test(newId)} onClick={() => void rename(newId)}>Rename</button>}
        </Row>
        <Row label="Rounds" hint={room.rounds.length ? `Only ${room.rounds.map((r) => `round ${r} (${ROUND_NOTES[r]})`).join(", ")}` : "Any round; tick rounds to keep it to them"}>
          <label className="ow-check">
            <input type="checkbox" checked={!room.rounds.length} disabled={!room.rounds.length} onChange={() => setField("rounds", undefined)} /> Any round
          </label>
          {ROUNDS.map((r) => (
            <label key={r} className="ow-check" title={ROUND_NOTES[r]}>
              <input type="checkbox" checked={room.rounds.includes(r)} onChange={(e) => {
                const next = ROUNDS.filter((x) => (x === r ? e.target.checked : room.rounds.includes(x)));
                setField("rounds", next.length ? [...next] : undefined);
              }} /> {r}
            </label>
          ))}
        </Row>
        <Row label="Role" hint={ROLE_NOTES[room.role]}>
          <Switch value={room.role} options={ROLES} onChange={(v) => setField("role", v)} titles={ROLE_NOTES} />
        </Row>
        {room.role === "room" ? (
          <Row label="Type" hint={`${ROOM_TYPE_NOTES[type].replace(/\.$/, "")}${room.type ? "" : " (the default)"}. Doors draw a type by the round's weights (Run)${TEMPLATE_TYPE_SET.has(type) ? `; a premade ${type} room comes up instead of the template at the Premade rooms chance` : ""}.`}>
            <span className="en-type-switch">
              <Switch<RoomType> value={type} options={ROOM_TYPES} titles={ROOM_TYPE_NOTES} onChange={(v) => setField("type", v === DEFAULT_ROOM_TYPE ? undefined : v)} />
            </span>
          </Row>
        ) : room.type ? (
          <Row label="Type" hint={`A ${room.role} room's type isn't used`}>
            <span className="small">{room.type}</span>
            <button onClick={() => setField("type", undefined)}>Clear</button>
          </Row>
        ) : null}
        <Row label="Weather" hint={room.weather ? "Its battles start in it; the field keeps its round's fog (Run, above the rooms)"
          : "Its battles take the field's; in battle random (designed later)"}>
          <SearchSelect value={room.weather ?? ""} options={weathers} placeholder="The field's / random" onChange={(v) => setField("weather", v || undefined)} />
        </Row>
        <Row label="Marker" hint={`In front of any door leading to it: ${MARKER_NOTES[marker].toLowerCase()}${room.marker ? "" : room.role === "room" ? " (its type's)" : " (its role's)"}. `
          + "Enemy, enemy choice, challenge and boss show catch instead while one of its enemies can be caught and the run's bag holds a Nightmare Ball"}>
          <span className="en-markers">
            {MARKER_TYPES.map((m) => (
              <button key={m} className={marker === m ? "active" : ""} title={`${MARKER_NOTES[m]}${defaultMarker(room) === m ? " (the default)" : ""}`}
                      onClick={() => setField("marker", m === defaultMarker(room) ? undefined : m)}>
                <MarkerIcon path={markerArt(m)} size={24} />
              </button>
            ))}
          </span>
          <span className="small">{cap(marker)}{room.marker ? "" : <span className="muted"> (default)</span>}</span>
        </Row>
      </div>
    </Section>
  );
}

// ---- Battles ---------------------------------------------------------------------------------------------------------

interface EditProps {
  room: Room;
  constants: Constants;
  get(at: JsonPath): JsonValue | undefined;
  set(at: JsonPath, v: JsonValue | undefined): void;
  setField(at: JsonPath, def: string, key: string, v: JsonValue | undefined): void;
}

function BattlesSection({ room, roomId: id, constants, get, set, setField, replace, data, battleOptions, renameKeyElsewhere }: EditProps & {
  roomId: string; replace(data: JsonValue): void; data: JsonValue; battleOptions: Option[]; renameKeyElsewhere(from: string, to: string): void;
}) {
  const battles = asList(get(["battles"]));
  const add = () => {
    const id = freeId("battle", new Set(room.battles.map((b) => b.id)));
    set(["battles"], [...battles, fromPlain({ id, format: "single", enemies: [{ species: "SPECIES_BULBASAUR", level: DEFAULT_LEVEL }] })]);
  };
  /** Renames a battle, the NPCs that start it and what every room's catches and spawn conditions name of it. */
  const renameBattle = (i: number, from: string, to: string) => {
    let next = setIn(data, ["battles", i, "id"], to);
    room.npcs.forEach((n, j) => { if (n.type === "battle" && n.battle === from) next = setIn(next, ["npcs", j, "battle"], to); });
    replace(renameKeys(next, battleKey(id, from), battleKey(id, to)) ?? next);
    renameKeyElsewhere(battleKey(id, from), battleKey(id, to));
  };
  const removeBattle = (i: number) => set(["battles"], battles.filter((_, j) => j !== i));
  return (
    <Section title="Battles" summary={room.battles.length ? `${room.battles.length} battle${room.battles.length > 1 ? "s" : ""}` : "none: a free room"}
             actions={<button onClick={add} disabled={room.battles.length >= 8}>+ Add a battle</button>}>
      {room.battles.map((b, i) => {
        const { max } = FORMAT_ENEMIES[b.format];
        const starters = room.npcs.map((n, j) => ({ n, j })).filter(({ n }) => n.type === "battle" && n.battle === b.id);
        return (
          <div key={i} className="en-battle">
            <div className="en-battle-head">
              <input className="en-id" value={b.id} title="Its id, which battle NPCs name it by"
                     onChange={(e) => renameBattle(i, b.id, e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} />
              <span className="muted small">{starters.length ? `started by NPC ${starters.map(({ j }) => j + 1).join(", ")}` : "no NPC starts it"}</span>
              <span className="spacer" />
              <ProgressId id={b.progressId} kind="battle" />
              <button className="icon" title="Remove the battle" onClick={() => removeBattle(i)}>×</button>
            </div>
            <div className="ow-condition">
              <Row label="Format" hint={FORMAT_NOTES[b.format]}>
                <Switch value={b.format} options={FORMATS} titles={FORMAT_NOTES} onChange={(v) => setField(["battles", i], "battle", "format", v)} />
              </Row>
            </div>
            {b.enemies.map((_, k) => (
              <EnemyCard key={k} at={["battles", i, "enemies", k]} index={k} over={k >= max} constants={constants} get={get} set={set} setField={setField}
                         battleOptions={battleOptions} ownKey={battleKey(id, b.id)}
                         remove={b.enemies.length > 1 ? () => set(["battles", i, "enemies"], asList(get(["battles", i, "enemies"])).filter((__, j) => j !== k)) : undefined} />
            ))}
            <div className="ow-section-actions en-enemy-add">
              <button disabled={b.enemies.length >= max} title={b.enemies.length >= max ? `A ${b.format} battle takes ${max === 1 ? "one enemy" : `at most ${max}`}` : undefined}
                      onClick={() => set(["battles", i, "enemies"], [...asList(get(["battles", i, "enemies"])), fromPlain({ species: "SPECIES_BULBASAUR", level: DEFAULT_LEVEL })])}>+ Add an enemy</button>
              <span className="muted">{b.enemies.length} of {max}</span>
            </div>
          </div>
        );
      })}
    </Section>
  );
}

function EnemyCard({ at, index, over, constants, get, set, setField, remove, battleOptions, ownKey }: {
  at: JsonPath; index: number; over: boolean; constants: Constants; remove?: () => void; battleOptions: Option[]; ownKey: string;
  get(at: JsonPath): JsonValue | undefined; set(at: JsonPath, v: JsonValue | undefined): void;
  setField(at: JsonPath, def: string, key: string, v: JsonValue | undefined): void;
}) {
  const e = asMap(get(at));
  const f = (key: string, v: JsonValue | undefined) => setField(at, "enemy", key, v);
  const species = String(e.get("species") ?? "");
  const moves = asList(e.get("moves")).map(String);
  const moveOptions = useMoveOptions(species, Number(e.get("form") ?? 0), constants);
  const setMove = (i: number, v: string) => {
    const next = [0, 1, 2, 3].map((j) => (j === i ? v : moves[j] ?? "MOVE_NONE"));
    while (next.length && (next[next.length - 1] === "MOVE_NONE" || !next[next.length - 1])) next.pop();
    f("moves", next.length ? next.map((m) => m || "MOVE_NONE") : undefined);
  };
  const abilities: Option[] = [{ value: "", label: "Either of its two", detail: "" }, { value: "hidden", label: "Its hidden ability", detail: "" },
    ...constantOptions(constants, "ABILITY_")];
  const sprite = walkingSprite(species, constants);
  const caught = e.get("catch");
  const terms = caught instanceof Map ? caught : null;
  const after = asList(terms?.get("after")).map(String);
  const once = terms?.get("once") !== false;
  /** The catch's terms, written with both keys, as the format's example has them. */
  const setCatch = (next: { after: string[]; once: boolean } | null) =>
    f("catch", next ? fromPlain({ after: next.after, once: next.once }) : undefined);
  return (
    <div className={`en-enemy ${over ? "en-over" : ""}`}>
      <div className="en-enemy-head">
        <SpeciesIcon species={species} />
        <strong>Enemy {index + 1}</strong>
        <SearchSelect value={species} options={constantOptions(constants, "SPECIES_")} onChange={(v) => v && f("species", v)} />
        {sprite ? <SpriteImage model={sprite} direction="DIR_DOWN" size={28} /> : <span className="muted small" title="No walking sprite: its NPCs need a sprite of their own">no sprite</span>}
        <span className="spacer" />
        {remove && <button className="icon" title="Remove the enemy" onClick={remove}>×</button>}
      </div>
      <div className="ow-condition">
        <Row label="Level" hint="Its level; the run scales its stats with the run's depth (the Run section's Enemy scaling)">
          <NumberBox value={Number(e.get("level") ?? DEFAULT_LEVEL)} min={1} max={100} onChange={(n) => f("level", n)} />
          <span className="muted">Form</span>
          <NumberBox value={Number(e.get("form") ?? 0)} min={0} max={255} onChange={(n) => f("form", n || undefined)} />
        </Row>
        <Row label="Scale" hint="Its own multiplier on every stat, on top of the run's scaling by depth, for an enemy that comes out too easy or too hard (100: none)">
          <NumberBox value={Number(e.get("scale") ?? DEFAULT_ENEMY_SCALE)} min={10} max={1000} width={64}
                     onChange={(n) => f("scale", n === DEFAULT_ENEMY_SCALE ? undefined : n)} />
          <span className="muted small">%</span>
        </Row>
        <Row label="Moves" hint={moves.length ? undefined : "Left empty: the moves of its level"}>
          <span className="en-moves">
            {[0, 1, 2, 3].map((i) => <SearchSelect key={i} value={moves[i] ?? ""} placeholder="—" options={moveOptions} onChange={(v) => setMove(i, v)} />)}
          </span>
        </Row>
        <Row label="Ability">
          <SearchSelect value={String(e.get("ability") ?? "")} options={abilities} placeholder="Either of its two" onChange={(v) => f("ability", v || undefined)} />
        </Row>
        <Row label="Held item">
          <SearchSelect value={String(e.get("item") ?? "")} options={constantOptions(constants, "ITEM_")} placeholder="None"
                        onChange={(v) => f("item", v && v !== "ITEM_NONE" ? v : undefined)} />
        </Row>
        <Row label="Gender">
          <span className="view-switch">
            {([["", "Random"], ["male", "Male"], ["female", "Female"]] as const).map(([v, l]) => (
              <button key={v} className={String(e.get("gender") ?? "") === v ? "active" : ""} onClick={() => f("gender", v || undefined)}>{l}</button>
            ))}
          </span>
          <label className="ow-check"><input type="checkbox" checked={e.get("shiny") === true} onChange={(ev) => f("shiny", ev.target.checked ? true : undefined)} /> Shiny</label>
        </Row>
        <Row label="Catching" hint={terms ? "Only the Nightmare Ball catches it, always when allowed; a capture wins the battle" : "Only the Nightmare Ball catches, and only enemies allowed here"}>
          <label className="ow-check">
            <input type="checkbox" checked={!!terms} onChange={(ev) => setCatch(ev.target.checked ? { after: [], once: DEFAULT_ONCE } : null)} /> Can be caught
          </label>
          {terms && <ProgressId id={typeof e.get("progress_id") === "number" ? Number(e.get("progress_id")) : undefined} kind="catch" />}
        </Row>
        {terms && <>
          <Row label="Only after" hint={after.length ? "Catchable once all of these have been won, in any run or earlier in this one" : "Catchable from the first encounter"}>
            <KeysPicker value={after} options={battleOptions.filter((o) => o.value !== ownKey)} empty="Winning… (any battle)"
                        onChange={(v) => setCatch({ after: v, once })} />
          </Row>
          <Row label="" hint={once ? "Once caught, it can never be caught again" : "It can be caught again in later runs"}>
            <label className="ow-check"><input type="checkbox" checked={once} onChange={(ev) => setCatch({ after, once: ev.target.checked })} /> Only once</label>
          </Row>
        </>}
      </div>
    </div>
  );
}

// ---- NPCs ------------------------------------------------------------------------------------------------------------

function NpcsSection({ room, constants, get, set, setField, selected, select, add, openPicker, npcOrder, battleOptions, npcMarkers }: EditProps & {
  selected: number | null; select(i: number | null): void; add(type: NpcType): void; openPicker(): void; npcOrder: string[]; battleOptions: Option[];
  npcMarkers: string[];
}) {
  const spawnOptions: Option[] = useMemo(() => [{ value: RUN_COMPLETED, label: "Finished a run", detail: "the final room beaten once" }, ...battleOptions], [battleOptions]);
  const npc = selected !== null ? room.npcs[selected] : undefined;
  const at: JsonPath = ["npcs", selected ?? 0];
  const f = (key: string, v: JsonValue | undefined) => setField(at, "npc", key, v);
  /** Several of its fields at once, in one edit. */
  const fields = (changes: Record<string, JsonValue | undefined>) => {
    let next = asMap(get(at));
    for (const [k, v] of Object.entries(changes)) next = put(next, k, v, npcOrder);
    set(at, next);
  };
  const markerSet = useMemo(() => new Set(npcMarkers), [npcMarkers]);
  const changeType = (type: NpcType) => {
    if (!npc || selected === null) return;
    // Drops what the old type used, gives what the new one needs; its own sprite stays while it is still a person or
    // still a ball, its marker unless it was the old type's default
    let next = newNpc(type, npc.x, npc.z, room, markerSet);
    const look = (t: NpcType) => (t === "battle" ? "battle" : BALL_TYPES.includes(t) ? "ball" : "person");
    const kept = ["requires", "chance", "facing", "dialogue", ...(look(type) === look(npc.type) && type !== "battle" ? ["sprite"] : []),
      ...(npc.marker && npc.marker !== NPC_DEFAULT_MARKERS[npc.type] ? ["marker"] : [])];
    for (const [k, v] of asMap(get(at))) if (kept.includes(k)) next = put(next, k, v, npcOrder);
    set(at, next);
  };
  const battle = npc?.type === "battle" ? room.battles.find((b) => b.id === npc.battle) : undefined;
  /** One of its messages: an empty one is left out, and so is the dialogue with none. */
  const setDialogue = (key: "before" | "after" | "before_style" | "after_style", value: string | undefined) => {
    let next = put(asMap(get([...at, "dialogue"])), key, value || undefined, DIALOGUE_KEYS);
    // A message's style goes with it
    if ((key === "before" || key === "after") && !value) next = put(next, `${key}_style`, undefined, DIALOGUE_KEYS);
    f("dialogue", next.size ? next : undefined);
  };
  /** A message's window picker, beside its box: talk, the default, is left out of the file. */
  const stylePicker = (key: "before" | "after", value: MessageStyle) => (
    <>
      <span className="muted small">Window</span>
      <Switch<MessageStyle> value={value} options={MESSAGE_STYLES} titles={MESSAGE_STYLE_NOTES}
                            onChange={(v) => setDialogue(`${key}_style`, v === "talk" ? undefined : v)} />
    </>
  );
  const defaultSprite = npc ? npcSprite({ ...npc, sprite: undefined }, room, constants) : null;
  const sprite = npc ? npcSprite(npc, room, constants) : null;
  return (
    <Section title="NPCs" summary={room.npcs.length ? `${room.npcs.length} in the room` : "none: the room is free"}
             actions={<>
               <span className="muted">Add</span>
               {(["battle", "item", "heal", "item_choice"] as NpcType[]).map((t) => <button key={t} onClick={() => add(t)} title={TYPE_NOTES[t]}>+ {TYPE_LABELS[t]}</button>)}
               <select value="" onChange={(e) => { if (e.target.value) add(e.target.value as NpcType); }} title="Add an NPC of another type">
                 <option value="">+ Other…</option>
                 <TypeOptions />
               </select>
             </>}>
      <div className="en-npcs">
        {room.npcs.map((n, i) => {
          const s = npcSprite(n, room, constants);
          const what = n.type === "battle" ? `${n.battle ?? "?"}${shownEnemy(n, room) ? `, ${label(shownEnemy(n, room)!.species, "SPECIES_")}` : ""}`
            : n.type === "item" ? `${label(n.item, "ITEM_")}${(n.count ?? 1) > 1 ? ` ×${n.count}` : ""}`
            : n.type === "item_choice" ? "drawn from the item room pool" : n.type === "gift" ? "3 from the gift pool"
            : n.type === "ambient" ? ((n.behaviour ?? AMBIENT_DEFAULTS.behaviour) === "flee" ? "flees" : n.return ? "fades, returns" : "fades") : "";
          return (
            <button key={i} className={`en-npc ${i === selected ? "selected" : ""}`} onClick={() => select(i === selected ? null : i)}>
              {s ? <SpriteImage model={s} direction={n.facing} size={24} /> : <span className="en-nosprite">?</span>}
              <span className="en-npc-name">{i + 1}. {TYPE_LABELS[n.type]} <span className="muted">{what}</span></span>
              <span className="muted small">{n.x}, {n.z} {ARROWS[n.facing]}{(n.chance ?? 100) < 100 ? ` · ${n.chance}%` : ""}{n.requires.length ? " · after" : ""}{n.dialogue?.before || n.dialogue?.after ? " · 💬" : ""}</span>
            </button>
          );
        })}
      </div>
      {npc && selected !== null && (
        <div className="en-npc-panel">
          <div className="en-battle-head">
            <strong>NPC {selected + 1}</strong>
            <span className="muted small">{TYPE_NOTES[npc.type]}</span>
            <span className="spacer" />
            <button title="Remove the NPC" onClick={() => { set(["npcs"], asList(get(["npcs"])).filter((_, j) => j !== selected)); select(null); }}>Remove</button>
          </div>
          <div className="ow-condition">
            <Row label="Type" hint={CHOICE_NOTE.has(npc.type) ? "Using it is the room's choice: the room's other heal, revive, gift, shop and item-choice NPCs go and the room is done (battle NPCs stay, optional)"
              : npc.type === "ambient" ? "No talk action, and it never keeps the room from being done. It stands on its tile like any NPC (the checks for exits, the arrival tile and the doors' markers apply) and blocks the way while shown. Use several as decoys round the room's real battle NPC" : undefined}>
              <select value={npc.type} onChange={(e) => changeType(e.target.value as NpcType)} title={TYPE_NOTES[npc.type]}>
                <TypeOptions />
              </select>
            </Row>
            {npc.type === "battle" && <>
              <Row label="Battle" hint={battle ? `${cap(battle.format)}: ${battle.enemies.map((e) => label(e.species, "SPECIES_")).join(", ")}` : "Choose the battle it starts"}>
                <select value={npc.battle ?? ""} onChange={(e) => f("battle", e.target.value)}>
                  {!battle && <option value={npc.battle ?? ""}>{npc.battle ? `${npc.battle} (missing)` : "—"}</option>}
                  {room.battles.map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
                </select>
              </Row>
              {battle && (
                <Row label="Shows" hint="The enemy whose sprite it shows and whose cry it plays">
                  <select value={npc.enemy ?? 0} onChange={(e) => f("enemy", Number(e.target.value) || undefined)}>
                    {battle.enemies.map((e, k) => <option key={k} value={k}>Enemy {k + 1}: {label(e.species, "SPECIES_")}</option>)}
                  </select>
                </Row>
              )}
            </>}
            {npc.type === "item" && (
              <Row label="Item">
                <SearchSelect value={npc.item ?? ""} options={constantOptions(constants, "ITEM_")} onChange={(v) => f("item", v || undefined)} />
                <span className="muted">×</span>
                <NumberBox value={npc.count ?? DEFAULT_COUNT} min={1} max={99} width={56} onChange={(n) => f("count", n === 1 ? undefined : n)} />
              </Row>
            )}
            {npc.type === "ambient" && <>
              <Row label="Behaviour" hint={AMBIENT_NOTES[npc.behaviour ?? AMBIENT_DEFAULTS.behaviour]}>
                <Switch<AmbientBehaviour> value={npc.behaviour ?? AMBIENT_DEFAULTS.behaviour} options={AMBIENT_BEHAVIOURS} titles={AMBIENT_NOTES}
                                          onChange={(v) => fields(v === "flee"
                                            // (a fleeing one doesn't come back, and a fading one doesn't run)
                                            ? { behaviour: v, return: undefined, far: undefined }
                                            : { behaviour: undefined, distance: undefined })} />
              </Row>
              <Row label="Near" hint="It reacts once the player is this close, in tiles either way (a square round it), while no event runs">
                <NumberBox value={npc.near ?? AMBIENT_DEFAULTS.near} min={1} max={15} onChange={(n) => f("near", n === AMBIENT_DEFAULTS.near ? undefined : n)} />
                <span className="muted">tiles</span>
              </Row>
              {(npc.behaviour ?? AMBIENT_DEFAULTS.behaviour) === "fade" ? (
                <Row label="Return" hint={npc.return ? "Faded, its actor goes (it doesn't block the way) and comes back, fading in, once the player is Far tiles from its tile" : "Gone for the rest of the room once faded"}>
                  <label className="ow-check small"><input type="checkbox" checked={!!npc.return} onChange={(e) => fields(e.target.checked ? { return: true } : { return: undefined, far: undefined })} /> Fades back in</label>
                  {npc.return && <>
                    <span className="muted">Far</span>
                    <NumberBox value={npc.far ?? AMBIENT_DEFAULTS.far} min={2} max={31} onChange={(n) => f("far", n === AMBIENT_DEFAULTS.far ? undefined : n)} />
                    <span className="muted">tiles</span>
                  </>}
                </Row>
              ) : (
                <Row label="Distance" hint="The tiles it runs away from the player (fewer where trees or the clearing's edge stop it), a tile about every 8 frames, fading over the last quarter of a second">
                  <NumberBox value={npc.distance ?? AMBIENT_DEFAULTS.distance} min={1} max={15} onChange={(n) => f("distance", n === AMBIENT_DEFAULTS.distance ? undefined : n)} />
                  <span className="muted">tiles</span>
                </Row>
              )}
            </>}
            <Row label="Look" hint={npc.sprite ? "Its own sprite" : defaultSprite === ITEM_BALL_SPRITE ? (npc.type === "buff_choice" ? "The item ball (a buff ball's own look comes later; its marker tells it apart)" : "The item ball") : defaultSprite === LADY_SPRITE ? "The Lady, the default for people" : defaultSprite ? "Its enemy's walking Pokémon" : "Its enemy has no overworld sprite: Browse for one"}>
              {sprite ? <SpriteImage model={sprite} direction={npc.facing} size={32} /> : <span className="en-nosprite">?</span>}
              <span className="small">{sprite ? label(sprite, "OBJ_CODE_") : "none"}</span>
              <button onClick={openPicker}>Browse…</button>
              {npc.sprite && (
                <button onClick={() => f("sprite", undefined)} title={`Back to its type's sprite (${npcSprite({ ...npc, sprite: undefined }, room, constants) ?? "its enemy's"})`}>Default</button>
              )}
            </Row>
            <Row label="Marker" hint={npc.marker ? `Floats over its head: ${npcMarkerArt(npc.marker)}` : "An icon over its head, from npc_markers/ (16 by 16)"}>
              <span className="en-markers">
                <button className={!npc.marker ? "active" : ""} onClick={() => f("marker", undefined)} title="No marker">None</button>
                {npcMarkers.map((m) => (
                  <button key={m} className={npc.marker === m ? "active" : ""} title={m} onClick={() => f("marker", m)}>
                    <MarkerIcon path={npcMarkerArt(m)} size={20} />
                  </button>
                ))}
                {npc.marker && !npcMarkers.includes(npc.marker) && <button className="active" title="No art for it">{npc.marker} (missing)</button>}
              </span>
              {npc.marker && <span className="small">{npc.marker}</span>}
            </Row>
            <Row label="Chance" hint="Its chance to spawn each time the room comes up">
              <NumberBox value={npc.chance ?? DEFAULT_CHANCE} min={1} max={100} onChange={(n) => f("chance", n === 100 ? undefined : n)} />
              <span className="muted">%</span>
            </Row>
            <Row label="Spawns after" hint={npc.requires.length ? "Spawns only once all of these hold (battles won in any run)" : "Spawns from the first run"}>
              <KeysPicker value={npc.requires} options={spawnOptions} empty="Always"
                          onChange={(v) => f("requires", v.length ? v : undefined)} />
            </Row>
            <Row label="Tile" hint={`Or drag it on the map; the player arrives at ${ARRIVAL.x}, ${ARRIVAL.z}`}>
              <span className="muted">x</span><NumberBox value={npc.x} min={0} max={31} onChange={(n) => f("x", n)} />
              <span className="muted">z</span><NumberBox value={npc.z} min={0} max={31} onChange={(n) => f("z", n)} />
            </Row>
            <Row label="Facing">
              <span className="view-switch">
                {FACINGS.map((d) => <button key={d} className={npc.facing === d ? "active" : ""} title={FACING_NAMES[d]} onClick={() => f("facing", d)}>{ARROWS[d]}</button>)}
              </span>
              <span className="muted">{FACING_NAMES[npc.facing]}</span>
            </Row>
          </div>
          {npc.type !== "ambient" && <>
          <h6 className="en-sub">Dialogue <span className="muted">typed here; the build makes its text</span></h6>
          <div className="ow-condition en-dialogue">
            <Row label={npc.type === "battle" ? "Before" : "On talking"}>
              <DialogueField value={npc.dialogue?.before ?? ""} onChange={(v) => setDialogue("before", v)} inserts={ROOM_INSERTS} words={ROOM_WORDS}
                             look={npc.dialogue?.beforeStyle ?? "talk"} actions={stylePicker("before", npc.dialogue?.beforeStyle ?? "talk")}
                             placeholder={TALK_PLACEHOLDERS[npc.type] ?? "What it says"} />
            </Row>
            {npc.type === "battle" && (
              <Row label="After the battle">
                <DialogueField value={npc.dialogue?.after ?? ""} onChange={(v) => setDialogue("after", v)} inserts={ROOM_INSERTS} words={ROOM_WORDS}
                               look={npc.dialogue?.afterStyle ?? "talk"} actions={stylePicker("after", npc.dialogue?.afterStyle ?? "talk")}
                               placeholder="What it says once the battle is won, before the room opens" />
              </Row>
            )}
          </div>
          </>}
        </div>
      )}
      {!npc && room.npcs.length > 0 && <p className="muted small">Choose an NPC here or on the map to edit it.</p>}
    </Section>
  );
}

const CHOICE_NOTE = new Set<NpcType>(["heal", "revive", "gift", "shop", "swap", "item_choice"]);

/** The NPC types as a select's options, grouped. */
function TypeOptions() {
  return <>{TYPE_GROUPS.map(([group, types]) => (
    <optgroup key={group} label={group}>
      {types.map((t) => <option key={t} value={t} title={TYPE_NOTES[t]}>{TYPE_LABELS[t]}</option>)}
    </optgroup>
  ))}</>;
}
