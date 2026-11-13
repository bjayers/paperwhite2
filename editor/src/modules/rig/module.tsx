// The Rig Editor: one side of a battle sprite's rig (res/pokemon/<folder>/<side>_rig.json), with its live preview, its
// sheet's rectangles, its parts and its keys (RigEditor.tsx).

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
