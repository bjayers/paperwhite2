// The Map Editor: a zone's map chunks, their faces and the tile libraries cut from the game's chunks
// (docs/paperwhite2/design/map-editor.md).

import type { ToolModule } from "../types.ts";
import { MapEditor } from "./MapEditor.tsx";
import "./maps.css";

const module: ToolModule = {
  kind: "tool",
  id: "maps",
  title: "Map Editor",
  icon: "⛰️",
  section: "editors",
  order: 3,
  requires: ["res/field/zones/zone.schema.json", "res/field/maps/models/map_model.schema.json"],
  View: MapEditor,
};

export default module;
