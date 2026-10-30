// Finds every module in src/modules/*/module.ts(x) when the page is built.

import type { DataType } from "../../shared/api.ts";
import type { DataViewModule, EditorModule, ToolModule } from "./types.ts";

const found = import.meta.glob<{ default: EditorModule }>("./*/module.{ts,tsx}", { eager: true });

export const modules: EditorModule[] = Object.values(found).map((m) => m.default);

export const dataViews = modules.filter((m): m is DataViewModule => m.kind === "data");

export const tools = modules.filter((m): m is ToolModule => m.kind === "tool");

/** The data views that can open a kind of data, best first. */
export function viewsFor(type: DataType): DataViewModule[] {
  return dataViews
    .map((m) => ({ m, score: m.handles(type) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.m);
}
