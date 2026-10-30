// The editor's frame: the kinds of data, their files, open tabs, the build and the changes. Modules fill the tabs.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BuildState, GitState, ProjectInfo, ServerEvent } from "../shared/api.ts";
import type { Constants } from "../shared/schema.ts";
import { api, listen } from "./api.ts";
import { documents, useDocuments } from "./documents.ts";
import { tools } from "./modules/registry.ts";
import { BuildPanel } from "./shell/BuildPanel.tsx";
import { DocumentView } from "./shell/DocumentView.tsx";
import { EntryList } from "./shell/EntryList.tsx";
import { GitPanel } from "./shell/GitPanel.tsx";
import { QuickOpen } from "./shell/QuickOpen.tsx";
import { Sidebar, type Selection } from "./shell/Sidebar.tsx";
import { useTheme } from "./theme.ts";

const NO_BUILD: BuildState = { running: false, command: "", startedAt: null, finishedAt: null, exitCode: null, lines: [] };

export function App() {
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [constants, setConstants] = useState<Constants>(new Map());
  // The address's #tool/<id> names a tool to open, so a page of the editor can be linked to and reloaded
  const [selection, setSelection] = useState<Selection>(() => {
    const match = /^#tool\/([\w-]+)$/.exec(location.hash);
    return match ? { kind: "tool", id: match[1] } : null;
  });
  const [refresh, setRefresh] = useState(0);
  const [schemaEpoch, setSchemaEpoch] = useState(0);
  const [connected, setConnected] = useState(true);
  const [build, setBuild] = useState<BuildState>(NO_BUILD);
  const [buildLines, setBuildLines] = useState<string[]>([]);
  const [showBuild, setShowBuild] = useState(false);
  const [git, setGit] = useState<GitState | null>(null);
  const [showGit, setShowGit] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { docs, order, active } = useDocuments();

  useEffect(() => {
    const hash = selection?.kind === "tool" ? `#tool/${selection.id}` : "";
    if (location.hash !== hash) history.replaceState(null, "", hash || location.pathname);
  }, [selection]);

  const loadProject = useCallback(() => api.project().then(setInfo, (e: Error) => setLoadError(e.message)), []);
  const loadConstants = useCallback(() => api.constants().then((c) => setConstants(new Map(Object.entries(c)))), []);
  const loadGit = useCallback(() => api.git().then(setGit, () => setGit(null)), []);

  useEffect(() => {
    loadProject();
    loadConstants();
    loadGit();
    api.build().then((b) => {
      setBuild(b);
      setBuildLines(b.lines);
    });
  }, [loadProject, loadConstants, loadGit]);

  // The server's events: files that changed on disk, new kinds of data, build output.
  useEffect(() => listen((event: ServerEvent) => {
    switch (event.type) {
      case "files":
        for (const path of event.paths) {
          if (path.endsWith(".schema.json")) {
            api.forgetSchema(path);
            setSchemaEpoch((n) => n + 1);
          }
          if (documents.get(path)) documents.changedOnDisk(path);
        }
        setRefresh((n) => n + 1);
        break;
      case "types":
        loadProject();
        break;
      case "constants":
        loadConstants();
        break;
      case "build":
        setBuild(event.state);
        if (event.state.running) setBuildLines([]);
        break;
      case "build-line":
        setBuildLines((lines) => [...lines.slice(-4999), event.line]);
        break;
      case "git":
        loadGit();
        break;
    }
  }, setConnected), [loadProject, loadConstants, loadGit]);

  const open = useCallback((path: string) => {
    setQuickOpen(false);
    setSelection((s) => (s?.kind === "tool" ? null : s));
    documents.open(path).catch((e: Error) => alert(`Couldn't open ${path}: ${e.message}`));
  }, []);

  const close = (path: string) => {
    if (docs.get(path)?.dirty && !confirm(`${path} has unsaved changes. Close it anyway?`)) return;
    documents.close(path);
  };

  const startBuild = async () => {
    const dirty = documents.dirtyPaths();
    if (dirty.length) {
      const save = confirm(`${dirty.length} file${dirty.length > 1 ? "s have" : " has"} unsaved changes. Save before building?\n\n` +
        "OK saves them first; Cancel builds what is on disk.");
      if (save) for (const path of dirty) if (!(await documents.save(path))) return alert(`${path} wasn't saved; the build didn't start.`);
    }
    setShowBuild(true);
    await api.startBuild();
  };

  // Keys: Ctrl+S saves, Ctrl+Z/Ctrl+Y undo and redo, Ctrl+P opens a file, Ctrl+B builds.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      const typing = (e.target as HTMLElement).tagName === "TEXTAREA";
      if (key === "s") {
        e.preventDefault();
        if (e.shiftKey) documents.dirtyPaths().forEach((p) => documents.save(p));
        else if (active) documents.save(active);
      } else if (key === "p") {
        e.preventDefault();
        setQuickOpen(true);
      } else if (key === "b") {
        e.preventDefault();
        startBuild();
      } else if (!typing && active && (key === "z" || key === "y")) {
        e.preventDefault();
        if (key === "y" || e.shiftKey) documents.redo(active);
        else documents.undo(active);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Commits made elsewhere (by a Claude session) show when you come back to the window.
  useEffect(() => {
    window.addEventListener("focus", loadGit);
    return () => window.removeEventListener("focus", loadGit);
  }, [loadGit]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (documents.dirtyPaths().length) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const types = info?.types ?? [];
  const typeOf = useMemo(() => {
    const bySchema = new Map(types.map((t) => [t.schema, t]));
    return (schema: string | null) => (schema ? bySchema.get(schema) : undefined);
  }, [types]);
  const visibleTools = tools.filter((t) => !t.requires?.some((s) => !typeOf(s)));
  const selectedType = selection?.kind === "type" ? typeOf(selection.schema) : undefined;
  const tool = selection?.kind === "tool" ? visibleTools.find((t) => t.id === selection.id) : undefined;
  const dirty = new Set([...docs.values()].filter((d) => d.dirty).map((d) => d.path));
  const activeDoc = active ? docs.get(active) : undefined;
  const changes = git?.changes.filter((c) => c.path.startsWith("res/")).length ?? 0;

  if (loadError) return <div className="fatal">The editor's server didn't answer: {loadError}. Is <code>npm start</code> running?</div>;

  return (
    <div className={`app${showGit ? " with-git" : ""}`}>
      <header className="topbar">
        <span className="brand">Paper White 2 <span className="muted">Editor</span></span>
        <button onClick={() => setQuickOpen(true)} title="Ctrl+P">Open file…</button>
        <span className="spacer" />
        <button className="primary" onClick={startBuild} disabled={build.running} title={`Ctrl+B: ${info?.settings.buildCommand ?? ""}`}>
          {build.running ? "Building…" : "Build"}
        </button>
        {build.running && <button onClick={() => api.stopBuild()}>Stop</button>}
        <button onClick={() => setShowBuild((v) => !v)} className={showBuild ? "active" : ""}>
          Log{build.exitCode !== null && !build.running && <span className={`badge ${build.exitCode === 0 ? "ok" : "error"}`}>{build.exitCode === 0 ? "✓" : "!"}</span>}
        </button>
        <button onClick={() => setShowGit((v) => !v)} className={showGit ? "active" : ""} title="What changed since the last commit">
          Changes{changes > 0 && <span className="badge">{changes}</span>}
        </button>
        <button className="icon" onClick={toggleTheme} title="Light or dark">{theme === "dark" ? "☀" : "☾"}</button>
      </header>

      <Sidebar types={types} tools={visibleTools} selection={selection} onSelect={setSelection} />

      {selectedType && (
        <EntryList type={selectedType} refresh={refresh} openPaths={new Set(order)} dirtyPaths={dirty}
                   activePath={active} onOpen={open} />
      )}

      <main className={`main${selectedType ? "" : " wide"}`}>
        {tool ? (
          <tool.View types={types} constants={constants} open={open} />
        ) : (
          <>
            <div className="tabs">
              {order.map((path) => {
                const doc = docs.get(path)!;
                return (
                  <div key={path} className={`tab${path === active ? " active" : ""}`} title={path}
                       onMouseDown={(e) => e.button === 1 && close(path)} onClick={() => documents.activate(path)}>
                    <span>{path.split("/").slice(-2).join("/").replace(/\.json$/, "")}</span>
                    {doc.dirty ? <span className="dot" /> : null}
                    <button className="icon" onClick={(e) => {
                      e.stopPropagation();
                      close(path);
                    }}>×</button>
                  </div>
                );
              })}
            </div>
            {activeDoc ? (
              <DocumentView key={`${activeDoc.path}:${schemaEpoch}`} doc={activeDoc} type={typeOf(activeDoc.schema)}
                            constants={constants} onOpen={open} />
            ) : (
              <Welcome info={info} />
            )}
          </>
        )}
        {showBuild && <BuildPanel state={build} lines={buildLines} onOpen={open} onClose={() => setShowBuild(false)} />}
      </main>

      {showGit && (
        <GitPanel state={git} commitEnabled={info?.settings.commitEnabled ?? false} onOpen={open}
                  onClose={() => setShowGit(false)} onRefresh={loadGit} />
      )}

      <footer className="statusbar">
        <span className={connected ? "" : "error"}>{connected ? "Connected" : "Reconnecting to the server…"}</span>
        <span>{types.length} kinds of data · {types.reduce((n, t) => n + t.count, 0).toLocaleString()} files</span>
        {dirty.size > 0 && <span>{dirty.size} unsaved (Ctrl+Shift+S saves all)</span>}
        <span className="spacer" />
        {git && <span>{git.branch} · {git.head}</span>}
      </footer>

      {quickOpen && <QuickOpen onOpen={open} onClose={() => setQuickOpen(false)} />}
    </div>
  );
}

function Welcome({ info }: { info: ProjectInfo | null }) {
  return (
    <div className="welcome">
      <h1>Paper White 2</h1>
      <p>Choose a kind of data on the left, or press <kbd>Ctrl</kbd>+<kbd>P</kbd> to open a file by name.</p>
      <ul className="muted">
        <li>Everything here comes from <code>res/</code> and its schemas: new data and new fields show up by themselves.</li>
        <li>Saving checks the file with the build's own validator first, and never leaves a half-written file.</li>
        <li><kbd>Ctrl</kbd>+<kbd>B</kbd> builds the ROM; the hack build copies it to your playtest folder.</li>
      </ul>
      {info && <p className="muted small">{info.root}</p>}
    </div>
  );
}
