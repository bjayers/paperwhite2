// The Entree page's layout pieces, as the Ambients panel's: a headed section with its actions at its top, a row of a
// label column and its controls, a number box and a switch. Shared by the rooms (EntreeEditor.tsx) and the item table
// (ItemsPage.tsx).

import { useState, type ReactNode } from "react";

export const cap = (s: string) => s[0].toUpperCase() + s.slice(1).replace(/_/g, " ");
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function Section({ title, summary, actions, children }: { title: string; summary?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="ow-panel-box ow-section en-section">
      <h5>{title} {summary !== undefined && <span className="muted">{summary}</span>}</h5>
      {actions && <div className="ow-section-actions">{actions}</div>}
      {children}
    </section>
  );
}

export function Row({ label: text, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <>
      <span className="ow-condition-label">{text}</span>
      <span className="ow-xyz">
        {children}
        {hint && <span className="muted hint">{hint}</span>}
      </span>
    </>
  );
}

// A number box that keeps what is typed while it has focus and commits on blur, Enter or Ctrl+S (Escape reverts), so
// typing 300 over 100 isn't snapped to the range at each keystroke. A value out of min..max or not a number is marked
// invalid while typed, and is clamped (and rounded to the step) when it commits; an empty box reverts.
export function NumberBox({ value, min, max, onChange, width = 64, title, step = 1 }: {
  value: number; min: number; max: number; onChange(n: number): void; width?: number; title?: string; step?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const typed = draft === null || draft.trim() === "" ? NaN : Number(draft);
  const bad = draft !== null && !(typed >= min && typed <= max);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    if (!Number.isFinite(typed)) return;
    const decimals = step < 1 ? Math.max(0, -Math.floor(Math.log10(step) + 1e-9)) : 0;
    const n = clamp(Number((Math.round(typed / step) * step).toFixed(decimals)), min, max);
    if (n !== value) onChange(n);
  };
  return <input type="number" className={bad ? "en-number invalid" : "en-number"} style={{ width }} min={min} max={max} step={step}
                value={draft ?? String(value)} title={bad ? `${min} to ${max}: it is clamped when you leave the box` : title}
                onChange={(e) => setDraft(e.target.value)} onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s")) commit();
                  else if (e.key === "Escape") setDraft(null);
                }} />;
}

export function Switch<T extends string>({ value, options, onChange, titles, labels }: {
  value: T; options: readonly T[]; onChange(v: T): void; titles?: Record<string, string>; labels?: Record<string, string>;
}) {
  return (
    <span className="view-switch">
      {options.map((o) => <button key={o} className={o === value ? "active" : ""} title={titles?.[o]} onClick={() => onChange(o)}>{labels?.[o] ?? cap(o)}</button>)}
    </span>
  );
}
