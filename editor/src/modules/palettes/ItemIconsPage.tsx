// The item icons' page: every item's bag icon (GET /api/item-icons), the hack's items first. A PNG from an image
// editor is checked as the item's icon (POST /api/item-icons/check: 32×32, 15 colors and transparency) and shown as the
// game will; Apply writes its icon and palette over the files the item shows, under res/, which the next build packs.

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api.ts";
import type { ItemIcon, ItemIconCheck, ItemIcons } from "../../../shared/api.ts";

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

/** A PNG's width and height, from its header. */
async function pngSize(file: File): Promise<[number, number] | null> {
  const head = new DataView(await file.slice(0, 24).arrayBuffer());
  if (head.byteLength < 24 || head.getUint32(0) !== 0x89504e47 || head.getUint32(12) !== 0x49484452) return null;
  return [head.getUint32(16), head.getUint32(20)];
}

function Icon({ preview, size }: { preview: string | null; size: number }) {
  if (!preview) return <span className="item-icon-missing" style={{ width: size, height: size }} />;
  return <img className="item-icon" style={{ width: size, height: size }} alt="" src={`data:image/png;base64,${preview}`} />;
}

export function ItemIconsPage() {
  const [data, setData] = useState<ItemIcons | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [result, setResult] = useState<ItemIconCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(4);

  const load = useCallback(() => {
    api.itemIcons().then((d) => {
      setData(d);
      setSelected((s) => s ?? d.items[0]?.constant ?? null);
    }).catch((e) => setError((e as Error).message));
  }, []);

  useEffect(load, [load]);

  const names = useMemo(() => new Map(data?.items.map((i) => [i.constant, i.name]) ?? []), [data]);
  const item = data?.items.find((i) => i.constant === selected) ?? null;
  const shown = useMemo(() => {
    const words = filter.trim().toLowerCase();
    const items = data?.items ?? [];
    return words ? items.filter((i) => `${i.name} ${i.constant} ${i.id}`.toLowerCase().includes(words)) : items;
  }, [data, filter]);

  const choose = async (file: File) => {
    if (!item || !data) return;
    setMessage(null);
    setResult(null);
    const size = await pngSize(file);
    if (!size) {
      setChosen(null);
      setMessage(`${file.name} isn't a PNG.`);
      return;
    }
    const next = { file: file.name, base64: await toBase64(file) };
    setChosen(next);
    if (size[0] !== data.size || size[1] !== data.size) {
      setResult({ ok: false, message: `${file.name} is ${size[0]}×${size[1]}; an item icon is ${data.size}×${data.size}.`, written: false, preview: null });
      return;
    }
    setBusy(true);
    try {
      setResult(await api.itemIconCheck(item.constant, next.base64));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!item || !chosen) return;
    setBusy(true);
    try {
      const out = await api.itemIconCheck(item.constant, chosen.base64, true);
      if (out.written) {
        setMessage(`Wrote ${item.iconPath} and ${item.palettePath}. Build (Ctrl+B) to see it in the game.`);
        setChosen(null);
        setResult(null);
        load();
      } else {
        setResult(out);
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pick = (constant: string) => {
    if (chosen && !confirm("Leave the icon you chose without applying it?")) return;
    setSelected(constant);
    setChosen(null);
    setResult(null);
    setMessage(null);
  };

  if (error) return <div className="pal-empty pal-error">{error}</div>;
  if (!data) return <div className="pal-empty muted">Reading the item icons…</div>;

  const row = (i: ItemIcon) => (
    <button key={i.constant} className={`pal-item item-icon-row${i.constant === selected ? " selected" : ""}`} onClick={() => pick(i.constant)}>
      <Icon preview={i.preview} size={32} />
      <span>{i.name}</span>
      <span className="muted"> · {i.id}</span>
    </button>
  );
  const hack = shown.filter((i) => i.hack);
  const rest = shown.filter((i) => !i.hack);
  const sharers = (list: string[]) => list.map((c) => names.get(c) ?? c);
  const shared = item ? [...new Set([...sharers(item.iconSharedWith), ...sharers(item.paletteSharedWith)])] : [];

  return (
    <div className="pal-editor">
      <div className="pal-list">
        <div className="pal-list-tools">
          <input className="filter" placeholder="Filter items" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className="pal-list-items">
          {hack.length > 0 && <div className="pal-group">Paper White 2's items</div>}
          {hack.map(row)}
          {rest.length > 0 && <div className="pal-group">All items</div>}
          {rest.map(row)}
        </div>
      </div>

      {item && (
        <div className="pal-main">
          <header className="pal-header">
            <h2>{item.name}</h2>
            <span className="muted">{item.constant} · item {item.id}</span>
            <span className="spacer" />
            <label className="pal-inline">Zoom
              <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
                {[2, 3, 4, 6].map((z) => <option key={z} value={z}>{z}×</option>)}
              </select>
            </label>
            <button className="primary" disabled={!result?.ok || busy || !chosen} onClick={apply}>Apply to the game's files</button>
            {chosen && <button onClick={() => { setChosen(null); setResult(null); }}>Discard icon</button>}
          </header>
          {message && <div className="pal-message">{message} <button className="link" onClick={() => setMessage(null)}>✕</button></div>}
          <div className="pal-body art-body">
            <div className="art-about">
              <p className="muted pal-hint">
                A {data.size}×{data.size} PNG: indexed, using indices 0-{data.colors - 1} with 0 transparent, or RGB(A) with at
                most {data.colors - 1} colors besides transparent pixels. Colors are rounded to the DS's (5 bits an axis).
                Apply writes the icon to <code>{item.iconPath}</code> and its colors to <code>{item.palettePath}</code>.
              </p>
              {shared.length > 0 && (
                <p className="pal-error pal-hint">
                  These files are shared: {shared.length === 1 ? "" : `${shared.length} items, `}{shared.slice(0, 8).join(", ")}
                  {shared.length > 8 ? "…" : ""} show{shared.length === 1 ? "s" : ""} them too, so Apply changes their icon as well.
                </p>
              )}
            </div>

            <section className="pal-panel art-screen">
              <div className="pal-row wrap">
                <h3>In the game now</h3>
                <a className="pal-file-button" href={api.assetUrl(item.iconPath)} download={`${item.constant.toLowerCase()}.png`}
                   title="The icon's PNG as it is in res/, to draw over">Download PNG</a>
              </div>
              <div className="pal-images item-icon-preview"><Icon preview={item.preview} size={data.size * zoom} /></div>
            </section>

            <section className="pal-panel art-screen">
              <div className="pal-row wrap">
                <h3>New icon</h3>
                <label className="pal-file-button" title={`A ${data.size}×${data.size} PNG`}>
                  {chosen ? "Choose another PNG…" : "Import PNG…"}
                  <input type="file" accept=".png" onChange={(e) => { const f = e.target.files?.[0]; if (f) choose(f); e.target.value = ""; }} />
                </label>
                {chosen && <span className="muted">{chosen.file}</span>}
              </div>
              {busy && <p className="muted pal-hint">Checking…</p>}
              {result && (
                <>
                  {result.preview && <div className="pal-images item-icon-preview"><Icon preview={result.preview} size={data.size * zoom} /></div>}
                  <p className={`pal-hint${result.ok ? "" : " pal-error"}`}>
                    {result.ok ? `It makes an icon: ${result.message}. Apply writes it; the build packs it.` : result.message}
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
