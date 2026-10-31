// The Script Editor: the field scripts (res/field/scripts/<file>.s, docs/scripts.md), a file whole or one of its
// scripts by its number in the file's ScriptEntry table, highlighted (commands that the macros don't have are marked),
// with the help of the command at the cursor and the message it names, editable in the talk window's preview, from the
// text bank the file includes. Reusable: <ScriptEditor file={...} script={...} embedded /> shows one file (and one
// script) without the file list, for other editors' pages.

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import { MessageEditor, useBank } from "../text/TextEditor.tsx";
import { CodeEditor, type Caret } from "./CodeEditor.tsx";
import type { Constants } from "../../../shared/schema.ts";
import { navigate, useToolParams } from "../../navigation.ts";
import { eventLabel, eventsRunning, loadWorld, scriptConstantOf, scriptId, zoneLabel, type World } from "../world/world.ts";
import { loadCommands, replaceScript, scriptEntries, scriptRange, textBankOf, type Command } from "./commands.ts";

const SCRIPTS = "res/field/scripts";

function useScriptFile(path: string | null) {
  const { docs } = useDocuments();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    if (path && !documents.get(path)) documents.hold(path).catch((e: Error) => setError(e.message));
  }, [path]);
  const doc = path ? docs.get(path) : undefined;
  return { text: doc?.text ?? null, dirty: doc?.dirty ?? false, saveError: doc?.saveError ?? null, error };
}

export function ScriptEditor({ file: initialFile, script: initialScript, embedded, constants, open: openFile }: {
  /** A script file's path under res/field/scripts/. */
  file?: string;
  /** A script's number in the file, from 1. */
  script?: number;
  /** Without the file list, inside another editor. */
  embedded?: boolean;
  /** For the files' numbers and the events that run the scripts. */
  constants?: Constants;
  /** Opens a data file in a tab, for the zone links. */
  open?(path: string): void;
} = {}) {
  const [files, setFiles] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [path, setPath] = useState<string | null>(initialFile ?? null);
  const [index, setIndex] = useState<number | null>(initialScript ?? null);
  const [commands, setCommands] = useState<Map<string, Command> | null>(null);
  const [caret, setCaret] = useState<Caret | null>(null);
  const [goTo, setGoTo] = useState<{ line: number } | null>(null);
  const { text, dirty, saveError, error } = useScriptFile(path);
  const [sort, setSort] = useState<"name" | "number">(() => {
    try {
      return localStorage.getItem("script-sort") === "number" ? "number" : "name";
    } catch {
      return "name";
    }
  });
  const [world, setWorld] = useState<World | null>(null);
  const params = useToolParams("scripts");
  useEffect(() => { if (constants?.size) loadWorld(constants).then(setWorld, () => setWorld(null)); }, [constants]);
  // A link from another editor: #tool/scripts?file=...&script=<entry from 1>
  useEffect(() => {
    if (embedded) return;
    const file = params.get("file");
    if (file) { setPath(file); setIndex(Number(params.get("script")) || null); }
  }, [params, embedded]);
  const numberOf = (f: string) => constants?.get(scriptConstantOf(f));
  const { docs } = useDocuments();
  const unsaved = [...docs.values()].filter((d) => d.dirty && (d.path.startsWith(`${SCRIPTS}/`) || d.path.startsWith("res/text/")));

  useEffect(() => { if (!embedded) api.list(`${SCRIPTS}/*.s`).then(setFiles); }, [embedded]);
  useEffect(() => { loadCommands().then(setCommands, () => setCommands(null)); }, []);
  useEffect(() => { if (initialFile) setPath(initialFile); }, [initialFile]);
  useEffect(() => { if (initialScript !== undefined) setIndex(initialScript); }, [initialScript]);

  const entries = useMemo(() => (text ? scriptEntries(text) : []), [text]);
  const entry = index !== null ? entries.find((e) => e.index === index) ?? null : null;
  const range = useMemo(() => (text && entry ? scriptRange(text, entry) : null), [text, entry]);
  const shownText = useMemo(() => {
    if (text === null) return "";
    if (!range) return text;
    return text.split("\n").slice(range.start - 1, range.end).join("\n");
  }, [text, range]);
  const bank = useMemo(() => (text ? textBankOf(text) : null), [text]);
  const { messages } = useBank(bank);
  const summaries = useMemo(() => {
    // Each script's first message, from the file's text bank, to tell them apart
    const out = new Map<number, string>();
    if (!text) return out;
    const byId = new Map((messages ?? []).filter((m) => m.id).map((m) => [m.id!, m.text]));
    for (const e of entries) {
      const r = scriptRange(text, e);
      if (!r) continue;
      const lines = text.split("\n").slice(r.start - 1, r.end);
      const id = lines.map((l) => /\b(\w+_Text_\w+)\b/.exec(l)?.[1]).find((m) => m && byId.has(m));
      const said = id ? byId.get(id)!.replace(/\{[^}]*\}/g, "").replace(/\\n/g, " ").trim() : "";
      out.set(e.index, said ? said.slice(0, 60) : `${lines.length} lines`);
    }
    return out;
  }, [text, entries, messages]);

  const change = (value: string) => {
    if (!path || text === null) return;
    documents.editText(path, range ? replaceScript(text, range, value) : value);
  };

  const save = useCallback(async () => {
    for (const p of documents.dirtyPaths().filter((p) => p.startsWith(`${SCRIPTS}/`) || p.startsWith("res/text/"))) await documents.save(p);
  }, []);

  useEffect(() => {
    if (embedded) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); save(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [save, embedded]);

  // Where a label is: its script and its line in what is shown
  const goToLabel = (label: string) => {
    if (!text) return;
    const lines = text.split("\n");
    const at = lines.findIndex((l) => l.startsWith(`${label}:`));
    if (at < 0) return;
    const line = at + 1;
    if (range && (line < range.start || line > range.end)) {
      const owner = entries.filter((e) => e.line !== null && e.line <= line).sort((a, b) => b.line! - a.line!)[0];
      setIndex(owner ? owner.index : null);
      const r = owner ? scriptRange(text, owner) : null;
      setGoTo({ line: r ? line - r.start + 1 : line });
    } else setGoTo({ line: range ? line - range.start + 1 : line });
  };

  const command = caret && commands?.get(caret.command);
  const isMessage = caret && /_Text_/.test(caret.word);
  const isRef = caret && /^(L|Script|Movement|Conditions|Data)_\w+$/.test(caret.word);
  const shownFiles = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = files.filter((f) => !q || f.includes(q) || String(numberOf(f)) === q);
    return sort === "number" ? [...list].sort((a, b) => (numberOf(a) ?? 1e9) - (numberOf(b) ?? 1e9)) : list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, filter, sort, constants]);
  const zonesOfFile = useMemo(() => (path && world ? world.zones.filter((z) => z.scripts === scriptConstantOf(path)) : []), [path, world]);
  const running = useMemo(() => (path && world && entry ? eventsRunning(world, path, scriptId(path, entry.index)) : []), [path, world, entry]);

  return (
    <div className={`scr-editor${embedded ? " embedded" : ""}`}>
      {!embedded && (
        <header className="scr-header">
          <h2>Script Editor</h2>
          {path && <span className="scr-mono">{path}{dirty && " •"}</span>}
          <span className="spacer" />
          {unsaved.length > 0 && <span className="muted">{unsaved.length} unsaved</span>}
          <button onClick={() => unsaved.forEach((d) => documents.reload(d.path))} disabled={!unsaved.length}>Revert</button>
          <button className="primary" onClick={save} disabled={!unsaved.length} title="Ctrl+S: the scripts and their messages">Save</button>
        </header>
      )}
      {saveError && <div className="scr-error scr-bar">{saveError}</div>}
      <div className={`scr-body${embedded ? " embedded" : ""}`}>
        {!embedded && (
          <div className="scr-files">
            <input className="filter" placeholder={`Filter ${files.length} files by name or number…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
            <label className="scr-sort">Sort
              <select value={sort} onChange={(e) => { const v = e.target.value as "name" | "number"; setSort(v); try { localStorage.setItem("script-sort", v); } catch { /* private window */ } }}>
                <option value="name">by name</option>
                <option value="number">by number</option>
              </select>
            </label>
            <div className="scr-file-list">
              {shownFiles.map((f) => (
                <button key={f} className={`scr-file${f === path ? " selected" : ""}`} onClick={() => { setPath(f); setIndex(null); setCaret(null); }}>
                  <span className="scr-number">{numberOf(f) ?? ""}</span> {f.slice(SCRIPTS.length + 1, -2)}{documents.get(f)?.dirty ? " •" : ""}
                </button>
              ))}
            </div>
          </div>
        )}
        {!path ? (
          <div className="scr-empty muted">
            <p>Choose a script file. A file's scripts are numbered as its <code>ScriptEntry</code> table lists them: the number a zone's
              events and the game call it by. Show the whole file or one script; commands the macros don't know are marked in red.</p>
          </div>
        ) : error ? <p className="scr-error">{error}</p> : text === null ? <p className="muted">Reading…</p> : (
          <>
            <div className="scr-scripts">
              <button className={`scr-script${index === null ? " selected" : ""}`} onClick={() => setIndex(null)}>
                <strong>Whole file</strong> <span className="muted">{text.split("\n").length} lines</span>
              </button>
              {entries.map((e) => (
                <button key={e.index} className={`scr-script${e.index === index ? " selected" : ""}`} onClick={() => { setIndex(e.index); setGoTo(null); }}
                        title={`${e.label}: script ID ${scriptId(path, e.index)}, Frost's ${scriptId(path, e.index) - 1}`}>
                  <strong>{scriptId(path, e.index)}</strong> <span className="muted scr-summary">{summaries.get(e.index) ?? (e.line === null ? "no label" : "")}</span>
                </button>
              ))}
            </div>
            <div className="scr-code">
              <CodeEditor value={shownText} onChange={change} commands={commands} firstLine={range?.start ?? 1}
                          onCaret={setCaret} goToLine={goTo?.line ?? null} key={`${path}:${index ?? "file"}`} />
            </div>
            <div className="scr-side">
              {zonesOfFile.length > 0 && (
                <p className="muted scr-note">The file of {zonesOfFile.map((z, i) => (
                  <span key={z.name}>{i ? ", " : ""}{openFile ? <button className="link" onClick={() => openFile(z.path)}>{zoneLabel(z.name)}</button> : zoneLabel(z.name)}</span>
                ))}{text && textBankOf(text) && <> · <button className="link" onClick={() => navigate("text", { bank: textBankOf(text)! })}>its text</button></>}</p>
              )}
              {entry && (
                <div className="scr-entry">
                  <p className="scr-note"><strong>Script ID {scriptId(path, entry.index)}</strong> <span className="muted">(Frost's {scriptId(path, entry.index) - 1}) · <code>{entry.label}</code>, lines {range?.start}–{range?.end}</span></p>
                  {world ? (
                    running.length ? (
                      <ul className="scr-running">
                        {running.map((ev) => (
                          <li key={`${ev.zone}:${ev.kind}:${ev.index}`}>
                            {openFile ? <button className="link" onClick={() => openFile(`res/field/events/${ev.zone}.json`)}>{zoneLabel(ev.zone)}</button> : zoneLabel(ev.zone)}: {eventLabel(ev)}
                          </li>
                        ))}
                      </ul>
                    ) : <p className="muted scr-note">No NPC, background event, trigger or level script runs it (another script may call it).</p>
                  ) : <p className="muted scr-note">Reading the zones' events…</p>}
                </div>
              )}
              {caret ? (
                <>
                  <p className="muted scr-note">Line {caret.line}</p>
                  {command ? (
                    <div className="scr-help"><code>{command.name}</code> {command.params.length ? <span className="muted">({command.params.join(", ")})</span> : <span className="muted">no parameters</span>}</div>
                  ) : caret.command && commands && !commands.has(caret.command) && !/:$/.test(caret.command) ? (
                    <div className="scr-error scr-note">No command {caret.command} in field_script.inc.</div>
                  ) : null}
                  {isRef && <button className="link" onClick={() => goToLabel(caret.word)}>Go to {caret.word}</button>}
                  {isMessage && bank && <MessageEditor path={bank} id={caret.word} />}
                  {isMessage && !bank && <p className="muted scr-note">The file includes no text bank.</p>}
                </>
              ) : <p className="muted scr-note">Click a line: its command's parameters show here, and a message's ID shows the message in the talk window, to edit.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
