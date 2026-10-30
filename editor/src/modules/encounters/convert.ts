// The draft of the new encounter data from the current slot tables (res/field/encounters/<table>.json):
// 1. each slot's fixed odds summed by species and form, so a species' share of a place, season and method is exact,
//    and a rarity tier from that share;
// 2. per species, area and form, the methods whose tiers agree in every season become one habitat, coupled when the
//    tier is the same in all its seasons and decoupled (a slot per season) when it isn't;
// 3. the same habitat in several areas of one group becomes one habitat of those areas, or of the group when it covers
//    all of it;
// 4. a species' levels: the lowest and highest of every slot it appears in, then the maximum capped at the level it
//    evolves at (plus a margin) and the minimum raised to the level it evolved at.
// The rustling spots' species (Audino) comes from the settings' rule, so its slots aren't imported. The game's swarms
// become outbreaks, and the Hidden Grottoes are read as they are. The current tables have no time of day or weather,
// so every habitat starts with all five periods and any weather. Pure functions, which tests/encounters.test.ts runs
// on the real res/.

import { ALL_TIMES, METHODS, SEASONS, emptySeasons, newKey, type Area, type AreaGroup, type EncounterSettings, type Grotto,
  type Habitat, type Method, type Season, type SpeciesEncounters, type SpeciesInfo, type Spots } from "./model.ts";

/** The slots' odds in percent, from the game's slot picker (src/ov036/enc_pokeset.c). */
const SLOT_ODDS: Record<number, number[]> = {
  12: [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1],
  5: [60, 30, 5, 4, 1],
};
const FISHING_ODDS = [40, 40, 15, 4, 1];

export interface OldTable {
  /** The file's name without .json: the ENCOUNTERS_* constant in lower case. */
  id: string;
  data: Record<string, unknown>;
}

export interface OldZone {
  zone: string;
  /** Its ENCOUNTERS_* constant, or null. */
  encounters: string | null;
  /** Its parent zone (itself when it has none). */
  parent: string;
  /** The zone header's map type and battle background, which tell a cave or a bridge (rustling spots' kind). */
  mapType: number;
  battleBg: number;
}

/** One of the game's swarms (SWARM_DATA in src/ov036/enc_pokeset.c, White 2's). */
export interface OldOutbreak {
  zone: string;
  species: string;
  form: number;
  min: number;
  max: number;
}

/** A species' exact share of one place, season and method in the current tables. */
export interface OldShare {
  area: string;
  season: Season;
  method: Method;
  species: string;
  form: number;
  share: number;
  min: number;
  max: number;
}

export interface Draft {
  areas: Area[];
  groups: AreaGroup[];
  grottoes: Grotto[];
  species: Map<string, SpeciesEncounters>;
  /** The current tables' shares, kept so the editor can show how far the tiers move each one. */
  oldShares: OldShare[];
}

/** A value that may be one per version: White 2's. */
function white2<T>(value: unknown): T {
  if (value && typeof value === "object" && !Array.isArray(value) && "white2" in value) return (value as { white2: T }).white2;
  return value as T;
}

function oddsFor(method: Method, count: number): number[] {
  if (method === "fishing" || method === "rippling_fishing") return FISHING_ODDS;
  return SLOT_ODDS[count] ?? new Array(count).fill(100 / count);
}

/** A season's table: its own, or the whole year's. */
function seasonTable(data: Record<string, unknown>, season: Season): Record<string, unknown> | null {
  return (data[season] ?? data.all_year ?? null) as Record<string, unknown> | null;
}

export function readShares(tables: OldTable[]): { shares: OldShare[]; rates: Map<string, Area["rates"]> } {
  const shares: OldShare[] = [];
  const rates = new Map<string, Area["rates"]>();
  for (const { id, data } of tables) {
    const areaRates = {} as Area["rates"];
    for (const season of SEASONS) {
      areaRates[season] = {};
      const table = seasonTable(data, season);
      if (!table) continue;
      const tableRates = white2<Record<string, number>>(table.rates) ?? {};
      for (const method of METHODS) {
        const rate = tableRates[method.old] ?? 0;
        const slots = white2<unknown[][]>(table[method.old]) ?? [];
        if (!rate || !slots.length) continue;
        areaRates[season][method.id] = rate;
        const odds = oddsFor(method.id, slots.length);
        const bySpecies = new Map<string, OldShare>();
        slots.forEach((slot, i) => {
          const [species, min, max, form = 0] = slot as [string, number, number, number?];
          if (!species || species === "SPECIES_NONE") return;
          const key = `${species}:${form}`;
          const entry = bySpecies.get(key) ?? { area: id, season, method: method.id, species, form, share: 0, min, max };
          entry.share += odds[i] ?? 0;
          entry.min = Math.min(entry.min, min, max);
          entry.max = Math.max(entry.max, min, max);
          bySpecies.set(key, entry);
        });
        shares.push(...bySpecies.values());
      }
    }
    rates.set(id, areaRates);
  }
  return { shares, rates };
}

export function tierFor(share: number, settings: EncounterSettings): string {
  for (const tier of settings.tiers) {
    const threshold = settings.importThresholds[tier.id];
    if (threshold !== undefined && share >= threshold) return tier.id;
  }
  return settings.tiers[settings.tiers.length - 1]?.id ?? "common";
}

export function areaName(id: string): string {
  return id.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const areaOf = (encounters: string) => encounters.replace(/^ENCOUNTERS_/, "").toLowerCase();

// The zone header values that mark a cave (its battle background) and a bridge (its map type)
const CAVE_BATTLE_BGS = new Set([4, 5]);
const BRIDGE_MAP_TYPES = new Set([11, 18]);

function spotsOf(zones: OldZone[]): Spots {
  if (zones.some((z) => BRIDGE_MAP_TYPES.has(z.mapType))) return "shadow";
  if (zones.some((z) => CAVE_BATTLE_BGS.has(z.battleBg))) return "dust";
  return "grass";
}

/** The areas, and a group for each parent zone with several areas. */
export function areasAndGroups(tables: OldTable[], zones: OldZone[], rates: Map<string, Area["rates"]>): { areas: Area[]; groups: AreaGroup[] } {
  const zonesOf = new Map<string, OldZone[]>();
  const byParent = new Map<string, Set<string>>();
  for (const zone of zones) {
    if (!zone.encounters) continue;
    const id = areaOf(zone.encounters);
    zonesOf.set(id, [...(zonesOf.get(id) ?? []), zone]);
    byParent.set(zone.parent, (byParent.get(zone.parent) ?? new Set()).add(id));
  }
  const groups: AreaGroup[] = [...byParent].filter(([, areas]) => areas.size > 1).map(([zone, areas]) => {
    const id = zone.replace(/^ZONE_/, "").toLowerCase();
    return { id: `group:${id}`, name: areaName(id), areas: [...areas].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), custom: false };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const areas = tables.map(({ id }) => {
    const own = zonesOf.get(id) ?? [];
    return { id, name: areaName(id), zones: own.map((z) => z.zone).sort(), parent: own[0]?.parent ?? `ZONE_${id.toUpperCase()}`,
      spots: spotsOf(own), rates: rates.get(id)! };
  });
  return { areas, groups };
}

/** The Hidden Grottoes' Pokémon from their files: White 2's three slots of four entries. */
export function readGrottoes(files: { id: string; data: Record<string, unknown> }[]): Grotto[] {
  return files.map(({ id, data }) => ({
    id, name: areaName(id),
    slots: ((data.white2 as { groups: Record<string, unknown>[] }[] | undefined) ?? []).map((slot) => slot.groups.map((g) => ({
      species: String(g.species), form: Number(g.form ?? 0), min: Number(g.min_level), max: Number(g.max_level), femaleBelow: Number(g.female_below ?? 0),
    }))),
  }));
}

/** A species' level range from the slots, then refined by its evolutions (see the file's comment). */
export function importLevels(species: string, slots: { min: number; max: number }, info: Map<string, SpeciesInfo>,
                             settings: EncounterSettings): { min: number; max: number } {
  let { min, max } = slots;
  const own = info.get(species);
  for (const evolution of own?.levelEvolutions ?? []) max = Math.min(max, evolution.level + settings.importEvolutionMargin);
  for (const other of info.values()) {
    for (const evolution of other.levelEvolutions) if (evolution.species === species) min = Math.max(min, evolution.level);
  }
  return { min, max: Math.max(min, max) };
}

export function convert(tables: OldTable[], zones: OldZone[], info: Map<string, SpeciesInfo>, settings: EncounterSettings,
                        outbreaks: OldOutbreak[] = [], grottoes: Grotto[] = []): Draft {
  const { shares, rates } = readShares(tables);
  const { areas, groups } = areasAndGroups(tables, zones, rates);
  const special = settings.rustling.grass.species;
  const imported = shares.filter((s) => !(s.method === "rustling" && s.species === special));

  // 1. Each species, area and form: per method, the tier in each season
  const tiers = new Map<string, Map<Method, Partial<Record<Season, string>>>>();
  const slotLevels = new Map<string, { min: number; max: number }>();
  for (const s of imported) {
    const key = `${s.species}|${s.area}|${s.form}`;
    const byMethod = tiers.get(key) ?? new Map();
    const bySeason = byMethod.get(s.method) ?? {};
    bySeason[s.season] = tierFor(s.share, settings);
    byMethod.set(s.method, bySeason);
    tiers.set(key, byMethod);
    const levels = slotLevels.get(s.species);
    slotLevels.set(s.species, levels ? { min: Math.min(levels.min, s.min), max: Math.max(levels.max, s.max) } : { min: s.min, max: s.max });
  }

  // 2. Methods that agree in every season are one habitat; 3. the same habitat in several areas of a group is one
  interface Candidate { species: string; form: number; methods: Method[]; bySeason: Partial<Record<Season, string>>; areas: string[] }
  const candidates = new Map<string, Candidate>();
  const groupOf = new Map(groups.flatMap((g) => g.areas.map((a) => [a, g.id] as const)));
  for (const [key, byMethod] of tiers) {
    const [species, area, form] = key.split("|");
    const bySignature = new Map<string, Method[]>();
    for (const [method, bySeason] of byMethod) {
      const signature = JSON.stringify(SEASONS.map((s) => bySeason[s] ?? null));
      bySignature.set(signature, [...(bySignature.get(signature) ?? []), method]);
    }
    for (const [signature, methods] of bySignature) {
      const bySeason = byMethod.get(methods[0])!;
      const merge = `${species}|${form}|${methods.sort().join(",")}|${signature}|${groupOf.get(area) ?? area}`;
      const candidate = candidates.get(merge) ?? { species, form: Number(form), methods, bySeason, areas: [] };
      candidate.areas.push(area);
      candidates.set(merge, candidate);
    }
  }

  const species = new Map<string, SpeciesEncounters>();
  const methodOrder = (m: Method) => METHODS.findIndex((x) => x.id === m);
  for (const c of candidates.values()) {
    const entry = species.get(c.species) ?? { species: c.species, levels: importLevels(c.species, slotLevels.get(c.species)!, info, settings),
      battles: null, hiddenAbility: null, habitats: [], outbreaks: [] };
    species.set(c.species, entry);
    const group = groups.find((g) => g.id === groupOf.get(c.areas[0]));
    const places = group && group.areas.every((a) => c.areas.includes(a)) ? [group.id] :
      [...c.areas].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const present = SEASONS.filter((s) => c.bySeason[s]);
    const coupled = present.every((s) => c.bySeason[s] === c.bySeason[present[0]]);
    const seasons = emptySeasons();
    for (const s of present) {
      seasons[s] = { methods: [...c.methods].sort((a, b) => methodOrder(a) - methodOrder(b)), tier: c.bySeason[s]!, times: [...ALL_TIMES], weather: [] };
    }
    entry.habitats.push({ key: newKey(), places, form: c.form, when: "", coupled, seasons } satisfies Habitat);
  }
  const firstMethod = (h: Habitat) => Math.min(...SEASONS.flatMap((s) => h.seasons[s]?.methods.map(methodOrder) ?? []));
  for (const entry of species.values()) {
    entry.habitats.sort((a, b) => a.places[0].replace(/^group:/, "").localeCompare(b.places[0].replace(/^group:/, ""), undefined, { numeric: true }) ||
      firstMethod(a) - firstMethod(b));
  }

  // The swarms, each an outbreak in its zone's area: grass only, all year, as the game's are
  const areaOfZone = new Map(zones.filter((z) => z.encounters).map((z) => [z.zone, areaOf(z.encounters!)]));
  for (const o of outbreaks) {
    const area = areaOfZone.get(o.zone);
    if (!area) continue;
    const entry = species.get(o.species) ?? { species: o.species, levels: importLevels(o.species, { min: o.min, max: o.max }, info, settings),
      battles: null, hiddenAbility: null, habitats: [], outbreaks: [] };
    entry.outbreaks.push({ key: newKey(), places: [area], form: o.form, methods: ["grass"], seasons: [...SEASONS], times: [...ALL_TIMES] });
    species.set(o.species, entry);
  }
  return { areas, groups, grottoes, species, oldShares: shares };
}
