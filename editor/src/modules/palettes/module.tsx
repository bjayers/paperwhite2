// The Palette Editor: the JASC palettes of res/ (.pal) in the DS's colors, on the images that use them, for sprites'
// normal and shiny colors, new art's palettes and the .pal files an image editor such as Aseprite opens.

import type { ToolModule } from "../types.ts";
import { PaletteEditor } from "./PaletteEditor.tsx";
import "./palettes.css";

const module: ToolModule = {
  kind: "tool",
  id: "palettes",
  title: "Palette Editor",
  icon: "🎨",
  section: "editors",
  order: 2,
  View: PaletteEditor,
};

export default module;
