// Reads what the Encounter Editor needs from res/: the current encounter tables and the zones that name them, every
// species' facts, the town map's places and art, the game's swarms (a table in src/ov036/enc_pokeset.c), and the
// other ways to get a Pokémon (Hidden Grottoes, in-game trades, and the scripts' gifts and static battles), then
// builds the draft.

import type { DataFile, ScanMatch } from "../../../shared/api.ts";
import type { Constants } from "../../../shared/schema.ts";
import { api } from "../../api.ts";
import { convert, readGrottoes, type Draft, type OldOutbreak, type OldTable, type OldZone } from "./convert.ts";
import { LEVEL_SCALING, readDraft, readSettings, type EncounterFiles } from "./files.ts";
import type { EncounterSettings, SpeciesInfo } from "./model.ts";

/** The new encounter data's kinds (res/paperwhite2/encounters/) */
export const DATA_SCHEMAS = {
  settings: "res/paperwhite2/encounters/settings.schema.json",
  groups: "res/paperwhite2/encounters/groups.schema.json",
  areas: "res/paperwhite2/encounters/area.schema.json",
  species: "res/paperwhite2/encounters/species.schema.json",
};

export const SCHEMAS = {
  encounters: "res/field/encounters/encounters.schema.json",
  zones: "res/field/zones/zone.schema.json",
  species: "res/pokemon/species.schema.json",
  places: "res/town_map/place.schema.json",
  trades: "res/field/trades/trade.schema.json",
  grottoes: "res/field/grottoes/grotto.schema.json",
};

/** The town map's art: its characters, the screen of the map and the palette (res/graphics/townmap_gra/). */
export const TOWN_MAP_ART = {
  chars: "res/graphics/townmap_gra/07.png",
  screen: "res/graphics/townmap_gra/16.nscr",
  palette: "res/graphics/townmap_gra/00.pal",
};

/** The scripts' commands that give a Pokémon or start a battle with one, and the species argument they take. */
const SCRIPTS = "res/field/scripts/*.s";
const SCRIPT_SOURCES = [
  { source: "gift", pattern: /^\s+PokePartyAdd(?:Ex|Egg|NPoke)?\s+[^,]+,\s*(\w+)/ },
  { source: "static", pattern: /^\s+CallWildBattle\s+(\w+),/ },
] as const;
const WORK_SET = /^\s+WorkSetConst\s+(0x[0-9a-fA-F]+),\s*(\d+)/;

/** The game's swarms: SWARM_DATA's rows, with the version blocks that pick Black 2's or White 2's. */
const SWARMS = "src/ov036/enc_pokeset.c";
const SWARM_LINES = "SWARM_DATA\\[|^#ifdef BLACK2|^#else|^#endif|^\\s*\\{ ZONE_\\w+, SPECIES_|^};";
const SWARM_ROW = /\{ (ZONE_\w+), (SPECIES_\w+), (\d+), (\d+), (\d+) \}/;

/** Ways to get a Pokémon other than its wild habitats, outbreaks and Hidden Grottoes, which the draft holds. */
export type Source = "trade" | "gift" | "static";
export const SOURCE_LABELS: Record<Source | "wild" | "outbreak" | "grotto", string> = {
  wild: "Wild", outbreak: "Outbreak", grotto: "Hidden Grotto", trade: "In-game trade", gift: "Gift", static: "Static encounter",
};

export interface Place {
  zone: string;
  /** 0 a town or city, 1 a route; others are landmarks. */
  type: number;
  position: { x: number; y: number };
  hit: { start: { x: number; y: number }; end: { x: number; y: number }; radius: number };
}

export interface Loaded {
  tables: OldTable[];
  zones: OldZone[];
  species: Map<string, SpeciesInfo>;
  places: Place[];
  /** Each species' other sources, with where they come from (a file and line). */
  sources: Map<string, { source: Source; where: string }[]>;
  grottoes: { id: string; data: Record<string, unknown> }[];
  outbreaks: OldOutbreak[];
}

const fileName = (path: string) => path.split("/").pop()!.replace(/\.json$/, "");
const zoneName = (path: string) => `ZONE_${fileName(path).toUpperCase()}`;

export async function load(constants: Constants): Promise<Loaded> {
  const [tables, zones, species, places, trades, grottoes, scripts, swarms] = await Promise.all([
    api.data(SCHEMAS.encounters),
    api.data(SCHEMAS.zones, ZONE_KEYS),
    api.data(SCHEMAS.species, SPECIES_KEYS),
    api.data(SCHEMAS.places, ["zone", "type", "position", "hit"]),
    api.data(SCHEMAS.trades, ["species"]),
    api.data(SCHEMAS.grottoes, ["white2"]),
    api.scan(SCRIPTS, "PokePartyAdd|CallWildBattle|WorkSetConst"),
    api.scan(SWARMS, SWARM_LINES),
  ]);
  return fromFiles({ tables, zones, species, places, trades, grottoes, scripts, swarms }, constants);
}

export const ZONE_KEYS = ["encounters", "parent", "map_type", "battle_bg"];
export const SCRIPT_PATTERN = "PokePartyAdd|CallWildBattle|WorkSetConst";
export { SCRIPTS, SWARMS, SWARM_LINES };

/** The national Pokédex's species in Black 2 and White 2 (generated/species.txt continues with the eggs and props). */
const NATIONAL_DEX_SIZE = 649;

export const SPECIES_KEYS = ["name", "types", "forms", "hidden_ability", "baby_species", "evolutions"];

export interface Files {
  tables: DataFile[];
  zones: DataFile[];
  species: DataFile[];
  places: DataFile[];
  trades: DataFile[];
  grottoes: DataFile[];
  scripts: ScanMatch[];
  swarms: ScanMatch[];
}

/** The loaded data from the files of each kind, as the server gives them (tests read them from disk). */
export function fromFiles(files: Files, constants: Constants): Loaded {
  const info = new Map<string, SpeciesInfo>();
  for (const { path, data } of files.species) {
    const parts = path.split("/");
    // Only the species' own data.json, not its forms' (res/pokemon/<species>/form_N/data.json)
    if (parts.length !== 4) continue;
    const folder = parts[2];
    const id = `SPECIES_${folder.toUpperCase()}`;
    // Only the national dex's species: not SPECIES_NONE, the eggs or the Pokéstar Studios props after them
    const dex = constants.get(id) ?? 0;
    if (dex < 1 || dex > NATIONAL_DEX_SIZE) continue;
    const evolutions = (data.evolutions as { method: string; param: unknown; species: string }[] | undefined) ?? [];
    info.set(id, {
      species: id,
      folder,
      name: String(data.name ?? folder),
      types: [...new Set((data.types as string[] | undefined) ?? [])],
      family: String(data.baby_species ?? id),
      evolutions: [...new Set(evolutions.map((e) => e.species))],
      levelEvolutions: evolutions.filter((e) => e.method.startsWith("EVO_METHOD_LEVEL") && typeof e.param === "number" && e.param > 0)
        .map((e) => ({ species: e.species, level: e.param as number })),
      forms: Number((data.forms as { count?: number } | undefined)?.count ?? 1),
      hiddenAbility: String(data.hidden_ability ?? "ABILITY_NONE"),
      dex,
    });
  }
  return {
    tables: files.tables.map(({ path, data }) => ({ id: fileName(path), data })),
    zones: files.zones.map(({ path, data }) => ({
      zone: zoneName(path),
      encounters: typeof data.encounters === "string" && data.encounters !== "ENCOUNTERS_NONE" ? data.encounters : null,
      parent: String(data.parent ?? zoneName(path)),
      mapType: Number(data.map_type ?? 0),
      battleBg: Number(data.battle_bg ?? 0),
    })),
    species: info,
    places: files.places.map(({ data }) => data as unknown as Place).filter((p) => p.position && p.hit),
    sources: readSources(files, constants),
    grottoes: files.grottoes.map(({ path, data }) => ({ id: fileName(path), data })),
    outbreaks: readSwarms(files.swarms),
  };
}

/** White 2's rows of SWARM_DATA: the rows after it up to its "};", skipping the Black 2 blocks. */
function readSwarms(lines: ScanMatch[]): OldOutbreak[] {
  const start = lines.findIndex((l) => l.text.includes("SWARM_DATA["));
  const rows: OldOutbreak[] = [];
  let black2 = false;
  for (const { text } of start < 0 ? [] : lines.slice(start + 1)) {
    if (text.startsWith("};")) break;
    if (text.startsWith("#ifdef BLACK2")) black2 = true;
    else if (text.startsWith("#else") || text.startsWith("#endif")) black2 = false;
    const row = SWARM_ROW.exec(text);
    if (row && !black2) rows.push({ zone: row[1], species: row[2], form: Number(row[3]), min: Number(row[4]), max: Number(row[5]) });
  }
  return rows;
}

function readSources(files: Files, constants: Constants): Loaded["sources"] {
  const sources: Loaded["sources"] = new Map();
  const add = (species: string, source: Source, where: string) => {
    if (!species.startsWith("SPECIES_") || species === "SPECIES_NONE") return;
    const list = sources.get(species) ?? [];
    if (!list.some((s) => s.source === source && s.where === where)) list.push({ source, where });
    sources.set(species, list);
  };
  for (const { path, data } of files.trades) add(String(data.species ?? ""), "trade", path);

  // The scripts name a species by its number, or by a variable that the same script sets to numbers
  const speciesName = new Map<number, string>();
  for (const [name, value] of constants) if (name.startsWith("SPECIES_") && !speciesName.has(value)) speciesName.set(value, name);
  const sets = new Map<string, Map<string, Set<number>>>();
  for (const m of files.scripts) {
    const set = WORK_SET.exec(m.text);
    if (!set) continue;
    const byVar = sets.get(m.path) ?? new Map<string, Set<number>>();
    byVar.set(set[1].toLowerCase(), (byVar.get(set[1].toLowerCase()) ?? new Set()).add(Number(set[2])));
    sets.set(m.path, byVar);
  }
  for (const m of files.scripts) {
    for (const { source, pattern } of SCRIPT_SOURCES) {
      const found = pattern.exec(m.text);
      if (!found) continue;
      const arg = found[1];
      const numbers = /^\d+$/.test(arg) ? [Number(arg)] : [...(sets.get(m.path)?.get(arg.toLowerCase()) ?? [])];
      for (const n of numbers) if (n > 0) add(speciesName.get(n) ?? "", source, `${m.path}:${m.line}`);
    }
  }
  return sources;
}

/** The new encounter data's files, or null when there are none yet. */
export async function loadEncounterFiles(): Promise<EncounterFiles | null> {
  const [settings, groups, areas, species, scaling] = await Promise.all([
    api.data(DATA_SCHEMAS.settings), api.data(DATA_SCHEMAS.groups), api.data(DATA_SCHEMAS.areas), api.data(DATA_SCHEMAS.species),
    api.file(LEVEL_SCALING),
  ]);
  if (!settings.length || !groups.length) return null;
  return {
    settings: settings[0].data as EncounterFiles["settings"],
    levelScaling: JSON.parse(scaling.text),
    groups: groups[0].data as EncounterFiles["groups"],
    areas: areas.map(({ path, data }) => ({ id: fileName(path), data: data as EncounterFiles["settings"] })),
    species: species.map(({ path, data }) => ({ folder: fileName(path), data: data as EncounterFiles["settings"] })),
  };
}

/** The settings and the draft from the files. */
export function draftFromFiles(loaded: Loaded, files: EncounterFiles): { settings: EncounterSettings; draft: Draft } {
  return { settings: readSettings(files), draft: readDraft(files, loaded.tables, loaded.zones, readGrottoes(loaded.grottoes)) };
}

export function buildDraft(loaded: Loaded, settings: EncounterSettings): Draft {
  return convert(loaded.tables, loaded.zones, loaded.species, settings, loaded.outbreaks, readGrottoes(loaded.grottoes));
}
