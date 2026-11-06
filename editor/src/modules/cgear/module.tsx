// C-Gear Pictures: the backgrounds the C-Gear's help button cycles (CGearPictures.tsx).

import type { ToolModule } from "../types.ts";
import { CGearPictures } from "./CGearPictures.tsx";
import "./cgear.css";

const module: ToolModule = {
  kind: "tool",
  id: "cgear",
  title: "C-Gear Pictures",
  icon: "📟",
  section: "editors",
  View: CGearPictures,
};

export default module;
