// A species' or form's battle sprite art in the Pokémon Editor (docs/paperwhite2/design/battle-sprites.md section 14):
// the animated sprite as MCSS assembles it from its sheets and rig, Export (a zip of the sheets, stills, palettes,
// shiny copies and guides to edit), and Import (edited files checked, previewed on the sprite's own rig, normal and
// shiny, front and back, then applied). The rig itself (cells, parts, poses, animations) is kept here; Edit rig… opens the
// Rig Editor (src/modules/rig/) on it. tools/paperwhite2/battle_sprite.py does the work through the server (/api/battle-sprite/*), and
// writes res/ itself, so this refuses while the group's files have unsaved edits and reads them again after.

import { useEffect, useRef, useState } from "react";
import { api, type BattleSpriteCheck, type BattleSpriteSide } from "../../api.ts";
import { documents } from "../../documents.ts";
import { navigate } from "../../navigation.ts";

const SIDES = ["front", "back"] as const;
/** The preview's frames are a game frame's 1/60 s times the strip's step. */
const FRAME_MS = 1000 / 60;

async function base64Of(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** A strip of frames played as an animation, at the game's speed, zoomed with whole pixels. */
export function SpriteStrip({ side, strip, zoom = 2, playing = true, label }: {
  side: BattleSpriteSide; strip: string; zoom?: number; playing?: boolean; label?: string;
}) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    setFrame(0);
    if (!playing || side.frames < 2) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % side.frames), FRAME_MS * side.step);
    return () => clearInterval(timer);
  }, [playing, side.frames, side.step, strip]);
  return (
    <figure className="bsp-frame">
      <div className="bsp-strip" style={{
        width: side.width * zoom, height: side.height * zoom,
        backgroundImage: `url(data:image/png;base64,${strip})`,
        backgroundSize: `${side.width * side.frames * zoom}px ${side.height * zoom}px`,
        backgroundPosition: `${-frame * side.width * zoom}px 0`,
      }} />
      {label && <figcaption className="muted">{label}</figcaption>}
    </figure>
  );
}

function Still({ src, label }: { src: string; label: string }) {
  return (
    <figure className="bsp-frame">
      <img className="pkm-pixel bsp-still" src={`data:image/png;base64,${src}`} alt={label} />
      <figcaption className="muted">{label}</figcaption>
    </figure>
  );
}

/** The sides' animations in one row: each sheet (male, female) normal or shiny, with the current art's first frame. */
function Animations({ check, shiny, playing, compare }: { check: BattleSpriteCheck; shiny: boolean; playing: boolean; compare: boolean }) {
  const sides = check.preview?.sides ?? {};
  return (
    <div className="bsp-animations">
      {SIDES.map((side) => sides[side] && Object.entries(sides[side].sheets).map(([sheet, s]) => (
        <div key={sheet} className="bsp-side">
          <SpriteStrip side={sides[side]} strip={shiny ? s.shiny : s.normal} playing={playing}
            label={`${sheet.replace("_", " ")}${shiny ? ", shiny" : ""}`} />
          {compare && (
            <figure className="bsp-frame">
              <img className="pkm-pixel" src={`data:image/png;base64,${s.current}`} alt="Now"
                style={{ width: sides[side].width * 2, height: sides[side].height * 2, maxWidth: "none" }} />
              <figcaption className="muted">now (first frame)</figcaption>
            </figure>
          )}
        </div>
      )))}
    </div>
  );
}

/** The group's files the tool may write, none of which may be unsaved. */
const groupFiles = (folder: string) => (path: string) => path.startsWith(`res/pokemon/${folder}/`) && !path.slice(`res/pokemon/${folder}/`.length).includes("/");

export function BattleSpriteArt({ species, form, folder, speciesName, onWritten }: {
  species: string; form: number;
  /** The art's folder under res/pokemon (pichu, pichu/form_1). */
  folder: string; speciesName: string; onWritten(): void;
}) {
  const [current, setCurrent] = useState<BattleSpriteCheck | null>(null);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [shiny, setShiny] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [files, setFiles] = useState<{ name: string; data: string }[] | null>(null);
  const [stills, setStills] = useState(false);
  const [check, setCheck] = useState<BattleSpriteCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    setCurrent(null);
    setCurrentError(null);
    api.battleSpriteCheck({ species, form, files: [] })
      .then((c) => live && (c.ok ? setCurrent(c) : setCurrentError(c.message)), (e: Error) => live && setCurrentError(e.message));
    return () => { live = false; };
  }, [species, form, epoch]);

  const pending = files !== null;
  useEffect(() => {
    if (!pending) return;
    let live = true;
    setCheck(null);
    setBusy(true);
    api.battleSpriteCheck({ species, form, files: files ?? [], stillsFromSheets: stills })
      .then((c) => live && setCheck(c), (e: Error) => live && setCheck({ ok: false, check: true, message: e.message, errors: [e.message] }))
      .finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [files, stills, pending, species, form]);

  const choose = async (list: FileList) => {
    setMessage(null);
    setFiles(await Promise.all([...list].map(async (f) => ({ name: f.name, data: await base64Of(f) }))));
  };
  const cancel = () => { setFiles(null); setCheck(null); setStills(false); };
  const apply = async () => {
    const unsaved = documents.dirtyPaths().filter(groupFiles(folder));
    if (unsaved.length) {
      alert(`Save or revert your changes first (${unsaved.join(", ")}): this writes the files on disk.`);
      return;
    }
    setBusy(true);
    try {
      const result = await api.battleSpriteCheck({ species, form, files: files ?? [], stillsFromSheets: stills, write: true });
      if (!result.ok) {
        setCheck(result);
        return;
      }
      for (const path of result.changed ?? []) if (documents.get(path)) await documents.reload(path);
      setMessage(`${result.message}: ${(result.changed ?? []).map((p) => p.split("/").pop()).join(", ") || "none"}. Build to see it in the game.`);
      cancel();
      setEpoch((n) => n + 1);
      onWritten();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const changed = check?.changed ?? [];
  return (
    <section className="pkm-card bsp">
      <div className="pkm-card-head">
        <h3>Battle sprite <span className="muted">{folder}/ · its art; the rig stays</span></h3>
        <span className="spacer" />
        <button onClick={() => navigate("rig", { folder, side: "front" })}
          title="The Rig Editor: the pictures' rectangles on the sheet, the parts' pivots and layers, and their keys, front and back">Edit rig…</button>
        <a className="bsp-link" href={api.battleSpriteExportUrl(species, form)} download
          title="A zip of the sheets, stills, palettes, shiny copies, guides to the pieces, and a README with the rules">Export art (.zip)</a>
        <button className="primary" onClick={() => input.current?.click()} disabled={busy}
          title="Edited PNGs or .pal files, or the exported zip: any of them">Import art…</button>
        <input ref={input} type="file" multiple accept=".png,.pal,.zip" hidden
          onChange={(e) => { if (e.target.files?.length) void choose(e.target.files); e.target.value = ""; }} />
      </div>
      <div className="pkm-rows">
        <span className="pkm-row-label">Now</span>
        <div className="pkm-row-control">
          {current ? <Animations check={current} shiny={shiny} playing={playing} compare={false} />
            : <p className="muted pkm-note">{currentError ?? "Assembling the sprite…"}</p>}
          <div className="bsp-controls">
            <label className="pkm-check"><input type="checkbox" checked={shiny} onChange={(e) => setShiny(e.target.checked)} /> Shiny</label>
            <label className="pkm-check"><input type="checkbox" checked={playing} onChange={(e) => setPlaying(e.target.checked)} /> Play</label>
          </div>
          <div className="muted pkm-hint">As the battle draws it: the parts cut from each 256×128 sheet and moved by the rig (its "stay" animation).</div>
        </div>
        <span className="pkm-row-label">Edit</span>
        <div className="pkm-row-control">
          <div className="muted pkm-hint" style={{ marginTop: 0 }}>Export, edit the PNGs in Aseprite, LibreSprite or GIMP (16 colours, index 0 transparent, each
            piece inside its rectangle on the guide), then Import any of them: a sheet, the stills, the shiny palette (shiny.pal or a *_shiny.png
            recoloured). The README in the zip has the rules.</div>
        </div>
        <span className="pkm-row-label">Stills</span>
        <div className="pkm-row-control">
          <button disabled={busy} onClick={() => { setStills(true); if (!pending) setFiles([]); }}>Make stills from the sheets</button>
          <div className="muted pkm-hint">The 96×96 front_single and back_single.png the boxes and other 2D screens show, drawn as the sprite's first
            frame. Half the originals are exactly that; the rest have a few pixels touched up, which this replaces.</div>
        </div>
      </div>
      {message && <p className={`pkm-note${message.startsWith("Wrote") ? "" : " pkm-error"}`}>{message}</p>}
      {pending && (
        <div className="bsp-import">
          <div className="pkm-card-head">
            <h4>Import <span className="muted">{files?.length ? files.map((f) => f.name).join(", ") : "no files"}</span></h4>
            <span className="spacer" />
            <label className="pkm-check"><input type="checkbox" checked={stills} onChange={(e) => setStills(e.target.checked)} /> Make stills from the sheets</label>
            <button onClick={cancel}>Cancel</button>
            <button className="primary" disabled={busy || !check?.ok || !changed.length} onClick={apply}
              title={!check?.ok ? "Fix the errors first" : !changed.length ? "Nothing changes" : `Write ${changed.length} files`}>{busy ? "Working…" : "Apply"}</button>
          </div>
          {!check ? <p className="muted pkm-note">Checking…</p> : (
            <>
              <p className={`pkm-note${check.ok ? "" : " pkm-error"}`}><b>{check.message}</b>{changed.length ? `: ${changed.map((p) => p.split("/").pop()).join(", ")}` : ""}</p>
              {check.errors.length > 0 && <ul className="bsp-messages pkm-error">{check.errors.map((m, i) => <li key={i}>{m}</li>)}</ul>}
              {(check.warnings?.length ?? 0) > 0 && <ul className="bsp-messages bsp-warning">{check.warnings!.map((m, i) => <li key={i}>⚠ {m}</li>)}</ul>}
              {(check.notes?.length ?? 0) > 0 && <ul className="bsp-messages muted">{check.notes!.map((m, i) => <li key={i}>{m}</li>)}</ul>}
              {check.preview && (
                <div className="pkm-rows">
                  <span className="pkm-row-label">Animated</span>
                  <div className="pkm-row-control">
                    <div className="bsp-pair">
                      <Animations check={check} shiny={false} playing={playing} compare />
                      <Animations check={check} shiny playing={playing} compare={false} />
                    </div>
                    <div className="muted pkm-hint">The new art on {speciesName}'s rig, normal and shiny, beside the first frame now.</div>
                  </div>
                  <span className="pkm-row-label">Stills</span>
                  <div className="pkm-row-control bsp-row">
                    {Object.entries(check.preview.stills).map(([name, s]) => (
                      <div key={name} className="bsp-side">
                        <Still src={s.normal} label={`${name.replace(/_/g, " ")}${s.changed ? " (new)" : ""}`} />
                        <Still src={s.shiny} label="shiny" />
                      </div>
                    ))}
                  </div>
                  <span className="pkm-row-label">Sheets</span>
                  <div className="pkm-row-control bsp-row">
                    {Object.entries(check.preview.sheets).map(([name, s]) => (
                      <figure key={name} className="bsp-frame">
                        <img className="pkm-pixel bsp-sheet" src={`data:image/png;base64,${s.image}`} alt={name} />
                        <figcaption className="muted">{name.replace("_", " ")}.png{s.changed ? " (new)" : ""}: each piece's rectangle, changed pixels outside them in red</figcaption>
                      </figure>
                    ))}
                  </div>
                  <span className="pkm-row-label">Palette</span>
                  <div className="pkm-row-control">
                    {(["normal", "shiny"] as const).map((kind) => (
                      <div key={kind} className="bsp-palette">
                        <span className="muted">{kind}</span>
                        {check.preview!.palettes[kind].map((c, i) => <span key={i} className="bsp-swatch" title={`${i}: ${c}`} style={{ background: i ? c : undefined }}>{i ? "" : "×"}</span>)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
