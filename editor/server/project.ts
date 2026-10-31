// The project: finds every kind of data in res/ from the schemas the files name, keeps that index current as files
// change, and reads and writes files safely. Nothing about a particular kind of data is written here, so new schemas
// and new folders in res/ appear in the editor without changes to it.

import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync, unlinkSync,
  writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import type { DataType, Entry, FileContent } from "../shared/api.ts";
import { schemaPart, splitSchemaId, type Schema } from "../shared/schema.ts";

const SCHEMA_FIELD = /^\{\s*"\$schema"\s*:\s*"((?:[^"\\]|\\.)*)"/;

export class Project {
  readonly res: string;
  /** Data files by their schema. */
  private bySchema = new Map<string, Set<string>>();
  /** Each data file's schema. */
  private schemaOf = new Map<string, string>();
  private schemas = new Map<string, { title: string; description: string }>();
  private other = new Set<string>();
  private listeners: ((paths: string[], typesChanged: boolean) => void)[] = [];

  constructor(readonly root: string) {
    this.res = join(root, "res");
    if (!existsSync(join(root, "configure.py")) || !existsSync(this.res))
      throw new Error(`${root} isn't a Paper White 2 checkout (no configure.py and res/)`);
    for (const file of walk(this.res)) this.index(this.rel(file));
  }

  rel(absolute: string): string {
    return relative(this.root, absolute).split(sep).join("/");
  }

  abs(path: string): string {
    return join(this.root, ...path.split("/"));
  }

  /** A repository path under res/ that is safe to read or write, or null. */
  checkPath(path: string): string | null {
    const normal = posix.normalize(path);
    if (normal !== path || !normal.startsWith("res/") || normal.includes("\0")) return null;
    return resolve(this.abs(normal)).startsWith(this.res + sep) ? normal : null;
  }

  // ------------------------------------------------------------------ Index

  private index(path: string): boolean {
    if (!path.endsWith(".json")) return false;
    const before = this.schemaOf.get(path) ?? (this.other.has(path) ? "" : undefined);
    this.forget(path);
    const absolute = this.abs(path);
    if (!existsSync(absolute)) return before !== undefined;
    if (path.endsWith(".schema.json")) {
      try {
        const schema = JSON.parse(readFileSync(absolute, "utf8"));
        this.schemas.set(path, { title: String(schema.title ?? ""), description: String(schema.description ?? "") });
      } catch {
        this.schemas.set(path, { title: "", description: "" });
      }
      this.other.add(path);
      return true;
    }
    const head = readHead(absolute);
    const schema = this.schemaFor(path, head);
    if (!schema) {
      this.other.add(path);
      return before !== "";
    }
    this.schemaOf.set(path, schema);
    if (!this.bySchema.has(schema)) this.bySchema.set(schema, new Set());
    this.bySchema.get(schema)!.add(path);
    return before !== schema;
  }

  private forget(path: string) {
    const schema = this.schemaOf.get(path);
    if (schema) {
      this.bySchema.get(schema)?.delete(path);
      if (!this.bySchema.get(schema)?.size) this.bySchema.delete(schema);
    }
    this.schemaOf.delete(path);
    this.other.delete(path);
    if (path.endsWith(".schema.json")) this.schemas.delete(path);
  }

  types(): DataType[] {
    const types: DataType[] = [];
    for (const [schema, files] of this.bySchema) {
      const { file, fragment } = splitSchemaId(schema);
      const info = fragment ? this.definitionInfo(file, fragment) : this.schemas.get(schema) ?? { title: "", description: "" };
      const root = commonFolder([...files]);
      types.push({
        schema,
        title: shortTitle(info.title) || (fragment ? fragment.split("/").pop()! : posix.basename(file, ".schema.json")).replace(/_/g, " "),
        description: info.description,
        category: posix.dirname(file).split("/").slice(1),
        root,
        count: files.size,
      });
    }
    return types.sort((a, b) => a.category.join("/").localeCompare(b.category.join("/")) || a.title.localeCompare(b.title));
  }

  /** A definition's title and description, for a kind of data whose files name one ("#/$defs/name"). */
  private definitionInfo(file: string, fragment: string): { title: string; description: string } {
    try {
      const part = schemaPart(JSON.parse(readFileSync(this.abs(file), "utf8")) as Schema, fragment);
      return { title: String(part.title ?? ""), description: String(part.description ?? "") };
    } catch {
      return { title: "", description: "" };
    }
  }

  entries(schema: string): Entry[] {
    const files = [...(this.bySchema.get(schema) ?? [])];
    const root = commonFolder(files);
    return files
      .map((path) => ({ path, label: entryLabel(path, root) }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }

  /** Data files whose path contains every word of the query, best first: for the quick-open box. */
  search(query: string, limit = 50): Entry[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const found: { path: string; score: number }[] = [];
    for (const path of this.schemaOf.keys()) {
      const lower = path.toLowerCase();
      if (!words.every((w) => lower.includes(w))) continue;
      const name = posix.basename(posix.dirname(lower)) + "/" + posix.basename(lower);
      found.push({ path, score: words.filter((w) => name.includes(w)).length * 100 - path.length });
    }
    found.sort((a, b) => b.score - a.score);
    return found.slice(0, limit).map(({ path }) => ({ path, label: path.replace(/^res\//, "").replace(/\.json$/, "") }));
  }

  otherCount(): number {
    return this.other.size;
  }

  // ------------------------------------------------------------------ Files

  read(path: string): FileContent {
    const text = readFileSync(this.abs(path), "utf8");
    this.keepWatching(path);
    return { path, text, version: versionOf(text), schema: this.schemaOf.get(path) ?? null };
  }

  /** The schema a file's text names, resolved from the file's folder, or null. */
  schemaFor(path: string, text: string): string | null {
    const match = SCHEMA_FIELD.exec(text.slice(0, 512));
    if (!match) return null;
    // A "#/$defs/name" fragment names one definition of the file, and stays on the schema's name
    const { file: named, fragment } = splitSchemaId(JSON.parse(`"${match[1]}"`) as string);
    const suffix = fragment ? `#${fragment}` : "";
    const direct = posix.normalize(posix.join(posix.dirname(path), named));
    if (existsSync(this.abs(direct))) return direct + suffix;
    // Some files name their schema relative to the wrong folder (field actors name "field_actor.schema.json" from a
    // folder below it); the nearest folder above that has it is the one meant.
    for (let folder = posix.dirname(path); folder.startsWith("res"); folder = posix.dirname(folder)) {
      const candidate = posix.join(folder, posix.basename(named));
      if (existsSync(this.abs(candidate))) return candidate + suffix;
    }
    return direct + suffix;
  }

  /** Writes beside the file, lets check look at that copy, then renames it over the file, so a crash or a failed
   * check never leaves half a file or a bad one. */
  async writeAtomic(path: string, text: string, check?: (temp: string) => Promise<void>) {
    const target = this.abs(path);
    const temp = join(dirname(target), `.${posix.basename(path)}.editor-${process.pid}.tmp`);
    writeFileSync(temp, text);
    try {
      await check?.(temp);
      renameSync(temp, target);
      // The editor's own save is not a change on disk to report back.
      this.watched.set(path, { stamp: stampOf(target), seen: Date.now() });
    } catch (error) {
      if (existsSync(temp)) unlinkSync(temp);
      throw error;
    }
    this.index(path);
  }

  // ------------------------------------------------------------------ Watching
  //
  // Checked by polling, not by fs.watch: watching res/ recursively takes one inotify watch per file or folder (some
  // 30,000 or 20,000), more than many systems allow. Instead the open files are checked every second, and the folders
  // every few seconds, rereading only the folders whose contents changed. A file is "open" from when it is read or
  // written here until it hasn't been read for a while.

  private folders = new Map<string, number>();
  private watched = new Map<string, { stamp: string; seen: number }>();

  /** Calls back with the files under res/ that changed. */
  onChange(listener: (paths: string[], typesChanged: boolean) => void) {
    this.listeners.push(listener);
  }

  /** Marks a file as open, so a change to it on disk is noticed within a second. */
  keepWatching(path: string) {
    this.watched.set(path, { stamp: this.watched.get(path)?.stamp ?? stampOf(this.abs(path)), seen: Date.now() });
  }

  watch() {
    for (const folder of walkFolders(this.res)) this.folders.set(folder, mtimeOf(folder));
    for (const schema of this.schemas.keys()) this.keepWatching(schema);
    setInterval(() => this.checkFiles(), 1000).unref();
    setInterval(() => this.checkFolders(), 4000).unref();
  }

  private checkFiles() {
    const changed: string[] = [];
    const now = Date.now();
    for (const [path, entry] of this.watched) {
      const stamp = stampOf(this.abs(path));
      if (stamp !== entry.stamp) {
        entry.stamp = stamp;
        changed.push(path);
      }
      // A data file nobody has read for ten minutes is no longer open; schemas stay watched.
      if (now - entry.seen > 600_000 && !path.endsWith(".schema.json")) this.watched.delete(path);
    }
    this.report(changed);
  }

  private checkFolders() {
    const changed = new Set<string>();
    for (const [folder, mtime] of [...this.folders]) {
      if (!this.folders.has(folder)) continue; // went with a parent earlier in this pass
      const now = mtimeOf(folder);
      if (now === mtime) continue;
      const prefix = this.rel(folder) + "/";
      if (now < 0) {
        // Gone, with everything in it.
        for (const known of this.folders.keys()) if (known === folder || known.startsWith(folder + sep)) this.folders.delete(known);
        for (const path of this.knownPaths()) if (path.startsWith(prefix)) changed.add(path);
        continue;
      }
      this.folders.set(folder, now);
      const present = new Set<string>();
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const absolute = join(folder, entry.name);
        if (entry.isDirectory() && !this.folders.has(absolute)) {
          for (const sub of walkFolders(absolute)) this.folders.set(sub, mtimeOf(sub));
          for (const file of walk(absolute)) changed.add(this.rel(file));
        } else if (entry.name.endsWith(".json") && !entry.name.includes(".editor-")) present.add(prefix + entry.name);
      }
      for (const path of present) if (!this.schemaOf.has(path) && !this.other.has(path)) changed.add(path);
      for (const path of this.knownPaths())
        if (path.startsWith(prefix) && !path.slice(prefix.length).includes("/") && !present.has(path)) changed.add(path);
    }
    this.report([...changed]);
  }

  private knownPaths(): string[] {
    return [...this.schemaOf.keys(), ...this.other];
  }

  private report(paths: string[]) {
    if (!paths.length) return;
    let typesChanged = false;
    for (const path of paths) typesChanged = this.index(path) || typesChanged;
    for (const l of this.listeners) l(paths, typesChanged);
  }
}

function stampOf(path: string): string {
  try {
    const stat = statSync(path);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "gone";
  }
}

function mtimeOf(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return -1;
  }
}

function* walkFolders(folder: string): Generator<string> {
  yield folder;
  for (const entry of readdirSync(folder, { withFileTypes: true }))
    if (entry.isDirectory()) yield* walkFolders(join(folder, entry.name));
}

export function versionOf(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

function readHead(path: string): string {
  // "$schema" is the first field of every data file, so the start of the file is enough.
  const buffer = Buffer.alloc(512);
  const fd = openSync(path, "r");
  try {
    return buffer.toString("utf8", 0, readSync(fd, buffer, 0, buffer.length, 0));
  } finally {
    closeSync(fd);
  }
}

const TEMP_FILE = /^\..+\.editor-\d+\.tmp$/;

function* walk(folder: string): Generator<string> {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.name.endsWith(".json")) yield path;
    // A save cut short by a crash leaves its copy behind; it never replaced the file, so it can go.
    else if (TEMP_FILE.test(entry.name)) unlinkSync(path);
  }
}

function commonFolder(paths: string[]): string {
  if (!paths.length) return "res";
  let parts = posix.dirname(paths[0]).split("/");
  for (const path of paths) {
    const other = posix.dirname(path).split("/");
    let i = 0;
    while (i < parts.length && parts[i] === other[i]) i++;
    parts = parts.slice(0, i);
  }
  return parts.join("/");
}

function entryLabel(path: string, root: string): string {
  let label = path.slice(root.length + 1).replace(/\.json$/, "");
  if (label.endsWith("/data")) label = label.slice(0, -5);
  return label || posix.basename(path, ".json");
}

/** "A zone's header: res/field/zones/<zone>.json" reads better as "A zone's header". */
function shortTitle(title: string): string {
  const short = title.replace(/^Paper White 2:\s*/, "").replace(/[:,]\s*res\/.*$/, "").trim();
  return short.charAt(0).toUpperCase() + short.slice(1);
}
