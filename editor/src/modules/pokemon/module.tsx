// The Pokémon Editor: every species and form, with its sprite, base stats, settings, Pokédex data, learnset and
// evolutions with its family's tree.

import type { ToolModule } from "../types.ts";
import { PokemonEditor } from "./PokemonEditor.tsx";
import "./pokemon.css";

const module: ToolModule = {
  kind: "tool",
  id: "pokemon",
  title: "Pokémon Editor",
  icon: "⭐",
  section: "editors",
  order: 6,
  requires: ["res/pokemon/species.schema.json"],
  View: PokemonEditor,
};

export default module;
