#!/usr/bin/env python3
"""Paper White 2: where each battle sprite's visible pixels are, for the Pokédex Info page's sprite
(paperwhite2_pokedex_info.c, PokedexInfoPage_AddSprite), which stands each Pokémon so that what it shows is centred
in the top screen's grey stripe. pokedex_evo.py adds the table to ARCID_POKEDEX_GRA in the hack's build.

    pokedex_sprites.py check [SPECIES...]   # print the sprites' visible boxes and the table's values

MIDDLES_MEMBER: a u8 for each member of the battle sprites' archive (a/0/0/4, ARCID_POKEGRA) up to the Substitute's,
or with the hack's own form groups and added species (pokemon_graphics.ADDED_FORM_FILES) up to their end, by its number: for a
sprite's characters (front, back and their female versions, of every species, form and egg), how far above its feet,
in pixels, the middle of the sprite's visible pixels is; 0 for the archive's other members. The page reads the one byte at its sprite's characters' number (MCSSLoadInfo.character).

The sprite is measured as MCSS draws it on its first frame (src/system/mcss.c, MCSSSys_Draw and MCSS_DrawQuad): the
multi-cell animation's sequence 0 at frame 0 (in the files as the build makes them from the side's rig,
<side>_rig.json, tools/paperwhite2/mcss_rig.py) gives a multi-cell and its SRT; each of that multi-cell's nodes plays
its cell animation sequence, at frame 0, which gives a cell and its SRT; the cell is drawn as the bin file's quads (each a
rectangle of the characters' image, at its x and y in sixteenths of the sprite's scale), moved by the node's position
and the two SRTs. A pixel is visible where its palette index isn't 0. The sprites' own box in the bin file (its
height and offsetY, which the egg hatching and the evolution centre their sprites by, MCSS_GetHeight) is close for most
sprites but not all: a few pixels off for some, and Chandelure's is 64 pixels off, so the page doesn't use it.
"""
import argparse
import math
import struct
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
# pokemon_graphics imports its siblings by name
sys.path.insert(1, str(ROOT / "tools" / "data"))
from tools.data.nitro_2d import read_indexed_png  # noqa: E402
from tools.data.pokemon_graphics import ADDED_FORM_FILES, added_form_groups, added_species, battle_file  # noqa: E402
from tools.paperwhite2 import mcss_rig  # noqa: E402

# The battle archive's members before the Substitute's (pokemon_graphics.battle_file), 20 to a group. Paper White 2's
# form groups follow the Substitute's files and Arceus' palettes, from ADDED_FORM_FILES; the table then runs to their
# end, with 0 for the files between
SPRITE_MEMBERS = 15020
GROUP_SIZE = 20
# The slots of a group's characters that MCSS draws (the "linear" images), and which side's files go with them
CHARACTER_SLOTS = {2: "front", 3: "front", 11: "back", 12: "back"}
# A quad's x and y are in sixteenths of the sprite's scale, which is 16 (a pixel to a pixel)
QUAD_UNIT = 16


class SpriteError(Exception):
    pass


def first_block(blob):
    """A Nitro file's first block's data, after the file's header (16 bytes) and the block's (8)."""
    return blob[0x18:]


def animation_bank(blob):
    """An animation bank (NANR, NMAR): each sequence's frames, as (index, rotation, x scale, y scale, x, y)."""
    data = first_block(blob)
    count, _, sequences, frames, results = struct.unpack_from("<HHIII", data, 0)
    out = []
    for i in range(count):
        frame_count, _, kind, _, first = struct.unpack_from("<HHIII", data, sequences + i * 16)
        sequence = []
        for frame in range(frame_count):
            content = results + struct.unpack_from("<I", data, frames + first + frame * 8)[0]
            element = kind & 0xFFFF
            if element == 0:
                sequence.append((struct.unpack_from("<H", data, content)[0], 0, 1.0, 1.0, 0, 0))
            elif element == 1:
                index, rotation, scale_x, scale_y, x, y = struct.unpack_from("<HHiihh", data, content)
                sequence.append((index, rotation, scale_x / 4096, scale_y / 4096, x, y))
            else:
                index, _, x, y = struct.unpack_from("<HHhh", data, content)
                sequence.append((index, 0, 1.0, 1.0, x, y))
        out.append(sequence)
    return out


def multi_cell_bank(blob):
    """A multi-cell bank (NMCR): each multi-cell's nodes, as (cell animation sequence, x, y, attributes)."""
    data = first_block(blob)
    count, _, cells, nodes = struct.unpack_from("<HHII", data, 0)
    out = []
    for i in range(count):
        node_count, _, first = struct.unpack_from("<HHI", data, cells + i * 8)
        out.append([struct.unpack_from("<HhhH", data, nodes + first + k * 8) for k in range(node_count)])
    return out


def transform(x, y, srt):
    """A point, y up, through an SRT as MCSS applies it: scaled, turned (G3_RotZ(-sin, cos)), then moved (its y down)."""
    _, rotation, scale_x, scale_y, move_x, move_y = srt
    x, y = x * scale_x, y * scale_y
    angle = rotation / 65536 * 2 * math.pi
    sin, cos = -math.sin(angle), math.cos(angle)
    return x * cos - y * sin + move_x, x * sin + y * cos - move_y


@lru_cache(maxsize=4)
def side_files(folder, side):
    """A side's files from its rig, the NANR uncompressed."""
    try:
        return mcss_rig.files_from_rig(mcss_rig.read_side(folder, side), compress=False)
    except mcss_rig.RigError as error:
        raise SpriteError(str(error)) from None


def visible_box(folder, side, image):
    """The visible pixels' top and bottom on the sprite's first frame, in pixels down from its feet (its origin), or
    None if it shows none."""
    files = side_files(folder, side)
    info = files["info"]
    count = struct.unpack_from("<I", info, 0)[0]
    quads = [struct.unpack_from("<12i", info, 12 + i * 48) for i in range(count)]
    width, _, pixels, _ = read_indexed_png(image)
    cell_sequences = animation_bank(files["animations"])
    multi_sequences = animation_bank(files["multi_animations"])
    multi_cells = multi_cell_bank(files["multi_cells"])
    multi = multi_sequences[0][0]
    top = bottom = None
    for sequence, node_x, node_y, _ in multi_cells[multi[0]]:
        cell = cell_sequences[sequence][0]
        node = (0, 0, 1.0, 1.0, node_x, node_y)
        for quad in (quads[cell[0]][:6], quads[cell[0]][6:]):
            quad_x, quad_y, quad_width, quad_height, s, t = (value / 4096 for value in quad)
            if quad_width == 0:
                continue
            for v in range(int(quad_height)):
                row = (int(t) + v) * width + int(s)
                shown = [u for u in range(int(quad_width)) if pixels[row + u]]
                if not shown:
                    continue
                # The corners of the row's first and last visible pixels: the extremes of a row, however turned
                for u in (shown[0], shown[0] + 1, shown[-1], shown[-1] + 1):
                    for dv in (0, 1):
                        x, y = quad_x * QUAD_UNIT + u, quad_y * QUAD_UNIT - v - dv
                        x, y = transform(x, y, cell)
                        x, y = transform(x, y, node)
                        x, y = transform(x, y, multi)
                        top = -y if top is None else min(top, -y)
                        bottom = -y if bottom is None else max(bottom, -y)
    return None if top is None else (top, bottom)


def middles():
    """Each battle archive member's value of MIDDLES_MEMBER, and the boxes measured, by member."""
    added = (added_form_groups() + len(added_species())) * GROUP_SIZE
    table = bytearray(ADDED_FORM_FILES + added if added else SPRITE_MEMBERS)
    boxes = {}
    for index in [*range(SPRITE_MEMBERS), *range(ADDED_FORM_FILES, ADDED_FORM_FILES + added)]:
        side = CHARACTER_SLOTS.get((index - ADDED_FORM_FILES if index >= ADDED_FORM_FILES else index) % GROUP_SIZE)
        if side is None:
            continue
        image, _, _ = battle_file(ROOT / "res" / "pokemon", index, False)
        if not image.is_file():
            continue
        box = visible_box(image.parent, side, image)
        if box is None:
            continue
        middle = round(-(box[0] + box[1]) / 2)
        if not 0 <= middle <= 0xFF:
            raise SpriteError(f"{image}: its middle is {middle} pixels above its feet, past a u8")
        table[index] = middle
        boxes[index] = (image, box)
    return bytes(table), boxes


def middles_member():
    return middles()[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("check")
    command.add_argument("species", nargs="*")
    args = parser.parse_args()
    try:
        table, boxes = middles()
    except SpriteError as error:
        sys.exit(f"pokedex_sprites.py: {error}")
    for index, (image, (top, bottom)) in sorted(boxes.items()):
        name = image.relative_to(ROOT / "res" / "pokemon")
        if not args.species or name.parts[0] in args.species:
            print(f"{index:5} {str(name):40} top {top:6.1f} bottom {bottom:6.1f} middle {table[index]}")
    tallest = max(boxes.items(), key=lambda item: item[1][1][1] - item[1][1][0])
    print(f"{len(boxes)} sprites; the tallest {tallest[1][0].relative_to(ROOT)}, "
          f"{tallest[1][1][1] - tallest[1][1][0]:.0f} pixels")


if __name__ == "__main__":
    main()
