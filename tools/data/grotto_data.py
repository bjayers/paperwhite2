#!/usr/bin/env python3
"""The Hidden Grottoes' Pokémon and items in res/field/grottoes/, one JSON file per grotto: dump writes them from the
ROM once, and pack builds the archive (a/2/7/3) from them, which the build does.

    grotto_data.py dump extract/w2_us/files res/field/grottoes
    grotto_data.py pack res/field/grottoes ARCHIVE

The archive has a file of 220 bytes for each of the 20 grottoes (HollowFile in src/ov036/scrcmd_hidden_hollow.c), in
the order of the grottoes' entrances in src/ov012/hidden_hollow.c, which GROTTOES follows: each source is named after
the location of its entrance's zone, with _a and _b for the two grottoes of one zone in that order. Every day the
game rolls a grotto's slot (0 to 10, hidden_hollow_generate.c) and a group (0 to 3). Slots 0 to 2 are Pokémon, each a
species, levels, gender ratio and form for each group, with a set for each version in every file: the game reads
White 2's set or Black 2's. Slots 3 to 6 are items lying in the grotto, and slots 7 to 10 hidden items, each an item
for each group. Both versions read the same archive. grotto.schema.json describes each field.
"""
import argparse
import functools
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.datajson import DataError, label, load, load_schema, name, value, write  # noqa: E402
from tools.data.gen_constants import load as load_list  # noqa: E402
from tools.data.narc import read_narc, write_narc  # noqa: E402

ARCHIVE = "a/2/7/3"
# The grottoes in the order of HIDDEN_HOLLOW_ENTRANCES (src/ov012/hidden_hollow.c), named after their zones
GROTTOES = [
    "floccesy_ranch",           # ZONE_FLOCCESY_RANCH_2
    "route_5",
    "lostlorn_forest",
    "route_6_a",
    "route_6_b",
    "route_7",
    "route_13_a",
    "route_13_b",
    "route_9",
    "giant_chasm",              # ZONE_GIANT_CHASM_3
    "route_22",
    "route_23",
    "abundant_shrine_a",
    "abundant_shrine_b",
    "pinwheel_forest_inside",   # ZONE_PINWHEEL_FOREST_2, the forest's own map
    "pinwheel_forest_outside",  # ZONE_PINWHEEL_FOREST, on the overworld's map
    "route_3_a",
    "route_3_b",
    "route_2",
    "route_18",
]
# HollowFile.slots: White 2's three slots of Pokémon, then Black 2's (HOLLOW_FILE_VERSION)
VERSIONS = ["white2", "black2"]
POKEMON_SLOTS = 3
GROUPS = 4
ITEM_SLOTS = 4
# HollowSlot: species[4], maxLevel[4], minLevel[4], femaleBelow[4], form[4], unk18[2]
SLOT = struct.Struct("<4H4B4B4B4B2B")
ITEMS = struct.Struct(f"<{ITEM_SLOTS * GROUPS}H")
FILE_SIZE = 2 * POKEMON_SLOTS * SLOT.size + 2 * ITEMS.size


@functools.cache
def item_names() -> dict[int, str]:
    # From items.txt alone: name("ITEM_", ...) would also find the ITEM_ICON_ constants of item_icons.txt
    return {v: k for k, v in reversed(load_list("items").items())}


def item_name(item: int) -> str | int:
    return item_names().get(item, item)


# Dumping


def slot_json(data: bytes, offset: int) -> dict:
    fields = SLOT.unpack_from(data, offset)
    species, max_level, min_level, female_below, form = (fields[i:i + 4] for i in range(0, 20, 4))
    groups = [{"species": name("SPECIES_", species[g]), "min_level": min_level[g], "max_level": max_level[g],
               "female_below": female_below[g], "form": form[g]} for g in range(GROUPS)]
    return {"groups": groups, "unk18": list(fields[20:22])}


def items_json(data: bytes, offset: int) -> list:
    items = ITEMS.unpack_from(data, offset)
    return [[item_name(item) for item in items[GROUPS * s:GROUPS * (s + 1)]] for s in range(ITEM_SLOTS)]


def grotto_json(data: bytes) -> dict:
    if len(data) != FILE_SIZE:
        raise ValueError(f"a grotto's file is {len(data)} bytes, not {FILE_SIZE}")
    grotto = {"$schema": "grotto.schema.json"}
    for v, version in enumerate(VERSIONS):
        grotto[version] = [slot_json(data, (POKEMON_SLOTS * v + s) * SLOT.size) for s in range(POKEMON_SLOTS)]
    items = 2 * POKEMON_SLOTS * SLOT.size
    grotto["items"] = items_json(data, items)
    grotto["hidden_items"] = items_json(data, items + ITEMS.size)
    return grotto


def dump(files: Path, output: Path):
    members = read_narc((files / ARCHIVE).read_bytes())
    if len(members) != len(GROTTOES):
        sys.exit(f"{len(members)} grottoes in the archive, not {len(GROTTOES)}")
    for grotto, data in zip(GROTTOES, members):
        write(output / f"{grotto}.json", grotto_json(data))
    print(f"wrote {len(members)} grottoes to {output}")


# Packing


def slot_bytes(slot: dict, where: str) -> bytes:
    groups = slot["groups"]
    return SLOT.pack(*(value(g["species"], where) for g in groups), *(g["max_level"] for g in groups),
                     *(g["min_level"] for g in groups), *(g["female_below"] for g in groups),
                     *(g["form"] for g in groups), *slot["unk18"])


def items_bytes(items: list, where: str) -> bytes:
    return ITEMS.pack(*(value(item, where) for slot in items for item in slot))


def grotto_bytes(grotto: dict, where: str) -> bytes:
    data = b"".join(slot_bytes(slot, f"{where}: {version}") for version in VERSIONS for slot in grotto[version])
    return data + items_bytes(grotto["items"], where) + items_bytes(grotto["hidden_items"], where)


def pack(root: Path, output: Path):
    schema = load_schema(root / "grotto.schema.json")
    members = []
    for grotto in GROTTOES:
        path = root / f"{grotto}.json"
        if not path.is_file():
            raise DataError(f"{label(path)} is missing: every grotto of GROTTOES has a file")
        members.append(grotto_bytes(load(path, schema), label(path)))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(write_narc(members))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    dump_parser = commands.add_parser("dump", help="write res/field/grottoes/ from the extracted files")
    dump_parser.add_argument("files", type=Path, help="the extracted files/ directory")
    dump_parser.add_argument("output", type=Path)
    pack_parser = commands.add_parser("pack", help="build the grottoes' archive from res/field/grottoes/")
    pack_parser.add_argument("root", type=Path)
    pack_parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.command == "dump":
        dump(args.files, args.output)
        return
    try:
        pack(args.root, args.output)
    except DataError as error:
        sys.exit(f"error: {error}")


if __name__ == "__main__":
    main()
