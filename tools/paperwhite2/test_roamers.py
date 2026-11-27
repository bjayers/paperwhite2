"""Tests of tools/paperwhite2/roamers.py: the real data packs, a small graph of the tests' own packs as it should, and
broken copies of it are refused."""
import json
import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data import datajson  # noqa: E402
from tools.paperwhite2 import roamers  # noqa: E402


def write(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data))


def fixture(tmp_path: Path, links=None, entries=None):
    """Four routes of the tests' own, with the real schemas: Route 1 (grass), Route 2 (water only), Route 3 (grass and
    water, two outdoor zones and a house) and Route 4 (grass). Links 1-2, 2-3 and 3-4 by default, listed on one side."""
    directory = tmp_path / "roamers"
    directory.mkdir()
    for name in ("roamers.schema.json", "routes.schema.json"):
        shutil.copy(roamers.SOURCE / name, directory / name)
    zones, town_map, areas = tmp_path / "zones", tmp_path / "town_map", tmp_path / "areas"
    rates = {1: {"grass": 1}, 2: {"surf": 10}, 3: {"grass": 1, "surf": 10}, 4: {"grass": 2}}
    for number, rate in rates.items():
        write(zones / f"route_{number}.json", {"map_type": 0, "place": f"PLACE_ROUTE_{number}",
                                               "encounters": f"ENCOUNTERS_ROUTE_{number}"})
        write(town_map / f"route_{number}.json", {"zone": f"ZONE_ROUTE_{number}", "type": 1,
                                                  "position": {"x": 10 * number, "y": 20}})
        write(areas / f"route_{number}.json", {"rates": {"all_year": rate}, "spots": "grass"})
    write(zones / "route_3_2.json", {"map_type": 16, "place": "PLACE_ROUTE_3"})
    write(zones / "route_4_16.json", {"map_type": 0, "place": "PLACE_ROUTE_3", "encounters": "ENCOUNTERS_NONE"})
    links = links if links is not None else {1: [2], 2: [3], 3: [4], 4: []}
    write(directory / "routes.json", {"routes": [{"place": f"PLACE_ROUTE_{n}", "links": [f"PLACE_ROUTE_{m}" for m in ls]}
                                                 for n, ls in links.items()]})
    entries = entries if entries is not None else [
        {"name": "walker", "species": "SPECIES_RAIKOU", "level": 70, "group": "beasts", "odds": 50,
         "methods": ["walk"], "weather": "thunderstorm"},
        {"name": "swimmer", "species": "SPECIES_SUICUNE", "level": 70, "group": "beasts", "odds": 25,
         "methods": ["walk", "surf"], "weather": "snow"},
    ]
    write(directory / "roamers.json", {"move_minutes": 15, "offline_moves_max": 4, "scatter_links": 2,
                                       "groups": ["beasts"], "roamers": entries})
    return directory, zones, town_map, areas


def test_real_data_packs():
    text = roamers.header()
    assert "#define ROAMERS_COUNT 8" in text
    assert "#define ROAMER_GROUP_FORCES 2" in text
    routes = roamers.graph()
    places = [route["place"] for route in routes]
    # Route 10 has no town map place in White 2, and every other route is there
    assert "PLACE_ROUTE_10" not in places and len(places) == 22
    settings, entries = roamers.roamers(routes=routes)
    by_name = {entry["name"]: entry for entry in entries}
    water = [places.index("PLACE_ROUTE_17"), places.index("PLACE_ROUTE_21")]
    for name in ("raikou", "entei", "tornadus", "thundurus"):
        assert not any(by_name[name]["routes"] & (1 << i) for i in water)
    for name in ("articuno", "suicune"):
        assert all(by_name[name]["routes"] & (1 << i) for i in water)
    assert settings["move_seconds"] == 900


def test_fixture_graph(tmp_path):
    directory, zones, town_map, areas = fixture(tmp_path)
    routes = roamers.graph(directory, zones, town_map, areas)
    assert [sorted(route["links"]) for route in routes] == [[1], [0, 2], [1, 3], [2]]
    # Route 3's outdoor zones are route_3 and route_4_16 (by its header's place), not the house
    ids = datajson.constants()
    assert routes[2]["zones"] == sorted([ids["ZONE_ROUTE_3"], ids["ZONE_ROUTE_4_16"]])
    settings, entries = roamers.roamers(directory, routes)
    # The walker isn't on Route 2, which is water only; the swimmer is everywhere
    assert entries[0]["routes"] == 0b1101
    assert entries[1]["routes"] == 0b1111
    text = roamers.header(directory, zones, town_map, areas)
    assert "#define ROAMER_WALKER 0" in text and "#define ROAMERS_ROUTE_COUNT 4" in text
    assert "WEATHER_THUNDERSTORM" in text and "WEATHER_FLAKE" in text


@pytest.mark.parametrize("links, message", [
    ({1: [2], 2: [5], 3: [4], 4: []}, "isn't one of its routes"),
    ({1: [2], 2: [], 3: [4], 4: []}, "can't be reached"),
    ({1: [1, 2], 2: [3], 3: [4], 4: []}, "links to itself"),
])
def test_broken_graph(tmp_path, links, message):
    directory, zones, town_map, areas = fixture(tmp_path, links=links)
    with pytest.raises(datajson.DataError, match=message):
        roamers.graph(directory, zones, town_map, areas)


def roamer(**fields):
    entry = {"name": "one", "species": "SPECIES_RAIKOU", "level": 70, "group": "beasts", "odds": 50,
             "methods": ["walk"], "weather": "none"}
    entry.update(fields)
    return entry


@pytest.mark.parametrize("entries, message", [
    ([roamer(group="birds")], "is not one of groups"),
    ([roamer(), roamer()], "used twice"),
    ([roamer(methods=["fish"])], "fewer than 2"),
    ([roamer(routes=["PLACE_ROUTE_9"])], "is not a route"),
    ([roamer(name=f"r{i}") for i in range(4)], "leave no room"),
])
def test_broken_roamers(tmp_path, entries, message):
    directory, zones, town_map, areas = fixture(tmp_path, entries=entries)
    with pytest.raises(datajson.DataError, match=message):
        roamers.header(directory, zones, town_map, areas)


def test_new_weathers():
    # Harsh sun and the dry thunderstorm are field weathers of their own, which include/system/zone_weather.h's enum has
    assert roamers.WEATHERS["harsh_sun"] == "WEATHER_HARSH_SUN"
    assert roamers.WEATHERS["dry_thunderstorm"] == "WEATHER_DRY_THUNDERSTORM"
    enum = (roamers.ROOT / "include/system/zone_weather.h").read_text()
    assert all(f"{name}," in enum for name in roamers.WEATHERS.values() if name != "WEATHER_NONE")
