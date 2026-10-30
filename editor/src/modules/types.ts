// What an editor module is. A module is a folder in src/modules/ with a module.ts(x) whose default export is an
// EditorModule; the shell finds it by itself (registry.ts), so adding one needs no list to update.
//
// Two kinds:
// - a data view opens files of the kinds of data it handles (handles() scores each kind; the highest score wins,
//   and the generic schema form answers 1 for every kind, so it is always the fallback);
// - a tool has a page of its own in the sidebar, for work that spans many files (a map, an overview). A tool in the
//   "editors" section is a specialty editor: everything about one subject in one place, listed first.
//
// Modules read and change data only through the props they are given; saving, undo, validation and conflicts are the
// shell's.

import type { ComponentType } from "react";
import type { DataType } from "../../shared/api.ts";
import type { JsonPath, JsonValue } from "../../shared/json.ts";
import type { Constants, Schema, SchemaError } from "../../shared/schema.ts";
import type { Document } from "../documents.ts";

export interface DataViewProps {
  doc: Document;
  /** The data; never null here: files edited only as text get the shell's text view instead. */
  data: JsonValue;
  type: DataType;
  schema: Schema;
  constants: Constants;
  /** The editor's own check of the data, updated on every change. */
  errors: SchemaError[];
  /** Changes one value (undefined removes it); each call is one undo step. */
  edit(path: JsonPath, value: JsonValue | undefined): void;
  /** Replaces the whole data in one undo step. */
  replace(data: JsonValue): void;
  /** Opens another file in a tab, for links between data. */
  open(path: string): void;
}

export interface DataViewModule {
  kind: "data";
  id: string;
  title: string;
  /** How well it suits a kind of data: 0 for not at all; the highest score opens the file. */
  handles(type: DataType): number;
  View: ComponentType<DataViewProps>;
}

export interface ToolProps {
  types: DataType[];
  constants: Constants;
  open(path: string): void;
}

export interface ToolModule {
  kind: "tool";
  id: string;
  title: string;
  /** A short symbol or emoji for the sidebar. */
  icon: string;
  /** Kinds of data it needs, by schema path; it is hidden while any is missing from res/. */
  requires?: string[];
  /** The sidebar section: "editors" for specialty editors, at the top; "tools" (the default) below them. */
  section?: "editors" | "tools";
  /** Its place among the section's entries, lowest first; then by title. */
  order?: number;
  View: ComponentType<ToolProps>;
}

export type EditorModule = DataViewModule | ToolModule;
