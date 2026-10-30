// Lookups the pages share: the areas of each place of the town map, the evolutionary families, and how each species
// can be had in the draft.

import type { Draft } from "./convert.ts";
import type { Loaded, Source } from "./load.ts";
import type { EncounterSettings, SpeciesInfo } from "./model.ts";

/** Each town map place's areas: its zone's and those of the zones whose parent it is. */
export function areasByPlace(loaded: Loaded): Map<string, string[]> {
  const byZone = new Map<string, string[]>();
  for (const { zone, encounters, parent } of loaded.zones) {
    if (!encounters) continue;
    const area = encounters.replace(/^ENCOUNTERS_/, "").toLowerCase();
    for (const key of new Set([zone, parent])) {
      const list = byZone.get(key) ?? [];
      if (!list.includes(area)) list.push(area);
      byZone.set(key, list);
    }
  }
  return byZone;
}

export interface Family {
  root: string;
  /** Its members, by evolution stage, then by number. */
  members: SpeciesInfo[];
  /** The lowest national number among its members: the family sort's order. */
  first: number;
}

/** The families, by their base species (the species data's baby_species), each with its evolution stages. */
export function families(species: Map<string, SpeciesInfo>): Map<string, Family> {
  const stage = new Map<string, number>();
  const evolvesTo = new Map<string, string[]>();
  for (const info of species.values()) evolvesTo.set(info.species, info.evolutions);
  const depth = (id: string, root: string, seen = 0): number => {
    if (id === root || seen > 4) return 0;
    for (const [from, tos] of evolvesTo) if (tos.includes(id)) return depth(from, root, seen + 1) + 1;
    return 1;
  };
  const byRoot = new Map<string, Family>();
  for (const info of species.values()) {
    stage.set(info.species, depth(info.species, info.family));
    const family = byRoot.get(info.family) ?? { root: info.family, members: [], first: Infinity };
    family.members.push(info);
    family.first = Math.min(family.first, info.dex);
    byRoot.set(info.family, family);
  }
  for (const family of byRoot.values()) family.members.sort((a, b) => stage.get(a.species)! - stage.get(b.species)! || a.dex - b.dex);
  return byRoot;
}

export type Obtain = Source | "wild" | "outbreak" | "grotto";

/** Each species' ways to be had: wild when the draft gives it a habitat (or it is the shaking grass's own species),
 * an outbreak, a Hidden Grotto, then the other sources. */
export function obtainability(loaded: Loaded, draft: Draft, settings: EncounterSettings): Map<string, Obtain[]> {
  const result = new Map<string, Obtain[]>();
  const grassSpots = draft.areas.some((a) => a.spots === "grass" && Object.values(a.rates).some((r) => r.rustling));
  const inGrottoes = new Set(draft.grottoes.flatMap((g) => g.slots.flat().map((e) => e.species)));
  for (const id of loaded.species.keys()) {
    const ways: Obtain[] = [];
    const entry = draft.species.get(id);
    if (entry?.habitats.length || (grassSpots && settings.rustling.grass.species === id)) ways.push("wild");
    if (entry?.outbreaks.length) ways.push("outbreak");
    if (inGrottoes.has(id)) ways.push("grotto");
    for (const s of loaded.sources.get(id) ?? []) if (!ways.includes(s.source)) ways.push(s.source);
    result.set(id, ways);
  }
  return result;
}

/** The ways that count as "in the wild" for the list's filters: habitats, outbreaks and Hidden Grottoes. */
export const WILD_WAYS: Obtain[] = ["wild", "outbreak", "grotto"];

/** The legendary and mythical Pokémon of the national dex up to Generation V, which the list hides unless asked. */
export const LEGENDARIES = new Set([
  "ARTICUNO", "ZAPDOS", "MOLTRES", "MEWTWO", "MEW",
  "RAIKOU", "ENTEI", "SUICUNE", "LUGIA", "HO_OH", "CELEBI",
  "REGIROCK", "REGICE", "REGISTEEL", "LATIAS", "LATIOS", "KYOGRE", "GROUDON", "RAYQUAZA", "JIRACHI", "DEOXYS",
  "UXIE", "MESPRIT", "AZELF", "DIALGA", "PALKIA", "HEATRAN", "REGIGIGAS", "GIRATINA", "CRESSELIA", "PHIONE", "MANAPHY",
  "DARKRAI", "SHAYMIN", "ARCEUS",
  "VICTINI", "COBALION", "TERRAKION", "VIRIZION", "TORNADUS", "THUNDURUS", "RESHIRAM", "ZEKROM", "LANDORUS", "KYUREM",
  "KELDEO", "MELOETTA", "GENESECT",
].map((name) => `SPECIES_${name}`));

/** The national dex's generations, by their first number. */
export const GENERATIONS = [
  { name: "Generation I", first: 1 }, { name: "Generation II", first: 152 }, { name: "Generation III", first: 252 },
  { name: "Generation IV", first: 387 }, { name: "Generation V", first: 494 },
];

export function generationOf(dex: number): string {
  return [...GENERATIONS].reverse().find((g) => dex >= g.first)?.name ?? "Other";
}
