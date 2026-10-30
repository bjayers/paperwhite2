// The files of one kind of data, with a search box. Long lists only draw the rows in view.

import { useEffect, useMemo, useRef, useState } from "react";
import type { DataType, Entry } from "../../shared/api.ts";
import { api } from "../api.ts";

const ROW = 30;

export function EntryList({ type, refresh, openPaths, dirtyPaths, activePath, onOpen }: {
  type: DataType;
  /** Changes when files of this kind were added or removed. */
  refresh: number;
  openPaths: Set<string>;
  dirtyPaths: Set<string>;
  activePath: string | null;
  onOpen(path: string): void;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [query, setQuery] = useState("");
  const [scroll, setScroll] = useState(0);
  const [height, setHeight] = useState(600);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    api.entries(type.schema).then((e) => live && setEntries(e));
    return () => {
      live = false;
    };
  }, [type.schema, refresh]);

  useEffect(() => {
    setQuery("");
    list.current?.scrollTo(0, 0);
  }, [type.schema]);

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (entries ?? []).filter((e) => !q || e.label.toLowerCase().includes(q));
  }, [entries, query]);

  const first = Math.max(0, Math.floor(scroll / ROW) - 5);
  const last = Math.min(shown.length, Math.ceil((scroll + height) / ROW) + 5);

  return (
    <div className="entry-list">
      <header>
        <h2 title={type.schema}>{type.title}</h2>
        {type.description && <p className="muted small">{type.description}</p>}
        <input className="filter" placeholder={`Search ${type.count} files`} value={query}
               onChange={(e) => setQuery(e.target.value)} />
      </header>
      <div className="entries" ref={list} onScroll={(e) => setScroll(e.currentTarget.scrollTop)}>
        <div style={{ height: shown.length * ROW, position: "relative" }}>
          {shown.slice(first, last).map((entry, i) => (
            <button key={entry.path} style={{ top: (first + i) * ROW, height: ROW }}
                    className={`entry${entry.path === activePath ? " selected" : ""}${openPaths.has(entry.path) ? " open" : ""}`}
                    title={entry.path} onClick={() => onOpen(entry.path)}>
              {entry.label}
              {dirtyPaths.has(entry.path) && <span className="dot" title="Unsaved changes" />}
            </button>
          ))}
        </div>
        {entries === null && <p className="muted pad">Loading…</p>}
        {entries !== null && !shown.length && <p className="muted pad">Nothing matches.</p>}
      </div>
    </div>
  );
}
