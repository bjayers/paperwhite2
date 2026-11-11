"""The town map as the Pokédex's area page draws it (pokedex_detail_map.c), for the Encounter Editor's map, written to
stdout as JSON:

- "image": a data: URL of an RGBA PNG of the map's two BGs (BG 3, characters 7 on screen 16, under BG 2, characters
  5 on screen 17, both in extended palette 0 of 00.pal), the route lines, circles and dots included; the top 176 rows
  of the screen, which the map art fills;
- "shapes": each area OBJ animation's first cell (res/graphics/pokedex_gra 15/29/46, PokedexDetailMap_CreateActors),
  the highlight a place's "area" names, as {"light"|"mid"|"dark": [[x, y, run], ...]} around its origin: rows of
  pixels by the shade of the original red they have (the palette's 6, 7 and 8), to colour as the editor colours a
  place. The logic is tools/paperwhite2/pokedex_area_templates.py's town_map() and area_shapes().

    town_map.py
"""
import base64
import json
import struct
import sys
from pathlib import Path

ROOT = Path.cwd()
sys.path.insert(0, str(ROOT))
from tools.data.nitro_2d import read_indexed_png, write_rgba_png  # noqa: E402
from tools.paperwhite2.nitro_cells import Animations  # noqa: E402
from tools.paperwhite2.pokedex_templates import sprite_cell  # noqa: E402

TOWNMAP_GRA = ROOT / "res/graphics/townmap_gra"
POKEDEX_GRA = ROOT / "res/graphics/pokedex_gra"
LAYERS = (("07.png", "16.nscr"), ("05.png", "17.nscr"))
WIDTH, HEIGHT = 256, 176
CHARS, CELLS, ANIMS = "015.png", "029.ncer", "046.nanr"
SHADES = {6: "light", 7: "mid", 8: "dark"}


def jasc(path):
    lines = path.read_text().split("\n")[3:]
    return [tuple(int(v) for v in line.split()) for line in lines if line.strip()]


def town_map():
    palette = jasc(TOWNMAP_GRA / "00.pal")
    image = bytearray(WIDTH * HEIGHT * 4)
    for chars, screen in LAYERS:
        width, height, pixels, _ = read_indexed_png(TOWNMAP_GRA / chars)
        count = (width // 8) * (height // 8)
        data = (TOWNMAP_GRA / screen).read_bytes()
        entries = struct.unpack_from("<1024H", data, len(data) - 0x800)
        for ty in range(HEIGHT // 8):
            for tx in range(WIDTH // 8):
                e = entries[ty * 32 + tx]
                tile = e & 0x3FF
                if tile >= count:
                    continue
                ox, oy = tile % (width // 8) * 8, tile // (width // 8) * 8
                for y in range(8):
                    for x in range(8):
                        v = pixels[(oy + y) * width + ox + x]
                        if not v:
                            continue
                        px = tx * 8 + (7 - x if e & 0x400 else x)
                        py = ty * 8 + (7 - y if e & 0x800 else y)
                        o = (py * WIDTH + px) * 4
                        image[o:o + 4] = bytes((*palette[(e >> 12) * 256 + v], 255))
    return write_rgba_png(WIDTH, HEIGHT, bytes(image))


def shapes():
    anims = Animations((POKEDEX_GRA / ANIMS).read_bytes())
    out = {}
    for i, seq in enumerate(anims.sequences):
        if not seq.frames:
            continue
        cell, _ = sprite_cell(POKEDEX_GRA / CHARS, POKEDEX_GRA / CELLS, seq.frames[0].cell)
        rows = {name: [] for name in SHADES.values()}
        for (x, y), v in sorted(cell.items(), key=lambda item: (item[0][1], item[0][0])):
            run = rows[SHADES.get(v, "mid")]
            if run and run[-1][1] == y and run[-1][0] + run[-1][2] == x:
                run[-1][2] += 1
            else:
                run.append([x, y, 1])
        out[str(i)] = rows
    return out


if __name__ == "__main__":
    png = base64.b64encode(town_map()).decode()
    json.dump({"image": f"data:image/png;base64,{png}", "shapes": shapes()}, sys.stdout, separators=(",", ":"))
