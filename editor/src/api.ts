// Requests to the editor's server, and its live events.

import { WRITE_HEADER, type BuildState, type DataFile, type Entry, type ScanMatch, type FileContent, type GitState, type ProjectInfo,
  type SaveRequest, type SaveResult, type ServerEvent } from "../shared/api.ts";
import { schemaPart, splitSchemaId, type Schema } from "../shared/schema.ts";
import type { Usage, UsageKind } from "../server/usage.ts";
import type { ArtReport } from "../shared/api.ts";

/** Whether a request failed because what it asked for isn't there (the server's 404: a file deleted on disk). */
export function isNotFound(e: unknown): boolean {
  return (e as { status?: number } | null)?.status === 404;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { [WRITE_HEADER]: "1", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({ error: response.statusText }));
    throw Object.assign(new Error(problem.error ?? response.statusText), { status: response.status });
  }
  const type = response.headers.get("Content-Type") ?? "";
  return (type.includes("json") ? response.json() : response.text()) as Promise<T>;
}

const schemas = new Map<string, Promise<Schema>>();

/** A schema file with the definitions it names in other files brought in, as datajson.load_schema() reads one: a
 * $ref to "other.schema.json#/$defs/name" (relative to this file) becomes "#/$defs/name", and this file's $defs take
 * the other file's definitions that they don't have themselves. */
async function loadSchemaFile(path: string, seen = new Set<string>()): Promise<Schema> {
  seen.add(path);
  const schema = JSON.parse((await api.file(path)).text) as Schema;
  const folder = path.slice(0, path.lastIndexOf("/") + 1);
  const others = new Set<string>();
  const rewrite = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(rewrite);
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const ref = record.$ref;
    if (typeof ref === "string" && !ref.startsWith("#") && ref.includes("#/$defs/")) {
      const [file, name] = ref.split("#/$defs/");
      others.add(normalize(folder + file));
      record.$ref = `#/$defs/${name}`;
    }
    Object.values(record).forEach(rewrite);
  };
  rewrite(schema);
  const defs = { ...schema.$defs };
  for (const other of others) {
    if (seen.has(other)) continue;
    const loaded = await loadSchemaFile(other, seen);
    for (const [name, def] of Object.entries(loaded.$defs ?? {})) if (!(name in defs)) defs[name] = def;
  }
  return { ...schema, $defs: defs };
}

function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "." && part !== "") parts.push(part);
  }
  return parts.join("/");
}

/** Faces of a GLB by primitive and triangle number, deleted or drawn with another texture (server/glb.ts). */
export interface GlbFaceSet { primitive: number; triangles: number[] }
export interface GlbFaceEdits { remove?: GlbFaceSet[]; retexture?: { faces: GlbFaceSet[]; image: string }[] }

export const api = {
  project: () => request<ProjectInfo>("GET", "/api/project"),
  entries: (schema: string) => request<Entry[]>("GET", `/api/entries?schema=${encodeURIComponent(schema)}`),
  search: (query: string) => request<Entry[]>("GET", `/api/search?q=${encodeURIComponent(query)}`),
  file: (path: string) => request<FileContent>("GET", `/api/file?path=${encodeURIComponent(path)}`),
  /** A schema, read once per session; it is a file under res/ like any other. */
  schema(path: string): Promise<Schema> {
    // A "#/$defs/name" fragment names one definition of the file
    const { file, fragment } = splitSchemaId(path);
    if (!schemas.has(path)) schemas.set(path, loadSchemaFile(file).then((schema) => schemaPart(schema, fragment)));
    return schemas.get(path)!;
  },
  forgetSchema: (path: string) => schemas.delete(path),
  /** Every file of a kind of data, parsed; keys limits each to those top-level keys. */
  data: (schema: string, keys?: string[]) =>
    request<DataFile[]>("GET", `/api/data?schema=${encodeURIComponent(schema)}${keys ? `&keys=${keys.join(",")}` : ""}`),
  /** Writes a map chunk's props (nodes bw2_prop_*) into its model.glb. */
  glbProps: (path: string, props: { id: number; translation: number[]; rotation: number[] }[]) =>
    request<{ ok: boolean }>("PUT", "/api/glb-props", { path, props }),
  /** Deletes or retextures faces of a map chunk's model.glb; written says its data.json now has the whole model written. */
  glbFaces: (path: string, edits: GlbFaceEdits, textureSet?: string) =>
    request<{ ok: boolean; written: boolean }>("PUT", "/api/glb-faces", { path, edits, textureSet }),
  /** Copies faces of one map chunk's model.glb into another's, moved by offset; the images the faces use, <set>/<png>,
   * and the pasted faces, by their new draw calls. */
  glbPaste: (target: string, source: string, faces: GlbFaceSet[] | "all", offset: [number, number, number], textureSet: string) =>
    request<{ ok: boolean; pngs: string[]; faces: GlbFaceSet[] }>("PUT", "/api/glb-paste", { target, source, faces, offset, textureSet }),
  /** Moves faces of a map chunk's model.glb by offset; the moved faces, by their new draw calls. */
  glbMove: (path: string, faces: GlbFaceSet[], offset: [number, number, number], textureSet: string) =>
    request<{ ok: boolean; faces: GlbFaceSet[] }>("PUT", "/api/glb-move", { path, faces, offset, textureSet }),
  /** Adds textures (<set>/<png>) of other map texture sets to sets, by their imports.json. */
  importGrass: (kind: string, sets: string[]) => request<{ added: string[]; donors: Record<string, string> }>("POST", "/api/grass-import", { kind, sets }),
  importTextures: (sets: string[], textures: string[]) => request<{ added: string[] }>("POST", "/api/texture-imports", { sets, textures }),
  /** Saves faces of a map chunk as an object of the library (tools/paperwhite2/map_objects.py). */
  saveMapObject: (b: { name: string; category?: string; chunk: string; faces: GlbFaceSet[]; anchor: number[]; size: number[] }) =>
    request<{ id: string; path: string }>("POST", "/api/map-objects/save", b),
  deleteMapObject: (id: string) => request<{ removed: boolean }>("DELETE", `/api/map-objects?id=${encodeURIComponent(id)}`),
  /** Starts a painted map of a chunk: every tile fill ("." keeps the chunk) at its collision's heights, or flat (tiles). */
  startPainting: (model: string, style: string, fill: string, flat?: number) =>
    request<{ path: string }>("POST", "/api/map-maker/start", { model, style, fill, flat }),
  /** Paints the whole chunk from its reading as it is now (a debug view; map_roundtrip.py paint). */
  mapCost: (model: string) => request<{ vertices: number; polygons: number; triangles: number }>("GET", `/api/map-cost?model=${encodeURIComponent(model)}`),
  paintFromReading: (model: string) => request<{ painting: { style: string; terrain: string[]; height: number[][]; grass: string[] } }>(
    "POST", "/api/map-maker/from-reading", { model }),
  /** Puts a painted chunk back as it was before painting, and removes its painting. */
  stopPainting: (model: string) => request<{ ok: boolean; output: string }>("POST", "/api/map-maker/stop", { model }),
  /** Generates a painted map's chunk from its project (tools/paperwhite2/map_maker.py). */
  generateMap: (model: string) => request<{ ok: boolean; output: string }>("POST", "/api/map-maker/generate", { model }),
  /** Puts a map chunk's model.glb back as it was (base64 bytes), and its data.json (text), for undo. */
  glbRaw: (path: string, data: string, meta?: string, files?: Record<string, string>) =>
    request<{ ok: boolean }>("PUT", "/api/glb-raw", { path, data, meta, files }),
  /** Puts a map chunk's files back as the original game (vanilla) or the last commit has them; keepCollision leaves its
   * collision as it is. */
  revertChunk: (model: string, to: "vanilla" | "commit", keepCollision = false) =>
    request<{ files: string[] }>("POST", "/api/map-chunk/revert", { model, to, keepCollision }),
  /** A chunk as the map reader reads it (tools/paperwhite2/map_reader.py), now or as the original game has it. */
  readChunk: <T>(model: string, style: string | null, original: boolean) =>
    request<T>("GET", `/api/map-reader?model=${encodeURIComponent(model)}${style ? `&style=${encodeURIComponent(style)}` : ""}${original ? "&rev=original" : ""}`),
  /** The game's unused zones, which a new map can take. */
  unusedZones: () => request<{ zone: string; file: string; parent: string | null; place: string | null }[]>("GET", "/api/new-map/unused"),
  /** Makes an unused zone a new map (tools/paperwhite2/new_map.py create). */
  createMap: (b: { zone: string; name: string; template: string; width: number; height: number; area?: string; mapType?: number;
    parent?: string; place?: string; copyProps?: boolean }) =>
    request<{ zone: string; matrix: string; file: string; models: string[] }>("POST", "/api/new-map/create", b),
  /** Makes an unused zone a route of the overworld in the cells given (tools/paperwhite2/new_map.py route). */
  createRoute: (b: { zone: string; name: string; template: string; cells: [number, number][]; filler?: string; area?: string;
    place?: string; copyProps?: boolean }) =>
    request<{ zone: string; file: string; models: string[]; fillers: [number, number][] }>("POST", "/api/new-map/route", b),
  /** The lines of the files under res/ that a glob names which match a regular expression. */
  scan: (glob: string, pattern: string, options: { ignoreCase?: boolean; limit?: number } = {}) =>
    request<ScanMatch[]>("GET", `/api/scan?glob=${encodeURIComponent(glob)}&pattern=${encodeURIComponent(pattern)}` +
      `${options.ignoreCase ? "&flags=i" : ""}${options.limit ? `&limit=${options.limit}` : ""}`),
  /** The paths of the files under res/ that a glob names, sorted. */
  list: (glob: string) => request<string[]>("GET", `/api/list?glob=${encodeURIComponent(glob)}`),
  /** An image under res/, as its file's bytes. */
  async asset(path: string): Promise<ArrayBuffer> {
    const response = await fetch(api.assetUrl(path));
    if (!response.ok) throw new Error(`${path}: ${response.statusText}`);
    return response.arrayBuffer();
  },
  /** The address of an art target's screen as an indexed PNG in its palette, to draw over. */
  artRenderUrl: (target: string, screen: string) =>
    `/api/art/render?target=${encodeURIComponent(target)}&screen=${encodeURIComponent(screen)}`,
  /** Converts art for some of a target's screens: the report and previews, and with write, the game's files replaced. */
  artConvert: (target: string, images: Record<string, string>, write: boolean) =>
    request<{ report: ArtReport; previews: Record<string, string> }>("POST", "/api/art/convert", { target, images, write }),
  /** The address of a 2D screen of res/ drawn as a PNG, from its character PNG, screen and palette. */
  screenUrl: (chars: string, screen: string, palette: string) =>
    `/api/screen?chars=${encodeURIComponent(chars)}&screen=${encodeURIComponent(screen)}&palette=${encodeURIComponent(palette)}`,
  /** The address of an image under res/. */
  assetUrl: (path: string) => `/api/asset?path=${encodeURIComponent(path)}`,
  constants: () => request<Record<string, number>>("GET", "/api/constants"),
  /** Every flag or variable with its name, status, uses and documentation; again runs the usage tools again. */
  usage: (kind: UsageKind, again = false) => request<Usage>("GET", `/api/usage?kind=${kind}${again ? "&again=1" : ""}`),
  save: (save: SaveRequest) => request<SaveResult>("PUT", "/api/file", save),
  /** Removes a species' encounter file (the only kind the server lets go). */
  removeFile: (path: string) => request<{ removed: boolean }>("DELETE", `/api/file?path=${encodeURIComponent(path)}`),
  build: () => request<BuildState>("GET", "/api/build"),
  startBuild: () => request<{ started: boolean }>("POST", "/api/build"),
  stopBuild: () => request("POST", "/api/build/stop"),
  git: () => request<GitState>("GET", "/api/git"),
  diff: (path: string) => request<string>("GET", `/api/git/diff?path=${encodeURIComponent(path)}`),
  /** A file under res/ at the last commit or the original game's data (w2-original). */
  fileAt: (rev: "HEAD" | "w2-original", path: string) => request<string>("GET", `/api/git/show?rev=${rev}&path=${encodeURIComponent(path)}`),
  /** Puts changed files back as the last commit has them; new files are removed. */
  discard: (paths: string[]) => request<{ discarded: number }>("POST", "/api/git/discard", { paths }),
  commit: (paths: string[], message: string) => request<{ commit: string }>("POST", "/api/git/commit", { paths, message }),
};

export type ConnectionListener = (connected: boolean) => void;

/** The server's events; reconnects by itself when the server restarts. */
export function listen(onEvent: (event: ServerEvent) => void, onConnection: ConnectionListener): () => void {
  const source = new EventSource("/api/events");
  let started: number | null = null;
  source.onopen = () => onConnection(true);
  source.onerror = () => onConnection(false);
  source.onmessage = (message) => {
    const event = JSON.parse(message.data);
    if (event.type === "hello") {
      // A new server since the last connection: everything may have changed while it was down.
      if (started !== null && started !== event.started) location.reload();
      started = event.started;
      return;
    }
    onEvent(event as ServerEvent);
  };
  return () => source.close();
}
