// The Weather Editor: each location's default weather and its weather calendar by season (WeatherEditor.tsx).

import type { ToolModule } from "../types.ts";
import { WeatherEditor } from "./WeatherEditor.tsx";
import { CALENDAR_SCHEMA } from "./calendar.ts";
import "./weather.css";

const module: ToolModule = {
  kind: "tool",
  id: "weather",
  title: "Weather Editor",
  icon: "🌦",
  section: "editors",
  order: 9,
  requires: [CALENDAR_SCHEMA, "res/field/zones/zone.schema.json"],
  View: WeatherEditor,
};

export default module;
