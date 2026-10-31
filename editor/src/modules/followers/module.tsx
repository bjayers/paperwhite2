// The Follower Editor: the Following Pokémon's sprites and placement, dialogue, gifts and pickups, interactions and
// effects' art, in one place.

import type { ToolModule } from "../types.ts";
import { FollowerEditor } from "./FollowerEditor.tsx";
import "./followers.css";

const module: ToolModule = {
  kind: "tool",
  id: "followers",
  title: "Follower Editor",
  icon: "🐾",
  section: "editors",
  order: 3,
  requires: [
    "res/field/actors/field_actor.schema.json",
    "res/paperwhite2/following/dialogue.schema.json",
  ],
  View: FollowerEditor,
};

export default module;
