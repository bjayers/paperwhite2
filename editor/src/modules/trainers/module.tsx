// The Trainer Editor: every trainer's settings, party (species, levels, items, moves) and lines, with the class's
// sprite and each line in the talk window's preview.

import type { ToolModule } from "../types.ts";
import { TrainerEditor } from "./TrainerEditor.tsx";
import "./trainers.css";

const module: ToolModule = {
  kind: "tool",
  id: "trainers",
  title: "Trainer Editor",
  icon: "🧢",
  section: "editors",
  order: 7,
  requires: ["res/trainers/data/trainer.schema.json"],
  View: TrainerEditor,
};

export default module;
