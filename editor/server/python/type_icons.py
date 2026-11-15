"""The type icons for Graphics & Palettes' Type icons page: every type's 32×16 label, the palette row it is drawn in, who
shares each entry of that row, the battle move buttons' palettes, and a PNG from an image editor checked as a label.

    type_icons.py list                       # JSON: the labels, the rows of the labels' palette, the move buttons
    type_icons.py export TYPE                # base64 PNG: the label, indexed, with its palette row as its colors
    type_icons.py export-sheet               # base64 PNG: every label on one sheet, the three rows as colors 0-47
    type_icons.py check-label TYPE PNG [OUT] # JSON: whether the PNG is the label, what it changes; OUT gets the files
    type_icons.py check-sheet PNG [OUT]      # JSON: the same for a sheet, every label at once

The labels are the members of the menus' shared archive (a/0/8/2, res/graphics/app_menu_common) that
src/system/app_menu_common.c's AppMenuCommon_GetTypeIconCharFile gives each type (0x22 + the type, and the Fairy
override of the hack's build), drawn in the row of the file AppMenuCommon_GetTypeIconPaletteFile names (033.pal) that
sTypeIconPalettes gives it. A row has 16 colors: 0 transparent, 14 the letters' shadow, 15 the letters, and 1-13 shared
by the labels of the row and by the move category icons (AppMenuCommon_GetCategoryIconCharFile) that use it. The move
buttons' palettes are btlv_input.c's data_ov168_021f3864 and the Fairy override. A label in an image editor is an
indexed PNG whose indices are the row's; its colors for the indices it uses become the row's, so recoloring is
drawing with another color in the same index. A sheet is the same with the rows told apart: pixel color 16 * row +
index, the palette the three rows. With OUT, a label with other pixels is written there as MEMBER.png, and the palette
when a color changed as 033.pal, for the editor to put in place.
"""
import base64
import json
import re
import sys
from pathlib import Path

ROOT = Path.cwd()
sys.path.insert(0, str(ROOT))
from tools.data import datajson  # noqa: E402
from tools.data.nitro_2d import color5, read_indexed_png, read_palette, write_indexed_png, write_palette  # noqa: E402

SOURCE = ROOT / "src/system/app_menu_common.c"
BUTTONS = ROOT / "src/ov168/btlv_input.c"
LABELS = ROOT / "res/graphics/app_menu_common"
BUTTON_PALETTES = ROOT / "res/graphics/btlv"
TYPES = ROOT / "res/types"
WIDTH, HEIGHT = 32, 16
ROW_COLORS = 16
SHEET_COLUMNS = 4


def read_source(path: Path) -> str:
    return path.read_text()


def array(text: str, name: str) -> list[int]:
    found = re.search(rf"\b{name}\b[^=]*=\s*\{{([^}}]*)\}}", text)
    if not found:
        raise SystemExit(f"{name} isn't in {SOURCE.name}")
    return [int(v, 0) for v in re.findall(r"0x[0-9a-fA-F]+|\d+", found.group(1))]


def defines(text: str) -> dict[str, int]:
    return {name: int(value, 0) for name, value in re.findall(r"^#define (\w+) (0x[0-9a-fA-F]+|\d+)\b", text, re.MULTILINE)}


def function_body(text: str, name: str) -> str:
    found = re.search(rf"\b{name}\([^)]*\)\s*\{{(.*?)\n\}}", text, re.DOTALL)
    if not found:
        raise SystemExit(f"{name} isn't in {SOURCE.name}")
    return found.group(1)


class Layout:
    """Which member and palette row each type's label has, from the game's source."""

    def __init__(self):
        text = read_source(SOURCE)
        words = defines(text)
        names = datajson.names("TYPE_")
        ids = datajson.constants()
        self.types = [(value, names[value]) for value in sorted(names)]
        rows = array(text, "sTypeIconPalettes")
        base = int(re.search(r"return (0x[0-9a-fA-F]+|\d+) \+ type;", function_body(text, "AppMenuCommon_GetTypeIconCharFile")).group(1), 0)
        row_body = function_body(text, "AppMenuCommon_GetTypeIconPaletteIndex")
        char_body = function_body(text, "AppMenuCommon_GetTypeIconCharFile")
        self.member: dict[int, int] = {}
        self.row: dict[int, int] = {}
        for value, _ in self.types:
            self.member[value] = base + value
            self.row[value] = rows[value]
        for constant, symbol in re.findall(r"if \(type == (TYPE_\w+)\) \{\s*return (\w+);", char_body):
            self.member[ids[constant]] = words.get(symbol, int(symbol, 0) if symbol.isdigit() else -1)
        for constant, symbol in re.findall(r"if \(type == (TYPE_\w+)\) \{\s*return (\w+);", row_body):
            self.row[ids[constant]] = words.get(symbol, int(symbol, 0) if symbol.isdigit() else -1)
        if any(m < 0 for m in self.member.values()) or any(r < 0 for r in self.row.values()):
            raise SystemExit("a type's label or palette row override isn't a number the editor can read")
        category = int(re.search(r"return (0x[0-9a-fA-F]+|\d+) \+ index;", function_body(text, "AppMenuCommon_GetCategoryIconCharFile")).group(1), 0)
        category_rows = array(text, "sIconPalettes")
        self.categories = {category + i: row for i, row in enumerate(category_rows) if (LABELS / f"{category + i:03d}.png").is_file()}
        self.palette = int(re.search(r"return (0x[0-9a-fA-F]+|\d+);", function_body(text, "AppMenuCommon_GetTypeIconPaletteFile")).group(1), 0)
        # The move buttons' palettes
        buttons = read_source(BUTTONS)
        self.button = {i: m for i, m in enumerate(array(buttons, "data_ov168_021f3864"))}
        words = defines(buttons)
        for constant, symbol in re.findall(r"palette = type == (TYPE_\w+) \? (\w+) :", buttons):
            self.button[ids[constant]] = words[symbol]

    def name(self, value: int) -> str:
        path = TYPES / (dict(self.types)[value].removeprefix("TYPE_").lower() + ".json")
        return json.loads(path.read_text()).get("name", dict(self.types)[value]) if path.is_file() else dict(self.types)[value]

    def label_path(self, value: int) -> Path:
        return LABELS / f"{self.member[value]:03d}.png"

    def palette_path(self) -> Path:
        return LABELS / f"{self.palette:03d}.pal"


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def shown(color) -> list[int]:
    """A color as the DS shows it, in 8 bits."""
    return [round(axis * 255 / 31) for axis in color5(color)]


def dump_color(color) -> list[int]:
    """A color as the dump writes it (the 5-bit axes' floor(v * 255 / 31))."""
    return [axis * 255 // 31 for axis in color5(color)]


def read_label(layout: Layout, value: int) -> bytes:
    width, height, pixels, _ = read_indexed_png(layout.label_path(value))
    if (width, height) != (WIDTH, HEIGHT):
        raise SystemExit(f"{relative(layout.label_path(value))} is {width}×{height}")
    return pixels


def usage(layout: Layout, pixels: dict[int, bytes]) -> list[dict]:
    """For each of the three rows' entries, the labels and category icons that draw with it."""
    rows = []
    categories = {m: set(read_indexed_png(LABELS / f"{m:03d}.png")[2]) for m in layout.categories}
    for row in range(3):
        entries = []
        for index in range(ROW_COLORS):
            labels = [v for v, _ in layout.types if layout.row[v] == row and index in pixels[v]]
            others = [f"menu icon {m}" for m, r in layout.categories.items() if r == row and index in categories[m]]
            entries.append({"index": index, "labels": labels, "others": others})
        rows.append(entries)
    return rows


def list_all():
    layout = Layout()
    colors = read_palette(layout.palette_path())
    pixels = {v: read_label(layout, v) for v, _ in layout.types}
    usage_rows = usage(layout, pixels)
    labels = []
    for value, constant in layout.types:
        labels.append({
            "id": value, "constant": constant, "name": layout.name(value), "member": layout.member[value],
            "path": relative(layout.label_path(value)), "row": layout.row[value],
            "pixels": list(pixels[value]),
        })
    buttons = []
    for value, constant in layout.types:
        if value not in layout.button:
            continue
        path = BUTTON_PALETTES / f"{layout.button[value]:03d}.pal"
        buttons.append({"id": value, "member": layout.button[value], "path": relative(path),
                        "colors": [list(c) for c in read_palette(path)[:ROW_COLORS]]})
    rows = [{"row": r, "colors": [list(c) for c in colors[r * ROW_COLORS:(r + 1) * ROW_COLORS]], "entries": usage_rows[r]}
            for r in range(3)]
    print(json.dumps({"width": WIDTH, "height": HEIGHT, "palettePath": relative(layout.palette_path()),
                      "labels": labels, "rows": rows, "buttons": buttons}))


def label_png(layout: Layout, value: int, colors, pixels: bytes) -> bytes:
    row = layout.row[value]
    return write_indexed_png(WIDTH, HEIGHT, pixels, colors[row * ROW_COLORS:(row + 1) * ROW_COLORS])


def export(type_id: int):
    layout = Layout()
    if type_id not in layout.member:
        raise SystemExit(f"No type {type_id}")
    colors = read_palette(layout.palette_path())
    print(base64.b64encode(label_png(layout, type_id, colors, read_label(layout, type_id))).decode())


def export_sheet():
    layout = Layout()
    colors = read_palette(layout.palette_path())
    rows = -(-len(layout.types) // SHEET_COLUMNS)
    width, height = SHEET_COLUMNS * WIDTH, rows * HEIGHT
    sheet = bytearray(width * height)
    for slot, (value, _) in enumerate(layout.types):
        pixels = read_label(layout, value)
        x0, y0 = (slot % SHEET_COLUMNS) * WIDTH, (slot // SHEET_COLUMNS) * HEIGHT
        for y in range(HEIGHT):
            for x in range(WIDTH):
                p = pixels[y * WIDTH + x]
                sheet[(y0 + y) * width + x0 + x] = layout.row[value] * ROW_COLORS + p if p else 0
    print(base64.b64encode(write_indexed_png(width, height, bytes(sheet), colors[:3 * ROW_COLORS])).decode())


def plan(layout: Layout, updates: dict[int, tuple[bytes, dict[int, tuple]]], out: Path | None):
    """Checks new pixels and colors for some labels (value -> pixels, color per used index) against the files and
    reports what they change; with out, writes the files."""
    colors = read_palette(layout.palette_path())
    current = {v: read_label(layout, v) for v, _ in layout.types}
    new_pixels = {**current, **{v: p for v, (p, _) in updates.items()}}
    changes: dict[tuple[int, int], tuple] = {}
    for value, (pixels, wanted) in updates.items():
        row = layout.row[value]
        for index in sorted(set(pixels) - {0}):
            color = wanted[index]
            at = row * ROW_COLORS + index
            if color5(color) != color5(colors[at]):
                other = changes.get((row, index))
                if other is not None and color5(other) != color5(color):
                    raise ValueError(f"{layout.name(value)} and another label want different colors for entry {index} of row {row}, "
                                     "which they share")
                changes[(row, index)] = color
    names = {v: layout.name(v) for v, _ in layout.types}
    categories = {m: set(read_indexed_png(LABELS / f"{m:03d}.png")[2]) for m in layout.categories}
    report = []
    for (row, index), color in sorted(changes.items()):
        users = [names[v] for v, _ in layout.types if layout.row[v] == row and index in new_pixels[v]]
        users += [f"menu icon {m}" for m, r in layout.categories.items() if r == row and index in categories[m]]
        report.append({"row": row, "index": index, "from": dump_color(colors[row * ROW_COLORS + index]),
                       "to": dump_color(color), "users": users,
                       "shared": len([u for u in users if u not in {names[v] for v in updates}]) > 0})
    changed = [v for v, (pixels, _) in updates.items() if pixels != current[v]]
    new_colors = list(colors)
    for (row, index), color in changes.items():
        new_colors[row * ROW_COLORS + index] = tuple(dump_color(color))
    written = []
    if out is not None:
        for v in changed:
            (out / f"{layout.member[v]:03d}.png").write_bytes(label_png(layout, v, new_colors, new_pixels[v]))
            written.append(relative(layout.label_path(v)))
        if changes:
            (out / f"{layout.palette:03d}.pal").write_text(write_palette(new_colors))
            written.append(relative(layout.palette_path()))
    labels = [{"id": v, "name": names[v], "row": layout.row[v], "pixels": list(new_pixels[v]),
               "pixelsChanged": v in changed} for v in sorted(updates)]
    rows = [{"row": r, "colors": [list(c) for c in new_colors[r * ROW_COLORS:(r + 1) * ROW_COLORS]]} for r in range(3)]
    nothing = not changed and not changes
    message = ("It is what the game has now: nothing to write." if nothing else
               f"{len(changed)} label{'s' if len(changed) != 1 else ''} with other pixels, "
               f"{len(changes)} palette entr{'ies' if len(changes) != 1 else 'y'} with other colors.")
    print(json.dumps({"ok": True, "message": message, "written": False, "labels": labels, "changes": report, "rows": rows,
                      "files": written, "nothing": nothing, "preview": None}))


def png_pixels(path: Path, width: int, height: int) -> tuple[bytes, list]:
    try:
        w, h, pixels, colors = read_indexed_png(path)
    except ValueError as error:
        raise ValueError("Save it as an indexed PNG (the label's palette, 4 or 8 bits), not RGB: its indices are the row's "
                         f"({str(error).split(': ')[-1]})") from None
    if (w, h) != (width, height):
        raise ValueError(f"The PNG is {w}×{h}; it must be {width}×{height}.")
    return pixels, colors


def check_label(type_id: int, png: Path, out: Path | None):
    layout = Layout()
    if type_id not in layout.member:
        raise SystemExit(f"No type {type_id}")
    pixels, png_colors = png_pixels(png, WIDTH, HEIGHT)
    if max(pixels) >= ROW_COLORS:
        raise ValueError(f"The PNG uses color index {max(pixels)}; a label has the 16 colors of its row, 0-15, with 0 transparent.")
    used = set(pixels) - {0}
    if any(i >= len(png_colors) for i in used):
        raise ValueError("A pixel's index is outside the PNG's palette.")
    plan(layout, {type_id: (pixels, {i: tuple(png_colors[i]) for i in used})}, out)


def check_sheet(png: Path, out: Path | None):
    layout = Layout()
    rows = -(-len(layout.types) // SHEET_COLUMNS)
    width, height = SHEET_COLUMNS * WIDTH, rows * HEIGHT
    sheet, png_colors = png_pixels(png, width, height)
    updates = {}
    for slot, (value, _) in enumerate(layout.types):
        x0, y0 = (slot % SHEET_COLUMNS) * WIDTH, (slot // SHEET_COLUMNS) * HEIGHT
        pixels = bytearray(WIDTH * HEIGHT)
        wanted = {}
        for y in range(HEIGHT):
            for x in range(WIDTH):
                p = sheet[(y0 + y) * width + x0 + x]
                if p == 0:
                    continue
                if p // ROW_COLORS != layout.row[value] or p % ROW_COLORS == 0:
                    raise ValueError(f"{layout.name(value)}'s pixel at ({x}, {y}) is color {p}; its label is drawn in row "
                                     f"{layout.row[value]}, colors {layout.row[value] * ROW_COLORS + 1}-"
                                     f"{layout.row[value] * ROW_COLORS + 15}.")
                if p >= len(png_colors):
                    raise ValueError("A pixel's index is outside the PNG's palette.")
                pixels[y * WIDTH + x] = p % ROW_COLORS
                wanted[p % ROW_COLORS] = tuple(png_colors[p])
        updates[value] = (bytes(pixels), wanted)
    # The cells past the last label must stay empty
    for slot in range(len(layout.types), SHEET_COLUMNS * rows):
        x0, y0 = (slot % SHEET_COLUMNS) * WIDTH, (slot // SHEET_COLUMNS) * HEIGHT
        if any(sheet[(y0 + y) * width + x0 + x] for y in range(HEIGHT) for x in range(WIDTH)):
            raise ValueError("Something is drawn in a cell past the last label.")
    plan(layout, updates, out)


def main():
    args = sys.argv[1:]
    try:
        if args[:1] == ["list"]:
            list_all()
        elif args[:1] == ["export"]:
            export(int(args[1]))
        elif args[:1] == ["export-sheet"]:
            export_sheet()
        elif args[:1] == ["check-label"]:
            check_label(int(args[1]), Path(args[2]), Path(args[3]) if len(args) > 3 else None)
        elif args[:1] == ["check-sheet"]:
            check_sheet(Path(args[1]), Path(args[2]) if len(args) > 2 else None)
        else:
            raise SystemExit(__doc__)
    except ValueError as error:
        print(json.dumps({"ok": False, "message": str(error), "written": False, "labels": [], "changes": [], "rows": [],
                          "files": [], "nothing": False, "preview": None}))


if __name__ == "__main__":
    main()
