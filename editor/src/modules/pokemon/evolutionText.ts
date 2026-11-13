// How an evolution reads in the Pokémon Editor's family tree and a form's page: its method and its parameter, such as
// "Item Fire Stone" or "Level 16", from the constants' names.

import { constantLabel } from "../schema-form/form.tsx";
import type { Evolution } from "./forms.ts";

export function evolutionText(e: Evolution): string {
  const method = constantLabel(e.method, "EVO_METHOD_");
  if (e.param === 0 || e.param === undefined) return method;
  const param = typeof e.param === "string" ? constantLabel(e.param, /^(ITEM|MOVE|SPECIES)_/.exec(e.param)?.[0] ?? "") : e.param;
  return `${method} ${param}`;
}
