// The specialty editors first, then the tools, then the kinds of data found in res/, grouped by folder, in a section
// that folds away. Nothing here is listed by hand.

import { useEffect, useMemo, useState } from "react";
import type { DataType } from "../../shared/api.ts";
import { humanize } from "../modules/schema-form/form.tsx";
import type { ToolModule } from "../modules/types.ts";

export type Selection = { kind: "type"; schema: string } | { kind: "tool"; id: string } | null;

export function Sidebar({ types, tools, selection, onSelect }: {
  types: DataType[];
  tools: ToolModule[];
  selection: Selection;
  onSelect(s: Selection): void;
}) {
  const [filter, setFilter] = useState("");
  const [filesOpen, setFilesOpen] = useState(() => remembered("sidebar.files", false));
  useEffect(() => remember("sidebar.files", filesOpen), [filesOpen]);
  // A kind of data chosen elsewhere (a link from an editor) opens the section, so the choice shows
  useEffect(() => {
    if (selection?.kind === "type") setFilesOpen(true);
  }, [selection]);

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const map = new Map<string, DataType[]>();
    for (const type of types) {
      const heading = headingOf(type.category[0] ?? "res");
      const text = `${type.title} ${type.category.join(" ")} ${type.description}`.toLowerCase();
      if (q && !text.includes(q)) continue;
      if (!map.has(heading)) map.set(heading, []);
      map.get(heading)!.push(type);
    }
    return [...map];
  }, [types, filter]);

  const sorted = (list: ToolModule[]) =>
    [...list].sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.title.localeCompare(b.title));
  const editors = sorted(tools.filter((t) => t.section === "editors"));
  const others = sorted(tools.filter((t) => t.section !== "editors"));
  const sub = (type: DataType) => type.category.slice(1).map(humanize).join(" › ");
  const toolButton = (tool: ToolModule) => (
    <button key={tool.id} className={`nav-item${selection?.kind === "tool" && selection.id === tool.id ? " selected" : ""}`}
            onClick={() => onSelect({ kind: "tool", id: tool.id })}>
      <span className="nav-icon">{tool.icon}</span>
      {tool.title}
    </button>
  );

  return (
    <nav className="sidebar">
      {editors.length > 0 && (
        <section>
          <h3>Editors</h3>
          {editors.map(toolButton)}
        </section>
      )}
      {others.length > 0 && (
        <section>
          <h3>Tools</h3>
          {others.map(toolButton)}
        </section>
      )}
      <section className="data-files">
        <button className={`fold${filesOpen ? " open" : ""}`} onClick={() => setFilesOpen((v) => !v)} aria-expanded={filesOpen}>
          <span className="fold-arrow">▸</span>
          <span>Data files</span>
          <span className="count">{types.length} kinds</span>
        </button>
        {filesOpen && (
          <>
            <input className="filter" placeholder="Filter kinds of data" value={filter} onChange={(e) => setFilter(e.target.value)} />
            {groups.map(([heading, list]) => (
              <section key={heading}>
                <h3>{heading}</h3>
                {list.map((type) => (
                  <button key={type.schema} title={type.description || type.schema}
                          className={`nav-item${selection?.kind === "type" && selection.schema === type.schema ? " selected" : ""}`}
                          onClick={() => onSelect({ kind: "type", schema: type.schema })}>
                    <span className="nav-text">
                      <span>{type.title}</span>
                      {sub(type) && <span className="nav-sub">{sub(type)}</span>}
                    </span>
                    <span className="count">{type.count}</span>
                  </button>
                ))}
              </section>
            ))}
            {!groups.length && <p className="muted pad">Nothing matches.</p>}
          </>
        )}
      </section>
    </nav>
  );
}

function remembered(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

function remember(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Storage can be unavailable; the section just starts folded next time
  }
}

/** A folder of res/ as a heading; the hack's own folder reads as its name. */
function headingOf(folder: string): string {
  return folder === "paperwhite2" ? "Paper White 2" : humanize(folder);
}
