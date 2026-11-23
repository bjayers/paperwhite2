// The Icon review page (temporary, until every party/box icon is decided): choose between the IHM and J re-indexings
// of each icon onto its battle palettes (IconReview.tsx; docs/paperwhite2/design/shiny-icons.md section 13).

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
