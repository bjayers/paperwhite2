// The C-Gear's background pictures (res/paperwhite2/cgear_pictures/): what downloaded C-Gear skins were, shown over the
// rings, which the C-Gear's help button cycles in this order after none. A PNG of any colors (256 by 192, transparent
// where the C-Gear should show through) or a .cgb skin is converted by the build's own tool
// (tools/paperwhite2/cgear_pictures.py), which keeps 15 colors and 255 distinct tiles.

import { useCallback, useEffect, useRef, useState } from "react";
import { api, isNotFound } from "../../api.ts";

const DIR = "res/paperwhite2/cgear_pictures";

function nameFor(file: string): string {
  return file.replace(/\.[^.]*$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "picture";
}

function base64(buffer: ArrayBuffer): string {
  let text = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

export function CGearPictures() {
  const [pictures, setPictures] = useState<string[] | null>(null);
  const [stamp, setStamp] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api.file(`${DIR}/pictures.json`).then(
      (f) => setPictures((JSON.parse(f.text) as { pictures: string[] }).pictures),
      (e) => setPictures(isNotFound(e) ? [] : []),
    );
  }, []);
  useEffect(load, [load]);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      setMessage({ text: await action(), error: false });
      load();
      setStamp((s) => s + 1);
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  const importFile = () => file && run(async () => {
    const result = await api.cgearPictureImport(name, file.name, base64(await file.arrayBuffer()));
    setFile(null);
    setName("");
    if (input.current) input.current.value = "";
    return result.message;
  });

  const move = (index: number, by: number) => pictures && run(async () => {
    const next = [...pictures];
    [next[index], next[index + by]] = [next[index + by]!, next[index]!];
    await api.cgearPictureOrder(next);
    return "Order saved";
  });

  const remove = (picture: string) => {
    if (!confirm(`Remove the picture ${picture}?`)) return;
    run(async () => {
      await api.cgearPictureRemove(picture);
      return `Removed ${picture}`;
    });
  };

  const taken = pictures?.includes(name) ?? false;
  return (
    <div className="cg-page">
      <div className="cg-head"><strong>C-Gear Pictures</strong>
        <span className="muted small">The pictures shown over the C-Gear's rings. Its help button cycles them in this order, after none</span></div>

      <section className="cg-section">
        <h3>Import</h3>
        <div className="cg-import">
          <label className="cg-label">File</label>
          <input ref={input} type="file" accept=".png,.cgb" onChange={(e) => {
            const chosen = e.target.files?.[0] ?? null;
            setFile(chosen);
            if (chosen) setName(nameFor(chosen.name));
          }} />
          <label className="cg-label">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="keldeo_resolute" />
          <span />
          <div>
            <button disabled={!file || !/^[a-z0-9_]+$/.test(name) || busy} onClick={importFile}>{taken ? "Replace" : "Import"}</button>
            {taken && <span className="muted small"> replaces the picture of that name</span>}
          </div>
        </div>
        <p className="muted small">A PNG 256 by 192, transparent where the C-Gear should show through, or a .cgb skin. The DS
          shows one 16-color palette (15 colors and transparent) and 255 distinct tiles (a tile and its flips count once):
          a PNG with more is reduced to fit, which can lose detail, and what's saved is what the game shows.</p>
        {message && <p className={message.error ? "cg-error" : "muted"}>{message.text}</p>}
      </section>

      <section className="cg-section">
        <h3>Pictures {pictures && <span className="muted small">{pictures.length}</span>}</h3>
        {pictures === null ? <p className="muted">Loading…</p> : pictures.length === 0 ? <p className="muted">None yet</p> : (
          <div className="cg-grid">
            {pictures.map((picture, i) => (
              <div className="cg-card" key={picture}>
                <div className="cg-title"><span className="muted">{i + 1}</span> <strong>{picture}</strong></div>
                <img className="cg-image" src={`${api.assetUrl(`${DIR}/${picture}.png`)}&v=${stamp}`} alt={picture} width={256} height={192} />
                <div className="cg-actions">
                  <button disabled={busy || i === 0} onClick={() => move(i, -1)} title="Earlier">↑</button>
                  <button disabled={busy || i === pictures.length - 1} onClick={() => move(i, 1)} title="Later">↓</button>
                  <span className="spacer" />
                  <button className="link" disabled={busy} onClick={() => remove(picture)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
