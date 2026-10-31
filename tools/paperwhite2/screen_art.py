#!/usr/bin/env python3
"""Converts art drawn in an image editor into a 2D screen of the game: a background's tiles (a character PNG), its
screen resource (.nscr) and its palette (.pal) under res/, which the build packs as it packs every graphics archive
(tools/data/graphics_archive.py). The screens it can replace are the targets of
res/paperwhite2/art/targets.json (art_targets.schema.json), each one palette and the screens that use it.

    screen_art.py render TARGET SCREEN OUT.png
    screen_art.py convert TARGET [SCREEN=ART.png ...] [--write] [--preview DIR]

render writes a screen as an indexed PNG in the palette's colors, color 0 transparent, to start new art from.
convert reads each SCREEN's art (any 8-bit RGB or RGBA PNG, or an indexed one), with the target's other screens as
they are, and prints a JSON report: the tiles and palette rows used, and each 8 by 8 tile that can't be drawn. With
--write and no problems it replaces the target's files; with --preview it writes each screen as the DS would show
it, as DIR/SCREEN.png.

The art's colors are what count, not its indices: each color is rounded to the DS's 5 bits an axis, and transparent
pixels (alpha below 128) become color 0, which shows the backdrop or the layer below. In 16-color mode each tile
takes its colors from one palette row of 15 colors and the transparent one: the converter finds a row for every
tile, among the target's rows, reusing a row that has the tile's colors already and leaving the colors that the
target's other screens (and the game's other users of the palette) need where they are. A tile repeated, also
flipped, is stored once. Tile 0 stays blank.
"""
import json
import os
import struct
import sys
import zlib
from pathlib import Path

# The checkout whose res/ it reads and writes: PAPERWHITE_ROOT, as the editor sets it for a copy, or this one
ROOT = Path(os.environ.get("PAPERWHITE_ROOT", Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.nitro_2d import read_palette, unfilter_png, write_indexed_png, write_palette, write_rgba_png  # noqa: E402

TARGETS = ROOT / "res/paperwhite2/art/targets.json"


def to5(color):
    return tuple(round(axis * 31 / 255) for axis in color)


def from5(color):
    return tuple(axis * 255 // 31 for axis in color)


# ---------------------------------------------------------------- Files


def read_png(path):
    """Returns a PNG's width, height and its pixels as (r, g, b) tuples, None where transparent. Indexed, gray, RGB and
    RGBA PNGs of 8 bits a channel read, and indexed ones of 1 to 8 bits a pixel."""
    data = Path(path).read_bytes()
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError(f"{path}: not a PNG")
    cursor, image, plte, trns = 8, bytearray(), b"", b""
    width = height = depth = color = None
    while cursor < len(data):
        size = struct.unpack_from(">I", data, cursor)[0]
        kind = data[cursor + 4:cursor + 8]
        payload = data[cursor + 8:cursor + 8 + size]
        cursor += 12 + size
        if kind == b"IHDR":
            width, height, depth, color, _, _, interlace = struct.unpack(">IIBBBBB", payload)
            if interlace:
                raise ValueError(f"{path}: an interlaced PNG; save it without interlacing")
        elif kind == b"PLTE":
            plte = payload
        elif kind == b"tRNS":
            trns = payload
        elif kind == b"IDAT":
            image.extend(payload)
        elif kind == b"IEND":
            break
    raw = zlib.decompress(image)
    pixels = []
    if color == 3:
        stride = (width * depth + 7) // 8
        rows = unfilter_png(raw, stride, height, 1, path)
        per_byte, mask = 8 // depth, (1 << depth) - 1
        for y in range(height):
            row = rows[y * stride:(y + 1) * stride]
            for x in range(width):
                index = row[x] if depth == 8 else row[x // per_byte] >> (8 - depth * (1 + x % per_byte)) & mask
                alpha = trns[index] if index < len(trns) else 255
                pixels.append(tuple(plte[index * 3:index * 3 + 3]) if alpha >= 128 else None)
        return width, height, pixels
    if depth != 8 or color not in (0, 2, 4, 6):
        raise ValueError(f"{path}: save it as an 8-bit RGB, RGBA or indexed PNG")
    channels = {0: 1, 2: 3, 4: 2, 6: 4}[color]
    rows = unfilter_png(raw, width, height, channels, path)
    for i in range(0, len(rows), channels):
        px = rows[i:i + channels]
        if color in (0, 4):
            rgb, alpha = (px[0],) * 3, px[1] if color == 4 else 255
        else:
            rgb, alpha = tuple(px[:3]), px[3] if color == 6 else 255
        pixels.append(rgb if alpha >= 128 else None)
    return width, height, pixels


def read_chars(path, depth):
    """A character PNG's tiles, each 64 pixel values, and the sheet's width."""
    width, height, pixels = read_indexed(path)
    tiles = []
    for ty in range(height // 8):
        for tx in range(width // 8):
            tiles.append(tuple(pixels[(ty * 8 + y) * width + tx * 8 + x] for y in range(8) for x in range(8)))
    return width, tiles


def read_indexed(path):
    from tools.data.nitro_2d import read_indexed_png
    width, height, pixels, _ = read_indexed_png(Path(path))
    return width, height, pixels


def read_screen(path):
    raw = Path(path).read_bytes()
    if raw[:4] != b"RCSN" or raw[16:20] != b"NRCS":
        raise ValueError(f"{path}: not a screen resource")
    width, height = struct.unpack_from("<HH", raw, 24)
    size = struct.unpack_from("<I", raw, 32)[0]
    return raw, width, height, list(struct.unpack_from(f"<{size // 2}H", raw, 36))


def write_screen(raw, entries):
    return raw[:36] + struct.pack(f"<{len(entries)}H", *entries) + raw[36 + 2 * len(entries):]


def load_target(name):
    targets = json.loads(TARGETS.read_text())["targets"]
    for target in targets:
        if target["name"] == name:
            return target
    raise SystemExit(f"no target {name!r} in {TARGETS.relative_to(ROOT)}")


# ---------------------------------------------------------------- Tiles


def flipped(tile, flip):
    if not flip:
        return tile
    out = []
    for y in range(8):
        sy = 7 - y if flip & 2 else y
        for x in range(8):
            out.append(tile[sy * 8 + (7 - x if flip & 1 else x)])
    return tuple(out)


class Sheet:
    """A character sheet being built: each tile stored once, in any of its four flips, tile 0 blank."""

    def __init__(self):
        self.tiles = [(0,) * 64]
        self.index = {(0,) * 64: (0, 0)}

    def add(self, tile):
        """Returns the tile's index and the flip (bit 0 horizontal, bit 1 vertical) that draws it."""
        for flip in range(4):
            found = self.index.get(flipped(tile, flip))
            if found is not None:
                return found[0], flip ^ found[1]
        self.tiles.append(tile)
        self.index[tile] = (len(self.tiles) - 1, 0)
        return len(self.tiles) - 1, 0


def screen_tiles(entries, width, tiles):
    """The tiles a screen shows, each as its displayed pixels (local values) with its palette row."""
    shown = []
    for entry in entries:
        index, flip, row = entry & 0x3FF, entry >> 10 & 3, entry >> 12
        shown.append((flipped(tiles[index] if index < len(tiles) else (0,) * 64, flip), row))
    return shown


# ---------------------------------------------------------------- Converting


def convert(target, art, write=False, preview=None):
    depth = target["depth"]
    row_size = 16 if depth == 4 else 256
    palette_path = ROOT / target["palette"]
    colors = [tuple(c) for c in read_palette(palette_path)] if palette_path.exists() else []
    count = len(colors)
    new_palette = not palette_path.exists()
    if new_palette:
        count = target.get("colors", row_size)
        colors = [(0, 0, 0)] * count
    rows = target.get("rows", list(range(count // row_size)) if depth == 4 else [0])
    report = {"target": target["name"], "screens": {}, "problems": [], "warnings": []}

    # The slots of each row the art may not change: those the target's kept screens show, and colors 0
    locked = {row: {0} for row in rows}
    groups = {}
    for screen in target["screens"]:
        groups.setdefault(screen["chars"], []).append(screen)
    loaded = {}
    for chars, screens in groups.items():
        chars_path = ROOT / chars
        sheet_width, tiles = read_chars(chars_path, depth) if chars_path.exists() else (256, [(0,) * 64])
        for screen in screens:
            raw, width, height, entries = read_screen(ROOT / screen["screen"])
            loaded[screen["name"]] = (raw, width, height, entries)
            if screen["name"] not in art:
                for tile, row in screen_tiles(entries, width, tiles):
                    if row in locked:
                        locked[row].update(tile)
        loaded[chars] = (sheet_width, tiles)
    slots = {row: {} for row in rows}  # color5 -> slot, for the colors each row holds
    for row in rows:
        for slot in range(row_size):
            index = row * row_size + slot if depth == 4 else slot
            if slot in locked[row] and slot != 0 and index < count:
                slots[row].setdefault(to5(colors[index]), slot)
    assigned = {row: dict() for row in rows}  # slot -> color5 newly placed

    def free_slots(row):
        used = set(locked[row]) | set(assigned[row])
        return [s for s in range(1, row_size) if s not in used and (row * row_size + s if depth == 4 else s) < count]

    # Each replaced screen's tiles, as sets of colors
    art_tiles = {}
    for name, path in art.items():
        if name not in loaded:
            raise SystemExit(f"{target['name']} has no screen {name!r}")
        _, width, height, _ = loaded[name]
        aw, ah, pixels = read_png(path)
        if aw != width or ah > height or ah % 8:
            report["problems"].append({"screen": name, "message": f"the art is {aw} by {ah}; this screen is {width} by "
                                       f"{height} (or {width} by 192 for a full DS screen)"})
            continue
        cells = []
        for ty in range(height // 8):
            for tx in range(width // 8):
                if ty * 8 >= ah:
                    cells.append(None)
                    continue
                cells.append([pixels[(ty * 8 + y) * aw + tx * 8 + x] for y in range(8) for x in range(8)])
        art_tiles[name] = (width, cells)

    # A row for each tile, the tiles with the most colors first
    placements = {}
    order = []
    for name, (width, cells) in art_tiles.items():
        for i, cell in enumerate(cells):
            if cell is None:
                continue
            needed = {to5(p) for p in cell if p is not None}
            order.append((len(needed), name, i, needed))
    order.sort(key=lambda item: -item[0])
    for _, name, i, needed in order:
        width = art_tiles[name][0]
        where = {"screen": name, "x": i % (width // 8) * 8, "y": i // (width // 8) * 8}
        if len(needed) > row_size - 1:
            report["problems"].append({**where, "message": f"{len(needed)} colors in one tile; a tile can have {row_size - 1}"})
            continue
        best = None
        for row in rows:
            missing = [c for c in needed if c not in slots[row]]
            if len(missing) <= len(free_slots(row)) and (best is None or len(missing) < best[1]):
                best = (row, len(missing))
        if best is None:
            report["problems"].append({**where, "message": "its colors don't fit in any free palette row"})
            continue
        row = best[0]
        for c in needed:
            if c not in slots[row]:
                slot = free_slots(row)[0]
                slots[row][c] = slot
                assigned[row][slot] = c
        placements[(name, i)] = row

    # The sheets and screens
    outputs = {}
    for chars, screens in groups.items():
        sheet_width, old_tiles = loaded[chars]
        sheet = Sheet()
        new_entries = {}
        for screen in screens:
            raw, width, height, entries = loaded[screen["name"]]
            out = []
            if screen["name"] in art_tiles:
                for i, cell in enumerate(art_tiles[screen["name"]][1]):
                    row = placements.get((screen["name"], i))
                    if cell is None or row is None:
                        out.append(0)
                        continue
                    tile = tuple(0 if p is None else slots[row][to5(p)] for p in cell)
                    index, flip = sheet.add(tile)
                    out.append(index | flip << 10 | (row if depth == 4 else 0) << 12)
            else:
                for (tile, row) in screen_tiles(entries, width, old_tiles):
                    index, flip = sheet.add(tile)
                    out.append(index | flip << 10 | row << 12)
            new_entries[screen["name"]] = out
        limit = min(target.get("max_tiles", 1024), 1024)
        for screen in screens:
            report["screens"][screen["name"]] = {"tiles": len(sheet.tiles), "max_tiles": limit,
                                                 "rows": sorted({e >> 12 for e in new_entries[screen["name"]]})}
        if len(sheet.tiles) > limit:
            report["problems"].append({"screen": screens[0]["name"],
                                       "message": f"{len(sheet.tiles)} different tiles; this screen holds {limit}"})
        outputs[chars] = (sheet_width, sheet, new_entries)

    for row in rows:
        for slot, c in assigned[row].items():
            colors[row * row_size + slot if depth == 4 else slot] = from5(c)
    report["rows_changed"] = sorted(row for row in rows if assigned[row])
    report["ok"] = not report["problems"]

    if preview:
        Path(preview).mkdir(parents=True, exist_ok=True)
        for chars, (sheet_width, sheet, new_entries) in outputs.items():
            for name, entries in new_entries.items():
                _, width, height, _ = loaded[name]
                shown_height = min(height, 192)
                (Path(preview) / f"{name}.png").write_bytes(
                    draw(entries, sheet.tiles, width, shown_height, colors, depth))
    if write and report["ok"]:
        for chars, (sheet_width, sheet, new_entries) in outputs.items():
            per_row = sheet_width // 8
            sheet_height = (len(sheet.tiles) + per_row - 1) // per_row * 8
            pixels = bytearray(sheet_width * sheet_height)
            for t, tile in enumerate(sheet.tiles):
                tx, ty = t % per_row * 8, t // per_row * 8
                for y in range(8):
                    pixels[(ty + y) * sheet_width + tx:(ty + y) * sheet_width + tx + 8] = bytes(tile[y * 8:y * 8 + 8])
            preview_colors = colors[:16] if depth == 4 else colors[:256]
            (ROOT / chars).parent.mkdir(parents=True, exist_ok=True)
            (ROOT / chars).write_bytes(write_indexed_png(sheet_width, sheet_height, bytes(pixels), preview_colors))
            for screen in groups[chars]:
                raw = loaded[screen["name"]][0]
                (ROOT / screen["screen"]).write_bytes(write_screen(raw, new_entries[screen["name"]]))
        palette_path.write_text(write_palette(colors))
        report["written"] = True
    return report


def draw(entries, tiles, width, height, colors, depth):
    image = bytearray(width * height * 4)
    for i, entry in enumerate(entries[:(width // 8) * (height // 8)]):
        index, flip, row = entry & 0x3FF, entry >> 10 & 3, entry >> 12
        tile = flipped(tiles[index] if index < len(tiles) else (0,) * 64, flip)
        sx, sy = i % (width // 8) * 8, i // (width // 8) * 8
        for p, value in enumerate(tile):
            color = colors[(row * 16 if depth == 4 else 0) + value] if value else (colors[0] if colors else (0, 0, 0))
            o = ((sy + p // 8) * width + sx + p % 8) * 4
            image[o:o + 4] = bytes((*color, 255))
    return write_rgba_png(width, height, bytes(image))


def render(target, name, out):
    """A screen as an indexed PNG in the palette's colors, the transparent color 0 marked so in its tRNS."""
    depth = target["depth"]
    screen = next(s for s in target["screens"] if s["name"] == name)
    colors = [tuple(c) for c in read_palette(ROOT / target["palette"])]
    _, tiles = read_chars(ROOT / screen["chars"], depth)
    _, width, height, entries = read_screen(ROOT / screen["screen"])
    height = min(height, 192)
    pixels = bytearray(width * height)
    for i, (tile, row) in enumerate(screen_tiles(entries[:(width // 8) * (height // 8)], width, tiles)):
        sx, sy = i % (width // 8) * 8, i // (width // 8) * 8
        for p, value in enumerate(tile):
            pixels[(sy + p // 8) * width + sx + p % 8] = (row * 16 + value if depth == 4 else value) if value else 0
    png = bytearray(write_indexed_png(width, height, bytes(pixels), colors[:256] + [(0, 0, 0)] * (256 - len(colors))))
    # tRNS after PLTE: color 0 transparent
    at = png.index(b"IDAT") - 4
    trns = struct.pack(">I", 1) + b"tRNS" + b"\0" + struct.pack(">I", zlib.crc32(b"tRNS\0"))
    Path(out).write_bytes(bytes(png[:at] + trns + png[at:]))


def main():
    args = sys.argv[1:]
    if len(args) >= 4 and args[0] == "render":
        render(load_target(args[1]), args[2], args[3])
        return
    if len(args) >= 2 and args[0] == "convert":
        target = load_target(args[1])
        art, write, preview = {}, False, None
        rest = args[2:]
        while rest:
            arg = rest.pop(0)
            if arg == "--write":
                write = True
            elif arg == "--preview":
                preview = rest.pop(0)
            else:
                name, _, path = arg.partition("=")
                art[name] = path
        report = convert(target, art, write, preview)
        print(json.dumps(report, indent=2))
        sys.exit(0 if report["ok"] else 1)
    raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
