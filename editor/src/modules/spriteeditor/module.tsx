// The Sprite Editor: a Pokémon's party/box icon on its battle palettes and its walking and follower sheets, pixel by
// pixel, beside its battle sprite (SpriteEditor.tsx; docs/paperwhite2/design/shiny-icons.md section 15).

import type { ToolModule } from "../types.ts";
import { SpriteEditor } from "./SpriteEditor.tsx";
import "./spriteeditor.css";

const module: ToolModule = {
  kind: "tool",
  id: "sprite-editor",
  title: "Sprite Editor",
  icon: "🖌",
  section: "editors",
  order: 7,
  requires: ["res/pokemon/species.schema.json"],
  View: SpriteEditor,
};

export default module;
