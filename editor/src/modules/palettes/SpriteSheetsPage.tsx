// The sprite sheets' page: sheets of OBJ art that a build tool packs whole (GET /api/sprite-sheets), such as the
// Pokédex Area page's icons. A PNG from an image editor is checked by the sheet's own tool (POST
// /api/sprite-sheets/check), which says whether it packs, or which icons keep it from packing, and shows it as the
// game will; Apply writes it over the sheet's PNG under res/, which the next build packs. A sheet that is one picture
// of up to 16 colors (the Entralink run's markers, listed by their tool) also has its palette on the page: a color
// changed there is checked by the tool again and Apply writes the PNG with it. A sheet drawn in colour tiers (the
// damage numbers' digits) has its tiers' colours on the page too (TierColorsPanel), with a preview of each tier.

import { useCallback, useEffect, useState } from "react";
import { api } from "../../api.ts";
import type { SpriteSheet, SpriteSheetCheck } from "../../../shared/api.ts";
import { TierColorsPanel } from "./TierColorsPanel.tsx";

interface Chosen {
  file: string;
  base64: string;
  size: string;
}

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** Whether a PNG's size can be the sheet's: its size, or for a sheet of rows any multiple of its row's height. */
function sizeFits(sheet: SpriteSheet, [width, height]: [number, number]): boolean {
  if (width !== sheet.width) return false;
  if (!sheet.heightStep) return height === sheet.height;
  return height > 0 && height % sheet.heightStep === 0 && height <= (sheet.maxHeight ?? sheet.height);
}

/** The size a sheet takes, as the page says it. */
function sizeText(sheet: SpriteSheet): string {
  return sheet.heightStep
    ? `${sheet.width} wide by a multiple of ${sheet.heightStep} up to ${sheet.maxHeight ?? sheet.height} tall`
    : `${sheet.width}×${sheet.height}`;
}

/** A PNG's width and height, from its header. */
async function pngSize(file: File): Promise<[number, number] | null> {
  const head = new DataView(await file.slice(0, 24).arrayBuffer());
  if (head.byteLength < 24 || head.getUint32(0) !== 0x89504e47 || head.getUint32(12) !== 0x49484452) return null;
  return [head.getUint32(16), head.getUint32(20)];
}

export function SpriteSheetsPage() {
  const [sheets, setSheets] = useState<SpriteSheet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [current, setCurrent] = useState<SpriteSheetCheck | null>(null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [result, setResult] = useState<SpriteSheetCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(2);
  // A sheet with a palette: the colors edited on the page (16 "#rrggbb"), over the chosen PNG or the one in res/
  const [palette, setPalette] = useState<string[] | null>(null);

  useEffect(() => {
    api.spriteSheets().then((list) => {
      setSheets(list);
      setName((n) => n ?? list[0]?.name ?? null);
    }).catch((e) => setError((e as Error).message));
  }, []);

  const sheet = sheets?.find((s) => s.name === name) ?? null;

  const readCurrent = useCallback(() => {
    if (!sheet) return;
    setCurrent(null);
    api.spriteSheetCheck(sheet.name).then(setCurrent).catch((e) => setCurrent({ ok: false, message: (e as Error).message, written: false, preview: null }));
  }, [sheet]);

  useEffect(readCurrent, [readCurrent]);

  const choose = async (file: File) => {
    if (!sheet) return;
    setMessage(null);
    setResult(null);
    setPalette(null);
    const size = await pngSize(file);
    if (!size) {
      setChosen(null);
      setMessage(`${file.name} isn't a PNG.`);
      return;
    }
    const next = { file: file.name, base64: await toBase64(file), size: `${size[0]}×${size[1]}` };
    setChosen(next);
    if (!sizeFits(sheet, size)) {
      setResult({ ok: false, message: `${file.name} is ${next.size}; the sheet must be ${sizeText(sheet)}.`, written: false, preview: null });
      return;
    }
    setBusy(true);
    try {
      setResult(await api.spriteSheetCheck(sheet.name, next.base64));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!sheet || (!chosen && !palette)) return;
    setBusy(true);
    try {
      const out = await api.spriteSheetCheck(sheet.name, chosen?.base64, true, palette ?? undefined);
      if (out.written) {
        setMessage(`Wrote ${sheet.path}. Build (Ctrl+B) to see it in the game.`);
        setChosen(null);
        setPalette(null);
        setResult(null);
        readCurrent();
      } else {
        setResult(out);
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pick = (n: string) => {
    if ((chosen || palette) && !confirm("Leave the changes you made without applying them?")) return;
    setName(n);
    setChosen(null);
    setPalette(null);
    setResult(null);
    setMessage(null);
  };

  // A color of the palette changed: the picture with it is checked again, so that its preview shows it
  const setColor = async (index: number, color: string) => {
    if (!sheet) return;
    const colors = [...(palette ?? result?.colors ?? current?.colors ?? [])];
    if (colors.length === 0) return;
    colors[index] = color;
    setPalette(colors);
    setMessage(null);
    setBusy(true);
    try {
      const out = await api.spriteSheetCheck(sheet.name, chosen?.base64, false, colors);
      setResult(out);
      if (out.colors) setPalette(out.colors);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="pal-empty pal-error">{error}</div>;
  if (!sheets) return <div className="pal-empty muted">Reading the sprite sheets…</div>;

  // The palette of a picture of up to 16 colors: each color changes by its picker (to the DS's 5 bits an axis); 0 is clear
  const swatches = (colors: string[]) => (
    <div className="marker-palette">
      <p className="muted pal-hint">Palette: color 0 is clear (the ground shows through), 1-15 are the picture's colors.
        Click one to change it; the picture is checked again with it.</p>
      <div className="marker-swatches">
        {colors.map((color, i) => (
          <label key={i} className={`marker-swatch${i === 0 ? " clear" : ""}`} title={i === 0 ? "0: clear" : `${i}: ${color}`}>
            <input type="color" value={color} disabled={busy} onChange={(e) => setColor(i, e.target.value)} />
            <span>{i}</span>
          </label>
        ))}
      </div>
    </div>
  );

  const shown = (check: SpriteSheetCheck | null, caption: string) => check?.preview && sheet && (
    <figure>
      <img className="pal-canvas sheet-canvas" style={{ width: sheet.width * zoom }} alt="" src={`data:image/png;base64,${check.preview}`} />
      <figcaption className="muted">{caption}</figcaption>
    </figure>
  );

  return (
    <div className="pal-editor">
      <div className="pal-list">
        <div className="pal-list-tools">
          <p className="muted pal-hint">Sprite sheets that the build packs whole from one PNG.</p>
        </div>
        <div className="pal-list-items">
          {sheets.map((s) => (
            <button key={s.name} className={`pal-item art-target${s.name === name ? " selected" : ""}`} onClick={() => pick(s.name)}>
              {s.title}
              <span className="muted"> · {s.width}×{s.height}</span>
            </button>
          ))}
        </div>
      </div>

      {sheet && (
        <div className="pal-main">
          <header className="pal-header">
            <h2>{sheet.title}</h2>
            <span className="spacer" />
            <label className="pal-inline">Zoom
              <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
                {[1, 2, 3, 4].map((z) => <option key={z} value={z}>{z}×</option>)}
              </select>
            </label>
            <button className="primary" disabled={!result?.ok || busy || (!chosen && !palette)} onClick={apply}>Apply to the game's files</button>
            {(chosen || palette) && <button onClick={() => { setChosen(null); setPalette(null); setResult(null); }}>Discard changes</button>}
          </header>
          {message && <div className="pal-message">{message} <button className="link" onClick={() => setMessage(null)}>✕</button></div>}
          <div className="pal-body art-body">
            <div className="art-about">
              <p>{sheet.description}</p>
              <p className="muted pal-hint">
                A {sizeText(sheet)} PNG (indexed with color 0 transparent, or RGBA); colors are rounded to the
                DS's (5 bits an axis). {sheet.palette
                  ? "The previews show the picture as the game does, clear pixels over a checkerboard. A PNG with more than 16 colors, or a color index past 15, is refused; a picture with no clear pixel is warned about."
                  : "The previews show the sheet as the game does, on the page's grey, over the grey copies."} Checked by <code>{sheet.tool}</code>; written to <code>{sheet.path}</code>.
              </p>
            </div>

            <section className="pal-panel art-screen">
              <div className="pal-row wrap">
                <h3>In the game now</h3>
                <a className="pal-file-button" href={api.assetUrl(sheet.path)} download={sheet.path.split("/").pop()}
                   title="The sheet's PNG as it is in res/, to draw over">Download PNG</a>
              </div>
              <div className="pal-images">{shown(current, sheet.path)}</div>
              {current && <p className={`pal-hint${current.ok ? " muted" : " pal-error"}`}>{current.message}</p>}
              {sheet.palette && !chosen && !palette && current?.colors && swatches(current.colors)}
              {!current && <p className="muted pal-hint">Checking…</p>}
            </section>

            {sheet.tierColors && (
              <TierColorsPanel sheet={sheet} pixels={(result?.ok ? result : current)?.pixels}
                               colors={palette ?? (result?.ok ? result.colors : current?.colors)} />
            )}

            <section className="pal-panel art-screen">
              <div className="pal-row wrap">
                <h3>{sheet.palette ? "New picture" : "New sheet"}</h3>
                <label className="pal-file-button" title={`A ${sizeText(sheet)} PNG`}>
                  {chosen ? "Choose another PNG…" : "Import PNG…"}
                  <input type="file" accept=".png" onChange={(e) => { const f = e.target.files?.[0]; if (f) choose(f); e.target.value = ""; }} />
                </label>
                {chosen && <span className="muted">{chosen.file} ({chosen.size})</span>}
              </div>
              {busy && <p className="muted pal-hint">Checking…</p>}
              {sheet.palette && (chosen || palette) && (palette ?? result?.colors) && swatches(palette ?? result?.colors ?? [])}
              {result && (
                <>
                  <div className="pal-images">{shown(result, "With the new sheet, as the DS will show it")}</div>
                  <p className={`pal-hint${result.ok ? "" : " pal-error"}`}>
                    {result.ok ? `It packs: ${result.message}. Apply writes it; the build packs it.` : result.message}
                  </p>
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
