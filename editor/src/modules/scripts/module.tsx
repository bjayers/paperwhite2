// The Script Editor: the field scripts, a file whole or one script at a time, highlighted, with the commands' help and
// the messages they show. Its ScriptEditor and CodeEditor are reused by other editors.

import type { ToolModule } from "../types.ts";
import { ScriptEditor } from "./ScriptEditor.tsx";
import "./scripts.css";

const module: ToolModule = {
  kind: "tool",
  id: "scripts",
  title: "Script Editor",
  icon: "📜",
  section: "editors",
  order: 5,
  View: () => <ScriptEditor />,
};

export default module;
