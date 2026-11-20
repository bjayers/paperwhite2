// The tier colours of a sheet drawn in colour tiers (the damage numbers' digits, SpriteSheet.tierColors): the shared
// outline and each tier's colours over the sheet's palette entries from `first`, as the JSON file the sheet's entry
// names holds them ({ outline, tiers: [{ from, colors }] } at `at`, with the digits' overlap and group_space). Each
// colour is picked and rounded to the DS's 5 bits an axis; each tier previews the sheet's sample number in its colours,
// drawn from the sheet's pixels as the game places the digits (each over the one before), its shine rows playing on
// request. Save writes the file through the editor's save, which runs the build's validator.

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api.ts";
import { fileText, fromPlain, getIn, parseJson, setIn, toPlain, type JsonValue } from "../../../shared/json.ts";
import type { SpriteSheet } from "../../../shared/api.ts";
import { fromHex, snap, toHex } from "./pal.ts";

interface Tier {
  from: number;
  colors: string[];
}

interface Settings {
  outline: string;
  tiers: Tier[];
  overlap: number;
  groupSpace: number;
  shineFrameTime: number;
  shineDelay: number;
}

// The names the colours of a tier take, in the order of its entries
const ROLES = ["Dark shadow", "Light shadow", "Main", "Shine"];
const CELL_WIDTH = 16;
const CELL_HEIGHT = 32;
const ZOOM = 2;

/** A picked colour as the DS shows it, as "#rrggbb". */
const snapped = (hex: string) => toHex(snap(fromHex(hex) ?? [0, 0, 0]));

function readSettings(doc: JsonValue, at: string[]): Settings {
  const plain = (toPlain(getIn(doc, at) ?? fromPlain({})) ?? {}) as Record<string, unknown>;
  return {
    outline: String(plain.outline ?? "#000000"),
    tiers: ((plain.tiers ?? []) as Tier[]).map((t) => ({ from: Number(t.from ?? 0), colors: [...(t.colors ?? [])] })),
    overlap: Number(plain.overlap ?? 0),
    groupSpace: Number(plain.group_space ?? 0),
    shineFrameTime: Math.max(1, Number(plain.shine_frame_time ?? 2)),
    shineDelay: Number(plain.shine_delay ?? 0),
  };
}

/** The sample's width in pixels at the settings' layout. */
function sampleWidth(text: string, s: Settings): number {
  const advance = CELL_WIDTH - 2 - s.overlap;
  const groups = Math.floor((text.length - 1) / 3);
  return 4 + advance * (text.length - 1) + CELL_WIDTH + groups * s.groupSpace + 4;
}

/** One tier's sample: the digits as the game places them, each in the sheet's row for its frame of the shine. */
function TierSample({ pixels, rows, colors, text, settings, frame }: {
  pixels: string; rows: number; colors: string[]; text: string; settings: Settings; frame: number | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = sampleWidth(text, settings);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const image = ctx.createImageData(width, CELL_HEIGHT);
    const rgb = colors.map((c) => fromHex(c) ?? [0, 0, 0]);
    const sheetWidth = CELL_WIDTH * 10;
    const advance = CELL_WIDTH - 2 - settings.overlap;
    let x0 = 4;
    [...text].forEach((ch, i) => {
      if (i && (text.length - i) % 3 === 0) x0 += settings.groupSpace;
      const digit = Number(ch);
      // The game's shine: once landed, digit i shows row 1 + (time - i * delay) / frame time while that is a shine row
      let row = 0;
      if (frame !== null) {
        const time = frame - i * settings.shineDelay;
        if (time >= 0 && time < (rows - 1) * settings.shineFrameTime) row = 1 + Math.floor(time / settings.shineFrameTime);
      }
      for (let y = 0; y < CELL_HEIGHT; y++) {
        for (let x = 0; x < CELL_WIDTH; x++) {
          const index = parseInt(pixels[(row * CELL_HEIGHT + y) * sheetWidth + digit * CELL_WIDTH + x] ?? "0", 16);
          const tx = x0 + x;
          if (!index || tx >= width) continue;
          const at = (y * width + tx) * 4;
          const [r, g, b] = rgb[index] ?? [0, 0, 0];
          image.data.set([r, g, b, 255], at);
        }
      }
      x0 += advance;
    });
    ctx.putImageData(image, 0, 0);
  }, [pixels, rows, colors, text, settings, frame, width]);
  return <canvas ref={ref} className="tier-sample" width={width} height={CELL_HEIGHT} style={{ width: width * ZOOM, height: CELL_HEIGHT * ZOOM }} />;
}

export function TierColorsPanel({ sheet, pixels, colors }: { sheet: SpriteSheet; pixels: string | undefined; colors: string[] | undefined }) {
  const spec = sheet.tierColors!;
  const [saved, setSaved] = useState<Settings | null>(null);
  const [edited, setEdited] = useState<Settings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [shine, setShine] = useState(false);
  const [frame, setFrame] = useState(0);

  const load = () => {
    api.file(spec.file).then((file) => {
      const settings = readSettings(parseJson(file.text), spec.at);
      setSaved(settings);
      setEdited(null);
    }).catch((e) => setMessage((e as Error).message));
  };
  useEffect(load, [spec.file, spec.at.join("/")]);

  const settings = edited ?? saved;
  const rows = pixels ? Math.floor(pixels.length / (CELL_WIDTH * 10 * CELL_HEIGHT)) : 0;

  // The shine plays over and over while asked for: the last digit's sweep, then a pause
  useEffect(() => {
    if (!shine || !settings) return;
    const length = (spec.sample.length - 1) * settings.shineDelay + (rows - 1) * settings.shineFrameTime + 30;
    const timer = setInterval(() => setFrame((f) => (f + 1) % length), 1000 / 60);
    return () => clearInterval(timer);
  }, [shine, settings, rows, spec.sample]);

  // Each tier's 16 colours: the sheet's, with the outline and the tier's colours over theirs
  const palettes = useMemo(() => settings && colors && settings.tiers.map((tier) => {
    const palette = [...colors];
    palette[spec.outline] = settings.outline;
    tier.colors.forEach((c, i) => { palette[spec.first + i] = c; });
    return palette;
  }), [settings, colors, spec.first, spec.outline]);

  if (!settings) return <section className="pal-panel art-screen"><h3>Tier colours</h3><p className="muted pal-hint">{message ?? "Reading…"}</p></section>;

  const change = (next: Settings) => { setEdited(next); setMessage(null); };
  const setOutline = (hex: string) => change({ ...settings, outline: snapped(hex) });
  const setColor = (t: number, i: number, hex: string) =>
    change({ ...settings, tiers: settings.tiers.map((tier, k) => (k === t ? { ...tier, colors: tier.colors.map((c, j) => (j === i ? snapped(hex) : c)) } : tier)) });

  const save = async () => {
    if (!edited) return;
    const file = await api.file(spec.file);
    let doc = parseJson(file.text);
    doc = setIn(doc, [...spec.at, "outline"], edited.outline);
    edited.tiers.forEach((tier, t) => { doc = setIn(doc, [...spec.at, "tiers", t, "colors"], fromPlain(tier.colors)); });
    const result = await api.save({ path: spec.file, text: fileText(doc), baseVersion: file.version });
    if (!result.ok) return setMessage(result.reason === "conflict" ? `${spec.file} changed on disk; reload the page.` : result.message);
    setMessage(`Saved the tier colours to ${spec.file}. Build (Ctrl+B) to see them in the game.`);
    load();
  };

  const first = spec.first;
  const sample = `${spec.sample.slice(0, -3)} ${spec.sample.slice(-3)}`.trim();
  return (
    <section className="pal-panel art-screen tier-colors">
      <div className="pal-row wrap">
        <h3>Tier colours</h3>
        <span className="spacer" />
        <label className="ow-check small" title="Play the sheet's shine rows across the sample, as a critical hit does">
          <input type="checkbox" checked={shine} onChange={(e) => { setShine(e.target.checked); setFrame(0); }} /> Play the shine
        </label>
        <button className="primary" disabled={!edited} onClick={save}>Save tier colours</button>
        {edited && <button onClick={() => { setEdited(null); setMessage(null); }}>Discard</button>}
      </div>
      <p className="muted pal-hint">
        The digits' palette entry {spec.outline} (the outline) is every tier's; entries {first}-{first + ROLES.length - 1} are
        each tier's own ({ROLES.join(", ").toLowerCase()}), over the sheet's own colours, which are only a preview. Colours
        are rounded to the DS's (5 bits an axis). Saved in <code>{spec.file}</code>; the tiers' damage thresholds are on
        Entree → Buffs → Damage numbers. The samples are "{sample}" at the game's spacing.
      </p>
      {message && <p className="pal-hint">{message}</p>}
      <div className="tier-grid">
        <span className="muted small">Shared</span>
        <span className="muted small">Outline ({spec.outline})</span>
        {ROLES.map((role, i) => <span key={role} className="muted small">{role} ({first + i})</span>)}
        <span className="muted small">Preview</span>

        <span className="small">Every tier</span>
        <label className="marker-swatch" title={`${spec.outline}: ${settings.outline}`}>
          <input type="color" value={settings.outline} onChange={(e) => setOutline(e.target.value)} />
        </label>
        {ROLES.map((role) => <span key={role} />)}
        <span />

        {settings.tiers.map((tier, t) => (
          <TierRow key={t} tier={tier} t={t} first={first} outline={settings.outline} setColor={setColor}
                   preview={pixels && palettes ? (
                     <TierSample pixels={pixels} rows={rows} colors={palettes[t]} text={spec.sample} settings={settings}
                                 frame={shine ? frame : null} />
                   ) : <span className="muted small">…</span>} />
        ))}
      </div>
    </section>
  );
}

function TierRow({ tier, t, first, setColor, preview }: {
  tier: Tier; t: number; first: number; outline: string; setColor(t: number, i: number, hex: string): void; preview: React.ReactNode;
}) {
  return (
    <>
      <span className="small">From {tier.from.toLocaleString("en-US")}</span>
      <span />
      {tier.colors.map((c, i) => (
        <label key={i} className="marker-swatch" title={`${first + i} (${ROLES[i].toLowerCase()}): ${c}`}>
          <input type="color" value={c} onChange={(e) => setColor(t, i, e.target.value)} />
        </label>
      ))}
      <span className="tier-preview">{preview}</span>
    </>
  );
}
