#!/usr/bin/env python3
"""The crowds of Castelia's streets (src/ov121/castelia_rush.c) in res/field/castelia_rush/: dump writes them from
the ROM once, and pack builds the archive (a/1/8/3) from them, which the build does.

    castelia_rush_data.py dump extract/w2_us/files res/field/castelia_rush
    castelia_rush_data.py pack res/field/castelia_rush ARCHIVE

The archive holds a file for each zone with a crowd, the first 0x32 bytes of CasteliaRushConfig, which
CasteliaRushConfig_Load reads; then an all-zero file for zone 0, which ends the list; then the zones of those files as
u32s, in their order; then the talk scripts of the passers-by's object codes (CasteliaRushScripts). Each zone's source
is named after its ZONE_ constant, lowercased without the prefix (castelia_city_4.json for ZONE_CASTELIA_CITY_4), and
order.json lists the zones in the archive's order; a zone file it doesn't list comes after them, by zone ID. The
config looks a zone up in the list and takes the first match. talk_scripts.json holds the scripts. crowd.schema.json
and talk_scripts.schema.json describe each field.
"""
import argparse
import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.datajson import DataError, label, load, load_schema, name, value, write  # noqa: E402
from tools.data.gen_constants import load as load_list  # noqa: E402
from tools.data.narc import read_narc, write_narc  # noqa: E402

ARCHIVE = "a/1/8/3"
# The day periods of src/system/rtc.h, which index CasteliaRushConfig.intervals
DAY_PERIODS = ["morning", "day", "evening", "night", "midnight"]
OBJ_CODE_SLOTS = 4
LANE_COUNT = 2
# CasteliaRushConfig up to its lanes: intervals[5], unkA, laneCount, objCodeCount, objCodes[4], msgBase, msgCount,
# stepFrames, unk19
HEAD = struct.Struct("<5hHBB4HBBBB")
# CasteliaRushLane: zMin, zMax, xMin, xMax, dir, steps
LANE = struct.Struct("<6H")
CONFIG_SIZE = HEAD.size + LANE_COUNT * LANE.size
# CasteliaRushScripts: objCode, scripts[6]
SCRIPTS = struct.Struct("<I6H")
NON_ZONE_FILES = {"order.json", "talk_scripts.json", "crowd.schema.json", "talk_scripts.schema.json"}


def zone_ids() -> dict[str, int]:
    return load_list("zones")


def file_stem(zone: str) -> str:
    return zone.removeprefix("ZONE_").lower()


# Dumping


def crowd_json(data: bytes) -> dict:
    if len(data) != CONFIG_SIZE:
        raise ValueError(f"a crowd's file is {len(data)} bytes, not {CONFIG_SIZE}")
    head = HEAD.unpack_from(data)
    obj_code_count = head[7]
    lanes = []
    for i in range(LANE_COUNT):
        z_min, z_max, x_min, x_max, direction, steps = LANE.unpack_from(data, HEAD.size + i * LANE.size)
        lanes.append({"z_min": z_min, "z_max": z_max, "x_min": x_min, "x_max": x_max,
                      "dir": name("DIR_", direction), "steps": steps})
    return {
        "$schema": "crowd.schema.json",
        "intervals": dict(zip(DAY_PERIODS, head[0:5])),
        "unk_a": head[5],
        "lane_count": head[6],
        # The slots after the count are leftovers, kept as numbers
        "obj_codes": [name("OBJ_CODE_", code) if i < obj_code_count else code for i, code in enumerate(head[8:12])],
        "obj_code_count": obj_code_count,
        "msg_base": head[12],
        "msg_count": head[13],
        "step_frames": head[14],
        "unk19": head[15],
        "lanes": lanes,
    }


def dump(files: Path, output: Path):
    members = read_narc((files / ARCHIVE).read_bytes())
    zones = struct.unpack(f"<{len(members[-2]) // 4}I", members[-2])
    if len(zones) != len(members) - 2 or zones[-1] != 0 or any(members[-3]):
        sys.exit("the archive isn't the crowds' files, an empty file for zone 0, the zones and the scripts")
    order = []
    for zone, data in zip(zones[:-1], members):
        zone_name = name("ZONE_", zone)
        if not isinstance(zone_name, str):
            sys.exit(f"zone {zone} has no constant in generated/zones.txt")
        write(output / f"{file_stem(zone_name)}.json", crowd_json(data))
        order.append(zone_name)
    write(output / "order.json", {"zones": order})
    scripts = [SCRIPTS.unpack_from(members[-1], i) for i in range(0, len(members[-1]), SCRIPTS.size)]
    write(output / "talk_scripts.json", {
        "$schema": "talk_scripts.schema.json",
        "obj_codes": [{"obj_code": name("OBJ_CODE_", entry[0]), "scripts": list(entry[1:])} for entry in scripts],
    })
    print(f"wrote {len(order)} crowds and {len(scripts)} object codes' scripts to {output}")


# Packing


def crowd_bytes(crowd: dict, where: str) -> bytes:
    if crowd["obj_code_count"] == 0 or crowd["obj_code_count"] > OBJ_CODE_SLOTS:
        raise DataError(f"{where}: obj_code_count is a modulus, 1 to {OBJ_CODE_SLOTS}")
    if crowd["lane_count"] > LANE_COUNT:
        raise DataError(f"{where}: at most {LANE_COUNT} lanes")
    if crowd["msg_count"] == 0 or crowd["msg_base"] + crowd["msg_count"] > 256:
        raise DataError(f"{where}: msg_count is a modulus, at least 1, and msg_base + msg_count is at most 256")
    data = HEAD.pack(*(crowd["intervals"][period] for period in DAY_PERIODS), crowd["unk_a"], crowd["lane_count"],
                     crowd["obj_code_count"], *(value(code, where) for code in crowd["obj_codes"]),
                     crowd["msg_base"], crowd["msg_count"], crowd["step_frames"], crowd["unk19"])
    for lane in crowd["lanes"]:
        data += LANE.pack(lane["z_min"], lane["z_max"], lane["x_min"], lane["x_max"], value(lane["dir"], where),
                          lane["steps"])
    return data


def pack(root: Path, output: Path):
    schema = load_schema(root / "crowd.schema.json")
    ids = zone_ids()
    order_path = root / "order.json"
    order = json.loads(order_path.read_text())["zones"]
    if len(set(order)) != len(order):
        raise DataError(f"{label(order_path)}: a zone is listed twice")
    for zone in order:
        if zone not in ids:
            raise DataError(f"{label(order_path)}: {zone} is not a zone of generated/zones.txt")
        if not (root / f"{file_stem(zone)}.json").is_file():
            raise DataError(f"{label(order_path)}: {zone} has no {file_stem(zone)}.json")
    stems = {file_stem(zone): zone for zone in ids}
    listed = {file_stem(zone) for zone in order}
    others = []
    for path in sorted(root.glob("*.json")):
        if path.name in NON_ZONE_FILES or path.stem in listed:
            continue
        if path.stem not in stems:
            raise DataError(f"{label(path)}: no ZONE_{path.stem.upper()} in generated/zones.txt")
        others.append(stems[path.stem])
    zones = order + sorted(others, key=lambda zone: ids[zone])
    members = []
    for zone in zones:
        path = root / f"{file_stem(zone)}.json"
        members.append(crowd_bytes(load(path, schema), label(path)))
    # The end of the list: zone 0, whose config is all zero
    members.append(bytes(CONFIG_SIZE))
    members.append(struct.pack(f"<{len(zones) + 1}I", *(ids[zone] for zone in zones), 0))
    scripts_path = root / "talk_scripts.json"
    scripts = load(scripts_path, load_schema(root / "talk_scripts.schema.json"))
    members.append(b"".join(SCRIPTS.pack(value(entry["obj_code"], label(scripts_path)), *entry["scripts"])
                            for entry in scripts["obj_codes"]))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(write_narc(members))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    dump_parser = commands.add_parser("dump", help="write res/field/castelia_rush/ from the extracted files")
    dump_parser.add_argument("files", type=Path, help="the extracted files/ directory")
    dump_parser.add_argument("output", type=Path)
    pack_parser = commands.add_parser("pack", help="build the crowds' archive from res/field/castelia_rush/")
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
