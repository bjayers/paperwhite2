// Reads an indexed PNG's palette indices, as the build's packer does (tools/data/nitro_2d.py read_indexed_png), so a
// palette can be shown on the image: the pixels are the indices the game draws, and the PNG's own colors only a
// preview. Image editors write 1, 2, 4 or 8 bits a pixel; all of them read.

import type { Rgb } from "./pal.ts";

export interface IndexedImage {
  width: number;
  height: number;
  depth: number;
  /** A palette index per pixel, in rows. */
  pixels: Uint8Array;
  /** The PNG's own colors. */
  colors: Rgb[];
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export async function readIndexedPng(buffer: ArrayBuffer): Promise<IndexedImage> {
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((b, i) => data[i] !== b)) throw new Error("Not a PNG");
  let width = 0, height = 0, depth = 0;
  let colors: Rgb[] = [];
  const parts: Uint8Array[] = [];
  for (let at = 8; at + 8 <= data.length;) {
    const size = view.getUint32(at);
    const kind = String.fromCharCode(...data.subarray(at + 4, at + 8));
    const payload = data.subarray(at + 8, at + 8 + size);
    at += 12 + size;
    if (kind === "IHDR") {
      width = view.getUint32(at - size - 4);
      height = view.getUint32(at - size);
      depth = payload[8];
      if (payload[9] !== 3) throw new Error("Not an indexed PNG: save it in indexed color mode");
      if (payload[12] !== 0) throw new Error("An interlaced PNG: save it without interlacing");
    } else if (kind === "PLTE") {
      colors = [];
      for (let i = 0; i + 2 < payload.length; i += 3) colors.push([payload[i], payload[i + 1], payload[i + 2]]);
    } else if (kind === "IDAT") {
      parts.push(payload);
    } else if (kind === "IEND") {
      break;
    }
  }
  if (!width || !height) throw new Error("A PNG without its header");
  const joined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => (joined.set(p, at), at + p.length), 0);
  const raw = await inflate(joined);
  const stride = Math.ceil((width * depth) / 8);
  const bpp = Math.max(1, depth / 8);
  const pixels = new Uint8Array(width * height);
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start];
    const row = raw.slice(start + 1, start + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? row[x - bpp] : 0;
      const up = previous[x];
      const upLeft = x >= bpp ? previous[x - bpp] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 255;
      else if (filter === 2) row[x] = (row[x] + up) & 255;
      else if (filter === 3) row[x] = (row[x] + ((left + up) >> 1)) & 255;
      else if (filter === 4) row[x] = (row[x] + paeth(left, up, upLeft)) & 255;
    }
    const perByte = 8 / depth;
    const mask = (1 << depth) - 1;
    for (let x = 0; x < width; x++) {
      pixels[y * width + x] = depth === 8 ? row[x] : (row[Math.floor(x / perByte)] >> (8 - depth * (1 + (x % perByte)))) & mask;
    }
    previous = row;
  }
  return { width, height, depth, pixels, colors };
}

/** Which indices an image uses. */
export function usedIndices(image: IndexedImage): Set<number> {
  return new Set(image.pixels);
}
