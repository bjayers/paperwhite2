// A move picker's options for one Pokémon: the moves its species (or its form's own record) can learn first, each
// with how (its levels, TMs and HMs, Tutor, Egg), then every move, under two headings of the SearchSelect. Read from
// res/pokemon/<species>/data.json and form_N.json on disk by tools/paperwhite2/moves.py learnable, once a session per
// species and form. Used by the Entree page's enemy cards and the Trainer Editor's party.

import { useEffect, useState } from "react";
import { api, type LearnableMoves } from "../../api.ts";
import type { Constants } from "../../../shared/schema.ts";
import type { Option } from "../../shell/SearchSelect.tsx";
import { constantLabel, constantOptions } from "../schema-form/form.tsx";

const cache = new Map<string, Promise<LearnableMoves | null>>();

function learnable(species: string, form: number): Promise<LearnableMoves | null> {
  const key = `${species}:${form}`;
  let found = cache.get(key);
  if (!found) {
    found = api.learnableMoves(species, form).catch(() => null);
    cache.set(key, found);
  }
  return found;
}

/** The options: the learnable moves (group "Learns"), then every move (group "All moves"); every move alone while
 * the species has no data or none is chosen. */
export function useMoveOptions(species: string, form: number, constants: Constants): Option[] {
  const all = constantOptions(constants, "MOVE_");
  const [learned, setLearned] = useState<LearnableMoves | null>(null);
  useEffect(() => {
    let live = true;
    setLearned(null);
    if (/^SPECIES_[A-Z0-9_]+$/.test(species) && species !== "SPECIES_NONE")
      void learnable(species, form).then((l) => live && setLearned(l));
    return () => { live = false; };
  }, [species, form]);
  if (!learned?.moves.length) return all;
  const known = new Set(all.map((o) => o.value));
  const moves = learned.moves.filter((m) => known.has(m.move));
  const first = moves.map((m) => ({ value: m.move, label: constantLabel(m.move, "MOVE_"), detail: m.how.join(", "), group: `Learns (${moves.length})` }));
  return [...first, ...all.map((o) => ({ ...o, group: "All moves" }))];
}
