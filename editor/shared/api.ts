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

/** What Push to GitHub did (POST /api/git/push): its commit (none when there was nothing to commit and the branch was
 * only ahead), whether origin/main merged in and the push went through, and why not. */
export interface PushResult {
  commit: string | null;
  merged: boolean;
  pushed: boolean;
  /** The files that conflicted when origin/main merged in (the merge was aborted). */
  conflicts: string[];
  error: string | null;
  /** Each git step and its outcome, in order. */
  log: string[];
}

/** Files Push to GitHub never stages: the ROMs and what is extracted or built from them, the Script Editor's own notes,
 * and the local settings. (Files git ignores are left out too, by the server.) */
const NEVER_PUSHED = [/^(orig|extract|build)(\/|$)/, /\.(nds|srl|dsi|gb|gbc|gba|sav|dsv)$/i, /(^|\/)bios[79]\.bin$/i, /^res\/paperwhite2\/scripts\/notes\.json$/,
  /(^|\/)settings\.local\.json$/, /(^|\/)node_modules\//];

export function neverPushed(path: string): boolean {
  return NEVER_PUSHED.some((re) => re.test(path));
}

/** The default message of a push: "Editor: " and the parts of the data its files are in ("encounters, scripts"). */
export function pushMessage(paths: string[]): string {
  const areas = [...new Set(paths.map((p) => {
    const parts = p.split("/");
    if (parts[0] === "res") return (parts[1] === "paperwhite2" && parts.length > 2 ? parts[2] : parts[1]).replace(/\.json$/, "");
    return parts.length > 1 ? parts[0] : p;
  }).map((a) => a.replace(/_/g, " ")))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!areas.length) return "Editor: changes";
  return `Editor: ${areas.length > 4 ? `${areas.slice(0, 4).join(", ")} and ${areas.length - 4} more` : areas.join(", ")}`;
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

/** A sprite sheet that a build tool packs whole (GET /api/sprite-sheets): its PNG under res/ and its size. */
export interface SpriteSheet {
  name: string;
  title: string;
  path: string;
  tool: string;
  width: number;
  height: number;
  description: string;
}

/** A sheet's check by its tool (POST /api/sprite-sheets/check): its last line, and the sheet as the game shows it. */
export interface SpriteSheetCheck {
  ok: boolean;
  message: string;
  written: boolean;
  preview: string | null;
}

/** An item's icon (GET /api/item-icons): the icon and palette members it shows in the hack's build, their files, the
 * other items that show them, and the icon as the game shows it (base64 PNG). */
export interface ItemIcon {
  constant: string;
  id: number;
  name: string;
  /** One of the hack's items (docs/paperwhite2/items.md's table) */
  hack: boolean;
  icon: string;
  palette: string;
  iconPath: string;
  palettePath: string;
  iconSharedWith: string[];
  paletteSharedWith: string[];
  preview: string | null;
}

export interface ItemIcons {
  size: number;
  colors: number;
  items: ItemIcon[];
}

/** A PNG checked as an item's icon (POST /api/item-icons/check), and whether it was written. */
export type ItemIconCheck = SpriteSheetCheck;

export type Rgb8 = [number, number, number];

/** One type's label (GET /api/type-icons): its 32×16 picture as palette indices (0-15, 0 transparent) in rows, the
 * archive member and file it is, and which of the label palette's rows it is drawn in. */
export interface TypeLabel {
  id: number;
  constant: string;
  name: string;
  member: number;
  path: string;
  row: number;
  pixels: number[];
}

/** An entry of a palette row: the labels (type IDs) and other menu icons that draw with it. */
export interface TypeRowEntry {
  index: number;
  labels: number[];
  others: string[];
}

export interface TypeRow {
  row: number;
  colors: Rgb8[];
  entries: TypeRowEntry[];
}

/** A type's battle move button palette (a/0/1/1 member): its first 16 colors; 8-13 are the button's gradient. */
export interface TypeButton {
  id: number;
  member: number;
  path: string;
  colors: Rgb8[];
}

export interface TypeIcons {
  width: number;
  height: number;
  /** The label palette (033.pal), whose three rows of 16 the labels are drawn in */
  palettePath: string;
  labels: TypeLabel[];
  rows: TypeRow[];
  buttons: TypeButton[];
}

/** What a PNG would change as a label, or as the sheet of all of them (POST /api/type-icons/check). */
export interface TypeIconCheck {
  ok: boolean;
  message: string;
  written: boolean;
  /** The labels it gives, as they would be */
  labels: { id: number; name: string; row: number; pixels: number[]; pixelsChanged: boolean }[];
  /** The palette entries whose color changes, and who else draws with each */
  changes: { row: number; index: number; from: Rgb8; to: Rgb8; users: string[]; shared: boolean }[];
  /** The three rows as they would be */
  rows: { row: number; colors: Rgb8[] }[];
  /** The files it writes */
  files: string[];
  nothing: boolean;
}

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
