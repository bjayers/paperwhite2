"""Exports the C-Gear's sprite pieces as PNGs to edit, and imports them back into res/graphics/c_gear.

The C-Gear's sprites are tiles in sheets four tiles wide (16.png for the clock, battery, buttons and lamps, and 19-28.png
for the five skins of each gender, which hold the five markers), cut up by cells (17.ncer for 16.png,
29.ncer for the skins). A sheet stores each object's tiles in a row, so an object narrower than the sheet comes out
scrambled. This tool writes each object of the cells as its own PNG, as it shows in game and in its palette row (14.pal,
the boy's; the girl's 15.pal differs in color only), and a preview of each cell with its objects stacked. Importing
writes the edited objects' tiles back into the sheets: only palette indices count, 0 transparent, 1-15 the row's
colors, and an object's PNG must keep its size.

The skins' markers are a 32 by 32 shape, different in each skin (`shape.png` in each skin's folder), under a label,
the same in all ten (`labels/red.png`, 48 by 16, and `yellow.png`, `blue.png`, `green.png` and `purple.png`, 32 by
16), imported into every skin. The red label is two objects, which the tool joins and splits.

    tools/paperwhite2/cgear_sprites.py export DIR
    tools/paperwhite2/cgear_sprites.py import DIR
"""

import argparse
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.nitro_2d import read_indexed_png, write_indexed_png  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
GRAPHICS = ROOT / "res/graphics/c_gear"
OBJ_SIZES = {(0, 0): (8, 8), (0, 1): (16, 16), (0, 2): (32, 32), (0, 3): (64, 64), (1, 0): (16, 8), (1, 1): (32, 8),
             (1, 2): (32, 16), (1, 3): (64, 32), (2, 0): (8, 16), (2, 1): (8, 32), (2, 2): (16, 32), (2, 3): (32, 64)}
SKIN_COUNT = 5

# What each of 16.png's cells is, by the animations of c_gear_sw.c that show it
MAIN_CELLS = {
    1: "title", 2: "notice_connected", 3: "notice_connected", 4: "notice_connected",
    **{c: "notice_mission" for c in range(5, 22)},
    22: "power", 25: "power_pressed", 23: "help", 26: "help_pressed", 24: "edit", 27: "edit_pressed",
    28: "radar", 29: "radar", 30: "radar_pressed",
    31: "battery_dsi", 32: "battery_dsi", 33: "battery_dsi", 34: "battery_dsi", 35: "battery_unused",
    36: "battery_ds", 37: "battery_ds",
    **{c: "clock_digit" for c in range(38, 48)},
    48: "clock_am", 49: "clock_am_blink", 50: "clock_pm", 51: "clock_pm_blink", 52: "log",
    53: "marker_base_ir", 54: "lamp_ir", 55: "lamp_ir", 56: "marker_base_wireless", 57: "lamp_wireless",
    58: "lamp_wireless", 59: "marker_base_online", 60: "lamp_online", 61: "lamp_online", 62: "touch",
    63: "marker_base_green", 64: "lamp_green", 65: "lamp_green", 66: "marker_base_purple", 67: "lamp_purple",
    68: "lamp_purple",
}
SKIN_CELLS = {1: "red", 2: "yellow", 3: "blue", 4: "green", 5: "purple"}


def read_cells(path):
    """Returns each cell's objects as (x, y, width, height, tile, palette, hflip, vflip)."""
    data = path.read_bytes()
    count, attr, offset = struct.unpack_from("<HHI", data, 0x18)
    base = 0x18 + offset
    entry = 16 if attr & 1 else 8
    oams = base + count * entry
    cells = []
    for cell in range(count):
        n, _, oam = struct.unpack_from("<HHI", data, base + cell * entry)
        objects = []
        for i in range(n):
            a0, a1, a2 = struct.unpack_from("<HHH", data, oams + oam + i * 6)
            y = (a0 & 0xFF) - (256 if a0 & 0x80 else 0)
            x = (a1 & 0x1FF) - (512 if a1 & 0x100 else 0)
            width, height = OBJ_SIZES[(a0 >> 14, a1 >> 14)]
            objects.append((x, y, width, height, a2 & 0x3FF, a2 >> 12, bool(a1 & 0x1000), bool(a1 & 0x2000)))
        cells.append(objects)
    return cells


def read_palette(path):
    values = path.read_text().split()
    return [tuple(int(v) for v in values[3 + i * 3:6 + i * 3]) for i in range(int(values[2]))]


class Sheet:
    """A sheet of 4bpp OBJ tiles, four tiles wide, as its PNG stores them."""

    def __init__(self, path):
        self.path = path
        self.width, self.height, pixels, self.colors = read_indexed_png(path)
        self.pixels = bytearray(pixels)
        self.original = bytes(pixels)

    def _offset(self, tile, x, y):
        across = self.width // 8
        return (tile // across * 8 + y) * self.width + tile % across * 8 + x

    def get(self, tile, x, y):
        return self.pixels[self._offset(tile, x, y)]

    def set(self, tile, x, y, value):
        self.pixels[self._offset(tile, x, y)] = value

    def save(self):
        if bytes(self.pixels) != self.original:
            self.path.write_bytes(write_indexed_png(self.width, self.height, bytes(self.pixels), self.colors))
            return True
        return False


def object_tile(tile, width, x, y):
    """Returns the tile and the pixel in it of an object's pixel (OBJ tiles are in rows, one-dimensional mapping)."""
    return tile + y // 8 * (width // 8) + x // 8, x % 8, y % 8


def resources():
    """Yields each sheet's folder name, sheet, cells and names of cells."""
    yield "main", GRAPHICS / "16.png", GRAPHICS / "17.ncer", MAIN_CELLS
    for gender, sex in enumerate(("boy", "girl")):
        for skin in range(SKIN_COUNT):
            yield (f"skin_{sex}_{skin + 1}", GRAPHICS / f"{19 + gender * SKIN_COUNT + skin}.png", GRAPHICS / "29.ncer",
                   SKIN_CELLS)


def pieces(folder, cells, names):
    """Returns each distinct piece of the named cells, by first use: where its PNG goes (relative to the export), its
    objects as (x in the piece, width, height, tile), its size and its palette row. A piece is one object, but for the
    skins' labels, which are a cell's objects 16 high side by side, the same in every skin, and their shapes."""
    seen = set()
    found = []
    for cell, objects in enumerate(cells):
        if cell not in names:
            continue
        if folder.startswith("skin_"):
            groups = [(Path("labels") / f"{names[cell]}.png", [o for o in objects if o[3] == 16])]
            groups += [(Path(folder) / "shape.png", [o]) for o in objects if o[3] != 16]
        else:
            groups = [(Path(folder) / f"{names[cell]}_t{o[4]:03d}_{o[2]}x{o[3]}.png", [o]) for o in objects]
        for path, objs in groups:
            key = tuple((o[4], o[2], o[3]) for o in objs)
            if not objs or key in seen:
                continue
            seen.add(key)
            left = min(o[0] for o in objs)
            width = max(o[0] + o[2] for o in objs) - left
            height = max(o[3] for o in objs)
            parts = [(o[0] - left, o[2], o[3], o[4]) for o in objs]
            found.append((path, parts, width, height, objs[0][5]))
    return found


def export(out):
    colors = read_palette(GRAPHICS / "14.pal")
    for folder, sheet_path, cells_path, names in resources():
        sheet = Sheet(sheet_path)
        cells = read_cells(cells_path)
        target = out / folder
        (target / "preview").mkdir(parents=True, exist_ok=True)
        (out / "labels").mkdir(exist_ok=True)
        for path, parts, width, height, palette in pieces(folder, cells, names):
            pixels = bytearray(width * height)
            for left, w, h, tile in parts:
                for y in range(h):
                    for x in range(w):
                        pixels[y * width + left + x] = sheet.get(*object_tile(tile, w, x, y))
            row = colors[palette * 16:palette * 16 + 16]
            (out / path).write_bytes(write_indexed_png(width, height, bytes(pixels), row))
        for cell, objects in enumerate(cells):
            if cell not in names or not objects:
                continue
            left = min(o[0] for o in objects)
            top = min(o[1] for o in objects)
            width = max(o[0] + o[2] for o in objects) - left
            height = max(o[1] + o[3] for o in objects) - top
            pixels = bytearray(width * height)
            # The first object is in front
            for x0, y0, w, h, tile, palette, hflip, vflip in reversed(objects):
                for y in range(h):
                    for x in range(w):
                        value = sheet.get(*object_tile(tile, w, w - 1 - x if hflip else x, h - 1 - y if vflip else y))
                        if value:
                            pixels[(y0 - top + y) * width + x0 - left + x] = palette * 16 + value
            (target / "preview" / f"cell{cell:02d}_{names[cell]}.png").write_bytes(
                write_indexed_png(width, height, bytes(pixels), colors))
    print(f"Exported to {out}")


def import_(source):
    for folder, sheet_path, cells_path, names in resources():
        sheet = Sheet(sheet_path)
        written = {}
        for path, parts, width, height, _ in pieces(folder, read_cells(cells_path), names):
            path = source / path
            if not path.exists():
                continue
            w, h, pixels, _ = read_indexed_png(path)
            if (w, h) != (width, height):
                sys.exit(f"{path}: is {w}x{h}, must stay {width}x{height}")
            # A marker's colors 1-3 are its base ring's, which the C-Gear recolors by the ring the marker is on
            if path.parent.name == "labels" and folder == "skin_boy_1" and any(v & 15 in (1, 2, 3) for v in pixels):
                print(f"Note: {path.name} uses colors 1-3, which follow the ring's color; the label's own are 10-12")
            for left, pw, ph, tile in parts:
                for y in range(ph):
                    for x in range(pw):
                        place = object_tile(tile, pw, x, y)
                        value = pixels[y * width + left + x] & 15
                        if written.get(place, value) != value:
                            sys.exit(f"{path}: tile {place[0]} is shared with another piece and they differ")
                        written[place] = value
                        sheet.set(*place, value)
        if sheet.save():
            print(f"Updated {sheet_path.relative_to(ROOT)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("action", choices=("export", "import"))
    parser.add_argument("dir", type=Path)
    args = parser.parse_args()
    export(args.dir) if args.action == "export" else import_(args.dir)


if __name__ == "__main__":
    main()
