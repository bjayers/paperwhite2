// The Shop Editor: what each shop sells (res/field/shops/, tools/data/shop_data.py): the Poké Mart's badge tiers, the
// fixed marts, Shopping Mall Nine, the BP exchange and the move tutors (ShopEditor.tsx).

import type { ToolModule } from "../types.ts";
import { ShopEditor } from "./ShopEditor.tsx";
import "./shops.css";

const module: ToolModule = {
  kind: "tool",
  id: "shops",
  title: "Shop Editor",
  icon: "🛒",
  section: "editors",
  order: 8.5,
  requires: ["res/field/shops/poke_mart.schema.json", "res/field/shops/marts.schema.json",
    "res/field/shops/bp_shops.schema.json", "res/field/shops/move_tutors.schema.json"],
  View: ShopEditor,
};

export default module;
