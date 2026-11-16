// The Entree page's rooms (res/paperwhite2/entralink/rooms/<id>.json, room.schema.json beside them; the format is in
// docs/paperwhite2/design/entralink-roguelike-prototype.md, The room format): reading a room, the defaults the game
// gives what a file leaves out, new and duplicated rooms, and the checks the panel shows beyond the schema's: battles
// and the NPCs that start them, the formats' enemy counts, NPCs on exits or blocked tiles of any forest clearing (a room
// has no map of its own: the game picks the clearing by the door taken, and every clearing has the same grid), and, over
// all the rooms, a run with no final room or a round with no rooms or no boss. Between rooms: the keys of battles
// ("<room>/<battle>") that catches and spawn conditions name, renamed with a battle or a room; and the progress ids,
// the save's won-ever and caught-ever bits, given on save above every number ever given and never changed.

import { fromPlain, type JsonMap, type JsonValue } from "../../../shared/json.ts";

export const ROOMS_DIR = "res/paperwhite2/entralink/rooms";
export const ROOM_SCHEMA = "res/paperwhite2/entralink/room.schema.json";
export const roomPath = (id: string) => `${ROOMS_DIR}/${id}.json`;
export const roomId = (path: string) => path.slice(path.lastIndexOf("/") + 1).replace(/\.json$/, "");
export const ID_PATTERN = /^[a-z0-9_]+$/;

/** The rounds of a run: 1 before the first boss, 2 before the second, 3 before the final room. */
export const ROUNDS = [1, 2, 3] as const;
export type Round = (typeof ROUNDS)[number];
export const ROUND_NOTES: Record<Round, string> = { 1: "before the first boss", 2: "before the second boss", 3: "before the final room" };
export const ROLES = ["room", "boss", "final"] as const;
export type Role = (typeof ROLES)[number];
export const FORMATS = ["single", "double", "triple", "raid"] as const;
export type Format = (typeof FORMATS)[number];
export const NPC_TYPES = ["battle", "item", "rest", "buff"] as const;
export type NpcType = (typeof NPC_TYPES)[number];
export const FACINGS = ["DIR_UP", "DIR_DOWN", "DIR_LEFT", "DIR_RIGHT"] as const;

/** The most enemies each format takes, and the fewest. */
export const FORMAT_ENEMIES: Record<Format, { min: number; max: number }> = {
  single: { min: 1, max: 1 }, double: { min: 1, max: 2 }, triple: { min: 1, max: 3 }, raid: { min: 1, max: 1 },
};

// The game's defaults for what a file leaves out (the prototype's packer, tools/paperwhite2/entralink_run.py)
export const DEFAULT_LEVEL = 70;
export const DEFAULT_CHANCE = 100;
export const DEFAULT_COUNT = 1;
/** A catch's "once" when left out. */
export const DEFAULT_ONCE = true;
/** The key of a finished run (the final room beaten at least once), for an NPC's requires. */
export const RUN_COMPLETED = "run/completed";
/** A battle's key over all rooms, as catch.after and requires name it. */
export const battleKey = (room: string, battle: string) => `${room}/${battle}`;
/** The progress ids' limits: the save's won-ever and caught-ever bits. */
export const MAX_BATTLE_IDS = 1024;
export const MAX_CATCH_IDS = 512;
export const PROGRESS_IDS = "res/paperwhite2/entralink/progress_ids.json";
export const PROGRESS_IDS_SCHEMA = "res/paperwhite2/entralink/progress_ids.schema.json";
/** The item ball's sprite, as the field's item balls have it (route_4.json's items). */
export const ITEM_BALL_SPRITE = "OBJ_CODE_110";
/** A room is one 32 by 32 map chunk. */
export const ROOM_TILES = 32;
/** Where the player arrives in a room: the bottom exit's inside tile (GetEntreeForestArrivalPos). */
export const ARRIVAL = { x: 15, z: 23 };

/** The forest's exit triggers' scripts (global_10490.s Script_5-8), by the side they lead out of. */
export const EXIT_SCRIPTS: Record<number, ExitSide> = { 10494: "up", 10495: "down", 10496: "left", 10497: "right" };
export type ExitSide = "up" | "down" | "left" | "right";

export interface Exit { side: ExitSide; x: number; z: number; width: number; depth: number }

/** What the checks know of a forest clearing: its zone, its exits and which tiles block walking. */
export interface MapInfo {
  zone: string;
  exits: Exit[];
  blocked(x: number, z: number): boolean;
}

/** The forest's clearings, any of which a room may be shown in. */
export const CLEARINGS_PREFIX = "ZONE_ENTREE_FOREST";

/** A catchable enemy's terms (enemies[].catch): the battles that must have been won first ("<room>/<battle>"), and
 * whether it can be caught only once. */
export interface Catch { after: string[]; once: boolean }

export interface Enemy {
  species: string;
  form?: number;
  level?: number;
  moves?: string[];
  ability?: string;
  item?: string;
  gender?: "male" | "female";
  shiny?: boolean;
  catch?: Catch;
  /** Its caught-ever bit, given on save to a catchable enemy. */
  progressId?: number;
}

export interface Battle { id: string; progressId?: number; format: Format; enemies: Enemy[] }

/** What an NPC says: before (on talking; a battle NPC's before its battle) and after (a battle NPC's, once won). */
export interface Dialogue { before?: string; after?: string }

export interface Npc {
  type: NpcType;
  battle?: string;
  enemy?: number;
  item?: string;
  count?: number;
  sprite?: string;
  /** The keys it spawns only after: battles won ("<room>/<battle>") and RUN_COMPLETED. */
  requires: string[];
  chance?: number;
  x: number;
  z: number;
  facing: string;
  dialogue?: Dialogue;
}

export interface Room {
  name: string;
  /** The rounds it is kept to; empty for any round. */
  rounds: Round[];
  role: Role;
  weather?: string;
  battles: Battle[];
  npcs: Npc[];
}

const asMap = (v: JsonValue | undefined): JsonMap => (v instanceof Map ? v : new Map());
const asList = (v: JsonValue | undefined): JsonValue[] => (Array.isArray(v) ? v : []);
const str = (v: JsonValue | undefined): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: JsonValue | undefined): number | undefined => (typeof v === "number" ? v : undefined);

/** A room's data as plain records, for reading; the editor changes the file's data itself, by path. */
export function readRoom(data: JsonValue | null | undefined): Room {
  const m = asMap(data ?? undefined);
  return {
    name: str(m.get("name")) ?? "",
    rounds: asList(m.get("rounds")).filter((r): r is Round => ROUNDS.includes(r as Round)),
    role: (ROLES.includes(m.get("role") as Role) ? m.get("role") : "room") as Role,
    weather: str(m.get("weather")),
    battles: asList(m.get("battles")).map((b) => {
      const bm = asMap(b);
      return {
        id: str(bm.get("id")) ?? "", progressId: num(bm.get("progress_id")),
        format: (FORMATS.includes(bm.get("format") as Format) ? bm.get("format") : "single") as Format,
        enemies: asList(bm.get("enemies")).map((e) => {
          const em = asMap(e);
          const moves = em.get("moves");
          const c = em.get("catch");
          return {
            species: str(em.get("species")) ?? "",
            form: num(em.get("form")), level: num(em.get("level")),
            moves: Array.isArray(moves) ? moves.map(String) : undefined,
            ability: str(em.get("ability")), item: str(em.get("item")),
            gender: str(em.get("gender")) as Enemy["gender"], shiny: em.get("shiny") === true ? true : em.get("shiny") === false ? false : undefined,
            catch: c instanceof Map ? { after: asList(c.get("after")).map(String), once: c.get("once") !== false } : undefined,
            progressId: num(em.get("progress_id")),
          };
        }),
      };
    }),
    npcs: asList(m.get("npcs")).map((n) => {
      const nm = asMap(n);
      const d = nm.get("dialogue");
      return {
        type: (NPC_TYPES.includes(nm.get("type") as NpcType) ? nm.get("type") : "battle") as NpcType,
        battle: str(nm.get("battle")), enemy: num(nm.get("enemy")), item: str(nm.get("item")), count: num(nm.get("count")),
        sprite: str(nm.get("sprite")), requires: asList(nm.get("requires")).map(String), chance: num(nm.get("chance")),
        x: num(nm.get("x")) ?? 0, z: num(nm.get("z")) ?? 0, facing: str(nm.get("facing")) ?? "DIR_DOWN",
        dialogue: d instanceof Map ? { before: str(d.get("before")), after: str(d.get("after")) } : undefined,
      };
    }),
  };
}

/** A new room's data: any round, one single battle and its NPC in the middle of the clearing. */
export function newRoomData(name: string): JsonValue {
  return fromPlain({
    $schema: "../room.schema.json",
    name,
    role: "room",
    battles: [{ id: "battle", format: "single", enemies: [{ species: "SPECIES_BULBASAUR", level: DEFAULT_LEVEL }] }],
    npcs: [{ type: "battle", battle: "battle", x: 15, z: 14, facing: "DIR_DOWN" }],
  });
}

/** An ID made from a name: lower case, words joined by underscores. */
export function idFromName(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "room";
}

/** The first of id, id_2, id_3… that isn't taken. */
export function freeId(id: string, taken: ReadonlySet<string>): string {
  if (!taken.has(id)) return id;
  const base = id.replace(/_\d+$/, "");
  for (let n = 2; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
}

/** A new NPC of a type at a tile, with what its type needs. */
export function newNpc(type: NpcType, x: number, z: number, room: Room): JsonMap {
  const npc: Record<string, unknown> = { type };
  if (type === "battle") npc.battle = room.battles[0]?.id ?? "";
  if (type === "item") npc.item = "ITEM_POTION";
  if (type === "rest" || type === "buff") npc.sprite = "OBJ_CODE_LADY";
  return fromPlain({ ...npc, x, z, facing: "DIR_DOWN" }) as JsonMap;
}

/** A battle NPC's walking Pokémon sprite for a species, if the game has one. */
export function walkingSprite(species: string | undefined, constants: ReadonlyMap<string, number>): string | null {
  if (!species) return null;
  const code = `OBJ_CODE_POKEMON_${species.replace(/^SPECIES_/, "")}`;
  return constants.has(code) ? code : null;
}

/** The sprite an NPC shows: its own, else its type's default (a battle NPC its enemy's walking Pokémon, an item NPC
 * the item ball). Null when it has none. */
export function npcSprite(npc: Npc, room: Room, constants: ReadonlyMap<string, number>): string | null {
  if (npc.sprite) return npc.sprite;
  if (npc.type === "item") return ITEM_BALL_SPRITE;
  if (npc.type === "battle") return walkingSprite(shownEnemy(npc, room)?.species, constants);
  return null;
}

/** The enemy a battle NPC shows and plays the cry of. */
export function shownEnemy(npc: Npc, room: Room): Enemy | undefined {
  const battle = room.battles.find((b) => b.id === npc.battle);
  return battle?.enemies[npc.enemy ?? 0];
}

export function exitAt(map: MapInfo | null, x: number, z: number): Exit | undefined {
  return map?.exits.find((e) => x >= e.x && x < e.x + e.width && z >= e.z && z < e.z + e.depth);
}

export type Severity = "error" | "warning";
export interface Problem {
  severity: Severity;
  /** What it is about, for the panel to point at: a battle's or an NPC's index, or the room. */
  where: { battle?: number; npc?: number; field?: string };
  message: string;
}

const npcName = (i: number, npc: Npc) => `NPC ${i + 1} (${npc.type})`;

/** The checks beyond the schema's for one room. clearings: the forest clearings' exits and blocked tiles, as far as
 * they are loaded; an NPC is checked against every one, since the game picks the clearing. known: every room's battles'
 * keys (battleKeys), to check what catches and spawn conditions name; not checked without it. */
export function checkRoom(room: Room, constants: ReadonlyMap<string, number>, clearings: MapInfo[] = [], known?: ReadonlySet<string>): Problem[] {
  const out: Problem[] = [];
  const add = (severity: Severity, where: Problem["where"], message: string) => out.push({ severity, where, message });
  if (!room.name.trim()) add("warning", { field: "name" }, "The room has no name.");
  if (new Set(room.rounds).size !== room.rounds.length) add("error", { field: "rounds" }, "A round is listed twice.");
  if (room.role === "final" && room.rounds.length) add("warning", { field: "rounds" }, "The final room comes after the last round: its rounds aren't used.");
  const ids = new Map<string, number>();
  room.battles.forEach((b, i) => {
    if (ids.has(b.id)) add("error", { battle: i }, `Two battles are called "${b.id}".`);
    ids.set(b.id, i);
    if (!ID_PATTERN.test(b.id)) add("error", { battle: i }, `Battle ${i + 1}'s id "${b.id}" isn't lower-case letters, digits and underscores.`);
    const { min, max } = FORMAT_ENEMIES[b.format];
    if (b.enemies.length > max) add("error", { battle: i }, `Battle "${b.id}" has ${b.enemies.length} enemies; a ${b.format} battle takes ${max === 1 ? "one" : `at most ${max}`}.`);
    if (b.enemies.length < min) add("error", { battle: i }, `Battle "${b.id}" has no enemy.`);
    if (!room.npcs.some((n) => n.type === "battle" && n.battle === b.id))
      add("warning", { battle: i }, `No NPC starts battle "${b.id}": it can't be fought.`);
    else if (room.npcs.filter((n) => n.type === "battle" && n.battle === b.id).every((n) => (n.chance ?? DEFAULT_CHANCE) < 100 || n.requires.length))
      add("warning", { battle: i }, `Battle "${b.id}"'s NPCs may all not spawn (chances or spawn conditions): the room may be free.`);
    b.enemies.forEach((e, k) => {
      for (const key of e.catch?.after ?? []) if (known && !known.has(key))
        add("error", { battle: i }, `Battle "${b.id}"'s enemy ${k + 1} can be caught only after winning "${key}", which no room has.`);
      if (e.catch && new Set(e.catch.after).size !== e.catch.after.length) add("warning", { battle: i }, `Battle "${b.id}"'s enemy ${k + 1} names a battle twice.`);
    });
  });
  const tiles = new Map<string, number>();
  room.npcs.forEach((n, i) => {
    const name = npcName(i, n);
    if (n.type === "battle") {
      const battle = room.battles.find((b) => b.id === n.battle);
      if (!n.battle) add("error", { npc: i }, `${name} starts no battle: choose one.`);
      else if (!battle) add("error", { npc: i }, `${name} starts battle "${n.battle}", which the room doesn't have.`);
      else if ((n.enemy ?? 0) >= battle.enemies.length) add("error", { npc: i }, `${name} shows enemy ${(n.enemy ?? 0) + 1}, but battle "${battle.id}" has ${battle.enemies.length}.`);
      else if (!n.sprite && !walkingSprite(shownEnemy(n, room)?.species, constants))
        add("warning", { npc: i }, `${name}: ${shownEnemy(n, room)?.species} has no walking sprite; choose a sprite for it.`);
    } else {
      if (n.battle !== undefined || n.enemy !== undefined) add("warning", { npc: i }, `${name} names a battle, which only battle NPCs use.`);
    }
    if (n.type === "item" && !n.item) add("error", { npc: i }, `${name} gives no item: choose one.`);
    if (n.type !== "item" && (n.item !== undefined || n.count !== undefined)) add("warning", { npc: i }, `${name} has an item, which only item NPCs give.`);
    if ((n.type === "rest" || n.type === "buff") && !n.sprite) add("error", { npc: i }, `${name} has no sprite: choose one.`);
    if (n.type !== "battle" && n.dialogue?.after) add("warning", { npc: i }, `${name} has an "after the battle" message, which only battle NPCs say.`);
    for (const key of n.requires) if (known && key !== RUN_COMPLETED && !known.has(key))
      add("error", { npc: i }, `${name} spawns only after winning "${key}", which no room has.`);
    if (new Set(n.requires).size !== n.requires.length) add("warning", { npc: i }, `${name} names a spawn condition twice.`);
    const key = `${n.x},${n.z}`;
    if (tiles.has(key)) add("error", { npc: i }, `${name} stands on the same tile as NPC ${tiles.get(key)! + 1} (${n.x}, ${n.z}).`);
    else tiles.set(key, i);
    const exit = clearings.map((c) => exitAt(c, n.x, n.z)).find((e) => e);
    if (exit) add("error", { npc: i }, `${name} stands on the ${exit.side} exit (${n.x}, ${n.z}), in ${clearings.filter((c) => exitAt(c, n.x, n.z)).length} clearing(s).`);
    else {
      const blocked = clearings.filter((c) => c.blocked(n.x, n.z)).map((c) => clearingName(c.zone));
      if (blocked.length) add("warning", { npc: i }, `${name} stands on a blocked tile (${n.x}, ${n.z}) in ${blocked.length > 1 && blocked.length === clearings.length ? "every clearing" : blocked.join(", ")}.`);
    }
    if (n.x === ARRIVAL.x && n.z === ARRIVAL.z) add("error", { npc: i }, `${name} stands where the player arrives (${n.x}, ${n.z}).`);
  });
  return out;
}

/** "ZONE_ENTREE_FOREST_2" as "Entree Forest 2". */
export const clearingName = (zone: string) => zone.replace(/^ZONE_/, "").toLowerCase().split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

/** Whether a room can come up in a round: kept to none (any round) or to that one. */
export const inRound = (room: Room, round: Round) => !room.rounds.length || room.rounds.includes(round);

/** The checks over all the rooms: a run needs a final room, each round rooms, and rounds 1 and 2 a boss to end them. */
export function checkRooms(rooms: { id: string; room: Room }[]): string[] {
  const out: string[] = [];
  if (!rooms.some((r) => r.room.role === "final")) out.push("No room is the final room: a run has no end.");
  for (const round of ROUNDS) {
    if (!rooms.some((r) => r.room.role === "room" && inRound(r.room, round))) out.push(`Round ${round} has no rooms.`);
    if (round < 3 && !rooms.some((r) => r.room.role === "boss" && inRound(r.room, round))) out.push(`Round ${round} has no boss to end it.`);
  }
  if (rooms.some((r) => r.id === RUN_COMPLETED.split("/")[0])) out.push(`A room is called "run", which "${RUN_COMPLETED}" (a finished run) would mistake for it: rename it.`);
  // The save's bits: two battles or two catches with one number would share their progress
  const seen = new Map<string, string>();
  for (const r of rooms) r.room.battles.forEach((b) => {
    const where = battleKey(r.id, b.id);
    const mark = (kind: string, id: number | undefined, what: string) => {
      if (id === undefined) return;
      const key = `${kind} ${id}`;
      if (seen.has(key)) out.push(`${what} has the same ${kind} progress id (${id}) as ${seen.get(key)}: remove one's progress_id in the text view and save to give it a new one.`);
      else seen.set(key, what);
    };
    mark("battle", b.progressId, where);
    b.enemies.forEach((e, k) => { if (e.catch) mark("catch", e.progressId, `${where} enemy ${k + 1}`); });
  });
  return out;
}

// ---- Keys between rooms: catch.after and requires ---------------------------------------------------------------------

/** Every room's battles' keys, for the pickers and the checks. */
export function battleKeys(rooms: { id: string; room: Room }[]): Set<string> {
  return new Set(rooms.flatMap((r) => r.room.battles.map((b) => battleKey(r.id, b.id))));
}

/** A room's data with every catch.after and requires key renamed (a battle's or, with prefix, a room's), or null when
 * it names none. prefix: rename keys starting with from ("dialga/") to start with to, for a room's rename. */
export function renameKeys(data: JsonValue, from: string, to: string, prefix = false): JsonValue | null {
  const swap = (key: JsonValue): JsonValue => typeof key !== "string" ? key
    : prefix ? (key.startsWith(from) ? to + key.slice(from.length) : key) : key === from ? to : key;
  let changed = false;
  const list = (v: JsonValue | undefined) => {
    if (!Array.isArray(v)) return v;
    const next = v.map(swap);
    if (next.some((k, i) => k !== v[i])) changed = true;
    return next;
  };
  const room = asMap(data);
  const battles = asList(room.get("battles")).map((b) => {
    const bm = asMap(b);
    const enemies = asList(bm.get("enemies")).map((e) => {
      const em = asMap(e);
      const c = em.get("catch");
      if (!(c instanceof Map) || !c.has("after")) return e;
      return new Map(em).set("catch", new Map(c).set("after", list(c.get("after"))!));
    });
    return bm.has("enemies") ? new Map(bm).set("enemies", enemies) : b;
  });
  const npcs = asList(room.get("npcs")).map((n) => {
    const nm = asMap(n);
    return nm.has("requires") ? new Map(nm).set("requires", list(nm.get("requires"))!) : n;
  });
  if (!changed) return null;
  return new Map(room).set("battles", battles).set("npcs", npcs);
}

// ---- Progress ids -----------------------------------------------------------------------------------------------------

/** progress_ids.json: the next numbers to give, above every number ever given. */
export interface ProgressCounters { next_battle: number; next_catch: number }

/** The key orders the progress ids go in, from the schema's battle and enemy definitions. */
export interface RecordOrders { battle: string[]; enemy: string[] }

const withKey = (record: JsonMap, key: string, value: JsonValue, order: string[]): JsonMap => {
  const next = new Map(record).set(key, value);
  const rank = (k: string) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
  return new Map([...next].sort((a, b) => rank(a[0]) - rank(b[0])));
};

/** Gives every battle and every catchable enemy without a progress_id the next number, over all the rooms in their
 * order (by path), never changing a number already given. The counters only go up: they start above the file's and
 * every number in use, so a deleted battle's number isn't given again. Returns the rooms it changed and the new
 * counters, or an error when the save's bits run out. */
export function assignProgressIds(rooms: { path: string; data: JsonValue }[], counters: ProgressCounters | null, orders: RecordOrders):
  { changed: Map<string, JsonValue>; counters: ProgressCounters; error?: string } {
  let nextBattle = counters?.next_battle ?? 0;
  let nextCatch = counters?.next_catch ?? 0;
  const sorted = [...rooms].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const { data } of sorted) for (const b of asList(asMap(data).get("battles"))) {
    const id = asMap(b).get("progress_id");
    if (typeof id === "number") nextBattle = Math.max(nextBattle, id + 1);
    for (const e of asList(asMap(b).get("enemies"))) {
      const eid = asMap(e).get("progress_id");
      if (typeof eid === "number") nextCatch = Math.max(nextCatch, eid + 1);
    }
  }
  const changed = new Map<string, JsonValue>();
  for (const { path, data } of sorted) {
    let touched = false;
    const room = asMap(data);
    const battles = asList(room.get("battles")).map((b) => {
      let bm = asMap(b);
      if (typeof bm.get("progress_id") !== "number") { bm = withKey(bm, "progress_id", nextBattle++, orders.battle); touched = true; }
      const enemies = asList(bm.get("enemies")).map((e) => {
        const em = asMap(e);
        if (!(em.get("catch") instanceof Map) || typeof em.get("progress_id") === "number") return e;
        touched = true;
        return withKey(em, "progress_id", nextCatch++, orders.enemy);
      });
      return new Map(bm).set("enemies", enemies);
    });
    if (touched) changed.set(path, new Map(room).set("battles", battles));
  }
  const error = nextBattle > MAX_BATTLE_IDS ? `The save has ${MAX_BATTLE_IDS} battles' bits, and these need ${nextBattle}.`
    : nextCatch > MAX_CATCH_IDS ? `The save has ${MAX_CATCH_IDS} catches' bits, and these need ${nextCatch}.` : undefined;
  return { changed, counters: { next_battle: nextBattle, next_catch: nextCatch }, error };
}

/** A room's data without its progress ids, for a copy: its battles and catches get new ones on save. */
export function withoutProgressIds(data: JsonValue): JsonValue {
  const room = asMap(data);
  return new Map(room).set("battles", asList(room.get("battles")).map((b) => {
    const bm = new Map(asMap(b));
    bm.delete("progress_id");
    return bm.set("enemies", asList(bm.get("enemies")).map((e) => { const em = new Map(asMap(e)); em.delete("progress_id"); return em; }));
  }));
}
