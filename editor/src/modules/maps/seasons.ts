// What changes with the seasons on a zone's map (docs/paperwhite2/design/map-editor.md, Seasons): its area's texture
// set in each season, which the chunks bind to by texture name, and the chunks a season replacement swaps in.

import { api } from "../../api.ts";
import type { Constants } from "../../../shared/schema.ts";
import { AREA_SEASONS_END, AREA_SEASONS_FIRST, SEASONS, nameOf, replacementValue, type Replacement } from "../overworld/terrain.ts";

export interface SeasonSet {
  season: string;
  /** The set's folder under res/field/maps/textures/, and its PNGs' names. */
  set: string | null;
  constant: string | null;
  textures: Set<string>;
}

/** The zone's area's texture set in each season (one entry for an area without seasons). */
export async function seasonSets(zone: string, constants: Constants): Promise<SeasonSet[]> {
  const zoneData = JSON.parse((await api.file(`res/field/zones/${zone}.json`)).text) as { area?: string };
  const number = zoneData.area ? constants.get(zoneData.area) : undefined;
  if (number === undefined) return [];
  const seasonal = number >= AREA_SEASONS_FIRST && number < AREA_SEASONS_END;
  const names = seasonal ? SEASONS.map((_, s) => nameOf(constants, "AREA_", number + s)) : [zoneData.area!];
  return Promise.all(names.map(async (name, s) => {
    const area = name ? await api.file(`res/field/areas/${name.replace(/^AREA_/, "").toLowerCase()}.json`)
      .then((f) => JSON.parse(f.text) as { texture_set?: string }, () => null) : null;
    const constant = area?.texture_set ?? null;
    const set = constant ? constant.replace(/^MAP_TEXTURE_SET_/, "").toLowerCase() : null;
    const textures = set ? new Set((await api.list(`res/field/maps/textures/${set}/*.png`)).map((p) => p.slice(p.lastIndexOf("/") + 1)))
      : new Set<string>();
    return { season: seasonal ? SEASONS[s] : "All year", set, constant, textures };
  }));
}

/** For a chunk's model, the models each season shows in its place, where a season replacement swaps it; else null. */
export async function seasonVariants(matrix: string, model: string, constants: Constants): Promise<string[] | null> {
  const replacements = await api.file("res/field/map_replacements/replacements.json")
    .then((f) => (JSON.parse(f.text) as { replacements: Replacement[] }).replacements, () => [] as Replacement[]);
  const same = (a: string | number, b: string | number) => a === b || (constants.get(String(a)) ?? a) === (constants.get(String(b)) ?? b);
  for (const r of replacements) {
    if (r.kind !== "chunk" || !same(r.matrix, matrix) || !(r.condition === "season" || r.condition === "version_season")) continue;
    // A chunk is in an entry as its base (the first value) or as one of the season's models
    if (!r.values.some((v) => same(v, model))) continue;
    return SEASONS.map((_, s) => {
      const v = replacementValue(r, s) ?? r.values[0];
      return typeof v === "number" ? nameOf(constants, "MAP_MODEL_", v) ?? String(v) : v;
    });
  }
  return null;
}
