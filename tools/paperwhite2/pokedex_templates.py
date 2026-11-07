#!/usr/bin/env python3
"""Writes art templates for the Pokédex Info page's bottom screen (src/paperwhite2/ov298/), drawn as the game lays the
page out: the places come from the page's layout constants (the C files' #defines), the text from its text bank
(res/text/system/pokedex_data.txt) in the game's own fonts (a/0/2/3, read from the extracted ROM), so they are exact
to the pixel. As they hold the ROM's fonts, they are written to an ignored folder, never to res/.

    pokedex_templates.py [--extract extract/w2_us] [OUT_DIR]

For each sub-page (stats, data, matchups) it writes:
- <page>_canvas.png: the art to draw over, 256 by 192, transparent where the grid shows: the user's art where the
  sub-page has it (res/paperwhite2/pokedex_art/info_<page>.png), else in the art's palette the Stats art's strip and
  plain panels where the page draws its own until there is art;
- <page>_reference.png: the whole screen as the game shows it over the canvas, with the game's text, bars and buttons,
  the grid's area checkered and the touch bar's marked;
- <page>_reference_tiles.png: the same with the 8 by 8 tiles' grid.

Matchups' reference has the game's type icons (a/0/8/2, as the page loads them) and the multipliers of a sample
species, worked out as the page does from the type chart (src/paperwhite2/main/paperwhite2_type_chart.c).

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
from tools.data.nitro_2d import (  # noqa: E402
    character_pixels, palette_colors, read_indexed_png, write_indexed_png, write_palette)

WIDTH, HEIGHT = 256, 192
PANELS = ROOT / "src/paperwhite2/ov298/paperwhite2_pokedex_info_panels.c"
TYPE_CHART = ROOT / "src/paperwhite2/main/paperwhite2_type_chart.c"
APP_MENU_COMMON = ROOT / "src/system/app_menu_common.c"
PAGE = ROOT / "src/paperwhite2/ov298/paperwhite2_pokedex_info.c"
TEXT = ROOT / "res/text/system/pokedex_data.txt"
# The user's art of each sub-page (screen_art.py's pokedex_info_* targets' sources)
ART = ROOT / "res/paperwhite2/pokedex_art"
FONTS = "files/a/0/2/3"
# The menus' common graphics: the type icons' palette (three rows) and each type's 32 by 16 characters
MENU_COMMON = "files/a/0/8/2"
TYPE_ICON_PALETTE = 0x21
TYPE_ICON_CHARS = 0x22
TYPE_ICON_WIDTH, TYPE_ICON_HEIGHT = 32, 16
# AppTaskMenuWin's text: its top in the button, and the frame's width at each side (app_taskmenu.c)
BUTTON_TEXT_Y = 6
BUTTON_FRAME = 8
# The Pokédex's graphics, and the Info panels' palette and the rows its panels use (screens 0x20 and 0x29)
POKEDEX_GRA = "files/a/1/5/7"
TOP_PALETTE = 9
TOP_ROWS = (0, 1)
SWATCH = 16
# The touch bar's rows, the game's
TOUCHBAR_Y = 168
# A sample species for the numbers: Tepig
SAMPLE_STATS = [65, 63, 45, 45, 45, 45]
SAMPLE_DATA = ["45 (11.9%)", "Medium Slow", "\u2015", "1 HP", "62", "70"]
SAMPLE_GENDER = ("\u2642 87.5%", " / ", "12.5% \u2640")
SAMPLE_EGG = ("Field", "20", "5120 steps")
# Tepig's types (Fire) for the Matchups, and its abilities, Blaze shown chosen
SAMPLE_TYPES = (9, 9)
SAMPLE_ABILITIES = ("blaze", "thick_fat")

# The palette: the page's placeholder colors as paperwhite2_pokedex_info_panels.c's sPanelColors (index 0 clear),
# then the template's own: the grid's checker, the touch bar, the buttons, the tiles' grid
PANEL_COLORS = [
    (0, 0, 0), (4, 4, 5), (22, 22, 23), (31, 31, 31), (7, 7, 8), (15, 15, 16), (30, 7, 6), (19, 4, 4), (31, 18, 4),
    (31, 12, 21), (31, 29, 3), (22, 18, 2), (9, 26, 7), (4, 17, 4), (7, 17, 31), (3, 9, 21),
]
CLEAR, TEXT_C, SHADOW, PANEL, BORDER, DIM = 0, 1, 2, 3, 4, 5
BAR_COLORS = [(50, 6), (80, 8), (100, 10), (130, 12)]
BLUE = 14
EXTRA = [(150, 60, 60), (110, 40, 40), (90, 140, 200), (40, 60, 100), (255, 0, 255), (120, 120, 140), (90, 90, 105)]
GRID_A, GRID_B, TOUCH, TOUCH_EDGE, BUTTON, BUTTON_EDGE, TILE_LINE = range(16, 23)
PINK = 9
# Where the art's 16 colors start in a reference's palette, after the template's
ART_BASE = 23
# The placeholder panels' colors in the art's palette (the top screen's row 0): its white and a dark grey
ART_PANEL, ART_BORDER = 4, 10
# Matchups' reference: after the art's 16 colors, the type icons' 48, then a chosen button's color
ICON_BASE = ART_BASE + 16
BUTTON_CHOSEN_COLOR = (90, 200, 230)
BUTTON_CHOSEN = ICON_BASE + 48
# The multipliers' colors, as the page's MULTIPLIER_*_COLOR: above 1, below it, 0, and 1 (letter, shadow)
RED, BORDER_C = 6, 4
MULTIPLIER_ONE = 64

# What the templates are and the art's limits, for the user, beside them
README = """Pokedex Info page, bottom screen: art templates (Stats, Data and Matchups sub-pages)
======================================================================================

Files
- stats_canvas.png: draw your art over this one. 256 x 192, the whole bottom screen.
  It now holds the placeholder tab strip (top 16 rows) and the white Stats panel.
  Transparent (palette index 0) = the animated red grid shows through.
- stats_reference.png: the screen as the game shows it over the canvas, with the game's
  own text, numbers and bars, exact to the pixel. Use it as a reference
  layer above or below your drawing.
- stats_reference_tiles.png: the same with the 8 x 8 tile grid.
- data_canvas.png, data_reference.png, data_reference_tiles.png: the same for Data. Its canvas is
  already in your palette, with your tab strip from the Stats art and plain placeholder panels
  (the Data panel and the Egg column) where the game draws its own until there is art.
  Data has no buttons. Its labels (Gender, Catch Rate, GROUP, CYCLES...) are the small font in
  mid grey (123,123,131) without a shadow; its values are near-black with the light grey shadow;
  the male share is blue (57,139,255), the female pink (255,98,172).

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
  - the stat bars (outline, white track and the coloured fill)
  So keep the panel behind the text light, and the tab strip dark enough for white text.
- The text and bars go where the reference shows them; ask to have any moved, the bars or
  the line left to your art, or the text in other colours.

The top screen's colours
- top_panels_row0.pal / .gpl and top_panels_row1.pal / .gpl: the two 16-colour palettes
  the top screen's Info panels and background use (row 0 the panels' and the grid's, row 1
  the rest of the panels'); top_panels_palette.png shows them as swatches, row 0 on top.
  In each palette, colour 0 is the transparent one.

Matchups
- matchups_canvas.png, matchups_reference.png, matchups_reference_tiles.png: the same for
  Matchups. Its canvas is in your palette, with your tab strip and the plain placeholder panel.
- The 17 type icons are the game's own sprites, drawn over everything: their places are fixed
  (3 rows of 6, the last place free for a possible new type). Under each, the damage
  multiplier against the Pokemon in the standard font: red above x1, blue below, dark grey for
  x0, mid grey for x1 (the sample is Tepig, Fire).
- The row of ability buttons at the bottom (y 144-167) are the game's buttons (1 to 3 of them,
  centered); the chosen ability's (Blaze) is shown in the menus' cursor colour.

When you're done, send the PNG back (any 16-colour PNG, indexed or not, transparency as
transparent pixels) and it gets built into the game.
"""


def colors(art_colors=(), icon_colors=()):
    def rgb(c):
        return tuple(v * 255 // 31 for v in c)
    out = [rgb(c) for c in PANEL_COLORS] + EXTRA + list(art_colors)
    if icon_colors:
        out += [(0, 0, 0)] * (ICON_BASE - len(out)) + list(icon_colors) + [BUTTON_CHOSEN_COLOR]
    return out


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

    def write(self, path, palette=None):
        path.write_bytes(write_indexed_png(WIDTH, HEIGHT, bytes(self.pixels), palette or colors()))


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


def data_text(canvas, d, m, font, small):
    # As PokedexInfoPanels_DrawData and _DrawEgg
    labels = ["GenderLabel", "CatchRateLabel", "GrowthLabel", "FlavorLabel", "EvYieldLabel", "BaseExpLabel",
              "FriendshipLabel"]
    rows = d["DATA_ROW_Y"], d["DATA_ROW_PITCH"]
    for i, label in enumerate(labels):
        canvas.text(small, m[label], d["DATA_LABEL_X"], rows[0] + i * rows[1] + d["DATA_LABEL_OFFSET_Y"],
                    letter=DIM, shadow=CLEAR)
    right = d["DATA_VALUE_RIGHT"]
    female, separator, male = SAMPLE_GENDER[2], SAMPLE_GENDER[1], SAMPLE_GENDER[0]
    canvas.text(font, female, right, rows[0], "right", PINK)
    right -= font.text_width(female)
    canvas.text(font, separator, right, rows[0], "right")
    right -= font.text_width(separator)
    canvas.text(font, male, right, rows[0], "right", BLUE)
    for i, value in enumerate(SAMPLE_DATA, 1):
        canvas.text(font, value, d["DATA_VALUE_RIGHT"], rows[0] + i * rows[1], "right")
    center = d["EGG_CENTER_X"]
    canvas.text(font, m["EggHeading"], center, d["EGG_HEADING_Y"], "center", 10, BORDER)
    canvas.text(small, m["Group"], center, d["EGG_GROUP_LABEL_Y"], "center", DIM, CLEAR)
    group, cycles, steps = SAMPLE_EGG
    canvas.text(font, group, center, d["EGG_GROUP_Y"], "center", PANEL, BORDER)
    canvas.text(small, m["Cycles"], center, d["EGG_CYCLES_LABEL_Y"], "center", DIM, CLEAR)
    canvas.text(font, cycles, center, d["EGG_CYCLES_Y"], "center", PANEL, BORDER)
    canvas.text(small, steps, center, d["EGG_STEPS_Y"], "center", DIM, CLEAR)


def load_art(page):
    """The user's art of a sub-page as its pixels and 16 colors, or None."""
    path = ART / f"info_{page}.png"
    if not path.exists():
        return None
    _, _, pixels, art_colors = read_indexed_png(path)
    return bytearray(pixels), list(art_colors)[:16]


def placeholder_canvas(d, stats_art, panels):
    """A sub-page's canvas in the art's palette: the Stats art's strip, and the panels the page draws until there is
    art."""
    pixels, art_colors = stats_art
    canvas = Canvas()
    strip = d["BAR_WINDOW_HEIGHT"] * 8 * WIDTH
    canvas.pixels[:strip] = pixels[:strip]
    for name in panels:
        x, y, w, h = (d[f"{name}_PANEL_{k}"] for k in ("X", "Y", "WIDTH", "HEIGHT"))
        canvas.fill(x + 1, y, w - 2, h, ART_BORDER)
        canvas.fill(x, y + 1, w, h - 2, ART_BORDER)
        canvas.fill(x + 1, y + 1, w - 2, h - 2, ART_PANEL)
    return canvas.pixels, art_colors


def type_chart():
    """The type chart, attacking type first, from its C file."""
    values = [int(v) for v in re.findall(r"\d+", TYPE_CHART.read_text().split("= {", 1)[1].split("};")[0])]
    size = int(len(values) ** 0.5)
    return [values[i * size:(i + 1) * size] for i in range(size)]


def multiplier_text(value):
    """As PokedexInfoPanels_PrintMultiplier: "\u00d7", the whole part and as many decimals as it has."""
    whole, fraction = divmod(value, MULTIPLIER_ONE)
    digits = ""
    while fraction:
        fraction *= 10
        digits += str(fraction // MULTIPLIER_ONE)
        fraction %= MULTIPLIER_ONE
    return f"\u00d7{whole}" + (f".{digits}" if digits else "")


def type_icons(extract):
    """Each type's icon as its 32 by 16 pixels in the icons' 48 colors, and those colors."""
    files = read_narc((extract / MENU_COMMON).read_bytes())
    icon_colors = palette_colors(files[TYPE_ICON_PALETTE])[:48]
    rows = [int(v) for v in re.search(r"sTypeIconPalettes\[\] = \{([^}]*)\}", APP_MENU_COMMON.read_text())
            .group(1).replace(",", " ").split()]
    icons = []
    for t in range(len(type_chart())):
        _, _, pixels = character_pixels(files[TYPE_ICON_CHARS + t], TYPE_ICON_WIDTH, TYPE_ICON_HEIGHT)
        icons.append(bytes(v + rows[t] * 16 if v else 0 for v in pixels))
    return icons, icon_colors


def matchups_text(canvas, d, m, font, icons):
    # As PokedexInfoPanels_DrawMatchups, the icons as the page places them (their cells are centered), and the ability
    # buttons as PokedexInfoPage_CreateAbilityButtons
    chart = type_chart()
    type1, type2 = SAMPLE_TYPES
    for t, icon in enumerate(icons):
        x = d["MATCHUPS_ICON_X"] + t % d["MATCHUPS_COLUMNS"] * d["MATCHUPS_COLUMN_PITCH"]
        y = d["MATCHUPS_ICON_Y"] + t // d["MATCHUPS_COLUMNS"] * d["MATCHUPS_ROW_PITCH"]
        for i, value in enumerate(icon):
            if value:
                px, py = x - TYPE_ICON_WIDTH // 2 + i % TYPE_ICON_WIDTH, y - TYPE_ICON_HEIGHT // 2 + i // TYPE_ICON_WIDTH
                canvas.pixels[py * WIDTH + px] = ICON_BASE + value
        value = chart[t][type1] * (MULTIPLIER_ONE // 4)
        if type2 != type1:
            value = value * chart[t][type2] // 4
        letter, shadow = ((RED, SHADOW) if value > MULTIPLIER_ONE else (BLUE, SHADOW) if 0 < value < MULTIPLIER_ONE
                          else (BORDER_C, SHADOW) if value == 0 else (DIM, CLEAR))
        canvas.text(font, multiplier_text(value), x, y + d["MATCHUPS_VALUE_OFFSET_Y"], "center", letter, shadow)
    count, w, h = len(SAMPLE_ABILITIES), d["ABILITY_BUTTON_WIDTH"], d["ABILITY_BUTTON_HEIGHT"]
    for i, ability in enumerate(SAMPLE_ABILITIES):
        x = (d["ABILITY_BUTTON_CENTER_X"] - count * w // 2 + i * w) * 8
        y = d["ABILITY_BUTTON_Y"] * 8
        name = re.search(r'"name": "([^"]*)"', (ROOT / f"res/abilities/{ability}.json").read_text()).group(1)
        canvas.fill(x, y, w * 8, h * 8, BUTTON_CHOSEN if i == 0 else BUTTON)
        canvas.outline(x, y, w * 8, h * 8, BUTTON_EDGE)
        text_x = (w * 8 - font.text_width(name) - 2 * BUTTON_FRAME) // 2 + BUTTON_FRAME
        canvas.text(font, name, x + text_x, y + BUTTON_TEXT_Y, letter=PANEL, shadow=CLEAR)


def reference(art, draw_text, tiles):
    """art is a placeholder Canvas, or the art's (pixels, colors), which go after the template's colors."""
    canvas = Canvas()
    pixels, base = (art.pixels, 0) if isinstance(art, Canvas) else (art[0], ART_BASE)
    for y in range(HEIGHT):
        for x in range(WIDTH):
            value = pixels[y * WIDTH + x]
            canvas.pixels[y * WIDTH + x] = value + base if value else (GRID_A if (x // 4 + y // 4) % 2 else GRID_B)
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

    stats_art = load_art("stats")
    if stats_art:
        (args.out / "stats_canvas.png").write_bytes((ART / "info_stats.png").read_bytes())
        art, palette = stats_art, colors(stats_art[1])
    else:
        art, palette = stats_page(d, m, font, small), colors()
        art.write(args.out / "stats_canvas.png")

    def stats(canvas):
        bar_text(canvas, d, m, small, 0)
        stats_text(canvas, d, m, font)
        buttons(canvas, d, m, font, ["Cry", "Turn", "Form", "Shiny", "Language"])
    for tiles, name in ((False, "stats_reference.png"), (True, "stats_reference_tiles.png")):
        reference(art, stats, tiles).write(args.out / name, palette)

    # Data: the user's art once there is some, else a canvas in the Stats art's palette with its strip
    data_art = load_art("data") or (placeholder_canvas(d, stats_art, ("DATA", "EGG")) if stats_art else None)
    if data_art:
        (args.out / "data_canvas.png").write_bytes(write_indexed_png(WIDTH, HEIGHT, bytes(data_art[0]), data_art[1]))

        def data(canvas):
            bar_text(canvas, d, m, small, 1)
            data_text(canvas, d, m, font, small)
        for tiles, name in ((False, "data_reference.png"), (True, "data_reference_tiles.png")):
            reference(data_art, data, tiles).write(args.out / name, colors(data_art[1]))
    # Matchups, as Data
    matchups_art = load_art("matchups") or (placeholder_canvas(d, stats_art, ("MATCHUPS",)) if stats_art else None)
    if matchups_art:
        (args.out / "matchups_canvas.png").write_bytes(
            write_indexed_png(WIDTH, HEIGHT, bytes(matchups_art[0]), matchups_art[1]))
        icons, icon_colors = type_icons(args.extract)
        art_colors = (list(matchups_art[1]) + [(0, 0, 0)] * 16)[:16]

        def matchups(canvas):
            bar_text(canvas, d, m, small, 2)
            matchups_text(canvas, d, m, font, icons)
        for tiles, name in ((False, "matchups_reference.png"), (True, "matchups_reference_tiles.png")):
            reference(matchups_art, matchups, tiles).write(args.out / name, colors(art_colors, icon_colors))
    (args.out / "README.txt").write_text(README)
    top_palettes(args.extract, args.out)
    print(f"wrote the templates to {args.out}")


if __name__ == "__main__":
    main()
