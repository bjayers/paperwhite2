// What the editors need to know about the world: each zone (res/field/zones/<zone>.json) with its script file, text
// bank and parent, and its events (res/field/events/<zone>.json, the same name): the NPCs, background events (signs
// and other things to check), triggers and init scripts (the level scripts) that run scripts. Read once a session.
//
// Script IDs (FieldScript_ResolveSCRID, src/ov012/script_sys.c): an ID from 1 runs the zone's script file's entry ID - 1
// (Script_<ID>); a global script file's IDs start at the number in its name (global_10685.s from 10685); a trainer's
// NPC runs 3000 + its trainer number, or 5000 + it for the second of a pair (src/ov012/trainer_script.c).

import { api } from "../../api.ts";
import type { Constants } from "../../../shared/schema.ts";

export const ZONE_SCHEMA = "res/field/zones/zone.schema.json";
export const EVENTS_SCHEMA = "res/field/events/events.schema.json";
export const TRAINER_SCRIPT = 3000;
export const TRAINER_SCRIPT_SECOND = 5000;

export interface Zone {
  /** Its file's name: "aspertia_city". */
  name: string;
  path: string;
  constant: string;
  number: number;
  scripts: string | null;
  text: string | null;
  parent: string | null;
}

export type EventKind = "npc" | "bg_event" | "trigger" | "init_script";

export interface ZoneEvent {
  zone: string;
  kind: EventKind;
  /** Its place in its list, from 0. */
  index: number;
  script: number;
  /** An NPC's id and model, for its label. */
  id?: number;
  model?: string;
}

export interface World {
  zones: Zone[];
  byName: Map<string, Zone>;
  events: ZoneEvent[];
  /** The global scripts' ID ranges and their files, from GLOBAL_SCRIPT_TABLE (src/ov012/script_sys.c). */
  globals: { start: number; end: number; file: string }[];
}

let world: Promise<World> | null = null;
let worldConstants: Constants | null = null;

/** The world, read once for a set of constants (read again when they change, as on the first load, which has none). */
export function loadWorld(constants: Constants): Promise<World> {
  if (!world || worldConstants !== constants) {
    worldConstants = constants;
    world = Promise.all([api.data(ZONE_SCHEMA, ["scripts", "text", "parent"]), api.data(EVENTS_SCHEMA), globalTable()]).then(([zoneFiles, eventFiles, globals]) => {
      const zones: Zone[] = zoneFiles.map(({ path, data }) => {
        const name = path.slice(path.lastIndexOf("/") + 1, -5);
        const constant = `ZONE_${name.toUpperCase()}`;
        return {
          name, path, constant, number: constants.get(constant) ?? -1,
          scripts: typeof data.scripts === "string" ? data.scripts : null,
          text: typeof data.text === "string" ? data.text : null,
          parent: typeof data.parent === "string" ? data.parent : null,
        };
      }).sort((a, b) => a.number - b.number);
      const events: ZoneEvent[] = [];
      for (const { path, data } of eventFiles) {
        const zone = path.slice(path.lastIndexOf("/") + 1, -5);
        for (const kind of ["npc", "bg_event", "trigger", "init_script"] as EventKind[]) {
          const list = data[`${kind}s`] as Record<string, unknown>[] | undefined;
          list?.forEach((e, index) => {
            if (typeof e.script !== "number") return;
            events.push({ zone, kind, index, script: e.script, id: typeof e.id === "number" ? e.id : undefined,
                          model: typeof e.model === "string" ? e.model : undefined });
          });
        }
      }
      return { zones, byName: new Map(zones.map((z) => [z.name, z])), events, globals };
    });
    world.catch(() => { world = null; });
  }
  return world;
}

/** The global script table's rows: { 10885, 10914, SCRIPTS_GLOBAL_10885, ... }. */
async function globalTable(): Promise<World["globals"]> {
  const lines = await api.scan("src/ov012/script_sys.c", "SCRIPTS_GLOBAL_");
  const rows: World["globals"] = [];
  for (const { text } of lines) {
    const m = /\{\s*(\d+),\s*(\d+),\s*(SCRIPTS_GLOBAL_\d+)/.exec(text);
    if (m) rows.push({ start: Number(m[1]), end: Number(m[2]), file: scriptFileOf(m[3]) });
  }
  return rows.sort((a, b) => b.start - a.start);
}

/** The file and entry (from 1) that a script ID runs in a zone, as FieldScript_ResolveSCRID finds them: the first global
 * range that starts at or below it, else the zone's own file. Null for 0 or a zone without scripts. */
export function resolveScript(w: World, zone: Zone | undefined, id: number): { file: string; entry: number } | null {
  const global = w.globals.find((g) => id >= g.start);
  if (global) return { file: global.file, entry: id - global.start + 1 };
  if (id >= 1 && zone?.scripts) return { file: scriptFileOf(zone.scripts), entry: id };
  return null;
}

/** "SCRIPTS_ASPERTIA_CITY" as its file, and back; the same for the text banks. */
export const scriptFileOf = (constant: string) => `res/field/scripts/${constant.replace(/^SCRIPTS_/, "").toLowerCase()}.s`;
export const scriptConstantOf = (path: string) => `SCRIPTS_${path.slice(path.lastIndexOf("/") + 1, -2).toUpperCase()}`;
export const textBankConstantOf = (path: string) => {
  const name = path.slice(path.lastIndexOf("/") + 1, -4).toUpperCase();
  return path.includes("/script/") ? `SCRIPT_TEXT_${name}` : `TEXT_BANK_${name}`;
};

/** A global script file's first ID, from its name, or null for a zone's file. */
export function globalStart(path: string): number | null {
  const m = /\/global_(\d+)\.s$/.exec(path);
  return m ? Number(m[1]) : null;
}

/** The script ID of a file's entry (from 1 in the file's table). */
export function scriptId(path: string, entry: number): number {
  const start = globalStart(path);
  return start !== null ? start + entry - 1 : entry;
}

/** The events that run a script ID: of the zones that use the file, or of every zone for a global script. */
export function eventsRunning(w: World, path: string, id: number): ZoneEvent[] {
  if (globalStart(path) !== null) return w.events.filter((e) => e.script === id);
  const constant = scriptConstantOf(path);
  const zones = new Set(w.zones.filter((z) => z.scripts === constant).map((z) => z.name));
  return w.events.filter((e) => zones.has(e.zone) && e.script === id);
}

/** A zone's name as people say it: "Aspertia City Gym". */
export function zoneLabel(name: string): string {
  return name.split("_").map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase() + w.slice(1))).join(" ");
}

/** What an event is, in words. */
export function eventLabel(e: ZoneEvent): string {
  switch (e.kind) {
    case "npc": return `NPC ${e.id ?? e.index}${e.model ? ` (${e.model.replace(/^OBJ_CODE_/, "")})` : ""}`;
    case "bg_event": return `Background event ${e.index}`;
    case "trigger": return `Trigger ${e.index}`;
    case "init_script": return `Level script ${e.index}`;
  }
}
