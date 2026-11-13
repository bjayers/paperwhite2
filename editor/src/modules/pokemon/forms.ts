// The Pokémon Editor's list: every species (res/pokemon/<species>/data.json) and, under it, every alternate form its
// forms.count gives, named by its Pokédex form name (pokedex.forms[n - 1].name), whether or not the form has a data
// record of its own (<species>/form_<n>.json). A form without one is its species in data (PML_PersonalGetDatID).
// An evolution of a species may be for one form only (its "form", docs/paperwhite2/design/form-evolutions.md):
// formEvolutions gives a form's as the game sees them. Pure, so tests/pokemon-forms.test.ts checks it against the
// real res/.

export interface ListedFile {
  path: string;
  data: Record<string, unknown>;
}

/** An evolution of res/pokemon's species data: only a Pokémon of form evolves this way, or any without one. */
export interface Evolution {
  method: string;
  param: unknown;
  species: string;
  form?: number;
}

export interface Listed {
  /** "vulpix", or "vulpix#1" for its form 1. */
  key: string;
  /** The species' folder in res/pokemon. */
  folder: string;
  /** 0 for the species. */
  form: number;
  species: string;
  /** "Vulpix", or "Pichu: Spiky-eared" for a form. */
  name: string;
  number: number;
  /** The species' data.json. */
  speciesPath: string;
  /** The form's own record, form_<n>.json, if it has one. */
  recordPath: string | null;
  /** The species' forms.count. */
  count: number;
  /** The species' evolutions, for all its forms. */
  evolutions: Evolution[];
  /** The species' forms' names, form 0's first. */
  formNames: string[];
  /** The species' forms that never evolve (forms.no_evolution). */
  noEvolution: number[];
}

type Forms = { count?: number; sprite_offset?: number; no_evolution?: number[]; pokedex?: boolean };
type Pokedex = { form_name?: string; forms?: { name?: string }[] };

/** The list, species by National Pokédex number (then the others by folder), each followed by its forms. */
export function listSpecies(files: ListedFile[], numbers: ReadonlyMap<string, number>): Listed[] {
  const records = new Set(files.map((f) => f.path));
  const out: Listed[] = [];
  for (const { path, data } of files) {
    const match = /^res\/pokemon\/(.+)\/data\.json$/.exec(path);
    if (!match) continue;
    const folder = match[1];
    // (a Pokéstar Studios species' folder is pokestar/<name>, SPECIES_POKESTAR_<NAME>)
    const species = `SPECIES_${folder.replace("/", "_").toUpperCase()}`;
    const name = String(data.name ?? folder);
    const count = Number((data.forms as Forms | undefined)?.count ?? 1);
    const number = numbers.get(species) ?? 0;
    const evolutions = (data.evolutions as Listed["evolutions"] | undefined) ?? [];
    const formNames = namesOfForms(name, data.pokedex as Pokedex | undefined, count);
    const noEvolution = ((data.forms as Forms | undefined)?.no_evolution ?? []).map(Number);
    const shared = { folder, species, number, speciesPath: path, count, evolutions, formNames, noEvolution };
    out.push({ key: folder, form: 0, name, recordPath: null, ...shared });
    for (let form = 1; form < count; form++) {
      const record = `res/pokemon/${folder}/form_${form}.json`;
      out.push({
        key: `${folder}#${form}`, form, name: `${name}: ${formNames[form]}`,
        recordPath: records.has(record) ? record : null, ...shared,
      });
    }
  }
  out.sort((a, b) => (a.number || 1e9) - (b.number || 1e9) || a.folder.localeCompare(b.folder) || a.form - b.form);
  return out;
}

/** The forms the original game has: the original count, from pokemon_form.py info (1 for a species not listed). */
export function isOriginalForm(original: Record<string, number>, folder: string, form: number): boolean {
  return form < (original[folder] ?? 1);
}

/** The names of a species' count forms: form 0's pokedex.form_name (else the species' name), then pokedex.forms'. */
export function namesOfForms(species: string, pokedex: Pokedex | undefined, count: number): string[] {
  const names = [pokedex?.form_name?.trim() || species];
  for (let form = 1; form < count; form++) names.push(pokedex?.forms?.[form - 1]?.name?.trim() || `Form ${form}`);
  return names;
}

/** The evolutions a Pokémon of form takes, as CheckEvolveSpecies' filter keeps them (PaperWhite2_FilterFormEvolutions):
 * those without a form and those for this one; none for a form that never evolves (forms.no_evolution). */
export function formEvolutions(entry: Pick<Listed, "evolutions" | "noEvolution">, form: number): Evolution[] {
  if (entry.noEvolution.includes(form)) return [];
  return entry.evolutions.filter((e) => e.form === undefined || e.form === form);
}
