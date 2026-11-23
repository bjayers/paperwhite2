// The Icon review page (temporary, until every party/box icon is decided): choose between the IHM and J re-indexings
// of each icon onto its battle palettes, and for an icon flagged to fix by hand also G2, H, IH and K (IconReview.tsx;
// docs/paperwhite2/design/shiny-icons.md sections 13-14).

import type { ToolModule } from "../types.ts";
import { IconReview } from "./IconReview.tsx";
import "./iconreview.css";

const module: ToolModule = {
  kind: "tool",
  id: "icon-review",
  title: "Icon review (temporary)",
  icon: "🧪",
  section: "tools",
  order: 100,
  View: IconReview,
};

export default module;
