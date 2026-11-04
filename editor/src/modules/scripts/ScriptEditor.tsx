// The Script Editor: the field scripts (res/field/scripts/<file>.s, docs/scripts.md), a file whole or one of its
// scripts by its number in the file's ScriptEntry table, highlighted (commands that the macros don't have are marked),
// with the help of the command at the cursor and the message it names, editable in the talk window's preview, from the
// text bank the file includes. A script shows in the script language too (lang.ts, LangSide.tsx;
// docs/paperwhite2/design/script-language.md): written there, Apply puts it back into its block of the .s after the
// checks, Restore takes it back to the original game's or the last commit's, and the sidebar documents the call at the
// caret with its argument's choices. Reusable: <ScriptEditor file={...} script={...} embedded /> shows one file (and
// one script) without the file list, for other editors' pages.

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import { MessageEditor, useBank } from "../text/TextEditor.tsx";
import { CodeEditor, type Caret } from "./CodeEditor.tsx";
import type { Constants } from "../../../shared/schema.ts";
import { navigate, useToolParams } from "../../navigation.ts";
import { eventLabel, eventsRunning, loadWorld, scriptConstantOf, scriptId, zoneLabel, type World } from "../world/world.ts";
import { loadCommands, replaceScript, scriptEntries, scriptRange, textBankOf, type Command } from "./commands.ts";
import { addScript, applyScript, callAt, highlightLang, langEnv, loadReference, outline, restoreScript, showScript } from "./lang.ts";
import { LangSide } from "./LangSide.tsx";
import { parseScript } from "../../../shared/scriptlang/lang.ts";
import { messageIds, messageTexts } from "../../../shared/scriptlang/values.ts";
import { SHORTCUT_NAMES } from "../../../shared/scriptlang/shortcuts.ts";
import type { Reference } from "./lang.ts";

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
  const { messages, text: bankText } = useBank(bank);

  // The script language's view of the chosen script: its translation, the user's draft of it, and what Apply did
  const [mode, setMode] = useState<"lang" | "s">(() => {
    try { return localStorage.getItem("script-mode") === "s" ? "s" : "lang"; } catch { return "lang"; }
  });
  const [reference, setReference] = useState<Reference | null>(null);
  useEffect(() => { loadReference().then(setReference, () => setReference({ commands: [], globals: [], movements: [] })); }, []);
  const env = useMemo(() => (commands && reference && constants
    ? langEnv(commands.keys(), reference, constants, bankText ? messageIds(bankText) : [], bankText ? messageTexts(bankText) : undefined) : null),
  [commands, reference, constants, bankText]);
  const langOn = mode === "lang" && entry !== null && env !== null && text !== null;
  const shownLang = useMemo(() => (langOn ? showScript(text!, entry!.index, env!) : null), [langOn, text, entry, env]);
  const [drafts, setDrafts] = useState<Map<string, { from: string; text: string }>>(new Map());
  const draftKey = path && entry ? `${path}:${entry.index}` : "";
  const draft = drafts.get(draftKey);
  // (a draft holds while the translation it started from does)
  const langText = draft && draft.from === shownLang ? draft.text : shownLang ?? "";
  const langDirty = shownLang !== null && langText !== shownLang;
  const setLangText = (value: string) => setDrafts((d) => new Map(d).set(draftKey, { from: shownLang ?? "", text: value }));
  const [langNote, setLangNote] = useState<{ kind: "ok" | "error" | "warning"; text: string; detail?: string; reads?: string } | null>(null);
  useEffect(() => setLangNote(null), [draftKey]);
  const parseError = useMemo(() => {
    if (!langOn) return null;
    try { parseScript(langText); return null; } catch (e) { return (e as Error).message; }
  }, [langOn, langText]);
  const [textOpen, setTextOpen] = useState(false);
  // The routines and aliases the script can name, for the highlighting and the sidebar
  const named = useMemo(() => (langOn ? outline(text!, entry!.index, langText) : undefined), [langOn, text, entry, langText]);
  const highlight = useCallback((line: string) => highlightLang(line, (name) => !!env && (env.names.toMacro.has(name) || env.names.globals.has(name) || SHORTCUT_NAMES.has(name)
    || env.names.movements.has(name) || /^action_\d+$/.test(name)), named), [env, named]);

  /** The draft put back into the .s, after the checks; FALSE where it wasn't. */
  const apply = (): boolean => {
    if (!path || text === null || !entry || !env) return false;
    const result = applyScript(text, entry.index, langText, env);
    if (!result.ok) {
      setLangNote({ kind: "error", text: result.line ? `${result.error}` : result.error, detail: result.detail });
      if (result.line) setGoTo({ line: result.line });
      return false;
    }
    documents.editText(path, result.text);
    setDrafts((d) => new Map(d).set(draftKey, { from: result.reads, text: result.reads }));
    setLangNote(result.same
      ? { kind: "ok", text: "Applied: it reads back as written, and runs as written. Save writes the file." }
      : { kind: "ok", text: "Applied: it runs as written, and reads back tidied (its jumps as if and else). Save writes the file.", reads: result.reads });
    return true;
  };
  const restore = async (rev: "w2-original" | "HEAD") => {
    if (!path || text === null || !entry) return;
    const what = rev === "HEAD" ? "the last commit's" : "the original game's";
    if (!window.confirm(`Put script ${scriptId(path, entry.index)} back as ${what}? Its changes since are lost (until you Revert without saving).`)) return;
    try {
      const other = await api.fileAt(rev, path);
      const result = restoreScript(text, entry.index, other);
      if ("error" in result) { setLangNote({ kind: "error", text: result.error }); return; }
      documents.editText(path, result.text);
      setDrafts((d) => { const n = new Map(d); n.delete(draftKey); return n; });
      setLangNote({ kind: "ok", text: `Restored to ${what}. Save writes the file.` });
    } catch (e) {
      setLangNote({ kind: "error", text: rev === "w2-original" ? "The original game's file has no such script (it's one the hack added)" : (e as Error).message });
    }
  };
  const newScript = () => {
    if (!path || text === null) return;
    if (/\/global_\d+\.s$/.test(path) && !window.confirm("A global script file's IDs are a fixed range (docs/paperwhite2/plugins.md, Adding global scripts): a script past it needs its range raised. Add one anyway?")) return;
    const added = addScript(text);
    documents.editText(path, added.text);
    setIndex(added.number);
    setMode("lang");
  };
  const langCaret = useMemo(() => {
    if (!langOn || !caret) return null;
    const line = langText.split("\n")[caret.line - 1] ?? "";
    // (and the word at it, for an alias)
    const word = [...line.matchAll(/[A-Za-z_]\w*/g)].find((w) => caret.column >= w.index && caret.column <= w.index + w[0].length)?.[0] ?? null;
    return { line: caret.line, text: line, call: callAt(line, caret.column), word };
  }, [langOn, caret, langText]);
  /** Puts text in place of the call's name at the caret (a movement's step). */
  const replaceSpan = (value: string) => {
    if (!langCaret?.call || langCaret.call.arg !== -1) return;
    const { start, end } = langCaret.call;
    const lines = langText.split("\n");
    const line = lines[langCaret.line - 1];
    lines[langCaret.line - 1] = `${line.slice(0, start)}${value}${line.slice(start, end).match(/\s*$/)![0]}${line.slice(end)}`;
    setLangText(lines.join("\n"));
  };
  /** Adds a step at the end of the movement in the argument at the caret, or makes the argument one. */
  const addStep = (name: string) => {
    const t = langCaret?.call?.argText ?? "";
    insertArg(t.startsWith("[") && t.endsWith("]") ? (t.slice(1, -1).trim() ? `${t.slice(0, -1)}, ${name}]` : `[${name}]`) : `[${name}]`);
  };
  /** Puts text in place of the argument at the caret, keeping the spaces round it. */
  const insertArg = (value: string) => {
    if (!langCaret?.call || langCaret.call.arg < 0) return;
    const { start, end } = langCaret.call;
    const lines = langText.split("\n");
    const line = lines[langCaret.line - 1];
    const old = line.slice(start, end);
    lines[langCaret.line - 1] = `${line.slice(0, start)}${/^\s*/.exec(old)![0]}${value}${/\s*$/.exec(old)![0]}${line.slice(end)}`;
    setLangText(lines.join("\n"));
  };
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
    // (the language's draft applied first; nothing is saved where it can't be)
    if (langOn && langDirty && !apply()) return;
    for (const p of documents.dirtyPaths().filter((p) => p.startsWith(`${SCRIPTS}/`) || p.startsWith("res/text/") || p.startsWith("res/paperwhite2/scripts/"))) await documents.save(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langOn, langDirty, langText, text, entry, env, path]);

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
          <button onClick={() => { unsaved.forEach((d) => documents.reload(d.path)); setDrafts(new Map()); }} disabled={!unsaved.length && !langDirty}>Revert</button>
          <button className="primary" onClick={save} disabled={!unsaved.length && !langDirty} title="Ctrl+S: the scripts and their messages (a script's draft applied first)">Save</button>
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
                  <strong>{scriptId(path, e.index)}{drafts.has(`${path}:${e.index}`) && drafts.get(`${path}:${e.index}`)!.text !== drafts.get(`${path}:${e.index}`)!.from ? " •" : ""}</strong>
                  <span className="muted scr-summary">{summaries.get(e.index) ?? (e.line === null ? "no label" : "")}</span>
                </button>
              ))}
              <button className="scr-script scr-add" onClick={newScript} title="A new script after the last, which the file's ScriptEntry table lists">+ New script</button>
            </div>
            <div className="scr-code">
              {entry && (
                <div className="scr-lang-bar">
                  <span className="view-switch">
                    <button className={mode === "lang" ? "active" : ""} onClick={() => { setMode("lang"); try { localStorage.setItem("script-mode", "lang"); } catch { /* private window */ } }}
                            title="The script in the script language">Script</button>
                    <button className={mode === "s" ? "active" : ""} onClick={() => { setMode("s"); try { localStorage.setItem("script-mode", "s"); } catch { /* private window */ } }}
                            title="Its lines of the .s file, as the build reads them">.s</button>
                  </span>
                  {langOn && (
                    <>
                      <button className="primary" onClick={apply} disabled={!langDirty || !!parseError}
                              title="Puts it into its block of the .s, after checking it reads and runs back as written">Apply</button>
                      {langDirty && <span className="muted small">not applied</span>}
                      <button onClick={() => setTextOpen(!textOpen)} disabled={!bank} className={textOpen ? "active" : ""}>Text file</button>
                      <span className="spacer" />
                      <select value="" onChange={(e) => { const v = e.target.value as "HEAD" | "w2-original"; e.target.value = ""; if (v) void restore(v); }}
                              title="Puts this script back as it was">
                        <option value="">Restore…</option>
                        <option value="HEAD">to the last commit</option>
                        <option value="w2-original">to the original game</option>
                      </select>
                    </>
                  )}
                </div>
              )}
              {langOn && parseError && <div className="scr-error scr-bar">{parseError}</div>}
              {langOn && langNote && (
                <div className={`${langNote.kind === "error" ? "scr-error" : "scr-ok"} scr-bar`}>{langNote.text}
                  {langNote.detail && <div className="small">{langNote.detail}</div>}
                  {langNote.reads && <details><summary className="small">How it reads back</summary><pre className="scr-reads">{langNote.reads}</pre></details>}
                </div>
              )}
              {langOn ? (
                <CodeEditor value={langText} onChange={setLangText} commands={commands} highlight={highlight}
                            onCaret={setCaret} goToLine={goTo?.line ?? null} key={`${path}:${index}:lang`} />
              ) : (
                <CodeEditor value={shownText} onChange={change} commands={commands} firstLine={range?.start ?? 1}
                            onCaret={setCaret} goToLine={goTo?.line ?? null} key={`${path}:${index ?? "file"}`} />
              )}
              {langOn && textOpen && bank && (
                <TextWindow bank={bank} onClose={() => setTextOpen(false)}
                            onPick={(line) => { if (langCaret?.call && langCaret.call.arg >= 0) insertArg(String(line)); }} />
              )}
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
              {langOn && env ? (
                <LangSide call={langCaret?.call ?? null} word={langCaret?.word ?? null} named={named} env={env} bank={bank} onInsert={insertArg} onOpenText={() => setTextOpen(true)}
                          onReplaceName={(name) => replaceSpan(name)} onAddStep={addStep} />
              ) : caret ? (
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

/** The file's text bank over the code: each message by its line number (as the script language names it), filtered;
 * a click shows it to edit, Use puts its number in the argument at the caret. */
function TextWindow({ bank, onClose, onPick }: { bank: string; onClose(): void; onPick(line: number): void }) {
  const { messages } = useBank(bank);
  const [filter, setFilter] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const list = useMemo(() => (messages ?? []).filter((m) => m.id).map((m, i) => ({ ...m, number: i })), [messages]);
  const q = filter.trim().toLowerCase();
  const shown = q ? list.filter((m) => String(m.number) === q || m.text.toLowerCase().includes(q) || m.id!.toLowerCase().includes(q)) : list;
  return (
    <div className="scr-text-window">
      <div className="scr-section-head">
        <strong>{bank.slice(bank.lastIndexOf("/") + 1)}</strong> <span className="muted small">{list.length} lines</span>
        <span className="spacer" />
        <button onClick={() => navigate("text", { bank })}>Open in the Text Editor</button>
        <button onClick={onClose}>Close</button>
      </div>
      <input className="filter" placeholder="Filter by line, text or ID…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="scr-text-list">
        {shown.map((m) => (
          <div key={m.id} className={`scr-text-line${chosen === m.id ? " selected" : ""}`} onClick={() => setChosen(m.id)}>
            <span className="scr-number">{m.number}</span>
            <span className="scr-text-preview">{m.text.replace(/\{[^}]*\}/g, " ").replace(/\\n/g, " ").trim() || <span className="muted">empty</span>}</span>
            <button className="link" onClick={(e) => { e.stopPropagation(); onPick(m.number); }} title="Put this line's number in the argument at the caret">Use</button>
          </div>
        ))}
      </div>
      {chosen && <MessageEditor path={bank} id={chosen} />}
    </div>
  );
}
