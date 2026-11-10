// What changed in the checkout since the last commit, with each file's diff, and Push to GitHub, which commits the
// files, merges origin/main in and pushes to main so the cloud session (which sees only GitHub) gets them. Commit and
// Push stay disabled until commitEnabled is turned on in editor/settings.local.json; until then the Claude sessions
// commit.

import { useEffect, useMemo, useState } from "react";
import { neverPushed, pushMessage, type GitState, type PushResult } from "../../shared/api.ts";
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
  // Push to GitHub: the files it will push and its message while it is being looked over, then what it did
  const [push, setPush] = useState<{ files: string[]; left: string[]; message: string } | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushed, setPushed] = useState<PushResult | null>(null);

  const changes = useMemo(() => (state?.changes ?? []).filter((c) => !onlyRes || c.path.startsWith("res/")), [state, onlyRes]);

  useEffect(() => {
    if (!selected) return setDiff("");
    api.diff(selected).then(setDiff, (e: Error) => setDiff(e.message));
  }, [selected, state]);

  const allChosen = changes.length > 0 && changes.every((c) => chosen.has(c.path));
  const discard = async () => {
    const paths = [...chosen];
    if (!window.confirm(`Put ${paths.length} file(s) back as the last commit has them? Their changes are lost, and new files are deleted (a painted map's project and its copy of the chunk go together):\n\n${paths.slice(0, 20).join("\n")}${paths.length > 20 ? "\n…" : ""}`)) return;
    try {
      const { discarded } = await api.discard(paths);
      setResult(`Put ${discarded} file(s) back as last committed${discarded > paths.length ? " (with the rest of their painted maps)" : ""}.`);
      setChosen(new Set());
      onRefresh();
    } catch (e) {
      setResult(`Not put back: ${(e as Error).message}`);
    }
  };

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

  // The checked files, or every one shown when none is checked
  const reviewPush = () => {
    const paths = chosen.size ? [...chosen] : changes.map((c) => c.path);
    const files = paths.filter((p) => !neverPushed(p));
    setPushed(null);
    setPush({ files, left: paths.filter((p) => neverPushed(p)), message: pushMessage(files) });
  };
  const startPush = async () => {
    if (!push) return;
    setPushing(true);
    try {
      const done = await api.push(push.files, push.message);
      setPushed(done);
      if (done.commit) setChosen(new Set());
      setPush(null);
    } catch (e) {
      setPushed({ commit: null, merged: false, pushed: false, conflicts: [], error: (e as Error).message, log: [] });
    } finally {
      setPushing(false);
      onRefresh();
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
      <label className="checkbox pad small">
        <input type="checkbox" disabled={!commitEnabled || !changes.length} checked={allChosen}
               onChange={(e) => setChosen(e.target.checked ? new Set(changes.map((c) => c.path)) : new Set())} /> Check all shown
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
        <button className="danger" disabled={!commitEnabled || !chosen.size} onClick={discard}
                title="Puts the checked files back as the last commit has them: their changes are lost, and new files are deleted">
          Discard {chosen.size ? `${chosen.size} file${chosen.size > 1 ? "s" : ""}` : ""}
        </button>
        {!commitEnabled && <p className="muted small">Committing is turned off for now: the Claude sessions commit.</p>}
        {result && <p className="small">{result}</p>}
      </footer>
      <footer className="commit">
        <strong className="small">GitHub</strong>
        {!push && (
          <button disabled={!commitEnabled || pushing || (!changes.length && !chosen.size && !state?.ahead)} onClick={reviewPush}
                  title={commitEnabled ? "Commit the checked files (or every one shown), merge origin/main in and push to main, for the cloud session" :
                    "Turned off while the Claude sessions are still adding features: set commitEnabled to true in editor/settings.local.json to use it"}>
            Push to GitHub{chosen.size ? ` (${chosen.size} file${chosen.size > 1 ? "s" : ""})` : ""}…
          </button>
        )}
        {push && (
          <>
            <p className="small">{push.files.length
              ? `Commits these ${push.files.length} file${push.files.length > 1 ? "s" : ""}, merges origin/main in and pushes to main:`
              : `Nothing to commit: merges origin/main in and pushes the ${state?.ahead ?? 0} commit(s) not yet on GitHub.`}</p>
            {push.files.length > 0 && <ul className="push-files small">{push.files.map((p) => <li key={p}>{p}</li>)}</ul>}
            {push.left.length > 0 && <p className="muted small">Never pushed, so left out: {push.left.join(", ")}</p>}
            {push.files.length > 0 && (
              <input value={push.message} placeholder="Commit message" onChange={(e) => setPush({ ...push, message: e.target.value })} />
            )}
            <span className="push-actions">
              <button className="primary" disabled={pushing || (push.files.length > 0 && !push.message.trim())} onClick={startPush}>
                {pushing ? "Pushing…" : "Push"}
              </button>
              <button disabled={pushing} onClick={() => setPush(null)}>Cancel</button>
            </span>
          </>
        )}
        {pushed && (
          <div className="small">
            <p className={pushed.pushed ? "" : "error"}>
              {pushed.pushed ? `Pushed${pushed.commit ? ` ${pushed.commit}` : ""} to GitHub (origin main).` :
                `${pushed.commit ? `Committed ${pushed.commit} here, but not pushed` : "Not pushed"}: ${pushed.error}`}
            </p>
            {pushed.conflicts.length > 0 && <ul className="push-files">{pushed.conflicts.map((p) => <li key={p}>{p}</li>)}</ul>}
            {pushed.log.length > 0 && <p className="muted">{pushed.log.join(" · ")}</p>}
          </div>
        )}
      </footer>
    </aside>
  );
}
