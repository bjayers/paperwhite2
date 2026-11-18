// The Pokémon Editor's Palette variation card (docs/paperwhite2/design/palette-variation.md): this species' strength,
// kept in res/paperwhite2/palette_variation.json's "species" list (absent is 100%), the settings that every Pokémon
// shares, and a preview of the front sprite in 16 variants, normal and shiny, drawn with the game's own transform
// (paletteVariation.ts). Edits go through the document store, so saving, undo and the build's check are the shell's.

import { useEffect, useState } from "react";
import { api } from "../../api.ts";
import { documents } from "../../documents.ts";
import { fromPlain, toPlain } from "../../../shared/json.ts";
import type { Constants } from "../../../shared/schema.ts";
import { PalettePreview } from "../palettes/PaletteEditor.tsx";
import { parsePal, type Rgb } from "../palettes/pal.ts";
import { readIndexedPng, type IndexedImage } from "../palettes/png.ts";
import { DocForm, useHeld } from "../followers/DocForm.tsx";
/** A labeled row of the card, as FormPage.tsx's Row (not imported: FormPage imports this card). */
function Row({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <span className="pkm-row-label">{label}</span>
      <div className="pkm-row-control">{children}{hint && <div className="muted pkm-hint">{hint}</div>}</div>
    </>
  );
}
import { strengthOf, varyRgb, VARIATION_PATH, type VariationSettings } from "./paletteVariation.ts";

/** The preview's PID second bytes: 0x00, 0x11 … 0xff, so every hue step and every brightness and saturation step. */
const KEYS = Array.from({ length: 16 }, (_, i) => i * 0x11);
const hex = (k: number) => `0x${k.toString(16).padStart(2, "0")}`;
/** The settings every Pokémon shares, as the card labels them. */
const SETTING_LABELS: Record<string, string> = {
  enabled: "On", hue_degrees: "Hue range (°)", brightness_percent: "Brightness range (%)", saturation_percent: "Saturation range (%)",
};

interface Entry { species: string; strength: number }

/** The sprite and palettes of a battle group: a species' folder, or a form's ("arceus/form_10", palette only). */
function useGroupArt(folder: string, paletteFolder: string) {
  const [art, setArt] = useState<{ image: IndexedImage; normal: Rgb[]; shiny: Rgb[] } | null>(null);
  useEffect(() => {
    let live = true;
    setArt(null);
    Promise.all([api.asset(`res/pokemon/${folder}/front_single.png`).then(readIndexedPng),
      api.file(`res/pokemon/${paletteFolder}/normal.pal`), api.file(`res/pokemon/${paletteFolder}/shiny.pal`)])
      .then(([image, n, s]) => live && setArt({ image, normal: parsePal(n.text), shiny: parsePal(s.text) }))
      .catch(() => live && setArt(null));
    return () => { live = false; };
  }, [folder, paletteFolder]);
  return art;
}

export function PaletteVariationCard({ species, name, folder, paletteFolder = folder, constants }: {
  /** The species' constant: forms take their species' strength. */
  species: string; name: string; folder: string; paletteFolder?: string; constants: Constants;
}) {
  const { data, error } = useHeld(VARIATION_PATH);
  const art = useGroupArt(folder, paletteFolder);
  const [shiny, setShiny] = useState(false);
  if (error) return <section className="pkm-card"><h3>Palette variation</h3><p className="pkm-error">{error}</p></section>;
  if (!(data instanceof Map)) return null;
  const settings = Object.fromEntries(["enabled", "hue_degrees", "brightness_percent", "saturation_percent"]
    .map((k) => [k, toPlain(data.get(k) ?? null)])) as unknown as VariationSettings;
  const list = (toPlain(data.get("species") ?? []) as Entry[]) ?? [];
  const strength = strengthOf(list, species);
  const listed = list.some((e) => e.species === species);
  const setStrength = (value: number | null) => {
    const rest = list.filter((e) => e.species !== species);
    const next = value === null || value === 100 ? rest : [...list.map((e) => e.species === species ? { species, strength: value } : e),
      ...(listed ? [] : [{ species, strength: value }])];
    documents.edit(VARIATION_PATH, ["species"], fromPlain(next));
  };
  const field = (key: string) => (
    <div key={key} className="pkm-field">
      <span className="muted">{SETTING_LABELS[key]}</span>
      <DocForm path={VARIATION_PATH} at={[key]} constants={constants} hideDescription />
    </div>
  );
  return (
    <section className="pkm-card">
      <div className="pkm-card-head"><h3>Palette variation</h3><span className="spacer" />
        <span className="muted pkm-note">{VARIATION_PATH}</span></div>
      <div className="pkm-rows">
        <Row label={`${name}'s strength`} hint={`The share of every range this species' Pokémon take; 0 keeps the file's colours (Kecleon, Unown). Its forms take the species'.${listed ? "" : " Not listed: 100%."}`}>
          <span className="pkv-strength">
            <input type="range" min={0} max={100} step={5} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
            <input type="number" min={0} max={100} value={strength} onChange={(e) => {
              const v = Math.round(Number(e.target.value));
              if (Number.isFinite(v)) setStrength(Math.max(0, Math.min(100, v)));
            }} /> %
            <button disabled={!listed} onClick={() => setStrength(null)} title="Remove it from the list: full strength">Default</button>
          </span>
        </Row>
        <Row label="Preview" hint={`By each Pokémon's PID second byte (shown under it): the low digit turns the hue, the high one moves brightness and saturation. Greys, white and black stay.${!settings.enabled ? " Variation is off for every Pokémon." : ""}`}>
          {art ? (
            <div className="pkv-preview">
              <label className="pkm-check"><input type="checkbox" checked={shiny} onChange={(e) => setShiny(e.target.checked)} /> Shiny</label>
              <div className="pkv-strip">
                <figure className="pkv-variant">
                  <PalettePreview image={art.image} colors={shiny ? art.shiny : art.normal} offset={0} zoom={1} transparent highlight={null} />
                  <figcaption className="muted">file</figcaption>
                </figure>
                {KEYS.map((key) => (
                  <figure key={key} className="pkv-variant">
                    <PalettePreview image={art.image} colors={varyRgb(shiny ? art.shiny : art.normal, key, settings, strength)}
                      offset={0} zoom={1} transparent highlight={null} />
                    <figcaption className="muted">{hex(key)}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ) : <span className="muted">No front sprite.</span>}
        </Row>
        <Row label="Every Pokémon" hint="Shared by all species; the game reads them at build time.">
          <div className="pkv-settings">{Object.keys(SETTING_LABELS).map(field)}</div>
        </Row>
      </div>
    </section>
  );
}

