#!/usr/bin/env python3
"""Writes the DexNav's art templates, res/paperwhite2/dexnav/templates/: each screen at 256 by 192 as an indexed PNG
with the 8 by 8 tiles' grid and the places of its text, icons and tabs as the app lays them out, to draw over in an
image editor (a reference layer in Aseprite). The places are paperwhite2_dexnav.c's layout constants, in tiles; keep
them in step when the layout changes.

    dexnav_templates.py [OUT_DIR]
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.nitro_2d import write_indexed_png  # noqa: E402

WIDTH, HEIGHT = 256, 192

# The template's colors: the background, the tiles' grid, then a fill and an edge for each kind of place
COLORS = [
    (36, 36, 44), (58, 58, 70), (92, 92, 110), (255, 255, 255),
    (48, 86, 140), (120, 170, 240),  # text
    (140, 70, 50), (250, 160, 110),  # icon
    (50, 110, 64), (120, 220, 140),  # tabs
    (100, 80, 140), (190, 160, 240),  # a cell's share
]
GRID, GRID_16, TEXT_COLOR = 1, 2, 3
KINDS = {"text": 4, "icon": 6, "tabs": 8, "share": 10}

# (kind, label, x, y, width, height) in tiles, as paperwhite2_dexnav.c's windows
TOP = [
    ("text", "TITLE", 1, 1, 30, 2),
    ("icon", "ICON", 2, 4, 4, 4),
    ("text", "INFO: NAME TYPES SHARE LEVELS SEEN", 7, 4, 24, 10),
    ("text", "CONDITIONS", 1, 17, 30, 2),
    ("text", "HELP", 1, 21, 30, 2),
]
GRID_COLUMNS, GRID_ROWS, GRID_X, GRID_Y, CELL_WIDTH, CELL_HEIGHT, ICON_TILES = 6, 3, 1, 5, 5, 6, 4
TOUCH = [("tabs", "WATER TABS", 0, 0, 32, 2), ("tabs", "LAND TABS", 0, 2, 32, 2)]
for row in range(GRID_ROWS):
    for column in range(GRID_COLUMNS):
        x, y = GRID_X + column * CELL_WIDTH, GRID_Y + row * CELL_HEIGHT
        TOUCH.append(("icon", "", x, y, ICON_TILES, ICON_TILES))
        TOUCH.append(("share", "", x, y + ICON_TILES, ICON_TILES, 2))

# A 3 by 5 font for the labels
GLYPHS = {
    "A": "111101111101101", "B": "110101110101110", "C": "111100100100111", "D": "110101101101110",
    "E": "111100110100111", "F": "111100110100100", "G": "111100101101111", "H": "101101111101101",
    "I": "111010010010111", "L": "100100100100111", "M": "101111111101101", "N": "110101101101101",
    "O": "111101101101111", "P": "111101111100100", "R": "110101110101101", "S": "111100111001111",
    "T": "111010010010010", "V": "101101101101010", "W": "101101111111101", "Y": "101101010010010",
    ":": "000010000010000", " ": "000000000000000",
}


def write(name, places, out):
    pixels = bytearray(WIDTH * HEIGHT)
    for y in range(HEIGHT):
        for x in range(WIDTH):
            if x % 16 == 0 or y % 16 == 0:
                pixels[y * WIDTH + x] = GRID_16
            elif x % 8 == 0 or y % 8 == 0:
                pixels[y * WIDTH + x] = GRID
    for kind, label, tx, ty, tw, th in places:
        fill = KINDS[kind]
        x0, y0, x1, y1 = tx * 8, ty * 8, (tx + tw) * 8, (ty + th) * 8
        for y in range(y0, y1):
            for x in range(x0, x1):
                edge = x in (x0, x1 - 1) or y in (y0, y1 - 1)
                pixels[y * WIDTH + x] = fill + 1 if edge else fill
        cx = x0 + 3
        for char in label:
            glyph = GLYPHS.get(char, GLYPHS[" "])
            for i, bit in enumerate(glyph):
                if bit == "1":
                    pixels[(y0 + 3 + i // 3) * WIDTH + cx + i % 3] = TEXT_COLOR
            cx += 4
    (out / name).write_bytes(write_indexed_png(WIDTH, HEIGHT, bytes(pixels), COLORS))


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "res/paperwhite2/dexnav/templates"
    out.mkdir(parents=True, exist_ok=True)
    write("top.png", TOP, out)
    write("touch.png", TOUCH, out)


if __name__ == "__main__":
    main()
