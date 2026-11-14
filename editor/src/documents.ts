// The files open in the editor: their data, unsaved changes, undo and redo, and what happens when a file changes on
// disk while it is open. Modules edit data through here and never write files themselves.

import { useEffect, useState, useSyncExternalStore } from "react";
import { api, isNotFound } from "./api.ts";
import { DATA_LAYOUT, detectLayout, fileText, parseJson, setIn, type JsonPath, type JsonValue, type Layout } from "../shared/json.ts";

const HISTORY = 200;

export interface Document {
  path: string;
  schema: string | null;
  /** The file's text as last read or saved, and its version on disk. */
  savedText: string;
  version: string;
  /** Parsed data, or null for a file edited only as text (not JSON, or written in a layout the editor doesn't know). */
  data: JsonValue | null;
  /** The layout that writes the file back as it was, when there is one. */
  layout: Layout | null;
  /** The text, for a file edited as text. */
  text: string;
  /** Text typed in the raw view that doesn't parse yet; the data stays as it last parsed, and saving waits. */
  draft: string | null;
  dirty: boolean;
  past: Snapshot[];
  future: Snapshot[];
  /** Set when the file changed on disk while this copy had unsaved changes. */
  changedOnDisk: boolean;
  saving: boolean;
  saveError: string | null;
}

interface Snapshot {
  data: JsonValue | null;
  text: string;
  draft: string | null;
}

type Listener = () => void;

class DocumentStore {
  private docs = new Map<string, Document>();
  private order: string[] = [];
  private active: string | null = null;
  private listeners = new Set<Listener>();
  private fileListeners = new Set<(paths: string[]) => void>();
  private snapshot = { docs: this.docs, order: this.order, active: this.active };

  /** Files changed on disk (the server's poll): each open one is looked at again (changedOnDisk), and the listeners
   * are told, so a view can find a file that is new, or back (a commit undone), that it holds no document of. */
  filesChanged(paths: string[]) {
    for (const path of paths) if (this.docs.get(path)) void this.changedOnDisk(path);
    for (const listener of this.fileListeners) listener(paths);
  }

  onFiles(listener: (paths: string[]) => void) {
    this.fileListeners.add(listener);
    return () => { this.fileListeners.delete(listener); };
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private changed() {
    this.snapshot = { docs: new Map(this.docs), order: [...this.order], active: this.active };
    for (const l of this.listeners) l();
  }

  private put(doc: Document) {
    this.docs.set(doc.path, doc);
    this.changed();
  }

  get(path: string): Document | undefined {
    return this.docs.get(path);
  }

  async open(path: string) {
    if (!this.docs.has(path)) {
      const file = await api.file(path);
      this.docs.set(path, fromFile(file.path, file.schema, file.text, file.version));
    }
    if (!this.order.includes(path)) this.order.push(path);
    this.active = path;
    this.changed();
  }

  /** Reads a file for a tool without opening a tab for it: it is edited, saved, undone and reloaded as an open file,
   * and the Build button asks to save it with the others. Opening it later gives it a tab. */
  async hold(path: string): Promise<Document> {
    if (!this.docs.has(path)) {
      const file = await api.file(path);
      if (!this.docs.has(path)) this.put(fromFile(file.path, file.schema, file.text, file.version));
    }
    return this.docs.get(path)!;
  }

  /** Starts a new file for a tool, held as hold() holds one, unsaved until the tool saves it. */
  create(path: string, schema: string | null, data: JsonValue, layout: Layout = DATA_LAYOUT) {
    this.put({ ...fromFile(path, schema, "", ""), data, layout, dirty: true });
  }

  activate(path: string | null) {
    this.active = path;
    this.changed();
  }

  /** Takes a held document out of the store as it is, history and all, for restore() to bring back (a tool undoing the
   * creation of a file it made, and redoing it). */
  stash(path: string): Document | undefined {
    const doc = this.docs.get(path);
    if (doc) this.close(path);
    return doc;
  }

  restore(doc: Document) {
    this.put(doc);
  }

  canUndo(path: string): boolean {
    return (this.docs.get(path)?.past.length ?? 0) > 0;
  }

  canRedo(path: string): boolean {
    return (this.docs.get(path)?.future.length ?? 0) > 0;
  }

  /** Closes a tab; the caller asks first when it has unsaved changes. */
  close(path: string) {
    this.docs.delete(path);
    // A file held for a tool has no tab
    const i = this.order.indexOf(path);
    if (i >= 0) this.order.splice(i, 1);
    if (this.active === path) this.active = this.order[Math.min(Math.max(i, 0), this.order.length - 1)] ?? null;
    this.changed();
  }

  /** Changes one value; every change is a step for undo. */
  edit(path: string, at: JsonPath, value: JsonValue | undefined) {
    const doc = this.docs.get(path);
    if (!doc || doc.data === null) return;
    this.update(doc, { data: setIn(doc.data, at, value), text: doc.text, draft: null });
  }

  /** Changes one value as part of the last step, without a step of its own: a value dragged changes many times and
   * undoes at once (the drag's first change is an edit, the rest amend it). */
  amend(path: string, at: JsonPath, value: JsonValue | undefined) {
    const doc = this.docs.get(path);
    if (!doc || doc.data === null) return;
    const next = { ...doc, data: setIn(doc.data, at, value), draft: null };
    this.put({ ...next, dirty: currentText(next) !== doc.savedText });
  }

  /** Replaces the whole data, for modules that change several values at once. */
  replace(path: string, data: JsonValue) {
    const doc = this.docs.get(path);
    if (doc) this.update(doc, { data, text: doc.text, draft: null });
  }

  /** Edits a file as text. JSON text that parses becomes the data again, so the form and the text agree. */
  editText(path: string, text: string) {
    const doc = this.docs.get(path);
    if (!doc) return;
    if (doc.data === null) return this.update(doc, { data: null, text, draft: null });
    try {
      this.update(doc, { data: parseJson(text), text: doc.text, draft: null });
    } catch {
      this.update(doc, { data: doc.data, text: doc.text, draft: text });
    }
  }

  private update(doc: Document, step: Snapshot) {
    const past = [...doc.past, snapshotOf(doc)].slice(-HISTORY);
    const next = { ...doc, ...step, past, future: [] };
    this.put({ ...next, dirty: currentText(next) !== doc.savedText });
  }

  undo(path: string) {
    const doc = this.docs.get(path);
    const last = doc?.past.at(-1);
    if (!doc || !last) return;
    const next = { ...doc, ...last, past: doc.past.slice(0, -1), future: [snapshotOf(doc), ...doc.future] };
    this.put({ ...next, dirty: currentText(next) !== doc.savedText });
  }

  redo(path: string) {
    const doc = this.docs.get(path);
    const nextStep = doc?.future[0];
    if (!doc || !nextStep) return;
    const next = { ...doc, ...nextStep, future: doc.future.slice(1), past: [...doc.past, snapshotOf(doc)] };
    this.put({ ...next, dirty: currentText(next) !== doc.savedText });
  }

  /** Saves through the server, which checks the text with the build's validator first. */
  async save(path: string, overwrite = false): Promise<boolean> {
    const doc = this.docs.get(path);
    if (!doc) return false;
    if (doc.draft !== null) {
      this.put({ ...doc, saveError: "The text isn't valid JSON yet; fix it in the text view, or undo." });
      return false;
    }
    const text = currentText(doc);
    this.put({ ...doc, saving: true, saveError: null });
    const result = await api.save({ path, text, baseVersion: overwrite ? null : doc.version }).catch((e: Error) => ({
      ok: false as const, reason: "invalid" as const, message: e.message,
    }));
    const now = this.docs.get(path)!;
    if (result.ok) {
      this.put({ ...now, savedText: text, version: result.version, saving: false, changedOnDisk: false,
                 dirty: currentText(now) !== text });
      return true;
    }
    if (result.reason === "conflict") this.put({ ...now, saving: false, changedOnDisk: true, saveError:
      "This file changed on disk since you opened it. Reload it, or save again to overwrite the change." });
    else this.put({ ...now, saving: false, saveError: result.message });
    return false;
  }

  /** A file changed on disk: reload it if it has no unsaved changes, otherwise mark it so the user decides. A file
   * gone from disk (deleted, or a commit undone) is dropped if it has none, as the disk has it; with some, Save
   * writes it again and Revert drops it. */
  async changedOnDisk(path: string) {
    const doc = this.docs.get(path);
    if (!doc) return;
    let file;
    try {
      file = await api.file(path);
    } catch (e) {
      if (!isNotFound(e)) return; // (the server didn't answer: it's looked at again on its next change)
      if (!doc.dirty) this.drop(path);
      else this.put({ ...doc, changedOnDisk: true, saveError:
        "This file was deleted or moved on disk. Save writes it again with your changes; Revert drops them, and the file." });
      return;
    }
    if (file.version === doc.version) return; // our own save
    if (!doc.dirty) this.put({ ...fromFile(file.path, file.schema, file.text, file.version), past: doc.past, future: [] });
    else this.put({ ...doc, changedOnDisk: true });
  }

  /** Reads a file again, dropping its changes; a file not on disk (one a tool made and never saved, or one deleted
   * since) is dropped altogether, as the disk has it. */
  async reload(path: string) {
    let file;
    try {
      file = await api.file(path);
    } catch (e) {
      if (!isNotFound(e)) throw e;
      this.drop(path);
      return;
    }
    this.put(fromFile(file.path, file.schema, file.text, file.version));
  }

  /** A document closed, with its changes. */
  private drop(path: string) {
    if (!this.docs.delete(path)) return;
    const i = this.order.indexOf(path);
    if (i >= 0) this.order.splice(i, 1);
    if (this.active === path) this.active = this.order[0] ?? null;
    this.changed();
  }

  dirtyPaths(): string[] {
    return [...this.docs.values()].filter((d) => d.dirty).map((d) => d.path);
  }
}

function fromFile(path: string, schema: string | null, text: string, version: string): Document {
  let data: JsonValue | null = null;
  let layout: Layout | null = null;
  if (path.endsWith(".json") && !path.endsWith(".schema.json")) {
    try {
      data = parseJson(text);
      layout = detectLayout(text, data);
      if (layout === null) data = null; // a layout only a person writes: edit it as text, so nothing is reformatted
    } catch {
      data = null;
    }
  }
  return { path, schema, savedText: text, version, data, layout, text, draft: null, dirty: false, past: [], future: [],
           changedOnDisk: false, saving: false, saveError: null };
}

function snapshotOf(doc: Document): Snapshot {
  return { data: doc.data, text: doc.text, draft: doc.draft };
}

/** What saving would write: the data in the file's own layout, or the text for a file edited as text. */
export function currentText(doc: Pick<Document, "data" | "layout" | "text" | "draft">): string {
  if (doc.draft !== null) return doc.draft;
  return doc.data !== null && doc.layout !== null ? fileText(doc.data, doc.layout) : doc.text;
}

export const documents = new DocumentStore();

/** A count that goes up each time a file changes on disk, for an effect that should look at it again. */
export function useFileEpoch(path: string | null): number {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => (path ? documents.onFiles((paths) => { if (paths.includes(path)) setEpoch((n) => n + 1); }) : undefined), [path]);
  return epoch;
}

export function useDocuments() {
  return useSyncExternalStore(documents.subscribe, documents.getSnapshot);
}
