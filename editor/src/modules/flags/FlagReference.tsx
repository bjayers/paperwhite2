// The Flag and Var Reference: every event flag and saved variable, with its name where it has one, whether the game or
// the hack uses it (tools/paperwhite2/flag_usage.py and var_usage.py, through /api/usage), the comment that documents
// it in generated/flags.txt or vars.txt, the user's own note (notes.ts), and where it's used. It edits nothing but the
// notes. Reusable: <FlagReference compact onInsert={...} /> is the Script Editor's window, whose Put in button sends
// the chosen one as the script language writes it.

import { useEffect, useMemo, useState } from "react";
import { api } from "../../api.ts";
import { navigate } from "../../navigation.ts";
import type { Usage, UsageKind, UsageRow } from "../../../server/usage.ts";
import { noteKey, useNotes } from "./notes.ts";

// A name that only says its number, as the generated lists bootstrap them
const UNNAMED = /^EVENT_(FLAG|WORK)(_DAILY)?_0x[0-9a-f]+$/i;

const STATUS_LABELS: Record<string, string> = {
  used: "Used",
  range: "In a range",
  "indirect-candidate": "Maybe, through a variable",
  unused: "Unused",
};

type Show = "all" | "used" | "unused" | "named" | "documented" | "noted";

const SHOWS: { value: Show; label: string }[] = [
  { value: "all", label: "All" },
  { value: "used", label: "Used" },
  { value: "unused", label: "Unused" },
  { value: "named", label: "Named" },
  { value: "documented", label: "Documented" },
  { value: "noted", label: "With my note" },
];

const hexOf = (kind: UsageKind, n: number) => `0x${n.toString(16).padStart(kind === "vars" ? 4 : 3, "0")}`;

export function FlagReference({ compact, onInsert, onClose, open }: {
  /** The Script Editor's window: smaller, with Close */
  compact?: boolean;
  /** Puts the chosen flag or variable in the script, as the language writes it (a flag's number, var(0x...)) */
  onInsert?(text: string): void;
  onClose?(): void;
  /** Opens a data file in a tab */
  open?(path: string): void;
}) {
  const [kind, setKind] = useState<UsageKind>("flags");
  const [usage, setUsage] = useState<Partial<Record<UsageKind, Usage>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [region, setRegion] = useState("");
  const [chosen, setChosen] = useState<number | null>(null);
  const { notes, setNote } = useNotes();
  const noteList = notes[kind === "flags" ? "flags" : "vars"];
  const noteKind = kind === "flags" ? "flag" : "var";

  const load = (k: UsageKind, again = false) => {
    setLoading(true);
    setError(null);
    api.usage(k, again).then((u) => setUsage((all) => ({ ...all, [k]: u })), (e: Error) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { if (!usage[kind]) load(kind); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  // (Escape closes the window)
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const data = usage[kind];
  const regions = useMemo(() => [...new Set((data?.rows ?? []).map((r) => r.region).filter(Boolean))], [data]);
  const docOf = (r: UsageRow) => data?.docs[r.name];
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => {
      if (region && r.region !== region) return false;
      const named = !UNNAMED.test(r.name);
      const note = noteList[noteKey(noteKind, r.number)];
      if (show === "used" && r.status === "unused") return false;
      if (show === "unused" && r.status !== "unused") return false;
      if (show === "named" && !named) return false;
      if (show === "documented" && !docOf(r)) return false;
      if (show === "noted" && !note) return false;
      if (!q) return true;
      return String(r.number) === q || hexOf(kind, r.number) === q || `0x${r.number.toString(16)}` === q || r.name.toLowerCase().includes(q)
        || (note ?? "").toLowerCase().includes(q) || (docOf(r) ?? "").toLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filter, show, region, noteList, kind]);
  const row = data?.rows.find((r) => r.number === chosen) ?? null;

  return (
    <div className={`fr${compact ? " fr-compact" : ""}`}>
      <div className="fr-head">
        <span className="view-switch">
          <button className={kind === "flags" ? "active" : ""} onClick={() => { setKind("flags"); setChosen(null); setRegion(""); }}>Flags</button>
          <button className={kind === "vars" ? "active" : ""} onClick={() => { setKind("vars"); setChosen(null); setRegion(""); }}>Variables</button>
        </span>
        <input className="filter" placeholder="Filter by number, 0x number, name or note…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <select value={show} onChange={(e) => setShow(e.target.value as Show)} title="Which to list">
          {SHOWS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {regions.length > 0 && (
          <select value={region} onChange={(e) => setRegion(e.target.value)} title="What resets it, or what it is">
            <option value="">Every region</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        <span className="spacer" />
        <button onClick={() => load(kind, true)} disabled={loading} title="Looks through the scripts, the data and the code again">
          {loading ? "Looking…" : "Look again"}</button>
        {onClose && <button onClick={onClose}>Close</button>}
      </div>
      {error && <p className="notice error">{error}</p>}
      <div className="fr-body">
        <div className="fr-list">
          {!data ? <p className="muted fr-note">{loading ? "Looking through the scripts, the data and the code (a few seconds)…" : ""}</p> : (
            <>
              <div className="muted small fr-count">{shown.length} of {data.rows.length}</div>
              {shown.map((r) => {
                const note = noteList[noteKey(noteKind, r.number)];
                return (
                  <button key={r.number} className={`fr-row${r.number === chosen ? " selected" : ""}`} onClick={() => setChosen(r.number)}>
                    <span className="fr-number">{kind === "flags" ? r.number : hexOf(kind, r.number)}</span>
                    <span className="fr-hex muted">{kind === "flags" ? hexOf(kind, r.number) : r.number}</span>
                    <span className={`fr-status fr-${r.status}`}>{STATUS_LABELS[r.status] ?? r.status}</span>
                    <span className="fr-name">{UNNAMED.test(r.name) ? <span className="muted">no name</span> : <code>{r.name}</code>}
                      {(note || docOf(r)) && <span className="muted small fr-snippet"> {note ?? docOf(r)}</span>}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
        <div className="fr-side">
          {!row ? <p className="muted fr-note">Click a {kind === "flags" ? "flag" : "variable"}: its name, where it's used, its documentation and your note show here.</p> : (
            <>
              <section className="fr-section">
                <h3>{kind === "flags" ? `Flag ${row.number}` : `Variable ${hexOf(kind, row.number)}`} <span className="muted small">{kind === "flags" ? hexOf(kind, row.number) : row.number}</span></h3>
                <div className="fr-fields">
                  <span className="muted">Name</span><span>{UNNAMED.test(row.name) ? <span className="muted">none yet</span> : <code>{row.name}</code>}</span>
                  <span className="muted">Status</span><span className={`fr-status fr-${row.status}`}>{STATUS_LABELS[row.status] ?? row.status}</span>
                  {row.region && <><span className="muted">Region</span><span>{row.region}</span></>}
                  <span className="muted">In a script</span><code>{kind === "flags" ? `flag(${row.number})` : `var(${hexOf(kind, row.number)})`}</code>
                </div>
                {onInsert && (
                  <button className="primary" onClick={() => onInsert(kind === "flags" ? String(row.number) : `var(${hexOf(kind, row.number)})`)}
                          title="Puts it in the argument at the caret">Put in the script</button>
                )}
              </section>
              {docOf(row) && (
                <section className="fr-section">
                  <h3>Documented</h3>
                  <p className="fr-doc">{docOf(row)}</p>
                  <p className="muted small">From {kind === "flags" ? "generated/flags.txt" : "generated/vars.txt"}.</p>
                </section>
              )}
              <section className="fr-section">
                <h3>Your note</h3>
                <textarea className="fr-note-edit" rows={3} value={noteList[noteKey(noteKind, row.number)] ?? ""}
                          placeholder={`What this ${kind === "flags" ? "flag" : "variable"} is for, kept in res/paperwhite2/scripts/notes.json (saved with the others)`}
                          onChange={(e) => setNote(noteKind, row.number, e.target.value)} />
              </section>
              <section className="fr-section">
                <h3>Where it's used <span className="muted small">{row.where.length ? `${row.where.length}` : "nowhere found"}</span></h3>
                {row.status === "indirect-candidate" && <p className="muted small">A script names a variable that may hold it; the uses below are the ones found.</p>}
                <ul className="fr-where">
                  {row.where.map((w, i) => <li key={i}><Where text={w} open={open} /></li>)}
                </ul>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** A use: a script's line opens the script, an events file opens in a tab, the rest is shown as it is. */
function Where({ text, open }: { text: string; open?(path: string): void }) {
  const m = /^(res\/[\w/.-]+?\.(s|json))(?::(\d+))?(.*)$/.exec(text);
  if (!m) return <span className="small">{text}</span>;
  const [, path, ext, , rest] = m;
  const name = path.slice(path.lastIndexOf("/") + 1);
  const go = ext === "s" ? () => navigate("scripts", { file: path }) : open ? () => open(path) : null;
  return (
    <span className="small">
      {go ? <button className="link" onClick={go} title={path}>{name}</button> : <code>{name}</code>}
      {m[3] && <span className="muted">:{m[3]}</span>}<span className="muted">{rest}</span>
    </span>
  );
}
