// The Ability Editor: every ability's text and battle settings, the Pokémon that have it, and Add ability.

import type { ToolModule } from "../types.ts";
import { AbilityEditor } from "./AbilityEditor.tsx";
import "../moves/moves.css";

const module: ToolModule = {
  kind: "tool",
  id: "abilities",
  title: "Ability Editor",
  icon: "✨",
  section: "editors",
  order: 6.4,
  requires: ["res/abilities/ability.schema.json"],
  View: AbilityEditor,
};

export default module;
