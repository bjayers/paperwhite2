// The Join Avenue Editor: the avenue's owners, who open its shops, and its random visitors (JoinAvenueEditor.tsx).

import type { ToolModule } from "../types.ts";
import { JoinAvenueEditor } from "./JoinAvenueEditor.tsx";
import "./joinavenue.css";

const module: ToolModule = {
  kind: "tool",
  id: "joinavenue",
  title: "Join Avenue",
  icon: "🏪",
  section: "editors",
  order: 8,
  requires: ["res/field/join_avenue/join_avenue_table.schema.json"],
  View: JoinAvenueEditor,
};

export default module;
