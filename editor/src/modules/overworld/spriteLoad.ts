// How many distinct sprites a zone can have loaded at once, against the field's sprite material cache: 32 object codes
// (FldActSys_InitBillboardActor(…, 0x20); docs/paperwhite2/design/npc-research.md, the limits). Past it a sprite that
// asks for an entry gets none and is never shown. The cache holds the zone's preloads (res/field/actors/preloads.json,
// the list its header's npc_cache names), the player's sprites, the Following Pokémon's, and every shown NPC's, instance's
// and ambient's that isn't one of those already; 3D models don't use it.
//
// The count is the worst case: over every combination of the seasons, times, weathers and flags the zone's conditions
// name, with every chance coming up, the NPCs and ambients that would show, each host (an NPC with instances) and
// ambient counting the sprite of whichever of its choices adds one more. An NPC without spawn data counts as shown, since
// its story flag can't be known here.

import { api } from "../../api.ts";
import { actorFolder, type Entity } from "./entities.ts";
import { SEASON_NAMES, TIME_NAMES, type Ambient, type Condition, type SpawnEntry } from "./spawns.ts";

export const SPRITE_CACHE = 32;
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
export async function spriteLoad(npcs: Entity[], entries: SpawnEntry[], ambients: Ambient[], preload: (string | number)[]): Promise<SpriteLoad> {
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
  for (const w of worlds(conditions)) {
    const shown = new Set(base);
    for (const n of npcs) {
      const entry = managed.get(n.npcId!);
      const code = codeOf(n.model);
      if (!entry) { if (code && sprite.get(code)) shown.add(code); continue; }
      if (!holds(entry.when, w)) continue;
      if (entry.instances?.length) {
        // A host: whichever of its instances that can show adds one more, if any does
        const choices = entry.instances.filter((i) => holds(i.when, w)).map((i) => codeOf(i.npc.model)).filter((c): c is string => !!c && !!sprite.get(c));
        const fresh = choices.find((c) => !shown.has(c));
        if (fresh) shown.add(fresh);
      } else if (code && sprite.get(code)) shown.add(code);
    }
    const npcCount = shown.size - base.size;
    for (const a of ambients) {
      if (!holds(a.when, w)) continue;
      const choices = (a.sprites ?? [a.sprite]).map(codeOf).filter((c): c is string => !!c && !!sprite.get(c));
      const fresh = choices.find((c) => !shown.has(c));
      if (fresh) shown.add(fresh);
    }
    const ambientCount = shown.size - base.size - npcCount;
    if (npcCount + ambientCount > worst.npcs + worst.ambients) {
      worst = { npcs: npcCount, ambients: ambientCount, codes: [...shown].filter((c) => !base.has(c)),
                world: [w.season, w.time.replace("_", " "), w.weather.replace(/^WEATHER_/, "").toLowerCase(), w.flags.size ? `flags ${[...w.flags].join(", ")}` : ""]
                  .filter(Boolean).join(", ") };
    }
  }
  if (!conditions.length) worst.world = "";
  const total = base.size + PLAYER_SPRITES + FOLLOWER_SPRITES + worst.npcs + worst.ambients;
  return { total, preloaded: base.size, player: PLAYER_SPRITES, follower: FOLLOWER_SPRITES, npcs: worst.npcs, ambients: worst.ambients, worst: worst.world,
           preloadedCodes: [...base], extraCodes: worst.codes };
}
