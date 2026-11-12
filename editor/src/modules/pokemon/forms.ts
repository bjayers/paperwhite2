// The Pokémon Editor's list: every species (res/pokemon/<species>/data.json) and, under it, every alternate form its
// forms.count gives, named by its Pokédex form name (pokedex.forms[n - 1].name), whether or not the form has a data
// record of its own (<species>/form_<n>.json). A form without one is its species in data (PML_PersonalGetDatID).
// Pure, so tests/pokemon-forms.test.ts checks it against the real res/.

export interface ListedFile {
  path: string;
  data: Record<string, unknown>;
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
  evolutions: { method: string; param: unknown; species: string }[];
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
    out.push({ key: folder, folder, form: 0, species, name, number, speciesPath: path, recordPath: null, count, evolutions });
    const forms = (data.pokedex as Pokedex | undefined)?.forms ?? [];
    for (let form = 1; form < count; form++) {
      const record = `res/pokemon/${folder}/form_${form}.json`;
      const formName = forms[form - 1]?.name?.trim() || `Form ${form}`;
      out.push({
        key: `${folder}#${form}`, folder, form, species, name: `${name}: ${formName}`, number, speciesPath: path,
        recordPath: records.has(record) ? record : null, count, evolutions,
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
