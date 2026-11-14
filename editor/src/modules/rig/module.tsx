// The Rig Editor: one side of a battle sprite's rig. The new editor (SetupEditor.tsx) edits its source,
// res/pokemon/<folder>/<side>_rig_v2.json, baked into <side>_rig.json; the first (RigEditor.tsx) is its Advanced view.

import type { ToolModule } from "../types.ts";
import { RigEditor } from "./RigEditor.tsx";

const module: ToolModule = {
  kind: "tool",
  id: "rig",
  title: "Rig Editor",
  icon: "🦴",
  section: "editors",
  order: 7,
  requires: ["res/pokemon/battle_sprite_rig.schema.json"],
  View: RigEditor,
};

export default module;
