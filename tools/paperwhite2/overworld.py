#!/usr/bin/env python3
"""Paper White 2's NPC spawn data, res/paperwhite2/overworld/<zone>.json: the conditions under which a zone's NPCs
appear and the instances an NPC can be. The hack's build packs them into a member after the zones' events' archive's
own (a/1/2/6), which Spawns_OnZoneInit (src/paperwhite2/ov012/paperwhite2_spawns.c) reads at zone entry.

    overworld.py archive PACKED_EVENTS OUTPUT      # the events' archive with the spawn member after its files
    overworld.py dump MEMBER                       # what a packed member holds, for checking

The member (little-endian): u32 magic "PWOW", u16 zone count, u16 0, then for each zone, by zone number, u16 zone,
u16 0, u32 offset and u32 size of its table from the member's start; then the tables, each on 4 bytes. A zone's table
is a conditions table (tools/paperwhite2/conditions.py) whose rules' payloads say what each is:
- an NPC's condition: u8 0, u8 the seed, u16 the NPC's id; the NPC appears while its rule holds;
- an instance: u8 1, u8 the seed, u16 its host's id, then the instance's 36-byte NPC record (ZoneNPC, as event_data.py
  packs it, its id the host's); a host's instances are one after another, after its condition if it has one, and the
  field picks among those that hold, by weight.
- an ambient: u8 2, u8 the seed, u16 its index among the zone's ambients, then its 36-byte record (SpawnAmbient,
  include/paperwhite2/spawns.h): u16 its sprites' object codes (4, the unused 0), u8 how many, u8 path, u8 shadow, u8
  facing, u8 flags, 3 bytes 0, s32 x, y and z
  (fx32 world units: a tile's middle plus its offset, and its height), u16 its path's width and depth (units), speed
  and start; it shows while its rule holds (paperwhite2_ambients.c).
The seed is the CONDITION_SEED_* the NPC's rolls start from, keyed by its id (its "rolls": the hour's by default, the
day's, the time of day's or each entry's); the field picks again when the hour or the time of day changes.
"""
import argparse
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.datajson import DataError, label, load, load_schema, value  # noqa: E402
from tools.data.event_data import npc_bytes  # noqa: E402
from tools.data.narc import read_narc, write_narc  # noqa: E402
from tools.paperwhite2.conditions import Compiler, align, pack_table, unpack_table  # noqa: E402

SOURCES = ROOT / "res/paperwhite2/overworld"
MAGIC = 0x574F5750
HEADER = struct.Struct("<IHH")
ENTRY = struct.Struct("<HHII")
PAYLOAD = struct.Struct("<BBH")
KIND_CONDITION, KIND_INSTANCE, KIND_AMBIENT = 0, 1, 2
AMBIENT = struct.Struct("<4H5B3xiii4H")
AMBIENT_SPRITES = 4
PATHS = {"perch": 0, "hover": 1, "ellipse": 2, "line": 3, "eight": 4}
SHADOWS = {"none": 0, "feet": 1, "ground": 2}
FLAG_TURNS, FLAG_HOPS = 0x1, 0x2
# An NPC's "rolls" as the CONDITION_SEED_* its picks start from (include/paperwhite2/conditions.h)
SEEDS = {"entry": 0, "day": 1, "hour": 3, "period": 4}


def zone_table(path: Path, schema: dict) -> bytes | None:
    """A zone's table, or None when it has nothing to pack."""
    source = load(path, schema)
    events = json.loads((ROOT / "res/field/events" / path.name).read_text())
    ids = {npc["id"] for npc in events["npcs"]}
    compiler = Compiler()
    rules = []
    seen = set()
    for i, entry in enumerate(source.get("npcs", [])):
        where = f"{label(path)}: npcs[{i}]"
        npc_id = entry["id"]
        if npc_id not in ids:
            raise DataError(f"{where}: the zone's events have no NPC {npc_id}")
        if npc_id in seen:
            raise DataError(f"{where}: NPC {npc_id} is listed twice")
        seen.add(npc_id)
        seed = SEEDS[entry.get("rolls", "hour")]
        if "when" in entry:
            rules.append((compiler.compile(entry["when"], f"{where}.when"), 0, 1, PAYLOAD.pack(KIND_CONDITION, seed, npc_id)))
        for j, instance in enumerate(entry.get("instances", [])):
            at = f"{where}.instances[{j}]"
            record = npc_bytes({**instance["npc"], "id": npc_id}, at)
            rules.append((compiler.compile(instance.get("when", {}), f"{at}.when"), 0, instance.get("weight", 1),
                          PAYLOAD.pack(KIND_INSTANCE, seed, npc_id) + record))
    for i, ambient in enumerate(source.get("ambients", [])):
        rules.append((compiler.compile(ambient.get("when", {}), f"{label(path)}: ambients[{i}].when"), 0, 1,
                      PAYLOAD.pack(KIND_AMBIENT, SEEDS[ambient.get("rolls", "hour")], i) + ambient_bytes(ambient, f"{label(path)}: ambients[{i}]")))
    return pack_table(rules, compiler.lists) if rules else None


def ambient_bytes(ambient: dict, where: str) -> bytes:
    """An ambient's record (SpawnAmbient)."""
    p = ambient.get("path", {"kind": "perch"})
    flags = (FLAG_TURNS if p.get("turns", True) else 0) | (FLAG_HOPS if p.get("hops", True) else 0)
    offset = ambient.get("offset", {})
    # (fx32 world units: 16 a tile, from the tile's middle)
    x = round((ambient["x"] * 16 + 8 + offset.get("x", 0)) * 4096)
    z = round((ambient["z"] * 16 + 8 + offset.get("z", 0)) * 4096)
    y = round(ambient["y"] * 4096)
    speed = p.get("every", 0) if p["kind"] == "perch" else p.get("speed", 45)
    sprites = [value(s, where) for s in ambient.get("sprites", [ambient["sprite"]] if "sprite" in ambient else [])]
    if not 1 <= len(sprites) <= AMBIENT_SPRITES:
        raise DataError(f"{where}: an ambient needs a sprite, or a set of 1 to {AMBIENT_SPRITES}")
    return AMBIENT.pack(*sprites, *[0] * (AMBIENT_SPRITES - len(sprites)), len(sprites), PATHS[p["kind"]],
                        SHADOWS[ambient.get("shadow", "none")], value(ambient.get("facing", "DIR_DOWN"), where), flags,
                        x, y, z, p.get("width", 0), p.get("depth", 0), speed, p.get("start", 0) % 360)


def member(sources: Path = SOURCES) -> bytes:
    """The spawn member of the zones' files in sources."""
    schema = load_schema(SOURCES / "overworld.schema.json")
    tables = []
    for path in sorted(sources.glob("*.json")):
        if path.name.endswith(".schema.json"):
            continue
        table = zone_table(path, schema)
        if table is not None:
            tables.append((value(f"ZONE_{path.stem.upper()}", label(path)), table))
    tables.sort()
    head = HEADER.size + ENTRY.size * len(tables)
    data = bytearray()
    entries = b""
    for zone, table in tables:
        entries += ENTRY.pack(zone, 0, head + len(data), len(table))
        data += align(table)
    return HEADER.pack(MAGIC, len(tables), 0) + entries + bytes(data)


def archive(packed: Path, output: Path):
    files = read_narc(packed.read_bytes())
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(write_narc(files + [member()]))


def dump(path: Path):
    data = path.read_bytes()
    magic, count, _ = HEADER.unpack_from(data)
    if magic != MAGIC:
        sys.exit(f"{path}: not a spawn member")
    for i in range(count):
        zone, _, offset, size = ENTRY.unpack_from(data, HEADER.size + ENTRY.size * i)
        table = unpack_table(data[offset:offset + size])
        print(f"zone {zone}: {len(table['rules'])} rules")
        for clauses, _, weight, payload in table["rules"]:
            kind, seed, npc_id = PAYLOAD.unpack_from(payload)
            rolls = next((k for k, v in SEEDS.items() if v == seed), seed)
            print(f"  {'instance of' if kind else 'condition of'} NPC {npc_id}, weight {weight}, {len(clauses)} clauses, rolls {rolls}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    archive_parser = commands.add_parser("archive", help="add the spawn member to the packed events' archive")
    archive_parser.add_argument("packed", type=Path)
    archive_parser.add_argument("output", type=Path)
    dump_parser = commands.add_parser("dump", help="list what a packed member holds")
    dump_parser.add_argument("member", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "archive":
            archive(args.packed, args.output)
        else:
            dump(args.member)
    except DataError as error:
        sys.exit(f"error: {error}")


if __name__ == "__main__":
    main()
