#!/usr/bin/env python3
"""The Pokédex's habitat lists in res/pokedex/habitats/, one JSON file per area: dump writes them from the ROM once, and
pack builds the archive (a/2/9/6, ARCID_POKEDEX_HABITAT) from them, which the build does.

    habitat_data.py dump extract/w2_us/files res/pokedex/habitats
    habitat_data.py pack res/pokedex/habitats ARCHIVE

An area's file (PokedexHabitatFile in include/app/pokedex_common.h) lists up to 30 species, and for each whether it
lives there in each season, by kind of habitat: land, water (surfing) and fishing. The habitat screen shows an area
when the player has reached one of the habitats it has: land always, water and fishing after the flags of
pokedex_common.c's PokedexCommon_GetConditions. sPokedexHabitats in src/ov302/pokedex_common.c (and its copy in
src/ov303/pokedex_habitat.c) gives each area's zone and file, and AREAS follows it: each source is named after its
area's zone. No area names file 16, which is unused.json. habitat.schema.json describes each field.
"""
import argparse
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.datajson import DataError, label, load, load_schema, name, value, write  # noqa: E402
from tools.data.narc import read_narc, write_narc  # noqa: E402

ARCHIVE = "a/2/9/6"
# The archive's files, by the zones that sPokedexHabitats gives them
AREAS = [
    "route_4", "route_15", "route_21", "clay_tunnel", "twist_mountain", "village_bridge", "dragonspiral_tower",
    "relic_passage", "route_16", "route_5", "marvelous_bridge", "abundant_shrine", "undella_town", "route_6",
    "undella_bay", "wellspring_cave", "unused", "route_18", "giant_chasm", "route_7", "victory_road", "relic_castle",
    "striaton_city", "route_19", "aspertia_city", "route_8", "floccesy_ranch", "strange_house", "route_20",
    "virbank_city", "castelia_sewers", "route_9", "virbank_complex", "p2_laboratory", "castelia_city",
    "pinwheel_forest", "humilau_city", "reversal_mountain", "dreamyard", "celestial_tower_2", "route_22",
    "desert_resort", "route_11", "route_17", "route_1", "route_23", "moor_of_icirrus", "route_12", "route_2",
    "mistralton_cave", "route_13", "route_3", "icirrus_city", "driftveil_drawbridge", "seaside_cave",
    "lostlorn_forest", "route_14", "chargestone_cave",
]
SEASONS = ["spring", "summer", "autumn", "winter"]
TYPES = ["land", "water", "fishing"]
# The habitat screen's message for an area's land (PokedexHabitat_GetHabitatMessage), by unk6
LAND_TEXTS = ["tall_grass", "sand", "swamp", "this_place", "at_this_place", "land", "none"]
# values[3], conditions[3], unk6, count
HEADER = struct.Struct("<3B3BHH")
# species, present[4][3], other[4][3], unk1a
ENTRY = struct.Struct("<H12B12BH")
MAX_SPECIES = 30


# Dumping


def flag(number: int, what: str) -> bool:
    if number not in (0, 1):
        raise ValueError(f"{what} is {number}, not 0 or 1")
    return bool(number)


def entry_json(data: bytes, offset: int) -> dict:
    species, *rest = ENTRY.unpack_from(data, offset)
    present, other, unk1a = rest[:12], rest[12:24], rest[24]
    entry = {"species": name("SPECIES_", species)}
    for t, kind in enumerate(TYPES):
        entry[kind] = [season for s, season in enumerate(SEASONS)
                       if flag(present[3 * s + t], f"species {species}'s {season} {kind}")]
    if any(other):
        entry["forms"] = {kind: [other[3 * s + t] for s in range(len(SEASONS))] for t, kind in enumerate(TYPES)}
    if unk1a:
        entry["unk1a"] = unk1a
    return entry


def area_json(data: bytes) -> dict:
    *header, unk6, count = HEADER.unpack_from(data)
    by_season, habitats = header[:3], header[3:]
    if len(data) != HEADER.size + ENTRY.size * count or count > MAX_SPECIES:
        raise ValueError(f"an area's file of {len(data)} bytes has {count} species")
    return {
        "$schema": "habitat.schema.json",
        "land_text": LAND_TEXTS[unk6] if unk6 < len(LAND_TEXTS) else unk6,
        "habitats": {kind: flag(habitats[t], f"the {kind} habitat") for t, kind in enumerate(TYPES)},
        "by_season": {kind: flag(by_season[t], f"{kind}'s by_season") for t, kind in enumerate(TYPES)},
        "species": [entry_json(data, HEADER.size + ENTRY.size * i) for i in range(count)],
    }


def dump(files: Path, output: Path):
    members = read_narc((files / ARCHIVE).read_bytes())
    if len(members) != len(AREAS):
        sys.exit(f"{len(members)} areas in the archive, not {len(AREAS)}")
    for area, data in zip(AREAS, members):
        write(output / f"{area}.json", area_json(data))
    print(f"wrote {len(members)} areas to {output}")


# Packing


def entry_bytes(entry: dict, where: str) -> bytes:
    present = [int(season in entry[kind]) for season in SEASONS for kind in TYPES]
    forms = entry.get("forms", {kind: [0] * len(SEASONS) for kind in TYPES})
    other = [forms[kind][s] for s in range(len(SEASONS)) for kind in TYPES]
    return ENTRY.pack(value(entry["species"], where), *present, *other, entry.get("unk1a", 0))


def area_bytes(area: dict, where: str) -> bytes:
    land_text = area["land_text"]
    land_text = LAND_TEXTS.index(land_text) if isinstance(land_text, str) else land_text
    species = area["species"]
    data = HEADER.pack(*(int(area["by_season"][kind]) for kind in TYPES),
                       *(int(area["habitats"][kind]) for kind in TYPES), land_text, len(species))
    return data + b"".join(entry_bytes(entry, f"{where}: species[{i}]") for i, entry in enumerate(species))


def pack(root: Path, output: Path):
    schema = load_schema(root / "habitat.schema.json")
    members = []
    for area in AREAS:
        path = root / f"{area}.json"
        if not path.is_file():
            raise DataError(f"{label(path)} is missing: every area of AREAS has a file")
        members.append(area_bytes(load(path, schema), label(path)))
    # Paper White 2: the Habitat Dex's lists, which the hack's build writes beside the areas (tools/paperwhite2/
    # encounters.py habitats), are the member after them
    extra = root / "paperwhite2_habitat_dex.bin"
    if extra.is_file():
        members.append(extra.read_bytes())
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(write_narc(members))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    dump_parser = commands.add_parser("dump", help="write res/pokedex/habitats/ from the extracted files")
    dump_parser.add_argument("files", type=Path, help="the extracted files/ directory")
    dump_parser.add_argument("output", type=Path)
    pack_parser = commands.add_parser("pack", help="build the habitat archive from res/pokedex/habitats/")
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
