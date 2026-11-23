// The Sprite Editor: pixel editing of a Pokémon's party/box icon on its battle palettes (icon_battle.png and its slots,
// tools/paperwhite2/sprite_edit.py) and of its walking and follower sheets, beside its battle sprite for reference and
// sampling (docs/paperwhite2/design/shiny-icons.md section 15). Left: the battle sprite, the other palette above it,
// the palette's swatches below. Right: the sprite being edited, large, with the vanilla art and the other palette
// above it. Clicking either reference in the other palette swaps the page's palette: editing stays on the same
// indices. The review marks (res/paperwhite2/sprite_review.json: hand-edited, set by a save that changes the sprite, and
// checked, the user's pass), kept apart for icons and sheets, filter the species navigation. The logic is model.ts's.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api.ts";
import { documents } from "../../documents.ts";
import { SearchSelect, type Option } from "../../shell/SearchSelect.tsx";
import { useToolActive } from "../active.ts";
import { FIELD_ACTOR_SCHEMA } from "../followers/data.ts";
import { fromHex, parsePal, snap, toHex as rgbHex, writePal } from "../palettes/pal.ts";
import { readIndexedPng } from "../palettes/png.ts";
import { paletteOf } from "../palettes/sheetColors.ts";
import type { ToolProps } from "../types.ts";
import { SpriteCanvas, type Backdrop } from "./SpriteCanvas.tsx";
import { GREYS, History, ICON_SLOTS, REVIEW_FILE, REVIEW_FILTERS, SHEET_FRAME_NAMES, brushPixels, canonicalIcon, emptyReview, fill, framesOf,
  iconFiles, iconKeyOf, indexColour, linePixels, markSets, matchesFilter, paint, paintIndex, readReview, replaceIndex, sameSnapshot, sameSwatch,
  sheetKey, spriteColours, stepKey, swatchOfIndex, toHex, viewPalettes,
  type Binding, type Review, type ReviewFilter, type ReviewKind, type Rgb, type Snapshot, type Sprite, type Swatch, type View } from "./model.ts";
import { TONE_FILE, readTone, tonedColours, type ToneParams } from "./tone.ts";

const SPECIES_SCHEMA = "res/pokemon/species.schema.json";
const ICON_GLOBS = ["res/pokemon/*/icon_battle.png", "res/pokemon/*/icon_female_battle.png", "res/pokemon/*/form_*/icon_battle.png"];
const ART_NAMES: [string, string][] = [["front_single", "Front"], ["back_single", "Back"], ["front", "Front sheet"], ["back", "Back sheet"]];
const REF_SCALE = 3;
const ZOOMS = [6, 8, 10, 12, 16, 20, 24];

type Tool = "pencil" | "fill" | "replace" | "eyedropper";
const TOOLS: { id: Tool; label: string; key: string; note: string }[] = [
  { id: "pencil", label: "Pencil", key: "S", note: "Paints the brush's pixels; the hover shows them first." },
  { id: "fill", label: "Fill", key: "Z", note: "Fills the pixels of one index joined to the clicked one (4-connected), in this frame." },
  { id: "replace", label: "Replace", key: "R", note: "Every pixel of the clicked index becomes the swatch's, in this frame or all frames; the hover shows them." },
  { id: "eyedropper", label: "Eyedropper", key: "Q", note: "Picks the colour under the pointer, on either side, then goes back to the last tool (Alt+click with any tool)." },
];
const TOOL_KEYS: Record<string, Tool> = { s: "pencil", z: "fill", r: "replace", q: "eyedropper" };

interface Subject {
  key: string;
  label: string;
  num: number;
  /** The battle group: res/pokemon/<species>[/form_<n>]. */
  group: string;
  species: string;
  female: boolean;
}

interface SheetInfo { folder: string; label: string; optOut: string | null }

/** What the right side edits. */
type Target = { kind: "icon" } | { kind: "sheet"; folder: string };

interface Loaded {
  id: string;
  layout: "icon" | "sheet";
  width: number;
  height: number;
  saved: Snapshot;
  normal: Rgb[];
  /** null for an opted-out sheet, which has no shiny colours. */
  shiny: Rgb[] | null;
  /** The palette files the swatches edit: the group's normal.pal and shiny.pal, or an opted-out sheet's sprite.pal. */
  palettes: { normal: string; shiny: string | null };
  linked: boolean;
  note: string;
  vanilla: { sprite: Sprite; colours: (Rgb | null)[]; caption: string } | null;
  vanillaNote: string;
}

interface Art { name: string; label: string; sprite: Sprite }

const words = (name: string) => name.split("_").map((w) => (w[0]?.toUpperCase() ?? "") + w.slice(1)).join(" ");

function asSprite(image: { width: number; height: number; pixels: Uint8Array }): Sprite {
  return { width: image.width, height: image.height, pixels: image.pixels };
}

async function readPalFile(path: string): Promise<Rgb[]> {
  return parsePal((await api.file(path)).text) as Rgb[];
}

function fromBase64(text: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  return bytes.buffer;
}

/** Loads the sprite a target edits, its palettes and its vanilla reference. */
async function loadTarget(subject: Subject, target: Target, sheets: SheetInfo[]): Promise<Loaded> {
  if (target.kind === "icon") {
    const files = iconFiles(subject.key);
    const [image, meta, normal, shiny] = await Promise.all([api.asset(files.png).then(readIndexedPng), api.file(files.json),
      readPalFile(`${subject.group}/normal.pal`), readPalFile(`${subject.group}/shiny.pal`)]);
    const slots = (JSON.parse(meta.text) as { slots: number[] }).slots;
    // The vanilla icon in its bank's colours (the PNG's own); a palette-only form shows its base's
    const own = await api.list(files.vanilla);
    const vanillaPath = own.length ? files.vanilla : `res/pokemon/${subject.species}/${subject.female ? "icon_female" : "icon"}.png`;
    const vanilla = await api.asset(vanillaPath).then(readIndexedPng).catch(() => null);
    return {
      id: `icon ${subject.key}`, layout: "icon", width: image.width, height: image.height,
      saved: { pixels: image.pixels, slots }, normal, shiny,
      palettes: { normal: `${subject.group}/normal.pal`, shiny: `${subject.group}/shiny.pal` }, linked: true,
      note: `Its ${ICON_SLOTS} slots take battle indices of ${subject.group.slice("res/pokemon/".length)}'s palettes, plus the two outline greys; the game still builds from the vanilla icon.png.`,
      vanilla: vanilla && { sprite: asSprite(vanilla), colours: vanilla.colors.map((c, i) => (i === 0 ? null : (c as Rgb))), caption: "Vanilla (its bank's colours)" },
      vanillaNote: own.length ? "" : "A palette-only form: the base icon.",
    };
  }
  const sheet = sheets.find((s) => s.folder === target.folder)!;
  const image = await api.asset(`${sheet.folder}/sprite.png`).then(readIndexedPng);
  const linked = !sheet.optOut;
  const normalPath = linked ? `${subject.group}/normal.pal` : `${sheet.folder}/sprite.pal`;
  const [normal, shiny] = await Promise.all([readPalFile(normalPath), linked ? readPalFile(`${subject.group}/shiny.pal`) : Promise.resolve(null)]);
  const before = await api.spriteBeforeRemap(sheet.folder).catch(() => ({ image: null, palette: null }));
  let vanilla: Loaded["vanilla"] = null;
  if (before.image) {
    const old = await readIndexedPng(fromBase64(before.image));
    const colours = (before.palette ? parsePal(before.palette) : old.colors) as Rgb[];
    vanilla = { sprite: asSprite(old), colours: colours.map((c, i) => (i === 0 ? null : c)), caption: "Before the remap (git)" };
  }
  return {
    id: `sheet ${sheet.folder}`, layout: "sheet", width: image.width, height: image.height,
    saved: { pixels: image.pixels, slots: [] }, normal, shiny,
    palettes: { normal: normalPath, shiny: linked ? `${subject.group}/shiny.pal` : null }, linked,
    note: linked
      ? `Indices of ${subject.group.slice("res/pokemon/".length)}'s battle palette: normal.pal colours it at build time, shiny.pal a shiny follower or wanderer.`
      : `Opted out (${sheet.optOut}): it keeps its own sprite.pal, with no link to the battle palettes and no shiny colours.`,
    vanilla, vanillaNote: vanilla ? "" : "No sheet here before the battle-palette remap.",
  };
}

export function SpriteEditor({ constants }: ToolProps) {
  const toolActive = useToolActive();
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [actorSheets, setActorSheets] = useState<{ folder: string; pokemon: string | null; optOut: string | null }[]>([]);
  const [review, setReview] = useState<Review>(emptyReview);
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [replaceAll, setReplaceAll] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>({ kind: "icon" });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [current, setCurrent] = useState<Snapshot | null>(null);
  const [savedState, setSavedState] = useState<Snapshot | null>(null);
  const [art, setArt] = useState<Art[]>([]);
  const [artName, setArtName] = useState("front_single");
  const [view, setView] = useState<View>("normal");
  const [tool, setTool] = useState<Tool>("pencil");
  // The tool the eyedropper goes back to after a pick
  const lastTool = useRef<Tool>("pencil");
  useEffect(() => { if (tool !== "eyedropper") lastTool.current = tool; }, [tool]);
  const afterPick = () => { if (tool === "eyedropper") setTool(lastTool.current); };
  const [brush, setBrush] = useState(1);
  const [zoom, setZoom] = useState(12);
  const [grid, setGrid] = useState(true);
  const [backdrop, setBackdrop] = useState<Backdrop>("checker");
  const [frame, setFrame] = useState(0);
  const [swatch, setSwatch] = useState<Swatch>({ kind: "palette", index: 1 });
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editColour, setEditColour] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  // The Game tone view of an icon (icon_tone.json's tone, as the build applies it when enabled)
  const [gameTone, setGameTone] = useState(true);
  const [toneParams, setToneParams] = useState<ToneParams | null>(null);
  const history = useRef(new History());
  const stroke = useRef<{ before: Snapshot; index: number; last: [number, number] } | null>(null);
  const [, setTick] = useState(0);

  // The icons and sheets there are, and the review marks
  useEffect(() => {
    let live = true;
    Promise.all([Promise.all(ICON_GLOBS.map((g) => api.list(g))).then((l) => l.flat()), api.data(SPECIES_SCHEMA, ["name"]),
      api.data(FIELD_ACTOR_SCHEMA, ["palette"]), api.list("res/field/actors/pokemon/*/sprite.png"), api.list("res/field/actors/followers/*/sprite.png")])
      .then(([icons, species, actors, walking, followers]) => {
        if (!live) return;
        const names = new Map(species.map((f) => [f.path.split("/")[2], String(f.data.name ?? "")]));
        const list = icons.flatMap((path): Subject[] => {
          const k = iconKeyOf(path);
          if (!k) return [];
          const f = iconFiles(k);
          const num = constants.get(`SPECIES_${f.species.toUpperCase()}`) ?? 99999;
          const name = names.get(f.species) || words(f.species);
          const label = `#${String(num).padStart(3, "0")} ${name}${f.form ? ` (form ${f.form})` : ""}${f.female ? " (female)" : ""}`;
          return [{ key: k, label, num, group: f.folder, species: f.species, female: f.female }];
        }).sort((a, b) => a.num - b.num || a.key.localeCompare(b.key));
        setSubjects(list);
        const withSheet = new Set([...walking, ...followers].map((p) => p.slice(0, -"/sprite.png".length)));
        setActorSheets(actors.flatMap(({ path, data }) => {
          const folder = path.slice(0, -"/data.json".length);
          const palette = paletteOf(data);
          if (!withSheet.has(folder) || !palette || palette.map) return [];
          return [{ folder, pokemon: palette.pokemon ?? null, optOut: palette.opt_out ?? null }];
        }));
      });
    return () => { live = false; };
  }, [constants]);

  const loadReview = useCallback(() => api.file(REVIEW_FILE).then((f) => setReview(readReview(f.text)), () => setReview(readReview(null))), []);
  useEffect(() => { loadReview(); }, [loadReview]);
  const loadTone = useCallback(() => api.file(TONE_FILE).then((f) => setToneParams(readTone(f.text)), () => setToneParams(null)), []);
  useEffect(() => { loadTone(); }, [loadTone]);

  // Each species' sheets: those whose "palette" names its group, and the opted-out ones under its species' name
  const sheetsByKey = useMemo(() => {
    const out = new Map<string, SheetInfo[]>();
    for (const subject of subjects ?? []) {
      const group = subject.group.slice("res/pokemon/".length);
      out.set(subject.key, actorSheets.filter((s) => s.pokemon === group || (s.optOut && (s.folder.endsWith(`/${subject.species}`) || s.folder.split("/").pop()!.startsWith(`${subject.species}_`))))
        .map((s) => ({ folder: s.folder, optOut: s.optOut,
          label: `${s.folder.includes("/followers/") ? "Follower" : "Walking"}: ${words(s.folder.split("/").pop()!)}` }))
        .sort((a, b) => a.label.localeCompare(b.label)));
    }
    return out;
  }, [subjects, actorSheets]);

  // The kind shown (an icon, or a walking/follower sheet), whose marks the navigation filters on
  const kind: ReviewKind = target.kind === "icon" ? "icons" : "followers";
  const marks = useMemo(() => ({ icons: markSets(review, "icons"), followers: markSets(review, "followers") }), [review]);
  const keysOf = useCallback((k: string, of: ReviewKind) => (of === "icons" ? [k] : (sheetsByKey.get(k) ?? []).map((s) => sheetKey(s.folder))), [sheetsByKey]);
  // The species in order for this kind: for sheets, those with any, once each (a female icon shares its species' sheets)
  const order = useMemo(() => {
    if (!subjects) return [];
    if (kind === "icons") return subjects.map((s) => s.key);
    const seen = new Set<string>();
    return subjects.flatMap((s) => {
      const keys = keysOf(s.key, "followers");
      const id = keys.join(" ");
      if (!keys.length || seen.has(id)) return [];
      seen.add(id);
      return [s.key];
    });
  }, [subjects, kind, keysOf]);
  const counts = useMemo(() => new Map(REVIEW_FILTERS.map((f) => [f.id, order.filter((k) => matchesFilter(keysOf(k, kind), marks[kind], f.id)).length])),
    [order, keysOf, kind, marks]);
  const shown = useMemo(() => order.filter((k) => matchesFilter(keysOf(k, kind), marks[kind], filter)), [order, keysOf, kind, marks, filter]);
  const shownSet = useMemo(() => new Set(shown), [shown]);
  useEffect(() => {
    if (subjects?.length && (!key || !subjects.some((s) => s.key === key))) setKey(shown[0] ?? subjects[0].key);
  }, [shown, key, subjects]);
  const subject = subjects?.find((s) => s.key === key) ?? null;
  const sheets = useMemo(() => (key ? sheetsByKey.get(key) ?? [] : []), [key, sheetsByKey]);
  // Progress of the pass: each kind's sprites checked
  const progress = useMemo(() => {
    const icons = subjects?.map((s) => s.key) ?? [];
    const sheetKeys = [...new Set([...sheetsByKey.values()].flat().map((s) => sheetKey(s.folder)))];
    return {
      icons: { checked: icons.filter((k) => marks.icons.checked.has(k)).length, total: icons.length },
      followers: { checked: sheetKeys.filter((k) => marks.followers.checked.has(k)).length, total: sheetKeys.length },
    };
  }, [subjects, sheetsByKey, marks]);

  const dirty = !!current && !!savedState && !sameSnapshot(current, savedState);

  // The target's sprite
  useEffect(() => {
    if (!subject) return;
    if (target.kind === "sheet" && !sheets.some((s) => s.folder === target.folder)) { setTarget({ kind: "icon" }); return; }
    let live = true;
    setMessage(null);
    loadTarget(subject, target, sheets).then((l) => {
      if (!live) return;
      setLoaded(l);
      setCurrent(l.saved);
      setSavedState(l.saved);
      history.current = new History();
      setFrame((f) => Math.min(f, framesOf(l, l.layout).length - 1));
    }, (e) => live && setMessage({ text: `Couldn't load it: ${(e as Error).message}`, error: true }));
    return () => { live = false; };
  }, [subject, target, sheets, epoch]);

  // The battle art (the form's own where it has it, else the species'; the female's for a female icon)
  useEffect(() => {
    if (!subject) return;
    let live = true;
    (async () => {
      const own = await api.list(`${subject.group}/*.png`);
      const folder = own.some((p) => p.endsWith("/front_single.png")) ? subject.group : `res/pokemon/${subject.species}`;
      const files = new Set(await api.list(`${folder}/*.png`));
      const out: Art[] = [];
      for (const [name, label] of ART_NAMES) {
        const path = subject.female && files.has(`${folder}/${name}_female.png`) ? `${folder}/${name}_female.png` : `${folder}/${name}.png`;
        if (!files.has(path)) continue;
        out.push({ name, label: `${label}${path.includes("_female") ? " (female)" : ""}`, sprite: asSprite(await api.asset(path).then(readIndexedPng)) });
      }
      if (live) setArt(out);
    })().catch(() => live && setArt([]));
    return () => { live = false; };
  }, [subject]);

  // The files changed on disk (a save here or elsewhere): read again when nothing is unsaved
  useEffect(() => documents.onFiles((paths) => {
    if (paths.includes(REVIEW_FILE)) loadReview();
    if (paths.includes(TONE_FILE)) loadTone();
    if (loaded && paths.some((p) => p.endsWith(".pal") && Object.values(loaded.palettes).includes(p))) setEpoch((n) => n + 1);
  }), [loaded, loadReview, loadTone]);

  const binding: Binding = loaded?.layout === "icon" && current ? { kind: "icon", slots: current.slots } : { kind: "sheet" };
  const { main, other } = viewPalettes(view);
  const paletteOfView = (v: View): Rgb[] => (v === "shiny" && loaded?.shiny ? loaded.shiny : loaded?.normal ?? []);
  const sprite: Sprite | null = loaded && current ? { width: loaded.width, height: loaded.height, pixels: current.pixels } : null;
  const frames = loaded ? framesOf(loaded, loaded.layout) : [];
  const area = frames[frame] ?? frames[0];
  const battle = art.find((a) => a.name === artName) ?? art[0] ?? null;
  const hasShiny = !!loaded?.shiny;
  // The edited icon's views (big, the other palette, the frames) in the game tone when it is on; the battle sprite,
  // the swatches and the vanilla reference keep their own colours
  const toned = loaded?.layout === "icon" && gameTone && !!toneParams && !!current;
  const viewColours = (v: View): (Rgb | null)[] => {
    const colours = spriteColours(binding, paletteOfView(v));
    return toned && current && toneParams ? tonedColours(colours, current.pixels, toneParams) : colours;
  };
  const toneNote = toneParams
    ? `Game tone: the icon as the game shows it with res/paperwhite2/icon_tone.json's tone (strength ${toneParams.strength}), `
      + `${toneParams.enabled ? "which the build applies (enabled)" : "which the build doesn't apply yet (\"enabled\": false)"}. `
      + "Only a view: editing stays on the same indices, and the battle sprite and swatches show the battle palette's own colours."
    : "Game tone: res/paperwhite2/icon_tone.json is missing or invalid.";

  // The latest state for the pointer's events, which can come faster than renders
  const live = useRef<Snapshot | null>(null);
  live.current = current;
  const change = (next: Snapshot) => { live.current = next; setCurrent(next); };

  // Another species, keeping the kind (an icon; a sheet of the same kind, follower or walking, where it has one) and
  // the frame where it has it
  const choose = (k: string) => {
    if (k === key) return;
    if (dirty && !confirm("The sprite has unsaved changes. Leave it without saving?")) return;
    setKey(k);
    if (target.kind === "sheet") {
      const next = sheetsByKey.get(k) ?? [];
      const followers = target.folder.includes("/followers/");
      const same = next.find((s) => s.folder.includes("/followers/") === followers) ?? next[0];
      setTarget(same ? { kind: "sheet", folder: same.folder } : { kind: "icon" });
    }
  };
  const step = (by: 1 | -1) => {
    const next = stepKey(order, shownSet, key, by);
    if (next) choose(next);
  };
  const chooseTarget = (t: Target) => {
    if (dirty && !confirm("The sprite has unsaved changes. Leave it without saving?")) return;
    setFrame(0);
    setTarget(t);
  };

  const onStroke = (x: number, y: number, phase: "start" | "move" | "end", alt: boolean) => {
    const current = live.current;
    if (!loaded || !current || !area) return;
    const sprite: Sprite = { width: loaded.width, height: loaded.height, pixels: current.pixels };
    const binding: Binding = loaded.layout === "icon" ? { kind: "icon", slots: current.slots } : { kind: "sheet" };
    if (phase === "start" && (alt || tool === "eyedropper")) {
      const s = swatchOfIndex(binding, sprite.pixels[y * sprite.width + x]);
      if (s) setSwatch(s);
      afterPick();
      return;
    }
    if (phase === "start" && tool === "replace") {
      const r = replaceIndex(binding, swatch, current, loaded, x, y, replaceAll ? null : area);
      if ("error" in r) { setMessage({ text: r.error, error: true }); return; }
      setMessage(null);
      if (r.points.length) {
        history.current.push(current);
        change(r.after);
      }
      return;
    }
    if (phase === "start") {
      const r = paintIndex(binding, swatch, current.pixels);
      if ("error" in r) { setMessage({ text: r.error, error: true }); return; }
      setMessage(null);
      if (tool === "fill") {
        const pixels = fill(sprite, x, y, r.index, area);
        if (pixels !== current.pixels || r.slots !== current.slots) {
          history.current.push(current);
          change({ pixels, slots: r.slots });
        }
        return;
      }
      stroke.current = { before: current, index: r.index, last: [x, y] };
      change({ pixels: paint(sprite, brushPixels(x, y, brush, area), r.index), slots: r.slots });
      return;
    }
    const s = stroke.current;
    if (!s) return;
    if (phase === "move") {
      const points = linePixels(s.last[0], s.last[1], x, y).flatMap(([px, py]) => brushPixels(px, py, brush, area));
      s.last = [x, y];
      change({ ...current, pixels: paint(sprite, points, s.index) });
      return;
    }
    stroke.current = null;
    if (!sameSnapshot(s.before, live.current!)) { history.current.push(s.before); setTick((n) => n + 1); }
  };

  const preview = (x: number, y: number) => {
    if (!area || tool === "eyedropper" || !current || !loaded) return null;
    if (tool === "replace") {
      // Every pixel that would change, in the new colour (those of the frame shown)
      const r = replaceIndex(binding, swatch, current, loaded, x, y, replaceAll ? null : area);
      if ("error" in r || !r.points.length) return null;
      const after: Binding = binding.kind === "icon" ? { kind: "icon", slots: r.after.slots } : binding;
      return { points: r.points, colour: indexColour(after, paletteOfView(main), r.index) };
    }
    const r = paintIndex(binding, swatch, current.pixels);
    if (!r || "error" in r) return null;
    // An index the icon already has shows in the view's colours (toned or not); a new slot in the battle colour
    const colour = binding.kind === "icon" && r.slots === binding.slots ? viewColours(main)[r.index]
      : indexColour({ ...binding, ...(binding.kind === "icon" ? { slots: r.slots } : {}) } as Binding, paletteOfView(main), r.index);
    return { points: tool === "fill" ? [[x, y] as [number, number]] : brushPixels(x, y, brush, area), colour };
  };

  const undo = () => { if (current) { const s = history.current.undo(current); if (s) change(s); } };
  const redo = () => { if (current) { const s = history.current.redo(current); if (s) change(s); } };

  const save = useCallback(async (): Promise<boolean> => {
    if (!loaded || !current || !subject) return false;
    const out = loaded.layout === "icon" ? canonicalIcon(current) : current;
    setSaving(true);
    try {
      const result = await api.spriteSave(loaded.layout === "icon"
        ? { kind: "icon", key: subject.key, pixels: toHex(out.pixels), slots: out.slots }
        : { kind: "sheet", folder: (target as { folder: string }).folder, pixels: toHex(out.pixels) });
      if (!result.ok) { setMessage({ text: `Not saved: ${result.error}`, error: true }); return false; }
      setCurrent(out);
      setSavedState(out);
      setMessage({ text: `Saved ${result.written?.join(", ")}${result.handEdited ? " · marked hand-edited" : ""}`, error: false });
      if (result.handEdited) loadReview();
      return true;
    } catch (e) {
      setMessage({ text: `Not saved: ${(e as Error).message}`, error: true });
      return false;
    } finally {
      setSaving(false);
    }
  }, [loaded, current, subject, target, loadReview]);

  // The sprite shown's review key and marks
  const spriteKey = !subject ? null : target.kind === "icon" ? subject.key : sheetKey(target.folder);
  const isChecked = !!spriteKey && marks[kind].checked.has(spriteKey);
  const isHand = !!spriteKey && marks[kind].hand.has(spriteKey);
  const toggleChecked = async () => {
    if (!spriteKey) return;
    try {
      const result = await api.spriteMark({ kind, key: spriteKey, mark: "checked", on: !isChecked });
      if (!result.ok || !result.review) { setMessage({ text: `Not marked: ${result.error}`, error: true }); return; }
      setReview(readReview(JSON.stringify(result.review)));
    } catch (e) {
      setMessage({ text: `Not marked: ${(e as Error).message}`, error: true });
    }
  };

  const savePaletteColour = async () => {
    if (!loaded || swatch.kind !== "palette" || !editColour) return;
    const rgb = fromHex(editColour);
    const path = main === "shiny" && loaded.palettes.shiny ? loaded.palettes.shiny : loaded.palettes.normal;
    if (!rgb) return;
    const warning = loaded.linked
      ? `Change colour ${swatch.index} of ${path}?\n\nThis is the battle palette: it changes the battle sprite${main === "normal" ? ", the walking and follower sheets" : ", shiny followers and wanderers"} and every icon slot on this index too.`
      : `Change colour ${swatch.index} of ${path}? It changes this sheet's colours only.`;
    if (!confirm(warning)) return;
    const file = await api.file(path);
    const colours = parsePal(file.text) as Rgb[];
    colours[swatch.index] = snap(rgb);
    const result = await api.save({ path, text: writePal(colours), baseVersion: file.version });
    if (!result.ok) { setMessage({ text: `Not saved: ${"message" in result ? String(result.message) : "the file changed on disk"}`, error: true }); return; }
    setEditColour(null);
    setMessage({ text: `Saved ${path}`, error: false });
    setEpoch((n) => n + 1);
  };

  // Keys while the page is shown (not in a text field)
  useEffect(() => {
    if (!toolActive) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      const k = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
        else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
        else if (k === "s") { e.preventDefault(); save(); }
        return;
      }
      if (e.altKey) return;
      if (TOOL_KEYS[k]) setTool(TOOL_KEYS[k]);
      else if (k === "a") step(-1);
      else if (k === "d") step(1);
      else if (k === "c") toggleChecked();
      else if (k === "+" || k === "=") setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)] ?? z);
      else if (k === "-") setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)] ?? z);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!subjects) return <div className="se-page muted">Reading the icons…</div>;
  if (!subjects.length)
    return <div className="se-page"><h2>Sprite Editor</h2><p className="muted">No icon_battle.png in res/pokemon yet: run <code>tools/paperwhite2/icon_remap.py apply</code>.</p></div>;

  // The picker: the species the filter shows (and the one open), each with its marks for this kind
  const byKey = new Map(subjects.map((s) => [s.key, s]));
  const markText = (k: string) => {
    const keys = keysOf(k, kind);
    const hand = keys.some((x) => marks[kind].hand.has(x));
    const checked = keys.length > 0 && keys.every((x) => marks[kind].checked.has(x));
    return `${hand ? " · ✎" : ""}${checked ? " · ✓" : ""}`;
  };
  const options: Option[] = [...(key && !shownSet.has(key) ? [key] : []), ...shown].map((k) => {
    const s = byKey.get(k)!;
    return { value: k, label: `${s.label}${markText(k)}`, detail: k };
  });
  const shownAt = key ? shown.indexOf(key) : -1;
  const prev = stepKey(order, shownSet, key, -1);
  const next = stepKey(order, shownSet, key, 1);
  const kindName = kind === "icons" ? "icon" : "sheet";
  const swapTitle = `Show ${other} colours in the big views (editing stays on the same indices)`;
  const swap = hasShiny ? () => setView(other) : undefined;
  const status = saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved";
  const used = current ? new Set(current.pixels) : new Set<number>();
  const slotCount = binding.kind === "icon" ? binding.slots.filter((_, i) => used.has(i + 1)).length : 0;

  const swatches: { swatch: Swatch; colour: Rgb | null; label: string; title: string; inIcon?: boolean }[] = [
    ...Array.from({ length: 15 }, (_, i) => i + 1).map((i) => ({
      swatch: { kind: "palette", index: i } as Swatch, colour: paletteOfView(main)[i] ?? null, label: String(i),
      title: `${loaded?.linked ? "Battle index" : "Index"} ${i}: ${rgbHex(paletteOfView(main)[i] ?? [0, 0, 0])}`,
      inIcon: binding.kind === "icon" ? binding.slots.some((s, n) => s === i && used.has(n + 1)) : undefined,
    })),
    ...(loaded?.layout === "icon" ? [0, 1].map((w) => ({ swatch: { kind: "grey", which: w } as Swatch, colour: GREYS[w], label: w ? "G2" : "G1",
      title: `Outline grey ${rgbHex(GREYS[w])} (icon index ${14 + w}, the same normal and shiny)` })) : []),
    { swatch: { kind: "transparent" }, colour: null, label: "∅", title: "Transparent (the only way to clear a coloured pixel)" },
  ];

  return (
    <div className="se-page">
      <div className="se-head">
        <h2>Sprite Editor</h2>
        <span className={`se-status${dirty ? " dirty" : ""}`}>{status}</span>
        {spriteKey && <>
          <span className={`se-mark${isHand ? " hand" : ""}`} title={isHand ? "Drawn or changed by hand (a save that changes the sprite marks it)" : "As the remap generated it"}>
            {isHand ? "✎ Hand-edited" : "Generated"}</span>
          {isChecked && <span className="se-mark checked" title="Marked checked in your pass">✓ Checked</span>}
        </>}
        <button className="primary" onClick={() => save()} disabled={!dirty || saving} title="Ctrl+S">Save</button>
        {message && <span className={message.error ? "se-error" : "muted"}>{message.text}</span>}
      </div>

      <section className="se-section">
        <h5>Pokémon <span className="muted">{subject ? `${subject.label} · ${subject.group.slice("res/pokemon/".length)}` : ""}</span></h5>
        <div className="se-grid">
          <span className="se-label">Show</span>
          <div className="se-row">
            <div className="view-switch">
              {REVIEW_FILTERS.map((f) => (
                <button key={f.id} className={filter === f.id ? "active" : ""} onClick={() => setFilter(f.id)} title={f.note}>
                  {f.label} <span className="muted">{counts.get(f.id) ?? 0}</span></button>
              ))}
            </div>
            <span className="muted small">By the {kindName}s' marks{kind === "followers" ? " (species with sheets)" : ""}.</span>
          </div>
          <span className="se-label">Species</span>
          <div className="se-row">
            <button onClick={() => step(-1)} disabled={!prev} title="The previous species the filter shows (A)">◀ <span className="se-key">A</span></button>
            <div className="se-picker"><SearchSelect value={key ?? ""} options={options} onChange={choose} placeholder="Find a Pokémon…" /></div>
            <button onClick={() => step(1)} disabled={!next} title="The next species the filter shows (D)"><span className="se-key">D</span> ▶</button>
            <span className="muted small">{shownAt >= 0 ? `${shownAt + 1} of ${shown.length}` : `not in this filter · ${shown.length} shown`}</span>
          </div>
          <span className="se-label">Sprite</span>
          <div className="se-row">
            <div className="view-switch">
              <button className={target.kind === "icon" ? "active" : ""} onClick={() => chooseTarget({ kind: "icon" })}>Icon</button>
              {sheets.map((s) => (
                <button key={s.folder} className={target.kind === "sheet" && target.folder === s.folder ? "active" : ""}
                        onClick={() => chooseTarget({ kind: "sheet", folder: s.folder })}>{s.label}{s.optOut ? " (own palette)" : ""}</button>
              ))}
            </div>
          </div>
          <span />
          <span className="muted small">{loaded?.note}</span>
        </div>
      </section>

      <section className="se-section">
        <h5>Review <span className="muted">marks of the sprite shown, kept apart for icons and sheets (res/paperwhite2/sprite_review.json)</span></h5>
        <div className="se-grid">
          <span className="se-label">This {kindName}</span>
          <div className="se-row">
            <button className={isChecked ? "se-checked" : ""} onClick={toggleChecked} disabled={!spriteKey}
                    title="Your pass over every sprite: marks this one checked, or takes the mark off (C)">
              {isChecked ? "Checked ✓" : "Mark checked"} <span className="se-key">C</span></button>
            <span className="muted small">{isHand ? "Hand-edited" : "Generated"} (the header shows both marks). A save that changes the pixels{kind === "icons" ? " or slots" : ""} marks it hand-edited; palette colour edits don't.</span>
          </div>
          <span className="se-label">Progress</span>
          <div className="se-row">
            {(["icons", "followers"] as const).map((k) => (
              <span key={k} className={`se-progress${k === kind ? " current" : ""}`}>
                {k === "icons" ? "Icons" : "Walking and follower sheets"}: {progress[k].checked} / {progress[k].total} checked
                <span className="muted"> · {review[k].hand_edited.length} hand-edited</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="se-columns">
        <div className="se-column">
          <section className="se-section">
            <h5>Battle sprite <span className="muted">reference; click to pick its colour</span></h5>
            <div className="se-actions">
              <div className="view-switch">
                {art.map((a) => <button key={a.name} className={battle?.name === a.name ? "active" : ""} onClick={() => setArtName(a.name)}>{a.label}</button>)}
              </div>
            </div>
            {battle && loaded && (
              <div className="se-stack">
                {hasShiny && loaded.linked && (
                  <figure className="se-ref" onClick={swap} title={swapTitle}>
                    <SpriteCanvas sprite={battle.sprite} colours={[null, ...paletteOfView(other).slice(1)]} scale={1} backdrop={backdrop} />
                    <figcaption className="muted small">{other === "shiny" ? "Shiny" : "Normal"}: click to swap</figcaption>
                  </figure>
                )}
                <figure className="se-big">
                  <SpriteCanvas sprite={battle.sprite} colours={[null, ...paletteOfView(main).slice(1)]} scale={battle.sprite.width > 128 ? 2 : 3} backdrop={backdrop}
                                pointer={loaded.linked ? {
                                  cursor: "crosshair",
                                  onStroke: (x, y, phase) => { if (phase === "start") { const i = battle.sprite.pixels[y * battle.sprite.width + x]; if (i) setSwatch({ kind: "palette", index: i }); afterPick(); } },
                                } : undefined} />
                  <figcaption className="muted small">{main === "shiny" ? "Shiny (shiny.pal)" : "Normal (normal.pal)"}{loaded.linked ? "" : " · an opted-out sheet has no battle link: sampling here is off"}</figcaption>
                </figure>
              </div>
            )}
            {!art.length && <p className="muted">No battle art for this group.</p>}
          </section>

          <section className="se-section">
            <h5>Palette <span className="muted">{loaded?.linked ? `${main === "shiny" ? "shiny.pal" : "normal.pal"} of the battle group` : "the sheet's own sprite.pal"}
              {binding.kind === "icon" ? ` · the icon uses ${slotCount} of ${ICON_SLOTS} slots` : ""}</span></h5>
            <div className="se-swatches">
              {swatches.map((s) => (
                <button key={s.label} className={`se-swatch${sameSwatch(s.swatch, swatch) ? " active" : ""}${s.inIcon ? " in-icon" : ""}`} title={s.title}
                        onClick={() => { setSwatch(s.swatch); setEditColour(null); }}>
                  <span className="se-chip" style={s.colour ? { background: rgbHex(s.colour) } : undefined} />
                  <span className="se-chip-label">{s.label}</span>
                </button>
              ))}
            </div>
            <p className="muted small">{binding.kind === "icon"
              ? "A dot marks the battle colours the icon has. Painting one it hasn't adds it to a slot (13 at most). G1 and G2 are the fixed outline greys."
              : "The sheet's indices are the palette's own."}</p>
            {swatch.kind === "palette" && loaded && (
              <div className="se-grid">
                <span className="se-label">Colour {swatch.index}</span>
                <div className="se-row">
                  {editColour === null
                    ? <button onClick={() => setEditColour(rgbHex(paletteOfView(main)[swatch.index] ?? [0, 0, 0]))}>Edit colour…</button>
                    : <>
                      <input type="color" value={editColour} onChange={(e) => setEditColour(e.target.value)} />
                      <input className="se-hex" value={editColour} onChange={(e) => setEditColour(e.target.value)} />
                      <button onClick={savePaletteColour} disabled={!fromHex(editColour)}>Save to {main === "shiny" && loaded.palettes.shiny ? "shiny.pal" : loaded.linked ? "normal.pal" : "sprite.pal"}</button>
                      <button onClick={() => setEditColour(null)}>Cancel</button>
                    </>}
                </div>
                {editColour !== null && loaded.linked && <><span /><span className="se-warning small">The battle palette: this changes the battle sprite and the {main === "normal" ? "walking and follower sheets" : "shiny followers"} too.</span></>}
              </div>
            )}
          </section>
        </div>

        <div className="se-column">
          <section className="se-section">
            <h5>{loaded?.layout === "sheet" ? "Sheet" : "Icon"} <span className="muted">{loaded ? `${loaded.width}×${loaded.height}, ${frames.length} frames` : ""}</span></h5>
            <div className="se-actions">
              <div className="view-switch">
                {TOOLS.map((t) => <button key={t.id} className={tool === t.id ? "active" : ""} onClick={() => setTool(t.id)} title={t.note}>{t.label} <span className="se-key">{t.key}</span></button>)}
              </div>
              {tool === "replace" && <label className="se-inline" title="Replace in every frame, not only the one shown">
                <input type="checkbox" checked={replaceAll} onChange={(e) => setReplaceAll(e.target.checked)} /> All frames</label>}
              <button onClick={undo} disabled={!history.current.canUndo} title="Ctrl+Z">Undo</button>
              <button onClick={redo} disabled={!history.current.canRedo} title="Ctrl+Y">Redo</button>
            </div>
            {sprite && loaded && area && (
              <div className="se-stack">
                <div className="se-refs">
                  {loaded.vanilla ? (
                    <figure className="se-ref">
                      <SpriteCanvas sprite={loaded.vanilla.sprite} frame={framesOf(loaded.vanilla.sprite, loaded.layout)[frame]} colours={loaded.vanilla.colours}
                                    scale={REF_SCALE} backdrop={backdrop} />
                      <figcaption className="muted small">{loaded.vanilla.caption}{loaded.vanillaNote ? ` · ${loaded.vanillaNote}` : ""}</figcaption>
                    </figure>
                  ) : <span className="muted small">{loaded.vanillaNote}</span>}
                  {hasShiny && (
                    <figure className="se-ref" onClick={swap} title={swapTitle}>
                      <SpriteCanvas sprite={sprite} frame={area} colours={viewColours(other)} scale={REF_SCALE} backdrop={backdrop} />
                      <figcaption className="muted small">{other === "shiny" ? "Shiny" : "Normal"}{toned ? " (game tone)" : ""}: click to swap</figcaption>
                    </figure>
                  )}
                  {!hasShiny && <span className="muted small">No shiny: an opted-out sheet keeps its own colours.</span>}
                </div>
                <figure className="se-big">
                  <SpriteCanvas sprite={sprite} frame={area} colours={viewColours(main)} scale={zoom} grid={grid} backdrop={backdrop}
                                pointer={{ onStroke, preview, cursor: tool === "eyedropper" ? "crosshair" : "cell" }} />
                  <figcaption className="muted small">{main === "shiny" ? "Shiny colours" : "Normal colours"}{toned ? ", game tone (in-game view)" : ""} · {loaded.layout === "sheet" ? SHEET_FRAME_NAMES[frame] ?? `frame ${frame + 1}` : `frame ${frame + 1}`}</figcaption>
                </figure>
              </div>
            )}
            <div className="se-grid se-settings">
              <span className="se-label">Brush</span>
              <div className="se-row">
                <div className="view-switch">{[1, 2, 3].map((n) => <button key={n} className={brush === n ? "active" : ""} onClick={() => setBrush(n)}>{n} px</button>)}</div>
                <span className="muted small">{TOOLS.find((t) => t.id === tool)?.note}</span>
              </div>
              <span className="se-label">View</span>
              <div className="se-row">
                <div className="view-switch">{ZOOMS.map((z) => <button key={z} className={zoom === z ? "active" : ""} onClick={() => setZoom(z)}>{z}×</button>)}</div>
                <label className="se-inline"><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Grid</label>
                {loaded?.layout === "icon" && (
                  <label className="se-inline" title={toneNote}>
                    <input type="checkbox" checked={gameTone} disabled={!toneParams} onChange={(e) => setGameTone(e.target.checked)} />
                    {" "}Game tone <span className="muted small">(view of the in-game colours{toneParams && !toneParams.enabled ? "; not in the build yet" : ""})</span>
                  </label>
                )}
                <div className="view-switch">
                  <button className={backdrop === "checker" ? "active" : ""} onClick={() => setBackdrop("checker")}>Checker</button>
                  <button className={backdrop === "box" ? "active" : ""} onClick={() => setBackdrop("box")}>Box grey</button>
                </div>
              </div>
              <span className="se-label">Frame</span>
              <div className="se-row se-frames">
                {sprite && frames.map((f, i) => (
                  <button key={i} className={`se-frame${i === frame ? " active" : ""}`} onClick={() => setFrame(i)}
                          title={loaded?.layout === "sheet" ? SHEET_FRAME_NAMES[i] ?? `Frame ${i + 1}` : `Frame ${i + 1}`}>
                    <SpriteCanvas sprite={sprite} frame={f} colours={viewColours(main)} scale={2} backdrop={backdrop} />
                    <span className="small muted">{loaded?.layout === "sheet" ? SHEET_FRAME_NAMES[i] ?? i + 1 : `Frame ${i + 1}`}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
