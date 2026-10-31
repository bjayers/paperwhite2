// Palettes as the data tools keep them (tools/data/nitro_2d.py): JASC-PAL text, "JASC-PAL", "0100", the number of
// colors, then a line "r g b" of 8-bit axes per color. The DS shows 5 bits an axis: the build reads an axis as
// round(v * 31 / 255), and the dump writes a 5-bit one as floor(v * 255 / 31), so the editor keeps every color it
// writes on those values, and an unchanged file stays the same.

export type Rgb = [number, number, number];

export function parsePal(text: string): Rgb[] {
  const lines = text.split(/\r?\n/);
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (lines[0] !== "JASC-PAL" || lines[1] !== "0100") throw new Error("Not a JASC palette");
  const count = Number(lines[2]);
  if (!Number.isInteger(count) || count !== lines.length - 3) throw new Error("The palette's count doesn't match its colors");
  return lines.slice(3).map((line, i) => {
    const axes = line.trim().split(/\s+/).map(Number);
    if (axes.length !== 3 || axes.some((a) => !Number.isInteger(a) || a < 0 || a > 255)) throw new Error(`Color ${i} isn't three numbers from 0 to 255`);
    return axes as Rgb;
  });
}

export function writePal(colors: Rgb[]): string {
  return `JASC-PAL\n0100\n${colors.length}\n${colors.map((c) => `${c[0]} ${c[1]} ${c[2]}\n`).join("")}`;
}

/** An 8-bit axis as the DS's 5 bits, as the build reads it. */
export const to5 = (v: number) => Math.round((v * 31) / 255);
/** A 5-bit axis as the dump writes it. */
export const from5 = (v: number) => Math.floor((v * 255) / 31);
/** A color as the DS shows it, in the dump's 8-bit values. */
export const snap = (c: Rgb): Rgb => [from5(to5(c[0])), from5(to5(c[1])), from5(to5(c[2]))];

/** The DS's 15-bit value, BGR555, as the game stores it. */
export const bgr555 = (c: Rgb) => to5(c[0]) | (to5(c[1]) << 5) | (to5(c[2]) << 10);

export const toHex = (c: Rgb) => `#${c.map((a) => a.toString(16).padStart(2, "0")).join("")}`;

export function fromHex(text: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(text.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const sameColor = (a: Rgb, b: Rgb) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

// ---------------------------------------------------------------- Adjustments

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rr ? (gg - bb) / d + (gg < bb ? 6 : 0) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)) as Rgb;
}

export interface Adjustment {
  /** Degrees, -180 to 180. */
  hue: number;
  /** -100 to 100: toward gray or toward full color. */
  saturation: number;
  /** -100 to 100: toward black or toward white. */
  lightness: number;
}

export const NO_ADJUSTMENT: Adjustment = { hue: 0, saturation: 0, lightness: 0 };

export const isAdjusted = (a: Adjustment) => a.hue !== 0 || a.saturation !== 0 || a.lightness !== 0;

/** A color shifted in hue, saturation and lightness, snapped to the DS's colors. */
export function adjust(c: Rgb, a: Adjustment): Rgb {
  if (!isAdjusted(a)) return c;
  let [h, s, l] = toHsl(c);
  h = (h + a.hue + 360) % 360;
  s = a.saturation >= 0 ? s + (1 - s) * (a.saturation / 100) : s * (1 + a.saturation / 100);
  l = a.lightness >= 0 ? l + (1 - l) * (a.lightness / 100) : l * (1 + a.lightness / 100);
  return snap(fromHsl(h, s, l));
}
