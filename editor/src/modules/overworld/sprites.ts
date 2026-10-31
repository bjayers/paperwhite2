// A field actor's sprite as the map and the model picker show it: one frame of its sheet (sprite.png in its sprite.pal,
// tools/data/field_actor_data.py), the frame it shows facing a direction. A sheet's frames are square, side by side,
// in groups by direction: up, down, then left, the right frames being the left ones mirrored (several sheets repeat
// the left frames there, as the game flips them). People's sheets have three frames a direction (twelve and more in
// all), the walking Pokémon's and most others two (six or eight); a sheet of fewer frames, a tree or a prop, faces one
// way.

import { api } from "../../api.ts";
import { parsePal } from "../palettes/pal.ts";
import { readIndexedPng } from "../palettes/png.ts";
import { actorFolder } from "./entities.ts";

interface Sheet {
  pixels: Uint8Array;
  width: number;
  height: number;
  colors: number[][];
}

const sheets = new Map<string, Promise<Sheet | null>>();
const frames = new Map<string, Promise<HTMLCanvasElement | null>>();

/** A model's sheet: its own, or the one its data.json's "sprite" names. Null for a model without a sprite. */
function sheetOf(model: string): Promise<Sheet | null> {
  if (!sheets.has(model)) {
    const folder = actorFolder(model);
    sheets.set(model, (async () => {
      try {
        const data = JSON.parse((await api.file(`${folder}/data.json`)).text) as { type?: string; sprite?: string };
        if (data.type !== "sprite") return null;
        const from = data.sprite ? actorFolder(data.sprite) : folder;
        const [image, pal] = await Promise.all([api.asset(`${from}/sprite.png`).then(readIndexedPng), api.file(`${from}/sprite.pal`)]);
        return { pixels: image.pixels, width: image.width, height: image.height, colors: parsePal(pal.text) };
      } catch {
        return null;
      }
    })());
  }
  return sheets.get(model)!;
}

/** The frame of a sheet that faces a direction, and whether it is mirrored. */
function frameFor(count: number, direction: string | undefined): { frame: number; mirror: boolean } {
  const group = count >= 12 ? 3 : count >= 6 ? 2 : 0;
  if (!group) return { frame: 0, mirror: false };
  switch (direction) {
    case "DIR_UP": return { frame: 0, mirror: false };
    case "DIR_LEFT": return { frame: 2 * group, mirror: false };
    case "DIR_RIGHT": return { frame: 2 * group, mirror: true };
    default: return { frame: group, mirror: false };
  }
}

/** A model's frame facing a direction, drawn in its colors, or null for a model without a sprite. */
export function spriteFrame(model: string, direction?: string): Promise<HTMLCanvasElement | null> {
  const key = `${model}:${direction ?? "DIR_DOWN"}`;
  if (!frames.has(key)) {
    frames.set(key, sheetOf(model).then((sheet) => {
      if (!sheet) return null;
      const size = Math.min(sheet.height, sheet.width);
      const { frame, mirror } = frameFor(Math.floor(sheet.width / size), direction);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const v = sheet.pixels[y * sheet.width + frame * size + x];
        if (!v) continue;
        const c = sheet.colors[v] ?? [255, 0, 255];
        img.data.set([c[0], c[1], c[2], 255], (y * size + (mirror ? size - 1 - x : x)) * 4);
      }
      ctx.putImageData(img, 0, 0);
      return canvas;
    }));
  }
  return frames.get(key)!;
}

/** A frame as an image URL, for the model picker. */
const urls = new Map<string, Promise<string | null>>();
export function spriteUrl(model: string, direction?: string): Promise<string | null> {
  const key = `${model}:${direction ?? "DIR_DOWN"}`;
  if (!urls.has(key)) urls.set(key, spriteFrame(model, direction).then((c) => c?.toDataURL() ?? null));
  return urls.get(key)!;
}
