#!/usr/bin/env python3
"""The map replacements in res/field/map_replacements/: dump writes them from the ROM once, and pack builds their
archive (a/0/1/0, which overlay 12's map_replace.c opens as archive 10) from them, which the build does.

    map_replace_data.py dump extract/w2_us/files res/field/map_replacements
    map_replace_data.py pack res/field/map_replacements ARCHIVE

The archive has one file, a list of 16-byte entries (MapReplaceEntry, include/field/field_map.h): the matrix the entry
changes, its kind, its condition and six u16 values. When the field loads a matrix (MapMatrix_Patch,
src/ov012/map_matrix.c), each entry for it picks a value by its condition: the season (0 to 3), the version (0 for
Black and Black 2, 1 for White and White 2), the version and the season (0 for Black, the season plus 1 for White), or
an event of EVENT_MAP_REPLACE_TABLE (condition 3 and on: 0 before it, 1 after). A "chunk" entry then puts that map
model in place of the first value's everywhere in the matrix; a "matrix" entry loads that matrix in place of the
first value's. So the seasons' map models are other chunks, with their own collision, which the Overworld Editor
shows by season.

replacements.json lists the entries in the archive's order, each with its values as constants: map models for a
chunk, matrices for a matrix. A condition uses as many values as it has cases (season 4, version 2, version and
season 5, an event 2); the archive's other values are 0 but the sixth, 0xFFFF, as in the original.
map_replacements.schema.json describes the file.
"""
import argparse
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.datajson import DataError, label, load, load_schema, name, value, write  # noqa: E402
from tools.data.narc import read_narc, write_narc  # noqa: E402

ARCHIVE = "a/0/1/0"
ENTRY = struct.Struct("<HBB6H")
KINDS = ["chunk", "matrix"]
CONDITIONS = ["season", "version", "version_season"]
# The values each condition picks from; an event's condition (3 and on) has two
CASES = {"season": 4, "version": 2, "version_season": 5}
EVENT_CASES = 2
VALUE_COUNT = 6
LAST_VALUE = 0xFFFF


def value_prefix(kind: str) -> str:
    return "MAP_MODEL_" if kind == "chunk" else "MAP_MATRIX_"


def cases(condition) -> int:
    return CASES[condition] if isinstance(condition, str) else EVENT_CASES


# Dumping


def dump(files: Path, output: Path):
    members = read_narc((files / ARCHIVE).read_bytes())
    if len(members) != 1 or len(members[0]) % ENTRY.size:
        sys.exit(f"{ARCHIVE} is not one file of {ENTRY.size}-byte entries")
    entries = []
    for offset in range(0, len(members[0]), ENTRY.size):
        matrix, kind, condition, *values = ENTRY.unpack_from(members[0], offset)
        kind_name = KINDS[kind]
        condition_name = CONDITIONS[condition] if condition < len(CONDITIONS) else condition
        used = cases(condition_name)
        padding = [0] * (VALUE_COUNT - 1 - used) + [LAST_VALUE]
        if values[used:] != padding:
            sys.exit(f"entry {offset // ENTRY.size}'s unused values are {values[used:]}, not {padding}")
        entries.append({"matrix": name("MAP_MATRIX_", matrix), "kind": kind_name, "condition": condition_name,
                        "values": [name(value_prefix(kind_name), v) for v in values[:used]]})
    write(output / "replacements.json", {"$schema": "map_replacements.schema.json", "replacements": entries})
    print(f"wrote {len(entries)} replacements to {output}")


# Packing


def pack(root: Path, output: Path):
    path = root / "replacements.json"
    source = load(path, load_schema(root / "map_replacements.schema.json"))
    data = bytearray()
    for index, entry in enumerate(source["replacements"]):
        where = f"{label(path)}: replacement {index}"
        condition = entry["condition"]
        if len(entry["values"]) != cases(condition):
            raise DataError(f"{where}: a {condition!r} condition has {cases(condition)} values, not {len(entry['values'])}")
        values = [value(v, where) for v in entry["values"]]
        values += [0] * (VALUE_COUNT - 1 - len(values)) + [LAST_VALUE]
        condition_value = CONDITIONS.index(condition) if isinstance(condition, str) else condition
        data += ENTRY.pack(value(entry["matrix"], where), KINDS.index(entry["kind"]), condition_value, *values)
    output.write_bytes(write_narc([bytes(data)]))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    dump_parser = commands.add_parser("dump", help="write res/field/map_replacements/ from the extracted files")
    dump_parser.add_argument("files", type=Path, help="the extracted files/ directory")
    dump_parser.add_argument("output", type=Path)
    pack_parser = commands.add_parser("pack", help="build the map replacements' archive from their source")
    pack_parser.add_argument("root", type=Path)
    pack_parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "dump":
            dump(args.files, args.output)
        else:
            pack(args.root, args.output)
    except DataError as error:
        sys.exit(f"error: {error}")


if __name__ == "__main__":
    main()
