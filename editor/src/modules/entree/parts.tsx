// The Entree page's layout pieces, as the Ambients panel's: a headed section with its actions at its top, a row of a
// label column and its controls, a number box and a switch. Shared by the rooms (EntreeEditor.tsx) and the item table
// (ItemsPage.tsx).

import type { ReactNode } from "react";

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

export function NumberBox({ value, min, max, onChange, width = 64, title }: { value: number; min: number; max: number; onChange(n: number): void; width?: number; title?: string }) {
  return <input type="number" className="en-number" style={{ width }} min={min} max={max} value={value} title={title}
                onChange={(e) => onChange(clamp(Math.round(Number(e.target.value) || 0), min, max))} />;
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
