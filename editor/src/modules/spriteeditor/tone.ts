// The icons' game tone, for the Sprite Editor's Game tone view: a mirror of tools/paperwhite2/icon_tone.py (which the
// build applies when res/paperwhite2/icon_tone.json says "enabled": true; docs/paperwhite2/design/shiny-icons.md
// section 17), kept equal to it by tests/icon-tone.test.ts. Per palette, in OKLCh, hue kept: the icon's lightness
// spread pulled toward vanilla's around its lightest used colour, chroma above a knee compressed, both scaled by the
// strength. Indices 0, 14 and 15 (transparency and the outline greys) never change.

import type { Rgb } from "./model.ts";

export const TONE_FILE = "res/paperwhite2/icon_tone.json";
const COLOURS = 16;
const FIXED = new Set([0, 14, 15]);

export interface ToneParams {
  enabled: boolean;
  strength: number;
  lightness_spread: number;
  min_contrast: number;
  chroma_knee: number;
  chroma_above_knee: number;
  saturation_max: number;
  dark_floor: number;
  dark_knee: number;
}

const PARAMETERS = ["strength", "lightness_spread", "min_contrast", "chroma_knee", "chroma_above_knee", "saturation_max",
  "dark_floor", "dark_knee"] as const;

/** icon_tone.json's parameters, or null when the file doesn't hold them (icon_tone.load's checks). */
export function readTone(text: string | null): ToneParams | null {
  if (!text) return null;
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    if (typeof data.enabled !== "boolean") return null;
    if (PARAMETERS.some((p) => typeof data[p] !== "number" || (data[p] as number) < 0)) return null;
    if ((["strength", "min_contrast", "chroma_above_knee", "dark_floor", "dark_knee"] as const).some((p) => (data[p] as number) > 1)) return null;
    return data as unknown as ToneParams;
  } catch {
    return null;
  }
}

const linear = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const gamma = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** An 8-bit sRGB colour's OKLCh: lightness 0-1, chroma, hue in radians. */
export function oklch(rgb: Rgb): [number, number, number] {
  const [r, g, b] = rgb.map(linear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return [lightness, Math.sqrt(a * a + bb * bb), Math.atan2(bb, a)];
}

function linearRgb(lightness: number, chroma: number, hue: number): [number, number, number] {
  const a = chroma * Math.cos(hue), b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}

const inside = (rgb: number[]) => rgb.every((c) => c >= -1e-7 && c <= 1 + 1e-7);

/** The 8-bit sRGB colour of an OKLCh one, its chroma reduced (by bisection) until it is inside sRGB. */
export function srgb(lightness: number, chroma: number, hue: number): Rgb {
  let rgb = linearRgb(lightness, chroma, hue);
  if (!inside(rgb)) {
    let low = 0, high = chroma;
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (inside(linearRgb(lightness, mid, hue))) low = mid;
      else high = mid;
    }
    rgb = linearRgb(lightness, low, hue);
  }
  return rgb.map((c) => Math.floor(gamma(Math.min(1, Math.max(0, c))) * 255 + 0.5)) as Rgb;
}

/** An icon palette's 16 colours toned (icon_tone.tone): counts are the icon's pixels at each index. */
/** The relative-saturation cap, then the soft dark floor (icon_tone.limits). */
export function limits(lightness: number, chroma: number, params: ToneParams): [number, number] {
  const cap = params.saturation_max;
  if (cap > 0 && chroma > cap * lightness) {
    lightness = Math.min(lightness + (chroma - cap * lightness), 1);
    chroma = Math.min(chroma, cap * lightness);
  }
  const low = params.dark_floor, knee = params.dark_knee;
  if (knee > low && lightness < knee) lightness = low + lightness * (knee - low) / knee;
  return [lightness, chroma];
}

export function tone(colours: Rgb[], counts: number[], params: ToneParams, strength = params.strength): Rgb[] {
  if (colours.length !== COLOURS || counts.length !== COLOURS) throw new Error(`${colours.length} colours and ${counts.length} counts, not ${COLOURS}`);
  const used = [...Array(COLOURS).keys()].filter((i) => !FIXED.has(i) && counts[i] > 0);
  if (strength <= 0 || !used.length) return colours.map((c) => [...c] as Rgb);
  const lch = colours.map((c, i) => (FIXED.has(i) ? null : oklch(c)));
  const at = (i: number) => lch[i] as [number, number, number];
  // Summed in index order, as Python's sum over the used list
  let total = 0, weighted = 0;
  for (const i of used) { total += counts[i]; weighted += at(i)[0] * counts[i]; }
  const mean = weighted / total;
  let variance = 0;
  for (const i of used) variance += (at(i)[0] - mean) ** 2 * counts[i];
  const spread = Math.sqrt(variance / total);
  const top = Math.max(...used.map((i) => at(i)[0]));
  let k = spread > 0 ? Math.min(1, Math.max(params.min_contrast, params.lightness_spread / spread)) : 1;
  k = 1 - strength * (1 - k);
  const knee = params.chroma_knee;
  return colours.map((c, i) => {
    if (FIXED.has(i)) return [...c] as Rgb;
    let [lightness, chroma, hue] = at(i);
    lightness = top - (top - lightness) * k;
    if (chroma > knee) chroma -= strength * (chroma - knee) * (1 - params.chroma_above_knee);
    [lightness, chroma] = limits(lightness, chroma, params);
    return srgb(lightness, chroma, hue);
  });
}

/** An icon's drawing colours (spriteColours: null for transparency and indices past its slots) in the game tone, the
 * nulls kept; the counts are its pixels'. */
export function tonedColours(colours: (Rgb | null)[], pixels: Uint8Array, params: ToneParams): (Rgb | null)[] {
  const toned = tone(colours.map((c) => c ?? [0, 0, 0]), pixelCounts(pixels), params);
  return colours.map((c, i) => (c ? toned[i] : null));
}

/** The pixels at each of an icon's 16 indices. */
export function pixelCounts(pixels: Uint8Array): number[] {
  const counts = new Array<number>(COLOURS).fill(0);
  for (const p of pixels) if (p < COLOURS) counts[p]++;
  return counts;
}
