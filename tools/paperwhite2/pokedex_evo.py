#!/usr/bin/env python3
"""Paper White 2: the Pokédex Info page's Evo data, its sprites' places and its Area data, members of the Pokédex's
graphics archive (ARCID_POKEDEX_GRA, a/1/5/7) after its own (docs/paperwhite2/plugins.md, Pokédex).

    pokedex_evo.py archive ARCHIVE_IN ARCHIVE_OUT [--flavour FILE]   # the build: the archive with its nine members
    pokedex_evo.py check                                             # print the largest families

The game's evolution data (a/0/1/9, res/pokemon/*/data.json's "evolutions") only names what each species evolves
into, so the page needs each species' family root to draw its tree from (paperwhite2_pokedex_info_evo.c):

- FAMILY_MEMBER: a u16 for each species by its number, from SPECIES_NONE to the last species (species_list.py): its
  family's root, the species that no other evolves into (itself for one that doesn't evolve, 0 for SPECIES_NONE). A
  species is a child of the first species whose evolutions name it, in the species' order. Forms have no evolution
  lists of their own: the game reads a species' evolutions by its species (evolution_check.c), and an evolution may be
  for one form only (its "form", docs/paperwhite2/design/form-evolutions.md), so a form evolves by its species' list
  as the form condition allows and keeps its form number (Burmy's cloaks into Wormadam's). Where a species is reached
  from its root only through evolutions for one form (Sirfetch'd from a Galarian Farfetch'd), the entry has that form
  plus one in its high bits, FAMILY_FORM_SHIFT on, so that the page draws the root's tree in that form; else 0 there,
  and the page uses the shown Pokémon's form.
- BALLS_MEMBER: the tree's Poké Ball icons, res/paperwhite2/pokedex_art/evo_ball_{caught,seen,unknown}.png (16 by 16,
  indexed in the art's palette, the top screen's row 0, info_stats.png's): their 16 colors (BGR555, 32 bytes), then
  each one's 4 tiles of 4bpp, two across, in that order (3 times 128 bytes). The page loads the colors as the Evo
  window's palette, so its text's colors are the art's (EVO_COLOR_* in the C file).
- MIDDLES_MEMBER: how far above its feet each battle sprite's visible middle is, for the page's sprite
  (pokedex_sprites.py, which says how it is measured; SPRITE_MIDDLES_FILE in paperwhite2_pokedex_info.c).
- AREA_INDEX_MEMBER: the Area sub-page's index of each species' places and methods in the wild (encounters.py's
  area_index, from res/paperwhite2/encounters/ and the town map's places).
- AREA_ICONS_MEMBER: the Area sub-page's icons and their palette rows (pokedex_area.py, from area_icons.png).
- AREA_BOX_MEMBER: the Area sub-page's box of the current Pokémon on the top screen (pokedex_area.py's box_member,
  from area_top_box.png).
- HABITAT_GRID_MEMBER: the Habitat List grid's colours for the All method (grey) and Dark Grass (a darker green),
  derived from the archive's own green (habitat_grid.py; GRID_COLORS_FILE in src/ov303/pokedex_habitat_graphic.c).
- FLAVOUR_MEMBER: the other games' Pokédex entries for the Info page's Flavour, the file that dex_flavour.py's build
  command wrote from the user's ROMs (FLAVOUR_FILE in paperwhite2_pokedex_info_flavour.c); without one, a member with
  no entries.
- TAB_MEMBER: the version tab that names the game of the entry shown (dex_flavour.py's tab_member, from
  version_flavour.png; TAB_FILE there).

A family has at most FAMILY_MAX species (Eevee's 8), the rows the page has room for; check fails past it.
"""
import argparse
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.datajson import constants  # noqa: E402
from tools.data.narc import read_narc, write_narc  # noqa: E402
from tools.data.nitro_2d import read_indexed_png  # noqa: E402
from tools.data.datajson import DataError  # noqa: E402
from tools.data import species_list  # noqa: E402
from tools.paperwhite2.dex_flavour import FlavourError, tab_member  # noqa: E402
from tools.paperwhite2.dex_flavour import member as flavour_member  # noqa: E402
from tools.paperwhite2.encounters import area_index  # noqa: E402
from tools.paperwhite2.habitat_grid import GREEN_MEMBER  # noqa: E402
from tools.paperwhite2.habitat_grid import member as habitat_grid_member  # noqa: E402
from tools.paperwhite2.pokedex_area import IconError  # noqa: E402
from tools.paperwhite2.pokedex_area import box_member as area_box_member  # noqa: E402
from tools.paperwhite2.pokedex_area import member as area_icons_member  # noqa: E402
from tools.paperwhite2.pokedex_sprites import SpriteError, middles_member  # noqa: E402

SPECIES = ROOT / "res" / "pokemon"
ART = ROOT / "res" / "paperwhite2" / "pokedex_art"
BALLS = ("evo_ball_caught.png", "evo_ball_seen.png", "evo_ball_unknown.png")
# The archive's own members (the art's included, up to 158), then these, as EVO_FAMILY_FILE and EVO_BALLS_FILE in
# paperwhite2_pokedex_info_evo.c and SPRITE_MIDDLES_FILE in paperwhite2_pokedex_info.c
ARCHIVE_MEMBERS = 159
FAMILY_MEMBER = ARCHIVE_MEMBERS
BALLS_MEMBER = ARCHIVE_MEMBERS + 1
MIDDLES_MEMBER = ARCHIVE_MEMBERS + 2
# The Area sub-page's index (encounters.py's area_index), icons and box (pokedex_area.py), AREA_INDEX_FILE,
# AREA_ICONS_FILE and AREA_BOX_FILE in paperwhite2_pokedex_info_area.c (the icons' also ICONS_FILE in
# paperwhite2_habitat_dex.c, the Habitat List's)
AREA_INDEX_MEMBER = ARCHIVE_MEMBERS + 3
AREA_ICONS_MEMBER = ARCHIVE_MEMBERS + 4
AREA_BOX_MEMBER = ARCHIVE_MEMBERS + 5
# The Habitat List grid's colours of All and Dark Grass (habitat_grid.py), GRID_COLORS_FILE in
# src/ov303/pokedex_habitat_graphic.c
HABITAT_GRID_MEMBER = ARCHIVE_MEMBERS + 6
# The Info page's Flavour: the other games' entries and the version tab (dex_flavour.py), FLAVOUR_FILE and TAB_FILE in
# paperwhite2_pokedex_info_flavour.c
FLAVOUR_MEMBER = ARCHIVE_MEMBERS + 7
TAB_MEMBER = ARCHIVE_MEMBERS + 8
# POKEDEX_INFO_EVO_FAMILY_MAX in include/paperwhite2/pokedex_info.h
FAMILY_MAX = 8
# EVO_FAMILY_FORM_SHIFT in paperwhite2_pokedex_info_evo.c: a family entry's root species below it, the root's form
# plus one from it, so species stay below 2048
FAMILY_FORM_SHIFT = 11
BALL_SIZE = 16


class EvoError(Exception):
    pass


def evolutions():
    """Each species' number with the numbers of the species it evolves into, in its data's order, each with the form
    that evolves into it, or None where any form does (an evolution without a form condition, or ones for several)."""
    numbers = constants()
    out = {}
    for path in sorted(SPECIES.glob("*/data.json")):
        number = numbers.get(f"SPECIES_{path.parent.name.upper()}")
        if number is None:
            continue
        data = json.loads(path.read_text())
        forms = {}
        for e in data.get("evolutions") or []:
            if e["species"] in numbers:
                forms.setdefault(numbers[e["species"]], set()).add(e.get("form"))
        out[number] = [(child, next(iter(f)) if len(f) == 1 else None) for child, f in forms.items()]
    return out


def roots():
    """Each species' family root, from SPECIES_NONE to the last species, with the root's form plus one in the high bits
    where only that form leads to the species; and the families' sizes."""
    last = species_list.last_real_species()
    children = evolutions()
    parent = {}
    for species in sorted(children):
        for child, form in children[species]:
            if child != species:
                parent.setdefault(child, (species, form))
    out = []
    for species in range(last + 1):
        root, seen, root_form = species, set(), None
        while root in parent:
            if root in seen:
                raise EvoError(f"species {species}'s evolutions loop")
            seen.add(root)
            root, form = parent[root]
            # the condition nearest the root decides, as the form is kept from there on
            if form is not None:
                root_form = form
        if root >= 1 << FAMILY_FORM_SHIFT:
            raise EvoError(f"species {root} is past the family table's {1 << FAMILY_FORM_SHIFT} species")
        out.append(root if root_form is None else root | (root_form + 1) << FAMILY_FORM_SHIFT)
    sizes = {}
    for species, entry in enumerate(out):
        if species:
            root = entry & ((1 << FAMILY_FORM_SHIFT) - 1)
            sizes[root] = sizes.get(root, 0) + 1
    for root, size in sizes.items():
        if size > FAMILY_MAX:
            raise EvoError(f"species {root}'s family has {size} species, more than the page's {FAMILY_MAX}")
    return out, sizes


def family_member():
    table, _ = roots()
    return struct.pack(f"<{len(table)}H", *table)


def to_555(color):
    r, g, b = (round(c * 31 / 255) for c in color[:3])
    return r | g << 5 | b << 10


def balls_member():
    palette = None
    tiles = bytearray()
    for name in BALLS:
        width, height, pixels, colors = read_indexed_png(ART / name)
        if (width, height) != (BALL_SIZE, BALL_SIZE) or max(pixels) > 15:
            raise EvoError(f"{name}: must be {BALL_SIZE} by {BALL_SIZE}, indexed in 16 colors")
        colors16 = [to_555(c) for c in (list(colors) + [(0, 0, 0)] * 16)[:16]]
        if palette is None:
            palette = colors16
        elif colors16 != palette:
            raise EvoError(f"{name}: its palette isn't {BALLS[0]}'s; the balls share one")
        for tile_y in range(0, BALL_SIZE, 8):
            for tile_x in range(0, BALL_SIZE, 8):
                for y in range(8):
                    row = pixels[(tile_y + y) * BALL_SIZE + tile_x:(tile_y + y) * BALL_SIZE + tile_x + 8]
                    tiles += bytes(row[i] | row[i + 1] << 4 for i in range(0, 8, 2))
    return struct.pack("<16H", *palette) + bytes(tiles)


def archive(source, output, flavour=None):
    files = read_narc(source.read_bytes())
    if len(files) != ARCHIVE_MEMBERS:
        raise EvoError(f"{source}: {len(files)} members, not the {ARCHIVE_MEMBERS} that the Evo members follow "
                       f"(change ARCHIVE_MEMBERS here, EVO_FAMILY_FILE and EVO_BALLS_FILE in "
                       f"paperwhite2_pokedex_info_evo.c, SPRITE_MIDDLES_FILE in paperwhite2_pokedex_info.c and "
                       f"AREA_INDEX_FILE, AREA_ICONS_FILE and AREA_BOX_FILE in paperwhite2_pokedex_info_area.c, and "
                       f"ICONS_FILE in paperwhite2_habitat_dex.c)")
    files += [family_member(), balls_member(), middles_member(), area_index(), area_icons_member(),
              area_box_member(), habitat_grid_member(files[GREEN_MEMBER]),
              flavour.read_bytes() if flavour is not None else flavour_member({}), tab_member()]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(write_narc(files))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("archive")
    command.add_argument("source", type=Path)
    command.add_argument("output", type=Path)
    command.add_argument("--flavour", type=Path)
    commands.add_parser("check")
    args = parser.parse_args()
    try:
        if args.command == "archive":
            archive(args.source, args.output, args.flavour)
        else:
            _, sizes = roots()
            largest = sorted(sizes.items(), key=lambda item: -item[1])[:5]
            print("largest families (root species, size):", largest, "; balls", len(balls_member()), "bytes")
    except (EvoError, SpriteError, DataError, IconError, FlavourError) as error:
        sys.exit(f"pokedex_evo.py: {error}")


if __name__ == "__main__":
    main()
