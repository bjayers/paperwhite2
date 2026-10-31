// The Text Editor: every message of the story's and the system's text banks, searchable, with the talk window's
// preview. Its TextBox and MessageEditor are reused by other editors.

import type { ToolModule } from "../types.ts";
import { TextEditor } from "./TextEditor.tsx";
import "./text.css";

const module: ToolModule = {
  kind: "tool",
  id: "text",
  title: "Text Editor",
  icon: "💬",
  section: "editors",
  order: 4,
  View: () => <TextEditor />,
};

export default module;
