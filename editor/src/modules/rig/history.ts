// One undo history for the Rig Editor's page. A side is edited through two documents (the flat rig and its armature),
// and one action of the user's (a drag, a parenting, a pivot) may change both, so a step here is the list of documents
// it touched, undone and redone together. An armature made automatically (the first parenting, or the first key pose of
// a sprite that had none) is part of the step that made it: undoing the step takes the armature away again (it is only
// hidden, so redo brings it back with the edits made on it), and the flat rig is given back as it was.
//
// Ctrl+Z and Ctrl+Y never do nothing while something can be undone: a step whose documents have nothing left to undo
// (reloaded, reverted) is dropped and the next is tried.

import type { JsonValue } from "../../../shared/json.ts";
import type { Phase } from "./model.ts";

/** What the history needs of the documents (documents.ts, or a stand-in). */
export interface HistoryStore {
  canUndo(path: string): boolean;
  canRedo(path: string): boolean;
  undo(path: string): void;
  redo(path: string): void;
  /** Gives a document this data without a step of its own (the flat rig, back to what an armature baked from). */
  restore(path: string, data: JsonValue): void;
}

export interface Creation {
  /** The armature's document, and the flat rig's with its data when the armature was made. */
  source: string;
  flat: string;
  flatData: JsonValue;
}

interface Entry {
  paths: string[];
  creation?: Creation;
}

export class RigHistory {
  private undos: Entry[] = [];
  private redos: Entry[] = [];
  private join = false;

  constructor(private store: HistoryStore, private hideSource: (hidden: boolean) => void) {}

  /** A user action changed these documents: one step, unless it is a drag's later move (the first change of a drag is its
   * step) or its end. */
  note(paths: string[], phase: Phase = "typed") {
    if (phase === "move" || phase === "end") return;
    this.redos = [];
    const last = this.undos.at(-1);
    if (this.join && last) {
      for (const p of paths) if (!last.paths.includes(p)) last.paths.push(p);
    } else this.undos.push({ paths: [...new Set(paths)] });
    this.join = false;
  }

  /** An armature was just made. It is a step of its own, or, with `joinNext`, the first part of the step that follows
   * (a drag that made it). */
  created(creation: Creation, joinNext = false) {
    this.redos = [];
    this.undos.push({ paths: [], creation });
    this.join = joinNext;
  }

  /** Steps of a document that was reloaded or removed are no more. */
  forget(path: string) {
    this.undos = this.undos.map((e) => ({ ...e, paths: e.paths.filter((p) => p !== path) })).filter((e) => e.paths.length || e.creation);
    this.redos = this.redos.map((e) => ({ ...e, paths: e.paths.filter((p) => p !== path) })).filter((e) => e.paths.length || e.creation);
  }

  clear() {
    this.undos = [];
    this.redos = [];
    this.join = false;
  }

  /** Undoes the last step that has something to undo; false if there is none. `others` are documents to try when the
   * history has nothing (an edit it never heard of). */
  undo(others: string[] = []): boolean {
    for (let entry = this.undos.pop(); entry; entry = this.undos.pop()) {
      let did = false;
      for (const p of [...entry.paths].reverse()) if (this.store.canUndo(p)) { this.store.undo(p); did = true; }
      if (entry.creation) {
        this.store.restore(entry.creation.flat, entry.creation.flatData);
        this.hideSource(true);
        did = true;
      }
      if (did) {
        this.redos.push(entry);
        return true;
      }
    }
    const loose = others.find((p) => this.store.canUndo(p));
    if (loose === undefined) return false;
    this.store.undo(loose);
    this.redos.push({ paths: [loose] });
    return true;
  }

  redo(others: string[] = []): boolean {
    for (let entry = this.redos.pop(); entry; entry = this.redos.pop()) {
      let did = false;
      if (entry.creation) {
        this.hideSource(false);
        did = true;
      }
      for (const p of entry.paths) if (this.store.canRedo(p)) { this.store.redo(p); did = true; }
      if (did) {
        this.undos.push(entry);
        return true;
      }
    }
    const loose = others.find((p) => this.store.canRedo(p));
    if (loose === undefined) return false;
    this.store.redo(loose);
    this.undos.push({ paths: [loose] });
    return true;
  }
}
