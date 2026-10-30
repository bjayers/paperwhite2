// What changed in the checkout since the last commit, with each file's diff. The Commit button stays disabled until
// commitEnabled is turned on in editor/settings.local.json; until then the Claude sessions commit.

import { useEffect, useMemo, useState } from "react";
import type { GitState } from "../../shared/api.ts";
import { api } from "../api.ts";

const STATUS: Record<string, string> = { M: "changed", A: "added", D: "deleted", R: "renamed", "?": "new", U: "conflict" };

function describe(code: string): string {
  return STATUS[code.trim()[0] ?? ""] ?? code;
}

export function GitPanel({ state, commitEnabled, onOpen, onClose, onRefresh }: {
  state: GitState | null;
  commitEnabled: boolean;
  onOpen(path: string): void;
  onClose(): void;
  onRefresh(): void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [onlyRes, setOnlyRes] = useState(true);

  const changes = useMemo(() => (state?.changes ?? []).filter((c) => !onlyRes || c.path.startsWith("res/")), [state, onlyRes]);

  useEffect(() => {
    if (!selected) return setDiff("");
    api.diff(selected).then(setDiff, (e: Error) => setDiff(e.message));
  }, [selected, state]);

  const commit = async () => {
    try {
      const { commit } = await api.commit([...chosen], message);
      setResult(`Committed ${commit}.`);
      setChosen(new Set());
      setMessage("");
      onRefresh();
    } catch (e) {
      setResult(`Not committed: ${(e as Error).message}`);
    }
  };

  return (
    <aside className="git-panel">
      <header>
        <strong>Changes</strong>
        {state && <span className="muted small">{state.branch}{state.ahead ? ` · ${state.ahead} to push` : ""}{state.behind ? ` · ${state.behind} to pull` : ""}</span>}
        <span className="spacer" />
        <button className="icon" title="Refresh" onClick={onRefresh}>⟳</button>
        <button className="icon" title="Hide" onClick={onClose}>×</button>
      </header>
      {state && <p className="muted small pad">Last commit: {state.head}</p>}
      <label className="checkbox pad small">
        <input type="checkbox" checked={onlyRes} onChange={(e) => setOnlyRes(e.target.checked)} /> Only game data (res/)
      </label>
      <ul className="changes">
        {changes.map((c) => (
          <li key={c.path} className={selected === c.path ? "selected" : ""}>
            <input type="checkbox" disabled={!commitEnabled} checked={chosen.has(c.path)} onChange={(e) => {
              const next = new Set(chosen);
              if (e.target.checked) next.add(c.path); else next.delete(c.path);
              setChosen(next);
            }} />
            <button className="change" title={c.path} onClick={() => setSelected(c.path)}>
              <span className={`status ${describe(c.status)}`}>{describe(c.status)}</span>
              <span className="change-path">{c.path}</span>
            </button>
            {c.path.startsWith("res/") && c.path.endsWith(".json") && (
              <button className="icon" title="Open" onClick={() => onOpen(c.path)}>↗</button>
            )}
          </li>
        ))}
        {state && !changes.length && <li className="muted pad">No changes.</li>}
      </ul>
      {selected && <pre className="diff">{diff.split("\n").map((line, i) => (
        <span key={i} className={line.startsWith("+") && !line.startsWith("+++") ? "add" : line.startsWith("-") && !line.startsWith("---") ? "del" : ""}>{line}{"\n"}</span>
      ))}</pre>}
      <footer className="commit">
        <textarea placeholder="What changed and why" value={message} disabled={!commitEnabled} onChange={(e) => setMessage(e.target.value)} />
        <button className="primary" disabled={!commitEnabled || !chosen.size || !message.trim()} onClick={commit}
                title={commitEnabled ? "Commit the checked files" :
                  "Turned off while the Claude sessions are still adding features: set commitEnabled to true in editor/settings.local.json to use it"}>
          Commit {chosen.size ? `${chosen.size} file${chosen.size > 1 ? "s" : ""}` : ""}
        </button>
        {!commitEnabled && <p className="muted small">Committing is turned off for now: the Claude sessions commit.</p>}
        {result && <p className="small">{result}</p>}
      </footer>
    </aside>
  );
}
