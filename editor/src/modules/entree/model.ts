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
/** A room file, which only the Entree page saves: its Save gives new battles and catches their progress ids first. */
export const isRoomFile = (path: string) => path.startsWith(`${ROOMS_DIR}/`) && path.endsWith(".json");
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
/** The NPCs' types (room.schema.json's npc type), in the pickers' order: the step 6 types after battle and item (the
 * buffs' phase 7 swap with the rest's), the old placeholders last. */
export const NPC_TYPES = ["battle", "item", "heal", "revive", "gift", "shop", "swap", "item_choice", "buff_choice", "rest", "buff"] as const;
export type NpcType = (typeof NPC_TYPES)[number];
export const NPC_TYPE_NOTES: Record<NpcType, string> = {
  battle: "Talking to it starts the battle it names.",
  item: "Gives a fixed item and goes.",
  heal: "Heals every Pokémon that hasn't fainted: HP, status and PP.",
  revive: "Revives a fainted Pokémon the player chooses, to full HP (offered only with one fainted).",
  gift: "A choice of 3 random items from the item table's gift pool.",
  shop: "A shop: the Poké Mart's screen selling the run's shop items for Dream Dust. Talking to it is the room's choice.",
  swap: "Brings a Pokémon of the Reserve Box (set aside at the Entralink's NPC) into the team as a level 100 copy, in place of a copy that hasn't fainted, for the run's swap Dust; the copy that makes way leaves the run. A swap is the room's choice; each reserved Pokémon joins once a run.",
  item_choice: "An item ball whose item is drawn from the item room pool as the room is entered; its bag icon floats above it. Taking one makes the others go.",
  buff_choice: "A buff ball (a placeholder line until buffs come).",
  rest: "The old placeholder: says its dialogue only.",
  buff: "The old placeholder: says its dialogue only.",
};
/** The types shown as a ball (the item ball); the others but battle are people (the Lady). */
export const BALL_TYPES: readonly NpcType[] = ["item", "item_choice", "buff_choice"];
/** The types whose use is the room's choice: using one makes the others of these types go and the room is done. */
export const CHOICE_TYPES: readonly NpcType[] = ["heal", "revive", "gift", "shop", "swap", "item_choice"];
/** The NPC marker a new NPC of a type gets, if npc_markers/ has it. */
export const NPC_DEFAULT_MARKERS: Partial<Record<NpcType, string>> = {
  heal: "heal", revive: "revive", gift: "item", shop: "shop", swap: "swap", buff_choice: "buff", rest: "rest", buff: "buff",
};
/** The balls an item room is meant to offer. */
export const ITEM_CHOICES = 3;
export const FACINGS = ["DIR_UP", "DIR_DOWN", "DIR_LEFT", "DIR_RIGHT"] as const;

// ---- Markers (step 5): on the ground in front of a done room's forward doors, and over NPCs ----------------------------

/** A room's marker (room.schema.json's marker), shown in front of any door leading to it: markers/<type>.png. The game
 * also has catch, which it shows instead of enemy, enemy choice, challenge or boss while one of the room's enemies can be
 * caught and the run's bag holds a Nightmare Ball; it is never set by hand. */
export const MARKER_TYPES = ["enemy", "enemy_choice", "challenge", "boss", "rest", "gift", "event", "shop", "unknown", "final"] as const;
export type MarkerType = (typeof MARKER_TYPES)[number];
export const MARKER_NOTES: Record<MarkerType, string> = {
  enemy: "An enemy", enemy_choice: "Enemies to choose from", challenge: "A challenging enemy", boss: "A boss", rest: "A rest", gift: "A gift",
  event: "An event", shop: "A shop", unknown: "??? (always, whatever is behind the door)", final: "Darkrai's, the final room",
};
/** A room's marker when it has none, by its role (the packer's ROLE_MARKERS). */
export const ROLE_MARKERS: Record<Role, MarkerType> = { room: "enemy", boss: "boss", final: "final" };
export const MARKERS_DIR = "res/paperwhite2/entralink/markers";
export const NPC_MARKERS_DIR = "res/paperwhite2/entralink/npc_markers";
export const markerArt = (type: string) => `${MARKERS_DIR}/${type}.png`;
export const npcMarkerArt = (name: string) => `${NPC_MARKERS_DIR}/${name}.png`;
/** The forward doors, whose markers lie at run.json's marker_spots (south is the back door). */
export const DOORS = ["north", "east", "west"] as const;
export type Door = (typeof DOORS)[number];
/** Each marker's 2 by 2 tiles from its top-left tile, when run.json leaves them out (the packer's DEFAULT_MARKER_SPOTS). */
export const DEFAULT_MARKER_SPOTS: Record<Door, [number, number]> = { north: [15, 12], east: [21, 16], west: [9, 16] };
export const DEFAULT_UNKNOWN_CHANCE = 5;
/** Whether a tile is under a door's marker. */
export const onSpot = (spot: [number, number], x: number, z: number) => x >= spot[0] && x < spot[0] + 2 && z >= spot[1] && z < spot[1] + 2;

// ---- Room types (step 6): what a door draws by its round's type_weights, and the templates of the generated rooms ------

/** A room's type (room.schema.json's type), for role room only; enemy when left out. */
export const ROOM_TYPES = ["enemy", "enemy_choice", "challenge", "rest", "item", "buff", "shop", "event"] as const;
export type RoomType = (typeof ROOM_TYPES)[number];
export const DEFAULT_ROOM_TYPE: RoomType = "enemy";
export const ROOM_TYPE_NOTES: Record<RoomType, string> = {
  enemy: "A battle room: one battle.",
  enemy_choice: "A battle room with several battles to choose from, one NPC each: winning one opens the room.",
  challenge: "A harder battle room.",
  rest: "A rest: heal, revive, gift and swap NPCs; using one is the room's choice.",
  item: "An item room: item-choice balls, one to take.",
  buff: "A buff room: buff balls (buffs come later).",
  shop: "A shop: its goods sell for Dream Dust, which battles give.",
  event: "An event room; with none, doors skip the type.",
};
/** The marker a door shows for a room of role room by its type (the packer's TYPE_MARKERS). */
export const TYPE_MARKERS: Record<RoomType, MarkerType> = {
  enemy: "enemy", enemy_choice: "enemy_choice", challenge: "challenge", rest: "rest", item: "gift", buff: "gift", shop: "shop", event: "event",
};
/** The types a door draws from a template (templates/<type>.json) unless a premade room comes up, at run.json's
 * custom_chance; the others only from premade rooms. */
export const TEMPLATE_ROOM_TYPES: readonly RoomType[] = ["rest", "item", "buff", "shop"];

/** A room's marker when it has none: a room's by its type, a boss or final room's by its role. */
export const defaultMarker = (room: Pick<Room, "role" | "type">): MarkerType =>
  room.role === "room" ? TYPE_MARKERS[room.type ?? DEFAULT_ROOM_TYPE] : ROLE_MARKERS[room.role];

export const TEMPLATES_DIR = "res/paperwhite2/entralink/templates";
export const isTemplateFile = (path: string) => path.startsWith(`${TEMPLATES_DIR}/`) && path.endsWith(".json");
export const templatePath = (id: string) => `${TEMPLATES_DIR}/${id}.json`;
/** The templates the run needs; every generated room of a type is its template. event's is optional. */
export const TEMPLATES = ["rest", "item", "buff", "shop", "pre_boss_rest"] as const;
/** A template's type, its file's (pre_boss_rest's rest). */
export const TEMPLATE_TYPES: Record<string, RoomType> = { rest: "rest", item: "item", buff: "buff", shop: "shop", pre_boss_rest: "rest", event: "event" };
export const TEMPLATE_NOTES: Record<string, string> = {
  rest: "Every generated rest room is this template.",
  item: "Every generated item room is this template.",
  buff: "Every generated buff room is this template.",
  shop: "Every generated shop is this template.",
  pre_boss_rest: "The rest before every boss and the final room (in the pre-boss map; its north door leads on) is this template.",
  event: "Every generated event room is this template.",
};

/** A template's starting data, the spec's placeholders: rest heal, revive, gift and swap; item three item-choice balls;
 * buff three buff balls; shop one shop NPC; the pre-boss rest heal, revive, gift, shop and swap. markers: the NPC
 * markers' names. */
export function newTemplateData(id: string, markers?: ReadonlySet<string>): JsonValue {
  const kinds: Record<string, NpcType[]> = {
    rest: ["heal", "revive", "gift", "swap"], item: ["item_choice", "item_choice", "item_choice"], buff: ["buff_choice", "buff_choice", "buff_choice"],
    shop: ["shop"], pre_boss_rest: ["heal", "revive", "gift", "shop", "swap"], event: [],
  };
  const list = kinds[id] ?? [];
  const empty: Room = { name: "", rounds: [], role: "room", battles: [], npcs: [] };
  // In a row across the clearing's middle, two tiles apart
  const npcs = list.map((type, i) => newNpc(type, 15 - (list.length - 1) + i * 2, 14, empty, markers));
  const name = id.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  return new Map<string, JsonValue>([["$schema", "../room.schema.json"], ["name", `${name} (template)`], ["type", TEMPLATE_TYPES[id] ?? "rest"],
    ["role", "room"], ["battles", []], ["npcs", npcs]]);
}

/** The checks over the templates: one the run needs that is missing. */
export function checkTemplates(ids: Iterable<string>): string[] {
  const have = new Set(ids);
  return TEMPLATES.filter((t) => !have.has(t)).map((t) => `Template missing: templates/${t}.json, `
    + `${t === "pre_boss_rest" ? "the rest before each boss" : `every generated ${t} room`}. Make it under Templates.`);
}

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
/** The people NPCs' sprite when they have none of their own. */
export const LADY_SPRITE = "OBJ_CODE_LADY";
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
export interface Dialogue { before?: string; after?: string; beforeStyle?: MessageStyle; afterStyle?: MessageStyle }

/** The window a message shows in (room.schema.json's message_style; talk when left out). */
export const MESSAGE_STYLES = ["talk", "bubble", "yell", "event"] as const;
export type MessageStyle = (typeof MESSAGE_STYLES)[number];
export const MESSAGE_STYLE_NOTES: Record<MessageStyle, string> = {
  talk: "The talk balloon, its tail at the NPC (ActorMsg)",
  bubble: "The balloon across the bottom of the screen, with no tail (InfoMsg)",
  yell: "The spiky balloon at the NPC, which shakes as it opens (ActorMsg's spiky frame)",
  event: "The system window, for narration (SystemMsg)",
};
const messageStyle = (v: JsonValue | undefined): MessageStyle | undefined => (MESSAGE_STYLES.includes(v as MessageStyle) ? v as MessageStyle : undefined);

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
  /** The icon over its head: npc_markers/<marker>.png. */
  marker?: string;
}

export interface Room {
  name: string;
  /** A room of role room's type; enemy when left out (DEFAULT_ROOM_TYPE). */
  type?: RoomType;
  /** The rounds it is kept to; empty for any round. */
  rounds: Round[];
  role: Role;
  weather?: string;
  /** Its marker in front of the doors leading to it; its type's or role's (defaultMarker) when left out. */
  marker?: MarkerType;
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
    type: ROOM_TYPES.includes(m.get("type") as RoomType) ? m.get("type") as RoomType : undefined,
    rounds: asList(m.get("rounds")).filter((r): r is Round => ROUNDS.includes(r as Round)),
    role: (ROLES.includes(m.get("role") as Role) ? m.get("role") : "room") as Role,
    weather: str(m.get("weather")),
    marker: MARKER_TYPES.includes(m.get("marker") as MarkerType) ? m.get("marker") as MarkerType : undefined,
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
        marker: str(nm.get("marker")),
        dialogue: d instanceof Map ? {
          before: str(d.get("before")), after: str(d.get("after")),
          ...(messageStyle(d.get("before_style")) && { beforeStyle: messageStyle(d.get("before_style")) }),
          ...(messageStyle(d.get("after_style")) && { afterStyle: messageStyle(d.get("after_style")) }),
        } : undefined,
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

/** A new NPC of a type at a tile, with what its type needs, and its type's marker (NPC_DEFAULT_MARKERS) if markers, the
 * NPC markers' names, has it. Its sprite is its type's default (npcSprite), so none is written. */
export function newNpc(type: NpcType, x: number, z: number, room: Room, markers?: ReadonlySet<string>): JsonMap {
  const npc: Record<string, unknown> = { type };
  if (type === "battle") npc.battle = room.battles[0]?.id ?? "";
  if (type === "item") npc.item = "ITEM_POTION";
  const marker = NPC_DEFAULT_MARKERS[type];
  return fromPlain({ ...npc, x, z, facing: "DIR_DOWN", ...(marker && markers?.has(marker) && { marker }) }) as JsonMap;
}

/** A battle NPC's walking Pokémon sprite for a species, if the game has one. */
export function walkingSprite(species: string | undefined, constants: ReadonlyMap<string, number>): string | null {
  if (!species) return null;
  const code = `OBJ_CODE_POKEMON_${species.replace(/^SPECIES_/, "")}`;
  return constants.has(code) ? code : null;
}

/** The sprite an NPC shows: its own, else its type's default (a battle NPC its enemy's walking Pokémon, the balls the
 * item ball, the others the Lady). Null when it has none. */
export function npcSprite(npc: Npc, room: Room, constants: ReadonlyMap<string, number>): string | null {
  if (npc.sprite) return npc.sprite;
  if (BALL_TYPES.includes(npc.type)) return ITEM_BALL_SPRITE;
  if (npc.type === "battle") return walkingSprite(shownEnemy(npc, room)?.species, constants);
  return LADY_SPRITE;
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

/** What checkRoom knows of the run: the doors' marker spots, and the NPC markers' names (npc_markers/). */
export interface MarkerInfo { spots: Record<Door, [number, number]>; npcMarkers?: ReadonlySet<string> }

/** The checks beyond the schema's for one room. clearings: the forest clearings' exits and blocked tiles, as far as
 * they are loaded; an NPC is checked against every one, since the game picks the clearing. known: every room's battles'
 * keys (battleKeys), to check what catches and spawn conditions name; not checked without it. markers: the doors'
 * marker spots, which NPCs should keep clear of, and the NPC markers there are; not checked without it. */
export function checkRoom(room: Room, constants: ReadonlyMap<string, number>, clearings: MapInfo[] = [], known?: ReadonlySet<string>,
  markers?: MarkerInfo): Problem[] {
  const out: Problem[] = [];
  const add = (severity: Severity, where: Problem["where"], message: string) => out.push({ severity, where, message });
  if (!room.name.trim()) add("warning", { field: "name" }, "The room has no name.");
  if (new Set(room.rounds).size !== room.rounds.length) add("error", { field: "rounds" }, "A round is listed twice.");
  if (room.role === "final" && room.rounds.length) add("warning", { field: "rounds" }, "The final room comes after the last round: its rounds aren't used.");
  if (room.role !== "room" && room.type) add("warning", { field: "type" }, `A ${room.role} room's type isn't used: only rooms of role room have one.`);
  // Step 7: an enemy room has one battle, an enemy_choice room several to choose from (the packer's room_problems)
  const roomType = room.type ?? DEFAULT_ROOM_TYPE;
  if (room.role === "room" && roomType === "enemy_choice" && room.battles.length < 2)
    add("warning", { field: "type" }, `An enemy-choice room has battles to choose from, but this one has ${room.battles.length}.`);
  if (room.role === "room" && roomType === "enemy" && room.battles.length > 1)
    add("warning", { field: "type" }, `An enemy room has one battle, but this one has ${room.battles.length}: several to choose from make it an enemy-choice room.`);
  const balls = room.npcs.filter((n) => n.type === "item_choice").length;
  if (balls && balls < ITEM_CHOICES) add("warning", { field: "npcs" }, `The room has ${balls} item-choice ball${balls > 1 ? "s" : ""}; an item room offers ${ITEM_CHOICES} to choose from.`);
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
    if (n.type === "item_choice" && (n.item !== undefined || n.count !== undefined)) add("warning", { npc: i }, `${name} has an item, but an item-choice ball's is drawn as the room is entered.`);
    else if (n.type !== "item" && (n.item !== undefined || n.count !== undefined)) add("warning", { npc: i }, `${name} has an item, which only item NPCs give.`);
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
    const spot = markers ? DOORS.find((d) => onSpot(markers.spots[d], n.x, n.z)) : undefined;
    if (spot) add("warning", { npc: i }, `${name} stands on the ${spot} door's marker (${n.x}, ${n.z}), which shows there once the room is done.`);
    if (n.marker && markers?.npcMarkers && !markers.npcMarkers.has(n.marker))
      add("error", { npc: i }, `${name}'s marker "${n.marker}" has no art: ${npcMarkerArt(n.marker)} is missing.`);
  });
  return out;
}

/** "ZONE_ENTREE_FOREST_2" as "Entree Forest 2". */
export const clearingName = (zone: string) => zone.replace(/^ZONE_/, "").toLowerCase().split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

/** Whether a room can come up in a round: kept to none (any round) or to that one. */
export const inRound = (room: Room, round: Round) => !room.rounds.length || room.rounds.includes(round);

// ---- The run: run.json's rounds and how the game draws their rooms --------------------------------------------------

/** The rooms of a run, the pre-boss rests and the final's included (the game's ENTRALINK_RUN_ROOMS_MAX). */
export const RUN_ROOMS_MAX = 20;

export interface RunRound {
  rooms: number; boss: boolean; fieldWeather?: string;
  /** Each room type's weight, the defaults filled in for those left out (DEFAULT_TYPE_WEIGHTS when not given). */
  typeWeights?: Record<RoomType, number>;
}

/** The room types' weights in run.json's order (its type_weights), and their defaults (the packer's). */
export const WEIGHT_ORDER: readonly RoomType[] = ["enemy", "enemy_choice", "challenge", "item", "buff", "rest", "event", "shop"];
export const DEFAULT_TYPE_WEIGHTS: Record<RoomType, number> = { enemy: 42, enemy_choice: 8, challenge: 12, item: 10, buff: 10, rest: 10, event: 5, shop: 3 };
export const DEFAULT_CUSTOM_CHANCE = 25;
export const DEFAULT_GROUND_ITEM_CHANCE = 30;
export const DEFAULT_HIDDEN_ITEM_CHANCE = 20;
/** Dream Dust (step 7): what a battle won gives by its room, times its round's percent (the packer's DEFAULT_DUST), and
 * a shop's goods. */
export const DUST_KINDS = ["enemy", "enemy_choice", "challenge", "boss", "final"] as const;
export type DustKind = (typeof DUST_KINDS)[number];
export const DUST_NOTES: Record<DustKind, string> = {
  enemy: "An enemy room's battle (and a battle in a room of a type with none of its own)", enemy_choice: "An enemy-choice room's battle",
  challenge: "A challenge room's battle", boss: "A boss's battle", final: "The final room's battle (the run ends there)",
};
export const DEFAULT_DUST: Record<DustKind, number> = { enemy: 40, enemy_choice: 50, challenge: 80, boss: 150, final: 0 };
export const DEFAULT_DUST_ROUND_PERCENT = [100, 150, 200];
/** run.json's enemy_scaling (phase 5): the stats, and each one's three rows, a value a round; their defaults. */
export const SCALED_STATS = ["hp", "attack", "defense", "sp_attack", "sp_defense", "speed"] as const;
export type ScaledStat = (typeof SCALED_STATS)[number];
export const SCALING_KEYS = ["rooms", "room_step", "boss"] as const;
export type ScalingKey = (typeof SCALING_KEYS)[number];
export const SCALING_DEFAULTS: Record<ScalingKey, number> = { rooms: 100, room_step: 0, boss: 100 };
export const SCALED_STAT_NAMES: Record<ScaledStat, string> = {
  hp: "HP", attack: "Attack", defense: "Defense", sp_attack: "Sp. Atk", sp_defense: "Sp. Def", speed: "Speed",
};
export const SCALING_KEY_NAMES: Record<ScalingKey, string> = { rooms: "First", room_step: "Step", boss: "Boss" };
/** A room enemy's own scale (room data), percent. */
export const DEFAULT_ENEMY_SCALE = 100;
export const DEFAULT_SHOP_ITEMS = 5;
export const MAX_SHOP_ITEMS = 8;
/** The buffs' phase 7: a swap's Dream Dust, and the Reserve Box's slots (at most the save's 30). */
export const DEFAULT_SWAP_DUST = 100;
export const MAX_SWAP_DUST = 9999;
export const DEFAULT_RESERVE_SLOTS = 6;
export const MAX_RESERVE_SLOTS = 30;
/** Each type's chance in percent from its weights (0 for all when they add up to 0). */
export function typeChances(weights: Record<RoomType, number>): Record<RoomType, number> {
  const sum = WEIGHT_ORDER.reduce((n, t) => n + weights[t], 0);
  return Object.fromEntries(WEIGHT_ORDER.map((t) => [t, sum ? (weights[t] * 100) / sum : 0])) as Record<RoomType, number>;
}
/** A percentage for the panels: whole from 10, one decimal below, "<0.1%" for a sliver. */
export function percent(p: number): string {
  if (p === 0) return "0%";
  if (p < 0.1) return "<0.1%";
  return `${p >= 10 ? Math.round(p) : Math.round(p * 10) / 10}%`;
}
export interface RunLayout {
  rounds: RunRound[];
  roomMaps: string[];
  finalMap?: string;
  /** The room before a boss or the final room; without it the room maps, north door only. */
  preBossMap?: string;
  unknownChance: number;
  customChance: number;
  groundItemChance: number;
  hiddenItemChance: number;
  markerSpots: Record<Door, [number, number]>;
  /** Dream Dust by kind and each round's percent (3, the last given for those left out), and a shop's goods. */
  dust: Record<DustKind, number>;
  dustRoundPercent: number[];
  shopItems: number;
  /** A swap NPC's price in Dream Dust, and how many Pokémon the hub's Reserve Box holds. */
  swapDust: number;
  reserveSlots: number;
  /** Each stat's multipliers in percent by depth, three values a row (the last given for rounds left out). */
  enemyScaling: Record<ScaledStat, Record<ScalingKey, number[]>>;
}

/** run.json's data as plain records. */
export function readRun(data: JsonValue | null | undefined): RunLayout {
  const m = asMap(data ?? undefined);
  return {
    rounds: asList(m.get("rounds")).map((r) => {
      const rm = asMap(r);
      const tw = asMap(rm.get("type_weights"));
      const typeWeights = Object.fromEntries(WEIGHT_ORDER.map((t) => [t, num(tw.get(t)) ?? DEFAULT_TYPE_WEIGHTS[t]])) as Record<RoomType, number>;
      return { rooms: num(rm.get("rooms")) ?? 0, boss: rm.get("boss") === true, fieldWeather: str(rm.get("field_weather")), typeWeights };
    }),
    roomMaps: asList(m.get("room_maps")).map(String),
    finalMap: str(m.get("final_map")),
    preBossMap: str(m.get("pre_boss_map")),
    unknownChance: num(m.get("unknown_chance")) ?? DEFAULT_UNKNOWN_CHANCE,
    customChance: num(m.get("custom_chance")) ?? DEFAULT_CUSTOM_CHANCE,
    groundItemChance: num(m.get("ground_item_chance")) ?? DEFAULT_GROUND_ITEM_CHANCE,
    hiddenItemChance: num(m.get("hidden_item_chance")) ?? DEFAULT_HIDDEN_ITEM_CHANCE,
    dust: Object.fromEntries(DUST_KINDS.map((k) => [k, num(asMap(m.get("dust")).get(k)) ?? DEFAULT_DUST[k]])) as Record<DustKind, number>,
    dustRoundPercent: (() => {
      const given = asList(m.get("dust_round_percent")).map((v) => num(v) ?? 0);
      const list = given.length ? given : DEFAULT_DUST_ROUND_PERCENT;
      return ROUNDS.map((_, i) => list[Math.min(i, list.length - 1)]);
    })(),
    shopItems: num(m.get("shop_items")) ?? DEFAULT_SHOP_ITEMS,
    swapDust: num(m.get("swap_dust")) ?? DEFAULT_SWAP_DUST,
    reserveSlots: num(m.get("reserve_slots")) ?? DEFAULT_RESERVE_SLOTS,
    enemyScaling: Object.fromEntries(SCALED_STATS.map((stat) => {
      const entry = asMap(asMap(m.get("enemy_scaling")).get(stat));
      return [stat, Object.fromEntries(SCALING_KEYS.map((key) => {
        const given = asList(entry.get(key)).map((v) => num(v) ?? SCALING_DEFAULTS[key]);
        const list = given.length ? given : [SCALING_DEFAULTS[key]];
        return [key, ROUNDS.map((_, i) => list[Math.min(i, list.length - 1)])];
      }))];
    })) as Record<ScaledStat, Record<ScalingKey, number[]>>,
    markerSpots: Object.fromEntries(DOORS.map((d) => {
      const spot = asList(asMap(m.get("marker_spots")).get(d)).map((v) => num(v) ?? 0);
      return [d, spot.length === 2 ? [spot[0], spot[1]] : DEFAULT_MARKER_SPOTS[d]];
    })) as Record<Door, [number, number]>,
  };
}

/** The rooms (role room) a round draws from: the generic ones (any round) and those kept to it. */
export function roomPool(rooms: { id: string; room: Room }[], round: Round): { generic: string[]; kept: string[] } {
  const fit = rooms.filter((r) => r.room.role === "room" && inRound(r.room, round));
  return { generic: fit.filter((r) => !r.room.rounds.length).map((r) => r.id), kept: fit.filter((r) => r.room.rounds.length).map((r) => r.id) };
}

/** The premade rooms of a type a round's doors draw from (role room, any round or that one). */
export function typePool(rooms: { id: string; room: Room }[], round: Round, type: RoomType): string[] {
  return rooms.filter((r) => r.room.role === "room" && inRound(r.room, round) && (r.room.type ?? DEFAULT_ROOM_TYPE) === type).map((r) => r.id);
}

/** The boss rooms a round's boss is drawn from: those kept to it, else the generic ones. */
export function bossPool(rooms: { id: string; room: Room }[], round: Round): { ids: string[]; kept: boolean } {
  const kept = rooms.filter((r) => r.room.role === "boss" && r.room.rounds.includes(round)).map((r) => r.id);
  if (kept.length) return { ids: kept, kept: true };
  return { ids: rooms.filter((r) => r.room.role === "boss" && !r.room.rounds.length).map((r) => r.id), kept: false };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A round's line for the Run section, e.g. "Round 1: 3 rooms, then a boss (1 round-1 boss room) - 3 generic rooms +
 * 0 round-1 rooms can be drawn". last: the run's last round, which the final room ends. */
export function roundSummary(rooms: { id: string; room: Room }[], round: Round, r: RunRound, last: boolean): string {
  const pool = roomPool(rooms, round);
  const finals = rooms.filter((x) => x.room.role === "final").length;
  const bosses = bossPool(rooms, round);
  const end = (r.boss && round < 3 ? `, then a boss (${plural(bosses.ids.length, bosses.kept ? `round-${round} boss room` : "generic boss room")})` : "")
    + (last ? `, then the final room (${plural(finals, "final room")})` : "");
  return `Round ${round}: ${plural(r.rooms, "room")}${end} - ${plural(pool.generic.length, "generic room")} + ${plural(pool.kept.length, `round-${round} room`)} can be drawn`;
}

/** The checks of the run's draw, as tools/paperwhite2/entralink_run.py's draw_problems makes them (the build fails on
 * the errors and prints the warnings). The game draws each room from its round's pool, one of the least used so far
 * other than the room just before, so too few rooms only means repeats: a warning. */
export function runProblems(run: Pick<RunLayout, "rounds">, rooms: { id: string; room: Room }[], templates?: ReadonlySet<string>): { severity: Severity; message: string }[] {
  const out: { severity: Severity; message: string }[] = [];
  const add = (severity: Severity, message: string) => out.push({ severity, message });
  if (!rooms.some((r) => r.room.role === "final")) add("error", "No room is the final room, which every run ends with.");
  let drawn = 0, bosses = 0;
  /** The rounds skipping the same types, said once: the types, and the rounds. */
  const skips = new Map<string, number[]>();
  const roomNames = new Set<string>(), bossNames = new Set<string>();
  run.rounds.forEach((r, i) => {
    const round = (i + 1) as Round;
    if (r.boss && round === 3) add("error", "Round 3 can't end with a boss: the final room ends it.");
    const pool = roomPool(rooms, round);
    const ids = [...pool.generic, ...pool.kept];
    // Step 6, with the templates given: a round's doors draw room types by its weights, the template types from the
    // templates too, and a type with no room is skipped
    const weights = r.typeWeights ?? DEFAULT_TYPE_WEIGHTS;
    const drawable = (t: RoomType) => typePool(rooms, round, t).length > 0 || (!!templates && TEMPLATE_ROOM_TYPES.includes(t) && templates.has(t));
    const typed = !!templates && WEIGHT_ORDER.some((t) => weights[t] && drawable(t));
    if (templates && r.rooms) {
      const skipped = WEIGHT_ORDER.filter((t) => weights[t] && !drawable(t));
      if (WEIGHT_ORDER.every((t) => !weights[t])) add("error", `Round ${round}'s room-type weights add up to 0, so its doors can't draw a room.`);
      else if (!typed) add("error", `Round ${round} draws ${plural(r.rooms, "room")}, but no type with a weight has a room or a template.`);
      else if (skipped.length) skips.set(skipped.join(" or "), [...(skips.get(skipped.join(" or ")) ?? []), round]);
    }
    if (typed) { /* a room of some type comes up: the premade pool alone may be empty */ }
    else if (r.rooms && !ids.length && !templates) add("error", `Round ${round} draws ${plural(r.rooms, "room")}, but no room can come up in it (role room, any round or round ${round}).`);
    else if (ids.length === 1 && r.rooms > 1) add("warning", `Round ${round} draws ${r.rooms} rooms, but only ${ids[0]} can come up in it: it comes up each time, twice in a row.`);
    else if (r.rooms > ids.length) add("warning", `Round ${round} draws ${r.rooms} rooms, but only ${ids.length} can come up in it: some come up more than once (never twice in a row).`);
    if (r.rooms && ids.length) { drawn += r.rooms; ids.forEach((id) => roomNames.add(id)); }
    if (r.boss && round < 3) {
      const b = bossPool(rooms, round);
      if (!b.ids.length) add("error", `Round ${round} ends with a boss, but no boss room can come up in it (role boss, kept to it or to no round).`);
      bosses++;
      b.ids.forEach((id) => bossNames.add(id));
    }
  });
  for (const [types, rounds] of skips) {
    const which = rounds.length > 1 ? `Rounds ${rounds.slice(0, -1).join(", ")} and ${rounds.at(-1)}` : `Round ${rounds[0]}`;
    add("warning", `${which}: no ${types} room can come up, so ${types.includes(" or ") ? "those types are" : "that type is"} skipped (the other types' chances rise).`);
  }
  // (each round's rooms, then a pre-boss rest and the boss for a round with one, and after the last the pre-boss rest
  // and the final: tools/paperwhite2/entralink_run.py's place_count)
  const total = run.rounds.reduce((n, r) => n + r.rooms + (r.boss ? 2 : 0), 0) + 2;
  if (total > RUN_ROOMS_MAX) add("error", `The rounds have ${total} rooms with the pre-boss rests and the final one, more than ${RUN_ROOMS_MAX}.`);
  if (roomNames.size && drawn > roomNames.size) add("warning", `The rounds draw ${drawn} rooms from ${roomNames.size}, so rooms come up more than once in a run (the least used first, never twice in a row).`);
  if (bossNames.size && bosses > bossNames.size) add("warning", `The run has ${bosses} bosses from ${plural(bossNames.size, "boss room")}, so a boss comes up twice.`);
  return out;
}

/** The checks over all the rooms beyond the run's (runProblems): a room called "run", and progress ids shared. */
export function checkRooms(rooms: { id: string; room: Room }[]): string[] {
  const out: string[] = [];
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

// ---- The item table (items.json, step 6) -----------------------------------------------------------------------------

export const ITEMS = "res/paperwhite2/entralink/items.json";
export const ITEMS_SCHEMA = "res/paperwhite2/entralink/items.schema.json";
export const POOLS = ["item_room", "gift", "shop", "ground"] as const;
export type Pool = (typeof POOLS)[number];
export const POOL_NAMES: Record<Pool, string> = { item_room: "Item room", gift: "Gift", shop: "Shop", ground: "Ground" };
export const POOL_NOTES: Record<Pool, string> = {
  item_room: "An item room's balls (item-choice NPCs): 3 different items drawn as the room is entered",
  gift: "A gift NPC's choice of 3",
  shop: "A shop's goods: run.json's shop items (5) different ones drawn as the room is entered, each at its price in Dream Dust",
  ground: "The ball lying in a room (Run: ground items) and the hidden item on a flower tile (Run: hidden items)",
};
/** The Nightmare Ball, drawn in any pool only while some enemy of the run's rooms can be caught. */
export const NIGHTMARE_BALL = "ITEM_NIGHTMARE_BALL";

export interface ItemEntry { item: string; weight: number; rounds: Round[]; price: number; pools: Pool[] }

/** items.json's entries as plain records. */
export function readItems(data: JsonValue | null | undefined): ItemEntry[] {
  return asList(asMap(data ?? undefined).get("items")).map((e) => {
    const em = asMap(e);
    return {
      item: str(em.get("item")) ?? "", weight: num(em.get("weight")) ?? 0,
      rounds: asList(em.get("rounds")).filter((r): r is Round => ROUNDS.includes(r as Round)),
      price: num(em.get("price")) ?? 0,
      pools: asList(em.get("pools")).filter((p): p is Pool => POOLS.includes(p as Pool)),
    };
  });
}

/** A new entry: a Potion of weight 10 in the item room pool. */
export const newItemEntry = (): JsonMap => fromPlain({ item: "ITEM_POTION", weight: 10, pools: ["item_room"] }) as JsonMap;

/** A pool's entries in a round and each one's chance in percent: its weight over the sum of the pool's entries that fit.
 * catchable: whether something can be caught now, without which the Nightmare Ball isn't drawn. */
export function poolChances(entries: ItemEntry[], pool: Pool, round: Round, catchable = true): { index: number; item: string; weight: number; chance: number }[] {
  const fit = entries.map((e, index) => ({ e, index }))
    .filter(({ e }) => e.pools.includes(pool) && (!e.rounds.length || e.rounds.includes(round)) && (catchable || e.item !== NIGHTMARE_BALL));
  const sum = fit.reduce((n, { e }) => n + e.weight, 0);
  return fit.map(({ e, index }) => ({ index, item: e.item, weight: e.weight, chance: sum ? (e.weight * 100) / sum : 0 }));
}

/** The item table's checks beyond the schema's: a pool with nothing in a round, a pool of 3 different items with fewer,
 * an item twice in one pool and round, a round listed twice. */
export function checkItems(entries: ItemEntry[]): { severity: Severity; index?: number; message: string }[] {
  const out: { severity: Severity; index?: number; message: string }[] = [];
  for (const pool of POOLS) {
    const empty = ROUNDS.filter((r) => !poolChances(entries, pool, r).length);
    if (empty.length) out.push({ severity: "warning", message: `The ${POOL_NAMES[pool].toLowerCase()} pool has no item in round ${empty.join(", ")}.` });
    if (pool === "item_room" || pool === "gift") {
      const few = ROUNDS.filter((r) => { const n = new Set(poolChances(entries, pool, r, false).map((c) => c.item)).size; return n > 0 && n < 3; });
      if (few.length) out.push({ severity: "warning", message: `The ${POOL_NAMES[pool].toLowerCase()} pool offers 3 different items, but has fewer in round ${few.join(", ")} (without the Nightmare Ball).` });
    }
  }
  entries.forEach((e, i) => {
    const twice = entries.findIndex((o, k) => k < i && o.item === e.item && o.pools.some((p) => e.pools.includes(p)) &&
      ROUNDS.some((r) => (!o.rounds.length || o.rounds.includes(r)) && (!e.rounds.length || e.rounds.includes(r))));
    if (twice >= 0) out.push({ severity: "warning", index: i, message: `Entry ${i + 1} draws ${e.item} in a pool and round that entry ${twice + 1} does too: their weights add up.` });
    if (new Set(e.rounds).size !== e.rounds.length) out.push({ severity: "error", index: i, message: `Entry ${i + 1} lists a round twice.` });
  });
  return out;
}

// ---- Flower tiles (flower_tiles.json, step 6): each clearing's, where a hidden item may lie ----------------------------

export const FLOWER_TILES = "res/paperwhite2/entralink/flower_tiles.json";
export const FLOWER_TILES_SCHEMA = "res/paperwhite2/entralink/flower_tiles.schema.json";
/** A clearing's flower tiles at most (the schema's maxItems). */
export const MAX_FLOWER_TILES = 64;

/** A clearing's flower tiles, [x, z] each. */
export function readFlowerTiles(data: JsonValue | null | undefined, zone: string): [number, number][] {
  return asList(asMap(data ?? undefined).get(zone)).map((t) => asList(t).map((v) => num(v) ?? 0)).filter((t) => t.length === 2) as [number, number][];
}

/** $schema first, then the clearings by their number (ZONE_ENTREE_FOREST is 0). */
const zoneRank = (k: string) => (k === "$schema" ? -1 : k.startsWith("ZONE_") ? Number(/_(\d+)$/.exec(k)?.[1] ?? 0) : 1e9);

/** The file's data with tiles of a clearing set (on) or cleared: the file's own order kept, new tiles after it, a new
 * clearing among the others by its number, a clearing with none left left out; at most MAX_FLOWER_TILES. */
export function setFlowerTiles(data: JsonValue | null | undefined, zone: string, tiles: { x: number; z: number }[], on: boolean): JsonMap {
  const old = readFlowerTiles(data, zone);
  const key = (x: number, z: number) => `${x},${z}`;
  const had = new Set(old.map(([x, z]) => key(x, z)));
  const changed = new Set(tiles.map((t) => key(t.x, t.z)));
  const added: [number, number][] = [];
  for (const t of tiles) if (!had.has(key(t.x, t.z))) { had.add(key(t.x, t.z)); added.push([t.x, t.z]); }
  const next = (on ? [...old, ...added] : old.filter(([x, z]) => !changed.has(key(x, z)))).slice(0, MAX_FLOWER_TILES);
  const map = new Map(asMap(data ?? undefined));
  if (next.length) map.set(zone, next); else map.delete(zone);
  return new Map([...map].sort((a, b) => zoneRank(a[0]) - zoneRank(b[0])));
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
