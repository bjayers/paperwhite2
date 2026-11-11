"""The item icons for Graphics & Palettes' Item icons page: which icon and palette files each item shows, and a PNG
from an image editor turned into an item's icon and palette.

    item_icons.py list                        # JSON: every item, the hack's first, with its files and a preview
    item_icons.py check ITEM PNG [OUT]        # JSON: whether the PNG makes an icon, its preview; OUT gets its files

An item shows an icon (a 32×32 picture of 16 color indices) and a palette (16 colors, 0 transparent), the members of
the item icons' archive that src/system/pml_item.c's ITEM_GRAPHICS_CHARS_AND_PALETTES gives it, in the hack's build
(the PAPERWHITE2 branch of an #ifdef). Their files are tools/data/item_icon_data.py's, which packs them. The hack's
items are the constants in docs/paperwhite2/items.md's table. A PNG is indexed, its indices 0-15 used with index 0
transparent, or RGB(A), with at most 15 colors besides the transparent pixels (alpha under 128); colors are rounded to
the DS's, 5 bits an axis. With OUT, the icon and palette are written there as icon.png and icon.pal, for the editor
to put in place of the item's files.
"""
import base64
import json
import re
import sys
from pathlib import Path

ROOT = Path.cwd()
sys.path.insert(0, str(ROOT))
from tools.data.gen_constants import ordered_names  # noqa: E402
from tools.data.item_icon_data import COLORS, SIZE, member_path  # noqa: E402
from tools.data.nitro_2d import (color5, read_indexed_png, read_palette, read_rgba_png, write_indexed_png,  # noqa: E402
                                 write_palette, write_rgba_png)

ITEMS = ROOT / "res/items"
TABLE = "ITEM_GRAPHICS_CHARS_AND_PALETTES"


def item_files() -> dict[str, tuple[str, str]]:
    """Each item's icon and palette constants in the hack's build, from pml_item.c's table."""
    lines = (ROOT / "src/system/pml_item.c").read_text().splitlines()
    start = next(i for i, line in enumerate(lines) if f"{TABLE}[][2] = {{" in line)
    result: dict[str, tuple[str, str]] = {}
    # Whether each open #if's branch is compiled: a PAPERWHITE2 test is decided for the hack, any other kept
    stack: list[tuple[bool, bool]] = []
    for line in lines[start + 1:]:
        text = line.strip()
        if text.startswith("};"):
            break
        if text.startswith("#if"):
            hack = re.match(r"#if(n?)def\s+PAPERWHITE2\b", text)
            stack.append((True, hack is not None and hack.group(1) == "n") if hack else (False, True))
            continue
        if text.startswith("#else") and stack:
            decided, skip = stack[-1]
            stack[-1] = (decided, not skip if decided else skip)
            continue
        if text.startswith("#endif") and stack:
            stack.pop()
            continue
        if any(decided and skip for decided, skip in stack):
            continue
        entry = re.match(r"\[(ITEM_\w+)\]\s*=\s*\{\s*(\w+),\s*(\w+)\s*\}", text)
        if entry:
            result[entry.group(1)] = (entry.group(2), entry.group(3))
    return result


def hack_items() -> list[str]:
    """The hack's items, in the order of docs/paperwhite2/items.md's table."""
    path = ROOT / "docs/paperwhite2/items.md"
    found: list[str] = []
    for line in path.read_text().splitlines() if path.is_file() else []:
        if line.startswith("|"):
            for constant in re.findall(r"`(ITEM_[A-Z0-9_]+)`", line)[:1]:
                if constant not in found:
                    found.append(constant)
    return found


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def preview(pixels: bytes, colors: list[tuple[int, int, int]]) -> str:
    """The icon as the game shows it, an RGBA PNG in base64, index 0 transparent."""
    shown = [tuple(round(axis * 255 / 31) for axis in color5(color)) for color in colors]
    out = bytearray()
    for index in pixels:
        r, g, b = shown[index] if index < len(shown) else (0, 0, 0)
        out.extend((r, g, b, 0 if index == 0 else 255))
    return base64.b64encode(write_rgba_png(SIZE, SIZE, bytes(out))).decode()


def item_preview(icon: Path, palette: Path) -> str | None:
    try:
        width, height, pixels, _ = read_indexed_png(icon)
        if (width, height) != (SIZE, SIZE):
            return None
        return preview(pixels, read_palette(palette))
    except (OSError, ValueError):
        return None


def list_items():
    files = item_files()
    names = ordered_names("items")
    hack = hack_items()
    users: dict[str, list[str]] = {}
    for item, (icon, palette) in files.items():
        users.setdefault(icon, []).append(item)
        users.setdefault(palette, []).append(item)
    items = []
    for number, item in enumerate(names):
        if item not in files:
            continue
        icon, palette = files[item]
        data = ITEMS / item.removeprefix("ITEM_").lower() / "data.json"
        name = json.loads(data.read_text()).get("name", item) if data.is_file() else item
        icon_path, palette_path = member_path(ITEMS, icon), member_path(ITEMS, palette)
        items.append({
            "constant": item, "id": number, "name": name, "hack": item in hack,
            "icon": icon, "palette": palette, "iconPath": relative(icon_path), "palettePath": relative(palette_path),
            "iconSharedWith": [other for other in users[icon] if other != item],
            "paletteSharedWith": [other for other in users[palette] if other != item],
            "preview": item_preview(icon_path, palette_path),
        })
    items.sort(key=lambda entry: (not entry["hack"], hack.index(entry["constant"]) if entry["hack"] else 0, entry["id"]))
    print(json.dumps({"size": SIZE, "colors": COLORS, "items": items}))


def convert(png: Path, current: list[tuple[int, int, int]]) -> tuple[bytes, list[tuple[int, int, int]]]:
    """A PNG's pixels as 16 color indices and its 16 colors, or a ValueError that says why it can't be an icon."""
    try:
        width, height, pixels, png_colors = read_indexed_png(png)
        indexed = True
    except ValueError:
        width, height, rgba = read_rgba_png(png)
        indexed = False
    if (width, height) != (SIZE, SIZE):
        raise ValueError(f"The PNG is {width}×{height}; an item icon is {SIZE}×{SIZE}.")
    if indexed:
        if max(pixels) >= COLORS:
            raise ValueError(f"The PNG uses color index {max(pixels)}; an item icon has {COLORS} colors, 0-{COLORS - 1}, "
                             "with 0 transparent.")
        colors = (list(png_colors[:COLORS]) + [(0, 0, 0)] * COLORS)[:COLORS]
        return bytes(pixels), colors
    transparent = current[0] if current else (0, 0, 0)
    colors = [transparent]
    out = bytearray()
    for i in range(0, len(rgba), 4):
        if rgba[i + 3] < 128:
            out.append(0)
            continue
        color = tuple(round(axis * 31 / 255) * 255 // 31 for axis in rgba[i:i + 3])
        if color not in colors[1:]:
            colors.append(color)
            if len(colors) > COLORS:
                raise ValueError(f"The PNG has more than {COLORS - 1} colors besides the transparent ones (after "
                                 "rounding to the DS's colors); an item icon has 15 and transparency.")
        out.append(colors.index(color, 1))
    return bytes(out), colors + [(0, 0, 0)] * (COLORS - len(colors))


def check(item: str, png: Path, out: Path | None):
    files = item_files()
    if item not in files:
        raise SystemExit(f"{item} isn't an item of pml_item.c's table")
    icon_path, palette_path = member_path(ITEMS, files[item][0]), member_path(ITEMS, files[item][1])
    try:
        current = read_palette(palette_path)
    except (OSError, ValueError):
        current = []
    try:
        pixels, colors = convert(png, current)
    except ValueError as error:
        message = str(error).replace(f"{png}: ", "")
        print(json.dumps({"ok": False, "message": message, "written": False, "preview": None}))
        return
    used = len(set(pixels) - {0})
    if out is not None:
        (out / "icon.png").write_bytes(write_indexed_png(SIZE, SIZE, pixels, colors))
        (out / "icon.pal").write_text(write_palette(colors))
    print(json.dumps({"ok": True, "message": f"{used} colors and transparency", "written": False,
                      "preview": preview(pixels, colors), "iconPath": relative(icon_path),
                      "palettePath": relative(palette_path)}))


def main():
    if sys.argv[1:2] == ["list"]:
        list_items()
    elif sys.argv[1:2] == ["check"] and len(sys.argv) in (4, 5):
        check(sys.argv[2], Path(sys.argv[3]), Path(sys.argv[4]) if len(sys.argv) == 5 else None)
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
