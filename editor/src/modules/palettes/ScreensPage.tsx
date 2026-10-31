// The art converter's page: the screens of res/paperwhite2/art/targets.json (the boot logos, the copyright notice, the
// hack's own boot screen, the title screen), each as the game draws it now, with art from an image editor dropped on
// it, converted as the build will read it (tools/paperwhite2/screen_art.py, through POST /api/art/convert). The
// report says what doesn't fit, tile by tile; Apply writes the game's files, which the next build packs.

import { useCallback, useEffect, useState } from "react";
import { api } from "../../api.ts";
import type { ArtReport } from "../../../shared/api.ts";

const TARGETS = "res/paperwhite2/art/targets.json";

interface ArtScreen {
  name: string;
  title: string;
  chars: string;
  screen: string;
}

interface ArtTarget {
  name: string;
  title: string;
  description?: string;
  palette: string;
  depth: 4 | 8;
  rows?: number[];
  max_tiles?: number;
  screens: ArtScreen[];
}

interface Chosen {
  file: string;
  base64: string;
}

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

export function ScreensPage({ onOpenPalette }: { onOpenPalette(path: string): void }) {
  const [targets, setTargets] = useState<ArtTarget[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Record<string, Chosen>>({});
  const [result, setResult] = useState<{ report: ArtReport; previews: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    api.file(TARGETS).then((f) => {
      const list = (JSON.parse(f.text) as { targets: ArtTarget[] }).targets;
      setTargets(list);
      setName((n) => n ?? list[0]?.name ?? null);
    }).catch((e) => setError(`${TARGETS}: ${(e as Error).message}`));
  }, []);

  const target = targets?.find((t) => t.name === name) ?? null;

  const convert = useCallback(async (images: Record<string, Chosen>, write: boolean) => {
    if (!target) return;
    setBusy(true);
    try {
      const out = await api.artConvert(target.name, Object.fromEntries(Object.entries(images).map(([k, v]) => [k, v.base64])), write);
      setResult(out);
      if (write && out.report.written) {
        setMessage(`Wrote ${target.title}'s files. Build (Ctrl+B) to see it in the game.`);
        setChosen({});
        setResult(null);
        setEpoch((e) => e + 1);
      }
    } catch (e) {
      setResult(null);
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [target]);

  const choose = async (screen: string, file: File) => {
    const next = { ...chosen, [screen]: { file: file.name, base64: await toBase64(file) } };
    setChosen(next);
    setMessage(null);
    convert(next, false);
  };

  const pick = (t: string) => {
    if (Object.keys(chosen).length && !confirm("Leave the art you chose without applying it?")) return;
    setName(t);
    setChosen({});
    setResult(null);
    setMessage(null);
  };

  if (error) return <div className="pal-empty pal-error">{error}</div>;
  if (!targets) return <div className="pal-empty muted">Reading the screens…</div>;

  const report = result?.report;
  return (
    <div className="pal-editor">
      <div className="pal-list">
        <div className="pal-list-tools">
          <p className="muted pal-hint">The game's screens that art can replace. More can be added to <code>{TARGETS}</code>.</p>
        </div>
        <div className="pal-list-items">
          {targets.map((t) => (
            <button key={t.name} className={`pal-item art-target${t.name === name ? " selected" : ""}`} onClick={() => pick(t.name)}>
              {t.title}
              <span className="muted"> · {t.screens.length} screen{t.screens.length > 1 ? "s" : ""}, {t.depth === 4 ? "16" : "256"} colors</span>
            </button>
          ))}
        </div>
      </div>

      {target && (
        <div className="pal-main">
          <header className="pal-header">
            <h2>{target.title}</h2>
            <span className="spacer" />
            <label className="pal-inline">Zoom
              <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
                {[1, 2, 3].map((z) => <option key={z} value={z}>{z}×</option>)}
              </select>
            </label>
            <button onClick={() => onOpenPalette(target.palette)}>Edit its palette</button>
            <button className="primary" disabled={!report?.ok || busy || !Object.keys(chosen).length} onClick={() => convert(chosen, true)}>
              Apply to the game's files
            </button>
            {Object.keys(chosen).length > 0 && <button onClick={() => { setChosen({}); setResult(null); }}>Discard art</button>}
          </header>
          {message && <div className="pal-message">{message} <button className="link" onClick={() => setMessage(null)}>✕</button></div>}
          <div className="pal-body art-body">
            <div className="art-about">
              {target.description && <p>{target.description}</p>}
              <p className="muted pal-hint">
                {target.depth === 4
                  ? `16-color tiles: each 8×8 tile takes up to 15 colors and transparent from one palette row; ${target.rows ? `rows ${target.rows.join(", ")}` : "any of the palette's rows"} are free for the art, and rows of colors are found for you.`
                  : "256-color tiles: any 8×8 tile can use any of the palette's colors; the colors of the screens you keep stay where they are."}
                {" "}Up to {target.max_tiles ?? 1024} different tiles (repeats and flipped repeats are free). Transparent pixels show the backdrop.
                Colors are rounded to the DS's (5 bits an axis).
              </p>
            </div>
            {target.screens.map((s) => {
              const art = chosen[s.name];
              const preview = result?.previews[s.name];
              const sheet = report?.screens[s.name];
              const problems = report?.problems.filter((p) => p.screen === s.name) ?? [];
              return (
                <section key={s.name} className="pal-panel art-screen">
                  <div className="pal-row wrap">
                    <h3>{s.title}</h3>
                    <a className="pal-file-button" href={api.artRenderUrl(target.name, s.name)} download={`${target.name}_${s.name}.png`}
                       title="This screen as an indexed PNG in its palette, to draw over in Aseprite">Download as PNG</a>
                    <label className="pal-file-button" title="An indexed, RGB or RGBA PNG of the screen's size (256×192 for a whole DS screen)">
                      {art ? "Choose other art…" : "Choose art…"}
                      <input type="file" accept=".png" onChange={(e) => { const f = e.target.files?.[0]; if (f) choose(s.name, f); e.target.value = ""; }} />
                    </label>
                    {art && <span className="muted">{art.file}</span>}
                  </div>
                  <div className="pal-images">
                    <figure>
                      <img className="pal-canvas" style={{ width: 256 * zoom }} alt=""
                           src={`${api.screenUrl(s.chars, s.screen, target.palette)}&v=${epoch}`} />
                      <figcaption className="muted">In the game now</figcaption>
                    </figure>
                    {preview && (
                      <figure className="art-preview">
                        <div className="art-overlay-wrap" style={{ width: 256 * zoom }}>
                          <img className="pal-canvas" style={{ width: 256 * zoom }} alt="" src={`data:image/png;base64,${preview}`} />
                          {problems.filter((p) => p.x !== undefined).map((p, i) => (
                            <span key={i} className="art-bad-tile" title={p.message}
                                  style={{ left: p.x! * zoom, top: p.y! * zoom, width: 8 * zoom, height: 8 * zoom }} />
                          ))}
                        </div>
                        <figcaption className="muted">{art ? "With the art, as the DS will show it" : "Kept as it is"}</figcaption>
                      </figure>
                    )}
                  </div>
                  {sheet && (
                    <p className={`pal-hint${sheet.tiles > sheet.max_tiles ? " pal-error" : " muted"}`}>
                      {sheet.tiles} of {sheet.max_tiles} tiles in its sheet; palette rows {sheet.rows.join(", ")}.
                    </p>
                  )}
                  {problems.length > 0 && (
                    <div className="art-problems">
                      <strong className="pal-error">{problems.length} problem{problems.length > 1 ? "s" : ""}</strong>
                      <ul>
                        {problems.slice(0, 20).map((p, i) => (
                          <li key={i}>{p.x !== undefined ? `Tile at ${p.x}, ${p.y}: ` : ""}{p.message}</li>
                        ))}
                        {problems.length > 20 && <li className="muted">and {problems.length - 20} more, marked on the preview</li>}
                      </ul>
                    </div>
                  )}
                </section>
              );
            })}
            {busy && <p className="muted">Converting…</p>}
            {report?.ok && Object.keys(chosen).length > 0 && (
              <p className="pal-hint">The art fits{report.rows_changed.length ? `; it sets the colors of palette rows ${report.rows_changed.join(", ")}` : ""}. Apply writes the files; the build packs them.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
