// The Icon review page's logic (temporary): which icons a filter shows, how far the review is, and each candidate's
// 16 colours (slot 0 transparent, slots 1-13 its battle indices through normal.pal or shiny.pal, 14-15 the greys).

import type { IconChoice, IconReviewDetail, IconReviewEntry } from "../../../server/iconReview.ts";

export type ReviewFilter = "undecided" | "needs" | "all" | IconChoice;

export const FILTERS: { id: ReviewFilter; label: string; hint: string }[] = [
  { id: "undecided", label: "Undecided", hint: "icons where IHM and J differ and nothing is chosen yet" },
  { id: "needs", label: "Needs a choice", hint: "every icon where IHM and J differ, decided or not" },
  { id: "all", label: "All", hint: "every icon, including those where IHM and J are the same (they keep IHM)" },
  { id: "ihm", label: "Kept IHM", hint: "icons you kept IHM for" },
  { id: "j", label: "Kept J", hint: "icons you kept J for" },
  { id: "manual", label: "By hand", hint: "icons marked to fix by hand" },
];

/** The choice an icon ends with: its entry, or IHM where IHM and J are the same; null while undecided. */
export function choiceOf(entry: IconReviewEntry, choices: Record<string, IconChoice>): IconChoice | null {
  return choices[entry.key] ?? (entry.differ ? null : "ihm");
}

export function filterEntries(entries: IconReviewEntry[], choices: Record<string, IconChoice>, filter: ReviewFilter): IconReviewEntry[] {
  switch (filter) {
    case "all": return entries;
    case "needs": return entries.filter((e) => e.differ);
    case "undecided": return entries.filter((e) => e.differ && !choices[e.key]);
    default: return entries.filter((e) => choices[e.key] === filter);
  }
}

export interface Progress { needed: number; decided: number; ihm: number; j: number; manual: number }

export function progress(entries: IconReviewEntry[], choices: Record<string, IconChoice>): Progress {
  const out: Progress = { needed: 0, decided: 0, ihm: 0, j: 0, manual: 0 };
  for (const e of entries) {
    if (e.differ) out.needed++;
    const c = choices[e.key];
    if (!c) continue;
    if (e.differ) out.decided++;
    out[c]++;
  }
  return out;
}

/** The key after (or with step -1 before) key in the list; the list's first when key isn't in it. */
export function step(list: IconReviewEntry[], key: string | null, by: 1 | -1): string | null {
  if (!list.length) return null;
  const at = list.findIndex((e) => e.key === key);
  if (at < 0) return list[0].key;
  return list[Math.max(0, Math.min(list.length - 1, at + by))].key;
}

/** Where to go after choosing for key: the next icon of the list as it was, else the one before, else null. */
export function afterChoosing(list: IconReviewEntry[], key: string): string | null {
  const at = list.findIndex((e) => e.key === key);
  if (at < 0) return list[0]?.key ?? null;
  return list[at + 1]?.key ?? list[at - 1]?.key ?? null;
}

/** A candidate's 16 colours, null for transparency (and for slots it doesn't use). */
export function candidateColours(detail: IconReviewDetail, which: "ihm" | "j", palette: "normal" | "shiny"): (string | null)[] {
  const pal = detail[palette];
  const slots = detail[which].slots;
  const out: (string | null)[] = [null];
  for (let s = 1; s <= 13; s++) out.push(s <= slots.length ? pal[slots[s - 1]] : null);
  return [...out, detail.greys[0], detail.greys[1]];
}

/** Index pixels from hex. */
export function pixelsOf(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}
