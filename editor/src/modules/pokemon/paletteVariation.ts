// Palette variation (docs/paperwhite2/design/palette-variation.md): every Pokémon's colours turned a little by its
// PID's second byte. This is tools/paperwhite2/palette_variation.py's reference transform, step for step in 32-bit
// integers, which the game's C (src/paperwhite2/main/paperwhite2_palette_variation.c) follows too; the shared vectors
// (tools/paperwhite2/palette_variation_vectors.json) keep them in agreement (tests/palette-variation.test.ts). Every
// product stays below 2^31, so a JavaScript number holds it exactly and >> floors as the ARM's arithmetic shift does.

import { from5, to5, type Rgb } from "../palettes/pal.ts";

export const VARIATION_PATH = "res/paperwhite2/palette_variation.json";

export interface VariationSettings {
  enabled: boolean;
  hue_degrees: number;
  brightness_percent: number;
  saturation_percent: number;
}

/** A 5-bit colour, [r, g, b] from 0 to 31. */
export type Rgb5 = [number, number, number];

const ONE = 4096;
const clamp = (v: number) => (v < 0 ? 0 : v > 31 ? 31 : v);

type Coefficients = [diagonal: number, before: number, after: number, saturation: number, brightness: number];

/** The hue rotation's coefficients and the saturation's and brightness's amounts, in 1.12. */
export function coefficients(key: number, cfg: VariationSettings, strength: number): Coefficients {
  const hueStep = 2 * (key & 15) - 15;
  const brightnessStep = 2 * ((key >> 4) & 3) - 3;
  const saturationStep = 2 * (key >> 6) - 3;
  const theta = (hueStep * cfg.hue_degrees * strength * 3123) >> 16;
  const theta2 = (theta * theta) >> 12;
  const theta3 = (theta2 * theta) >> 12;
  const theta4 = (theta2 * theta2) >> 12;
  const sin = theta - ((theta3 * 683) >> 12);
  const cos = ONE - (theta2 >> 1) + ((theta4 * 171) >> 12);
  const third = Math.floor((ONE - cos) / 3);
  const skew = (sin * 2365) >> 12;
  const saturation = (saturationStep * cfg.saturation_percent * strength * 4474) >> 15;
  const brightness = (brightnessStep * cfg.brightness_percent * strength * 4474) >> 15;
  return [ONE - 2 * third, third - skew, third + skew, saturation, brightness];
}

export function varyColor([r, g, b]: Rgb5, [diagonal, before, after, saturation, brightness]: Coefficients): Rgb5 {
  const top = Math.max(r, g, b);
  const weight = top > 0 ? Math.floor(((top - Math.min(r, g, b)) * ONE) / top) : 0;
  const r1 = clamp((diagonal * r + before * g + after * b + 2048) >> 12);
  const g1 = clamp((after * r + diagonal * g + before * b + 2048) >> 12);
  const b1 = clamp((before * r + after * g + diagonal * b + 2048) >> 12);
  const total = r1 + g1 + b1;
  const saturate = (c: number) => clamp((c * ONE + (((3 * c - total) * saturation * 1365) >> 12) + 2048) >> 12);
  const scale = ONE + ((brightness * weight) >> 12);
  return [saturate(r1), saturate(g1), saturate(b1)].map((c) => clamp((c * scale + 2048) >> 12)) as Rgb5;
}

/** A palette of 5-bit colours varied by the PID's second byte; index 0 kept. */
export function varyPalette(colors: Rgb5[], key: number, cfg: VariationSettings, strength: number): Rgb5[] {
  if (!cfg.enabled || strength <= 0) return colors.slice();
  const co = coefficients(key, cfg, strength);
  return colors.map((c, i) => (i === 0 ? c : varyColor(c, co)));
}

/** A .pal's 8-bit colours varied as the game shows them: each colour the game rounds to 5 bits; one that the
 * variation changes is shown from its new 5-bit value, one it leaves keeps the file's colour. */
export function varyRgb(colors: Rgb[], key: number, cfg: VariationSettings, strength: number): Rgb[] {
  const five = colors.map((c) => c.map(to5) as Rgb5);
  const out = varyPalette(five, key, cfg, strength);
  return colors.map((c, i) => (out[i].every((v, k) => v === five[i][k]) ? c : (out[i].map(from5) as Rgb)));
}

export const bgr555 = ([r, g, b]: Rgb5) => r | (g << 5) | (b << 10);
export const fromBgr555 = (v: number): Rgb5 => [v & 31, (v >> 5) & 31, (v >> 10) & 31];

/** The variation's byte of a PID: bits 8-15. */
export const keyOf = (personality: number) => (personality >>> 8) & 0xff;

/** A species' strength in the file's "species" list, 100 when it isn't listed. */
export function strengthOf(species: { species: string; strength: number }[] | undefined, constant: string): number {
  return species?.find((s) => s.species === constant)?.strength ?? 100;
}
