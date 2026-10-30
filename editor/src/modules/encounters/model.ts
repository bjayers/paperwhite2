// The new wild encounter system's data, as the Encounter Editor holds it. This is the planned format: nothing in res/
// has it yet, so the editor builds a draft from the current slot tables (convert.ts) and keeps edits in memory.
//
// Planned files (one kind of data each, with a schema, like the follower's dialogue):
//   res/paperwhite2/encounters/settings.json         the rarity tiers, level scaling and defaults (EncounterSettings)
//   res/paperwhite2/encounters/areas/<area>.json     an area's zones, encounter rates per method and spots (Area)
//   res/paperwhite2/encounters/groups.json           the groups of areas, automatic and the user's own (AreaGroup)
//   res/paperwhite2/encounters/species/<name>.json   a species' levels, battles, hidden ability, habitats and
//                                                    outbreaks (SpeciesEncounters), only for species found in the wild
// The Hidden Grottoes keep their own files (res/field/grottoes/), which the editor will write in their format.

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

/** The game's five periods. The editor groups them as day and night; the files always list all five. */
export const TIMES = ["morning", "day", "evening", "night", "late_night"] as const;
export type Time = (typeof TIMES)[number];
export const TIME_GROUPS: { name: string; times: Time[] }[] = [
  { name: "Day", times: ["morning", "day", "evening"] },
  { name: "Night", times: ["night", "late_night"] },
];

/** The ways to meet a wild Pokémon: the game's own seven, which the terrain and conditions refine. */
export const METHODS = [
  { id: "grass", label: "Grass", short: "Grass", detail: "walking in grass, or on a cave's floor", old: "grass" },
  { id: "dark_grass", label: "Dark grass", short: "Dark", detail: "the dark grass, where double battles happen", old: "dark_grass" },
  { id: "rustling", label: "Rustling spots", short: "Rustle", detail: "shaking grass, dust clouds and bridge shadows", old: "shaking_grass" },
  { id: "surf", label: "Surfing", short: "Surf", detail: "", old: "surf" },
  { id: "rippling_surf", label: "Rippling water", short: "Ripple", detail: "surfing onto a rippling spot", old: "rippling_surf" },
  { id: "fishing", label: "Fishing", short: "Fish", detail: "", old: "fishing" },
  { id: "rippling_fishing", label: "Fishing in ripples", short: "Fish ripple", detail: "fishing in a rippling spot", old: "rippling_fishing" },
] as const;
export type Method = (typeof METHODS)[number]["id"];

/** The field's weathers that a habitat can ask for: include/system/zone_weather.h's, without the tints, which the
 * conditions engine names the same way (GetNowWeather). WEATHER_SUNNY is the plain weather of a clear day. */
export const WEATHERS: { id: string; label: string }[] = [
  { id: "WEATHER_SUNNY", label: "Clear" },
  { id: "WEATHER_RAIN", label: "Rain" },
  { id: "WEATHER_THUNDERSTORM", label: "Thunderstorm" },
  { id: "WEATHER_GUSTY_RAIN", label: "Gusty rain" },
  { id: "WEATHER_FLAKE", label: "Snow" },
  { id: "WEATHER_BLIZZARD", label: "Blizzard" },
  { id: "WEATHER_DIAMOND_DUST", label: "Diamond dust" },
  { id: "WEATHER_SANDSTORM", label: "Sandstorm" },
  { id: "WEATHER_FLUTTER", label: "Flutter" },
];

export interface RarityTier {
  id: string;
  name: string;
  /** The tier's share of a place's encounters, in percent, split evenly among its Pokémon there. */
  share: number;
}

export interface EncounterSettings {
  tiers: RarityTier[];
  levels: {
    /** The scaled level: this percent of the party's level (the median, lower middle). */
    percent: number;
    /** A wild Pokémon's level is the scaled level plus or minus this, kept within its species' range. */
    spread: number;
    /** What a species' minimum level is compared with to decide whether it appears at all. */
    gate: "party" | "scaled";
  };
  /** The chance, in percent, that a wild Pokémon has its hidden ability, unless its species sets its own. */
  hiddenAbility: number;
  /** The battle styles of a species that sets none. */
  battles: Battles;
  /** Rustling spots: each kind gives something at a fixed share (shaking grass a species, Audino; dust clouds and
   * bridge shadows the game's own items), and the rest is the spots' own habitats and the area's Pokémon of some
   * tiers found by some methods. With no Pokémon there, the fixed thing is all the spots give. */
  rustling: {
    grass: { species: string; share: number };
    dust: { share: number };
    shadow: { share: number };
    tiers: string[];
    from: Method[];
  };
  /** An outbreak's share of its place's encounters by its methods, on the day it is there. */
  outbreakShare: number;
  /** How the import from the slot tables turns a Pokémon's share of a place into a tier: the first tier whose
   * threshold the share reaches, in tier order; below them all, the last tier. */
  importThresholds: Record<string, number>;
  /** The import caps a species' maximum level at the level it evolves at plus this, and raises an evolved species'
   * minimum to the level it evolves at. */
  importEvolutionMargin: number;
}

export interface Battles {
  single: number;
  double: number;
  triple: number;
  /** Who joins a double or triple battle: the same evolutionary family, or anything that can appear there. Either way
   * a partner must meet its own level range and conditions. */
  partners: "family" | "area";
}

/** What a habitat is in one season: how it is met, how rare it is, and when and in what weather. */
export interface Slot {
  methods: Method[];
  tier: string;
  times: Time[];
  /** WEATHER_* names of WEATHERS; empty means any weather. */
  weather: string[];
}

export interface Habitat {
  /** Kept for React and for edits; not written. */
  key: string;
  /** Area ids, or "group:<id>" for every area of a group (AreaGroup). */
  places: string[];
  form: number;
  /** More conditions-engine clauses (flags, variables, zone groups, party), as JSON text; empty for none. */
  when: string;
  /** Coupled: every season it appears in shares one slot. Decoupled: each season has its own. */
  coupled: boolean;
  /** The editor's link between the copies of one habitat that a family shares (each member keeps its own tiers);
   * not written, since each member's file has its own copy. */
  link?: string;
  /** Each season's slot, or null where it doesn't appear. A coupled habitat's present seasons hold equal slots. */
  seasons: Record<Season, Slot | null>;
}

/** Areas a habitat can name together. The import makes one for each parent zone with several areas, such as the five
 * floors of the Castelia Sewers, as the conditions engine's zone groups are; the user adds, changes and removes them. */
export interface AreaGroup {
  id: string;
  name: string;
  areas: string[];
  /** The user's own, rather than one the import made from a parent zone. */
  custom: boolean;
}

/** What an area's rustling spots are, which decides what they give besides Pokémon (Settings' rustling). */
export const SPOTS = [
  { id: "grass", label: "Shaking grass" },
  { id: "dust", label: "Dust clouds" },
  { id: "shadow", label: "Bridge shadows" },
] as const;
export type Spots = (typeof SPOTS)[number]["id"];

/** An outbreak: the species appears in large numbers in a place, on the days the outbreak is there (one place a day,
 * as the game's swarms are). Its levels are the species'. */
export interface Outbreak {
  key: string;
  places: string[];
  form: number;
  methods: Method[];
  seasons: Season[];
  times: Time[];
}

/** A Hidden Grotto's Pokémon (res/field/grottoes/<grotto>.json, White 2's): three slots of four entries; each day the
 * grotto rolls a slot and an entry. */
export interface GrottoEntry {
  species: string;
  form: number;
  min: number;
  max: number;
  /** The chance it is female, as the file gives it. */
  femaleBelow: number;
}

export interface Grotto {
  id: string;
  name: string;
  slots: GrottoEntry[][];
}

export interface SpeciesEncounters {
  species: string;
  levels: { min: number; max: number };
  /** null: the settings' default. */
  battles: Battles | null;
  /** null: the settings' default chance. */
  hiddenAbility: number | null;
  habitats: Habitat[];
  outbreaks: Outbreak[];
}

export interface Area {
  id: string;
  name: string;
  /** The ZONE_* names that use it. */
  zones: string[];
  /** Its zones' parent zone, by which the Areas page lists it. */
  parent: string;
  spots: Spots;
  /** The step encounter rate per method, from the current tables (0: none there). Per season when they differ. */
  rates: Record<Season, Partial<Record<Method, number>>>;
}

/** The species facts the editor shows and the evaluation needs, from res/pokemon/<species>/data.json. */
export interface SpeciesInfo {
  species: string;
  /** The folder under res/pokemon. */
  folder: string;
  name: string;
  types: string[];
  /** The family's base species, for "same family" partners and the family sort. */
  family: string;
  /** The species it evolves into, by any method. */
  evolutions: string[];
  /** Its evolutions that happen at a level: the species and the level. */
  levelEvolutions: { species: string; level: number }[];
  forms: number;
  hiddenAbility: string;
  dex: number;
}

export const DEFAULT_SETTINGS: EncounterSettings = {
  tiers: [
    { id: "common", name: "Common", share: 55 },
    { id: "uncommon", name: "Uncommon", share: 25 },
    { id: "rare", name: "Rare", share: 12 },
    { id: "very_rare", name: "Very rare", share: 7 },
    { id: "exotic", name: "Exotic", share: 1 },
  ],
  levels: { percent: 80, spread: 3, gate: "scaled" },
  hiddenAbility: 10,
  battles: { single: 100, double: 0, triple: 0, partners: "family" },
  rustling: { grass: { species: "SPECIES_AUDINO", share: 30 }, dust: { share: 30 }, shadow: { share: 30 }, tiers: ["rare", "very_rare", "exotic"],
    from: ["grass", "dark_grass"] },
  outbreakShare: 40,
  importThresholds: { common: 20, uncommon: 10, rare: 5, very_rare: 2 },
  importEvolutionMargin: 2,
};

/** The values a context of the evaluation takes: what the analysis, the area view and the map are computed under. */
export interface Context {
  season: Season;
  time: Time;
  /** A WEATHER_* name of WEATHERS. */
  weather: string;
  partyLevel: number;
  /** Whether a place's outbreaks are on (a day it has one). */
  outbreak: boolean;
}

export const DEFAULT_CONTEXT: Context = { season: "spring", time: "day", weather: "WEATHER_SUNNY", partyLevel: 30, outbreak: false };

export const ALL_TIMES: Time[] = [...TIMES];

export function emptySeasons(): Record<Season, Slot | null> {
  return { spring: null, summer: null, autumn: null, winter: null };
}

/** The seasons a habitat appears in. */
export function presentSeasons(h: Habitat): Season[] {
  return SEASONS.filter((s) => h.seasons[s]);
}

let nextKey = 0;
export function newKey(): string {
  return `h${nextKey++}`;
}
