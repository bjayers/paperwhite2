// The Pokémon Center page: the attendants' fees, rates and lists (PokemonCenterEditor.tsx).

import type { ToolModule } from "../types.ts";
import { PokemonCenterEditor } from "./PokemonCenterEditor.tsx";
import "./pokemoncenter.css";

const module: ToolModule = {
  kind: "tool",
  id: "pokemoncenter",
  title: "Pokémon Center",
  icon: "🏥",
  section: "editors",
  order: 8.5,
  requires: ["res/paperwhite2/pokemon_center/services.schema.json"],
  View: PokemonCenterEditor,
};

export default module;
