// The Palette Editor: every JASC palette under res/ (.pal), edited in the DS's own colors, on an image that uses it.
// The art itself is drawn elsewhere (Aseprite); this is for the colors: a sprite's normal and shiny palettes side by
// side, a palette taken from an image editor's PNG, ramps and hue shifts over several colors, and .pal files to hand
// to the image editor. Saving writes the file as the dump does (pal.ts), so the build reads what is shown.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api.ts";
import { NO_ADJUSTMENT, adjust, bgr555, from5, fromHex, isAdjusted, parsePal, sameColor, snap, to5, toHex, writePal,
  type Adjustment, type Rgb } from "./pal.ts";
import { readIndexedPng, type IndexedImage } from "./png.ts";

const ROW = 16;
const LIST_LIMIT = 300;

interface Loaded {
  path: string;
  version: string | null;
  colors: Rgb[];
}

const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/"));
const baseOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const stem = (name: string) => name.replace(/\.[^.]+$/, "");

/** The image of a palette's folder most likely to use it: one of its name, a sprite (a Pokémon's whole front sprite
 * first), the nearest numbered member below it. */
function defaultImage(palette: string, images: string[]): string | null {
  if (!images.length) return null;
  const name = stem(baseOf(palette));
  const byName = new Map(images.map((p) => [stem(baseOf(p)), p]));
  for (const candidate of [name, name.replace(/_?(palette|pal)$/, ""), "front_single", "front", "sprite"]) {
    if (byName.has(candidate)) return byName.get(candidate)!;
  }
  const number = Number(name);
  if (Number.isInteger(number)) {
    const numbered = images.filter((p) => /^\d+$/.test(stem(baseOf(p)))).sort((a, b) => Number(stem(baseOf(a))) - Number(stem(baseOf(b))));
    const below = numbered.filter((p) => Number(stem(baseOf(p))) < number);
    if (below.length) return below[below.length - 1];
    if (numbered.length) return numbered[0];
  }
  return images[0];
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------- The image

function PalettePreview({ image, colors, offset, zoom, transparent, highlight, onPick }: {
  image: IndexedImage;
  colors: Rgb[];
  offset: number;
  zoom: number;
  transparent: boolean;
  /** Indices to show; the others dimmed. */
  highlight: Set<number> | null;
  onPick?(index: number): void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    const data = context.createImageData(image.width, image.height);
    for (let i = 0; i < image.pixels.length; i++) {
      const raw = image.pixels[i];
      const index = raw + offset;
      const o = i * 4;
      if (raw === 0 && transparent) {
        const light = ((i % image.width >> 2) + (Math.floor(i / image.width) >> 2)) % 2 === 0;
        data.data.set(light ? [204, 204, 214, 255] : [168, 168, 182, 255], o);
        continue;
      }
      let [r, g, b] = colors[index] ?? [255, 0, 255];
      if (highlight && !highlight.has(index)) {
        const gray = (r + g + b) / 3;
        [r, g, b] = [gray * 0.35 + 20, gray * 0.35 + 20, gray * 0.35 + 20];
      }
      data.data.set([r, g, b, 255], o);
    }
    canvas.current!.width = image.width;
    canvas.current!.height = image.height;
    context.putImageData(data, 0, 0);
  }, [image, colors, offset, transparent, highlight]);
  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * image.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * image.height);
    if (x >= 0 && y >= 0 && x < image.width && y < image.height) onPick(image.pixels[y * image.width + x] + offset);
  };
  return <canvas ref={canvas} className="pal-canvas" style={{ width: image.width * zoom, height: image.height * zoom }}
                 onClick={pick} title={onPick ? "Click a pixel to choose its color" : undefined} />;
}

// ---------------------------------------------------------------- The swatches

function Swatches({ colors, selected, primary, used, onSelect, small }: {
  colors: Rgb[];
  selected?: Set<number>;
  primary?: number;
  used?: Set<number> | null;
  onSelect?(index: number, e: React.MouseEvent): void;
  small?: boolean;
}) {
  const rows: number[][] = [];
  for (let i = 0; i < colors.length; i += ROW) rows.push(colors.slice(i, i + ROW).map((_, j) => i + j));
  return (
    <div className={`pal-swatches${small ? " small" : ""}`}>
      {rows.map((row, r) => (
        <div key={r} className="pal-swatch-row">
          {colors.length > ROW && <span className="pal-bank muted">{r}</span>}
          {row.map((i) => (
            <button key={i} type="button"
                    className={`pal-swatch${selected?.has(i) ? " selected" : ""}${primary === i ? " primary" : ""}${used && !used.has(i) ? " unused" : ""}${i % ROW === 0 ? " zero" : ""}`}
                    style={{ background: toHex(colors[i]) }}
                    title={`${i}${i % ROW === 0 ? " (transparent in sprites)" : ""}: ${colors[i].join(" ")}, DS 0x${bgr555(colors[i]).toString(16).padStart(4, "0")}`}
                    onClick={onSelect ? (e) => onSelect(i, e) : undefined} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- One color

function ColorEditor({ color, index, onChange }: { color: Rgb; index: number; onChange(c: Rgb, group: string): void }) {
  const [hex, setHex] = useState(toHex(color));
  useEffect(() => setHex(toHex(color)), [color]);
  const five = color.map(to5);
  const setAxis = (axis: number, value: number) => {
    const next = [...five];
    next[axis] = Math.max(0, Math.min(31, value));
    onChange(next.map(from5) as Rgb, `axis${index}`);
  };
  return (
    <div className="pal-color">
      <div className="pal-color-head">
        <span className="pal-big-swatch" style={{ background: toHex(color) }} />
        <div>
          <strong>Color {index}</strong>{index % ROW === 0 && <span className="muted"> · transparent in sprites</span>}
          <div className="muted pal-mono">{color.join(" ")} · DS 0x{bgr555(color).toString(16).padStart(4, "0")}</div>
        </div>
      </div>
      {["R", "G", "B"].map((name, axis) => (
        <label key={name} className="pal-axis">
          <span>{name}</span>
          <input type="range" min={0} max={31} value={five[axis]} onChange={(e) => setAxis(axis, Number(e.target.value))} />
          <input type="number" min={0} max={31} value={five[axis]} onChange={(e) => setAxis(axis, Number(e.target.value))} />
        </label>
      ))}
      <div className="pal-row">
        <input className="pal-hex pal-mono" value={hex} onChange={(e) => setHex(e.target.value)}
               onBlur={() => { const c = fromHex(hex); if (c) onChange(snap(c), `hex${index}`); else setHex(toHex(color)); }}
               onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        <input type="color" value={toHex(color)} onChange={(e) => onChange(snap(fromHex(e.target.value)!), `picker${index}`)} />
        <span className="muted">5 bits an axis: 0 to 31</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- The page

/** requested opens a palette, as the Screens page's "Edit its palette" does. */
export function PaletteEditor({ requested }: { requested?: { path: string } }) {
  const [paths, setPaths] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(["paperwhite2"]));
  const [file, setFile] = useState<Loaded | null>(null);
  // The colors being edited, with the undo steps before and after them
  const [edits, setEdits] = useState<{ colors: Rgb[]; past: Rgb[][]; future: Rgb[][] }>({ colors: [], past: [], future: [] });
  const colors = edits.colors;
  const lastEdit = useRef<{ group: string; time: number } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set([1]));
  const [primary, setPrimary] = useState(1);
  const [adjustment, setAdjustment] = useState<Adjustment>(NO_ADJUSTMENT);
  const [clipboard, setClipboard] = useState<Rgb[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [images, setImages] = useState<string[]>([]);
  const [siblingPalettes, setSiblingPalettes] = useState<string[]>([]);
  const [imageChoice, setImageChoice] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<{ name: string; image: IndexedImage } | null>(null);
  const [image, setImage] = useState<IndexedImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(2);
  const [bank, setBank] = useState(0);
  const [transparent, setTransparent] = useState(true);
  const [highlight, setHighlight] = useState(false);
  const [compare, setCompare] = useState<{ path: string; colors: Rgb[] } | null>(null);

  const dirty = file !== null && (colors.length !== file.colors.length || colors.some((c, i) => !sameColor(c, file.colors[i])));

  const refreshList = useCallback(() => api.list("res/**/*.pal").then(setPaths).catch((e) => setMessage(String(e))), []);
  useEffect(() => { refreshList(); }, [refreshList]);

  // ---------------------------------------------------------------- Loading

  const load = useCallback(async (path: string) => {
    const content = await api.file(path);
    const parsed = parsePal(content.text);
    setFile({ path, version: content.version, colors: parsed });
    setEdits({ colors: parsed, past: [], future: [] });
    lastEdit.current = null;
    setAdjustment(NO_ADJUSTMENT);
    setSelected(new Set([Math.min(1, parsed.length - 1)]));
    setPrimary(Math.min(1, parsed.length - 1));
    setMessage(null);
  }, []);

  const choose = async (path: string) => {
    if (dirty && !confirm(`${file!.path} has unsaved changes. Leave them?`)) return;
    try {
      await load(path);
    } catch (e) {
      setMessage(`${path}: ${(e as Error).message}`);
      return;
    }
    const folder = dirOf(path);
    const [pngs, pals] = await Promise.all([api.list(`${folder}/*.png`), api.list(`${folder}/*.pal`)]);
    setImages(pngs);
    setSiblingPalettes(pals.filter((p) => p !== path));
    setImageChoice(defaultImage(path, pngs));
    setUploaded(null);
    setBank(0);
    // A sprite's other palette (normal and shiny) to compare with
    const other = pals.find((p) => p !== path && /(normal|shiny)\.pal$/.test(p) && /(normal|shiny)\.pal$/.test(path));
    setCompare(null);
    if (other) showBeside(other);
  };

  useEffect(() => {
    if (uploaded) {
      setImage(uploaded.image);
      setImageError(null);
      return;
    }
    if (!imageChoice) {
      setImage(null);
      return;
    }
    let live = true;
    api.asset(imageChoice).then(readIndexedPng).then((img) => {
      if (!live) return;
      setImage(img);
      setImageError(null);
    }).catch((e) => {
      if (!live) return;
      setImage(null);
      setImageError(`${baseOf(imageChoice)}: ${(e as Error).message}`);
    });
    return () => { live = false; };
  }, [imageChoice, uploaded]);

  // Changed on disk while the window was away (a Claude session, or Aseprite saving a .pal)
  useEffect(() => {
    const check = async () => {
      if (!file?.version) return;
      const content = await api.file(file.path).catch(() => null);
      if (!content || content.version === file.version) return;
      if (dirty) setMessage(`${file.path} changed on disk; saving will ask before replacing it.`);
      else load(file.path).catch(() => {});
    };
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [file, dirty, load]);

  const showBeside = (path: string) => {
    if (!path) return setCompare(null);
    api.file(path).then((f) => setCompare({ path, colors: parsePal(f.text) })).catch((e) => setMessage(`${path}: ${(e as Error).message}`));
  };

  useEffect(() => {
    if (requested) choose(requested.path);
    // Only a new request opens a palette
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  // ---------------------------------------------------------------- Editing

  /** Changes the colors as one undo step, or with the step before when it is the same control moving. */
  const change = useCallback((next: Rgb[], group?: string) => {
    const now = Date.now();
    const joins = group !== undefined && lastEdit.current?.group === group && now - lastEdit.current.time < 1500;
    lastEdit.current = group !== undefined ? { group, time: now } : null;
    setEdits((e) => ({ colors: next, past: joins ? e.past : [...e.past.slice(-199), e.colors], future: [] }));
  }, []);

  const undo = useCallback(() => {
    lastEdit.current = null;
    setEdits((e) => (e.past.length
      ? { colors: e.past[e.past.length - 1], past: e.past.slice(0, -1), future: [e.colors, ...e.future] }
      : e));
  }, []);

  const redo = useCallback(() => {
    lastEdit.current = null;
    setEdits((e) => (e.future.length ? { colors: e.future[0], past: [...e.past, e.colors], future: e.future.slice(1) } : e));
  }, []);

  const setOne = (index: number, color: Rgb, group: string) =>
    change(colors.map((c, i) => (i === index ? color : c)), group);

  const select = (index: number, e?: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    if (e?.shiftKey) {
      const [a, b] = [Math.min(primary, index), Math.max(primary, index)];
      setSelected(new Set(Array.from({ length: b - a + 1 }, (_, i) => a + i)));
      return;
    }
    if (e?.ctrlKey || e?.metaKey) {
      const next = new Set(selected);
      if (next.has(index) && next.size > 1) next.delete(index);
      else next.add(index);
      setSelected(next);
      setPrimary(index);
      return;
    }
    setSelected(new Set([index]));
    setPrimary(index);
  };

  const sortedSelection = [...selected].sort((a, b) => a - b);

  const applyAdjustment = () => {
    change(colors.map((c, i) => (selected.has(i) ? adjust(c, adjustment) : c)));
    setAdjustment(NO_ADJUSTMENT);
  };

  const gradient = () => {
    const first = sortedSelection[0];
    const last = sortedSelection[sortedSelection.length - 1];
    const [a, b] = [colors[first], colors[last]];
    change(colors.map((c, i) => {
      if (!selected.has(i) || last === first) return c;
      const t = (i - first) / (last - first);
      return snap([0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * t)) as Rgb);
    }));
  };

  const copy = () => setClipboard(sortedSelection.map((i) => colors[i]));
  const paste = () => {
    if (!clipboard) return;
    const start = sortedSelection[0];
    change(colors.map((c, i) => (i >= start && i - start < clipboard.length ? clipboard[i - start] : c)));
  };
  const copyFromCompare = () => {
    if (!compare) return;
    change(colors.map((c, i) => (selected.has(i) && compare.colors[i] ? compare.colors[i] : c)));
  };

  // ---------------------------------------------------------------- Files

  const save = useCallback(async () => {
    if (!file || !dirty) return;
    const result = await api.save({ path: file.path, text: writePal(colors), baseVersion: file.version });
    if (result.ok) {
      setFile({ ...file, version: result.version, colors });
      setMessage(`Saved ${file.path}.`);
    } else if (result.reason === "conflict") {
      if (confirm(`${file.path} changed on disk since it was opened. Replace it with these colors?`)) {
        const forced = await api.save({ path: file.path, text: writePal(colors), baseVersion: null });
        if (forced.ok) setFile({ ...file, version: forced.version, colors });
      }
    } else {
      setMessage(result.message);
    }
  }, [file, dirty, colors]);

  const saveAs = async (fresh?: Rgb[]) => {
    const suggested = file ? `${dirOf(file.path)}/${stem(baseOf(file.path))}_copy.pal` : "res/paperwhite2/palettes/new.pal";
    const path = prompt("Save the palette as (a path under res/, ending in .pal):", suggested)?.trim();
    if (!path) return;
    if (!/^res\/.+\.pal$/.test(path) || path.includes("..")) return alert("A path under res/, ending in .pal.");
    if (paths.includes(path) && !confirm(`${path} exists. Replace it?`)) return;
    if (dirty && fresh && !confirm(`${file!.path} has unsaved changes. Leave them?`)) return;
    const result = await api.save({ path, text: writePal(fresh ?? colors), baseVersion: null });
    if (!result.ok) return setMessage(result.reason === "invalid" ? result.message : "Not saved");
    await refreshList();
    await choose(path).catch(() => {});
    setMessage(`Saved ${path}.`);
  };

  const importFile = async (picked: File) => {
    try {
      const incoming = picked.name.toLowerCase().endsWith(".png")
        ? (await readIndexedPng(await picked.arrayBuffer())).colors
        : parsePal(await picked.text());
      const count = colors.length || incoming.length;
      const next = Array.from({ length: count }, (_, i) => (incoming[i] ? snap(incoming[i]) : colors[i] ?? [0, 0, 0])) as Rgb[];
      change(next);
      setMessage(`Took ${Math.min(count, incoming.length)} of ${picked.name}'s ${incoming.length} colors` +
        (incoming.length > count ? `; this palette has ${count}.` : incoming.length < count ? `; the rest are unchanged.` : "."));
    } catch (e) {
      setMessage(`${picked.name}: ${(e as Error).message}`);
    }
  };

  const previewFile = async (picked: File) => {
    try {
      setUploaded({ name: picked.name, image: await readIndexedPng(await picked.arrayBuffer()) });
    } catch (e) {
      setImageError(`${picked.name}: ${(e as Error).message}`);
    }
  };

  // Keys while the page is open: Ctrl+S saves the palette, Ctrl+Z and Ctrl+Y undo and redo (not in a text field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !file) return;
      const key = e.key.toLowerCase();
      const typing = ["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName) &&
        (e.target as HTMLInputElement).type !== "range";
      if (key === "s" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        save();
      } else if (!typing && (key === "z" || key === "y")) {
        e.preventDefault();
        e.stopPropagation();
        if (key === "y" || e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [file, save, undo, redo]);

  // ---------------------------------------------------------------- Showing

  // As the DS shows them: a color written between its steps (a palette made by hand) shows as the build rounds it
  const shown = useMemo(
    () => colors.map((c, i) => (isAdjusted(adjustment) && selected.has(i) ? adjust(c, adjustment) : snap(c))),
    [colors, adjustment, selected],
  );
  const maxIndex = useMemo(() => (image ? image.pixels.reduce((m, p) => Math.max(m, p), 0) : 0), [image]);
  const banks = Math.ceil(colors.length / ROW);
  const banked = image !== null && maxIndex < ROW && banks > 1;
  const offset = banked ? bank * ROW : 0;
  const used = useMemo(() => (image ? new Set([...new Set(image.pixels)].map((p) => p + offset)) : null), [image, offset]);

  const groups = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const byGroup = new Map<string, string[]>();
    for (const path of paths) {
      if (query && !path.toLowerCase().includes(query)) continue;
      const group = path.split("/")[1];
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group)!.push(path);
    }
    return [...byGroup.entries()];
  }, [paths, filter]);

  return (
    <div className="pal-editor">
      <div className="pal-list">
        <div className="pal-list-tools">
          <input className="filter" placeholder={`Filter ${paths.length} palettes…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button onClick={() => saveAs(Array.from({ length: ROW }, (_, i) => snap([i * 17, i * 17, i * 17])))}>New 16-color palette…</button>
        </div>
        <div className="pal-list-items">
          {groups.map(([group, members]) => {
            const open = filter.trim() !== "" || openGroups.has(group);
            return (
              <div key={group}>
                <button className="pal-group" onClick={() => {
                  const next = new Set(openGroups);
                  if (next.has(group)) next.delete(group);
                  else next.add(group);
                  setOpenGroups(next);
                }}>
                  {open ? "▾" : "▸"} {group} <span className="muted">{members.length}</span>
                </button>
                {open && members.slice(0, LIST_LIMIT).map((p) => (
                  <button key={p} className={`pal-item${file?.path === p ? " selected" : ""}`} title={p} onClick={() => choose(p)}>
                    {p.slice(`res/${group}/`.length, -4)}
                  </button>
                ))}
                {open && members.length > LIST_LIMIT && (
                  <p className="muted pal-more">{members.length - LIST_LIMIT} more: filter to find them</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="pal-main">
        <header className="pal-header">
          <h2>Palettes</h2>
          {file && <span className="pal-mono">{file.path}{dirty && " •"}</span>}
          <span className="spacer" />
          {file && (
            <>
              <button onClick={undo} disabled={!edits.past.length} title="Ctrl+Z">Undo</button>
              <button onClick={redo} disabled={!edits.future.length} title="Ctrl+Y">Redo</button>
              <button className="primary" onClick={save} disabled={!dirty} title="Ctrl+S">Save</button>
              <button onClick={() => load(file.path)} disabled={!dirty}>Revert</button>
              <button onClick={() => saveAs()}>Save as…</button>
              <button onClick={() => download(baseOf(file.path), writePal(colors))} title="A JASC .pal, which Aseprite opens as a palette">Download .pal</button>
              <label className="pal-file-button" title="Take the colors of a .pal, or of an indexed PNG's palette">
                Import colors…
                <input type="file" accept=".pal,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
              </label>
            </>
          )}
        </header>
        {message && <div className="pal-message">{message} <button className="link" onClick={() => setMessage(null)}>✕</button></div>}

        {!file ? (
          <div className="pal-empty muted">
            <p>Choose a palette on the left: a Pokémon's <code>normal</code> and <code>shiny</code>, a trainer's, an item's, or a
              graphics archive's members.</p>
            <p>Colors are the DS's: 5 bits an axis, 0 to 31. In a sprite's palette, each row's first color is transparent. Draw
              the art in Aseprite in indexed mode; <b>Download .pal</b> gives Aseprite this palette, and <b>Import colors</b> takes
              one back from a .pal or from a PNG's palette.</p>
          </div>
        ) : (
          <div className="pal-body">
            <section className="pal-panel pal-colors">
              <h3>Colors <span className="muted">{colors.length}</span></h3>
              <Swatches colors={shown} selected={selected} primary={primary} used={used} onSelect={(i, e) => select(i, e)} />
              <p className="muted pal-hint">Click a color; Shift+click for a range, Ctrl+click to add one.
                {used && " Dimmed colors aren't in the image."}</p>
              {colors[primary] && <ColorEditor color={shown[primary]} index={primary} onChange={(c, g) => setOne(primary, c, g)} />}

              <div className="pal-tools">
                <h3>{selected.size} selected</h3>
                {(["hue", "saturation", "lightness"] as const).map((k) => (
                  <label key={k} className="pal-axis wide">
                    <span>{k[0].toUpperCase() + k.slice(1)}</span>
                    <input type="range" min={k === "hue" ? -180 : -100} max={k === "hue" ? 180 : 100} value={adjustment[k]}
                           onChange={(e) => setAdjustment({ ...adjustment, [k]: Number(e.target.value) })} />
                    <span className="pal-mono">{adjustment[k]}</span>
                  </label>
                ))}
                <div className="pal-row">
                  <button onClick={applyAdjustment} disabled={!isAdjusted(adjustment)}>Apply</button>
                  <button onClick={() => setAdjustment(NO_ADJUSTMENT)} disabled={!isAdjusted(adjustment)}>Reset</button>
                </div>
                <div className="pal-row wrap">
                  <button onClick={gradient} disabled={sortedSelection.length < 3} title="A ramp from the first selected color to the last">Ramp</button>
                  <button onClick={copy}>Copy</button>
                  <button onClick={paste} disabled={!clipboard} title="From the first selected color on">Paste{clipboard ? ` (${clipboard.length})` : ""}</button>
                  {compare && <button onClick={copyFromCompare} title={`The selected colors from ${baseOf(compare.path)}`}>Take from {stem(baseOf(compare.path))}</button>}
                </div>
              </div>
            </section>

            <section className="pal-panel pal-preview">
              <div className="pal-row wrap">
                <h3>Preview</h3>
                <select value={uploaded ? "" : imageChoice ?? ""} onChange={(e) => { setUploaded(null); setImageChoice(e.target.value || null); }}>
                  {uploaded && <option value="">{uploaded.name} (from your computer)</option>}
                  {!images.length && !uploaded && <option value="">No images in this folder</option>}
                  {images.map((p) => <option key={p} value={p}>{baseOf(p)}</option>)}
                </select>
                <label className="pal-file-button" title="Show an indexed PNG from your computer, such as Aseprite's work, with this palette">
                  Open a PNG…
                  <input type="file" accept=".png" onChange={(e) => { const f = e.target.files?.[0]; if (f) previewFile(f); e.target.value = ""; }} />
                </label>
              </div>
              <div className="pal-row wrap">
                <label className="pal-inline">Zoom
                  <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
                    {[1, 2, 3, 4, 6].map((z) => <option key={z} value={z}>{z}×</option>)}
                  </select>
                </label>
                {banked && (
                  <label className="pal-inline" title="The image's 16 colors are one row of this palette">Row
                    <select value={bank} onChange={(e) => setBank(Number(e.target.value))}>
                      {Array.from({ length: banks }, (_, i) => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </label>
                )}
                <label className="pal-inline"><input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Color 0 transparent</label>
                <label className="pal-inline"><input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} /> Show only the selected colors</label>
                {siblingPalettes.length > 0 && (
                  <label className="pal-inline" title="The same image in another palette of this folder">Beside
                    <select value={compare?.path ?? ""} onChange={(e) => showBeside(e.target.value)}>
                      <option value="">nothing</option>
                      {siblingPalettes.map((p) => <option key={p} value={p}>{baseOf(p)}</option>)}
                    </select>
                  </label>
                )}
              </div>
              {imageError && <p className="pal-error">{imageError}</p>}
              {image && maxIndex >= colors.length && (
                <p className="pal-error">The image uses color {maxIndex}; this palette has {colors.length}.</p>
              )}
              {image && (
                <div className="pal-images">
                  <figure>
                    <PalettePreview image={image} colors={shown} offset={offset} zoom={zoom} transparent={transparent}
                                    highlight={highlight ? selected : null} onPick={(i) => select(i)} />
                    <figcaption className="muted">{baseOf(file.path)}{dirty && " (unsaved)"}</figcaption>
                  </figure>
                  {compare && (
                    <figure>
                      <PalettePreview image={image} colors={compare.colors.map(snap)} offset={offset} zoom={zoom} transparent={transparent} highlight={null} />
                      <figcaption className="muted">
                        {baseOf(compare.path)} · <button className="link" onClick={() => choose(compare.path)}>edit it</button>
                      </figcaption>
                      <Swatches colors={compare.colors} small />
                    </figure>
                  )}
                </div>
              )}
              {image && <p className="muted pal-hint">{image.width}×{image.height}, {image.depth} bits a pixel. Click a pixel to choose its color.</p>}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
