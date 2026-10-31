// Requests to the editor's server, and its live events.

import { WRITE_HEADER, type BuildState, type DataFile, type Entry, type ScanMatch, type FileContent, type GitState, type ProjectInfo,
  type SaveRequest, type SaveResult, type ServerEvent } from "../shared/api.ts";
import { schemaPart, splitSchemaId, type Schema } from "../shared/schema.ts";
import type { ArtReport } from "../shared/api.ts";

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { [WRITE_HEADER]: "1", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(problem.error ?? response.statusText);
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
  save: (save: SaveRequest) => request<SaveResult>("PUT", "/api/file", save),
  /** Removes a species' encounter file (the only kind the server lets go). */
  removeFile: (path: string) => request<{ removed: boolean }>("DELETE", `/api/file?path=${encodeURIComponent(path)}`),
  build: () => request<BuildState>("GET", "/api/build"),
  startBuild: () => request<{ started: boolean }>("POST", "/api/build"),
  stopBuild: () => request("POST", "/api/build/stop"),
  git: () => request<GitState>("GET", "/api/git"),
  diff: (path: string) => request<string>("GET", `/api/git/diff?path=${encodeURIComponent(path)}`),
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
