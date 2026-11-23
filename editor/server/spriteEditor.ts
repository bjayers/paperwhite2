// The Sprite Editor's server side (docs/paperwhite2/design/shiny-icons.md section 15): saving an icon on its battle
// palettes or a walking/follower sheet through tools/paperwhite2/sprite_edit.py, which writes the files as the tools do
// (indexed PNG, the icon's slots JSON) and refuses what doesn't fit; and a sheet as it was before the battle-palette
// remap (commit 6d04855193's parent, read from git), for reference; and the review marks (hand-edited, checked) in
// res/paperwhite2/sprite_review.json, where a save that changes a sprite marks it hand-edited.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const SPRITE_EDIT_TOOL = "tools/paperwhite2/sprite_edit.py";
/** The commit before the overworld sheets moved onto the battle palettes (follower-palette-remap.md section 9). */
export const BEFORE_REMAP = "6d04855193^";

export type SpriteSave =
  | { kind: "icon"; key: string; pixels: string; slots: number[] }
  | { kind: "sheet"; folder: string; pixels: string };

/** handEdited: the save changed the sprite, so sprite_edit.py marked it hand-edited (res/paperwhite2/sprite_review.json). */
export interface SpriteSaveResult { ok: boolean; written?: string[]; handEdited?: boolean; error?: string }

export type ReviewKind = "icons" | "followers";
export type ReviewMark = "hand_edited" | "checked";
export type ReviewMarks = Record<ReviewKind, Record<ReviewMark, string[]>>;
export interface SpriteMark { kind: ReviewKind; key: string; mark: ReviewMark; on: boolean }
export interface SpriteMarkResult { ok: boolean; review?: ReviewMarks; error?: string }

type Runner = (script: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;

const KEY = /^[a-z0-9_]+$/;
/** A sheet's folder: res/field/actors/<pokemon|followers>/<name>. */
const SHEET = /^res\/field\/actors\/(pokemon|followers)\/[a-z0-9_]+$/;

/** Checks the request's shape (the tool checks the content) and runs the tool; res: the --res folder. */
export async function saveSprite(run: Runner, res: string, body: unknown): Promise<SpriteSaveResult> {
  const b = body as Partial<SpriteSave> | null;
  if (!b || typeof b !== "object" || typeof b.pixels !== "string" || !/^([0-9a-f]{2})*$/.test(b.pixels))
    return { ok: false, error: "Give the pixels as hex" };
  let args: string[];
  if (b.kind === "icon") {
    if (typeof b.key !== "string" || !KEY.test(b.key)) return { ok: false, error: "Name an icon" };
    if (!Array.isArray(b.slots) || b.slots.some((s) => !Number.isInteger(s))) return { ok: false, error: "Give the icon's slots" };
    args = ["save-icon", b.key];
  } else if (b.kind === "sheet") {
    if (typeof b.folder !== "string" || !SHEET.test(b.folder)) return { ok: false, error: "Name a sheet's folder under res/field/actors" };
    args = ["save-sheet", b.folder.slice("res/".length)];
  } else {
    return { ok: false, error: "Save an icon or a sheet" };
  }
  const dir = mkdtempSync(join(tmpdir(), "paperwhite-sprite-edit-"));
  try {
    const data = join(dir, "data.json");
    writeFileSync(data, JSON.stringify(b.kind === "icon" ? { pixels: b.pixels, slots: b.slots } : { pixels: b.pixels }));
    const result = await run(SPRITE_EDIT_TOOL, [...args, data, "--res", res]);
    const line = result.stdout.trim().split("\n").pop() ?? "";
    if (!line.startsWith("{")) return { ok: false, error: result.stderr.trim().split("\n").pop() || "sprite_edit.py failed" };
    const out = JSON.parse(line) as { ok: boolean; written?: string[]; hand_edited?: boolean; error?: string };
    return out.ok ? { ok: true, written: out.written, handEdited: !!out.hand_edited } : { ok: false, error: out.error };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A sprite's key in the review marks: an icon key, or a sheet's folder under res/field/actors (followers/fakemon). */
const MARK_KEY = /^([a-z0-9_]+|(pokemon|followers)\/[a-z0-9_]+)$/;

/** Sets or clears a review mark (sprite_edit.py mark), returning every mark. */
export async function markSprite(run: Runner, res: string, body: unknown): Promise<SpriteMarkResult> {
  const b = body as Partial<SpriteMark> | null;
  if (!b || typeof b !== "object" || (b.kind !== "icons" && b.kind !== "followers") || (b.mark !== "hand_edited" && b.mark !== "checked")
      || typeof b.key !== "string" || !MARK_KEY.test(b.key) || typeof b.on !== "boolean")
    return { ok: false, error: "Name a sprite and a mark" };
  const result = await run(SPRITE_EDIT_TOOL, ["mark", b.kind, b.key, b.mark, b.on ? "on" : "off", "--res", res]);
  const line = result.stdout.trim().split("\n").pop() ?? "";
  if (!line.startsWith("{")) return { ok: false, error: result.stderr.trim().split("\n").pop() || "sprite_edit.py failed" };
  return JSON.parse(line) as SpriteMarkResult;
}

/** The paths of a sheet before the remap: its sprite.png and sprite.pal (the pal null where it had none). */
export function beforeRemapPaths(folder: string): { png: string; pal: string } | null {
  return SHEET.test(folder) ? { png: `${folder}/sprite.png`, pal: `${folder}/sprite.pal` } : null;
}
