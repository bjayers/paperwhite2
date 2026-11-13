// What the Move Editor and the Ability Editor share: running a change of tools/paperwhite2/moves.py or abilities.py
// (it writes res/ and generated/ itself, so nothing it touches may be unsaved, and the files it changed are read
// again), a dry run's text, the editors' header with Save and Revert, and their keys.

import { useCallback, useEffect, type ReactNode } from "react";
import type { EntryChange } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import { useToolActive } from "../active.ts";
import { summarize } from "../pokemon/FormPage.tsx";

/** Runs an Add, Remove or Retire after checking that no file under the prefixes is unsaved, then reads its files
 * again; alerts and gives null on a refusal. */
export async function applyEntryChange(run: () => Promise<EntryChange>, prefixes: string[]): Promise<EntryChange | null> {
  const unsaved = documents.dirtyPaths().filter((p) => prefixes.some((prefix) => p.startsWith(prefix)));
  if (unsaved.length) {
    alert(`Save or revert your changes first (${unsaved.length} file${unsaved.length === 1 ? "" : "s"}: ${unsaved.slice(0, 3).join(", ")}${unsaved.length > 3 ? "…" : ""}): this writes the files on disk.`);
    return null;
  }
  let result: EntryChange;
  try {
    result = await run();
  } catch (e) {
    alert((e as Error).message);
    return null;
  }
  if (!result.check) for (const path of [...result.changed, ...result.removed]) if (documents.get(path)) await documents.reload(path);
  return result;
}

/** "Would add Test Move… Writes 2 files: …" for a dry run. */
export function planText(r: EntryChange): string {
  const parts = [`${r.message}.`];
  if (r.removed.length) parts.push(`Deletes ${summarize(r.removed)}.`);
  if (r.changed.length) parts.push(`Writes ${r.changed.length} file${r.changed.length === 1 ? "" : "s"}: ${summarize(r.changed)}.`);
  return parts.join(" ");
}

/** An editor's header: its title, the unsaved count, Revert and Save; Ctrl+S saves and Ctrl+Z / Ctrl+Y undo and redo
 * the shown file while its tool is the active one. */
export function EntryHeader({ title, prefix, undoPath, onSaved }: { title: string; prefix: string; undoPath: string | null; onSaved(): void }) {
  const toolActive = useToolActive();
  const { docs } = useDocuments();
  const unsaved = [...docs.values()].filter((d) => d.dirty && d.path.startsWith(prefix));
  const save = useCallback(async () => {
    const paths = documents.dirtyPaths().filter((p) => p.startsWith(prefix));
    for (const p of paths) await documents.save(p);
    if (paths.length) onSaved();
  }, [prefix, onSaved]);
  useEffect(() => {
    if (!toolActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") { e.preventDefault(); e.stopPropagation(); void save(); }
      else if ((key === "z" || key === "y") && undoPath && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault(); e.stopPropagation();
        if (key === "y" || e.shiftKey) documents.redo(undoPath); else documents.undo(undoPath);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [save, undoPath, toolActive]);
  return (
    <>
      <header className="pkm-header">
        <h2>{title}</h2>
        <span className="spacer" />
        {unsaved.length > 0 && <span className="muted">{unsaved.length} unsaved</span>}
        <button onClick={() => unsaved.forEach((d) => documents.reload(d.path))} disabled={!unsaved.length}>Revert</button>
        <button className="primary" onClick={save} disabled={!unsaved.length} title="Ctrl+S">Save</button>
      </header>
      {unsaved.filter((d) => d.saveError).map((d) => <div key={d.path} className="pkm-error pkm-bar">{d.path}: {d.saveError}</div>)}
    </>
  );
}

/** A headed section of a page: its title, a one-line summary, its actions at the top, then its rows. */
export function Section({ title, summary, actions, children }: { title: string; summary?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="pkm-card mv-section">
      <div className="pkm-card-head">
        <h3>{title}{summary !== undefined && <span className="muted mv-summary"> {summary}</span>}</h3>
        <span className="spacer" />
        {actions}
      </div>
      {children}
    </section>
  );
}

/** The name field: its length against the limit the summary and the battle menu fit. */
export function NameInput({ value, limit, onChange }: { value: string; limit: number; onChange(v: string): void }) {
  return (
    <div className="pkm-inline mv-name">
      <input value={value} onChange={(e) => onChange(e.target.value)} />
      <span className={value.length > limit ? "pkm-error" : "muted"}>{value.length}/{limit}</span>
    </div>
  );
}

/** The description: its line breaks as real ones, each line's length shown. */
export function DescriptionInput({ value, onChange }: { value: string; onChange(v: string): void }) {
  const lines = value.split("\n");
  return (
    <div className="mv-description">
      <textarea rows={Math.max(3, lines.length)} value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="muted small">{lines.length} line{lines.length === 1 ? "" : "s"}, the longest {Math.max(...lines.map((l) => l.length))} characters</span>
    </div>
  );
}
