// A species' party icon (res/pokemon/<species>/icon.png, its first frame) in the colors the game gives it: the bank of
// res/pokemon/shared/icon_palettes.pal that poke_icon.c's sPokeIconPalettes picks for the species (the male's, or the
// only one), as tools/data/pokemon_graphics.py reads that table. For any editor that lists Pokémon.

import { useEffect, useRef } from "react";
import { api } from "../../api.ts";
import { parsePal, type Rgb } from "../palettes/pal.ts";
import { readIndexedPng, type IndexedImage } from "../palettes/png.ts";

/** "SPECIES_MR_MIME" as its folder, "mr_mime". */
export const speciesFolder = (species: string) => species.replace(/^SPECIES_/, "").toLowerCase();

interface IconColors {
  banks: number[];
  colors: Rgb[];
  numbers: Record<string, number>;
}

let shared: Promise<IconColors> | null = null;
function iconColors(): Promise<IconColors> {
  if (!shared) {
    shared = Promise.all([
      api.scan("src/system/poke_icon.c", "."),
      api.file("res/pokemon/shared/icon_palettes.pal"),
      api.constants(),
    ]).then(([lines, pal, numbers]) => {
      const banks: number[] = [];
      let inTable = false;
      for (const { text } of lines) {
        if (text.includes("sPokeIconPalettes[] = {")) { inTable = true; continue; }
        if (inTable && text.includes("};")) break;
        if (inTable) for (const m of text.matchAll(/0x([0-9a-fA-F]+)/g)) banks.push(parseInt(m[1], 16));
      }
      return { banks, colors: parsePal(pal.text), numbers };
    });
    shared.catch(() => { shared = null; });
  }
  return shared;
}

const icons = new Map<string, Promise<IndexedImage>>();

export function SpeciesIcon({ species, size = 32 }: { species: string; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!species || species === "SPECIES_NONE") return;
    let live = true;
    const folder = speciesFolder(species);
    if (!icons.has(folder)) icons.set(folder, api.asset(`res/pokemon/${folder}/icon.png`).then(readIndexedPng));
    Promise.all([icons.get(folder)!, iconColors()]).then(([image, c]) => {
      const ctx = canvas.current?.getContext("2d");
      if (!live || !ctx) return;
      const bank = (c.banks[c.numbers[species] ?? 0] ?? 0) & 15;
      const data = ctx.createImageData(32, 32);
      for (let i = 0; i < 32 * 32; i++) {
        const v = image.pixels[i];
        const color = c.colors[bank * 16 + v];
        if (v && color) data.data.set([color[0], color[1], color[2], 255], i * 4);
      }
      ctx.putImageData(data, 0, 0);
    }).catch(() => {});
    return () => { live = false; };
  }, [species]);
  if (!species || species === "SPECIES_NONE") return <span className="species-icon empty" style={{ width: size, height: size }} />;
  return <canvas ref={canvas} width={32} height={32} className="species-icon" style={{ width: size, height: size }} />;
}
