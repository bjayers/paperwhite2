// The Sprite Editor: pixel editing of a Pokémon's party/box icon on its battle palettes (icon_battle.png and its slots,
// tools/paperwhite2/sprite_edit.py) and of its walking and follower sheets, beside its battle sprite for reference and
// sampling (docs/paperwhite2/design/shiny-icons.md section 15). Left: the battle sprite, the other palette above it,
// the palette's swatches below. Right: the sprite being edited, large, with the vanilla art and the other palette
// above it. Clicking either reference in the other palette swaps the page's palette: editing stays on the same
// indices. The "Hand-fix list" steps through res/paperwhite2/icon_fix_list.json. The logic is model.ts's.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api.ts";
import { documents } from "../../documents.ts";
import { fileText, fromPlain } from "../../../shared/json.ts";
import { SearchSelect, type Option } from "../../shell/SearchSelect.tsx";
import { useToolActive } from "../active.ts";
import { FIELD_ACTOR_SCHEMA } from "../followers/data.ts";
import { fromHex, parsePal, snap, toHex as rgbHex, writePal } from "../palettes/pal.ts";
import { readIndexedPng } from "../palettes/png.ts";
import { paletteOf } from "../palettes/sheetColors.ts";
import type { ToolProps } from "../types.ts";
import { SpriteCanvas, type Backdrop } from "./SpriteCanvas.tsx";
import { FIX_LIST, GREYS, History, ICON_SLOTS, SHEET_FRAME_NAMES, brushPixels, canonicalIcon, fill, framesOf, iconFiles, iconKeyOf,
  indexColour, linePixels, paint, paintIndex, readFixList, sameSnapshot, sameSwatch, spriteColours, swatchOfIndex, toHex, viewPalettes,
  type Binding, type Rgb, type Snapshot, type Sprite, type Swatch, type View } from "./model.ts";

const SPECIES_SCHEMA = "res/pokemon/species.schema.json";
const ICON_GLOBS = ["res/pokemon/*/icon_battle.png", "res/pokemon/*/icon_female_battle.png", "res/pokemon/*/form_*/icon_battle.png"];
const ART_NAMES: [string, string][] = [["front_single", "Front"], ["back_single", "Back"], ["front", "Front sheet"], ["back", "Back sheet"]];
const REF_SCALE = 3;
const ZOOMS = [6, 8, 10, 12, 16, 20, 24];

type Tool = "pencil" | "fill" | "eyedropper";
const TOOLS: { id: Tool; label: string; key: string; note: string }[] = [
  { id: "pencil", label: "Pencil", key: "B", note: "Paints the brush's pixels; the hover shows them first." },
  { id: "fill", label: "Fill", key: "G", note: "Fills the pixels of one index joined to the clicked one (4-connected), in this frame." },
  { id: "eyedropper", label: "Eyedropper", key: "I", note: "Picks the colour under the pointer, on either side (Alt+click with any tool)." },
];

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
  const [fixList, setFixList] = useState<{ keys: string[]; version: string | null }>({ keys: [], version: null });
  const [mode, setMode] = useState<"all" | "fix">("fix");
  const [key, setKey] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>({ kind: "icon" });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [current, setCurrent] = useState<Snapshot | null>(null);
  const [savedState, setSavedState] = useState<Snapshot | null>(null);
  const [art, setArt] = useState<Art[]>([]);
  const [artName, setArtName] = useState("front_single");
  const [view, setView] = useState<View>("normal");
  const [tool, setTool] = useState<Tool>("pencil");
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
  const history = useRef(new History());
  const stroke = useRef<{ before: Snapshot; index: number; last: [number, number] } | null>(null);
  const [, setTick] = useState(0);

  // The icons and sheets there are, and the hand-fix list
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

  const loadFixList = useCallback(() => api.file(FIX_LIST).then((f) => setFixList({ keys: readFixList(f.text), version: f.version }),
    () => setFixList({ keys: [], version: null })), []);
  useEffect(() => { loadFixList(); }, [loadFixList]);

  const shown = useMemo(() => {
    if (!subjects) return [];
    return mode === "fix" ? subjects.filter((s) => fixList.keys.includes(s.key)) : subjects;
  }, [subjects, mode, fixList]);
  useEffect(() => {
    if (shown.length && (!key || !subjects?.some((s) => s.key === key))) setKey(shown[0].key);
  }, [shown, key, subjects]);
  const subject = subjects?.find((s) => s.key === key) ?? null;

  const sheets = useMemo((): SheetInfo[] => {
    if (!subject) return [];
    const group = subject.group.slice("res/pokemon/".length);
    return actorSheets.filter((s) => s.pokemon === group || (s.optOut && (s.folder.endsWith(`/${subject.species}`) || s.folder.split("/").pop()!.startsWith(`${subject.species}_`))))
      .map((s) => ({ folder: s.folder, optOut: s.optOut,
        label: `${s.folder.includes("/followers/") ? "Follower" : "Walking"}: ${words(s.folder.split("/").pop()!)}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [subject, actorSheets]);

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
    if (paths.includes(FIX_LIST)) loadFixList();
    if (loaded && paths.some((p) => p.endsWith(".pal") && Object.values(loaded.palettes).includes(p))) setEpoch((n) => n + 1);
  }), [loaded, loadFixList]);

  const binding: Binding = loaded?.layout === "icon" && current ? { kind: "icon", slots: current.slots } : { kind: "sheet" };
  const { main, other } = viewPalettes(view);
  const paletteOfView = (v: View): Rgb[] => (v === "shiny" && loaded?.shiny ? loaded.shiny : loaded?.normal ?? []);
  const sprite: Sprite | null = loaded && current ? { width: loaded.width, height: loaded.height, pixels: current.pixels } : null;
  const frames = loaded ? framesOf(loaded, loaded.layout) : [];
  const area = frames[frame] ?? frames[0];
  const battle = art.find((a) => a.name === artName) ?? art[0] ?? null;
  const hasShiny = !!loaded?.shiny;

  // The latest state for the pointer's events, which can come faster than renders
  const live = useRef<Snapshot | null>(null);
  live.current = current;
  const change = (next: Snapshot) => { live.current = next; setCurrent(next); };

  const choose = (k: string) => {
    if (k === key) return;
    if (dirty && !confirm("The sprite has unsaved changes. Leave it without saving?")) return;
    setKey(k);
    setTarget({ kind: "icon" });
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
    if (!area || tool === "eyedropper") return null;
    const r = current ? paintIndex(binding, swatch, current.pixels) : null;
    if (!r || "error" in r) return null;
    const colour = indexColour({ ...binding, ...(binding.kind === "icon" ? { slots: r.slots } : {}) } as Binding, paletteOfView(main), r.index);
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
      setMessage({ text: `Saved ${result.written?.join(", ")}`, error: false });
      return true;
    } catch (e) {
      setMessage({ text: `Not saved: ${(e as Error).message}`, error: true });
      return false;
    } finally {
      setSaving(false);
    }
  }, [loaded, current, subject, target]);

  const stepFix = (by: 1 | -1) => {
    const at = shown.findIndex((s) => s.key === key);
    const next = shown[Math.max(0, Math.min(shown.length - 1, at + by))];
    if (next) choose(next.key);
  };

  const done = async () => {
    if (!subject) return;
    if (dirty && !(await save())) return;
    const keys = fixList.keys.filter((k) => k !== subject.key).sort();
    const at = shown.findIndex((s) => s.key === subject.key);
    const result = await api.save({ path: FIX_LIST, text: fileText(fromPlain({ fix_by_hand: keys })), baseVersion: fixList.version });
    if (!result.ok) { setMessage({ text: "The hand-fix list changed on disk: read it again and retry", error: true }); loadFixList(); return; }
    setFixList({ keys, version: result.version });
    setMessage({ text: `${subject.label} is done: off the hand-fix list (${keys.length} left)`, error: false });
    const next = shown.filter((s) => s.key !== subject.key)[Math.min(at, shown.length - 2)];
    if (next) { setKey(next.key); setTarget({ kind: "icon" }); }
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
      if (k === "b") setTool("pencil");
      else if (k === "g") setTool("fill");
      else if (k === "i") setTool("eyedropper");
      else if (k === "+" || k === "=") setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)] ?? z);
      else if (k === "-") setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)] ?? z);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!subjects) return <div className="se-page muted">Reading the icons…</div>;
  if (!subjects.length)
    return <div className="se-page"><h2>Sprite Editor</h2><p className="muted">No icon_battle.png in res/pokemon yet: run <code>tools/paperwhite2/icon_remap.py apply</code>.</p></div>;

  const options: Option[] = shown.map((s) => ({ value: s.key, label: s.label, detail: s.key }));
  const fixAt = shown.findIndex((s) => s.key === key);
  const flagged = !!key && fixList.keys.includes(key);
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
        <button className="primary" onClick={() => save()} disabled={!dirty || saving} title="Ctrl+S">Save</button>
        {message && <span className={message.error ? "se-error" : "muted"}>{message.text}</span>}
      </div>

      <section className="se-section">
        <h5>Pokémon <span className="muted">{subject ? `${subject.label} · ${subject.group.slice("res/pokemon/".length)}` : ""}</span></h5>
        <div className="se-grid">
          <span className="se-label">List</span>
          <div className="se-row">
            <div className="view-switch">
              <button className={mode === "fix" ? "active" : ""} onClick={() => setMode("fix")}>Hand-fix list ({fixList.keys.length})</button>
              <button className={mode === "all" ? "active" : ""} onClick={() => setMode("all")}>All icons ({subjects.length})</button>
            </div>
            <span className="muted small">{mode === "fix" ? "The icons still to fix by hand (res/paperwhite2/icon_fix_list.json)." : "Every icon on its battle palettes."}</span>
          </div>
          <span className="se-label">Species</span>
          <div className="se-row">
            <div className="se-picker"><SearchSelect value={key ?? ""} options={options} onChange={choose} placeholder="Find a Pokémon…" /></div>
            {mode === "fix" && <>
              <button onClick={() => stepFix(-1)} disabled={fixAt <= 0}>◀ Previous</button>
              <span className="muted">{fixAt + 1} of {shown.length}</span>
              <button onClick={() => stepFix(1)} disabled={fixAt < 0 || fixAt >= shown.length - 1}>Next ▶</button>
            </>}
            {flagged && <button onClick={done} title="Saves the icon if it has changes, then takes it off the hand-fix list">Done (unflag)</button>}
            {!flagged && mode === "all" && <span className="muted small">Not on the hand-fix list.</span>}
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
                                  onStroke: (x, y, phase) => { if (phase === "start") { const i = battle.sprite.pixels[y * battle.sprite.width + x]; if (i) setSwatch({ kind: "palette", index: i }); } },
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
                      <SpriteCanvas sprite={sprite} frame={area} colours={spriteColours(binding, paletteOfView(other))} scale={REF_SCALE} backdrop={backdrop} />
                      <figcaption className="muted small">{other === "shiny" ? "Shiny" : "Normal"}: click to swap</figcaption>
                    </figure>
                  )}
                  {!hasShiny && <span className="muted small">No shiny: an opted-out sheet keeps its own colours.</span>}
                </div>
                <figure className="se-big">
                  <SpriteCanvas sprite={sprite} frame={area} colours={spriteColours(binding, paletteOfView(main))} scale={zoom} grid={grid} backdrop={backdrop}
                                pointer={{ onStroke, preview, cursor: tool === "eyedropper" ? "crosshair" : "cell" }} />
                  <figcaption className="muted small">{main === "shiny" ? "Shiny colours" : "Normal colours"} · {loaded.layout === "sheet" ? SHEET_FRAME_NAMES[frame] ?? `frame ${frame + 1}` : `frame ${frame + 1}`}</figcaption>
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
                    <SpriteCanvas sprite={sprite} frame={f} colours={spriteColours(binding, paletteOfView(main))} scale={2} backdrop={backdrop} />
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
