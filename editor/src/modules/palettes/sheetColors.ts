// A field actor sheet's colours as the build writes them (tools/data/field_actor_data.py,
// tools/paperwhite2/overworld_palettes.py, docs/paperwhite2/design/follower-palette-remap.md): a Pokémon sheet's pixels
// are indices of its battle group's palette, so its colours are res/pokemon/<group>/normal.pal ("palette": {"pokemon"}
// in its data.json); a follower row that shows another group's sheet plays it through its "map"; an opted-out sheet,
// and any other actor's, has its own sprite.pal.

import { api } from "../../api.ts";
import { parsePal, type Rgb } from "./pal.ts";

/** A data.json's "palette" object. */
export interface SheetPalette {
  pokemon?: string;
  map?: number[];
  opt_out?: string;
}

/** The "palette" of a data.json's parsed contents, when it has one. */
export function paletteOf(data: unknown): SheetPalette | null {
  const palette = (data as { palette?: unknown } | null)?.palette;
  return palette && typeof palette === "object" ? (palette as SheetPalette) : null;
}

async function battleNormal(group: string): Promise<Rgb[]> {
  return parsePal((await api.file(`res/pokemon/${group}/normal.pal`)).text);
}

/** The colours of the sheet in folder (whose data.json is read), as row shows it: row is the "palette" of the code
 * that shows the sheet, when that is another code (its "map" applies). */
export async function sheetColors(folder: string, row?: SheetPalette | null): Promise<Rgb[]> {
  if (row?.pokemon && row.map) {
    const normal = await battleNormal(row.pokemon);
    return row.map.map((i) => normal[i] ?? [0, 0, 0]);
  }
  const own = paletteOf(JSON.parse((await api.file(`${folder}/data.json`)).text));
  if (own?.pokemon) return battleNormal(own.pokemon);
  return parsePal((await api.file(`${folder}/sprite.pal`)).text);
}

/** A palette's one-line description for the follower pages. */
export function paletteNote(sheet: SheetPalette | null, row?: SheetPalette | null): string {
  if (row?.opt_out) return `This row keeps its sheet's own colours: ${row.opt_out}`;
  if (row?.pokemon && row.map) return `Coloured by ${row.pokemon}'s battle palette through a map onto this sheet's indices (normal.pal; shiny.pal when shiny)`;
  if (sheet?.opt_out) return `The sheet keeps its own sprite.pal, not the battle palette: ${sheet.opt_out}`;
  if (sheet?.pokemon) return `On ${sheet.pokemon}'s battle palette: res/pokemon/${sheet.pokemon}/normal.pal colours it, shiny.pal a shiny follower or wanderer`;
  return "Its own sprite.pal";
}
