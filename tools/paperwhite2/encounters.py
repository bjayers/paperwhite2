#!/usr/bin/env python3
"""Paper White 2: the wild encounters (docs/paperwhite2/encounters.md), packed from res/paperwhite2/encounters/.

    encounters.py archive ARCHIVE_IN ARCHIVE_OUT    # the wild encounters' archive (a/1/2/7) with the data after it
    encounters.py member OUTPUT                     # the member alone
    encounters.py check                             # validate the data and print its sizes
    encounters.py odds AREA METHOD SEASON PERIOD WEATHER SCALED [PARTY]   # one place's odds from the packed member
    encounters.py habitats OUTPUT_DIR               # the Pokédex's Habitat List (res/pokedex/habitats/) from this data
    encounters.py area-index [SPECIES ...]          # the Pokédex Info page's Area index: its size, and species' rows

The odds and the Area index (area_index, which tools/paperwhite2/pokedex_evo.py packs into the Pokédex's graphics
archive) build each method's slots with the same functions (method_candidates, slot_shares), as the runtime does.

The sources, each checked against its schema beside it: settings.json, groups.json, areas/<area>.json (an area is an
original table, ENCOUNTERS_<AREA>) and species/<species>.json, with the scaled level's percent, cap and spread from
res/paperwhite2/level_scaling.json (the conditions engine's). The member follows the archive's tables, so the zone
headers' ENCOUNTERS_* numbers still name the areas, and src/paperwhite2/main/paperwhite2_encounters.c reads the
current area's block when the field loads its table. Its layout (include/paperwhite2/encounters.h):

- a 56-byte header (HEADER, then HEADER_SPECIES): the magic "PENC", the version, the area count, the outbreak entry
  count and the number of outbreaks, the tier count and each tier's share in tenths of a percent, the level gate, the
  hidden ability's chance, the outbreak share, the rustling spots' tiers (a bit each) and species with its levels, the
  three kinds of spots' fixed shares, the methods the spots draw from (a bit each), the offsets of the outbreaks and
  the index, and the species table's offset and count;
- the outbreaks (OUTBREAK), one entry for each area of each outbreak, with the outbreak's number;
- the index: each area's block offset and size (0 for an area without a file);
- each area's block: its rates (AREA: four seasons of seven methods), its kind of spots, its candidate count and the
  offset of its ConditionTable, then the candidates (CANDIDATE), then the table of their extra conditions;
- the species table: a byte for each species by its number, its wanderer settings (species/<species>.json's
  overworld block): where it's met (APPEARS), how it wanders (WANDERS, from bit 2) and NO_GRASS.

A candidate is one habitat in one area for one season or for all of its seasons: the species and its family's base
species, the weathers (a bit each, 0 for any), its rule in the area's table (0xffff for none), the form, the tier, the
methods, seasons and periods (a bit each, in the order of ENCTYPE_*, SEASON_* and DAY_PERIOD_*), its levels, its
hidden ability's chance and its battle styles (single, double, triple, then 0 for family partners or 1 for any).
"""
import argparse
import json
import re
import struct
import sys
from functools import cache
from typing import NamedTuple
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
VERSION = 2
HEADER = struct.Struct("<4sHHHBB8HBBBBHBB3BBII")
# The header's tail since version 2: the species table's offset and count
HEADER_SPECIES = struct.Struct("<IHxx")
# A species' wanderer settings (SPECIES_OVERWORLD's byte, include/paperwhite2/encounters.h): where it's met, how it
# wanders, and a bit for no grass
APPEARS = {"both": 0, "steps": 1, "overworld": 2}
WANDERS = {"random": 0, "aggressive": 1, "passive": 2}
WANDERS_SHIFT = 2
NO_GRASS = 0x10
# The runtime's species table's most entries
SPECIES_MAX = 1024
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
# The game's step settings that a walking or surfing rate names (field_encount.c's ENCOUNT_RATE_CONFIGS)
RATE_CONFIGS = 12

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
        # A walking or surfing rate picks one of the game's 12 step settings (ENCOUNT_RATE_CONFIGS), and a higher one
        # quietly gets the first; fishing's is a percent
        for method in METHODS[:5]:
            if season_rates.get(method, 0) > RATE_CONFIGS:
                raise DataError(f"{where}: {method}'s rate {season_rates[method]} is above the game's {RATE_CONFIGS} settings")
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
    outbreak_offset = HEADER.size + HEADER_SPECIES.size
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
    species = species_table(data)
    species_offset = body_offset + len(conditions.align(bytes(body)))
    header += HEADER_SPECIES.pack(species_offset, len(species))
    return (header + conditions.align(b"".join(outbreak_entries)) + b"".join(index) + conditions.align(bytes(body))
            + species)


def species_table(data: Data) -> bytes:
    """Each species' wanderer settings, a byte by its number: its overworld block's appears, wanders and grass."""
    table = bytearray(max(species_numbers().values()) + 1)
    if len(table) > SPECIES_MAX:
        raise DataError(f"{len(table)} species, past the runtime's {SPECIES_MAX}")
    for folder, species in data.species.items():
        overworld = species.get("overworld", {})
        table[data.species_number(folder)] = (APPEARS[overworld.get("appears", "both")]
                                              | WANDERS[overworld.get("wanders", "random")] << WANDERS_SHIFT
                                              | (0 if overworld.get("grass", True) else NO_GRASS))
    return bytes(table)


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


class Rules(NamedTuple):
    """The settings that a method's slots are built by, as the member's header has them: the tier count and shares
    (tenths of a percent), the tiers and methods that rustling spots draw from (a bit each), shaking grass's own
    species with its levels, and the three kinds of spots' shares."""
    tier_count: int
    shares: tuple
    rustling_tiers: int
    rustling_from: int
    special: int
    special_min: int
    special_max: int
    spot_shares: tuple


def rules_from_header(header: tuple) -> Rules:
    return Rules(header[5], header[6:14], header[17], header[24], header[18], header[19], header[20], header[21:24])


def rules_from_data(data: Data) -> Rules:
    """The same from the sources, as member() packs them."""
    rustling = data.settings["rustling"]
    special = rustling["grass"]["species"]
    special_file = data.species.get(special.removeprefix("SPECIES_").lower(), {"levels": {"min": 1, "max": 100}})
    shares = tuple(round(t["share"] * 10) for t in data.settings["tiers"]) + (0,) * (TIER_MAX - len(data.tiers))
    return Rules(len(data.tiers), shares, bits(rustling["tiers"], data.tiers, "rustling tiers"),
                 bits(rustling["from"], METHODS, "rustling from"), species_numbers()[special],
                 special_file["levels"]["min"], special_file["levels"]["max"],
                 (rustling["grass"]["share"], rustling["dust"]["share"], rustling["shadow"]["share"]))


def method_candidates(entries, method: int, season: int, period: int, weather: int, rules: Rules) -> list[tuple]:
    """The candidates of one method (an ENCTYPE_*) in one area at a season, a period (DAY_PERIOD_*) and a weather
    (WEATHER_*), as BuildSlots in src/paperwhite2/main/paperwhite2_encounters.c takes them, without extra conditions:
    its own, then for rustling those of the methods it draws from in its tiers. entries are (number, weathers, form,
    tier, methods, seasons, times, minimum, maximum); each result is (pooled, number, form, tier, minimum, maximum)."""
    found = []
    rustling = method == METHODS.index("rustling")
    for wanted in (False, True):
        for number, weathers, form, tier, methods, seasons, times, minimum, maximum in entries:
            own = bool(methods & (1 << method))
            pooled = (rustling and not own and bool(methods & rules.rustling_from)
                      and bool(rules.rustling_tiers & (1 << tier)))
            if not (own or pooled) or pooled != wanted or not seasons & (1 << season) or not times & (1 << period):
                continue
            if weathers and not weathers & (1 << weather):
                continue
            if tier < rules.tier_count:
                found.append((pooled, number, form, tier, minimum, maximum))
    return found


def slot_shares(found: list[tuple], method: int, spots: int, level: int, low: int, high: int,
                rules: Rules) -> list[tuple]:
    """A method's slots from its candidates (method_candidates) in an area with spots of the kind spots (SPOTS), as
    BuildSlots builds them for the gate's level and the scaled level's range low to high: each slot's species number,
    form, level range and share in percent. The tiers present split their shares among their slots, rescaled to the
    whole, and shaking grass's own species takes its spots' share on top."""
    # Where the gate would leave the method with none, the lowest minimum of its own candidates lets theirs in
    # (LevelForGate)
    own_minimums = [c[4] for c in found if not c[0]]
    if own_minimums and all(level < m for m in own_minimums):
        level = min(own_minimums)
    rustling = method == METHODS.index("rustling")
    slots = []
    for pooled, number, form, tier, minimum, maximum in found:
        if level < minimum:
            continue
        if rustling and spots == 0 and number == rules.special:
            continue
        if pooled and any(s[0] == number and s[1] == form for s in slots):
            continue
        slots.append([number, form, tier, min(max(low, minimum), maximum), min(max(high, minimum), maximum)])
    counts = {t: sum(1 for s in slots if s[2] == t) for t in range(rules.tier_count)}
    total_share = sum(rules.shares[t] for t, n in counts.items() if n)
    weights = [rules.shares[s[2]] * 1024 // counts[s[2]] if total_share else 0 for s in slots]
    result = [(s[0], s[1], s[3], s[4]) for s in slots]
    if rustling and spots == 0 and rules.special:
        share = rules.spot_shares[0] if slots else 100
        total = sum(weights)
        weights.append(1024 if share >= 100 or not total else total * share // (100 - share))
        result.append((rules.special, 0, min(max(low, rules.special_min), rules.special_max),
                       min(max(high, rules.special_min), rules.special_max)))
    total = sum(weights) or 1
    return [(*r, 100 * w / total) for r, w in zip(result, weights)]


def odds(area: str, method: str, season: str, period: str, weather: str, scaled: int, party: int) -> list[tuple]:
    """A place's odds as the runtime computes them from the packed member (BuildSlots in
    src/paperwhite2/main/paperwhite2_encounters.c), without extra conditions, outbreaks or the spot's kind (its
    area's): each slot's species number, form, share in percent and level range."""
    data = member()
    header = HEADER.unpack_from(data, 0)
    rules = rules_from_header(header)
    gate, index_offset = header[14], header[26]
    offset, size = INDEX.unpack_from(data, index_offset + INDEX.size * area_numbers()[area])
    area_fields = AREA.unpack_from(data, offset)
    spots, count = area_fields[28], area_fields[29]
    level = scaled if gate == GATES.index("scaled") else party
    # The spread is a share of the party's level (Conditions_WildSpread); without it, of the scaled level
    scaling = json.loads(LEVEL_SCALING.read_text())
    spread = ((party or scaled) * scaling["spread_percent"] + 50) // 100
    spread = min(scaling["spread_max"], max(scaling["spread_min"], spread))
    low, high = max(1, scaled - spread), min(100, scaled + spread)
    entries = []
    for i in range(count):
        number, _, weathers, _, form, tier, methods, seasons, times, minimum, maximum = \
            CANDIDATE.unpack_from(data, offset + AREA.size + CANDIDATE.size * i)[:11]
        entries.append((number, weathers, form, tier, methods, seasons, times, minimum, maximum))
    method_bit = METHODS.index(method)
    found = method_candidates(entries, method_bit, SEASONS.index(season), TIMES.index(period),
                              conditions.weathers()[weather], rules)
    return slot_shares(found, method_bit, spots, level, low, high, rules)


# The Pokédex Info page's Area sub-page's index (src/paperwhite2/ov298/paperwhite2_pokedex_info_area.c), a member of
# the Pokédex's graphics archive (tools/paperwhite2/pokedex_evo.py): each species' places on the town map with their
# seasons, and its rows with their levels, rarities, rates, seasons, times and weathers
AREA_INDEX_MAGIC = b"PARE"
AREA_INDEX_VERSION = 2
AREA_INDEX_HEADER = struct.Struct("<4sHHHxxII")
AREA_INDEX_PLACE = struct.Struct("<HhhBBBx")
AREA_INDEX_SPECIES = struct.Struct("<10B")
AREA_INDEX_ROW = struct.Struct("<4BHH6B")
# The page's rows (AREA_ROW_* in the C file), in this order, each from a normal method and its special version
# (AREA_SOURCES: each method's row, and whether it is the special version): walking, by grass or by an area's
# rustling spots (shaking grass, dust clouds or bridge shadows); dark grass, which has none; surfing, by plain or
# rippling water; fishing, by plain or rippling water
AREA_ROWS = ["walking", "dark_grass", "surf", "fishing"]
AREA_SOURCES = {"grass": (0, False), "dark_grass": (1, False), "rustling": (0, True), "surf": (2, False),
                "rippling_surf": (2, True), "fishing": (3, False), "rippling_fishing": (3, True)}
AREA_INDEX_ROWS = len(AREA_ROWS)
# A walking row's terrain (AREA_TERRAIN_* in the C file), its icon: that of all the areas it is met in by walking or
# by their rustling spots, "walking" when they differ. An area's terrain (area_terrain): a bridge where it has only
# bridge shadows to walk in, sand in AREA_SAND's areas, puddles in AREA_PUDDLES', cave floor in a cave (dust clouds)
# or in AREA_FLOORS' buildings, else grass. The lists name an area and its numbered ones (route_4 and route_4_2), as
# the encounter tiles of the maps of the areas' zones have them (checked 2026-11-09): Route 4 and the Desert Resort
# walk on deep sand; Icirrus City, the Moor of Icirrus and Route 8 on swamp puddles alone, without grass; the
# buildings on floors (Relic Castle's on floors and some sand, shown as floor)
AREA_TERRAINS = ["grass", "cave_floor", "sand", "puddle", "bridge", "walking"]
AREA_SAND = ["route_4", "desert_resort"]
AREA_PUDDLES = ["icirrus_city", "moor_of_icirrus", "route_8"]
AREA_FLOORS = ["castelia_sewers", "celestial_tower", "dragonspiral_tower_3", "dragonspiral_tower_4", "relic_castle",
               "strange_house"]
# The weather groups, as the Habitat Dex's filters have them (paperwhite2_habitat_dex.c's sWeatherFilterBits); each is
# computed in its first weather
AREA_WEATHERS = {"clear": ["WEATHER_SUNNY", "WEATHER_FLUTTER", "WEATHER_TINT_9", "WEATHER_TINT_10", "WEATHER_TINT_11",
                           "WEATHER_TINT_13", "WEATHER_TINT_14"],
                 "rain": ["WEATHER_RAIN", "WEATHER_GUSTY_RAIN"], "thunderstorm": ["WEATHER_THUNDERSTORM"],
                 "snow": ["WEATHER_FLAKE", "WEATHER_BLIZZARD", "WEATHER_DIAMOND_DUST"],
                 "sandstorm": ["WEATHER_SANDSTORM", "WEATHER_SANDSTORM_2"]}
# A row's tier for an outbreak's or shaking grass's own species, which have none
AREA_TIER_NONE = 0xFF
# A row's flags: met in outbreaks, under a rule, wandering the overworld, met by the row's special version too, and
# met only by it
AREA_FLAG_OUTBREAK, AREA_FLAG_RULE, AREA_FLAG_WANDERER, AREA_FLAG_SPECIAL, AREA_FLAG_SPECIAL_ONLY = 1, 2, 4, 8, 16
# The most bytes a species' block has, the page's buffer, and the most places it has, the page's OBJs
# (AREA_BLOCK_MAX and AREA_PLACE_MAX in the C file)
AREA_BLOCK_MAX = 512
AREA_PLACE_MAX = 40
# Shares this close (in percent) are the same, for the preferred times and weathers
AREA_SAME_SHARE = 0.05
TOWN_MAP = ROOT / "res" / "town_map"


def area_places() -> tuple[list[dict], dict[str, list[int]]]:
    """The town map's places in its table's order, and each encounter area's places: those of its zones' parents."""
    order = json.loads((TOWN_MAP / "order.json").read_text())
    places = [json.loads((TOWN_MAP / f"{zone.removeprefix('ZONE_').lower()}.json").read_text()) for zone in order]
    by_zone = {zone: i for i, zone in enumerate(order)}
    found: dict[str, list[int]] = {}
    for path in sorted(ZONES.glob("*.json")):
        if path.name.endswith(".schema.json"):
            continue
        zone = json.loads(path.read_text())
        encounters = zone.get("encounters")
        if not (isinstance(encounters, str) and encounters.startswith("ENCOUNTERS_")):
            continue
        place = by_zone.get(zone.get("parent"), by_zone.get(f"ZONE_{path.stem.upper()}"))
        area = encounters.removeprefix("ENCOUNTERS_").lower()
        if place is not None and place not in found.setdefault(area, []):
            found[area].append(place)
    return places, found


def area_in(area: str, names: list[str]) -> bool:
    """Whether an area is one of names or a numbered one of them (route_4_2 of route_4)."""
    return any(area == name or re.fullmatch(rf"{name}_\d+", area) for name in names)


def area_terrain(area: str, source: dict) -> str:
    """An area's walking terrain (AREA_TERRAINS; the lists above say how)."""
    walks = any(rates.get(method, 0) for rates in source["rates"].values() for method in ("grass", "dark_grass"))
    if source["spots"] == "shadow" and not walks:
        return "bridge"
    if area_in(area, AREA_SAND):
        return "sand"
    if area_in(area, AREA_PUDDLES):
        return "puddle"
    if source["spots"] == "dust" or area_in(area, AREA_FLOORS):
        return "cave_floor"
    return "grass"


def area_rows(data: Data) -> dict[int, dict]:
    """Each species' places (a season mask by place) and its sources (AREA_SOURCES' row and special flag): for each,
    every context it appears in (area, season, period, weather group, its share there in percent), its tiers, flags
    and the terrains of its areas. The level gate is ignored, as for a party high enough; outbreaks are contexts of
    their own methods, at the outbreak share."""
    rules = rules_from_data(data)
    weathers = conditions.weathers()
    groups = [weathers[names[0]] for names in AREA_WEATHERS.values()]
    _, places = area_places()
    found: dict[int, dict] = {}

    def note(number, area, method, season, period, group, share, tiers, flags):
        entry = found.setdefault(number, {"places": {}, "rows": {}})
        for place in places.get(area, []):
            entry["places"][place] = entry["places"].get(place, 0) | 1 << season
        row = entry["rows"].setdefault(AREA_SOURCES[method], {"contexts": [], "tiers": set(), "flags": 0,
                                                              "terrains": set()})
        row["contexts"].append((area, season, period, group, share))
        row["tiers"] |= tiers
        row["flags"] |= flags
        row["terrains"].add(area_terrain(area, data.areas[area]))

    for area, entries in candidates(data).items():
        source = data.areas[area]
        spots = SPOTS.index(source["spots"])
        plain = [(f[0], f[2], f[3], f[4], f[5], f[6], f[7], f[8], f[9]) for f, _ in entries]
        ruled = {f[0] for f, when in entries if when}
        # Without a weather in its candidates, an area's slots are the same in every weather
        weathered = any(e[1] for e in plain)
        for method in range(len(METHODS)):
            for season, name in enumerate(SEASONS):
                if not source["rates"].get("all_year", source["rates"].get(name, {})).get(METHODS[method], 0):
                    continue
                for period in range(len(TIMES)):
                    by_group = []
                    for weather in groups if weathered else groups[:1]:
                        taken = method_candidates(plain, method, season, period, weather, rules)
                        shares, tiers = {}, {}
                        for number, _, _, _, share in slot_shares(taken, method, spots, 100, 1, 100, rules):
                            shares[number] = shares.get(number, 0) + share
                        for _, number, _, tier, _, _ in taken:
                            tiers.setdefault(number, set()).add(tier)
                        by_group.append((shares, tiers))
                    for group in range(len(groups)):
                        shares, tiers = by_group[group if weathered else 0]
                        for number, share in shares.items():
                            if share > 0:
                                note(number, area, METHODS[method], season, period, group, share,
                                     tiers.get(number, {AREA_TIER_NONE}), AREA_FLAG_RULE if number in ruled else 0)
    share = data.settings["outbreak_share"]
    for folder, entry in data.species.items():
        where = label(SOURCE / "species" / f"{folder}.json")
        number = data.species_number(folder)
        for index, outbreak in enumerate(entry.get("outbreaks", [])):
            at = f"{where}: outbreaks[{index}]"
            for area in data.places(outbreak["places"], at):
                for method in outbreak["methods"]:
                    for season in outbreak["seasons"]:
                        for period in outbreak["times"]:
                            for group in range(len(groups)):
                                note(number, area, method, SEASONS.index(season), TIMES.index(period), group, share,
                                     {AREA_TIER_NONE}, AREA_FLAG_OUTBREAK)
        if "overworld" in entry and number in found:
            for row in found[number]["rows"].values():
                row["flags"] |= AREA_FLAG_WANDERER
    return found


def preferred(best: list[float], available: int) -> int:
    """The bits of the available contexts whose best share is the highest."""
    top = max(best)
    return sum(1 << i for i, value in enumerate(best) if available >> i & 1 and value > top - AREA_SAME_SHARE)


def area_shown_rows(entry: dict) -> list[dict]:
    """A species' rows as the page shows them, in AREA_ROWS' order: each its row, its terrain (AREA_TERRAINS, for
    walking), its flags (AREA_FLAG_SPECIAL where the special version applies, AREA_FLAG_SPECIAL_ONLY where only it
    does), and the contexts and tiers of the normal method, or of the special version's where only it applies."""
    shown = []
    for row in range(len(AREA_ROWS)):
        normal, special = entry["rows"].get((row, False)), entry["rows"].get((row, True))
        if normal is None and special is None:
            continue
        flags = (normal or special)["flags"]
        if special is not None:
            flags |= AREA_FLAG_SPECIAL | (AREA_FLAG_SPECIAL_ONLY if normal is None else 0)
        terrains = set().union(*(r["terrains"] for r in (normal, special) if r is not None))
        terrain = terrains.pop() if len(terrains) == 1 else "walking"
        source = normal or special
        shown.append({"row": row, "terrain": terrain if AREA_ROWS[row] == "walking" else "grass", "flags": flags,
                      "contexts": source["contexts"], "tiers": source["tiers"],
                      "all": [c for r in (normal, special) if r is not None for c in r["contexts"]]})
    return shown


def area_species_block(entry: dict, levels: dict) -> bytes:
    """A species' block of the index (area_index)."""
    rows = area_shown_rows(entry)
    packed = []
    best_times = [0.0] * len(TIMES)
    best_weathers = [0.0] * len(AREA_WEATHERS)
    seasons_all = times_all = weathers_all = flags_all = 0
    for row in rows:
        contexts = row["contexts"]
        seasons = sum({1 << c[1] for c in contexts})
        times = sum({1 << c[2] for c in contexts})
        weathers = sum({1 << c[3] for c in contexts})
        row_times = [max([c[4] for c in contexts if c[2] == t], default=0) for t in range(len(TIMES))]
        row_weathers = [max([c[4] for c in contexts if c[3] == g], default=0) for g in range(len(AREA_WEATHERS))]
        # The species' conditions are those of every context, the special versions' too
        every = row["all"]
        best_times = [a + max([c[4] for c in every if c[2] == t], default=0) for t, a in enumerate(best_times)]
        best_weathers = [a + max([c[4] for c in every if c[3] == g], default=0) for g, a in enumerate(best_weathers)]
        tiers = sorted(row["tiers"])
        rates = [c[4] for c in contexts]
        packed.append(AREA_INDEX_ROW.pack(row["row"], tiers[0], tiers[-1], seasons, max(1, round(min(rates) * 10)),
                                          max(1, round(max(rates) * 10)), times, preferred(row_times, times),
                                          weathers, preferred(row_weathers, weathers), row["flags"],
                                          AREA_TERRAINS.index(row["terrain"])))
        seasons_all |= sum({1 << c[1] for c in every})
        times_all |= sum({1 << c[2] for c in every})
        weathers_all |= sum({1 << c[3] for c in every})
        flags_all |= row["flags"]
    places = sorted(entry["places"].items())
    head = AREA_INDEX_SPECIES.pack(len(places), len(packed), levels["min"], levels["max"], seasons_all, times_all,
                                   preferred(best_times, times_all), weathers_all,
                                   preferred(best_weathers, weathers_all), flags_all)
    return head + b"".join(struct.pack("<BB", place, mask) for place, mask in places) + b"".join(packed)


def area_index(data: Data | None = None) -> bytes:
    """The Area sub-page's index: a header (AREA_INDEX_HEADER: the magic, the version, the species and place counts,
    the offsets of the species' offsets and of the places), each species' block offset by its number with the end's
    after them, the town map's places in its table's order (AREA_INDEX_PLACE: the zone, the area's position and
    animation on the Pokédex's map, and the place's position, for the player's marker), then each species' block:
    AREA_INDEX_SPECIES (its place and row counts, its levels, the seasons, times and weather groups of all its rows with
    the preferred ones, and their flags), its places (the place and a season mask each) and its rows (AREA_INDEX_ROW:
    the method, its tiers, seasons, rates in tenths of a percent, times and weather groups with the preferred ones,
    and flags). A species never met in the wild has an empty block."""
    data = data or Data()
    places, _ = area_places()
    rows = area_rows(data)
    names = constants()
    count = names["SPECIES_GENESECT"] + 1
    levels = {data.species_number(folder): entry["levels"] for folder, entry in data.species.items()}
    rules = rules_from_data(data)
    levels.setdefault(rules.special, {"min": rules.special_min, "max": rules.special_max})
    place_table = b"".join(AREA_INDEX_PLACE.pack(names[p["zone"]], p["area"]["x"], p["area"]["y"],
                                                 p["area"]["animation"], p["position"]["x"], p["position"]["y"])
                           for p in places)
    offsets_offset = AREA_INDEX_HEADER.size
    places_offset = offsets_offset + 4 * (count + 1)
    body_offset = places_offset + len(place_table)
    offsets, body = [], bytearray()
    for number in range(count):
        offsets.append(body_offset + len(body))
        if number in rows:
            block = area_species_block(rows[number], levels.get(number, {"min": 1, "max": 100}))
            if len(block) > AREA_BLOCK_MAX:
                raise DataError(f"species {number}'s Area block is {len(block)} bytes, more than the page's "
                                f"{AREA_BLOCK_MAX}")
            if len(rows[number]["places"]) > AREA_PLACE_MAX:
                raise DataError(f"species {number} is at {len(rows[number]['places'])} of the map's places, more "
                                f"than the page's {AREA_PLACE_MAX}")
            body += block
    offsets.append(body_offset + len(body))
    header = AREA_INDEX_HEADER.pack(AREA_INDEX_MAGIC, AREA_INDEX_VERSION, count, len(places), offsets_offset,
                                    places_offset)
    return header + struct.pack(f"<{count + 1}I", *offsets) + place_table + bytes(body)


def area_index_check(names: list[str]):
    """Prints the index's size, each area's terrain, and the blocks of the species named (SPECIES_* or folder
    names)."""
    data = Data()
    index = area_index(data)
    numbers = species_numbers()
    count = AREA_INDEX_HEADER.unpack_from(index, 0)[2]
    offsets = struct.unpack_from(f"<{count + 1}I", index, AREA_INDEX_HEADER.size)
    print(f"area index: {len(index)} bytes, {sum(1 for i in range(count) if offsets[i + 1] > offsets[i])} species, "
          f"largest block {max(offsets[i + 1] - offsets[i] for i in range(count))} bytes")
    terrains: dict[str, list[str]] = {}
    for area, source in data.areas.items():
        terrains.setdefault(area_terrain(area, source), []).append(area)
    for terrain in AREA_TERRAINS:
        if terrain in terrains and terrain != "grass":
            print(f"{terrain}: {', '.join(sorted(terrains[terrain]))}")
    for name in names:
        number = numbers.get(name if name.startswith("SPECIES_") else f"SPECIES_{name.upper()}")
        if number is None:
            print(f"{name}: no such species")
            continue
        start, end = offsets[number], offsets[number + 1]
        if start == end:
            print(f"{name}: not in the wild")
            continue
        head = AREA_INDEX_SPECIES.unpack_from(index, start)
        print(f"{name}: Lv. {head[2]}-{head[3]}, seasons {head[4]:04b}, times {head[5]:05b} (preferred {head[6]:05b}), "
              f"weathers {head[7]:05b} (preferred {head[8]:05b}), flags {head[9]}")
        cursor = start + AREA_INDEX_SPECIES.size
        found = [struct.unpack_from("<BB", index, cursor + 2 * i) for i in range(head[0])]
        print("  places:", ", ".join(f"{place}:{mask:04b}" for place, mask in found))
        cursor += 2 * head[0]
        for i in range(head[1]):
            r = AREA_INDEX_ROW.unpack_from(index, cursor + AREA_INDEX_ROW.size * i)
            tiers = "-".join(dict.fromkeys(data.tiers[t] if t < len(data.tiers) else "none" for t in (r[1], r[2])))
            special = ("only special" if r[10] & AREA_FLAG_SPECIAL_ONLY else
                       "special" if r[10] & AREA_FLAG_SPECIAL else "")
            shown = AREA_TERRAINS[r[11]] if AREA_ROWS[r[0]] == "walking" else AREA_ROWS[r[0]]
            print(f"  {shown:12} {special:12} {tiers:18} {r[4] / 10:.1f}-{r[5] / 10:.1f}%  seasons {r[3]:04b}  "
                  f"times {r[6]:05b}/{r[7]:05b}  weathers {r[8]:05b}/{r[9]:05b}  flags {r[10]}")


HABITATS = ROOT / "res" / "pokedex" / "habitats"
# The Habitat List's kinds of habitat and the methods of each; a list holds at most 30 species
HABITAT_KINDS = {"land": ["grass", "dark_grass", "rustling"], "water": ["surf", "rippling_surf"],
                 "fishing": ["fishing", "rippling_fishing"]}
HABITAT_SPECIES_MAX = 30


def habitats(output: Path):
    """Writes the Pokédex's Habitat List from the encounter data, for the hack's build to pack (habitat_data.py) in
    place of res/pokedex/habitats/, which stays the template: each area's other fields, its file's name (a zone), and
    the order of the species still there, with the others after them by number. An area's encounter areas are its
    zone's and those of the zones whose parent it is. A species is in a kind of habitat in the seasons of its habitats
    and outbreaks there by that kind's methods; shaking grass's own species is on land where the area has rustling
    spots in shaking grass. The list has seasons only, not times, weather or levels."""
    data = Data()
    zones = {p.stem: json.loads(p.read_text()) for p in ZONES.glob("*.json") if not p.name.endswith(".schema.json")}
    numbers = species_numbers()
    special = data.settings["rustling"]["grass"]["species"]
    output.mkdir(parents=True, exist_ok=True)
    (output / "habitat.schema.json").write_text((HABITATS / "habitat.schema.json").read_text())
    cut = []
    for path in sorted(HABITATS.glob("*.json")):
        if path.name.endswith(".schema.json"):
            continue
        template = json.loads(path.read_text())
        zone = f"ZONE_{path.stem.upper()}"
        areas = {z["encounters"].removeprefix("ENCOUNTERS_").lower() for name, z in zones.items()
                 if isinstance(z.get("encounters"), str) and z["encounters"].startswith("ENCOUNTERS_")
                 and (f"ZONE_{name.upper()}" == zone or z.get("parent") == zone)} & set(data.areas)
        found: dict[str, dict[str, set]] = {}

        def add(species: str, kind: str, seasons):
            found.setdefault(species, {k: set() for k in HABITAT_KINDS})[kind].update(seasons)

        for folder, entry in data.species.items():
            species = f"SPECIES_{folder.upper()}"
            where = label(SOURCE / "species" / f"{folder}.json")
            for habitat in entry["habitats"]:
                named = set(data.places(habitat["places"], where)) & areas
                if not named:
                    continue
                slots = habitat["by_season"].items() if "by_season" in habitat else \
                    [(season, habitat) for season in habitat.get("seasons", [])]
                for season, slot in slots:
                    for kind, methods in HABITAT_KINDS.items():
                        if set(slot["methods"]) & set(methods):
                            add(species, kind, [season])
            for outbreak in entry.get("outbreaks", []):
                if set(data.places(outbreak["places"], where)) & areas:
                    for kind, methods in HABITAT_KINDS.items():
                        if set(outbreak["methods"]) & set(methods):
                            add(species, kind, outbreak["seasons"])
        for area in areas:
            if data.areas[area]["spots"] != "grass":
                continue
            rates = data.areas[area]["rates"]
            add(special, "land", [s for s in SEASONS if rates.get("all_year", rates.get(s, {})).get("rustling", 0)])
        found = {species: kinds for species, kinds in found.items() if any(kinds.values())}
        order = [s["species"] for s in template["species"]]
        ranked = sorted(found, key=lambda s: (order.index(s), 0) if s in order else (len(order), numbers.get(s, 0)))
        if len(ranked) > HABITAT_SPECIES_MAX:
            cut.append(f"{path.stem} ({len(ranked)})")
            ranked = ranked[:HABITAT_SPECIES_MAX]
        species_list = [{"species": s, **{kind: [season for season in SEASONS if season in found[s][kind]]
                                          for kind in HABITAT_KINDS}} for s in ranked]
        result = {**template, "species": species_list,
                  "habitats": {kind: any(s[kind] for s in species_list) for kind in HABITAT_KINDS}}
        (output / path.name).write_text(json.dumps(result, ensure_ascii=False, indent=4) + "\n")
    if cut:
        print(f"encounters.py habitats: more species than the list's {HABITAT_SPECIES_MAX} in {', '.join(cut)}; "
              f"the rest are in the Habitat Dex's lists only", file=sys.stderr)
    (output / HABITAT_DEX_FILE).write_bytes(habitat_dex(data, zones))


# The Habitat Dex's lists (include/paperwhite2/habitat_dex.h): a header, each Habitat List area's offset in the order
# of its archive (habitat_data.AREAS), then the areas' entries, each a species by one method
HABITAT_DEX_FILE = "paperwhite2_habitat_dex.bin"
HABITAT_DEX_MAGIC = 0x58444850  # "PHDX"
HABITAT_DEX_VERSION = 1
HABITAT_DEX_ENTRY = struct.Struct("<HBBBBBBI")
HABITAT_DEX_OUTBREAK, HABITAT_DEX_RULE, HABITAT_DEX_SPOTS = 1, 2, 4
# An outbreak's entries sort after the tiers'
HABITAT_DEX_OUTBREAK_TIER = 0xFF


def habitat_dex(data: Data, zones: dict) -> bytes:
    """Every Pokémon an area of the Habitat List can have, one entry for each method of each of its habitats there,
    with the habitat's seasons, times and weathers, so the Pokédex can filter them: its candidates, its outbreaks and
    shaking grass's own species. Sorted by method, then rarity, then number. A habitat with extra conditions (\"when\")
    is marked, as the Pokédex can't tell when they hold."""
    from tools.data.habitat_data import AREAS
    by_area = candidates(data)
    special = data.settings["rustling"]["grass"]["species"]
    blocks = []
    for name in AREAS:
        zone = f"ZONE_{name.upper()}"
        areas = {z["encounters"].removeprefix("ENCOUNTERS_").lower() for zname, z in zones.items()
                 if isinstance(z.get("encounters"), str) and z["encounters"].startswith("ENCOUNTERS_")
                 and (f"ZONE_{zname.upper()}" == zone or z.get("parent") == zone)} & set(data.areas)
        entries = set()
        for area in sorted(areas):
            for fields, when in by_area[area]:
                number, _, weather, form, tier, methods, seasons, times = fields[:8]
                for method in range(len(METHODS)):
                    if methods >> method & 1:
                        entries.add((method, tier, number, form, seasons, times,
                                     HABITAT_DEX_RULE if when else 0, weather))
            if data.areas[area]["spots"] == "grass":
                rates = data.areas[area]["rates"]
                seasons = [s for s in SEASONS if rates.get("all_year", rates.get(s, {})).get("rustling", 0)]
                if seasons:
                    entries.add((METHODS.index("rustling"), 0, species_numbers()[special], 0,
                                 bits(seasons, SEASONS, area), (1 << len(TIMES)) - 1, HABITAT_DEX_SPOTS, 0))
        for folder, entry in data.species.items():
            where = label(SOURCE / "species" / f"{folder}.json")
            for index, outbreak in enumerate(entry.get("outbreaks", [])):
                at = f"{where}: outbreaks[{index}]"
                if set(data.places(outbreak["places"], at)) & areas:
                    methods = bits(outbreak["methods"], METHODS, at)
                    for method in range(len(METHODS)):
                        if methods >> method & 1:
                            entries.add((method, HABITAT_DEX_OUTBREAK_TIER, data.species_number(folder),
                                         outbreak.get("form", 0), bits(outbreak["seasons"], SEASONS, at),
                                         bits(outbreak["times"], TIMES, at), HABITAT_DEX_OUTBREAK, 0))
        blocks.append(b"".join(HABITAT_DEX_ENTRY.pack(number, form, method, seasons, times, tier, flags, weather)
                               for method, tier, number, form, seasons, times, flags, weather in sorted(entries)))
    header = struct.pack("<IHH", HABITAT_DEX_MAGIC, HABITAT_DEX_VERSION, len(blocks))
    offset = len(header) + 4 * (len(blocks) + 1)
    offsets = []
    for block in blocks:
        offsets.append(offset)
        offset += len(block)
    offsets.append(offset)
    return header + struct.pack(f"<{len(offsets)}I", *offsets) + b"".join(blocks)


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
    command.add_argument("party", type=int, nargs="?", default=0)
    commands.add_parser("habitats").add_argument("output", type=Path)
    commands.add_parser("area-index").add_argument("species", nargs="*")
    args = parser.parse_args()
    try:
        if args.command == "area-index":
            area_index_check(args.species)
        elif args.command == "archive":
            archive(args.source, args.output)
        elif args.command == "member":
            args.output.write_bytes(member())
        elif args.command == "habitats":
            habitats(args.output)
        elif args.command == "odds":
            names = {number: name for name, number in species_numbers().items()}
            for number, form, low, high, share in odds(args.area, args.method, args.season, args.period, args.weather,
                                                       args.scaled, args.party):
                print(f"{names.get(number, number):24} form {form}  Lv. {low}-{high}  {share:.2f}%")
        else:
            check()
    except DataError as error:
        sys.exit(f"encounters.py: {error}")


if __name__ == "__main__":
    main()
