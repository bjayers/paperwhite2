#!/usr/bin/env python3
"""The Entralink run's marker art for the editor's Graphics & Palettes page (the Sprite sheets page lists what `list`
says and runs `check` on what an artist imports).

    entralink_marker_art.py list
        # a JSON list of the markers' art (res/paperwhite2/entralink/markers/<type>.png, 32 by 32, and
        # npc_markers/<name>.png, 16 by 16, and the buff category icons and tier palettes, buff_icons/<category>.png and
        # tier_<tier>.png, 16 by 16): name, title, path,
        # tool, toolArgs, width, height, description
    entralink_marker_art.py check PNG --size N [--palette HEX,...] [--preview OUT] [--output OUT] [--info OUT]
        # PNG is an indexed PNG of N by N pixels (colors 0 to 15, index 0 clear), or an RGB(A) PNG of at most 15 colors
        # besides the transparent pixels, which is made indexed. --palette replaces the 16 colors (#rrggbb each, in the
        # DS's 5 bits an axis); --preview is the marker as the game shows it (an RGBA PNG, index 0 clear); --output is
        # the indexed PNG that the editor writes over the marker's file; --info is JSON with the 16 colors and any
        # warnings. Exit 1 and a last line on stderr when it can't be a marker, as the packer
        # (entralink_run.marker_texture) would refuse it

Whatever this accepts, entralink_run.marker_members() packs: the same size, at most 16 colors, index 0 clear.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.nitro_2d import (color5, read_indexed_png, read_rgba_png, write_indexed_png,  # noqa: E402
                                 write_rgba_png)
from tools.paperwhite2 import entralink_run  # noqa: E402

TOOL = "tools/paperwhite2/entralink_marker_art.py"
COLORS = entralink_run.MARKER_COLORS

GROUND_ABOUT = (
    "The marker that lies on the ground in front of a room's door once the room is done, 2 by 2 tiles, seen from the "
    "camera (south of it, looking north): the picture's top is toward the north. Index 0 is clear, so the ground shows "
    "through; up to 15 more colors. The build packs this PNG as a 32×32 16-color texture.")
NPC_ABOUT = (
    "The marker that floats over an NPC's head in an Entralink room (an NPC's `marker` in the room's file names it), "
    "one tile wide, facing the camera. Index 0 is clear; up to 15 more colors. The build packs this PNG as a 16×16 "
    "16-color texture. A new one is a new PNG in npc_markers/, named for the marker.")
# The buff cards' icons (buffs.json, entralink_buffs.py): one a category (<category>.png), drawn in the card's tier's
# palette (tier_<tier>.png, a swatch whose PNG palette is the tier's 16 colors)
BUFF_ICON_SIZE = 16
BUFF_ABOUT = (
    "A buff category's icon (res/paperwhite2/entralink/buffs.json's categories), 16 by 16: every card of the category "
    "shows it, in its tier's palette (the Buff tier palettes), so draw with the palette indices, not the colors: index "
    "0 clear, 1 the outline, 2-4 the badge's dark, mid and light, 5 the symbol, 6 its shadow (the placeholders' use). "
    "The colors here are only a preview. The game shows none yet (the buffs' later phase).")
BUFF_PALETTE_ABOUT = (
    "A buff tier's palette (blue, purple, gold): its 16 colors are the colors every category icon is drawn in for a "
    "card of this tier; the picture is only a swatch, color i in the 4 by 4 cell i. Change the palette, not the "
    "pixels.")


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def sheets() -> list[dict]:
    out = []
    ground = {"enemy": "Enemy", "challenge": "Challenge", "boss": "Boss", "rest": "Rest", "gift": "Gift", "event": "Event",
              "shop": "Shop", "unknown": "Unknown (???)", "final": "Final", "catch": "Catch (a Pokémon to catch)",
              "enemy_choice": "Enemy choice (battles to choose from)"}
    for kind in entralink_run.MARKER_TYPES:
        out.append({"name": f"marker_{kind}", "title": f"Room marker: {ground.get(kind, kind)}",
                    "path": relative(entralink_run.SOURCE / "markers" / f"{kind}.png"), "tool": TOOL,
                    "toolArgs": ["--size", str(entralink_run.MARKER_SIZE)], "width": entralink_run.MARKER_SIZE,
                    "height": entralink_run.MARKER_SIZE, "description": GROUND_ABOUT, "palette": True})
    for name in entralink_run.npc_marker_names():
        out.append({"name": f"npc_marker_{name}", "title": f"NPC marker: {name}",
                    "path": relative(entralink_run.SOURCE / "npc_markers" / f"{name}.png"), "tool": TOOL,
                    "toolArgs": ["--size", str(entralink_run.NPC_MARKER_SIZE)], "width": entralink_run.NPC_MARKER_SIZE,
                    "height": entralink_run.NPC_MARKER_SIZE, "description": NPC_ABOUT, "palette": True})
    for path in sorted((entralink_run.SOURCE / "buff_icons").glob("*.png")):
        name = path.stem
        palette = name.startswith("tier_")
        title = f"Buff tier palette: {name.removeprefix('tier_')}" if palette else f"Buff icon: {name.replace('_', ' ')}"
        out.append({"name": f"buff_{name}" if palette else f"buff_icon_{name}", "title": title, "path": relative(path),
                    "tool": TOOL, "toolArgs": ["--size", str(BUFF_ICON_SIZE)], "width": BUFF_ICON_SIZE,
                    "height": BUFF_ICON_SIZE, "description": BUFF_PALETTE_ABOUT if palette else BUFF_ABOUT,
                    "palette": True})
    return out


def hex_color(color: tuple[int, int, int]) -> str:
    return "#%02x%02x%02x" % color


def to8(color: tuple[int, int, int]) -> tuple[int, int, int]:
    """A color as the DS shows it (5 bits an axis), in 8 bits."""
    return tuple(axis * 255 // 31 for axis in color5(color))


def convert(png: Path, size: int) -> tuple[bytes, list[tuple[int, int, int]], list[str]]:
    """A PNG's pixels as 16-color indices, its 16 colors and any warnings, or a ValueError that says why it can't be
    a marker."""
    warnings = []
    try:
        width, height, pixels, png_colors = read_indexed_png(png)
    except ValueError:
        try:
            width, height, rgba = read_rgba_png(png)
        except ValueError:
            raise ValueError("The PNG must be indexed (colors 0-15, index 0 transparent) or RGB(A) with at most 15 "
                             "colors besides transparency.") from None
        if (width, height) != (size, size):
            raise ValueError(f"The PNG is {width}×{height}; this marker is {size}×{size}.")
        colors = [(0, 0, 0)]
        pixels = bytearray()
        for i in range(0, len(rgba), 4):
            if rgba[i + 3] < 128:
                pixels.append(0)
                continue
            color = to8(tuple(rgba[i:i + 3]))
            if color not in colors[1:]:
                colors.append(color)
                if len(colors) > COLORS:
                    raise ValueError(f"The PNG has more than {COLORS - 1} colors besides the transparent pixels (after "
                                     f"rounding to the DS's colors); a marker has {COLORS - 1} and transparency.")
            pixels.append(colors.index(color, 1))
        return bytes(pixels), colors + [(0, 0, 0)] * (COLORS - len(colors)), warnings
    if (width, height) != (size, size):
        raise ValueError(f"The PNG is {width}×{height}; this marker is {size}×{size}.")
    if pixels and max(pixels) >= COLORS:
        raise ValueError(f"The PNG uses color index {max(pixels)}; a marker has {COLORS} colors, 0-{COLORS - 1}, with 0 "
                         "transparent.")
    if len(png_colors) > COLORS:
        warnings.append(f"the PNG's palette has {len(png_colors)} colors; only the first {COLORS} are used")
    return pixels, (list(png_colors[:COLORS]) + [(0, 0, 0)] * COLORS)[:COLORS], warnings


def preview(pixels: bytes, colors: list[tuple[int, int, int]], size: int) -> bytes:
    shown = [to8(color) for color in colors]
    out = bytearray()
    for index in pixels:
        out.extend((*shown[index], 0 if index == 0 else 255))
    return write_rgba_png(size, size, bytes(out))


def check(args: list[str]):
    options = {"--size": None, "--palette": None, "--preview": None, "--output": None, "--info": None}
    rest = []
    i = 0
    while i < len(args):
        if args[i] in options and i + 1 < len(args):
            options[args[i]] = args[i + 1]
            i += 2
        else:
            rest.append(args[i])
            i += 1
    if len(rest) != 1 or options["--size"] is None:
        sys.exit(__doc__)
    size = int(options["--size"])
    try:
        pixels, colors, warnings = convert(Path(rest[0]), size)
        if options["--palette"] is not None:
            entries = [entry for entry in options["--palette"].split(",") if entry]
            if len(entries) != COLORS or any(len(e) != 7 or e[0] != "#" for e in entries):
                raise ValueError(f"A palette is {COLORS} colors, each #rrggbb.")
            colors = [to8(tuple(int(e[1 + 2 * k:3 + 2 * k], 16) for k in range(3))) for e in entries]
    except (ValueError, OSError) as error:
        sys.exit(f"entralink_marker_art.py: {str(error).replace(f'{rest[0]}: ', '')}")
    shown = [to8(color) for color in colors]
    used = sorted(set(pixels))
    if not any(index == 0 for index in pixels):
        warnings.append("no pixel is index 0, so nothing of the marker is clear")
    elif 0 in used and len(used) == 1:
        warnings.append("every pixel is index 0, so the marker is invisible")
    if options["--preview"]:
        Path(options["--preview"]).write_bytes(preview(pixels, shown, size))
    if options["--output"]:
        Path(options["--output"]).write_bytes(write_indexed_png(size, size, pixels, colors))
    if options["--info"]:
        Path(options["--info"]).write_text(json.dumps({"colors": [hex_color(c) for c in shown],
                                                       "used": [index for index in used], "warnings": warnings}))
    note = f"; warning: {'; '.join(warnings)}" if warnings else ""
    print(f"{len([index for index in used if index])} colors and transparency{note}")


def main():
    args = sys.argv[1:]
    if args[:1] == ["list"] and len(args) == 1:
        print(json.dumps(sheets()))
    elif args[:1] == ["check"]:
        check(args[1:])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
