// Walking sprites on the Pokémon Editor's Follower card (docs/paperwhite2/design/battle-sprites.md section 14.7): a sheet
// imported as a PNG (and a .pal), checked in its own 16 colours and size, previewed walking in the four directions, then
// applied. It replaces the sheet a follower row shows, or, for a species whose rows show another species' sheet (Flapple
// with Budew's), makes it a walking sprite of its own: a new object code (generated/obj_codes.txt), its directory
// under res/field/actors/pokemon/ and its rows pointed at it. tools/paperwhite2/battle_sprite.py does the work through
// the server (/api/walking-sprite/check, with `write` to apply); the Battle sprite card's zip import takes the same
// sheets back from follower/ and shows them with WalkingPreview.

import { useEffect, useMemo, useState } from "react";
import { api, type BattleSpriteCheck, type WalkingItem } from "../../api.ts";
import { documents } from "../../documents.ts";
import { base64Of } from "./BattleSpriteArt.tsx";

const DIRECTIONS = ["down", "up", "left", "right"] as const;
/** A walking step's frames alternate about as fast as the field plays them. */
const STEP_MS = 280;

/** One direction's standing and stepping frames, played, at whole-pixel zoom. */
function WalkingStrip({ strip, size, label, playing }: { strip: string; size: number; label: string; playing: boolean }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    setFrame(0);
    if (!playing) return;
    const timer = setInterval(() => setFrame((f) => 1 - f), STEP_MS);
    return () => clearInterval(timer);
  }, [playing, strip]);
  const zoom = size > 32 ? 1 : 2;
  return (
    <figure className="bsp-frame">
      <div className="bsp-strip" style={{
        width: size * zoom, height: size * zoom, backgroundImage: `url(data:image/png;base64,${strip})`,
        backgroundSize: `${size * 2 * zoom}px ${size * zoom}px`, backgroundPosition: `${-frame * size * zoom}px 0`,
      }} />
      <figcaption className="muted">{label}</figcaption>
    </figure>
  );
}

/** The walking sprite sheets of an import: each facing four ways, the new one beside what the first row shows now. */
export function WalkingPreview({ items, playing }: { items: WalkingItem[]; playing: boolean }) {
  return (
    <div className="bsp-walking">
      {items.map((item) => (
        <div key={item.code} className="bsp-walking-item">
          <div className="pkm-hint" style={{ marginTop: 0 }}>
            <code>{item.code}</code>{item.new ? " (a new walking sprite)" : item.changed ? " (new)" : " (unchanged)"} · {item.frames} frames of {item.size}×{item.size}
            {item.layout !== "?" ? `, ${item.layout}${item.layout === "mirrored" ? " (right = left mirrored)" : ""}` : ""} · {item.colours} colours
            {item.rows.length ? <> · rows {item.rows.map((r, i) => <span key={r}>{i ? ", " : ""}<code>{r}</code></span>)}</> : null}
          </div>
          {item.strips ? (
            <div className="bsp-row">
              <div className="bsp-side">
                {DIRECTIONS.map((d) => <WalkingStrip key={d} strip={item.strips![d]} size={item.size} label={d} playing={playing} />)}
              </div>
              {item.current && (
                <div className="bsp-side">
                  {DIRECTIONS.map((d) => <WalkingStrip key={d} strip={item.current![d]} size={item.size} label={`${d}, now (${(item.currentCode ?? "").replace("OBJ_CODE_", "").toLowerCase()})`} playing={playing} />)}
                </div>
              )}
              {item.sheet && (
                <figure className="bsp-frame">
                  <img className="pkm-pixel" src={`data:image/png;base64,${item.sheet}`} alt={`${item.stem} sheet`} style={{ maxWidth: "none" }} />
                  <figcaption className="muted">the sheet, 2×</figcaption>
                </figure>
              )}
            </div>
          ) : <p className="muted pkm-note">No preview: the sheet's size isn't a walking sprite's.</p>}
          <div className="bsp-palette">
            {item.palette.map((c, i) => <span key={i} className="bsp-swatch" title={`${i}: ${c}`} style={{ background: i ? c : undefined }}>{i ? "" : "×"}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}

export interface WalkingRow { name: string; sprite: string | null }

/** "Import a walking sprite…" on a Follower card: the PNG (and .pal) for a sheet the rows show, or a new sheet for them.
 * With female, "Add a female sprite…": a female follower row of her own with the sheet (battle_sprite.py --female),
 * for a form whose male row shows both sexes. */
export function WalkingSpriteImport({ species, form, name, rows, onWritten, female = false }: {
  species: string; form: number; name: string; rows: WalkingRow[]; onWritten(): void; female?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<{ name: string; data: string }[]>([]);
  const [target, setTarget] = useState<string>("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [check, setCheck] = useState<BattleSpriteCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Rows that show a sheet of their own folder have no "sprite": a new walking sprite is for the others
  const pointable = useMemo(() => rows.filter((r) => r.sprite !== null), [rows]);
  const codes = useMemo(() => [...new Set(rows.map((r) => r.sprite ?? `OBJ_CODE_FOLLOWER_${r.name.toUpperCase()}`))], [rows]);
  const speciesWord = species.replace(/^SPECIES_/, "");
  // A sheet whose code names the species is probably its own; the others (Budew's for Flapple) are stand-ins
  const stand = pointable.filter((r) => !r.sprite!.includes(speciesWord));

  const start = () => {
    setOpen(true);
    setFiles([]);
    setCheck(null);
    setMessage(null);
    const useNew = stand.length > 0;
    setTarget(female ? "female" : useNew ? "new" : codes[0] ?? "");
    setPicked(new Set((useNew ? stand : pointable).map((r) => r.name)));
  };
  const close = () => { setOpen(false); setFiles([]); setCheck(null); };

  const rowList = [...picked].sort();
  const ready = files.length > 0 && !!target && (target !== "new" || rowList.length > 0);
  // What the server is asked: the female's own row, a new sheet for the picked rows, or a sheet replaced
  const request = () => target === "female" ? { species, form, files, female: true }
    : { species, form, files, sheet: target === "new" ? null : target, ...(target === "new" ? { rows: rowList } : {}) };
  useEffect(() => {
    if (!open || !ready) { setCheck(null); return; }
    let live = true;
    setBusy(true);
    api.walkingSpriteCheck(request())
      .then((c) => live && setCheck(c), (e: Error) => live && setCheck({ ok: false, check: true, message: e.message, errors: [e.message] }))
      .finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [open, ready, species, form, files, target, rowList.join(",")]);

  const choose = async (list: FileList) => {
    setMessage(null);
    setFiles(await Promise.all([...list].map(async (f) => ({ name: f.name, data: await base64Of(f) }))));
  };
  const changed = check?.changed ?? [];
  const apply = async () => {
    const unsaved = documents.dirtyPaths().filter((p) => changed.includes(p));
    if (unsaved.length) {
      alert(`Save or revert your changes first (${unsaved.join(", ")}): this writes the files on disk.`);
      return;
    }
    setBusy(true);
    try {
      const result = await api.walkingSpriteCheck({ ...request(), write: true });
      if (!result.ok) { setCheck(result); return; }
      for (const path of result.changed ?? []) if (documents.get(path)) await documents.reload(path);
      setMessage({ ok: true, text: `${result.message}: ${(result.changed ?? []).map((p) => p.replace(/^res\/field\/actors\//, "")).join(", ") || "none"}. Build to see it in the game.` });
      close();
      onWritten();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bsp-walking-import">
      {female ? (
        <div className="pkm-inline">
          <button onClick={start} disabled={!rows.length}
            title={`A walking sheet as a PNG (and .pal) for ${name}'s female: a follower row of her own`}>Add a female sprite…</button>
          <span className="muted pkm-hint" style={{ marginTop: 0 }}>The male's sprite shows both sexes; add one only where her art differs.</span>
        </div>
      ) : (
        <div className="pkm-inline">
          <button onClick={start} disabled={!rows.length}
            title={`A walking sheet as a PNG (and .pal): replaces a sheet ${name}'s rows show, or makes ${name} a walking sprite of its own`}>Import a walking sprite…</button>
          <span className="muted pkm-hint" style={{ marginTop: 0 }}>
            {stand.length ? `${name}'s rows show another species' sheet (${[...new Set(stand.map((r) => r.sprite!.replace("OBJ_CODE_POKEMON_", "")))].join(", ")}): import one of its own.`
              : "Replaces a sheet its rows show; also in the Battle sprite card's zip, follower/."}
          </span>
        </div>
      )}
      {message && <p className={`pkm-note${message.ok ? "" : " pkm-error"}`}>{message.text}</p>}
      {open && (
        <div className="bsp-import">
          <div className="pkm-card-head">
            <h4>{female ? "Female sprite" : "Walking sprite"} <span className="muted">{files.length ? files.map((f) => f.name).join(", ") : "choose a PNG"}</span></h4>
            <span className="spacer" />
            <label className="pkm-check"><input type="checkbox" checked={playing} onChange={(e) => setPlaying(e.target.checked)} /> Play</label>
            <button onClick={close}>Cancel</button>
            <button className="primary" disabled={busy || !check?.ok || !changed.length} onClick={apply}
              title={!check?.ok ? "Fix the errors first" : !changed.length ? "Nothing changes" : `Write ${changed.length} files`}>{busy ? "Working…" : "Apply"}</button>
          </div>
          <div className="pkm-rows">
            <span className="pkm-row-label">For</span>
            {female ? (
              <div className="pkm-row-control">
                <span>{name}'s female: a follower row of her own, <code>{rows[0]?.name}_female</code></span>
                <div className="muted pkm-hint">Her code goes right after the male's (the follower codes after it renumber); her row copies the male's
                  placement and gaps. The sheet is re-indexed onto the battle palette (method F, from the female battle art where there is one).</div>
              </div>
            ) : <div className="pkm-row-control">
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                {pointable.length > 0 && <option value="new">A new walking sprite for {name}</option>}
                {codes.map((c) => <option key={c} value={c}>Replace {c.replace("OBJ_CODE_", "").toLowerCase()}</option>)}
              </select>
              {target === "new" && (
                <div className="bsp-rowpick">
                  {pointable.map((r) => (
                    <label key={r.name} className="pkm-check"><input type="checkbox" checked={picked.has(r.name)}
                      onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.name); else n.delete(r.name); return n; })} /> <code>{r.name}</code></label>
                  ))}
                </div>
              )}
              <div className="muted pkm-hint">{target === "new"
                ? "Makes OBJ_CODE_POKEMON_… after the other walking Pokémon's, with its sheet; the checked rows show it (its frame layout, 6 mirrored or 8 asymmetric, is the sheet's)."
                : "Keeps the sheet's size and frame count; 16 colours, index 0 transparent."}</div>
            </div>}
            <span className="pkm-row-label">Files</span>
            <div className="pkm-row-control">
              <input type="file" multiple accept=".png,.pal" onChange={(e) => { if (e.target.files?.length) void choose(e.target.files); e.target.value = ""; }} />
              <div className="muted pkm-hint">One row of square frames, 32×32 (6 or 8 frames) or 64×64 (6): up, up step, down, down step, left, left step,
                and for 8 frames right, right step. Its own .pal (JASC, 16 colours) wins over the PNG's colours. Export art (.zip) has the current sheets in follower/.</div>
            </div>
          </div>
          {busy && !check && <p className="muted pkm-note">Checking…</p>}
          {check && (
            <>
              <p className={`pkm-note${check.ok ? "" : " pkm-error"}`}><b>{check.message}</b></p>
              {changed.length > 0 && <ul className="bsp-messages muted">{changed.map((p) => <li key={p}>{p}</li>)}</ul>}
              {check.errors.length > 0 && <ul className="bsp-messages pkm-error">{check.errors.map((m, i) => <li key={i}>{m}</li>)}</ul>}
              {(check.warnings?.length ?? 0) > 0 && <ul className="bsp-messages bsp-warning">{check.warnings!.map((m, i) => <li key={i}>⚠ {m}</li>)}</ul>}
              {(check.notes?.length ?? 0) > 0 && <ul className="bsp-messages muted">{check.notes!.map((m, i) => <li key={i}>{m}</li>)}</ul>}
              {check.walking && <WalkingPreview items={check.walking} playing={playing} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}
