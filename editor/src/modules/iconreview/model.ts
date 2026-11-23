// The Icon review page's logic (temporary): which icons a filter shows, how far the review is, and each candidate's
// 16 colours (slot 0 transparent, slots 1-13 its battle indices through normal.pal or shiny.pal, 14-15 the greys).

import type { IconCandidate, IconChoice, IconReviewDetail, IconReviewEntry, ReviewChoices } from "../../../server/iconReview.ts";

export type ReviewFilter = "undecided" | "needs" | "all" | "ihm" | "j" | "other" | "flagged";

export const METHOD_LABEL: Record<IconChoice, string> = { ihm: "IHM", j: "J", g2: "G2", h: "H", ih: "IH", k: "K" };

/** The Flagged mode's candidates in display order (number keys 1, 2, … in this order): the user's pick of IHM and J
 * (the one K started from), then G2, H, IH and K; only those the icon has. Empty for an icon without extra candidates
 * (they come with the flag, or with a choice of G2, H, IH or K, when the candidates were generated). */
export function flaggedOrder(detail: IconReviewDetail): IconChoice[] {
  const extra = detail.candidates;
  if (!extra) return [];
  const base = extra.k?.base ?? "ihm";
  return [base, ...(["g2", "h", "ih", "k"] as const).filter((m) => extra[m])];
}

/** A candidate of the icon: IHM and J for every icon, the others for a flagged one. */
export function candidateOf(detail: IconReviewDetail, which: IconChoice): IconCandidate | undefined {
  return which === "ihm" || which === "j" ? detail[which] : detail.candidates?.[which];
}

export const FILTERS: { id: ReviewFilter; label: string; hint: string }[] = [
  { id: "undecided", label: "Undecided", hint: "icons where IHM and J differ and nothing is chosen yet" },
  { id: "needs", label: "Needs a choice", hint: "every icon where IHM and J differ, decided or not" },
  { id: "all", label: "All", hint: "every icon, including those where IHM and J are the same (they keep IHM)" },
  { id: "ihm", label: "Kept IHM", hint: "icons you kept IHM for" },
  { id: "j", label: "Kept J", hint: "icons you kept J for" },
  { id: "other", label: "Kept another", hint: "icons you kept G2, H, IH or K for, flagged or not" },
  { id: "flagged", label: "Fix by hand", hint: "icons flagged to fix by hand, whatever their choice; with their extra candidates (G2, H, IH, K)" },
];

/** The choice an icon ends with: its entry, or IHM where IHM and J are the same; null while undecided. */
export function choiceOf(entry: IconReviewEntry, choices: Record<string, IconChoice>): IconChoice | null {
  return choices[entry.key] ?? (entry.differ ? null : "ihm");
}

/** The icons a filter shows, in the review's order. keep: an icon kept in the list at its place even when it no longer
 * matches (the shown one, until the user moves on from it). */
export function filterEntries(entries: IconReviewEntry[], review: ReviewChoices, filter: ReviewFilter, keep?: string | null): IconReviewEntry[] {
  const matching = new Set(matches(entries, review, filter).map((e) => e.key));
  return keep && !matching.has(keep) && entries.some((e) => e.key === keep)
    ? entries.filter((e) => matching.has(e.key) || e.key === keep) : entries.filter((e) => matching.has(e.key));
}

function matches(entries: IconReviewEntry[], review: ReviewChoices, filter: ReviewFilter): IconReviewEntry[] {
  const { choices, fixByHand } = review;
  switch (filter) {
    case "all": return entries;
    case "needs": return entries.filter((e) => e.differ);
    case "undecided": return entries.filter((e) => e.differ && !choices[e.key]);
    case "flagged": return entries.filter((e) => fixByHand.includes(e.key));
    case "other": return entries.filter((e) => { const c = choices[e.key]; return !!c && c !== "ihm" && c !== "j"; });
    default: return entries.filter((e) => choices[e.key] === filter);
  }
}

/** decided counts the icons where IHM and J differ that have a choice (the flag doesn't decide); other counts the
 * choices of G2, H, IH or K; flagged counts every flagged icon of the review. */
export interface Progress { needed: number; decided: number; ihm: number; j: number; other: number; flagged: number }

export function progress(entries: IconReviewEntry[], review: ReviewChoices): Progress {
  const out: Progress = { needed: 0, decided: 0, ihm: 0, j: 0, other: 0, flagged: 0 };
  for (const e of entries) {
    if (e.differ) out.needed++;
    if (review.fixByHand.includes(e.key)) out.flagged++;
    const c = review.choices[e.key];
    if (!c) continue;
    if (e.differ) out.decided++;
    if (c === "ihm" || c === "j") out[c]++;
    else out.other++;
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
export function candidateColours(detail: IconReviewDetail, which: IconChoice, palette: "normal" | "shiny"): (string | null)[] {
  const pal = detail[palette];
  const slots = candidateOf(detail, which)?.slots ?? [];
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
