// The Encounter Editor: the wild Pokémon by species, each with its levels, battle styles, hidden ability and
// habitats in one place, with views by area and on the map of Unova, and the settings that apply to all of them.

import type { ToolModule } from "../types.ts";
import { EncounterEditor } from "./EncounterEditor.tsx";
import "./encounters.css";

const module: ToolModule = {
  kind: "tool",
  id: "encounters",
  title: "Encounter Editor",
  icon: "🌿",
  section: "editors",
  order: 1,
  requires: [
    "res/field/encounters/encounters.schema.json",
    "res/field/zones/zone.schema.json",
    "res/pokemon/species.schema.json",
    "res/town_map/place.schema.json",
  ],
  View: EncounterEditor,
};

export default module;
