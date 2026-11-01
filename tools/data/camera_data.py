#!/usr/bin/env python3
"""The field's cameras in res/field/cameras/: dump writes them from the ROM once, and pack builds their archives from
them, which the build does.

    camera_data.py dump extract/w2_us/files res/field/cameras
    camera_data.py pack res/field/cameras AREAS RAIL_AREAS DEFAULTS
    camera_data.py archive PACKED_AREAS OUTPUT        # the hack's build: the zones' table after the area files

- areas/<zone>.json: the camera areas of a zone on a grid (a/1/5/6, ARCID_FIELD_CAMERA_MAP_PARAM), the parts of the
  map where the camera changes as the player walks in (Aspertia City's overlook). ZONE_CAMERA_ASSIGNMENTS
  (src/system/zonedata.c) gives a zone its file, which is named after the first zone the table gives it, and the
  file's "zones" lists them. Paper White 2's build reads the zones from the files instead: archive appends a table of
  them to the archive (a u16 count, then a u16 zone and a u16 file each), which PaperWhite2_GetCameraIDForZone
  (src/paperwhite2/ov036/paperwhite2_camera_areas.c) reads, so a zone without camera areas can be given a file.
- rail_areas/<rails>.json: the camera areas of a rail map (a/0/7/9), which res/field/rails/maps.json's
  "camera_areas" numbers, named after the rail directory of the first map that uses it.
- defaults.json: the default cameras (a/0/5/9, ARCID_FIELD_CAMERA_DEFAULT), FieldCameraDefaults, which a zone's
  "camera" numbers.
- order.json: the area files in their archives' order.

An area file is a list of CameraArea (include/field/field_scene_area.h), 72 bytes each, uncompressed, read whole
(fld_scenearea_loader.c): a rectangle of tiles whose camera blends from one setting to another across it (check
"rect"), or a ring around a point that the camera turns around (check "circle"), then the functions that check the
position and run while the player stays, enters and leaves (CAM_CALC_FUNCS's numbers). Angles are in 65536ths of a
turn, positions and distances fx32 (4096 a unit) unless named in units, as the game keeps them. cameras.schema.json
describes the files.
"""
import argparse
import json
import re
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.datajson import DataError, label, load, load_schema, value, write  # noqa: E402
from tools.data.narc import read_narc, write_narc  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
AREAS, RAIL_AREAS, DEFAULTS = "a/1/5/6", "a/0/7/9", "a/0/5/9"
AREA = struct.Struct("<60siHHHH")
RECT = struct.Struct("<6H HHi HHi i 3i 3i HH")
CIRCLE = struct.Struct("<IIii 3i ii 3i 3i")
DEFAULT = struct.Struct("<iIIIBBHiii3i")
CHECKS = ["circle", "rect"]


def assignments() -> list[tuple[str, int]]:
    """ZONE_CAMERA_ASSIGNMENTS: each zone with camera areas and its file's number."""
    text = (ROOT / "src/system/zonedata.c").read_text()
    start = text.index("ZONE_CAMERA_ASSIGNMENTS[")
    table = text[start:text.index("};", start)]
    return [(zone, int(number)) for zone, number in re.findall(r"\{ (ZONE_\w+), (\d+) \}", table)]


def zone_files() -> list[str]:
    """Each grid area file's name: the first zone ZONE_CAMERA_ASSIGNMENTS gives it, by the file's number."""
    names: dict[int, str] = {}
    for zone, number in assignments():
        names.setdefault(number, zone.removeprefix("ZONE_").lower())
    return [names[i] for i in range(len(names))]


def rail_files() -> list[str]:
    maps = json.loads((ROOT / "res/field/rails/maps.json").read_text())["maps"]
    names: dict[int, str] = {}
    for m in maps:
        if m.get("camera_areas") is not None:
            names.setdefault(m["camera_areas"], m["rails"])
    return [names[i] for i in range(len(names))]


def vec(values) -> list[int]:
    return list(values)


# Dumping


def area_json(data: bytes) -> dict:
    union, unk3c, check, stay, enter, exit_ = AREA.unpack(data)
    area: dict = {"check": CHECKS[check] if check < len(CHECKS) else check, "stay": stay, "enter": enter, "exit": exit_}
    if check == 1:
        (x, z, w, unk06, h, unk0a, pitch1, yaw1, tz1, pitch2, yaw2, tz2, forbid, *rest) = RECT.unpack(union)
        offsets, fov = rest[:6], rest[6:]
        area["rect"] = {"x": x, "z": z, "width": w, "unk06": unk06, "height": h, "unk0a": unk0a,
                        "pitch": [pitch1, pitch2], "yaw": [yaw1, yaw2], "distance": [tz1, tz2],
                        "forbid_delay": bool(forbid), "target_offset": [vec(offsets[:3]), vec(offsets[3:])],
                        "fov": list(fov)}
        if forbid not in (0, 1):
            raise ValueError(f"forbidDelayManager is {forbid}")
    else:
        (a0, a1, r0, r1, cx, cy, cz, pitch, dist, *rest) = CIRCLE.unpack(union)
        area["circle"] = {"angle": [a0, a1], "radius": [r0, r1], "center": [cx, cy, cz], "pitch": pitch,
                          "distance": dist, "target": vec(rest[:3]), "position": vec(rest[3:])}
    if unk3c:
        area["unk3c"] = unk3c
    return area


def default_json(data: bytes) -> dict:
    zoom, pitch, yaw, unkc, unk10, swap, fov, near, far, bind, *target = DEFAULT.unpack(data)
    return {"zoom": zoom, "pitch": pitch, "yaw": yaw, "unkc": unkc, "unk10": unk10, "swap_mode": swap, "fov": fov,
            "near": near, "far": far, "bind": bool(bind), "target": target}


def dump(files: Path, output: Path):
    for archive, folder, names in ((AREAS, "areas", zone_files()), (RAIL_AREAS, "rail_areas", rail_files())):
        members = read_narc((files / archive).read_bytes())
        if len(members) != len(names):
            sys.exit(f"{archive} has {len(members)} files, the tables name {len(names)}")
        for member, file in zip(members, names):
            if len(member) % AREA.size:
                sys.exit(f"{archive}: a file of {len(member)} bytes, not of {AREA.size}-byte areas")
            areas = [area_json(member[i:i + AREA.size]) for i in range(0, len(member), AREA.size)]
            source: dict = {"$schema": "../cameras.schema.json"}
            if folder == "areas":
                number = names.index(file)
                source["zones"] = [zone for zone, n in assignments() if n == number]
            source["areas"] = areas
            write(output / folder / f"{file}.json", source)
    write(output / "order.json", {"areas": zone_files(), "rail_areas": rail_files()})
    table = read_narc((files / DEFAULTS).read_bytes())
    if len(table) != 1 or len(table[0]) % DEFAULT.size:
        sys.exit(f"{DEFAULTS} isn't one file of {DEFAULT.size}-byte cameras")
    cameras = [default_json(table[0][i:i + DEFAULT.size]) for i in range(0, len(table[0]), DEFAULT.size)]
    write(output / "defaults.json", {"$schema": "cameras.schema.json#/$defs/defaults", "cameras": cameras})
    print(f"wrote the cameras to {output}")


# Packing


def area_bytes(area: dict, where: str) -> bytes:
    check = CHECKS.index(area["check"]) if isinstance(area["check"], str) else area["check"]
    if check == 1:
        r = area.get("rect")
        if r is None:
            raise DataError(f"{where}: a rect area has a \"rect\"")
        union = RECT.pack(r["x"], r["z"], r["width"], r["unk06"], r["height"], r["unk0a"], r["pitch"][0], r["yaw"][0],
                          r["distance"][0], r["pitch"][1], r["yaw"][1], r["distance"][1], int(r["forbid_delay"]),
                          *r["target_offset"][0], *r["target_offset"][1], *r["fov"])
    else:
        c = area.get("circle")
        if c is None:
            raise DataError(f"{where}: a circle area has a \"circle\"")
        union = CIRCLE.pack(*c["angle"], *c["radius"], *c["center"], c["pitch"], c["distance"], *c["target"],
                            *c["position"])
    return AREA.pack(union, area.get("unk3c", 0), check, area["stay"], area["enter"], area["exit"])


def pack(root: Path, areas_output: Path, rail_output: Path, defaults_output: Path):
    schema = load_schema(root / "cameras.schema.json")
    order = json.loads((root / "order.json").read_text())
    for folder, output in (("areas", areas_output), ("rail_areas", rail_output)):
        members = []
        for file in order[folder]:
            path = root / folder / f"{file}.json"
            source = load(path, schema)
            members.append(b"".join(area_bytes(a, f"{label(path)}: area {i}") for i, a in enumerate(source["areas"])))
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(write_narc(members))
    path = root / "defaults.json"
    cameras = json.loads(path.read_text())["cameras"]
    data = b"".join(DEFAULT.pack(c["zoom"], c["pitch"], c["yaw"], c["unkc"], c["unk10"], c["swap_mode"], c["fov"],
                                 c["near"], c["far"], int(c["bind"]), *c["target"]) for c in cameras)
    defaults_output.write_bytes(write_narc([data]))


def archive(packed: Path, output: Path):
    """The packed areas' archive with the zones' table after its files, from res/field/cameras/areas/."""
    root = ROOT / "res/field/cameras"
    order = json.loads((root / "order.json").read_text())["areas"]
    table = []
    seen = set()
    for number, file in enumerate(order):
        path = root / "areas" / f"{file}.json"
        for zone in json.loads(path.read_text()).get("zones", []):
            if zone in seen:
                raise DataError(f"{label(path)}: {zone} has another camera area file already")
            seen.add(zone)
            table.append((value(zone, label(path)), number))
    data = struct.pack("<H", len(table)) + b"".join(struct.pack("<HH", z, n) for z, n in table)
    output.write_bytes(write_narc(read_narc(packed.read_bytes()) + [data]))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    dump_parser = commands.add_parser("dump", help="write res/field/cameras/ from the extracted files")
    dump_parser.add_argument("files", type=Path, help="the extracted files/ directory")
    dump_parser.add_argument("output", type=Path)
    pack_parser = commands.add_parser("pack", help="build the cameras' archives from their sources")
    pack_parser.add_argument("root", type=Path)
    pack_parser.add_argument("areas", type=Path)
    pack_parser.add_argument("rail_areas", type=Path)
    pack_parser.add_argument("defaults", type=Path)
    archive_parser = commands.add_parser("archive", help="add the zones' table to the packed areas' archive")
    archive_parser.add_argument("packed", type=Path)
    archive_parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "dump":
            dump(args.files, args.output)
        elif args.command == "archive":
            archive(args.packed, args.output)
        else:
            pack(args.root, args.areas, args.rail_areas, args.defaults)
    except DataError as error:
        sys.exit(f"error: {error}")


if __name__ == "__main__":
    main()
