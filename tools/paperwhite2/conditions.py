#!/usr/bin/env python3
"""Paper White 2's conditions: compiles the shared condition JSON (res/paperwhite2/conditions/condition.schema.json)
into the clause encoding that src/paperwhite2/main/paperwhite2_conditions.c matches, and writes the generated headers
of the terrain groups and the level scaling. Every consumer's packer imports it; the build runs its commands:

    conditions.py archive CALENDAR_IN CALENDAR_OUT     # the weather calendar's archive with the tables after it
    conditions.py table RULES.json OUT.bin             # one compiled table, for a test
    conditions.py dump TABLE.bin                       # a compiled table, decoded
    conditions.py terrain-header OUT.h                 # paperwhite2/terrain_groups.h
    conditions.py level-scaling-header OUT.h           # paperwhite2/level_scaling_config.h
    conditions.py script-header OUT.h                  # paperwhite2/script_conditions.h, CheckCondition's IDs

Only the hack's build runs it (configure.py --hack). The format (docs/paperwhite2/plugins.md, Conditions):

- A clause is 8 bytes, Condition in include/paperwhite2/conditions.h: u8 kind, u8 op, u16 arg, u32 value. Its kinds
  and ops are that header's CONDITION_KIND_* and CONDITION_OP_*, read from it here.
- A rule is a 4-byte ConditionRule (u8 clause count, u8 priority, u16 weight), its clauses, then its consumer's
  payload up to the next rule (a debug table's payload is the rule's name, ASCII and a 0).
- A table is a 12-byte ConditionTable header (u32 "PWCT", u8 version 1, u8 share in percent, u16 rule count, u16 list
  count, u16 size in bytes), a u16 offset from the table's start for each rule and then each list, then the rules and
  the lists, each from a multiple of 4. A list is a u16 count and that many sorted u16s.

How the fields compile, each to one clause, so a rule's clauses are all of its fields:

- season, time, weather, terrain, type, nature, status and facing are a bit mask in value (CONDITION_OP_MASK);
- flags: a clause per flag, SET or UNSET; vars: a clause per comparison, the variable in arg and the value in value;
- zone and species, and follower's species: one is EQ with it in arg, several are IN_LIST with arg the list's number;
- zone_group: the zones of the named groups (zone_groups.json: every zone whose header's parent is one of "parent",
  and "zones"), as zone's list;
- exterior: EQ with arg 1 or 0; follower and item_waiting true or false: ANY, or EQ 0;
- the ranges (party_level, scaled_level, level, hp, friendship, steps, total_steps, tile_x, tile_y): RANGE, arg the
  least (0 when left out) and value the greatest (0xffffffff when left out);
- chance: value the percent, the last clause, so it rolls only when the rest hold.
"""
import argparse
import json
import re
import struct
import sys
from functools import cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.datajson import DataError, constants, label, load_schema, validate, value  # noqa: E402
from tools.data.narc import read_narc, write_narc  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "res" / "paperwhite2" / "conditions"
SCHEMA = DATA / "condition.schema.json"
TERRAIN_GROUPS = DATA / "terrain_groups.json"
ZONE_GROUPS = DATA / "zone_groups.json"
LEVEL_SCALING = ROOT / "res" / "paperwhite2" / "level_scaling.json"
HEADER = ROOT / "include" / "paperwhite2" / "conditions.h"
FIELD_MAP_HEADER = ROOT / "include" / "field" / "field_map.h"
WEATHER_HEADER = ROOT / "include" / "system" / "zone_weather.h"
ZONES = ROOT / "res" / "field" / "zones"
# The calendar's archive (ARCID_CALENDAR), its two files, and the tables after them by their member, as
# CONDITION_TABLE_MEMBER_* of the header names them
CALENDAR_FILES = 2
TABLES = {2: DATA / "debug_samples.json", 3: DATA / "script_conditions.json"}
# The table that CheckCondition tests, whose rules' IDs the scripts' header names
SCRIPT_CONDITIONS = TABLES[3]

MAGIC = 0x54435750
VERSION = 1
CLAUSE = struct.Struct("<BBHI")
RULE = struct.Struct("<BBH")
TABLE = struct.Struct("<IBBHHH")
MAX_RULES = 256
RANGE_ALL = 0xFFFFFFFF
SEASONS = ["spring", "summer", "autumn", "winter"]
PERIODS = ["morning", "day", "evening", "night", "late_night"]
STATUSES = ["none", "poison", "sleep", "burn", "freeze", "paralysis"]
VAR_OPS = {"=": "EQ", "!=": "NE", ">=": "GE", "<=": "LE", ">": "GT", "<": "LT"}
RANGES = {"party_level": "PARTY_LEVEL", "scaled_level": "SCALED_LEVEL", "level": "LEVEL", "hp": "HP",
          "friendship": "FRIENDSHIP", "steps": "STEPS", "total_steps": "TOTAL_STEPS", "tile_x": "TILE_X",
          "tile_y": "TILE_Y"}
# The facings in the order of DIR_UP to DIR_RIGHT (include/constants/directions.h)
FACINGS = ["up", "down", "left", "right"]
SPECIES_BITS = 11


@cache
def enum(prefix: str) -> dict[str, int]:
    """The header's constants with a prefix (CONDITION_KIND_, CONDITION_OP_), without it."""
    found = {m.group(1): int(m.group(2)) for m in re.finditer(rf"\b{prefix}(\w+) = (\d+),", HEADER.read_text())}
    if not found:
        raise DataError(f"{label(HEADER)}: no {prefix} constants")
    return found


def kind(name: str) -> int:
    return enum("CONDITION_KIND_")[name]


def op(name: str) -> int:
    return enum("CONDITION_OP_")[name]


@cache
def schema() -> dict:
    return load_schema(SCHEMA)


def load_def(path: Path, definition: str):
    """Reads a file and checks it against one of the schema's $defs."""
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as error:
        raise DataError(f"{label(path)}: {error}") from None
    try:
        validate(data, {"$ref": f"#/$defs/{definition}"}, "", schema())
    except DataError as error:
        raise DataError(f"{label(path)}: {error}") from None
    return data


@cache
def weathers() -> dict[str, int]:
    body = re.search(r"enum \{(.*?)\};", WEATHER_HEADER.read_text(), re.S)
    names = re.findall(r"\b(WEATHER_\w+),", body.group(1))
    return {name: i for i, name in enumerate(names) if name != "WEATHER_MAX"}


@cache
def tile_names() -> tuple[set[str], set[str]]:
    text = FIELD_MAP_HEADER.read_text()
    return set(re.findall(r"\b(TILE_CLASS_\w+) =", text)), set(re.findall(r"#define (TILE_FLAG_\w+) ", text))


@cache
def terrain_groups() -> list[dict]:
    groups = load_def(TERRAIN_GROUPS, "terrain_groups")["groups"]
    classes, flags = tile_names()
    names = set()
    for group in groups:
        where = f"{label(TERRAIN_GROUPS)}: {group['name']}"
        if group["name"] in names:
            raise DataError(f"{where}: a second group of this name")
        names.add(group["name"])
        for name in group.get("classes", []):
            if name not in classes:
                raise DataError(f"{where}: {name} is no TILE_CLASS_ of {label(FIELD_MAP_HEADER)}")
        for name in group.get("flags", []):
            if name not in flags:
                raise DataError(f"{where}: {name} is no TILE_FLAG_ of {label(FIELD_MAP_HEADER)}")
        if not any(key in group for key in ("classes", "flags", "exterior")):
            raise DataError(f"{where}: no classes, flags or exterior, so no tile is in it")
    return groups


@cache
def zone_parents() -> dict[int, int]:
    """Each zone's parent zone, from its header (res/field/zones/)."""
    zones = {name: number for name, number in constants().items() if name.startswith("ZONE_")}
    parents = {}
    for path in ZONES.glob("*.json"):
        data = json.loads(path.read_text())
        number = zones.get("ZONE_" + path.stem.upper())
        if number is not None and "parent" in data:
            parents[number] = value(data["parent"], label(path))
    return parents


@cache
def zone_groups() -> dict[str, list[int]]:
    groups = {}
    for name, group in load_def(ZONE_GROUPS, "zone_groups")["groups"].items():
        where = f"{label(ZONE_GROUPS)}: {name}"
        parents = {value(zone, where) for zone in group.get("parent", [])}
        zones = {zone for zone, parent in zone_parents().items() if parent in parents}
        zones |= {value(zone, where) for zone in group.get("zones", [])}
        if not zones:
            raise DataError(f"{where}: no zone is in it")
        groups[name] = sorted(zones)
    return groups


def mask(items, names: list[str] | dict[str, int], where: str) -> int:
    bits = 0
    for item in items:
        if item not in names:
            raise DataError(f"{where}: {item!r} is not one of {list(names)}")
        bits |= 1 << (names.index(item) if isinstance(names, list) else names[item])
    return bits


class Compiler:
    """Compiles conditions into clauses, keeping the lists they share for their table."""

    def __init__(self):
        self.lists: list[tuple[int, ...]] = []

    def list_index(self, items) -> int:
        items = tuple(sorted(set(items)))
        if items not in self.lists:
            self.lists.append(items)
        return self.lists.index(items)

    def one_or_list(self, clause_kind: str, items: list[int]) -> tuple[int, int, int, int]:
        items = sorted(set(items))
        if len(items) == 1:
            return (kind(clause_kind), op("EQ"), items[0], 0)
        return (kind(clause_kind), op("IN_LIST"), self.list_index(items), 0)

    def compile(self, condition: dict, where: str) -> list[tuple[int, int, int, int]]:
        """The clauses of a condition, (kind, op, arg, value) each, CHANCE last."""
        clauses = []
        masks = {"season": ("SEASON", SEASONS), "time": ("PERIOD", PERIODS), "weather": ("WEATHER", weathers())}
        for field, (clause_kind, names) in masks.items():
            if field in condition:
                clauses.append((kind(clause_kind), op("MASK"), 0, mask(condition[field], names, f"{where}.{field}")))
        for state in ("set", "unset"):
            for flag in condition.get("flags", {}).get(state, []):
                clauses.append((kind("FLAG"), op(state.upper()), value(flag, f"{where}.flags"), 0))
        for comparison in condition.get("vars", []):
            clauses.append((kind("VAR"), op(VAR_OPS[comparison["op"]]), value(comparison["var"], f"{where}.vars"),
                            comparison["value"]))
        if "zone" in condition:
            clauses.append(self.one_or_list("ZONE", [value(zone, f"{where}.zone") for zone in condition["zone"]]))
        if "zone_group" in condition:
            zones = []
            for name in condition["zone_group"]:
                if name not in zone_groups():
                    raise DataError(f"{where}.zone_group: {name!r} is no group of {label(ZONE_GROUPS)}")
                zones += zone_groups()[name]
            clauses.append(self.one_or_list("ZONE", zones))
        if "exterior" in condition:
            clauses.append((kind("EXTERIOR"), op("EQ"), int(condition["exterior"]), 0))
        if "terrain" in condition:
            names = [group["name"] for group in terrain_groups()]
            clauses.append((kind("TERRAIN"), op("MASK"), 0, mask(condition["terrain"], names, f"{where}.terrain")))
        for field, clause_kind in RANGES.items():
            if field in condition:
                least, greatest = condition[field].get("min", 0), condition[field].get("max", RANGE_ALL)
                if least > greatest:
                    raise DataError(f"{where}.{field}: min {least} is above max {greatest}")
                clauses.append((kind(clause_kind), op("RANGE"), least, greatest))
        if "species" in condition:
            entries = []
            for item in condition["species"]:
                species = value(item if isinstance(item, str) else item["species"], f"{where}.species")
                form = item.get("form") if isinstance(item, dict) else None
                entries.append(species if form is None else species | ((form + 1) << SPECIES_BITS))
            clauses.append(self.one_or_list("SPECIES", entries))
        for field, clause_kind in (("type", "TYPE"), ("nature", "NATURE")):
            if field in condition:
                bits = 0
                for name in condition[field]:
                    bits |= 1 << value(name, f"{where}.{field}")
                clauses.append((kind(clause_kind), op("MASK"), 0, bits))
        if "status" in condition:
            statuses = condition["status"]
            bits = mask([s for s in statuses if s != "any"], STATUSES, f"{where}.status")
            if "any" in statuses:
                bits |= ((1 << len(STATUSES)) - 1) & ~1
            clauses.append((kind("STATUS"), op("MASK"), 0, bits))
        if "follower" in condition:
            follower = condition["follower"]
            if follower is True:
                clauses.append((kind("FOLLOWER"), op("ANY"), 0, 0))
            elif follower is False:
                clauses.append((kind("FOLLOWER"), op("EQ"), 0, 0))
            else:
                clauses.append(self.one_or_list("FOLLOWER", [value(s, f"{where}.follower") for s in follower]))
        if "facing" in condition:
            clauses.append((kind("FACING"), op("MASK"), 0, mask(condition["facing"], FACINGS, f"{where}.facing")))
        if "item_waiting" in condition:
            clauses.append((kind("ITEM_WAITING"), op("ANY" if condition["item_waiting"] else "EQ"), 0, 0))
        if "chance" in condition:
            clauses.append((kind("CHANCE"), op("EQ"), 0, condition["chance"]))
        return clauses


def align(data: bytes) -> bytes:
    return data + b"\0" * (-len(data) % 4)


def pack_table(rules: list[tuple[list, int, int, bytes]], lists: list[tuple[int, ...]], share: int = 100) -> bytes:
    """A table of rules, each (clauses, priority, weight, payload), and the lists their clauses name."""
    if len(rules) > MAX_RULES:
        raise DataError(f"{len(rules)} rules, more than a table's {MAX_RULES}")
    header_size = TABLE.size + 2 * (len(rules) + len(lists))
    body = bytearray()
    offsets = []
    start = len(align(b"\0" * header_size))
    for clauses, priority, weight, payload in rules:
        offsets.append(start + len(body))
        body += RULE.pack(len(clauses), priority, weight)
        body += b"".join(CLAUSE.pack(*clause) for clause in clauses)
        body += align(payload)
    for items in lists:
        offsets.append(start + len(body))
        body += align(struct.pack(f"<H{len(items)}H", len(items), *items))
    size = start + len(body)
    if size > 0xFFFF:
        raise DataError(f"the table is {size} bytes, more than its u16 offsets reach")
    head = TABLE.pack(MAGIC, VERSION, share, len(rules), len(lists), size) + struct.pack(f"<{len(offsets)}H", *offsets)
    return align(head) + bytes(body)


def unpack_table(data: bytes) -> dict:
    """A compiled table, decoded: the round trip of pack_table."""
    magic, version, share, rule_count, list_count, size = TABLE.unpack_from(data)
    if magic != MAGIC or version != VERSION or size != len(data):
        raise ValueError("not a version 1 condition table of its size")
    offsets = struct.unpack_from(f"<{rule_count + list_count}H", data, TABLE.size)
    ends = list(offsets[1:]) + [size]
    rules = []
    for index in range(rule_count):
        offset = offsets[index]
        count, priority, weight = RULE.unpack_from(data, offset)
        clauses = [CLAUSE.unpack_from(data, offset + RULE.size + CLAUSE.size * i) for i in range(count)]
        payload = data[offset + RULE.size + CLAUSE.size * count:ends[index]]
        rules.append((clauses, priority, weight, payload))
    lists = []
    for index in range(list_count):
        offset = offsets[rule_count + index]
        (count,) = struct.unpack_from("<H", data, offset)
        lists.append(struct.unpack_from(f"<{count}H", data, offset + 2))
    return {"share": share, "rules": rules, "lists": lists}


def compile_rule_set(path: Path) -> bytes:
    """A rule set's table (debug_samples.json), each rule's name its payload."""
    data = load_def(path, "rule_set")
    compiler = Compiler()
    rules = []
    for index, rule in enumerate(data["rules"]):
        where = f"{label(path)}: rules[{index}] ({rule['name']})"
        rules.append((compiler.compile(rule.get("when", {}), where), rule.get("priority", 0), rule.get("weight", 1),
                      rule["name"].encode("ascii") + b"\0"))
    try:
        return pack_table(rules, compiler.lists, data.get("share", 100))
    except DataError as error:
        raise DataError(f"{label(path)}: {error}") from None


def archive(source: Path, output: Path):
    files = read_narc(source.read_bytes())
    if len(files) != CALENDAR_FILES:
        raise DataError(f"{source}: {len(files)} files, not the weather calendar's {CALENDAR_FILES}")
    for member, path in sorted(TABLES.items()):
        if member != len(files):
            raise DataError(f"{label(path)}: member {member} isn't the next one, {len(files)}")
        files.append(compile_rule_set(path))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(write_narc(files))


def terrain_header() -> str:
    groups = terrain_groups()
    lines = ["#ifndef PAPERWHITE2_TERRAIN_GROUPS_H", "#define PAPERWHITE2_TERRAIN_GROUPS_H", "",
             f"// Generated by tools/paperwhite2/conditions.py from {label(TERRAIN_GROUPS)}, edit that",
             "// instead. The terrain groups' bit numbers (TERRAIN_GROUP_*), then the tables of",
             "// src/paperwhite2/ov036/paperwhite2_conditions_field.c: each tile class's groups, each tile flag's, and",
             "// the groups of indoors and outdoors (TERRAIN_GROUPS_*, masks); then the groups' names", ""]
    for index, group in enumerate(groups):
        lines.append(f"#define TERRAIN_GROUP_{group['name'].upper()} {index}")
    lines.append(f"#define TERRAIN_GROUP_COUNT {len(groups)}")
    classes: dict[str, int] = {}
    flags: dict[str, int] = {}
    for index, group in enumerate(groups):
        for name in group.get("classes", []):
            classes[name] = classes.get(name, 0) | 1 << index
        for name in group.get("flags", []):
            flags[name] = flags.get(name, 0) | 1 << index
    indoor = sum(1 << i for i, group in enumerate(groups) if group.get("exterior") is False)
    outdoor = sum(1 << i for i, group in enumerate(groups) if group.get("exterior") is True)
    lines += ["", f"#define TERRAIN_GROUP_CLASS_COUNT {len(classes)}", "#define TERRAIN_GROUP_CLASSES \\"]
    lines += [f"    {{ {name}, {bits:#x} }}, \\" for name, bits in classes.items()]
    lines += ["", f"#define TERRAIN_GROUP_FLAG_COUNT {len(flags)}", "#define TERRAIN_GROUP_FLAGS \\"]
    lines += [f"    {{ {name}, {bits:#x} }}, \\" for name, bits in flags.items()]
    lines += ["", f"#define TERRAIN_GROUPS_INDOOR {indoor:#x}", f"#define TERRAIN_GROUPS_OUTDOOR {outdoor:#x}", "",
              "#define TERRAIN_GROUP_NAMES \\"]
    lines += [f"    \"{group['name']}\", \\" for group in groups]
    lines += ["", "#endif // PAPERWHITE2_TERRAIN_GROUPS_H", ""]
    return "\n".join(lines)


def level_scaling_header() -> str:
    data = load_def(LEVEL_SCALING, "level_scaling")
    if data["min"] > data["max"]:
        raise DataError(f"{label(LEVEL_SCALING)}: min {data['min']} is above max {data['max']}")
    return "\n".join([
        "#ifndef PAPERWHITE2_LEVEL_SCALING_CONFIG_H", "#define PAPERWHITE2_LEVEL_SCALING_CONFIG_H", "",
        f"// Generated by tools/paperwhite2/conditions.py from {label(LEVEL_SCALING)}, edit that instead: the adjusted",
        "// party median is median * PERCENT / 100 + OFFSET, rounded down, from MIN to MAX, and wild levels around it",
        "// from it - SPREAD to it + SPREAD (Conditions_ScaledLevel, src/paperwhite2/main/paperwhite2_conditions.c)", "",
        *(f"#define LEVEL_SCALING_{key.upper()} {data[key]}" for key in ("percent", "offset", "min", "max", "spread")),
        "", "#endif // PAPERWHITE2_LEVEL_SCALING_CONFIG_H", ""])


def script_header() -> str:
    """The IDs of CheckCondition's conditions, which the scripts include: SCRIPT_CONDITION_ and each name."""
    rules = load_def(SCRIPT_CONDITIONS, "rule_set")["rules"]
    names = {}
    for index, rule in enumerate(rules):
        name = "SCRIPT_CONDITION_" + re.sub(r"[^A-Z0-9]+", "_", rule["name"].upper()).strip("_")
        if name in names:
            raise DataError(f"{label(SCRIPT_CONDITIONS)}: rules {names[name]} and {index} are both {name}")
        names[name] = index
    return "\n".join([
        "#ifndef PAPERWHITE2_SCRIPT_CONDITIONS_H", "#define PAPERWHITE2_SCRIPT_CONDITIONS_H", "",
        f"// Generated by tools/paperwhite2/conditions.py from {label(SCRIPT_CONDITIONS)}, edit that",
        "// instead: the IDs of the conditions that CheckCondition id, result tests (paperwhite2/condition_commands.h)",
        "", *(f"#define {name} {index}" for name, index in names.items()), "",
        f"#define SCRIPT_CONDITION_COUNT {len(names)}", "", "#endif // PAPERWHITE2_SCRIPT_CONDITIONS_H", ""])


def write_if_changed(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.read_text() != text:
        path.write_text(text)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("archive")
    command.add_argument("source", type=Path)
    command.add_argument("output", type=Path)
    command = commands.add_parser("table")
    command.add_argument("rules", type=Path)
    command.add_argument("output", type=Path)
    command = commands.add_parser("dump")
    command.add_argument("table", type=Path)
    for name in ("terrain-header", "level-scaling-header", "script-header"):
        commands.add_parser(name).add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "archive":
            archive(args.source, args.output)
        elif args.command == "table":
            args.output.write_bytes(compile_rule_set(args.rules))
        elif args.command == "dump":
            table = unpack_table(args.table.read_bytes())
            kinds = {number: name for name, number in enum("CONDITION_KIND_").items()}
            ops = {number: name for name, number in enum("CONDITION_OP_").items()}
            print(f"share {table['share']}%, {len(table['rules'])} rules, {len(table['lists'])} lists")
            for index, (clauses, priority, weight, payload) in enumerate(table["rules"]):
                print(f"  {index}: priority {priority} weight {weight} payload {payload.rstrip(bytes(1))!r}")
                for clause_kind, clause_op, arg, number in clauses:
                    print(f"    {kinds[clause_kind]} {ops[clause_op]} arg {arg} value {number:#x}")
            for index, items in enumerate(table["lists"]):
                print(f"  list {index}: {list(items)}")
        elif args.command == "terrain-header":
            write_if_changed(args.output, terrain_header())
        elif args.command == "script-header":
            write_if_changed(args.output, script_header())
        else:
            write_if_changed(args.output, level_scaling_header())
    except DataError as error:
        sys.exit(f"error: {error}")


if __name__ == "__main__":
    main()
