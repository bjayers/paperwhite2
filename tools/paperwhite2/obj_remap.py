#!/usr/bin/env python3
"""Converts a sprite's characters and cells from one 1D OBJ character mapping to another, so that a screen whose
engine maps its OBJ characters otherwise can show it. A cell names each object's first character in units of the
mapping (two characters at 1D 64K, four at 1D 128K), so an object of the 64K mapping can start where the 128K one
can't: each object's characters are copied to a start the new mapping can name, a run that several objects share
once, and the cells are written again with the new names and mapping. The animations are the same.

    obj_remap.py CHARS.png CELLS.ncer FROM TO OUT.png OUT.ncer

CHARS.png is the sprite's characters as res/ keeps them (rows of four 8 by 8 tiles, 4bpp), FROM and TO the mappings
as a cell bank numbers them (0 1D 32K, 1 1D 64K, 2 1D 128K, 3 1D 256K). Paper White 2 uses it for the move
relearner's cursor (res/graphics/move_tutor/ 17.png and 07.ncer, 64K) on the Pokédex's bottom screen (128K):

    obj_remap.py res/graphics/move_tutor/17.png res/graphics/move_tutor/07.ncer 1 2 \\
        res/graphics/pokedex_gra/137.png res/graphics/pokedex_gra/138.ncer
"""
import argparse
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.nitro_2d import read_indexed_png, write_indexed_png  # noqa: E402
from tools.paperwhite2.nitro_cells import CellBank  # noqa: E402

TILE = 8
ROW_TILES = 4
# An object's size in tiles by its shape (square, wide, tall) and size
OBJ_TILES = {
    0: [(1, 1), (2, 2), (4, 4), (8, 8)],
    1: [(2, 1), (4, 1), (4, 2), (8, 4)],
    2: [(1, 2), (1, 4), (2, 4), (4, 8)],
}


def tiles_of(pixels, width, height):
    """The PNG's 8 by 8 tiles in order, each as its 64 pixels."""
    across = width // TILE
    tiles = []
    for t in range(across * (height // TILE)):
        x, y = t % across * TILE, t // across * TILE
        tiles.append(b"".join(bytes(pixels[(y + r) * width + x:(y + r) * width + x + TILE]) for r in range(TILE)))
    return tiles


def remap(chars, cells, source, target):
    """Returns the new tiles and cell bank."""
    width, height, pixels, colors = read_indexed_png(chars)
    tiles = tiles_of(pixels, width, height)
    bank = CellBank(cells.read_bytes())
    old_unit, new_unit = 1 << source, 1 << target
    out = []
    starts = {}
    for cell in bank.cells:
        objs = []
        for obj in cell.objs:
            w, h = OBJ_TILES[obj.attr0 >> 14][obj.attr1 >> 14]
            run = (obj.tile * old_unit, w * h)
            if run not in starts:
                out += [bytes(TILE * TILE)] * (-len(out) % new_unit)
                starts[run] = len(out) // new_unit
                out += tiles[run[0]:run[0] + run[1]]
            objs.append(obj.with_tile(starts[run]))
        cell.objs = objs
    out += [bytes(TILE * TILE)] * (-len(out) % ROW_TILES)
    # The bank's mapping, the first word after its cells' offset
    bank.tail = struct.pack("<I", target) + bank.tail[4:]
    rows = len(out) // ROW_TILES
    image = bytearray(ROW_TILES * TILE * rows * TILE)
    for t, tile in enumerate(out):
        x, y = t % ROW_TILES * TILE, t // ROW_TILES * TILE
        for r in range(TILE):
            start = (y + r) * ROW_TILES * TILE + x
            image[start:start + TILE] = tile[r * TILE:(r + 1) * TILE]
    return write_indexed_png(ROW_TILES * TILE, rows * TILE, bytes(image), list(colors)[:16]), bank.to_bytes()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("chars", type=Path)
    parser.add_argument("cells", type=Path)
    parser.add_argument("source", type=int, choices=range(4))
    parser.add_argument("target", type=int, choices=range(4))
    parser.add_argument("out_chars", type=Path)
    parser.add_argument("out_cells", type=Path)
    args = parser.parse_args()
    png, ncer = remap(args.chars, args.cells, args.source, args.target)
    args.out_chars.write_bytes(png)
    args.out_cells.write_bytes(ncer)
    print(f"wrote {args.out_chars} and {args.out_cells}")


if __name__ == "__main__":
    main()
