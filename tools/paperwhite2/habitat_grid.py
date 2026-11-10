#!/usr/bin/env python3
"""Paper White 2: the Habitat List grid's colours for the All method and for Dark Grass, a member of the Pokédex's
graphics archive (ARCID_POKEDEX_GRA) that pokedex_evo.py adds, derived at build time from the walking terrains' green.

    habitat_grid.py show ARCHIVE      # print the green rows and the derived ones, from a packed a/1/5/7

The grid's cells take main BG palette rows 9 to 11 (filled, the cursor's other end, empty;
src/ov303/pokedex_habitat_graphic.c), whose colours 1 to 4 (the cell's line, the gaps, the shade and the box,
paperwhite2_habitat_dex.c's COLOR_*) are the kind's: member 49's rows 9-11 green for land, member 50's rows 0-2 blue
for surfing and 3-5 dark blue for fishing. The cursor fades between rows 9 and 10. This member has member 50's
layout: rows 0-2 All's, rows 3-5 Dark Grass's, each green row with its colours 1 to 4 changed and the rest kept:

- All: a neutral grey of each green colour's lightness (its Rec. 601 luma), so the grey's shades, the cursor's
  contrast and the white note's stay as the green's;
- Dark Grass: each green colour scaled by DARK_GRASS_SHADE, the same hue, darker by the same ratio in every shade.
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.narc import read_narc  # noqa: E402
from tools.data.nitro_2d import palette_colors, palette_resource  # noqa: E402

# The green palette's member and its grid rows, and the colours of a row that the kind changes
GREEN_MEMBER = 49
GREEN_ROWS = (9, 10, 11)
KIND_COLORS = range(1, 5)
# How much darker Dark Grass's green is than the walking terrains'
DARK_GRASS_SHADE = 0.72
# The member's GXTexFmt, as member 50's
PALETTE_FORMAT = 4


def grey(color):
    luma = round(0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2])
    return (luma, luma, luma)


def dark(color):
    return tuple(round(axis * DARK_GRASS_SHADE) for axis in color)


def rows(green_nclr: bytes) -> list[list[tuple]]:
    """The member's six rows from the green palette resource (member 49)."""
    colors = palette_colors(green_nclr)
    green = [colors[row * 16:row * 16 + 16] for row in GREEN_ROWS]
    out = []
    for change in (grey, dark):
        for row in green:
            out.append([change(c) if i in KIND_COLORS else c for i, c in enumerate(row)])
    return out


def member(green_nclr: bytes) -> bytes:
    return palette_resource([c for row in rows(green_nclr) for c in row], PALETTE_FORMAT)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    show = commands.add_parser("show")
    show.add_argument("archive", type=Path)
    args = parser.parse_args()
    green = read_narc(args.archive.read_bytes())[GREEN_MEMBER]
    colors = palette_colors(green)
    for row in GREEN_ROWS:
        print(f"green row {row}:", colors[row * 16 + 1:row * 16 + 5])
    for index, row in enumerate(rows(green)):
        print(f"{'all' if index < 3 else 'dark grass'} row {index}:", row[1:5])


if __name__ == "__main__":
    main()
