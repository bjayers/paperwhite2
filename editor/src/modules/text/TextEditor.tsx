// The Text Editor: every text bank, the story's and the rest, each message with its file's line number, searchable in
// one bank or in all of them, edited with a preview of the talk window as the game draws it (TextBox.tsx). Reusable:
// <TextEditor bank={...} line={...} /> opens on a message, and <MessageEditor path={...} line={...} /> is one
// message's editor and preview alone, for other editors (scripts, trainers) to show inside their own pages.

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import type { ScanMatch } from "../../../shared/api.ts";
import { listBanks, parseBank, setMessage, MISC, STORY, type Bank, type Message } from "./banks.ts";
import { fromEditable, toEditable } from "./message.ts";
import { TextBox } from "./TextBox.tsx";

/** A bank's file, held through the document store: its messages, and whether it has unsaved changes. */
export function useBank(path: string | null): { messages: Message[] | null; text: string | null; dirty: boolean; error: string | null } {
  const { docs } = useDocuments();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    if (path && !documents.get(path)) documents.hold(path).catch((e: Error) => setError(e.message));
  }, [path]);
  const doc = path ? docs.get(path) : undefined;
  const messages = useMemo(() => (doc ? parseBank(doc.text) : null), [doc?.text]);
  return { messages, text: doc?.text ?? null, dirty: doc?.dirty ?? false, error };
}

/** Changes one message of a held bank, as one undo step. */
export function editMessage(path: string, line: number, editable: string) {
  const doc = documents.get(path);
  if (doc) documents.editText(path, setMessage(doc.text, line, fromEditable(editable)));
}

/** One message's editor and its preview, by its bank and line: for other editors' pages. */
export function MessageEditor({ path, line, id }: { path: string; line?: number; id?: string }) {
  const { messages, dirty, error } = useBank(path);
  const message = messages?.find((m) => (line !== undefined ? m.line === line : m.id === id));
  if (error) return <p className="txt-error">{path}: {error}</p>;
  if (!messages) return <p className="muted">Reading {path}…</p>;
  if (!message || message.id === null) return <p className="muted">{path} has no message {id ?? `on line ${line}`}.</p>;
  return (
    <div className="txt-message-editor">
      <div className="muted txt-where">{path.slice(path.lastIndexOf("/") + 1)}, line {message.line}: <code>{message.id}</code>
        {dirty && <> · unsaved <button className="link" onClick={() => documents.save(path)}>save</button></>}</div>
      <textarea className="txt-edit" value={toEditable(message.text)} rows={Math.max(3, toEditable(message.text).split("\n").length + 1)}
                onChange={(e) => editMessage(path, message.line, e.target.value)} spellCheck />
      <TextBox text={message.text} />
    </div>
  );
}

const CODES_HELP = "{be01}: wait for A, then the next line scrolls · {be00}: wait for A, then a new box · " +
  "{ff00:1} red, {ff00:2} blue, {ff00:0} back · {0100:n} a word the script fills in · a line break is a new line";

export function TextEditor({ bank: initialBank, line: initialLine }: { bank?: string; line?: number } = {}) {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [path, setPath] = useState<string | null>(initialBank ?? null);
  const [chosen, setChosen] = useState<number | null>(initialLine ?? null);
  const [bankFilter, setBankFilter] = useState("");
  const [lineFilter, setLineFilter] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ScanMatch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const { messages, dirty, error } = useBank(path);
  const { docs } = useDocuments();

  useEffect(() => { listBanks().then(setBanks); }, []);
  useEffect(() => { if (initialBank) setPath(initialBank); if (initialLine) setChosen(initialLine); }, [initialBank, initialLine]);

  const search = async () => {
    const q = query.trim();
    if (!q) return setResults(null);
    setSearching(true);
    const pattern = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    try {
      setResults(await api.scan("res/text/**/*.txt", pattern, { ignoreCase: true, limit: 500 }));
    } finally {
      setSearching(false);
    }
  };

  const save = useCallback(async () => {
    for (const p of documents.dirtyPaths().filter((p) => p.startsWith("res/text/"))) await documents.save(p);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") { e.preventDefault(); e.stopPropagation(); save(); }
      else if ((key === "z" || key === "y") && path && (e.target as HTMLElement).tagName !== "TEXTAREA") {
        e.preventDefault(); e.stopPropagation();
        if (key === "y" || e.shiftKey) documents.redo(path); else documents.undo(path);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [save, path]);

  const shownBanks = useMemo(() => {
    const q = bankFilter.trim().toLowerCase();
    return banks.filter((b) => !q || b.name.includes(q));
  }, [banks, bankFilter]);
  const shownLines = useMemo(() => {
    const q = lineFilter.trim().toLowerCase();
    return (messages ?? []).filter((m) => !q || m.text.toLowerCase().includes(q) || (m.id ?? "").toLowerCase().includes(q));
  }, [messages, lineFilter]);
  const message = messages?.find((m) => m.line === chosen) ?? null;
  const unsaved = [...docs.values()].filter((d) => d.dirty && d.path.startsWith("res/text/"));

  const open = (p: string, line?: number) => {
    setPath(p);
    setChosen(line ?? null);
    setLineFilter("");
  };

  return (
    <div className="txt-editor">
      <header className="txt-header">
        <h2>Text Editor</h2>
        <form className="txt-search" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <input className="filter" placeholder="Search every bank…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="submit" disabled={searching}>{searching ? "Searching…" : "Search"}</button>
          {results && <button type="button" className="link" onClick={() => setResults(null)}>close results</button>}
        </form>
        <span className="spacer" />
        {unsaved.length > 0 && <span className="muted">{unsaved.length} unsaved</span>}
        <button onClick={() => unsaved.forEach((d) => documents.reload(d.path))} disabled={!unsaved.length}>Revert</button>
        <button className="primary" onClick={save} disabled={!unsaved.length} title="Ctrl+S">Save</button>
      </header>
      {unsaved.filter((d) => d.saveError).map((d) => <div key={d.path} className="txt-error txt-bar">{d.path}: {d.saveError}</div>)}
      <div className="txt-body">
        <div className="txt-banks">
          <input className="filter" placeholder={`Filter ${banks.length} banks…`} value={bankFilter} onChange={(e) => setBankFilter(e.target.value)} />
          <div className="txt-bank-list">
            {(["story", "misc"] as const).map((kind) => (
              <div key={kind}>
                <div className="txt-group">{kind === "story" ? "Story (scripts' text)" : "Misc (system text)"}
                  <span className="muted"> {shownBanks.filter((b) => b.kind === kind).length}</span></div>
                {shownBanks.filter((b) => b.kind === kind).map((b) => (
                  <button key={b.path} className={`txt-bank${b.path === path ? " selected" : ""}`} onClick={() => open(b.path)}>
                    {b.name}{docs.get(b.path)?.dirty ? " •" : ""}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="txt-main">
          {results ? (
            <div className="txt-results">
              <p className="muted">{results.length}{results.length === 500 ? "+" : ""} messages with “{query}”</p>
              {results.map((r) => (
                <button key={`${r.path}:${r.line}`} className="txt-result" onClick={() => { open(r.path, r.line); setResults(null); }}>
                  <span className="muted">{r.path.replace(`${STORY}/`, "story/").replace(`${MISC}/`, "misc/")}:{r.line}</span>
                  <span>{r.text.slice(r.text.indexOf(" = ") + 3)}</span>
                </button>
              ))}
            </div>
          ) : !path ? (
            <div className="txt-empty muted">
              <p>Choose a bank on the left, or search every bank. Story banks are the scripts' text, named after their zone or global
                script file; misc banks are the rest of the game's text.</p>
              <p>{CODES_HELP}</p>
            </div>
          ) : error ? <p className="txt-error">{error}</p> : (
            <div className="txt-bank-view">
              <div className="txt-lines">
                <div className="txt-lines-tools">
                  <strong>{path.slice(path.lastIndexOf("/") + 1)}</strong>{dirty && <span className="muted"> · unsaved</span>}
                  <input className="filter" placeholder="Filter this bank…" value={lineFilter} onChange={(e) => setLineFilter(e.target.value)} />
                </div>
                <div className="txt-line-list">
                  {shownLines.map((m) => (
                    <button key={m.line} className={`txt-line${m.line === chosen ? " selected" : ""}${m.id ? "" : " other"}`}
                            onClick={() => m.id && setChosen(m.line)} ref={m.line === chosen ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}>
                      <span className="txt-number">{m.line}</span>
                      <span className="txt-text">{m.id ? m.text.replace(/\\n/g, " ⏎ ") : m.text}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="txt-detail">
                {message && message.id ? (
                  <>
                    <div className="muted txt-where">Line {message.line}: <code>{message.id}</code></div>
                    <textarea className="txt-edit" value={toEditable(message.text)}
                              rows={Math.max(4, toEditable(message.text).split("\n").length + 1)}
                              onChange={(e) => editMessage(path, message.line, e.target.value)} spellCheck />
                    <TextBox text={message.text} />
                    <p className="muted txt-help">{CODES_HELP}</p>
                  </>
                ) : <p className="muted">Choose a message to edit it and see it in the talk window.</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
