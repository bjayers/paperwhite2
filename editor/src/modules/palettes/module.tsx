// Graphics & Palettes: art from an image editor such as Aseprite converted into the game's screens (the boot logos, the
// copyright notice, the hack's own boot screen, the title screen), and the JASC palettes of res/ (.pal) in the DS's
// colors, on the images that use them, for sprites' normal and shiny colors and new art's palettes.

import type { ToolModule } from "../types.ts";
import { GraphicsEditor } from "./GraphicsEditor.tsx";
import "./palettes.css";

const module: ToolModule = {
  kind: "tool",
  id: "graphics",
  title: "Graphics & Palettes",
  icon: "🎨",
  section: "editors",
  order: 2,
  View: GraphicsEditor,
};

export default module;
