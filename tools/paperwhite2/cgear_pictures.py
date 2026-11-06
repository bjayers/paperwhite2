#!/usr/bin/env python3
"""The C-Gear's background pictures: imports them into res/paperwhite2/cgear_pictures/ and packs them into the C-Gear's
archive.

A picture is what a downloaded C-Gear skin was, a .cgb file: 255 tiles of 4bpp, a 16-color palette (color 0
transparent) and a 32 by 24 screen of them (CGearPictureSave, 0x2600 bytes), which the C-Gear shows over its rings,
blended. The hack's help button cycles through them (src/ov079/c_gear_sw.c, CGearSw_ShowPicture). Each is kept as an
indexed 256 by 192 PNG of at most 16 colors and 255 distinct tiles (a tile and its flips count once), in the order
pictures.json lists them.

    cgear_pictures.py import FILE NAME      # a .cgb, or a PNG of any colors 256 by 192 (transparent where see-through)
    cgear_pictures.py export NAME FILE.cgb
    cgear_pictures.py archive IN OUT        # the build: the C-Gear's archive with the pictures after its members

Importing a PNG with more colors takes the 15 most representative (median cut), and with more than 255 distinct
tiles merges the most alike ones until it has 255, so it may lose detail; the PNG written is what the game shows.
"""

import argparse
import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
# map_texture_data imports its siblings by name
sys.path.insert(1, str(Path(__file__).resolve().parents[2] / "tools" / "data"))
from tools.data.map_texture_data import decode_png  # noqa: E402
from tools.data.narc import read_narc, write_narc  # noqa: E402
from tools.data.nitro_2d import read_indexed_png, write_indexed_png  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PICTURES = ROOT / "res" / "paperwhite2" / "cgear_pictures"
LIST = PICTURES / "pictures.json"
WIDTH, HEIGHT = 256, 192
TILES_ACROSS, TILES_DOWN = WIDTH // 8, HEIGHT // 8
TILE_MAX = 255
PICTURE_SIZE = 0x2600
CHARS_SIZE = TILE_MAX * 32
# The C-Gear archive's members before the pictures (PICTURE_FIRST_MEMBER)
ARCHIVE_MEMBERS = 31
# The screen palette the C-Gear shows the picture in
SCREEN_PALETTE = 13


class PictureError(Exception):
    pass


def to_555(color):
    r, g, b = color
    return (r >> 3) | (g >> 3) << 5 | (b >> 3) << 10


def from_555(value):
    return tuple(((value >> shift) & 31) << 3 | ((value >> shift) & 31) >> 2 for shift in (0, 5, 10))


def tiles_of(pixels):
    """Returns the picture's tiles, each 64 palette indices, in screen order."""
    return [tuple(pixels[(ty * 8 + y) * WIDTH + tx * 8 + x] for y in range(8) for x in range(8))
            for ty in range(TILES_DOWN) for tx in range(TILES_ACROSS)]


def flips(tile):
    """A tile's four orientations: as it is, flipped across, flipped down and both, by their screen flip bits."""
    rows = [tile[y * 8:y * 8 + 8] for y in range(8)]
    across = tuple(v for row in rows for v in reversed(row))
    down = tuple(v for row in reversed(rows) for v in row)
    both = tuple(v for row in reversed(rows) for v in reversed(row))
    return [(tile, 0), (across, 1), (down, 2), (both, 3)]


def unique_tiles(tiles):
    """Returns the distinct tiles, and each screen tile as (index, flip bits)."""
    found = {}
    distinct = []
    screen = []
    for tile in tiles:
        for oriented, flip in flips(tile):
            if oriented in found:
                screen.append((found[oriented], flip))
                break
        else:
            found[tile] = len(distinct)
            distinct.append(tile)
            screen.append((len(distinct) - 1, 0))
    return distinct, screen


def pack_picture(pixels, colors):
    """Returns a picture's 0x2600 bytes from its indexed pixels and its 16 colors."""
    distinct, screen = unique_tiles(tiles_of(pixels))
    if len(distinct) > TILE_MAX:
        raise PictureError(f"has {len(distinct)} distinct tiles, more than {TILE_MAX}")
    chars = bytearray(CHARS_SIZE)
    for index, tile in enumerate(distinct):
        for i in range(0, 64, 2):
            chars[index * 32 + i // 2] = tile[i] | tile[i + 1] << 4
    palette = b"".join(struct.pack("<H", to_555(color)) for color in (list(colors) + [(0, 0, 0)] * 16)[:16])
    entries = b"".join(struct.pack("<H", index | flip << 10 | SCREEN_PALETTE << 12) for index, flip in screen)
    data = bytes(chars) + palette + entries
    assert len(data) == PICTURE_SIZE
    return data


def unpack_picture(data):
    """Returns a picture's indexed pixels and 16 colors."""
    if len(data) != PICTURE_SIZE:
        raise PictureError(f"is {len(data)} bytes, not a C-Gear skin's {PICTURE_SIZE}")
    colors = [from_555(struct.unpack_from("<H", data, CHARS_SIZE + i * 2)[0]) for i in range(16)]
    pixels = bytearray(WIDTH * HEIGHT)
    for cell in range(TILES_ACROSS * TILES_DOWN):
        entry = struct.unpack_from("<H", data, 0x2000 + cell * 2)[0]
        tile, hflip, vflip = entry & 0x3FF, entry >> 10 & 1, entry >> 11 & 1
        if tile >= TILE_MAX:
            continue
        tx, ty = cell % TILES_ACROSS * 8, cell // TILES_ACROSS * 8
        for y in range(8):
            for x in range(8):
                byte = data[tile * 32 + (7 - y if vflip else y) * 4 + (7 - x if hflip else x) // 2]
                value = byte >> 4 if (7 - x if hflip else x) & 1 else byte & 15
                pixels[(ty + y) * WIDTH + tx + x] = value
    return bytes(pixels), colors


def median_cut(colors, count):
    """Returns at most count colors standing for the given ones (each a color and how many pixels have it)."""
    boxes = [colors]
    while len(boxes) < count:
        boxes.sort(key=lambda box: max(max(c[0][i] for c in box) - min(c[0][i] for c in box) for i in range(3))
                   if len(box) > 1 else -1)
        box = boxes.pop()
        if len(box) < 2:
            boxes.append(box)
            break
        axis = max(range(3), key=lambda i: max(c[0][i] for c in box) - min(c[0][i] for c in box))
        box.sort(key=lambda c: c[0][axis])
        total = sum(n for _, n in box)
        running = 0
        for split, (_, n) in enumerate(box):
            running += n
            if running * 2 >= total:
                break
        split = max(1, min(split + 1, len(box) - 1))
        boxes += [box[:split], box[split:]]
    return [tuple(round(sum(c[i] * n for c, n in box) / sum(n for _, n in box)) for i in range(3))
            for box in boxes]


def quantize(rgba):
    """Returns indexed pixels and 16 colors (0 transparent) for RGBA pixels."""
    counts = {}
    for i in range(0, len(rgba), 4):
        if rgba[i + 3] >= 128:
            color = from_555(to_555(rgba[i:i + 3]))
            counts[color] = counts.get(color, 0) + 1
    palette = list(counts) if len(counts) <= 15 else median_cut(list(counts.items()), 15)
    palette = [from_555(to_555(color)) for color in palette]
    nearest = {}
    pixels = bytearray(WIDTH * HEIGHT)
    for p in range(WIDTH * HEIGHT):
        if rgba[p * 4 + 3] < 128:
            continue
        color = from_555(to_555(rgba[p * 4:p * 4 + 3]))
        if color not in nearest:
            nearest[color] = 1 + min(range(len(palette)),
                                     key=lambda i: sum((a - b) ** 2 for a, b in zip(color, palette[i])))
        pixels[p] = nearest[color]
    return bytes(pixels), [(0, 0, 0)] + palette


def reduce_tiles(pixels, colors):
    """Merges the most alike distinct tiles until there are at most 255, and returns the pixels."""
    tiles = tiles_of(pixels)
    distinct, screen = unique_tiles(tiles)
    if len(distinct) <= TILE_MAX:
        return pixels
    cost = [[sum((a - b) ** 2 for a, b in zip(colors[i], colors[j])) + (1 << 16 if (i == 0) != (j == 0) else 0)
             for j in range(16)] for i in range(16)]
    uses = [0] * len(distinct)
    for index, _ in screen:
        uses[index] += 1
    pairs = []
    for i in range(len(distinct)):
        a = distinct[i]
        for j in range(i + 1, len(distinct)):
            b = distinct[j]
            pairs.append((sum(cost[x][y] for x, y in zip(a, b)) * min(uses[i], uses[j]), i, j))
    pairs.sort()
    parent = list(range(len(distinct)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    groups = len(distinct)
    for _, i, j in pairs:
        if groups <= TILE_MAX:
            break
        a, b = find(i), find(j)
        if a != b:
            # The more used tile stands for both
            keep, drop = (a, b) if uses[a] >= uses[b] else (b, a)
            parent[drop] = keep
            uses[keep] += uses[drop]
            groups -= 1
    out = bytearray(pixels)
    for cell, (index, flip) in enumerate(screen):
        tile = dict((f, t) for t, f in flips(distinct[find(index)]))[flip]
        tx, ty = cell % TILES_ACROSS * 8, cell // TILES_ACROSS * 8
        for y in range(8):
            out[(ty + y) * WIDTH + tx:(ty + y) * WIDTH + tx + 8] = bytes(tile[y * 8:y * 8 + 8])
    return bytes(out)


def read_png_image(path):
    """Returns a PNG's indexed pixels and 16 colors, quantizing a truecolor or larger-palette one."""
    data = path.read_bytes()
    width, height, color_type = struct.unpack_from(">IIxB", data, 16)
    if (width, height) != (WIDTH, HEIGHT):
        raise PictureError(f"is {width}x{height}, not {WIDTH}x{HEIGHT}")
    if color_type == 3:
        _, _, pixels, colors = read_indexed_png(path)
        if max(pixels) < 16 and len(colors) <= 16:
            return bytes(pixels), [from_555(to_555(c)) for c in colors] + [(0, 0, 0)] * (16 - len(colors))
        transparent = 0
        rgba = bytearray()
        for v in pixels:
            rgba += bytes((*colors[v], 0 if v == transparent else 255))
        return quantize(rgba)
    return quantize(decode_png(data, WIDTH, HEIGHT, str(path)))


def load_list():
    return json.loads(LIST.read_text())["pictures"] if LIST.exists() else []


def save_list(names):
    LIST.write_text(json.dumps({"pictures": names}, indent=2) + "\n")


def import_picture(source, name):
    if source.suffix.lower() == ".cgb":
        pixels, colors = unpack_picture(source.read_bytes())
    else:
        pixels, colors = read_png_image(source)
        pixels = reduce_tiles(pixels, colors)
    PICTURES.mkdir(parents=True, exist_ok=True)
    (PICTURES / f"{name}.png").write_bytes(write_indexed_png(WIDTH, HEIGHT, pixels, colors))
    names = load_list()
    if name not in names:
        names.append(name)
        save_list(names)
    distinct, _ = unique_tiles(tiles_of(pixels))
    print(f"Imported {name}: {len(distinct)} tiles of {TILE_MAX}")


def picture_bytes(name):
    path = PICTURES / f"{name}.png"
    width, height, pixels, colors = read_indexed_png(path)
    if (width, height) != (WIDTH, HEIGHT) or max(pixels) >= 16:
        raise PictureError(f"{path}: must be a {WIDTH}x{HEIGHT} PNG of 16 colors")
    try:
        return pack_picture(pixels, colors)
    except PictureError as error:
        raise PictureError(f"{path}: {error}") from None


def archive(source, output):
    files = read_narc(source.read_bytes())
    if len(files) != ARCHIVE_MEMBERS:
        raise PictureError(f"{source}: {len(files)} members, not the C-Gear archive's {ARCHIVE_MEMBERS}")
    files += [picture_bytes(name) for name in load_list()]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(write_narc(files))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("import")
    command.add_argument("source", type=Path)
    command.add_argument("name")
    command = commands.add_parser("export")
    command.add_argument("name")
    command.add_argument("output", type=Path)
    command = commands.add_parser("archive")
    command.add_argument("source", type=Path)
    command.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "import":
            import_picture(args.source, args.name)
        elif args.command == "export":
            args.output.write_bytes(picture_bytes(args.name))
        else:
            archive(args.source, args.output)
    except PictureError as error:
        sys.exit(f"cgear_pictures.py: {error}")


if __name__ == "__main__":
    main()
