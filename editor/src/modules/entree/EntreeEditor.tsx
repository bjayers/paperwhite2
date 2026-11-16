// The Entree page: the rooms of the Entralink roguelike (res/paperwhite2/entralink/rooms/, model.ts). The list of rooms
// on the left (new, duplicate, delete, filtered by round and role); in the middle the forest clearings' shared 32 by 32
// grid, top down (the Overworld Editor's map view), with one clearing faint behind it for reference, its exits, and the
// room's NPCs as their sprites, chosen, dragged and added there (a room has no map of its own: the game picks the
// clearing by the door taken); and on the right the room's checks and its headed sections, laid out as the Ambients panel
// is: Room, Battles, NPCs. Every room file is held in the
// document store, so undo, the build's check on Save and changes on disk work as for any file.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import { fromPlain, getIn, setIn, type JsonMap, type JsonPath, type JsonValue } from "../../../shared/json.ts";
import { validate, type Constants, type Schema } from "../../../shared/schema.ts";
import { SearchSelect, type Option } from "../../shell/SearchSelect.tsx";
import { constantLabel, constantOptions } from "../schema-form/form.tsx";
import { SpeciesIcon } from "../pokemon/SpeciesIcon.tsx";
import { MapView } from "../overworld/MapView.tsx";
import { ModelPicker, SpriteImage } from "../overworld/fields.tsx";
import type { Entity } from "../overworld/entities.ts";
import { TILE_FLAG_COLLISION, loadZoneMap, tileAt, tileFlags, tileIsValid, type ZoneMap } from "../overworld/terrain.ts";
import { useNotes } from "../flags/notes.ts";
import { useToolActive } from "../active.ts";
import type { ToolProps } from "../types.ts";
import {
  ARRIVAL, CLEARINGS_PREFIX, exitAt, ROUNDS, ROUND_NOTES, clearingName, inRound, DEFAULT_CHANCE, DEFAULT_COUNT, DEFAULT_LEVEL, EXIT_SCRIPTS, FACINGS, FORMAT_ENEMIES, FORMATS, ID_PATTERN,
  ITEM_BALL_SPRITE, NPC_TYPES, ROLES, ROOMS_DIR, ROOM_SCHEMA, checkRoom, checkRooms, freeId, idFromName, newNpc,
  newRoomData, npcSprite, readRoom, roomId, roomPath, shownEnemy, walkingSprite,
  type Round, type Exit, type MapInfo, type NpcType, type Problem, type Role, type Room,
} from "./model.ts";

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
const TYPE_NOTES: Record<NpcType, string> = {
  battle: "Talking to it starts the battle it names.",
  item: "Gives an item and goes.",
  rest: "Opens the rest menu (built later).",
  buff: "Opens the buff menu (built later).",
};
const zoneFile = (zone: string) => zone.replace(/^ZONE_/, "").toLowerCase();
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const asMap = (v: JsonValue | undefined): JsonMap => (v instanceof Map ? v : new Map());
const asList = (v: JsonValue | undefined): JsonValue[] => (Array.isArray(v) ? v : []);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
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

// ---- Layout pieces, as the Ambients panel's ------------------------------------------------------------------------

function Section({ title, summary, actions, children }: { title: string; summary?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="ow-panel-box ow-section en-section">
      <h5>{title} {summary !== undefined && <span className="muted">{summary}</span>}</h5>
      {actions && <div className="ow-section-actions">{actions}</div>}
      {children}
    </section>
  );
}

function Row({ label: text, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <>
      <span className="ow-condition-label">{text}</span>
      <span className="ow-xyz">
        {children}
        {hint && <span className="muted hint">{hint}</span>}
      </span>
    </>
  );
}

function NumberBox({ value, min, max, onChange, width = 64 }: { value: number; min: number; max: number; onChange(n: number): void; width?: number }) {
  return <input type="number" className="en-number" style={{ width }} min={min} max={max} value={value}
                onChange={(e) => onChange(clamp(Math.round(Number(e.target.value) || 0), min, max))} />;
}

function Switch<T extends string>({ value, options, onChange, titles }: { value: T; options: readonly T[]; onChange(v: T): void; titles?: Record<string, string> }) {
  return (
    <span className="view-switch">
      {options.map((o) => <button key={o} className={o === value ? "active" : ""} title={titles?.[o]} onClick={() => onChange(o)}>{cap(o)}</button>)}
    </span>
  );
}

// ---- The page --------------------------------------------------------------------------------------------------------

interface Listed { id: string; path: string; room: Room; dirty: boolean; data: JsonValue | null }

export function EntreeEditor({ constants }: ToolProps) {
  const { docs } = useDocuments();
  const toolActive = useToolActive();
  const [diskPaths, setDiskPaths] = useState<string[]>([]);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  }, []);
  useEffect(() => { refresh(); return documents.onFiles((paths) => { if (paths.some((p) => p.startsWith(`${ROOMS_DIR}/`))) refresh(); }); }, [refresh]);
  useEffect(() => { api.schema(ROOM_SCHEMA).then(setSchema, (e: Error) => setError(e.message)); }, []);

  // Every room held, for the list and the checks over all of them; new ones are held unsaved until Save
  const paths = useMemo(() => {
    const held = [...docs.keys()].filter((p) => p.startsWith(`${ROOMS_DIR}/`) && p.endsWith(".json"));
    return [...new Set([...diskPaths, ...held])].sort();
  }, [diskPaths, docs]);
  useEffect(() => {
    for (const p of diskPaths) if (!documents.get(p)) documents.hold(p).catch(() => undefined);
  }, [diskPaths]);
  const rooms: Listed[] = useMemo(() => paths.flatMap((path) => {
    const doc = docs.get(path);
    if (!doc) return [];
    return [{ id: roomId(path), path, room: readRoom(doc.data), dirty: doc.dirty, data: doc.data }];
  }), [paths, docs]);

  useEffect(() => {
    if (selectedId === null && rooms.length) setSelectedId(rooms[0].id);
  }, [rooms, selectedId]);
  const current = rooms.find((r) => r.id === selectedId) ?? null;
  const path = current?.path ?? null;
  const room = current?.room ?? null;

  // Every clearing, for the checks (an NPC is checked against all of them) and the reference behind the grid
  const zones = useMemo(() => [...constants].filter(([k]) => k.startsWith(CLEARINGS_PREFIX)).sort((a, b) => a[1] - b[1]).map(([k]) => k), [constants]);
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

  const save = useCallback(async () => {
    for (const p of documents.dirtyPaths().filter((d) => d.startsWith(`${ROOMS_DIR}/`))) await documents.save(p);
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (!toolActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") { e.preventDefault(); e.stopPropagation(); void save(); return; }
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (!path || inField || (key !== "z" && key !== "y")) return;
      e.preventDefault(); e.stopPropagation();
      if (key === "y" || e.shiftKey) documents.redo(path); else documents.undo(path);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [save, toolActive, path]);

  const taken = useMemo(() => new Set(rooms.map((r) => r.id)), [rooms]);
  const create = (name: string, data: JsonValue) => {
    const id = freeId(idFromName(name), taken);
    documents.create(roomPath(id), ROOM_SCHEMA, data);
    setSelectedId(id);
    setNpcIndex(null);
  };
  const duplicate = () => {
    if (!current?.data) return;
    const name = `${current.room.name} (copy)`;
    const id = freeId(`${current.id}_copy`, taken);
    documents.create(roomPath(id), ROOM_SCHEMA, setIn(current.data, ["name"], name));
    setSelectedId(id);
  };
  const remove = async () => {
    if (!current) return;
    setConfirmDelete(false);
    try {
      if (diskPaths.includes(current.path)) await api.removeFile(current.path);
      documents.close(current.path);
      setSelectedId(rooms.find((r) => r.id !== current.id)?.id ?? null);
      refresh();
    } catch (e) {
      setNote(`Couldn't delete ${current.path}: ${(e as Error).message}`);
    }
  };
  const rename = async (to: string) => {
    if (!current?.data || to === current.id) return;
    if (!ID_PATTERN.test(to)) { setNote("An ID is lower-case letters, digits and underscores."); return; }
    if (taken.has(to)) { setNote(`There is already a room ${to}.`); return; }
    const next = roomPath(to);
    documents.create(next, ROOM_SCHEMA, current.data);
    if (!(await documents.save(next))) {
      setNote(`Couldn't save ${next}: ${documents.get(next)?.saveError ?? ""}`);
      documents.close(next);
      return;
    }
    if (diskPaths.includes(current.path)) await api.removeFile(current.path).catch(() => undefined);
    documents.close(current.path);
    setSelectedId(to);
    refresh();
  };

  const schemaErrors = useMemo(() => (current?.data && schema ? validate(current.data, schema, constants) : []), [current?.data, schema, constants]);
  const problems = useMemo(() => (room ? checkRoom(room, constants, infos) : []), [room, constants, infos]);
  const overall = useMemo(() => checkRooms(rooms), [rooms]);
  const roomProblems = useMemo(() => new Map(rooms.map((r): [string, number] =>
    [r.id, checkRoom(r.room, constants, infos).filter((p) => p.severity === "error").length])), [rooms, constants, infos]);

  const listed = rooms.filter((r) => (roundFilter === "all" || inRound(r.room, Number(roundFilter) as Round)) && (roleFilter === "all" || r.room.role === roleFilter) &&
    (!text.trim() || `${r.id} ${r.room.name}`.toLowerCase().includes(text.trim().toLowerCase())));
  const unsaved = rooms.filter((r) => r.dirty);

  // The map's entities: the NPCs, then the exits (as the triggers they are)
  const entities: Entity[] = useMemo(() => {
    if (!room) return [];
    const npcs: Entity[] = room.npcs.map((n, i) => ({
      kind: "npc", index: i, x: n.x, z: n.z, y: 0, width: 1, depth: 1,
      label: `${i + 1}: ${n.type}`, model: npcSprite(n, room, constants) ?? undefined, direction: n.facing,
      faded: (n.chance ?? DEFAULT_CHANCE) < 100 || !!n.flag,
    }));
    const exits: Entity[] = (mapInfo?.exits ?? []).map((e, k) => ({
      kind: "trigger", index: 1000 + k, x: e.x, z: e.z, y: 0, width: e.width, depth: e.depth, label: `${e.side} exit`,
    }));
    return [...npcs, ...exits];
  }, [room, mapInfo, constants]);
  const selectedEntity = npcIndex !== null ? entities.find((e) => e.kind === "npc" && e.index === npcIndex) ?? null : null;

  const moveNpc = (i: number, x: number, z: number) => {
    const npc = asMap(get(["npcs", i]));
    set(["npcs", i], new Map([...npc].map(([k, v]) => [k, k === "x" ? x : k === "z" ? z : v])));
  };
  const addNpc = (type: NpcType, x: number, z: number) => {
    if (!room) return;
    const list = asList(get(["npcs"]));
    set(["npcs"], [...list, newNpc(type, x, z, room)]);
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
        <span className="muted en-lead">The Entralink roguelike's rooms: their battles and what stands in them. The game reads these at the wiring step; until then it reads challenges/.</span>
        <span className="spacer" />
        {unsaved.length > 0 && <span className="muted">{unsaved.length} unsaved</span>}
        <button onClick={() => unsaved.forEach((r) => void documents.reload(r.path))} disabled={!unsaved.length}>Revert</button>
        <button className="primary" onClick={() => void save()} disabled={!unsaved.length} title="Ctrl+S">Save</button>
      </header>
      {error && <p className="ow-error ow-bar">{error}</p>}
      {unsaved.filter((r) => docs.get(r.path)?.saveError).map((r) => <p key={r.path} className="ow-error ow-bar">{r.path}: {docs.get(r.path)?.saveError}</p>)}
      <div className="en-body">
        <aside className="en-list">
          <div className="en-list-section">
            <h5>Rooms <span className="muted">{listed.length === rooms.length ? rooms.length : `${listed.length} of ${rooms.length}`}</span></h5>
            <div className="en-list-actions">
              <button onClick={() => setCreating(creating === null ? "" : null)} className={creating !== null ? "active" : ""} title="A new room with one battle">New</button>
              <button onClick={duplicate} disabled={!current} title="A copy of the chosen room">Duplicate</button>
              {!confirmDelete
                ? <button onClick={() => setConfirmDelete(true)} disabled={!current} title="Delete the chosen room's file">Delete</button>
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
            </div>
          </div>
          <div className="en-items">
            {listed.map((r) => (
              <button key={r.id} className={`en-item ${r.id === selectedId ? "selected" : ""}`} onClick={() => { setSelectedId(r.id); setNpcIndex(null); setConfirmDelete(false); }}>
                <span className="en-item-name">{r.room.name || r.id}{r.dirty ? " •" : ""}</span>
                <span className="muted en-item-detail">
                  {r.room.role !== "room" && <span className={`en-role en-role-${r.room.role}`}>{r.room.role}</span>}
                  {r.room.rounds.length ? `round ${r.room.rounds.join(", ")}` : "any round"}
                  {(roomProblems.get(r.id) ?? 0) > 0 && <span className="en-bad" title="Errors to fix"> ⚠ {roomProblems.get(r.id)}</span>}
                </span>
              </button>
            ))}
            {!listed.length && <p className="muted en-empty">{rooms.length ? "No room matches the filters." : "No rooms yet."}</p>}
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
            <span className="spacer" />
            <span className="muted small">Click an NPC to choose it, drag to move it, Shift+click a tile to add one</span>
          </div>
          <div className="ow-map-wrap">
            {mapError ? <p className="ow-error en-pad">{mapError}</p> : shown && room ? (
              <MapView map={shown.map} modelOpacity={faint ? 0.35 : 1} entities={entities} selected={selectedEntity} layer={0} overlay={showBlocked ? "walk" : "off"}
                       showModels painting={false} paintType={null} preview={false} overhead
                       onSelect={(e) => setNpcIndex(e?.kind === "npc" ? e.index : null)}
                       onMove={(e, x, z) => { if (e.kind === "npc") moveNpc(e.index, x, z); }}
                       onAdd={(x, z) => addNpc(room.battles.length ? "battle" : "item", x, z)}
                       onPaint={() => undefined} rails={null} railLevel={null} ground="grid"
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
              <RoomSection id={current.id} room={room} constants={constants} saved={diskPaths.includes(current.path)}
                           setField={(key, v) => setField([], "", key, v)} rename={rename} />
              <BattlesSection room={room} constants={constants} get={get} set={set} setField={setField}
                              replace={(data) => path && documents.replace(path, data)} data={current.data} />
              <NpcsSection room={room} constants={constants} get={get} set={set} setField={setField} selected={npcIndex}
                           select={setNpcIndex} add={(type) => { const t = freeTile(); addNpc(type, t.x, t.z); }}
                           openPicker={() => setPicking(true)} npcOrder={orderOf("npc")} />
            </div>
          ) : current?.data === null ? <p className="ow-error en-pad">{current.path} isn't in a layout the editor can write back; edit it as text.</p>
            : <p className="muted en-pad">Choose a room, or make one with New.</p>}
        </div>
      </div>
      {picking && room && npcIndex !== null && room.npcs[npcIndex] && (
        <ModelPicker constants={constants} value={room.npcs[npcIndex].sprite ?? npcSprite(room.npcs[npcIndex], room, constants) ?? ""}
                     onClose={() => setPicking(false)} onPick={(m) => { setField(["npcs", npcIndex], "npc", "sprite", m); setPicking(false); }} />
      )}
    </div>
  );
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

function RoomSection({ id, room, constants, saved, setField, rename }: {
  id: string; room: Room; constants: Constants; saved: boolean;
  setField(key: string, v: JsonValue | undefined): void; rename(to: string): Promise<void>;
}) {
  const [newId, setNewId] = useState(id);
  useEffect(() => setNewId(id), [id]);
  const weathers: Option[] = [{ value: "", label: "Random", detail: "" }, ...constantOptions(constants, "BTL_WEATHER_")];
  return (
    <Section title="Room" summary={`${room.role}, ${room.rounds.length ? `round ${room.rounds.join(", ")}` : "any round"}`}>
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
        <Row label="Weather" hint={room.weather ? "From the start of its battles" : "Random (designed later)"}>
          <SearchSelect value={room.weather ?? ""} options={weathers} placeholder="Random" onChange={(v) => setField("weather", v || undefined)} />
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

function BattlesSection({ room, constants, get, set, setField, replace, data }: EditProps & { replace(data: JsonValue): void; data: JsonValue }) {
  const battles = asList(get(["battles"]));
  const add = () => {
    const id = freeId("battle", new Set(room.battles.map((b) => b.id)));
    set(["battles"], [...battles, fromPlain({ id, format: "single", enemies: [{ species: "SPECIES_BULBASAUR", level: DEFAULT_LEVEL }] })]);
  };
  /** Renames a battle and the NPCs that start it, in one step. */
  const renameBattle = (i: number, from: string, to: string) => {
    let next = setIn(data, ["battles", i, "id"], to);
    room.npcs.forEach((n, j) => { if (n.type === "battle" && n.battle === from) next = setIn(next, ["npcs", j, "battle"], to); });
    replace(next);
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
              <button className="icon" title="Remove the battle" onClick={() => removeBattle(i)}>×</button>
            </div>
            <div className="ow-condition">
              <Row label="Format" hint={FORMAT_NOTES[b.format]}>
                <Switch value={b.format} options={FORMATS} titles={FORMAT_NOTES} onChange={(v) => setField(["battles", i], "battle", "format", v)} />
              </Row>
            </div>
            {b.enemies.map((_, k) => (
              <EnemyCard key={k} at={["battles", i, "enemies", k]} index={k} over={k >= max} constants={constants} get={get} set={set} setField={setField}
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

function EnemyCard({ at, index, over, constants, get, set, setField, remove }: {
  at: JsonPath; index: number; over: boolean; constants: Constants; remove?: () => void;
  get(at: JsonPath): JsonValue | undefined; set(at: JsonPath, v: JsonValue | undefined): void;
  setField(at: JsonPath, def: string, key: string, v: JsonValue | undefined): void;
}) {
  const e = asMap(get(at));
  const f = (key: string, v: JsonValue | undefined) => setField(at, "enemy", key, v);
  const species = String(e.get("species") ?? "");
  const moves = asList(e.get("moves")).map(String);
  const setMove = (i: number, v: string) => {
    const next = [0, 1, 2, 3].map((j) => (j === i ? v : moves[j] ?? "MOVE_NONE"));
    while (next.length && (next[next.length - 1] === "MOVE_NONE" || !next[next.length - 1])) next.pop();
    f("moves", next.length ? next.map((m) => m || "MOVE_NONE") : undefined);
  };
  const abilities: Option[] = [{ value: "", label: "Either of its two", detail: "" }, { value: "hidden", label: "Its hidden ability", detail: "" },
    ...constantOptions(constants, "ABILITY_")];
  const sprite = walkingSprite(species, constants);
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
        <Row label="Level" hint="Its base level: the run will scale it with the rooms visited">
          <NumberBox value={Number(e.get("level") ?? DEFAULT_LEVEL)} min={1} max={100} onChange={(n) => f("level", n)} />
          <span className="muted">Form</span>
          <NumberBox value={Number(e.get("form") ?? 0)} min={0} max={255} onChange={(n) => f("form", n || undefined)} />
        </Row>
        <Row label="Moves" hint={moves.length ? undefined : "Left empty: the moves of its level"}>
          <span className="en-moves">
            {[0, 1, 2, 3].map((i) => <SearchSelect key={i} value={moves[i] ?? ""} placeholder="—" options={constantOptions(constants, "MOVE_")} onChange={(v) => setMove(i, v)} />)}
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
      </div>
    </div>
  );
}

// ---- NPCs ------------------------------------------------------------------------------------------------------------

function NpcsSection({ room, constants, get, set, setField, selected, select, add, openPicker, npcOrder }: EditProps & {
  selected: number | null; select(i: number | null): void; add(type: NpcType): void; openPicker(): void; npcOrder: string[];
}) {
  const { notes } = useNotes();
  const flags: Option[] = useMemo(() => constantOptions(constants, "EVENT_FLAG_").map((o) => {
    const note = notes.flags[String(constants.get(o.value))];
    return note ? { ...o, detail: `${o.detail} ${note}` } : o;
  }), [constants, notes]);
  const npc = selected !== null ? room.npcs[selected] : undefined;
  const at: JsonPath = ["npcs", selected ?? 0];
  const f = (key: string, v: JsonValue | undefined) => setField(at, "npc", key, v);
  const changeType = (type: NpcType) => {
    if (!npc || selected === null) return;
    // Drops what the old type used, gives what the new one needs
    let next = newNpc(type, npc.x, npc.z, room);
    const kept = ["flag", "chance", "facing", ...(type === "rest" || type === "buff" ? ["sprite"] : [])];
    for (const [k, v] of asMap(get(at))) if (kept.includes(k)) next = put(next, k, v, npcOrder);
    set(at, next);
  };
  const battle = npc?.type === "battle" ? room.battles.find((b) => b.id === npc.battle) : undefined;
  const defaultSprite = npc ? npcSprite({ ...npc, sprite: undefined }, room, constants) : null;
  const sprite = npc ? npcSprite(npc, room, constants) : null;
  return (
    <Section title="NPCs" summary={room.npcs.length ? `${room.npcs.length} in the room` : "none: the room is free"}
             actions={<>
               <span className="muted">Add</span>
               {NPC_TYPES.map((t) => <button key={t} onClick={() => add(t)} title={TYPE_NOTES[t]}>+ {cap(t)}</button>)}
             </>}>
      <div className="en-npcs">
        {room.npcs.map((n, i) => {
          const s = npcSprite(n, room, constants);
          const what = n.type === "battle" ? `${n.battle ?? "?"}${shownEnemy(n, room) ? `, ${label(shownEnemy(n, room)!.species, "SPECIES_")}` : ""}`
            : n.type === "item" ? `${label(n.item, "ITEM_")}${(n.count ?? 1) > 1 ? ` ×${n.count}` : ""}` : "";
          return (
            <button key={i} className={`en-npc ${i === selected ? "selected" : ""}`} onClick={() => select(i === selected ? null : i)}>
              {s ? <SpriteImage model={s} direction={n.facing} size={24} /> : <span className="en-nosprite">?</span>}
              <span className="en-npc-name">{i + 1}. {cap(n.type)} <span className="muted">{what}</span></span>
              <span className="muted small">{n.x}, {n.z} {ARROWS[n.facing]}{(n.chance ?? 100) < 100 ? ` · ${n.chance}%` : ""}{n.flag ? " · flag" : ""}</span>
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
            <Row label="Type">
              <Switch value={npc.type} options={NPC_TYPES} titles={TYPE_NOTES} onChange={changeType} />
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
            <Row label="Look" hint={npc.sprite ? "Its own sprite" : defaultSprite ? (npc.type === "item" ? "The item ball" : "Its enemy's walking Pokémon") : npc.type === "battle" ? "Its enemy has no overworld sprite: Browse for one" : "Choose a sprite with Browse"}>
              {sprite ? <SpriteImage model={sprite} direction={npc.facing} size={32} /> : <span className="en-nosprite">?</span>}
              <span className="small">{sprite ? label(sprite, "OBJ_CODE_") : "none"}</span>
              <button onClick={openPicker}>Browse…</button>
              {npc.sprite && (npc.type === "battle" || npc.type === "item") && (
                <button onClick={() => f("sprite", undefined)} title={npc.type === "item" ? `Back to the item ball (${ITEM_BALL_SPRITE})` : "Back to its enemy's walking sprite"}>Default</button>
              )}
            </Row>
            <Row label="Flag" hint={npc.flag ? "Spawns only while this flag is set" : "Spawns whatever the flags"}>
              <SearchSelect value={npc.flag ?? ""} options={flags} placeholder="No flag" onChange={(v) => f("flag", v || undefined)} />
              {npc.flag && <button className="icon" title="No flag" onClick={() => f("flag", undefined)}>×</button>}
            </Row>
            <Row label="Chance" hint="Its chance to spawn each time the room comes up">
              <NumberBox value={npc.chance ?? DEFAULT_CHANCE} min={1} max={100} onChange={(n) => f("chance", n === 100 ? undefined : n)} />
              <span className="muted">%</span>
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
        </div>
      )}
      {!npc && room.npcs.length > 0 && <p className="muted small">Choose an NPC here or on the map to edit it.</p>}
    </Section>
  );
}
