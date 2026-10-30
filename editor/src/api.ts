// Requests to the editor's server, and its live events.

import { WRITE_HEADER, type BuildState, type DataFile, type Entry, type ScanMatch, type FileContent, type GitState, type ProjectInfo,
  type SaveRequest, type SaveResult, type ServerEvent } from "../shared/api.ts";
import type { Schema } from "../shared/schema.ts";

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

export const api = {
  project: () => request<ProjectInfo>("GET", "/api/project"),
  entries: (schema: string) => request<Entry[]>("GET", `/api/entries?schema=${encodeURIComponent(schema)}`),
  search: (query: string) => request<Entry[]>("GET", `/api/search?q=${encodeURIComponent(query)}`),
  file: (path: string) => request<FileContent>("GET", `/api/file?path=${encodeURIComponent(path)}`),
  /** A schema, read once per session; it is a file under res/ like any other. */
  schema(path: string): Promise<Schema> {
    if (!schemas.has(path)) schemas.set(path, api.file(path).then((f) => JSON.parse(f.text) as Schema));
    return schemas.get(path)!;
  },
  forgetSchema: (path: string) => schemas.delete(path),
  /** Every file of a kind of data, parsed; keys limits each to those top-level keys. */
  data: (schema: string, keys?: string[]) =>
    request<DataFile[]>("GET", `/api/data?schema=${encodeURIComponent(schema)}${keys ? `&keys=${keys.join(",")}` : ""}`),
  /** The lines of the files under res/ that a glob names which match a regular expression. */
  scan: (glob: string, pattern: string) =>
    request<ScanMatch[]>("GET", `/api/scan?glob=${encodeURIComponent(glob)}&pattern=${encodeURIComponent(pattern)}`),
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
