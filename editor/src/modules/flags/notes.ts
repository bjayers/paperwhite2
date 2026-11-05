// The user's notes on the flags and the variables (res/paperwhite2/scripts/notes.json), which the Flag and Var
// Reference and the Script Editor's sidebar show and edit: a flag's by its number, a variable's by its 0x number.

import { useEffect } from "react";
import { documents, useDocuments } from "../../documents.ts";
import { fromPlain, toPlain } from "../../../shared/json.ts";

export const NOTES = "res/paperwhite2/scripts/notes.json";
const NOTES_SCHEMA = "res/paperwhite2/scripts/notes.schema.json";

export type NoteKind = "flag" | "var";

/** A flag's or a variable's key in the notes. */
export const noteKey = (kind: NoteKind, n: number) => (kind === "flag" ? String(n) : `0x${n.toString(16).padStart(4, "0")}`);

export function useNotes(): {
  notes: Record<"flags" | "vars", Record<string, string>>;
  setNote(kind: NoteKind, n: number, text: string): void;
  /** Notes changed since the file was read or saved */
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  save(): Promise<boolean>;
} {
  const { docs } = useDocuments();
  useEffect(() => { if (!documents.get(NOTES)) documents.hold(NOTES).catch(() => undefined); }, []);
  const doc = docs.get(NOTES);
  const plain = doc?.data instanceof Map ? (toPlain(doc.data) as Partial<Record<"flags" | "vars", Record<string, string>>>) : null;
  const notes = { flags: plain?.flags ?? {}, vars: plain?.vars ?? {} };
  const setNote = (kind: NoteKind, n: number, text: string) => {
    const list = kind === "flag" ? "flags" : "vars";
    const key = noteKey(kind, n);
    if (!plain) {
      documents.create(NOTES, NOTES_SCHEMA, fromPlain({ $schema: "notes.schema.json", flags: {}, vars: {}, [list]: text ? { [key]: text } : {} }));
      return;
    }
    const next = { ...(plain[list] ?? {}) };
    if (text) next[key] = text; else delete next[key];
    documents.edit(NOTES, [list], fromPlain(next));
  };
  const save = () => documents.save(NOTES);
  return { notes, setNote, dirty: !!doc?.dirty, saving: !!doc?.saving, saveError: doc?.saveError ?? null, save };
}
