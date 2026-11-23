// The Sprite Editor's logic, kept apart from the page so it can edit other indexed sprites later and be tested: an
// indexed sprite (a palette index per pixel), how its indices meet the palettes it is drawn with (a binding), the
// tools (pencil, fill, replace, eyedropper), the palette swap of the views, the undo history, and the review marks
// (hand-edited, checked) with the species navigation's filters and stepping.
//
// Two bindings so far (tools/paperwhite2/sprite_edit.py has the files):
// - an icon on its battle palettes: index 0 transparent, 1-13 its "slots" (battle indices, coloured through normal.pal
//   or shiny.pal), 14-15 the two fixed vanilla outline greys; painting a battle index the icon hasn't yet takes a free
//   slot (13 at most);
// - a sheet: its indices are the palette's own (a walking or follower sheet on its battle palette, or an opted-out
//   sheet on its own sprite.pal); index 0 transparent.

export type Rgb = [number, number, number];

/** An indexed sprite's pixels: a palette index per pixel, in rows. */
export interface Sprite {
  width: number;
  height: number;
  pixels: Uint8Array;
}

/** What the page paints with, as the swatches name it: a palette index (a battle index for an icon), one of the
 * icon's two outline greys (0 light, 1 dark), or transparency. */
export type Swatch = { kind: "palette"; index: number } | { kind: "grey"; which: 0 | 1 } | { kind: "transparent" };

/** The icon's fixed outline greys, its indices 14 and 15 (shiny-icons.md section 8). */
export const GREYS: Rgb[] = [[0x62, 0x62, 0x5a], [0x41, 0x41, 0x41]];
export const ICON_SLOTS = 13;
export const ICON_GREY = 14;

export type Binding = { kind: "icon"; slots: number[] } | { kind: "sheet" };

/** The state the history keeps: the pixels, and an icon's slots (painting can add one). */
export interface Snapshot {
  pixels: Uint8Array;
  slots: number[];
}

/** A sprite index's colour, null for transparency (and an icon index past its slots). */
export function indexColour(binding: Binding, palette: Rgb[], index: number): Rgb | null {
  if (index === 0) return null;
  if (binding.kind === "sheet") return palette[index] ?? null;
  if (index >= ICON_GREY) return GREYS[index - ICON_GREY] ?? null;
  const battle = binding.slots[index - 1];
  return battle === undefined ? null : palette[battle] ?? null;
}

/** Every sprite index's colour (16), for drawing. */
export function spriteColours(binding: Binding, palette: Rgb[]): (Rgb | null)[] {
  return Array.from({ length: 16 }, (_, i) => indexColour(binding, palette, i));
}

/** The sprite index a swatch paints, with an icon's slots after it (a new battle index takes an unused slot, or one
 * past the last), or an error to show (an icon with 13 battle colours already; a grey on a sheet). */
export function paintIndex(binding: Binding, swatch: Swatch, pixels: Uint8Array): { index: number; slots: number[] } | { error: string } {
  const slots = binding.kind === "icon" ? binding.slots : [];
  if (swatch.kind === "transparent") return { index: 0, slots };
  if (binding.kind === "sheet") {
    if (swatch.kind === "grey") return { error: "A sheet has no outline greys: pick one of its colours" };
    return { index: swatch.index, slots };
  }
  if (swatch.kind === "grey") return { index: ICON_GREY + swatch.which, slots };
  if (swatch.index === 0) return { index: 0, slots };
  const at = slots.indexOf(swatch.index);
  if (at >= 0) return { index: at + 1, slots };
  // A slot no pixel uses any more is taken again before a new one
  const used = new Set(pixels);
  const free = slots.findIndex((_, i) => !used.has(i + 1));
  if (free >= 0) return { index: free + 1, slots: slots.map((s, i) => (i === free ? swatch.index : s)) };
  if (slots.length >= ICON_SLOTS)
    return { error: `The icon already has ${ICON_SLOTS} battle colours (and the two greys): paint over one of them everywhere first, or pick one it has` };
  return { index: slots.length + 1, slots: [...slots, swatch.index] };
}

/** The swatch a sprite index samples as (null for transparency, which the eyedropper leaves alone). */
export function swatchOfIndex(binding: Binding, index: number): Swatch | null {
  if (index === 0) return null;
  if (binding.kind === "sheet") return { kind: "palette", index };
  if (index >= ICON_GREY) return { kind: "grey", which: (index - ICON_GREY) as 0 | 1 };
  const battle = binding.slots[index - 1];
  return battle === undefined ? null : { kind: "palette", index: battle };
}

export function sameSwatch(a: Swatch | null, b: Swatch | null): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "palette" && b.kind === "palette") return a.index === b.index;
  if (a.kind === "grey" && b.kind === "grey") return a.which === b.which;
  return true;
}

/** The pixels within a square brush of size centred (for even sizes, down-right of) x, y, clipped to the area. */
export function brushPixels(x: number, y: number, size: number, area: { x: number; y: number; width: number; height: number }): [number, number][] {
  const out: [number, number][] = [];
  const start = -Math.floor((size - 1) / 2);
  for (let dy = start; dy < start + size; dy++)
    for (let dx = start; dx < start + size; dx++) {
      const px = x + dx, py = y + dy;
      if (px >= area.x && py >= area.y && px < area.x + area.width && py < area.y + area.height) out.push([px, py]);
    }
  return out;
}

/** The pixels from x0,y0 to x1,y1 (a drag between two pointer events), so a fast stroke leaves no gaps. */
export function linePixels(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) return out;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Sets pixels to index; a copy, or the same array when nothing changed. */
export function paint(sprite: Sprite, points: [number, number][], index: number): Uint8Array {
  let out: Uint8Array | null = null;
  for (const [x, y] of points) {
    if (x < 0 || y < 0 || x >= sprite.width || y >= sprite.height) continue;
    const at = y * sprite.width + x;
    if (sprite.pixels[at] === index) continue;
    out ??= sprite.pixels.slice();
    out[at] = index;
  }
  return out ?? sprite.pixels;
}

/** A 4-connected flood of the index at x, y, within area (a frame of the sheet), with index; a copy, or the same
 * array when nothing changed. */
export function fill(sprite: Sprite, x: number, y: number, index: number,
                     area = { x: 0, y: 0, width: sprite.width, height: sprite.height }): Uint8Array {
  const { width, pixels } = sprite;
  const inside = (px: number, py: number) => px >= area.x && py >= area.y && px < area.x + area.width && py < area.y + area.height;
  if (!inside(x, y)) return pixels;
  const from = pixels[y * width + x];
  if (from === index) return pixels;
  const out = pixels.slice();
  const stack: [number, number][] = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop()!;
    if (!inside(px, py) || out[py * width + px] !== from) continue;
    out[py * width + px] = index;
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  return out;
}

/** The icon as it is saved (sprite_edit.canonical): a battle index in one slot only (a later slot repeating an earlier
 * one's merges into it, the same colours normal and shiny), slots no pixel uses dropped, the order kept. */
export function canonicalIcon(snapshot: Snapshot): Snapshot {
  const used = new Set(snapshot.pixels);
  const newOf = new Map<number, number>([[0, 0], [14, 14], [15, 15]]);
  const slots: number[] = [];
  snapshot.slots.forEach((battle, i) => {
    if (!used.has(i + 1)) return;
    const at = slots.indexOf(battle);
    if (at >= 0) newOf.set(i + 1, at + 1);
    else newOf.set(i + 1, slots.push(battle));
  });
  const pixels = snapshot.pixels.map((v) => newOf.get(v) ?? v);
  return { pixels, slots };
}

/** A coloured pixel turned transparent between two states: never without the transparent swatch (the page checks
 * every stroke with this). */
export function clearedPixels(before: Uint8Array, after: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < before.length; i++) if (before[i] && !after[i]) n++;
  return n;
}

export type View = "normal" | "shiny";

/** The palette swap: the big views (the battle sprite and the sprite being edited) show the page's palette, and the
 * references above them the other one; clicking a reference swaps them. Editing stays on the same indices. */
export function viewPalettes(view: View): { main: View; other: View } {
  return { main: view, other: view === "normal" ? "shiny" : "normal" };
}

/** The frames of a sprite: an icon's two 32x32 frames one above the other, a sheet's square frames side by side. */
export interface Frame { x: number; y: number; width: number; height: number }

export function framesOf(sprite: { width: number; height: number }, layout: "icon" | "sheet"): Frame[] {
  if (layout === "icon") {
    const size = sprite.width;
    return Array.from({ length: Math.max(1, Math.floor(sprite.height / size)) }, (_, i) => ({ x: 0, y: i * size, width: size, height: size }));
  }
  const size = Math.min(sprite.width, sprite.height);
  return Array.from({ length: Math.max(1, Math.floor(sprite.width / size)) }, (_, i) => ({ x: i * size, y: 0, width: size, height: size }));
}

/** The walking sheets' frame names, as the follower pages call them (FollowerSprites.tsx). */
export const SHEET_FRAME_NAMES = ["Up", "Up step", "Down", "Down step", "Left", "Left step", "Right", "Right step"];

/** Undo and redo of snapshots: a stroke is one step. */
export class History {
  private past: Snapshot[] = [];
  private future: Snapshot[] = [];

  constructor(private limit = 200) {}

  /** Records the state before a change. */
  push(before: Snapshot) {
    this.past.push(before);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  undo(current: Snapshot): Snapshot | null {
    const s = this.past.pop();
    if (s) this.future.push(current);
    return s ?? null;
  }

  redo(current: Snapshot): Snapshot | null {
    const s = this.future.pop();
    if (s) this.past.push(current);
    return s ?? null;
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
}

export function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  if (a.pixels.length !== b.pixels.length || a.slots.length !== b.slots.length) return false;
  for (let i = 0; i < a.pixels.length; i++) if (a.pixels[i] !== b.pixels[i]) return false;
  return a.slots.every((s, i) => s === b.slots[i]);
}

export const toHex = (pixels: Uint8Array) => Array.from(pixels, (v) => v.toString(16).padStart(2, "0")).join("");

// ---------------------------------------------------------------- What the page edits

/** An icon key's files (sprite_edit.icon_paths): fakemon, fakemon_female, fakemon_form_1. */
export function iconFiles(key: string): { folder: string; species: string; form: number; female: boolean; png: string; json: string; vanilla: string } {
  const female = key.endsWith("_female");
  let name = female ? key.slice(0, -"_female".length) : key;
  let form = 0;
  const m = /^(.+)_form_(\d+)$/.exec(name);
  if (m) { name = m[1]; form = Number(m[2]); }
  const folder = form ? `res/pokemon/${name}/form_${form}` : `res/pokemon/${name}`;
  const stem = female ? "icon_female_battle" : "icon_battle";
  return { folder, species: name, form, female, png: `${folder}/${stem}.png`, json: `${folder}/${stem}.json`,
    vanilla: `${folder}/${female ? "icon_female" : "icon"}.png` };
}

/** The icon key of an icon_battle file's path, or null. */
export function iconKeyOf(path: string): string | null {
  const m = /^res\/pokemon\/([a-z0-9_]+)(?:\/form_(\d+))?\/(icon_battle|icon_female_battle)\.png$/.exec(path);
  if (!m) return null;
  return `${m[1]}${m[2] ? `_form_${m[2]}` : ""}${m[3] === "icon_female_battle" ? "_female" : ""}`;
}

// ---------------------------------------------------------------- The review marks

/** The review marks (sprite_edit.py writes them): for the icons and, apart, the walking and follower sheets. */
export const REVIEW_FILE = "res/paperwhite2/sprite_review.json";

export type ReviewKind = "icons" | "followers";
export type Review = Record<ReviewKind, { hand_edited: string[]; checked: string[] }>;

export const emptyReview = (): Review => ({ icons: { hand_edited: [], checked: [] }, followers: { hand_edited: [], checked: [] } });

/** The marks file's text (null: missing) as marks, every kind and mark present. */
export function readReview(text: string | null): Review {
  const out = emptyReview();
  if (text === null) return out;
  const data = JSON.parse(text) as Record<string, Record<string, unknown> | undefined>;
  for (const kind of ["icons", "followers"] as const)
    for (const mark of ["hand_edited", "checked"] as const) {
      const list = data?.[kind]?.[mark];
      out[kind][mark] = Array.isArray(list) ? [...new Set(list.filter((k): k is string => typeof k === "string"))].sort() : [];
    }
  return out;
}

/** A sheet's key in the marks: its folder under res/field/actors (followers/fakemon). */
export const sheetKey = (folder: string) => folder.replace(/^res\/field\/actors\//, "");

/** One kind's marks as sets, for lookups. */
export interface MarkSets { hand: Set<string>; checked: Set<string> }
export const markSets = (review: Review, kind: ReviewKind): MarkSets =>
  ({ hand: new Set(review[kind].hand_edited), checked: new Set(review[kind].checked) });

/** What the species navigation shows. */
export type ReviewFilter = "all" | "unchecked" | "checked" | "hand" | "generated";
export const REVIEW_FILTERS: { id: ReviewFilter; label: string; note: string }[] = [
  { id: "all", label: "All", note: "Every sprite of this kind." },
  { id: "unchecked", label: "Not checked", note: "Those with a sprite of this kind not yet marked checked." },
  { id: "checked", label: "Checked", note: "Those whose sprites of this kind are all marked checked." },
  { id: "hand", label: "Hand-edited", note: "Those with a sprite of this kind drawn or changed by hand." },
  { id: "generated", label: "Generated only", note: "Those whose sprites of this kind are all as the remap generated them." },
];

/** Whether a species shows under a filter, by the review keys of its sprites of the kind shown (an icon key; its
 * sheets' keys). A species with no sprite of the kind never shows. */
export function matchesFilter(keys: string[], marks: MarkSets, filter: ReviewFilter): boolean {
  if (!keys.length) return false;
  const checked = keys.filter((k) => marks.checked.has(k)).length;
  const hand = keys.some((k) => marks.hand.has(k));
  switch (filter) {
    case "all": return true;
    case "unchecked": return checked < keys.length;
    case "checked": return checked === keys.length;
    case "hand": return hand;
    case "generated": return !hand;
  }
}

/** The previous or next key that shows, from current's place in the whole list (so stepping works from a species the
 * filter no longer shows, such as one just marked checked under "Not checked"); null at the end. */
export function stepKey(order: string[], shown: Set<string>, current: string | null, by: 1 | -1): string | null {
  let at = current === null ? -1 : order.indexOf(current);
  if (at < 0) at = by > 0 ? -1 : order.length;
  for (let i = at + by; i >= 0 && i < order.length; i += by) if (shown.has(order[i])) return order[i];
  return null;
}

// ---------------------------------------------------------------- Replace

/** The pixels of one index, in area (a frame) or the whole sprite. */
export function indexPixels(sprite: Sprite, index: number, area: Frame | null): [number, number][] {
  const a = area ?? { x: 0, y: 0, width: sprite.width, height: sprite.height };
  const out: [number, number][] = [];
  for (let y = a.y; y < a.y + a.height; y++)
    for (let x = a.x; x < a.x + a.width; x++) if (sprite.pixels[y * sprite.width + x] === index) out.push([x, y]);
  return out;
}

/** The Replace tool: every pixel of the index at x, y, in area (null: every frame), becomes the swatch's index, as the
 * pencil paints it (an icon takes a slot for a new battle index; only the transparent swatch clears). The replaced
 * index's slot counts as free when no pixel keeps it, so an icon with 13 colours can swap one for another. The points
 * it changes, the state after, or an error; points is empty when nothing would change. */
export function replaceIndex(binding: Binding, swatch: Swatch, snapshot: Snapshot, size: { width: number; height: number },
                             x: number, y: number, area: Frame | null):
    { points: [number, number][]; index: number; after: Snapshot } | { error: string } {
  const sprite: Sprite = { ...size, pixels: snapshot.pixels };
  const from = snapshot.pixels[y * size.width + x];
  const points = indexPixels(sprite, from, area);
  const probe = paint(sprite, points, 0);
  const r = paintIndex(binding, swatch, probe === snapshot.pixels ? snapshot.pixels : probe);
  if ("error" in r) return r;
  const pixels = paint(sprite, points, r.index);
  const slots = binding.kind === "icon" ? r.slots : snapshot.slots;
  const after = { pixels, slots };
  return sameSnapshot(after, snapshot) ? { points: [], index: from, after: snapshot } : { points, index: r.index, after };
}
