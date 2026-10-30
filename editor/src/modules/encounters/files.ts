// The encounter data's files (res/paperwhite2/encounters/, with the conditions engine's level_scaling.json) to and from
// the editor's draft. The packer (tools/paperwhite2/encounters.py) reads the same files; their schemas are beside them.

import { fileText, parseJson } from "../../../shared/json.ts";
import { readShares, type Draft, type OldTable, type OldZone } from "./convert.ts";
import { areasAndGroups } from "./convert.ts";
import { ALL_TIMES, DEFAULT_SETTINGS, SEASONS, emptySeasons, newKey, presentSeasons, type Area, type AreaGroup, type EncounterSettings,
  type Grotto, type Habitat, type Method, type Season, type Slot, type SpeciesEncounters, type SpeciesInfo, type Spots,
  type Time } from "./model.ts";

export const ROOT = "res/paperwhite2/encounters";
export const LEVEL_SCALING = "res/paperwhite2/level_scaling.json";
export const settingsPath = `${ROOT}/settings.json`;
export const groupsPath = `${ROOT}/groups.json`;
export const areaPath = (id: string) => `${ROOT}/areas/${id}.json`;
export const speciesPath = (folder: string) => `${ROOT}/species/${folder}.json`;
export const grottoPath = (id: string) => `res/field/grottoes/${id}.json`;

// The files as JSON.parse reads them
export type Json = Record<string, any>;

// ------------------------------------------------------------------------------------------------ Writing

export function settingsFile(s: EncounterSettings): Json {
  return {
    $schema: "settings.schema.json",
    tiers: s.tiers.map((t) => ({ id: t.id, name: t.name, share: t.share })),
    level_gate: s.levels.gate,
    hidden_ability: s.hiddenAbility,
    battles: { ...s.battles },
    rustling: {
      grass: { ...s.rustling.grass }, dust: { ...s.rustling.dust }, shadow: { ...s.rustling.shadow },
      tiers: [...s.rustling.tiers], from: [...s.rustling.from],
    },
    outbreak_share: s.outbreakShare,
    import: { thresholds: { ...s.importThresholds }, evolution_margin: s.importEvolutionMargin },
  };
}

/** The conditions engine's level scaling with the editor's percent and spread, its other fields kept. */
export function levelScalingFile(current: Json, s: EncounterSettings): Json {
  return { ...current, percent: s.levels.percent, spread: s.levels.spread };
}

export function groupsFile(groups: AreaGroup[]): Json {
  return {
    $schema: "groups.schema.json",
    groups: groups.map((g) => ({ id: g.id.replace(/^group:/, ""), name: g.name, areas: [...g.areas], ...(g.custom ? { custom: true } : {}) })),
  };
}

export function areaFile(a: Area): Json {
  const same = SEASONS.every((s) => JSON.stringify(a.rates[s]) === JSON.stringify(a.rates.spring));
  const rates = (r: Partial<Record<Method, number>>) => Object.fromEntries(Object.entries(r).filter(([, v]) => v));
  return {
    $schema: "../area.schema.json",
    rates: same ? { all_year: rates(a.rates.spring) } : Object.fromEntries(SEASONS.map((s) => [s, rates(a.rates[s])])),
    spots: a.spots,
  };
}

function slotFile(slot: Slot): Json {
  return { methods: [...slot.methods], rarity: slot.tier, times: [...slot.times], ...(slot.weather.length ? { weather: [...slot.weather] } : {}) };
}

function validWhen(text: string): Json | null {
  if (!text.trim()) return null;
  try {
    const v = JSON.parse(text);
    return typeof v === "object" && v !== null && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export function speciesFile(entry: SpeciesEncounters): Json {
  return {
    $schema: "../species.schema.json",
    levels: { min: entry.levels.min, max: entry.levels.max },
    ...(entry.battles ? { battles: { ...entry.battles } } : {}),
    ...(entry.hiddenAbility !== null ? { hidden_ability: entry.hiddenAbility } : {}),
    habitats: entry.habitats.map((h) => {
      const present = presentSeasons(h);
      const when = validWhen(h.when);
      return {
        places: [...h.places],
        ...(h.form ? { form: h.form } : {}),
        ...(h.coupled ? { seasons: present, ...(present.length ? slotFile(h.seasons[present[0]]!) : {}) } :
          { by_season: Object.fromEntries(present.map((s) => [s, slotFile(h.seasons[s]!)])) }),
        ...(when ? { when } : {}),
      };
    }),
    ...(entry.outbreaks.length ? {
      outbreaks: entry.outbreaks.map((o) => ({ places: [...o.places], ...(o.form ? { form: o.form } : {}), methods: [...o.methods],
        seasons: [...o.seasons], times: [...o.times] })),
    } : {}),
  };
}

/** A grotto's file with the draft's Pokémon in White 2's slots, the rest of the file as it was. */
export function grottoFile(current: Json, g: Grotto): Json {
  const white2 = (current.white2 as Json[]).map((slot, s) => ({
    ...slot,
    groups: g.slots[s].map((e) => ({ species: e.species, min_level: e.min, max_level: e.max, female_below: e.femaleBelow, form: e.form })),
  }));
  return { ...current, white2 };
}

/** Every file of the draft, by path. Species without habitats or outbreaks have none. */
export function draftFiles(draft: Draft, settings: EncounterSettings, info: Map<string, SpeciesInfo>): Map<string, Json> {
  const files = new Map<string, Json>();
  files.set(settingsPath, settingsFile(settings));
  files.set(groupsPath, groupsFile(draft.groups));
  for (const a of draft.areas) files.set(areaPath(a.id), areaFile(a));
  for (const entry of draft.species.values()) {
    if (!entry.habitats.length && !entry.outbreaks.length) continue;
    files.set(speciesPath(info.get(entry.species)?.folder ?? entry.species.replace(/^SPECIES_/, "").toLowerCase()), speciesFile(entry));
  }
  return files;
}

/** A file's text as the data tools write it (datajson.dumps, 120 columns). */
export function toText(data: unknown): string {
  return fileText(parseJson(JSON.stringify(data)), 120);
}

/** Every file the editor writes, as text by path: the encounter data, the level scaling, and the Hidden Grottoes'
 * files whose Pokémon the draft holds. */
export function allTexts(draft: Draft, settings: EncounterSettings, info: Map<string, SpeciesInfo>, levelScaling: Json,
                         grottoFiles: { id: string; data: Json }[]): Map<string, string> {
  const texts = new Map<string, string>();
  for (const [path, data] of draftFiles(draft, settings, info)) texts.set(path, toText(data));
  texts.set(LEVEL_SCALING, toText(levelScalingFile(levelScaling, settings)));
  for (const g of draft.grottoes) {
    const file = grottoFiles.find((f) => f.id === g.id);
    if (file) texts.set(grottoPath(g.id), toText(grottoFile(file.data, g)));
  }
  return texts;
}

// ------------------------------------------------------------------------------------------------ Reading

export interface EncounterFiles {
  settings: Json;
  levelScaling: Json;
  groups: Json;
  areas: { id: string; data: Json }[];
  species: { folder: string; data: Json }[];
}

export function readSettings(f: EncounterFiles): EncounterSettings {
  const s = f.settings as Record<string, any>;
  const imp = (s.import ?? {}) as Record<string, any>;
  return {
    tiers: (s.tiers as { id: string; name: string; share: number }[]).map((t) => ({ ...t })),
    levels: { percent: Number(f.levelScaling.percent ?? 80), spread: Number(f.levelScaling.spread ?? 3), gate: s.level_gate },
    hiddenAbility: s.hidden_ability,
    battles: { ...s.battles },
    rustling: { grass: { ...s.rustling.grass }, dust: { ...s.rustling.dust }, shadow: { ...s.rustling.shadow },
      tiers: [...s.rustling.tiers], from: [...s.rustling.from] },
    outbreakShare: s.outbreak_share,
    importThresholds: { ...(imp.thresholds ?? DEFAULT_SETTINGS.importThresholds) },
    importEvolutionMargin: imp.evolution_margin ?? DEFAULT_SETTINGS.importEvolutionMargin,
  };
}

function readSlot(data: Record<string, any>): Slot {
  return { methods: [...data.methods], tier: data.rarity, times: [...data.times] as Time[], weather: [...(data.weather ?? [])] };
}

export function readSpecies(id: string, data: Record<string, any>): SpeciesEncounters {
  const habitats: Habitat[] = (data.habitats ?? []).map((h: Record<string, any>) => {
    const seasons = emptySeasons();
    let coupled = true;
    if (h.by_season) {
      coupled = false;
      for (const s of SEASONS) if (h.by_season[s]) seasons[s] = readSlot(h.by_season[s]);
    } else {
      const slot = readSlot(h);
      for (const s of (h.seasons ?? []) as Season[]) seasons[s] = slot;
    }
    return { key: newKey(), places: [...h.places], form: h.form ?? 0, when: h.when ? JSON.stringify(h.when) : "", coupled, seasons };
  });
  return {
    species: id,
    levels: { ...data.levels },
    battles: data.battles ? { ...data.battles } : null,
    hiddenAbility: data.hidden_ability ?? null,
    habitats,
    outbreaks: (data.outbreaks ?? []).map((o: Record<string, any>) => ({ key: newKey(), places: [...o.places], form: o.form ?? 0,
      methods: [...o.methods], seasons: [...o.seasons], times: [...(o.times ?? ALL_TIMES)] })),
  };
}

/** The draft from the files: the areas get their zones and parents from the zone headers, and the current tables'
 * shares stay for the editor's comparison. */
export function readDraft(f: EncounterFiles, tables: OldTable[], zones: OldZone[], grottoes: Grotto[]): Draft {
  const { shares, rates } = readShares(tables);
  const { areas: imported } = areasAndGroups(tables, zones, rates);
  const byId = new Map(f.areas.map((a) => [a.id, a.data as Record<string, any>]));
  const areas: Area[] = imported.filter((a) => byId.has(a.id)).map((a) => {
    const data = byId.get(a.id)!;
    const r = data.rates as Record<string, Partial<Record<Method, number>>>;
    const seasonRates = Object.fromEntries(SEASONS.map((s) => [s, { ...(r.all_year ?? r[s] ?? {}) }])) as Area["rates"];
    return { ...a, rates: seasonRates, spots: data.spots as Spots };
  });
  const groups: AreaGroup[] = ((f.groups.groups ?? []) as Record<string, any>[]).map((g) => ({
    id: `group:${g.id}`, name: g.name, areas: [...g.areas], custom: !!g.custom,
  }));
  const species = new Map(f.species.map(({ folder, data }) => {
    const id = `SPECIES_${folder.toUpperCase()}`;
    return [id, readSpecies(id, data as Record<string, any>)];
  }));
  return { areas, groups, grottoes, species, oldShares: shares };
}
