// Paper White 2's NPC spawns in the Overworld Editor (res/paperwhite2/overworld/<zone>.json,
// tools/paperwhite2/overworld.py, src/paperwhite2/ov012/paperwhite2_spawns.c): an NPC's condition, and the instances
// a host NPC can be, one of which the field writes into its record at zone entry.
//
// The preview runs the conditions as the game would for a season, time, weather and set flags the editor chooses: an
// NPC whose condition fails is hidden, and a host shows the instance its day's pick gives (Reload rolls another day).
// What the editor can't know (the party, the lead, variables, the terrain) counts as holding.

import { fromPlain } from "../../../shared/json.ts";
import { entitiesOf, type Entity } from "./entities.ts";

export const SPAWN_SCHEMA = "res/paperwhite2/overworld/overworld.schema.json";
export const spawnPath = (zone: string) => `res/paperwhite2/overworld/${zone}.json`;

export const SEASON_NAMES = ["spring", "summer", "autumn", "winter"] as const;
export const TIME_NAMES = ["morning", "day", "evening", "night", "late_night"] as const;

export interface Condition {
  season?: string[];
  time?: string[];
  weather?: string[];
  flags?: { set?: string[]; unset?: string[] };
  zone?: string[];
  exterior?: boolean;
  chance?: number;
  [field: string]: unknown;
}
export interface Instance { name?: string; when?: Condition; weight?: number; npc: Record<string, unknown> }
/** How long an NPC's rolls hold (its chance's and its instance's pick): the game picks again when the hour or the time
 * of day changes, and changes the NPC while it's out of view. */
export type Rolls = "hour" | "day" | "period" | "entry";
export interface SpawnEntry { id: number; when?: Condition; instances?: Instance[]; rolls?: Rolls }
/** An ambient (overworld.schema.json): a sprite drawn without an actor on a path round its place, which the game draws
 * (src/paperwhite2/ov036/paperwhite2_ambients.c). Its tile, its place in it in units from the middle, and its height
 * in units. */
export interface Ambient {
  name?: string;
  sprite: string | number;
  x: number;
  z: number;
  offset?: { x?: number; z?: number };
  y: number;
  facing?: string | number;
  path?: { kind: "perch" | "hover" | "ellipse" | "line" | "eight"; width?: number; depth?: number; speed?: number; start?: number;
           every?: number; turns?: boolean; hops?: boolean };
  shadow?: "none" | "feet" | "ground";
  when?: Condition;
  rolls?: Rolls;
}

/** The ambients as the map's entities, of kind "ambient", at their height. */
export function ambientEntities(ambients: Ambient[]): Entity[] {
  return ambients.map((a, i) => ({
    kind: "ambient", index: i, x: a.x, z: a.z, y: a.y, width: 1, depth: 1, label: a.name || `Ambient ${i + 1}`,
    model: typeof a.sprite === "string" ? a.sprite : undefined, direction: typeof a.facing === "string" ? a.facing : "DIR_DOWN",
  }));
}

/** A new ambient at a tile: a perch at its standing height and a tile over it. */
export const newAmbient = (x: number, z: number, height: number, n: number): Ambient =>
  ({ name: `Ambient ${n + 1}`, sprite: "OBJ_CODE_POKEMON_PIDOVE", x, z, y: Math.round(height + 16), facing: "DIR_DOWN", path: { kind: "perch" } });

/** The world the preview checks conditions against. */
export interface PreviewWorld {
  season: string;
  time: string;
  weather: string;
  /** The flags set, by name. */
  flags: Set<string>;
  zone: string;
  exterior: boolean | null;
  /** The day's seed: Reload changes it. */
  seed: number;
}

/** A small hash for the preview's rolls, stable for a seed and a key. */
function hash(a: number, b: number): number {
  let h = (Math.imul(a ^ 0x9e3779b1, 0x85ebca6b) ^ b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Whether a condition holds in the preview's world; a roll from the seed decides a chance. */
export function holds(c: Condition | undefined, w: PreviewWorld, roll: number): boolean {
  if (!c) return true;
  if (c.season && !c.season.includes(w.season)) return false;
  if (c.time && !c.time.includes(w.time)) return false;
  if (c.weather && !c.weather.includes(w.weather)) return false;
  if (c.flags?.set?.some((f) => !w.flags.has(f))) return false;
  if (c.flags?.unset?.some((f) => w.flags.has(f))) return false;
  if (c.zone && !c.zone.includes(`ZONE_${w.zone.toUpperCase()}`)) return false;
  if (c.exterior !== undefined && w.exterior !== null && c.exterior !== w.exterior) return false;
  if (c.chance !== undefined && roll % 100 >= c.chance) return false;
  return true;
}

/** What the preview shows of each NPC with spawn data: whether it appears and, for a host, its instance. */
export function previewPicks(entries: SpawnEntry[], w: PreviewWorld): Map<number, { shown: boolean; instance: number | null }> {
  const out = new Map<number, { shown: boolean; instance: number | null }>();
  for (const e of entries) {
    let shown = holds(e.when, w, hash(w.seed, e.id));
    let instance: number | null = null;
    if (shown && e.instances?.length) {
      const ok = e.instances.map((inst, i) => holds(inst.when, w, hash(w.seed + 7919 * (i + 1), e.id))
        && !(inst.npc.flag && inst.npc.flag !== 0 && w.flags.has(String(inst.npc.flag))));
      const total = e.instances.reduce((n, inst, i) => n + (ok[i] ? inst.weight ?? 1 : 0), 0);
      if (total) {
        let pick = hash(w.seed, e.id + 65536) % total;
        for (let i = 0; i < e.instances.length; i++) {
          if (!ok[i]) continue;
          const weight = e.instances[i].weight ?? 1;
          if (pick < weight) { instance = i; break; }
          pick -= weight;
        }
      } else shown = false;
    }
    out.set(e.id, { shown, instance });
  }
  return out;
}

/** The instances as the map's entities: each one's NPC, as an events NPC would be drawn, of kind "instance". */
export function instanceEntities(entries: SpawnEntry[]): Entity[] {
  const out: Entity[] = [];
  entries.forEach((entry, ei) => (entry.instances ?? []).forEach((inst, k) => {
    const [e] = entitiesOf(fromPlain({ npcs: [{ ...inst.npc, id: entry.id }] }));
    if (!e) return;
    out.push({ ...e, kind: "instance", index: out.length, label: `${inst.name || `Instance ${k + 1}`} of NPC ${entry.id}`,
               spawn: { entry: ei, instance: k, host: entry.id } });
  }));
  return out;
}

/** A condition in a few words, for lists. */
export function conditionSummary(c: Condition | undefined): string {
  if (!c) return "always";
  const parts: string[] = [];
  if (c.season) parts.push(c.season.join("/"));
  if (c.time) parts.push(c.time.map((t) => t.replace("_", " ")).join("/"));
  if (c.weather) parts.push(c.weather.map((x) => x.replace(/^WEATHER_/, "").toLowerCase()).join("/"));
  if (c.flags?.set?.length) parts.push(`flags ${c.flags.set.length} set`);
  if (c.flags?.unset?.length) parts.push(`flags ${c.flags.unset.length} unset`);
  if (c.chance !== undefined) parts.push(`${c.chance}%`);
  const others = Object.keys(c).filter((k) => !["season", "time", "weather", "flags", "chance"].includes(k));
  if (others.length) parts.push(others.join(", "));
  return parts.join(" · ") || "always";
}
