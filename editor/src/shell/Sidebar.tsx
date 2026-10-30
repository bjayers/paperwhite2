// The kinds of data found in res/, grouped by folder, and the tool modules. Nothing here is listed by hand.

import { useMemo, useState } from "react";
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

  const sub = (type: DataType) => type.category.slice(1).map(humanize).join(" › ");

  return (
    <nav className="sidebar">
      <input className="filter" placeholder="Filter kinds of data" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {tools.length > 0 && (
        <section>
          <h3>Tools</h3>
          {tools.map((tool) => (
            <button key={tool.id} className={`nav-item${selection?.kind === "tool" && selection.id === tool.id ? " selected" : ""}`}
                    onClick={() => onSelect({ kind: "tool", id: tool.id })}>
              <span className="nav-icon">{tool.icon}</span>
              {tool.title}
            </button>
          ))}
        </section>
      )}
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
    </nav>
  );
}

/** A folder of res/ as a heading; the hack's own folder reads as its name. */
function headingOf(folder: string): string {
  return folder === "paperwhite2" ? "Paper White 2" : humanize(folder);
}
