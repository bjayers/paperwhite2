// A zone's events (res/field/events/<zone>.json) as the map shows them: each NPC, proxy (background event), trigger,
// warp and level script, with its place in global tiles and its height in units. The events write positions in
// three ways: an NPC's and a trigger's grid is tiles (x, z) and a height y in fixed point (4096 a unit); a proxy's grid
// is tiles too, its y the row and its z the height in units; a warp's is units, 16 a tile, its height a u16 that is
// negative past 32767. The editor shows every height in tiles. Entities on rails have no grid and aren't drawn (rail
// zones come later). An entity's height only chooses the layer it stands on (standingOn in terrain.ts), as in game.

import { toPlain, type JsonValue } from "../../../shared/json.ts";
import { TILE } from "./terrain.ts";

export type EntityKind = "npc" | "proxy" | "trigger" | "warp" | "level";

/** The events file's list of each kind, and the field each module edits. */
export const KIND_LISTS: Record<EntityKind, string> = {
  npc: "npcs",
  proxy: "bg_events",
  trigger: "triggers",
  warp: "warps",
  level: "init_scripts",
};

export const KIND_NAMES: Record<EntityKind, string> = {
  npc: "NPCs",
  proxy: "Proxies",
  trigger: "Triggers",
  warp: "Warps",
  level: "Level scripts",
};

export interface Entity {
  kind: EntityKind;
  /** Its place in its list, from 0. */
  index: number;
  /** Global tiles; null when it has no place on the grid (a level script, an entity on a rail). */
  x: number | null;
  z: number | null;
  /** Height, in units. */
  y: number;
  /** In tiles. */
  width: number;
  depth: number;
  label: string;
  model?: string;
  direction?: string;
  /** An NPC's leash, in tiles each way. */
  leash?: { x: number; z: number };
  /** A trainer's sight, in tiles. */
  sight?: number;
  script?: number;
  /** A warp's zone (its file's name) and the warp of it that it leads to. */
  target?: { zone: string; warp: number };
}

type Rec = Record<string, unknown>;

const num = (v: unknown, d = 0) => (typeof v === "number" ? v : d);
const signed16 = (v: number) => (v > 0x7fff ? v - 0x10000 : v);

/** Each kind's height field, and its units in a tile: an NPC's y is fixed point (4096 a unit), the others units. */
export const HEIGHT_FIELDS: Partial<Record<EntityKind, { field: string; perTile: number; unsigned?: boolean }>> = {
  npc: { field: "y", perTile: TILE * 4096 },
  proxy: { field: "z", perTile: TILE },
  trigger: { field: "y", perTile: TILE },
  warp: { field: "y", perTile: TILE, unsigned: true },
};

/** A stored height as tiles, and tiles as the value to store. */
export function heightInTiles(kind: EntityKind, stored: number): number {
  const h = HEIGHT_FIELDS[kind]!;
  return (h.unsigned ? signed16(stored) : stored) / h.perTile;
}
export function storedHeight(kind: EntityKind, tiles: number): number {
  const h = HEIGHT_FIELDS[kind]!;
  const v = Math.round(tiles * h.perTile);
  return h.unsigned && v < 0 ? v + 0x10000 : v;
}

export function entitiesOf(data: JsonValue | null): Entity[] {
  if (!(data instanceof Map)) return [];
  const plain = toPlain(data) as Record<string, Rec[] | undefined>;
  const out: Entity[] = [];
  (plain.npcs ?? []).forEach((n, index) => {
    const g = n.grid as Rec | undefined;
    const area = n.area as Rec | undefined;
    const params = (n.params as number[] | undefined) ?? [];
    const type = String(n.type ?? "");
    out.push({
      kind: "npc", index, x: g ? num(g.x) : null, z: g ? num(g.z) : null, y: g ? num(g.y) / 4096 : 0, width: 1, depth: 1,
      label: `NPC ${num(n.id, index)}`, model: String(n.model ?? ""), direction: String(n.direction ?? "DIR_DOWN"),
      leash: area ? { x: num(area.width), z: num(area.height) } : undefined,
      sight: /TRAINER/.test(type) ? num(params[0]) : undefined, script: num(n.script),
    });
  });
  (plain.bg_events ?? []).forEach((b, index) => {
    const g = b.grid as Rec | undefined;
    out.push({ kind: "proxy", index, x: g ? num(g.x) : null, z: g ? num(g.y) : null, y: g ? num(g.z) : 0, width: 1, depth: 1,
               label: `Proxy ${index}`, script: num(b.script) });
  });
  (plain.triggers ?? []).forEach((t, index) => {
    const g = t.grid as Rec | undefined;
    out.push({ kind: "trigger", index, x: g ? num(g.x) : null, z: g ? num(g.z) : null, y: g ? num(g.y) : 0,
               width: g ? Math.max(1, num(g.width, 1)) : 1, depth: g ? Math.max(1, num(g.height, 1)) : 1,
               label: `Trigger ${index}`, script: num(t.script) });
  });
  (plain.warps ?? []).forEach((w, index) => {
    const g = w.grid as Rec | undefined;
    out.push({ kind: "warp", index, x: g ? Math.floor(num(g.x) / TILE) : null, z: g ? Math.floor(num(g.z) / TILE) : null,
               y: g ? signed16(num(g.y)) : 0, width: g ? Math.max(1, num(g.width, 1)) : 1, depth: g ? Math.max(1, num(g.height, 1)) : 1,
               label: `Warp ${index} → ${String(w.zone ?? "").replace(/^ZONE_/, "").toLowerCase()}`,
               target: typeof w.zone === "string" ? { zone: w.zone.replace(/^ZONE_/, "").toLowerCase(), warp: num(w.warp) } : undefined });
  });
  (plain.init_scripts ?? []).forEach((l, index) => {
    out.push({ kind: "level", index, x: null, z: null, y: 0, width: 1, depth: 1, label: `Level script ${index}`, script: num(l.script) });
  });
  return out;
}

/** The JSON path of an entity's position fields, and the values that put it on a tile at a height. */
export function positionEdits(e: Entity, gx: number, gz: number, height: number): { path: (string | number)[]; value: number }[] {
  const base = [KIND_LISTS[e.kind], e.index, "grid"];
  const y = (field: string) => ({ path: [...base, field], value: storedHeight(e.kind, height / TILE) });
  switch (e.kind) {
    case "npc":
    case "trigger":
      return [{ path: [...base, "x"], value: gx }, { path: [...base, "z"], value: gz }, y("y")];
    case "proxy":
      return [{ path: [...base, "x"], value: gx }, { path: [...base, "y"], value: gz }, y("z")];
    case "warp":
      return [{ path: [...base, "x"], value: gx * TILE + TILE / 2 }, { path: [...base, "z"], value: gz * TILE + TILE / 2 }, y("y")];
    default:
      return [];
  }
}

/** A field actor's folder for a model constant (tools/data/field_actor_data.py): OBJ_CODE_291 is res/field/actors/291/,
 * the walking Pokémon's OBJ_CODE_POKEMON_BULBASAUR pokemon/bulbasaur/, a follower's followers/<name>/. The 3D models
 * (OBJ_CODE_MODEL_*, models/<n>/) have no sprite to show. */
export function actorFolder(model: string): string {
  const name = model.replace(/^OBJ_CODE_/, "").toLowerCase();
  if (name.startsWith("pokemon_")) return `res/field/actors/pokemon/${name.slice("pokemon_".length)}`;
  if (name.startsWith("follower_")) return `res/field/actors/followers/${name.slice("follower_".length)}`;
  return `res/field/actors/${name}`;
}

/** A direction constant as an angle on the map, toward -z (up the screen) for DIR_UP. */
export function directionAngle(direction: string | undefined): number {
  switch (direction) {
    case "DIR_UP": return Math.PI;
    case "DIR_LEFT": return -Math.PI / 2;
    case "DIR_RIGHT": return Math.PI / 2;
    default: return 0;
  }
}

/** A direction's step in tiles. */
export function directionStep(direction: string | undefined): [number, number] {
  switch (direction) {
    case "DIR_UP": return [0, -1];
    case "DIR_LEFT": return [-1, 0];
    case "DIR_RIGHT": return [1, 0];
    default: return [0, 1];
  }
}
