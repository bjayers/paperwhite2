// The type icons' page: every type's 32×16 label (the summary's, the Pokédex's, the battle's move buttons' and the
// menus'), the row of the label palette (033.pal) it is drawn in, and who shares each entry of that row; the battle
// move buttons' palettes (res/graphics/btlv, colors 8-13); and the battle HUD's wedge colors
// (res/paperwhite2/type_colors.json). A label's PNG goes out and in indexed, with its palette row as its colors, or all
// labels on one sheet (POST /api/type-icons/check checks it), so a recolor in an image editor is a change to the row.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api.ts";
import { fileText, fromPlain, parseJson, setIn, toPlain } from "../../../shared/json.ts";
import type { TypeButton, TypeIconCheck, TypeIcons, TypeLabel, TypeRow } from "../../../shared/api.ts";
import { fromHex, parsePal, sameColor, snap, toHex, writePal, type Rgb } from "./pal.ts";

const WEDGES = "res/paperwhite2/type_colors.json";
const GRADIENT = [8, 9, 10, 11, 12, 13];
const MOVE_PREVIEW_NAMES = ["Surf", "Moonblast", "Roost", "Close Combat"];

interface Wedge {
  fill: Rgb;
  edge: Rgb;
}

type Colors = Rgb[];

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

const colorsEqual = (a: Colors, b: Colors) => a.length === b.length && a.every((c, i) => sameColor(c, b[i]));
const css = (c: Rgb) => `rgb(${snap(c).join(",")})`;
const ranges = (list: number[]) => {
  const parts: string[] = [];
  for (let i = 0; i < list.length; i++) {
    let j = i;
    while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
    parts.push(j > i ? `${list[i]}-${list[j]}` : `${list[i]}`);
    i = j;
  }
  return parts.join(", ");
};

/** A label's pixels drawn in a row's colors at a zoom, index 0 transparent. */
function LabelCanvas({ pixels, colors, zoom, width = 32, height = 16, className }: {
  pixels: number[]; colors: Colors; zoom: number; width?: number; height?: number; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const image = ctx.createImageData(width, height);
    pixels.forEach((p, i) => {
      const c = p === 0 || !colors[p] ? null : snap(colors[p]);
      image.data.set(c ? [c[0], c[1], c[2], 255] : [0, 0, 0, 0], i * 4);
    });
    ctx.putImageData(image, 0, 0);
  }, [pixels, colors, width, height]);
  return <canvas ref={ref} width={width} height={height} className={`type-label ${className ?? ""}`} style={{ width: width * zoom, height: height * zoom }} />;
}

function ColorEdit({ color, onChange, label }: { color: Rgb; onChange: (c: Rgb) => void; label?: string }) {
  const [hex, setHex] = useState(toHex(color));
  useEffect(() => setHex(toHex(color)), [color]);
  return (
    <span className="type-color-edit">
      {label && <span className="muted">{label}</span>}
      <input type="color" value={toHex(snap(color))} onChange={(e) => onChange(snap(fromHex(e.target.value)!))} />
      <input className="pal-hex pal-mono" value={hex} onChange={(e) => setHex(e.target.value)}
             onBlur={() => { const c = fromHex(hex); if (c) onChange(snap(c)); else setHex(toHex(color)); }} />
    </span>
  );
}

/** The wedge as the battle's name box shows it: a stair-stepped slant of two fields, the first type's above the
 * second's (a dual type's second type, or a monotype's darker edge). A schematic of its shape, not the game's pixels. */
function WedgePreview({ top, bottom, zoom }: { top: Rgb; bottom: Rgb; zoom: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 14, 13);
    for (let y = 0; y < 11; y++) {
      // The left edge steps in towards the bottom, as the box's does
      const x0 = y < 5 ? 0 : y - 4;
      ctx.fillStyle = css(y < 5 ? top : bottom);
      ctx.fillRect(1 + x0, 1 + y, 12 - x0, 1);
    }
  }, [top, bottom]);
  return <canvas ref={ref} width={14} height={13} className="type-label" style={{ width: 14 * zoom, height: 13 * zoom }} />;
}

/** A move button as a schematic: the type's gradient (colors 8-13, light to dark) in bands, the label and a move name. */
function ButtonPreview({ gradient, label, colors, name }: { gradient: Rgb[]; label: TypeLabel; colors: Colors; name: string }) {
  return (
    <div className="type-button" style={{ background: `linear-gradient(${gradient.map((c, i) => `${css(c)} ${(i / (gradient.length - 1)) * 100}%`).join(", ")})` }}>
      <span className="type-button-name">{name}</span>
      <LabelCanvas pixels={label.pixels} colors={colors} zoom={2} />
    </div>
  );
}

export function TypeIconsPage() {
  const [data, setData] = useState<TypeIcons | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [zoom, setZoom] = useState(6);
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<Colors[]>([]);
  const [buttons, setButtons] = useState<Record<number, Colors>>({});
  const [wedges, setWedges] = useState<Record<string, Wedge> | null>(null);
  const [savedWedges, setSavedWedges] = useState<Record<string, Wedge> | null>(null);
  const [entry, setEntry] = useState(8);
  const [check, setCheck] = useState<{ what: number | "sheet"; file: string; base64: string; result: TypeIconCheck } | null>(null);
  const [busy, setBusy] = useState(false);
  const [partner, setPartner] = useState(2);

  const load = useCallback(async () => {
    try {
      const d = await api.typeIcons();
      setData(d);
      setRows(d.rows.map((r) => r.colors.map((c) => c.slice() as Rgb)));
      setButtons(Object.fromEntries(d.buttons.map((b) => [b.id, b.colors.map((c) => c.slice() as Rgb)])));
      const file = await api.file(WEDGES);
      const plain = toPlain(parseJson(file.text)) as { types: Record<string, Wedge> };
      setWedges(plain.types);
      setSavedWedges(JSON.parse(JSON.stringify(plain.types)));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const label = data?.labels.find((l) => l.id === selected);
  const nameOf = useMemo(() => new Map(data?.labels.map((l) => [l.id, l.name]) ?? []), [data]);
  if (error) return <div className="pal-empty pal-error">{error}</div>;
  if (!data || !label || !wedges || !savedWedges) return <div className="pal-empty muted">Reading the type icons…</div>;

  const row: TypeRow = data.rows[label.row];
  const rowColors = rows[label.row] ?? row.colors;
  const rowDirty = (r: number) => !colorsEqual(rows[r] ?? [], data.rows[r].colors);
  const button: TypeButton | undefined = data.buttons.find((b) => b.id === label.id);
  const buttonColors = button ? buttons[button.id] ?? button.colors : null;
  const buttonDirty = button ? !colorsEqual(buttonColors!, button.colors) : false;
  const wedge = wedges[label.constant];
  const wedgeDirty = JSON.stringify(wedge) !== JSON.stringify(savedWedges[label.constant]);
  const dirtyWedges = Object.keys(wedges).filter((k) => JSON.stringify(wedges[k]) !== JSON.stringify(savedWedges[k]));
  const free = row.entries.filter((e) => e.index >= 1 && e.index <= 13 && e.labels.length === 0 && e.others.length === 0).map((e) => e.index);
  const own = [...new Set(label.pixels)].filter((p) => p > 0 && p < 14).sort((a, b) => a - b);
  const entryInfo = row.entries[entry];
  const entryUsers = [...entryInfo.labels.map((id) => nameOf.get(id) ?? String(id)), ...entryInfo.others];

  const setRowColor = (index: number, color: Rgb) =>
    setRows(rows.map((r, i) => (i === label.row ? r.map((c, j) => (j === index ? color : c)) : r)));
  const countShared = (r: number) => data.labels.filter((l) => l.row === r).length;

  const saveRow = async (r: number) => {
    const file = await api.file(data.palettePath);
    const colors = parsePal(file.text);
    rows[r].forEach((c, i) => { colors[r * 16 + i] = c; });
    const result = await api.save({ path: data.palettePath, text: writePal(colors), baseVersion: file.version });
    if (!result.ok) return setMessage(result.reason === "conflict" ? `${data.palettePath} changed on disk; reload the page's data.` : result.message);
    setMessage(`Saved row ${r} of ${data.palettePath}. Build (Ctrl+B) to see it in the game.`);
    await load();
  };
  const saveButton = async () => {
    if (!button || !buttonColors) return;
    const file = await api.file(button.path);
    const colors = parsePal(file.text);
    buttonColors.forEach((c, i) => { colors[i] = c; });
    const result = await api.save({ path: button.path, text: writePal(colors), baseVersion: file.version });
    if (!result.ok) return setMessage(result.reason === "conflict" ? `${button.path} changed on disk.` : result.message);
    setMessage(`Saved ${button.path}.`);
    await load();
  };
  const saveWedges = async () => {
    const file = await api.file(WEDGES);
    let doc = parseJson(file.text);
    for (const key of dirtyWedges) {
      doc = setIn(doc, ["types", key, "fill"], fromPlain(wedges[key].fill));
      doc = setIn(doc, ["types", key, "edge"], fromPlain(wedges[key].edge));
    }
    const result = await api.save({ path: WEDGES, text: fileText(doc), baseVersion: file.version });
    if (!result.ok) return setMessage(result.reason === "conflict" ? `${WEDGES} changed on disk.` : result.message);
    setMessage(`Saved ${WEDGES}. Build (Ctrl+B) to see the wedges in the game.`);
    await load();
  };

  const importPng = async (what: number | "sheet", file: File) => {
    setMessage(null);
    if (rows.some((_, r) => rowDirty(r)) && !confirm("Some row colors are unsaved; an import replaces them. Go on?")) return;
    setBusy(true);
    try {
      const base64 = await toBase64(file);
      const result = await api.typeIconCheck(what, base64);
      setCheck({ what, file: file.name, base64, result });
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const applyImport = async () => {
    if (!check) return;
    setBusy(true);
    try {
      const result = await api.typeIconCheck(check.what, check.base64, true);
      if (result.written) setMessage(`Wrote ${result.files.join(", ")}. Build (Ctrl+B) to see it in the game.`);
      else setMessage(result.message);
      setCheck(null);
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const pickFile = (what: number | "sheet") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void importPng(what, f);
    e.target.value = "";
  };

  const checkedRows = check?.result.ok ? check.result.rows : null;
  const partnerLabel = data.labels.find((l) => l.id === partner)!;

  const list = [0, 1, 2].map((r) => (
    <div key={r}>
      <div className="pal-group">Row {r} · {countShared(r)} labels{rowDirty(r) ? " · unsaved" : ""}</div>
      {data.labels.filter((l) => l.row === r).map((l) => (
        <button key={l.id} className={`pal-item item-icon-row${l.id === selected ? " selected" : ""}`} onClick={() => setSelected(l.id)}>
          <LabelCanvas pixels={l.pixels} colors={rows[l.row] ?? data.rows[l.row].colors} zoom={2} />
          <span>{l.name}</span>
          {(wedgeChanged(l.constant) || (data.buttons.find((b) => b.id === l.id) && !colorsEqual(buttons[l.id] ?? [], data.buttons.find((b) => b.id === l.id)!.colors))) &&
            <span className="muted"> · unsaved</span>}
        </button>
      ))}
    </div>
  ));
  function wedgeChanged(constant: string) {
    return JSON.stringify(wedges![constant]) !== JSON.stringify(savedWedges![constant]);
  }

  return (
    <div className="pal-editor">
      <div className="pal-list">
        <div className="pal-list-items">{list}</div>
      </div>

      <div className="pal-main">
        <header className="pal-header">
          <h2>{label.name}</h2>
          <span className="muted">{label.constant} · member {label.member} · palette row {label.row}</span>
          <span className="spacer" />
          <label className="pal-inline">Zoom
            <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
              {[3, 4, 6, 8].map((z) => <option key={z} value={z}>{z}×</option>)}
            </select>
          </label>
        </header>
        {message && <div className="pal-message">{message} <button className="link" onClick={() => setMessage(null)}>✕</button></div>}

        <div className="pal-body art-body">
          <section className="pal-panel art-screen">
            <h3>Label art</h3>
            <p className="muted pal-hint">
              32×16, 4 bits a pixel: the picture is palette indices 0-15 of row {label.row} (0 transparent, 14 the letters' shadow,
              15 the letters). Export gives an indexed PNG whose colors are the row's; draw with those indices, and recolor by
              changing the PNG's palette. The sheet has all {data.labels.length} labels with the three rows as its colors 0-15, 16-31
              and 32-47 (a label's pixels use its own row's). The Info page, summary, bag, box and battle all load a label the
              same way, so only the size and the row's colors matter: it can be flashier, not bigger.
            </p>
            {label.constant === "TYPE_NULL" && (
              <p className="pal-hint pal-error">
                The game has no label for ???: this slot's member {label.member} is a contest category's picture (COOL), which the
                game never shows for a type (a typeless move has no type to show). It is listed because its colors are in row {label.row}.
              </p>
            )}
            <div className="pal-row wrap">
              <a className="pal-file-button" href={api.typeIconExportUrl(label.id)} download={`type_${label.constant.toLowerCase()}.png`}
                 title="This label's PNG, with its palette row as its colors">Export {label.name} PNG</a>
              <label className="pal-file-button" title="A 32×16 indexed PNG">
                Import {label.name} PNG…
                <input type="file" accept=".png" onChange={pickFile(label.id)} />
              </label>
              <span className="spacer" />
              <a className="pal-file-button" href={api.typeIconExportUrl("sheet")} download="type_labels_sheet.png"
                 title="Every label on one sheet, the rows as colors 0-47">Export all labels (sheet)</a>
              <label className="pal-file-button" title="The sheet, edited">
                Import sheet…
                <input type="file" accept=".png" onChange={pickFile("sheet")} />
              </label>
            </div>
            <div className="pal-images item-icon-preview">
              <figure>
                <LabelCanvas pixels={label.pixels} colors={rowColors} zoom={zoom} />
                <figcaption className="muted">In the game now{rowDirty(label.row) ? " (with the unsaved row colors)" : ""}</figcaption>
              </figure>
              <figure>
                <LabelCanvas pixels={label.pixels} colors={rowColors} zoom={1} />
                <figcaption className="muted">Actual size</figcaption>
              </figure>
            </div>
            {busy && <p className="muted pal-hint">Checking…</p>}
            {check && (
              <div className="type-check">
                <h4>Import: {check.file}</h4>
                <p className={`pal-hint${check.result.ok ? "" : " pal-error"}`}>{check.result.message}</p>
                {check.result.ok && check.result.labels.length > 0 && (
                  <div className="pal-images">
                    {check.result.labels.filter((l) => l.pixelsChanged || check.what !== "sheet").map((l) => (
                      <figure key={l.id}>
                        <LabelCanvas pixels={l.pixels} colors={checkedRows![l.row].colors} zoom={Math.min(zoom, 4)} />
                        <figcaption className="muted">{l.name}{l.pixelsChanged ? "" : " (same pixels)"}</figcaption>
                      </figure>
                    ))}
                  </div>
                )}
                {check.result.ok && check.result.changes.length > 0 && (
                  <>
                    <p className="pal-hint">These palette entries change color:</p>
                    <ul className="type-changes">
                      {check.result.changes.map((c) => (
                        <li key={`${c.row}-${c.index}`}>
                          row {c.row} entry {c.index}
                          <span className="type-chip-swatch" style={{ background: css(c.from) }} /> →
                          <span className="type-chip-swatch" style={{ background: css(c.to) }} />
                          {c.shared
                            ? <span className="pal-error"> also used by {c.users.join(", ")}: they change too</span>
                            : <span className="muted"> only this import's labels use it</span>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="pal-row">
                  <button className="primary" disabled={!check.result.ok || check.result.nothing || busy} onClick={applyImport}>
                    Apply to {check.result.files.length || "the"} game file{check.result.files.length === 1 ? "" : "s"}
                  </button>
                  <button onClick={() => setCheck(null)}>Discard import</button>
                  <span className="muted">Writes the labels' PNGs under res/graphics/app_menu_common and, for other colors, {data.palettePath}.</span>
                </div>
              </div>
            )}
          </section>

          <section className="pal-panel art-screen">
            <h3>Palette row {label.row} <span className="muted">· {data.palettePath}, shared by {countShared(label.row)} labels</span></h3>
            <p className="muted pal-hint">
              Each row has 16 colors: 0 is transparent, 14 and 15 are the letters' shadow and letters, and 1-13 are shared
              by every label drawn in the row and by the menus' other icons that use it. Click an entry to edit it; a color
              used by other labels changes theirs too. Only these 13 entries per row are free to draw with:
              {" "}{free.length > 0 ? `row ${label.row} has ${free.length} no label or menu icon uses (${ranges(free)})` : `row ${label.row} has none unused`}.
            </p>
            <div className="type-entries">
              {row.entries.map((e) => {
                const color = rowColors[e.index];
                const users = e.labels.length + e.others.length;
                const mine = own.includes(e.index);
                return (
                  <button key={e.index} className={`type-entry${e.index === entry ? " selected" : ""}${mine ? " mine" : ""}`}
                          onClick={() => setEntry(e.index)} title={e.index === 0 ? "Transparent" : `${users} user${users === 1 ? "" : "s"}`}>
                    <span className={`type-entry-swatch${e.index === 0 ? " zero" : ""}`} style={{ background: e.index === 0 ? undefined : css(color) }} />
                    <span className="pal-mono">{e.index}</span>
                    <span className="muted type-entry-users">{e.index === 0 ? "clear" : e.index === 14 ? "shadow" : e.index === 15 ? "letters" : users === 0 ? "free" : `×${users}`}</span>
                  </button>
                );
              })}
            </div>
            <div className="type-entry-edit">
              <b>Entry {entry}</b>
              {entry === 0
                ? <span className="muted"> is transparent: its color is never drawn.</span>
                : (
                  <>
                    <ColorEdit color={rowColors[entry]} onChange={(c) => setRowColor(entry, c)} />
                    {!sameColor(rowColors[entry], row.colors[entry]) && (
                      <button onClick={() => setRowColor(entry, row.colors[entry])}>Undo</button>
                    )}
                    <span className={entryUsers.length > 1 || (entryUsers.length === 1 && !entryUsers.includes(label.name)) ? "pal-error" : "muted"}>
                      {entryUsers.length === 0 ? " Nothing uses it: free to draw with."
                        : ` Used by ${entryUsers.join(", ")}${entry >= 14 ? " (every label of the row)" : ""}.`}
                    </span>
                  </>
                )}
            </div>
            <div className="pal-row">
              <button className="primary" disabled={!rowDirty(label.row)} onClick={() => void saveRow(label.row)}>Save row {label.row} of 033.pal</button>
              <button disabled={!rowDirty(label.row)} onClick={() => setRows(rows.map((r, i) => (i === label.row ? data.rows[i].colors : r)))}>Discard row changes</button>
              <span className="muted">Writes only row {label.row}'s {rowDirty(label.row) ? "changed entries" : "16 entries"}.</span>
            </div>
          </section>

          <section className="pal-panel art-screen">
            <h3>Where it shows</h3>
            <p className="muted pal-hint">The label on the screens' backgrounds, with the row's colors as edited above (the backgrounds are stand-ins).</p>
            <div className="type-scenes">
              <div className="type-scene" style={{ background: "#2a3a55" }}>
                <LabelCanvas pixels={label.pixels} colors={rowColors} zoom={2} />
                <span>Summary and bag</span>
              </div>
              <div className="type-scene" style={{ background: "#f3efe2", color: "#222" }}>
                <LabelCanvas pixels={label.pixels} colors={rowColors} zoom={2} />
                <span>Pokédex entry and Matchups</span>
              </div>
              <div className="type-scene" style={{ background: "#14181f" }}>
                <LabelCanvas pixels={label.pixels} colors={rowColors} zoom={2} />
                <span>Box and party list</span>
              </div>
            </div>
          </section>

          {button && buttonColors && (
            <section className="pal-panel art-screen">
              <h3>Battle move button <span className="muted">· {button.path}</span></h3>
              <p className="muted pal-hint">
                The button's colors in the battle's move menu when a move is {label.name}-type: entries 8-13 are its gradient, light
                to dark. (Entries 0-7 and 14 are the button's frame and text, as every type's; they stay as they are.)
                The preview is a schematic of the gradient with the label, not the game's button art.
              </p>
              <div className="type-gradient">
                {GRADIENT.map((i) => (
                  <ColorEdit key={i} label={String(i)} color={buttonColors[i]}
                             onChange={(c) => setButtons({ ...buttons, [button.id]: buttonColors.map((o, j) => (j === i ? c : o)) })} />
                ))}
              </div>
              <div className="type-buttons">
                {[0, 1].map((i) => (
                  <ButtonPreview key={i} gradient={GRADIENT.map((g) => buttonColors[g])} label={label} colors={rowColors} name={MOVE_PREVIEW_NAMES[(label.id + i) % 4]} />
                ))}
              </div>
              <div className="pal-row">
                <button className="primary" disabled={!buttonDirty} onClick={() => void saveButton()}>Save {button.path.split("/").pop()}</button>
                <button disabled={!buttonDirty} onClick={() => setButtons({ ...buttons, [button.id]: button.colors })}>Discard button changes</button>
                {label.constant === "TYPE_FAIRY" && <span className="muted">Fairy's started as a copy of Psychic's.</span>}
              </div>
            </section>
          )}
          {!button && (
            <section className="pal-panel art-screen">
              <h3>Battle move button</h3>
              <p className="muted pal-hint">{label.name} has no move button: no move has this type in battle.</p>
            </section>
          )}

          <section className="pal-panel art-screen">
            <h3>Battle HUD wedge <span className="muted">· {WEDGES}</span></h3>
            <p className="muted pal-hint">
              The small wedge at the left of each battler's name box (Type Icons): a monotype's fill above its darker edge, a dual
              type's two fills. Two colors a type, shown as the DS shows them. Take them from the label's own colors, or pick any.
            </p>
            <div className="type-wedge-edit">
              <ColorEdit label="Fill" color={wedge.fill} onChange={(c) => setWedges({ ...wedges, [label.constant]: { ...wedge, fill: c } })} />
              <span className="type-from">from the label:
                {own.map((i) => (
                  <button key={i} className="type-from-swatch" style={{ background: css(rowColors[i]) }} title={`Entry ${i}`}
                          onClick={() => setWedges({ ...wedges, [label.constant]: { ...wedge, fill: snap(rowColors[i]) } })} />
                ))}
              </span>
            </div>
            <div className="type-wedge-edit">
              <ColorEdit label="Edge" color={wedge.edge} onChange={(c) => setWedges({ ...wedges, [label.constant]: { ...wedge, edge: c } })} />
              <span className="type-from">from the label:
                {own.map((i) => (
                  <button key={i} className="type-from-swatch" style={{ background: css(rowColors[i]) }} title={`Entry ${i}`}
                          onClick={() => setWedges({ ...wedges, [label.constant]: { ...wedge, edge: snap(rowColors[i]) } })} />
                ))}
              </span>
            </div>
            <div className="pal-images">
              <figure>
                <WedgePreview top={wedge.fill} bottom={wedge.edge} zoom={Math.min(zoom, 8) + 2} />
                <figcaption className="muted">{label.name} alone</figcaption>
              </figure>
              <figure>
                <WedgePreview top={wedge.fill} bottom={wedges[partnerLabel.constant].fill} zoom={Math.min(zoom, 8) + 2} />
                <figcaption className="muted">
                  with <select value={partner} onChange={(e) => setPartner(Number(e.target.value))}>
                    {data.labels.filter((l) => l.id !== 17).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </figcaption>
              </figure>
            </div>
            <div className="pal-row">
              <button className="primary" disabled={dirtyWedges.length === 0} onClick={() => void saveWedges()}>
                Save wedge colors{dirtyWedges.length > 1 ? ` (${dirtyWedges.length} types)` : ""}
              </button>
              <button disabled={!wedgeDirty} onClick={() => setWedges({ ...wedges, [label.constant]: JSON.parse(JSON.stringify(savedWedges[label.constant])) })}>Discard {label.name}'s changes</button>
              <span className="muted">Writes {WEDGES}; the build packs it into the HUD's table.</span>
            </div>
          </section>

          <section className="pal-panel art-screen">
            <h3>How the palette rows are shared</h3>
            <div className="type-rows">
              {data.rows.map((r) => {
                const labels = data.labels.filter((l) => l.row === r.row);
                const freeEntries = r.entries.filter((e) => e.index >= 1 && e.index <= 13 && e.labels.length === 0 && e.others.length === 0).map((e) => e.index);
                return (
                  <div key={r.row} className="type-row-card">
                    <b>Row {r.row}</b> <span className="muted">· {labels.length} labels: {labels.map((l) => l.name).join(", ")}</span>
                    <div className="type-row-strip">
                      {(rows[r.row] ?? r.colors).map((c, i) => <span key={i} className="type-entry-swatch" style={{ background: i === 0 ? "transparent" : css(c) }} title={`${i}`} />)}
                    </div>
                    <div className="muted">
                      {freeEntries.length > 0 ? `${freeEntries.length} unused of entries 1-13: ${ranges(freeEntries)}.` : "No unused entry in 1-13."}
                      {" "}{r.entries.filter((e) => e.others.length > 0).length > 0 &&
                        `Menu icons use ${ranges(r.entries.filter((e) => e.others.length > 0).map((e) => e.index))}.`}
                    </div>
                  </div>
                );
              })}
            </div>
            <details>
              <summary>What the limits are</summary>
              <ul className="type-limits">
                <li>A label is 32×16 with 16 colors: its row's. It cannot have its own palette: every screen loads the type
                  palette as three rows (48 colors) into three OBJ palette slots, and a label picks one by its row number, so
                  nine labels (row 0), six (row 1) and four (row 2) draw with the same 13 shared colors. Two labels that share a color entry
                  change together; that is why the vanilla labels have only two colors of their own.</li>
                <li>More rows would be new OBJ palette slots on every screen that shows labels (summary, bag, PC box, Pokédex entry,
                  battle party list and move menu, move tutor, trade, PWT book, Pokédex move panel), each of which now loads exactly
                  three rows and has the slots after them in use (the Pokédex Info page's, the battle's palette fades). That
                  is a code change in each. The editor therefore stays within the three rows. Moving a label to another row (so a crowded row has room) is one table of
                  <code> app_menu_common.c</code> (<code>sTypeIconPalettes</code>) and is possible; it is not done here.</li>
                <li>The Info page: a label is loaded there like everywhere (same size, same row), so recolored or redrawn labels do
                  not change its sprite-slot count.</li>
              </ul>
            </details>
          </section>
        </div>
      </div>
    </div>
  );
}
