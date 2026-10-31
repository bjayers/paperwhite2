// The game's fonts (a/0/2/3, GET /api/font): Nitro fonts (NFTR), each glyph a cell of 2-bit pixels with its width,
// found by character code through the font's maps, as gf_font.c draws them. And the font's palettes (NCLR): its
// letters are the glyph's values 1 (the letter) and 2 (its shadow) drawn in a palette's colors, as PRINT_COLOR picks.

export interface Glyph {
  /** Pixel values 0 (none) to 3, cellWidth by cellHeight. */
  pixels: Uint8Array;
  left: number;
  width: number;
  /** How far the next character starts. */
  advance: number;
}

export interface Font {
  cellWidth: number;
  cellHeight: number;
  lineFeed: number;
  glyph(code: number): Glyph;
}

function tag(view: DataView, at: number): string {
  return String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
}

export function parseFont(buffer: ArrayBuffer): Font {
  const view = new DataView(buffer);
  if (tag(view, 0) !== "RTFN") throw new Error("Not a Nitro font");
  // FINF, the font's information, right after the file header
  const finf = view.getUint16(12, true);
  const lineFeed = view.getUint8(finf + 9);
  const alter = view.getUint16(finf + 10, true);
  const defaultWidth = { left: view.getInt8(finf + 12), width: view.getUint8(finf + 13), advance: view.getUint8(finf + 14) };
  const cglp = view.getUint32(finf + 16, true) - 8;
  const cwdh = view.getUint32(finf + 20, true) - 8;
  const cmap = view.getUint32(finf + 24, true) - 8;
  // CGLP: the glyphs' cells
  const cellWidth = view.getUint8(cglp + 8);
  const cellHeight = view.getUint8(cglp + 9);
  const cellSize = view.getUint16(cglp + 10, true);
  const bpp = view.getUint8(cglp + 14);
  const cglpSize = view.getUint32(cglp + 4, true);
  const glyphCount = Math.floor((cglpSize - 16) / cellSize);
  // CWDH: the widths, in blocks of glyph indices
  const widths = new Map<number, { left: number; width: number; advance: number }>();
  for (let at = cwdh; at > 0 && at < buffer.byteLength;) {
    const first = view.getUint16(at + 8, true);
    const last = view.getUint16(at + 10, true);
    for (let i = first; i <= last; i++) {
      const o = at + 16 + (i - first) * 3;
      widths.set(i, { left: view.getInt8(o), width: view.getUint8(o + 1), advance: view.getUint8(o + 2) });
    }
    const next = view.getUint32(at + 12, true);
    at = next ? next - 8 : 0;
  }
  // CMAP: character codes to glyph indices, in blocks each of one of three kinds
  const map = new Map<number, number>();
  for (let at = cmap; at > 0 && at < buffer.byteLength;) {
    const begin = view.getUint16(at + 8, true);
    const end = view.getUint16(at + 10, true);
    const kind = view.getUint16(at + 12, true);
    const body = at + 20;
    if (kind === 0) {
      const offset = view.getUint16(body, true);
      for (let c = begin; c <= end; c++) map.set(c, offset + c - begin);
    } else if (kind === 1) {
      for (let c = begin; c <= end; c++) {
        const index = view.getUint16(body + (c - begin) * 2, true);
        if (index !== 0xffff) map.set(c, index);
      }
    } else {
      const count = view.getUint16(body, true);
      for (let i = 0; i < count; i++) map.set(view.getUint16(body + 2 + i * 4, true), view.getUint16(body + 4 + i * 4, true));
    }
    const next = view.getUint32(at + 16, true);
    at = next ? next - 8 : 0;
  }
  const cache = new Map<number, Glyph>();
  // The game's fonts keep each glyph's widths (left, width, advance) in the first 3 bytes of its cell, before its
  // pixels, where a standard font has only the pixels and the widths in CWDH
  const pixelBytes = Math.ceil((cellWidth * cellHeight * bpp) / 8);
  const widthsInCell = cellSize >= pixelBytes + 3;
  const decode = (index: number): Glyph => {
    const pixels = new Uint8Array(cellWidth * cellHeight);
    const cell = cglp + 16 + index * cellSize;
    const start = widthsInCell ? cell + 3 : cell;
    for (let p = 0; p < cellWidth * cellHeight; p++) {
      const bit = p * bpp;
      const byte = view.getUint8(start + (bit >> 3));
      pixels[p] = (byte >> (8 - bpp - (bit & 7))) & ((1 << bpp) - 1);
    }
    const w = widthsInCell
      ? { left: view.getInt8(cell), width: view.getUint8(cell + 1), advance: view.getUint8(cell + 2) }
      : widths.get(index) ?? defaultWidth;
    return { pixels, left: w.left, width: w.width, advance: w.advance };
  };
  return {
    cellWidth, cellHeight, lineFeed,
    glyph(code: number): Glyph {
      let g = cache.get(code);
      if (!g) {
        const index = map.get(code) ?? alter;
        g = decode(index < glyphCount ? index : alter);
        cache.set(code, g);
      }
      return g;
    },
  };
}

export type Rgb = [number, number, number];

/** A Nitro palette's colors (NCLR, its TTLP block), as the DS shows them in 8 bits an axis. */
export function parseNclr(buffer: ArrayBuffer): Rgb[] {
  const view = new DataView(buffer);
  const ttlp = view.getUint16(12, true);
  const size = view.getUint32(ttlp + 16, true);
  const start = ttlp + 8 + view.getUint32(ttlp + 20, true);
  const colors: Rgb[] = [];
  for (let i = 0; i < size / 2 && start + i * 2 + 1 < buffer.byteLength; i++) {
    const v = view.getUint16(start + i * 2, true);
    colors.push([(v & 31) * 255 / 31 | 0, ((v >> 5) & 31) * 255 / 31 | 0, ((v >> 10) & 31) * 255 / 31 | 0]);
  }
  return colors;
}
