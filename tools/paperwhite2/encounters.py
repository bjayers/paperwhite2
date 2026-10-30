#!/usr/bin/env python3
"""Paper White 2: the wild encounters (docs/paperwhite2/encounters.md), packed from res/paperwhite2/encounters/.

    encounters.py archive ARCHIVE_IN ARCHIVE_OUT    # the wild encounters' archive (a/1/2/7) with the data after it
    encounters.py member OUTPUT                     # the member alone
    encounters.py check                             # validate the data and print its sizes
    encounters.py odds AREA METHOD SEASON PERIOD WEATHER SCALED [MEDIAN]   # one place's odds from the packed member

The sources, each checked against its schema beside it: settings.json, groups.json, areas/<area>.json (an area is an
original table, ENCOUNTERS_<AREA>) and species/<species>.json, with the scaled level's percent and spread from
res/paperwhite2/level_scaling.json (the conditions engine's). The member follows the archive's tables, so the zone
headers' ENCOUNTERS_* numbers still name the areas, and src/paperwhite2/main/paperwhite2_encounters.c reads the
current area's block when the field loads its table. Its layout (include/paperwhite2/encounters.h):

- a 48-byte header (HEADER): the magic "PENC", the version, the area count, the outbreak entry count and the number
  of outbreaks, the tier count and each tier's share in tenths of a percent, the level gate, the hidden ability's
  chance, the outbreak share, the rustling spots' tiers (a bit each) and species with its levels, the three kinds of
  spots' fixed shares, the methods the spots draw from (a bit each), and the offsets of the outbreaks and the index;
- the outbreaks (OUTBREAK), one entry for each area of each outbreak, with the outbreak's number;
- the index: each area's block offset and size (0 for an area without a file);
- each area's block: its rates (AREA: four seasons of seven methods), its kind of spots, its candidate count and the
  offset of its ConditionTable, then the candidates (CANDIDATE), then the table of their extra conditions.

A candidate is one habitat in one area for one season or for all of its seasons: the species and its family's base
species, the weathers (a bit each, 0 for any), its rule in the area's table (0xffff for none), the form, the tier, the
methods, seasons and periods (a bit each, in the order of ENCTYPE_*, SEASON_* and DAY_PERIOD_*), its levels, its
hidden ability's chance and its battle styles (single, double, triple, then 0 for family partners or 1 for any).
"""
import argparse
import json
import struct
import sys
from functools import cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.datajson import DataError, constants, label, load_schema, validate  # noqa: E402
from tools.data.narc import read_narc, write_narc  # noqa: E402
from tools.paperwhite2 import conditions  # noqa: E402

SOURCE = ROOT / "res" / "paperwhite2" / "encounters"
LEVEL_SCALING = ROOT / "res" / "paperwhite2" / "level_scaling.json"
SPECIES = ROOT / "res" / "pokemon"
ZONES = ROOT / "res" / "field" / "zones"

MAGIC = b"PENC"
VERSION = 1
HEADER = struct.Struct("<4sHHHBB8HBBBBHBB3BBII")
OUTBREAK = struct.Struct("<HHHBBBBBBBx")
INDEX = struct.Struct("<II")
AREA = struct.Struct("<28BBxHHxx")
CANDIDATE = struct.Struct("<HHHH8B4B")
# The runtime's limits (include/paperwhite2/encounters.h): tiers, an area's block, the candidates one method can have
# in one area, and the outbreak entries
TIER_MAX = 8
BLOCK_MAX = 0x1000
SLOT_MAX = 64
OUTBREAK_MAX = 128
NO_RULE = 0xFFFF

METHODS = ["grass", "dark_grass", "rustling", "surf", "rippling_surf", "fishing", "rippling_fishing"]
SEASONS = ["spring", "summer", "autumn", "winter"]
TIMES = ["morning", "day", "evening", "night", "late_night"]
SPOTS = ["grass", "dust", "shadow"]
GATES = ["party", "scaled"]
PARTNERS = ["family", "area"]


def bits(names, order, where: str) -> int:
    mask = 0
    for name in names:
        if name not in order:
            raise DataError(f"{where}: {name!r} isn't one of {', '.join(order)}")
        mask |= 1 << order.index(name)
    return mask


@cache
def schema(name: str) -> dict:
    # A habitat's "when" is the conditions engine's condition, which load_schema brings in from its schema
    return load_schema(SOURCE / name)


def load(path: Path, schema_name: str) -> dict:
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as error:
        raise DataError(f"{label(path)}: {error}") from None
    validate(data, schema(schema_name), f"{label(path)}: ", schema(schema_name))
    return data


@cache
def species_numbers() -> dict[str, int]:
    return {name: number for name, number in constants().items() if name.startswith("SPECIES_")}


@cache
def families() -> dict[int, int]:
    """Each species' family base species (its data's baby_species), by number."""
    numbers = species_numbers()
    found = {}
    for path in SPECIES.glob("*/data.json"):
        data = json.loads(path.read_text())
        number = numbers.get(f"SPECIES_{path.parent.name.upper()}")
        if number is not None:
            found[number] = numbers.get(data.get("baby_species", ""), number)
    return found


@cache
def area_numbers() -> dict[str, int]:
    return {name.removeprefix("ENCOUNTERS_").lower(): number for name, number in constants().items()
            if name.startswith("ENCOUNTERS_")}


@cache
def first_zones() -> dict[str, int]:
    """Each area's first zone by number, for the gate's bulletin board of the day's outbreak."""
    zones = constants()
    found: dict[str, int] = {}
    for path in sorted(ZONES.glob("*.json")):
        if path.name.endswith(".schema.json"):
            continue
        encounters = json.loads(path.read_text()).get("encounters")
        zone = zones.get(f"ZONE_{path.stem.upper()}")
        if isinstance(encounters, str) and encounters.startswith("ENCOUNTERS_") and zone is not None:
            area = encounters.removeprefix("ENCOUNTERS_").lower()
            found[area] = min(found.get(area, zone), zone)
    return found


class Data:
    """Every source, read and checked."""

    def __init__(self, source: Path = SOURCE):
        self.settings = load(source / "settings.json", "settings.schema.json")
        self.scaling = json.loads(LEVEL_SCALING.read_text())
        groups = load(source / "groups.json", "groups.schema.json")["groups"]
        self.groups = {f"group:{g['id']}": g["areas"] for g in groups}
        self.areas = {p.stem: load(p, "area.schema.json") for p in sorted((source / "areas").glob("*.json"))}
        self.species = {p.stem: load(p, "species.schema.json") for p in sorted((source / "species").glob("*.json"))}
        self.tiers = [t["id"] for t in self.settings["tiers"]]
        if len(self.tiers) > TIER_MAX:
            raise DataError(f"{label(source / 'settings.json')}: more than {TIER_MAX} tiers")
        for area in self.areas:
            if area not in area_numbers():
                raise DataError(f"{label(source / 'areas' / (area + '.json'))}: no ENCOUNTERS_{area.upper()} table")
        for group, areas in self.groups.items():
            for area in areas:
                if area not in self.areas:
                    raise DataError(f"{label(source / 'groups.json')}: {group} names {area!r}, which has no area file")

    def places(self, places: list[str], where: str) -> list[str]:
        found = []
        for place in places:
            areas = self.groups.get(place, [place]) if place.startswith("group:") else [place]
            if place.startswith("group:") and place not in self.groups:
                raise DataError(f"{where}: no group {place}")
            for area in areas:
                if area not in self.areas:
                    raise DataError(f"{where}: no area {area!r}")
                if area not in found:
                    found.append(area)
        return found

    def species_number(self, folder: str) -> int:
        number = species_numbers().get(f"SPECIES_{folder.upper()}")
        if number is None:
            raise DataError(f"{label(SOURCE / 'species' / (folder + '.json'))}: no SPECIES_{folder.upper()}")
        return number


def candidates(data: Data) -> dict[str, list[tuple[tuple, dict | None]]]:
    """Each area's candidates: the CANDIDATE fields but the rule, and the habitat's extra condition."""
    by_area: dict[str, list[tuple[tuple, dict | None]]] = {area: [] for area in data.areas}
    defaults = data.settings["battles"]
    weathers = conditions.weathers()
    for folder, entry in data.species.items():
        where = label(SOURCE / "species" / f"{folder}.json")
        number = data.species_number(folder)
        family = families().get(number, number)
        levels = entry["levels"]
        if levels["min"] > levels["max"]:
            raise DataError(f"{where}: levels: min is above max")
        hidden = entry.get("hidden_ability", data.settings["hidden_ability"])
        battles = entry.get("battles", defaults)
        styles = (battles["single"], battles["double"], battles["triple"], PARTNERS.index(battles["partners"]))
        for index, habitat in enumerate(entry["habitats"]):
            at = f"{where}: habitats[{index}]"
            if "by_season" in habitat:
                slots = [([season], slot) for season, slot in habitat["by_season"].items()]
            else:
                if any(key not in habitat for key in ("seasons", "methods", "rarity", "times")):
                    raise DataError(f"{at}: needs seasons, methods, rarity and times, or by_season")
                slots = [(habitat["seasons"], habitat)] if habitat["seasons"] else []
            for seasons, slot in slots:
                if slot["rarity"] not in data.tiers:
                    raise DataError(f"{at}: no tier {slot['rarity']!r}")
                weather = 0
                for name in slot.get("weather", []):
                    if name not in weathers:
                        raise DataError(f"{at}: no {name}")
                    weather |= 1 << weathers[name]
                fields = (number, family, weather, habitat.get("form", 0), data.tiers.index(slot["rarity"]),
                          bits(slot["methods"], METHODS, at), bits(seasons, SEASONS, at), bits(slot["times"], TIMES, at),
                          levels["min"], levels["max"], hidden, *styles)
                for area in data.places(habitat["places"], at):
                    by_area[area].append((fields, habitat.get("when")))
    return by_area


def area_block(data: Data, area: str, entries: list[tuple[tuple, dict | None]]) -> bytes:
    where = label(SOURCE / "areas" / f"{area}.json")
    source = data.areas[area]
    rates = []
    for season in SEASONS:
        season_rates = source["rates"].get("all_year", source["rates"].get(season, {}))
        rates += [season_rates.get(method, 0) for method in METHODS]
    compiler = conditions.Compiler()
    rules = []
    body = bytearray()
    for fields, when in entries:
        rule = NO_RULE
        if when:
            rule = len(rules)
            rules.append((compiler.compile(when, where), 0, 1, b"\0"))
        number, family, weather, *rest = fields
        body += CANDIDATE.pack(number, family, weather, rule, *rest)
    head_size = AREA.size + len(body)
    table = conditions.pack_table(rules, compiler.lists) if rules else b""
    offset = len(conditions.align(bytes(head_size))) if rules else 0
    block = conditions.align(AREA.pack(*rates, SPOTS.index(source["spots"]), len(entries), offset) + bytes(body)) + table
    if len(block) > BLOCK_MAX:
        raise DataError(f"{where}: its block is {len(block)} bytes, more than the runtime's {BLOCK_MAX}")
    for method in range(len(METHODS)):
        count = sum(1 for fields, _ in entries if fields[5] & (1 << method))
        if count > SLOT_MAX:
            raise DataError(f"{where}: {count} candidates for {METHODS[method]}, more than the runtime's {SLOT_MAX}")
    return block


def outbreaks(data: Data) -> tuple[list[bytes], int]:
    entries = []
    number = 0
    for folder, entry in data.species.items():
        where = label(SOURCE / "species" / f"{folder}.json")
        species = data.species_number(folder)
        for index, outbreak in enumerate(entry.get("outbreaks", [])):
            at = f"{where}: outbreaks[{index}]"
            for area in data.places(outbreak["places"], at):
                entries.append(OUTBREAK.pack(area_numbers()[area], first_zones().get(area, 0), species, number,
                                             outbreak.get("form", 0), bits(outbreak["methods"], METHODS, at),
                                             bits(outbreak["seasons"], SEASONS, at), bits(outbreak["times"], TIMES, at),
                                             entry["levels"]["min"], entry["levels"]["max"]))
            number += 1
    if len(entries) > OUTBREAK_MAX or number > 255:
        raise DataError(f"{len(entries)} outbreak entries, more than the runtime's {OUTBREAK_MAX}")
    return entries, number


def member(source: Path = SOURCE) -> bytes:
    data = Data(source)
    settings = data.settings
    by_area = candidates(data)
    count = max(area_numbers().values()) + 1
    blocks = {area_numbers()[area]: area_block(data, area, entries) for area, entries in by_area.items()}
    outbreak_entries, outbreak_count = outbreaks(data)
    rustling = settings["rustling"]
    special = rustling["grass"]["species"]
    special_file = data.species.get(special.removeprefix("SPECIES_").lower(), {"levels": {"min": 1, "max": 100}})
    shares = [round(t["share"] * 10) for t in settings["tiers"]] + [0] * (TIER_MAX - len(data.tiers))
    outbreak_offset = HEADER.size
    index_offset = outbreak_offset + len(conditions.align(b"".join(outbreak_entries)))
    body_offset = index_offset + INDEX.size * count
    index, body = [], bytearray()
    for area in range(count):
        block = blocks.get(area, b"")
        index.append(INDEX.pack(body_offset + len(body) if block else 0, len(block)))
        body += block
    header = HEADER.pack(MAGIC, VERSION, count, len(outbreak_entries), outbreak_count, len(data.tiers), *shares,
                         GATES.index(settings["level_gate"]), settings["hidden_ability"], settings["outbreak_share"],
                         bits(rustling["tiers"], data.tiers, "rustling tiers"), species_numbers()[special],
                         special_file["levels"]["min"], special_file["levels"]["max"],
                         rustling["grass"]["share"], rustling["dust"]["share"], rustling["shadow"]["share"],
                         bits(rustling["from"], METHODS, "rustling from"), outbreak_offset, index_offset)
    return header + conditions.align(b"".join(outbreak_entries)) + b"".join(index) + bytes(body)


def archive(source: Path, output: Path):
    files = read_narc(source.read_bytes())
    count = max(area_numbers().values()) + 1
    if len(files) != count:
        raise DataError(f"{source}: {len(files)} files, not the {count} encounter tables")
    files.append(member())
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(write_narc(files))


def check():
    data = Data()
    by_area = candidates(data)
    blocks = {area: area_block(data, area, entries) for area, entries in by_area.items()}
    largest = max(blocks, key=lambda a: len(blocks[a]))
    most = max(((sum(1 for f, _ in e if f[5] & (1 << m)), a, METHODS[m]) for a, e in by_area.items() for m in range(7)))
    entries, number = outbreaks(data)
    print(f"{len(data.species)} species, {len(data.areas)} areas, {sum(len(e) for e in by_area.values())} candidates, "
          f"{number} outbreaks ({len(entries)} entries); the member is {len(member())} bytes")
    print(f"largest block: {largest}, {len(blocks[largest])} of {BLOCK_MAX} bytes; most candidates: {most[1]} "
          f"{most[2]}, {most[0]} of {SLOT_MAX}")


def odds(area: str, method: str, season: str, period: str, weather: str, scaled: int, median: int) -> list[tuple]:
    """A place's odds as the runtime computes them from the packed member (BuildSlots in
    src/paperwhite2/main/paperwhite2_encounters.c), without extra conditions, outbreaks or the spot's kind (its
    area's): each slot's species number, form, share in percent and level range."""
    data = member()
    header = HEADER.unpack_from(data, 0)
    tier_count, shares = header[5], header[6:14]
    gate, rustling_tiers, special, special_min, special_max = header[14], header[17], header[18], header[19], header[20]
    spot_shares, rustling_from, index_offset = header[21:24], header[24], header[26]
    offset, size = INDEX.unpack_from(data, index_offset + INDEX.size * area_numbers()[area])
    area_fields = AREA.unpack_from(data, offset)
    spots, count = area_fields[28], area_fields[29]
    encounter_type, season_bit, period_bit = METHODS.index(method), SEASONS.index(season), TIMES.index(period)
    level = scaled if gate == GATES.index("scaled") else median
    spread = json.loads(LEVEL_SCALING.read_text())["spread"]
    low, high = max(1, scaled - spread), min(100, scaled + spread)
    slots = []
    for wanted in (False, True):
        for i in range(count):
            c = CANDIDATE.unpack_from(data, offset + AREA.size + CANDIDATE.size * i)
            number, _, weathers, _, form, tier, methods, seasons, times, minimum, maximum = c[:11]
            own = bool(methods & (1 << encounter_type))
            pooled = method == "rustling" and not own and bool(methods & rustling_from) and bool(rustling_tiers & (1 << tier))
            if not (own or pooled) or pooled != wanted or not seasons & (1 << season_bit) or not times & (1 << period_bit):
                continue
            if weathers and not weathers & (1 << conditions.weathers()[weather]):
                continue
            if level < minimum or tier >= tier_count:
                continue
            if method == "rustling" and spots == 0 and number == special:
                continue
            if pooled and any(s[0] == number and s[1] == form for s in slots):
                continue
            slots.append([number, form, tier, min(max(low, minimum), maximum), min(max(high, minimum), maximum)])
    counts = {t: sum(1 for s in slots if s[2] == t) for t in range(tier_count)}
    total_share = sum(shares[t] for t, n in counts.items() if n)
    weights = [shares[s[2]] * 1024 // counts[s[2]] if total_share else 0 for s in slots]
    result = [(s[0], s[1], s[3], s[4]) for s in slots]
    if method == "rustling" and spots == 0 and special:
        share = spot_shares[0] if slots else 100
        total = sum(weights)
        weights.append(1024 if share >= 100 or not total else total * share // (100 - share))
        result.append((special, 0, min(max(low, special_min), special_max), min(max(high, special_min), special_max)))
    total = sum(weights) or 1
    return [(*r, 100 * w / total) for r, w in zip(result, weights)]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("archive")
    command.add_argument("source", type=Path)
    command.add_argument("output", type=Path)
    commands.add_parser("member").add_argument("output", type=Path)
    commands.add_parser("check")
    command = commands.add_parser("odds")
    for name in ("area", "method", "season", "period", "weather"):
        command.add_argument(name)
    command.add_argument("scaled", type=int)
    command.add_argument("median", type=int, nargs="?", default=0)
    args = parser.parse_args()
    try:
        if args.command == "archive":
            archive(args.source, args.output)
        elif args.command == "member":
            args.output.write_bytes(member())
        elif args.command == "odds":
            names = {number: name for name, number in species_numbers().items()}
            for number, form, low, high, share in odds(args.area, args.method, args.season, args.period, args.weather,
                                                       args.scaled, args.median):
                print(f"{names.get(number, number):24} form {form}  Lv. {low}-{high}  {share:.2f}%")
        else:
            check()
    except DataError as error:
        sys.exit(f"encounters.py: {error}")


if __name__ == "__main__":
    main()
