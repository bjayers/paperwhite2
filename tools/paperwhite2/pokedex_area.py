#!/usr/bin/env python3
"""Paper White 2: the Pokédex Info page's Area icons, a member of the Pokédex's graphics archive (ARCID_POKEDEX_GRA)
that tools/paperwhite2/pokedex_evo.py adds (docs/paperwhite2/plugins.md, Pokédex; docs/paperwhite2/design/pokedex-area.md).

    pokedex_area.py check     # how the sheet's tiles fit the palette rows, and each icon's colours

The source is res/paperwhite2/pokedex_art/area_icons.png, 160 by 80: 25 slots of 32 by 16, five a row: the seasons
(spring, summer, autumn, winter, then an empty slot), the times (morning, day, evening, night, late night), the
weather groups (clear, rain, thunderstorm, snow, sandstorm), the methods grass, dark grass, shaking grass, dust cloud,
bridge shadow, and surf, rippling surf, fishing, rippling fishing, then the outbreak's badge (ICON_* in
src/paperwhite2/ov298/paperwhite2_pokedex_info_area.c). Its colours count, not its indices: each is rounded to the
DS's 5 bits an axis, and transparent pixels (alpha below 128) show the panel behind; the user's sheet has
none, its icons on white, which the page's art has under them.

The page draws an icon's 4 by 2 tiles into its window on the sub engine's BG 7, each tile in a palette row of its own,
so the sheet can have more colours than one row holds: its tiles are packed into ICON_ROWS rows of 15 colours (the
page's rows 14, 15 and 12, AREA_ICON_PALETTES in the C file), each tile in a row that has all of its colours. A
season, time or weather the Pokémon isn't met in shows greyed out: a second copy of the first three rows' icons in
light greys, each colour's grey by its luminance (GREY_LEVELS of them, from GREY_DARK to GREY_LIGHT of 31), packed
into the same rows. The member:

- the rows' colours, ICON_ROWS times 16 (BGR555; color 0 unused);
- a byte for each tile of the 25 icons (8 each, in order, the top row of 4 first) with its row, then the same for the
  15 grey icons;
- the 25 icons' tiles (4bpp, 32 bytes each), then the 15 grey icons'.

check fails, and says which icons have the most colours, if the tiles don't fit the rows.
"""
import random
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.paperwhite2.screen_art import read_png  # noqa: E402

ICONS = ROOT / "res" / "paperwhite2" / "pokedex_art" / "area_icons.png"
ICON_WIDTH, ICON_HEIGHT = 32, 16
ICONS_ACROSS, ICONS_DOWN = 5, 5
ICON_COUNT = ICONS_ACROSS * ICONS_DOWN
# The seasons', times' and weathers' icons, which have grey copies
GREY_ICONS = 3 * ICONS_ACROSS
TILE = 8
TILES_PER_ICON = (ICON_WIDTH // TILE) * (ICON_HEIGHT // TILE)
ICON_ROWS = 3
ROW_COLORS = 15
GREY_LEVELS = 8
GREY_DARK, GREY_LIGHT = 13, 27
WHITE = (31, 31, 31)
# Packing is a search over the tiles' orders, from a fixed seed so that the build always packs them the same
PACK_TRIES = 4000
PACK_SEED = 1


class IconError(Exception):
    pass


def to5(color):
    return tuple(round(axis * 31 / 255) for axis in color)


def grey(color):
    """A colour's light grey by its luminance (Rec. 601), one of GREY_LEVELS; white, the sheet's background, stays
    white, so that a grey icon blends into the page's white as a coloured one does."""
    if color == WHITE:
        return color
    r, g, b = color
    luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 31
    level = round(luminance * (GREY_LEVELS - 1))
    value = GREY_DARK + level * (GREY_LIGHT - GREY_DARK) // (GREY_LEVELS - 1)
    return value, value, value


def read_icons():
    """Each icon's tiles, each a list of 64 colours (None where transparent), the grey icons' after the icons'."""
    width, height, pixels = read_png(ICONS)
    if (width, height) != (ICON_WIDTH * ICONS_ACROSS, ICON_HEIGHT * ICONS_DOWN):
        raise IconError(f"{ICONS.name}: {width} by {height}, not {ICON_WIDTH * ICONS_ACROSS} by "
                        f"{ICON_HEIGHT * ICONS_DOWN}")
    icons = []
    for icon in range(ICON_COUNT):
        left, top = icon % ICONS_ACROSS * ICON_WIDTH, icon // ICONS_ACROSS * ICON_HEIGHT
        tiles = []
        for tile in range(TILES_PER_ICON):
            x0 = left + tile % (ICON_WIDTH // TILE) * TILE
            y0 = top + tile // (ICON_WIDTH // TILE) * TILE
            tiles.append([None if pixels[(y0 + y) * width + x0 + x] is None else to5(pixels[(y0 + y) * width + x0 + x])
                          for y in range(TILE) for x in range(TILE)])
        icons.append(tiles)
    greys = [[[None if c is None else grey(c) for c in tile] for tile in icons[i]] for i in range(GREY_ICONS)]
    return icons, greys


def pack(tiles):
    """A row for each tile, and the rows' colours, so that each tile's colours are in its row; None if no order of
    PACK_TRIES fits."""
    sets = sorted({frozenset(c for c in tile if c is not None) for tile in tiles}, key=lambda s: (-len(s), sorted(s)))
    rng = random.Random(PACK_SEED)
    for attempt in range(PACK_TRIES):
        order = list(sets)
        if attempt:
            rng.shuffle(order)
            order.sort(key=lambda s: -len(s) + rng.random() * 2)
        rows = [set() for _ in range(ICON_ROWS)]
        chosen = {}
        for colors in order:
            fits = [r for r in range(ICON_ROWS) if len(rows[r] | colors) <= ROW_COLORS]
            if not fits:
                break
            row = min(fits, key=lambda r: (len(colors - rows[r]), -len(rows[r])))
            rows[row] |= colors
            chosen[colors] = row
        else:
            palettes = [sorted(row) for row in rows]
            return [chosen[frozenset(c for c in tile if c is not None)] for tile in tiles], palettes
    return None


def member():
    icons, greys = read_icons()
    tiles = [tile for icon in icons + greys for tile in icon]
    packed = pack(tiles)
    if packed is None:
        worst = sorted(range(ICON_COUNT), key=lambda i: -len({c for t in icons[i] for c in t if c is not None}))[:5]
        raise IconError(f"{ICONS.name}: its tiles don't fit {ICON_ROWS} palette rows of {ROW_COLORS} colours; the "
                        f"icons with the most colours are slots {', '.join(map(str, worst))}")
    rows, palettes = packed
    out = bytearray()
    for palette in palettes:
        colors = [0] + [r | g << 5 | b << 10 for r, g, b in palette]
        out += struct.pack("<16H", *(colors + [0] * (16 - len(colors))))
    out += bytes(rows)
    for tile, row in zip(tiles, rows):
        index = {c: i + 1 for i, c in enumerate(palettes[row])}
        values = [0 if c is None else index[c] for c in tile]
        out += bytes(values[i] | values[i + 1] << 4 for i in range(0, len(values), 2))
    return bytes(out)


def main():
    if sys.argv[1:] != ["check"]:
        sys.exit(__doc__)
    try:
        data = member()
    except IconError as error:
        sys.exit(f"pokedex_area.py: {error}")
    icons, _ = read_icons()
    counts = [len({c for t in icon for c in t if c is not None}) for icon in icons]
    rows = data[ICON_ROWS * 32:ICON_ROWS * 32 + (ICON_COUNT + GREY_ICONS) * TILES_PER_ICON]
    used = [sum(1 for c in struct.unpack_from("<16H", data, r * 32)[1:] if c) for r in range(ICON_ROWS)]
    print(f"{len(data)} bytes; the rows' colours {used} of {ROW_COLORS}; tiles in each row "
          f"{[rows.count(r) for r in range(ICON_ROWS)]}; each icon's colours {counts}")


if __name__ == "__main__":
    main()
