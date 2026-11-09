// The sprite sheets' page: sheets of OBJ art that a build tool packs whole (GET /api/sprite-sheets), such as the
// Pokédex Area page's icons. A PNG from an image editor is checked by the sheet's own tool (POST
// /api/sprite-sheets/check), which says whether it packs, or which icons keep it from packing, and shows it as the
// game will; Apply writes it over the sheet's PNG under res/, which the next build packs.

import { useCallback, useEffect, useState } from "react";
import { api } from "../../api.ts";
import type { SpriteSheet, SpriteSheetCheck } from "../../../shared/api.ts";

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
    const size = await pngSize(file);
    if (!size) {
      setChosen(null);
      setMessage(`${file.name} isn't a PNG.`);
      return;
    }
    const next = { file: file.name, base64: await toBase64(file), size: `${size[0]}×${size[1]}` };
    setChosen(next);
    if (size[0] !== sheet.width || size[1] !== sheet.height) {
      setResult({ ok: false, message: `${file.name} is ${next.size}; the sheet must be ${sheet.width}×${sheet.height}.`, written: false, preview: null });
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
    if (!sheet || !chosen) return;
    setBusy(true);
    try {
      const out = await api.spriteSheetCheck(sheet.name, chosen.base64, true);
      if (out.written) {
        setMessage(`Wrote ${sheet.path}. Build (Ctrl+B) to see it in the game.`);
        setChosen(null);
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
    if (chosen && !confirm("Leave the sheet you chose without applying it?")) return;
    setName(n);
    setChosen(null);
    setResult(null);
    setMessage(null);
  };

  if (error) return <div className="pal-empty pal-error">{error}</div>;
  if (!sheets) return <div className="pal-empty muted">Reading the sprite sheets…</div>;

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
            <button className="primary" disabled={!result?.ok || busy || !chosen} onClick={apply}>Apply to the game's files</button>
            {chosen && <button onClick={() => { setChosen(null); setResult(null); }}>Discard sheet</button>}
          </header>
          {message && <div className="pal-message">{message} <button className="link" onClick={() => setMessage(null)}>✕</button></div>}
          <div className="pal-body art-body">
            <div className="art-about">
              <p>{sheet.description}</p>
              <p className="muted pal-hint">
                A {sheet.width}×{sheet.height} PNG (indexed with color 0 transparent, or RGBA); colors are rounded to the
                DS's (5 bits an axis). The previews show the sheet as the game does, on the page's grey, over the grey
                copies. Checked by <code>{sheet.tool}</code>; written to <code>{sheet.path}</code>.
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
              {!current && <p className="muted pal-hint">Checking…</p>}
            </section>

            <section className="pal-panel art-screen">
              <div className="pal-row wrap">
                <h3>New sheet</h3>
                <label className="pal-file-button" title={`A ${sheet.width}×${sheet.height} PNG`}>
                  {chosen ? "Choose another PNG…" : "Import PNG…"}
                  <input type="file" accept=".png" onChange={(e) => { const f = e.target.files?.[0]; if (f) choose(f); e.target.value = ""; }} />
                </label>
                {chosen && <span className="muted">{chosen.file} ({chosen.size})</span>}
              </div>
              {busy && <p className="muted pal-hint">Checking…</p>}
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
