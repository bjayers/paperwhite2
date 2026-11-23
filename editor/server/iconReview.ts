// The Icon review page's server side (temporary, docs/paperwhite2/design/shiny-icons.md section 13): the candidates
// tools/paperwhite2/icon_remap.py writes to build/icon_review/ (ignored, regenerable), and the user's choice per icon
// in res/paperwhite2/icon_remap_choices.json ({icon key: "ihm" | "j" | "manual"}; an icon without an entry keeps IHM).

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileText, fromPlain, parseJson, toPlain } from "../shared/json.ts";

export const REVIEW_DIR = "build/icon_review";
export const CHOICES_FILE = "res/paperwhite2/icon_remap_choices.json";
export const REMAP_TOOL = "tools/paperwhite2/icon_remap.py";
export const CHOICES = ["ihm", "j", "manual"] as const;
export type IconChoice = (typeof CHOICES)[number];

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
}

export interface IconReviewIndex {
  generated: string;
  icons: number;
  differ: number;
  suspects: number;
  errors: { key: string; error: string }[];
  entries: IconReviewEntry[];
}

/** One candidate: its pixels (2048 bytes as hex: two 32x32 frames, frame 0 above), slots 1-13 as battle indices. */
export interface IconCandidate { pixels: string; slots: number[]; swaps: number[][]; moves?: unknown[] }

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
  suspects: (IconSuspect & { index: number })[];
  front?: { width: number; height: number; pixels: string; path: string };
}

export interface GenerateState { running: boolean; ok: boolean | null; output: string; startedAt: number | null }

export interface IconReviewState {
  /** Whether build/icon_review/index.json is there. */
  ready: boolean;
  index: IconReviewIndex | null;
  choices: Record<string, IconChoice>;
  generate: GenerateState;
}

export function isChoice(v: unknown): v is IconChoice {
  return typeof v === "string" && (CHOICES as readonly string[]).includes(v);
}

const KEY = /^[a-z0-9_]+$/;

/** The choices file's entries; none while it's missing. Entries that aren't a known choice are left out. */
export function readChoices(root: string): Record<string, IconChoice> {
  const path = join(root, CHOICES_FILE);
  if (!existsSync(path)) return {};
  const data = toPlain(parseJson(readFileSync(path, "utf8")));
  const out: Record<string, IconChoice> = {};
  if (data && typeof data === "object" && !Array.isArray(data))
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) if (KEY.test(k) && isChoice(v)) out[k] = v;
  return out;
}

/** The file's text: the keys sorted, written as the data tools write JSON. */
export function choicesText(choices: Record<string, IconChoice>): string {
  const sorted: Record<string, IconChoice> = {};
  for (const k of Object.keys(choices).sort()) sorted[k] = choices[k];
  return fileText(fromPlain(sorted));
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

/** Sets (or with null clears) one icon's choice and writes the file; the choices after. A choice of "ihm" for an icon
 * where IHM and J are the same is no entry. Changes run one after another, so quick clicks never lose one. */
export class ChoiceWriter {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private root: string, private write: (path: string, text: string) => Promise<void>) {}

  set(key: string, choice: IconChoice | null): Promise<Record<string, IconChoice>> {
    if (!KEY.test(key)) return Promise.reject(new Error(`Not an icon key: ${key}`));
    if (choice !== null && !isChoice(choice)) return Promise.reject(new Error(`Not a choice: ${String(choice)}`));
    const index = readIndex(this.root);
    const entry = index?.entries.find((e) => e.key === key);
    if (index && !entry) return Promise.reject(new Error(`The review has no icon ${key}`));
    const next = this.queue.then(async () => {
      const choices = readChoices(this.root);
      if (choice === null || (choice === "ihm" && entry && !entry.differ)) delete choices[key];
      else choices[key] = choice;
      await this.write(CHOICES_FILE, choicesText(choices));
      return choices;
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
  return { ready: index !== null, index, choices: readChoices(root), generate: generator.state };
}
