// A drop-down you can type into to narrow its options by any part of a name or by number, as Frost's search boxes
// did. Shows at most a few hundred matches at a time so long lists (thousands of flags) stay quick.

import { useEffect, useMemo, useRef, useState } from "react";

export interface Option {
  value: string;
  label: string;
  /** Shown faintly after the label: a constant's name or number. */
  detail?: string;
}

const SHOWN = 300;

export function SearchSelect({ value, options, onChange, placeholder, allowCustom, invalid }: {
  value: string;
  options: Option[];
  onChange(value: string): void;
  placeholder?: string;
  /** Accept typed text that matches no option, such as a hex ID. */
  allowCustom?: (text: string) => boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.value === value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    const digits = q.replace(/^#/, "");
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q) ||
      (/^\d+$/.test(digits) && (o.detail ?? "").startsWith(digits)));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    list.current?.children[highlight]?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className={`search-select${invalid ? " invalid" : ""}`} ref={box}>
      <input
        value={open ? query : current ? current.label : value}
        placeholder={placeholder ?? "Type to search"}
        title={current ? `${current.value}${current.detail ? ` (${current.detail})` : ""}` : value}
        onFocus={(e) => {
          setOpen(true);
          setQuery("");
          setHighlight(Math.max(0, options.indexOf(current!)));
          e.target.select();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setHighlight((h) => Math.min(h + 1, Math.min(matches.length, SHOWN) - 1));
          else if (e.key === "ArrowUp") setHighlight((h) => Math.max(h - 1, 0));
          else if (e.key === "Enter") {
            const pick = matches[highlight];
            if (pick) choose(pick.value);
            else if (allowCustom?.(query.trim())) choose(query.trim());
            e.preventDefault();
          } else if (e.key === "Escape") {
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          } else return;
          e.preventDefault();
        }}
        onBlur={() => {
          const typed = query.trim();
          if (typed && allowCustom?.(typed) && !matches.length) choose(typed);
        }}
      />
      {open && (
        <ul className="search-select-list" ref={list}>
          {matches.slice(0, SHOWN).map((o, i) => (
            <li key={o.value} className={i === highlight ? "highlight" : o.value === value ? "chosen" : ""}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o.value);
                }}
                onMouseEnter={() => setHighlight(i)}>
              <span>{o.label}</span>
              {o.detail && <span className="detail">{o.detail}</span>}
            </li>
          ))}
          {matches.length > SHOWN && <li className="more">{matches.length - SHOWN} more: keep typing to narrow</li>}
          {!matches.length && <li className="more">No match{allowCustom ? "; Enter keeps what you typed if it is valid" : ""}</li>}
        </ul>
      )}
    </div>
  );
}
