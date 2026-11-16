// The Entree page: the rooms of the Entralink roguelike, with their battles and NPCs placed on the forest's maps
// (EntreeEditor.tsx; the data in res/paperwhite2/entralink/rooms/, model.ts).

import type { ToolModule } from "../types.ts";
import { EntreeEditor } from "./EntreeEditor.tsx";
import "./entree.css";

const module: ToolModule = {
  kind: "tool",
  id: "entree",
  title: "Entree",
  icon: "🌲",
  section: "editors",
  order: 8.6,
  requires: ["res/paperwhite2/entralink/room.schema.json"],
  View: EntreeEditor,
};

export default module;
