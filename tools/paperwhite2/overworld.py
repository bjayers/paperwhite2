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
- an ambient: u8 2, u8 the seed, u16 its index among the zone's ambients, then its 104-byte record (SpawnAmbient,
  include/paperwhite2/spawns.h): u16 its sprites' object codes (4, the unused 0), u8 how many, u8 path, u8 shadow, u8
  facing, u8 flags, 3 bytes 0, s32 x, y and z
  (fx32 world units: a tile's middle plus its offset, and its height), u16 its path's width and depth (units), speed
  and start, its line's height (units), then its reaction (REACTS: 0 for none): u16 the sprite it changes to (0 its
  own), its heading in degrees (REACT_AWAY: away from the player), its speed (units a second), the species of its cry
  (0 none), the seconds it returns after, at least and at most (NEVER: not in the zone), u8 its kind, how near the
  player and a running or cycling player come before it, its emote (EMOTES, 0 none), its heading's spread and its
  flight's climb (degrees), then its traveling path's (wander and after): u16 its pace (units a second), its wait and
  its up (seconds), a fly-over's heading (REACT_AWAY: at random), u8 its waypoints' count and FLAG_BACK, 2 bytes 0,
  and six waypoints of s16 x, y and z (units from its place; a fly-over's range is its width, its height its line
  height); it shows while its rule holds (paperwhite2_ambients.c).
- after the zone's own rules, each group (groups.json) it has a member of: a header, u8 4, u8 the group's seed, u16
  its index in groups.json, then u16 its nobody weight and its members' count; then each member's parts, the rules
  that its own zone works out for it, in that zone's order, so the rolls come out the same: u8 5, u8 the member's
  seed, u16 its key (an NPC's id, an ambient's index), then u16 its zone, u8 its index in the group, its part's role
  (ROLES), its kind (MEMBERS) and its instance's index among its NPC's, u16 the instance's spawn flag. A part's rule's
  weight is the member's (Spawns_GroupDenied, paperwhite2_spawns.c).
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
KIND_CONDITION, KIND_INSTANCE, KIND_AMBIENT, KIND_AMBIENT_SPRITE, KIND_GROUP, KIND_GROUP_PART = 0, 1, 2, 3, 4, 5
GROUP = struct.Struct("<HH")
GROUP_PART = struct.Struct("<HBBBBH")
# A part's role in its member: its NPC's condition (must hold), an instance of a whole NPC (one must hold), the
# instance that is the member (must hold), another instance of its NPC (worked out for the rolls only), an ambient's
ROLE_GATE, ROLE_OPTION, ROLE_TARGET, ROLE_PASS, ROLE_AMBIENT = 0, 1, 2, 3, 4
# What a member is: a whole NPC, an instance, an ambient
MEMBER_NPC, MEMBER_INSTANCE, MEMBER_AMBIENT = 0, 1, 2
GROUPS = "groups.json"
# The most members of groups a zone has (SPAWNS_GROUP_ZONE_MEMBERS_MAX, include/paperwhite2/spawns.h)
ZONE_MEMBERS_MAX = 64
AMBIENT = struct.Struct("<4H5B3xiii4H7H6B4H2B2x18h")
AMBIENT_POINTS = 6
AMBIENT_SPRITES = 4
PATHS = {"perch": 0, "hover": 1, "ellipse": 2, "line": 3, "eight": 4, "wander": 5, "waypoints": 6, "peek": 7,
         "flyover": 8, "surface": 9}
# The traveling paths' defaults: a wander's pause (seconds), a pace (tiles a second), the waits and ups (seconds), a
# fly-over's range (tiles) and height (units), and AMBIENT_PATH_FLAG_BACK
WANDER_EVERY, PACE, WAIT, UP, FLYOVER_RANGE, FLYOVER_HEIGHT, FLAG_BACK = 3, 2, 4, 4, 12, 64, 0x1
SHADOWS = {"none": 0, "feet": 1, "ground": 2}
FLAG_TURNS, FLAG_HOPS = 0x1, 0x2
# The directions a perch turns to: a bit each from bit 4 (AMBIENT_FLAG_FACES_SHIFT), none for all four
FLAG_FACES_SHIFT = 4
# A reaction (SpawnAmbient's react fields, include/paperwhite2/spawns.h): its kind (0 none), its emote (0 none, else
# the bubble's EMOTION_BUBBLE_* + 1), a heading of AWAY for away from the player and a return of NEVER, and the defaults
REACTS = {"fly": 1, "run": 2, "hide": 3}
EMOTES = {"exclamation": 1, "question": 2, "note": 3, "ellipsis": 4}
REACT_AWAY = NEVER = 0xFFFF
REACT_NEAR, REACT_STARTLE_MORE, REACT_SPREAD, REACT_CLIMB, REACT_SPEED = 3, 2, 20, 30, 6
# An NPC's "rolls" as the CONDITION_SEED_* its picks start from (include/paperwhite2/conditions.h)
SEEDS = {"entry": 0, "day": 1, "hour": 3, "period": 4}


def group_members(sources: Path, schema: dict) -> tuple[list[dict], dict[str, list[dict]]]:
    """The groups of groups.json, and each one's members from the zones' files: its zone, its kind, its key, its
    instance's index, its weight and the parts its zone works out for it (each its condition, its role and its flag)."""
    path = sources / GROUPS
    groups = load(path, load_schema(SOURCES / "groups.schema.json"))["groups"] if path.is_file() else []
    index = {}
    for i, group in enumerate(groups):
        if group["id"] in index:
            raise DataError(f"{label(path)}: groups[{i}]: the id {group['id']!r} is taken")
        index[group["id"]] = i
    members = {group["id"]: [] for group in groups}

    def join(membership: dict, where: str, member: dict):
        if membership["id"] not in members:
            raise DataError(f"{where}.group: {label(path)} has no group {membership['id']!r}")
        members[membership["id"]].append({**member, "weight": membership.get("weight", 1), "where": where})

    for zone_path in zone_files(sources):
        source = load(zone_path, schema)
        zone = value(f"ZONE_{zone_path.stem.upper()}", label(zone_path))
        for i, entry in enumerate(source.get("npcs", [])):
            where = f"{label(zone_path)}: npcs[{i}]"
            seed = SEEDS[entry.get("rolls", "hour")]
            instances = entry.get("instances", [])
            gate = [(entry["when"], ROLE_GATE, 0)] if "when" in entry else []
            if "group" in entry:
                if any("group" in instance for instance in instances):
                    raise DataError(f"{where}: an NPC in a group can't have an instance in one")
                join(entry["group"], where, {"zone": zone, "kind": MEMBER_NPC, "key": entry["id"], "instance": 0,
                                             "seed": seed, "rolls": entry.get("rolls", "hour"), "parts": (gate + [
                                                 (instance.get("when", {}), ROLE_OPTION, instance_flag(instance, where))
                                                 for instance in instances]) or [({}, ROLE_GATE, 0)]})
            for j, instance in enumerate(instances):
                if "group" in instance:
                    join(instance["group"], f"{where}.instances[{j}]", {
                        "zone": zone, "kind": MEMBER_INSTANCE, "key": entry["id"], "instance": j, "seed": seed,
                        "rolls": entry.get("rolls", "hour"), "parts": gate + [
                            (other.get("when", {}), ROLE_TARGET if k == j else ROLE_PASS,
                             instance_flag(other, where)) for k, other in enumerate(instances)]})
        for i, ambient in enumerate(source.get("ambients", [])):
            if "group" in ambient:
                join(ambient["group"], f"{label(zone_path)}: ambients[{i}]", {
                    "zone": zone, "kind": MEMBER_AMBIENT, "key": i, "instance": 0,
                    "seed": SEEDS[ambient.get("rolls", "hour")], "rolls": ambient.get("rolls", "hour"),
                    "parts": [(ambient.get("when", {}), ROLE_AMBIENT, 0)]})
    for group in groups:
        listed = members[group["id"]]
        if len({m["zone"] for m in listed}) > 1:
            rolling = [m["where"] for m in listed if m["rolls"] == "entry"]
            if group.get("rolls") == "entry" or rolling:
                raise DataError(f"{label(path)}: group {group['id']!r} has members in several zones, so neither it nor "
                                f"they can roll each entry ({', '.join(rolling) or 'the group'})")
        # (a member's index is a byte, and 0xff is SPAWNS_GROUP_PICKED_NOBODY)
        if len(listed) > 255:
            raise DataError(f"{label(path)}: group {group['id']!r} has more than 255 members")
    per_zone = {}
    for listed in members.values():
        for member in listed:
            per_zone[member["zone"]] = per_zone.get(member["zone"], 0) + 1
    for zone, count in per_zone.items():
        if count > ZONE_MEMBERS_MAX:
            raise DataError(f"zone {zone} has {count} members of groups, more than {ZONE_MEMBERS_MAX}")
    return groups, members


def instance_flag(instance: dict, where: str) -> int:
    return value(instance["npc"].get("flag", 0), where)


def group_rules(compiler: Compiler, zone: int, groups: list[dict], members: dict[str, list[dict]]) -> list:
    """The rules of the groups that a zone has a member of: each one's header, then its members' parts."""
    rules = []
    for g, group in enumerate(groups):
        listed = members[group["id"]]
        if not any(m["zone"] == zone for m in listed):
            continue
        rules.append(([], 0, 1, PAYLOAD.pack(KIND_GROUP, SEEDS[group.get("rolls", "hour")], g)
                      + GROUP.pack(group.get("nobody", 0), len(listed))))
        for m, member in enumerate(listed):
            for when, role, flag in member["parts"]:
                rules.append((compiler.compile(when, f"{member['where']}.when"), 0, member["weight"],
                              PAYLOAD.pack(KIND_GROUP_PART, member["seed"], member["key"])
                              + GROUP_PART.pack(member["zone"], m, role, member["kind"], member["instance"], flag)))
    return rules


def zone_files(sources: Path) -> list[Path]:
    return [path for path in sorted(sources.glob("*.json")) if not path.name.endswith(".schema.json")
            and path.name != GROUPS]


def zone_table(path: Path, schema: dict, groups: list[dict] = (), members: dict | None = None) -> bytes | None:
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
        elif "group" in entry and not entry.get("instances"):
            # (a member with no rules of its own: an empty condition, so the field sees it)
            rules.append(([], 0, 1, PAYLOAD.pack(KIND_CONDITION, seed, npc_id)))
        for j, instance in enumerate(entry.get("instances", [])):
            at = f"{where}.instances[{j}]"
            record = npc_bytes({**instance["npc"], "id": npc_id}, at)
            rules.append((compiler.compile(instance.get("when", {}), f"{at}.when"), 0, instance.get("weight", 1),
                          PAYLOAD.pack(KIND_INSTANCE, seed, npc_id) + record))
    for i, ambient in enumerate(source.get("ambients", [])):
        rules.append((compiler.compile(ambient.get("when", {}), f"{label(path)}: ambients[{i}].when"), 0, 1,
                      PAYLOAD.pack(KIND_AMBIENT, SEEDS[ambient.get("rolls", "hour")], i) + ambient_bytes(ambient, f"{label(path)}: ambients[{i}]")))
        # Its sprites with conditions, each a rule of its own straight after it: those that hold are picked from first
        for k, sprite in enumerate(ambient.get("sprites", [])):
            if isinstance(sprite, dict):
                where = f"{label(path)}: ambients[{i}].sprites[{k}]"
                rules.append((compiler.compile(sprite.get("when", {}), f"{where}.when"), 0, 1,
                              PAYLOAD.pack(KIND_AMBIENT_SPRITE, SEEDS[ambient.get("rolls", "hour")], i)
                              + struct.pack("<Hxx", value(sprite["sprite"], where))))
    if members:
        rules += group_rules(compiler, value(f"ZONE_{path.stem.upper()}", label(path)), groups, members)
    return pack_table(rules, compiler.lists) if rules else None


def ambient_bytes(ambient: dict, where: str) -> bytes:
    """An ambient's record (SpawnAmbient)."""
    p = ambient.get("path", {"kind": "perch"})
    flags = (FLAG_TURNS if p.get("turns", True) else 0) | (FLAG_HOPS if p.get("hops", True) else 0)
    for face in p.get("faces", []):
        flags |= 1 << (value(face, where) + FLAG_FACES_SHIFT)
    offset = ambient.get("offset", {})
    # (fx32 world units: 16 a tile, from the tile's middle)
    x = round((ambient["x"] * 16 + 8 + offset.get("x", 0)) * 4096)
    z = round((ambient["z"] * 16 + 8 + offset.get("z", 0)) * 4096)
    y = round(ambient["y"] * 4096)
    kind = p["kind"]
    speed = (p.get("every", 0) if kind == "perch" else p.get("every", WANDER_EVERY) if kind == "wander"
             else p.get("speed", 45))
    width, depth, height = p.get("width", 0), p.get("depth", 0), p.get("height", 0)
    if kind == "flyover":
        width, height = p.get("range", FLYOVER_RANGE) * 16, p.get("height", FLYOVER_HEIGHT)
    points = p.get("points", []) if kind == "waypoints" else []
    if len(points) > AMBIENT_POINTS:
        raise DataError(f"{where}: a waypoints path has at most {AMBIENT_POINTS} points after its place")
    travel = (p.get("pace", PACE) * 16, p.get("wait", WAIT if kind != "waypoints" else 0), p.get("up", UP),
              p.get("heading", REACT_AWAY), len(points), FLAG_BACK if p.get("back") else 0,
              *[c for point in points for c in (point.get("x", 0), point.get("y", 0), point.get("z", 0))],
              *[0] * (3 * (AMBIENT_POINTS - len(points))))
    listed = ambient.get("sprites", [ambient["sprite"]] if "sprite" in ambient else [])
    if not 1 <= len(listed) <= AMBIENT_SPRITES:
        raise DataError(f"{where}: an ambient needs a sprite, or a set of 1 to {AMBIENT_SPRITES}")
    # (those with conditions are rules of their own, after the ambient's)
    sprites = [value(s, where) for s in listed if not isinstance(s, dict)]
    react = ambient.get("react")
    if react:
        near = react.get("near", REACT_NEAR)
        returns = react.get("returns")
        if returns and returns["min"] > returns["max"]:
            raise DataError(f"{where}: react.returns' min is past its max")
        reaction = (value(react["sprite"], where) if "sprite" in react else 0,
                    react.get("direction", REACT_AWAY), react.get("speed", REACT_SPEED) * 16,
                    value(react["cry"], where) if "cry" in react else 0,
                    returns["min"] if returns else NEVER, returns["max"] if returns else NEVER,
                    REACTS[react["kind"]], near, react.get("startle", near + REACT_STARTLE_MORE),
                    EMOTES[react["emote"]] if "emote" in react else 0, react.get("spread", REACT_SPREAD),
                    react.get("climb", REACT_CLIMB))
    else:
        reaction = (0, REACT_AWAY, 0, 0, NEVER, NEVER, 0, 0, 0, 0, 0, 0)
    return AMBIENT.pack(*sprites, *[0] * (AMBIENT_SPRITES - len(sprites)), len(sprites), PATHS[p["kind"]],
                        SHADOWS[ambient.get("shadow", "none")], value(ambient.get("facing", "DIR_DOWN"), where), flags,
                        x, y, z, width, depth, speed, p.get("start", 0) % 360, height, *reaction, *travel)


def member(sources: Path = SOURCES) -> bytes:
    """The spawn member of the zones' files in sources."""
    schema = load_schema(SOURCES / "overworld.schema.json")
    groups, members = group_members(sources, schema)
    tables = []
    for path in zone_files(sources):
        table = zone_table(path, schema, groups, members)
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
            if kind == KIND_GROUP:
                nobody, count = GROUP.unpack_from(payload, PAYLOAD.size)
                print(f"  group {npc_id}: {count} members, nobody {nobody}, rolls {rolls}")
            elif kind == KIND_GROUP_PART:
                zone_id, m, role, member_kind, instance, flag = GROUP_PART.unpack_from(payload, PAYLOAD.size)
                print(f"    member {m} (zone {zone_id}, {['NPC', 'instance', 'ambient'][member_kind]} {npc_id}"
                      f"{f'.{instance}' if member_kind == MEMBER_INSTANCE else ''}): role {role}, weight {weight}, "
                      f"{len(clauses)} clauses")
            elif kind in (KIND_AMBIENT, KIND_AMBIENT_SPRITE):
                print(f"  {'ambient' if kind == KIND_AMBIENT else 'sprite of ambient'} {npc_id}, {len(clauses)} clauses")
            else:
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
