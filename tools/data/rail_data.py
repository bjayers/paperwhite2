#!/usr/bin/env python3
"""The field rails in res/field/rails/, the paths that the player walks in the maps without a grid (Castelia City's
streets, Skyarrow Bridge, the Pokémon League): dump writes them from the ROM once, and pack builds the rail archive
(a/0/7/8) and the rail maps' archive (a/1/1/0) from them, which the build does.

    rail_data.py dump extract/w2_us/files res/field/rails
    rail_data.py pack res/field/rails RAILS MAPS

Each rail file is a directory, res/field/rails/<rails>/, named after the first zone that uses it, and order.json lists
them in archive order. A directory holds
- rails.json, the rail file (RailLoader's file, see src/ov036/field_rail_loader.c): its points, lines, cameras and
  curves (RailPoint, RailLine, RailCamera, RailCurve), each kept at its index, since the lines and points name each
  other, and the zones' events place NPCs on the rails, by index;
- attributes/line_NN.csv, the tile attributes of line NN (rail_attr.c's RailTilemap): a row per tile along the line,
  a column per tile across it, each a u32, in hex.
The archive has the rail files in order, then their attribute files in the same order: rail file N's attributes are
file N + the number of rail files.

maps.json is a/1/1/0, the rail maps (NoGridMapperHeader): ZONE_RAIL_ASSIGNMENTS in src/system/zonedata.c gives a
zone with rails the index of its map, which names its rail directory and its camera areas.

The game's rail file starts with a header of seven words: a word that every file has the same (unk0), and the offsets of
the tile width and of the points, lines, cameras and curves and of the end, each section running up to the next. The
dump also reads the files that Frost's Gen 5 Editor writes, whose header leaves out the end's offset, and writes the
same sources from them; pack always writes the game's header. rails.schema.json and rail_maps.schema.json describe the
fields.
"""
import argparse
import csv
import io
import json
import re
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.datajson import DataError, label, load, load_schema, write  # noqa: E402
from tools.data.narc import read_narc, write_narc  # noqa: E402

HEADER = struct.Struct("<7I")
POINT = struct.Struct("<4I4I4i3iI48s")
LINE = struct.Struct("<6I48s")
CAMERA = struct.Struct("<I8i")
CURVE = struct.Struct("<I3i20s")
MAP = struct.Struct("<HH")
NONE = 0xFFFF
NAME_SIZE = 48
ZONE_DATA = Path(__file__).resolve().parents[2] / "src/system/zonedata.c"


# Reading the files


def normalize(data: bytes) -> bytes:
    """Returns a rail file with the game's header: a file of Frost's Gen 5 Editor, whose six-word header has no end
    offset, gets one, and its other offsets move four bytes on."""
    tile_width_offset = struct.unpack_from("<I", data, 4)[0]
    if tile_width_offset == HEADER.size:
        return data
    if tile_width_offset != HEADER.size - 4:
        raise ValueError(f"a rail file's tile width is at {tile_width_offset:#x}, not after a header")
    words = struct.unpack_from("<6I", data)
    return HEADER.pack(words[0], *(offset + 4 for offset in words[1:]), len(data) + 4) + data[HEADER.size - 4:]


def text(raw: bytes, pad: bytes) -> str:
    name = raw.rstrip(pad).decode("ascii")
    if name.encode("ascii").ljust(NAME_SIZE, pad) != raw or "\0" in name:
        raise ValueError(f"a name, {raw!r}, isn't padded with {pad!r}")
    return name


def records(data: bytes, start: int, end: int, layout: struct.Struct, what: str) -> list[tuple]:
    if (end - start) % layout.size or end < start:
        raise ValueError(f"the {what} aren't whole records")
    return [layout.unpack_from(data, offset) for offset in range(start, end, layout.size)]


def rails_json(data: bytes) -> dict:
    unk0, tile_width_offset, points, lines, cameras, curves, end = HEADER.unpack_from(data)
    if (tile_width_offset, points, end) != (HEADER.size, HEADER.size + 4, len(data)):
        raise ValueError("a rail file isn't laid out as the header, the tile width and the sections")
    rails = {"$schema": "../rails.schema.json", "unk0": unk0,
             "tile_width": struct.unpack_from("<i", data, tile_width_offset)[0], "points": [], "lines": [],
             "cameras": [], "curves": []}
    for *values, raw in records(data, points, lines, POINT, "points"):
        # A point's name is padded with spaces, without a terminator
        rails["points"].append({"name": text(raw, b" "), "lines": values[0:4], "dirs": values[4:8],
                                "widths": values[8:12], "pos": values[12:15], "camera": values[15]})
    for point_a, point_b, direction, curve, camera, length, raw in records(data, lines, cameras, LINE, "lines"):
        rails["lines"].append({"name": text(raw, b"\0"), "point_a": point_a, "point_b": point_b, "dir": direction,
                               "curve": curve, "camera": camera, "length": length})
    for func, *params in records(data, cameras, curves, CAMERA, "cameras"):
        rails["cameras"].append({"func": func, "params": params})
    for handler, x, y, z, unk10 in records(data, curves, end, CURVE, "curves"):
        curve = {"handler": handler, "center": [x, y, z]}
        if any(unk10):
            curve["unk10"] = list(unk10)
        rails["curves"].append(curve)
    return rails


def attributes_csv(data: bytes) -> list[str]:
    (count,) = struct.unpack_from("<I", data)
    offset, files = 4, []
    for _ in range(count):
        width, length = struct.unpack_from("<HH", data, offset)
        tiles = struct.unpack_from(f"<{width * length}I", data, offset + 4)
        if not width or not length:
            raise ValueError("a line's attributes have no tiles, which a CSV can't give the size of")
        offset += 4 + 4 * width * length
        files.append("".join(",".join(f"0x{t:08x}" for t in tiles[width * z:width * (z + 1)]) + "\n"
                             for z in range(length)))
    if offset != len(data):
        raise ValueError("an attribute file has data after its lines")
    return files


def zone_rail_maps() -> dict[int, str]:
    """Returns the first zone of ZONE_RAIL_ASSIGNMENTS that uses each rail map, to name the rail files by."""
    table = re.search(r"ZONE_RAIL_ASSIGNMENTS\[\d*\] = \{(.*?)\};", ZONE_DATA.read_text(), re.DOTALL)
    found: dict[int, str] = {}
    for zone, index in re.findall(r"\{\s*ZONE_(\w+),\s*(\d+)\s*\}", table.group(1)):
        found.setdefault(int(index), zone.lower())
    return found


def dump(files: Path, output: Path):
    members = read_narc((files / "a/0/7/8").read_bytes())
    maps = [MAP.unpack(member) for member in read_narc((files / "a/1/1/0").read_bytes())]
    if len(members) % 2:
        sys.exit("the rail archive doesn't have an attribute file for each rail file")
    count = len(members) // 2
    zones = zone_rail_maps()
    names = [None] * count
    for index, (rails, _) in enumerate(maps):
        if rails != NONE and names[rails] is None and index in zones:
            names[rails] = zones[index]
    names = [name or f"rails_{i:02d}" for i, name in enumerate(names)]
    for i, name in enumerate(names):
        directory = output / name
        data = normalize(members[i])
        write(directory / "rails.json", rails_json(data))
        attributes = directory / "attributes"
        for old in attributes.glob("line_*.csv") if attributes.is_dir() else []:
            old.unlink()
        attributes.mkdir(parents=True, exist_ok=True)
        for line, contents in enumerate(attributes_csv(members[count + i])):
            (attributes / f"line_{line:02d}.csv").write_text(contents)
        # Check that the sources give the files back
        if (rails_bytes(json.loads((directory / "rails.json").read_text()), name) != data
                or attributes_bytes(directory) != members[count + i]):
            sys.exit(f"{name}'s sources don't give its files back")
    write(output / "order.json", names)
    write(output / "maps.json", {"$schema": "rail_maps.schema.json", "maps": [
        {"rails": None if rails == NONE else names[rails], "camera_areas": None if camera == NONE else camera}
        for rails, camera in maps]})
    print(f"wrote {count} rail files and {len(maps)} rail maps to {output}")


# Packing


def name_bytes(name: str, pad: bytes, where: str) -> bytes:
    if not name.isascii() or "\0" in name:
        raise DataError(f"{where}: the name {name!r} isn't ASCII")
    raw = name.encode("ascii")
    if len(raw) > NAME_SIZE or (pad == b"\0" and len(raw) == NAME_SIZE):
        raise DataError(f"{where}: the name {name!r} is longer than {NAME_SIZE - (pad == b'\0')} characters")
    return raw.ljust(NAME_SIZE, pad)


def rails_bytes(rails: dict, where: str) -> bytes:
    points = b"".join(POINT.pack(*p["lines"], *p["dirs"], *p["widths"], *p["pos"], p["camera"],
                                 name_bytes(p["name"], b" ", f"{where}: points[{i}]"))
                      for i, p in enumerate(rails["points"]))
    lines = b"".join(LINE.pack(l["point_a"], l["point_b"], l["dir"], l["curve"], l["camera"], l["length"],
                               name_bytes(l["name"], b"\0", f"{where}: lines[{i}]"))
                     for i, l in enumerate(rails["lines"]))
    cameras = b"".join(CAMERA.pack(c["func"], *c["params"]) for c in rails["cameras"])
    curves = b"".join(CURVE.pack(c["handler"], *c["center"], bytes(c.get("unk10", [0] * 20))) for c in rails["curves"])
    offset = HEADER.size + 4
    offsets = [offset := offset + len(section) for section in (points, lines, cameras, curves)]
    header = HEADER.pack(rails["unk0"], HEADER.size, HEADER.size + 4, *offsets)
    return header + struct.pack("<i", rails["tile_width"]) + points + lines + cameras + curves


def attributes_bytes(directory: Path) -> bytes:
    paths = sorted((directory / "attributes").glob("line_*.csv"))
    if [p.name for p in paths] != [f"line_{i:02d}.csv" for i in range(len(paths))]:
        raise DataError(f"{label(directory / 'attributes')}: the files aren't line_00.csv, line_01.csv and on")
    data = struct.pack("<I", len(paths))
    for path in paths:
        rows = [row for row in csv.reader(io.StringIO(path.read_text())) if row]
        width = len(rows[0]) if rows else 0
        if not rows or any(len(row) != width for row in rows):
            raise DataError(f"{label(path)}: every row has the same number of tiles, at least one")
        if width > 0xFFFF or len(rows) > 0xFFFF:
            raise DataError(f"{label(path)}: at most 65535 rows and columns")
        try:
            tiles = [int(cell.strip(), 0) for row in rows for cell in row]
        except ValueError:
            raise DataError(f"{label(path)}: a tile isn't a number") from None
        if any(not 0 <= tile <= 0xFFFFFFFF for tile in tiles):
            raise DataError(f"{label(path)}: a tile isn't a u32")
        data += struct.pack(f"<HH{len(tiles)}I", width, len(rows), *tiles)
    return data


def pack(root: Path, rails_output: Path, maps_output: Path):
    schema = load_schema(root / "rails.schema.json")
    order = json.loads((root / "order.json").read_text())
    if not isinstance(order, list) or not all(isinstance(n, str) for n in order) or len(set(order)) != len(order):
        raise DataError(f"{label(root / 'order.json')}: a list of the rail directories, each once")
    directories = {p.parent.name for p in root.glob("*/rails.json")}
    if directories != set(order):
        raise DataError(f"{label(root / 'order.json')}: every directory with a rails.json is in it once; "
                        f"missing {sorted(directories - set(order))}, extra {sorted(set(order) - directories)}")
    rail_files, attribute_files = [], []
    for name in order:
        path = root / name / "rails.json"
        rails, where = load(path, schema), label(path)
        for kind in ("points", "lines", "cameras", "curves"):
            if len(rails[kind]) > 0xFFFF:
                raise DataError(f"{where}: at most 65535 {kind}")
        rail_files.append(rails_bytes(rails, where))
        attribute_files.append(attributes_bytes(root / name))
    maps = load(root / "maps.json", load_schema(root / "rail_maps.schema.json"))
    entries = []
    for i, entry in enumerate(maps["maps"]):
        if entry["rails"] is not None and entry["rails"] not in order:
            raise DataError(f"{label(root / 'maps.json')}: maps[{i}]: {entry['rails']!r} isn't in order.json")
        rails = NONE if entry["rails"] is None else order.index(entry["rails"])
        entries.append(MAP.pack(rails, NONE if entry["camera_areas"] is None else entry["camera_areas"]))
    for output, members in ((rails_output, rail_files + attribute_files), (maps_output, entries)):
        output.parent.mkdir(parents=True, exist_ok=True)
        output.unlink(missing_ok=True)
        output.write_bytes(write_narc(members))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    dump_parser = commands.add_parser("dump", help="write res/field/rails/ from the extracted files")
    dump_parser.add_argument("files", type=Path, help="the extracted files/ directory")
    dump_parser.add_argument("output", type=Path)
    pack_parser = commands.add_parser("pack", help="build the rail archives from res/field/rails/")
    pack_parser.add_argument("root", type=Path)
    pack_parser.add_argument("rails", type=Path, help="the rail archive, a/0/7/8")
    pack_parser.add_argument("maps", type=Path, help="the rail maps' archive, a/1/1/0")
    args = parser.parse_args()
    if args.command == "dump":
        try:
            dump(args.files, args.output)
        except (ValueError, DataError) as error:
            sys.exit(f"error: {error}")
        return
    try:
        pack(args.root, args.rails, args.maps)
    except DataError as error:
        sys.exit(f"error: {error}")


if __name__ == "__main__":
    main()
