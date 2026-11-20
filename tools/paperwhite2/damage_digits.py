#!/usr/bin/env python3
"""Paper White 2's damage numbers (docs/paperwhite2/design/entralink-buffs.md, phase 6): the digits' sheet,
res/paperwhite2/battle/damage_digits.png, packed into the battle view's archive (ARCID_BTLV, a/0/1/1).

    damage_digits.py archive IN OUT                 # the build: the archive with the digits and a foe's HP line's
                                                    # cell after its members
    damage_digits.py placeholder [PNG]              # writes the placeholder sheet (the sheet by default)
    damage_digits.py list                           # the editor's Sprite sheets page: the sheet's entry, as JSON
    damage_digits.py check PNG [--palette HEX,...] [--preview OUT] [--output OUT] [--info OUT]
        # whether PNG can be the sheet (exit 1 and a last line on stderr why not); --palette replaces its 16 colours
        # (#rrggbb each); --preview is the sheet as the game shows it, with a sample number in each colour tier under
        # it (RGBA, index 0 clear); --output the indexed PNG the editor writes; --info JSON with the colours

The sheet is an indexed PNG of 16 colours, 160 pixels wide: cells of 16 by 32, the digits 0 to 9 left to right. Row 1
(the top 32 pixels) is the digits as they show; each row under it is one frame of their shine, played in order and
back to row 1 (up to MAX_ROWS rows in all). Each cell keeps one blank column at each side. Index 0 is clear; entry 1 is
the outline, every tier's; entries 2 to 5 are the tier colours (the dark shadow, the light shadow, the main colour and
the shine, which the shine rows draw with). buffs.json's settings.damage_numbers has them all: its outline and each
tier's four colours, which replace the sheet's own 1 to 5 (only a preview); the other entries show as the sheet has
them.

The member (DIGITS_MEMBER, the archive's first after its own) is a header (the rows, the cells' width and height, the
tiers), each tier's 16 colours as RGB555 and then every cell, row by row and 0 to 9 in a row, each a 16 by 32 texture
of 4 bits a pixel (GX_TEXFMT_PLTT16, the left pixel in the low nibble), which
src/paperwhite2/ov168/paperwhite2_damage_numbers.c loads into texture VRAM and draws as 3D quads, a number in its
tier's palette. The next member is the cell of a foe's HP line on its gauge: the HP numbers' cell (HP_NUMBERS_CELL)
widened to two 32 by 8 pieces, 64 pixels.
"""
import json
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.narc import read_narc, write_narc  # noqa: E402
from tools.data.nitro_2d import color5, read_indexed_png, write_indexed_png, write_rgba_png  # noqa: E402
from tools.paperwhite2 import entralink_buffs  # noqa: E402

TOOL = "tools/paperwhite2/damage_digits.py"
SHEET = ROOT / "res" / "paperwhite2" / "battle" / "damage_digits.png"
HEADER = ROOT / "include" / "paperwhite2" / "damage_numbers.h"
CELL_WIDTH, CELL_HEIGHT = 16, 32
DIGITS = 10
WIDTH = CELL_WIDTH * DIGITS
MAX_ROWS = 8
COLORS = 16
# The palette entries that the settings give: the outline, every tier's, and each tier's four from TIER_FIRST (the
# dark shadow, the light shadow, the main colour and the shine)
OUTLINE = 1
TIER_FIRST, TIER_COLORS = 2, 4
DARK_SHADOW, LIGHT_SHADOW, MAIN, SHINE = range(TIER_FIRST, TIER_FIRST + TIER_COLORS)
# The battle view's archive's HP numbers' cell (BtlvGauge_CreateActors' 0x1c9)
HP_NUMBERS_CELL = 0x1c9

ABOUT = (
    "The damage numbers' digits (phase 6): 160 pixels wide, cells of 16×32, the digits 0 to 9 left to right, with one "
    "blank column at each side of each cell. Row 1 (the top 32 pixels) is the digits as they show; each row under it "
    f"is one frame of their shine, played in order (up to {MAX_ROWS} rows in all, so the height is 32 times the rows). "
    "An indexed PNG of 16 colours, index 0 clear: entry 1 is the outline and entries 2-5 the tier colours (dark "
    "shadow, light shadow, main colour, shine: the shine rows draw with 5), which the Tier colours below set for "
    "each tier; the sheet's own 1-5 are only a preview, and its other entries show as they are. The game draws the digits overlapping and spaced by the settings, starts "
    "each number large and see-through and shrinks it into place. The preview adds a sample number in each tier.")


def digits_member_number() -> int:
    """The archive's member that the C reads the digits from (damage_numbers.h's DAMAGE_DIGITS_MEMBER)."""
    match = re.search(r"#define DAMAGE_DIGITS_MEMBER (\d+)", HEADER.read_text())
    if not match:
        raise ValueError(f"{HEADER}: no DAMAGE_DIGITS_MEMBER")
    return int(match.group(1))


def read_sheet(path: Path) -> tuple[int, bytes, list[tuple[int, int, int]]]:
    """A sheet's rows, its pixels (palette indices) and its 16 colours, or a ValueError that says why it can't be the
    sheet."""
    try:
        width, height, pixels, colors = read_indexed_png(path)
    except ValueError:
        raise ValueError("The sheet must be an indexed PNG of 16 colours (index 0 clear, 1 the outline, 2-5 the "
                         "tier colours).") from None
    if width != WIDTH or height % CELL_HEIGHT or not CELL_HEIGHT <= height <= CELL_HEIGHT * MAX_ROWS:
        raise ValueError(f"The sheet is {width}×{height}; it must be {WIDTH} wide and 32 pixels a row tall, 1 to "
                         f"{MAX_ROWS} rows.")
    if pixels and max(pixels) >= COLORS:
        raise ValueError(f"The sheet uses colour index {max(pixels)}; it has {COLORS} colours, 0-{COLORS - 1}.")
    colors = (list(colors[:COLORS]) + [(0, 0, 0)] * COLORS)[:COLORS]
    return height // CELL_HEIGHT, bytes(pixels), colors


def cell(pixels: bytes, row: int, digit: int) -> bytes:
    """A cell as a 16-colour texture: rows of 16 pixels, two a byte, the left one in the low nibble."""
    out = bytearray()
    for y in range(CELL_HEIGHT):
        start = (row * CELL_HEIGHT + y) * WIDTH + digit * CELL_WIDTH
        line = pixels[start:start + CELL_WIDTH]
        out += bytes(line[x] | line[x + 1] << 4 for x in range(0, CELL_WIDTH, 2))
    return bytes(out)


def to555(color: tuple[int, int, int]) -> int:
    r, g, b = color5(color)
    return r | g << 5 | b << 10


def hex_color(text: str) -> tuple[int, int, int]:
    return tuple(int(text[i:i + 2], 16) for i in (1, 3, 5))


def tier_palettes(colors: list, numbers: dict) -> list[list[tuple[int, int, int]]]:
    """Each tier's 16 colours: the sheet's, with the settings' outline and the tier's four colours over 1 to 5."""
    palettes = []
    for tier in numbers["tiers"]:
        palette = list(colors)
        palette[OUTLINE] = hex_color(numbers["outline"])
        for i, color in enumerate(tier["colors"]):
            palette[TIER_FIRST + i] = hex_color(color)
        palettes.append(palette)
    return palettes


def member(path: Path = SHEET, numbers: dict | None = None) -> bytes:
    rows, pixels, colors = read_sheet(path)
    palettes = tier_palettes(colors, numbers if numbers is not None else settings())
    data = struct.pack("<BBBB", rows, CELL_WIDTH, CELL_HEIGHT, len(palettes))
    data += b"".join(struct.pack("<H", to555(color)) for palette in palettes for color in palette)
    return data + b"".join(cell(pixels, row, digit) for row in range(rows) for digit in range(DIGITS))


def hp_line_cell(cell_file: bytes) -> bytes:
    """The HP numbers' cell (a 32 by 8 piece, a 16 by 8 and an 8 by 8, 7 tiles from x -24) as a foe's HP line: two
    32 by 8 pieces from x -32, the actor's 8 tiles."""
    data = bytearray(cell_file)
    if data[:4] != b"RECN" or data[0x10:0x14] != b"KBEC":
        raise ValueError("the HP numbers' cell isn't a cell file")
    cells = data[0x18] | data[0x19] << 8
    offset = 0x18 + struct.unpack_from("<I", data, 0x1c)[0]
    count, _, oams = struct.unpack_from("<HHI", data, offset)
    if cells != 1 or count != 3:
        raise ValueError(f"the HP numbers' cell has {cells} cells of {count} pieces, not one of 3")
    at = offset + 8 + oams
    # attr0: y -8, a horizontal shape; attr1: x and size 1 (32 by 8); attr2: the character, in 64-byte units
    struct.pack_into("<HHHHHH", data, at, 0x40f8, 0x4000 | (-32 & 0x1ff), 0x0000, 0x40f8, 0x4000, 0x0002)
    struct.pack_into("<H", data, offset, 2)
    return bytes(data)


def archive(source: Path, output: Path):
    files = read_narc(source.read_bytes())
    first = digits_member_number()
    if len(files) != first:
        raise ValueError(f"{source}: {len(files)} members, not the {first} that damage_numbers.h's "
                         "DAMAGE_DIGITS_MEMBER expects")
    files += [member(), hp_line_cell(files[HP_NUMBERS_CELL])]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(write_narc(files))


# ---- The placeholder ------------------------------------------------------------------------------------------------

# Bold digits, 6 by 13, drawn twice as large with a 1-pixel outline: 14 by 28 in the cell's middle
GLYPHS = [
    [".####.", "######", "##..##", "##..##", "##..##", "##..##", "##..##", "##..##", "##..##", "##..##", "##..##",
     "######", ".####."],
    ["..##..", ".###..", "####..", "..##..", "..##..", "..##..", "..##..", "..##..", "..##..", "..##..", "..##..",
     "######", "######"],
    [".####.", "######", "##..##", "....##", "....##", "...###", "..###.", ".###..", "###...", "##....", "##....",
     "######", "######"],
    [".####.", "######", "##..##", "....##", "....##", "..###.", "..###.", "....##", "....##", "....##", "##..##",
     "######", ".####."],
    ["...###", "..####", ".##.##", "##..##", "##..##", "##..##", "######", "######", "....##", "....##", "....##",
     "....##", "....##"],
    ["######", "######", "##....", "##....", "#####.", "######", "....##", "....##", "....##", "....##", "##..##",
     "######", ".####."],
    [".####.", "######", "##..##", "##....", "##....", "#####.", "######", "##..##", "##..##", "##..##", "##..##",
     "######", ".####."],
    ["######", "######", "....##", "....##", "...##.", "...##.", "..##..", "..##..", "..##..", ".##...", ".##...",
     ".##...", ".##..."],
    [".####.", "######", "##..##", "##..##", "##..##", ".####.", ".####.", "##..##", "##..##", "##..##", "##..##",
     "######", ".####."],
    [".####.", "######", "##..##", "##..##", "##..##", "##..##", "######", ".#####", "....##", "....##", "##..##",
     "######", ".####."],
]
# The placeholder's colours: clear, the outline, the white tier's four, a grey ramp for the artist
PLACEHOLDER_COLORS = [(0, 0, 0), (21, 21, 21), (119, 119, 119), (185, 185, 185), (239, 239, 239), (255, 255, 255),
                      (64, 64, 72), (96, 96, 104), (128, 128, 136), (160, 160, 168), (184, 184, 192), (208, 208, 216),
                      (224, 224, 232), (40, 40, 48), (80, 80, 88), (112, 112, 120)]
PLACEHOLDER_SHINE_FRAMES = 3


def placeholder() -> bytes:
    """The placeholder sheet: the bold digits in the tier colours (the main colour above, the light shadow from
    two-thirds down) outlined, and three shine frames of a band of the shine colour sweeping across them."""
    rows = 1 + PLACEHOLDER_SHINE_FRAMES
    pixels = bytearray(WIDTH * CELL_HEIGHT * rows)
    for row in range(rows):
        for digit, glyph in enumerate(GLYPHS):
            fill = [[glyph[y // 2][x // 2] == "#" for x in range(12)] for y in range(26)]
            for y in range(28):
                for x in range(14):
                    inside = 0 <= y - 1 < 26 and 0 <= x - 1 < 12 and fill[y - 1][x - 1]
                    near = any(0 <= y - 1 + dy < 26 and 0 <= x - 1 + dx < 12 and fill[y - 1 + dy][x - 1 + dx]
                               for dy in (-1, 0, 1) for dx in (-1, 0, 1))
                    if inside:
                        index = MAIN if y < 18 else LIGHT_SHADOW
                        # The shine: a band leaning right, in row r at a third of the way further each frame
                        band = (x + (27 - y) // 2) - (row * 9 - 4)
                        if row and 0 <= band < 4:
                            index = SHINE
                    elif near:
                        index = OUTLINE
                    else:
                        continue
                    pixels[(row * CELL_HEIGHT + 2 + y) * WIDTH + digit * CELL_WIDTH + 1 + x] = index
    return write_indexed_png(WIDTH, CELL_HEIGHT * rows, bytes(pixels), PLACEHOLDER_COLORS)


# ---- The editor -----------------------------------------------------------------------------------------------------

def sheets() -> list[dict]:
    rows = read_sheet(SHEET)[0] if SHEET.exists() else 1
    return [{"name": "damage_digits", "title": "Damage numbers' digits", "path": SHEET.relative_to(ROOT).as_posix(),
             "tool": TOOL, "width": WIDTH, "height": CELL_HEIGHT * rows, "heightStep": CELL_HEIGHT,
             "maxHeight": CELL_HEIGHT * MAX_ROWS, "description": ABOUT, "palette": True,
             # The tiers' colours, which the page edits with a preview of the sample number in each
             "tierColors": {"file": (entralink_buffs.SOURCE / "buffs.json").relative_to(ROOT).as_posix(),
                            "at": ["settings", "damage_numbers"], "first": TIER_FIRST, "outline": OUTLINE,
                            "sample": "12345"}}]


def settings() -> dict:
    return entralink_buffs.damage_numbers(entralink_buffs.load()["settings"])


def shown(color: tuple[int, int, int]) -> tuple[int, int, int]:
    """A colour as the DS shows it (5 bits an axis), in 8 bits."""
    return tuple(axis * 255 // 31 for axis in color5(color))


def sample(pixels: bytes, colors: list, numbers: dict) -> tuple[int, int, bytes]:
    """'12 345' at its normal size in each tier, a row of 32 pixels each, as RGBA: the digits as the game places them,
    each over the one before."""
    text = "12345"
    advance = CELL_WIDTH - 2 - numbers["overlap"]
    palettes = tier_palettes(colors, numbers)
    height = CELL_HEIGHT * len(palettes)
    out = bytearray(WIDTH * height * 4)
    for t, tier_palette in enumerate(palettes):
        palette = [shown(c) for c in tier_palette]
        x0 = 4
        for i, ch in enumerate(text):
            if i and (len(text) - i) % 3 == 0:
                x0 += numbers["group_space"]
            digit = int(ch)
            for y in range(CELL_HEIGHT):
                for x in range(CELL_WIDTH):
                    index = pixels[y * WIDTH + digit * CELL_WIDTH + x]
                    tx = x0 + x
                    if index and tx < WIDTH:
                        at = ((t * CELL_HEIGHT + y) * WIDTH + tx) * 4
                        out[at:at + 4] = bytes((*palette[index], 255))
            x0 += advance
    return WIDTH, height, bytes(out)


def check(args: list[str]):
    options = {"--palette": None, "--preview": None, "--output": None, "--info": None}
    rest = []
    i = 0
    while i < len(args):
        if args[i] in options and i + 1 < len(args):
            options[args[i]] = args[i + 1]
            i += 2
        else:
            rest.append(args[i])
            i += 1
    if len(rest) != 1:
        sys.exit(__doc__)
    try:
        rows, pixels, colors = read_sheet(Path(rest[0]))
        if options["--palette"] is not None:
            entries = [entry for entry in options["--palette"].split(",") if entry]
            if len(entries) != COLORS or any(len(e) != 7 or e[0] != "#" for e in entries):
                raise ValueError(f"A palette is {COLORS} colours, each #rrggbb.")
            colors = [shown(tuple(int(e[1 + 2 * k:3 + 2 * k], 16) for k in range(3))) for e in entries]
    except (ValueError, OSError) as error:
        sys.exit(f"damage_digits.py: {str(error).replace(f'{rest[0]}: ', '')}")
    used = sorted(set(pixels))
    warnings = []
    if not set(range(TIER_FIRST, TIER_FIRST + TIER_COLORS)) & set(used):
        warnings.append("no pixel uses entries 2-5, so the tiers don't change the digits' colour")
    for row in range(rows):
        for digit in range(DIGITS):
            edges = [pixels[(row * CELL_HEIGHT + y) * WIDTH + digit * CELL_WIDTH + x]
                     for y in range(CELL_HEIGHT) for x in (0, CELL_WIDTH - 1)]
            if any(edges):
                warnings.append(f"row {row + 1}'s {digit} draws in its cell's blank side columns")
    if options["--preview"]:
        palette = [shown(c) for c in colors]
        body = bytearray()
        for index in pixels:
            body += bytes((*palette[index], 0 if index == 0 else 255))
        _, extra_height, extra = sample(pixels, colors, settings())
        Path(options["--preview"]).write_bytes(write_rgba_png(WIDTH, rows * CELL_HEIGHT + extra_height,
                                                              bytes(body) + extra))
    if options["--output"]:
        Path(options["--output"]).write_bytes(write_indexed_png(WIDTH, rows * CELL_HEIGHT, pixels, colors))
    if options["--info"]:
        # The pixels too (an index a hex digit, row by row), for the editor's tier colours' live preview
        Path(options["--info"]).write_text(json.dumps({"colors": ["#%02x%02x%02x" % shown(c) for c in colors],
                                                       "used": used, "warnings": warnings,
                                                       "pixels": "".join("%x" % p for p in pixels)}))
    note = f"; warning: {'; '.join(warnings)}" if warnings else ""
    print(f"{rows} row{'s' if rows > 1 else ''} ({rows - 1} shine frame{'' if rows == 2 else 's'}){note}")


def main():
    args = sys.argv[1:]
    try:
        if args[:1] == ["archive"] and len(args) == 3:
            archive(Path(args[1]), Path(args[2]))
        elif args[:1] == ["placeholder"] and len(args) <= 2:
            out = Path(args[1]) if len(args) == 2 else SHEET
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(placeholder())
        elif args[:1] == ["list"] and len(args) == 1:
            print(json.dumps(sheets()))
        elif args[:1] == ["check"]:
            check(args[1:])
        else:
            sys.exit(__doc__)
    except ValueError as error:
        sys.exit(f"damage_digits.py: {error}")


if __name__ == "__main__":
    main()
