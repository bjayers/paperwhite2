#!/usr/bin/env python3
"""Writes art templates for the Pokédex Info page's bottom screen (src/paperwhite2/ov298/), drawn as the game lays the
page out: the places come from the page's layout constants (the C files' #defines), the text from its text bank
(res/text/system/pokedex_data.txt) in the game's own fonts (a/0/2/3, read from the extracted ROM), so they are exact
to the pixel. As they hold the ROM's fonts, they are written to an ignored folder, never to res/.

    pokedex_templates.py [--extract extract/w2_us] [OUT_DIR]

For each sub-page it writes:
- <page>_canvas.png: the art to draw over, 256 by 192, transparent where the grid shows; now the placeholder strip and
  panel the page draws until there is art;
- <page>_reference.png: the whole screen as the game shows it over the canvas, with the game's text, bars and buttons,
  the grid's area checkered and the touch bar's marked;
- <page>_reference_tiles.png: the same with the 8 by 8 tiles' grid.

And the top screen's Info panels' palettes (a/1/5/7's palette 9, rows 0 and 1, ov296's POKEDEX_GRA_PALETTE), to draw
with the same colors: top_panels_row<N>.pal (JASC), .gpl (GIMP, Aseprite) and top_panels_palette.png (the swatches).
"""
import argparse
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.narc import read_narc  # noqa: E402
from tools.data.nitro_2d import palette_colors, write_indexed_png, write_palette  # noqa: E402

WIDTH, HEIGHT = 256, 192
PANELS = ROOT / "src/paperwhite2/ov298/paperwhite2_pokedex_info_panels.c"
PAGE = ROOT / "src/paperwhite2/ov298/paperwhite2_pokedex_info.c"
TEXT = ROOT / "res/text/system/pokedex_data.txt"
FONTS = "files/a/0/2/3"
# The Pokédex's graphics, and the Info panels' palette and the rows its panels use (screens 0x20 and 0x29)
POKEDEX_GRA = "files/a/1/5/7"
TOP_PALETTE = 9
TOP_ROWS = (0, 1)
SWATCH = 16
# The touch bar's rows, the game's
TOUCHBAR_Y = 168
# A sample species for the numbers: Tepig
SAMPLE_STATS = [65, 63, 45, 45, 45, 45]

# The palette: the page's placeholder colors as paperwhite2_pokedex_info_panels.c's sPanelColors (index 0 clear),
# then the template's own: the grid's checker, the touch bar, the buttons, the tiles' grid
PANEL_COLORS = [
    (0, 0, 0), (4, 4, 5), (22, 22, 23), (31, 31, 31), (7, 7, 8), (15, 15, 16), (30, 7, 6), (19, 4, 4), (31, 18, 4),
    (31, 12, 21), (31, 28, 5), (22, 18, 2), (9, 26, 7), (4, 17, 4), (7, 17, 31), (3, 9, 21),
]
CLEAR, TEXT_C, SHADOW, PANEL, BORDER, DIM = 0, 1, 2, 3, 4, 5
BAR_COLORS = [(50, 6), (80, 8), (100, 10), (130, 12)]
BLUE = 14
EXTRA = [(150, 60, 60), (110, 40, 40), (90, 140, 200), (40, 60, 100), (255, 0, 255), (120, 120, 140), (90, 90, 105)]
GRID_A, GRID_B, TOUCH, TOUCH_EDGE, BUTTON, BUTTON_EDGE, TILE_LINE = range(16, 23)

# What the templates are and the art's limits, for the user, beside them
README = """Pokedex Info page, bottom screen: art templates (Stats sub-page)
=================================================================

Files
- stats_canvas.png: draw your art over this one. 256 x 192, the whole bottom screen.
  It now holds the placeholder tab strip (top 16 rows) and the white Stats panel.
  Transparent (palette index 0) = the animated red grid shows through.
- stats_reference.png: the screen as the game shows it over the canvas, with the game's
  own text, numbers, bars and the line above BST, exact to the pixel. Use it as a reference
  layer above or below your drawing.
- stats_reference_tiles.png: the same with the 8 x 8 tile grid.

Colours on the reference that are NOT art
- the checker = transparent (the grid shows there)
- the blue band at the bottom (y 168-191) = the game's touch bar; leave it transparent
- the pink boxes = the game's buttons (Cry, Turn, Form, Shiny, Language): they cover your art
  wherever a button is shown. Shiny and Language only appear for some Pokemon, so your art
  shows in their place otherwise.

Limits
- One picture, 256 x 192, at most 16 colours in all, and one of them is the transparent
  colour, so 15 that you see.
- Any shapes or positions: the tool cuts it into 8 x 8 tiles for you. Repeated tiles (and
  flipped ones) are stored once; the screen has room for every tile being different.
- The game draws on top of your art, in its own colours:
  - the panel text: near-black (32,32,41) with a light grey shadow (180,180,189)
  - the tab strip's text: the current tab white, the others mid grey (123,123,131), no shadow
  - the stat bars (outline, white track and the coloured fill) and the line above BST
  So keep the panel behind the text light, and the tab strip dark enough for white text.
- The text and bars go where the reference shows them; ask to have any moved, the bars or
  the line left to your art, or the text in other colours.

The top screen's colours
- top_panels_row0.pal / .gpl and top_panels_row1.pal / .gpl: the two 16-colour palettes
  the top screen's Info panels and background use (row 0 the panels' and the grid's, row 1
  the rest of the panels'); top_panels_palette.png shows them as swatches, row 0 on top.
  In each palette, colour 0 is the transparent one.

When you're done, send the PNG back (any 16-colour PNG, indexed or not, transparency as
transparent pixels) and it gets built into the game. Data and Matchups get their own
templates next, with the same tab strip.
"""


def colors():
    def rgb(c):
        return tuple(v * 255 // 31 for v in c)
    return [rgb(c) for c in PANEL_COLORS] + EXTRA


def defines(*paths):
    """The C files' integer #defines, with expressions of earlier ones."""
    values = {}
    for path in paths:
        for name, expr in re.findall(r"^#define (\w+) (.+)$", path.read_text(), re.M):
            expr = re.sub(r"//.*", "", expr).strip()
            try:
                values[name] = int(eval(re.sub(r"\b([A-Z_][A-Z0-9_]*)\b",
                                               lambda m: str(values[m.group(1)]), expr), {}))
            except (KeyError, SyntaxError, NameError, TypeError, ZeroDivisionError):
                pass
    return values


def messages():
    out = {}
    for line in TEXT.read_text().split("\n"):
        if " = " in line:
            key, text = line.split(" = ", 1)
            out[key.replace("PokedexData_Text_", "")] = text
    return out


class Font:
    """A game font (a Nitro font with each glyph's widths in its cell, as editor/src/modules/text/font.ts reads it)."""

    def __init__(self, data):
        u8, u16, u32 = (lambda o: data[o]), (lambda o: struct.unpack_from("<H", data, o)[0]), \
            (lambda o: struct.unpack_from("<I", data, o)[0])
        finf = u16(12)
        self.alter = u16(finf + 10)
        cglp, cmap = u32(finf + 16) - 8, u32(finf + 24) - 8
        self.width, self.height, self.size, self.bpp = u8(cglp + 8), u8(cglp + 9), u16(cglp + 10), u8(cglp + 14)
        self.data, self.cglp = data, cglp
        self.map = {}
        at = cmap
        while 0 < at < len(data):
            begin, end, kind, body = u16(at + 8), u16(at + 10), u16(at + 12), at + 20
            if kind == 0:
                for c in range(begin, end + 1):
                    self.map[c] = u16(body) + c - begin
            elif kind == 1:
                for c in range(begin, end + 1):
                    if u16(body + (c - begin) * 2) != 0xFFFF:
                        self.map[c] = u16(body + (c - begin) * 2)
            else:
                for i in range(u16(body)):
                    self.map[u16(body + 2 + i * 4)] = u16(body + 4 + i * 4)
            nxt = u32(at + 16)
            at = nxt - 8 if nxt else 0

    def glyph(self, char):
        cell = self.cglp + 16 + self.map.get(ord(char), self.alter) * self.size
        left, advance = struct.unpack_from("<b", self.data, cell)[0], self.data[cell + 2]
        pixels = []
        for p in range(self.width * self.height):
            bit = p * self.bpp
            byte = self.data[cell + 3 + (bit >> 3)]
            pixels.append((byte >> (8 - self.bpp - (bit & 7))) & ((1 << self.bpp) - 1))
        return left, advance, pixels

    def text_width(self, text):
        return sum(self.glyph(c)[1] for c in text)


class Canvas:
    def __init__(self):
        self.pixels = bytearray(WIDTH * HEIGHT)

    def fill(self, x, y, w, h, color):
        for yy in range(max(0, y), min(HEIGHT, y + h)):
            for xx in range(max(0, x), min(WIDTH, x + w)):
                self.pixels[yy * WIDTH + xx] = color

    def text(self, font, text, x, y, align="left", letter=TEXT_C, shadow=SHADOW):
        width = font.text_width(text)
        x -= {"left": 0, "right": width, "center": width // 2}[align]
        for char in text:
            left, advance, glyph = font.glyph(char)
            for i, value in enumerate(glyph):
                if value:
                    px, py = x + left + i % font.width, y + i // font.width
                    if 0 <= px < WIDTH and 0 <= py < HEIGHT and (value != 2 or shadow != CLEAR):
                        self.pixels[py * WIDTH + px] = letter if value != 2 else shadow
            x += advance

    def outline(self, x, y, w, h, color):
        self.fill(x, y, w, 1, color)
        self.fill(x, y + h - 1, w, 1, color)
        self.fill(x, y, 1, h, color)
        self.fill(x + w - 1, y, 1, h, color)

    def panel(self, x, y, w, h):
        # As PokedexInfoPanels_DrawPanel: a border without its corners round the panel's color
        self.fill(x + 1, y, w - 2, h, BORDER)
        self.fill(x, y + 1, w, h - 2, BORDER)
        self.fill(x + 1, y + 1, w - 2, h - 2, PANEL)

    def write(self, path):
        path.write_bytes(write_indexed_png(WIDTH, HEIGHT, bytes(self.pixels), colors()))


def stat_bar(canvas, d, x, y, value):
    # As PokedexInfoPanels_DrawStatBar
    w, h = d["STATS_BAR_WIDTH"], d["STATS_BAR_HEIGHT"]
    color = next((c for limit, c in BAR_COLORS if value < limit), BLUE)
    fill = min(value, d["STATS_BAR_MAX"]) * (w - 2) // d["STATS_BAR_MAX"]
    canvas.fill(x + 1, y, w - 2, h, BORDER)
    canvas.fill(x, y + 1, w, h - 2, BORDER)
    canvas.fill(x + 1, y + 1, w - 2, h - 2, PANEL)
    if fill:
        canvas.fill(x + 1, y + 1, fill, h - 3, color)
        canvas.fill(x + 1, y + h - 2, fill, 1, 7 if color == 8 else color + 1)


def stats_page(d, m, font, small):
    canvas = Canvas()
    canvas.fill(0, 0, WIDTH, d["BAR_WINDOW_HEIGHT"] * 8, BORDER)
    canvas.panel(d["STATS_PANEL_X"], d["STATS_PANEL_Y"], d["STATS_PANEL_WIDTH"], d["STATS_PANEL_HEIGHT"])
    return canvas


def bar_text(canvas, d, m, small, shown):
    y = d["BAR_TEXT_Y"]
    canvas.text(small, m["SubpageL"], d["BAR_L_X"], y, letter=DIM, shadow=CLEAR)
    canvas.text(small, m["SubpageR"], d["BAR_R_RIGHT"], y, "right", DIM, CLEAR)
    for i, (name, center) in enumerate([("Stats", "BAR_STATS_X"), ("Data", "BAR_DATA_X"),
                                        ("Matchups", "BAR_MATCHUPS_X")]):
        canvas.text(small, m[name], d[center], y, "center", PANEL if i == shown else DIM, CLEAR)


def stats_text(canvas, d, m, font):
    names = ["HP", "Attack", "Defense", "SpAttack", "SpDefense", "Speed"]
    for i, (name, value) in enumerate(zip(names, SAMPLE_STATS)):
        y = d["STATS_ROW_Y"] + i * d["STATS_ROW_PITCH"]
        canvas.text(font, m[name], d["STATS_NAME_X"], y)
        canvas.text(font, str(value), d["STATS_VALUE_RIGHT"], y, "right")
        stat_bar(canvas, d, d["STATS_BAR_X"], y + d["STATS_BAR_OFFSET_Y"], value)
    canvas.fill(d["STATS_NAME_X"], d["STATS_LINE_Y"], d["STATS_BAR_X"] + d["STATS_BAR_WIDTH"] - d["STATS_NAME_X"], 1,
                BORDER)
    canvas.text(font, m["Total"], d["STATS_NAME_X"], d["STATS_TOTAL_Y"])
    canvas.text(font, str(sum(SAMPLE_STATS)), d["STATS_VALUE_RIGHT"], d["STATS_TOTAL_Y"], "right")


def buttons(canvas, d, m, font, labels):
    # The game's AppTaskMenuWin buttons, outlined, as paperwhite2_pokedex_info.c places them
    x, w, h = d["BUTTON_X"] * 8, d["BUTTON_WIDTH"] * 8, d["BUTTON_HEIGHT"] * 8
    for i, label in enumerate(labels):
        y = (d["BUTTON_Y"] + i * d["BUTTON_PITCH"]) * 8
        canvas.fill(x, y, w, h, BUTTON)
        canvas.outline(x, y, w, h, BUTTON_EDGE)
        canvas.text(font, m[label], x + w // 2, y + 4, "center", PANEL, CLEAR)


def reference(art, draw_text, tiles):
    canvas = Canvas()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            value = art.pixels[y * WIDTH + x]
            canvas.pixels[y * WIDTH + x] = value or (GRID_A if (x // 4 + y // 4) % 2 else GRID_B)
    draw_text(canvas)
    canvas.fill(0, TOUCHBAR_Y, WIDTH, HEIGHT - TOUCHBAR_Y, TOUCH)
    canvas.outline(0, TOUCHBAR_Y, WIDTH, HEIGHT - TOUCHBAR_Y, TOUCH_EDGE)
    if tiles:
        for y in range(HEIGHT):
            for x in range(WIDTH):
                if x % 8 == 0 or y % 8 == 0:
                    canvas.pixels[y * WIDTH + x] = TILE_LINE
    return canvas


def top_palettes(extract, out):
    """The top screen's Info panels' palette rows, as palette files and a PNG of swatches, a row of 16 for each."""
    colors16 = palette_colors(read_narc((extract / POKEDEX_GRA).read_bytes())[TOP_PALETTE])
    rows = [colors16[row * 16:row * 16 + 16] for row in TOP_ROWS]
    for row, cs in zip(TOP_ROWS, rows):
        (out / f"top_panels_row{row}.pal").write_text(write_palette(cs))
        (out / f"top_panels_row{row}.gpl").write_text(
            f"GIMP Palette\nName: Pokedex Info top, row {row}\nColumns: 16\n#\n"
            + "".join(f"{r:3} {g:3} {b:3}\tIndex {i}\n" for i, (r, g, b) in enumerate(cs)))
    swatches = [c for cs in rows for c in cs]
    width, height = 16 * SWATCH, len(rows) * SWATCH
    pixels = bytes((y // SWATCH) * 16 + x // SWATCH for y in range(height) for x in range(width))
    (out / "top_panels_palette.png").write_bytes(write_indexed_png(width, height, pixels, swatches))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--extract", type=Path, default=ROOT / "extract/w2_us")
    parser.add_argument("out", type=Path, nargs="?", default=ROOT / "build/pokedex_templates")
    args = parser.parse_args()
    fonts = read_narc((args.extract / FONTS).read_bytes())
    font, small = Font(fonts[0]), Font(fonts[1])
    d, m = defines(PANELS, PAGE), messages()
    args.out.mkdir(parents=True, exist_ok=True)

    art = stats_page(d, m, font, small)
    art.write(args.out / "stats_canvas.png")

    def stats(canvas):
        bar_text(canvas, d, m, small, 0)
        stats_text(canvas, d, m, font)
        buttons(canvas, d, m, font, ["Cry", "Turn", "Form", "Shiny", "Language"])
    for tiles, name in ((False, "stats_reference.png"), (True, "stats_reference_tiles.png")):
        reference(art, stats, tiles).write(args.out / name)
    (args.out / "README.txt").write_text(README)
    top_palettes(args.extract, args.out)
    print(f"wrote the Stats templates to {args.out}")


if __name__ == "__main__":
    main()
