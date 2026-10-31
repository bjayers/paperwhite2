// The Overworld Editor: what is placed on a zone's map (NPCs, proxies, triggers, warps, level scripts) on its 3D map
// with the collision tiles, and a permissions painter.

import type { ToolModule } from "../types.ts";
import { OverworldEditor } from "./OverworldEditor.tsx";
import "./overworld.css";

const module: ToolModule = {
  kind: "tool",
  id: "overworld",
  title: "Overworld Editor",
  icon: "🗺️",
  section: "editors",
  order: 2,
  requires: ["res/field/events/events.schema.json", "res/field/zones/zone.schema.json"],
  View: OverworldEditor,
};

export default module;
