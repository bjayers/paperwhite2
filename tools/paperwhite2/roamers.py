#!/usr/bin/env python3
"""Paper White 2's roaming legendaries: the generated header of res/paperwhite2/roamers/.

    roamers.py [DIRECTORY] OUTPUT_HEADER     # writes paperwhite2/roamers_config.h
    roamers.py --check [DIRECTORY]           # only checks the files

DIRECTORY is res/paperwhite2/roamers/: roamers.json (the roamers and how they move) and routes.json (the route graph),
each with its schema beside it (docs/paperwhite2/design/roaming-legendaries.md). The routes are town map places
(res/town_map/, places of type 1 whose zone is a route's), each with its outdoor zones: the zones whose header names
that place and whose map type is 0 (res/field/zones/). Their links are routes.json's, taken both ways. A roamer roams
the routes it lists (all when it lists none) on which one of its methods has a step rate in some season in the wild
encounters' data (res/paperwhite2/encounters/areas/, by the zone's encounters constant): Route 17 and 21 are water
only, so only a roamer that surfs is met there.

The header has only #defines, since the scripts include it as well as the C: the ROAMER_* and ROAMER_GROUP_* IDs, the
counts and the movement's settings, and two initializers, ROAMERS_DATA (paperwhite2/roamers.h's RoamerData, one per
roamer) and ROAMERS_ROUTES (RoamerRoute, one per route), for src/paperwhite2/ov012/paperwhite2_roamers.c. Only the
hack's build runs this (configure.py --hack).
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.data import datajson  # noqa: E402

SOURCE = ROOT / "res" / "paperwhite2" / "roamers"
ZONES = ROOT / "res" / "field" / "zones"
TOWN_MAP = ROOT / "res" / "town_map"
AREAS = ROOT / "res" / "paperwhite2" / "encounters" / "areas"
GUARD = "POKEBW2_PAPERWHITE2_ROAMERS_CONFIG_H"
# The save's slots (paperwhite2/roamers.h's ROAMERS_SAVE_SLOTS), and a route's zones in RoamerRoute
SAVE_SLOTS = 8
ROUTE_ZONES = 2
ZONE_NONE = 0xFFFF
# paperwhite2/roamers.h's ROAMER_METHOD_* bits, and the encounter rates of each method
METHODS = {"walk": 1, "surf": 2, "fish": 4}
METHOD_RATES = {"walk": ("grass", "dark_grass"), "surf": ("surf",), "fish": ("fishing",)}
# The field weathers of the file's names (include/system/zone_weather.h)
WEATHERS = {"none": "WEATHER_NONE", "rain": "WEATHER_RAIN", "gusty_rain": "WEATHER_GUSTY_RAIN",
            "thunderstorm": "WEATHER_THUNDERSTORM", "snow": "WEATHER_FLAKE", "hail": "WEATHER_BLIZZARD",
            "harsh_sun": "WEATHER_HARSH_SUN", "dry_thunderstorm": "WEATHER_DRY_THUNDERSTORM"}
TOWN_MAP_ROUTE_TYPE = 1


def route_places(town_map: Path = TOWN_MAP) -> dict[str, dict]:
    """The town map's route places, by their zone's constant: {zone: place file data}."""
    places = {}
    for path in sorted(town_map.glob("*.json")):
        if path.name.endswith(".schema.json"):
            continue
        data = json.loads(path.read_text())
        if isinstance(data, dict) and data.get("type") == TOWN_MAP_ROUTE_TYPE:
            places[data["zone"]] = data
    return places


def outdoor_zones(zones: Path = ZONES) -> dict[str, list[tuple[int, dict]]]:
    """Every place's outdoor zones (map type 0), by the place's constant: {place: [(zone ID, header)]}, by zone ID."""
    ids = datajson.constants()
    found: dict[str, list[tuple[int, dict]]] = {}
    for path in sorted(zones.glob("*.json")):
        if path.name.endswith(".schema.json"):
            continue
        data = json.loads(path.read_text())
        if data.get("map_type") == 0 and "place" in data:
            zone = "ZONE_" + path.stem.upper()
            if zone not in ids:
                raise datajson.DataError(f"{datajson.label(path)}: {zone} is not in generated/zones.txt")
            found.setdefault(data["place"], []).append((ids[zone], data))
    for entries in found.values():
        entries.sort(key=lambda entry: entry[0])
    return found


def zone_methods(header: dict, areas: Path = AREAS) -> int:
    """The ROAMER_METHOD_* bits of the methods with a step rate in some season in the zone's encounters."""
    encounters = header.get("encounters")
    if not encounters or encounters == "ENCOUNTERS_NONE":
        return 0
    path = areas / (encounters.removeprefix("ENCOUNTERS_").lower() + ".json")
    if not path.exists():
        return 0
    rates = json.loads(path.read_text())["rates"]
    bits = 0
    for season in rates.values():
        for method, keys in METHOD_RATES.items():
            if any(season.get(key, 0) for key in keys):
                bits |= METHODS[method]
    return bits


def graph(directory: Path = SOURCE, zones: Path = ZONES, town_map: Path = TOWN_MAP, areas: Path = AREAS) -> list[dict]:
    """The routes in routes.json's order, each {place, zones, links (indices), methods (bits), position}."""
    path = directory / "routes.json"
    data = datajson.load(path, datajson.load_schema(directory / "routes.schema.json"))
    where = datajson.label(path)
    places = route_places(town_map)
    by_place = outdoor_zones(zones)
    ids = datajson.constants()
    routes = []
    index = {}
    for entry in data["routes"]:
        place = entry["place"]
        if place in index:
            raise datajson.DataError(f"{where}: {place} is listed twice")
        zone_list = by_place.get(place, [])
        if not zone_list:
            raise datajson.DataError(f"{where}: no outdoor zone's header names {place}")
        if len(zone_list) > ROUTE_ZONES:
            raise datajson.DataError(f"{where}: {place} has {len(zone_list)} outdoor zones, more than {ROUTE_ZONES}")
        zone_names = {ids[name]: name for name in ids if name.startswith("ZONE_")}
        town = next((places[zone_names[zone_id]] for zone_id, _ in zone_list if zone_names.get(zone_id) in places),
                    None)
        if town is None:
            raise datajson.DataError(f"{where}: {place} is not a route place of the town map (res/town_map/)")
        methods = 0
        for _, header in zone_list:
            methods |= zone_methods(header, areas)
        index[place] = len(routes)
        routes.append({"place": place, "zones": [zone_id for zone_id, _ in zone_list], "links": set(),
                       "methods": methods, "position": (town["position"]["x"], town["position"]["y"]),
                       "names": [zone_names[zone_id] for zone_id, _ in zone_list]})
    for entry in data["routes"]:
        for link in entry["links"]:
            if link not in index:
                raise datajson.DataError(f"{where}: {entry['place']} links to {link}, which isn't one of its routes")
            if link == entry["place"]:
                raise datajson.DataError(f"{where}: {link} links to itself")
            routes[index[entry["place"]]]["links"].add(index[link])
            routes[index[link]]["links"].add(index[entry["place"]])
    reached = {0}
    pending = [0]
    while pending:
        for link in routes[pending.pop()]["links"]:
            if link not in reached:
                reached.add(link)
                pending.append(link)
    if len(reached) != len(routes):
        lost = [routes[i]["place"] for i in range(len(routes)) if i not in reached]
        raise datajson.DataError(f"{where}: {', '.join(lost)} can't be reached from {routes[0]['place']}")
    return routes


def roamers(directory: Path = SOURCE, routes: list[dict] | None = None) -> tuple[dict, list[dict]]:
    """The settings and the roamers, each {name, species, form, level, group, odds, methods, weather, routes (bits)}."""
    path = directory / "roamers.json"
    data = datajson.load(path, datajson.load_schema(directory / "roamers.schema.json"))
    where = datajson.label(path)
    routes = graph(directory) if routes is None else routes
    by_place = {route["place"]: i for i, route in enumerate(routes)}
    if len(set(data["groups"])) != len(data["groups"]):
        raise datajson.DataError(f"{where}: a group is listed twice")
    if len(data["roamers"]) > SAVE_SLOTS:
        raise datajson.DataError(f"{where}: {len(data['roamers'])} roamers, more than the save's {SAVE_SLOTS}")
    names = set()
    result = []
    for i, entry in enumerate(data["roamers"]):
        at = f"{where}: roamers[{i}] ({entry['name']})"
        if entry["name"] in names:
            raise datajson.DataError(f"{at}: the name is used twice")
        names.add(entry["name"])
        if entry["group"] not in data["groups"]:
            raise datajson.DataError(f"{at}: {entry['group']} is not one of groups")
        if len(set(entry["methods"])) != len(entry["methods"]):
            raise datajson.DataError(f"{at}: a method is listed twice")
        methods = sum(METHODS[method] for method in entry["methods"])
        listed = entry.get("routes", [route["place"] for route in routes])
        bits = 0
        for place in listed:
            if place not in by_place:
                raise datajson.DataError(f"{at}: {place} is not a route of routes.json")
            if routes[by_place[place]]["methods"] & methods:
                bits |= 1 << by_place[place]
        if bin(bits).count("1") < 2:
            raise datajson.DataError(f"{at}: fewer than 2 of its routes have a step rate for its methods")
        result.append({"name": entry["name"], "species": datajson.value(entry["species"], at),
                       "species_name": entry["species"], "form": entry.get("form", 0), "level": entry["level"],
                       "group": data["groups"].index(entry["group"]), "odds": entry["odds"], "methods": methods,
                       "weather": WEATHERS[entry["weather"]], "weather_name": entry["weather"], "routes": bits})
    settings = {"move_seconds": data["move_minutes"] * 60, "offline_moves_max": data["offline_moves_max"],
                "scatter_links": data["scatter_links"], "groups": data["groups"]}
    if len(result) >= len(routes):
        raise datajson.DataError(f"{where}: {len(result)} roamers for {len(routes)} routes leave no room to move")
    return settings, result


def header(directory: Path = SOURCE, zones: Path = ZONES, town_map: Path = TOWN_MAP, areas: Path = AREAS) -> str:
    routes = graph(directory, zones, town_map, areas)
    settings, entries = roamers(directory, routes)
    lines = [f"#ifndef {GUARD}", f"#define {GUARD}", "",
             f"// Generated by tools/paperwhite2/roamers.py from {datajson.label(directory)}, edit that instead. Only",
             "// #defines: the scripts include it too", "",
             f"#define ROAMERS_COUNT {len(entries)}"]
    lines += [f"#define ROAMER_{entry['name'].upper()} {i}" for i, entry in enumerate(entries)]
    lines += ["", f"#define ROAMERS_GROUP_COUNT {len(settings['groups'])}"]
    lines += [f"#define ROAMER_GROUP_{group.upper()} {i}" for i, group in enumerate(settings["groups"])]
    lines += ["", f"#define ROAMERS_ROUTE_COUNT {len(routes)}",
              "// The real-time seconds a roamer stays on a route, the most moves counted at once, and how many links",
              "// away it scatters after a battle it leaves",
              f"#define ROAMERS_MOVE_SECONDS {settings['move_seconds']}",
              f"#define ROAMERS_OFFLINE_MOVES_MAX {settings['offline_moves_max']}",
              f"#define ROAMERS_SCATTER_LINKS {settings['scatter_links']}", "",
              "// Each roamer: species, form, level, group, odds (percent), methods (ROAMER_METHOD_* bits), weather and",
              "// its routes (a bit per ROAMERS_ROUTES entry)",
              "#define ROAMERS_DATA { \\"]
    for entry in entries:
        lines.append(f"    {{ {entry['species']}, {entry['form']}, {entry['level']}, {entry['group']}, {entry['odds']}, "
                     f"{entry['methods']}, {entry['weather']}, 0x{entry['routes']:08x} }}, /* {entry['species_name']}, "
                     f"{entry['weather_name']} */ \\")
    lines += ["}", "",
              "// Each route: its outdoor zones (0xffff for none) and its links (a bit per entry)",
              "#define ROAMERS_ROUTES { \\"]
    for route in routes:
        zone_ids = route["zones"] + [ZONE_NONE] * (ROUTE_ZONES - len(route["zones"]))
        links = sum(1 << link for link in route["links"])
        lines.append(f"    {{ {{ {', '.join(f'0x{z:04x}' for z in zone_ids)} }}, 0x{links:08x} }}, "
                     f"/* {route['place']}: {', '.join(route['names'])} */ \\")
    lines += ["}", "", f"#endif // {GUARD}", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("paths", type=Path, nargs="*")
    parser.add_argument("--check", action="store_true", help="only check the files")
    args = parser.parse_args()
    try:
        if args.check:
            directory = args.paths[0] if args.paths else SOURCE
            header(directory)
            print(f"{datajson.label(directory)} is fine")
            return
        if not args.paths:
            parser.error("give the output header")
        directory, output = (args.paths if len(args.paths) == 2 else [SOURCE, args.paths[0]])
        text = header(directory)
        if not output.exists() or output.read_text() != text:
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(text)
    except datajson.DataError as error:
        sys.exit(f"error: {error}")


if __name__ == "__main__":
    main()
