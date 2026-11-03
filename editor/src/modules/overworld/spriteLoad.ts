// How many distinct sprites a zone can have loaded at once, against the field's sprite material cache: 32 object codes
// (FldActSys_InitBillboardActor(…, 0x20); docs/paperwhite2/design/npc-research.md, the limits). Past it a sprite that
// asks for an entry gets none and is never shown. The cache holds the zone's preloads (res/field/actors/preloads.json,
// the list its header's npc_cache names), the player's sprites, the Following Pokémon's, and every shown NPC's, instance's
// and ambient's that isn't one of those already; 3D models don't use it.
//
// The count is the worst case: over every combination of the seasons, times, weathers and flags the zone's conditions
// name, with every chance coming up, the NPCs and ambients that would show, each host (an NPC with instances) and
// ambient counting the sprite of whichever of its choices adds one more. Where the zone runs script 10852 (the user's
// seasonal spawns, global_10850.s), its flags 500 to 599 are worked out too, for each season, each of its three rolls and
// day or night (seasonalFlags): an NPC of one of those flags counts only where the script shows it. Any other flag of an
// NPC (a story flag) can't be known here, so it counts as shown, and so do 500 to 599 where the zone doesn't run 10852
// (they keep what the last zone that ran it left).

import { api } from "../../api.ts";
import { actorFolder, type Entity } from "./entities.ts";
import { SEASON_NAMES, TIME_NAMES, type Ambient, type Condition, type SpawnEntry } from "./spawns.ts";

// The original's sprite cache, 32 object codes; the hack's build sets its own (spriteCacheSize)
export const SPRITE_CACHE_ORIGINAL = 32;
let cacheSize: Promise<number> | null = null;
/** The sprite cache's size as the hack's build makes it: PAPERWHITE2_SPRITE_CACHE in include/paperwhite2/sprites.h,
 * else the original's. */
export function spriteCacheSize(): Promise<number> {
  cacheSize ??= api.scan("include/paperwhite2/sprites.h", "^#define PAPERWHITE2_SPRITE_CACHE ").then(
    (lines) => Number(/PAPERWHITE2_SPRITE_CACHE\s+(\d+)/.exec(lines[0]?.text ?? "")?.[1] ?? SPRITE_CACHE_ORIGINAL),
    () => SPRITE_CACHE_ORIGINAL);
  return cacheSize;
}
// The player: its walking sprite, and the one it changes to (cycling, surfing), while the first is still loaded
export const PLAYER_SPRITES = 2;
// The Following Pokémon's sprite
export const FOLLOWER_SPRITES = 1;
// Past this many flags in the zone's conditions, only all set, none set and each one alone are tried
const FLAG_COMBINATIONS_MAX = 6;

const types = new Map<string, Promise<string | null>>();

/** An object code's actor type (its data.json's "type": "sprite", "model" or "none"), or null where it has none. */
export function actorType(code: string): Promise<string | null> {
  if (!types.has(code)) {
    types.set(code, api.file(`${actorFolder(code)}/data.json`).then((f) => (JSON.parse(f.text) as { type?: string }).type ?? null, () => null));
  }
  return types.get(code)!;
}

let preloads: Promise<(string | number)[][]> | null = null;

/** The preload lists, by number. */
export function preloadLists(): Promise<(string | number)[][]> {
  preloads ??= api.file("res/field/actors/preloads.json").then((f) => (JSON.parse(f.text) as { lists: (string | number)[][] }).lists, () => []);
  return preloads;
}

interface World { season: string; time: string; weather: string; flags: Set<string> }

/** Whether and how a zone runs script 10852: its script file calls it, and sets EVENT_WORK_0x401f first (its night
 * swaps). */
export interface Seasonal { runs: boolean; night: boolean }

/** The flags of script 10852 shown each at 10% (590 to 599) */
export const RARE_FLAGS = Array.from({ length: 10 }, (_, i) => 590 + i);
// The practical worst case: at most this many of the rare ones (at least 3 of 10 at 10% comes up on 7% of entries)
export const RARE_LIKELY = 2;

/** Script 10852's shown flags among 500 to 599 for a season (0 to 3), its three rolls (a 1 to 3, b 4 to 6, c 7 to 9),
 * whether its night swaps run, and which of the rare ones come up (all of them by default: the worst case). */
export function seasonalFlags(season: number, a: number, b: number, c: number, night: boolean,
                              rare: readonly number[] = RARE_FLAGS): Set<number> {
  const shown = new Set<number>();
  for (let f = 550; f <= 559; f++) shown.add(f);
  const base = 500 + 10 * season;
  [base, base + a, base + b, base + c, 540, 540 + a, 540 + b, 540 + c].forEach((f) => shown.add(f));
  if (night) {
    shown.add(575);
    const d = 560 + season * 3;
    // A roll at its last value is swapped for the season's night NPC and for the night one of 572 to 574
    if (a === 3) { shown.delete(base + 3); shown.add(d); shown.delete(543); shown.add(572); }
    if (b === 6) { shown.delete(base + 6); shown.add(d + 1); shown.delete(546); shown.add(573); }
    if (c === 9) { shown.delete(base + 9); shown.add(d + 2); shown.delete(549); shown.add(574); }
  }
  rare.forEach((f) => shown.add(f));
  return shown;
}

/** Whether a zone's script file runs script 10852, and its night swaps. */
export function seasonalOf(script: string): Seasonal {
  const runs = /RTCallGlobal\s+10852\b/.test(script);
  return { runs, night: runs && /WorkSetConst\s+EVENT_WORK_0x401f,\s*1\s*\n\s*RTCallGlobal\s+10852\b/.test(script) };
}

/** A flag's number, from a constant (EVENT_FLAG_0x0226) or a number; null where it has none. */
export function flagNumber(v: unknown): number | null {
  if (typeof v === "number") return v || null;
  const m = typeof v === "string" ? /0x([0-9a-f]+)$/i.exec(v) : null;
  return m ? parseInt(m[1], 16) : null;
}

const SEASONAL_FIRST = 500;
const SEASONAL_LAST = 599;

export interface SpriteLoad {
  total: number;
  preloaded: number;
  player: number;
  follower: number;
  /** The NPCs' and instances' sprites past the preloads, in the worst case, and the ambients'. */
  npcs: number;
  ambients: number;
  /** The worst case's world, in words. */
  worst: string;
  /** The preloaded sprites, and those past them in the worst case. */
  preloadedCodes: string[];
  extraCodes: string[];
  /** Where the zone runs 10852: the total with at most RARE_LIKELY of its rare NPCs at once (the practical worst). */
  likely: number | null;
}

/** Whether a condition holds in a world, every chance coming up (the worst case). */
function holds(c: Condition | undefined, w: World): boolean {
  if (!c) return true;
  if (c.season && !c.season.includes(w.season)) return false;
  if (c.time && !c.time.includes(w.time)) return false;
  if (c.weather && !c.weather.includes(w.weather)) return false;
  if (c.flags?.set?.some((f) => !w.flags.has(f))) return false;
  if (c.flags?.unset?.some((f) => w.flags.has(f))) return false;
  return true;
}

const codeOf = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" ? `OBJ_CODE_${v}` : null);

/** The worlds worth trying: each season and time, each weather the conditions name (and sunny), and the flags' sets. */
function worlds(conditions: Condition[]): World[] {
  const weathers = new Set<string>(["WEATHER_SUNNY"]);
  const flags = new Set<string>();
  for (const c of conditions) {
    c.weather?.forEach((x) => weathers.add(x));
    c.flags?.set?.forEach((f) => flags.add(f));
    c.flags?.unset?.forEach((f) => flags.add(f));
  }
  const list = [...flags];
  const sets: Set<string>[] = [];
  if (list.length <= FLAG_COMBINATIONS_MAX) {
    for (let m = 0; m < 1 << list.length; m++) sets.push(new Set(list.filter((_, i) => m & (1 << i))));
  } else {
    sets.push(new Set(), new Set(list), ...list.map((f) => new Set([f])));
  }
  const out: World[] = [];
  for (const season of SEASON_NAMES) for (const time of TIME_NAMES) for (const weather of weathers) for (const f of sets) {
    out.push({ season, time, weather, flags: f });
  }
  return out;
}

/** The zone's worst case: its NPCs (the events' NPC entities), its spawn data, its ambients and its preload list. */
export async function spriteLoad(npcs: Entity[], entries: SpawnEntry[], ambients: Ambient[], preload: (string | number)[],
                                 flagOf: (npcId: number) => number | null, seasonal: Seasonal): Promise<SpriteLoad> {
  const managed = new Map(entries.map((e) => [e.id, e]));
  const conditions: Condition[] = [];
  for (const e of entries) {
    if (e.when) conditions.push(e.when);
    e.instances?.forEach((i) => i.when && conditions.push(i.when));
  }
  ambients.forEach((a) => a.when && conditions.push(a.when));
  // Every code any of them can show, and which of those are sprites
  const all = new Set<string>();
  const add = (v: unknown) => { const c = codeOf(v); if (c) all.add(c); };
  npcs.forEach((n) => add(n.model));
  entries.forEach((e) => e.instances?.forEach((i) => add(i.npc.model)));
  ambients.forEach((a) => (a.sprites ?? [a.sprite]).forEach(add));
  preload.forEach(add);
  const sprite = new Map<string, boolean>();
  // (a code with no actor data counts: a work code's sprite, which a variable chooses, is one)
  await Promise.all([...all].map(async (c) => sprite.set(c, (await actorType(c)) !== "model" && (await actorType(c)) !== "none")));
  const base = new Set(preload.map(codeOf).filter((c): c is string => !!c && !!sprite.get(c)));
  let worst = { npcs: 0, ambients: 0, world: "", codes: [] as string[] };
  // Script 10852's states: each roll and day or night where it runs, else none (every flag shown)
  const states: { a: number; b: number; c: number; night: boolean }[] = [];
  if (seasonal.runs) {
    for (let a = 1; a <= 3; a++) for (let b = 4; b <= 6; b++) for (let c = 7; c <= 9; c++) for (const night of [false, true]) {
      states.push({ a, b, c, night });
    }
  }
  // (its night is the hours it tests, which are each season's night and late night exactly, so a state's night goes
  // with the world's time; without its night swaps, never)
  const atNight = (w: World) => seasonal.night && (w.time === "night" || w.time === "late_night");
  // The rare flags the zone's NPCs use, and their sets of at most RARE_LIKELY
  const used = RARE_FLAGS.filter((f) => npcs.some((n) => flagOf(n.npcId!) === f)
    || entries.some((e) => e.instances?.some((i) => flagNumber(i.npc.flag) === f)));
  const likelySets: number[][] = [[]];
  used.forEach((f, i) => { likelySets.push([f]); used.slice(i + 1).forEach((g) => likelySets.push([f, g])); });
  let likely = 0;
  /** The sprites past the preloads that show in a world and a state of 10852, with the rare flags that come up. */
  const evaluate = (w: World, state: (typeof states)[number] | null, rare: readonly number[]) => {
    const seasonalShown = state
      ? seasonalFlags(SEASON_NAMES.indexOf(w.season as typeof SEASON_NAMES[number]), state.a, state.b, state.c, state.night, rare) : null;
    /** Whether a record's own flag lets it show: a seasonal flag by the script's state, any other always (unknown). */
    const flagShows = (flag: number | null) => !seasonalShown || flag === null || flag < SEASONAL_FIRST || flag > SEASONAL_LAST || seasonalShown.has(flag);
    const shown = new Set(base);
    for (const n of npcs) {
      const entry = managed.get(n.npcId!);
      const code = codeOf(n.model);
      if (!entry || !entry.instances?.length) {
        if (!flagShows(flagOf(n.npcId!))) continue;
        if (entry && !holds(entry.when, w)) continue;
        if (code && sprite.get(code)) shown.add(code);
        continue;
      }
      if (!holds(entry.when, w)) continue;
      // A host: whichever of its instances that can show adds one more, if any does
      const choices = entry.instances.filter((i) => holds(i.when, w) && flagShows(flagNumber(i.npc.flag)))
        .map((i) => codeOf(i.npc.model)).filter((c): c is string => !!c && !!sprite.get(c));
      const fresh = choices.find((c) => !shown.has(c));
      if (fresh) shown.add(fresh);
    }
    const npcCount = shown.size - base.size;
    for (const a of ambients) {
      if (!holds(a.when, w)) continue;
      const choices = (a.sprites ?? [a.sprite]).map(codeOf).filter((c): c is string => !!c && !!sprite.get(c));
      const fresh = choices.find((c) => !shown.has(c));
      if (fresh) shown.add(fresh);
    }
    return { npcCount, ambientCount: shown.size - base.size - npcCount, shown };
  };
  for (const w of worlds(conditions)) for (const state of states.length ? states.filter((st) => st.night === atNight(w)) : [null]) {
    const { npcCount, ambientCount, shown } = evaluate(w, state, RARE_FLAGS);
    if (npcCount + ambientCount > worst.npcs + worst.ambients) {
      worst = { npcs: npcCount, ambients: ambientCount, codes: [...shown].filter((c) => !base.has(c)),
                world: [w.season, w.time.replace("_", " "), w.weather.replace(/^WEATHER_/, "").toLowerCase(), w.flags.size ? `flags ${[...w.flags].join(", ")}` : "",
                        state ? `10852's rolls ${state.a}, ${state.b}, ${state.c}${state.night ? " at night" : ""}` : ""]
                  .filter(Boolean).join(", ") };
    }
    if (state) {
      for (const rare of likelySets) {
        const r = evaluate(w, state, rare);
        likely = Math.max(likely, r.npcCount + r.ambientCount);
      }
    }
  }
  if (!conditions.length && !states.length) worst.world = "";
  const total = base.size + PLAYER_SPRITES + FOLLOWER_SPRITES + worst.npcs + worst.ambients;
  return { total, preloaded: base.size, player: PLAYER_SPRITES, follower: FOLLOWER_SPRITES, npcs: worst.npcs, ambients: worst.ambients, worst: worst.world,
           preloadedCodes: [...base], extraCodes: worst.codes,
           likely: states.length ? base.size + PLAYER_SPRITES + FOLLOWER_SPRITES + likely : null };
}
