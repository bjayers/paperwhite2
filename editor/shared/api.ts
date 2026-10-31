// What the editor's server and page send each other. Paths are relative to the repository, with forward slashes.

export const EDITOR_PORT = 7420;

/** A kind of data: one schema in res/ and the files that name it in their "$schema". */
export interface DataType {
  schema: string;
  title: string;
  description: string;
  /** The folders under res/ that hold the schema, as a heading: ["field", "zones"]. */
  category: string[];
  /** The folder all its files share, which entry labels are relative to. */
  root: string;
  count: number;
}

export interface Entry {
  path: string;
  /** The file's place under the type's root, without ".json" or a trailing "/data": "bulbasaur", "bulbasaur/form_1". */
  label: string;
}

/** One file of a kind of data, parsed, for modules that read many at once (GET /api/data). */
export interface DataFile {
  path: string;
  /** The file's JSON, or only the top-level keys that were asked for. */
  data: Record<string, unknown>;
}

/** A line of a file that matched a scan (GET /api/scan). */
export interface ScanMatch {
  path: string;
  /** From 1. */
  line: number;
  text: string;
}

export interface ProjectInfo {
  name: string;
  root: string;
  types: DataType[];
  /** JSON files in res/ that name no schema, and the schemas themselves: editable as text only. */
  otherFiles: number;
  settings: PublicSettings;
}

export interface PublicSettings {
  buildCommand: string;
  /** Off until the user turns it on in settings.local.json, once the Claude sessions' work is done. */
  commitEnabled: boolean;
}

export interface FileContent {
  path: string;
  text: string;
  /** A hash of the text; a save names it, so a file changed on disk since is never overwritten unknowingly. */
  version: string;
  /** The schema it names, when it names one. */
  schema: string | null;
}

export interface SaveRequest {
  path: string;
  text: string;
  /** The version the edit started from, or null to overwrite whatever is there. */
  baseVersion: string | null;
}

export type SaveResult =
  | { ok: true; version: string }
  | { ok: false; reason: "conflict"; current: FileContent }
  | { ok: false; reason: "invalid"; message: string };

export interface BuildState {
  running: boolean;
  command: string;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  /** The last lines of output, kept while the editor runs. */
  lines: string[];
}

export interface GitChange {
  path: string;
  /** git status's two letters: index then work tree ("M ", " M", "??", ...). */
  status: string;
}

export interface GitState {
  branch: string;
  ahead: number;
  behind: number;
  head: string;
  changes: GitChange[];
}

/** Sent on /api/events as server-sent events. */
export type ServerEvent =
  | { type: "files"; paths: string[] }
  | { type: "types" }
  | { type: "constants" }
  | { type: "build"; state: BuildState }
  | { type: "build-line"; line: string }
  | { type: "git" };

/** Mutating requests carry this header; a page on another site can't send it without permission. */
export const WRITE_HEADER = "X-Paperwhite-Editor";

/** What the art converter (tools/paperwhite2/screen_art.py) says about art for a target (POST /api/art/convert). */
export interface ArtReport {
  target: string;
  ok: boolean;
  /** Each screen's sheet: its tiles, the most it may have, and the palette rows it uses. */
  screens: Record<string, { tiles: number; max_tiles: number; rows: number[] }>;
  /** What keeps the art from being written; a tile's problem has its place in pixels. */
  problems: { screen: string; message: string; x?: number; y?: number }[];
  warnings: string[];
  rows_changed: number[];
  written?: boolean;
}
