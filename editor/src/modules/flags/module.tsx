// The Flag and Var Reference: every event flag and saved variable, named or not, used or not, with its documentation,
// the user's notes and where it's used (FlagReference.tsx).

import type { ToolModule, ToolProps } from "../types.ts";
import { FlagReference } from "./FlagReference.tsx";
import "./flags.css";

function FlagReferencePage({ open }: ToolProps) {
  return (
    <div className="fr-page">
      <div className="fr-page-head"><strong>Flag and Var Reference</strong>
        <span className="muted small">Every event flag and saved variable: its name, whether it's used, its documentation and your notes</span></div>
      <FlagReference open={open} />
    </div>
  );
}

const module: ToolModule = {
  kind: "tool",
  id: "flags",
  title: "Flag and Var Reference",
  icon: "🚩",
  section: "tools",
  View: FlagReferencePage,
};

export default module;
