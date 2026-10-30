// Ctrl+P: open any data file by typing part of its path.

import { useEffect, useState } from "react";
import type { Entry } from "../../shared/api.ts";
import { api } from "../api.ts";

export function QuickOpen({ onOpen, onClose }: { onOpen(path: string): void; onClose(): void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Entry[]>([]);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => api.search(query).then((r) => live && (setResults(r), setHighlight(0))), 80);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="quick-open" onMouseDown={(e) => e.stopPropagation()}>
        <input autoFocus placeholder="Open a file: type part of its path (bulbasaur, zones aspertia)" value={query}
               onChange={(e) => setQuery(e.target.value)}
               onKeyDown={(e) => {
                 if (e.key === "ArrowDown") setHighlight((h) => Math.min(h + 1, results.length - 1));
                 else if (e.key === "ArrowUp") setHighlight((h) => Math.max(h - 1, 0));
                 else if (e.key === "Enter" && results[highlight]) onOpen(results[highlight].path);
                 else if (e.key === "Escape") onClose();
                 else return;
                 e.preventDefault();
               }} />
        <ul>
          {results.map((r, i) => (
            <li key={r.path} className={i === highlight ? "highlight" : ""} onMouseEnter={() => setHighlight(i)}
                onClick={() => onOpen(r.path)}>{r.label}</li>
          ))}
          {query && !results.length && <li className="muted">No files match.</li>}
        </ul>
      </div>
    </div>
  );
}
