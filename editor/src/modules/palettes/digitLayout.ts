// The damage numbers' digits' layout, as the game does it (src/paperwhite2/ov168/paperwhite2_damage_numbers.c's
// DamageNumbers_Layout, and tools/paperwhite2/damage_digits.py's glyphs and layout, which pack it): each digit's glyph
// is its opaque columns in the sheet's first row, and the digits go one after another by their glyphs' widths, each
// overlapping the one before by `overlap` pixels, with `gap` more before the thousands.

export const CELL_WIDTH = 16;
export const CELL_HEIGHT = 32;
export const DIGITS = 10;

/** A digit's glyph in its cell: its first opaque column and its opaque width. */
export interface Glyph {
  left: number;
  width: number;
}

/** Each digit's glyph in row 1 of a sheet's pixels (palette indices, a hex digit each, row by row; 0 clear). An empty
 * cell counts as the cell less its blank side columns, as the packer does. */
export function glyphMetrics(pixels: string): Glyph[] {
  const sheetWidth = CELL_WIDTH * DIGITS;
  return Array.from({ length: DIGITS }, (_, digit) => {
    const columns: number[] = [];
    for (let x = 0; x < CELL_WIDTH; x++) {
      for (let y = 0; y < CELL_HEIGHT; y++) {
        const index = pixels[y * sheetWidth + digit * CELL_WIDTH + x];
        if (index !== undefined && index !== "0") {
          columns.push(x);
          break;
        }
      }
    }
    return columns.length ? { left: columns[0], width: columns[columns.length - 1] - columns[0] + 1 } : { left: 1, width: CELL_WIDTH - 2 };
  });
}

/** Each digit's cell's left edge, from the first glyph's left, and the number's width to the last glyph's right. */
export function layoutDigits(text: string, glyphs: Glyph[], overlap: number, gap: number): { lefts: number[]; width: number } {
  const lefts: number[] = [];
  let pen = 0;
  [...text].forEach((ch, i) => {
    if (i && (text.length - i) % 3 === 0) pen += gap;
    const glyph = glyphs[Number(ch)] ?? { left: 1, width: CELL_WIDTH - 2 };
    lefts.push(pen - glyph.left);
    pen += glyph.width - overlap;
  });
  return { lefts, width: pen + overlap };
}
