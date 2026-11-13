// Which species IDs are Pokémon, as tools/data/species_list.py defines them for the build (docs/paperwhite2/design/
// new-species.md, section 3.1): generated/species.txt has the national Pokédex's 1 to 649, then the egg, the bad egg
// and the Pokéstar Studios props (650 to 684), then, from FIRST_ADDED_SPECIES, Paper White 2's added species (685 and
// 686 are reserved). A species in the Pokédex is also one whose data.json hasn't "pokedex": false nor "retired": true.

import type { Constants } from "./schema.ts";

/** The first species ID the hack adds, after the two reserved for the eggs. */
export const FIRST_ADDED_SPECIES = 687;

/** The national Pokédex's last species (SPECIES_EGG - 1 in the constants). */
export function lastNationalSpecies(constants: Constants): number {
  return (constants.get("SPECIES_EGG") ?? 650) - 1;
}

/** Whether a species ID is a Pokémon's: 1 to Genesect, or an added species. */
export function isRealSpecies(id: number, constants: Constants): boolean {
  return (id >= 1 && id <= lastNationalSpecies(constants)) || isAddedSpecies(id);
}

/** Whether a species ID is one the hack adds. */
export function isAddedSpecies(id: number): boolean {
  return id >= FIRST_ADDED_SPECIES;
}

/** Whether a species' data.json puts it in the Pokédex: all but "pokedex": false and the retired ("retired": true,
 * hidden but keeping their IDs). */
export function inPokedex(data: { pokedex?: unknown; retired?: unknown }): boolean {
  return data.pokedex !== false && data.retired !== true;
}
