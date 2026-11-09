#!/usr/bin/env python3
"""Paper White 2: the Pokédex Info page's Area icons, a member of the Pokédex's graphics archive (ARCID_POKEDEX_GRA)
that tools/paperwhite2/pokedex_evo.py adds (docs/paperwhite2/plugins.md, Pokédex; docs/paperwhite2/design/pokedex-area.md),
and the top screen's box of the current Pokémon, another (box_member, below).

    pokedex_area.py check [PNG] [--preview OUT]
        # how the sheet's icons (area_icons.png, or another sheet such as the editor's import) fit the palette rows,
        # and each icon's colours; with --preview, OUT is the sheet as the page shows it (on the panels' grey, the
        # colours rounded to the DS's) over its grey copies, 160 by 160

The source is res/paperwhite2/pokedex_art/area_icons.png, 160 by 80: 25 slots of 32 by 16, five a row: the seasons
(spring, summer, autumn, winter, then the two 16 by 16 special marks, the left one drawn left of a method's icon and
the right one right of it), the times (morning, day, evening, night, late night), the weather groups (clear, rain,
thunderstorm, snow, sandstorm), the walking terrains grass, dark grass, cave floor, sand, bridge, and surf, puddle,
fishing, walking (where a row's terrains differ), then an unused slot (ICON_* in
src/paperwhite2/ov298/paperwhite2_pokedex_info_area.c). Its colours count, not its indices: each is rounded to the
DS's 5 bits an axis, and transparent pixels (alpha below 128) show the page's art behind.

The page shows each icon as a sub engine OBJ of 32 by 16 at its exact place, its clear pixels (index 0) showing
the page's art, so each icon's colours must fit one OBJ palette row of 15: the icons are packed whole into ICON_ROWS
rows (the page's sub OBJ rows 14, 15 and 4, sIconObjRows in the C file), each icon in a row that has all of its
colours. The special marks' slot becomes two icons, the left mark (the slot's left half) in the slot and the right
mark (its right half) after the 25 slots, each in its icon's left half with the right half clear. A season, time or
weather the Pokémon isn't met in shows greyed out, and so does a row's icon where it is met only by the row's special
version: a second copy of every icon in very light greys, each colour's grey by its luminance (GREY_LEVELS of them,
from GREY_DARK to GREY_LIGHT of 31, just below the panels' 29, so that a grey icon is barely there: disabled, not a
grey icon), its clear pixels clear, packed into the same rows. The member:

- the rows' colours, ICON_ROWS times 16 (BGR555; color 0 unused);
- a byte for each of the 26 icons with its row, then the same for the 26 grey icons;
- the 26 icons' tiles (8 each, 4bpp, 32 bytes each, the top row of 4 first: a 32 by 16 OBJ's in 1D mapping), then
  the 26 grey icons'.

check fails, and names the icons that have more colours than a row or else the ones with the most, if the icons don't
fit the rows.

The box is res/paperwhite2/pokedex_art/area_top_box.png, a whole top screen (256 by 192, indexed in 16 colours or
fewer, index 0 transparent) with the box's pixels in BOX_X to the right edge and BOX_Y to BOX_Y + BOX_HEIGHT - 1, and
none outside it: the page cuts that 128 by 32 into four OBJs of 32 by 32 in main OBJ row 13 and prints the
Pokémon's name over it in the art's own colours (BOX_COLOR_* in the C file). Its member: the art's 16 colours (BGR555,
32 bytes), then the 128 by 32's 64 tiles (4bpp, 32 bytes each), 16 across, in rows, the GFL bitmap's order.
"""
import random
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.nitro_2d import read_indexed_png, write_rgba_png  # noqa: E402
from tools.paperwhite2.screen_art import read_png  # noqa: E402

ICONS = ROOT / "res" / "paperwhite2" / "pokedex_art" / "area_icons.png"
BOX = ROOT / "res" / "paperwhite2" / "pokedex_art" / "area_top_box.png"
# BOX_OBJ_X and BOX_OBJ_Y in paperwhite2_pokedex_info_area.c, and the screen's size
BOX_X, BOX_Y, BOX_WIDTH, BOX_HEIGHT = 128, 0, 128, 32
SCREEN_WIDTH, SCREEN_HEIGHT = 256, 192
ICON_WIDTH, ICON_HEIGHT = 32, 16
ICONS_ACROSS, ICONS_DOWN = 5, 5
ICON_COUNT = ICONS_ACROSS * ICONS_DOWN
# The special marks' slot: its left half is the left mark, and the right mark is an icon of its own after the slots
SPECIAL_SLOT = 4
MARK_WIDTH = ICON_WIDTH // 2
IMAGE_COUNT = ICON_COUNT + 1
TILE = 8
TILES_PER_ICON = (ICON_WIDTH // TILE) * (ICON_HEIGHT // TILE)
ICON_ROWS = 3
ROW_COLORS = 15
GREY_LEVELS = 4
GREY_DARK, GREY_LIGHT = 22, 27
WHITE = (31, 31, 31)
# The panels' grey behind the icons (info_area.png's), for the preview
PANEL = (29, 29, 29)
# The slots' names, by rows (ICON_* in the C file)
ICON_NAMES = ("spring", "summer", "autumn", "winter", "special marks", "morning", "day", "evening", "night",
              "late night", "clear", "rain", "thunderstorm", "snow", "sandstorm", "grass", "dark grass", "cave floor",
              "sand", "bridge", "surf", "puddle", "fishing", "walking", "unused")
# Packing is a search over the tiles' orders, from a fixed seed so that the build always packs them the same
PACK_TRIES = 4000
PACK_SEED = 1


class IconError(Exception):
    pass


def to5(color):
    return tuple(round(axis * 31 / 255) for axis in color)


def grey(color):
    """A colour's very light grey by its luminance (Rec. 601), one of GREY_LEVELS, darker colours darker; white, the
    sheet's background, stays white, so that a grey icon blends into the page's white as a coloured one does."""
    if color == WHITE:
        return color
    r, g, b = color
    luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 31
    level = round(luminance * (GREY_LEVELS - 1))
    value = GREY_DARK + level * (GREY_LIGHT - GREY_DARK) // (GREY_LEVELS - 1)
    return value, value, value


def read_sheet(path=ICONS):
    """The sheet's width, height and pixels as read_png reads them, checked for its size."""
    try:
        width, height, pixels = read_png(path)
    except (ValueError, OSError) as error:
        raise IconError(str(error)) from error
    if (width, height) != (ICON_WIDTH * ICONS_ACROSS, ICON_HEIGHT * ICONS_DOWN):
        raise IconError(f"{Path(path).name}: {width} by {height}, not {ICON_WIDTH * ICONS_ACROSS} by "
                        f"{ICON_HEIGHT * ICONS_DOWN}")
    return width, height, pixels


def read_icons(path=ICONS):
    """Each icon's pixels, 32 by 16 colours by rows (None where transparent): the slots', the left mark in the special
    marks' slot and the right mark after them; and the grey icons' in the same order."""
    width, height, pixels = read_sheet(path)

    def color(x, y):
        return None if pixels[y * width + x] is None else to5(pixels[y * width + x])

    def slot(index, column=0, columns=ICON_WIDTH):
        left, top = index % ICONS_ACROSS * ICON_WIDTH, index // ICONS_ACROSS * ICON_HEIGHT
        return [color(left + column + x, top + y) if x < columns else None
                for y in range(ICON_HEIGHT) for x in range(ICON_WIDTH)]

    icons = [slot(i, 0, MARK_WIDTH) if i == SPECIAL_SLOT else slot(i) for i in range(ICON_COUNT)]
    icons.append(slot(SPECIAL_SLOT, MARK_WIDTH, MARK_WIDTH))
    greys = [[None if c is None else grey(c) for c in icon] for icon in icons]
    return icons, greys


def tiles(icon):
    """An icon's 8 tiles in a 32 by 16 OBJ's order, the top row's 4 first, each 64 colours by rows."""
    across = ICON_WIDTH // TILE
    return [[icon[(tile // across * TILE + y) * ICON_WIDTH + tile % across * TILE + x]
             for y in range(TILE) for x in range(TILE)] for tile in range(TILES_PER_ICON)]


def pack(icons):
    """A row for each icon, and the rows' colours, so that each icon's colours are in its row; None if no order of
    PACK_TRIES fits."""
    sets = sorted({frozenset(c for c in icon if c is not None) for icon in icons}, key=lambda s: (-len(s), sorted(s)))
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
            return [chosen[frozenset(c for c in icon if c is not None)] for icon in icons], palettes
    return None


def icon_name(index):
    return ("left mark", "right mark")[index == ICON_COUNT] if index in (SPECIAL_SLOT, ICON_COUNT) else ICON_NAMES[index]


def member(path=ICONS):
    icons, greys = read_icons(path)
    images = icons + greys
    packed = pack(images)
    if packed is None:
        counts = [len({c for c in icon if c is not None}) for icon in icons]
        over = [i for i in range(IMAGE_COUNT) if counts[i] > ROW_COLORS]
        worst = over or sorted(range(IMAGE_COUNT), key=lambda i: -counts[i])[:5]
        names = ", ".join(f"{icon_name(i)} ({counts[i]})" for i in worst)
        raise IconError(f"{Path(path).name}: its icons don't fit {ICON_ROWS} palette rows of {ROW_COLORS} colours "
                        f"with their grey copies; " + (f"these have more than {ROW_COLORS}: {names}" if over else
                        f"the icons with the most colours: {names}; fewer colours in all, or icons sharing theirs, "
                        f"fit better"))
    rows, palettes = packed
    out = bytearray()
    for palette in palettes:
        colors = [0] + [r | g << 5 | b << 10 for r, g, b in palette]
        out += struct.pack("<16H", *(colors + [0] * (16 - len(colors))))
    out += bytes(rows)
    for image, row in zip(images, rows):
        index = {c: i + 1 for i, c in enumerate(palettes[row])}
        for tile in tiles(image):
            values = [0 if c is None else index[c] for c in tile]
            out += bytes(values[i] | values[i + 1] << 4 for i in range(0, len(values), 2))
    return bytes(out)


def box_member():
    """The box's colours and tiles, from area_top_box.png."""
    try:
        width, height, pixels, colors = read_indexed_png(BOX)
    except ValueError as error:
        raise IconError(str(error)) from error
    if (width, height) != (SCREEN_WIDTH, SCREEN_HEIGHT) or max(pixels) > 15:
        raise IconError(f"{BOX.name}: must be {SCREEN_WIDTH} by {SCREEN_HEIGHT}, indexed in 16 colours")
    for i, value in enumerate(pixels):
        x, y = i % width, i // width
        if value and not (BOX_X <= x < BOX_X + BOX_WIDTH and BOX_Y <= y < BOX_Y + BOX_HEIGHT):
            raise IconError(f"{BOX.name}: a pixel at x {x}, y {y}, outside the box's x {BOX_X}-{BOX_X + BOX_WIDTH - 1}, "
                            f"y {BOX_Y}-{BOX_Y + BOX_HEIGHT - 1}")
    out = bytearray()
    colors5 = [to5(c) for c in (list(colors) + [(0, 0, 0)] * 16)[:16]]
    out += struct.pack("<16H", *(r | g << 5 | b << 10 for r, g, b in colors5))
    for tile_y in range(BOX_Y, BOX_Y + BOX_HEIGHT, TILE):
        for tile_x in range(BOX_X, BOX_X + BOX_WIDTH, TILE):
            for y in range(TILE):
                row = pixels[(tile_y + y) * width + tile_x:(tile_y + y) * width + tile_x + TILE]
                out += bytes(row[i] | row[i + 1] << 4 for i in range(0, TILE, 2))
    return bytes(out)


def preview(path, out):
    """Writes the sheet as the page shows it, on the panels' grey in the DS's colours, over its grey copies."""
    width, height, pixels = read_sheet(path)
    rgba = bytearray()
    for convert in (lambda c: c, grey):
        for c in pixels:
            r, g, b = convert(to5(c)) if c is not None else PANEL
            rgba += bytes((r * 255 // 31, g * 255 // 31, b * 255 // 31, 255))
    Path(out).write_bytes(write_rgba_png(width, height * 2, bytes(rgba)))


def main():
    args = sys.argv[1:]
    out = None
    if "--preview" in args and args.index("--preview") + 1 < len(args):
        at = args.index("--preview")
        out = args[at + 1]
        del args[at:at + 2]
    if not args or args[0] != "check" or len(args) > 2:
        sys.exit(__doc__)
    path = Path(args[1]) if len(args) == 2 else ICONS
    try:
        if out:
            preview(path, out)
        data = member(path)
    except IconError as error:
        sys.exit(f"pokedex_area.py: {error}")
    icons, _ = read_icons(path)
    counts = [len({c for c in icon if c is not None}) for icon in icons]
    rows = data[ICON_ROWS * 32:ICON_ROWS * 32 + 2 * IMAGE_COUNT]
    used = [sum(1 for c in struct.unpack_from("<16H", data, r * 32)[1:] if c) for r in range(ICON_ROWS)]
    box = box_member()
    print(f"box: {len(box)} bytes")
    print(f"{len(data)} bytes; the rows' colours {used} of {ROW_COLORS}; icons in each row "
          f"{[rows.count(r) for r in range(ICON_ROWS)]}; each icon's colours {counts}")


if __name__ == "__main__":
    main()
