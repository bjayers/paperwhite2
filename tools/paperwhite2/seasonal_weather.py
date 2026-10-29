#!/usr/bin/env python3
"""Paper White 2's weather by season: the rates that each calendar zone draws its weather of the day from.

    seasonal_weather.py dump CALENDAR_ARCHIVE OUTPUT_JSON   # the rates of the original's calendar (a/0/9/6)
    seasonal_weather.py header INPUT_JSON OUTPUT_INC        # the table's rows that the hack's build compiles

The original gives 24 zones a weather for each day of the year: the archive's second file lists the zones and where
each one's 366 days start in the first, one byte a day (src/ov012/calender.c). The hack instead draws each zone's
weather once a day, from the rates of the season the game has. `dump` counts how often each weather comes on the days
of each season's months, by the original's seasons (season.c: spring in January, May and September, and so on: 90
days in summer, with February the 29th, and 92 in the others), and writes them to
res/paperwhite2/seasonal_weather.json, which is the source to edit: zones by their ZONE_ names, the seasons, and for
each a weight per weather by its WEATHER_ name (include/system/zone_weather.h). A day without special weather is
WEATHER_SUNNY in the archive, so it counts as that. A weight is a count of days in the dump, but any whole number
works: a weather comes on weight / total of the days.

`header` writes the table's rows, `{ zone, season, weather, weight },` with the constants' names, to
build/include/generated/paperwhite2/seasonal_weather.inc, which src/paperwhite2/ov012/paperwhite2_weather.c includes
as its table's initializer. Only the hack's build runs it (configure.py --hack).
"""
import argparse
import json
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data.gen_constants import load as load_list  # noqa: E402
from tools.data.narc import read_narc  # noqa: E402

SEASONS = ["spring", "summer", "autumn", "winter"]
# The calendar's days of each month, February with its 29th, as Calendar_GetDayOfYear counts them
MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
DAYS_PER_YEAR = sum(MONTH_DAYS)
CALENDAR_ZONE_COUNT = 24
WEATHER_HEADER = ROOT / "include/system/zone_weather.h"


def weather_names() -> list[str]:
    """Returns the weathers' names in value order, from the enum of include/system/zone_weather.h."""
    text = WEATHER_HEADER.read_text()
    body = re.search(r"enum \{(.*?)\};", text, re.S)
    if body is None:
        sys.exit(f"{WEATHER_HEADER}: no weather enum")
    names = re.findall(r"\b(WEATHER_\w+),", body.group(1))
    if names[0] != "WEATHER_SUNNY" or names[-1] != "WEATHER_MAX":
        sys.exit(f"{WEATHER_HEADER}: the weather enum isn't WEATHER_SUNNY to WEATHER_MAX")
    return names[:-1]


def zone_names() -> dict[int, str]:
    names: dict[int, str] = {}
    for name, value in load_list("zones").items():
        names.setdefault(value, name)
    return names


def season_of_day(day: int) -> str:
    """The original's season of a day of the calendar's year: (month - 1) % 4."""
    for month, days in enumerate(MONTH_DAYS):
        if day < days:
            return SEASONS[month % len(SEASONS)]
        day -= days
    raise ValueError("past the calendar's year")


def dump(archive: Path, output: Path):
    days_file, zones_file = read_narc(archive.read_bytes())[:2]
    count = struct.unpack_from("<H", zones_file, 0)[0]
    if count != CALENDAR_ZONE_COUNT:
        sys.exit(f"{archive}: {count} zones, not the calendar's {CALENDAR_ZONE_COUNT}")
    zones = zone_names()
    weathers = weather_names()
    rates = {}
    for index in range(count):
        zone, offset = struct.unpack_from("<HH", zones_file, 2 + 4 * index)
        seasons = {season: {} for season in SEASONS}
        for day in range(DAYS_PER_YEAR):
            weather = weathers[days_file[offset + day]]
            counts = seasons[season_of_day(day)]
            counts[weather] = counts.get(weather, 0) + 1
        rates[zones[zone]] = {season: dict(sorted(counts.items(), key=lambda item: weathers.index(item[0])))
                              for season, counts in seasons.items()}
    lines = ["{", '  "zones": {']
    for number, (zone, seasons) in enumerate(rates.items()):
        lines.append(f'    "{zone}": {{')
        for season_number, (season, counts) in enumerate(seasons.items()):
            comma = "," if season_number < len(seasons) - 1 else ""
            lines.append(f'      "{season}": {json.dumps(counts)}{comma}')
        lines.append("    }" + ("," if number < len(rates) - 1 else ""))
    lines += ["  }", "}"]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines) + "\n")


def header(source: Path, output: Path):
    data = json.loads(source.read_text())
    zones = set(load_list("zones"))
    weathers = set(weather_names())
    rows = []
    for zone, seasons in data["zones"].items():
        if zone not in zones:
            sys.exit(f"{source}: {zone} isn't a zone of generated/zones.txt")
        for season, counts in seasons.items():
            if season not in SEASONS:
                sys.exit(f"{source}: {zone}: {season!r} isn't one of {', '.join(SEASONS)}")
            for weather, weight in counts.items():
                if weather not in weathers:
                    sys.exit(f"{source}: {zone}: {season}: {weather} isn't a weather of {WEATHER_HEADER.name}")
                if not isinstance(weight, int) or not 0 <= weight <= 0xffff:
                    sys.exit(f"{source}: {zone}: {season}: {weather}'s weight isn't a whole number up to 65535")
                if weight:
                    rows.append(f"{{ {zone}, SEASON_{season.upper()}, {weather}, {weight} }},")
    text = (f"// Generated from {source.as_posix()} by tools/paperwhite2/seasonal_weather.py: the rows of the weather "
            "rates' table\n" + "\n".join(rows) + "\n")
    if not output.exists() or output.read_text() != text:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("dump", help="count the original calendar's weathers by season")
    command.add_argument("archive", type=Path)
    command.add_argument("output", type=Path)
    command = commands.add_parser("header", help="write the table's rows for the hack's build")
    command.add_argument("source", type=Path)
    command.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.command == "dump":
        dump(args.archive, args.output)
    else:
        header(args.source, args.output)


if __name__ == "__main__":
    main()
