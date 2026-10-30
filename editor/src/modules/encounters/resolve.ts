// What the new encounter data gives in a context: the Pokémon of a place and method with their shares and levels, and
// the measures the map shows. This is the rule the game's code and the build's tools will follow, so it stays small:
// - a habitat matches when it names the area (or the area's group), has a slot in the season whose methods, periods
//   and weather match (no weather listed: any), and the species' minimum level is met (by the party's level or the
//   scaled level, as the settings say);
// - each tier present takes its share, rescaled so the present tiers make 100%, split evenly among its Pokémon;
// - rustling spots give their fixed thing first (shaking grass Audino, dust clouds and bridge shadows the game's items),
//   and the rest to their own habitats and the area's habitats of the settings' tiers and methods (the rare ones of
//   the grass), split by tier the same way; with no Pokémon there, the fixed thing is all they give;
// - on a day with an outbreak, its species take the outbreak's share of its methods and the rest is scaled down;
// - the level is the scaled level plus or minus the spread, kept within the species' range.
// The habitats' extra conditions (`when`) need the game's state, so the preview doesn't evaluate them.

import { SEASONS, type Area, type AreaGroup, type Battles, type Context, type EncounterSettings, type Habitat, type Method,
  type Season, type Slot, type SpeciesEncounters } from "./model.ts";

/** What the evaluation reads: the draft's species, groups and areas. */
export interface EncounterData {
  species: Map<string, SpeciesEncounters>;
  groups: AreaGroup[];
  areas: Area[];
}

export interface Odds {
  species: string;
  form: number;
  tier: string;
  /** In percent of the place's encounters by this method. */
  share: number;
  levels: [number, number];
  /** Whether the habitat has extra conditions the preview didn't check. */
  conditional: boolean;
  /** A rustling spot's fixed species, at its fixed share. */
  special?: boolean;
  /** A rustling spot's items (dust clouds, bridge shadows), not a Pokémon: species is "". */
  item?: boolean;
  /** An outbreak's species, on its day. */
  outbreak?: boolean;
}

export function scaledLevel(partyLevel: number, settings: EncounterSettings): number {
  return Math.max(1, Math.floor((partyLevel * settings.levels.percent) / 100));
}

export function levelRange(levels: { min: number; max: number }, partyLevel: number, settings: EncounterSettings): [number, number] {
  const scaled = scaledLevel(partyLevel, settings);
  const clamp = (n: number) => Math.min(levels.max, Math.max(levels.min, n));
  return [clamp(scaled - settings.levels.spread), clamp(scaled + settings.levels.spread)];
}

export function isLevelMet(levels: { min: number }, partyLevel: number, settings: EncounterSettings): boolean {
  const level = settings.levels.gate === "party" ? partyLevel : scaledLevel(partyLevel, settings);
  return level >= levels.min;
}

export function battlesOf(entry: SpeciesEncounters, settings: EncounterSettings): Battles {
  return entry.battles ?? settings.battles;
}

/** The areas a habitat's places stand for, its groups expanded. */
export function placeAreas(places: string[], groups: AreaGroup[]): string[] {
  return places.flatMap((p) => groups.find((g) => g.id === p)?.areas ?? [p]);
}

export function namesArea(h: Habitat, area: string, groups: AreaGroup[]): boolean {
  return h.places.includes(area) || h.places.some((p) => groups.find((g) => g.id === p)?.areas.includes(area));
}

export function slotMatches(slot: Slot | null, method: Method, ctx: Context): slot is Slot {
  return !!slot && slot.methods.includes(method) && slot.times.includes(ctx.time) && (!slot.weather.length || slot.weather.includes(ctx.weather));
}

type Match = Omit<Odds, "share">;

function matches(species: Iterable<SpeciesEncounters>, settings: EncounterSettings, groups: AreaGroup[], ctx: Context, area: string,
                 methods: Method[], tiers: string[] | null): Match[] {
  const found: Match[] = [];
  for (const entry of species) {
    if (!isLevelMet(entry.levels, ctx.partyLevel, settings)) continue;
    for (const h of entry.habitats) {
      const slot = h.seasons[ctx.season];
      if (!namesArea(h, area, groups) || !methods.some((m) => slotMatches(slot, m, ctx))) continue;
      if (tiers && !tiers.includes(slot!.tier)) continue;
      found.push({ species: entry.species, form: h.form, tier: slot!.tier, levels: levelRange(entry.levels, ctx.partyLevel, settings),
        conditional: h.when.trim() !== "" });
    }
  }
  return found;
}

/** Splits total percent among the matches by tier (see the file's comment). */
function byTier(found: Match[], settings: EncounterSettings, total: number): Odds[] {
  const counts = new Map<string, number>();
  for (const m of found) counts.set(m.tier, (counts.get(m.tier) ?? 0) + 1);
  const shareOf = new Map(settings.tiers.map((t) => [t.id, t.share]));
  const sum = [...counts.keys()].reduce((n, tier) => n + (shareOf.get(tier) ?? 0), 0);
  return found.map((m) => ({ ...m, share: sum > 0 ? ((shareOf.get(m.tier) ?? 0) / sum) * total / counts.get(m.tier)! : 0 }));
}

export function placeOdds(data: EncounterData, settings: EncounterSettings, ctx: Context, area: string, method: Method): Odds[] {
  const all = [...data.species.values()];
  const { groups } = data;
  let odds: Odds[];
  if (method === "rustling") {
    // Only an area with rustling spots this season has them
    const place = data.areas.find((a) => a.id === area);
    if (!place?.rates[ctx.season].rustling) return [];
    const spots = place.spots;
    const rule = settings.rustling;
    const fixedSpecies = spots === "grass" ? rule.grass.species : null;
    const own = matches(all, settings, groups, ctx, area, ["rustling"], null).filter((m) => m.species !== fixedSpecies);
    const pool = matches(all, settings, groups, ctx, area, rule.from, rule.tiers);
    const seen = new Set(own.map((m) => `${m.species}:${m.form}`));
    const rest = [...own, ...pool.filter((m) => !seen.has(`${m.species}:${m.form}`))];
    const share = rest.length ? (spots === "grass" ? rule.grass.share : rule[spots].share) : 100;
    let fixed: Odds;
    if (fixedSpecies) {
      const entry = data.species.get(fixedSpecies);
      const scaled = scaledLevel(ctx.partyLevel, settings);
      fixed = { species: fixedSpecies, form: 0, tier: "", share, levels: entry ? levelRange(entry.levels, ctx.partyLevel, settings) : [scaled, scaled],
        conditional: false, special: true };
    } else {
      fixed = { species: "", form: 0, tier: "", share, levels: [0, 0], conditional: false, special: true, item: true };
    }
    odds = [fixed, ...byTier(rest, settings, 100 - share)];
  } else {
    odds = byTier(matches(all, settings, groups, ctx, area, [method], null), settings, 100);
  }
  if (ctx.outbreak) odds = withOutbreaks(all, settings, groups, ctx, area, method, odds);
  return odds.sort((a, b) => b.share - a.share || a.species.localeCompare(b.species));
}

/** The place's outbreaks on their day: they take the outbreak share, split evenly, and the rest is scaled down. */
function withOutbreaks(all: SpeciesEncounters[], settings: EncounterSettings, groups: AreaGroup[], ctx: Context, area: string, method: Method,
                       odds: Odds[]): Odds[] {
  const found: Odds[] = [];
  for (const entry of all) {
    if (!isLevelMet(entry.levels, ctx.partyLevel, settings)) continue;
    for (const o of entry.outbreaks) {
      const named = o.places.includes(area) || o.places.some((p) => groups.find((g) => g.id === p)?.areas.includes(area));
      if (!named || !o.methods.includes(method) || !o.seasons.includes(ctx.season) || !o.times.includes(ctx.time)) continue;
      found.push({ species: entry.species, form: o.form, tier: "", share: 0, levels: levelRange(entry.levels, ctx.partyLevel, settings),
        conditional: false, outbreak: true });
    }
  }
  if (!found.length) return odds;
  const share = odds.length ? settings.outbreakShare : 100;
  return [...found.map((o) => ({ ...o, share: share / found.length })), ...odds.map((o) => ({ ...o, share: (o.share * (100 - share)) / 100 }))];
}

export interface PlaceMeasures {
  /** Distinct species. */
  species: number;
  /** The effective number of species: e to the Shannon entropy of the shares, so 4 equal Pokémon read 4 and one
   * Pokémon at 97% reads close to 1. */
  diversity: number;
  levels: [number, number] | null;
}

export function measure(odds: Odds[]): PlaceMeasures {
  const bySpecies = new Map<string, number>();
  odds = odds.filter((o) => !o.item);
  for (const o of odds) bySpecies.set(o.species, (bySpecies.get(o.species) ?? 0) + o.share);
  let entropy = 0;
  const total = [...bySpecies.values()].reduce((a, b) => a + b, 0) || 1;
  for (const share of bySpecies.values()) {
    const p = share / total;
    if (p > 0) entropy -= p * Math.log(p);
  }
  const levels = odds.length ? [Math.min(...odds.map((o) => o.levels[0])), Math.max(...odds.map((o) => o.levels[1]))] as [number, number] : null;
  return { species: bySpecies.size, diversity: bySpecies.size ? Math.exp(entropy) : 0, levels };
}

/** The seasons a species is somewhere in an area: for the habitat map's colours. */
export function seasonsIn(entry: SpeciesEncounters, area: string, groups: AreaGroup[]): Season[] {
  return SEASONS.filter((s) => entry.habitats.some((h) => h.seasons[s] && namesArea(h, area, groups)));
}
