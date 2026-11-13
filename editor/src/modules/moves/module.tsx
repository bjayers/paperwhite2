// The Move Editor: every move's record, text and battle settings, who learns it, and Add move.

import type { ToolModule } from "../types.ts";
import { MoveEditor } from "./MoveEditor.tsx";
import "./moves.css";

const module: ToolModule = {
  kind: "tool",
  id: "moves",
  title: "Move Editor",
  icon: "💥",
  section: "editors",
  order: 6.2,
  requires: ["res/moves/move.schema.json"],
  View: MoveEditor,
};

export default module;
