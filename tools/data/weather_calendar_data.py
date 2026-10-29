#!/usr/bin/env python3
"""The weather calendar in res/field/weather_calendar/, one JSON file per zone: dump writes them from the ROM once, and
pack builds the archive (a/0/9/6, which overlay 12's calender.c opens as archive 96) from them, which the build does.

    weather_calendar_data.py dump extract/w2_us/files res/field/weather_calendar
    weather_calendar_data.py pack res/field/weather_calendar ARCHIVE

The archive has two files (src/ov012/calender.c). File 1 is a u16 count of zones, 24, then for each zone its ID and
the offset in file 0 where its year starts, two u16s (CalendarZone); Calendar_Preload reads 24 of them from byte 2,
CALENDAR_ZONE_MAX, whatever the count says. File 0 is each zone's year, a weather byte (the WEATHER_ enum of
include/system/zone_weather.h) for each of the 366 days that Calendar_GetDayOfYear counts, February with its 29th, the
zones one after another in the table's order, so a zone's offset is 366 times its place. A zone missing from the table
has its zone header's weather on every day.

Each zone's source is named after its ZONE_ constant, lowercased without the prefix (virbank_city.json for
ZONE_VIRBANK_CITY), and gives the days with weather of each month, by "day" or "first-last", every other day being
WEATHER_SUNNY. order.json lists the zones in the table's order; a zone file it doesn't list comes after them, by zone
ID. weather_calendar.schema.json describes the files. The table can't hold more than 24 zones without a change to
calender.c; with fewer, the rest of its 24 entries name no zone.
"""
import argparse
import json
import re
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.datajson import DataError, label, load, load_schema, write  # noqa: E402
from tools.data.gen_constants import load as load_list  # noqa: E402
from tools.data.narc import read_narc, write_narc  # noqa: E402

ARCHIVE = "a/0/9/6"
WEATHER_HEADER = Path(__file__).resolve().parents[2] / "include/system/zone_weather.h"
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
          "november", "december"]
# The calendar's days of each month, as Calendar_GetDayOfYear counts them
MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
DAYS_PER_YEAR = sum(MONTH_DAYS)
# CALENDAR_ZONE_MAX, the entries Calendar_Preload reads, and the value of an entry that names no zone
ZONE_MAX = 24
NO_ZONE = 0xFFFF
ENTRY = struct.Struct("<HH")
DAYS = re.compile(r"(\d+)(?:-(\d+))?")


def weather_names() -> list[str]:
    """Returns the weathers' names in value order, from the enum of include/system/zone_weather.h."""
    text = WEATHER_HEADER.read_text()
    body = re.search(r"enum \{(.*?)\};", text, re.S)
    names = re.findall(r"\b(WEATHER_\w+),", body.group(1)) if body else []
    if not names or names[0] != "WEATHER_SUNNY" or names[-1] != "WEATHER_MAX":
        raise DataError(f"{label(WEATHER_HEADER)}: no weather enum from WEATHER_SUNNY to WEATHER_MAX")
    return names[:-1]


def zone_ids() -> dict[str, int]:
    return load_list("zones")


def file_stem(zone: str) -> str:
    return zone.removeprefix("ZONE_").lower()


# Dumping


def month_json(days: bytes, weathers: list[str]) -> dict:
    """The days with weather of a month, consecutive days of one weather as a range."""
    month = {}
    day = 0
    while day < len(days):
        weather = days[day]
        last = day
        while last + 1 < len(days) and days[last + 1] == weather:
            last += 1
        if weather:
            key = str(day + 1) if last == day else f"{day + 1}-{last + 1}"
            month[key] = weathers[weather] if weather < len(weathers) else weather
        day = last + 1
    return month


def dump(files: Path, output: Path):
    members = read_narc((files / ARCHIVE).read_bytes())
    if len(members) != 2:
        sys.exit(f"{len(members)} files in {ARCHIVE}, not 2")
    days_file, zones_file = members
    count = struct.unpack_from("<H", zones_file, 0)[0]
    if count != ZONE_MAX or len(zones_file) != 2 + ENTRY.size * count or len(days_file) != DAYS_PER_YEAR * count:
        sys.exit(f"{ARCHIVE}'s files are not the original's layout: {count} zones, {len(zones_file)} and "
                 f"{len(days_file)} bytes")
    names = {}
    for zone, value in zone_ids().items():
        names.setdefault(value, zone)
    weathers = weather_names()
    order = []
    for index in range(count):
        zone_id, offset = ENTRY.unpack_from(zones_file, 2 + ENTRY.size * index)
        if offset != DAYS_PER_YEAR * index:
            sys.exit(f"zone {index}'s year is at {offset}, not {DAYS_PER_YEAR * index}")
        zone = names[zone_id]
        year = days_file[offset:offset + DAYS_PER_YEAR]
        months, start = {}, 0
        for month, days in zip(MONTHS, MONTH_DAYS):
            months[month] = month_json(year[start:start + days], weathers)
            start += days
        write(output / f"{file_stem(zone)}.json", {"$schema": "weather_calendar.schema.json", "months": months})
        order.append(zone)
    write(output / "order.json", {"zones": order})
    print(f"wrote {count} zones to {output}")


# Packing


def year_bytes(source: dict, where: str, weathers: list[str]) -> bytes:
    year = bytearray()
    for month, days in zip(MONTHS, MONTH_DAYS):
        month_days = bytearray(days)
        seen = [False] * days
        for key, weather in source["months"].get(month, {}).items():
            at = f"{where}: {month}: {key}"
            match = DAYS.fullmatch(key)
            if not match:
                raise DataError(f"{at}: not a day or a range of days, such as \"4\" or \"4-5\"")
            first = int(match[1])
            last = int(match[2] or first)
            if not 1 <= first <= last <= days:
                raise DataError(f"{at}: not days from 1 to {days}, the first before the last")
            if weather not in weathers:
                raise DataError(f"{at}: {weather!r} is not a weather of {label(WEATHER_HEADER)}")
            for day in range(first - 1, last):
                if seen[day]:
                    raise DataError(f"{at}: day {day + 1} has a weather already")
                seen[day] = True
                month_days[day] = weathers.index(weather)
        year += month_days
    return bytes(year)


def pack(root: Path, output: Path):
    schema = load_schema(root / "weather_calendar.schema.json")
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
        if path.name in ("order.json", "weather_calendar.schema.json") or path.stem in listed:
            continue
        if path.stem not in stems:
            raise DataError(f"{label(path)}: no ZONE_{path.stem.upper()} in generated/zones.txt")
        others.append(stems[path.stem])
    zones = order + sorted(others, key=lambda zone: ids[zone])
    if len(zones) > ZONE_MAX:
        raise DataError(f"{len(zones)} zones in {label(root)}, but calender.c's table holds {ZONE_MAX}")
    weathers = weather_names()
    days_file = bytearray()
    zones_file = bytearray(struct.pack("<H", len(zones)))
    for zone in zones:
        path = root / f"{file_stem(zone)}.json"
        zones_file += ENTRY.pack(ids[zone], len(days_file))
        days_file += year_bytes(load(path, schema), label(path), weathers)
    zones_file += ENTRY.pack(NO_ZONE, NO_ZONE) * (ZONE_MAX - len(zones))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(write_narc([bytes(days_file), bytes(zones_file)]))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    dump_parser = commands.add_parser("dump", help="write res/field/weather_calendar/ from the extracted files")
    dump_parser.add_argument("files", type=Path, help="the extracted files/ directory")
    dump_parser.add_argument("output", type=Path)
    pack_parser = commands.add_parser("pack", help="build the weather calendar's archive from its sources")
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
