// The Icon review page's server side (temporary, docs/paperwhite2/design/shiny-icons.md sections 13-14): the candidates
// tools/paperwhite2/icon_remap.py writes to build/icon_review/ (ignored, regenerable), and the user's choice per icon
// in res/paperwhite2/icon_remap_choices.json ({"choices": {icon key: method}, "fix_by_hand": [icon keys], "k_base":
// {icon key: "ihm" | "j"}}; an icon without a choice keeps IHM, and the fix-by-hand flag is separate: any icon can carry
// it, whatever its choice). Every icon offers IHM and J; an icon flagged to fix by hand, or kept on G2, H, IH or K, when
// the candidates were generated also offers G2, H, IH and K. k_base (optional) is the pick K was built from, recorded
// when one of those candidates is kept, so generating again gives the same K.

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileText, fromPlain, parseJson, toPlain } from "../shared/json.ts";

export const REVIEW_DIR = "build/icon_review";
export const CHOICES_FILE = "res/paperwhite2/icon_remap_choices.json";
export const REMAP_TOOL = "tools/paperwhite2/icon_remap.py";
export const CHOICES = ["ihm", "j", "g2", "h", "ih", "k"] as const;
export type IconChoice = (typeof CHOICES)[number];
/** The methods every icon offers; the others only the extra candidates (IconReviewEntry.candidates). */
export const BASE_CHOICES: readonly IconChoice[] = ["ihm", "j"];
export type KBase = "ihm" | "j";

/** A suspect part (section 12): A, its shiny behaviour disagrees with its colour family's; B, the icon's share of
 * pixels that change when shiny is far from the battle sprite's. */
export interface IconSuspect { kind: "A" | "B"; px: number; why: string }

/** An icon in index.json. */
export interface IconReviewEntry {
  key: string;
  label: string;
  num: number;
  kind: "base" | "female" | "form" | "palette_form";
  differ: boolean;
  differ_frac: number;
  differ_px: { normal: number; shiny: number };
  suspects: IconSuspect[];
  suspect_px: number;
  /** The extra candidates (g2, h, ih, k) of an icon flagged or kept on one of them; empty or missing for the others. */
  candidates?: IconChoice[];
}

export interface IconReviewIndex {
  generated: string;
  icons: number;
  differ: number;
  suspects: number;
  errors: { key: string; error: string }[];
  entries: IconReviewEntry[];
}

/** One candidate: its pixels (2048 bytes as hex: two 32x32 frames, frame 0 above), slots 1-13 as battle indices.
 * swaps: the twin swaps (IHM, J, K); moves: J's family moves; K's changes and the pick it started from. */
export interface IconCandidate {
  pixels: string; slots: number[]; swaps?: number[][]; moves?: unknown[]; changes?: string[]; base?: KBase;
}

/** icons/<key>/icon.json. */
export interface IconReviewDetail {
  key: string;
  label: string;
  num: number;
  kind: string;
  icon: string;
  group: string;
  art: string;
  vanilla: { pixels: string; palette: string[] };
  normal: string[];
  shiny: string[];
  /** The fixed outline greys of slots 14 and 15. */
  greys: string[];
  ihm: IconCandidate;
  j: IconCandidate;
  /** The extra candidates (IconReviewEntry.candidates). */
  candidates?: Partial<Record<IconChoice, IconCandidate>>;
  suspects: (IconSuspect & { index: number })[];
  front?: { width: number; height: number; pixels: string; path: string };
}

export interface GenerateState { running: boolean; ok: boolean | null; output: string; startedAt: number | null }

/** The choices file's content: the base each icon is fixed from, the icons flagged to fix by hand, and the pick each
 * icon's K was built from (recorded when an extra candidate is kept). */
export interface ReviewChoices { choices: Record<string, IconChoice>; fixByHand: string[]; kBase: Record<string, KBase> }

export interface IconReviewState extends ReviewChoices {
  /** Whether build/icon_review/index.json is there. */
  ready: boolean;
  index: IconReviewIndex | null;
  generate: GenerateState;
}

export function isChoice(v: unknown): v is IconChoice {
  return typeof v === "string" && (CHOICES as readonly string[]).includes(v);
}

const KEY = /^[a-z0-9_]+$/;

/** The choices file's content; empty while it's missing. Entries that aren't a known choice or icon key are left out. */
export function readChoices(root: string): ReviewChoices {
  const out: ReviewChoices = { choices: {}, fixByHand: [], kBase: {} };
  const path = join(root, CHOICES_FILE);
  if (!existsSync(path)) return out;
  const data = toPlain(parseJson(readFileSync(path, "utf8")));
  if (!data || typeof data !== "object" || Array.isArray(data)) return out;
  const { choices, fix_by_hand: flagged, k_base: kBase } = data as { choices?: unknown; fix_by_hand?: unknown; k_base?: unknown };
  if (choices && typeof choices === "object" && !Array.isArray(choices))
    for (const [k, v] of Object.entries(choices as Record<string, unknown>)) if (KEY.test(k) && isChoice(v)) out.choices[k] = v;
  if (kBase && typeof kBase === "object" && !Array.isArray(kBase))
    for (const [k, v] of Object.entries(kBase as Record<string, unknown>)) if (KEY.test(k) && (v === "ihm" || v === "j")) out.kBase[k] = v;
  if (Array.isArray(flagged)) out.fixByHand = [...new Set(flagged.filter((k): k is string => typeof k === "string" && KEY.test(k)))].sort();
  return out;
}

/** The file's text: the keys sorted, written as the data tools write JSON; k_base only when it has entries. */
export function choicesText(file: ReviewChoices): string {
  const sorted = <T>(o: Record<string, T>) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  const kBase = file.kBase ?? {};
  return fileText(fromPlain({ choices: sorted(file.choices), fix_by_hand: [...file.fixByHand].sort(),
    ...(Object.keys(kBase).length ? { k_base: sorted(kBase) } : {}) }));
}

export function readIndex(root: string): IconReviewIndex | null {
  const path = join(root, REVIEW_DIR, "index.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as IconReviewIndex;
  } catch {
    return null;
  }
}

/** An icon's candidates, or null for a key the review doesn't have. */
export function readDetail(root: string, key: string): IconReviewDetail | null {
  if (!KEY.test(key)) return null;
  const path = join(root, REVIEW_DIR, "icons", key, "icon.json");
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as IconReviewDetail) : null;
}

/** Sets (or with null clears) one icon's choice, or sets or clears its fix-by-hand flag, and writes the file; the content
 * after. A choice of "ihm" for an icon where IHM and J are the same is no entry. Keeping a candidate of an icon with
 * extra candidates records the pick its K was built from (k_base), so K stays the same when generated again; a choice
 * without them, clearing the choice, or leaving the extra candidates' set (unflagged on IHM or J) drops it. Changes
 * run one after another, so quick clicks never lose one. */
export class ChoiceWriter {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private root: string, private write: (path: string, text: string) => Promise<void>) {}

  /** unflag: also clears the fix-by-hand flag, in the same write. */
  set(key: string, choice: IconChoice | null, unflag = false): Promise<ReviewChoices> {
    if (choice !== null && !isChoice(choice)) return Promise.reject(new Error(`Not a choice: ${String(choice)}`));
    if (typeof unflag !== "boolean") return Promise.reject(new Error(`Not a flag: ${String(unflag)}`));
    const entry = this.entryOf(key);
    if (entry instanceof Error) return Promise.reject(entry);
    if (choice !== null && !BASE_CHOICES.includes(choice) && entry && !(entry.candidates ?? []).includes(choice))
      return Promise.reject(new Error(`${key} has no ${choice.toUpperCase()} candidate: only icons flagged to fix by hand get one (generate again after flagging)`));
    const kBase = (entry?.candidates ?? []).includes("k") ? readDetail(this.root, key)?.candidates?.k?.base : undefined;
    return this.change((file) => {
      if (choice === null || (choice === "ihm" && entry && !entry.differ)) delete file.choices[key];
      else file.choices[key] = choice;
      if (unflag) file.fixByHand = file.fixByHand.filter((k) => k !== key);
      if (choice !== null && kBase) file.kBase[key] = kBase;
      else if (choice === null || !(entry?.candidates ?? []).length) delete file.kBase[key];
      this.dropKBaseOutside(file, key);
    });
  }

  flag(key: string, flag: boolean): Promise<ReviewChoices> {
    if (typeof flag !== "boolean") return Promise.reject(new Error(`Not a flag: ${String(flag)}`));
    const entry = this.entryOf(key);
    if (entry instanceof Error) return Promise.reject(entry);
    return this.change((file) => {
      file.fixByHand = file.fixByHand.filter((k) => k !== key);
      if (flag) file.fixByHand.push(key);
      this.dropKBaseOutside(file, key);
    });
  }

  /** An icon neither flagged nor kept on an extra candidate gets none when generated again: no k_base. */
  private dropKBaseOutside(file: ReviewChoices, key: string) {
    const c = file.choices[key];
    if (!file.fixByHand.includes(key) && (!c || BASE_CHOICES.includes(c))) delete file.kBase[key];
  }

  /** The review's entry for key (undefined without a review), or an error for a bad key. */
  private entryOf(key: string): IconReviewEntry | undefined | Error {
    if (!KEY.test(key)) return new Error(`Not an icon key: ${key}`);
    const index = readIndex(this.root);
    const entry = index?.entries.find((e) => e.key === key);
    return index && !entry ? new Error(`The review has no icon ${key}`) : entry;
  }

  private change(edit: (file: ReviewChoices) => void): Promise<ReviewChoices> {
    const next = this.queue.then(async () => {
      const file = readChoices(this.root);
      edit(file);
      file.fixByHand.sort();
      await this.write(CHOICES_FILE, choicesText(file));
      return file;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
}

/** Runs icon_remap.py generate in the background, one run at a time. */
export class ReviewGenerator {
  state: GenerateState = { running: false, ok: null, output: "", startedAt: null };

  /** args: the tool's arguments (tests point it at a fixture). */
  constructor(private root: string, private python: string, private args: string[] = [REMAP_TOOL, "generate"],
    private onDone?: (state: GenerateState) => void) {}

  start(): boolean {
    if (this.state.running) return false;
    this.state = { running: true, ok: null, output: "", startedAt: Date.now() };
    execFile(this.python, this.args, { cwd: this.root, maxBuffer: 16 << 20 }, (e, stdout, stderr) => {
      this.state = { running: false, ok: !e, output: `${stdout}${e ? stderr : ""}`.trim(), startedAt: this.state.startedAt };
      this.onDone?.(this.state);
    });
    return true;
  }
}

export function reviewState(root: string, generator: ReviewGenerator): IconReviewState {
  const index = readIndex(root);
  return { ready: index !== null, index, ...readChoices(root), generate: generator.state };
}
